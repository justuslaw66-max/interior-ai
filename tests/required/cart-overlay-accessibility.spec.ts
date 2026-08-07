import { expect, test, type Page } from "@playwright/test";

type UserMode = "consumer" | "pro";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function openEditor(page: Page, mode: UserMode, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  if (mode === "pro") {
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "pro", source: "playwright" }),
      });
    });
  }
  await page.goto(mode === "pro" ? "/design?mode=designer" : "/design", {
    waitUntil: "domcontentloaded",
  });
  const scene = page.getByTestId("scene-canvas");
  await expect(scene).toHaveCount(1);
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute("data-client-hydrated", "true");
  if (mode === "pro") {
    await expect(page.getByTestId("editor-command-bar")).toBeVisible();
    await expect(page.getByTestId("pro-mode-indicator")).toHaveCount(1);
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
  }
  const trigger = page.getByTestId("selection-tray-trigger");
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toBeVisible();
  return trigger;
}

async function expectClosedCart(page: Page) {
  await expect(page.getByRole("dialog", { name: "Selection Tray" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Selection Tray" })).toHaveCount(0);
  await expect(page.getByTestId("selection-tray-close")).toHaveCount(0);
  await expect(page.getByTestId("selection-tray-clear")).toHaveCount(0);
  await expect(page.getByTestId("selection-tray-add-all")).toHaveCount(0);
}

async function expectOpenCart(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Selection Tray" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const close = page.getByTestId("selection-tray-close");
  await expect(close).toHaveCount(1);
  await expect(close).toBeFocused();
  const panel = dialog.locator(":scope > div");
  await expect(panel).toHaveCount(1);
  const colors = await dialog.evaluate((element) => ({
    backdrop: getComputedStyle(element).backgroundColor,
    panel: getComputedStyle(element.firstElementChild as Element).backgroundColor,
  }));
  expect(colors.backdrop).toMatch(/(?:\/\s*0\.3\)|,\s*0\.3\))/);
  expect(colors.panel).toMatch(/(?:rgb\(255,\s*255,\s*255\)|oklab\(1 0 0\))/);
  return { dialog, close };
}

async function waitForTwoAnimationFrames(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

for (const mode of ["consumer", "pro"] as const) {
  test(`${mode} empty cart owns a closed, pointer, keyboard, and reopen lifecycle`, async ({ page }) => {
    const trigger = await openEditor(page, mode);
    await expectClosedCart(page);
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    if (mode === "pro") {
      await trigger.press("Enter");
    } else {
      await trigger.click();
    }
    let openCart = await expectOpenCart(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await openCart.close.press("Tab");
    await expect(openCart.close).toBeFocused();
    await openCart.close.press("Shift+Tab");
    await expect(openCart.close).toBeFocused();
    await openCart.close.press("Escape");
    await expectClosedCart(page);
    await expect(trigger).toBeFocused();

    await trigger.press("Enter");
    openCart = await expectOpenCart(page);
    await openCart.close.click();
    await expectClosedCart(page);
    await expect(trigger).toBeFocused();

    await trigger.press("Space");
    await expectOpenCart(page);
    await page.getByTestId("selection-tray-dialog").dispatchEvent("mousedown");
    await expectClosedCart(page);
    await expect(trigger).toBeFocused();
  });
}

test("cart restoration resolves the current semantic replacement opener", async ({ page }) => {
  const trigger = await openEditor(page, "consumer");
  await trigger.click();
  const openCart = await expectOpenCart(page);
  await trigger.evaluate((element) => {
    const currentId = element.id;
    element.removeAttribute("id");
    element.removeAttribute("data-testid");
    const replacement = document.createElement("button");
    replacement.id = currentId;
    replacement.dataset.testid = "selection-tray-trigger";
    replacement.textContent = "Replacement tray opener";
    document.body.append(replacement);
  });
  await openCart.close.click();
  const replacement = page.getByTestId("selection-tray-trigger");
  await expect(replacement).toHaveCount(1);
  await expect(replacement).toBeFocused();
});

test("cart restoration ignores a missing and disabled opener", async ({ page }) => {
  const trigger = await openEditor(page, "consumer");
  await trigger.click();
  const openCart = await expectOpenCart(page);
  await trigger.evaluate((element) => {
    element.removeAttribute("id");
    element.removeAttribute("data-testid");
    (element as HTMLButtonElement).disabled = true;
  });
  await openCart.close.click();
  await waitForTwoAnimationFrames(page);
  await expect(page.getByTestId("selection-tray-trigger")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.isConnected ?? false)).toBe(true);
});

test("a newer modal supersedes cart Escape and focus restoration", async ({ page }) => {
  const trigger = await openEditor(page, "consumer");
  await trigger.click();
  const openCart = await expectOpenCart(page);
  await page.evaluate(() => {
    const modal = document.createElement("div");
    modal.id = "newer-cart-test-modal";
    modal.setAttribute("role", "alertdialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Newer cart prompt");
    modal.style.cssText = "position:fixed;inset:0;z-index:1000;background:white";
    const action = document.createElement("button");
    action.id = "newer-cart-test-action";
    action.textContent = "Newer prompt action";
    modal.append(action);
    document.body.append(modal);
    action.focus();
  });
  const newerAction = page.locator("#newer-cart-test-action");
  await expect(newerAction).toHaveCount(1);
  await expect(newerAction).toBeFocused();
  await newerAction.press("Escape");
  await expect(openCart.dialog).toBeVisible();
  await expect(newerAction).toBeFocused();
  await openCart.close.evaluate((button) => (button as HTMLButtonElement).click());
  await waitForTwoAnimationFrames(page);
  await expect(newerAction).toBeFocused();
});

test("an owned dialog keeps initial focus and cannot steal focus when the cart closes", async ({ page }) => {
  const trigger = await openEditor(page, "consumer");
  await trigger.click();
  const openCart = await expectOpenCart(page);
  await page
    .getByTestId("editor-command-overflow")
    .evaluate((button) => (button as HTMLButtonElement).click());
  const renameOpener = page.getByTestId("editor-command-overflow-rename-room");
  await expect(renameOpener).toHaveCount(1);

  await renameOpener.evaluate((button) => (button as HTMLButtonElement).click());
  const renameDialog = page.getByTestId("room-rename-dialog");
  const renameInput = page.getByTestId("room-rename-input");
  await expect(renameDialog).toHaveCount(1);
  await expect(renameInput).toBeFocused();
  await renameInput.press("Escape");
  await expect(renameDialog).toHaveCount(0);
  await expect(openCart.dialog).toBeVisible();
  await expect(openCart.close).toBeFocused();

  await renameOpener.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(renameInput).toBeFocused();
  await openCart.close.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(openCart.dialog).toHaveCount(0);
  await expect(renameDialog).toBeVisible();
  await expect(renameInput).toBeFocused();
  await renameInput.press("Escape");
  await expect(renameDialog).toHaveCount(0);
  await waitForTwoAnimationFrames(page);
  await expect(trigger).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.isConnected ?? false)).toBe(true);
});

test("responsive cart retains modal ownership without overflow or clipped focus", async ({ page }) => {
  const trigger = await openEditor(page, "consumer", DESKTOP);
  await trigger.click();
  let openCart = await expectOpenCart(page);
  await page.setViewportSize(MOBILE);
  await expect(openCart.dialog).toBeVisible();
  await expect(openCart.close).toBeFocused();
  await expect(openCart.dialog.locator(":scope > div")).toHaveCSS("transform", "none");
  expect(
    await page.evaluate(() => ({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({ innerWidth: MOBILE.width, scrollWidth: MOBILE.width });
  const closeBounds = await openCart.close.boundingBox();
  expect(closeBounds).not.toBeNull();
  expect(closeBounds?.x).toBeGreaterThanOrEqual(2);
  expect((closeBounds?.x ?? 0) + (closeBounds?.width ?? 0)).toBeLessThanOrEqual(MOBILE.width - 2);

  await page.setViewportSize(DESKTOP);
  await expect(openCart.dialog).toBeVisible();
  await openCart.close.press("Escape");
  await expectClosedCart(page);
  await trigger.click();
  openCart = await expectOpenCart(page);
  await openCart.close.press("Escape");
  await expect(trigger).toBeFocused();
});

test("route replacement cancels cart focus restoration", async ({ page }) => {
  const trigger = await openEditor(page, "consumer");
  await trigger.click();
  await expectOpenCart(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForTwoAnimationFrames(page);
  await expect(page.getByRole("dialog", { name: "Selection Tray" })).toHaveCount(0);
  const replacementTrigger = page.getByTestId("selection-tray-trigger");
  await expect(replacementTrigger).toHaveCount(1);
  await expect(replacementTrigger).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.isConnected ?? false)).toBe(true);
});
