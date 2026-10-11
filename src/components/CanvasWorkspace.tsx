"use client";

import React, { useEffect, useRef } from "react";
import { Stage, Layer, Rect, Transformer } from "react-konva";
import Konva from "konva";
import { useEditorStore } from "@/store/useEditorStore";
import ElementRenderer from "./ElementRenderer";

// This whole component only ever runs in the browser (it is loaded via
// `next/dynamic(() => import(...), { ssr: false })` from EditorRoot), so it
// is safe to touch `window`/DOM APIs and Konva's canvas-based rendering here.
export default function CanvasWorkspace() {
  const canvas = useEditorStore((s) => s.canvas);
  const elements = useEditorStore((s) => s.elements);
  const selectedId = useEditorStore((s) => s.selectedId);
  const setSelectedId = useEditorStore((s) => s.setSelectedId);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const nudgeSelected = useEditorStore((s) => s.nudgeSelected);

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodesRef = useRef<Map<string, Konva.Node>>(new Map());

  const registerNode = (id: string, node: Konva.Node | null) => {
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  };

  // Keep the Transformer bound to whichever node is currently selected.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const node = selectedId ? nodesRef.current.get(selectedId) : null;
    if (node) {
      transformer.nodes([node]);
      transformer.getLayer()?.batchDraw();
    } else {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
    }
  }, [selectedId, elements]);

  // Keyboard shortcuts: Delete/Backspace removes the selection, arrow keys
  // nudge it. Skip everything while the user is typing into a real input
  // (e.g. a color/text field in the toolbar) so we don't hijack editing.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

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
  }, [removeSelected, nudgeSelected]);

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="canvas-scroll">
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
              isSelected={el.id === selectedId}
              onSelect={() => setSelectedId(el.id)}
              registerNode={registerNode}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            flipEnabled={false}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 10 || newBox.height < 10) return oldBox;
              return newBox;
            }}
          />
        </Layer>
      </Stage>
    </div>
  );
}
