import { expect, test } from "./fixtures";
import {
  addImportedProductIfReady,
  selectImportedFamilyByHint,
  selectImportedProductById,
} from "./variant-test-utils";

const STRAIGHT_ID = "sofa-real-castlery-hamilton-3-seater-sofa-bed";
const LEFT_ID =
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left";
const RIGHT_ID =
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right";

type ImportedModel = {
  id: string;
  catalog?: {
    configurableMetadata?: {
      default_configuration?: string;
      configuration_ui?: {
        options?: string[];
      };
    };
    configurations?: Array<{
      configuration_code?: string;
      visual_bounds_cm?: {
        width?: number;
        depth?: number;
        height?: number;
      };
    }>;
    variants?: Array<{
      state_assets?: Record<string, { model_url?: string }>;
    }>;
  } | null;
};

test.describe("153. Hamilton Sofa Bed", () => {
  test("live API exposes all three purchasable configurations with closed and open models", async ({
    request,
  }) => {
    const response = await request.get("/api/models/imported");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { models?: ImportedModel[] };
    const models = new Map(
      (body.models ?? [])
        .filter((model) => [STRAIGHT_ID, LEFT_ID, RIGHT_ID].includes(model.id))
        .map((model) => [model.id, model]),
    );
    expect(Array.from(models.keys()).sort()).toEqual(
      [STRAIGHT_ID, LEFT_ID, RIGHT_ID].sort(),
    );

    for (const productId of [STRAIGHT_ID, LEFT_ID, RIGHT_ID]) {
      const model = models.get(productId);
      expect(model?.catalog?.configurableMetadata).toMatchObject({
        default_configuration: "closed",
        configuration_ui: {
          options: ["closed", "open_sleeper"],
        },
      });
      expect(
        model?.catalog?.configurations?.map(
          (configuration) => configuration.configuration_code,
        ),
      ).toEqual(["closed", "open_sleeper"]);
      expect(model?.catalog?.variants?.[0]?.state_assets?.closed?.model_url).toContain(
        "-closed.glb",
      );
      expect(
        model?.catalog?.variants?.[0]?.state_assets?.open_sleeper?.model_url,
      ).toContain("-open.glb");
    }

    expect(
      models
        .get(STRAIGHT_ID)
        ?.catalog?.configurations?.find(
          (configuration) => configuration.configuration_code === "open_sleeper",
        )?.visual_bounds_cm,
    ).toEqual({ width: 206, depth: 227, height: 63 });
    expect(
      models
        .get(LEFT_ID)
        ?.catalog?.configurations?.find(
          (configuration) => configuration.configuration_code === "open_sleeper",
        )?.visual_bounds_cm,
    ).toEqual({ width: 296, depth: 227, height: 86 });
  });

  test("selected Hamilton sleeper switches model, orientation, and open state", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.addInitScript(() => {
      window.localStorage.setItem("scene_performance_mode", "quality");
    });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 20_000,
    });

    expect(await selectImportedFamilyByHint(page, "Hamilton")).toBeTruthy();
    expect(await selectImportedProductById(page, STRAIGHT_ID)).toBeTruthy();
    expect(await addImportedProductIfReady(page)).toBeTruthy();

    await expect(page.getByTestId("hamilton-configuration-selector")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId(`hamilton-config-option-${STRAIGHT_ID}`),
    ).toHaveAttribute("data-active", "true");
    await expect(page.getByText(/^Sleeper State$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Closed$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Open$/i })).toBeVisible();

    const straightOpenModel = page.waitForResponse(
      (response) =>
        response.url().endsWith(
          "/assets/models/sofas/sofa-real-castlery-hamilton-3-seater-sofa-bed-open.glb",
        ) && response.ok(),
    );
    await page.getByRole("button", { name: /^Open$/i }).click();
    await straightOpenModel;
    await expect(
      page.getByText(/Recommended planning size: 206 x 227 cm/i),
    ).toBeVisible();

    await page.getByTestId(`hamilton-config-option-${LEFT_ID}`).click();
    await expect(page.getByTestId("hamilton-orientation-left")).toHaveAttribute(
      "data-active",
      "true",
    );

    const rightOpenModel = page.waitForResponse(
      (response) =>
        response.url().endsWith(
          "/assets/models/sofas/sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right-open.glb",
        ) && response.ok(),
    );
    await page.getByTestId("hamilton-orientation-right").click();
    await rightOpenModel;
    await expect(page.getByTestId("hamilton-orientation-right")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(
      page.getByText(/Recommended planning size: 296 x 227 cm/i),
    ).toBeVisible();
  });
});
