import { expect, test, type Page } from "@playwright/test";

type UserMode = "consumer" | "pro";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type EntryTraceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type EntryTraceSnapshot = {
  event: string;
  frame: number;
  time: number;
  target: string | null;
  activeElement: string | null;
  targetRect: EntryTraceRect | null;
  focusedRect: EntryTraceRect | null;
  panelRect: EntryTraceRect | null;
  transform: string | null;
  translate: string | null;
  transitionProperty: string | null;
  transitionDuration: string | null;
  transitionDelay: string | null;
  lifecycle: string | null;
  generation: string | null;
  activeDialogCount: number;
  activeInsideDialog: boolean | null;
  activeConnected: boolean;
  activeVisible: boolean;
  activeWithinViewport: boolean;
  activeInsidePanel: boolean;
  dialogRole: string | null;
  ariaModal: string | null;
  backgroundInert: boolean | null;
  backgroundAriaHidden: boolean | null;
  backgroundKeyboardActionable: boolean | null;
  focusTrap: string | null;
  reducedMotion: boolean;
  viewport: { width: number; height: number; deviceScaleFactor: number };
};

type EntryTraceWindow = Window & {
  __cartEntryTrace?: {
    snapshots: EntryTraceSnapshot[];
    pauseNextEntry: () => void;
    waitForEntryPause: () => Promise<void>;
    resumeEntry: () => void;
    entryPaused: boolean;
    stop: () => void;
  };
  __cartTriggerActivations?: number;
};

async function installCartEntryTrace(page: Page) {
  await page.evaluate(() => {
    const focusStorageKey = "__cartEntryCloseFocusGenerations";
    sessionStorage.removeItem(focusStorageKey);
    const traceWindow = window as EntryTraceWindow;
    const snapshots: EntryTraceSnapshot[] = [];
    let frame = 0;
    let frameId = 0;
    let observedPanel: Element | null = null;
    let lastActiveElement = document.activeElement;
    let pauseArmed = false;
    const pauseWaiters: Array<() => void> = [];
    const readRect = (element: Element | null): EntryTraceRect | null => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        right: rect.right, bottom: rect.bottom,
      };
    };
    const identify = (element: EventTarget | Element | null) => {
      if (!(element instanceof HTMLElement)) return null;
      return element.dataset.testid ?? element.id ?? element.tagName.toLowerCase();
    };
    const isVisible = (element: HTMLElement | null) => {
      if (!element?.isConnected) return false;
      if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0;
    };
    const isWithinViewport = (element: HTMLElement | null) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 &&
        rect.right <= innerWidth && rect.bottom <= innerHeight;
    };
    const record = (event: string, target: EventTarget | null = null) => {
      const dialog = document.querySelector<HTMLElement>(
        '[data-testid="selection-tray-dialog"]'
      );
      const panel = dialog?.firstElementChild ?? null;
      const focused = document.activeElement;
      const focusedElement = focused instanceof HTMLElement ? focused : null;
      const trigger = document.querySelector<HTMLElement>(
        '[data-testid="selection-tray-trigger"]'
      );
      const activeDialogs = Array.from(
        document.querySelectorAll<HTMLElement>(
          ':is([role="dialog"], [role="alertdialog"])[aria-modal="true"]'
        )
      ).filter(isVisible);
      const style = panel ? getComputedStyle(panel) : null;
      snapshots.push({
        event,
        frame,
        time: performance.now(),
        target: identify(target),
        activeElement: identify(focused),
        targetRect: readRect(target instanceof Element ? target : null),
        focusedRect: readRect(focused),
        panelRect: readRect(panel),
        transform: style?.transform ?? null,
        translate: style?.translate ?? null,
        transitionProperty: style?.transitionProperty ?? null,
        transitionDuration: style?.transitionDuration ?? null,
        transitionDelay: style?.transitionDelay ?? null,
        lifecycle: dialog?.dataset.editorDialogState ?? null,
        generation: dialog?.dataset.editorDialogGeneration ?? null,
        activeDialogCount: activeDialogs.length,
        activeInsideDialog: dialog && focusedElement
          ? dialog.contains(focusedElement)
          : null,
        activeConnected: focusedElement?.isConnected ?? false,
        activeVisible: isVisible(focusedElement),
        activeWithinViewport: isWithinViewport(focusedElement),
        activeInsidePanel: panel instanceof HTMLElement && focusedElement
          ? panel.contains(focusedElement)
          : false,
        dialogRole: dialog?.getAttribute("role") ?? null,
        ariaModal: dialog?.getAttribute("aria-modal") ?? null,
        backgroundInert: trigger ? Boolean(trigger.closest("[inert]")) : null,
        backgroundAriaHidden: trigger
          ? Boolean(trigger.closest('[aria-hidden="true"]'))
          : null,
        backgroundKeyboardActionable: trigger
          ? isVisible(trigger) && trigger.tabIndex >= 0 &&
            !(trigger instanceof HTMLButtonElement && trigger.disabled)
          : null,
        focusTrap: dialog?.dataset.editorDialogFocusTrap ?? null,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          deviceScaleFactor: devicePixelRatio,
        },
      });
    };
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) record("resize-observer", entry.target);
    });
    const observePanel = () => {
      const panel = document.querySelector(
        '[data-testid="selection-tray-dialog"] > div'
      );
      if (!panel || panel === observedPanel) return;
      if (observedPanel) resizeObserver.unobserve(observedPanel);
      observedPanel = panel;
      resizeObserver.observe(panel);
      record("panel-observed", panel);
    };
    const mutationObserver = new MutationObserver((records) => {
      observePanel();
      if (records.some(({ type }) => type === "attributes")) {
        record("lifecycle-change");
      }
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-editor-dialog-state",
        "data-editor-dialog-generation",
        "data-editor-dialog-focus-trap",
        "inert",
        "aria-hidden",
      ],
    });
    const handleFocus = (event: FocusEvent) => {
      record(event.type, event.target);
      if (
        event.type === "focusin" &&
        event.target instanceof HTMLElement &&
        event.target.dataset.testid === "selection-tray-close"
      ) {
        const dialog = event.target.closest<HTMLElement>(
          '[data-testid="selection-tray-dialog"]'
        );
        const generations = JSON.parse(
          sessionStorage.getItem(focusStorageKey) ?? "[]"
        ) as string[];
        if (dialog?.dataset.editorDialogGeneration) {
          generations.push(dialog.dataset.editorDialogGeneration);
          sessionStorage.setItem(focusStorageKey, JSON.stringify(generations));
        }
      }
    };
    const handleTransition = (event: TransitionEvent) => {
      const panel = document.querySelector(
        '[data-testid="selection-tray-dialog"] > div'
      );
      if (event.target !== panel) return;
      record(event.type, event.target);
      if (event.type === "transitionrun" && pauseArmed) {
        pauseArmed = false;
        const animations = (event.target as HTMLElement).getAnimations();
        for (const animation of animations) {
          animation.currentTime = 0;
          animation.pause();
        }
        void Promise.all(animations.map((animation) => animation.ready)).then(() => {
          if (traceWindow.__cartEntryTrace) {
            traceWindow.__cartEntryTrace.entryPaused = true;
          }
          for (const resolve of pauseWaiters.splice(0)) resolve();
          record("transition-paused", event.target);
        });
      }
    };
    const handleResize = () => record("resize");
    for (const eventName of ["focusin", "focusout"] as const) {
      document.addEventListener(eventName, handleFocus, true);
    }
    for (const eventName of [
      "transitionrun", "transitionstart", "transitionend", "transitioncancel",
    ] as const) document.addEventListener(eventName, handleTransition, true);
    window.addEventListener("resize", handleResize);
    const trackFrames = () => {
      frame += 1;
      if (document.activeElement !== lastActiveElement) {
        lastActiveElement = document.activeElement;
        record("active-element-change", lastActiveElement);
      }
      if (document.querySelector('[aria-modal="true"]')) record("animation-frame");
      frameId = requestAnimationFrame(trackFrames);
    };
    frameId = requestAnimationFrame(trackFrames);
    record("trace-installed");
    traceWindow.__cartEntryTrace = {
      snapshots,
      pauseNextEntry: () => {
        pauseArmed = true;
        if (traceWindow.__cartEntryTrace) {
          traceWindow.__cartEntryTrace.entryPaused = false;
        }
      },
      waitForEntryPause: () => {
        if (traceWindow.__cartEntryTrace?.entryPaused) return Promise.resolve();
        return new Promise<void>((resolve) => pauseWaiters.push(resolve));
      },
      resumeEntry: () => {
        pauseArmed = false;
        const panel = document.querySelector<HTMLElement>(
          '[data-testid="selection-tray-dialog"] > div'
        );
        for (const animation of panel?.getAnimations() ?? []) animation.play();
        if (traceWindow.__cartEntryTrace) {
          traceWindow.__cartEntryTrace.entryPaused = false;
        }
      },
      entryPaused: false,
      stop: () => {
        cancelAnimationFrame(frameId);
        mutationObserver.disconnect();
        resizeObserver.disconnect();
        for (const eventName of ["focusin", "focusout"] as const) {
          document.removeEventListener(eventName, handleFocus, true);
        }
        for (const eventName of [
          "transitionrun", "transitionstart", "transitionend", "transitioncancel",
        ] as const) document.removeEventListener(eventName, handleTransition, true);
        window.removeEventListener("resize", handleResize);
      },
    };
  });
}

async function readCartEntryTrace(page: Page) {
  return page.evaluate(() =>
    (window as EntryTraceWindow).__cartEntryTrace?.snapshots ?? []
  );
}

function expectTraceRectWithinViewport(snapshot: EntryTraceSnapshot) {
  const rect = snapshot.targetRect;
  expect(rect).not.toBeNull();
  expect(rect?.x).toBeGreaterThanOrEqual(0);
  expect(rect?.y).toBeGreaterThanOrEqual(0);
  expect(rect?.right).toBeLessThanOrEqual(snapshot.viewport.width);
  expect(rect?.bottom).toBeLessThanOrEqual(snapshot.viewport.height);
}

function expectActiveModalFramesOwned(snapshots: EntryTraceSnapshot[]) {
  const activeFrames = snapshots.filter(
    ({ event, lifecycle }) => event === "animation-frame" && lifecycle !== null
  );
  expect(activeFrames.length).toBeGreaterThan(0);
  expect(
    activeFrames.some(
      ({ lifecycle }) => lifecycle === "mounting" || lifecycle === "entering"
    )
  ).toBe(true);
  for (const snapshot of activeFrames) {
    expect(snapshot.activeDialogCount).toBe(1);
    expect(snapshot.activeInsideDialog).toBe(true);
    expect(snapshot.activeConnected).toBe(true);
    expect(snapshot.activeVisible).toBe(true);
    expect(snapshot.activeWithinViewport).toBe(true);
    expect(snapshot.dialogRole).toBe("dialog");
    expect(snapshot.ariaModal).toBe("true");
    expect(snapshot.backgroundInert).toBe(true);
    expect(snapshot.backgroundAriaHidden).toBe(true);
    expect(snapshot.backgroundKeyboardActionable).toBe(false);
    expect(snapshot.focusTrap).toBe("active");
    if (snapshot.lifecycle !== "interactive") {
      expect(snapshot.activeInsidePanel).toBe(false);
    }
  }
}

async function armEntryPause(page: Page) {
  await page.evaluate(() =>
    (window as EntryTraceWindow).__cartEntryTrace?.pauseNextEntry()
  );
}

async function expectPausedEntryOwner(page: Page) {
  const dialog = page.getByTestId("selection-tray-dialog");
  await expect(dialog).toHaveCount(1);
  await page.evaluate(() =>
    (window as EntryTraceWindow).__cartEntryTrace?.waitForEntryPause()
  );
  await expect(dialog).toHaveAttribute("data-editor-dialog-state", "entering");
  expect(
    await page.evaluate(() =>
      (window as EntryTraceWindow).__cartEntryTrace?.entryPaused
    )
  ).toBe(true);
  await expect(dialog).toBeFocused();
  return dialog;
}

async function resumeEntry(page: Page) {
  await page.evaluate(() =>
    (window as EntryTraceWindow).__cartEntryTrace?.resumeEntry()
  );
}

async function advancePausedEntryIntoViewport(page: Page) {
  await page.getByTestId("selection-tray-dialog").evaluate((dialog) => {
      const panel = dialog.firstElementChild;
      if (!(panel instanceof HTMLElement)) return;
      for (const animation of panel.getAnimations()) {
        const { endTime } = animation.effect?.getComputedTiming() ?? {};
        if (typeof endTime === "number") animation.currentTime = endTime * 0.75;
      }
      (dialog as HTMLElement).style.justifyContent = "flex-start";
      window.dispatchEvent(new Event("resize"));
    });
  await waitForTwoAnimationFrames(page);
}

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
  await installCartEntryTrace(page);
  await armEntryPause(page);
  await trigger.click();
  const cartDialog = await expectPausedEntryOwner(page);
  const generation = await cartDialog.getAttribute("data-editor-dialog-generation");
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
  expect(
    await trigger.evaluate((element) => {
      const background = element.closest<HTMLElement>('[inert]');
      return {
        inert: Boolean(background?.inert),
        ariaHidden: background?.getAttribute("aria-hidden"),
      };
    })
  ).toEqual({ inert: true, ariaHidden: "true" });
  await resumeEntry(page);
  await cartDialog.locator(":scope > div").evaluate(async (panel) => {
    await Promise.all(panel.getAnimations().map((animation) => animation.finished));
  });
  await expect(cartDialog).toHaveAttribute("data-editor-dialog-state", "entering");
  await expect(page.getByTestId("selection-tray-close")).not.toBeFocused();
  await newerAction.press("Escape");
  await expect(cartDialog).toBeVisible();
  await expect(newerAction).toBeFocused();

  await newerAction.evaluate((action) =>
    action.closest('[aria-modal="true"]')?.remove()
  );
  const openCart = await expectOpenCart(page);
  expect(
    (await readCartEntryTrace(page)).some(
      ({ event, target, lifecycle, generation: snapshotGeneration }) =>
        event === "focusin" &&
        target === "selection-tray-dialog" &&
        lifecycle === "entering" &&
        snapshotGeneration === generation
    )
  ).toBe(true);
  await page.evaluate(() => {
    const modal = document.createElement("div");
    modal.id = "replacement-cart-test-modal";
    modal.setAttribute("role", "alertdialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Replacement cart prompt");
    modal.style.cssText = "position:fixed;inset:0;z-index:1000;background:white";
    const action = document.createElement("button");
    action.id = "replacement-cart-test-action";
    action.textContent = "Replacement prompt action";
    modal.append(action);
    document.body.append(modal);
    action.focus();
  });
  const replacementAction = page.locator("#replacement-cart-test-action");
  await expect(replacementAction).toBeFocused();
  await openCart.close.evaluate((button) =>
    (button as HTMLButtonElement).click()
  );
  await waitForTwoAnimationFrames(page);
  await expect(replacementAction).toBeFocused();
  const trace = await readCartEntryTrace(page);
  const closeFocusEvents = trace.filter(
    ({ event, target, generation: snapshotGeneration }) =>
      event === "focusin" &&
      target === "selection-tray-close" &&
      snapshotGeneration === generation
  );
  expect(closeFocusEvents).toHaveLength(1);
  expect(closeFocusEvents[0].lifecycle).toBe("interactive");
});

test("an owned dialog keeps initial focus and cannot steal focus when the cart closes", async ({ page }) => {
  const trigger = await openEditor(page, "consumer");
  await installCartEntryTrace(page);
  await armEntryPause(page);
  await trigger.click();
  const enteringDialog = await expectPausedEntryOwner(page);
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
  await expect(enteringDialog).toBeFocused();

  await resumeEntry(page);
  const openCart = await expectOpenCart(page);
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

test("responsive cart retains modal ownership without overflow or clipped focus", async ({
  page,
  browser,
}) => {
  const trigger = await openEditor(page, "consumer", MOBILE);
  await installCartEntryTrace(page);
  await trigger.evaluate((element) => {
    const traceWindow = window as EntryTraceWindow;
    traceWindow.__cartTriggerActivations = 0;
    element.addEventListener("click", () => {
      traceWindow.__cartTriggerActivations =
        (traceWindow.__cartTriggerActivations ?? 0) + 1;
    });
  });

  // Exact production-duration mobile entry.
  await trigger.click();
  let openCart = await expectOpenCart(page);
  await expect(openCart.dialog).toBeVisible();
  await expect(openCart.close).toBeFocused();
  await expect(openCart.dialog).toHaveAttribute(
    "data-editor-dialog-state",
    "interactive"
  );
  expect(
    await page.evaluate(() => ({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({ innerWidth: MOBILE.width, scrollWidth: MOBILE.width });
  const closeBounds = await openCart.close.boundingBox();
  expect(closeBounds).not.toBeNull();
  expect(closeBounds?.width).toBe(44);
  expect(closeBounds?.height).toBe(44);
  expect(closeBounds?.x).toBeGreaterThanOrEqual(2);
  expect((closeBounds?.x ?? 0) + (closeBounds?.width ?? 0)).toBeLessThanOrEqual(MOBILE.width - 2);
  await openCart.close.press("Escape");
  await expectClosedCart(page);

  // Hold the real CSS transition at transitionrun so entry ownership, keyboard
  // containment, and responsive remeasurement are observable without sleeps.
  await armEntryPause(page);
  await trigger.press("Enter");
  const enteringDialog = await expectPausedEntryOwner(page);
  const activationCount = await page.evaluate(() =>
    (window as EntryTraceWindow).__cartTriggerActivations
  );
  await page.keyboard.press("Tab");
  await expect(enteringDialog).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(enteringDialog).toBeFocused();
  expect(
    await enteringDialog
      .locator(":scope > div")
      .evaluate((panel) => (panel as HTMLElement).inert)
  ).toBe(true);
  await page.getByTestId("selection-tray-close").evaluate((button) =>
    (button as HTMLButtonElement).focus()
  );
  await expect(enteringDialog).toBeFocused();
  await page.setViewportSize(DESKTOP);
  await advancePausedEntryIntoViewport(page);
  await expect(enteringDialog).toHaveAttribute(
    "data-editor-dialog-state",
    "entering"
  );
  expect(
    await enteringDialog
      .locator(":scope > div")
      .evaluate((panel) => (panel as HTMLElement).inert)
  ).toBe(true);
  const enteringClose = page.getByTestId("selection-tray-close");
  await expect(enteringClose).not.toBeFocused();
  expect(
    await enteringDialog
      .locator(":scope > div")
      .evaluate((panel) => panel.getAnimations().map(({ playState }) => playState))
  ).toContain("paused");
  const pausedBounds = await enteringClose.boundingBox();
  expect(pausedBounds).not.toBeNull();
  expect((pausedBounds?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect(
    (pausedBounds?.x ?? 0) + (pausedBounds?.width ?? 0)
  ).toBeLessThanOrEqual(DESKTOP.width);
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(() =>
      (window as EntryTraceWindow).__cartTriggerActivations
    )
  ).toBe(activationCount);
  const accessibilitySnapshot = await page.locator("body").ariaSnapshot();
  expect(accessibilitySnapshot).toContain('dialog "Selection Tray"');
  expect(accessibilitySnapshot).not.toContain("Selection tray open");

  await enteringDialog.evaluate((dialog) =>
    (dialog as HTMLElement).style.removeProperty("justify-content")
  );
  await expect(enteringDialog).toBeFocused();
  await page.setViewportSize(MOBILE);
  await expect(enteringDialog).toBeFocused();
  await resumeEntry(page);
  openCart = await expectOpenCart(page);
  await openCart.close.press("Escape");
  await expectClosedCart(page);

  // Cancelling the in-flight CSS transition must use the same semantic
  // readiness gate and must not leave the dialog entering permanently.
  await armEntryPause(page);
  await trigger.press("Enter");
  const cancelledDialog = await expectPausedEntryOwner(page);
  await cancelledDialog.locator(":scope > div").evaluate((panel) => {
    (panel as HTMLElement).style.transitionProperty = "none";
    for (const animation of panel.getAnimations()) animation.cancel();
  });
  openCart = await expectOpenCart(page);
  await openCart.close.press("Escape");
  await expectClosedCart(page);

  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  openCart = await expectOpenCart(page);
  await expect(openCart.dialog).toHaveAttribute(
    "data-editor-dialog-state",
    "interactive"
  );
  await expect(openCart.dialog.locator(":scope > div")).toHaveCSS(
    "transition-property",
    "none"
  );
  const reducedMotionBounds = await openCart.close.boundingBox();
  expect(reducedMotionBounds).not.toBeNull();
  expect(reducedMotionBounds?.x).toBeGreaterThanOrEqual(2);
  expect(
    (reducedMotionBounds?.x ?? 0) + (reducedMotionBounds?.width ?? 0)
  ).toBeLessThanOrEqual(MOBILE.width - 2);
  await openCart.close.press("Escape");
  await expect(trigger).toBeFocused();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const noTransitionStyle = await page.addStyleTag({
    content:
      '[data-testid="selection-tray-dialog"] > div { transition-property: none !important; }',
  });
  await trigger.click();
  openCart = await expectOpenCart(page);
  await openCart.close.press("Escape");
  await expect(trigger).toBeFocused();
  await noTransitionStyle.evaluate((element) => (element as Element).remove());

  const completeTrace = await readCartEntryTrace(page);
  expectActiveModalFramesOwned(completeTrace);
  const closeFocusEvents = completeTrace.filter(
    ({ event, target }) => event === "focusin" && target === "selection-tray-close"
  );
  const successfulGenerations = new Set(
    closeFocusEvents
      .map(({ generation }) => generation)
      .filter((generation): generation is string => generation !== null)
  );
  expect(successfulGenerations.size).toBe(5);
  for (const generation of successfulGenerations) {
    const generationFocusEvents = closeFocusEvents.filter(
      (snapshot) => snapshot.generation === generation
    );
    expect(generationFocusEvents).toHaveLength(1);
    expect(generationFocusEvents[0].lifecycle).toBe("interactive");
    expect(generationFocusEvents[0].targetRect?.width).toBe(44);
    expect(generationFocusEvents[0].targetRect?.height).toBe(44);
    expectTraceRectWithinViewport(generationFocusEvents[0]);
  }
  expect(
    completeTrace.some(({ event }) => event === "transitioncancel")
  ).toBe(true);
  const traceRecord = {
    identity:
      "responsive cart retains modal ownership without overflow or clipped focus",
    browserVersion: browser.version(),
    snapshots: completeTrace,
  };
  await test.info().attach("cart-entry-lifecycle.json", {
    body: JSON.stringify(traceRecord, null, 2),
    contentType: "application/json",
  });
  if (process.env.CART_ENTRY_TRACE === "1") {
    console.log(`CH0015A_CART_ENTRY_TRACE=${JSON.stringify(traceRecord)}`);
  }
  await page.evaluate(() => (window as EntryTraceWindow).__cartEntryTrace?.stop());
});

test("route replacement cancels cart focus restoration", async ({ page }) => {
  const trigger = await openEditor(page, "consumer");
  await installCartEntryTrace(page);
  await armEntryPause(page);
  await trigger.click();
  const closingDialog = await expectPausedEntryOwner(page);
  const closingGeneration = await closingDialog.getAttribute(
    "data-editor-dialog-generation"
  );
  await page.keyboard.press("Escape");
  await expectClosedCart(page);
  await waitForTwoAnimationFrames(page);
  const trace = await readCartEntryTrace(page);
  expect(
    trace.filter(
      ({ event, target, generation }) =>
        event === "focusin" &&
        target === "selection-tray-close" &&
        generation === closingGeneration
    )
  ).toHaveLength(0);
  await expect(trigger).toBeFocused();

  await armEntryPause(page);
  await trigger.press("Enter");
  const unmountingDialog = await expectPausedEntryOwner(page);
  const unmountingGeneration = await unmountingDialog.getAttribute(
    "data-editor-dialog-generation"
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForTwoAnimationFrames(page);
  await expect(page.getByRole("dialog", { name: "Selection Tray" })).toHaveCount(0);
  const replacementTrigger = page.getByTestId("selection-tray-trigger");
  await expect(replacementTrigger).toHaveCount(1);
  await expect(replacementTrigger).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.isConnected ?? false)).toBe(true);
  const persistedFocusGenerations = await page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem("__cartEntryCloseFocusGenerations") ?? "[]"
    ) as string[]
  );
  expect(persistedFocusGenerations).not.toContain(unmountingGeneration);
});
