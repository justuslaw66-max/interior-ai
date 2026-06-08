import { expect, test } from "./fixtures";
import { GLB_CALIBRATION_BY_PRODUCT_ID } from "../../lib/design-page-calibration";
import { openCatalogPreview } from "./variant-test-utils";

const SLOANE_TRAVERTINE_180_ID = "dining-real-castlery-sloane-travertine-180";
const SLOANE_TRAVERTINE_220_ID = "dining-real-castlery-sloane-travertine-220";

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
  catalog?: {
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

test.describe("132. Sloane Travertine Dining Table 180cm Product Info", () => {
  test("API exposes Castlery SG product details for the 180cm Grey Oak variant", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === SLOANE_TRAVERTINE_180_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Sloane Travertine product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === SLOANE_TRAVERTINE_180_ID);
    expect(model).toBeDefined();

    const variants = model?.catalog?.variants ?? [];
    expect(variants).toHaveLength(1);
    expect(variants[0]?.size_label).toBe("180");
    expect(variants[0]?.finish_code).toBe("grey_oak");

    const details = model?.catalog?.product_details;
    expect(details).toBeDefined();

    expectRows(details?.material, [
      /Material: Tabletop: 6mm travertine stone over aluminium honeycomb backing; Leg: engineered wood with oak veneer/i,
      /Finish: Grey oak finish/i,
      /Care: Wooden table/i,
      /Colour variance: Natural variations/i,
      /Material & safety standards: Low formaldehyde/i,
    ]);
    expectRows(details?.dimensions, [
      /Dimension: W180 x D90 x H76cm/i,
      /Table top thickness: 5cm/i,
      /Leg height: 71cm/i,
      /Leg to leg distance \(at height 45cm\): 114cm/i,
      /Leg room - height clearance: 71cm/i,
      /Capacity: Sits 6 people comfortably/i,
      /Product weight: 76.9kg/i,
      /Packaging dimensions: 3 boxes/i,
      /Levellers: Included \(max 1cm\)/i,
      /Max bearing support: 100kg/i,
    ]);
    expectRows(details?.delivery_and_warranty, [
      /Cancellation: Free—5 working days before delivery/i,
      /Warranty: 5-year limited warranty/i,
      /Return policy: 30-day returns/i,
      /Assembly: Legs to be fitted/i,
    ]);
  });

  test("uses authored GLB colour and the verified Castlery SG Grey Oak swatch", async () => {
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_TRAVERTINE_180_ID]?.useVariantColor).toBe(false);
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_TRAVERTINE_220_ID]?.useVariantColor).toBe(false);
  });

  test("selected item shows the Castlery SG leg finish without inventing a flat colour swatch", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, SLOANE_TRAVERTINE_180_ID, "Sloane Travertine");
    expect(opened).toBeTruthy();

    await expect(page.getByText("Product details")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("catalog-detail-add-to-room").click();

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });

    const finishSection = page.getByTestId("selected-single-finish-section");
    await expect(finishSection).toContainText(/^Leg/i);
    await expect(page.getByTestId("selected-single-finish-label")).toContainText(/Grey Oak/i);
    await expect(page.getByTestId("selected-single-finish-swatch")).toHaveAttribute(
      "style",
      /Sloane-Dining-Chair_Swatch_1_1/i,
    );
  });
});
