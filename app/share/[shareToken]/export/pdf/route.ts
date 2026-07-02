import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { getExportCapabilities, type UserPlan } from "@/lib/export-capabilities";
import { prisma } from "@/lib/prisma";
import { legacyApiToSnapshot } from "@/lib/room-persistence";
import { resolveRoomShoppingItems, summarizeShoppingRooms, summarizeWholeHomeShopping } from "@/lib/room-shopping";
import { buildRoomSurfaceMaterialBomRows } from "@/lib/surface-material-bom";
import type { DesignItem, DesignSnapshot, PersistedPlanOpening, RoomSnapshot, SavedView, ZoneMin } from "@/lib/room-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 42;
const SQM_TO_SQFT = 10.7639;

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type RoomMetrics = {
  areaSqm: number;
  perimeterM: number;
  openingCount: number;
  doorCount: number;
  windowCount: number;
  densityLabel: string;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "interior-ai-export-pack";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMaterialCurrency(currency: string | null, value: number | null) {
  if (value === null) return "Quote";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMeasurement(value: number, unit: string) {
  return `${value.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

function formatRoomType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPolygonArea(points: NonNullable<RoomSnapshot["planPolygon"]>) {
  if (points.length < 3) return 0;
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0);
  return Math.abs(area) / 2;
}

function getPolygonPerimeter(points: NonNullable<RoomSnapshot["planPolygon"]>) {
  if (points.length < 2) return 0;
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.z - point.z);
  }, 0);
}

function getRoomOpenings(room: RoomSnapshot, rooms: RoomSnapshot[], openings: PersistedPlanOpening[]) {
  return openings.filter((opening) => {
    if (opening.roomId) return opening.roomId === room.id;
    return rooms.length === 1;
  });
}

function getRoomMetrics(room: RoomSnapshot, rooms: RoomSnapshot[], openings: PersistedPlanOpening[]): RoomMetrics {
  const width = room.geometry.width;
  const depth = room.geometry.depth;
  const polygon = room.planShape === "custom_polygon" ? room.planPolygon : null;
  const areaSqm = polygon?.length ? getPolygonArea(polygon) : width * depth;
  const perimeterM = polygon?.length ? getPolygonPerimeter(polygon) : (width + depth) * 2;
  const roomOpenings = getRoomOpenings(room, rooms, openings);
  const furnitureDensity = areaSqm > 0 ? room.items.length / areaSqm : 0;
  const densityLabel =
    furnitureDensity >= 0.35 ? "Dense" : furnitureDensity >= 0.18 ? "Furnished" : "Open";

  return {
    areaSqm,
    perimeterM,
    openingCount: roomOpenings.length,
    doorCount: roomOpenings.filter((opening) => opening.kind === "door").length,
    windowCount: roomOpenings.filter((opening) => opening.kind === "window").length,
    densityLabel,
  };
}

function applyFreeWatermark(page: PDFPage) {
  const { width, height } = page.getSize();
  page.drawText("INTERIOR AI FREE PREVIEW", {
    x: width * 0.14,
    y: height * 0.48,
    size: 34,
    color: rgb(0.78, 0.78, 0.78),
    rotate: degrees(-24),
    opacity: 0.42,
  });
}

function drawTextLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.1, 0.1, 0.1)
) {
  page.drawText(text.slice(0, 110), { x, y, size, font, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color = rgb(0.18, 0.18, 0.18)
) {
  let nextY = y;
  for (const line of wrapText(text, font, size, maxWidth)) {
    drawTextLine(page, line, x, nextY, font, size, color);
    nextY -= lineHeight;
  }
  return nextY;
}

function addPage(pdfDoc: PDFDocument, watermarked: boolean) {
  const page = pdfDoc.addPage(PAGE_SIZE);
  if (watermarked) applyFreeWatermark(page);
  return page;
}

function ensureSpace(
  pdfDoc: PDFDocument,
  page: PDFPage,
  y: number,
  needed: number,
  watermarked: boolean,
  sectionTitle?: string,
  fonts?: PdfFonts
) {
  if (y >= MARGIN + needed) return { page, y };
  const nextPage = addPage(pdfDoc, watermarked);
  let nextY = PAGE_SIZE[1] - MARGIN;
  if (sectionTitle && fonts) {
    drawTextLine(nextPage, `${sectionTitle} (continued)`, MARGIN, nextY, fonts.bold, 14);
    nextY -= 24;
  }
  return { page: nextPage, y: nextY };
}

function drawSectionHeading(page: PDFPage, title: string, y: number, fonts: PdfFonts) {
  drawTextLine(page, title, MARGIN, y, fonts.bold, 15, rgb(0.05, 0.05, 0.05));
  page.drawLine({
    start: { x: MARGIN, y: y - 8 },
    end: { x: PAGE_SIZE[0] - MARGIN, y: y - 8 },
    thickness: 1,
    color: rgb(0.86, 0.86, 0.86),
  });
  return y - 26;
}

function normalizeSavedViews(room: RoomSnapshot) {
  return (room.savedViews ?? []).filter((view): view is SavedView => {
    return Boolean(
      view &&
        typeof view.name === "string" &&
        Array.isArray(view.cameraPosition) &&
        Array.isArray(view.cameraTarget)
    );
  });
}

function getItemRows(room: RoomSnapshot) {
  return room.items
    .filter((item) => item.bundleRole !== "component")
    .map((item) => {
      const product = CATALOG_ITEMS[item.productId];
      if (!product) return null;
      const resolved = resolveCatalogVariant(product, item.variantId);
      return {
        id: item.instanceId,
        title: product.title,
        variant: resolved.finish.label || resolved.variant.label,
        footprint: `${formatMeasurement(resolved.dimsMm.w / 1000, "m")} x ${formatMeasurement(resolved.dimsMm.d / 1000, "m")}`,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  try {
    const { shareToken } = await params;
    const design = await prisma.design.findFirst({
      where: { shareToken, shareEnabled: true },
      select: {
        id: true,
        title: true,
        roomWidth: true,
        roomDepth: true,
        items: true,
        snapshot: true,
        zones: true,
        savedViews: true,
        style: true,
        budget: true,
        notes: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            plan: true,
          },
        },
      },
    });

    if (!design) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const designSnapshot: DesignSnapshot = legacyApiToSnapshot({
      id: design.id,
      title: design.title,
      roomWidth: design.roomWidth,
      roomDepth: design.roomDepth,
      items: design.items as unknown as DesignItem[],
      snapshot: design.snapshot as Parameters<typeof legacyApiToSnapshot>[0]["snapshot"],
      zones: (design.zones as unknown as ZoneMin[]) || [],
      savedViews: (design.savedViews as unknown as SavedView[]) || [],
    });

    const rooms = designSnapshot.rooms ?? [];
    const userPlan: UserPlan = design.user?.plan === "pro" ? "pro" : "free";
    const capabilities = getExportCapabilities(userPlan);
    const watermarked = capabilities.watermark;
    const pdfDoc = await PDFDocument.create();
    const fonts: PdfFonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };
    const createdDate = new Date(design.createdAt).toLocaleDateString("en-US");
    const preparedBy = design.user?.name ?? design.user?.email ?? "Interior AI";
    const planOpenings = designSnapshot.floorPlan?.openings ?? [];
    const roomSummaries = summarizeShoppingRooms(rooms, designSnapshot.activeRoomId);
    const homeSummary = summarizeWholeHomeShopping(roomSummaries);
    const shoppingRows = rooms.flatMap((room) =>
      resolveRoomShoppingItems({ items: room.items }).map((item) => ({
        ...item,
        roomName: room.name,
      }))
    );
    const surfaceMaterialBomRows = buildRoomSurfaceMaterialBomRows(rooms);
    const metricsByRoomId = new Map(
      rooms.map((room) => [room.id, getRoomMetrics(room, rooms, planOpenings)])
    );
    const totalAreaSqm = Array.from(metricsByRoomId.values()).reduce((sum, metric) => sum + metric.areaSqm, 0);
    const totalOpenings = Array.from(metricsByRoomId.values()).reduce((sum, metric) => sum + metric.openingCount, 0);

    let page = addPage(pdfDoc, watermarked);
    let y = PAGE_SIZE[1] - MARGIN;

    drawTextLine(page, design.title, MARGIN, y, fonts.bold, 25);
    y -= 32;
    drawTextLine(
      page,
      watermarked ? "Watermarked presentation PDF" : "Clean presentation PDF",
      MARGIN,
      y,
      fonts.bold,
      12,
      watermarked ? rgb(0.65, 0.38, 0.04) : rgb(0.05, 0.45, 0.25)
    );
    y -= 24;
    drawTextLine(page, `Created: ${createdDate}`, MARGIN, y, fonts.regular, 10, rgb(0.35, 0.35, 0.35));
    y -= 14;
    drawTextLine(page, `Prepared by: ${preparedBy}`, MARGIN, y, fonts.regular, 10, rgb(0.35, 0.35, 0.35));
    y -= 14;
    drawTextLine(page, `Style: ${design.style ?? "Not specified"}   Budget: ${design.budget ?? "Not specified"}`, MARGIN, y, fonts.regular, 10, rgb(0.35, 0.35, 0.35));
    y -= 32;

    y = drawSectionHeading(page, "Export Overview", y, fonts);
    const overviewRows = [
      `Rooms: ${rooms.length}`,
      `Items: ${homeSummary.itemCount}`,
      `Shoppable items: ${homeSummary.shoppableCount}`,
      `Estimated shopping total: ${formatCurrency(homeSummary.subtotal)}`,
      `Measured area: ${formatMeasurement(totalAreaSqm, "m2")} / ${formatMeasurement(totalAreaSqm * SQM_TO_SQFT, "sq ft")}`,
      `Doors and windows: ${totalOpenings}`,
      `Export access: ${watermarked ? "Free watermarked preview" : "Pro clean export"}`,
    ];
    for (const row of overviewRows) {
      drawTextLine(page, row, MARGIN, y, fonts.regular, 11);
      y -= 16;
    }
    y -= 12;

    y = drawSectionHeading(page, "Room Schedule", y, fonts);
    for (const room of roomSummaries) {
      const metric = metricsByRoomId.get(room.roomId);
      ({ page, y } = ensureSpace(pdfDoc, page, y, 28, watermarked, "Room Schedule", fonts));
      drawTextLine(page, room.roomName, MARGIN, y, fonts.bold, 10);
      drawTextLine(page, formatRoomType(room.roomType), 180, y, fonts.regular, 9, rgb(0.35, 0.35, 0.35));
      drawTextLine(page, `${metric ? formatMeasurement(metric.areaSqm, "m2") : "Area n/a"}`, 285, y, fonts.regular, 9, rgb(0.35, 0.35, 0.35));
      drawTextLine(page, `${room.itemCount} items`, 380, y, fonts.regular, 9, rgb(0.35, 0.35, 0.35));
      drawTextLine(page, formatCurrency(room.subtotal), 475, y, fonts.bold, 9);
      y -= 16;
    }
    y -= 12;

    for (const room of rooms) {
      ({ page, y } = ensureSpace(pdfDoc, page, y, 130, watermarked));
      y = drawSectionHeading(page, room.name, y, fonts);
      const metric = metricsByRoomId.get(room.id) ?? getRoomMetrics(room, rooms, planOpenings);
      const roomLines = [
        `Type: ${formatRoomType(room.roomType)}`,
        `Dimensions: ${formatMeasurement(room.geometry.width, "m")} x ${formatMeasurement(room.geometry.depth, "m")}`,
        `Area: ${formatMeasurement(metric.areaSqm, "m2")}   Perimeter: ${formatMeasurement(metric.perimeterM, "m")}`,
        `Openings: ${metric.openingCount} (${metric.doorCount} doors / ${metric.windowCount} windows)`,
        `Furniture fit: ${metric.densityLabel}`,
      ];
      for (const line of roomLines) {
        drawTextLine(page, line, MARGIN, y, fonts.regular, 10);
        y -= 14;
      }

      const itemRows = getItemRows(room);
      if (itemRows.length) {
        y -= 4;
        drawTextLine(page, "Furniture", MARGIN, y, fonts.bold, 11);
        y -= 16;
        for (const item of itemRows) {
          ({ page, y } = ensureSpace(pdfDoc, page, y, 42, watermarked, room.name, fonts));
          y = drawWrappedText(page, item.title, MARGIN, y, 270, fonts.bold, 9, 11);
          drawTextLine(page, item.variant, MARGIN + 12, y, fonts.regular, 8, rgb(0.38, 0.38, 0.38));
          drawTextLine(page, item.footprint, 430, y + 11, fonts.regular, 8, rgb(0.38, 0.38, 0.38));
          y -= 15;
        }
      }

      const views = normalizeSavedViews(room);
      if (views.length) {
        y -= 4;
        drawTextLine(page, "Saved Views", MARGIN, y, fonts.bold, 11);
        y -= 16;
        for (const view of views) {
          ({ page, y } = ensureSpace(pdfDoc, page, y, 24, watermarked, room.name, fonts));
          drawTextLine(
            page,
            `${view.name}: camera ${view.cameraPosition.map((entry) => entry.toFixed(1)).join(", ")} -> target ${view.cameraTarget.map((entry) => entry.toFixed(1)).join(", ")}`,
            MARGIN,
            y,
            fonts.regular,
            8,
            rgb(0.36, 0.36, 0.36)
          );
          y -= 12;
        }
      }
      y -= 14;
    }

    ({ page, y } = ensureSpace(pdfDoc, page, y, 120, watermarked));
    y = drawSectionHeading(page, "Shopping & Checkout Readiness", y, fonts);
    if (shoppingRows.length === 0) {
      drawTextLine(page, "No catalog products were saved in this design yet.", MARGIN, y, fonts.regular, 10);
      y -= 16;
    } else {
      for (const item of shoppingRows) {
        ({ page, y } = ensureSpace(pdfDoc, page, y, 46, watermarked, "Shopping & Checkout Readiness", fonts));
        y = drawWrappedText(page, `${item.roomName}: ${item.title}`, MARGIN, y, 330, fonts.bold, 9, 11);
        const status = item.hasValidCommerce
          ? item.commerceMode === "shopify"
            ? item.includeInCheckout ? "Cart-ready" : "Shopify item"
            : "Retailer link"
          : item.warningLabel ?? "Needs review";
        drawTextLine(page, `${status} • Qty ${item.quantity} • ${formatCurrency(item.linePrice)}`, MARGIN + 12, y, fonts.regular, 8, rgb(0.36, 0.36, 0.36));
        y -= 14;
      }
    }

    if (surfaceMaterialBomRows.length > 0) {
      ({ page, y } = ensureSpace(pdfDoc, page, y, 100, watermarked));
      y = drawSectionHeading(page, "Surface Material BOM", y, fonts);
      for (const row of surfaceMaterialBomRows) {
        ({ page, y } = ensureSpace(pdfDoc, page, y, 58, watermarked, "Surface Material BOM", fonts));
        y = drawWrappedText(page, `${row.roomName}: ${row.materialName}`, MARGIN, y, 340, fonts.bold, 9, 11);
        drawTextLine(
          page,
          `Flooring • Supplier: ${row.supplier} • ${row.materialFamily.replace(/_/g, " ")}`,
          MARGIN + 12,
          y,
          fonts.regular,
          8,
          rgb(0.36, 0.36, 0.36)
        );
        y -= 12;
        drawTextLine(
          page,
          `Room area ${formatMeasurement(row.roomAreaSqm, "m2")} • Order ${formatMeasurement(row.orderAreaSqm, "m2")} incl. 10% waste • ${row.purchaseMode.replace(/_/g, " ")}`,
          MARGIN + 12,
          y,
          fonts.regular,
          8,
          rgb(0.36, 0.36, 0.36)
        );
        y -= 12;
        drawTextLine(
          page,
          `Price / m2: ${formatMaterialCurrency(row.pricePerSqmCurrency, row.pricePerSqmAmount)} • Total estimate: ${formatMaterialCurrency(row.pricePerSqmCurrency, row.lineTotal)}`,
          MARGIN + 12,
          y,
          fonts.regular,
          8,
          rgb(0.36, 0.36, 0.36)
        );
        if (row.reviewNote) {
          y -= 12;
          y = drawWrappedText(page, row.reviewNote, MARGIN + 12, y, 440, fonts.regular, 7, 9, rgb(0.68, 0.38, 0.04));
        } else {
          y -= 14;
        }
      }
    }

    if (design.notes) {
      ({ page, y } = ensureSpace(pdfDoc, page, y, 90, watermarked));
      y = drawSectionHeading(page, "Design Notes", y, fonts);
      y = drawWrappedText(page, design.notes, MARGIN, y, PAGE_SIZE[0] - MARGIN * 2, fonts.regular, 10, 13);
    }

    ({ page, y } = ensureSpace(pdfDoc, page, y, 70, watermarked));
    y = drawSectionHeading(page, "Practical Checks", y, fonts);
    const checks = [
      totalAreaSqm > 0
        ? `Measurements captured across ${rooms.length} room${rooms.length === 1 ? "" : "s"}.`
        : "Add room dimensions before final export.",
      totalOpenings > 0
        ? `${totalOpenings} door/window opening${totalOpenings === 1 ? "" : "s"} included.`
        : "Trace openings for stronger installation and shopping notes.",
      "Review rug sizing and circulation in the shared 3D view before purchase.",
    ];
    for (const check of checks) {
      drawTextLine(page, `• ${check}`, MARGIN, y, fonts.regular, 10);
      y -= 14;
    }

    const footerPageCount = pdfDoc.getPageCount();
    pdfDoc.getPages().forEach((pdfPage, index) => {
      drawTextLine(pdfPage, "Created with Interior AI", MARGIN, 24, fonts.regular, 8, rgb(0.45, 0.45, 0.45));
      drawTextLine(pdfPage, `Page ${index + 1} of ${footerPageCount}`, PAGE_SIZE[0] - 90, 24, fonts.regular, 8, rgb(0.45, 0.45, 0.45));
    });

    const pdfBytes = await pdfDoc.save();
    const filename = `${slugify(design.title)}-presentation-pack.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "x-export-tier": userPlan,
        "x-export-watermark": watermarked ? "true" : "false",
      },
    });
  } catch (error) {
    console.error("Share PDF export error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF export failed" },
      { status: 500 }
    );
  }
}
