"use client";

import React, { useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";

export default function ActionPanel() {
  const exportToJSON = useEditorStore((s) => s.exportToJSON);
  const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
  const reset = useEditorStore((s) => s.reset);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleExport() {
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
        result.ok
          ? "Desain berhasil diimpor dari JSON."
          : `Gagal impor: ${result.error}`
      );
    };
    reader.readAsText(file);

    // allow re-selecting the same file later
    e.target.value = "";
  }

  return (
    <div className="panel action-panel">
      <button onClick={handleExport}>⬇ Export JSON</button>
      <button onClick={handleImportClick}>⬆ Import JSON</button>
      <button className="ghost" onClick={reset}>
        Kosongkan Kanvas
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {message && <p className="hint">{message}</p>}
    </div>
  );
}
