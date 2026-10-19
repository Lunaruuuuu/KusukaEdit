import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type Konva from "konva";
import {
  CanvasDocument,
  CanvasElement,
  CanvasMeta,
  ShapeKind,
  TextElement,
  ShapeElement,
} from "@/types/editor";

const DEFAULT_CANVAS: CanvasMeta = {
  width: 900,
  height: 600,
  backgroundColor: "#ffffff",
};

type ReorderDirection = "front" | "back" | "forward" | "backward";

// ---------------------------------------------------------------------------
// History (Undo / Redo)
// ---------------------------------------------------------------------------
// A snapshot only ever captures the two pieces of state that make up the
// *document* (canvas meta + elements) — never `selectedId` (selection isn't
// something a user expects "Undo" to restore) and never `stageNode` (a
// Konva.Stage instance isn't data, so it can't be part of history).
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

  // the live Konva.Stage instance, registered by CanvasWorkspace once it
  // mounts. Not part of the document and never touched by undo/redo — it
  // only exists so the Export-to-Image button can reach the canvas.
  stageNode: Konva.Stage | null;
  setStageNode: (stage: Konva.Stage | null) => void;

  // history stacks (exposed read-only; mutate only through undo/redo below)
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  undo: () => void;
  redo: () => void;

  // canvas meta
  setCanvasMeta: (meta: Partial<CanvasMeta>) => void;

  // selection
  setSelectedId: (id: string | null) => void;

  // element CRUD
  addTextElement: (preset?: "title" | "subtitle" | "paragraph") => void;
  addShapeElement: (shapeType: ShapeKind) => void;
  updateElement: (id: string, attrs: Partial<CanvasElement>) => void;
  removeElement: (id: string) => void;
  removeSelected: () => void;
  reorderElement: (id: string, direction: ReorderDirection) => void;
  nudgeSelected: (dx: number, dy: number) => void;

  // serialization
  exportToJSON: () => string;
  loadFromJSON: (jsonString: string) => { ok: boolean; error?: string };
  reset: () => void;
}

function nextZIndex(elements: CanvasElement[]): number {
  return elements.length === 0 ? 1 : Math.max(...elements.map((e) => e.zIndex)) + 1;
}

const TEXT_PRESETS: Record<"title" | "subtitle" | "paragraph", Partial<TextElement>> = {
  title: { text: "Add a title", fontSize: 48, fontFamily: "Inter, sans-serif" },
  subtitle: { text: "Add a subtitle", fontSize: 28, fontFamily: "Inter, sans-serif" },
  paragraph: {
    text: "Add a bit of body text here. Double click to edit.",
    fontSize: 16,
    fontFamily: "Inter, sans-serif",
  },
};

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
    }
  }

  /** Call BEFORE a one-shot, discrete change (add/remove/reorder/...). */
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
    stageNode: null,
    past: [],
    future: [],

    setStageNode: (stage) => set({ stageNode: stage }),

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
      });
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
      });
    },

    setCanvasMeta: (meta) => {
      recordHistoryNow();
      set((state) => ({ canvas: { ...state.canvas, ...meta } }));
    },

    // Selection is deliberately NOT recorded in history — undo should
    // restore what the design looks like, not which handle was active.
    setSelectedId: (id) => set({ selectedId: id }),

    addTextElement: (preset = "paragraph") => {
      recordHistoryNow();
      const { elements, canvas } = get();
      const p = TEXT_PRESETS[preset];
      const el: TextElement = {
        id: uuidv4(),
        type: "text",
        x: canvas.width / 2 - 150,
        y: canvas.height / 2 - 20,
        width: 300,
        height: (p.fontSize ?? 16) * 1.4,
        rotation: 0,
        zIndex: nextZIndex(elements),
        text: p.text ?? "Text",
        fontSize: p.fontSize ?? 16,
        fontFamily: p.fontFamily ?? "Inter, sans-serif",
        fill: "#111111",
        align: "left",
      };
      set((state) => ({ elements: [...state.elements, el], selectedId: el.id }));
    },

    addShapeElement: (shapeType) => {
      recordHistoryNow();
      const { elements, canvas } = get();
      const size = shapeType === "circle" ? 160 : 200;
      const el: ShapeElement = {
        id: uuidv4(),
        type: "shape",
        shapeType,
        x: canvas.width / 2 - size / 2,
        y: canvas.height / 2 - size / 2,
        width: size,
        height: shapeType === "rect" ? size * 0.7 : size,
        rotation: 0,
        zIndex: nextZIndex(elements),
        fill: "#6366f1",
        stroke: "#312e81",
        strokeWidth: 2,
      };
      set((state) => ({ elements: [...state.elements, el], selectedId: el.id }));
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

    removeElement: (id) => {
      recordHistoryNow();
      set((state) => ({
        elements: state.elements.filter((el) => el.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      }));
    },

    removeSelected: () => {
      const { selectedId, removeElement } = get();
      if (selectedId) removeElement(selectedId);
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
    exportToJSON: () => {
      const { canvas, elements } = get();
      const doc: CanvasDocument = { version: 1, canvas, elements };
      return JSON.stringify(doc, null, 2);
    },

    loadFromJSON: (jsonString) => {
      try {
        const parsed = JSON.parse(jsonString) as Partial<CanvasDocument>;

        if (!parsed || typeof parsed !== "object") {
          return { ok: false, error: "File is not a valid JSON object." };
        }
        if (!parsed.canvas || !Array.isArray(parsed.elements)) {
          return { ok: false, error: "JSON is missing required `canvas` or `elements` fields." };
        }

        // Importing a whole new document is still a single, discrete,
        // undoable step -- so the design right before the import stays
        // one Ctrl+Z away.
        recordHistoryNow();

        set({
          canvas: {
            width: parsed.canvas.width ?? DEFAULT_CANVAS.width,
            height: parsed.canvas.height ?? DEFAULT_CANVAS.height,
            backgroundColor: parsed.canvas.backgroundColor ?? DEFAULT_CANVAS.backgroundColor,
          },
          elements: parsed.elements as CanvasElement[],
          selectedId: null,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to parse JSON." };
      }
    },

    reset: () => {
      recordHistoryNow();
      set({ canvas: { ...DEFAULT_CANVAS }, elements: [], selectedId: null });
    },
  };
});
