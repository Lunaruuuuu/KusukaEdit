// ---------------------------------------------------------------------------
// Auto-fit ("auto-shrink") of a text box: the largest font size, up to the one
// the user chose, at which the text fits its box — every line inside the
// height, and no word wider than the width (Konva would otherwise break the
// word in the middle, letter by letter).
//
// The measuring is passed in (MeasureText), so the wrapping and the search run
// and are tested in plain Node. In the browser ElementRenderer measures with a
// Konva.Text node (measureSize, i.e. the canvas' measureText with the node's
// own font string); see makeKonvaMeasure there.
// ---------------------------------------------------------------------------

/** Width, in px, of `text` drawn at `fontSize` (letter spacing included). */
export type MeasureText = (text: string, fontSize: number) => number;

export interface FitBox {
  /** The text exactly as drawn (case changed, list markers added). */
  text: string;
  width: number;
  height: number;
  /** The user's font size: the largest size the fit may use. */
  fontSize: number;
  /** Multiplier of the font size, as in TextElement. */
  lineHeight: number;
}

/** Below this the text is unreadable anyway; the fit stops here even if it still overflows. */
export const MIN_FIT_FONT_SIZE = 4;
/** Fitted sizes are multiples of this (keeps the result stable while typing). */
const FIT_STEP = 0.5;
/** A little slack for the rounding of measured widths. */
const EPSILON = 0.01;

/**
 * Word wrap the way Konva does it for `wrap: "word"`: paragraphs split on
 * "\n", words added to a line while the line still fits `width`. A single word
 * wider than `width` is kept whole on its own line and reported in `overflow`.
 */
export function wrapLines(
  text: string,
  width: number,
  fontSize: number,
  measure: MeasureText
): { lines: string[]; overflow: boolean } {
  const lines: string[] = [];
  let overflow = false;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (line === "" || measure(candidate, fontSize) <= width + EPSILON) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
      if (measure(word, fontSize) > width + EPSILON) overflow = true;
    }
    lines.push(line);
  }
  return { lines, overflow };
}

/** True when the text, at `fontSize`, fits the box (height and width). */
export function textFits(box: FitBox, fontSize: number, measure: MeasureText): boolean {
  const { lines, overflow } = wrapLines(box.text, box.width, fontSize, measure);
  if (overflow) return false;
  return lines.length * fontSize * box.lineHeight <= box.height + EPSILON;
}

/**
 * The font size to draw an auto-fit text with: `box.fontSize` when the text
 * fits at that size, otherwise the largest smaller size (a multiple of 0.5)
 * that fits, but never below MIN_FIT_FONT_SIZE. Shrinking keeps the font, the
 * line height and the letter spacing in proportion — only the size changes.
 *
 * Binary search: a smaller font never needs more room, so "fits" is monotone.
 */
export function fitFontSize(box: FitBox, measure: MeasureText): number {
  const max = box.fontSize;
  if (!(max > 0) || !(box.width > 0) || !(box.height > 0)) return Math.max(max, 0);
  if (textFits(box, max, measure)) return max;
  const floorSize = Math.min(MIN_FIT_FONT_SIZE, max);
  let lo = Math.ceil(floorSize / FIT_STEP); // in steps
  let hi = Math.floor(max / FIT_STEP);
  if (hi * FIT_STEP >= max) hi -= 1; // `max` itself does not fit
  if (hi < lo || !textFits(box, lo * FIT_STEP, measure)) return floorSize;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textFits(box, mid * FIT_STEP, measure)) lo = mid;
    else hi = mid - 1;
  }
  return lo * FIT_STEP;
}

/**
 * The measurer for a font, built on any object with a canvas-like
 * `measureText` (a Konva.Text's measureSize is passed in the same shape).
 * Letter spacing is a fraction of the font size and is added between
 * characters, as Konva does.
 */
export function makeMeasure(
  measureAt: (text: string, fontSize: number) => number,
  letterSpacingEm = 0
): MeasureText {
  return (text, fontSize) => {
    const chars = Array.from(text).length;
    return measureAt(text, fontSize) + (chars > 1 ? letterSpacingEm * fontSize * (chars - 1) : 0);
  };
}
