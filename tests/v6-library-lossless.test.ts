// v11 (schema v6): the template library (catalogue, fetch loader, "my
// templates" in localStorage), the text effect presets, the border of a text's
// background box, and the lossless Polotno round trip (unused properties kept).
import assert from "node:assert/strict";
import { test, run } from "./harness";
import { E } from "./helpers";
import { useEditorStore } from "@/store/useEditorStore";
import { convertKusukaToPolotno, convertPolotnoToKusuka, parseDocument, type PolotnoDocument } from "@/lib/polotnoAdapter";
import {
  fetchTemplateDocument,
  fetchTemplateIndex,
  listUserTemplates,
  parseTemplateIndex,
  removeUserTemplate,
  saveUserTemplate,
  USER_TEMPLATES_KEY,
} from "@/lib/templateLibrary";
import { TEXT_EFFECTS, TEXT_EFFECT_KEYS, detectTextEffect, luminance, textEffectPatch } from "@/lib/textEffectPresets";
import { resolveTextBorder } from "@/lib/textEffects";
import type { TextElement } from "@/types/editor";

const S = () => useEditorStore.getState();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ============================================================== catalogue + loader
test("catalogue: valid entries kept, broken / unsafe / duplicate ones left out and counted", () => {
  const r = parseTemplateIndex({
    version: 1,
    templates: [
      { id: "a", name: "A", file: "a.polotno.json", thumbnail: "thumbs/a.svg", pages: 2, width: 1080, height: 1080 },
      { id: "a", name: "dup", file: "x.json" },
      { id: "b", name: "B", file: "../secret.json" },
      { id: "c", name: "C", file: "https://evil.example/c.json" },
      { id: "", name: "D", file: "d.json" },
      { id: "e", name: "E", file: "e.json", thumbnail: "/abs.svg", pages: -1 },
      7,
    ],
  });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.deepEqual(r.index.templates.map((t) => t.id), ["a", "e"]);
  assert.equal(r.skipped, 5);
  assert.deepEqual(r.index.templates[1], { id: "e", name: "E", file: "e.json" }, "unsafe thumbnail and bad page count dropped");
  assert.ok("error" in parseTemplateIndex({ nope: [] }));
});

test("loader: fetches /templates/index.json and a template file; HTTP and network errors become messages", async () => {
  const files: Record<string, unknown> = {
    "/templates/index.json": { version: 1, templates: [{ id: "a", name: "A", file: "a.polotno.json" }] },
    "/templates/a.polotno.json": { pages: [{ children: [] }] },
  };
  const calls: string[] = [];
  const fake = async (url: string) => {
    calls.push(url);
    const body = files[url];
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404, json: async () => body };
  };
  const index = await fetchTemplateIndex(fake);
  assert.ok(!("error" in index) && index.index.templates.length === 1);
  const doc = await fetchTemplateDocument({ name: "A", file: "a.polotno.json" }, fake);
  assert.deepEqual(doc, { data: files["/templates/a.polotno.json"] });
  assert.deepEqual(calls, ["/templates/index.json", "/templates/a.polotno.json"]);
  const missing = await fetchTemplateDocument({ name: "Z", file: "z.json" }, fake);
  assert.ok("error" in missing && /HTTP 404/.test(missing.error));
  const offline = await fetchTemplateIndex(async () => {
    throw new Error("Failed to fetch");
  });
  assert.ok("error" in offline && /Failed to fetch/.test(offline.error));
});

class MemoryStorage {
  data = new Map<string, string>();
  limit = Infinity;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (value.length > this.limit) {
      const err = new Error("The quota has been exceeded.");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.data.set(key, value);
  }
}

test("my templates: saved newest first, removed by id, damaged entries ignored, a full storage says so", () => {
  const store = new MemoryStorage();
  const doc = { pages: [{ children: [] }] };
  const a = saveUserTemplate(store, { name: "  Satu ", data: doc, savedAt: 1 });
  const b = saveUserTemplate(store, { name: "", data: doc, savedAt: 2 });
  assert.ok(a.ok && b.ok);
  const list = listUserTemplates(store);
  assert.deepEqual(list.map((t) => t.name), ["Template tanpa nama", "Satu"]);
  assert.ok(a.ok && removeUserTemplate(store, a.template.id).ok);
  assert.deepEqual(listUserTemplates(store).map((t) => t.name), ["Template tanpa nama"]);
  // a damaged list, or damaged entries, never throw
  store.data.set(USER_TEMPLATES_KEY, "{not json");
  assert.deepEqual(listUserTemplates(store), []);
  store.data.set(USER_TEMPLATES_KEY, JSON.stringify([{ id: 1 }, { id: "x", name: "ok", savedAt: 3, data: doc, thumbnail: "javascript:alert(1)" }]));
  const kept = listUserTemplates(store);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].thumbnail, undefined, "only data:image thumbnails are kept");
  // quota
  store.limit = 10;
  const full = saveUserTemplate(store, { name: "besar", data: doc });
  assert.ok(!full.ok && /penuh/.test(full.error));
  assert.ok(!saveUserTemplate(null, { name: "x", data: doc }).ok);
  assert.deepEqual(listUserTemplates(null), []);
});

// ============================================================== text effect presets
const text = (over: Partial<TextElement> = {}): TextElement => ({
  id: "t",
  type: "text",
  x: 0,
  y: 0,
  width: 300,
  height: 48,
  rotation: 0,
  zIndex: 1,
  text: "Halo",
  fontSize: 40,
  fontFamily: "Inter, sans-serif",
  fill: "#111111",
  align: "left",
  fontStyle: "normal",
  lineHeight: 1.2,
  ...over,
});

test("presets: eight looks; every preset is recognised again after it is applied, and switching leaves no mix", () => {
  assert.deepEqual(TEXT_EFFECTS.map((e) => e.id), ["none", "shadow", "lift", "glow", "outline", "sticker", "pop", "background"]);
  for (const { id } of TEXT_EFFECTS) {
    const applied = { ...text(), ...textEffectPatch(id, text()) } as TextElement;
    for (const k of TEXT_EFFECT_KEYS) if (applied[k] === undefined) delete applied[k];
    assert.equal(detectTextEffect(applied), id, id);
  }
  // switching from sticker (stroke + shadow) to background clears both
  const sticker = { ...text(), ...textEffectPatch("sticker", text()) };
  const bg = textEffectPatch("background", sticker);
  assert.equal(bg.stroke, undefined);
  assert.equal(bg.shadowColor, undefined);
  assert.ok("stroke" in bg && "shadowColor" in bg, "the keys are in the patch, so updateElement removes them");
  // sizes follow the font size; glow takes the text colour; outline contrasts with it
  assert.ok(textEffectPatch("shadow", text({ fontSize: 100 })).shadowBlur! > textEffectPatch("shadow", text({ fontSize: 20 })).shadowBlur!);
  assert.equal(textEffectPatch("glow", text({ fill: "#22cc88" })).shadowColor, "#22cc88");
  assert.equal(textEffectPatch("outline", text({ fill: "#ffffff" })).stroke, "#000000");
  assert.equal(textEffectPatch("outline", text({ fill: "#111111" })).stroke, "#ffffff");
  assert.ok(luminance("#ffffff") > 0.9 && luminance("#000000") === 0 && luminance("red") === 0.5);
  // a background tuned by hand is still "background"; a mix is "custom" (null)
  assert.equal(detectTextEffect(text({ backgroundEnabled: true, backgroundColor: "#123456", borderSize: 3 })), "background");
  assert.equal(detectTextEffect(text({ shadowColor: "#000000", shadowBlur: 1, stroke: "#ff0000", strokeWidth: 9 })), null);
});

test("store: a preset is ONE undo step and is undone exactly", async () => {
  S().loadFromJSON({ version: 6, pages: [{ id: "p", canvas: { width: 500, height: 500, backgroundColor: "#ffffff" }, elements: [text()] }] });
  await new Promise((r) => setTimeout(r, 600));
  const steps = S().past.length;
  S().updateElement("t", textEffectPatch("sticker", text()) as Partial<TextElement>);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(S().past.length, steps + 1);
  assert.equal(detectTextEffect(E()[0] as TextElement), "sticker");
  S().undo();
  assert.equal(detectTextEffect(E()[0] as TextElement), "none");
});

test("text box border: Polotno's borderColor / borderSize, only when > 0", () => {
  assert.deepEqual(resolveTextBorder({ borderSize: 3, borderColor: "#ff0000" }), { color: "#ff0000", width: 3 });
  assert.deepEqual(resolveTextBorder({ borderSize: 2 }), { color: "#000000", width: 2 });
  assert.equal(resolveTextBorder({ borderSize: 0, borderColor: "#ff0000" }), null);
  assert.equal(resolveTextBorder({ borderSize: 2, borderColor: "transparent" }), null);
});

// ============================================================== lossless round trip
/** A Polotno document as Polotno writes it, with properties this editor has no use for. */
const polotnoFile = (): PolotnoDocument => ({
  schemaVersion: 5,
  width: 1080,
  height: 1080,
  unit: "px",
  dpi: 300,
  fonts: [{ fontFamily: "Lobster Two", url: "https://example.com/lobster.woff2" }],
  custom: { project: "kampanye-2026" },
  audios: [],
  pages: [
    {
      id: "page-a",
      background: "#fdf6e3",
      width: "auto",
      height: "auto",
      bleed: 12,
      duration: 3000,
      custom: { note: "sampul" },
      children: [
        {
          id: "title",
          type: "text",
          name: "Judul utama",
          opacity: 1,
          visible: true,
          selectable: false,
          removable: false,
          alwaysOnTop: false,
          showInExport: true,
          x: 100,
          y: 80,
          width: 400,
          height: 50,
          rotation: 0,
          animations: [{ type: "fade", delay: 0, duration: 500, enabled: true }],
          blendMode: "multiply",
          contentEditable: false,
          text: "PROMO",
          placeholder: "Judul",
          fontSize: 40,
          fontFamily: "Roboto",
          fontStyle: "normal",
          fontWeight: "bold",
          textDecoration: "",
          fill: "#111111",
          align: "center",
          verticalAlign: "middle",
          lineHeight: 1.2,
          letterSpacing: 0,
          strokeWidth: 0,
          stroke: "black",
          shadowEnabled: false,
          shadowColor: "black",
          shadowBlur: 5,
          blurEnabled: false,
          blurRadius: 10,
          backgroundEnabled: true,
          backgroundColor: "#ff0055",
          backgroundOpacity: 1,
          backgroundCornerRadius: 0.5,
          backgroundPadding: 0.6,
          borderColor: "#222222",
          borderSize: 2,
          custom: { campaignId: 42 },
        },
        {
          id: "box",
          type: "figure",
          name: "Kotak",
          opacity: 1,
          visible: true,
          selectable: true,
          removable: true,
          alwaysOnTop: true,
          showInExport: true,
          x: 10,
          y: 600,
          width: 300,
          height: 200,
          rotation: 0,
          subType: "rect",
          fill: "#00a1ff",
          stroke: "#003366",
          strokeWidth: 4,
          cornerRadius: 12,
          dash: [2, 1],
          shadowEnabled: true,
          shadowColor: "#000000",
          shadowBlur: 8,
          shadowOffsetX: 2,
          shadowOffsetY: 3,
          shadowOpacity: 0.5,
        },
        {
          id: "photo",
          type: "image",
          name: "",
          opacity: 0.8,
          visible: true,
          selectable: true,
          removable: true,
          alwaysOnTop: false,
          showInExport: true,
          x: 500,
          y: 500,
          width: 400,
          height: 300,
          rotation: 15,
          src: "https://example.com/foto.jpg",
          cropX: 0.1,
          cropY: 0,
          cropWidth: 0.8,
          cropHeight: 1,
          cornerRadius: 0,
          flipX: true,
          flipY: false,
          keepRatio: true,
          clipSrc: "",
        },
      ],
    },
  ],
});

test("lossless: Polotno -> KusukaEdit -> Polotno gives back the very same document", () => {
  const original = polotnoFile();
  const imported = convertPolotnoToKusuka(clone(original));
  assert.deepEqual(imported.warnings, []);
  const exported = convertKusukaToPolotno(imported.document);
  assert.deepEqual(clone(exported), original);
  // and the text effects really are in the editor's model, not only passed through
  const title = imported.document.pages[0].elements[0] as TextElement;
  assert.equal(title.backgroundEnabled, true);
  assert.equal(title.backgroundPadding, 0.6);
  assert.equal(title.borderSize, 2);
  assert.equal(title.borderColor, "#222222");
  assert.equal(title.polotno?.name, "Judul utama");
  assert.equal(title.polotno?.verticalAlign, "middle");
});

test("lossless: an edit wins over the kept copy, everything else stays", () => {
  const imported = convertPolotnoToKusuka(polotnoFile()).document;
  const title = imported.pages[0].elements[0] as TextElement;
  title.text = "DISKON";
  title.backgroundColor = "#00ff00";
  title.borderSize = undefined;
  title.borderColor = undefined;
  const out = convertKusukaToPolotno(imported).pages[0].children![0] as Record<string, unknown>;
  assert.equal(out.text, "DISKON");
  assert.equal(out.backgroundColor, "#00ff00");
  assert.equal(out.name, "Judul utama");
  assert.deepEqual(out.custom, { campaignId: 42 });
  // the border was removed in the editor: Polotno's own defaults come back, not the old 2 px
  assert.equal(out.borderSize, undefined);
});

test("lossless: the kept properties survive the native JSON file too (export -> import -> Polotno)", () => {
  const imported = convertPolotnoToKusuka(polotnoFile()).document;
  const native = parseDocument(JSON.parse(JSON.stringify(imported)));
  assert.ok(native.ok);
  if (!native.ok) return;
  assert.deepEqual(native.document, imported);
  assert.deepEqual(clone(convertKusukaToPolotno(native.document)), polotnoFile());
  // a damaged `polotno` record is simply dropped
  const bad = parseDocument({ version: 6, polotno: "x", pages: [{ id: "p", canvas: {}, elements: [{ id: "r", type: "shape", shapeType: "rect", polotno: [1] }] }] });
  assert.ok(bad.ok && bad.document.polotno === undefined && bad.document.pages[0].elements[0].polotno === undefined);
});

test("lossless: a file this editor wrote keeps nothing extra (no default noise)", () => {
  const doc = convertPolotnoToKusuka(polotnoFile()).document;
  const ours = convertKusukaToPolotno({ version: 6, pages: [{ id: "p", canvas: { width: 100, height: 100, backgroundColor: "#ffffff" }, elements: [] }] });
  const back = convertPolotnoToKusuka(ours).document;
  assert.equal(back.polotno, undefined);
  assert.equal(back.pages[0].polotno, undefined);
  assert.ok(doc.polotno && doc.pages[0].polotno, "a real Polotno file does keep its own");
});

test("store: open a Polotno file and export it as Polotno -> identical (document-level properties included)", async () => {
  const r = S().loadFromJSON(clone(polotnoFile()));
  assert.ok(r.ok);
  const { json } = await S().exportToJSON("polotno");
  assert.deepEqual(JSON.parse(json), polotnoFile());
  S().reset();
  assert.equal(S().documentPolotno, undefined, "a new design forgets the old file's properties");
});

run().then((code) => process.exit(code));
