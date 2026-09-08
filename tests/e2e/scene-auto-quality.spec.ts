import { expect, test, type Page } from "@playwright/test";
import type { SceneDemandSnapshot } from "../../components/scene/sceneDemandDiagnostics";

async function demandSnapshot(page: Page) {
  return page.evaluate(() => {
    const hook = (window as typeof window & {
      __INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__?: () => SceneDemandSnapshot;
    }).__INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__;
    if (!hook) throw new Error("Demand renderer diagnostics unavailable");
    return hook();
  });
}

async function expectIdle(page: Page) {
  await expect.poll(async () => {
    const before = await demandSnapshot(page);
    await page.waitForTimeout(1200);
    const after = await demandSnapshot(page);
    return after.rendererCalls === before.rendererCalls &&
      !after.pendingInvalidation && after.activeSupportedAnimationCount === 0;
  }, { timeout: 30_000 }).toBe(true);
  return demandSnapshot(page);
}

test("Auto preserves quality through idle and repeated finite resize interactions", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.assign(window, { __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__: true });
    localStorage.removeItem("scene_performance_mode");
  });
  const response = await page.goto("/design", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const view3d = page.locator('[data-testid="editor-view-3d"]:visible').first();
  await expect(view3d).toBeVisible();
  if (await view3d.getAttribute("aria-pressed") !== "true") await view3d.click();
  const canvas = page.getByTestId("scene-canvas").first();
  await expect(canvas).toHaveCSS("opacity", "1", { timeout: 30_000 });
  const observations = [];
  await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
  observations.push(await expectIdle(page));
  await page.waitForTimeout(5500);
  await page.setViewportSize({ width: 1350, height: 800 });
  observations.push(await expectIdle(page));
  expect(observations[1].rendererCalls).toBeGreaterThan(observations[0].rendererCalls);
  await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
  for (let interaction = 0; interaction < 4; interaction += 1) {
    await page.waitForTimeout(1500);
    await page.setViewportSize({ width: 1360 + interaction * 10, height: 800 });
    observations.push(await expectIdle(page));
    expect(observations[interaction + 2].rendererCalls).toBeGreaterThan(observations[interaction + 1].rendererCalls);
    await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
  }
  expect(await page.evaluate(() => localStorage.getItem("scene_performance_mode"))).toBe("auto");
  await page.getByTestId("editor-command-overflow").click();
  const auto = page.getByTestId("scene-performance-auto");
  await expect(auto).toHaveAttribute("data-active", "true");
  await expect(auto).toHaveText("Auto");
  await testInfo.attach("auto-idle-quality", {
    body: JSON.stringify({ mode: "auto", shadowsEnabled: true, observations }),
    contentType: "application/json",
  });
});
