import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PlanDrawingPrimitive, PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { layoutFloorPlanVectorExport, type PlanVectorExportLayout, type PlanVectorExportOptions } from "@/lib/floor-plan-vector-layout";
import { drawFurnitureSchedulePages } from "@/lib/floor-plan-vector-schedule";
import { loadPlanVectorFont, vectorFontDataUrl, PLAN_VECTOR_FONT_FAMILY, PLAN_VECTOR_FONT_FEATURES } from "@/lib/floor-plan-vector-font";
import { drawVectorUnderlayPdf, vectorUnderlaySvg, type PlanVectorUnderlay } from "@/lib/floor-plan-vector-underlay";
import { vectorInkPath } from "@/lib/floor-plan-vector-ink";

export type { PlanVectorExportOptions, PlanVectorExportLayout } from "@/lib/floor-plan-vector-layout";
export { layoutFloorPlanVectorExport } from "@/lib/floor-plan-vector-layout";
export type PlanVectorExportResources = { fontBytes?: Uint8Array; underlay?: PlanVectorUnderlay };
const UNDERLAY_NOTE = "Reference underlay included; source marks are historical.";
const POINTS_PER_MM = 72 / 25.4;
const xml = (text: string) => text.replace(/[<>&"']/g, (value) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[value] ?? value);

/** Traced source artwork in its own grey (0 black - 255 white), where the trace gave one. */
const svgTone = (tone: number | undefined) => (tone === undefined ? null : `rgb(${tone},${tone},${tone})`);
const pdfTone = (tone: number | undefined, fallback: ReturnType<typeof rgb>) => (tone === undefined ? fallback : rgb(tone / 255, tone / 255, tone / 255));

/** A furniture tag: its number in a paper-white circle, sized in paper millimetres. */
const TAG_RADIUS_MM = 2.1, TAG_TEXT_MM = 2.2;

function svgTag(primitive: Extract<PlanDrawingPrimitive, { kind: "text" }>, scale: number) {
  const { xMm: x, zMm: z } = primitive.point, id = xml(primitive.id);
  return `<g id="${id}"><circle cx="${x}" cy="${z}" r="${TAG_RADIUS_MM * scale}" fill="white" stroke-width="${0.18 * scale}"/>`
    + `<text x="${x}" y="${z + 0.36 * TAG_TEXT_MM * scale}" font-size="${TAG_TEXT_MM * scale}" stroke="none" text-anchor="middle">${xml(primitive.text)}</text></g>`;
}

function svgStroke(primitive: Extract<PlanDrawingPrimitive, { kind: "path" }>, scale: number) {
  if (primitive.role === "wall" || primitive.role === "source_fill" || primitive.paperStrokeMm === 0) return ' stroke="none"';
  const dash = primitive.paperDashMm ? ` stroke-dasharray="${primitive.paperDashMm.map((mm) => mm * scale).join(" ")}"` : "";
  if (primitive.paperStrokeMm !== undefined) return ` stroke-width="${primitive.paperStrokeMm * scale}"${dash}`;
  return primitive.strokeWidth !== undefined ? ` stroke-width="${primitive.strokeWidth}"${dash}` : dash;
}

function svgPrimitive(primitive: PlanDrawingPrimitive, scale: number) {
  const id = xml(primitive.id);
  if (primitive.kind === "text" && primitive.role === "furniture-tag") return svgTag(primitive, scale);
  if (primitive.kind === "text") return `<text id="${id}" x="${primitive.point.xMm}" y="${primitive.point.zMm}" stroke="none" text-anchor="middle">${xml(primitive.text)}</text>`;
  const tone = svgTone(primitive.tone);
  const toned = tone && !primitive.fill ? ` stroke="${tone}"` : "";
  const fill = primitive.paperFill ? "white" : primitive.fill ? tone ?? "#454545" : "none";
  return `<path id="${id}" d="${vectorInkPath(primitive, scale)}" fill="${fill}"${svgStroke(primitive, scale)}${toned}/>`;
}

export async function exportFloorPlanVectorSvg(drawing: PlanVectorDrawing, options: PlanVectorExportOptions, resources: PlanVectorExportResources = {}) {
  const font = await loadPlanVectorFont(resources.fontBytes);
  const layout = layoutFloorPlanVectorExport(drawing, options, font.font, resources.underlay);
  const title = options.title?.trim() || (drawing.coordinateSpace === "source_pixels" ? "Source artwork" : "Proposed plan");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthMm}mm" height="${layout.heightMm}mm" viewBox="0 0 ${layout.widthMm} ${layout.heightMm}" font-family="${PLAN_VECTOR_FONT_FAMILY},Arial,sans-serif" style="font-kerning:none;font-variant-ligatures:none">
<defs><style>@font-face{font-family:'${PLAN_VECTOR_FONT_FAMILY}';src:url('${vectorFontDataUrl(font.bytes)}') format('truetype');font-weight:400;font-style:normal}</style></defs>
<rect width="100%" height="100%" fill="white"/>
<text x="15" y="17" font-size="4">${xml(title)}</text>
<g transform="translate(${layout.offsetX} ${layout.offsetY}) scale(${1 / layout.scale})" stroke="#222" stroke-width="${0.18 * layout.scale}" font-size="${2.6 * layout.scale}" fill="#222">
${resources.underlay ? vectorUnderlaySvg(resources.underlay) : ""}
${drawing.primitives.map((primitive) => svgPrimitive(primitive, layout.scale)).join("\n")}
</g><text x="15" y="${layout.heightMm - 15}" font-size="2.6">${drawing.coordinateSpace === "source_pixels" ? "Source artwork | uncalibrated image coordinates | no physical scale" : `Proposed / unverified | 1:${options.scale} | dimensions in mm, centreline | print at 100%`}</text>
${resources.underlay ? `<text x="15" y="${layout.heightMm - 9}" font-size="2.6">${UNDERLAY_NOTE}</text>` : ""}</svg>`;
}

/** One PDF path/text object per primitive, no raster architectural linework. */
function drawPdfPath(page: PDFPage, primitive: Extract<PlanDrawingPrimitive, { kind: "path" }>, layout: PlanVectorExportLayout) {
  const unstroked = primitive.role === "wall" || primitive.role === "source_fill" || primitive.paperStrokeMm === 0;
  const width = primitive.paperStrokeMm !== undefined ? primitive.paperStrokeMm * layout.scale : primitive.strokeWidth ?? 0.18 * layout.scale;
  page.drawSvgPath(vectorInkPath(primitive, layout.scale), { x: layout.offsetX * POINTS_PER_MM, y: (layout.heightMm - layout.offsetY) * POINTS_PER_MM,
    scale: POINTS_PER_MM / layout.scale,
    borderWidth: unstroked ? 0 : width,
    borderColor: unstroked ? undefined : pdfTone(primitive.tone, rgb(0.13, 0.13, 0.13)),
    borderDashArray: primitive.paperDashMm?.map((mm) => mm * layout.scale),
    color: primitive.paperFill ? rgb(1, 1, 1) : primitive.fill ? pdfTone(primitive.tone, rgb(0.27, 0.27, 0.27)) : undefined });
}

function drawPdfTag(page: PDFPage, font: PDFFont, primitive: Extract<PlanDrawingPrimitive, { kind: "text" }>, layout: PlanVectorExportLayout) {
  const x = (layout.offsetX + primitive.point.xMm / layout.scale) * POINTS_PER_MM;
  const y = (layout.heightMm - layout.offsetY - primitive.point.zMm / layout.scale) * POINTS_PER_MM;
  const size = TAG_TEXT_MM * POINTS_PER_MM;
  page.drawCircle({ x, y, size: TAG_RADIUS_MM * POINTS_PER_MM, color: rgb(1, 1, 1), borderColor: rgb(0.13, 0.13, 0.13), borderWidth: 0.18 * POINTS_PER_MM });
  page.drawText(primitive.text, { x: x - font.widthOfTextAtSize(primitive.text, size) / 2, y: y - 0.36 * size, size, font });
}

/** Every primitive as its own PDF path or text, in drawing order, on a page laid out for the drawing. */
export function drawPlanVectorPrimitives(page: PDFPage, font: PDFFont, primitives: readonly PlanDrawingPrimitive[], layout: PlanVectorExportLayout) {
  for (const primitive of primitives) {
    if (primitive.kind === "path") {
      drawPdfPath(page, primitive, layout);
    } else if (primitive.role === "furniture-tag") {
      drawPdfTag(page, font, primitive, layout);
    } else {
      const size = 2.6 * POINTS_PER_MM;
      page.drawText(primitive.text, { x: (layout.offsetX + primitive.point.xMm / layout.scale) * POINTS_PER_MM - font.widthOfTextAtSize(primitive.text, size) / 2,
        y: (layout.heightMm - layout.offsetY - primitive.point.zMm / layout.scale) * POINTS_PER_MM, size, font });
    }
  }
}

export async function exportFloorPlanVectorPdf(drawing: PlanVectorDrawing, options: PlanVectorExportOptions, resources: PlanVectorExportResources = {}): Promise<Uint8Array> {
  const fontSource = await loadPlanVectorFont(resources.fontBytes);
  const layout = layoutFloorPlanVectorExport(drawing, options, fontSource.font, resources.underlay);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontSource.fontkit);
  pdf.setProducer("Interior AI vector plan exporter");
  pdf.setCreator("Interior AI");
  pdf.setCreationDate(new Date("2000-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2000-01-01T00:00:00Z"));
  const page = pdf.addPage([layout.widthMm * POINTS_PER_MM, layout.heightMm * POINTS_PER_MM]);
  const font = await pdf.embedFont(fontSource.bytes, { subset: false, customName: "LiberationSans", features: PLAN_VECTOR_FONT_FEATURES });
  const title = options.title?.trim() || (drawing.coordinateSpace === "source_pixels" ? "Source artwork" : "Proposed plan");
  page.drawText(title, { x: 15 * POINTS_PER_MM, y: (layout.heightMm - 17) * POINTS_PER_MM, size: 4 * POINTS_PER_MM, font });
  if (resources.underlay) await drawVectorUnderlayPdf(pdf, page, resources.underlay, layout);
  drawPlanVectorPrimitives(page, font, drawing.primitives, layout);
  page.drawText(`${drawing.coordinateSpace === "source_pixels" ? "Source artwork | uncalibrated image coordinates | no physical scale" : `Proposed / unverified | 1:${options.scale} | dimensions in mm, centreline | print at 100%`}`, { x: 15 * POINTS_PER_MM, y: 15 * POINTS_PER_MM, size: 2.6 * POINTS_PER_MM, font });
  if (resources.underlay) page.drawText(UNDERLAY_NOTE, { x: 15 * POINTS_PER_MM, y: 9 * POINTS_PER_MM, size: 2.6 * POINTS_PER_MM, font });
  if (drawing.schedule?.length) drawFurnitureSchedulePages(pdf, font, drawing.schedule, { widthMm: layout.widthMm, heightMm: layout.heightMm, title });
  return pdf.save({ useObjectStreams: false });
}
