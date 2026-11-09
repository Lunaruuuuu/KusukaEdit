// v5: Polotno effects on every element without warnings (blur and colour filter
// on text and shapes, dash, text background, curved text), their two-way trip
// to Polotno, the Effects popover's store path (undo / redo), and the pure
// parts of the Google Fonts loader.
import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E, onePage } from "./helpers";
import { useEditorStore } from "@/store/useEditorStore";
import { convertKusukaToPolotno, convertPolotnoToKusuka, parseDocument, type PolotnoDocument } from "@/lib/polotnoAdapter";
import { applyElementStylePatch } from "@/lib/imageStyle";
import {
  backgroundLineBoxes,
  curveArcLength,
  curveLayout,
  curveText,
  dashFromPolotno,
  dashToPolotno,
  isCurved,
  polotnoDashUnit,
  resolveTextBackground,
  sanitizeDash,
} from "@/lib/textEffects";
import { ensureFontLoaded, googleFontsUrl, isSystemFamily, primaryFamily } from "@/lib/fontLoader";
import type { CanvasElement, ShapeElement, TextElement } from "@/types/editor";

const S = () => useEditorStore.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const polotno = (children: Array<Record<string, unknown>>): PolotnoDocument => ({
  schemaVersion: 4,
  width: 1080,
  height: 1080,
  pages: [{ id: "p", children, background: "#ffffff" }],
});

// A Polotno page that uses every effect this release carries over.
const fancyPolotno = () =>
  polotno([
    {
      id: "t", type: "text", x: 100, y: 120, width: 400, height: 60, rotation: 0,
      text: "SALE", fontSize: 40, fontFamily: "Bebas Neue", fill: "#ffffff", align: "center", lineHeight: 1.2,
      backgroundEnabled: true, backgroundColor: "#ff0055", backgroundOpacity: 0.8,
      backgroundCornerRadius: 0.3, backgroundPadding: 0.6,
      shadowEnabled: true, shadowColor: "#000000", shadowBlur: 8, shadowOffsetX: 2, shadowOffsetY: 3, shadowOpacity: 0.5,
      blurEnabled: true, blurRadius: 3, opacity: 0.9,
      custom: { source: "kusukaedit" },
    },
    {
      id: "c", type: "text", x: 100, y: 400, width: 500, height: 80, rotation: 0,
      text: "Melengkung", fontSize: 30, fontFamily: "Roboto", fill: "#111111",
      curveEnabled: true, curvePower: -0.4,
      brightnessEnabled: true, brightness: 0.2, sepiaEnabled: true,
      custom: { source: "kusukaedit" },
    },
    {
      id: "f", type: "figure", subType: "rect", x: 10, y: 10, width: 200, height: 100,
      fill: "#00a1ff", stroke: "#003366", strokeWidth: 4, cornerRadius: 12, dash: [2, 1],
      grayscaleEnabled: true, filters: { contrast: { intensity: 0.5 } },
    },
  ]);

// ============================================================== textEffects (pure)
test("dash: only 1..8 finite, non-negative, not-all-zero entries are a dash", () => {
  assert.deepEqual(sanitizeDash([10, 5]), [10, 5]);
  assert.equal(sanitizeDash([]), null);
  assert.equal(sanitizeDash([0, 0]), null);
  assert.equal(sanitizeDash([10, -1]), null);
  assert.equal(sanitizeDash([10, Number.NaN]), null);
  assert.equal(sanitizeDash("10,5"), null);
  assert.equal(sanitizeDash(new Array(9).fill(1)), null);
  assert.deepEqual(sanitizeDash([5000, 1]), [1000, 1], "clamped");
});

test("dash: Polotno's figure dash is in multiples of min(strokeWidth, w/2, h/2), both ways", () => {
  assert.equal(polotnoDashUnit(4, 200, 100), 4);
  assert.equal(polotnoDashUnit(80, 200, 100), 50);
  assert.deepEqual(dashFromPolotno([2, 1], 4), [8, 4]);
  assert.deepEqual(dashToPolotno([8, 4], 4), [2, 1]);
  assert.deepEqual(dashToPolotno(undefined, 4), []);
  assert.deepEqual(dashToPolotno([8, 4], 0), [], "no stroke: no dash to write");
  assert.equal(dashFromPolotno([2, 1], 0), null);
});

test("text background: padding and radius are fractions of half a line (Polotno), off unless enabled", () => {
  const bg = resolveTextBackground(
    { backgroundEnabled: true, backgroundColor: "#ff0000", backgroundPadding: 0.5, backgroundCornerRadius: 1 },
    40,
    1.2
  );
  assert.ok(bg);
  assert.equal(bg!.padding, 0.5 * 40 * 1.2 * 0.5);
  assert.equal(bg!.cornerRadius, 1 * 40 * 1.2 * 0.5);
  assert.equal(bg!.opacity, 1);
  // Polotno's defaults (0.5 / 0.5, green) when only the switch is on
  const def = resolveTextBackground({ backgroundEnabled: true }, 20, 1);
  assert.equal(def!.color, "#7ED321");
  assert.equal(def!.padding, 5);
  assert.equal(resolveTextBackground({ backgroundColor: "#ff0000" }, 20, 1), null, "switched off");
  assert.equal(resolveTextBackground({ backgroundEnabled: true, backgroundOpacity: 0 }, 20, 1), null, "invisible");
});

test("text background: one box per line, hugging the line and following the alignment", () => {
  const boxes = backgroundLineBoxes({ lineWidths: [100, 40, 0], lineHeightPx: 20, boxWidth: 200, align: "center", padding: 5 });
  assert.equal(boxes.length, 2, "an empty line gets no box");
  assert.deepEqual(boxes[0], { x: 45, y: -5, width: 110, height: 30 });
  assert.deepEqual(boxes[1], { x: 75, y: 15, width: 50, height: 30 });
  const right = backgroundLineBoxes({ lineWidths: [50], lineHeightPx: 10, boxWidth: 200, align: "right", padding: 0 });
  assert.equal(right[0].x, 150);
  // justify: full width except the last line
  const just = backgroundLineBoxes({ lineWidths: [150, 60], lineHeightPx: 10, boxWidth: 200, align: "justify", padding: 0 });
  assert.equal(just[0].width, 200);
  assert.equal(just[1].width, 60);
});

test("curve: the arc holds the whole text (with slack); up arches, down smiles; symmetric around the box centre", () => {
  const up = curveLayout(300, 30, 0.5, 400);
  assert.ok(up.up);
  assert.ok(close(up.radius * up.sweep, curveArcLength(300, 30)), "arc length = text length + slack");
  assert.ok(curveArcLength(300, 30) > 300);
  assert.ok(close(up.height, up.radius * (1 - Math.cos(up.sweep / 2)) + 30));
  const nums = up.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [x1, y1] = nums.slice(0, 2);
  const [x2, y2] = nums.slice(-2);
  assert.ok(close(x1 + x2, 400, 1e-2) && close(y1, y2, 1e-2), "endpoints mirror each other");
  assert.ok(y1 > 15, "the ends are lower than the top of an arch");
  const down = curveLayout(300, 30, -0.5, 400);
  assert.ok(!down.up && /A [\d.]+ [\d.]+ 0 0 0 /.test(down.path), "counter-clockwise along the bottom");
  assert.ok(close(down.height, up.height));
  // more power, rounder; never a closed circle
  assert.ok(curveLayout(300, 30, 1, 400).sweep < 2 * Math.PI);
  assert.ok(curveLayout(300, 30, 0.9, 400).radius < up.radius);
  assert.equal(curveText("Satu\n\n Dua "), "Satu Dua");
  assert.ok(!isCurved({ curveEnabled: true, curvePower: 0 }));
  assert.ok(isCurved({ curveEnabled: true, curvePower: -0.2 }));
  assert.ok(!isCurved({ curvePower: 0.5 }));
});

// ============================================================== adapter
test("Polotno import: background, curve, blur, brightness, sepia, grayscale, contrast and dash load with ZERO warnings", () => {
  const r = convertPolotnoToKusuka(fancyPolotno());
  assert.deepEqual(r.warnings, []);
  const [t, c, f] = r.document.pages[0].elements as [TextElement, TextElement, ShapeElement];
  assert.equal(t.backgroundEnabled, true);
  assert.equal(t.backgroundColor, "#ff0055");
  assert.equal(t.backgroundOpacity, 0.8);
  assert.equal(t.backgroundCornerRadius, 0.3);
  assert.equal(t.backgroundPadding, 0.6);
  assert.equal(t.blurRadius, 3);
  assert.equal(t.shadowBlur, 8);
  assert.equal(c.curveEnabled, true);
  assert.equal(c.curvePower, -0.4);
  assert.equal(c.brightness, 20);
  assert.equal(c.filterPreset, "sepia");
  assert.equal(f.filterPreset, "grayscale");
  assert.equal(f.contrast, 50);
  assert.deepEqual(f.dash, [8, 4], "2,1 x a 4px stroke");
});

test("Polotno export: everything is written with Polotno's own names and comes back unchanged", () => {
  const first = convertPolotnoToKusuka(fancyPolotno()).document;
  const out = convertKusukaToPolotno(first);
  const [t, c, f] = out.pages[0].children as Array<Record<string, unknown>>;
  assert.equal(t.backgroundEnabled, true);
  assert.equal(t.backgroundColor, "#ff0055");
  assert.equal(t.backgroundPadding, 0.6);
  assert.equal(t.blurEnabled, true);
  assert.equal(t.blurRadius, 3);
  assert.equal(c.curveEnabled, true);
  assert.equal(c.curvePower, -0.4);
  assert.equal(c.brightnessEnabled, true);
  assert.equal(c.sepiaEnabled, true);
  assert.equal(f.grayscaleEnabled, true);
  assert.deepEqual(f.dash, [2, 1]);
  assert.deepEqual(f.filters, { contrast: { intensity: 0.5 } });
  const again = convertPolotnoToKusuka(out);
  assert.deepEqual(again.warnings, []);
  assert.deepEqual(again.document, first, "Polotno -> Kusuka -> Polotno -> Kusuka is lossless");
});

test("Polotno: a dash on text or a picture rides in `custom` and survives the round trip", () => {
  const doc = onePage({ width: 500, height: 500, backgroundColor: "#ffffff" }, [
    { id: "t", type: "text", x: 0, y: 0, width: 200, height: 30, rotation: 0, zIndex: 1, text: "Hai", fontSize: 20, fontFamily: "Inter, sans-serif", fill: "#000000", align: "left", fontStyle: "normal", lineHeight: 1.2, stroke: "#ff0000", strokeWidth: 2, dash: [6, 3] },
    { id: "i", type: "image", x: 0, y: 50, width: 100, height: 100, rotation: 0, zIndex: 2, src: "data:image/png;base64,AAAA", cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, scaleX: 1, scaleY: 1, stroke: "#00ff00", strokeWidth: 3, dash: [10, 5] },
  ] as CanvasElement[]);
  const out = convertKusukaToPolotno(doc);
  const [t, i] = out.pages[0].children as Array<Record<string, unknown>>;
  assert.deepEqual((t.custom as Record<string, unknown>).dash, [6, 3]);
  assert.deepEqual((i.custom as Record<string, unknown>).dash, [10, 5]);
  const back = convertPolotnoToKusuka(out);
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.document.pages[0].elements.map((e) => e.dash), [[6, 3], [10, 5]]);
});

test("Polotno: only what is truly unknown is still reported (overline, capitalize, maskSrc)", () => {
  const r = convertPolotnoToKusuka(
    polotno([{ id: "t", type: "text", x: 0, y: 0, width: 100, text: "x", fontSize: 10, textDecoration: "overline" }])
  );
  assert.match(r.warnings.join("|"), /overline/);
  const off = convertPolotnoToKusuka(
    polotno([{ id: "t", type: "text", x: 0, y: 0, width: 100, text: "x", fontSize: 10, backgroundEnabled: false, curveEnabled: false, blurEnabled: false, dash: [] }])
  );
  assert.deepEqual(off.warnings, []);
  const el = off.document.pages[0].elements[0] as TextElement;
  assert.equal(el.backgroundEnabled, undefined, "an effect that is off adds no field");
  assert.equal(el.curveEnabled, undefined);
});

test("native v5 files: background, curve, dash and filters on text/shapes are validated", () => {
  const r = parseDocument({
    version: 5,
    pages: [{
      id: "p",
      canvas: { width: 100, height: 100, backgroundColor: "#ffffff" },
      elements: [
        { id: "t", type: "text", x: 0, y: 0, width: 50, height: 10, rotation: 0, zIndex: 1, text: "a", fontSize: 10, fontFamily: "Inter", fill: "#000000", align: "left", fontStyle: "normal", lineHeight: 1,
          backgroundEnabled: true, backgroundColor: "nope", curveEnabled: true, curvePower: 7, blurRadius: -3, brightness: 500 },
        { id: "s", type: "shape", shapeType: "rect", x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 2, fill: "#000000", stroke: "#000000", strokeWidth: 1, cornerRadius: 0, dash: [4, "x"], saturation: -40 },
      ],
    }],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const [t, s] = r.document.pages[0].elements as [TextElement, ShapeElement];
  assert.equal(t.backgroundEnabled, undefined, "an unreadable colour switches the box off");
  assert.equal(t.curvePower, 1, "clamped to -1..1");
  assert.equal(t.blurRadius, undefined);
  assert.equal(t.brightness, 100);
  assert.equal(s.dash, undefined);
  assert.equal(s.saturation, -40);
});

// ============================================================== store (Effects popover path)
const fresh = async () => {
  S().loadFromJSON(
    onePage({ width: 500, height: 500, backgroundColor: "#ffffff" }, [
      { id: "t", type: "text", x: 0, y: 0, width: 200, height: 30, rotation: 0, zIndex: 1, text: "Hai", fontSize: 20, fontFamily: "Inter, sans-serif", fill: "#000000", align: "left", fontStyle: "normal", lineHeight: 1.2 },
      { id: "r", type: "shape", shapeType: "rect", x: 0, y: 50, width: 100, height: 100, rotation: 0, zIndex: 2, fill: "#ff0000", stroke: "#000000", strokeWidth: 2, cornerRadius: 0 },
    ] as CanvasElement[])
  );
  await sleep(600);
};

test("store: dash, blur and filter on shapes/text go through setElementStyle — one undo step, undone exactly", async () => {
  await fresh();
  const steps = S().past.length;
  S().setElementStyle("r", { dash: [10, 5] });
  S().setElementStyle("r", { blurRadius: 4, filterPreset: "sepia" });
  await sleep(600);
  const r = E().find((e) => e.id === "r")!;
  assert.deepEqual(r.dash, [10, 5]);
  assert.equal(r.blurRadius, 4);
  assert.equal(S().past.length, steps + 1, "one slider gesture = one step");
  // the same dash again changes nothing and records nothing
  S().setElementStyle("r", { dash: [10, 5] });
  await sleep(600);
  assert.equal(S().past.length, steps + 1);
  S().undo();
  const undone = E().find((e) => e.id === "r")!;
  assert.equal(undone.dash, undefined);
  assert.equal(undone.blurRadius, undefined);
  S().redo();
  assert.deepEqual(E().find((e) => e.id === "r")!.dash, [10, 5]);
  // text takes the v5 style keys too; an unusable dash is ignored
  const t = E().find((e) => e.id === "t")!;
  assert.equal(applyElementStylePatch(t, { dash: [-1] }), t);
  assert.equal(applyElementStylePatch(t, { blurRadius: 2 }).blurRadius, 2);
});

test("store: text background and curve are saved, undone and redone", async () => {
  await fresh();
  S().updateElement("t", { backgroundEnabled: true, backgroundColor: "#ffcc00", backgroundPadding: 1 } as Partial<CanvasElement>);
  await sleep(600);
  S().updateElement("t", { curveEnabled: true, curvePower: 0.6 } as Partial<CanvasElement>);
  await sleep(600);
  let t = E().find((e) => e.id === "t") as TextElement;
  assert.equal(t.backgroundColor, "#ffcc00");
  assert.equal(t.curvePower, 0.6);
  S().undo();
  t = E().find((e) => e.id === "t") as TextElement;
  assert.equal(t.curveEnabled, undefined);
  assert.equal(t.backgroundEnabled, true);
  S().undo();
  assert.equal((E().find((e) => e.id === "t") as TextElement).backgroundEnabled, undefined);
  S().redo();
  S().redo();
  t = E().find((e) => e.id === "t") as TextElement;
  assert.ok(t.backgroundEnabled && t.curveEnabled);
  // and it is in the exported JSON (both formats)
  const native = JSON.parse((await S().exportToJSON("kusuka")).json);
  const saved = native.pages[0].elements.find((e: { id: string }) => e.id === "t");
  assert.equal(saved.curvePower, 0.6);
  assert.equal(saved.backgroundColor, "#ffcc00");
  const poly = JSON.parse((await S().exportToJSON("polotno")).json);
  const written = poly.pages[0].children.find((e: { id: string }) => e.id === "t");
  assert.ok(written.backgroundEnabled && written.curveEnabled);
});

// ============================================================== font loader (pure parts)
test("fonts: family names, system fonts and the Google Fonts URL", async () => {
  assert.equal(primaryFamily("'Open Sans', sans-serif"), "Open Sans");
  assert.equal(primaryFamily("Roboto"), "Roboto");
  assert.ok(isSystemFamily("Georgia") && isSystemFamily("sans-serif") && isSystemFamily(""));
  assert.ok(!isSystemFamily("Bebas Neue"));
  assert.equal(
    googleFontsUrl("Bebas Neue"),
    "https://fonts.googleapis.com/css2?family=Bebas+Neue:ital,wght@0,400;0,700;1,400;1,700&display=swap"
  );
  assert.equal(googleFontsUrl("Roboto", false), "https://fonts.googleapis.com/css2?family=Roboto&display=swap");
  // no browser (Node): nothing is loaded, and it says so
  assert.equal(await ensureFontLoaded("Roboto, sans-serif"), false);
});

run().then((code) => process.exit(code));
