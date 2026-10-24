"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { exportStageAsImage, type ImageFormat } from "@/lib/exportImage";
import type { ExportFormat } from "@/lib/polotnoAdapter";

const FORMAT_LABEL: Record<ExportFormat, string> = {
  kusuka: "KusukaEdit",
  polotno: "Polotno",
};

export default function ActionPanel() {
  const exportToJSON = useEditorStore((s) => s.exportToJSON);
  const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
  const reset = useEditorStore((s) => s.reset);
  const stageNode = useEditorStore((s) => s.stageNode);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [jsonFormat, setJsonFormat] = useState<ExportFormat>("kusuka");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");
  const [resolution, setResolution] = useState(2);

  function handleExportJSON() {
    const json = exportToJSON(jsonFormat);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${jsonFormat === "polotno" ? "polotno" : "kusuka"}-design-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setWarnings([]);
    setMessage(`JSON format ${FORMAT_LABEL[jsonFormat]} berhasil diunduh.`);
  }

  function handleExportImage() {
    if (!stageNode) {
      setMessage("Kanvas belum siap, coba lagi sesaat lagi.");
      return;
    }
    exportStageAsImage(stageNode, { format: imageFormat, pixelRatio: resolution });
    setWarnings([]);
    setMessage(`Gambar ${imageFormat.toUpperCase()} (${resolution}x) berhasil diunduh.`);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      // The format (KusukaEdit or Polotno) is detected from the content, not the file name.
      const result = loadFromJSON(reader.result as string);
      if (result.ok) {
        setMessage(`Desain berhasil diimpor (terdeteksi format ${FORMAT_LABEL[result.format]}).`);
        setWarnings(result.warnings);
      } else {
        setMessage(`Gagal impor: ${result.error}`);
        setWarnings([]);
      }
    };
    reader.readAsText(file);

    // allow re-selecting the same file later
    e.target.value = "";
  }

  return (
    <div className="panel action-panel">
      <div className="panel-section">
        <h3>Data (JSON)</h3>
        <div className="field">
          <span>Format unduhan</span>
          <div className="segmented segmented--stretch">
            {(["kusuka", "polotno"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                className={jsonFormat === f ? "active" : ""}
                onClick={() => setJsonFormat(f)}
                aria-pressed={jsonFormat === f}
                title={f === "kusuka" ? "Format bawaan KusukaEdit" : "Kompatibel dengan Polotno"}
              >
                {f === "kusuka" ? "Native" : "Polotno"}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-buttons">
          <button onClick={handleExportJSON}>⬇ Export JSON ({FORMAT_LABEL[jsonFormat]})</button>
          <button onClick={handleImportClick}>⬆ Import JSON</button>
        </div>
        <p className="hint hint--tight">Import mengenali format KusukaEdit dan Polotno otomatis.</p>
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
          <select value={imageFormat} onChange={(e) => setImageFormat(e.target.value as ImageFormat)}>
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
      {warnings.length > 0 && (
        <ul className="warning-list">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
