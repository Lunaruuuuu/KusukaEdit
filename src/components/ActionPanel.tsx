"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { exportStageAsImage, type ImageFormat } from "@/lib/exportImage";
import { resolveExportPixelRatio } from "@/lib/workspace";
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
  const canvasWidth = useEditorStore((s) => s.canvas.width);
  const canvasHeight = useEditorStore((s) => s.canvas.height);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [jsonFormat, setJsonFormat] = useState<ExportFormat>("kusuka");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");
  const [resolution, setResolution] = useState(2);
  const [exportingJson, setExportingJson] = useState(false);

  // What the PNG/JPG will measure, from the CURRENT canvas size. Updates the
  // moment the workspace is resized in the "Kanvas" tab.
  const plan = resolveExportPixelRatio(canvasWidth, canvasHeight, resolution);

  async function handleExportJSON() {
    setExportingJson(true);
    try {
      // Async: uploaded pictures (temporary blob: URLs) are read back and
      // embedded in the file, so it still works after a page refresh.
      const { json, warnings: exportWarnings } = await exportToJSON(jsonFormat);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${jsonFormat === "polotno" ? "polotno" : "kusuka"}-design-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setWarnings(exportWarnings);
      setMessage(`JSON format ${FORMAT_LABEL[jsonFormat]} berhasil diunduh.`);
    } catch (err) {
      setWarnings([]);
      setMessage(`Gagal ekspor JSON: ${err instanceof Error ? err.message : "kesalahan tidak dikenal"}`);
    } finally {
      setExportingJson(false);
    }
  }

  function handleExportImage() {
    if (!stageNode) {
      setMessage("Kanvas belum siap, coba lagi sesaat lagi.");
      return;
    }
    try {
      const result = exportStageAsImage(stageNode, {
        format: imageFormat,
        pixelRatio: resolution,
        // The picture is the design, not what happens to be on screen at this zoom.
        designSize: { width: canvasWidth, height: canvasHeight },
      });
      setWarnings(
        result.capped
          ? [`Resolusi diturunkan ke ${result.pixelRatio}x agar sisi terpanjang tidak melebihi batas browser.`]
          : []
      );
      setMessage(
        `Gambar ${imageFormat.toUpperCase()} ${result.outputWidth} × ${result.outputHeight} px berhasil diunduh.`
      );
    } catch (err) {
      setWarnings([]);
      setMessage(err instanceof Error ? err.message : "Gagal mengekspor gambar.");
    }
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
          <button onClick={handleExportJSON} disabled={exportingJson}>
            {exportingJson ? "Menyiapkan…" : `⬇ Export JSON (${FORMAT_LABEL[jsonFormat]})`}
          </button>
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
        <p className="hint hint--tight">
          Kanvas {canvasWidth} × {canvasHeight} px → hasil {plan.outputWidth} × {plan.outputHeight} px
          {plan.capped ? ` (resolusi dibatasi ${plan.pixelRatio}x)` : ""}.
        </p>
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
