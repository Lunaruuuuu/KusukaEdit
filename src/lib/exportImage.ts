import type Konva from "konva";
import { resolveExportPixelRatio } from "@/lib/workspace";

export type ImageFormat = "png" | "jpeg";

export interface ExportImageOptions {
  format: ImageFormat;
  /** 1 = native canvas resolution, 2 = 2x ("retina"), 3 = 3x, etc. */
  pixelRatio?: number;
  fileName?: string;
  /**
   * The design size in px (the `canvas` of the store). Pass it: the Stage's
   * on-screen size is the design size times the zoom, ROUNDED to whole pixels,
   * so dividing it by the zoom again can be a few pixels off at low zoom.
   * Without it the size is derived from the Stage, which is exact at 100%.
   */
  designSize?: { width: number; height: number };
}

export interface ExportImageResult {
  fileName: string;
  /** The ratio actually used (may be lower than requested, see `capped`). */
  pixelRatio: number;
  /** True when the requested ratio was lowered to keep the output within browser limits. */
  capped: boolean;
  /** Size of the downloaded picture, in px. */
  outputWidth: number;
  outputHeight: number;
}

/**
 * Rasterizes the current Konva Stage to a downloadable PNG/JPG using
 * Konva's built-in `stage.toDataURL()`. This is the "flatten the whole
 * document into one image" counterpart to exportToJSON() — JSON keeps the
 * design editable, this produces the final visual the end user actually
 * wants to share or print.
 *
 * The output is the DESIGN (the `canvas` size in the store) times the pixel
 * ratio, whatever zoom the canvas is shown at. On screen the Stage is
 * `zoom` times as large and scaled by `zoom`; for the export it is put back to
 * scale 1 at the design size and restored afterwards (in a `finally`), so a
 * 1080 x 1920 poster viewed at 30% still exports as 1080 x 1920 (x pixelRatio).
 * Resizing the workspace changes the exported picture with no extra step.
 * Throws an Error with a message meant to be shown to the user.
 */
export function exportStageAsImage(stage: Konva.Stage, options: ExportImageOptions): ExportImageResult {
  const { format, pixelRatio = 2, fileName, designSize } = options;

  // The design size: given by the caller, or what the Stage measures on
  // screen divided by the view scale.
  const designWidth = designSize?.width ?? Math.round(stage.width() / (stage.scaleX() || 1));
  const designHeight = designSize?.height ?? Math.round(stage.height() / (stage.scaleY() || 1));
  const plan = resolveExportPixelRatio(designWidth, designHeight, pixelRatio);

  // Selection handles (the Transformer's anchors/border) live on the same
  // Stage we're rasterizing, so without this they'd get baked right into
  // the exported picture. We temporarily detach every Transformer's
  // nodes, force a *synchronous* redraw (plain draw(), not batchDraw(),
  // which defers to the next animation frame and would still be pending
  // when toDataURL() reads the canvas), export, then reattach — in a
  // `finally`, so a failed export never leaves the selection handles gone.
  const transformers = stage.find("Transformer") as Konva.Transformer[];
  const previousNodes = transformers.map((tr) => tr.nodes());

  // Putting the Stage at design size can shrink the page for a moment (when it
  // is zoomed in), and the browser then clamps any scroll position. Remember
  // every scrolled ancestor and put it back.
  const scrolled: { el: HTMLElement; left: number; top: number }[] = [];
  for (let el: HTMLElement | null = stage.container(); el; el = el.parentElement) {
    if (el.scrollLeft !== 0 || el.scrollTop !== 0) {
      scrolled.push({ el, left: el.scrollLeft, top: el.scrollTop });
    }
  }
  const shown = { width: stage.width(), height: stage.height(), scaleX: stage.scaleX(), scaleY: stage.scaleY() };

  let dataUrl = "";
  try {
    transformers.forEach((tr) => tr.nodes([]));
    stage.scale({ x: 1, y: 1 });
    stage.size({ width: designWidth, height: designHeight });
    stage.draw();

    dataUrl = stage.toDataURL({
      mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
      // JPEG has no alpha channel; our canvas always has an opaque
      // background rect underneath the elements, so this never leaves
      // transparent holes.
      quality: format === "jpeg" ? 0.92 : 1,
      pixelRatio: plan.pixelRatio,
    });
  } catch (err) {
    // A picture loaded from another site without CORS permission "taints"
    // the canvas, and the browser then refuses to read it back.
    if (err instanceof Error && err.name === "SecurityError") {
      throw new Error(
        "Ekspor gambar diblokir browser: ada gambar dari situs lain yang tidak mengizinkan penggunaan ulang (CORS). " +
          "Unggah gambar itu dari komputer Anda, atau ekspor sebagai JSON."
      );
    }
    throw err;
  } finally {
    stage.size({ width: shown.width, height: shown.height });
    stage.scale({ x: shown.scaleX, y: shown.scaleY });
    transformers.forEach((tr, i) => tr.nodes(previousNodes[i]));
    stage.draw();
    scrolled.forEach(({ el, left, top }) => {
      el.scrollLeft = left;
      el.scrollTop = top;
    });
  }

  // When a canvas is too big for the browser, toDataURL() does not throw: it
  // quietly returns an empty image. Catch that instead of saving a blank file.
  if (!dataUrl || dataUrl === "data:," || dataUrl.length < 32) {
    throw new Error(
      `Browser gagal membuat gambar ${plan.outputWidth} × ${plan.outputHeight} px. Turunkan resolusi atau perkecil kanvas.`
    );
  }

  const extension = format === "jpeg" ? "jpg" : "png";
  const name = fileName ?? `canvas-design-${Date.now()}.${extension}`;
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();

  return {
    fileName: name,
    pixelRatio: plan.pixelRatio,
    capped: plan.capped,
    outputWidth: plan.outputWidth,
    outputHeight: plan.outputHeight,
  };
}
