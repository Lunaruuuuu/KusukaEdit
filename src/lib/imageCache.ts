// ---------------------------------------------------------------------------
// Loads pictures for the canvas.
//
//  - Decoded <img> elements are cached by URL, so an element that is
//    re-mounted (Undo/Redo, template switch) shows instantly instead of
//    flashing an empty frame while the picture is decoded again.
//  - Cross-origin pictures (e.g. the https:// links in an imported Polotno
//    file) are first requested WITH CORS. A picture drawn on a canvas
//    without CORS "taints" it, and stage.toDataURL() then throws; asking for
//    CORS up front keeps export working. If the server does not allow it the
//    picture is loaded without CORS so it is still visible, and flagged
//    `tainted` so the export can explain what is wrong instead of failing
//    mysteriously.
// ---------------------------------------------------------------------------

export interface LoadedImage {
  image: HTMLImageElement;
  /** True when the picture can be shown but will block canvas export (no CORS). */
  tainted: boolean;
}

const MAX_CACHE_ENTRIES = 40;

const cache = new Map<string, LoadedImage>();
const inflight = new Map<string, Promise<LoadedImage>>();

function attempt(src: string, withCors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (withCors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gambar tidak dapat dimuat."));
    img.src = src;
  });
}

function remember(src: string, loaded: LoadedImage): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(src, loaded);
}

export function getCachedImage(src: string): LoadedImage | undefined {
  return cache.get(src);
}

export function loadImage(src: string): Promise<LoadedImage> {
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(src);
  if (pending) return pending;

  const crossOrigin = /^https?:/i.test(src);
  const promise = (async (): Promise<LoadedImage> => {
    try {
      const image = await attempt(src, crossOrigin);
      return { image, tainted: false };
    } catch (err) {
      if (!crossOrigin) throw err;
      // CORS refused (or the picture is gone): try once more without CORS.
      const image = await attempt(src, false);
      return { image, tainted: true };
    }
  })()
    .then((loaded) => {
      remember(src, loaded);
      return loaded;
    })
    .finally(() => {
      inflight.delete(src);
    });

  inflight.set(src, promise);
  return promise;
}

/** Forget a URL (called when its object URL is revoked). */
export function evictImage(src: string): void {
  cache.delete(src);
}
