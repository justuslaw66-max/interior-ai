import { test, expect } from "../fixtures";
import {
  addAuthCookies, cleanupBetaSeed, createBetaSeedDesign,
  disconnectBetaPrismaClient, getBetaPrismaClient,
} from "../beta-seed";
import { createSampleFloorPlanPdf } from "./helpers";

/** The statuses a plan has while it is read, before its page choice. */
const READING_STATUSES: string[] = ["received", "rendered", "extracted"];
/** lib/floor-plan-imports/owner-cancel.ts's OWNER_CANCEL_LEASE_OWNER (that module opens the app's database on import). */
const OWNER_CANCEL_LEASE_OWNER = "owner-cancel";

export function registerUploadCancelTests() {
  // J, 31 Oct: Cancel upload stops a plan while it is read. On 2 Nov the database refused that cancel (500) and the
  // read went on: the cancel kept its lease's end without the token, which FloorPlanImportJob_lease_complete forbids,
  // and the unit test's stand-in database had let it through. This runs it against the real database.
  test("Cancel upload stops a plan while it is being read", async ({ page, baseURL }, testInfo) => {
    if (!baseURL) throw new Error("The import test requires its configured application URL");
    // Reading the PDF takes 13 to 21 s under next dev; the read's answer comes at its next write after the cancel.
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    const prisma = getBetaPrismaClient();
    const failures: unknown[] = [];
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto("/design", { waitUntil: "domcontentloaded" });
      const scene = page.getByTestId("scene-canvas").first();
      await expect(scene).toBeVisible({ timeout: 20000 });
      await expect(scene).toHaveAttribute("data-client-hydrated", "true", { timeout: 20000 });
      const planView = page.getByRole("button", { name: "2D", exact: true });
      await planView.click();
      await expect(planView).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("plan-tool-import-2d").click();
      await expect(page.getByRole("dialog", { name: "Upload floor plan" })).toBeVisible();
      const createdResponse = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/floor-plan-imports");
      // The read runs in the window's process request under next dev; it answers once the read has stopped.
      const readAnswered = page.waitForResponse(async (response) => {
        if (response.request().method() !== "POST") return false;
        if (!/^\/api\/floor-plan-imports\/[^/]+\/process$/.test(new URL(response.url()).pathname)) return false;
        const body = (await response.json().catch(() => null)) as { processing?: { outcome?: string } } | null;
        return body?.processing?.outcome !== "already_processing";
      }, { timeout: 120_000 }).then(() => true, () => false);
      await page.getByTestId("floor-plan-upload-input").setInputFiles({
        name: "sample-floor-plan.pdf", mimeType: "application/pdf",
        buffer: await createSampleFloorPlanPdf(),
      });
      const created = await createdResponse;
      expect(created.status()).toBe(201);
      const jobId: string = (await created.json()).job.id;

      // Once the read holds the job's lease, Cancel upload on the reading screen.
      await expect.poll(async () => {
        const job = await prisma.floorPlanImportJob.findUnique({
          where: { id: jobId }, select: { status: true, leaseToken: true },
        });
        return Boolean(job?.leaseToken && READING_STATUSES.includes(job.status));
      }, { timeout: 30_000, intervals: [250] }).toBe(true);
      const cancelResponse = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/floor-plan-imports/${jobId}/cancel`);
      await page.getByTestId("floor-plan-import-cancel").click();
      expect((await cancelResponse).status()).toBe(200);
      await expect(page.getByTestId("floor-plan-import-dialog-empty-state")).toBeVisible();

      // Cancelled, with the read's lease end held by the cancel, so purges wait for the read to stop.
      const cancelled = await prisma.floorPlanImportJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { status: true, errorMessage: true, leaseToken: true, leaseOwner: true, leaseExpiresAt: true },
      });
      expect(cancelled).toMatchObject({
        status: "failed", errorMessage: "Cancelled by owner", leaseOwner: OWNER_CANCEL_LEASE_OWNER,
      });
      expect(cancelled.leaseToken).toEqual(expect.any(String));
      expect(cancelled.leaseExpiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());

      // The read stops at its next write, which is refused: the job stays cancelled, and the window on its drop box.
      expect(await readAnswered).toBe(true);
      const after = await prisma.floorPlanImportJob.findUniqueOrThrow({
        where: { id: jobId }, select: { status: true, errorMessage: true },
      });
      expect(after).toEqual({ status: "failed", errorMessage: "Cancelled by owner" });
      await expect(page.getByTestId("floor-plan-import-dialog-empty-state")).toBeVisible();
    } catch (cause) {
      failures.push(cause);
    }
    try {
      // Every upload of this fresh user, including one whose response the browser could not observe.
      const jobs = await prisma.floorPlanImportJob.findMany({
        where: { userId: seed.userId }, select: { id: true, status: true },
      });
      for (const job of jobs) {
        if (!["failed", "ready"].includes(job.status)) {
          const cancelled = await page.request.post(`/api/floor-plan-imports/${job.id}/cancel`);
          expect(cancelled.status(), `Owned import ${job.id} must close before source cleanup`).toBe(200);
        }
        // A cancel's hold on a read's lease end, ended as its end and the workers' expired-lease sweep would, so the
        // upload is deleted now rather than when that end comes, up to two minutes on.
        await prisma.floorPlanImportJob.updateMany({
          where: { id: job.id, leaseOwner: OWNER_CANCEL_LEASE_OWNER },
          data: { leaseToken: null, leaseOwner: null, leaseExpiresAt: null },
        });
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
      "Cancel during a read and owned cleanup failed",
      ...failures.map((cause) => cause instanceof Error ? cause.message : String(cause)),
    ].join("\n\n"));
  });
}
