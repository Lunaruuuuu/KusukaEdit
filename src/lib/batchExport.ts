// ---------------------------------------------------------------------------
// Rendering EVERY page of the document to pictures, one after another.
//
// There is one Konva Stage, and it draws the active page. To rasterize page 3
// the editor therefore shows page 3 — and this module is the choreography:
// bring each page up, wait until it is really drawn, take the picture, move
// on; at the end put the editor back on the page the user was working on.
// The steps that touch the browser (changing the page, waiting for pictures,
// taking the picture) are passed in, so the sequence itself — order, progress,
// restoring, file names, what happens on failure — runs and is tested in Node.
// ---------------------------------------------------------------------------

import { pageNumberLabel } from "@/lib/pages";

export interface BatchDeps<R> {
  pageCount: number;
  /** The page the user is on now; it is shown again at the end, success or not. */
  startIndex: number;
  /** Shows page `index` in the editor (and the Stage). */
  showPage: (index: number) => void;
  /** Resolves when page `index` is on the Stage with its pictures and text drawn. */
  waitUntilDrawn: (index: number) => Promise<void>;
  /** Takes the picture of the page that is on the Stage now. */
  render: (index: number) => R;
  /** Called with (pages finished, total) before the first page and after each one. */
  onProgress?: (done: number, total: number) => void;
}

export interface BatchPageResult<R> {
  index: number;
  rendered: R;
}

/**
 * Renders pages 0 .. pageCount-1 in order. If anything fails, the error is
 * rethrown — after the editor has been put back on `startIndex`, so a failed
 * export never leaves the user looking at some other page.
 */
export async function renderPagesSequentially<R>(deps: BatchDeps<R>): Promise<BatchPageResult<R>[]> {
  const results: BatchPageResult<R>[] = [];
  deps.onProgress?.(0, deps.pageCount);
  try {
    for (let index = 0; index < deps.pageCount; index++) {
      deps.showPage(index);
      await deps.waitUntilDrawn(index);
      results.push({ index, rendered: deps.render(index) });
      deps.onProgress?.(index + 1, deps.pageCount);
    }
  } finally {
    deps.showPage(deps.startIndex);
  }
  return results;
}

/** "desain-halaman-03.png": the name of page `index` in a bundle of `count` pages. */
export function pageFileName(baseName: string, index: number, count: number, extension: string): string {
  return `${baseName}-halaman-${pageNumberLabel(index, count)}.${extension}`;
}

/** A name that is safe inside a ZIP and on every file system. */
export function safeFileBase(name: string, fallback = "desain"): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // "é" is "e" + an accent: keep the letter, drop the accent
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned === "" ? fallback : cleaned;
}

export interface WaitOptions {
  /** Give up after this long (ms). The page is then drawn as it is. */
  timeoutMs?: number;
  /** Schedules the next check. Default: requestAnimationFrame. */
  nextFrame?: (callback: () => void) => void;
  /** Clock, in ms. Default: performance.now(). */
  now?: () => number;
}

/**
 * Resolves true as soon as `isReady()` is true (checked once per frame), or
 * false after `timeoutMs`. Used to wait for the Stage to catch up with a page
 * change: React redraws on its own schedule.
 */
export function waitUntil(isReady: () => boolean, options: WaitOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const nextFrame =
    options.nextFrame ?? ((cb: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : setTimeout(cb, 16)));
  const now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const start = now();
  return new Promise((resolve) => {
    const check = () => {
      if (isReady()) return resolve(true);
      if (now() - start >= timeoutMs) return resolve(false);
      nextFrame(check);
    };
    check();
  });
}
