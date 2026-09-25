import { expect, test, type Page } from "@playwright/test";
import { waitForEditorHydration } from "./variant-test-utils";

// The account corner (audit finding D): Sign in for guests, an Account menu with the member's
// initial, and Get Pro for Free users, none of which show before they are known.

type Plan = "free" | "pro";

async function mockAccount(page: Page, options: { plan: Plan; signedIn: boolean; planDelayMs?: number }) {
  await page.route("**/api/me", async (route) => {
    if (options.planDelayMs) await new Promise((resolve) => setTimeout(resolve, options.planDelayMs));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: options.plan, source: "playwright" }),
    });
  });
  if (options.signedIn) {
    await page.route(/\/api\/auth\/session(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "command-bar-account-user", name: "Alex Tan", email: "alex@example.test" },
          expires: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
  }
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });
}

async function openEditor(page: Page) {
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  await waitForEditorHydration(page);
}

// The corner shows nothing until the session has loaded.
const SESSION_TIMEOUT = { timeout: 20_000 };

async function closePricingWithEscape(page: Page) {
  const pricing = page.getByRole("dialog", { name: "Pricing" });
  await expect(pricing).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pricing).toHaveCount(0);
}

test.describe("command bar account corner", () => {
  test("guests get Sign in and Get Pro, and Pricing hands focus back to Get Pro", async ({ page }) => {
    await mockAccount(page, { plan: "free", signedIn: false });
    await openEditor(page);
    const signIn = page.getByTestId("editor-command-sign-in");
    await expect(signIn).toBeVisible(SESSION_TIMEOUT);
    await expect(signIn).toHaveAccessibleName("Sign in");
    await expect(page.getByTestId("editor-command-account")).toHaveCount(0);

    const getPro = page.getByTestId("editor-command-get-pro");
    await expect(getPro).toHaveText("Get Pro");
    await getPro.click();
    await closePricingWithEscape(page);
    await expect(getPro).toBeFocused();
  });

  test("members see their initial and Get Pro, and Pricing from the Account menu returns to Account", async ({ page }) => {
    await mockAccount(page, { plan: "free", signedIn: true });
    await openEditor(page);
    const account = page.getByTestId("editor-command-account");
    await expect(account).toHaveText("A", SESSION_TIMEOUT);
    await expect(account).toHaveAccessibleName("Account");
    await expect(page.getByTestId("editor-command-sign-in")).toHaveCount(0);
    await expect(page.getByTestId("editor-command-get-pro")).toBeVisible();

    await account.click();
    await page.getByTestId("editor-command-view-plans").click();
    await closePricingWithEscape(page);
    await expect(account).toBeFocused();
  });

  test("Pro members never see Get Pro, even while the plan is still loading", async ({ page }) => {
    await mockAccount(page, { plan: "pro", signedIn: true, planDelayMs: 2_000 });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    const account = page.getByTestId("editor-command-account");
    const getPro = page.getByTestId("editor-command-get-pro");
    await expect(account).toBeVisible({ timeout: 30_000 });
    // The session is known but the plan isn't yet: a Free default must not show Get Pro.
    await expect(getPro).toHaveCount(0);
    await account.click();
    await expect(page.getByTestId("editor-command-manage-billing")).toBeVisible();
    await expect(getPro).toHaveCount(0);
  });

  test("phones and tablets keep Get Pro out of the bar, and phones show Sign in as an icon", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAccount(page, { plan: "free", signedIn: false });
    await openEditor(page);
    const signIn = page.getByTestId("editor-command-sign-in");
    await expect(signIn).toBeVisible(SESSION_TIMEOUT);
    await expect(signIn).toHaveAccessibleName("Sign in");
    expect((await signIn.boundingBox())?.width).toBeLessThanOrEqual(31);
    await expect(page.getByTestId("editor-command-get-pro")).toBeHidden();
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.getByTestId("editor-command-get-pro")).toBeHidden();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByTestId("editor-command-get-pro")).toBeVisible();
  });
});
