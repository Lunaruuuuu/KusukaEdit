"use client";

import React from "react";
import { DASH_PRESETS, sanitizeDash } from "@/lib/textEffects";

/**
 * Line style of a border: solid, dashed, long dashes or dotted. Writes the
 * dash in design px (or `undefined` for solid) through `onChange`, so the
 * caller's store action records it as one undo step.
 */
export default function DashPicker({
  value,
  disabled,
  onChange,
}: {
  value: number[] | undefined;
  disabled?: boolean;
  onChange: (dash: number[] | undefined) => void;
}) {
  const current = sanitizeDash(value);
  const key = current ? JSON.stringify(current) : null;
  const preset = DASH_PRESETS.find((p) => (p.pattern ? JSON.stringify(p.pattern) : null) === key);
  return (
    <label className="dash-picker" title="Pola garis tepi">
      <span className="slider__label">Pola garis</span>
      <select
        value={preset?.id ?? "custom"}
        disabled={disabled}
        data-style-control="dash"
        onChange={(e) => {
          const chosen = DASH_PRESETS.find((p) => p.id === e.target.value);
          if (chosen) onChange(chosen.pattern ?? undefined);
        }}
      >
        {DASH_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
            {p.pattern ? ` (${p.pattern.join(", ")})` : ""}
          </option>
        ))}
        {!preset && <option value="custom">Khusus ({current?.join(", ")})</option>}
      </select>
    </label>
  );
}
