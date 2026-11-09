// ---------------------------------------------------------------------------
// The text options of the Polotno-style toolbar: underline / strike-through,
// letter spacing, upper / lower case, bullet / numbered lists, auto-fit and the
// letter outline (stroke). How they are read from a file (native or Polotno),
// and how they turn the stored text into the string Konva draws. Pure: no
// React, no Konva, no store.
// ---------------------------------------------------------------------------

import type { TextDecoration, TextElement, TextListType, TextTransform } from "@/types/editor";
import { parseColor } from "@/lib/color";
import { MAX_STROKE_WIDTH } from "@/lib/imageEffects";
import { MAX_BACKGROUND_FRACTION, POLOTNO_BACKGROUND_COLOR } from "@/lib/textEffects";

/** Letter spacing is a fraction of the font size; beyond these it is unreadable. */
export const MIN_LETTER_SPACING = -0.2;
export const MAX_LETTER_SPACING = 1;

export const TEXT_TRANSFORMS: readonly TextTransform[] = ["uppercase", "lowercase"];
export const TEXT_LIST_TYPES: readonly TextListType[] = ["bullet", "number"];

/** The optional text fields this module reads and writes. */
export type TextOptionFields = Pick<
  TextElement,
  | "stroke"
  | "strokeWidth"
  | "textDecoration"
  | "letterSpacing"
  | "textTransform"
  | "listType"
  | "autoFit"
  | "backgroundEnabled"
  | "backgroundColor"
  | "backgroundOpacity"
  | "backgroundCornerRadius"
  | "backgroundPadding"
  | "curveEnabled"
  | "curvePower"
>;

type Rec = Record<string, unknown>;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

function num(value: unknown, fallback: number): number {
  if (finite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

/**
 * Any CSS-like decoration string -> the parts this editor draws, in a fixed
 * order (so "line-through underline" and "underline line-through" are equal).
 * null = no line.
 */
export function normalizeTextDecoration(value: unknown): TextDecoration | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase();
  const under = v.includes("underline");
  const through = v.includes("line-through");
  if (under && through) return "underline line-through";
  if (under) return "underline";
  if (through) return "line-through";
  return null;
}

/** Switches one line (underline or strike-through) on or off, keeping the other. */
export function toggleTextDecoration(
  current: TextDecoration | undefined,
  part: "underline" | "line-through"
): TextDecoration | undefined {
  const parts = new Set((current ?? "").split(" ").filter(Boolean));
  if (parts.has(part)) parts.delete(part);
  else parts.add(part);
  return normalizeTextDecoration(Array.from(parts).join(" ")) ?? undefined;
}

/** True when the decoration string has a part that is not underline / line-through (e.g. "overline"). */
export function hasUnknownDecoration(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value
    .toLowerCase()
    .split(/\s+/)
    .some((part) => part !== "" && part !== "none" && part !== "underline" && part !== "line-through");
}

/**
 * Reads the optional text options of an element. Native files store every
 * option at the top level; a Polotno file stores the ones Polotno has
 * (stroke, strokeWidth, textDecoration, letterSpacing, textTransform) there
 * too, and the two it has no field for (listType, autoFit) in `custom`, where
 * this editor writes them. Anything unusable is left out.
 */
export function readTextOptions(raw: Rec, source: "native" | "polotno", color: (value: unknown) => string | null = parseColor): Partial<TextOptionFields> {
  const fields: Partial<TextOptionFields> = {};

  const strokeWidth = num(raw.strokeWidth, 0);
  if (strokeWidth > 0) {
    // Polotno's default text stroke is black.
    const stroke = color(raw.stroke === undefined ? "#000000" : raw.stroke);
    if (stroke !== null && stroke !== "transparent") {
      fields.stroke = stroke;
      fields.strokeWidth = clamp(strokeWidth, 0, MAX_STROKE_WIDTH);
    }
  }

  const decoration = normalizeTextDecoration(raw.textDecoration);
  if (decoration) fields.textDecoration = decoration;

  const spacing = num(raw.letterSpacing, 0);
  if (spacing !== 0) fields.letterSpacing = round4(clamp(spacing, MIN_LETTER_SPACING, MAX_LETTER_SPACING));

  if (TEXT_TRANSFORMS.includes(raw.textTransform as TextTransform)) {
    fields.textTransform = raw.textTransform as TextTransform;
  }

  const extra: Rec = source === "native" ? raw : typeof raw.custom === "object" && raw.custom !== null ? (raw.custom as Rec) : {};
  if (TEXT_LIST_TYPES.includes(extra.listType as TextListType)) fields.listType = extra.listType as TextListType;
  if (extra.autoFit === true) fields.autoFit = true;

  // Text background and curve: Polotno and native files use the same names, at
  // the top level. Only read when switched on (Polotno's defaults are present
  // in files where they are off).
  if (raw.backgroundEnabled === true) {
    const bg = color(raw.backgroundColor === undefined ? POLOTNO_BACKGROUND_COLOR : raw.backgroundColor);
    if (bg !== null) {
      fields.backgroundEnabled = true;
      fields.backgroundColor = bg;
      const opacity = num(raw.backgroundOpacity, 1);
      if (opacity < 1) fields.backgroundOpacity = round4(clamp(opacity, 0, 1));
      // Absent = Polotno's default (0.5), so only a value given in the file is kept.
      if (raw.backgroundCornerRadius !== undefined) {
        fields.backgroundCornerRadius = round4(clamp(num(raw.backgroundCornerRadius, 0.5), 0, MAX_BACKGROUND_FRACTION));
      }
      if (raw.backgroundPadding !== undefined) {
        fields.backgroundPadding = round4(clamp(num(raw.backgroundPadding, 0.5), 0, MAX_BACKGROUND_FRACTION));
      }
    }
  }
  if (raw.curveEnabled === true) {
    fields.curveEnabled = true;
    // Polotno's default power is 0.5.
    fields.curvePower = round4(clamp(num(raw.curvePower, 0.5), -1, 1));
  }
  return fields;
}

/** The text with its case changed for display (the stored text keeps the user's case). */
export function applyTextTransform(text: string, transform: TextTransform | undefined): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  return text;
}

/** The marker drawn in front of paragraph `index` (0-based). */
export function listMarker(listType: TextListType, index: number): string {
  return listType === "bullet" ? "•  " : `${index + 1}.  `;
}

/**
 * The string Konva draws: case changed, and every paragraph (a line typed with
 * Enter) prefixed with its bullet or number. Empty lines get no marker and do
 * not advance the numbering. A paragraph that wraps continues under the marker
 * (Konva has no hanging indent).
 */
export function displayText(el: Pick<TextElement, "text" | "textTransform" | "listType">): string {
  const text = applyTextTransform(el.text, el.textTransform);
  if (!el.listType) return text;
  let n = 0;
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? line : listMarker(el.listType!, n++) + line))
    .join("\n");
}
