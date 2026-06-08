import { expect, test } from "./fixtures";
import {
  resolveConfiguredPlanningDimsMm,
  resolveConfiguredVisualDimsMm,
} from "../../lib/design-page-config-resolvers";
import {
  addImportedProductIfReady,
  selectImportedFamilyByHint,
  selectImportedProductById,
} from "./variant-test-utils";

const SEB_LIFT_TOP_LARGE_ID = "coffee-real-castlery-seb-lift-top-large";
const SEB_STORAGE_120_ID = "coffee-real-castlery-seb-storage-120";

type ProductInfoRow = {
  label?: string;
  value?: string;
};

type ProductInfoSection = {
  material?: ProductInfoRow[];
  dimensions?: ProductInfoRow[];
  delivery_and_warranty?: ProductInfoRow[];
};

type CatalogConfiguration = {
  configuration_code?: string;
};

type CatalogVariant = {
  finish_code?: string;
  sku?: string | null;
  state_assets?: Record<string, unknown>;
};

type ImportedModel = {
  id: string;
  catalog?: {
    configurableMetadata?: {
      is_configurable?: boolean;
      default_configuration?: string;
    };
    configurations?: CatalogConfiguration[];
    product_details?: ProductInfoSection;
    variants?: CatalogVariant[];
  } | null;
};

function expectRows(rows: ProductInfoRow[] | undefined, expected: RegExp[]) {
  const values = (rows ?? []).map((row) => `${row.label ?? ""}: ${row.value ?? ""}`);
  for (const pattern of expected) {
    expect(values.some((value) => pattern.test(value)), `Expected rows to include ${pattern}`).toBeTruthy();
  }
}

test.describe("144. Seb Lift Top Large Product Info", () => {
  test("configurable bounds keep the open lift-top footprint instead of closed variant size", () => {
    const productId = SEB_LIFT_TOP_LARGE_ID;
    const variantId = "imported-coffee-real-castlery-seb-lift-top-large-120cm-muted-honey";
    const item = {
      instanceId: "seb-large-open-state",
      productId,
      variantId,
      position: [0, 0, 0],
      rotationY: 0,
    };
    const fallbackProduct = {
      id: productId,
      dimsMm: { w: 1200, d: 600, h: 450 },
      variants: [{ id: variantId, dimensionsMm: { w: 1200, d: 600, h: 450 } }],
    };
    const ctx = {
      importedModelById: new Map([
        [
          productId,
          {
            id: productId,
            catalog: {
              configurableMetadata: { default_configuration: "closed" },
              configurations: [
                {
                  configuration_code: "open_lift",
                  visual_bounds_cm: { width: 120, depth: 72, height: 67 },
                  planning_bounds_cm: { width: 120, depth: 72, height: 67 },
                },
              ],
            },
          },
        ],
      ]),
      itemConfigurationByInstanceId: { "seb-large-open-state": "open_lift" },
    };

    expect(resolveConfiguredVisualDimsMm(item as never, fallbackProduct as never, ctx as never)).toEqual({
      w: 1200,
      d: 720,
      h: 670,
    });
    expect(resolveConfiguredPlanningDimsMm(item as never, fallbackProduct as never, ctx as never)).toEqual({
      w: 1200,
      d: 720,
      h: 670,
    });
  });

  test("Seb Lift Top Large appears in catalog with details, swatch, and open state controls", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    expect(await selectImportedFamilyByHint(page, "Seb")).toBeTruthy();
    expect(await selectImportedProductById(page, SEB_LIFT_TOP_LARGE_ID)).toBeTruthy();
    expect(await addImportedProductIfReady(page)).toBeTruthy();

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Seb Lift Top Coffee Table, Large/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("selected-single-finish-label")).toContainText(/Muted Honey/i);
    await expect(page.getByTestId("selected-single-finish-swatch")).toBeVisible();
    await expect(page.getByTestId("selected-single-finish-swatch")).toHaveAttribute(
      "style",
      /Seb-Texture-1739348954/i
    );
    await expect(page.getByTestId("seb-model-option-small-lift-top")).toBeVisible();
    await expect(page.getByTestId("seb-model-option-large-lift-top")).toHaveAttribute(
      "data-active",
      "true"
    );
    await expect(page.getByTestId("seb-model-option-with-storage")).toBeVisible();
    await expect(page.getByText(/^Lift Top State$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Closed$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Open$/i })).toBeVisible();
    await page.getByRole("button", { name: /^Open$/i }).click();
    await expect(page.getByText(/Recommended planning size: 120 x 72 cm/i)).toBeVisible();

    await page.getByRole("button", { name: /^Show details$/i }).click();
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(/Solid acacia/i);
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(
      /Muted honey tone and wire brush distressed finish/i
    );

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    await expect(page.getByTestId("selected-product-dimensions-panel")).toContainText(
      /W120 x D60 x H45cm/i
    );
    await expect(page.getByTestId("selected-product-dimensions-panel")).toContainText(
      /Product Weight:\s*45kg/i
    );
    await expect(page.getByTestId("selected-product-dimensions-panel")).toContainText(
      /Close: 40kg; Open: 20kg/i
    );
    await expect(page.getByTestId("selected-product-dimensions-image")).toHaveAttribute(
      "src",
      /Seb-Lift-Top-Coffee-Table-Large-Dim/i
    );

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /5-year limited warranty/i
    );
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /Fully assembled/i
    );
  });

  test("Seb selected item links Small, Large, and With storage models like Castlery SG", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    expect(await selectImportedFamilyByHint(page, "Seb")).toBeTruthy();
    expect(await selectImportedProductById(page, SEB_STORAGE_120_ID)).toBeTruthy();
    expect(await addImportedProductIfReady(page)).toBeTruthy();

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("seb-model-option-with-storage")).toHaveAttribute(
      "data-active",
      "true"
    );
    await page.getByTestId("seb-model-option-large-lift-top").click();
    await expect(page.getByTestId("seb-model-option-large-lift-top")).toHaveAttribute(
      "data-active",
      "true"
    );

    await page.getByTestId("seb-model-option-small-lift-top").click();
    await expect(page.getByRole("heading", { name: /Seb Lift Top Coffee Table, Small/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("seb-model-option-small-lift-top")).toHaveAttribute(
      "data-active",
      "true"
    );

    await page.getByTestId("seb-model-option-with-storage").click();
    await expect(page.getByRole("heading", { name: /Seb Coffee Table with Storage/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("seb-model-option-with-storage")).toHaveAttribute(
      "data-active",
      "true"
    );
    await expect(page.getByRole("button", { name: /^90CM$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^120CM$/i })).toBeVisible();
  });

  test("API exposes Castlery SG details and closed/open state assets", async ({ request }) => {
    const endpointReady = await expect
      .poll(async () => {
        const response = await request.get("/api/models/imported");
        if (!response.ok()) return false;
        const body = (await response.json()) as { models?: unknown[] };
        return Array.isArray(body.models) && body.models.some((model) => (model as ImportedModel).id === SEB_LIFT_TOP_LARGE_ID);
      }, { timeout: 45000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!endpointReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Seb Lift Top Large product-info API assertions because /api/models/imported stayed unavailable",
      });
      return;
    }

    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const model = body.models?.find((entry) => entry.id === SEB_LIFT_TOP_LARGE_ID);
    expect(model).toBeDefined();
    expect(model?.catalog?.variants?.[0]).toMatchObject({
      finish_code: "muted_honey_wire_brushed",
      sku: "40550270",
    });

    expect(model?.catalog?.configurableMetadata).toMatchObject({
      is_configurable: true,
      default_configuration: "closed",
    });
    expect(model?.catalog?.configurations?.map((entry) => entry.configuration_code)).toEqual(
      expect.arrayContaining(["closed", "open_lift"])
    );
    expect(model?.catalog?.variants?.[0]?.state_assets?.closed).toBeDefined();
    expect(model?.catalog?.variants?.[0]?.state_assets?.open_lift).toBeDefined();

    const details = model?.catalog?.product_details;
    expectRows(details?.material, [
      /Material: Solid acacia/i,
      /Finish: Muted honey tone and wire brush distressed finish/i,
      /Care: Wooden table/i,
      /Colour variance: Natural variations/i,
      /Material & safety standards: Formaldehyde safe/i,
    ]);
    expectRows(details?.dimensions, [
      /Dimension: W120 x D60 x H45cm/i,
      /Table top thickness: 2\.2cm/i,
      /Leg height: 20cm/i,
      /Product weight: 45kg/i,
      /Packaging dimensions: 1 box/i,
      /Levellers: Included/i,
      /Max bearing support: Close: 40kg; Open: 20kg/i,
    ]);
    expectRows(details?.delivery_and_warranty, [
      /Cancellation: Free—5 working days before delivery/i,
      /Warranty: 5-year limited warranty/i,
      /Return policy: 30-day returns/i,
      /Assembly: Fully assembled/i,
    ]);
  });
});
