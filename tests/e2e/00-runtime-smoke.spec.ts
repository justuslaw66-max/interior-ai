import { expect, test } from "./fixtures";

test.describe("00. Runtime smoke", () => {
  test("furnished template remains stable without a render loop", async ({ page }) => {
    test.setTimeout(90_000);
    const fatalErrors: string[] = [];

    page.on("pageerror", (error) => fatalErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /maximum update depth exceeded|too many re-renders/i.test(message.text())
      ) {
        fatalErrors.push(message.text());
      }
    });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });

    const betaStartTemplate = page.getByTestId("beta-start-template");
    if (await betaStartTemplate.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await betaStartTemplate.click();
    } else if (
      await page.getByTestId("plan-start-template").isVisible({ timeout: 5_000 }).catch(() => false)
    ) {
      await page.getByTestId("plan-start-template").click();
    }

    const studioTemplate = page.getByTestId("apply-furnished-template-studio");
    if (await studioTemplate.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await studioTemplate.click();
    }

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    await page.waitForTimeout(3_000);
    expect(fatalErrors).toEqual([]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(/^\d+ rooms?$/);
    await page.waitForTimeout(2_000);
    expect(fatalErrors).toEqual([]);
  });

  test("health and catalog endpoints report ready", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      service: "interior-ai",
      status: "ok",
      checks: {
        application: "ok",
        catalog: { status: "ok" },
      },
    });

    const catalog = await request.get("/api/catalog/live");
    expect(catalog.status()).toBe(200);
  });
});
