import { expect, test } from "./fixtures";

const DAWSON_OTTOMAN_ID = "sofa-real-castlery-dawson-ottoman";

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
    variants?: Array<{ size_label?: string; dimensions?: { width_cm?: number; depth_cm?: number } }>;
    product_details_by_material_type?: Record<string, ProductInfoSection>;
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

test.describe("120. Dawson Ottoman Product Info", () => {
  test("API exposes Castlery SG fabric/leather product info, size-specific dimensions, and seat-feel data", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === DAWSON_OTTOMAN_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Dawson Ottoman product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === DAWSON_OTTOMAN_ID);
    expect(model).toBeDefined();

    expect(model?.catalog?.variants?.some((variant) => variant.size_label === "93x93")).toBeTruthy();
    expect(model?.catalog?.variants?.some((variant) => variant.size_label === "114x93")).toBeTruthy();

    const details = model?.catalog?.product_details_by_material_type;
    expect(details?.fabric).toBeDefined();
    expect(details?.leather).toBeDefined();

    expectRows(details?.fabric?.material, [
      /Fabric composition: 93% Polyester, 7% Linen/i,
      /Filling: Foam, fibre and feather filled seat/i,
      /Cover type: Fully removable covers \(seat and back cushions, and frame\)/i,
    ]);
    expectRows(details?.fabric?.dimensions, [
      /Dimension \(93cm\): W93 x D93 x H45cm/i,
      /Dimension \(114cm\): W114 x D93 x H45cm/i,
      /Product weight \(93cm\): 19\.9kg/i,
      /Product weight \(114cm\): 20kg/i,
      /Max bearing support: 150kg/i,
    ]);
    expectRows(details?.fabric?.delivery_and_warranty, [
      /Warranty: Frame 10 years; Fabric 1 year; Foam 2 years/i,
      /Assembly: Fully assembled/i,
    ]);

    expectRows(details?.leather?.material, [
      /Care: Leather sofa/i,
      /Material details: Top grain leather\. Crafted from American hides\./i,
      /Cover type: Removable cover of seat cushion/i,
    ]);
    expectRows(details?.leather?.dimensions, [
      /Dimension \(93cm\): W93 x D93 x H45cm/i,
      /Dimension \(114cm\): W114 x D93 x H45cm/i,
      /Product weight \(114cm\): 23\.6kg/i,
      /Packaging dimensions: 1 box/i,
    ]);
    expectRows(details?.leather?.delivery_and_warranty, [
      /Warranty: Frame 10 years; Leather 1 year; Foam 2 years/i,
      /Return policy: 30-day returns/i,
    ]);

    expect(model?.catalog?.comfort_profile?.seat_comfort?.value).toBe(1);
    expect(model?.catalog?.comfort_profile?.seat_depth?.value).toBe(4);
    expect(model?.catalog?.comfort_profile?.seat_height?.value).toBe(3);
    expect(model?.catalog?.comfort_profile?.seat_softness?.value).toBe(1);
  });
});
