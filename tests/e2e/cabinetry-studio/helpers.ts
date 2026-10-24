import fs from "node:fs";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import { expect } from "../fixtures";

export const EDITOR_STORAGE_KEY = "interior-ai:v1:livingroom-design";

// The suite's values are millimetres, and new projects open in centimetres
// (DEFAULT_DISPLAY_UNIT), so each test starts in millimetres. A unit the test
// or the app has already stored is kept, so the free-plan test's centimetres win.
export async function startInMillimetres(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem("plan_measurement_unit") === null) {
      window.localStorage.setItem("plan_measurement_unit", "mm");
    }
  });
}

/**
 * Picks a laminate in one of the Detailed editor's finish fields: opens it, searches by the
 * supplier's code and chooses the design, then checks the field took it.
 *
 * It presses "Change" straight after any typing, as a person would: placement.ts types a 1,200 mm
 * module width first, whose "Width needs attention" used to appear during the press, move the
 * button and lose the click (laminates r3, 23 Oct). Number fields now hold a new message until the
 * press's click has landed (useHeldDuringPointerPress).
 */
export async function chooseCabinetFinish(
  page: import("@playwright/test").Page,
  fieldTestId: string,
  code: string,
  materialId: string
) {
  const field = page.getByTestId(fieldTestId);
  if ((await page.getByTestId(`${fieldTestId}-picker`).count()) === 0) {
    await page.getByTestId(`${fieldTestId}-change`).click();
  }
  await expect(page.getByTestId(`${fieldTestId}-change`)).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId(`${fieldTestId}-picker-search`).fill(code);
  await page.getByTestId(`${fieldTestId}-picker-${materialId}`).click();
  await expect(field).toHaveAttribute("data-value", materialId);
  await page.getByTestId(`${fieldTestId}-change`).click();
  await expect(page.getByTestId(`${fieldTestId}-picker`)).toHaveCount(0);
}

export async function mockPlan(page: import("@playwright/test").Page, plan: "free" | "pro") {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan, source: "playwright" }),
    });
  });
}

export async function dismissBlockingPrompt(page: import("@playwright/test").Page) {
  const overlay = page
    .locator(".fixed.inset-0.z-50:visible")
    .filter({ hasText: /Upgrade to Pro|Sign in to save this design/i })
    .last();
  if (!(await overlay.isVisible().catch(() => false))) return;

  const closeButton = overlay
    .locator("button:visible")
    .filter({ hasText: /Maybe later|Close|Not now/i })
    .last();
  if ((await closeButton.count()) > 0 && await closeButton.isVisible().catch(() => false)) {
    await closeButton
      .click({ force: true, timeout: 2000 })
      .catch(() => page.keyboard.press("Escape"));
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(
    page
      .locator(".fixed.inset-0.z-50:visible")
      .filter({ hasText: /Upgrade to Pro|Sign in to save this design/i }),
  ).toHaveCount(0, { timeout: 5000 });
}

// Built-ins opens from inside the Furnish step.
export async function openMillworkStudioFromWorkspaceMenu(
  page: import("@playwright/test").Page
) {
  const furnishStep = page.getByTestId("editor-workflow-furnish");
  await expect(furnishStep).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await dismissBlockingPrompt(page);
  await furnishStep.click();
  const openStudio = page.getByTestId("editor-workflow-millwork");
  await expect(openStudio).toBeVisible();
  await openStudio.click();
  await expect(page.getByTestId("custom-millwork-studio")).toBeVisible({ timeout: 15000 });
}

export async function openDetailedProStudio(page: import("@playwright/test").Page) {
  await mockPlan(page, "pro");
  await page.goto("/design?mode=designer");

  await openMillworkStudioFromWorkspaceMenu(page);
  await page.getByTestId("cabinet-experience-detailed").click();
  await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute(
    "data-experience",
    "detailed"
  );
  await page.getByTestId("cabinet-module-options-toggle").click();
  await expect(page.getByTestId("cabinet-module-options")).toBeVisible();
}

export async function configureCabinetRunForExport(page: import("@playwright/test").Page) {
  await openDetailedProStudio(page);
  await page.getByTestId("cabinet-preset-cabinet_run").click();
  await expect(page.getByTestId("cabinet-module-3")).toBeVisible();
  await page.getByTestId("cabinet-module-3").click();
  await page.getByTestId("cabinet-module-move-left").click();
  await expect(page.getByTestId("cabinet-module-2")).toHaveAttribute(
    "data-module-id",
    "module-3"
  );
  await page.getByTestId("cabinet-output-tab-outputs").click();

  const sourceDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("cabinet-download-source-definition").click();
  const sourceDownload = await sourceDownloadPromise;
  const sourceDownloadPath = await sourceDownload.path();
  expect(sourceDownloadPath).toBeTruthy();

  return JSON.parse(fs.readFileSync(sourceDownloadPath!, "utf8"));
}

export async function placeCabinetRun(page: import("@playwright/test").Page) {
  const sourceJson = await configureCabinetRunForExport(page);
  await page.getByTestId("cabinet-place-in-plan").click();

  const placedCabinet = page.getByTestId("placed-millwork-asset").first();
  await expect(placedCabinet).toHaveCount(1, { timeout: 30000 });
  const beforePosition = await placedCabinet.getAttribute("data-position");
  const beforeRotation = await placedCabinet.getAttribute("data-rotation-y");
  const instanceId = await placedCabinet.getAttribute("data-instance-id");
  expect(beforePosition).toBeTruthy();
  expect(beforeRotation).toBeTruthy();
  expect(instanceId).toBeTruthy();
  await dismissBlockingPrompt(page);

  return {
    sourceJson,
    placedCabinet,
    beforePosition: beforePosition!,
    beforeRotation: beforeRotation!,
    instanceId: instanceId!,
  };
}

type PagePoint = { x: number; y: number };

/** The selected run's outline in the 3D view: CabinetSceneItem draws it in #2563eb. */
function isSelectionOutlineBlue(red: number, green: number, blue: number) {
  return blue > 150 && blue - red > 90 && blue - green > 60;
}

/** The middle of the selection outline in a picture of the canvas, in page pixels; null when none is drawn. */
async function selectionOutlineMiddle(sceneCanvas: Locator): Promise<PagePoint | null> {
  const box = await sceneCanvas.boundingBox();
  if (!box) return null;
  const { data, info } = await sharp(await sceneCanvas.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelScale = info.width / box.width;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (!isSelectionOutlineBlue(data[offset]!, data[offset + 1]!, data[offset + 2]!)) continue;
    const pixel = offset / info.channels;
    count += 1;
    sumX += pixel % info.width;
    sumY += Math.floor(pixel / info.width);
  }
  // A run's outline is a few hundred pixels at 1280x720; a stray few are not a run.
  if (count < 40 * pixelScale) return null;
  return { x: box.x + sumX / count / pixelScale, y: box.y + sumY / count / pixelScale };
}

/**
 * Where to press the selected cabinet run in the 3D canvas, in page pixels: the middle of its
 * selection outline, once the scene is ready and the outline has stopped moving.
 *
 * The run's place in the canvas follows the camera and the panels around it, so it is found in a
 * picture rather than at a fixed share of the canvas. A fixed point, 49% across and 58% down, hit
 * the run while the canvas filled the window. Since the canvas became a card beside the step panel,
 * with 3D views centred between that panel and the right rail (#189), that point is on the floor
 * beside the run, and the drag turned the camera instead (line, 24 Oct).
 */
export async function locateSelectedCabinetRun(page: Page): Promise<PagePoint> {
  const sceneCanvas = page.getByTestId("scene-canvas").first();
  await expect(page.getByTestId("qa-scene-performance")).toHaveAttribute("data-scene-ready", "true", {
    timeout: 30000,
  });
  const seen: PagePoint[] = [];
  await expect(async () => {
    const middle = await selectionOutlineMiddle(sceneCanvas);
    expect(middle, "the selected run's outline is drawn in the 3D canvas").not.toBeNull();
    seen.push(middle!);
    const [before, now] = seen.slice(-2);
    const still = Boolean(before && now && Math.hypot(now.x - before.x, now.y - before.y) <= 1.5);
    expect(still, "the run has stopped moving in the canvas").toBe(true);
  }).toPass({ timeout: 15000 });
  const point = seen[seen.length - 1]!;
  const onCanvas = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return target instanceof HTMLCanvasElement && Boolean(target.closest('[data-testid="scene-canvas"]'));
  }, point);
  expect(onCanvas, "no panel covers the run where the press lands").toBe(true);
  return point;
}

