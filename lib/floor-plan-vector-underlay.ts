import { degrees, type PDFDocument, type PDFPage } from "pdf-lib";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import type { PlanVectorExportLayout } from "@/lib/floor-plan-vector-layout";

/** Pixel-only reference artwork. Names, source URLs and metadata never enter the export model. */
export type PlanVectorUnderlay = {
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
    center: { xMm: underlay.position.x * 1000, zMm: underlay.position.z * 1000 }, rotationDeg: underlay.rotationDeg, opacity: underlay.opacity };
  vectorUnderlayCorners(placement);
  return placement;
}

/** Same XZ / positive Y-rotation convention as PlanUnderlayRenderer2D. */
export function vectorUnderlayCorners(underlay: Placement) {
  const { widthMm: width, depthMm: depth, center, opacity, rotationDeg } = underlay;
  if (![width, depth, center.xMm, center.zMm, rotationDeg, opacity].every(Number.isFinite) || width <= 0 || depth <= 0 || opacity <= 0 || opacity > 1) {
    throw new Error("The reference underlay has invalid placement or opacity. Adjust it before export.");
  }
  const angle = rotationDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    .map(([x, z]) => ({ xMm: center.xMm + cos * x + sin * z, zMm: center.zMm - sin * x + cos * z }));
}

export function vectorUnderlaySvg(underlay: PlanVectorUnderlay) {
  const chunks: string[] = [];
  for (let offset = 0; offset < underlay.pngBytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...underlay.pngBytes.subarray(offset, offset + 8192)));
  }
  const data = btoa(chunks.join(""));
  return `<g id="reference-underlay" transform="translate(${underlay.center.xMm} ${underlay.center.zMm}) rotate(${-underlay.rotationDeg})" opacity="${underlay.opacity}"><image x="${-underlay.widthMm / 2}" y="${-underlay.depthMm / 2}" width="${underlay.widthMm}" height="${underlay.depthMm}" preserveAspectRatio="none" href="data:image/png;base64,${data}"/></g>`;
}

export async function drawVectorUnderlayPdf(pdf: PDFDocument, page: PDFPage, underlay: PlanVectorUnderlay, layout: PlanVectorExportLayout) {
  const image = await pdf.embedPng(underlay.pngBytes), bottomLeft = vectorUnderlayCorners(underlay)[3], pointsPerMm = 72 / 25.4;
  page.drawImage(image, { x: (layout.offsetX + bottomLeft.xMm / layout.scale) * pointsPerMm,
    y: (layout.heightMm - layout.offsetY - bottomLeft.zMm / layout.scale) * pointsPerMm,
    width: underlay.widthMm / layout.scale * pointsPerMm, height: underlay.depthMm / layout.scale * pointsPerMm,
    rotate: degrees(underlay.rotationDeg), opacity: underlay.opacity });
}
