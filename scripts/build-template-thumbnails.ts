// ---------------------------------------------------------------------------
// Rebuilds the previews and the numbers of the template catalogue:
//
//   npm run templates:build
//
// For every entry of public/templates/index.json it reads the template's JSON,
// converts it with the editor's own adapter (parseDocument), and
//   - writes public/templates/thumbs/<id>.svg: the first page, drawn by the
//     same TemplateThumbnail component the page strip uses (rendered to static
//     SVG markup);
//   - fills in `thumbnail`, `pages`, `width` and `height` of the entry.
// Name, description and file stay as written by hand. Run it after adding or
// changing a template file.
// ---------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TemplateThumbnail from "@/components/TemplateThumbnail";
import { parseDocument } from "@/lib/polotnoAdapter";
import { parseTemplateIndex } from "@/lib/templateLibrary";

const DIR = "public/templates";
const THUMB_WIDTH = 320;

const index = parseTemplateIndex(JSON.parse(readFileSync(`${DIR}/index.json`, "utf8")));
if ("error" in index) throw new Error(index.error);
mkdirSync(`${DIR}/thumbs`, { recursive: true });

const entries = index.index.templates.map((entry) => {
  const parsed = parseDocument(readFileSync(`${DIR}/${entry.file}`, "utf8"));
  if (!parsed.ok) throw new Error(`${entry.id}: ${parsed.error}`);
  if (parsed.warnings.length > 0) console.warn(`${entry.id}: ${parsed.warnings.join(" | ")}`);
  const first = parsed.document.pages[0];
  const { width, height } = first.canvas;

  // A standalone SVG file (shown with <img>) needs its namespaces and a size;
  // the HTML inside <foreignObject> (the text) needs the XHTML namespace.
  const markup = renderToStaticMarkup(createElement(TemplateThumbnail, { page: first }))
    .replace(
      /^<svg /,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
    )
    .replace('width="100%" height="100%"', `width="${THUMB_WIDTH}" height="${Math.round((THUMB_WIDTH * height) / width)}"`)
    .replace(/<foreignObject([^>]*)><div /g, '<foreignObject$1><div xmlns="http://www.w3.org/1999/xhtml" ');
  const thumbnail = `thumbs/${entry.id}.svg`;
  writeFileSync(`${DIR}/${thumbnail}`, `${markup}\n`);
  console.log(`${entry.id}: ${parsed.document.pages.length} hal., ${width} x ${height}`);
  return { ...entry, thumbnail, pages: parsed.document.pages.length, width, height };
});

writeFileSync(`${DIR}/index.json`, `${JSON.stringify({ version: index.index.version, templates: entries }, null, 2)}\n`);
