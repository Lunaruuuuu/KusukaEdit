// ---------------------------------------------------------------------------
// "Export all pages": every page of the document rendered to a PNG/JPG with
// Konva's stage.toDataURL(), bundled into one ZIP and downloaded.
//
// This is the part that touches the app (the store, the live Stage, the
// browser). The order of the steps and the restoring of the view live in
// lib/batchExport.ts; the archive in lib/zipStore.ts.
//
// How a page is rendered: there is only one Stage, and it draws the ACTIVE
// page, so each page is shown in turn (the canvas is covered by a progress
// box and input is blocked meanwhile), the pictures it needs are loaded first,
// and the Stage is polled until it holds exactly that page's nodes. Then it
// is rasterized exactly like a single-page export (renderStageToDataUrl). At
// the end the user's page is shown again. The selection is reset by every page
// change (that is the rule for navigation); the one that was selected before
// is selected again if it is still there.
// ---------------------------------------------------------------------------

import type Konva from "konva";
import type { Page } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";
import { loadImage } from "@/lib/imageCache";
import { downloadDataUrl, renderStageToDataUrl, type ImageFormat } from "@/lib/exportImage";
import { pageFileName, renderPagesSequentially, safeFileBase, waitUntil } from "@/lib/batchExport";
import { createZip, dataUrlToBytes } from "@/lib/zipStore";
import { collectImageSources } from "@/lib/pages";

export interface ExportAllOptions {
  stage: Konva.Stage;
  format: ImageFormat;
  pixelRatio: number;
  /** Used for the ZIP and the files inside it. Default "desain". */
  baseName?: string;
}

export interface ExportAllResult {
  fileName: string;
  pageCount: number;
  /** True when a page's resolution had to be lowered to stay within browser limits. */
  capped: boolean;
  /** Output size of every page, in order. */
  sizes: Array<{ width: number; height: number }>;
  /** Size of the ZIP, in bytes. */
  zipBytes: number;
}

/** True when the Stage holds exactly the element nodes of `page` (and none of another page). */
export function stageShowsPage(stage: Konva.Stage, page: Page): boolean {
  const expected = new Set(page.elements.map((el) => el.id));
  const found = new Set<string>();
  stage.find((node: Konva.Node) => {
    const id = node.id();
    if (id) found.add(id);
    return false;
  });
  if (found.size !== expected.size) return false;
  for (const id of expected) if (!found.has(id)) return false;
  return true;
}

/** Loads the pictures of a page into the image cache, so showing the page draws them at once. */
async function preloadPageImages(page: Page): Promise<void> {
  const sources = Array.from(collectImageSources([page]));
  // A picture that fails to load is drawn as the placeholder frame: not a reason to stop.
  await Promise.all(sources.map((src) => loadImage(src).catch(() => undefined)));
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) =>
    typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 16)
  );

export async function exportAllPagesAsZip(options: ExportAllOptions): Promise<ExportAllResult> {
  const { stage, format, pixelRatio } = options;
  const base = safeFileBase(options.baseName ?? "desain");
  const extension = format === "jpeg" ? "jpg" : "png";
  const store = useEditorStore;

  const initial = store.getState();
  const pageCount = initial.pages.length;
  const startIndex = initial.currentPageIndex;
  const startSelectedIds = initial.selectedIds;

  // Anything half-done (a text being typed, a crop) ends before the pages start changing.
  (document.activeElement as HTMLElement | null)?.blur?.();
  initial.setEditingId(null);
  initial.setCroppingId(null);

  try {
    const results = await renderPagesSequentially({
      pageCount,
      startIndex,
      showPage: (index) => store.getState().goToPage(index),
      waitUntilDrawn: async (index) => {
        const page = store.getState().pages[index];
        await preloadPageImages(page);
        // React redraws the Stage on its own schedule: poll until it holds this page.
        const drawn = await waitUntil(() => stageShowsPage(stage, page));
        // Never take a picture of a Stage that still shows another page: a stale
        // page in the ZIP would look like a success. Fail loudly instead (the
        // editor is put back on the user's page by renderPagesSequentially).
        if (!drawn) {
          throw new Error(
            `Halaman ${index + 1} tidak selesai digambar dalam waktu yang wajar, sehingga export dibatalkan. Coba lagi.`
          );
        }
        if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
        await nextFrame(); // let layout effects (text height, blur cache) settle
      },
      render: (index) =>
        renderStageToDataUrl(stage, {
          format,
          pixelRatio,
          designSize: store.getState().pages[index].canvas,
        }),
      onProgress: (done, total) => store.getState().setExportProgress({ done, total }),
    });

    const entries = results.map(({ index, rendered }) => ({
      name: pageFileName(base, index, pageCount, extension),
      data: dataUrlToBytes(rendered.dataUrl),
    }));
    const zip = createZip(entries);
    const fileName = `${base}-semua-halaman.zip`;
    const blobUrl = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
    try {
      downloadDataUrl(blobUrl, fileName);
    } finally {
      // The click has started the download; the URL is not needed any more.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    }

    return {
      fileName,
      pageCount,
      capped: results.some((r) => r.rendered.capped),
      sizes: results.map((r) => ({ width: r.rendered.outputWidth, height: r.rendered.outputHeight })),
      zipBytes: zip.length,
    };
  } finally {
    const state = store.getState();
    state.setExportProgress(null);
    // The page the user was on is shown again (renderPagesSequentially did that);
    // so are the elements they had selected (setSelection skips any that are gone).
    if (startSelectedIds.length > 0 && state.currentPageIndex === startIndex) {
      state.setSelection(startSelectedIds);
    }
  }
}
