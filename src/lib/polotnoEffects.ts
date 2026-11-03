// ---------------------------------------------------------------------------
// Picture effects <-> Polotno: blur, border, drop shadow and the circle /
// triangle mask. Pure functions, no DOM; polotnoAdapter.ts calls them for every
// `image` and `svg` element.
//
//   Polotno                                      KusukaEdit (ImageElement)
//   blurEnabled: true + blurRadius (default 10)  blurRadius
//   borderSize (> 0) + borderColor               strokeWidth + stroke
//   shadowEnabled: true + shadowColor,           shadowColor (#rrggbb),
//     shadowBlur (5), shadowOffsetX/Y (0),         shadowBlur, shadowOffsetX/Y,
//     shadowOpacity (1)                            shadowOpacity (x the colour's own alpha)
//   clipSrc  (a circle or triangle SVG)          maskShape: "circle" | "triangle"
//   cornerRadius (px)                            cornerRadius
//   brightnessEnabled + brightness (-1..1)       brightness (-100..100 = x100)
//   sepiaEnabled / grayscaleEnabled              filterPreset "sepia" / "grayscale"
//   filters.contrast / .saturation { intensity } contrast / saturation (-100..100 = x100)
//   custom.filterPreset (our own, written for     filterPreset: vivid | fade | warm | cool | dramatic
//     the presets Polotno has no flag for)
//
// Opacity and the drop shadow are not picture-only: readPolotnoCommonEffects /
// commonEffectsToPolotno do the same for text and figures.
//
// An effect is only read when Polotno says it is ON (`blurEnabled`,
// `shadowEnabled`): its defaults (blurRadius 10, shadowBlur 5 ...) are present
// in files where the effect is off, and must not switch it on.
// ---------------------------------------------------------------------------

import type { FilterPreset, MaskShape } from "@/types/editor";
import { colorAlpha, parseColor } from "@/lib/color";
import {
  FILTER_LIMIT,
  FILTER_PRESETS,
  MASK_SHAPES,
  MAX_BLUR_RADIUS,
  MAX_CORNER_RADIUS,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_OFFSET,
  MAX_STROKE_WIDTH,
  resolveImageEffects,
  resolveOpacity,
  resolveShadow,
  type ImageEffectFields,
  type ShadowFields,
} from "@/lib/imageEffects";

/** Opacity + drop shadow: the effects every element type has. */
export type CommonEffectFields = Partial<ShadowFields & { opacity: number }>;

type Rec = Record<string, unknown>;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** Accepts numbers and numeric strings, like the rest of the adapter. */
function num(value: unknown, fallback: number): number {
  if (finite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

// Polotno's documented defaults for a picture's effects.
const POLOTNO_BLUR_RADIUS = 10;
const POLOTNO_SHADOW_BLUR = 5;

// ------------------------------- the masks --------------------------------

const MASK_SVG: Record<MaskShape, string> = {
  circle:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><circle cx="50" cy="50" r="50"/></svg>',
  triangle:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,0 100,100 0,100"/></svg>',
};

/** The `clipSrc` written to a Polotno file for a mask: a small SVG data URI. */
export function maskToClipSrc(shape: MaskShape): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MASK_SVG[shape])}`;
}

const DATA_URI_RE = /^data:([^,;]*)((?:;[^,;]*)*),([\s\S]*)$/i;

function decodeSvgDataUri(src: string): string | null {
  const match = DATA_URI_RE.exec(src);
  if (!match || match[1].toLowerCase() !== "image/svg+xml") return null;
  const body = match[3];
  try {
    if (/;base64/i.test(match[2])) {
      if (typeof atob !== "function") return null;
      const binary = atob(body.replace(/\s/g, ""));
      return new TextDecoder("utf-8").decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    }
  } catch {
    return null;
  }
  try {
    return decodeURIComponent(body);
  } catch {
    return body;
  }
}

const NUMBER_RE = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** The distinct corner points of an SVG path made only of straight lines. */
function straightPathPoints(d: string): Array<[number, number]> | null {
  const points: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!commands) return null;
  for (const command of commands) {
    const letter = command[0];
    const args = (command.slice(1).match(NUMBER_RE) ?? []).map(Number);
    const relative = letter === letter.toLowerCase();
    switch (letter.toUpperCase()) {
      case "M":
      case "L": {
        if (args.length < 2 || args.length % 2 !== 0) return null;
        for (let i = 0; i < args.length; i += 2) {
          x = relative ? x + args[i] : args[i];
          y = relative ? y + args[i + 1] : args[i + 1];
          if (letter.toUpperCase() === "M" && i === 0) {
            startX = x;
            startY = y;
          }
          points.push([x, y]);
        }
        break;
      }
      case "H":
        for (const a of args) {
          x = relative ? x + a : a;
          points.push([x, y]);
        }
        break;
      case "V":
        for (const a of args) {
          y = relative ? y + a : a;
          points.push([x, y]);
        }
        break;
      case "Z":
        x = startX;
        y = startY;
        break;
      default:
        return null; // a curve or an arc: not a polygon
    }
  }
  return points;
}

function distinctPoints(points: Array<[number, number]>): number {
  return new Set(points.map(([px, py]) => `${Math.round(px * 1000)},${Math.round(py * 1000)}`)).size;
}

function shapeFromSvg(svg: string): MaskShape | null {
  const tag = /<(circle|ellipse|polygon|path)\b([^>]*)>/i.exec(svg);
  if (!tag) return null;
  const name = tag[1].toLowerCase();
  const attrs = tag[2];
  if (name === "circle" || name === "ellipse") return "circle";

  if (name === "polygon") {
    const points = /\bpoints\s*=\s*"([^"]*)"/i.exec(attrs) ?? /\bpoints\s*=\s*'([^']*)'/i.exec(attrs);
    if (!points) return null;
    const values = (points[1].match(NUMBER_RE) ?? []).map(Number);
    if (values.length % 2 !== 0) return null;
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < values.length; i += 2) pairs.push([values[i], values[i + 1]]);
    return distinctPoints(pairs) === 3 ? "triangle" : null;
  }

  // <path d="...">
  const d = /\bd\s*=\s*"([^"]*)"/i.exec(attrs) ?? /\bd\s*=\s*'([^']*)'/i.exec(attrs);
  if (!d) return null;
  const straight = straightPathPoints(d[1]);
  if (straight !== null) return distinctPoints(straight) === 3 ? "triangle" : null;
  // A circle drawn as arcs (M, A, A, Z) or as the usual four Béziers (M, C x4, Z).
  const letters = (d[1].match(/[a-zA-Z]/g) ?? []).map((c) => c.toUpperCase());
  const body = letters.filter((c) => c !== "M" && c !== "Z");
  if (body.length >= 1 && body.length <= 4 && body.every((c) => c === "A")) return "circle";
  if (body.length === 4 && body.every((c) => c === "C")) return "circle";
  return null;
}

function shapeFromName(url: string): MaskShape | null {
  const path = url.split(/[?#]/)[0];
  let name = path.slice(path.lastIndexOf("/") + 1);
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep the raw name */
  }
  name = name.toLowerCase();
  if (/circle|ellipse|lingkaran|oval/.test(name)) return "circle";
  if (/triangle|segitiga/.test(name)) return "triangle";
  return null;
}

/**
 * Which shape a Polotno `clipSrc` cuts a picture to, or null when it is
 * something else (a star, a heart, a custom outline ...).
 *
 * Polotno's clipSrc is the URL of an SVG, and this editor cannot fetch it. So:
 *   - a data:image/svg+xml URI is read: a <circle>/<ellipse> is a circle, a
 *     polygon or straight-line path with three corners is a triangle, a path
 *     of arcs (or four Béziers) is a circle;
 *   - any other URL is judged by its file name ("circle.svg", "triangle.svg").
 * Anything not recognised is NOT guessed: the picture is left unmasked and
 * the caller warns.
 */
export function detectMaskShape(clipSrc: unknown): MaskShape | null {
  if (typeof clipSrc !== "string") return null;
  const src = clipSrc.trim();
  if (src === "") return null;
  if (/^data:/i.test(src)) {
    const svg = decodeSvgDataUri(src);
    return svg === null ? null : shapeFromSvg(svg);
  }
  return shapeFromName(src);
}

// --------------------------- Polotno -> KusukaEdit ---------------------------

export interface ReadEffects {
  fields: Partial<ImageEffectFields>;
  /** A `clipSrc` was present, but it is not a circle or a triangle. */
  unknownMask: boolean;
  /** `filters` names a filter other than contrast / saturation (it is left out). */
  unknownFilter: boolean;
  /** sepiaEnabled and grayscaleEnabled were both on: only one preset can be kept. */
  presetConflict: boolean;
}

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

/** The filter names Polotno's `filters` object may carry that this editor understands. */
const KNOWN_FILTER_NAMES = ["contrast", "saturation"];

/**
 * True when a Polotno `filters` object holds a filter (other than contrast or
 * saturation) that actually does something. An entry with intensity 0 is off.
 */
export function hasUnknownFilters(filters: unknown): boolean {
  if (!isRec(filters)) return false;
  return Object.entries(filters).some(([name, value]) => {
    if (KNOWN_FILTER_NAMES.includes(name)) return false;
    const intensity = isRec(value) ? num(value.intensity, 1) : 1;
    return intensity !== 0;
  });
}

function filterIntensity(filters: unknown, name: string): number {
  if (!isRec(filters) || !isRec(filters[name])) return 0;
  // Polotno: "Filter intensity (-1 to 1)", default 1.
  return Math.round(clamp(num((filters[name] as Rec).intensity, 1), -1, 1) * FILTER_LIMIT);
}

/** Reads a colour the way the adapter does: counts unreadable ones and falls back. */
export type ColorReader = (value: unknown, fallback: string) => string;

/**
 * Pulls the blur, border, shadow and mask out of a Polotno `image` / `svg`
 * element. Only what is switched on and visible is returned, so a file whose
 * effects are all off produces an element with no effect fields at all.
 */
export function readPolotnoImageEffects(child: Rec, color: ColorReader): ReadEffects {
  const fields: Partial<ImageEffectFields> = {};

  if (child.blurEnabled === true) {
    const radius = clamp(num(child.blurRadius, POLOTNO_BLUR_RADIUS), 0, MAX_BLUR_RADIUS);
    if (radius > 0) fields.blurRadius = radius;
  }

  const borderSize = num(child.borderSize, 0);
  if (borderSize > 0) {
    const stroke = color(child.borderColor === undefined ? "black" : child.borderColor, "#000000");
    if (stroke !== "transparent") {
      fields.stroke = stroke;
      fields.strokeWidth = clamp(borderSize, 0, MAX_STROKE_WIDTH);
    }
  }

  Object.assign(fields, readPolotnoCommonEffects(child, color));

  let unknownMask = false;
  if (typeof child.clipSrc === "string" && child.clipSrc.trim() !== "") {
    const mask = detectMaskShape(child.clipSrc);
    if (mask === null) unknownMask = true;
    else fields.maskShape = mask;
  }

  const radius = num(child.cornerRadius, 0);
  if (radius > 0) fields.cornerRadius = clamp(radius, 0, MAX_CORNER_RADIUS);

  // Colour filter. Like blur and shadow, brightness only counts when Polotno
  // says it is ON (`brightnessEnabled`).
  if (child.brightnessEnabled === true) {
    const brightness = Math.round(clamp(num(child.brightness, 0), -1, 1) * FILTER_LIMIT);
    if (brightness !== 0) fields.brightness = brightness;
  }
  const contrast = filterIntensity(child.filters, "contrast");
  if (contrast !== 0) fields.contrast = contrast;
  const saturation = filterIntensity(child.filters, "saturation");
  if (saturation !== 0) fields.saturation = saturation;

  let presetConflict = false;
  if (child.grayscaleEnabled === true) {
    fields.filterPreset = "grayscale";
    presetConflict = child.sepiaEnabled === true;
  } else if (child.sepiaEnabled === true) {
    fields.filterPreset = "sepia";
  } else if (isRec(child.custom) && isFilterPreset(child.custom.filterPreset)) {
    // One of the presets Polotno has no flag for: this editor wrote it itself.
    fields.filterPreset = child.custom.filterPreset;
  }

  return { fields, unknownMask, unknownFilter: hasUnknownFilters(child.filters), presetConflict };
}

/**
 * Opacity and drop shadow of ANY Polotno element (text, figure, image, svg).
 * Like the picture effects, the shadow is read only when `shadowEnabled` is
 * true, and only when it would be visible.
 */
export function readPolotnoCommonEffects(child: Rec, color: ColorReader): CommonEffectFields {
  const fields: CommonEffectFields = {};
  const opacity = num(child.opacity, 1);
  if (opacity < 1) fields.opacity = round4(clamp(opacity, 0, 1));

  if (child.shadowEnabled === true) {
    const raw = child.shadowColor === undefined ? "black" : child.shadowColor;
    const shadowColor = color(raw, "#000000");
    const candidate: Partial<ShadowFields> = {
      shadowColor,
      shadowBlur: clamp(num(child.shadowBlur, POLOTNO_SHADOW_BLUR), 0, MAX_SHADOW_BLUR),
      shadowOffsetX: clamp(num(child.shadowOffsetX, 0), -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET),
      shadowOffsetY: clamp(num(child.shadowOffsetY, 0), -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET),
      // Konva multiplies shadowOpacity into the colour, so the colour's own
      // alpha (rgba(0,0,0,0.4)) and Polotno's shadowOpacity combine the same way.
      shadowOpacity: round4(clamp(num(child.shadowOpacity, 1), 0, 1) * colorAlpha(raw)),
    };
    if (resolveShadow(candidate) !== null) Object.assign(fields, candidate);
  }
  return fields;
}

/**
 * The Polotno properties for opacity and the drop shadow of any element. A
 * shadow that is off writes nothing (Polotno's default: disabled). Opacity is
 * left to the caller, which always writes it (Polotno's elements carry it).
 */
export function shadowToPolotno(el: CommonEffectFields): Rec {
  const shadow = resolveShadow(el);
  if (!shadow) return {};
  return {
    shadowEnabled: true,
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
    shadowOpacity: shadow.opacity,
  };
}

/** Opacity to write to a Polotno element (always present there; 1 = opaque). */
export function opacityToPolotno(el: CommonEffectFields): number {
  return resolveOpacity(el);
}

function isFilterPreset(value: unknown): value is FilterPreset {
  return typeof value === "string" && (FILTER_PRESETS as readonly string[]).includes(value);
}

// ----------------------------- native documents ------------------------------

/**
 * Validates the effect fields of an element in a native (KusukaEdit) file:
 * numbers are clamped, colours must be readable, a mask must be a known one.
 * Whatever is not valid is left out, so a damaged value never breaks drawing.
 */
export function readNativeImageEffects(item: Rec): Partial<ImageEffectFields> {
  const fields: Partial<ImageEffectFields> = {};

  if (finite(item.blurRadius) && item.blurRadius > 0) {
    fields.blurRadius = clamp(item.blurRadius, 0, MAX_BLUR_RADIUS);
  }

  const stroke = parseColor(item.stroke);
  if (finite(item.strokeWidth) && item.strokeWidth > 0 && stroke !== null && stroke !== "transparent") {
    fields.stroke = stroke;
    fields.strokeWidth = clamp(item.strokeWidth, 0, MAX_STROKE_WIDTH);
  }

  Object.assign(fields, readNativeCommonEffects(item));

  if (typeof item.maskShape === "string" && (MASK_SHAPES as readonly string[]).includes(item.maskShape)) {
    fields.maskShape = item.maskShape as MaskShape;
  }

  if (finite(item.cornerRadius) && item.cornerRadius > 0) {
    fields.cornerRadius = clamp(item.cornerRadius, 0, MAX_CORNER_RADIUS);
  }
  for (const key of ["brightness", "contrast", "saturation"] as const) {
    const value = item[key];
    if (finite(value) && value !== 0) fields[key] = Math.round(clamp(value, -FILTER_LIMIT, FILTER_LIMIT));
  }
  if (isFilterPreset(item.filterPreset)) fields.filterPreset = item.filterPreset;
  return fields;
}

/** Opacity and drop shadow of an element of a native file, validated like the picture effects. */
export function readNativeCommonEffects(item: Rec): CommonEffectFields {
  const fields: CommonEffectFields = {};
  // 1 is "no effect": not stored, so the file stays as it was.
  if (finite(item.opacity) && item.opacity < 1) fields.opacity = clamp(item.opacity, 0, 1);

  const shadowColor = parseColor(item.shadowColor);
  if (shadowColor !== null && shadowColor !== "transparent") {
    fields.shadowColor = shadowColor;
    if (finite(item.shadowBlur)) fields.shadowBlur = clamp(item.shadowBlur, 0, MAX_SHADOW_BLUR);
    if (finite(item.shadowOffsetX)) fields.shadowOffsetX = clamp(item.shadowOffsetX, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET);
    if (finite(item.shadowOffsetY)) fields.shadowOffsetY = clamp(item.shadowOffsetY, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET);
    if (finite(item.shadowOpacity)) fields.shadowOpacity = clamp(item.shadowOpacity, 0, 1);
  }
  return fields;
}

// ------------------------------ KusukaEdit -> Polotno -----------------------

/**
 * The Polotno properties for the effects that are really on. Effects that are
 * off write nothing: Polotno's defaults (disabled) then apply, and the file is
 * the same as before effects existed.
 */
export function imageEffectsToPolotno(el: Partial<ImageEffectFields>, customSource?: string): Rec {
  const fx = resolveImageEffects(el);
  const out: Rec = {};
  if (fx.blur > 0) {
    out.blurEnabled = true;
    out.blurRadius = fx.blur;
  }
  if (fx.stroke) {
    out.borderSize = fx.stroke.width;
    out.borderColor = fx.stroke.color;
  }
  Object.assign(out, shadowToPolotno(el));
  if (fx.mask) out.clipSrc = maskToClipSrc(fx.mask);
  // The radius is written even under a mask (the mask wins on screen, but Polotno
  // can hold both, and a file that is read and written again must not lose it).
  const radius = finite(el.cornerRadius) ? clamp(el.cornerRadius, 0, MAX_CORNER_RADIUS) : 0;
  if (radius > 0) out.cornerRadius = radius;

  if (fx.filter) {
    const f = fx.filter;
    if (f.brightness !== 0) {
      out.brightnessEnabled = true;
      out.brightness = round4(f.brightness / FILTER_LIMIT);
    }
    const filters: Rec = {};
    if (f.contrast !== 0) filters.contrast = { intensity: round4(f.contrast / FILTER_LIMIT) };
    if (f.saturation !== 0) filters.saturation = { intensity: round4(f.saturation / FILTER_LIMIT) };
    if (Object.keys(filters).length > 0) out.filters = filters;
    if (f.preset === "grayscale") out.grayscaleEnabled = true;
    else if (f.preset === "sepia") out.sepiaEnabled = true;
    else if (f.preset !== null) {
      // Polotno has no flag for these looks: kept for this editor only.
      out.custom = { ...(customSource ? { source: customSource } : {}), filterPreset: f.preset };
    }
  }
  return out;
}
