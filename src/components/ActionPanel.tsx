"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { exportStageAsImage, type ImageFormat } from "@/lib/exportImage";

export default function ActionPanel() {
  const exportToJSON = useEditorStore((s) => s.exportToJSON);
  const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
  const reset = useEditorStore((s) => s.reset);
  const stageNode = useEditorStore((s) => s.stageNode);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");
  const [resolution, setResolution] = useState(2);

  function handleExportJSON() {
    const json = exportToJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas-design-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("JSON berhasil diunduh.");
  }

  function handleExportImage() {
    if (!stageNode) {
      setMessage("Kanvas belum siap, coba lagi sesaat lagi.");
      return;
    }
    exportStageAsImage(stageNode, { format: imageFormat, pixelRatio: resolution });
    setMessage(
      `Gambar ${imageFormat.toUpperCase()} (${resolution}x) berhasil diunduh.`
    );
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = loadFromJSON(text);
      setMessage(
        result.ok ? "Desain berhasil diimpor dari JSON." : `Gagal impor: ${result.error}`
      );
    };
    reader.readAsText(file);

    // allow re-selecting the same file later
    e.target.value = "";
  }

  return (
    <div className="panel action-panel">
      <div className="panel-section">
        <h3>Data (JSON)</h3>
        <div className="panel-buttons">
          <button onClick={handleExportJSON}>⬇ Export JSON</button>
          <button onClick={handleImportClick}>⬆ Import JSON</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      <div className="panel-section">
        <h3>Gambar (PNG/JPG)</h3>
        <label className="field">
          <span>Format</span>
          <select
            value={imageFormat}
            onChange={(e) => setImageFormat(e.target.value as ImageFormat)}
          >
            <option value="png">PNG (transparan-ready)</option>
            <option value="jpeg">JPG</option>
          </select>
        </label>
        <label className="field">
          <span>Resolusi</span>
          <select value={resolution} onChange={(e) => setResolution(Number(e.target.value))}>
            <option value={1}>1x</option>
            <option value={2}>2x (disarankan)</option>
            <option value={3}>3x</option>
          </select>
        </label>
        <div className="panel-buttons">
          <button onClick={handleExportImage} disabled={!stageNode}>
            ⬇ Export {imageFormat.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="panel-section">
        <button className="ghost" onClick={reset}>
          Kosongkan Kanvas
        </button>
      </div>

      {message && <p className="hint">{message}</p>}
    </div>
  );
}
