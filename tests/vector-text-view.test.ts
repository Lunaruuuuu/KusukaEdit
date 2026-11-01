// Polotno text cleaning, SVG/vector pictures, mirroring, text-box tolerance,
// and the view scale (zoom) — everything that needs no browser.
import assert from "node:assert/strict";
import { test, run } from "./harness";
import {
  OWN_EXPORT_SOURCE,
  TEXT_WIDTH_TOLERANCE,
  cleanPolotnoText,
  convertKusukaToPolotno,
  convertPolotnoToKusuka,
  parseDocument,
  sanitizeKusukaDocument,
} from "@/lib/polotnoAdapter";
import { clampZoom, fitZoom, formatZoom, scaledSize, stepZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS } from "@/lib/zoom";
import { exportStageAsImage } from "@/lib/exportImage";
import { drawPicture, drawPictureHitBox, type PictureContext } from "@/lib/drawPicture";
import { useEditorStore } from "@/store/useEditorStore";
import type { CanvasDocument, ImageElement, TextElement } from "@/types/editor";

const polotno = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 4,
  width: 1080,
  height: 1920,
  pages: [{ id: "p", children, background: "#ffffff" }],
  ...extra,
});
const first = (children: unknown[]) => convertPolotnoToKusuka(polotno(children));
const SVG_DATA_URI =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#000000" d="M0 0h10v10z"/></svg>');

// ============================================================ text cleaning
test("text: a paragraph wrapper is removed — no tag reaches the canvas", () => {
  assert.equal(cleanPolotnoText("<p>SALE</p>").text, "SALE");
  assert.equal(cleanPolotnoText('<p style="text-align: center">SALE</p>').text, "SALE");
  assert.equal(cleanPolotnoText("<p>Diskon <span>50%</span></p>").text, "Diskon 50%");
});

test("text: nested tags — inline formatting is dropped, the words stay", () => {
  const r = cleanPolotnoText('<p><span style="color: rgb(255,0,0)"><strong>Mega</strong> <em>SALE</em></span></p>');
  assert.equal(r.text, "Mega SALE");
  assert.equal(r.styled, true, "a coloured/bold run was thrown away: the user is told");
  assert.equal(cleanPolotnoText("<p>H<sub>2</sub>O</p>").text, "H2O");
  assert.equal(cleanPolotnoText('<p><a href="https://x.id/a?b=1&amp;c=2">klik</a></p>').text, "klik");
});

test("text: </p><p> and <br> become a single \\n", () => {
  assert.equal(cleanPolotnoText("<p>Baris 1</p><p>Baris 2</p>").text, "Baris 1\nBaris 2");
  assert.equal(cleanPolotnoText("<p>Baris 1<br>Baris 2</p>").text, "Baris 1\nBaris 2");
  assert.equal(cleanPolotnoText("<p>Baris 1<br/>Baris 2</p>").text, "Baris 1\nBaris 2");
  assert.equal(cleanPolotnoText("<p>Baris 1<br />Baris 2</p>").text, "Baris 1\nBaris 2");
  assert.equal(cleanPolotnoText("<P>A<BR>B</P>").text, "A\nB", "tag names are case-insensitive");
  assert.equal(cleanPolotnoText("A<br>B<br>C").text, "A\nB\nC", "a <br> with no <p> at all");
  assert.equal(cleanPolotnoText("<div>A</div><div>B</div>").text, "A\nB");
});

test("text: blank lines and trailing breaks", () => {
  assert.equal(cleanPolotnoText("<p>A</p><p><br></p><p>B</p>").text, "A\n\nB", "an empty paragraph is a blank line");
  assert.equal(cleanPolotnoText("<p>A<br></p>").text, "A", "a <br> that ends a paragraph shows nothing in HTML");
  assert.equal(cleanPolotnoText("<p>A</p><p></p>").text.endsWith("\n"), false, "no trailing newline noise");
});

test("text: indentation between tags is not text", () => {
  assert.equal(cleanPolotnoText("<p>A</p>\n   <p>B</p>\n").text, "A\nB");
  assert.equal(cleanPolotnoText("\n<p>\n  A\n</p>").text, "A");
});

test("text: HTML entities are decoded once (and only in HTML)", () => {
  assert.equal(cleanPolotnoText("<p>Tom &amp; Jerry &lt;3 &quot;hi&quot; &#169; &#x41;</p>").text, 'Tom & Jerry <3 "hi" © A');
  assert.equal(cleanPolotnoText("<p>&amp;lt;</p>").text, "&lt;", "one pass: not double-decoded");
  assert.equal(cleanPolotnoText("<p>A&nbsp;B</p>").text, "A B");
  assert.equal(cleanPolotnoText("<p>&foo; &#0;</p>").text, "&foo; &#0;", "unknown / invalid entities are left as written");
  assert.equal(cleanPolotnoText("Tom &amp; Jerry").text, "Tom &amp; Jerry", "plain text is what the author typed");
});

test("text: plain text is not mangled — newlines normalised, angle brackets kept", () => {
  assert.equal(cleanPolotnoText("a\r\nb\rc d").text, "a\nb\nc\nd");
  assert.equal(cleanPolotnoText("Halo <nama>").text, "Halo <nama>", "a placeholder is not an HTML tag");
  assert.equal(cleanPolotnoText("a < b && c > d").text, "a < b && c > d");
  assert.equal(cleanPolotnoText("1<2").text, "1<2");
  assert.equal(cleanPolotnoText("SALE").styled, false);
});

test("text: quoted attribute values may contain > ; comments and <style>/<script> bodies vanish", () => {
  assert.equal(cleanPolotnoText('<p><span style="background: url(a>b)">X</span></p>').text, "X");
  assert.equal(cleanPolotnoText("<p>A<!-- note --></p>").text, "A");
  assert.equal(cleanPolotnoText("<style>p{color:red}</style><p>A</p>").text, "A");
});

test("text: structural tags alone are not 'styled'; cleaning is idempotent", () => {
  assert.equal(cleanPolotnoText("<p>A</p><p>B<br>C</p>").styled, false);
  const once = cleanPolotnoText("<p><strong>A</strong></p><p>B &amp; C</p>").text;
  assert.equal(cleanPolotnoText(once).text, once.replace(/&amp;/g, "&amp;"), "plain output passes through unchanged");
});

test("text: a messy rich-text sample leaves no tag behind", () => {
  const messy =
    '<p style="text-align:center"><span style="font-size:48px"><strong>BIG</strong></span><br></p>' +
    "<p><u>SALE</u> 50%&nbsp;OFF</p><p><br></p><p>Syarat &amp; ketentuan</p>";
  const { text } = cleanPolotnoText(messy);
  assert.equal(text, "BIG\nSALE 50% OFF\n\nSyarat & ketentuan");
  assert.doesNotMatch(text, /<\/?(p|span|strong|u|br)\b/i);
});

test("text: the adapter puts the CLEAN string into the element and reports lost formatting once", () => {
  const { document: d, warnings } = first([
    { id: "a", type: "text", x: 0, y: 0, width: 300, text: "<p>Halo</p><p>Dunia</p>", fill: "#000" },
    { id: "b", type: "text", x: 0, y: 0, width: 300, text: "<p><strong>Tebal</strong> biasa</p>", fill: "#000" },
    { id: "c", type: "text", x: 0, y: 0, width: 300, text: "<p><em>Miring</em></p>", fill: "#000" },
  ]);
  assert.deepEqual(d.elements.map((e) => (e as TextElement).text), ["Halo\nDunia", "Tebal biasa", "Miring"]);
  const styled = warnings.filter((w) => w.includes("berformat per bagian"));
  assert.equal(styled.length, 1);
  assert.match(styled[0], /^2 teks/);
});

test("text: structural-only HTML produces no warning; native files are never cleaned", () => {
  const polo = first([{ id: "a", type: "text", x: 0, y: 0, width: 300, text: "<p>A</p><p>B</p>", fill: "#000" }]);
  assert.deepEqual(polo.warnings, []);

  const native = sanitizeKusukaDocument({
    version: 2,
    canvas: { width: 100, height: 100, backgroundColor: "#fff" },
    elements: [{ id: "n", type: "text", x: 0, y: 0, width: 50, height: 20, text: "<p>ketik apa adanya</p>", fontSize: 12 }],
  });
  assert.ok(!("error" in native));
  if (!("error" in native)) assert.equal((native.document.elements[0] as TextElement).text, "<p>ketik apa adanya</p>");
});

// =================================================================== svg
test("svg: a vector element is imported as an image (src kept), flagged vector, with no 'skipped' warning", () => {
  const { document: d, warnings } = first([
    { id: "bolt", type: "svg", x: 100, y: 200, width: 64, height: 96, rotation: 15, src: "https://cdn.example.com/icons/bolt.svg" },
    { id: "arrow", type: "svg", x: 5, y: 6, width: 40, height: 40, src: SVG_DATA_URI },
  ]);
  assert.deepEqual(warnings, []);
  assert.equal(d.elements.length, 2);
  const bolt = d.elements[0] as ImageElement;
  assert.equal(bolt.type, "image");
  assert.equal(bolt.vector, true);
  assert.equal(bolt.src, "https://cdn.example.com/icons/bolt.svg");
  assert.deepEqual([bolt.x, bolt.y, bolt.width, bolt.height, bolt.rotation], [100, 200, 64, 96, 15]);
  assert.deepEqual([bolt.cropX, bolt.cropY, bolt.cropWidth, bolt.cropHeight, bolt.scaleX, bolt.scaleY], [0, 0, 1, 1, 1, 1]);
  assert.equal((d.elements[1] as ImageElement).src, SVG_DATA_URI, "a data URI is passed through untouched");
});

test("svg: written back as `svg`; an ordinary image stays `image`", () => {
  const { document: d } = first([
    { id: "v", type: "svg", x: 0, y: 0, width: 10, height: 10, src: SVG_DATA_URI },
    { id: "p", type: "image", x: 0, y: 0, width: 10, height: 10, src: "https://e.com/a.svg" },
  ]);
  const out = convertKusukaToPolotno(d).pages[0].children!;
  assert.equal(out[0].type, "svg");
  assert.equal(out[1].type, "image", "the type is remembered, not guessed from the file name");
  const again = convertPolotnoToKusuka(convertKusukaToPolotno(d));
  assert.deepEqual(again.document, d);
});

test("svg: without a source it is skipped and reported; crop and mask are handled like for images", () => {
  const { document: d, warnings } = first([
    { id: "x", type: "svg", x: 0, y: 0, width: 10, height: 10 },
    { id: "y", type: "svg", x: 0, y: 0, width: 10, height: 10, src: SVG_DATA_URI, cropX: 0.1, cropY: 0.1, cropWidth: 0.5, cropHeight: 0.5, maskSrc: "https://e.com/m.svg" },
  ]);
  assert.deepEqual(d.elements.map((e) => e.id), ["y"]);
  assert.ok(warnings.some((w) => /SVG tanpa sumber/.test(w)));
  const y = d.elements[0] as ImageElement;
  assert.deepEqual([y.cropX, y.cropY, y.cropWidth, y.cropHeight], [0.1, 0.1, 0.5, 0.5]);
  assert.ok(warnings.some((w) => /efek yang belum didukung/.test(w)), "a mask is not supported: reported");
});

test("svg: colorsReplace is applied to a data-URI SVG, only reported for a link", () => {
  const recolour = first([
    { id: "v", type: "svg", x: 0, y: 0, width: 10, height: 10, src: SVG_DATA_URI, colorsReplace: { "#000000": "#ff0000" } },
  ]);
  const src = (recolour.document.elements[0] as ImageElement).src;
  assert.notEqual(src, SVG_DATA_URI);
  const svg = decodeURIComponent(src.slice(src.indexOf(",") + 1));
  assert.match(svg, /fill="#ff0000"/);
  assert.doesNotMatch(svg, /#000000/);
  assert.deepEqual(recolour.warnings, []);

  const link = first([
    { id: "v", type: "svg", x: 0, y: 0, width: 10, height: 10, src: "https://e.com/i.svg", colorsReplace: { "#000": "#f00" } },
  ]);
  assert.equal((link.document.elements[0] as ImageElement).src, "https://e.com/i.svg");
  assert.ok(link.warnings.some((w) => /colorsReplace/.test(w)));

  // base64 data URI
  const b64 = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#fff"/></svg>').toString("base64");
  const r = first([{ id: "v", type: "svg", x: 0, y: 0, width: 10, height: 10, src: b64, colorsReplace: { "#ffffff": "#00ff00", "#fff": "#0000ff" } }]);
  const out = (r.document.elements[0] as ImageElement).src;
  assert.match(decodeURIComponent(out), /fill="#0000ff"/, "'#fff' is matched on its own, not as the start of '#ffffff'");
});

// ================================================================= mirror
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
/** The four corners of the visible box of a node at (x, y), scaled by (sx, sy), turned by `deg` around (x, y). */
function corners(x: number, y: number, w: number, h: number, deg: number, sx: number, sy: number) {
  const r = (deg * Math.PI) / 180;
  const out: string[] = [];
  for (const u of [0, 1]) {
    for (const v of [0, 1]) {
      const lx = sx * w * u;
      const ly = sy * h * v;
      out.push(`${round4(x + lx * Math.cos(r) - ly * Math.sin(r))},${round4(y + lx * Math.sin(r) + ly * Math.cos(r))}`);
    }
  }
  return out.sort();
}

test("mirror: flipX / flipY become scaleX / scaleY = -1, and the box does not move", () => {
  const { document: d } = first([
    { id: "a", type: "image", x: 120, y: 80, width: 200, height: 100, rotation: 30, src: "https://e/a.png", flipX: true },
    { id: "b", type: "image", x: 120, y: 80, width: 200, height: 100, rotation: 30, src: "https://e/a.png", flipY: true },
    { id: "c", type: "svg", x: 120, y: 80, width: 200, height: 100, rotation: 30, src: SVG_DATA_URI, flipX: true, flipY: true },
    { id: "d", type: "image", x: 120, y: 80, width: 200, height: 100, rotation: 30, src: "https://e/a.png" },
  ]);
  const flips = d.elements.map((e) => [(e as ImageElement).scaleX, (e as ImageElement).scaleY]);
  assert.deepEqual(flips, [[-1, 1], [1, -1], [-1, -1], [1, 1]]);
  for (const e of d.elements) assert.deepEqual([e.x, e.y, e.width, e.height, e.rotation], [120, 80, 200, 100, 30]);
});

test("mirror: negative scaleX / scaleY — (x, y) moves to the top-left of what is visible (property test, with rotation)", () => {
  const rotations = [0, 90, 30, -45, 180, 270.5];
  const scales: [number, number][] = [[-1, 1], [1, -1], [-1, -1], [-2, 1], [1, -0.5], [-1.5, -2]];
  let checked = 0;
  for (const rot of rotations) {
    for (const [sx, sy] of scales) {
      const src = { id: "m", type: "image", x: 500, y: 300, width: 120, height: 80, rotation: rot, scaleX: sx, scaleY: sy, src: "https://e/a.png" };
      const el = first([src]).document.elements[0] as ImageElement;
      assert.deepEqual(
        corners(el.x, el.y, el.width, el.height, el.rotation, 1, 1),
        corners(src.x, src.y, src.width, src.height, src.rotation, sx, sy),
        `rotation ${rot}, scale ${sx}/${sy}`
      );
      assert.equal(el.scaleX, sx < 0 ? -1 : 1);
      assert.equal(el.scaleY, sy < 0 ? -1 : 1);
      assert.equal(round4(el.width), round4(120 * Math.abs(sx)), "|scale| resizes the box");
      assert.equal(round4(el.height), round4(80 * Math.abs(sy)));
      checked++;
    }
  }
  assert.equal(checked, 36);
  // the plain case, by hand
  const one = first([{ id: "m", type: "image", x: 500, y: 300, width: 100, height: 50, scaleX: -1, src: "https://e/a.png" }]).document.elements[0];
  assert.deepEqual([one.x, one.y, one.width], [400, 300, 100]);
});

test("mirror: the flip flag and a negative scale on the same axis cancel; a zero scale is ignored", () => {
  const cancel = first([{ id: "m", type: "image", x: 500, y: 300, width: 100, height: 50, scaleX: -1, flipX: true, src: "https://e/a.png" }]).document.elements[0] as ImageElement;
  assert.equal(cancel.scaleX, 1);
  assert.equal(cancel.x, 400, "...but the origin shift of the negative scale still applies");
  const zero = first([{ id: "m", type: "image", x: 5, y: 6, width: 100, height: 50, scaleX: 0, scaleY: 0, src: "https://e/a.png" }]).document.elements[0] as ImageElement;
  assert.deepEqual([zero.x, zero.y, zero.width, zero.height, zero.scaleX, zero.scaleY], [5, 6, 100, 50, 1, 1]);
});

test("mirror: text can't be mirrored (warned); a mirrored rectangle looks the same (silent)", () => {
  const { document: d, warnings } = first([
    { id: "t", type: "text", x: 10, y: 10, width: 200, text: "Hai", fill: "#000", flipX: true },
    { id: "u", type: "text", x: 10, y: 10, width: 200, text: "Hai", fill: "#000", scaleY: -1 },
    { id: "r", type: "figure", subType: "rect", x: 10, y: 10, width: 200, height: 40, flipX: true, fill: "#abc" },
  ]);
  assert.equal(warnings.filter((w) => /skala atau pencerminan/.test(w)).length, 1);
  assert.match(warnings.find((w) => /skala atau pencerminan/.test(w))!, /^2 teks/);
  assert.deepEqual([d.elements[2].x, d.elements[2].y, d.elements[2].width, d.elements[2].height], [10, 10, 200, 40]);
});

test("mirror: survives native -> Polotno -> native, and a native file; garbage scale values are not trusted", () => {
  const doc: CanvasDocument = {
    version: 2,
    canvas: { width: 400, height: 300, backgroundColor: "#ffffff" },
    elements: [
      { id: "a", type: "image", x: 10, y: 20, width: 100, height: 50, rotation: 7, zIndex: 1, src: "https://e/a.png", cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, scaleX: -1, scaleY: 1 },
      { id: "b", type: "image", x: 10, y: 20, width: 100, height: 50, rotation: 0, zIndex: 2, src: SVG_DATA_URI, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, scaleX: 1, scaleY: -1, vector: true },
    ],
  };
  const out = convertKusukaToPolotno(doc).pages[0].children!;
  assert.deepEqual([out[0].flipX, out[0].flipY, out[1].flipX, out[1].flipY], [true, false, false, true]);
  assert.deepEqual(convertPolotnoToKusuka(convertKusukaToPolotno(doc)).document, doc);

  const parsed = parseDocument(JSON.stringify(doc));
  assert.ok(parsed.ok);
  if (parsed.ok) assert.deepEqual(parsed.document, doc);

  const bad = sanitizeKusukaDocument({
    version: 2,
    canvas: { width: 10, height: 10, backgroundColor: "#fff" },
    elements: [{ id: "z", type: "image", src: "https://e/a.png", x: 0, y: 0, width: 5, height: 5, scaleX: 0.5, scaleY: "-1", vector: "yes" }],
  });
  assert.ok(!("error" in bad));
  if (!("error" in bad)) {
    const el = bad.document.elements[0] as ImageElement;
    assert.deepEqual([el.scaleX, el.scaleY, el.vector], [1, 1, undefined]);
  }
});

// ========================================================== text tolerance
test("tolerance: +10px of width, x moved back by the part that matches the alignment", () => {
  const mk = (align: string, rotation = 0) =>
    first([{ id: "t", type: "text", x: 100, y: 50, width: 200, rotation, text: "SALE", fill: "#000", align }]).document.elements[0] as TextElement;
  const left = mk("left");
  const center = mk("center");
  const right = mk("right");
  assert.equal(TEXT_WIDTH_TOLERANCE, 10);
  assert.deepEqual([left.x, left.width, left.widthTolerance], [100, 210, 10]);
  assert.deepEqual([center.x, center.width, center.widthTolerance], [95, 210, 10]);
  assert.deepEqual([right.x, right.width, right.widthTolerance], [90, 210, 10]);
  // turned 90 degrees clockwise, the box's x axis points down the screen
  const turned = mk("center", 90);
  assert.deepEqual([round4(turned.x), round4(turned.y), turned.width], [100, 45, 210]);
});

test("tolerance: exporting to Polotno takes it back out — the file round-trips exactly", () => {
  const children = [
    { id: "t", type: "text", x: 100.5, y: 50.25, width: 222, rotation: 33, text: "SALE", fill: "#000000", align: "right", fontSize: 40 },
    { id: "u", type: "text", x: 7, y: 9, width: 80, rotation: 0, text: "x", fill: "#000000", align: "center", fontSize: 12 },
  ];
  const imported = first(children).document;
  const back = convertKusukaToPolotno(imported).pages[0].children!;
  for (const src of children) {
    const o = back.find((c) => c.id === src.id)!;
    assert.deepEqual([round4(o.x as number), round4(o.y as number), o.width, o.rotation], [round4(src.x), round4(src.y), src.width, src.rotation], src.id);
    assert.equal((o.custom as { source?: string } | undefined)?.source, undefined, "a padded box is not marked as ours");
  }
  // and the padding is not added a second time after a full cycle
  assert.deepEqual(convertPolotnoToKusuka(convertKusukaToPolotno(imported)).document, imported);
});

test("tolerance: a width measured in this editor (no tolerance) is marked and never padded again", () => {
  const exact: CanvasDocument = {
    version: 2,
    canvas: { width: 300, height: 200, backgroundColor: "#ffffff" },
    elements: [{ id: "t", type: "text", x: 10, y: 10, width: 180, height: 30, rotation: 0, zIndex: 1, text: "Hai", fontSize: 20, fontFamily: "Inter, sans-serif", fill: "#000000", align: "left", fontStyle: "normal", lineHeight: 1.2 }],
  };
  const polo = convertKusukaToPolotno(exact);
  assert.equal((polo.pages[0].children![0].custom as { source: string }).source, OWN_EXPORT_SOURCE);
  const again = convertPolotnoToKusuka(polo).document;
  assert.deepEqual(again, exact);
  assert.equal((again.elements[0] as TextElement).width, 180);
});

test("tolerance: an empty-width box gets none; a native file's value is kept but bounded", () => {
  const zero = first([{ id: "t", type: "text", x: 0, y: 0, width: 0, text: "x", fill: "#000" }]).document.elements[0] as TextElement;
  assert.equal(zero.widthTolerance, undefined);
  const native = sanitizeKusukaDocument({
    version: 2,
    canvas: { width: 10, height: 10, backgroundColor: "#fff" },
    elements: [{ id: "t", type: "text", x: 0, y: 0, width: 50, text: "x", widthTolerance: 99999 }],
  });
  assert.ok(!("error" in native));
  if (!("error" in native)) assert.equal((native.document.elements[0] as TextElement).widthTolerance, 100);
});

// ==================================================================== zoom
test("zoom: fitZoom shrinks a poster to the free area, never enlarges, never overflows", () => {
  assert.equal(fitZoom(1080, 1920, 700, 600), 0.3125);
  assert.equal(fitZoom(600, 400, 1000, 800), 1, "a small canvas is shown at its real size");
  assert.equal(fitZoom(1000, 1000, 1000, 1000), 1);
  assert.equal(fitZoom(1080, 1080, 540, 2000), 0.5);
  for (const bad of [0, -5, NaN, Infinity]) assert.equal(fitZoom(1080, 1920, bad, 600), 1, `unknown width ${bad}`);
  assert.equal(fitZoom(0, 100, 500, 500), 1);
  assert.equal(fitZoom(4000, 4000, 100, 100), ZOOM_MIN, "the zoom floor (5%) wins over fitting");

  // property: the scaled canvas always fits the (whole-pixel) area
  let seed = 7;
  const rnd = (max: number) => ((seed = (seed * 16807) % 2147483647) % max) + 1;
  for (let i = 0; i < 500; i++) {
    const cw = 50 + rnd(3950), ch = 50 + rnd(3950), aw = 100 + rnd(1800), ah = 100 + rnd(1200);
    const z = fitZoom(cw, ch, aw, ah);
    assert.ok(z >= ZOOM_MIN && z <= 1);
    // Below ZOOM_MIN (5%) the zoom stops, so a 4000 px canvas in an area under
    // 200 px wide cannot be fitted: that is the one case allowed to overflow.
    if (aw < cw * ZOOM_MIN || ah < ch * ZOOM_MIN) {
      assert.equal(z, ZOOM_MIN);
      continue;
    }
    const size = scaledSize(cw, ch, z);
    assert.ok(size.width <= aw && size.height <= ah, `${cw}x${ch} in ${aw}x${ah} -> ${size.width}x${size.height}`);
  }
});

test("zoom: stepZoom walks the presets from any value, and stops at the ends", () => {
  assert.deepEqual([...ZOOM_STEPS].sort((a, b) => a - b), [...ZOOM_STEPS], "presets ascend");
  assert.equal(stepZoom(0.3125, 1), 0.33);
  assert.equal(stepZoom(0.3125, -1), 0.25);
  assert.equal(stepZoom(1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(0.5, 1), 0.67, "a preset steps to the NEXT preset, not to itself");
  assert.equal(stepZoom(ZOOM_MAX, 1), ZOOM_MAX);
  assert.equal(stepZoom(ZOOM_MIN, -1), ZOOM_MIN);
  assert.equal(stepZoom(10, -1), ZOOM_MAX, "above the range it comes back to the top preset");
});

test("zoom: clamp, size and label", () => {
  assert.equal(clampZoom(0), ZOOM_MIN);
  assert.equal(clampZoom(99), ZOOM_MAX);
  assert.equal(clampZoom(NaN), 1);
  assert.deepEqual(scaledSize(1080, 1920, 0.3125), { width: 338, height: 600 });
  assert.deepEqual(scaledSize(10, 10, 0.05), { width: 1, height: 1 }, "never 0 px");
  assert.equal(formatZoom(0.3125), "31%");
  assert.equal(formatZoom(1), "100%");
});

test("zoom: loadRevision counts loaded documents (a successful load only) and is not part of undo", () => {
  const S = () => useEditorStore.getState();
  const start = S().loadRevision;
  assert.equal(typeof start, "number");
  const doc = { version: 2, canvas: { width: 800, height: 800, backgroundColor: "#ffffff" }, elements: [] };
  assert.ok(S().loadFromJSON(JSON.stringify(doc)).ok);
  assert.equal(S().loadRevision, start + 1);
  assert.equal(S().loadFromJSON("{ not json").ok, false);
  assert.equal(S().loadFromJSON({ nothing: true }).ok, false);
  assert.equal(S().loadRevision, start + 1, "a failed load is not a new document");
  assert.ok(S().loadFromJSON(JSON.stringify(doc)).ok);
  assert.equal(S().loadRevision, start + 2, "the same size again still counts");
  S().undo();
  assert.equal(S().loadRevision, start + 2, "undo restores the design, not the view signal");
  assert.ok(S().loadFromJSON(polotno([])).ok, "a Polotno file counts too");
  assert.equal(S().loadRevision, start + 3);
});

// ============================================== export is independent of zoom
interface FakeStageState {
  width: number;
  height: number;
  scale: number;
}
function makeFakeStage(shown: FakeStageState, options: { failWith?: Error } = {}) {
  const state = { ...shown };
  const calls: { atExport?: FakeStageState; pixelRatio?: number; mimeType?: string; transformerNodesAtExport?: number } = {};
  const transformer = { held: ["node-1"] as unknown[], nodes(n?: unknown[]) { if (n) { this.held = n; return this; } return this.held; } };
  const container = { scrollLeft: 120, scrollTop: 40, parentElement: null as unknown };
  const stage = {
    width: () => state.width,
    height: () => state.height,
    scaleX: () => state.scale,
    scaleY: () => state.scale,
    scale: (v: { x: number; y: number }) => { state.scale = v.x; },
    size: (v: { width: number; height: number }) => { state.width = v.width; state.height = v.height; },
    find: () => [transformer],
    container: () => container,
    draw: () => {},
    toDataURL: (o: { pixelRatio: number; mimeType: string }) => {
      calls.atExport = { ...state };
      calls.pixelRatio = o.pixelRatio;
      calls.mimeType = o.mimeType;
      calls.transformerNodesAtExport = transformer.held.length;
      if (options.failWith) throw options.failWith;
      return "data:image/png;base64," + "A".repeat(64);
    },
  };
  return { stage, state, calls, transformer, container };
}
const fakeDom = () => {
  const clicked: { download?: string; href?: string }[] = [];
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => {
      const link = { href: "", download: "", click() { clicked.push({ download: link.download, href: link.href }); }, remove() {} };
      return link;
    },
    body: { appendChild() {} },
  };
  return clicked;
};

test("export: a poster viewed at 31% still exports at its real size (x pixelRatio), and the view is restored", () => {
  const clicked = fakeDom();
  const fake = makeFakeStage({ width: 338, height: 600, scale: 0.3125 });
  const result = exportStageAsImage(fake.stage as never, { format: "png", pixelRatio: 2, designSize: { width: 1080, height: 1920 } });
  assert.deepEqual(fake.calls.atExport, { width: 1080, height: 1920, scale: 1 }, "scale 1 at design size while the picture is taken");
  assert.equal(fake.calls.pixelRatio, 2);
  assert.deepEqual([result.outputWidth, result.outputHeight, result.capped], [2160, 3840, false]);
  assert.deepEqual(fake.state, { width: 338, height: 600, scale: 0.3125 }, "zoom restored");
  assert.deepEqual(fake.transformer.held, ["node-1"], "selection handles come back");
  assert.equal(fake.calls.transformerNodesAtExport, 0, "…but are not in the picture");
  assert.equal(fake.container.scrollLeft, 120, "scroll position survives");
  assert.equal(clicked.length, 1);
  assert.match(clicked[0].download!, /\.png$/);
});

test("export: without designSize the size is derived from the Stage and its scale; JPEG; the 8192px cap", () => {
  fakeDom();
  const derived = makeFakeStage({ width: 540, height: 960, scale: 0.5 });
  const r = exportStageAsImage(derived.stage as never, { format: "jpeg", pixelRatio: 1 });
  assert.deepEqual(derived.calls.atExport, { width: 1080, height: 1920, scale: 1 });
  assert.equal(derived.calls.mimeType, "image/jpeg");
  assert.deepEqual([r.outputWidth, r.outputHeight], [1080, 1920]);

  const big = makeFakeStage({ width: 400, height: 400, scale: 0.1 });
  const capped = exportStageAsImage(big.stage as never, { format: "png", pixelRatio: 3, designSize: { width: 4000, height: 4000 } });
  assert.equal(capped.capped, true);
  assert.ok(capped.outputWidth <= 8192 && capped.outputHeight <= 8192);
  assert.ok(capped.pixelRatio < 3);
});

test("export: a failing export (tainted canvas) still restores zoom and selection, with a readable message", () => {
  fakeDom();
  const err = Object.assign(new Error("tainted"), { name: "SecurityError" });
  const fake = makeFakeStage({ width: 338, height: 600, scale: 0.3125 }, { failWith: err });
  assert.throws(
    () => exportStageAsImage(fake.stage as never, { format: "png", designSize: { width: 1080, height: 1920 } }),
    /CORS/
  );
  assert.deepEqual(fake.state, { width: 338, height: 600, scale: 0.3125 });
  assert.deepEqual(fake.transformer.held, ["node-1"]);
});

// ================================================= drawing a (mirrored) picture
interface Call { op: string; args: unknown[] }
function recordingContext() {
  const calls: Call[] = [];
  const ctx: Record<string, unknown> = {};
  for (const op of ["beginPath", "rect", "closePath", "save", "restore", "translate", "scale", "drawImage", "fillShape", "fillStrokeShape"]) {
    ctx[op] = (...args: unknown[]) => calls.push({ op, args });
  }
  return { ctx: ctx as unknown as PictureContext, calls };
}
const IMG = { tag: "img" };
const ops = (calls: Call[]) => calls.map((c) => c.op);

test("drawPicture: not mirrored — the picture goes straight into the box, no transform", () => {
  const { ctx, calls } = recordingContext();
  drawPicture(ctx, "shape", { width: 200, height: 100, image: IMG, flipX: false, flipY: false });
  assert.deepEqual(ops(calls), ["beginPath", "rect", "closePath", "fillStrokeShape", "save", "drawImage", "restore"]);
  assert.deepEqual(calls.find((c) => c.op === "drawImage")!.args, [IMG, 0, 0, 200, 100]);
});

test("drawPicture: flipX / flipY / both mirror around the box's own centre line", () => {
  const run = (flipX: boolean, flipY: boolean) => {
    const { ctx, calls } = recordingContext();
    drawPicture(ctx, "s", { width: 200, height: 100, image: IMG, flipX, flipY });
    return calls.filter((c) => c.op === "translate" || c.op === "scale").map((c) => [c.op, ...c.args]);
  };
  assert.deepEqual(run(true, false), [["translate", 200, 0], ["scale", -1, 1]]);
  assert.deepEqual(run(false, true), [["translate", 0, 100], ["scale", 1, -1]]);
  assert.deepEqual(run(true, true), [["translate", 200, 100], ["scale", -1, -1]]);
});

test("drawPicture: crop is passed as source pixels; no image = only the placeholder frame; hit area = plain box", () => {
  const { ctx, calls } = recordingContext();
  drawPicture(ctx, "s", { width: 50, height: 40, image: IMG, crop: { x: 10, y: 20, width: 30, height: 60 }, flipX: false, flipY: false });
  assert.deepEqual(calls.find((c) => c.op === "drawImage")!.args, [IMG, 10, 20, 30, 60, 0, 0, 50, 40]);

  const loading = recordingContext();
  drawPicture(loading.ctx, "s", { width: 50, height: 40, image: null, flipX: true, flipY: false });
  assert.deepEqual(ops(loading.calls), ["beginPath", "rect", "closePath", "fillStrokeShape"]);

  const hit = recordingContext();
  drawPictureHitBox(hit.ctx, "s", 50, 40);
  assert.deepEqual(ops(hit.calls), ["beginPath", "rect", "closePath", "fillShape"]);
});

run().then((code) => process.exit(code));
