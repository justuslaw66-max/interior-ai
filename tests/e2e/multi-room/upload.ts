import { test, expect } from "../fixtures";
import {
  addAuthCookies, cleanupBetaSeed, createBetaSeedDesign,
  disconnectBetaPrismaClient, getBetaPrismaClient,
} from "../beta-seed";
import { createSampleFloorPlanPdf } from "./helpers";

export function registerUploadTests() {
  test("floor plan upload exposes pdf pages and calibration controls", async ({ page, baseURL }, testInfo) => {
    if (!baseURL) throw new Error("The import test requires its configured application URL");
    const seed = await createBetaSeedDesign();
    const failures: unknown[] = [];
    const renderWarnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Cannot update a component")) renderWarnings.push(message.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto("/design", { waitUntil: "domcontentloaded" });
      const scene = page.getByTestId("scene-canvas").first();
      await expect(scene).toBeVisible({ timeout: 20000 });
      await expect(scene).toHaveAttribute("data-client-hydrated", "true", { timeout: 20000 });
      const planView = page.getByRole("button", { name: "2D Plan" });
      await planView.click();
      await expect(planView).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("plan-tool-section-importFloorPlan")
        .getByRole("button", { name: "Import floor plan", exact: true }).click();
      await page.getByTestId("plan-tool-import-2d").click();
      await expect(page.getByTestId("floor-plan-upload-empty-state")).toBeVisible();
      const createdResponse = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/floor-plan-imports");
      await page.getByTestId("floor-plan-upload-input").setInputFiles({
        name: "sample-floor-plan.pdf", mimeType: "application/pdf",
        buffer: await createSampleFloorPlanPdf(),
      });
      const created = await createdResponse;
      expect(created.status()).toBe(201);
      const payload = await created.json();
      expect(payload.job.id).toEqual(expect.any(String));
      expect(payload.job.source.fileName).toBe("sample-floor-plan.pdf");
      const jobId: string = payload.job.id;
      const selection = page.getByTestId("floor-plan-page-selection");
      const review = page.getByTestId("floor-plan-import-review");
      await expect(selection.or(review)).toBeVisible({ timeout: 20000 });
      if (await selection.isVisible()) {
        await expect(selection.locator('[data-testid^="floor-plan-page-candidate-"]')).toHaveCount(2);
        await selection.getByTestId("floor-plan-page-candidate-1").click();
        await selection.getByRole("button", { name: "Use this page", exact: true }).click();
      }
      await expect(review).toBeVisible({ timeout: 20000 });
      const statusResponse = await page.request.get(`/api/floor-plan-imports/${jobId}`);
      expect(statusResponse.status()).toBe(200);
      const { job } = await statusResponse.json();
      expect(job.id).toBe(jobId);
      expect(job.sourceAsset.fileName).toBe("sample-floor-plan.pdf");
      expect(job.renderedPagesJson).toHaveLength(2);
      const sourcePage = review.getByRole("combobox", { name: "Source page" });
      await expect(sourcePage.locator("option")).toHaveText(["Page 1", "Page 2"]);
      const image = review.getByRole("img", { name: "Uploaded floor plan source", exact: true });
      for (const pageNumber of [1, 2]) {
        const rendered = job.renderedPagesJson.find((entry: { pageNumber: number }) => entry.pageNumber === pageNumber);
        expect(rendered).toBeDefined();
        await sourcePage.selectOption(String(pageNumber));
        await expect(sourcePage).toHaveValue(String(pageNumber));
        await expect(image).toHaveAttribute("src", `/api/floor-plan-imports/${jobId}/assets/${encodeURIComponent(rendered.assetKey)}`);
        await expect.poll(() => image.evaluate((node: HTMLImageElement) => ({
          loaded: node.complete, width: node.naturalWidth, height: node.naturalHeight,
        }))).toEqual({ loaded: true, width: rendered.widthPx, height: rendered.heightPx });
      }
      const manualTools = review.locator("#floor-plan-manual-tools");
      if (await manualTools.getAttribute("open") === null) {
        await manualTools.locator(":scope > summary").click();
      }
      await manualTools.getByRole("button", { name: "Choose the two endpoints on the plan", exact: true }).click();
      await expect(manualTools.getByRole("button", { name: "Selecting points — click twice on the plan", exact: true })).toBeVisible();
      await expect(review.getByLabel("Pick scale points on the source drawing", { exact: true })).toBeVisible();
      await expect(manualTools.getByText("No measurement selected yet.", { exact: true })).toBeVisible();
      await page.getByTestId("floor-plan-import-secondary-options").locator("summary").first().click();
      await page.getByText("My floor-plan imports", { exact: true }).click();
      await expect(page.getByTestId(`floor-plan-import-history-${jobId}`)).toContainText("sample-floor-plan.pdf");
      expect(renderWarnings).toEqual([]);
      expect(pageErrors).toEqual([]);
    } catch (cause) {
      failures.push(cause);
    }
    try {
      // Discover only this fresh user's jobs, including a POST whose response the
      // browser could not observe. Never remove an import with an active lease.
      const jobs = await getBetaPrismaClient().floorPlanImportJob.findMany({
        where: { userId: seed.userId }, select: { id: true, status: true },
      });
      for (const job of jobs) {
        if (!["failed", "ready"].includes(job.status)) {
          const cancelled = await page.request.post(`/api/floor-plan-imports/${job.id}/cancel`);
          expect(cancelled.status(), `Owned import ${job.id} must close before source cleanup`).toBe(200);
        }
        const deleted = await page.request.delete(`/api/floor-plan-imports/${job.id}/source`);
        expect(deleted.status(), `Owned import ${job.id} source cleanup must complete`).toBe(200);
        expect(await deleted.json()).toMatchObject({ deletionState: "deleted", sourceContentDeleted: true });
      }
      await cleanupBetaSeed(seed);
    } catch (cause) {
      failures.push(cause);
      try {
        await testInfo.attach("retained-private-import-owner", {
          body: Buffer.from(JSON.stringify({ userId: seed.userId, designId: seed.designId })),
          contentType: "application/json",
        });
      } catch (attachmentFailure) {
        failures.push(attachmentFailure);
      }
    } finally {
      try {
        await disconnectBetaPrismaClient();
      } catch (disconnectFailure) {
        failures.push(disconnectFailure);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, [
      "Import validation and owned cleanup failed",
      ...failures.map((cause) => cause instanceof Error ? cause.message : String(cause)),
    ].join("\n\n"));
  });
}
