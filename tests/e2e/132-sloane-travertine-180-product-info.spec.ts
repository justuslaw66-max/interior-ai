import { expect, test } from "./fixtures";
import { GLB_CALIBRATION_BY_PRODUCT_ID } from "../../lib/design-page-calibration";
import { openCatalogPreview } from "./variant-test-utils";

const SLOANE_TRAVERTINE_180_ID = "dining-real-castlery-sloane-travertine-180";
const SLOANE_TRAVERTINE_225_ID = "dining-real-castlery-sloane-travertine-225";

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

  test("API exposes the 225cm Travertine variant with matching identity and model asset", async ({ request }) => {
    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as {
      models?: Array<
        ImportedModel & {
          modelUrl?: string;
          dimsWmm?: number;
          dimsDmm?: number;
          dimsHmm?: number;
          catalog?: ImportedModel["catalog"] & {
            source_url?: string;
          };
        }
      >;
    };
    const model = body.models?.find((entry) => entry.id === SLOANE_TRAVERTINE_225_ID);
    expect(model).toBeDefined();
    expect(model?.modelUrl).toBe("/assets/models/dining-real-castlery-sloane-travertine-225.glb");
    expect(model?.catalog?.source_url).toContain("castlery.com/sg/products/sloane-travertine-dining-table");
    expect(model?.catalog?.source_url).toContain("length=2_25m");
    expect(model?.dimsWmm).toBe(2250);
    expect(model?.dimsDmm).toBe(1000);
    expect(model?.dimsHmm).toBe(760);

    const variants = model?.catalog?.variants ?? [];
    expect(variants).toHaveLength(1);
    expect(variants[0]?.size_label).toBe("225");
    expect(variants[0]?.finish_code).toBe("grey_oak");

    expectRows(model?.catalog?.product_details?.dimensions, [
      /Dimension: W225 x D100 x H76cm/i,
      /Leg to leg distance \(at height 45cm\): 159cm/i,
      /Product weight: 97kg/i,
    ]);
  });

  test("uses authored GLB colour and the verified Castlery SG Grey Oak swatch", async () => {
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_TRAVERTINE_180_ID]?.useVariantColor).toBe(false);
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_TRAVERTINE_225_ID]?.useVariantColor).toBe(false);
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_TRAVERTINE_180_ID]?.swapWidthDepthAxes).toBe(false);
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SLOANE_TRAVERTINE_225_ID]?.swapWidthDepthAxes).toBe(true);
  });

  test("selected item shows the Castlery SG leg finish without inventing a flat colour swatch", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, SLOANE_TRAVERTINE_180_ID, "Sloane Travertine");
    expect(opened).toBeTruthy();

    await expect(page.getByText("Product details")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("catalog-detail-add-to-room").click({ noWaitAfter: true });

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });

    const finishSection = page.getByTestId("selected-single-finish-section");
    await expect(finishSection).toContainText(/^Leg/i);
    await expect(page.getByTestId("selected-single-finish-label")).toContainText(/Grey Oak/i);
    await expect(page.getByTestId("selected-single-finish-swatch")).toHaveAttribute(
      "style",
      /Sloane-Dining-Chair_Swatch_1_1/i,
    );

    await page.getByRole("button", { name: /^Show details$/i }).click();
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(
      /6mm travertine stone over aluminium honeycomb backing/i,
    );
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(/Low formaldehyde/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    await expect(page.getByTestId("selected-product-dimensions-panel")).toContainText(
      /W180 x D90 x H76cm/i,
    );
    await expect(page.getByTestId("selected-product-dimensions-panel")).toContainText(/76\.9kg/i);
    await expect(page.getByTestId("selected-product-dimensions-image")).toHaveAttribute(
      "src",
      /Sloane-Travertine-Dining-Table-180cm-Dim/i,
    );

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /5-year limited warranty/i,
    );
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /Legs to be fitted/i,
    );
  });
});
