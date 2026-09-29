import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import type { RetailerFixtureInputs } from "./fixtures/retailer-confirmation-harness";

// CH-0015G's Retailer gate, re-pinned in UX phase 3c-2: buying at a retailer from the Shopping list.
// "Buy at <shop>" opens a shop's only product directly, or its buy list: one Open per product, each
// click opening one tab (J's answer to Q2, 27 Sep). Tabs, tracking and shops are synthetic.

type Entry = "pointer" | "keyboard";
type UserKind = RetailerFixtureInputs["userKind"];
type TabRecord = {
  url: string;
  target: string | null;
  features: string | null;
  opener: string | null;
  href: string | null;
  blocked: boolean;
};

declare global {
  interface Window {
    __retailerTabs: TabRecord[];
    __retailerBlockTabs: boolean;
  }
}

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const DESIGN_ID = "ch0015g-synthetic-design";
const SAFE_SHOP = "safe-retailer.test";
const BUY_SAFE_ID = "shopping-buy-safe-retailer.test";
const FALLBACK_ID = "editor-command-workspace-action";
const OPENER_NOT_CLEARED = "opener-not-cleared";
const BLOCKED_TAB = "Your browser blocked the new tab. Allow pop-ups for this site, then open the product again.";
const PRODUCTS = {
  alpha: { title: "Alpha Armchair", destination: "https://safe-retailer.test/alpha" },
  beta: { title: "Beta Side Table", destination: "https://www.safe-retailer.test/beta" },
  gamma: { title: "Gamma Floor Lamp", destination: "https://safe-retailer.test/gamma" },
} as const;

type SyntheticBoundaries = {
  payloads: Array<Record<string, unknown>>;
  failTracking: boolean;
  userKind: UserKind;
  reset: () => void;
};

const clickPayload = (key: string) => ({
  designId: DESIGN_ID,
  productId: `ch0015g-${key}-product`,
  variantId: `ch0015g-${key}-variant`,
});

async function installSyntheticBoundaries(page: Page) {
  const boundaries: SyntheticBoundaries = {
    payloads: [],
    failTracking: false,
    userKind: "consumer",
    reset() {
      this.payloads.length = 0;
      this.failTracking = false;
    },
  };
  await page.addInitScript((openerSentinel) => {
    localStorage.clear();
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    localStorage.setItem("scene_performance_mode", "lite");
    window.__retailerTabs = [];
    window.__retailerBlockTabs = false;
    // A tab that records where the Shopping list sends it, instead of opening a real one.
    window.open = (url, target, features) => {
      const record: TabRecord = {
        url: String(url ?? ""),
        target: target ?? null,
        features: features ?? null,
        opener: openerSentinel,
        href: null,
        blocked: window.__retailerBlockTabs,
      };
      window.__retailerTabs.push(record);
      if (record.blocked) return null;
      const tab = {
        get opener(): string | null { return record.opener; },
        set opener(value: string | null) { record.opener = value; },
        location: {
          get href() { return record.href ?? "about:blank"; },
          set href(value: string) { record.href = String(value); },
        },
      };
      return tab as unknown as Window;
    };
  }, OPENER_NOT_CLEARED);
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      plan: boundaries.userKind === "pro" ? "pro" : "free",
      source: "retailer-confirmation-fixture",
    }),
  }));
  await page.route("**/api/track/click", (route) => {
    boundaries.payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (boundaries.failTracking) return route.abort("failed");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ clickKey: `ch0015g-click-${boundaries.payloads.length}` }),
    });
  });
  await page.route("**/api/track/app-event", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ accepted: true }),
  }));
  return boundaries;
}

async function inspectFixtureSetupBoundary(page: Page, harness: Locator) {
  const mounted = await harness.count();
  const roots = await page.locator("#retailer-confirmation-harness-root").count();
  const controllerType = await page.evaluate(() => typeof window.__retailerResetFixture);
  if (!mounted) {
    expect(roots).toBe(0);
    expect(controllerType).toBe("undefined");
    return false;
  }
  await expect(harness).toHaveCount(1);
  expect(roots).toBe(1);
  expect(controllerType).toBe("function");
  await expect(page.locator("#retailer-confirmation-harness-root > main")).toHaveCount(1);
  await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(0);
  return true;
}

async function loadHarness(
  page: Page,
  boundaries: SyntheticBoundaries,
  options: Partial<RetailerFixtureInputs> & { viewport?: { width: number; height: number } } = {}
) {
  const harness = page.getByTestId("retailer-confirmation-harness");
  const mounted = await inspectFixtureSetupBoundary(page, harness);
  boundaries.reset();
  const fixture: RetailerFixtureInputs = {
    scenario: options.scenario ?? "ordinary",
    userKind: options.userKind ?? "consumer",
  };
  boundaries.userKind = fixture.userKind;
  await page.setViewportSize(options.viewport ?? DESKTOP);
  let generation = 1;
  if (mounted) {
    generation = await page.evaluate((inputs) => {
      if (typeof window.__retailerResetFixture !== "function") {
        throw new Error("Mounted retailer fixture has no reset controller.");
      }
      window.__retailerTabs = [];
      window.__retailerBlockTabs = false;
      return window.__retailerResetFixture(inputs);
    }, fixture);
  } else {
    const query = new URLSearchParams({
      "retailer-scenario": fixture.scenario,
      "retailer-user": fixture.userKind,
    });
    await page.goto(`/design?${query}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="scene-canvas"][data-client-hydrated="true"]')).toHaveCount(1);
    await page.addScriptTag({
      path: path.join(process.cwd(), ".next", "cache", "retailer-confirmation-browser-fixture", "bundle.js"),
    });
  }
  await expect(harness).toHaveCount(1);
  await expect(harness).toHaveAttribute("data-retailer-generation", String(generation));
  await expect(harness).toHaveAttribute("data-retailer-scenario", fixture.scenario);
  await expect(harness).toHaveAttribute("data-retailer-user", fixture.userKind);
  await expect(page.getByTestId("shopping-list-page")).toHaveCount(1);
  await expect(page.getByTestId("shopping-buy-list")).toHaveCount(0);
}

async function activate(page: Page, action: Locator, entry: Entry) {
  await expect(action).toHaveCount(1);
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  if (entry === "pointer") {
    await action.click();
    return;
  }
  await action.focus();
  await page.keyboard.press("Enter");
}

async function readTabs(page: Page) {
  return page.evaluate(() => window.__retailerTabs ?? []);
}

async function expectTabCount(page: Page, count: number) {
  await expect.poll(async () => (await readTabs(page)).length).toBe(count);
}

/** The tab at this index has been sent to the retailer; returns where. */
async function expectTabSent(page: Page, index: number) {
  await expect.poll(async () => (await readTabs(page))[index]?.href ?? null).not.toBeNull();
  return new URL((await readTabs(page))[index].href as string);
}

async function clickDetached(locator: Locator) {
  await locator.evaluate((button) => (button as HTMLButtonElement).click());
}

async function expectFocusedId(page: Page, id: string) {
  await expect(page.locator(`[id="${id}"]`)).toBeFocused();
}

async function expectBuyList(page: Page, shop: string, openerId: string) {
  const dialog = page.getByRole("dialog", { name: `Buy at ${shop}` });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("data-editor-dialog-focus-trap", "active");
  await expect(page.getByTestId("shopping-buy-list-close")).toBeFocused();
  const background = await page.locator(`[id="${openerId}"]`).evaluate((element) => {
    const owner = element.closest<HTMLElement>("[inert]");
    return { inert: Boolean(owner?.inert), ariaHidden: owner?.getAttribute("aria-hidden") };
  });
  expect(background).toEqual({ inert: true, ariaHidden: "true" });
  return dialog;
}

const buyListRow = (dialog: Locator, instanceId: string) =>
  dialog.locator(`[data-testid="shopping-buy-list-row"][data-instance-id="${instanceId}"]`);
const listRow = (page: Page, instanceId: string) =>
  page.locator(`[data-testid="shopping-list-row"][data-instance-id="${instanceId}"]`);

test("Buy at a shop with several products opens its buy list and pointer dismissal returns focus to Buy", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { userKind: "guest" });
  const buy = page.getByTestId("shopping-buy");
  await expect(buy).toHaveText("Buy at Safe Retailer");
  await activate(page, buy, "pointer");
  let dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await expect(dialog).toContainText("Open each product at Safe Retailer and add it to your cart there.");
  await expect(dialog.getByTestId("shopping-buy-list-row")).toHaveCount(3);
  const close = page.getByTestId("shopping-buy-list-close");
  const done = page.getByTestId("shopping-buy-list-done");
  await close.press("Shift+Tab");
  await expect(done).toBeFocused();
  await done.press("Tab");
  await expect(close).toBeFocused();
  const ariaSnapshot = await page.locator("body").ariaSnapshot();
  expect(ariaSnapshot).toContain('dialog "Buy at Safe Retailer"');
  expect(ariaSnapshot).not.toContain('heading "Shopping list"');

  await done.click();
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);

  await buy.click();
  dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);

  await buy.click();
  dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await dialog.click({ position: { x: 2, y: 2 } });
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);
  expect(boundaries.payloads).toHaveLength(0);
  expect(await readTabs(page)).toHaveLength(0);
});

test("Buy and Open work from the keyboard and Escape returns focus to Buy", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries);
  const buy = page.getByTestId("shopping-buy");
  await activate(page, buy, "keyboard");
  let dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await page.keyboard.press("Tab");
  const firstOpen = buyListRow(dialog, "alpha-line").getByTestId("shopping-buy-list-open");
  await expect(firstOpen).toBeFocused();
  await page.keyboard.press("Enter");
  await expectTabCount(page, 1);
  await expectTabSent(page, 0);
  await expect(buyListRow(dialog, "alpha-line")).toHaveAttribute("data-opened", "true");
  await expect(firstOpen).toBeFocused();
  await expect(dialog.getByTestId("shopping-buy-list-progress")).toHaveText("1 of 3 opened");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);

  // Reopening keeps the person's place.
  await page.keyboard.press("Enter");
  dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await expect(dialog.getByTestId("shopping-buy-list-progress")).toHaveText("1 of 3 opened");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);
  expect(await readTabs(page)).toHaveLength(1);
});

test("Each Open opens one tracked tab for its product and ticks it", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries);
  await page.getByTestId("shopping-buy").click();
  const dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  const progress = dialog.getByTestId("shopping-buy-list-progress");
  await expect(progress).toHaveText("0 of 3 opened");
  for (const [index, key] of (["alpha", "beta", "gamma"] as const).entries()) {
    const row = buyListRow(dialog, `${key}-line`);
    const open = row.getByTestId("shopping-buy-list-open");
    await expect(open).toHaveAccessibleName(`Open ${PRODUCTS[key].title} at Safe Retailer`);
    await expect(row).toHaveAttribute("data-opened", "false");
    await open.click();
    await expectTabCount(page, index + 1);
    const url = await expectTabSent(page, index);
    expect(url.origin + url.pathname).toBe(PRODUCTS[key].destination);
    expect(url.searchParams.get("clickKey")).toBe(`ch0015g-click-${index + 1}`);
    expect(url.searchParams.get("utm_source")).toBe("interior-ai");
    expect(url.searchParams.get("utm_medium")).toBe("affiliate");
    await expect(row).toHaveAttribute("data-opened", "true");
    await expect(open).toHaveAccessibleName(`Open ${PRODUCTS[key].title} at Safe Retailer again`);
    await expect(progress).toHaveText(`${index + 1} of 3 opened`);
  }
  // Each tab opened blank at the click, with no way back to this page, then went to the retailer.
  for (const tab of await readTabs(page)) {
    expect(tab).toMatchObject({ url: "", target: "_blank", features: null, opener: null, blocked: false });
  }
  expect(boundaries.payloads).toEqual(["alpha", "beta", "gamma"].map(clickPayload));

  // Opening a product again is the person's choice: one more tab.
  await buyListRow(dialog, "alpha-line").getByTestId("shopping-buy-list-open").click();
  await expectTabCount(page, 4);
  await expectTabSent(page, 3);
  await expect(progress).toHaveText("3 of 3 opened");
});

test("A failed click record still opens the retailer's address", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries);
  boundaries.failTracking = true;
  await activate(page, page.getByTestId("shopping-buy"), "keyboard");
  const dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expectTabCount(page, 1);
  const url = await expectTabSent(page, 0);
  expect(url.toString()).toBe(PRODUCTS.alpha.destination);
  expect(boundaries.payloads).toEqual([clickPayload("alpha")]);
  await expect(buyListRow(dialog, "alpha-line")).toHaveAttribute("data-opened", "true");
  await expect(dialog.getByTestId("shopping-buy-list-notice")).toHaveText("");
});

test("A shop with one product opens it directly without the buy list", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { scenario: "single" });
  const buy = page.getByTestId("shopping-buy");
  await expect(buy).toHaveText("Buy at Safe Retailer");
  await activate(page, buy, "keyboard");
  await expectTabCount(page, 1);
  const url = await expectTabSent(page, 0);
  expect(url.origin + url.pathname).toBe(PRODUCTS.alpha.destination);
  expect(url.searchParams.get("clickKey")).toBe("ch0015g-click-1");
  expect(boundaries.payloads).toEqual([clickPayload("alpha")]);
  await expect(page.getByTestId("shopping-buy-list")).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);
});

test("Nothing to buy offers the way back to Furnish and no Buy", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { scenario: "zero" });
  await expect(page.getByTestId("shopping-list-empty")).toContainText("Nothing to buy yet");
  await expect(page.getByTestId("shopping-buy")).toHaveCount(0);
  await expect(page.getByTestId("shopping-summary")).toHaveCount(0);
  await page.getByTestId("shopping-list-go-furnish").click();
  await expect(page.getByTestId("retailer-confirmation-harness")).toHaveAttribute("data-retailer-furnish-requests", "1");
  expect(await readTabs(page)).toHaveLength(0);
  expect(boundaries.payloads).toHaveLength(0);
});

test("A product without a buy link is listed apart and never opened", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { scenario: "missing-link" });
  const unavailable = page.locator('[data-testid="shopping-list-section"][data-section="unavailable"]');
  await expect(unavailable.getByRole("heading", { level: 2 })).toHaveText("Not sold online yet");
  await expect(unavailable).toContainText("No buy link yet");
  await expect(unavailable.getByTestId("shopping-list-row")).toHaveCount(1);
  await expect(unavailable).toContainText("Missing Link Stool");
  const buy = page.getByTestId("shopping-buy");
  await expect(buy).toHaveCount(1);
  await expect(buy).toHaveText("Buy at Safe Retailer");
  await buy.click();
  await expectTabCount(page, 1);
  const url = await expectTabSent(page, 0);
  expect(url.origin + url.pathname).toBe(PRODUCTS.alpha.destination);
  expect(boundaries.payloads).toEqual([clickPayload("alpha")]);
  await expect(page.getByTestId("shopping-buy-list")).toHaveCount(0);
});

test("The buy list says how many to add and a set counts once", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { scenario: "quantities" });
  await expect(listRow(page, "alpha-line").getByTestId("shopping-list-row-quantity")).toHaveText("Qty 3");
  await expect(listRow(page, "beta-line").getByTestId("shopping-list-row-detail")).toHaveText("Synthetic finish · Set of 2");
  await expect(listRow(page, "beta-line").getByTestId("shopping-list-row-quantity")).toHaveCount(0);
  await expect(page.getByTestId("shopping-list-total")).toHaveText("S$1,670");
  await page.getByTestId("shopping-buy").click();
  const dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await expect(buyListRow(dialog, "alpha-line")).toContainText("Add 3 to your cart");
  await expect(buyListRow(dialog, "beta-line")).toContainText("Add 1 to your cart");
  await expect(buyListRow(dialog, "gamma-line")).toContainText("Add 1 to your cart");
  // One tab per product, whatever the quantity; a set opens the set's own page.
  await buyListRow(dialog, "alpha-line").getByTestId("shopping-buy-list-open").click();
  await expectTabCount(page, 1);
  expect((await expectTabSent(page, 0)).pathname).toBe("/alpha");
  await buyListRow(dialog, "beta-line").getByTestId("shopping-buy-list-open").click();
  await expectTabCount(page, 2);
  expect((await expectTabSent(page, 1)).pathname).toBe("/beta-set-of-2");
  expect(boundaries.payloads).toEqual([clickPayload("alpha"), clickPayload("beta")]);
});

test("A shop's two spellings are one shop and each shop has its own Buy", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries);
  const sections = page.getByTestId("shopping-list-section");
  await expect(sections).toHaveCount(1);
  await expect(sections.first()).toHaveAttribute("data-section", SAFE_SHOP);
  await expect(sections.first().getByRole("heading", { level: 2 })).toHaveText("Safe Retailer");
  await expect(sections.first().getByTestId("shopping-list-row")).toHaveCount(3);
  await expect(sections.first()).toContainText("Living Room");
  await expect(sections.first()).toContainText("Bedroom");
  await expect(page.getByTestId("shopping-buy")).toHaveCount(1);

  await loadHarness(page, boundaries, { scenario: "two-shops" });
  await expect(sections).toHaveCount(2);
  const buys = page.getByTestId("shopping-buy");
  await expect(buys).toHaveText(["Buy at Safe Retailer", "Buy at Second Retailer"]);
  await buys.nth(1).click();
  await expectTabCount(page, 1);
  expect((await expectTabSent(page, 0)).host).toBe("second-retailer.test");
  await expect(page.getByTestId("shopping-buy-list")).toHaveCount(0);
  await buys.nth(0).click();
  const dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await expect(dialog.getByTestId("shopping-buy-list-row")).toHaveCount(2);
  await expect(dialog).not.toContainText("Delta Rug");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);
});

test("A blocked tab is explained and its product is not ticked", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries);
  await page.evaluate(() => { window.__retailerBlockTabs = true; });
  await page.getByTestId("shopping-buy").click();
  const dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  const notice = dialog.getByTestId("shopping-buy-list-notice");
  await expect(notice).toHaveAttribute("role", "status");
  await expect(notice).toHaveText("");
  await buyListRow(dialog, "alpha-line").getByTestId("shopping-buy-list-open").click();
  await expectTabCount(page, 1);
  await expect(notice).toHaveText(BLOCKED_TAB);
  expect((await readTabs(page))[0]).toMatchObject({ blocked: true, href: null });
  await expect(buyListRow(dialog, "alpha-line")).toHaveAttribute("data-opened", "false");
  await expect(dialog.getByTestId("shopping-buy-list-progress")).toHaveText("0 of 3 opened");
  expect(boundaries.payloads).toHaveLength(0);

  // Once pop-ups are allowed, opening it again works and the explanation goes.
  await page.evaluate(() => { window.__retailerBlockTabs = false; });
  await buyListRow(dialog, "alpha-line").getByTestId("shopping-buy-list-open").click();
  await expectTabCount(page, 2);
  await expectTabSent(page, 1);
  await expect(buyListRow(dialog, "alpha-line")).toHaveAttribute("data-opened", "true");
  await expect(notice).toHaveText("");
  expect(boundaries.payloads).toEqual([clickPayload("alpha")]);
});

test("Design changes and unmount close the buy list without opening anything", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries);
  await page.getByTestId("shopping-buy").click();
  let dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  // A product leaving the design leaves the open list too.
  await clickDetached(page.getByTestId("retailer-fixture-remove-one"));
  await expect(dialog.getByTestId("shopping-buy-list-row")).toHaveCount(2);
  await expect(dialog.getByTestId("shopping-buy-list-progress")).toHaveText("0 of 2 opened");
  // When the shop has nothing left, its list closes and focus goes to the current step.
  const staleOpen = await dialog.getByTestId("shopping-buy-list-open").first().elementHandle();
  await clickDetached(page.getByTestId("retailer-fixture-scope-change"));
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("shopping-buy")).toHaveCount(0);
  await expect(page.getByTestId("shopping-list-empty")).toHaveCount(1);
  await expectFocusedId(page, FALLBACK_ID);
  await staleOpen?.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await readTabs(page)).toHaveLength(0);
  expect(boundaries.payloads).toHaveLength(0);

  await loadHarness(page, boundaries);
  await page.getByTestId("shopping-buy").click();
  dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await clickDetached(page.getByTestId("retailer-fixture-unmount"));
  await expect(page.getByTestId("shopping-buy-list")).toHaveCount(0);
  await expect(page.getByTestId("shopping-list-page")).toHaveCount(0);
  await expect(page.locator(`[id="${FALLBACK_ID}"]`)).not.toBeFocused();
  expect(await readTabs(page)).toHaveLength(0);

  await loadHarness(page, boundaries);
  await page.getByTestId("shopping-buy").click();
  await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shopping-buy-list")).toHaveCount(0);
  expect(boundaries.payloads).toHaveLength(0);
});

test("A newer registered dialog supersedes dismissal and stale focus restoration", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries);
  await page.getByTestId("shopping-buy").click();
  const buyList = page.getByTestId("shopping-buy-list");
  await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await clickDetached(page.getByTestId("retailer-fixture-newer-opener"));
  const newerDialog = page.getByRole("dialog", { name: "Newer synthetic dialog" });
  await expect(newerDialog).toHaveCount(1);
  await expect(page.getByTestId("retailer-fixture-newer-close")).toBeFocused();
  expect(await buyList.evaluate((element) => {
    const owner = element.closest<HTMLElement>("[inert]");
    return { inert: Boolean(owner?.inert), ariaHidden: owner?.getAttribute("aria-hidden") };
  })).toEqual({ inert: true, ariaHidden: "true" });
  await page.keyboard.press("Escape");
  await expect(newerDialog).toHaveCount(0);
  await expect(page.getByTestId("shopping-buy-list-close")).toBeFocused();

  await clickDetached(page.getByTestId("retailer-fixture-newer-opener"));
  await expect(newerDialog).toHaveCount(1);
  await clickDetached(page.getByTestId("shopping-buy-list-close"));
  await expect(buyList).toHaveCount(0);
  await expect(page.getByTestId("retailer-fixture-newer-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("retailer-fixture-newer-opener")).toBeFocused();
  expect(await readTabs(page)).toHaveLength(0);
});

test("Guest Consumer and Pro receive the same buy list", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  for (const [index, userKind] of (["guest", "consumer", "pro"] as const).entries()) {
    await loadHarness(page, boundaries, { userKind });
    await activate(page, page.getByTestId("shopping-buy"), index % 2 === 0 ? "pointer" : "keyboard");
    const dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
    await expect(dialog.getByTestId("shopping-buy-list-row")).toHaveCount(3);
    await buyListRow(dialog, "alpha-line").getByTestId("shopping-buy-list-open").click();
    await expectTabCount(page, 1);
    const url = await expectTabSent(page, 0);
    expect(url.origin + url.pathname).toBe(PRODUCTS.alpha.destination);
    expect(boundaries.payloads).toEqual([clickPayload("alpha")]);
    await page.getByTestId("shopping-buy-list-done").click();
    await expect(dialog).toHaveCount(0);
    await expectFocusedId(page, BUY_SAFE_ID);
  }
});

test("Desktop and 390x844 buy lists fit the screen with 44px actions and focus rings", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { viewport: MOBILE, userKind: "pro" });
  await page.getByTestId("shopping-buy").click();
  const dialog = await expectBuyList(page, "Safe Retailer", BUY_SAFE_ID);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("shopping-buy-list-close")).toBeFocused();
  const geometry = await dialog.evaluate((element) => {
    const box = (target: Element) => {
      const rect = target.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    const panel = element.firstElementChild as HTMLElement;
    return {
      documentWidth: document.documentElement.scrollWidth,
      overlay: box(element),
      panel: box(panel),
      actions: [...panel.querySelectorAll<HTMLElement>("button")].map((button) => ({
        ...box(button),
        testId: button.dataset.testid ?? "",
        boxShadow: getComputedStyle(button).boxShadow,
      })),
    };
  });
  expect(geometry.documentWidth).toBe(MOBILE.width);
  expect(geometry.overlay).toMatchObject({ left: 0, right: MOBILE.width, top: 0, bottom: MOBILE.height });
  expect(geometry.panel.left).toBeGreaterThanOrEqual(16);
  expect(geometry.panel.right).toBeLessThanOrEqual(MOBILE.width - 16);
  expect(geometry.panel.top).toBeGreaterThanOrEqual(16);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(MOBILE.height - 16);
  expect(geometry.actions.map(({ testId }) => testId)).toEqual([
    "shopping-buy-list-close",
    "shopping-buy-list-open",
    "shopping-buy-list-open",
    "shopping-buy-list-open",
    "shopping-buy-list-done",
  ]);
  for (const action of geometry.actions) {
    expect(action.left).toBeGreaterThanOrEqual(geometry.panel.left);
    expect(action.right).toBeLessThanOrEqual(geometry.panel.right);
    expect(action.height).toBeGreaterThanOrEqual(44);
  }
  expect(geometry.actions[0].boxShadow).not.toBe("none");
  await expect(page.locator('[id="shopping-buy-list-dialog"]')).toHaveCount(1);
  await expect(page.locator(`[id="${BUY_SAFE_ID}"]`)).toHaveCount(1);
  await page.setViewportSize(DESKTOP);
  await expect(page.getByTestId("shopping-buy-list-close")).toBeFocused();
  await page.setViewportSize(MOBILE);
  await expect(page.getByTestId("shopping-buy-list-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, BUY_SAFE_ID);

  // Two shops on a phone: both Buy buttons fit, 44px tall, with no sideways scroll.
  await loadHarness(page, boundaries, { scenario: "two-shops", userKind: "pro", viewport: MOBILE });
  const buys = await page.getByTestId("shopping-buy").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, right: rect.right, height: rect.height };
  }));
  expect(buys).toHaveLength(2);
  for (const buy of buys) {
    expect(buy.left).toBeGreaterThanOrEqual(0);
    expect(buy.right).toBeLessThanOrEqual(MOBILE.width);
    expect(buy.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(MOBILE.width);
});
