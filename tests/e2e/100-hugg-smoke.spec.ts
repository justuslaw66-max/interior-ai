import { test, expect } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  openCatalogPreview,
  openShopPanel,
  shoppingListRow,
} from "./variant-test-utils";

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

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, HUGG_BASALT_CLOSED_ID, "Hugg");
    expect(opened).toBeTruthy();
    expect(duplicateFinishKeyWarnings).toEqual([]);

    const catalogDrawer = page.getByTestId("catalog-item-drawer");
    await expect(catalogDrawer.getByText("Product details")).toBeVisible({ timeout: 10000 });
    await expect(catalogDrawer.getByTestId("catalog-detail-add-to-room")).toBeVisible({ timeout: 10000 });

    await expect(catalogDrawer.getByRole("button", { name: /Performance Dune/i }).first()).toBeVisible();
    await catalogDrawer.getByRole("button", { name: /Performance Dune/i }).first().click();

    await expect(catalogDrawer.getByRole("button", { name: /^Black$/i }).first()).toBeVisible();
    await catalogDrawer.getByRole("button", { name: /^Black$/i }).first().click();
    await expect(catalogDrawer.getByTestId("catalog-detail-variant-label")).toContainText(/Black/i);

    await addCatalogDrawerItemToRoom(page);

    await expect(page.getByTestId("selected-item-panel")).toBeVisible({ timeout: 10000 });
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

    const furnishBom = page.getByTestId("furnish-room-bom-list");
    await expect(furnishBom).toBeVisible({ timeout: 10000 });
    await expect(furnishBom.getByText(/Hugg Nesting Square Coffee Table/i)).toBeVisible();
    await expect(furnishBom.getByText(/^Black$/i)).toBeVisible();

    await openShopPanel(page);

    // The Shopping list lists the whole design by retailer (UX audit FU8), with each product's variant.
    const huggRow = shoppingListRow(page, /Hugg Nesting Square Coffee Table/i);
    await expect(huggRow).toBeVisible({ timeout: 10000 });
    await expect(huggRow.getByTestId("shopping-list-row-detail")).toContainText(/Black/i);

    await expect(page.getByRole("button", { name: "2D", exact: true }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "2D", exact: true }).first().click({ force: true });
    await page.getByRole("button", { name: "3D", exact: true }).first().click({ force: true });
  });
});
