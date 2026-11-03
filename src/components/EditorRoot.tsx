"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import SidePanel from "./SidePanel";
import ContextualToolbar from "./ContextualToolbar";
import ImageStylePanel from "./ImageStylePanel";
import PageStrip from "./PageStrip";
import ActionPanel from "./ActionPanel";
import HistoryControls from "./HistoryControls";
import { useEditorStore } from "@/store/useEditorStore";

// react-konva touches `document`/`window` and draws on an HTML <canvas>,
// none of which exist during Next.js's server render. Loading it with
// `ssr: false` is what keeps this from throwing a hydration error.
const CanvasWorkspace = dynamic(() => import("./CanvasWorkspace"), {
  ssr: false,
  loading: () => <div className="canvas-loading">Memuat kanvas…</div>,
});

// The layout, like Polotno's: a rail of tabs on the left, the contextual bar
// above the canvas (with the "Filter & Efek" panel under it when a picture is
// selected and the panel is open), the page strip under the canvas, and the
// document actions (JSON / image export) on the right.
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

        <ActionPanel />
      </div>
    </div>
  );
}
