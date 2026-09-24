import { expect, test, type Page } from "@playwright/test";
import { waitForEditorHydration } from "./variant-test-utils";

// The command bar's Share button (audit finding SX1): guests are asked to sign in, and a
// signed-in user's new design is saved before its link is created and copied.

const DESIGN_ID = "command-bar-share-design";
const SHARE_TOKEN = "command-bar-share-token";
const SHARE_URL = `http://127.0.0.1:3000/share/${SHARE_TOKEN}`;

type ClipboardMode = "success" | "denied";

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
          user: { id: "command-bar-share-user", name: "Share user", email: "share@example.test" },
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
  await waitForEditorHydration(page);
  const share = page.getByTestId("editor-command-share");
  await expect(share).toBeVisible();
  await expect(share).toHaveAccessibleName("Share");
  return share;
}

// My designs only shows in More once the session has loaded, so it marks a signed-in editor.
async function waitForSignedIn(page: Page) {
  await page.getByTestId("editor-command-overflow").click();
  await expect(page.getByTestId("editor-command-overflow-load")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("editor-command-overflow-menu")).toHaveCount(0);
}

function designPayload() {
  return {
    id: DESIGN_ID,
    title: "Command bar share",
    roomWidth: 4,
    roomDepth: 4,
    items: [],
    zones: [],
    savedViews: [],
    style: "Modern",
    budget: "mid",
    mode: "homeowner",
    notes: "",
    shareToken: null,
    shareEnabled: false,
    updatedAt: "2026-09-24T00:00:00.000Z",
  };
}

// Records the order of cloud requests: the new design's save, then its share link.
async function mockCloudDesign(page: Page) {
  const requests: string[] = [];
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/designs", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    requests.push("create");
    return route.fulfill(json(designPayload()));
  });
  await page.route(`**/api/designs/${DESIGN_ID}`, (route) => route.fulfill(json(designPayload())));
  await page.route(`**/api/designs/${DESIGN_ID}/share`, (route) => {
    requests.push("share");
    return route.fulfill(json({ shareToken: SHARE_TOKEN, shareEnabled: true }));
  });
  return requests;
}

async function installClipboard(page: Page, mode: ClipboardMode) {
  await page.addInitScript((clipboardMode: ClipboardMode) => {
    const writes: string[] = [];
    (window as typeof window & { commandBarShareWrites?: string[] }).commandBarShareWrites = writes;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({
        writeText(value: string) {
          writes.push(value);
          return clipboardMode === "success"
            ? Promise.resolve()
            : Promise.reject(new DOMException("Clipboard permission denied", "NotAllowedError"));
        },
      }),
    });
  }, mode);
}

const clipboardWrites = (page: Page) =>
  page.evaluate(() => (window as typeof window & { commandBarShareWrites?: string[] }).commandBarShareWrites ?? []);

test.describe("command bar Share", () => {
  test("asks guests to sign in and returns focus to Share", async ({ page }) => {
    const share = await openEditor(page, false);
    // Sign in shows once the session is known to be empty.
    await expect(page.getByTestId("editor-command-sign-in")).toBeVisible({ timeout: 20_000 });
    await share.click();

    const prompt = page.getByRole("dialog", { name: "Sign in to share this design" });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("Share links need an account.");
    await prompt.getByTestId("guest-save-prompt-not-now").click();
    await expect(prompt).toHaveCount(0);
    await expect(share).toBeFocused();
  });

  test("saves a new design first, then copies its link", async ({ page }) => {
    const requests = await mockCloudDesign(page);
    await installClipboard(page, "success");
    const share = await openEditor(page, true);
    await waitForSignedIn(page);
    await share.click();

    await expect.poll(() => requests).toEqual(["create", "share"]);
    await expect.poll(() => clipboardWrites(page)).toEqual([SHARE_URL]);
    await expect(page.getByTestId("share-fallback-modal")).toHaveCount(0);
    await expect(share).not.toHaveAttribute("aria-busy", "true");
  });

  test("offers the link in a dialog when the clipboard refuses, then returns focus to Share", async ({ page }) => {
    const requests = await mockCloudDesign(page);
    await installClipboard(page, "denied");
    const share = await openEditor(page, true);
    await waitForSignedIn(page);
    await share.focus();
    await page.keyboard.press("Enter");

    const fallback = page.getByRole("dialog", { name: "Share Link" });
    await expect(fallback).toBeVisible();
    await expect(fallback.getByTestId("share-url-input")).toHaveValue(SHARE_URL);
    expect(requests).toEqual(["create", "share"]);
    await fallback.getByTestId("share-done-button").click();
    await expect(fallback).toHaveCount(0);
    await expect(share).toBeFocused();
  });
});
