# Canvas Design Editor (Polotno-style) — Next.js + Konva

Prototipe / MVP komponen design editor kanvas untuk Next.js, terinspirasi dari
arsitektur [Polotno](https://polotno.com/). Dibangun dengan **React-Konva**
untuk rendering kanvas, dan **Zustand** untuk state management.

Status: **MVP kerja praktek, versi 5** — di atas fitur dasar, Undo/Redo, Export
Gambar, Docker, edit teks langsung, adapter Polotno, template, copy/paste, upload
gambar, dan pengaturan kanvas, versi ini menambahkan **parser teks Polotno**
(tag HTML dibuang, baris baru dinormalkan), **elemen vektor/SVG**, **gambar
terbalik (flip)** dengan kompensasi titik jangkar, **toleransi lebar kotak teks**
(+10 px), serta **Fit-to-Screen dan zoom** kanvas.

## Daftar isi

- [Fitur](#fitur)
- [Struktur proyek](#struktur-proyek)
- [Menjalankan proyek](#menjalankan-proyek-lokal-tanpa-docker)
- [Panduan integrasi & SSR](#panduan-integrasi-ke-proyek-nextjs-lain)
- [Spesifikasi State & Store](#spesifikasi-props--state-store-layer)
- [Upload gambar & manajemen memori](#upload-gambar--manajemen-memori)
- [Pengaturan workspace (ukuran, rasio, latar)](#pengaturan-workspace-ukuran-rasio-latar)
- [Fit-to-Screen & zoom kanvas](#fit-to-screen--zoom-kanvas)
- [Edit teks langsung (In-Place Text Editing)](#edit-teks-langsung-in-place-text-editing)
- [Copy & Paste elemen](#copy--paste-elemen-ctrlc--ctrlv)
- [Undo / Redo](#sistem-undo--redo-history-stack)
- [Export ke gambar](#export-ke-gambar-png--jpg)
- [Skema JSON native (v2)](#skema-dokumen-json-native-v2)
- [Adapter Polotno (dua arah)](#adapter-polotno-import--export-dua-arah)
- [Template](#template-galeri-preset)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Docker](#containerization-docker)
- [Catatan pengujian](#catatan-pengujian)
- [Roadmap](#roadmap-berikutnya)

## Fitur

- [x] Tambah elemen **Teks** (preset Judul / Subjudul / Paragraf) dan **Bentuk** (Persegi, Lingkaran)
- [x] Pilih, **drag & drop**, **resize**, **rotate** lewat Transformer Konva
      (teks hanya di-resize lebarnya; tingginya mengikuti isi teks)
- [x] **Edit teks langsung di kanvas** — double-click teks memunculkan
      `<textarea>` tepat di atasnya
- [x] **Copy / Paste** elemen dengan `Ctrl/Cmd+C` dan `Ctrl/Cmd+V` (hasil tempel
      bergeser +20,+20 dan masuk riwayat undo)
- [x] **Undo / Redo** (history stack `past` & `future`)
- [x] **Upload gambar** dari komputer (`<input type="file" accept="image/*">`):
      langsung tampil di kanvas, bisa digeser, diskalakan proporsional, diputar,
      dan diganti isinya; URL sementara dibersihkan otomatis
- [x] **Pengaturan workspace**: lebar/tinggi manual, preset rasio (1:1, 4:5, 4:3,
      16:9, 9:16), dan warna latar; ukuran kanvas ikut menentukan hasil export gambar
- [x] Contextual toolbar: warna, ukuran font, font, perataan (teks); warna isi,
      warna garis, tebal garis (bentuk); ganti gambar (gambar); layering
      (depan/belakang/naik/turun)
- [x] **Export / Import JSON** dengan dua pilihan format: **Native (KusukaEdit)**
      dan **Polotno-compatible**; format file terdeteksi otomatis saat import
- [x] **Galeri template** (4 preset: 2 format native, 2 format Polotno) dengan
      thumbnail
- [x] **Export gambar** PNG/JPG (1x/2x/3x) lewat `stage.toDataURL()`, dengan
      batas ukuran aman dan keterangan ukuran hasil
- [x] **Adapter Polotno yang disempurnakan**: struktur bertingkat → array datar,
      gambar + crop, grup dilaporkan, `color`/`fill`, titik jangkar kiri-atas
- [x] **Parser teks Polotno**: `<p>`, `<span>`, `</p><p>`, `<br>` dibuang/diubah
      menjadi `\n`, entitas didekode — teks tampil bersih di `Konva.Text`
- [x] **Elemen SVG/vektor** (ikon, panah) diimpor sebagai `ImageElement`
      (`vector: true`) dan ditulis kembali sebagai `svg`; `colorsReplace` diterapkan
      pada SVG data URI
- [x] **Gambar terbalik**: `flipX`/`flipY` dan skala negatif → `scaleX`/`scaleY = -1`
      di store, dengan koordinat jangkar dikompensasi agar posisi visual tetap
- [x] **Toleransi lebar teks** (+10 px, posisi teks tidak bergeser) agar kata
      pendek seperti "SALE" tidak turun baris karena beda font
- [x] **Fit-to-Screen & zoom**: kanvas besar otomatis diperkecil agar utuh di
      layar; tombol −/+/Fit, label persen, dan Ctrl+scroll; export tidak terpengaruh
- [x] **Docker** — `Dockerfile` multi-stage + `docker-compose.yml`
- [x] **Test suite** (`npm test`, 92 tes) untuk adapter, store, memori gambar,
      ukuran kanvas, zoom, export, dan template

## Struktur Proyek

```
canvas-editor/
├── app/
│   ├── layout.tsx                 # Root layout (Server Component)
│   ├── page.tsx                   # Halaman utama, merender <EditorRoot />
│   └── globals.css
├── src/
│   ├── types/editor.ts            # Skema TypeScript dokumen kanvas (native v2)
│   ├── store/
│   │   └── useEditorStore.ts      # Zustand: state, history, clipboard, actions, JSON
│   ├── lib/
│   │   ├── polotnoAdapter.ts      # Konversi dua arah Polotno <-> native + deteksi format
│   │   ├── color.ts               # Normalisasi warna (rgb(), rgba(), hsl(), nama, #rgb -> #rrggbb)
│   │   ├── id.ts                  # Pembuat id elemen
│   │   ├── workspace.ts           # Aturan ukuran kanvas: batas, rasio, rencana ukuran export
│   │   ├── objectUrls.ts          # Pencatat URL sementara (blob:) yang harus di-revoke
│   │   ├── imageCache.ts          # Memuat <img> sekali (CORS dulu, lalu cadangan) + cache
│   │   ├── imageUpload.ts         # File -> URL objek -> gambar terukur (validasi, revoke bila gagal)
│   │   ├── imageData.ts           # blob: -> data: saat export JSON
│   │   ├── useLoadedImage.ts      # Hook React: status memuat gambar
│   │   ├── drawPicture.ts         # Cara gambar digambar di Konva (crop, cermin) — murni, bisa diuji
│   │   ├── zoom.ts                # Skala tampilan: fit, langkah zoom, ukuran Stage (fungsi murni)
│   │   ├── useCanvasZoom.ts       # Hook React: mode Fit/manual, ukur area, Ctrl+scroll
│   │   └── exportImage.ts         # Konva stage.toDataURL() -> file PNG/JPG (bebas dari zoom)
│   ├── templates/
│   │   ├── index.ts               # Registry template
│   │   ├── poster-acara.kusuka.json
│   │   ├── kartu-kutipan.kusuka.json
│   │   ├── promo-diskon.polotno.json
│   │   └── post-sosmed.polotno.json
│   └── components/
│       ├── EditorRoot.tsx         # Wrapper client + dynamic import (ssr:false)
│       ├── CanvasWorkspace.tsx    # Stage/Layer/Transformer + skala tampilan + keyboard shortcut
│       ├── ZoomControls.tsx       # Tombol −, %, +, Fit di sudut kanvas
│       ├── ElementRenderer.tsx    # Render 1 elemen (Text/Rect/Ellipse/Shape gambar)
│       ├── TextEditorOverlay.tsx  # <textarea> untuk edit teks di tempat
│       ├── SidePanel.tsx          # Tab "Elemen" (termasuk upload gambar), "Template", "Kanvas"
│       ├── WorkspacePanel.tsx     # Ukuran, rasio, dan latar belakang kanvas
│       ├── TemplatePanel.tsx      # Kartu template
│       ├── TemplateThumbnail.tsx  # Thumbnail SVG dari dokumen hasil adapter
│       ├── ContextualToolbar.tsx  # Kontrol elemen terpilih
│       ├── HistoryControls.tsx    # Tombol Undo/Redo
│       └── ActionPanel.tsx        # Export/Import JSON (Native/Polotno) + Export Gambar
├── tests/                         # `npm test` — lihat "Catatan pengujian"
│   ├── core.test.ts               # Adapter, color, store (history, clipboard, JSON)
│   ├── media-workspace.test.ts    # Gambar, memori (revoke), ukuran kanvas, adapter gambar
│   ├── vector-text-view.test.ts   # Teks HTML, SVG, flip, toleransi lebar, zoom, export, drawPicture
│   ├── templates.test.ts          # Semua template dan contoh
│   ├── harness.ts                 # Test runner kecil (tanpa dependensi)
│   ├── stubs/                     # Pengganti tipis zustand & uuid agar jalan di Node
│   └── tsconfig.json
├── examples/
│   ├── sample-design.json         # Contoh export format Native
│   └── sample-design.polotno.json # Dokumen yang sama, format Polotno
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

Salin folder `src/store`, `src/lib`, `src/templates`, dan `src/components`, serta
aturan CSS di `app/globals.css` (kelas `.stage-wrap`, `.text-editor*`,
`.template-*`, `.workspace-panel`, `.chip*`, `.swatch*`, `.size-grid*`,
`.error-note`, `.warning-note`, `.warning-list`; tanpanya overlay edit teks tidak
akan menimpa kanvas dan panel Kanvas tampil tanpa gaya). Lalu:

```tsx
// contoh: app/design/page.tsx
import EditorRoot from "@/components/EditorRoot";

export default function DesignPage() {
  return <EditorRoot />;
}
```

Dependensi yang dibutuhkan: `konva`, `react-konva`, `zustand`, `uuid`. Alias
`@/*` → `src/*` harus ada di `tsconfig.json`, dan `resolveJsonModule` harus
`true` (template diimpor sebagai file `.json`).

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

Catatan tambahan:

- `EditorRoot` harus berupa **Client Component** (`"use client"`) karena
  memanggil `next/dynamic` dengan `ssr: false` — di App Router, opsi ini tidak
  diperbolehkan langsung di dalam Server Component.
- `app/page.tsx` boleh tetap Server Component.
- `TextEditorOverlay` berada di dalam `CanvasWorkspace`, jadi ikut tidak
  di-render di server.
- `SidePanel` / `TemplatePanel` / `WorkspacePanel` **tidak** memakai Konva
  (thumbnail template adalah SVG biasa), sehingga aman di-render di server. API
  browser (`URL.createObjectURL`, `Image`) hanya dipanggil di dalam *event
  handler* atau efek, tidak pernah saat render, jadi tidak memicu hydration error.
- `next.config.js` menambahkan `canvas` ke `externals` webpack agar build server
  tidak mencoba me-resolve dependency native `canvas` yang tidak pernah kita
  panggil.
- Jika memakai **Pages Router**, pola yang sama berlaku: import
  `CanvasWorkspace` dengan `dynamic(..., { ssr: false })`.

---

## Spesifikasi Props & State (Store Layer)

Store ada di `src/store/useEditorStore.ts` (Zustand). Tidak ada "props": semua
komponen membaca/menulis langsung ke store global (pola arsitektur Polotno).

### State

| Field        | Tipe                     | Keterangan |
|--------------|--------------------------|------------|
| `canvas`     | `CanvasMeta`             | `{ width, height, backgroundColor }` |
| `elements`   | `CanvasElement[]`        | Semua elemen di kanvas |
| `selectedId` | `string \| null`         | id elemen yang sedang aktif |
| `clipboard`  | `CanvasElement \| null`  | Elemen yang disalin dengan Ctrl+C; bukan bagian dokumen, tidak ikut history |
| `editingId`  | `string \| null`         | id teks yang sedang diedit di overlay `<textarea>`; saat terisi, shortcut global dinonaktifkan dan node Konva disembunyikan |
| `stageNode`  | `Konva.Stage \| null`    | Instance Stage aktif (untuk export gambar); diisi otomatis oleh `CanvasWorkspace` |
| `loadRevision` | `number`               | Bertambah 1 setiap `loadFromJSON` **berhasil** (Import, template). Sinyal tampilan: kanvas menampilkan dokumen baru utuh lagi (zoom "Fit") walau ukurannya sama. Bukan bagian dokumen |
| `past`       | `HistorySnapshot[]`      | Tumpukan state sebelumnya (Undo) |
| `future`     | `HistorySnapshot[]`      | Tumpukan state yang baru di-undo (Redo) |

`selectedId`, `clipboard`, `editingId`, `stageNode`, dan `loadRevision` **tidak
pernah** masuk ke snapshot history — hanya `canvas` dan `elements`. (Level zoom
sengaja tidak ada di store: itu pengaturan tampilan milik `CanvasWorkspace`, lihat
"Fit-to-Screen & zoom kanvas".)

### Actions

| Fungsi | Signature | Keterangan |
|---|---|---|
| `setCanvasMeta` | `(meta: Partial<CanvasMeta>) => void` | Ubah ukuran/warna latar. Ukuran dibulatkan dan dibatasi 50–4000 px, warna dinormalisasi, nilai tidak valid diabaikan; pemanggilan beruntun menjadi satu langkah undo; tanpa perubahan = tanpa langkah undo |
| `setSelectedId` | `(id: string \| null) => void` | Set elemen aktif (tidak masuk history) |
| `setEditingId` | `(id: string \| null) => void` | Mulai/akhiri mode edit teks (tidak masuk history) |
| `setStageNode` | `(stage: Konva.Stage \| null) => void` | Registrasi Stage (otomatis) |
| `addTextElement` | `(preset?: "title"\|"subtitle"\|"paragraph") => void` | Tambah teks baru |
| `addShapeElement` | `(shapeType: "rect"\|"circle") => void` | Tambah bentuk baru |
| `addImageElement` | `(image: { src, naturalWidth, naturalHeight }) => void` | Pasang gambar di tengah kanvas, diperkecil agar muat (≤ 60% kanvas, rasio asli, tidak diperbesar), dipilih, satu langkah undo |
| `replaceImageSource` | `(id: string, image: { src, naturalWidth, naturalHeight }) => void` | Ganti isi gambar; posisi, rotasi, dan lebar tetap, tinggi mengikuti rasio gambar baru, crop direset; satu langkah undo |
| `updateElement` | `(id, attrs: Partial<CanvasElement>) => void` | Update properti elemen (drag, resize, warna, teks…); perubahan beruntun di-batch jadi satu langkah undo |
| `syncMeasuredHeight` | `(id: string, height: number) => void` | Menyalin tinggi teks hasil ukur Konva ke store; **tidak** membuat langkah undo |
| `removeElement` | `(id: string) => void` | Hapus elemen |
| `removeSelected` | `() => void` | Hapus elemen aktif (shortcut Delete) |
| `copySelected` | `() => boolean` | Salin elemen aktif ke `clipboard`; `false` bila tidak ada yang dipilih |
| `pasteClipboard` | `() => boolean` | Tempel dengan id baru, +20/+20; `false` bila clipboard kosong |
| `reorderElement` | `(id, "front"\|"back"\|"forward"\|"backward") => void` | Atur z-index |
| `nudgeSelected` | `(dx: number, dy: number) => void` | Geser elemen aktif (shortcut panah) |
| `undo` / `redo` | `() => void` | Mundur / maju satu langkah history |
| `exportToJSON` | `(format?: "kusuka"\|"polotno") => Promise<{ json: string; warnings: string[] }>` | Serialize dokumen; default `"kusuka"`. **Async** sejak v4: gambar `blob:` dibaca dan disematkan sebagai `data:` URL |
| `loadFromJSON` | `(data: string \| unknown) => LoadResult` | Muat dokumen **format apa pun** (string atau objek); satu langkah undo |
| `reset` | `() => void` | Kosongkan kanvas (satu langkah undo) |

```ts
type LoadResult =
  | { ok: true; format: "kusuka" | "polotno"; warnings: string[] }
  | { ok: false; error: string };
```

`loadFromJSON` yang gagal **tidak mengubah** kanvas maupun history.

Contoh pemakaian di komponen:

```tsx
const addTextElement = useEditorStore((s) => s.addTextElement);
const selectedId = useEditorStore((s) => s.selectedId);
```

---

## Upload gambar & manajemen memori

### Alur

1. Tab **Elemen** → **⬆ Unggah gambar** membuka
   `<input type="file" accept="image/*">` (tersembunyi di balik tombol). Nilai
   input di-reset setelah dipilih, sehingga berkas yang sama bisa dipilih lagi.
2. `prepareImageFile(file)` (`lib/imageUpload.ts`): memastikan tipenya `image/*`
   dan ukurannya ≤ 25 MB (`accept` hanyalah petunjuk; pengguna masih bisa memilih
   "All files"), memanggil **`URL.createObjectURL(file)`**, lalu memuat gambar
   sekali untuk mengetahui ukuran aslinya. Bila gagal (berkas rusak), URL itu
   langsung di-**revoke** dan pesan galat ditampilkan; elemen kosong tidak pernah dibuat.
3. `addImageElement` memasang `ImageElement` di tengah kanvas, dengan rasio asli,
   diperkecil agar muat dalam 60% kanvas (tidak pernah diperbesar melebihi
   ukuran aslinya), langsung terpilih. Karena gambar sudah ada di cache pemuat,
   ia tampil tanpa berkedip.
4. **Ganti gambar** (toolbar, saat gambar terpilih) menjalankan alur yang sama
   dan memanggil `replaceImageSource`. Target penggantian dicatat saat tombol
   diklik, jadi gambar baru tetap masuk ke elemen yang benar walau pengguna
   memilih elemen lain selagi gambar dimuat.

### Interaksi (Transformer) dan riwayat

`ElementRenderer` merender gambar dengan satu jenis node, **`Shape`** dengan
`sceneFunc` sendiri (`lib/drawPicture.ts`) — selalu, termasuk saat gambar belum
selesai dimuat atau gagal (tampil sebagai kotak abu-abu putus-putus, merah bila
gagal). Jenis node tidak pernah berganti, sehingga Transformer tidak kehilangan
node yang sedang dipegangnya. `sceneFunc` menggambar crop dan **pencerminan**
(lihat "Pencerminan"); `hitFunc` menyediakan area klik berupa kotak polos.

- **Geser (X, Y):** `onDragEnd` → `updateElement(id, { x, y })`.
- **Skala proporsional:** Transformer untuk gambar hanya menampilkan **empat
  gagang sudut** dengan `keepRatio`; gagang sisi akan meregangkan gambar. Pada
  `onTransformEnd` skala dibaca, dibakukan ke `width`, dan `height` **diturunkan**
  dari lebar baru dan rasio kotak itu sendiri, sehingga pembulatan tidak bisa
  membuat gambar keluar dari proporsi.
- **Rotasi:** `rotation` ditulis dari node; sudut putar di sekitar sudut kiri-atas.
- **Gambar terbalik** tetap bisa digeser/diskalakan/diputar seperti biasa: node
  tidak pernah memakai skala negatif, jadi Transformer memperlakukannya sebagai
  node biasa.
- **Riwayat:** ketiganya berakhir di `updateElement`, yang memanggil
  **`recordHistoryDebounced(elementId)`**. Satu gestur (puluhan event) menjadi
  **satu langkah undo**, dan Undo mengembalikan `x, y, width, height, rotation`
  persis seperti sebelumnya (diuji).

### Pembersihan memori (`URL.revokeObjectURL`)

Sebuah `blob:` URL menahan datanya di memori browser sampai di-revoke. Menurut
permintaan awal, URL di-revoke "saat elemen diganti atau dihapus". Implementasinya
**sedikit berbeda dari kalimat itu, dengan sengaja**: URL di-revoke saat gambar itu
**tidak bisa muncul lagi**, bukan saat elemennya dihapus.

Alasannya: `Ctrl+Z` mengembalikan elemen yang dihapus/diganti dari history stack.
Bila URL sudah di-revoke saat penghapusan, Undo akan memunculkan gambar rusak —
merusak fitur Undo/Redo yang sudah ada. Aturannya karena itu berbasis referensi:

> Sebuah URL di-revoke begitu **tidak ada lagi** yang merujuknya: bukan elemen
> aktif, bukan snapshot `past`/`future`, bukan batch history yang belum disegel,
> dan bukan `clipboard`.

`releaseOrphanUrls()` di store menghitung himpunan referensi itu dan memanggil
`releaseUnreferencedObjectUrls()` (`lib/objectUrls.ts`) setelah setiap perubahan
yang bisa melepas referensi: tambah/hapus/ganti gambar, undo, redo, paste, copy,
muat JSON, reset, dan pemangkasan history (`MAX_HISTORY = 50`). Dampaknya:

- Menghapus atau mengganti gambar → memori **dibebaskan begitu snapshot terakhir
  yang menampilkannya keluar dari history** (paling lambat setelah 50 langkah),
  atau saat Anda memuat desain lain/menyalin elemen lain ke clipboard.
- Sebelum itu, Undo selalu bisa memulihkan gambar.
- Hanya URL yang **dibuat sesi ini** yang di-revoke (`trackObjectUrl`); URL
  `https://` atau `data:` tidak pernah disentuh.
- Cache gambar (`imageCache.ts`, 40 entri) ikut dibersihkan untuk URL yang di-revoke.

Dengan kata lain, gambar tidak bocor selamanya, tetapi tidak dibebaskan secepat
penghapusan. Bila Anda lebih suka revoke langsung saat hapus (dengan konsekuensi
Undo tidak bisa memulihkan gambar), perubahannya kecil: panggil
`URL.revokeObjectURL` di `removeElement`/`replaceImageSource`.

### Menyimpan gambar di JSON

`blob:` URL hanya hidup di halaman yang membuatnya — ditulis ke file, ia mati
setelah refresh. Karena itu `exportToJSON` (async) membaca setiap gambar `blob:` dan
menggantinya dengan **`data:` URL** pada salinan yang diekspor (state editor tetap
memakai blob yang murah). Gambar yang tak terbaca lagi tidak dibuang diam-diam:
tetap di file dan dilaporkan sebagai peringatan. Konsekuensinya, file JSON yang
memuat gambar bisa besar (base64 ≈ +33% dari ukuran berkas asli).
Saat **import**, `blob:` URL dari berkas lama diberi peringatan dan tampil sebagai
kotak kosong, bukan error.

### Gambar dari URL luar

Gambar `https://` (misalnya dari berkas Polotno) dimuat dengan
`crossOrigin="anonymous"` supaya export PNG/JPG tetap bisa membaca kanvas. Bila
server tidak mengizinkan CORS, gambar tetap ditampilkan (tanpa CORS) tetapi
ditandai, dan export PNG/JPG menampilkan pesan jelas (lihat "Export ke gambar").
Export **JSON** tidak terpengaruh.

### Batasan

- Belum ada UI untuk *crop* — field `crop*` ada di skema dan terisi dari import
  Polotno, tetapi gambar yang Anda unggah selalu utuh.
- SVG tanpa `width`/`height` bawaan ditempatkan 300×150 lalu diskalakan seperti gambar
  lain. Berkas SVG yang diunggah ditandai `vector: true`.
- Gambar tidak diunggah ke server; semuanya berada di browser sampai Anda mengekspor.

---

## Pengaturan workspace (ukuran, rasio, latar)

Tab **Kanvas** di panel kiri (`WorkspacePanel.tsx`) mengubah objek `canvas`
(tipe `CanvasMeta`: `{ width, height, backgroundColor }`) di store lewat
`setCanvasMeta`.

| Kontrol | Perilaku |
|---|---|
| **Lebar × Tinggi** | Diketik sebagai draf dan diterapkan saat **Enter** atau klik di luar kolom — bukan per ketukan, supaya mengetik `1080` tidak menghasilkan kanvas 1, 10, lalu 108 px. Nilai dibulatkan dan dibatasi **50–4000 px**; kolom langsung menampilkan angka yang diterima. Kolom kosong kembali ke ukuran saat ini |
| **Rasio** | Tombol 1:1, 4:5, 4:3, 16:9, 9:16. Sisi **terpanjang** dipertahankan (900×600 + 1:1 → 900×900; + 9:16 → 506×900) agar ukuran kerja tidak tiba-tiba melonjak. Tombol rasio yang cocok dengan ukuran sekarang ditandai aktif; ukuran khusus tidak menandai apa pun |
| **Latar belakang** | Pemilih warna + beberapa swatch; disimpan sebagai `#rrggbb` |
| **Peringatan** | Mengecilkan kanvas **tidak** menggeser atau menskalakan desain. Elemen yang berada sepenuhnya di luar batas tetap ada (tak terlihat, tak ikut export) dan panel menyebutkan jumlahnya |

### Sinkronisasi ke kanvas dan export

`canvas.width/height` di store langsung menjadi: ukuran desain `<Stage>` Konva
(ditampilkan × zoom, lihat bagian berikutnya), kotak `.stage-wrap` (yang juga
menjadi acuan overlay edit teks), dan persegi latar belakang. Hasil export gambar
selalu = ukuran kanvas × `pixelRatio` — pada zoom berapa pun — tanpa langkah
tambahan; panel kanan menampilkan hitungannya (`Kanvas 1200 × 675 px → hasil
2400 × 1350 px`) dan batas 8192 px per sisi dijelaskan di bagian export.

Perubahan kanvas masuk history sebagai perubahan kontinu (`batchKey = "canvas"`),
sehingga `Ctrl+Z` mengembalikan ukuran/warna sebelumnya dan kolom ikut kembali.

Mengubah ukuran kanvas juga menampilkannya utuh lagi (zoom kembali ke "Fit").

---

## Fit-to-Screen & zoom kanvas

Kanvas 1080×1920 (poster, cerita) tidak muat di layar pada ukuran aslinya. Karena
itu `CanvasWorkspace` menampilkan Stage dengan **skala tampilan** (`zoom`):

- `<Stage width={round(W × zoom)} height={round(H × zoom)} scaleX={zoom} scaleY={zoom}>`.
  Semua node tetap memakai **piksel desain**; store, JSON, dan gambar hasil export
  tidak berubah sama sekali oleh zoom.
- **Mode Fit (bawaan):** `zoom = min(lebarRuang / W, tinggiRuang / H, 1)`
  dibulatkan **ke bawah** (4 desimal, `fitZoom` di `lib/zoom.ts`). Kanvas kecil
  **tidak diperbesar** (maksimal 100%), kanvas besar tidak pernah lebih besar dari
  ruangnya sehingga tidak muncul scrollbar. Ruang = area `.canvas-scroll` dikurangi
  padding, diukur dengan `ResizeObserver`, jadi ikut menyesuaikan saat jendela
  diubah. Contoh: poster 1080×1920 pada area ≈ 660×690 px tampil di ±36%.
- **Mode manual:** tombol **−** / **+** melangkah di preset 5, 10, 15, 20, 25, 33,
  50, 67, 75, 100, 125, 150, 200, 300, 400% (dari nilai Fit mana pun ke preset
  terdekat berikutnya); klik label persen = **100%** (ukuran asli); **Ctrl/Cmd +
  scroll** (dan cubit di trackpad) zoom mulus; **Fit** kembali ke mode Fit. Titik
  tengah area tampil dipertahankan saat zoom. Rentang 5–400%.
- **Otomatis kembali ke Fit** saat: dokumen dimuat (Import JSON Polotno/native atau
  template — lewat `loadRevision`, juga bila ukurannya kebetulan sama), ukuran kanvas
  diubah di tab Kanvas, atau tombol Fit ditekan. Zoom manual tidak diubah oleh
  perubahan ukuran jendela.
- **Export tidak terpengaruh zoom.** `exportStageAsImage` mengembalikan Stage ke
  skala 1 dan ukuran desain, mengekspor, lalu memulihkan zoom, scroll, dan
  seleksi dalam `finally`. Poster 1080×1920 yang sedang tampil 31% tetap
  menghasilkan 1080×1920 × `pixelRatio` (2160×3840 pada 2x). Ukuran desain diberikan
  `ActionPanel` dari store, bukan dibagi balik dari ukuran Stage yang sudah
  dibulatkan.
- **Overlay edit teks** berada di `.overlay-layer` yang seukuran desain dan diberi
  `transform: scale(zoom)` yang sama dengan Stage, sehingga `<textarea>` tepat di
  atas teks pada zoom berapa pun.
- **Ukuran minimum Transformer** (`boundBoxFunc`, 10 px desain) dikalikan `zoom`,
  karena — menurut dugaan saya, belum diverifikasi dengan Konva sungguhan — Konva
  memberi kotak itu dalam piksel layar.

Berkas: `lib/zoom.ts` (fungsi murni: `fitZoom`, `stepZoom`, `clampZoom`,
`scaledSize`), `lib/useCanvasZoom.ts` (hook), `components/ZoomControls.tsx`.
Belum ada: geser (*pan*) dengan seret/spasi (pakai scrollbar atau trackpad) dan
shortcut `Ctrl+0`.

---

## Edit teks langsung (In-Place Text Editing)

Konva menggambar teks pada `<canvas>`, yang tidak bisa menerima input keyboard.
Karena itu, saat teks di-**double-click** (atau double-tap), sebuah `<textarea>`
HTML ditempatkan tepat di atas node teks (`TextEditorOverlay.tsx`).

Alur:

1. `ElementRenderer` memanggil `setEditingId(id)` pada `onDblClick`/`onDblTap`.
2. Node Konva disembunyikan (`visible={!isEditing}`) supaya teks tidak tergambar
   dua kali, dan Transformer dilepas dari node itu.
3. `TextEditorOverlay` merender `<textarea>` di dalam `.overlay-layer` (di dalam
   `.stage-wrap`, seukuran desain dan diskalakan sama dengan Stage) pada koordinat
   `(x, y)` elemen, dengan `rotate(rotation)`.
4. Gaya Konva disalin ke CSS textarea:

   | Properti elemen | CSS textarea |
   |---|---|
   | `fontSize` | `font-size` |
   | `fontFamily` | `font-family` |
   | `fontStyle` (`bold`/`italic`) | `font-weight` / `font-style` |
   | `lineHeight` | `line-height` |
   | `align` | `text-align` |
   | `fill` | `color` |
   | `width` | `width` (tinggi menyesuaikan isi lewat `scrollHeight`) |

5. Teks langsung terseleksi semua, jadi mengetik menggantikan teks placeholder.
6. Mode edit berakhir saat **Enter**, **Esc**, atau **blur** (klik di luar).
   Nilai textarea ditulis ke store lewat `updateElement`, `editingId` dikosongkan,
   dan node Konva muncul kembali. `Shift+Enter` membuat baris baru.

Detail penting:

- **Shortcut global tidak mengganggu pengetikan.** Ada tiga lapis pengaman:
  `onKeyDown` textarea memanggil `stopPropagation()`; handler global di
  `CanvasWorkspace` langsung `return` bila `editingId` terisi; dan handler itu
  juga mengabaikan event dari `input`/`textarea`/`select`. Akibatnya `Backspace`
  menghapus karakter, bukan elemen.
- **Rotasi:** Konva memutar node di sekitar sudut kiri-atasnya, sedangkan CSS
  memutar di tengah. Kelas `.text-editor` karena itu memakai
  `transform-origin: 0 0`; tanpanya textarea bergeser puluhan piksel pada elemen
  yang diputar.
- **Tanpa pergeseran:** textarea memakai `padding: 0`, `border: 0`, dan bingkai
  putus-putus digambar dengan `outline` (bukan `border`), sehingga teks tidak
  bergeser dibanding node yang digantikannya.
- **Teks kosong dihapus.** Jika hasil edit hanya berisi spasi, elemen dihapus
  (langkah ini bisa di-undo), karena kotak teks kosong tak terlihat dan tak bisa
  diklik lagi.
- **Esc menyimpan**, bukan membatalkan. Untuk membatalkan perubahan, tekan
  `Ctrl+Z` setelah selesai.
- **Input IME** (aksara non-Latin) aman: tombol Enter yang dipakai memilih kandidat
  tidak ikut mengakhiri edit.
- **Zoom:** koordinat overlay tetap dalam piksel desain; lapisan `.overlay-layer`
  yang menerapkan `scale(zoom)`. Diuji di Chromium: posisi dan lebar `<textarea>`
  = nilai desain × zoom (selisih < 0,6 px) pada beberapa zoom.

---

## Copy & Paste elemen (Ctrl+C / Ctrl+V)

State sementara `clipboard: CanvasElement | null` disimpan di store.

- **`Ctrl/Cmd+C`** → `copySelected()` menyalin data elemen aktif (`selectedId`)
  ke `clipboard`.
- **`Ctrl/Cmd+V`** → `pasteClipboard()`:
  1. memanggil `recordHistoryNow()` (satu langkah undo),
  2. menduplikasi elemen dengan **id baru**,
  3. menggeser posisinya **+20, +20** dari yang disalin,
  4. memberinya `zIndex` teratas dan langsung memilihnya.
- Setelah menempel, `clipboard` memperbarui dirinya ke posisi hasil tempel, jadi
  `Ctrl+V` berulang **berundak** (+20, +40, +60, …) dan tidak menumpuk di satu titik.
- Salinan sepenuhnya independen dari aslinya; mengubah satu tidak memengaruhi yang lain.
- `clipboard` tidak ikut history: `Ctrl+Z` menghapus hasil tempel, tetapi
  `Ctrl+V` berikutnya tetap bisa menempel lagi.
- Shortcut hanya diambil alih bila ada elemen terpilih (untuk `C`) atau clipboard
  berisi (untuk `V`), dan tidak aktif saat mengetik di textarea/input — jadi
  menyalin teks halaman biasa tetap berfungsi.
- Batasan: clipboard internal editor, bukan clipboard sistem; elemen tidak bisa
  ditempel ke tab/jendela lain.

---

## Sistem Undo / Redo (History Stack)

### Struktur data

```ts
interface HistorySnapshot {
  canvas: CanvasMeta;
  elements: CanvasElement[];
}

past: HistorySnapshot[];    // state SEBELUM perubahan terakhir
future: HistorySnapshot[];  // state yang baru di-undo, siap di-redo
```

Pola **linear undo stack** yang dipakai hampir semua editor:

- Setiap perubahan dokumen men-*push* snapshot **sebelum** perubahan ke `past`.
- `undo()` mem-*pop* snapshot teratas `past` menjadi state aktif, dan mem-*push*
  state sebelum undo ke `future`. `redo()` kebalikannya.
- Perubahan BARU setelah undo mengosongkan `future` (cabang redo lama tak valid lagi).
- `past`/`future` dibatasi `MAX_HISTORY = 50` snapshot.
- Snapshot adalah **structural clone** (`cloneSnapshot()`), bukan referensi, agar
  mutasi berikutnya tidak merusak snapshot yang tersimpan.

### Perubahan kontinu vs. diskrit

- **Diskrit** (`addTextElement`, `addShapeElement`, `addImageElement`,
  `replaceImageSource`, `removeElement`, `reorderElement`, `pasteClipboard`,
  `loadFromJSON`, `reset`) → `recordHistoryNow()`: snapshot langsung di-push.
- **Kontinu** (drag, resize, rotate — termasuk pada **gambar** —, input toolbar,
  menyimpan hasil edit teks) → `updateElement` →
  `recordHistoryDebounced(elementId)`: snapshot "sebelum"
  diambil **sekali** di awal batch, lalu timer 500 ms di-reset setiap ada
  perubahan baru; batch "disegel" ke `past` setelah 500 ms tenang. Hasilnya
  **satu gestur = satu langkah undo**.
- `batchKey` = id elemen: drag elemen A lalu langsung drag elemen B tetap jadi
  dua langkah undo.
- Pengaturan kanvas (`setCanvasMeta`) juga kontinu, dengan `batchKey = "canvas"`:
  menggeser pemilih warna latar, atau mengubah lebar lalu tinggi berturut-turut,
  menjadi satu langkah undo, dan `Ctrl+Z` mengembalikan ukuran sebelumnya.
- `undo()`/`redo()` menyegel batch yang sedang berjalan lebih dulu, jadi Undo
  terasa instan.
- `syncMeasuredHeight` (bookkeeping tinggi teks) sengaja **tidak** mencatat history.

`undo`, `redo`, `removeElement`, dan `loadFromJSON` juga mengosongkan
`editingId`, supaya overlay edit tidak tertinggal untuk elemen yang sudah hilang.

---

## Export ke Gambar (PNG / JPG)

`src/lib/exportImage.ts` (`exportStageAsImage`) memanggil `stage.toDataURL()`:

1. `CanvasWorkspace` mendaftarkan Stage aktif ke store (`stageNode`), sehingga
   `ActionPanel` bisa mengekspor tanpa prop-drilling.
2. Sebelum rasterisasi, handle **Transformer** dilepas sementara dan kanvas
   di-*redraw* **sinkron** (`stage.draw()`, bukan `batchDraw()`), supaya kotak
   seleksi tidak ikut masuk gambar; seleksi dikembalikan sesudahnya.
3. `pixelRatio` 1x/2x/3x menentukan resolusi. Ukuran hasil = **ukuran desain
   (`canvas` di store) × pixelRatio** — jadi mengubah ukuran kanvas di tab
   **Kanvas** langsung mengubah hasil export (900×600 pada 2x → 1800×1200;
   1200×675 pada 2x → 2400×1350). Panel kanan menampilkan angka itu sebelum Anda
   menekan tombol export. Zoom tampilan tidak berpengaruh: sebelum rasterisasi
   Stage dikembalikan ke skala 1 pada ukuran desain, dan sesudahnya (juga bila
   gagal) zoom, posisi scroll, dan seleksi dipulihkan.
4. **Batas aman:** browser membatasi ukuran `<canvas>`, dan `toDataURL()` yang
   kebesaran tidak melempar error — ia diam-diam mengembalikan gambar kosong.
   `resolveExportPixelRatio` (`lib/workspace.ts`) karena itu menurunkan
   `pixelRatio` bila sisi terpanjang hasil melebihi 8192 px (kanvas 4000×3000
   pada 3x diturunkan menjadi 2,04x), dan pengguna diberi tahu.
5. JPG memakai `quality: 0.92`; latar belakang kanvas selalu opak sehingga tidak
   ada lubang transparan.
6. Kegagalan ditangani, bukan didiamkan: handle Transformer dikembalikan dalam
   `finally` meski export gagal; gambar kosong terdeteksi dan dilaporkan; dan
   gambar dari situs lain yang tidak mengizinkan CORS (membuat canvas
   "tercemar" sehingga `toDataURL()` melempar `SecurityError`) menghasilkan
   pesan yang jelas, bukan layar kosong.

---

## Skema Dokumen JSON Native (v2)

Format bawaan (`exportToJSON("kusuka")`), didefinisikan di `src/types/editor.ts`.

**Model koordinat (sama untuk semua tipe elemen):** `(x, y)` adalah sudut
**kiri-atas** kotak elemen; `rotation` dalam derajat searah jarum jam di sekitar
sudut itu; `zIndex` lebih besar = lebih depan.

```jsonc
{
  "version": 2,                 // versi skema (lihat "Migrasi v1 → v2")
  "canvas": {
    "width": 900,
    "height": 600,
    "backgroundColor": "#ffffff"
  },
  "elements": [
    {
      "id": "uuid",
      "type": "text",           // "text" | "shape" | "image"
      "x": 190, "y": 80,
      "width": 520,
      "height": 57.6,           // tinggi hasil ukur Konva (otomatis dari isi teks)
      "rotation": 0,
      "zIndex": 1,

      // -- khusus type: "text" --
      "text": "Judul Poster Saya",
      "fontSize": 48,
      "fontFamily": "Inter, sans-serif",
      "fill": "#111111",
      "align": "center",        // "left" | "center" | "right"
      "fontStyle": "bold",      // "normal" | "bold" | "italic" | "bold italic"
      "lineHeight": 1.2,        // kelipatan fontSize
      "widthTolerance": 10      // OPSIONAL: px yang ditambahkan ke width saat impor Polotno (lihat "Toleransi lebar kotak teks")
    },
    {
      "id": "uuid",
      "type": "shape",
      "shapeType": "rect",      // "rect" | "circle"
      "x": 200, "y": 250, "width": 200, "height": 140, "rotation": 15, "zIndex": 2,

      // -- khusus type: "shape" --
      "fill": "#6366f1",        // boleh "transparent"
      "stroke": "#312e81",
      "strokeWidth": 2,
      "cornerRadius": 4         // hanya dipakai oleh "rect"
    },
    {
      "id": "uuid",
      "type": "image",
      "x": 120, "y": 80, "width": 320, "height": 180, "rotation": 0, "zIndex": 3,

      // -- khusus type: "image" --
      "src": "data:image/png;base64,...",   // data: (hasil export), https:// (hasil import Polotno), atau blob: (sementara)
      "cropX": 0, "cropY": 0,               // bagian gambar yang terlihat, sebagai PECAHAN (0..1)
      "cropWidth": 1, "cropHeight": 1,      // 0,0,1,1 = seluruh gambar diregangkan ke kotak elemen
      "scaleX": 1, "scaleY": 1,             // -1 = dicerminkan di DALAM kotaknya (kotak tidak berpindah); hanya tanda yang disimpan
      "vector": false                       // OPSIONAL: true = SVG (ikon); ditulis kembali ke Polotno sebagai "svg"
    }
  ]
}
```

Contoh lengkap: [`examples/sample-design.json`](./examples/sample-design.json).

### Migrasi v1 → v2

Versi awal editor menyimpan **lingkaran berdasarkan titik tengahnya** (kebiasaan
`Circle` di Konva), sementara elemen lain berdasarkan sudut kiri-atas. Skema v2
menyeragamkannya (lingkaran digambar dengan `Ellipse` + `offset`), yang juga
memudahkan konversi ke Polotno. File `version: 1` **dimigrasi otomatis** saat
dimuat: titik tengah lingkaran dipertahankan persis, juga pada lingkaran yang
diputar, dan pengguna melihat peringatan "posisi N lingkaran dimigrasi".
Field yang belum ada di v1 diisi default (`fontStyle: "normal"`,
`lineHeight: 1`, `cornerRadius: 4` untuk persegi).

### Validasi saat memuat

Berkas dibersihkan (`sanitizeKusukaDocument`): angka dan warna dinormalisasi,
field yang hilang diisi default (gambar: `scaleX/scaleY` selain `-1` menjadi `1`;
`vector` hanya diterima bila `true`; `widthTolerance` dibatasi 0–100), id kosong/duplikat diganti id baru, dan elemen
yang tidak valid dilewati dengan peringatan. Berkas bertanda `version` lebih
baru dari yang didukung editor **ditolak** dengan pesan yang jelas.

---

## Adapter Polotno (Import & Export dua arah)

`src/lib/polotnoAdapter.ts` — fungsi murni (tanpa DOM/React/store), sehingga bisa
diuji di Node biasa.

| Fungsi | Peran |
|---|---|
| `detectFormat(data)` | `"kusuka"` bila ada `canvas` + `elements`; `"polotno"` bila ada `pages[]`; selain itu `"unknown"` |
| `parseDocument(input)` | Pintu masuk tunggal: menerima string/objek **format apa pun**, mendeteksi formatnya, mengembalikan dokumen native tervalidasi + `warnings`. Dipakai `loadFromJSON`, tombol Import, dan galeri template |
| `convertPolotnoToKusuka(doc)` | `{ pages: [{ children }] }` → `CanvasDocument` native |
| `convertKusukaToPolotno(doc)` | `CanvasDocument` → dokumen Polotno |
| `sanitizeKusukaDocument(raw)` | Validasi + migrasi file native |

### Import: Polotno → native

| Polotno | Native |
|---|---|
| `width`/`height` dokumen (atau milik halaman; `"auto"` = ikut dokumen) | `canvas.width` / `canvas.height` |
| `pages[0].background` | `canvas.backgroundColor` |
| urutan `children` (pertama = paling bawah) | `elements[]`, `zIndex = posisi + 1` |
| teks: `fill` (cadangan: `color`) | `fill` |
| teks: `fontFamily` (`"Georgia"`) | `fontFamily` (`"Georgia, serif"`) |
| teks: `fontWeight` ≥ 600/`"bold"` + `fontStyle: "italic"` | `fontStyle` (`"bold italic"`, …) |
| teks: `align` (`justify` → `left`; default Polotno `center`) | `align` |
| teks: `lineHeight` (default 1.2); `height` 0 | `lineHeight`; tinggi dihitung `fontSize × lineHeight` |
| teks: `text` berisi HTML (`<p>`, `<span>`, `</p><p>`, `<br>`) | `text` polos, baris dipisah `\n` — lihat "Pembersih teks HTML" |
| teks: `width` | `width + 10`, `x` digeser mundur menurut `align`, `widthTolerance: 10` — lihat "Toleransi lebar kotak teks" |
| `figure` `subType`: `rect` / `circle` (`ellipse` juga diterima) | `shape` `shapeType: "rect"` / `"circle"` |
| `figure` `fill`, `stroke`, `strokeWidth`, `cornerRadius` | field bernama sama |
| `image`: `src` | `image.src` (URL `https://`, `data:`; `blob:` diberi peringatan karena sudah mati) |
| `image`: `cropX`/`cropY`/`cropWidth`/`cropHeight` | field bernama sama (pecahan 0..1; di luar rentang → seluruh gambar + peringatan) |
| `svg`: `src` (URL atau data URI), crop, `colorsReplace` | `image` dengan `vector: true` — lihat "Elemen SVG / vektor" |
| `image`/`svg`: `flipX`, `flipY`, (juga `scaleX`/`scaleY` negatif) | `scaleX` / `scaleY` = `-1` — lihat "Pencerminan" |
| `x`, `y`, `width`, `height`, `rotation` (semua tipe) | disalin apa adanya — dua pengecualian yang dikompensasi: skala negatif dan toleransi lebar teks (lihat "Titik jangkar") |

> **Soal `color`:** pada skema Polotno, warna teks adalah properti **`fill`**;
> skemanya tidak punya properti `color`
> ([text element](https://polotno.com/docs/schema/text-element)). Adapter
> karena itu membaca `fill` lebih dulu dan memakai `color` hanya sebagai cadangan
> untuk berkas dari sumber lain.

Warna dinormalisasi ke `#rrggbb` (`rgb(220, 38, 38)`, `rgba(...)`, `hsl(...)`,
`white`, `#fff` semuanya diterima); alpha dibuang kecuali transparan penuh, yang
disimpan sebagai `"transparent"`. Warna yang tidak bisa dibaca (gradien, pola,
nama tak dikenal) tidak membuat impor gagal: dipakai warna bawaan dan dihitung
dalam satu peringatan.

Urutan memilih warna **teks**: `fill` dipakai bila terbaca; bila `fill` tidak ada
atau tidak terbaca, `color` dipakai; bila keduanya tidak bisa dipakai, teks
hitam (`#000000`) dan — hanya bila salah satunya memang diisi — peringatan
dihitung. Jadi `fill` gradien yang diselamatkan oleh `color` yang valid tidak
memunculkan peringatan palsu.

### Pembersih teks HTML

Sebagian berkas Polotno membawa teks kaya sebagai HTML di `text`
(`<p><span style="…">Halo</span></p><p>Dunia</p>`). `Konva.Text` menggambar string
polos, jadi tanpa pembersihan tag itu tercetak mentah di kanvas. Skema Polotno
([text element](https://polotno.com/docs/schema/text-element)) hanya menyebut `text`
sebagai "Visible text shown on canvas" dan tidak mendokumentasikan HTML; ini
ditangani karena berkas semacam itu ada. `cleanPolotnoText(raw)` mengembalikan
`{ text, styled }`:

| Masukan | Hasil |
|---|---|
| `<p>SALE</p>` | `SALE` |
| `<p>Baris 1</p><p>Baris 2</p>` | `Baris 1\nBaris 2` |
| `<p>A<br>B</p>`, `<br/>`, `<br />`, `<BR>` | `A\nB` |
| `<p>A</p><p><br></p><p>B</p>` | `A\n\nB` (paragraf kosong = baris kosong) |
| `<p>A<br></p>` | `A` (`<br>` penutup paragraf tidak terlihat di HTML) |
| `<p>A</p>\n   <p>B</p>` | `A\nB` (indentasi antar-tag bukan teks) |
| `<p><span style="color:red"><strong>Mega</strong> SALE</span></p>` | `Mega SALE` |
| `<p>Tom &amp; Jerry &lt;3 &#169;</p>` | `Tom & Jerry <3 ©` |

Aturannya:

- Hanya tag dari **daftar tetap** (blok: `p div h1–h6 li ul ol blockquote pre …`;
  inline: `span b strong i em u s a font sub sup mark …`; `br`) yang dibuang. Teks tanpa
  tag dikenal **tidak disentuh** selain newline (`\r\n`, `\r`, U+2028/2029 → `\n`):
  `Halo <nama>`, `a < b && c > d`, dan `1<2` tetap persis seperti ditulis.
- Tag blok beserta spasi di sekitarnya menjadi **batas paragraf**; beberapa batas
  berurutan = satu `\n`, batas di awal/akhir tidak menambah apa pun. Jadi `</p><p>` →
  satu `\n`, tanpa `\n` ganda dan tanpa `\n` tersisa di ujung.
- Nilai atribut berkutip boleh memuat `>` (`style="background:url(a>b)"`); komentar
  HTML dan isi `<style>`/`<script>` dibuang.
- Entitas (`&amp; &lt; &gt; &quot; &nbsp; &#169; &#x41;` dan beberapa nama umum)
  didekode **satu kali** (`&amp;lt;` → `&lt;`), dan hanya pada teks yang memang HTML;
  `&nbsp;` menjadi spasi biasa. Entitas tak dikenal dibiarkan.
- Format per bagian (kata tebal, warna berbeda, tautan, sub/superskrip) **tidak bisa
  dibawa** — satu `Konva.Text` punya satu gaya. Itu dihitung dan dilaporkan satu kali
  (`N teks berformat per bagian … diubah menjadi teks polos`). Tag struktural saja
  (`<p>`, `<br>`) tidak memunculkan peringatan.
- File **native** tidak pernah dibersihkan: yang diketik pengguna, termasuk `<p>`,
  tetap teks biasa.

### Elemen SVG / vektor

Ikon dan panah di Polotno adalah elemen `svg` dengan `src` berupa URL atau data URI
([svg element](https://polotno.com/docs/schema/svg-element)). Dulu elemen ini
dilewati; sekarang dipetakan ke `ImageElement` dengan `vector: true`, sehingga
dimuat dan digambar lewat jalur yang sama dengan gambar (`drawImage` langsung ke
kotak, tanpa crop bila utuh — itu yang membuat SVG tetap tajam di ukuran berapa
pun).

- `src` (URL `https://` atau data URI) disalin apa adanya; `x, y, width, height,
  rotation`, crop (pecahan 0..1), dan `flipX/flipY` diperlakukan seperti gambar.
- **`colorsReplace`** (peta warna asal → pengganti) diterapkan bila `src` adalah
  **data URI SVG** (terenkode persen atau base64): satu lintasan atas teks SVG,
  jadi `A→B` lalu `B→C` tidak berantai dan `#fff` tidak cocok dengan awal
  `#ffffff`; nilai pengganti hanya boleh berupa sintaks warna. Untuk `src` berupa
  tautan, berkasnya bukan milik kita untuk dibaca — warna asli dipakai dan hal itu
  dilaporkan.
- `maskSrc`, `borderSize`, `cornerRadius`, dan efek lain dihitung sebagai "efek yang
  belum didukung". SVG tanpa `src` dilewati dengan peringatan.
- **Export:** `vector: true` ditulis sebagai `type: "svg"`; gambar biasa tetap
  `image` — jenisnya diingat, bukan ditebak dari nama berkas. Berkas SVG yang
  diunggah lewat tombol Unggah gambar juga ditandai `vector`.
- Tipe lain yang belum didukung (`video`, `gif`, garis, …) tetap dilewati dan
  dilaporkan; hanya `svg` yang ditambahkan.

### Pencerminan (flip / skala negatif)

Polotno menandai cermin dengan boolean `flipX` / `flipY` pada elemen `image` dan
`svg`; elemen `text` tidak punya `flipX/flipY` maupun skala
([image](https://polotno.com/docs/schema/image-element),
[text](https://polotno.com/docs/schema/text-element)). Di sini cermin disimpan di
`ImageElement.scaleX` / `scaleY` (nilainya `1` atau `-1`; ukuran tetap di
`width`/`height`).

- **Flag `flipX/flipY`:** gambar dicerminkan **di dalam kotaknya**; `x, y, width,
  height` tidak berubah, jadi gambar terbalik tetap di batas posisi visual aslinya.
- **Skala negatif gaya Konva** (`scaleX < 0` / `scaleY < 0`; ini di luar skema
  Polotno, dibaca karena diminta): skala bekerja di sekitar titik asal `(x, y)`,
  sehingga skala negatif mendorong gambar ke kiri/atas titik itu. Adapter
  memindahkan `(x, y)` ke sudut kiri-atas bagian yang **terlihat**, mengalikan
  `width/height` dengan |skala|, dan menyimpan tanda sebagai `-1`:

  ```
  (x', y') = (x, y) + R(rotation) · ( sx<0 ? −w·|sx| : 0 ,  sy<0 ? −h·|sy| : 0 )
  ```

  `R` memutar vektor itu bersama rotasi elemen, jadi kompensasinya benar juga pada
  gambar yang diputar. Diuji sebagai *property test*: 36 kombinasi rotasi × skala,
  keempat sudut kotak yang terlihat harus identik dengan sumbernya.
- `flipX: true` bersama `scaleX < 0` saling meniadakan (dicerminkan dua kali =
  tidak dicerminkan), tetapi pergeseran titik asal tetap berlaku; skala `0`
  diabaikan agar gambar tidak lenyap.
- **Teks:** tidak bisa dicerminkan; skala/flip pada teks diabaikan dan **dilaporkan**.
  **Persegi/lingkaran** yang dicerminkan tampak sama, jadi tidak diapa-apakan dan
  tidak dilaporkan.
- **Export:** `scaleX = -1` → `flipX: true` (dan `scaleY` → `flipY`).

**Cara digambar.** `ElementRenderer` **tidak** memberi node Konva skala negatif.
`drawPicture` (`lib/drawPicture.ts`) menggambar dengan `translate(w, 0)` lalu
`scale(-1, 1)` (dan setara untuk sumbu Y) di dalam kotak elemen; node itu sendiri
selalu berskala positif. Alasannya kehati-hatian: Transformer menulis ulang
`rotation`/`scale` dari sebuah matriks, dan menurut pembacaan saya atas
algoritmanya, untuk node yang sudah berskala negatif hasilnya bisa berupa cermin di
sumbu lain ditambah 180° — itu akan merusak gambar terbalik setelah diputar atau
diubah ukurannya. Menggambar cermin sendiri tidak punya kasus itu. Logika gambarnya
diuji **per piksel di Chromium** (4×2 petak berwarna): `flipX`, `flipY`, keduanya,
dengan rotasi, dengan crop, dan SVG.

### Toleransi lebar kotak teks

Polotno mengukur kotak teks dengan fontnya; browser ini bisa menggambar font yang
sama (atau cadangannya, bila font belum terpasang) beberapa piksel lebih lebar, dan
kata yang tak lagi muat turun baris ("SAL" / "E"). Karena itu setiap teks hasil
impor Polotno diberi `TEXT_WIDTH_TOLERANCE = 10` px:

- `width` ← `width + 10`; kotak tumbuh ke kanan, jadi `x` digeser mundur sepanjang
  sumbu-x kotak (ikut rotasi) sebesar bagian yang sesuai `align`: `left` 0, `center`
  5 px, `right` 10 px. **Teksnya sendiri tidak berpindah** (diuji: titik tengah-atas
  kotak yang diputar 12,5° tetap sama).
- Nilainya disimpan di `TextElement.widthTolerance`. **Export ke Polotno
  mengurangkannya lagi** (`x`, `y`, `width` kembali persis, diuji), dan teks yang
  diekspor editor ini diberi `custom.source = "kusukaedit"` bila lebarnya diukur
  di sini — sehingga impor berikutnya tidak menambah 10 px lagi (kotak tidak
  membengkak tiap siklus).
- Mengubah lebar teks dengan Transformer menjadikan `widthTolerance` 0: lebar yang
  dipilih pengguna adalah lebar yang pasti.
- Kotak berlebar 0 tidak diberi toleransi.
- Alternatif `wrap: "none"` **tidak** dipakai: itu mematikan pembungkusan paragraf
  yang memang dimaksudkan Polotno.
- Batas: adapter murni (tanpa DOM) sehingga tidak mengukur font; 10 px adalah nilai
  tetap. Font cadangan yang jauh lebih lebar masih bisa memecah kata.

### Struktur bertingkat → array datar

Polotno menyimpan `pages: [{ children: [...] }]`; editor ini menyimpan satu
array `elements` yang rata. `convertPolotnoToKusuka(doc, { pageIndex })` memilih
satu halaman (default halaman pertama; halaman lain dilaporkan), lalu membaca
`children` **berurutan**: elemen pertama = paling bawah, sehingga `zIndex =
posisi + 1` dan urutan tumpukan identik dengan Polotno. Elemen yang dilewati
(tersembunyi, tipe tak didukung, grup) tidak meninggalkan celah pada `zIndex`.

Elemen bertipe **`group`** (yang membawa `children` sendiri) **tidak diratakan**.
Cara koordinat anak grup berhubungan dengan grupnya belum dipastikan dari
dokumentasi, dan tebakan yang salah akan menggeser seluruh isi grup, jadi grup
dilewati dengan peringatan yang menyebut jumlah elemen di dalamnya (`grup
(berisi N elemen; pisahkan grup di Polotno sebelum mengekspor)`). Solusinya:
*ungroup* di Polotno sebelum mengekspor.

### Titik jangkar koordinat (X, Y)

Model koordinat native: `(x, y)` = sudut **kiri-atas** kotak elemen, `rotation`
berputar di sekitar sudut itu — untuk **semua** tipe elemen. Itu sama dengan model
Polotno dan dengan perilaku bawaan node Konva, sehingga adapter **tidak
menggeser** apa pun: `x`, `y`, `width`, `height`, `rotation` disalin apa adanya
(termasuk nilai pecahan dan negatif), di kedua arah. Pengecualiannya hanya dua,
keduanya **dikompensasi agar posisi visual tidak berubah**: gambar berskala negatif
(titik asal dipindah ke sudut kiri-atas yang terlihat — lihat "Pencerminan") dan
teks yang kotaknya diberi toleransi (lihat "Toleransi lebar kotak teks"). Dua hal
lain yang perlu penyeragaman, dan sudah ditangani:

- **Lingkaran/elips** — `Ellipse` Konva berpusat di titik tengahnya. `ElementRenderer`
  memberi `offsetX/offsetY = -width/2, -height/2` sehingga `(x, y)` kembali berarti
  sudut kiri-atas, sama seperti persegi dan teks. (File native `version: 1`
  masih menyimpan titik tengah; itu dimigrasi, lihat bagian di bawah.)
- **Teks** — Polotno menghitung tinggi teks otomatis dan bisa menulis `height: 0`.
  Adapter menggantinya dengan `fontSize × lineHeight` agar kotaknya nyata;
  posisi `(x, y)` tidak berubah.

Test `adapter: (x, y) is the top-left corner for every type` memeriksa kesamaan
`x, y, width, height, rotation` untuk gambar, persegi, dan elips yang diputar, dan
bahwa titik jangkar teks (tengah-atas kotak, ikut rotasi) tidak bergeser, pada impor
maupun export.

**Yang tidak dipetakan — selalu disertai peringatan di UI, tidak pernah gagal diam-diam:**

- Dokumen multi-halaman: hanya halaman 1 yang diimpor (editor ini satu halaman).
- Elemen bertipe lain (`video`, `gif`, …), **grup** (`group`; lihat di atas), dan
  bentuk selain persegi/lingkaran (bintang, segitiga, …) dilewati.
- Efek: `opacity` < 1, bayangan, blur, filter, stroke teks, `letterSpacing`,
  `textDecoration`, `textTransform`, `dash` (dan pada gambar/SVG: `cornerRadius`,
  `clipSrc`, `maskSrc`, `borderSize`). Elemennya tetap diimpor, tampilannya bisa
  sedikit berbeda.
- Format per bagian pada teks HTML (lihat "Pembersih teks HTML"); `colorsReplace` yang
  tidak bisa diterapkan; skala/flip pada teks.
- Gambar tanpa `src` dilewati; gambar `blob:` diimpor tetapi diberi peringatan
  (URL itu mati begitu halaman asalnya ditutup, jadi tampil sebagai kotak kosong).
- Latar halaman berupa gradien/gambar → dipakai putih.
- Elemen `visible: false` dibuang (tidak terlihat di Polotno juga).

### Export: native → Polotno

`convertKusukaToPolotno` membungkus state aktif menjadi:

```jsonc
{
  "schemaVersion": 4, "width": 900, "height": 600, "unit": "px", "dpi": 72,
  "fonts": [],
  "pages": [{
    "id": "page-1", "width": "auto", "height": "auto",
    "background": "#ffffff", "bleed": 0, "duration": 5000,
    "children": [ /* diurutkan menurut zIndex, paling bawah dulu */ ]
  }],
  "audios": []
}
```

Polotno tidak punya `zIndex`: urutan tumpukan **adalah** urutan array, sehingga
export mengurutkan elemen berdasarkan `zIndex` (stabil). Teks diekspor sebagai
`type: "text"` (warna di `fill`, tidak ada properti `color`), bentuk sebagai
`type: "figure"` dengan `subType` `rect`/`circle`, gambar sebagai `type: "image"`
(atau `"svg"` bila `vector`) dengan `src`, crop, `flipX`/`flipY` dari
`scaleX`/`scaleY`, dan `cornerRadius: 0`, serta nilai default Polotno
(`opacity: 1`, `visible: true`, dst.) ditulis eksplisit. Gambar yang berasal dari
upload sudah berupa `data:` URL pada saat ini (lihat "Upload gambar"), jadi file
Polotno hasil export tetap utuh.

Pemilihan format ada di panel kanan (`ActionPanel`): tombol **Native | Polotno**
menentukan format unduhan; tombol **Import JSON** selalu mendeteksi format dari
isi berkas (bukan dari nama file).

### Kompatibilitas: apa yang sudah dan belum dipastikan

- Nama properti, nilai default, `schemaVersion: 4`, dan struktur halaman dicocokkan
  dengan dokumentasi skema Polotno
  ([store](https://polotno.com/docs/schema/store),
  [text](https://polotno.com/docs/schema/text-element),
  [figure](https://polotno.com/docs/schema/figure-element)). `circle` adalah nilai
  `subType` yang tercantum pada
  [daftar figur yang didukung](https://polotno.com/docs/element).
- Native → Polotno → native **tanpa kehilangan data** (diuji pada semua template
  dan contoh).
- Polotno → native → Polotno **tidak** mengembalikan properti yang tidak dipetakan
  (animasi, filter, bayangan, …): editor ini hanya menyimpan subset yang
  didukungnya.
- **Terverifikasi** terhadap halaman skema Polotno
  ([image](https://polotno.com/docs/schema/image-element),
  [svg](https://polotno.com/docs/schema/svg-element),
  [text](https://polotno.com/docs/schema/text-element)): elemen `image` dan `svg`
  punya `src` (URL atau data URI), `cropX/cropY/cropWidth/cropHeight` (dideskripsikan
  sebagai pecahan 0..1), `flipX`/`flipY` (boolean), `keepRatio`, `borderColor/Size`,
  `cornerRadius`; `svg` juga punya `maskSrc` dan `colorsReplace`; `text` **tidak**
  punya `flipX/flipY` atau skala.
- **Masih belum diverifikasi** (halaman-halaman itu tidak menjelaskannya, dan
  `group-element` belum bisa diambil): (1) pecahan crop itu relatif terhadap
  **ukuran asli** gambar — inilah yang diasumsikan; nilai yang tidak bisa berupa
  pecahan ditolak dengan peringatan, bukan ditebak; (2) bagaimana `flipX/flipY`
  diterapkan terhadap kotak dan rotasi — diasumsikan mencerminkan di dalam kotak,
  lalu diputar di sudut kiri-atas, seperti Konva; (3) bahwa `(x, y)` adalah sudut
  kiri-atas dan rotasi berputar di sana — dasar asumsi "titik jangkar" di atas; (4)
  cara koordinat anak `group` berhubungan dengan grupnya — karena itu grup dilewati;
  (5) HTML pada `text` tidak didokumentasikan sama sekali. Bila Anda punya contoh
  berkas Polotno bergambar/berflip/berteks HTML, asumsi ini bisa dipastikan atau
  dikoreksi dengan cepat.
- Berkas hasil export **belum pernah dibuka di editor Polotno yang asli**. Untuk
  memastikannya, muat berkas itu dengan `store.loadJSON(...)` di
  [polotno.com](https://polotno.com/) atau proyek Polotno SDK Anda. Pada
  lingkaran yang `width ≠ height`, cara Polotno menggambarnya belum diverifikasi.

---

## Template (galeri preset)

Tab **Template** di panel kiri menampilkan kartu berisi thumbnail, nama, dan
lencana format file (Native / Polotno). Preset disimpan di repositori sebagai
berkas JSON di `src/templates/`, **dalam kedua format**:

| Berkas | Format | Ukuran |
|---|---|---|
| `poster-acara.kusuka.json` | Native | 900×600 |
| `kartu-kutipan.kusuka.json` | Native | 900×600 |
| `promo-diskon.polotno.json` | Polotno | 900×600 |
| `post-sosmed.polotno.json` | Polotno | 600×600 |

Cara kerja:

1. `TemplatePanel` melewatkan setiap template melalui `parseDocument()`, yang
   **mendeteksi formatnya** — registry tidak perlu tahu format tiap berkas.
2. Dokumen hasil konversi digambar sebagai thumbnail SVG
   (`TemplateThumbnail.tsx`). Karena digambar dari dokumen *setelah* adapter,
   thumbnail selalu sinkron dengan berkas template, dan untuk template Polotno
   sekaligus memperlihatkan hasil konversinya.
3. Klik kartu → `loadFromJSON(entry.data)`: pemetaan ke store bersifat
   deterministik (input yang sama selalu menghasilkan dokumen yang sama), dan
   seluruh kanvas diganti sebagai **satu langkah undo** — `Ctrl+Z` mengembalikan
   desain sebelumnya.
4. Peringatan konversi (bila ada) ditampilkan di bawah galeri.

**Menambah template:** letakkan berkas JSON (format native *atau* Polotno) di
`src/templates/`, lalu tambahkan satu baris di `src/templates/index.ts`:

```ts
import promoBaru from "./promo-baru.polotno.json";
// ...
{ id: "promo-baru", name: "Promo baru", data: promoBaru },
```

Setiap elemen sebaiknya punya `id` unik (adapter membuatkan id bila kosong).

---

## Keyboard Shortcuts

| Shortcut | Aksi |
|---|---|
| Double-click teks | Edit teks langsung di kanvas |
| `Enter` / `Esc` / klik di luar | (saat edit) simpan dan selesai |
| `Shift + Enter` | (saat edit) baris baru |
| `Delete` / `Backspace` | Hapus elemen terpilih (nonaktif saat edit teks) |
| `↑ ↓ ← →` | Geser elemen terpilih 1px |
| `Shift + ↑ ↓ ← →` | Geser elemen terpilih 10px |
| `Ctrl/Cmd + C` | Salin elemen terpilih |
| `Ctrl/Cmd + V` | Tempel elemen (+20,+20) |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| Klik area kosong kanvas | Batalkan seleksi |
| `Ctrl/Cmd + scroll` (atau cubit di trackpad) | Zoom kanvas (5–400%) |
| Tombol `−` / `+` / persen / `Fit` (sudut kanvas) | Zoom, 100%, atau tampilkan kanvas utuh |

Semua shortcut kanvas dinonaktifkan saat fokus ada di `input`/`textarea`/`select`
atau saat teks sedang diedit, supaya fungsi bawaan browser (undo, copy, paste
di kolom teks) tetap bekerja.

---

## Containerization (Docker)

Proyek punya `Dockerfile` multi-stage dan `docker-compose.yml` agar bisa
dijalankan di server mana pun (termasuk server PT. Famous Allstars) tanpa
bergantung pada versi Node.js/OS mesin tersebut.

```bash
docker build -t canvas-design-editor .
docker run -p 3000:3000 canvas-design-editor

# atau
docker compose up --build
```

Buka `http://localhost:3000`.

### Cara kerja `Dockerfile` (3 stage)

1. **`deps`** — `npm ci` menginstal dependency sesuai `package-lock.json`. Repositori
   ini belum menyertakan lockfile (registry npm tidak terjangkau saat pengembangan),
   jadi `Dockerfile` otomatis memakai `npm install`. Jalankan `npm install` sekali di
   mesin yang punya akses internet dan commit `package-lock.json` agar build
   Docker bisa direproduksi.
2. **`builder`** — `npm run build`. `next.config.js` memakai `output: "standalone"`
   sehingga Next.js hanya menyertakan dependency produksi yang dipakai dan
   menghasilkan `server.js` mandiri.
3. **`runner`** — image akhir hanya berisi hasil `standalone` + `public` +
   `.next/static`, berjalan sebagai user non-root (`nextjs`).

Template berupa berkas `.json` yang di-*bundle* oleh webpack ke dalam build, jadi
tidak perlu menyalin folder `src/templates` ke image.

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server Next.js di dalam container |
| `HOSTNAME` | `0.0.0.0` | Agar bisa diakses dari luar container |
| `NODE_ENV` | `production` | Mode produksi |

> **Catatan jaringan saat build:** tahap `deps`/`builder` butuh akses ke registry
> npm saat *image dibangun* (bukan saat aplikasi berjalan). Pastikan mesin/CI
> yang menjalankan `docker build` punya akses ke registry npm atau mirror internal.

---

## Catatan pengujian

### Menjalankan test suite

```bash
npm install
npm test
```

`npm test` menjalankan empat berkas di `tests/` lewat [`tsx`](https://tsx.is/)
(devDependency), **tanpa browser dan tanpa Next.js** — butuh Node 20+ (memakai
`Blob`, `URL.createObjectURL`, dan `fetch(blob:)` bawaan Node; diuji pada Node 22). Zustand dan uuid
diganti stub tipis di `tests/stubs/` lewat `tests/tsconfig.json`, dengan kontrak
`(set, get)` yang sama, sehingga store diuji apa adanya tanpa React.

| Berkas | Isi | Jumlah |
|---|---|---|
| `tests/core.test.ts` | warna, font, deteksi format, adapter dua arah, migrasi v1→v2, `parseDocument`, store (history, clipboard, JSON, `editingId`) | 21 |
| `tests/media-workspace.test.ts` | aturan ukuran kanvas & rencana export, pencatat URL objek, `addImageElement`/`replaceImageSource`, **revoke berbasis referensi** (hapus, ganti, Undo, pemangkasan history, clipboard), gestur gambar = satu langkah undo, `setCanvasMeta`, penyematan `blob:` → `data:` saat export, adapter (struktur bertingkat, `pageIndex`, `color`/`fill`, titik jangkar, crop, gambar, grup) | 27 |
| `tests/templates.test.ts` | semua template dan contoh: termuat, warna `#rrggbb`, id/zIndex unik, native ↔ Polotno tanpa kehilangan data | 9 |
| `tests/vector-text-view.test.ts` | `cleanPolotnoText` (paragraf, `<br>`, baris kosong, entitas, teks polos dengan `<`/`>`, atribut berisi `>`), teks HTML lewat adapter + peringatan, SVG (impor, ekspor `svg`, `colorsReplace` data URI/base64/tautan), flip dan skala negatif (*property test* 36 kombinasi rotasi × skala), toleransi lebar teks (per `align`, rotasi, bolak-balik tanpa membengkak), `fitZoom`/`stepZoom`/`scaledSize`, `loadRevision`, export bebas zoom dengan Stage palsu (termasuk gagal dan batas 8192 px), `drawPicture` | 35 |

Total 92 tes; semuanya lulus pada saat README ini ditulis (Node 22, tsx 4.23).

### Yang diuji selain itu (tidak ada di repositori)

- **UI di Chromium dengan React asli** (18 pengecekan): upload PNG langsung menjadi
  elemen terpilih dengan URL `blob:` dan rasio benar; berkas non-gambar dan berkas
  rusak ditolak dengan pesan, tanpa elemen kosong, dan URL berkas rusak di-revoke;
  **Ganti gambar** mempertahankan posisi/lebar dan gambar lama tetap terbaca setelah
  Undo; panel Kanvas (draf diketik, Enter/blur, pembatasan, kolom kosong, tombol
  rasio aktif, swatch, peringatan elemen di luar kanvas, kolom mengikuti Undo); tidak
  ada galat konsol. Hook `useLoadedImage` diuji terpisah: status memuat, tidak pernah
  menyerahkan gambar lama untuk URL baru, remount dari cache langsung tampil, URL
  yang sudah di-revoke atau tidak terjangkau berakhir sebagai `error`. Skrip-skrip ini
  bergantung pada Playwright dan bundler dan belum dimasukkan ke repositori.
- **CSS scroll kanvas** (Chromium, `globals.css` asli): kanvas lebih besar dari area
  tampil dapat di-scroll sampai tepi kiri, dan kanvas kecil tetap di tengah.
- **Geometri overlay edit teks** (Chromium, dari versi 3): kotak `<textarea>` cocok
  dengan kotak teks referensi dalam < 0,5 px pada rotasi 0°, 30°, dan −75°.
- **Fit-to-Screen & zoom di Chromium** (13 pengecekan, `CanvasWorkspace` asli dengan
  React asli dan `globals.css` asli; hanya `react-konva` diganti stub DOM yang
  menampilkan ukuran dan skala yang diterima Stage): poster 1080×1920 diperkecil
  hingga utuh tanpa scrollbar dan terpusat; kanvas kecil tidak diperbesar; tombol
  −/+/persen/Fit; 100% membuat kanvas bisa di-scroll sampai tepi kiri; ubah ukuran
  jendela → refit di mode Fit tetapi tidak mengubah zoom manual; memuat dokumen
  (juga yang berukuran sama) dan mengubah ukuran kanvas → Fit lagi; Ctrl+scroll
  memanggil `preventDefault` dan men-zoom, scroll biasa tidak; tombol berhenti di
  5% dan 400%; `<textarea>` edit teks tepat di (x·zoom, y·zoom) pada empat level
  zoom; tidak ada galat React.
- **Penggambaran gambar terbalik per piksel di Chromium** (10 pengecekan): gambar uji
  4×2 petak berwarna digambar dengan `drawPicture` di `<canvas>` 2D asli (metode
  `translate`/`scale`/`drawImage` yang dipakai sama dengan konteks Konva). `flipX`,
  `flipY`, dan keduanya menukar petak dengan benar; kotak yang terlihat sama persis
  dengan yang tidak dibalik pada rotasi 30°, 90°, −45°, 180°, 217°; cermin terjadi
  *sebelum* putaran; crop lalu cermin; gambar yang belum dimuat tidak menggambar
  piksel; SVG tetap tajam.
- **Type-check mode strict** untuk semua modul non-React, `exportImage.ts`, `zoom.ts`,
  dan `drawPicture.ts`; komponen React diperiksa dengan stub tipe untuk
  `react`/`react-konva`/`konva` (hanya menangkap nama dan properti yang salah,
  bukan tipe asli pustaka itu).

### Belum diuji

- **`next build` dan aplikasi utuh di browser.** Registry npm tidak bisa dijangkau
  dari lingkungan pengembangan (diblokir kebijakan jaringan), sehingga `konva`,
  `react-konva`, dan `next` tidak terpasang (mencoba mengambil sumber Konva dari
  GitHub juga diblokir). Akibatnya **interaksi Konva sungguhan belum pernah
  dijalankan**: drag/transform gambar lewat Transformer, `Shape` gambar dengan
  `sceneFunc`/`hitFunc` di konteks Konva yang asli (bukan konteks 2D bawaan
  browser), `Stage.scale()`/`size()` yang dikembalikan saat export, dan
  `stage.toDataURL()` sesungguhnya. Logika di belakangnya diuji (store, ukuran,
  riwayat, zoom, rencana export, penggambaran per piksel), dan kodenya lolos
  type-check, tetapi *langkah pertama yang disarankan* adalah `npm install && npm
  run dev`, lalu: unggah gambar, balikkan lewat impor Polotno, geser/putar/ubah
  ukurannya, zoom, dan export PNG pada zoom yang bukan 100%.
- `docker build` (tidak ada Docker daemon) dan membuka export Polotno di editor
  Polotno asli.
- Asumsi skema Polotno yang disebut di bagian "Kompatibilitas" (relatif crop, arah
  flip terhadap rotasi, asal rotasi, grup, HTML pada teks).
- Apakah 10 px toleransi lebar cukup untuk font cadangan tertentu: itu bergantung
  pada font di mesin pengguna dan baru terlihat di browser.

---

## Roadmap berikutnya

- UI crop gambar (skema `crop*` sudah siap), tombol flip di toolbar (skema dan
  penggambaran sudah siap), dan sudut membulat
- Impor grup Polotno (setelah aturan koordinat anaknya dipastikan)
- Penyimpanan gambar di server/object storage sebagai ganti `data:` URL di JSON
- Multi-select & grouping
- Pan kanvas dengan seret/spasi dan shortcut `Ctrl+0` / `Ctrl+=` / `Ctrl+-` (zoom
  dan overlay edit teks sudah ada)
- Mengukur font di klien untuk toleransi lebar teks yang tepat (sekarang tetap 10 px)
- Bold/italic/line-height di toolbar (datanya sudah ada di skema)
- Export kanvas ke PDF
- Snapping & alignment guides
- Test interaksi di browser (Playwright) dimasukkan ke repositori, dan CI yang
  menjalankan `npm test`, membangun, dan mendorong image Docker
