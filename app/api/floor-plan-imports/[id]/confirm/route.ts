import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { snapshotToLegacyApi } from "@/lib/room-persistence";
import {
  compileCandidateFloorPlanDocumentV2,
  hasUnresolvedCriticalIssues,
  parseReviewIssues,
} from "@/lib/floor-plan-imports/validation";
import { collectFloorPlanImportReadinessIssues } from "@/lib/floor-plan-imports/readiness";
import { isFloorPlanMvpBlockingIssue } from "@/lib/floor-plan-imports/types";
import { syncFloorPlanDesignReference } from "@/lib/floor-plan-design-reference";

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
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).title === "string"
      ? (body as Record<string, unknown>).title!.toString().trim().slice(0, 160)
      : "Imported floor plan";
  const expectedCandidateVersion =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).candidateVersion
      : null;
  if (!Number.isInteger(expectedCandidateVersion)) {
    return error("candidateVersion is required", 400);
  }

  const job = await prisma.floorPlanImportJob.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      candidateVersion: true,
      candidateJson: true,
      sourceManifestJson: true,
      renderedPagesJson: true,
      reviewIssuesJson: true,
      appliedDesignId: true,
      revision: { select: { id: true } },
      sourceAsset: {
        select: {
          id: true,
          sha256: true,
          fileName: true,
          mimeType: true,
        },
      },
    },
  });
  if (!job) return error("Floor-plan import not found", 404);
  if (job.appliedDesignId) {
    return NextResponse.json({ id: job.appliedDesignId, alreadyApplied: true });
  }
  if (job.revision) {
    return error("This import is reserved for its approved public revision", 409);
  }
  if (job.status !== "ready") return error("Floor-plan import is not ready to apply", 409);
  if (job.candidateVersion !== expectedCandidateVersion) {
    return error("The candidate changed; review it again before creating a design", 409);
  }
  const reviewIssues = parseReviewIssues(job.reviewIssuesJson);
  if (hasUnresolvedCriticalIssues(reviewIssues)) {
    return error("Critical floor-plan issues must be resolved before creating a design", 409);
  }

  let canonicalDesign: ReturnType<typeof canonicalFloorPlanToDesignSnapshot>;
  try {
    const compiled = compileCandidateFloorPlanDocumentV2(job.candidateJson);
    const readinessIssues = collectFloorPlanImportReadinessIssues({
      document: compiled.document,
      sourceManifest:
        job.sourceManifestJson &&
        typeof job.sourceManifestJson === "object" &&
        !Array.isArray(job.sourceManifestJson)
          ? (job.sourceManifestJson as Record<string, unknown>)
          : null,
    });
    if (readinessIssues.some(isFloorPlanMvpBlockingIssue)) {
      return error(
        "The imported floor plan is not source-complete. Finish room, scale, and printed-dimension review before creating a design",
        409
      );
    }
    const source = compiled.document.sources.find(
      (entry) => entry.id === job.sourceAsset.id
    );
    if (!source || source.sha256 !== job.sourceAsset.sha256) {
      return error("The floor-plan candidate is not bound to its uploaded source", 409);
    }
    canonicalDesign = canonicalFloorPlanToDesignSnapshot(compiled.document, {
      title: title || "Imported floor plan",
      sourceJobId: id,
      sourceAssetSha256: job.sourceAsset.sha256,
      orientationConfirmed: true,
      underlay: (() => {
        const floor = compiled.document.floors[0];
        const calibration = floor?.calibrations[0];
        const renderedPages = Array.isArray(job.renderedPagesJson)
          ? (job.renderedPagesJson as Array<{
              pageNumber?: unknown;
              widthPx?: unknown;
              heightPx?: unknown;
              assetKey?: unknown;
            }>)
          : [];
        const rendered = renderedPages.find(
          (page) => page.pageNumber === calibration?.pageNumber
        );
        if (
          !calibration ||
          !rendered ||
          typeof rendered.assetKey !== "string" ||
          !Number.isFinite(rendered.widthPx) ||
          !Number.isFinite(rendered.heightPx)
        ) {
          return null;
        }
        const [first, second] = calibration.controlPoints;
        const sourceDistancePx =
          first && second
            ? Math.hypot(
                second.sourcePx.x - first.sourcePx.x,
                second.sourcePx.y - first.sourcePx.y
              )
            : 0;
        const planDistanceMm =
          first && second
            ? Math.hypot(
                second.planMm.xMm - first.planMm.xMm,
                second.planMm.zMm - first.planMm.zMm
              )
            : 0;
        if (sourceDistancePx <= 0 || planDistanceMm <= 0) return null;
        const millimetresPerPixel = planDistanceMm / sourceDistancePx;
        const widthPx = Number(rendered.widthPx);
        const heightPx = Number(rendered.heightPx);
        const widthMeters = (widthPx * millimetresPerPixel) / 1_000;
        const depthMeters = (heightPx * millimetresPerPixel) / 1_000;
        return {
          id: `import-underlay-${id}`,
          floorId: floor.id,
          name: job.sourceAsset.fileName,
          assetUrl: `/api/floor-plan-imports/${encodeURIComponent(
            id
          )}/assets/${encodeURIComponent(rendered.assetKey)}`,
          mimeType: "image/png",
          sourceMimeType: job.sourceAsset.mimeType,
          sourceAssetSha256: job.sourceAsset.sha256,
          sourceJobId: id,
          renderedPage: calibration.pageNumber,
          pageCount: renderedPages.length,
          widthPx,
          heightPx,
          position: {
            x: widthMeters / 2,
            z: depthMeters / 2,
          },
          widthMeters,
          depthMeters,
          opacity: 0.45,
          visible: false,
          rotationDeg: 0,
          locked: true,
          calibration: {
            pixelsPerMeter: 1_000 / millimetresPerPixel,
            referenceLengthMeters: planDistanceMm / 1_000,
            referencePointsPx: [
              { x: first.sourcePx.x, y: first.sourcePx.y },
              { x: second.sourcePx.x, y: second.sourcePx.y },
            ],
          },
        };
      })(),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid canonical floor plan";
    return error(message, 409);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (user?.plan !== "pro") {
    const designCount = await prisma.design.count({ where: { userId } });
    if (designCount >= 20) return error("Free beta limit reached (max 20 designs)", 403);
  }

  const payload = snapshotToLegacyApi(canonicalDesign.snapshot);
  try {
    const design = await prisma.$transaction(async (tx) => {
      const created = await tx.design.create({
        data: {
          title: payload.title,
          roomWidth: payload.roomWidth,
          roomDepth: payload.roomDepth,
          items: payload.items as unknown as Prisma.InputJsonValue,
          ...(payload.snapshot
            ? { snapshot: payload.snapshot as unknown as Prisma.InputJsonValue }
            : {}),
          zones: payload.zones as unknown as Prisma.InputJsonValue,
          savedViews: payload.savedViews as unknown as Prisma.InputJsonValue,
          userId,
          style: payload.style,
          budget: payload.budget,
          mode: payload.mode,
          notes: payload.notes,
        },
        select: { id: true, snapshot: true },
      });
      if (
        !created.snapshot ||
        hashCanonicalJson(created.snapshot) !== hashCanonicalJson(payload.snapshot)
      ) {
        throw new Error("DESIGN_PERSISTENCE_MISMATCH");
      }
      await syncFloorPlanDesignReference({
        client: tx,
        designId: created.id,
        ownerUserId: userId,
        snapshot: created.snapshot,
      });
      const applied = await tx.floorPlanImportJob.updateMany({
        where: {
          id,
          userId,
          status: "ready",
          candidateVersion: job.candidateVersion,
          appliedDesignId: null,
          revision: { is: null },
        },
        data: {
          status: "applied",
          statusChangedAt: new Date(),
          appliedDesignId: created.id,
          confirmedAt: new Date(),
          progress: 100,
        },
      });
      if (applied.count !== 1) throw new Error("IMPORT_CHANGED");
      return created;
    });
    return NextResponse.json({ id: design.id, created: true }, { status: 201 });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "IMPORT_CHANGED") {
      return error("The import changed while the design was being created", 409);
    }
    if (cause instanceof Error && cause.message === "DESIGN_PERSISTENCE_MISMATCH") {
      console.error("Imported design failed its database round-trip integrity check");
      return error("Unable to persist the imported floor plan", 500);
    }
    console.error("Failed to create a design from floor-plan import", cause);
    return error("Unable to create a design from this floor plan", 500);
  }
}
