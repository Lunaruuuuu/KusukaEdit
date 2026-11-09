import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E, C, onePage, mkPage } from "./helpers";
import {
  clampPageIndex,
  clonePages,
  collectElementIds,
  collectImageSources,
  createBlankPage,
  duplicatePageData,
  indexAfterDelete,
  isPageIndex,
  pageNumberLabel,
  totalElementCount,
} from "@/lib/pages";
import {
  selectCanvas,
  selectCurrentPage,
  selectElementById,
  selectElements,
  selectPageCount,
} from "@/store/selectors";
import { useEditorStore } from "@/store/useEditorStore";
import {
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  detectFormat,
  parseDocument,
  sanitizeKusukaDocument,
} from "@/lib/polotnoAdapter";
import { DEFAULT_CANVAS, SCHEMA_VERSION } from "@/types/editor";
import type {
  CanvasDocument,
  CanvasElement,
  ImageElement,
  Page,
  ShapeElement,
  TextElement,
} from "@/types/editor";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const S = () => useEditorStore.getState();

// ------------------------------------------------------------------ fixtures
const text = (id: string, over: Partial<TextElement> = {}): TextElement => ({
  id,
  type: "text",
  x: 10,
  y: 10,
  width: 200,
  height: 30,
  rotation: 0,
  zIndex: 1,
  text: `teks ${id}`,
  fontSize: 20,
  fontFamily: "Inter, sans-serif",
  fontStyle: "normal",
  fill: "#111111",
  align: "left",
  lineHeight: 1.2,
  ...over,
});
const rect = (id: string, over: Partial<ShapeElement> = {}): ShapeElement => ({
  id,
  type: "shape",
  shapeType: "rect",
  x: 50,
  y: 60,
  width: 100,
  height: 80,
  rotation: 0,
  zIndex: 2,
  fill: "#ff0000",
  stroke: "#000000",
  strokeWidth: 1,
  cornerRadius: 0,
  ...over,
});
const pic = (id: string, over: Partial<ImageElement> = {}): ImageElement => ({
  id,
  type: "image",
  x: 0,
  y: 0,
  width: 120,
  height: 90,
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
const SIZE_A = { width: 900, height: 600, backgroundColor: "#ffffff" };

async function fresh(pages?: Page[], index = 0): Promise<void> {
  // Let a half-finished debounced batch from the previous test seal itself first.
  await sleep(600);
  useEditorStore.setState({
    pages: pages ?? [mkPage("p1", SIZE_A, [text("t1"), rect("r1")])],
    currentPageIndex: index,
    selectedId: null,
    selectedIds: [],
    editingId: null,
    croppingId: null,
    clipboard: null,
    past: [],
    future: [],
  });
}
const threePages = (): Page[] => [
  mkPage("p1", SIZE_A, [text("a1"), rect("a2")]),
  mkPage("p2", { width: 640, height: 480, backgroundColor: "#112233" }, [text("b1")]),
  mkPage("p3", { width: 300, height: 300, backgroundColor: "#fedcba" }, [pic("c1", { zIndex: 1 })]),
];
const pageIds = () => S().pages.map((p) => p.id);

// ============================================================ lib/pages (pure)
test("pages: createBlankPage copies the canvas it is given and has no elements", () => {
  const canvas = { width: 640, height: 480, backgroundColor: "#123456" };
  const page = createBlankPage(canvas, "x");
  assert.deepEqual(page, { id: "x", canvas, elements: [] });
  assert.notEqual(page.canvas, canvas, "a copy, so changing one page never changes another");
  assert.deepEqual(createBlankPage(undefined, "y").canvas, DEFAULT_CANVAS);
  assert.notEqual(createBlankPage().id, createBlankPage().id, "ids are generated");
});

test("pages: duplicatePageData gives the page and EVERY element a new id and keeps everything else", () => {
  const src = mkPage("p", SIZE_A, [text("t"), rect("r"), pic("i", { maskShape: "circle", brightness: 20 })]);
  let n = 0;
  const copy = duplicatePageData(src, () => `new-${++n}`);
  assert.equal(copy.id, "new-1");
  assert.deepEqual(copy.elements.map((e) => e.id), ["new-2", "new-3", "new-4"]);
  const strip = (e: CanvasElement) => ({ ...e, id: "" });
  assert.deepEqual(copy.elements.map(strip), src.elements.map(strip), "position, size, text, effects ... identical");
  assert.deepEqual(copy.canvas, src.canvas);
  assert.notEqual(copy.canvas, src.canvas);
  assert.deepEqual(src.elements.map((e) => e.id), ["t", "r", "i"], "the source is not touched");
});

test("pages: clonePages is a deep enough copy for history snapshots", () => {
  const pages = threePages();
  const copy = clonePages(pages);
  assert.deepEqual(copy, pages);
  copy[0].elements[0].x = 999;
  copy[0].canvas.width = 1;
  assert.equal(pages[0].elements[0].x, 10);
  assert.equal(pages[0].canvas.width, 900);
});

test("pages: index helpers clamp, validate and move the active page after a delete", () => {
  assert.equal(clampPageIndex(5, 3), 2);
  assert.equal(clampPageIndex(-2, 3), 0);
  assert.equal(clampPageIndex(1.9, 3), 1);
  assert.equal(clampPageIndex(NaN, 3), 0);
  assert.equal(clampPageIndex(0, 0), 0);
  assert.ok(isPageIndex(0, 1) && isPageIndex(2, 3));
  assert.ok(!isPageIndex(3, 3) && !isPageIndex(-1, 3) && !isPageIndex(1.5, 3) && !isPageIndex("1", 3) && !isPageIndex(NaN, 3));

  // [current, deleted, newCount] -> the page shown afterwards
  const table: [number, number, number, number][] = [
    [1, 0, 2, 0], // an earlier page went: the same page, one slot to the left
    [1, 2, 2, 1], // a later page went: nothing changes
    [1, 1, 2, 1], // the shown page went: the one that took its place
    [2, 2, 2, 1], // the LAST page was shown and went: the new last
    [0, 0, 2, 0],
  ];
  for (const [current, deleted, count, expected] of table) {
    assert.equal(indexAfterDelete(current, deleted, count), expected, `current ${current}, deleted ${deleted}`);
  }
});

test("pages: collectors see every page; labels are zero padded", () => {
  const pages = threePages();
  assert.deepEqual([...collectElementIds(pages)].sort(), ["a1", "a2", "b1", "c1"]);
  assert.deepEqual([...collectImageSources(pages)], ["https://example.com/a.png"]);
  assert.equal(totalElementCount(pages), 4);
  assert.equal(pageNumberLabel(0, 9), "01");
  assert.equal(pageNumberLabel(8, 12), "09");
  assert.equal(pageNumberLabel(99, 120), "100");
  assert.equal(pageNumberLabel(2, 120), "003");
});

// ================================================================== selectors
test("selectors: read the active page; an out-of-range index is clamped, never undefined", () => {
  const state = { pages: threePages(), currentPageIndex: 1 };
  assert.equal(selectCurrentPage(state).id, "p2");
  assert.equal(selectCanvas(state).backgroundColor, "#112233");
  assert.deepEqual(selectElements(state).map((e) => e.id), ["b1"]);
  assert.equal(selectPageCount(state), 3);
  assert.equal(selectCurrentPage({ ...state, currentPageIndex: 99 }).id, "p3");
  assert.equal(selectCurrentPage({ ...state, currentPageIndex: -4 }).id, "p1");
});

test("selectors: an element is found on the ACTIVE page only", () => {
  const state = { pages: threePages(), currentPageIndex: 0 };
  assert.equal(selectElementById(state, "a2")?.type, "shape");
  assert.equal(selectElementById(state, "b1"), null, "it lives on page 2");
  assert.equal(selectElementById(state, null), null);
  assert.equal(selectElementById(state, "nope"), null);
  assert.equal(selectElementById({ ...state, currentPageIndex: 1 }, "b1")?.id, "b1");
});

// ============================================================ store: page actions
test("store: a fresh store holds ONE blank page and index 0", async () => {
  const initial = S();
  assert.ok(Array.isArray(initial.pages) && initial.pages.length >= 1);
  assert.equal(typeof initial.currentPageIndex, "number");
  assert.ok(!("elements" in initial), "no second, flat copy of the elements that could drift");
  assert.ok(!("canvas" in initial));
});

test("store: addPage inserts a blank page after the active one, copies its size and shows it", async () => {
  await fresh(threePages(), 0);
  S().setSelectedId("a1");
  S().addPage();
  assert.equal(S().pages.length, 4);
  assert.equal(S().currentPageIndex, 1);
  assert.equal(S().selectedId, null, "selection is reset");
  assert.equal(S().pages[1].elements.length, 0);
  assert.deepEqual(S().pages[1].canvas, S().pages[0].canvas, "same size and background as the page it follows");
  assert.notEqual(S().pages[1].canvas, S().pages[0].canvas);
  assert.deepEqual(pageIds().slice(2), ["p2", "p3"], "the other pages keep their place");
  assert.equal(new Set(pageIds()).size, 4);
  assert.equal(S().past.length, 1);
});

test("store: addPage after the LAST page appends; a page of another size passes its size on", async () => {
  await fresh(threePages(), 2);
  S().addPage();
  assert.equal(S().pages.length, 4);
  assert.equal(S().currentPageIndex, 3);
  assert.deepEqual(S().pages[3].canvas, { width: 300, height: 300, backgroundColor: "#fedcba" });
});

test("store: undo / redo of addPage go back and forth, on the right page", async () => {
  await fresh(threePages(), 1);
  S().addPage();
  assert.equal(S().currentPageIndex, 2);
  S().undo();
  assert.equal(S().pages.length, 3);
  assert.equal(S().currentPageIndex, 1, "back on the page where the change was made");
  S().redo();
  assert.equal(S().pages.length, 4);
  assert.equal(S().currentPageIndex, 2);
});

test("store: duplicatePage copies the active page with all its elements under new ids and shows the copy", async () => {
  const original = threePages();
  await fresh(original, 0);
  S().setSelectedId("a2");
  S().duplicatePage();
  assert.equal(S().pages.length, 4);
  assert.equal(S().currentPageIndex, 1);
  assert.equal(S().selectedId, null);
  assert.deepEqual(S().pages[0], original[0], "the original is untouched");
  assert.equal(S().pages[2].id, "p2", "the following pages keep their order");

  const copy = S().pages[1];
  assert.equal(copy.elements.length, 2);
  const strip = (e: CanvasElement) => ({ ...e, id: "" });
  assert.deepEqual(copy.elements.map(strip), original[0].elements.map(strip));
  const everyId = S().pages.flatMap((p) => [p.id, ...p.elements.map((e) => e.id)]);
  assert.equal(new Set(everyId).size, everyId.length, "ids are unique across the whole document");
  assert.equal(S().past.length, 1);

  // editing the copy leaves the original alone
  S().updateElement(copy.elements[0].id, { x: 777 });
  assert.equal((S().pages[0].elements[0] as TextElement).x, 10);
  assert.equal((E()[0] as TextElement).x, 777);
});

test("store: duplicatePage(index) copies another page; a bad index changes nothing and records nothing", async () => {
  await fresh(threePages(), 0);
  S().duplicatePage(2);
  assert.equal(S().pages.length, 4);
  assert.equal(S().currentPageIndex, 3);
  assert.equal(S().pages[3].elements[0].type, "image");
  assert.deepEqual(S().pages[3].canvas, S().pages[2].canvas);

  const before = S().past.length;
  S().duplicatePage(42);
  S().duplicatePage(-1);
  assert.equal(S().pages.length, 4);
  assert.equal(S().past.length, before);
});

test("store: deletePage removes the page, keeps a sensible active page, is undoable", async () => {
  await fresh(threePages(), 1);
  assert.equal(S().deletePage(), true);
  assert.deepEqual(pageIds(), ["p1", "p3"]);
  assert.equal(S().currentPageIndex, 1, "the page that took its place is shown");
  S().undo();
  assert.deepEqual(pageIds(), ["p1", "p2", "p3"]);
  assert.equal(S().currentPageIndex, 1);
  assert.equal((S().pages[1].elements[0] as TextElement).text, "teks b1", "the deleted page comes back whole");

  // deleting the last page while it is shown moves to the new last page
  await fresh(threePages(), 2);
  assert.equal(S().deletePage(), true);
  assert.equal(S().currentPageIndex, 1);
  // deleting an earlier page keeps the same page on screen
  await fresh(threePages(), 2);
  assert.equal(S().deletePage(0), true);
  assert.deepEqual(pageIds(), ["p2", "p3"]);
  assert.equal(S().currentPageIndex, 1);
  assert.equal(selectCurrentPage(S()).id, "p3");
  // deleting a later page keeps it too
  await fresh(threePages(), 0);
  assert.equal(S().deletePage(2), true);
  assert.equal(selectCurrentPage(S()).id, "p1");
});

test("store: the LAST page cannot be deleted, and a bad index deletes nothing (no history either)", async () => {
  await fresh(undefined, 0);
  assert.equal(S().deletePage(), false);
  assert.equal(S().pages.length, 1);
  assert.equal(S().past.length, 0);

  await fresh(threePages(), 0);
  assert.equal(S().deletePage(9), false);
  assert.equal(S().deletePage(-1), false);
  assert.equal(S().pages.length, 3);
  assert.equal(S().past.length, 0);
});

test("store: going to another page resets the selection, the text edit and the crop", async () => {
  await fresh(threePages(), 0);
  S().setSelectedId("a1");
  useEditorStore.setState({ editingId: "a1", croppingId: "a1" });
  S().goToPage(1);
  assert.equal(S().currentPageIndex, 1);
  assert.equal(S().selectedId, null);
  assert.equal(S().editingId, null);
  assert.equal(S().croppingId, null);
  S().goToPage(0);
  assert.equal(S().selectedId, null, "coming back does not bring the old selection back");
  assert.equal(S().past.length, 0, "looking at another page is not a history step");
});

test("store: goToPage ignores indexes that are not a page, and the page already shown", async () => {
  await fresh(threePages(), 1);
  S().setSelectedId("b1");
  for (const bad of [1, -1, 3, 99, 1.5, NaN, Infinity]) S().goToPage(bad);
  assert.equal(S().currentPageIndex, 1);
  assert.equal(S().selectedId, "b1", "going to the page already shown must not drop the selection");
});

test("store: element actions touch only the ACTIVE page", async () => {
  await fresh(threePages(), 1);
  S().addTextElement("title");
  S().addShapeElement("circle");
  assert.equal(S().pages[1].elements.length, 3);
  assert.equal(S().pages[0].elements.length, 2);
  assert.equal(S().pages[2].elements.length, 1);
  const added = S().selectedId!;
  assert.ok(selectElementById(S(), added));
  S().removeSelected();
  assert.equal(S().pages[1].elements.length, 2);
  // a new element on page 2 is stacked on top of THAT page's elements
  const top = Math.max(...S().pages[1].elements.map((e) => e.zIndex));
  S().addShapeElement("rect");
  assert.equal(E()[E().length - 1].zIndex, top + 1);
  // an element of another page cannot be edited from here
  const before = JSON.stringify(S().pages[0]);
  S().updateElement("a1", { x: 5 });
  S().removeElement("a2");
  assert.equal(JSON.stringify(S().pages[0]), before);
});

test("store: the clipboard works across pages — a paste gets a new id and lands on the active page", async () => {
  await fresh(threePages(), 0);
  S().setSelectedId("a2");
  assert.equal(S().copySelected(), true);
  S().goToPage(1);
  assert.equal(S().pasteClipboard(), true);
  const pasted = E()[E().length - 1];
  assert.equal(pasted.type, "shape");
  assert.notEqual(pasted.id, "a2");
  assert.equal(S().pages[0].elements.length, 2, "page 1 still has its two elements");
  assert.equal(S().selectedId, pasted.id);
  assert.equal(collectElementIds(S().pages).size, 5);
});

test("store: a drag on page 2 stays ONE undo step after leaving the page, and undo brings page 2 back", async () => {
  await fresh(threePages(), 1);
  for (let i = 1; i <= 8; i++) S().updateElement("b1", { x: 10 + i * 10 });
  S().goToPage(0); // seals the burst, so it cannot be merged into an edit made on page 1
  S().updateElement("a1", { x: 321 });
  await sleep(600);
  assert.equal(S().past.length, 2, "one step per page");
  S().undo(); // undoes the a1 edit
  assert.equal(S().currentPageIndex, 0);
  assert.equal((S().pages[0].elements[0] as TextElement).x, 10);
  S().undo(); // undoes the whole b1 drag, on page 2
  assert.equal(S().currentPageIndex, 1, "undo takes you to the page the change was made on");
  assert.equal((S().pages[1].elements[0] as TextElement).x, 10);
  assert.equal(S().selectedId, null);
});

test("store: setCanvasMeta changes the active page, or every page with allPages (one undo step)", async () => {
  await fresh(threePages(), 1);
  S().setCanvasMeta({ width: 1000, backgroundColor: "#00ff00" });
  assert.deepEqual(S().pages.map((p) => p.canvas.width), [900, 1000, 300]);
  assert.equal(C().backgroundColor, "#00ff00");
  await sleep(600);
  S().setCanvasMeta({ width: 1234, height: 777 }, { allPages: true });
  assert.deepEqual(S().pages.map((p) => [p.canvas.width, p.canvas.height]), [[1234, 777], [1234, 777], [1234, 777]]);
  assert.deepEqual(S().pages.map((p) => p.canvas.backgroundColor), ["#ffffff", "#00ff00", "#fedcba"], "the colour was not part of it");
  await sleep(600);
  assert.equal(S().past.length, 2);
  S().undo();
  assert.deepEqual(S().pages.map((p) => p.canvas.width), [900, 1000, 300], "one step undoes all three pages");

  // nothing to change on any page: no history
  await fresh(threePages(), 0);
  S().setCanvasMeta({ width: 900 }, { allPages: false });
  assert.equal(S().past.length, 0);
});

// ====================================================== store: serialisation
const sleepBeforeRead = () => sleep(10);

test("store: exportToJSON writes ALL pages (native v3) and loadFromJSON reads them back", async () => {
  await fresh(threePages(), 2);
  const { json, warnings } = await S().exportToJSON("kusuka");
  assert.deepEqual(warnings, []);
  const file = JSON.parse(json) as CanvasDocument;
  assert.equal(file.version, SCHEMA_VERSION);
  assert.equal(file.version, 5);
  assert.equal(file.pages.length, 3);
  assert.deepEqual(file.pages.map((p) => p.canvas.width), [900, 640, 300]);
  assert.ok(!("elements" in file) && !("canvas" in file), "no second copy of page 1 at the top level");

  await fresh(undefined, 0);
  const revision = S().loadRevision;
  S().setSelectedId("t1");
  const result = S().loadFromJSON(json);
  assert.ok(result.ok);
  assert.equal(result.ok && result.format, "kusuka");
  assert.equal(result.ok && result.pageCount, 3);
  assert.deepEqual(result.ok && result.warnings, []);
  assert.deepEqual(S().pages, threePages());
  assert.equal(S().currentPageIndex, 0, "a loaded document opens on its first page");
  assert.equal(S().selectedId, null);
  assert.equal(S().loadRevision, revision + 1);
  S().undo();
  assert.equal(S().pages.length, 1, "the document before the import is one Ctrl+Z away");
  await sleepBeforeRead();
});

test("store: the Polotno flavour holds every page too, and loads back through the adapter", async () => {
  await fresh(threePages(), 0);
  const { json } = await S().exportToJSON("polotno");
  const file = JSON.parse(json);
  assert.equal(detectFormat(file), "polotno");
  assert.equal(file.pages.length, 3);
  assert.deepEqual(file.pages.map((p: { id: string }) => p.id), ["p1", "p2", "p3"]);
  assert.equal(file.width, 900);
  assert.equal(file.pages[0].width, "auto");
  assert.equal(file.pages[1].width, 640);
  assert.equal(file.pages[1].height, 480);

  await fresh(undefined, 0);
  const result = S().loadFromJSON(json);
  assert.ok(result.ok && result.format === "polotno" && result.pageCount === 3);
  assert.equal(S().pages.length, 3);
  assert.deepEqual(S().pages.map((p) => [p.canvas.width, p.canvas.height, p.canvas.backgroundColor]), [
    [900, 600, "#ffffff"],
    [640, 480, "#112233"],
    [300, 300, "#fedcba"],
  ]);
});

test("store: a bad file loads nothing and leaves the document and history alone", async () => {
  await fresh(threePages(), 1);
  const result = S().loadFromJSON("{ not json");
  assert.equal(result.ok, false);
  assert.equal(S().pages.length, 3);
  assert.equal(S().currentPageIndex, 1);
  assert.equal(S().past.length, 0);
});

test("store: reset() leaves one blank page and is undoable", async () => {
  await fresh(threePages(), 2);
  S().reset();
  assert.equal(S().pages.length, 1);
  assert.equal(S().pages[0].elements.length, 0);
  assert.equal(S().currentPageIndex, 0);
  S().undo();
  assert.equal(S().pages.length, 3);
  assert.equal(S().currentPageIndex, 2);
});

// ================================================== adapter: pages <-> Polotno
test("adapter: a document of several pages goes to Polotno and back unchanged", () => {
  const doc: CanvasDocument = { version: SCHEMA_VERSION, pages: threePages() };
  const polotno = convertKusukaToPolotno(doc);
  assert.equal(polotno.pages.length, 3);
  assert.equal(polotno.pages[2].children!.length, 1);
  const back = convertPolotnoToKusuka(polotno);
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.document, doc);
  // and through a real JSON string
  const viaText = parseDocument(JSON.stringify(polotno));
  assert.ok(viaText.ok);
  assert.deepEqual(viaText.ok && viaText.document, doc);
});

test("adapter: page sizes — 'auto' for a page of the document's size, numbers for another", () => {
  const polotno = convertKusukaToPolotno({ version: 3, pages: threePages() });
  assert.deepEqual([polotno.width, polotno.height], [900, 600], "the first page sets the document size");
  assert.deepEqual(polotno.pages.map((p) => [p.width, p.height]), [["auto", "auto"], [640, 480], [300, 300]]);
  // only ONE side differs: the other side stays "auto"
  const mixed = convertKusukaToPolotno({
    version: 3,
    pages: [mkPage("a", SIZE_A), mkPage("b", { ...SIZE_A, height: 1000 })],
  });
  assert.deepEqual(mixed.pages.map((p) => [p.width, p.height]), [["auto", "auto"], ["auto", 1000]]);
  const back = convertPolotnoToKusuka(mixed);
  assert.deepEqual(back.document.pages.map((p) => [p.canvas.width, p.canvas.height]), [[900, 600], [900, 1000]]);
});

test("adapter: stacking order is written per page, bottom first", () => {
  const page = mkPage("p", SIZE_A, [text("top", { zIndex: 9 }), rect("bottom", { zIndex: 1 }), pic("mid", { zIndex: 5 })]);
  const polotno = convertKusukaToPolotno({ version: 3, pages: [page, mkPage("q", SIZE_A, [rect("q1")])] });
  assert.deepEqual(polotno.pages[0].children!.map((c) => c.id), ["bottom", "mid", "top"]);
  const back = convertPolotnoToKusuka(polotno).document.pages[0].elements;
  assert.deepEqual(back.map((e) => [e.id, e.zIndex]), [["bottom", 1], ["mid", 2], ["top", 3]]);
});

test("adapter: every page of a Polotno file is imported — the 'first page only' limit is gone", () => {
  const child = (id: string) => ({ id, type: "figure", subType: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#abcdef" });
  const doc = {
    schemaVersion: 4,
    width: 800,
    height: 600,
    pages: [
      { id: "one", children: [child("a"), child("b")], background: "#ffffff" },
      { id: "two", width: 400, height: 400, children: [child("c")], background: "#000000" },
      { id: "three", children: [], background: "#ff0000" },
    ],
  };
  const r = convertPolotnoToKusuka(doc);
  assert.equal(r.document.version, 5);
  assert.deepEqual(r.document.pages.map((p) => p.id), ["one", "two", "three"]);
  assert.deepEqual(r.document.pages.map((p) => p.elements.length), [2, 1, 0]);
  assert.deepEqual(r.document.pages.map((p) => [p.canvas.width, p.canvas.height, p.canvas.backgroundColor]), [
    [800, 600, "#ffffff"],
    [400, 400, "#000000"],
    [800, 600, "#ff0000"],
  ]);
  assert.deepEqual(r.warnings, []);
});

test("adapter: ids are unique across the whole document, also when pages repeat them", () => {
  const child = (id: string) => ({ id, type: "figure", subType: "rect", width: 10, height: 10 });
  const r = convertPolotnoToKusuka({
    schemaVersion: 4,
    width: 100,
    height: 100,
    pages: [
      { id: "same", children: [child("x"), child("x")] },
      { id: "same", children: [child("x")] },
      { children: [{ type: "figure", subType: "rect", width: 1, height: 1 }] },
    ],
  });
  const ids = r.document.pages.flatMap((p) => [p.id, ...p.elements.map((e) => e.id)]);
  assert.equal(new Set(ids).size, ids.length, ids.join(","));
  assert.equal(r.document.pages.length, 3);
});

test("adapter: a Polotno file without pages gives one blank page and says so", () => {
  const none = convertPolotnoToKusuka({ schemaVersion: 4, width: 300, height: 200, pages: [] });
  assert.equal(none.document.pages.length, 1);
  assert.deepEqual([none.document.pages[0].canvas.width, none.document.pages[0].canvas.height], [300, 200]);
  assert.match(none.warnings.join(" "), /tidak berisi halaman/);
});

test("adapter: pages with a picture or gradient background are counted once and shown white", () => {
  const r = convertPolotnoToKusuka({
    schemaVersion: 4,
    width: 100,
    height: 100,
    pages: [
      { id: "a", background: "linear-gradient(red, blue)", children: [] },
      { id: "b", background: "#112233", children: [] },
      { id: "c", background: "url(https://e/x.png)", children: [] },
    ],
  });
  assert.deepEqual(r.document.pages.map((p) => p.canvas.backgroundColor), ["#ffffff", "#112233", "#ffffff"]);
  assert.equal(r.warnings.filter((w) => /latar gambar\/gradien/.test(w)).length, 1);
  assert.match(r.warnings.join(" "), /^2 halaman memakai latar gambar\/gradien/);
});

test("adapter: detectFormat tells native v3 from Polotno, also with an empty pages array", () => {
  assert.equal(detectFormat({ version: 3, pages: [{ id: "p", canvas: {}, elements: [] }] }), "kusuka");
  assert.equal(detectFormat({ version: 3, pages: [] }), "kusuka");
  assert.equal(detectFormat({ version: 2, canvas: {}, elements: [] }), "kusuka");
  assert.equal(detectFormat({ schemaVersion: 4, pages: [{ id: "p", children: [] }] }), "polotno");
  assert.equal(detectFormat({ pages: [{ id: "p", children: [] }] }), "polotno");
  assert.equal(detectFormat(null), "unknown");
  assert.equal(detectFormat("text"), "unknown");
  assert.equal(detectFormat({}), "unknown");
});

test("adapter: native v1 and v2 files open as one page; v3 pages are read in order with unique ids", () => {
  const v2 = sanitizeKusukaDocument({
    version: 2,
    canvas: { width: 400, height: 300, backgroundColor: "#ffffff" },
    elements: [rect("r")],
  });
  assert.ok(!("error" in v2));
  if (!("error" in v2)) {
    assert.equal(v2.document.version, 5);
    assert.equal(v2.document.pages.length, 1);
    assert.deepEqual(v2.warnings, []);
    assert.ok(v2.document.pages[0].id.length > 0);
  }

  // version 1 stored a circle by its CENTRE; it is moved to the box corner
  const v1 = sanitizeKusukaDocument({
    version: 1,
    canvas: { width: 400, height: 300, backgroundColor: "#ffffff" },
    elements: [{ ...rect("c"), shapeType: "circle", x: 100, y: 100, width: 80, height: 80 }],
  });
  assert.ok(!("error" in v1));
  if (!("error" in v1)) {
    const c = v1.document.pages[0].elements[0];
    assert.deepEqual([c.x, c.y], [60, 60]);
  }

  const v3 = sanitizeKusukaDocument({
    version: 3,
    pages: [
      { id: "same", canvas: SIZE_A, elements: [rect("x"), rect("x")] },
      { id: "same", canvas: { ...SIZE_A, width: 500 }, elements: [rect("x")] },
    ],
  });
  assert.ok(!("error" in v3));
  if (!("error" in v3)) {
    assert.deepEqual(v3.document.pages.map((p) => p.canvas.width), [900, 500]);
    const ids = v3.document.pages.flatMap((p) => [p.id, ...p.elements.map((e) => e.id)]);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("adapter: a native v3 file with no pages opens as one blank page, with a warning", () => {
  const r = parseDocument({ version: 3, pages: [] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.document.pages.length, 1);
  assert.equal(r.document.pages[0].elements.length, 0);
  assert.ok(r.warnings.length >= 1);
});

test("adapter: a file from a newer version is refused with a clear message", () => {
  const r = parseDocument({ version: SCHEMA_VERSION + 1, pages: [] });
  assert.ok(!r.ok);
  assert.match(r.ok ? "" : r.error, new RegExp(`v${SCHEMA_VERSION + 1}`));
});

test("adapter: a native v3 document is idempotent (parse -> write -> parse), silently read as v5", () => {
  const doc = { version: 3, pages: threePages() };
  const a = parseDocument(JSON.parse(JSON.stringify(doc)));
  assert.ok(a.ok);
  if (!a.ok) return;
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(a.document, { ...doc, version: SCHEMA_VERSION });
  const b = parseDocument(JSON.stringify(a.document));
  assert.ok(b.ok && JSON.stringify(b.document) === JSON.stringify(a.document));
});

run().then((code) => process.exit(code));
