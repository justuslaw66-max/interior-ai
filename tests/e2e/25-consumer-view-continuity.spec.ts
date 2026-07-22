import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
} from "./variant-test-utils";

const HUGG_SQUARE_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

async function readFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/);
  const fingerprint = await marker.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Editor snapshot fingerprint is missing");
  return fingerprint;
}

async function expectContinuity(
  page: Page,
  panel: Locator,
  expected: {
    fingerprint: string;
    dimensions: string;
    positionX: string;
    positionZ: string;
    angle: string;
  }
): Promise<void> {
  await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
    "data-fingerprint",
    expected.fingerprint
  );
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Hugg Nesting Square Coffee Table");
  await expect(panel.getByTestId("selected-item-dimensions")).toHaveText(
    expected.dimensions
  );
  await expect(panel.getByTestId("selected-item-position-x")).toHaveValue(
    expected.positionX
  );
  await expect(panel.getByTestId("selected-item-position-z")).toHaveValue(
    expected.positionZ
  );
  await expect(page.getByTestId("rotation-angle-label")).toHaveText(expected.angle);
}

test.describe("25. Consumer 2D and 3D continuity", () => {
  test("retains selected object identity, transform, dimensions, material, and project state", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "free", source: "playwright" }),
      });
    });
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    });

    const response = await page.goto("/design", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    const continueToFurnish = page.getByTestId("room-setup-continue-furnish");
    if (await continueToFurnish.isVisible().catch(() => false)) {
      await continueToFurnish.click();
    }

    expect(await openCatalogPreview(page, HUGG_SQUARE_ID, "Hugg")).toBe(true);
    const drawer = page.getByTestId("catalog-item-drawer");
    const dune = drawer.getByRole("button", { name: /Performance Dune/i }).first();
    if (await dune.isVisible().catch(() => false)) await dune.click();
    await addCatalogDrawerItemToRoom(page);

    const panel = getSelectedItemPanel(page);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const advanced = panel.getByTestId("selected-item-advanced-controls-toggle");
    if ((await advanced.getAttribute("aria-expanded")) !== "true") await advanced.click();
    await panel.getByTestId("selected-item-nudge-right").click();
    await page.getByTestId("rotation-controls-toggle").click();
    await page.getByTestId("rotation-btn-quarter-turn").click();
    await expect(page.getByTestId("rotation-angle-label")).toContainText("90 deg");

    const expected = {
      fingerprint: await readFingerprint(page),
      dimensions: await panel.getByTestId("selected-item-dimensions").innerText(),
      positionX: await panel.getByTestId("selected-item-position-x").inputValue(),
      positionZ: await panel.getByTestId("selected-item-position-z").inputValue(),
      angle: await page.getByTestId("rotation-angle-label").innerText(),
    };

    const view2d = page.locator('[data-testid="editor-view-2d"]:visible').first();
    const view3d = page.locator('[data-testid="editor-view-3d"]:visible').first();
    await expect(view3d).toHaveAttribute("aria-pressed", "true");
    await expect(view2d).toHaveAttribute("aria-pressed", "false");

    await view2d.click();
    await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute(
      "data-view-mode",
      "2d"
    );
    await expect(view2d).toHaveAttribute("aria-pressed", "true");
    await expect(view3d).toHaveAttribute("aria-pressed", "false");
    await expectContinuity(page, panel, expected);

    await view3d.click();
    await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute(
      "data-view-mode",
      "3d"
    );
    await expect(view3d).toHaveAttribute("aria-pressed", "true");
    await expect(view2d).toHaveAttribute("aria-pressed", "false");
    await expectContinuity(page, panel, expected);
  });
});
