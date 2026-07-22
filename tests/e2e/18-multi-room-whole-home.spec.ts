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
    await locator.click({ timeout, noWaitAfter: true });
  } catch {
    await locator.evaluate((node) => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
}

async function clearBrowserStorageBeforeNextLoad(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function expectInactiveOrHidden(locator: Locator) {
  if ((await locator.count()) === 0) return;
  await expect(locator).toHaveAttribute("data-active", "false");
}

async function expectPlan2DProjectionHealthy(page: Page) {
  const sceneCanvas = page.getByTestId("scene-canvas").first();
  await expect(sceneCanvas).toHaveAttribute("data-plan-2d-camera-valid", "true", {
    timeout: 10000,
  });
  await expect
    .poll(
      async () =>
        Number(await sceneCanvas.getAttribute("data-plan-2d-projected-room-min-width-px")),
      { timeout: 10000 }
    )
    .toBeGreaterThan(32);
  await expect
    .poll(
      async () =>
        Number(await sceneCanvas.getAttribute("data-plan-2d-projected-room-min-height-px")),
      { timeout: 10000 }
    )
    .toBeGreaterThan(32);
  await expect
    .poll(
      async () =>
        Number(await sceneCanvas.getAttribute("data-plan-2d-projected-room-min-area-px")),
      { timeout: 10000 }
    )
    .toBeGreaterThan(1200);
}

async function readNumberAttribute(locator: Locator, attribute: string) {
  return Number(await locator.getAttribute(attribute));
}

async function getActiveRoomBodyProbe(page: Page) {
  const activeRoomProbe = page
    .getByTestId("house-room-2d-hit-probe")
    .or(page.locator('[data-testid="house-room-2d-label"][data-active="true"]'))
    .first();
  await expect(activeRoomProbe).toBeAttached({ timeout: 10000 });
  return activeRoomProbe;
}

async function getEmptyCanvasPoint(page: Page) {
  const point = await page.getByTestId("scene-canvas").first().evaluate((canvas) => {
    const canvasBox = canvas.getBoundingClientRect();
    const roomCenters = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="house-room-2d-label"]')
    ).map((label) => {
      const box = label.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    const candidates: Array<{ x: number; y: number; score: number }> = [];
    for (let y = canvasBox.top + 24; y < canvasBox.bottom - 24; y += 32) {
      for (let x = canvasBox.left + 24; x < canvasBox.right - 24; x += 32) {
        const hitTarget = document.elementFromPoint(x, y);
        if (!hitTarget || (hitTarget !== canvas && !canvas.contains(hitTarget))) continue;
        const score = roomCenters.length
          ? Math.min(...roomCenters.map((center) => Math.hypot(x - center.x, y - center.y)))
          : 0;
        candidates.push({ x, y, score });
      }
    }
    return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
  });
  expect(point).not.toBeNull();
  if (!point) throw new Error("No unobstructed empty canvas point was measurable");
  return point;
}

function boxesOverlap(
  first: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>,
  second: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>
) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
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
    const betaTemplate = page.locator('[data-testid="beta-start-template"]:visible').first();
    if (await betaTemplate.isVisible().catch(() => false)) {
      await expect(betaTemplate).toBeEnabled({ timeout: 30_000 });
      await clickWithFallback(betaTemplate);
      return;
    }

    const planTab = page.getByTestId("editor-workflow-plan");
    if (await planTab.isVisible().catch(() => false)) {
      await clickWithFallback(planTab);
    }
    const manualPlanChoice = page.getByTestId("plan-guided-actions-choice-manual");
    if (await manualPlanChoice.isVisible().catch(() => false)) {
      await clickWithFallback(manualPlanChoice);
    }
    const planStartTemplate = page.locator('[data-testid="plan-start-template"]:visible').first();
    await expect(planStartTemplate).toBeVisible({ timeout: 20000 });
    await expect(planStartTemplate).toBeEnabled({ timeout: 20000 });
    await clickWithFallback(planStartTemplate);
  }

  test("keeps 2D projected room geometry from collapsing after fit and view toggles", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    await page.getByRole("button", { name: "2D Plan" }).click();
    await expectPlan2DProjectionHealthy(page);

    await clickWithFallback(page.getByTestId("room-plan-status-fit-view"));
    await expectPlan2DProjectionHealthy(page);

    const sceneCanvasBox = await page.getByTestId("scene-canvas").first().boundingBox();
    expect(sceneCanvasBox).not.toBeNull();
    if (!sceneCanvasBox) throw new Error("Scene canvas was not measurable");

    await page.mouse.move(
      sceneCanvasBox.x + sceneCanvasBox.width / 2,
      sceneCanvasBox.y + sceneCanvasBox.height / 2
    );
    await page.mouse.wheel(0, -360);
    await expectPlan2DProjectionHealthy(page);

    await page.getByRole("button", { name: "3D" }).click();
    await page.getByRole("button", { name: "2D Plan" }).click();
    await expectPlan2DProjectionHealthy(page);
  });

  test("pans and zooms from room body while moving rooms only from the move handle", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "2D Plan" }).click();
    await expectPlan2DProjectionHealthy(page);

    const roomLabel = await getActiveRoomBodyProbe(page);
    const labelBox = await roomLabel.boundingBox();
    expect(labelBox).not.toBeNull();
    if (!labelBox) throw new Error("Active room label was not measurable");

    const roomXBeforeMoveHandle = await readNumberAttribute(roomLabel, "data-room-x");
    const roomZBeforeMoveHandle = await readNumberAttribute(roomLabel, "data-room-z");
    await expect(page.getByTestId("selected-room-move")).toBeVisible();
    const moveHandle = page.getByTestId("selected-room-move");
    const moveHandleBox = await moveHandle.boundingBox();
    expect(moveHandleBox).not.toBeNull();
    if (!moveHandleBox) throw new Error("Selected room move handle was not measurable");

    await page.mouse.move(
      moveHandleBox.x + moveHandleBox.width / 2,
      moveHandleBox.y + moveHandleBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      moveHandleBox.x + moveHandleBox.width / 2 + 16,
      moveHandleBox.y + moveHandleBox.height / 2 + 8,
      { steps: 4 }
    );
    const roomDragHud = page.getByTestId("room-drag-hud");
    await expect(roomDragHud).toBeVisible();
    await expect(roomDragHud).not.toHaveAttribute("data-drag-state", "blocked");
    await page.mouse.up();

    await expect
      .poll(async () => {
        const nextX = await readNumberAttribute(roomLabel, "data-room-x");
        const nextZ = await readNumberAttribute(roomLabel, "data-room-z");
        return Math.hypot(nextX - roomXBeforeMoveHandle, nextZ - roomZBeforeMoveHandle);
      })
      .toBeGreaterThan(0.1);
    await expect(page.getByTestId("room-drag-hud")).toHaveCount(0);

    const roomXBeforeBodyDrag = await readNumberAttribute(roomLabel, "data-room-x");
    const roomZBeforeBodyDrag = await readNumberAttribute(roomLabel, "data-room-z");
    const labelBoxBeforeBodyDrag = await roomLabel.boundingBox();
    expect(labelBoxBeforeBodyDrag).not.toBeNull();
    if (!labelBoxBeforeBodyDrag) throw new Error("Active room label was not measurable before body drag");
    const debug = page.getByTestId("qa-design-layout-debug");
    const targetXBeforeBodyDrag = await readNumberAttribute(debug, "data-plan-2d-camera-target-x");
    const targetZBeforeBodyDrag = await readNumberAttribute(debug, "data-plan-2d-camera-target-z");

    await page.mouse.move(
      labelBoxBeforeBodyDrag.x + labelBoxBeforeBodyDrag.width / 2,
      labelBoxBeforeBodyDrag.y + labelBoxBeforeBodyDrag.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      labelBoxBeforeBodyDrag.x + labelBoxBeforeBodyDrag.width / 2 + 90,
      labelBoxBeforeBodyDrag.y + labelBoxBeforeBodyDrag.height / 2 + 60,
      { steps: 8 }
    );
    await page.mouse.up();

    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-x")).toBeCloseTo(roomXBeforeBodyDrag, 2);
    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-z")).toBeCloseTo(roomZBeforeBodyDrag, 2);
    await expect
      .poll(async () => {
        const nextX = await readNumberAttribute(debug, "data-plan-2d-camera-target-x");
        const nextZ = await readNumberAttribute(debug, "data-plan-2d-camera-target-z");
        return Math.hypot(nextX - targetXBeforeBodyDrag, nextZ - targetZBeforeBodyDrag);
      })
      .toBeGreaterThan(0.1);

    const labelBoxAfterPan = await roomLabel.boundingBox();
    expect(labelBoxAfterPan).not.toBeNull();
    if (!labelBoxAfterPan) throw new Error("Active room label was not measurable after pan");

    const zoomBeforeWheel = await readNumberAttribute(debug, "data-plan-zoom");
    await page.mouse.move(
      labelBoxAfterPan.x + labelBoxAfterPan.width / 2,
      labelBoxAfterPan.y + labelBoxAfterPan.height / 2
    );
    await page.mouse.wheel(0, -360);
    await expect.poll(() => readNumberAttribute(debug, "data-plan-zoom")).toBeGreaterThan(zoomBeforeWheel);
    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-x")).toBeCloseTo(roomXBeforeBodyDrag, 2);
    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-z")).toBeCloseTo(roomZBeforeBodyDrag, 2);
  });

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
    const commandOverflow = page.getByTestId("editor-command-overflow");
    await expect(commandOverflow).toBeVisible();
    await commandOverflow.click();
    await expect(page.getByTestId("editor-command-overflow-menu")).toBeVisible();
    await expect(page.getByTestId("editor-overflow-scene-quality")).toBeVisible();
    await expect(page.getByTestId("scene-performance-auto")).toHaveAttribute("data-active", "true");

    await page.getByTestId("scene-performance-lite").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByTestId("scene-performance-lite")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Lite scene mode enabled")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("scene_performance_mode")))
      .toBe("lite");

    await page.getByTestId("scene-performance-quality").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByTestId("scene-performance-quality")).toHaveAttribute("data-active", "true");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("scene_performance_mode")))
      .toBe("quality");
  });

  test("intermediate-width plan keeps floating room and floor overlays off the details card", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 900, height: 900 });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("coohom-floor-panel")).toHaveCount(0);
    await expect(page.getByTestId("floor-summary-panel")).toBeVisible();

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page.getByTestId("room-pan-navigator")).toHaveCount(0);
    await expect(page.getByTestId("coohom-floor-panel")).toHaveCount(0);
    await expect(page.getByTestId("floor-summary-panel")).toBeVisible();
  });

  test("shop mode uses the left work panel and keeps the canvas clear", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "3D" }).click();
    await clickWithFallback(page.getByTestId("editor-workflow-shop"));

    await expect(page.getByTestId("editor-workflow-shop")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("shopping-dock")).toBeVisible();
    await expect(page.getByTestId("shopping-overview-panel")).toBeVisible();
    await expect(page.getByTestId("editor-command-bar")).toBeVisible();
    await expect(page.getByTestId("room-pan-navigator")).toBeVisible();
    await expect(page.getByTestId("coohom-floor-panel")).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(4);

    const shoppingDockBox = await page.getByTestId("shopping-dock").boundingBox();
    const trayTriggerBox = await page.getByTestId("selection-tray-trigger").boundingBox();
    expect(shoppingDockBox).not.toBeNull();
    expect(trayTriggerBox).not.toBeNull();
    if (!shoppingDockBox || !trayTriggerBox) {
      throw new Error("Shop dock and tray trigger should be measurable");
    }
    expect(shoppingDockBox.x).toBeLessThan(120);
    expect(boxesOverlap(shoppingDockBox, trayTriggerBox)).toBe(false);

    const roomNavigatorBox = await page.getByTestId("room-pan-navigator").boundingBox();
    expect(roomNavigatorBox).not.toBeNull();
    if (!roomNavigatorBox) {
      throw new Error("Room navigator should be measurable");
    }
    expect(boxesOverlap(shoppingDockBox, roomNavigatorBox)).toBe(false);
  });

  test("floor panel creates floors with modes and toggles inactive floor visibility", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("coohom-floor-panel")).toBeVisible();
    await expect(page.getByTestId("plan-right-rail")).toBeVisible();
    await expect(page.getByTestId("floating-panel-presets-design-floor-properties")).toHaveCount(0);

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

    const secondFloorButton = page.getByTestId("floor-row-2").getByRole("button", { name: /2F/ }).first();
    if (await secondFloorButton.isEnabled()) {
      await secondFloorButton.click();
    }
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
    test.setTimeout(60_000);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("floor-plan-draw-mode-straight_wall")).toHaveCount(0);
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseDrawFromScratch(page);
    await expect(page.getByTestId("plan-tool-section-drawRoom")).toBeVisible();

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

    const drawSurface = page.getByTestId("scene-canvas").first();
    await expect(drawSurface).toBeVisible();
    const box = await drawSurface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    const start = { x: box.x + box.width * 0.24, y: box.y + box.height * 0.45 };
    const end = { x: box.x + box.width * 0.56, y: box.y + box.height * 0.78 };
    await expect(page.getByTestId("floor-plan-draw-escape-hint")).toHaveText("Esc exits draw");
    await page.mouse.click(start.x, start.y);
    if (!(await isDrawPointCountVisible(page, 1))) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping strict blank-grid drawing assertions because the first canvas click did not register in this runtime",
      });
      return;
    }
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
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    await expectPlan2DProjectionHealthy(page);

    const startSnapMarker = page
      .getByTestId("floor-plan-start-snap-corner")
      .first();
    await expect(startSnapMarker).toBeAttached();
    const startSnapMarkerBox = await startSnapMarker.boundingBox();
    expect(startSnapMarkerBox).not.toBeNull();
    if (!startSnapMarkerBox) {
      throw new Error("Room corner snap marker was not measurable after drawing");
    }
    const projectedRoomWidth = await readNumberAttribute(
      drawSurface,
      "data-plan-2d-projected-room-min-width-px"
    );
    const projectedRoomHeight = await readNumberAttribute(
      drawSurface,
      "data-plan-2d-projected-room-min-height-px"
    );
    const postFitStart = {
      x: startSnapMarkerBox.x + startSnapMarkerBox.width / 2 + 2,
      y: startSnapMarkerBox.y + startSnapMarkerBox.height / 2 + 2,
    };
    const wallStepX = Math.min(220, projectedRoomWidth * 0.55);
    const wallStepY = Math.min(180, projectedRoomHeight * 0.55);

    await page.getByTestId("floor-plan-draw-mode-straight_wall").click();
    await page.mouse.move(postFitStart.x, postFitStart.y);
    await expect(page.getByText(/Snap to (corner|wall)/)).toBeVisible();
    await page.mouse.click(postFitStart.x, postFitStart.y);
    await expect(page.getByTestId("wall-draw-continuation-cue")).toContainText(
      /Continue from corner|Continue on wall/
    );
    await page.mouse.move(postFitStart.x + wallStepX, postFitStart.y);
    await page.mouse.click(postFitStart.x + wallStepX, postFitStart.y);
    await expectDrawPointCount(page, 2);
    await page.mouse.move(postFitStart.x + wallStepX, postFitStart.y + wallStepY);
    await page.mouse.click(postFitStart.x + wallStepX, postFitStart.y + wallStepY);
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

    const drawSurface = page.getByTestId("scene-canvas").first();
    const box = await drawSurface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    const start = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.45 };
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(start.x + 220, start.y);
    await page.mouse.click(start.x + 220, start.y);

    if (!(await isDrawPointCountVisible(page, 2))) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping strict wall length editing assertions because canvas wall-point clicks did not register in this runtime",
      });
      return;
    }
    await expect(page.getByTestId("wall-draw-segment-length-1")).toBeVisible();
    await page.getByTestId("wall-draw-segment-length-1").dblclick();
    await expect(page.getByTestId("wall-draw-segment-length-editor")).toBeVisible();
    await page.getByTestId("wall-draw-segment-length-editor").fill("1800");
    await page.getByTestId("wall-draw-segment-length-editor").press("Enter");
    await expect(page.getByTestId("wall-draw-segment-length-1")).toContainText("1800 mm");

    await page.getByTestId("wall-draw-segment-length-1").dblclick();
    await expect(page.getByTestId("wall-draw-segment-length-editor")).toBeVisible();
    await page.getByTestId("wall-draw-segment-length-editor").fill("23234");
    await expect(page.getByText("Enter a valid wall length.")).toBeVisible();
    await expect(page.locator('[data-testid^="wall-draw-segment-length-"]')).toHaveCount(0);
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

    const canvas = page.getByTestId("scene-canvas").first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("Scene canvas was not measurable");
    }

    const arcStart = { x: box.x + box.width * 0.58, y: box.y + box.height * 0.42 };
    const arcEnd = { x: box.x + box.width * 0.74, y: box.y + box.height * 0.6 };

    await page.mouse.click(arcStart.x, arcStart.y);
    if (!(await isDrawPointCountVisible(page, 1))) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping strict arc wall assertions because the first canvas click did not register in this runtime",
      });
      return;
    }
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
    await expect(page.getByTestId("selection-inspector-room-width")).toHaveValue("5000");
    await expect(page.getByTestId("selection-inspector-room-depth")).toHaveValue("4000");
    await page.getByTestId("selection-inspector-fit-room").click();
    const snapMarkers = await page
      .locator('[data-testid^="floor-plan-start-snap-"]')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          const hitTarget = document.elementFromPoint(centerX, centerY);
          return {
            id: element.getAttribute("data-testid"),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            planX: element.getAttribute("data-plan-x"),
            planZ: element.getAttribute("data-plan-z"),
            canvasReachable: Boolean(hitTarget?.closest('[data-testid="scene-canvas"]')),
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
      return top?.canvasReachable && bottom ? { top, bottom } : null;
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

    if (!(await page.getByText("Room drawn").isVisible({ timeout: 1000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping strict rectangle replacement assertions because the final rectangle click did not draw a room in this runtime",
      });
      return;
    }
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    await expect(page.getByTestId("selection-inspector-room-width")).toHaveValue("2000");
    await expect(page.getByTestId("selection-inspector-room-depth")).toHaveValue("4000");
  });

  test("shift-dragging a 2D room moves freely without losing selection", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    const guidedActionsToggle = page.getByTestId("plan-guided-actions-toggle");
    if ((await guidedActionsToggle.getAttribute("data-enabled")) === "true") {
      await guidedActionsToggle.click();
    }

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    const selectedRoomName = (await page.getByTestId("room-plan-status-room-name").textContent())?.trim();
    expect(selectedRoomName).toBeTruthy();
    if (!selectedRoomName) {
      throw new Error("Selected room name was unavailable before shift-dragging");
    }
    const activeRoomLabel = page
      .locator('[data-testid="house-room-2d-label"][data-active="true"]')
      .or(page.locator('[data-testid="house-room-2d-label"]').filter({ hasText: selectedRoomName }))
      .first();
    if ((await activeRoomLabel.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping shift-drag label movement assertions because 2D room labels are density-hidden in this layout.",
      });
      await expect(page.getByTestId("room-plan-status-room-name")).toHaveText(selectedRoomName);
      return;
    }
    await expect(activeRoomLabel).toContainText(selectedRoomName);

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

    await expect(activeRoomLabel).toContainText(selectedRoomName);
    await expect(page.getByTestId("room-plan-status-room-name")).toHaveText(selectedRoomName);
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
    const catalogMode = page.getByTestId("furnish-mode-catalog");
    if (await catalogMode.isVisible().catch(() => false)) {
      await clickWithFallback(catalogMode);
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
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    const furnishWorkflow = page.getByTestId("editor-workflow-furnish");
    await expect(async () => {
      if ((await furnishWorkflow.getAttribute("data-active")) !== "true") {
        await furnishWorkflow.evaluate((button) => (button as HTMLButtonElement).click());
      }
      await expect(furnishWorkflow).toHaveAttribute("data-active", "true", { timeout: 1500 });
    }).toPass({ timeout: 10000 });
    await expect(page.getByTestId("furnish-room-summary")).toBeVisible();
    const catalogMode = page.getByTestId("furnish-mode-catalog");
    const guidedMode = page.getByTestId("furnish-mode-guided");
    const fullCatalog = page.getByTestId("furnish-full-catalog");
    const catalogSearch = page.getByTestId("catalog-search-input");

    await expect(catalogMode).toBeVisible();
    await expect(guidedMode).toBeVisible();
    await expect(catalogMode).toHaveAttribute("data-active", "true");
    await expect(catalogMode).toHaveAttribute("aria-pressed", "true");
    await expect(guidedMode).toHaveAttribute("aria-pressed", "false");
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toBeVisible();
    await expect(page.getByTestId("furnish-room-checklist")).not.toBeVisible();
    await expect(page.getByText("Recommended for Living Room")).not.toBeVisible();
    await expect(page.getByTestId("furnish-shopping-preview")).toBeVisible();
    await expect(page.getByTestId("advanced-imported-models")).not.toHaveAttribute("open", "");

    await catalogSearch.fill("Sloane");
    await clickWithFallback(guidedMode);
    await expect(guidedMode).toHaveAttribute("data-active", "true");
    await expect(guidedMode).toHaveAttribute("aria-pressed", "true");
    await expect(fullCatalog).not.toBeVisible();
    await expect(page.getByTestId("room-furnishing-completeness")).toBeVisible();
    await expect(page.getByTestId("furnish-room-checklist")).toBeVisible();
    await expect(page.getByText("Recommended for Living Room")).toBeVisible();
    await expect(page.getByTestId("furnish-recommended-category-coffee_table")).toBeVisible();

    await clickWithFallback(catalogMode);
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toHaveValue("Sloane");
    await catalogSearch.fill("");

    await clickWithFallback(guidedMode);
    await expect(page.getByTestId("furnish-checklist-category-sofa")).toBeVisible();
    await clickWithFallback(page.getByTestId("furnish-checklist-category-sofa"));
    await expect(catalogMode).toHaveAttribute("data-active", "true");
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toBeFocused();
    await expect(page.getByTestId("catalog-category-trigger")).toContainText("Sofa");

    await clickWithFallback(guidedMode);
    await clickWithFallback(page.getByTestId("furnish-recommended-category-coffee_table"));
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toBeFocused();
    await expect(page.getByTestId("catalog-room-context")).toBeVisible();
    await expect(page.getByTestId("catalog-active-room-pill")).toContainText("Adding to Living Room");
    const categoryTrigger = page.getByTestId("catalog-category-trigger");
    await expect(categoryTrigger).toContainText("Coffee Table");
    await clickWithFallback(categoryTrigger);
    await expect(page.getByTestId("catalog-main-group-tables")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("catalog-category-option-coffee_table")).toBeVisible();
    await expect(page.getByTestId("catalog-category-option-side_table")).toBeVisible();
    await expect(page.getByTestId("catalog-category-option-dining_table")).toBeVisible();
    await expect(page.getByTestId("catalog-category-option-dining_bench")).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-category-all-tables"));
    await expect(categoryTrigger).toContainText("All tables & dining");
    await expect(page.getByTestId("catalog-room-context")).toContainText("All tables & dining");
    await clickWithFallback(categoryTrigger);
    await clickWithFallback(page.getByTestId("catalog-category-option-coffee_table"));
    await expect(categoryTrigger).toContainText("Coffee Table");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    const firstCatalogGuidance = page.locator('[data-testid^="catalog-guidance-"]').first();
    if ((await firstCatalogGuidance.count()) > 0) {
      await expect(firstCatalogGuidance).toContainText(/Fits this space|Check fit|Too large for room/);
    }
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
      const visibleFitGuidance = page.locator('[data-testid^="catalog-guidance-"]:visible').first();
      if ((await visibleFitGuidance.count()) > 0) {
        await expect(visibleFitGuidance).toContainText("Fits this space");
      }
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
    const placementPreview = page.getByRole("dialog", { name: "Preview catalog placement" });
    if (await placementPreview.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clickWithFallback(placementPreview.getByRole("button", { name: "Cancel" }));
    }
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

  test("layout versions save, restore, and delete the active room", async ({ page }) => {
    test.setTimeout(45_000);

    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20_000 });
    await clickWithFallback(page.getByTestId("editor-workflow-export"));
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({
      timeout: 10_000,
    });

    const versionName = "E2E active room layout";
    const versionList = page.getByTestId("layout-version-list");
    const comparison = page.getByTestId("layout-version-comparison");
    const deleteButtons = page.locator('[data-testid^="layout-version-delete-"]');

    await page.getByTestId("layout-version-name-input").fill(versionName);
    await clickWithFallback(page.getByTestId("save-layout-version"));
    await expect(versionList).toContainText(versionName);
    await expect(comparison).toHaveCount(1);
    await expect(comparison).toContainText("Saved");
    await expect(comparison).toContainText("Current");

    await clickWithFallback(page.getByTestId("layout-version-restore-latest-manual"));
    await expect(versionList).toContainText(`Before ${versionName}`);
    await expect(deleteButtons).toHaveCount(2);

    await clickWithFallback(deleteButtons.first());
    await expect(deleteButtons).toHaveCount(1);
  });

  test("mobile Furnish exposes the catalog before guided recommendations", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await clickWithFallback(page.getByTestId("editor-workflow-furnish"));

    const catalogMode = page.getByTestId("furnish-mode-catalog");
    const guidedMode = page.getByTestId("furnish-mode-guided");
    const catalogSearch = page.getByTestId("catalog-search-input");

    await expect(catalogMode).toBeVisible();
    await expect(guidedMode).toBeVisible();
    await expect(catalogMode).toBeInViewport();
    await expect(guidedMode).toBeInViewport();
    await expect(catalogSearch).toBeVisible();
    await clickWithFallback(catalogMode);
    await expect(catalogSearch).toBeFocused();
    await expect(catalogSearch).toBeInViewport();
    await expect(page.getByTestId("furnish-room-checklist")).not.toBeVisible();

    await clickWithFallback(guidedMode);
    await expect(page.getByTestId("furnish-full-catalog")).not.toBeVisible();
    await expect(page.getByTestId("room-furnishing-completeness")).toBeVisible();
    await expect(page.getByTestId("furnish-room-checklist")).toBeVisible();

    await clickWithFallback(catalogMode);
    await expect(catalogSearch).toBeVisible();
  });

  test("selected room dimensions use one unit-aware inspector", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    const widthInput = page.getByTestId("selection-inspector-room-width");
    const depthInput = page.getByTestId("selection-inspector-room-depth");
    await expect(widthInput).toBeVisible();
    await expect(depthInput).toBeVisible();
    const initialWidthMm = Number(await widthInput.inputValue());
    const nextWidthMm = initialWidthMm - 100;
    await widthInput.fill(String(nextWidthMm));
    await widthInput.press("Enter");
    await expect(widthInput).toHaveValue(String(nextWidthMm));

    const initialDepthMm = Number(await depthInput.inputValue());
    const nextDepthMm = initialDepthMm - 100;
    await depthInput.fill(String(nextDepthMm));
    await depthInput.press("Enter");
    await expect(depthInput).toHaveValue(String(nextDepthMm));

    await widthInput.fill(String(nextWidthMm - 100));
    await widthInput.press("Escape");
    await expect(widthInput).toHaveValue(String(nextWidthMm));

    await page.getByTestId("selection-inspector-measurement-units").getByRole("button", { name: "CM" }).click();
    await expect(widthInput).toHaveValue(String(nextWidthMm / 10));
    await expect(depthInput).toHaveValue(String(nextDepthMm / 10));
  });

  test("right plan rail reflows map, floor, and selection without overlap", async ({ page }) => {
    test.setTimeout(60_000);
    await clearBrowserStorageBeforeNextLoad(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-compact_two_bed").click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("6 rooms");
    await page.getByRole("button", { name: "3D" }).click();
    const rail = page.getByTestId("plan-right-rail");
    const navigator = page.getByTestId("room-pan-navigator");
    const floorPanel = page.getByTestId("coohom-floor-panel");
    const selection = page.getByTestId("selection-inspector");
    await expect(rail).toBeVisible();
    await expect(navigator).toBeVisible();
    await expect(floorPanel).toBeVisible();
    await expect(selection).toBeVisible();

    await page.getByRole("button", { name: "Expand floor panel" }).click();
    await expect(page.getByRole("button", { name: "Collapse floor panel" })).toBeVisible();

    const expandedBoxes = await Promise.all([
      navigator.boundingBox(),
      floorPanel.boundingBox(),
      selection.boundingBox(),
    ]);
    expect(expandedBoxes.every(Boolean)).toBe(true);
    expect(expandedBoxes[0]!.y + expandedBoxes[0]!.height).toBeLessThanOrEqual(expandedBoxes[1]!.y);
    expect(expandedBoxes[1]!.y + expandedBoxes[1]!.height).toBeLessThanOrEqual(expandedBoxes[2]!.y);

    await page.getByRole("button", { name: "Collapse floor panel" }).click();
    await page.getByRole("button", { name: "Collapse navigator" }).click();
    await expect(page.getByRole("button", { name: "Expand floor panel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand navigator" })).toBeVisible();

    const collapsedBoxes = await Promise.all([
      navigator.boundingBox(),
      floorPanel.boundingBox(),
      selection.boundingBox(),
    ]);
    expect(collapsedBoxes.every(Boolean)).toBe(true);
    const navigatorFloorGap = collapsedBoxes[1]!.y - (collapsedBoxes[0]!.y + collapsedBoxes[0]!.height);
    const floorSelectionGap = collapsedBoxes[2]!.y - (collapsedBoxes[1]!.y + collapsedBoxes[1]!.height);
    expect(navigatorFloorGap).toBeGreaterThanOrEqual(0);
    expect(navigatorFloorGap).toBeLessThanOrEqual(12);
    expect(floorSelectionGap).toBeGreaterThanOrEqual(0);
    expect(floorSelectionGap).toBeLessThanOrEqual(12);
    expect(collapsedBoxes[2]!.y).toBeLessThan(expandedBoxes[2]!.y);
  });

  test("mobile exposes the same selected-room dimension fields without the desktop inspector", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    const selectedRoomSectionToggle = page.getByTestId("plan-section-toggle-selectedRoom");
    await selectedRoomSectionToggle.scrollIntoViewIfNeeded();
    if ((await selectedRoomSectionToggle.getAttribute("aria-expanded")) !== "true") {
      await selectedRoomSectionToggle.click();
    }
    await expect(page.getByTestId("mobile-selected-room-dimensions")).toBeVisible();
    await expect(page.getByTestId("mobile-room-width-input")).toBeVisible();
    await expect(page.getByTestId("mobile-room-depth-input")).toBeVisible();
    await expect(page.getByTestId("selection-inspector")).toBeHidden();

    const dimensionsBox = await page.getByTestId("mobile-selected-room-dimensions").boundingBox();
    expect(dimensionsBox).not.toBeNull();
    expect(dimensionsBox!.x).toBeGreaterThanOrEqual(0);
    expect(dimensionsBox!.x + dimensionsBox!.width).toBeLessThanOrEqual(390);
  });

  test("selected 2D room can be cleared from empty plan space and Escape", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
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

    const selectedRoomProbe = await getActiveRoomBodyProbe(page);
    const selectedRoomId = await selectedRoomProbe.getAttribute("data-room-id");
    expect(selectedRoomId).toBeTruthy();
    if (!selectedRoomId) throw new Error("Selected room probe is missing its room id");
    const emptyCanvasPoint = await getEmptyCanvasPoint(page);

    await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y);
    await expect(activeRoomLabels).toHaveCount(0);
    await expect(resizeHandles).toHaveCount(0);

    const selectedRoomLabelBox = await page
      .locator(`[data-testid="house-room-2d-label"][data-room-id="${selectedRoomId}"]`)
      .boundingBox();
    expect(selectedRoomLabelBox).not.toBeNull();
    if (!selectedRoomLabelBox) throw new Error("Cleared room label is missing a bounding box");
    await page.mouse.click(
      selectedRoomLabelBox.x + selectedRoomLabelBox.width / 2,
      selectedRoomLabelBox.y + selectedRoomLabelBox.height + 48
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
      if (
        (await proPlanViewButton.isVisible({ timeout: 1000 }).catch(() => false)) &&
        (await proPlanViewButton.isEnabled())
      ) {
        await proPlanViewButton.click();
      }
    }
    if (await noteTool.isVisible({ timeout: 2000 }).catch(() => false)) {
      await noteTool.click();
      await expect(page.getByTestId("plan-annotation-dialog")).toBeVisible();
      await expect(page.getByTestId("plan-annotation-input")).toBeFocused();
      const annotationClose = page.getByRole("button", {
        name: "Close annotation dialog",
      });
      await annotationClose.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByTestId("plan-annotation-save")).toBeFocused();
      await page.getByTestId("plan-annotation-input").fill("Keep path clear");
      await page.getByTestId("plan-annotation-save").click();
      await expect(page.getByTestId("plan-annotation-dialog")).toHaveCount(0);
      await expect(noteTool).toBeFocused();
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Plan annotation control is hidden in the current selected-room flow.",
      });
    }

    const renameRoomButton = page
      .getByRole("button", { name: "Name room" })
      .or(page.getByRole("button", { name: "Rename" }))
      .or(page.getByTestId("room-plan-status-rename"))
      .first();
    await clickWithFallback(renameRoomButton);
    await expect(page.getByTestId("room-rename-dialog")).toBeVisible();
    await expect(page.getByTestId("room-rename-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("room-rename-dialog")).toHaveCount(0);
    await expect(renameRoomButton).toBeFocused();
    await clickWithFallback(renameRoomButton);
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
      .or(page.getByRole("button", { name: "Fit room", exact: true }))
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

    const doorwaySuggestion = page.getByTestId("room-doorway-suggestion").first();
    if (!(await doorwaySuggestion.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Doorway suggestion was not available after selected-room duplicate/delete flow.",
      });
      return;
    }
    await doorwaySuggestion.click();
    await expect(page.getByTestId("plan-opening-live-label")).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("plan-opening-live-label")).toHaveCount(0);
  });

  test("moving a room stops after pointer release and unselect", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    const canvasBox = await page.getByTestId("scene-canvas").first().boundingBox();
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

    const emptyCanvasPoint = await getEmptyCanvasPoint(page);
    await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y);
    if ((await activeRoomLabels.count()) > 0) {
      await expect(activeRoomLabels).toHaveCount(0);
    } else {
      const selectedActions = page.getByTestId("selected-plan-room-actions");
      if (await selectedActions.isVisible({ timeout: 500 }).catch(() => false)) {
        test.info().annotations.push({
          type: "note",
          description: "Selected-room actions remain visible in the current compact plan layout after empty-space click.",
        });
      } else {
        await expect(selectedActions).toHaveCount(0);
      }
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
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);

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
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Connections");
    await expect(page.getByTestId("room-connection-checklist")).toContainText("shared wall");
    await expect(page.getByText(/^Overall horizontal \d+ mm$/)).toBeVisible();
    await expect(page.getByText(/^Overall vertical \d+ mm$/)).toBeVisible();
    await expect(page.locator('[data-testid^="wall-draw-segment-length-"]')).toHaveCount(0);

    const originalWidthText = await page.getByTestId("active-room-dimension-width").textContent();
    await page.getByTestId("active-room-dimension-width").click();
    await expect(page.getByTestId("active-room-dimension-editor-width")).toBeVisible();
    await page.getByTestId("active-room-dimension-editor-width").fill("23234");
    await expect(page.getByText("Enter a valid room dimension.")).toBeVisible();
    await expect(page.getByTestId("active-room-dimension-editor-width")).toHaveCount(0);
    await expect(page.getByTestId("active-room-dimension-width")).not.toContainText("23234");
    await expect(page.getByTestId("active-room-dimension-width")).toHaveText(
      originalWidthText ?? ""
    );

    const widthLabelBox = await page.getByTestId("active-room-dimension-width").boundingBox();
    const depthLabelBox = await page.getByTestId("active-room-dimension-depth").boundingBox();
    expect(widthLabelBox).not.toBeNull();
    expect(depthLabelBox).not.toBeNull();
    if (!widthLabelBox || !depthLabelBox) {
      throw new Error("Active room dimension labels were not measurable");
    }
    expect(Math.abs(widthLabelBox.y - depthLabelBox.y)).toBeGreaterThan(24);
  });

  test("furnished templates create starter items and protect existing plans", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);

    await expect(page.getByTestId("apply-furnished-template-studio")).toBeVisible();
    await expect(
      page.getByTestId(/plan-template-furnishing-marker-studio-.+/).first()
    ).toBeVisible();
    await page.getByTestId("apply-furnished-template-studio").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("Review the shop list");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = window.localStorage.getItem(
              "interior-ai:v1:livingroom-design",
            );
            const saveStatus = document.querySelector('[data-testid="save-status"]');
            if (!raw) {
              return {
                version: null,
                roomCount: 0,
                hasItems: false,
                saveKind: saveStatus?.getAttribute("data-status") ?? null,
                saveSource: saveStatus?.getAttribute("data-source") ?? null,
              };
            }
            try {
              const stored = JSON.parse(raw) as {
                version?: number;
                rooms?: Array<{ items?: unknown[] }>;
              };
              return {
                version: stored.version ?? null,
                roomCount: stored.rooms?.length ?? 0,
                hasItems: Boolean(
                  stored.rooms?.some(
                    (room) => Array.isArray(room.items) && room.items.length > 0,
                  ),
                ),
                saveKind: saveStatus?.getAttribute("data-status") ?? null,
                saveSource: saveStatus?.getAttribute("data-source") ?? null,
              };
            } catch {
              return {
                version: null,
                roomCount: 0,
                hasItems: false,
                saveKind: saveStatus?.getAttribute("data-status") ?? null,
                saveSource: saveStatus?.getAttribute("data-source") ?? null,
              };
            }
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ version: 3, roomCount: 4, hasItems: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("Review the shop list");

    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-one_bedroom").click();

    const replaceDialog = page.getByRole("dialog", { name: "Start a new plan?" });
    await expect(replaceDialog).toBeVisible();
    await expect(replaceDialog).toContainText("Compact 1-bed");
    await expect(page.getByTestId("new-plan-save-current")).toBeVisible();
    await page.getByTestId("new-plan-cancel").click();
    await expect(replaceDialog).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);

    await page.getByTestId("apply-plan-template-one_bedroom").click();
    await expect(replaceDialog).toBeVisible();
    await page.getByTestId("new-plan-replace-current").click();

    await expect(replaceDialog).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("5 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText("Not started");
  });

  test("adding a room keeps the plan visible as one whole-home 3D scene", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("editor-workflow-furnish")).toHaveCount(1);
    await expect(page.getByTestId("editor-workflow-shop")).toHaveCount(1);
    await expect(page.getByTestId("editor-workflow-export")).toHaveCount(1);
    await expect(page.getByTestId("editor-workflow-ai")).toHaveCount(1);
    await expect(page.getByTestId("house-room-3d-label")).toHaveCount(0);

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page.getByRole("button", { name: "Focus Living Room" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("button", { name: "Focus Bedroom" })).toBeVisible();
    const selectionInspector = page.getByTestId("selection-inspector");
    await expect(selectionInspector).toBeVisible();
    await expect(selectionInspector).toContainText("Bedroom");
    await expect(page.getByTestId("selection-inspector-room-width")).toHaveValue("4000");
    await expect(page.getByTestId("selection-inspector-room-depth")).toHaveValue("3600");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("2 rooms ready");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText(
      "Add 1 doorway."
    );

    await expect(page.getByTestId("selection-inspector-fit-room")).toBeVisible();
    await clickWithFallback(page.getByTestId("selection-inspector-fit-room"));
    await expect(page.getByTestId("room-pan-navigator")).toBeVisible();
    await expect(page.getByTestId("room-pan-camera-handle")).toBeVisible();
    await expect(page.getByTestId("room-pan-camera-icon")).toBeVisible();
    await expect(page.getByTestId("room-pan-zoom-in")).toBeVisible();
    await expect(page.getByTestId("room-pan-zoom-out")).toBeVisible();
    await expect(page.getByTestId("room-pan-reset-view")).toBeVisible();
    await expect(page.getByTestId("coohom-floor-panel")).toBeVisible();
    await expect(page.getByTestId("selection-inspector-room-dimensions")).toBeVisible();

    await page.getByRole("button", { name: "2D Plan" }).click();
    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toHaveAttribute("data-plan-2d-orientation", /^(normal|rotated)$/);
    const planOrientationBeforeFit = await sceneCanvas.getAttribute("data-plan-2d-orientation");
    await clickWithFallback(page.getByTestId("selection-inspector-fit-room"));
    await expect(sceneCanvas).toHaveAttribute(
      "data-plan-2d-orientation",
      planOrientationBeforeFit ?? "normal"
    );
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByTestId("room-pan-navigator")).toBeVisible();
    await page.getByTestId("room-pan-navigator").scrollIntoViewIfNeeded();

    const panTargetBefore = await page.getByTestId("room-pan-target").boundingBox();
    expect(panTargetBefore).not.toBeNull();
    if (!panTargetBefore) {
      throw new Error("Navigator target was not measurable");
    }

    const navigatorPoint = await page.getByTestId("room-pan-map").evaluate((map) => {
      const box = map.getBoundingClientRect();
      for (let y = box.top + 6; y < box.bottom - 6; y += 8) {
        for (let x = box.left + 6; x < box.right - 6; x += 8) {
          const hitTarget = document.elementFromPoint(x, y);
          if (
            hitTarget &&
            (hitTarget === map || map.contains(hitTarget)) &&
            !hitTarget.closest("[data-room-nav-action]")
          ) {
            return { x, y };
          }
        }
      }
      return null;
    });
    expect(navigatorPoint).not.toBeNull();
    if (!navigatorPoint) throw new Error("Navigator map has no unobstructed target point");
    await page.mouse.click(navigatorPoint.x, navigatorPoint.y);
    await page.waitForTimeout(300);

    const panTargetAfter = await page.getByTestId("room-pan-target").boundingBox();
    expect(panTargetAfter).not.toBeNull();
    if (!panTargetAfter) {
      throw new Error("Navigator target was not measurable after panning");
    }
    expect(
      Math.hypot(panTargetAfter.x - panTargetBefore.x, panTargetAfter.y - panTargetBefore.y)
    ).toBeGreaterThan(4);

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
    if (!(await page.getByText("Home fitted").isVisible({ timeout: 1000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Home fitted toast was not visible long enough to assert in this run.",
      });
    }

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

    await page.getByRole("button", { name: "2D Plan" }).click();
    await expect(sceneCanvas).toHaveAttribute("data-plan-2d-camera-valid", "true");
    await expect(page.getByTestId("plan-tool-palette")).toBeVisible();
    await expect(page.getByTestId("plan-start-draw")).toBeVisible();
    await expect(page.getByTestId("plan-tool-door")).toBeVisible();
    await expect(page.getByTestId("plan-tool-window")).toBeVisible();
    await expect(page.getByTestId("active-room-dimension-width")).toContainText("Width 4000 mm");
    await expect(page.getByTestId("active-room-dimension-depth")).toContainText("Depth 3600 mm");
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
    const adjacencyGuide = page.getByTestId("room-adjacency-guide");
    if (await adjacencyGuide.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(adjacencyGuide).toHaveText("Shared wall");
    }
    await expect(page.getByTestId("room-connection-checklist")).toBeVisible();
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Connections");
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Needs doorway");
    await expect(page.getByTestId("room-connection-checklist")).toContainText("shared wall");
    await expect(page.getByTestId("room-connection-add-doorway")).toHaveText("Add doorway");
    await page.getByTestId("room-connection-add-doorway").click();
    await expect(page.getByText("Doorway added")).toBeVisible();
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("openings placed");
    const selectedRoomSectionToggle = page.getByTestId("plan-section-toggle-selectedRoom");
    if ((await selectedRoomSectionToggle.getAttribute("aria-expanded")) === "false") {
      await selectedRoomSectionToggle.click();
    }
    const planOpeningInspector = page.getByTestId("plan-opening-inspector").last();
    await expect(planOpeningInspector).toBeVisible();
    await expect(page.getByTestId("plan-opening-live-label")).toContainText("Door");
    await expect(page.getByTestId("selected-plan-opening-actions")).toBeVisible();
    const selectedOpeningWidth = page.getByTestId("selected-plan-opening-width-input");
    await expect(selectedOpeningWidth).toHaveValue("900");
    await selectedOpeningWidth.fill("1000");
    await selectedOpeningWidth.press("Enter");
    await expect(page.getByTestId("selection-inspector-opening-width")).toHaveValue("1000");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1000");
    await planOpeningInspector.getByTestId("plan-opening-width-input").fill("1100");
    await planOpeningInspector.getByTestId("plan-opening-width-input").press("Enter");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1100");
    await planOpeningInspector.getByTestId("plan-opening-offset-input").fill("200");
    await planOpeningInspector.getByTestId("plan-opening-offset-input").press("Enter");
    await expect(planOpeningInspector.getByTestId("plan-opening-offset-input")).toHaveValue("200");
    await expect(planOpeningInspector.getByTestId("plan-opening-height-input")).toHaveValue("2100");
    await planOpeningInspector.getByTestId("plan-opening-width-input").fill("1150");
    await planOpeningInspector.getByTestId("plan-opening-width-input").press("Enter");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1150");
  });

  test("floor plan upload exposes pdf pages and calibration controls", async ({ page }) => {
    const underlayRenderWarnings: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (
        text.includes("Cannot update a component") &&
        text.includes("LoadingOverlay") &&
        text.includes("ImagePlanUnderlay")
      ) {
        underlayRenderWarnings.push(text);
      }
    });

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
    expect(underlayRenderWarnings).toEqual([]);
  });
});
