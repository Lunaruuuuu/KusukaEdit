"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { TextAlign } from "@/types/editor";
import { toInputColor } from "@/lib/color";
import { prepareImageFile } from "@/lib/imageUpload";

const FONT_FAMILIES = [
  "Inter, sans-serif",
  "Georgia, serif",
  "'Courier New', monospace",
  "'Times New Roman', serif",
  "Verdana, sans-serif",
];

export default function ContextualToolbar() {
  const elements = useEditorStore((s) => s.elements);
  const selectedId = useEditorStore((s) => s.selectedId);
  const updateElement = useEditorStore((s) => s.updateElement);
  const reorderElement = useEditorStore((s) => s.reorderElement);
  const removeElement = useEditorStore((s) => s.removeElement);
  const replaceImageSource = useEditorStore((s) => s.replaceImageSource);

  // Hooks must run before the early return below.
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  const selected = elements.find((e) => e.id === selectedId);

  async function handleReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same file twice must still fire `change`
    const targetId = replaceTargetRef.current;
    if (!file || !targetId) return;

    setReplaceBusy(true);
    setReplaceError(null);
    try {
      // The target id is captured when the button was clicked: the user may
      // select another element while the picture is loading, and the new
      // picture must still land on the element they asked to replace.
      replaceImageSource(targetId, await prepareImageFile(file));
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : "Gambar gagal diganti.");
    } finally {
      setReplaceBusy(false);
    }
  }

  if (!selected) {
    return (
      <div className="panel toolbar toolbar--empty">
        Pilih sebuah elemen di kanvas untuk melihat kontrolnya.
      </div>
    );
  }

  return (
    <div className="panel toolbar">
      {selected.type === "text" && (
        <>
          <label className="field">
            <span>Warna</span>
            <input
              type="color"
              value={toInputColor(selected.fill)}
              onChange={(e) => updateElement(selected.id, { fill: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Ukuran Font</span>
            <input
              type="number"
              min={8}
              max={200}
              value={selected.fontSize}
              onChange={(e) =>
                updateElement(selected.id, { fontSize: Number(e.target.value) || 1 })
              }
            />
          </label>

          <label className="field">
            <span>Font</span>
            <select
              value={selected.fontFamily}
              onChange={(e) => updateElement(selected.id, { fontFamily: e.target.value })}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f.split(",")[0].replace(/'/g, "")}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Perataan</span>
            <div className="segmented">
              {(["left", "center", "right"] as TextAlign[]).map((a) => (
                <button
                  key={a}
                  className={selected.align === a ? "active" : ""}
                  onClick={() => updateElement(selected.id, { align: a })}
                >
                  {a === "left" ? "Kiri" : a === "center" ? "Tengah" : "Kanan"}
                </button>
              ))}
            </div>
          </label>
        </>
      )}

      {selected.type === "shape" && (
        <>
          <label className="field">
            <span>Warna Isi</span>
            <input
              type="color"
              value={toInputColor(selected.fill)}
              onChange={(e) => updateElement(selected.id, { fill: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Warna Garis</span>
            <input
              type="color"
              value={toInputColor(selected.stroke)}
              onChange={(e) => updateElement(selected.id, { stroke: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Tebal Garis</span>
            <input
              type="number"
              min={0}
              max={40}
              value={selected.strokeWidth}
              onChange={(e) =>
                updateElement(selected.id, { strokeWidth: Number(e.target.value) || 0 })
              }
            />
          </label>
        </>
      )}

      {selected.type === "image" && (
        <div className="field">
          <span>Gambar</span>
          <button
            className="toolbar-button"
            onClick={() => {
              setReplaceError(null);
              replaceTargetRef.current = selected.id;
              replaceInputRef.current?.click();
            }}
            disabled={replaceBusy}
            title="Ganti isi gambar; posisi dan lebar tetap, tinggi mengikuti rasio gambar baru"
          >
            {replaceBusy ? "Memuat…" : "Ganti gambar"}
          </button>
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleReplaceFile}
          />
          {replaceError && <span className="error-note error-note--inline">{replaceError}</span>}
        </div>
      )}

      <div className="field field--layering">
        <span>Layer (z-index: {selected.zIndex})</span>
        <div className="segmented">
          <button onClick={() => reorderElement(selected.id, "back")}>⇤ Belakang</button>
          <button onClick={() => reorderElement(selected.id, "backward")}>← Turun</button>
          <button onClick={() => reorderElement(selected.id, "forward")}>Naik →</button>
          <button onClick={() => reorderElement(selected.id, "front")}>Depan ⇥</button>
        </div>
      </div>

      <button
        className="danger"
        onClick={() => removeElement(selected.id)}
        title="Hapus (atau tekan Delete/Backspace)"
      >
        Hapus Elemen
      </button>
    </div>
  );
}
