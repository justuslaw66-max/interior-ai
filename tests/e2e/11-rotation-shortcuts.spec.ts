import { type Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
} from "./variant-test-utils";

const ROTATION_TEST_ITEM_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

async function readAngle(page: Page) {
  const text = await page.getByTestId("rotation-angle-label").innerText();
  const match = text.match(/Angle\s+(-?\d+)/i);
  if (!match) {
    throw new Error(`Unable to parse angle from label: ${text}`);
  }
  return normalizeAngle(Number(match[1]));
}

async function expectAngle(page: Page, expected: number) {
  await expect
    .poll(() => readAngle(page), { timeout: 5_000 })
    .toBe(normalizeAngle(expected));
}

async function setupSelectedItem(page: Page): Promise<void> {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "pro", source: "playwright" }),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });

  const planReady = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === "/api/me" &&
      candidate.status() === 200,
    { timeout: 120_000 },
  );
  const response = await page.goto("/design?mode=designer", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await planReady;
  await expect(page.getByTestId("editor-tool-rail")).toBeVisible({
    timeout: 15_000,
  });

  const opened = await openCatalogPreview(
    page,
    ROTATION_TEST_ITEM_ID,
    "Hugg",
  );
  expect(opened, "The Hugg rotation fixture must be available").toBe(true);
  await expect(page.getByTestId("catalog-item-drawer")).toContainText(
    "Hugg Nesting Square Coffee Table",
  );
  await addCatalogDrawerItemToRoom(page);

  const selectedItemPanel = getSelectedItemPanel(page);
  await expect(selectedItemPanel).toBeVisible({ timeout: 15_000 });
  await expect(selectedItemPanel).toContainText(
    "Hugg Nesting Square Coffee Table",
  );

  const rotationToggle = selectedItemPanel.getByTestId(
    "rotation-controls-toggle",
  );
  await expect(rotationToggle).toBeVisible();
  await expect(rotationToggle).toBeEnabled();
  if ((await rotationToggle.getAttribute("aria-expanded")) !== "true") {
    await rotationToggle.click();
  }
  await expect(rotationToggle).toHaveAttribute("aria-expanded", "true");

  await expect(page.getByTestId("rotation-angle-label")).toBeVisible();
  await expect(page.getByTestId("rotation-btn-reset")).toBeVisible();
  await expect(page.getByTestId("rotation-btn-reset")).toBeEnabled();
  await expect(page.getByTestId("rotation-input")).toBeVisible();
  await expect(page.getByTestId("rotation-input")).toBeEnabled();
  await expect(page.getByTestId("rotation-input-apply")).toBeVisible();
  await expect(page.getByTestId("rotation-input-apply")).toBeEnabled();

  await page.getByTestId("rotation-btn-reset").click();
  await expectAngle(page, 0);
}

test.describe("11. Rotation Shortcuts And Presets", () => {
  test("Q/E and R and 0 rotate as expected", async ({ page }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const start = await readAngle(page);

    await page.keyboard.press("E");
    await expectAngle(page, start + 15);

    await page.keyboard.press("Q");
    await expectAngle(page, start);

    await page.keyboard.press("R");
    await expectAngle(page, start + 90);

    await page.keyboard.press("0");
    await expectAngle(page, 0);
  });

  test("snap presets update keyboard step behavior", async ({ page }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const start = await readAngle(page);

    const precisePreset = page.getByTestId("rotation-snap-preset-5");
    await expect(precisePreset).toBeVisible();
    await expect(precisePreset).toBeEnabled();
    await precisePreset.click();
    await page.keyboard.press("E");
    await expectAngle(page, start + 5);

    const freePreset = page.getByTestId("rotation-snap-preset-free");
    await expect(freePreset).toBeVisible();
    await expect(freePreset).toBeEnabled();
    await freePreset.click();
    await page.keyboard.press("E");
    await expectAngle(page, start + 6);
  });

  test("exact-angle input ignores rotate shortcuts and applies its value", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const start = await readAngle(page);
    const input = page.getByTestId("rotation-input");
    const applyButton = page.getByTestId("rotation-input-apply");

    await expect(input).toHaveAttribute(
      "aria-label",
      "Exact rotation angle in degrees",
    );
    await input.fill("33");
    await expect(input).toHaveValue("33");
    await page.keyboard.press("E");
    await expectAngle(page, start);

    await input.fill("33");
    await applyButton.click();
    await expectAngle(page, 33);
    await expect(input).toHaveValue("33");
  });
});
