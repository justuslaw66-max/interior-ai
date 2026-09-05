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

test("Auto preserves quality through idle, resize and finite camera interactions", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.assign(window, { __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__: true });
    localStorage.removeItem("scene_performance_mode");
  });
  await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });
  const view3d = page.locator('[data-testid="editor-view-3d"]:visible').first();
  await view3d.click();
  const canvas = page.getByTestId("scene-canvas").first();
  const auto = page.getByTestId("qa-scene-performance");
  const observations = [];
  await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
  observations.push(await expectIdle(page));
  await expect(auto).toHaveAttribute("data-scene-ready", "true");
  await page.waitForTimeout(5500);
  await page.setViewportSize({ width: 1350, height: 800 });
  observations.push(await expectIdle(page));
  expect(observations[1].rendererCalls).toBeGreaterThan(observations[0].rendererCalls);
  await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
  for (let interaction = 0; interaction < 4; interaction += 1) {
    await page.waitForTimeout(1500);
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Scene canvas is absent");
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7 + 50, bounds.y + bounds.height * 0.4 + 20, { steps: 8 });
    await page.mouse.up();
    observations.push(await expectIdle(page));
    expect(observations[interaction + 2].rendererCalls).toBeGreaterThan(observations[interaction + 1].rendererCalls);
    await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
  }
  await expect(auto).toHaveAttribute("data-mode", "auto");
  await expect(auto).toHaveAttribute("data-auto-lite", "false");
  await testInfo.attach("auto-idle-quality", {
    body: JSON.stringify({ mode: "auto", shadowsEnabled: true, observations }),
    contentType: "application/json",
  });
});
