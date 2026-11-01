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

const HEX = /^#[0-9a-f]{6}$/;
const isColor = (c: string) => HEX.test(c) || c === "transparent";

for (const tpl of TEMPLATES) {
  test(`template ${tpl.id}: loads, colors are #rrggbb, ids and zIndex are unique`, () => {
    const parsed = parseDocument(tpl.data);
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    if (!parsed.ok) return;
    const doc = parsed.document;
    assert.match(doc.canvas.backgroundColor, HEX);
    for (const el of doc.elements) {
      if (el.type === "text") assert.ok(isColor(el.fill), el.id);
      if (el.type === "shape") assert.ok(isColor(el.fill) && isColor(el.stroke), el.id);
    }
    assert.equal(new Set(doc.elements.map((e) => e.zIndex)).size, doc.elements.length);
    assert.equal(new Set(doc.elements.map((e) => e.id)).size, doc.elements.length);
  });

  test(`template ${tpl.id}: native -> Polotno -> native is lossless and Polotno output is stable`, () => {
    const parsed = parseDocument(tpl.data);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const doc = parsed.document;
    const polotno = convertKusukaToPolotno(doc);
    assert.equal(detectFormat(polotno), "polotno");
    const back = parseDocument(JSON.parse(JSON.stringify(polotno)));
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(back.document, doc);
    const again = convertKusukaToPolotno(convertPolotnoToKusuka(polotno).document);
    assert.deepEqual(again, polotno);
  });
}

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
  const withoutTolerance = (doc: typeof b.document) => ({
    ...doc,
    elements: doc.elements.map((el) => {
      if (el.type !== "text" || !el.widthTolerance) return el;
      const { widthTolerance, ...rest } = el;
      const k = el.align === "center" ? 0.5 : el.align === "right" ? 1 : 0;
      return { ...rest, width: el.width - widthTolerance, x: el.x + k * widthTolerance };
    }),
  });
  assert.ok(b.document.elements.some((el) => el.type === "text" && el.widthTolerance === 10));
  assert.deepEqual(a.document, withoutTolerance(b.document));
});

run().then((code) => process.exit(code));
