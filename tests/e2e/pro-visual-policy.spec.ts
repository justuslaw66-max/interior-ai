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
});
