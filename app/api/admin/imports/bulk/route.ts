import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getImportJobValidationBlockers } from "@/lib/import-jobs/admin-workflow";
import type { AdminImportWorkflowJob } from "@/lib/import-jobs/admin-workflow-shared";
import { readJsonRequest } from "@/lib/api-boundary";
import { canTransitionImportStatus, isImportJobStatus } from "@/lib/import-jobs/status";
import type { ImportJobStatus } from "@/lib/import-jobs/types";

interface BulkUpdateRequest {
  ids: string[];
  status: string;
}

type BulkRefusal = { error: string; failedIds: string[]; details: string };

/**
 * Why moving every job to `status` is refused, or null. The same transitions as a single job's
 * update (none backwards, none out of a final status), then the approval blockers.
 */
function bulkTransitionRefusal(
  jobs: AdminImportWorkflowJob[],
  status: ImportJobStatus
): BulkRefusal | null {
  const invalid = jobs.filter((job) => !canTransitionImportStatus(job.status, status));
  if (invalid.length > 0) {
    return {
      error: `Cannot transition jobs to ${status} from their current status`,
      failedIds: invalid.map((job) => job.id),
      details: invalid.map((job) => `${job.id}: ${job.status} -> ${status}`).join(" | "),
    };
  }
  if (status !== "approved" && status !== "published") return null;

  const blocked = jobs
    .map((job) => ({ id: job.id, blockers: getImportJobValidationBlockers(job) }))
    .filter((entry) => entry.blockers.length > 0);
  if (blocked.length === 0) return null;
  return {
    error: `Cannot transition jobs to ${status} due to validation blockers`,
    failedIds: blocked.map((entry) => entry.id),
    details: blocked.map((entry) => `${entry.id}: ${entry.blockers.join("; ")}`).join(" | "),
  };
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await readJsonRequest(request, 32 * 1024);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const typedBody = body as BulkUpdateRequest;
  const { ids, status } = typedBody;

  if (
    !Array.isArray(ids) ||
    !ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64) ||
    ids.length === 0 ||
    ids.length > 100 ||
    new Set(ids).size !== ids.length
  ) {
    return NextResponse.json({ error: "ids must be a non-empty array of strings" }, { status: 400 });
  }

  if (typeof status !== "string") {
    return NextResponse.json({ error: "status must be a string" }, { status: 400 });
  }

  if (!isImportJobStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    // Fetch all jobs to check for validation blockers
    const prismaCompat = prisma as unknown as {
      importJob: {
        findMany: (args: {
          where: { id: { in: string[] } };
          select: Record<string, boolean>;
        }) => Promise<AdminImportWorkflowJob[]>;
      };
    };

    const jobFields = {
      id: true,
      status: true,
      normalizedAssetId: true,
      catalogItemId: true,
      workflowStage: true,
      workflowBlockers: true,
      nextAction: true,
      reviewNotes: true,
      dimensionsVerificationStatus: true,
      sourceBrand: true,
      sourceSku: true,
      sourceProductUrl: true,
      sourceFileName: true,
      errorMessage: true,
      rawMetadataJson: true,
      reportJson: true,
      createdAt: true,
      updatedAt: true,
    };

    const jobs = await prismaCompat.importJob.findMany({
      where: { id: { in: ids } },
      select: jobFields,
    });

    const refusal = bulkTransitionRefusal(jobs, status);
    if (refusal) {
      return NextResponse.json(refusal, { status: 400 });
    }

    // Update all jobs
    const prismaUpdateCompat = prisma as unknown as {
      importJob: {
        updateMany: (args: {
          where: { id: { in: string[] } };
          data: { status: string; updatedAt: Date };
        }) => Promise<{ count: number }>;
      };
    };

    const result = await prismaUpdateCompat.importJob.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      ids,
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    return NextResponse.json({ error: "Failed to update jobs" }, { status: 500 });
  }
}
