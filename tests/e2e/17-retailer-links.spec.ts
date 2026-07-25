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
    optionKey: "3-seater",
    arm: "Slim arm",
    armKey: "slim",
    expectedSlug: "jaron-leather-recliner-3-seater-sofa",
  },
  {
    name: "3 Seater Wide Arm",
    model: /^3 Seater Recliner Sofa/i,
    optionKey: "3-seater",
    arm: "Wide arm",
    armKey: "wide",
    expectedSlug: "jaron-leather-recliner-3-seater-sofa",
  },
  {
    name: "Extended 3 Seater Slim Arm",
    model: /^Extended 3 Seater Recliner Sofa/i,
    optionKey: "extended-3-seater",
    arm: "Slim arm",
    armKey: "slim",
    expectedSlug: "jaron-leather-recliner-extended-3-seater-sofa",
  },
  {
    name: "Extended 3 Seater Wide Arm",
    model: /^Extended 3 Seater Recliner Sofa/i,
    optionKey: "extended-3-seater",
    arm: "Wide arm",
    armKey: "wide",
    expectedSlug: "jaron-leather-recliner-extended-3-seater-sofa",
  },
] as const;

test.describe("17. Retailer Link Identity", () => {
  test("Dawson fabric selection opens the exact Castlery material configuration", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => waitForCatalogReady(page), { timeout: 45_000 }).toBeTruthy();
    await expect.poll(() => fillCatalogSearch(page, "Dawson 3 Seater"), { timeout: 45_000 }).toBeTruthy();
    await addCatalogCardItemToRoom(page, "sofa-real-castlery-dawson-3s");

    const selectedItemPanel = getSelectedItemPanel(page);
    const gingerSwatch = selectedItemPanel.getByRole("button", {
      name: "Select Performance Infinity Boucle, Rust",
      exact: true,
    });
    await expect(gingerSwatch).toBeVisible({ timeout: 15_000 });
    await gingerSwatch.click();

    const popupPromise = page.waitForEvent("popup", { timeout: 15_000 });
    await selectedItemPanel.getByRole("button", { name: "View retailer" }).click();
    const popup = await popupPromise;
    await expect.poll(() => popup.url(), { timeout: 15_000 }).toContain("castlery.com/sg/products");
    const openedUrl = new URL(popup.url());
    await popup.close().catch(() => null);

    expect(openedUrl.hostname).toBe("www.castlery.com");
    expect(openedUrl.pathname).toBe("/sg/products/dawson-3-seater-sofa");
    expect(openedUrl.searchParams.get("material")).toBe("performance_ginger");
    expect(openedUrl.searchParams.get("frame_cover")).toBe("removable");
    expect(openedUrl.searchParams.get("utm_source")).toBe("interior-ai");
    expect(openedUrl.searchParams.get("utm_medium")).toBe("affiliate");
  });

  test("Jaron model and arm selections keep the selected item retailer URL aligned", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => waitForCatalogReady(page), { timeout: 45_000 }).toBeTruthy();
    await expect.poll(() => fillCatalogSearch(page, "Jaron"), { timeout: 45_000 }).toBeTruthy();
    await addCatalogCardItemToRoom(
      page,
      "sofa-real-castlery-jaron-extended-3s-wide-arm",
      "Jaron Recliner Sofa",
    );
    await page.getByText("Jaron Recliner Sofa").first().waitFor({ timeout: 15_000 });
    const selectedItemPanel = getSelectedItemPanel(page);

    for (const testCase of JARON_CASES) {
      await selectedItemPanel.getByRole("button", { name: testCase.model }).click();
      await expect(
        selectedItemPanel.getByTestId(`jaron-config-option-${testCase.optionKey}`),
      ).toHaveAttribute("data-active", "true");
      await selectedItemPanel.getByRole("button", { name: testCase.arm, exact: true }).click();
      await expect(
        selectedItemPanel.getByTestId(`jaron-arm-${testCase.armKey}`),
      ).toHaveAttribute("data-active", "true");

      const popupPromise = page.waitForEvent("popup", { timeout: 15_000 });
      await selectedItemPanel.getByRole("button", { name: "View retailer" }).click();
      const popup = await popupPromise;
      await expect.poll(() => popup.url(), { timeout: 15_000 }).toContain("castlery.com/sg/products");
      const openedUrl = popup.url();
      await popup.close().catch(() => null);

      expect(openedUrl, testCase.name).toContain(testCase.expectedSlug);
      expect(openedUrl, testCase.name).toContain("castlery.com/sg/products");
    }
  });
});
