// ---------------------------------------------------------------------------
// Visual effects of a picture (blur, border, drop shadow, mask): which of them
// are actually switched on, and how the blur is handed to Konva. No React, no
// Konva import — the Konva pieces (the Blur filter) are passed in, so all of
// this runs and is tested in plain Node.
// ---------------------------------------------------------------------------

import type { FilterPreset, ImageElement, MaskShape } from "@/types/editor";

export const MAX_BLUR_RADIUS = 100;
export const MAX_STROKE_WIDTH = 100;
export const MAX_SHADOW_BLUR = 200;
export const MAX_SHADOW_OFFSET = 1000;
export const MAX_CORNER_RADIUS = 2000;
/** brightness / contrast / saturation run from -FILTER_LIMIT to +FILTER_LIMIT. */
export const FILTER_LIMIT = 100;

export const MASK_SHAPES: readonly MaskShape[] = ["circle", "triangle"];
export const FILTER_PRESETS: readonly FilterPreset[] = [
  "grayscale",
  "sepia",
  "vivid",
  "fade",
  "warm",
  "cool",
  "dramatic",
];

export type ImageEffectFields = Pick<
  ImageElement,
  | "blurRadius"
  | "stroke"
  | "strokeWidth"
  | "shadowColor"
  | "shadowBlur"
  | "shadowOffsetX"
  | "shadowOffsetY"
  | "shadowOpacity"
  | "maskShape"
  | "cornerRadius"
  | "brightness"
  | "contrast"
  | "saturation"
  | "filterPreset"
>;

/** The colour filter of a picture. Neutral values mean "nothing to do" (see resolveFilter). */
export interface ResolvedFilter {
  brightness: number;
  contrast: number;
  saturation: number;
  preset: FilterPreset | null;
}

export interface ResolvedEffects {
  /** Blur radius in design px; 0 = none. */
  blur: number;
  stroke: { color: string; width: number } | null;
  shadow: { color: string; blur: number; offsetX: number; offsetY: number; opacity: number } | null;
  mask: MaskShape | null;
  /** Rounded corners in design px; 0 = square. Always 0 while there is a mask. */
  cornerRadius: number;
  /** null = the picture is shown as it is. */
  filter: ResolvedFilter | null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
const isInvisibleColor = (c: string): boolean => c.trim().toLowerCase() === "transparent";

/**
 * Reads brightness / contrast / saturation / preset. Returns null when they
 * would change nothing, so the renderer never builds a filtered copy of a
 * picture for a slider that sits at 0.
 */
export function resolveFilter(
  el: Partial<Pick<ImageElement, "brightness" | "contrast" | "saturation" | "filterPreset">>
): ResolvedFilter | null {
  const level = (v: unknown): number => (finite(v) ? clamp(v, -FILTER_LIMIT, FILTER_LIMIT) : 0);
  const brightness = level(el.brightness);
  const contrast = level(el.contrast);
  const saturation = level(el.saturation);
  const preset =
    el.filterPreset !== undefined && FILTER_PRESETS.includes(el.filterPreset) ? el.filterPreset : null;
  if (brightness === 0 && contrast === 0 && saturation === 0 && preset === null) return null;
  return { brightness, contrast, saturation, preset };
}

/**
 * Reads the optional effect fields of an element into what is really drawn.
 * An effect with nothing to show (a border with width 0, a shadow with no blur
 * and no offset, a blur of 0) is `null` / 0, so the renderer never turns on a
 * costly filter or a shadow for an effect that would be invisible.
 */
export function resolveImageEffects(el: Partial<ImageEffectFields>): ResolvedEffects {
  const blur = finite(el.blurRadius) ? clamp(el.blurRadius, 0, MAX_BLUR_RADIUS) : 0;

  const strokeWidth = finite(el.strokeWidth) ? clamp(el.strokeWidth, 0, MAX_STROKE_WIDTH) : 0;
  const stroke =
    strokeWidth > 0 && typeof el.stroke === "string" && el.stroke !== "" && !isInvisibleColor(el.stroke)
      ? { color: el.stroke, width: strokeWidth }
      : null;

  let shadow: ResolvedEffects["shadow"] = null;
  if (typeof el.shadowColor === "string" && el.shadowColor !== "" && !isInvisibleColor(el.shadowColor)) {
    const shadowBlur = finite(el.shadowBlur) ? clamp(el.shadowBlur, 0, MAX_SHADOW_BLUR) : 0;
    const offsetX = finite(el.shadowOffsetX) ? clamp(el.shadowOffsetX, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET) : 0;
    const offsetY = finite(el.shadowOffsetY) ? clamp(el.shadowOffsetY, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET) : 0;
    const opacity = finite(el.shadowOpacity) ? clamp(el.shadowOpacity, 0, 1) : 1;
    if (opacity > 0 && (shadowBlur > 0 || offsetX !== 0 || offsetY !== 0)) {
      shadow = { color: el.shadowColor, blur: shadowBlur, offsetX, offsetY, opacity };
    }
  }

  const mask = el.maskShape !== undefined && MASK_SHAPES.includes(el.maskShape) ? el.maskShape : null;
  // A circle or a triangle has no corners to round.
  const cornerRadius =
    mask === null && finite(el.cornerRadius) ? clamp(el.cornerRadius, 0, MAX_CORNER_RADIUS) : 0;
  return { blur, stroke, shadow, mask, cornerRadius, filter: resolveFilter(el) };
}

// ------------------------------- blur filter -------------------------------

// Largest side, in cache pixels, the blur's offscreen canvas may have: browsers
// refuse (and Konva then draws nothing) beyond roughly 16k.
const MAX_CACHE_SIDE = 8192;
const MAX_CACHE_PIXEL_RATIO = 4;

export interface BlurCacheConfig {
  /** Resolution of the offscreen bitmap Konva blurs. */
  pixelRatio: number;
  /** The value for the filter's blurRadius, in cache pixels. */
  filterRadius: number;
}

/**
 * Konva's Blur works on the node's cached bitmap, in that bitmap's own pixels —
 * so the same number would blur half as much on a 2x screen and look sharper
 * at 400% zoom. The bitmap is therefore cached at the resolution it is shown
 * at (view zoom x device pixel ratio, capped), and the radius is multiplied by
 * that ratio: the blur then covers the same part of the PICTURE at any zoom
 * or screen. `blurRadius` is in design pixels.
 */
export function blurCacheConfig(
  blurRadius: number,
  options: { zoom: number; deviceRatio: number; width: number; height: number }
): BlurCacheConfig {
  const wanted = Math.max(1, options.zoom) * Math.max(1, options.deviceRatio);
  // quantised to halves so a smooth wheel zoom does not re-cache on every tick
  const stepped = Math.ceil(wanted * 2) / 2;
  const longestSide = Math.max(options.width, options.height, 1);
  const pixelRatio = Math.max(1, Math.min(stepped, MAX_CACHE_PIXEL_RATIO, MAX_CACHE_SIDE / longestSide));
  return { pixelRatio, filterRadius: Math.max(1, Math.round(blurRadius * pixelRatio)) };
}

/** The few Konva.Node methods the blur needs (so it can be tested with a fake). */
export interface BlurNode {
  cache(config?: { pixelRatio?: number }): unknown;
  clearCache(): unknown;
  isCached(): boolean;
  filters(filters: unknown[]): unknown;
  blurRadius(radius: number): unknown;
}

/**
 * Switches the blur on (or refreshes it): cache -> filters -> blurRadius, in
 * the order Konva documents. A cached node is a snapshot — it does not follow
 * later changes of the node — so this is called again whenever the picture, its
 * size, crop, border, shadow or mask change.
 */
export function applyImageBlur(node: BlurNode, blurFilter: unknown, config: BlurCacheConfig): void {
  if (node.isCached()) node.clearCache();
  node.cache({ pixelRatio: config.pixelRatio });
  node.filters([blurFilter]);
  node.blurRadius(config.filterRadius);
}

/** Switches the blur off and gives the node back its live drawing. */
export function clearImageBlur(node: BlurNode): void {
  if (!node.isCached()) return; // never blurred: nothing to undo
  node.clearCache();
  node.filters([]);
}
