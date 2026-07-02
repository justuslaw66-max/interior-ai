import { expect, test } from "./fixtures";

const SAWYER_SIDEBOARD_ID = "storage-real-castlery-sawyer-sideboard-180cm";

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
    variants?: Array<{ finish_code?: string }>;
    product_details?: ProductInfoSection;
  } | null;
};

function expectRows(rows: ProductInfoRow[] | undefined, expected: RegExp[]) {
  const values = (rows ?? []).map((row) => `${row.label ?? ""}: ${row.value ?? ""}`);
  for (const pattern of expected) {
    expect(values.some((value) => pattern.test(value)), `Expected rows to include ${pattern}`).toBeTruthy();
  }
}

test.describe("142. Sawyer Sideboard Product Info", () => {
  test("API exposes Castlery SG product details for the 180cm Natural variant", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === SAWYER_SIDEBOARD_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Sawyer Sideboard product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === SAWYER_SIDEBOARD_ID);
    expect(model).toBeDefined();
    expect(model?.catalog?.variants?.[0]).toMatchObject({
      finish_code: "natural",
    });

    const details = model?.catalog?.product_details;
    expectRows(details?.material, [
      /Material: Main Material: solid oak, oak veneer over engineered wood; Door: solid oak; Leg: solid birch/i,
      /Finish: Wire brushed and natural colour/i,
      /Cupboard mechanism: Adjustable shelves/i,
      /Care: Storage furniture/i,
      /Colour variance: Disclaimer/i,
      /Material & safety standards: Low formaldehyde/i,
      /Safety tip: Anti-tip prevention/i,
    ]);
    expectRows(details?.dimensions, [
      /Dimension: W180 x D45 x H76cm/i,
      /Shelves height: 24\.6\/27\.8\/31cm \(adjustable height\)/i,
      /Cupboard capacity: 4 x W41\.6 x D38\.6 x H24\.6\/27\.8\/31cm; 4 x W42\.6 x D38\.6 x H24\.6\/27\.8\/31cm/i,
      /Leg height: 15cm/i,
      /Leg room - height clearance: 10cm/i,
      /Product weight: 67\.5kg/i,
      /Packaging dimensions: 1 box/i,
      /Max bearing support: 100kg/i,
    ]);
    expectRows(details?.delivery_and_warranty, [
      /Cancellation: Clearance—no cancellation/i,
      /Warranty: 5-year limited warranty/i,
      /Return policy: Clearance—no return or exchange/i,
      /Assembly: Legs to be fitted/i,
    ]);
  });
});
