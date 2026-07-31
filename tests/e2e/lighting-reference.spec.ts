import { expect, test } from "@playwright/test";

test.describe("Residential lighting reference", () => {
  test.describe.configure({ timeout: 90_000 });

  test("keeps a stable material target and localizes evening warmth", async ({
    page,
  }, testInfo) => {
    await page.goto("/lighting-reference", { waitUntil: "domcontentloaded" });
    const scene = page.getByTestId("lighting-reference-scene");
    await expect(scene).toBeVisible();
    await expect(scene).toHaveAttribute("data-client-hydrated", "true", {
      timeout: 30_000,
    });
    await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(scene).toHaveAttribute(
      "data-tone-mapping",
      "aces"
    );
    await expect(scene).toHaveAttribute("data-lighting-mode", "design");
    await expect(scene).toHaveAttribute("data-active-light-count", "2");
    await expect(scene).toHaveAttribute(
      "data-shadow-casting-light-count",
      "1"
    );
    await expect(scene).toHaveAttribute("data-reference-material-count", "11");
    await expect(scene).toHaveAttribute(
      "data-closed-wall-blocks-direct-light",
      "true"
    );
    await expect(scene).toHaveAttribute("data-window-lights", "0");

    await page.getByTestId("reference-preset-warm").click();
    await expect(scene).toHaveAttribute("data-lighting-preset", "warm");
    await expect(scene).toHaveAttribute("data-lighting-mode", "evening");
    await expect(scene).toHaveAttribute("data-sun-lux", "0");
    await expect(scene).toHaveAttribute("data-active-fixtures", "2");
    await expect(scene).toHaveAttribute("data-active-light-count", "3");
    await expect(scene).toHaveAttribute("data-evening-sky-is-cool", "true");
    await page.screenshot({
      path: testInfo.outputPath("evening-reference.png"),
      animations: "disabled",
    });

    await page.getByTestId("reference-preset-daylight").click();
    await expect(scene).toHaveAttribute("data-lighting-preset", "daylight");
    await expect(scene).toHaveAttribute("data-lighting-mode", "daylight");
    await expect(scene).toHaveAttribute("data-active-fixtures", "0");
    await expect(scene).toHaveAttribute("data-window-lights", "1");
    await page.screenshot({
      path: testInfo.outputPath("daylight-reference.png"),
      animations: "disabled",
    });

    await page.getByTestId("reference-preset-presentation").click();
    await expect(scene).toHaveAttribute("data-lighting-mode", "presentation");
    await expect(scene).toHaveAttribute("data-lighting-quality", "high");
    await expect(scene).toHaveAttribute("data-shadow-map-size", "4096");
    await expect(scene).toHaveAttribute("data-window-lights", "1");
    await page.screenshot({
      path: testInfo.outputPath("presentation-reference.png"),
      animations: "disabled",
    });
  });
});
