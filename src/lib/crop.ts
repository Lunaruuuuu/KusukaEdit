// ---------------------------------------------------------------------------
// Interactive cropping: the maths, with no DOM, React or store in it.
//
// An ImageElement shows PART of its picture. That part is stored as fractions
// (0..1) of the picture's natural size: (cropX, cropY) is its top-left corner,
// (cropWidth, cropHeight) its size. The element's box (x, y, width, height)
// is where that part is drawn.
//
// Cropping here is "proportional": the picture is never stretched. The whole
// picture keeps one fixed size on the canvas while it is cropped:
//
//     fullWidth  = width  / cropWidth
//     fullHeight = height / cropHeight
//
// Dragging an edge of the crop window therefore changes the visible part AND
// the box together, so the pixels that stay visible do not move or rescale.
// Everything is computed in fractions and design pixels; the natural pixel
// size is only needed at the very end, when the crop goes to the canvas
// (cropToSourcePixels).
//
// Mirroring: a flipped picture (scaleX / scaleY = -1) is drawn mirrored inside
// its box, so what the user sees as "the left edge" is the picture's RIGHT
// side. The window is worked out in what is SEEN ("visual" space) and turned
// into source fractions at the end.
//
// Rotation: the box turns clockwise around its top-left corner. Moving the
// left/top edge moves that corner, so (x, y) is moved along the element's own
// rotated axes — the part that stays visible stays exactly where it was.
// ---------------------------------------------------------------------------

export interface CropFractions {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

/** The part of an ImageElement the crop maths needs. */
export interface CropTarget extends CropFractions {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** What a crop gesture changes: the visible part and the box that shows it. */
export interface CropPatch extends CropFractions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const CROP_HANDLES: readonly CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Smallest visible side, in design pixels, that a crop may leave. */
export const MIN_CROP_SIZE = 10;

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
// The crop FRACTIONS are rounded finer than pixels are: a fraction of 0.01 (a
// 10 px window on a 1000 px picture) rounded to 6 decimals would change the
// size of the whole picture, width / cropWidth, by up to 0.01%, and a series of
// drags would let that drift add up. 9 decimals keeps it far below a pixel.
const round9 = (value: number): number => Math.round(value * 1e9) / 1e9;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isWholePicture(crop: CropFractions): boolean {
  return crop.cropX === 0 && crop.cropY === 0 && crop.cropWidth === 1 && crop.cropHeight === 1;
}

/**
 * Fractions (0..1) -> pixels of the picture itself. This is the rectangle that
 * goes to Konva's `crop` (and to drawImage's source rectangle). Undefined when
 * there is nothing to crop — the whole picture, or a picture whose size is not
 * known yet — so the picture is drawn straight into its box (which is also
 * what keeps an SVG sharp at any size).
 */
export function cropToSourcePixels(
  crop: CropFractions,
  naturalWidth: number,
  naturalHeight: number
): SourceRect | undefined {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return undefined;
  if (isWholePicture(crop)) return undefined;
  return {
    x: crop.cropX * naturalWidth,
    y: crop.cropY * naturalHeight,
    width: crop.cropWidth * naturalWidth,
    height: crop.cropHeight * naturalHeight,
  };
}

// ----------------------------- window geometry -----------------------------

export interface CropFrame {
  /** Size of the WHOLE picture as it is currently shown, in design px. */
  fullWidth: number;
  fullHeight: number;
  /** Where the visible window starts inside the whole picture, as SEEN (mirrored), in design px. */
  left: number;
  top: number;
}

export function cropFrame(el: CropTarget): CropFrame {
  const fullWidth = el.width / el.cropWidth;
  const fullHeight = el.height / el.cropHeight;
  const visualX = el.scaleX === -1 ? 1 - el.cropX - el.cropWidth : el.cropX;
  const visualY = el.scaleY === -1 ? 1 - el.cropY - el.cropHeight : el.cropY;
  return { fullWidth, fullHeight, left: visualX * fullWidth, top: visualY * fullHeight };
}

interface Window {
  l: number;
  t: number;
  r: number;
  b: number;
}

function fractionsFor(el: CropTarget, frame: CropFrame, win: Window): CropFractions {
  const visualW = (win.r - win.l) / frame.fullWidth;
  const visualH = (win.b - win.t) / frame.fullHeight;
  const visualX = win.l / frame.fullWidth;
  const visualY = win.t / frame.fullHeight;
  const rawX = el.scaleX === -1 ? 1 - visualX - visualW : visualX;
  const rawY = el.scaleY === -1 ? 1 - visualY - visualH : visualY;
  const cropX = clamp(round9(rawX), 0, 1);
  const cropY = clamp(round9(rawY), 0, 1);
  return {
    cropX,
    cropY,
    cropWidth: Math.min(round9(visualW), 1 - cropX),
    cropHeight: Math.min(round9(visualH), 1 - cropY),
  };
}

/** Rotates (dx, dy) clockwise by `degrees` (screen coordinates: y points down). */
function rotate(dx: number, dy: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function windowOf(el: CropTarget, frame: CropFrame): Window {
  return { l: frame.left, t: frame.top, r: frame.left + el.width, b: frame.top + el.height };
}

function patchFromWindow(el: CropTarget, frame: CropFrame, win: Window): CropPatch {
  const shift = rotate(win.l - frame.left, win.t - frame.top, el.rotation);
  return {
    ...fractionsFor(el, frame, win),
    x: round6(el.x + shift.x),
    y: round6(el.y + shift.y),
    width: round6(win.r - win.l),
    height: round6(win.b - win.t),
  };
}

/**
 * A pointer movement, in LOCAL design pixels: screen pixels -> design pixels
 * (divide by the view zoom) -> the element's own axes (undo its rotation).
 */
export function toLocalDelta(
  clientDx: number,
  clientDy: number,
  zoom: number,
  rotationDegrees: number
): { dx: number; dy: number } {
  const z = zoom > 0 ? zoom : 1;
  const turned = rotate(clientDx / z, clientDy / z, -rotationDegrees);
  return { dx: turned.x, dy: turned.y };
}

// -------------------------------- operations -------------------------------

/**
 * Drags one handle of the crop window by (dx, dy) local design pixels. Each
 * edge stops at the edge of the picture and keeps `minSize` of window.
 */
export function resizeCrop(
  el: CropTarget,
  handle: CropHandle,
  delta: { dx: number; dy: number },
  minSize: number = MIN_CROP_SIZE
): CropPatch {
  const frame = cropFrame(el);
  const win = windowOf(el, frame);
  if (handle.includes("w")) win.l = clamp(win.l + delta.dx, 0, win.r - minSize);
  if (handle.includes("e")) win.r = clamp(win.r + delta.dx, win.l + minSize, frame.fullWidth);
  if (handle.includes("n")) win.t = clamp(win.t + delta.dy, 0, win.b - minSize);
  if (handle.includes("s")) win.b = clamp(win.b + delta.dy, win.t + minSize, frame.fullHeight);
  return patchFromWindow(el, frame, win);
}

/**
 * Drags the PICTURE inside the crop window (the box stays where it is): the
 * picture follows the pointer, so the visible part moves the opposite way.
 */
export function panCrop(el: CropTarget, delta: { dx: number; dy: number }): CropPatch {
  const frame = cropFrame(el);
  const left = clamp(frame.left - delta.dx, 0, frame.fullWidth - el.width);
  const top = clamp(frame.top - delta.dy, 0, frame.fullHeight - el.height);
  return {
    ...fractionsFor(el, frame, { l: left, t: top, r: left + el.width, b: top + el.height }),
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
  };
}

/** Shows the whole picture again, at the size it has now. */
export function resetCrop(el: CropTarget): CropPatch {
  const frame = cropFrame(el);
  return patchFromWindow(el, frame, { l: 0, t: 0, r: frame.fullWidth, b: frame.fullHeight });
}

/** True when `patch` would change anything (a click without a drag must not make an undo step). */
export function cropPatchChanges(el: CropTarget, patch: CropPatch): boolean {
  const eps = 1e-6;
  return (
    Math.abs(el.x - patch.x) > eps ||
    Math.abs(el.y - patch.y) > eps ||
    Math.abs(el.width - patch.width) > eps ||
    Math.abs(el.height - patch.height) > eps ||
    Math.abs(el.cropX - patch.cropX) > eps ||
    Math.abs(el.cropY - patch.cropY) > eps ||
    Math.abs(el.cropWidth - patch.cropWidth) > eps ||
    Math.abs(el.cropHeight - patch.cropHeight) > eps
  );
}

/**
 * Checks a patch that comes from outside the maths above (the store applies it
 * to the document): finite numbers, a crop inside the picture, a box with a
 * size. Returns null for anything else, so a bad patch changes nothing.
 */
export function sanitizeCropPatch(patch: CropPatch): CropPatch | null {
  const values = [patch.x, patch.y, patch.width, patch.height, patch.cropX, patch.cropY, patch.cropWidth, patch.cropHeight];
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  if (patch.width <= 0 || patch.height <= 0 || patch.cropWidth <= 0 || patch.cropHeight <= 0) return null;
  const cropX = clamp(patch.cropX, 0, 1);
  const cropY = clamp(patch.cropY, 0, 1);
  return {
    x: patch.x,
    y: patch.y,
    width: patch.width,
    height: patch.height,
    cropX,
    cropY,
    cropWidth: Math.min(patch.cropWidth, 1 - cropX),
    cropHeight: Math.min(patch.cropHeight, 1 - cropY),
  };
}
