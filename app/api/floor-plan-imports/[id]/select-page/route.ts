import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import {
  markSelectedFloorPlanManifestPage,
  selectFloorPlanImportPage,
} from "@/lib/floor-plan-imports/page-selection";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "@/lib/floor-plan-imports/status";

export const runtime = "nodejs";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const allowance = rateLimit(`floor-plan-select-page:${userId}`, 20, 60_000);
  if (!allowance.ok) return error("Too many page-selection requests", 429);

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, 16 * 1024);
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Page-selection payload is too large", 413);
    }
    return error("Invalid JSON payload", 400);
  }
  const pageNumber = body.pageNumber;
  const candidateVersion = body.candidateVersion;
  if (
    !Number.isSafeInteger(pageNumber) ||
    Number(pageNumber) < 1 ||
    !Number.isSafeInteger(candidateVersion) ||
    Number(candidateVersion) < 0
  ) {
    return error("pageNumber and candidateVersion are required", 400);
  }

  const { id } = await params;
  const job = await prisma.floorPlanImportJob.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      candidateJson: true,
      sourceManifestJson: true,
      candidateVersion: true,
    },
  });
  if (!job) return error("Floor-plan import not found", 404);
  if (job.status !== "selecting_page") {
    return error("This floor-plan import is not awaiting page selection", 409);
  }
  if (job.candidateVersion !== candidateVersion) {
    return error("The page candidates changed; reload before selecting", 409);
  }

  try {
    const candidate = selectFloorPlanImportPage(
      job.candidateJson,
      Number(pageNumber)
    );
    const sourceManifest = markSelectedFloorPlanManifestPage(
      job.sourceManifestJson,
      Number(pageNumber)
    );
    const nextVersion = job.candidateVersion + 1;
    const updated = await prisma.floorPlanImportJob.updateMany({
      where: {
        id,
        userId,
        status: "selecting_page",
        candidateVersion: job.candidateVersion,
      },
      data: {
        candidateJson: candidate as unknown as Prisma.InputJsonValue,
        ...(sourceManifest
          ? {
              sourceManifestJson:
                sourceManifest as unknown as Prisma.InputJsonValue,
            }
          : {}),
        candidateVersion: nextVersion,
        progress: FLOOR_PLAN_IMPORT_PROGRESS.selecting_page,
        // A null value keeps an unselected job out of the background queue.
        // Selecting a page marks the paused job as immediately resumable.
        nextAttemptAt: new Date(0),
        errorMessage: null,
      },
    });
    if (updated.count !== 1) {
      return error("The page candidates changed; reload before selecting", 409);
    }
    return NextResponse.json(
      {
        ok: true,
        status: "selecting_page",
        selectedPageNumber: Number(pageNumber),
        candidateVersion: nextVersion,
        next: {
          processUrl: `/api/floor-plan-imports/${encodeURIComponent(id)}/process`,
          statusUrl: `/api/floor-plan-imports/${encodeURIComponent(id)}`,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (cause) {
    return error(
      cause instanceof Error ? cause.message : "Unable to select this page",
      400
    );
  }
}
