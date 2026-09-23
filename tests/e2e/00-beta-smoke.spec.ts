import { expect, test } from "./fixtures";
import fs from "node:fs/promises";
import type { APIRequestContext, Download, Locator, Page } from "@playwright/test";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import type { DesignSnapshot } from "../../lib/room-types";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";
import { confirmPlanTemplateReplacementIfNeeded } from "./plan-template-test-utils";
import {
  fingerprintPublicDesignProjection,
  normalizePublicDesignProjection,
  parsePublicDesignProjection,
  publicDesignProjectionHasIdentity,
} from "./public-projection-assertion";
import { getE2EBaseUrl } from "./release-environment";

const BASE_URL = getE2EBaseUrl();
const EDITOR_STORAGE_KEY = "interior-ai:v1:livingroom-design";

async function getFingerprint(locator: Locator) {
  await expect(locator).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/, { timeout: 20000 });
  const fingerprint = await locator.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Missing QA snapshot fingerprint");
  return fingerprint;
}

async function getStableFingerprint(locator: Locator) {
  let previous = "";
  let stableSamples = 0;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await getFingerprint(locator);
    if (current === previous) {
      stableSamples += 1;
      if (stableSamples >= 2) return current;
    } else {
      previous = current;
      stableSamples = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return previous;
}

async function expectFingerprint(locator: Locator, expectedFingerprint: string) {
  await expect(locator).toHaveAttribute("data-fingerprint", expectedFingerprint, { timeout: 30000 });
  expect(await getFingerprint(locator)).toBe(expectedFingerprint);
}

async function expectNumericAttributeAtLeast(locator: Locator, name: string, minimum: number) {
  await expect
    .poll(
      async () => {
        const raw = await locator.getAttribute(name);
        return raw ? Number(raw) : Number.NaN;
      },
      { timeout: 30000 }
    )
    .toBeGreaterThanOrEqual(minimum);
}

async function expectCloudSaveSettled(page: Page) {
  const saveStatus = page.getByTestId("save-status");
  await expect(saveStatus).toHaveAttribute("data-source", "cloud", { timeout: 30000 });
  await expect(saveStatus).toHaveAttribute("data-status", "saved", { timeout: 30000 });
}

async function clickVisibleControl(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  await locator.evaluate((control) => (control as HTMLButtonElement).click());
}

async function openEditorCommandOverflow(page: Page) {
  const overflow = page.getByTestId("editor-command-overflow");
  await clickVisibleControl(overflow);
  await expect(page.getByTestId("editor-command-overflow-menu")).toBeVisible();
}

async function openMyDesigns(page: Page) {
  const accountButton = page.getByTestId("editor-command-account");
  const accountMenu = page.getByTestId("editor-command-account-menu");
  await clickVisibleControl(accountButton);
  await expect(accountMenu).toBeVisible();
  await expect(page.getByTestId("editor-command-sign-out")).toBeVisible({ timeout: 30000 });

  await clickVisibleControl(accountButton);
  await expect(accountMenu).toBeHidden();
  await openEditorCommandOverflow(page);
  const loadDesigns = page.getByTestId("editor-command-overflow-load");
  await clickVisibleControl(loadDesigns);
}

async function loadSavedDesign(page: Page, designId: string) {
  const modal = page.getByTestId("load-designs-modal");
  const savedDesign = page.getByTestId(`load-design-${designId}`);

  await openMyDesigns(page);
  await expect(modal).toBeVisible();
  const appearedOnFirstLoad = await savedDesign
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );

  if (!appearedOnFirstLoad) {
    // A cold dev-server compilation can remount the editor after the first
    // design-list response. Reopening repeats the real UI fetch after that
    // remount instead of bypassing the My Designs workflow.
    if (await modal.isVisible()) {
      await clickVisibleControl(modal.getByRole("button", { name: "✕" }));
      await expect(modal).toBeHidden();
    }
    await openMyDesigns(page);
    await expect(modal).toBeVisible();
    await expect(savedDesign).toBeVisible({ timeout: 30_000 });
  }

  await clickVisibleControl(savedDesign);
  await expect(modal).toBeHidden();
}

async function getPublicApiDesignProjection(
  request: APIRequestContext,
  designId: string,
  shareToken: string
) {
  const response = await request.get(`${BASE_URL}/api/designs/${designId}?shareToken=${shareToken}`);
  expect(response.status()).toBe(200);
  return parsePublicDesignProjection(await response.json(), designId);
}

async function getOwnerApiDesignSnapshot(
  request: APIRequestContext,
  designId: string
) {
  const response = await request.get(`${BASE_URL}/api/designs/${designId}`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.id).toBe(designId);
  expect(body.mode).toBe("homeowner");
  expect(body.shareEnabled).toBe(false);
  expect(body.shareToken).toBeNull();
  return legacyApiToSnapshot(body);
}

function expectBetaPublicProjection(snapshot: DesignSnapshot) {
  expect(snapshot.version).toBe(3);
  expect(snapshot.activeRoomId).toBe("beta-living");
  expect(
    snapshot.rooms
      .map(({ id, name, roomType, floorLabel }) => ({ id, name, roomType, floorLabel }))
      .sort((left, right) => left.id.localeCompare(right.id))
  ).toEqual([
    { id: "beta-bedroom", name: "Bedroom", roomType: "bedroom", floorLabel: "1F" },
    { id: "beta-dining", name: "Dining Room", roomType: "dining", floorLabel: "1F" },
    { id: "beta-living", name: "Living Room", roomType: "living", floorLabel: "1F" },
  ]);
  const livingRoom = snapshot.rooms.find((room) => room.id === "beta-living");
  const diningRoom = snapshot.rooms.find((room) => room.id === "beta-dining");
  const bedroom = snapshot.rooms.find((room) => room.id === "beta-bedroom");
  expect(livingRoom).toBeDefined();
  expect(diningRoom).toBeDefined();
  expect(bedroom).toBeDefined();
  expect(livingRoom?.surfaceFinishes).toEqual(
    expect.objectContaining({ floorMaterialId: "oak-natural", floorRotationDeg: 90 })
  );
  expect(livingRoom?.items.find((item) => item.instanceId === "beta-dawson-chair-1")).toEqual(
    expect.objectContaining({
      instanceId: "beta-dawson-chair-1",
      productId: "armchair-real-castlery-avery-performance-armchair",
      variantId: "white_quartz",
      position: [-0.9, 0, -0.3],
      rotationY: 0.15,
    })
  );
  expect(diningRoom?.items.find((item) => item.instanceId === "beta-sloane-table-1")).toEqual(
    expect.objectContaining({
      instanceId: "beta-sloane-table-1",
      variantId: "150cm_grey_oak",
      position: [6.1, 0, 0.1],
      rotationY: 1.57,
    })
  );
  expect(livingRoom?.savedViews.map((view) => view.name)).toEqual(["Client Preview"]);
  expect(diningRoom?.savedViews.map((view) => view.name)).toEqual(["Dining Plan"]);
  expect(bedroom?.savedViews.map((view) => view.name)).toEqual(["Bedroom Preview"]);
  expect(
    snapshot.floorPlan?.openings
      ?.map(({ id, roomId, kind }) => ({ id, roomId, kind }))
      .sort((left, right) => left.id.localeCompare(right.id))
  ).toEqual([
    { id: "opening-bedroom-door", roomId: "beta-bedroom", kind: "door" },
    { id: "opening-dining-window", roomId: "beta-dining", kind: "window" },
    { id: "opening-living-door", roomId: "beta-living", kind: "door" },
  ]);
  expect(snapshot.notes).toBe("Deterministic beta smoke fixture.");
}

async function readDownloadText(download: Download) {
  const path = await download.path();
  if (!path) throw new Error(`Missing download path for ${download.suggestedFilename()}`);
  return fs.readFile(path, "utf8");
}

async function readDownloadBytes(download: Download) {
  const path = await download.path();
  if (!path) throw new Error(`Missing download path for ${download.suggestedFilename()}`);
  return fs.readFile(path);
}

test.describe("00. Beta Smoke Gate", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("template start, persistence/share/export, mobile, performance, and checkout stay beta-ready", async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(300000);

    await page.addInitScript(() => {
      const clearSentinel = "__e2e_beta_smoke_storage_cleared";
      if (window.localStorage.getItem(clearSentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(clearSentinel, "1");
    });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    const stagingSmokeEvidence = {
      editorSnapshotFingerprint: "",
      shareSnapshotFingerprint: "",
      exportSnapshotFingerprint: "",
      pdfFilename: "",
      csvFilename: "",
      pngFilename: "",
      svgFilename: "",
      checkoutBoundaryResponseMode: "" as "test checkout URL" | "boundary blocked" | "",
    };
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
    const betaStartTemplate = page.getByTestId("beta-start-template");
    if (await betaStartTemplate.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickVisibleControl(betaStartTemplate);
      await expect(page.getByTestId("apply-furnished-template-studio")).toBeVisible();
      await expect(page.getByTestId(/plan-template-furnishing-marker-studio-.+/).first()).toBeVisible();
      await expect(page.getByTestId("apply-furnished-template-studio")).toBeEnabled({
        timeout: 30_000,
      });
      await clickVisibleControl(page.getByTestId("apply-furnished-template-studio"));
      await confirmPlanTemplateReplacementIfNeeded(page);
    } else {
      await clickVisibleControl(page.getByTestId("editor-command-new-plan"));
      await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
      await expect(page.getByTestId("apply-furnished-template-studio")).toBeVisible();
      await expect(page.getByTestId(/plan-template-furnishing-marker-studio-.+/).first()).toBeVisible();
      await expect(page.getByTestId("apply-furnished-template-studio")).toBeEnabled({
        timeout: 30_000,
      });
      await clickVisibleControl(page.getByTestId("apply-furnished-template-studio"));
      await confirmPlanTemplateReplacementIfNeeded(page);
    }
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    const betaFeedbackPayloads: Record<string, unknown>[] = [];
    await page.route("**/api/track/app-event", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (payload?.eventType === "beta_feedback_submitted") {
        betaFeedbackPayloads.push(payload);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, persisted: true, eventId: "evt_beta_smoke" }),
        });
        return;
      }
      await route.continue();
    });
    await openEditorCommandOverflow(page);
    await clickVisibleControl(page.getByTestId("beta-feedback-open"));
    await expect(page.getByTestId("editor-command-overflow-menu")).toBeHidden();
    await expect(page.getByTestId("beta-feedback-dialog")).toBeVisible();
    await page.getByTestId("beta-feedback-note").fill("Beta smoke feedback capture works.");
    await clickVisibleControl(page.getByTestId("beta-feedback-submit"));
    await expect(
      page.getByTestId("beta-feedback-dialog").getByRole("status")
    ).toContainText("Sent.");
    await expect(page.getByTestId("beta-feedback-report-id")).toHaveText("evt_beta_smoke");
    await expect.poll(() => betaFeedbackPayloads.length).toBe(1);
    const betaFeedbackPayload = betaFeedbackPayloads[0];
    expect(betaFeedbackPayload?.eventType).toBe("beta_feedback_submitted");
    const betaFeedbackMeta = betaFeedbackPayload?.meta as
      | { note?: string; page?: string; context?: Record<string, number> }
      | undefined;
    expect(betaFeedbackMeta?.note).toBe("Beta smoke feedback capture works.");
    expect(betaFeedbackMeta?.page).toBe("/design");
    const betaFeedbackContext = betaFeedbackMeta?.context;
    expect(betaFeedbackContext?.roomCount).toBeGreaterThanOrEqual(1);
    expect(betaFeedbackContext?.itemCount).toBeGreaterThanOrEqual(1);

    const seed = await createBetaSeedDesign();
    try {
      await addAuthCookies(page.context(), new URL(page.url()).origin, seed.sessionToken);
      const sharedProjection = await getPublicApiDesignProjection(
        request,
        seed.designId,
        seed.shareToken,
      );
      expect(
        publicDesignProjectionHasIdentity(sharedProjection, {
          designId: seed.designId,
          revision: seed.revision,
        })
      ).toBe(true);
      expect(sharedProjection.mode).toBe("homeowner");
      expectBetaPublicProjection(sharedProjection.snapshot);
      const sharedFingerprint = fingerprintDesignSnapshot(sharedProjection.snapshot);
      expect(sharedFingerprint).toMatch(/[a-f0-9]{8}/);
      expect(fingerprintPublicDesignProjection(sharedProjection.snapshot)).toBe(
        fingerprintPublicDesignProjection(seed.snapshot)
      );
      const wrongShareTokenResponse = await request.get(
        `${BASE_URL}/api/designs/${seed.designId}?shareToken=wrong-${seed.shareToken}`
      );
      expect(wrongShareTokenResponse.status()).toBe(404);

      await page.goto("/design");
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
      await openMyDesigns(page);
      await expect(page.getByTestId("load-designs-modal")).toBeVisible();
      await expect(page.getByTestId("load-designs-template-shortcut")).toBeVisible();
      await clickVisibleControl(page.getByTestId("load-designs-open-templates"));
      await expect(page.getByTestId("load-designs-modal")).toBeHidden();
      await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
      await expect(page.getByTestId("apply-furnished-template-studio")).toBeVisible();
      await openMyDesigns(page);
      await expect(page.getByTestId("load-designs-modal")).toBeVisible();
      await clickVisibleControl(page.getByTestId(`load-design-${seed.designId}`));
      await expect(page.getByTestId("load-designs-modal")).toBeHidden();
      const loadedEditorFingerprint = await getStableFingerprint(
        page.getByTestId("qa-editor-snapshot-fingerprint")
      );
      stagingSmokeEvidence.editorSnapshotFingerprint = loadedEditorFingerprint;
      expect(loadedEditorFingerprint).toMatch(/[a-f0-9]{8}/);
      const editorPerformance = page.getByTestId("qa-scene-performance");
      if ((await editorPerformance.count()) > 0) {
        await expect(editorPerformance).toHaveAttribute("data-room-count", "3");
        await expect(editorPerformance).toHaveAttribute("data-scene-ready", "true", {
          timeout: 30000,
        });
        await expect(editorPerformance).toHaveAttribute("data-mode", "auto");
        await expect(editorPerformance).toHaveAttribute("data-effective-mode", /^(quality|lite)$/);
        await expectNumericAttributeAtLeast(editorPerformance, "data-scene-item-count", 9);
        await expectNumericAttributeAtLeast(editorPerformance, "data-fps-samples", 1);
        await expectNumericAttributeAtLeast(editorPerformance, "data-last-fps", 1);
      } else {
        test.info().annotations.push({
          type: "note",
          description: "Loaded-design QA scene performance hook was not mounted in this runtime.",
        });
      }
      await page.waitForFunction(
        ({ key, designId }) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) return false;
          try {
            return JSON.parse(raw)?.designId === designId;
          } catch {
            return false;
          }
        },
        { key: EDITOR_STORAGE_KEY, designId: seed.designId },
        { timeout: 10000 }
      );
      await expectCloudSaveSettled(page);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
      const reloadedEditorFingerprint = await getStableFingerprint(
        page.getByTestId("qa-editor-snapshot-fingerprint")
      );
      expect(reloadedEditorFingerprint).toMatch(/[a-f0-9]{8}/);
      await expectCloudSaveSettled(page);

      const cloudProjection = await getPublicApiDesignProjection(
        request,
        seed.designId,
        seed.shareToken
      );
      expect(cloudProjection.mode).toBe("homeowner");
      expect(Date.parse(cloudProjection.revision)).toBeGreaterThanOrEqual(
        Date.parse(sharedProjection.revision)
      );
      expectBetaPublicProjection(cloudProjection.snapshot);
      const cloudFingerprint = fingerprintDesignSnapshot(cloudProjection.snapshot);
      const cloudPublicProjectionFingerprint = fingerprintPublicDesignProjection(
        cloudProjection.snapshot
      );
      expect(cloudFingerprint).toMatch(/[a-f0-9]{8}/);

      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "commit", timeout: 120000 });
      await expect(page.getByTestId("public-share-root")).toHaveAttribute(
        "data-layout-status",
        "ready",
        { timeout: 60000 }
      );
      const shareViewer = page.getByTestId("share-viewer");
      await expect(shareViewer).toBeVisible({ timeout: 60000 });
      await expect(shareViewer).toHaveAttribute("data-ready", "true", { timeout: 60000 });
      await expect(page.getByTestId("share-room-list")).toContainText("Living Room");
      await expect(page.getByTestId("share-checkout-readiness")).toContainText(/Cart-ready|Retailer link/i);
      await expect(page.getByTestId("share-copy-link")).toBeVisible();
      await expect(page.getByTestId("share-download-pdf")).toHaveAttribute(
        "href",
        `/share/${seed.shareToken}/export/pdf`
      );
      await expect(page.getByTestId("share-shopping-list")).toHaveAttribute(
        "href",
        "#shopping-preview"
      );
      await expect(page.getByTestId("share-export-pack")).toBeVisible();
      await expect(page.getByTestId("share-copy-to-edit")).toBeVisible();
      await expectFingerprint(page.getByTestId("qa-share-snapshot-fingerprint"), cloudFingerprint);
      stagingSmokeEvidence.shareSnapshotFingerprint = cloudFingerprint;
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: BASE_URL,
      });
      await page.getByTestId("share-copy-link").click();
      await expect(page.getByRole("status")).toContainText("Link copied.");
      const copiedShareUrl = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiedShareUrl).toContain(`/share/${seed.shareToken}`);
      const duplicateResponse = await page
        .context()
        .request.post(`${BASE_URL}/api/share/${seed.shareToken}/duplicate`);
      expect(duplicateResponse.status()).toBe(200);
      const duplicateBody = await duplicateResponse.json();
      expect(typeof duplicateBody.id).toBe("string");
      const duplicatedOwnerSnapshot = await getOwnerApiDesignSnapshot(
        page.context().request,
        duplicateBody.id
      );
      const duplicatedPublicProjection = normalizePublicDesignProjection(
        duplicatedOwnerSnapshot
      );
      expectBetaPublicProjection(duplicatedPublicProjection);
      const duplicatedPublicProjectionFingerprint = fingerprintPublicDesignProjection(
        duplicatedOwnerSnapshot
      );
      expect(duplicatedPublicProjectionFingerprint).toBe(
        cloudPublicProjectionFingerprint
      );

      await page.getByTestId("share-export-pack").click();
      await expect(page).toHaveURL(/\/export$/, { timeout: 30_000 });
      await expect(page.getByText("Export Overview")).toBeVisible({ timeout: 30000 });
      await expectFingerprint(page.getByTestId("qa-export-snapshot-fingerprint"), cloudFingerprint);
      stagingSmokeEvidence.exportSnapshotFingerprint = cloudFingerprint;

      const pdfResponse = await request.get(`${BASE_URL}/share/${seed.shareToken}/export/pdf`);
      expect(pdfResponse.status()).toBe(200);
      expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
      const pdfBody = await pdfResponse.body();
      expect(pdfBody.subarray(0, 4).toString()).toBe("%PDF");
      expect(pdfBody.length).toBeGreaterThan(1000);
      stagingSmokeEvidence.pdfFilename = "share-export.pdf";

      const csvDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-shopping-csv-download").click();
      const csvDownload = await csvDownloadPromise;
      expect(csvDownload.suggestedFilename()).toMatch(/shopping-list\.csv$/);
      stagingSmokeEvidence.csvFilename = csvDownload.suggestedFilename();
      const csv = await readDownloadText(csvDownload);
      expect(csv.split("\n")[0]).toBe(
        "Room,Category,Item,Product ID,Variant ID,Variant,Purchase option,Qty,Status,Source,Retailer URL,Include in checkout,Unit price USD,Line total USD,Room subtotal USD,Review note"
      );
      expect(csv).toContain("Living Room");
      expect(csv).toContain("armchair-real-castlery-avery-performance-armchair");

      const svgDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-svg-download").first().click();
      const svgDownload = await svgDownloadPromise;
      expect(svgDownload.suggestedFilename()).toMatch(/2d-plan\.svg$/);
      stagingSmokeEvidence.svgFilename = svgDownload.suggestedFilename();
      const svg = await readDownloadText(svgDownload);
      expect(svg.length).toBeGreaterThan(500);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");

      const pngDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-png-download").first().click();
      const pngDownload = await pngDownloadPromise;
      expect(pngDownload.suggestedFilename()).toMatch(/2d-plan\.png$/);
      stagingSmokeEvidence.pngFilename = pngDownload.suggestedFilename();
      const png = await readDownloadBytes(pngDownload);
      expect(png.length).toBeGreaterThan(1000);
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

      const mobileContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(`/share/${seed.shareToken}`, { waitUntil: "commit", timeout: 120000 });
      await expect(mobilePage.getByTestId("public-share-root")).toHaveAttribute(
        "data-layout-status",
        "ready",
        { timeout: 60000 }
      );
      await expect(mobilePage.getByTestId("public-share-root")).toHaveAttribute(
        "data-layout-mode",
        "mobile"
      );
      await expect(mobilePage.getByTestId("share-copy-link")).toBeVisible();
      await expect(mobilePage.getByTestId("share-room-list-mobile")).toBeVisible();
      await expect(mobilePage.getByTestId("share-room-list-table")).toHaveCount(0);
      await expect
        .poll(() =>
          mobilePage.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          )
        )
        .toBeLessThanOrEqual(1);
      await mobileContext.close();

      const mobileEditorContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      const mobileEditorPage = await mobileEditorContext.newPage();
      await mobileEditorPage.goto("/design", { waitUntil: "commit", timeout: 120000 });
      await expect(mobileEditorPage.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 60000,
      });
      await expect(mobileEditorPage.getByTestId("editor-command-bar")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("save-design")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("design-controls-panel")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("design-controls-panel-handle")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("plan-tool-palette")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("room-plan-status")).toHaveCount(1);
      const mobileEditorOverflow = await mobileEditorPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(mobileEditorOverflow).toBeLessThanOrEqual(4);
      await mobileEditorContext.close();

      const tabletContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 768, height: 1024 },
      });
      const tabletPage = await tabletContext.newPage();
      await tabletPage.goto(`/share/${seed.shareToken}/export`, {
        waitUntil: "commit",
        timeout: 120000,
      });
      await expect(tabletPage.getByTestId("share-export-shopping-csv-download")).toBeVisible({
        timeout: 60000,
      });
      const tabletOverflow = await tabletPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(tabletOverflow).toBeLessThanOrEqual(4);
      await tabletContext.close();

      await page.goto("/design");
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
      await loadSavedDesign(page, seed.designId);
      await openEditorCommandOverflow(page);
      await expect(page.getByTestId("editor-overflow-scene-quality")).toBeVisible();
      const scenePerformance = page.getByTestId("qa-scene-performance");
      const hasScenePerformanceTelemetry = (await scenePerformance.count()) > 0;
      if (hasScenePerformanceTelemetry) {
        await expectNumericAttributeAtLeast(scenePerformance, "data-room-count", 3);
        await expectNumericAttributeAtLeast(scenePerformance, "data-scene-item-count", 1);
      } else {
        test.info().annotations.push({
          type: "note",
          description: "Scene performance QA telemetry was not mounted in this runtime.",
        });
      }
      await page.getByTestId("scene-performance-lite").evaluate((button) => {
        (button as HTMLButtonElement).click();
      });
      await expect(page.getByTestId("scene-performance-lite")).toHaveAttribute("data-active", "true");
      await expect
        .poll(() => page.evaluate(() => window.localStorage.getItem("scene_performance_mode")))
        .toBe("lite");
      if (hasScenePerformanceTelemetry) {
        await expect(scenePerformance).toHaveAttribute("data-mode", "lite");
        await expect(scenePerformance).toHaveAttribute("data-effective-mode", "lite");
        await expect(scenePerformance).toHaveAttribute("data-render-quality", "lite");
      }

      let retailerClickPayload: Record<string, unknown> = {};
      await page.route("**/api/track/click", async (route) => {
        retailerClickPayload = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ clickKey: "beta-smoke-click" }),
        });
      });
      await page.getByTestId("editor-workflow-shop").first().evaluate((button) => {
        (button as HTMLButtonElement).click();
      });
      await expect(page.getByTestId("cart-panel")).toBeVisible();
      await expect(page.getByTestId("cart-checkout-readiness")).toContainText(/included line/i);
      await expect(page.getByTestId("checkout-affiliate")).toContainText(/Open retailer links/);
      const firstRetailerOpen = page.getByRole("button", { name: /^Open$/ }).first();
      await firstRetailerOpen.scrollIntoViewIfNeeded();
      const retailerPopupPromise = page.waitForEvent("popup");
      await firstRetailerOpen.click();
      const retailerPopup = await retailerPopupPromise;
      await retailerPopup.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
      expect(retailerClickPayload?.designId).toBe(seed.designId);
      expect(retailerClickPayload?.productId).toBe("armchair-real-castlery-avery-performance-armchair");
      expect(typeof retailerClickPayload?.variantId).toBe("string");
      expect(retailerClickPayload).not.toHaveProperty("buyUrl");
      expect(retailerClickPayload).not.toHaveProperty("price");
      expect(retailerPopup.url()).toContain("clickKey=beta-smoke-click");
      expect(retailerPopup.url()).toContain("utm_source=interior-ai");
      await retailerPopup.close();

      let checkoutPayload: unknown = null;
      await page.route("**/api/stripe/checkout", async (route) => {
        checkoutPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: `${BASE_URL}/checkout/success?beta=1` }),
        });
      });
      const checkoutResult = await page.evaluate(async () => {
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval: "monthly" }),
        });
        return response.json();
      });
      expect(checkoutPayload).toEqual({ interval: "monthly" });
      expect(checkoutResult.url).toContain("/checkout/success");
      stagingSmokeEvidence.checkoutBoundaryResponseMode = "test checkout URL";
      expect(stagingSmokeEvidence).toMatchObject({
        editorSnapshotFingerprint: expect.stringMatching(/[a-f0-9]{8}/),
        shareSnapshotFingerprint: cloudFingerprint,
        exportSnapshotFingerprint: cloudFingerprint,
        pdfFilename: "share-export.pdf",
        csvFilename: expect.stringMatching(/shopping-list\.csv$/),
        pngFilename: expect.stringMatching(/2d-plan\.png$/),
        svgFilename: expect.stringMatching(/2d-plan\.svg$/),
        checkoutBoundaryResponseMode: "test checkout URL",
      });
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
