// ---------------------------------------------------------------------------
// Turns a file picked in <input type="file" accept="image/*"> into something
// the store can place on the canvas.
// ---------------------------------------------------------------------------

import { loadImage } from "@/lib/imageCache";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export interface PreparedImage {
  /** `blob:` URL created with URL.createObjectURL(file). */
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** True for an SVG file: it becomes a vector picture (written back to Polotno as `svg`). */
  vector: boolean;
}

// Browsers report 300 x 150 for an SVG with no size of its own; some older ones
// report 0. Either way the picture needs a box to start from.
const FALLBACK_SIZE = { width: 300, height: 150 };

/**
 * Validates the file, creates a temporary object URL and loads the picture
 * once (which also fills the image cache, so it appears on the canvas
 * without a flash). Rejects with a message meant to be shown to the user.
 * On failure the object URL is revoked here, so nothing leaks.
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  // `accept="image/*"` is only a hint in the file picker; it does not stop
  // someone from choosing "All files".
  if (!file.type.startsWith("image/")) {
    throw new Error(`"${file.name}" bukan berkas gambar.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    throw new Error(`"${file.name}" lebih besar dari ${mb} MB.`);
  }

  const src = URL.createObjectURL(file);
  try {
    const { image } = await loadImage(src);
    return {
      src,
      naturalWidth: image.naturalWidth || FALLBACK_SIZE.width,
      naturalHeight: image.naturalHeight || FALLBACK_SIZE.height,
      vector: file.type === "image/svg+xml",
    };
  } catch {
    URL.revokeObjectURL(src);
    throw new Error(`"${file.name}" tidak bisa dibuka sebagai gambar (file rusak atau formatnya tidak didukung browser).`);
  }
}
