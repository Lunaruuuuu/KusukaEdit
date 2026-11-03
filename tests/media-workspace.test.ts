import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E, C, onePage, mkPage } from "./helpers";
import {
  CANVAS_LIMITS,
  MAX_EXPORT_SIDE,
  RATIO_PRESETS,
  clampDimension,
  fitImageToCanvas,
  matchRatio,
  resolveExportPixelRatio,
  sizeForRatio,
} from "@/lib/workspace";
import {
  hasTrackedObjectUrls,
  isObjectUrl,
  isTrackedObjectUrl,
  releaseUnreferencedObjectUrls,
  trackObjectUrl,
} from "@/lib/objectUrls";
import { embedObjectUrls } from "@/lib/imageData";
import {
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  parseDocument,
} from "@/lib/polotnoAdapter";
import { useEditorStore } from "@/store/useEditorStore";
import type { CanvasDocument, CanvasElement, ImageElement, TextElement } from "@/types/editor";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Records every URL.revokeObjectURL() call while still doing the real thing.
const revoked: string[] = [];
const realRevoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = (url: string) => {
  revoked.push(url);
  realRevoke(url);
};

const PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
function makeBlobUrl(): string {
  return URL.createObjectURL(new Blob([PNG_BYTES], { type: "image/png" }));
}

const S = () => useEditorStore.getState();

// A clean slate with an EMPTY history. (The store's own reset() is an undoable
// action — it records a step — so it cannot be used to start from nothing.)
// Waits first so a half-finished debounced batch from the previous test cannot
// seal itself into the fresh history.
async function hardReset() {
  await sleep(600);
  useEditorStore.setState({
    pages: [mkPage("page-1", { width: 900, height: 600, backgroundColor: "#ffffff" })],
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
const imageOf = (id: string) => E().find((e) => e.id === id) as ImageElement;

// =============================================================== workspace
test("workspace: clampDimension rounds, clamps to 50..4000 and falls back on garbage", () => {
  assert.equal(clampDimension(10, 900), CANVAS_LIMITS.min);
  assert.equal(clampDimension(99999, 900), CANVAS_LIMITS.max);
  assert.equal(clampDimension(123.6, 900), 124);
  assert.equal(clampDimension(NaN, 900), 900);
  assert.equal(clampDimension(Infinity, 900), 900);
  assert.equal(clampDimension(-30, 900), 50);
});

test("workspace: ratio presets keep the longer side", () => {
  const p = (id: string) => RATIO_PRESETS.find((r) => r.id === id)!;
  assert.deepEqual(sizeForRatio({ width: 900, height: 600 }, p("1:1")), { width: 900, height: 900 });
  assert.deepEqual(sizeForRatio({ width: 900, height: 600 }, p("16:9")), { width: 900, height: 506 });
  assert.deepEqual(sizeForRatio({ width: 900, height: 600 }, p("9:16")), { width: 506, height: 900 });
  assert.deepEqual(sizeForRatio({ width: 900, height: 600 }, p("4:5")), { width: 720, height: 900 });
  // portrait in -> landscape out keeps the same longest side
  assert.deepEqual(sizeForRatio({ width: 600, height: 900 }, p("16:9")), { width: 900, height: 506 });
  // never leaves the allowed range
  const tiny = sizeForRatio({ width: 60, height: 50 }, p("9:16"));
  assert.ok(tiny.width >= CANVAS_LIMITS.min && tiny.height >= CANVAS_LIMITS.min);
});

test("workspace: matchRatio recognises presets within rounding, null for custom sizes", () => {
  assert.equal(matchRatio(1080, 1080)?.id, "1:1");
  assert.equal(matchRatio(1920, 1080)?.id, "16:9");
  assert.equal(matchRatio(506, 900)?.id, "9:16");
  assert.equal(matchRatio(900, 506)?.id, "16:9");
  assert.equal(matchRatio(900, 600), null);
  assert.equal(matchRatio(0, 10), null);
  for (const preset of RATIO_PRESETS) {
    const s = sizeForRatio({ width: 1000, height: 1000 }, preset);
    assert.equal(matchRatio(s.width, s.height)?.id, preset.id, `${preset.id} round-trips through sizeForRatio`);
  }
});

test("workspace: export plan = canvas x pixelRatio, lowered only past the browser limit", () => {
  assert.deepEqual(resolveExportPixelRatio(900, 600, 2), { pixelRatio: 2, capped: false, outputWidth: 1800, outputHeight: 1200 });
  assert.deepEqual(resolveExportPixelRatio(1200, 675, 3), { pixelRatio: 3, capped: false, outputWidth: 3600, outputHeight: 2025 });
  const big = resolveExportPixelRatio(4000, 3000, 3);
  assert.equal(big.capped, true);
  assert.ok(big.pixelRatio < 3);
  assert.ok(Math.max(big.outputWidth, big.outputHeight) <= MAX_EXPORT_SIDE);
  assert.equal(resolveExportPixelRatio(1000, 1000, NaN).pixelRatio, 1);
  assert.equal(resolveExportPixelRatio(1000, 1000, -2).pixelRatio, 1);
  // exactly at the limit is not "capped"
  assert.equal(resolveExportPixelRatio(4096, 4096, 2).capped, false);
});

test("workspace: fitImageToCanvas keeps the aspect ratio and never enlarges", () => {
  const canvas = { width: 900, height: 600 };
  const big = fitImageToCanvas(4000, 3000, canvas);
  assert.ok(big.width <= 900 * 0.6 + 1e-9 && big.height <= 600 * 0.6 + 1e-9);
  assert.ok(Math.abs(big.width / big.height - 4 / 3) < 0.01);
  const small = fitImageToCanvas(200, 100, canvas);
  assert.deepEqual(small, { width: 200, height: 100 });
  const tiny = fitImageToCanvas(10, 10, canvas);
  assert.deepEqual(tiny, { width: 24, height: 24 });
  assert.deepEqual(fitImageToCanvas(0, 0, canvas), { width: 300, height: 150 }, "no intrinsic size -> fallback");
});

// ============================================================= object URLs
test("objectUrls: only blob: URLs are tracked; only unreferenced ones are revoked", () => {
  assert.equal(isObjectUrl("blob:nodedata:abc"), true);
  assert.equal(isObjectUrl("https://x/y.png"), false);
  assert.equal(isObjectUrl("data:image/png;base64,AAAA"), false);

  const keep = makeBlobUrl();
  const drop = makeBlobUrl();
  trackObjectUrl(keep);
  trackObjectUrl(drop);
  trackObjectUrl("https://example.com/a.png");
  assert.equal(isTrackedObjectUrl("https://example.com/a.png"), false);
  assert.equal(hasTrackedObjectUrls(), true);

  revoked.length = 0;
  const released = releaseUnreferencedObjectUrls(new Set([keep]));
  assert.deepEqual(released, [drop]);
  assert.deepEqual(revoked, [drop]);
  assert.equal(isTrackedObjectUrl(keep), true);
  assert.equal(isTrackedObjectUrl(drop), false);
  assert.deepEqual(releaseUnreferencedObjectUrls(new Set([keep])), [], "already released: nothing happens twice");
  releaseUnreferencedObjectUrls(new Set());
});

// ================================================================== store
test("store: addImageElement — fitted, centred, on top, selected, one undo step", () => {
  S().reset();
  S().addShapeElement("rect");
  const url = makeBlobUrl();
  const past = S().past.length;
  S().addImageElement({ src: url, naturalWidth: 4000, naturalHeight: 3000 });

  const img = E()[E().length - 1] as ImageElement;
  assert.equal(img.type, "image");
  assert.equal(img.src, url);
  assert.ok(Math.abs(img.width / img.height - 4 / 3) < 0.01, "natural aspect ratio");
  assert.ok(img.width <= 540 + 1e-9 && img.height <= 360 + 1e-9, "fitted inside the canvas");
  assert.ok(Math.abs(img.x + img.width / 2 - 450) < 1, "centred horizontally");
  assert.ok(Math.abs(img.y + img.height / 2 - 300) < 1, "centred vertically");
  assert.deepEqual([img.cropX, img.cropY, img.cropWidth, img.cropHeight], [0, 0, 1, 1]);
  assert.equal(img.rotation, 0);
  assert.equal(img.zIndex, Math.max(...E().map((e) => e.zIndex)));
  assert.equal(S().selectedId, img.id);
  assert.equal(S().past.length, past + 1);
  assert.equal(isTrackedObjectUrl(url), true);

  S().undo();
  assert.ok(!E().some((e) => e.id === img.id));
  S().redo();
  assert.ok(E().some((e) => e.id === img.id));
  S().reset();
});

test("store: deleting a picture does NOT revoke its URL while Undo can still bring it back", () => {
  S().reset();
  const url = makeBlobUrl();
  S().addImageElement({ src: url, naturalWidth: 300, naturalHeight: 200 });
  const id = E()[0].id;

  revoked.length = 0;
  S().removeElement(id);
  assert.equal(E().length, 0);
  assert.ok(!revoked.includes(url), "still referenced by the history stack");

  S().undo();
  assert.equal(E().length, 1, "the picture is back");
  assert.equal(imageOf(id).src, url);
  assert.ok(!revoked.includes(url), "and its URL is still valid");
  S().reset();
});

test("store: a deleted picture's URL is revoked once it has fallen out of the history", () => {
  S().reset();
  const url = makeBlobUrl();
  S().addImageElement({ src: url, naturalWidth: 300, naturalHeight: 200 });
  S().removeElement(E()[0].id);

  revoked.length = 0;
  // MAX_HISTORY is 50: push enough discrete steps that no snapshot holds the picture.
  for (let i = 0; i < 60; i++) S().addShapeElement("rect");
  assert.ok(revoked.includes(url), "revoked after the last snapshot that showed it was trimmed");
  assert.equal(revoked.filter((u) => u === url).length, 1, "revoked exactly once");
  assert.equal(isTrackedObjectUrl(url), false);
  S().reset();
});

test("store: replacing a picture keeps position and width, follows the new aspect ratio, resets the crop", () => {
  S().reset();
  const oldUrl = makeBlobUrl();
  const newUrl = makeBlobUrl();
  S().addImageElement({ src: oldUrl, naturalWidth: 400, naturalHeight: 400 });
  const id = E()[0].id;
  S().updateElement(id, { x: 100, y: 50, width: 200, height: 200, rotation: 25, cropX: 0.1, cropWidth: 0.5 });

  S().replaceImageSource(id, { src: newUrl, naturalWidth: 800, naturalHeight: 400 });
  const img = imageOf(id);
  assert.equal(img.src, newUrl);
  assert.deepEqual([img.x, img.y, img.width, img.rotation], [100, 50, 200, 25]);
  assert.equal(img.height, 100, "2:1 picture at width 200");
  assert.deepEqual([img.cropX, img.cropY, img.cropWidth, img.cropHeight], [0, 0, 1, 1]);

  revoked.length = 0;
  S().replaceImageSource("does-not-exist", { src: makeBlobUrl(), naturalWidth: 1, naturalHeight: 1 });
  S().undo(); // the replace on a missing id must not have recorded anything
  assert.equal(imageOf(id).src, oldUrl, "undo restores the previous picture");
  assert.ok(!revoked.includes(oldUrl), "its URL was kept for exactly this");
  S().redo();
  assert.equal(imageOf(id).src, newUrl);
  S().reset();
});

test("store: reset() is undoable, so the pictures it clears stay valid until the history forgets them", async () => {
  await hardReset();
  const a = makeBlobUrl();
  S().addImageElement({ src: a, naturalWidth: 100, naturalHeight: 100 });
  const id = E()[0].id;
  revoked.length = 0;
  S().reset();
  assert.equal(E().length, 0);
  assert.ok(!revoked.includes(a), "\"Kosongkan Kanvas\" can be undone, so the picture must survive it");
  S().undo();
  assert.equal(imageOf(id).src, a);
});

test("store: the clipboard keeps a copied picture's URL alive until it holds something else", async () => {
  await hardReset();
  const url = makeBlobUrl();
  S().addImageElement({ src: url, naturalWidth: 100, naturalHeight: 100 });
  S().copySelected();
  S().removeElement(E()[0].id);
  // forget every snapshot that showed the picture: only the clipboard still has it
  useEditorStore.setState({ past: [], future: [] });

  revoked.length = 0;
  S().addShapeElement("rect"); // any change re-checks the references
  assert.ok(!revoked.includes(url), "still on the clipboard");

  // pasting it back still works, with the same URL
  assert.equal(S().pasteClipboard(), true);
  const pasted = E()[E().length - 1] as ImageElement;
  assert.equal(pasted.src, url);

  // once the clipboard holds something else (and nothing else shows it) it is released
  S().removeElement(pasted.id);
  useEditorStore.setState({ past: [], future: [] });
  S().setSelectedId(E()[0].id);
  S().copySelected();
  assert.ok(revoked.includes(url), "released once the clipboard holds something else");
});

test("store: moving/scaling/rotating a picture is ONE debounced history step", async () => {
  await hardReset();
  S().addImageElement({ src: makeBlobUrl(), naturalWidth: 400, naturalHeight: 200 });
  const id = E()[0].id;
  await sleep(600); // let the "add" settle
  const before = { ...imageOf(id) };
  const past = S().past.length;

  // one gesture: many updates in quick succession
  for (let i = 1; i <= 10; i++) S().updateElement(id, { x: before.x + i * 5, y: before.y + i });
  S().updateElement(id, { width: before.width * 2, height: before.height * 2 });
  S().updateElement(id, { rotation: 33 });
  await sleep(650);

  assert.equal(S().past.length, past + 1, "one undo step for the whole gesture");
  const after = imageOf(id);
  assert.equal(after.width, before.width * 2);
  assert.equal(after.rotation, 33);

  S().undo();
  const undone = imageOf(id);
  assert.deepEqual([undone.x, undone.y, undone.width, undone.height, undone.rotation], [before.x, before.y, before.width, before.height, before.rotation]);
  S().redo();
  assert.equal(imageOf(id).rotation, 33);
  S().reset();
});

test("store: gestures on two different pictures are two undo steps", async () => {
  await hardReset();
  S().addImageElement({ src: makeBlobUrl(), naturalWidth: 100, naturalHeight: 100 });
  S().addImageElement({ src: makeBlobUrl(), naturalWidth: 100, naturalHeight: 100 });
  const [a, b] = E().map((e) => e.id);
  await sleep(600);
  const past = S().past.length;
  S().updateElement(a, { x: 11 });
  S().updateElement(b, { x: 22 }); // within 500 ms, but a different element
  await sleep(650);
  assert.equal(S().past.length, past + 2);
  S().undo();
  assert.equal(imageOf(b).x !== 22, true);
  assert.equal(imageOf(a).x, 11);
  S().reset();
});

test("store: setCanvasMeta clamps, rounds, normalises color and ignores garbage", () => {
  S().reset();
  S().setCanvasMeta({ width: 10 });
  assert.equal(C().width, 50);
  S().setCanvasMeta({ width: 99999, height: 1234.4 });
  assert.deepEqual([C().width, C().height], [4000, 1234]);
  S().setCanvasMeta({ width: NaN as unknown as number });
  assert.equal(C().width, 4000, "NaN keeps the current size");
  S().setCanvasMeta({ backgroundColor: "red" });
  assert.equal(C().backgroundColor, "#ff0000");
  const before = C().backgroundColor;
  S().setCanvasMeta({ backgroundColor: "not-a-color" });
  assert.equal(C().backgroundColor, before);
  S().reset();
});

test("store: setCanvasMeta — no-op creates no history; a burst is one undo step; undo restores the size", async () => {
  await hardReset();
  S().addShapeElement("rect");
  await sleep(600);
  const original = { ...C() };
  const rect = { ...E()[0] };
  const past = S().past.length;

  S().setCanvasMeta({ width: original.width, height: original.height });
  await sleep(600);
  assert.equal(S().past.length, past, "same values -> nothing recorded");

  for (const w of [901, 950, 1000, 1200]) S().setCanvasMeta({ width: w });
  S().setCanvasMeta({ height: 675 });
  await sleep(650);
  assert.equal(S().past.length, past + 1);
  assert.deepEqual([C().width, C().height], [1200, 675]);
  assert.deepEqual(E()[0], rect, "elements keep their coordinates when the canvas is resized");

  S().undo();
  assert.deepEqual(C(), original);
  S().redo();
  assert.deepEqual([C().width, C().height], [1200, 675]);

  // the exported picture follows the workspace
  const plan = resolveExportPixelRatio(C().width, C().height, 2);
  assert.deepEqual([plan.outputWidth, plan.outputHeight], [2400, 1350]);
  S().reset();
});

test("store: exportToJSON embeds uploaded blob: pictures as data: URLs and leaves the live state alone", async () => {
  S().reset();
  const url = makeBlobUrl();
  S().addImageElement({ src: url, naturalWidth: 300, naturalHeight: 200 });
  const liveBefore = JSON.stringify(E());

  const { json, warnings } = await S().exportToJSON("kusuka");
  assert.deepEqual(warnings, []);
  const doc = JSON.parse(json) as CanvasDocument;
  const el = doc.pages[0].elements[0] as ImageElement;
  assert.match(el.src, /^data:image\/png;base64,/);
  const bytes = Buffer.from(el.src.split(",")[1], "base64");
  assert.deepEqual([...bytes], [...PNG_BYTES], "the file carries the picture's real bytes");
  assert.equal(JSON.stringify(E()), liveBefore, "the editor keeps using the cheap blob URL");

  // the Polotno flavour embeds too, and survives a full import
  const polotno = JSON.parse((await S().exportToJSON("polotno")).json);
  assert.match(polotno.pages[0].children[0].src, /^data:image\/png;base64,/);
  S().reset();
  const loaded = S().loadFromJSON(json);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.ok && loaded.warnings, []);
  assert.equal((E()[0] as ImageElement).src, el.src);
  S().reset();
});

test("store: a picture whose blob URL is dead is reported on export, never dropped", async () => {
  S().reset();
  const dead = makeBlobUrl();
  realRevoke(dead);
  const doc: CanvasDocument = onePage({ width: 900, height: 600, backgroundColor: "#ffffff" }, [
    { id: "i", type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1, src: dead, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, scaleX: 1, scaleY: 1 },
  ]);
  const r = await embedObjectUrls(doc);
  assert.equal(r.document.pages[0].elements.length, 1);
  assert.equal((r.document.pages[0].elements[0] as ImageElement).src, dead);
  assert.match(r.warnings.join(" "), /1 gambar tidak bisa dibaca lagi/);
});

test("import: a blob: picture from an old file is flagged (the URL died with its page)", () => {
  const r = parseDocument({
    version: 2,
    canvas: { width: 100, height: 100, backgroundColor: "#fff" },
    elements: [{ id: "i", type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1, src: "blob:http://localhost:3000/abc" }],
  });
  assert.ok(r.ok);
  assert.match(r.ok ? r.warnings.join(" ") : "", /blob:/);
  assert.equal(r.ok && r.document.pages[0].elements.length, 1, "kept, shown as a placeholder");
});

// ================================================================= adapter
const polotnoBase = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 4,
  width: 1000,
  height: 800,
  pages: [{ id: "p1", background: "#ffffff", width: "auto", height: "auto", children, ...extra }],
});

test("adapter: nested pages[].children are flattened to one ordered array, groups are reported", () => {
  const { document: d, warnings } = convertPolotnoToKusuka(
    polotnoBase([
      { id: "t", type: "text", x: 10, y: 10, width: 200, text: "A", fontSize: 20, fill: "#112233" },
      { id: "g", type: "group", x: 0, y: 0, width: 100, height: 100, children: [{ id: "g1", type: "figure", subType: "rect" }, { id: "g2", type: "text" }] },
      { id: "i", type: "image", x: 5, y: 6, width: 30, height: 40, src: "https://example.com/a.png" },
      { id: "r", type: "figure", subType: "rect", x: 1, y: 2, width: 3, height: 4 },
    ])
  );
  assert.deepEqual(d.pages[0].elements.map((e) => e.id), ["t", "i", "r"]);
  assert.deepEqual(d.pages[0].elements.map((e) => e.zIndex), [1, 2, 3], "stacking order = array order, no gap left by the group");
  assert.match(warnings.join(" | "), /1 elemen grup \(berisi 2 elemen/);
});

test("adapter: every page is imported by default, in order, with its own size and unique ids", () => {
  const doc = {
    width: 500,
    height: 500,
    pages: [
      { id: "a", children: [{ id: "x", type: "figure", subType: "rect", width: 5, height: 5 }] },
      { id: "b", width: 640, height: 480, children: [{ id: "y", type: "figure", subType: "rect", width: 5, height: 5 }] },
      // the same element id on another page: ids are unique across the document
      { id: "c", children: [{ id: "x", type: "figure", subType: "rect", width: 5, height: 5 }] },
    ],
  };
  const all = convertPolotnoToKusuka(doc);
  assert.equal(all.document.pages.length, 3);
  assert.deepEqual(all.document.pages.map((p) => p.id), ["a", "b", "c"]);
  assert.deepEqual(all.document.pages.map((p) => [p.canvas.width, p.canvas.height]), [[500, 500], [640, 480], [500, 500]]);
  const ids = all.document.pages.flatMap((p) => p.elements.map((e) => e.id));
  assert.equal(new Set(ids).size, 3, "the repeated id was renamed");
  assert.equal(ids[0], "x");
  assert.equal(ids[1], "y");
  assert.doesNotMatch(all.warnings.join(" "), /halaman/, "nothing is dropped, so nothing is reported");
});

test("adapter: pageIndex picks the one page that is imported", () => {
  const doc = {
    width: 500,
    height: 500,
    pages: [
      { id: "a", children: [{ id: "x", type: "figure", subType: "rect", width: 5, height: 5 }] },
      { id: "b", width: 640, height: 480, children: [{ id: "y", type: "figure", subType: "rect", width: 5, height: 5 }] },
    ],
  };
  const second = convertPolotnoToKusuka(doc, { pageIndex: 1 });
  assert.deepEqual(second.document.pages[0].elements.map((e) => e.id), ["y"]);
  assert.deepEqual([second.document.pages[0].canvas.width, second.document.pages[0].canvas.height], [640, 480]);
  assert.equal(second.document.pages.length, 1, "only the page asked for");
  assert.deepEqual(second.warnings, []);
});

test("adapter: Polotno text color — `fill` is the color; `color` only as a fallback; unusable -> black + warning", () => {
  const { document: d, warnings } = convertPolotnoToKusuka(
    polotnoBase([
      { id: "a", type: "text", x: 0, y: 0, width: 100, text: "a", fill: "rgb(255, 0, 0)" },
      { id: "b", type: "text", x: 0, y: 0, width: 100, text: "b", color: "blue" },
      { id: "c", type: "text", x: 0, y: 0, width: 100, text: "c", fill: "#00ff00", color: "#0000ff" },
      { id: "d", type: "text", x: 0, y: 0, width: 100, text: "d", fill: "linear-gradient(red, blue)", color: "#123456" },
      { id: "e", type: "text", x: 0, y: 0, width: 100, text: "e", fill: "linear-gradient(red, blue)" },
      { id: "f", type: "text", x: 0, y: 0, width: 100, text: "f" },
      { id: "g", type: "text", x: 0, y: 0, width: 100, text: "g", fill: "hsl(120, 100%, 50%)" },
    ])
  );
  const fills = d.pages[0].elements.map((e) => (e.type === "text" ? e.fill : null));
  assert.deepEqual(fills, ["#ff0000", "#0000ff", "#00ff00", "#123456", "#000000", "#000000", "#00ff00"]);
  const colorWarnings = warnings.filter((w) => w.includes("warna"));
  assert.equal(colorWarnings.length, 1);
  assert.match(colorWarnings[0], /^1 warna/, "only text `e` is unusable; `d` was rescued by `color`, `f` specified nothing");
});

test("adapter: figure colors accept rgb/rgba/hsl/hex/names; an unreadable one counts once", () => {
  const { document: d, warnings } = convertPolotnoToKusuka(
    polotnoBase([
      { id: "a", type: "figure", subType: "rect", width: 10, height: 10, fill: "hsl(0, 100%, 50%)", stroke: "rgba(0, 0, 255, 1)" },
      { id: "b", type: "figure", subType: "circle", width: 10, height: 10, fill: "radial-gradient(red, blue)" },
    ])
  );
  const [a, b] = d.pages[0].elements;
  assert.ok(a.type === "shape" && a.fill === "#ff0000" && a.stroke === "#0000ff");
  assert.ok(b.type === "shape" && b.fill === "#00a1ff", "Polotno's default figure fill");
  assert.equal(warnings.filter((w) => w.includes("warna")).length, 1);
});

test("adapter: (x, y) is the top-left corner for every type — pictures and shapes are copied as they are, text keeps its anchor", () => {
  const children = [
    { id: "t", type: "text", x: 37.5, y: -12.25, width: 321, height: 0, rotation: 12.5, text: "Hai", fontSize: 30, lineHeight: 1.4, fill: "#000" },
    { id: "i", type: "image", x: 640.125, y: 33, width: 211.5, height: 120.75, rotation: -45, src: "https://example.com/a.png", cropX: 0.25, cropY: 0.1, cropWidth: 0.5, cropHeight: 0.6 },
    { id: "r", type: "figure", subType: "rect", x: 1, y: 2, width: 333, height: 44, rotation: 90, fill: "#abc" },
    { id: "c", type: "figure", subType: "circle", x: 400, y: 300, width: 200, height: 80, rotation: 30, fill: "#abc" },
  ];
  const { document: d } = convertPolotnoToKusuka(polotnoBase(children));
  for (const src of children.filter((c) => c.type !== "text")) {
    const el = d.pages[0].elements.find((e) => e.id === src.id)!;
    assert.deepEqual(
      [el.x, el.y, el.width, el.height, el.rotation],
      [src.x, src.y, src.width, src.height, src.rotation],
      `${src.type} ${src.id}`
    );
  }

  // Text: the box is 10px wider (import tolerance), but the text itself must
  // not move. Polotno's default alignment is "center", so the point at the
  // middle of the top edge of the box (turned by the rotation) must be unchanged.
  const t = d.pages[0].elements.find((e) => e.id === "t")! as TextElement;
  assert.equal(t.widthTolerance, 10);
  assert.equal(t.width, 331);
  const middleTop = (x: number, y: number, w: number, deg: number) => {
    const r = (deg * Math.PI) / 180;
    return [x + (w / 2) * Math.cos(r), y + (w / 2) * Math.sin(r)];
  };
  const before = middleTop(37.5, -12.25, 321, 12.5);
  const after = middleTop(t.x, t.y, t.width, t.rotation);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-4 && Math.abs(before[1] - after[1]) < 1e-4, `${before} vs ${after}`);
  assert.equal(t.height, 30 * 1.4, "auto height text gets a real box instead of 0");

  // and back: Polotno gets exactly the box it came with
  const back = convertKusukaToPolotno(d).pages[0].children!;
  for (const src of children) {
    const out = back.find((c) => c.id === src.id)!;
    assert.deepEqual([out.x, out.y, out.width, out.rotation], [src.x, src.y, src.width, src.rotation], `out ${src.id}`);
  }
});

test("adapter: image crop fractions survive both directions; invalid crops fall back to the whole picture", () => {
  const ok = convertPolotnoToKusuka(
    polotnoBase([{ id: "i", type: "image", x: 0, y: 0, width: 10, height: 10, src: "https://e/x.png", cropX: 0.1, cropY: 0.2, cropWidth: 0.5, cropHeight: 0.6 }])
  );
  const img = ok.document.pages[0].elements[0] as ImageElement;
  assert.deepEqual([img.cropX, img.cropY, img.cropWidth, img.cropHeight], [0.1, 0.2, 0.5, 0.6]);
  assert.deepEqual(ok.warnings, []);
  const out = convertKusukaToPolotno(ok.document).pages[0].children![0];
  assert.deepEqual([out.cropX, out.cropY, out.cropWidth, out.cropHeight], [0.1, 0.2, 0.5, 0.6]);
  assert.equal(out.flipX, false);
  assert.equal(out.flipY, false);
  assert.equal(out.cornerRadius, 0);

  // values that cannot be fractions (e.g. pixels) are not guessed at
  const bad = convertPolotnoToKusuka(
    polotnoBase([{ id: "i", type: "image", x: 0, y: 0, width: 10, height: 10, src: "https://e/x.png", cropX: 120, cropY: 0, cropWidth: 640, cropHeight: 480 }])
  );
  const whole = bad.document.pages[0].elements[0] as ImageElement;
  assert.deepEqual([whole.cropX, whole.cropY, whole.cropWidth, whole.cropHeight], [0, 0, 1, 1]);
  assert.match(bad.warnings.join(" "), /crop yang tidak valid/);
});

test("adapter: image edge cases — no src is skipped, blob: is flagged, hidden is dropped", () => {
  const { document: d, warnings } = convertPolotnoToKusuka(
    polotnoBase([
      { id: "a", type: "image", x: 0, y: 0, width: 10, height: 10 },
      { id: "b", type: "image", x: 0, y: 0, width: 10, height: 10, src: "blob:http://localhost/dead" },
      { id: "c", type: "image", x: 0, y: 0, width: 10, height: 10, src: "https://e/x.png", visible: false },
      { id: "d", type: "image", x: 0, y: 0, width: 10, height: 10, src: "data:image/png;base64,AAAA", opacity: 0.5 },
    ])
  );
  assert.deepEqual(d.pages[0].elements.map((e) => e.id), ["b", "d"]);
  const all = warnings.join(" | ");
  assert.match(all, /gambar tanpa sumber/);
  assert.match(all, /blob:/);
  // opacity is supported since v4: copied, not reported
  assert.doesNotMatch(all, /efek/);
  assert.equal(d.pages[0].elements[1].opacity, 0.5);
});

test("adapter: the editor's own image survives Kusuka -> Polotno -> Kusuka exactly", () => {
  const doc: CanvasDocument = onePage({ width: 1200, height: 675, backgroundColor: "#101010" }, [
    { id: "i", type: "image", x: 12.5, y: 40, width: 333.25, height: 187.45, rotation: 17, zIndex: 1, src: "data:image/png;base64,AAAA", cropX: 0.1, cropY: 0, cropWidth: 0.8, cropHeight: 1, scaleX: 1, scaleY: 1 },
  ] as CanvasElement[]);
  const back = convertPolotnoToKusuka(convertKusukaToPolotno(doc));
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.document, doc);
});

run().then((code) => process.exit(code));
