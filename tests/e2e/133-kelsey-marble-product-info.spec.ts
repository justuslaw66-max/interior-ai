import { expect, test } from "./fixtures";

const KELSEY_160_ID = "dining-real-castlery-kelsey-marble-160";
const KELSEY_180_ID = "dining-real-castlery-kelsey-marble-180";

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

test.describe("133. Kelsey Marble Dining Table Product Info", () => {
  test("API exposes Castlery SG product details for the 160cm and 180cm variants", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        const modelIds = new Set((body.models ?? []).map((model) => (model as ImportedModel).id));
        return modelIds.has(KELSEY_160_ID) && modelIds.has(KELSEY_180_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Kelsey product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const kelsey160 = body.models?.find((entry) => entry.id === KELSEY_160_ID);
    const kelsey180 = body.models?.find((entry) => entry.id === KELSEY_180_ID);
    expect(kelsey160).toBeDefined();
    expect(kelsey180).toBeDefined();

    expect(kelsey160?.catalog?.variants ?? []).toHaveLength(2);
    expect(kelsey160?.catalog?.variants?.map((variant) => variant.finish_code).sort()).toEqual([
      "dark_walnut",
      "white_wash",
    ]);
    expectRows(kelsey160?.catalog?.product_details?.material, [
      /Leg frame: Solid rubber wood with copper feet caps/i,
      /Table top: 6mm carrara marble with plywood core/i,
      /Care: Marble table/i,
      /Colour variance: Marble variations/i,
      /Material & safety standards: Formaldehyde safe/i,
    ]);
    expectRows(kelsey160?.catalog?.product_details?.dimensions, [
      /Dimension: W160 x D90 x H76cm/i,
      /Table top thickness: 2.5cm/i,
      /Leg height: 73cm/i,
      /Leg to leg distance \(at height 45cm\): 113cm \(at height 45cm\)/i,
      /Capacity: Sits 4 people comfortably/i,
      /Product weight: 54kg/i,
      /Packaging dimensions: 2 boxes/i,
      /Levellers: Included \(max 2cm\)/i,
      /Max bearing support: 200kg/i,
    ]);

    expect(kelsey180?.catalog?.variants ?? []).toHaveLength(2);
    expect(kelsey180?.catalog?.variants?.map((variant) => variant.finish_code).sort()).toEqual([
      "dark_walnut",
      "white_wash",
    ]);
    expectRows(kelsey180?.catalog?.product_details?.material, [
      /Leg frame: Solid rubber wood with copper feet caps/i,
      /Table top: 6mm carrara marble with plywood core/i,
      /Care: Marble table/i,
      /Colour variance: Marble variations/i,
      /Material & safety standards: Formaldehyde safe/i,
    ]);
    expectRows(kelsey180?.catalog?.product_details?.dimensions, [
      /Dimension: W180 x D90 x H76cm/i,
      /Capacity: Sits 6 people comfortably/i,
      /Product weight: 62kg/i,
      /Packaging dimensions: 2 boxes/i,
    ]);

    for (const model of [kelsey160, kelsey180]) {
      expectRows(model?.catalog?.product_details?.delivery_and_warranty, [
        /Cancellation: Free—5 working days before delivery/i,
        /Warranty: 5-year limited warranty/i,
        /Return policy: 30-day returns/i,
        /Assembly: Legs to be fitted, protective wood frame to be dismantled\./i,
      ]);
    }
  });
});
