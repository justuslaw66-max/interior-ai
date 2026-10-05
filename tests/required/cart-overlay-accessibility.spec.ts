import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

// CH-0015A's Cart gate, re-pinned in UX phase 3c-2 (J, 27 Sep): the Selection Tray is gone, and the
// gate owns the Shopping list, the page Shop shows over the canvas (audit findings FU7, FU8). The
// editor opens on a design kept in this browser, with three Castlery products in the Living Room.
// Buying at a shop is the Retailer gate's. Static prerequisite: scripts/test-cart-overlay-static.tsx.

type UserMode = "consumer" | "pro";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";
const DESIGN_TITLE = "Cart gate design";
const PRODUCT_IDS = [
  "armchair-real-castlery-avery-performance-armchair",
  "coffee-real-castlery-hugg-nesting-square-performance-dune-closed",
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed",
] as const;
const IDS = ["cart-gate-1", "cart-gate-2", "cart-gate-3"] as const;

function designFixture(productIds: readonly string[]) {
  return JSON.stringify({
    version: 3,
    schemaRevision: 1,
    units: { roomGeometry: "m", scenePosition: "m", productDimensions: "mm", rotation: "rad" },
    coordinateSystem: { handedness: "right", origin: "room_center_floor", axes: { x: "right", y: "up", z: "forward" } },
    title: DESIGN_TITLE,
    activeRoomId: "cart-gate-living",
    rooms: [
      {
        id: "cart-gate-living",
        name: "Living Room",
        roomType: "living",
        geometry: { width: 6, depth: 5, wallThickness: 0.12 },
        items: productIds.map((productId, index) => ({
          instanceId: IDS[index],
          productId,
          variantId: "catalog-default",
          position: [-1.5 + index * 1.5, 0, 0],
          rotationY: 0,
          includeInCheckout: true,
        })),
        zones: [],
        savedViews: [],
      },
    ],
  });
}

// Where a failing or slow test's time went (UX 4a, #73): on `5422594` Chromium's Undo test found the
// toast's Undo, then lost it before it could take focus, and it never came back. The toast drops
// Undo when its 8 s timer ends or when the newest history step stops being the removal. Each test
// notes its steps; the page records when the toast and its Undo come and go, the bar's undo step
// and long main-thread tasks; and the report says when the catalogue requests were sent and
// answered. It prints for a test that fails or takes over 10 s, and changes nothing a test checks.
const WATCHED_REQUESTS = ["/api/models/imported", "/api/catalog/live"] as const;
const timeline: Array<{ at: number; name: string }> = [];
let startedAt = 0;
function step(name: string) {
  timeline.push({ at: Date.now(), name });
}

function watchCatalogRequests(page: Page) {
  const watched = (url: string) => WATCHED_REQUESTS.find((path) => new URL(url).pathname === path);
  page.on("request", (request) => {
    const path = watched(request.url());
    if (path) step(`${path} sent`);
  });
  page.on("requestfinished", async (request) => {
    const path = watched(request.url());
    if (path) step(`${path} answered ${(await request.response())?.status() ?? "without a response"}`);
  });
  page.on("requestfailed", (request) => {
    const path = watched(request.url());
    if (path) step(`${path} failed: ${request.failure()?.errorText ?? "no reason given"}`);
  });
}

/** In the page: when the toast and its Undo come and go, the bar's undo step, and long tasks. */
function recordToastAndUndo() {
  const log: Array<[number, string]> = [];
  (window as unknown as { __cartGateLog: typeof log }).__cartGateLog = log;
  const note = (name: string, at = Date.now()) => log.push([Math.round(at), name]);
  let toast: string | null = null;
  let undo = false;
  let barUndo: string | null = null;
  const check = () => {
    const toastElement = document.querySelector('[data-testid="editor-action-toast"]');
    const nextToast = toastElement ? (toastElement.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90) : null;
    if (nextToast !== toast) note(nextToast === null ? "toast gone" : `toast "${nextToast}"`);
    const nextUndo = Boolean(document.querySelector('[data-testid="editor-action-toast-undo"]'));
    if (nextUndo !== undo) note(nextUndo ? "toast's Undo shown" : "toast's Undo gone");
    const nextBarUndo = document.querySelector('[data-testid="command-undo"]')?.getAttribute("aria-label") ?? null;
    if (nextBarUndo !== barUndo) note(`bar: ${nextBarUndo ?? "no Undo"}`);
    toast = nextToast;
    undo = nextUndo;
    barUndo = nextBarUndo;
  };
  new MutationObserver(check).observe(document, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label"],
  });
  try {
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (entry.duration >= 100) note(`long task ${Math.round(entry.duration)} ms`, performance.timeOrigin + entry.startTime);
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    note("this browser doesn't time long tasks");
  }
}

/** The page's own log, or why it couldn't be read within 3 s. */
async function pageLog(page: Page): Promise<Array<{ at: number; name: string }>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Array<[number, string]>>((resolve) => {
    timer = setTimeout(() => resolve([[Date.now(), "no answer from the page in 3 s"]]), 3_000);
  });
  try {
    const read = page.evaluate(() => (window as unknown as { __cartGateLog?: Array<[number, string]> }).__cartGateLog ?? []);
    return (await Promise.race([read, late])).map(([at, name]) => ({ at, name: `page: ${name}` }));
  } catch (error) {
    return [{ at: Date.now(), name: `page log unreadable: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` }];
  } finally {
    clearTimeout(timer);
  }
}

async function reportSlowOrFailedTest(page: Page, testInfo: TestInfo) {
  const now = Date.now();
  const failed = testInfo.status !== testInfo.expectedStatus;
  if (!startedAt || (!failed && now - startedAt < 10_000)) return;
  const label = `[cart gate] ${testInfo.project.name} "${testInfo.title}"`;
  const events = [...timeline, ...(await pageLog(page))].sort((a, b) => a.at - b.at);
  console.info(`${label} ${failed ? "failed" : "was slow"} (${now - startedAt} ms since the editor opened):`);
  console.info(events.map(({ at, name }) => `${at - startedAt} ms ${name}`).join(" · "));
}

async function openEditor(page: Page, mode: UserMode, productIds: readonly string[]) {
  timeline.length = 0;
  startedAt = Date.now();
  step(`opening the editor (${mode})`);
  watchCatalogRequests(page);
  await page.addInitScript(recordToastAndUndo);
  await page.setViewportSize(DESKTOP);
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: mode === "pro" ? "pro" : "free", source: "playwright" }),
    })
  );
  await page.addInitScript(
    ({ key, raw }) => {
      if (window.sessionStorage.getItem("__cartGateSeeded") === "1") return;
      window.localStorage.clear();
      window.localStorage.setItem(key, raw);
      window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
      window.sessionStorage.setItem("__cartGateSeeded", "1");
    },
    { key: DESIGN_STORAGE_KEY, raw: designFixture(productIds) }
  );
  await page.goto(mode === "pro" ? "/design?mode=designer" : "/design", { waitUntil: "domcontentloaded" });
  const scene = page.getByTestId("scene-canvas").first();
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute("data-client-hydrated", "true");
  // The design kept in this browser has opened: the bar shows its name.
  await expect(page.getByTestId("editor-design-title")).toHaveText(DESIGN_TITLE);
  if (mode === "pro") await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
  step("editor open");
}

// Opening the editor has its own allowance; every Shopping list check keeps the test's budget.
const shopTest = test.extend<{ consumerShop: Locator; proShop: Locator; singleProductShop: Locator }>({
  consumerShop: [async ({ page }, use) => {
    await openEditor(page, "consumer", PRODUCT_IDS);
    await use(page.getByTestId("editor-workflow-shop"));
  }, { timeout: 60_000 }],
  proShop: [async ({ page }, use) => {
    await openEditor(page, "pro", PRODUCT_IDS);
    await use(page.getByTestId("editor-rail-cart"));
  }, { timeout: 60_000 }],
  singleProductShop: [async ({ page }, use) => {
    await openEditor(page, "consumer", PRODUCT_IDS.slice(0, 1));
    await use(page.getByTestId("editor-workflow-shop"));
  }, { timeout: 60_000 }],
});

shopTest.afterEach(async ({ page }, testInfo) => {
  await reportSlowOrFailedTest(page, testInfo);
  startedAt = 0;
});

const rows = (page: Page) => page.getByTestId("shopping-list-row");
const row = (page: Page, instanceId: string) =>
  page.locator(`[data-testid="shopping-list-row"][data-instance-id="${instanceId}"]`);
const removeButton = (page: Page, instanceId: string) => row(page, instanceId).getByTestId("shopping-list-remove");
const listedIds = (page: Page) =>
  rows(page).evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.instanceId ?? ""));

async function expectShoppingList(page: Page, count: number) {
  const shopping = page.getByTestId("shopping-list-page");
  await expect(shopping).toBeVisible();
  await expect(shopping).toHaveAttribute("aria-labelledby", "shopping-list-title");
  await expect(page.getByRole("heading", { level: 1, name: "Shopping list" })).toBeVisible();
  await expect(rows(page)).toHaveCount(count);
  step(`list shows ${count}`);
  return shopping;
}

/** While Shop shows, the canvas behind it is inert and hidden: nothing in it takes focus. */
async function expectCanvasCovered(page: Page, covered: boolean) {
  const layer = page.getByTestId("canvas-behind-page");
  await expect(layer).toHaveCount(1);
  await expect.poll(() => layer.evaluate((element) => (element as HTMLElement).inert)).toBe(covered);
  await expect.poll(() => layer.getAttribute("aria-hidden")).toBe(covered ? "true" : null);
  if (!covered) return;
  const reachable = await layer.evaluate((element) => {
    const controls = element.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, canvas, [tabindex]");
    for (const control of Array.from(controls)) {
      control.focus();
      if (element.contains(document.activeElement)) return control.outerHTML.slice(0, 160);
    }
    return null;
  });
  expect(reachable).toBeNull();
}

/**
 * The list shows before the editor can edit (its products are still loading), and a disabled
 * button can't take focus: `focus()` on it does nothing and isn't retried. So wait for Remove.
 */
async function focusRemove(page: Page, instanceId: string) {
  const button = removeButton(page, instanceId);
  await expect(button).toBeEnabled();
  step(`${instanceId}'s Remove enabled`);
  await button.focus();
  await expect(button).toBeFocused();
  return button;
}

async function removeByKeyboard(page: Page, instanceId: string, key: "Enter" | "Space") {
  await focusRemove(page, instanceId);
  step(`${key} on ${instanceId}'s Remove`);
  await page.keyboard.press(key);
  await expect(row(page, instanceId)).toHaveCount(0);
  step(`${instanceId} removed`);
}

async function productTitle(page: Page, instanceId: string) {
  const label = (await removeButton(page, instanceId).getAttribute("aria-label")) ?? "";
  const title = /^Remove (.+) from the design$/.exec(label)?.[1];
  expect(title, `${instanceId} must name its product in Remove`).toBeTruthy();
  return title as string;
}

async function waitForTwoAnimationFrames(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  );
}

shopTest("Consumer Shop shows the Shopping list over an inert canvas and Furnish gives the editor back", async ({ page, consumerShop }) => {
  await expectCanvasCovered(page, false);
  await consumerShop.click();
  const shopping = await expectShoppingList(page, 3);
  await expect(consumerShop).toHaveAttribute("aria-current", "step");
  await expectCanvasCovered(page, true);
  const section = shopping.getByTestId("shopping-list-section");
  await expect(section).toHaveCount(1);
  await expect(section).toHaveAttribute("data-section", "castlery.com");
  expect(await listedIds(page)).toEqual([...IDS]);
  for (const instanceId of IDS) {
    await expect(removeButton(page, instanceId)).toHaveAccessibleName(`Remove ${await productTitle(page, instanceId)} from the design`);
  }
  await expect(page.getByTestId("shopping-buy")).toHaveCount(1);

  await page.getByTestId("editor-workflow-furnish").click();
  await expect(page.getByTestId("shopping-list-page")).toHaveCount(0);
  await expectCanvasCovered(page, false);
});

shopTest("Pro Shop hides the tool rail and removes by keyboard as Consumer does", async ({ page, proShop }) => {
  await expect(page.getByTestId("editor-tool-rail")).toBeVisible();
  await proShop.click();
  await expectShoppingList(page, 3);
  await expect(page.getByTestId("editor-tool-rail")).toHaveCount(0);
  await expectCanvasCovered(page, true);
  await removeByKeyboard(page, IDS[0], "Enter");
  await expect(rows(page)).toHaveCount(2);
  await expect(removeButton(page, IDS[1])).toBeFocused();
});

shopTest("Removing a product by keyboard moves focus to the next product's Remove", async ({ page, consumerShop }) => {
  await consumerShop.click();
  await expectShoppingList(page, 3);
  await removeByKeyboard(page, IDS[0], "Enter");
  await expect(rows(page)).toHaveCount(2);
  await expect(removeButton(page, IDS[1])).toBeFocused();
  // Enter again removes the product that now has focus, and focus moves on again.
  await page.keyboard.press("Enter");
  await expect(row(page, IDS[1])).toHaveCount(0);
  await expect(removeButton(page, IDS[2])).toBeFocused();
  expect(await listedIds(page)).toEqual([IDS[2]]);
});

shopTest("Removing the last product in the list moves focus to the product before it", async ({ page, consumerShop }) => {
  await consumerShop.click();
  await expectShoppingList(page, 3);
  await removeByKeyboard(page, IDS[2], "Space");
  await expect(rows(page)).toHaveCount(2);
  await expect(removeButton(page, IDS[1])).toBeFocused();
  await expect(page.getByTestId("shopping-list-section")).toContainText("2 products");
});

shopTest("Removing the only product moves focus to the Shopping list heading", async ({ page, singleProductShop }) => {
  await singleProductShop.click();
  await expectShoppingList(page, 1);
  await removeByKeyboard(page, IDS[0], "Enter");
  const empty = page.getByTestId("shopping-list-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("Nothing to buy yet");
  await expect(page.locator("#shopping-list-title")).toBeFocused();
  await expect(page.getByTestId("shopping-summary")).toHaveCount(0);
  await expectCanvasCovered(page, true);
});

shopTest("Undo in the toast puts the product back and keeps keyboard focus on Shop", async ({ page, consumerShop }) => {
  await consumerShop.click();
  await expectShoppingList(page, 3);
  const title = await productTitle(page, IDS[1]);
  await removeByKeyboard(page, IDS[1], "Enter");
  await expect(removeButton(page, IDS[2])).toBeFocused();
  const toast = page.getByTestId("editor-action-toast");
  await expect(toast).toContainText(`${title} removed from the design`);
  step("the toast names the removal");
  const undo = page.getByTestId("editor-action-toast-undo");
  await undo.focus();
  await expect(undo).toBeFocused();
  step("the toast's Undo focused");
  await page.keyboard.press("Enter");
  await expect(rows(page)).toHaveCount(3);
  expect(await listedIds(page)).toEqual([...IDS]);
  await expect(toast).toHaveCount(0);
  await expect(consumerShop).toBeFocused();
  await expect(consumerShop).toHaveAttribute("id", "editor-command-workspace-action");
  await expect(page.getByTestId("shopping-list-page")).toBeVisible();
});

shopTest("Removing with the pointer also leaves focus on the next product's Remove", async ({ page, consumerShop }) => {
  await consumerShop.click();
  await expectShoppingList(page, 3);
  await removeButton(page, IDS[0]).click();
  await expect(row(page, IDS[0])).toHaveCount(0);
  await expect(removeButton(page, IDS[1])).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

type ShopGeometry = {
  documentWidth: number;
  layer: DOMRectLike & { scrollWidth: number; clientWidth: number };
  list: DOMRectLike;
  summary: DOMRectLike;
  buy: DOMRectLike;
  removes: DOMRectLike[];
};
type DOMRectLike = { left: number; right: number; top: number; bottom: number; width: number; height: number };

async function shopGeometry(page: Page): Promise<ShopGeometry> {
  await waitForTwoAnimationFrames(page);
  return page.evaluate(() => {
    const box = (element: Element | null) => {
      if (!element) throw new Error("A Shopping list element is missing.");
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const layer = document.querySelector<HTMLElement>('[data-testid="shop-step"]');
    return {
      documentWidth: document.documentElement.scrollWidth,
      layer: { ...box(layer), scrollWidth: layer?.scrollWidth ?? 0, clientWidth: layer?.clientWidth ?? 0 },
      list: box(document.querySelector('[data-testid="shopping-list-section"]')),
      summary: box(document.querySelector('[data-testid="shopping-summary"]')),
      buy: box(document.querySelector('[data-testid="shopping-buy"]')),
      removes: Array.from(document.querySelectorAll('[data-testid="shopping-list-remove"]'), (element) => box(element)),
    };
  });
}

function expectFits(geometry: ShopGeometry, viewport: { width: number; height: number }) {
  expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
  expect(geometry.layer.scrollWidth).toBeLessThanOrEqual(geometry.layer.clientWidth);
  // Shop covers the width of the screen, and nothing in it scrolls sideways.
  expect(geometry.layer.left).toBeGreaterThanOrEqual(0);
  expect(geometry.layer.left).toBeLessThanOrEqual(0.5);
  expect(geometry.layer.right).toBeGreaterThanOrEqual(viewport.width - 0.5);
  expect(geometry.layer.right).toBeLessThanOrEqual(viewport.width);
  expect(geometry.removes).toHaveLength(3);
  for (const action of [...geometry.removes, geometry.buy]) {
    expect(action.left).toBeGreaterThanOrEqual(0);
    expect(action.right).toBeLessThanOrEqual(viewport.width);
  }
}

shopTest("Desktop and 390x844 Shopping lists fit the screen with 44px actions and focus rings", async ({ page, consumerShop }) => {
  await consumerShop.click();
  await expectShoppingList(page, 3);
  const desktop = await shopGeometry(page);
  expectFits(desktop, DESKTOP);
  // From `lg`, the summary is the column beside the list.
  expect(desktop.summary.left).toBeGreaterThanOrEqual(desktop.list.right);
  expect(desktop.buy.height).toBeGreaterThanOrEqual(44);

  await page.setViewportSize(PHONE);
  const phone = await shopGeometry(page);
  expectFits(phone, PHONE);
  for (const action of phone.removes) {
    expect(action.width).toBeGreaterThanOrEqual(44);
    expect(action.height).toBeGreaterThanOrEqual(44);
  }
  expect(phone.buy.height).toBeGreaterThanOrEqual(44);
  // On phones the total and Buy sit at the foot of the list, above the step bar.
  expect(phone.summary.top).toBeGreaterThanOrEqual(phone.layer.top);
  expect(phone.summary.bottom).toBeLessThanOrEqual(phone.layer.bottom + 0.5);
  expect(phone.layer.bottom).toBeLessThanOrEqual(PHONE.height - 64 + 0.5);

  // A keyboard move back onto Remove shows its focus ring.
  const first = await focusRemove(page, IDS[0]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(first).toBeFocused();
  expect(await first.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  await page.setViewportSize(DESKTOP);
  await expect(first).toBeFocused();
});
