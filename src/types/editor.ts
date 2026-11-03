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
export type TextAlign = "left" | "center" | "right";
export type TextFontStyle = "normal" | "bold" | "italic" | "bold italic";

/**
 * Schema version written by exportToJSON().
 *   v1: circles were stored by their CENTER point (a quirk of Konva's Circle).
 *   v2: every element, circles included, is stored by its top-left corner.
 *   v3: a document is a list of PAGES (`pages`), each with its own canvas and
 *       elements; v1/v2 files had a single `canvas` + `elements`.
 * Files with an older `version` are migrated automatically on load (a v1/v2
 * file becomes a one-page document).
 */
export const SCHEMA_VERSION = 3 as const;

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
  // They are what Polotno calls blurRadius, borderSize / borderColor,
  // shadowColor / shadowBlur / shadowOffsetX / shadowOffsetY / shadowOpacity and
  // clipSrc. Every length is in design pixels.

  /** Gaussian-style blur of the whole picture (Konva.Filters.Blur). 0 / absent = sharp. */
  blurRadius?: number;
  /** Border colour (#rrggbb), drawn over the picture along the box or the mask outline. */
  stroke?: string;
  /** Border thickness; 0 / absent = no border. */
  strokeWidth?: number;
  /** Drop-shadow colour (#rrggbb). Absent = no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  /** 0..1, multiplied into the shadow colour. Absent = 1. */
  shadowOpacity?: number;
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

  // ---- Colour filter (all optional: absent = the picture as it is) ---------
  /** -100..100, 0 = unchanged. Added to every channel (Konva's Brighten; Polotno: brightness x100). */
  brightness?: number;
  /** -100..100, 0 = unchanged. Stretches the channels around mid-grey. */
  contrast?: number;
  /** -100..100, 0 = unchanged, -100 = black and white, +100 = twice as colourful. */
  saturation?: number;
  /** A ready-made look, applied together with the three sliders above. Absent = none. */
  filterPreset?: FilterPreset;
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
}

// The full exported document. `version` lets loadFromJSON migrate or reject
// files written by a different schema version. A document always has at
// least one page.
export interface CanvasDocument {
  version: typeof SCHEMA_VERSION;
  pages: Page[];
}
