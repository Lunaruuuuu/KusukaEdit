// ---------------------------------------------------------------------------
// Two-way adapter between KusukaEdit's native document and Polotno's JSON.
//
//   detectFormat()            "kusuka" | "polotno" | "unknown"
//   parseDocument()           string/object -> validated CanvasDocument
//                             (this is what the store's loadFromJSON calls)
//   convertPolotnoToKusuka()  Polotno { pages: [{ children }, ...] }  ->  CanvasDocument
//                             (EVERY page becomes a page of the document)
//   convertKusukaToPolotno()  CanvasDocument  ->  Polotno document (every page written)
//   sanitizeKusukaDocument()  validates a native file, fills defaults,
//                             migrates old schema versions (v1/v2 = one page)
//
// Pure functions only: no DOM, no React, no store. That keeps the adapter
// unit-testable in plain Node.
//
// Field mapping (Polotno -> KusukaEdit):
//   doc.pages[i]                            -> pages[i]  (same order, same count)
//   doc.width/height or page.width/height   -> page.canvas.width / height
//   page.background                         -> page.canvas.backgroundColor
//   page.children[]  (array order)          -> page.elements[]  (zIndex = position + 1)
//   text    text (HTML -> plain, see cleanPolotnoText) -> text.text
//   text    fill (fallback: color)          -> text.fill
//   text    fontWeight + fontStyle          -> text.fontStyle ("bold italic" ...)
//   text    width (+ TEXT_WIDTH_TOLERANCE)  -> text.width + text.widthTolerance
//   text    align (left/center/right/justify) -> text.align
//   text    stroke + strokeWidth, textDecoration, letterSpacing (fraction of
//           fontSize), textTransform (upper/lower) -> the same fields
//   text    custom.listType / custom.autoFit (written by this editor) -> listType / autoFit
//   text    backgroundEnabled + backgroundColor / backgroundOpacity /
//           backgroundCornerRadius / backgroundPadding -> the same fields
//   text    curveEnabled + curvePower       -> the same fields
//   text/image custom.dash (written by this editor) -> dash
//   any     opacity                         -> opacity (absent when 1)
//   any     shadowEnabled + shadowColor / shadowBlur / shadowOffsetX|Y /
//           shadowOpacity                   -> shadow* (text, figure, image and svg)
//   any     blurEnabled + blurRadius, brightnessEnabled + brightness,
//           sepiaEnabled / grayscaleEnabled, filters.contrast / .saturation
//                                           -> blurRadius / brightness / filterPreset /
//                                              contrast / saturation (every type since v5)
//   figure  subType rect | circle           -> shape.shapeType
//   figure  dash (multiples of the stroke)  -> shape.dash (px; see lib/textEffects.ts)
//   image   src, cropX/Y/Width/Height       -> image (src + crop as 0..1 fractions)
//   svg     src (URL or data URI), colorsReplace -> image with vector: true
//   image/svg  flipX, flipY, scaleX, scaleY -> image.scaleX / scaleY (= ±1)
//   image/svg  blurEnabled + blurRadius     -> image.blurRadius
//   image/svg  borderSize + borderColor     -> image.strokeWidth + image.stroke
//   image/svg  clipSrc (circle / triangle)  -> image.maskShape
//   image/svg  cornerRadius                 -> image.cornerRadius
//   image/svg  brightnessEnabled + brightness, sepiaEnabled, grayscaleEnabled,
//              filters.contrast / .saturation -> image.brightness / filterPreset /
//              contrast / saturation (see lib/polotnoEffects.ts)
//
// Coordinates: every element, in both formats, is positioned by the TOP-LEFT
// corner of its bounding box and rotated (clockwise, in degrees) around that
// corner. x, y, width, height and rotation are therefore copied as they are —
// nothing is re-anchored, which is what keeps imported text and pictures
// exactly where they were. (The one historical exception, circles stored by
// their centre in native v1 files, is migrated in sanitizeKusukaDocument.)
// Two deliberate, compensated exceptions keep the VISIBLE position unchanged:
//   - a picture with a negative scaleX/scaleY (Konva-style) is moved to the
//     top-left of what is visible;
//   - a text box widened by the import tolerance moves left by the part that
//     matches its alignment.
//
// Anything that cannot be mapped is never dropped silently: it is counted and
// reported in `warnings`.
// ---------------------------------------------------------------------------

import {
  DEFAULT_CANVAS,
  DEFAULT_FONT_FAMILY,
  LAST_SINGLE_PAGE_SCHEMA,
  SCHEMA_VERSION,
  type CanvasDocument,
  type CanvasElement,
  type CanvasMeta,
  type ImageElement,
  type Page,
  type ShapeElement,
  type TextAlign,
  type TextElement,
  type TextFontStyle,
} from "@/types/editor";
import { newId } from "@/lib/id";
import { isColorSpecified, normalizeColor, parseColor } from "@/lib/color";
import {
  filterEffectsToPolotno,
  hasUnknownFilters,
  imageEffectsToPolotno,
  opacityToPolotno,
  readNativeCommonEffects,
  readNativeImageEffects,
  readPolotnoCommonEffects,
  readPolotnoFilterEffects,
  readPolotnoImageEffects,
  shadowToPolotno,
} from "@/lib/polotnoEffects";
import { dashFromPolotno, dashToPolotno, polotnoDashUnit, sanitizeDash } from "@/lib/textEffects";
import { hasUnknownDecoration, readTextOptions } from "@/lib/textOptions";
import { isObjectUrl } from "@/lib/objectUrls";

// ----------------------------- Polotno types ------------------------------
// Deliberately loose: Polotno files carry dozens of properties we never read
// (filters, animations, ...), so only the shape we depend on is typed.

export interface PolotnoElement {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

export interface PolotnoPage {
  id?: string;
  children?: PolotnoElement[];
  width?: number | "auto";
  height?: number | "auto";
  background?: string;
  bleed?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface PolotnoDocument {
  schemaVersion?: number;
  width?: number;
  height?: number;
  unit?: string;
  dpi?: number;
  fonts?: unknown[];
  pages: PolotnoPage[];
  audios?: unknown[];
  custom?: unknown;
  [key: string]: unknown;
}

// ------------------------------ Public types ------------------------------

export type DocumentFormat = "kusuka" | "polotno" | "unknown";
export type ExportFormat = "kusuka" | "polotno";

export interface ConversionResult {
  document: CanvasDocument;
  /** Human-readable notes about anything that could not be mapped 1:1. */
  warnings: string[];
}

export type ParseResult =
  | { ok: true; format: ExportFormat; document: CanvasDocument; warnings: string[] }
  | { ok: false; error: string };

export type LoadResult =
  | { ok: true; format: ExportFormat; warnings: string[]; pageCount: number }
  | { ok: false; error: string };

// The Polotno schema revision these exports target (see polotno.com/docs/schema/store).
const POLOTNO_SCHEMA_VERSION = 4;
const POLOTNO_DEFAULT_SIZE = 1080;

/**
 * Extra width, in px, given to every text box imported from a Polotno file.
 * Polotno measured the box with ITS font; this browser may draw the same font
 * (or a fallback, when the font is not installed) a few pixels wider, and a
 * word that no longer fits is broken across two lines ("SAL" / "E"). Ten
 * pixels absorbs that difference without visibly changing the layout.
 */
export const TEXT_WIDTH_TOLERANCE = 10;

/**
 * Written to `custom.source` of every text element this editor exports. Its
 * width was measured in this editor, so on re-import it needs no tolerance:
 * adding one every cycle would make the box grow by 10px each time.
 */
export const OWN_EXPORT_SOURCE = "kusukaedit";

/** How far the text must move left so a wider box keeps its text in place. */
function alignFactor(align: TextAlign): number {
  return align === "center" ? 0.5 : align === "right" ? 1 : 0;
}

// ------------------------------- Utilities --------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts numbers and numeric strings (Polotno's lineHeight can be a string). */
function num(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right", "justify"];
const FONT_STYLES: readonly TextFontStyle[] = ["normal", "bold", "italic", "bold italic"];

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}`;
}

/** A `blob:` address is only valid inside the page that created it. */
function blobWarning(count: number): string {
  return `${pluralize(count, "gambar")} memakai URL sementara (blob:) yang sudah tidak berlaku setelah halaman dimuat ulang, sehingga tidak bisa ditampilkan. Unggah ulang gambarnya.`;
}

// ------------------------------ Font handling -----------------------------
// KusukaEdit stores a CSS font stack ("Georgia, serif") so Konva has a
// fallback; Polotno stores just the family name ("Georgia"). The generic
// fallback is derived from a small lookup so our built-in fonts round-trip
// exactly.

const SERIF_FAMILIES = new Set([
  "georgia",
  "times new roman",
  "times",
  "garamond",
  "playfair display",
  "merriweather",
  "lora",
]);
const MONO_FAMILIES = new Set(["courier new", "courier", "roboto mono", "fira code"]);

export function toPolotnoFontFamily(stack: string): string {
  const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return first || "Roboto";
}

export function fromPolotnoFontFamily(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return DEFAULT_FONT_FAMILY;
  if (trimmed.includes(",")) return trimmed; // already a CSS stack
  const key = trimmed.toLowerCase();
  const generic = SERIF_FAMILIES.has(key) ? "serif" : MONO_FAMILIES.has(key) ? "monospace" : "sans-serif";
  const family = /\s/.test(trimmed) ? `'${trimmed}'` : trimmed;
  return `${family}, ${generic}`;
}

// ------------------------------ Image crop --------------------------------
// The visible part of a picture, as fractions (0..1) of its natural size.

interface Crop {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

const FULL_CROP: Crop = { cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 };
const CROP_EPSILON = 1e-6;

/**
 * Reads cropX/Y/Width/Height. Returns null when the numbers cannot be
 * fractions of the picture (negative, zero-sized, or reaching past 1) — for
 * example pixel values from a differently-defined file. Such a crop is NOT
 * guessed at: the caller falls back to the whole picture and warns.
 */
function readCrop(raw: Record<string, unknown>): Crop | null {
  const x = num(raw.cropX, 0);
  const y = num(raw.cropY, 0);
  const w = num(raw.cropWidth, 1);
  const h = num(raw.cropHeight, 1);
  const valid =
    x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 + CROP_EPSILON && y + h <= 1 + CROP_EPSILON;
  if (!valid) return null;
  return {
    cropX: x,
    cropY: y,
    cropWidth: Math.min(w, 1 - x),
    cropHeight: Math.min(h, 1 - y),
  };
}

// ------------------------------ Text cleaning -----------------------------
// Some Polotno files carry rich text as HTML in the text element's `text`: one
// <p> per paragraph, <br> for a line break, <strong>/<em>/<u>/<span style="...">
// for formatting, and HTML entities (&amp;, &nbsp;). (Polotno's schema page
// describes `text` only as "Visible text shown on canvas"; this is handled
// because such files exist.) Konva.Text draws a plain string, so without
// cleaning the tags would be printed on the canvas as text.
//
// Only tags from a fixed list are removed. A placeholder such as "Halo <nama>"
// is ordinary text and is kept exactly as written.

const BLOCK_TAGS = "p|div|h[1-6]|li|ul|ol|blockquote|pre|section|article|header|footer|table|thead|tbody|tr";
const INLINE_TAGS = "span|b|strong|i|em|u|s|strike|del|ins|a|font|sub|sup|mark|small|big|code|abbr|cite|q|time|label";
// Attribute values may contain ">" when quoted (style="a>b"), so quoted strings are matched whole.
const TAG_ATTRS = `(?:\\s(?:"[^"]*"|'[^']*'|[^<>"'])*)?`;
const ANY_TAG_SOURCE = `</?(?:${BLOCK_TAGS}|${INLINE_TAGS}|br)${TAG_ATTRS}/?>`;

const ANY_TAG_RE = new RegExp(ANY_TAG_SOURCE, "gi");
const HAS_TAG_RE = new RegExp(ANY_TAG_SOURCE, "i"); // not global: .test() must not keep state
// A block tag plus the whitespace around it (indentation between tags is not text).
const BLOCK_TAG_RE = new RegExp(`\\s*</?(?:${BLOCK_TAGS})${TAG_ATTRS}/?>\\s*`, "gi");
// Tags that carry per-part styling we cannot keep (a bare <p> or <br> loses nothing).
const STYLING_RE =
  /<(?:b|strong|i|em|u|s|strike|del|ins|font|mark|sub|sup|a|code|small|big)(?:\s|\/?>)|<span\b[^>]*\bstyle\s*=/i;

// A private-use character that cannot occur in real text: marks "a paragraph starts/ends here".
const BOUNDARY = "\uE000";
const BOUNDARY_RUN_RE = new RegExp(`${BOUNDARY}+`, "g");

const NAMED_ENTITIES = new Map<string, string>([
  ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"], ["nbsp", " "],
  ["copy", "©"], ["reg", "®"], ["trade", "™"], ["hellip", "…"], ["mdash", "—"], ["ndash", "–"],
  ["lsquo", "‘"], ["rsquo", "’"], ["ldquo", "“"], ["rdquo", "”"], ["bull", "•"], ["middot", "·"],
  ["euro", "€"], ["laquo", "«"], ["raquo", "»"], ["deg", "°"], ["times", "×"], ["divide", "÷"],
  ["plusmn", "±"], ["cent", "¢"], ["pound", "£"], ["yen", "¥"], ["sect", "§"], ["para", "¶"],
]);

/** One pass, so "&amp;lt;" becomes "&lt;" (not "<"). Unknown entities are left as written. */
function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.charAt(0) === "#") {
      const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const valid = Number.isFinite(code) && code >= 1 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES.get(body.toLowerCase()) ?? match;
  });
}

export interface CleanedText {
  /** Plain text; lines are separated by "\n" only. */
  text: string;
  /** True when per-part styling (bold word, colored span, link ...) was thrown away. */
  styled: boolean;
}

/**
 * Turns the `text` of a Polotno text element into the plain string Konva draws.
 *
 *  - paragraphs (`</p><p>`, also <div>, <h1>…, <li>) become one "\n";
 *    a `<br>` inside a paragraph becomes "\n"; a lone `<p><br></p>` is a blank line
 *  - every other known tag (<p>, <span>, <strong>, ...) is removed, entities are decoded
 *  - "\r\n", "\r" and the Unicode line/paragraph separators become "\n"
 *
 * A string without any HTML tag is a plain string already: only its newlines
 * are normalised, and entities are left alone (a plain "Tom &amp; Jerry" is
 * what the author typed).
 */
export function cleanPolotnoText(raw: string): CleanedText {
  const input = raw.replace(/\r\n?|[\u2028\u2029]/g, "\n");
  if (!HAS_TAG_RE.test(input)) return { text: input, styled: false };

  const withoutNoise = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  const styled = STYLING_RE.test(withoutNoise);

  // Every block tag (with the whitespace around it) becomes a boundary; several
  // in a row are one boundary. Whatever lies between boundaries is one line of
  // text, and a boundary at the very start or end adds nothing.
  const lines = withoutNoise.replace(BLOCK_TAG_RE, BOUNDARY).split(BOUNDARY_RUN_RE);
  if (lines.length > 0 && lines[0] === "") lines.shift();
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const text = lines
    .map((line) =>
      decodeEntities(
        line
          // A <br> that ends a paragraph is not a visible line break in HTML
          // (and `<p><br></p>` becomes the empty line it is meant to be).
          .replace(/<br\s*\/?>\s*$/i, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(ANY_TAG_RE, "")
      ).replace(/\u00a0/g, " ")
    )
    .join("\n");

  return { text, styled };
}

// -------------------------- Mirroring (flip / scale) ----------------------
// Polotno mirrors a picture with flipX / flipY. Its schema says only that the
// element is "mirrored"; it does not say that the box moves, so the box (x, y,
// width, height) is left alone — the picture is mirrored INSIDE it.
//
// Konva-style files can instead carry scaleX / scaleY. A scale is applied
// around the node's origin, so a NEGATIVE scale pushes the picture to the
// left of / above (x, y). To keep it where it was drawn, (x, y) is moved to the
// top-left corner of what is visible, and the flip is stored as scaleX/scaleY
// = -1 (the renderer mirrors the picture inside its box, see ElementRenderer).

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

function rotateVector(dx: number, dy: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
}

interface MirroredBase {
  fields: BaseFields;
  scaleX: 1 | -1;
  scaleY: 1 | -1;
}

function readMirror(child: Record<string, unknown>, fields: BaseFields): MirroredBase {
  const rawX = num(child.scaleX, 1);
  const rawY = num(child.scaleY, 1);
  const sx = rawX === 0 ? 1 : rawX; // a zero scale would make the picture vanish
  const sy = rawY === 0 ? 1 : rawY;
  const negX = sx < 0;
  const negY = sy < 0;

  // The magnitude of a scale is a size multiplier.
  const width = Math.abs(sx) === 1 ? fields.width : round6(fields.width * Math.abs(sx));
  const height = Math.abs(sy) === 1 ? fields.height : round6(fields.height * Math.abs(sy));

  let { x, y } = fields;
  if (negX || negY) {
    // Where the visible top-left corner is, relative to the scale origin (x, y),
    // in the element's own (rotated) frame.
    const shift = rotateVector(negX ? -width : 0, negY ? -height : 0, fields.rotation);
    x = round6(x + shift.x);
    y = round6(y + shift.y);
  }

  // flipX and a negative scaleX both mirror; both together cancel out.
  const flipX = (child.flipX === true) !== negX;
  const flipY = (child.flipY === true) !== negY;
  return {
    fields: { ...fields, x, y, width, height },
    scaleX: flipX ? -1 : 1,
    scaleY: flipY ? -1 : 1,
  };
}

/** Text and shapes cannot be mirrored/scaled: true when the file asks for it anyway. */
function hasIgnoredTransform(child: Record<string, unknown>): boolean {
  const scaled = num(child.scaleX, 1) !== 1 || num(child.scaleY, 1) !== 1;
  // A mirrored rectangle or circle looks the same; mirrored text would not.
  const mirroredText = child.type === "text" && (child.flipX === true || child.flipY === true);
  return scaled || mirroredText;
}

// ------------------------------ SVG recolouring ---------------------------
// Polotno's `colorsReplace` maps colours found in an SVG to replacement
// colours. It can only be applied when the SVG's own text is at hand, i.e. a
// `data:image/svg+xml` URI; for an https link the file is not ours to read.

const DATA_URI_RE = /^data:([^,;]*)((?:;[^,;]*)*),([\s\S]*)$/i;
// Replacement colours end up inside an SVG attribute: allow colour syntax only.
const SAFE_COLOR_RE = /^[#a-z0-9(),.%\s-]{1,40}$/i;

function decodeSvgDataUri(src: string): string | null {
  const match = DATA_URI_RE.exec(src);
  if (!match || match[1].toLowerCase() !== "image/svg+xml") return null;
  const body = match[3];
  try {
    if (/;base64/i.test(match[2])) {
      if (typeof atob !== "function") return null;
      const binary = atob(body.replace(/\s/g, ""));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    }
  } catch {
    return null;
  }
  try {
    return decodeURIComponent(body);
  } catch {
    return body; // not percent-encoded after all (a raw "<svg ...>" with a stray %)
  }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Applies `colorsReplace` to an SVG data URI. Returns the new URI, or null when
 * it could not be applied (not a data URI, undecodable, or no listed colour
 * occurs in it) — the caller then keeps the original and warns.
 */
function replaceSvgColors(src: string, map: Record<string, unknown>): string | null {
  const svg = decodeSvgDataUri(src);
  if (svg === null) return null;

  const lookup = new Map<string, string>();
  for (const [from, to] of Object.entries(map)) {
    if (typeof to === "string" && from.trim() !== "" && SAFE_COLOR_RE.test(to)) {
      lookup.set(from.trim().toLowerCase(), to.trim());
    }
  }
  if (lookup.size === 0) return null;

  // One pass over the text (not one per colour), so A->B followed by B->C
  // cannot chain. "#fff" must not match the start of "#ffffff".
  const pattern = Array.from(lookup.keys())
    .map((key) => escapeRegExp(key) + (key.startsWith("#") ? "(?![0-9a-f])" : ""))
    .join("|");
  let replaced = 0;
  const result = svg.replace(new RegExp(pattern, "gi"), (match) => {
    replaced++;
    return lookup.get(match.toLowerCase()) ?? match;
  });
  if (replaced === 0) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result)}`;
}

function isBoldWeight(weight: unknown): boolean {
  if (weight === "bold") return true;
  const n = Number(weight);
  return Number.isFinite(n) && n >= 600;
}

function composeFontStyle(bold: boolean, italic: boolean): TextFontStyle {
  if (bold && italic) return "bold italic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

// ------------------------------ Detection ---------------------------------

/** A page of a NATIVE v3 file: `canvas` / `elements`, and no Polotno `children`. */
function isNativePage(page: unknown): boolean {
  return (
    isRecord(page) &&
    !Array.isArray(page.children) &&
    (Array.isArray(page.elements) || isRecord(page.canvas))
  );
}

/**
 * Which format a parsed JSON value is in.
 *   native v1 / v2   `canvas` + `elements` at the top level (one page)
 *   native v3        `version` + `pages: [{ canvas, elements }]`
 *   Polotno          `pages: [{ children }]` (usually with `schemaVersion`)
 * Both v3 and Polotno have a `pages` array, so the pages themselves decide:
 * a page with `children` (or a document with `schemaVersion`) is Polotno's.
 */
export function detectFormat(data: unknown): DocumentFormat {
  if (!isRecord(data)) return "unknown";
  if (Array.isArray(data.pages)) {
    const pages = data.pages as unknown[];
    const polotnoPage = pages.some((page) => isRecord(page) && Array.isArray(page.children));
    if (typeof data.schemaVersion === "number" || polotnoPage) return "polotno";
    if (pages.some(isNativePage) || (typeof data.version === "number" && pages.length === 0)) return "kusuka";
    return "polotno"; // e.g. { pages: [{}] }: the shape Polotno documents have
  }
  if (isRecord(data.canvas) && Array.isArray(data.elements)) return "kusuka";
  return "unknown";
}

// ---------------------- Native file: validate + migrate -------------------

interface BaseFields {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

function readBase(raw: Record<string, unknown>, index: number, usedIds: Set<string>): BaseFields {
  let id = typeof raw.id === "string" ? raw.id : "";
  if (id === "" || usedIds.has(id)) id = newId();
  usedIds.add(id);
  return {
    id,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: Math.max(0, num(raw.width, 100)),
    height: Math.max(0, num(raw.height, 100)),
    rotation: num(raw.rotation, 0),
    zIndex: num(raw.zIndex, index + 1),
  };
}

/**
 * v1 stored circles by their centre and drew them with diameter = height.
 * v2 stores every element by its top-left corner. This moves the origin so
 * the circle is drawn at exactly the same place (rotation included).
 */
function migrateV1Circle(base: BaseFields): BaseFields {
  const d = base.height;
  const half = d / 2;
  const rad = (base.rotation * Math.PI) / 180;
  return {
    ...base,
    width: d,
    height: d,
    x: base.x - (half * Math.cos(rad) - half * Math.sin(rad)),
    y: base.y - (half * Math.sin(rad) + half * Math.cos(rad)),
  };
}

/** Counters for what a native file needed fixing (turned into warnings once, for the whole document). */
interface NativeTally {
  skipped: number;
  migratedCircles: number;
  deadBlobImages: number;
  badCrops: number;
  skippedPages: number;
}

/** v1 stored circles by their centre; from v2 on every element is stored by its top-left corner. */
const CENTRE_CIRCLE_LAST_SCHEMA = 1;

function sanitizeNativePage(
  rawCanvas: unknown,
  rawElements: unknown,
  pageId: unknown,
  version: number,
  usedIds: Set<string>,
  usedPageIds: Set<string>,
  t: NativeTally
): Page {
  const canvasRaw = isRecord(rawCanvas) ? rawCanvas : {};
  const canvas: CanvasMeta = {
    width: Math.max(1, num(canvasRaw.width, DEFAULT_CANVAS.width)),
    height: Math.max(1, num(canvasRaw.height, DEFAULT_CANVAS.height)),
    backgroundColor: normalizeColor(canvasRaw.backgroundColor, DEFAULT_CANVAS.backgroundColor),
  };

  let id = typeof pageId === "string" ? pageId : "";
  if (id === "" || usedPageIds.has(id)) id = newId();
  usedPageIds.add(id);

  const elements: CanvasElement[] = [];
  (Array.isArray(rawElements) ? rawElements : []).forEach((item, index) => {
    if (!isRecord(item)) {
      t.skipped++;
      return;
    }

    if (item.type === "text") {
      const el: TextElement = {
        ...readBase(item, index, usedIds),
        type: "text",
        text: str(item.text, ""),
        fontSize: Math.max(1, num(item.fontSize, 16)),
        fontFamily: str(item.fontFamily, "") || DEFAULT_FONT_FAMILY,
        fill: normalizeColor(item.fill, "#111111"),
        align: TEXT_ALIGNS.includes(item.align as TextAlign) ? (item.align as TextAlign) : "left",
        fontStyle: FONT_STYLES.includes(item.fontStyle as TextFontStyle)
          ? (item.fontStyle as TextFontStyle)
          : "normal",
        // Files written before lineHeight existed were drawn with Konva's default of 1.
        lineHeight: Math.max(0.1, num(item.lineHeight, 1)),
        ...(num(item.widthTolerance, 0) > 0
          ? { widthTolerance: Math.min(100, num(item.widthTolerance, 0)) }
          : {}),
        ...readTextOptions(item, "native"),
        ...readNativeCommonEffects(item),
      };
      elements.push(el);
      return;
    }

    if (item.type === "shape" && (item.shapeType === "rect" || item.shapeType === "circle")) {
      let base = readBase(item, index, usedIds);
      if (item.shapeType === "circle" && version < CENTRE_CIRCLE_LAST_SCHEMA + 1) {
        base = migrateV1Circle(base);
        t.migratedCircles++;
      }
      const el: ShapeElement = {
        ...base,
        type: "shape",
        shapeType: item.shapeType,
        fill: normalizeColor(item.fill, "#6366f1"),
        stroke: normalizeColor(item.stroke, "#312e81"),
        strokeWidth: Math.max(0, num(item.strokeWidth, 0)),
        // v1 always drew rectangles with a 4px radius.
        cornerRadius: item.shapeType === "rect" ? Math.max(0, num(item.cornerRadius, 4)) : 0,
        ...readNativeCommonEffects(item),
      };
      elements.push(el);
      return;
    }

    if (item.type === "image" && typeof item.src === "string" && item.src !== "") {
      // Files written before images could be drawn have no crop: whole picture.
      const crop = readCrop(item) ?? (t.badCrops++, FULL_CROP);
      if (isObjectUrl(item.src)) t.deadBlobImages++;
      const el: ImageElement = {
        ...readBase(item, index, usedIds),
        type: "image",
        src: item.src,
        ...crop,
        // Files written before v5 cannot be mirrored: they are not flipped.
        scaleX: item.scaleX === -1 ? -1 : 1,
        scaleY: item.scaleY === -1 ? -1 : 1,
        ...(item.vector === true ? { vector: true } : {}),
        // Optional effects: only the valid ones are kept.
        ...readNativeImageEffects(item),
      };
      elements.push(el);
      return;
    }

    t.skipped++;
  });

  return { id, canvas, elements };
}

export function sanitizeKusukaDocument(
  raw: Record<string, unknown>
): ConversionResult | { error: string } {
  const version = num(raw.version, 1);
  if (version > SCHEMA_VERSION) {
    return {
      error: `File memakai skema v${version}, sedangkan editor ini hanya mendukung sampai v${SCHEMA_VERSION}.`,
    };
  }

  const warnings: string[] = [];
  const t: NativeTally = { skipped: 0, migratedCircles: 0, deadBlobImages: 0, badCrops: 0, skippedPages: 0 };
  // Element ids and page ids are unique across the WHOLE document.
  const usedIds = new Set<string>();
  const usedPageIds = new Set<string>();
  const pages: Page[] = [];

  if (version <= LAST_SINGLE_PAGE_SCHEMA || !Array.isArray(raw.pages)) {
    // v1 / v2 (or a file without `pages`): the whole document is ONE page.
    pages.push(sanitizeNativePage(raw.canvas, raw.elements, undefined, version, usedIds, usedPageIds, t));
  } else {
    for (const item of raw.pages) {
      if (!isRecord(item)) {
        t.skippedPages++;
        continue;
      }
      pages.push(sanitizeNativePage(item.canvas, item.elements, item.id, version, usedIds, usedPageIds, t));
    }
    if (pages.length === 0) {
      pages.push(sanitizeNativePage(undefined, undefined, undefined, version, usedIds, usedPageIds, t));
      warnings.push("File tidak berisi halaman yang valid; dibuat satu halaman kosong.");
    }
  }

  if (t.skippedPages > 0) {
    warnings.push(`${pluralize(t.skippedPages, "halaman")} tidak valid dan dilewati.`);
  }
  if (t.skipped > 0) {
    warnings.push(`${pluralize(t.skipped, "elemen")} tidak valid atau bertipe tidak dikenal dan dilewati.`);
  }
  if (t.deadBlobImages > 0) {
    warnings.push(blobWarning(t.deadBlobImages));
  }
  if (t.badCrops > 0) {
    warnings.push(`${pluralize(t.badCrops, "gambar")} punya nilai crop yang tidak valid; seluruh gambar ditampilkan.`);
  }
  if (t.migratedCircles > 0) {
    warnings.push(
      `File memakai skema v${version}: posisi ${pluralize(t.migratedCircles, "lingkaran")} dimigrasi ke v${CENTRE_CIRCLE_LAST_SCHEMA + 1}.`
    );
  }

  return { document: { version: SCHEMA_VERSION, pages }, warnings };
}

// ------------------------- Polotno -> KusukaEdit --------------------------

/**
 * True for the few Polotno effects that still have no counterpart here. Since
 * v5 opacity, shadow, blur, brightness, sepia, grayscale, contrast,
 * saturation, dash, the text background and curved text are carried over on
 * every element type, so what is left is rare: a decoration other than
 * underline / line-through ("overline"), a case other than upper / lower
 * ("capitalize"), and a picture mask made from another picture (maskSrc).
 * Unknown entries of `filters` are counted on their own (see unknownFilters).
 */
function hasUnsupportedEffects(child: Record<string, unknown>): boolean {
  const isPicture = child.type === "image" || child.type === "svg";
  if (child.type === "text") {
    // Supported: stroke + strokeWidth, letterSpacing, underline / line-through,
    // upper / lower case (see lib/textOptions.ts). Not: other decorations
    // ("overline") and other cases ("capitalize").
    if (hasUnknownDecoration(child.textDecoration)) return true;
    if (
      typeof child.textTransform === "string" &&
      !["none", "", "uppercase", "lowercase"].includes(child.textTransform)
    ) {
      return true;
    }
  }
  if (isPicture) {
    // An unrecognised clipSrc is counted on its own (see `unknownMasks`).
    if (typeof child.maskSrc === "string" && child.maskSrc !== "") return true;
  }
  return false;
}

/** The dash this editor wrote into `custom` for a text or a picture (Polotno has none there). */
function customDash(child: Record<string, unknown>): { dash?: number[] } {
  const dash = isRecord(child.custom) ? sanitizeDash(child.custom.dash) : null;
  return dash ? { dash } : {};
}

export interface ConvertOptions {
  /**
   * Import only this one page (0-based) of the Polotno document. Left out, EVERY
   * page is imported, in order, as one page of the result.
   */
  pageIndex?: number;
}

/** Everything a Polotno import could not map 1:1, summed over all pages (reported once). */
interface PolotnoTally {
  skippedByType: Map<string, number>;
  effectCount: number;
  badColors: number;
  badCrops: number;
  deadBlobImages: number;
  styledTexts: number;
  ignoredTransforms: number;
  unappliedSvgColors: number;
  unknownMasks: number;
  unknownFilters: number;
  presetConflicts: number;
  badBackgrounds: number;
}

function newPolotnoTally(): PolotnoTally {
  return {
    skippedByType: new Map(),
    effectCount: 0,
    badColors: 0,
    badCrops: 0,
    deadBlobImages: 0,
    styledTexts: 0,
    ignoredTransforms: 0,
    unappliedSvgColors: 0,
    unknownMasks: 0,
    unknownFilters: 0,
    presetConflicts: 0,
    badBackgrounds: 0,
  };
}

/**
 * One Polotno page -> one native page. `usedIds` / `usedPageIds` are shared by
 * all pages of the document, so an element id (and a page id) is unique across
 * the whole result even when the file reuses ids on different pages.
 */
function convertPolotnoPage(
  page: PolotnoPage | undefined,
  docWidth: number,
  docHeight: number,
  usedIds: Set<string>,
  usedPageIds: Set<string>,
  t: PolotnoTally
): Page {
  const canvas: CanvasMeta = {
    // A page may carry its own size; "auto" means "use the document size".
    width: Math.max(1, num(page?.width, docWidth)),
    height: Math.max(1, num(page?.height, docHeight)),
    backgroundColor: "#ffffff",
  };

  if (page?.background !== undefined) {
    const parsed = parseColor(page.background);
    if (parsed === null) t.badBackgrounds++;
    else canvas.backgroundColor = parsed;
  }

  let id = typeof page?.id === "string" ? page.id : "";
  if (id === "" || usedPageIds.has(id)) id = newId();
  usedPageIds.add(id);

  const elements: CanvasElement[] = [];

  const skip = (label: string, count = 1) =>
    t.skippedByType.set(label, (t.skippedByType.get(label) ?? 0) + count);

  // A color the file specifies but we cannot read (gradient, pattern, an
  // unknown name) falls back to `fallback` — and is counted so the user is told.
  const color = (value: unknown, fallback: string): string => {
    const parsed = parseColor(value);
    if (parsed !== null) return parsed;
    if (isColorSpecified(value)) t.badColors++;
    return fallback;
  };

  // Text color: `fill` wins; a readable `color` is used when `fill` is missing
  // or unreadable; only when neither is usable (and one was given) it counts
  // as an unsupported color and the text falls back to black.
  const textFill = (child: Record<string, unknown>): string => {
    const fill = parseColor(child.fill);
    if (fill !== null) return fill;
    const alternative = parseColor(child.color);
    if (alternative !== null) return alternative;
    if (isColorSpecified(child.fill) || isColorSpecified(child.color)) t.badColors++;
    return "#000000";
  };

  // Same as `color`, for readers that want null (not a fallback) for "unusable".
  const optionalColor = (value: unknown): string | null => {
    const parsed = parseColor(value);
    if (parsed === null && isColorSpecified(value)) t.badColors++;
    return parsed;
  };

  // Blur and colour filter of a text or a figure (pictures read theirs with the
  // rest of their effects). Unknown `filters` entries are counted.
  const filterFields = (child: Record<string, unknown>) => {
    const read = readPolotnoFilterEffects(child);
    if (read.unknownFilter) t.unknownFilters++;
    if (read.presetConflict) t.presetConflicts++;
    return read.fields;
  };

  const children = Array.isArray(page?.children) ? page.children : [];
  children.forEach((child) => {
    if (!isRecord(child)) return;
    // A hidden element is not visible in Polotno either, so leaving it out
    // keeps the picture identical.
    if (child.visible === false) return;

    // Polotno draws children in array order (first = bottom).
    const zIndex = elements.length + 1;
    const base = (): BaseFields => ({ ...readBase(child, zIndex - 1, usedIds), zIndex });

    if (child.type === "text") {
      const fontSize = Math.max(1, num(child.fontSize, 14));
      const lineHeight = Math.max(0.1, num(child.lineHeight, 1.2));
      const fields = base();
      const align: TextAlign = TEXT_ALIGNS.includes(child.align as TextAlign)
        ? (child.align as TextAlign)
        : "center"; // Polotno's default alignment

      // Rich text arrives as HTML; Konva needs the plain string.
      const cleaned = cleanPolotnoText(str(child.text, ""));
      if (cleaned.styled) t.styledTexts++;

      // Width tolerance (see TEXT_WIDTH_TOLERANCE). The box grows to the right,
      // so for centred / right-aligned text the left edge moves back by the
      // matching part, along the element's own (rotated) x axis: the text
      // itself stays exactly where Polotno put it.
      const ownExport = isRecord(child.custom) && child.custom.source === OWN_EXPORT_SOURCE;
      const pad = !ownExport && fields.width > 0 ? TEXT_WIDTH_TOLERANCE : 0;
      const shift = rotateVector(-alignFactor(align) * pad, 0, fields.rotation);

      const el: TextElement = {
        ...fields,
        x: pad > 0 ? round6(fields.x + shift.x) : fields.x,
        y: pad > 0 ? round6(fields.y + shift.y) : fields.y,
        width: fields.width + pad,
        // Polotno text height is auto-computed and may be 0 in the file.
        height: num(child.height, 0) > 0 ? fields.height : fontSize * lineHeight,
        type: "text",
        text: cleaned.text,
        fontSize,
        fontFamily: fromPolotnoFontFamily(str(child.fontFamily, "Roboto")),
        // Polotno's text color property is `fill` (its schema has no `color`);
        // `color` is accepted as a fallback for files from other sources.
        fill: textFill(child),
        align,
        fontStyle: composeFontStyle(isBoldWeight(child.fontWeight), child.fontStyle === "italic"),
        lineHeight,
        ...(pad > 0 ? { widthTolerance: pad } : {}),
        ...readTextOptions(child, "polotno", optionalColor),
        ...readPolotnoCommonEffects(child, color),
        ...filterFields(child),
        ...customDash(child),
      };
      if (hasUnsupportedEffects(child)) t.effectCount++;
      if (hasIgnoredTransform(child)) t.ignoredTransforms++;
      elements.push(el);
      return;
    }

    if (child.type === "figure") {
      const subType = str(child.subType, "rect");
      if (subType !== "rect" && subType !== "circle" && subType !== "ellipse") {
        skip(`bentuk "${subType}"`);
        return;
      }
      const shapeType = subType === "rect" ? "rect" : "circle";
      const fields = base();
      const strokeWidth = Math.max(0, num(child.strokeWidth, 0));
      // Polotno's figure dash is in multiples of the stroke it draws (see lib/textEffects.ts).
      const dash = dashFromPolotno(child.dash, polotnoDashUnit(strokeWidth, fields.width, fields.height));
      const el: ShapeElement = {
        ...fields,
        type: "shape",
        shapeType,
        // Polotno's defaults for a figure: rgb(0, 161, 255) fill, rgba(98, 197, 255, 1) stroke.
        fill: color(child.fill, "#00a1ff"),
        stroke: color(child.stroke, "#62c5ff"),
        strokeWidth,
        cornerRadius: shapeType === "rect" ? Math.max(0, num(child.cornerRadius, 0)) : 0,
        ...readPolotnoCommonEffects(child, color),
        ...filterFields(child),
        ...(dash ? { dash } : {}),
      };
      if (hasUnsupportedEffects(child)) t.effectCount++;
      if (hasIgnoredTransform(child)) t.ignoredTransforms++;
      elements.push(el);
      return;
    }

    // A vector picture (an icon, an arrow ...) is an `svg` element whose `src`
    // is an SVG URL or data URI. It is drawn exactly like an image, so both map
    // to ImageElement; `vector` remembers which one it was for the way back.
    if (child.type === "image" || child.type === "svg") {
      const vector = child.type === "svg";
      if (typeof child.src !== "string" || child.src === "") {
        skip(vector ? "SVG tanpa sumber (src)" : "gambar tanpa sumber (src)");
        return;
      }
      // Crop values are fractions of the picture. Anything that cannot be a
      // fraction is not guessed at: the whole picture is shown instead.
      const crop = readCrop(child) ?? (t.badCrops++, FULL_CROP);

      let src = child.src;
      if (vector && isRecord(child.colorsReplace) && Object.keys(child.colorsReplace).length > 0) {
        const recoloured = replaceSvgColors(src, child.colorsReplace);
        if (recoloured === null) t.unappliedSvgColors++;
        else src = recoloured;
      }
      if (isObjectUrl(src)) t.deadBlobImages++;

      // flipX / flipY / scaleX / scaleY -> scaleX / scaleY = ±1, with (x, y)
      // moved where a negative scale would have pushed the picture.
      const mirrored = readMirror(child, base());
      // Blur, border, shadow and circle/triangle mask are carried over; only a
      // mask of another shape is left out (and reported below).
      const effects = readPolotnoImageEffects(child, color);
      if (effects.unknownMask) t.unknownMasks++;
      if (effects.unknownFilter) t.unknownFilters++;
      if (effects.presetConflict) t.presetConflicts++;
      const el: ImageElement = {
        ...mirrored.fields,
        type: "image",
        src,
        ...crop,
        scaleX: mirrored.scaleX,
        scaleY: mirrored.scaleY,
        ...(vector ? { vector: true } : {}),
        ...effects.fields,
        ...customDash(child),
      };
      if (hasUnsupportedEffects(child)) t.effectCount++;
      elements.push(el);
      return;
    }

    if (child.type === "group") {
      // A group nests its own children. They are not flattened: how their
      // coordinates relate to the group is not something to guess — a wrong
      // guess would move every element inside it. Reported with the number
      // of elements that are lost, so the loss is visible.
      const inside = Array.isArray(child.children) ? child.children.length : 0;
      skip(`grup (berisi ${inside} elemen; pisahkan grup di Polotno sebelum mengekspor)`);
      return;
    }

    skip(`tipe "${str(child.type, "?")}"`);
  });


  return { id, canvas, elements };
}

export function convertPolotnoToKusuka(
  doc: PolotnoDocument,
  options: ConvertOptions = {}
): ConversionResult {
  const warnings: string[] = [];
  const allPages = Array.isArray(doc.pages) ? doc.pages : [];
  const t = newPolotnoTally();

  // Every page, unless the caller asked for one.
  const wanted: Array<PolotnoPage | undefined> =
    options.pageIndex === undefined ? allPages : [allPages[options.pageIndex]];

  const docWidth = num(doc.width, POLOTNO_DEFAULT_SIZE);
  const docHeight = num(doc.height, POLOTNO_DEFAULT_SIZE);

  const usedIds = new Set<string>();
  const usedPageIds = new Set<string>();
  const pages: Page[] = [];
  for (const page of wanted) {
    pages.push(convertPolotnoPage(isRecord(page) ? (page as PolotnoPage) : undefined, docWidth, docHeight, usedIds, usedPageIds, t));
  }
  if (pages.length === 0) {
    // A document always has a page.
    pages.push(convertPolotnoPage(undefined, docWidth, docHeight, usedIds, usedPageIds, t));
    warnings.push("Dokumen Polotno tidak berisi halaman; dibuat satu halaman kosong.");
  }

  t.skippedByType.forEach((count, label) => {
    warnings.push(`${pluralize(count, "elemen")} ${label} belum didukung dan dilewati.`);
  });
  if (t.badBackgrounds > 0) {
    warnings.push(
      `${pluralize(t.badBackgrounds, "halaman")} memakai latar gambar/gradien (belum didukung); dipakai warna putih.`
    );
  }
  if (t.deadBlobImages > 0) {
    warnings.push(blobWarning(t.deadBlobImages));
  }
  if (t.badCrops > 0) {
    warnings.push(`${pluralize(t.badCrops, "gambar")} punya nilai crop yang tidak valid; seluruh gambar ditampilkan.`);
  }
  if (t.badColors > 0) {
    warnings.push(
      `${pluralize(t.badColors, "warna")} (gradien, pola, atau nama warna yang tidak dikenal) tidak didukung; dipakai warna bawaan.`
    );
  }
  if (t.styledTexts > 0) {
    warnings.push(
      `${pluralize(t.styledTexts, "teks")} berformat per bagian (kata tebal, warna berbeda, tautan) diubah menjadi teks polos; gaya per bagian tidak dibawa.`
    );
  }
  if (t.unappliedSvgColors > 0) {
    warnings.push(
      `${pluralize(t.unappliedSvgColors, "SVG")} memakai penggantian warna (colorsReplace) yang tidak bisa diterapkan (sumbernya bukan data URI SVG, atau warnanya tidak ditemukan); warna aslinya dipakai.`
    );
  }
  if (t.ignoredTransforms > 0) {
    warnings.push(
      `${pluralize(t.ignoredTransforms, "teks atau bentuk")} memakai skala atau pencerminan (scaleX/scaleY/flip) yang belum didukung; diabaikan.`
    );
  }
  if (t.unknownMasks > 0) {
    warnings.push(
      `${pluralize(t.unknownMasks, "gambar")} memakai mask (clipSrc) selain lingkaran atau segitiga, atau yang bentuknya tidak bisa dikenali dari berkasnya; mask diabaikan dan gambar tampil persegi.`
    );
  }
  if (t.unknownFilters > 0) {
    warnings.push(
      `${pluralize(t.unknownFilters, "elemen")} memakai filter (objek filters) selain kontras dan saturasi; filter itu diabaikan.`
    );
  }
  if (t.presetConflicts > 0) {
    warnings.push(
      `${pluralize(t.presetConflicts, "elemen")} mengaktifkan grayscale dan sepia sekaligus; hanya grayscale yang dipakai.`
    );
  }
  if (t.effectCount > 0) {
    warnings.push(
      `${pluralize(t.effectCount, "elemen")} memakai efek yang belum didukung (garis atas/overline, huruf kapital di awal kata/capitalize, atau mask dari gambar/maskSrc); tampilan bisa sedikit berbeda.`
    );
  }

  return { document: { version: SCHEMA_VERSION, pages }, warnings };
}

// ------------------------- KusukaEdit -> Polotno --------------------------

function polotnoCommon(el: CanvasElement): PolotnoElement {
  return {
    id: el.id,
    type: el.type,
    name: "",
    opacity: opacityToPolotno(el),
    visible: true,
    selectable: true,
    removable: true,
    alwaysOnTop: false,
    showInExport: true,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
  };
}

/** `custom` of an exported text: our source marker, list type, auto-fit and dash (only what applies). */
function textCustom(el: TextElement, padded: boolean): Record<string, unknown> {
  const dash = sanitizeDash(el.dash);
  return {
    ...(padded ? {} : { source: OWN_EXPORT_SOURCE }),
    ...(el.listType ? { listType: el.listType } : {}),
    ...(el.autoFit ? { autoFit: true } : {}),
    ...(dash ? { dash } : {}),
  };
}

/**
 * Merges the `custom` objects several writers produced (text options, a filter
 * preset Polotno has no flag for, a dash) into one; none = no `custom` at all.
 */
function withCustom(out: Record<string, unknown>, ...parts: Array<Record<string, unknown> | undefined>): PolotnoElement {
  const custom: Record<string, unknown> = {};
  for (const part of parts) if (part) Object.assign(custom, part);
  const { custom: _drop, ...rest } = out;
  return (Object.keys(custom).length > 0 ? { ...rest, custom } : rest) as PolotnoElement;
}

const customOf = (rec: Record<string, unknown>): Record<string, unknown> | undefined =>
  isRecord(rec.custom) ? rec.custom : undefined;

/** The text background and curve, written only when on (Polotno's defaults: off). */
function textEffectsToPolotno(el: TextElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (el.backgroundEnabled) {
    out.backgroundEnabled = true;
    out.backgroundColor = el.backgroundColor ?? "#7ED321";
    out.backgroundOpacity = el.backgroundOpacity ?? 1;
    out.backgroundCornerRadius = el.backgroundCornerRadius ?? 0.5;
    out.backgroundPadding = el.backgroundPadding ?? 0.5;
  }
  if (el.curveEnabled) {
    out.curveEnabled = true;
    out.curvePower = el.curvePower ?? 0.5;
  }
  return out;
}

function toPolotnoElement(el: CanvasElement): PolotnoElement {
  if (el.type === "text") {
    // Undo the import tolerance: Polotno gets back the box it came with.
    const pad = el.widthTolerance !== undefined && el.widthTolerance > 0 ? el.widthTolerance : 0;
    const shift = rotateVector(-alignFactor(el.align) * pad, 0, el.rotation);
    // No source marker from here: textCustom decides it (it depends on the width tolerance).
    const filters = filterEffectsToPolotno(el);
    const out: Record<string, unknown> = {
      ...polotnoCommon(el),
      ...(pad > 0
        ? {
            x: round6(el.x - shift.x),
            y: round6(el.y - shift.y),
            width: Math.max(1, round6(el.width - pad)),
          }
        : {}),
      text: el.text,
      placeholder: "",
      fontSize: el.fontSize,
      fontFamily: toPolotnoFontFamily(el.fontFamily),
      fontStyle: el.fontStyle.includes("italic") ? "italic" : "normal",
      fontWeight: el.fontStyle.includes("bold") ? "bold" : "normal",
      textDecoration: el.textDecoration ?? "",
      fill: el.fill,
      align: el.align,
      verticalAlign: "top",
      lineHeight: el.lineHeight,
      letterSpacing: el.letterSpacing ?? 0,
      ...(el.textTransform ? { textTransform: el.textTransform } : {}),
      ...(el.stroke && el.strokeWidth && el.strokeWidth > 0
        ? { stroke: el.stroke, strokeWidth: el.strokeWidth }
        : { strokeWidth: 0 }),
      ...shadowToPolotno(el),
      ...filters,
      ...textEffectsToPolotno(el),
    };
    // Only a width measured here (no tolerance) is marked as such, so it is
    // not padded a second time when this file is imported again. List,
    // auto-fit and dash have no Polotno field: they ride along in `custom`.
    return withCustom(out, customOf(filters), textCustom(el, pad > 0));
  }
  if (el.type === "shape") {
    const filters = filterEffectsToPolotno(el, OWN_EXPORT_SOURCE);
    return withCustom(
      {
        ...polotnoCommon(el),
        type: "figure",
        subType: el.shapeType,
        fill: el.fill,
        stroke: el.stroke,
        strokeWidth: el.strokeWidth,
        cornerRadius: el.cornerRadius,
        dash: dashToPolotno(el.dash, polotnoDashUnit(el.strokeWidth, el.width, el.height)),
        ...shadowToPolotno(el),
        ...filters,
      },
      customOf(filters)
    );
  }
  // The box (x, y, width, height) is written as it is: Polotno's flipX/flipY
  // mirror the picture inside it, which is also what scaleX/scaleY = -1 mean here.
  const effects = imageEffectsToPolotno(el, OWN_EXPORT_SOURCE);
  const dash = sanitizeDash(el.dash);
  const picture: Record<string, unknown> = {
    ...polotnoCommon(el),
    type: el.vector ? "svg" : "image",
    src: el.src,
    // Crop is written as 0..1 fractions of the picture, same as it is read.
    cropX: el.cropX,
    cropY: el.cropY,
    cropWidth: el.cropWidth,
    cropHeight: el.cropHeight,
    cornerRadius: 0,
    flipX: el.scaleX === -1,
    flipY: el.scaleY === -1,
    // blur / border / shadow / mask / corner radius / colour filter: only the
    // ones that are on are written (a corner radius replaces the 0 above).
    ...effects,
  };
  // Polotno's pictures have no dash: it rides along in `custom` (with the source marker).
  return withCustom(picture, customOf(effects), dash ? { source: OWN_EXPORT_SOURCE, dash } : undefined);
}

function toPolotnoPage(page: Page, doc: { width: number; height: number }): PolotnoPage {
  // Polotno has no zIndex: stacking order IS the array order, so sort
  // (stable, ties keep their current order) and write children bottom-first.
  const ordered = page.elements
    .map((el, index) => ({ el, index }))
    .sort((a, b) => a.el.zIndex - b.el.zIndex || a.index - b.index)
    .map(({ el }) => el);

  // A page of the document's size says "auto"; one of its own size says so.
  const sameWidth = page.canvas.width === doc.width;
  const sameHeight = page.canvas.height === doc.height;
  return {
    id: page.id,
    children: ordered.map(toPolotnoElement),
    width: sameWidth ? "auto" : page.canvas.width,
    height: sameHeight ? "auto" : page.canvas.height,
    background: page.canvas.backgroundColor,
    bleed: 0,
    duration: 5000,
  };
}

/**
 * Every page of the document is written, in order. Polotno keeps one default
 * size for the document (`width` / `height`); it is the size of the first page,
 * and a page of another size carries its own numbers.
 */
export function convertKusukaToPolotno(doc: CanvasDocument): PolotnoDocument {
  const first = doc.pages[0]?.canvas ?? DEFAULT_CANVAS;
  const size = { width: first.width, height: first.height };
  return {
    schemaVersion: POLOTNO_SCHEMA_VERSION,
    width: size.width,
    height: size.height,
    unit: "px",
    dpi: 72,
    fonts: [],
    pages: doc.pages.map((page) => toPolotnoPage(page, size)),
    audios: [],
  };
}

// ------------------------- Entry point for loading ------------------------

/**
 * Accepts a JSON string or an already-parsed object in EITHER format and
 * returns a validated native document. The store's loadFromJSON() and the
 * template gallery both go through this one function.
 */
export function parseDocument(input: unknown): ParseResult {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "sintaks salah";
      return { ok: false, error: `Berkas bukan JSON yang valid (${reason}).` };
    }
  }

  const format = detectFormat(data);

  if (format === "polotno") {
    const result = convertPolotnoToKusuka(data as PolotnoDocument);
    return { ok: true, format, document: result.document, warnings: result.warnings };
  }

  if (format === "kusuka") {
    const result = sanitizeKusukaDocument(data as Record<string, unknown>);
    if ("error" in result) return { ok: false, error: result.error };
    return { ok: true, format, document: result.document, warnings: result.warnings };
  }

  return {
    ok: false,
    error: "Format tidak dikenali. Berkas harus berformat KusukaEdit (pages + elements, atau canvas + elements) atau Polotno (pages + children).",
  };
}
