// ---------------------------------------------------------------------------
// Core document schema for the canvas editor.
// This is the exact shape that gets serialized to/from JSON.
// ---------------------------------------------------------------------------

export type ElementType = "text" | "shape" | "image";
export type ShapeKind = "rect" | "circle";
export type TextAlign = "left" | "center" | "right";

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
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shapeType: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

// Reserved for a future version (image upload is explicitly out of scope
// for this MVP, but the shape is defined so the schema doesn't need to
// break later).
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

// The full exported document. `version` lets loadFromJSON reject/upgrade
// files from incompatible future schema changes.
export interface CanvasDocument {
  version: 1;
  canvas: CanvasMeta;
  elements: CanvasElement[];
}
