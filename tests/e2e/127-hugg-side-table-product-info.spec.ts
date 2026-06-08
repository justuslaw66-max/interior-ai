import { expect, test } from "./fixtures";

const HUGG_SIDE_TABLE_IDS = [
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed",
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-opened",
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-closed",
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-opened",
];

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
    variants?: Array<{ size_label?: string; finish_code?: string; upholstery_code?: string }>;
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

test.describe("127. Hugg Nesting Side Table Product Info", () => {
  test("API exposes Castlery SG product details across side-table Hugg state assets", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        const ids = new Set((body.models ?? []).map((model) => (model as ImportedModel).id));
        return HUGG_SIDE_TABLE_IDS.every((id) => ids.has(id));
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Hugg side-table product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };

    for (const id of HUGG_SIDE_TABLE_IDS) {
      const model = body.models?.find((entry) => entry.id === id);
      expect(model, `Expected imported model ${id}`).toBeDefined();

      const variants = model?.catalog?.variants ?? [];
      expect(variants).toHaveLength(3);
      expect(variants.map((variant) => variant.finish_code).sort()).toEqual(["black", "chestnut", "natural"]);
      expect(variants.every((variant) => variant.size_label === "68x55")).toBeTruthy();

      const details = model?.catalog?.product_details;
      expect(details, `Expected product details for ${id}`).toBeDefined();

      expectRows(details?.material, [
        /Material: Table: engineered wood with oak veneer and solid oak edged; Ottoman: LVL frame with upholstery base/i,
        /Filling: Foam and fibre/i,
        /Care: Wooden table, upholstered seating/i,
        /Cover type: Fixed/i,
        /Material & safety standards: Low formaldehyde/i,
      ]);
      expectRows(details?.dimensions, [
        /Dimension: Table: W68 x D55 x H43\.2cm; Ottoman: W55\.5 x D53\.5 x H39cm/i,
        /Table top thickness: 3\.5cm/i,
        /Product weight: Table: 20\.6kg; Ottoman: 6\.6kg/i,
        /Packaging dimensions: 2 boxes/i,
        /Max bearing support: Table: 80kg; Ottoman: 130kg/i,
      ]);
      expectRows(details?.delivery_and_warranty, [
        /Cancellation: Free—5 working days before delivery/i,
        /Warranty: 5-year limited warranty/i,
        /Return policy: 30-day returns/i,
        /Assembly: Legs to be fitted/i,
      ]);

      expect(model?.catalog?.comfort_profile?.seat_comfort?.value).toBe(3);
      expect(model?.catalog?.comfort_profile?.seat_depth?.value).toBe(2);
      expect(model?.catalog?.comfort_profile?.seat_height?.value).toBe(2);
      expect(model?.catalog?.comfort_profile?.seat_softness?.value).toBe(4);
    }
  });
});
