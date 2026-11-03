// ---------------------------------------------------------------------------
// Workspace (canvas size) rules. Pure functions, no DOM, no store.
//
// The canvas size is what the Konva <Stage> is drawn at AND what
// stage.toDataURL() rasterizes, so every limit here protects both the
// on-screen workspace and the exported picture.
// ---------------------------------------------------------------------------

/** Smallest / largest canvas side accepted by the editor, in px. */
export const CANVAS_LIMITS = { min: 50, max: 4000 } as const;

/**
 * Longest side an EXPORTED image may have, in px. Browsers cap <canvas>
 * size (Chrome ~16k per side, Safari/iOS far less in total area), and a
 * failed toDataURL() returns an empty image without any error — so the
 * export resolution is lowered before it gets there.
 */
export const MAX_EXPORT_SIDE = 8192;

/** A freshly uploaded picture is fitted inside this fraction of the canvas. */
const IMAGE_FIT_FRACTION = 0.6;
/** ...but never drawn smaller than this on its shortest side. */
const IMAGE_MIN_SIDE = 24;
/** Used when an image reports no intrinsic size (e.g. an SVG without width/height). */
const IMAGE_FALLBACK_SIZE = { width: 300, height: 150 } as const;

export interface RatioPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const RATIO_PRESETS: readonly RatioPreset[] = [
  { id: "1:1", label: "1:1", width: 1, height: 1 },
  { id: "4:5", label: "4:5", width: 4, height: 5 },
  { id: "4:3", label: "4:3", width: 4, height: 3 },
  { id: "16:9", label: "16:9", width: 16, height: 9 },
  { id: "9:16", label: "9:16", width: 9, height: 16 },
];

export interface Size {
  width: number;
  height: number;
}

/** Rounds to a whole pixel inside CANVAS_LIMITS; `fallback` when not a finite number. */
export function clampDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(CANVAS_LIMITS.max, Math.max(CANVAS_LIMITS.min, Math.round(value)));
}

/**
 * Canvas size for a ratio preset. The LONGER side of the current canvas is
 * kept, so choosing a ratio changes the shape without suddenly producing a
 * much bigger or smaller workspace (900x600 + 1:1 -> 900x900, + 9:16 -> 506x900).
 */
export function sizeForRatio(current: Size, ratio: Size): Size {
  const longest = Math.max(current.width, current.height);
  const landscape = ratio.width >= ratio.height;
  const width = landscape ? longest : (longest * ratio.width) / ratio.height;
  const height = landscape ? (longest * ratio.height) / ratio.width : longest;
  return {
    width: clampDimension(width, current.width),
    height: clampDimension(height, current.height),
  };
}

/** The preset a size corresponds to (within rounding), or null for a custom size. */
export function matchRatio(width: number, height: number): RatioPreset | null {
  if (!(width > 0) || !(height > 0)) return null;
  const actual = width / height;
  for (const preset of RATIO_PRESETS) {
    const target = preset.width / preset.height;
    if (Math.abs(actual - target) / target < 0.006) return preset;
  }
  return null;
}

export interface ExportPlan {
  /** The ratio that will actually be passed to stage.toDataURL(). */
  pixelRatio: number;
  /** True when the requested ratio was lowered to respect MAX_EXPORT_SIDE. */
  capped: boolean;
  outputWidth: number;
  outputHeight: number;
}

/**
 * Output size of an image export: canvas size x pixelRatio, with the ratio
 * lowered when the longest side would exceed MAX_EXPORT_SIDE.
 */
export function resolveExportPixelRatio(width: number, height: number, requested: number): ExportPlan {
  const wanted = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const longest = Math.max(width, height, 1);
  const limit = MAX_EXPORT_SIDE / longest;
  const capped = wanted > limit;
  // floor to 2 decimals so rounding can never push the output over the limit
  const pixelRatio = capped ? Math.floor(limit * 100) / 100 : wanted;
  return {
    pixelRatio,
    capped,
    outputWidth: Math.round(width * pixelRatio),
    outputHeight: Math.round(height * pixelRatio),
  };
}

/**
 * Size (in canvas px) a newly uploaded picture is placed at: its natural
 * aspect ratio, fitted inside 60% of the canvas, never enlarged beyond its
 * natural size (except tiny pictures, which are lifted to a visible minimum).
 */
export function fitImageToCanvas(naturalWidth: number, naturalHeight: number, canvas: Size): Size {
  const nw = naturalWidth > 0 ? naturalWidth : IMAGE_FALLBACK_SIZE.width;
  const nh = naturalHeight > 0 ? naturalHeight : IMAGE_FALLBACK_SIZE.height;
  const fit = Math.min(1, (canvas.width * IMAGE_FIT_FRACTION) / nw, (canvas.height * IMAGE_FIT_FRACTION) / nh);
  const scale = Math.max(fit, IMAGE_MIN_SIDE / Math.min(nw, nh));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return { width: round2(nw * scale), height: round2(nh * scale) };
}

/** The box of an element: what fitElementToPage() reads and writes. */
export interface ElementBox extends Size {
  type: "text" | "shape" | "image";
  x: number;
  y: number;
  rotation: number;
}

/**
 * "Fit to page": the element scaled proportionally (its aspect ratio kept) to
 * the largest size that fits inside the page, centred, upright. Returns the new
 * x / y / width / height / rotation, or null when nothing would change — or for
 * text, whose height follows its words and cannot be scaled this way.
 */
export function fitElementToPage(
  el: ElementBox,
  page: Size
): { x: number; y: number; width: number; height: number; rotation: number } | null {
  if (el.type === "text" || !(el.width > 0) || !(el.height > 0)) return null;
  const scale = Math.min(page.width / el.width, page.height / el.height);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const width = round2(el.width * scale);
  const height = round2(el.height * scale);
  const box = {
    x: round2((page.width - width) / 2),
    y: round2((page.height - height) / 2),
    width,
    height,
    rotation: 0,
  };
  const same =
    Math.abs(box.x - el.x) < 0.01 &&
    Math.abs(box.y - el.y) < 0.01 &&
    Math.abs(box.width - el.width) < 0.01 &&
    Math.abs(box.height - el.height) < 0.01 &&
    el.rotation === 0;
  return same ? null : box;
}
