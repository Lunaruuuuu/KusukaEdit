"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { convertKusukaToPolotno, parseDocument } from "@/lib/polotnoAdapter";
import {
  browserStorage,
  fetchTemplateDocument,
  fetchTemplateIndex,
  listUserTemplates,
  removeUserTemplate,
  saveUserTemplate,
  templateUrl,
  type TemplateIndexEntry,
  type UserTemplate,
} from "@/lib/templateLibrary";
import { PROJECT_FILE_ACCEPT } from "@/lib/fileFlow";
import TemplateThumbnail from "./TemplateThumbnail";

// ---------------------------------------------------------------------------
// The Template tab (v11).
//
//   Template saya   the user's own templates, kept in this browser
//                   (localStorage): "Simpan desain ini" stores the current
//                   document as a Polotno JSON; "Unggah berkas" adds a JSON file
//                   (KusukaEdit or Polotno) to the list. Each can be removed.
//   Galeri          the catalogue fetched from /templates/index.json, with the
//                   SVG previews next to it. Choosing a card fetches that
//                   template's Polotno JSON and opens it.
//
// Every template is opened through loadFromJSON() — the same path as an
// imported file (parseDocument -> convertPolotnoToKusuka): all pages rebuilt,
// one undo step, Ctrl+Z brings the previous design back.
// ---------------------------------------------------------------------------

type GalleryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; templates: TemplateIndexEntry[] };

function UserTemplateCard({
  template,
  busy,
  onOpen,
  onRemove,
}: {
  template: UserTemplate;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  // The preview is drawn from the saved document itself (no picture stored).
  const parsed = useMemo(() => parseDocument(template.data), [template.data]);
  const pages = parsed.ok ? parsed.document.pages : [];
  return (
    <div className="template-card template-card--user" data-user-template={template.id}>
      <button type="button" className="template-card__open" onClick={onOpen} disabled={busy || !parsed.ok} title={`Pakai template ${template.name}`}>
        <span className={`template-card__thumb${pages.length > 1 ? " template-card__thumb--stack" : ""}`}>
          <span className="template-card__sheet">{pages[0] && <TemplateThumbnail page={pages[0]} />}</span>
        </span>
        <span className="template-card__meta">
          <span className="template-card__name">{template.name}</span>
          <span className="template-card__badges">
            {pages.length > 1 && <span className="template-card__badge template-card__badge--pages">{pages.length} hal.</span>}
            <span className="template-card__badge">Milik saya</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="template-card__remove"
        onClick={onRemove}
        title={`Hapus "${template.name}" dari daftar (berkas lain tidak tersentuh)`}
        aria-label={`Hapus template ${template.name}`}
        data-action="remove-user-template"
      >
        ✕
      </button>
    </div>
  );
}

export default function TemplatePanel() {
  const loadFromJSON = useEditorStore((s) => s.loadFromJSON);
  const exportToJSON = useEditorStore((s) => s.exportToJSON);
  const [gallery, setGallery] = useState<GalleryState>({ status: "loading" });
  const [mine, setMine] = useState<UserTemplate[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saveName, setSaveName] = useState("");
  const uploadRef = useRef<HTMLInputElement | null>(null);

  // The catalogue is fetched once per opening of the tab.
  useEffect(() => {
    let cancelled = false;
    void fetchTemplateIndex((url) => fetch(url, { cache: "no-cache" })).then((result) => {
      if (cancelled) return;
      if ("error" in result) setGallery({ status: "error", message: result.error });
      else setGallery({ status: "ready", templates: result.index.templates });
    });
    setMine(listUserTemplates(browserStorage()));
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(
    (name: string, data: unknown, origin: string) => {
      const result = loadFromJSON(data);
      if (result.ok) {
        setStatus(`${origin} "${name}" dimuat: ${result.pageCount} halaman. Tekan Ctrl+Z untuk membatalkan.`);
        setWarnings(result.warnings);
      } else {
        setStatus(`Gagal memuat template: ${result.error}`);
        setWarnings([]);
      }
    },
    [loadFromJSON]
  );

  async function openFromGallery(entry: TemplateIndexEntry) {
    setBusyId(entry.id);
    setStatus(`Mengunduh "${entry.name}"…`);
    setWarnings([]);
    const fetched = await fetchTemplateDocument(entry, (url) => fetch(url));
    setBusyId(null);
    if ("error" in fetched) {
      setStatus(fetched.error);
      return;
    }
    open(entry.name, fetched.data, "Template");
  }

  async function saveCurrent() {
    setBusyId("save");
    try {
      // The same file "Ekspor > JSON Polotno" writes (uploaded pictures embedded).
      const { json, warnings: exportWarnings } = await exportToJSON("polotno");
      const data: unknown = JSON.parse(json);
      const pages = useEditorStore.getState().pages.length;
      const saved = saveUserTemplate(browserStorage(), {
        name: saveName || `Desain ${new Date().toLocaleString("id-ID")}`,
        data,
        pages,
      });
      if (saved.ok) {
        setMine(listUserTemplates(browserStorage()));
        setSaveName("");
        setStatus(`Disimpan sebagai template "${saved.template.name}" (di browser ini).`);
        setWarnings(exportWarnings);
      } else {
        setStatus(saved.error);
        setWarnings([]);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function uploadTemplate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file twice must still fire `change`
    if (!file) return;
    const parsed = parseDocument(await file.text());
    if (!parsed.ok) {
      setStatus(`"${file.name}" tidak bisa dipakai sebagai template: ${parsed.error}`);
      setWarnings([]);
      return;
    }
    // Every saved template is kept in Polotno's format, whatever was uploaded.
    const saved = saveUserTemplate(browserStorage(), {
      name: file.name.replace(/\.(polotno\.)?json$/i, ""),
      data: convertKusukaToPolotno(parsed.document),
      pages: parsed.document.pages.length,
    });
    if (saved.ok) {
      setMine(listUserTemplates(browserStorage()));
      setStatus(`"${saved.template.name}" ditambahkan ke Template saya (${parsed.format === "polotno" ? "Polotno" : "KusukaEdit"}, ${parsed.document.pages.length} halaman).`);
      setWarnings(parsed.warnings);
    } else {
      setStatus(saved.error);
      setWarnings([]);
    }
  }

  function remove(template: UserTemplate) {
    const result = removeUserTemplate(browserStorage(), template.id);
    if (result.ok) {
      setMine(listUserTemplates(browserStorage()));
      setStatus(`"${template.name}" dihapus dari Template saya.`);
    } else {
      setStatus(result.error);
    }
    setWarnings([]);
  }

  return (
    <div className="template-panel" data-template-panel="">
      <section className="template-section" data-template-section="mine">
        <h3 className="template-section__title">Template saya</h3>
        <div className="template-save">
          <input
            type="text"
            value={saveName}
            maxLength={80}
            placeholder="Nama template"
            aria-label="Nama template"
            onChange={(e) => setSaveName(e.target.value)}
          />
          <button type="button" onClick={saveCurrent} disabled={busyId !== null} data-action="save-template">
            {busyId === "save" ? "Menyimpan…" : "Simpan desain ini"}
          </button>
        </div>
        <button type="button" className="template-upload" onClick={() => uploadRef.current?.click()} data-action="upload-template">
          ⇪ Unggah berkas template (.json)
        </button>
        <input ref={uploadRef} type="file" accept={PROJECT_FILE_ACCEPT} style={{ display: "none" }} onChange={uploadTemplate} />
        {mine.length === 0 ? (
          <p className="hint hint--tight">Belum ada. Template disimpan di browser ini saja (localStorage).</p>
        ) : (
          <div className="template-grid">
            {mine.map((t) => (
              <UserTemplateCard
                key={t.id}
                template={t}
                busy={busyId !== null}
                onOpen={() => open(t.name, t.data, "Template")}
                onRemove={() => remove(t)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="template-section" data-template-section="gallery">
        <h3 className="template-section__title">Galeri</h3>
        {gallery.status === "loading" && <p className="hint hint--tight">Memuat katalog template…</p>}
        {gallery.status === "error" && <p className="error-note">{gallery.message}</p>}
        {gallery.status === "ready" && (
          <div className="template-grid">
            {gallery.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="template-card"
                onClick={() => openFromGallery(t)}
                disabled={busyId !== null}
                title={`Pakai template ${t.name}`}
                data-template-id={t.id}
                data-template-pages={t.pages ?? 1}
              >
                <span className={`template-card__thumb${(t.pages ?? 1) > 1 ? " template-card__thumb--stack" : ""}`}>
                  <span className="template-card__sheet">
                    {t.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={templateUrl(t.thumbnail)} alt="" loading="lazy" width={t.width} height={t.height} />
                    )}
                  </span>
                </span>
                <span className="template-card__meta">
                  <span className="template-card__name">{busyId === t.id ? "Mengunduh…" : t.name}</span>
                  <span className="template-card__badges">
                    {(t.pages ?? 1) > 1 && (
                      <span className="template-card__badge template-card__badge--pages" title="Jumlah halaman">
                        {t.pages} hal.
                      </span>
                    )}
                    <span className="template-card__badge" title="Format berkas di public/templates">
                      Polotno
                    </span>
                  </span>
                </span>
                {t.description && <span className="template-card__desc">{t.description}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

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
