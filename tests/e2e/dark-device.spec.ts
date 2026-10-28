import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { cleanupBetaSeed, createBetaSeedDesign, disconnectBetaPrismaClient } from "./beta-seed";
import { waitForEditorHydration } from "./variant-test-utils";

// Dark mode follows the device (J, 22 Oct; the switch, #228). These tests run as a dark device:
// nothing sets data-color-scheme, only the device's setting changes, as Playwright reports it to
// the page. The other browser tests run as a light device, Playwright's default.
test.use({ colorScheme: "dark" });

const BLACK = "rgb(0, 0, 0)";
const CANVAS_CARD_DARK = "rgb(28, 28, 30)";
// The 3D view's light background (#F4F2ED), which exports keep from a dark page (dark mode PR 4).
const EXPORT_BACKGROUND_LIGHT = "rgb(244, 242, 237)";

async function documentScheme(page: Page) {
  return page.evaluate(() => ({
    attribute: document.documentElement.getAttribute("data-color-scheme"),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    body: getComputedStyle(document.body).backgroundColor,
  }));
}

// The colours a held-light root draws with: its scheme, background and text.
async function heldLightColours(page: Page, selector: string) {
  const root = page.locator(selector).first();
  await expect(root).toBeVisible({ timeout: 30_000 });
  return root.evaluate((element) => {
    const style = getComputedStyle(element);
    return { colorScheme: style.colorScheme, background: style.backgroundColor, color: style.color };
  });
}

async function openEditor(page: Page) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "free", source: "playwright" }),
    }),
  );
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  await waitForEditorHydration(page);
}

// The top-left pixel of a downloaded PNG, read by the page's own image decoder.
async function cornerColour(page: Page, png: Buffer) {
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context to read the picture");
    context.drawImage(image, 0, 0);
    const [red, green, blue] = context.getImageData(4, 4, 1, 1).data;
    return `rgb(${red}, ${green}, ${blue})`;
  }, `data:image/png;base64,${png.toString("base64")}`);
}

test.describe("a dark device", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("gets the dark editor, and the pictures it downloads stay light", async ({ page }, testInfo) => {
    await openEditor(page);
    expect(await documentScheme(page)).toEqual({ attribute: null, colorScheme: "dark", body: BLACK });
    await expect(page.getByTestId("scene-canvas").first()).toHaveCSS("background-color", CANVAS_CARD_DARK);

    await page.getByTestId("editor-command-download").click();
    const dialog = page.getByRole("dialog", { name: "Download" });
    await expect(dialog).toBeVisible();
    const pictures = dialog.getByTestId("download-images");
    await expect(pictures).toBeEnabled({ timeout: 60_000 });
    const file = page.waitForEvent("download");
    await pictures.click();
    const download = await file;
    expect(download.suggestedFilename()).toBe("room-consumer-hero.png");
    const picturePath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(picturePath);
    expect(await cornerColour(page, await readFile(picturePath))).toBe(EXPORT_BACKGROUND_LIGHT);
  });

  test("keeps Admin and the export page light", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    expect((await documentScheme(page)).colorScheme).toBe("dark");
    // Admin's own colours (operations-dashboard.module.css): #F4F3EE behind, #1C211F words.
    expect(await heldLightColours(page, '[data-color-scheme="light"]')).toEqual({
      colorScheme: "light",
      background: "rgb(244, 243, 238)",
      color: "rgb(28, 33, 31)",
    });

    const seed = await createBetaSeedDesign();
    try {
      const response = await page.goto(`/share/${seed.shareToken}/export`, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      expect((await documentScheme(page)).colorScheme).toBe("dark");
      // The export page and its PDF stay light (plan decision 6), its words dark (#0B0D12).
      expect(await heldLightColours(page, 'main[data-color-scheme="light"]')).toEqual({
        colorScheme: "light",
        background: "rgb(255, 255, 255)",
        color: "rgb(11, 13, 18)",
      });
    } finally {
      await cleanupBetaSeed(seed);
    }
  });
});
