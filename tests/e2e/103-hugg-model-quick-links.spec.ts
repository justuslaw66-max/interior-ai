import { test, expect } from "./fixtures";
import { openCatalogPreview } from "./variant-test-utils";

const HUGG_RECTANGULAR_BASALT_CLOSED_ID =
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-closed";

test.describe("103. Hugg Model Quick Links", () => {
  test("selected Hugg item can switch between square, rectangular, and side table models", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, HUGG_RECTANGULAR_BASALT_CLOSED_ID, "Hugg");
    expect(opened).toBeTruthy();

    await expect(page.getByText("Product details")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Black$/i }).first().click();
    await expect(page.getByTestId("catalog-detail-variant-label")).toContainText(/Black/i);

    await page.getByTestId("catalog-detail-add-to-room").click();

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Hugg Nesting Rectangular Coffee Table/i).first()).toBeVisible();
    await expect(page.getByTestId("hugg-model-option-square")).toBeVisible();
    await expect(page.getByTestId("hugg-model-option-rectangular")).toBeVisible();
    await expect(page.getByTestId("hugg-model-option-side-table")).toBeVisible();
    await page.getByRole("button", { name: "Select fabric colour Performance Dune" }).click();
    await expect(page.getByText("Selected: Performance Dune")).toBeVisible();
    await expect(page.getByText("Selected: Black")).toBeVisible();

    await page.getByTestId("hugg-model-option-square").click();
    await expect(page.getByText(/Hugg Nesting Square Coffee Table/i).first()).toBeVisible();
    await expect(page.getByText("Selected: Performance Dune")).toBeVisible();
    await expect(page.getByText("Selected: Black")).toBeVisible();

    await page.getByTestId("hugg-model-option-side-table").click();
    await expect(page.getByText(/Hugg Nesting Side Table/i).first()).toBeVisible();
    await expect(page.getByText("Selected: Performance Dune")).toBeVisible();
    await expect(page.getByText("Selected: Black")).toBeVisible();
  });
});
