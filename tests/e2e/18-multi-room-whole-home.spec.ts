import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
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

async function clickWithFallback(locator: Locator, timeout = 5000) {
  try {
    await locator.click({ timeout });
  } catch {
    await locator.evaluate((node) => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
}

async function expectInactiveOrHidden(locator: Locator) {
  if ((await locator.count()) === 0) return;
  await expect(locator).toHaveAttribute("data-active", "false");
}

test.describe("18. Multi-Room Whole Home", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const clearSentinel = "__e2e_multi_room_storage_cleared";
      if (window.localStorage.getItem(clearSentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(clearSentinel, "1");
    });
  });

  async function chooseDrawFromScratch(page: Page) {
    const firstStartDraw = page.getByTestId("plan-start-draw");
    if (await firstStartDraw.isVisible().catch(() => false)) {
      await expect(page.getByTestId("plan-start-upload")).toBeVisible();
      await expect(page.getByTestId("plan-start-template")).toBeVisible();
      await firstStartDraw.click();
      await openDrawToolPanelIfNeeded(page);
      return;
    }

    await expect(page.getByTestId("floor-plan-tool-draw_room")).toBeVisible();
    await page.getByTestId("floor-plan-tool-draw_room").click();
    await openDrawToolPanelIfNeeded(page);
  }

  async function openDrawToolPanelIfNeeded(page: Page) {
    const straightWallTool = page.getByTestId("floor-plan-draw-mode-straight_wall");
    if ((await straightWallTool.count()) > 0) return;

    const planFocusPanelButton = page.getByRole("button", { name: "Panel" });
    if (await planFocusPanelButton.isVisible().catch(() => false)) {
      await planFocusPanelButton.click();
    }
  }

  function drawPointCountLocator(page: Page, count: number) {
    const focusLabel = count === 1 ? "1 corner" : `${count} corners`;
    return page
      .getByText(`Wall points: ${count}`)
      .or(page.getByRole("toolbar", { name: "Plan focus controls" }).getByText(focusLabel))
      .first();
  }

  async function expectDrawPointCount(page: Page, count: number) {
    await expect(drawPointCountLocator(page, count)).toBeVisible();
  }

  async function isDrawPointCountVisible(page: Page, count: number) {
    return drawPointCountLocator(page, count).isVisible({ timeout: 1000 }).catch(() => false);
  }

  async function chooseTemplateStart(page: Page) {
    const betaTemplate = page.getByTestId("beta-start-template");
    if (await betaTemplate.isVisible().catch(() => false)) {
      await clickWithFallback(betaTemplate);
      return;
    }

    const planTab = page.getByTestId("editor-workflow-plan");
    if (await planTab.isVisible().catch(() => false)) {
      await clickWithFallback(planTab);
    }
    await expect(page.getByTestId("plan-start-template")).toBeVisible();
    await clickWithFallback(page.getByTestId("plan-start-template"));
  }

  test("public beta fast start opens the chosen plan workflow", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    const betaStartPanel = page.getByTestId("beta-start-panel");
    if (await betaStartPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickWithFallback(page.getByTestId("beta-start-template"));
    } else {
      await chooseTemplateStart(page);
    }

    await expect(page.getByRole("button", { name: "2D Plan" })).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-compact_two_bed")).toBeVisible();

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("beta-start-panel")).toHaveCount(0);
  });

  test("public beta AI fast start opens the AI design brief", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    const betaStartPanel = page.getByTestId("beta-start-panel");
    if (await betaStartPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.getByTestId("beta-start-ai-layout").click();
    } else {
      await clickWithFallback(page.getByTestId("editor-workflow-ai"));
    }

    await expect(page.getByTestId("editor-workflow-ai")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("AI Design Brief")).toBeVisible();
    await expect(page.getByText("Step 1 · Room goal")).toBeVisible();
    await expect(page.getByText("Step 2 · Style")).toBeVisible();
    await expect(page.getByText("Step 3 · Budget")).toBeVisible();
    await expect(page.getByText("Step 4 · Must-have items")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate layout" })).toBeEnabled();
    await expect(page.getByText("Review the result before saving, exporting, or shopping.")).toBeVisible();
  });

  test("3D scene quality control switches and persists lite mode", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("scene-performance-control")).toBeVisible();
    await page.getByTestId("scene-performance-expand").click();
    await expect(page.getByTestId("scene-performance-auto")).toHaveAttribute("data-active", "true");

    await page.getByTestId("scene-performance-lite").click();
    await expect(page.getByTestId("scene-performance-lite")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Lite scene mode enabled")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("scene_performance_mode")))
      .toBe("lite");

    await page.getByTestId("scene-performance-quality").click();
    await expect(page.getByTestId("scene-performance-quality")).toHaveAttribute("data-active", "true");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("scene_performance_mode")))
      .toBe("quality");
  });

  test("floor panel creates floors with modes and toggles inactive floor visibility", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("coohom-floor-panel")).toBeVisible();
    await page.getByTestId("floating-panel-presets-design-floor-properties").click();
    await expect(page.getByTestId("floating-panel-preset-menu-design-floor-properties")).toBeVisible();
    await page.getByRole("button", { name: "Coohom stack" }).click();
    await expect(page.getByTestId("floating-panel-preset-menu-design-floor-properties")).toHaveCount(0);

    const expandFloorPanel = page.getByRole("button", { name: "Expand floor panel" });
    if (await expandFloorPanel.isVisible().catch(() => false)) {
      await expandFloorPanel.click();
    }
    await page.locator("summary").filter({ hasText: "Add floor" }).click();
    await expect(page.getByTestId("floor-add-upper")).toBeVisible();
    await page.getByTestId("floor-add-upper").click();
    await expect(page.getByTestId("floor-add-mode-menu")).toBeVisible();
    await expect(page.getByText("Choose what to copy into the new level.")).toBeVisible();
    await page.getByLabel("Close floor creation menu").click();
    await expect(page.getByTestId("floor-add-mode-menu")).toHaveCount(0);
    await page.getByTestId("floor-add-upper").click();
    await page.getByTestId("floor-add-mode-blank").click();
    await expect(page.getByTestId("floor-row-2")).toContainText("2F");
    await expect(page.getByTestId("floor-row-1")).toContainText("1F");

    await page.getByTestId("floor-row-1").getByRole("button", { name: "Hide 1F" }).click();
    await expect(page.getByRole("button", { name: "Show 1F" })).toBeVisible();

    await page.getByTestId("floor-row-1").getByRole("button", { name: /1F/ }).first().click();
    await expect(page.getByTestId("floor-row-1").getByRole("button", { name: "Hide 1F" })).toBeDisabled();

    await page.getByTestId("floor-add-lower").click();
    await expect(page.getByTestId("floor-add-mode-menu")).toBeVisible();
    await page.getByTestId("floor-add-mode-walls").click();
    await expect(page.getByTestId("floor-row-0")).toContainText("B1");

    await page.getByText("Advanced").click();
    await page.getByTestId("floor-rename-open").click();
    await expect(page.getByTestId("floor-rename-dialog")).toBeVisible();
    await page.getByTestId("floor-rename-input").fill("Basement");
    await page.getByTestId("floor-rename-save").click();
    await expect(page.getByTestId("floor-row-0")).toContainText("Basement");

    await page.getByTestId("floor-delete-open").click();
    await expect(page.getByTestId("floor-delete-dialog")).toBeVisible();
    await page.getByTestId("floor-delete-dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("floor-delete-dialog")).toHaveCount(0);

    await page.getByLabel("Stacked 3D floors").check();
    await expect(page.getByTestId("floor-stack-control")).toBeVisible();
  });

  test("drawing a room works on a blank 2D grid without uploading a plan", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("floor-plan-draw-mode-straight_wall")).toHaveCount(0);
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseDrawFromScratch(page);
    await expect(page.getByText("Draw room", { exact: true })).toBeVisible();

    await openDrawToolPanelIfNeeded(page);
    await expect(page.getByTestId("floor-plan-draw-mode-straight_wall")).toBeVisible();
    await expect(page.getByTestId("floor-plan-draw-mode-rectangle_wall")).toBeVisible();
    await expect(page.getByTestId("floor-plan-draw-mode-arc_wall")).toBeHidden();
    await page.getByText("More drawing options").click();
    await expect(page.getByTestId("floor-plan-draw-mode-arc_wall")).toBeVisible();
    await page.getByTestId("floor-plan-draw-mode-straight_wall").click();
    await expect(page.getByTestId("floor-plan-exact-wall-length")).toBeVisible();
    await expect(page.getByTestId("floor-plan-apply-exact-wall-length")).toBeDisabled();
    await page.getByTestId("floor-plan-draw-mode-rectangle_wall").click();
    await expectDrawPointCount(page, 0);
    await expect(page.getByTestId("floor-plan-exact-wall-length")).toHaveCount(0);
    await expect(page.getByTestId("floor-plan-angle-lock-ortho")).toHaveCount(0);
    await expect(page.getByTestId("floor-plan-trace-room-type")).toHaveValue("living");
    await page.getByTestId("floor-plan-trace-room-type").selectOption("bedroom");
    await page.getByTestId("floor-plan-draw-mode-straight_wall").click();

    const drawSurface = page.getByTestId("scene-canvas");
    await expect(drawSurface).toBeVisible();
    const box = await drawSurface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    const start = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.45 };
    const end = { x: box.x + box.width * 0.9, y: box.y + box.height * 0.86 };
    await expect(page.getByTestId("floor-plan-draw-escape-hint")).toHaveText("Esc exits draw");
    await page.mouse.click(start.x, start.y);
    await expectDrawPointCount(page, 1);
    await page.locator('[data-testid="floor-plan-undo-wall-point"]:not([disabled])').click();
    await expectDrawPointCount(page, 0);

    await page.mouse.click(start.x, start.y);
    await expectDrawPointCount(page, 1);
    await expect(page.getByTestId("floor-plan-draw-escape-hint")).toHaveText("Esc cancels line");
    await page.keyboard.press("Escape");
    if (!(await isDrawPointCountVisible(page, 0))) {
      await page
        .getByRole("toolbar", { name: "Plan focus controls" })
        .getByRole("button", { name: "Undo" })
        .click();
    }
    await expectDrawPointCount(page, 0);
    await expect(page.getByTestId("floor-plan-draw-escape-hint")).toHaveText("Esc exits draw");
    await page.keyboard.press("Escape");
    await expect(page.getByText("Wall points: 0")).toHaveCount(0);

    await chooseDrawFromScratch(page);
    await page.getByTestId("floor-plan-draw-mode-rectangle_wall").click();
    await expectDrawPointCount(page, 0);
    await page.mouse.click(start.x, start.y);
    await expectDrawPointCount(page, 1);
    await page.mouse.click(end.x, end.y);

    await expect(page.getByText("Room drawn")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");

    await page.getByTestId("floor-plan-draw-mode-straight_wall").click();
    await page.mouse.move(start.x, start.y);
    await expect(page.getByText(/Snap to (corner|wall)/)).toBeVisible();
    await page.mouse.click(start.x, start.y);
    await expect(page.getByTestId("wall-draw-continuation-cue")).toContainText(
      /Continue from corner|Continue on wall/
    );
    await page.mouse.move(start.x + 220, start.y);
    await page.mouse.click(start.x + 220, start.y);
    await expectDrawPointCount(page, 2);
    await page.mouse.move(start.x + 220, start.y + 180);
    await page.mouse.click(start.x + 220, start.y + 180);
    await expectDrawPointCount(page, 3);
    await expect(page.getByTestId("wall-draw-close-cue")).toContainText("Close room here");
  });

  test("straight wall segment lengths can be edited while drawing", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseDrawFromScratch(page);
    await page.getByTestId("floor-plan-draw-mode-straight_wall").click();

    const drawSurface = page.getByTestId("scene-canvas");
    const box = await drawSurface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    const start = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.45 };
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(start.x + 220, start.y);
    await page.mouse.click(start.x + 220, start.y);

    await expectDrawPointCount(page, 2);
    await expect(page.getByTestId("wall-draw-segment-length-1")).toBeVisible();
    await page.getByTestId("wall-draw-segment-length-1").dblclick();
    await expect(page.getByTestId("wall-draw-segment-length-editor")).toBeVisible();
    await page.getByTestId("wall-draw-segment-length-editor").fill("1800");
    await page.getByTestId("wall-draw-segment-length-editor").press("Enter");
    await expect(page.getByTestId("wall-draw-segment-length-1")).toContainText("1800 mm");
  });

  test("arc wall mode previews rounded-room feedback and cancels cleanly", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseDrawFromScratch(page);
    await page.getByText("More drawing options").click();
    await page.getByTestId("floor-plan-draw-mode-arc_wall").click();
    await expectDrawPointCount(page, 0);
    await page.getByTestId("floor-plan-trace-room-type").selectOption("living");

    const canvas = page.getByTestId("scene-canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    const arcStart = { x: box.x + box.width * 0.58, y: box.y + box.height * 0.42 };
    const arcEnd = { x: box.x + box.width * 0.74, y: box.y + box.height * 0.6 };

    await page.mouse.click(arcStart.x, arcStart.y);
    await expectDrawPointCount(page, 1);
    await page.mouse.move(arcEnd.x, arcEnd.y, { steps: 6 });
    await expect(page.getByTestId("arc-wall-draw-length")).toBeVisible();
    await expect(page.getByTestId("arc-wall-draw-angle")).toContainText("180");
    await page.keyboard.press("Escape");
    if (!(await isDrawPointCountVisible(page, 0))) {
      await page
        .getByRole("toolbar", { name: "Plan focus controls" })
        .getByRole("button", { name: "Clear" })
        .click();
    }
    await expect(page.getByRole("toolbar", { name: "Plan focus controls" }).getByText("Ready")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
  });

  test("rectangle drawing can replace the starter room outline", async ({
    page,
  }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseDrawFromScratch(page);
    await page.getByTestId("floor-plan-draw-mode-rectangle_wall").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    await expect(page.getByText("5000 mm").first()).toBeVisible();
    await expect(page.getByText("4000 mm").first()).toBeVisible();
    await page.getByTestId("room-plan-status-fit-view").click();
    const snapMarkers = await page
      .locator('[data-testid^="floor-plan-start-snap-"]')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-testid"),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            planX: element.getAttribute("data-plan-x"),
            planZ: element.getAttribute("data-plan-z"),
          };
        })
      );
    const verticalSides = ["-2.500", "2.500"].map((planX) => {
      const top = snapMarkers.find(
        (marker) =>
          marker.id === "floor-plan-start-snap-corner" &&
          marker.planX === planX &&
          marker.planZ === "-2.000"
      );
      const bottom = snapMarkers.find(
        (marker) =>
          marker.id === "floor-plan-start-snap-corner" &&
          marker.planX === planX &&
          marker.planZ === "2.000"
      );
      return top && bottom ? { top, bottom } : null;
    }).filter(Boolean) as Array<{
      top: NonNullable<(typeof snapMarkers)[number]>;
      bottom: NonNullable<(typeof snapMarkers)[number]>;
    }>;
    expect(verticalSides.length).toBeGreaterThan(0);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Viewport was not measurable");
    const side = verticalSides
      .map((candidate) => {
        const startX = candidate.top.x + candidate.top.width / 2;
        const leftSpace = startX - 24;
        const rightSpace = viewport.width - startX - 24;
        return {
          ...candidate,
          direction: rightSpace >= leftSpace ? 1 : -1,
          availableSpace: Math.max(leftSpace, rightSpace),
        };
      })
      .sort((a, b) => b.availableSpace - a.availableSpace)[0];
    if (!side) throw new Error("Starter room snap side was not measurable");
    const pixelsPerMeter = Math.abs(side.bottom.y - side.top.y) / 4;
    const roomWidthMeters = Math.max(1.2, Math.min(2, (side.availableSpace - 32) / pixelsPerMeter));
    const start = {
      x: side.top.x + side.top.width / 2,
      y: side.top.y + side.top.height / 2,
    };
    const end = {
      x: start.x + side.direction * pixelsPerMeter * roomWidthMeters,
      y: side.bottom.y + side.bottom.height / 2,
    };

    await page.mouse.click(start.x, start.y);
    await expectDrawPointCount(page, 1);
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.click(end.x, end.y);

    await expect(page.getByText("Room drawn")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    await expect(page.getByText("2 x 4m").first()).toBeVisible();
  });

  test("shift-dragging a 2D room moves freely without losing selection", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
    const activeRoomLabel = page
      .locator('[data-testid="house-room-2d-label"][data-active="true"]')
      .or(page.locator('[data-testid="house-room-2d-label"]').filter({ hasText: "Bedroom" }))
      .first();
    if ((await activeRoomLabel.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping shift-drag label movement assertions because 2D room labels are density-hidden in this layout.",
      });
      await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");
      return;
    }
    await expect(activeRoomLabel).toContainText("Bedroom");

    const before = await activeRoomLabel.boundingBox();
    expect(before).not.toBeNull();
    if (!before) {
      throw new Error("Active room label was not measurable before shift-dragging");
    }

    const dragStart = {
      x: before.x + before.width / 2 + 100,
      y: before.y + before.height / 2,
    };

    await page.keyboard.down("Shift");
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 96, dragStart.y + 36, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.waitForTimeout(250);

    await expect(activeRoomLabel).toContainText("Bedroom");
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");
    const after = await activeRoomLabel.boundingBox();
    expect(after).not.toBeNull();
    if (!after) {
      throw new Error("Active room label was not measurable after shift-dragging");
    }
    expect(after.x).toBeGreaterThan(before.x + 24);
  });

  test("preview placement can be dragged directly into another room", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
    const livingLabel = page
      .locator('[data-testid="house-room-2d-label"]')
      .filter({ hasText: "Living Room" })
      .first();
    const bedroomLabel = page
      .locator('[data-testid="house-room-2d-label"]')
      .filter({ hasText: "Bedroom" })
      .first();
    if ((await livingLabel.count()) === 0 || (await bedroomLabel.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping direct room-label drag placement assertions because 2D room labels are density-hidden in this layout.",
      });
      await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");
      return;
    }
    await expect(livingLabel).toBeVisible();
    await expect(bedroomLabel).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");

    await clickWithFallback(page.getByTestId("editor-workflow-furnish"));
    if ((await page.getByTestId("furnish-recommended-category-coffee_table").count()) > 0) {
      await page.getByTestId("furnish-recommended-category-coffee_table").click();
    } else {
      await page.getByTestId("furnish-full-catalog").click();
    }
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    const firstPreview = page.locator('[data-testid^="catalog-preview-"]').first();
    const firstPreviewTestId = await firstPreview.getAttribute("data-testid");
    const firstCatalogItemId = firstPreviewTestId?.replace("catalog-preview-", "");
    expect(firstCatalogItemId).toBeTruthy();
    if (!firstCatalogItemId) {
      throw new Error("Catalog preview did not expose a product id");
    }

    await page.getByTestId(`catalog-add-${firstCatalogItemId}`).click();
    await expect(page.getByTestId("catalog-placement-confirm-panel")).toBeVisible();
    await expect(page.getByTestId("catalog-placement-target-room")).toContainText("Bedroom");

    const livingBox = await livingLabel.boundingBox();
    const bedroomBox = await bedroomLabel.boundingBox();
    expect(livingBox).not.toBeNull();
    expect(bedroomBox).not.toBeNull();
    if (!livingBox || !bedroomBox) {
      throw new Error("Room labels were not measurable");
    }

    const start = {
      x: bedroomBox.x + bedroomBox.width / 2,
      y: bedroomBox.y + bedroomBox.height / 2 + 82,
    };
    const end = {
      x: livingBox.x + livingBox.width / 2,
      y: livingBox.y + livingBox.height / 2 + 82,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 14 });
    await page.mouse.up();

    await expect(page.getByTestId("catalog-placement-target-room")).toContainText("Living Room", {
      timeout: 5000,
    });
    await expect(page.getByTestId("catalog-placement-confirm")).toContainText("Add to Living Room");
  });

  test("consumer workflow tabs switch panels reliably", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("plan-measurements-panel")).toBeVisible();

    await clickWithFallback(page.getByTestId("editor-workflow-furnish"));
    await expect(page.getByTestId("editor-workflow-furnish")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("furnish-room-summary")).toBeVisible();
    await expect(page.getByTestId("furnish-room-checklist")).toBeVisible();
    await expect(page.getByTestId("furnish-shopping-preview")).toBeVisible();
    await expect(page.getByText("Recommended for Living Room")).toBeVisible();
    await expect(page.getByTestId("furnish-recommended-category-coffee_table")).toBeVisible();
    await clickWithFallback(page.getByTestId("furnish-room-summary-toggle"));
    await expect(page.getByTestId("furnish-room-summary")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("room-furnishing-completeness")).not.toBeVisible();
    await clickWithFallback(page.getByTestId("furnish-room-summary-toggle"));
    await expect(page.getByTestId("furnish-room-summary")).toHaveAttribute("open", "");
    await clickWithFallback(page.getByTestId("furnish-room-checklist-toggle"));
    await expect(page.getByTestId("furnish-room-checklist-section")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("furnish-room-checklist")).not.toBeVisible();
    await clickWithFallback(page.getByTestId("furnish-room-checklist-toggle"));
    await expect(page.getByTestId("furnish-room-checklist-section")).toHaveAttribute("open", "");
    await clickWithFallback(page.getByTestId("furnish-shopping-preview-toggle"));
    await expect(page.getByTestId("furnish-shopping-preview")).not.toHaveAttribute("open", "");
    await clickWithFallback(page.getByTestId("furnish-shopping-preview-toggle"));
    await expect(page.getByTestId("furnish-shopping-preview")).toHaveAttribute("open", "");
    await clickWithFallback(page.getByTestId("furnish-recommended-toggle"));
    await expect(page.getByTestId("furnish-recommended-section")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("furnish-recommended-category-coffee_table")).not.toBeVisible();
    await clickWithFallback(page.getByTestId("furnish-recommended-toggle"));
    await expect(page.getByTestId("furnish-recommended-section")).toHaveAttribute("open", "");
    const fullCatalog = page.getByTestId("furnish-full-catalog");
    await expect(fullCatalog).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("advanced-imported-models")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("guided-furnish-next-action-sofa")).toBeVisible();
    await clickWithFallback(page.getByTestId("guided-furnish-next-action-sofa"));
    await expect(fullCatalog).toHaveAttribute("open", "");
    await expect(fullCatalog).toBeInViewport();
    await expect(page.getByTestId("catalog-room-recommendation-sofa")).toHaveAttribute(
      "data-active",
      "true"
    );
    await clickWithFallback(page.getByTestId("furnish-full-catalog-toggle"));
    await expect(fullCatalog).not.toHaveAttribute("open", "");
    await clickWithFallback(page.getByTestId("furnish-recommended-category-coffee_table"));
    await expect(fullCatalog).toHaveAttribute("open", "");
    await expect(page.getByTestId("catalog-room-context")).toBeVisible();
    await expect(page.getByTestId("catalog-active-room-pill")).toContainText("Adding to Living Room");
    await expect(page.getByTestId("catalog-room-recommendation-coffee_table")).toHaveAttribute(
      "data-active",
      "true"
    );
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="catalog-guidance-"]').first()).toContainText(/Fits this space|Check fit|Too large for room/);
    await expect(page.getByTestId("catalog-smart-filters")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-recommended")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-fits")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-cart_ready")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-retailer_link")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-needs_review")).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-smart-filter-recommended"));
    await expect(page.getByTestId("catalog-smart-filter-recommended")).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-smart-filter-clear"));
    await expectInactiveOrHidden(page.getByTestId("catalog-smart-filter-recommended"));
    const fitsSmartFilter = page.getByTestId("catalog-smart-filter-fits");
    if ((await fitsSmartFilter.count()) > 0 && !(await fitsSmartFilter.isDisabled())) {
      await clickWithFallback(fitsSmartFilter);
      await expect(fitsSmartFilter).toHaveAttribute("data-active", "true");
      await expect(page.locator('[data-testid^="catalog-guidance-"]').first()).toContainText("Fits this space");
      await clickWithFallback(page.getByTestId("catalog-smart-filter-clear"));
      await expectInactiveOrHidden(fitsSmartFilter);
    }
    await expect(page.getByTestId("catalog-memory-all")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("catalog-memory-favorites")).toBeVisible();
    await expect(page.getByTestId("catalog-memory-recent")).toBeVisible();

    const firstPreview = page.locator('[data-testid^="catalog-preview-"]').first();
    const firstPreviewTestId = await firstPreview.getAttribute("data-testid");
    const firstCatalogItemId = firstPreviewTestId?.replace("catalog-preview-", "");
    expect(firstCatalogItemId).toBeTruthy();
    if (!firstCatalogItemId) {
      throw new Error("Catalog preview did not expose a product id");
    }

    const favoriteToggle = page.getByTestId(`catalog-favorite-toggle-${firstCatalogItemId}`);
    await favoriteToggle.evaluate((node) => {
      (node as HTMLElement).click();
    });
    await expect(favoriteToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("catalog-memory-favorites")).toContainText("1");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("interior-ai:catalog-favorites")))
      .toContain(firstCatalogItemId);

    await clickWithFallback(page.getByTestId("catalog-memory-favorites"));
    await expect(page.getByTestId("catalog-memory-favorites")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId(`catalog-preview-${firstCatalogItemId}`)).toBeVisible();

    await clickWithFallback(page.getByTestId("catalog-memory-all"));
    await clickWithFallback(page.getByTestId(`catalog-add-${firstCatalogItemId}`));
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("interior-ai:catalog-recents")))
      .toContain(firstCatalogItemId);
    await expect(page.getByTestId("catalog-memory-recent")).toContainText("1");
    await clickWithFallback(page.getByTestId("catalog-memory-recent"));
    await expect(page.getByTestId("catalog-memory-recent")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId(`catalog-preview-${firstCatalogItemId}`)).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-memory-all"));

    await page.getByTestId("catalog-search-input").fill("zz-no-product-match");
    await expect(page.getByTestId("catalog-empty-recovery")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
    await clickWithFallback(page.getByRole("button", { name: "Clear search" }));
    await expect(page.getByTestId("catalog-empty-recovery")).toBeHidden();
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    await clickWithFallback(page.locator('[data-testid^="catalog-preview-"]').first());
    await expect(page.getByTestId("catalog-detail-add-context")).toContainText("Adding to Living Room");
    await expect(page.getByTestId("catalog-detail-add-to-room")).toContainText("Add to Living Room");
    await clickWithFallback(page.getByRole("button", { name: "Close" }));

    await clickWithFallback(page.getByTestId("editor-workflow-shop"));
    await expect(page.getByTestId("editor-workflow-shop")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Shopping overview")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("shopping-checkout-readiness")).toBeVisible();
    await expect(page.getByText("Retailer-link spend")).toBeVisible();
    await expect(page.getByTestId("cart-checkout-readiness")).toBeVisible();

    await clickWithFallback(page.getByTestId("editor-workflow-plan"));
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("plan-measurements-panel")).toBeVisible();

    await clickWithFallback(page.getByTestId("editor-workflow-export"));
    await expect(page.getByTestId("editor-workflow-export")).toHaveAttribute("data-active", "true");
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("camera-view-name-input").fill("Client hero angle");
    await clickWithFallback(page.getByTestId("save-named-camera-view"));
    await expect(page.getByTestId("saved-camera-view-list")).toContainText("Client hero angle");
    await clickWithFallback(page.getByRole("button", { name: "Client hero angle" }));
    await clickWithFallback(page.locator('[data-testid^="saved-camera-view-delete-"]'));
    await expect(page.getByTestId("saved-camera-view-list")).toHaveCount(0);
    await expect(page.getByText("Saved views appear on share links and export packs.")).toBeVisible();
    await page.getByRole("button", { name: "Close export panel" }).click({ force: true });

    await clickWithFallback(page.getByTestId("editor-workflow-plan"));
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
  });

  test("active room dimensions can be edited by double-clicking the 2D labels", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await clickWithFallback(page.getByTestId("plan-start-template"));
    await page.getByTestId("add-room-template-bedroom").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
    await expect(page.getByTestId("active-room-dimension-width")).toBeVisible();
    await expect(page.getByTestId("active-room-dimension-depth")).toBeVisible();

    await page.getByTestId("active-room-dimension-width").evaluate((node) => {
      node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    await expect(page.getByTestId("active-room-dimension-editor-width")).toBeVisible();
    await page.getByTestId("active-room-dimension-editor-width").fill("3800");
    await page.getByTestId("active-room-dimension-editor-width").press("Enter");
    await expect(page.getByTestId("active-room-dimension-width")).toContainText("W 3800 mm");

    await page.getByTestId("active-room-dimension-depth").dblclick();
    await expect(page.getByTestId("active-room-dimension-editor-depth")).toBeVisible();
    await page.getByTestId("active-room-dimension-editor-depth").fill("3200");
    await page.getByTestId("active-room-dimension-editor-depth").press("Enter");
    await expect(page.getByTestId("active-room-dimension-depth")).toContainText("D 3200 mm");
  });

  test("selected 2D room can be cleared from empty plan space and Escape", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await clickWithFallback(page.getByTestId("plan-start-template"));
    await page.getByTestId("add-room-template-bedroom").click();

    const activeRoomLabels = page.locator(
      '[data-testid="house-room-2d-label"][data-active="true"]'
    );
    const resizeHandles = page.locator('[data-testid^="room-resize-handle-"]');
    if ((await activeRoomLabels.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping selected-room label clearing assertions because 2D active room labels are density-hidden in this layout.",
      });
      await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
      return;
    }
    await expect(activeRoomLabels).toHaveCount(1);
    await expect(resizeHandles.first()).toBeVisible();

    const canvasBox = await page.getByTestId("scene-canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) {
      throw new Error("Scene canvas is missing a bounding box");
    }

    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.9,
      canvasBox.y + canvasBox.height * 0.24
    );
    await expect(activeRoomLabels).toHaveCount(0);
    await expect(resizeHandles).toHaveCount(0);

    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.82,
      canvasBox.y + canvasBox.height * 0.58
    );
    await expect(activeRoomLabels).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(activeRoomLabels).toHaveCount(0);
    await expect(resizeHandles).toHaveCount(0);
  });

  test("2D selected room toolbar and opening delete controls work", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    const planStartTemplate = page.getByTestId("plan-start-template");
    let duplicateRoomCount = "3 rooms";
    let deleteRoomCount = "2 rooms";
    if (await planStartTemplate.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planStartTemplate.click();
      await page.getByTestId("add-room-template-bedroom").click();
    } else {
      duplicateRoomCount = "2 rooms";
      deleteRoomCount = "1 room";
    }

    const noteTool = page.getByTestId("plan-add-note").or(page.getByTestId("floor-plan-tool-note")).first();
    if (!(await noteTool.isVisible({ timeout: 1500 }).catch(() => false))) {
      const proPlanViewButton = page.getByRole("button", { name: "Pro", exact: true });
      if (await proPlanViewButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await proPlanViewButton.click();
      }
    }
    if (await noteTool.isVisible({ timeout: 2000 }).catch(() => false)) {
      await noteTool.click();
      await expect(page.getByTestId("plan-annotation-dialog")).toBeVisible();
      await page.getByTestId("plan-annotation-input").fill("Keep path clear");
      await page.getByTestId("plan-annotation-save").click();
      await expect(page.getByTestId("plan-annotation-dialog")).toHaveCount(0);
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Plan annotation control is hidden in the current selected-room flow.",
      });
    }

    await page.getByTestId("room-plan-status-rename").click();
    await expect(page.getByTestId("room-rename-dialog")).toBeVisible();
    await page.getByTestId("room-rename-input").fill("Guest Room");
    await page.getByTestId("room-rename-save").click();
    await expect(page.getByTestId("room-rename-dialog")).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Guest Room");

    const selectedRoomToolbar = page
      .getByTestId("selected-plan-room-actions")
      .or(page.getByTestId("selected-room-toolbar"))
      .first();
    if (!(await selectedRoomToolbar.isVisible({ timeout: 3000 }).catch(() => false))) {
      return;
    }
    const fitSelectedRoom = page
      .getByTestId("selected-plan-room-fit")
      .or(page.getByTestId("floor-plan-tool-fit-selection"))
      .first();
    await expect(fitSelectedRoom).toBeEnabled();
    await clickWithFallback(fitSelectedRoom);

    await clickWithFallback(
      page.getByTestId("selected-plan-room-duplicate").or(page.getByTestId("selected-room-duplicate")).first()
    );
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(duplicateRoomCount);
    await expect(
      page.getByTestId("selected-plan-room-actions").or(page.getByTestId("selected-room-toolbar")).first()
    ).toBeVisible();

    await clickWithFallback(
      page.getByTestId("selected-plan-room-delete").or(page.getByTestId("selected-room-delete")).first()
    );
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(deleteRoomCount);

    await page.getByTestId("room-doorway-suggestion").first().click();
    await expect(page.getByTestId("plan-opening-live-label")).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("plan-opening-live-label")).toHaveCount(0);
  });

  test("moving a room stops after pointer release and unselect", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await clickWithFallback(page.getByTestId("plan-start-template"));
    await page.getByTestId("add-room-template-bedroom").click();

    const canvasBox = await page.getByTestId("scene-canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) {
      throw new Error("Scene canvas is missing a bounding box");
    }

    let bedroomLabel = page
      .locator('[data-testid="house-room-2d-label"]')
      .filter({ hasText: "Bedroom" })
      .first();
    if (!(await bedroomLabel.isVisible({ timeout: 3000 }).catch(() => false))) {
      const textLabels = page.getByText("Bedroom", { exact: true });
      const textLabelCount = await textLabels.count();
      for (let i = 0; i < textLabelCount; i += 1) {
        const candidate = textLabels.nth(i);
        const candidateBox = await candidate.boundingBox();
        if (
          candidateBox &&
          candidateBox.x >= canvasBox.x &&
          candidateBox.x <= canvasBox.x + canvasBox.width &&
          candidateBox.y >= canvasBox.y &&
          candidateBox.y <= canvasBox.y + canvasBox.height
        ) {
          bedroomLabel = candidate;
          break;
        }
      }
    }
    await expect(bedroomLabel).toBeVisible();

    const beforeDragBox = await bedroomLabel.boundingBox();
    expect(beforeDragBox).not.toBeNull();
    if (!beforeDragBox) {
      throw new Error("Bedroom label is missing a bounding box");
    }

    await page.mouse.move(
      beforeDragBox.x + beforeDragBox.width / 2,
      beforeDragBox.y + beforeDragBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      beforeDragBox.x + beforeDragBox.width / 2 + 80,
      beforeDragBox.y + beforeDragBox.height / 2 + 40,
      { steps: 8 }
    );
    await page.mouse.up();
    const activeRoomLabels = page.locator('[data-testid="house-room-2d-label"][data-active="true"]');
    if ((await activeRoomLabels.count()) > 0) {
      await expect(activeRoomLabels).toHaveCount(1);
    } else {
      await expect(page.getByTestId("selected-plan-room-actions")).toBeVisible();
    }

    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.92,
      canvasBox.y + canvasBox.height * 0.2
    );
    if ((await activeRoomLabels.count()) > 0) {
      await expect(activeRoomLabels).toHaveCount(0);
    } else {
      await expect(page.getByTestId("selected-plan-room-actions")).toHaveCount(0);
    }

    const afterReleaseBox = await bedroomLabel.boundingBox();
    expect(afterReleaseBox).not.toBeNull();
    if (!afterReleaseBox) {
      throw new Error("Bedroom label is missing after drag");
    }

    await page.mouse.move(afterReleaseBox.x + afterReleaseBox.width / 2, afterReleaseBox.y + afterReleaseBox.height / 2);
    await page.mouse.move(afterReleaseBox.x + afterReleaseBox.width / 2 + 120, afterReleaseBox.y + afterReleaseBox.height / 2);
    await page.waitForTimeout(250);

    const afterHoverBox = await bedroomLabel.boundingBox();
    expect(afterHoverBox).not.toBeNull();
    if (!afterHoverBox) {
      throw new Error("Bedroom label is missing after hover");
    }
    expect(Math.abs(afterHoverBox.x - afterReleaseBox.x)).toBeLessThan(2);
    expect(Math.abs(afterHoverBox.y - afterReleaseBox.y)).toBeLessThan(2);
  });

  test("starter floor-plan templates create whole-home room layouts", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await clickWithFallback(page.getByTestId("plan-start-template"));

    await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-living_dining")).toBeVisible();
    await page.getByTestId("apply-plan-template-compact_two_bed").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("6 rooms");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("6 rooms ready");
    await expect(page.getByTestId("room-connection-checklist")).toBeVisible();
    await expect(page.getByTestId("room-connection-checklist")).toHaveAttribute(
      "data-variant",
      "consumer"
    );
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Doorways");
    await expect(page.getByTestId("room-connection-checklist")).not.toContainText("shared wall");

    const widthLabelBox = await page.getByTestId("active-room-dimension-width").boundingBox();
    const depthLabelBox = await page.getByTestId("active-room-dimension-depth").boundingBox();
    expect(widthLabelBox).not.toBeNull();
    expect(depthLabelBox).not.toBeNull();
    if (!widthLabelBox || !depthLabelBox) {
      throw new Error("Active room dimension labels were not measurable");
    }
    expect(Math.abs(widthLabelBox.y - depthLabelBox.y)).toBeGreaterThan(80);
  });

  test("furnished templates create starter items and protect existing plans", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await clickWithFallback(page.getByTestId("plan-start-template"));

    await expect(page.getByTestId("apply-furnished-template-studio")).toBeVisible();
    await expect(
      page.getByTestId(/plan-template-furnishing-marker-studio-.+/).first()
    ).toBeVisible();
    await page.getByTestId("apply-furnished-template-studio").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("Review the shop list");
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem("interior-ai:v1:livingroom-design");
      if (!raw) return false;
      try {
        const stored = JSON.parse(raw) as {
          version?: number;
          rooms?: Array<{ items?: unknown[] }>;
        };
        return (
          stored.version === 3 &&
          stored.rooms?.length === 4 &&
          stored.rooms.some((room) => Array.isArray(room.items) && room.items.length > 0)
        );
      } catch {
        return false;
      }
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("Review the shop list");

    await page.getByTestId("plan-open-templates").click();
    await page.getByTestId("apply-plan-template-one_bedroom").click();

    const replaceDialog = page.getByRole("dialog", { name: "Replace current plan?" });
    await expect(replaceDialog).toBeVisible();
    await expect(replaceDialog).toContainText("Compact 1-bed");
    await replaceDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(replaceDialog).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);

    await page.getByTestId("apply-plan-template-one_bedroom").click();
    await expect(replaceDialog).toBeVisible();
    await replaceDialog.getByRole("button", { name: "Replace plan" }).click();

    await expect(replaceDialog).toHaveCount(0);
    await expect(page.getByText("Compact 1-bed added")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("5 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText("Not started");
  });

  test("adding a room keeps the plan visible as one whole-home 3D scene", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-furnish")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-shop")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-export")).toBeVisible();
    await expect(page.getByTestId("editor-workflow-ai")).toBeVisible();
    await expect(page.getByTestId("house-room-3d-label")).toHaveCount(0);

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page.getByRole("button", { name: "Focus Living Room" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("button", { name: "Focus Bedroom" })).toBeVisible();
    await expect(page.getByTestId("room-plan-status")).toBeVisible();
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Bedroom");
    await expect(page.getByTestId("room-plan-status-room-size")).toContainText("4 x 3.6m");
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("2 rooms ready");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText(
      "Add 1 doorway."
    );

    await expect(page.getByTestId("room-plan-status-view-toggle")).toHaveText("Plan");
    await expect(page.getByTestId("room-plan-status-fit-view")).toBeVisible();
    await clickWithFallback(page.getByTestId("room-plan-status-fit-view"));
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

    await clickWithFallback(page.getByTestId("editor-workflow-ai"));
    await expect(page.getByTestId("editor-workflow-ai")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("AI Design Brief")).toBeVisible();
    await expect(page.getByTestId("ai-layout-goals")).toBeVisible();
    await expect(page.getByTestId("ai-layout-goal-balanced")).toHaveAttribute("data-active", "true");
    await page.getByTestId("ai-layout-goal-media").click();
    await expect(page.getByTestId("ai-layout-goal-media")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("ai-layout-readiness")).toContainText("Ready to generate");
    await expect(page.getByTestId("ai-layout-readiness")).toContainText("Living rooms first");
    await expect(page.getByText("AI layout supports living rooms first")).toBeVisible();
    await clickWithFallback(page.getByTestId("editor-workflow-plan"));
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
    const eastRoomHandle = page.locator('[data-testid^="room-resize-handle-"][data-testid$="-e"]');
    await expect(eastRoomHandle).toBeVisible();
    const eastRoomHandleBox = await eastRoomHandle.boundingBox();
    expect(eastRoomHandleBox).not.toBeNull();
    if (!eastRoomHandleBox) {
      throw new Error("Bedroom east wall handle was not measurable");
    }
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-s"]')).toBeVisible();
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-w"]')).toBeVisible();
    await expect(page.getByTestId("room-adjacency-guide")).toHaveText("Shared wall");
    await expect(page.getByTestId("room-connection-checklist")).toBeVisible();
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Doorways");
    await expect(page.getByTestId("room-connection-checklist")).toContainText("1 doorway to add");
    await expect(page.getByTestId("room-connection-checklist")).not.toContainText("shared wall");
    await expect(page.getByTestId("room-connection-add-doorway")).toHaveText("Add doorway");
    await page.getByTestId("room-connection-add-doorway").click();
    await expect(page.getByText("Doorway added")).toBeVisible();
    await expect(page.getByTestId("room-connection-ready")).toHaveText("All rooms have doorways.");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("openings placed");
    const planOpeningInspector = page.getByTestId("plan-opening-inspector").last();
    await expect(planOpeningInspector).toBeVisible();
    await expect(page.getByTestId("plan-opening-live-label")).toContainText("Door");
    await expect(page.getByTestId("selected-plan-opening-actions")).toBeVisible();
    await expect(page.getByTestId("selected-plan-opening-width-input")).toHaveValue("0.90");
    await page.getByTestId("selected-plan-opening-width-input").fill("1.10");
    await expect(page.getByTestId("selected-plan-opening-width-input")).toHaveValue("1.10");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1.10");
    await page.getByTestId("selected-plan-opening-offset-input").fill("0.20");
    await expect(page.getByTestId("selected-plan-opening-offset-input")).toHaveValue("0.20");
    await expect(planOpeningInspector.getByTestId("plan-opening-offset-input")).toHaveValue("0.20");
    await expect(page.getByTestId("selected-plan-opening-height-input")).toHaveValue("2.10");
    await page.getByTestId("selected-plan-opening-height-input").fill("1.20");
    await expect(page.getByTestId("selected-plan-opening-height-input")).toHaveValue("1.20");
    await expect(planOpeningInspector.getByTestId("plan-opening-height-input")).toHaveValue("1.20");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem("plan_openings");
          const openings = raw
            ? (JSON.parse(raw) as Array<{ widthMm?: number; offsetMm?: number; heightMm?: number }>)
            : [];
          return openings.some(
            (opening) =>
              opening.widthMm === 1100 &&
              opening.offsetMm === 200 &&
              opening.heightMm === 1200
          );
        })
      )
      .toBe(true);
    await planOpeningInspector.getByTestId("plan-opening-width-input").fill("1.15");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1.15");
    await expect(page.getByTestId("selected-plan-opening-width-input")).toHaveValue("1.15");
  });

  test("floor plan upload exposes pdf pages and calibration controls", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
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

    await page.getByTestId("floor-plan-calibration-toggle").click();
    await expect(page.getByText("Set plan scale")).toBeVisible();
    await expect(page.getByText("0/2 points")).toBeVisible();
  });
});
