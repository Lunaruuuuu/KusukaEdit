# Canvas Design Editor (Polotno-style) — Next.js + Konva

Prototipe / MVP komponen design editor kanvas untuk Next.js, terinspirasi dari
arsitektur [Polotno](https://polotno.com/). Dibangun dengan **React-Konva**
untuk rendering kanvas, dan **Zustand** untuk state management.

Status: **MVP kerja praktek, versi 10** (paket `0.10.0`, rilis "KusukaEdit Ver 0.8") — versi
ini menerjemahkan **efek visual Polotno tanpa peringatan**: blur dan filter warna kini berlaku
untuk teks dan bentuk, ditambah **garis putus-putus** (`dash`), **latar teks** (kotak per baris
dengan sudut membulat dan padding yang mengikuti ukuran huruf), dan **teks melengkung**. Semuanya
masuk skema JSON native **v5**, digambar di kanvas (teks kini sebuah `Group`), diatur dari satu
popover **✦ Efek**, ikut Undo/Redo, dan ditulis kembali ke Polotno dengan nama propertinya
sendiri. Font dari berkas atau pemilih font kini **dimuat dari Google Fonts** sebelum teks
diukur. Ikon perataan teks seragam tiga garis.

Versi 9 (rilis "Ver 0.7") menata ulang **alur masuk dan keluar berkas mengikuti Polotno**: semua jalur masuk
(proyek JSON dengan **pratinjau deteksi**, gambar, template) dikumpulkan di tab **Impor** di
panel kiri, sedangkan ekspor (PNG, JPG, JSON KusukaEdit, JSON Polotno) menjadi satu tombol
**Ekspor** dengan menu di header, tepat di kanan Undo/Redo — panel kanan (`ActionPanel`)
dihapus dan kanvas mendapat seluruh lebarnya. Selain itu: **strip halaman yang bisa
dilipat**, **crop ala Polotno** (tanpa banner/petunjuk/tombol Selesai; selesai dengan klik di
luar gambar atau `Enter`/`Esc`; pegangan bulat di sudut gambar untuk memperbesar foto di
dalam bingkai), dan **tata letak responsif** (panel kiri menjadi *drawer* di jendela sempit,
toolbar bisa digulir ke samping, kanvas selalu *fit* ke sisa ruang).

Versi 8 (rilis "Ver 0.6") menambahkan efek lintas elemen (transparansi, bayangan, garis tepi
huruf), toolbar satu baris ala Polotno, seleksi ganda (marquee dan `Ctrl/Cmd`+klik), dan
auto-fit teks; skema JSON native v4.

## Daftar isi

- [Fitur](#fitur)
- [Struktur proyek](#struktur-proyek)
- [Menjalankan proyek](#menjalankan-proyek-lokal-tanpa-docker)
- [Panduan integrasi & SSR](#panduan-integrasi-ke-proyek-nextjs-lain)
- [Spesifikasi State & Store](#spesifikasi-props--state-store-layer)
- [Dokumen multi-halaman (pages)](#dokumen-multi-halaman-pages)
- [Tata letak antarmuka](#tata-letak-antarmuka)
- [Impor & ekspor berkas (alur Polotno)](#impor--ekspor-berkas-alur-polotno)
- [Tata letak responsif](#tata-letak-responsif)
- [Upload gambar & manajemen memori](#upload-gambar--manajemen-memori)
- [Pengaturan workspace (ukuran, rasio, latar)](#pengaturan-workspace-ukuran-rasio-latar)
- [Fit-to-Screen & zoom kanvas](#fit-to-screen--zoom-kanvas)
- [Drag-and-drop gambar ke kanvas](#drag-and-drop-gambar-ke-kanvas)
- [Pemangkasan (crop) gambar](#pemangkasan-crop-gambar)
- [Filter & efek gambar](#filter--efek-gambar)
- [Efek lintas elemen (teks, bentuk, gambar)](#efek-lintas-elemen-teks-bentuk-gambar)
- [Efek Polotno tanpa peringatan (v10)](#efek-polotno-tanpa-peringatan-v10)
- [Pemuat font Google (v10)](#pemuat-font-google-v10)
- [Toolbar kontekstual ala Polotno](#toolbar-kontekstual-ala-polotno)
- [Seleksi ganda: kotak seret & Ctrl/Cmd+klik](#seleksi-ganda-kotak-seret--ctrlcmdklik)
- [Auto-fit teks (kecilkan otomatis)](#auto-fit-teks-kecilkan-otomatis)
- [Edit teks langsung (In-Place Text Editing)](#edit-teks-langsung-in-place-text-editing)
- [Copy & Paste elemen](#copy--paste-elemen-ctrlc--ctrlv)
- [Undo / Redo](#sistem-undo--redo-history-stack)
- [Export ke gambar (satu halaman atau semua)](#export-ke-gambar-png--jpg)
- [Skema JSON native (v5)](#skema-dokumen-json-native-v5)
- [Adapter Polotno (dua arah, semua halaman)](#adapter-polotno-import--export-dua-arah)
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
- [x] **Toolbar kontekstual satu baris ala Polotno** (v8): teks — warna, font, ukuran
      dengan panah ▲▼, auto-fit, **B / I / U / S**, perataan kiri/tengah/kanan/**justify**
      (satu tombol bersiklus), daftar **berpoin / bernomor**, spasi huruf & baris, **AA / aa**,
      menu **Efek**; gambar — Pangkas, Reset, **Balik** (horizontal/vertikal), Efek, **Pas
      halaman**, **Mask**, Ganti; bentuk — warna isi, warna & tebal garis tepi, sudut, Efek;
      lalu menu Posisi (lapisan) dan Hapus
- [x] **Alur berkas ala Polotno** (v9): tab **Impor** di panel kiri (proyek JSON dengan
      pratinjau deteksi format/halaman/ukuran/peringatan sebelum dibuka, unggah gambar,
      pintasan ke template) dan tombol **Ekspor** di header dengan menu PNG / JPG /
      JSON KusukaEdit / JSON Polotno, resolusi, dan cakupan halaman
- [x] **Strip halaman lipat** (v9): tombol chevron melipat thumbnail dan tombol halaman;
      kanvas langsung mengisi ruangnya; pilihan diingat browser
- [x] **Crop ala Polotno** (v9): tanpa banner atau tombol; klik di luar gambar atau
      `Enter`/`Esc` untuk selesai; grid 3×3 dan lapisan gelap tetap; **pegangan bulat** di
      sudut gambar utuh untuk memperbesar/memperkecil foto di dalam bingkai
- [x] **Tata letak responsif** (v9): panel kiri menjadi *drawer* di bawah 1100 px, toolbar
      kontekstual bisa digulir ke samping, popover tetap di dalam layar, kanvas *fit*
      otomatis ke sisa ruang (diuji pada 1440, 900, dan 420 px)
- [x] **Export / Import JSON** dengan dua pilihan format: **Native (KusukaEdit)**
      dan **Polotno-compatible**; format file terdeteksi otomatis saat import
- [x] **Galeri template**: 11 kartu thumbnail — 7 berkas format Polotno (beberapa
      multi-halaman) yang ada di `src/templates/polotno/` dan 4 preset lama; klik
      kartu → berkas lewat deteksi adapter → seluruh halaman dan elemen dibangun
      ulang di store
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
- [x] **Drag-and-drop gambar**: seret berkas gambar dari desktop ke area kanvas —
      gambar masuk **tepat di posisi kursor dilepas** (benar pada zoom berapa pun,
      juga saat kanvas di-scroll), sebagai satu langkah undo
- [x] **Crop gambar interaktif**: klik dua kali gambar (atau tombol **Pangkas**) →
      geser tepi/sudut bingkai untuk memangkas, geser isi untuk menggeser gambar;
      `cropX/cropY/cropWidth/cropHeight` (pecahan 0..1) diubah proporsional dan
      diteruskan ke kanvas sebagai piksel asli; satu gestur = satu langkah undo
- [x] **Efek gambar Polotno**: `blurRadius`, `borderSize`/`borderColor`,
      `shadowColor`/`shadowBlur` (+ offset dan opacity), dan `clipSrc`
      lingkaran/segitiga diterjemahkan ke `ImageElement`, digambar di kanvas
      (`Konva.Filters.Blur` + `cache()`, garis tepi, bayangan, mask), dan ditulis
      kembali ke Polotno
- [x] **Dokumen multi-halaman**: state `pages: Page[]` + `currentPageIndex`; strip
      thumbnail di bawah kanvas dengan **Tambah**, **Duplikat** (halaman beserta
      seluruh elemennya, id baru), dan **Hapus** (halaman terakhir dilindungi);
      seleksi, Transformer, edit teks, dan crop direset saat pindah halaman;
      Undo/Redo bekerja lintas halaman dan membawa Anda ke halaman tempat perubahan
- [x] **JSON multi-halaman (skema v3)**: `exportToJSON()` / `loadFromJSON()` menyimpan
      dan memuat seluruh halaman dalam **satu berkas**; berkas v1/v2 dibuka sebagai
      satu halaman tanpa peringatan
- [x] **Adapter Polotno semua halaman**: `convertPolotnoToKusuka()` mengimpor **seluruh**
      `pages[]` dan `convertKusukaToPolotno()` menulis seluruh halaman (masing-masing
      dengan ukuran sendiri) — batas "hanya halaman pertama" sudah tidak ada
- [x] **Indikator crop**: lapisan gelap semi-transparan di luar jendela potong
      (pratinjau bagian yang terbuang) dan handle **siku tebal berwarna amber** + chip
      "PANGKAS" (chip dihapus di v9), jelas berbeda dari bingkai biru dengan titik putih bulat milik
      Transformer (resize)
- [x] **Panel Filter & Efek gambar**: kecerahan, kontras, saturasi, 7 preset
      (hitam-putih, sepia, pudar, cerah, hangat, dingin, dramatis) berdampingan dengan
      blur, sudut membulat, mask, bayangan, dan garis tepi; semuanya satu langkah
      undo per gestur dan diterjemahkan dua arah ke Polotno
- [x] **Export gambar dengan pilihan cakupan**: **Halaman aktif** (`stage.toDataURL()`,
      satu PNG/JPG) atau **Semua halaman** (dirender berurutan, satu berkas ZIP berisi
      satu gambar per halaman pada ukurannya sendiri)
- [x] **Efek lintas elemen** (v8): `opacity` dan bayangan (`shadowColor`, `shadowBlur`,
      `shadowOffsetX/Y`, `shadowOpacity`) untuk **semua** tipe elemen, garis tepi huruf
      (`stroke`/`strokeWidth`) untuk teks; digambar di `Konva.Text`, `Rect`, `Ellipse`, dan
      `Shape` gambar, dan disalin dari/ke Polotno **tanpa** masuk daftar peringatan
- [x] **Seleksi ganda** (v8): seret kotak di area kosong halaman (**marquee**) memilih
      setiap elemen yang bersinggungan secara langsung saat diseret; `Ctrl/Cmd`+klik
      (juga `Shift`+klik) menambah/mengurangi; satu Transformer untuk semuanya; geser,
      ubah ukuran, putar, panah, dan Delete pada grup = **satu langkah undo**; `Ctrl/Cmd+A`
      memilih semua, `Esc` membatalkan
- [x] **Auto-fit teks** (v8): kotak teks bertinggi tetap; ukuran huruf mengecil
      proporsional (kelipatan 0,5 px) sampai tidak ada baris yang keluar dari tinggi kotak
      dan tidak ada kata yang lebih lebar dari kotak, diukur dengan `measureSize` Konva
- [x] **Efek Polotno tanpa peringatan** (v10): blur dan filter warna (kecerahan, kontras,
      saturasi, preset) untuk teks dan bentuk; **garis putus-putus** untuk bentuk, garis tepi
      huruf, dan bingkai gambar; **latar teks** per baris (warna, kepekatan, sudut, padding);
      **teks melengkung** (busur ke atas/bawah); popover **✦ Efek**; pulang-pergi Polotno utuh
- [x] **Pemuat font Google** (v10): font dimuat lewat `<link>` + `document.fonts.load()`
      sebelum teks diukur ulang; pemilih font berisi 20 keluarga
- [x] **Ikon perataan tiga garis** (v10) untuk semua opsi perataan
- [x] **Test suite** (`npm test`, 266 tes) untuk adapter, store dan halaman, memori
      gambar, ukuran kanvas, zoom, export, ZIP, template, crop, drop, filter, efek gambar,
      efek lintas elemen, opsi teks, auto-fit, marquee, seleksi ganda, dan efek v10

## Struktur Proyek

```
canvas-editor/
├── app/
│   ├── layout.tsx                 # Root layout (Server Component)
│   ├── page.tsx                   # Halaman utama, merender <EditorRoot />
│   └── globals.css
├── src/
│   ├── types/editor.ts            # Skema TypeScript: Page, CanvasDocument (native v5), elemen
│   ├── store/
│   │   ├── useEditorStore.ts      # Zustand: pages + currentPageIndex, history, clipboard, actions, JSON
│   │   └── selectors.ts           # selectCurrentPage / selectCanvas / selectElements / selectElementById
│   ├── lib/
│   │   ├── pages.ts               # Operasi halaman murni: halaman kosong, duplikat (id baru), indeks, kolektor
│   │   ├── polotnoAdapter.ts      # Konversi dua arah Polotno <-> native (SEMUA halaman) + deteksi format
│   │   ├── polotnoEffects.ts      # Efek gambar <-> Polotno: blur, border, shadow, mask, sudut, filter (murni)
│   │   ├── color.ts               # Normalisasi warna (rgb(), rgba(), hsl(), nama, #rgb -> #rrggbb)
│   │   ├── id.ts                  # Pembuat id elemen
│   │   ├── workspace.ts           # Aturan ukuran kanvas: batas, rasio, rencana ukuran export
│   │   ├── objectUrls.ts          # Pencatat URL sementara (blob:) yang harus di-revoke
│   │   ├── imageCache.ts          # Memuat <img> sekali (CORS dulu, lalu cadangan) + cache
│   │   ├── imageUpload.ts         # File -> URL objek -> gambar terukur (validasi, revoke bila gagal)
│   │   ├── imageData.ts           # blob: -> data: saat export JSON (semua halaman)
│   │   ├── useLoadedImage.ts      # Hook React: status memuat gambar
│   │   ├── drawPicture.ts         # Cara gambar digambar di Konva (crop, cermin, mask, sudut membulat, garis tepi, bayangan) — murni
│   │   ├── crop.ts                # Matematika crop: pecahan <-> kotak, tepi/sudut, geser, reset, piksel asli (murni)
│   │   ├── dropImage.ts           # Drag-and-drop: jenis seretan, berkas yang dipakai, kursor -> koordinat desain (murni)
│   │   ├── imageEffects.ts        # Efek mana yang benar-benar aktif (juga resolveShadow / resolveOpacity untuk semua elemen) + blur Konva (murni)
│   │   ├── imageStyle.ts          # Patch gaya elemen (gambar, teks, bentuk): validasi, pembatasan, "undefined = hapus" (murni)
│   │   ├── textOptions.ts         # Opsi teks toolbar: dekorasi, spasi huruf, huruf besar/kecil, daftar, latar & lengkung dari berkas (murni)
│   │   ├── textEffects.ts         # v10: dash (+ satuan Polotno), kotak latar teks per baris, geometri busur teks lengkung (murni)
│   │   ├── fontLoader.ts          # v10: ensureFontLoaded() — Google Fonts <link> + document.fonts.load(), daftar font
│   │   ├── useNodeFilters.ts      # v10: hook blur + filter warna (cache Konva) untuk teks dan bentuk
│   │   ├── textFit.ts             # Auto-fit teks: bungkus kata seperti Konva + cari ukuran huruf terbesar yang muat (murni)
│   │   ├── selection.ts           # Marquee: kotak dari dua titik, perpotongan kotak berotasi (SAT), hasil seleksi (murni)
│   │   ├── transform.ts           # Transformer -> field elemen ("bake" skala ke lebar/tinggi/ukuran huruf) (murni)
│   │   ├── fileFlow.ts            # Impor: pratinjau deteksi berkas; Ekspor: pilihan format, nama berkas (murni)
│   │   ├── useMediaQuery.ts       # Hook React: media query (mode drawer panel kiri)
│   │   ├── imageFilters.ts        # Filter warna: matriks 4x5 (kecerahan, kontras, saturasi, preset) + piksel
│   │   ├── zoom.ts                # Skala tampilan: fit, langkah zoom, ukuran Stage (fungsi murni)
│   │   ├── useCanvasZoom.ts       # Hook React: mode Fit/manual, ukur area, Ctrl+scroll
│   │   ├── exportImage.ts         # renderStageToDataUrl() + exportStageAsImage(): stage.toDataURL() bebas dari zoom
│   │   ├── batchExport.ts         # Urutan render semua halaman, nama berkas, waitUntil (murni, diuji di Node)
│   │   ├── exportPages.ts         # Export semua halaman -> ZIP (menyentuh store, Stage, browser)
│   │   └── zipStore.ts            # Penulis ZIP tanpa kompresi (CRC32, UTF-8) — tanpa dependensi
│   ├── templates/
│   │   ├── index.ts               # Registry template (11 entri)
│   │   ├── polotno/               # 7 dokumen format Polotno asli (multi-halaman)
│   │   │   ├── presentasi-3-slide.polotno.json
│   │   │   ├── brosur-2-halaman.polotno.json
│   │   │   ├── carousel-4-slide.polotno.json
│   │   │   ├── kartu-nama-2-sisi.polotno.json
│   │   │   ├── undangan-story-3.polotno.json
│   │   │   ├── katalog-produk-2-halaman.polotno.json
│   │   │   └── paket-feed-dan-story.polotno.json
│   │   ├── poster-acara.kusuka.json
│   │   ├── kartu-kutipan.kusuka.json
│   │   ├── promo-diskon.polotno.json
│   │   └── post-sosmed.polotno.json
│   └── components/
│       ├── EditorRoot.tsx         # Wrapper client + dynamic import (ssr:false); susunan toolbar, panel gaya, kanvas, strip halaman
│       ├── CanvasWorkspace.tsx    # Stage/Layer/Transformer (banyak node) + marquee + skala tampilan + keyboard shortcut + drag-and-drop + penutup progres export
│       ├── ZoomControls.tsx       # Tombol −, %, +, Fit di sudut kanvas
│       ├── ElementRenderer.tsx    # Render 1 elemen (Text/Rect/Ellipse/Shape gambar + filter, blur, bayangan, garis tepi, mask, sudut)
│       ├── CropOverlay.tsx        # Lapisan DOM crop: gambar utuh, lapisan gelap, jendela potong, handle siku
│       ├── TextEditorOverlay.tsx  # <textarea> untuk edit teks di tempat
│       ├── SidePanel.tsx          # Rel tab vertikal: Elemen / Gambar / Template / Kanvas
│       ├── WorkspacePanel.tsx     # Ukuran, rasio, latar kanvas (+ "Terapkan ke semua halaman")
│       ├── TemplatePanel.tsx      # Kartu template (thumbnail, jumlah halaman, lencana format)
│       ├── TemplateThumbnail.tsx  # Thumbnail SVG satu halaman (juga dipakai strip halaman)
│       ├── ContextualToolbar.tsx  # Toolbar satu baris ala Polotno (teks / gambar / bentuk / seleksi ganda) + popover (Efek v10)
│       ├── DashPicker.tsx         # v10: pilihan pola garis (utuh / putus-putus / garis panjang / titik-titik)
│       ├── ImageStylePanel.tsx    # Panel Filter | Efek | Bayangan & garis untuk gambar
│       ├── PageStrip.tsx          # Strip halaman: thumbnail, Tambah, Duplikat, Hapus
│       ├── HistoryControls.tsx    # Tombol Undo/Redo
│       ├── ImportPanel.tsx        # Tab Impor: proyek JSON (pratinjau deteksi -> Buka desain), gambar, template
│       └── ExportMenu.tsx         # Tombol Ekspor di header: PNG / JPG / JSON KusukaEdit / JSON Polotno, resolusi, halaman
├── tests/                         # `npm test` — lihat "Catatan pengujian"
│   ├── core.test.ts               # Adapter, color, store (history, clipboard, JSON), migrasi (22 tes)
│   ├── media-workspace.test.ts    # Gambar, memori (revoke), ukuran kanvas, adapter gambar (28 tes)
│   ├── vector-text-view.test.ts   # Teks HTML, SVG, flip, toleransi lebar, zoom, export, drawPicture (35 tes)
│   ├── image-tools.test.ts        # Crop, drag-and-drop, efek gambar, mask, adapter efek (41 tes)
│   ├── pages.test.ts              # Halaman: store, selectors, history, adapter multi-halaman, migrasi v3 (37 tes)
│   ├── filters-export.test.ts     # Filter, sudut membulat, setImageStyle, ZIP, urutan batch export (33 tes)
│   ├── templates.test.ts          # Semua template dan contoh (28 tes)
│   ├── v4-effects-selection.test.ts # Efek lintas elemen, opsi teks, auto-fit, marquee, seleksi ganda (23 tes)
│   ├── ui-flow.test.ts            # Pratinjau impor, pilihan ekspor, skala gambar di crop (6 tes)
│   ├── helpers.ts                 # E(), C(), onePage(), mkPage(): jalan pintas untuk dokumen berhalaman
│   ├── harness.ts                 # Test runner kecil (tanpa dependensi)
│   ├── stubs/                     # Pengganti tipis zustand & uuid agar jalan di Node
│   └── tsconfig.json
├── examples/
│   ├── sample-design.json              # Contoh export format Native (v4, satu halaman)
│   ├── sample-design.polotno.json      # Dokumen yang sama, format Polotno
│   ├── sample-multipage.json           # Native v4, 3 halaman (dua ukuran berbeda)
│   ├── sample-multipage.polotno.json   # Dokumen yang sama, format Polotno, 3 halaman
│   └── sample-effects.polotno.json     # Format Polotno: blur, garis tepi, bayangan, mask lingkaran/segitiga, crop
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
| `pages`      | `Page[]`                 | **Dokumen**: satu halaman atau lebih (tidak pernah kosong). `Page = { id, canvas: CanvasMeta, elements: CanvasElement[] }` — tiap halaman punya ukuran, latar, dan elemen sendiri |
| `currentPageIndex` | `number`           | Halaman yang sedang diedit; selalu indeks yang sah di `pages` |
| `selectedIds` | `string[]`              | **Semua** elemen terpilih di halaman aktif (klik, `Ctrl/Cmd`+klik, marquee), urut sesuai saat dipilih |
| `selectedId` | `string \| null`         | **Satu-satunya** elemen terpilih, atau `null` bila tidak ada **atau lebih dari satu** yang dipilih. Yang dipakai UI satu-elemen (toolbar, crop, edit teks, copy). Selalu sama dengan `selectedIds[0]` bila `selectedIds` berisi satu |
| `clipboard`  | `CanvasElement \| null`  | Elemen yang disalin dengan Ctrl+C; bukan bagian dokumen, tidak ikut history, dan bisa ditempel di halaman mana pun |
| `editingId`  | `string \| null`         | id teks yang sedang diedit di overlay `<textarea>`; saat terisi, shortcut global dinonaktifkan dan node Konva disembunyikan |
| `croppingId` | `string \| null`         | id gambar yang sedang dipangkas di overlay crop; node Konva-nya disembunyikan dan Transformer dilepas. Ikut pilihan: berganti/hilang bila yang dipilih berganti, dan dibersihkan oleh Undo/Redo, pindah halaman, hapus, muat dokumen, dan reset |
| `stageNode`  | `Konva.Stage \| null`    | Instance Stage aktif (untuk export gambar); diisi otomatis oleh `CanvasWorkspace` |
| `loadRevision` | `number`               | Bertambah 1 setiap `loadFromJSON` **berhasil** (Import, template). Sinyal tampilan: kanvas menampilkan dokumen baru utuh lagi (zoom "Fit") walau ukurannya sama. Bukan bagian dokumen |
| `exportProgress` | `{ done, total } \| null` | Terisi selama export **semua halaman** berjalan: kanvas ditutup kotak progres dan input diblokir. Sinyal tampilan, bukan dokumen |
| `past`       | `HistorySnapshot[]`      | Tumpukan state sebelumnya (Undo) |
| `future`     | `HistorySnapshot[]`      | Tumpukan state yang baru di-undo (Redo) |

`selectedIds`, `selectedId`, `clipboard`, `editingId`, `croppingId`, `stageNode`, `loadRevision`, dan
`exportProgress` **tidak pernah** masuk ke snapshot history — snapshot hanya berisi
`pages` (seluruh dokumen) dan indeks halaman. (Level zoom sengaja tidak ada di store:
itu pengaturan tampilan milik `CanvasWorkspace`, lihat "Fit-to-Screen & zoom kanvas".)

**Selectors** (`src/store/selectors.ts`) — komponen tidak perlu tahu bentuk `pages`:

| Selector | Hasil |
|---|---|
| `selectCurrentPage(state)` | halaman aktif (indeks di luar rentang dijepit, tidak pernah `undefined`) |
| `selectCanvas(state)` | `canvas` halaman aktif |
| `selectElements(state)` | `elements` halaman aktif |
| `selectPageCount(state)` | jumlah halaman |
| `selectElementById(state, id)` | elemen dengan id itu **di halaman aktif**, atau `undefined` |

### Actions

| Fungsi | Signature | Keterangan |
|---|---|---|
| `goToPage` | `(index: number) => void` | Tampilkan halaman lain. **Bukan** langkah undo. Menyetel ulang `selectedId`, `editingId`, dan `croppingId`. Indeks yang bukan halaman, atau halaman yang sedang tampil, diabaikan |
| `addPage` | `() => void` | Halaman kosong **setelah** halaman aktif (ukuran dan latar sama dengan halaman aktif), langsung ditampilkan; satu langkah undo |
| `duplicatePage` | `(index?: number) => void` | Salin halaman (default: aktif) **beserta seluruh elemennya**, semuanya berid baru, tepat sesudah sumbernya; salinan ditampilkan; satu langkah undo. Indeks tidak sah = tidak berbuat apa-apa dan tidak mencatat history |
| `deletePage` | `(index?: number) => boolean` | Hapus halaman (default: aktif); satu langkah undo. **Halaman terakhir tidak bisa dihapus** (mengembalikan `false`). Indeks tidak sah = tidak berbuat apa-apa |
| `setCanvasMeta` | `(meta: Partial<CanvasMeta>, options?: { allPages?: boolean }) => void` | Ubah ukuran/warna latar halaman aktif (atau **semua halaman** dengan `allPages`). Ukuran dibulatkan dan dibatasi 50–4000 px, warna dinormalisasi, nilai tidak valid diabaikan; pemanggilan beruntun menjadi satu langkah undo; tanpa perubahan = tanpa langkah undo |
| `setSelectedId` | `(id: string \| null) => void` | Pilih satu elemen (atau tidak ada); tidak masuk history |
| `setSelection` | `(ids: string[]) => void` | Pilih tepat elemen-elemen ini di halaman aktif (id yang tidak ada dan duplikat dibuang); dipakai marquee dan `Ctrl/Cmd+A`. Crop/edit teks ditutup bila elemennya tidak lagi satu-satunya yang dipilih |
| `toggleSelected` | `(id: string) => void` | `Ctrl/Cmd`+klik: tambahkan ke seleksi, atau keluarkan bila sudah ada |
| `setEditingId` | `(id: string \| null) => void` | Mulai/akhiri mode edit teks (tidak masuk history) |
| `setCroppingId` | `(id: string \| null) => void` | Buka/tutup mode crop (tidak masuk history). Hanya gambar yang diterima; membuka crop juga memilih gambar itu dan menutup edit teks |
| `setExportProgress` | `(progress: { done, total } \| null) => void` | Dipakai export semua halaman (tidak masuk history) |
| `setStageNode` | `(stage: Konva.Stage \| null) => void` | Registrasi Stage (otomatis) |
| `addTextElement` | `(preset?: "title"\|"subtitle"\|"paragraph") => void` | Tambah teks baru **di halaman aktif** |
| `addShapeElement` | `(shapeType: "rect"\|"circle") => void` | Tambah bentuk baru di halaman aktif |
| `addImageElement` | `(image: { src, naturalWidth, naturalHeight, vector? }, options?: { at?: { x, y } }) => void` | Pasang gambar, diperkecil agar muat (≤ 60% kanvas, rasio asli, tidak diperbesar), dipilih, satu langkah undo. Tanpa `options.at`: di tengah kanvas. Dengan `at` (titik di koordinat **desain**): **titik tengah** gambar diletakkan di sana (dipakai drag-and-drop). Juga mengakhiri edit teks/crop yang sedang berjalan |
| `setImageCrop` | `(id: string, patch: CropPatch) => void` | Tulis hasil satu gestur crop: kotak (`x, y, width, height`) **dan** `cropX/cropY/cropWidth/cropHeight` sekaligus, **satu langkah undo**. Patch yang tidak mengubah apa pun, tidak valid (NaN, ukuran ≤ 0), atau menyasar elemen bukan-gambar diabaikan tanpa membuat langkah undo |
| `resetImageCrop` | `(id: string) => void` | Tampilkan lagi seluruh gambar pada ukuran skalanya saat ini; satu langkah undo, tidak berbuat apa-apa pada gambar yang sudah utuh |
| `setImageStyle` | `(id: string, patch: ImageStylePatch) => void` | Ubah tampilan gambar: kecerahan, kontras, saturasi, preset, blur, sudut membulat, bayangan, garis tepi, mask. Nilai dijepit ke rentangnya, yang tidak valid diabaikan, `undefined` menghapus field. Geseran slider beruntun = satu langkah undo; patch yang tidak mengubah apa pun tidak mencatat apa pun. Hanya gambar di halaman aktif |
| `setElementStyle` | `(id: string, patch: ElementStylePatch) => void` | Sama seperti `setImageStyle`, untuk **elemen apa pun**: `opacity` dan bayangan untuk semua tipe, garis tepi (`stroke`/`strokeWidth`) untuk teks dan bentuk (garis tepi bentuk bisa diubah tetapi tidak dihapus), dan seluruh field gambar untuk gambar. Kunci yang tidak dimiliki tipe itu diabaikan |
| `flipImage` | `(id: string, axis: "x" \| "y") => void` | Cerminkan gambar di dalam kotaknya (`scaleX`/`scaleY` = ±1); satu langkah undo |
| `fitToPage` | `(id: string) => void` | Skala proporsional ke ukuran terbesar yang muat di halaman, di tengah, tegak (rotasi 0); satu langkah undo; tidak berbuat apa-apa bila sudah begitu (dan untuk teks) |
| `replaceImageSource` | `(id: string, image: { src, naturalWidth, naturalHeight }) => void` | Ganti isi gambar; posisi, rotasi, dan lebar tetap, tinggi mengikuti rasio gambar baru, crop direset; satu langkah undo |
| `updateElement` | `(id, attrs: Partial<CanvasElement>) => void` | Update properti elemen (drag, resize, warna, teks…); perubahan beruntun di-batch jadi satu langkah undo. Field bernilai `undefined` **dihapus** dari elemen |
| `updateElements` | `(changes: { id, attrs }[], batchKey: string) => void` | Beberapa elemen diubah oleh **satu** gestur (geser/ubah ukuran seleksi ganda): satu langkah undo untuk semuanya |
| `syncMeasuredHeight` | `(id: string, height: number) => void` | Menyalin tinggi teks hasil ukur Konva ke store; **tidak** membuat langkah undo |
| `removeElement` | `(id: string) => void` | Hapus elemen |
| `removeSelected` | `() => void` | Hapus **semua** elemen terpilih (shortcut Delete) dalam satu langkah undo |
| `copySelected` | `() => boolean` | Salin elemen aktif ke `clipboard`; `false` bila tidak ada yang dipilih **atau lebih dari satu** (seleksi ganda belum bisa disalin) |
| `pasteClipboard` | `() => boolean` | Tempel di **halaman aktif** dengan id baru, +20/+20; `false` bila clipboard kosong |
| `reorderElement` | `(id, "front"\|"back"\|"forward"\|"backward") => void` | Atur z-index |
| `nudgeSelected` | `(dx: number, dy: number) => void` | Geser semua elemen terpilih (shortcut panah); tahan tombol = satu langkah undo |
| `undo` / `redo` | `() => void` | Mundur / maju satu langkah history; menampilkan halaman tempat perubahan terjadi dan menyetel ulang seleksi |
| `exportToJSON` | `(format?: "kusuka"\|"polotno") => Promise<{ json: string; warnings: string[] }>` | Serialize **seluruh dokumen (semua halaman) ke satu berkas**; default `"kusuka"` (v4). **Async**: gambar `blob:` dibaca dan disematkan sebagai `data:` URL |
| `loadFromJSON` | `(data: string \| unknown) => LoadResult` | Muat dokumen **format apa pun** (string atau objek); mengganti semua halaman, menampilkan halaman pertama; satu langkah undo |
| `reset` | `() => void` | Kosongkan dokumen menjadi **satu halaman kosong** (satu langkah undo) |

```ts
type LoadResult =
  | { ok: true; format: "kusuka" | "polotno"; warnings: string[]; pageCount: number }
  | { ok: false; error: string };
```

`loadFromJSON` yang gagal **tidak mengubah** dokumen maupun history.

Contoh pemakaian di komponen:

```tsx
const addPage = useEditorStore((s) => s.addPage);
const elements = useEditorStore(selectElements);   // elemen halaman aktif
const pageCount = useEditorStore(selectPageCount);
```

---

## Dokumen multi-halaman (pages)

### Model

```ts
interface Page { id: string; canvas: CanvasMeta; elements: CanvasElement[] }
interface CanvasDocument { version: 3; pages: Page[] }
```

Sebelum v7 store memegang satu `canvas` dan satu larik `elements` yang datar. Sekarang
`pages: Page[]` adalah dokumennya dan `currentPageIndex` menunjuk halaman yang sedang
diedit; seluruh aksi elemen (tambah, hapus, geser, urutan lapisan, crop, gaya gambar,
tempel) hanya menyentuh **halaman aktif**. Konsekuensinya:

- **Setiap halaman punya ukuran dan latar sendiri** — pos feed 1080×1080 dan story
  1080×1920 dapat berada di satu dokumen (lihat template "Paket feed + story").
- **id unik di seluruh dokumen**: id elemen tidak boleh berulang antarhalaman, begitu
  pula id halaman. `duplicatePage` memberi id baru untuk halaman *dan* setiap
  elemennya; pemuat berkas mengganti id kembar dari file yang ditulis tangan.
- Hanya **satu `Stage` Konva**, yang menggambar halaman aktif. Halaman lain tidak
  digambar sama sekali (murah untuk dokumen besar); thumbnail strip halaman adalah
  SVG ringan (`TemplateThumbnail`), bukan Stage tambahan.

### Navigasi dan reset seleksi

`goToPage`, `addPage`, `duplicatePage`, `deletePage`, `undo`, `redo`, `loadFromJSON`,
dan `reset` semuanya menyetel `selectedId`, `editingId`, dan `croppingId` ke `null`.
Seleksi satu halaman tidak boleh "tertinggal" di halaman lain: id elemen tidak ada di
halaman tujuan, dan Transformer akan menempel ke node yang sudah tidak ada. Di
`CanvasWorkspace`, Transformer dibangun ulang tiap `selectedId` **atau id halaman**
berubah, sehingga ia selalu lepas dari node halaman lama.

Berpindah halaman **bukan** langkah undo (itu mengubah apa yang Anda lihat, bukan
dokumennya).

### Menghapus halaman

`deletePage` tidak mengizinkan penghapusan halaman terakhir (tombol Hapus dinonaktifkan,
fungsi mengembalikan `false`). Setelah halaman dihapus, halaman aktif tetap sama bila
yang dihapus bukan halaman aktif; bila halaman aktif yang dihapus, halaman yang
menggantikannya tampil (halaman terakhir bila yang terakhir dihapus). Undo
mengembalikan halaman beserta isinya, lengkap dengan gambar `blob:`-nya — URL gambar
baru dilepas bila tak ada lagi halaman, snapshot history, atau clipboard yang memakainya.

### Antarmuka: strip halaman

`PageStrip.tsx`, di bawah kanvas: satu thumbnail per halaman (`.page-thumb`, nomor di
bawahnya, halaman aktif diberi bingkai biru), label "Halaman 2 / 3", tombol **Tambah**,
**Duplikat**, **Hapus**, dan petak "+" di ujung deretan. Klik thumbnail = `goToPage`.
Pemberitahuan singkat ("Halaman dihapus. Tekan Ctrl+Z untuk membatalkan.") tampil di
samping label. Selama export semua halaman strip dikunci.

**Lipat / buka (v9).** Tombol chevron (`▾` / `▴`, `data-page-action="toggle-tray"`) di kiri
label melipat strip: thumbnail dan tombol Tambah/Duplikat/Hapus disembunyikan, yang tersisa
hanya bilah tipis berisi label halaman dan tombol **‹ ›** (halaman sebelumnya/berikutnya,
bila ada lebih dari satu halaman). Kanvas mendapat tingginya dan langsung *fit* lagi (hook
zoom mengamati ukuran areanya dengan `ResizeObserver`; di 1440×900 tinggi area kanvas naik
dari 567 ke 681 px dan zoom dari 48 % ke 59 %). Pilihannya disimpan di `localStorage`
(`kusukaedit.pageTrayCollapsed`), dengan `try/catch` agar mode privat tetap berjalan.

Tab **Kanvas** punya kotak centang **Terapkan ke semua halaman**: bila dicentang, ukuran
dan latar yang diubah berlaku untuk seluruh halaman (`setCanvasMeta(meta, { allPages:
true })`), satu langkah undo; bila tidak, hanya halaman aktif.

---

## Tata letak antarmuka

Susunan mengikuti Polotno: **header** dengan Undo/Redo dan **Ekspor**, **panel samping**
dengan rel tab di kiri (semua yang **masuk**: elemen, impor, template, pengaturan kanvas),
kontrol **kontekstual** di atas kanvas, dan **strip halaman** yang bisa dilipat di bawah.
Sejak v9 tidak ada lagi kolom kanan.

```
┌─ header: judul ─────────────────────────── Undo  Redo  [⬇ Ekspor ▾] ┐
│ rel │ panel tab  │  ContextualToolbar (mengikuti seleksi)            │
│ tab │  aktif     │  ImageStylePanel (Filter | Efek | …)              │
│     │ (bisa      │  Kanvas (Stage) + kontrol zoom                    │
│     │  dilipat)  │  PageStrip ▾ (thumbnail halaman, bisa dilipat)    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Rel tab vertikal** (`SidePanel.tsx`): **Elemen** (tambah teks dan bentuk, pintasan ke
  Impor), **Impor** (proyek JSON, gambar, template — lihat "Impor & ekspor berkas"),
  **Template** (kartu thumbnail), **Kanvas** (ukuran, rasio, latar, "terapkan ke semua
  halaman", dan **Desain baru** yang dulu bernama "Kosongkan Dokumen" di panel kanan).
  Mengklik tab yang sedang aktif **melipat** panel (tinggal rel); tombol `«` di kepala panel
  juga melipatnya.
- **`ContextualToolbar`**: satu baris kontrol untuk elemen terpilih (lihat "Toolbar
  kontekstual ala Polotno"); di jendela sempit bisa digulir ke samping.
- **`ImageStylePanel`** muncul di bawah toolbar bila gambar dipilih dan tombol **✦ Efek**
  menyala; tiga kartu berdampingan — lihat "Filter & efek gambar".
- **Header**: Undo, Redo, lalu **⬇ Ekspor ▾** (`ExportMenu.tsx`).

---

## Impor & ekspor berkas (alur Polotno)

Polotno memisahkan arah berkas: **masuk** lewat panel kiri (tab *Import*: satu kartu per
jenis berkas, masing-masing dengan tombol "Choose file") dan **keluar** lewat tombol
*Download* di bilah atas. Sejak v9 editor ini sama.

### Masuk: tab Impor (`ImportPanel.tsx`)

| Kartu | Isi |
|---|---|
| **Proyek desain (JSON)** | **Pilih berkas** (`.json`, `.polotno`) → berkas dibaca dan **dideteksi dulu** tanpa mengubah desain: kartu pratinjau menampilkan thumbnail halaman pertama, nama berkas, lencana format (**KusukaEdit** / **Polotno**), jumlah halaman dan elemen, ukuran (`1080 × 1080 px` atau `2 ukuran berbeda`), dan semua peringatan adapter. **Buka desain** mengganti seluruh dokumen (satu langkah undo, sama seperti dulu); **Batal** membuang pratinjau. Berkas rusak menampilkan pesan galat adapter, dan desain tidak tersentuh |
| **Gambar** | **Pilih berkas** (PNG, JPG, WebP, GIF, SVG) → dipasang di halaman aktif, sama dengan alur unggah sebelumnya; seret-lepas ke kanvas tetap bisa |
| **Template** | pintasan **Buka galeri template** ke tab Template |

Pratinjau dibuat oleh `previewImport(text, fileName)` di `lib/fileFlow.ts` (fungsi murni di
atas `parseDocument`, diuji di Node); yang dibuka lewat **Buka desain** adalah teks berkas yang
sama, lewat `loadFromJSON` seperti sebelumnya. Bedanya dengan v8: dulu berkas langsung
mengganti desain begitu dipilih; sekarang pengguna melihat dulu apa yang terdeteksi.

### Keluar: tombol Ekspor di header (`ExportMenu.tsx`)

Tombol **⬇ Ekspor ▾** di kanan Undo/Redo membuka satu menu:

1. **Jenis berkas** (`data-export-format`): **PNG**, **JPG**, **JSON KusukaEdit**,
   **JSON Polotno**, masing-masing dengan keterangan singkat.
2. Untuk PNG/JPG: **Resolusi** 1x / 2x / 3x dan **Halaman** — *Halaman aktif* atau
   *Semua (n) · ZIP* (nonaktif bila hanya ada satu halaman).
3. Ringkasan hasil (`Kanvas 1080 × 1080 px → 2160 × 2160 px`, atau isi ZIP / isi berkas JSON).
4. **Unduh …** — memanggil fungsi yang sama dengan panel kanan dulu (`exportStageAsImage`,
   `exportAllPagesAsZip`, `exportToJSON`), jadi hasil berkasnya tidak berubah.

Pesan hasil dan peringatan tampil di bawah tombol Unduh. Jenis berkas dan resolusi terakhir
diingat di `localStorage` (`kusukaedit.export`). Menu tertutup dengan `Esc` atau klik di
luarnya; saat export semua halaman berjalan, menu menutup dan kanvas menampilkan progres.

---

## Tata letak responsif

`app/globals.css` (bagian "v9") dan `SidePanel.tsx`:

- **Kolom utama** memakai CSS Grid `auto minmax(0, 1fr)`: panel kiri selebar isinya
  (300 px terbuka, 72 px bila dilipat), kanvas sisanya. Tidak ada lebar tetap lain, jadi
  halaman tidak pernah bergulir ke samping (diperiksa pada 1440, 900, dan 420 px).
- **Drawer** di bawah 1100 px (`useMediaQuery("(max-width: 1100px)")`): hanya rel tab yang
  menempati kolom; isi tab melayang di atas kanvas (lebar maks. 320 px, bayangan, latar
  gelap di belakangnya). Drawer mulai tertutup; klik tab membukanya, klik latar gelap,
  tombol `«`, atau `Esc` menutupnya. Melebarkan jendela lagi membuat panel kembali menjadi
  kolom yang terbuka.
- **Toolbar kontekstual** tidak lagi membungkus: bila tidak muat ia bergulir ke samping
  (`overflow-x: auto`). Panel popover (Efek, Spasi, Balik, Mask, Posisi) memakai
  `position: fixed` yang dihitung dari posisi tombolnya dan dijepit ke dalam jendela,
  karena kotak yang bergulir akan memotong apa pun yang keluar dari batasnya; popover
  tertutup bila toolbar digulir.
- **Di bawah 760 px**: subjudul header dan teks "Undo/Redo" disembunyikan (ikon tetap), padding
  diperkecil, rel tab dipersempit, tombol strip halaman diperkecil dan boleh turun baris.
- **Kanvas** tetap *fit* otomatis: `useCanvasZoom` mengukur area dengan `ResizeObserver`,
  jadi melipat panel kiri, melipat strip halaman, membuka panel Efek, atau mengubah ukuran
  jendela langsung menghitung ulang skala Stage tanpa terpotong.

---

## Upload gambar & manajemen memori

### Alur

1. Tab **Impor** (rel tab di kiri) → kartu **Gambar** → **Pilih berkas** membuka
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
4. **Ganti** (grup "Gambar" di toolbar, saat gambar terpilih) menjalankan alur yang sama
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

- Crop gambar dilakukan lewat mode **Pangkas** (lihat "Pemangkasan (crop) gambar");
  gambar yang baru diunggah atau di-drop selalu masuk utuh.
- SVG tanpa `width`/`height` bawaan ditempatkan 300×150 lalu diskalakan seperti gambar
  lain. Berkas SVG yang diunggah ditandai `vector: true`.
- Gambar tidak diunggah ke server; semuanya berada di browser sampai Anda mengekspor.

---

## Pengaturan workspace (ukuran, rasio, latar)

Tab **Kanvas** di panel kiri (`WorkspacePanel.tsx`) mengubah objek `canvas` **halaman
aktif** (tipe `CanvasMeta`: `{ width, height, backgroundColor }`) di store lewat
`setCanvasMeta`; kotak centang **Terapkan ke semua halaman** membuat perubahan itu
berlaku untuk seluruh dokumen (`{ allPages: true }`, satu langkah undo).

| Kontrol | Perilaku |
|---|---|
| **Lebar × Tinggi** | Diketik sebagai draf dan diterapkan saat **Enter** atau klik di luar kolom — bukan per ketukan, supaya mengetik `1080` tidak menghasilkan kanvas 1, 10, lalu 108 px. Nilai dibulatkan dan dibatasi **50–4000 px**; kolom langsung menampilkan angka yang diterima. Kolom kosong kembali ke ukuran saat ini |
| **Rasio** | Tombol 1:1, 4:5, 4:3, 16:9, 9:16. Sisi **terpanjang** dipertahankan (900×600 + 1:1 → 900×900; + 9:16 → 506×900) agar ukuran kerja tidak tiba-tiba melonjak. Tombol rasio yang cocok dengan ukuran sekarang ditandai aktif; ukuran khusus tidak menandai apa pun |
| **Latar belakang** | Pemilih warna + beberapa swatch; disimpan sebagai `#rrggbb` |
| **Terapkan ke semua halaman** | Bila dicentang, ukuran, rasio, dan latar yang diubah berlaku untuk **setiap** halaman; bila tidak, hanya halaman aktif (halaman lain mempertahankan ukurannya) |
| **Peringatan** | Mengecilkan kanvas **tidak** menggeser atau menskalakan desain. Elemen yang berada sepenuhnya di luar batas tetap ada (tak terlihat, tak ikut export) dan panel menyebutkan jumlahnya |

### Sinkronisasi ke kanvas dan export

`canvas.width/height` di store langsung menjadi: ukuran desain `<Stage>` Konva
(ditampilkan × zoom, lihat bagian berikutnya), kotak `.stage-wrap` (yang juga
menjadi acuan overlay edit teks), dan persegi latar belakang. Hasil export gambar
selalu = ukuran kanvas × `pixelRatio` — pada zoom berapa pun — tanpa langkah
tambahan; menu Ekspor di header menampilkan hitungannya (`Kanvas 1200 × 675 px →
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
  `ExportMenu` dari store, bukan dibagi balik dari ukuran Stage yang sudah
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

## Drag-and-drop gambar ke kanvas

Seret berkas gambar dari desktop (atau file manager) ke area kanvas, lepaskan, dan
gambar langsung masuk ke store **di posisi kursor dilepas**. Kodenya:
`CanvasWorkspace.tsx` (penanganan event) dan `src/lib/dropImage.ts` (bagian murni
yang diuji di Node).

**Alur satu drop**

1. `onDragEnter` / `onDragOver` / `onDragLeave` / `onDrop` dipasang pada pembungkus
   `.canvas-area` (kanvas + area abu-abu di sekelilingnya + tombol zoom). Hanya
   seretan yang membawa **berkas** (`dataTransfer.types` berisi `"Files"`) yang
   diterima; teks atau tautan yang diseret tidak disentuh. `dragover` di-`preventDefault()`
   (tanpa itu browser menolak drop) dan `dropEffect = "copy"`.
2. Saat berkas melintas, lapisan `.drop-overlay` ("Lepaskan gambar di sini…")
   muncul. `dragenter`/`dragleave` juga terpicu untuk setiap elemen anak yang
   dilewati kursor, jadi lapisan itu dikendalikan **penghitung kedalaman**, bukan
   `dragleave` mentah (kalau tidak, lapisannya berkedip).
3. `onDrop`: berkas diambil dari `e.dataTransfer.files[0]` (`pickDroppedFile`). Bila
   berkas pertama bukan gambar tetapi ada gambar lain di antara yang dilepas, gambar
   pertama itu yang dipakai; berkas lebihan tidak dipasang dan pengguna diberi tahu.
4. **Koordinat**: titik kursor dihitung terhadap Stage, dalam piksel **desain**:
   `desain = (kursor − pojok kiri-atas Stage di layar) ÷ zoom`. Pojok Stage diambil
   dari `getBoundingClientRect()` pembungkus Stage (yang ukurannya persis Stage), jadi
   scroll dan pemusatan kanvas ikut terhitung, dan pembagian dengan `zoom` membuat
   hasilnya benar pada 31%, 100%, atau 200%. Nilai ini dibaca **sebelum** `await`
   apa pun — tampilan bisa bergeser selama gambar dimuat. Drop di area abu-abu di
   luar kanvas jatuh di titik kanvas terdekat.
5. `prepareImageFile(file)` memvalidasi (harus `image/*`, ≤ 25 MB), membuat
   `URL.createObjectURL(file)`, dan memuat gambar sekali (mengisi cache) — pada
   kegagalan URL-nya di-revoke. Lalu `addImageElement(prepared, { at })` meletakkan
   **titik tengah** gambar di kursor (ukuran sama seperti upload: ≤ 60% kanvas),
   memilihnya, dan mencatat **satu langkah undo**. Pesan galat ("bukan berkas gambar",
   "lebih besar dari 25 MB", "tidak bisa dibuka") muncul di `.drop-notice` (bisa
   ditutup, hilang sendiri setelah 6 detik) dan tidak membuat elemen kosong.

**Penjaga di tingkat jendela.** Bila gambar dilepas di luar kanvas (misalnya di
panel samping), perilaku bawaan browser adalah *membuka gambar itu di tab ini* —
editor diganti dan desain hilang. Karena itu `dragover`/`drop` berkas dibatalkan di
seluruh halaman, dan kursor menunjukkan "tidak boleh" di luar kanvas.

**Hal yang sengaja begitu:** satu gambar per drop (sesuai `files[0]`); gambar
dipusatkan di kursor dan *tidak* digeser agar seluruhnya masuk kanvas (drop dekat
tepi menghasilkan gambar yang sebagian keluar; titik tengahnya selalu tetap di
dalam kanvas).

---

## Pemangkasan (crop) gambar

**Cara memakai.** Klik dua kali gambar, atau pilih gambar lalu tekan **Pangkas** di
toolbar. Muncul lapisan crop (`CropOverlay.tsx`): gambar **utuh** pada ukurannya sekarang,
dengan lapisan gelap di luar **jendela potong** (bagian yang tetap terlihat), grid 3×3, 8
handle amber pada jendela, dan **pegangan bulat** di keempat sudut gambar utuh. Sejak v9
alurnya seperti Polotno: **tidak ada banner, teks petunjuk, atau tombol Selesai** di bawah
gambar — tarik handle, lalu klik di mana saja di luar gambar (atau `Enter`/`Esc`) untuk
selesai.

| Aksi | Hasil |
|---|---|
| Seret tepi atau sudut bingkai | Tepi itu bergerak; kotak ikut mengecil/membesar. **Gambar tidak pernah diskalakan ulang** — piksel yang tetap terlihat tetap di tempatnya di kanvas |
| Seret isi bingkai | Gambar digeser di bawah bingkai (kotak tetap; bagian lain gambar yang terlihat) |
| Seret **pegangan bulat** di sudut gambar utuh (v9) | Foto **diperbesar/diperkecil di dalam bingkai**, proporsional, dengan sudut seberangnya tetap; kotak di kanvas tidak bergerak. Foto tidak bisa lebih kecil dari bingkai (selalu menutupinya) dan paling besar 20× ukurannya — `scaleCropPicture()` di `lib/crop.ts` |
| Klik di luar gambar (kanvas, panel, header), `Enter`, `Esc` | Selesai: mode crop ditutup. Toolbar kontekstual dan panel Efek **tidak** dihitung "di luar" — kontrolnya bekerja pada gambar itu, dan tombol **✓ Selesai** di toolbar tetap ada seperti tombol *Done* Polotno |
| **Reset** (grup "Pangkas" di toolbar) | Tampilkan lagi seluruh gambar pada skalanya saat ini |
| `Ctrl/Cmd + Z` | Batalkan gestur crop terakhir (dan tutup mode crop) |

Selama mode crop, `Delete` dan panah tidak berlaku (gambar tidak terhapus/bergeser
tanpa sengaja) dan Transformer dilepas.

### Indikator visual: lapisan gelap dan handle siku

Dua hal sengaja dibuat berbeda dari mode resize supaya keduanya tidak tertukar
(`CropOverlay.tsx` dan blok `.crop-editor*` di `globals.css`):

1. **Lapisan gelap (dimming mask).** Gambar utuh tetap terlihat, tetapi bagian di luar
   jendela potong — yang akan terbuang — digelapkan oleh lapisan hitam
   semi-transparan, dan berubah langsung saat handle diseret (pratinjau, bukan
   sesudahnya). Caranya: sebuah elemen "lubang" seukuran jendela potong
   (`.crop-editor__hole`) dengan `box-shadow: 0 0 0 9999px rgba(6, 8, 12, 0.66)`, di dalam
   pembungkus seukuran gambar utuh yang `overflow: hidden`. Bayangan raksasa itu
   menggelapkan semua yang ada di luar lubang tetapi terpotong di tepi gambar, jadi
   kanvas di sekeliling gambar tidak ikut gelap. Jendela potong sendiri diberi garis
   putih tipis dan garis bantu sepertiga.
2. **Handle khas crop-tool.** Delapan handle berwarna **amber `#ffb020`**: empat sudut
   berupa **siku "L" tebal** (dua batang tegak lurus, `::before` dan `::after`) dan
   empat tepi berupa batang tebal pendek (chip "PANGKAS" dan petunjuk di bawah gambar
   dihapus di v9), ditambah pegangan bulat putih bercincin amber di sudut gambar utuh.
   Ukurannya tetap di layar pada zoom berapa pun (`--unit = 1 ÷ zoom`). Transformer
   (resize) tampil sebaliknya: bingkai **biru `#5b8cff`** dengan **titik putih bulat**
   (`anchorFill: "#ffffff"`, `anchorCornerRadius: 5`). Selama crop Transformer
   dilepas, jadi tidak pernah ada dua set handle sekaligus.

**Pecahan, bukan piksel.** Crop disimpan sebagai pecahan 0..1 dari gambar:
`cropX/cropY` (sudut kiri-atas bagian yang terlihat) dan `cropWidth/cropHeight`
(ukurannya). Seluruh gambar selalu tampil pada satu ukuran tetap
`width ÷ cropWidth` × `height ÷ cropHeight`; crop hanyalah "jendela" ke gambar itu,
sehingga semua operasi (`src/lib/crop.ts`) cukup memakai pecahan dan kotak — tanpa
ukuran asli. Mengubah tepi kiri/atas menggeser sudut kotak sebesar yang sama
**sepanjang sumbu elemen yang sudah diputar**, jadi gambar yang dirotasi atau
dicerminkan juga terpangkas di sisi yang tampak benar (pada gambar yang dibalik,
sisi kiri yang terlihat adalah sisi kanan berkasnya). Jendela tidak bisa keluar dari
gambar dan sisinya minimal 10 px.

**Pecahan → piksel asli → Konva.** Pada saat menggambar, `ElementRenderer`
menghitung `cropToSourcePixels(crop, image.naturalWidth, image.naturalHeight)`:
`x = cropX × naturalWidth`, `y = cropY × naturalHeight`, `width = cropWidth ×
naturalWidth`, `height = cropHeight × naturalHeight`. Persegi itu diteruskan ke
`drawImage(image, sx, sy, sw, sh, 0, 0, width, height)` — persis yang dilakukan
properti `crop` bawaan `Konva.Image`. Gambar utuh (0, 0, 1, 1) tidak memakai crop
sama sekali, sehingga SVG tetap tajam.

**History.** Selama gestur, hanya pratinjau lokal di overlay yang berubah; baru
saat kursor dilepas `setImageCrop` menulis ke store **satu kali** → satu gestur =
tepat satu langkah undo, berapa lama pun gestur itu (tidak bergantung pada jeda
batch 500 ms). Klik gagang tanpa menggeser tidak menulis apa-apa. Undo/Redo
mengembalikan kotak **dan** crop bersama-sama.

**Sengaja begitu:** (1) tidak ada "batal" — setiap gestur langsung tersimpan,
`Esc` sama dengan `Enter` (selesai), dan pembatalan lewat `Ctrl+Z` (Polotno punya tombol
*Cancel*; di sini setiap gestur adalah satu langkah undo);
(2) overlay crop adalah lapisan DOM (seperti editor teks), bukan `Transformer`
Konva, sehingga bisa diuji di browser tanpa Konva; (3) selama mode crop efek
(filter warna, blur, sudut membulat, mask, bayangan, garis tepi) tidak ditampilkan —
node asli disembunyikan dan yang tampak adalah gambar polos beserta bingkainya.

---

## Filter & efek gambar

Elemen `image` memiliki field filter dan efek opsional (`src/types/editor.ts`); field
yang tidak ada = tidak ada efek, jadi file lama tetap valid dan tidak berubah.

### Panel Filter & Efek (UI)

Pilih gambar → tombol **✦ Filter & Efek** di toolbar membuka `ImageStylePanel` di bawah
toolbar. Tiga kartu berdampingan, supaya tampilan gambar diatur di satu tempat:

| Kartu | Isi |
|---|---|
| **Filter** | Chip preset **Asli · Hitam-putih · Sepia · Pudar · Cerah · Hangat · Dingin · Dramatis**; slider **Kecerahan**, **Kontras**, **Saturasi** (−100…100, klik dua kali = 0); **Reset** |
| **Efek** | **Blur** (0–100 px), **Sudut membulat** (0 sampai setengah sisi terpendek; dimatikan bila gambar bermask), tombol bentuk **Persegi · Lingkaran · Segitiga** (mask); **Reset** |
| **Bayangan & garis** | Saklar bayangan, warna, blur, geser X/Y, kepekatan; **garis tepi** (warna, tebal) |

Semuanya lewat satu aksi, `setImageStyle(id, patch)`: nilai dijepit ke rentangnya,
nilai tak valid diabaikan, `undefined` menghapus field (gambar yang tak diubah tetap
bebas dari field gaya). Menggeser slider = **satu langkah undo**. Panel tertutup
sampai diminta, menghilang bila yang dipilih bukan gambar, dan membuka lagi untuk
gambar berikutnya. Bila gambar dari situs lain tanpa izin CORS, panel memberi tahu
bahwa filter warna tidak bisa dipakai pada gambar itu (lihat di bawah).

### Field di `ImageElement`

| Field | Arti |
|---|---|
| `brightness` | −100…100, **ditambahkan** ke tiap kanal (±100 = ±255 tingkat); 0/tidak ada = netral |
| `contrast` | −100…100; kanal diregangkan di sekitar abu-abu tengah (faktor 0…2) |
| `saturation` | −100…100; −100 = hitam-putih, +100 = dua kali lebih pekat (faktor 0…2) |
| `filterPreset` | `"grayscale"`, `"sepia"`, `"vivid"`, `"fade"`, `"warm"`, `"cool"`, `"dramatic"` |
| `cornerRadius` | Sudut membulat, piksel desain (maks. 2000; dijepit setengah sisi terpendek saat digambar); **tidak berlaku bila ada mask** |
| `blurRadius` | Blur dalam piksel desain; 0/tidak ada = tajam (maks. 100) |
| `stroke`, `strokeWidth` | Warna (`#rrggbb`) dan tebal garis tepi (maks. 100) |
| `shadowColor`, `shadowBlur` | Warna dan kelembutan bayangan (maks. 200). Bayangan hanya ada bila `shadowColor` diisi dan ada blur atau offset |
| `shadowOffsetX`, `shadowOffsetY` | Pergeseran bayangan (−1000..1000) |
| `shadowOpacity` | 0..1, dikalikan dengan alpha warna bayangan |
| `maskShape` | `"circle"` atau `"triangle"` |

Efek yang tidak akan terlihat (kecerahan 0 tanpa preset, blur 0, garis tebal 0, …)
dianggap mati: tidak digambar dan tidak ditulis ke Polotno.

### Filter warna: satu matriks 4×5

Kecerahan, kontras, saturasi, dan preset adalah **satu matriks warna 4×5**
(`src/lib/imageFilters.ts`, konvensi yang sama dengan `feColorMatrix` SVG). Matriks
saling dikalikan, jadi semua filter gambar itu diterapkan dalam **satu lintasan** piksel.
Urutan: **preset lebih dulu** (tampilannya), lalu saturasi, kontras, dan terakhir
kecerahan (aditif) — sehingga slider tetap berpengaruh di atas preset apa pun.

| Preset | Matriks |
|---|---|
| Hitam-putih | `saturate(0)` |
| Sepia | matriks sepia standar |
| Cerah | kontras ×1,10 + saturasi ×1,4 |
| Pudar | saturasi ×0,75, kontras ×0,82, kecerahan +0,06 |
| Hangat / Dingin | merah/biru ×1,08/0,9 (atau sebaliknya) + sedikit offset |
| Dramatis | saturasi ×0,8, kontras ×1,35, kecerahan −0,04 |

Cara menggambarnya: `ElementRenderer` membuat **salinan tersaring** dari bagian
gambar yang terlihat (di `<canvas>` DOM, sisi terpanjang dibatasi 2560 px, di-*memo*
menurut gambar + crop + kunci filter) dan menggambar salinan itu **sebagai gantinya**
— jadi hanya gambarnya yang berubah warna; garis tepi dan bayangan tidak ikut
tersaring. Bila browser menolak membaca piksel (gambar lintas-situs tanpa CORS
"mencemari" canvas), gambar tampil **tanpa filter** dan panel memperingatkan.
Matriks yang sama diberikan ke `<feColorMatrix>` untuk thumbnail template/halaman.

*Penyimpangan dari "pakai filter Konva":* `Konva.Filters.Brighten/Contrast/HSL`
bekerja pada bitmap hasil `cache()` seluruh node, sehingga ikut mewarnai garis tepi dan
bayangan, dan tidak bisa diuji di Node. Matriks sendiri diuji angka demi angka.

### Terjemahan Polotno ↔ KusukaEdit

| Polotno (`image` dan `svg`) | KusukaEdit |
|---|---|
| `blurEnabled: true` + `blurRadius` (default Polotno 10) | `blurRadius` |
| `borderSize` > 0 + `borderColor` (default `black`) | `strokeWidth` + `stroke` |
| `shadowEnabled: true` + `shadowColor` (`black`), `shadowBlur` (5), `shadowOffsetX/Y` (0), `shadowOpacity` (1) | `shadowColor`, `shadowBlur`, `shadowOffsetX/Y`, `shadowOpacity` (alpha `rgba(...)` pada warna dikalikan `shadowOpacity`) |
| `clipSrc` lingkaran / segitiga | `maskShape: "circle"` / `"triangle"` |
| `cornerRadius` (px) | `cornerRadius` |
| `brightnessEnabled: true` + `brightness` (−1…1) | `brightness` (×100) |
| `grayscaleEnabled` / `sepiaEnabled` | `filterPreset: "grayscale"` / `"sepia"` (bila keduanya aktif: hitam-putih, dilaporkan) |
| `filters.contrast.intensity` / `filters.saturation.intensity` (−1…1) | `contrast` / `saturation` (×100) |
| *(tidak ada padanan Polotno)* cerah, pudar, hangat, dingin, dramatis | disimpan di `custom.filterPreset` (+ `custom.source`) dan dibaca kembali oleh editor ini; Polotno asli mengabaikannya |

Aturannya (`src/lib/polotnoEffects.ts`):

- Blur, bayangan, dan kecerahan **hanya dibaca bila `blurEnabled` / `shadowEnabled` /
  `brightnessEnabled` bernilai `true`**. Nilai bawaan Polotno (`blurRadius: 10`,
  `shadowBlur: 5`, …) ada di berkas yang efeknya mati dan tidak boleh menyalakannya.
- Efek yang tidak akan terlihat tidak dibawa sama sekali.
- **Bentuk mask** dikenali dari `clipSrc`, yang di Polotno adalah URL sebuah SVG
  dan tidak bisa kita ambil dari sini: (a) untuk `data:image/svg+xml`, SVG-nya
  dibaca — `<circle>`/`<ellipse>` = lingkaran; `<polygon>` atau path garis lurus
  dengan tiga sudut = segitiga; path berisi busur atau empat Bézier = lingkaran;
  (b) untuk URL biasa, ditebak dari **nama berkasnya** (`circle.svg`,
  `triangle.svg`, `segitiga`, `lingkaran`, …). Bentuk lain (bintang, hati, …)
  **tidak ditebak**: gambar tampil persegi dan satu peringatan menyebut jumlahnya.
- `cornerRadius` **tetap ditulis walau ada mask** (di layar mask yang menang, tetapi
  Polotno bisa memegang keduanya dan berkas yang dibaca lalu ditulis lagi tidak boleh
  kehilangan angka itu).
- Filter bernama lain di `filters` (blur, brightness, noise, …) **diabaikan dan
  dilaporkan satu kali** (jumlah elemen); `contrast`/`saturation` saja tidak
  menimbulkan peringatan.
- Yang masih belum didukung tetap diperingatkan: `maskSrc` (mask SVG), filter lain.
  Blur dan filter warna pada **teks dan bentuk** juga belum. (`opacity` dan bayangan
  didukung untuk semua tipe sejak v8, lihat "Efek lintas elemen".)

Arah sebaliknya (`imageEffectsToPolotno`): hanya efek yang aktif yang ditulis;
gambar tanpa efek menghasilkan berkas yang sama persis seperti sebelumnya. Pulang-pergi
native → Polotno → native diuji tidak kehilangan satu efek pun.

> **Belum dipastikan** (halaman skema Polotno tidak menjelaskannya): nama dan arti
> `filters.contrast` / `filters.saturation` (dipakai: `intensity` −1…1 ×100 = skala
> slider di sini), dan bahwa `brightness` Polotno bersifat **aditif** seperti Brighten
> Konva. Preset selain hitam-putih dan sepia **hanya** hidup di `custom`.

Berkas contoh: [`examples/sample-effects.polotno.json`](./examples/sample-effects.polotno.json)
(gambar blur; lingkaran dengan garis tepi + bayangan; segitiga dari `clipSrc` URL;
crop + garis + bayangan; lingkaran cermin + blur) dan template **Katalog produk**
(kecerahan, sepia, hitam-putih, kontras+saturasi, blur, sudut membulat, mask) — dimuat
**tanpa peringatan**. Pakai tab **Impor** (kartu Proyek desain) atau tab **Template**.

### Cara digambar

`ElementRenderer.tsx` (komponen yang dirender `CanvasWorkspace`, dan yang memegang
node Konva-nya) + `src/lib/drawPicture.ts`:

- **Blur** — `Konva.Filters.Blur` bekerja pada bitmap hasil `cache()`. Urutannya
  `node.cache({ pixelRatio })` → `node.filters([Konva.Filters.Blur])` →
  `node.blurRadius(r)`. Cache adalah *snapshot*: tidak mengikuti perubahan node
  setelahnya, jadi efek `useLayoutEffect` memanggil ulang urutan itu setiap kali
  gambar, ukuran, crop, cermin, mask, sudut, filter, garis, bayangan, atau zoom
  berubah, dan memanggil `clearCache()` bila blurnya dihapus. Karena filter bekerja
  dalam **piksel bitmap**, bitmap di-cache pada resolusi tampilnya (zoom × rasio
  piksel layar, dibatasi 4× dan 8192 px) dan radius dikalikan rasio itu — blur
  menutupi bagian gambar yang sama pada layar 1× maupun 2× dan pada zoom 400%.
- **Garis tepi & bayangan** — atribut node (`stroke`, `strokeWidth`, `shadowColor`,
  `shadowBlur`, `shadowOffsetX/Y`, `shadowOpacity`, `shadowEnabled`).
  `perfectDrawEnabled={false}` agar Konva memasang bayangan pada setiap panggilan
  gambar di `sceneFunc`. Garis digambar **di atas gambar**, berpusat pada tepi
  (di luar klip, jadi separuh luar garis tebal tidak terpotong).
- **Mask dan sudut membulat** — gambar dipotong ke lingkaran (elips yang menyentuh
  keempat sisi kotak), segitiga (puncak di tengah-atas, alas di sisi bawah), atau
  **persegi panjang bersudut bulat** (empat busur; jari-jari dijepit ke setengah sisi
  terpendek) dengan `context.clip()` di dalam `sceneFunc`. Cermin dan crop terjadi
  *di dalam* klip; klip tidak ikut dicerminkan. Area klik mengikuti bentuk klip
  (sudut transparan lingkaran, atau sudut yang dibulatkan, tidak bisa diklik). Garis
  tepi mengikuti bentuk yang sama.
- **Bayangan gambar berklip** — klip memotong bayangan juga (tepat di luar bentuk,
  tempat bayangan seharusnya terlihat). Karena itu bayangan dilempar lebih dulu
  oleh siluet bentuk yang dipotong dengan klip "seluruh bidang kecuali bentuk itu"
  (`clip("evenodd")`): hanya bayangan di luar bentuk yang selamat, lalu gambar
  menutup bagian dalamnya. Node memakai `fill` hitam buram hanya untuk keperluan
  ini (warnanya tidak pernah terlihat).

### Penyimpangan dari permintaan: `<Group clipFunc>`

Permintaan menyebut `<Group clipFunc={...}>`. Yang dipakai adalah klip di dalam
`sceneFunc` node gambar itu sendiri, bukan pembungkus `Group`, dengan hasil
piksel yang sama (jalur klip identik). Alasannya: (1) node gambar tetap satu `Shape`
yang sama, sehingga `Transformer`, drag, dan registrasi node tidak berubah dan tidak
perlu mengikat Transformer ke `Group`; (2) klip `Group` memotong bayangan anak-anaknya,
sedangkan bayangan gambar bermask harus terlihat di luar mask — itu hanya bisa
diselesaikan bila klip, siluet, dan garis tepi berada dalam satu gambar; (3) area
klik harus mengikuti mask. Bila Anda tetap ingin `Group`, perubahannya terlokalisasi
di `ImageNode`.

---

---

## Efek lintas elemen (teks, bentuk, gambar)

Sampai v7, transparansi, bayangan, dan garis tepi hanya milik `ImageElement`. Di v8
field-field ini pindah ke **`BaseElement`** (`src/types/editor.ts`), sehingga berlaku
untuk `TextElement`, `ShapeElement`, dan `ImageElement`:

| Field | Tipe | Arti | Polotno |
|---|---|---|---|
| `opacity` | `0..1` | transparansi seluruh elemen; tidak ada = 1 | `opacity` |
| `shadowColor` | `#rrggbb` | warna bayangan; tidak ada = tanpa bayangan | `shadowEnabled: true` + `shadowColor` |
| `shadowBlur` | px | kelembutan bayangan | `shadowBlur` |
| `shadowOffsetX` / `shadowOffsetY` | px | geser bayangan | sama |
| `shadowOpacity` | `0..1` | dikalikan ke warna bayangan | `shadowOpacity` × alfa warna |
| `stroke` / `strokeWidth` | `#rrggbb` / px | **teks**: garis tepi huruf (opsional); **bentuk**: garis tepi (wajib, seperti sebelumnya); **gambar**: bingkai (`borderColor`/`borderSize` di Polotno) | teks & bentuk: `stroke`/`strokeWidth` |

**Penggambaran** (`ElementRenderer.tsx` — komponen yang dirender oleh
`CanvasWorkspace.tsx`; permintaan menyebut `CanvasWorkspace.tsx`, tetapi node Konva tiap
elemen dibuat di `ElementRenderer`, jadi di sanalah atribut efek dipasang):

- `Konva.Text`: `opacity`, `shadow*`, `stroke`/`strokeWidth` dengan
  `fillAfterStrokeEnabled` (garis di belakang huruf, tidak memakan bentuk hurufnya).
- `Rect` / `Ellipse`: `opacity` dan `shadow*` (garis tepinya sudah ada sejak v1).
- Gambar (`Shape` dengan `sceneFunc`): `opacity` di node; bayangan tetap digambar oleh
  `drawPicture` seperti sebelumnya (perlu siluet untuk gambar bermask).
- Atribut bayangan dibuat oleh satu fungsi (`shadowProps(resolveShadow(el))`), jadi
  aturan "bayangan yang tidak terlihat dimatikan" (tanpa warna, opasitas 0, atau tanpa
  blur dan tanpa geser) sama untuk semua tipe.

**Mengubahnya:** aksi store `setElementStyle(id, patch)` (lihat tabel Actions). Patch
divalidasi oleh `applyElementStylePatch` di `lib/imageStyle.ts`: angka dijepit, warna
harus terbaca, `undefined` menghapus field, dan patch yang tidak mengubah apa pun tidak
membuat langkah undo. Di UI: menu **✦ Efek** pada toolbar teks/bentuk (Transparansi,
Bayangan + warna/blur/geser/kepekatan, dan untuk teks Garis tepi huruf), dan slider
**Transparansi** baru di panel Filter & Efek gambar.

**Adapter Polotno:** `readPolotnoCommonEffects` / `shadowToPolotno` di
`lib/polotnoEffects.ts` dipakai untuk **semua** tipe elemen. Bayangan dibaca hanya bila
`shadowEnabled === true` (aturan yang sama dengan efek gambar), `opacity < 1` disalin, dan
keduanya **tidak lagi masuk peringatan** "efek yang belum didukung". (Sejak v10 blur, filter
warna, latar teks, teks melengkung, dan `dash` juga didukung; lihat bagian berikutnya.)

## Efek Polotno tanpa peringatan (v10)

Sampai v9, `convertPolotnoToKusuka()` (`src/lib/polotnoAdapter.ts`) membuang blur dan filter
warna pada teks/bentuk, latar teks, teks melengkung, dan garis putus-putus ke daftar
`warnings`. Di v10 semuanya punya tempat di skema (native **v5**), digambar di kanvas, bisa
diatur dari toolbar, dan ditulis kembali ke Polotno.

### Field baru (`src/types/editor.ts`)

| Field | Di | Arti | Polotno |
|---|---|---|---|
| `blurRadius` | semua elemen (sebelumnya hanya gambar) | blur px | `blurEnabled` + `blurRadius` |
| `brightness` / `contrast` / `saturation` | semua elemen | −100..100 | `brightnessEnabled` + `brightness` (×100), `filters.contrast/saturation.intensity` (×100) |
| `filterPreset` | semua elemen | hitam-putih, sepia, dll. | `grayscaleEnabled` / `sepiaEnabled`; preset lain di `custom.filterPreset` |
| `dash` | semua elemen | pola garis tepi dalam px desain, mis. `[10, 5]`; tidak ada = garis utuh | bentuk: `dash` (lihat di bawah); teks/gambar: `custom.dash` (Polotno tidak punya) |
| `backgroundEnabled`, `backgroundColor`, `backgroundOpacity`, `backgroundCornerRadius`, `backgroundPadding` | teks | kotak latar di belakang teks | nama yang sama persis |
| `curveEnabled`, `curvePower` | teks | teks pada satu busur, −1..1 (positif melengkung ke atas) | nama yang sama persis |

Semua field opsional: berkas v4 adalah berkas v5 yang sah dan dimuat tanpa peringatan.

### Satuan yang dicocokkan dengan kode Polotno

Angka-angka berikut diambil dari kode kanvas Polotno yang terbit di npm
(`polotno/canvas/text-element.js`, `figure-element.js`), bukan ditebak:

- **Padding dan sudut latar teks** adalah **pecahan dari setengah baris**:
  `px = nilai × fontSize × lineHeight × 0,5` (`resolveTextBackground()` di
  `lib/textEffects.ts`). Bawaan Polotno 0,5 / 0,5 dan warna `#7ED321`. Kotak ikut membesar
  bila huruf membesar; untuk teks auto-fit dipakai ukuran huruf yang **digambar**.
- **Dash bentuk** di Polotno adalah **kelipatan tebal garis** yang digambar,
  `F = min(strokeWidth, width/2, height/2)`. Editor ini menyimpan dash dalam px (yang
  dipakai Konva), jadi adapter membagi/mengalikan dengan `F`
  (`dashToPolotno` / `dashFromPolotno`). Contoh: Polotno `[2, 1]` dengan garis 4 px →
  `[8, 4]` di sini → kembali `[2, 1]`.
- **Bayangan teks berlatar** dijatuhkan oleh kotak latarnya, tanpa latar oleh hurufnya
  (seperti Polotno saat latar menyala).
- **Teks melengkung:** rumus busur Polotno ada di modul `@polotno/core` yang tidak bisa
  dibaca, jadi busur di sini rumus sendiri (lihat "Belum diuji"): `|curvePower| = 1` berarti
  0,95 lingkaran, panjang busur = lebar teks terukur × 1,08 + ½ ukuran huruf (TextPath Konva
  mengukur per huruf dan **membuang huruf yang tidak muat**; tanpa kelonggaran huruf
  terakhir hilang), teks di tengah busur dan busur di tengah kotak.

### Yang masih dilaporkan

Hanya yang memang belum ada padanannya: dekorasi `overline`, `textTransform:
"capitalize"`, mask dari gambar (`maskSrc`), filter selain kontras/saturasi di objek
`filters`, dan (di luar efek) grup, bentuk selain persegi/lingkaran, latar halaman berupa
gambar/gradien, warna yang tidak terbaca. Contoh `fancyPolotno()` di
`tests/v5-effects-text.test.ts` memakai semua efek di atas sekaligus dan menghasilkan
**`warnings: []`**.

### Cara digambar (`ElementRenderer.tsx`)

- **Teks = `Group`** berisi (1) kotak latar opsional dan (2) `Konva.Text`, atau
  `Konva.TextPath` di atas busur untuk teks melengkung. **Group** itulah node yang diseret,
  di-Transform, difilter, dan didaftarkan ke Transformer, jadi latar, huruf, dan efeknya
  bergerak sebagai satu. `bakeTransform` tetap sama karena Group punya `x/y/rotation/scale`.
- **Kotak latar** adalah `Shape` **tanpa ukuran sendiri**: ia menggambar kotaknya di
  `sceneFunc`. Bingkai Transformer dihitung dari ukuran anak-anak Group, jadi bingkai tetap
  persis kotak teks dan padding tumbuh ke luar (seperti Polotno), sementara kotaknya tetap
  bisa diklik lewat `hitFunc`. Kotak dibuat **per baris** dari `textArr` Konva
  (`backgroundLineBoxes()`): baris pendek mendapat kotak pendek, mengikuti `align`; semua
  kotak satu *path* dan diisi sekali, jadi tumpang-tindihnya tidak lebih gelap.
- **Dash**: `dash` + `dashEnabled` di `Rect`/`Ellipse`, di garis tepi huruf (`Konva.Text`
  dan `TextPath`), dan di bingkai gambar (`strokeShape` di `drawPicture` memakai atribut
  `dash` node).
- **Blur & filter warna** pada teks dan bentuk: hook `useNodeFilters`
  (`lib/useNodeFilters.ts`) men-*cache* node (Group teks / node bentuk), memasang
  `Konva.Filters.Blur` dan filter matriks warna yang sama dengan gambar (`filterToMatrix` →
  `applyColorMatrix`), dan men-*cache* ulang setiap kali tampilan elemen berubah (cache Konva
  adalah potret). Gambar tetap memakai jalurnya sendiri.

### Mengubahnya: popover **✦ Efek** (`ContextualToolbar.tsx`)

Teks dan bentuk punya satu popover Efek (bisa digulir) dengan bagian:

| Bagian | Teks | Bentuk |
|---|---|---|
| Transparansi | ✔ | ✔ |
| Garis tepi + **Pola garis** (Utuh / Putus-putus 10,5 / Garis panjang 20,8 / Titik-titik 2,4) | garis tepi huruf | tebal, pola, dan **sudut** (persegi) |
| **Latar teks**: sakelar + warna, kepekatan, sudut (%), jarak/padding (%) | ✔ | – |
| **Teks lengkung**: sakelar + lengkungan −100..100 % | ✔ | – |
| Bayangan: warna, blur, geser X/Y, kepekatan | ✔ | ✔ |
| **Blur & filter warna**: blur, kecerahan, kontras, saturasi, preset | ✔ | ✔ |

Gambar mendapat **Pola garis** di panel Filter & Efek (di bawah "Tebal garis"). Field gaya
lewat `setElementStyle` (divalidasi; `dash` diperiksa `sanitizeDash`), field khusus teks
lewat `updateElement`; keduanya memakai history ber-*debounce*, jadi satu geseran slider =
satu langkah undo, dan Undo/Redo mengembalikannya persis (diuji).

Perbaikan kecil di toolbar yang sama:

- **Ikon perataan** kini selalu **tiga garis** untuk kiri, tengah, kanan, dan rata
  kiri-kanan. Sebelumnya, pada "tengah" dan "kanan" dua garis tanpa lebar sendiri menyusut
  menjadi 0 px di dalam flex, jadi yang terlihat hanya satu garis.
- **Popover di tepi toolbar** tidak lagi langsung menutup. Klik pada tombol di tepi kanan
  menggulir toolbar, dan dulu setiap gulir menutup popover. Sekarang panel mengikuti tombolnya
  dan baru menutup bila tombolnya keluar dari bagian toolbar yang terlihat.

### Ekspor ke Polotno (`convertKusukaToPolotno()`)

Efek yang menyala ditulis dengan nama properti Polotno (`backgroundEnabled`…,
`curveEnabled`/`curvePower`, `blurEnabled`/`blurRadius`, `brightnessEnabled`,
`grayscaleEnabled`/`sepiaEnabled`, `filters`, `dash` bentuk dalam kelipatan garis). Yang
tidak dimiliki Polotno (dash teks/gambar, preset selain hitam-putih/sepia) masuk `custom`
dan kembali utuh saat diimpor lagi. Uji pulang-pergi Polotno → KusukaEdit → Polotno →
KusukaEdit menghasilkan dokumen yang **identik**. Apakah Polotno sendiri menampilkannya
**sama persis** belum bisa dipastikan tanpa membuka berkasnya di Polotno (lihat "Belum diuji").

## Pemuat font Google (v10)

`src/lib/fontLoader.ts` — `ensureFontLoaded(fontFamily)`:

1. Mengambil keluarga pertama dari *font stack* (`"'Open Sans', sans-serif"` → `Open Sans`);
   font sistem/generik (Arial, Georgia, Times New Roman, Verdana, `sans-serif`…) dilewati.
2. Menyisipkan **satu** `<link rel="stylesheet">` Google Fonts (API css2, regular/bold/
   italic/bold italic) ke `<head>`. Bila Google menolak karena keluarganya tidak punya salah
   satu gaya itu (mis. Bebas Neue tanpa italic → HTTP 400), dicoba lagi dengan keluarga saja.
3. Menunggu `document.fonts.load()` untuk bobot yang digambar editor.
4. Menaikkan nomor versi font; setiap teks berlangganan (`useSyncExternalStore`), menyusun
   ulang barisnya dengan metrik asli (`_setTextData()` Konva, karena Konva tidak mengukur
   ulang sendiri), menyinkronkan tinggi kotak, lalu `layer.batchDraw()`.

Dipanggil oleh setiap teks saat dirender dan saat `fontFamily`-nya berubah. Itu mencakup
impor JSON Polotno/native, template, dan pemilih font, tanpa daftar terpisah. Satu
keluarga dimuat sekali per halaman; panggilan bersamaan berbagi satu *promise*. Di Node/SSR
fungsi ini langsung selesai dengan `false`.

**Pemilih font** di toolbar kini berisi 20 keluarga (`FONT_CHOICES`): Inter, Roboto, Open
Sans, Montserrat, Poppins, Lato, Oswald, Bebas Neue, Anton, Playfair Display, Merriweather,
Lora, Pacifico, Dancing Script, Lobster, Roboto Mono, ditambah Georgia, Courier New, Times
New Roman, dan Verdana. Font lain dari berkas impor tetap muncul di daftar dan ikut dimuat.

**Toleransi lebar teks** (`TEXT_WIDTH_TOLERANCE`, +10 px untuk teks dari Polotno) tetap ada.
Font yang benar sudah menghilangkan penyebab utama "SALE" turun baris, tetapi toleransi tetap
berguna bila font gagal dimuat (luring, keluarga tidak ada di Google Fonts).

## Toolbar kontekstual ala Polotno

`src/components/ContextualToolbar.tsx`. Satu baris kontrol ringkas untuk elemen yang
dipilih, lalu menu **☰ Posisi** (urutan lapisan) dan **Hapus** di ujung kanan. Pilihan
yang butuh ruang dibuka dalam **popover** kecil di bawah tombolnya (tutup dengan `Esc`
atau klik di luar). Setiap kontrol punya `data-toolbar-action` untuk pengujian browser.

**Teks** (`data-toolbar="text"`), kiri ke kanan:

| Kontrol | `data-toolbar-action` | Menulis |
|---|---|---|
| Kotak warna | `text-color` | `fill` |
| Pilihan font | `font-family` | `fontFamily` (font berkas impor yang tidak ada di daftar tetap ditampilkan) |
| Ukuran dengan ▲▼ | `font-size` | `fontSize` (1–500) |
| ⤡ Auto-fit | `auto-fit` | `autoFit` (lihat "Auto-fit teks") |
| **B** / *I* | `bold` / `italic` | `fontStyle` (`normal` / `bold` / `italic` / `bold italic`) |
| U / S | `underline` / `strikethrough` | `textDecoration` (`underline`, `line-through`, atau keduanya) |
| Perataan (satu tombol, bersiklus kiri → tengah → kanan → justify, seperti Polotno) | `align` | `align` |
| •≡ / 1≡ | `list-bullet` / `list-number` | `listType` |
| ↕ Spasi | `spacing` | `letterSpacing` (−20 %…100 % ukuran huruf), `lineHeight` (0,5–3×) |
| AA / aa | `uppercase` / `lowercase` | `textTransform` |
| ✦ Efek | `effects` | `opacity`, bayangan, garis tepi huruf |

**Gambar** (`data-toolbar="image"`): **⧉ Pangkas** / **Reset** (`crop`, `reset-crop`),
**⇋ Balik** (`flip` → `flip-x` / `flip-y`, aksi `flipImage`), **✦ Efek** (`style-panel`,
membuka panel Filter & Efek: filter warna, transparansi, blur, sudut, bayangan, garis tepi),
**⤢ Pas halaman** (`fit-page`, aksi `fitToPage`), **◐ Mask** (`mask`, Persegi / Lingkaran /
Segitiga), dan **Ganti**.

**Bentuk** (`data-toolbar="shape"`): warna isi (`fill-color`), warna garis tepi
(`stroke-color`), tebal garis dengan ▲▼ (`stroke-width`), sudut membulat untuk persegi
(`corner-radius`), dan **✦ Efek** (transparansi dan bayangan).

**Seleksi ganda** (`data-toolbar="multi"`): jumlah elemen terpilih, petunjuk, **Batal
pilih**, dan **Hapus N**.

Field teks baru (semuanya opsional; tidak ada = mati):

- `textDecoration`, `letterSpacing` (pecahan ukuran huruf, seperti Polotno; Konva
  menerima px, jadi renderer mengalikannya dengan ukuran huruf yang digambar),
  `textTransform` (**hanya tampilan**: `text` tetap menyimpan huruf yang diketik),
  `listType` (penanda `•` atau `1.` di depan tiap paragraf; baris kosong tidak diberi
  nomor), `stroke`/`strokeWidth`, `autoFit`.
- Teks yang digambar dibentuk oleh `displayText()` (`lib/textOptions.ts`). Di Polotno,
  `textDecoration`, `letterSpacing`, `textTransform`, `stroke`, `strokeWidth`, dan
  `align: "justify"` punya field sendiri; `listType` dan `autoFit` tidak, jadi ditulis di
  `custom` (bersama `custom.source`) dan dibaca kembali dari sana.

Keterbatasan yang diketahui: baris daftar yang terbungkus tidak menjorok di bawah
penanda (Konva tidak punya *hanging indent*); `<textarea>` edit teks menampilkan teks apa
adanya, tanpa penanda daftar; di layar sempit toolbar dibungkus menjadi dua baris.

## Seleksi ganda: kotak seret & Ctrl/Cmd+klik

**State:** `selectedIds: string[]` adalah sumber kebenaran seleksi; `selectedId` adalah
"satu-satunya yang dipilih" (atau `null`). Semua aksi yang mengganti halaman, Undo/Redo,
memuat dokumen, dan reset mengosongkan keduanya (`NO_SELECTION`), seperti sebelumnya.

**Marquee** (`CanvasWorkspace.tsx`, logika di `lib/selection.ts`):

1. `onMouseDown` pada `<Stage>` yang mengenai area kosong (target = Stage) mencatat titik
   awal dalam **piksel desain** (posisi kursor dibagi zoom, lewat `clientToDesign`).
2. `mousemove` / `mouseup` dipasang di `window`, sehingga kotak tetap mengikuti kursor
   walau keluar dari halaman. Gerakan di bawah 3 px layar dianggap klik.
3. Setiap gerakan: kotak semi-transparan (biru, garis putus-putus 1 px layar pada zoom
   berapa pun, `listening={false}`) digambar di atas halaman, lalu
   `elementsInMarquee()` menghitung **perpotongan** kotak dengan setiap elemen halaman
   aktif dan hasilnya langsung menjadi seleksi (Transformer ikut berubah selagi diseret).
   Perpotongan diuji tepat dengan *separating axis theorem*: elemen yang diputar hanya
   terpilih bila kotaknya yang miring benar-benar tersentuh, bukan sekadar kotak
   pembatasnya. Menyentuh tepi sudah dihitung.
4. Mulai menyeret sambil menahan `Ctrl`/`Cmd`/`Shift` **menambah** ke seleksi yang ada.
   Klik tanpa geser di area kosong membatalkan seleksi (seperti dulu). Sentuhan (*touch*)
   tidak membuat marquee: ketuk area kosong membatalkan seleksi.

**Ctrl/Cmd+klik** (juga `Shift`+klik): `ElementRenderer` meneruskan tombol pengubah dari
event klik Konva; dengan pengubah, `toggleSelected(id)` menambah atau mengeluarkan elemen
tanpa membatalkan yang lain. Klik biasa memilih elemen itu saja.

**Transformer:** semua node terpilih dipasang sekaligus (`transformer.nodes([...])`),
kecuali node yang sedang diedit/dipangkas. Dengan lebih dari satu node hanya jangkar sudut
yang aktif (`keepRatio`), sehingga setiap elemen mempertahankan bentuknya. Menyeret salah
satu node terpilih memindahkan semuanya (perilaku bawaan Transformer Konva).

**Satu gestur = satu langkah undo:** di akhir drag/transform, `CanvasWorkspace` membaca
**semua** node terpilih dan menulisnya dengan satu `updateElements(...)`; Konva memanggil
event itu pada tiap node, tetapi panggilan berikutnya menemukan angka yang sudah tertulis
(dan skala yang sudah kembali 1), jadi tidak mengubah apa pun lagi. Skala dimasukkan ke
ukuran oleh `bakeTransform()` (`lib/transform.ts`): gambar tetap proporsional, bentuk
lebar × tinggi, teks biasa hanya lebar — **kecuali** saat diskalakan rata dari sudut
seleksi ganda, ukuran hurufnya ikut membesar/mengecil (seperti Polotno) — dan teks
auto-fit lebar × tinggi.

Panah (geser 1/10 px), `Delete`, `Ctrl/Cmd+A` (pilih semua di halaman), dan `Esc`
(batal pilih) bekerja pada seluruh seleksi. `Ctrl/Cmd+C` hanya menyalin bila **satu**
elemen yang dipilih; menyalin seleksi ganda belum didukung.

## Auto-fit teks (kecilkan otomatis)

Tombol **⤡** di toolbar teks menyalakan `autoFit: true`. Sejak saat itu:

- Kotak teks punya **tinggi tetap** milik pengguna (semua jangkar Transformer aktif,
  termasuk atas/bawah). Tinggi awalnya adalah tinggi teks saat tombol ditekan, jadi tidak
  ada yang berubah sampai kotaknya diperkecil atau teksnya diperpanjang.
- Teks digambar dengan **ukuran huruf terbesar, maksimal `fontSize`**, yang muat:
  jumlah baris × ukuran × `lineHeight` ≤ tinggi kotak, **dan** tidak ada satu kata pun
  yang lebih lebar dari kotak (tanpa aturan kedua Konva akan memotong kata di tengah,
  huruf per huruf). `fontSize` yang disimpan tidak pernah berubah — itu batas atas
  pilihan pengguna; hanya ukuran yang digambar yang mengecil. Font, `lineHeight`, dan
  spasi huruf (pecahan ukuran huruf) ikut proporsional.
- Pencarian ada di `lib/textFit.ts` (murni, diuji di Node): `wrapLines()` meniru
  pembungkusan kata Konva (`wrap: "word"`), `fitFontSize()` mencari biner pada kelipatan
  0,5 px, berhenti di 4 px bila teks tetap tidak muat. Pengukurnya dari `ElementRenderer`:
  satu `Konva.Text` tersembunyi yang `measureSize()`-nya adalah `measureText` kanvas
  dengan string font yang sama persis dengan yang dipakai Konva untuk menggambar; spasi
  huruf ditambahkan per celah antarhuruf seperti Konva.
- `<textarea>` edit teks memakai ukuran yang benar-benar digambar (dibaca dari node
  Konva lewat `stage.findOne("#id")`), jadi teks tidak melompat saat mulai diedit.
- Di Polotno, `autoFit` ditulis sebagai `custom.autoFit` dan `fontSize` yang ditulis adalah
  **batas atas** pengguna. Polotno sendiri tidak membaca `custom.autoFit`, jadi di Polotno
  teks itu bisa tampil lebih besar dari di editor ini (lihat "Belum diuji").

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
  pages: Page[];               // SELURUH dokumen (semua halaman)
  currentPageIndex: number;    // halaman yang ditampilkan saat snapshot ini dipulihkan
  afterPageIndex?: number;     // untuk langkah yang mengubah halaman tampil (tambah, duplikat, hapus, impor)
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
- **Lintas halaman.** Snapshot memuat seluruh dokumen dan halaman tempat perubahan
  terjadi. `undo()` membawa Anda **ke halaman itu**: seret elemen di halaman 2,
  pindah ke halaman 1, tekan Ctrl+Z → halaman 2 tampil dengan elemen kembali. Langkah
  yang membuat halaman (`addPage`, `duplicatePage`, impor) menyimpan `afterPageIndex`
  supaya Redo mendarat di halaman baru itu. Gestur kontinu (batch 500 ms) tetap
  **satu** langkah walau Anda meninggalkan halamannya sebelum batch tersegel.
- `goToPage` **bukan** langkah history; `undo`/`redo` menyetel ulang seleksi
  (`selectedId`, `editingId`, `croppingId`).

### Perubahan kontinu vs. diskrit

- **Diskrit** (`addTextElement`, `addShapeElement`, `addImageElement`,
  `replaceImageSource`, `removeElement`, `reorderElement`, `pasteClipboard`,
  `addPage`, `duplicatePage`, `deletePage`, `loadFromJSON`, `reset`) → `recordHistoryNow()`: snapshot langsung di-push.
- **Kontinu** (drag, resize, rotate — termasuk pada **gambar** —, input toolbar,
  menyimpan hasil edit teks) → `updateElement` →
  `recordHistoryDebounced(elementId)`: snapshot "sebelum"
  diambil **sekali** di awal batch, lalu timer 500 ms di-reset setiap ada
  perubahan baru; batch "disegel" ke `past` setelah 500 ms tenang. Hasilnya
  **satu gestur = satu langkah undo**.
- `batchKey` = id elemen: drag elemen A lalu langsung drag elemen B tetap jadi
  dua langkah undo.
- `setImageStyle` (slider filter/efek) juga kontinu, dengan `batchKey` = id gambar:
  satu geseran slider = satu langkah undo.
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

Tombol **⬇ Ekspor** di header → pilih **PNG** atau **JPG** → pilihan **Halaman**:

| Cakupan | Hasil |
|---|---|
| **Halaman aktif** (default) | satu berkas PNG/JPG dari halaman yang sedang tampil, lewat `stage.toDataURL()` |
| **Semua halaman** | satu berkas **ZIP** (`<nama>-semua-halaman.zip`) berisi satu gambar per halaman, bernomor (`desain-halaman-01.png`, `…-02.png`, …), masing-masing pada **ukuran halamannya sendiri** × resolusi |

Pilihan "Semua (n) · ZIP" nonaktif bila dokumen hanya punya satu halaman; ringkasan di
atas tombol Unduh selalu menyebut ukuran hasil ("2 berkas PNG dalam satu ZIP, masing-masing
2160 × 2160 px").

### Satu halaman: `exportStageAsImage`

`src/lib/exportImage.ts` — `renderStageToDataUrl()` merender, `downloadDataUrl()`
mengunduh, `exportStageAsImage()` memanggil keduanya:

1. `CanvasWorkspace` mendaftarkan Stage aktif ke store (`stageNode`), sehingga
   menu Ekspor di header (`ExportMenu`) bisa mengekspor tanpa prop-drilling.
2. Sebelum rasterisasi, handle **Transformer** dilepas sementara dan kanvas
   di-*redraw* **sinkron** (`stage.draw()`, bukan `batchDraw()`), supaya kotak
   seleksi tidak ikut masuk gambar; seleksi dikembalikan sesudahnya.
3. `pixelRatio` 1x/2x/3x menentukan resolusi. Ukuran hasil = **ukuran desain
   (`canvas` halaman itu) × pixelRatio** — jadi mengubah ukuran kanvas di tab
   **Kanvas** langsung mengubah hasil export (900×600 pada 2x → 1800×1200;
   1200×675 pada 2x → 2400×1350). Menu Ekspor menampilkan angka itu sebelum Anda
   menekan Unduh. Zoom tampilan tidak berpengaruh: sebelum rasterisasi
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

### Semua halaman: render berurutan → ZIP

Hanya ada **satu Stage** dan ia menggambar halaman aktif, jadi untuk memotret halaman 3
editor harus *menampilkan* halaman 3. `exportAllPagesAsZip()` (`lib/exportPages.ts`) dan
`renderPagesSequentially()` (`lib/batchExport.ts`) mengatur urutannya:

1. Untuk tiap halaman, berurutan: tampilkan halaman itu → muat gambar yang
   dibutuhkannya ke cache → **tunggu** sampai Stage memuat tepat node-node halaman itu
   (`stageShowsPage`, dipoll tiap frame, batas 4 detik) → `renderStageToDataUrl()` seperti
   export satu halaman. Bila batas terlewati export **dibatalkan dengan pesan**, bukan
   memotret halaman yang keliru dan menyebutnya berhasil.
2. **Selama berjalan**, kanvas ditutup kotak progres ("Mengekspor halaman 2 dari 3…",
   dari `exportProgress`) dan seluruh antarmuka dikunci (`.is-exporting`); shortcut
   keyboard diabaikan. Layar tidak "melompat" tanpa penjelasan.
3. **Sesudahnya** (sukses *atau gagal*, di `finally`) halaman yang tadinya aktif
   ditampilkan lagi, dan elemen yang tadinya terpilih dipilih lagi bila masih ada
   (seleksi memang direset tiap pindah halaman; ini memulihkannya).
4. Gambar tiap halaman dimasukkan ke ZIP (`lib/zipStore.ts`): penulis ZIP kecil
   **tanpa kompresi** (metode *store*; PNG/JPG sudah terkompresi) dengan CRC-32 dan
   nama UTF-8, tanpa dependensi baru. Batas format ZIP klasik berlaku (≤ 65535 berkas,
   ≤ 4 GiB) dan dilaporkan sebagai galat, bukan menulis berkas rusak.
5. Hasilnya diperiksa dengan `unzip -t` dan `python zipfile`: bernama benar, utuh, dan
   PNG di dalamnya berukuran sesuai halamannya.

Yang **tidak** ada: tombol batal di tengah proses (export berjalan sampai selesai atau
gagal), dan export paralel (satu Stage = satu halaman sekali waktu).

---

---

## Skema Dokumen JSON Native (v5)

> **v5 (v10 editor):** hanya menambah field opsional — `blurRadius`, `brightness`,
> `contrast`, `saturation`, `filterPreset`, dan `dash` di semua elemen, serta
> `background*` dan `curve*` di teks (lihat
> [Efek Polotno tanpa peringatan](#efek-polotno-tanpa-peringatan-v10)). Berkas v4 dibaca
> apa adanya; contoh di bawah tetap berlaku dengan `"version": 5`.

Format bawaan (`exportToJSON("kusuka")`), didefinisikan di `src/types/editor.ts`.
**Satu berkas memuat seluruh halaman.**

**Model koordinat (sama untuk semua tipe elemen):** `(x, y)` adalah sudut
**kiri-atas** kotak elemen; `rotation` dalam derajat searah jarum jam di sekitar
sudut itu; `zIndex` lebih besar = lebih depan. Koordinat selalu relatif ke
halaman tempat elemen berada.

```jsonc
{
  "version": 5,                 // versi skema (lihat "Migrasi")
  "pages": [
    {
      "id": "page-1",           // unik di seluruh dokumen
      "canvas": {               // ukuran dan latar milik halaman ini
        "width": 900,
        "height": 600,
        "backgroundColor": "#ffffff"
      },
      "elements": [
        {
          "id": "uuid",         // unik di seluruh dokumen (antarhalaman juga)
          "type": "text",       // "text" | "shape" | "image"
          "x": 190, "y": 80,
          "width": 520,
          "height": 57.6,       // tinggi hasil ukur Konva (otomatis dari isi teks)
          "rotation": 0,
          "zIndex": 1,          // urutan tumpukan DI DALAM halaman

          // -- khusus type: "text" --
          "text": "Judul Poster Saya",
          "fontSize": 48,
          "fontFamily": "Inter, sans-serif",
          "fill": "#111111",
          "align": "center",        // "left" | "center" | "right" | "justify"
          "fontStyle": "bold",      // "normal" | "bold" | "italic" | "bold italic"
          "lineHeight": 1.2,        // kelipatan fontSize
          "widthTolerance": 10,     // OPSIONAL: px yang ditambahkan ke width saat impor Polotno (lihat "Toleransi lebar kotak teks")

          // -- opsi teks v4, semuanya OPSIONAL (tidak ada = mati) --
          "textDecoration": "underline",        // "underline" | "line-through" | "underline line-through"
          "letterSpacing": 0.05,                // PECAHAN fontSize (0.05 = 5%), seperti Polotno
          "textTransform": "uppercase",         // "uppercase" | "lowercase" — hanya tampilan
          "listType": "bullet",                 // "bullet" | "number"
          "autoFit": true,                      // tinggi kotak tetap, ukuran huruf mengecil bila perlu
          "stroke": "#000000", "strokeWidth": 2, // garis tepi huruf

          // -- efek v4 untuk SEMUA tipe elemen, OPSIONAL --
          "opacity": 0.9,                       // 0..1
          "shadowColor": "#000000", "shadowBlur": 12,
          "shadowOffsetX": 4, "shadowOffsetY": 4, "shadowOpacity": 0.45
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
          "vector": false,                      // OPSIONAL: true = SVG (ikon); ditulis kembali ke Polotno sebagai "svg"

          // -- filter dan efek gambar, semuanya OPSIONAL (tidak ada = tanpa efek); lihat "Filter & efek gambar" --
          "brightness": 12, "contrast": 20, "saturation": -10,   // -100..100
          "filterPreset": "warm",               // grayscale | sepia | vivid | fade | warm | cool | dramatic
          "cornerRadius": 24,                   // px desain; tidak berlaku bila ada maskShape
          "blurRadius": 6,                      // px desain
          "stroke": "#111827", "strokeWidth": 8,
          "shadowColor": "#000000", "shadowBlur": 14,
          "shadowOffsetX": 10, "shadowOffsetY": 12, "shadowOpacity": 0.45,
          "maskShape": "circle"                 // "circle" | "triangle"
        }
      ]
    },
    { "id": "page-2", "canvas": { "width": 900, "height": 600, "backgroundColor": "#fef3c7" }, "elements": [ /* … */ ] }
  ]
}
```

Contoh lengkap: [`examples/sample-design.json`](./examples/sample-design.json) (satu halaman)
dan [`examples/sample-multipage.json`](./examples/sample-multipage.json) (tiga halaman,
dua ukuran berbeda).

### Migrasi v1 → v2 → v3 → v4 → v5

- **v5** (sekarang): bentuk sama dengan v4; yang baru hanya field **opsional** —
  `blurRadius`, `brightness`, `contrast`, `saturation`, `filterPreset`, `dash` pada semua tipe
  elemen, serta `backgroundEnabled`/`backgroundColor`/`backgroundOpacity`/
  `backgroundCornerRadius`/`backgroundPadding` dan `curveEnabled`/`curvePower` pada teks.
  Berkas v4 dibuka apa adanya, tanpa peringatan; berkas versi 6 ke atas ditolak.
- **v4**: bentuk sama dengan v3; yang baru hanya field **opsional** —
  `opacity` dan `shadow*` pada semua tipe elemen, serta `stroke`/`strokeWidth`,
  `textDecoration`, `letterSpacing`, `textTransform`, `listType`, `autoFit`, dan
  `align: "justify"` pada teks.
- **v3**: `{ version: 3, pages: [...] }`. Dibuka **apa adanya dan tanpa peringatan**
  (tidak ada yang perlu diubah); disimpan ulang sebagai v4. Editor v3 akan menolak berkas
  v4 (versi lebih baru), sehingga efek baru tidak pernah hilang diam-diam di editor lama.
- **v2**: `{ version: 2, canvas, elements }` — satu kanvas dan satu larik elemen.
  Dibuka sebagai **dokumen satu halaman** (`id: "page-1"`) dan **tanpa peringatan**:
  tidak ada yang hilang, jadi tidak ada yang perlu dilaporkan. Berkas v2 yang disimpan
  ulang menjadi v4.
- **v1**: seperti v2, tetapi **lingkaran disimpan berdasarkan titik tengahnya**
  (kebiasaan `Circle` di Konva) sementara elemen lain berdasarkan sudut kiri-atas.
  Dimigrasi otomatis saat dimuat: titik tengah lingkaran dipertahankan persis, juga
  pada lingkaran yang diputar, lalu menjadi satu halaman; pengguna melihat
  peringatan "posisi N lingkaran dimigrasi". Field yang belum ada di v1 diisi default
  (`fontStyle: "normal"`, `lineHeight: 1`, `cornerRadius: 4` untuk persegi).

`detectFormat` membedakan native v3 dari Polotno lewat bentuk halamannya: halaman
native membawa `canvas` + `elements`, halaman Polotno membawa `children`; `pages`
kosong pada `version: 3` tetap dikenali sebagai native.

### Validasi saat memuat

Berkas dibersihkan (`sanitizeKusukaDocument`, per halaman): angka dan warna
dinormalisasi, field yang hilang diisi default (gambar: `scaleX/scaleY` selain `-1`
menjadi `1`; `vector` hanya diterima bila `true`; `widthTolerance` dibatasi 0–100; field
filter dan efek gambar divalidasi — angka dibatasi ke rentangnya, warna harus terbaca,
`maskShape` harus `circle`/`triangle`, `filterPreset` harus salah satu dari tujuh — dan
yang tidak valid dibuang, bukan membuat gambar gagal digambar), **id elemen dan id halaman
kosong atau kembar (juga antarhalaman) diganti id baru**, dan elemen yang tidak valid
dilewati dengan peringatan. `pages` kosong menjadi **satu halaman kosong** disertai
peringatan. Field v4 divalidasi dengan cara yang sama: `opacity` dijepit ke 0..1 (nilai 1 tidak
disimpan), bayangan hanya diterima dengan warna yang terbaca, `letterSpacing` dijepit ke
−0,2..1, `listType`/`textTransform`/`textDecoration` hanya nilai yang dikenal, garis tepi
huruf hanya bila `strokeWidth > 0` dan warnanya terbaca. Berkas bertanda `version` lebih
baru dari yang didukung editor (5 ke atas)
**ditolak** dengan pesan yang jelas.

---

---

## Adapter Polotno (Import & Export dua arah)

`src/lib/polotnoAdapter.ts` — fungsi murni (tanpa DOM/React/store), sehingga bisa
diuji di Node biasa.

| Fungsi | Peran |
|---|---|
| `detectFormat(data)` | `"kusuka"` untuk native v1/v2 (`canvas` + `elements`) dan **v3** (`pages` berisi halaman `canvas` + `elements`, atau `version: 3` dengan `pages` kosong); `"polotno"` bila ada `pages[]` berisi `children`; selain itu `"unknown"` |
| `parseDocument(input)` | Pintu masuk tunggal: menerima string/objek **format apa pun**, mendeteksi formatnya, mengembalikan dokumen native tervalidasi + `warnings`. Dipakai `loadFromJSON`, tombol Import, dan galeri template |
| `convertPolotnoToKusuka(doc, { pageIndex? })` | `{ pages: [{ children }] }` → `CanvasDocument` native v4. **Seluruh `pages[]` diimpor**, berurutan, masing-masing dengan ukuran dan latarnya. `pageIndex` (opsional) mengimpor satu halaman saja; indeks yang tidak ada menghasilkan satu halaman kosong |
| `convertKusukaToPolotno(doc)` | `CanvasDocument` → dokumen Polotno dengan **semua halaman** |
| `sanitizeKusukaDocument(raw)` | Validasi + migrasi file native (v1/v2 → satu halaman; v3/v4 per halaman), hasilnya selalu v4 |

### Import: Polotno → native

| Polotno | Native |
|---|---|
| `pages[i]` (tiap halaman, berurutan) | `pages[i]` — halaman native baru, `id` halaman dipertahankan (id kembar diganti) |
| `width`/`height` halaman (`"auto"` = ikut `width`/`height` dokumen) | `pages[i].canvas.width` / `.height` — **per halaman** |
| `pages[i].background` | `pages[i].canvas.backgroundColor` (gambar/gradien belum didukung: putih, dihitung dalam satu peringatan) |
| urutan `children` (pertama = paling bawah) | `elements[]`, `zIndex = posisi + 1` |
| teks: `fill` (cadangan: `color`) | `fill` |
| teks: `fontFamily` (`"Georgia"`) | `fontFamily` (`"Georgia, serif"`) |
| teks: `fontWeight` ≥ 600/`"bold"` + `fontStyle: "italic"` | `fontStyle` (`"bold italic"`, …) |
| teks: `align` (termasuk `justify` sejak v8; default Polotno `center`) | `align` |
| teks: `stroke` + `strokeWidth`, `textDecoration`, `letterSpacing`, `textTransform` (upper/lower), `custom.listType`, `custom.autoFit` | field bernama sama (v8) — lihat "Toolbar kontekstual ala Polotno" |
| semua tipe: `opacity`, `shadowEnabled` + `shadow*` | `opacity`, `shadow*` (v8) — lihat "Efek lintas elemen" |
| teks: `lineHeight` (default 1.2); `height` 0 | `lineHeight`; tinggi dihitung `fontSize × lineHeight` |
| teks: `text` berisi HTML (`<p>`, `<span>`, `</p><p>`, `<br>`) | `text` polos, baris dipisah `\n` — lihat "Pembersih teks HTML" |
| teks: `width` | `width + 10`, `x` digeser mundur menurut `align`, `widthTolerance: 10` — lihat "Toleransi lebar kotak teks" |
| `figure` `subType`: `rect` / `circle` (`ellipse` juga diterima) | `shape` `shapeType: "rect"` / `"circle"` |
| `figure` `fill`, `stroke`, `strokeWidth`, `cornerRadius` | field bernama sama |
| `image`: `src` | `image.src` (URL `https://`, `data:`; `blob:` diberi peringatan karena sudah mati) |
| `image`: `cropX`/`cropY`/`cropWidth`/`cropHeight` | field bernama sama (pecahan 0..1; di luar rentang → seluruh gambar + peringatan) |
| `svg`: `src` (URL atau data URI), crop, `colorsReplace` | `image` dengan `vector: true` — lihat "Elemen SVG / vektor" |
| `image`/`svg`: `flipX`, `flipY`, (juga `scaleX`/`scaleY` negatif) | `scaleX` / `scaleY` = `-1` — lihat "Pencerminan" |
| `image`/`svg`: `blurEnabled` + `blurRadius`, `borderSize` + `borderColor`, `shadowEnabled` + `shadow*`, `clipSrc` (lingkaran/segitiga), `cornerRadius`, `brightnessEnabled` + `brightness`, `grayscaleEnabled`/`sepiaEnabled`, `filters.contrast`/`filters.saturation`, `custom.filterPreset` | `blurRadius`, `strokeWidth` + `stroke`, `shadow*`, `maskShape`, `cornerRadius`, `brightness`, `filterPreset`, `contrast`/`saturation` — lihat "Filter & efek gambar" |
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
- Filter, blur, sudut membulat, garis tepi, bayangan, dan mask `clipSrc` pada SVG
  diperlakukan seperti pada gambar (lihat "Filter & efek gambar"); `maskSrc` dan efek
  lain dihitung sebagai "efek yang belum didukung". SVG tanpa `src` dilewati dengan
  peringatan.
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

### Banyak halaman, dan struktur bertingkat → array datar

Polotno menyimpan `pages: [{ children: [...] }]`. Dahulu hanya halaman pertama yang
diimpor (halaman lain cuma dilaporkan); **sekarang setiap halaman menjadi satu `Page`
native**, berurutan, dan setiap `children` menjadi larik `elements` halaman itu:

- Ukuran: `width`/`height` milik halaman bila berupa angka, `"auto"` (atau tidak ada)
  berarti ukuran dokumen. Halaman 1080×1080 dan 1080×1920 dalam satu berkas masing-masing
  mempertahankan ukurannya.
- Latar: `background` halaman itu sendiri.
- Urutan tumpukan: elemen pertama = paling bawah, sehingga `zIndex = posisi + 1`
  **di dalam halaman**, identik dengan Polotno. Elemen yang dilewati (tersembunyi, tipe
  tak didukung, grup) tidak meninggalkan celah pada `zIndex`.
- **id unik di seluruh dokumen**: bila berkas memakai ulang id elemen (atau id halaman)
  di halaman yang berbeda, yang kedua diberi id baru.
- Dokumen tanpa halaman menjadi **satu halaman kosong** disertai peringatan.
- Semua peringatan dijumlahkan **lintas halaman** dan dilaporkan sekali ("4 elemen
  memakai efek yang belum didukung…"), bukan sekali per halaman.

`convertPolotnoToKusuka(doc, { pageIndex })` masih ada untuk pemakai yang hanya butuh
satu halaman.

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

- Latar halaman berupa gambar atau gradien (halaman memakai putih).
- Elemen bertipe lain (`video`, `gif`, …), **grup** (`group`; lihat di atas), dan
  bentuk selain persegi/lingkaran (bintang, segitiga, …) dilewati.
- Efek: blur dan filter warna **pada teks dan bentuk**, latar teks
  (`backgroundEnabled`), teks melengkung (`curveEnabled`), dekorasi selain
  underline/line-through, `textTransform` selain upper/lower, `dash` (dan pada
  gambar/SVG: `maskSrc` serta filter selain kontras/saturasi). Elemennya tetap diimpor,
  tampilannya bisa sedikit berbeda. (Sejak v8 `opacity`, bayangan, garis tepi teks,
  `letterSpacing`, underline/coret, dan huruf besar/kecil **dibawa** tanpa peringatan.)
- Pada gambar/SVG, filter warna (kecerahan, kontras, saturasi, hitam-putih, sepia),
  sudut membulat, blur, garis tepi, bayangan, dan mask lingkaran/segitiga **dibawa**
  (tanpa peringatan). Hanya `clipSrc` dengan bentuk lain, atau yang bentuknya tidak
  bisa dikenali dari berkasnya, dilaporkan: "mask diabaikan dan gambar tampil
  persegi".
- Format per bagian pada teks HTML (lihat "Pembersih teks HTML"); `colorsReplace` yang
  tidak bisa diterapkan; skala/flip pada teks.
- Gambar tanpa `src` dilewati; gambar `blob:` diimpor tetapi diberi peringatan
  (URL itu mati begitu halaman asalnya ditutup, jadi tampil sebagai kotak kosong).
- Latar halaman berupa gradien/gambar → dipakai putih.
- Elemen `visible: false` dibuang (tidak terlihat di Polotno juga).

### Export: native → Polotno

`convertKusukaToPolotno` menulis **setiap halaman** dokumen:

```jsonc
{
  "schemaVersion": 4, "width": 900, "height": 600, "unit": "px", "dpi": 72,   // ukuran HALAMAN PERTAMA
  "fonts": [],
  "pages": [
    {
      "id": "page-1", "width": "auto", "height": "auto",     // "auto" = ukuran dokumen
      "background": "#ffffff", "bleed": 0, "duration": 5000,
      "children": [ /* diurutkan menurut zIndex, paling bawah dulu */ ]
    },
    {
      "id": "page-2", "width": 600, "height": 600,           // ukuran lain ditulis sebagai angka
      "background": "#ecfdf5", "bleed": 0, "duration": 5000,
      "children": [ /* … */ ]
    }
  ],
  "audios": []
}
```

Polotno menyimpan satu ukuran bawaan untuk seluruh dokumen; itu ukuran halaman
pertama, dan halaman yang ukurannya berbeda membawa angkanya sendiri. `id` halaman
native ditulis sebagai `id` halaman Polotno.

Polotno tidak punya `zIndex`: urutan tumpukan **adalah** urutan array, sehingga
export mengurutkan elemen **per halaman** berdasarkan `zIndex` (stabil). Teks diekspor
sebagai `type: "text"` (warna di `fill`, tidak ada properti `color`), bentuk sebagai
`type: "figure"` dengan `subType` `rect`/`circle`, gambar sebagai `type: "image"`
(atau `"svg"` bila `vector`) dengan `src`, crop, `flipX`/`flipY` dari
`scaleX`/`scaleY`, `cornerRadius`, dan — hanya bila aktif — properti efek
(`blurEnabled`/`blurRadius`, `borderSize`/`borderColor`, `shadowEnabled`/`shadow*`,
`clipSrc`, `brightnessEnabled`/`brightness`, `grayscaleEnabled`/`sepiaEnabled`,
`filters`, dan `custom.filterPreset` untuk preset tanpa padanan), serta nilai default
Polotno (`visible: true`, dst.) ditulis eksplisit; `opacity` adalah transparansi elemen
(1 bila tidak diatur), dan bayangan teks/bentuk ditulis seperti bayangan gambar. Gambar yang berasal dari
upload sudah berupa `data:` URL pada saat ini (lihat "Upload gambar"), jadi file
Polotno hasil export tetap utuh — di **semua** halaman.

Pemilihan format ada di menu **Ekspor** di header (**JSON KusukaEdit** / **JSON
Polotno**); kartu **Proyek desain** di tab Impor selalu mendeteksi format dari isi berkas
(bukan dari nama file) dan menampilkannya di pratinjau sebelum berkas dibuka.

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
  (animasi, filter selain yang dikenali, bayangan pada teks/bentuk, …): editor ini hanya
  menyimpan subset yang didukungnya. Pada gambar, filter warna/blur/sudut/garis/bayangan/
  mask yang dikenali ikut kembali (mask sebagai SVG data URI buatan editor ini, bukan URL
  aslinya). **Semua halaman** ikut pulang-pergi, masing-masing dengan ukurannya.
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
  (5) HTML pada `text` tidak didokumentasikan sama sekali; (6) **efek gambar**: cara
  Polotno memakai `clipSrc` (diasumsikan SVG yang diregangkan ke kotak gambar —
  lingkaran pada kotak non-persegi menjadi elips, segitiga bertumpu di alas dengan
  puncak di tengah-atas), apakah `borderSize` digambar di tengah tepi atau di
  dalam kotak (di sini: di tengah tepi, di atas gambar), dan apakah skala
  `blurRadius` Polotno sama dengan yang dihasilkan `Konva.Filters.Blur` di sini
  (angka yang sama dipakai, dalam piksel desain); (7) **filter warna**: nama dan arti
  `filters.contrast` / `filters.saturation` (dipakai `{ intensity }` −1…1 ↔ −100…100),
  bahwa `brightness` bersifat aditif, dan bahwa `grayscaleEnabled`/`sepiaEnabled`
  berarti hal yang sama dengan matriks di sini — serta `custom.filterPreset`, yang hanya
  dibaca editor ini; (8) **multi-halaman**: pemetaan `width`/`height` halaman bernilai
  `"auto"` ke ukuran dokumen, dan bahwa Polotno asli memuat berkas dengan ukuran halaman
  berbeda-beda seperti yang ditulis di sini. Bila Anda punya contoh
  berkas Polotno bergambar/berflip/berteks HTML, asumsi ini bisa dipastikan atau
  dikoreksi dengan cepat.
- Berkas hasil export **belum pernah dibuka di editor Polotno yang asli**. Untuk
  memastikannya, muat berkas itu dengan `store.loadJSON(...)` di
  [polotno.com](https://polotno.com/) atau proyek Polotno SDK Anda. Pada
  lingkaran yang `width ≠ height`, cara Polotno menggambarnya belum diverifikasi.

---

## Template (galeri preset)

Tab **Template** di panel kiri menampilkan **11 kartu visual**: thumbnail halaman
pertama (bertumpuk bila dokumennya lebih dari satu halaman), nama, deskripsi satu
baris, dan lencana **jumlah halaman** serta **format file** (Native / Polotno). Preset
disimpan di repositori sebagai berkas JSON — **tujuh di antaranya adalah dokumen format
Polotno** di `src/templates/polotno/`:

| Berkas | Format | Halaman | Ukuran |
|---|---|---|---|
| `polotno/presentasi-3-slide.polotno.json` | Polotno | 3 | 1280×720 |
| `polotno/brosur-2-halaman.polotno.json` | Polotno | 2 | 794×1123 (A4) |
| `polotno/carousel-4-slide.polotno.json` | Polotno | 4 | 1080×1080 |
| `polotno/kartu-nama-2-sisi.polotno.json` | Polotno | 2 | 1050×600 |
| `polotno/undangan-story-3.polotno.json` | Polotno | 3 | 1080×1920 (gambar bermask lingkaran + garis + bayangan) |
| `polotno/katalog-produk-2-halaman.polotno.json` | Polotno | 2 | 1080×1080 (kecerahan, sepia, hitam-putih, kontras+saturasi, blur, sudut membulat, mask) |
| `polotno/paket-feed-dan-story.polotno.json` | Polotno | 2 | **1080×1080 dan 1080×1920** dalam satu berkas |
| `promo-diskon.polotno.json` | Polotno | 1 | 900×600 |
| `post-sosmed.polotno.json` | Polotno | 1 | 600×600 |
| `poster-acara.kusuka.json` | Native | 1 | 900×600 |
| `kartu-kutipan.kusuka.json` | Native | 1 | 900×600 |

Berkas Polotno ditulis dengan struktur skema Polotno (`schemaVersion`, `pages[].children`,
`width`/`height` halaman `"auto"` atau angka, dst.) oleh skrip pembangkit sekali pakai;
yang menjadi sumber kebenaran adalah **berkas JSON-nya**, bukan skrip itu. Semua template
**dimuat tanpa peringatan** (diuji): tidak ada yang memakai fitur yang belum didukung.

Cara kerja:

1. `TemplatePanel` melewatkan setiap template melalui `parseDocument()`, yang
   **mendeteksi formatnya** — registry tidak perlu tahu format tiap berkas.
2. Halaman pertama dokumen hasil konversi digambar sebagai thumbnail SVG
   (`TemplateThumbnail.tsx`). Karena digambar dari dokumen *setelah* adapter,
   thumbnail selalu sinkron dengan berkas template, dan untuk template Polotno
   sekaligus memperlihatkan hasil konversinya (termasuk crop, cermin, sudut membulat,
   mask, dan filter warna lewat `feColorMatrix`).
3. Klik kartu → `loadFromJSON(entry.data)`: berkas yang sama dengan yang dipilih lewat
   tombol Import melewati fungsi deteksi adapter, **seluruh halaman dan elemennya
   dibangun ulang** di store (halaman pertama tampil, seleksi direset), dan seluruh
   dokumen diganti sebagai **satu langkah undo** — `Ctrl+Z` mengembalikan desain
   sebelumnya. Pemetaan bersifat deterministik.
4. Status di bawah galeri menyebut hasil deteksi ("format Polotno terdeteksi, 3
   halaman"); peringatan konversi (bila ada) ditampilkan di bawahnya.

**Menambah template:** letakkan berkas JSON (format native *atau* Polotno) di
`src/templates/` atau `src/templates/polotno/`, lalu tambahkan satu entri di
`src/templates/index.ts`:

```ts
import promoBaru from "./polotno/promo-baru.polotno.json";
// ...
{ id: "promo-baru", name: "Promo baru", description: "Dua halaman", data: promoBaru },
```

Setiap elemen sebaiknya punya `id` unik (adapter membuatkan id bila kosong atau kembar).

---

---

## Keyboard Shortcuts

| Shortcut | Aksi |
|---|---|
| Double-click teks | Edit teks langsung di kanvas |
| Double-click gambar | Mode crop (Pangkas) |
| `Enter` / `Esc` / klik di luar gambar | (saat crop) selesai — setiap gestur sudah tersimpan; `Delete` dan panah dinonaktifkan |
| Seret pegangan bulat di sudut gambar (saat crop) | Perbesar/perkecil foto di dalam bingkai |
| Klik tab aktif di rel kiri / `«` | Lipat panel kiri (di jendela sempit: tutup drawer; `Esc` juga) |
| Chevron `▾` di strip halaman | Lipat / buka strip halaman |
| Seret berkas gambar dari desktop ke kanvas | Sisipkan gambar di posisi kursor dilepas |
| `Enter` / `Esc` / klik di luar | (saat edit) simpan dan selesai |
| `Shift + Enter` | (saat edit) baris baru |
| `Delete` / `Backspace` | Hapus **semua** elemen terpilih (nonaktif saat edit teks) |
| `↑ ↓ ← →` | Geser elemen terpilih 1px (seleksi ganda ikut semua) |
| `Shift + ↑ ↓ ← →` | Geser elemen terpilih 10px |
| Seret di area kosong halaman | Kotak seleksi (marquee): pilih semua yang bersinggungan |
| `Ctrl/Cmd/Shift` + seret di area kosong | Marquee yang **menambah** ke seleksi |
| `Ctrl/Cmd + klik` (atau `Shift + klik`) elemen | Tambah/keluarkan elemen dari seleksi |
| `Ctrl/Cmd + A` | Pilih semua elemen di halaman aktif |
| `Esc` | Batalkan seleksi |
| `Ctrl/Cmd + C` | Salin elemen terpilih (hanya bila satu elemen yang dipilih) |
| `Ctrl/Cmd + V` | Tempel elemen (+20,+20) |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| Klik area kosong kanvas | Batalkan seleksi |
| Klik thumbnail halaman (strip di bawah kanvas) | Pindah halaman — seleksi, Transformer, edit teks, dan crop direset |
| `Ctrl/Cmd + Z` setelah mengedit halaman lain | Membawa Anda kembali ke halaman tempat perubahan itu dibuat |
| `Ctrl/Cmd + scroll` (atau cubit di trackpad) | Zoom kanvas (5–400%) |
| Tombol `−` / `+` / persen / `Fit` (sudut kanvas) | Zoom, 100%, atau tampilkan kanvas utuh |

Semua shortcut kanvas dinonaktifkan saat fokus ada di `input`/`textarea`/`select`,
saat teks sedang diedit, atau saat export semua halaman berjalan, supaya fungsi bawaan browser (undo, copy, paste
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

`npm test` menjalankan **sepuluh berkas** di `tests/` lewat [`tsx`](https://tsx.is/)
(devDependency), **tanpa browser dan tanpa Next.js** — butuh Node 20+ (memakai
`Blob`, `URL.createObjectURL`, dan `fetch(blob:)` bawaan Node; diuji pada Node 22). Zustand dan uuid
diganti stub tipis di `tests/stubs/` lewat `tests/tsconfig.json`, dengan kontrak
`(set, get)` yang sama, sehingga store diuji apa adanya tanpa React.
`tests/helpers.ts` menyediakan `E()` / `C()` (elemen dan kanvas halaman aktif),
`onePage()` dan `mkPage()` agar tes cukup menulis dokumen sebagai halaman.

| Berkas | Isi | Jumlah |
|---|---|---|
| `tests/core.test.ts` | warna, font, deteksi format (native v1/v2/v3 vs Polotno), adapter dua arah, **migrasi v1 → v2 → v3** (v2 menjadi satu halaman tanpa peringatan, v3 dibaca sebagai v5, versi 6 ditolak), `parseDocument`, store (history, clipboard, JSON, `editingId`) | 22 |
| `tests/media-workspace.test.ts` | aturan ukuran kanvas & rencana export, pencatat URL objek, `addImageElement`/`replaceImageSource`, **revoke berbasis referensi** (hapus, ganti, Undo, pemangkasan history, clipboard — kini menelusuri semua halaman), gestur gambar = satu langkah undo, `setCanvasMeta`, penyematan `blob:` → `data:` saat export (semua halaman), adapter (struktur bertingkat, `pageIndex`, **tanpa `pageIndex` setiap halaman diimpor dengan ukurannya sendiri**, `color`/`fill`, titik jangkar, crop, gambar, grup) | 28 |
| `tests/templates.test.ts` | registry (id unik, 7 template Polotno ada), **tiap template**: termuat **tanpa peringatan**, warna `#rrggbb`, id/zIndex unik per halaman dan id unik di seluruh dokumen, native ↔ Polotno tanpa kehilangan data; jumlah halaman dan ukuran per halaman tiap berkas Polotno; efek gambar Katalog produk; contoh satu dan tiga halaman | 28 |
| `tests/image-tools.test.ts` | **crop** (pecahan → piksel asli; tepi/sudut; batas gambar dan ukuran minimal; gambar dirotasi dan dicerminkan; geser; reset; *property test* 400 putaran: skala gambar tetap dan piksel yang terlihat tetap di tempatnya), **drop** (hanya seretan berkas, `files[0]`, kursor → koordinat desain pada berbagai zoom, drop di luar kanvas), store (`addImageElement` dengan `at`, `setImageCrop` = satu langkah undo, `resetImageCrop`, `croppingId` mengikuti pilihan), **efek** (hanya efek yang terlihat yang aktif, konfigurasi blur/cache, urutan `cache → filters → blurRadius`), `drawPicture` dengan mask/garis/bayangan (urutan panggilan konteks), deteksi mask, `colorAlpha`, adapter (blur, border, shadow, SVG, mask dikenali/tidak dikenali, peringatan yang tersisa, pulang-pergi), validasi file native, dan contoh `sample-effects.polotno.json` tanpa peringatan | 41 |
| `tests/vector-text-view.test.ts` | `cleanPolotnoText` (paragraf, `<br>`, baris kosong, entitas, teks polos dengan `<`/`>`, atribut berisi `>`), teks HTML lewat adapter + peringatan, SVG (impor, ekspor `svg`, `colorsReplace` data URI/base64/tautan), flip dan skala negatif (*property test* 36 kombinasi rotasi × skala), toleransi lebar teks (per `align`, rotasi, bolak-balik tanpa membengkak), `fitZoom`/`stepZoom`/`scaledSize`, `loadRevision`, export bebas zoom dengan Stage palsu (termasuk gagal dan batas 8192 px), `drawPicture` | 35 |
| `tests/pages.test.ts` | **halaman**: `createBlankPage`, `duplicatePageData` (id baru untuk halaman dan semua elemen), indeks (jepit, validasi, setelah hapus), selectors; store — satu halaman awal, `addPage` (setelah halaman aktif, ukuran diwariskan), `duplicatePage` (id baru, indeks buruk tidak mencatat history), `deletePage` (halaman terakhir dilindungi, undo), **`goToPage` menyetel ulang seleksi/edit/crop**, aksi elemen hanya menyentuh halaman aktif, clipboard lintas halaman, **gestur di halaman 2 tetap satu langkah undo dan Undo membawa kembali ke halaman 2**, `setCanvasMeta` (`allPages`), export/load JSON semua halaman (native dan Polotno), berkas buruk tidak mengubah apa pun; adapter — dokumen banyak halaman pulang-pergi, ukuran halaman `"auto"` vs angka, urutan tumpukan per halaman, **seluruh halaman diimpor**, id unik antarhalaman, `pages` kosong, latar gambar, deteksi v3, migrasi v1/v2 → v3, versi lebih baru ditolak, idempotensi v3 | 37 |
| `tests/v4-effects-selection.test.ts` | **v8**: `resolveOpacity`/`resolveShadow`; `applyElementStylePatch` per tipe (kunci gambar diabaikan pada teks, garis tepi bentuk tidak bisa dihapus, objek sama = tanpa langkah undo); opsi teks (dekorasi, `displayText` dengan huruf besar/kecil dan penomoran, `readTextOptions` native vs `custom` Polotno, nilai buruk dibuang); **adapter**: opacity dan bayangan teks/bentuk disalin tanpa peringatan, bayangan mati tidak dibaca, stroke/spasi/underline/case/justify teks disalin, yang masih tak didukung tetap dilaporkan, **semua field v4 pulang-pergi tanpa kehilangan**, validasi berkas native v4; **auto-fit** (bungkus kata, kata kepanjangan, ukuran terbesar yang muat pada kelipatan 0,5, batas bawah, spasi huruf proporsional); **marquee** (arah seret, kotak berotasi diuji tepat, menyentuh = kena, mode menambah); `bakeTransform`; `fitElementToPage`; **store**: `setSelection`/`toggleSelected`, seleksi ganda digeser dan dihapus sebagai satu langkah undo, `updateElements`, `undefined` menghapus field, seleksi direset oleh pindah halaman/Undo/elemen baru, `setElementStyle`, `flipImage`, `fitToPage` | 23 |
| `tests/ui-flow.test.ts` | **v9**: `scaleCropPicture` (memperbesar dari sudut, rasio tetap, kotak tidak bergerak, sudut seberang diam; tidak pernah lebih kecil dari jendela dari sudut mana pun; batas 20×; gambar tercermin), `previewImport` (format, halaman, elemen, label ukuran, store tidak tersentuh, berkas Polotno 2 halaman, berkas rusak/tidak dikenal), pilihan ekspor (`EXPORT_CHOICES`, `jsonFormatOf`, `isExportChoice`, nama berkas) | 6 |
| `tests/v5-effects-text.test.ts` | **v10**: `sanitizeDash`, satuan dash Polotno (`min(strokeWidth, w/2, h/2)`, dua arah), `resolveTextBackground` (pecahan setengah baris, bawaan Polotno, mati/tidak terlihat), kotak latar per baris (center/right/justify, baris kosong), `curveLayout` (panjang busur + kelonggaran, ke atas/bawah, simetris, tidak pernah lingkaran penuh), **impor Polotno semua efek dengan `warnings: []`**, **ekspor dengan nama Polotno + pulang-pergi identik**, dash teks/gambar di `custom`, yang masih dilaporkan (overline), validasi berkas native v5, **store**: dash/blur/filter lewat `setElementStyle` = satu langkah undo, Undo/Redo latar & lengkung, ekspor JSON native/Polotno memuatnya; pemuat font (nama keluarga, font sistem, URL Google Fonts, Node → `false`) | 13 |
| `tests/filters-export.test.ts` | **filter**: matriks identitas, kecerahan/kontras/saturasi angka demi angka, preset lebih dulu lalu slider, `multiplyMatrices`, `filterKey` dan batas ukuran salinan; `cornerRadius` dan filter di `resolveImageEffects`; `applyImageStylePatch` (jepit, bulatkan, abaikan nilai buruk, objek sama = tanpa langkah undo, `undefined` menghapus); `setImageStyle` (satu geseran = satu langkah undo, hanya gambar di halaman aktif); `drawPicture` dengan sudut membulat (urutan klip, jari-jari dijepit, bayangan di luar bentuk, area klik); **Polotno** (`brightness`, `filters.contrast/saturation`, hitam-putih/sepia, filter tak dikenal dilaporkan sekali, preset di `custom`, `cornerRadius` di bawah mask tetap ditulis, pulang-pergi); validasi file native; **ZIP** (`crc32` nilai standar, `dataUrlToBytes`, struktur arsip, arsip kosong, cap waktu DOS); **batch** (urutan render, progres, halaman awal dipulihkan, galat dilempar setelah dipulihkan, nama berkas bernomor, `waitUntil`) | 33 |

Total **266 tes** (22 + 28 + 28 + 41 + 35 + 37 + 33 + 23 + 6 + 13); semuanya lulus pada saat README
ini ditulis (Node 24 di container `node:24-slim`, karena mesin pengembangan v8 tidak punya
Node terpasang). `npx tsc --noEmit` juga bersih.

Cara menjalankannya tanpa Node di mesin sendiri (dependensi dipasang di *volume* Docker,
folder `node_modules/` di proyek tidak disentuh):

```bash
docker run --rm -v "$PWD:/app" -v kusuka_nm:/app/node_modules -w /app node:24-slim sh -c "npm install && npm test && npx tsc --noEmit"
```

### Diuji di browser dengan Konva asli (v10)

`next dev` di container `node:24-slim` (port 3001), Chromium, jendela ±1020 px:

- **Impor Polotno** berisi teks berlatar + bayangan (Bebas Neue), dua teks melengkung (Pacifico
  ke atas, Montserrat tebal ke bawah), teks dua baris berlatar (Poppins), persegi `dash [3, 2]`
  garis 6 px, lingkaran ber-blur, dan teks hitam-putih: pratinjau impor **tanpa peringatan**;
  keempat `<link>` Google Fonts disisipkan dan `document.fonts.check()` benar untuk keempat
  keluarga; semua efek tampil di kanvas.
- Teks lengkung awalnya kehilangan huruf terakhir ("ke ata", "ke bawa"); setelah busur diberi
  kelonggaran (lihat di atas) teksnya utuh.
- Latar teks dua baris: kotak per baris mengikuti panjang baris; bingkai Transformer tetap kotak
  teks; **diseret** dengan mouse (Group 140,300 → 239,418, latar ikut); **jangkar kanan
  ditarik** → lebar teks 430 → 647 px, skala Group kembali 1, latar tetap per baris.
- **Ikon perataan** diukur di DOM pada keempat perataan: selalu tiga garis (14/9/11 px; rata
  kiri-kanan 14/14/14), digeser kiri/tengah/kanan.
- **Popover ✦ Efek** dibuka dari toolbar. Saklar **Teks lengkung** diklik dengan mouse → "SALE
  50%" melengkung dengan kotak latar di sekeliling busur; **Undo** → kembali lurus; **Redo** →
  melengkung lagi. **Pola garis** persegi (terbaca "Khusus (18, 12)" = 3,2 × 6 px) diganti ke
  Titik-titik → node `Rect` `dash [2, 4]`.
- `stage.toDataURL({ pixelRatio: 2 })` dengan node ber-cache/filter berhasil; tidak ada galat di
  konsol.

### Diuji di browser dengan Konva asli (v9)

`next dev` di container `node:24-slim` (port 3001), Chromium:

- **Tab Impor**: berkas JSON native 2 halaman dipilih → pratinjau menampilkan thumbnail,
  "KusukaEdit · 2 halaman · 1 elemen · 2 ukuran berbeda", desain belum berubah ("Halaman
  1 / 1"); **Buka desain** → "Halaman 1 / 2" dan pesan hasil; **Batal** membuang pratinjau.
- **Menu Ekspor** di kanan Undo/Redo: empat jenis berkas; JSON menyembunyikan resolusi dan
  halaman serta mengubah tombol menjadi "Unduh JSON Polotno"; PNG menampilkan 1x/2x/3x,
  "Halaman aktif" / "Semua (2) · ZIP", dan "Kanvas 1080 × 1080 px → 2160 × 2160 px". Tombol
  **Unduh** sendiri tidak ditekan (fungsi di baliknya sama dengan v8).
- **Strip halaman**: dilipat → tinggi area kanvas 567 → 681 px, zoom 48 % → 59 %, tombol ›
  pindah ke halaman 2; dibuka lagi → kembali seperti semula.
- **Crop** dengan mouse sungguhan: tidak ada banner/petunjuk; tepi kanan ditarik (lebar
  jendela berkurang), pegangan bulat kanan-bawah ditarik → gambar utuh membesar dari
  648 × 432 ke 711,8 × 474,6 px dengan jendela tetap; klik di area kosong halaman menutup
  crop dan lebar elemen menjadi 372,3 px; dibuka lagi dari toolbar, `Enter` menutupnya.
- **Responsif**: 900 × 700 → mode drawer (rel 72 px), drawer terbuka di atas kanvas dengan
  latar gelap dan tertutup lewat klik latar; 420 × 800 → toolbar bergulir ke samping, tidak
  ada scroll horizontal halaman, Stage muat di areanya (zoom 29 %), popover Mask tetap di
  dalam layar; kembali ke 1440 → panel menjadi kolom terbuka, toolbar tidak bergulir.
- Tidak ada galat di konsol browser maupun log server.

### Diuji di browser dengan Konva asli (v8)

Untuk pertama kalinya aplikasi dijalankan utuh: `next dev` di container `node:24-slim`
(Konva 9, react-konva 18, Next 14.2.5 asli dari npm), dibuka di Chromium pada viewport
1440×900. Yang diperiksa langsung pada node Konva (`Konva.stages[0]`) dan di layar:

- **Toolbar teks** muat dalam **satu baris** pada lebar itu; B, U, S, AA, perataan, dan
  daftar bernomor menghasilkan `fontStyle: "bold"`, `textDecoration: "underline
  line-through"`, teks `"1.  ADD A TITLE"` di node `Konva.Text`; tombol aktif tersorot.
- **Efek teks**: menu Efek → bayangan (`shadowEnabled`, warna, blur 12, geser 4,
  kepekatan 0,45), garis tepi huruf (`stroke`, 2 px), transparansi 0,6, dan spasi huruf
  20 % (= 9,6 px pada huruf 48 px) sampai di node dan tampak di layar.
- **Auto-fit**: dengan auto-fit menyala Transformer memberi semua jangkar; mengecilkan
  tinggi kotak (gestur transform disimulasikan dengan `scaleY` + event `transformend` pada
  node) menurunkan ukuran huruf 16 → 14, lalu menyempitkan lebar 300 → 120 px menurunkan ke
  8 px dengan **dua baris yang sama persis** dengan hasil `wrapLines()` editor ini.
- **Marquee** dengan seret mouse sungguhan: kotak memilih teks dan lingkaran yang
  disentuhnya, Transformer memegang kedua node, toolbar "2 elemen dipilih", kotak hilang
  setelah dilepas. **Seret grup** dengan mouse sungguhan: kedua node bergeser sama jauh,
  dan **satu** Undo mengembalikan keduanya. **Ctrl+klik** menambah lalu mengeluarkan elemen.
- **Toolbar gambar** (gambar dimasukkan lewat drop sintetis): Pas halaman (400×200 → 900×450
  di (0, 75)), Balik horizontal (gambar tercermin di layar), Mask lingkaran, slider
  Transparansi 70 % di panel Efek (`opacity` 0,7 di node).
- Tidak ada galat di konsol browser maupun di log server.

### Yang diuji selain itu (tidak ada di repositori)

Skrip-skrip di bawah memakai Playwright + esbuild dan **komponen React asli**
(`EditorRoot` lengkap dengan `globals.css`); hanya `react-konva` diganti stub DOM, dan
Konva sendiri tidak ada (lihat "Belum diuji"). Semuanya dijalankan pada v7. Skrip
Chromium lama dijalankan ulang terhadap UI baru; empat penyesuaian murni milik skrip
(bukan perbaikan kode): tombol "Reset pangkas" kini berlabel **Reset**, kontrol unggah
pindah ke tab **Gambar**, dua pengecekan memakai kanvas lebih kecil karena kolom tengah
kini lebih sempit, pembacaan JSON export kini lewat `pages`, dan `store.getState().elements`
dibaca dari halaman aktif.

- **UI multi-halaman, filter, dan export di Chromium** (16 pengecekan, baru di v7):
  tiga kolom dan satu halaman kosong saat dibuka tanpa galat; strip halaman — Tambah,
  Duplikat, Hapus, label "Halaman n / m", thumbnail, **seleksi dan Transformer direset
  saat pindah halaman**; `Delete` hanya menghapus pilihan di halaman aktif; toolbar
  mengikuti seleksi dan gambar punya **✦ Filter & Efek**; panel: tiga kartu sebaris,
  slider dan preset **mengubah piksel gambar sungguhan** (kecerahan −100 = hitam, dst.)
  dan menulis elemen, efek (sudut, blur, mask, bayangan, garis, Reset); **mode crop**:
  lapisan gelap (`box-shadow … 9999px` di dalam pembungkus `overflow: hidden`), delapan
  handle berwarna `rgb(255, 176, 32)` dengan siku "L" (dua batang berbeda arah), chip
  PANGKAS, Transformer biru `#5b8cff` dengan jangkar putih bulat sebelum crop dan
  **kosong selama crop**, crop berakhir saat halaman berganti; **panel template**: 11
  kartu bergambar, klik tiap kartu membangun jumlah halaman yang benar (7 dari berkas
  Polotno); **panel export**: tombol cakupan, ringkasan, "Semua" butuh ≥ 2 halaman;
  export **halaman aktif** → satu PNG pada ukuran × resolusi; export **semua halaman**
  → satu ZIP, tiap halaman pada ukurannya sendiri (diperiksa dengan `unzip -t` dan
  Python `zipfile`; halaman dan seleksi dipulihkan; saat tiap halaman difoto Transformer
  kosong, Stage berskala 1, dan Stage hanya berisi node halaman itu — **PNG di dalam ZIP
  dibuat stub `toDataURL` (gambar datar berwarna latar halaman)**, jadi yang terbukti adalah
  urutan, ukuran, dan ZIP-nya, bukan hasil gambar Konva);
  **antarmuka terkunci dan menampilkan progres** selama batch; tab Kanvas "terapkan ke
  semua halaman"; export JSON menulis semua halaman (v3) dan Import mengembalikannya,
  juga untuk format Polotno 3 halaman.
- **Drag-and-drop, crop, dan efek di Chromium dengan React asli** (37 pengecekan, dijalankan
  ulang pada v7; `Konva.Filters.Blur` diganti penanda yang mencatat panggilan
  `cache`/`filters`/`blurRadius`):
  lapisan drop muncul dan tidak berkedip saat kursor melintasi elemen anak;
  `dragover` berkas dibatalkan (`copy`) sedangkan seretan teks dibiarkan; gambar
  masuk **tepat di titik tengah kursor** pada zoom Fit, 100% (kanvas di-scroll), dan
  200%, sebagai satu langkah undo; drop di area abu-abu jatuh di tepi terdekat;
  berkas bukan gambar ditolak dengan pesan yang bisa ditutup; beberapa berkas →
  gambar pertama dipasang dan pengguna diberi tahu; drop di luar kanvas dibatalkan
  (halaman tidak membuka berkas); drop saat crop terbuka menutupnya. **Crop**:
  overlay menggantikan node (disembunyikan) dan menempel di kotaknya pada tiap zoom;
  gagang timur/barat/geser = satu langkah undo dan piksel tetap di tempat; klik
  tanpa geser tidak menulis apa-apa; gambar **dirotasi 90°** diseret sepanjang
  sumbunya sendiri; `Esc`/`Enter` menutup, `Delete`/panah diabaikan; `Ctrl+Z` saat
  crop; ganti pilihan menutup crop; hanya gambar yang bisa dipangkas; tombol
  Pangkas/Reset/Selesai; pecahan sampai ke `drawImage` sebagai piksel asli
  (gambar uji 40×20, separuh kanan) dan node menampilkan tepat piksel jendela.
  **Efek**: mask lingkaran dan segitiga memotong sudut yang benar; garis tepi
  berpusat di tepi dan di atas gambar, pada lingkaran mengikuti lingkaran;
  gambar bermask tetap melempar bayangan di luar mask dan siluetnya tak pernah
  terlihat di dalam; bayangan gambar biasa dan `shadowOpacity`; cermin + crop di
  dalam mask; blur memanggil `cache → filters([Blur]) → blurRadius` pada resolusi
  zoom, dibersihkan bila blurnya dihapus, dan gambar tanpa blur tidak pernah
  menyentuh cache; placeholder yang sedang memuat polos; tidak ada galat React.
- **UI di Chromium dengan React asli** (18 pengecekan): upload PNG langsung menjadi
  elemen terpilih dengan URL `blob:` dan rasio benar; berkas non-gambar dan berkas
  rusak ditolak dengan pesan, tanpa elemen kosong, dan URL berkas rusak di-revoke;
  **Ganti** mempertahankan posisi/lebar dan gambar lama tetap terbaca setelah
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
- **Sudut membulat per piksel di Chromium** (4 pengecekan, baru di v7, berkas yang sama
  dengan dua butir di bawah, jadi **24 pengecekan piksel** seluruhnya): empat busur
  memotong sudut tetapi tepi lurus dan isi utuh; jari-jari yang terlalu besar dijepit
  (bentuk pil) dan diabaikan di bawah mask; garis tepi mengikuti garis bulat dan tidak
  meninggalkan sudut persegi; area klik mengikuti garis bulat.
- **Mask, garis tepi, bayangan, dan area klik per piksel di Chromium** (10 pengecekan,
  berkas yang sama dengan pengecekan flip di bawah): `drawPicture` menggambar ke
  `<canvas>` 2D asli dan pikselnya dibaca; metode `...Shape` milik Konva
  (`fillShape`/`strokeShape`) ditiru dengan `fill()`/`stroke()` biasa. Mask lingkaran
  = elips yang menyentuh keempat sisi, segitiga = puncak di tengah-atas; cermin dan
  crop terjadi di dalam mask; garis tepi berpusat di tepi, di atas gambar, dan
  mengikuti elips pada mask lingkaran; bayangan gambar biasa berasal dari gambarnya;
  **tanpa siluet, klip menelan bayangan gambar bermask** (masalah yang diselesaikan),
  dengan siluet bayangan tampak di luar mask dengan warna bayangan dan di bawah
  gambar; garis di atas bayangan; area klik mengikuti mask.
- **Penggambaran gambar terbalik per piksel di Chromium** (10 pengecekan): gambar uji
  4×2 petak berwarna digambar dengan `drawPicture` di `<canvas>` 2D asli (metode
  `translate`/`scale`/`drawImage` yang dipakai sama dengan konteks Konva). `flipX`,
  `flipY`, dan keduanya menukar petak dengan benar; kotak yang terlihat sama persis
  dengan yang tidak dibalik pada rotasi 30°, 90°, −45°, 180°, 217°; cermin terjadi
  *sebelum* putaran; crop lalu cermin; gambar yang belum dimuat tidak menggambar
  piksel; SVG tetap tajam.
- **Type-check mode strict** untuk semua modul non-React (termasuk `pages.ts`,
  `selectors.ts`, `imageStyle.ts`, `imageFilters.ts`, `zipStore.ts`, `batchExport.ts`,
  `exportPages.ts`, `exportImage.ts`, `polotnoAdapter.ts`, `polotnoEffects.ts`, dan
  store); komponen React diperiksa dengan stub tipe untuk
  `react`/`react-konva`/`konva` (hanya menangkap nama dan properti yang salah,
  bukan tipe asli pustaka itu). Tes tidak ikut type-check `next build`
  (`tsconfig.json` mengecualikan `tests/`).

### Belum diuji

- **Fitur v10 yang belum diperiksa:**
  1. Berkas hasil ekspor **belum dibuka di Polotno sungguhan**. Nama properti dan satuan latar
     teks serta dash bentuk dicocokkan dengan kode kanvas Polotno, dan pulang-pergi di editor ini
     identik. Tetapi **bentuk busur teks melengkung pasti sedikit berbeda**, karena rumus busur
     Polotno tidak bisa dibaca. Jadi klaim "100 % presisi di Polotno" belum bisa dibuktikan.
  2. `lineHeight` yang dipakai Polotno untuk latar teks melalui `resolveLineHeight()` (modul
     yang tidak terbaca); di sini dipakai `lineHeight` elemen apa adanya.
  3. Teks melengkung selalu **satu baris** (paragraf digabung dengan spasi), dan kotak teksnya
     tidak menyesuaikan lebar busur. Mengedit teks melengkung (klik dua kali) memakai textarea
     lurus.
  4. Blur/filter pada teks dan bentuk memakai *cache* Konva. Saat jangkar Transformer ditarik,
     yang terlihat adalah bitmap lama yang diskalakan sampai gestur selesai. Ekspor PNG pada
     resolusi 3× belum dibandingkan ketajamannya.
  5. Pemuat font butuh internet (fonts.googleapis.com). Bila luring, teks tetap memakai font
     cadangan, tanpa pesan. Keluarga yang tidak ada di Google Fonts juga diam-diam memakai
     cadangan.
  6. Tombol **Unduh** di menu Ekspor tetap tidak ditekan; ekspor JSON Polotno/native diuji lewat
     store di tes.
- **Fitur v9 yang belum diperiksa:**
  1. Tombol **Unduh** di menu Ekspor tidak ditekan di browser selama pengujian v9 (agar
     tidak mengunduh berkas); fungsi ekspornya sama dengan v8, hanya dipanggil dari tempat lain.
  2. Drawer dan toolbar bergulir di **perangkat sentuh** sungguhan (iPad/ponsel); yang
     diuji adalah viewport sempit di Chromium desktop dengan mouse.
  3. Pegangan bulat crop pada gambar yang **diputar**: matematikanya diuji (delta dipetakan
     ke sumbu elemen seperti gagang lain), tetapi belum diseret dengan mouse pada gambar
     berotasi. Saat belum ada potongan, pegangan bulat menumpuk di atas siku amber di
     sudut yang sama (seperti di Polotno); siku masih bisa diraih di lengannya.
  4. Polotno punya tombol *Cancel* di mode crop; di sini pembatalan lewat `Ctrl+Z`.
- **Fitur v8 yang belum dilihat di Konva asli / Polotno asli:**
  1. Menyeret **jangkar** Transformer dengan mouse sungguhan untuk auto-fit dan untuk
     skala sudut seleksi ganda (ukuran huruf ikut). Yang dijalankan adalah gestur yang
     disimulasikan pada node (lihat di atas); seret mouse sintetis pada jangkar 10 px tidak
     mengenai jangkarnya.
  2. **Satuan `letterSpacing` di Polotno** diasumsikan pecahan ukuran huruf (em). Bila
     Polotno ternyata memakai px, spasi huruf hasil impor/ekspor akan salah skala.
  3. Apakah Polotno punya field **`textTransform`** dan menggambar **garis tepi huruf**
     di belakang huruf (di sini `fillAfterStrokeEnabled`); `custom.listType` dan
     `custom.autoFit` hanya dibaca editor ini (di Polotno teks auto-fit tampil pada
     `fontSize` penuh dan daftar tampil tanpa penanda).
  4. Auto-fit memakai font yang sudah termuat saat diukur; bila web font termuat belakangan
     ukurannya baru dihitung ulang saat teks/kotak berubah.
  5. Popover toolbar di layar sempit (toolbar dibungkus dua baris) dan di perangkat sentuh;
     marquee tidak ada untuk sentuhan.
  6. Menyalin seleksi ganda (`Ctrl+C`) belum didukung; grup (*grouping*) tetap belum ada.
- **`next build`.** Di v8 aplikasi sudah dijalankan dengan `next dev` dan Konva asli
  (lihat "Diuji di browser dengan Konva asli"), tetapi build produksi belum. Bagian di
  bawah ini ditulis untuk v7, ketika registry npm tidak bisa dijangkau; yang **masih**
  belum diperiksa satu per satu di Konva asli: drag/transform gambar lewat Transformer, `Shape` gambar dengan
  `sceneFunc`/`hitFunc` di konteks Konva yang asli (bukan konteks 2D bawaan
  browser), `Stage.scale()`/`size()` yang dikembalikan saat export, dan
  `stage.toDataURL()` sesungguhnya. Logika di belakangnya diuji (store, ukuran,
  riwayat, zoom, rencana export, penggambaran per piksel), dan kodenya lolos
  type-check, tetapi *langkah pertama yang disarankan* adalah `npm install && npm
  run dev`, lalu: unggah gambar, balikkan lewat impor Polotno, geser/putar/ubah
  ukurannya, zoom, dan export PNG pada zoom yang bukan 100%.
- **Konva sungguhan untuk fitur v7** (yang paling berisiko ditekankan):
  1. **Pindah halaman pada `Stage` asli.** Export semua halaman bergantung pada urutan
     "tampilkan halaman → tunggu `Stage` memuat tepat node halaman itu → `toDataURL()`".
     `stageShowsPage` memakai `stage.find()` dengan fungsi dan `node.id()`; keduanya
     ada di API Konva, tetapi tidak pernah dijalankan terhadap Konva asli. Bila
     React-Konva menggambar halaman baru lebih lambat dari batas 4 detik, export
     **dibatalkan dengan pesan** (bukan menghasilkan halaman yang salah).
  2. **Transformer per halaman.** Transformer dibangun ulang tiap `selectedId` atau
     id halaman berubah (diuji dengan stub); perilakunya di Konva asli belum dilihat.
  3. **Filter warna memakai `<canvas>` DOM, bukan filter Konva** (keputusan sadar, lihat
     "Filter & efek gambar"): `getImageData`/`putImageData` pada gambar besar dibatasi
     2560 px sisi terpanjang, dan belum diukur kecepatannya pada foto 12 MP atau saat
     banyak gambar berfilter digeser bersamaan. Gambar lintas-situs tanpa CORS tidak bisa
     difilter (tampil tanpa filter, panel memperingatkan).
  4. Yang sudah ada sejak v6 dan tetap belum diuji terhadap Konva asli: `node.cache()` +
     `Konva.Filters.Blur` (apakah blur tampak benar, radius dalam piksel bitmap),
     `context.clip("evenodd")`, `strokeShape`, `fillShape`, dan `arc` pada `Context`
     Konva (diuji pada konteks 2D browser yang metodenya sama, bukan pembungkus Konva),
     `perfectDrawEnabled={false}` memasang bayangan pada tiap panggilan gambar,
     `onDblClick` pada `Shape` yang `draggable`, dan `Transformer` pada gambar
     ber-garis-tepi/bayangan. **Drag dari file manager sungguhan** juga belum: tes
     memakai `DataTransfer` sintetis dengan `File`.
- **Kecocokan dengan Polotno asli.** Berkas export (native → Polotno) **belum pernah dibuka
  di editor Polotno yang asli**, dan berkas template Polotno di repositori **ditulis
  mengikuti dokumentasi skema, bukan diekspor dari Polotno** — jadi kemampuan Polotno
  asli membukanya belum dipastikan. Khusus v7: nama dan arti `filters.contrast` /
  `filters.saturation`, sifat aditif `brightness`, `custom.filterPreset` (hanya dibaca
  editor ini), pemetaan ukuran halaman `"auto"`, dan apakah Polotno memuat halaman
  berukuran berbeda seperti yang ditulis di sini. Asumsi skema yang sudah ada
  (relatif crop, arah flip terhadap rotasi, asal rotasi, grup, HTML pada teks,
  `clipSrc`, posisi garis tepi, skala blur) tetap berlaku.
- **ZIP hanya diperiksa dengan `unzip -t` dan Python `zipfile`.** Belum dibuka di Windows
  Explorer / macOS Archive Utility. Arsipnya sederhana (metode *store*, nama UTF-8,
  tanpa ZIP64), jadi seharusnya aman, tetapi belum dibuktikan. Batas: ≤ 65535 berkas dan
  ≤ 4 GiB; dokumen dengan banyak halaman besar pada resolusi 3× memakan memori
  browser (setiap halaman dipegang sebagai data URL sampai ZIP selesai).
- **Thumbnail teks** (`<foreignObject>`) membungkus baris dengan aturan browser, bukan
  Konva, sehingga bisa sedikit berbeda dengan kanvas. Bayangan tidak digambar di thumbnail.
- Penyimpangan yang disengaja dari permintaan (lihat bagian masing-masing): klip mask
  dan sudut membulat di dalam node gambar, bukan `<Group clipFunc>`; filter gambar lewat
  matriks warna sendiri, bukan filter Konva; pemrosesan efek ada di `ElementRenderer.tsx`
  (komponen yang dirender `CanvasWorkspace.tsx`); crop memakai overlay DOM dan
  `drawImage` dengan piksel asli (setara properti `crop` `Konva.Image`, tetapi
  node-nya `Shape` agar cermin dan mask bisa digambar di dalamnya); export semua halaman
  menampilkan halaman satu per satu pada **satu** Stage (ada penutup progres) dan
  tidak memakai Stage kedua yang tersembunyi.
- `docker build` (tidak ada Docker daemon).
- Apakah 10 px toleransi lebar cukup untuk font cadangan tertentu: itu bergantung
  pada font di mesin pengguna dan baru terlihat di browser.

---

## Roadmap berikutnya

- Mengatur ulang urutan halaman (seret thumbnail), mengganti nama halaman, dan
  menyalin/menempel halaman antardokumen
- Tombol batal untuk export semua halaman, dan export halaman terpilih saja (mis. 2–4)
- Export PDF multi-halaman
- Verifikasi terhadap Konva dan Polotno asli (lihat "Belum diuji"): jalankan `npm install
  && npm run dev`, impor semua template, export semua halaman, buka export Polotno di
  polotno.com
- Bayangan dan transparansi di thumbnail; mask bentuk lain (bintang, hati)
- Crop dengan rasio terkunci (1:1, 16:9, …) dan pembatalan crop dengan `Esc`
- Drop beberapa gambar sekaligus (sekarang satu per drop) dan drop file `.json`
- Impor grup Polotno (setelah aturan koordinat anaknya dipastikan)
- Penyimpanan gambar di server/object storage sebagai ganti `data:` URL di JSON
- Grouping (seleksi ganda sudah ada), copy/paste seleksi ganda, dan perataan antar-elemen
- Pan kanvas dengan seret/spasi dan shortcut `Ctrl+0` / `Ctrl+=` / `Ctrl+-` (zoom
  dan overlay edit teks sudah ada)
- Mengukur font di klien untuk toleransi lebar teks yang tepat (sekarang tetap 10 px)
- *Hanging indent* untuk daftar dan penanda daftar di `<textarea>` edit teks
- Snapping & alignment guides
- Test interaksi di browser (Playwright) dimasukkan ke repositori, dan CI yang
  menjalankan `npm test`, membangun, dan mendorong image Docker
