// v9: Polotno-style file flow (import preview, export choices) and the crop's
// round "zoom the picture" handles.
import assert from "node:assert/strict";
import { test, run } from "./harness";
import { onePage } from "./helpers";
import { cropFrame, scaleCropPicture, MAX_PICTURE_SCALE, type CropTarget } from "@/lib/crop";
import {
  EXPORT_CHOICES,
  exportChoiceInfo,
  isExportChoice,
  jsonFileName,
  jsonFormatOf,
  previewImport,
} from "@/lib/fileFlow";
import { convertKusukaToPolotno } from "@/lib/polotnoAdapter";
import { useEditorStore } from "@/store/useEditorStore";
import type { CanvasElement } from "@/types/editor";

// A 400 x 200 picture, cropped to its middle 200 x 100 (shown at 1:1).
const pic = (over: Partial<CropTarget> = {}): CropTarget => ({
  x: 50,
  y: 60,
  width: 200,
  height: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  cropX: 0.25,
  cropY: 0.25,
  cropWidth: 0.5,
  cropHeight: 0.5,
  ...over,
});

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ============================================================== crop: picture scale
test("crop: dragging a picture corner zooms the picture, keeps its ratio, and never moves the box", () => {
  const el = pic();
  const before = cropFrame(el);
  assert.deepEqual([before.fullWidth, before.fullHeight, before.left, before.top], [400, 200, 100, 50]);
  // drag the bottom-right corner out along the diagonal
  const p = scaleCropPicture(el, "se", { dx: 40, dy: 20 });
  assert.deepEqual([p.x, p.y, p.width, p.height], [50, 60, 200, 100], "the crop window stays");
  const after = cropFrame({ ...el, ...p });
  assert.ok(close(after.fullWidth / after.fullHeight, 2), "aspect ratio kept");
  assert.ok(close(after.fullWidth, 440), "grown by the projected drag");
  // the opposite (top-left) corner of the picture did not move
  assert.ok(close(-after.left, -before.left) && close(-after.top, -before.top));
});

test("crop: the picture can never shrink smaller than the window (it keeps covering it)", () => {
  const el = pic();
  const p = scaleCropPicture(el, "se", { dx: -1000, dy: -1000 });
  const f = cropFrame({ ...el, ...p });
  // anchored at the top-left corner (-100, -50): must still reach the window's right and bottom edges
  assert.ok(f.fullWidth - f.left >= 200 - 1e-6 && f.fullHeight - f.top >= 100 - 1e-6);
  assert.ok(p.cropX >= 0 && p.cropY >= 0 && p.cropX + p.cropWidth <= 1 + 1e-9 && p.cropY + p.cropHeight <= 1 + 1e-9);
  // the same from the top-left corner (anchored bottom-right)
  const q = scaleCropPicture(el, "nw", { dx: 1000, dy: 1000 });
  const g = cropFrame({ ...el, ...q });
  assert.ok(g.left >= -1e-6 && g.top >= -1e-6 && g.left + 200 <= g.fullWidth + 1e-6);
  // and it does not grow without end
  const big = scaleCropPicture(el, "se", { dx: 1e7, dy: 1e7 });
  assert.ok(cropFrame({ ...el, ...big }).fullWidth <= 400 * MAX_PICTURE_SCALE + 1e-6);
});

test("crop: picture scale works on a mirrored picture (fractions stay inside 0..1)", () => {
  const el = pic({ scaleX: -1, cropX: 0.1 });
  const p = scaleCropPicture(el, "ne", { dx: 30, dy: -15 });
  assert.ok(p.cropX >= 0 && p.cropX + p.cropWidth <= 1 + 1e-9);
  assert.ok(close(p.cropWidth / p.cropHeight, el.cropWidth / el.cropHeight), "no stretching");
});

// ============================================================== import preview
test("import preview: detects the format, counts pages, sizes and elements — without touching the store", () => {
  const doc = onePage({ width: 1080, height: 1080, backgroundColor: "#ffffff" }, [
    { id: "r", type: "shape", shapeType: "rect", x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1, fill: "#000000", stroke: "#000000", strokeWidth: 0, cornerRadius: 0 },
  ] as CanvasElement[]);
  const before = useEditorStore.getState().pages;
  const native = previewImport(JSON.stringify(doc), "desain.json");
  assert.ok(native.ok);
  if (!native.ok) return;
  assert.equal(native.format, "kusuka");
  assert.equal(native.pageCount, 1);
  assert.equal(native.elementCount, 1);
  assert.equal(native.sizeLabel, "1080 × 1080 px");
  assert.equal(useEditorStore.getState().pages, before, "nothing is replaced by a preview");

  const polotno = convertKusukaToPolotno({
    ...doc,
    pages: [...doc.pages, { id: "p2", canvas: { width: 500, height: 300, backgroundColor: "#ffffff" }, elements: [] }],
  });
  const p = previewImport(JSON.stringify(polotno), "dari-polotno.json");
  assert.ok(p.ok && p.format === "polotno" && p.pageCount === 2 && p.sizeLabel === "2 ukuran berbeda");
});

test("import preview: a broken file gives the adapter's error, with the file name", () => {
  const bad = previewImport("{ not json", "rusak.json");
  assert.ok(!bad.ok);
  assert.equal(bad.fileName, "rusak.json");
  assert.match(bad.ok ? "" : bad.error, /JSON/);
  const unknown = previewImport(JSON.stringify({ hello: 1 }), "x.json");
  assert.ok(!unknown.ok && /Format tidak dikenali/.test(unknown.error));
});

// ============================================================== export choices
test("export: four choices — two pictures, two JSON formats", () => {
  assert.deepEqual(EXPORT_CHOICES.map((c) => c.id), ["png", "jpeg", "json-kusuka", "json-polotno"]);
  assert.equal(exportChoiceInfo("jpeg").kind, "image");
  assert.equal(exportChoiceInfo("json-polotno").kind, "json");
  assert.equal(jsonFormatOf("json-kusuka"), "kusuka");
  assert.equal(jsonFormatOf("json-polotno"), "polotno");
  assert.equal(jsonFormatOf("png"), null);
  assert.ok(isExportChoice("png") && !isExportChoice("pdf") && !isExportChoice(3));
  assert.equal(jsonFileName("polotno", 42), "polotno-design-42.json");
});

run().then((code) => process.exit(code));
