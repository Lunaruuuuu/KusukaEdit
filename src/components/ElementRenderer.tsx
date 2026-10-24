"use client";

import React, { useCallback, useLayoutEffect, useRef } from "react";
import { Rect, Ellipse, Text } from "react-konva";
import Konva from "konva";
import type { CanvasElement } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";

interface Props {
  element: CanvasElement;
  onSelect: () => void;
  registerNode: (id: string, node: Konva.Node | null) => void;
}

const MIN_TEXT_WIDTH = 20;
const MIN_SHAPE_SIZE = 5;

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

  const commonProps = {
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
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);

      if (element.type === "text") {
        // Text only resizes horizontally; its height follows the wrapped text.
        updateElement(element.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(MIN_TEXT_WIDTH, element.width * scaleX),
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

  // Image elements are kept in the document but not drawn yet (out of scope for the MVP).
  return null;
}
