import type { Font } from "@pdf-lib/fontkit";
import type { PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { vectorTextMetrics } from "@/lib/floor-plan-vector-font";
import { vectorUnderlayCorners, type PlanVectorUnderlay } from "@/lib/floor-plan-vector-underlay";

export type PlanVectorExportOptions = { paper: "A4" | "A3"; orientation: "portrait" | "landscape"; scale: 50 | 100; title?: string };
export type PlanVectorExportLayout = { widthMm: number; heightMm: number; offsetX: number; offsetY: number; scale: number };

/** Include visible text bounds, curve control hulls and half the stroke width in fixed-scale page fitting. */
export function layoutFloorPlanVectorExport(drawing: PlanVectorDrawing, options: PlanVectorExportOptions, font: Font, underlay?: PlanVectorUnderlay): PlanVectorExportLayout {
  if (![50, 100].includes(options.scale)) throw new Error("Choose a supported fixed scale: 1:50 or 1:100.");
  if (!["A4", "A3"].includes(options.paper) || !["portrait", "landscape"].includes(options.orientation)) throw new Error("Choose paper size and orientation.");
  const paper = options.paper === "A3" ? [297, 420] : [210, 297];
  const [widthMm, heightMm] = options.orientation === "landscape" ? [...paper].reverse() : paper;
  const points = drawing.primitives.flatMap((primitive) => {
    if (primitive.kind === "path") {
      const padding = 0.09 * options.scale;
      return primitive.points.flatMap((point) => [{ xMm: point.xMm - padding, zMm: point.zMm - padding }, { xMm: point.xMm + padding, zMm: point.zMm + padding }]);
    }
    const metrics = vectorTextMetrics(font, primitive.text, 2.6 * options.scale);
    const x = primitive.point.xMm - metrics.advance / 2, z = primitive.point.zMm;
    return [{ xMm: x + metrics.left, zMm: z + metrics.top }, { xMm: x + metrics.right, zMm: z + metrics.bottom }];
  });
  if (underlay) points.push(...vectorUnderlayCorners(underlay));
  if (!points.length || points.some((point) => !Number.isFinite(point.xMm) || !Number.isFinite(point.zMm))) throw new Error("The plan has no valid drawing geometry.");
  const minX = Math.min(...points.map((point) => point.xMm)), minY = Math.min(...points.map((point) => point.zMm));
  const width = (Math.max(...points.map((point) => point.xMm)) - minX) / options.scale;
  const height = (Math.max(...points.map((point) => point.zMm)) - minY) / options.scale;
  if (width > widthMm - 40 || height > heightMm - 70) throw new Error("The drawing, including text, will not fit at the selected scale. Choose larger paper or 1:100; geometry has not been rescaled.");
  const title = vectorTextMetrics(font, options.title?.trim() || "Proposed plan", 4);
  if (title.right > widthMm - 30 || title.left < -5) throw new Error("The title will not fit on this page. Shorten it or choose larger paper.");
  return { widthMm, heightMm, offsetX: (widthMm - width) / 2 - minX / options.scale,
    offsetY: 32 + (heightMm - 70 - height) / 2 - minY / options.scale, scale: options.scale };
}
