import { expect, test } from "./fixtures";
import { GLB_CALIBRATION_BY_PRODUCT_ID } from "../../lib/design-page-calibration";
import {
  addImportedProductIfReady,
  selectImportedFamilyByHint,
  selectImportedProductById,
} from "./variant-test-utils";

const SLOANE_DINING_TABLE_180_ID = "dining-real-castlery-sloane-dining-table-180";
const SLOANE_DINING_TABLE_225_ID = "dining-real-castlery-sloane-dining-table-225";

type ProductInfoRow = {
  label?: string;
  value?: string;
};

type ProductInfoSection = {
  material?: ProductInfoRow[];
  dimensions?: ProductInfoRow[];
  delivery_and_warranty?: ProductInfoRow[];
};

type ImportedModel = {
  id: string;
  modelUrl?: string | null;
  catalog?: {
    source_url?: string;
    variants?: Array<{ size_label?: string; finish_code?: string }>;
    product_details?: ProductInfoSection;
  } | null;
};

function expectRows(rows: ProductInfoRow[] | undefined, expected: RegExp[]) {
  const values = (rows ?? []).map((row) => `${row.label ?? ""}: ${row.value ?? ""}`);
  for (const pattern of expected) {
    expect(values.some((value) => pattern.test(value)), `Expected rows to include ${pattern}`).toBeTruthy();
  }
}

test.describe("145. Sloane Dining Table Product Info", () => {
  test("API exposes Castlery SG product details for both Grey Oak lengths", async ({ request }) => {
    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const byId = new Map((body.models ?? []).map((model) => [model.id, model]));
    const table180 = byId.get(SLOANE_DINING_TABLE_180_ID);
    const table225 = byId.get(SLOANE_DINING_TABLE_225_ID);

    expect(table180).toBeDefined();
    expect(table225).toBeDefined();
    expect(table180?.modelUrl).toBe("/assets/models/dining-real-castlery-sloane-dining-table-180.glb");
    expect(table225?.modelUrl).toBe("/assets/models/dining-real-castlery-sloane-dining-table-225.glb");
    expect(table180?.catalog?.source_url).toContain("castlery.com/sg/products/sloane-dining-table");
    expect(table225?.catalog?.source_url).toContain("castlery.com/sg/products/sloane-dining-table");

    expect(table180?.catalog?.variants?.[0]?.size_label).toBe("180");
    expect(table225?.catalog?.variants?.[0]?.size_label).toBe("225");
    expect(table180?.catalog?.variants?.[0]?.finish_code).toBe("grey_oak");
    expect(table225?.catalog?.variants?.[0]?.finish_code).toBe("grey_oak");

    expectRows(table180?.catalog?.product_details?.material, [
      /Material: Engineered wood with oak veneer/i,
      /Finish: Grey oak on wood/i,
      /Care: Wooden table/i,
      /Colour variance: Natural variations/i,
      /Material & safety standards: Low formaldehyde/i,
    ]);
    expectRows(table180?.catalog?.product_details?.dimensions, [
      /Dimension: W180 x D90 x H76cm/i,
      /Table top thickness: 5cm/i,
      /Leg height: 71cm/i,
      /Leg to leg distance \(at height 45cm\): 114cm/i,
      /Capacity: Sits 6 people comfortably/i,
      /Product weight: 54.5kg/i,
      /Packaging dimensions: 2 boxes/i,
      /Max bearing support: 100kg/i,
    ]);
    expectRows(table225?.catalog?.product_details?.dimensions, [
      /Dimension: W225 x D100 x H76cm/i,
      /Leg to leg distance \(at height 45cm\): 159cm/i,
      /Capacity: Sits 8 people comfortably/i,
      /Product weight: 63.6kg/i,
      /Packaging dimensions: 2 boxes/i,
      /Max bearing support: 100kg/i,
    ]);
    expectRows(table180?.catalog?.product_details?.delivery_and_warranty, [
      /Cancellation: Free - 5 working days before delivery/i,
      /Warranty: 5-year limited warranty/i,
      /Return policy: 30-day returns/i,
    ]);
  });

  test("uses authored GLB colour for both Sloane Dining Table lengths", async () => {
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_DINING_TABLE_180_ID]?.useVariantColor).toBe(false);
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_DINING_TABLE_225_ID]?.useVariantColor).toBe(false);
  });

  test("selected item exposes Sloane model and length controls with the verified Grey Oak swatch", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    expect(await selectImportedFamilyByHint(page, "Sloane")).toBeTruthy();
    expect(await selectImportedProductById(page, SLOANE_DINING_TABLE_180_ID)).toBeTruthy();
    expect(await addImportedProductIfReady(page)).toBeTruthy();

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Sloane Dining Table")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dining table$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Travertine dining table$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Bench$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^180CM$/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^225CM$/i }).first()).toBeVisible();

    await expect(page.getByTestId("selected-single-finish-section")).toContainText(/^Leg/i);
    await expect(page.getByTestId("selected-single-finish-label")).toContainText(/Grey Oak/i);
    await expect(page.getByTestId("selected-single-finish-swatch")).toHaveAttribute(
      "style",
      /Sloane-Dining-Chair_Swatch_1_1/i,
    );
  });
});
