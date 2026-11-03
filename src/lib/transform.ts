// ---------------------------------------------------------------------------
// Turning a Konva transform (the node's position, rotation and scale after the
// Transformer let go) into element fields. Konva scales a node instead of
// changing its size; the scale is "baked" into width / height (and, for text
// scaled by a corner, the font size) and the node goes back to scale 1.
//
// Pure: the node's numbers are passed in, so one function serves a single
// element and every element of a multiple selection, and runs in plain Node.
// ---------------------------------------------------------------------------

import type { CanvasElement } from "@/types/editor";

export interface NodeTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export const MIN_TEXT_WIDTH = 20;
export const MIN_SHAPE_SIZE = 5;
const MIN_FONT_SIZE = 1;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The element fields for a node that ends a transform with these numbers. */
export function bakeTransform(el: CanvasElement, t: NodeTransform): Partial<CanvasElement> {
  // (A mirrored picture is mirrored inside its drawing, so its node never has
  // a negative scale; Math.abs is just a guard.)
  const sx = Math.abs(t.scaleX);
  const sy = Math.abs(t.scaleY);
  const base = { x: t.x, y: t.y, rotation: t.rotation };

  if (el.type === "text") {
    // The width is now one the user chose: exact, with no import tolerance.
    const tolerance = el.widthTolerance ? { widthTolerance: 0 } : {};
    if (el.autoFit) {
      // An auto-fit box has a fixed height the user resizes; the font follows by itself.
      return {
        ...base,
        width: Math.max(MIN_TEXT_WIDTH, el.width * sx),
        height: Math.max(MIN_SHAPE_SIZE, el.height * sy),
        ...tolerance,
      };
    }
    // A plain text box is resized by its side handles (width only; the height
    // follows the wrapped text). Scaled evenly — a corner of a multiple
    // selection — the letters grow with it, as in Polotno.
    const even = Math.abs(sx - sy) < 1e-3 && Math.abs(sx - 1) > 1e-3;
    return {
      ...base,
      width: Math.max(MIN_TEXT_WIDTH, el.width * sx),
      ...(even ? { fontSize: Math.max(MIN_FONT_SIZE, round2(el.fontSize * sx)) } : {}),
      ...tolerance,
    };
  }

  if (el.type === "image") {
    // Pictures are only scaled proportionally. The new height is derived from
    // the new width and the box's own aspect ratio, so the picture can never
    // drift out of proportion through rounding.
    const width = Math.max(MIN_SHAPE_SIZE, el.width * sx);
    const aspect = el.width > 0 ? el.height / el.width : 1;
    return { ...base, width, height: width * aspect };
  }

  return {
    ...base,
    width: Math.max(MIN_SHAPE_SIZE, el.width * sx),
    height: Math.max(MIN_SHAPE_SIZE, el.height * sy),
  };
}
