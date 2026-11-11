import type { Font } from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import type { PlanDrawingPrimitive, PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { drawPlanVectorPrimitives } from "@/lib/floor-plan-vector-export";
import { loadPlanVectorFont, PLAN_VECTOR_FONT_FEATURES } from "@/lib/floor-plan-vector-font";
import { layoutFloorPlanVectorExport, type PlanVectorExportLayout, type PlanVectorExportOptions } from "@/lib/floor-plan-vector-layout";
import { drawFurnitureSchedulePages } from "@/lib/floor-plan-vector-schedule";
import type { DecodedPlan, DecodedPlanSheet } from "@/lib/download-plan-wire";

/**
 * The Download PDF's furnished plan pages: each sheet at the largest true scale that fits A4,
 * then A3 (1:50, 1:100, then 1:200), and the furniture schedule its tags key to. Labels are set
 * in the vector exporter's font; a name it cannot set falls back to the room's type.
 */

const POINTS_PER_MM = 72 / 25.4;
const PAGE_CANDIDATES: Array<Omit<PlanVectorExportOptions, "orientation" | "title">> = [
  { paper: "A4", scale: 50 }, { paper: "A4", scale: 100 }, { paper: "A3", scale: 100 }, { paper: "A4", scale: 200 }, { paper: "A3", scale: 200 },
];
const SCHEDULE_FRAME = { widthMm: 210, heightMm: 297, title: "Furnished layout plan" };

export type DownloadPlanPagesResult = { sheetsDrawn: number; sheetsSkipped: number };

const settable = (font: Font, text: string) =>
  !/[\r\n]/.test(text) && [...text].every((character) => font.hasGlyphForCodePoint(character.codePointAt(0) ?? 0));

/** Labels the font can set, each name it cannot replaced by its fallback, or left off. */
function settableDrawing(sheet: DecodedPlanSheet, font: Font): { drawing: PlanVectorDrawing; dropped: number } {
  let dropped = 0;
  const primitives = sheet.drawing.primitives.flatMap((primitive): PlanDrawingPrimitive[] => {
    if (primitive.kind !== "text" || settable(font, primitive.text)) return [primitive];
    const fallback = sheet.fallbacks.get(primitive.id);
    if (fallback && settable(font, fallback)) return [{ ...primitive, text: fallback }];
    dropped += 1;
    return [];
  });
  return { drawing: { ...sheet.drawing, primitives }, dropped };
}

function fittedLayout(drawing: PlanVectorDrawing, title: string, font: Font): PlanVectorExportLayout | null {
  for (const candidate of PAGE_CANDIDATES) {
    for (const orientation of ["landscape", "portrait"] as const) {
      try {
        return layoutFloorPlanVectorExport(drawing, { ...candidate, orientation, title }, font);
      } catch {
        // Too large for this paper at this scale: try the next.
      }
    }
  }
  return null;
}

function footer(layout: PlanVectorExportLayout, notDrawn: number, dropped: number) {
  const parts = [`1:${layout.scale} on ${layout.widthMm > 300 || layout.heightMm > 300 ? "A3" : "A4"}`, "print at 100%", "proposed layout, not for construction"];
  if (notDrawn) parts.push(`${notDrawn} ${notDrawn === 1 ? "detail" : "details"} not drawn`);
  if (dropped) parts.push(`${dropped} ${dropped === 1 ? "label" : "labels"} left off: characters the plan font lacks`);
  return parts.join(" | ");
}

function drawSheet(pdf: PDFDocument, font: PDFFont, layout: PlanVectorExportLayout, drawing: PlanVectorDrawing, title: string, footerText: string) {
  const page = pdf.addPage([layout.widthMm * POINTS_PER_MM, layout.heightMm * POINTS_PER_MM]);
  page.drawText(title, { x: 15 * POINTS_PER_MM, y: (layout.heightMm - 17) * POINTS_PER_MM, size: 4 * POINTS_PER_MM, font });
  drawPlanVectorPrimitives(page, font, drawing.primitives, layout);
  page.drawText(footerText, { x: 15 * POINTS_PER_MM, y: 15 * POINTS_PER_MM, size: 2.6 * POINTS_PER_MM, font });
  return page;
}

/** Appends the plan sheets and their schedule; `decorate` marks each new page (the free tier's watermark). */
export async function drawDownloadPlanPages(pdf: PDFDocument, plan: DecodedPlan, fontBytes: Uint8Array,
  decorate: (page: PDFPage) => void = () => {}): Promise<DownloadPlanPagesResult> {
  if (!plan.sheets.length) return { sheetsDrawn: 0, sheetsSkipped: 0 };
  const fontSource = await loadPlanVectorFont(fontBytes);
  pdf.registerFontkit(fontSource.fontkit);
  const font = await pdf.embedFont(fontSource.bytes, { subset: false, customName: "LiberationSans", features: PLAN_VECTOR_FONT_FEATURES });
  const result = { sheetsDrawn: 0, sheetsSkipped: 0 };
  for (const sheet of plan.sheets) {
    const title = settable(fontSource.font, sheet.title) ? sheet.title : SCHEDULE_FRAME.title;
    const { drawing, dropped } = settableDrawing(sheet, fontSource.font);
    const layout = drawing.primitives.length ? fittedLayout(drawing, title, fontSource.font) : null;
    if (!layout) { result.sheetsSkipped += 1; continue; }
    decorate(drawSheet(pdf, font, layout, drawing, title, footer(layout, result.sheetsDrawn ? 0 : plan.notDrawn, dropped)));
    result.sheetsDrawn += 1;
  }
  if (result.sheetsDrawn && plan.schedule.length) {
    const before = pdf.getPageCount();
    drawFurnitureSchedulePages(pdf, font, plan.schedule, SCHEDULE_FRAME);
    for (let index = before; index < pdf.getPageCount(); index += 1) decorate(pdf.getPage(index));
  }
  return result;
}
