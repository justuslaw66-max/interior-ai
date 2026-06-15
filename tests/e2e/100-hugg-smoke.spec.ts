import { test, expect } from "./fixtures";
import { openCatalogPreview } from "./variant-test-utils";

const HUGG_BASALT_CLOSED_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

test.describe("100. Hugg Catalog Smoke", () => {
  test("Hugg supports catalog fabric/wood selection, layout state, rotation, cart, and 2D/3D view toggles", async ({ page }) => {
    test.setTimeout(120000);
    const duplicateFinishKeyWarnings: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (
        message.type() === "error" &&
        text.includes("Encountered two children with the same key") &&
        text.includes("natural")
      ) {
        duplicateFinishKeyWarnings.push(text);
      }
    });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, HUGG_BASALT_CLOSED_ID, "Hugg");
    expect(opened).toBeTruthy();
    expect(duplicateFinishKeyWarnings).toEqual([]);

    await expect(page.getByText("Product details")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("catalog-detail-add-to-room")).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole("button", { name: /Performance Dune/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /Performance Dune/i }).first().click();

    await expect(page.getByRole("button", { name: /^Black$/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Black$/i }).first().click();
    await expect(page.getByTestId("catalog-detail-variant-label")).toContainText(/Black/i);

    await page.getByTestId("catalog-detail-add-to-room").click({ force: true });

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Hugg Nesting Square Coffee Table/i).first()).toBeVisible();
    await expect(page.getByText("Selected: Black").first()).toBeVisible();
    await page.getByRole("button", { name: "Select fabric colour Performance Dune" }).click();
    await expect(page.getByText("Selected: Performance Dune").first()).toBeVisible();
    await expect(page.getByText("Selected: Black").first()).toBeVisible();

    await expect(page.getByText("Model", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("hugg-model-option-square")).toBeVisible();
    const seatsOpenButton = page.getByRole("button", { name: "Seats Open" });
    if (await seatsOpenButton.isVisible()) {
      await expect(page.getByText("Table Layout")).toBeVisible();
      await seatsOpenButton.click();
      await expect(page.getByText(/Recommended planning size:\s*200 x 200 cm/i)).toBeVisible();
    }

    await page.getByTestId("rotation-controls-toggle").click();
    await page.getByTestId("rotation-btn-quarter-turn").click();
    await expect(page.getByTestId("rotation-angle-label")).toContainText(/90 deg/i);

    await page.getByRole("button", { name: "Shop" }).click();
    await expect(page.getByText("Shopping overview")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Current room")).toBeVisible();
    await expect(page.getByText("Whole home")).toBeVisible();
    await expect(page.getByTestId("cart-panel")).toBeVisible({ timeout: 10000 });
    const cartPanel = page.getByTestId("cart-panel");
    await expect(cartPanel.getByText(/Hugg Nesting Square Coffee Table/i)).toBeVisible({ timeout: 10000 });
    await expect(cartPanel.getByText(/Black\s*•\s*coffee_table/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Close export panel" }).click({ force: true });
    await expect(page.getByRole("button", { name: "2D Plan" }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "2D Plan" }).first().click({ force: true });
    await page.getByRole("button", { name: "3D" }).first().click({ force: true });
  });
});
