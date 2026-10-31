/**
 * The ink a room click reads (floor-plan-review-room-fill.ts): the page's clean drawing where it has one, else the
 * page picture, at most ROOM_MASK_MAX_PIXELS, with the walls already saved drawn in so a found room stops at them.
 * The drawing and the picture are drawn in the browser; the rest is plain arithmetic, testable anywhere.
 */
import type { FloorPlanAnnotationV2 } from "@/lib/floor-plan-document-v2";
import { sourceDrawingInk, sourceDrawingSvgPath } from "@/lib/floor-plan-source-drawing";

export const ROOM_MASK_MAX_PIXELS = 2_500_000;
/** A pixel darker than this grey (over white paper) is ink. */
export const ROOM_MASK_INK_LEVEL = 160;

export type InkMask = { ink: Uint8Array; widthPx: number; heightPx: number; scale: number };
type Point = { x: number; y: number };

/** The mask's size for a page: the page's own, shrunk to at most ROOM_MASK_MAX_PIXELS. */
export function roomMaskSize(pageWidthPx: number, pageHeightPx: number) {
  const scale = Math.min(1, Math.sqrt(ROOM_MASK_MAX_PIXELS / Math.max(1, pageWidthPx * pageHeightPx)));
  return { widthPx: Math.max(1, Math.round(pageWidthPx * scale)), heightPx: Math.max(1, Math.round(pageHeightPx * scale)), scale };
}

/** Ink from RGBA pixels: darker than ROOM_MASK_INK_LEVEL once laid over white. */
export function inkFromPixels(rgba: ArrayLike<number>, widthPx: number, heightPx: number): Uint8Array {
  const ink = new Uint8Array(widthPx * heightPx);
  for (let i = 0; i < ink.length; i += 1) {
    const alpha = rgba[4 * i + 3] / 255;
    const grey = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2];
    ink[i] = 255 - alpha * (255 - grey) < ROOM_MASK_INK_LEVEL ? 1 : 0;
  }
  return ink;
}

/** A copy of the ink with line segments (mask px) drawn in, `widthPx` wide. */
export function withSegments(mask: InkMask, segments: Array<[Point, Point]>, widthPx: number): InkMask {
  const ink = mask.ink.slice();
  const half = Math.max(0, Math.floor(widthPx / 2));
  const stamp = (x: number, y: number) => {
    for (let dy = -half; dy <= half; dy += 1) {
      for (let dx = -half; dx <= half; dx += 1) {
        const px = Math.round(x) + dx, py = Math.round(y) + dy;
        if (px >= 0 && py >= 0 && px < mask.widthPx && py < mask.heightPx) ink[py * mask.widthPx + px] = 1;
      }
    }
  };
  for (const [a, b] of segments) {
    const steps = Math.max(1, Math.ceil(2 * Math.hypot(b.x - a.x, b.y - a.y)));
    for (let k = 0; k <= steps; k += 1) stamp(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
  }
  return { ...mask, ink };
}

type Canvas2D = { getContext(kind: "2d"): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null };

function canvas(widthPx: number, heightPx: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(widthPx, heightPx);
  const element = document.createElement("canvas");
  element.width = widthPx;
  element.height = heightPx;
  return element;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function paint(pageWidthPx: number, pageHeightPx: number, draw: (context: Context2D, scale: number) => void): InkMask | null {
  const size = roomMaskSize(pageWidthPx, pageHeightPx);
  const context = canvas(size.widthPx, size.heightPx).getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.widthPx, size.heightPx);
  context.scale(size.scale, size.scale);
  draw(context, size.scale);
  const pixels = context.getImageData(0, 0, size.widthPx, size.heightPx).data;
  return { ink: inkFromPixels(pixels, size.widthPx, size.heightPx), ...size };
}

/**
 * The clean drawing's ink, drawn as the review draws it (filled shapes filled, lines at their own width and grey). On a
 * page drawn smaller than its own size every shape is also outlined a mask pixel wide, so no thin line fades out.
 */
export function drawingInk(annotations: FloorPlanAnnotationV2[], pageWidthPx: number, pageHeightPx: number): InkMask | null {
  return paint(pageWidthPx, pageHeightPx, (context, scale) => {
    for (const annotation of annotations) {
      const geometry = annotation.geometry;
      if (geometry.kind !== "source_drawing" || geometry.command === "text") continue;
      const path = new Path2D(sourceDrawingSvgPath(geometry));
      context.fillStyle = context.strokeStyle = sourceDrawingInk(geometry, "#333333");
      if (geometry.fill) context.fill(path);
      context.lineWidth = Math.max(geometry.fill ? 0 : geometry.strokeWidthPx ?? 1, 1 / scale);
      if (!geometry.fill || scale < 1) context.stroke(path);
    }
  });
}

/** The page picture's ink. */
export function pictureInk(picture: CanvasImageSource, pageWidthPx: number, pageHeightPx: number): InkMask | null {
  return paint(pageWidthPx, pageHeightPx, (context) => context.drawImage(picture, 0, 0, pageWidthPx, pageHeightPx));
}
