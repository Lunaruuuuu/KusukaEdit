"use client";

import React from "react";
import { Rect, Circle, Text } from "react-konva";
import Konva from "konva";
import { CanvasElement } from "@/types/editor";
import { useEditorStore } from "@/store/useEditorStore";

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  registerNode: (id: string, node: Konva.Node | null) => void;
}

export default function ElementRenderer({
  element,
  isSelected,
  onSelect,
  registerNode,
}: Props) {
  const updateElement = useEditorStore((s) => s.updateElement);

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
      const node = e.target as Konva.Shape;
      // Konva scales the node instead of changing width/height directly.
      // We read the scale, bake it into width/height, then reset scale
      // back to 1 so future transforms start from a clean state.
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);

      updateElement(element.id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width: Math.max(5, node.width() * scaleX),
        height: Math.max(5, node.height() * scaleY),
      });
    },
    ref: (node: Konva.Node | null) => registerNode(element.id, node),
  };

  if (element.type === "text") {
    return (
      <Text
        {...commonProps}
        width={element.width}
        height={element.height}
        text={element.text}
        fontSize={element.fontSize}
        fontFamily={element.fontFamily}
        fontStyle={element.fontStyle ?? "normal"}
        fill={element.fill}
        align={element.align}
        onDblClick={() => {
          const next = window.prompt("Edit text", element.text);
          if (next !== null) updateElement(element.id, { text: next });
        }}
        onDblTap={() => {
          const next = window.prompt("Edit text", element.text);
          if (next !== null) updateElement(element.id, { text: next });
        }}
      />
    );
  }

  if (element.type === "shape") {
    if (element.shapeType === "circle") {
      return (
        <Circle
          {...commonProps}
          radius={element.width / 2}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          // Circle in Konva uses radius, but our schema stores width/height
          // so resizing the transformer needs a width/height-shaped node.
          width={element.width}
          height={element.height}
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
        cornerRadius={4}
      />
    );
  }

  // Image elements are out of scope for the MVP.
  return null;
}
