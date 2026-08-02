import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/bounded-request-body";
import { loadFloorPlanAuthoredVariantRevisionSnapshots } from "@/lib/floor-plan-authored-variant-admin";
import {
  parseFloorPlanAuthoredVariantApprovalRequest,
  validateFloorPlanAuthoredVariantApproval,
} from "@/lib/floor-plan-authored-variant-links";
import { requireFloorPlanReviewer } from "@/lib/floor-plan-imports/publication-governance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  let approvedBy: string;
  try {
    approvedBy = requireFloorPlanReviewer(session?.user?.email);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Reviewer role required", 403);
  }

  try {
    const body = await readBoundedJsonObject(request, MAX_BODY_BYTES);
    const approval = parseFloorPlanAuthoredVariantApprovalRequest(body);
    const revisions = await loadFloorPlanAuthoredVariantRevisionSnapshots(
      approval.variants.map(({ revisionId, addressBindingId }) => ({
        revisionId,
        addressBindingId,
      }))
    );
    validateFloorPlanAuthoredVariantApproval({ request: approval, revisions });
    const now = new Date();
    const group = await prisma.$transaction(async (tx) => {
      const draft = await tx.floorPlanAuthoredVariantGroup.create({
        data: {
          groupKey: approval.groupId,
          label: approval.label,
          publicationStatus: "draft",
        },
        select: { id: true },
      });
      await tx.floorPlanAuthoredVariantOption.createMany({
        data: approval.variants.map((variant) => ({
          groupId: draft.id,
          optionKey: variant.optionId,
          label: variant.label,
          revisionId: variant.revisionId,
          addressBindingId: variant.addressBindingId,
          geometryHash: variant.geometryHash,
          sourceId: variant.sourceId,
          sourcePage: variant.pageNumber ?? null,
          defaultSelected: variant.defaultSelected,
          sourceEvidenceJson: {
            basis: "direct_source_configuration",
            sourceId: variant.sourceId,
            pageNumber: variant.pageNumber ?? null,
            revisionId: variant.revisionId,
            geometryHash: variant.geometryHash,
          },
        })),
      });
      return tx.floorPlanAuthoredVariantGroup.update({
        where: { id: draft.id },
        data: {
          publicationStatus: "approved",
          approvedAt: now,
          approvedByEmail: approvedBy,
        },
        select: {
          id: true,
          groupKey: true,
          publicationStatus: true,
          approvedAt: true,
          options: {
            select: { optionKey: true, revisionId: true, defaultSelected: true },
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ group }, { status: 201 });
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Authored variant payload is too large", 413);
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return error("That authored variant group or option already exists", 409);
    }
    return error(cause instanceof Error ? cause.message : "Invalid authored variant group", 400);
  }
}
