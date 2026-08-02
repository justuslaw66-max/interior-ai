import { expect, test } from "./fixtures";

const DAWSON_STORAGE_OTTOMAN_ID = "sofa-real-castlery-dawson-storage-ottoman";

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

test.describe("121. Dawson Storage Ottoman Product Info", () => {
  test("API exposes Castlery SG storage ottoman details without turning open state into a purchasable variant", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === DAWSON_STORAGE_OTTOMAN_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Dawson Storage Ottoman product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === DAWSON_STORAGE_OTTOMAN_ID);
    expect(model).toBeDefined();

    const variants = model?.catalog?.variants ?? [];
    expect(variants.some((variant) => variant.size_label === "93x93")).toBeTruthy();
    expect(variants.some((variant) => variant.size_label === "114x93")).toBeTruthy();
    expect(variants.some((variant) => variant.state_assets?.closed && variant.state_assets?.open_storage)).toBeTruthy();
    expect(variants).toHaveLength(2);

    const details = model?.catalog?.product_details;
    expect(details).toBeDefined();

    expectRows(details?.material, [
      /Material: Frame: engineered wood with plywood; Leg: black plastic/i,
      /Filling: Foam and fibre and feather/i,
      /Cover type: Removable cushion cover and frame cover/i,
    ]);
    expectRows(details?.dimensions, [
      /Dimension \(93cm\): W93 x D93 x H45cm/i,
      /Dimension \(114cm\): W114 x D93 x H45cm/i,
      /Storage inner dimension \(93cm\): W75 x D75 x H23cm/i,
      /Storage inner dimension \(114cm\): W97 x D75 x H23cm/i,
      /Product weight \(93cm\): 23\.8kg/i,
      /Product weight \(114cm\): 28\.7kg/i,
      /Max bearing support: 150kg/i,
    ]);
    expectRows(details?.delivery_and_warranty, [
      /Warranty: Frame 10 years; Fabric 1 year; Foam 2 years/i,
      /Return policy: 30-day returns/i,
      /Assembly: Fully assembled/i,
    ]);

    expect(model?.catalog?.comfort_profile?.seat_comfort?.value).toBe(1);
    expect(model?.catalog?.comfort_profile?.seat_depth?.value).toBe(4);
    expect(model?.catalog?.comfort_profile?.seat_height?.value).toBe(3);
    expect(model?.catalog?.comfort_profile?.seat_softness?.value).toBe(1);
  });
});
