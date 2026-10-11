import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
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

interface EditorState {
  canvas: CanvasMeta;
  elements: CanvasElement[];
  selectedId: string | null;

  // canvas meta
  setCanvasMeta: (meta: Partial<CanvasMeta>) => void;

  // selection
  setSelectedId: (id: string | null) => void;

  // element CRUD
  addTextElement: (
    preset?: "title" | "subtitle" | "paragraph"
  ) => void;
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
  return elements.length === 0
    ? 1
    : Math.max(...elements.map((e) => e.zIndex)) + 1;
}

const TEXT_PRESETS: Record<
  "title" | "subtitle" | "paragraph",
  Partial<TextElement>
> = {
  title: { text: "Add a title", fontSize: 48, fontFamily: "Inter, sans-serif" },
  subtitle: {
    text: "Add a subtitle",
    fontSize: 28,
    fontFamily: "Inter, sans-serif",
  },
  paragraph: {
    text: "Add a bit of body text here. Double click to edit.",
    fontSize: 16,
    fontFamily: "Inter, sans-serif",
  },
};

export const useEditorStore = create<EditorState>((set, get) => ({
  canvas: { ...DEFAULT_CANVAS },
  elements: [],
  selectedId: null,

  setCanvasMeta: (meta) =>
    set((state) => ({ canvas: { ...state.canvas, ...meta } })),

  setSelectedId: (id) => set({ selectedId: id }),

  addTextElement: (preset = "paragraph") => {
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
    set((state) => ({
      elements: [...state.elements, el],
      selectedId: el.id,
    }));
  },

  addShapeElement: (shapeType) => {
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
    set((state) => ({
      elements: [...state.elements, el],
      selectedId: el.id,
    }));
  },

  updateElement: (id, attrs) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? ({ ...el, ...attrs } as CanvasElement) : el
      ),
    })),

  removeElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  removeSelected: () => {
    const { selectedId, removeElement } = get();
    if (selectedId) removeElement(selectedId);
  },

  reorderElement: (id, direction) => {
    set((state) => {
      const sorted = [...state.elements].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((e) => e.id === id);
      if (idx === -1) return state;

      if (direction === "front") {
        const maxZ = Math.max(...sorted.map((e) => e.zIndex));
        return {
          elements: state.elements.map((e) =>
            e.id === id ? { ...e, zIndex: maxZ + 1 } : e
          ),
        };
      }
      if (direction === "back") {
        const minZ = Math.min(...sorted.map((e) => e.zIndex));
        return {
          elements: state.elements.map((e) =>
            e.id === id ? { ...e, zIndex: minZ - 1 } : e
          ),
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

  nudgeSelected: (dx, dy) => {
    const { selectedId, elements } = get();
    if (!selectedId) return;
    const el = elements.find((e) => e.id === selectedId);
    if (!el) return;
    get().updateElement(selectedId, { x: el.x + dx, y: el.y + dy });
  },

  // -------------------------------------------------------------------
  // JSON serialization: the whole point of the assignment. Keep this
  // dumb and predictable -- a straight snapshot of canvas + elements.
  // -------------------------------------------------------------------
  exportToJSON: () => {
    const { canvas, elements } = get();
    const doc: CanvasDocument = {
      version: 1,
      canvas,
      elements,
    };
    return JSON.stringify(doc, null, 2);
  },

  loadFromJSON: (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString) as Partial<CanvasDocument>;

      if (!parsed || typeof parsed !== "object") {
        return { ok: false, error: "File is not a valid JSON object." };
      }
      if (!parsed.canvas || !Array.isArray(parsed.elements)) {
        return {
          ok: false,
          error: "JSON is missing required `canvas` or `elements` fields.",
        };
      }

      set({
        canvas: {
          width: parsed.canvas.width ?? DEFAULT_CANVAS.width,
          height: parsed.canvas.height ?? DEFAULT_CANVAS.height,
          backgroundColor:
            parsed.canvas.backgroundColor ?? DEFAULT_CANVAS.backgroundColor,
        },
        elements: parsed.elements as CanvasElement[],
        selectedId: null,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to parse JSON.",
      };
    }
  },

  reset: () => set({ canvas: { ...DEFAULT_CANVAS }, elements: [], selectedId: null }),
}));
