"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import SidePanel from "./SidePanel";
import ContextualToolbar from "./ContextualToolbar";
import ImageStylePanel from "./ImageStylePanel";
import PageStrip from "./PageStrip";
import HistoryControls from "./HistoryControls";
import ExportMenu from "./ExportMenu";
import { useEditorStore } from "@/store/useEditorStore";

// react-konva touches `document`/`window` and draws on an HTML <canvas>,
// none of which exist during Next.js's server render. Loading it with
// `ssr: false` is what keeps this from throwing a hydration error.
const CanvasWorkspace = dynamic(() => import("./CanvasWorkspace"), {
  ssr: false,
  loading: () => <div className="canvas-loading">Memuat kanvas…</div>,
});

// The layout, like Polotno's: a header with Undo / Redo and the Export menu on
// the right; a rail of tabs on the left (everything that comes IN: elements,
// imports, templates, canvas settings); the contextual bar above the canvas
// (with the "Filter & Efek" panel under it when a picture is selected and the
// panel is open), and the foldable page tray under the canvas. There is no
// right-hand column any more: the canvas takes all the remaining width.
export default function EditorRoot() {
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  // A multi-page image export walks through the pages: everything but the
  // canvas (which shows the progress) is locked until it is done.
  const exporting = useEditorStore((s) => s.exportProgress !== null);

  return (
    <div className={`editor-shell${exporting ? " is-exporting" : ""}`}>
      <header className="editor-header">
        <h1>Canvas Design Editor</h1>
        <span className="editor-header__subtitle">Polotno-style prototype</span>
        <div className="editor-header__spacer" />
        <HistoryControls />
        <ExportMenu />
      </header>

      <div className="editor-body">
        <SidePanel />

        <div className="editor-center">
          <ContextualToolbar
            stylePanelOpen={stylePanelOpen}
            onToggleStylePanel={() => setStylePanelOpen((open) => !open)}
          />
          <ImageStylePanel open={stylePanelOpen} />
          <CanvasWorkspace />
          <PageStrip />
        </div>
      </div>
    </div>
  );
}
