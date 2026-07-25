import { expect, test } from "./fixtures";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import type { APIRequestContext, Download, Locator, Page } from "@playwright/test";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";
import { confirmPlanTemplateReplacementIfNeeded } from "./plan-template-test-utils";
import { getE2EBaseUrl } from "./release-environment";

const BASE_URL = getE2EBaseUrl();
const ADMIN_EMAIL =
  process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() ||
  process.env.ADMIN_EMAILS?.split(",")[0]?.trim() ||
  "gate-a3-admin@example.test";

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

async function openMyDesigns(page: Page) {
  const accountButton = page.getByTestId("editor-command-account");
  const accountMenu = page.getByTestId("editor-command-account-menu");
  await accountButton.click();
  await expect(accountMenu).toBeVisible();
  await expect(page.getByTestId("editor-command-sign-out")).toBeVisible({ timeout: 30000 });
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeHidden();

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const button = document.querySelector<HTMLButtonElement>(
            '[data-testid="editor-command-overflow"]',
          );
          if (!button) return false;
          button.click();
          return true;
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(page.getByTestId("editor-command-overflow-menu")).toBeVisible();
  const loadDesigns = page.getByTestId("editor-command-overflow-load");
  await expect(loadDesigns).toBeVisible();
  await loadDesigns.click();
}

async function expectFingerprint(locator: Locator, expectedFingerprint: string) {
  await expect(locator).toHaveAttribute("data-fingerprint", expectedFingerprint, { timeout: 30000 });
  expect(await getFingerprint(locator)).toBe(expectedFingerprint);
}

async function readDownloadText(download: Download) {
  const path = await download.path();
  if (!path) throw new Error(`Missing download path for ${download.suggestedFilename()}`);
  return fs.readFile(path, "utf8");
}

async function getApiDesignFingerprint(
  request: APIRequestContext,
  designId: string,
  shareToken: string
) {
  const response = await request.get(`${BASE_URL}/api/designs/${designId}?shareToken=${shareToken}`);
  expect(response.status()).toBe(200);
  return fingerprintDesignSnapshot(legacyApiToSnapshot(await response.json()));
}

async function getStableApiDesignFingerprint(
  request: APIRequestContext,
  designId: string,
  shareToken: string
) {
  let previous = "";
  let stableSamples = 0;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await getApiDesignFingerprint(request, designId, shareToken);
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

test.describe("19. Staging Signoff Evidence", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("captures smoke evidence and exports admin signoff artifacts", async ({ page, request }) => {
    test.setTimeout(300000);

    await page.addInitScript(() => {
      const clearSentinel = "__e2e_staging_signoff_storage_cleared";
      if (window.localStorage.getItem(clearSentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(clearSentinel, "1");
    });

    await page.goto("/design");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
    const betaStartTemplate = page.getByTestId("beta-start-template");
    if (await betaStartTemplate.isVisible({ timeout: 5000 }).catch(() => false)) {
      await betaStartTemplate.click();
    } else {
      await page.getByTestId("editor-command-new-plan").click();
      await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
    }
    await page.getByTestId("apply-furnished-template-studio").click();
    await confirmPlanTemplateReplacementIfNeeded(page);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    const localEditorFingerprint = await getFingerprint(page.getByTestId("qa-editor-snapshot-fingerprint"));

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    const reloadedEditorFingerprint = await getFingerprint(page.getByTestId("qa-editor-snapshot-fingerprint"));
    expect(localEditorFingerprint).toMatch(/[a-f0-9]{8}/);
    expect(reloadedEditorFingerprint).toMatch(/[a-f0-9]{8}/);

    const seed = await createBetaSeedDesign({
      email: ADMIN_EMAIL,
    });
    try {
      await addAuthCookies(page.context(), new URL(page.url()).origin, seed.sessionToken);
      const cloudFingerprint = await getApiDesignFingerprint(request, seed.designId, seed.shareToken);
      expect(cloudFingerprint).toMatch(/[a-f0-9]{8}/);
      await page.goto("/design");
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
      await openMyDesigns(page);
      await page.getByTestId(`load-design-${seed.designId}`).click();
      await expect(page.getByTestId("load-designs-modal")).toBeHidden();
      await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("3 rooms");
      const editorSnapshotFingerprint = await getStableFingerprint(
        page.getByTestId("qa-editor-snapshot-fingerprint")
      );
      expect(editorSnapshotFingerprint).toMatch(/[a-f0-9]{8}/);
      const savedCloudFingerprint = await getStableApiDesignFingerprint(
        request,
        seed.designId,
        seed.shareToken
      );
      expect(savedCloudFingerprint).toMatch(/[a-f0-9]{8}/);

      await page.goto(`/share/${seed.shareToken}`);
      await expect(page.getByTestId("share-viewer")).toBeVisible({ timeout: 30000 });
      await expectFingerprint(page.getByTestId("qa-share-snapshot-fingerprint"), savedCloudFingerprint);
      const shareSnapshotFingerprint = savedCloudFingerprint;

      await page.goto(`/share/${seed.shareToken}/export`);
      await expect(page.getByText("Export Overview")).toBeVisible({ timeout: 30000 });
      await expectFingerprint(page.getByTestId("qa-export-snapshot-fingerprint"), savedCloudFingerprint);
      const exportSnapshotFingerprint = savedCloudFingerprint;

      const pdfResponse = await request.get(`${BASE_URL}/share/${seed.shareToken}/export/pdf`);
      expect(pdfResponse.status()).toBe(200);
      expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");

      const csvDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-shopping-csv-download").click();
      const csvDownload = await csvDownloadPromise;
      expect(csvDownload.suggestedFilename()).toMatch(/shopping-list\.csv$/);

      const svgDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-svg-download").first().click();
      const svgDownload = await svgDownloadPromise;
      expect(svgDownload.suggestedFilename()).toMatch(/2d-plan\.svg$/);

      const pngDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-png-download").first().click();
      const pngDownload = await pngDownloadPromise;
      expect(pngDownload.suggestedFilename()).toMatch(/2d-plan\.png$/);

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

      await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: BASE_URL,
      });
      await page.goto("/admin");
      const evidencePanel = page.getByTestId("staging-smoke-evidence").first();
      await expect(evidencePanel).toBeVisible({ timeout: 30000 });
      await expect(evidencePanel.getByTestId("staging-smoke-row-open_design_signed_out")).toContainText("TODO");
      await expect(evidencePanel.getByTestId("staging-smoke-row-checkout_boundary")).toContainText("Redacted response diagnostics");
      await expect(evidencePanel.getByTestId("staging-smoke-checkout-mode")).toContainText(/test checkout URL|boundary blocked/);
      await expect(evidencePanel.getByTestId("staging-smoke-progress-summary")).toContainText("0/14 rows resolved");
      await evidencePanel.getByTestId("staging-smoke-row-status-open_design_signed_out").selectOption("PASS");
      await evidencePanel.getByTestId("staging-smoke-row-evidence-open_design_signed_out").fill("signed-out-design.png");
      await evidencePanel.getByTestId("staging-smoke-row-notes-open_design_signed_out").fill("Editor shell loaded behind staging protection.");
      await evidencePanel.getByTestId("staging-smoke-evidence-field-savedDesignId").fill(seed.designId);
      await evidencePanel
        .getByTestId("staging-smoke-evidence-field-shareReferenceFingerprint")
        .fill(crypto.createHash("sha256").update(seed.shareToken).digest("hex").slice(0, 16));
      await evidencePanel.getByTestId("staging-smoke-evidence-field-editorSnapshotFingerprint").fill(editorSnapshotFingerprint);
      await expect(evidencePanel.getByTestId("staging-smoke-progress-summary")).toContainText("1/14 rows resolved");

      await evidencePanel.getByTestId("staging-smoke-evidence-copy-json").click();
      await expect(evidencePanel.getByRole("status")).toContainText("JSON evidence copied.");
      const copiedEvidence = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiedEvidence).toContain("checklistRows");
      expect(copiedEvidence).toContain("hardStops");
      expect(copiedEvidence).toContain('"status": "PASS"');
      expect(copiedEvidence).toContain("signed-out-design.png");
      expect(copiedEvidence).toContain(seed.designId);

      const jsonDownloadPromise = page.waitForEvent("download");
      await evidencePanel.getByTestId("staging-smoke-evidence-json").click();
      const jsonDownload = await jsonDownloadPromise;
      expect(jsonDownload.suggestedFilename()).toBe("beta-staging-smoke-evidence.json");
      const jsonEvidence = await readDownloadText(jsonDownload);
      expect(jsonEvidence).toContain("stagingDeploymentUrl");
      expect(jsonEvidence).toContain("checkoutBoundaryResponseMode");

      const csvEvidenceDownloadPromise = page.waitForEvent("download");
      await evidencePanel.getByTestId("staging-smoke-evidence-csv").click();
      const csvEvidenceDownload = await csvEvidenceDownloadPromise;
      expect(csvEvidenceDownload.suggestedFilename()).toBe("beta-staging-smoke-evidence.csv");
      const csvEvidence = await readDownloadText(csvEvidenceDownload);
      expect(csvEvidence).toContain('"checklist_id","step","expected_result","status"');
      expect(csvEvidence).toContain("checkout_boundary");

      const markdownDownloadPromise = page.waitForEvent("download");
      await evidencePanel.getByTestId("staging-smoke-evidence-markdown").click();
      const markdownDownload = await markdownDownloadPromise;
      expect(markdownDownload.suggestedFilename()).toBe("beta-staging-smoke-evidence.md");
      const markdownEvidence = await readDownloadText(markdownDownload);
      expect(markdownEvidence).toContain("# Beta Staging Smoke Evidence");
      expect(markdownEvidence).toContain("Do not complete a real payment in staging");

      expect({
        editorSnapshotFingerprint,
        shareSnapshotFingerprint,
        exportSnapshotFingerprint,
        csvFilename: csvDownload.suggestedFilename(),
        pngFilename: pngDownload.suggestedFilename(),
        svgFilename: svgDownload.suggestedFilename(),
        checkoutBoundaryResponseMode: "test checkout URL",
      }).toMatchObject({
        editorSnapshotFingerprint: expect.stringMatching(/[a-f0-9]{8}/),
        shareSnapshotFingerprint: expect.stringMatching(/[a-f0-9]{8}/),
        exportSnapshotFingerprint: expect.stringMatching(/[a-f0-9]{8}/),
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
