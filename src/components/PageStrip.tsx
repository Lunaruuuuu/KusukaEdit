"use client";

import React, { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import TemplateThumbnail from "./TemplateThumbnail";

// ---------------------------------------------------------------------------
// The page bar under the canvas: one thumbnail per page, the active one marked,
// and the three page actions — add a blank page, duplicate the active page
// (with all its elements), delete the active page. Clicking a thumbnail shows
// that page; the store resets the selection when it does.
//
// The tray folds away (the chevron on its bar): folded, only the bar stays —
// the page number and previous / next — and the canvas gets the height (it
// re-fits itself: the zoom hook watches the size of its area). The choice is
// remembered in this browser.
// ---------------------------------------------------------------------------

const NOTICE_MS = 5000;
const STORAGE_KEY = "kusukaedit.pageTrayCollapsed";

export default function PageStrip() {
  const pages = useEditorStore((s) => s.pages);
  const currentPageIndex = useEditorStore((s) => s.currentPageIndex);
  const goToPage = useEditorStore((s) => s.goToPage);
  const addPage = useEditorStore((s) => s.addPage);
  const duplicatePage = useEditorStore((s) => s.duplicatePage);
  const deletePage = useEditorStore((s) => s.deletePage);
  const busy = useEditorStore((s) => s.exportProgress !== null);

  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Restored after mounting (localStorage does not exist on the server).
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* private mode: always starts open */
    }
  }, []);
  const toggle = () =>
    setCollapsed((was) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, was ? "0" : "1");
      } catch {
        /* not remembered */
      }
      return !was;
    });
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
  }, [currentPageIndex, pages.length, collapsed]);

  const count = pages.length;
  const isLast = count <= 1;

  return (
    <section
      className={`panel page-strip${collapsed ? " is-collapsed" : ""}`}
      aria-label="Halaman"
      data-page-strip=""
      data-page-tray={collapsed ? "collapsed" : "open"}
    >
      <div className="page-strip__bar">
        <button
          type="button"
          className="page-strip__toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="page-strip-list"
          title={collapsed ? "Buka panel halaman" : "Lipat panel halaman (kanvas mendapat ruang lebih)"}
          data-page-action="toggle-tray"
        >
          <span aria-hidden="true">{collapsed ? "▴" : "▾"}</span>
        </button>
        <strong className="page-strip__title" data-page-label="">
          Halaman {currentPageIndex + 1} / {count}
        </strong>
        {collapsed && count > 1 && (
          <span className="page-strip__nav">
            <button
              type="button"
              className="toolbar-button"
              onClick={() => goToPage(currentPageIndex - 1)}
              disabled={busy || currentPageIndex === 0}
              aria-label="Halaman sebelumnya"
              data-page-action="prev"
            >
              ‹
            </button>
            <button
              type="button"
              className="toolbar-button"
              onClick={() => goToPage(currentPageIndex + 1)}
              disabled={busy || currentPageIndex === count - 1}
              aria-label="Halaman berikutnya"
              data-page-action="next"
            >
              ›
            </button>
          </span>
        )}
        {notice && (
          <span className="page-strip__notice" role="status">
            {notice}
          </span>
        )}
        <div className="page-strip__actions" hidden={collapsed}>
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

      <div className="page-strip__list" id="page-strip-list" role="tablist" aria-label="Daftar halaman" hidden={collapsed}>
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
