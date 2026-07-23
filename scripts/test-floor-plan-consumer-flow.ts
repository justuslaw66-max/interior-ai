import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildStructuredFloorPlanAddressQuery,
  filterFloorPlanSearchResults,
  groupFloorPlanSearchResults,
} from "@/lib/floor-plan-consumer-search";
import {
  pollFloorPlanImportJobUntilPaused,
  readActiveFloorPlanImportId,
  writeActiveFloorPlanImportId,
} from "@/lib/floor-plan-import-client";
import { inverseFloorPlanAddressTransform } from "@/lib/floor-plan-consumer-orientation";
import { applyFloorPlanAddressTransformV2 } from "@/lib/floor-plan-legacy-adapters";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const assistant = [
  "components/editor/FloorPlanImportAssistant.tsx",
  "components/editor/floor-plan-import-review/FloorPlanImportReviewPanel.tsx",
  "components/editor/floor-plan-import-review/FloorPlanVisualReviewTools.tsx",
  "components/editor/floor-plan-import-review/FloorPlanSourceReviewCanvas.tsx",
  "components/editor/floor-plan-import-review/FloorPlanScaleReviewPanel.tsx",
  "components/editor/floor-plan-import-review/FloorPlanTopologyCorrectionPanel.tsx",
  "components/editor/floor-plan-import-review/FloorPlanOpeningCorrectionFields.tsx",
  "components/editor/floor-plan-import-review/FloorPlanOrientationReviewPanel.tsx",
  "lib/floor-plan-import-review-geometry.ts",
]
  .map(read)
  .join("\n");
const uploadPanel = read("components/editor/FloorPlanUploadPanel.tsx");
const importWorkspace = read("components/editor/FloorPlanImportWorkspace.tsx");
const importSession = read("components/editor/useConsumerFloorPlanImportSession.ts");
const importHistory = read("components/editor/FloorPlanImportHistory.tsx");
const addressSearch = read("components/editor/FloorPlanAddressSearch.tsx");
const addressFields = read("components/editor/FloorPlanAddressFields.tsx");
const catalogResults = read("components/editor/FloorPlanCatalogResultList.tsx");
const orientationFeedback = read("components/editor/design-page/DesignValidationFeedback.tsx");
const newPlanController = read("lib/useDesignPageNewPlanController.ts");
const importListRoute = read("app/api/floor-plan-imports/route.ts");
const cancelRoute = read("app/api/floor-plan-imports/[id]/cancel/route.ts");
const retryRoute = read("app/api/floor-plan-imports/[id]/retry/route.ts");
const roomRenderer = read("components/editor/renderers/RoomRenderer2D.tsx");

assert.equal(
  buildStructuredFloorPlanAddressQuery({ address: " 810A  Chai Chee St ", floor: "7", stack: "509" }),
  "810A Chai Chee St #07-509"
);
assert.equal(
  buildStructuredFloorPlanAddressQuery({ address: "810A Chai Chee St", floor: "7", stack: "" }),
  "810A Chai Chee St",
  "Partial unit fields must not create a false exact-unit search."
);

const storageValues = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => storageValues.get(key) ?? null,
  setItem: (key: string, value: string) => { storageValues.set(key, value); },
  removeItem: (key: string) => { storageValues.delete(key); },
};
writeActiveFloorPlanImportId(fakeStorage, "job_resume_1234");
assert.equal(readActiveFloorPlanImportId(fakeStorage), "job_resume_1234");
writeActiveFloorPlanImportId(fakeStorage, null);
assert.equal(readActiveFloorPlanImportId(fakeStorage), null);
assert.equal(inverseFloorPlanAddressTransform("rotate_90"), "rotate_270");
assert.equal(inverseFloorPlanAddressTransform("mirror_x_rotate_90"), "mirror_x_rotate_90");
const transformFixture = {
  floors: [{
    vertices: [{ id: "a", xMm: 0, zMm: 0 }, { id: "b", xMm: 3000, zMm: 0 }, { id: "c", xMm: 3000, zMm: 2000 }],
    calibrations: [],
    walls: [],
    openings: [],
    dimensions: [{ id: "width", axis: "horizontal" }],
  }],
} as unknown as FloorPlanDocumentV2;
const rotated = applyFloorPlanAddressTransformV2(transformFixture, "rotate_90");
assert.equal(
  rotated.floors[0].dimensions[0].axis,
  "vertical",
  "Quarter-turn address transforms must keep authored dimension axes aligned."
);
const restored = applyFloorPlanAddressTransformV2(rotated, "rotate_270");
assert.deepEqual(
  restored.floors[0].vertices.map(({ xMm, zMm }) => ({ xMm, zMm })),
  transformFixture.floors[0].vertices.map(({ xMm, zMm }) => ({ xMm, zMm })),
  "Orientation changes must be derived from the canonical plan, not accumulated legacy coordinates."
);
assert.equal(restored.floors[0].dimensions[0].axis, "horizontal");

async function assertBackgroundValidationKeepsPolling() {
  const observedPollingStatuses: string[] = [];
  const queuedStatuses = [
    { status: "validating", progress: 85 },
    { status: "ready", progress: 100 },
  ] as const;
  let queuedStatusIndex = 0;
  const completedBackgroundJob = await pollFloorPlanImportJobUntilPaused({
    initialJob: { status: "validating", progress: 85 },
    loadJob: async () => queuedStatuses[queuedStatusIndex++],
    wait: async () => undefined,
    onProgress: (job) => observedPollingStatuses.push(job.status),
  });
  assert.equal(completedBackgroundJob.status, "ready");
  assert.equal(
    queuedStatusIndex,
    2,
    "A background validation must keep polling through repeated intermediate responses."
  );
  assert.deepEqual(observedPollingStatuses, ["validating", "validating"]);

  let cancelledLoadCount = 0;
  const cancelledJob = await pollFloorPlanImportJobUntilPaused({
    initialJob: { status: "failed", progress: 100 },
    loadJob: async () => {
      cancelledLoadCount += 1;
      return { status: "failed", progress: 100 };
    },
    wait: async () => undefined,
  });
  assert.equal(cancelledJob.status, "failed");
  assert.equal(
    cancelledLoadCount,
    0,
    "A cancelled or failed job must stop polling so history retry can take over."
  );
}

const facetFixtures = [
  { id: "one", projectName: "Project A", flatType: "4-room" },
  { id: "two", projectName: "Project B", flatType: "5-room" },
] as FloorPlanCatalogSearchResult[];
assert.deepEqual(
  filterFloorPlanSearchResults(facetFixtures, { project: "Project A", flatType: "" }).map((entry) => entry.id),
  ["one"]
);
assert.deepEqual(groupFloorPlanSearchResults(facetFixtures).map((entry) => entry.projectName), ["Project A", "Project B"]);

assert.match(
  uploadPanel,
  /import FloorPlanImportWorkspace from "\.\/FloorPlanImportWorkspace"/,
  "The underlay upload panel should include the modular canonical import workspace."
);
assert.match(
  uploadPanel,
  /setAutoImportRequest\(\{ file, trainingBenchmarkOptIn \}\);[\s\S]*?onUpload\(file\);/,
  "One file selection should retain the guided underlay while starting canonical detection."
);
assert.match(
  uploadPanel,
  /<FloorPlanImportWorkspace[\s\S]*?request=\{autoImportRequest\}[\s\S]*?trainingBenchmarkOptIn=\{trainingBenchmarkOptIn\}/,
  "The selected source file should reach the import assistant."
);
assert.match(
  importWorkspace,
  /<FloorPlanImportHistory[\s\S]*?<FloorPlanImportAssistant[\s\S]*?resumeJobId=/,
  "The import workspace should expose resumable owner history beside the active assistant."
);
for (const acceptedType of [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const) {
  assert.ok(uploadPanel.includes(`"${acceptedType}"`), `Uploads should accept ${acceptedType}.`);
}

assert.match(
  importSession,
  /fetch\("\/api\/floor-plan-imports",\s*\{[\s\S]*?method: "POST"[\s\S]*?body: formData/,
  "Consumer uploads should create a private server-side floor-plan import job."
);
assert.match(
  importSession,
  /fetch\(next\.processUrl, \{ method: "POST"/,
  "The assistant should start the deterministic processing pipeline."
);
assert.match(
  importSession,
  /pollFloorPlanImportJobUntilPaused\([\s\S]*?loadJob: \(\) => loadJob\(next\.statusUrl!\)/,
  "Progress should poll until the import reaches a review, ready, applied, published or failed state."
);
assert.match(
  assistant,
  /fetch\(`\/api\/floor-plan-imports\/\$\{activeJob\.id\}\/process`, \{ method: "POST" \}\)[\s\S]*?pollFloorPlanImportJobUntilPaused/,
  "A corrected candidate must keep polling when background validation remains intermediate."
);
assert.match(
  importSession,
  /error\.status === 401[\s\S]*?underlay remains available for tracing/,
  "Unauthenticated auto-detection should preserve the local guided-tracing fallback."
);
assert.match(importHistory, /action: "cancel" \| "retry"/);
assert.match(importHistory, /\/\$\{action\}`/);
assert.match(importListRoute, /export async function GET\(request: Request\)[\s\S]*?where: \{ userId \}[\s\S]*?nextCursor/);
assert.match(cancelRoute, /status: \{ in: \[\.\.\.CANCELLABLE_STATUSES\] \}[\s\S]*?leaseExpiresAt: \{ lte: now \}/);
assert.match(retryRoute, /status: "failed"[\s\S]*?sourceRetentionExpiresAt[\s\S]*?repository\.create/);
assert.match(addressFields, /floor-plan-address-floor[\s\S]*?floor-plan-address-stack/);
for (const requestMarker of [
  "floorPlanRequest",
  "floor-plan-address-requested",
  "floor-plan-upload-requested",
]) {
  assert.ok(addressSearch.includes(requestMarker));
}
assert.match(addressSearch, /floorPlanSearchFacets[\s\S]*?groupFloorPlanSearchResults/);
assert.match(catalogResults, /Start a new design[\s\S]*?Replace current plan/);
assert.match(addressSearch, /startAsNewDesign/);
assert.match(
  newPlanController,
  /pendingReplacement\?\.options\?\.startAsNewDesign[\s\S]*?saveCurrentAndStartNewPlan/,
  "Address results should automatically preserve the current design through the existing new-plan transaction."
);
assert.match(orientationFeedback, /floor-plan-orientation-choice[\s\S]*?onTransform/);
assert.match(orientationFeedback, /floor-plan-revision-compare-preview/);

for (const prerequisite of [
  "Register origin, orientation and scale with the tracing tools first.",
  "Trace at least one closed room before confirming this item.",
  "Choose the main entrance below.",
] as const) {
  assert.ok(
    assistant.includes(prerequisite),
    `Critical review confirmation should enforce: ${prerequisite}`
  );
}
assert.match(
  assistant,
  /Use Step 3 above to select both ends of each visible opening[\s\S]*?If none are shown, mark this suggestion reviewed/,
  "Opening review should be guided and must not block plans that show no openings."
);
assert.match(
  assistant,
  /Required items protect the measured wall geometry[\s\S]*?Room names, entrance labels,[\s\S]*?suggestions/,
  "The review UI must distinguish 2D\/3D blockers from optional metadata."
);
assert.match(assistant, /isFloorPlanMvpBlockingIssue/);
assert.match(
  assistant,
  /2D plan preview[\s\S]*?Uploaded plan \{sourceOpacity\}%[\s\S]*?Saved outlines \{overlayOpacity\}%/
);
assert.match(
  assistant,
  /Choose the two endpoints on the plan/
);
assert.match(assistant, /residual/i);
assert.match(assistant, /confidence/i);
assert.match(assistant, /move_vertex/);
assert.match(assistant, /update_opening/);
assert.match(assistant, /needs-review/i);
assert.match(assistant, /Rotate 90°[\s\S]*?Mirror left\/right/);
assert.match(
  assistant,
  /fetch\(`\/api\/floor-plan-imports\/\$\{activeJob\.id\}\/candidate`, \{[\s\S]*?method: "PATCH"[\s\S]*?candidateVersion: activeJob\.candidateVersion/,
  "Consumer corrections should use optimistic candidate-version checks."
);
assert.match(
  assistant,
  /fetch\(`\/api\/floor-plan-imports\/\$\{activeJob\.id\}\/process`, \{ method: "POST" \}\)/,
  "Corrected candidates should return through server validation before use."
);
assert.match(
  assistant,
  /fetch\(`\/api\/floor-plan-imports\/\$\{activeJob\.id\}\/confirm`, \{[\s\S]*?JSON\.stringify\(\{ title, candidateVersion: activeJob\.candidateVersion \}\)/,
  "Final confirmation should send only the title and reviewed candidate version, not an arbitrary design payload."
);
assert.match(
  assistant,
  /The editable design is created automatically\. Your current design stays saved and is not replaced\./,
  "The ready state should make non-destructive design creation explicit."
);
assert.match(
  assistant,
  /autoCreateAttemptRef\.current = attemptKey;[\s\S]*?void createDesign\(true\)/,
  "A ready source-complete import should automatically create and open its editable design."
);
assert.match(
  assistant,
  /optionalConfigurationCount > 0/,
  "Automatic creation must pause when the source contains a layout choice."
);
assert.match(
  assistant,
  /Accuracy baseline passed:[\s\S]*?canonical room[\s\S]*?exact[\s\S]*?printed dimension/,
  "The ready state should report the room and exact-dimension baseline that passed."
);
assert.match(
  assistant,
  /router\.push\(`\/design\/\$\{encodeURIComponent\(id\)\}`\)/,
  "A confirmed import should open its newly created saved design."
);
assert.match(
  assistant,
  /payload\.deletionState === "queued"[\s\S]*?payload\.deletionState === "deleted"/,
  "Private-source deletion should distinguish queued external cleanup from completed deletion."
);
assert.match(
  assistant,
  /removal from private storage is queued/,
  "The consumer UI must not claim externally queued source bytes are already deleted."
);

assert.match(
  roomRenderer,
  /doorStyle\?: "swing" \| "sliding" \| "folding" \| "open"/,
  "The 2D renderer should retain all canonical door operations."
);
assert.match(
  roomRenderer,
  /segment\.kind === "window"[\s\S]*?glazingOffset[\s\S]*?firstStart[\s\S]*?secondStart[\s\S]*?\[firstStart, firstEnd\][\s\S]*?\[secondStart, secondEnd\]/,
  "Windows should render as a distinct double-line glazing symbol."
);
assert.match(
  roomRenderer,
  /!segment\.doorStyle \|\| segment\.doorStyle === "swing"[\s\S]*?const openEnd[\s\S]*?const swingArc = Array\.from\(\{ length: 9 \}[\s\S]*?return \[\[start, openEnd\], swingArc\];/,
  "Swing doors should render a leaf and quarter-circle swing arc."
);
assert.match(
  roomRenderer,
  /selectedOverlayId !== seg\.id && seg\.roomId === activeRoomId[\s\S]*?data-testid="plan-opening-kind-label"[\s\S]*?data-opening-kind=\{seg\.kind\}[\s\S]*?\{openingDisplayName\(seg\)\}/,
  "Every unselected opening in the active room should carry a compact visible identity label."
);
assert.match(
  roomRenderer,
  /function buildOpeningSymbolLines\([\s\S]*?segment\.doorStyle === "sliding"[\s\S]*?secondStart[\s\S]*?secondEnd/,
  "Sliding doors should render as overlapping parallel leaves instead of a swing symbol."
);
assert.match(
  roomRenderer,
  /const foldPoints = Array\.from\(\{ length: 5 \}[\s\S]*?return \[foldPoints\];/,
  "Folding doors should render with a distinct folded-leaf polyline."
);
assert.match(
  roomRenderer,
  /if \(segment\.doorStyle === "open"\) return \[\];/,
  "Open passages should not render a false door leaf."
);
assert.match(
  roomRenderer,
  /if \(segment\.doorStyle === "sliding"\) return "Sliding door";[\s\S]*?if \(segment\.doorStyle === "folding"\) return "Folding door";/,
  "Selection labels should identify sliding and folding doors accurately."
);
assert.match(
  roomRenderer,
  /interactive && seg\.doorStyle !== "open"/,
  "Open passages should not expose a false movable-door hit target."
);
assert.match(
  roomRenderer,
  /const openingSegments = openings\.map\(\(o\): OpeningRenderSegment2D =>/,
  "Opening endpoints should retain their fixed two-point tuple contract."
);

assertBackgroundValidationKeepsPolling()
  .then(() => console.log("Floor-plan consumer flow guardrails passed."))
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  });
