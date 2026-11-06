"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ImageElement } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";
import { selectElementById } from "@/store/selectors";
import {
  CROP_HANDLES,
  PICTURE_CORNERS,
  cropFrame,
  cropPatchChanges,
  panCrop,
  resizeCrop,
  scaleCropPicture,
  toLocalDelta,
  type CropHandle,
  type CropPatch,
  type PictureCorner,
} from "@/lib/crop";

// ---------------------------------------------------------------------------
// Interactive cropping.
//
// Like the text editor, this is a DOM layer placed over the canvas (inside
// CanvasWorkspace's `.overlay-layer`, which is as large as the DESIGN and
// scaled by the view zoom, so everything here is in design pixels). While it
// is open the Konva node of the picture is hidden (ElementRenderer reads
// `croppingId`) and the overlay shows:
//   - the WHOLE picture at its current size, with a dark semi-transparent
//     "dimming mask" over everything OUTSIDE the crop window: the part that is
//     going to be cut off stays visible, but darkened (a live preview);
//   - the crop window — the part that stays, at full brightness — with a
//     rule-of-thirds (3x3) grid and 8 amber handles;
//   - a thin outline round the whole picture with a round handle on each of
//     its corners.
//
// It works like Polotno's crop, with nothing to read and no button to press:
//   - drag an amber handle to move that edge of the window (the box shrinks or
//     grows with it, the picture itself never rescales);
//   - drag inside the window to slide the picture under it;
//   - drag a round corner of the picture to zoom the picture inside the window
//     (proportionally; it always keeps covering the window);
//   - click anywhere outside the picture, or press Enter / Esc, to finish.
// Every gesture is saved when the pointer is released (one gesture = one undo
// step), so "finishing" only closes the overlay. The handles are not the
// Transformer's (blue frame, round white dots): cropping is amber, so the two
// modes cannot be mistaken for each other. The maths is in lib/crop.ts.
// ---------------------------------------------------------------------------

interface Props {
  /** View zoom (1 = 100%): handles keep the same size on screen at any zoom. */
  zoom: number;
}

export default function CropOverlay({ zoom }: Props) {
  const croppingId = useEditorStore((s) => s.croppingId);
  const selectedId = useEditorStore((s) => s.selectedId);
  const element = useEditorStore((s) => selectElementById(s, s.croppingId));

  if (!croppingId || croppingId !== selectedId || !element || element.type !== "image") return null;
  // `key` gives every picture its own gesture state.
  return <CropEditor key={element.id} element={element} zoom={zoom} />;
}

type GestureInput =
  | { kind: "pan" }
  | { kind: "resize"; handle: CropHandle }
  | { kind: "scale"; corner: PictureCorner };
type Gesture = GestureInput & { startX: number; startY: number; base: ImageElement };

const HANDLE_CURSOR: Record<CropHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

function CropEditor({ element, zoom }: { element: ImageElement; zoom: number }) {
  const setImageCrop = useEditorStore((s) => s.setImageCrop);
  const setCroppingId = useEditorStore((s) => s.setCroppingId);

  // The picture as it looks right now, including a gesture that is still going on.
  const [draft, setDraft] = useState<CropPatch | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const latestRef = useRef<CropPatch | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  // A press anywhere outside the picture finishes cropping, like Polotno. The
  // contextual toolbar and the effects panel are not "outside": their controls
  // work on this picture (the toolbar's crop button finishes it itself).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || rootRef.current?.contains(target)) return;
      if (target.closest?.("[data-toolbar], [data-style-panel]")) return;
      setCroppingId(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [setCroppingId]);

  const shown: ImageElement = draft ? { ...element, ...draft } : element;
  const frame = cropFrame(shown);
  const flip = `scale(${shown.scaleX === -1 ? -1 : 1}, ${shown.scaleY === -1 ? -1 : 1})`;

  const begin = (e: React.PointerEvent<HTMLElement>, gesture: GestureInput) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gestureRef.current = { ...gesture, startX: e.clientX, startY: e.clientY, base: element };
    latestRef.current = null;
  };

  const move = (e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const delta = toLocalDelta(e.clientX - g.startX, e.clientY - g.startY, zoom, g.base.rotation);
    const patch =
      g.kind === "resize"
        ? resizeCrop(g.base, g.handle, delta)
        : g.kind === "scale"
          ? scaleCropPicture(g.base, g.corner, delta)
          : panCrop(g.base, delta);
    latestRef.current = patch;
    setDraft(patch);
  };

  const end = (e: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const g = gestureRef.current;
    if (!g) return;
    gestureRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const patch = latestRef.current;
    latestRef.current = null;
    setDraft(null);
    // One gesture = one history step. A click that did not move writes nothing.
    if (commit && patch && cropPatchChanges(g.base, patch)) setImageCrop(g.base.id, patch);
  };

  const gestureProps = (gesture: GestureInput) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => begin(e, gesture),
    onPointerMove: move,
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => end(e, true),
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => end(e, false),
  });

  // Every size below is in design pixels; dividing by the zoom keeps the
  // handles the same size on screen.
  const unit = 1 / (zoom > 0 ? zoom : 1);

  return (
    <div
      ref={rootRef}
      className="crop-editor"
      data-crop-editor=""
      style={{
        left: shown.x,
        top: shown.y,
        // Konva rotates around the node's top-left corner; so does this.
        transform: `rotate(${shown.rotation}deg)`,
        ["--unit" as string]: unit,
      }}
    >
      {/* The whole picture, with the dimming mask. The "hole" is the crop
          window: its huge box-shadow darkens everything around it, and the
          clipping box (overflow: hidden) stops that shadow at the edge of the
          picture, so only the part that will be cut off is darkened. */}
      <div
        className="crop-editor__shade"
        style={{ left: -frame.left, top: -frame.top, width: frame.fullWidth, height: frame.fullHeight }}
      >
        <img src={shown.src} alt="" draggable={false} style={{ transform: flip }} />
        <div
          className="crop-editor__hole"
          data-crop-dim=""
          style={{ left: frame.left, top: frame.top, width: shown.width, height: shown.height }}
        />
      </div>

      {/* The crop window: the part that stays. Dragging inside slides the picture. */}
      <div
        className="crop-editor__window"
        data-crop-window=""
        style={{ left: 0, top: 0, width: shown.width, height: shown.height }}
        {...gestureProps({ kind: "pan" })}
      >
        <div className="crop-editor__grid" />
        {CROP_HANDLES.map((handle) => (
          <span
            key={handle}
            className={`crop-editor__handle crop-editor__handle--${handle}`}
            data-crop-handle={handle}
            style={{ cursor: HANDLE_CURSOR[handle] }}
            {...gestureProps({ kind: "resize", handle })}
          />
        ))}
      </div>

      {/* The whole picture's outline and its round corners: drag one to zoom
          the picture inside the window (Polotno's round handles). */}
      <div
        className="crop-editor__picture"
        data-crop-picture=""
        style={{ left: -frame.left, top: -frame.top, width: frame.fullWidth, height: frame.fullHeight }}
      >
        {PICTURE_CORNERS.map((corner) => (
          <span
            key={corner}
            className={`crop-editor__scale crop-editor__scale--${corner}`}
            data-crop-scale={corner}
            style={{ cursor: HANDLE_CURSOR[corner] }}
            {...gestureProps({ kind: "scale", corner })}
          />
        ))}
      </div>
    </div>
  );
}
