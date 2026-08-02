import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { prisma } from "@/lib/prisma";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { floorPlanMvpBlockingIssueIds } from "@/lib/floor-plan-imports/types";
import { validateReviewIssueResolution } from "@/lib/floor-plan-imports/review";
import {
  compileCandidateFloorPlanDocumentV2,
  hasUnresolvedCriticalIssues,
  MAX_FLOOR_PLAN_CANDIDATE_BYTES,
  parseCandidate,
  parseReviewIssues,
} from "@/lib/floor-plan-imports/validation";

export const runtime = "nodejs";

const MAX_ADMIN_FLOOR_PLAN_REVIEW_BODY_BYTES =
  MAX_FLOOR_PLAN_CANDIDATE_BYTES + 2 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const job = await prisma.floorPlanImportJob.findUnique({
    where: { id },
    include: {
      sourceAsset: {
        select: { id: true, fileName: true, mimeType: true, byteLength: true, sha256: true },
      },
      supplementarySources: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          createdAt: true,
          purpose: true,
          renderedPagesJson: true,
          attachedToCandidateAt: true,
          attachedByEmail: true,
          sourceAsset: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              byteLength: true,
              sha256: true,
              contentDeletedAt: true,
            },
          },
        },
      },
      constructionSources: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          createdAt: true,
          evidenceKind: true,
          renderedPagesJson: true,
          authorizedAt: true,
          authorizedByEmail: true,
          attachedToCandidateAt: true,
          sourceAsset: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              byteLength: true,
              sha256: true,
              contentDeletedAt: true,
            },
          },
        },
      },
      revision: {
        include: {
          addressBindings: true,
          auditEvents: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] },
          publicMetadata: true,
        },
      },
    },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let payload: Record<string, unknown>;
  try {
    payload = await readBoundedJsonObject(
      request,
      MAX_ADMIN_FLOOR_PLAN_REVIEW_BODY_BYTES
    );
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Floor-plan review payload is too large" },
        { status: 413 }
      );
    }
    return NextResponse.json({ error: "Invalid review payload" }, { status: 400 });
  }
  const current = await prisma.floorPlanImportJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      candidateJson: true,
      candidateVersion: true,
      reviewIssuesJson: true,
      correctionLogJson: true,
      revision: { select: { id: true } },
      sourceAsset: { select: { id: true, sha256: true } },
    },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.revision) {
    return NextResponse.json(
      { error: "Approved revisions are immutable; create a new import revision" },
      { status: 409 }
    );
  }
  if (!["needs_review", "ready", "validating"].includes(current.status)) {
    return NextResponse.json({ error: "This import is not reviewable" }, { status: 409 });
  }
  if (
    !Number.isInteger(payload.candidateVersion) ||
    payload.candidateVersion !== current.candidateVersion
  ) {
    return NextResponse.json({ error: "The candidate changed; reload it" }, { status: 409 });
  }

  try {
    const currentCompiled = compileCandidateFloorPlanDocumentV2(current.candidateJson);
    const candidate = parseCandidate(payload.candidate);
    const nextCompiled = compileCandidateFloorPlanDocumentV2(candidate);
    const currentSource = currentCompiled.document.sources.find(
      (source) => source.id === current.sourceAsset.id
    );
    const nextSource = nextCompiled.document.sources.find(
      (source) => source.id === current.sourceAsset.id
    );
    if (
      !currentSource ||
      currentSource.sha256 !== current.sourceAsset.sha256 ||
      !nextSource ||
      nextSource.sha256 !== current.sourceAsset.sha256 ||
      hashCanonicalJson(nextCompiled.document.sources) !==
        hashCanonicalJson(currentCompiled.document.sources)
    ) {
      return NextResponse.json(
        { error: "Candidate source provenance does not match the uploaded asset" },
        { status: 409 }
      );
    }
    if (
      nextCompiled.document.id !== currentCompiled.document.id ||
      nextCompiled.document.revisionId !== currentCompiled.document.revisionId ||
      nextCompiled.document.verification.tier !== "needs_review"
    ) {
      return NextResponse.json(
        { error: "Document identity and verification tier cannot be changed here" },
        { status: 409 }
      );
    }
    const submittedIssues = parseReviewIssues(payload.reviewIssues);
    const existingIssues = parseReviewIssues(current.reviewIssuesJson);
    const existingSubmitted = submittedIssues.filter((issue) =>
      existingIssues.some((currentIssue) => currentIssue.id === issue.id)
    );
    const resolvedExisting = validateReviewIssueResolution(
      existingIssues,
      existingSubmitted
    );
    const addedIssues = submittedIssues.filter(
      (issue) => !existingIssues.some((currentIssue) => currentIssue.id === issue.id)
    );
    const reviewIssues = [...resolvedExisting, ...addedIssues];
    const criticalIssueIds = floorPlanMvpBlockingIssueIds(reviewIssues);
    const reviewedDocument = {
      ...nextCompiled.document,
      verification: { tier: "needs_review" as const, criticalIssueIds },
    };
    compileCandidateFloorPlanDocumentV2(reviewedDocument);
    const nextVersion = current.candidateVersion + 1;
    const correctionLog = Array.isArray(current.correctionLogJson)
      ? current.correctionLogJson
      : [];
    const update = await prisma.floorPlanImportJob.updateMany({
      where: {
        id,
        status: current.status,
        candidateVersion: current.candidateVersion,
        revision: { is: null },
      },
      data: {
        candidateJson: reviewedDocument as unknown as Prisma.InputJsonValue,
        reviewIssuesJson: reviewIssues as Prisma.InputJsonValue,
        correctionLogJson: [
          ...correctionLog,
          {
            at: new Date().toISOString(),
            actorAdmin: session?.user?.email ?? "local-admin",
            note:
              typeof payload.correctionNote === "string"
                ? payload.correctionNote.trim().slice(0, 2_000)
                : null,
            candidateHash: hashCanonicalJson(reviewedDocument),
            candidateVersion: nextVersion,
          },
        ] as Prisma.InputJsonValue,
        candidateVersion: nextVersion,
        sourceObservationManifestJson: Prisma.DbNull,
        sourceObservationVersion: { increment: 1 },
        status: hasUnresolvedCriticalIssues(reviewIssues) ? "needs_review" : "ready",
        progress: hasUnresolvedCriticalIssues(reviewIssues) ? 85 : 100,
        errorMessage: null,
      },
    });
    if (update.count !== 1) {
      return NextResponse.json({ error: "The candidate changed; reload it" }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      status: hasUnresolvedCriticalIssues(reviewIssues) ? "needs_review" : "ready",
      candidateVersion: nextVersion,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid floor-plan review";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
