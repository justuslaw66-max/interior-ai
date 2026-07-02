import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const PANEL_FLOORING_ID = "test-only-published-flooring";
const PANEL_FLOORING_NAME = "Test Only Published Flooring";
const EXPORT_FLOORING_ID = "goodrich-lvt-wood-look-draft";

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  for (const envPath of [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")]) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=(.*)$/m);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    if (!value) continue;
    process.env.DATABASE_URL = value;
    return value;
  }

  return undefined;
}

function getPrismaClient() {
  const url = resolveDatabaseUrl();
  if (!url) return null;

  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  });
}

async function isDatabaseReachable(prisma: PrismaClient) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function dismissBlockingDialogs(page: import("@playwright/test").Page) {
  await page.getByText("Upgrade to Pro").first().waitFor({ state: "visible", timeout: 3000 }).catch(() => null);
  const closeButtons = page.getByRole("button", { name: /^(Close|Maybe later)$/ });
  const count = await closeButtons.count();
  for (let index = 0; index < count; index += 1) {
    const button = closeButtons.nth(index);
    if (!(await button.isVisible({ timeout: 1000 }).catch(() => false))) continue;
    await button.click();
    await expect(page.getByText("Upgrade to Pro")).toBeHidden({ timeout: 5000 }).catch(() => null);
    return;
  }
}

test.describe("Flooring surface materials", () => {
  test("designer can apply draft flooring and keep it after reload", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible({ timeout: 30000 });
    await dismissBlockingDialogs(page);

    await page.getByTestId("plan-change-floor-finish").click();
    const floorPanel = page.getByTestId("room-surfaces-floor-panel");
    await expect(floorPanel).toBeVisible({ timeout: 30000 });
    await expect(floorPanel).not.toHaveAttribute("data-floor-material-id", PANEL_FLOORING_ID);

    const materialCard = page.getByTestId(`surface-floor-material-${PANEL_FLOORING_ID}`);
    await expect(materialCard).toBeVisible({ timeout: 30000 });
    await materialCard.getByRole("button", { name: "Apply room" }).click();

    await expect(floorPanel).toHaveAttribute("data-floor-material-id", PANEL_FLOORING_ID);
    await expect(floorPanel).toContainText(PANEL_FLOORING_NAME);

    await page.getByRole("button", { name: "2D Plan" }).click();
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible();
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible();

    await page.getByTestId("save-design").click();
    await expect(page.getByTestId("save-status")).toHaveAttribute(
      "data-status",
      /saved|pending|saving/,
      { timeout: 30000 }
    );

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible({ timeout: 30000 });
    await dismissBlockingDialogs(page);
    await page.getByTestId("plan-change-floor-finish").click();
    await expect(page.getByTestId("room-surfaces-floor-panel")).toHaveAttribute(
      "data-floor-material-id",
      PANEL_FLOORING_ID,
      { timeout: 30000 }
    );
  });

  test("share export includes flooring area BOM row", async ({ page }) => {
    test.setTimeout(120000);

    const prisma = getPrismaClient();
    test.skip(!prisma, "Skipping DB-backed flooring export test because DATABASE_URL is unavailable");

    const shareToken = `flooring-${crypto.randomBytes(8).toString("hex")}`;
    let designId: string | null = null;

    try {
      test.skip(
        !(await isDatabaseReachable(prisma)),
        "Skipping DB-backed flooring export test because database is unavailable"
      );

      const snapshot = {
        version: 3,
        activeRoomId: "room_flooring",
        rooms: [
          {
            id: "room_flooring",
            name: "Flooring Test Room",
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
            surfaces: {
              floorMaterialId: EXPORT_FLOORING_ID,
              floorRotationDeg: 0,
              floorPattern: "straight",
              floorScale: 1,
            },
            surfaceFinishes: {
              floorMaterialId: EXPORT_FLOORING_ID,
              floorRotationDeg: 0,
              floorPattern: "straight",
              floorScale: 1,
            },
            surfaceOpacity: { wall: 1, floor: 1, ceiling: 1 },
            ceilingVisible: true,
            items: [],
            zones: [],
            savedViews: [],
          },
        ],
      };

      const design = await prisma.design.create({
        data: {
          title: "Playwright Flooring Export",
          roomWidth: 4,
          roomDepth: 3,
          items: [],
          zones: [],
          savedViews: [],
          snapshot,
          shareEnabled: true,
          shareToken,
        },
      });
      designId = design.id;

      await page.goto(`/share/${shareToken}/export`);
      await expect(page.getByRole("heading", { name: "Surface Material BOM" })).toBeVisible({
        timeout: 30000,
      });
      const bomRow = page.getByRole("row", {
        name: new RegExp(`Flooring Test Room.*${EXPORT_FLOORING_ID}`),
      });
      await expect(bomRow).toContainText("Goodrich LVT Wood Look - Draft Import");
      await expect(bomRow).toContainText(`Flooring · ${EXPORT_FLOORING_ID}`);
      await expect(bomRow.getByRole("cell", { name: "12 m2" })).toBeVisible();
      await expect(bomRow).toContainText("13.2 m2");
      await expect(bomRow).toContainText("10% waste");
    } finally {
      if (designId) {
        await prisma.design.delete({ where: { id: designId } }).catch(() => {});
      }
      await prisma.$disconnect().catch(() => {});
    }
  });
});
