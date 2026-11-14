"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Rect, Ellipse, Text, Shape, Group, TextPath } from "react-konva";
import Konva from "konva";
import type { CanvasElement, ImageElement, TextElement } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";
import { useLoadedImage } from "@/lib/useLoadedImage";
import { drawPicture, drawPictureHitBox, type PictureContext } from "@/lib/drawPicture";
import { cropToSourcePixels } from "@/lib/crop";
import {
  applyImageBlur,
  blurCacheConfig,
  clearImageBlur,
  resolveImageEffects,
  resolveOpacity,
  resolveShadow,
  type BlurNode,
  type ResolvedShadow,
} from "@/lib/imageEffects";
import { filterKey, filterPicture } from "@/lib/imageFilters";
import { displayText } from "@/lib/textOptions";
import { fitFontSize, makeMeasure } from "@/lib/textFit";
import {
  backgroundLineBoxes,
  curveLayout,
  curveText,
  fitRadius,
  isCurved,
  resolveTextBackground,
  resolveTextBorder,
  sanitizeDash,
  type Box,
  type CurveLayout,
} from "@/lib/textEffects";
import { ensureFontLoaded, getFontsVersion, subscribeFonts } from "@/lib/fontLoader";
import { useNodeFilters } from "@/lib/useNodeFilters";

interface Props {
  element: CanvasElement;
  /** View zoom (1 = 100%): a blurred picture is cached at the resolution it is shown at. */
  zoom: number;
  /**
   * A click / tap on the element. `additive` is true with Ctrl/Cmd (or Shift)
   * held: the element is added to (or taken out of) the selection.
   */
  onSelect: (additive: boolean) => void;
  /**
   * The end of a drag or a Transformer gesture. CanvasWorkspace reads the
   * node(s) and writes the new numbers — for every selected element at once
   * when several are selected, so a group gesture is ONE undo step.
   */
  onGestureEnd: (id: string, kind: "drag" | "transform") => void;
  registerNode: (id: string, node: Konva.Node | null) => void;
}

// Props shared by every kind of node: position, drag, transform, selection,
// and the effects every element type has (opacity, drop shadow).
interface CommonKonvaProps extends ShadowProps {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  draggable: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: () => void;
  onDragEnd: () => void;
  onTransformEnd: () => void;
  ref: (node: Konva.Node | null) => void;
}

interface ShadowProps {
  shadowEnabled: boolean;
  shadowColor?: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowOpacity: number;
}

/** Konva's shadow attributes for a resolved shadow (or none). */
function shadowProps(shadow: ResolvedShadow | null): ShadowProps {
  return {
    shadowEnabled: shadow !== null,
    shadowColor: shadow?.color,
    shadowBlur: shadow?.blur ?? 0,
    shadowOffsetX: shadow?.offsetX ?? 0,
    shadowOffsetY: shadow?.offsetY ?? 0,
    shadowOpacity: shadow?.opacity ?? 1,
  };
}

// One hidden Konva.Text, used only to measure (never added to a layer). Its
// measureSize() is the canvas measureText with exactly the font string Konva
// builds for drawing, so a fit computed with it matches what is drawn.
let measuringNode: Konva.Text | null = null;

/** Auto-fit: the font size an auto-fit text is drawn with (see lib/textFit.ts). */
function useFittedFontSize(el: TextElement, shown: string, fontsVersion: number): number {
  return useMemo(() => {
    if (!el.autoFit) return el.fontSize;
    measuringNode ??= new Konva.Text({ text: "" });
    const node = measuringNode;
    node.fontFamily(el.fontFamily);
    node.fontStyle(el.fontStyle);
    node.letterSpacing(0); // added by makeMeasure, in proportion to the size
    const measure = makeMeasure((text, size) => {
      node.fontSize(size);
      return node.measureSize(text).width;
    }, el.letterSpacing ?? 0);
    return fitFontSize(
      { text: shown, width: el.width, height: el.height, fontSize: el.fontSize, lineHeight: el.lineHeight },
      measure
    );
    // fontsVersion: a font that finished loading measures differently
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.autoFit, el.fontFamily, el.fontStyle, el.fontSize, el.letterSpacing, el.width, el.height, el.lineHeight, shown, fontsVersion]);
}

/** Width of one line of text as Konva draws it (letter spacing included). */
function measureLine(el: TextElement, text: string, fontSize: number): number {
  measuringNode ??= new Konva.Text({ text: "" });
  const node = measuringNode;
  node.fontFamily(el.fontFamily);
  node.fontStyle(el.fontStyle);
  node.fontSize(fontSize);
  node.letterSpacing(0);
  const spacing = (el.letterSpacing ?? 0) * fontSize;
  return node.measureSize(text).width + spacing * Array.from(text).length;
}

/** A #rrggbb colour with an opacity, as rgba(); anything else is returned as it is. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m || alpha >= 1) return color;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** Adds a rounded rectangle to the current path (a plain one when the radius is 0). */
function roundRectPath(ctx: Konva.Context, box: Box, radius: number): void {
  const r = fitRadius(radius, box);
  const { x, y, width: w, height: h } = box;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  if (r > 0) ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  if (r > 0) ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  if (r > 0) ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  if (r > 0) ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * A text element: a Group holding the optional background box and the text
 * itself (a Konva.Text, or a Konva.TextPath on an arc for curved text). The
 * GROUP is the node that is dragged, transformed, filtered and registered for
 * the Transformer, so the box, the letters and their effects move as one.
 *
 * The background is a Shape with NO size of its own (it draws its boxes in its
 * scene function): the Transformer's frame is computed from the children's
 * sizes, so it stays exactly the text box — the padding grows outward, as in
 * Polotno — while the boxes stay clickable through their hit function.
 */
function TextNode({
  element: el,
  common,
  zoom,
  onStartEditing,
}: {
  element: TextElement;
  common: CommonKonvaProps;
  zoom: number;
  onStartEditing: () => void;
}) {
  const syncMeasuredHeight = useEditorStore((s) => s.syncMeasuredHeight);
  const isEditing = useEditorStore((s) => s.editingId === el.id);
  const fontsVersion = useSyncExternalStore(subscribeFonts, getFontsVersion, () => 0);

  // The real font, not the fallback, must be measured (see lib/fontLoader.ts).
  useEffect(() => {
    void ensureFontLoaded(el.fontFamily);
  }, [el.fontFamily]);

  const shown = displayText(el);
  const fittedSize = useFittedFontSize(el, shown, fontsVersion);
  const curved = isCurved(el);

  const curve: (CurveLayout & { text: string }) | null = useMemo(() => {
    if (!curved) return null;
    const text = curveText(shown);
    return { ...curveLayout(measureLine(el, text, fittedSize), fittedSize, el.curvePower ?? 0, el.width), text };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curved, shown, fittedSize, el.curvePower, el.width, el.fontFamily, el.fontStyle, el.letterSpacing, fontsVersion]);

  const background = resolveTextBackground(el, fittedSize, el.lineHeight);
  const border = resolveTextBorder(el);
  // Padding / corners of the box, also used by a border without a background.
  const halfLine = fittedSize * el.lineHeight * 0.5;
  const boxPadding = background?.padding ?? (el.backgroundPadding ?? 0.5) * halfLine;
  const boxRadius = background?.cornerRadius ?? (el.backgroundCornerRadius ?? 0.5) * halfLine;
  const shadow = resolveShadow(el);
  const dash = sanitizeDash(el.dash);
  const strokeOn = !!el.stroke && (el.strokeWidth ?? 0) > 0;

  const { ref: registerRef, ...groupProps } = common;
  const groupRef = useRef<Konva.Group | null>(null);
  const textRef = useRef<Konva.Text | null>(null);
  const setGroup = useCallback(
    (node: Konva.Node | null) => {
      groupRef.current = node as Konva.Group | null;
      registerRef(node);
    },
    [registerRef]
  );

  // A font that finished loading: Konva lays the text out again with its real
  // metrics (it does not do that by itself), then the layer is redrawn.
  useLayoutEffect(() => {
    const text = textRef.current as unknown as { _setTextData?: () => void } | null;
    text?._setTextData?.();
    groupRef.current?.getLayer()?.batchDraw();
  }, [fontsVersion]);

  // A text node has no fixed height: Konva lays the text out and wraps it
  // inside `width`. Copy the measured height back into the store so exported
  // JSON carries the real box (this does not create an undo step). An auto-fit
  // box is the exception: its height is the user's, and the text fits into it.
  // A curved text is as high as its arc.
  const layoutKey = [shown, el.fontSize, el.fontFamily, el.fontStyle, el.lineHeight, el.width, el.letterSpacing, el.autoFit, curve?.height, fontsVersion].join("|");
  useLayoutEffect(() => {
    if (el.autoFit) return;
    if (curve) {
      syncMeasuredHeight(el.id, curve.height);
      return;
    }
    const node = textRef.current;
    if (node) syncMeasuredHeight(el.id, node.height());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, el.id, syncMeasuredHeight]);

  // Blur / colour filter of the whole text (box included).
  const { id: _id, x: _x, y: _y, rotation: _r, zIndex: _z, ...look } = el;
  useNodeFilters(groupRef, el, zoom, JSON.stringify(look) + `|${fittedSize}|${fontsVersion}`, true);

  // The boxes behind the text: one per laid-out line, read from the Text node
  // at draw time (Konva has just laid it out), or one around the arc.
  const backgroundBoxes = (): Box[] => {
    if (!background && !border) return [];
    const p = boxPadding;
    if (curve) {
      const left = (el.width - curve.span) / 2;
      return [{ x: left - p, y: -p, width: curve.span + 2 * p, height: curve.height + 2 * p }];
    }
    const node = textRef.current as unknown as { textArr?: Array<{ width: number }>; height(): number } | null;
    if (!background) {
      // a border alone frames the whole text box
      const h = el.autoFit ? el.height : (node?.height() ?? el.height);
      return [{ x: -p, y: -p, width: el.width + 2 * p, height: h + 2 * p }];
    }
    const lines = node?.textArr ?? [];
    return backgroundLineBoxes({
      lineWidths: lines.map((l) => l.width),
      lineHeightPx: fittedSize * el.lineHeight,
      boxWidth: el.width,
      align: el.align,
      padding: background.padding,
    });
  };
  const drawBoxes = (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath();
    // one path, filled once: overlapping line boxes do not darken each other
    for (const box of backgroundBoxes()) roundRectPath(ctx, box, boxRadius);
    // fill (the background) and/or stroke (its border), from the shape's own attributes
    ctx.fillStrokeShape(shape);
  };

  // The shadow is cast by the box when there is one (like Polotno), else by the letters.
  const textShadow = shadowProps(background ? null : shadow);
  const textLook = {
    fontSize: fittedSize,
    fontFamily: el.fontFamily,
    fontStyle: el.fontStyle,
    // stored as a fraction of the font size (like Polotno); Konva wants px
    letterSpacing: (el.letterSpacing ?? 0) * fittedSize,
    textDecoration: el.textDecoration ?? "",
    fill: el.fill,
    stroke: strokeOn ? el.stroke : undefined,
    strokeWidth: strokeOn ? el.strokeWidth : 0,
    dash: strokeOn && dash ? dash : undefined,
    dashEnabled: strokeOn && !!dash,
    // the outline sits behind the letters, so it never eats into them
    fillAfterStrokeEnabled: true,
    ...textShadow,
  };

  return (
    <Group
      {...groupProps}
      ref={setGroup}
      // the group carries no shadow of its own (see textShadow / the box)
      {...shadowProps(null)}
      visible={!isEditing}
      onDblClick={onStartEditing}
      onDblTap={onStartEditing}
    >
      {(background || border) && (
        <Shape
          // the background's own opacity is in its fill colour, so the border stays solid
          fill={background ? withAlpha(background.color, background.opacity) : undefined}
          stroke={border?.color}
          strokeWidth={border?.width ?? 0}
          {...shadowProps(background ? shadow : null)}
          perfectDrawEnabled={false}
          sceneFunc={drawBoxes}
          hitFunc={drawBoxes}
        />
      )}
      {curve ? (
        <TextPath data={curve.path} text={curve.text} align="center" textBaseline="middle" {...textLook} />
      ) : (
        <Text
          ref={textRef}
          width={el.width}
          // auto-fit: a fixed box; otherwise Konva measures the height itself
          height={el.autoFit ? el.height : undefined}
          text={shown}
          lineHeight={el.lineHeight}
          align={el.align}
          {...textLook}
        />
      )}
    </Group>
  );
}

// While a picture is still loading (or failed to load) its box is drawn as a
// dashed placeholder, so the element stays visible, selectable and resizable.
const PLACEHOLDER_FILL = "#d1d5db";
const PLACEHOLDER_STROKE = "#9ca3af";
const PLACEHOLDER_ERROR_STROKE = "#ef4444";

// The Konva node is ALWAYS the same kind of node (a Shape), loaded or not.
// Swapping node types when the picture finishes loading would leave the
// Transformer holding a node that no longer exists.
function ImageNode({
  element,
  common,
  zoom,
  selectAlone,
}: {
  element: ImageElement;
  common: CommonKonvaProps;
  zoom: number;
  selectAlone: () => void;
}) {
  const { image, status } = useLoadedImage(element.src);
  const loaded = status === "loaded" && image !== null;
  const setCroppingId = useEditorStore((s) => s.setCroppingId);
  // While the crop overlay is open over this picture, the overlay shows the
  // picture (whole, with the crop window) and this node steps aside.
  const isCropping = useEditorStore((s) => s.croppingId === element.id && s.selectedId === element.id);

  // Crop is stored as fractions (0..1) of the picture; the canvas wants SOURCE
  // pixels (what Konva.Image calls its `crop`: x, y, width, height in the
  // picture's own pixels), so the fractions are scaled by naturalWidth /
  // naturalHeight. The whole picture needs no crop at all — and without one
  // the picture is drawn straight into its box, which is also how a vector
  // picture (SVG) stays sharp at any size.
  const crop = useMemo(
    () =>
      image
        ? cropToSourcePixels(
            {
              cropX: element.cropX,
              cropY: element.cropY,
              cropWidth: element.cropWidth,
              cropHeight: element.cropHeight,
            },
            image.naturalWidth,
            image.naturalHeight
          )
        : undefined,
    [image, element.cropX, element.cropY, element.cropWidth, element.cropHeight]
  );

  // Mirroring (scaleX / scaleY = -1) is done INSIDE the drawing, not with a
  // negative scale on the node. The node keeps a plain positive scale, so the
  // Transformer sees an ordinary node: when it applies a resize or a rotation
  // it rewrites the node's rotation/scale from a matrix, and for a node that
  // is already reflected it could answer with the reflection on the other
  // axis plus 180 degrees. Drawing the mirror ourselves has no such case. It
  // is also exactly "mirrored inside the same box": (x, y) stays the top-left
  // corner of what is visible, and rotation still turns around (x, y).
  const flipX = element.scaleX === -1;
  const flipY = element.scaleY === -1;
  const { width, height } = element;

  // Effects. Border, shadow and mask are drawn by drawPicture() from the
  // node's own stroke / shadow attributes; the blur is a Konva filter.
  const fx = resolveImageEffects(element);
  const mask = fx.mask;
  const cornerRadius = fx.cornerRadius; // 0 under a mask
  // A picture cut to a mask or to rounded corners is drawn through a clip.
  const clipped = mask !== null || cornerRadius > 0;
  const stroke = loaded ? fx.stroke : null;
  const shadow = loaded ? fx.shadow : null;
  const blur = loaded ? fx.blur : 0;
  const filter = loaded ? fx.filter : null;
  const colourKey = filterKey(filter);

  // Colour filter (brightness, contrast, saturation, preset): a filtered COPY
  // of the visible part of the picture, made once per change of picture, crop
  // or filter — not on every redraw. It covers the picture only, so the
  // border and the shadow keep their own colours. null = no filter, or the
  // browser would not let us read the pixels (cross-origin without CORS): the
  // picture is then drawn as it is.
  const filtered = useMemo(() => {
    if (!filter || !image) return null;
    const naturalWidth = image.naturalWidth || Math.max(1, Math.round(element.width * 2));
    const naturalHeight = image.naturalHeight || Math.max(1, Math.round(element.height * 2));
    return filterPicture(
      { image, crop: crop ?? { x: 0, y: 0, width: naturalWidth, height: naturalHeight } },
      filter
    );
    // `filter` is described by `colourKey`; `crop` by its four numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, colourKey, crop?.x, crop?.y, crop?.width, crop?.height]);

  // The node's own ref (for the blur) is composed with the shared one that
  // registers the node for the Transformer.
  const { ref: registerRef, ...commonRest } = common;
  const nodeRef = useRef<Konva.Shape | null>(null);
  const setRefs = useCallback(
    (node: Konva.Node | null) => {
      nodeRef.current = node as Konva.Shape | null;
      registerRef(node);
    },
    [registerRef]
  );

  // Konva.Filters.Blur works on a CACHED bitmap of the node (node.cache()),
  // and a cache is a snapshot: it does not follow later changes. So the blur is
  // (re)applied whenever anything that changes how the picture looks changes —
  // and switched off again (the cache dropped) when the blur goes away.
  const cropKey = crop ? `${crop.x}|${crop.y}|${crop.width}|${crop.height}` : "";
  const strokeKey = stroke ? `${stroke.color}|${stroke.width}` : "";
  const shadowKey = shadow
    ? `${shadow.color}|${shadow.blur}|${shadow.offsetX}|${shadow.offsetY}|${shadow.opacity}`
    : "";
  const dashKey = (element.dash ?? []).join(",");
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (blur > 0) {
      const deviceRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      applyImageBlur(
        node as unknown as BlurNode,
        Konva.Filters.Blur,
        blurCacheConfig(blur, { zoom, deviceRatio, width, height })
      );
    } else {
      clearImageBlur(node as unknown as BlurNode);
    }
    node.getLayer()?.batchDraw();
  }, [blur, loaded, image, filtered, zoom, width, height, cropKey, flipX, flipY, mask, cornerRadius, strokeKey, shadowKey, dashKey]);

  const startCropping = () => {
    selectAlone(); // a crop works on one picture
    setCroppingId(element.id);
  };

  return (
    <Shape
      {...commonRest}
      ref={setRefs}
      width={width}
      height={height}
      visible={!isCropping}
      // A loaded picture has no fill — except that a cut picture (masked, or
      // with rounded corners) with a shadow gets an opaque one: drawPicture()
      // casts the shadow from a silhouette of the outline, painted with it (it
      // is clipped away, only the shadow it casts is seen).
      fill={loaded ? (clipped && shadow !== null ? "#000000" : undefined) : PLACEHOLDER_FILL}
      stroke={loaded ? stroke?.color : status === "error" ? PLACEHOLDER_ERROR_STROKE : PLACEHOLDER_STROKE}
      strokeWidth={loaded ? (stroke?.width ?? 0) : 2}
      // a loaded picture's border may be dashed; the loading placeholder always is
      dash={loaded ? (stroke ? (sanitizeDash(element.dash) ?? undefined) : undefined) : [8, 6]}
      // the shadow of a picture that is still loading would be the placeholder's
      {...shadowProps(shadow)}
      // Shadow attributes are applied to every drawing call of the scene
      // function (see drawPicture); the "perfect draw" buffer would apply one
      // shadow to the finished composite instead.
      perfectDrawEnabled={false}
      onDblClick={startCropping}
      onDblTap={startCropping}
      sceneFunc={(context, shape) =>
        drawPicture(context as unknown as PictureContext, shape, {
          width,
          height,
          // the filtered copy already holds exactly the visible part
          image: loaded ? (filtered ?? image) : null,
          crop: filtered ? undefined : crop,
          flipX,
          flipY,
          mask,
          cornerRadius,
          shadow: shadow !== null,
          stroke: stroke !== null,
        })
      }
      hitFunc={(context, shape) =>
        drawPictureHitBox(context as unknown as PictureContext, shape, width, height, mask, cornerRadius)
      }
    />
  );
}

export default function ElementRenderer({ element, zoom, onSelect, onGestureEnd, registerNode }: Props) {
  const setEditingId = useEditorStore((s) => s.setEditingId);

  const nodeRef = useRef<Konva.Node | null>(null);
  const setNode = useCallback(
    (node: Konva.Node | null) => {
      nodeRef.current = node;
      registerNode(element.id, node);
    },
    [element.id, registerNode]
  );

  // Blur / colour filter of a shape (text does its own on its group, pictures in ImageNode).
  const { id: _id, x: _x, y: _y, rotation: _r, zIndex: _z, ...shapeLook } = element;
  useNodeFilters(
    nodeRef,
    element.type === "shape" ? element : { width: 0, height: 0 },
    zoom,
    element.type === "shape" ? JSON.stringify(shapeLook) : "",
    element.type === "shape"
  );

  const commonProps: CommonKonvaProps = {
    id: element.id,
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    opacity: resolveOpacity(element),
    // A picture's shadow is drawn by drawPicture (ImageNode overrides this).
    ...shadowProps(element.type === "image" ? null : resolveShadow(element)),
    draggable: true,
    onClick: (e) => onSelect(e.evt.ctrlKey || e.evt.metaKey || e.evt.shiftKey),
    onTap: () => onSelect(false),
    // Drag and transform both end in the store's updateElement(s), which
    // records the "before" state through the debounced history (one undo
    // step per gesture, for one element or a whole selection).
    onDragEnd: () => onGestureEnd(element.id, "drag"),
    onTransformEnd: () => onGestureEnd(element.id, "transform"),
    ref: setNode,
  };

  if (element.type === "text") {
    // While the <textarea> overlay is open the text is hidden (so it is not
    // drawn twice) and shown again as soon as editing ends.
    const startEditing = () => {
      onSelect(false);
      setEditingId(element.id);
    };
    return <TextNode element={element} common={commonProps} zoom={zoom} onStartEditing={startEditing} />;
  }

  if (element.type === "shape") {
    const dash = element.strokeWidth > 0 ? sanitizeDash(element.dash) : null;
    const dashProps = { dash: dash ?? undefined, dashEnabled: dash !== null };
    if (element.shapeType === "circle") {
      // Konva's Ellipse is positioned by its CENTRE. A negative offset of
      // half the size moves the node origin to the bounding box's top-left
      // corner, so (x, y) and rotation mean the same thing as for rects/text.
      return (
        <Ellipse
          {...commonProps}
          radiusX={element.width / 2}
          radiusY={element.height / 2}
          offsetX={-element.width / 2}
          offsetY={-element.height / 2}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          {...dashProps}
        />
      );
    }
    return (
      <Rect
        {...commonProps}
        width={element.width}
        height={element.height}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
        cornerRadius={element.cornerRadius}
        {...dashProps}
      />
    );
  }

  return <ImageNode element={element} common={commonProps} zoom={zoom} selectAlone={() => onSelect(false)} />;
}
