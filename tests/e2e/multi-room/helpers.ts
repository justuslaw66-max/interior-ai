import { expect } from "../fixtures";
import type { Locator, Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function createSampleFloorPlanPdf(): Promise<Buffer> {
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

export async function clickWithFallback(locator: Locator, timeout = 5000) {
  try {
    await locator.click({ timeout, noWaitAfter: true });
  } catch {
    await locator.evaluate((node) => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
}

export async function clearBrowserStorageBeforeNextLoad(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export async function expectInactiveOrHidden(locator: Locator) {
  if ((await locator.count()) === 0) return;
  await expect(locator).toHaveAttribute("data-active", "false");
}

export async function expectPlan2DProjectionHealthy(page: Page) {
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

export async function readNumberAttribute(locator: Locator, attribute: string) {
  return Number(await locator.getAttribute(attribute));
}

export async function getActiveRoomBodyProbe(page: Page) {
  const activeRoomProbe = page
    .getByTestId("house-room-2d-hit-probe")
    .or(page.locator('[data-testid="house-room-2d-label"][data-active="true"]'))
    .first();
  await expect(activeRoomProbe).toBeAttached({ timeout: 10000 });
  return activeRoomProbe;
}

export async function getEmptyCanvasPoint(page: Page) {
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

export function boxesOverlap(
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

export async function chooseDrawFromScratch(page: Page) {
  const firstStartDraw = page.getByTestId("plan-start-draw");
  if (await firstStartDraw.isVisible().catch(() => false)) {
    await expect(page.getByTestId("plan-start-template")).toBeVisible();
    await firstStartDraw.click();
    await openDrawToolPanelIfNeeded(page);
    return;
  }

  await expect(page.getByTestId("floor-plan-tool-draw_room")).toBeVisible();
  await page.getByTestId("floor-plan-tool-draw_room").click();
  await openDrawToolPanelIfNeeded(page);
}

export async function openDrawToolPanelIfNeeded(page: Page) {
  const straightWallTool = page.getByTestId("floor-plan-draw-mode-straight_wall");
  if ((await straightWallTool.count()) > 0) return;

  const planFocusPanelButton = page.getByRole("button", { name: "Panel" });
  if (await planFocusPanelButton.isVisible().catch(() => false)) {
    await planFocusPanelButton.click();
  }
}

export function drawPointCountLocator(page: Page, count: number) {
  const focusLabel = count === 1 ? "1 corner" : `${count} corners`;
  return page
    .getByText(`Wall points: ${count}`)
    .or(page.getByRole("toolbar", { name: "Plan focus controls" }).getByText(focusLabel))
    .first();
}

export async function expectDrawPointCount(page: Page, count: number) {
  await expect(drawPointCountLocator(page, count)).toBeVisible();
}

export async function isDrawPointCountVisible(page: Page, count: number) {
  return drawPointCountLocator(page, count).isVisible({ timeout: 1000 }).catch(() => false);
}

export async function chooseTemplateStart(page: Page) {
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
