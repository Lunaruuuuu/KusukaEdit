"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { selectElementById } from "@/store/selectors";
import type { CanvasElement, ImageElement, ShapeElement, TextAlign, TextElement } from "@/types/editor";
import { toInputColor } from "@/lib/color";
import { prepareImageFile } from "@/lib/imageUpload";
import { isWholePicture } from "@/lib/crop";

const FONT_FAMILIES = [
  "Inter, sans-serif",
  "Georgia, serif",
  "'Courier New', monospace",
  "'Times New Roman', serif",
  "Verdana, sans-serif",
];

// ---------------------------------------------------------------------------
// The bar above the canvas. It follows the selection, in the order Polotno
// uses: what is specific to the element first (text, shape, picture), then the
// stacking buttons, then delete on the far right. Each group is a labelled
// block with a divider between them, so the bar reads left to right and stays
// tidy when it wraps on a narrow window.
// ---------------------------------------------------------------------------

interface Props {
  /** Whether the "Filter & Efek" panel under this bar is open. */
  stylePanelOpen: boolean;
  onToggleStylePanel: () => void;
}

function Group({ label, children, grow }: { label?: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={`toolbar__group${grow ? " toolbar__group--grow" : ""}`} role="group" aria-label={label}>
      {label && <span className="toolbar__label">{label}</span>}
      <div className="toolbar__controls">{children}</div>
    </div>
  );
}

function TextControls({ el }: { el: TextElement }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  return (
    <>
      <Group label="Teks">
        <input
          type="color"
          aria-label="Warna teks"
          title="Warna teks"
          value={toInputColor(el.fill)}
          onChange={(e) => updateElement(el.id, { fill: e.target.value })}
        />
        <select
          aria-label="Font"
          title="Font"
          value={el.fontFamily}
          onChange={(e) => updateElement(el.id, { fontFamily: e.target.value })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f.split(",")[0].replace(/'/g, "")}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="input-narrow"
          aria-label="Ukuran font"
          title="Ukuran font"
          min={8}
          max={200}
          value={el.fontSize}
          onChange={(e) => updateElement(el.id, { fontSize: Number(e.target.value) || 1 })}
        />
      </Group>
      <Group label="Perataan">
        <div className="segmented">
          {(["left", "center", "right"] as TextAlign[]).map((a) => (
            <button
              key={a}
              className={el.align === a ? "active" : ""}
              aria-pressed={el.align === a}
              onClick={() => updateElement(el.id, { align: a })}
            >
              {a === "left" ? "Kiri" : a === "center" ? "Tengah" : "Kanan"}
            </button>
          ))}
        </div>
      </Group>
    </>
  );
}

function ShapeControls({ el }: { el: ShapeElement }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  return (
    <Group label="Bentuk">
      <label className="inline-field" title="Warna isi">
        <span>Isi</span>
        <input
          type="color"
          value={toInputColor(el.fill)}
          onChange={(e) => updateElement(el.id, { fill: e.target.value })}
        />
      </label>
      <label className="inline-field" title="Warna garis">
        <span>Garis</span>
        <input
          type="color"
          value={toInputColor(el.stroke)}
          onChange={(e) => updateElement(el.id, { stroke: e.target.value })}
        />
      </label>
      <label className="inline-field" title="Tebal garis">
        <span>Tebal</span>
        <input
          type="number"
          className="input-narrow"
          min={0}
          max={40}
          value={el.strokeWidth}
          onChange={(e) => updateElement(el.id, { strokeWidth: Number(e.target.value) || 0 })}
        />
      </label>
    </Group>
  );
}

function ImageControls({
  el,
  stylePanelOpen,
  onToggleStylePanel,
}: { el: ImageElement } & Props) {
  const croppingId = useEditorStore((s) => s.croppingId);
  const setCroppingId = useEditorStore((s) => s.setCroppingId);
  const resetImageCrop = useEditorStore((s) => s.resetImageCrop);
  const replaceImageSource = useEditorStore((s) => s.replaceImageSource);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

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

  const cropping = croppingId === el.id;
  return (
    <>
      <Group label="Pangkas">
        <div className="segmented">
          <button
            className={cropping ? "active" : ""}
            aria-pressed={cropping}
            onClick={() => setCroppingId(cropping ? null : el.id)}
            title="Pangkas gambar: seret siku atau tepi bingkai (atau klik dua kali gambarnya)"
            data-toolbar-action="crop"
          >
            {cropping ? "Selesai" : "Pangkas"}
          </button>
          <button
            onClick={() => resetImageCrop(el.id)}
            disabled={isWholePicture(el)}
            title="Tampilkan lagi seluruh gambar"
            data-toolbar-action="reset-crop"
          >
            Reset
          </button>
        </div>
      </Group>
      <Group label="Gambar">
        <button
          className="toolbar-button"
          onClick={() => {
            setReplaceError(null);
            replaceTargetRef.current = el.id;
            replaceInputRef.current?.click();
          }}
          disabled={replaceBusy}
          title="Ganti isi gambar; posisi dan lebar tetap, tinggi mengikuti rasio gambar baru"
        >
          {replaceBusy ? "Memuat…" : "Ganti"}
        </button>
        <button
          className={`toolbar-button${stylePanelOpen ? " toolbar-button--on" : ""}`}
          aria-pressed={stylePanelOpen}
          onClick={onToggleStylePanel}
          title="Buka panel filter (kecerahan, kontras, saturasi, preset) dan efek (blur, sudut membulat, bayangan)"
          data-toolbar-action="style-panel"
        >
          ✦ Filter &amp; Efek
        </button>
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleReplaceFile}
        />
        {replaceError && <span className="error-note error-note--inline">{replaceError}</span>}
      </Group>
    </>
  );
}

function LayerControls({ el }: { el: CanvasElement }) {
  const reorderElement = useEditorStore((s) => s.reorderElement);
  return (
    <Group label={`Susun (z ${el.zIndex})`}>
      <div className="segmented">
        <button onClick={() => reorderElement(el.id, "back")} title="Kirim ke paling belakang">
          ⇤ Belakang
        </button>
        <button onClick={() => reorderElement(el.id, "backward")} title="Turunkan satu lapis">
          ← Turun
        </button>
        <button onClick={() => reorderElement(el.id, "forward")} title="Naikkan satu lapis">
          Naik →
        </button>
        <button onClick={() => reorderElement(el.id, "front")} title="Bawa ke paling depan">
          Depan ⇥
        </button>
      </div>
    </Group>
  );
}

export default function ContextualToolbar({ stylePanelOpen, onToggleStylePanel }: Props) {
  const selected = useEditorStore((s) => selectElementById(s, s.selectedId));
  const removeElement = useEditorStore((s) => s.removeElement);

  if (!selected) {
    return (
      <div className="panel toolbar toolbar--empty" data-toolbar="empty">
        Pilih sebuah elemen di kanvas untuk melihat kontrolnya.
      </div>
    );
  }

  return (
    <div className="panel toolbar" data-toolbar={selected.type}>
      {selected.type === "text" && <TextControls el={selected} />}
      {selected.type === "shape" && <ShapeControls el={selected} />}
      {selected.type === "image" && (
        <ImageControls el={selected} stylePanelOpen={stylePanelOpen} onToggleStylePanel={onToggleStylePanel} />
      )}
      <LayerControls el={selected} />
      <Group grow>
        <button
          className="danger toolbar__delete"
          onClick={() => removeElement(selected.id)}
          title="Hapus (atau tekan Delete/Backspace)"
        >
          Hapus
        </button>
      </Group>
    </div>
  );
}
