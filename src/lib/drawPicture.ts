// ---------------------------------------------------------------------------
// How a picture element is drawn onto Konva's scene context. Kept apart from
// the React component so it can be tested with any 2D context (the browser
// test draws into a real <canvas> and reads the pixels back).
//
// A picture is drawn into its box (0, 0, width, height) in the node's own
// coordinates. Mirroring happens HERE, inside the box:
//   scaleX = -1  ->  left and right swapped
//   scaleY = -1  ->  top and bottom swapped
// so the box never moves, whatever the mirroring. Konva then moves and turns
// the whole node as usual (position = top-left corner, rotation around it).
//
// Layers, bottom to top:
//   1. the shadow of a CUT picture (masked, or with rounded corners; see below)
//   2. the picture, cut to the mask / rounded box when there is one
//   3. the border, along the outline (mask, rounded box or plain box), over the picture
//
// Shadow: Konva puts the node's shadow attributes on the canvas BEFORE the
// scene function runs, so everything drawn here casts one. A plain picture
// needs nothing more. A masked picture (or one with rounded corners) is drawn
// through a clip, and a clip also cuts off the shadow — outside the outline,
// exactly where the shadow should be. So the shadow is cast first, by a
// silhouette of the outline that is itself clipped away everywhere INSIDE it
// (a clip that covers the whole plane except the outline): only the shadow
// outside survives, and the picture then covers the inside.
//
// Rounded corners (`cornerRadius`) are a rectangle outline with arcs at the
// corners. They apply to the plain box only: a circle or a triangle mask has
// no corners (the caller passes 0 then).
// ---------------------------------------------------------------------------

import type { MaskShape } from "@/types/editor";

/**
 * The part of Konva's drawing context used here. Typed locally (callers cast
 * to it) so this file does not depend on the exact overloads of Konva's
 * `Context`, which differ between releases. Every method also exists, with the
 * same meaning, on a native CanvasRenderingContext2D — except the three
 * `...Shape` ones, which are Konva's and paint with the SHAPE's own
 * fill / stroke / shadow attributes.
 */
export interface PictureContext {
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  closePath(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  clip(fillRule?: "nonzero" | "evenodd"): void;
  drawImage(image: unknown, ...rest: number[]): void;
  /** Konva only: fills/strokes the current path with the SHAPE's own fill/stroke. */
  fillShape?(shape: unknown): void;
  strokeShape?(shape: unknown): void;
  fillStrokeShape?(shape: unknown): void;
}

export interface PictureSpec {
  width: number;
  height: number;
  /**
   * The loaded picture (an <img>, or a canvas holding an already filtered copy
   * of it); null while loading or when it failed (only the frame is drawn).
   */
  image: unknown | null;
  /**
   * The visible part of `image` in ITS pixels. Absent = all of `image` (which
   * is also the case for a filtered copy: it already holds only the crop).
   */
  crop?: { x: number; y: number; width: number; height: number };
  flipX: boolean;
  flipY: boolean;
  /** Cuts the picture to this shape (fitted into the box). Absent = the box. */
  mask?: MaskShape | null;
  /** Rounded corners of the box, in node pixels (ignored when there is a mask). 0 / absent = square. */
  cornerRadius?: number;
  /** The node has a drop shadow (its shadow attributes are set). */
  shadow?: boolean;
  /** The node has a border to draw over the picture (its stroke attributes are set). */
  stroke?: boolean;
}

// How far (in node pixels) the "everything but the mask" clip reaches.
const CLIP_REACH = 1e5;

/**
 * Adds the outline of the mask (or, with none, of the box) to the current
 * path. Does not begin the path: callers may put several outlines in one.
 */
function addOutline(
  context: PictureContext,
  mask: MaskShape | null,
  width: number,
  height: number,
  cornerRadius = 0
): void {
  if (mask === "circle") {
    // A circle scaled to the box: an ellipse inscribed in it. The scale is
    // undone before anything is stroked, so a border keeps an even thickness.
    context.save();
    context.translate(width / 2, height / 2);
    context.scale(1, width > 0 ? height / width : 1);
    context.arc(0, 0, width / 2, 0, Math.PI * 2, false);
    context.restore();
    context.closePath();
  } else if (mask === "triangle") {
    context.moveTo(width / 2, 0);
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
  } else {
    // Never more than half of the shorter side: then the corners cannot overlap.
    const r = Math.min(Math.max(cornerRadius, 0), width / 2, height / 2);
    if (r > 0) {
      context.moveTo(r, 0);
      context.lineTo(width - r, 0);
      context.arc(width - r, r, r, -Math.PI / 2, 0, false);
      context.lineTo(width, height - r);
      context.arc(width - r, height - r, r, 0, Math.PI / 2, false);
      context.lineTo(r, height);
      context.arc(r, height - r, r, Math.PI / 2, Math.PI, false);
      context.lineTo(0, r);
      context.arc(r, r, r, Math.PI, (Math.PI * 3) / 2, false);
    } else {
      context.rect(0, 0, width, height);
    }
    context.closePath();
  }
}

function outline(
  context: PictureContext,
  mask: MaskShape | null,
  width: number,
  height: number,
  cornerRadius = 0
): void {
  context.beginPath();
  addOutline(context, mask, width, height, cornerRadius);
}

/** The radius that is really drawn: none under a mask, never negative. */
function effectiveRadius(mask: MaskShape | null, cornerRadius: number | undefined): number {
  return mask === null && typeof cornerRadius === "number" && cornerRadius > 0 ? cornerRadius : 0;
}

/** Scene function of the picture node. */
export function drawPicture(context: PictureContext, shape: unknown, spec: PictureSpec): void {
  const { width, height, image, crop, flipX, flipY } = spec;
  const mask = spec.mask ?? null;
  const radius = effectiveRadius(mask, spec.cornerRadius);
  // A picture cut to a mask or to rounded corners is drawn through a clip.
  const clipped = mask !== null || radius > 0;

  if (image === null || image === undefined) {
    // The dashed frame of a picture that is still loading (or failed). Only
    // then does the node carry a fill and a stroke of its own.
    outline(context, null, width, height);
    context.fillStrokeShape?.(shape);
    return;
  }

  // 1. The shadow of a cut picture, cast outside the outline (see the top).
  //    The node carries an opaque fill for exactly this: the silhouette's
  //    colour never shows (it lies inside the outline, which the clip removes);
  //    only the shadow it casts does.
  if (clipped && spec.shadow) {
    context.save();
    context.beginPath();
    context.rect(-CLIP_REACH, -CLIP_REACH, width + 2 * CLIP_REACH, height + 2 * CLIP_REACH);
    addOutline(context, mask, width, height, radius);
    context.clip("evenodd");
    outline(context, mask, width, height, radius);
    context.fillShape?.(shape);
    context.restore();
  }

  // 2. The picture, through the mask / rounded corners.
  context.save();
  if (clipped) {
    outline(context, mask, width, height, radius);
    context.clip();
  }
  if (flipX || flipY) {
    // Mirror around the middle of the box: move the origin to the far edge,
    // then draw with a negative scale back towards the near edge.
    context.translate(flipX ? width : 0, flipY ? height : 0);
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }
  if (crop) {
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  } else {
    // No crop: Konva/the browser draws the picture straight into the box,
    // which is also what keeps an SVG sharp at any size.
    context.drawImage(image, 0, 0, width, height);
  }
  context.restore();

  // 3. The border, centred on the outline and drawn over the picture, outside
  //    the clip (so the outer half of a thick border is not cut off).
  if (spec.stroke) {
    outline(context, mask, width, height, radius);
    context.strokeShape?.(shape);
  }
}

/**
 * Hit area of the picture node: the mask (or the plain box). Without its own
 * hit function Konva would reuse the scene function and paint the picture's
 * real colours into the hit canvas, which breaks click detection. A circle
 * picture is therefore clicked on the circle, not on its transparent corners.
 */
export function drawPictureHitBox(
  context: PictureContext,
  shape: unknown,
  width: number,
  height: number,
  mask: MaskShape | null = null,
  cornerRadius = 0
): void {
  outline(context, mask, width, height, effectiveRadius(mask, cornerRadius));
  context.fillShape?.(shape);
}
