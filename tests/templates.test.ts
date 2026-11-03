import assert from "node:assert/strict";
import { test, run } from "./harness";
import {
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  detectFormat,
  parseDocument,
} from "@/lib/polotnoAdapter";
import { TEMPLATES } from "@/templates";
import sample from "../examples/sample-design.json";
import samplePolotno from "../examples/sample-design.polotno.json";
import multipage from "../examples/sample-multipage.json";
import multipagePolotno from "../examples/sample-multipage.polotno.json";
import type { CanvasDocument } from "@/types/editor";

const HEX = /^#[0-9a-f]{6}$/;
const isColor = (c: string) => HEX.test(c) || c === "transparent";

/** Templates written in Polotno's own format (src/templates/polotno/*.polotno.json). */
const POLOTNO_IDS = [
  "presentasi-3-slide",
  "brosur-2-halaman",
  "carousel-4-slide",
  "kartu-nama-2-sisi",
  "undangan-story-3",
  "katalog-produk-2-halaman",
  "paket-feed-dan-story",
];
const EXPECTED_PAGES: Record<string, number> = {
  "presentasi-3-slide": 3,
  "brosur-2-halaman": 2,
  "carousel-4-slide": 4,
  "kartu-nama-2-sisi": 2,
  "undangan-story-3": 3,
  "katalog-produk-2-halaman": 2,
  "paket-feed-dan-story": 2,
};

test("template registry: unique ids, every entry has a name, the Polotno collection is there", () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TEMPLATES) assert.ok(t.name.trim() !== "", t.id);
  for (const id of POLOTNO_IDS) assert.ok(ids.includes(id), `missing template ${id}`);
  assert.equal(TEMPLATES.length, 11);
});

for (const tpl of TEMPLATES) {
  test(`template ${tpl.id}: loads without warnings, colors are #rrggbb, ids and zIndex are unique per page`, () => {
    const parsed = parseDocument(tpl.data);
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    if (!parsed.ok) return;
    // a bundled template must open clean: nothing it uses may be unsupported
    assert.deepEqual(parsed.warnings, [], `${tpl.id} opens with warnings`);
    const doc = parsed.document;
    assert.equal(doc.version, 3);
    assert.ok(doc.pages.length >= 1);
    const allIds: string[] = [];
    for (const page of doc.pages) {
      assert.match(page.canvas.backgroundColor, HEX);
      for (const el of page.elements) {
        if (el.type === "text") assert.ok(isColor(el.fill), el.id);
        if (el.type === "shape") assert.ok(isColor(el.fill) && isColor(el.stroke), el.id);
        allIds.push(el.id);
      }
      assert.equal(new Set(page.elements.map((e) => e.zIndex)).size, page.elements.length, "zIndex");
      allIds.push(page.id);
    }
    assert.equal(new Set(allIds).size, allIds.length, "ids are unique across the whole document");
  });

  test(`template ${tpl.id}: native -> Polotno -> native is lossless and Polotno output is stable`, () => {
    const parsed = parseDocument(tpl.data);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const doc = parsed.document;
    const polotno = convertKusukaToPolotno(doc);
    assert.equal(detectFormat(polotno), "polotno");
    assert.equal(polotno.pages.length, doc.pages.length, "every page is written");
    const back = parseDocument(JSON.parse(JSON.stringify(polotno)));
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(back.document, doc);
    const again = convertKusukaToPolotno(convertPolotnoToKusuka(polotno).document);
    assert.deepEqual(again, polotno);
  });
}

test("the Polotno collection: detected as Polotno, every page of every file is imported", () => {
  for (const id of POLOTNO_IDS) {
    const tpl = TEMPLATES.find((t) => t.id === id)!;
    assert.equal(detectFormat(tpl.data), "polotno", id);
    const raw = tpl.data as { pages: { children: unknown[] }[] };
    const parsed = parseDocument(tpl.data);
    assert.ok(parsed.ok && parsed.format === "polotno", id);
    if (!parsed.ok) continue;
    assert.equal(parsed.document.pages.length, EXPECTED_PAGES[id], id);
    assert.equal(raw.pages.length, EXPECTED_PAGES[id], `${id}: the file itself`);
    // no page comes out empty and nothing is dropped on the way
    raw.pages.forEach((rp, i) => {
      assert.equal(parsed.document.pages[i].elements.length, rp.children.length, `${id} page ${i + 1}`);
    });
  }
});

test("a template with pages of different sizes keeps every page's own size", () => {
  const paket = parseDocument(TEMPLATES.find((t) => t.id === "paket-feed-dan-story")!.data);
  assert.ok(paket.ok);
  if (!paket.ok) return;
  const [feed, story] = paket.document.pages;
  assert.deepEqual([feed.canvas.width, feed.canvas.height], [1080, 1080]);
  assert.deepEqual([story.canvas.width, story.canvas.height], [1080, 1920]);
  const slides = parseDocument(TEMPLATES.find((t) => t.id === "presentasi-3-slide")!.data);
  assert.ok(slides.ok);
  if (slides.ok) for (const p of slides.document.pages) assert.deepEqual([p.canvas.width, p.canvas.height], [1280, 720]);
});

test("katalog-produk: picture effects (rounded, filters, blur, mask) survive the import", () => {
  const parsed = parseDocument(TEMPLATES.find((t) => t.id === "katalog-produk-2-halaman")!.data);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const pics = parsed.document.pages.flatMap((p) => p.elements).filter((e) => e.type === "image");
  assert.equal(pics.length, 8);
  const find = (pred: (e: (typeof pics)[number]) => boolean) => pics.some(pred);
  assert.ok(find((e) => e.type === "image" && e.brightness === 12), "brightness 0.12 -> +12");
  assert.ok(find((e) => e.type === "image" && e.filterPreset === "sepia"));
  assert.ok(find((e) => e.type === "image" && e.filterPreset === "grayscale"));
  assert.ok(find((e) => e.type === "image" && e.contrast === 30 && e.saturation === 40));
  assert.ok(find((e) => e.type === "image" && e.blurRadius === 6));
  assert.ok(find((e) => e.type === "image" && e.cornerRadius === 60));
  assert.ok(find((e) => e.type === "image" && e.maskShape === "circle"));
});

test("shipped examples (native + Polotno) load with zero warnings and describe the same design", () => {
  const a = parseDocument(sample);
  const b = parseDocument(samplePolotno);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(b.warnings, []);
  assert.equal(a.format, "kusuka");
  assert.equal(b.format, "polotno");
  // The Polotno file's texts carry the import width tolerance (+10px, with the
  // left edge moved back by the part that matches the alignment). Undo it, and
  // both files must describe the very same design.
  const withoutTolerance = (doc: CanvasDocument): CanvasDocument => ({
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      elements: page.elements.map((el) => {
        if (el.type !== "text" || !el.widthTolerance) return el;
        const { widthTolerance, ...rest } = el;
        const k = el.align === "center" ? 0.5 : el.align === "right" ? 1 : 0;
        return { ...rest, width: el.width - widthTolerance, x: el.x + k * widthTolerance };
      }),
    })),
  });
  assert.ok(b.document.pages[0].elements.some((el) => el.type === "text" && el.widthTolerance === 10));
  assert.deepEqual(a.document, withoutTolerance(b.document));
});

test("the multi-page examples (native + Polotno) hold the same three pages", () => {
  const a = parseDocument(multipage);
  const b = parseDocument(multipagePolotno);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(b.warnings, []);
  assert.equal(a.document.pages.length, 3);
  assert.equal(b.document.pages.length, 3);
  assert.deepEqual(
    a.document.pages.map((p) => [p.canvas.width, p.canvas.height, p.canvas.backgroundColor]),
    [[900, 600, "#0f172a"], [900, 600, "#fef3c7"], [600, 600, "#ecfdf5"]]
  );
  // written by this editor, read back by this editor: the same document
  assert.deepEqual(b.document, a.document);
});

run().then((code) => process.exit(code));
