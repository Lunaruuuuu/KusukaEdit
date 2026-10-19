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
        ↶ Undo
      </button>
      <button
        onClick={redo}
        disabled={futureCount === 0}
        title="Redo (Ctrl/Cmd+Shift+Z)"
        aria-label="Redo"
      >
        ↷ Redo
      </button>
    </div>
  );
}
