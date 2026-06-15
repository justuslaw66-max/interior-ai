import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function createSampleFloorPlanPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const page = pdf.addPage([480, 320]);
  page.drawRectangle({
    x: 72,
    y: 72,
    width: 300,
    height: 180,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 2,
  });
  page.drawText("Sample floor plan", {
    x: 90,
    y: 260,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  const secondPage = pdf.addPage([480, 320]);
  secondPage.drawRectangle({
    x: 96,
    y: 88,
    width: 260,
    height: 150,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 2,
  });
  secondPage.drawText("Second floor plan page", {
    x: 90,
    y: 260,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  return Buffer.from(await pdf.save());
}

test.describe("18. Multi-Room Whole Home", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  async function chooseDrawFromScratch(page: Page) {
    await expect(page.getByTestId("plan-start-draw")).toBeVisible();
    await expect(page.getByTestId("plan-start-upload")).toBeVisible();
    await expect(page.getByTestId("plan-start-template")).toBeVisible();
    await page.getByTestId("plan-start-draw").click();
  }

  test("drawing a room works on a blank 2D grid without uploading a plan", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("floor-plan-draw-mode-straight_wall")).toHaveCount(0);
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseDrawFromScratch(page);
    await expect(page.getByText("Draw room")).toBeVisible();

    await expect(page.getByTestId("floor-plan-draw-mode-straight_wall")).toBeVisible();
    await expect(page.getByTestId("floor-plan-draw-mode-rectangle_wall")).toBeVisible();
    await expect(page.getByTestId("floor-plan-draw-mode-arc_wall")).toBeVisible();
    await page.getByTestId("floor-plan-draw-mode-rectangle_wall").click();
    await expect(page.getByText("Wall points: 0")).toBeVisible();
    await expect(page.getByTestId("floor-plan-trace-room-type")).toHaveValue("living");
    await page.getByTestId("floor-plan-trace-room-type").selectOption("bedroom");

    const drawSurface = page.getByTestId("scene-canvas");
    await expect(drawSurface).toBeVisible();
    const box = await drawSurface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    const start = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.45 };
    const end = { x: box.x + box.width * 0.9, y: box.y + box.height * 0.86 };
    await page.mouse.click(start.x, start.y);
    await expect(page.getByText("Wall points: 1")).toBeVisible();
    await page.mouse.click(end.x, end.y);

    await expect(page.getByText("Room drawn")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
  });

  test("arc wall mode creates a rounded custom room on a blank 2D grid", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseDrawFromScratch(page);
    await page.getByTestId("floor-plan-draw-mode-arc_wall").click();
    await expect(page.getByText("Wall points: 0")).toBeVisible();
    await page.getByTestId("floor-plan-trace-room-type").selectOption("living");

    const canvas = page.getByTestId("scene-canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.52);
    await expect(page.getByText("Wall points: 1")).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.92, box.y + box.height * 0.9);

    await expect(page.getByText("Custom room drawn")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Living Room");
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
  });

  test("consumer workflow tabs switch panels reliably", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Start your floor plan")).toBeVisible();

    await page.getByTestId("editor-workflow-furnish").click();
    await expect(page.getByTestId("editor-workflow-furnish")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("furnish-room-summary")).toBeVisible();
    await expect(page.getByText("Recommended for Living Room")).toBeVisible();
    await expect(page.getByTestId("furnish-recommended-category-coffee_table")).toBeVisible();
    await expect(page.getByTestId("advanced-imported-models")).not.toHaveAttribute("open", "");

    await page.getByTestId("editor-workflow-shop").click();
    await expect(page.getByTestId("editor-workflow-shop")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Shopping overview")).toBeVisible({ timeout: 10000 });

    await page.getByTestId("editor-workflow-plan").click();
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Start your floor plan")).toBeVisible();

    await page.getByTestId("editor-workflow-export").click();
    await expect(page.getByTestId("editor-workflow-export")).toHaveAttribute("data-active", "true");
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Close export panel" }).click({ force: true });

    await page.getByTestId("editor-workflow-plan").click();
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
  });

  test("adding a room keeps the plan visible as one whole-home 3D scene", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-furnish")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-shop")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-export")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-ai")).toHaveCount(0);
    await expect(page.getByTestId("house-room-3d-label")).toHaveCount(0);

    await page.getByTestId("plan-start-template").click();
    await page.getByTestId("add-room-template-bedroom").click();

    await expect(page.getByTestId("house-room-3d-label")).toHaveCount(2, {
      timeout: 10000,
    });
    await expect(page.getByTestId("room-plan-status")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");
    await expect(page.getByTestId("room-plan-status-room-size")).toContainText("4 x 3.6m");
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("2 rooms ready");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText(
      "Add doorway links from Connections."
    );

    await expect(page.getByTestId("room-plan-status-view-toggle")).toHaveText("Plan");
    await expect(page.getByTestId("room-plan-status-fit-view")).toBeVisible();
    await page.getByTestId("room-plan-status-fit-view").click();
    await expect(page.getByText("Home fitted")).toBeVisible();
    await expect(page.getByTestId("room-pan-navigator")).toBeVisible();
    await expect(page.getByTestId("room-pan-camera-handle")).toBeVisible();
    await expect(page.getByTestId("room-pan-camera-icon")).toBeVisible();
    await expect(page.getByTestId("room-pan-zoom-in")).toBeVisible();
    await expect(page.getByTestId("room-pan-zoom-out")).toBeVisible();
    await expect(page.getByTestId("room-pan-reset-view")).toBeVisible();

    const panTargetBefore = await page.getByTestId("room-pan-target").boundingBox();
    expect(panTargetBefore).not.toBeNull();
    if (!panTargetBefore) {
      throw new Error("Navigator target was not measurable");
    }

    await page.mouse.move(
      panTargetBefore.x + panTargetBefore.width / 2,
      panTargetBefore.y + panTargetBefore.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      panTargetBefore.x + panTargetBefore.width / 2 + 24,
      panTargetBefore.y + panTargetBefore.height / 2,
      { steps: 6 }
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    const panTargetAfter = await page.getByTestId("room-pan-target").boundingBox();
    expect(panTargetAfter).not.toBeNull();
    if (!panTargetAfter) {
      throw new Error("Navigator target was not measurable after panning");
    }
    expect(panTargetAfter.x).toBeGreaterThan(panTargetBefore.x + 4);

    const cameraHandleBefore = await page.getByTestId("room-pan-camera-handle").boundingBox();
    expect(cameraHandleBefore).not.toBeNull();
    if (!cameraHandleBefore) {
      throw new Error("Navigator camera handle was not measurable");
    }
    await page.mouse.move(
      cameraHandleBefore.x + cameraHandleBefore.width / 2,
      cameraHandleBefore.y + cameraHandleBefore.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      cameraHandleBefore.x + cameraHandleBefore.width / 2 - 18,
      cameraHandleBefore.y + cameraHandleBefore.height / 2 + 12,
      { steps: 6 }
    );
    await page.mouse.up();
    await page.getByTestId("room-pan-zoom-in").click();
    await page.getByTestId("room-pan-zoom-out").click();
    await page.getByTestId("room-pan-reset-view").click();
    await expect(page.getByText("Home fitted")).toBeVisible();

    await expect(page.getByText("AI Design Brief")).toHaveCount(0);
    await page.getByTestId("editor-workflow-furnish").click();
    await expect(page.getByTestId("editor-workflow-furnish")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("furnish-room-summary")).toBeVisible();
    await expect(page.getByTestId("furnish-active-room-name")).toContainText("Bedroom");
    await expect(page.getByText("Recommended for Bedroom")).toBeVisible();
    await expect(page.getByTestId("furnish-recommended-category-accent_chair")).toBeVisible();
    await expect(page.getByTestId("advanced-imported-models")).not.toHaveAttribute("open", "");
    await page.getByTestId("advanced-imported-models-toggle").click();
    await expect(page.getByTestId("add-imported-btn")).toContainText("Add to Bedroom");
    await page.getByTestId("editor-workflow-plan").click();
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    await page.getByTestId("room-plan-status-view-toggle").click();
    await expect(page.getByTestId("room-plan-status-view-toggle")).toHaveText("Room view");
    await expect(page.getByTestId("floor-plan-tool-strip")).toBeVisible();
    await expect(page.getByTestId("floor-plan-tool-select")).toBeVisible();
    await expect(page.getByTestId("floor-plan-tool-draw_room")).toBeVisible();
    await expect(page.getByTestId("floor-plan-tool-door")).toBeVisible();
    await expect(page.getByTestId("floor-plan-tool-window")).toBeVisible();
    await expect(page.getByTestId("active-room-dimension-width")).toContainText("W 4000 mm");
    await expect(page.getByTestId("active-room-dimension-depth")).toContainText("D 3600 mm");
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-n"]')).toBeVisible();
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-e"]')).toBeVisible();
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-s"]')).toBeVisible();
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-w"]')).toBeVisible();
    await expect(page.getByTestId("room-adjacency-guide")).toHaveText("Shared wall");
    await expect(page.getByTestId("room-connection-checklist")).toBeVisible();
    await expect(page.getByTestId("room-connection-status")).toHaveText("Needs doorway");
    await expect(page.getByTestId("room-doorway-suggestion")).toHaveText("Add doorway");
    await page.getByTestId("floor-plan-tool-door").click();
    await expect(page.getByText("Doorway added")).toBeVisible();
    await expect(page.getByTestId("room-connection-status")).toHaveText("Doorway ready");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("openings placed");
    await expect(page.getByTestId("plan-opening-inspector")).toBeVisible();
    await expect(page.getByTestId("plan-opening-width-input")).toHaveValue("0.90");
    await page.getByTestId("plan-opening-width-input").fill("1.10");
    await expect(page.getByTestId("plan-opening-width-input")).toHaveValue("1.10");
    await page.getByTestId("plan-opening-offset-input").fill("0.20");
    await expect(page.getByTestId("plan-opening-offset-input")).toHaveValue("0.20");
    await page.getByTestId("floor-plan-tool-window").click();
    await expect(page.getByText("Window added")).toBeVisible();
    await expect(page.getByTestId("plan-opening-width-input")).toHaveValue("1.20");
    await page.getByTestId("floor-plan-tool-select").click();
    await expect(page.getByTestId("room-doorway-suggestion")).toHaveCount(0);
    await page.getByTestId("room-plan-status-view-toggle").click();
    await expect(page.getByTestId("room-plan-status-view-toggle")).toHaveText("Plan");
    await expect(page.getByTestId("house-room-3d-label")).toHaveCount(2, {
      timeout: 10000,
    });

    await page.getByTestId("plan-start-upload").click();
    await expect(page.getByTestId("floor-plan-upload-empty-state")).toBeVisible();
    await page.getByTestId("floor-plan-upload-input").setInputFiles({
      name: "sample-floor-plan.pdf",
      mimeType: "application/pdf",
      buffer: await createSampleFloorPlanPdf(),
    });
    await expect(page.getByTestId("floor-plan-file-name")).toHaveText("sample-floor-plan.pdf");
    await expect(page.getByTestId("floor-plan-pdf-status")).toHaveText("PDF page 1 of 2 rendered for tracing.");
    await expect(page.getByTestId("floor-plan-pdf-page-select")).toHaveValue("1");
    await page.getByTestId("floor-plan-pdf-page-select").selectOption("2");
    await expect(page.getByTestId("floor-plan-pdf-status")).toHaveText(
      "PDF page 2 of 2 rendered for tracing.",
      { timeout: 20000 }
    );
    await expect(page.getByTestId("floor-plan-pdf-page-select")).toHaveValue("2");
    await expect(page.getByTestId("room-plan-status-view-toggle")).toHaveText("Room view");
    await page.getByTestId("floor-plan-calibration-toggle").click();
    await expect(page.getByText("Points selected: 0/2")).toBeVisible();

    const canvas = page.getByTestId("scene-canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    await page.mouse.click(box.x + box.width * 0.44, box.y + box.height * 0.5);
    await page.mouse.click(box.x + box.width * 0.56, box.y + box.height * 0.5);
    await expect(page.getByText("Points selected: 2/2")).toBeVisible();
    await page.getByTestId("floor-plan-calibration-distance").fill("2");
    await page.getByTestId("floor-plan-apply-calibration").click();
    await expect(page.getByText(/2m set/)).toBeVisible();
    await page.getByTestId("floor-plan-trace-room-toggle").click();
    await expect(page.getByText("Wall points: 0")).toBeVisible();
    await expect(page.getByTestId("floor-plan-trace-room-type")).toHaveValue("living");
    await page.getByTestId("floor-plan-trace-room-toggle").click();
    await page.getByTestId("floor-plan-trace-opening-toggle").click();
    await expect(page.getByText("Opening points: 0/2")).toBeVisible();
    await expect(page.getByTestId("floor-plan-trace-opening-kind")).toHaveValue("door");
    await page.getByTestId("floor-plan-trace-opening-kind").selectOption("window");
    await expect(page.getByTestId("floor-plan-trace-opening-kind")).toHaveValue("window");
    await page.getByTestId("floor-plan-trace-opening-toggle").click();

    await page.getByTestId("room-plan-status-view-toggle").click();
    await expect(page.getByTestId("room-plan-status-view-toggle")).toHaveText("Plan");

    await expect(page.getByTestId("house-room-3d-label")).toHaveCount(2, {
      timeout: 10000,
    });
  });
});
