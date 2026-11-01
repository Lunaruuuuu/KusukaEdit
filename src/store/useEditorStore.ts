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
import { clampDimension, fitImageToCanvas } from "@/lib/workspace";
import {
  hasTrackedObjectUrls,
  releaseUnreferencedObjectUrls,
  trackObjectUrl,
} from "@/lib/objectUrls";
import { evictImage } from "@/lib/imageCache";
import { embedObjectUrls } from "@/lib/imageData";

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

type ReorderDirection = "front" | "back" | "forward" | "backward";

// ---------------------------------------------------------------------------
// History (Undo / Redo)
// ---------------------------------------------------------------------------
// A snapshot only ever captures the two pieces of state that make up the
// *document* (canvas meta + elements) — never `selectedId` (selection isn't
// something a user expects "Undo" to restore), never `clipboard`, never
// `editingId` and never `stageNode` (a Konva.Stage instance isn't data).
interface HistorySnapshot {
  canvas: CanvasMeta;
  elements: CanvasElement[];
}

const MAX_HISTORY = 50;
// How long we wait, after the *last* change in a burst, before that burst
// is sealed into a single undo step. Chosen to cover one drag gesture or
// one "hold the arrow key" repeat without feeling laggy when the user
// deliberately presses Undo right after finishing an edit.
const HISTORY_DEBOUNCE_MS = 500;

// Where a pasted element lands relative to the one it was copied from.
const PASTE_OFFSET = 20;

function cloneSnapshot(canvas: CanvasMeta, elements: CanvasElement[]): HistorySnapshot {
  // Structural clone, not a reference copy — otherwise a later in-place
  // mutation of `elements` would silently corrupt the snapshot sitting in
  // the history stack.
  return {
    canvas: { ...canvas },
    elements: elements.map((el) => ({ ...el })),
  };
}

interface EditorState {
  canvas: CanvasMeta;
  elements: CanvasElement[];
  selectedId: string | null;

  // Element copied with Ctrl+C, waiting for Ctrl+V. Not part of the document
  // and never touched by undo/redo.
  clipboard: CanvasElement | null;
  copySelected: () => boolean;
  pasteClipboard: () => boolean;

  // Id of the text element currently being edited in the <textarea> overlay.
  // While set, global keyboard shortcuts are suspended and the Konva node is hidden.
  editingId: string | null;
  setEditingId: (id: string | null) => void;

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

  // history stacks (exposed read-only; mutate only through undo/redo below)
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  undo: () => void;
  redo: () => void;

  // canvas meta (size is clamped to CANVAS_LIMITS; repeated calls, e.g. a
  // dragged color picker, collapse into one undo step)
  setCanvasMeta: (meta: Partial<CanvasMeta>) => void;

  // selection
  setSelectedId: (id: string | null) => void;

  // element CRUD
  addTextElement: (preset?: "title" | "subtitle" | "paragraph") => void;
  addShapeElement: (shapeType: ShapeKind) => void;
  /** Places an uploaded picture, centred and fitted inside the canvas. */
  addImageElement: (image: ImageSource) => void;
  /** Swaps the picture of an image element, keeping its position and width. */
  replaceImageSource: (id: string, image: ImageSource) => void;
  updateElement: (id: string, attrs: Partial<CanvasElement>) => void;
  /** Layout-derived height of an auto-height text node. Never creates an undo step. */
  syncMeasuredHeight: (id: string, height: number) => void;
  removeElement: (id: string) => void;
  removeSelected: () => void;
  reorderElement: (id: string, direction: ReorderDirection) => void;
  nudgeSelected: (dx: number, dy: number) => void;

  // serialization. Async because uploaded pictures (temporary blob: URLs) are
  // read back and embedded as data: URLs so the file works after a refresh.
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
  // could still draw it refers to it: not the current elements, not any
  // undo/redo snapshot, not the batch snapshot still waiting to be sealed,
  // and not the clipboard. Deleting or replacing a picture therefore frees
  // its memory as soon as it is gone for good — i.e. when it falls out of the
  // history — never earlier.
  //
  // Called after every change that can drop a reference.
  // -------------------------------------------------------------------
  function releaseOrphanUrls() {
    if (!hasTrackedObjectUrls()) return; // nothing was ever uploaded: free
    const { elements, past, future, clipboard } = get();
    const referenced = new Set<string>();
    const collect = (list: CanvasElement[]) => {
      for (const el of list) if (el.type === "image") referenced.add(el.src);
    };
    collect(elements);
    past.forEach((snap) => collect(snap.elements));
    future.forEach((snap) => collect(snap.elements));
    if (pendingSnapshot) collect(pendingSnapshot.elements);
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
    const { canvas, elements } = get();
    const snap = cloneSnapshot(canvas, elements);
    set((state) => ({
      past: [...state.past, snap].slice(-MAX_HISTORY),
      future: [],
    }));
    releaseOrphanUrls();
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
      const { canvas, elements } = get();
      pendingSnapshot = cloneSnapshot(canvas, elements);
      pendingBatchKey = batchKey;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sealPendingSnapshot, HISTORY_DEBOUNCE_MS);
  }

  return {
    canvas: { ...DEFAULT_CANVAS },
    elements: [],
    selectedId: null,
    clipboard: null,
    editingId: null,
    stageNode: null,
    loadRevision: 0,
    past: [],
    future: [],

    setStageNode: (stage) => set({ stageNode: stage }),
    setEditingId: (id) => set({ editingId: id }),

    undo: () => {
      // Finish sealing whatever burst is in flight first, so the stacks
      // are consistent before we pop from them.
      sealPendingSnapshot();
      const { past, future, canvas, elements } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const currentSnap = cloneSnapshot(canvas, elements);
      set({
        past: past.slice(0, -1),
        future: [currentSnap, ...future].slice(0, MAX_HISTORY),
        canvas: previous.canvas,
        elements: previous.elements,
        selectedId: null,
        editingId: null,
      });
      releaseOrphanUrls(); // `future` is capped, so a snapshot may have just fallen off
    },

    redo: () => {
      sealPendingSnapshot();
      const { past, future, canvas, elements } = get();
      if (future.length === 0) return;
      const next = future[0];
      const currentSnap = cloneSnapshot(canvas, elements);
      set({
        future: future.slice(1),
        past: [...past, currentSnap].slice(-MAX_HISTORY),
        canvas: next.canvas,
        elements: next.elements,
        selectedId: null,
        editingId: null,
      });
      releaseOrphanUrls();
    },

    // Workspace size / background. Whatever the caller passes is made safe
    // here, so no UI can put the canvas into a state Konva cannot draw:
    // sizes are whole pixels within CANVAS_LIMITS, NaN/Infinity are ignored,
    // and the color is normalized to #rrggbb (or "transparent").
    //
    // Goes through the debounced history path (batch key "canvas"): typing a
    // size or dragging the color picker produces one undo step, not dozens.
    // The Stage, the background rect and stage.toDataURL() all read this
    // object, so a change here is immediately the new working area AND the
    // new export size.
    setCanvasMeta: (meta) => {
      const current = get().canvas;
      const next: CanvasMeta = {
        width: meta.width === undefined ? current.width : clampDimension(meta.width, current.width),
        height: meta.height === undefined ? current.height : clampDimension(meta.height, current.height),
        backgroundColor:
          meta.backgroundColor === undefined
            ? current.backgroundColor
            : normalizeColor(meta.backgroundColor, current.backgroundColor),
      };
      if (
        next.width === current.width &&
        next.height === current.height &&
        next.backgroundColor === current.backgroundColor
      ) {
        return; // nothing changed: no undo step
      }
      recordHistoryDebounced("canvas");
      set({ canvas: next });
    },

    // Selection is deliberately NOT recorded in history — undo should
    // restore what the design looks like, not which handle was active.
    setSelectedId: (id) => set({ selectedId: id }),

    addTextElement: (preset = "paragraph") => {
      recordHistoryNow();
      const { elements, canvas } = get();
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
      set((state) => ({ elements: [...state.elements, el], selectedId: el.id }));
    },

    addShapeElement: (shapeType) => {
      recordHistoryNow();
      const { elements, canvas } = get();
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
      set((state) => ({ elements: [...state.elements, el], selectedId: el.id }));
    },

    addImageElement: ({ src, naturalWidth, naturalHeight, vector }) => {
      recordHistoryNow();
      trackObjectUrl(src); // from now on this store is responsible for revoking it
      const { elements, canvas } = get();
      const size = fitImageToCanvas(naturalWidth, naturalHeight, canvas);
      const el: ImageElement = {
        id: newId(),
        type: "image",
        // top-left corner, like every other element; centred on the canvas
        x: (canvas.width - size.width) / 2,
        y: (canvas.height - size.height) / 2,
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
      set((state) => ({ elements: [...state.elements, el], selectedId: el.id }));
    },

    replaceImageSource: (id, { src, naturalWidth, naturalHeight, vector }) => {
      const target = get().elements.find((e) => e.id === id);
      if (!target || target.type !== "image") return;
      recordHistoryNow();
      trackObjectUrl(src);
      // Same position and width; the height follows the new picture's aspect
      // ratio so it is not stretched. The old crop belonged to the old picture.
      const aspect = naturalWidth > 0 && naturalHeight > 0 ? naturalHeight / naturalWidth : target.height / target.width;
      set((state) => ({
        elements: state.elements.map((e) => {
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
        }),
      }));
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
      set((state) => ({
        elements: state.elements.map((el) =>
          el.id === id ? ({ ...el, ...attrs } as CanvasElement) : el
        ),
      }));
    },

    // Text height is derived from the text, width and font (Konva measures
    // it), so this is bookkeeping for the JSON — not a user edit — and must
    // not show up as an undo step. Returning `state` unchanged is a no-op.
    syncMeasuredHeight: (id, height) =>
      set((state) => {
        const el = state.elements.find((e) => e.id === id);
        if (!el || Math.abs(el.height - height) < 0.5) return state;
        return {
          elements: state.elements.map((e) => (e.id === id ? { ...e, height } : e)),
        };
      }),

    removeElement: (id) => {
      recordHistoryNow();
      set((state) => ({
        elements: state.elements.filter((el) => el.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        editingId: state.editingId === id ? null : state.editingId,
      }));
      // A deleted picture is still in the history snapshot just recorded, so
      // this normally revokes nothing yet — see releaseOrphanUrls().
      releaseOrphanUrls();
    },

    removeSelected: () => {
      const { selectedId, removeElement } = get();
      if (selectedId) removeElement(selectedId);
    },

    // -------------------------------------------------------------------
    // Copy / paste (Ctrl+C / Ctrl+V)
    // -------------------------------------------------------------------
    copySelected: () => {
      const { selectedId, elements } = get();
      const el = elements.find((e) => e.id === selectedId);
      if (!el) return false;
      set({ clipboard: { ...el } });
      releaseOrphanUrls(); // the previous clipboard content no longer holds its picture
      return true;
    },

    pasteClipboard: () => {
      const { clipboard, elements } = get();
      if (!clipboard) return false;

      recordHistoryNow();
      const copy = {
        ...clipboard,
        id: newId(),
        x: clipboard.x + PASTE_OFFSET,
        y: clipboard.y + PASTE_OFFSET,
        zIndex: nextZIndex(elements),
      } as CanvasElement;

      set((state) => ({
        elements: [...state.elements, copy],
        selectedId: copy.id,
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
      set((state) => {
        const sorted = [...state.elements].sort((a, b) => a.zIndex - b.zIndex);
        const idx = sorted.findIndex((e) => e.id === id);
        if (idx === -1) return state;

        if (direction === "front") {
          const maxZ = Math.max(...sorted.map((e) => e.zIndex));
          return {
            elements: state.elements.map((e) => (e.id === id ? { ...e, zIndex: maxZ + 1 } : e)),
          };
        }
        if (direction === "back") {
          const minZ = Math.min(...sorted.map((e) => e.zIndex));
          return {
            elements: state.elements.map((e) => (e.id === id ? { ...e, zIndex: minZ - 1 } : e)),
          };
        }
        if (direction === "forward" && idx < sorted.length - 1) {
          const other = sorted[idx + 1];
          const cur = sorted[idx];
          return {
            elements: state.elements.map((e) => {
              if (e.id === cur.id) return { ...e, zIndex: other.zIndex };
              if (e.id === other.id) return { ...e, zIndex: cur.zIndex };
              return e;
            }),
          };
        }
        if (direction === "backward" && idx > 0) {
          const other = sorted[idx - 1];
          const cur = sorted[idx];
          return {
            elements: state.elements.map((e) => {
              if (e.id === cur.id) return { ...e, zIndex: other.zIndex };
              if (e.id === other.id) return { ...e, zIndex: cur.zIndex };
              return e;
            }),
          };
        }
        return state;
      });
    },

    // Arrow-key nudging reuses updateElement, so a burst of key-repeats
    // while the key is held down also collapses into one undo step.
    nudgeSelected: (dx, dy) => {
      const { selectedId, elements } = get();
      if (!selectedId) return;
      const el = elements.find((e) => e.id === selectedId);
      if (!el) return;
      get().updateElement(selectedId, { x: el.x + dx, y: el.y + dy });
    },

    // -------------------------------------------------------------------
    // JSON serialization
    // -------------------------------------------------------------------
    exportToJSON: async (format = "kusuka") => {
      // Snapshot the document first; the user may keep editing while the
      // pictures are being read, and the file must reflect ONE moment.
      const { canvas, elements } = get();
      const doc: CanvasDocument = { version: SCHEMA_VERSION, canvas, elements };

      // blob: URLs die with the page, so uploaded pictures are embedded as
      // data: URLs in the exported copy (the live elements are untouched).
      const { document: portable, warnings } = await embedObjectUrls(doc);
      const out = format === "polotno" ? convertKusukaToPolotno(portable) : portable;
      return { json: JSON.stringify(out, null, 2), warnings };
    },

    // The one entry point for replacing the canvas: the Import button and
    // the template gallery both call this. Input may be a JSON string or an
    // already-parsed object, in native OR Polotno format — parseDocument()
    // detects which and maps it to the native schema deterministically.
    loadFromJSON: (jsonData) => {
      const parsed = parseDocument(jsonData);
      if (!parsed.ok) return parsed;

      // Importing a whole new document is still a single, discrete,
      // undoable step -- so the design right before the import stays
      // one Ctrl+Z away.
      recordHistoryNow();
      set({
        canvas: parsed.document.canvas,
        elements: parsed.document.elements,
        selectedId: null,
        editingId: null,
        loadRevision: get().loadRevision + 1,
      });
      releaseOrphanUrls();
      return { ok: true, format: parsed.format, warnings: parsed.warnings };
    },

    reset: () => {
      recordHistoryNow();
      set({ canvas: { ...DEFAULT_CANVAS }, elements: [], selectedId: null, editingId: null });
      releaseOrphanUrls();
    },
  };
});
