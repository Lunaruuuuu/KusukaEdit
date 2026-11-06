"use client";

import React from "react";
import { useEditorStore } from "@/store/useEditorStore";

export default function HistoryControls() {
  const pastCount = useEditorStore((s) => s.past.length);
  const futureCount = useEditorStore((s) => s.future.length);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  return (
    <div className="history-controls">
      <button
        onClick={undo}
        disabled={pastCount === 0}
        title="Undo (Ctrl/Cmd+Z)"
        aria-label="Undo"
      >
        <span aria-hidden="true">↶</span>
        <span className="history-controls__label">Undo</span>
      </button>
      <button
        onClick={redo}
        disabled={futureCount === 0}
        title="Redo (Ctrl/Cmd+Shift+Z)"
        aria-label="Redo"
      >
        <span aria-hidden="true">↷</span>
        <span className="history-controls__label">Redo</span>
      </button>
    </div>
  );
}
