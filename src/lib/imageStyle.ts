// ---------------------------------------------------------------------------
// Changing the look of a picture from the Filter & Effects panel.
//
// A patch is a handful of the optional style fields of an ImageElement. A value
// of `undefined` REMOVES the field (back to "no effect"), so the file of an
// untouched picture stays free of effect fields and the history does not record
// a change that changes nothing. Pure: no store, no React.
// ---------------------------------------------------------------------------

import type { ImageElement } from "@/types/editor";
import {
  FILTER_LIMIT,
  FILTER_PRESETS,
  MASK_SHAPES,
  MAX_BLUR_RADIUS,
  MAX_CORNER_RADIUS,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_OFFSET,
  MAX_STROKE_WIDTH,
} from "@/lib/imageEffects";
import { parseColor } from "@/lib/color";

export const IMAGE_STYLE_KEYS = [
  "blurRadius",
  "stroke",
  "strokeWidth",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "shadowOpacity",
  "maskShape",
  "cornerRadius",
  "brightness",
  "contrast",
  "saturation",
  "filterPreset",
] as const;

export type ImageStyleKey = (typeof IMAGE_STYLE_KEYS)[number];
export type ImageStylePatch = Partial<Pick<ImageElement, ImageStyleKey>>;

/** The style fields that make up the colour filter (what "Reset filter" clears). */
export const FILTER_KEYS: readonly ImageStyleKey[] = ["brightness", "contrast", "saturation", "filterPreset"];
/** The style fields of the "Effects" panel except the filter (what "Reset effects" clears). */
export const EFFECT_KEYS: readonly ImageStyleKey[] = IMAGE_STYLE_KEYS.filter((k) => !FILTER_KEYS.includes(k));

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** The valid, clamped value for one key, or `null` when the value cannot be used. */
function sanitize(key: ImageStyleKey, value: unknown): ImageElement[ImageStyleKey] | null {
  switch (key) {
    case "blurRadius":
      return finite(value) ? round2(clamp(value, 0, MAX_BLUR_RADIUS)) : null;
    case "strokeWidth":
      return finite(value) ? round2(clamp(value, 0, MAX_STROKE_WIDTH)) : null;
    case "shadowBlur":
      return finite(value) ? round2(clamp(value, 0, MAX_SHADOW_BLUR)) : null;
    case "shadowOffsetX":
    case "shadowOffsetY":
      return finite(value) ? round2(clamp(value, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET)) : null;
    case "shadowOpacity":
      return finite(value) ? round2(clamp(value, 0, 1)) : null;
    case "cornerRadius":
      return finite(value) ? round2(clamp(value, 0, MAX_CORNER_RADIUS)) : null;
    case "brightness":
    case "contrast":
    case "saturation":
      return finite(value) ? Math.round(clamp(value, -FILTER_LIMIT, FILTER_LIMIT)) : null;
    case "stroke":
    case "shadowColor": {
      const color = typeof value === "string" ? parseColor(value) : null;
      return color;
    }
    case "maskShape":
      return typeof value === "string" && (MASK_SHAPES as readonly string[]).includes(value)
        ? (value as ImageElement["maskShape"]) ?? null
        : null;
    case "filterPreset":
      return typeof value === "string" && (FILTER_PRESETS as readonly string[]).includes(value)
        ? (value as ImageElement["filterPreset"]) ?? null
        : null;
  }
}

/**
 * Applies a style patch to a picture. Returns the SAME element when nothing
 * ends up different (so the caller records no undo step). Values that cannot
 * be used (NaN, an unknown mask, an unreadable colour) are ignored, never stored.
 */
export function applyImageStylePatch(el: ImageElement, patch: ImageStylePatch): ImageElement {
  const next: ImageElement = { ...el };
  let changed = false;

  for (const key of IMAGE_STYLE_KEYS) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    if (raw === undefined) {
      if (key in next) {
        delete (next as unknown as Record<string, unknown>)[key];
        changed = true;
      }
      continue;
    }
    const value = sanitize(key, raw);
    if (value === null) continue;
    if (next[key] !== value) {
      (next as unknown as Record<string, unknown>)[key] = value;
      changed = true;
    }
  }
  return changed ? next : el;
}

/** A patch that clears the given keys. */
export function clearPatch(keys: readonly ImageStyleKey[]): ImageStylePatch {
  const patch: Record<string, undefined> = {};
  for (const key of keys) patch[key] = undefined;
  return patch as ImageStylePatch;
}
