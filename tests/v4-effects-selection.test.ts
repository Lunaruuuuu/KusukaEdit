// v4: effects on every element type, the text options of the Polotno-style
// toolbar, multiple selection (marquee, Ctrl/Cmd+click), auto-fit text.
import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E, onePage, mkPage } from "./helpers";
import { useEditorStore } from "@/store/useEditorStore";
import {
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  parseDocument,
  type PolotnoElement,
} from "@/lib/polotnoAdapter";
import { applyElementStylePatch, clearPatch, SHADOW_KEYS } from "@/lib/imageStyle";
import { resolveOpacity, resolveShadow } from "@/lib/imageEffects";
import {
  displayText,
  hasUnknownDecoration,
  normalizeTextDecoration,
  readTextOptions,
  toggleTextDecoration,
} from "@/lib/textOptions";
import { fitFontSize, makeMeasure, textFits, wrapLines, MIN_FIT_FONT_SIZE, type MeasureText } from "@/lib/textFit";
import {
  boxBounds,
  boxIntersectsRect,
  elementsInMarquee,
  marqueeSelection,
  rectFromPoints,
} from "@/lib/selection";
import { bakeTransform } from "@/lib/transform";
import { fitElementToPage } from "@/lib/workspace";
import type { CanvasElement, ImageElement, Page, ShapeElement, TextElement } from "@/types/editor";

const S = () => useEditorStore.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SIZE = { width: 900, height: 600, backgroundColor: "#ffffff" };

const text = (id: string, over: Partial<TextElement> = {}): TextElement => ({
  id,
  type: "text",
  x: 10,
  y: 10,
  width: 200,
  height: 24,
  rotation: 0,
  zIndex: 1,
  text: "Hai",
  fontSize: 20,
  fontFamily: "Inter, sans-serif",
  fill: "#111111",
  align: "left",
  fontStyle: "normal",
  lineHeight: 1.2,
  ...over,
});
const rect = (id: string, over: Partial<ShapeElement> = {}): ShapeElement => ({
  id,
  type: "shape",
  shapeType: "rect",
  x: 300,
  y: 300,
  width: 100,
  height: 50,
  rotation: 0,
  zIndex: 2,
  fill: "#6366f1",
  stroke: "#312e81",
  strokeWidth: 2,
  cornerRadius: 0,
  ...over,
});
const pic = (id: string, over: Partial<ImageElement> = {}): ImageElement => ({
  id,
  type: "image",
  x: 500,
  y: 100,
  width: 200,
  height: 100,
  rotation: 0,
  zIndex: 3,
  src: "https://example.com/a.png",
  cropX: 0,
  cropY: 0,
  cropWidth: 1,
  cropHeight: 1,
  scaleX: 1,
  scaleY: 1,
  ...over,
});

async function fresh(pages: Page[] = [mkPage("p1", SIZE, [text("t1"), rect("r1"), pic("i1")])]): Promise<void> {
  await sleep(600); // let a debounced batch of the previous test seal
  useEditorStore.setState({
    pages,
    currentPageIndex: 0,
    selectedId: null,
    selectedIds: [],
    editingId: null,
    croppingId: null,
    clipboard: null,
    past: [],
    future: [],
  });
}

const polotno = (children: PolotnoElement[]) => ({
  width: 1000,
  height: 1000,
  pages: [{ id: "p", children }],
});

// =============================================================== effects (pure)
test("effects: resolveOpacity / resolveShadow work for any element", () => {
  assert.equal(resolveOpacity({}), 1);
  assert.equal(resolveOpacity({ opacity: 0.4 }), 0.4);
  assert.equal(resolveOpacity({ opacity: 7 }), 1);
  assert.equal(resolveShadow({}), null);
  assert.equal(resolveShadow({ shadowColor: "#000000" }), null, "no blur, no offset: nothing to see");
  assert.deepEqual(resolveShadow({ shadowColor: "#123456", shadowBlur: 8, shadowOpacity: 0.5 }), {
    color: "#123456",
    blur: 8,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.5,
  });
});

test("effects: applyElementStylePatch — each type takes its own keys, a shape keeps its stroke", () => {
  const t = text("t");
  const styled = applyElementStylePatch(t, { opacity: 0.5, shadowColor: "#ff0000", shadowBlur: 4, stroke: "#00ff00", strokeWidth: 3 });
  assert.equal(styled.opacity, 0.5);
  assert.equal(styled.shadowColor, "#ff0000");
  assert.equal(styled.stroke, "#00ff00");
  assert.equal(styled.strokeWidth, 3);
  // picture-only keys are ignored on text
  assert.equal(applyElementStylePatch(t, { blurRadius: 5, maskShape: "circle" }), t);
  // nothing changes -> the same object (no undo step)
  assert.equal(applyElementStylePatch(styled, { opacity: 0.5 }), styled);
  // clearing removes the keys
  const cleared = applyElementStylePatch(styled, clearPatch(SHADOW_KEYS));
  assert.ok(!("shadowColor" in cleared) && !("shadowBlur" in cleared));
  // opacity is clamped
  assert.equal(applyElementStylePatch(t, { opacity: 3 }).opacity, 1);
  // a shape's stroke can change but never disappear
  const r = rect("r");
  assert.equal(applyElementStylePatch(r, { stroke: undefined, strokeWidth: undefined }), r);
  assert.equal(applyElementStylePatch(r, { strokeWidth: 0 }).strokeWidth, 0);
});

// ============================================================ text options (pure)
test("text options: decorations normalise and toggle", () => {
  assert.equal(normalizeTextDecoration("line-through underline"), "underline line-through");
  assert.equal(normalizeTextDecoration(""), null);
  assert.equal(toggleTextDecoration(undefined, "underline"), "underline");
  assert.equal(toggleTextDecoration("underline", "line-through"), "underline line-through");
  assert.equal(toggleTextDecoration("underline line-through", "underline"), "line-through");
  assert.equal(toggleTextDecoration("line-through", "line-through"), undefined);
  assert.equal(hasUnknownDecoration("underline"), false);
  assert.equal(hasUnknownDecoration("overline"), true);
});

test("text options: displayText — case and list markers, numbering skips empty lines", () => {
  assert.equal(displayText({ text: "Hai Dunia", textTransform: "uppercase" }), "HAI DUNIA");
  assert.equal(displayText({ text: "Hai Dunia", textTransform: "lowercase" }), "hai dunia");
  assert.equal(displayText({ text: "a\nb", listType: "bullet" }), "•  a\n•  b");
  assert.equal(displayText({ text: "a\n\nb", listType: "number" }), "1.  a\n\n2.  b");
  assert.equal(displayText({ text: "plain" }), "plain");
});

test("text options: readTextOptions reads native top-level fields and Polotno's custom", () => {
  const native = readTextOptions(
    { stroke: "#ff0000", strokeWidth: 2, textDecoration: "underline", letterSpacing: 0.1, textTransform: "uppercase", listType: "number", autoFit: true },
    "native"
  );
  assert.deepEqual(native, {
    stroke: "#ff0000",
    strokeWidth: 2,
    textDecoration: "underline",
    letterSpacing: 0.1,
    textTransform: "uppercase",
    listType: "number",
    autoFit: true,
  });
  // in a Polotno file list / auto-fit live in `custom`
  assert.deepEqual(readTextOptions({ listType: "bullet", custom: { listType: "bullet", autoFit: true } }, "polotno"), {
    listType: "bullet",
    autoFit: true,
  });
  // stroke width 0 or an invisible colour: no outline; letter spacing is clamped
  assert.deepEqual(readTextOptions({ stroke: "#ff0000", strokeWidth: 0, letterSpacing: 9 }, "native"), { letterSpacing: 1 });
  assert.deepEqual(readTextOptions({ textTransform: "capitalize", listType: "stars" }, "native"), {});
});

// ============================================================ adapter (Polotno)
test("adapter: opacity and shadow of TEXT and FIGURES are copied, with no warning", () => {
  const r = convertPolotnoToKusuka(
    polotno([
      { id: "t", type: "text", x: 0, y: 0, width: 100, text: "Hai", fontSize: 20, opacity: 0.6, shadowEnabled: true, shadowColor: "rgba(0,0,0,0.5)", shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 3, shadowOpacity: 0.8 },
      { id: "f", type: "figure", subType: "rect", x: 0, y: 0, width: 50, height: 50, fill: "#ff0000", opacity: 0.25, shadowEnabled: true, shadowColor: "#0000ff", shadowBlur: 10 },
      // a shadow that is OFF is not read, even with values present (Polotno's defaults)
      { id: "g", type: "figure", subType: "circle", x: 0, y: 0, width: 50, height: 50, shadowEnabled: false, shadowBlur: 5, shadowColor: "black" },
    ])
  );
  assert.deepEqual(r.warnings, []);
  const [t, f, g] = r.document.pages[0].elements;
  assert.equal(t.opacity, 0.6);
  assert.equal(t.shadowColor, "#000000");
  assert.equal(t.shadowBlur, 6);
  assert.equal(t.shadowOffsetX, 2);
  assert.equal(t.shadowOffsetY, 3);
  assert.equal(t.shadowOpacity, 0.4, "colour alpha x shadowOpacity");
  assert.equal(f.opacity, 0.25);
  assert.equal(f.shadowColor, "#0000ff");
  assert.ok(!("shadowColor" in g) && !("opacity" in g));
});

test("adapter: text stroke, letter spacing, underline, case and justify are copied, with no warning", () => {
  const r = convertPolotnoToKusuka(
    polotno([
      { id: "t", type: "text", x: 0, y: 0, width: 100, text: "Hai", fontSize: 20, stroke: "#ff0000", strokeWidth: 2, letterSpacing: 0.05, textDecoration: "underline", textTransform: "uppercase", align: "justify" },
    ])
  );
  assert.deepEqual(r.warnings, []);
  const t = r.document.pages[0].elements[0] as TextElement;
  assert.equal(t.stroke, "#ff0000");
  assert.equal(t.strokeWidth, 2);
  assert.equal(t.letterSpacing, 0.05);
  assert.equal(t.textDecoration, "underline");
  assert.equal(t.textTransform, "uppercase");
  assert.equal(t.align, "justify");
});

test("adapter: what text still cannot do is still reported", () => {
  for (const extra of [{ blurEnabled: true }, { textDecoration: "overline" }, { textTransform: "capitalize" }, { backgroundEnabled: true }]) {
    const r = convertPolotnoToKusuka(polotno([{ id: "t", type: "text", x: 0, y: 0, width: 100, text: "Hai", fontSize: 20, ...extra }]));
    assert.match(r.warnings.join("|"), /efek yang belum didukung/, JSON.stringify(extra));
  }
});

test("adapter: every v4 field survives Kusuka -> Polotno -> Kusuka exactly", () => {
  const els: CanvasElement[] = [
    text("t1", {
      zIndex: 1,
      opacity: 0.5,
      shadowColor: "#112233",
      shadowBlur: 4,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      shadowOpacity: 0.7,
      stroke: "#ff0000",
      strokeWidth: 2,
      textDecoration: "underline line-through",
      letterSpacing: 0.12,
      textTransform: "lowercase",
      listType: "number",
      autoFit: true,
      align: "justify",
    }),
    // the toolbar always writes all five shadow fields
    rect("r1", { zIndex: 2, opacity: 0.3, shadowColor: "#000000", shadowBlur: 9, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0.5 }),
    pic("i1", { zIndex: 3, opacity: 0.8, shadowColor: "#00ff00", shadowBlur: 0, shadowOffsetX: 5, shadowOffsetY: 0, shadowOpacity: 1 }),
  ];
  const doc = onePage(SIZE, els);
  const out = convertKusukaToPolotno(doc);
  const children = out.pages[0].children!;
  assert.equal(children[0].opacity, 0.5);
  assert.equal(children[0].shadowEnabled, true);
  assert.equal(children[0].textDecoration, "underline line-through");
  assert.equal(children[0].letterSpacing, 0.12);
  assert.deepEqual(children[0].custom, { source: "kusukaedit", listType: "number", autoFit: true });
  assert.equal(children[1].opacity, 0.3);
  assert.equal(children[1].shadowEnabled, true);
  assert.equal(children[2].opacity, 0.8);
  const back = convertPolotnoToKusuka(JSON.parse(JSON.stringify(out)));
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.document, doc);
});

test("adapter: native files — v4 fields are validated; a v3 file loads silently as v4", () => {
  const r = parseDocument({
    version: 4,
    pages: [
      {
        id: "p",
        canvas: SIZE,
        elements: [
          { ...text("t"), opacity: -2, shadowColor: "not a colour", letterSpacing: "x", listType: "stars", textDecoration: "underline" },
          { ...rect("r"), opacity: 0.5, shadowColor: "#000", shadowBlur: 5000 },
        ],
      },
    ],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const [t, s] = r.document.pages[0].elements;
  assert.equal(t.opacity, 0, "clamped");
  assert.ok(!("shadowColor" in t) && !("letterSpacing" in t) && !("listType" in t));
  assert.equal((t as TextElement).textDecoration, "underline");
  assert.equal(s.opacity, 0.5);
  assert.equal(s.shadowColor, "#000000");
  assert.equal(s.shadowBlur, 200, "clamped to MAX_SHADOW_BLUR");
});

// ================================================================ auto-fit (pure)
// A fake font: every character is 0.5em wide.
const halfEm: MeasureText = (s, size) => Array.from(s).length * size * 0.5;

test("auto-fit: wrapLines wraps by words and flags a word wider than the box", () => {
  assert.deepEqual(wrapLines("aa bb cc", 30, 10, halfEm), { lines: ["aa bb", "cc"], overflow: false });
  assert.deepEqual(wrapLines("a\nb", 100, 10, halfEm).lines, ["a", "b"]);
  assert.equal(wrapLines("abcdefghijkl", 50, 10, halfEm).overflow, true);
});

test("auto-fit: the font shrinks until the text fits, and never grows past fontSize", () => {
  const box = { text: "Halo dunia yang indah", width: 100, height: 30, fontSize: 40, lineHeight: 1 };
  const size = fitFontSize(box, halfEm);
  assert.ok(size < 40);
  assert.ok(textFits(box, size, halfEm), "fits at the fitted size");
  assert.ok(!textFits(box, size + 0.5, halfEm), "the largest size that fits (0.5 steps)");
  assert.equal(size % 0.5, 0);
  // already fits: unchanged
  assert.equal(fitFontSize({ ...box, height: 1000, width: 1000 }, halfEm), 40);
  // a long word shrinks the text until the word fits the width
  const word = fitFontSize({ text: "Supercalifragilistic", width: 100, height: 1000, fontSize: 40, lineHeight: 1 }, halfEm);
  assert.ok(word * 0.5 * 20 <= 100);
  // impossible: stops at the floor
  assert.equal(fitFontSize({ ...box, height: 1 }, halfEm), MIN_FIT_FONT_SIZE);
});

test("auto-fit: makeMeasure adds letter spacing in proportion to the size", () => {
  const m = makeMeasure((s, size) => s.length * size * 0.5, 0.1);
  assert.equal(m("abc", 10), 15 + 2 * 1); // 3 chars: 2 gaps of 0.1 x 10
  assert.equal(m("a", 10), 5);
});

// ================================================================ marquee (pure)
test("marquee: rectangles from any drag direction; rotated boxes are tested exactly", () => {
  assert.deepEqual(rectFromPoints({ x: 50, y: 40 }, { x: 10, y: 20 }), { x: 10, y: 20, width: 40, height: 20 });
  const box = { x: 100, y: 100, width: 100, height: 100, rotation: 45 };
  const b = boxBounds(box);
  assert.ok(Math.abs(b.x - (100 - 100 * Math.SQRT1_2)) < 1e-9);
  // inside the bounding box but outside the rotated square (left of its left corner)
  assert.equal(boxIntersectsRect(box, { x: 30, y: 105, width: 5, height: 5 }), false);
  assert.equal(boxIntersectsRect(box, { x: 95, y: 110, width: 10, height: 10 }), true);
  // touching counts
  assert.equal(boxIntersectsRect({ x: 0, y: 0, width: 10, height: 10, rotation: 0 }, { x: 10, y: 0, width: 5, height: 5 }), true);
});

test("marquee: elementsInMarquee picks what it touches; modifier keys add to the selection", () => {
  const els = [text("t1"), rect("r1"), pic("i1")];
  assert.deepEqual(elementsInMarquee(els, { x: 0, y: 0, width: 100, height: 100 }), ["t1"]);
  assert.deepEqual(elementsInMarquee(els, { x: 0, y: 0, width: 900, height: 600 }), ["t1", "r1", "i1"]);
  assert.deepEqual(elementsInMarquee(els, { x: 850, y: 550, width: 10, height: 10 }), []);
  assert.deepEqual(marqueeSelection(["a", "b"], ["b", "c"], true), ["a", "b", "c"]);
  assert.deepEqual(marqueeSelection(["a", "b"], ["c"], false), ["c"]);
});

// ========================================================= transform bake (pure)
test("transform: bakeTransform — text width only, even scale grows the letters, auto-fit keeps both sides", () => {
  const t = text("t", { widthTolerance: 10 });
  assert.deepEqual(bakeTransform(t, { x: 1, y: 2, rotation: 3, scaleX: 2, scaleY: 1 }), {
    x: 1,
    y: 2,
    rotation: 3,
    width: 400,
    widthTolerance: 0,
  });
  const even = bakeTransform(text("t"), { x: 0, y: 0, rotation: 0, scaleX: 1.5, scaleY: 1.5 });
  assert.equal((even as Partial<TextElement>).fontSize, 30);
  const fit = bakeTransform(text("t", { autoFit: true, height: 100 }), { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 0.5 });
  assert.equal(fit.height, 50);
  assert.ok(!("fontSize" in fit));
  const img = bakeTransform(pic("i"), { x: 0, y: 0, rotation: 0, scaleX: 0.5, scaleY: 0.7 });
  assert.deepEqual([img.width, img.height], [100, 50], "pictures keep their ratio");
  const shape = bakeTransform(rect("r"), { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 3 });
  assert.deepEqual([shape.width, shape.height], [200, 150]);
});

test("fit to page: proportional, centred, upright; nothing when it already fits that way", () => {
  const box = fitElementToPage(pic("i", { width: 200, height: 100, rotation: 30 }), { width: 900, height: 600 });
  assert.deepEqual(box, { x: 0, y: 75, width: 900, height: 450, rotation: 0 });
  assert.equal(fitElementToPage({ ...pic("i"), ...box! }, { width: 900, height: 600 }), null);
  assert.equal(fitElementToPage(text("t"), { width: 900, height: 600 }), null);
});

// ======================================================================= store
test("store: setSelection / toggleSelected keep selectedId in step", async () => {
  await fresh();
  S().setSelection(["t1", "r1", "nope", "t1"]);
  assert.deepEqual(S().selectedIds, ["t1", "r1"], "unknown ids and duplicates dropped");
  assert.equal(S().selectedId, null, "several selected: no single element");
  S().toggleSelected("r1");
  assert.deepEqual(S().selectedIds, ["t1"]);
  assert.equal(S().selectedId, "t1");
  S().toggleSelected("i1");
  assert.deepEqual(S().selectedIds, ["t1", "i1"]);
  S().setSelectedId(null);
  assert.deepEqual(S().selectedIds, []);
  assert.equal(S().past.length, 0, "selection is never an undo step");
});

test("store: a multiple selection is deleted and nudged as ONE undo step", async () => {
  await fresh();
  S().setSelection(["t1", "r1"]);
  S().nudgeSelected(5, 0);
  S().nudgeSelected(5, 0);
  await sleep(600);
  assert.equal(E().find((e) => e.id === "t1")!.x, 20);
  assert.equal(E().find((e) => e.id === "r1")!.x, 310);
  assert.equal(S().past.length, 1, "one burst = one step");
  S().removeSelected();
  assert.deepEqual(E().map((e) => e.id), ["i1"]);
  assert.deepEqual(S().selectedIds, []);
  S().undo();
  assert.deepEqual(E().map((e) => e.id), ["t1", "r1", "i1"]);
  S().undo();
  assert.equal(E().find((e) => e.id === "t1")!.x, 10);
});

test("store: updateElements writes a group gesture as one step; undefined removes a field", async () => {
  await fresh();
  S().updateElements(
    [
      { id: "t1", attrs: { x: 100 } },
      { id: "r1", attrs: { x: 200 } },
    ],
    "selection:t1,r1"
  );
  S().updateElements([{ id: "t1", attrs: { x: 101 } }], "selection:t1,r1");
  await sleep(600);
  assert.equal(S().past.length, 1);
  S().updateElement("t1", { textDecoration: "underline" } as Partial<CanvasElement>);
  S().updateElement("t1", { textDecoration: undefined } as Partial<CanvasElement>);
  assert.ok(!("textDecoration" in E().find((e) => e.id === "t1")!));
});

test("store: page change, undo and a new element reset the multiple selection", async () => {
  await fresh([mkPage("p1", SIZE, [text("t1"), rect("r1")]), mkPage("p2", SIZE, [])]);
  S().setSelection(["t1", "r1"]);
  S().goToPage(1);
  assert.deepEqual(S().selectedIds, []);
  S().goToPage(0);
  S().setSelection(["t1", "r1"]);
  S().addShapeElement("rect");
  assert.equal(S().selectedIds.length, 1);
  assert.equal(S().selectedIds[0], S().selectedId);
  S().setSelection(["t1", "r1"]);
  S().undo();
  assert.deepEqual(S().selectedIds, []);
});

test("store: setElementStyle on text and shapes; no-op = no undo step", async () => {
  await fresh();
  S().setElementStyle("t1", { opacity: 0.5, shadowColor: "#000000", shadowBlur: 4 });
  S().setElementStyle("r1", { opacity: 0.2 });
  await sleep(600);
  assert.equal(E().find((e) => e.id === "t1")!.opacity, 0.5);
  assert.equal(E().find((e) => e.id === "r1")!.opacity, 0.2);
  const steps = S().past.length;
  S().setElementStyle("r1", { opacity: 0.2 });
  await sleep(600);
  assert.equal(S().past.length, steps);
});

test("store: flipImage and fitToPage are one undo step each", async () => {
  await fresh();
  S().flipImage("i1", "x");
  assert.equal((E().find((e) => e.id === "i1") as ImageElement).scaleX, -1);
  S().fitToPage("i1");
  const i = E().find((e) => e.id === "i1")!;
  assert.deepEqual([i.x, i.y, i.width, i.height], [0, 75, 900, 450]);
  assert.equal(S().past.length, 2);
  S().fitToPage("i1");
  assert.equal(S().past.length, 2, "already fits: nothing recorded");
  S().undo();
  S().undo();
  assert.equal((E().find((e) => e.id === "i1") as ImageElement).scaleX, 1);
});

run().then((code) => process.exit(code));
