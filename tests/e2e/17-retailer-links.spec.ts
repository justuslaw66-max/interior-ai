import { test, expect } from "./fixtures";

const JARON_CASES = [
  {
    name: "3 Seater Slim Arm",
    model: "3 Seater (Slim Arm)",
    arm: "Slim arm",
    expectedSlug: "jaron-leather-recliner-3-seater-sofa",
  },
  {
    name: "3 Seater Wide Arm",
    model: "3 Seater (Wide Arm)",
    arm: "Wide arm",
    expectedSlug: "jaron-leather-recliner-3-seater-sofa",
  },
  {
    name: "Extended 3 Seater Slim Arm",
    model: "Extended 3 Seater (Slim Arm)",
    arm: "Slim arm",
    expectedSlug: "jaron-leather-recliner-extended-3-seater-sofa",
  },
  {
    name: "Extended 3 Seater Wide Arm",
    model: "Extended 3 Seater (Wide Arm)",
    arm: "Wide arm",
    expectedSlug: "jaron-leather-recliner-extended-3-seater-sofa",
  },
] as const;

test.describe("17. Retailer Link Identity", () => {
  test("Jaron model and arm selections keep the selected item retailer URL aligned", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await page.getByPlaceholder("Search title, brand, style, finish, SKU...").waitFor({ timeout: 30_000 });

    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("button")).some((button) =>
          /^Sofa \(([1-9]\d*)\)/.test((button.textContent ?? "").trim())
        ),
      null,
      { timeout: 45_000 }
    );

    await page.getByRole("button", { name: /^Sofa \(/ }).click();
    await page.getByTestId("catalog-add-sofa-real-castlery-jaron-extended-3s-wide-arm").click();
    await page.getByText("Jaron Recliner Sofa").first().waitFor({ timeout: 15_000 });

    for (const testCase of JARON_CASES) {
      await page.getByRole("button", { name: testCase.model, exact: true }).click();
      await page.getByRole("button", { name: testCase.arm, exact: true }).click();

      const popupPromise = page.waitForEvent("popup", { timeout: 15_000 });
      await page.getByRole("button", { name: "View retailer" }).first().click();
      const popup = await popupPromise;
      const openedUrl = popup.url();
      await popup.close().catch(() => null);

      expect(openedUrl, testCase.name).toContain(testCase.expectedSlug);
      expect(openedUrl, testCase.name).toContain("castlery.com/sg/products");
    }
  });
});
