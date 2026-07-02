import { expect, test } from "./fixtures";
import { GLB_CALIBRATION_BY_PRODUCT_ID } from "../../lib/design-page-calibration";

const BRISTOL_ID = "coffee-real-castlery-bristol-coffee-table-set-walnut";

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
  modelUrl?: string | null;
  catalog?: {
    source_url?: string;
    productName?: string;
    priceUsd?: number;
    assets?: {
      thumbnail_url?: string;
      gallery_images?: string[];
    };
    variants?: Array<{
      sku?: string;
      size_label?: string;
      finish_code?: string;
      finish_label?: string;
      model_url?: string;
    }>;
    product_details?: ProductInfoSection;
  } | null;
};

function expectRows(rows: ProductInfoRow[] | undefined, expected: RegExp[]) {
  const values = (rows ?? []).map((row) => `${row.label ?? ""}: ${row.value ?? ""}`);
  for (const pattern of expected) {
    expect(values.some((value) => pattern.test(value)), `Expected rows to include ${pattern}`).toBeTruthy();
  }
}

test.describe("147. Bristol Coffee Table Product Info", () => {
  test("API exposes verified Castlery SG identity, media, dimensions, and variant data", async ({ request }) => {
    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = (body.models ?? []).find((entry) => entry.id === BRISTOL_ID);

    expect(model).toBeDefined();
    expect(model?.modelUrl).toBe("/assets/models/coffee-real-castlery-bristol-coffee-table-set-walnut.glb");
    expect(model?.catalog?.source_url).toBe(
      "https://www.castlery.com/sg/products/bristol-coffee-table-set-walnut?wood=walnut",
    );
    expect(model?.catalog?.productName).toBe("Bristol Coffee Table Set, Walnut");
    expect(model?.catalog?.priceUsd).toBe(499);
    expect(model?.catalog?.assets?.thumbnail_url).toContain("Bristol-Coffee-Table-Set-Front");
    expect(model?.catalog?.assets?.gallery_images?.length).toBeGreaterThanOrEqual(10);

    const variant = model?.catalog?.variants?.[0];
    expect(variant?.sku).toBe("41230001");
    expect(variant?.size_label).toBe("110x60");
    expect(variant?.finish_code).toBe("walnut");
    expect(variant?.finish_label).toBe("Walnut");
    expect(variant?.model_url).toBe("/assets/models/coffee-real-castlery-bristol-coffee-table-set-walnut.glb");

    expectRows(model?.catalog?.product_details?.material, [
      /Material: Table top: solid rubber wood and walnut veneer; Leg: solid rubber wood/i,
      /Finish: Walnut stain/i,
      /Care: Wooden table/i,
      /Colour variance: Natural variations/i,
      /Material & safety standards: Formaldehyde safe/i,
    ]);
    expectRows(model?.catalog?.product_details?.dimensions, [
      /Dimension: High: W55 x D55 x H51cm; Low: W110 x D60 x H42\.8cm/i,
      /Table top thickness: 2cm/i,
      /Product weight: 15\.9kg/i,
      /Packaging dimensions: 1 box/i,
      /Max bearing support: 60kg for each table/i,
    ]);
    expectRows(model?.catalog?.product_details?.delivery_and_warranty, [
      /Cancellation: Free.5 working days before delivery/i,
      /Warranty: 5-year limited warranty/i,
      /Return policy: 30-day returns/i,
      /Assembly: Frame to be fitted/i,
    ]);
  });

  test("uses authored GLB colour for the Walnut model", async () => {
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[BRISTOL_ID]?.useVariantColor).toBe(false);
  });
});
