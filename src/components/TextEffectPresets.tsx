"use client";

import React from "react";
import type { CanvasElement, TextElement } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";
import { TEXT_EFFECTS, detectTextEffect, textEffectPatch, type TextEffectId } from "@/lib/textEffectPresets";

// What each preset card shows: an "Ag" styled with CSS that resembles the
// effect (the canvas draws the real thing with Konva).
const SAMPLE_STYLE: Record<TextEffectId, React.CSSProperties> = {
  none: {},
  shadow: { textShadow: "2px 2px 3px rgba(0,0,0,0.55)" },
  lift: { textShadow: "0 5px 8px rgba(0,0,0,0.45)" },
  glow: { textShadow: "0 0 6px #7ab8ff, 0 0 10px #7ab8ff" },
  outline: { WebkitTextStroke: "1px #ffffff", color: "transparent" },
  sticker: { WebkitTextStroke: "3px #ffffff", paintOrder: "stroke fill", color: "#111827", textShadow: "0 2px 3px rgba(0,0,0,0.4)" },
  pop: { textShadow: "3px 3px 0 #ff3d7f" },
  background: { background: "#ffd166", color: "#111827", borderRadius: 4, padding: "0 4px" },
};

/**
 * The preset row at the top of a text's Effects popover. A click applies the
 * preset as ONE undo step (updateElement with the whole patch); the card of
 * the preset the text currently matches is marked.
 */
export default function TextEffectPresets({ el }: { el: TextElement }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const current = detectTextEffect(el);
  return (
    <div className="popover__section" data-effects-section="presets">
      <span className="popover__heading">Gaya teks{current === null ? " (disesuaikan)" : ""}</span>
      <div className="effect-presets" role="radiogroup" aria-label="Gaya efek teks">
        {TEXT_EFFECTS.map((effect) => (
          <button
            key={effect.id}
            type="button"
            role="radio"
            aria-checked={current === effect.id}
            className={`effect-preset${current === effect.id ? " effect-preset--on" : ""}`}
            title={effect.hint}
            data-text-effect={effect.id}
            onClick={() => updateElement(el.id, textEffectPatch(effect.id, el) as Partial<CanvasElement>)}
          >
            <span className="effect-preset__sample" style={SAMPLE_STYLE[effect.id]}>
              Ag
            </span>
            <span className="effect-preset__label">{effect.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
