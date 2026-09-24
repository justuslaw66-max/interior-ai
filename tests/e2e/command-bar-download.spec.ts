import { expect, test, type Page } from "@playwright/test";
import {
  addCatalogCardItemToRoom,
  fillCatalogSearch,
  waitForCatalogReady,
} from "./variant-test-utils";

// The command bar's Download (audit findings SX2 and PR6): pictures for everyone, a PDF with the
// shopping list once signed in, and the Free limits stated before the download instead of in an
// upgrade pop-up after every export.

const PHONE_VIEWPORT = { width: 390, height: 844 };

async function openEditor(page: Page, signedIn: boolean) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "free", source: "playwright" }),
    }),
  );
  if (signedIn) {
    await page.route(/\/api\/auth\/session(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "command-bar-download-user", name: "Download user", email: "download@example.test" },
          expires: "2099-01-01T00:00:00.000Z",
        }),
      }),
    );
  }
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
}

// My designs only shows in More once the session has loaded, so it marks a signed-in editor.
async function waitForSignedIn(page: Page) {
  await page.getByTestId("editor-command-overflow").click();
  await expect(page.getByTestId("editor-command-overflow-load")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("editor-command-overflow-menu")).toHaveCount(0);
}

async function openDownload(page: Page) {
  const download = page.getByTestId("editor-command-download");
  await expect(download).toHaveAccessibleName("Download");
  await download.click();
  const dialog = page.getByRole("dialog", { name: "Download" });
  await expect(dialog).toBeVisible();
  return { download, dialog };
}

async function exportImagesFromPresentExport(page: Page) {
  await page.getByTestId("editor-command-overflow").click();
  await page.getByTestId("editor-workflow-export").click();
  const present = page.getByRole("dialog", { name: "Present & Export" });
  const images = present.getByRole("button", { name: /Export Images/ });
  await expect(images).toBeEnabled({ timeout: 30_000 });
  const file = page.waitForEvent("download");
  await images.click();
  await file;
}

test.describe("command bar Download", () => {
  test("guests read the Free limits, download pictures, and get focus back on Download", async ({ page }) => {
    await openEditor(page, false);
    const { download, dialog } = await openDownload(page);
    await expect(dialog.getByTestId("download-free-note")).toContainText("one view with an Interior AI watermark");
    await expect(dialog.getByTestId("download-pdf-sign-in")).toHaveText("Sign in to download a PDF");

    const pictures = dialog.getByTestId("download-images");
    await expect(pictures).toBeEnabled({ timeout: 30_000 });
    const file = page.waitForEvent("download");
    await pictures.click();
    expect((await file).suggestedFilename()).toBe("room-consumer-hero.png");
    await expect(dialog).toHaveCount(0);
    await expect(download).toBeFocused();
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
  });

  test("phones open Download from More and get focus back on More", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await openEditor(page, false);
    await expect(page.getByTestId("editor-command-download")).toBeHidden();

    const more = page.getByTestId("editor-command-overflow");
    await more.click();
    await page.getByTestId("editor-command-overflow-download").click();
    const dialog = page.getByRole("dialog", { name: "Download" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test("signed-in Free users download a PDF of the products they placed", async ({ page }) => {
    test.setTimeout(120_000);
    const pdfRequests: Array<{ requestedTier?: string; images?: unknown[]; items?: unknown[] }> = [];
    await page.route("**/api/export/pdf", (route) => {
      pdfRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF\n" });
    });
    await openEditor(page, true);
    await waitForSignedIn(page);
    await expect.poll(() => waitForCatalogReady(page), { timeout: 45_000 }).toBeTruthy();
    await expect.poll(() => fillCatalogSearch(page, "Dawson 3 Seater"), { timeout: 45_000 }).toBeTruthy();
    await addCatalogCardItemToRoom(page, "sofa-real-castlery-dawson-3s");

    const { download, dialog } = await openDownload(page);
    const pdf = dialog.getByTestId("download-pdf");
    await expect(pdf).toBeEnabled({ timeout: 30_000 });
    const file = page.waitForEvent("download");
    await pdf.click();
    expect((await file).suggestedFilename()).toMatch(/^room-design-\d+\.pdf$/);
    expect(pdfRequests).toHaveLength(1);
    expect(pdfRequests[0].requestedTier).toBe("free");
    expect(pdfRequests[0].images).toHaveLength(1);
    expect(pdfRequests[0].items).toEqual([expect.objectContaining({ name: expect.stringContaining("Dawson") })]);
    await expect(dialog).toHaveCount(0);
    await expect(download).toBeFocused();
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
  });

  test("Present & export asks Free users to upgrade once a session, not after every export", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page, false);
    await exportImagesFromPresentExport(page);
    const upgrade = page.getByTestId("upgrade-dialog");
    await expect(upgrade).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(upgrade).toHaveCount(0);

    await exportImagesFromPresentExport(page);
    // The prompt would open in the same task as the download, so give it a moment to show.
    await page.waitForTimeout(750);
    await expect(upgrade).toHaveCount(0);
  });
});
