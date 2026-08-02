import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import {
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { loadFloorPlanAuthoredVariantRevisionSnapshots } from "@/lib/floor-plan-authored-variant-admin";
import { validateFloorPlanAuthoredVariantApproval } from "@/lib/floor-plan-authored-variant-links";
import {
  assertDistinctFloorPlanReviewerPublisher,
  requireFloorPlanPublisher,
} from "@/lib/floor-plan-imports/publication-governance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Publisher-only transition for a reviewer-approved immutable link group. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  let publishedBy: string;
  try {
    publishedBy = requireFloorPlanPublisher(session?.user?.email);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Publisher role required", 403);
  }
  const { id } = await params;
  const group = await prisma.floorPlanAuthoredVariantGroup.findUnique({
    where: { id },
    select: {
      id: true,
      groupKey: true,
      label: true,
      publicationStatus: true,
      approvedByEmail: true,
      publishedAt: true,
      options: {
        select: {
          optionKey: true,
          label: true,
          revisionId: true,
          addressBindingId: true,
          geometryHash: true,
          sourceId: true,
          sourcePage: true,
          defaultSelected: true,
        },
      },
    },
  });
  if (!group) return error("Authored variant group not found", 404);
  if (group.publicationStatus === "published" && group.publishedAt) {
    return NextResponse.json({
      group: { id: group.id, groupKey: group.groupKey, publicationStatus: "published" },
    });
  }
  if (group.publicationStatus !== "approved") {
    return error("Only an approved authored variant group can be published", 409);
  }

  try {
    assertDistinctFloorPlanReviewerPublisher({
      reviewerEmail: group.approvedByEmail,
      publisherEmail: publishedBy,
    });
    const approval = {
      groupId: group.groupKey,
      label: group.label,
      variants: group.options.map((option) => ({
        optionId: option.optionKey,
        label: option.label,
        revisionId: option.revisionId,
        addressBindingId: option.addressBindingId,
        geometryHash: option.geometryHash,
        sourceId: option.sourceId,
        ...(option.sourcePage === null ? {} : { pageNumber: option.sourcePage }),
        defaultSelected: option.defaultSelected,
      })),
    };
    const revisions = await loadFloorPlanAuthoredVariantRevisionSnapshots(
      approval.variants.map(({ revisionId, addressBindingId }) => ({
        revisionId,
        addressBindingId,
      }))
    );
    validateFloorPlanAuthoredVariantApproval({ request: approval, revisions });
    const now = new Date();
    const published = await prisma.$transaction(async (tx) => {
      const live = await tx.floorPlanAuthoredVariantGroup.findUnique({
        where: { id: group.id },
        select: {
          publicationStatus: true,
          options: {
            select: {
              geometryHash: true,
              revisionId: true,
              defaultSelected: true,
              revision: {
                select: {
                  geometryHash: true,
                  publicationStatus: true,
                  publishedAt: true,
                },
              },
              addressBinding: {
                select: { revisionId: true, role: true },
              },
            },
          },
        },
      });
      if (
        !live ||
        live.publicationStatus !== "approved" ||
        live.options.some(
          (option) =>
            option.revision.publicationStatus !== "published" ||
            !option.revision.publishedAt ||
            option.revision.geometryHash !== option.geometryHash ||
            option.addressBinding.revisionId !== option.revisionId ||
            (option.defaultSelected
              ? option.addressBinding.role !== "catalog"
              : option.addressBinding.role !== "authored_variant")
        )
      ) {
        throw new Error("A referenced floor-plan revision is no longer publishable");
      }
      const changed = await tx.floorPlanAuthoredVariantGroup.updateMany({
        where: { id: group.id, publicationStatus: "approved" },
        data: {
          publicationStatus: "published",
          publishedAt: now,
          publishedByEmail: publishedBy,
        },
      });
      if (changed.count !== 1) throw new Error("Authored variant group changed during publication");
      return { id: group.id, groupKey: group.groupKey, publicationStatus: "published" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ group: published });
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Authored variant publication failed", 409);
  }
}

/** Retires only the public relationship; immutable revisions/designs remain. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  let retiredBy: string;
  try {
    retiredBy = requireFloorPlanPublisher(session?.user?.email);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Publisher role required", 403);
  }
  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, 16 * 1024);
  } catch (cause) {
    return error(
      cause instanceof RequestBodyTooLargeError
        ? "Retirement payload is too large"
        : "Invalid retirement payload",
      cause instanceof RequestBodyTooLargeError ? 413 : 400
    );
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 10 || reason.length > 1_000) {
    return error("A retirement reason of 10 to 1000 characters is required", 400);
  }
  const { id } = await params;
  const now = new Date();
  try {
    const changed = await prisma.floorPlanAuthoredVariantGroup.updateMany({
      where: { id, publicationStatus: "published" },
      data: {
        publicationStatus: "retired",
        retiredAt: now,
        retiredByEmail: retiredBy,
        retirementReason: reason,
      },
    });
    if (changed.count !== 1) {
      const existing = await prisma.floorPlanAuthoredVariantGroup.findUnique({
        where: { id },
        select: { publicationStatus: true },
      });
      if (!existing) return error("Authored variant group not found", 404);
      if (existing.publicationStatus === "retired") {
        return NextResponse.json({ group: { id, publicationStatus: "retired" } });
      }
      return error("Only a published authored variant group can be retired", 409);
    }
    return NextResponse.json({ group: { id, publicationStatus: "retired" } });
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Retirement failed", 409);
  }
}
