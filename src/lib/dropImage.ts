// ---------------------------------------------------------------------------
// Dropping a picture from the desktop straight onto the canvas: the pure
// parts (what was dragged, where it landed). The DOM wiring is in
// CanvasWorkspace; the file itself is validated and turned into an object URL
// by prepareImageFile() (lib/imageUpload.ts).
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

/**
 * True when the drag carries files from outside the page. A dragged piece of
 * selected text or a link has other types and must be left to the browser.
 * (`types` is a DOMStringList in old browsers: it is read as an array-like.)
 */
export function hasFileDrag(dataTransfer: { types?: ArrayLike<string> | null } | null | undefined): boolean {
  const types = dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

export interface DroppedFile {
  /** The file that will be placed, or null when nothing was dropped. */
  file: File | null;
  /** How many further files were dropped and are NOT placed. */
  ignored: number;
}

/**
 * `dataTransfer.files[0]`: one picture is placed per drop. When the first
 * file is not a picture but a later one is (a folder's text file dragged
 * together with a photo), the first picture is used rather than failing.
 */
export function pickDroppedFile(files: ArrayLike<File> | null | undefined): DroppedFile {
  const list = files ? Array.from(files) : [];
  if (list.length === 0) return { file: null, ignored: 0 };
  const file = list.find((f) => f.type.startsWith("image/")) ?? list[0];
  return { file, ignored: list.length - 1 };
}

/**
 * Pointer position on the screen -> position on the design. `stageRect` is the
 * on-screen rectangle of the Stage (its wrapper), which already accounts for
 * scrolling and centring; the Stage is drawn `zoom` times as large as the
 * design, so one design pixel is `zoom` screen pixels.
 */
export function clientToDesign(
  client: Point,
  stageRect: { left: number; top: number },
  zoom: number
): Point {
  const z = zoom > 0 ? zoom : 1;
  return { x: (client.x - stageRect.left) / z, y: (client.y - stageRect.top) / z };
}

/**
 * A picture dropped on the grey area around the canvas (the drop target is the
 * whole workspace) lands on the nearest point of the canvas, so it is never
 * created out of reach.
 */
export function clampPointToCanvas(point: Point, canvas: { width: number; height: number }): Point {
  return {
    x: Math.min(Math.max(point.x, 0), canvas.width),
    y: Math.min(Math.max(point.y, 0), canvas.height),
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Top-left corner of a picture of `size` whose CENTRE is at `centre`. */
export function topLeftForCentre(size: { width: number; height: number }, centre: Point): Point {
  return { x: round2(centre.x - size.width / 2), y: round2(centre.y - size.height / 2) };
}
