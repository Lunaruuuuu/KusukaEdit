# Canvas Design Editor (Polotno-style) — Next.js + Konva

Prototipe / MVP komponen design editor kanvas untuk Next.js, terinspirasi dari
arsitektur [Polotno](https://polotno.com/). Dibangun dengan **React-Konva**
untuk rendering kanvas, dan **Zustand** untuk state management.

Status: **MVP kerja praktek** — fokus pada fitur inti yang diminta, belum
production-ready (upload gambar, undo/redo, multi-select, dsb. sengaja
ditunda ke versi berikutnya).

## Fitur yang sudah berjalan

- [x] Tambah elemen **Teks** (preset Judul / Subjudul / Paragraf)
- [x] Tambah elemen **Bentuk** (Persegi & Lingkaran)
- [x] Pilih elemen (klik), **drag & drop**, **resize**, dan **rotate** lewat
      Transformer bawaan Konva
- [x] Hapus elemen terpilih dengan tombol `Delete` / `Backspace`
- [x] Geser elemen terpilih dengan tombol panah (`Shift` + panah = geser 10px)
- [x] Contextual toolbar: warna, ukuran font, font family, alignment (teks);
      fill/stroke (bentuk); kontrol layer (bring to front/back/forward/backward)
- [x] **Export JSON** (unduh file `.json`) dan **Import JSON** (rekonstruksi
      kanvas identik: posisi, ukuran, rotasi, warna, z-index)
- [ ] Upload gambar dari lokal → *ditunda ke versi berikutnya* (skema
      `ImageElement` sudah disiapkan di `src/types/editor.ts` agar tidak
      breaking change nanti)

## Struktur Proyek

```
canvas-editor/
├── app/
│   ├── layout.tsx        # Root layout (Server Component)
│   ├── page.tsx          # Halaman utama, merender <EditorRoot />
│   └── globals.css
├── src/
│   ├── types/editor.ts   # Skema TypeScript untuk dokumen kanvas
│   ├── store/
│   │   └── useEditorStore.ts   # Zustand store (state + actions + JSON)
│   └── components/
│       ├── EditorRoot.tsx        # Wrapper client + dynamic import (ssr:false)
│       ├── CanvasWorkspace.tsx   # Stage/Layer/Transformer + keyboard shortcut
│       ├── ElementRenderer.tsx   # Render 1 elemen (Text/Rect/Circle)
│       ├── SidePanel.tsx         # Panel tambah elemen
│       ├── ContextualToolbar.tsx # Kontrol elemen terpilih
│       └── ActionPanel.tsx       # Export/Import JSON
├── examples/
│   └── sample-design.json  # Contoh hasil export
├── next.config.js
├── package.json
└── tsconfig.json
```

## Menjalankan proyek

```bash
npm install
npm run dev
```
atau kalau pakai docker

```bash
docker pull node:24-slim
docker run -it --rm --entrypoint sh node:24-slim
```

Buka `http://localhost:3000`.

---

## Panduan Integrasi ke Proyek Next.js Lain

Komponen ini didesain agar bisa "diangkat" ke proyek Next.js lain dengan
menyalin folder `src/store` dan `src/components`, lalu:

```tsx
// contoh: app/design/page.tsx
import EditorRoot from "@/components/EditorRoot";

export default function DesignPage() {
  return <EditorRoot />;
}
```

### ⚠️ Penanganan SSR / Hydration Error (WAJIB)

`react-konva` merender ke `<canvas>` lewat Konva.js, yang bergantung pada
`window` dan `document`. Karena Next.js merender halaman di server terlebih
dahulu, **komponen kanvas tidak boleh ikut di-render di server** — kalau
tidak, akan muncul error semacam `window is not defined` atau hydration
mismatch.

Solusinya sudah diterapkan di `EditorRoot.tsx`:

```tsx
"use client";
import dynamic from "next/dynamic";

const CanvasWorkspace = dynamic(() => import("./CanvasWorkspace"), {
  ssr: false, // <-- kunci utamanya di sini
  loading: () => <div>Memuat kanvas…</div>,
});
```

Beberapa catatan tambahan:

- `EditorRoot` sendiri harus berupa **Client Component** (`"use client"`)
  karena memanggil `next/dynamic` dengan `ssr: false` — di App Router, opsi
  ini tidak diperbolehkan langsung di dalam Server Component.
- `app/page.tsx` boleh tetap Server Component; ia hanya me-render
  `<EditorRoot />`, jadi tidak ada masalah.
- `next.config.js` menambahkan `canvas` ke daftar `externals` webpack, supaya
  proses build server tidak mencoba resolve dependency native `canvas` yang
  sebenarnya tidak pernah kita panggil (kita full client-side rendering).
- Jika memakai **Pages Router** alih-alih App Router, pola yang sama tetap
  berlaku: import `CanvasWorkspace` dengan `dynamic(..., { ssr: false })` di
  dalam komponen halaman/`_app.tsx`.

---

## Spesifikasi Props & State (Store Layer)

Store dibuat dengan Zustand di `src/store/useEditorStore.ts`. Tidak ada
"props" karena semua komponen membaca/menulis langsung ke store global
(pola arsitektur Polotno) — ini menyederhanakan sinkronisasi antara
Side Panel, Toolbar, dan Canvas.

### State

| Field        | Tipe                     | Keterangan                                   |
|--------------|--------------------------|-----------------------------------------------|
| `canvas`     | `CanvasMeta`             | `{ width, height, backgroundColor }`          |
| `elements`   | `CanvasElement[]`        | Daftar semua elemen di kanvas                 |
| `selectedId` | `string \| null`         | id elemen yang sedang aktif disunting         |

### Actions

| Fungsi | Signature | Keterangan |
|---|---|---|
| `setCanvasMeta` | `(meta: Partial<CanvasMeta>) => void` | Ubah ukuran/warna latar kanvas |
| `setSelectedId` | `(id: string \| null) => void` | Set elemen aktif |
| `addTextElement` | `(preset?: "title"\|"subtitle"\|"paragraph") => void` | Tambah teks baru dengan preset ukuran font |
| `addShapeElement` | `(shapeType: "rect"\|"circle") => void` | Tambah bentuk dasar baru |
| `updateElement` | `(id: string, attrs: Partial<CanvasElement>) => void` | Update properti elemen manapun |
| `removeElement` | `(id: string) => void` | Hapus elemen berdasarkan id |
| `removeSelected` | `() => void` | Hapus elemen yang sedang aktif (dipakai shortcut Delete) |
| `reorderElement` | `(id, "front"\|"back"\|"forward"\|"backward") => void` | Atur z-index / layering |
| `nudgeSelected` | `(dx: number, dy: number) => void` | Geser elemen aktif (dipakai shortcut panah) |
| `exportToJSON` | `() => string` | Serialize seluruh dokumen kanvas ke string JSON |
| `loadFromJSON` | `(json: string) => { ok: boolean; error?: string }` | Deserialize & replace isi kanvas |
| `reset` | `() => void` | Kosongkan kanvas ke kondisi default |

Semua komponen React memakai hook `useEditorStore(selector)`, contoh:

```tsx
const addTextElement = useEditorStore((s) => s.addTextElement);
const selectedId = useEditorStore((s) => s.selectedId);
```

---

## Skema Dokumen JSON

Struktur ini yang dipakai oleh `exportToJSON()` / `loadFromJSON()`. Didefinisikan
secara penuh di `src/types/editor.ts`.

```jsonc
{
  "version": 1,               // versi skema — untuk migrasi di masa depan
  "canvas": {
    "width": 900,              // lebar kanvas (px)
    "height": 600,             // tinggi kanvas (px)
    "backgroundColor": "#ffffff"
  },
  "elements": [
    {
      "id": "uuid",            // unik per elemen (uuid v4)
      "type": "text",          // "text" | "shape" | "image"
      "x": 300,                // posisi X (px, relatif kanvas)
      "y": 80,                 // posisi Y (px)
      "width": 300,
      "height": 67,
      "rotation": 0,           // derajat
      "zIndex": 1,             // urutan layer, makin besar makin depan

      // -- khusus type: "text" --
      "text": "Judul Poster Saya",
      "fontSize": 48,
      "fontFamily": "Inter, sans-serif",
      "fill": "#111111",
      "align": "left"          // "left" | "center" | "right"
    },
    {
      "id": "uuid",
      "type": "shape",
      "shapeType": "rect",     // "rect" | "circle"
      "x": 200, "y": 250, "width": 200, "height": 140, "rotation": 15, "zIndex": 2,

      // -- khusus type: "shape" --
      "fill": "#6366f1",
      "stroke": "#312e81",
      "strokeWidth": 2
    }
  ]
}
```

Contoh file lengkap ada di [`examples/sample-design.json`](./examples/sample-design.json).

### Kenapa `width`/`height`, bukan `radius`, untuk lingkaran?

Supaya satu bounding box (`x, y, width, height, rotation`) berlaku seragam
untuk semua tipe elemen — ini yang membuat Transformer Konva bisa dipakai
generik untuk teks maupun bentuk. Saat merender `Circle`, komponen
`ElementRenderer` menurunkan `radius = width / 2` dari skema ini.

### Cara kerja round-trip (export → refresh → import)

1. `exportToJSON()` mengambil snapshot `canvas` + `elements` dari store,
   lalu `JSON.stringify`.
2. `ActionPanel` membungkusnya jadi `Blob` dan memicu unduhan file `.json`.
3. Saat file di-import, `FileReader` membaca isinya sebagai teks →
   `loadFromJSON(text)` mem-parse dan **mengganti total** state `canvas` &
   `elements` di store.
4. Karena setiap elemen menyimpan seluruh properti visualnya (posisi,
   ukuran, rotasi, warna, font, z-index), hasil render setelah import akan
   identik dengan kondisi sebelum di-export — tidak ada informasi yang
   hilang.

---

## Keyboard Shortcuts

| Shortcut | Aksi |
|---|---|
| `Delete` / `Backspace` | Hapus elemen terpilih |
| `↑ ↓ ← →` | Geser elemen terpilih 1px |
| `Shift + ↑ ↓ ← →` | Geser elemen terpilih 10px |
| Klik area kosong kanvas | Batalkan seleksi |
| Double-click pada teks | Edit isi teks (prompt sederhana — akan diganti inline-editor di versi berikutnya) |

## Roadmap Berikutnya (di luar scope MVP ini)

- Upload & render elemen gambar (`ImageElement`, skemanya sudah siap)
- Multi-select & grouping
- Undo/redo history
- Inline text editing (kontenteditable overlay, bukan `window.prompt`)
- Export kanvas ke PNG/PDF
- Snapping & alignment guides
