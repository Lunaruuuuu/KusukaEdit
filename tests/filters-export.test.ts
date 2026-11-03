import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E, onePage, mkPage } from "./helpers";
import {
  FILTER_LIMIT,
  FILTER_PRESETS,
  MAX_CORNER_RADIUS,
  resolveFilter,
  resolveImageEffects,
} from "@/lib/imageEffects";
import {
  EFFECT_KEYS,
  FILTER_KEYS,
  IMAGE_STYLE_KEYS,
  applyImageStylePatch,
  clearPatch,
} from "@/lib/imageStyle";
import {
  IDENTITY_MATRIX,
  MAX_FILTER_SIDE,
  applyColorMatrix,
  brightnessMatrix,
  contrastMatrix,
  filterKey,
  filterToMatrix,
  filteredSize,
  multiplyMatrices,
  presetMatrix,
  saturateMatrix,
} from "@/lib/imageFilters";
import { drawPicture, drawPictureHitBox, type PictureContext } from "@/lib/drawPicture";
import { crc32, createZip, dataUrlToBytes } from "@/lib/zipStore";
import {
  pageFileName,
  renderPagesSequentially,
  safeFileBase,
  waitUntil,
} from "@/lib/batchExport";
import {
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  parseDocument,
} from "@/lib/polotnoAdapter";
import { useEditorStore } from "@/store/useEditorStore";
import type { FilterPreset, ImageElement } from "@/types/editor";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const S = () => useEditorStore.getState();

const pic = (over: Partial<ImageElement> = {}): ImageElement => ({
  id: "i1",
  type: "image",
  x: 10,
  y: 20,
  width: 300,
  height: 200,
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
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const px = (r: number, g: number, b: number, a = 255): number[] => [r, g, b, a];
const NEUTRAL = { brightness: 0, contrast: 0, saturation: 0, preset: null } as const;

// ============================================================ colour matrices
test("filters: with nothing set the matrix is the identity and no pixel changes", () => {
  assert.deepEqual(filterToMatrix({ ...NEUTRAL }), [...IDENTITY_MATRIX]);
  const data = px(12, 130, 250, 77);
  applyColorMatrix(data, filterToMatrix({ ...NEUTRAL }));
  assert.deepEqual(data, [12, 130, 250, 77]);
  assert.equal(resolveFilter({}), null, "a slider at 0 builds no filtered copy");
  assert.equal(resolveFilter({ brightness: 0, contrast: 0, saturation: 0 }), null);
});

test("filters: brightness adds to every channel (+/-100 = full range) and clamps to 0..255", () => {
  const up = px(100, 100, 100);
  applyColorMatrix(up, filterToMatrix({ ...NEUTRAL, brightness: 50 }));
  assert.ok(near(up[0], 100 + 0.5 * 255) && near(up[1], up[0]) && near(up[2], up[0]));
  assert.equal(up[3], 255, "alpha is never touched");

  const full = px(100, 100, 100);
  applyColorMatrix(full, filterToMatrix({ ...NEUTRAL, brightness: FILTER_LIMIT }));
  assert.deepEqual(full, [255, 255, 255, 255]);
  const black = px(100, 150, 200);
  applyColorMatrix(black, filterToMatrix({ ...NEUTRAL, brightness: -FILTER_LIMIT }));
  assert.deepEqual(black, [0, 0, 0, 255]);
});

test("filters: contrast stretches around mid-grey; saturation -100 is grey and +100 doubles the colour", () => {
  const mid = px(127.5, 127.5, 127.5);
  applyColorMatrix(mid, filterToMatrix({ ...NEUTRAL, contrast: 80 }));
  assert.ok(near(mid[0], 127.5, 1e-6), "mid-grey stays where it is");
  const c = px(100, 100, 100);
  applyColorMatrix(c, filterToMatrix({ ...NEUTRAL, contrast: 50 })); // factor 1.5
  assert.ok(near(c[0], 1.5 * 100 + 0.5 * (1 - 1.5) * 255, 1e-6), String(c[0])); // 86.25
  const flat = px(60, 200, 90);
  applyColorMatrix(flat, filterToMatrix({ ...NEUTRAL, contrast: -FILTER_LIMIT })); // factor 0
  assert.ok(near(flat[0], 127.5, 1e-6) && near(flat[1], 127.5, 1e-6));

  const grey = px(255, 0, 0);
  applyColorMatrix(grey, filterToMatrix({ ...NEUTRAL, saturation: -FILTER_LIMIT }));
  assert.ok(near(grey[0], 0.213 * 255, 1e-6) && near(grey[1], grey[0]) && near(grey[2], grey[0]));
  const vivid = px(200, 100, 100);
  applyColorMatrix(vivid, filterToMatrix({ ...NEUTRAL, saturation: FILTER_LIMIT })); // s = 2
  assert.ok(vivid[0] > 200 && vivid[1] < 100, "red gets redder, the rest darker");
});

test("filters: a preset is applied first, the sliders on top of it", () => {
  // sepia turns black into black; +20 brightness then lifts it by 51
  const black = px(0, 0, 0);
  applyColorMatrix(black, filterToMatrix({ ...NEUTRAL, preset: "sepia", brightness: 20 }));
  assert.ok(near(black[0], 51, 1e-6) && near(black[1], 51, 1e-6) && near(black[2], 51, 1e-6));
  const white = px(255, 255, 255);
  applyColorMatrix(white, filterToMatrix({ ...NEUTRAL, preset: "sepia" }));
  assert.deepEqual(white.map(Math.round), [255, 255, 239, 255], "sepia keeps white warm: blue 0.937 * 255");
});

test("filters: every preset is a finite 4x5 matrix that really changes colours; grayscale keeps greys", () => {
  assert.equal(FILTER_PRESETS.length, 7);
  for (const preset of FILTER_PRESETS) {
    const m = presetMatrix(preset as FilterPreset);
    assert.equal(m.length, 20, preset);
    assert.ok(m.every(Number.isFinite), preset);
    assert.notDeepEqual(m, [...IDENTITY_MATRIX], `${preset} must not be a no-op`);
    assert.deepEqual(m.slice(15, 20), [0, 0, 0, 1, 0], `${preset} leaves alpha alone`);
  }
  const grey = px(128, 128, 128);
  applyColorMatrix(grey, presetMatrix("grayscale"));
  assert.ok(grey.slice(0, 3).every((v) => near(v, 128, 0.01)));
  const warm = px(100, 100, 100);
  const cool = px(100, 100, 100);
  applyColorMatrix(warm, presetMatrix("warm"));
  applyColorMatrix(cool, presetMatrix("cool"));
  assert.ok(warm[0] > warm[2], "warm: more red than blue");
  assert.ok(cool[2] > cool[0], "cool: more blue than red");
});

test("filters: multiplyMatrices(a, b) is 'b first, then a'", () => {
  const a = contrastMatrix(1.3);
  const b = saturateMatrix(0.4);
  assert.deepEqual(multiplyMatrices(IDENTITY_MATRIX, b), b);
  assert.ok(multiplyMatrices(b, IDENTITY_MATRIX).every((v, i) => near(v, b[i])));
  const input = px(30, 160, 220);
  const stepwise = [...input];
  applyColorMatrix(stepwise, b);
  applyColorMatrix(stepwise, a);
  const combined = [...input];
  applyColorMatrix(combined, multiplyMatrices(a, b));
  combined.forEach((v, i) => assert.ok(near(v, stepwise[i], 1e-6), `channel ${i}`));
  // the brightness offset passes through a following matrix correctly
  const x = px(90, 90, 90);
  const y = [...x];
  applyColorMatrix(x, multiplyMatrices(a, brightnessMatrix(0.2)));
  applyColorMatrix(y, brightnessMatrix(0.2));
  applyColorMatrix(y, a);
  x.forEach((v, i) => assert.ok(near(v, y[i], 1e-6)));
});

test("filters: filterKey is stable and tells different filters apart; the copy is capped in size", () => {
  assert.equal(filterKey(null), "");
  const a = filterKey({ ...NEUTRAL, brightness: 10, preset: "warm" });
  assert.equal(a, filterKey({ ...NEUTRAL, brightness: 10, preset: "warm" }));
  assert.notEqual(a, filterKey({ ...NEUTRAL, brightness: 11, preset: "warm" }));
  assert.notEqual(a, filterKey({ ...NEUTRAL, brightness: 10, preset: "cool" }));
  assert.notEqual(filterKey({ ...NEUTRAL, contrast: 5 }), filterKey({ ...NEUTRAL, saturation: 5 }));

  assert.deepEqual(filteredSize(800, 600), { width: 800, height: 600 });
  const big = filteredSize(5120, 2560);
  assert.deepEqual(big, { width: MAX_FILTER_SIDE, height: MAX_FILTER_SIDE / 2 });
  assert.deepEqual(filteredSize(0, 0), { width: 1, height: 1 });
});

// ================================================== effects (corner radius ...)
test("effects: corner radius and filter are resolved — none under a mask, clamped, neutral = null", () => {
  assert.equal(resolveImageEffects({}).cornerRadius, 0);
  assert.equal(resolveImageEffects({ cornerRadius: 24 }).cornerRadius, 24);
  assert.equal(resolveImageEffects({ cornerRadius: -3 }).cornerRadius, 0);
  assert.equal(resolveImageEffects({ cornerRadius: 1e9 }).cornerRadius, MAX_CORNER_RADIUS);
  assert.equal(resolveImageEffects({ cornerRadius: NaN }).cornerRadius, 0);
  assert.equal(resolveImageEffects({ cornerRadius: 24, maskShape: "circle" }).cornerRadius, 0, "a circle has no corners");
  assert.equal(resolveImageEffects({}).filter, null);
  assert.deepEqual(resolveImageEffects({ brightness: 10, filterPreset: "fade" }).filter, {
    brightness: 10,
    contrast: 0,
    saturation: 0,
    preset: "fade",
  });
  assert.equal(resolveFilter({ brightness: 5000 })?.brightness, FILTER_LIMIT);
  assert.equal(resolveFilter({ filterPreset: "neon" as never }), null, "an unknown preset is ignored");
});

// ===================================================================== style patch
test("imageStyle: a patch sets, clamps and rounds; unusable values are ignored, never stored", () => {
  const base = pic();
  const a = applyImageStylePatch(base, { brightness: 250, contrast: 12.6, saturation: -300, cornerRadius: 33.456 });
  assert.equal(a.brightness, 100);
  assert.equal(a.contrast, 13);
  assert.equal(a.saturation, -100);
  assert.equal(a.cornerRadius, 33.46);
  assert.notEqual(a, base);
  assert.equal(base.brightness, undefined, "the original is not mutated");

  assert.equal(applyImageStylePatch(base, { brightness: NaN }), base, "NaN is ignored");
  assert.equal(applyImageStylePatch(base, { maskShape: "star" as never }), base);
  assert.equal(applyImageStylePatch(base, { filterPreset: "neon" as never }), base);
  assert.equal(applyImageStylePatch(base, { stroke: "not a colour" }), base);
  assert.equal(applyImageStylePatch(base, { blurRadius: Infinity }), base);

  const b = applyImageStylePatch(base, { stroke: "rgb(255, 0, 0)", shadowColor: "#ABCDEF", maskShape: "triangle", filterPreset: "vivid" });
  assert.equal(b.stroke, "#ff0000");
  assert.equal(b.shadowColor, "#abcdef");
  assert.equal(b.maskShape, "triangle");
  assert.equal(b.filterPreset, "vivid");
});

test("imageStyle: the same values give back the SAME element (so no undo step is recorded)", () => {
  const styled = applyImageStylePatch(pic(), { brightness: 20, cornerRadius: 10 });
  assert.equal(applyImageStylePatch(styled, { brightness: 20, cornerRadius: 10 }), styled);
  assert.equal(applyImageStylePatch(styled, { brightness: 20.2 }), styled, "rounds to the value already there");
  assert.equal(applyImageStylePatch(styled, {}), styled);
});

test("imageStyle: undefined removes a field, so an untouched picture stays free of style fields", () => {
  const styled = applyImageStylePatch(pic(), { brightness: 20, contrast: 5, filterPreset: "warm", blurRadius: 4, cornerRadius: 8 });
  const noFilter = applyImageStylePatch(styled, clearPatch(FILTER_KEYS));
  assert.ok(!("brightness" in noFilter) && !("contrast" in noFilter) && !("filterPreset" in noFilter));
  assert.equal(noFilter.blurRadius, 4, "'reset filter' leaves the effects alone");
  const bare = applyImageStylePatch(noFilter, clearPatch(EFFECT_KEYS));
  assert.deepEqual(bare, pic(), "everything cleared = the original picture, field for field");
  assert.equal(applyImageStylePatch(bare, clearPatch(IMAGE_STYLE_KEYS)), bare, "clearing what is not there changes nothing");
  assert.deepEqual([...FILTER_KEYS, ...EFFECT_KEYS].sort(), [...IMAGE_STYLE_KEYS].sort());
});

test("store: setImageStyle — a slider drag is ONE undo step, a no-op records nothing, undo restores", async () => {
  await sleep(600);
  useEditorStore.setState({
    pages: [mkPage("p", { width: 900, height: 600, backgroundColor: "#ffffff" }, [pic()])],
    currentPageIndex: 0,
    selectedId: null,
    selectedIds: [],
    editingId: null,
    croppingId: null,
    clipboard: null,
    past: [],
    future: [],
  });
  for (let v = 1; v <= 30; v++) S().setImageStyle("i1", { brightness: v });
  await sleep(650);
  assert.equal(S().past.length, 1);
  assert.equal((E()[0] as ImageElement).brightness, 30);

  S().setImageStyle("i1", { brightness: 30 }); // same value
  S().setImageStyle("i1", { brightness: NaN }); // unusable
  S().setImageStyle("nope", { brightness: 5 });
  await sleep(650);
  assert.equal(S().past.length, 1, "nothing was recorded");

  S().setImageStyle("i1", clearPatch(FILTER_KEYS));
  await sleep(650);
  assert.equal(S().past.length, 2);
  assert.ok(!("brightness" in E()[0]));
  S().undo();
  assert.equal((E()[0] as ImageElement).brightness, 30);
  S().undo();
  assert.ok(!("brightness" in E()[0]), "back to the untouched picture");
});

test("store: setImageStyle only works on a picture of the ACTIVE page", async () => {
  await sleep(600);
  useEditorStore.setState({
    pages: [mkPage("p1", { width: 900, height: 600, backgroundColor: "#ffffff" }, [pic({ id: "on-1" })]), mkPage("p2", { width: 900, height: 600, backgroundColor: "#ffffff" }, [pic({ id: "on-2" })])],
    currentPageIndex: 1,
    past: [],
    future: [],
  });
  S().setImageStyle("on-1", { brightness: 40 });
  assert.equal((S().pages[0].elements[0] as ImageElement).brightness, undefined);
  S().setImageStyle("on-2", { brightness: 40 });
  assert.equal((S().pages[1].elements[0] as ImageElement).brightness, 40);
  await sleep(600);
});

// ======================================================= drawing rounded corners
interface Call {
  op: string;
  args: unknown[];
}
function recordingContext() {
  const calls: Call[] = [];
  const ctx: Record<string, unknown> = {};
  for (const op of ["beginPath", "rect", "moveTo", "lineTo", "arc", "closePath", "save", "restore", "translate", "scale", "clip", "drawImage", "fillShape", "strokeShape", "fillStrokeShape"]) {
    ctx[op] = (...args: unknown[]) => calls.push({ op, args });
  }
  return { ctx: ctx as unknown as PictureContext, calls };
}
const opsOf = (calls: Call[]) => calls.map((c) => c.op);
const IMG = { tag: "img" };

test("drawPicture: rounded corners clip the picture with four arcs, and the clip comes before the picture", () => {
  const { ctx, calls } = recordingContext();
  drawPicture(ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, cornerRadius: 20 });
  const ops = opsOf(calls);
  assert.equal(ops.filter((o) => o === "arc").length, 4);
  assert.ok(ops.indexOf("clip") !== -1 && ops.indexOf("clip") < ops.indexOf("drawImage"));
  assert.equal(ops.includes("rect"), false, "a rounded outline is not a plain rect");
  const first = calls.find((c) => c.op === "moveTo")!;
  assert.deepEqual(first.args, [20, 0], "starts after the top-left corner");
});

test("drawPicture: the radius never exceeds half of the shorter side; 0 and a mask stay as before", () => {
  const huge = recordingContext();
  drawPicture(huge.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, cornerRadius: 9999 });
  const arcs = huge.calls.filter((c) => c.op === "arc");
  assert.ok(arcs.every((a) => a.args[2] === 50), "capped at 50 (half of 100)");

  const plain = recordingContext();
  drawPicture(plain.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, cornerRadius: 0 });
  assert.deepEqual(opsOf(plain.calls), ["save", "drawImage", "restore"], "no radius = no clip, exactly as before");

  const masked = recordingContext();
  drawPicture(masked.ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, cornerRadius: 30, mask: "triangle" });
  assert.equal(masked.calls.filter((c) => c.op === "arc").length, 0, "the mask wins over the radius");
  assert.ok(masked.calls.some((c) => c.op === "lineTo"));
});

test("drawPicture: a rounded picture casts its shadow outside the outline and gets its border over the picture", () => {
  const { ctx, calls } = recordingContext();
  drawPicture(ctx, "s", { width: 200, height: 100, image: IMG, flipX: false, flipY: false, cornerRadius: 16, shadow: true, stroke: true });
  const clips = calls.filter((c) => c.op === "clip");
  assert.deepEqual(clips.map((c) => c.args[0]), ["evenodd", undefined], "shadow silhouette first, then the picture");
  assert.ok(calls.some((c) => c.op === "fillShape"), "the silhouette is filled to cast the shadow");
  const lastDraw = opsOf(calls).lastIndexOf("drawImage");
  assert.ok(opsOf(calls).lastIndexOf("strokeShape") > lastDraw, "the border is drawn over the picture");
});

test("drawPicture: the hit area follows the rounded outline (and ignores the radius under a mask)", () => {
  const rounded = recordingContext();
  drawPictureHitBox(rounded.ctx, "s", 200, 100, null, 25);
  assert.equal(rounded.calls.filter((c) => c.op === "arc").length, 4);
  assert.equal(rounded.calls[rounded.calls.length - 1].op, "fillShape");
  const masked = recordingContext();
  drawPictureHitBox(masked.ctx, "s", 200, 100, "circle", 25);
  assert.equal(masked.calls.filter((c) => c.op === "arc").length, 1, "the circle's one arc");
});

// ============================================================ Polotno <-> filters
const polotno = (children: unknown[]) => ({
  schemaVersion: 4,
  width: 800,
  height: 600,
  pages: [{ id: "p", children, background: "#ffffff" }],
});
const polotnoPic = (over: Record<string, unknown>) => ({
  id: "i",
  type: "image",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  src: "https://e.com/a.png",
  ...over,
});
const importPic = (over: Record<string, unknown>) => {
  const r = convertPolotnoToKusuka(polotno([polotnoPic(over)]));
  return { el: r.document.pages[0].elements[0] as ImageElement, warnings: r.warnings };
};

test("Polotno: brightness (-1..1) and filters.contrast / filters.saturation (intensity -1..1) become -100..100", () => {
  const a = importPic({ brightnessEnabled: true, brightness: 0.25, filters: { contrast: { intensity: -0.5 }, saturation: { intensity: 0.8 } } });
  assert.deepEqual([a.el.brightness, a.el.contrast, a.el.saturation], [25, -50, 80]);
  assert.deepEqual(a.warnings, []);

  const off = importPic({ brightnessEnabled: false, brightness: 0.9 });
  assert.equal(off.el.brightness, undefined, "a value is only used while Polotno has it switched on");
  const clamped = importPic({ brightnessEnabled: true, brightness: 7, filters: { contrast: { intensity: 9 } } });
  assert.deepEqual([clamped.el.brightness, clamped.el.contrast], [100, 100]);
  const none = importPic({});
  for (const k of ["brightness", "contrast", "saturation", "filterPreset", "cornerRadius"] as const) assert.equal(none.el[k], undefined, k);
});

test("Polotno: grayscale / sepia flags are presets; grayscale wins when both are on, and it is reported", () => {
  assert.equal(importPic({ grayscaleEnabled: true }).el.filterPreset, "grayscale");
  assert.equal(importPic({ sepiaEnabled: true }).el.filterPreset, "sepia");
  const both = importPic({ grayscaleEnabled: true, sepiaEnabled: true });
  assert.equal(both.el.filterPreset, "grayscale");
  assert.match(both.warnings.join(" "), /1 gambar mengaktifkan grayscale dan sepia sekaligus/);
});

test("Polotno: a filter this editor does not have is ignored and reported once; contrast alone is fine", () => {
  const emboss = importPic({ filters: { emboss: { intensity: 0.7 }, contrast: { intensity: 0.2 } } });
  assert.equal(emboss.el.contrast, 20, "what is known is still imported");
  assert.match(emboss.warnings.join(" "), /1 gambar memakai filter \(objek filters\) selain kontras dan saturasi/);
  assert.deepEqual(importPic({ filters: { contrast: { intensity: 0.2 } } }).warnings, []);
  assert.deepEqual(importPic({ filters: { emboss: { intensity: 0 } } }).warnings, [], "an effect at 0 does nothing");
});

test("Polotno: the five presets Polotno has no flag for travel in `custom` and come back", () => {
  for (const preset of ["vivid", "fade", "warm", "cool", "dramatic"] as const) {
    const el = pic({ filterPreset: preset, brightness: -10 });
    const out = convertKusukaToPolotno(onePage({ width: 800, height: 600, backgroundColor: "#ffffff" }, [el]));
    const child = out.pages[0].children![0];
    assert.notEqual(child.grayscaleEnabled, true, preset);
    assert.notEqual(child.sepiaEnabled, true, preset);
    assert.equal((child.custom as { filterPreset?: string }).filterPreset, preset);
    assert.equal(child.brightnessEnabled, true);
    assert.equal(child.brightness, -0.1);
    const back = convertPolotnoToKusuka(out);
    assert.deepEqual(back.warnings, [], preset);
    assert.deepEqual((back.document.pages[0].elements[0] as ImageElement).filterPreset, preset);
  }
});

test("Polotno: filters are written with Polotno's own property names and survive the round trip", () => {
  const el = pic({ filterPreset: "sepia", brightness: 40, contrast: -25, saturation: 60, cornerRadius: 18 });
  const doc = onePage({ width: 800, height: 600, backgroundColor: "#ffffff" }, [el]);
  const child = convertKusukaToPolotno(doc).pages[0].children![0];
  assert.equal(child.sepiaEnabled, true);
  assert.notEqual(child.grayscaleEnabled, true);
  assert.equal(child.brightnessEnabled, true);
  assert.equal(child.brightness, 0.4);
  assert.deepEqual(child.filters, { contrast: { intensity: -0.25 }, saturation: { intensity: 0.6 } });
  assert.equal(child.cornerRadius, 18);
  assert.deepEqual(convertPolotnoToKusuka(convertKusukaToPolotno(doc)).document, doc);

  const plain = convertKusukaToPolotno(onePage({ width: 800, height: 600, backgroundColor: "#ffffff" }, [pic()])).pages[0].children![0];
  // nothing is switched on, so nothing is written: Polotno's own defaults (all off) apply
  for (const k of ["brightnessEnabled", "brightness", "sepiaEnabled", "grayscaleEnabled", "filters"]) {
    assert.equal(k in plain, false, k);
  }
  assert.equal((plain.custom as { filterPreset?: string } | undefined)?.filterPreset, undefined);
  assert.equal(plain.cornerRadius, 0);
});

test("Polotno: a corner radius under a mask is kept in the file even though the mask wins on screen", () => {
  const el = pic({ maskShape: "circle", cornerRadius: 20 });
  const doc = onePage({ width: 800, height: 600, backgroundColor: "#ffffff" }, [el]);
  assert.equal(convertKusukaToPolotno(doc).pages[0].children![0].cornerRadius, 20);
  assert.deepEqual(convertPolotnoToKusuka(convertKusukaToPolotno(doc)).document, doc);
});

test("native files: filter and corner-radius fields are validated on load", () => {
  const load = (over: Record<string, unknown>) => {
    const r = parseDocument({ version: 3, pages: [{ id: "p", canvas: { width: 100, height: 100, backgroundColor: "#ffffff" }, elements: [{ ...pic(), ...over }] }] });
    assert.ok(r.ok);
    return r.ok ? (r.document.pages[0].elements[0] as ImageElement) : pic();
  };
  const good = load({ brightness: 30, contrast: -10, saturation: 5, filterPreset: "cool", cornerRadius: 12 });
  assert.deepEqual([good.brightness, good.contrast, good.saturation, good.filterPreset, good.cornerRadius], [30, -10, 5, "cool", 12]);
  const bad = load({ brightness: "x", contrast: 5000, saturation: NaN, filterPreset: "neon", cornerRadius: -4 });
  assert.equal(bad.brightness, undefined);
  assert.equal(bad.contrast, 100);
  assert.equal(bad.saturation, undefined);
  assert.equal(bad.filterPreset, undefined);
  assert.equal(bad.cornerRadius, undefined);
  assert.equal("brightness" in load({}), false, "an untouched picture gains no fields");
});

// ================================================================== ZIP + CRC
test("zip: crc32 matches the standard check values", () => {
  const enc = new TextEncoder();
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(enc.encode("The quick brown fox jumps over the lazy dog")), 0x414fa339);
});

test("zip: dataUrlToBytes reads base64 and percent-encoded data URLs, and refuses anything else", () => {
  assert.deepEqual([...dataUrlToBytes("data:image/png;base64,iVBORw0K")], [137, 80, 78, 71, 13, 10]);
  assert.deepEqual([...dataUrlToBytes("data:text/plain,a%20b")], [97, 32, 98]);
  assert.deepEqual([...dataUrlToBytes("data:text/plain;base64,")], []);
  assert.throws(() => dataUrlToBytes("https://example.com/x.png"), /data URL/);
  assert.deepEqual([...dataUrlToBytes("data:,")], [], "an empty payload is an empty file");
});

/** A tiny ZIP reader — enough to check what createZip wrote, with no dependency. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = zip.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50, "end-of-central-directory signature");
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralStart = view.getUint32(eocd + 16, true);
  assert.equal(centralStart + centralSize, eocd, "the central directory ends where the EOCD begins");
  const out: { name: string; data: Uint8Array; crc: number; flags: number; method: number }[] = [];
  let pos = centralStart;
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(pos, true), 0x02014b50, "central header signature");
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 24, true);
    assert.equal(view.getUint32(pos + 20, true), size, "stored: compressed size = size");
    const nameLength = view.getUint16(pos + 28, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(zip.subarray(pos + 46, pos + 46 + nameLength));
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, "local header signature");
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    out.push({ name, data: zip.subarray(start, start + size), crc, flags, method });
    pos += 46 + nameLength + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
  return out;
}

test("zip: createZip writes a readable archive — names, bytes, checksums, order", () => {
  const files = [
    { name: "desain-halaman-01.png", data: Uint8Array.from([137, 80, 78, 71, 0, 1, 2, 3]) },
    { name: "desain-halaman-02.png", data: new Uint8Array(5000).map((_, i) => (i * 7) & 0xff) },
    { name: "kosong.txt", data: new Uint8Array(0) },
    { name: "catatan/ünïcode — ✓.txt", data: new TextEncoder().encode("halo") },
  ];
  const zip = createZip(files, new Date(2026, 10, 2, 9, 30, 20));
  const read = readZip(zip);
  assert.deepEqual(read.map((f) => f.name), files.map((f) => f.name));
  read.forEach((f, i) => {
    assert.deepEqual([...f.data], [...files[i].data], f.name);
    assert.equal(f.crc, crc32(files[i].data), `crc of ${f.name}`);
    assert.equal(f.method, 0, "stored, not deflated");
    assert.equal(f.flags & 0x0800, 0x0800, "names are flagged UTF-8");
  });
  assert.equal(zip.length, files.reduce((n, f) => n + 30 + 46 + 2 * new TextEncoder().encode(f.name).length + f.data.length, 22));
});

test("zip: an empty archive is just the end record; too many files throws instead of writing a broken file", () => {
  const empty = createZip([]);
  assert.equal(empty.length, 22);
  assert.deepEqual(readZip(empty), []);
  const many = Array.from({ length: 0x10000 }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(0) }));
  assert.throws(() => createZip(many), /Terlalu banyak berkas/);
});

test("zip: the DOS timestamp is the given time, and years outside 1980..2107 are clamped", () => {
  const view = (zip: Uint8Array) => new DataView(zip.buffer, zip.byteOffset);
  const zip = createZip([{ name: "a", data: new Uint8Array(1) }], new Date(2026, 10, 2, 9, 30, 20));
  const time = view(zip).getUint16(10, true);
  const date = view(zip).getUint16(12, true);
  assert.deepEqual([time >> 11, (time >> 5) & 63, (time & 31) * 2], [9, 30, 20]);
  assert.deepEqual([(date >> 9) + 1980, (date >> 5) & 15, date & 31], [2026, 11, 2]);
  const old = createZip([{ name: "a", data: new Uint8Array(1) }], new Date(1970, 0, 1));
  assert.equal((view(old).getUint16(12, true) >> 9) + 1980, 1980);
});

// ========================================================== batch rendering
test("batch: pages are shown, awaited and rendered in order; progress is reported; the start page is restored", async () => {
  const log: string[] = [];
  const results = await renderPagesSequentially({
    pageCount: 3,
    startIndex: 1,
    showPage: (i) => log.push(`show ${i}`),
    waitUntilDrawn: async (i) => {
      await sleep(2);
      log.push(`drawn ${i}`);
    },
    render: (i) => {
      log.push(`render ${i}`);
      return `png-${i}`;
    },
    onProgress: (done, total) => log.push(`progress ${done}/${total}`),
  });
  assert.deepEqual(results, [
    { index: 0, rendered: "png-0" },
    { index: 1, rendered: "png-1" },
    { index: 2, rendered: "png-2" },
  ]);
  assert.deepEqual(log, [
    "progress 0/3",
    "show 0", "drawn 0", "render 0", "progress 1/3",
    "show 1", "drawn 1", "render 1", "progress 2/3",
    "show 2", "drawn 2", "render 2", "progress 3/3",
    "show 1",
  ]);
});

test("batch: when a page fails the error is rethrown AFTER the editor is back on the start page", async () => {
  const shown: number[] = [];
  await assert.rejects(
    renderPagesSequentially({
      pageCount: 4,
      startIndex: 2,
      showPage: (i) => shown.push(i),
      waitUntilDrawn: async () => {},
      render: (i) => {
        if (i === 1) throw new Error("canvas terlalu besar");
        return i;
      },
    }),
    /canvas terlalu besar/
  );
  assert.deepEqual(shown, [0, 1, 2], "pages 0 and 1 were shown, then the start page (2) again");
  // a page that never draws fails the same way
  const shown2: number[] = [];
  await assert.rejects(
    renderPagesSequentially({
      pageCount: 2,
      startIndex: 0,
      showPage: (i) => shown2.push(i),
      waitUntilDrawn: async (i) => {
        if (i === 0) throw new Error("timeout");
      },
      render: (i) => i,
    }),
    /timeout/
  );
  assert.deepEqual(shown2, [0, 0]);
});

test("batch: file names are numbered with padding and safe inside a ZIP", () => {
  assert.equal(pageFileName("desain", 2, 5, "png"), "desain-halaman-03.png");
  assert.equal(pageFileName("desain", 0, 120, "jpg"), "desain-halaman-001.jpg");
  assert.equal(safeFileBase("Laporan KP: Famous/Allstars?"), "Laporan-KP-Famous-Allstars");
  assert.equal(safeFileBase("   "), "desain");
  assert.equal(safeFileBase("???", "x"), "x");
  assert.equal(safeFileBase("Café Ünïcode"), "Cafe-Unicode");
  assert.ok(safeFileBase("a".repeat(200)).length <= 60);
});

test("batch: waitUntil resolves true as soon as the check passes and false at the timeout", async () => {
  let t = 0;
  let calls = 0;
  const ready = await waitUntil(() => ++calls >= 4, { nextFrame: (cb) => cb(), now: () => t });
  assert.equal(ready, true);
  assert.equal(calls, 4);

  const frames: number[] = [];
  const gaveUp = await waitUntil(() => false, {
    timeoutMs: 100,
    now: () => t,
    nextFrame: (cb) => {
      t += 30;
      frames.push(t);
      cb();
    },
  });
  assert.equal(gaveUp, false);
  assert.ok(frames.length >= 3 && frames.length <= 5, `${frames.length} frames`);

  assert.equal(await waitUntil(() => true, { nextFrame: () => assert.fail("must not wait") }), true);
});

run().then((code) => process.exit(code));
