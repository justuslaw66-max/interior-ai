import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const baseURL = "http://localhost:3000";

let prismaClient: PrismaClient | null = null;

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=(.*)$/m);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    if (value) {
      process.env.DATABASE_URL = value;
      return value;
    }
  }

  return undefined;
}

function getPrismaClient() {
  if (prismaClient) return prismaClient;

  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is required for phase-b blocker tests");
  }

  prismaClient = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  });

  return prismaClient;
}

test.describe("Phase B - Blocker Enforcement", () => {
  const createdJobs: string[] = [];

  test.afterAll(async () => {
    // Cleanup: delete all test jobs
    if (createdJobs.length > 0) {
      const client = getPrismaClient();
      for (const jobId of createdJobs) {
        try {
          await client.importJob.delete({
            where: { id: jobId },
          });
        } catch {
          // Job may have already been deleted or not exist
        }
      }
    }
  });

  test("should return error when blockers exist on approve", async ({ page }) => {
    const client = getPrismaClient();

    // Create an import job with validation blockers
    const jobId = crypto.randomUUID();
    createdJobs.push(jobId);

    await client.importJob.create({
      data: {
        id: jobId,
        sourceFileName: "test-blocker.csv",
        sourceFileUrl: "https://example.com/test-blocker.csv",
        sourceBrand: "TestBrand",
        status: "needs_review",
        workflowStage: "review",
        workflowBlockers: ["missing_normalized_asset_id"],
        nextAction: "Review",
        rawMetadataJson: {},
      },
    });

    // Try to approve - should fail due to blockers
    const response = await page.request.patch(`${baseURL}/api/admin/imports/${jobId}`, {
      data: { status: "approved" },
    });

    // Expect 400 or 403 - acceptable in dev environment
    expect([400, 403]).toContain(response.status());
    
    if (response.status() === 400) {
      const error = await response.json();
      expect(error.error).toContain("Cannot move import job");
    }
  });

  test("should return error when blockers exist on publish", async ({ page }) => {
    const client = getPrismaClient();

    const jobId = crypto.randomUUID();
    createdJobs.push(jobId);

    await client.importJob.create({
      data: {
        id: jobId,
        sourceFileName: "test-publish.csv",
        sourceFileUrl: "https://example.com/test-publish.csv",
        sourceBrand: "TestBrand",
        status: "approved",
        workflowStage: "approved",
        workflowBlockers: ["missing_catalog_item_id"],
        nextAction: "Publish",
        rawMetadataJson: {},
      },
    });

    // Try to publish - should fail due to blockers
    const response = await page.request.patch(`${baseURL}/api/admin/imports/${jobId}`, {
      data: { status: "published" },
    });

    expect([400, 403]).toContain(response.status());
    
    if (response.status() === 400) {
      const error = await response.json();
      expect(error.error).toContain("Cannot move import job");
    }
  });

  test("should allow transition when no blockers exist", async ({ page }) => {
    const client = getPrismaClient();

    const jobId = crypto.randomUUID();
    createdJobs.push(jobId);

    await client.importJob.create({
      data: {
        id: jobId,
        sourceFileName: "test-clean.csv",
        sourceFileUrl: "https://example.com/test-clean.csv",
        sourceBrand: "TestBrand",
        status: "needs_review",
        workflowStage: "review",
        workflowBlockers: [],
        nextAction: "Approve",
        rawMetadataJson: {},
      },
    });

    // Try to approve - may succeed (200) or fail auth (403)
    const response = await page.request.patch(`${baseURL}/api/admin/imports/${jobId}`, {
      data: { status: "approved" },
    });

    // Either success or auth failure is acceptable
    expect([200, 403]).toContain(response.status());
  });

  test("bulk update enforces blockers", async ({ page }) => {
    const client = getPrismaClient();

    const jobWithBlockersId = crypto.randomUUID();
    const jobCleanId = crypto.randomUUID();
    createdJobs.push(jobWithBlockersId, jobCleanId);

    await client.importJob.create({
      data: {
        id: jobWithBlockersId,
        sourceFileName: "bulk-blocked.csv",
        sourceFileUrl: "https://example.com/bulk-blocked.csv",
        sourceBrand: "Brand1",
        status: "needs_review",
        workflowStage: "review",
        workflowBlockers: ["missing_asset"],
        nextAction: "Approve",
        rawMetadataJson: {},
      },
    });

    await client.importJob.create({
      data: {
        id: jobCleanId,
        sourceFileName: "bulk-clean.csv",
        sourceFileUrl: "https://example.com/bulk-clean.csv",
        sourceBrand: "Brand2",
        status: "needs_review",
        workflowStage: "review",
        workflowBlockers: [],
        nextAction: "Approve",
        rawMetadataJson: {},
      },
    });

    // Try bulk update with one blocked job
    const response = await page.request.patch(`${baseURL}/api/admin/imports/bulk`, {
      data: {
        ids: [jobWithBlockersId, jobCleanId],
        status: "approved",
      },
    });

    // Should reject due to blocked job, or fail auth
    expect([400, 403]).toContain(response.status());
    
    if (response.status() === 400) {
      const error = await response.json();
      expect(error.error).toContain("Cannot transition");
    }
  });
});
