"use client";

import React from "react";
import dynamic from "next/dynamic";
import SidePanel from "./SidePanel";
import ContextualToolbar from "./ContextualToolbar";
import ActionPanel from "./ActionPanel";
import HistoryControls from "./HistoryControls";

// react-konva touches `document`/`window` and draws on an HTML <canvas>,
// none of which exist during Next.js's server render. Loading it with
// `ssr: false` is what keeps this from throwing a hydration error.
const CanvasWorkspace = dynamic(() => import("./CanvasWorkspace"), {
  ssr: false,
  loading: () => <div className="canvas-loading">Memuat kanvas…</div>,
});

export default function EditorRoot() {
  return (
    <div className="editor-shell">
      <header className="editor-header">
        <h1>Canvas Design Editor</h1>
        <span className="editor-header__subtitle">Polotno-style prototype</span>
        <div className="editor-header__spacer" />
        <HistoryControls />
      </header>

      <div className="editor-body">
        <SidePanel />

        <div className="editor-center">
          <ContextualToolbar />
          <CanvasWorkspace />
        </div>

        <ActionPanel />
      </div>
    </div>
  );
}
