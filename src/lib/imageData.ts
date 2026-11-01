// ---------------------------------------------------------------------------
// Making pictures portable for JSON export.
//
// A `blob:` URL only exists inside the page that created it: written to a
// file it is dead after a refresh, and dead on another computer — which
// would break the editor's core promise (export -> refresh -> import gives
// the same design). So when a document is exported, every blob: picture is
// read back and replaced by a self-contained `data:` URL. The live editor
// keeps using the cheap blob URL; only the exported copy is converted.
// ---------------------------------------------------------------------------

import type { CanvasDocument, CanvasElement } from "@/types/editor";
import { isObjectUrl } from "@/lib/objectUrls";

/** base64 of binary data, in chunks so large pictures don't overflow the call stack. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function blobUrlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${toBase64(bytes)}`;
}

export interface EmbedResult {
  document: CanvasDocument;
  warnings: string[];
}

/**
 * Returns a copy of the document in which every `blob:` picture is replaced
 * by a `data:` URL. A picture that can no longer be read (its URL was
 * revoked, or it came from another session) is left as is and reported in
 * `warnings` — never dropped silently.
 */
export async function embedObjectUrls(doc: CanvasDocument): Promise<EmbedResult> {
  const warnings: string[] = [];
  const converted = new Map<string, string | null>();

  const urls = new Set<string>();
  doc.elements.forEach((el) => {
    if (el.type === "image" && isObjectUrl(el.src)) urls.add(el.src);
  });

  for (const url of urls) {
    try {
      converted.set(url, await blobUrlToDataUrl(url));
    } catch {
      converted.set(url, null);
    }
  }

  let unreadable = 0;
  const elements: CanvasElement[] = doc.elements.map((el) => {
    if (el.type !== "image" || !isObjectUrl(el.src)) return el;
    const dataUrl = converted.get(el.src);
    if (dataUrl) return { ...el, src: dataUrl };
    unreadable++;
    return el;
  });

  if (unreadable > 0) {
    warnings.push(
      `${unreadable} gambar tidak bisa dibaca lagi dan tetap memakai URL sementara; gambar itu tidak akan tampil saat file ini dibuka kembali.`
    );
  }
  return { document: { ...doc, elements }, warnings };
}
