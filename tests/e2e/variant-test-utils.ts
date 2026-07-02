import { expect, type Locator, type Page } from "@playwright/test";

export const DEFAULT_CATEGORY_TABS: RegExp[] = [
  /^Sofa \(/,
  /^Arm Chair \(/,
  /^Side Tables \(/,
  /^Dining Bench \(/,
  /^Ottoman \(/,
  /^Decor \(/,
  /^Rug \(/,
  /^Coffee Table \(/,
  /^Dining Table \(/,
  /^TV Console \(/,
  /^Sideboard \(/,
  /^Floor Lamp \(/,
];

async function openFurnishPanel(page: Page): Promise<void> {
  await dismissBlockingDialogs(page);
  const searchInput = getCatalogSearchInput(page);
  if (await searchInput.isVisible().catch(() => false)) return;

  const visibleFurnishButton = page.locator('[data-testid="editor-workflow-furnish"]:visible').first();
  if (await visibleFurnishButton.isVisible().catch(() => false)) {
    await clickButtonWithDomFallback(visibleFurnishButton);
  }

  if (await searchInput.isVisible().catch(() => false)) return;

  await dismissBlockingDialogs(page);
  const guidedFurnishButton = page.getByRole("button", { name: /\b3\s+Furnish\b/i });
  if (await guidedFurnishButton.isVisible().catch(() => false)) {
    await guidedFurnishButton.click();
  }

  if (await searchInput.isVisible().catch(() => false)) return;

  const startFurnishingButton = page.getByRole("button", { name: /^Start furnishing$/i });
  if (await startFurnishingButton.isVisible().catch(() => false)) {
    await startFurnishingButton.click();
  }

  if (await searchInput.isVisible().catch(() => false)) return;

  const fullCatalog = page.locator('[data-testid="furnish-full-catalog"]');
  if ((await fullCatalog.count()) === 0) return;

  const isOpen = await fullCatalog
    .first()
    .evaluate((node) => (node as HTMLDetailsElement).open)
    .catch(() => true);
  if (!isOpen) {
    await page.locator('[data-testid="furnish-full-catalog-toggle"]').first().click();
  }
}

export function getSelectedItemPanel(page: Page): Locator {
  return page
    .locator('[data-testid="selected-item-panel"], main > div')
    .filter({ hasText: "Selected Item" })
    .filter({ has: page.getByRole("button", { name: "View retailer" }) })
    .first();
}

async function dismissBlockingDialogs(page: Page): Promise<void> {
  const maybeLater = page.getByRole("button", { name: /^Maybe later$/i });
  if (await maybeLater.isVisible().catch(() => false)) {
    await maybeLater.click({ force: true }).catch(() => undefined);
  }
}

async function clickButtonWithDomFallback(locator: Locator): Promise<void> {
  await locator.click({ timeout: 5000 }).catch(async () => {
    await locator.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
  });
}

export async function openShopPanel(page: Page): Promise<void> {
  const visibleShopButton = page.locator('[data-testid="editor-workflow-shop"]:visible').first();
  if (await visibleShopButton.isVisible().catch(() => false)) {
    await clickButtonWithDomFallback(visibleShopButton);
    return;
  }

  const visibleCartRailButton = page.locator('[data-testid="editor-rail-cart"]:visible').first();
  if (await visibleCartRailButton.isVisible().catch(() => false)) {
    await visibleCartRailButton.click();
    return;
  }

  await page.getByTestId("editor-workflow-shop").first().evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
}

function getCatalogSearchInput(page: Page): Locator {
  return page
    .locator('[data-testid="catalog-search-input"]')
    .or(page.getByPlaceholder("Search title, brand, style, finish, SKU..."))
    .first();
}

export async function waitForCatalogReady(page: Page): Promise<boolean> {
  await openFurnishPanel(page);
  const searchInput = getCatalogSearchInput(page);
  const searchVisible = await expect(searchInput)
    .toBeVisible({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!searchVisible) return false;

  return expect(page.getByText(/of\s+\d+\s+items/i))
    .toBeVisible({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
}

async function openFurnishPanelIfNeeded(page: Page): Promise<void> {
  await openFurnishPanel(page);
  const importedProductSelect = page.locator('[data-testid="imported-product-select"]');
  if ((await importedProductSelect.count()) > 0) {
    await openAdvancedImportedModelsIfNeeded(page);
    return;
  }
  await openAdvancedImportedModelsIfNeeded(page);
}

export async function openAdvancedImportedModelsIfNeeded(page: Page): Promise<void> {
  const advancedPicker = page.locator('[data-testid="advanced-imported-models"]');
  if ((await advancedPicker.count()) === 0) return;

  const isOpen = await advancedPicker.first().evaluate((node) =>
    (node as HTMLDetailsElement).open
  ).catch(() => true);
  if (isOpen) return;

  await page.locator('[data-testid="advanced-imported-models-toggle"]').first().click();
}

export async function getImportedFamilySelect(page: Page): Promise<Locator | null> {
  try {
    await openFurnishPanelIfNeeded(page);
    const byTestId = page.locator('[data-testid="imported-family-select"]');
    if ((await byTestId.count()) > 0) return byTestId.first();
    const byRole = page.getByRole("combobox").first();
    if ((await byRole.count()) > 0) return byRole;
    return null;
  } catch {
    return null;
  }
}

export async function getImportedProductSelect(page: Page): Promise<Locator | null> {
  try {
    await openFurnishPanelIfNeeded(page);
    const byTestId = page.locator('[data-testid="imported-product-select"]');
    if ((await byTestId.count()) > 0) return byTestId.first();
    const byRole = page.getByRole("combobox").nth(1);
    if ((await byRole.count()) > 0) return byRole;
    return null;
  } catch {
    return null;
  }
}

export async function listSelectOptions(select: Locator): Promise<Array<{ value: string; label: string }>> {
  try {
    return await select.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => {
        const option = node as HTMLOptionElement;
        return { value: option.value, label: option.textContent ?? "" };
      }),
    );
  } catch {
    return [];
  }
}

export async function selectImportedFamilyByHint(page: Page, familyHint: string): Promise<boolean> {
  const familySelect = await getImportedFamilySelect(page);
  if (!familySelect) return false;

  const visible = await expect(familySelect)
    .toBeVisible({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  let matchValue = "";
  const found = await expect
    .poll(
      async () => {
        const options = await listSelectOptions(familySelect);
        const match = options.find((option) =>
          option.label.toLowerCase().includes(familyHint.toLowerCase()),
        );
        matchValue = match?.value ?? "";
        return Boolean(matchValue);
      },
      { timeout: 30000 },
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
  if (!found || !matchValue) return false;

  try {
    await familySelect.selectOption({ value: matchValue });
    return true;
  } catch {
    return false;
  }
}

export async function selectImportedProductById(page: Page, productId: string): Promise<boolean> {
  const productSelect = await getImportedProductSelect(page);
  if (!productSelect) return false;

  const visible = await expect(productSelect)
    .toBeVisible({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  const available = await expect
    .poll(async () => {
      const options = await listSelectOptions(productSelect);
      return options.some((option) => option.value === productId);
    }, { timeout: 15000 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
  if (!available) return false;

  try {
    await productSelect.selectOption({ value: productId });
    return true;
  } catch {
    return false;
  }
}

export async function findImportedProductValue(
  page: Page,
  predicate: (label: string) => boolean,
): Promise<string | null> {
  const productSelect = await getImportedProductSelect(page);
  if (!productSelect) return null;

  const options = await listSelectOptions(productSelect);
  const match = options.find((option) => predicate(option.label));
  return match?.value ?? null;
}

export async function getAddImportedButton(page: Page): Promise<Locator | null> {
  try {
    await openFurnishPanelIfNeeded(page);
    const byTestId = page.locator('[data-testid="add-imported-btn"]');
    if ((await byTestId.count()) > 0) return byTestId.first();

    const byLabel = page.getByRole("button", { name: /^\+?\s*Add Imported Furniture$/i });
    if ((await byLabel.count()) > 0) return byLabel.first();

    const byFallback = page.getByRole("button", { name: /^Add Imported$/i });
    if ((await byFallback.count()) > 0) return byFallback.first();

    return null;
  } catch {
    return null;
  }
}

export async function addImportedProductIfReady(page: Page): Promise<boolean> {
  const addButton = await getAddImportedButton(page);
  if (!addButton) return false;

  const visible = await expect(addButton)
    .toBeVisible({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  const enabled = await expect(addButton)
    .toBeEnabled({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (!enabled) return false;

  await addButton.click({ noWaitAfter: true });
  await confirmCatalogPlacementIfVisible(page);
  await page.waitForTimeout(1200);
  return true;
}

export async function confirmCatalogPlacementIfVisible(page: Page): Promise<boolean> {
  const confirmButton = page.getByTestId("catalog-placement-confirm");
  const visible = await expect(confirmButton)
    .toBeVisible({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  await confirmButton.click({ noWaitAfter: true });
  await page.waitForTimeout(600);
  return true;
}

export async function addCatalogDrawerItemToRoom(page: Page): Promise<void> {
  await page.getByTestId("catalog-detail-add-to-room").click();
  const confirmed = await confirmCatalogPlacementIfVisible(page);
  expect(confirmed).toBeTruthy();
}

export async function addCatalogCardItemToRoom(
  page: Page,
  productId: string
): Promise<void> {
  await page.getByTestId(`catalog-add-${productId}`).click();
  const confirmed = await confirmCatalogPlacementIfVisible(page);
  expect(confirmed).toBeTruthy();
}

export async function ensureItemSelectedForVariants(page: Page): Promise<boolean> {
  const swatches = page.locator('[data-testid^="variant-swatch-"]');
  if ((await swatches.count().catch(() => 0)) > 0) return true;

  const inScene = page.locator('[data-testid="item-in-scene"]').first();
  if ((await inScene.count().catch(() => 0)) > 0) {
    await inScene.click().catch(() => null);
    if ((await swatches.count().catch(() => 0)) > 0) return true;
  }

  const canvas = page.locator('[data-testid="scene-canvas"]');
  const box = await canvas.boundingBox().catch(() => null);
  if (!box) return false;

  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } }).catch(() => null);
  await page.waitForTimeout(700);
  return (await swatches.count().catch(() => 0)) > 0;
}

export async function fillCatalogSearch(page: Page, term: string): Promise<boolean> {
  let searchInput = getCatalogSearchInput(page);
  const visible = await expect(searchInput)
    .toBeVisible({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  try {
    await searchInput.click();
    await searchInput.press("Meta+A");
    await searchInput.press("Backspace");
    await searchInput.pressSequentially(term);
  } catch {
    searchInput = getCatalogSearchInput(page);
    await searchInput.click().catch(() => null);
    await searchInput.press("Meta+A").catch(() => null);
    await searchInput.press("Backspace").catch(() => null);
    await searchInput.pressSequentially(term).catch(() => null);
  }

  return expect(searchInput)
    .toHaveValue(term)
    .then(() => true)
    .catch(() => false);
}

export async function openCatalogPreview(
  page: Page,
  productId: string,
  searchTerm: string,
  categoryTabs: RegExp[] = DEFAULT_CATEGORY_TABS,
): Promise<boolean> {
  await openFurnishPanel(page);
  const ready = await waitForCatalogReady(page);
  if (!ready) return false;

  const previewButton = page.getByTestId(`catalog-preview-${productId}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const searched = await fillCatalogSearch(page, searchTerm);
    if (!searched) continue;

    if (await previewButton.isVisible().catch(() => false)) {
      await previewButton.click().catch(() => null);
      return true;
    }

    for (const tabName of categoryTabs) {
      const tab = page.getByRole("button", { name: tabName });
      if (!(await tab.isVisible().catch(() => false))) continue;
      await tab.click().catch(() => null);
      if (await previewButton.isVisible().catch(() => false)) {
        await previewButton.click().catch(() => null);
        return true;
      }
    }
  }

  return false;
}
