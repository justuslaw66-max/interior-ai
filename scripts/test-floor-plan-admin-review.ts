import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import {
  decideFloorPlanAdminReviewReload,
  fingerprintFloorPlanAdminReviewDraft,
  type FloorPlanAdminReviewDraftInput,
} from "@/lib/floor-plan-admin-review-draft";
import {
  cancelFloorPlanAdminJobMutation,
  notifyFloorPlanAdminJobUpdated,
  requestFloorPlanAdminJobMutation,
  subscribeToFloorPlanAdminJobMutationCancellations,
  subscribeToFloorPlanAdminJobMutationRequests,
  subscribeToFloorPlanAdminJobUpdates,
} from "@/lib/floor-plan-admin-review-events";
import {
  buildFloorPlanAdminSourceOverlay,
  collectFloorPlanCriticalEntityIds,
  collectFloorPlanPrintedDimensionIds,
} from "@/lib/floor-plan-imports/admin-review";

const provenance: FloorPlanEntityProvenanceV2 = {
  confidence: 0.9,
  extractionVersion: "admin-review-test",
  evidence: [
    {
      sourceId: "source-1",
      basis: "vector_traced",
      confidence: 0.9,
      extractorVersion: "admin-review-test",
      pageNumber: 1,
      cropPx: { xPx: 90, yPx: 190, widthPx: 220, heightPx: 20 },
    },
  ],
  reviewHistory: [],
};

const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "admin-review-fixture",
  revisionId: "admin-review-fixture-r1",
  createdAt: "2026-07-16T00:00:00.000Z",
  verification: { tier: "needs_review", criticalIssueIds: [] },
  sources: [{
    id: "source-1",
    kind: "pdf",
    name: "fixture.pdf",
    mimeType: "application/pdf",
  }],
  floors: [{
    id: "floor-1",
    name: "Floor 1",
    levelIndex: 0,
    elevationMm: 0,
    storeyHeightMm: 2800,
    slabThicknessMm: 150,
    defaults: {
      wallHeight: { valueMm: 2600, evidence: "assumed", provenance },
      doorHeight: { valueMm: 2100, evidence: "assumed", provenance },
      windowHeight: { valueMm: 1200, evidence: "assumed", provenance },
      windowSillHeight: { valueMm: 900, evidence: "assumed", provenance },
    },
    calibrations: [{
      id: "calibration-1",
      sourceId: "source-1",
      pageNumber: 1,
      imageWidthPx: 1000,
      imageHeightPx: 800,
      controlPoints: [
        { sourcePx: { x: 100, y: 200 }, planMm: { xMm: 0, zMm: 0 } },
        { sourcePx: { x: 300, y: 200 }, planMm: { xMm: 2000, zMm: 0 } },
      ],
      rmsErrorPx: 0,
    }],
    vertices: [
      { id: "v1", xMm: 0, zMm: 0, provenance },
      { id: "v2", xMm: 2000, zMm: 0, provenance },
    ],
    walls: [{
      id: "wall-1",
      path: { kind: "line", startVertexId: "v1", endVertexId: "v2" },
      thicknessMm: 200,
      classification: "exterior",
      adjacentRoomIds: ["room-1"],
      provenance,
    }],
    rooms: [{
      id: "room-1",
      name: "Room",
      roomType: "other",
      wallLoops: [],
      provenance,
    }],
    openings: [],
    structures: [],
    annotations: [],
    dimensions: [{
      id: "dimension-1",
      fromVertexId: "v1",
      toVertexId: "v2",
      axis: "horizontal",
      measuredMm: 2000,
      provenance,
    }],
  }],
};

assert.deepEqual(
  collectFloorPlanCriticalEntityIds(document),
  ["v1", "v2", "wall-1", "room-1"]
);
assert.deepEqual(collectFloorPlanPrintedDimensionIds(document), ["dimension-1"]);

const overlay = buildFloorPlanAdminSourceOverlay(document, 1);
assert.equal(overlay.walls.length, 1);
assert.deepEqual(overlay.walls[0].points, [
  { xPx: 100, yPx: 200 },
  { xPx: 300, yPx: 200 },
]);
assert.equal(overlay.calibrations[0].points.length, 2);
assert.ok(overlay.evidence.some((item) => item.entityId === "wall-1"));
assert.deepEqual(buildFloorPlanAdminSourceOverlay(document, 2), {
  evidence: [],
  walls: [],
  calibrations: [],
  anchorResiduals: [],
  anchorIssues: [],
});

const cleanDraft: FloorPlanAdminReviewDraftInput = {
  candidateText: JSON.stringify(document, null, 2),
  issues: [{ id: "issue-1", resolved: false }],
  correctionNote: "",
};
const baselineFingerprint = fingerprintFloorPlanAdminReviewDraft(cleanDraft);
for (const changedDraft of [
  { ...cleanDraft, candidateText: `${cleanDraft.candidateText}\n ` },
  { ...cleanDraft, issues: [{ id: "issue-1", resolved: true }] },
  { ...cleanDraft, correctionNote: "Corrected against page 1." },
]) {
  assert.notEqual(
    fingerprintFloorPlanAdminReviewDraft(changedDraft),
    baselineFingerprint,
    "every persisted review-correction field must participate in dirty detection"
  );
}
const dirtyFingerprint = fingerprintFloorPlanAdminReviewDraft({
  ...cleanDraft,
  correctionNote: "Unsaved source correction",
});
assert.equal(
  decideFloorPlanAdminReviewReload({
    baselineFingerprint,
    currentFingerprint: dirtyFingerprint,
  }),
  "preserve",
  "an unrelated sibling update must not overwrite a dirty review"
);
assert.equal(
  decideFloorPlanAdminReviewReload({
    baselineFingerprint,
    currentFingerprint: dirtyFingerprint,
    confirmedFingerprint: dirtyFingerprint,
  }),
  "reload",
  "the exact draft explicitly confirmed by the reviewer may be discarded"
);
assert.equal(
  decideFloorPlanAdminReviewReload({
    baselineFingerprint,
    currentFingerprint: `${dirtyFingerprint}-edited-after-confirmation`,
    confirmedFingerprint: dirtyFingerprint,
  }),
  "preserve",
  "edits made after confirmation must still be preserved"
);
assert.equal(
  decideFloorPlanAdminReviewReload({
    baselineFingerprint,
    currentFingerprint: baselineFingerprint,
  }),
  "reload"
);

const fakeWindow = new EventTarget();
(globalThis as unknown as { window: EventTarget }).window = fakeWindow;
const rejectMutation = subscribeToFloorPlanAdminJobMutationRequests(
  "job-1",
  () => false
);
assert.equal(
  requestFloorPlanAdminJobMutation("job-1", "Replacing the candidate"),
  null,
  "a dirty-workspace listener must be able to synchronously stop the API mutation"
);
rejectMutation();
let requestedMutationId = "";
const acceptMutation = subscribeToFloorPlanAdminJobMutationRequests(
  "job-1",
  (detail) => {
    requestedMutationId = detail.mutationId;
    return true;
  }
);
const acceptedMutationId = requestFloorPlanAdminJobMutation(
  "job-1",
  "Replacing the candidate"
);
assert.equal(acceptedMutationId, requestedMutationId);
let notifiedMutationId = "";
const unsubscribeUpdate = subscribeToFloorPlanAdminJobUpdates("job-1", (detail) => {
  notifiedMutationId = detail.mutationId ?? "";
});
notifyFloorPlanAdminJobUpdated("job-1", { mutationId: acceptedMutationId ?? undefined });
assert.equal(notifiedMutationId, acceptedMutationId);
let cancelledMutationId = "";
const unsubscribeCancellation = subscribeToFloorPlanAdminJobMutationCancellations(
  "job-1",
  (detail) => {
    cancelledMutationId = detail.mutationId ?? "";
  }
);
cancelFloorPlanAdminJobMutation("job-1", acceptedMutationId ?? "missing");
assert.equal(cancelledMutationId, acceptedMutationId);
acceptMutation();
unsubscribeUpdate();
unsubscribeCancellation();

const root = process.cwd();
const workspaceSource = fs.readFileSync(
  path.join(root, "app/admin/floor-plans/[id]/FloorPlanReviewWorkspace.tsx"),
  "utf8"
) + fs.readFileSync(
  path.join(root, "app/admin/floor-plans/[id]/useFloorPlanReviewWorkspace.ts"),
  "utf8"
);
const supplementaryPanelSource = fs.readFileSync(
  path.join(root, "app/admin/floor-plans/[id]/SupplementarySourceEvidencePanel.tsx"),
  "utf8"
);
const seedPanelSource = fs.readFileSync(
  path.join(root, "app/admin/floor-plans/[id]/PingYiReviewSeedIntake.tsx"),
  "utf8"
);
assert.match(workspaceSource, /useFloorPlanReviewDraftGuard/);
assert.match(workspaceSource, /hasUnsavedChanges/);
assert.match(supplementaryPanelSource, /requestFloorPlanAdminJobMutation/);
assert.match(supplementaryPanelSource, /candidateVersion: job\.candidateVersion/);
assert.match(supplementaryPanelSource, /notifyFloorPlanAdminJobUpdated\(jobId, \{ mutationId \}\)/);
assert.match(seedPanelSource, /requestFloorPlanAdminJobMutation/);
assert.match(seedPanelSource, /candidateVersion: availability\.candidateVersion/);
assert.match(seedPanelSource, /notifyFloorPlanAdminJobUpdated\(jobId, \{ mutationId \}\)/);
assert.doesNotMatch(seedPanelSource, /location\.reload/);

console.log("floor-plan admin review helpers: ok");
