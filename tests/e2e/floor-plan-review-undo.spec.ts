import { expect, test } from "./fixtures";
import {
  addAuthCookies, cleanupBetaSeed, createBetaSeedDesign,
  disconnectBetaPrismaClient, getBetaPrismaClient,
} from "./beta-seed";
import { createSampleFloorPlanPdf } from "./multi-room/helpers";
import { REVIEW_HISTORY_COALESCE_MS } from "../../lib/floor-plan-review-history";

/** Each home type sets a different assumed wall height, so the document it leaves reads back as that type. */
const CHOICES = ["condo", "landed", "hdb_top_floor", "condo_penthouse"] as const;
const LANDED_WALL_MM = 3000;

// Roadmap week 1, saving and recovery, PR 3: one Undo and Redo over the upload review's corrections.
test("the upload review undoes and redoes its corrections, and a saved draft keeps them", async ({ page, baseURL }, testInfo) => {
  if (!baseURL) throw new Error("The import test requires its configured application URL");
  // Reading the PDF takes 13 to 21 s under next dev (multi-room/upload.ts), and the draft save reads it again.
  test.setTimeout(150_000);
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
    await expect(scene).toHaveAttribute("data-client-hydrated", "true", { timeout: 20_000 });
    const planView = page.getByRole("button", { name: "2D", exact: true });
    await planView.click();
    await page.getByTestId("plan-tool-import-2d").click();
    await expect(page.getByRole("dialog", { name: "Upload floor plan" })).toBeVisible();
    const createdResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/floor-plan-imports");
    await page.getByTestId("floor-plan-upload-input").setInputFiles({
      name: "sample-floor-plan.pdf", mimeType: "application/pdf", buffer: await createSampleFloorPlanPdf(),
    });
    const created = await createdResponse;
    expect(created.status()).toBe(201);
    const jobId: string = (await created.json()).job.id;
    const selection = page.getByTestId("floor-plan-page-selection");
    const review = page.getByTestId("floor-plan-import-review");
    await expect(selection.or(review)).toBeVisible({ timeout: 45_000 });
    if (await selection.isVisible()) {
      await selection.getByTestId("floor-plan-page-candidate-1").click();
      await selection.getByRole("button", { name: "Use this page", exact: true }).click();
    }
    await expect(review).toBeVisible({ timeout: 45_000 });

    const undo = review.getByTestId("floor-plan-review-undo");
    const redo = review.getByTestId("floor-plan-review-redo");
    const homeType = review.getByTestId("floor-plan-import-home-type").getByRole("combobox", { name: "Home type" });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    const opened = await homeType.inputValue();
    expect(CHOICES).not.toContain(opened);

    // Four corrections, each its own step: apart by more than the time that makes a gesture one step.
    for (const choice of CHOICES) {
      await homeType.selectOption(choice);
      await expect(homeType).toHaveValue(choice);
      await page.waitForTimeout(REVIEW_HISTORY_COALESCE_MS + 100);
    }
    await expect(undo).toBeEnabled();

    // The select has the keyboard: ⌘Z/Ctrl+Z stays the field's own.
    await homeType.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(homeType).toHaveValue("condo_penthouse");

    // Undo all four: once with the button, twice with the keys (the button has focus), once more with the button.
    await undo.click();
    await expect(homeType).toHaveValue("hdb_top_floor");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(homeType).toHaveValue("landed");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(homeType).toHaveValue("condo");
    await undo.click();
    await expect(homeType).toHaveValue(opened);
    await expect(undo).toBeDisabled();

    // Redo two: the button, then the keys.
    await redo.click();
    await expect(homeType).toHaveValue("condo");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(homeType).toHaveValue("landed");
    await expect(redo).toBeEnabled();

    // Save review draft sends the document as it now stands, and the history stays.
    await review.getByRole("button", { name: "Save review draft", exact: true }).click();
    await expect(review.getByRole("status").filter({ hasText: /Review draft version \d+ saved/ })).toBeVisible({ timeout: 45_000 });
    const job = await getBetaPrismaClient().floorPlanImportJob.findUnique({ where: { id: jobId }, select: { candidateJson: true } });
    const saved = job?.candidateJson as unknown as { floors: { defaults: { wallHeight: { valueMm: number } } }[] } | null;
    expect(saved?.floors[0]?.defaults.wallHeight.valueMm).toBe(LANDED_WALL_MM);
    await expect(homeType).toHaveValue("landed");
    await expect(undo).toBeEnabled();
    await expect(redo).toBeEnabled();
    await undo.click();
    await expect(homeType).toHaveValue("condo");

    expect(renderWarnings).toEqual([]);
    expect(pageErrors).toEqual([]);
  } catch (cause) {
    failures.push(cause);
  }
  try {
    // As multi-room/upload.ts: only this fresh user's jobs, closed before their sources are removed.
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
    }
    await cleanupBetaSeed(seed);
  } catch (cause) {
    failures.push(cause);
    await testInfo.attach("retained-private-import-owner", {
      body: Buffer.from(JSON.stringify({ userId: seed.userId, designId: seed.designId })),
      contentType: "application/json",
    }).catch((attachmentFailure: unknown) => failures.push(attachmentFailure));
  } finally {
    await disconnectBetaPrismaClient().catch((disconnectFailure: unknown) => failures.push(disconnectFailure));
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Review undo and owned cleanup failed");
});
