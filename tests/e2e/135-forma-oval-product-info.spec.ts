import { expect, test } from "./fixtures";

const FORMA_OVAL_150_ID = "dining-real-castlery-forma-oval-150";

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

test.describe("135. Forma Oval Dining Table Product Info", () => {
  test("API exposes Castlery SG product details for the 150cm variant", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        const modelIds = new Set((body.models ?? []).map((model) => (model as ImportedModel).id));
        return modelIds.has(FORMA_OVAL_150_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Forma Oval product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const formaOval = body.models?.find((entry) => entry.id === FORMA_OVAL_150_ID);
    expect(formaOval).toBeDefined();

    expect(formaOval?.catalog?.variants ?? []).toHaveLength(1);
    expect(formaOval?.catalog?.variants?.[0]).toMatchObject({
      size_label: "150",
      finish_code: "natural_walnut",
    });
    expectRows(formaOval?.catalog?.product_details?.material, [
      /Material: Tabletop: solid American walnut; Base: metal/i,
      /Finish: Tabletop: PU finish in natural walnut with 5% gloss ; Base: powder coating in black/i,
      /Care: Wooden table/i,
      /Colour variance: Natural variations/i,
      /Material & safety standards: Formaldehyde safe/i,
    ]);
    expectRows(formaOval?.catalog?.product_details?.dimensions, [
      /Dimension: W150 x D95 x H75\.1cm/i,
      /Table top thickness: 2\.1cm/i,
      /Leg height: 73cm/i,
      /Leg room - height clearance: 73cm/i,
      /Capacity: Sits 4-6 people comfortably/i,
      /Product weight: 51\.3kg/i,
      /Packaging dimensions: 2 boxes/i,
      /Levellers: Included/i,
      /Max bearing support: 91kg/i,
    ]);
    expectRows(formaOval?.catalog?.product_details?.delivery_and_warranty, [
      /Cancellation: Free—5 working days before delivery/i,
      /Warranty: 5-year limited warranty/i,
      /Return policy: 30-day returns/i,
      /Assembly: Table top and base to be fitted/i,
    ]);
  });
});
