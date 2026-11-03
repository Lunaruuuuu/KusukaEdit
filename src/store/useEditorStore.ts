import { create } from "zustand";
import type Konva from "konva";
import {
  DEFAULT_CANVAS,
  DEFAULT_FONT_FAMILY,
  SCHEMA_VERSION,
  type CanvasDocument,
  type CanvasElement,
  type CanvasMeta,
  type ImageElement,
  type Page,
  type ShapeElement,
  type ShapeKind,
  type TextElement,
} from "@/types/editor";
import { newId } from "@/lib/id";
import {
  convertKusukaToPolotno,
  parseDocument,
  type ExportFormat,
  type LoadResult,
} from "@/lib/polotnoAdapter";
import { normalizeColor } from "@/lib/color";
import { clampDimension, fitElementToPage, fitImageToCanvas } from "@/lib/workspace";
import { cropPatchChanges, resetCrop, sanitizeCropPatch, type CropPatch } from "@/lib/crop";
import { topLeftForCentre, type Point } from "@/lib/dropImage";
import {
  hasTrackedObjectUrls,
  releaseUnreferencedObjectUrls,
  trackObjectUrl,
} from "@/lib/objectUrls";
import { evictImage } from "@/lib/imageCache";
import { embedObjectUrls } from "@/lib/imageData";
import {
  clampPageIndex,
  clonePages,
  collectImageSources,
  createBlankPage,
  duplicatePageData,
  indexAfterDelete,
  isPageIndex,
} from "@/lib/pages";
import {
  applyElementStylePatch,
  applyImageStylePatch,
  type ElementStylePatch,
  type ImageStylePatch,
} from "@/lib/imageStyle";
import { selectCurrentPage } from "@/store/selectors";

/** A picture that has been loaded and measured, ready to become an element. */
export interface ImageSource {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** True when the file is an SVG (a vector picture, e.g. an icon). */
  vector?: boolean;
}

/** What exportToJSON() produces: the file content plus anything worth telling the user. */
export interface ExportResult {
  json: string;
  warnings: string[];
}

/** Progress of a multi-page image export (view state; null = no export running). */
export interface BatchProgress {
  done: number;
  total: number;
}

export interface CanvasMetaOptions {
  /** Apply the change to every page instead of only the active one. */
  allPages?: boolean;
}

type ReorderDirection = "front" | "back" | "forward" | "backward";

// ---------------------------------------------------------------------------
// History (Undo / Redo)
// ---------------------------------------------------------------------------
// A snapshot captures the *document* — every page (canvas meta + elements) —
// and which page was active when it was taken, so Undo takes you to the page
// where the change happened. It never captures `selectedId` / `selectedIds` (selection isn't
// something a user expects "Undo" to restore), `clipboard`, `editingId`,
// `croppingId` or `stageNode` (a Konva.Stage instance isn't data).
// Switching pages is NOT a history step either: it changes what you look at,
// not the document.
interface HistorySnapshot {
  pages: Page[];
  /** The page to show when this snapshot is restored. */
  currentPageIndex: number;
  /**
   * The page to show when the same step is walked in the OTHER direction (redo
   * after an undo, undo after a redo). Only set by steps that change which
   * page is shown — add, duplicate, delete, import, clear — so that Redo of
   * "add page" lands on the new page. Without it, the page where the change
   * was made is shown, which is right for every edit.
   */
  afterPageIndex?: number;
}

const MAX_HISTORY = 50;
// How long we wait, after the *last* change in a burst, before that burst
// is sealed into a single undo step. Chosen to cover one drag gesture or
// one "hold the arrow key" repeat without feeling laggy when the user
// deliberately presses Undo right after finishing an edit.
const HISTORY_DEBOUNCE_MS = 500;

// Where a pasted element lands relative to the one it was copied from.
const PASTE_OFFSET = 20;

function cloneSnapshot(pages: readonly Page[], currentPageIndex: number, afterPageIndex?: number): HistorySnapshot {
  // Structural clone, not a reference copy — otherwise a later in-place
  // mutation would silently corrupt the snapshot sitting in the history stack.
  const snap: HistorySnapshot = { pages: clonePages(pages), currentPageIndex };
  if (afterPageIndex !== undefined) snap.afterPageIndex = afterPageIndex;
  return snap;
}

export interface EditorState {
  /** The document: one or more pages. Never empty. */
  pages: Page[];
  /** Which page is being edited (always a valid index into `pages`). */
  currentPageIndex: number;
  /**
   * Every selected element of the active page, in the order they were picked
   * (click, Ctrl/Cmd+click, marquee). View state, never in history.
   */
  selectedIds: string[];
  /**
   * The ONE selected element, or null when nothing or several elements are
   * selected. What the single-element UI (toolbar, crop, text editing, copy)
   * works on. Always equal to selectedIds[0] when selectedIds has one entry.
   */
  selectedId: string | null;

  // Element copied with Ctrl+C, waiting for Ctrl+V. Not part of the document
  // and never touched by undo/redo. It can be pasted on any page.
  clipboard: CanvasElement | null;
  copySelected: () => boolean;
  pasteClipboard: () => boolean;

  // Id of the text element currently being edited in the <textarea> overlay.
  // While set, global keyboard shortcuts are suspended and the Konva node is hidden.
  editingId: string | null;
  setEditingId: (id: string | null) => void;

  // Id of the picture currently being cropped (CropOverlay is open over it).
  // Like editingId: view state, never in history. While set, the Konva node is
  // hidden behind the overlay and the global shortcuts are suspended. Only a
  // picture can be cropped, and only while it is the selected element.
  croppingId: string | null;
  setCroppingId: (id: string | null) => void;

  // the live Konva.Stage instance, registered by CanvasWorkspace once it
  // mounts. Not part of the document and never touched by undo/redo — it
  // only exists so the Export-to-Image button can reach the canvas.
  stageNode: Konva.Stage | null;
  setStageNode: (stage: Konva.Stage | null) => void;

  // Counts the documents loaded with loadFromJSON() (Import button, template
  // gallery). A VIEW signal, not document state: the canvas watches it to show
  // a freshly loaded design whole again (zoom "Fit"), even when the new
  // document happens to have the same size as the old one. Never in history.
  loadRevision: number;

  // Set while a "all pages" image export walks through the pages. View state:
  // the canvas shows a progress cover and ignores input while it is set.
  exportProgress: BatchProgress | null;
  setExportProgress: (progress: BatchProgress | null) => void;

  // history stacks (exposed read-only; mutate only through undo/redo below)
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  undo: () => void;
  redo: () => void;

  // ---- pages ----
  /**
   * Shows another page. Not an undo step. The selection (selectedId, the
   * Transformer, an open text editor or crop) is reset: an element of one page
   * must never stay "selected" on another.
   */
  goToPage: (index: number) => void;
  /** Inserts an empty page after the active one (same size and background) and shows it. */
  addPage: () => void;
  /** Copies a page (default: the active one) with all its elements, right after it, and shows the copy. */
  duplicatePage: (index?: number) => void;
  /** Removes a page (default: the active one). The last remaining page cannot be deleted; returns false then. */
  deletePage: (index?: number) => boolean;

  // canvas meta of the ACTIVE page (size is clamped to CANVAS_LIMITS; repeated
  // calls, e.g. a dragged color picker, collapse into one undo step)
  setCanvasMeta: (meta: Partial<CanvasMeta>, options?: CanvasMetaOptions) => void;

  // selection
  /** Selects one element (or nothing, with null). */
  setSelectedId: (id: string | null) => void;
  /** Selects exactly these elements of the active page (unknown ids are ignored). */
  setSelection: (ids: string[]) => void;
  /** Ctrl/Cmd+click: adds the element to the selection, or takes it out when it is in already. */
  toggleSelected: (id: string) => void;

  // element CRUD (all on the active page)
  addTextElement: (preset?: "title" | "subtitle" | "paragraph") => void;
  addShapeElement: (shapeType: ShapeKind) => void;
  /**
   * Places an uploaded picture, fitted inside the canvas. Centred on the canvas,
   * or — for a picture dropped on the canvas — centred on `options.at`, a point
   * in DESIGN pixels (the cursor, converted by lib/dropImage).
   */
  addImageElement: (image: ImageSource, options?: { at?: Point }) => void;
  /**
   * Applies a crop gesture (see lib/crop.ts): the new visible part of the
   * picture and the box that shows it. One call = one undo step; a patch that
   * changes nothing, or is not valid, does nothing.
   */
  setImageCrop: (id: string, patch: CropPatch) => void;
  /** Shows the whole picture again (at the size it has now). One undo step. */
  resetImageCrop: (id: string) => void;
  /**
   * Changes the look of a picture: filter (brightness, contrast, saturation,
   * preset), blur, corner radius, shadow, border, mask. A field set to
   * `undefined` is removed. Continuous (slider) edits collapse into one undo
   * step, like updateElement.
   */
  setImageStyle: (id: string, patch: ImageStylePatch) => void;
  /**
   * The same for any element: opacity and shadow for every type, the border
   * (stroke) for text and shapes, and all of the picture fields for a picture.
   * Keys an element does not take are ignored. Collapses like setImageStyle.
   */
  setElementStyle: (id: string, patch: ElementStylePatch) => void;
  /** Mirrors a picture inside its box, horizontally (x) or vertically (y). One undo step. */
  flipImage: (id: string, axis: "x" | "y") => void;
  /**
   * Scales an element proportionally to the largest size that fits the page,
   * centred, upright. One undo step; nothing happens when it already fits that way.
   */
  fitToPage: (id: string) => void;
  /** Swaps the picture of an image element, keeping its position and width. */
  replaceImageSource: (id: string, image: ImageSource) => void;
  /** A field set to `undefined` in `attrs` is removed from the element. */
  updateElement: (id: string, attrs: Partial<CanvasElement>) => void;
  /**
   * Several elements changed by ONE gesture (moving or transforming a multiple
   * selection): one undo step for all of them. `batchKey` groups the calls of
   * that gesture, like the element id does for updateElement.
   */
  updateElements: (changes: Array<{ id: string; attrs: Partial<CanvasElement> }>, batchKey: string) => void;
  /** Layout-derived height of an auto-height text node. Never creates an undo step. */
  syncMeasuredHeight: (id: string, height: number) => void;
  removeElement: (id: string) => void;
  removeSelected: () => void;
  reorderElement: (id: string, direction: ReorderDirection) => void;
  nudgeSelected: (dx: number, dy: number) => void;

  // serialization. Async because uploaded pictures (temporary blob: URLs) are
  // read back and embedded as data: URLs so the file works after a refresh.
  // The WHOLE document (every page) is written to one file.
  exportToJSON: (format?: ExportFormat) => Promise<ExportResult>;
  loadFromJSON: (jsonData: string | unknown) => LoadResult;
  reset: () => void;
}

function nextZIndex(elements: CanvasElement[]): number {
  return elements.length === 0 ? 1 : Math.max(...elements.map((e) => e.zIndex)) + 1;
}

const TEXT_PRESETS: Record<"title" | "subtitle" | "paragraph", { text: string; fontSize: number }> = {
  title: { text: "Add a title", fontSize: 48 },
  subtitle: { text: "Add a subtitle", fontSize: 28 },
  paragraph: { text: "Add a bit of body text here. Double click to edit.", fontSize: 16 },
};

const NEW_TEXT_LINE_HEIGHT = 1.2;

type PagesPatch = Pick<EditorState, "pages">;

/** `state.pages` with the ACTIVE page replaced by `change(page)`. */
function withCurrentPage(state: EditorState, change: (page: Page) => Page): PagesPatch {
  return {
    pages: state.pages.map((page, i) => (i === state.currentPageIndex ? change(page) : page)),
  };
}

/** `state.pages` with the elements of the ACTIVE page replaced by `change(elements)`. */
function withElements(state: EditorState, change: (elements: CanvasElement[]) => CanvasElement[]): PagesPatch {
  return withCurrentPage(state, (page) => ({ ...page, elements: change(page.elements) }));
}

/** Cleared on every page change and on every Undo/Redo. */
const NO_SELECTION = { selectedId: null, selectedIds: [] as string[], editingId: null, croppingId: null };

/** The selection fields for exactly `ids` (already checked to be on the active page). */
function selectionOf(ids: string[]): Pick<EditorState, "selectedIds" | "selectedId"> {
  return { selectedIds: ids, selectedId: ids.length === 1 ? ids[0] : null };
}

/** `attrs` applied to `el`; a field set to `undefined` is removed instead of kept as undefined. */
function applyAttrs(el: CanvasElement, attrs: Partial<CanvasElement>): CanvasElement {
  const next = { ...el, ...attrs } as Record<string, unknown>;
  for (const key of Object.keys(attrs)) {
    if (next[key] === undefined) delete next[key];
  }
  return next as unknown as CanvasElement;
}

export const useEditorStore = create<EditorState>((set, get) => {
  // -------------------------------------------------------------------
  // Internal history machinery. These are closures over `set`/`get`,
  // not store actions themselves — components never call these
  // directly, they only call the mutating actions below, which call
  // these at the right moment.
  // -------------------------------------------------------------------

  // A pending "before" snapshot for a burst of rapid, same-gesture edits
  // (dragging a shape, dragging a color-picker thumb, holding an arrow
  // key down) that hasn't been sealed into `past` yet. Module-scoped
  // (not store state) on purpose: it is bookkeeping for the history
  // algorithm, not document data, so it must never trigger a re-render
  // or get caught up in undo/redo itself.
  let pendingSnapshot: HistorySnapshot | null = null;
  // Which element the in-flight batch belongs to (we key it by element id,
  // since every continuous edit in this app targets exactly one element).
  // This stops an unrelated burst from swallowing the previous one — e.g.
  // dragging shape A, then immediately dragging shape B half a second
  // later, must still produce two separate undo steps, not one.
  let pendingBatchKey: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // -------------------------------------------------------------------
  // Object-URL lifetime (see lib/objectUrls.ts for the full reasoning).
  //
  // A picture's blob: URL must outlive the element that shows it, because
  // Undo can bring that element back. So it is revoked only when NOTHING that
  // could still draw it refers to it: not the pages of the document, not any
  // undo/redo snapshot, not the batch snapshot still waiting to be sealed,
  // and not the clipboard. Deleting or replacing a picture (or a whole page)
  // therefore frees its memory as soon as it is gone for good — i.e. when it
  // falls out of the history — never earlier.
  //
  // Called after every change that can drop a reference.
  // -------------------------------------------------------------------
  function releaseOrphanUrls() {
    if (!hasTrackedObjectUrls()) return; // nothing was ever uploaded: free
    const { pages, past, future, clipboard } = get();
    const referenced = collectImageSources(pages);
    past.forEach((snap) => collectImageSources(snap.pages).forEach((src) => referenced.add(src)));
    future.forEach((snap) => collectImageSources(snap.pages).forEach((src) => referenced.add(src)));
    if (pendingSnapshot) collectImageSources(pendingSnapshot.pages).forEach((src) => referenced.add(src));
    if (clipboard && clipboard.type === "image") referenced.add(clipboard.src);

    releaseUnreferencedObjectUrls(referenced).forEach(evictImage);
  }

  function sealPendingSnapshot() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingSnapshot) {
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      pendingBatchKey = null;
      set((state) => ({
        past: [...state.past, snap].slice(-MAX_HISTORY),
        future: [], // a new branch of edits invalidates any old "redo" line
      }));
      releaseOrphanUrls(); // the trim / cleared redo line may have dropped the last reference
    }
  }

  /** Call BEFORE a one-shot, discrete change (add/remove/reorder/paste/...). */
  function recordHistoryNow() {
    // Flush first so this discrete step never gets merged into an
    // unrelated in-flight drag/typing burst.
    sealPendingSnapshot();
    const { pages, currentPageIndex } = get();
    const snap = cloneSnapshot(pages, currentPageIndex);
    set((state) => ({
      past: [...state.past, snap].slice(-MAX_HISTORY),
      future: [],
    }));
    releaseOrphanUrls();
  }

  /**
   * Tells the step recorded by the last recordHistoryNow() which page the
   * change left on screen (see HistorySnapshot.afterPageIndex).
   */
  function markViewAfterLastStep(pageIndex: number) {
    set((state) => {
      const last = state.past[state.past.length - 1];
      if (!last) return state;
      return { past: [...state.past.slice(0, -1), { ...last, afterPageIndex: pageIndex }] };
    });
  }

  /**
   * Call BEFORE a continuous change (drag, resize, slider/color input).
   * `batchKey` is the id of the element being touched: repeated calls with
   * the SAME key keep extending one open batch (so 50 drag-move events or
   * 20 keystrokes in a number field collapse into a single undo step);
   * a call with a DIFFERENT key closes out whatever batch was open first.
   */
  function recordHistoryDebounced(batchKey: string) {
    if (pendingSnapshot && pendingBatchKey !== batchKey) {
      sealPendingSnapshot();
    }
    if (!pendingSnapshot) {
      const { pages, currentPageIndex } = get();
      pendingSnapshot = cloneSnapshot(pages, currentPageIndex);
      pendingBatchKey = batchKey;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sealPendingSnapshot, HISTORY_DEBOUNCE_MS);
  }

  /** The element with `id` on the active page. */
  function findOnCurrentPage(id: string): CanvasElement | undefined {
    return selectCurrentPage(get()).elements.find((e) => e.id === id);
  }

  return {
    pages: [createBlankPage(DEFAULT_CANVAS)],
    currentPageIndex: 0,
    selectedId: null,
    selectedIds: [],
    clipboard: null,
    editingId: null,
    croppingId: null,
    stageNode: null,
    loadRevision: 0,
    exportProgress: null,
    past: [],
    future: [],

    setStageNode: (stage) => set({ stageNode: stage }),
    setEditingId: (id) => set({ editingId: id }),
    setExportProgress: (progress) => set({ exportProgress: progress }),

    setCroppingId: (id) =>
      set((state) => {
        if (id === null) return state.croppingId === null ? state : { croppingId: null };
        const target = selectCurrentPage(state).elements.find((e) => e.id === id);
        if (!target || target.type !== "image") return state; // only a picture can be cropped
        // Cropping works on the selected picture (alone); it also ends any text editing.
        return { croppingId: id, ...selectionOf([id]), editingId: null };
      }),

    undo: () => {
      // Finish sealing whatever burst is in flight first, so the stacks
      // are consistent before we pop from them.
      sealPendingSnapshot();
      const { past, future, pages } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      // Redo shows the page the step ended on: the one it created (add /
      // duplicate), or else the page where the change was made.
      const redoView = clampPageIndex(previous.afterPageIndex ?? previous.currentPageIndex, pages.length);
      const currentSnap = cloneSnapshot(pages, redoView, previous.currentPageIndex);
      set({
        past: past.slice(0, -1),
        future: [currentSnap, ...future].slice(0, MAX_HISTORY),
        pages: previous.pages,
        currentPageIndex: clampPageIndex(previous.currentPageIndex, previous.pages.length),
        ...NO_SELECTION,
      });
      releaseOrphanUrls(); // `future` is capped, so a snapshot may have just fallen off
    },

    redo: () => {
      sealPendingSnapshot();
      const { past, future, pages } = get();
      if (future.length === 0) return;
      const next = future[0];
      // Undo, again, shows the page the step was made on.
      const undoView = clampPageIndex(next.afterPageIndex ?? next.currentPageIndex, pages.length);
      const currentSnap = cloneSnapshot(pages, undoView, next.currentPageIndex);
      set({
        future: future.slice(1),
        past: [...past, currentSnap].slice(-MAX_HISTORY),
        pages: next.pages,
        currentPageIndex: clampPageIndex(next.currentPageIndex, next.pages.length),
        ...NO_SELECTION,
      });
      releaseOrphanUrls();
    },

    // -------------------------------------------------------------------
    // Pages
    // -------------------------------------------------------------------
    goToPage: (index) => {
      const { pages, currentPageIndex } = get();
      if (!isPageIndex(index, pages.length) || index === currentPageIndex) return;
      // Finish any drag/typing burst on the page we are leaving, so it can
      // never be merged into an edit made on the next page.
      sealPendingSnapshot();
      set({ currentPageIndex: index, ...NO_SELECTION });
    },

    addPage: () => {
      recordHistoryNow();
      set((state) => {
        const blank = createBlankPage(selectCurrentPage(state).canvas);
        const at = state.currentPageIndex + 1;
        return {
          pages: [...state.pages.slice(0, at), blank, ...state.pages.slice(at)],
          currentPageIndex: at,
          ...NO_SELECTION,
        };
      });
      markViewAfterLastStep(get().currentPageIndex); // Redo lands on the new page
    },

    duplicatePage: (index) => {
      const { pages, currentPageIndex } = get();
      const from = index === undefined ? currentPageIndex : index;
      if (!isPageIndex(from, pages.length)) return;
      recordHistoryNow();
      set((state) => {
        const copy = duplicatePageData(state.pages[from]);
        const at = from + 1;
        return {
          pages: [...state.pages.slice(0, at), copy, ...state.pages.slice(at)],
          currentPageIndex: at,
          ...NO_SELECTION,
        };
      });
      markViewAfterLastStep(get().currentPageIndex); // Redo lands on the copy
      // A copied picture shares its URL with the original: both keep it alive.
      releaseOrphanUrls();
    },

    deletePage: (index) => {
      const { pages, currentPageIndex } = get();
      const target = index === undefined ? currentPageIndex : index;
      // A document always has a page: the last one cannot be deleted.
      if (pages.length <= 1 || !isPageIndex(target, pages.length)) return false;
      recordHistoryNow();
      set((state) => ({
        pages: state.pages.filter((_, i) => i !== target),
        currentPageIndex: indexAfterDelete(state.currentPageIndex, target, state.pages.length - 1),
        ...NO_SELECTION,
      }));
      markViewAfterLastStep(get().currentPageIndex);
      // The deleted page is still in the history snapshot just recorded, so
      // Undo works; its pictures are revoked once that snapshot is gone.
      releaseOrphanUrls();
      return true;
    },

    // Workspace size / background of the active page (or of every page). Whatever
    // the caller passes is made safe here, so no UI can put the canvas into a
    // state Konva cannot draw: sizes are whole pixels within CANVAS_LIMITS,
    // NaN/Infinity are ignored, and the color is normalized to #rrggbb (or
    // "transparent").
    //
    // Goes through the debounced history path (batch key "canvas"): typing a
    // size or dragging the color picker produces one undo step, not dozens.
    // The Stage, the background rect and stage.toDataURL() all read the page's
    // canvas, so a change here is immediately the new working area AND the
    // new export size.
    setCanvasMeta: (meta, options) => {
      const state = get();
      const current = selectCurrentPage(state).canvas;
      // Resolve against the ACTIVE page; the same resolved values then go to
      // the other pages when `allPages` is set.
      const resolved: Partial<CanvasMeta> = {};
      if (meta.width !== undefined) resolved.width = clampDimension(meta.width, current.width);
      if (meta.height !== undefined) resolved.height = clampDimension(meta.height, current.height);
      if (meta.backgroundColor !== undefined) {
        resolved.backgroundColor = normalizeColor(meta.backgroundColor, current.backgroundColor);
      }

      const apply = (canvas: CanvasMeta): CanvasMeta => ({ ...canvas, ...resolved });
      const differs = (canvas: CanvasMeta): boolean => {
        const next = apply(canvas);
        return (
          next.width !== canvas.width ||
          next.height !== canvas.height ||
          next.backgroundColor !== canvas.backgroundColor
        );
      };

      const targets = options?.allPages
        ? state.pages.map((_, i) => i)
        : [state.currentPageIndex];
      if (!targets.some((i) => differs(state.pages[i].canvas))) return; // nothing changed: no undo step

      recordHistoryDebounced("canvas");
      set((s) => ({
        pages: s.pages.map((page, i) => (targets.includes(i) ? { ...page, canvas: apply(page.canvas) } : page)),
      }));
    },

    // Selection is deliberately NOT recorded in history — undo should
    // restore what the design looks like, not which handle was active.
    setSelectedId: (id) =>
      set((state) => ({
        ...selectionOf(id === null ? [] : [id]),
        // Selecting something else (or nothing) ends cropping.
        croppingId: state.croppingId === id ? state.croppingId : null,
      })),

    setSelection: (ids) =>
      set((state) => {
        const onPage = new Set(selectCurrentPage(state).elements.map((e) => e.id));
        const next = Array.from(new Set(ids)).filter((id) => onPage.has(id));
        const same =
          next.length === state.selectedIds.length && next.every((id, i) => id === state.selectedIds[i]);
        if (same) return state; // a marquee fires this on every mouse move
        const sel = selectionOf(next);
        return {
          ...sel,
          // Cropping and text editing belong to one selected element.
          croppingId: state.croppingId !== null && state.croppingId === sel.selectedId ? state.croppingId : null,
          editingId: state.editingId !== null && state.editingId === sel.selectedId ? state.editingId : null,
        };
      }),

    toggleSelected: (id) => {
      const { selectedIds, setSelection } = get();
      setSelection(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    },

    addTextElement: (preset = "paragraph") => {
      recordHistoryNow();
      const { canvas, elements } = selectCurrentPage(get());
      const p = TEXT_PRESETS[preset];
      const el: TextElement = {
        id: newId(),
        type: "text",
        x: canvas.width / 2 - 150,
        y: canvas.height / 2 - 20,
        width: 300,
        height: p.fontSize * NEW_TEXT_LINE_HEIGHT, // re-measured by the renderer once drawn
        rotation: 0,
        zIndex: nextZIndex(elements),
        text: p.text,
        fontSize: p.fontSize,
        fontFamily: DEFAULT_FONT_FAMILY,
        fill: "#111111",
        align: "left",
        fontStyle: "normal",
        lineHeight: NEW_TEXT_LINE_HEIGHT,
      };
      set((state) => ({ ...withElements(state, (list) => [...list, el]), ...selectionOf([el.id]) }));
    },

    addShapeElement: (shapeType) => {
      recordHistoryNow();
      const { canvas, elements } = selectCurrentPage(get());
      const size = shapeType === "circle" ? 160 : 200;
      const el: ShapeElement = {
        id: newId(),
        type: "shape",
        shapeType,
        // top-left corner, like every other element
        x: canvas.width / 2 - size / 2,
        y: canvas.height / 2 - (shapeType === "rect" ? size * 0.7 : size) / 2,
        width: size,
        height: shapeType === "rect" ? size * 0.7 : size,
        rotation: 0,
        zIndex: nextZIndex(elements),
        fill: "#6366f1",
        stroke: "#312e81",
        strokeWidth: 2,
        cornerRadius: shapeType === "rect" ? 4 : 0,
      };
      set((state) => ({ ...withElements(state, (list) => [...list, el]), ...selectionOf([el.id]) }));
    },

    addImageElement: ({ src, naturalWidth, naturalHeight, vector }, options) => {
      recordHistoryNow();
      trackObjectUrl(src); // from now on this store is responsible for revoking it
      const { canvas, elements } = selectCurrentPage(get());
      const size = fitImageToCanvas(naturalWidth, naturalHeight, canvas);
      // top-left corner, like every other element: centred on the canvas, or
      // on the point the picture was dropped at
      const corner = options?.at
        ? topLeftForCentre(size, options.at)
        : { x: (canvas.width - size.width) / 2, y: (canvas.height - size.height) / 2 };
      const el: ImageElement = {
        id: newId(),
        type: "image",
        x: corner.x,
        y: corner.y,
        width: size.width,
        height: size.height,
        rotation: 0,
        zIndex: nextZIndex(elements),
        src,
        cropX: 0,
        cropY: 0,
        cropWidth: 1,
        cropHeight: 1,
        scaleX: 1,
        scaleY: 1,
        ...(vector ? { vector: true } : {}),
      };
      // A new picture takes over the selection: any text edit or crop in
      // progress on another element ends.
      set((state) => ({
        ...withElements(state, (list) => [...list, el]),
        ...selectionOf([el.id]),
        editingId: null,
        croppingId: null,
      }));
    },

    setImageCrop: (id, patch) => {
      const target = findOnCurrentPage(id);
      if (!target || target.type !== "image") return;
      const safe = sanitizeCropPatch(patch);
      if (!safe || !cropPatchChanges(target, safe)) return;
      // A gesture is ONE step, however many pointer moves it had: the overlay
      // only calls this when the pointer is released.
      recordHistoryNow();
      set((state) =>
        withElements(state, (list) =>
          list.map((e) => (e.id === id && e.type === "image" ? { ...e, ...safe } : e))
        )
      );
    },

    resetImageCrop: (id) => {
      const target = findOnCurrentPage(id);
      if (!target || target.type !== "image") return;
      get().setImageCrop(id, resetCrop(target));
    },

    setImageStyle: (id, patch) => {
      const target = findOnCurrentPage(id);
      if (!target || target.type !== "image") return;
      // Nothing would change (or nothing is usable): no undo step either.
      if (applyImageStylePatch(target, patch) === target) return;
      recordHistoryDebounced(id);
      set((state) =>
        withElements(state, (list) =>
          list.map((e) => (e.id === id && e.type === "image" ? applyImageStylePatch(e, patch) : e))
        )
      );
    },

    setElementStyle: (id, patch) => {
      const target = findOnCurrentPage(id);
      if (!target) return;
      // Nothing would change (or nothing is usable): no undo step either.
      if (applyElementStylePatch(target, patch) === target) return;
      recordHistoryDebounced(id);
      set((state) =>
        withElements(state, (list) => list.map((e) => (e.id === id ? applyElementStylePatch(e, patch) : e)))
      );
    },

    flipImage: (id, axis) => {
      const target = findOnCurrentPage(id);
      if (!target || target.type !== "image") return;
      recordHistoryNow();
      set((state) =>
        withElements(state, (list) =>
          list.map((e) => {
            if (e.id !== id || e.type !== "image") return e;
            return axis === "x" ? { ...e, scaleX: e.scaleX === -1 ? 1 : -1 } : { ...e, scaleY: e.scaleY === -1 ? 1 : -1 };
          })
        )
      );
    },

    fitToPage: (id) => {
      const target = findOnCurrentPage(id);
      if (!target) return;
      const box = fitElementToPage(target, selectCurrentPage(get()).canvas);
      if (!box) return; // already fills the page that way
      recordHistoryNow();
      set((state) => withElements(state, (list) => list.map((e) => (e.id === id ? applyAttrs(e, box) : e))));
    },

    replaceImageSource: (id, { src, naturalWidth, naturalHeight, vector }) => {
      const target = findOnCurrentPage(id);
      if (!target || target.type !== "image") return;
      recordHistoryNow();
      trackObjectUrl(src);
      // Same position and width; the height follows the new picture's aspect
      // ratio so it is not stretched. The old crop belonged to the old picture.
      const aspect = naturalWidth > 0 && naturalHeight > 0 ? naturalHeight / naturalWidth : target.height / target.width;
      set((state) =>
        withElements(state, (list) =>
          list.map((e) => {
            if (e.id !== id || e.type !== "image") return e;
            // Position, width and mirroring are the user's; whether the new file
            // is a vector picture is the new file's.
            const { vector: _previous, ...rest } = e;
            return {
              ...rest,
              src,
              height: Math.round(e.width * aspect * 100) / 100,
              cropX: 0,
              cropY: 0,
              cropWidth: 1,
              cropHeight: 1,
              ...(vector ? { vector: true } : {}),
            };
          })
        )
      );
      // The old picture is still in the history snapshot just recorded, so
      // Undo works; its URL is revoked once that snapshot is gone.
      releaseOrphanUrls();
    },

    // Used for drag/resize/rotate (one call per gesture) AND for toolbar
    // inputs that fire on every keystroke/slide (many calls per gesture).
    // Either way it's a "continuous" edit, so it goes through the
    // debounced recorder rather than creating one history entry per call.
    updateElement: (id, attrs) => {
      recordHistoryDebounced(id);
      set((state) => withElements(state, (list) => list.map((el) => (el.id === id ? applyAttrs(el, attrs) : el))));
    },

    updateElements: (changes, batchKey) => {
      if (changes.length === 0) return;
      recordHistoryDebounced(batchKey);
      const byId = new Map(changes.map((c) => [c.id, c.attrs]));
      set((state) =>
        withElements(state, (list) =>
          list.map((el) => {
            const attrs = byId.get(el.id);
            return attrs ? applyAttrs(el, attrs) : el;
          })
        )
      );
    },

    // Text height is derived from the text, width and font (Konva measures
    // it), so this is bookkeeping for the JSON — not a user edit — and must
    // not show up as an undo step. Returning `state` unchanged is a no-op.
    syncMeasuredHeight: (id, height) =>
      set((state) => {
        const el = selectCurrentPage(state).elements.find((e) => e.id === id);
        if (!el || Math.abs(el.height - height) < 0.5) return state;
        return withElements(state, (list) => list.map((e) => (e.id === id ? { ...e, height } : e)));
      }),

    removeElement: (id) => {
      recordHistoryNow();
      set((state) => ({
        ...withElements(state, (list) => list.filter((el) => el.id !== id)),
        ...selectionOf(state.selectedIds.filter((x) => x !== id)),
        editingId: state.editingId === id ? null : state.editingId,
        croppingId: state.croppingId === id ? null : state.croppingId,
      }));
      // A deleted picture is still in the history snapshot just recorded, so
      // this normally revokes nothing yet — see releaseOrphanUrls().
      releaseOrphanUrls();
    },

    // Every selected element goes, in ONE undo step.
    removeSelected: () => {
      const { selectedIds, removeElement } = get();
      if (selectedIds.length === 0) return;
      if (selectedIds.length === 1) {
        removeElement(selectedIds[0]);
        return;
      }
      recordHistoryNow();
      const gone = new Set(selectedIds);
      set((state) => ({
        ...withElements(state, (list) => list.filter((el) => !gone.has(el.id))),
        ...NO_SELECTION,
      }));
      releaseOrphanUrls();
    },

    // -------------------------------------------------------------------
    // Copy / paste (Ctrl+C / Ctrl+V)
    // -------------------------------------------------------------------
    copySelected: () => {
      const { selectedId } = get();
      const el = selectedId === null ? undefined : findOnCurrentPage(selectedId);
      if (!el) return false;
      set({ clipboard: { ...el } });
      releaseOrphanUrls(); // the previous clipboard content no longer holds its picture
      return true;
    },

    pasteClipboard: () => {
      const { clipboard } = get();
      if (!clipboard) return false;

      recordHistoryNow();
      const copy = {
        ...clipboard,
        id: newId(),
        x: clipboard.x + PASTE_OFFSET,
        y: clipboard.y + PASTE_OFFSET,
        zIndex: nextZIndex(selectCurrentPage(get()).elements),
      } as CanvasElement;

      set((state) => ({
        ...withElements(state, (list) => [...list, copy]),
        ...selectionOf([copy.id]),
        // The clipboard now remembers the pasted position, so pressing
        // Ctrl+V repeatedly cascades (+20, +40, +60 ...) instead of
        // stacking every copy on the same spot.
        clipboard: { ...copy },
      }));
      // A pasted picture shares its URL with the original; both elements
      // keep it alive, and deleting one never revokes it under the other.
      releaseOrphanUrls();
      return true;
    },

    reorderElement: (id, direction) => {
      recordHistoryNow();
      set((state) =>
        withElements(state, (elements) => {
          const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
          const idx = sorted.findIndex((e) => e.id === id);
          if (idx === -1) return elements;

          if (direction === "front") {
            const maxZ = Math.max(...sorted.map((e) => e.zIndex));
            return elements.map((e) => (e.id === id ? { ...e, zIndex: maxZ + 1 } : e));
          }
          if (direction === "back") {
            const minZ = Math.min(...sorted.map((e) => e.zIndex));
            return elements.map((e) => (e.id === id ? { ...e, zIndex: minZ - 1 } : e));
          }
          if (direction === "forward" && idx < sorted.length - 1) {
            const other = sorted[idx + 1];
            const cur = sorted[idx];
            return elements.map((e) => {
              if (e.id === cur.id) return { ...e, zIndex: other.zIndex };
              if (e.id === other.id) return { ...e, zIndex: cur.zIndex };
              return e;
            });
          }
          if (direction === "backward" && idx > 0) {
            const other = sorted[idx - 1];
            const cur = sorted[idx];
            return elements.map((e) => {
              if (e.id === cur.id) return { ...e, zIndex: other.zIndex };
              if (e.id === other.id) return { ...e, zIndex: cur.zIndex };
              return e;
            });
          }
          return elements;
        })
      );
    },

    // Arrow-key nudging reuses updateElement, so a burst of key-repeats
    // while the key is held down also collapses into one undo step.
    // A multiple selection moves together, as one undo step per key burst.
    nudgeSelected: (dx, dy) => {
      const { selectedIds } = get();
      const changes = selectedIds
        .map((id) => findOnCurrentPage(id))
        .filter((el): el is CanvasElement => el !== undefined)
        .map((el) => ({ id: el.id, attrs: { x: el.x + dx, y: el.y + dy } }));
      if (changes.length === 1) get().updateElement(changes[0].id, changes[0].attrs);
      else get().updateElements(changes, `selection:${selectedIds.join(",")}`);
    },

    // -------------------------------------------------------------------
    // JSON serialization
    // -------------------------------------------------------------------
    exportToJSON: async (format = "kusuka") => {
      // Snapshot the document first; the user may keep editing while the
      // pictures are being read, and the file must reflect ONE moment.
      const { pages } = get();
      const doc: CanvasDocument = { version: SCHEMA_VERSION, pages };

      // blob: URLs die with the page, so uploaded pictures are embedded as
      // data: URLs in the exported copy (the live elements are untouched).
      const { document: portable, warnings } = await embedObjectUrls(doc);
      const out = format === "polotno" ? convertKusukaToPolotno(portable) : portable;
      return { json: JSON.stringify(out, null, 2), warnings };
    },

    // The one entry point for replacing the document: the Import button and
    // the template gallery both call this. Input may be a JSON string or an
    // already-parsed object, in native OR Polotno format — parseDocument()
    // detects which and maps every page to the native schema deterministically.
    loadFromJSON: (jsonData) => {
      const parsed = parseDocument(jsonData);
      if (!parsed.ok) return parsed;

      // Importing a whole new document is still a single, discrete,
      // undoable step -- so the design right before the import stays
      // one Ctrl+Z away.
      recordHistoryNow();
      set({
        pages: parsed.document.pages,
        currentPageIndex: 0,
        ...NO_SELECTION,
        loadRevision: get().loadRevision + 1,
      });
      markViewAfterLastStep(0); // Redo opens the imported document on its first page
      releaseOrphanUrls();
      return {
        ok: true,
        format: parsed.format,
        warnings: parsed.warnings,
        pageCount: parsed.document.pages.length,
      };
    },

    reset: () => {
      recordHistoryNow();
      set({
        pages: [createBlankPage(DEFAULT_CANVAS)],
        currentPageIndex: 0,
        ...NO_SELECTION,
      });
      markViewAfterLastStep(0);
      releaseOrphanUrls();
    },
  };
});
