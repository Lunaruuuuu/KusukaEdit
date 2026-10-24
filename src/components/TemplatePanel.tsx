"use client";

import React, { useMemo, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { parseDocument } from "@/lib/polotnoAdapter";
import { TEMPLATES } from "@/templates";
import TemplateThumbnail from "./TemplateThumbnail";

const FORMAT_BADGE = { kusuka: "Native", polotno: "Polotno" } as const;

export default function TemplatePanel() {
  const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
  const [status, setStatus] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Run each template through the adapter once: detects its format and gives
  // the converted document the thumbnail is drawn from.
  const cards = useMemo(
    () => TEMPLATES.map((template) => ({ template, parsed: parseDocument(template.data) })),
    []
  );

  function applyTemplate(id: string) {
    const entry = TEMPLATES.find((t) => t.id === id);
    if (!entry) return;
    // Same entry point as the Import button; the whole canvas is replaced as
    // one undoable step (Ctrl+Z brings the previous design back).
    const result = loadFromJSON(entry.data);
    if (result.ok) {
      setStatus(`Template "${entry.name}" dimuat. Tekan Ctrl+Z untuk membatalkan.`);
      setWarnings(result.warnings);
    } else {
      setStatus(`Gagal memuat template: ${result.error}`);
      setWarnings([]);
    }
  }

  return (
    <div className="template-panel">
      <p className="hint hint--tight">Klik template untuk mengganti isi kanvas.</p>
      <div className="template-grid">
        {cards.map(({ template, parsed }) =>
          parsed.ok ? (
            <button
              key={template.id}
              className="template-card"
              onClick={() => applyTemplate(template.id)}
              title={`Pakai template ${template.name}`}
            >
              <span className="template-card__thumb">
                <TemplateThumbnail document={parsed.document} />
              </span>
              <span className="template-card__meta">
                <span className="template-card__name">{template.name}</span>
                <span className="template-card__badge" title="Format file template di repositori">
                  {FORMAT_BADGE[parsed.format]}
                </span>
              </span>
            </button>
          ) : null
        )}
      </div>
      {status && <p className="hint">{status}</p>}
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
