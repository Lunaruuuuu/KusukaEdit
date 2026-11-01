// ---------------------------------------------------------------------------
// View scale ("zoom") of the canvas. Pure functions, no DOM.
//
// The zoom is a VIEW setting only: it changes how large the Stage is drawn on
// screen, never the document. Coordinates in the store, the JSON and the
// exported picture always stay in design pixels (see exportStageAsImage).
// ---------------------------------------------------------------------------

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;

/** The values the zoom buttons step through. */
export const ZOOM_STEPS: readonly number[] = [
  0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4,
];

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * The scale at which the whole canvas is visible in the available area,
 * keeping its proportions: the smaller of the two ratios. A canvas that is
 * already small enough is NOT enlarged (the result never exceeds 1), so a
 * 600 px wide design is shown at its real size, while a 1080 x 1920 poster is
 * shrunk to fit.
 *
 * `availWidth/availHeight` are the free pixels inside the scroll area. When
 * they are not known yet (0, negative, NaN) the answer is 1.
 *
 * The result is rounded DOWN (4 decimals), so the scaled canvas is never a
 * pixel larger than the area and does not cause scrollbars by itself. The one
 * exception is the zoom floor (ZOOM_MIN, 5%): a canvas so large that it needs
 * less than that is shown at 5% and scrolls.
 */
export function fitZoom(
  canvasWidth: number,
  canvasHeight: number,
  availWidth: number,
  availHeight: number
): number {
  const known = [canvasWidth, canvasHeight, availWidth, availHeight].every(
    (n) => Number.isFinite(n) && n > 0
  );
  if (!known) return 1;
  const ratio = Math.min(availWidth / canvasWidth, availHeight / canvasHeight, 1);
  return clampZoom(Math.floor(ratio * 10000) / 10000);
}

/** The next preset above (direction 1) or below (-1) `current`. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const EPSILON = 1e-6;
  if (direction === 1) {
    const next = ZOOM_STEPS.find((step) => step > current + EPSILON);
    return next ?? ZOOM_MAX;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - EPSILON) return ZOOM_STEPS[i];
  }
  return ZOOM_MIN;
}

/** The size the Stage takes on screen at `zoom`, in whole pixels. */
export function scaledSize(
  canvasWidth: number,
  canvasHeight: number,
  zoom: number
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(canvasWidth * zoom)),
    height: Math.max(1, Math.round(canvasHeight * zoom)),
  };
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
