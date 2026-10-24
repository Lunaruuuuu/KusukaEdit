import React from "react";
import type { CanvasDocument } from "@/types/editor";

// A static SVG rendering of a document, used for the template cards.
//
// It is drawn from the already-converted native document (after the adapter),
// so the thumbnail is always in sync with the template file — nothing to
// regenerate — and for a Polotno template it also shows the result of the
// conversion. Text is rendered through <foreignObject> so the browser wraps
// it the way the canvas does (approximately; thumbnails are small).
export default function TemplateThumbnail({ document: doc }: { document: CanvasDocument }) {
  const { canvas, elements } = doc;
  const ordered = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <svg
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <rect width={canvas.width} height={canvas.height} fill={canvas.backgroundColor} />
      {ordered.map((el) => {
        const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation})`;

        if (el.type === "shape") {
          return (
            <g key={el.id} transform={transform}>
              {el.shapeType === "circle" ? (
                <ellipse
                  cx={el.width / 2}
                  cy={el.height / 2}
                  rx={el.width / 2}
                  ry={el.height / 2}
                  fill={el.fill}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                />
              ) : (
                <rect
                  width={el.width}
                  height={el.height}
                  rx={el.cornerRadius}
                  fill={el.fill}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                />
              )}
            </g>
          );
        }

        if (el.type === "text") {
          return (
            <g key={el.id} transform={transform}>
              <foreignObject
                width={el.width}
                height={Math.max(el.height, el.fontSize * el.lineHeight)}
                style={{ overflow: "visible" }}
              >
                <div
                  style={{
                    width: el.width,
                    fontSize: el.fontSize,
                    fontFamily: el.fontFamily,
                    fontWeight: el.fontStyle.includes("bold") ? "bold" : "normal",
                    fontStyle: el.fontStyle.includes("italic") ? "italic" : "normal",
                    lineHeight: el.lineHeight,
                    textAlign: el.align,
                    color: el.fill,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                  }}
                >
                  {el.text}
                </div>
              </foreignObject>
            </g>
          );
        }

        return null; // images are not drawn by the editor yet
      })}
    </svg>
  );
}
