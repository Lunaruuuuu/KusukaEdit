"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Transformer } from "react-konva";
import Konva from "konva";
import { useEditorStore } from "@/store/useEditorStore";
import ElementRenderer from "./ElementRenderer";
import TextEditorOverlay from "./TextEditorOverlay";
import ZoomControls from "./ZoomControls";
import { useCanvasZoom } from "@/lib/useCanvasZoom";
import { scaledSize } from "@/lib/zoom";

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
// Pictures are resized by the corners only, with the ratio locked: the side
// handles would stretch them out of proportion.
const IMAGE_ANCHORS = ["top-left", "top-right", "bottom-right", "bottom-left"];

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

  // View scale. The Stage is drawn `zoom` times as large as the design, and
  // the design itself (store, JSON, exported picture) never changes: that is
  // why the node coordinates below stay in design pixels.
  const loadRevision = useEditorStore((s) => s.loadRevision);
  const { scrollRef, wrapRef, zoom, mode, canZoomIn, canZoomOut, zoomIn, zoomOut, actualSize, fit } =
    useCanvasZoom(canvas.width, canvas.height, loadRevision);
  const stageSize = scaledSize(canvas.width, canvas.height, zoom);

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
    <div className="canvas-area">
      <div className="canvas-scroll" ref={scrollRef}>
        {/* This box is exactly the size of the Stage as shown on screen. */}
        <div className="stage-wrap" ref={wrapRef} style={{ width: stageSize.width, height: stageSize.height }}>
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={zoom}
            scaleY={zoom}
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
                keepRatio
                enabledAnchors={
                  selectedType === "text"
                    ? TEXT_ANCHORS
                    : selectedType === "image"
                      ? IMAGE_ANCHORS
                      : ALL_ANCHORS
                }
                boundBoxFunc={(oldBox, newBox) => {
                  // Konva hands this function the boxes in ON-SCREEN pixels, so
                  // the smallest allowed size (10 px of design) is scaled too.
                  const min = 10 * zoom;
                  if (newBox.width < min || newBox.height < min) return oldBox;
                  return newBox;
                }}
              />
            </Layer>
          </Stage>
          {/* The text editor <textarea> is written in design pixels. This layer
              is as large as the design and scaled by the same factor as the
              Stage, so the textarea lands exactly on the text at any zoom. */}
          <div
            className="overlay-layer"
            style={{ width: canvas.width, height: canvas.height, transform: `scale(${zoom})` }}
          >
            <TextEditorOverlay />
          </div>
        </div>
      </div>
      <ZoomControls
        zoom={zoom}
        mode={mode}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fit}
        onActualSize={actualSize}
      />
    </div>
  );
}
