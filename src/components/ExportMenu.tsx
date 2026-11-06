"use client";

import React, { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { selectCanvas } from "@/store/selectors";
import { exportStageAsImage } from "@/lib/exportImage";
import { exportAllPagesAsZip } from "@/lib/exportPages";
import { resolveExportPixelRatio } from "@/lib/workspace";
import {
  EXPORT_CHOICES,
  EXPORT_RESOLUTIONS,
  FORMAT_LABEL,
  exportChoiceInfo,
  isExportChoice,
  jsonFileName,
  jsonFormatOf,
  type ExportChoice,
} from "@/lib/fileFlow";

// ---------------------------------------------------------------------------
// The "Ekspor" button of the header, right of Undo / Redo — Polotno's Download
// button. It opens a small menu: the file type (PNG, JPG, JSON KusukaEdit,
// JSON Polotno), and for pictures the resolution and which pages; then one
// "Unduh" button. The last choices are remembered in this browser.
// ---------------------------------------------------------------------------

type Scope = "page" | "all";

const STORAGE_KEY = "kusukaedit.export";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readSaved(): { choice: ExportChoice; resolution: number } {
  const fallback = { choice: "png" as ExportChoice, resolution: 2 };
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    return {
      choice: isExportChoice(raw?.choice) ? raw.choice : fallback.choice,
      resolution: EXPORT_RESOLUTIONS.includes(raw?.resolution) ? raw.resolution : fallback.resolution,
    };
  } catch {
    return fallback;
  }
}

export default function ExportMenu() {
  const exportToJSON = useEditorStore((s) => s.exportToJSON);
  const stageNode = useEditorStore((s) => s.stageNode);
  const canvas = useEditorStore(selectCanvas);
  const pages = useEditorStore((s) => s.pages);
  const currentPageIndex = useEditorStore((s) => s.currentPageIndex);
  const batchRunning = useEditorStore((s) => s.exportProgress !== null);

  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ExportChoice>("png");
  const [resolution, setResolution] = useState(2);
  const [scope, setScope] = useState<Scope>("page");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Restored after mounting (localStorage does not exist on the server).
  useEffect(() => {
    const saved = readSaved();
    setChoice(saved.choice);
    setResolution(saved.resolution);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, resolution }));
    } catch {
      /* private mode: the choice is simply not remembered */
    }
  }, [choice, resolution]);

  // Closes on Escape or a press outside the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const info = exportChoiceInfo(choice);
  const pageCount = pages.length;
  // A one-page document has nothing to batch: "all pages" is the active page.
  const effectiveScope: Scope = pageCount > 1 ? scope : "page";

  // What the picture(s) will measure, from the CURRENT canvas size(s).
  const plan = resolveExportPixelRatio(canvas.width, canvas.height, resolution);
  const plans = pages.map((p) => resolveExportPixelRatio(p.canvas.width, p.canvas.height, resolution));
  const sameSize = plans.every((p) => p.outputWidth === plans[0].outputWidth && p.outputHeight === plans[0].outputHeight);
  const anyCapped = plans.some((p) => p.capped);

  async function exportJson() {
    const format = jsonFormatOf(choice)!;
    // Async: uploaded pictures (temporary blob: URLs) are read back and
    // embedded in the file. The file holds EVERY page of the document.
    const { json, warnings: exportWarnings } = await exportToJSON(format);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = jsonFileName(format);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setWarnings(exportWarnings);
    setMessage(`JSON ${FORMAT_LABEL[format]} diunduh (${pageCount} halaman dalam satu berkas).`);
  }

  async function exportImage() {
    if (!stageNode) throw new Error("Kanvas belum siap, coba lagi sesaat lagi.");
    const format = choice === "jpeg" ? "jpeg" : "png";
    if (effectiveScope === "all") {
      // The menu closes: the canvas shows the progress of the batch.
      setOpen(false);
      const result = await exportAllPagesAsZip({ stage: stageNode, format, pixelRatio: resolution });
      setWarnings(result.capped ? ["Resolusi sebagian halaman diturunkan agar sisi terpanjang tidak melebihi batas browser."] : []);
      setMessage(`${result.pageCount} halaman ${info.label} dikemas dalam ${result.fileName} (${formatBytes(result.zipBytes)}).`);
      return;
    }
    // The active page, straight from the Stage: stage.toDataURL().
    const result = exportStageAsImage(stageNode, {
      format,
      pixelRatio: resolution,
      // The picture is the design, not what happens to be on screen at this zoom.
      designSize: { width: canvas.width, height: canvas.height },
    });
    setWarnings(result.capped ? [`Resolusi diturunkan ke ${result.pixelRatio}x agar sisi terpanjang tidak melebihi batas browser.`] : []);
    setMessage(`Halaman ${currentPageIndex + 1}: ${info.label} ${result.outputWidth} × ${result.outputHeight} px diunduh.`);
  }

  async function handleDownload() {
    setWorking(true);
    setMessage(null);
    setWarnings([]);
    try {
      if (info.kind === "json") await exportJson();
      else await exportImage();
    } catch (err) {
      setMessage(err instanceof Error ? `Gagal mengekspor: ${err.message}` : "Gagal mengekspor.");
    } finally {
      setWorking(false);
    }
  }

  const busy = working || batchRunning;
  return (
    <div className="export-menu" ref={rootRef} data-export-menu="">
      <button
        type="button"
        className="export-menu__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={batchRunning}
        data-action="export-menu"
      >
        <span aria-hidden="true">⬇</span>
        <span className="export-menu__label">{batchRunning ? "Mengekspor…" : "Ekspor"}</span>
        <span aria-hidden="true" className="export-menu__caret">▾</span>
      </button>

      {open && (
        <div className="export-menu__panel" role="dialog" aria-label="Ekspor desain">
          <span className="export-menu__heading">Jenis berkas</span>
          <div className="export-menu__choices" role="radiogroup" aria-label="Jenis berkas">
            {EXPORT_CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={choice === c.id}
                className={`export-choice${choice === c.id ? " active" : ""}`}
                onClick={() => setChoice(c.id)}
                data-export-format={c.id}
              >
                <strong>{c.label}</strong>
                <span>{c.description}</span>
              </button>
            ))}
          </div>

          {info.kind === "image" && (
            <>
              <span className="export-menu__heading">Resolusi</span>
              <div className="segmented segmented--stretch" role="group" aria-label="Resolusi">
                {EXPORT_RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={resolution === r ? "active" : ""}
                    aria-pressed={resolution === r}
                    onClick={() => setResolution(r)}
                    data-export-resolution={r}
                  >
                    {r}x
                  </button>
                ))}
              </div>
              <span className="export-menu__heading">Halaman</span>
              <div className="segmented segmented--stretch" role="group" aria-label="Cakupan ekspor">
                <button
                  type="button"
                  className={effectiveScope === "page" ? "active" : ""}
                  aria-pressed={effectiveScope === "page"}
                  onClick={() => setScope("page")}
                  data-export-scope="page"
                >
                  Halaman aktif
                </button>
                <button
                  type="button"
                  className={effectiveScope === "all" ? "active" : ""}
                  aria-pressed={effectiveScope === "all"}
                  onClick={() => setScope("all")}
                  disabled={pageCount < 2}
                  data-export-scope="all"
                  title={pageCount < 2 ? "Dokumen ini hanya punya satu halaman" : "Semua halaman dalam satu berkas ZIP"}
                >
                  Semua ({pageCount}) · ZIP
                </button>
              </div>
            </>
          )}

          <p className="hint hint--tight" data-export-summary="">
            {info.kind === "json" ? (
              <>Seluruh {pageCount} halaman dalam satu berkas .json; gambar unggahan disertakan.</>
            ) : effectiveScope === "all" ? (
              <>
                {pageCount} berkas {info.label} dalam satu ZIP,{" "}
                {sameSize ? `masing-masing ${plans[0].outputWidth} × ${plans[0].outputHeight} px` : "ukuran sesuai tiap halaman"}
                {anyCapped ? " (resolusi sebagian dibatasi)" : ""}.
              </>
            ) : (
              <>
                Kanvas {canvas.width} × {canvas.height} px → {plan.outputWidth} × {plan.outputHeight} px
                {plan.capped ? ` (resolusi dibatasi ${plan.pixelRatio}x)` : ""}.
              </>
            )}
          </p>

          <button
            type="button"
            className="export-menu__download"
            onClick={handleDownload}
            disabled={busy || (info.kind === "image" && !stageNode)}
            data-action={info.kind === "json" ? "export-json" : "export-image"}
          >
            {working ? "Menyiapkan…" : `Unduh ${info.label}`}
          </button>

          {message && (
            <p className="hint hint--tight" role="status">
              {message}
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="warning-list warning-list--tight">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
