import { expect, type Locator, type Page } from "@playwright/test";

export const DEFAULT_CATEGORY_TABS: RegExp[] = [
  /^Sofa \(/,
  /^Accent Chair \(/,
  /^Ottoman \(/,
  /^Decor \(/,
  /^Rug \(/,
  /^Coffee Table \(/,
  /^Dining Table \(/,
  /^TV Console \(/,
  /^Sideboard \(/,
  /^Floor Lamp \(/,
  /^Side Table \(/,
];

export async function waitForCatalogReady(page: Page): Promise<boolean> {
  const searchInput = page.getByPlaceholder("Search title, brand, style, finish, SKU...");
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

export async function getImportedFamilySelect(page: Page): Promise<Locator | null> {
  try {
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

  const options = await listSelectOptions(familySelect);
  const match = options.find((option) => option.label.toLowerCase().includes(familyHint.toLowerCase()));
  if (!match) return false;

  try {
    await familySelect.selectOption({ value: match.value });
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

  const enabled = await addButton.isEnabled().catch(() => false);
  if (!enabled) return false;

  await addButton.click();
  await page.waitForTimeout(1200);
  return true;
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
  let searchInput = page.getByPlaceholder("Search title, brand, style, finish, SKU...");
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
    searchInput = page.getByPlaceholder("Search title, brand, style, finish, SKU...");
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
  const ready = await waitForCatalogReady(page);
  if (!ready) return false;

  const cardToggle = page.getByTestId(`catalog-compare-toggle-${productId}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const searched = await fillCatalogSearch(page, searchTerm);
    if (!searched) continue;

    if (await cardToggle.isVisible().catch(() => false)) {
      await cardToggle.locator("xpath=../..").getByRole("button", { name: "Preview" }).click().catch(() => null);
      return true;
    }

    for (const tabName of categoryTabs) {
      const tab = page.getByRole("button", { name: tabName });
      if (!(await tab.isVisible().catch(() => false))) continue;
      await tab.click().catch(() => null);
      if (await cardToggle.isVisible().catch(() => false)) {
        await cardToggle.locator("xpath=../..").getByRole("button", { name: "Preview" }).click().catch(() => null);
        return true;
      }
    }
  }

  return false;
}
