import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
  getBetaPrismaClient,
} from "./beta-seed";
import { getE2EBaseUrl } from "./release-environment";

// The design's name (audit finding F): in the bar from 1280px, renamed in one undoable step, kept
// on this device for guests and saved to the design row, which My designs lists, when signed in.

const DESKTOP = { width: 1440, height: 900 };
const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";

async function openGuestEditor(page: Page) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "free", source: "playwright" }),
    }),
  );
  await page.addInitScript(() => {
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
}

async function renameTo(page: Page, opener: Locator, name: string) {
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Rename design" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByTestId("design-rename-input");
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press("Enter");
  await expect(dialog).toHaveCount(0);
}

test.describe("design name in the command bar", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("guests rename from the bar, undo it, and keep the name after a reload", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openGuestEditor(page);
    const title = page.getByTestId("editor-design-title");
    await expect(title).toHaveText("My Living Room");
    await expect(title).toHaveAccessibleName("Rename design, My Living Room");

    await renameTo(page, title, "  Tan flat  ");
    await expect(title).toHaveText("Tan flat");
    await expect(title).toBeFocused();
    const undo = page.getByTestId("command-undo");
    await expect(undo).toHaveAccessibleName("Undo Rename design");
    await undo.click();
    await expect(title).toHaveText("My Living Room");
    await page.getByTestId("command-redo").click();
    await expect(title).toHaveText("Tan flat");

    await expect
      .poll(() =>
        page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").title ?? null, DESIGN_STORAGE_KEY),
      )
      .toBe("Tan flat");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("editor-design-title")).toHaveText("Tan flat", { timeout: 30_000 });
  });

  test("below 1280px Rename design is in More, and focus comes back to More", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await openGuestEditor(page);
    await expect(page.getByTestId("editor-design-title")).toBeHidden();

    const more = page.getByTestId("editor-command-overflow");
    await more.click();
    await page.getByTestId("editor-command-overflow-rename-design").click();
    const dialog = page.getByRole("dialog", { name: "Rename design" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("design-rename-input")).toHaveValue("My Living Room");
    await dialog.getByTestId("design-rename-input").fill("   ");
    await expect(dialog.getByTestId("design-rename-save")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test("a cloud design opens under its row's name and saves a new one for My designs", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(DESKTOP);
    const seed = await createBetaSeedDesign();
    try {
      // A copy's row gets a new name while its snapshot keeps the original's.
      await getBetaPrismaClient().design.update({
        where: { id: seed.designId },
        data: { title: "Beta Smoke Whole Home (copy)" },
      });
      await addAuthCookies(page.context(), getE2EBaseUrl(), seed.sessionToken);
      await page.goto(`/design?designId=${encodeURIComponent(seed.designId)}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute("data-design-id", seed.designId, {
        timeout: 30_000,
      });
      const title = page.getByTestId("editor-design-title");
      await expect(title).toHaveText("Beta Smoke Whole Home (copy)");

      await renameTo(page, title, "Tan flat");
      await expect
        .poll(
          async () => {
            const response = await page.request.get(`/api/designs/${encodeURIComponent(seed.designId)}`);
            if (response.status() !== 200) return `http-${response.status()}`;
            const body = (await response.json()) as { title?: string; snapshot?: { title?: string } };
            return [body.title, body.snapshot?.title];
          },
          { timeout: 30_000 },
        )
        .toEqual(["Tan flat", "Tan flat"]);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
