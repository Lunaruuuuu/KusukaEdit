"use client";

import React, { useEffect, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import TemplatePanel from "./TemplatePanel";
import WorkspacePanel from "./WorkspacePanel";
import ImportPanel from "./ImportPanel";
import { useMediaQuery } from "@/lib/useMediaQuery";

type Tab = "elements" | "import" | "templates" | "canvas";

// The tabs run down a rail on the left edge (icon over label), like Polotno's
// side bar; the panel of the chosen tab fills the space next to it. The left
// side is where things come IN: new elements, imported files and pictures,
// templates. (Everything that goes OUT — export — is in the header.)
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "elements", label: "Elemen", icon: "＋" },
  { id: "import", label: "Impor", icon: "⇪" },
  { id: "templates", label: "Template", icon: "▦" },
  { id: "canvas", label: "Kanvas", icon: "⤢" },
];

/** Below this width the panel is a drawer over the canvas instead of a column beside it. */
export const DRAWER_QUERY = "(max-width: 1100px)";

export default function SidePanel() {
  const addTextElement = useEditorStore((s) => s.addTextElement);
  const addShapeElement = useEditorStore((s) => s.addShapeElement);
  const [tab, setTab] = useState<Tab>("elements");

  // Drawer mode: on a narrow window the panel content floats over the canvas
  // and starts closed, so the canvas gets the width. On a wide window it is a
  // column that is open unless the user folds it (click the active tab).
  const drawer = useMediaQuery(DRAWER_QUERY);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(!drawer);
  }, [drawer]);

  const chooseTab = (id: Tab) => {
    if (id === tab && open) {
      setOpen(false); // the active tab again: fold the panel away
      return;
    }
    setTab(id);
    setOpen(true);
  };

  // In drawer mode, Escape closes the drawer (unless a field has the focus).
  useEffect(() => {
    if (!drawer || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, open]);

  return (
    <aside
      className={`panel side-panel${open ? "" : " is-collapsed"}${drawer ? " is-drawer" : ""}`}
      data-side-panel=""
      data-side-mode={drawer ? "drawer" : "column"}
      data-side-open={open ? "true" : "false"}
    >
      <nav className="side-rail" role="tablist" aria-orientation="vertical" aria-label="Panel samping">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id && open}
            className={`side-rail__tab${tab === t.id && open ? " active" : ""}`}
            onClick={() => chooseTab(t.id)}
            title={tab === t.id && open ? `${t.label} (klik lagi untuk melipat panel)` : t.label}
            data-side-tab={t.id}
          >
            <span className="side-rail__icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="side-rail__label">{t.label}</span>
          </button>
        ))}
      </nav>

      {open && drawer && <div className="side-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

      {open && (
        <div className="side-content" role="tabpanel" data-side-content={tab}>
          <div className="side-content__head">
            <h2>{TABS.find((t) => t.id === tab)?.label}</h2>
            <button
              type="button"
              className="side-content__close"
              onClick={() => setOpen(false)}
              aria-label="Lipat panel"
              title="Lipat panel"
              data-action="collapse-side"
            >
              «
            </button>
          </div>

          {tab === "templates" && <TemplatePanel />}
          {tab === "canvas" && <WorkspacePanel />}
          {tab === "import" && <ImportPanel onOpenTemplates={() => setTab("templates")} />}

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
                <h3>Gambar & berkas</h3>
                <div className="panel-buttons">
                  <button onClick={() => setTab("import")} data-action="go-import">
                    ⇪ Impor gambar atau proyek…
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
        </div>
      )}
    </aside>
  );
}
