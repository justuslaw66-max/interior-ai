import { PDFDocument, rgb } from "pdf-lib";
import type { PlanDrawingPrimitive, PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { layoutFloorPlanVectorExport, type PlanVectorExportOptions } from "@/lib/floor-plan-vector-layout";
import { loadPlanVectorFont, vectorFontDataUrl, PLAN_VECTOR_FONT_FAMILY, PLAN_VECTOR_FONT_FEATURES } from "@/lib/floor-plan-vector-font";
import { drawVectorUnderlayPdf, vectorUnderlaySvg, type PlanVectorUnderlay } from "@/lib/floor-plan-vector-underlay";
import { vectorInkPath } from "@/lib/floor-plan-vector-ink";

export type { PlanVectorExportOptions, PlanVectorExportLayout } from "@/lib/floor-plan-vector-layout";
export { layoutFloorPlanVectorExport } from "@/lib/floor-plan-vector-layout";
export type PlanVectorExportResources = { fontBytes?: Uint8Array; underlay?: PlanVectorUnderlay };
const UNDERLAY_NOTE = "Reference underlay included; source marks are historical.";
const POINTS_PER_MM = 72 / 25.4;
const xml = (text: string) => text.replace(/[<>&"']/g, (value) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[value] ?? value);

function svgPrimitive(primitive: PlanDrawingPrimitive, scale: number) {
  const id = xml(primitive.id);
  if (primitive.kind === "text") return `<text id="${id}" x="${primitive.point.xMm}" y="${primitive.point.zMm}" stroke="none" text-anchor="middle">${xml(primitive.text)}</text>`;
  return `<path id="${id}" d="${vectorInkPath(primitive, scale)}" fill="${primitive.fill ? "#454545" : "none"}"${primitive.role === "wall" ? ' stroke="none"' : ""}/>`;
}

export async function exportFloorPlanVectorSvg(drawing: PlanVectorDrawing, options: PlanVectorExportOptions, resources: PlanVectorExportResources = {}) {
  const font = await loadPlanVectorFont(resources.fontBytes);
  const layout = layoutFloorPlanVectorExport(drawing, options, font.font, resources.underlay);
  const title = options.title?.trim() || "Proposed plan";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthMm}mm" height="${layout.heightMm}mm" viewBox="0 0 ${layout.widthMm} ${layout.heightMm}" font-family="${PLAN_VECTOR_FONT_FAMILY},Arial,sans-serif" style="font-kerning:none;font-variant-ligatures:none">
<defs><style>@font-face{font-family:'${PLAN_VECTOR_FONT_FAMILY}';src:url('${vectorFontDataUrl(font.bytes)}') format('truetype');font-weight:400;font-style:normal}</style></defs>
<rect width="100%" height="100%" fill="white"/>
<text x="15" y="17" font-size="4">${xml(title)}</text>
<g transform="translate(${layout.offsetX} ${layout.offsetY}) scale(${1 / layout.scale})" stroke="#222" stroke-width="${0.18 * layout.scale}" font-size="${2.6 * layout.scale}" fill="#222">
${resources.underlay ? vectorUnderlaySvg(resources.underlay) : ""}
${drawing.primitives.map((primitive) => svgPrimitive(primitive, layout.scale)).join("\n")}
</g><text x="15" y="${layout.heightMm - 15}" font-size="2.6">Proposed / unverified | 1:${options.scale} | dimensions in mm, centreline | print at 100%</text>
${resources.underlay ? `<text x="15" y="${layout.heightMm - 9}" font-size="2.6">${UNDERLAY_NOTE}</text>` : ""}</svg>`;
}

/** One PDF path/text object per primitive, no raster architectural linework. */
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
  const title = options.title?.trim() || "Proposed plan";
  page.drawText(title, { x: 15 * POINTS_PER_MM, y: (layout.heightMm - 17) * POINTS_PER_MM, size: 4 * POINTS_PER_MM, font });
  if (resources.underlay) await drawVectorUnderlayPdf(pdf, page, resources.underlay, layout);
  for (const primitive of drawing.primitives) {
    if (primitive.kind === "path") {
      page.drawSvgPath(vectorInkPath(primitive, layout.scale), { x: layout.offsetX * POINTS_PER_MM, y: (layout.heightMm - layout.offsetY) * POINTS_PER_MM,
        scale: POINTS_PER_MM / layout.scale, borderWidth: primitive.role === "wall" ? 0 : 0.18 * layout.scale,
        borderColor: primitive.role === "wall" ? undefined : rgb(0.13, 0.13, 0.13), color: primitive.fill ? rgb(0.27, 0.27, 0.27) : undefined });
    } else {
      const size = 2.6 * POINTS_PER_MM;
      page.drawText(primitive.text, { x: (layout.offsetX + primitive.point.xMm / layout.scale) * POINTS_PER_MM - font.widthOfTextAtSize(primitive.text, size) / 2,
        y: (layout.heightMm - layout.offsetY - primitive.point.zMm / layout.scale) * POINTS_PER_MM, size, font });
    }
  }
  page.drawText(`Proposed / unverified | 1:${options.scale} | dimensions in mm, centreline | print at 100%`, { x: 15 * POINTS_PER_MM, y: 15 * POINTS_PER_MM, size: 2.6 * POINTS_PER_MM, font });
  if (resources.underlay) page.drawText(UNDERLAY_NOTE, { x: 15 * POINTS_PER_MM, y: 9 * POINTS_PER_MM, size: 2.6 * POINTS_PER_MM, font });
  return pdf.save({ useObjectStreams: false });
}
