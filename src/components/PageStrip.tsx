"use client";

import React, { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import TemplateThumbnail from "./TemplateThumbnail";

// ---------------------------------------------------------------------------
// The page bar under the canvas: one thumbnail per page, the active one marked,
// and the three page actions — add a blank page, duplicate the active page
// (with all its elements), delete the active page. Clicking a thumbnail shows
// that page; the store resets the selection when it does.
// ---------------------------------------------------------------------------

const NOTICE_MS = 5000;

export default function PageStrip() {
  const pages = useEditorStore((s) => s.pages);
  const currentPageIndex = useEditorStore((s) => s.currentPageIndex);
  const goToPage = useEditorStore((s) => s.goToPage);
  const addPage = useEditorStore((s) => s.addPage);
  const duplicatePage = useEditorStore((s) => s.duplicatePage);
  const deletePage = useEditorStore((s) => s.deletePage);
  const busy = useEditorStore((s) => s.exportProgress !== null);

  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const say = (message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotice(message);
    timerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  // Keep the active thumbnail in view when pages are added or the strip is long.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [currentPageIndex, pages.length]);

  const count = pages.length;
  const isLast = count <= 1;

  return (
    <section className="panel page-strip" aria-label="Halaman" data-page-strip="">
      <div className="page-strip__bar">
        <strong className="page-strip__title" data-page-label="">
          Halaman {currentPageIndex + 1} / {count}
        </strong>
        {notice && (
          <span className="page-strip__notice" role="status">
            {notice}
          </span>
        )}
        <div className="page-strip__actions">
          <button
            className="toolbar-button"
            onClick={() => {
              addPage();
              say("Halaman kosong ditambahkan setelah halaman aktif.");
            }}
            disabled={busy}
            title="Tambah halaman kosong setelah halaman aktif"
            data-page-action="add"
          >
            ＋ Tambah
          </button>
          <button
            className="toolbar-button"
            onClick={() => {
              duplicatePage();
              say("Halaman digandakan beserta seluruh elemennya.");
            }}
            disabled={busy}
            title="Gandakan halaman aktif beserta semua elemennya"
            data-page-action="duplicate"
          >
            ⧉ Duplikat
          </button>
          <button
            className="toolbar-button toolbar-button--danger"
            onClick={() => {
              if (deletePage()) say("Halaman dihapus. Tekan Ctrl+Z untuk membatalkan.");
            }}
            disabled={busy || isLast}
            title={isLast ? "Dokumen harus punya minimal satu halaman" : "Hapus halaman aktif"}
            data-page-action="delete"
          >
            🗑 Hapus
          </button>
        </div>
      </div>

      <div className="page-strip__list" role="tablist" aria-label="Daftar halaman">
        {pages.map((page, i) => {
          const active = i === currentPageIndex;
          return (
            <button
              key={page.id}
              ref={active ? activeRef : undefined}
              role="tab"
              aria-selected={active}
              className={`page-thumb${active ? " active" : ""}`}
              onClick={() => goToPage(i)}
              disabled={busy}
              title={`Halaman ${i + 1} (${page.canvas.width} × ${page.canvas.height})`}
              data-page-index={i}
            >
              <span
                className="page-thumb__image"
                style={{ aspectRatio: `${page.canvas.width} / ${page.canvas.height}` }}
              >
                <TemplateThumbnail page={page} />
              </span>
              <span className="page-thumb__number">{i + 1}</span>
            </button>
          );
        })}
        <button
          className="page-thumb page-thumb--add"
          onClick={() => {
            addPage();
            say("Halaman kosong ditambahkan setelah halaman aktif.");
          }}
          disabled={busy}
          title="Tambah halaman kosong"
          aria-label="Tambah halaman"
        >
          ＋
        </button>
      </div>
    </section>
  );
}
