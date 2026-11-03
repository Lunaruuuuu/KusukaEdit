"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { prepareImageFile } from "@/lib/imageUpload";
import TemplatePanel from "./TemplatePanel";
import WorkspacePanel from "./WorkspacePanel";

type Tab = "elements" | "images" | "templates" | "canvas";

// The tabs run down a rail on the left edge (icon over label), like Polotno's
// side bar; the panel of the chosen tab fills the space next to it.
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "elements", label: "Elemen", icon: "＋" },
  { id: "images", label: "Gambar", icon: "▣" },
  { id: "templates", label: "Template", icon: "▦" },
  { id: "canvas", label: "Kanvas", icon: "⤢" },
];

export default function SidePanel() {
  const addTextElement = useEditorStore((s) => s.addTextElement);
  const addShapeElement = useEditorStore((s) => s.addShapeElement);
  const addImageElement = useEditorStore((s) => s.addImageElement);
  const [tab, setTab] = useState<Tab>("elements");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so choosing the same file again still fires `change`.
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadMessage(null);
    try {
      // URL.createObjectURL(file) happens inside; the picture is only added
      // once it has loaded, so a broken file never leaves an empty element.
      addImageElement(await prepareImageFile(file));
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Gambar gagal diunggah.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <aside className="panel side-panel" data-side-panel="">
      <nav className="side-rail" role="tablist" aria-orientation="vertical" aria-label="Panel samping">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`side-rail__tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
            data-side-tab={t.id}
          >
            <span className="side-rail__icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="side-rail__label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="side-content" role="tabpanel">
        {tab === "templates" && <TemplatePanel />}
        {tab === "canvas" && <WorkspacePanel />}

        {tab === "elements" && (
          <>
            <div className="panel-section">
              <h3>Teks</h3>
              <div className="panel-buttons">
                <button onClick={() => addTextElement("title")}>+ Judul</button>
                <button onClick={() => addTextElement("subtitle")}>+ Subjudul</button>
                <button onClick={() => addTextElement("paragraph")}>+ Paragraf</button>
              </div>
            </div>

            <div className="panel-section">
              <h3>Bentuk</h3>
              <div className="panel-buttons">
                <button onClick={() => addShapeElement("rect")}>
                  <span className="shape-icon shape-icon--rect" /> Persegi
                </button>
                <button onClick={() => addShapeElement("circle")}>
                  <span className="shape-icon shape-icon--circle" /> Lingkaran
                </button>
              </div>
            </div>

            <div className="panel-section">
              <h3>Pintasan</h3>
              <p className="hint hint--tight">
                Klik dua kali pada teks untuk mengedit, dan pada gambar untuk memangkas. Ctrl+C / Ctrl+V menyalin
                dan menempel elemen (juga ke halaman lain).
              </p>
            </div>
          </>
        )}

        {tab === "images" && (
          <div className="panel-section">
            <h3>Gambar</h3>
            <div className="panel-buttons">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "Memuat gambar…" : "⬆ Unggah gambar"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {uploadMessage && <p className="error-note">{uploadMessage}</p>}
            <p className="hint hint--tight">
              Atau seret berkas gambar langsung ke kanvas: gambar masuk di posisi kursor. Pilih gambar di kanvas
              untuk memangkas, atau membuka <strong>Filter &amp; Efek</strong> di bilah atas.
            </p>
            <p className="hint hint--tight">
              Gambar tidak dikirim ke server. Saat ekspor JSON, gambar disertakan di dalam file.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
