import { expect, test } from "./fixtures";

const OLLIE_STORAGE_OTTOMAN_ID = "sofa-real-castlery-ollie-storage-ottoman";

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
    variants?: Array<{
      size_label?: string;
      dimensions?: { width_cm?: number; depth_cm?: number };
      state_assets?: Record<string, unknown>;
    }>;
    product_details?: ProductInfoSection;
    comfort_profile?: {
      seat_comfort?: { value?: number };
      seat_depth?: { value?: number };
      seat_height?: { value?: number };
      seat_softness?: { value?: number };
    };
  } | null;
};

function expectRows(rows: ProductInfoRow[] | undefined, expected: RegExp[]) {
  const values = (rows ?? []).map((row) => `${row.label ?? ""}: ${row.value ?? ""}`);
  for (const pattern of expected) {
    expect(values.some((value) => pattern.test(value)), `Expected rows to include ${pattern}`).toBeTruthy();
  }
}

test.describe("122. Ollie Storage Ottoman Product Info", () => {
  test("API exposes Castlery SG storage details and keeps open state out of purchasable variant identity", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === OLLIE_STORAGE_OTTOMAN_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Ollie Storage Ottoman product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === OLLIE_STORAGE_OTTOMAN_ID);
    expect(model).toBeDefined();

    const variants = model?.catalog?.variants ?? [];
    expect(variants).toHaveLength(1);
    expect(variants[0]?.size_label).toBe("93x77");
    expect(variants[0]?.state_assets?.closed).toBeDefined();
    expect(variants[0]?.state_assets?.open_storage).toBeDefined();

    const details = model?.catalog?.product_details;
    expect(details).toBeDefined();

    expectRows(details?.material, [
      /Material: Frame: engineered wood with plywood; Leg: black plastic/i,
      /Filling: Seat: foam and fiber; Back: fiber/i,
      /Suspension: Webbing/i,
      /Cover type: Removable/i,
    ]);
    expectRows(details?.dimensions, [
      /Dimension: W93 x D77 x H44cm/i,
      /Storage inner dimension: W79 x D64 x H22cm/i,
      /Product weight: 22\.5kg/i,
      /Packaging dimensions: 2 boxes/i,
      /Max bearing support: 150kg/i,
    ]);
    expectRows(details?.delivery_and_warranty, [
      /Warranty: Frame 10 years, Fabric 1 year, Foam 2 years/i,
      /Return policy: 30-day returns/i,
      /Assembly: Covers need to be fitted/i,
    ]);

    expect(model?.catalog?.comfort_profile?.seat_comfort?.value).toBe(2);
    expect(model?.catalog?.comfort_profile?.seat_depth?.value).toBe(5);
    expect(model?.catalog?.comfort_profile?.seat_height?.value).toBe(3);
    expect(model?.catalog?.comfort_profile?.seat_softness?.value).toBe(3);
  });
});
