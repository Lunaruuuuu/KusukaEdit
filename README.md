# Canvas Design Editor (Polotno-style) — Next.js + Konva

Prototipe / MVP komponen design editor kanvas untuk Next.js, terinspirasi dari
arsitektur [Polotno](https://polotno.com/). Dibangun dengan **React-Konva**
untuk rendering kanvas, dan **Zustand** untuk state management.

Status: **MVP kerja praktek**, versi 2 — sudah menambahkan Undo/Redo, Export
ke Gambar, dan Containerization (Docker) di atas fitur dasar sebelumnya.

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
- [x] **Undo / Redo** dengan history stack (`past` & `future`), termasuk
      shortcut `Ctrl/Cmd+Z` dan `Ctrl/Cmd+Shift+Z`
- [x] **Export ke Gambar** (PNG & JPG) lewat `stage.toDataURL()`, dengan
      pilihan resolusi 1x/2x/3x
- [x] **Docker** — `Dockerfile` multi-stage + `docker-compose.yml` siap pakai
      untuk deployment
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
│   │   └── useEditorStore.ts   # Zustand store (state + history + actions + JSON)
│   ├── lib/
│   │   └── exportImage.ts      # Konva stage.toDataURL() -> file PNG/JPG
│   └── components/
│       ├── EditorRoot.tsx        # Wrapper client + dynamic import (ssr:false)
│       ├── CanvasWorkspace.tsx   # Stage/Layer/Transformer + keyboard shortcut
│       ├── ElementRenderer.tsx   # Render 1 elemen (Text/Rect/Circle)
│       ├── SidePanel.tsx         # Panel tambah elemen
│       ├── ContextualToolbar.tsx # Kontrol elemen terpilih
│       ├── HistoryControls.tsx   # Tombol Undo/Redo
│       └── ActionPanel.tsx       # Export/Import JSON + Export Gambar
├── examples/
│   └── sample-design.json  # Contoh hasil export
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── next.config.js
├── package.json
└── tsconfig.json
```

## Menjalankan proyek (lokal, tanpa Docker)

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

---

## Panduan Integrasi ke Proyek Next.js Lain

Komponen ini didesain agar bisa "diangkat" ke proyek Next.js lain dengan
menyalin folder `src/store`, `src/lib`, dan `src/components`, lalu:

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
| `stageNode`  | `Konva.Stage \| null`    | instance Stage Konva aktif (untuk export gambar); diisi otomatis oleh `CanvasWorkspace` saat mount |
| `past`       | `HistorySnapshot[]`      | tumpukan state sebelumnya, untuk Undo         |
| `future`     | `HistorySnapshot[]`      | tumpukan state yang baru saja di-undo, untuk Redo |

### Actions

| Fungsi | Signature | Keterangan |
|---|---|---|
| `setCanvasMeta` | `(meta: Partial<CanvasMeta>) => void` | Ubah ukuran/warna latar kanvas |
| `setSelectedId` | `(id: string \| null) => void` | Set elemen aktif (tidak masuk history) |
| `addTextElement` | `(preset?: "title"\|"subtitle"\|"paragraph") => void` | Tambah teks baru dengan preset ukuran font |
| `addShapeElement` | `(shapeType: "rect"\|"circle") => void` | Tambah bentuk dasar baru |
| `updateElement` | `(id: string, attrs: Partial<CanvasElement>) => void` | Update properti elemen manapun (drag, resize, warna, dll — di-debounce ke history) |
| `removeElement` | `(id: string) => void` | Hapus elemen berdasarkan id |
| `removeSelected` | `() => void` | Hapus elemen yang sedang aktif (dipakai shortcut Delete) |
| `reorderElement` | `(id, "front"\|"back"\|"forward"\|"backward") => void` | Atur z-index / layering |
| `nudgeSelected` | `(dx: number, dy: number) => void` | Geser elemen aktif (dipakai shortcut panah) |
| `undo` | `() => void` | Mundur satu langkah history |
| `redo` | `() => void` | Maju satu langkah history (setelah undo) |
| `setStageNode` | `(stage: Konva.Stage \| null) => void` | Registrasi instance Stage aktif (dipanggil otomatis oleh `CanvasWorkspace`) |
| `exportToJSON` | `() => string` | Serialize seluruh dokumen kanvas ke string JSON |
| `loadFromJSON` | `(json: string) => { ok: boolean; error?: string }` | Deserialize & replace isi kanvas (tercatat di history) |
| `reset` | `() => void` | Kosongkan kanvas ke kondisi default (tercatat di history) |

Semua komponen React memakai hook `useEditorStore(selector)`, contoh:

```tsx
const addTextElement = useEditorStore((s) => s.addTextElement);
const selectedId = useEditorStore((s) => s.selectedId);
```

---

## Sistem Undo / Redo (History Stack)

Bagian ini relevan untuk dibahas di laporan KP karena menjelaskan *algoritma*
penyusunan riwayat perubahan, bukan sekadar "simpan state lama ke array".

### Struktur data

```ts
interface HistorySnapshot {
  canvas: CanvasMeta;
  elements: CanvasElement[];
}

past: HistorySnapshot[];    // riwayat state SEBELUM perubahan terakhir
future: HistorySnapshot[];  // state yang baru di-undo, siap di-redo
```

Dua array ini adalah inti dari pola **command history / linear undo stack**
yang dipakai hampir semua editor (Figma, Photoshop, Google Docs, dsb.):

- Setiap perubahan dokumen men-*push* snapshot **sebelum** perubahan ke `past`.
- `undo()` meng-*pop* snapshot teratas dari `past`, menjadikannya state
  aktif, lalu men-*push* state aktif **sebelum** undo ke `future`.
- `redo()` kebalikannya: pop dari `future`, push state sebelum redo ke `past`.
- Melakukan perubahan BARU setelah undo akan mengosongkan `future` — ini
  standar di semua editor (begitu kamu membuat cabang riwayat baru, cabang
  "redo" yang lama jadi tidak valid lagi).
- `past`/`future` dibatasi `MAX_HISTORY = 50` snapshot (menggunakan
  `Array.slice`) supaya memori tidak membengkak tanpa batas pada sesi desain
  yang panjang.

Snapshot selalu berupa **structural clone** (`cloneSnapshot()`), bukan
referensi langsung ke array/objek `elements` yang sama — kalau tidak,
mutasi berikutnya pada `elements` akan ikut "merusak" snapshot yang sudah
tersimpan di `past`.

### Masalah yang perlu dipecahkan: perubahan kontinu vs. diskrit

Aksi seperti `addTextElement` atau `removeElement` itu **diskrit** — satu
klik tombol = satu perubahan logis = seharusnya satu langkah undo. Tapi aksi
seperti **drag elemen**, **resize**, atau **mengetik di kolom ukuran font**
itu **kontinu** — satu gestur drag bisa memicu puluhan event `onDragMove`,
satu kali mengetik warna lewat color-picker bisa memicu puluhan event
`input` saat jari menggeser color wheel.

Kalau setiap event itu langsung di-push ke `past` satu-satu, menekan
`Ctrl+Z` sekali hanya akan membatalkan pergerakan 1 pixel terakhir — bukan
seluruh gestur drag. Pengalaman penggunanya jadi terasa rusak.

### Solusi: debounce + batching berbasis kunci elemen

Store membedakan dua jenis pencatatan history:

1. **`recordHistoryNow()`** — dipakai aksi diskrit (`addTextElement`,
   `addShapeElement`, `removeElement`, `reorderElement`, `loadFromJSON`,
   `reset`, `setCanvasMeta`). Snapshot langsung di-push **sinkron**, dan
   setiap kali dipanggil, batch kontinu yang sedang berjalan (lihat di
   bawah) langsung "disegel" lebih dulu supaya tidak tercampur.

2. **`recordHistoryDebounced(batchKey)`** — dipakai `updateElement` (yang
   menangani drag/resize/rotate lewat Transformer, maupun semua input di
   Contextual Toolbar). Alur kerjanya:
   - Snapshot "sebelum" hanya diambil **sekali** di awal sebuah *batch* —
     bukan di setiap panggilan.
   - Setiap panggilan berikutnya cukup me-reset sebuah `setTimeout` 500ms.
     Begitu 500ms berlalu tanpa ada panggilan baru, snapshot "sebelum" tadi
     baru benar-benar di-push ke `past` (fungsi `sealPendingSnapshot`).
   - Jadi 50 event drag atau 20 keystroke dalam satu gestur hanya
     menghasilkan **satu** entri di `past`.
   - `batchKey` (di-isi dengan `id` elemen yang sedang diubah) memastikan
     batch tidak salah gabung: kalau user drag elemen A lalu langsung drag
     elemen B sebelum 500ms habis, batch A otomatis disegel dulu begitu
     `batchKey` berganti — sehingga tetap jadi dua langkah undo yang
     terpisah, bukan satu langkah yang membatalkan kedua elemen sekaligus.
   - Menekan `Ctrl+Z` di tengah sebuah batch (sebelum timer 500ms habis)
     akan menyegel batch itu lebih dulu, baru melakukan undo — jadi undo
     tetap terasa instan meski belum "resmi" tersimpan ke `past`.

Ringkasnya: **satu gestur pengguna = satu langkah undo**, terlepas dari
berapa banyak event mentah yang sebenarnya terjadi di baliknya. Ini juga
kenapa `selectedId` sengaja **tidak pernah** masuk ke snapshot — berpindah
seleksi bukan "perubahan desain" yang orang harapkan bisa di-undo.

### Shortcut

| Shortcut | Aksi |
|---|---|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` atau `Ctrl/Cmd + Y` | Redo |

Tombol Undo/Redo di header (`HistoryControls.tsx`) otomatis `disabled` saat
`past`/`future` kosong, dengan membaca `past.length`/`future.length` dari
store.

---

## Export ke Gambar (PNG / JPG)

Selain `exportToJSON()` (data mentah, bisa diimpor lagi), tersedia juga
export visual langsung dari kanvas lewat `stage.toDataURL()` milik Konva —
diimplementasikan di `src/lib/exportImage.ts` (`exportStageAsImage`).

Cara kerjanya:

1. Instance `Konva.Stage` yang sedang aktif didaftarkan ke store
   (`stageNode`) oleh `CanvasWorkspace` begitu komponen itu mount, lewat
   `setStageNode(stageRef.current)`. Dengan begini `ActionPanel` bisa
   memanggil fungsi export tanpa perlu prop-drilling ref kanvas.
2. Sebelum rasterisasi, semua handle **Transformer** (kotak seleksi & titik
   resize) dilepas sementara (`transformer.nodes([])`) dan kanvas di-*redraw*
   secara **sinkron** (`stage.draw()`, bukan `batchDraw()` yang baru
   menggambar ulang di animation frame berikutnya) — supaya handle seleksi
   tidak ikut ter-"bakar" ke dalam gambar hasil export. Setelah
   `toDataURL()` dipanggil, seleksi dikembalikan seperti semula.
3. `stage.toDataURL({ mimeType, quality, pixelRatio })` menghasilkan data
   URL base64, lalu di-download via elemen `<a download>` sementara —
   sama seperti pola export JSON, tanpa perlu endpoint server.
4. Opsi `pixelRatio` (1x/2x/3x) menentukan resolusi: `2x` berarti kanvas
   900×600 diekspor sebagai bitmap 1800×1200 — ini yang membuat hasilnya
   "beresolusi tinggi" meski ukuran kanvas kerja tetap sama.
5. Format **JPG** memakai `quality: 0.92` (JPEG tidak mendukung transparansi,
   tapi karena Layer kanvas selalu punya `Rect` latar belakang opaque,
   hasilnya tidak pernah berlubang transparan).

UI-nya ada di panel kanan (`ActionPanel.tsx`): pilih format (PNG/JPG),
pilih resolusi, lalu klik **Export PNG/JPG**.

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
   `elements` di store (sambil mencatat satu entri history, jadi import
   bisa di-undo).
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
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| Klik area kosong kanvas | Batalkan seleksi |
| Double-click pada teks | Edit isi teks (prompt sederhana — akan diganti inline-editor di versi berikutnya) |

---

## Containerization (Docker)

Proyek ini sudah punya `Dockerfile` multi-stage dan `docker-compose.yml`
supaya bisa dijalankan di server mana pun (termasuk server PT. Famous
Allstars) tanpa bergantung pada versi Node.js/OS yang terpasang di mesin
tersebut.

### Build & run manual

```bash
docker build -t canvas-design-editor .
docker run -p 3000:3000 canvas-design-editor
```

### Atau pakai Docker Compose (lebih praktis)

```bash
docker compose up --build
```

Buka `http://localhost:3000`.

### Cara kerja `Dockerfile`

Memakai **3 stage** supaya image akhir sekecil mungkin:

1. **`deps`** — `npm ci` menginstal dependency persis sesuai `package-lock.json`.
2. **`builder`** — menjalankan `npm run build`. `next.config.js` mengaktifkan
   `output: "standalone"`, sehingga Next.js men-*trace* hanya dependency
   produksi yang benar-benar dipakai dan menghasilkan `server.js` yang
   berdiri sendiri di `.next/standalone`.
3. **`runner`** — image produksi final, hanya meng-copy hasil `standalone`
   build + folder `public` + `.next/static`. Tidak membawa source TypeScript,
   dev dependency, atau toolchain build sama sekali, dan berjalan sebagai
   user non-root (`nextjs`) untuk keamanan.

```dockerfile
FROM node:20-alpine AS deps     # install deps dari lockfile
FROM node:20-alpine AS builder  # next build (output: "standalone")
FROM node:20-alpine AS runner   # hanya copy standalone build, non-root, EXPOSE 3000
```

### Variabel lingkungan

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port yang didengarkan server Next.js di dalam container |
| `HOSTNAME` | `0.0.0.0` | Supaya bisa diakses dari luar container |
| `NODE_ENV` | `production` | Mode produksi Next.js |

> **Catatan jaringan saat build:** seperti proyek Next.js pada umumnya,
> tahap `deps`/`builder` butuh akses internet (untuk `npm ci` mengunduh
> package dari registry) saat *image Docker-nya dibangun* — bukan saat
> aplikasi berjalan. Pastikan mesin/CI yang menjalankan `docker build`
> punya akses ke registry npm (atau gunakan npm registry mirror internal
> PT. Famous Allstars kalau ada).

---

## Roadmap Berikutnya (di luar scope MVP ini)

- Upload & render elemen gambar (`ImageElement`, skemanya sudah siap)
- Multi-select & grouping
- Inline text editing (kontenteditable overlay, bukan `window.prompt`)
- Export kanvas ke PDF
- Snapping & alignment guides
- CI/CD (build & push image Docker otomatis ke registry)
