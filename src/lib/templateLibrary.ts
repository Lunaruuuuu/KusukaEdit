// ---------------------------------------------------------------------------
// Template library (v11).
//
//   public/templates/index.json        the catalogue: id, name, description,
//                                      file, thumbnail, pages, width, height
//   public/templates/<id>.polotno.json  one Polotno document per template
//   public/templates/thumbs/<id>.svg    a preview of its first page
//
// The Template tab fetches the catalogue, shows the thumbnails, and fetches a
// template's JSON only when its card is chosen. That JSON goes through the
// same entry point as an imported file (loadFromJSON -> parseDocument ->
// convertPolotnoToKusuka), so a template is rebuilt in the store exactly like
// a Polotno file the user opens.
//
// "My templates" (the user's own) live in localStorage — see the second half
// of this file. Every function takes its fetch / storage as a parameter, so
// all of it runs in plain Node tests.
// ---------------------------------------------------------------------------

export const TEMPLATE_BASE_URL = "/templates";
export const TEMPLATE_INDEX_FILE = "index.json";

export interface TemplateIndexEntry {
  id: string;
  name: string;
  description?: string;
  /** JSON file, relative to the templates folder. */
  file: string;
  /** Preview picture, relative to the templates folder. */
  thumbnail?: string;
  pages?: number;
  width?: number;
  height?: number;
}

export interface TemplateIndex {
  version: number;
  templates: TemplateIndexEntry[];
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const posInt = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
/** A path inside the templates folder: no scheme, no "..", no leading slash. */
const safePath = (v: unknown): string | undefined =>
  typeof v === "string" && /^[a-z0-9][a-z0-9._/-]*$/i.test(v) && !v.includes("..") ? v : undefined;

/**
 * Validates a catalogue. Entries without an id, a name or a safe file path are
 * left out (and counted), duplicate ids keep the first one.
 */
export function parseTemplateIndex(data: unknown): { index: TemplateIndex; skipped: number } | { error: string } {
  if (!isRecord(data) || !Array.isArray(data.templates)) {
    return { error: "Katalog template tidak valid (index.json harus berisi daftar `templates`)." };
  }
  const seen = new Set<string>();
  const templates: TemplateIndexEntry[] = [];
  let skipped = 0;
  for (const item of data.templates) {
    const file = isRecord(item) ? safePath(item.file) : undefined;
    if (!isRecord(item) || typeof item.id !== "string" || item.id === "" || typeof item.name !== "string" || !file || seen.has(item.id)) {
      skipped++;
      continue;
    }
    seen.add(item.id);
    templates.push({
      id: item.id,
      name: item.name,
      ...(typeof item.description === "string" && item.description !== "" ? { description: item.description } : {}),
      file,
      ...(safePath(item.thumbnail) ? { thumbnail: safePath(item.thumbnail) } : {}),
      ...(posInt(item.pages) ? { pages: posInt(item.pages) } : {}),
      ...(posInt(item.width) ? { width: posInt(item.width) } : {}),
      ...(posInt(item.height) ? { height: posInt(item.height) } : {}),
    });
  }
  return { index: { version: typeof data.version === "number" ? data.version : 1, templates }, skipped };
}

export const templateUrl = (path: string, base = TEMPLATE_BASE_URL): string => `${base}/${path}`;

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetches and validates the catalogue. */
export async function fetchTemplateIndex(fetchImpl: FetchLike, base = TEMPLATE_BASE_URL) {
  try {
    const res = await fetchImpl(templateUrl(TEMPLATE_INDEX_FILE, base));
    if (!res.ok) return { error: `Katalog template tidak bisa dimuat (HTTP ${res.status}).` };
    return parseTemplateIndex(await res.json());
  } catch (err) {
    return { error: `Katalog template tidak bisa dimuat (${err instanceof Error ? err.message : "jaringan"}).` };
  }
}

/** Fetches one template's JSON (the raw document, for loadFromJSON). */
export async function fetchTemplateDocument(
  entry: Pick<TemplateIndexEntry, "file" | "name">,
  fetchImpl: FetchLike,
  base = TEMPLATE_BASE_URL
): Promise<{ data: unknown } | { error: string }> {
  try {
    const res = await fetchImpl(templateUrl(entry.file, base));
    if (!res.ok) return { error: `Template "${entry.name}" tidak bisa diunduh (HTTP ${res.status}).` };
    return { data: await res.json() };
  } catch (err) {
    return { error: `Template "${entry.name}" tidak bisa diunduh (${err instanceof Error ? err.message : "jaringan"}).` };
  }
}

// ------------------------------ my templates ---------------------------------
// Saved in the browser (localStorage), as Polotno documents with a small PNG
// preview. Nothing is sent to a server: on Railway / Render the server's disk
// is not kept between deploys, so a server-side store would lose them.

export const USER_TEMPLATES_KEY = "kusukaedit.userTemplates";

export interface UserTemplate {
  id: string;
  name: string;
  /** ms since 1970. */
  savedAt: number;
  /** A Polotno document (what "Ekspor > JSON Polotno" writes). */
  data: unknown;
  /** data:image/png;base64,... preview of the first page, or absent. */
  thumbnail?: string;
  pages?: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** The saved templates, newest first. A damaged entry is left out, never thrown. */
export function listUserTemplates(storage: StorageLike | null): UserTemplate[] {
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(USER_TEMPLATES_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is UserTemplate =>
          isRecord(t) && typeof t.id === "string" && typeof t.name === "string" && typeof t.savedAt === "number" && isRecord(t.data)
      )
      .map((t) => ({
        ...t,
        thumbnail: typeof t.thumbnail === "string" && t.thumbnail.startsWith("data:image/") ? t.thumbnail : undefined,
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function write(storage: StorageLike, list: UserTemplate[]): { ok: true } | { ok: false; error: string } {
  try {
    storage.setItem(USER_TEMPLATES_KEY, JSON.stringify(list));
    return { ok: true };
  } catch (err) {
    const quota = err instanceof Error && /quota/i.test(`${err.name} ${err.message}`);
    return {
      ok: false,
      error: quota
        ? "Penyimpanan browser penuh (batasnya sekitar 5 MB; gambar di desain ikut tersimpan). Hapus template lama atau perkecil gambarnya."
        : "Template tidak bisa disimpan di browser ini (penyimpanan lokal tidak tersedia).",
    };
  }
}

/** Adds a template (a new id each time; the name may repeat). */
export function saveUserTemplate(
  storage: StorageLike | null,
  template: Omit<UserTemplate, "id" | "savedAt"> & { id?: string; savedAt?: number }
): { ok: true; template: UserTemplate } | { ok: false; error: string } {
  if (!storage) return { ok: false, error: "Penyimpanan browser tidak tersedia." };
  const name = template.name.trim() || "Template tanpa nama";
  const entry: UserTemplate = {
    ...template,
    name: name.slice(0, 80),
    id: template.id ?? `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: template.savedAt ?? Date.now(),
  };
  const result = write(storage, [entry, ...listUserTemplates(storage)]);
  return result.ok ? { ok: true, template: entry } : result;
}

export function removeUserTemplate(storage: StorageLike | null, id: string): { ok: true } | { ok: false; error: string } {
  if (!storage) return { ok: false, error: "Penyimpanan browser tidak tersedia." };
  return write(storage, listUserTemplates(storage).filter((t) => t.id !== id));
}

/** window.localStorage, or null where it is blocked (private mode, sandboxed frames). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
