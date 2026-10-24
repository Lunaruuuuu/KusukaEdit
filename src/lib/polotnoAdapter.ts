// ---------------------------------------------------------------------------
// Two-way adapter between KusukaEdit's native document and Polotno's JSON.
//
//   detectFormat()            "kusuka" | "polotno" | "unknown"
//   parseDocument()           string/object -> validated CanvasDocument
//                             (this is what the store's loadFromJSON calls)
//   convertPolotnoToKusuka()  Polotno { pages: [{ children }] }  ->  CanvasDocument
//   convertKusukaToPolotno()  CanvasDocument  ->  Polotno document
//   sanitizeKusukaDocument()  validates a native file, fills defaults,
//                             migrates old schema versions
//
// Pure functions only: no DOM, no React, no store. That keeps the adapter
// unit-testable in plain Node.
//
// Field mapping (Polotno -> KusukaEdit):
//   doc.width/height or page.width/height   -> canvas.width / height
//   page.background                         -> canvas.backgroundColor
//   page.children[]  (array order)          -> elements[]  (zIndex = position + 1)
//   text    fill (fallback: color)          -> text.fill
//   text    fontWeight + fontStyle          -> text.fontStyle ("bold italic" ...)
//   figure  subType rect | circle           -> shape.shapeType
//   image                                   -> image (kept, not drawn yet)
// ---------------------------------------------------------------------------

import {
  DEFAULT_CANVAS,
  DEFAULT_FONT_FAMILY,
  SCHEMA_VERSION,
  type CanvasDocument,
  type CanvasElement,
  type CanvasMeta,
  type ImageElement,
  type ShapeElement,
  type TextAlign,
  type TextElement,
  type TextFontStyle,
} from "@/types/editor";
import { newId } from "@/lib/id";
import { normalizeColor, parseColor } from "@/lib/color";

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
  | { ok: true; format: ExportFormat; warnings: string[] }
  | { ok: false; error: string };

// The Polotno schema revision these exports target (see polotno.com/docs/schema/store).
const POLOTNO_SCHEMA_VERSION = 4;
const POLOTNO_DEFAULT_SIZE = 1080;

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

const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right"];
const FONT_STYLES: readonly TextFontStyle[] = ["normal", "bold", "italic", "bold italic"];

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}`;
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

export function detectFormat(data: unknown): DocumentFormat {
  if (!isRecord(data)) return "unknown";
  if (Array.isArray(data.pages)) return "polotno";
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
  const canvasRaw = isRecord(raw.canvas) ? raw.canvas : {};
  const canvas: CanvasMeta = {
    width: Math.max(1, num(canvasRaw.width, DEFAULT_CANVAS.width)),
    height: Math.max(1, num(canvasRaw.height, DEFAULT_CANVAS.height)),
    backgroundColor: normalizeColor(canvasRaw.backgroundColor, DEFAULT_CANVAS.backgroundColor),
  };

  const usedIds = new Set<string>();
  const elements: CanvasElement[] = [];
  let skipped = 0;
  let migratedCircles = 0;

  (Array.isArray(raw.elements) ? raw.elements : []).forEach((item, index) => {
    if (!isRecord(item)) {
      skipped++;
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
      };
      elements.push(el);
      return;
    }

    if (item.type === "shape" && (item.shapeType === "rect" || item.shapeType === "circle")) {
      let base = readBase(item, index, usedIds);
      if (item.shapeType === "circle" && version < SCHEMA_VERSION) {
        base = migrateV1Circle(base);
        migratedCircles++;
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
      };
      elements.push(el);
      return;
    }

    if (item.type === "image" && typeof item.src === "string" && item.src !== "") {
      const el: ImageElement = { ...readBase(item, index, usedIds), type: "image", src: item.src };
      elements.push(el);
      return;
    }

    skipped++;
  });

  if (skipped > 0) {
    warnings.push(`${pluralize(skipped, "elemen")} tidak valid atau bertipe tidak dikenal dan dilewati.`);
  }
  if (migratedCircles > 0) {
    warnings.push(
      `File memakai skema v${version}: posisi ${pluralize(migratedCircles, "lingkaran")} dimigrasi ke v${SCHEMA_VERSION}.`
    );
  }

  return { document: { version: SCHEMA_VERSION, canvas, elements }, warnings };
}

// ------------------------- Polotno -> KusukaEdit --------------------------

function hasUnsupportedEffects(child: Record<string, unknown>): boolean {
  if (typeof child.opacity === "number" && child.opacity < 1) return true;
  if (
    child.shadowEnabled === true ||
    child.blurEnabled === true ||
    child.brightnessEnabled === true ||
    child.sepiaEnabled === true ||
    child.grayscaleEnabled === true ||
    child.backgroundEnabled === true ||
    child.curveEnabled === true
  ) {
    return true;
  }
  if (child.type === "text") {
    if (num(child.strokeWidth, 0) > 0) return true;
    if (num(child.letterSpacing, 0) !== 0) return true;
    if (typeof child.textDecoration === "string" && child.textDecoration !== "") return true;
    if (typeof child.textTransform === "string" && child.textTransform !== "none") return true;
  }
  if (Array.isArray(child.dash) && child.dash.length > 0) return true;
  return false;
}

export interface ConvertOptions {
  /** Which Polotno page becomes the canvas (the editor is single-page). Default 0. */
  pageIndex?: number;
}

export function convertPolotnoToKusuka(
  doc: PolotnoDocument,
  options: ConvertOptions = {}
): ConversionResult {
  const warnings: string[] = [];
  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  const pageIndex = options.pageIndex ?? 0;
  const page = pages[pageIndex];

  if (pages.length > 1) {
    warnings.push(
      `Dokumen Polotno punya ${pages.length} halaman; hanya halaman ${pageIndex + 1} yang diimpor.`
    );
  }

  const docWidth = num(doc.width, POLOTNO_DEFAULT_SIZE);
  const docHeight = num(doc.height, POLOTNO_DEFAULT_SIZE);
  const canvas: CanvasMeta = {
    // A page may carry its own size; "auto" means "use the document size".
    width: Math.max(1, num(page?.width, docWidth)),
    height: Math.max(1, num(page?.height, docHeight)),
    backgroundColor: "#ffffff",
  };

  if (page?.background !== undefined) {
    const parsed = parseColor(page.background);
    if (parsed === null) {
      warnings.push("Latar halaman berupa gambar/gradien (belum didukung); dipakai warna putih.");
    } else {
      canvas.backgroundColor = parsed;
    }
  }

  const usedIds = new Set<string>();
  const elements: CanvasElement[] = [];
  const skippedByType = new Map<string, number>();
  let imageCount = 0;
  let effectCount = 0;

  const skip = (label: string) => skippedByType.set(label, (skippedByType.get(label) ?? 0) + 1);

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
      const el: TextElement = {
        ...fields,
        // Polotno text height is auto-computed and may be 0 in the file.
        height: num(child.height, 0) > 0 ? fields.height : fontSize * lineHeight,
        type: "text",
        text: str(child.text, ""),
        fontSize,
        fontFamily: fromPolotnoFontFamily(str(child.fontFamily, "Roboto")),
        // Polotno's text color property is `fill`; `color` is accepted as a fallback.
        fill: parseColor(child.fill) ?? parseColor(child.color) ?? "#000000",
        align: TEXT_ALIGNS.includes(child.align as TextAlign)
          ? (child.align as TextAlign)
          : child.align === "justify"
            ? "left"
            : "center", // Polotno's default alignment
        fontStyle: composeFontStyle(isBoldWeight(child.fontWeight), child.fontStyle === "italic"),
        lineHeight,
      };
      if (hasUnsupportedEffects(child)) effectCount++;
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
      const el: ShapeElement = {
        ...base(),
        type: "shape",
        shapeType,
        // Polotno's defaults for a figure: rgb(0, 161, 255) fill, rgba(98, 197, 255, 1) stroke.
        fill: normalizeColor(child.fill, "#00a1ff"),
        stroke: normalizeColor(child.stroke, "#62c5ff"),
        strokeWidth: Math.max(0, num(child.strokeWidth, 0)),
        cornerRadius: shapeType === "rect" ? Math.max(0, num(child.cornerRadius, 0)) : 0,
      };
      if (hasUnsupportedEffects(child)) effectCount++;
      elements.push(el);
      return;
    }

    if (child.type === "image" && typeof child.src === "string" && child.src !== "") {
      const el: ImageElement = { ...base(), type: "image", src: child.src };
      imageCount++;
      elements.push(el);
      return;
    }

    skip(`tipe "${str(child.type, "?")}"`);
  });

  skippedByType.forEach((count, label) => {
    warnings.push(`${pluralize(count, "elemen")} ${label} belum didukung dan dilewati.`);
  });
  if (imageCount > 0) {
    warnings.push(
      `${pluralize(imageCount, "gambar")} diimpor dan akan ikut ter-export, tetapi belum ditampilkan di editor.`
    );
  }
  if (effectCount > 0) {
    warnings.push(
      `${pluralize(effectCount, "elemen")} memakai efek yang belum didukung (opacity, bayangan, blur, dll.); tampilan bisa sedikit berbeda.`
    );
  }

  return { document: { version: SCHEMA_VERSION, canvas, elements }, warnings };
}

// ------------------------- KusukaEdit -> Polotno --------------------------

function polotnoCommon(el: CanvasElement): PolotnoElement {
  return {
    id: el.id,
    type: el.type,
    name: "",
    opacity: 1,
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

function toPolotnoElement(el: CanvasElement): PolotnoElement {
  if (el.type === "text") {
    return {
      ...polotnoCommon(el),
      text: el.text,
      placeholder: "",
      fontSize: el.fontSize,
      fontFamily: toPolotnoFontFamily(el.fontFamily),
      fontStyle: el.fontStyle.includes("italic") ? "italic" : "normal",
      fontWeight: el.fontStyle.includes("bold") ? "bold" : "normal",
      textDecoration: "",
      fill: el.fill,
      align: el.align,
      verticalAlign: "top",
      lineHeight: el.lineHeight,
      letterSpacing: 0,
      strokeWidth: 0,
    };
  }
  if (el.type === "shape") {
    return {
      ...polotnoCommon(el),
      type: "figure",
      subType: el.shapeType,
      fill: el.fill,
      stroke: el.stroke,
      strokeWidth: el.strokeWidth,
      cornerRadius: el.cornerRadius,
      dash: [],
    };
  }
  return { ...polotnoCommon(el), src: el.src };
}

export function convertKusukaToPolotno(doc: CanvasDocument): PolotnoDocument {
  // Polotno has no zIndex: stacking order IS the array order, so sort
  // (stable, ties keep their current order) and write children bottom-first.
  const ordered = doc.elements
    .map((el, index) => ({ el, index }))
    .sort((a, b) => a.el.zIndex - b.el.zIndex || a.index - b.index)
    .map(({ el }) => el);

  return {
    schemaVersion: POLOTNO_SCHEMA_VERSION,
    width: doc.canvas.width,
    height: doc.canvas.height,
    unit: "px",
    dpi: 72,
    fonts: [],
    pages: [
      {
        id: "page-1",
        children: ordered.map(toPolotnoElement),
        width: "auto",
        height: "auto",
        background: doc.canvas.backgroundColor,
        bleed: 0,
        duration: 5000,
      },
    ],
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
    error: "Format tidak dikenali. Berkas harus berformat KusukaEdit (canvas + elements) atau Polotno (pages + children).",
  };
}
