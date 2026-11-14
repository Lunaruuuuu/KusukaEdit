// ---------------------------------------------------------------------------
// Text effect presets of the Effects popover (v11): None, Shadow, Lift, Glow,
// Outline, Sticker, Pop and Background.
//
// A preset is NOT a new field: it is a patch of fields every text already has
// (shadow*, stroke / strokeWidth, background*, borderColor / borderSize), so a
// styled text is written to Polotno with Polotno's own properties and opens
// there the same way. Sizes follow the font size, so a preset looks alike on a
// heading and on a caption. Which preset a text "has" is worked out from its
// fields (detectTextEffect), never stored. Pure: no React, no store.
// ---------------------------------------------------------------------------

import type { TextElement } from "@/types/editor";

export type TextEffectId = "none" | "shadow" | "lift" | "glow" | "outline" | "sticker" | "pop" | "background";

export const TEXT_EFFECTS: ReadonlyArray<{ id: TextEffectId; label: string; hint: string }> = [
  { id: "none", label: "Tanpa", hint: "Hapus bayangan, garis tepi, dan latar" },
  { id: "shadow", label: "Bayangan", hint: "Bayangan lembut ke kanan bawah" },
  { id: "lift", label: "Angkat", hint: "Bayangan lebar di bawah, teks seperti terangkat" },
  { id: "glow", label: "Pendar", hint: "Cahaya berwarna teks di sekelilingnya" },
  { id: "outline", label: "Garis tepi", hint: "Garis kontras di sekeliling huruf" },
  { id: "sticker", label: "Stiker", hint: "Garis putih tebal dan bayangan tipis" },
  { id: "pop", label: "Pop", hint: "Bayangan tegas tanpa blur, bergeser" },
  { id: "background", label: "Latar", hint: "Kotak warna di belakang tiap baris" },
];

/** Every field a preset may set; the others are left alone (curve, dash, opacity, filters ...). */
export const TEXT_EFFECT_KEYS = [
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "shadowOpacity",
  "stroke",
  "strokeWidth",
  "backgroundEnabled",
  "backgroundColor",
  "backgroundOpacity",
  "backgroundCornerRadius",
  "backgroundPadding",
  "borderColor",
  "borderSize",
] as const satisfies ReadonlyArray<keyof TextElement>;

export type TextEffectKey = (typeof TEXT_EFFECT_KEYS)[number];
export type TextEffectPatch = { [K in TextEffectKey]?: TextElement[K] };

const POP_COLOR = "#ff3d7f";

/** Relative luminance (0 dark .. 1 light) of a #rrggbb colour; 0.5 for anything else. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const lin = (c: string) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
}

/** Black for light text, white for dark text. */
const contrastTo = (fill: string): string => (luminance(fill) > 0.4 ? "#000000" : "#ffffff");

const px = (fontSize: number, factor: number, min = 0): number =>
  Math.max(min, Math.round(Math.max(1, fontSize) * factor * 10) / 10);

/**
 * The patch that applies preset `id` to `el`: every effect key is in it,
 * `undefined` for the ones the preset does not use (updateElement removes a
 * field set to undefined), so switching presets never leaves a mix behind.
 */
export function textEffectPatch(id: TextEffectId, el: Pick<TextElement, "fontSize" | "fill">): TextEffectPatch {
  const fs = el.fontSize;
  const cleared = Object.fromEntries(TEXT_EFFECT_KEYS.map((k) => [k, undefined])) as TextEffectPatch;
  switch (id) {
    case "none":
      return cleared;
    case "shadow":
      return { ...cleared, shadowColor: "#000000", shadowBlur: px(fs, 0.12, 1), shadowOffsetX: px(fs, 0.06, 1), shadowOffsetY: px(fs, 0.06, 1), shadowOpacity: 0.5 };
    case "lift":
      return { ...cleared, shadowColor: "#000000", shadowBlur: px(fs, 0.45, 2), shadowOffsetX: 0, shadowOffsetY: px(fs, 0.12, 1), shadowOpacity: 0.35 };
    case "glow":
      return { ...cleared, shadowColor: el.fill, shadowBlur: px(fs, 0.5, 4), shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0.9 };
    case "outline":
      return { ...cleared, stroke: contrastTo(el.fill), strokeWidth: px(fs, 0.05, 1) };
    case "sticker":
      return {
        ...cleared,
        stroke: "#ffffff",
        strokeWidth: px(fs, 0.14, 2),
        shadowColor: "#000000",
        shadowBlur: px(fs, 0.1, 1),
        shadowOffsetX: 0,
        shadowOffsetY: px(fs, 0.04, 1),
        shadowOpacity: 0.35,
      };
    case "pop":
      return { ...cleared, shadowColor: POP_COLOR, shadowBlur: 0, shadowOffsetX: px(fs, 0.07, 1), shadowOffsetY: px(fs, 0.07, 1), shadowOpacity: 1 };
    case "background":
      return {
        ...cleared,
        backgroundEnabled: true,
        backgroundColor: luminance(el.fill) > 0.4 ? "#1f2937" : "#ffd166",
        backgroundCornerRadius: 0.5,
        backgroundPadding: 0.5,
      };
  }
}

/**
 * The preset a text looks like now, or null when its effects were changed by
 * hand (a custom look). Compares every effect key with what the preset sets.
 */
export function detectTextEffect(el: TextElement): TextEffectId | null {
  // A background box stays "Latar" while its colour, opacity, padding, corners
  // or border are tuned, as long as nothing else (shadow, outline) was added.
  if (el.backgroundEnabled === true && el.shadowColor === undefined && el.stroke === undefined) return "background";
  for (const { id } of TEXT_EFFECTS) {
    const patch = textEffectPatch(id, el);
    if (TEXT_EFFECT_KEYS.every((k) => (el[k] ?? undefined) === (patch[k] ?? undefined))) return id;
  }
  return null;
}
