import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PdfItem = {
  name: string;
  price: number;
  qty?: number;
  retailer?: string | null;
  buyUrl?: string | null;
};

type PdfPayload = {
  title?: string;
  items?: PdfItem[];
  images?: string[];
  requestedTier?: "free" | "pro" | "team";
};

type ExportTier = "free" | "pro" | "team";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const PAGE_SIZE: [number, number] = [612, 792];

const normalizeTierFromPlan = (plan: string | null | undefined): ExportTier => {
  if (!plan) return "free";
  if (plan === "pro") return "pro";
  if (plan === "team" || plan === "business" || plan === "enterprise") return "team";
  return "free";
};

const maxImagesByTier: Record<ExportTier, number> = {
  free: 1,
  pro: 4,
  team: 6,
};

const applyFreeWatermark = (page: import("pdf-lib").PDFPage) => {
  const { width, height } = page.getSize();
  page.drawText("FREE EXPORT • INTERIOR AI", {
    x: width * 0.18,
    y: height * 0.5,
    size: 34,
    color: rgb(0.85, 0.85, 0.85),
    rotate: degrees(-24),
    opacity: 0.45,
  });
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string) => {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const decodeBase64Image = (dataUrl: string) => {
  const match = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/i);
  if (!match) return null;
  const type = match[1].toLowerCase();
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) return null;
  return { buffer, type } as const;
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`export:${session.user.id}`, 6, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many export requests" }, { status: 429 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    const exportTier = normalizeTierFromPlan(dbUser?.plan);

    const body = (await req.json().catch(() => ({}))) as PdfPayload;
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : exportTier === "free"
        ? "Interior AI Room Design - Free Preview"
        : "Interior AI Room Design";

    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw
      .filter((item): item is PdfItem => Boolean(item) && typeof item.name === "string" && typeof item.price === "number")
      .map((item) => ({
        name: item.name,
        price: item.price,
        qty: typeof item.qty === "number" && item.qty > 0 ? Math.min(99, Math.floor(item.qty)) : 1,
        retailer: typeof item.retailer === "string" ? item.retailer : null,
        buyUrl: typeof item.buyUrl === "string" ? item.buyUrl : null,
      }));

    const images = Array.isArray(body.images) ? body.images.slice(0, maxImagesByTier[exportTier]) : [];
    const total = items.reduce((sum, item) => sum + item.price * (item.qty || 1), 0);

    const pdfDoc = await PDFDocument.create();
    const margin = 40;
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const dateText = new Date().toLocaleDateString();

    if (exportTier !== "free") {
      const coverPage = pdfDoc.addPage(PAGE_SIZE);
      const { width: coverWidth, height: coverHeight } = coverPage.getSize();
      let coverY = coverHeight - margin;

      coverPage.drawText(title, {
        x: margin,
        y: coverY - 8,
        size: 24,
        font: fontBold,
        color: rgb(0.05, 0.05, 0.05),
      });

      coverY -= 40;
      coverPage.drawText(
        exportTier === "team" ? "Team proposal pack" : "Pro presentation pack",
        {
          x: margin,
          y: coverY,
          size: 12,
          font: fontRegular,
          color: rgb(0.25, 0.25, 0.25),
        }
      );

      coverY -= 18;
      coverPage.drawText(`Generated on ${dateText}`, {
        x: margin,
        y: coverY,
        size: 10,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });

      coverY -= 24;
      coverPage.drawText(`Items: ${items.length} • Budget: $${total.toFixed(2)}`, {
        x: margin,
        y: coverY,
        size: 10,
        font: fontRegular,
        color: rgb(0.35, 0.35, 0.35),
      });

      if (images.length) {
        const decoded = decodeBase64Image(images[0]);
        if (decoded) {
          const embedPromise =
            decoded.type === "jpeg"
              ? pdfDoc.embedJpg(decoded.buffer)
              : pdfDoc.embedPng(decoded.buffer);
          const embedded = await withTimeout(embedPromise, 5000, "Cover image embed");
          const imageWidth = coverWidth - margin * 2;
          const imageHeight = 300;
          coverPage.drawImage(embedded, {
            x: margin,
            y: Math.max(margin + 30, coverY - imageHeight - 12),
            width: imageWidth,
            height: imageHeight,
          });
        }
      }
    }

    let page = pdfDoc.addPage(PAGE_SIZE);
    const { width, height } = page.getSize();
    let y = height - margin;

    if (exportTier === "free") {
      applyFreeWatermark(page);
    }

    page.drawText(title, {
      x: margin,
      y: y - 8,
      size: 20,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    y -= 32;
    page.drawText(`Generated by Interior AI • ${dateText} • Tier: ${exportTier.toUpperCase()}`, {
      x: margin,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    y -= 24;

    if (images.length) {
      const imageWidth = width - margin * 2;
      const imageHeight = exportTier === "free" ? 96 : 120;
      for (const dataUrl of images) {
        const decoded = decodeBase64Image(dataUrl);
        if (!decoded) continue;
        const embedPromise =
          decoded.type === "jpeg"
            ? pdfDoc.embedJpg(decoded.buffer)
            : pdfDoc.embedPng(decoded.buffer);
        const embedded = await withTimeout(embedPromise, 5000, "Image embed");
        page.drawImage(embedded, {
          x: margin,
          y: y - imageHeight,
          width: imageWidth,
          height: imageHeight,
        });
        y -= imageHeight + 16;
        if (y < margin + 200) break;
      }
    }

    page.drawText(exportTier === "team" ? "Bill of Materials" : "Room Items", {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 16;

    for (const item of items) {
      const qty = item.qty || 1;

      if (y < margin + 90) {
        page = pdfDoc.addPage(PAGE_SIZE);
        y = page.getSize().height - margin;
        if (exportTier === "free") {
          applyFreeWatermark(page);
        }
        page.drawText(exportTier === "team" ? "Bill of Materials (cont.)" : "Room Items (cont.)", {
          x: margin,
          y,
          size: 12,
          font: fontBold,
        });
        y -= 16;
      }

      page.drawText(item.name, {
        x: margin,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= 14;

      if (item.retailer) {
        page.drawText(`Retailer: ${item.retailer}`, {
          x: margin,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.35, 0.35, 0.35),
        });
        y -= 12;
      }

      const qtyText = qty > 1 ? `, Qty: ${qty}` : "";
      page.drawText(`Price: $${item.price.toFixed(2)}${qtyText}`, {
        x: margin,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.35, 0.35, 0.35),
      });
      y -= 12;

      if (exportTier === "team" && item.buyUrl) {
        page.drawText(`Link: ${item.buyUrl}`, {
          x: margin,
          y,
          size: 8,
          font: fontRegular,
          color: rgb(0.1, 0.25, 0.7),
        });
        y -= 12;
      }

      y -= 4;
    }

    page.drawText(`Total Budget: $${total.toFixed(2)}`, {
      x: margin,
      y: Math.max(y, margin + 24),
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    if (exportTier === "free") {
      page.drawText("Upgrade to Pro for clean exports, multi-room packs, and branded presentation pages.", {
        x: margin,
        y: margin,
        size: 9,
        font: fontRegular,
        color: rgb(0.35, 0.35, 0.35),
      });
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `room-design-${exportTier}-${Date.now()}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "x-export-tier": exportTier,
        "x-export-watermark": exportTier === "free" ? "true" : "false",
      },
    });
  } catch (err) {
    console.error("PDF export error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF generation failed" },
      { status: 500 }
    );
  }
}
