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
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("scene-canvas").first()).toHaveAttribute(
      "data-client-hydrated",
      "true",
      { timeout: 30_000 }
    );
    await expect(
      page.getByTestId("scene-canvas").first().locator("canvas")
    ).toBeVisible({ timeout: 30_000 });

    await openMoreMenu(page);
    await page.getByTestId("scene-performance-quality").click();
    await page.getByTestId("editor-command-overflow-lighting").click();
    await expect(page.getByTestId("lighting-settings-drawer")).toBeVisible();
  });

  test("Consumer presets preview immediately and persist locally", async ({
    page,
  }) => {
    const canvas = page.getByTestId("scene-canvas").first();
    await page.getByTestId("lighting-mode-daylight").click();
    await expect(page.getByTestId("lighting-mode-daylight")).toHaveAttribute(
      "aria-checked",
      "true"
    );

    await expect(page.getByTestId("lighting-pro-controls")).toHaveCount(0);
    await expect(canvas).toHaveAttribute("data-shadow-maps-enabled", "true");
    await expect(canvas).toHaveAttribute("data-lighting-mode", "daylight");

    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) return null;
          const value = JSON.parse(raw) as {
            lighting?: {
              version?: number;
              preset?: string;
              shadowsEnabled?: boolean;
            };
            lightingPreset?: string;
          };
          return {
            lighting: value.lighting
              ? {
                  version: value.lighting.version,
                  preset: value.lighting.preset,
                  shadowsEnabled: value.lighting.shadowsEnabled,
                }
              : null,
            legacyPreset: value.lightingPreset,
          };
        }, LOCAL_BACKUP_KEY)
      )
      .toEqual({
        lighting: { version: 1, preset: "daylight", shadowsEnabled: true },
        legacyPreset: "daylight",
      });

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lighting-settings-drawer")).toHaveCount(0);
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();
  });

  test("Lite mode pauses shadows without exposing Pro controls", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    await openMoreMenu(page);
    await page.getByTestId("scene-performance-lite").click();
    await page.getByTestId("editor-command-overflow-lighting").click();

    await expect(page.getByTestId("lighting-pro-controls")).toHaveCount(0);
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

  test("Pro controls drive geographic daylight, fixtures, quality, and Presentation", async ({
    page,
  }) => {
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "pro", source: "playwright" }),
      });
    });
    await page.goto("/design?mode=designer", {
      waitUntil: "domcontentloaded",
    });
    const canvas = page.getByTestId("scene-canvas").first();
    await expect(canvas).toHaveAttribute("data-client-hydrated", "true", {
      timeout: 30_000,
    });
    await openMoreMenu(page);
    await page.getByTestId("editor-command-overflow-lighting").click();
    await expect(page.getByTestId("lighting-pro-controls")).toBeVisible();

    await page.getByTestId("lighting-time-input").fill("09:30");
    await page.getByTestId("lighting-date-input").fill("2026-03-20");
    await page
      .getByTestId("lighting-plan-north-input")
      .evaluate((element) => {
        const input = element as HTMLInputElement;
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        valueSetter?.call(input, "90");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await page.getByTestId("lighting-latitude-input").fill("1.35");
    await page.getByTestId("lighting-longitude-input").fill("103.82");
    await page.getByTestId("lighting-fixture-master-toggle").click();
    await page.getByTestId("lighting-quality-select").selectOption("quality");

    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const lighting = (
            JSON.parse(raw) as {
              lighting?: {
                timeMinutes?: number;
                dateIso?: string;
                planNorthDeg?: number;
                location?: { latitude?: number; longitude?: number };
                fixtureMasterEnabled?: boolean;
              };
            }
          ).lighting;
          return lighting
            ? {
                timeMinutes: lighting.timeMinutes,
                dateIso: lighting.dateIso,
                planNorthDeg: lighting.planNorthDeg,
                location: lighting.location,
                fixtureMasterEnabled: lighting.fixtureMasterEnabled,
              }
            : null;
        }, LOCAL_BACKUP_KEY)
      )
      .toEqual({
        timeMinutes: 570,
        dateIso: "2026-03-20",
        planNorthDeg: 90,
        location: { latitude: 1.35, longitude: 103.82 },
        fixtureMasterEnabled: false,
      });

    await page.keyboard.press("Escape");
    await page.getByTestId("editor-rail-present").click();
    await expect(
      page.getByRole("heading", { name: "Present & Export" })
    ).toBeVisible();
    await expect(page.getByTestId("presentation-lighting-status")).toBeVisible();
    await expect(canvas).toHaveAttribute("data-lighting-mode", "presentation");
    await expect(canvas).toHaveAttribute("data-lighting-quality", "high");
    await expect(canvas).toHaveAttribute("data-shadow-map-size", "4096");
    await page.getByRole("button", { name: "Close export panel" }).click();
    await expect(canvas).toHaveAttribute("data-lighting-mode", "design");
  });
});
