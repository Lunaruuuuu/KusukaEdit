"use client";

import React, { useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import TemplatePanel from "./TemplatePanel";

type Tab = "elements" | "templates";

export default function SidePanel() {
  const addTextElement = useEditorStore((s) => s.addTextElement);
  const addShapeElement = useEditorStore((s) => s.addShapeElement);
  const [tab, setTab] = useState<Tab>("elements");

  return (
    <aside className="panel side-panel">
      <div className="segmented segmented--stretch" role="tablist" aria-label="Panel samping">
        <button
          role="tab"
          aria-selected={tab === "elements"}
          className={tab === "elements" ? "active" : ""}
          onClick={() => setTab("elements")}
        >
          Elemen
        </button>
        <button
          role="tab"
          aria-selected={tab === "templates"}
          className={tab === "templates" ? "active" : ""}
          onClick={() => setTab("templates")}
        >
          Template
        </button>
      </div>

      {tab === "templates" ? (
        <TemplatePanel />
      ) : (
        <>
          <div className="panel-section">
            <h3>Text</h3>
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
            <h3>Gambar</h3>
            <p className="hint">Upload gambar akan tersedia di versi berikutnya.</p>
          </div>

          <div className="panel-section">
            <h3>Pintasan</h3>
            <p className="hint hint--tight">
              Klik dua kali pada teks untuk mengedit. Ctrl+C / Ctrl+V menyalin dan menempel elemen.
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
