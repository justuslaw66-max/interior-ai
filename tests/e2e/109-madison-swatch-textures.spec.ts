import { expect, test } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
} from "./variant-test-utils";

const MADISON_3S_ID = "sofa-real-castlery-madison-3s";

const expectedSwatches = [
  { label: "Bisque", urlPart: "AM-4001/Madison-Armchair-Bisque-Square-Det_1" },
  { label: "Camille", urlPart: "CM-4001/Madison-3-Seater-Sofa-Forest-Det_5" },
  { label: "Caramel", urlPart: "LE-4016/Jonathan-Sofa-Brown_1" },
];

test.describe("109. Madison Swatch Textures", () => {
  test("catalog preview separates fabric and leather swatches into material tabs", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, MADISON_3S_ID, "Madison");
    expect(opened).toBeTruthy();

    const drawer = page.locator("aside").filter({ hasText: "Product details" }).first();
    await expect(drawer).toBeVisible({ timeout: 10000 });

    const fabricTab = drawer.getByRole("tab", { name: "Fabric" });
    const leatherTab = drawer.getByRole("tab", { name: "Leather" });
    await expect(fabricTab).toHaveAttribute("aria-selected", "true");
    await expect(leatherTab).toHaveAttribute("aria-selected", "false");
    await expect(drawer.getByText("Fabric colour")).toBeVisible();
    await expect(drawer.getByText("Selected: Bisque")).toBeVisible();
    await expect(drawer.getByText("Selected: Caramel")).toHaveCount(0);

    await leatherTab.click();
    await expect(leatherTab).toHaveAttribute("aria-selected", "true");
    await expect(drawer.getByText("Selected: Caramel")).toBeVisible();
    await expect(drawer.getByText("Fabric colour")).toHaveCount(0);
  });

  test("Madison material options use current Castlery SG texture swatches", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, MADISON_3S_ID, "Madison");
    expect(opened).toBeTruthy();

    await expect(page.getByTestId("catalog-detail-add-to-room")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Stone").first()).toHaveCount(0);

    await addCatalogDrawerItemToRoom(page);

    const selectedItemPanel = getSelectedItemPanel(page);
    await expect(selectedItemPanel.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(selectedItemPanel.getByText(/Madison Sofa/i).first()).toBeVisible();
    await expect(selectedItemPanel.getByRole("button", { name: "Select Stone" })).toHaveCount(0);

    for (const swatch of expectedSwatches.slice(0, 2)) {
      const button = selectedItemPanel.getByRole("button", { name: `Select ${swatch.label}` });
      await expect(button).toBeVisible({ timeout: 10000 });
      await expect
        .poll(async () => button.evaluate((node) => getComputedStyle(node).backgroundImage), {
          message: `${swatch.label} selected-item swatch should use the Castlery material texture`,
        })
        .toContain(swatch.urlPart);
    }

    await selectedItemPanel.getByRole("button", { name: "Leather" }).click();
    const caramelButton = selectedItemPanel.getByRole("button", { name: "Select Caramel" });
    await expect(caramelButton).toBeVisible({ timeout: 10000 });
    await expect
      .poll(async () => caramelButton.evaluate((node) => getComputedStyle(node).backgroundImage), {
        message: "Caramel selected-item swatch should use the Castlery leather texture",
      })
      .toContain("LE-4016/Jonathan-Sofa-Brown_1");
  });
});
