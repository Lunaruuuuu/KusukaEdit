"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Transformer } from "react-konva";
import Konva from "konva";
import { useEditorStore } from "@/store/useEditorStore";
import ElementRenderer from "./ElementRenderer";
import TextEditorOverlay from "./TextEditorOverlay";

const ALL_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-right",
  "bottom-right",
  "bottom-center",
  "bottom-left",
  "middle-left",
];
// Text is resized by width only; its height follows the wrapped text.
const TEXT_ANCHORS = ["middle-left", "middle-right"];

// This whole component only ever runs in the browser (it is loaded via
// `next/dynamic(() => import(...), { ssr: false })` from EditorRoot), so it
// is safe to touch `window`/DOM APIs and Konva's canvas-based rendering here.
export default function CanvasWorkspace() {
  const canvas = useEditorStore((s) => s.canvas);
  const elements = useEditorStore((s) => s.elements);
  const selectedId = useEditorStore((s) => s.selectedId);
  const editingId = useEditorStore((s) => s.editingId);
  const selectedType = useEditorStore((s) => s.elements.find((e) => e.id === s.selectedId)?.type);
  const setSelectedId = useEditorStore((s) => s.setSelectedId);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const nudgeSelected = useEditorStore((s) => s.nudgeSelected);
  const setStageNode = useEditorStore((s) => s.setStageNode);
  const copySelected = useEditorStore((s) => s.copySelected);
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodesRef = useRef<Map<string, Konva.Node>>(new Map());

  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  }, []);

  // Hand the live Stage instance to the store once, on mount, so
  // ActionPanel's "Export PNG/JPG" button can reach it without any prop
  // drilling. Cleared again on unmount so nothing holds a dangling ref.
  useEffect(() => {
    setStageNode(stageRef.current);
    return () => setStageNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the Transformer bound to whichever node is currently selected —
  // but not while that node is hidden behind the text-editing textarea.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const node = selectedId && editingId !== selectedId ? nodesRef.current.get(selectedId) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, editingId, elements]);

  // Keyboard shortcuts: Delete/Backspace removes the selection, arrow keys
  // nudge it, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes,
  // Ctrl/Cmd+C copies and Ctrl/Cmd+V pastes.
  //
  // All of them are suspended while a text is being edited in the overlay
  // textarea (`editingId`) and for any key event that originates from a
  // real input — otherwise Backspace would delete the whole element instead
  // of a character, and the browser's native undo/copy/paste in text fields
  // would be hijacked.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (useEditorStore.getState().editingId) return;
      if (isEditableTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "c") {
        // Only claim the shortcut when an element is selected, so copying
        // ordinary page text still works.
        if (useEditorStore.getState().selectedId) {
          e.preventDefault();
          copySelected();
        }
        return;
      }
      if (mod && key === "v") {
        if (useEditorStore.getState().clipboard) {
          e.preventDefault();
          pasteClipboard();
        }
        return;
      }
      if (mod) return; // leave every other Ctrl/Cmd combination to the browser

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") nudgeSelected(-step, 0);
      if (e.key === "ArrowRight") nudgeSelected(step, 0);
      if (e.key === "ArrowUp") nudgeSelected(0, -step);
      if (e.key === "ArrowDown") nudgeSelected(0, step);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removeSelected, nudgeSelected, undo, redo, copySelected, pasteClipboard]);

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="canvas-scroll">
      {/* The overlay <textarea> is positioned against this box, which is
          exactly the size of the Stage. */}
      <div className="stage-wrap" style={{ width: canvas.width, height: canvas.height }}>
        <Stage
          ref={stageRef}
          width={canvas.width}
          height={canvas.height}
          className="konva-stage"
          onMouseDown={(e) => {
            // Clicking empty canvas area deselects.
            if (e.target === e.target.getStage()) setSelectedId(null);
          }}
        >
          <Layer>
            <Rect
              x={0}
              y={0}
              width={canvas.width}
              height={canvas.height}
              fill={canvas.backgroundColor}
              listening={false}
            />
            {sortedElements.map((el) => (
              <ElementRenderer
                key={el.id}
                element={el}
                onSelect={() => setSelectedId(el.id)}
                registerNode={registerNode}
              />
            ))}
            <Transformer
              ref={transformerRef}
              rotateEnabled
              flipEnabled={false}
              enabledAnchors={selectedType === "text" ? TEXT_ANCHORS : ALL_ANCHORS}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 10 || newBox.height < 10) return oldBox;
                return newBox;
              }}
            />
          </Layer>
        </Stage>
        <TextEditorOverlay />
      </div>
    </div>
  );
}
