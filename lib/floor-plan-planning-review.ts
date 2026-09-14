import { z } from "zod";
import type { FloorPlanDocumentV2 } from "./floor-plan-document-v2";
import { hashFloorPlanGeometryV2 } from "./floor-plan-compiler-v2";

const planningReviewSchema = z.object({
  reviewerId: z.string().trim().min(1).max(200), reviewedAt: z.string().datetime(),
  revisionId: z.string().min(1).max(200), geometryHash: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Called only after the confirmation handler has checked current import readiness. */
export function recordFloorPlanPlanningReview(document: FloorPlanDocumentV2, reviewerId: string, reviewedAt = new Date().toISOString()): FloorPlanDocumentV2 {
  if (document.verification.tier !== "needs_review" || document.verification.criticalIssueIds.length) {
    throw new Error("Resolve the planning review before confirming this imported plan.");
  }
  const planningReview = planningReviewSchema.parse({ reviewerId, reviewedAt, revisionId: document.revisionId, geometryHash: hashFloorPlanGeometryV2(document) });
  return { ...document, verification: { tier: "needs_review" as const, criticalIssueIds: [], planningReview } };
}

/** Treat stale or malformed metadata as unreviewed, even if supplied by a saved snapshot. */
export function currentFloorPlanPlanningReview(document: FloorPlanDocumentV2) {
  const result = planningReviewSchema.safeParse(document.verification.planningReview);
  if (!result.success || document.verification.tier !== "needs_review" || document.verification.criticalIssueIds.length ||
    result.data.revisionId !== document.revisionId || result.data.geometryHash !== hashFloorPlanGeometryV2(document)) return null;
  return result.data;
}

export function floorPlanReviewStatusLabel(document: FloorPlanDocumentV2) {
  if (document.verification.tier === "construction_verified") return "Construction verified";
  if (document.verification.tier === "source_verified") return "Source verified";
  return currentFloorPlanPlanningReview(document) ? "User-reviewed for planning" : "Needs review";
}
