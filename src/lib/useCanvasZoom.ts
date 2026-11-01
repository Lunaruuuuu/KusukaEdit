"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clampZoom, fitZoom, stepZoom, ZOOM_MAX, ZOOM_MIN } from "@/lib/zoom";

export type ZoomMode = "fit" | "manual";

/**
 * View scale of the canvas inside its scroll area.
 *
 *  - "fit" (the default): the scale follows the free space, so the whole
 *    canvas is always visible. It re-fits when the window is resized, whenever
 *    the canvas gets a new size, and whenever a document is loaded — which is
 *    what happens when a large Polotno file (1080 x 1920 ...) is imported.
 *  - "manual": after the user zooms in/out, the chosen scale is kept until
 *    "Fit" is pressed, the canvas size changes, or a document is loaded.
 *
 * `refitKey` changes whenever a new document is loaded (the store's
 * `loadRevision`): the new design is then shown whole again even if it has the
 * same size as the previous one.
 *
 * Attach `scrollRef` to the scrolling box and `wrapRef` to the element that
 * is exactly as large as the scaled canvas.
 */
export function useCanvasZoom(canvasWidth: number, canvasHeight: number, refitKey = 0) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [avail, setAvail] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<ZoomMode>("fit");
  const [manualZoom, setManualZoom] = useState(1);

  // A canvas of a new size, or a newly loaded document, is shown whole again
  // (React's "adjust state while rendering" pattern: no frame is drawn with
  // the old mode).
  const sizeKey = `${canvasWidth}x${canvasHeight}#${refitKey}`;
  const [seenSize, setSeenSize] = useState(sizeKey);
  if (seenSize !== sizeKey) {
    setSeenSize(sizeKey);
    setMode("fit");
  }

  const zoom =
    mode === "fit" ? fitZoom(canvasWidth, canvasHeight, avail.width, avail.height) : manualZoom;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Free space = the scroll box minus its padding (scrollbars are excluded by clientWidth).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      const style = window.getComputedStyle(el);
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setAvail((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Zooming keeps the point at the middle of the visible area where it is,
  // instead of the canvas sliding away towards the top-left.
  const anchorRef = useRef<{ fx: number; fy: number } | null>(null);

  const rememberAnchor = useCallback(() => {
    const scroller = scrollRef.current;
    const wrap = wrapRef.current;
    if (!scroller || !wrap || wrap.offsetWidth === 0 || wrap.offsetHeight === 0) {
      anchorRef.current = null;
      return;
    }
    anchorRef.current = {
      fx: (scroller.scrollLeft + scroller.clientWidth / 2 - wrap.offsetLeft) / wrap.offsetWidth,
      fy: (scroller.scrollTop + scroller.clientHeight / 2 - wrap.offsetTop) / wrap.offsetHeight,
    };
  }, []);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const scroller = scrollRef.current;
    const wrap = wrapRef.current;
    if (!anchor || !scroller || !wrap) return;
    scroller.scrollLeft = wrap.offsetLeft + anchor.fx * wrap.offsetWidth - scroller.clientWidth / 2;
    scroller.scrollTop = wrap.offsetTop + anchor.fy * wrap.offsetHeight - scroller.clientHeight / 2;
  }, [zoom]);

  const setZoom = useCallback(
    (next: number) => {
      rememberAnchor();
      setMode("manual");
      setManualZoom(clampZoom(next));
    },
    [rememberAnchor]
  );

  const zoomIn = useCallback(() => setZoom(stepZoom(zoomRef.current, 1)), [setZoom]);
  const zoomOut = useCallback(() => setZoom(stepZoom(zoomRef.current, -1)), [setZoom]);
  const actualSize = useCallback(() => setZoom(1), [setZoom]);
  const fit = useCallback(() => {
    anchorRef.current = null;
    setMode("fit");
  }, []);

  // Ctrl/Cmd + mouse wheel (and the pinch gesture of a trackpad, which the
  // browser reports the same way) zooms the canvas instead of the whole page.
  // Added by hand: React registers wheel listeners as passive, and a passive
  // listener cannot call preventDefault().
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY; // lines -> px
      setZoom(zoomRef.current * Math.exp(-delta * 0.0025));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  return {
    scrollRef,
    wrapRef,
    zoom,
    mode,
    canZoomIn: zoom < ZOOM_MAX - 1e-6,
    canZoomOut: zoom > ZOOM_MIN + 1e-6,
    zoomIn,
    zoomOut,
    actualSize,
    fit,
  };
}
