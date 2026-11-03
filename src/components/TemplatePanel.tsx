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
  // the converted document the thumbnail is drawn from (its first page).
  const cards = useMemo(
    () => TEMPLATES.map((template) => ({ template, parsed: parseDocument(template.data) })),
    []
  );

  function applyTemplate(id: string) {
    const entry = TEMPLATES.find((t) => t.id === id);
    if (!entry) return;
    // Same entry point as the Import button: loadFromJSON() -> parseDocument()
    // detects the format, the adapter rebuilds every page and element, and the
    // whole document is replaced as one undoable step (Ctrl+Z brings the
    // previous design back).
    const result = loadFromJSON(entry.data);
    if (result.ok) {
      setStatus(
        `Template "${entry.name}" dimuat: format ${FORMAT_BADGE[result.format]} terdeteksi, ${result.pageCount} halaman. Tekan Ctrl+Z untuk membatalkan.`
      );
      setWarnings(result.warnings);
    } else {
      setStatus(`Gagal memuat template: ${result.error}`);
      setWarnings([]);
    }
  }

  return (
    <div className="template-panel" data-template-panel="">
      <p className="hint hint--tight">Klik template untuk mengganti seluruh isi dokumen.</p>
      <div className="template-grid">
        {cards.map(({ template, parsed }) => {
          if (!parsed.ok) return null;
          const pages = parsed.document.pages;
          const first = pages[0];
          return (
            <button
              key={template.id}
              className="template-card"
              onClick={() => applyTemplate(template.id)}
              title={`Pakai template ${template.name}`}
              data-template-id={template.id}
              data-template-pages={pages.length}
            >
              <span className={`template-card__thumb${pages.length > 1 ? " template-card__thumb--stack" : ""}`}>
                <span className="template-card__sheet">
                  <TemplateThumbnail page={first} />
                </span>
              </span>
              <span className="template-card__meta">
                <span className="template-card__name">{template.name}</span>
                <span className="template-card__badges">
                  {pages.length > 1 && (
                    <span className="template-card__badge template-card__badge--pages" title="Jumlah halaman">
                      {pages.length} hal.
                    </span>
                  )}
                  <span className="template-card__badge" title="Format file template di repositori">
                    {FORMAT_BADGE[parsed.format]}
                  </span>
                </span>
              </span>
              {template.description && <span className="template-card__desc">{template.description}</span>}
            </button>
          );
        })}
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
