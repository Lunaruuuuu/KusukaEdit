// ---------------------------------------------------------------------------
// Colour filters of a picture: brightness, contrast, saturation and the presets.
//
// Every filter is a 4x5 COLOUR MATRIX, the same idea as SVG's feColorMatrix:
//
//     [R']   [ m0  m1  m2  m3  m4 ]   [R]
//     [G'] = [ m5  m6  m7  m8  m9 ] * [G]      channels in 0..1, offsets in 0..1
//     [B']   [m10 m11 m12 m13 m14 ]   [B]
//     [A']   [m15 m16 m17 m18 m19 ]   [A]
//                                     [1]
//
// Matrices compose by multiplication, so brightness + contrast + saturation +
// a preset are ONE matrix and the picture is touched in ONE pass.
//
// Why not Konva's own filters (Konva.Filters.Brighten / Contrast / HSL ...)?
// They work on the node's cached bitmap, so they would tint the border and the
// shadow along with the picture, and cannot run in the Node tests. The filtered
// copy made here covers only the PICTURE, and the matrix maths below is tested
// number by number. (Brightness is additive, like Konva's Brighten and
// Polotno's `brightness`: -100..100 moves each channel by -255..255.)
//
// Only the 4x5 maths and pixel loop are DOM-free; `filterPicture()` at the end
// is the one function that needs a canvas.
// ---------------------------------------------------------------------------

import type { FilterPreset } from "@/types/editor";
import { FILTER_LIMIT, type ResolvedFilter } from "@/lib/imageEffects";

/** 20 numbers, row by row (see the top). */
export type ColorMatrix = readonly number[];

export const IDENTITY_MATRIX: ColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/** `a` applied AFTER `b` (the product a * b of the 5x5 matrices). */
export function multiplyMatrices(a: ColorMatrix, b: ColorMatrix): number[] {
  const out = new Array<number>(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[row * 5 + k] * b[k * 5 + col];
      if (col === 4) sum += a[row * 5 + 4]; // the implicit last row of b is [0 0 0 0 1]
      out[row * 5 + col] = sum;
    }
  }
  return out;
}

// Luminance weights of SVG's saturate matrix.
const LR = 0.213;
const LG = 0.715;
const LB = 0.072;

/** s = 1 leaves colours alone, 0 is black and white, 2 is twice as colourful. */
export function saturateMatrix(s: number): number[] {
  return [
    LR + (1 - LR) * s, LG - LG * s, LB - LB * s, 0, 0,
    LR - LR * s, LG + (1 - LG) * s, LB - LB * s, 0, 0,
    LR - LR * s, LG - LG * s, LB + (1 - LB) * s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** f = 1 leaves contrast alone; the channels are stretched around mid-grey. */
export function contrastMatrix(f: number): number[] {
  const o = 0.5 * (1 - f);
  return [
    f, 0, 0, 0, o,
    0, f, 0, 0, o,
    0, 0, f, 0, o,
    0, 0, 0, 1, 0,
  ];
}

/** `offset` (-1..1) is added to every channel (-1 = 255 levels darker). */
export function brightnessMatrix(offset: number): number[] {
  return [
    1, 0, 0, 0, offset,
    0, 1, 0, 0, offset,
    0, 0, 1, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

const SEPIA: ColorMatrix = [
  0.393, 0.769, 0.189, 0, 0,
  0.349, 0.686, 0.168, 0, 0,
  0.272, 0.534, 0.131, 0, 0,
  0, 0, 0, 1, 0,
];

/** Scales the three channels separately and adds an offset to each (warm / cool tints). */
function tintMatrix(r: number, g: number, b: number, offset: number): number[] {
  return [
    r, 0, 0, 0, offset,
    0, g, 0, 0, offset,
    0, 0, b, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

/** The matrix of each preset (see FilterPreset). */
export function presetMatrix(preset: FilterPreset): number[] {
  switch (preset) {
    case "grayscale":
      return saturateMatrix(0);
    case "sepia":
      return [...SEPIA];
    case "vivid":
      return multiplyMatrices(contrastMatrix(1.1), saturateMatrix(1.4));
    case "fade":
      return multiplyMatrices(brightnessMatrix(0.06), multiplyMatrices(contrastMatrix(0.82), saturateMatrix(0.75)));
    case "warm":
      return tintMatrix(1.08, 1.0, 0.9, 0.01);
    case "cool":
      return tintMatrix(0.92, 1.0, 1.1, 0.01);
    case "dramatic":
      return multiplyMatrices(brightnessMatrix(-0.04), multiplyMatrices(contrastMatrix(1.35), saturateMatrix(0.8)));
  }
}

/**
 * The single matrix of a filter. Order of application: the PRESET first (the
 * "look"), then saturation, contrast and brightness — so the sliders still do
 * something on top of any preset (a brightness slider on "sepia" brightens the
 * sepia picture), and brightness, which is additive, comes last.
 */
export function filterToMatrix(filter: ResolvedFilter): number[] {
  const saturation = 1 + filter.saturation / FILTER_LIMIT; // 0..2
  const contrast = 1 + filter.contrast / FILTER_LIMIT; // 0..2
  const brightness = filter.brightness / FILTER_LIMIT; // -1..1
  let m: number[] = filter.preset ? presetMatrix(filter.preset) : [...IDENTITY_MATRIX];
  if (filter.saturation !== 0) m = multiplyMatrices(saturateMatrix(saturation), m);
  if (filter.contrast !== 0) m = multiplyMatrices(contrastMatrix(contrast), m);
  if (filter.brightness !== 0) m = multiplyMatrices(brightnessMatrix(brightness), m);
  return m;
}

/**
 * Applies a matrix to RGBA pixel data (0..255), in place. Alpha is untouched:
 * a transparent pixel stays transparent. Values are clamped to 0..255 (a
 * Uint8ClampedArray does it by itself; a plain array is clamped here).
 */
export function applyColorMatrix(data: Uint8ClampedArray | number[], matrix: ColorMatrix): void {
  const [a, b, c, , e, f, g, h, , j, k, l, m, , o] = matrix;
  const oe = e * 255;
  const oj = j * 255;
  const oo = o * 255;
  const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const gr = data[i + 1];
    const bl = data[i + 2];
    data[i] = clamp(a * r + b * gr + c * bl + oe);
    data[i + 1] = clamp(f * r + g * gr + h * bl + oj);
    data[i + 2] = clamp(k * r + l * gr + m * bl + oo);
  }
}

/** Stable text for a filter: two equal filters give equal keys (memo / cache key). */
export function filterKey(filter: ResolvedFilter | null): string {
  return filter ? `${filter.preset ?? "-"}|${filter.brightness}|${filter.contrast}|${filter.saturation}` : "";
}

// ------------------------------- the DOM part -------------------------------

/** The longest side, in pixels, of a filtered copy (keeps big photos fast to filter). */
export const MAX_FILTER_SIDE = 2560;

export interface FilterSource {
  /** An <img> (or anything canvas.drawImage accepts). */
  image: CanvasImageSource;
  /** The visible part, in the source's pixels. */
  crop: { x: number; y: number; width: number; height: number };
}

/** Size of the filtered copy: the crop's size, scaled down so no side exceeds `maxSide`. */
export function filteredSize(
  cropWidth: number,
  cropHeight: number,
  maxSide: number = MAX_FILTER_SIDE
): { width: number; height: number } {
  const longest = Math.max(cropWidth, cropHeight, 1);
  const scale = Math.min(1, maxSide / longest);
  return {
    width: Math.max(1, Math.round(cropWidth * scale)),
    height: Math.max(1, Math.round(cropHeight * scale)),
  };
}

/**
 * Draws the visible part of a picture onto a new canvas and applies the filter
 * to it. The result replaces the picture (with no crop of its own) when the
 * element is drawn. Returns null when the browser refuses to read the pixels
 * back — the picture is cross-origin without CORS (a "tainted" canvas) — and
 * the caller then shows the picture unfiltered.
 */
export function filterPicture(source: FilterSource, filter: ResolvedFilter): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const { width, height } = filteredSize(source.crop.width, source.crop.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(
      source.image,
      source.crop.x,
      source.crop.y,
      source.crop.width,
      source.crop.height,
      0,
      0,
      width,
      height
    );
    const pixels = context.getImageData(0, 0, width, height);
    applyColorMatrix(pixels.data, filterToMatrix(filter));
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    return null; // SecurityError (tainted canvas), or the picture is not drawable
  }
}
