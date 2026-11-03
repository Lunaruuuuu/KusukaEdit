"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { selectCanvas } from "@/store/selectors";
import { exportStageAsImage, type ImageFormat } from "@/lib/exportImage";
import { exportAllPagesAsZip } from "@/lib/exportPages";
import { resolveExportPixelRatio } from "@/lib/workspace";
import type { ExportFormat } from "@/lib/polotnoAdapter";

const FORMAT_LABEL: Record<ExportFormat, string> = {
  kusuka: "KusukaEdit",
  polotno: "Polotno",
};

type ExportScope = "page" | "all";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ActionPanel() {
  const exportToJSON = useEditorStore((s) => s.exportToJSON);
  const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
  const reset = useEditorStore((s) => s.reset);
  const stageNode = useEditorStore((s) => s.stageNode);
  const canvas = useEditorStore(selectCanvas);
  const pages = useEditorStore((s) => s.pages);
  const currentPageIndex = useEditorStore((s) => s.currentPageIndex);
  const batchRunning = useEditorStore((s) => s.exportProgress !== null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [jsonFormat, setJsonFormat] = useState<ExportFormat>("kusuka");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");
  const [resolution, setResolution] = useState(2);
  const [scope, setScope] = useState<ExportScope>("page");
  const [exportingJson, setExportingJson] = useState(false);

  const pageCount = pages.length;
  // A one-page document has nothing to batch: "all pages" is the active page.
  const effectiveScope: ExportScope = pageCount > 1 ? scope : "page";

  // What the picture(s) will measure, from the CURRENT canvas size(s). Updates
  // the moment the workspace is resized in the "Kanvas" tab.
  const plan = resolveExportPixelRatio(canvas.width, canvas.height, resolution);
  const plans = pages.map((page) => resolveExportPixelRatio(page.canvas.width, page.canvas.height, resolution));
  const sameSize = plans.every((p) => p.outputWidth === plans[0].outputWidth && p.outputHeight === plans[0].outputHeight);
  const anyCapped = plans.some((p) => p.capped);

  async function handleExportJSON() {
    setExportingJson(true);
    try {
      // Async: uploaded pictures (temporary blob: URLs) are read back and
      // embedded in the file, so it still works after a page refresh. The file
      // holds EVERY page of the document.
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
      setMessage(
        `JSON format ${FORMAT_LABEL[jsonFormat]} berhasil diunduh (${pageCount} halaman dalam satu berkas).`
      );
    } catch (err) {
      setWarnings([]);
      setMessage(`Gagal ekspor JSON: ${err instanceof Error ? err.message : "kesalahan tidak dikenal"}`);
    } finally {
      setExportingJson(false);
    }
  }

  async function handleExportImage() {
    if (!stageNode) {
      setMessage("Kanvas belum siap, coba lagi sesaat lagi.");
      return;
    }
    try {
      if (effectiveScope === "all") {
        const result = await exportAllPagesAsZip({
          stage: stageNode,
          format: imageFormat,
          pixelRatio: resolution,
        });
        setWarnings(
          result.capped
            ? ["Resolusi sebagian halaman diturunkan agar sisi terpanjang tidak melebihi batas browser."]
            : []
        );
        setMessage(
          `${result.pageCount} halaman ${imageFormat.toUpperCase()} dikemas dalam ${result.fileName} (${formatBytes(result.zipBytes)}).`
        );
        return;
      }

      // The active page, straight from the Stage: stage.toDataURL().
      const result = exportStageAsImage(stageNode, {
        format: imageFormat,
        pixelRatio: resolution,
        // The picture is the design, not what happens to be on screen at this zoom.
        designSize: { width: canvas.width, height: canvas.height },
      });
      setWarnings(
        result.capped
          ? [`Resolusi diturunkan ke ${result.pixelRatio}x agar sisi terpanjang tidak melebihi batas browser.`]
          : []
      );
      setMessage(
        `Halaman ${currentPageIndex + 1}: gambar ${imageFormat.toUpperCase()} ${result.outputWidth} × ${result.outputHeight} px berhasil diunduh.`
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
        setMessage(
          `Desain berhasil diimpor (terdeteksi format ${FORMAT_LABEL[result.format]}, ${result.pageCount} halaman).`
        );
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

  const extension = imageFormat.toUpperCase();
  return (
    <div className="panel action-panel" data-action-panel="">
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
          <button onClick={handleExportJSON} disabled={exportingJson || batchRunning} data-action="export-json">
            {exportingJson ? "Menyiapkan…" : `⬇ Export JSON (${FORMAT_LABEL[jsonFormat]})`}
          </button>
          <button onClick={handleImportClick} disabled={batchRunning} data-action="import-json">
            ⬆ Import JSON
          </button>
        </div>
        <p className="hint hint--tight">
          Seluruh halaman ({pageCount}) disimpan dalam satu berkas. Import mengenali format KusukaEdit dan Polotno
          otomatis.
        </p>
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
        <div className="field">
          <span>Cakupan</span>
          <div className="segmented segmented--stretch" role="group" aria-label="Cakupan ekspor">
            <button
              className={effectiveScope === "page" ? "active" : ""}
              aria-pressed={effectiveScope === "page"}
              onClick={() => setScope("page")}
              data-export-scope="page"
              title="Hanya halaman yang sedang dibuka"
            >
              Halaman aktif
            </button>
            <button
              className={effectiveScope === "all" ? "active" : ""}
              aria-pressed={effectiveScope === "all"}
              onClick={() => setScope("all")}
              disabled={pageCount < 2}
              data-export-scope="all"
              title={pageCount < 2 ? "Dokumen ini hanya punya satu halaman" : "Semua halaman, satu per satu, dalam satu berkas ZIP"}
            >
              Semua ({pageCount})
            </button>
          </div>
        </div>
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
          <button onClick={handleExportImage} disabled={!stageNode || batchRunning} data-action="export-image">
            {batchRunning
              ? "Mengekspor…"
              : effectiveScope === "all"
                ? `⬇ Export ${pageCount} halaman (ZIP)`
                : `⬇ Export ${extension}${pageCount > 1 ? ` (hal. ${currentPageIndex + 1})` : ""}`}
          </button>
        </div>
        <p className="hint hint--tight" data-export-summary="">
          {effectiveScope === "all" ? (
            <>
              {pageCount} halaman → satu ZIP berisi {pageCount} berkas {extension},{" "}
              {sameSize
                ? `masing-masing ${plans[0].outputWidth} × ${plans[0].outputHeight} px`
                : "ukuran sesuai tiap halaman"}
              {anyCapped ? " (resolusi sebagian dibatasi)" : ""}.
            </>
          ) : (
            <>
              Kanvas {canvas.width} × {canvas.height} px → hasil {plan.outputWidth} × {plan.outputHeight} px
              {plan.capped ? ` (resolusi dibatasi ${plan.pixelRatio}x)` : ""}.
            </>
          )}
        </p>
      </div>

      <div className="panel-section">
        <button
          className="ghost"
          onClick={reset}
          disabled={batchRunning}
          title="Hapus semua halaman dan mulai dari satu halaman kosong (bisa dibatalkan dengan Ctrl+Z)"
        >
          Kosongkan Dokumen
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
