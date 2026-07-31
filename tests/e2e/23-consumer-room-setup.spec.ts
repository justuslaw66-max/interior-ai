import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should be measurable`).not.toBeNull();
  expect(box?.height ?? 0, `${label} should be at least 44px tall`).toBeGreaterThanOrEqual(44);
}

async function openConsumerRoomSetup(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });

  const response = await page.goto("/design", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "2D Plan", exact: true }).click();
  await expect(page.getByTestId("consumer-room-setup")).toBeVisible({ timeout: 20_000 });
}

test.describe("23. Consumer room setup", () => {
  test("validates measured dimensions, persists units, and keeps correction paths touch friendly", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openConsumerRoomSetup(page);

    await expect(page.getByTestId("room-setup-status")).toHaveText("Room ready");
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText("Visible scale:");
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText("m²");

    for (const section of ["importFloorPlan", "drawRoom", "openings", "templates"]) {
      await expect(
        page.getByTestId(`plan-tool-section-${section}`).getByRole("button").first()
      ).toHaveAttribute("aria-expanded", "false");
    }

    const millimetres = page.getByTestId("room-setup-unit-mm");
    const centimetres = page.getByTestId("room-setup-unit-cm");
    await expect(millimetres).toHaveAttribute("aria-pressed", "true");
    await centimetres.focus();
    await page.keyboard.press("Enter");
    await expect(centimetres).toHaveAttribute("aria-pressed", "true");
    await expect(millimetres).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("plan_measurement_unit")))
      .toBe("cm");

    const width = page.getByTestId("room-setup-width-input");
    const originalModelWidth = Number(await width.getAttribute("data-model-value-mm"));
    expect(originalModelWidth).toBeGreaterThanOrEqual(1_800);

    await width.fill("10");
    await width.press("Enter");
    await expect(width).toHaveAttribute("aria-invalid", "true");
    await expect(width).toHaveAttribute("data-model-value-mm", String(originalModelWidth));
    await expect(
      width.locator("xpath=../following-sibling::span[@role='alert']")
    ).toContainText("Enter 180 cm or more.");

    await width.press("Escape");
    await expect(width).not.toHaveAttribute("aria-invalid", "true");
    await expect(width).toHaveValue(String(originalModelWidth / 10));

    const revisedWidthCm = originalModelWidth / 10 - 5;
    await width.fill(String(revisedWidthCm));
    await width.press("Enter");
    await expect(width).toHaveAttribute(
      "data-model-value-mm",
      String(originalModelWidth - 50)
    );
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText(
      `${revisedWidthCm} cm`
    );

    const importFloorPlanSection = page.getByTestId(
      "plan-tool-section-importFloorPlan"
    );
    await importFloorPlanSection
      .getByRole("button", { name: "Import floor plan", exact: true })
      .click();
    await expect(
      importFloorPlanSection.getByRole("button", {
        name: "Import floor plan",
        exact: true,
      })
    ).toHaveAttribute("aria-expanded", "true");

    const touchTargets = [
      [millimetres, "millimetres unit"],
      [centimetres, "centimetres unit"],
      [page.getByTestId("room-setup-unit-in"), "inches unit"],
      [width, "room width"],
      [page.getByTestId("room-setup-depth-input"), "room depth"],
      [page.getByTestId("plan-tool-door"), "add door"],
      [page.getByTestId("plan-tool-window"), "add window"],
      [page.getByTestId("room-setup-continue-furnish"), "continue to furnish"],
      [page.getByTestId("plan-start-template"), "starter layouts"],
      [page.getByTestId("plan-start-draw"), "draw measured room"],
      [page.getByTestId("plan-tool-import-2d"), "import 2D drawing"],
    ] as const;
    for (const [locator, label] of touchTargets) {
      await expectTouchTarget(locator, label);
    }
    await expect(
      page.getByText("Upload an existing plan", { exact: true })
    ).toHaveCount(0);

    await page.getByTestId("plan-tool-window").click();
    await expect(page.getByTestId("plan-focus-control")).toContainText("Placing window");
    await expect(page.getByTestId("plan-focus-progress")).toHaveText("Pick wall");
    await expect(page.getByTestId("plan-canvas-guidance")).toContainText(
      "Click the wall where it belongs."
    );
    await page.getByTestId("plan-focus-done").click();

    await page.getByTestId("plan-start-template").click();
    await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(4);
  });
});
