import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const baseURL = "http://localhost:3000";

async function prismaWithRetry<T>(operation: () => Promise<T>, attempts = 20): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) {
        throw error;
      }
      const delayMs = Math.min(1500, 200 + i * 100);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Prisma operation failed");
}

async function isDatabaseReachable(prisma: PrismaClient): Promise<boolean> {
  try {
    await prismaWithRetry(() => prisma.$queryRaw`SELECT 1`, 3);
    return true;
  } catch {
    return false;
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=(.*)$/m);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    if (value) {
      process.env.DATABASE_URL = value;
      return value;
    }
  }

  return undefined;
}

function getPrismaClient() {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is required for e2e authenticated flow tests");
  }

  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  });
}

test.describe("Pro Upgrade Flow", () => {
  test("share export page renders printable pack", async ({ page }) => {
    const prisma = getPrismaClient();
    const shareToken = crypto.randomBytes(16).toString("hex");
    let designId: string | null = null;

    try {
      const dbReachable = await isDatabaseReachable(prisma);
      test.skip(!dbReachable, "Skipping DB-backed pro-upgrade test because database is unavailable");

      const designItem = {
        instanceId: "playwright-avery-armchair",
        productId: "armchair-real-castlery-avery-performance-armchair",
        variantId: "white_quartz",
        position: [0, 0, 0],
        qty: 1,
        includeInCheckout: true,
      };
      const savedView = {
        id: "client-view",
        name: "Client View",
        cameraPosition: [2.5, 2.2, 4.2],
        cameraTarget: [0, 0.8, 0],
      };

      const design = await prismaWithRetry(() => prisma.design.create({
        data: {
          title: "Playwright Export Pack",
          roomWidth: 4,
          roomDepth: 3,
          items: [designItem],
          zones: [],
          savedViews: [savedView],
          snapshot: {
            version: 3,
            activeRoomId: "room_living",
            rooms: [
              {
                id: "room_living",
                name: "Living Room",
                roomType: "living",
                floorLevel: 1,
                floorLabel: "1F",
                geometry: {
                  width: 4,
                  depth: 3,
                  wallThickness: 0.2,
                  height: 2.6,
                  slabThickness: 0.1,
                },
                planPosition: { x: 0, z: 0 },
                planShape: "rectangle",
                surfaceOpacity: { wall: 1, floor: 1, ceiling: 1 },
                ceilingVisible: true,
                items: [designItem],
                zones: [],
                savedViews: [savedView],
              },
            ],
            floorPlan: {
              openings: [
                {
                  id: "door-main",
                  roomId: "room_living",
                  wall: "south",
                  kind: "door",
                  offsetMm: 0,
                  widthMm: 900,
                },
              ],
            },
          },
          shareEnabled: true,
          shareToken,
        },
      }));
      designId = design.id;

      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: () => Promise.reject(new Error("Clipboard blocked in test")),
          },
        });
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: undefined,
        });
      });

      await page.goto(`${baseURL}/share/${shareToken}`);

      await expect(page.getByRole("heading", { name: "Playwright Export Pack" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Export pack", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy to edit" })).toBeVisible();
      const clientHandoff = page.getByTestId("share-client-handoff-summary");
      await expect(clientHandoff.getByText("Client Handoff")).toBeVisible();
      await expect(clientHandoff.getByRole("heading", { name: "Review-ready preview" })).toBeVisible();
      await expect(clientHandoff.getByText("Saved rooms, shopping, share, and export data are aligned.")).toBeVisible();
      await expect(clientHandoff.getByText("1 room")).toBeVisible();
      await expect(clientHandoff.getByText("12 sq m measured")).toBeVisible();
      await expect(clientHandoff.getByText("$549")).toBeVisible();
      await expect(clientHandoff.getByTestId("share-client-pdf-action")).toContainText("Download PDF");
      await expect(clientHandoff.getByTestId("share-client-shopping-action")).toContainText("Shopping preview");
      await expect(clientHandoff.getByTestId("share-client-export-action")).toContainText("Open export pack");
      await expect(page.getByRole("heading", { name: "Presentation Views" })).toBeVisible();
      const sharePresentationViews = page.getByTestId("share-presentation-views");
      await expect(sharePresentationViews.getByText("Client View")).toBeVisible();
      await expect(sharePresentationViews.getByText("Living Room • 1F")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Room List" })).toBeVisible();
      const shareRoomList = page.getByTestId("share-room-list");
      await expect(shareRoomList.getByText("Living Room")).toBeVisible();
      await expect(shareRoomList.getByText("Living", { exact: true })).toBeVisible();
      await expect(shareRoomList.getByText("4 x 3 m")).toBeVisible();
      await expect(shareRoomList.getByText("1 item")).toBeVisible();
      await expect(shareRoomList.getByText("$549")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Checkout Readiness" })).toBeVisible();
      const shareCheckoutReadiness = page.getByTestId("share-checkout-readiness");
      await expect(shareCheckoutReadiness.getByText("Cart-ready")).toBeVisible();
      await expect(shareCheckoutReadiness.getByText("Retailer links")).toBeVisible();
      await expect(shareCheckoutReadiness.getByText("Needs review")).toBeVisible();
      await expect(shareCheckoutReadiness.getByText("$549")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Practical Checks" })).toBeVisible();
      const sharePracticalChecks = page.getByTestId("share-practical-checks");
      await expect(sharePracticalChecks.getByText("Measurements")).toBeVisible();
      await expect(sharePracticalChecks.getByText("1 room measured")).toBeVisible();
      await expect(sharePracticalChecks.getByText("Openings")).toBeVisible();
      await expect(sharePracticalChecks.getByText("1 opening included")).toBeVisible();
      await expect(sharePracticalChecks.getByText("Shopping")).toBeVisible();
      await expect(sharePracticalChecks.getByText("1 of 1 ready")).toBeVisible();
      await expect(sharePracticalChecks.getByText("Presentation")).toBeVisible();
      await expect(sharePracticalChecks.getByText("1 saved view")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Shopping Preview" })).toBeVisible();
      await expect(page.getByText("Castlery Avery Performance Boucle Armchair").last()).toBeVisible();
      await expect(page.getByTestId("share-viewer")).toHaveAttribute("data-ready", "true");
      await expect(page.getByRole("heading", { name: "Saved Views" })).toBeVisible();
      await page.getByRole("button", { name: "Client View" }).click();
      await expect(page.getByRole("button", { name: "Client View" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("link", { name: "View full shopping list" })).toBeVisible();
      const shareCsvDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download shopping CSV" }).click();
      const shareCsvDownload = await shareCsvDownloadPromise;
      expect(shareCsvDownload.suggestedFilename()).toBe("playwright-export-pack-shopping-list.csv");
      const shareCsvDownloadPath = await shareCsvDownload.path();
      expect(shareCsvDownloadPath).toBeTruthy();
      const shareCsv = fs.readFileSync(shareCsvDownloadPath!, "utf8");
      expect(shareCsv).toContain("Living Room,Accent Chair,Castlery Avery Performance Boucle Armchair");
      expect(shareCsv).toContain("Retailer link,Castlery Singapore");
      await page.getByRole("button", { name: "Copy link" }).click();
      await expect(page.getByRole("dialog", { name: "Copy share link" })).toBeVisible();
      await expect(page.getByTestId("copy-fallback-value")).toHaveValue(new RegExp(`/share/${shareToken}$`));
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.getByRole("dialog", { name: "Copy share link" })).toHaveCount(0);

      await page.goto(`${baseURL}/share/${shareToken}/export`);

      await expect(page.getByRole("heading", { name: "Playwright Export Pack" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Print watermarked preview|Clean PDF \(Pro\)|Print \/ Save PDF/i }).first()).toBeVisible();
      const exportAccess = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Export Access" }),
      });
      await expect(page.getByRole("heading", { name: "Export Access" })).toBeVisible();
      await expect(exportAccess.getByText("Current plan: Free")).toBeVisible();
      await expect(exportAccess.getByText("Watermarked preview", { exact: true })).toBeVisible();
      await expect(exportAccess.getByText("Shopping CSV")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Export Overview" })).toBeVisible();
      const pdfDownloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download watermarked PDF" }).click();
      const pdfDownload = await pdfDownloadPromise;
      expect(pdfDownload.suggestedFilename()).toBe("playwright-export-pack-presentation-pack.pdf");
      const pdfDownloadPath = await pdfDownload.path();
      expect(pdfDownloadPath).toBeTruthy();
      const pdfBytes = fs.readFileSync(pdfDownloadPath!);
      expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");
      await expect(page.getByRole("heading", { name: "2D Plan Overview" })).toBeVisible();
      await expect(page.getByRole("img", { name: /1F 2D floor plan/i })).toBeVisible();
      const planPngDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download 2D PNG" }).click();
      const planPngDownload = await planPngDownloadPromise;
      expect(planPngDownload.suggestedFilename()).toBe("playwright-export-pack-1f-2d-plan.png");
      const planPngDownloadPath = await planPngDownload.path();
      expect(planPngDownloadPath).toBeTruthy();
      const planPng = fs.readFileSync(planPngDownloadPath!);
      expect(planPng.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      const planDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download 2D SVG" }).click();
      const planDownload = await planDownloadPromise;
      expect(planDownload.suggestedFilename()).toBe("playwright-export-pack-1f-2d-plan.svg");
      const planDownloadPath = await planDownload.path();
      expect(planDownloadPath).toBeTruthy();
      const planSvg = fs.readFileSync(planDownloadPath!, "utf8");
      expect(planSvg).toContain("<svg");
      expect(planSvg).toContain("Living Room");
      expect(planSvg).toContain("Interior AI Free Preview");
      await expect(page.getByRole("heading", { name: "Furniture Footprints" })).toBeVisible();
      await expect(page.getByRole("row", { name: /F1 Castlery Avery Performance Boucle Armchair Living Room/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Furniture Placement Schedule" })).toBeVisible();
      await expect(page.getByRole("row", { name: /F1 1F Living Room Castlery Avery Performance Boucle Armchair X 0 m, Z 0 m 0 deg 0.8 m x 0.8 m/i })).toBeVisible();
      await expect(page.getByText("Door").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Door & Window Schedule" })).toBeVisible();
      await expect(page.getByRole("row", { name: /Living Room Door South 0.9 m Centered/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Checkout Readiness" })).toBeVisible();
      await expect(page.getByRole("row", { name: /Living Room Castlery Avery Performance Boucle Armchair .* 1 Retailer link Castlery Singapore \$549/i })).toBeVisible();
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download shopping CSV" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("playwright-export-pack-shopping-list.csv");
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const csv = fs.readFileSync(downloadPath!, "utf8");
      expect(csv).toContain(
        "Room,Category,Item,Product ID,Variant ID,Variant,Purchase option,Qty,Status,Source,Retailer URL,Include in checkout,Unit price USD,Line total USD,Room subtotal USD,Review note"
      );
      expect(csv).toContain("Living Room,Accent Chair,Castlery Avery Performance Boucle Armchair");
      expect(csv).toContain("Accent Chair,Castlery Avery Performance Boucle Armchair,armchair-real-castlery-avery-performance-armchair");
      expect(csv).toContain("Retailer link,Castlery Singapore");
      expect(csv).toContain("Yes,549.00,549.00,549.00");
      await expect(page.getByRole("heading", { name: "Presentation View Schedule" })).toBeVisible();
      await expect(page.getByRole("row", { name: /Client View Living Room 2.5, 2.2, 4.2 0.0, 0.8, 0.0 Default/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Room Schedule" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Practical Checks" })).toBeVisible();
      await expect(page.getByText(/Measurements:/)).toBeVisible();
    } finally {
      if (designId) {
        const cleanupId = designId;
        await prismaWithRetry(() => prisma.design.deleteMany({ where: { id: cleanupId } }));
      }
      await prisma.$disconnect();
    }
  });
});
