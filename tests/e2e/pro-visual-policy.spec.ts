import { test, expect, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

const RECOMMENDED_CABINET_TEMPLATES = [
  "base",
  "wall",
  "wardrobe",
  "vanity",
  "cabinet_run",
  "closet_system",
] as const;

const CABINET_VIEWS = ["perspective", "front", "side", "top"] as const;

async function mockPlan(page: Page, plan: "free" | "pro") {
  await page.unroute("**/api/me");
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan, source: "playwright" }),
    });
  });
}

async function dismissBlockingPrompt(page: Page) {
  const overlay = page
    .locator(".fixed.inset-0.z-50")
    .filter({ hasText: /Upgrade to Pro|Save and sync this design/i })
    .last();
  if (!(await overlay.isVisible().catch(() => false))) return;

  const closeButton = overlay
    .getByRole("button", { name: /Maybe later|Close|Not now/i })
    .last();
  if ((await closeButton.count()) > 0) {
    await closeButton.click();
    await expect(overlay).toBeHidden({ timeout: 5000 });
  }
}

async function openCustomMillworkStudioFromWorkspace(
  page: Page,
  options: {
    accessLevel: "consumer" | "pro";
    activation: "keyboard" | "pointer";
  }
) {
  const workspace = page.getByTestId("editor-command-workspace");
  const menu = page.getByTestId("editor-command-workspace-menu");
  const workflow = page.getByTestId("editor-workflow-millwork");
  const legacyLabel = page.getByTestId("open-custom-millwork-studio");

  await page.waitForLoadState("networkidle");
  await dismissBlockingPrompt(page);
  await expect(workspace).toBeVisible();
  await expect(menu).toBeHidden();
  await expect(workflow).toHaveCount(1);
  await expect(workflow).toBeHidden();
  await expect(legacyLabel).toHaveCount(1);
  await expect(legacyLabel).toBeHidden();

  if (options.activation === "keyboard") {
    await workspace.focus();
    await expect(workspace).toBeFocused();
    await workspace.press("Enter");
  } else {
    await workspace.click();
  }

  await expect(workspace).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
  await expect(workflow).toBeVisible();
  await expect(workflow).toHaveAccessibleName("Custom Millwork Studio");
  await expect(legacyLabel).toBeVisible();

  if (options.activation === "keyboard") {
    await expect(page.getByTestId("editor-workflow-plan")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(workflow).toBeFocused();
    await workflow.press("Enter");
  } else {
    await workflow.click();
  }

  const studio = page.getByTestId("custom-millwork-studio");
  const dialog = page.getByRole("dialog", { name: "Custom Millwork Studio" });
  await expect(studio).toBeVisible({ timeout: 15_000 });
  await expect(studio).toHaveCount(1);
  await expect(studio).toHaveAttribute("data-access-level", options.accessLevel);
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(menu).toBeHidden();
  await expect(workspace).toHaveAttribute("aria-expanded", "false");
}

async function readThemeTokens(page: Page) {
  return page.locator("[data-theme]").first().evaluate((element) => {
    const styles = getComputedStyle(element);
    const readColorToken = (name: string) => {
      const value = styles.getPropertyValue(name).trim().toLowerCase();
      const shorthand = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
      return shorthand
        ? `#${shorthand[1]}${shorthand[1]}${shorthand[2]}${shorthand[2]}${shorthand[3]}${shorthand[3]}`
        : value;
    };
    return {
      canvas: readColorToken("--bg-canvas"),
      canvas3d: readColorToken("--bg-canvas-3d"),
      command: readColorToken("--bg-command"),
      panel: readColorToken("--bg-panel"),
      raised: readColorToken("--bg-panel-raised"),
      hover: readColorToken("--bg-panel-hover"),
      primary: readColorToken("--text-primary"),
      secondary: readColorToken("--text-secondary"),
      muted: readColorToken("--text-muted"),
      accent: readColorToken("--accent"),
    };
  });
}

type Rgb = { red: number; green: number; blue: number };

function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  expect(channels, `Expected an RGB color, received ${value}`).toHaveLength(3);
  return {
    red: channels![0],
    green: channels![1],
    blue: channels![2],
  };
}

async function expectRestrainedNavigationAccent(page: Page) {
  const commandBar = page.getByTestId("editor-command-bar");
  const navigationItems = [
    commandBar.getByRole("button", { name: "3D", exact: true }),
    page.getByTestId("editor-command-workspace"),
    page.getByTestId("editor-rail-design"),
  ];
  const activeBackgrounds: string[] = [];
  for (const item of navigationItems) {
    await expect(item).toBeVisible();
    activeBackgrounds.push(
      await item.evaluate((element) => getComputedStyle(element).backgroundColor)
    );
  }
  const fullFillCount = activeBackgrounds.filter((background) => {
    const { red, green, blue } = parseRgb(background);
    return blue - red >= 40 && blue - green >= 20;
  }).length;
  expect(
    fullFillCount,
    "Interaction blue must not full-fill several active navigation layers at once"
  ).toBeLessThanOrEqual(1);
}

const COMMAND_BAR_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

async function expectEditingCommandBarActive(page: Page) {
  const commandBar = page.getByTestId("editor-command-bar");
  await expect(commandBar).toHaveCount(1);
  await expect(commandBar).toBeVisible();
  await expect(commandBar).not.toHaveAttribute("aria-hidden", "true");
  expect(await commandBar.evaluate((element) => element.inert)).toBe(false);
  expect(
    await commandBar.evaluate(
      (element, selector) =>
        Array.from(element.querySelectorAll<HTMLElement>(selector)).filter(
          (candidate) => candidate.tabIndex >= 0
        ).length,
      COMMAND_BAR_FOCUSABLE_SELECTOR
    )
  ).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "More", exact: true })).toHaveCount(1);
  await expect(commandBar.getByRole("button", { name: "Save", exact: true })).toHaveCount(1);
}

async function expectClientPreviewCommandBarExcluded(
  page: Page,
  verifyFullInteraction = false
) {
  const commandBar = page.getByTestId("editor-command-bar");
  const exit = page.getByTestId("client-preview-exit");
  await expect(commandBar).toHaveCount(1);
  await expect(commandBar).toHaveAttribute("aria-hidden", "true");
  expect(await commandBar.evaluate((element) => element.inert)).toBe(true);
  await expect(commandBar).toHaveCSS("pointer-events", "none");
  expect(
    await commandBar.evaluate(
      (element, selector) =>
        Array.from(element.querySelectorAll<HTMLElement>(selector)).filter(
          (candidate) =>
            candidate.tabIndex >= 0 &&
            !candidate.closest('[inert], [aria-hidden="true"]')
        ).length,
      COMMAND_BAR_FOCUSABLE_SELECTOR
    )
  ).toBe(0);
  await expect(exit).toHaveCount(1);
  await expect(exit).toBeVisible();
  await expect(exit).toBeEnabled();
  await expect(exit).toBeFocused();
  expect(
    await exit.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        element.isConnected &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight
      );
    })
  ).toBe(true);
  if (!verifyFullInteraction) return;

  await expect(page.getByRole("button", { name: "More", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  const bodySnapshot = await page.locator("body").ariaSnapshot();
  expect(bodySnapshot).toContain("Exit Presentation");
  expect(bodySnapshot).not.toContain('button "More"');
  expect(bodySnapshot).not.toContain('button "Save"');

  await page.keyboard.press("Tab");
  expect(
    await commandBar.evaluate((element) => element.contains(document.activeElement))
  ).toBe(false);
  await page.keyboard.press("Shift+Tab");
  expect(
    await commandBar.evaluate((element) => element.contains(document.activeElement))
  ).toBe(false);
  await exit.focus();

  const hiddenMore = commandBar.getByTestId("editor-command-overflow");
  await hiddenMore.evaluate((element) => element.focus());
  await expect(exit).toBeFocused();
  await hiddenMore.evaluate((element) => element.click());
  await expect(hiddenMore).toHaveAttribute("aria-expanded", "false");
}

async function openClientPreviewFromMore(
  page: Page,
  activation: "keyboard" | "pointer"
) {
  const more = page.getByTestId("editor-command-overflow");
  if (activation === "keyboard") {
    await more.focus();
    await more.press("Enter");
  } else {
    await more.click();
  }
  const preview = page.getByTestId("editor-command-overflow-preview");
  await expect(preview).toBeVisible();
  if (activation === "keyboard") {
    await preview.focus();
    await preview.press("Enter");
  } else {
    await preview.click();
  }
}

async function waitForPreviewPaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

async function expectCabinetPreviewReady(
  renderer: Locator,
  presetId: string,
  view: (typeof CABINET_VIEWS)[number]
) {
  await expect(renderer).toHaveAttribute("data-preview-preset-id", presetId);
  await expect(renderer).toHaveAttribute("data-preview-view", view);
  await expect(renderer).toHaveAttribute("data-preview-ready", "true");
}

async function capturePreview(
  page: Page,
  renderer: Locator,
  path: string
): Promise<Buffer> {
  const bounds = await renderer.boundingBox();
  expect(bounds, "Cabinet Preview must have measurable screenshot bounds").not.toBeNull();
  return page.screenshot({
    path,
    clip: bounds!,
    animations: "disabled",
  });
}

async function expectRenderedScene(screenshot: Buffer, label: string) {
  const metadata = await sharp(screenshot).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  expect(width, `${label} screenshot width`).toBeGreaterThan(100);
  expect(height, `${label} screenshot height`).toBeGreaterThan(100);

  const { data, info } = await sharp(screenshot)
    .extract({
      left: Math.floor(width * 0.1),
      top: Math.floor(height * 0.1),
      width: Math.floor(width * 0.8),
      height: Math.floor(height * 0.8),
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sampleCount = 0;
  let luminanceSum = 0;
  let squaredLuminanceSum = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const luminance =
      data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
    sampleCount += 1;
    luminanceSum += luminance;
    squaredLuminanceSum += luminance * luminance;
  }
  const mean = luminanceSum / sampleCount;
  const standardDeviation = Math.sqrt(
    squaredLuminanceSum / sampleCount - mean * mean
  );
  expect(
    standardDeviation,
    `${label} should contain rendered geometry rather than a blank/flat preview`
  ).toBeGreaterThan(15);
}

async function expectWardrobeFrontFitsViewport(screenshot: Buffer) {
  const metadata = await sharp(screenshot).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const { data, info } = await sharp(screenshot)
    .extract({
      left: Math.floor(width * 0.1),
      top: 0,
      width: Math.floor(width * 0.8),
      height,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cabinetRows: number[] = [];
  for (let y = 0; y < info.height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const luminance =
        data[offset] * 0.2126 +
        data[offset + 1] * 0.7152 +
        data[offset + 2] * 0.0722;
      if (luminance < 60) darkPixels += 1;
    }
    if (darkPixels / info.width > 0.25) cabinetRows.push(y);
  }
  expect(cabinetRows.length, "Wardrobe Front should contain a substantial dark cabinet").toBeGreaterThan(
    info.height * 0.35
  );
  expect(
    cabinetRows[0] / info.height,
    "Wardrobe Front should retain visible space above the cabinet"
  ).toBeGreaterThan(0.035);
  expect(
    cabinetRows.at(-1)! / info.height,
    "Wardrobe Front should retain visible space below the cabinet"
  ).toBeLessThan(0.96);
}

test.describe("Pro visual policy", () => {
  test.use({ viewport: { width: 2048, height: 1200 }, deviceScaleFactor: 1 });

  test("uses the consumer visual theme with a clear Pro mode indicator", async ({
    page,
  }, testInfo) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("editor-command-bar")).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('[data-theme="default"]')).toBeVisible();
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
    await expect(page.getByTestId("pro-mode-indicator")).toHaveAccessibleName("Pro mode active");
    const proTokens = await readThemeTokens(page);
    expect(proTokens.canvas).toBe("#ffffff");
    expect(proTokens.panel).toBe("#ffffff");
    expect(proTokens.primary).toBe("#0b0d12");
    expect(proTokens.accent).toBe("#2f6bff");

    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toHaveAttribute("data-shadow-maps-enabled", "true");
    await expect(sceneCanvas).toHaveAttribute("data-shadow-map-size", "2048");
    await expect(sceneCanvas).toHaveAttribute(
      "data-tone-mapping",
      "aces"
    );
    await expect(sceneCanvas).toHaveAttribute(
      "data-lighting-model",
      "central-environment-sun-ambient"
    );
    await expect(sceneCanvas).toHaveCSS("background-color", "rgb(244, 242, 237)");
    await expect(page.getByTestId("editor-command-bar")).toHaveClass(/bg-white\/95/);
    await expect(page.getByTestId("design-controls-panel").first()).toBeVisible();
    const rightWorkSurface = page
      .locator('[data-testid="room-pan-navigator"], [data-testid="coohom-floor-panel"]')
      .filter({ visible: true })
      .first();
    await expect(rightWorkSurface).toBeVisible();
    await expectRestrainedNavigationAccent(page);
    await page.screenshot({
      path: testInfo.outputPath("whole-home-pro-graphite-light-work-surfaces.png"),
      fullPage: false,
      animations: "disabled",
    });

    await page
      .getByTestId("editor-command-bar")
      .getByRole("button", { name: "2D Plan", exact: true })
      .click();
    await expect(sceneCanvas).toHaveCSS("background-color", "rgb(255, 255, 255)");

    await mockPlan(page, "free");
    await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-theme="default"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pro-mode-indicator")).toHaveCount(0);
    const consumerTokens = await readThemeTokens(page);
    expect(consumerTokens).toEqual(proTokens);
    await expect(page.getByTestId("scene-canvas").first()).toHaveCSS(
      "background-color",
      "rgb(244, 242, 237)"
    );

    await openCustomMillworkStudioFromWorkspace(page, {
      accessLevel: "consumer",
      activation: "pointer",
    });
    const consumerStudio = page.getByTestId("custom-millwork-studio");
    await expect(consumerStudio).toHaveAttribute("data-experience", "guided");
    await expect(page.getByTestId("cabinet-experience-detailed")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(consumerStudio).toHaveCount(0);
    await expect(page.getByTestId("editor-command-workspace")).toBeFocused();
  });

  test("keeps all recommended Cabinet Preview templates readable under the RC-5 policy", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-theme="default"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
    await expect(page.getByTestId("editor-command-bar")).toBeVisible();
    await openCustomMillworkStudioFromWorkspace(page, {
      accessLevel: "pro",
      activation: "pointer",
    });

    const renderer = page
      .locator('[data-cabinet-preview-renderer="rc5"]:visible')
      .first();
    await expect(renderer).toBeVisible();
    await expect(renderer).toHaveAttribute("data-shadow-maps-enabled", "false");
    await expect(renderer).toHaveAttribute("data-front-axis", "negative-z");
    await expect(renderer).toHaveAttribute("data-render-color-space", "srgb");
    await expect(renderer).toHaveAttribute("data-tone-mapping", "aces-filmic");

    for (const template of RECOMMENDED_CABINET_TEMPLATES) {
      await page.getByTestId(`cabinet-preset-${template}`).click();
      await expect(renderer).toBeVisible();
      await expectCabinetPreviewReady(renderer, template, "perspective");
      await waitForPreviewPaint(page);
      const screenshot = await capturePreview(
        page,
        renderer,
        testInfo.outputPath(`cabinet-${template}-perspective.png`)
      );
      await expectRenderedScene(screenshot, `${template} Perspective`);
    }

    await page.getByTestId("cabinet-preset-wardrobe").click();
    for (const view of CABINET_VIEWS) {
      const viewButton = page
        .locator(`[data-testid="cabinet-preview-view-${view}"]:visible`)
        .first();
      await viewButton.click();
      await expect(viewButton).toHaveAttribute("aria-pressed", "true");
      await expectCabinetPreviewReady(renderer, "wardrobe", view);
      await waitForPreviewPaint(page);
      const screenshot = await capturePreview(
        page,
        renderer,
        testInfo.outputPath(`cabinet-wardrobe-${view}.png`)
      );
      await expectRenderedScene(screenshot, `Wardrobe ${view}`);
      if (view === "front") await expectWardrobeFrontFitsViewport(screenshot);
    }

    const studio = page.getByTestId("custom-millwork-studio");
    await page.getByTestId("cabinetry-studio-close").click();
    await expect(studio).toHaveCount(0);
    await expect(page.getByTestId("editor-command-workspace")).toBeFocused();
    await openCustomMillworkStudioFromWorkspace(page, {
      accessLevel: "pro",
      activation: "keyboard",
    });
    await expect(page.getByTestId("custom-millwork-studio")).toHaveCount(1);
  });

  test("excludes the persistent command bar from Client Preview focus and restores semantic focus", async ({
    page,
  }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
    await dismissBlockingPrompt(page);
    await expectEditingCommandBarActive(page);

    await openClientPreviewFromMore(page, "pointer");
    await expectClientPreviewCommandBarExcluded(page, true);
    await page.getByTestId("client-preview-exit").click();
    await expectEditingCommandBarActive(page);
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();

    await openClientPreviewFromMore(page, "keyboard");
    await expectClientPreviewCommandBarExcluded(page);
    await page.getByTestId("client-preview-exit").press("Enter");
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();

    const save = page.getByTestId("save-design");
    await save.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await page.keyboard.press("p");
    await expectEditingCommandBarActive(page);
    await expect(save).toBeFocused();

    const more = page.getByTestId("editor-command-overflow");
    await more.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await more.evaluate((element) => element.replaceWith(element.cloneNode(true)));
    await page.keyboard.press("p");
    await expectEditingCommandBarActive(page);
    await expect(more).toBeFocused();

    await more.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await page.keyboard.press("p");
    await expect(page.getByTestId("client-preview-exit")).toHaveCount(0);
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await page.getByTestId("editor-command-bar").evaluate((element) =>
      Promise.allSettled(element.getAnimations().map((animation) => animation.finished))
    );
    await expect(page.getByTestId("client-preview-exit")).toBeFocused();
    await page.keyboard.press("p");
    await expect(more).toBeFocused();

    await save.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await save.evaluate((element) => {
      element.disabled = true;
    });
    await page.keyboard.press("p");
    await expect(more).toBeFocused();
    await save.evaluate((element) => {
      element.disabled = false;
    });

    await save.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await save.evaluate((element) => element.remove());
    await page.keyboard.press("p");
    const commandBar = page.getByTestId("editor-command-bar");
    await expect(commandBar).not.toHaveAttribute("aria-hidden", "true");
    expect(await commandBar.evaluate((element) => element.inert)).toBe(false);
    await expect(commandBar).toHaveCSS("pointer-events", "auto");
    await expect(more).toBeFocused();

    await more.focus();
    await page.evaluate(() => {
      document.body.dataset.clientPreviewExitFocusCount = "0";
      document.addEventListener("focusin", (event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.dataset.testid === "client-preview-exit"
        ) {
          const count = Number(
            document.body.dataset.clientPreviewExitFocusCount ?? "0"
          );
          document.body.dataset.clientPreviewExitFocusCount = String(count + 1);
        }
      });
    });
    await page.keyboard.press("P");
    await expect(page.getByTestId("client-preview-exit")).toBeFocused();
    expect(
      await page.evaluate(() =>
        Number(document.body.dataset.clientPreviewExitFocusCount ?? "0")
      )
    ).toBe(1);
    await expectClientPreviewCommandBarExcluded(page);
    await page.keyboard.press("P");
    await expect(more).toBeFocused();
    await expect(page.getByTestId("client-preview-exit")).toHaveCount(0);
    await expect(page.getByTestId("editor-command-bar")).toHaveCount(1);

    await more.focus();
    await page.keyboard.press("P");
    await expectClientPreviewCommandBarExcluded(page);
    await commandBar.evaluate((element) => {
      const animation = element.animate(
        [{ opacity: 0 }, { opacity: 0 }],
        { duration: 30_000 }
      );
      (
        window as typeof window & {
          clientPreviewUnmountAnimation?: Animation;
        }
      ).clientPreviewUnmountAnimation = animation;
    });
    await page.keyboard.press("P");
    await expect(page.getByTestId("client-preview-exit")).toHaveCount(0);
    const pendingAnimationCount = await commandBar.evaluate((element) => {
      const animations = element.getAnimations();
      (
        window as typeof window & {
          clientPreviewUnmountCompletion?: Promise<unknown>;
        }
      ).clientPreviewUnmountCompletion = Promise.allSettled(
        animations.map((animation) => animation.finished)
      );
      return animations.length;
    });
    expect(pendingAnimationCount).toBeGreaterThan(0);
    await commandBar.evaluate((element) => {
      type AppRouter = {
        push: (href: string, options?: { scroll?: boolean }) => void;
        replace: (href: string, options?: { scroll?: boolean }) => void;
      };
      type ReactFiber = {
        memoizedProps?: { value?: unknown };
        return?: ReactFiber | null;
      };
      const fiberKey = Object.getOwnPropertyNames(element).find((key) =>
        key.startsWith("__reactFiber")
      );
      let fiber = fiberKey
        ? ((element as unknown as Record<string, unknown>)[fiberKey] as
            | ReactFiber
            | undefined)
        : undefined;
      let router: AppRouter | null = null;
      while (fiber) {
        const candidate = fiber.memoizedProps?.value;
        if (
          candidate &&
          typeof candidate === "object" &&
          "push" in candidate &&
          typeof candidate.push === "function" &&
          "replace" in candidate &&
          typeof candidate.replace === "function"
        ) {
          router = candidate as AppRouter;
          break;
        }
        fiber = fiber.return ?? undefined;
      }
      if (!router) throw new Error("Mounted App Router was not found");
      (
        window as typeof window & {
          clientPreviewUnmountRealm?: string;
        }
      ).clientPreviewUnmountRealm = "same-window";
      router.push("/auth/error?error=AccessDenied", { scroll: false });
    });
    await expect(page).toHaveURL(/\/auth\/error\?error=AccessDenied$/);
    await expect(commandBar).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              clientPreviewUnmountRealm?: string;
            }
          ).clientPreviewUnmountRealm
      )
    ).toBe("same-window");
    await page.evaluate(async () => {
      const sentinel = document.createElement("button");
      sentinel.id = "editor-command-more-action";
      sentinel.dataset.testid = "client-preview-unmount-focus-sentinel";
      sentinel.style.position = "fixed";
      sentinel.style.inset = "4px auto auto 4px";
      sentinel.textContent = "Unmount focus sentinel";
      const state = window as typeof window & {
        clientPreviewUnmountAnimation?: Animation;
        clientPreviewUnmountCompletion?: Promise<unknown>;
        clientPreviewUnmountFocusCount?: number;
      };
      state.clientPreviewUnmountFocusCount = 0;
      sentinel.addEventListener("focus", () => {
        state.clientPreviewUnmountFocusCount =
          (state.clientPreviewUnmountFocusCount ?? 0) + 1;
      });
      document.body.append(sentinel);
      if (
        !state.clientPreviewUnmountAnimation ||
        !state.clientPreviewUnmountCompletion
      ) {
        throw new Error("Client Preview unmount probe lost its browser state");
      }
      state.clientPreviewUnmountAnimation.cancel();
      await state.clientPreviewUnmountCompletion;
      await Promise.resolve();
    });
    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              clientPreviewUnmountFocusCount?: number;
            }
          ).clientPreviewUnmountFocusCount ?? 0
      )
    ).toBe(0);
    await expect(
      page.getByTestId("client-preview-unmount-focus-sentinel")
    ).not.toBeFocused();
  });

  test("keeps Client Preview responsive, scope-cancelled, and Pro-gated", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPlan(page, "free");
    await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("editor-command-bar")).toBeVisible();
    await dismissBlockingPrompt(page);
    await expect(page.getByTestId("pro-mode-indicator")).toHaveCount(0);
    await page.getByTestId("editor-command-overflow").focus();
    await page.keyboard.press("p");
    await expect(page.getByTestId("client-preview-exit")).toHaveCount(0);
    await expectEditingCommandBarActive(page);

    await mockPlan(page, "pro");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
    const commandBar = page.getByTestId("editor-command-bar");
    const more = page.getByTestId("editor-command-overflow");
    await more.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);

    await page.evaluate(() => {
      document.body.dataset.clientPreviewStaleMoreFocusCount = "0";
      document.addEventListener("focusin", (event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.dataset.testid === "editor-command-overflow"
        ) {
          const count = Number(
            document.body.dataset.clientPreviewStaleMoreFocusCount ?? "0"
          );
          document.body.dataset.clientPreviewStaleMoreFocusCount = String(count + 1);
        }
      });
      window.history.pushState(null, "", "/design?designId=next-project&mode=designer");
    });
    await expect(page).toHaveURL(/designId=next-project/);
    await expect(page.getByTestId("client-preview-exit")).toHaveCount(0);
    await expectEditingCommandBarActive(page);
    await commandBar.evaluate((element) =>
      Promise.allSettled(element.getAnimations().map((animation) => animation.finished))
    );
    expect(
      await page.evaluate(() =>
        Number(document.body.dataset.clientPreviewStaleMoreFocusCount ?? "0")
      )
    ).toBe(0);
    await expect(more).not.toBeFocused();

    await more.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await page.evaluate(() => {
      document.body.dataset.clientPreviewStaleMoreFocusCount = "0";
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "p", bubbles: true })
      );
      window.history.pushState(null, "", "/design?designId=third-project&mode=designer");
    });
    await expect(page).toHaveURL(/designId=third-project/);
    await expect(page.getByTestId("client-preview-exit")).toHaveCount(0);
    await commandBar.evaluate((element) =>
      Promise.allSettled(element.getAnimations().map((animation) => animation.finished))
    );
    expect(
      await page.evaluate(() =>
        Number(document.body.dataset.clientPreviewStaleMoreFocusCount ?? "0")
      )
    ).toBe(0);
    await expect(more).not.toBeFocused();

    await more.focus();
    await page.keyboard.press("p");
    await expectClientPreviewCommandBarExcluded(page);
    await mockPlan(page, "free");
    const planResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/me"
    );
    await page.evaluate(() => {
      window.history.pushState(
        null,
        "",
        "/design?designId=third-project&mode=designer&refresh_plan=1"
      );
    });
    await planResponse;
    await expect(page.getByTestId("client-preview-exit")).toHaveCount(0);
    await expect(page.getByTestId("pro-mode-indicator")).toHaveCount(0);
    await expectEditingCommandBarActive(page);
  });

  test("uses the same Client Preview focus contract from presentation export", async ({
    page,
  }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
    await dismissBlockingPrompt(page);

    const workspace = page.getByTestId("editor-command-workspace");
    await workspace.focus();
    await workspace.press("Enter");
    await page.getByTestId("editor-workflow-export").click();
    const dialog = page.getByRole("dialog", { name: "Present & Export" });
    await expect(dialog).toBeVisible();
    const exportImages = dialog.getByRole("button", { name: /Export Images/ });
    await expect(exportImages).toBeEnabled();
    await page.evaluate(() => {
      document.body.dataset.clientPreviewConcealmentObserved = "false";
      document.body.dataset.clientPreviewExitFocusObserved = "false";
      const commandBar = document.querySelector('[data-testid="editor-command-bar"]');
      const observer = new MutationObserver(() => {
        if (commandBar?.getAttribute("aria-hidden") === "true") {
          document.body.dataset.clientPreviewConcealmentObserved = "true";
        }
      });
      if (commandBar) observer.observe(commandBar, { attributes: true });
      document.addEventListener("focusin", (event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.dataset.testid === "client-preview-exit"
        ) {
          document.body.dataset.clientPreviewExitFocusObserved = "true";
        }
      });
    });
    await exportImages.click();
    await expect(dialog).toHaveCount(0);
    await page.waitForFunction(() => {
      const commandBar = document.querySelector('[data-testid="editor-command-bar"]');
      return (
        document.body.dataset.clientPreviewConcealmentObserved === "true" &&
        document.body.dataset.clientPreviewExitFocusObserved === "true" &&
        commandBar?.getAttribute("aria-hidden") !== "true"
      );
    });
    expect(
      await page.evaluate(
        () => document.body.dataset.clientPreviewConcealmentObserved
      )
    ).toBe("true");
    expect(
      await page.evaluate(
        () => document.body.dataset.clientPreviewExitFocusObserved
      )
    ).toBe("true");
    await expectEditingCommandBarActive(page);
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();
  });
});
