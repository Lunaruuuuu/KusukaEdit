"use client";

import { useEffect, useState } from "react";
import { getCachedImage, loadImage } from "@/lib/imageCache";

export type ImageStatus = "loading" | "loaded" | "error";

export interface UseLoadedImage {
  image: HTMLImageElement | null;
  status: ImageStatus;
  tainted: boolean;
}

interface State extends UseLoadedImage {
  src: string;
}

function initial(src: string): State {
  const cached = getCachedImage(src);
  return cached
    ? { src, image: cached.image, status: "loaded", tainted: cached.tainted }
    : { src, image: null, status: "loading", tainted: false };
}

/**
 * Loads `src` as an HTMLImageElement for Konva. Served from the image cache
 * when possible, so a re-mounted element does not flash.
 */
export function useLoadedImage(src: string): UseLoadedImage {
  const [state, setState] = useState<State>(() => initial(src));

  useEffect(() => {
    let alive = true;
    const cached = getCachedImage(src);
    if (cached) {
      setState({ src, image: cached.image, status: "loaded", tainted: cached.tainted });
      return;
    }
    setState({ src, image: null, status: "loading", tainted: false });
    loadImage(src)
      .then((loaded) => {
        if (alive) setState({ src, image: loaded.image, status: "loaded", tainted: loaded.tainted });
      })
      .catch(() => {
        if (alive) setState({ src, image: null, status: "error", tainted: false });
      });
    return () => {
      alive = false;
    };
  }, [src]);

  // The first render after `src` changes still holds the previous picture's
  // state; never hand that out for the new URL.
  return state.src === src ? state : initial(src);
}
