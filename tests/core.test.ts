import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E, C, onePage, mkPage } from "./helpers";
import { parseColor, normalizeColor, toInputColor } from "@/lib/color";
import {
  detectFormat,
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  parseDocument,
  toPolotnoFontFamily,
  fromPolotnoFontFamily,
} from "@/lib/polotnoAdapter";
import { useEditorStore } from "@/store/useEditorStore";
import type { CanvasDocument, CanvasElement } from "@/types/editor";

// --------------------------------- color ----------------------------------
test("color: named, short hex, rgb, rgba, alpha handling", () => {
  assert.equal(parseColor("white"), "#ffffff");
  assert.equal(parseColor("BLACK"), "#000000");
  assert.equal(parseColor("#FFF"), "#ffffff");
  assert.equal(parseColor("#6366F1"), "#6366f1");
  assert.equal(parseColor("rgb(0, 161, 255)"), "#00a1ff");
  assert.equal(parseColor("rgba(98, 197, 255, 1)"), "#62c5ff");
  assert.equal(parseColor("rgba(0,0,0,0)"), "transparent");
  assert.equal(parseColor("#11223300"), "transparent");
  assert.equal(parseColor("#11223344"), "#112233");
  assert.equal(parseColor("banana"), null);
  assert.equal(parseColor(42), null);
  assert.equal(normalizeColor(undefined, "#123456"), "#123456");
  assert.equal(toInputColor("transparent"), "#000000");
  assert.equal(toInputColor("#abcdef"), "#abcdef");
});

// ---------------------------------- fonts ---------------------------------
test("fonts: the five built-in stacks round-trip exactly", () => {
  for (const stack of [
    "Inter, sans-serif",
    "Georgia, serif",
    "'Courier New', monospace",
    "'Times New Roman', serif",
    "Verdana, sans-serif",
  ]) {
    assert.equal(fromPolotnoFontFamily(toPolotnoFontFamily(stack)), stack);
  }
  assert.equal(toPolotnoFontFamily("Inter, sans-serif"), "Inter");
  assert.equal(fromPolotnoFontFamily("Roboto"), "Roboto, sans-serif");
  assert.equal(fromPolotnoFontFamily("Open Sans"), "'Open Sans', sans-serif");
});

// -------------------------------- detection -------------------------------
test("detectFormat", () => {
  assert.equal(detectFormat({ pages: [] }), "polotno");
  assert.equal(detectFormat({ version: 2, canvas: {}, elements: [] }), "kusuka");
  assert.equal(detectFormat({ version: 3, pages: [{ id: "a", canvas: {}, elements: [] }] }), "kusuka");
  assert.equal(detectFormat({ version: 3, pages: [] }), "kusuka");
  assert.equal(detectFormat({ schemaVersion: 4, pages: [{ id: "a", children: [] }] }), "polotno");
  assert.equal(detectFormat({ foo: 1 }), "unknown");
  assert.equal(detectFormat(null), "unknown");
  assert.equal(detectFormat([]), "unknown");
});

// ------------------------------ sample documents --------------------------
const nativeDoc: CanvasDocument = onePage(
  { width: 900, height: 600, backgroundColor: "#0f172a" },
  [
    {
      id: "t1", type: "text", x: 40, y: 50, width: 420, height: 60, rotation: 0, zIndex: 5,
      text: "Halo\nDunia", fontSize: 48, fontFamily: "Georgia, serif", fill: "#ffffff",
      align: "center", fontStyle: "bold italic", lineHeight: 1.3,
    },
    {
      id: "r1", type: "shape", shapeType: "rect", x: 200.5, y: 250, width: 200, height: 140.25,
      rotation: 15, zIndex: 2, fill: "#6366f1", stroke: "#312e81", strokeWidth: 2, cornerRadius: 12,
    },
    {
      id: "c1", type: "shape", shapeType: "circle", x: 470, y: 220, width: 160, height: 90,
      rotation: 30, zIndex: 9, fill: "#f97316", stroke: "#7c2d12", strokeWidth: 3, cornerRadius: 0,
    },
    {
      id: "i1", type: "image", x: 10, y: 10, width: 50, height: 50, rotation: 0, zIndex: 1, src: "data:image/png;base64,AAAA",
      cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, scaleX: 1, scaleY: 1,
    },
  ]
);

/** The same design as `nativeDoc`, in the v2 file layout (one canvas + elements). */
const nativeDocV2 = {
  version: 2,
  canvas: nativeDoc.pages[0].canvas,
  elements: nativeDoc.pages[0].elements,
};

test("Kusuka -> Polotno: structure, z-order, property names", () => {
  const p = convertKusukaToPolotno(nativeDoc);
  assert.equal(p.schemaVersion, 4);
  assert.equal(p.width, 900);
  assert.equal(p.height, 600);
  assert.equal(p.pages.length, 1);
  const page = p.pages[0];
  assert.equal(page.background, "#0f172a");
  assert.equal(page.width, "auto");
  // children are bottom-first: zIndex 1 (image), 2 (rect), 5 (text), 9 (circle)
  assert.deepEqual(page.children!.map((c) => c.id), ["i1", "r1", "t1", "c1"]);
  const text = page.children!.find((c) => c.id === "t1")!;
  assert.equal(text.type, "text");
  assert.equal(text.fill, "#ffffff");
  assert.ok(!("color" in text), "Polotno has no `color` property; text color must be `fill`");
  assert.equal(text.fontFamily, "Georgia");
  assert.equal(text.fontWeight, "bold");
  assert.equal(text.fontStyle, "italic");
  assert.equal(text.lineHeight, 1.3);
  const circle = page.children!.find((c) => c.id === "c1")!;
  assert.equal(circle.type, "figure");
  assert.equal(circle.subType, "circle");
  const rect = page.children!.find((c) => c.id === "r1")!;
  assert.equal(rect.subType, "rect");
  assert.equal(rect.cornerRadius, 12);
  assert.equal(page.children!.find((c) => c.id === "i1")!.type, "image");
  // must be plain JSON
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
});

test("Kusuka -> Polotno -> Kusuka is lossless (z-order kept, zIndex renumbered 1..n)", () => {
  const back = convertPolotnoToKusuka(convertKusukaToPolotno(nativeDoc));
  assert.deepEqual(back.warnings.filter((w) => !w.includes("gambar")), []);
  const expectedOrder = [...nativeDoc.pages[0].elements].sort((a, b) => a.zIndex - b.zIndex);
  assert.equal(back.document.pages[0].elements.length, expectedOrder.length);
  back.document.pages[0].elements.forEach((el, i) => {
    const orig = expectedOrder[i];
    assert.deepEqual(el, { ...orig, zIndex: i + 1 }, `element ${orig.id}`);
  });
  assert.deepEqual(back.document.pages[0].canvas, nativeDoc.pages[0].canvas);
});

const polotnoDoc = {
  schemaVersion: 4,
  width: 800,
  height: 500,
  unit: "px",
  dpi: 72,
  fonts: [],
  pages: [
    {
      id: "p1",
      background: "white",
      width: "auto",
      height: "auto",
      bleed: 0,
      duration: 5000,
      children: [
        { id: "a", type: "figure", subType: "circle", x: 100, y: 50, width: 200, height: 100, rotation: 0, fill: "rgb(0, 161, 255)", stroke: "rgba(98, 197, 255, 1)", strokeWidth: 2 },
        { id: "b", type: "text", x: 10, y: 20, width: 300, height: 0, rotation: 5, text: "Hai", fontSize: 40, fontFamily: "Roboto", fontWeight: "700", fontStyle: "italic", fill: "black", align: "center", lineHeight: "1.5" },
        { id: "c", type: "text", x: 0, y: 0, width: 100, text: "legacy", color: "red", fontSize: 20 },
        { id: "d", type: "figure", subType: "star", x: 0, y: 0, width: 50, height: 50 },
        { id: "e", type: "svg", x: 0, y: 0, width: 50, height: 50, src: "data:image/svg+xml;base64,AAAA" },
        { id: "f", type: "figure", subType: "rect", x: 5, y: 6, width: 70, height: 80, opacity: 0.5, visible: true, fill: "#abc" },
        { id: "g", type: "figure", subType: "rect", x: 5, y: 6, width: 70, height: 80, visible: false },
        { id: "h", type: "image", x: 1, y: 2, width: 30, height: 40, src: "https://example.com/a.png" },
      ],
    },
    { id: "p2", children: [] },
  ],
};

test("Polotno -> Kusuka: canvas, order, circle origin, colors, fonts", () => {
  const { document: doc, warnings } = convertPolotnoToKusuka(polotnoDoc);
  // EVERY page is imported now (the file has two); the first one is checked here
  assert.equal(doc.pages.length, 2);
  assert.deepEqual(doc.pages[1].elements, []);
  const d = { canvas: doc.pages[0].canvas, elements: doc.pages[0].elements, version: doc.version };
  assert.deepEqual(d.canvas, { width: 800, height: 500, backgroundColor: "#ffffff" });
  assert.equal(d.version, 4);
  // hidden "g" and star "d" are dropped (the svg "e" is imported since v5);
  // zIndex follows the kept order
  assert.deepEqual(d.elements.map((e) => e.id), ["a", "b", "c", "e", "f", "h"]);
  assert.deepEqual(d.elements.map((e) => e.zIndex), [1, 2, 3, 4, 5, 6]);

  const circle = d.elements[0];
  assert.ok(circle.type === "shape" && circle.shapeType === "circle");
  // top-left origin and bounding box are preserved 1:1 (an ellipse keeps both radii)
  assert.deepEqual([circle.x, circle.y, circle.width, circle.height], [100, 50, 200, 100]);
  assert.equal(circle.fill, "#00a1ff");
  assert.equal(circle.stroke, "#62c5ff");

  const text = d.elements[1];
  assert.ok(text.type === "text");
  assert.equal(text.fill, "#000000");
  assert.equal(text.fontStyle, "bold italic");
  assert.equal(text.fontFamily, "Roboto, sans-serif");
  assert.equal(text.lineHeight, 1.5);
  assert.equal(text.align, "center");
  assert.equal(text.height, 40 * 1.5, "height 0 in the file -> derived from fontSize * lineHeight");
  assert.equal(text.rotation, 5);
  // imported from Polotno: 10px of width tolerance, the centred text stays put
  assert.equal(text.width, 310);
  assert.equal(text.widthTolerance, 10);

  const legacy = d.elements[2];
  assert.ok(legacy.type === "text");
  assert.equal(legacy.fill, "#ff0000", "`color` is accepted as a fallback for `fill`");
  assert.equal(legacy.lineHeight, 1.2, "Polotno default line height");
  assert.equal(legacy.align, "center", "Polotno default alignment");

  const svg = d.elements[3];
  assert.ok(svg.type === "image" && svg.vector === true, "svg -> a vector image element");

  const rect = d.elements[4];
  assert.ok(rect.type === "shape");
  assert.equal(rect.fill, "#aabbcc");
  assert.equal(rect.cornerRadius, 0);

  const joined = warnings.join(" | ");
  assert.doesNotMatch(joined, /hanya halaman/, "no page is dropped any more");
  assert.match(joined, /bentuk "star"/);
  assert.doesNotMatch(joined, /svg/i, "svg is imported now, not skipped");
  assert.doesNotMatch(joined, /gambar/, "an https picture is now imported, not skipped");
  // opacity is supported on every element since v4: copied, not reported
  assert.doesNotMatch(joined, /memakai efek/);
  assert.equal(rect.opacity, 0.5);
  const pic = d.elements[5];
  assert.ok(pic.type === "image" && pic.src === "https://example.com/a.png");
  assert.deepEqual([pic.x, pic.y, pic.width, pic.height], [1, 2, 30, 40]);
  assert.ok(pic.type === "image" && pic.cropX === 0 && pic.cropWidth === 1, "no crop in the file -> the whole picture");
});

test("Polotno -> Kusuka -> Polotno keeps every mapped property", () => {
  const k = convertPolotnoToKusuka(polotnoDoc).document;
  const p2 = convertKusukaToPolotno(k);
  const kids = p2.pages[0].children!;
  const a = kids.find((c) => c.id === "a")!;
  assert.deepEqual([a.subType, a.x, a.y, a.width, a.height, a.fill, a.stroke, a.strokeWidth], ["circle", 100, 50, 200, 100, "#00a1ff", "#62c5ff", 2]);
  const b = kids.find((c) => c.id === "b")!;
  assert.deepEqual([b.text, b.fontSize, b.fontFamily, b.fontWeight, b.fontStyle, b.fill, b.align, b.lineHeight, b.rotation], ["Hai", 40, "Roboto", "bold", "italic", "#000000", "center", 1.5, 5]);
  // second pass is a fixed point
  assert.deepEqual(convertKusukaToPolotno(convertPolotnoToKusuka(p2).document), p2);
});

test("Polotno: empty document, background image, doc-level size fallback", () => {
  const r = convertPolotnoToKusuka({ pages: [] });
  assert.equal(r.document.pages[0].elements.length, 0);
  assert.deepEqual(r.document.pages[0].canvas, { width: 1080, height: 1080, backgroundColor: "#ffffff" });
  const r2 = convertPolotnoToKusuka({ width: 300, height: 200, pages: [{ background: "https://x/y.png", children: [] }] });
  assert.equal(r2.document.pages[0].canvas.backgroundColor, "#ffffff");
  assert.match(r2.warnings.join(" "), /latar gambar\/gradien/);
  const r3 = convertPolotnoToKusuka({ width: 300, height: 200, pages: [{ width: 640, height: "auto", children: [] }] });
  assert.deepEqual([r3.document.pages[0].canvas.width, r3.document.pages[0].canvas.height], [640, 200]);
});

// ------------------------------ native: migration -------------------------
function centerOf(el: CanvasElement): [number, number] {
  const rad = (el.rotation * Math.PI) / 180;
  const hw = el.width / 2;
  const hh = el.height / 2;
  return [el.x + hw * Math.cos(rad) - hh * Math.sin(rad), el.y + hw * Math.sin(rad) + hh * Math.cos(rad)];
}

test("native v1 circle (x,y = centre) migrates to v2 with the same visual centre", () => {
  for (const rotation of [0, 90, 33]) {
    const v1 = {
      version: 1,
      canvas: { width: 900, height: 600, backgroundColor: "#fff" },
      elements: [{ id: "c", type: "shape", shapeType: "circle", x: 300, y: 200, width: 100, height: 100, rotation, zIndex: 1, fill: "#f00", stroke: "#000", strokeWidth: 1 }],
    };
    const r = parseDocument(v1);
    assert.ok(r.ok);
    if (!r.ok) return;
    const el = r.document.pages[0].elements[0];
    const [cx, cy] = centerOf(el);
    assert.ok(Math.abs(cx - 300) < 1e-9 && Math.abs(cy - 200) < 1e-9, `rotation ${rotation}: centre (${cx}, ${cy})`);
    assert.equal(el.width, 100);
    assert.match(r.warnings.join(" "), /dimigrasi/);
  }
});

test("native v1 file without new fields: legacy defaults keep the old look", () => {
  const r = parseDocument({
    canvas: { width: 100, height: 100, backgroundColor: "white" },
    elements: [
      { id: "t", type: "text", x: 0, y: 0, width: 50, height: 20, rotation: 0, zIndex: 1, text: "x", fontSize: 12, fontFamily: "Inter, sans-serif", fill: "black", align: "left" },
      { id: "r", type: "shape", shapeType: "rect", x: 0, y: 0, width: 5, height: 5, rotation: 0, zIndex: 2, fill: "red", stroke: "blue", strokeWidth: 1 },
    ],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const [t, rect] = r.document.pages[0].elements;
  assert.ok(t.type === "text" && t.lineHeight === 1 && t.fontStyle === "normal" && t.fill === "#000000");
  assert.ok(rect.type === "shape" && rect.cornerRadius === 4 && rect.fill === "#ff0000");
  assert.equal(r.document.pages[0].canvas.backgroundColor, "#ffffff");
});

test("native v3 document passes through unchanged (idempotent), silently upgraded to v4", () => {
  const r = parseDocument(JSON.parse(JSON.stringify(nativeDoc)));
  assert.ok(r.ok);
  if (!r.ok) return;
  // v4 only added optional fields: the same pages, just the new version number
  assert.deepEqual(r.document, { ...nativeDoc, version: 4 });
  assert.deepEqual(r.warnings, []);
  const r2 = parseDocument(JSON.stringify(r.document));
  assert.ok(r2.ok && JSON.stringify(r2.document) === JSON.stringify(r.document));
});

test("native v2 document (one canvas + elements) becomes a one-page v3 document, silently", () => {
  const r = parseDocument(JSON.parse(JSON.stringify(nativeDocV2)));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.format, "kusuka");
  assert.equal(r.document.version, 4);
  assert.equal(r.document.pages.length, 1);
  assert.deepEqual(r.document.pages[0].canvas, nativeDoc.pages[0].canvas);
  assert.deepEqual(r.document.pages[0].elements, nativeDoc.pages[0].elements);
  assert.deepEqual(r.warnings, [], "v2 -> v3 loses nothing, so there is nothing to warn about");
});

test("parseDocument: errors and recovery", () => {
  const bad = parseDocument("{not json");
  assert.ok(!bad.ok && /bukan JSON/.test(bad.error));
  const unknown = parseDocument({ hello: "world" });
  assert.ok(!unknown.ok && /tidak dikenali/.test(unknown.error));
  const future = parseDocument({ version: 5, pages: [] });
  assert.ok(!future.ok && /v5/.test(future.error));
  const dirty = parseDocument({
    version: 2,
    canvas: { width: -5, height: "abc" },
    elements: [null, 7, { type: "wat" }, { id: "x", type: "shape", shapeType: "hexagon" }, { id: "dup", type: "image", src: "s" }, { id: "dup", type: "image", src: "s" }],
  });
  assert.ok(dirty.ok);
  if (!dirty.ok) return;
  assert.deepEqual([dirty.document.pages[0].canvas.width, dirty.document.pages[0].canvas.height], [1, 600]);
  assert.equal(dirty.document.pages[0].elements.length, 2);
  assert.notEqual(dirty.document.pages[0].elements[0].id, dirty.document.pages[0].elements[1].id, "duplicate ids are made unique");
  assert.match(dirty.warnings.join(" "), /4 elemen/);
});

// ---------------------------------- store ---------------------------------
const S = () => useEditorStore.getState();

test("store: new shapes are placed by their top-left corner, text has lineHeight", () => {
  S().reset();
  S().addShapeElement("circle");
  S().addShapeElement("rect");
  S().addTextElement("title");
  const [circle, rect, text] = E();
  assert.ok(circle.type === "shape" && rect.type === "shape" && text.type === "text");
  assert.deepEqual(centerOf(circle), [450, 300], "circle centred on the 900x600 canvas");
  assert.deepEqual(centerOf(rect), [450, 300], "rect centred on the 900x600 canvas");
  assert.equal(text.lineHeight, 1.2);
  assert.equal(text.fontStyle, "normal");
  assert.equal(rect.cornerRadius, 4);
  assert.equal(circle.cornerRadius, 0);
});

test("store: Ctrl+C / Ctrl+V — new id, +20/+20 offset, top z-order, one history step", () => {
  S().reset();
  S().addShapeElement("rect");
  S().addTextElement("subtitle");
  const rect = E()[0];
  S().setSelectedId(rect.id);
  assert.equal(S().copySelected(), true);
  assert.equal(S().clipboard?.id, rect.id);

  const pastBefore = S().past.length;
  const countBefore = E().length;
  assert.equal(S().pasteClipboard(), true);
  assert.equal(E().length, countBefore + 1);
  assert.equal(S().past.length, pastBefore + 1, "paste records exactly one undo step");

  const pasted = E()[E().length - 1];
  assert.notEqual(pasted.id, rect.id);
  assert.equal(pasted.x, rect.x + 20);
  assert.equal(pasted.y, rect.y + 20);
  assert.equal(pasted.zIndex, Math.max(...E().map((e) => e.zIndex)));
  assert.ok(pasted.zIndex > rect.zIndex);
  assert.equal(S().selectedId, pasted.id);
  assert.deepEqual({ ...pasted, id: "", x: 0, y: 0, zIndex: 0 }, { ...rect, id: "", x: 0, y: 0, zIndex: 0 }, "everything else is copied");
  // the original is untouched
  assert.equal(E().find((e) => e.id === rect.id)!.x, rect.x);

  // pasting again cascades instead of stacking
  S().pasteClipboard();
  const second = E()[E().length - 1];
  assert.equal(second.x, rect.x + 40);
  assert.equal(second.y, rect.y + 40);

  // undo removes only the last paste
  S().undo();
  assert.equal(E().length, countBefore + 1);
  S().undo();
  assert.equal(E().length, countBefore);
});

test("store: copy/paste edge cases", () => {
  S().reset();
  useEditorStore.setState({ clipboard: null }); // reset() deliberately keeps the clipboard
  assert.equal(S().pasteClipboard(), false);
  const pastBefore = S().past.length;
  assert.equal(S().pasteClipboard(), false);
  assert.equal(S().past.length, pastBefore, "failed paste adds no history entry");
  S().addShapeElement("rect");
  S().setSelectedId(null);
  assert.equal(S().copySelected(), false);
  assert.equal(S().clipboard, null);
  // clipboard survives deleting the original and loading another file
  S().setSelectedId(E()[0].id);
  S().copySelected();
  S().removeSelected();
  assert.equal(E().length, 0);
  assert.equal(S().pasteClipboard(), true);
  assert.equal(E().length, 1);
});

test("store: clipboard is a snapshot — editing the original afterwards does not change it", () => {
  S().reset();
  S().addShapeElement("rect");
  const id = E()[0].id;
  S().setSelectedId(id);
  S().copySelected();
  S().updateElement(id, { fill: "#000000" });
  S().pasteClipboard();
  const pasted = E()[1];
  assert.ok(pasted.type === "shape" && pasted.fill === "#6366f1");
});

test("store: loadFromJSON accepts string/object, both formats, and is undoable", () => {
  S().reset();
  S().addTextElement("title");
  const before = JSON.stringify(E());

  const r1 = S().loadFromJSON(JSON.stringify(nativeDoc));
  assert.ok(r1.ok && r1.format === "kusuka");
  assert.equal(E().length, 4);
  assert.equal(C().backgroundColor, "#0f172a");

  const r2 = S().loadFromJSON(polotnoDoc);
  assert.ok(r2.ok && r2.format === "polotno");
  assert.equal(E().length, 6);
  assert.ok(r2.ok && r2.warnings.length > 0);

  S().undo();
  assert.equal(E().length, 4);
  S().undo();
  assert.equal(JSON.stringify(E()), before);
});

test("store: failed load changes nothing and records no history", () => {
  S().reset();
  S().addTextElement("title");
  const snapshot = JSON.stringify({ c: C(), e: E() });
  const past = S().past.length;
  const r = S().loadFromJSON("{oops");
  assert.ok(!r.ok);
  assert.equal(JSON.stringify({ c: C(), e: E() }), snapshot);
  assert.equal(S().past.length, past);
});

test("store: export -> clear -> import reproduces the canvas exactly (both formats)", async () => {
  for (const format of ["kusuka", "polotno"] as const) {
    S().reset();
    S().loadFromJSON(nativeDoc);
    S().addShapeElement("circle");
    S().updateElement(E()[0].id, { x: 123.456, rotation: 12.5 });

    // Native keeps zIndex values as they are; Polotno has no zIndex (array
    // order is the stacking order), so it comes back renumbered 1..n.
    const stack = [...E()].sort((a, b) => a.zIndex - b.zIndex);
    const expected = format === "kusuka" ? stack : stack.map((e, i) => ({ ...e, zIndex: i + 1 }));
    const expectedCanvas = { ...C() };

    const { json: file, warnings } = await S().exportToJSON(format);
    assert.deepEqual(warnings, []);
    assert.equal(detectFormat(JSON.parse(file)), format);

    S().reset();
    assert.equal(E().length, 0);
    const r = S().loadFromJSON(file);
    assert.ok(r.ok && r.format === format);
    assert.deepEqual(C(), expectedCanvas, `${format}: canvas`);
    assert.deepEqual([...E()].sort((a, b) => a.zIndex - b.zIndex), expected, `${format}: elements`);
  }
});

test("store: syncMeasuredHeight updates height silently (no undo step)", () => {
  S().reset();
  S().addTextElement("paragraph");
  const id = E()[0].id;
  const past = S().past.length;
  S().syncMeasuredHeight(id, 57);
  assert.equal(E()[0].height, 57);
  assert.equal(S().past.length, past);
  const ref = E();
  S().syncMeasuredHeight(id, 57.2);
  assert.equal(E(), ref, "within 0.5px -> state object untouched");
  S().syncMeasuredHeight("missing", 10);
  assert.equal(E(), ref);
});

test("store: editingId is cleared by remove / undo / load / reset", () => {
  S().reset();
  S().addTextElement("title");
  const id = E()[0].id;
  S().setEditingId(id);
  S().removeElement(id);
  assert.equal(S().editingId, null);

  S().addTextElement("title");
  S().setEditingId(E()[0].id);
  S().undo();
  assert.equal(S().editingId, null);

  S().addTextElement("title");
  S().setEditingId(E()[0].id);
  S().loadFromJSON(nativeDoc);
  assert.equal(S().editingId, null);

  S().setEditingId("x");
  S().reset();
  assert.equal(S().editingId, null);
});

run().then((code) => process.exit(code));
