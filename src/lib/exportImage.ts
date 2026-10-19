import type Konva from "konva";

export type ImageFormat = "png" | "jpeg";

export interface ExportImageOptions {
  format: ImageFormat;
  /** 1 = native canvas resolution, 2 = 2x ("retina"), 3 = 3x, etc. */
  pixelRatio?: number;
  fileName?: string;
}

/**
 * Rasterizes the current Konva Stage to a downloadable PNG/JPG using
 * Konva's built-in `stage.toDataURL()`. This is the "flatten the whole
 * document into one image" counterpart to exportToJSON() — JSON keeps the
 * design editable, this produces the final visual the end user actually
 * wants to share or print.
 */
export function exportStageAsImage(stage: Konva.Stage, options: ExportImageOptions) {
  const { format, pixelRatio = 2, fileName } = options;

  // Selection handles (the Transformer's anchors/border) live on the same
  // Stage we're rasterizing, so without this they'd get baked right into
  // the exported picture. We temporarily detach every Transformer's
  // nodes, force a *synchronous* redraw (plain draw(), not batchDraw(),
  // which defers to the next animation frame and would still be pending
  // when toDataURL() reads the canvas), export, then reattach.
  const transformers = stage.find("Transformer") as Konva.Transformer[];
  const previousNodes = transformers.map((tr) => tr.nodes());
  transformers.forEach((tr) => tr.nodes([]));
  stage.draw();

  const dataUrl = stage.toDataURL({
    mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
    // JPEG has no alpha channel; our canvas always has an opaque
    // background rect underneath the elements, so this never leaves
    // transparent holes.
    quality: format === "jpeg" ? 0.92 : 1,
    pixelRatio,
  });

  transformers.forEach((tr, i) => tr.nodes(previousNodes[i]));
  stage.draw();

  const extension = format === "jpeg" ? "jpg" : "png";
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName ?? `canvas-design-${Date.now()}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
