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

// Reserved for a future version: images survive import/export so no data is
// lost, but the editor does not draw them yet (image upload is out of scope
// for this MVP).
export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
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
