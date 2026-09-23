import { expect, test } from "./fixtures";
import { GLB_CALIBRATION_BY_PRODUCT_ID } from "../../lib/design-page-calibration";
import { LENGTH_OPTIONS_BY_PRODUCT_ID } from "../../lib/design-page-model-maps";

const SEB_DINING_TABLE_150_ID = "dining-real-castlery-seb-dining-table-150";
const SEB_DINING_TABLE_180_ID = "dining-real-castlery-seb-dining-table-180";

type ProductInfoRow = {
  label?: string;
  value?: string;
};

type ImportedModel = {
  id: string;
  modelUrl?: string | null;
  catalog?: {
    source_url?: string;
    priceUsd?: number;
    assets?: { thumbnail_url?: string; gallery_images?: string[] };
    variants?: Array<{
      size_label?: string;
      finish_code?: string;
      thumbnail_url?: string;
      gallery_images?: string[];
    }>;
    product_details?: {
      material?: ProductInfoRow[];
      dimensions?: ProductInfoRow[];
      delivery_and_warranty?: ProductInfoRow[];
    };
  } | null;
};

function expectRows(rows: ProductInfoRow[] | undefined, expected: RegExp[]) {
  const values = (rows ?? []).map((row) => `${row.label ?? ""}: ${row.value ?? ""}`);
  for (const pattern of expected) {
    expect(values.some((value) => pattern.test(value)), `Expected rows to include ${pattern}`).toBeTruthy();
  }
}

test.describe("151. Seb Dining Table Product Info", () => {
  test("API exposes both Muted Honey size variants with their authored GLBs", async ({ request }) => {
    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const byId = new Map((body.models ?? []).map((model) => [model.id, model]));
    const table150 = byId.get(SEB_DINING_TABLE_150_ID);
    const table180 = byId.get(SEB_DINING_TABLE_180_ID);

    expect(table150).toBeDefined();
    expect(table180).toBeDefined();
    expect(table150?.modelUrl).toBe(`/assets/models/${SEB_DINING_TABLE_150_ID}.glb`);
    expect(table180?.modelUrl).toBe(`/assets/models/${SEB_DINING_TABLE_180_ID}.glb`);
    expect(table150?.catalog?.source_url).toContain("seb-dining-table?length=1_5m");
    expect(table180?.catalog?.source_url).toContain("seb-dining-table?length=1_8m");
    expect(table150?.catalog?.priceUsd).toBe(699);
    expect(table180?.catalog?.priceUsd).toBe(799);

    expect(table150?.catalog?.assets?.thumbnail_url).toContain("Seb-Dining-Table-150cm-Front");
    expect(table180?.catalog?.assets?.thumbnail_url).toContain("Seb-Dining-Table-180cm-Front");
    expect(table150?.catalog?.assets?.gallery_images).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Seb-Dining-Table-Set_1"),
        expect.stringContaining("Seb-Dining-Table-Set2"),
      ]),
    );
    expect(table180?.catalog?.assets?.gallery_images).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Seb-Dining-Table-Set_1"),
        expect.stringContaining("Seb-Dining-Table-Set2"),
      ]),
    );

    expect(table150?.catalog?.variants?.[0]).toMatchObject({
      size_label: "150",
      finish_code: "muted_honey",
    });
    expect(table180?.catalog?.variants?.[0]).toMatchObject({
      size_label: "180",
      finish_code: "muted_honey",
    });
    expect(table150?.catalog?.variants?.[0]?.thumbnail_url).toContain("Seb-Dining-Table-150cm-Front");
    expect(table180?.catalog?.variants?.[0]?.thumbnail_url).toContain("Seb-Dining-Table-180cm-Front");

    expectRows(table150?.catalog?.product_details?.material, [
      /Material: Solid acacia wood/i,
      /Finish: Muted honey tone and wire brush distressed finish/i,
    ]);
    expectRows(table150?.catalog?.product_details?.dimensions, [
      /Dimension: W150 x D80 x H75cm/i,
      /Leg to leg distance \(at height 45cm\): 123cm/i,
      /Capacity: Sits 4 people comfortably/i,
    ]);
    expectRows(table180?.catalog?.product_details?.dimensions, [
      /Dimension: W180 x D90 x H75cm/i,
      /Leg to leg distance \(at height 45cm\): 153cm/i,
      /Capacity: Sits 6 people comfortably/i,
    ]);
    expectRows(table180?.catalog?.product_details?.delivery_and_warranty, [
      /Warranty: 5-year limited warranty/i,
      /Return policy: 30-day returns/i,
    ]);
  });

  test("keeps authored GLB colour and exposes the 150cm/180cm length switch", () => {
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SEB_DINING_TABLE_150_ID]?.useVariantColor).toBe(false);
    expect(GLB_CALIBRATION_BY_PRODUCT_ID[SEB_DINING_TABLE_180_ID]?.useVariantColor).toBe(false);
    expect(LENGTH_OPTIONS_BY_PRODUCT_ID[SEB_DINING_TABLE_150_ID]).toEqual([
      { label: "150CM", productId: SEB_DINING_TABLE_150_ID },
      { label: "180CM", productId: SEB_DINING_TABLE_180_ID },
    ]);
    expect(LENGTH_OPTIONS_BY_PRODUCT_ID[SEB_DINING_TABLE_180_ID]).toEqual(
      LENGTH_OPTIONS_BY_PRODUCT_ID[SEB_DINING_TABLE_150_ID],
    );
  });
});
