// ---------------------------------------------------------------------------
// Selectors for the page-based document. The store keeps ONE copy of the
// document — `pages` + `currentPageIndex` — and there is no separate "flat"
// `elements` / `canvas` field that could drift out of step with it. Whatever
// needs "the canvas" or "the elements" of the page being edited asks here.
//
// They return references that already live in the state, so they can be
// passed straight to `useEditorStore(selector)`: the component re-renders only
// when that very object is replaced.
// ---------------------------------------------------------------------------

import type { CanvasElement, CanvasMeta, Page } from "@/types/editor";
import { clampPageIndex } from "@/lib/pages";

/** The part of the store these selectors read (so tests can pass a plain object). */
export interface PagesState {
  pages: Page[];
  currentPageIndex: number;
}

/** The page being edited. A document always has at least one page. */
export function selectCurrentPage(state: PagesState): Page {
  return state.pages[clampPageIndex(state.currentPageIndex, state.pages.length)];
}

export function selectCanvas(state: PagesState): CanvasMeta {
  return selectCurrentPage(state).canvas;
}

export function selectElements(state: PagesState): CanvasElement[] {
  return selectCurrentPage(state).elements;
}

export function selectPageCount(state: PagesState): number {
  return state.pages.length;
}

/** An element of the page being edited (null when there is no such element there). */
export function selectElementById(state: PagesState, id: string | null): CanvasElement | null {
  if (id === null) return null;
  return selectElements(state).find((el) => el.id === id) ?? null;
}
