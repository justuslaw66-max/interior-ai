import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getImportJobValidationBlockers } from "@/lib/import-jobs/admin-workflow";
import type { AdminImportWorkflowJob } from "@/lib/import-jobs/admin-workflow-shared";

interface BulkUpdateRequest {
  ids: string[];
  status: string;
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const typedBody = body as BulkUpdateRequest;
  const { ids, status } = typedBody;

  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string") || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array of strings" }, { status: 400 });
  }

  if (typeof status !== "string") {
    return NextResponse.json({ error: "status must be a string" }, { status: 400 });
  }

  const validStatuses = [
    "received",
    "normalizing",
    "optimized",
    "preview_generated",
    "metadata_extracted",
    "needs_mapping",
    "needs_review",
    "approved",
    "published",
    "failed",
  ];

  if (!validStatuses.includes(status)) {
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

    // Check for blockers if transitioning to approved or published
    if (status === "approved" || status === "published") {
      const blockersMap = new Map<string, string[]>();
      for (const job of jobs) {
        const blockers = getImportJobValidationBlockers(job);
        if (blockers.length > 0) {
          blockersMap.set(job.id, blockers);
        }
      }

      if (blockersMap.size > 0) {
        const failedIds = Array.from(blockersMap.keys());
        const blockersDetail = Array.from(blockersMap.entries())
          .map(([id, blockers]) => `${id}: ${blockers.join("; ")}`)
          .join(" | ");
        return NextResponse.json(
          {
            error: `Cannot transition jobs to ${status} due to validation blockers`,
            failedIds,
            details: blockersDetail,
          },
          { status: 400 }
        );
      }
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
