import { expect, test } from "./fixtures";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
  getBetaPrismaClient,
} from "./beta-seed";
import { getE2EBaseUrl } from "./release-environment";

// My designs as one page (audit findings MD1–MD4 and MD6), laid out as in the mockup. The
// editor's My designs dialog is unchanged for now.

const baseURL = getE2EBaseUrl();

test.describe("My designs page", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("guests get a sign-in prompt instead of a redirect", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("my-designs-signed-out")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to see your designs" })).toBeVisible();
    await expect(page.getByTestId("my-designs-sign-in")).toHaveText("Continue with Google");
    await expect(page.getByTestId("app-header-sign-in")).toBeVisible();
    await expect(page.getByTestId("my-designs-continue-as-guest")).toHaveAttribute("href", "/design");
  });

  test("members see their designs with the Free limit, Pricing and New design", async ({ page }) => {
    const seed = await createBetaSeedDesign();
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const card = page.getByTestId(`my-design-card-${seed.designId}`);
      await expect(card).toContainText("Beta Smoke Whole Home");
      await expect(card).toContainText("Edited today");
      await expect(card.getByTestId("my-design-shared")).toHaveText("Shared");
      await expect(card.locator("polygon").first()).toBeAttached();
      await expect(page.getByTestId("my-designs-limit")).toContainText("1 of 20 designs on the Free plan.");
      await expect(page.getByTestId("my-designs-see-pricing")).toHaveAttribute("href", "/design?pricing=open");
      await expect(page.getByTestId("my-designs-new-design")).toHaveAttribute("href", "/design?start=new");
      await expect(page.getByTestId("app-header-my-designs")).toHaveAttribute("aria-current", "page");

      await page.getByTestId("app-header-account").click();
      await expect(page.getByTestId("app-header-plan")).toHaveText("Free plan");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("app-header-account-menu")).toHaveCount(0);
      await expect(page.getByTestId("app-header-account")).toBeFocused();
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("rename and delete from a card's menu, with focus back on its button", async ({ page }) => {
    const seed = await createBetaSeedDesign();
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const actions = page.getByTestId(`my-design-actions-${seed.designId}`);
      await actions.click();
      await expect(actions).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("menuitem", { name: "Rename" }).click();
      const input = page.getByTestId("design-rename-input");
      await expect(input).toBeFocused();
      await input.fill("Tan flat");
      await page.getByTestId("design-rename-save").click();
      await expect(page.getByTestId("my-designs-status")).toHaveText("Renamed to Tan flat");
      await expect(page.getByTestId(`my-design-card-${seed.designId}`)).toContainText("Tan flat");
      await expect(actions).toBeFocused();
      const renamed = await getBetaPrismaClient().design.findUniqueOrThrow({
        where: { id: seed.designId },
        select: { title: true, snapshot: true },
      });
      expect(renamed.title).toBe("Tan flat");
      expect((renamed.snapshot as { title?: unknown }).title, "the shared page reads this name").toBe("Tan flat");

      await actions.click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      const confirm = page.getByRole("dialog", { name: "Delete Tan flat?" });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByTestId("my-designs-status")).toHaveText("Deleted Tan flat");
      await expect(page.getByTestId(`my-design-card-${seed.designId}`)).toHaveCount(0);
      await expect(page.getByTestId("my-designs-empty")).toBeVisible();
      await expect(page.getByTestId("my-designs-limit")).toContainText("0 of 20 designs");
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("Share shows the link, copies it, and Escape closes the menu first", async ({ page, context }) => {
    const seed = await createBetaSeedDesign();
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
      await addAuthCookies(context, baseURL, seed.sessionToken);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const actions = page.getByTestId(`my-design-actions-${seed.designId}`);
      await actions.click();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("my-design-menu")).toHaveCount(0);
      await expect(actions).toBeFocused();

      await actions.click();
      await page.getByRole("menuitem", { name: "Share" }).click();
      const dialog = page.getByTestId("my-design-share-dialog");
      await expect(dialog).toBeVisible();
      const link = `${new URL(baseURL).origin}/share/${seed.shareToken}`;
      await expect(dialog.getByTestId("my-design-share-url")).toHaveValue(link);
      await expect(dialog.getByTestId("my-design-share-preview")).toHaveAttribute("href", link);
      await dialog.getByTestId("my-design-share-copy").click();
      await expect(dialog.getByTestId("my-design-share-status")).toHaveText("Link copied.");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
      await dialog.getByTestId("my-design-share-done").click();
      await expect(dialog).toHaveCount(0);
      await expect(actions).toBeFocused();
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("phones get one column and a header that fits", async ({ page }) => {
    const seed = await createBetaSeedDesign();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`my-design-card-${seed.designId}`)).toBeVisible();
      for (const testId of ["app-header-home", "app-header-my-designs", "app-header-pricing", "app-header-account"]) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box, `${testId} is on screen`).not.toBeNull();
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
      }
      const header = await page.getByTestId("app-header").boundingBox();
      expect(header?.height ?? 0, "the header stays one row").toBeLessThanOrEqual(65);
      const card = await page.getByTestId(`my-design-card-${seed.designId}`).boundingBox();
      expect(card?.width ?? 0).toBeGreaterThan(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
