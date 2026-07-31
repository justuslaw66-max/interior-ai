import fs from "node:fs";
import { expect } from "../fixtures";

export const EDITOR_STORAGE_KEY = "interior-ai:v1:livingroom-design";

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
    .filter({ hasText: /Upgrade to Pro|Save and sync this design/i })
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
      .filter({ hasText: /Upgrade to Pro|Save and sync this design/i }),
  ).toHaveCount(0, { timeout: 5000 });
}

export async function openDetailedProStudio(page: import("@playwright/test").Page) {
  await mockPlan(page, "pro");
  await page.goto("/design?mode=designer");

  const openStudio = page.getByTestId("open-custom-millwork-studio");
  await expect(openStudio).toBeVisible({ timeout: 30000 });
  await dismissBlockingPrompt(page);
  await openStudio.click();
  await expect(page.getByTestId("custom-millwork-studio")).toBeVisible({ timeout: 15000 });
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

