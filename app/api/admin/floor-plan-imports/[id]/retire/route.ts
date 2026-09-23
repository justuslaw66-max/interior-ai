import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { prisma } from "@/lib/prisma";
import { retireFloorPlanRevisionWithoutReplacement } from "@/lib/floor-plan-imports/revision-retirement";

export const runtime = "nodejs";

const MAX_FLOOR_PLAN_RETIREMENT_BODY_BYTES = 8 * 1024;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function errorCode(cause: unknown) {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return null;
  return typeof cause.code === "string" ? cause.code : null;
}

/**
 * Standalone withdrawal endpoint. Superseding a published revision is handled
 * by the approval transaction instead; this route intentionally creates no
 * replacement and therefore removes the revision from public address search.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);

  const { id } = await params;
  let payload: Record<string, unknown>;
  try {
    payload = await readBoundedJsonObject(
      request,
      MAX_FLOOR_PLAN_RETIREMENT_BODY_BYTES
    );
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Floor-plan retirement payload is too large", 413);
    }
    return error("Invalid retirement payload", 400);
  }
  const revisionId =
    typeof payload.revisionId === "string" ? payload.revisionId.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const confirmation =
    typeof payload.confirmation === "string" ? payload.confirmation.trim() : "";
  if (!revisionId) return error("revisionId is required", 400);
  if (reason.length < 10) {
    return error("A withdrawal reason of at least 10 characters is required", 400);
  }
  if (reason.length > 2_000) {
    return error("The withdrawal reason must be 2,000 characters or fewer", 400);
  }
  if (confirmation !== `RETIRE ${revisionId}`) {
    return error(`Type RETIRE ${revisionId} to confirm this withdrawal`, 400);
  }

  const retiredAt = new Date();
  const retiredBy = session?.user?.email ?? "local-admin";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.floorPlanImportJob.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          candidateVersion: true,
          sourceAsset: {
            select: { id: true, sha256: true, mimeType: true, fileName: true },
          },
          revision: {
            select: {
              id: true,
              sourceJobId: true,
              publicationStatus: true,
              publishedAt: true,
              geometryHash: true,
              sourceManifestJson: true,
              constructionEvidenceJson: true,
              addressBindings: {
                select: {
                  id: true,
                  countryCode: true,
                  addressNormalized: true,
                  block: true,
                  street: true,
                  postalCode: true,
                  stack: true,
                  floorMin: true,
                  floorMax: true,
                  transform: true,
                  sourceEvidenceJson: true,
                },
              },
            },
          },
        },
      });
      if (!job) throw new Error("RETIRE_JOB_NOT_FOUND");
      if (!job.revision) throw new Error("RETIRE_REVISION_NOT_FOUND");
      if (job.revision.id !== revisionId) throw new Error("RETIRE_REVISION_MISMATCH");
      if (job.revision.publicationStatus === "retired") {
        throw new Error("RETIRE_ALREADY_RETIRED");
      }
      if (job.revision.publicationStatus === "draft") {
        throw new Error("RETIRE_TARGET_NOT_APPROVED_OR_PUBLISHED");
      }

      const expectedJobStatus =
        job.revision.publicationStatus === "approved" ? "ready" : "published";
      const publicationTimestampIsConsistent =
        job.revision.publicationStatus === "approved"
          ? job.revision.publishedAt === null
          : job.revision.publishedAt !== null;
      if (job.status !== expectedJobStatus || !publicationTimestampIsConsistent) {
        throw new Error("RETIRE_JOB_STATUS_CONFLICT");
      }

      const audit = await retireFloorPlanRevisionWithoutReplacement({
        tx,
        revision: {
          ...job.revision,
          sourceJob: {
            candidateVersion: job.candidateVersion,
            sourceAsset: job.sourceAsset,
          },
        },
        actorEmail: retiredBy,
        occurredAt: retiredAt,
        reason,
      });
      return {
        revisionId: job.revision.id,
        publicationStatus: "retired" as const,
        jobStatus: job.status,
        retiredAt: audit.occurredAt.toISOString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "RETIRE_JOB_NOT_FOUND") {
      return error("Floor-plan import not found", 404);
    }
    if (message === "RETIRE_REVISION_NOT_FOUND") {
      return error("This import has no immutable revision to retire", 409);
    }
    if (message === "RETIRE_REVISION_MISMATCH") {
      return error("The revision changed; reload before withdrawing it", 409);
    }
    if (message === "RETIRE_ALREADY_RETIRED") {
      return error("This floor-plan revision is already retired", 409);
    }
    if (message === "RETIRE_TARGET_NOT_APPROVED_OR_PUBLISHED") {
      return error("Only an approved or published revision can be retired", 409);
    }
    if (message === "RETIRE_JOB_STATUS_CONFLICT") {
      return error("The import and revision lifecycle are inconsistent; reload before retiring", 409);
    }
    if (message === "RETIRE_REASON_REQUIRED" || message === "RETIRE_REASON_TOO_LONG") {
      return error("A valid withdrawal reason is required", 400);
    }
    if (
      message === "RETIRE_CONFLICT" ||
      errorCode(cause) === "P2002" ||
      errorCode(cause) === "P2034"
    ) {
      return error("The revision changed while it was being retired; reload it", 409);
    }
    if (message.includes("FLOOR_PLAN_REVISION_IMMUTABLE")) {
      return error(message.replace(/^.*FLOOR_PLAN_REVISION_IMMUTABLE:\s*/, ""), 409);
    }
    console.error("Floor-plan retirement failed", cause);
    return error("Unable to retire the floor plan", 500);
  }
}
