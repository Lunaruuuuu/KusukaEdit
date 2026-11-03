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

  // hsl(210, 50%, 40%) / hsla(210, 50%, 40%, 0.8)
  const hsl = v.match(
    /^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/
  );
  if (hsl) {
    const alpha = hsl[4] === undefined ? 1 : parseFloat(hsl[4]);
    if (alpha === 0) return "transparent";
    const h = (((parseFloat(hsl[1]) % 360) + 360) % 360) / 360;
    const s = Math.min(100, parseFloat(hsl[2])) / 100;
    const l = Math.min(100, parseFloat(hsl[3])) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t: number) => {
      const x = (t + 1) % 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return (
      "#" +
      toHex2(channel(h + 1 / 3) * 255) +
      toHex2(channel(h) * 255) +
      toHex2(channel(h - 1 / 3) * 255)
    );
  }

  return NAMED_COLORS[v] ?? null;
}

/**
 * The alpha (0..1) of a color: rgba()/hsla() and #rrggbbaa carry one, anything
 * else is opaque (1), and "transparent" is 0. parseColor() drops alpha on
 * purpose (the color inputs only know #rrggbb); this is for the places that
 * keep it separately, such as a shadow's opacity.
 */
export function colorAlpha(value: unknown): number {
  if (typeof value !== "string") return 1;
  const v = value.trim().toLowerCase();
  if (v === "transparent") return 0;
  if (/^#[0-9a-f]{8}$/.test(v)) return parseInt(v.slice(7), 16) / 255;
  const m = v.match(/^(?:rgba|hsla)\(.*,\s*(\d*\.?\d+)\s*\)$/);
  if (m) return Math.min(1, Math.max(0, parseFloat(m[1])));
  return 1;
}

/** True when a file actually specified a color (so an unparsable one is worth a warning). */
export function isColorSpecified(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function normalizeColor(value: unknown, fallback: string): string {
  return parseColor(value) ?? fallback;
}

/** <input type="color"> accepts only #rrggbb; anything else shows black. */
export function toInputColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}
