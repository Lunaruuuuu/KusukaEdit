"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { selectElementById } from "@/store/selectors";
import type {
  CanvasElement,
  ImageElement,
  MaskShape,
  ShapeElement,
  TextAlign,
  TextElement,
  TextFontStyle,
} from "@/types/editor";
import { toInputColor } from "@/lib/color";
import { prepareImageFile } from "@/lib/imageUpload";
import { isWholePicture } from "@/lib/crop";
import {
  FILTER_LIMIT,
  FILTER_PRESETS,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_OFFSET,
  MAX_STROKE_WIDTH,
  resolveOpacity,
} from "@/lib/imageEffects";
import { clearPatch, FILTER_KEYS, SHADOW_KEYS, type ElementStylePatch } from "@/lib/imageStyle";
import { MAX_LETTER_SPACING, MIN_LETTER_SPACING, toggleTextDecoration } from "@/lib/textOptions";
import {
  DEFAULT_BACKGROUND_PADDING,
  DEFAULT_BACKGROUND_RADIUS,
  POLOTNO_BACKGROUND_COLOR,
} from "@/lib/textEffects";
import { FONT_CHOICES } from "@/lib/fontLoader";
import DashPicker from "@/components/DashPicker";
import { PRESET_LABEL } from "@/components/ImageStylePanel";
import type { FilterPreset } from "@/types/editor";

// Every family offered is a Google Font (loaded on first use, see
// lib/fontLoader.ts) or a font every system has.
const FONT_FAMILIES: readonly string[] = FONT_CHOICES;

const fontLabel = (stack: string): string => stack.split(",")[0].replace(/'/g, "").trim();

// ---------------------------------------------------------------------------
// The bar above the canvas, laid out like Polotno's: ONE row of compact
// controls for the selected element (text, picture or shape), then the
// stacking menu and delete on the far right. Options that need room (spacing,
// effects, flip, mask, stacking) open in a small popover under their button.
// With several elements selected the bar shows how many and offers delete.
// ---------------------------------------------------------------------------

interface Props {
  /** Whether the "Filter & Efek" panel under this bar is open (pictures). */
  stylePanelOpen: boolean;
  onToggleStylePanel: () => void;
}

// What switching a shadow on starts from (the same as for pictures).
const DEFAULT_SHADOW: ElementStylePatch = {
  shadowColor: "#000000",
  shadowBlur: 12,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
  shadowOpacity: 0.45,
};

// ------------------------------- building blocks ------------------------------

function Divider() {
  return <span className="toolbar__divider" aria-hidden="true" />;
}

function ToolButton({
  active,
  title,
  action,
  disabled,
  onClick,
  children,
  wide,
}: {
  active?: boolean;
  title: string;
  action: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tool-button${active ? " tool-button--on" : ""}${wide ? " tool-button--wide" : ""}`}
      aria-pressed={active === undefined ? undefined : active}
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      data-toolbar-action={action}
    >
      {children}
    </button>
  );
}

/** A button that opens a small panel under itself; closes on Escape or a click elsewhere. */
function Popover({
  label,
  title,
  action,
  active,
  compact,
  children,
}: {
  label: React.ReactNode;
  title: string;
  action: string;
  active?: boolean;
  /** An icon-only button (no frame), like the plain tool buttons. */
  compact?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // The toolbar scrolls sideways on a narrow window, and a scrolling box clips
  // whatever sticks out of it. So the panel is `position: fixed`, placed under
  // its button in window coordinates and kept inside the window.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (!button || !panel) return;
      const r = button.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - panel.offsetWidth - margin));
      panel.style.left = `${left}px`;
      panel.style.top = `${r.bottom + 6}px`;
    };
    place();
    // A scrolled toolbar moves the button: the panel follows it. Clicking a
    // button at the toolbar's edge scrolls it into view, so closing on every
    // scroll would close the panel the user just opened; it closes only when
    // the button has left the toolbar's visible part.
    const toolbar = rootRef.current?.closest(".toolbar");
    const onScroll = () => {
      const button = buttonRef.current?.getBoundingClientRect();
      const bar = toolbar?.getBoundingClientRect();
      if (button && bar && (button.right < bar.left || button.left > bar.right)) setOpen(false);
      else place();
    };
    window.addEventListener("resize", place);
    toolbar?.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("resize", place);
      toolbar?.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="popover" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`tool-button${compact ? "" : " tool-button--wide"}${open || active ? " tool-button--on" : ""}`}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={title}
        onClick={() => setOpen((v) => !v)}
        data-toolbar-action={action}
      >
        {label}
      </button>
      {open && (
        <div ref={panelRef} className="popover__panel" role="dialog" aria-label={title} data-popover={action}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A number box with up / down arrows (the font size, a border width ...). */
function Stepper({
  value,
  min,
  max,
  step = 1,
  label,
  action,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  action: string;
  onChange: (value: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="stepper" role="group" aria-label={label} title={label} data-toolbar-action={action}>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && e.target.value !== "") onChange(clamp(v));
        }}
      />
      <div className="stepper__arrows">
        <button type="button" aria-label={`${label}: naik`} tabIndex={-1} onClick={() => onChange(clamp(value + step))}>
          ▲
        </button>
        <button type="button" aria-label={`${label}: turun`} tabIndex={-1} onClick={() => onChange(clamp(value - step))}>
          ▼
        </button>
      </div>
    </div>
  );
}

function Slider({
  label,
  name,
  value,
  min,
  max,
  step = 1,
  unit = "",
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider">
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
      />
      <output className="slider__value">
        {value}
        {unit}
      </output>
    </label>
  );
}

// ---------------------------------- effects -----------------------------------

/**
 * The Effects popover of a text or a shape: opacity, drop shadow, the border
 * and its dash pattern, blur and colour filter, and for text the background
 * box and the curve; for a rectangle the corner radius. Style fields go
 * through setElementStyle() (validated, one undo step per slider drag), the
 * text-only fields through updateElement() (also one undo step per drag);
 * everything is saved in the element's JSON and written to Polotno files.
 */
function EffectsPopover({ el }: { el: TextElement | ShapeElement }) {
  const setElementStyle = useEditorStore((s) => s.setElementStyle);
  const updateElement = useEditorStore((s) => s.updateElement);
  const set = (patch: ElementStylePatch) => setElementStyle(el.id, patch);
  const update = (attrs: Partial<TextElement> | Partial<ShapeElement>) =>
    updateElement(el.id, attrs as Partial<CanvasElement>);
  const opacity = Math.round(resolveOpacity(el) * 100);
  const shadowOn = el.shadowColor !== undefined;
  const outlineOn = el.type === "text" && !!el.stroke && (el.strokeWidth ?? 0) > 0;
  const borderOn = el.type === "text" ? outlineOn : el.strokeWidth > 0;
  const filterOn = (el.blurRadius ?? 0) > 0 || FILTER_KEYS.some((k) => el[k as keyof typeof el] !== undefined);
  const backgroundOn = el.type === "text" && el.backgroundEnabled === true;
  const curveOn = el.type === "text" && el.curveEnabled === true;
  const anyOn = opacity < 100 || shadowOn || outlineOn || filterOn || backgroundOn || curveOn || !!el.dash;

  return (
    <Popover
      label="✦ Efek"
      title="Efek: transparansi, bayangan, garis tepi dan pola garis, blur dan filter warna, latar teks, teks lengkung"
      action="effects"
      active={anyOn}
    >
      <div className="popover__section">
        <Slider
          label="Transparansi"
          name="opacity"
          value={opacity}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => set({ opacity: v >= 100 ? undefined : v / 100 })}
        />
      </div>

      {el.type === "text" && (
        <div className="popover__section">
          <label className="check">
            <input
              type="checkbox"
              checked={outlineOn}
              data-style-control="outline-toggle"
              onChange={(e) =>
                set(e.target.checked ? { stroke: el.stroke ?? "#000000", strokeWidth: 2 } : clearPatch(["stroke", "strokeWidth"]))
              }
            />
            <span>Garis tepi huruf</span>
            <input
              type="color"
              aria-label="Warna garis tepi huruf"
              disabled={!outlineOn}
              value={toInputColor(el.stroke ?? "#000000")}
              onChange={(e) => set({ stroke: e.target.value })}
            />
          </label>
          <Slider
            label="Tebal"
            name="strokeWidth"
            value={outlineOn ? (el.strokeWidth ?? 0) : 0}
            min={1}
            max={MAX_STROKE_WIDTH / 5}
            unit=" px"
            disabled={!outlineOn}
            onChange={(v) => set({ strokeWidth: v })}
          />
          <DashPicker value={el.dash} disabled={!outlineOn} onChange={(dash) => set({ dash })} />
        </div>
      )}

      {el.type === "shape" && (
        <div className="popover__section">
          <span className="popover__heading">Garis tepi</span>
          <Slider
            label="Tebal"
            name="strokeWidth"
            value={el.strokeWidth}
            min={0}
            max={MAX_STROKE_WIDTH / 2}
            unit=" px"
            onChange={(v) => set({ strokeWidth: v })}
          />
          <DashPicker value={el.dash} disabled={!borderOn} onChange={(dash) => set({ dash })} />
          {el.shapeType === "rect" && (
            <Slider
              label="Sudut"
              name="cornerRadius"
              value={el.cornerRadius}
              min={0}
              max={Math.max(1, Math.floor(Math.min(el.width, el.height) / 2))}
              unit=" px"
              onChange={(v) => update({ cornerRadius: v })}
            />
          )}
        </div>
      )}

      {el.type === "text" && (
        <div className="popover__section" data-effects-section="background">
          <label className="check">
            <input
              type="checkbox"
              checked={backgroundOn}
              data-style-control="background-toggle"
              onChange={(e) =>
                update(
                  e.target.checked
                    ? { backgroundEnabled: true, backgroundColor: el.backgroundColor ?? POLOTNO_BACKGROUND_COLOR }
                    : { backgroundEnabled: undefined }
                )
              }
            />
            <span>Latar teks</span>
            <input
              type="color"
              aria-label="Warna latar teks"
              disabled={!backgroundOn}
              value={toInputColor(el.backgroundColor ?? POLOTNO_BACKGROUND_COLOR)}
              onChange={(e) => update({ backgroundColor: e.target.value })}
            />
          </label>
          <Slider
            label="Kepekatan"
            name="backgroundOpacity"
            value={Math.round((el.backgroundOpacity ?? 1) * 100)}
            min={0}
            max={100}
            unit="%"
            disabled={!backgroundOn}
            onChange={(v) => update({ backgroundOpacity: v >= 100 ? undefined : v / 100 })}
          />
          <Slider
            label="Sudut"
            name="backgroundCornerRadius"
            value={Math.round((el.backgroundCornerRadius ?? DEFAULT_BACKGROUND_RADIUS) * 100)}
            min={0}
            max={100}
            unit="%"
            disabled={!backgroundOn}
            onChange={(v) => update({ backgroundCornerRadius: v / 100 })}
          />
          <Slider
            label="Jarak (padding)"
            name="backgroundPadding"
            value={Math.round((el.backgroundPadding ?? DEFAULT_BACKGROUND_PADDING) * 100)}
            min={0}
            max={200}
            unit="%"
            disabled={!backgroundOn}
            onChange={(v) => update({ backgroundPadding: v / 100 })}
          />
        </div>
      )}

      {el.type === "text" && (
        <div className="popover__section" data-effects-section="curve">
          <label className="check">
            <input
              type="checkbox"
              checked={curveOn}
              data-style-control="curve-toggle"
              onChange={(e) =>
                update(e.target.checked ? { curveEnabled: true, curvePower: el.curvePower ?? 0.5 } : { curveEnabled: undefined })
              }
            />
            <span>Teks lengkung</span>
          </label>
          <Slider
            label="Lengkungan"
            name="curvePower"
            value={Math.round((el.curvePower ?? 0.5) * 100)}
            min={-100}
            max={100}
            unit="%"
            disabled={!curveOn}
            onChange={(v) => update({ curvePower: v / 100 })}
          />
        </div>
      )}

      <div className="popover__section">
        <label className="check">
          <input
            type="checkbox"
            checked={shadowOn}
            data-style-control="shadow-toggle"
            onChange={(e) => set(e.target.checked ? DEFAULT_SHADOW : clearPatch(SHADOW_KEYS))}
          />
          <span>Bayangan</span>
          <input
            type="color"
            aria-label="Warna bayangan"
            disabled={!shadowOn}
            value={toInputColor(el.shadowColor ?? "#000000")}
            onChange={(e) => set({ shadowColor: e.target.value })}
          />
        </label>
        <Slider
          label="Blur"
          name="shadowBlur"
          value={el.shadowBlur ?? 0}
          min={0}
          max={MAX_SHADOW_BLUR / 4}
          disabled={!shadowOn}
          onChange={(v) => set({ shadowBlur: v })}
        />
        <Slider
          label="Geser X"
          name="shadowOffsetX"
          value={el.shadowOffsetX ?? 0}
          min={-MAX_SHADOW_OFFSET / 10}
          max={MAX_SHADOW_OFFSET / 10}
          disabled={!shadowOn}
          onChange={(v) => set({ shadowOffsetX: v })}
        />
        <Slider
          label="Geser Y"
          name="shadowOffsetY"
          value={el.shadowOffsetY ?? 0}
          min={-MAX_SHADOW_OFFSET / 10}
          max={MAX_SHADOW_OFFSET / 10}
          disabled={!shadowOn}
          onChange={(v) => set({ shadowOffsetY: v })}
        />
        <Slider
          label="Kepekatan"
          name="shadowOpacity"
          value={Math.round((el.shadowOpacity ?? 1) * 100)}
          min={0}
          max={100}
          unit="%"
          disabled={!shadowOn}
          onChange={(v) => set({ shadowOpacity: v / 100 })}
        />
      </div>

      <div className="popover__section" data-effects-section="filter">
        <span className="popover__heading">Blur &amp; filter warna</span>
        <Slider
          label="Blur"
          name="blurRadius"
          value={el.blurRadius ?? 0}
          min={0}
          max={40}
          unit=" px"
          onChange={(v) => set({ blurRadius: v === 0 ? undefined : v })}
        />
        {(["brightness", "contrast", "saturation"] as const).map((key) => (
          <Slider
            key={key}
            label={key === "brightness" ? "Kecerahan" : key === "contrast" ? "Kontras" : "Saturasi"}
            name={key}
            value={el[key] ?? 0}
            min={-FILTER_LIMIT}
            max={FILTER_LIMIT}
            onChange={(v) => set({ [key]: v === 0 ? undefined : v })}
          />
        ))}
        <label className="dash-picker">
          <span className="slider__label">Preset</span>
          <select
            value={el.filterPreset ?? ""}
            data-style-control="filterPreset"
            onChange={(e) => set({ filterPreset: (e.target.value || undefined) as FilterPreset | undefined })}
          >
            <option value="">Tanpa preset</option>
            {FILTER_PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Popover>
  );
}

// ------------------------------------ text ------------------------------------

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Rata kiri" },
  { value: "center", label: "Rata tengah" },
  { value: "right", label: "Rata kanan" },
  { value: "justify", label: "Rata kiri-kanan (justify)" },
];

function withStyle(style: TextFontStyle, part: "bold" | "italic", on: boolean): TextFontStyle {
  const bold = part === "bold" ? on : style.includes("bold");
  const italic = part === "italic" ? on : style.includes("italic");
  return bold && italic ? "bold italic" : bold ? "bold" : italic ? "italic" : "normal";
}

function TextControls({ el }: { el: TextElement }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const update = (attrs: Partial<TextElement>) => updateElement(el.id, attrs as Partial<CanvasElement>);
  const bold = el.fontStyle.includes("bold");
  const italic = el.fontStyle.includes("italic");
  const decoration = el.textDecoration ?? "";
  const fonts = FONT_FAMILIES.includes(el.fontFamily) ? FONT_FAMILIES : [el.fontFamily, ...FONT_FAMILIES];
  const alignIndex = Math.max(0, ALIGN_OPTIONS.findIndex((a) => a.value === el.align));
  const alignOption = ALIGN_OPTIONS[alignIndex];
  const nextAlign = ALIGN_OPTIONS[(alignIndex + 1) % ALIGN_OPTIONS.length];

  return (
    <>
      <input
        type="color"
        className="toolbar__swatch"
        aria-label="Warna teks"
        title="Warna teks"
        value={toInputColor(el.fill)}
        onChange={(e) => update({ fill: e.target.value })}
        data-toolbar-action="text-color"
      />
      <select
        className="toolbar__font"
        aria-label="Font"
        title="Font"
        value={el.fontFamily}
        onChange={(e) => update({ fontFamily: e.target.value })}
        data-toolbar-action="font-family"
      >
        {fonts.map((f) => (
          <option key={f} value={f}>
            {fontLabel(f)}
          </option>
        ))}
      </select>
      <Stepper
        label="Ukuran font"
        action="font-size"
        value={el.fontSize}
        min={1}
        max={500}
        onChange={(v) => update({ fontSize: v })}
      />
      <ToolButton
        active={el.autoFit === true}
        title="Kecilkan otomatis: ukuran huruf mengecil sendiri bila teks tidak muat di kotaknya (tinggi kotak bisa diatur)"
        action="auto-fit"
        onClick={() => update({ autoFit: el.autoFit ? undefined : true })}
      >
        ⤡
      </ToolButton>
      <Divider />
      <ToolButton active={bold} title="Tebal (Bold)" action="bold" onClick={() => update({ fontStyle: withStyle(el.fontStyle, "bold", !bold) })}>
        <b>B</b>
      </ToolButton>
      <ToolButton active={italic} title="Miring (Italic)" action="italic" onClick={() => update({ fontStyle: withStyle(el.fontStyle, "italic", !italic) })}>
        <i>I</i>
      </ToolButton>
      <ToolButton
        active={decoration.includes("underline")}
        title="Garis bawah (Underline)"
        action="underline"
        onClick={() => update({ textDecoration: toggleTextDecoration(el.textDecoration, "underline") })}
      >
        <u>U</u>
      </ToolButton>
      <ToolButton
        active={decoration.includes("line-through")}
        title="Coret (Strikethrough)"
        action="strikethrough"
        onClick={() => update({ textDecoration: toggleTextDecoration(el.textDecoration, "line-through") })}
      >
        <s>S</s>
      </ToolButton>
      <Divider />
      {/* One button, like Polotno's: each click goes to the next alignment. */}
      <ToolButton
        title={`${alignOption.label} — klik untuk ${nextAlign.label.toLowerCase()}`}
        action="align"
        onClick={() => update({ align: nextAlign.value })}
      >
        <span className={`align-icon align-icon--${alignOption.value}`} data-align={alignOption.value} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </ToolButton>
      <Divider />
      <ToolButton
        active={el.listType === "bullet"}
        title="Daftar berpoin"
        action="list-bullet"
        onClick={() => update({ listType: el.listType === "bullet" ? undefined : "bullet" })}
      >
        •≡
      </ToolButton>
      <ToolButton
        active={el.listType === "number"}
        title="Daftar bernomor"
        action="list-number"
        onClick={() => update({ listType: el.listType === "number" ? undefined : "number" })}
      >
        1≡
      </ToolButton>
      <Popover
        label="↕"
        compact
        title="Spasi huruf dan spasi baris"
        action="spacing"
        active={(el.letterSpacing ?? 0) !== 0}
      >
        <div className="popover__section">
          <Slider
            label="Spasi huruf"
            name="letterSpacing"
            value={Math.round((el.letterSpacing ?? 0) * 100)}
            min={Math.round(MIN_LETTER_SPACING * 100)}
            max={Math.round(MAX_LETTER_SPACING * 100)}
            unit="%"
            onChange={(v) => update({ letterSpacing: v === 0 ? undefined : v / 100 })}
          />
          <Slider
            label="Spasi baris"
            name="lineHeight"
            value={el.lineHeight}
            min={0.5}
            max={3}
            step={0.05}
            unit="×"
            onChange={(v) => update({ lineHeight: v })}
          />
        </div>
      </Popover>
      <ToolButton
        active={el.textTransform === "uppercase"}
        title="Huruf kapital semua (Uppercase)"
        action="uppercase"
        onClick={() => update({ textTransform: el.textTransform === "uppercase" ? undefined : "uppercase" })}
      >
        AA
      </ToolButton>
      <ToolButton
        active={el.textTransform === "lowercase"}
        title="Huruf kecil semua (Lowercase)"
        action="lowercase"
        onClick={() => update({ textTransform: el.textTransform === "lowercase" ? undefined : "lowercase" })}
      >
        aa
      </ToolButton>
      <Divider />
      <EffectsPopover el={el} />
    </>
  );
}

// ----------------------------------- shapes -----------------------------------

function ShapeControls({ el }: { el: ShapeElement }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const setElementStyle = useEditorStore((s) => s.setElementStyle);
  return (
    <>
      <label className="toolbar__field" title="Warna isi">
        <span>Isi</span>
        <input
          type="color"
          className="toolbar__swatch"
          aria-label="Warna isi"
          value={toInputColor(el.fill)}
          onChange={(e) => updateElement(el.id, { fill: e.target.value })}
          data-toolbar-action="fill-color"
        />
      </label>
      <Divider />
      <label className="toolbar__field" title="Warna garis tepi">
        <span>Garis</span>
        <input
          type="color"
          className="toolbar__swatch"
          aria-label="Warna garis tepi"
          value={toInputColor(el.stroke)}
          onChange={(e) => setElementStyle(el.id, { stroke: e.target.value })}
          data-toolbar-action="stroke-color"
        />
      </label>
      <Stepper
        label="Tebal garis tepi"
        action="stroke-width"
        value={el.strokeWidth}
        min={0}
        max={MAX_STROKE_WIDTH}
        onChange={(v) => setElementStyle(el.id, { strokeWidth: v })}
      />
      {el.shapeType === "rect" && (
        <>
          <Divider />
          <label className="toolbar__field" title="Sudut membulat">
            <span>Sudut</span>
            <Stepper
              label="Sudut membulat"
              action="corner-radius"
              value={el.cornerRadius}
              min={0}
              max={Math.floor(Math.min(el.width, el.height) / 2)}
              onChange={(v) => updateElement(el.id, { cornerRadius: v })}
            />
          </label>
        </>
      )}
      <Divider />
      <EffectsPopover el={el} />
    </>
  );
}

// ---------------------------------- pictures ----------------------------------

const MASK_OPTIONS: { value: MaskShape | undefined; label: string }[] = [
  { value: undefined, label: "▭ Persegi" },
  { value: "circle", label: "◯ Lingkaran" },
  { value: "triangle", label: "△ Segitiga" },
];

function ImageControls({ el, stylePanelOpen, onToggleStylePanel }: { el: ImageElement } & Props) {
  const croppingId = useEditorStore((s) => s.croppingId);
  const setCroppingId = useEditorStore((s) => s.setCroppingId);
  const resetImageCrop = useEditorStore((s) => s.resetImageCrop);
  const replaceImageSource = useEditorStore((s) => s.replaceImageSource);
  const flipImage = useEditorStore((s) => s.flipImage);
  const fitToPage = useEditorStore((s) => s.fitToPage);
  const setImageStyle = useEditorStore((s) => s.setImageStyle);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  async function handleReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same file twice must still fire `change`
    const targetId = replaceTargetRef.current;
    if (!file || !targetId) return;

    setReplaceBusy(true);
    setReplaceError(null);
    try {
      // The target id is captured when the button was clicked: the user may
      // select another element while the picture is loading, and the new
      // picture must still land on the element they asked to replace.
      replaceImageSource(targetId, await prepareImageFile(file));
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : "Gambar gagal diganti.");
    } finally {
      setReplaceBusy(false);
    }
  }

  const cropping = croppingId === el.id;
  const mask = el.maskShape ?? null;
  return (
    <>
      <ToolButton
        active={cropping}
        title="Pangkas gambar: seret siku atau tepi bingkai (atau klik dua kali gambarnya)"
        action="crop"
        wide
        onClick={() => setCroppingId(cropping ? null : el.id)}
      >
        {cropping ? "✓ Selesai" : "⧉ Pangkas"}
      </ToolButton>
      <ToolButton
        title="Tampilkan lagi seluruh gambar"
        action="reset-crop"
        wide
        disabled={isWholePicture(el)}
        onClick={() => resetImageCrop(el.id)}
      >
        Reset
      </ToolButton>
      <Divider />
      <Popover label="⇋ Balik" title="Cerminkan gambar" action="flip" active={el.scaleX === -1 || el.scaleY === -1}>
        <div className="popover__list">
          <button type="button" className={el.scaleX === -1 ? "active" : ""} onClick={() => flipImage(el.id, "x")} data-toolbar-action="flip-x">
            ⇋ Balik horizontal
          </button>
          <button type="button" className={el.scaleY === -1 ? "active" : ""} onClick={() => flipImage(el.id, "y")} data-toolbar-action="flip-y">
            ⇵ Balik vertikal
          </button>
        </div>
      </Popover>
      <ToolButton
        active={stylePanelOpen}
        title="Buka panel filter (kecerahan, kontras, saturasi, preset) dan efek (blur, transparansi, sudut membulat, bayangan, garis tepi)"
        action="style-panel"
        wide
        onClick={onToggleStylePanel}
      >
        ✦ Efek
      </ToolButton>
      <ToolButton
        title="Sesuaikan ke halaman: perbesar/perkecil secara proporsional hingga pas di halaman, lalu ke tengah"
        action="fit-page"
        wide
        onClick={() => fitToPage(el.id)}
      >
        ⤢ Pas halaman
      </ToolButton>
      <Popover label="◐ Mask" title="Potong gambar menjadi bentuk" action="mask" active={mask !== null}>
        <div className="popover__list">
          {MASK_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={mask === (option.value ?? null) ? "active" : ""}
              aria-pressed={mask === (option.value ?? null)}
              onClick={() => setImageStyle(el.id, { maskShape: option.value })}
              data-mask={option.value ?? "none"}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Popover>
      <Divider />
      <ToolButton
        title="Ganti isi gambar; posisi dan lebar tetap, tinggi mengikuti rasio gambar baru"
        action="replace"
        wide
        disabled={replaceBusy}
        onClick={() => {
          setReplaceError(null);
          replaceTargetRef.current = el.id;
          replaceInputRef.current?.click();
        }}
      >
        {replaceBusy ? "Memuat…" : "Ganti"}
      </ToolButton>
      <input ref={replaceInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleReplaceFile} />
      {replaceError && <span className="error-note error-note--inline">{replaceError}</span>}
    </>
  );
}

// ----------------------------- stacking and delete ----------------------------

function LayerMenu({ el }: { el: CanvasElement }) {
  const reorderElement = useEditorStore((s) => s.reorderElement);
  return (
    <Popover label="☰" compact title={`Susunan lapisan (z ${el.zIndex})`} action="layer">
      <div className="popover__list">
        <button type="button" onClick={() => reorderElement(el.id, "front")}>
          ⇈ Bawa ke paling depan
        </button>
        <button type="button" onClick={() => reorderElement(el.id, "forward")}>
          ↑ Naikkan satu lapis
        </button>
        <button type="button" onClick={() => reorderElement(el.id, "backward")}>
          ↓ Turunkan satu lapis
        </button>
        <button type="button" onClick={() => reorderElement(el.id, "back")}>
          ⇊ Kirim ke paling belakang
        </button>
      </div>
    </Popover>
  );
}

export default function ContextualToolbar({ stylePanelOpen, onToggleStylePanel }: Props) {
  const selected = useEditorStore((s) => selectElementById(s, s.selectedId));
  const selectionCount = useEditorStore((s) => s.selectedIds.length);
  const removeElement = useEditorStore((s) => s.removeElement);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const setSelectedId = useEditorStore((s) => s.setSelectedId);

  if (selectionCount > 1) {
    return (
      <div className="panel toolbar" data-toolbar="multi">
        <span className="toolbar__count">{selectionCount} elemen dipilih</span>
        <span className="toolbar__hint">Seret untuk memindah bersama · Ctrl/Cmd+klik untuk menambah/mengurangi</span>
        <div className="toolbar__end">
          <button type="button" className="tool-button tool-button--wide" onClick={() => setSelectedId(null)}>
            Batal pilih
          </button>
          <button
            type="button"
            className="danger toolbar__delete"
            onClick={removeSelected}
            title="Hapus semua yang dipilih (atau tekan Delete/Backspace)"
            data-toolbar-action="delete"
          >
            Hapus {selectionCount}
          </button>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="panel toolbar toolbar--empty" data-toolbar="empty">
        Pilih sebuah elemen di kanvas (atau seret kotak di halaman untuk memilih beberapa).
      </div>
    );
  }

  return (
    <div className="panel toolbar" data-toolbar={selected.type}>
      <div className="toolbar__row">
        {selected.type === "text" && <TextControls el={selected} />}
        {selected.type === "shape" && <ShapeControls el={selected} />}
        {selected.type === "image" && (
          <ImageControls el={selected} stylePanelOpen={stylePanelOpen} onToggleStylePanel={onToggleStylePanel} />
        )}
      </div>
      <div className="toolbar__end">
        <LayerMenu el={selected} />
        <button
          type="button"
          className="danger toolbar__delete"
          onClick={() => removeElement(selected.id)}
          title="Hapus (atau tekan Delete/Backspace)"
          data-toolbar-action="delete"
        >
          Hapus
        </button>
      </div>
    </div>
  );
}
