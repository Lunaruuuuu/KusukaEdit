// ---------------------------------------------------------------------------
// Dynamic Google Fonts loader.
//
// Konva measures text with the canvas' measureText, i.e. with whatever font the
// browser has RIGHT NOW. A family that is not loaded yet is measured (and
// wrapped) with the fallback font, and Konva does not measure again by itself
// when the real font arrives — so a short word like "SALE" can end up on two
// lines, or its box is the wrong width. ensureFontLoaded() therefore:
//
//   1. skips system / generic families (Arial, Georgia, serif ...);
//   2. adds ONE <link rel="stylesheet"> for the family to <head> (Google Fonts
//      css2 API, regular / bold / italic / bold italic; if Google refuses that
//      set because the family lacks a style, it retries with the family alone);
//   3. waits for document.fonts.load() of the weights the editor draws;
//   4. bumps a version number that text nodes subscribe to: they lay out
//      their text again with the real metrics and redraw (layer.batchDraw()).
//
// Every family is loaded at most once per page; concurrent calls share one
// promise. In Node (tests) and on the server nothing is loaded and the promise
// resolves to false. The pure helpers (family name, URL, is-system) are tested.
// ---------------------------------------------------------------------------

/** Families every browser has (or CSS generic names): never fetched. */
const SYSTEM_FAMILIES = new Set([
  "arial",
  "arial black",
  "helvetica",
  "helvetica neue",
  "georgia",
  "times",
  "times new roman",
  "courier",
  "courier new",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "impact",
  "comic sans ms",
  "segoe ui",
  "system-ui",
  "-apple-system",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
]);

/** The families offered by the toolbar's font menu (Google Fonts unless system). */
export const FONT_CHOICES: readonly string[] = [
  "Inter, sans-serif",
  "Roboto, sans-serif",
  "'Open Sans', sans-serif",
  "Montserrat, sans-serif",
  "Poppins, sans-serif",
  "Lato, sans-serif",
  "Oswald, sans-serif",
  "'Bebas Neue', sans-serif",
  "Anton, sans-serif",
  "'Playfair Display', serif",
  "Merriweather, serif",
  "Lora, serif",
  "Pacifico, cursive",
  "'Dancing Script', cursive",
  "Lobster, cursive",
  "'Roboto Mono', monospace",
  "Georgia, serif",
  "'Courier New', monospace",
  "'Times New Roman', serif",
  "Verdana, sans-serif",
];

/** The first family of a CSS font stack, without quotes: "'Open Sans', sans-serif" -> "Open Sans". */
export function primaryFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

/** True for a family the browser already has (nothing to download). */
export function isSystemFamily(family: string): boolean {
  return family === "" || SYSTEM_FAMILIES.has(family.toLowerCase());
}

/**
 * The Google Fonts css2 URL for a family. `withStyles` asks for regular, bold,
 * italic and bold italic; without it, just the family's default style.
 */
export function googleFontsUrl(family: string, withStyles = true): string {
  const name = encodeURIComponent(family).replace(/%20/g, "+");
  const axes = withStyles ? ":ital,wght@0,400;0,700;1,400;1,700" : "";
  return `https://fonts.googleapis.com/css2?family=${name}${axes}&display=swap`;
}

// ------------------------------ live state ----------------------------------

const loads = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();
let version = 0;

/** Increases every time a font finished loading (for useSyncExternalStore). */
export function getFontsVersion(): number {
  return version;
}

export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

const LINK_TIMEOUT_MS = 8000;

function addStylesheet(href: string): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLLinkElement>(`link[data-font-href="${CSS.escape(href)}"]`);
    if (existing) {
      resolve(true);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.fontHref = href;
    const timer = setTimeout(() => resolve(false), LINK_TIMEOUT_MS);
    link.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    link.onerror = () => {
      clearTimeout(timer);
      link.remove();
      resolve(false);
    };
    document.head.appendChild(link);
  });
}

async function load(family: string): Promise<boolean> {
  // Google answers 400 when a family lacks one of the asked styles (e.g. a
  // display font without italics): then the family alone is asked for.
  const ok = (await addStylesheet(googleFontsUrl(family, true))) || (await addStylesheet(googleFontsUrl(family, false)));
  if (!ok) return false;
  const quoted = `"${family.replace(/"/g, "")}"`;
  try {
    const faces = await Promise.all(
      ["400", "700", "italic 400", "italic 700"].map((style) => document.fonts.load(`${style} 16px ${quoted}`))
    );
    return faces.some((list) => list.length > 0);
  } catch {
    return false;
  }
}

/**
 * Makes sure the family of a font stack is loaded. Resolves to true when the
 * real font is available (then every text is laid out again), false when it is
 * a system font, nothing could be loaded (offline, unknown family), or there
 * is no browser.
 */
export function ensureFontLoaded(fontFamily: string): Promise<boolean> {
  const family = primaryFamily(fontFamily);
  if (typeof document === "undefined" || typeof window === "undefined" || !document.fonts) {
    return Promise.resolve(false);
  }
  if (isSystemFamily(family)) return Promise.resolve(false);
  const key = family.toLowerCase();
  let promise = loads.get(key);
  if (!promise) {
    promise = load(family).then((ok) => {
      if (ok) notify();
      return ok;
    });
    loads.set(key, promise);
  }
  return promise;
}

/** Loads every family used by a list of texts (e.g. right after a document is opened). */
export function ensureFontsLoaded(families: Iterable<string>): Promise<boolean[]> {
  return Promise.all(Array.from(new Set(families)).map(ensureFontLoaded));
}
