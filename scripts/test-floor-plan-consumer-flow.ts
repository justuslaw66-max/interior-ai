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
const uploadDialog = read("components/editor/FloorPlanUploadWorkspaceDialog.tsx");
const uploadDialogLifecycle = read(
  "components/editor/useFloorPlanUploadDialogLifecycle.ts"
);
const dialogLifecycle = read(
  "components/editor/design-system/useEditorDialogLifecycle.ts"
);
const dialogRegistry = read(
  "components/editor/design-system/editorDialogRegistry.ts"
);
const importWorkspace = read("components/editor/FloorPlanImportWorkspace.tsx");
const pageSelectionPanel = read("components/editor/FloorPlanPageSelectionPanel.tsx");
const selectPageRoute = read(
  "app/api/floor-plan-imports/[id]/select-page/route.ts"
);
const importSession = read("components/editor/useConsumerFloorPlanImportSession.ts");
const importHistory = read("components/editor/FloorPlanImportHistory.tsx");
const addressSearch = read("components/editor/FloorPlanAddressSearch.tsx");
const addressFields = read("components/editor/FloorPlanAddressFields.tsx");
const catalogResults = read("components/editor/FloorPlanCatalogResultList.tsx");
const orientationFeedback = read("components/editor/design-page/DesignValidationFeedback.tsx");
const newPlanController = read("lib/useDesignPageNewPlanController.ts");
const importListRoute = read("app/api/floor-plan-imports/route.ts");
const importJobRoute = read("app/api/floor-plan-imports/[id]/route.ts");
const cancelRoute = read("app/api/floor-plan-imports/[id]/cancel/route.ts");
const retryRoute = read("app/api/floor-plan-imports/[id]/retry/route.ts");
const retryDetectionRoute = read(
  "app/api/floor-plan-imports/[id]/retry-detection/route.ts"
);
const confirmRoute = read(
  "app/api/floor-plan-imports/[id]/confirm/route.ts"
);
const roomRenderer = read("components/editor/renderers/RoomRenderer2D.tsx");
const underlayRenderer = read(
  "components/editor/renderers/PlanUnderlayRenderer2D.tsx"
);
const coreShellBase = read("lib/useDesignPageCoreShellBaseRegistration.ts");
const designWorkspace = read(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const requestedDesignWorkspace = read(
  "lib/useDesignPageRequestedDesignWorkspaceRegistration.ts"
);
const underlayController = read(
  "lib/useDesignPageFloorPlanUnderlayController.ts"
);

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
  uploadDialog,
  /import FloorPlanImportWorkspace from "\.\/FloorPlanImportWorkspace"/,
  "The underlay upload panel should include the modular canonical import workspace."
);
assert.doesNotMatch(
  uploadPanel,
  /onUpload\(file\)/,
  "A canonical import must not place the source over the currently open design."
);
assert.match(
  uploadPanel,
  /<FloorPlanUploadWorkspaceDialog[\s\S]*?request=\{autoImportRequest\}/,
  "The selected source file should reach the full-screen workspace owner."
);
assert.match(
  uploadDialog,
  /<FloorPlanImportWorkspace request=\{request\}/,
  "The selected source file should reach the import assistant."
);
assert.match(
  uploadDialog,
  /createPortal\([\s\S]*?role="dialog"[\s\S]*?data-testid="floor-plan-import-dialog"[\s\S]*?document\.body/,
  "The consumer import workflow should render in a viewport-level dialog instead of the narrow editor panel."
);
assert.match(
  uploadDialog,
  /aria-modal="true"[\s\S]*?h-\[100dvh\][\s\S]*?sm:max-w-\[1600px\]/,
  "The import dialog should use the full mobile viewport and a wide desktop workspace."
);
assert.match(
  uploadDialogLifecycle,
  /useEditorDialogLifecycle\(\{[\s\S]*?closeDisabled: historyConfirmationOpen/,
  "The shared topmost lifecycle should own Escape without bypassing history confirmation."
);
assert.doesNotMatch(
  uploadPanel,
  /window\.addEventListener\("keydown"/,
  "The workspace must not retain an unconditional global Escape owner."
);
assert.match(
  `${dialogLifecycle}\n${dialogRegistry}`,
  /lockBodyScroll[\s\S]*?dialogBodyScrollOwners[\s\S]*?restoreBodyScroll/,
  "The shared registry should own stack-safe background scrolling."
);
assert.match(
  importWorkspace,
  /<FloorPlanImportAssistant[\s\S]*?resumeJobId=/,
  "The import workspace should expose the active assistant."
);
assert.match(
  importWorkspace,
  /<FloorPlanImportHistory[\s\S]*?onResume=\{selectImportJob\}/,
  "The import workspace should preserve resumable owner history."
);
assert.match(
  importWorkspace,
  /data-testid="floor-plan-import-secondary-options"[\s\S]*?<summary[\s\S]*?Previous imports & privacy/,
  "History and privacy should be collapsed outside the primary consumer journey."
);
assert.doesNotMatch(
  importWorkspace,
  /lg:grid-cols-\[minmax\(260px,320px\)_minmax\(0,1fr\)\]/,
  "The consumer review should not permanently give screen space to a technical sidebar."
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
  /startAndPollFloorPlanImport\(\{[\s\S]*?startProcessing:[\s\S]*?fetch\(next\.processUrl![\s\S]*?loadJob:/,
  "The assistant should start processing and poll the durable job concurrently."
);
assert.match(
  importSession,
  /startAndPollFloorPlanImport\([\s\S]*?loadJob: \(\) => loadJob\(next\.statusUrl!\)/,
  "Progress should poll until the import reaches a review, ready, applied, published or failed state."
);
assert.match(
  assistant,
  /const processAndPoll[\s\S]*?startAndPollFloorPlanImport[\s\S]*?submitReview[\s\S]*?processAndPoll/,
  "Review, selection, and retry flows should share the same concurrent processing helper."
);
assert.match(
  importSession,
  /error\.status === 401[\s\S]*?privately detect, review, and save this plan/,
  "Unauthenticated imports should explain the private server-side workflow."
);
assert.match(pageSelectionPanel, /Best match[\s\S]*?Use this page/);
assert.match(
  selectPageRoute,
  /status !== "selecting_page"[\s\S]*?candidateVersion[\s\S]*?updateMany/,
  "Page selection must be owner-scoped, state-checked, and optimistic."
);
assert.match(importHistory, /action: "cancel" \| "retry" \| "delete"/);
assert.match(importHistory, /\/\$\{action\}`/);
assert.match(
  importHistory,
  /Delete this import from your history\?[\s\S]*?Any design already[\s\S]*?created from it will stay[\s\S]*?runAction\(job, "delete"\)/,
  "Completed imports should expose a confirmation before disappearing from owner history."
);
assert.match(
  importHistory,
  /action === "delete" \? jobUrl[\s\S]*?method: action === "delete" \? "DELETE" : "POST"/,
  "History deletion must use the owner-scoped import DELETE endpoint."
);
assert.match(
  importHistory,
  /data-testid="floor-plan-import-bulk-actions"[\s\S]*?Select shown[\s\S]*?Delete selected[\s\S]*?Delete all/,
  "Import history should support multi-selection and whole-history deletion."
);
assert.match(
  importHistory,
  /data-testid="floor-plan-import-bulk-delete-confirmation"[\s\S]*?Generated designs will stay[\s\S]*?runBulkDelete\(bulkDeleteScope\)/,
  "Bulk deletion must require confirmation and explain that designs are preserved."
);
assert.match(
  importHistory,
  /fetch\("\/api\/floor-plan-imports", \{[\s\S]*?method: "DELETE"[\s\S]*?scope === "all" \? \{ all: true \} : \{ jobIds: selectedIds \}/,
  "Selected and delete-all actions must use one bounded owner-scoped request."
);
assert.match(
  importListRoute,
  /export async function GET\(request: Request\)[\s\S]*?where: \{ userId, historyDeletedAt: null \}[\s\S]*?nextCursor/,
  "Deleted history tombstones must not reappear after refresh or pagination."
);
assert.match(
  importListRoute,
  /export async function DELETE\(request: Request\)[\s\S]*?MAX_SELECTED_HISTORY_DELETE_JOBS[\s\S]*?userId,[\s\S]*?historyDeletedAt: null[\s\S]*?status: "failed"[\s\S]*?historyDeletedAt: now[\s\S]*?designPreserved: true/,
  "Bulk history deletion must be bounded, owner-scoped, stop unfinished jobs, and preserve designs."
);
assert.match(
  importJobRoute,
  /export async function DELETE\([\s\S]*?where: \{ id, userId, historyDeletedAt: null \}[\s\S]*?HISTORY_DELETE_CANCEL_STATUSES\.has\(owned\.status\)[\s\S]*?historyDeletedAt: now[\s\S]*?errorMessage: "Deleted by owner"/,
  "Import deletion must remain owner-scoped and safely stop unfinished jobs."
);
assert.match(
  importJobRoute,
  /deletedFromHistory: true[\s\S]*?designPreserved: true/,
  "Deleting import history must explicitly preserve the generated design."
);
assert.match(cancelRoute, /status: \{ in: \[\.\.\.CANCELLABLE_STATUSES\] \}[\s\S]*?leaseExpiresAt: \{ lte: now \}/);
assert.match(retryRoute, /status: "failed"[\s\S]*?sourceRetentionExpiresAt[\s\S]*?repository\.create/);
assert.match(
  retryDetectionRoute,
  /where: \{ id, userId \}[\s\S]*?\["needs_review", "failed"\]\.includes\(sourceJob\.status\)/,
  "Detection retries must be owner-scoped and limited to immutable paused jobs."
);
assert.match(
  retryDetectionRoute,
  /sourceAsset\.contentDeletedAt[\s\S]*?sourceDeletionRequestedAt[\s\S]*?sourceRetentionExpiresAt\.getTime\(\) <= now\.getTime\(\)/,
  "Deleted, queued-for-deletion, or expired private sources must not be retried."
);
assert.match(
  retryDetectionRoute,
  /floor-plan-retry-detection[\s\S]*?takeSharedRateLimit[\s\S]*?Too many floor-plan retries/,
  "One-click detection retries must be locally and centrally rate limited."
);
assert.match(
  retryDetectionRoute,
  /trainingBenchmarkOptIn: sourceJob\.trainingBenchmarkOptIn[\s\S]*?sourceRetentionExpiresAt: sourceJob\.sourceRetentionExpiresAt/,
  "A fresh retry must copy privacy consent without extending source retention."
);
assert.match(
  assistant,
  /\/api\/floor-plan-imports\/\$\{activeJob\.id\}\/retry-detection[\s\S]*?Retry with improved detection/,
  "Consumers should be able to rerun the current extractor without uploading again."
);
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
  /Use Step 3 above to select both ends of each visible[\s\S]*?opening[\s\S]*?If none are shown, mark this[\s\S]*?suggestion reviewed/,
  "Opening review should be guided and must not block plans that show no openings."
);
assert.match(
  assistant,
  /AI detected the architectural plan[\s\S]*?editable 2D and 3D design/,
  "The primary review should explain the consumer outcome rather than internal validation mechanics."
);
assert.match(
  assistant,
  /data-testid="floor-plan-import-simple-recovery"[\s\S]*?Upload a clearer file[\s\S]*?Help AI finish this one/,
  "When detection is unsafe, the consumer should get one simple recovery choice before manual tools."
);
assert.match(
  assistant,
  /data-testid="floor-plan-import-technical-details"[\s\S]*?Technical validation details/,
  "Detailed validation issues should remain available but collapsed outside the main path."
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
  /candidateVersion: activeJob\.candidateVersion[\s\S]*?processAndPoll\([\s\S]*?activeJob\.id[\s\S]*?"Validating your corrections"/,
  "Corrected candidates should return through live server validation before use."
);
assert.match(
  assistant,
  /fetch\(`\/api\/floor-plan-imports\/\$\{activeJob\.id\}\/confirm`, \{[\s\S]*?JSON\.stringify\(\{ title, candidateVersion: activeJob\.candidateVersion \}\)/,
  "Final confirmation should send only the title and reviewed candidate version, not an arbitrary design payload."
);
assert.match(
  assistant,
  /const createDesign = useCallback\(async \(\) => \{[\s\S]*?\}, \[activeJob, onActiveJobIdChange, router, title\]\);/,
  "Design creation should refresh for current job, title, navigation, and active-job ownership without depending on an unused session setter."
);
assert.match(
  assistant,
  /Current design unchanged[\s\S]*?Create editable plan/,
  "The ready state should make the editable outcome and non-destructive creation clear."
);
assert.doesNotMatch(
  assistant,
  /autoCreateAttemptRef|void createDesign\(true\)/,
  "A ready import must wait for the consumer to create the new design."
);
assert.match(
  assistant,
  /optionalConfigurationCount > 0/,
  "Source-supported layout choices should remain visible before explicit creation."
);
assert.match(
  assistant,
  /Accuracy baseline passed:[\s\S]*?canonical room[\s\S]*?exact[\s\S]*?printed dimension/,
  "The ready state should report the room and exact-dimension baseline that passed."
);
assert.match(
  assistant,
  /\/design\?designId=[\s\S]*?view=2d&workspace=furnish&floorPlanImport=/,
  "A confirmed import should open its new design in the 2D furnish workspace."
);
assert.match(
  importHistory,
  /\/design\?designId=[\s\S]*?view=2d&workspace=furnish&floorPlanImport=/,
  "Import history must reopen an applied plan in the canonical 2D furnish editor."
);
assert.match(
  requestedDesignWorkspace,
  /searchParams\.get\("designId"\)[\s\S]*?localBackupHydrated[\s\S]*?loadDesign\(decision\.designId\)/,
  "The canonical editor should hydrate the saved design requested by the import handoff."
);
assert.match(
  designWorkspace,
  /Source reference[\s\S]*?floor-plan-source-reference-toggle[\s\S]*?changeUnderlayOpacity[\s\S]*?visible === false/,
  "The 2D furnish workspace should expose the imported source-reference toggle."
);
assert.match(
  underlayController,
  /state: \{[\s\S]*?floorPlanUnderlay/,
  "The underlay boundary should expose persisted visibility to the canonical editor."
);
assert.match(
  coreShellBase,
  /urlView === "2d" \? "2d" : "3d"/,
  "The imported-design route should initialize directly in 2D."
);
assert.match(
  confirmRoute,
  /assetUrl: `\/api\/floor-plan-imports\/[\s\S]*?visible: false,[\s\S]*?locked: true/,
  "Confirmation should attach a locked, initially hidden owner-scoped source reference."
);
assert.match(
  underlayRenderer,
  /underlay\.visible === false/,
  "The 2D renderer must honor persisted source-reference visibility."
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
