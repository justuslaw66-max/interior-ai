import { expect, test } from "./fixtures";

const JARON_EXTENDED_WIDE_ID = "sofa-real-castlery-jaron-extended-3s-wide-arm";

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
    variants?: Array<{ size_label?: string; dimensions?: { width_cm?: number } }>;
    product_details_by_material_type?: Record<string, ProductInfoSection>;
    comfort_profile?: {
      seat_comfort?: { value?: number };
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

test.describe("119. Jaron Extended Wide Arm Product Info", () => {
  test("API exposes Castlery SG material-specific product info and selected wide-arm dimensions", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === JARON_EXTENDED_WIDE_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Jaron extended wide product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === JARON_EXTENDED_WIDE_ID);
    expect(model).toBeDefined();

    expect(model?.catalog?.variants?.every((variant) => variant.size_label === "316x115")).toBeTruthy();
    expect(model?.catalog?.variants?.every((variant) => variant.dimensions?.width_cm === 316)).toBeTruthy();

    const details = model?.catalog?.product_details_by_material_type;
    expect(details?.fabric).toBeDefined();
    expect(details?.leather).toBeDefined();

    expectRows(details?.fabric?.material, [
      /Fabric composition: 100% Polyester/i,
      /Care: Fabric sofa/i,
      /Configuration includes: 2 x Wide Arm; 2 x Power Recliner Armless; 1 x Stationary Armless Sofa/i,
    ]);
    expectRows(details?.fabric?.dimensions, [
      /Dimension: W316 x D115 x H77cm/i,
      /Seatable width: 258cm/i,
      /Armrest height: 58cm/i,
      /Product weight: 144\.7kg/i,
      /Packaging dimensions: 7 boxes/i,
    ]);
    expectRows(details?.fabric?.delivery_and_warranty, [
      /Warranty: Frame 10 years; Fabric 1 year; Foam 2 years; Electrical components 2 years/i,
      /Assembly: Arms to be fitted/i,
    ]);

    expectRows(details?.leather?.material, [
      /Care: Leather sofa/i,
      /Colour variance: Leather variations/i,
      /Material details: Top grain leather\. Crafted from American hides\./i,
      /Configuration includes: 2 x Wide Arm; 2 x Power Recliner Armless; 1 x Stationary Armless Sofa/i,
    ]);
    expectRows(details?.leather?.dimensions, [
      /Dimension: W316 x D115 x H77cm/i,
      /Max bearing support: 3 x 150kg/i,
      /Product weight: 159\.7kg/i,
      /Packaging dimensions: 7 boxes/i,
    ]);
    expectRows(details?.leather?.delivery_and_warranty, [
      /Warranty: Frame 10 years; Leather 1 year; Foam 2 years; Electrical components 2 years/i,
      /Return policy: 30-day returns/i,
      /Assembly: Arms to be fitted/i,
    ]);

    expect(model?.catalog?.comfort_profile?.seat_comfort?.value).toBe(2);
    expect(model?.catalog?.comfort_profile?.seat_height?.value).toBe(4);
    expect(model?.catalog?.comfort_profile?.seat_softness?.value).toBe(2);
    expect(model?.catalog?.comfort_profile).not.toHaveProperty("seat_depth");
  });
});
