"use client";

import React, { useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { toInputColor } from "@/lib/color";
import {
  CANVAS_LIMITS,
  RATIO_PRESETS,
  clampDimension,
  matchRatio,
  sizeForRatio,
} from "@/lib/workspace";

const BACKGROUND_SWATCHES = ["#ffffff", "#f3f4f6", "#fde68a", "#fff7ed", "#0e4d4a", "#111827"];

// A number field that keeps what the user is typing as a draft and applies it
// only on Enter / blur. Applying every keystroke would turn typing "1080"
// into canvases of 1, 10 and 108 px on the way — each one a real resize.
function DimensionInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // Follow outside changes (ratio preset, template, undo). Done while
  // rendering (React's "adjust state when a prop changes" pattern) rather than
  // in an effect, so the field never shows the old number for a frame.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setDraft(String(value));
  }

  function commit() {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(String(value)); // unreadable: put the current size back
      return;
    }
    onCommit(parsed);
    // The store clamps to CANVAS_LIMITS. If the clamped number equals the
    // current size nothing changes, so `value` never updates and the effect
    // above would not run — show the accepted number explicitly.
    setDraft(String(clampDimension(parsed, value)));
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={CANVAS_LIMITS.min}
        max={CANVAS_LIMITS.max}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

export default function WorkspacePanel() {
  const canvas = useEditorStore((s) => s.canvas);
  const elements = useEditorStore((s) => s.elements);
  const setCanvasMeta = useEditorStore((s) => s.setCanvasMeta);

  const activeRatio = matchRatio(canvas.width, canvas.height);

  // Shrinking the canvas does not move or scale the design: elements keep
  // their coordinates, so some can end up beyond the edge. Tell the user,
  // because those elements are invisible and absent from the exported image.
  const outside = elements.filter(
    (el) => el.x >= canvas.width || el.y >= canvas.height || el.x + el.width <= 0 || el.y + el.height <= 0
  ).length;

  return (
    <div className="workspace-panel">
      <div className="panel-section">
        <h3>Ukuran kanvas (px)</h3>
        <div className="size-grid">
          <DimensionInput label="Lebar" value={canvas.width} onCommit={(width) => setCanvasMeta({ width })} />
          <span className="size-grid__times" aria-hidden="true">
            ×
          </span>
          <DimensionInput label="Tinggi" value={canvas.height} onCommit={(height) => setCanvasMeta({ height })} />
        </div>
        <p className="hint hint--tight">
          {CANVAS_LIMITS.min}–{CANVAS_LIMITS.max} px. Tekan Enter atau klik di luar kolom untuk menerapkan.
        </p>
      </div>

      <div className="panel-section">
        <h3>Rasio</h3>
        <div className="chip-grid">
          {RATIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={`chip${activeRatio?.id === preset.id ? " active" : ""}`}
              aria-pressed={activeRatio?.id === preset.id}
              onClick={() => setCanvasMeta(sizeForRatio(canvas, preset))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="hint hint--tight">
          {activeRatio ? `Rasio saat ini ${activeRatio.label}.` : "Ukuran khusus."} Memilih rasio
          mempertahankan sisi terpanjang.
        </p>
      </div>

      <div className="panel-section">
        <h3>Latar belakang</h3>
        <div className="swatch-row">
          <input
            type="color"
            className="swatch-picker"
            aria-label="Warna latar belakang"
            value={toInputColor(canvas.backgroundColor)}
            onChange={(e) => setCanvasMeta({ backgroundColor: e.target.value })}
          />
          {BACKGROUND_SWATCHES.map((color) => (
            <button
              key={color}
              className={`swatch${canvas.backgroundColor === color ? " active" : ""}`}
              style={{ background: color }}
              title={color}
              aria-label={`Latar ${color}`}
              onClick={() => setCanvasMeta({ backgroundColor: color })}
            />
          ))}
        </div>
      </div>

      {outside > 0 && (
        <p className="warning-note">
          {outside} elemen berada di luar kanvas, jadi tidak terlihat dan tidak ikut diekspor sebagai
          gambar. Perbesar kanvas untuk menampilkannya lagi.
        </p>
      )}
    </div>
  );
}
