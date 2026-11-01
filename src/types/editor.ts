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
 * Files with `version: 1` are migrated automatically on load.
 */
export const SCHEMA_VERSION = 2 as const;

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
}

export type CanvasElement = TextElement | ShapeElement | ImageElement;

export interface CanvasMeta {
  width: number;
  height: number;
  backgroundColor: string;
}

// The full exported document. `version` lets loadFromJSON migrate or reject
// files written by a different schema version.
export interface CanvasDocument {
  version: typeof SCHEMA_VERSION;
  canvas: CanvasMeta;
  elements: CanvasElement[];
}
