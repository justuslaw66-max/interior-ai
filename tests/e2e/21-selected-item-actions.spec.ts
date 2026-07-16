import { expect, test } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
} from "./variant-test-utils";

const HUGG_SQUARE_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

test.describe("21. Selected Item Actions", () => {
  test("designer can lock, unlock, and remove the selected item", async ({ page }) => {
    test.setTimeout(120_000);

    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "pro", source: "playwright" }),
      });
    });

    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 20_000,
    });

    const opened = await openCatalogPreview(page, HUGG_SQUARE_ID, "Hugg");
    expect(
      opened,
      "The selected-item action fixture must be available"
    ).toBe(true);

    await addCatalogDrawerItemToRoom(page);

    const selectedItemPanel = getSelectedItemPanel(page);
    await expect(selectedItemPanel).toBeVisible({ timeout: 10_000 });
    const shoppingPreview = page.getByTestId("furnish-shopping-preview");
    await expect(shoppingPreview).toContainText(
      "Hugg Nesting Square Coffee Table"
    );

    const lockButton = selectedItemPanel.getByRole("button", {
      name: "Lock",
      exact: true,
    });
    await expect(lockButton).toBeVisible();
    await expect(lockButton).toBeEnabled();
    await lockButton.click();

    const unlockButton = selectedItemPanel.getByRole("button", {
      name: "Unlock",
      exact: true,
    });
    await expect(unlockButton).toBeVisible();
    await unlockButton.click();
    await expect(lockButton).toBeVisible();

    await selectedItemPanel.getByRole("button", { name: "Remove", exact: true }).click();

    await expect(page.getByTestId("selected-item-panel")).toHaveCount(0);
    await page
      .locator('[data-testid="editor-workflow-furnish"]:visible')
      .first()
      .click();
    await expect(shoppingPreview).toBeVisible();
    await expect(shoppingPreview).toContainText(
      "Add real catalog items to build this room list."
    );
  });
});
