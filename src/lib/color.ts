// ---------------------------------------------------------------------------
// Color helpers. The editor's <input type="color"> only understands #rrggbb,
// while Polotno files commonly contain "white", "rgb(0, 161, 255)" or
// "rgba(98, 197, 255, 1)". Everything is normalized to #rrggbb on import so
// the toolbar always shows the real color.
// ---------------------------------------------------------------------------

// Not the full CSS list on purpose: Polotno's own defaults ("black", "white")
// and color pickers (hex / rgba) are what show up in practice.
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  navy: "#000080",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  lime: "#00ff00",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  olive: "#808000",
  brown: "#a52a2a",
  gold: "#ffd700",
  indigo: "#4b0082",
  violet: "#ee82ee",
  coral: "#ff7f50",
  tomato: "#ff6347",
  crimson: "#dc143c",
  salmon: "#fa8072",
  khaki: "#f0e68c",
};

function toHex2(n: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(n)));
  return clamped.toString(16).padStart(2, "0");
}

/**
 * Returns "#rrggbb" (or the literal "transparent"), or null when the value
 * is not a color this helper understands. Alpha is dropped, except a fully
 * transparent color which stays "transparent".
 */
export function parseColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "") return null;
  if (v === "transparent") return "transparent";

  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  }
  if (/^#[0-9a-f]{8}$/.test(v)) {
    return v.slice(7) === "00" ? "transparent" : v.slice(0, 7);
  }

  const rgb = v.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/
  );
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : parseFloat(rgb[4]);
    if (alpha === 0) return "transparent";
    return "#" + toHex2(parseFloat(rgb[1])) + toHex2(parseFloat(rgb[2])) + toHex2(parseFloat(rgb[3]));
  }

  return NAMED_COLORS[v] ?? null;
}

export function normalizeColor(value: unknown, fallback: string): string {
  return parseColor(value) ?? fallback;
}

/** <input type="color"> accepts only #rrggbb; anything else shows black. */
export function toInputColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}
