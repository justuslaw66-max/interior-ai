import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

type Entry = "pointer" | "keyboard";
type UserKind = "guest" | "consumer" | "pro";
type OpenRecord = {
  url: string;
  target: string | null;
  features: string | null;
  time: number;
};

declare global {
  interface Window {
    __retailerWindowOpens: OpenRecord[];
  }
}

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const GLOBAL_ACTION_ID = "retailer-confirmation-global-action";
const GROUP_ACTION_ID =
  "retailer-confirmation-group-action-safe%20retailer--53-61-66-65-20-52-65-74-61-69-6c-65-72";
const CART_FALLBACK_ID = "retailer-confirmation-cart-fallback-action";
const SAFE_DESTINATION = "http://127.0.0.1:3000/synthetic-retailer/alpha";

type SyntheticBoundaries = {
  payloads: Array<Record<string, unknown>>;
  requestTimes: number[];
  popupCount: number;
  failTracking: boolean;
  userKind: UserKind;
  reset: () => void;
};

async function installSyntheticBoundaries(page: Page) {
  const boundaries: SyntheticBoundaries = {
    payloads: [],
    requestTimes: [],
    popupCount: 0,
    failTracking: false,
    userKind: "consumer",
    reset() {
      this.payloads.length = 0;
      this.requestTimes.length = 0;
      this.popupCount = 0;
      this.failTracking = false;
    },
  };
  page.on("popup", () => { boundaries.popupCount += 1; });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    localStorage.setItem("scene_performance_mode", "lite");
    window.__retailerWindowOpens = [];
    window.open = (url, target, features) => {
      window.__retailerWindowOpens.push({
        url: String(url),
        target: target ?? null,
        features: features ?? null,
        time: performance.now(),
      });
      return null;
    };
  });
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      plan: boundaries.userKind === "pro" ? "pro" : "free",
      source: "retailer-confirmation-fixture",
    }),
  }));
  await page.route("**/api/track/click", (route) => {
    boundaries.payloads.push(
      route.request().postDataJSON() as Record<string, unknown>
    );
    boundaries.requestTimes.push(Date.now());
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
  await page.route("**/synthetic-retailer/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Safe retailer destination</title><p>Safe retailer destination</p>",
  }));
  return boundaries;
}

async function loadHarness(
  page: Page,
  boundaries: SyntheticBoundaries,
  options: {
    tabs?: number;
    scenario?: string;
    userKind?: UserKind;
    viewport?: { width: number; height: number };
  } = {}
) {
  boundaries.reset();
  boundaries.userKind = options.userKind ?? "consumer";
  await page.setViewportSize(options.viewport ?? DESKTOP);
  const query = new URLSearchParams({
    "retailer-tabs": String(options.tabs ?? 4),
    "retailer-scenario": options.scenario ?? "ordinary",
    "retailer-user": boundaries.userKind,
  });
  await page.goto(`/design?${query}`, { waitUntil: "domcontentloaded" });
  const scene = page.locator(
    '[data-testid="scene-canvas"][data-client-hydrated="true"]'
  );
  await expect(scene).toHaveCount(1);
  await page.addScriptTag({
    path: path.join(
      process.cwd(),
      ".next",
      "cache",
      "retailer-confirmation-browser-fixture",
      "bundle.js"
    ),
  });
  await expect(page.getByTestId("retailer-confirmation-harness")).toHaveCount(1);
  await expect(page.getByTestId("cart-panel")).toHaveCount(1);
  await expect(page.getByTestId("retailer-confirmation-dialog")).toHaveCount(0);
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

async function readWindowOpens(page: Page) {
  return page.evaluate(() => window.__retailerWindowOpens ?? []);
}

async function expectWindowOpenCount(page: Page, count: number) {
  await expect.poll(async () => (await readWindowOpens(page)).length).toBe(count);
}

async function expectConfirmation(
  page: Page,
  name: string,
  openerId: string
) {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("data-editor-dialog-focus-trap", "active");
  await expect(page.getByTestId("retailer-confirmation-close")).toBeFocused();
  const background = await page.locator(`[id="${openerId}"]`).evaluate((element) => {
    const owner = element.closest<HTMLElement>("[inert]");
    return {
      inert: Boolean(owner?.inert),
      ariaHidden: owner?.getAttribute("aria-hidden"),
    };
  });
  expect(background).toEqual({ inert: true, ariaHidden: "true" });
  return dialog;
}

async function expectFocusedId(page: Page, id: string) {
  await expect(page.locator(`[id="${id}"]`)).toBeFocused();
}

test("Global pointer lifecycle owns modal cancellation and exact-once continuation", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4, userKind: "guest" });
  const globalAction = page.getByTestId("checkout-affiliate");
  await activate(page, globalAction, "pointer");
  let dialog = await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  const close = page.getByTestId("retailer-confirmation-close");
  const continueAction = page.getByTestId("retailer-confirmation-continue");
  await close.press("Shift+Tab");
  await expect(continueAction).toBeFocused();
  await continueAction.press("Tab");
  await expect(close).toBeFocused();
  const ariaSnapshot = await page.locator("body").ariaSnapshot();
  expect(ariaSnapshot).toContain('dialog "Buy external items"');
  expect(ariaSnapshot).not.toContain("Make room cheaper");

  await page.getByTestId("retailer-confirmation-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, GLOBAL_ACTION_ID);
  expect(boundaries.payloads).toHaveLength(0);
  expect(await readWindowOpens(page)).toHaveLength(0);

  await globalAction.press("Enter");
  dialog = await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, GLOBAL_ACTION_ID);

  await globalAction.click();
  dialog = await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await dialog.click({ position: { x: 2, y: 2 } });
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, GLOBAL_ACTION_ID);

  await globalAction.click();
  dialog = await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.getByTestId("retailer-confirmation-close").click();
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, GLOBAL_ACTION_ID);

  await globalAction.click();
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.getByTestId("retailer-confirmation-continue").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expectWindowOpenCount(page, 4);
  expect(boundaries.payloads).toHaveLength(4);
  for (const payload of boundaries.payloads) {
    expect(payload).toEqual({
      designId: "ch0015g-synthetic-design",
      productId: "ch0015g-alpha-product",
      variantId: "ch0015g-alpha-variant",
    });
  }
  const opens = await readWindowOpens(page);
  for (const [index, record] of opens.entries()) {
    const url = new URL(record.url);
    expect(url.origin + url.pathname).toBe(SAFE_DESTINATION);
    expect(url.searchParams.get("clickKey")).toBe(`ch0015g-click-${index + 1}`);
    expect(url.searchParams.get("utm_source")).toBe("interior-ai");
    expect(url.searchParams.get("utm_medium")).toBe("affiliate");
    expect(record.target).toBe("_blank");
    expect(record.features).toBe("noopener,noreferrer");
  }
  for (let index = 1; index < boundaries.requestTimes.length; index += 1) {
    expect(boundaries.requestTimes[index] - boundaries.requestTimes[index - 1])
      .toBeGreaterThanOrEqual(300);
  }
});

test("Global keyboard lifecycle keeps tracking failure fail-open without duplicate windows", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4 });
  const globalAction = page.getByTestId("checkout-affiliate");
  await activate(page, globalAction, "keyboard");
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  boundaries.failTracking = true;
  await page.getByTestId("retailer-confirmation-continue").click();
  await expectWindowOpenCount(page, 4);
  expect(boundaries.payloads).toHaveLength(4);
  for (const record of await readWindowOpens(page)) {
    expect(record.url).toBe(SAFE_DESTINATION);
  }
});

test("Retailer-group pointer lifecycle preserves same-tab first-link navigation", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4 });
  const groupAction = page.getByTestId(GROUP_ACTION_ID);
  await activate(page, groupAction, "pointer");
  let dialog = await expectConfirmation(page, "Buy from Safe Retailer", GROUP_ACTION_ID);
  await page.getByTestId("retailer-confirmation-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, GROUP_ACTION_ID);

  await groupAction.click();
  dialog = await expectConfirmation(page, "Buy from Safe Retailer", GROUP_ACTION_ID);
  const sameTab = page.getByTestId("retailer-confirmation-same-tab");
  await sameTab.click();
  await expect(sameTab).toHaveAttribute("aria-pressed", "true");
  await Promise.all([
    page.waitForURL("**/synthetic-retailer/alpha**"),
    page.getByTestId("retailer-confirmation-continue").click(),
  ]);
  expect(boundaries.payloads).toHaveLength(1);
  expect(boundaries.popupCount).toBe(0);
  expect(page.url()).toContain("clickKey=ch0015g-click-1");
  expect(page.url()).toContain("utm_source=interior-ai");
  expect(page.url()).toContain("utm_medium=affiliate");
});

test("Retailer-group keyboard lifecycle restores replacements and the Cart fallback", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4 });
  let groupAction = page.getByTestId(GROUP_ACTION_ID);
  await activate(page, groupAction, "keyboard");
  await expectConfirmation(page, "Buy from Safe Retailer", GROUP_ACTION_ID);
  await groupAction.evaluate((element, replacementId) => {
    element.removeAttribute("id");
    element.removeAttribute("data-testid");
    const replacement = document.createElement("button");
    replacement.id = replacementId;
    replacement.dataset.testid = replacement.id;
    replacement.textContent = "Replacement retailer group action";
    element.parentElement?.append(replacement);
  }, GROUP_ACTION_ID);
  await page.getByTestId("retailer-confirmation-cancel").click();
  await expectFocusedId(page, GROUP_ACTION_ID);

  await loadHarness(page, boundaries, { tabs: 4 });
  groupAction = page.getByTestId(GROUP_ACTION_ID);
  await groupAction.press("Enter");
  await expectConfirmation(page, "Buy from Safe Retailer", GROUP_ACTION_ID);
  await groupAction.evaluate((element) => {
    element.removeAttribute("id");
    element.removeAttribute("data-testid");
    (element as HTMLButtonElement).disabled = true;
  });
  await page.getByTestId("retailer-confirmation-cancel").click();
  await expectFocusedId(page, CART_FALLBACK_ID);

  await loadHarness(page, boundaries, { tabs: 4 });
  groupAction = page.getByTestId(GROUP_ACTION_ID);
  await groupAction.click();
  const firstGeneration = page.locator("[data-retailer-confirmation-generation]");
  await expect(firstGeneration).toHaveAttribute("data-retailer-confirmation-generation", "1");
  await page.getByTestId("checkout-affiliate").evaluate((button) =>
    (button as HTMLButtonElement).click()
  );
  await expect(page.getByRole("dialog", { name: "Buy external items" })).toHaveCount(1);
  await expect(firstGeneration).toHaveAttribute("data-retailer-confirmation-generation", "2");
  await page.getByTestId("retailer-confirmation-continue").click();
  await expectWindowOpenCount(page, 4);
  expect(boundaries.payloads).toHaveLength(4);
});

test("Counting boundaries preserve zero one three and four tab behavior", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);

  await loadHarness(page, boundaries, { scenario: "zero", tabs: 0 });
  await expect(page.getByTestId("checkout-affiliate")).toBeDisabled();

  await loadHarness(page, boundaries, { tabs: 1 });
  await page.getByTestId("checkout-affiliate").click();
  await expectWindowOpenCount(page, 1);
  await expect(page.getByTestId("retailer-confirmation-dialog")).toHaveCount(0);

  await loadHarness(page, boundaries, { tabs: 3 });
  await page.getByTestId("checkout-affiliate").click();
  await expectWindowOpenCount(page, 3);
  await expect(page.getByTestId("retailer-confirmation-dialog")).toHaveCount(0);

  await loadHarness(page, boundaries, { tabs: 4 });
  await page.getByTestId("checkout-affiliate").click();
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.getByTestId("retailer-confirmation-cancel").click();
});

test("Counting preserves bundle exclusion and missing-link behavior", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { scenario: "bundle", tabs: 7 });
  await page.getByTestId("checkout-affiliate").click();
  await expectWindowOpenCount(page, 1);
  await expect(page.getByTestId("retailer-confirmation-dialog")).toHaveCount(0);

  await loadHarness(page, boundaries, { scenario: "excluded", tabs: 4 });
  await expect(page.getByTestId("checkout-affiliate")).toBeDisabled();
  expect(await readWindowOpens(page)).toHaveLength(0);

  await loadHarness(page, boundaries, { scenario: "missing-link", tabs: 4 });
  await page.getByTestId("checkout-affiliate").click();
  await expect(page.getByTestId("cart-notice")).toContainText(
    "No items in this group have buy links yet."
  );
  expect(await readWindowOpens(page)).toHaveLength(0);

});

test("Counting preserves duplicate URLs without deduplication", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { scenario: "duplicate", tabs: 4 });
  await page.getByTestId("checkout-affiliate").click();
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.getByTestId("retailer-confirmation-continue").click();
  await expectWindowOpenCount(page, 4);
  expect(new Set((await readWindowOpens(page)).map(({ url }) => new URL(url).pathname)).size)
    .toBe(1);
});

test("Counting preserves unavailable affiliate and row-open behavior", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4 });
  const rowOpen = page.getByRole("button", { name: "Open", exact: true });
  await expect(rowOpen).toHaveCount(1);
  await rowOpen.click();
  await expect(page.getByTestId("retailer-confirmation-dialog")).toHaveCount(0);
  await expectWindowOpenCount(page, 4);

  await loadHarness(page, boundaries, { scenario: "unavailable", tabs: 4 });
  await page.getByTestId("checkout-affiliate").click();
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
});

test("Scope route and unmount changes cancel stale continuation and restoration", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4 });
  const globalAction = page.getByTestId("checkout-affiliate");
  await globalAction.click();
  const retailerDialog = await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  const staleContinue = await page.getByTestId("retailer-confirmation-continue").elementHandle();
  await page.getByTestId("retailer-fixture-scope-change").evaluate((button) =>
    (button as HTMLButtonElement).click()
  );
  await expect(retailerDialog).toHaveCount(0);
  await staleContinue?.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator(`[id="${GLOBAL_ACTION_ID}"]`)).not.toBeFocused();
  await expect(page.locator(`[id="${CART_FALLBACK_ID}"]`)).not.toBeFocused();
  expect(boundaries.payloads).toHaveLength(0);
  expect(await readWindowOpens(page)).toHaveLength(0);

  await loadHarness(page, boundaries, { tabs: 4 });
  await page.getByTestId("checkout-affiliate").click();
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.getByTestId("retailer-fixture-unmount").evaluate((button) =>
    (button as HTMLButtonElement).click()
  );
  await expect(page.getByTestId("retailer-confirmation-dialog")).toHaveCount(0);
  await expect(page.locator(`[id="${GLOBAL_ACTION_ID}"]`)).toHaveCount(0);
  expect(boundaries.payloads).toHaveLength(0);

  await loadHarness(page, boundaries, { tabs: 4 });
  await page.getByTestId("checkout-affiliate").click();
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("retailer-confirmation-dialog")).toHaveCount(0);
});

test("A newer registered dialog supersedes dismissal and stale focus restoration", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4 });
  await page.getByTestId("checkout-affiliate").click();
  const retailerDialog = page.getByTestId("retailer-confirmation-dialog");
  await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.getByTestId("retailer-fixture-newer-opener").evaluate((button) =>
    (button as HTMLButtonElement).click()
  );
  const newerDialog = page.getByRole("dialog", { name: "Newer synthetic dialog" });
  await expect(newerDialog).toHaveCount(1);
  await expect(page.getByTestId("retailer-fixture-newer-close")).toBeFocused();
  expect(await retailerDialog.evaluate((element) => {
    const owner = element.closest<HTMLElement>("[inert]");
    return { inert: Boolean(owner?.inert), ariaHidden: owner?.getAttribute("aria-hidden") };
  })).toEqual({ inert: true, ariaHidden: "true" });
  await page.keyboard.press("Escape");
  await expect(newerDialog).toHaveCount(0);
  await expect(page.getByTestId("retailer-confirmation-close")).toBeFocused();

  await page.getByTestId("retailer-fixture-newer-opener").evaluate((button) =>
    (button as HTMLButtonElement).click()
  );
  await expect(newerDialog).toHaveCount(1);
  await page.getByTestId("retailer-confirmation-close").evaluate((button) =>
    (button as HTMLButtonElement).click()
  );
  await expect(retailerDialog).toHaveCount(0);
  await expect(page.getByTestId("retailer-fixture-newer-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("retailer-fixture-newer-opener")).toBeFocused();
});

test("Guest Consumer and Pro receive the same affiliate confirmation contract", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  for (const [index, userKind] of (["guest", "consumer", "pro"] as const).entries()) {
    await loadHarness(page, boundaries, { tabs: 4, userKind });
    await expect(page.getByTestId("retailer-confirmation-harness"))
      .toHaveAttribute("data-retailer-user", userKind);
    const action = page.getByTestId("checkout-affiliate");
    await activate(page, action, index % 2 === 0 ? "pointer" : "keyboard");
    const dialog = await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
    await page.getByTestId("retailer-confirmation-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expectFocusedId(page, GLOBAL_ACTION_ID);
    expect(boundaries.payloads).toHaveLength(0);
    expect(await readWindowOpens(page)).toHaveLength(0);
  }
});

test("Desktop and 390x844 global and group prompts contain actions focus rings and IDs", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await loadHarness(page, boundaries, { tabs: 4, viewport: MOBILE });
  await page.getByTestId("checkout-affiliate").click();
  let dialog = await expectConfirmation(page, "Buy external items", GLOBAL_ACTION_ID);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("retailer-confirmation-close")).toBeFocused();
  const geometry = await dialog.evaluate((element) => {
    const overlayRect = element.getBoundingClientRect();
    const panel = element.firstElementChild as HTMLElement;
    const panelRect = panel.getBoundingClientRect();
    const actions = [...panel.querySelectorAll<HTMLElement>("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.id,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        boxShadow: getComputedStyle(button).boxShadow,
      };
    });
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      overlay: {
        left: overlayRect.left,
        right: overlayRect.right,
        top: overlayRect.top,
        bottom: overlayRect.bottom,
      },
      panel: {
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
        bottom: panelRect.bottom,
      },
      actions,
    };
  });
  expect(geometry.documentWidth).toBe(MOBILE.width);
  expect(geometry.overlay).toEqual({
    left: 0,
    right: MOBILE.width,
    top: 0,
    bottom: MOBILE.height,
  });
  expect(geometry.panel.left).toBeGreaterThanOrEqual(16);
  expect(geometry.panel.right).toBeLessThanOrEqual(MOBILE.width - 16);
  expect(geometry.panel.top).toBeGreaterThanOrEqual(16);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(MOBILE.height - 16);
  for (const action of geometry.actions) {
    expect(action.left).toBeGreaterThanOrEqual(geometry.panel.left);
    expect(action.right).toBeLessThanOrEqual(geometry.panel.right);
    expect(action.top).toBeGreaterThanOrEqual(geometry.panel.top);
    expect(action.bottom).toBeLessThanOrEqual(geometry.panel.bottom);
    expect(action.height).toBeGreaterThanOrEqual(44);
  }
  const closeGeometry = geometry.actions.find(({ id }) =>
    id === "retailer-confirmation-close-action"
  );
  expect(closeGeometry?.boxShadow).not.toBe("none");
  for (const id of [
    "retailer-confirmation-dialog",
    "retailer-confirmation-close-action",
    "retailer-confirmation-same-tab-action",
    "retailer-confirmation-cancel-action",
    "retailer-confirmation-continue-action",
  ]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
  await page.setViewportSize(DESKTOP);
  await expect(page.getByTestId("retailer-confirmation-close")).toBeFocused();
  await page.setViewportSize(MOBILE);
  await expect(page.getByTestId("retailer-confirmation-close")).toBeFocused();
  await page.getByTestId("retailer-confirmation-cancel").click();
  await expect(dialog).toHaveCount(0);

  await loadHarness(page, boundaries, {
    tabs: 4,
    scenario: "mixed-groups",
    userKind: "pro",
    viewport: MOBILE,
  });
  await page.getByTestId(GROUP_ACTION_ID).click();
  dialog = await expectConfirmation(page, "Buy from Safe Retailer", GROUP_ACTION_ID);
  await expect(page.getByTestId("retailer-confirmation-same-tab")).toBeVisible();
  const groupGeometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const panelRect = element.firstElementChild?.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      overlay: [rect.left, rect.top, rect.right, rect.bottom],
      panel: panelRect
        ? [panelRect.left, panelRect.top, panelRect.right, panelRect.bottom]
        : null,
    };
  });
  expect(groupGeometry.documentWidth).toBe(MOBILE.width);
  expect(groupGeometry.overlay).toEqual([0, 0, MOBILE.width, MOBILE.height]);
  expect(groupGeometry.panel).not.toBeNull();
  expect(groupGeometry.panel?.[0]).toBeGreaterThanOrEqual(16);
  expect(groupGeometry.panel?.[1]).toBeGreaterThanOrEqual(16);
  expect(groupGeometry.panel?.[2]).toBeLessThanOrEqual(MOBILE.width - 16);
  expect(groupGeometry.panel?.[3]).toBeLessThanOrEqual(MOBILE.height - 16);
  await page.getByTestId("retailer-confirmation-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expectFocusedId(page, GROUP_ACTION_ID);
});
