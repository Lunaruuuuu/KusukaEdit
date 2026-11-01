"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Rect, Ellipse, Text, Shape } from "react-konva";
import Konva from "konva";
import type { CanvasElement, ImageElement } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";
import { useLoadedImage } from "@/lib/useLoadedImage";
import { drawPicture, drawPictureHitBox, type PictureContext } from "@/lib/drawPicture";

interface Props {
  element: CanvasElement;
  onSelect: () => void;
  registerNode: (id: string, node: Konva.Node | null) => void;
}

// Props shared by every kind of node: position, drag, transform, selection.
interface CommonKonvaProps {
  id: string;
  x: number;
  y: number;
  rotation: number;
  draggable: boolean;
  onClick: () => void;
  onTap: () => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  ref: (node: Konva.Node | null) => void;
}

const MIN_TEXT_WIDTH = 20;
const MIN_SHAPE_SIZE = 5;

// While a picture is still loading (or failed to load) its box is drawn as a
// dashed placeholder, so the element stays visible, selectable and resizable.
const PLACEHOLDER_FILL = "#d1d5db";
const PLACEHOLDER_STROKE = "#9ca3af";
const PLACEHOLDER_ERROR_STROKE = "#ef4444";

// The Konva node is ALWAYS the same kind of node (a Shape), loaded or not.
// Swapping node types when the picture finishes loading would leave the
// Transformer holding a node that no longer exists.
function ImageNode({ element, common }: { element: ImageElement; common: CommonKonvaProps }) {
  const { image, status } = useLoadedImage(element.src);
  const loaded = status === "loaded" && image !== null;

  // Crop is stored as fractions of the picture; Konva wants source pixels.
  // The whole picture needs no crop at all — and without one Konva draws the
  // picture straight into its box, which is also how a vector picture (SVG)
  // stays sharp at any size.
  const crop = useMemo(() => {
    if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return undefined;
    const whole =
      element.cropX === 0 && element.cropY === 0 && element.cropWidth === 1 && element.cropHeight === 1;
    if (whole) return undefined;
    return {
      x: element.cropX * image.naturalWidth,
      y: element.cropY * image.naturalHeight,
      width: element.cropWidth * image.naturalWidth,
      height: element.cropHeight * image.naturalHeight,
    };
  }, [image, element.cropX, element.cropY, element.cropWidth, element.cropHeight]);

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

  return (
    <Shape
      {...common}
      width={width}
      height={height}
      fill={loaded ? undefined : PLACEHOLDER_FILL}
      stroke={loaded ? undefined : status === "error" ? PLACEHOLDER_ERROR_STROKE : PLACEHOLDER_STROKE}
      strokeWidth={loaded ? 0 : 2}
      dash={loaded ? undefined : [8, 6]}
      sceneFunc={(context, shape) =>
        drawPicture(context as unknown as PictureContext, shape, {
          width,
          height,
          image: loaded ? image : null,
          crop,
          flipX,
          flipY,
        })
      }
      hitFunc={(context, shape) => drawPictureHitBox(context as unknown as PictureContext, shape, width, height)}
    />
  );
}

export default function ElementRenderer({ element, onSelect, registerNode }: Props) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const syncMeasuredHeight = useEditorStore((s) => s.syncMeasuredHeight);
  const setEditingId = useEditorStore((s) => s.setEditingId);
  // While the <textarea> overlay is open the Konva node is hidden (so the
  // text isn't drawn twice) and shown again as soon as editing ends.
  const isEditing = useEditorStore((s) => s.editingId === element.id);

  const nodeRef = useRef<Konva.Node | null>(null);
  const setNode = useCallback(
    (node: Konva.Node | null) => {
      nodeRef.current = node;
      registerNode(element.id, node);
    },
    [element.id, registerNode]
  );

  // A text node has no fixed height: Konva lays the text out and wraps it
  // inside `width`. Copy the measured height back into the store so exported
  // JSON carries the real box (this does not create an undo step).
  const textLayoutKey =
    element.type === "text"
      ? [element.text, element.fontSize, element.fontFamily, element.fontStyle, element.lineHeight, element.width].join("|")
      : "";
  useLayoutEffect(() => {
    if (element.type !== "text") return;
    const node = nodeRef.current;
    if (node) syncMeasuredHeight(element.id, node.height());
  }, [textLayoutKey, element.id, element.type, syncMeasuredHeight]);

  const commonProps: CommonKonvaProps = {
    id: element.id,
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      updateElement(element.id, { x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      // Konva scales the node instead of changing width/height directly.
      // We read the scale, bake it into width/height, then reset scale
      // back to 1 so future transforms start from a clean state.
      //
      // (A mirrored picture is mirrored inside its drawing, so its node never
      // has a negative scale; Math.abs is just a guard.)
      const scaleX = Math.abs(node.scaleX());
      const scaleY = Math.abs(node.scaleY());
      node.scaleX(1);
      node.scaleY(1);

      if (element.type === "text") {
        // Text only resizes horizontally; its height follows the wrapped text.
        updateElement(element.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(MIN_TEXT_WIDTH, element.width * scaleX),
          // The width is now one the user chose: exact, with no import tolerance.
          ...(element.widthTolerance ? { widthTolerance: 0 } : {}),
        });
        return;
      }

      if (element.type === "image") {
        // Pictures are only scaled proportionally (the Transformer offers just
        // the corner handles). The new height is derived from the new width
        // and the box's own aspect ratio, so the picture can never drift out
        // of proportion through rounding.
        const width = Math.max(MIN_SHAPE_SIZE, element.width * scaleX);
        const aspect = element.width > 0 ? element.height / element.width : 1;
        updateElement(element.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width,
          height: width * aspect,
        });
        return;
      }

      updateElement(element.id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width: Math.max(MIN_SHAPE_SIZE, element.width * scaleX),
        height: Math.max(MIN_SHAPE_SIZE, element.height * scaleY),
      });
    },
    ref: setNode,
  };

  if (element.type === "text") {
    const startEditing = () => {
      onSelect();
      setEditingId(element.id);
    };
    return (
      <Text
        {...commonProps}
        width={element.width}
        text={element.text}
        fontSize={element.fontSize}
        fontFamily={element.fontFamily}
        fontStyle={element.fontStyle}
        lineHeight={element.lineHeight}
        fill={element.fill}
        align={element.align}
        visible={!isEditing}
        onDblClick={startEditing}
        onDblTap={startEditing}
      />
    );
  }

  if (element.type === "shape") {
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
      />
    );
  }

  // Drag and transform both end in updateElement(), which records the
  // "before" state through the store's debounced history (one undo step per gesture).
  return <ImageNode element={element} common={commonProps} />;
}
