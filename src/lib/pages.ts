// ---------------------------------------------------------------------------
// Pure helpers for a document made of pages. No store, no React: the store's
// page actions are thin wrappers around these, and they are tested in plain Node.
// ---------------------------------------------------------------------------

import { DEFAULT_CANVAS, type CanvasElement, type CanvasMeta, type Page } from "@/types/editor";
import { newId } from "@/lib/id";

/** A new, empty page. By default it gets the size and background of `canvas`. */
export function createBlankPage(canvas: CanvasMeta = DEFAULT_CANVAS, id: string = newId()): Page {
  return { id, canvas: { ...canvas }, elements: [] };
}

/**
 * A copy of a page for "duplicate page": a new page id and a NEW id for every
 * element (ids stay unique across the whole document), everything else —
 * position, size, text, pictures, crop, effects, stacking — identical.
 */
export function duplicatePageData(page: Page, makeId: () => string = newId): Page {
  return {
    id: makeId(),
    canvas: { ...page.canvas },
    elements: page.elements.map((el) => ({ ...el, id: makeId() }) as CanvasElement),
  };
}

/**
 * A structural copy that keeps every id (used for history snapshots). A copy,
 * not a reference, so a later in-place mutation of the live pages could never
 * corrupt a snapshot sitting in the history.
 */
export function clonePages(pages: readonly Page[]): Page[] {
  return pages.map((page) => ({
    id: page.id,
    canvas: { ...page.canvas },
    elements: page.elements.map((el) => ({ ...el })),
  }));
}

/** Whole-number index inside [0, count - 1]; 0 for anything that is not a number. */
export function clampPageIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/** True when `index` is a real page of a document with `count` pages. */
export function isPageIndex(index: unknown, count: number): index is number {
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < count;
}

/**
 * Which page is active after page `deleted` was removed (`newCount` pages are
 * left). The active page stays active when another page goes; when the active
 * page itself goes, the page that took its place is shown (the last page when
 * the last one was deleted).
 */
export function indexAfterDelete(current: number, deleted: number, newCount: number): number {
  const next = deleted < current ? current - 1 : current;
  return clampPageIndex(next, newCount);
}

/** Every element id in the document (an element id is unique across all pages). */
export function collectElementIds(pages: readonly Page[]): Set<string> {
  const ids = new Set<string>();
  for (const page of pages) for (const el of page.elements) ids.add(el.id);
  return ids;
}

/** Every `src` of every picture on every page. */
export function collectImageSources(pages: readonly Page[]): Set<string> {
  const sources = new Set<string>();
  for (const page of pages) {
    for (const el of page.elements) if (el.type === "image") sources.add(el.src);
  }
  return sources;
}

export function totalElementCount(pages: readonly Page[]): number {
  return pages.reduce((sum, page) => sum + page.elements.length, 0);
}

/** "01", "02" ... padded to the width the largest page number needs (at least 2). */
export function pageNumberLabel(index: number, count: number): string {
  const width = Math.max(2, String(count).length);
  return String(index + 1).padStart(width, "0");
}
