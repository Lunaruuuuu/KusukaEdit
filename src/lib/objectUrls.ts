// ---------------------------------------------------------------------------
// Lifetime of temporary object URLs (URL.createObjectURL).
//
// An uploaded picture is shown through a `blob:` URL: instant, and the bytes
// stay in the browser's blob store instead of being copied into app state as
// a huge base64 string. The price is that a blob URL keeps its Blob alive
// until URL.revokeObjectURL() is called — so something has to decide when.
//
// That decision is NOT "when the element is deleted": Ctrl+Z restores the
// deleted element from the history stack, and a revoked URL would bring it
// back as a broken image. The rule used instead is reference-based: a URL is
// revoked once nothing that could still draw it refers to it any more
// (current elements, undo/redo snapshots, the clipboard). The caller (the
// store) gathers those references; this module owns the bookkeeping.
// ---------------------------------------------------------------------------

/** Object URLs minted by THIS editor session and therefore ours to revoke. */
const owned = new Set<string>();

export function isObjectUrl(src: string): boolean {
  return src.startsWith("blob:");
}

/** Remember a URL created with URL.createObjectURL so it can be revoked later. */
export function trackObjectUrl(src: string): void {
  if (isObjectUrl(src)) owned.add(src);
}

export function hasTrackedObjectUrls(): boolean {
  return owned.size > 0;
}

export function isTrackedObjectUrl(src: string): boolean {
  return owned.has(src);
}

/**
 * Revokes every tracked URL that is not in `referenced`, and returns the
 * ones revoked. URLs that are still referenced are left alone.
 */
export function releaseUnreferencedObjectUrls(referenced: ReadonlySet<string>): string[] {
  const released: string[] = [];
  owned.forEach((url) => {
    if (!referenced.has(url)) released.push(url);
  });
  for (const url of released) {
    URL.revokeObjectURL(url);
    owned.delete(url);
  }
  return released;
}
