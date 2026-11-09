"use client";

// ---------------------------------------------------------------------------
// Blur and colour filter for a text or a shape (pictures do their own, see
// ElementRenderer's ImageNode): Konva filters work on a CACHED bitmap of the
// node, and a cache is a snapshot, so the node is cached again whenever
// `refreshKey` (everything that changes how the node looks) changes, and the
// cache is dropped when the last filter goes away.
// ---------------------------------------------------------------------------

import { useLayoutEffect, type RefObject } from "react";
import Konva from "konva";
import { blurCacheConfig, resolveImageEffects } from "@/lib/imageEffects";
import { applyColorMatrix, filterKey, filterToMatrix } from "@/lib/imageFilters";
import type { FilterEffectFields } from "@/lib/polotnoEffects";

export function useNodeFilters(
  nodeRef: RefObject<Konva.Node | null>,
  el: FilterEffectFields & { width: number; height: number },
  zoom: number,
  refreshKey: string,
  /** false: this node is not filtered here (it is left alone, cache and all). */
  enabled: boolean
): void {
  const fx = resolveImageEffects(el);
  const blur = fx.blur;
  const colourKey = filterKey(fx.filter);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || !enabled) return;
    const filter = resolveImageEffects(el).filter;
    if (blur <= 0 && !filter) {
      if (node.isCached()) {
        node.clearCache();
        node.filters([]);
      }
      node.getLayer()?.batchDraw();
      return;
    }
    const deviceRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const config = blurCacheConfig(Math.max(blur, 1), { zoom, deviceRatio, width: el.width, height: el.height });
    const filters: Array<(imageData: ImageData) => void> = [];
    if (blur > 0) filters.push(Konva.Filters.Blur);
    if (filter) {
      const matrix = filterToMatrix(filter);
      filters.push((imageData: ImageData) => applyColorMatrix(imageData.data, matrix));
    }
    if (node.isCached()) node.clearCache();
    // The blur spreads past the node's edges: leave room for it in the bitmap.
    node.cache({ pixelRatio: config.pixelRatio, offset: Math.ceil(blur * 2) });
    node.filters(filters);
    if (blur > 0) node.blurRadius(config.filterRadius);
    node.getLayer()?.batchDraw();
    // `el` is described by blur / colourKey / refreshKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blur, colourKey, zoom, refreshKey, enabled]);
}
