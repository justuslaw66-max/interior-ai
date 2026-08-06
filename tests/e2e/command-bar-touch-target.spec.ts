import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  addCatalogDrawerItemToRoom,
  openCatalogPreview,
} from "./variant-test-utils";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const TEST_ITEM_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

async function readFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/);
  const fingerprint = await marker.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Editor snapshot fingerprint is missing");
  return fingerprint;
}

async function openEditor(page: Page, plan: "free" | "pro") {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan, source: "playwright" }),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    window.localStorage.setItem("plan_measurement_unit", "mm");
  });
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(plan === "pro" ? "/design?mode=designer" : "/design", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("editor-command-bar")).toBeVisible();
}

async function expectSemanticTarget(
  target: Locator,
  expectedSize: number,
  label: string,
) {
  await expect(target).toHaveCount(1);
  await expect(target).toHaveJSProperty("tagName", "BUTTON");
  const box = await target.boundingBox();
  expect(box, `${label} should have measurable bounds`).not.toBeNull();
  expect(box!.width, `${label} width`).toBe(expectedSize);
  expect(box!.height, `${label} height`).toBe(expectedSize);

  const geometry = await target.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const style = window.getComputedStyle(button);
    const hitPoints = [
      [bounds.left + bounds.width / 2, bounds.top + 2],
      [bounds.right - 2, bounds.top + bounds.height / 2],
      [bounds.left + bounds.width / 2, bounds.bottom - 2],
      [bounds.left + 2, bounds.top + bounds.height / 2],
      [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2],
    ];
    return {
      cssWidth: style.width,
      cssHeight: style.height,
      hitPointsOwned: hitPoints.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === button || (hit instanceof Node && button.contains(hit));
      }),
      clipped:
        button.scrollHeight > button.clientHeight + 1 ||
        button.scrollWidth > button.clientWidth + 1,
    };
  });
  expect(geometry.cssWidth).toBe(`${expectedSize}px`);
  expect(geometry.cssHeight).toBe(`${expectedSize}px`);
  expect(geometry.hitPointsOwned, `${label} should own its complete hit box`).toBe(true);
  expect(geometry.clipped, `${label} content should not be clipped`).toBe(false);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

async function expectMobileHistoryGeometry(page: Page) {
  const bar = page.getByTestId("editor-command-bar");
  const sidebar = page.getByTestId("editor-design-sidebar-toggle");
  const undo = page.getByTestId("command-undo");
  const redo = page.getByTestId("command-redo");
  const viewToggle = page.getByTestId("editor-view-toggle");

  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await expect(undo).toHaveAccessibleName("Undo");
  await expect(redo).toHaveAccessibleName("Redo");
  await expect(undo).toHaveAttribute("title", "Undo (Cmd/Ctrl+Z)");
  await expect(redo).toHaveAttribute("title", "Redo (Cmd/Ctrl+Shift+Z)");
  await expectSemanticTarget(undo, 44, "mobile Undo");
  await expectSemanticTarget(redo, 44, "mobile Redo");

  const [barBox, sidebarBox, undoBox, redoBox, viewToggleBox] = await Promise.all([
    bar.boundingBox(),
    sidebar.boundingBox(),
    undo.boundingBox(),
    redo.boundingBox(),
    viewToggle.boundingBox(),
  ]);
  expect(barBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(undoBox).not.toBeNull();
  expect(redoBox).not.toBeNull();
  expect(viewToggleBox).not.toBeNull();
  expect(barBox!.height).toBeGreaterThanOrEqual(44);
  expect(undoBox!.y).toBeGreaterThanOrEqual(barBox!.y);
  expect(undoBox!.y + undoBox!.height).toBeLessThanOrEqual(
    barBox!.y + barBox!.height,
  );
  expect(undoBox!.x - (sidebarBox!.x + sidebarBox!.width)).toBeGreaterThanOrEqual(4);
  expect(redoBox!.x - (undoBox!.x + undoBox!.width)).toBeGreaterThanOrEqual(4);
  expect(viewToggleBox!.x - (redoBox!.x + redoBox!.width)).toBeGreaterThanOrEqual(4);
  await expect(page.getByTestId("save-status")).toBeHidden();
  await expectNoHorizontalOverflow(page);
}

async function expectDesktopHistoryGeometry(page: Page) {
  const bar = page.getByTestId("editor-command-bar");
  const undo = page.getByTestId("command-undo");
  const redo = page.getByTestId("command-redo");

  await expectSemanticTarget(undo, 30, "desktop Undo");
  await expectSemanticTarget(redo, 30, "desktop Redo");
  await expect.poll(async () => (await bar.boundingBox())?.height).toBe(36);
  await expect(page.getByTestId("save-status")).toHaveCSS("height", "30px");
  await expectNoHorizontalOverflow(page);
}

async function createOneHistoryEntry(page: Page) {
  const continueToFurnish = page.getByTestId("room-setup-continue-furnish");
  if (await continueToFurnish.isVisible().catch(() => false)) {
    await continueToFurnish.click();
  }
  const opened = await openCatalogPreview(page, TEST_ITEM_ID, "Hugg");
  expect(opened, "The deterministic Hugg fixture must be available").toBe(true);
  const beforePlacement = await readFingerprint(page);
  await addCatalogDrawerItemToRoom(page);
  return {
    beforePlacement,
    afterPlacement: await readFingerprint(page),
  };
}

async function expectKeyboardFocusVisible(page: Page, target: Locator) {
  for (const key of ["Tab", "Alt+Tab"]) {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    for (let tabCount = 0; tabCount < 50; tabCount += 1) {
      await page.keyboard.press(key);
      if (await target.evaluate((button) => document.activeElement === button)) break;
    }
    if (await target.evaluate((button) => document.activeElement === button)) break;
  }
  await expect(target).toBeFocused();
  const focus = await target.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const style = window.getComputedStyle(button);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    const outlineOffset = Number.parseFloat(style.outlineOffset);
    const outerSpread = Math.max(0, outlineWidth + outlineOffset);
    return {
      focusVisible: button.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth,
      top: bounds.top - outerSpread,
    };
  });
  expect(focus.focusVisible).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(focus.top).toBeGreaterThanOrEqual(0);
}

for (const plan of ["free", "pro"] as const) {
  test(`${plan} command history targets follow the mobile and desktop contracts`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await openEditor(page, plan);
    if (plan === "pro") {
      await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
    } else {
      await expect(page.getByTestId("pro-mode-indicator")).toHaveCount(0);
    }

    await expectMobileHistoryGeometry(page);
    await page.screenshot({
      path: testInfo.outputPath(`${plan}-mobile-command-bar.png`),
      animations: "disabled",
    });
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await expectDesktopHistoryGeometry(page);
    await page.screenshot({
      path: testInfo.outputPath(`${plan}-desktop-command-bar.png`),
      animations: "disabled",
    });
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectMobileHistoryGeometry(page);
  });
}

test("enabled Consumer history stays exactly-once for pointer and keyboard activation", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openEditor(page, "free");
  const { beforePlacement, afterPlacement } = await createOneHistoryEntry(page);
  const fingerprint = page.getByTestId("qa-editor-snapshot-fingerprint");
  const undo = page.getByTestId("command-undo");
  const redo = page.getByTestId("command-redo");

  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
  await expect(undo).toHaveAccessibleName(/^Undo /);
  await expectSemanticTarget(undo, 44, "enabled mobile Undo");
  await expectKeyboardFocusVisible(page, undo);

  await undo.click();
  await expect(fingerprint).toHaveAttribute("data-fingerprint", beforePlacement);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(fingerprint).toHaveAttribute("data-fingerprint", afterPlacement);

  await undo.press("Enter");
  await expect(fingerprint).toHaveAttribute("data-fingerprint", beforePlacement);
  await redo.press("Space");
  await expect(fingerprint).toHaveAttribute("data-fingerprint", afterPlacement);
  await expectNoHorizontalOverflow(page);
});
