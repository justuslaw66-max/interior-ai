import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const PANEL_FLOORING_ID = "goodrich-geff-novaclick-gnv-018-grand-marble";
const PANEL_FLOORING_NAME = "GEFF NovaClick GNV-018 Grand Marble";
const EXPORT_FLOORING_ID = "goodrich-geff-novaclick-gnv-001-ivory-oak";
const EXPORT_WALL_ID = "goodrich-geff-novaclick-gnv-002-silver-oak";
const GARDENIA_DORICA_CREMA_120_ID = "gardenia-flooring-dorica-crema-0010006-120x120-nat-196270-0";
const GARDENIA_DORICA_CREMA_20X120_ID = "gardenia-flooring-dorica-crema-0010519-20x120-nat-196278-0";

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

async function mockProPlan(page: import("@playwright/test").Page) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "pro", source: "playwright" }),
    });
  });
}

async function dismissBlockingDialogs(page: import("@playwright/test").Page) {
  const modalOverlay = page.locator(".fixed.inset-0.z-50").first();
  await Promise.race([
    page.getByText("Upgrade to Pro").first().waitFor({ state: "visible", timeout: 10000 }),
    modalOverlay.waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => null);
  const dismissButtons = modalOverlay.getByRole("button", {
    name: /^(Close|Maybe later|Not now|No thanks|Skip|Got it)$/i,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const count = await dismissButtons.count();
    let clicked = false;
    for (let index = 0; index < count; index += 1) {
      const button = dismissButtons.nth(index);
      if (!(await button.isVisible({ timeout: 1000 }).catch(() => false))) continue;
      await button.click();
      clicked = true;
      await modalOverlay.waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);
      break;
    }
    if (!clicked) return;
  }
}

async function openSurfacesPanelFromInspector(page: import("@playwright/test").Page) {
  const surfacesPanel = page.getByTestId("room-surfaces-floor-panel");
  const modalOverlay = page.locator(".fixed.inset-0.z-50").first();
  const changeFinish = page.getByTestId("plan-change-floor-finish");

  await changeFinish.click();
  await Promise.race([
    surfacesPanel.waitFor({ state: "visible", timeout: 10000 }),
    modalOverlay.waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => null);

  if (await modalOverlay.isVisible().catch(() => false)) {
    await dismissBlockingDialogs(page);
  }
  if (!(await surfacesPanel.isVisible().catch(() => false))) {
    await changeFinish.click();
  }
  await expect(surfacesPanel).toBeVisible({ timeout: 30000 });
  return surfacesPanel;
}

test.describe("Flooring surface materials", () => {
  test("designer can apply draft flooring and keep it after reload", async ({ page }) => {
    test.setTimeout(90000);

    await mockProPlan(page);
    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible({ timeout: 30000 });
    await dismissBlockingDialogs(page);

    const floorPanel = page.getByTestId("selection-inspector-floor-settings");
    await expect(floorPanel).toBeVisible({ timeout: 30000 });
    await expect(floorPanel).not.toHaveAttribute("data-floor-material-id", PANEL_FLOORING_ID);

    await page.getByTestId("plan-change-floor-finish").click();

    const surfacesPanel = page.getByTestId("floor-finish-panel");
    const surfaceControls = surfacesPanel.getByTestId("room-surfaces-floor-panel");
    await expect(surfaceControls).toBeVisible({ timeout: 30000 });
    await surfaceControls.getByTestId("surfaces-filter-toggle").click();
    await surfaceControls.getByTestId("surfaces-filter-effect").selectOption("Marble");
    await surfaceControls.getByTestId("surfaces-filter-color").selectOption("White");

    const materialCard = surfaceControls.getByTestId(`surface-floor-material-${PANEL_FLOORING_ID}`);
    await expect(materialCard).toBeVisible({ timeout: 30000 });
    await surfaceControls.getByTestId(`surface-favorite-${PANEL_FLOORING_ID}`).click();
    await expect(surfaceControls.getByTestId("surfaces-favorites-filter")).toBeVisible();
    await materialCard.locator("button").first().click();

    await expect(floorPanel).toHaveAttribute("data-floor-material-id", PANEL_FLOORING_ID);
    await expect(floorPanel).toContainText(PANEL_FLOORING_NAME);
    await floorPanel.getByTestId("surface-pattern-select").selectOption("herringbone");
    await floorPanel.getByTestId("surface-rotation-45").click();
    await floorPanel.getByTestId("surface-joint-size-4").click();
    await floorPanel.getByTestId("surface-joint-color").click();
    await expect(floorPanel.getByTestId("surface-grout-color-palette")).toBeVisible();
    await floorPanel.getByTestId("surface-grout-color-cc8a10").click();
    await expect(floorPanel.getByTestId("surface-grout-color-palette")).toBeHidden();
    await floorPanel.getByTestId("surface-offset-right").click();
    const offsetControls = floorPanel.getByTestId("surface-offset-controls");
    await offsetControls.focus();
    await page.keyboard.press("ArrowUp");
    await expect(offsetControls).toContainText("Offset 0.05, 0.05");
    await surfaceControls.getByTestId("surface-summary-open").click();
    await expect(surfaceControls.getByTestId("surface-summary-panel")).toContainText("Herringbone");
    await expect(surfaceControls.getByTestId("surface-summary-panel")).toContainText("45°");
    await surfaceControls.getByTestId("surface-summary-panel").getByRole("button", { name: "Close" }).click();

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
    await expect(page.getByTestId("selection-inspector-floor-settings")).toHaveAttribute(
      "data-floor-material-id",
      PANEL_FLOORING_ID,
      { timeout: 30000 }
    );
    await page.getByTestId("plan-change-floor-finish").click();
    await expect(floorPanel.getByTestId("surface-pattern-select")).toHaveValue("herringbone");
    await expect(floorPanel.getByTestId("surface-rotation-45")).toHaveClass(/bg-emerald-600/);
    await expect(floorPanel.getByTestId("surface-joint-size")).toHaveText("4 mm");
  });

  test("size selector applies the selected Gardenia variant live", async ({ page }) => {
    test.setTimeout(90000);

    await mockProPlan(page);
    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible({ timeout: 30000 });
    await dismissBlockingDialogs(page);

    const floorPanel = page.getByTestId("selection-inspector-floor-settings");
    await expect(floorPanel).toBeVisible({ timeout: 30000 });

    await page.getByRole("button", { name: "2D Plan" }).click();
    const planReviewPanel = page.getByTestId("plan-quality-review-panel");
    const selectionInspector = page.getByTestId("selection-inspector");
    await expect(planReviewPanel).toBeVisible({ timeout: 30000 });
    await expect(selectionInspector).toBeVisible({ timeout: 30000 });
    const rightRailMetrics = await page.evaluate(() => {
      const review = document.querySelector<HTMLElement>('[data-testid="plan-quality-review-panel"]');
      const inspector = document.querySelector<HTMLElement>('[data-testid="selection-inspector"]');
      if (!review || !inspector) return null;
      const reviewRect = review.getBoundingClientRect();
      const inspectorRect = inspector.getBoundingClientRect();
      return {
        gap: Math.round(inspectorRect.top - reviewRect.bottom),
        leftDelta: Math.round(Math.abs(inspectorRect.left - reviewRect.left)),
        widthDelta: Math.round(Math.abs(inspectorRect.width - reviewRect.width)),
      };
    });
    if (!rightRailMetrics) throw new Error("Unable to measure 2D right rail panels");
    expect(rightRailMetrics.gap).toBeGreaterThanOrEqual(0);
    expect(rightRailMetrics.gap).toBeLessThanOrEqual(10);
    expect(rightRailMetrics.leftDelta).toBeLessThanOrEqual(1);
    expect(rightRailMetrics.widthDelta).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute("data-view-mode", "3d");

    await page.getByTestId("plan-change-floor-finish").click();
    const surfacesPanel = page.getByTestId("floor-finish-panel");
    const surfaceControls = surfacesPanel.getByTestId("room-surfaces-floor-panel");
    await expect(surfaceControls).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute("data-view-mode", "3d");
    await expect(surfaceControls).toHaveAttribute("data-surface-target", "floor");
    await surfaceControls.getByTestId("surfaces-search").fill("Dorica Crema");

    const doricaCremaCard = surfaceControls.getByRole("button", { name: /Dorica Crema Marble .*5 sizes/i }).first();
    await expect(doricaCremaCard).toBeVisible({ timeout: 30000 });
    await doricaCremaCard.click();
    await floorPanel.getByTestId(`surface-size-option-${GARDENIA_DORICA_CREMA_120_ID}`).click();
    await expect(floorPanel).toHaveAttribute("data-floor-material-id", GARDENIA_DORICA_CREMA_120_ID);
    await expect(page.getByTestId("selection-inspector-floor-size-options")).toBeVisible();
    await expect(floorPanel).toContainText("Size 120x120");
    await expect(floorPanel.getByTestId("surface-pattern-options").getByRole("button")).toHaveCount(3);
    await expect(floorPanel.getByTestId("surface-pattern-option-straight")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-option-brick")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-option-vertical_brick")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-option-herringbone")).toHaveCount(0);
    await expect(floorPanel.getByTestId("surface-pattern-option-random_stagger")).toHaveCount(0);

    await floorPanel.getByTestId("surface-pattern-option-vertical_brick").click();
    await expect(floorPanel.getByTestId("surface-pattern-select")).toHaveValue("vertical_brick");

    await floorPanel.getByTestId(`surface-size-option-${GARDENIA_DORICA_CREMA_20X120_ID}`).click();
    await expect(floorPanel).toHaveAttribute("data-floor-material-id", GARDENIA_DORICA_CREMA_20X120_ID);
    await expect(floorPanel).toContainText("Size 20x120");
    await expect(floorPanel.getByTestId("surface-pattern-options").getByRole("button")).toHaveCount(5);
    await expect(floorPanel.getByTestId("surface-pattern-option-herringbone")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-option-random_stagger")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-option-straight")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-option-brick")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-option-vertical_brick")).toBeVisible();
    await expect(floorPanel.getByTestId("surface-pattern-select")).toHaveValue("vertical_brick");

    await floorPanel.getByTestId("surface-pattern-option-herringbone").click();
    await expect(floorPanel.getByTestId("surface-pattern-select")).toHaveValue("herringbone");

    await floorPanel.getByTestId(`surface-size-option-${GARDENIA_DORICA_CREMA_120_ID}`).click();
    await expect(floorPanel).toHaveAttribute("data-floor-material-id", GARDENIA_DORICA_CREMA_120_ID);
    await expect(floorPanel.getByTestId("surface-pattern-options").getByRole("button")).toHaveCount(3);
    await expect(floorPanel.getByTestId("surface-pattern-select")).toHaveValue("straight");
  });

  test("apply all uses the selected wall paint instead of the custom default", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible({ timeout: 30000 });
    await dismissBlockingDialogs(page);

    const surfacesPanel = await openSurfacesPanelFromInspector(page);
    await page.getByTestId("surface-target-walls").click();
    await page.getByTestId("wall-paint-search").fill("Dutchess Pink");
    await page.getByTestId("wall-paint-swatch-nippon-9072-dutchess-pink").click();

    await expect(page.getByTestId("wall-paint-custom-color")).toHaveValue("#d77c8e");
    await page.getByTestId("wall-paint-apply-all").click();

    await expect(surfacesPanel).toContainText("All walls · Dutchess Pink");
    await expect(page.getByTestId("rule-announcement-status")).toHaveText(
      "Dutchess Pink (9072) applied to all room walls"
    );
  });

  test("ceiling target can use the paint colour picker", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="scene-canvas"]:visible').first()).toBeVisible({ timeout: 30000 });
    await dismissBlockingDialogs(page);

    const surfacesPanel = await openSurfacesPanelFromInspector(page);
    const targetButtonMetrics = await page.getByTestId("surface-target-bar").evaluate((bar) =>
      Array.from(bar.querySelectorAll("button")).map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      })
    );
    expect(Math.max(...targetButtonMetrics.map((metric) => metric.height))).toBe(
      Math.min(...targetButtonMetrics.map((metric) => metric.height))
    );
    expect(
      Math.max(...targetButtonMetrics.map((metric) => metric.width)) -
        Math.min(...targetButtonMetrics.map((metric) => metric.width))
    ).toBeLessThanOrEqual(1);

    await page.getByTestId("surface-target-ceiling").click();
    await expect(surfacesPanel).toHaveAttribute("data-surface-target", "ceiling");
    const selectionInspectorSurface = page.getByTestId("selection-inspector-floor-settings");
    await expect(selectionInspectorSurface).toHaveAttribute("data-surface-target", "ceiling");
    await expect(selectionInspectorSurface).toContainText("Ceiling settings");
    await expect(page.getByTestId("selection-inspector-room-dimensions")).toBeHidden();
    await expect(page.getByTestId("wall-paint-panel")).toBeVisible();
    await expect(page.getByTestId("wall-paint-family-filter")).toBeVisible();

    await page.getByTestId("wall-paint-family-grey").click();
    await expect(page.getByTestId("wall-paint-panel")).toContainText("Colour family: GREY");
    await expect(page.getByTestId("wall-paint-swatch-nippon-5037-ash-grey")).toBeVisible();
    await expect(page.getByTestId("wall-paint-swatch-nippon-9039-absinthe")).toHaveCount(0);

    await page.getByTestId("wall-paint-family-green").click();
    await expect(page.getByTestId("wall-paint-panel")).toContainText("Colour family: GREEN");
    await page.getByTestId("wall-paint-swatch-nippon-9039-absinthe").click();
    await expect(surfacesPanel).toContainText("Ceiling · Absinthe");
    await expect(page.getByTestId("wall-paint-panel")).toContainText("#728E68");
  });

  test("bottom-up 3D selection targets the ceiling instead of the room", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1600, height: 1000 });

    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    const sceneCanvas = page.locator('[data-testid="scene-canvas"]:visible').first();
    await expect(sceneCanvas).toBeVisible({ timeout: 30000 });
    await dismissBlockingDialogs(page);

    await openSurfacesPanelFromInspector(page);
    await page.getByTestId("surface-target-ceiling").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selection-inspector-floor-settings")).toBeHidden();

    const canvasBox = await sceneCanvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) throw new Error("Scene canvas was not measurable");

    const orbitX = canvasBox.x + canvasBox.width * 0.55;
    await page.mouse.move(orbitX, canvasBox.y + canvasBox.height * 0.78);
    await page.mouse.down();
    await page.mouse.move(orbitX, canvasBox.y + canvasBox.height * 0.12, { steps: 16 });
    await page.mouse.up();

    await expect
      .poll(async () => Number(await sceneCanvas.getAttribute("data-camera-y")), {
        timeout: 10000,
      })
      .toBeLessThan(0);

    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.52,
      canvasBox.y + canvasBox.height * 0.52
    );

    const selectionInspectorSurface = page.getByTestId("selection-inspector-floor-settings");
    await expect(selectionInspectorSurface).toHaveAttribute("data-surface-target", "ceiling");
    await expect(selectionInspectorSurface).toContainText("Ceiling settings");
    await expect(page.getByTestId("selection-inspector-room-dimensions")).toBeHidden();
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
              wallMaterialId: EXPORT_WALL_ID,
              walls: {
                default: {
                  materialId: EXPORT_WALL_ID,
                  pattern: "grid",
                  rotationDeg: 90,
                  scale: 1,
                  offset: { x: 0, y: 0 },
                  jointSizeMm: 2,
                  jointColor: "#dad7cf",
                },
              },
            },
            surfaceFinishes: {
              floorMaterialId: EXPORT_FLOORING_ID,
              floorRotationDeg: 0,
              floorPattern: "straight",
              floorScale: 1,
              wallMaterialId: EXPORT_WALL_ID,
              walls: {
                default: {
                  materialId: EXPORT_WALL_ID,
                  pattern: "grid",
                  rotationDeg: 90,
                  scale: 1,
                  offset: { x: 0, y: 0 },
                  jointSizeMm: 2,
                  jointColor: "#dad7cf",
                },
              },
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
      await expect(bomRow).toContainText("GEFF NovaClick GNV-001 Ivory Oak");
      await expect(bomRow).toContainText(`Floor · ${EXPORT_FLOORING_ID}`);
      await expect(bomRow).toContainText("Pattern straight · Rotation 0° · Scale 1.00x · Joint 2 mm");
      await expect(bomRow.getByRole("cell", { name: "12 m2" })).toBeVisible();
      await expect(bomRow).toContainText("13.2 m2");
      await expect(bomRow).toContainText("10% waste");
      const wallBomRow = page.getByRole("row", {
        name: new RegExp(`Flooring Test Room.*${EXPORT_WALL_ID}`),
      });
      await expect(wallBomRow).toContainText("All walls");
      await expect(wallBomRow).toContainText("Pattern grid · Rotation 90° · Scale 1.00x · Joint 2 mm");
    } finally {
      if (designId) {
        await prisma.design.delete({ where: { id: designId } }).catch(() => {});
      }
      await prisma.$disconnect().catch(() => {});
    }
  });
});
