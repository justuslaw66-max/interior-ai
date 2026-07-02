import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  addImportedProductIfReady,
  selectImportedFamilyByHint,
  selectImportedProductById,
  waitForCatalogReady,
} from "./variant-test-utils";

const MADISON_2S_ID = "sofa-real-castlery-madison-2s";
const MADISON_3S_ID = "sofa-real-castlery-madison-3s";
const MADISON_OTTOMAN_ID = "sofa-real-castlery-madison-ottoman";

type ProductInfoRow = {
  label?: string;
  value?: string;
};

type ImportedModel = {
  id: string;
  catalog?: {
    product_details?: {
      material?: ProductInfoRow[];
      dimensions?: ProductInfoRow[];
      delivery_and_warranty?: ProductInfoRow[];
    };
  } | null;
};

function expectRows(rows: ProductInfoRow[] | undefined, expected: RegExp[]) {
  const values = (rows ?? []).map((row) => `${row.label ?? ""}: ${row.value ?? ""}`);
  for (const pattern of expected) {
    expect(values.some((value) => pattern.test(value)), `Expected rows to include ${pattern}`).toBeTruthy();
  }
}

async function addMadisonProduct(page: Page, productId: string) {
  await page.goto("/design");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

  await expect.poll(() => waitForCatalogReady(page), { timeout: 30000 }).toBeTruthy();
  await expect.poll(() => selectImportedFamilyByHint(page, "madison"), { timeout: 20000 }).toBeTruthy();
  await expect.poll(() => selectImportedProductById(page, productId), { timeout: 20000 }).toBeTruthy();
  await expect.poll(() => addImportedProductIfReady(page), { timeout: 20000 }).toBeTruthy();

  await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
}

test.describe("106. Madison Product Details", () => {
  test("API exposes canonical Castlery Singapore product details for Madison 3-seater", async ({ request }) => {
    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === MADISON_3S_ID);
    expect(model).toBeDefined();

    const details = model?.catalog?.product_details;
    expectRows(details?.material, [
      /Material: Laminated veneer lumber and plywood, rubber wood leg/i,
      /Filling: Foam, fibre and pocket spring filled seat; Fibre filled back; Foam filled frame/i,
      /Care: Fabric sofa, wooden legs/i,
      /Suspension: Sinuous spring/i,
    ]);
    expectRows(details?.dimensions, [
      /Dimension: W204 x D96\.5 x H86\.5cm/i,
      /Product weight: 54\.5kg/i,
      /Max bearing support: 3 x 150kg/i,
      /Cushion: 2 Bolsters included \(17 x 56cm\)/i,
    ]);
    expectRows(details?.delivery_and_warranty, [
      /Cancellation: Free—5 working days before delivery/i,
      /Warranty: Frame 10 years; Fabric 1 year; Foam 2 years/i,
      /Return policy: 30-day returns/i,
      /Assembly: Legs to be fitted/i,
    ]);
  });

  test("renders Castlery Singapore product detail rows for 3-seater fabric and leather variants", async ({ page }) => {
    test.setTimeout(120000);

    await addMadisonProduct(page, MADISON_3S_ID);

    await page.getByRole("button", { name: /^Show details$/i }).click();
    const detailsPanel = page.getByTestId("selected-product-details-panel");
    await expect(detailsPanel).toContainText(/Laminated veneer lumber and plywood/i);
    await expect(detailsPanel).toContainText(/Foam, fibre and pocket spring filled seat/i);
    await expect(detailsPanel).toContainText(/Fabric sofa, wooden legs/i);
    await expect(detailsPanel).toContainText(/Sinuous spring/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    const dimensionsPanel = page.getByTestId("selected-product-dimensions-panel");
    await expect(dimensionsPanel).toContainText(/W204 x D96\.5 x H86\.5cm/i);
    await expect(dimensionsPanel).toContainText(/Product weight/i);
    await expect(dimensionsPanel).toContainText(/54\.5kg/i);
    await expect(dimensionsPanel).toContainText(/3 x 150kg/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    const deliveryPanel = page.getByTestId("selected-product-delivery-warranty-panel");
    await expect(deliveryPanel).toContainText(/Frame 10 years; Fabric 1 year; Foam 2 years/i);
    await expect(deliveryPanel).toContainText(/30-day returns/i);
    await expect(deliveryPanel).toContainText(/Legs to be fitted/i);

    const leatherButton = page.getByRole("button", { name: /^Leather$/i });
    if (await leatherButton.isVisible().catch(() => false)) {
      await leatherButton.click();
      await expect(detailsPanel).toContainText(/Leather sofa, wooden legs/i);
      await expect(detailsPanel).toContainText(/Top grain leather/i);

      await expect(deliveryPanel).toContainText(/Frame 10 years; Leather 1 year; Foam 2 years/i);
    }
  });

  test("renders Castlery Singapore product detail rows for 2-seater fabric and leather variants", async ({ page }) => {
    test.setTimeout(120000);

    await addMadisonProduct(page, MADISON_2S_ID);

    await page.getByRole("button", { name: /^Show details$/i }).click();
    const detailsPanel = page.getByTestId("selected-product-details-panel");
    await expect(detailsPanel).toContainText(/Frame: engineered wood with plywood/i);
    await expect(detailsPanel).toContainText(/Foam, fibre and pocket spring filled seat/i);
    await expect(detailsPanel).toContainText(/Fabric sofa, wooden legs/i);
    await expect(detailsPanel).toContainText(/Walnut stain/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    const dimensionsPanel = page.getByTestId("selected-product-dimensions-panel");
    await expect(dimensionsPanel).toContainText(/W173 x D97 x H87cm/i);
    await expect(dimensionsPanel).toContainText(/Product weight/i);
    await expect(dimensionsPanel).toContainText(/49kg/i);
    await expect(dimensionsPanel).toContainText(/2 x 150kg/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    const deliveryPanel = page.getByTestId("selected-product-delivery-warranty-panel");
    await expect(deliveryPanel).toContainText(/Frame 10 years; Fabric 1 year; Foam 2 years/i);
    await expect(deliveryPanel).toContainText(/30-day returns/i);
    await expect(deliveryPanel).toContainText(/Legs to be fitted/i);

    const leatherButton = page.getByRole("button", { name: /^Leather$/i });
    if (await leatherButton.isVisible().catch(() => false)) {
      await leatherButton.click();
      await expect(detailsPanel).toContainText(/Leather sofa, wooden legs/i);
      await expect(detailsPanel).toContainText(/Top grain leather/i);
      await expect(dimensionsPanel).toContainText(/52kg/i);
      await expect(deliveryPanel).toContainText(/Frame 10 years; Leather 1 year; Foam 2 years/i);
    }
  });

  test("renders Castlery Singapore product detail rows for ottoman fabric and leather variants", async ({ page }) => {
    test.setTimeout(120000);

    await addMadisonProduct(page, MADISON_OTTOMAN_ID);

    await page.getByRole("button", { name: /^Show details$/i }).click();
    const detailsPanel = page.getByTestId("selected-product-details-panel");
    await expect(detailsPanel).toContainText(/Laminated veneer lumber and plywood/i);
    await expect(detailsPanel).toContainText(/Foam, fibre and pocket spring filled seat/i);
    await expect(detailsPanel).toContainText(/Fabric sofa, wooden legs/i);
    await expect(detailsPanel).toContainText(/Non-removable/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    const dimensionsPanel = page.getByTestId("selected-product-dimensions-panel");
    await expect(dimensionsPanel).toContainText(/W86\.5 x D65 x H45\.5cm/i);
    await expect(dimensionsPanel).toContainText(/14\.5kg/i);
    await expect(dimensionsPanel).toContainText(/150kg/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    const deliveryPanel = page.getByTestId("selected-product-delivery-warranty-panel");
    await expect(deliveryPanel).toContainText(/Clearance.no cancellation/i);
    await expect(deliveryPanel).toContainText(/Clearance.no return or exchange/i);
    await expect(deliveryPanel).toContainText(/Frame 10 years; Fabric 1 year; Foam 2 years/i);

    const leatherButton = page.getByRole("button", { name: /^Leather$/i });
    if (await leatherButton.isVisible().catch(() => false)) {
      await leatherButton.click();
      await expect(detailsPanel).toContainText(/Leather sofa, wooden legs/i);
      await expect(detailsPanel).toContainText(/Top grain leather/i);
      await expect(dimensionsPanel).toContainText(/W83 x D64 x H49cm/i);
      await expect(dimensionsPanel).toContainText(/11\.8kg/i);
      await expect(deliveryPanel).toContainText(/30-day returns/i);
      await expect(deliveryPanel).toContainText(/Frame 10 years; Leather 1 year; Foam 2 years/i);
    }
  });
});
