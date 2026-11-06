"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { prepareImageFile } from "@/lib/imageUpload";
import { FORMAT_LABEL, PROJECT_FILE_ACCEPT, previewImport, type ImportPreview } from "@/lib/fileFlow";
import TemplateThumbnail from "./TemplateThumbnail";

// ---------------------------------------------------------------------------
// The "Impor" tab of the left panel — every way a file comes INTO the editor,
// in one place, laid out like Polotno's Import panel: one card per kind of
// file, each with a "Pilih berkas" button.
//
//   Proyek (JSON)  KusukaEdit or Polotno. The file is read and DETECTED first
//                  (format, pages, size, warnings, a thumbnail); it replaces the
//                  design only when "Buka desain" is pressed — one undo step.
//   Gambar         PNG / JPG / WebP / GIF / SVG, placed on the active page.
//   Template       a shortcut to the template gallery.
// ---------------------------------------------------------------------------

interface Props {
  /** Shows the template gallery tab. */
  onOpenTemplates: () => void;
}

export default function ImportPanel({ onOpenTemplates }: Props) {
  const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
  const addImageElement = useEditorStore((s) => s.addImageElement);
  const busy = useEditorStore((s) => s.exportProgress !== null);

  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [opened, setOpened] = useState<{ message: string; warnings: string[] } | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleProjectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same file again must still fire `change`
    if (!file) return;
    setReading(true);
    setOpened(null);
    try {
      // The format (KusukaEdit or Polotno) is detected from the content, not the name.
      setPreview(previewImport(await file.text(), file.name));
    } catch {
      setPreview({ ok: false, fileName: file.name, error: "Berkas tidak bisa dibaca." });
    } finally {
      setReading(false);
    }
  }

  function openPreview() {
    if (!preview?.ok) return;
    const result = loadFromJSON(preview.text);
    if (result.ok) {
      setOpened({
        message: `"${preview.fileName}" dibuka (${FORMAT_LABEL[result.format]}, ${result.pageCount} halaman). Ctrl+Z mengembalikan desain sebelumnya.`,
        warnings: result.warnings,
      });
    } else {
      setOpened({ message: `Gagal membuka: ${result.error}`, warnings: [] });
    }
    setPreview(null);
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setImageMessage(null);
    try {
      // URL.createObjectURL(file) happens inside; the picture is only added
      // once it has loaded, so a broken file never leaves an empty element.
      addImageElement(await prepareImageFile(file));
    } catch (err) {
      setImageMessage(err instanceof Error ? err.message : "Gambar gagal diunggah.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="import-panel" data-import-panel="">
      <p className="hint hint--tight">
        Masukkan berkas ke editor. Proyek JSON dibuka sebagai desain baru; gambar ditambahkan ke halaman aktif.
      </p>

      <section className="import-card" data-import-card="project">
        <h4>
          <span aria-hidden="true">⎘</span> Proyek desain (JSON)
        </h4>
        <p>Berkas KusukaEdit atau Polotno (.json). Formatnya dikenali otomatis dari isinya.</p>
        <button
          type="button"
          className="import-card__choose"
          onClick={() => projectInputRef.current?.click()}
          disabled={reading || busy}
          data-action="import-json"
        >
          {reading ? "Membaca…" : "Pilih berkas"}
        </button>
        <input
          ref={projectInputRef}
          type="file"
          accept={PROJECT_FILE_ACCEPT}
          style={{ display: "none" }}
          onChange={handleProjectFile}
        />

        {preview && !preview.ok && (
          <div className="import-preview import-preview--error" role="alert" data-import-preview="error">
            <strong>{preview.fileName}</strong>
            <span>{preview.error}</span>
          </div>
        )}

        {preview?.ok && (
          <div className="import-preview" data-import-preview="ok">
            <div
              className="import-preview__thumb"
              style={{
                aspectRatio: `${preview.document.pages[0].canvas.width} / ${preview.document.pages[0].canvas.height}`,
              }}
            >
              <TemplateThumbnail page={preview.document.pages[0]} />
            </div>
            <div className="import-preview__facts">
              <strong title={preview.fileName}>{preview.fileName}</strong>
              <span>
                <span className="badge" data-import-format={preview.format}>
                  {FORMAT_LABEL[preview.format]}
                </span>{" "}
                {preview.pageCount} halaman · {preview.elementCount} elemen
              </span>
              <span>{preview.sizeLabel}</span>
            </div>
            {preview.warnings.length > 0 && (
              <ul className="warning-list warning-list--tight">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <p className="hint hint--tight">Membuka berkas ini mengganti seluruh halaman desain yang sekarang.</p>
            <div className="import-preview__actions">
              <button type="button" className="import-card__choose import-card__choose--primary" onClick={openPreview} data-action="open-import">
                Buka desain
              </button>
              <button type="button" className="import-card__choose" onClick={() => setPreview(null)}>
                Batal
              </button>
            </div>
          </div>
        )}

        {opened && (
          <div className="import-result" role="status">
            <p className="hint hint--tight">{opened.message}</p>
            {opened.warnings.length > 0 && (
              <ul className="warning-list warning-list--tight">
                {opened.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="import-card" data-import-card="image">
        <h4>
          <span aria-hidden="true">▣</span> Gambar
        </h4>
        <p>PNG, JPG, WebP, GIF, atau SVG dari komputer. Bisa juga diseret langsung ke kanvas.</p>
        <button
          type="button"
          className="import-card__choose"
          onClick={() => imageInputRef.current?.click()}
          disabled={uploading || busy}
          data-action="upload-image"
        >
          {uploading ? "Memuat gambar…" : "Pilih berkas"}
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageFile} />
        {imageMessage && <p className="error-note">{imageMessage}</p>}
        <p className="hint hint--tight">Gambar tidak dikirim ke server; saat ekspor JSON gambar disertakan di dalam berkas.</p>
      </section>

      <section className="import-card" data-import-card="templates">
        <h4>
          <span aria-hidden="true">▦</span> Template
        </h4>
        <p>Mulai dari desain siap pakai (format KusukaEdit dan Polotno, sebagian multi-halaman).</p>
        <button type="button" className="import-card__choose" onClick={onOpenTemplates}>
          Buka galeri template
        </button>
      </section>
    </div>
  );
}
