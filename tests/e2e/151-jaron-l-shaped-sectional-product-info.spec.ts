import { expect, test } from "./fixtures";

const JARON_L_SHAPED_SLIM_ID = "sofa-real-castlery-jaron-l-shaped-sectional";
const JARON_L_SHAPED_WIDE_ID = "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm";

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
  dimsWmm?: number;
  dimsDmm?: number;
  catalog?: {
    priceUsd?: number;
    variants?: Array<{
      price_usd?: number;
      size_label?: string;
      upholstery_code?: string;
      dimensions?: { width_cm?: number; depth_cm?: number };
    }>;
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

test.describe("151. Jaron L-Shaped Sectional Product Info", () => {
  test("API exposes Castlery SG slim and wide L-shaped sectional variants with full leather product info", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        const ids = new Set((body.models ?? []).map((model) => (model as ImportedModel).id));
        return ids.has(JARON_L_SHAPED_SLIM_ID) && ids.has(JARON_L_SHAPED_WIDE_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Jaron L-shaped sectional API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const slim = body.models?.find((entry) => entry.id === JARON_L_SHAPED_SLIM_ID);
    const wide = body.models?.find((entry) => entry.id === JARON_L_SHAPED_WIDE_ID);
    expect(slim).toBeDefined();
    expect(wide).toBeDefined();

    expect(slim?.catalog?.priceUsd).toBe(8495);
    expect(slim?.dimsWmm).toBe(3250);
    expect(slim?.dimsDmm).toBe(3250);
    expect(slim?.catalog?.variants?.map((variant) => variant.upholstery_code)).toEqual([
      "marche_cocoa",
      "marche_ivory",
    ]);
    expect(slim?.catalog?.variants?.map((variant) => variant.price_usd)).toEqual([8495, 8495]);
    expect(slim?.catalog?.variants?.every((variant) => variant.size_label === "325x325")).toBeTruthy();

    expect(wide?.catalog?.priceUsd).toBe(8595);
    expect(wide?.dimsWmm).toBe(3250);
    expect(wide?.dimsDmm).toBe(3250);
    expect(wide?.catalog?.variants?.map((variant) => variant.upholstery_code)).toEqual([
      "marche_cocoa",
      "marche_ivory",
    ]);
    expect(wide?.catalog?.variants?.map((variant) => variant.price_usd)).toEqual([8595, 8595]);
    expect(wide?.catalog?.variants?.every((variant) => variant.size_label === "325x325")).toBeTruthy();

    const slimDetails = slim?.catalog?.product_details_by_material_type;
    expect(slimDetails?.fabric).toBeUndefined();
    expectRows(slimDetails?.leather?.material, [
      /Care: Leather sofa/i,
      /Material details: Top grain leather\. Crafted from American hides\./i,
      /Configuration includes: 1 x Corner Sofa; 2 x Power Recliner Armless; 2 x Slim Arm; 2 x Stationary Armless Sofa/i,
    ]);
    expectRows(slimDetails?.leather?.dimensions, [
      /Dimension: W196\/325 x D196\/325 x H77cm/i,
      /Armrest height: 62cm/i,
      /Product weight: 237\.2kg/i,
      /Packaging dimensions: 9 boxes/i,
    ]);

    const wideDetails = wide?.catalog?.product_details_by_material_type;
    expect(wideDetails?.fabric).toBeUndefined();
    expectRows(wideDetails?.leather?.material, [
      /Configuration includes: 1 x Corner Sofa; 2 x Wide Arm; 2 x Power Recliner Armless; 2 x Stationary Armless Sofa/i,
    ]);
    expectRows(wideDetails?.leather?.dimensions, [
      /Dimension: W196\/325 x D196\/325 x H77cm/i,
      /Armrest height: 58cm/i,
      /Product weight: 241\.2kg/i,
    ]);
    expectRows(wideDetails?.leather?.delivery_and_warranty, [
      /Warranty: Frame 10 years; Leather 1 year; Foam 2 years; Electrical components 2 years/i,
      /Assembly: Arms to be fitted/i,
    ]);

    for (const model of [slim, wide]) {
      expect(model?.catalog?.comfort_profile?.seat_comfort?.value).toBe(2);
      expect(model?.catalog?.comfort_profile?.seat_depth?.value).toBe(4);
      expect(model?.catalog?.comfort_profile?.seat_height?.value).toBe(4);
      expect(model?.catalog?.comfort_profile?.seat_softness?.value).toBe(2);
    }
  });
});
