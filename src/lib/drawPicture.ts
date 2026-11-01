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
// ---------------------------------------------------------------------------

/**
 * The part of Konva's drawing context used here. Typed locally (callers cast
 * to it) so this file does not depend on the exact overloads of Konva's
 * `Context`, which differ between releases. Every method also exists, with the
 * same meaning, on a native CanvasRenderingContext2D.
 */
export interface PictureContext {
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  closePath(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  drawImage(image: unknown, ...rest: number[]): void;
  /** Konva only: fills/strokes the current path with the SHAPE's own fill/stroke. */
  fillShape?(shape: unknown): void;
  fillStrokeShape?(shape: unknown): void;
}

export interface PictureSpec {
  width: number;
  height: number;
  /** The loaded picture; null while loading or when it failed (only the frame is drawn). */
  image: unknown | null;
  /** The visible part of the picture in SOURCE pixels. Absent = the whole picture. */
  crop?: { x: number; y: number; width: number; height: number };
  flipX: boolean;
  flipY: boolean;
}

/** Scene function of the picture node. */
export function drawPicture(context: PictureContext, shape: unknown, spec: PictureSpec): void {
  const { width, height, image, crop, flipX, flipY } = spec;

  // The dashed frame of a picture that is still loading (or failed). Once
  // loaded the node has no fill and no stroke, so this draws nothing.
  context.beginPath();
  context.rect(0, 0, width, height);
  context.closePath();
  context.fillStrokeShape?.(shape);

  if (image === null || image === undefined) return;

  context.save();
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
}

/**
 * Hit area of the picture node: the plain box. Without its own hit function
 * Konva would reuse the scene function and paint the picture's real colours
 * into the hit canvas, which breaks click detection.
 */
export function drawPictureHitBox(context: PictureContext, shape: unknown, width: number, height: number): void {
  context.beginPath();
  context.rect(0, 0, width, height);
  context.closePath();
  context.fillShape?.(shape);
}
