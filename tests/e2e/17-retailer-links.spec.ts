import { test, expect } from "./fixtures";
import {
  addCatalogCardItemToRoom,
  fillCatalogSearch,
  getSelectedItemPanel,
  waitForCatalogReady,
} from "./variant-test-utils";

const JARON_CASES = [
  {
    name: "3 Seater Slim Arm",
    model: /^3 Seater Recliner Sofa/i,
    arm: "Slim arm",
    expectedSlug: "jaron-leather-recliner-3-seater-sofa",
  },
  {
    name: "3 Seater Wide Arm",
    model: /^3 Seater Recliner Sofa/i,
    arm: "Wide arm",
    expectedSlug: "jaron-leather-recliner-3-seater-sofa",
  },
  {
    name: "Extended 3 Seater Slim Arm",
    model: /^Extended 3 Seater Recliner Sofa/i,
    arm: "Slim arm",
    expectedSlug: "jaron-leather-recliner-extended-3-seater-sofa",
  },
  {
    name: "Extended 3 Seater Wide Arm",
    model: /^Extended 3 Seater Recliner Sofa/i,
    arm: "Wide arm",
    expectedSlug: "jaron-leather-recliner-extended-3-seater-sofa",
  },
] as const;

test.describe("17. Retailer Link Identity", () => {
  test("Jaron model and arm selections keep the selected item retailer URL aligned", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => waitForCatalogReady(page), { timeout: 45_000 }).toBeTruthy();
    await expect.poll(() => fillCatalogSearch(page, "Jaron"), { timeout: 45_000 }).toBeTruthy();
    await addCatalogCardItemToRoom(page, "sofa-real-castlery-jaron-extended-3s-wide-arm");
    await page.getByText("Jaron Recliner Sofa").first().waitFor({ timeout: 15_000 });
    const selectedItemPanel = getSelectedItemPanel(page);

    for (const testCase of JARON_CASES) {
      await selectedItemPanel.getByRole("button", { name: testCase.model }).click();
      await selectedItemPanel.getByRole("button", { name: testCase.arm, exact: true }).click();

      const popupPromise = page.waitForEvent("popup", { timeout: 15_000 });
      await selectedItemPanel.getByRole("button", { name: "View retailer" }).click();
      const popup = await popupPromise;
      const openedUrl = popup.url();
      await popup.close().catch(() => null);

      expect(openedUrl, testCase.name).toContain(testCase.expectedSlug);
      expect(openedUrl, testCase.name).toContain("castlery.com/sg/products");
    }
  });
});
