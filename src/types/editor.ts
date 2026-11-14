// ---------------------------------------------------------------------------
// Core document schema for the canvas editor ("native KusukaEdit" format).
// This is the exact shape that gets serialized to/from JSON.
//
// Coordinate model (identical for every element type):
//   - (x, y) is the TOP-LEFT corner of the element's bounding box
//   - rotation is in degrees, clockwise, around that top-left corner
//   - zIndex: higher = drawn on top
// ---------------------------------------------------------------------------

export type ElementType = "text" | "shape" | "image";
export type ShapeKind = "rect" | "circle";
export type TextAlign = "left" | "center" | "right" | "justify";
export type TextFontStyle = "normal" | "bold" | "italic" | "bold italic";
/** Lines drawn through the text; Konva and Polotno both accept these strings. */
export type TextDecoration = "underline" | "line-through" | "underline line-through";
/** Display-only case change: the stored `text` keeps what the user typed. */
export type TextTransform = "uppercase" | "lowercase";
/** Every paragraph (line typed with Enter) gets a bullet or a number in front. */
export type TextListType = "bullet" | "number";

/**
 * Schema version written by exportToJSON().
 *   v1: circles were stored by their CENTER point (a quirk of Konva's Circle).
 *   v2: every element, circles included, is stored by its top-left corner.
 *   v3: a document is a list of PAGES (`pages`), each with its own canvas and
 *       elements; v1/v2 files had a single `canvas` + `elements`.
 *   v4: opacity and drop shadow on EVERY element type (they were picture-only),
 *       a border (stroke) on text, and the text options of the Polotno-style
 *       toolbar: justify, underline / strike-through, letter spacing, upper /
 *       lower case, bullet / numbered lists and auto-fit. All new fields are
 *       optional, so a v3 file is a valid v4 file as it is.
 *   v5: blur and colour filter on EVERY element type (they were picture-only),
 *       a dash pattern for borders (`dash`), and two text effects: a background
 *       box behind the text (background*) and curved text (curve*). All new
 *       fields are optional again: a v4 file is a valid v5 file.
 *   v6: a border around a text's background box (borderColor / borderSize,
 *       Polotno's names), and `polotno`: the Polotno properties of an imported
 *       element / page / document that this editor does not use, kept as they
 *       were so an export gives them back (lossless round trip). Optional
 *       again: a v5 file is a valid v6 file.
 * Files with an older `version` are migrated automatically on load (a v1/v2
 * file becomes a one-page document).
 */
export const SCHEMA_VERSION = 6 as const;

/** The last schema in which a document was ONE canvas (`canvas` + `elements`). */
export const LAST_SINGLE_PAGE_SCHEMA = 2 as const;

export const DEFAULT_FONT_FAMILY = "Inter, sans-serif";

export const DEFAULT_CANVAS: CanvasMeta = {
  width: 900,
  height: 600,
  backgroundColor: "#ffffff",
};

interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  zIndex: number;

  // ---- Effects shared by every element type (all optional) -----------------
  // Polotno: opacity, shadowEnabled + shadowColor / shadowBlur / shadowOffsetX /
  // shadowOffsetY / shadowOpacity. Lengths are in design pixels.

  /** 0..1 for the whole element. Absent = 1 (fully opaque). */
  opacity?: number;
  /** Drop-shadow colour (#rrggbb). Absent = no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  /** 0..1, multiplied into the shadow colour. Absent = 1. */
  shadowOpacity?: number;

  // ---- Blur and colour filter (v5: every element type; were picture-only) ---
  // Polotno: blurEnabled + blurRadius, brightnessEnabled + brightness,
  // sepiaEnabled / grayscaleEnabled, filters.contrast / .saturation.

  /** Gaussian-style blur of the whole element, in design px. 0 / absent = sharp. */
  blurRadius?: number;
  /** -100..100, 0 = unchanged. Added to every channel (Polotno: brightness x100). */
  brightness?: number;
  /** -100..100, 0 = unchanged. Stretches the channels around mid-grey. */
  contrast?: number;
  /** -100..100, 0 = unchanged, -100 = black and white, +100 = twice as colourful. */
  saturation?: number;
  /** A ready-made look, applied together with the three sliders above. Absent = none. */
  filterPreset?: FilterPreset;

  /**
   * Dash pattern of the border (stroke), in design px: [dash, gap, dash, gap ...],
   * e.g. [10, 5]. Absent / empty = a solid line. Drawn only where the element
   * has a border (a shape's stroke, a text outline, a picture's border).
   */
  dash?: number[];

  /**
   * Polotno properties of an imported element that this editor does not use
   * (name, locks, verticalAlign, animations, blendMode, its own `custom` keys
   * ...), kept untouched and written back on export, so a Polotno file comes
   * back from a round trip as it was. Absent for elements made here.
   */
  polotno?: Record<string, unknown>;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  align: TextAlign;
  fontStyle: TextFontStyle;
  /** Multiplier of fontSize (1.2 = 120%). */
  lineHeight: number;
  /**
   * Extra pixels that were ADDED to `width` when this text was imported from
   * a Polotno file, so that a short word ("SALE") is not pushed onto a second
   * line when this browser's font is a little wider than Polotno's. Absent
   * (or 0) for everything else. Exporting to Polotno subtracts it again, so
   * a Polotno file keeps its original width through an import/export cycle.
   * Resizing the box by hand sets it to 0: the width the user chose is exact.
   */
  widthTolerance?: number;

  // ---- Toolbar options (all optional: absent = off / Konva's default) -------
  /** Outline of the letters (#rrggbb). Drawn only when strokeWidth > 0. */
  stroke?: string;
  strokeWidth?: number;
  textDecoration?: TextDecoration;
  /** Extra space between characters, as a FRACTION of fontSize (0.1 = 10%), like Polotno. */
  letterSpacing?: number;
  textTransform?: TextTransform;
  listType?: TextListType;
  /**
   * Auto-fit: the box keeps a fixed `height` (the user resizes it with every
   * handle) and the text is drawn with the largest font size, up to `fontSize`,
   * that fits it — no line taller than the box, no word wider than it. The
   * stored `fontSize` is the user's choice and never changes; only the drawn
   * size shrinks (see lib/textFit.ts).
   */
  autoFit?: boolean;

  // ---- Text background (Polotno: the same five fields) ----------------------
  /** A box of `backgroundColor` behind every line of text. Absent = off. */
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  /** 0..1 for the box only. Absent = 1. */
  backgroundOpacity?: number;
  /**
   * Corner radius and padding of the box, as Polotno stores them: a FRACTION of
   * half a line (fontSize x lineHeight x 0.5), so the box grows with the text.
   * Absent = 0.5 (Polotno's default).
   */
  backgroundCornerRadius?: number;
  backgroundPadding?: number;
  /**
   * Border of the background box (Polotno: borderColor / borderSize). Drawn
   * along the background boxes, or around the text box when the background
   * is off. Absent / 0 = none.
   */
  borderColor?: string;
  borderSize?: number;

  // ---- Curved text (Polotno: curveEnabled + curvePower) ---------------------
  /** The text is drawn on one circular arc. Absent = straight. */
  curveEnabled?: boolean;
  /** -1..1: how far the arc bends. > 0 arches up, < 0 bends down, 0 = straight. */
  curvePower?: number;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shapeType: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Only used by `rect`. */
  cornerRadius: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  /**
   * Where the picture comes from:
   *   blob:...   a picture uploaded in this session (temporary, in-memory)
   *   data:...   a picture embedded in an exported file
   *   https://   a picture linked from an imported (e.g. Polotno) file
   * `blob:` URLs are converted to `data:` URLs on export.
   */
  src: string;
  /**
   * The visible part of the picture, as FRACTIONS (0..1) of its natural size:
   * (cropX, cropY) is the top-left corner, (cropWidth, cropHeight) the size.
   * 0, 0, 1, 1 shows the whole picture stretched over the element's box.
   * Imported Polotno images use this to fill a frame without distortion.
   */
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  /**
   * Mirroring. -1 flips the picture horizontally (scaleX) or vertically
   * (scaleY) INSIDE its box: the box itself — (x, y), width, height — does
   * not move, so a flipped picture stays exactly where it was. 1 = not flipped.
   * (ElementRenderer mirrors the picture while drawing it; the element's x/y
   * always stay the top-left corner of what is visible.) Only the SIGN is
   * stored: the size lives in width/height. Files written before this field
   * existed have no flip: both default to 1.
   */
  scaleX: 1 | -1;
  scaleY: 1 | -1;
  /**
   * True for a vector picture (an SVG, e.g. an icon): `src` is an SVG URL or
   * data URI. It is drawn like any other picture, and written back to Polotno
   * as an `svg` element instead of an `image`.
   */
  vector?: boolean;

  // ---- Visual effects (all optional: absent = no effect) -------------------
  // They are what Polotno calls borderSize / borderColor and clipSrc. Every
  // length is in design pixels. Opacity, drop shadow, blur, the colour filter
  // and the dash are shared with every element type (see BaseElement).

  /** Border colour (#rrggbb), drawn over the picture along the box or the mask outline. */
  stroke?: string;
  /** Border thickness; 0 / absent = no border. */
  strokeWidth?: number;
  /**
   * Cuts the picture to a shape that is fitted into the element's box: a circle
   * (an ellipse when the box is not square) or a triangle (apex at the top
   * centre). Absent = the plain rectangle.
   */
  maskShape?: MaskShape;
  /**
   * Rounded corners of the picture's box, in design pixels (Polotno: cornerRadius).
   * Ignored while a `maskShape` is set (a circle or triangle has no corners to
   * round). Absent / 0 = square corners.
   */
  cornerRadius?: number;
}

/** The masks a picture can be cut to. */
export type MaskShape = "circle" | "triangle";

/** The filter presets of the image panel (see lib/imageFilters.ts for what each one does). */
export type FilterPreset = "grayscale" | "sepia" | "vivid" | "fade" | "warm" | "cool" | "dramatic";

export type CanvasElement = TextElement | ShapeElement | ImageElement;

export interface CanvasMeta {
  width: number;
  height: number;
  backgroundColor: string;
}

/**
 * One page of the document: its own working area (size + background) and the
 * elements drawn on it. Pages are independent — an element belongs to exactly
 * one page, and a page may be a different size from its neighbours.
 */
export interface Page {
  id: string;
  canvas: CanvasMeta;
  elements: CanvasElement[];
  /** Unused Polotno page properties (bleed, duration, custom ...), written back on export. */
  polotno?: Record<string, unknown>;
}

// The full exported document. `version` lets loadFromJSON migrate or reject
// files written by a different schema version. A document always has at
// least one page.
export interface CanvasDocument {
  version: typeof SCHEMA_VERSION;
  pages: Page[];
  /** Unused Polotno document properties (schemaVersion, fonts, audios, unit, dpi, custom ...). */
  polotno?: Record<string, unknown>;
}
