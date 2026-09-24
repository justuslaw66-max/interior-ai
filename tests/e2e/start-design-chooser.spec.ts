import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { chooseNewDesign, chooseStartTemplate } from "./variant-test-utils";

// Start a new design (audit findings FR1, FR3, ST2, ST3, ST7, ST8): `/` and New design open it,
// `?start=` opens one of its choices, and guests sign in before uploading.

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";

// Once per test: later visits in the same tab keep the design, as a returning visitor's would.
async function clearEditorStorage(page: Page) {
  await page.addInitScript(() => {
    const sentinel = "__e2e_start_design_storage_cleared";
    if (window.sessionStorage.getItem(sentinel) === "1") return;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(sentinel, "1");
  });
}

function chooser(page: Page) {
  return page.getByTestId("start-design-chooser");
}

test.describe("Start a new design", () => {
  test("/ opens it on a first visit, and Blank room keeps the untouched room", async ({ page }) => {
    await clearEditorStorage(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(chooser(page)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/design$/);
    await expect(page.getByRole("heading", { name: "Start a new design", level: 1 })).toBeFocused();
    for (const choice of ["templates", "draw", "upload", "blank"]) {
      await expect(page.getByTestId(`start-choice-${choice}`)).toBeVisible();
    }
    await expect(page.getByTestId("start-choice-upload-sign-in")).toHaveText("Sign in needed");

    const cards = chooser(page).locator('button[data-testid^="start-template-"][aria-label]');
    await expect(cards).toHaveCount(8);
    await page.getByTestId("start-template-filter-2").click();
    await expect(page.getByTestId("start-template-filter-2")).toHaveAttribute("aria-pressed", "true");
    for (const label of await cards.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))) {
      expect(label).toMatch(/, \d+ bedrooms · /);
    }

    await expect(page.getByTestId("start-choice-blank")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("start-choice-blank").click();
    await expect(chooser(page)).toBeHidden();
    await expect(page.getByTestId("new-plan-choice-dialog")).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
  });

  test("a furnished template replaces the untouched room without asking", async ({ page }) => {
    await clearEditorStorage(page);
    await page.goto("/design?start=choose", { waitUntil: "domcontentloaded" });
    await expect(chooser(page)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/design$/);
    await page.getByTestId("start-template-furnished").click();
    await expect(page.getByTestId("start-template-studio")).toHaveAccessibleName(/, furnished$/);
    await chooseStartTemplate(page, "studio", { furnished: true });
    await expect(page.getByTestId("new-plan-choice-dialog")).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);

    // The design has content now, so a start link leaves it alone.
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key) ?? "", DESIGN_STORAGE_KEY))
      .toContain("template_studio_");
    await page.goto("/design?start=choose", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/design$/);
    await expect(chooser(page)).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
  });

  test("New design asks before replacing; Draw room draws in the new blank room", async ({ page }) => {
    await clearEditorStorage(page);
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(chooser(page)).toHaveCount(0);

    await chooseNewDesign(page);
    await expect(chooser(page)).toBeVisible();
    await expect(page.getByTestId("start-choice-draw")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("start-choice-draw").click();
    await expect(chooser(page)).toBeHidden();
    const choice = page.getByTestId("new-plan-choice-dialog");
    await expect(choice).toBeVisible();
    await expect(choice).toContainText("Blank room");
    await page.getByTestId("new-plan-replace-current").click();
    await expect(choice).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    await expect(page.getByText("Draw room walls in 2D")).toBeVisible();
  });

  test("My designs' links: ?start=new opens it as New design does, ?pricing=open opens Pricing", async ({ page }) => {
    await clearEditorStorage(page);
    await page.goto("/design?start=new", { waitUntil: "domcontentloaded" });
    await expect(chooser(page)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/design$/);
    await expect(page.getByTestId("start-choice-draw")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("start-choice-draw").click();
    // As with New design in More, it asks before replacing the design that's open.
    const choice = page.getByTestId("new-plan-choice-dialog");
    await expect(choice).toBeVisible();
    await page.getByTestId("new-plan-cancel").click();
    await expect(choice).toHaveCount(0);

    await page.goto("/design?pricing=open", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: "Pricing", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/design$/);
    await expect(chooser(page)).toHaveCount(0);
  });

  test("guests sign in before uploading, and Not now keeps the choices open", async ({ page }) => {
    await clearEditorStorage(page);
    await page.goto("/design?start=choose", { waitUntil: "domcontentloaded" });
    await expect(chooser(page)).toBeVisible({ timeout: 30_000 });
    const upload = page.getByTestId("start-choice-upload");
    await expect(upload).toBeEnabled({ timeout: 30_000 });
    await upload.click();

    const signIn = page.getByTestId("upload-sign-in-dialog");
    await expect(signIn).toBeVisible();
    await expect(signIn).toContainText("Sign in to upload your floor plan");
    await expect(signIn.getByTestId("upload-sign-in-continue")).toHaveText("Continue with Google");
    await signIn.getByTestId("upload-sign-in-not-now").click();
    await expect(signIn).toBeHidden();
    await expect(chooser(page)).toBeVisible();
    await expect(upload).toBeFocused();

    // An upload link opens the same sign-in step for guests.
    await page.goto("/design?start=upload", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("upload-sign-in-dialog")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/design$/);
  });

  test("Search by HDB address opens Plan's template list without a forced choice on a first visit", async ({ page }) => {
    await clearEditorStorage(page);
    await page.goto("/design?start=choose", { waitUntil: "domcontentloaded" });
    await expect(chooser(page)).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("start-template-address-search").click();
    await expect(chooser(page)).toBeHidden();
    await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose a template" })).toBeFocused();
    const studio = page.getByTestId("apply-plan-template-studio");
    await expect(studio).toBeEnabled({ timeout: 30_000 });
    await studio.click();
    await expect(page.getByTestId("new-plan-choice-dialog")).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
  });

  test("phones get one column of choices with no page-wide scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await clearEditorStorage(page);
    await page.goto("/design?start=choose", { waitUntil: "domcontentloaded" });
    await expect(chooser(page)).toBeVisible({ timeout: 30_000 });
    const boxes = await Promise.all(
      ["templates", "draw", "upload", "blank"].map((choice) => page.getByTestId(`start-choice-${choice}`).boundingBox())
    );
    for (const [index, box] of boxes.entries()) {
      expect(box, "each choice is measurable").not.toBeNull();
      expect(box?.x ?? 0).toBeGreaterThanOrEqual(16);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390 - 16);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (index > 0) expect(box?.y ?? 0).toBeGreaterThan(boxes[index - 1]?.y ?? 0);
    }
    const overflow = await chooser(page).evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId("start-design-close")).toBeVisible();
  });
});
