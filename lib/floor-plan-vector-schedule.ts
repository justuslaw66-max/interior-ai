import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import type { FurnitureScheduleEntry } from "@/lib/floor-plan-vector-furniture";

/**
 * The furniture schedule: one row per tag on the plan, on its own page after the drawing,
 * the way an ID's layout plan lists its loose furniture.
 */

const POINTS_PER_MM = 72 / 25.4;
const MARGIN_MM = 15;
const ROW_MM = 6;
const TEXT_MM = 2.8;
const INK = rgb(0.13, 0.13, 0.13);

type PageFrame = { widthMm: number; heightMm: number; title: string };
type Column = { heading: string; widthShare: number; cell: (entry: FurnitureScheduleEntry) => string };

const COLUMNS: Column[] = [
  { heading: "No.", widthShare: 0.07, cell: (entry) => String(entry.tag) },
  { heading: "Item", widthShare: 0.43, cell: (entry) => (entry.variant ? `${entry.name}, ${entry.variant}` : entry.name) },
  { heading: "Size W × D × H (mm)", widthShare: 0.22, cell: ({ sizeMm }) => `${Math.round(sizeMm.w)} × ${Math.round(sizeMm.d)} × ${Math.round(sizeMm.h)}` },
  { heading: "Qty", widthShare: 0.07, cell: (entry) => String(entry.quantity) },
  { heading: "Room", widthShare: 0.21, cell: (entry) => entry.rooms.join(", ") },
];

/** Cuts text to fit a column, ending in an ellipsis. */
function fitted(font: PDFFont, text: string, size: number, widthPt: number) {
  if (font.widthOfTextAtSize(text, size) <= widthPt) return text;
  let end = text.length;
  while (end > 1 && font.widthOfTextAtSize(`${text.slice(0, end).trimEnd()}…`, size) > widthPt) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

function drawRow(page: PDFPage, font: PDFFont, cells: string[], yMm: number, frame: PageFrame) {
  const size = TEXT_MM * POINTS_PER_MM;
  const usable = frame.widthMm - MARGIN_MM * 2;
  let xMm = MARGIN_MM;
  COLUMNS.forEach((column, index) => {
    const widthMm = usable * column.widthShare;
    const text = fitted(font, cells[index], size, (widthMm - 2) * POINTS_PER_MM);
    page.drawText(text, { x: xMm * POINTS_PER_MM, y: (frame.heightMm - yMm) * POINTS_PER_MM, size, font, color: INK });
    xMm += widthMm;
  });
}

function rule(page: PDFPage, yMm: number, frame: PageFrame, thicknessMm: number) {
  const y = (frame.heightMm - yMm) * POINTS_PER_MM;
  page.drawLine({ start: { x: MARGIN_MM * POINTS_PER_MM, y }, end: { x: (frame.widthMm - MARGIN_MM) * POINTS_PER_MM, y }, thickness: thicknessMm * POINTS_PER_MM, color: INK });
}

function startPage(pdf: PDFDocument, font: PDFFont, frame: PageFrame, part: number) {
  const page = pdf.addPage([frame.widthMm * POINTS_PER_MM, frame.heightMm * POINTS_PER_MM]);
  const heading = part > 1 ? `${frame.title}: furniture schedule (continued)` : `${frame.title}: furniture schedule`;
  page.drawText(heading, { x: MARGIN_MM * POINTS_PER_MM, y: (frame.heightMm - 17) * POINTS_PER_MM, size: 4 * POINTS_PER_MM, font, color: INK });
  drawRow(page, font, COLUMNS.map((column) => column.heading), 28, frame);
  rule(page, 29.5, frame, 0.25);
  return page;
}

export function drawFurnitureSchedulePages(pdf: PDFDocument, font: PDFFont, schedule: readonly FurnitureScheduleEntry[], frame: PageFrame) {
  const rowsPerPage = Math.max(1, Math.floor((frame.heightMm - 29.5 - MARGIN_MM - 6) / ROW_MM));
  for (let start = 0, part = 1; start < schedule.length; start += rowsPerPage, part += 1) {
    const page = startPage(pdf, font, frame, part);
    schedule.slice(start, start + rowsPerPage).forEach((entry, index) => {
      const yMm = 29.5 + ROW_MM * (index + 1) - 1.6;
      drawRow(page, font, COLUMNS.map((column) => column.cell(entry)), yMm, frame);
      rule(page, yMm + 1.6, frame, 0.1);
    });
    page.drawText("Tags on the plan key to this list. Sizes are each product's footprint and height, in mm.", {
      x: MARGIN_MM * POINTS_PER_MM, y: (MARGIN_MM - 6) * POINTS_PER_MM, size: 2.4 * POINTS_PER_MM, font, color: INK,
    });
  }
}
