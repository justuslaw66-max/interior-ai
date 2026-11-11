import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * The Download PDF's product list: each item's name, retailer and price, and the total. Where
 * the furnished plan is in the PDF, each product carries its plan tag, so a number on the plan
 * finds its product here.
 */

export type ExportListItem = {
  name: string;
  price: number;
  qty: number;
  retailer: string | null;
  buyUrl: string | null;
  /** The item's numbered tag on the furnished plan, where it is drawn there. */
  tag?: number;
};

export type ExportListFrame = {
  tier: "free" | "pro" | "team";
  margin: number;
  pageSize: [number, number];
  regular: PDFFont;
  bold: PDFFont;
  /** Marks a continuation page the way the first was marked (the free tier's watermark). */
  decorate: (page: PDFPage) => void;
};

const TAG_RADIUS = 5.5;
const TAG_INDENT = 16;
const MUTED = rgb(0.35, 0.35, 0.35);

function drawTag(page: PDFPage, frame: ExportListFrame, tag: number, y: number) {
  const text = String(tag), size = 7;
  const x = frame.margin + TAG_RADIUS, centreY = y + 3.5;
  page.drawCircle({ x, y: centreY, size: TAG_RADIUS, borderColor: rgb(0.13, 0.13, 0.13), borderWidth: 0.6 });
  page.drawText(text, { x: x - frame.bold.widthOfTextAtSize(text, size) / 2, y: centreY - 2.5, size, font: frame.bold, color: rgb(0.13, 0.13, 0.13) });
}

function drawItem(page: PDFPage, frame: ExportListFrame, item: ExportListItem, indent: number, startY: number) {
  let y = startY;
  const x = frame.margin + indent;
  if (item.tag) drawTag(page, frame, item.tag, y);
  page.drawText(item.name, { x, y, size: 11, font: frame.bold, color: rgb(0, 0, 0) });
  y -= 14;
  if (item.retailer) {
    page.drawText(`Retailer: ${item.retailer}`, { x, y, size: 9, font: frame.regular, color: MUTED });
    y -= 12;
  }
  const qtyText = item.qty > 1 ? `, Qty: ${item.qty}` : "";
  page.drawText(`Price: $${item.price.toFixed(2)}${qtyText}`, { x, y, size: 9, font: frame.regular, color: MUTED });
  y -= 12;
  if (frame.tier === "team" && item.buyUrl) {
    page.drawText(`Link: ${item.buyUrl}`, { x, y, size: 8, font: frame.regular, color: rgb(0.1, 0.25, 0.7) });
    y -= 12;
  }
  return y - 4;
}

/** Draws the list from `y` on `page`, continuing onto new pages, then the total and the free tier's note. */
export function drawExportItemList(pdf: PDFDocument, firstPage: PDFPage, startY: number, items: readonly ExportListItem[], frame: ExportListFrame) {
  const heading = frame.tier === "team" ? "Bill of Materials" : "Room Items";
  const indent = items.some((item) => item.tag) ? TAG_INDENT : 0;
  let page = firstPage, y = startY;
  page.drawText(heading, { x: frame.margin, y, size: 12, font: frame.bold, color: rgb(0, 0, 0) });
  y -= 16;
  for (const item of items) {
    if (y < frame.margin + 90) {
      page = pdf.addPage(frame.pageSize);
      y = page.getSize().height - frame.margin;
      frame.decorate(page);
      page.drawText(`${heading} (cont.)`, { x: frame.margin, y, size: 12, font: frame.bold });
      y -= 16;
    }
    y = drawItem(page, frame, item, indent, y);
  }
  const total = items.reduce((sum, item) => sum + item.price * (item.qty || 1), 0);
  page.drawText(`Total Budget: $${total.toFixed(2)}`, { x: frame.margin, y: Math.max(y, frame.margin + 24), size: 11, font: frame.bold, color: rgb(0.1, 0.1, 0.1) });
  if (indent) {
    page.drawText("Numbers match the tags on the furnished layout plan.", { x: frame.margin, y: Math.max(y, frame.margin + 24) - 14, size: 8, font: frame.regular, color: MUTED });
  }
  if (frame.tier === "free") {
    page.drawText("Upgrade to Pro for clean exports, multi-room packs, and client-ready presentation pages.", {
      x: frame.margin, y: frame.margin, size: 9, font: frame.regular, color: MUTED,
    });
  }
}
