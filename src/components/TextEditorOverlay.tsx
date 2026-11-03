"use client";

import React, { useLayoutEffect, useRef } from "react";
import type { TextElement } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";
import { selectElementById } from "@/store/selectors";

// ---------------------------------------------------------------------------
// In-place text editing.
//
// Konva draws text on a <canvas>, which cannot take keyboard input. So on
// double-click we place a real HTML <textarea> exactly over the text node and
// copy its typography into CSS. Meanwhile ElementRenderer hides the Konva
// node (it reads `editingId`) and CanvasWorkspace suspends its global
// shortcuts, so typing Backspace edits characters instead of deleting the
// element. When editing ends the text is written to the store and the Konva
// node becomes visible again.
//
// Mounted inside a layer (CanvasWorkspace's `.overlay-layer`) that is as large
// as the DESIGN and scaled by the same factor as the Stage, so everything here
// is written in design pixels and stays on top of the Konva text at any zoom.
// ---------------------------------------------------------------------------

export default function TextEditorOverlay() {
  const editingId = useEditorStore((s) => s.editingId);
  const element = useEditorStore((s) => selectElementById(s, s.editingId));

  if (!editingId || !element || element.type !== "text") return null;
  // `key` remounts the editor (fresh focus + select-all) for every edit session.
  return <TextEditor key={element.id} element={element} />;
}

function TextEditor({ element }: { element: TextElement }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const stageNode = useEditorStore((s) => s.stageNode);
  // An auto-fit text is drawn smaller than its stored fontSize. The textarea
  // uses the size the Konva node really has, read once when editing starts,
  // so the text does not jump while it is edited. (Bullets / numbers of a
  // list are not shown here: the textarea holds the text as typed.)
  const [shownSize] = React.useState(() => {
    const node = stageNode?.findOne(`#${element.id}`) as { fontSize?: () => number } | undefined;
    const size = typeof node?.fontSize === "function" ? node.fontSize() : NaN;
    return Number.isFinite(size) && size > 0 ? size : element.fontSize;
  });
  const removeElement = useEditorStore((s) => s.removeElement);
  const setEditingId = useEditorStore((s) => s.setEditingId);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Enter/Esc and the blur that follows unmounting would otherwise commit twice.
  const finishedRef = useRef(false);

  const autosize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.select(); // typing replaces the placeholder text straight away
    autosize();
  }, []);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const value = textareaRef.current?.value ?? element.text;
    // Leaving editing mode re-enables the global shortcuts and un-hides the Konva node.
    setEditingId(null);

    if (value.trim() === "") {
      // An empty text box would be invisible and impossible to click again.
      removeElement(element.id);
    } else if (value !== element.text) {
      updateElement(element.id, { text: value });
    }
  };

  const bold = element.fontStyle.includes("bold");
  const italic = element.fontStyle.includes("italic");

  return (
    <div
      className="text-editor"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        // Konva rotates around the node's top-left corner; so does this.
        transform: `rotate(${element.rotation}deg)`,
      }}
    >
      <textarea
        ref={textareaRef}
        className="text-editor__input"
        defaultValue={element.text}
        spellCheck={false}
        onInput={autosize}
        onBlur={finish}
        onKeyDown={(e) => {
          // Keep every keystroke away from the canvas shortcuts (Delete,
          // Backspace, arrows, Ctrl+Z ...); the textarea handles them natively.
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return; // IME candidate selection
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish();
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish();
          }
        }}
        style={{
          fontSize: shownSize,
          fontFamily: element.fontFamily,
          fontWeight: bold ? "bold" : "normal",
          fontStyle: italic ? "italic" : "normal",
          lineHeight: element.lineHeight,
          letterSpacing: (element.letterSpacing ?? 0) * shownSize,
          textDecoration: element.textDecoration ?? "none",
          textTransform: element.textTransform ?? "none",
          textAlign: element.align,
          color: element.fill,
        }}
      />
      <div className="text-editor__hint">Enter: selesai, Shift+Enter: baris baru</div>
    </div>
  );
}
