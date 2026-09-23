import { expect, test, type Locator, type Page } from "@playwright/test";
import { CATALOG_ITEMS } from "../../lib/catalog";

type RestorationIdentity = {
  productId: string;
  action: string;
  source: string;
};

const semanticTargetSelector = "[data-catalog-drawer-focus-product-id]";

async function openCatalog(page: Page, mode: "consumer" | "pro" = "consumer") {
  if (mode === "pro") {
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "pro", source: "playwright" }),
      });
    });
  }
  await page.goto(mode === "pro" ? "/design?mode=designer" : "/design", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  const maybeLater = page.getByRole("button", { name: /^Maybe later$/i });
  if (await maybeLater.isVisible().catch(() => false)) await maybeLater.click({ force: true });
  const searchInput = page.getByTestId("catalog-search-input");
  if (!(await searchInput.isVisible().catch(() => false))) {
    const continueToFurnish = page.locator('[data-testid="room-setup-continue-furnish"]:visible').first();
    if (await expect(continueToFurnish).toBeEnabled({ timeout: 20_000 }).then(() => true).catch(() => false)) {
      await continueToFurnish.click();
    }
  }
  if (!(await searchInput.isVisible().catch(() => false))) {
    const workspaceTrigger = page.getByTestId("editor-command-workspace");
    await expect(workspaceTrigger).toBeVisible({ timeout: 20_000 });
    await workspaceTrigger.click();
    await expect(page.getByTestId("editor-command-workspace-menu")).toBeVisible();
    await page.getByTestId("editor-workflow-furnish").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
  }
  await expect(searchInput).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("catalog-focused-category-pill")).toBeVisible({ timeout: 30_000 });
}

function firstPreview(page: Page) {
  return page.locator('[data-testid^="catalog-preview-"]:visible').first();
}

async function readRestorationIdentity(target: Locator): Promise<RestorationIdentity> {
  return target.evaluate((element) => ({
    productId: element.getAttribute("data-catalog-drawer-focus-product-id") ?? "",
    action: element.getAttribute("data-catalog-drawer-focus-action") ?? "",
    source: element.getAttribute("data-catalog-drawer-focus-source") ?? "",
  }));
}

function semanticTargets(page: Page, identity: RestorationIdentity) {
  return page.locator(
    `[data-catalog-drawer-focus-product-id="${identity.productId}"][data-catalog-drawer-focus-action="${identity.action}"][data-catalog-drawer-focus-source="${identity.source}"]`,
  );
}

async function expectConnectedActionableFocus(target: Locator) {
  await expect(target).toBeFocused();
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  expect(
    await target.evaluate((element) => ({
      connected: element.isConnected,
      active: document.activeElement === element,
      hidden: element.closest('[hidden], [aria-hidden="true"]') !== null,
    })),
  ).toEqual({ connected: true, active: true, hidden: false });
}

async function replaceCurrentOpener(target: Locator) {
  const original = await target.elementHandle();
  expect(original).not.toBeNull();
  await target.evaluate((element) => {
    const replacement = element.cloneNode(true);
    element.replaceWith(replacement);
  });
  expect(await original?.evaluate((element) => element.isConnected)).toBe(false);
}

async function closeDrawerWithButton(page: Page) {
  const closeButton = page.getByTestId("catalog-item-drawer-close");
  await expect(closeButton).toBeFocused();
  await closeButton.click();
  await expect(page.getByTestId("catalog-item-drawer")).toBeHidden();
}

async function closeDrawerWithBackdrop(page: Page) {
  await page.getByTestId("catalog-item-drawer-backdrop").dispatchEvent("pointerdown");
  await expect(page.getByTestId("catalog-item-drawer")).toBeHidden();
}

async function waitForTwoAnimationFrames(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

test.describe("ARCH-RC52 catalog drawer focus restoration", () => {
  test("desktop pointer close restores the exact Consumer product-card action", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCatalog(page);
    const opener = firstPreview(page);
    await expect(opener).toBeVisible();
    const identity = await readRestorationIdentity(opener);
    await page.getByTestId("catalog-search-input").fill(identity.productId);
    const pinnedOpener = semanticTargets(page, identity);
    await expect(pinnedOpener).toHaveCount(1);

    await pinnedOpener.click();
    await closeDrawerWithBackdrop(page);

    expect(identity).toMatchObject({ action: "details", source: "product-card" });
    await expect(semanticTargets(page, identity)).toHaveCount(1);
    await expectConnectedActionableFocus(pinnedOpener);
  });

  test("Enter, Space, Escape, close, and reopen use the current Pro opener", async ({ page }) => {
    await openCatalog(page, "pro");
    const opener = firstPreview(page);
    const firstIdentity = await readRestorationIdentity(opener);
    await opener.focus();
    await opener.press("Enter");
    await expect(page.getByTestId("catalog-item-drawer-close")).toBeFocused();
    await page.keyboard.press("Escape");
    await expectConnectedActionableFocus(opener);

    const nextCandidate = page.locator('[data-testid^="catalog-preview-"]:visible').nth(1);
    await expect(nextCandidate).toBeVisible();
    const nextIdentity = await readRestorationIdentity(nextCandidate);
    expect(nextIdentity.productId).not.toBe(firstIdentity.productId);
    await page.getByTestId("catalog-search-input").fill(nextIdentity.productId);
    const nextOpener = semanticTargets(page, nextIdentity);
    await expect(nextOpener).toHaveCount(1);
    await nextOpener.focus();
    await nextOpener.press("Space");
    await closeDrawerWithButton(page);
    await expectConnectedActionableFocus(nextOpener);
  });

  test("hydration-style opener replacement resolves the current connected action", async ({ page }) => {
    await openCatalog(page);
    const opener = firstPreview(page);
    const identity = await readRestorationIdentity(opener);
    await opener.click();
    await replaceCurrentOpener(opener);

    await closeDrawerWithButton(page);

    const currentOpener = semanticTargets(page, identity);
    await expect(currentOpener).toHaveCount(1);
    await expectConnectedActionableFocus(currentOpener);
  });

  for (const transition of [
    { name: "desktop-to-mobile", before: { width: 1440, height: 900 }, after: { width: 390, height: 844 } },
    { name: "mobile-to-desktop", before: { width: 390, height: 844 }, after: { width: 1440, height: 900 } },
  ]) {
    test(`${transition.name} replacement preserves the restoration identity`, async ({ page }) => {
      await page.setViewportSize(transition.before);
      await openCatalog(page);
      let opener = firstPreview(page);
      const identity = await readRestorationIdentity(opener);
      await page.getByTestId("catalog-search-input").fill(identity.productId);
      opener = semanticTargets(page, identity);
      await expect(opener).toHaveCount(1);
      await opener.click();

      await page.setViewportSize(transition.after);
      await replaceCurrentOpener(opener);
      await closeDrawerWithButton(page);

      const currentOpener = semanticTargets(page, identity);
      await expect(currentOpener).toHaveCount(1);
      await expectConnectedActionableFocus(currentOpener);
    });
  }

  test("filtering away or removing the product uses the visible catalog-results fallback", async ({ page }) => {
    await openCatalog(page);
    const opener = firstPreview(page);
    await opener.click();
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="catalog-search-input"]');
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "no-product-can-match-this-query");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(opener).toHaveCount(0);

    await closeDrawerWithButton(page);

    await expectConnectedActionableFocus(page.getByTestId("catalog-results-focus-target"));

    await page.getByTestId("catalog-search-input").fill("");
    const reopened = firstPreview(page);
    await expect(reopened).toBeVisible();
    const identity = await readRestorationIdentity(reopened);
    await reopened.click();
    await page.locator(semanticTargetSelector).evaluateAll((targets, productId) => {
      for (const target of targets) {
        if (target.getAttribute("data-catalog-drawer-focus-product-id") === productId) {
          target.closest(".rounded-lg.border")?.remove();
        }
      }
    }, identity.productId);
    await closeDrawerWithButton(page);
    await expectConnectedActionableFocus(page.getByTestId("catalog-results-focus-target"));
  });

  test("live catalog removal closes the unavailable product and focuses the results fallback", async ({ page }) => {
    let releaseLiveCatalog!: () => void;
    let releaseImportedModels!: () => void;
    const liveCatalogGate = new Promise<void>((resolve) => { releaseLiveCatalog = resolve; });
    const importedModelsGate = new Promise<void>((resolve) => { releaseImportedModels = resolve; });
    let unavailableProductId = "";
    await page.route("**/api/catalog/live", async (route) => {
      await liveCatalogGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          itemIds: Object.keys(CATALOG_ITEMS).filter((id) => id !== unavailableProductId),
          assetIds: [],
        }),
      });
    });
    await page.route("**/api/models/imported", async (route) => {
      await importedModelsGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"models":[]}' });
    });

    await openCatalog(page);
    const initialOpener = firstPreview(page);
    const identity = await readRestorationIdentity(initialOpener);
    unavailableProductId = identity.productId;
    await page.getByTestId("catalog-search-input").fill(unavailableProductId);
    const opener = semanticTargets(page, identity);
    await expect(opener).toHaveCount(1);
    await opener.click();

    releaseLiveCatalog();
    await expect(
      page.locator('[data-catalog-drawer-focus-scope] > .pointer-events-none[aria-hidden]'),
    ).toHaveCount(0);
    releaseImportedModels();

    await expect(page.getByTestId("catalog-item-drawer")).toBeHidden();
    await expect(opener).toHaveCount(0);
    await expectConnectedActionableFocus(page.getByTestId("catalog-results-focus-target"));
  });

  test("compare-tray and searched product-card openers share the contract", async ({ page }) => {
    await openCatalog(page);
    const cardOpener = firstPreview(page);
    const productTestId = await cardOpener.getAttribute("data-testid");
    const productId = productTestId?.replace("catalog-preview-", "") ?? "";
    await page.getByTestId(`catalog-compare-toggle-${productId}`).click();
    const trayOpener = page.getByTestId(`catalog-compare-open-${productId}`);
    await trayOpener.focus();
    await trayOpener.press("Enter");
    await page.keyboard.press("Escape");
    await expectConnectedActionableFocus(trayOpener);

    await page.getByTestId("catalog-search-input").fill(productId);
    await expect(cardOpener).toBeVisible();
    await cardOpener.click();
    await closeDrawerWithButton(page);
    await expectConnectedActionableFocus(cardOpener);
  });

  test("workspace unmount cancels restoration and a newer alertdialog owns entry, Escape, and focus", async ({ page }) => {
    await openCatalog(page);
    const opener = firstPreview(page);
    await opener.click();
    await page.evaluate(() => {
      const modal = document.createElement("div");
      modal.id = "newer-test-modal";
      modal.setAttribute("role", "alertdialog");
      modal.setAttribute("aria-modal", "true");
      modal.style.cssText = "position:fixed;inset:0;z-index:1000;background:white";
      const button = document.createElement("button");
      button.id = "newer-test-modal-action";
      button.textContent = "Newer modal action";
      modal.append(button);
      document.body.append(modal);
      button.focus();
    });
    const newerAction = page.locator("#newer-test-modal-action");
    await expectConnectedActionableFocus(newerAction);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("catalog-item-drawer")).toBeVisible();
    await expectConnectedActionableFocus(newerAction);

    await page.getByTestId("catalog-item-drawer-close").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await waitForTwoAnimationFrames(page);
    await expectConnectedActionableFocus(newerAction);
    await page.locator("#newer-test-modal").evaluate((modal) => modal.remove());

    await page.getByTestId("catalog-search-input").fill("");
    const nextOpener = firstPreview(page);
    await nextOpener.evaluate((button) => {
      (button as HTMLButtonElement).click();
      const modal = document.createElement("div");
      modal.id = "entry-race-test-modal";
      modal.setAttribute("role", "alertdialog");
      modal.setAttribute("aria-modal", "true");
      modal.style.cssText = "position:fixed;inset:0;z-index:1000;background:white";
      const action = document.createElement("button");
      action.id = "entry-race-test-action";
      action.textContent = "Entry race modal action";
      modal.append(action);
      document.body.append(modal);
      action.focus();
    });
    await expect(page.getByTestId("catalog-item-drawer")).toBeVisible();
    await waitForTwoAnimationFrames(page);
    await expectConnectedActionableFocus(page.locator("#entry-race-test-action"));
    await page.getByTestId("catalog-item-drawer-close").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await waitForTwoAnimationFrames(page);
    await expectConnectedActionableFocus(page.locator("#entry-race-test-action"));
    await page.locator("#entry-race-test-modal").evaluate((modal) => modal.remove());

    await nextOpener.click();
    await page.getByTestId("editor-command-workspace").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    const workspaceTrigger = page.getByTestId("editor-command-workspace");
    const workspaceMenu = page.getByTestId("editor-command-workspace-menu");
    const planWorkspaceItem = page.getByTestId("editor-workflow-plan");
    await expect(workspaceTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(workspaceMenu).toBeVisible();
    await expectConnectedActionableFocus(planWorkspaceItem);
    await expect(page.getByTestId("catalog-item-drawer")).toBeVisible();

    await planWorkspaceItem.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(workspaceTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(workspaceMenu).toBeHidden();
    await expect(page.getByTestId("catalog-item-drawer")).toBeHidden();
    await waitForTwoAnimationFrames(page);
    await expectConnectedActionableFocus(workspaceTrigger);
  });
});
