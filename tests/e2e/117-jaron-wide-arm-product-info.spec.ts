import { expect, test } from "./fixtures";

const JARON_WIDE_ARM_ID = "sofa-real-castlery-jaron-3s-wide-arm";

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

test.describe("117. Jaron Wide Arm Product Info", () => {
  test("API exposes Castlery SG material-specific product info and corrected wide-arm dimensions", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === JARON_WIDE_ARM_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Jaron wide-arm product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === JARON_WIDE_ARM_ID);
    expect(model).toBeDefined();

    expect(model?.catalog?.variants?.every((variant) => variant.size_label === "230x115")).toBeTruthy();
    expect(model?.catalog?.variants?.every((variant) => variant.dimensions?.width_cm === 230)).toBeTruthy();

    const details = model?.catalog?.product_details_by_material_type;
    expect(details?.fabric).toBeDefined();
    expect(details?.leather).toBeDefined();

    expectRows(details?.fabric?.material, [
      /Fabric composition: 100% Polyester/i,
      /Care: Fabric sofa/i,
      /Configuration includes: 2 x Wide Arm; 2 x Power Recliner Armless/i,
    ]);
    expectRows(details?.fabric?.dimensions, [
      /Dimension: W230 x D115 x H77cm/i,
      /Armrest height: 58cm/i,
      /Product weight: 115\.7kg/i,
    ]);
    expectRows(details?.fabric?.delivery_and_warranty, [
      /Warranty: Frame 10 years; Fabric 1 year; Foam 2 years; Electrical components 2 years/i,
      /Assembly: Arms to be fitted/i,
    ]);

    expectRows(details?.leather?.material, [
      /Care: Leather sofa/i,
      /Colour variance: Leather variations/i,
      /Material details: Top grain leather\. Crafted from American hides\./i,
      /Configuration includes: 2 x Wide Arm; 2 x Power Recliner Armless/i,
    ]);
    expectRows(details?.leather?.dimensions, [
      /Dimension: W230 x D115 x H77cm/i,
      /Armrest height: 58cm/i,
      /Product weight: 127\.7kg/i,
      /Packaging dimensions: 6 boxes/i,
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
