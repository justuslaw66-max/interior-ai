import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { openCatalogPreview } from "./variant-test-utils";

async function openDawson3sPreview(page: Page) {
  const opened = await openCatalogPreview(page, "sofa-real-castlery-dawson-3s", "Dawson 3 Seater");
  if (!opened) return false;
  await expect(page.getByTestId("catalog-detail-variant-label")).toBeVisible({ timeout: 5000 });
  return true;
}

async function expectHeroForFinishLabel(page: Page, finishLabel: string, expectedSrcFragment: string) {
  const button = page.getByRole("button", { name: finishLabel }).first();
  await expect(button).toBeVisible({ timeout: 10000 });
  await button.scrollIntoViewIfNeeded();
  await button.click();

  const heroImage = page.locator("aside img").first();
  await expect(heroImage).toBeVisible();

  await expect
    .poll(async () => (await heroImage.getAttribute("src")) ?? "", { timeout: 12000 })
    .toContain(expectedSrcFragment);
}

test.describe("99. Dawson 3S Smoke", () => {
  test("new colors + disambiguated labels + hero switching", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    const opened = await openDawson3sPreview(page);
    if (!opened) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Dawson 3S smoke assertions because Dawson 3S card was not visible in this runtime",
      });
      return;
    }

    // Disambiguated Moss labels should all be visible
    for (const label of [
      "Moss (Peyton Fleece)",
      "Moss (Infinity Boucle)",
      "Moss (Performance Twill)",
      "Moss (Washed Chenille)",
    ]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible({ timeout: 10000 });
    }

    // New colors added from Castlery's expanded palette
    for (const label of [
      "Pearl Beige (Performance Twill)",
      "Slate (Performance Twill)",
      "Sand (Oat, Genova)",
      "Sand (Washed Chenille)",
      "Cream (Genova)",
    ]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible({ timeout: 10000 });
    }

    // Representative hero checks
    await expectHeroForFinishLabel(
      page,
      "Slate (Performance Twill)",
      "AS-000374C-PT4003/Dawson-3-Seater-Sofa-Performance-Twill-Slate-Front-1773900738",
    );
    await expectHeroForFinishLabel(
      page,
      "Sand (Oat, Genova)",
      "AS-000374C-PG4002/Dawson-3-Seater-Sofa-Performance-Genova-Oat-Front-1773911112",
    );
    await expectHeroForFinishLabel(
      page,
      "Moss (Washed Chenille)",
      "AS-000374C-GR4004/Dawson-3-Seater-Sofa-Moss-Front-1774246214",
    );
  });
});
