import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { floorPlanAddressBindingEvidenceSchema } from "../lib/floor-plan-imports/address-binding-evidence";
import {
  buildAddressBindingInputs,
  createAddressBindingEvidenceDraft,
  getRenderedPages,
  getReviewIssues,
  withDefaultReviewIssueResolutions,
} from "../app/admin/floor-plans/[id]/floorPlanReviewModel";

const reviewDirectory = path.join(
  process.cwd(),
  "app/admin/floor-plans/[id]"
);

function reviewSource() {
  return fs
    .readdirSync(reviewDirectory)
    .filter((fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx"))
    .map((fileName) => fs.readFileSync(path.join(reviewDirectory, fileName), "utf8"))
    .join("\n");
}

const source = reviewSource();
const visualCorrectionSource = [
  "FloorPlanScaleReviewPanel.tsx",
  "FloorPlanRoomTracePanel.tsx",
  "FloorPlanOpeningTracePanel.tsx",
  "FloorPlanSourceReviewCanvas.tsx",
].map((fileName) =>
  fs.readFileSync(
    path.join(
      process.cwd(),
      "components/editor/floor-plan-import-review",
      fileName
    ),
    "utf8"
  )
).join("\n");

// Loading and draft preservation.
assert.match(source, /\/api\/admin\/floor-plan-imports\/\$\{jobId\}/);
assert.match(source, /cache: "no-store"/);
assert.match(source, /useFloorPlanReviewDraftGuard/);
assert.match(source, /hasUnsavedChanges/);
assert.match(source, /notifyFloorPlanAdminJobUpdated\(jobId/);

// Optimistic candidate correction contract.
assert.match(source, /method: "PATCH"/);
assert.match(source, /candidateVersion: input\.job\.candidateVersion/);
assert.match(source, /reviewIssues: input\.issues/);
assert.match(source, /correctionNote/);
assert.match(source, /Save and check plan/);

// Independent observation and immutable approval contract.
assert.match(source, /SourceObservationManifestEditor/);
assert.match(source, /sourceObservationVersion: input\.job\.sourceObservationVersion/);
assert.match(source, /verificationTier/);
assert.match(source, /addressBindings/);
assert.match(source, /sourceEvidence/);
assert.match(source, /constructionEvidence/);
assert.match(source, /supersedesRevisionId/);
assert.match(source, /Approve searchable floor plan/);

// Maker-checker publication and withdrawal contract.
assert.match(source, /\/publish`/);
assert.match(source, /Confirm public library publication first/);
assert.match(source, /authorized publisher other than reviewer/);
assert.match(source, /\/retire`/);
assert.match(source, /`RETIRE \$\{job\.revision\.id\}`/);
assert.match(source, /Withdraw without replacement/);

// Source overlay and evidence affordances remain reviewable.
assert.match(source, /Get the 2D floor plan ready/);
assert.match(source, /Skip this for now/);
assert.match(source, /2D import ready — publishing can wait/);
assert.match(source, /Publish to the searchable directory \(optional — do later\)/);
assert.match(source, /2D plan preview/);
assert.match(source, /Canonical geometry and evidence overlay/);
assert.match(source, /Source verification details/);
assert.match(source, /Confirm address proof/);
assert.match(source, /Stack \/ unit position \(optional\)/);
assert.match(source, /audit record is created automatically/);
assert.match(source, /Advanced settings/);
assert.match(source, /Publishing and audit details/);
assert.match(source, /Optional improvements/);
assert.match(source, /Build the 2D plan/);
assert.match(source, /3D heights \(optional\)/);
assert.match(source, /Correct first/);
assert.match(source, /Confirm complete/);
assert.match(source, /Open the 2D checklist/);
assert.match(source, /issuesForSave/);
assert.match(visualCorrectionSource, /Use this measurement/);
assert.match(visualCorrectionSource, /Outline each room/);
assert.match(visualCorrectionSource, /Add this room/);
assert.match(visualCorrectionSource, /Add visible doors and windows/);
assert.match(visualCorrectionSource, /Add this opening/);
assert.match(visualCorrectionSource, /calculated automatically/);
assert.match(visualCorrectionSource, /Zoom in/);
assert.match(visualCorrectionSource, /Magnified selection area/);
assert.match(visualCorrectionSource, /Snap to saved corners and straight lines/);

const simpleEvidence = JSON.parse(createAddressBindingEvidenceDraft({
  binding: {
    key: "binding",
    countryCode: "SG",
    addressNormalized: "1 Raffles Place",
    block: "1",
    street: "Raffles Place",
    postalCode: "048616",
    stack: "09",
    floorMin: "2",
    floorMax: "15",
    transform: "normal",
    role: "catalog",
    sourceEvidenceText: "",
  },
  documentId: "document-1",
  page: { pageNumber: 1, widthPx: 1200, heightPx: 900, assetKey: "page-1" },
  sourceAsset: { id: "asset-1", sha256: "a".repeat(64) },
}));
assert.deepEqual(simpleEvidence.cropPx, {
  xPx: 0,
  yPx: 0,
  widthPx: 1200,
  heightPx: 900,
});
assert.deepEqual(simpleEvidence.observed, {
  documentId: "document-1",
  stacks: ["09"],
  addressNormalized: "1 Raffles Place",
  postalCode: "048616",
  block: "1",
  floorMin: 2,
  floorMax: 15,
});
assert.equal(simpleEvidence.reviewerConfirmation.confirmed, true);
assert.equal(
  floorPlanAddressBindingEvidenceSchema.safeParse(simpleEvidence).success,
  true,
  "automatically generated address proof must satisfy the publication schema"
);

assert.deepEqual(getRenderedPages([{ pageNumber: 2, widthPx: 10, heightPx: 20, assetKey: "page" }, null]), [
  { pageNumber: 2, widthPx: 10, heightPx: 20, assetKey: "page" },
]);
assert.deepEqual(getReviewIssues([{ id: "issue", code: "code", message: "message", severity: "critical", resolved: false }, {}]), [
  { id: "issue", code: "code", message: "message", severity: "critical", resolved: false },
]);
const completedRequiredIssues = withDefaultReviewIssueResolutions(
  [
    {
      id: "scale",
      code: "scale_unresolved",
      message: "Confirm scale.",
      severity: "critical",
      resolved: true,
    },
    {
      id: "openings",
      code: "openings_confirmation",
      message: "Confirm openings.",
      severity: "critical",
      resolved: true,
    },
  ],
  null
);
assert.ok((completedRequiredIssues[0].resolution?.length ?? 0) >= 12);
assert.equal(
  completedRequiredIssues[1].resolution,
  undefined,
  "Optional suggestions must not receive invented confirmation notes"
);
assert.deepEqual(buildAddressBindingInputs([{
  key: "binding",
  countryCode: " sg ",
  addressNormalized: " 810A Chai Chee St ",
  block: " 810A ",
  street: " Chai Chee St ",
  postalCode: "",
  stack: " 509 ",
  floorMin: "2",
  floorMax: "15",
    transform: "normal",
    role: "catalog",
  sourceEvidenceText: '{"schemaVersion":1}',
}]), [{
  countryCode: "SG",
  addressNormalized: "810A Chai Chee St",
  block: "810A",
  street: "Chai Chee St",
  postalCode: null,
  stack: "509",
  floorMin: 2,
  floorMax: 15,
    transform: "normal",
    role: "catalog",
  sourceEvidence: { schemaVersion: 1 },
}]);
assert.throws(() => buildAddressBindingInputs([{
  key: "binding",
  countryCode: "SG",
  addressNormalized: "810A Chai Chee St",
  block: "810A",
  street: "Chai Chee St",
  postalCode: "",
  stack: "509",
  floorMin: "2.5",
  floorMax: "15",
  transform: "normal",
  role: "catalog",
  sourceEvidenceText: "{}",
}]), /Expected an integer/);

assert.deepEqual(buildAddressBindingInputs([{
  key: "address-only",
  countryCode: "SG",
  addressNormalized: "810A Chai Chee Street",
  block: "",
  street: "",
  postalCode: "460810",
  stack: "",
  floorMin: "",
  floorMax: "",
  transform: "normal",
  role: "catalog",
  sourceEvidenceText: '{"schemaVersion":1}',
}]), [{
  countryCode: "SG",
  addressNormalized: "810A Chai Chee Street",
  block: "",
  street: "",
  postalCode: "460810",
  stack: null,
  floorMin: null,
  floorMax: null,
  transform: "normal",
  role: "catalog",
  sourceEvidence: { schemaVersion: 1 },
}]);

console.log("Floor-plan admin review workspace characterization checks passed.");
