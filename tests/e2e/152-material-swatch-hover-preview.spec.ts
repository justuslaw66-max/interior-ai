import { test, expect } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
} from "./variant-test-utils";

test.describe("152. Material Swatch Detail Preview", () => {
  test("shows fabric details on hover and keyboard focus without inspector clipping", async ({ page }) => {
    test.setTimeout(120000);

    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "pro", source: "playwright" }),
      });
    });

    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    await page.locator('[data-testid="editor-workflow-furnish"]:visible').first().click();
    const catalogSearch = page.getByRole("textbox", { name: "Search catalog products" });
    await expect(catalogSearch).toBeVisible({ timeout: 20000 });
    await catalogSearch.fill("Owen 3 Seater");

    const owenCard = page
      .getByText("Owen 3 Seater Sofa", { exact: true })
      .locator("..")
      .filter({ has: page.getByRole("button", { name: "View details" }) })
      .first();
    await expect(owenCard).toBeVisible();
    await owenCard.getByRole("button", { name: "View details" }).click();

    await expect(page.getByText("Product details")).toBeVisible({ timeout: 10000 });
    await addCatalogDrawerItemToRoom(page);

    const selectedItemPanel = getSelectedItemPanel(page);
    const fabricSwatch = selectedItemPanel.getByRole("button", {
      name: /Select(?: fabric colour)? Haze/i,
    });
    await expect(fabricSwatch).toBeVisible();

    await fabricSwatch.hover();

    const preview = page.getByTestId("material-swatch-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Haze");
    await expect(preview).toContainText("Fabric composition");
    expect(await preview.evaluate((node) => node.parentElement === document.body)).toBe(true);

    const previewBox = await preview.boundingBox();
    const viewport = page.viewportSize();
    expect(previewBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(previewBox!.x).toBeGreaterThanOrEqual(0);
    expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(viewport!.width);

    await page.mouse.move(1, 1);
    await expect(preview).toBeHidden();

    await fabricSwatch.focus();
    await expect(preview).toBeVisible();
    await expect(fabricSwatch).toHaveAttribute("aria-describedby", "material-swatch-preview");
  });
});
