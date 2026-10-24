// ---------------------------------------------------------------------------
// Template registry.
//
// The presets are plain JSON files stored in the repository, in BOTH
// supported formats:
//   *.kusuka.json   native KusukaEdit documents
//   *.polotno.json  Polotno-compatible documents (pages: [{ children }])
//
// The registry does not say which format a file is in — the adapter detects
// it when the template is previewed or loaded, exactly as it does for a file
// picked with the Import button. To add a template: drop a JSON file in this
// folder (either format) and add an entry below.
// ---------------------------------------------------------------------------

import posterAcara from "./poster-acara.kusuka.json";
import kartuKutipan from "./kartu-kutipan.kusuka.json";
import promoDiskon from "./promo-diskon.polotno.json";
import postSosmed from "./post-sosmed.polotno.json";

export interface TemplateEntry {
  id: string;
  name: string;
  /** Raw file content, passed untouched to the store's loadFromJSON(). */
  data: unknown;
}

export const TEMPLATES: TemplateEntry[] = [
  { id: "poster-acara", name: "Poster acara", data: posterAcara },
  { id: "kartu-kutipan", name: "Kartu kutipan", data: kartuKutipan },
  { id: "promo-diskon", name: "Promo diskon", data: promoDiskon },
  { id: "post-sosmed", name: "Post media sosial", data: postSosmed },
];
