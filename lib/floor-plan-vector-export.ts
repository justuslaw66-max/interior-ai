import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PlanDrawingPrimitive, PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";

export type PlanVectorExportOptions = { paper: "A4" | "A3"; orientation: "portrait" | "landscape"; scale: 50 | 100; title?: string };
export type PlanVectorExportLayout = { widthMm: number; heightMm: number; offsetX: number; offsetY: number; scale: number };
const POINTS_PER_MM = 72 / 25.4;
const xml = (text: string) => text.replace(/[<>&"']/g, (value) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[value] ?? value);

export function layoutFloorPlanVectorExport(drawing: PlanVectorDrawing, options: PlanVectorExportOptions): PlanVectorExportLayout {
  if (![50, 100].includes(options.scale)) throw new Error("Choose a supported fixed scale: 1:50 or 1:100.");
  if (!["A4", "A3"].includes(options.paper) || !["portrait", "landscape"].includes(options.orientation)) throw new Error("Choose paper size and orientation.");
  const paper = options.paper === "A3" ? [297, 420] : [210, 297];
  const [widthMm, heightMm] = options.orientation === "landscape" ? [...paper].reverse() : paper;
  const points = drawing.primitives.flatMap((primitive) => primitive.kind === "text" ? [primitive.point] : primitive.points);
  if (!points.length || points.some((p) => !Number.isFinite(p.xMm) || !Number.isFinite(p.zMm))) throw new Error("The plan has no valid drawing geometry.");
  const minX = Math.min(...points.map((p) => p.xMm)), minY = Math.min(...points.map((p) => p.zMm));
  const width = (Math.max(...points.map((p) => p.xMm)) - minX) / options.scale;
  const height = (Math.max(...points.map((p) => p.zMm)) - minY) / options.scale;
  if (width > widthMm - 40 || height > heightMm - 70) throw new Error("The plan will not fit at the selected scale. Choose larger paper or 1:100; geometry has not been rescaled.");
  return { widthMm, heightMm, offsetX: (widthMm - width) / 2 - minX / options.scale, offsetY: 32 + (heightMm - 70 - height) / 2 - minY / options.scale, scale: options.scale };
}

function svgPrimitive(primitive: PlanDrawingPrimitive) {
  const id = xml(primitive.id);
  if (primitive.kind === "text") return `<text id="${id}" x="${primitive.point.xMm}" y="${primitive.point.zMm}" text-anchor="middle">${xml(primitive.text)}</text>`;
  return `<path id="${id}" d="${primitive.path}" fill="${primitive.fill ? "#454545" : "none"}"/>`;
}

export function exportFloorPlanVectorSvg(drawing: PlanVectorDrawing, options: PlanVectorExportOptions) {
  const layout = layoutFloorPlanVectorExport(drawing, options);
  const title = options.title?.trim() || "Proposed plan";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthMm}mm" height="${layout.heightMm}mm" viewBox="0 0 ${layout.widthMm} ${layout.heightMm}">
<rect width="100%" height="100%" fill="white"/>
<text x="15" y="17" font-family="Helvetica,Arial,sans-serif" font-size="4">${xml(title)}</text>
<g transform="translate(${layout.offsetX} ${layout.offsetY}) scale(${1 / layout.scale})" stroke="#222" stroke-width="${0.18 * layout.scale}" font-family="Helvetica,Arial,sans-serif" font-size="${2.6 * layout.scale}" fill="#222">
${drawing.primitives.map(svgPrimitive).join("\n")}
</g><text x="15" y="${layout.heightMm - 15}" font-family="Helvetica,Arial,sans-serif" font-size="2.6">Proposed / unverified | 1:${options.scale} | dimensions in mm, centreline | print at 100%</text></svg>`;
}

/** One PDF path/text object per primitive, no raster architectural linework. */
export async function exportFloorPlanVectorPdf(drawing: PlanVectorDrawing, options: PlanVectorExportOptions): Promise<Uint8Array> {
  const layout = layoutFloorPlanVectorExport(drawing, options);
  const pdf = await PDFDocument.create();
  pdf.setProducer("Interior AI vector plan exporter");
  pdf.setCreator("Interior AI");
  pdf.setCreationDate(new Date("2000-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2000-01-01T00:00:00Z"));
  const page = pdf.addPage([layout.widthMm * POINTS_PER_MM, layout.heightMm * POINTS_PER_MM]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const texts = drawing.primitives.filter((primitive) => primitive.kind === "text");
  const title = options.title?.trim() || "Proposed plan";
  for (const text of [title, ...texts.map((primitive) => primitive.text)]) {
    try { font.encodeText(text); } catch { throw new Error("This drawing contains text unsupported by Helvetica. Choose a supported font before export; text has not been outlined or removed."); }
  }
  page.drawText(title, { x: 15 * POINTS_PER_MM, y: (layout.heightMm - 17) * POINTS_PER_MM, size: 4 * POINTS_PER_MM, font });
  for (const primitive of drawing.primitives) {
    if (primitive.kind === "path") {
      page.drawSvgPath(primitive.path, { x: layout.offsetX * POINTS_PER_MM, y: (layout.heightMm - layout.offsetY) * POINTS_PER_MM,
        scale: POINTS_PER_MM / layout.scale, borderWidth: 0.18 * layout.scale,
        borderColor: rgb(0.13, 0.13, 0.13), color: primitive.fill ? rgb(0.27, 0.27, 0.27) : undefined });
    } else {
      const size = 2.6 * POINTS_PER_MM;
      page.drawText(primitive.text, { x: (layout.offsetX + primitive.point.xMm / layout.scale) * POINTS_PER_MM - font.widthOfTextAtSize(primitive.text, size) / 2,
        y: (layout.heightMm - layout.offsetY - primitive.point.zMm / layout.scale) * POINTS_PER_MM, size, font });
    }
  }
  page.drawText(`Proposed / unverified | 1:${options.scale} | dimensions in mm, centreline | print at 100%`, { x: 15 * POINTS_PER_MM, y: 15 * POINTS_PER_MM, size: 2.6 * POINTS_PER_MM, font });
  return pdf.save({ useObjectStreams: false });
}
