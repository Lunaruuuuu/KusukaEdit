"use client";

import React from "react";
import type { FilterPreset, ImageElement, MaskShape } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";
import { selectElementById } from "@/store/selectors";
import { toInputColor } from "@/lib/color";
import { getCachedImage } from "@/lib/imageCache";
import {
  FILTER_LIMIT,
  FILTER_PRESETS,
  MAX_BLUR_RADIUS,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_OFFSET,
  MAX_STROKE_WIDTH,
  resolveImageEffects,
} from "@/lib/imageEffects";
import { EFFECT_KEYS, FILTER_KEYS, clearPatch, type ImageStylePatch } from "@/lib/imageStyle";

// ---------------------------------------------------------------------------
// "Filter & Efek": one place for how a picture looks. Three cards side by side:
//   Filter    — presets, brightness, contrast, saturation
//   Efek      — blur, rounded corners, shape (mask)
//   Bayangan  — drop shadow and border
// Every control writes through setImageStyle(), so a slider drag is one undo
// step and everything is saved in the JSON of the picture.
// ---------------------------------------------------------------------------

const PRESET_LABEL: Record<FilterPreset, string> = {
  grayscale: "Hitam-putih",
  sepia: "Sepia",
  vivid: "Cerah",
  fade: "Pudar",
  warm: "Hangat",
  cool: "Dingin",
  dramatic: "Dramatis",
};

const MASK_OPTIONS: { value: MaskShape | undefined; label: string }[] = [
  { value: undefined, label: "Persegi" },
  { value: "circle", label: "Lingkaran" },
  { value: "triangle", label: "Segitiga" },
];

// What switching the shadow on starts from.
const DEFAULT_SHADOW: ImageStylePatch = {
  shadowColor: "#000000",
  shadowBlur: 12,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
  shadowOpacity: 0.45,
};

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  disabled,
  title,
  name,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  title?: string;
  name: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider" title={title}>
      <span className="slider__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-style-control={name}
        onChange={(e) => onChange(Number(e.target.value))}
        // A double click puts the slider back to 0 (the neutral value of the filter sliders).
        onDoubleClick={() => (min < 0 ? onChange(0) : undefined)}
      />
      <output className="slider__value">
        {value}
        {unit}
      </output>
    </label>
  );
}

export default function ImageStylePanel({ open }: { open: boolean }) {
  const element = useEditorStore((s) => selectElementById(s, s.selectedId));
  const setImageStyle = useEditorStore((s) => s.setImageStyle);

  if (!open || !element || element.type !== "image") return null;
  return <Panel element={element} set={(patch) => setImageStyle(element.id, patch)} />;
}

function Panel({ element, set }: { element: ImageElement; set: (patch: ImageStylePatch) => void }) {
  const fx = resolveImageEffects(element);
  const filter = fx.filter;
  const hasMask = fx.mask !== null;
  const shadowOn = element.shadowColor !== undefined;
  const maxRadius = Math.max(1, Math.floor(Math.min(element.width, element.height) / 2));
  const tainted = filter !== null && getCachedImage(element.src)?.tainted === true;

  const anyFilter = filter !== null;
  const anyEffect = EFFECT_KEYS.some((key) => element[key] !== undefined);

  return (
    <section className="panel style-panel" aria-label="Filter dan efek gambar" data-style-panel="">
      {/* ------------------------------ Filter ------------------------------ */}
      <div className="style-card" data-style-card="filter">
        <header className="style-card__header">
          <h3>Filter</h3>
          <button
            className="toolbar-button"
            onClick={() => set(clearPatch(FILTER_KEYS))}
            disabled={!anyFilter}
            title="Kembalikan warna asli gambar"
            data-style-action="reset-filter"
          >
            Reset
          </button>
        </header>

        <div className="chip-grid chip-grid--tight" role="group" aria-label="Preset filter">
          <button
            className={`chip${element.filterPreset === undefined ? " active" : ""}`}
            aria-pressed={element.filterPreset === undefined}
            onClick={() => set({ filterPreset: undefined })}
            data-filter-preset="none"
          >
            Asli
          </button>
          {FILTER_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`chip${element.filterPreset === preset ? " active" : ""}`}
              aria-pressed={element.filterPreset === preset}
              onClick={() => set({ filterPreset: preset })}
              data-filter-preset={preset}
            >
              {PRESET_LABEL[preset]}
            </button>
          ))}
        </div>

        <Slider
          label="Kecerahan"
          name="brightness"
          value={filter?.brightness ?? 0}
          min={-FILTER_LIMIT}
          max={FILTER_LIMIT}
          title="Klik dua kali untuk mengembalikan ke 0"
          onChange={(v) => set({ brightness: v === 0 ? undefined : v })}
        />
        <Slider
          label="Kontras"
          name="contrast"
          value={filter?.contrast ?? 0}
          min={-FILTER_LIMIT}
          max={FILTER_LIMIT}
          title="Klik dua kali untuk mengembalikan ke 0"
          onChange={(v) => set({ contrast: v === 0 ? undefined : v })}
        />
        <Slider
          label="Saturasi"
          name="saturation"
          value={filter?.saturation ?? 0}
          min={-FILTER_LIMIT}
          max={FILTER_LIMIT}
          title="Klik dua kali untuk mengembalikan ke 0"
          onChange={(v) => set({ saturation: v === 0 ? undefined : v })}
        />
        {tainted && (
          <p className="warning-note">
            Filter tidak bisa diterapkan: gambar ini dari situs lain yang tidak mengizinkan pembacaan pikselnya (CORS).
            Unggah gambarnya dari komputer Anda.
          </p>
        )}
      </div>

      {/* ------------------------------- Efek ------------------------------- */}
      <div className="style-card" data-style-card="effects">
        <header className="style-card__header">
          <h3>Efek</h3>
          <button
            className="toolbar-button"
            onClick={() => set(clearPatch(EFFECT_KEYS))}
            disabled={!anyEffect}
            title="Hapus blur, sudut membulat, bentuk, bayangan, dan garis tepi"
            data-style-action="reset-effects"
          >
            Reset
          </button>
        </header>

        <Slider
          label="Blur"
          name="blur"
          value={fx.blur}
          min={0}
          max={MAX_BLUR_RADIUS}
          onChange={(v) => set({ blurRadius: v === 0 ? undefined : v })}
        />
        <Slider
          label="Sudut membulat"
          name="cornerRadius"
          value={Math.min(fx.cornerRadius, maxRadius)}
          min={0}
          max={maxRadius}
          unit=" px"
          disabled={hasMask}
          title={hasMask ? "Lingkaran dan segitiga tidak punya sudut untuk dibulatkan" : undefined}
          onChange={(v) => set({ cornerRadius: v === 0 ? undefined : v })}
        />
        <div className="field">
          <span>Bentuk</span>
          <div className="segmented segmented--stretch" role="group" aria-label="Bentuk gambar">
            {MASK_OPTIONS.map((option) => (
              <button
                key={option.label}
                className={fx.mask === (option.value ?? null) ? "active" : ""}
                aria-pressed={fx.mask === (option.value ?? null)}
                onClick={() => set({ maskShape: option.value })}
                data-mask={option.value ?? "none"}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --------------------------- Bayangan & garis ------------------------- */}
      <div className="style-card" data-style-card="shadow">
        <header className="style-card__header">
          <h3>Bayangan &amp; garis</h3>
        </header>

        <label className="check">
          <input
            type="checkbox"
            checked={shadowOn}
            data-style-control="shadow-toggle"
            onChange={(e) =>
              set(
                e.target.checked
                  ? DEFAULT_SHADOW
                  : clearPatch(["shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "shadowOpacity"])
              )
            }
          />
          <span>Bayangan</span>
          <input
            type="color"
            aria-label="Warna bayangan"
            disabled={!shadowOn}
            value={toInputColor(element.shadowColor ?? "#000000")}
            onChange={(e) => set({ shadowColor: e.target.value })}
          />
        </label>
        <Slider
          label="Blur bayangan"
          name="shadowBlur"
          value={element.shadowBlur ?? 0}
          min={0}
          max={MAX_SHADOW_BLUR / 4}
          disabled={!shadowOn}
          onChange={(v) => set({ shadowBlur: v })}
        />
        <div className="slider-pair">
          <Slider
            label="Geser X"
            name="shadowOffsetX"
            value={element.shadowOffsetX ?? 0}
            min={-MAX_SHADOW_OFFSET / 10}
            max={MAX_SHADOW_OFFSET / 10}
            disabled={!shadowOn}
            onChange={(v) => set({ shadowOffsetX: v })}
          />
          <Slider
            label="Geser Y"
            name="shadowOffsetY"
            value={element.shadowOffsetY ?? 0}
            min={-MAX_SHADOW_OFFSET / 10}
            max={MAX_SHADOW_OFFSET / 10}
            disabled={!shadowOn}
            onChange={(v) => set({ shadowOffsetY: v })}
          />
        </div>
        <Slider
          label="Kepekatan"
          name="shadowOpacity"
          value={Math.round((element.shadowOpacity ?? 1) * 100)}
          min={0}
          max={100}
          unit="%"
          disabled={!shadowOn}
          onChange={(v) => set({ shadowOpacity: v / 100 })}
        />

        <div className="check check--border">
          <span>Garis tepi</span>
          <input
            type="color"
            aria-label="Warna garis tepi"
            value={toInputColor(element.stroke ?? "#000000")}
            onChange={(e) => set({ stroke: e.target.value, strokeWidth: element.strokeWidth || 2 })}
          />
        </div>
        <Slider
          label="Tebal garis"
          name="strokeWidth"
          value={fx.stroke?.width ?? 0}
          min={0}
          max={MAX_STROKE_WIDTH / 4}
          unit=" px"
          onChange={(v) =>
            set(v === 0 ? clearPatch(["stroke", "strokeWidth"]) : { strokeWidth: v, stroke: element.stroke ?? "#000000" })
          }
        />
      </div>
    </section>
  );
}
