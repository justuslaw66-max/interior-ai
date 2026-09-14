import { concatTransformationMatrix, popGraphicsState, pushGraphicsState, type PDFDocument, type PDFPage } from "pdf-lib";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import type { PlanVectorExportLayout } from "@/lib/floor-plan-vector-layout";
import { underlayLocalToPlan, type FloorPlanReferenceDeformation } from "./floor-plan-underlay-geometry";

/** Pixel-only reference artwork. Names, source URLs and metadata never enter the export model. */
export type PlanVectorUnderlay = FloorPlanReferenceDeformation & {
  pngBytes: Uint8Array;
  widthMm: number;
  depthMm: number;
  center: { xMm: number; zMm: number };
  rotationDeg: number;
  opacity: number;
};
type Placement = Omit<PlanVectorUnderlay, "pngBytes">;

export function vectorUnderlayPlacement(underlay: FloorPlanUnderlay, floorId: string): Placement {
  if (underlay.floorId !== floorId) throw new Error("The reference underlay belongs to a different floor.");
  const placement = { widthMm: underlay.widthMeters * 1000, depthMm: underlay.depthMeters * 1000,
    center: { xMm: underlay.position.x * 1000, zMm: underlay.position.z * 1000 }, rotationDeg: underlay.rotationDeg, opacity: underlay.opacity,
    ...(underlay.skewX !== undefined ? { skewX: underlay.skewX } : {}), ...(underlay.flipY ? { flipY: true } : {}) };
  vectorUnderlayCorners(placement);
  return placement;
}

/** Same XZ / positive Y-rotation convention as PlanUnderlayRenderer2D. */
export function vectorUnderlayCorners(underlay: Placement) {
  const { widthMm: width, depthMm: depth, center, opacity, rotationDeg } = underlay;
  if (![width, depth, center.xMm, center.zMm, rotationDeg, opacity].every(Number.isFinite) || width <= 0 || depth <= 0 || opacity <= 0 || opacity > 1) {
    throw new Error("The reference underlay has invalid placement or opacity. Adjust it before export.");
  }
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    .map(([x, z]) => {
      const point = underlayLocalToPlan(underlay, x, z);
      return { xMm: center.xMm + point.x, zMm: center.zMm + point.z };
    });
}

export function vectorUnderlaySvg(underlay: PlanVectorUnderlay) {
  const chunks: string[] = [];
  for (let offset = 0; offset < underlay.pngBytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...underlay.pngBytes.subarray(offset, offset + 8192)));
  }
  const data = btoa(chunks.join(""));
  const deformation = underlay.skewX || underlay.flipY ? ` matrix(1 0 ${underlay.skewX ?? 0} ${underlay.flipY ? -1 : 1} 0 0)` : "";
  return `<g id="reference-underlay" transform="translate(${underlay.center.xMm} ${underlay.center.zMm}) rotate(${-underlay.rotationDeg})${deformation}" opacity="${underlay.opacity}"><image x="${-underlay.widthMm / 2}" y="${-underlay.depthMm / 2}" width="${underlay.widthMm}" height="${underlay.depthMm}" preserveAspectRatio="none" href="data:image/png;base64,${data}"/></g>`;
}

export async function drawVectorUnderlayPdf(pdf: PDFDocument, page: PDFPage, underlay: PlanVectorUnderlay, layout: PlanVectorExportLayout) {
  const image = await pdf.embedPng(underlay.pngBytes), corners = vectorUnderlayCorners(underlay), pointsPerMm = 72 / 25.4;
  const [topLeft, , bottomRight, bottomLeft] = corners, factor = pointsPerMm / layout.scale;
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(
    (bottomRight.xMm - bottomLeft.xMm) * factor, -(bottomRight.zMm - bottomLeft.zMm) * factor,
    (topLeft.xMm - bottomLeft.xMm) * factor, -(topLeft.zMm - bottomLeft.zMm) * factor,
    (layout.offsetX + bottomLeft.xMm / layout.scale) * pointsPerMm,
    (layout.heightMm - layout.offsetY - bottomLeft.zMm / layout.scale) * pointsPerMm
  ));
  page.drawImage(image, { x: 0, y: 0, width: 1, height: 1, opacity: underlay.opacity });
  page.pushOperators(popGraphicsState());
}
