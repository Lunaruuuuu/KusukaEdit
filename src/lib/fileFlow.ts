// ---------------------------------------------------------------------------
// The two ends of a design's life outside the editor, as Polotno lays them out:
// files come IN through the Import tab of the left panel (a preview of what was
// detected, then "open"), and go OUT through the Export button in the header
// (one menu: PNG, JPG, JSON KusukaEdit, JSON Polotno). The decisions behind
// both are here, as pure functions; the components only render them.
// ---------------------------------------------------------------------------

import type { CanvasDocument } from "@/types/editor";
import { parseDocument, type ExportFormat } from "@/lib/polotnoAdapter";

// --------------------------------- import ----------------------------------

/** What the Import tab shows about a chosen file before it replaces the design. */
export type ImportPreview =
  | {
      ok: true;
      fileName: string;
      format: ExportFormat;
      pageCount: number;
      /** "1080 × 1080 px", or "3 ukuran berbeda" when the pages differ. */
      sizeLabel: string;
      elementCount: number;
      warnings: string[];
      /** The converted document (its first page is drawn as the preview thumbnail). */
      document: CanvasDocument;
      /** The original text, handed to loadFromJSON() when the user opens it. */
      text: string;
    }
  | { ok: false; fileName: string; error: string };

/** Files the project import accepts (the content decides the format, not the name). */
export const PROJECT_FILE_ACCEPT = "application/json,.json,.polotno";

/**
 * Reads a chosen file's text the way loadFromJSON() will, WITHOUT touching the
 * store: which format was detected, how many pages and elements, what sizes,
 * and the warnings the import will show. Nothing is replaced until the user
 * confirms, so a wrong file costs nothing (not even an undo step).
 */
export function previewImport(text: string, fileName: string): ImportPreview {
  const parsed = parseDocument(text);
  if (!parsed.ok) return { ok: false, fileName, error: parsed.error };
  const pages = parsed.document.pages;
  const sizes = new Set(pages.map((p) => `${p.canvas.width} × ${p.canvas.height}`));
  return {
    ok: true,
    fileName,
    format: parsed.format,
    pageCount: pages.length,
    sizeLabel: sizes.size === 1 ? `${[...sizes][0]} px` : `${sizes.size} ukuran berbeda`,
    elementCount: pages.reduce((sum, p) => sum + p.elements.length, 0),
    warnings: parsed.warnings,
    document: parsed.document,
    text,
  };
}

export const FORMAT_LABEL: Record<ExportFormat, string> = {
  kusuka: "KusukaEdit",
  polotno: "Polotno",
};

// --------------------------------- export ----------------------------------

/** Every choice of the header's Export menu. */
export type ExportChoice = "png" | "jpeg" | "json-kusuka" | "json-polotno";

export interface ExportChoiceInfo {
  id: ExportChoice;
  label: string;
  description: string;
  /** "image": drawn from the Stage (resolution and pages apply); "json": the document file. */
  kind: "image" | "json";
}

export const EXPORT_CHOICES: readonly ExportChoiceInfo[] = [
  { id: "png", label: "PNG", description: "Gambar berkualitas tinggi, mendukung transparansi", kind: "image" },
  { id: "jpeg", label: "JPG", description: "Gambar berukuran kecil, latar tidak transparan", kind: "image" },
  { id: "json-kusuka", label: "JSON KusukaEdit", description: "Berkas proyek native, bisa dibuka lagi di editor ini", kind: "json" },
  { id: "json-polotno", label: "JSON Polotno", description: "Berkas proyek yang kompatibel dengan Polotno", kind: "json" },
];

export function exportChoiceInfo(choice: ExportChoice): ExportChoiceInfo {
  return EXPORT_CHOICES.find((c) => c.id === choice) ?? EXPORT_CHOICES[0];
}

export function isExportChoice(value: unknown): value is ExportChoice {
  return typeof value === "string" && EXPORT_CHOICES.some((c) => c.id === value);
}

/** The JSON format of a JSON choice (null for a picture). */
export function jsonFormatOf(choice: ExportChoice): ExportFormat | null {
  return choice === "json-kusuka" ? "kusuka" : choice === "json-polotno" ? "polotno" : null;
}

/** Name of a downloaded JSON file: `kusuka-design-<time>.json` / `polotno-design-<time>.json`. */
export function jsonFileName(format: ExportFormat, time: number = Date.now()): string {
  return `${format}-design-${time}.json`;
}

/** Export resolutions offered for pictures (multiplier of the design size). */
export const EXPORT_RESOLUTIONS: readonly number[] = [1, 2, 3];
