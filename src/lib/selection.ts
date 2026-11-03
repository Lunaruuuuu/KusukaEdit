// ---------------------------------------------------------------------------
// Marquee (drag-to-select) geometry. Pure: no Konva, no store.
//
// Every element is a box positioned by its TOP-LEFT corner and rotated around
// that corner (see types/editor.ts). The marquee is an axis-aligned rectangle
// in design pixels. An element is picked when its box and the marquee overlap
// at all (they "touch"), tested exactly with the separating axis theorem — a
// rotated element is not picked just because its bounding box is.
// ---------------------------------------------------------------------------

import type { Point } from "@/lib/dropImage";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotatedBox extends Rect {
  /** Degrees, clockwise, around (x, y). */
  rotation: number;
}

/** Drags shorter than this (in screen pixels) are a click, not a marquee. */
export const MARQUEE_MIN_DRAG = 3;

/** The rectangle spanned by two points, whichever way the pointer was dragged. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** The four corners of a box, rotated around its top-left corner. */
export function boxCorners(box: RotatedBox): Point[] {
  const rad = (box.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const at = (dx: number, dy: number): Point => ({ x: box.x + dx * cos - dy * sin, y: box.y + dx * sin + dy * cos });
  return [at(0, 0), at(box.width, 0), at(box.width, box.height), at(0, box.height)];
}

/** The axis-aligned bounds of a (possibly rotated) box. */
export function boxBounds(box: RotatedBox): Rect {
  const corners = boxCorners(box);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function project(points: Point[], axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const v = p.x * axis.x + p.y * axis.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/**
 * True when the rotated box and the axis-aligned rectangle overlap (touching
 * edges count). Two convex shapes are apart only if some edge normal separates
 * them: the two axes of the rectangle and the two of the box.
 */
export function boxIntersectsRect(box: RotatedBox, rect: Rect): boolean {
  const boxPts = boxCorners(box);
  const rectPts: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  const rad = (box.rotation * Math.PI) / 180;
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: Math.cos(rad), y: Math.sin(rad) },
    { x: -Math.sin(rad), y: Math.cos(rad) },
  ];
  return axes.every((axis) => {
    const [aMin, aMax] = project(boxPts, axis);
    const [bMin, bMax] = project(rectPts, axis);
    return aMax >= bMin - 1e-9 && bMax >= aMin - 1e-9;
  });
}

/**
 * Ids of the elements the marquee touches, in the order given. Elements
 * without a positive size are ignored (nothing to see, nothing to pick).
 */
export function elementsInMarquee<T extends RotatedBox & { id: string }>(elements: readonly T[], marquee: Rect): string[] {
  if (marquee.width <= 0 && marquee.height <= 0) return [];
  return elements
    .filter((el) => el.width > 0 && el.height > 0 && boxIntersectsRect(el, marquee))
    .map((el) => el.id);
}

/**
 * What a marquee leaves selected: only what it touches, or — when the user
 * held Ctrl/Cmd/Shift while starting it — what was selected before plus what
 * it touches (no duplicates, the earlier ones first).
 */
export function marqueeSelection(previous: readonly string[], touched: readonly string[], additive: boolean): string[] {
  if (!additive) return [...touched];
  return Array.from(new Set([...previous, ...touched]));
}
