# Canvas Design Editor (Polotno-style) — Next.js + Konva

Prototipe / MVP komponen design editor kanvas untuk Next.js, terinspirasi dari
arsitektur [Polotno](https://polotno.com/). Dibangun dengan **React-Konva**
untuk rendering kanvas, dan **Zustand** untuk state management.

Status: **MVP kerja praktek, versi 3** — di atas fitur dasar, Undo/Redo, Export
Gambar, dan Docker, versi ini menambahkan **edit teks langsung di kanvas**,
**import/export JSON kompatibel Polotno**, **galeri template**, dan
**copy/paste elemen**.

## Daftar isi

- [Fitur](#fitur)
- [Struktur proyek](#struktur-proyek)
- [Menjalankan proyek](#menjalankan-proyek-lokal-tanpa-docker)
- [Panduan integrasi & SSR](#panduan-integrasi-ke-proyek-nextjs-lain)
- [Spesifikasi State & Store](#spesifikasi-props--state-store-layer)
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
- [x] Contextual toolbar: warna, ukuran font, font, perataan (teks); warna isi,
      warna garis, tebal garis (bentuk); layering (depan/belakang/naik/turun)
- [x] **Export / Import JSON** dengan dua pilihan format: **Native (KusukaEdit)**
      dan **Polotno-compatible**; format file terdeteksi otomatis saat import
- [x] **Galeri template** (4 preset: 2 format native, 2 format Polotno) dengan
      thumbnail
- [x] **Export gambar** PNG/JPG (1x/2x/3x) lewat `stage.toDataURL()`
- [x] **Docker** — `Dockerfile` multi-stage + `docker-compose.yml`
- [ ] Upload gambar dari lokal → *ditunda* (elemen `image` sudah ikut tersimpan
      saat import/export, tetapi belum digambar di kanvas)

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
│   │   ├── color.ts               # Normalisasi warna (rgb(), rgba(), nama, #rgb -> #rrggbb)
│   │   ├── id.ts                  # Pembuat id elemen
│   │   └── exportImage.ts         # Konva stage.toDataURL() -> file PNG/JPG
│   ├── templates/
│   │   ├── index.ts               # Registry template
│   │   ├── poster-acara.kusuka.json
│   │   ├── kartu-kutipan.kusuka.json
│   │   ├── promo-diskon.polotno.json
│   │   └── post-sosmed.polotno.json
│   └── components/
│       ├── EditorRoot.tsx         # Wrapper client + dynamic import (ssr:false)
│       ├── CanvasWorkspace.tsx    # Stage/Layer/Transformer + keyboard shortcut
│       ├── ElementRenderer.tsx    # Render 1 elemen (Text/Rect/Ellipse)
│       ├── TextEditorOverlay.tsx  # <textarea> untuk edit teks di tempat
│       ├── SidePanel.tsx          # Tab "Elemen" dan "Template"
│       ├── TemplatePanel.tsx      # Kartu template
│       ├── TemplateThumbnail.tsx  # Thumbnail SVG dari dokumen hasil adapter
│       ├── ContextualToolbar.tsx  # Kontrol elemen terpilih
│       ├── HistoryControls.tsx    # Tombol Undo/Redo
│       └── ActionPanel.tsx        # Export/Import JSON (Native/Polotno) + Export Gambar
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
`.template-*`, `.warning-list`; tanpanya overlay edit teks tidak akan menimpa
kanvas). Lalu:

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
- `SidePanel` / `TemplatePanel` **tidak** memakai Konva (thumbnail template
  adalah SVG biasa), sehingga aman di-render di server.
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
| `past`       | `HistorySnapshot[]`      | Tumpukan state sebelumnya (Undo) |
| `future`     | `HistorySnapshot[]`      | Tumpukan state yang baru di-undo (Redo) |

`selectedId`, `clipboard`, `editingId`, dan `stageNode` **tidak pernah** masuk ke
snapshot history — hanya `canvas` dan `elements`.

### Actions

| Fungsi | Signature | Keterangan |
|---|---|---|
| `setCanvasMeta` | `(meta: Partial<CanvasMeta>) => void` | Ubah ukuran/warna latar |
| `setSelectedId` | `(id: string \| null) => void` | Set elemen aktif (tidak masuk history) |
| `setEditingId` | `(id: string \| null) => void` | Mulai/akhiri mode edit teks (tidak masuk history) |
| `setStageNode` | `(stage: Konva.Stage \| null) => void` | Registrasi Stage (otomatis) |
| `addTextElement` | `(preset?: "title"\|"subtitle"\|"paragraph") => void` | Tambah teks baru |
| `addShapeElement` | `(shapeType: "rect"\|"circle") => void` | Tambah bentuk baru |
| `updateElement` | `(id, attrs: Partial<CanvasElement>) => void` | Update properti elemen (drag, resize, warna, teks…); perubahan beruntun di-batch jadi satu langkah undo |
| `syncMeasuredHeight` | `(id: string, height: number) => void` | Menyalin tinggi teks hasil ukur Konva ke store; **tidak** membuat langkah undo |
| `removeElement` | `(id: string) => void` | Hapus elemen |
| `removeSelected` | `() => void` | Hapus elemen aktif (shortcut Delete) |
| `copySelected` | `() => boolean` | Salin elemen aktif ke `clipboard`; `false` bila tidak ada yang dipilih |
| `pasteClipboard` | `() => boolean` | Tempel dengan id baru, +20/+20; `false` bila clipboard kosong |
| `reorderElement` | `(id, "front"\|"back"\|"forward"\|"backward") => void` | Atur z-index |
| `nudgeSelected` | `(dx: number, dy: number) => void` | Geser elemen aktif (shortcut panah) |
| `undo` / `redo` | `() => void` | Mundur / maju satu langkah history |
| `exportToJSON` | `(format?: "kusuka"\|"polotno") => string` | Serialize dokumen; default `"kusuka"` |
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

## Edit teks langsung (In-Place Text Editing)

Konva menggambar teks pada `<canvas>`, yang tidak bisa menerima input keyboard.
Karena itu, saat teks di-**double-click** (atau double-tap), sebuah `<textarea>`
HTML ditempatkan tepat di atas node teks (`TextEditorOverlay.tsx`).

Alur:

1. `ElementRenderer` memanggil `setEditingId(id)` pada `onDblClick`/`onDblTap`.
2. Node Konva disembunyikan (`visible={!isEditing}`) supaya teks tidak tergambar
   dua kali, dan Transformer dilepas dari node itu.
3. `TextEditorOverlay` merender `<textarea>` di dalam `.stage-wrap` (kotak yang
   ukurannya persis sama dengan Stage) pada koordinat `(x, y)` elemen, dengan
   `rotate(rotation)`.
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
- **Batasan:** overlay mengasumsikan Stage tanpa zoom/pan (koordinat Stage =
  piksel CSS). Jika zoom ditambahkan kelak, terapkan skala yang sama pada overlay.

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

- **Diskrit** (`addTextElement`, `addShapeElement`, `removeElement`,
  `reorderElement`, `pasteClipboard`, `loadFromJSON`, `reset`, `setCanvasMeta`)
  → `recordHistoryNow()`: snapshot langsung di-push.
- **Kontinu** (drag, resize, rotate, input toolbar, menyimpan hasil edit teks)
  → `updateElement` → `recordHistoryDebounced(elementId)`: snapshot "sebelum"
  diambil **sekali** di awal batch, lalu timer 500 ms di-reset setiap ada
  perubahan baru; batch "disegel" ke `past` setelah 500 ms tenang. Hasilnya
  **satu gestur = satu langkah undo**.
- `batchKey` = id elemen: drag elemen A lalu langsung drag elemen B tetap jadi
  dua langkah undo.
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
3. `pixelRatio` 1x/2x/3x menentukan resolusi (kanvas 900×600 pada 2x → 1800×1200).
4. JPG memakai `quality: 0.92`; latar belakang kanvas selalu opak sehingga tidak
   ada lubang transparan.

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
      "lineHeight": 1.2         // kelipatan fontSize
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
    }
    // type: "image" → { ..., "src": "data:image/png;base64,..." } (disimpan, belum digambar)
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
field yang hilang diisi default, id kosong/duplikat diganti id baru, dan elemen
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
| `figure` `subType`: `rect` / `circle` (`ellipse` juga diterima) | `shape` `shapeType: "rect"` / `"circle"` |
| `figure` `fill`, `stroke`, `strokeWidth`, `cornerRadius` | field bernama sama |
| `image` | `image` (disimpan, belum digambar) |

> **Soal `color`:** pada skema Polotno, warna teks adalah properti **`fill`**;
> skemanya tidak punya properti `color`
> ([text element](https://polotno.com/docs/schema/text-element)). Adapter
> karena itu membaca `fill` lebih dulu dan memakai `color` hanya sebagai cadangan
> untuk berkas dari sumber lain.

Warna dinormalisasi ke `#rrggbb` (`rgb(220, 38, 38)`, `rgba(...)`, `white`, `#fff`
semuanya diterima); alpha dibuang kecuali transparan penuh, yang disimpan
sebagai `"transparent"`.

**Yang tidak dipetakan — selalu disertai peringatan di UI, tidak pernah gagal diam-diam:**

- Dokumen multi-halaman: hanya halaman 1 yang diimpor (editor ini satu halaman).
- Elemen bertipe lain (`svg`, `video`, `group`, …) dan bentuk selain persegi/lingkaran
  (bintang, segitiga, …) dilewati.
- Efek: `opacity` < 1, bayangan, blur, filter, stroke teks, `letterSpacing`,
  `textDecoration`, `textTransform`, `dash`. Elemennya tetap diimpor, tampilannya
  bisa sedikit berbeda.
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
`type: "text"`, bentuk sebagai `type: "figure"` dengan `subType` `rect`/`circle`,
dan nilai default Polotno (`opacity: 1`, `visible: true`, dst.) ditulis eksplisit.

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

1. **`deps`** — `npm ci` menginstal dependency sesuai `package-lock.json`.
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

Yang sudah diuji (di lingkungan pengembangan, tanpa browser penuh):

- **Adapter** (`polotnoAdapter.ts`, 38 pengecekan di Node): deteksi format, semua
  template (dua format) termuat tanpa error, warna ter-normalisasi, round-trip
  native → Polotno → native identik, hasil export Polotno stabil, migrasi lingkaran
  v1 (termasuk yang diputar) mempertahankan titik tengah, input rusak ditolak.
- **Store** (15 pengecekan di Node, Zustand diganti stub tipis): copy/paste
  (id baru, +20/+20, berundak, salinan independen, satu langkah undo, clipboard
  selamat dari undo), batching history, `syncMeasuredHeight` tanpa langkah undo,
  `editingId` dibersihkan, `loadFromJSON` gagal tidak mengubah state, round-trip
  export → muat ulang identik untuk kedua format.
- **Geometri overlay edit teks** (Chromium): kotak `<textarea>` cocok dengan kotak
  teks referensi dalam < 0,5 px pada rotasi 0°, 30°, dan −75° dengan `globals.css`
  yang sesungguhnya.
- **Type-check mode strict** untuk semua modul non-React.

Belum diuji: `next build`, aplikasi utuh di browser (interaksi Konva/Transformer),
`docker build`, dan membuka export Polotno di editor Polotno asli. Belum ada test
suite di repositori; rencana berikutnya adalah menambahkan Vitest untuk adapter
dan store agar pengujian di atas bisa diulang dengan satu perintah.

---

## Roadmap berikutnya

- Upload & render elemen gambar (`ImageElement`, skemanya sudah siap)
- Multi-select & grouping
- Zoom/pan kanvas (overlay edit teks perlu ikut diskalakan)
- Bold/italic/line-height di toolbar (datanya sudah ada di skema)
- Export kanvas ke PDF
- Snapping & alignment guides
- Test suite otomatis (Vitest) dan CI/CD yang membangun & mendorong image Docker
