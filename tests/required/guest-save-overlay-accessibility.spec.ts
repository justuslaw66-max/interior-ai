import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

type Entry = "pointer" | "keyboard";
type RequestCounts = {
  ai: number;
  checkout: number;
  claim: number;
  save: number;
  authContinuation: number;
};

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const PROMPT_NAME = "Save and sync this design?";

async function installSyntheticBoundaries(page: Page, initialAuth = false) {
  let authenticated = initialAuth;
  const calls: RequestCounts = {
    ai: 0,
    checkout: 0,
    claim: 0,
    save: 0,
    authContinuation: 0,
  };
  const checkoutPayloads: unknown[] = [];
  await page.route("**/api/models/imported", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"models":[]}' })
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: authenticated ? "pro" : "free", source: "fixture" }),
    })
  );
  await page.route("**/api/auth/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          authenticated
            ? {
                user: { id: "ch0015f-user", email: "ch0015f@example.test", name: "CH-0015F" },
                expires: "2030-01-01T00:00:00.000Z",
              }
            : null
        ),
      });
    }
    calls.authContinuation += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: pathname.endsWith("/csrf")
        ? '{"csrfToken":"ch0015f-csrf"}'
        : pathname.endsWith("/providers")
          ? '{"google":{"id":"google","name":"Google","type":"oauth","signinUrl":"/design","callbackUrl":"/design"}}'
          : '{"url":"/design"}',
    });
  });
  await page.route("**/api/designs/claim", (route) => {
    calls.claim += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"designId":"ch0015f-claimed-design"}',
    });
  });
  await page.route("**/api/designs", (route) => {
    calls.save += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"id":"ch0015f-saved-design","updatedAt":"2026-08-10T00:00:00.000Z"}',
    });
  });
  await page.route("**/api/ai/layout", (route) => {
    calls.ai += 1;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"synthetic AI boundary"}',
    });
  });
  await page.route("**/api/shopify/checkout", (route) => {
    calls.checkout += 1;
    checkoutPayloads.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkoutUrl: "http://127.0.0.1:3000/guest-checkout-complete",
      }),
    });
  });
  await page.route("**/guest-checkout-complete**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Safe checkout fixture</title><p>Safe checkout fixture</p>",
    })
  );
  return {
    calls,
    checkoutPayloads,
    setAuthenticated(value: boolean) {
      authenticated = value;
    },
  };
}

async function openEditor(page: Page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    localStorage.setItem("scene_performance_mode", "lite");
  });
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  const scene = page.getByTestId("scene-canvas");
  await expect(scene).toHaveCount(1);
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute("data-client-hydrated", "true");
  await expect(page.getByRole("dialog", { name: PROMPT_NAME })).toHaveCount(0);
}

async function activate(page: Page, action: Locator, entry: Entry) {
  if (entry === "pointer") {
    await action.click();
    return;
  }
  await action.focus();
  await page.keyboard.press("Enter");
}

async function openWorkflow(page: Page, actionTestId: string) {
  const action = page.getByTestId(actionTestId);
  if (!(await action.isVisible())) {
    await page.getByTestId("editor-command-workspace").click();
  }
  await expect(action).toHaveCount(1);
  await expect(action).toBeVisible();
  await action.click();
}

async function openSavePrompt(page: Page, entry: Entry) {
  await activate(page, page.getByTestId("save-design"), entry);
  return expectPromptContract(page, "save", "guest-save-action");
}

async function revealAiPanel(page: Page) {
  if ((await page.getByRole("button", { name: "Generate layout" }).count()) === 0) {
    await openWorkflow(page, "editor-workflow-ai");
  }
  await expect(page.getByRole("button", { name: "Generate layout" })).toBeEnabled();
}

async function openAiPrompt(page: Page, entry: Entry) {
  await revealAiPanel(page);
  await activate(page, page.getByRole("button", { name: "Generate layout" }), entry);
  return expectPromptContract(page, "ai-layout", "guest-ai-layout-action");
}

async function openCheckoutFixture(page: Page, authenticated = false) {
  await page.addInitScript(() => {
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    localStorage.setItem("scene_performance_mode", "lite");
  });
  await page.goto(
    authenticated ? "/design?guest-checkout-auth=1" : "/design",
    { waitUntil: "domcontentloaded" }
  );
  const scene = page.getByTestId("scene-canvas");
  await expect(scene).toHaveCount(1);
  await expect(scene).toHaveAttribute("data-client-hydrated", "true");
  await page.waitForLoadState("load");
  await page.addScriptTag({
    path: path.join(
      process.cwd(),
      ".next",
      "cache",
      "guest-save-overlay-browser-fixture",
      "bundle.js"
    ),
  });
  await expect(page.getByTestId("guest-checkout-harness")).toHaveCount(1);
  const checkout = page.getByTestId("checkout-shopify");
  await expect(checkout).toHaveCount(1);
  await expect(checkout).toBeVisible();
  await expect(checkout).toBeEnabled();
  return checkout;
}

async function openCheckoutPrompt(page: Page, entry: Entry) {
  await triggerCheckout(page, entry);
  return expectPromptContract(page, "checkout", "guest-checkout-action");
}

async function triggerCheckout(page: Page, entry: Entry) {
  await activate(page, page.getByTestId("checkout-shopify"), entry);
}

async function expectPromptContract(
  page: Page,
  reason: "save" | "ai-layout" | "checkout",
  openerId: string
) {
  const dialog = page.getByRole("dialog", { name: PROMPT_NAME });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("data-editor-dialog-focus-trap", "active");
  await expect(dialog.locator("[data-guest-prompt-reason]")).toHaveAttribute(
    "data-guest-prompt-reason",
    reason
  );
  await expect(page.getByTestId("guest-save-prompt-close")).toBeFocused();
  const background = await page.locator(`#${openerId}`).evaluate((element) => {
    const owner = element.closest<HTMLElement>("[inert]");
    return {
      inert: Boolean(owner?.inert),
      ariaHidden: owner?.getAttribute("aria-hidden"),
    };
  });
  expect(background).toEqual({ inert: true, ariaHidden: "true" });
  for (const id of [
    "editor-guest-save-prompt",
    "guest-save-prompt-close-action",
    "guest-save-prompt-continue-action",
    "guest-save-prompt-primary-action",
  ]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
  return dialog;
}

async function expectFocusContained(page: Page) {
  expect(
    await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>(
        '[data-testid="guest-save-prompt"]'
      );
      return Boolean(dialog?.contains(document.activeElement));
    })
  ).toBe(true);
}

async function cancelByBackdrop(page: Page, dialog: Locator) {
  await dialog.click({ position: { x: 2, y: 2 } });
  await expect(dialog).toHaveCount(0);
}

async function expectSemanticFocus(page: Page, id: string) {
  await expect(page.locator(`#${id}`)).toBeFocused();
}

async function expectMobileGeometry(page: Page, dialog: Locator) {
  const geometry = await dialog.evaluate((element) => {
    const panel = element.firstElementChild as HTMLElement;
    const close = element.querySelector<HTMLElement>(
      '[data-testid="guest-save-prompt-close"]'
    );
    const panelRect = panel.getBoundingClientRect();
    const closeRect = close?.getBoundingClientRect();
    const closeStyle = close ? getComputedStyle(close) : null;
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      panel: {
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
        bottom: panelRect.bottom,
      },
      close: closeRect
        ? {
            left: closeRect.left,
            right: closeRect.right,
            top: closeRect.top,
            bottom: closeRect.bottom,
          }
        : null,
      focusVisible:
        closeStyle?.outlineStyle !== "none" || closeStyle?.boxShadow !== "none",
    };
  });
  expect(geometry.documentWidth).toBe(geometry.viewportWidth);
  expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
  expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.panel.top).toBeGreaterThanOrEqual(0);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.close?.left).toBeGreaterThanOrEqual(geometry.panel.left);
  expect(geometry.close?.right).toBeLessThanOrEqual(geometry.panel.right);
  expect(geometry.close?.top).toBeGreaterThanOrEqual(geometry.panel.top);
  expect(geometry.close?.bottom).toBeLessThanOrEqual(geometry.panel.bottom);
  expect(geometry.focusVisible).toBe(true);
}

test("Save pointer lifecycle owns semantics, containment, cancellation, return, and reopen", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openEditor(page);
  let dialog = await openSavePrompt(page, "pointer");
  await page.keyboard.press("Shift+Tab");
  await expectFocusContained(page);
  await page.keyboard.press("Tab");
  await expectFocusContained(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectSemanticFocus(page, "guest-save-action");
  expect(boundaries.calls.claim).toBe(0);

  dialog = await openSavePrompt(page, "pointer");
  await cancelByBackdrop(page, dialog);
  await expectSemanticFocus(page, "guest-save-action");
  expect(boundaries.calls.claim).toBe(0);

  await openSavePrompt(page, "pointer");
  await page.getByTestId("guest-save-prompt-close").click();
  await expectSemanticFocus(page, "guest-save-action");
  expect(boundaries.calls.claim).toBe(0);

  await openSavePrompt(page, "pointer");
  await page.getByTestId("guest-save-prompt-not-now").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByRole("dialog", { name: PROMPT_NAME })).toHaveCount(0);
  expect(boundaries.calls.claim).toBe(0);
  await openSavePrompt(page, "pointer");
});

test("Save keyboard lifecycle returns across responsive remount and blocks duplicate primary activation", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openEditor(page);
  let dialog = await openSavePrompt(page, "keyboard");
  await page.getByTestId("save-design").evaluate((element) => {
    const replacement = document.createElement("button");
    replacement.id = element.id;
    replacement.dataset.testid = "save-design-responsive-replacement";
    replacement.textContent = "Save";
    element.replaceWith(replacement);
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectSemanticFocus(page, "guest-save-action");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-client-hydrated", "true");
  dialog = await openSavePrompt(page, "keyboard");
  await page.getByTestId("guest-save-prompt-primary").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => boundaries.calls.claim).toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-client-hydrated", "true");
  await openSavePrompt(page, "keyboard");
  boundaries.setAuthenticated(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("dialog", { name: PROMPT_NAME })).toHaveCount(0);
  expect(boundaries.calls.claim).toBe(1);
});

test("AI pointer lifecycle cancels every generic dismissal without starting generation", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openEditor(page);
  let dialog = await openAiPrompt(page, "pointer");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectSemanticFocus(page, "guest-ai-layout-action");

  dialog = await openAiPrompt(page, "pointer");
  await cancelByBackdrop(page, dialog);
  await expectSemanticFocus(page, "guest-ai-layout-action");

  await openAiPrompt(page, "pointer");
  await page.getByTestId("guest-save-prompt-close").click();
  await expectSemanticFocus(page, "guest-ai-layout-action");
  expect(boundaries.calls.ai).toBe(0);

  await openAiPrompt(page, "pointer");
  await page.getByTestId("guest-save-prompt-not-now").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByRole("dialog", { name: PROMPT_NAME })).toHaveCount(0);
  expect(boundaries.calls.ai).toBe(0);
  await openAiPrompt(page, "pointer");
});

test("AI keyboard lifecycle rejects a removed opener and restores the workflow fallback", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openEditor(page);
  const dialog = await openAiPrompt(page, "keyboard");
  await page.locator("#guest-ai-layout-action").evaluate((element) => element.remove());
  await page.getByTestId("guest-save-prompt-close").click();
  await expect(dialog).toHaveCount(0);
  await expectSemanticFocus(page, "editor-command-workspace-action");
  expect(boundaries.calls.ai).toBe(0);
});

test("Checkout pointer lifecycle cancels without request or navigation and continues once", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openCheckoutFixture(page);
  let dialog = await openCheckoutPrompt(page, "pointer");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectSemanticFocus(page, "guest-checkout-action");

  dialog = await openCheckoutPrompt(page, "pointer");
  await cancelByBackdrop(page, dialog);
  await expectSemanticFocus(page, "guest-checkout-action");

  await openCheckoutPrompt(page, "pointer");
  await page.getByTestId("guest-save-prompt-close").click();
  await expectSemanticFocus(page, "guest-checkout-action");
  expect(boundaries.calls.checkout).toBe(0);
  expect(page.url()).toContain("/design");

  await openCheckoutPrompt(page, "pointer");
  await page.getByTestId("guest-save-prompt-not-now").click();
  await expect.poll(() => boundaries.calls.checkout).toBe(1);
  expect(boundaries.checkoutPayloads).toEqual([
    {
      lines: [
        {
          merchandiseId:
            "gid://shopify/ProductVariant/ch0015f-shopify-merchandise",
          quantity: 2,
          productId: "ch0015f-shopify-product",
          variantId: "ch0015f-shopify-variant",
        },
      ],
    },
  ]);
  await expect(page).toHaveURL(
    "http://127.0.0.1:3000/guest-checkout-complete?designId=ch0015f-checkout-design"
  );
});

test("Checkout keyboard lifecycle uses semantic fallback with no cancelled request", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openCheckoutFixture(page);
  const dialog = await openCheckoutPrompt(page, "keyboard");
  await page.locator("#guest-checkout-action").evaluate((element) => element.remove());
  await page.getByTestId("guest-save-prompt-close").click();
  await expect(dialog).toHaveCount(0);
  await expectSemanticFocus(page, "editor-command-workspace-action");
  expect(boundaries.calls.checkout).toBe(0);
});

test("A newer registered modal owns topmost dismissal before the Guest Save Prompt", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openEditor(page);
  await openSavePrompt(page, "pointer");
  const guestOwner = page.getByTestId("guest-save-prompt");
  await page.getByTestId("editor-command-overflow").evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await page.getByTestId("editor-command-overflow-rename-room").evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  const newerDialog = page.getByRole("dialog", { name: "Rename room" });
  await expect(newerDialog).toHaveCount(1);
  await expect(guestOwner).toHaveAttribute("inert", "");
  await expect(guestOwner).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(newerDialog).toHaveCount(0);
  await expect(guestOwner).toHaveCount(1);
  await expect(page.getByTestId("guest-save-prompt-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(guestOwner).toHaveCount(0);
  await expectSemanticFocus(page, "guest-save-action");
  expect(boundaries.calls.claim).toBe(0);
});

test("Guest mobile geometry contains every reason and authenticated Pro bypass remains unchanged", async ({ page }) => {
  const boundaries = await installSyntheticBoundaries(page);
  await openEditor(page, MOBILE);
  let dialog = await openSavePrompt(page, "keyboard");
  await expectMobileGeometry(page, dialog);
  await page.keyboard.press("Escape");

  dialog = await openAiPrompt(page, "pointer");
  await expectMobileGeometry(page, dialog);
  await page.keyboard.press("Escape");

  await openCheckoutFixture(page);
  dialog = await openCheckoutPrompt(page, "pointer");
  await expectMobileGeometry(page, dialog);
  await page.keyboard.press("Escape");
  expect(boundaries.calls.ai).toBe(0);
  expect(boundaries.calls.checkout).toBe(0);

  boundaries.setAuthenticated(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-client-hydrated", "true");
  await page.getByTestId("save-design").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: PROMPT_NAME })).toHaveCount(0);
  await expect.poll(() => boundaries.calls.save).toBeGreaterThan(0);

  await revealAiPanel(page);
  await page.getByRole("button", { name: "Generate layout" }).click();
  await expect(page.getByRole("dialog", { name: PROMPT_NAME })).toHaveCount(0);
  expect(boundaries.calls.ai).toBeLessThanOrEqual(1);

  await openCheckoutFixture(page, true);
  await triggerCheckout(page, "keyboard");
  await expect(page.getByRole("dialog", { name: PROMPT_NAME })).toHaveCount(0);
  await expect.poll(() => boundaries.calls.checkout).toBe(1);
});
