import React, { memo, useId } from "react";
import type { ImageElement, Page } from "@/types/editor";
import { resolveImageEffects } from "@/lib/imageEffects";
import { filterToMatrix } from "@/lib/imageFilters";

// A static SVG rendering of ONE page, used for the template cards and for the
// page strip under the canvas.
//
// It is drawn from an already-converted native page (after the adapter), so
// the thumbnail is always in sync with the document — nothing to regenerate —
// and for a Polotno template it also shows the result of the conversion. Text
// is rendered through <foreignObject> so the browser wraps it the way the
// canvas does (approximately; thumbnails are small).
//
// Pictures show their crop, mirroring, mask / rounded corners, border, blur and
// colour filter. (The colour filter is the very same 4x5 matrix the canvas
// uses, handed to <feColorMatrix>.) The drop shadow is left out: it is
// invisible at thumbnail size.

type ThumbnailPage = Pick<Page, "canvas" | "elements">;

function PictureThumb({ el, uid }: { el: ImageElement; uid: string }) {
  const fx = resolveImageEffects(el);
  const clipId = `${uid}-clip-${el.id}`;
  const filterId = `${uid}-filter-${el.id}`;
  const { width: w, height: h } = el;

  // The outline, used both as the clip and as the border.
  const outline = (paint: { fill?: string; stroke?: string; strokeWidth?: number }) => {
    if (fx.mask === "circle") {
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...paint} />;
    }
    if (fx.mask === "triangle") {
      return <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...paint} />;
    }
    const r = Math.min(fx.cornerRadius, w / 2, h / 2);
    return <rect width={w} height={h} rx={r} ry={r} {...paint} />;
  };

  const mirror =
    `translate(${el.scaleX === -1 ? w : 0} ${el.scaleY === -1 ? h : 0}) ` + `scale(${el.scaleX} ${el.scaleY})`;
  const hasFilter = fx.filter !== null || fx.blur > 0;

  return (
    <>
      <defs>
        <clipPath id={clipId}>{outline({})}</clipPath>
        {hasFilter && (
          <filter id={filterId} colorInterpolationFilters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
            {fx.filter && <feColorMatrix type="matrix" values={filterToMatrix(fx.filter).join(" ")} />}
            {fx.blur > 0 && <feGaussianBlur stdDeviation={fx.blur} />}
          </filter>
        )}
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={w} height={h} fill="#d1d5db" />
        <g transform={mirror} filter={hasFilter ? `url(#${filterId})` : undefined}>
          {/* A nested <svg> whose viewBox is the crop rectangle (in fractions of
              the picture) shows exactly the cropped part, stretched over the
              element's box the same way the canvas draws it. */}
          <svg
            width={w}
            height={h}
            viewBox={`${el.cropX} ${el.cropY} ${el.cropWidth} ${el.cropHeight}`}
            preserveAspectRatio="none"
          >
            <image href={el.src} width={1} height={1} preserveAspectRatio="none" />
          </svg>
        </g>
      </g>
      {fx.stroke && outline({ fill: "none", stroke: fx.stroke.color, strokeWidth: fx.stroke.width })}
    </>
  );
}

function TemplateThumbnail({ page }: { page: ThumbnailPage }) {
  const { canvas, elements } = page;
  const ordered = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  // Several thumbnails live on one page: their clip/filter ids must not collide.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

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

        return (
          <g key={el.id} transform={transform}>
            <PictureThumb el={el} uid={uid} />
          </g>
        );
      })}
    </svg>
  );
}

// Pages are replaced, never edited in place, so an unchanged page keeps its
// identity and its thumbnail is not redrawn when another page is edited.
export default memo(TemplateThumbnail);
