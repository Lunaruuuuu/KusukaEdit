"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Transformer } from "react-konva";
import Konva from "konva";
import { useEditorStore } from "@/store/useEditorStore";
import { selectCanvas, selectCurrentPage, selectElementById, selectElements } from "@/store/selectors";
import ElementRenderer from "./ElementRenderer";
import TextEditorOverlay from "./TextEditorOverlay";
import CropOverlay from "./CropOverlay";
import ZoomControls from "./ZoomControls";
import { useCanvasZoom } from "@/lib/useCanvasZoom";
import { scaledSize } from "@/lib/zoom";
import { prepareImageFile } from "@/lib/imageUpload";
import { clampPointToCanvas, clientToDesign, hasFileDrag, pickDroppedFile, type Point } from "@/lib/dropImage";
import { elementsInMarquee, marqueeSelection, MARQUEE_MIN_DRAG, rectFromPoints, type Rect as MarqueeRect } from "@/lib/selection";
import { bakeTransform } from "@/lib/transform";

// How long a drop message ("not a picture", ...) stays on screen.
const DROP_NOTICE_MS = 6000;

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
// handles would stretch them out of proportion. A multiple selection is
// scaled the same way, so every element in it keeps its shape.
const IMAGE_ANCHORS = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** A marquee being dragged: where it started (design px) and what was selected before. */
interface MarqueeDrag {
  start: Point;
  startClient: Point;
  previous: string[];
  additive: boolean;
  /** Became a real drag (moved further than MARQUEE_MIN_DRAG): not a click any more. */
  dragging: boolean;
}

// This whole component only ever runs in the browser (it is loaded via
// `next/dynamic(() => import(...), { ssr: false })` from EditorRoot), so it
// is safe to touch `window`/DOM APIs and Konva's canvas-based rendering here.
export default function CanvasWorkspace() {
  // The page being edited: its canvas and its elements. Everything below is
  // about THIS page only; the other pages are not drawn.
  const canvas = useEditorStore(selectCanvas);
  const elements = useEditorStore(selectElements);
  const pageId = useEditorStore((s) => selectCurrentPage(s).id);
  const exportProgress = useEditorStore((s) => s.exportProgress);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editingId = useEditorStore((s) => s.editingId);
  const croppingId = useEditorStore((s) => s.croppingId);
  const setCroppingId = useEditorStore((s) => s.setCroppingId);
  const addImageElement = useEditorStore((s) => s.addImageElement);
  const selectedType = useEditorStore((s) => selectElementById(s, s.selectedId)?.type);
  const selectedAutoFit = useEditorStore((s) => {
    const el = selectElementById(s, s.selectedId);
    return el?.type === "text" && el.autoFit === true;
  });
  const setSelectedId = useEditorStore((s) => s.setSelectedId);
  const setSelection = useEditorStore((s) => s.setSelection);
  const toggleSelected = useEditorStore((s) => s.toggleSelected);
  const updateElement = useEditorStore((s) => s.updateElement);
  const updateElements = useEditorStore((s) => s.updateElements);
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
  const areaRef = useRef<HTMLDivElement | null>(null);

  // Drag-to-select. The rectangle is view state (design px), drawn on top of
  // the page while the mouse button is down; never part of the document.
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeRef = useRef<MarqueeDrag | null>(null);

  // Drag-and-drop of a picture from the desktop (see the handlers below).
  const [dragActive, setDragActive] = useState(false);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  // dragenter / dragleave also fire for every child element the pointer
  // crosses; counting them is what tells "left the workspace" from "moved onto
  // the canvas".
  const dragDepthRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // the header's Export menu (PNG/JPG) can reach it without any prop
  // drilling. Cleared again on unmount so nothing holds a dangling ref.
  useEffect(() => {
    setStageNode(stageRef.current);
    return () => setStageNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the Transformer bound to every selected node — but not to one that is
  // hidden behind the text-editing textarea or the crop overlay. With several
  // nodes the Transformer draws one frame around all of them, and dragging any
  // of them moves the others along (Konva does that for its attached nodes).
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const nodes = selectedIds
      .filter((id) => id !== editingId && id !== croppingId)
      .map((id) => nodesRef.current.get(id))
      .filter((node): node is Konva.Node => node !== undefined);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
    // `pageId`: after a page change the old page's nodes are gone, so the
    // Transformer is re-bound (to nothing: the selection was reset).
  }, [selectedIds, editingId, croppingId, elements, pageId]);

  // The end of a drag or a Transformer gesture on `id`. When `id` is part of a
  // multiple selection, EVERY selected node is read and written in one call,
  // so moving or scaling a group is one undo step. Konva fires the event on
  // each node of the group; the later calls find the numbers already written
  // (and the scale already back at 1) and change nothing.
  const handleGestureEnd = useCallback(
    (id: string, kind: "drag" | "transform") => {
      const state = useEditorStore.getState();
      const group = state.selectedIds.length > 1 && state.selectedIds.includes(id) ? state.selectedIds : [id];
      const changes = group.flatMap((elementId) => {
        const node = nodesRef.current.get(elementId);
        const el = selectElementById(state, elementId);
        if (!node || !el) return [];
        if (kind === "drag") return [{ id: elementId, attrs: { x: node.x(), y: node.y() } }];
        const attrs = bakeTransform(el, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        });
        // Konva scaled the node; the scale now lives in width/height, so the
        // node starts the next transform from a clean state.
        node.scaleX(1);
        node.scaleY(1);
        return [{ id: elementId, attrs }];
      });
      if (changes.length === 1) updateElement(changes[0].id, changes[0].attrs);
      else updateElements(changes, `selection:${group.join(",")}`);
    },
    [updateElement, updateElements]
  );

  // ---------------------------------------------------------------------
  // Marquee: pressing on the empty page and dragging draws a selection box;
  // every element it touches is selected, live, while it is dragged. A press
  // that does not move is a click on the empty page: it deselects. With
  // Ctrl/Cmd/Shift held the box ADDS to the current selection.
  //
  // The move / up listeners sit on `window`, so the box keeps following the
  // pointer when it leaves the page (the coordinates are then outside it).
  // ---------------------------------------------------------------------
  const startMarquee = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const client = { x: e.evt.clientX, y: e.evt.clientY };
    const state = useEditorStore.getState();
    marqueeRef.current = {
      start: clientToDesign(client, rect, zoom),
      startClient: client,
      previous: state.selectedIds,
      additive: e.evt.ctrlKey || e.evt.metaKey || e.evt.shiftKey,
      dragging: false,
    };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = marqueeRef.current;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!drag || !rect) return;
      if (!drag.dragging) {
        const moved = Math.hypot(e.clientX - drag.startClient.x, e.clientY - drag.startClient.y);
        if (moved < MARQUEE_MIN_DRAG) return;
        drag.dragging = true;
      }
      const box = rectFromPoints(drag.start, clientToDesign({ x: e.clientX, y: e.clientY }, rect, zoom));
      setMarquee(box);
      // Bounding-box intersection, recomputed on every move: the selection
      // (and the Transformer frame) follows the box as it is drawn.
      const touched = elementsInMarquee(selectCurrentPage(useEditorStore.getState()).elements, box);
      setSelection(marqueeSelection(drag.previous, touched, drag.additive));
    };
    const onUp = () => {
      const drag = marqueeRef.current;
      if (!drag) return;
      marqueeRef.current = null;
      setMarquee(null);
      // A plain click on the empty page deselects (a modified click keeps the selection).
      if (!drag.dragging && !drag.additive) setSelectedId(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [zoom, setSelection, setSelectedId, wrapRef]);

  // Cropping belongs to the selected picture: if the selection moves away by
  // any route, the crop overlay closes (the node would otherwise stay hidden).
  useEffect(() => {
    if (croppingId && croppingId !== selectedId) setCroppingId(null);
  }, [croppingId, selectedId, setCroppingId]);

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
      const state = useEditorStore.getState();
      if (state.editingId) return;
      // A batch export is walking through the pages: the document is not to be touched.
      if (state.exportProgress) return;
      if (isEditableTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // While a picture is being cropped only "finish" and undo/redo apply:
      // Delete must not remove the picture and the arrows must not move it
      // under the crop window. (Every crop gesture is already saved, so Esc
      // and Enter both just close the overlay.)
      if (state.croppingId) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          state.setCroppingId(null);
        } else if (mod && (key === "z" || key === "y")) {
          e.preventDefault();
          if (key === "y" || e.shiftKey) redo();
          else undo();
        }
        return;
      }

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
      if (mod && key === "a") {
        // Select every element of the page (the page, not the browser's text).
        e.preventDefault();
        state.setSelection(selectCurrentPage(state).elements.map((el) => el.id));
        return;
      }
      if (mod && key === "c") {
        // Only claim the shortcut when ONE element is selected, so copying
        // ordinary page text still works. (A multiple selection is not copied.)
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

      if (e.key === "Escape" && state.selectedIds.length > 0) {
        e.preventDefault();
        setSelectedId(null);
        return;
      }

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
  }, [removeSelected, nudgeSelected, undo, redo, copySelected, pasteClipboard, setSelectedId]);

  // ---------------------------------------------------------------------
  // Dropping a picture file from the desktop onto the workspace.
  //
  // The handlers sit on the wrapper around the whole canvas area. `dragover`
  // MUST be cancelled for the browser to allow a drop at all. Only drags that
  // carry files are taken: selected text or a link dragged around the page
  // keeps its normal behaviour.
  // ---------------------------------------------------------------------
  const showDropNotice = useCallback((message: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setDropNotice(message);
    noticeTimerRef.current = setTimeout(() => setDropNotice(null), DROP_NOTICE_MS);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  // A picture dropped OUTSIDE the workspace (on a side panel, say) would be
  // opened by the browser in this tab — replacing the editor and losing the
  // design. Cancel such drops page-wide, and show the "not allowed" cursor.
  useEffect(() => {
    const onWindowDragOver = (e: DragEvent) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer && !areaRef.current?.contains(e.target as Node)) e.dataTransfer.dropEffect = "none";
    };
    const onWindowDrop = (e: DragEvent) => {
      if (hasFileDrag(e.dataTransfer)) e.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
    };
    const onWindowDragEnd = () => {
      dragDepthRef.current = 0;
      setDragActive(false);
    };
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    window.addEventListener("dragend", onWindowDragEnd);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
      window.removeEventListener("dragend", onWindowDragEnd);
    };
  }, []);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault(); // without this the browser refuses the drop
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = () => {
    if (dragDepthRef.current === 0) return;
    dragDepthRef.current -= 1;
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);

    // e.dataTransfer.files[0]
    const { file, ignored } = pickDroppedFile(e.dataTransfer.files);
    if (!file) return;

    // Where the cursor was released, relative to the Stage, in DESIGN pixels:
    // the Stage's on-screen rectangle already accounts for scrolling and
    // centring, and it is drawn `zoom` times as large as the design. Read
    // BEFORE anything is awaited — the view may move meanwhile. A drop on the
    // grey area around the canvas lands on the nearest point of the canvas.
    const stageRect = wrapRef.current?.getBoundingClientRect();
    const dropPoint = stageRect
      ? clampPointToCanvas(clientToDesign({ x: e.clientX, y: e.clientY }, stageRect, zoom), canvas)
      : undefined;

    // A text box being edited commits on blur: leave it before the new picture
    // takes over the selection.
    (document.activeElement as HTMLElement | null)?.blur?.();

    try {
      // URL.createObjectURL(file) happens in here, after the file is validated.
      const prepared = await prepareImageFile(file);
      addImageElement(prepared, { at: dropPoint });
      if (ignored > 0) {
        showDropNotice(`${ignored + 1} berkas dilepas; hanya satu gambar yang disisipkan per sekali lepas.`);
      } else {
        setDropNotice(null);
      }
    } catch (err) {
      showDropNotice(err instanceof Error ? err.message : "Gambar gagal disisipkan.");
    }
  };

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      className="canvas-area"
      ref={areaRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
              // A press on the empty page starts a marquee (a click without
              // moving deselects, see startMarquee).
              if (e.target === e.target.getStage()) startMarquee(e);
            }}
            onTouchStart={(e) => {
              // Touch has no marquee: tapping the empty page deselects.
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
                  zoom={zoom}
                  onSelect={(additive) => (additive ? toggleSelected(el.id) : setSelectedId(el.id))}
                  onGestureEnd={handleGestureEnd}
                  registerNode={registerNode}
                />
              ))}
              <Transformer
                ref={transformerRef}
                rotateEnabled
                flipEnabled={false}
                keepRatio
                // Resize mode looks like this: a blue frame with round white
                // dots. Cropping looks different on purpose (amber, thick
                // L-shaped corner brackets; see CropOverlay and the
                // .crop-editor styles), so the two are never confused.
                borderStroke="#5b8cff"
                borderStrokeWidth={1.5}
                anchorFill="#ffffff"
                anchorStroke="#5b8cff"
                anchorStrokeWidth={1.5}
                anchorSize={10}
                anchorCornerRadius={5}
                rotateAnchorOffset={26}
                enabledAnchors={
                  selectedIds.length > 1
                    ? IMAGE_ANCHORS
                    : selectedType === "text"
                      ? selectedAutoFit
                        ? ALL_ANCHORS // an auto-fit box has a height of its own
                        : TEXT_ANCHORS
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
              {marquee && (
                <Rect
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.width}
                  height={marquee.height}
                  fill="rgba(91, 140, 255, 0.12)"
                  stroke="#5b8cff"
                  // one screen pixel at any zoom
                  strokeWidth={1 / zoom}
                  dash={[4 / zoom, 3 / zoom]}
                  listening={false}
                />
              )}
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
            <CropOverlay zoom={zoom} />
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
      {exportProgress && (
        <div className="busy-overlay" role="status" aria-live="polite">
          <div className="busy-overlay__box">
            <strong>Mengekspor halaman {Math.min(exportProgress.done + 1, exportProgress.total)} dari {exportProgress.total}…</strong>
            <progress value={exportProgress.done} max={exportProgress.total} />
            <span>Jangan mengubah desain sampai selesai.</span>
          </div>
        </div>
      )}
      {dragActive && (
        <div className="drop-overlay" aria-hidden="true">
          <span>Lepaskan gambar di sini untuk menyisipkannya di posisi kursor</span>
        </div>
      )}
      {dropNotice && (
        <div className="drop-notice" role="alert">
          <span>{dropNotice}</span>
          <button type="button" onClick={() => setDropNotice(null)} aria-label="Tutup pesan">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
