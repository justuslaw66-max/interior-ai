import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { resolveFloorPlanProcessingMode } from "@/lib/floor-plan-imports/processing-mode";
import { processFloorPlanImportJob } from "@/lib/floor-plan-imports/worker";
import { readFloorPlanPageSelection } from "@/lib/floor-plan-imports/page-selection";

export const runtime = "nodejs";
export const maxDuration = 300;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const { id } = await params;
  const allowance = rateLimit(`floor-plan-process:${userId}`, 12, 60_000);
  if (!allowance.ok) return error("Too many floor-plan processing requests", 429);

  const owned = await prisma.floorPlanImportJob.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      progress: true,
      attemptCount: true,
      retryCount: true,
      maxAttempts: true,
      nextAttemptAt: true,
      lastAttemptAt: true,
      lastErrorAt: true,
      lastRecoveredAt: true,
      leaseExpiresAt: true,
      heartbeatAt: true,
      errorMessage: true,
      candidateJson: true,
    },
  });
  if (!owned) return error("Floor-plan import not found", 404);
  if (
    owned.status === "selecting_page" &&
    !readFloorPlanPageSelection(owned.candidateJson)?.selectedPageNumber
  ) {
    return NextResponse.json({
      job: owned,
      processing: {
        outcome: "not_processable",
        resumable: true,
        reason: "page_selection_required",
      },
    });
  }
  if (["needs_review", "ready", "applied", "published"].includes(owned.status)) {
    return NextResponse.json({
      job: owned,
      processing: { outcome: "not_processable", resumable: false },
    });
  }
  if (owned.status === "failed") {
    return NextResponse.json(
      {
        error: "This floor-plan import exhausted its processing attempts",
        job: owned,
        processing: { outcome: "failed", resumable: false },
      },
      { status: 409 }
    );
  }

  let processingMode: ReturnType<typeof resolveFloorPlanProcessingMode>;
  try {
    processingMode = resolveFloorPlanProcessingMode();
  } catch (cause) {
    console.error("Floor-plan processing mode is invalid", cause);
    return error("Floor-plan processing is unavailable", 503);
  }

  if (processingMode === "background") {
    return NextResponse.json(
      {
        job: owned,
        processing: {
          outcome: "queued",
          resumable: true,
        },
        next: {
          statusUrl: `/api/floor-plan-imports/${owned.id}`,
        },
      },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await processFloorPlanImportJob({
      jobId: id,
      ownerUserId: userId,
    });
    if (result.outcome === "not_found") return error("Floor-plan import not found", 404);
    if (result.outcome === "failed" || result.outcome === "attempts_exhausted") {
      return NextResponse.json(
        {
          error: "Floor-plan processing exhausted its retry attempts",
          ...(result.job ? { job: result.job } : {}),
          processing: { outcome: result.outcome, resumable: false },
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (
      result.outcome === "already_processing" ||
      result.outcome === "retry_scheduled" ||
      result.outcome === "race_lost" ||
      result.outcome === "lease_lost"
    ) {
      return NextResponse.json(
        {
          job: "job" in result && result.job ? result.job : owned,
          processing: {
            outcome: result.outcome,
            resumable: true,
            ...(result.outcome === "lease_lost" ? { error: result.error } : {}),
          },
        },
        { status: 202, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (result.outcome === "completed") {
      return NextResponse.json(
        {
          job: result.job,
          processing: {
            outcome: result.outcome,
            resumable: false,
            attemptNumber: result.attemptNumber,
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    if (result.outcome === "not_processable") {
      return NextResponse.json(
        {
          job: result.job,
          processing: { outcome: result.outcome, resumable: false },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return error("Unable to claim this floor-plan import", 409);
  } catch (cause) {
    console.error("Floor-plan processing failed", cause);
    return error("Unable to process this floor plan", 500);
  }
}
