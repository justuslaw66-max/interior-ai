import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const LOCAL_BACKUP_KEY = "interior-ai:v1:livingroom-design";

async function openMoreMenu(page: Page) {
  const more = page.getByTestId("editor-command-overflow");
  const menu = page.getByTestId("editor-command-overflow-menu");
  await expect(async () => {
    if (!(await menu.isVisible().catch(() => false))) {
      await more.click();
    }
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe("Lighting settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });

    await openMoreMenu(page);
    await page.getByTestId("scene-performance-quality").click();
    await page.getByTestId("editor-command-overflow-lighting").click();
    await expect(page.getByTestId("lighting-settings-drawer")).toBeVisible();
  });

  test("presets and shadows preview immediately and persist locally", async ({
    page,
  }) => {
    const canvas = page.getByTestId("scene-canvas").first();
    await page.getByTestId("lighting-preset-daylight").click();
    await expect(page.getByTestId("lighting-preset-daylight")).toHaveAttribute(
      "aria-checked",
      "true"
    );

    const shadows = page.getByTestId("lighting-shadows-toggle");
    await expect(shadows).toHaveAttribute("aria-checked", "true");
    await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
    await shadows.click();
    await expect(shadows).toHaveAttribute("aria-checked", "false");
    await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "false");

    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) return null;
          const value = JSON.parse(raw) as {
            lighting?: { preset?: string; shadowsEnabled?: boolean };
            lightingPreset?: string;
          };
          return {
            lighting: value.lighting,
            legacyPreset: value.lightingPreset,
          };
        }, LOCAL_BACKUP_KEY)
      )
      .toEqual({
        lighting: { preset: "daylight", shadowsEnabled: false },
        legacyPreset: "daylight",
      });

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lighting-settings-drawer")).toHaveCount(0);
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();
  });

  test("Lite mode pauses shadows without changing the saved preference", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openMoreMenu(page);
    await page.getByTestId("scene-performance-lite").click();
    await page.getByTestId("editor-command-overflow-lighting").click();

    await expect(page.getByTestId("lighting-shadows-toggle")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await expect(page.getByTestId("lighting-lite-shadow-message")).toHaveText(
      "Shadows are paused in Lite mode."
    );
    await expect(page.getByTestId("scene-canvas").first()).toHaveAttribute(
      "data-shadow-maps-enabled",
      "false"
    );
  });

  test("uses a mobile bottom sheet and leaves 2D unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const drawerBox = await page
      .getByTestId("lighting-settings-drawer")
      .boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.width).toBeGreaterThanOrEqual(388);
    expect(drawerBox!.y).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await page.getByTestId("editor-view-2d").click();
    await openMoreMenu(page);
    await expect(
      page.getByTestId("editor-command-overflow-lighting")
    ).toHaveCount(0);
    await expect(page.getByTestId("scene-canvas").first()).toHaveAttribute(
      "data-shadow-maps-enabled",
      "false"
    );
  });
});
