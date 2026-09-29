import { expect, test, type Page } from "@playwright/test";

// UX phase 4c: from md, 2D | 3D, Fit to screen, Undo and Redo sit in a toolbar over the canvas
// (the approved Plan mockup); on phones 2D | 3D and Undo/Redo are two pills over the canvas (UX 4d,
// the PhonePlan mockup). The Keyboard shortcuts sheet opens from the canvas corner, the ? key and
// the command palette, and hands focus back.

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function openEditor(page: Page) {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("__canvasToolbarSeeded") === "1") return;
    window.localStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    window.sessionStorage.setItem("__canvasToolbarSeeded", "1");
  });
  await page.setViewportSize(DESKTOP);
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  const scene = page.getByTestId("scene-canvas").first();
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute("data-client-hydrated", "true");
  await expect(page.getByTestId("editor-command-bar")).toBeVisible();
}

const shortcutsDialog = (page: Page) => page.getByRole("dialog", { name: "Keyboard shortcuts" });

test("from md the canvas toolbar holds 2D | 3D, Fit, Undo and Redo; phones get two pills over the canvas", async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  const bar = page.getByTestId("editor-command-bar");
  const toolbar = page.getByTestId("canvas-view-toolbar");

  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("role", "group");
  await expect(toolbar).toHaveAccessibleName("Canvas controls");
  for (const testId of ["editor-view-toggle", "canvas-fit-view", "command-undo", "command-redo"]) {
    await expect(toolbar.getByTestId(testId)).toBeVisible();
    await expect(bar.getByTestId(testId)).toHaveCount(0);
  }
  await expect(toolbar.getByTestId("command-undo")).toBeDisabled();
  await expect(toolbar.getByTestId("canvas-fit-view")).toBeEnabled();
  await expect(toolbar.getByTestId("canvas-fit-view")).toHaveAccessibleName("Fit to screen");

  await toolbar.getByTestId("editor-view-3d").click();
  await expect(toolbar.getByTestId("editor-view-3d")).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByTestId("editor-view-2d").click();
  await expect(toolbar.getByTestId("editor-view-2d")).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByTestId("canvas-fit-view").click();

  await page.setViewportSize(PHONE);
  await expect(toolbar).toHaveCount(0);
  await expect(page.getByTestId("canvas-keyboard-shortcuts")).toHaveCount(0);
  const viewPill = page.getByTestId("canvas-view-pill");
  const historyPill = page.getByTestId("canvas-history-pill");
  await expect(viewPill.getByTestId("editor-view-toggle")).toBeVisible();
  await expect(historyPill).toHaveAccessibleName("History");
  await expect(historyPill.getByTestId("command-undo")).toBeVisible();
  await expect(historyPill.getByTestId("command-redo")).toBeVisible();
  await expect(bar.getByTestId("command-undo")).toHaveCount(0);
  await expect(page.getByTestId("canvas-fit-view")).toHaveCount(0);
  await viewPill.getByTestId("editor-view-3d").click();
  await expect(viewPill.getByTestId("editor-view-3d")).toHaveAttribute("aria-pressed", "true");
  await viewPill.getByTestId("editor-view-2d").click();
  await expect(viewPill.getByTestId("editor-view-2d")).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize(DESKTOP);
  await expect(toolbar).toBeVisible();
  await expect(viewPill).toHaveCount(0);
  await expect(bar.getByTestId("command-undo")).toHaveCount(0);
});

test("Shop's page covers the canvas, and its toolbar and the phone's pills go with it", async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  await page.getByTestId("editor-workflow-shop").click();
  await expect(page.getByTestId("shopping-list-page")).toBeVisible();
  await expect(page.getByTestId("canvas-view-toolbar")).toHaveCount(0);
  await expect(page.getByTestId("canvas-keyboard-shortcuts")).toHaveCount(0);
  await page.setViewportSize(PHONE);
  await expect(page.getByTestId("shopping-list-page")).toBeVisible();
  await expect(page.getByTestId("canvas-view-pill")).toHaveCount(0);
  await expect(page.getByTestId("canvas-history-pill")).toHaveCount(0);
  await page.getByTestId("editor-workflow-furnish").click();
  await expect(page.getByTestId("canvas-history-pill")).toBeVisible();
  await page.setViewportSize(DESKTOP);
  await expect(page.getByTestId("canvas-view-toolbar")).toBeVisible();
});

test("Keyboard shortcuts open from the corner, the ? key and the palette, and hand focus back", async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  const dialog = shortcutsDialog(page);

  const corner = page.getByTestId("canvas-keyboard-shortcuts");
  await expect(corner).toHaveAccessibleName("Keyboard shortcuts");
  await corner.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("heading", { name: "General" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /Drawing the plan/ })).toBeVisible();
  await expect(dialog.getByTestId("keyboard-shortcuts-pro")).toHaveCount(0);
  await expect(dialog.getByText(/^(Command|Control) Shift Z$/)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(corner).toBeFocused();

  const fit = page.getByTestId("canvas-fit-view");
  await fit.focus();
  await page.keyboard.press("?");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(fit).toBeFocused();

  const plan = page.getByTestId("editor-workflow-plan");
  await plan.focus();
  await page.keyboard.press("Control+K");
  const input = page.getByTestId("editor-command-palette-input");
  await expect(input).toBeFocused();
  await input.fill("keyboard");
  await expect(page.getByTestId("editor-command-palette-action-keyboard-shortcuts")).toBeVisible();
  await input.press("Enter");
  await expect(page.getByTestId("editor-command-palette")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(plan).toBeFocused();
});
