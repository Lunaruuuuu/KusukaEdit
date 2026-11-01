"use client";

import React from "react";
import { formatZoom } from "@/lib/zoom";
import type { ZoomMode } from "@/lib/useCanvasZoom";

interface Props {
  zoom: number;
  mode: ZoomMode;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
}

// Floats over the corner of the canvas area. It only changes how the canvas is
// SHOWN: the design, the saved JSON and the exported picture keep their real
// pixel size.
export default function ZoomControls({
  zoom,
  mode,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onFit,
  onActualSize,
}: Props) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom kanvas">
      <button onClick={onZoomOut} disabled={!canZoomOut} aria-label="Perkecil" title="Perkecil">
        −
      </button>
      <button
        className="zoom-controls__value"
        onClick={onActualSize}
        aria-label={`Zoom ${formatZoom(zoom)}, klik untuk ukuran asli`}
        title="Ukuran asli (100%)"
      >
        {formatZoom(zoom)}
      </button>
      <button onClick={onZoomIn} disabled={!canZoomIn} aria-label="Perbesar" title="Perbesar">
        +
      </button>
      <button
        className={mode === "fit" ? "active" : ""}
        aria-pressed={mode === "fit"}
        onClick={onFit}
        title="Sesuaikan dengan layar (seluruh kanvas terlihat)"
      >
        Fit
      </button>
    </div>
  );
}
