// Small helpers shared by the test files: the document is a list of pages now,
// and most tests only care about the page being edited.
import { useEditorStore } from "@/store/useEditorStore";
import { selectCanvas, selectElements } from "@/store/selectors";
import type { CanvasDocument, CanvasElement, CanvasMeta, Page } from "@/types/editor";

/** Elements of the active page. */
export const E = (): CanvasElement[] => selectElements(useEditorStore.getState());
/** Canvas of the active page. */
export const C = (): CanvasMeta => selectCanvas(useEditorStore.getState());

/** A one-page native (v3) document, the shape most tests need. */
export function onePage(canvas: CanvasMeta, elements: CanvasElement[], id = "page-1"): CanvasDocument {
  return { version: 3, pages: [{ id, canvas, elements }] };
}

/** A page for building documents by hand. */
export const mkPage = (id: string, canvas: CanvasMeta, elements: CanvasElement[] = []): Page => ({ id, canvas, elements });
