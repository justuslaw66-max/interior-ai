import { expect, test } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  openCatalogPreview,
  openShopPanel,
} from "./variant-test-utils";

const PRODUCT_ID = "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";
const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";

test.describe("26. Phase 14 Product Lifecycle", () => {
  test("catalog product survives scene reload and reaches current shopping destination", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "pro", source: "phase14-e2e" }),
      });
    });
    await page.addInitScript(() => {
      const clearSentinel = "__e2e_phase14_storage_cleared";
      if (window.localStorage.getItem(clearSentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(clearSentinel, "1");
    });

    const response = await page.goto("/design?mode=designer", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });

    const newPlan = page.getByTestId("editor-command-new-plan");
    await expect(newPlan).toBeVisible();
    const starterPicker = page.getByTestId("starter-floor-plan-picker");
    await expect(async () => {
      if (await starterPicker.isVisible().catch(() => false)) return;

      const replaceCurrent = page.getByTestId("new-plan-replace-current");
      if (await replaceCurrent.isVisible().catch(() => false)) {
        await replaceCurrent.click();
      } else {
        await newPlan.click();
      }

      await expect(starterPicker).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByTestId("apply-plan-template-studio").click();
    const planChoice = page.getByTestId("new-plan-choice-dialog");
    if (await planChoice.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await page.getByTestId("new-plan-replace-current").click();
    }
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");

    const opened = await openCatalogPreview(page, PRODUCT_ID, "Hugg");
    expect(opened, "dependable Phase 14 catalog product must be discoverable").toBe(true);
    const drawer = page.getByTestId("catalog-item-drawer");
    await expect(drawer).toContainText("Hugg Nesting Square Coffee Table");
    await expect(page.getByTestId("catalog-detail-dimensions")).toContainText(/cm/i);
    await addCatalogDrawerItemToRoom(page);

    await page.getByTestId("save-design").click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", {
      timeout: 30_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            ([storageKey, productId]) =>
              window.localStorage.getItem(storageKey)?.includes(productId) ?? false,
            [DESIGN_STORAGE_KEY, PRODUCT_ID],
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(page.getByText("Hugg Nesting Square Coffee Table", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms", {
      timeout: 30_000,
    });
    await expect(page.getByText("Preparing room", { exact: true })).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      /^[a-f0-9]{8}$/,
      { timeout: 30_000 },
    );

    const cart = page.getByTestId("cart-panel");
    await expect(async () => {
      if (await cart.isVisible().catch(() => false)) return;
      await openShopPanel(page);
      await expect(cart).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const autoFill = page.getByRole("button", { name: "Auto-fill cart from room" });
    if (await autoFill.isVisible().catch(() => false)) await autoFill.click();
    await expect(cart).toBeVisible();
    await expect(cart).toContainText("Hugg Nesting Square Coffee Table");
    await expect(cart).toContainText("Retailer link ready");
    await expect(page.getByTestId("checkout-affiliate")).toBeEnabled();

    const liveResponse = await page.request.get(`/api/catalog/products/${PRODUCT_ID}/live`);
    expect(liveResponse.status()).toBe(200);
    expect(liveResponse.headers()["cache-control"]).toContain("no-store");
    const live = await liveResponse.json();
    expect(live.productId).toBe(PRODUCT_ID);
    expect(live.currency).toMatch(/^[A-Z]{3}$/);
    expect(live.currentPrice).toBeGreaterThan(0);
    expect(live.stock).toBe("available");
    expect(live.purchaseDestination?.type).toBe("affiliate");
    expect(live.purchaseDestination?.url).toMatch(/^https:\/\//);
    expect(live.variants).toEqual(
      expect.arrayContaining([expect.objectContaining({ variantId: expect.any(String) })])
    );
  });
});
