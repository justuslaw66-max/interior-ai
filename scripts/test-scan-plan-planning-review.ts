import assert from "node:assert/strict";
import { calibratedScaleFixture, scaleMeasurement } from "./fixtures/scan-to-editable-plan/scale-review";
import { recordFloorPlanPlanningReview, currentFloorPlanPlanningReview, floorPlanReviewStatusLabel } from "@/lib/floor-plan-planning-review";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyConfirmedConsumerWallEditV2 } from "@/lib/floor-plan-consumer-wall-edit";
import { changeReviewMeasurement } from "@/lib/floor-plan-review-measurements";
import { applyConsumerOrientation } from "@/lib/floor-plan-import-review-geometry";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { applyConsumerFloorPlanCorrection } from "@/lib/floor-plan-imports/review";

const source = calibratedScaleFixture(), original = JSON.stringify(source);
assert.equal(floorPlanReviewStatusLabel(source), "Needs review");
const reviewed = recordFloorPlanPlanningReview(source, "reviewer", "2026-09-15T00:00:00Z");
assert.equal(JSON.stringify(source), original);
assert.equal(floorPlanReviewStatusLabel(reviewed), "User-reviewed for planning");
assert.equal(reviewed.verification.tier, "needs_review");
assert.equal(currentFloorPlanPlanningReview(reviewed)?.reviewerId, "reviewer");
assert.ok(!reviewed.verification.approvedBy && !reviewed.verification.approvedAt);
const snapshot = canonicalFloorPlanToDesignSnapshot(reviewed).snapshot;
const reloaded = storedToSnapshot(snapshotToStored(snapshot));
assert.deepEqual(reloaded.floorPlan!.canonicalDocument, reviewed);
const changed = applyConfirmedConsumerWallEditV2({ snapshot, sourceEditConfirmed: true,
  operation: { kind: "remove_wall", floorId: "apartment", wallId: "shared", confirmedOpeningIds: ["door"], keepRoomId: "living" },
  context: { mutationId: "planning-edit", nextRevisionId: "planning-proposal", actorId: "reviewer", mutatedAt: "2026-09-15T01:00:00Z" } }).snapshot;
assert.equal(floorPlanReviewStatusLabel(changed.floorPlan!.canonicalDocument!), "Needs review");
assert.equal(floorPlanReviewStatusLabel(changed.floorPlan!.proposal!.originalDocument), "User-reviewed for planning");
assert.equal(currentFloorPlanPlanningReview(changed.floorPlan!.canonicalDocument!), null);
assert.equal(floorPlanReviewStatusLabel(snapshot.floorPlan!.canonicalDocument!), "User-reviewed for planning", "Undo restores the complete reviewed baseline.");
assert.equal(floorPlanReviewStatusLabel(storedToSnapshot(snapshotToStored(changed)).floorPlan!.canonicalDocument!), "Needs review");
const measured = changeReviewMeasurement({ document: reviewed, floorId: "apartment", calibrationId: "scale", measurement: scaleMeasurement() });
assert.equal(floorPlanReviewStatusLabel(measured), "Needs review");
assert.equal(floorPlanReviewStatusLabel(applyConsumerOrientation(reviewed, "mirror_x")), "Needs review");
const correction = applyConsumerFloorPlanCorrection({ current: source, next: reviewed, sourceId: "authored-source", sourceSha256: "a".repeat(64),
  userId: "reviewer", currentIssues: [], submittedIssues: [], note: "Correction cannot self-certify planning review" }).document;
assert.equal(currentFloorPlanPlanningReview(correction), null);
for (const mutate of [
  (doc: typeof source) => { doc.revisionId = "newer"; },
  (doc: typeof source) => { doc.floors[0].vertices[0].xMm++; },
  (doc: typeof source) => { doc.verification.criticalIssueIds.push("unresolved"); },
  (doc: typeof source) => { doc.verification.planningReview!.reviewedAt = "invalid"; },
  (doc: typeof source) => { doc.verification.planningReview!.geometryHash = "a".repeat(64); },
]) {
  const stale = structuredClone(reviewed); mutate(stale);
  assert.equal(currentFloorPlanPlanningReview(stale), null);
}
for (const tier of ["source_verified", "construction_verified"] as const) {
  const verified = structuredClone(reviewed); verified.verification.tier = tier;
  assert.equal(currentFloorPlanPlanningReview(verified), null);
  assert.throws(() => recordFloorPlanPlanningReview(verified, "reviewer"), /planning review/);
  assert.equal(floorPlanReviewStatusLabel(verified), tier === "source_verified" ? "Source verified" : "Construction verified");
}
assert.throws(() => recordFloorPlanPlanningReview(source, ""));
assert.throws(() => recordFloorPlanPlanningReview(source, "reviewer", "invalid"));
console.log("PASS: separate planning-review record, immutable source, persistence, mutation invalidation, original comparison, undo baseline and stale/forged-metadata rejection; no verified tier.");
