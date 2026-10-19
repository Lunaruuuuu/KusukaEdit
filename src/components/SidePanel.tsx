"use client";

import React from "react";
import { useEditorStore } from "@/store/useEditorStore";

export default function SidePanel() {
  const addTextElement = useEditorStore((s) => s.addTextElement);
  const addShapeElement = useEditorStore((s) => s.addShapeElement);

  return (
    <aside className="panel side-panel">
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
    </aside>
  );
}
