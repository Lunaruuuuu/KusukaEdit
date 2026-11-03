import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E, C, onePage, mkPage } from "./helpers";
import {
  CROP_HANDLES,
  MIN_CROP_SIZE,
  cropFrame,
  cropPatchChanges,
  cropToSourcePixels,
  isWholePicture,
  panCrop,
  resetCrop,
  resizeCrop,
  sanitizeCropPatch,
  toLocalDelta,
  type CropHandle,
  type CropTarget,
} from "@/lib/crop";
import {
  clampPointToCanvas,
  clientToDesign,
  hasFileDrag,
  pickDroppedFile,
  topLeftForCentre,
} from "@/lib/dropImage";
import {
  applyImageBlur,
  blurCacheConfig,
  clearImageBlur,
  resolveImageEffects,
  type BlurNode,
} from "@/lib/imageEffects";
import { drawPicture, drawPictureHitBox, type PictureContext } from "@/lib/drawPicture";
import { detectMaskShape, maskToClipSrc } from "@/lib/polotnoEffects";
import { colorAlpha } from "@/lib/color";
import {
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  parseDocument,
} from "@/lib/polotnoAdapter";
import { useEditorStore } from "@/store/useEditorStore";
import type { CanvasDocument, ImageElement } from "@/types/editor";
import sampleEffects from "../examples/sample-effects.polotno.json";

const S = () => useEditorStore.getState();

const img = (over: Partial<ImageElement> = {}): ImageElement => ({
  id: "i1",
  type: "image",
  x: 50,
  y: 60,
  width: 200,
  height: 100,
  rotation: 0,
  zIndex: 1,
  src: "https://example.com/a.png",
  cropX: 0,
  cropY: 0,
  cropWidth: 1,
  cropHeight: 1,
  scaleX: 1,
  scaleY: 1,
  ...over,
});

const near = (a: number, b: number, eps = 1e-3, msg?: string) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg ?? ""} ${a} vs ${b} (±${eps})`);

// ---------------------------------------------------------------------------
// crop: source-pixel conversion
// ---------------------------------------------------------------------------
test("crop: fractions -> natural pixels; nothing to crop (whole / unknown size) -> undefined", () => {
  assert.equal(cropToSourcePixels({ cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }, 800, 600), undefined);
  assert.equal(cropToSourcePixels({ cropX: 0.25, cropY: 0, cropWidth: 0.5, cropHeight: 1 }, 0, 600), undefined);
  assert.equal(cropToSourcePixels({ cropX: 0.25, cropY: 0, cropWidth: 0.5, cropHeight: 1 }, 800, 0), undefined);
  assert.deepEqual(cropToSourcePixels({ cropX: 0.25, cropY: 0.1, cropWidth: 0.5, cropHeight: 0.8 }, 800, 600), {
    x: 200,
    y: 60,
    width: 400,
    height: 480,
  });
  assert.equal(isWholePicture(img()), true);
  assert.equal(isWholePicture(img({ cropWidth: 0.9 })), false);
});

// ---------------------------------------------------------------------------
// crop: handles
// ---------------------------------------------------------------------------
test("crop: dragging the right edge in shrinks the box and the crop, keeps the picture's scale", () => {
  const el = img();
  const p = resizeCrop(el, "e", { dx: -50, dy: 999 });
  assert.deepEqual([p.x, p.y, p.width, p.height], [50, 60, 150, 100], "dy is ignored by an east handle");
  assert.deepEqual([p.cropX, p.cropY, p.cropWidth, p.cropHeight], [0, 0, 0.75, 1]);
  near(p.width / p.cropWidth, 200, 1e-6, "whole picture is still 200 px wide");
});

test("crop: dragging the left edge in moves the box's corner and the crop's start together", () => {
  const p = resizeCrop(img(), "w", { dx: 40, dy: 0 });
  assert.deepEqual([p.x, p.width, p.cropX, p.cropWidth], [90, 160, 0.2, 0.8]);
  const q = resizeCrop(img(), "nw", { dx: 20, dy: 10 });
  assert.deepEqual([q.x, q.y, q.width, q.height], [70, 70, 180, 90]);
  assert.deepEqual([q.cropX, q.cropY, q.cropWidth, q.cropHeight], [0.1, 0.1, 0.9, 0.9]);
});

test("crop: edges stop at the picture's border and keep a minimum window", () => {
  const el = img();
  const out = resizeCrop(el, "se", { dx: 500, dy: 500 });
  assert.deepEqual([out.width, out.height, out.cropWidth, out.cropHeight], [200, 100, 1, 1], "cannot grow past the picture");
  const tiny = resizeCrop(el, "e", { dx: -1000, dy: 0 });
  assert.equal(tiny.width, MIN_CROP_SIZE);
  const tinyW = resizeCrop(el, "w", { dx: 1000, dy: 0 });
  assert.equal(tinyW.width, MIN_CROP_SIZE);
  near(tinyW.x, 50 + 190, 1e-9);
  const left = resizeCrop(img({ cropX: 0.5, cropWidth: 0.5, width: 100, x: 150 }), "w", { dx: -1000, dy: 0 });
  assert.deepEqual([left.cropX, left.cropWidth, left.width, left.x], [0, 1, 200, 50], "grows back to the picture's left edge");
});

test("crop: a rotated picture moves its corner along its OWN axes", () => {
  const el = img({ rotation: 90 });
  // rotated 90deg clockwise: the local x axis points down the screen
  const p = resizeCrop(el, "w", { dx: 40, dy: 0 });
  near(p.x, 50, 1e-9);
  near(p.y, 100, 1e-9);
  assert.equal(p.width, 160);
});

test("crop: a mirrored picture crops the side that is SEEN, i.e. the opposite source side", () => {
  const el = img({ scaleX: -1 });
  // visual left edge in by 40 px -> in the source the RIGHT part is cut away
  const p = resizeCrop(el, "w", { dx: 40, dy: 0 });
  near(p.cropX, 0, 1e-9);
  near(p.cropWidth, 0.8, 1e-9);
  assert.equal(p.x, 90);
  const q = resizeCrop(el, "e", { dx: -40, dy: 0 });
  near(q.cropX, 0.2, 1e-9, "visual right edge in -> the source's LEFT part is cut away");
  near(q.cropWidth, 0.8, 1e-9);
  assert.equal(q.x, 50);
});

test("crop: pan slides the picture under a fixed box (box unchanged, crop clamped)", () => {
  const el = img({ cropX: 0.25, cropWidth: 0.5, width: 100, x: 100 });
  const p = panCrop(el, { dx: -40, dy: 0 }); // picture dragged left -> visible part moves right
  assert.deepEqual([p.x, p.y, p.width, p.height], [100, 60, 100, 100]);
  near(p.cropX, 0.25 + 40 / 200, 1e-9);
  assert.equal(p.cropWidth, 0.5);
  const far = panCrop(el, { dx: -9999, dy: 0 });
  near(far.cropX, 0.5, 1e-9, "stops at the right edge of the picture");
  const farBack = panCrop(el, { dx: 9999, dy: 0 });
  assert.equal(farBack.cropX, 0);
  const whole = panCrop(img(), { dx: 30, dy: 30 });
  assert.deepEqual([whole.cropX, whole.cropY], [0, 0], "a whole picture cannot be slid");
});

test("crop: reset shows the whole picture at its current size, nothing else moves", () => {
  const base = img({ rotation: 30 });
  const first = { ...base, ...resizeCrop(base, "nw", { dx: 30, dy: 20 }) };
  const el = { ...first, ...resizeCrop(first, "se", { dx: -10, dy: -5 }) };
  const r = resetCrop(el);
  assert.deepEqual([r.cropX, r.cropY, r.cropWidth, r.cropHeight], [0, 0, 1, 1]);
  near(r.width, 200, 1e-3);
  near(r.height, 100, 1e-3);
  near(r.x, 50, 1e-3);
  near(r.y, 60, 1e-3);
});

test("crop: a patch that changes nothing is not a change; bad patches are refused", () => {
  const el = img();
  assert.equal(cropPatchChanges(el, resizeCrop(el, "e", { dx: 0, dy: 0 })), false);
  assert.equal(cropPatchChanges(el, resizeCrop(el, "e", { dx: -1, dy: 0 })), true);
  const ok = { x: 1, y: 2, width: 10, height: 10, cropX: 0.2, cropY: 0, cropWidth: 0.5, cropHeight: 1 };
  assert.deepEqual(sanitizeCropPatch(ok), ok);
  assert.equal(sanitizeCropPatch({ ...ok, x: NaN }), null);
  assert.equal(sanitizeCropPatch({ ...ok, width: 0 }), null);
  assert.equal(sanitizeCropPatch({ ...ok, cropWidth: -1 }), null);
  const clipped = sanitizeCropPatch({ ...ok, cropX: 0.8, cropWidth: 0.9 });
  assert.ok(clipped);
  near(clipped.cropWidth, 0.2, 1e-9, "a crop reaching past the picture's edge is cut at the edge");
});

test("crop: pointer movement -> local design pixels (zoom and rotation undone)", () => {
  assert.deepEqual(toLocalDelta(50, 0, 0.5, 0), { dx: 100, dy: 0 });
  const r = toLocalDelta(0, 100, 1, 90); // moving down the screen = along the local +x of a 90deg element
  near(r.dx, 100, 1e-9);
  near(r.dy, 0, 1e-9);
  assert.deepEqual(toLocalDelta(10, 10, 0, 0), { dx: 10, dy: 10 }, "zoom 0 is treated as 1");
});

// The strongest check: wherever the box and the crop end up, every source pixel
// that is still visible is drawn at the SAME place on the canvas, and the whole
// picture keeps its size. Random picture, flip, rotation, handle and distance.
function onCanvas(el: CropTarget, u: number, v: number) {
  const fullW = el.width / el.cropWidth;
  const fullH = el.height / el.cropHeight;
  const a = (u - el.cropX) * fullW;
  const b = (v - el.cropY) * fullH;
  const lx = el.scaleX === -1 ? el.width - a : a;
  const ly = el.scaleY === -1 ? el.height - b : b;
  const rad = (el.rotation * Math.PI) / 180;
  return {
    x: el.x + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: el.y + lx * Math.sin(rad) + ly * Math.cos(rad),
  };
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("crop (property): any sequence of handle drags keeps the picture's scale and the visible pixels in place", () => {
  const rnd = mulberry32(20261031);
  for (let run = 0; run < 400; run++) {
    const cropWidth = 0.3 + rnd() * 0.7;
    const cropHeight = 0.3 + rnd() * 0.7;
    const fullW = 150 + rnd() * 700;
    const fullH = 150 + rnd() * 700;
    const start: ImageElement = img({
      x: rnd() * 500,
      y: rnd() * 500,
      rotation: rnd() < 0.3 ? 0 : rnd() * 360,
      scaleX: rnd() < 0.5 ? -1 : 1,
      scaleY: rnd() < 0.5 ? -1 : 1,
      cropWidth,
      cropHeight,
      cropX: rnd() * (1 - cropWidth),
      cropY: rnd() * (1 - cropHeight),
      width: cropWidth * fullW,
      height: cropHeight * fullH,
    });
    let el = start;
    let lo = [el.cropX, el.cropY];
    let hi = [el.cropX + el.cropWidth, el.cropY + el.cropHeight];
    for (let step = 0; step < 4; step++) {
      const handle = CROP_HANDLES[Math.floor(rnd() * CROP_HANDLES.length)] as CropHandle;
      const patch = resizeCrop(el, handle, { dx: (rnd() - 0.5) * 400, dy: (rnd() - 0.5) * 400 });
      el = { ...el, ...patch };
      lo = [Math.max(lo[0], el.cropX), Math.max(lo[1], el.cropY)];
      hi = [Math.min(hi[0], el.cropX + el.cropWidth), Math.min(hi[1], el.cropY + el.cropHeight)];

      const f = cropFrame(el);
      near(f.fullWidth, fullW, 1e-2, `run ${run}: picture width`);
      near(f.fullHeight, fullH, 1e-2, `run ${run}: picture height`);
      assert.ok(el.cropX >= 0 && el.cropY >= 0, "crop start inside the picture");
      assert.ok(el.cropX + el.cropWidth <= 1 + 1e-9 && el.cropY + el.cropHeight <= 1 + 1e-9, "crop end inside the picture");
      assert.ok(el.width >= Math.min(MIN_CROP_SIZE, start.width) - 1e-6 && el.height >= Math.min(MIN_CROP_SIZE, start.height) - 1e-6);
    }
    if (hi[0] - lo[0] > 1e-3 && hi[1] - lo[1] > 1e-3) {
      const u = (lo[0] + hi[0]) / 2;
      const v = (lo[1] + hi[1]) / 2;
      const before = onCanvas(start, u, v);
      const after = onCanvas(el, u, v);
      near(after.x, before.x, 0.05, `run ${run}: x of a visible pixel`);
      near(after.y, before.y, 0.05, `run ${run}: y of a visible pixel`);
    }
    // and a reset puts every pixel where it was too
    const reset = { ...el, ...resetCrop(el) };
    near(reset.width / reset.cropWidth, fullW, 1e-2);
    const mid = onCanvas(reset, 0.5, 0.5);
    const was = onCanvas(start, 0.5, 0.5);
    near(mid.x, was.x, 0.05);
    near(mid.y, was.y, 0.05);
  }
});

// ---------------------------------------------------------------------------
// drop: what was dragged, where it landed
// ---------------------------------------------------------------------------
test("drop: only drags that carry files are taken", () => {
  assert.equal(hasFileDrag({ types: ["Files"] }), true);
  assert.equal(hasFileDrag({ types: ["text/plain", "Files"] }), true);
  assert.equal(hasFileDrag({ types: ["text/plain", "text/uri-list"] }), false);
  assert.equal(hasFileDrag({ types: [] }), false);
  assert.equal(hasFileDrag(null), false);
  assert.equal(hasFileDrag({}), false);
});

test("drop: files[0] is used; a later picture beats an earlier non-picture; extras are counted", () => {
  const f = (name: string, type: string) => ({ name, type }) as unknown as File;
  const a = f("a.png", "image/png");
  const b = f("b.jpg", "image/jpeg");
  const t = f("n.txt", "text/plain");
  assert.deepEqual(pickDroppedFile([a, b]), { file: a, ignored: 1 });
  assert.deepEqual(pickDroppedFile([t, b]), { file: b, ignored: 1 });
  assert.deepEqual(pickDroppedFile([t]), { file: t, ignored: 0 }, "kept, so the user is told it is not a picture");
  assert.deepEqual(pickDroppedFile([]), { file: null, ignored: 0 });
  assert.deepEqual(pickDroppedFile(null), { file: null, ignored: 0 });
});

test("drop: cursor -> design pixels at any zoom; outside the canvas lands on its nearest point", () => {
  const rect = { left: 300, top: 120 };
  assert.deepEqual(clientToDesign({ x: 400, y: 220 }, rect, 1), { x: 100, y: 100 });
  assert.deepEqual(clientToDesign({ x: 400, y: 220 }, rect, 0.5), { x: 200, y: 200 });
  assert.deepEqual(clientToDesign({ x: 400, y: 220 }, rect, 2), { x: 50, y: 50 });
  assert.deepEqual(clientToDesign({ x: 400, y: 220 }, rect, 0), { x: 100, y: 100 }, "zoom 0 is treated as 1");
  const canvas = { width: 900, height: 600 };
  assert.deepEqual(clampPointToCanvas({ x: -40, y: 20 }, canvas), { x: 0, y: 20 });
  assert.deepEqual(clampPointToCanvas({ x: 1000, y: 700 }, canvas), { x: 900, y: 600 });
  assert.deepEqual(clampPointToCanvas({ x: 450, y: 300 }, canvas), { x: 450, y: 300 });
  assert.deepEqual(topLeftForCentre({ width: 200, height: 100 }, { x: 450, y: 300 }), { x: 350, y: 250 });
});

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------
function hardReset(elements: ImageElement[] = []) {
  useEditorStore.setState({
    pages: [mkPage("page-1", { width: 900, height: 600, backgroundColor: "#ffffff" }, elements)],
    currentPageIndex: 0,
    selectedId: null,
    editingId: null,
    croppingId: null,
    clipboard: null,
    past: [],
    future: [],
  });
}

test("store: a dropped picture is centred on the drop point, selected, on top, ONE undo step", () => {
  hardReset();
  S().addImageElement({ src: "https://example.com/a.png", naturalWidth: 400, naturalHeight: 200 }, { at: { x: 600, y: 150 } });
  const el = E()[0] as ImageElement;
  assert.deepEqual([el.width, el.height], [400, 200]);
  assert.deepEqual([el.x, el.y], [400, 50], "centre (600, 150) minus half the size");
  assert.equal(S().selectedId, el.id);
  assert.equal(S().past.length, 1);
  S().undo();
  assert.equal(E().length, 0);

  // without a drop point it is centred on the canvas as before
  S().addImageElement({ src: "https://example.com/b.png", naturalWidth: 400, naturalHeight: 200 });
  const b = E()[0] as ImageElement;
  assert.deepEqual([b.x, b.y], [250, 200]);
});

test("store: a new picture ends a text edit and a crop in progress", () => {
  hardReset([img()]);
  useEditorStore.setState({ editingId: "t", croppingId: "i1", selectedId: "i1" });
  S().addImageElement({ src: "https://example.com/c.png", naturalWidth: 100, naturalHeight: 100 }, { at: { x: 10, y: 10 } });
  assert.equal(S().editingId, null);
  assert.equal(S().croppingId, null);
});

test("store: setImageCrop writes box + crop as ONE undo step and undo/redo restore them exactly", () => {
  hardReset([img()]);
  const before = E()[0] as ImageElement;
  const patch = resizeCrop(before, "nw", { dx: 40, dy: 20 });
  S().setImageCrop("i1", patch);
  const after = E()[0] as ImageElement;
  assert.deepEqual(
    [after.x, after.y, after.width, after.height, after.cropX, after.cropY, after.cropWidth, after.cropHeight],
    [patch.x, patch.y, patch.width, patch.height, patch.cropX, patch.cropY, patch.cropWidth, patch.cropHeight]
  );
  assert.equal(S().past.length, 1);

  S().setImageCrop("i1", resizeCrop(after, "se", { dx: -30, dy: -10 }));
  assert.equal(S().past.length, 2, "two gestures = two steps");

  S().undo();
  assert.deepEqual(E()[0], after);
  S().undo();
  assert.deepEqual(E()[0], before);
  S().redo();
  assert.deepEqual(E()[0], after);
});

test("store: a crop that changes nothing, is invalid, or targets a non-picture records nothing", () => {
  hardReset([img()]);
  const el = E()[0] as ImageElement;
  S().setImageCrop("i1", resizeCrop(el, "e", { dx: 0, dy: 0 }));
  S().setImageCrop("i1", { x: NaN, y: 0, width: 10, height: 10, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 });
  S().setImageCrop("missing", resizeCrop(el, "e", { dx: -10, dy: 0 }));
  assert.equal(S().past.length, 0);
  assert.deepEqual(E()[0], el);
});

test("store: resetImageCrop is one undo step and a no-op on a whole picture", () => {
  hardReset([img()]);
  S().resetImageCrop("i1");
  assert.equal(S().past.length, 0);
  S().setImageCrop("i1", resizeCrop(E()[0] as ImageElement, "e", { dx: -100, dy: 0 }));
  const cropped = E()[0] as ImageElement;
  S().resetImageCrop("i1");
  const whole = E()[0] as ImageElement;
  assert.deepEqual([whole.cropX, whole.cropY, whole.cropWidth, whole.cropHeight], [0, 0, 1, 1]);
  assert.equal(whole.width, 200);
  assert.equal(S().past.length, 2);
  S().undo();
  assert.deepEqual(E()[0], cropped);
});

test("store: croppingId — only pictures, follows the selection, cleared by every way out", () => {
  const text = { id: "t1", type: "text", x: 0, y: 0, width: 100, height: 20, rotation: 0, zIndex: 2, text: "x", fontSize: 12, fontFamily: "Inter", fill: "#000000", align: "left", fontStyle: "normal", lineHeight: 1.2 } as unknown as ImageElement;
  hardReset([img(), text]);

  S().setCroppingId("t1");
  assert.equal(S().croppingId, null, "text cannot be cropped");
  S().setCroppingId("nope");
  assert.equal(S().croppingId, null);

  S().setCroppingId("i1");
  assert.equal(S().croppingId, "i1");
  assert.equal(S().selectedId, "i1", "cropping selects the picture");
  S().setSelectedId("i1");
  assert.equal(S().croppingId, "i1", "re-selecting the same picture keeps cropping");
  S().setSelectedId("t1");
  assert.equal(S().croppingId, null, "selecting another element ends cropping");

  S().setCroppingId("i1");
  S().setSelectedId(null);
  assert.equal(S().croppingId, null);

  S().setCroppingId("i1");
  S().undo(); // nothing to undo, still must not leave cropping on a changed document
  S().setCroppingId("i1");
  S().removeElement("i1");
  assert.equal(S().croppingId, null);

  hardReset([img()]);
  S().setCroppingId("i1");
  S().reset();
  assert.equal(S().croppingId, null);

  hardReset([img()]);
  S().setCroppingId("i1");
  S().setImageCrop("i1", resizeCrop(E()[0] as ImageElement, "e", { dx: -50, dy: 0 }));
  S().undo();
  assert.equal(S().croppingId, null, "undo");
  S().setCroppingId("i1");
  S().redo();
  assert.equal(S().croppingId, null, "redo");

  S().setCroppingId("i1");
  const r = S().loadFromJSON({ version: 2, canvas: { width: 100, height: 100, backgroundColor: "#ffffff" }, elements: [] });
  assert.equal(r.ok, true);
  assert.equal(S().croppingId, null, "loading a document");
});

// ---------------------------------------------------------------------------
// effects: what is on, and how the blur reaches Konva
// ---------------------------------------------------------------------------
test("effects: only effects that would actually show are switched on", () => {
  assert.deepEqual(resolveImageEffects({}), { blur: 0, stroke: null, shadow: null, mask: null, cornerRadius: 0, filter: null });
  assert.equal(resolveImageEffects({ stroke: "#ff0000", strokeWidth: 0 }).stroke, null, "no thickness, no border");
  assert.equal(resolveImageEffects({ strokeWidth: 4 }).stroke, null, "no colour, no border");
  assert.equal(resolveImageEffects({ stroke: "transparent", strokeWidth: 4 }).stroke, null);
  assert.deepEqual(resolveImageEffects({ stroke: "#ff0000", strokeWidth: 4 }).stroke, { color: "#ff0000", width: 4 });

  assert.equal(resolveImageEffects({ shadowColor: "#000000" }).shadow, null, "no blur and no offset = invisible");
  assert.equal(resolveImageEffects({ shadowColor: "#000000", shadowBlur: 8, shadowOpacity: 0 }).shadow, null);
  assert.deepEqual(resolveImageEffects({ shadowColor: "#112233", shadowOffsetX: 4 }).shadow, {
    color: "#112233",
    blur: 0,
    offsetX: 4,
    offsetY: 0,
    opacity: 1,
  });
  assert.equal(resolveImageEffects({ shadowBlur: 8, shadowOffsetX: 3 }).shadow, null, "no colour, no shadow");

  assert.equal(resolveImageEffects({ blurRadius: 12 }).blur, 12);
  assert.equal(resolveImageEffects({ blurRadius: -5 }).blur, 0);
  assert.equal(resolveImageEffects({ blurRadius: 99999 }).blur, 100, "capped");
  assert.equal(resolveImageEffects({ blurRadius: NaN }).blur, 0);

  assert.equal(resolveImageEffects({ maskShape: "circle" }).mask, "circle");
  assert.equal(resolveImageEffects({ maskShape: "triangle" }).mask, "triangle");
  assert.equal(resolveImageEffects({ maskShape: "star" as never }).mask, null);
});

test("effects: the blur is cached at the resolution it is shown at, and its radius follows", () => {
  const base = { width: 400, height: 300 };
  assert.deepEqual(blurCacheConfig(10, { zoom: 1, deviceRatio: 1, ...base }), { pixelRatio: 1, filterRadius: 10 });
  assert.deepEqual(blurCacheConfig(10, { zoom: 2, deviceRatio: 1, ...base }), { pixelRatio: 2, filterRadius: 20 });
  assert.deepEqual(blurCacheConfig(10, { zoom: 1, deviceRatio: 2, ...base }), { pixelRatio: 2, filterRadius: 20 });
  assert.equal(blurCacheConfig(10, { zoom: 0.3, deviceRatio: 1, ...base }).pixelRatio, 1, "never below 1");
  assert.equal(blurCacheConfig(10, { zoom: 4, deviceRatio: 3, ...base }).pixelRatio, 4, "capped at 4");
  assert.equal(blurCacheConfig(10, { zoom: 1.1, deviceRatio: 1, ...base }).pixelRatio, 1.5, "quantised to halves");
  const huge = blurCacheConfig(10, { zoom: 4, deviceRatio: 2, width: 6000, height: 4000 });
  assert.ok(huge.pixelRatio * 6000 <= 8192 + 1e-6, "the offscreen bitmap stays within canvas limits");
  assert.equal(blurCacheConfig(0.2, { zoom: 1, deviceRatio: 1, ...base }).filterRadius, 1, "at least 1");
});

test("effects: applyImageBlur = cache() -> filters([Blur]) -> blurRadius(), re-cached on every refresh", () => {
  const log: unknown[][] = [];
  let cached = false;
  const node: BlurNode = {
    cache: (c) => (log.push(["cache", c]), (cached = true)),
    clearCache: () => (log.push(["clearCache"]), (cached = false)),
    isCached: () => cached,
    filters: (f) => log.push(["filters", f]),
    blurRadius: (r) => log.push(["blurRadius", r]),
  };
  const BLUR = () => undefined;
  applyImageBlur(node, BLUR, { pixelRatio: 2, filterRadius: 20 });
  assert.deepEqual(log, [["cache", { pixelRatio: 2 }], ["filters", [BLUR]], ["blurRadius", 20]]);

  log.length = 0;
  applyImageBlur(node, BLUR, { pixelRatio: 1, filterRadius: 8 });
  assert.deepEqual(log[0], ["clearCache"], "a stale snapshot is dropped before the new one is taken");
  assert.deepEqual(log.slice(1), [["cache", { pixelRatio: 1 }], ["filters", [BLUR]], ["blurRadius", 8]]);

  log.length = 0;
  clearImageBlur(node);
  assert.deepEqual(log, [["clearCache"], ["filters", []]]);
  log.length = 0;
  clearImageBlur(node);
  assert.deepEqual(log, [], "never blurred (or already cleared): nothing happens");
});

// ---------------------------------------------------------------------------
// drawing: mask, border, shadow
// ---------------------------------------------------------------------------
interface Call {
  op: string;
  args: unknown[];
}
function recorder() {
  const calls: Call[] = [];
  const ctx: Record<string, unknown> = {};
  for (const op of ["beginPath", "rect", "moveTo", "lineTo", "arc", "closePath", "save", "restore", "translate", "scale", "clip", "drawImage", "fillShape", "strokeShape", "fillStrokeShape"]) {
    ctx[op] = (...args: unknown[]) => calls.push({ op, args });
  }
  return { ctx: ctx as unknown as PictureContext, calls };
}
const IMG = { tag: "img" };
const opsOf = (calls: Call[]) => calls.map((c) => c.op);
const idx = (calls: Call[], op: string, from = 0) => calls.findIndex((c, i) => i >= from && c.op === op);

test("drawPicture: a plain loaded picture is drawn without clip, shadow pass or border", () => {
  const { ctx, calls } = recorder();
  drawPicture(ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false });
  assert.deepEqual(opsOf(calls), ["save", "drawImage", "restore"]);
});

test("drawPicture: the border follows the outline and is drawn over the picture, outside its clip", () => {
  const { ctx, calls } = recorder();
  drawPicture(ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, stroke: true });
  assert.deepEqual(opsOf(calls), ["save", "drawImage", "restore", "beginPath", "rect", "closePath", "strokeShape"]);

  const masked = recorder();
  drawPicture(masked.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, stroke: true, mask: "triangle" });
  const lastRestore = masked.calls.map((c) => c.op).lastIndexOf("restore");
  assert.ok(idx(masked.calls, "strokeShape") > lastRestore, "stroke is outside the clip: its outer half is not cut");
  assert.ok(idx(masked.calls, "clip") < idx(masked.calls, "drawImage"));
});

test("drawPicture: circle mask = the ellipse inscribed in the box; triangle = apex at the top centre", () => {
  const c = recorder();
  drawPicture(c.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, mask: "circle" });
  assert.deepEqual(c.calls.find((x) => x.op === "translate")!.args, [100, 50]);
  assert.deepEqual(c.calls.find((x) => x.op === "scale")!.args, [1, 0.5], "squashed to the box");
  assert.deepEqual(c.calls.find((x) => x.op === "arc")!.args, [0, 0, 100, 0, Math.PI * 2, false]);
  assert.ok(idx(c.calls, "arc") < idx(c.calls, "clip") && idx(c.calls, "clip") < idx(c.calls, "drawImage"));

  const t = recorder();
  drawPicture(t.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, mask: "triangle" });
  assert.deepEqual(t.calls.find((x) => x.op === "moveTo")!.args, [100, 0]);
  assert.deepEqual(t.calls.filter((x) => x.op === "lineTo").map((x) => x.args), [[200, 100], [0, 100]]);
});

test("drawPicture: a masked picture's shadow is cast OUTSIDE the mask (even-odd clip), before the picture", () => {
  const { ctx, calls } = recorder();
  drawPicture(ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, mask: "circle", shadow: true });
  const evenodd = calls.findIndex((c) => c.op === "clip" && c.args[0] === "evenodd");
  assert.ok(evenodd >= 0, "a clip that covers everything except the mask");
  const rectCall = calls.find((c) => c.op === "rect");
  assert.ok(rectCall && (rectCall.args[2] as number) > 1000, "the covering rectangle is far larger than the box");
  assert.ok(idx(calls, "fillShape") > evenodd, "the silhouette is filled under that clip");
  assert.ok(idx(calls, "fillShape") < idx(calls, "drawImage"), "and before the picture");

  // no mask: the picture itself casts the shadow, nothing extra is needed
  const plain = recorder();
  drawPicture(plain.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, shadow: true });
  assert.deepEqual(opsOf(plain.calls), ["save", "drawImage", "restore"]);
  // a mask without a shadow needs no silhouette
  const noShadow = recorder();
  drawPicture(noShadow.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, mask: "circle" });
  assert.equal(idx(noShadow.calls, "fillShape"), -1);
});

test("drawPicture: flip and crop still work inside a mask; a loading picture shows only its frame", () => {
  const { ctx, calls } = recorder();
  drawPicture(ctx, "s", {
    width: 200,
    height: 100,
    image: IMG,
    flipX: true,
    flipY: false,
    mask: "circle",
    crop: { x: 10, y: 20, width: 30, height: 60 },
  });
  assert.ok(idx(calls, "clip") < idx(calls, "translate", idx(calls, "clip")), "the mask is not mirrored, the picture inside it is");
  assert.deepEqual(calls.find((c) => c.op === "drawImage")!.args, [IMG, 10, 20, 30, 60, 0, 0, 200, 100]);

  const loading = recorder();
  drawPicture(loading.ctx, "s", { width: 200, height: 100, image: null, flipX: false, flipY: false, mask: "circle", shadow: true, stroke: true });
  assert.deepEqual(opsOf(loading.calls), ["beginPath", "rect", "closePath", "fillStrokeShape"]);
});

test("drawPictureHitBox: clicks land on the mask, not on its transparent corners", () => {
  const box = recorder();
  drawPictureHitBox(box.ctx, "s", 200, 100);
  assert.deepEqual(opsOf(box.calls), ["beginPath", "rect", "closePath", "fillShape"]);
  const tri = recorder();
  drawPictureHitBox(tri.ctx, "s", 200, 100, "triangle");
  assert.deepEqual(opsOf(tri.calls), ["beginPath", "moveTo", "lineTo", "lineTo", "closePath", "fillShape"]);
  const circle = recorder();
  drawPictureHitBox(circle.ctx, "s", 200, 100, "circle");
  assert.ok(opsOf(circle.calls).includes("arc"));
  assert.equal(opsOf(circle.calls).at(-1), "fillShape");
});

// ---------------------------------------------------------------------------
// Polotno adapter: effects and masks
// ---------------------------------------------------------------------------
test("mask detection: SVG data URIs are read, URLs are judged by file name, the rest is NOT guessed", () => {
  const svg = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`)}`;
  assert.equal(detectMaskShape(maskToClipSrc("circle")), "circle", "our own export");
  assert.equal(detectMaskShape(maskToClipSrc("triangle")), "triangle");
  assert.equal(detectMaskShape(svg('<ellipse cx="50" cy="50" rx="50" ry="30"/>')), "circle");
  assert.equal(detectMaskShape(svg('<polygon points="50,0 100,100 0,100"/>')), "triangle");
  assert.equal(detectMaskShape(svg('<polygon points="50 0, 100 100, 0 100, 50 0"/>')), "triangle", "closed by repeating the first point");
  assert.equal(detectMaskShape(svg('<polygon points="0,0 100,0 100,100 0,100"/>')), null, "a square is not a triangle");
  assert.equal(detectMaskShape(svg('<path d="M50 0 L100 100 L0 100 Z"/>')), "triangle");
  assert.equal(detectMaskShape(svg('<path d="m50 0 l50 100 h-100 z"/>')), "triangle", "relative commands");
  assert.equal(detectMaskShape(svg('<path d="M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z"/>')), "circle");
  assert.equal(detectMaskShape(svg('<path d="M50 0 C77 0 100 22 100 50 C100 77 77 100 50 100 C22 100 0 77 0 50 C0 22 22 0 50 0 Z"/>')), "circle");
  assert.equal(detectMaskShape(svg('<path d="M10 10 L90 10 L90 90 L50 95 L10 90 Z"/>')), null, "a pentagon");
  assert.equal(detectMaskShape(svg("<g/>")), null);
  const b64 = "data:image/svg+xml;base64," + Buffer.from('<svg><circle r="5"/></svg>').toString("base64");
  assert.equal(detectMaskShape(b64), "circle");

  assert.equal(detectMaskShape("https://cdn.example.com/masks/Circle.svg?v=2"), "circle");
  assert.equal(detectMaskShape("https://cdn.example.com/masks/triangle-mask.svg#x"), "triangle");
  assert.equal(detectMaskShape("https://cdn.example.com/masks/segitiga.svg"), "triangle");
  assert.equal(detectMaskShape("https://cdn.example.com/masks/star.svg"), null);
  assert.equal(detectMaskShape("https://cdn.example.com/masks/rounded-rect.svg"), null);
  assert.equal(detectMaskShape(""), null);
  assert.equal(detectMaskShape(undefined), null);
  assert.equal(detectMaskShape(42), null);
  assert.equal(detectMaskShape("data:image/png;base64,AAAA"), null);
});

test("color: the alpha of rgba / hsla / #rrggbbaa is read, everything else is opaque", () => {
  assert.equal(colorAlpha("rgba(0, 0, 0, 0.4)"), 0.4);
  assert.equal(colorAlpha("hsla(10, 50%, 50%, .25)"), 0.25);
  assert.equal(colorAlpha("#ff000080").toFixed(2), "0.50");
  assert.equal(colorAlpha("rgb(1, 2, 3)"), 1);
  assert.equal(colorAlpha("#abc"), 1);
  assert.equal(colorAlpha("black"), 1);
  assert.equal(colorAlpha("transparent"), 0);
  assert.equal(colorAlpha(undefined), 1);
  assert.equal(colorAlpha("rgba(0,0,0,7)"), 1, "clamped");
});

const polotno = (children: unknown[]) => ({
  schemaVersion: 4,
  width: 800,
  height: 600,
  pages: [{ id: "p", children, background: "white" }],
});
const picture = (over: Record<string, unknown>) => ({
  id: "p1",
  type: "image",
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  src: "https://example.com/a.png",
  ...over,
});
const convertOne = (over: Record<string, unknown>) => {
  const { document, warnings } = convertPolotnoToKusuka(polotno([picture(over)]));
  return { el: document.pages[0].elements[0] as ImageElement, warnings };
};

test("adapter: blur — only when blurEnabled is true; Polotno's default radius (10) when none is given", () => {
  assert.equal(convertOne({ blurEnabled: true, blurRadius: 7 }).el.blurRadius, 7);
  assert.equal(convertOne({ blurEnabled: true }).el.blurRadius, 10);
  assert.equal(convertOne({ blurEnabled: true, blurRadius: "6" }).el.blurRadius, 6, "numeric strings");
  assert.equal(convertOne({ blurEnabled: true, blurRadius: 0 }).el.blurRadius, undefined);
  assert.equal(convertOne({ blurEnabled: true, blurRadius: 5000 }).el.blurRadius, 100, "capped");
  const off = convertOne({ blurEnabled: false, blurRadius: 10 });
  assert.equal(off.el.blurRadius, undefined, "a default radius in a file where blur is off must not switch it on");
  assert.equal(convertOne({ blurRadius: 10 }).el.blurRadius, undefined);
});

test("adapter: border — borderSize + borderColor become stroke + strokeWidth", () => {
  const a = convertOne({ borderSize: 6, borderColor: "rgba(255, 0, 0, 1)" }).el;
  assert.deepEqual([a.stroke, a.strokeWidth], ["#ff0000", 6]);
  const defaultColor = convertOne({ borderSize: 3 }).el;
  assert.deepEqual([defaultColor.stroke, defaultColor.strokeWidth], ["#000000", 3], "Polotno's border is black by default");
  const none = convertOne({ borderSize: 0, borderColor: "red" }).el;
  assert.equal(none.stroke, undefined);
  assert.equal(none.strokeWidth, undefined);
  assert.equal(convertOne({ borderSize: 4, borderColor: "transparent" }).el.stroke, undefined);
});

test("adapter: shadow — colour, blur, offsets; the colour's alpha and shadowOpacity combine", () => {
  const a = convertOne({
    shadowEnabled: true,
    shadowColor: "rgba(0, 0, 0, 0.5)",
    shadowBlur: 12,
    shadowOffsetX: 3,
    shadowOffsetY: -4,
    shadowOpacity: 0.8,
  }).el;
  assert.deepEqual(
    [a.shadowColor, a.shadowBlur, a.shadowOffsetX, a.shadowOffsetY, a.shadowOpacity],
    ["#000000", 12, 3, -4, 0.4]
  );
  const defaults = convertOne({ shadowEnabled: true }).el;
  assert.deepEqual(
    [defaults.shadowColor, defaults.shadowBlur, defaults.shadowOffsetX, defaults.shadowOffsetY, defaults.shadowOpacity],
    ["#000000", 5, 0, 0, 1],
    "Polotno's own defaults"
  );
  assert.equal(convertOne({ shadowEnabled: false, shadowBlur: 20, shadowOffsetX: 9 }).el.shadowColor, undefined);
  assert.equal(convertOne({ shadowEnabled: true, shadowBlur: 0 }).el.shadowColor, undefined, "invisible: nothing kept");
  assert.equal(convertOne({ shadowEnabled: true, shadowOpacity: 0 }).el.shadowColor, undefined);
  assert.equal(convertOne({ shadowEnabled: true, shadowColor: "transparent", shadowBlur: 5 }).el.shadowColor, undefined);
});

test("adapter: svg elements carry the same effects; supported effects produce NO warning", () => {
  const { document, warnings } = convertPolotnoToKusuka(
    polotno([
      picture({
        type: "svg",
        src: "data:image/svg+xml;base64,AAAA",
        blurEnabled: true,
        blurRadius: 4,
        borderSize: 2,
        borderColor: "#112233",
        shadowEnabled: true,
        shadowBlur: 6,
        shadowOffsetY: 5,
        clipSrc: maskToClipSrc("circle"),
      }),
    ])
  );
  const el = document.pages[0].elements[0] as ImageElement;
  assert.equal(el.vector, true);
  assert.deepEqual([el.blurRadius, el.stroke, el.strokeWidth, el.maskShape], [4, "#112233", 2, "circle"]);
  assert.equal(el.shadowBlur, 6);
  assert.deepEqual(warnings.filter((w) => !/blob/.test(w)), [], "nothing is dropped, so nothing is reported");
});

test("adapter: masks — a circle or triangle clipSrc is kept; any other is reported and ignored", () => {
  assert.equal(convertOne({ clipSrc: maskToClipSrc("triangle") }).el.maskShape, "triangle");
  assert.equal(convertOne({ clipSrc: "https://cdn.example.com/shapes/circle.svg" }).el.maskShape, "circle");

  const star = convertOne({ clipSrc: "https://cdn.example.com/shapes/star.svg" });
  assert.equal(star.el.maskShape, undefined);
  assert.equal(star.warnings.length, 1);
  assert.match(star.warnings[0], /1 gambar memakai mask \(clipSrc\) selain lingkaran atau segitiga/);

  const empty = convertOne({ clipSrc: "" });
  assert.deepEqual(empty.warnings, []);
});

test("adapter: what is still unsupported on a picture is still reported", () => {
  assert.match(convertOne({ maskSrc: "https://x/y.svg" }).warnings.join("|"), /efek yang belum didukung/);
  assert.match(convertOne({ opacity: 0.5 }).warnings.join("|"), /efek yang belum didukung/);
  // a filter this editor has no equivalent for is still reported
  assert.match(
    convertOne({ filters: { emboss: { intensity: 0.5 } } }).warnings.join("|"),
    /efek yang belum didukung|filter/
  );
  // ...whereas corner radius, sepia, grayscale, brightness are supported now: imported, silent
  for (const supported of [{ cornerRadius: 12 }, { sepiaEnabled: true }, { grayscaleEnabled: true }, { brightnessEnabled: true, brightness: 0.2 }]) {
    assert.deepEqual(convertOne(supported).warnings, [], JSON.stringify(supported));
  }
  // blur / shadow on TEXT are not supported (only pictures have them)
  const text = convertPolotnoToKusuka(polotno([{ id: "t", type: "text", x: 0, y: 0, width: 100, text: "Hai", fontSize: 20, blurEnabled: true }]));
  assert.match(text.warnings.join("|"), /efek yang belum didukung/);
  // an unreadable shadow colour is reported like any other unreadable colour
  const bad = convertOne({ shadowEnabled: true, shadowColor: "linear-gradient(red, blue)", shadowBlur: 4 });
  assert.equal(bad.el.shadowColor, "#000000");
  assert.match(bad.warnings.join("|"), /warna/);
});

const fancyPicture = (): ImageElement => ({
  id: "i1",
  type: "image",
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  rotation: 15,
  zIndex: 1,
  src: "https://example.com/a.png",
  cropX: 0.1,
  cropY: 0.2,
  cropWidth: 0.5,
  cropHeight: 0.6,
  scaleX: -1,
  scaleY: 1,
  blurRadius: 6,
  stroke: "#ff8800",
  strokeWidth: 5,
  shadowColor: "#112233",
  shadowBlur: 14,
  shadowOffsetX: 6,
  shadowOffsetY: 8,
  shadowOpacity: 0.55,
  maskShape: "triangle",
});
const fancy = (): CanvasDocument =>
  onePage({ width: 800, height: 600, backgroundColor: "#ffffff" }, [fancyPicture()]);

test("adapter: every effect survives Kusuka -> Polotno -> Kusuka exactly, and is written with Polotno's property names", () => {
  const doc = fancy();
  const polotnoDoc = convertKusukaToPolotno(doc);
  const child = polotnoDoc.pages[0].children![0];
  assert.equal(child.blurEnabled, true);
  assert.equal(child.blurRadius, 6);
  assert.equal(child.borderSize, 5);
  assert.equal(child.borderColor, "#ff8800");
  assert.equal(child.shadowEnabled, true);
  assert.equal(child.shadowColor, "#112233");
  assert.equal(child.shadowBlur, 14);
  assert.equal(child.shadowOffsetX, 6);
  assert.equal(child.shadowOffsetY, 8);
  assert.equal(child.shadowOpacity, 0.55);
  assert.equal(typeof child.clipSrc, "string");
  assert.match(child.clipSrc as string, /^data:image\/svg\+xml/);

  const back = convertPolotnoToKusuka(polotnoDoc);
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.document.pages[0].elements, doc.pages[0].elements);
});

test("adapter: a picture without effects writes no effect properties at all", () => {
  const doc = fancy();
  const plain = { ...(doc.pages[0].elements[0] as ImageElement) };
  for (const k of ["blurRadius", "stroke", "strokeWidth", "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "shadowOpacity", "maskShape"] as const) delete plain[k];
  const child = convertKusukaToPolotno(onePage(doc.pages[0].canvas, [plain])).pages[0].children![0];
  for (const k of ["blurEnabled", "blurRadius", "borderSize", "borderColor", "shadowEnabled", "shadowColor", "clipSrc"]) {
    assert.equal(k in child, false, k);
  }
});

test("native files: effect fields are validated — clamped, or dropped when they cannot be right", () => {
  const raw = (over: Record<string, unknown>) =>
    parseDocument({
      version: 3,
      pages: [{ id: "p", canvas: { width: 100, height: 100, backgroundColor: "#ffffff" }, elements: [{ ...fancyPicture(), ...over }] }],
    });
  const el = (r: ReturnType<typeof raw>) => {
    assert.ok(r.ok);
    return r.document.pages[0].elements[0] as ImageElement;
  };

  const good = el(raw({}));
  assert.deepEqual(good, fancyPicture(), "valid values pass through unchanged");

  assert.equal(el(raw({ blurRadius: -3 })).blurRadius, undefined);
  assert.equal(el(raw({ blurRadius: "9" })).blurRadius, undefined, "not a number");
  assert.equal(el(raw({ blurRadius: 9999 })).blurRadius, 100);
  const noStroke = el(raw({ stroke: "nonsense" }));
  assert.deepEqual([noStroke.stroke, noStroke.strokeWidth], [undefined, undefined], "an unreadable border colour drops the border");
  const noWidth = el(raw({ strokeWidth: 0 }));
  assert.deepEqual([noWidth.stroke, noWidth.strokeWidth], [undefined, undefined]);
  assert.equal(el(raw({ shadowOpacity: 3 })).shadowOpacity, 1);
  assert.equal(el(raw({ shadowBlur: "x" })).shadowBlur, undefined);
  assert.equal(el(raw({ shadowColor: "nonsense" })).shadowColor, undefined);
  assert.equal(el(raw({ shadowColor: "nonsense" })).shadowBlur, undefined, "no shadow without a colour");
  assert.equal(el(raw({ maskShape: "star" })).maskShape, undefined);
  assert.equal(el(raw({ maskShape: 5 })).maskShape, undefined);
  // an old file (no effect fields at all) is untouched
  const old = fancyPicture();
  const bare = { ...old };
  for (const k of ["blurRadius", "stroke", "strokeWidth", "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "shadowOpacity", "maskShape"] as const) delete bare[k];
  const reread = parseDocument({ version: 2, canvas: { width: 100, height: 100, backgroundColor: "#ffffff" }, elements: [bare] });
  assert.ok(reread.ok);
  assert.deepEqual(reread.document.pages[0].elements[0], bare);
});

test("examples/sample-effects.polotno.json: loads with ZERO warnings and every effect is picked up", () => {
  const r = parseDocument(sampleEffects);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.warnings, [], "nothing in the sample is unsupported");
  const pics = r.document.pages[0].elements.filter((e): e is ImageElement => e.type === "image");
  assert.equal(pics.length, 5);
  const [blur, circle, triangle, cropped, all] = pics;

  assert.equal(blur.blurRadius, 6);
  assert.equal(blur.maskShape, undefined);

  assert.equal(circle.maskShape, "circle");
  assert.deepEqual([circle.stroke, circle.strokeWidth], ["#111827", 8]);
  assert.deepEqual(
    [circle.shadowColor, circle.shadowBlur, circle.shadowOffsetX, circle.shadowOffsetY, circle.shadowOpacity],
    ["#000000", 14, 10, 12, 0.45],
    "rgba(0, 0, 0, 0.45) -> colour + opacity"
  );

  assert.equal(triangle.maskShape, "triangle", "a URL is recognised by its file name");
  assert.deepEqual([triangle.stroke, triangle.strokeWidth], ["#ef4444", 6]);

  assert.deepEqual([cropped.cropX, cropped.cropY, cropped.cropWidth, cropped.cropHeight], [0.1, 0.1, 0.8, 0.8]);
  assert.equal(cropped.shadowOpacity, 0.4);

  assert.equal(all.scaleX, -1);
  assert.equal(all.maskShape, "circle");
  assert.equal(all.blurRadius, 2);
  assert.equal(all.shadowOpacity, 0.5);

  // and it survives a round trip through the editor's own Polotno export
  const back = parseDocument(JSON.parse(JSON.stringify(convertKusukaToPolotno(r.document))));
  assert.ok(back.ok);
  if (back.ok) {
    assert.deepEqual(back.warnings, []);
    assert.deepEqual(back.document, r.document);
  }
});

run().then((code) => process.exit(code));
