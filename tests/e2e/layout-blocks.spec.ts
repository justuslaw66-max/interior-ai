import { expect, test, type Page } from "@playwright/test";
import { waitForCatalogReady, waitForEditorHydration } from "./variant-test-utils";

// Layout blocks (J, 12 Nov 2026): plan pieces with no product. Furnish lists them beside the
// products; one goes into the room at its usual size, selected, with its own name and size in
// the item panel, and it never reaches the Shopping list.

async function openEditor(page: Page) {
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "free", source: "playwright" }) }),
  );
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  await waitForEditorHydration(page);
}

test.describe("layout blocks", () => {
  test("a wardrobe block goes in at its usual size, takes a new size and name, and stays off the Shopping list", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await expect.poll(() => waitForCatalogReady(page), { timeout: 45_000 }).toBeTruthy();

    const layoutSource = page.getByTestId("furnish-source-layout");
    await expect(layoutSource).toHaveAttribute("aria-pressed", "false");
    await layoutSource.click();
    await expect(layoutSource).toHaveAttribute("aria-pressed", "true");
    const blocks = page.getByTestId("furnish-layout-blocks");
    await expect(blocks).toBeVisible();
    await blocks.getByText("Bedroom & study").click();
    const addWardrobe = blocks.getByTestId("layout-block-add-wardrobe");
    await expect(addWardrobe).toContainText("1800 × 600 mm");
    await addWardrobe.click();

    const panel = page.getByTestId("selected-item-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByTestId("selected-item-availability")).toHaveText("For planning: no product chosen yet");
    await expect(panel.getByTestId("layout-block-name")).toHaveValue("Wardrobe");

    // A new design measures in centimetres: 240 cm is 2400 mm.
    const width = panel.getByTestId("layout-block-w");
    await expect(width).toHaveAttribute("data-model-value-mm", "1800");
    await width.fill("240");
    await width.press("Enter");
    await expect(width).toHaveAttribute("data-model-value-mm", "2400");

    const name = panel.getByTestId("layout-block-name");
    await name.fill("Master wardrobe");
    await name.press("Enter");
    await expect(panel).toContainText("Master wardrobe");

    await page.getByTestId("furnish-source-products").click();
    await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(0);
  });
});
