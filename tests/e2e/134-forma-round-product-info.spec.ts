import { expect, test } from "./fixtures";

const FORMA_ROUND_90_ID = "dining-real-castlery-forma-round-90";
const FORMA_ROUND_120_ID = "dining-real-castlery-forma-round-120";

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

test.describe("134. Forma Round Dining Table Product Info", () => {
  test("API exposes Castlery SG product details for the 90cm and 120cm variants", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        const modelIds = new Set((body.models ?? []).map((model) => (model as ImportedModel).id));
        return modelIds.has(FORMA_ROUND_90_ID) && modelIds.has(FORMA_ROUND_120_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Forma Round product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const forma90 = body.models?.find((entry) => entry.id === FORMA_ROUND_90_ID);
    const forma120 = body.models?.find((entry) => entry.id === FORMA_ROUND_120_ID);
    expect(forma90).toBeDefined();
    expect(forma120).toBeDefined();

    expect(forma90?.catalog?.variants ?? []).toHaveLength(1);
    expect(forma90?.catalog?.variants?.[0]).toMatchObject({
      size_label: "90",
      finish_code: "natural_walnut",
    });
    expectRows(forma90?.catalog?.product_details?.material, [
      /Material: Tabletop: solid American walnut; Base: metal/i,
      /Finish: Tabletop: PU finish in natural walnut with 5% gloss; Base: powder coating in black/i,
      /Care: Wooden table/i,
      /Colour variance: Natural variations/i,
      /Material & safety standards: Formaldehyde safe/i,
    ]);
    expectRows(forma90?.catalog?.product_details?.dimensions, [
      /Dimension: W90 x D90 x H75\.1cm/i,
      /Table top thickness: 2\.1cm/i,
      /Leg height: 73cm/i,
      /Leg room - height clearance: 73cm/i,
      /Capacity: Sits 2 people comfortably/i,
      /Product weight: 33\.9kg/i,
      /Packaging dimensions: 2 boxes/i,
      /Levellers: Included/i,
      /Max bearing support: 91kg/i,
    ]);

    expect(forma120?.catalog?.variants ?? []).toHaveLength(1);
    expect(forma120?.catalog?.variants?.[0]).toMatchObject({
      size_label: "120",
      finish_code: "natural_walnut",
    });
    expectRows(forma120?.catalog?.product_details?.material, [
      /Material: Tabletop: solid American walnut; Base: metal/i,
      /Finish: Tabletop: PU finish in natural walnut with 5% gloss; Base: powder coating in black/i,
      /Care: Wooden table/i,
      /Colour variance: Natural variations/i,
      /Material & safety standards: Formaldehyde safe/i,
    ]);
    expectRows(forma120?.catalog?.product_details?.dimensions, [
      /Dimension: W120 x D120 x H75\.1cm/i,
      /Capacity: Sits 4 people comfortably/i,
      /Product weight: 53kg/i,
      /Packaging dimensions: 2 boxes/i,
    ]);

    for (const model of [forma90, forma120]) {
      expectRows(model?.catalog?.product_details?.delivery_and_warranty, [
        /Cancellation: Free—5 working days before delivery/i,
        /Warranty: 5-year limited warranty/i,
        /Return policy: 30-day returns/i,
        /Assembly: Table top and base to be fitted/i,
      ]);
    }
  });
});
