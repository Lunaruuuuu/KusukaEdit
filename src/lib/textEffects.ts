// ---------------------------------------------------------------------------
// v5 effects that are not picture effects: the dash pattern of a border, the
// background box behind a text, and curved text. Pure geometry and validation:
// no React, no Konva, no DOM, so everything here runs in plain Node tests.
//
// Polotno compatibility (checked against Polotno's compiled canvas code):
//   - text background: padding and corner radius are FRACTIONS of half a line,
//       px = value x fontSize x lineHeight x 0.5
//   - figure dash: Polotno multiplies every entry by the stroke width it draws
//       with, F = min(strokeWidth, width / 2, height / 2). This editor stores
//       the dash in design px (what Konva draws), so the adapter divides /
//       multiplies by F (see dashToPolotno / dashFromPolotno).
//   - curved text: Polotno computes its arc in a module that is not published
//       in readable form; the arc below is this editor's own (see curveLayout).
// ---------------------------------------------------------------------------

import type { TextElement } from "@/types/editor";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

// --------------------------------- dash -------------------------------------

export const MAX_DASH_ENTRIES = 8;
export const MAX_DASH_LENGTH = 1000;

/** The dash patterns offered by the toolbar (design px, scaled by the border width there). */
export const DASH_PRESETS: ReadonlyArray<{ id: string; label: string; pattern: number[] | null }> = [
  { id: "solid", label: "Utuh", pattern: null },
  { id: "dashed", label: "Putus-putus", pattern: [10, 5] },
  { id: "long", label: "Garis panjang", pattern: [20, 8] },
  { id: "dotted", label: "Titik-titik", pattern: [2, 4] },
];

/**
 * A usable dash pattern, or null for a solid line: an array of 1..8 finite,
 * non-negative numbers that are not all 0 (an all-zero dash draws nothing in
 * some browsers). Each entry is clamped to MAX_DASH_LENGTH.
 */
export function sanitizeDash(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DASH_ENTRIES) return null;
  if (!value.every((v) => finite(v) && v >= 0)) return null;
  const dash = (value as number[]).map((v) => round4(clamp(v, 0, MAX_DASH_LENGTH)));
  return dash.some((v) => v > 0) ? dash : null;
}

/** Polotno's dash unit for a figure: the stroke width it draws with. */
export function polotnoDashUnit(strokeWidth: number, width: number, height: number): number {
  return Math.min(strokeWidth, width / 2, height / 2);
}

/** Native (px) -> Polotno figure dash (multiples of the stroke unit). [] when solid or unitless. */
export function dashToPolotno(dash: unknown, unit: number): number[] {
  const d = sanitizeDash(dash);
  if (!d || !(unit > 0)) return [];
  return d.map((v) => round4(v / unit));
}

/** Polotno figure dash (multiples of the stroke unit) -> native px, or null for solid. */
export function dashFromPolotno(dash: unknown, unit: number): number[] | null {
  const d = sanitizeDash(dash);
  if (!d || !(unit > 0)) return null;
  return sanitizeDash(d.map((v) => v * unit));
}

// --------------------------- text background -------------------------------

export const POLOTNO_BACKGROUND_COLOR = "#7ED321";
export const DEFAULT_BACKGROUND_PADDING = 0.5;
export const DEFAULT_BACKGROUND_RADIUS = 0.5;
export const MAX_BACKGROUND_FRACTION = 4;

export interface ResolvedTextBackground {
  color: string;
  opacity: number;
  /** In design px (already multiplied by half a line). */
  padding: number;
  cornerRadius: number;
}

type BackgroundFields = Pick<
  TextElement,
  "backgroundEnabled" | "backgroundColor" | "backgroundOpacity" | "backgroundCornerRadius" | "backgroundPadding"
>;

/**
 * The box behind a text, in px, or null when there is none to see. `fontSize`
 * is the size the text is DRAWN with (an auto-fit text may be smaller than
 * its stored size), so the box follows the visible letters.
 */
export function resolveTextBackground(
  el: BackgroundFields,
  fontSize: number,
  lineHeight: number
): ResolvedTextBackground | null {
  if (el.backgroundEnabled !== true) return null;
  const color = typeof el.backgroundColor === "string" && el.backgroundColor !== "" ? el.backgroundColor : POLOTNO_BACKGROUND_COLOR;
  if (color.trim().toLowerCase() === "transparent") return null;
  const opacity = finite(el.backgroundOpacity) ? clamp(el.backgroundOpacity, 0, 1) : 1;
  if (opacity <= 0) return null;
  const halfLine = Math.max(0, fontSize) * Math.max(0, lineHeight) * 0.5;
  const fraction = (v: unknown, fallback: number) => (finite(v) ? clamp(v, 0, MAX_BACKGROUND_FRACTION) : fallback);
  return {
    color,
    opacity,
    padding: fraction(el.backgroundPadding, DEFAULT_BACKGROUND_PADDING) * halfLine,
    cornerRadius: fraction(el.backgroundCornerRadius, DEFAULT_BACKGROUND_RADIUS) * halfLine,
  };
}

/**
 * The border of the background box (Polotno: borderColor / borderSize), or
 * null. Drawn along the background boxes, or, with the background off, around
 * the whole text box.
 */
export function resolveTextBorder(el: Pick<TextElement, "borderColor" | "borderSize">): { color: string; width: number } | null {
  if (!finite(el.borderSize) || el.borderSize <= 0) return null;
  const color = typeof el.borderColor === "string" && el.borderColor !== "" ? el.borderColor : "#000000";
  if (color.trim().toLowerCase() === "transparent") return null;
  return { color, width: clamp(el.borderSize, 0, 100) };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One box per laid-out line, hugging that line's text (so a short last line
 * gets a short box), grown by `padding` on every side. Lines are as Konva
 * lays them out: `lineWidths[i]` px wide, `lineHeightPx` apart, placed in a
 * box `boxWidth` wide by `align`. An empty line gets no box. Justified lines
 * fill the width, except the last one.
 */
export function backgroundLineBoxes(options: {
  lineWidths: readonly number[];
  lineHeightPx: number;
  boxWidth: number;
  align: TextElement["align"];
  padding: number;
}): Box[] {
  const { lineWidths, lineHeightPx, boxWidth, align, padding } = options;
  const boxes: Box[] = [];
  lineWidths.forEach((raw, i) => {
    const isLast = i === lineWidths.length - 1;
    const width = align === "justify" && !isLast && raw > 0 ? boxWidth : Math.min(raw, boxWidth);
    if (!(width > 0)) return;
    const left = align === "center" ? (boxWidth - width) / 2 : align === "right" ? boxWidth - width : 0;
    boxes.push({
      x: left - padding,
      y: i * lineHeightPx - padding,
      width: width + 2 * padding,
      height: lineHeightPx + 2 * padding,
    });
  });
  return boxes;
}

/** The radius actually drawable on a box (never more than half its shorter side). */
export function fitRadius(radius: number, box: Box): number {
  return Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
}

// ------------------------------- curved text --------------------------------

/** Below this |curvePower| the text is simply drawn straight. */
export const MIN_CURVE_POWER = 0.01;
/** The largest arc: a little less than a full circle, so both ends never meet. */
export const MAX_CURVE_SWEEP = Math.PI * 1.9;

export interface CurveLayout {
  /** SVG path data of the arc (for Konva.TextPath), in the element's own coordinates. */
  path: string;
  radius: number;
  /** Angle the arc spans, in radians. */
  sweep: number;
  /** Height of the element: the arc's rise plus one line of text. */
  height: number;
  /** Width the arc takes (its chord, or the full circle's width beyond a half circle). */
  span: number;
  /** True when the arc arches up (power > 0). */
  up: boolean;
}

/** |curvePower| -> how much of a circle the text covers (power 1 = MAX_CURVE_SWEEP). */
export function curveSweep(power: number): number {
  return clamp(Math.abs(power), 0, 1) * MAX_CURVE_SWEEP;
}

/** Whether a text is drawn curved at all. */
export function isCurved(el: Pick<TextElement, "curveEnabled" | "curvePower">): boolean {
  return el.curveEnabled === true && finite(el.curvePower) && Math.abs(el.curvePower) >= MIN_CURVE_POWER;
}

const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);

/**
 * The arc a curved text is written along. The text (`textWidth` px long, as
 * measured) is centred on the arc (see curveArcLength), which is centred in a box `boxWidth`
 * wide. Power > 0 arches up (a rainbow: the middle of the text is highest),
 * power < 0 bends down (a smile). The letters' middle line lies on the arc,
 * half a font size from the top (arch) or the bottom (smile) of the element.
 */
/**
 * Length of the arc for a text `textWidth` px wide. Konva.TextPath measures
 * letter by letter (no kerning between them), which comes out a few percent
 * longer than the measured line, and it DROPS the letters that do not fit on
 * the path — so the arc gets some slack; the text is centred on it.
 */
export function curveArcLength(textWidth: number, fontSize: number): number {
  return Math.max(1, textWidth) * 1.08 + Math.max(0, fontSize) * 0.5;
}

export function curveLayout(textWidth: number, fontSize: number, power: number, boxWidth: number): CurveLayout {
  const sweep = Math.max(curveSweep(power), 1e-3);
  const length = curveArcLength(textWidth, fontSize);
  const radius = length / sweep;
  const half = sweep / 2;
  const rise = radius * (1 - Math.cos(half));
  const span = half >= Math.PI / 2 ? 2 * radius : 2 * radius * Math.sin(half);
  const height = rise + fontSize;
  const cx = boxWidth / 2;
  const up = power > 0;
  const large = sweep > Math.PI ? 1 : 0;

  let start: [number, number];
  let end: [number, number];
  let sweepFlag: 0 | 1;
  if (up) {
    // centre below the top of the arc; from upper-left to upper-right, clockwise
    const cy = fontSize / 2 + radius;
    const a0 = -Math.PI / 2 - half;
    const a1 = -Math.PI / 2 + half;
    start = [cx + radius * Math.cos(a0), cy + radius * Math.sin(a0)];
    end = [cx + radius * Math.cos(a1), cy + radius * Math.sin(a1)];
    sweepFlag = 1;
  } else {
    // centre above the bottom of the arc; from lower-left to lower-right, counter-clockwise
    const cy = height - fontSize / 2 - radius;
    const a0 = Math.PI / 2 + half;
    const a1 = Math.PI / 2 - half;
    start = [cx + radius * Math.cos(a0), cy + radius * Math.sin(a0)];
    end = [cx + radius * Math.cos(a1), cy + radius * Math.sin(a1)];
    sweepFlag = 0;
  }
  const path = `M ${fmt(start[0])} ${fmt(start[1])} A ${fmt(radius)} ${fmt(radius)} 0 ${large} ${sweepFlag} ${fmt(end[0])} ${fmt(end[1])}`;
  return { path, radius, sweep, height, span, up };
}

/** A curved text is one line: the paragraphs are joined with a space. */
export function curveText(shown: string): string {
  return shown.split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
}
