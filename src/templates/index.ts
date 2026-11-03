// ---------------------------------------------------------------------------
// Template registry.
//
// The presets are plain JSON files stored in the repository, in BOTH
// supported formats:
//   *.kusuka.json   native KusukaEdit documents (v1/v2 single page, or v3 pages)
//   *.polotno.json  Polotno documents (pages: [{ children }, ...])
//
// The Polotno ones live in ./polotno/ and are ordinary Polotno JSON exports —
// several of them have more than one page (a slide deck, a brochure, a
// carousel, an invitation...). The registry does not say which format a file is
// in: the adapter detects it (detectFormat) when the template is previewed or
// loaded, exactly as it does for a file picked with the Import button, and
// rebuilds EVERY page of it in the store.
//
// To add a template: drop a JSON file in this folder (or ./polotno/) in either
// format and add an entry below.
// ---------------------------------------------------------------------------

import posterAcara from "./poster-acara.kusuka.json";
import kartuKutipan from "./kartu-kutipan.kusuka.json";
import promoDiskon from "./promo-diskon.polotno.json";
import postSosmed from "./post-sosmed.polotno.json";
import presentasi from "./polotno/presentasi-3-slide.polotno.json";
import brosur from "./polotno/brosur-2-halaman.polotno.json";
import carousel from "./polotno/carousel-4-slide.polotno.json";
import kartuNama from "./polotno/kartu-nama-2-sisi.polotno.json";
import undangan from "./polotno/undangan-story-3.polotno.json";
import katalog from "./polotno/katalog-produk-2-halaman.polotno.json";
import paketFeedStory from "./polotno/paket-feed-dan-story.polotno.json";

export interface TemplateEntry {
  id: string;
  name: string;
  /** One line shown on the card. */
  description?: string;
  /** Raw file content, passed untouched to the store's loadFromJSON(). */
  data: unknown;
}

export const TEMPLATES: TemplateEntry[] = [
  { id: "presentasi-3-slide", name: "Presentasi 3 slide", description: "Sampul, agenda, penutup", data: presentasi },
  { id: "brosur-2-halaman", name: "Brosur 2 halaman", description: "Muka dan belakang, A4", data: brosur },
  { id: "carousel-4-slide", name: "Carousel Instagram", description: "Empat slide persegi", data: carousel },
  { id: "kartu-nama-2-sisi", name: "Kartu nama", description: "Depan dan belakang", data: kartuNama },
  { id: "undangan-story-3", name: "Undangan story", description: "Tiga layar 9:16", data: undangan },
  {
    id: "katalog-produk-2-halaman",
    name: "Katalog produk",
    description: "Gambar dengan filter, blur, dan sudut bulat",
    data: katalog,
  },
  {
    id: "paket-feed-dan-story",
    name: "Paket feed + story",
    description: "Dua halaman, dua ukuran berbeda",
    data: paketFeedStory,
  },
  { id: "promo-diskon", name: "Promo diskon", description: "Satu halaman, format Polotno", data: promoDiskon },
  { id: "post-sosmed", name: "Post media sosial", description: "Satu halaman, format Polotno", data: postSosmed },
  { id: "poster-acara", name: "Poster acara", description: "Satu halaman, format native", data: posterAcara },
  { id: "kartu-kutipan", name: "Kartu kutipan", description: "Satu halaman, format native", data: kartuKutipan },
];
