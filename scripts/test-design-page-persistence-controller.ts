import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATALOG_ITEMS } from "../lib/catalog";
import {
  acknowledgePendingCloudBaseline,
  beginCloudBaselineLoad,
  createDetachedCloudBaseline,
  failCloudBaselineLoad,
  installPendingCloudBaseline,
  isCloudAutosaveBlocked,
  isCloudWriteBlocked,
  stagePendingCloudWriteBaseline,
  type CloudBaselineIdentity,
  type CloudBaselineState,
} from "../lib/design-page-cloud-baseline";
import { createDesignPageCloudWriteQueue } from "../lib/design-page-cloud-write-queue";
import { executeDesignPageCloudWrite } from "../lib/design-page-cloud-write-execution";
import { migrateDesignDocument } from "../lib/design-document-migrations";
import {
  normalizeLoadedCloudDesign,
  projectCanonicalDesignPersistence,
} from "../lib/design-page-persistence-projection";
import { storedToSnapshot } from "../lib/room-persistence";
import { fingerprintDesignSnapshot } from "../lib/snapshot-fingerprint";
import { sanitizeDesignPageSavedViews } from "../lib/useDesignPagePersistence";
import { resolveDesignPageCloudPresentation } from "../lib/useDesignPageCloudLoadController";

const root = process.cwd();
const pageSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "DesignPageWorkspace.tsx"),
  "utf8"
);
const requestedDesignRegistrationSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageRequestedDesignWorkspaceRegistration.ts"),
  "utf8"
);
const controllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPagePersistence.ts"),
  "utf8"
);
const cloudBaselineControllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageCloudBaselineController.ts"),
  "utf8"
);
const cloudLoadControllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageCloudLoadController.ts"),
  "utf8"
);
const explicitCloudSaveControllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageExplicitCloudSaveController.ts"),
  "utf8"
);
const cloudWriteExecutionSource = fs.readFileSync(
  path.join(root, "lib", "design-page-cloud-write-execution.ts"),
  "utf8"
);
const conflictCopyControllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageCloudConflictCopyController.ts"),
  "utf8"
);
const persistenceProjectionSource = fs.readFileSync(
  path.join(root, "lib", "design-page-persistence-projection.ts"),
  "utf8"
);
const facadeSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPagePersistenceNewPlanFacade.ts"),
  "utf8"
);
const registrationSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPagePersistenceRegistration.ts"),
  "utf8"
);
const editorInteractionRegistrationSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageEditorInteractionRegistration.ts"),
  "utf8"
);
const zoneControllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageZoneController.ts"),
  "utf8"
);
const zoneOrchestrationSource = fs.readFileSync(
  path.join(root, "lib", "design-page-zone-orchestration.ts"),
  "utf8"
);
const designRouteSource = fs.readFileSync(
  path.join(root, "app", "api", "designs", "[id]", "route.ts"),
  "utf8"
);
const designsRouteSource = fs.readFileSync(
  path.join(root, "app", "api", "designs", "route.ts"),
  "utf8"
);

assert.ok(
  pageSource.indexOf("useDesignPageEditorInteractionRegistration({") <
    pageSource.indexOf("useDesignPagePersistenceWorkspaceRegistration({"),
  "Persistence effects must remain mounted after editor interaction registration."
);
assert.ok(
  pageSource.indexOf("useDesignPagePersistenceWorkspaceRegistration({") <
    pageSource.indexOf("useDesignPageRequestedDesignWorkspaceRegistration({"),
  "The requested-design route effect must mount after persistence."
);
assert.match(requestedDesignRegistrationSource, /useEffect\(\(\) => \{/);
assert.match(
  editorInteractionRegistrationSource,
  /useDesignPageZoneController\(\{/,
  "Editor interaction must retain zone normalization before persistence mounts."
);
assert.ok(
  facadeSource.indexOf("useDesignPagePersistence({") >= 0 &&
    facadeSource.indexOf("useDesignPageNewPlanController({") >
      facadeSource.indexOf("useDesignPagePersistence({"),
  "The facade should mount persistence before the new-plan controller consumes its actions."
);
assert.match(
  zoneControllerSource,
  /const currentZones = zonesRef\.current \?\? \[\];[\s\S]*?const nextZones = reconcileZonesForItems\(\{[\s\S]*?if \(zonesEqual\(nextZones, currentZones\)\) return;/,
  "The zone controller should run shared normalization before persistence effects mount."
);
assert.match(
  zoneOrchestrationSource,
  /export function reconcileZonesForItems\([\s\S]*?const normalizedZones = normalizeZones\(zones, allItems\);[\s\S]*?const manualZones = normalizedZones\.filter[\s\S]*?const autoZones = buildAutoZones\(\{[\s\S]*?return \[\.\.\.manualZones, \.\.\.autoZones\];/,
  "The zone orchestration helper should own manual and automatic zone reconciliation."
);

assert.match(
  registrationSource,
  /useDesignPagePersistenceNewPlanFacade\(\{[\s\S]*?localBackupHydrated: snapshotDocument\.state\.localBackupHydrated[\s\S]*?cloudSaveDelayMs: 900,[\s\S]*?guestSaveDelayMs: 800/,
  "The persistence registration should pass the hydration gate and preserve both debounce intervals."
);

assert.match(
  `${explicitCloudSaveControllerSource}\n${cloudWriteExecutionSource}`,
  /prepareManualWrite[\s\S]*?designApi\.create\(payload\)[\s\S]*?executeManualSave[\s\S]*?getStoredDesign\(\)[\s\S]*?fingerprintStoredDesign\(stored\)[\s\S]*?prepareManualWrite[\s\S]*?queue\.settleSuccess\(binding[\s\S]*?input\.stage\(\{/,
  "Manual saves should bind and acknowledge the exact event-time snapshot sent through the design API client."
);
assert.match(
  explicitCloudSaveControllerSource,
  /prepareManualWrite[\s\S]*?expectedUpdatedAt: binding\.revision[\s\S]*?designApi\.update\(binding\.designId, payload\)/,
  "Manual updates should use the revision bound to the queued request."
);

assert.match(
  designRouteSource,
  /expectedUpdatedAt[\s\S]*?transaction\.design\.updateMany\(\{[\s\S]*?where: \{[\s\S]*?id,[\s\S]*?userId,[\s\S]*?updatedAt: new Date\(expectedUpdatedAt\)[\s\S]*?result\.count !== 1[\s\S]*?ApiBoundaryError\(409, "CONFLICT"/,
  "The design route should reject stale revisions through one conditional database update."
);
assert.match(
  designsRouteSource,
  /\{ id: design\.id, updatedAt: design\.updatedAt \}/,
  "Create responses should establish the first client revision."
);

assert.match(
  cloudLoadControllerSource,
  /const normalized = normalizeLoadedCloudDesign\(data, id\);[\s\S]*?baseline\.installLoaded\(\{[\s\S]*?fingerprint: normalized\.fingerprint/,
  "Cloud loads should normalize before installing an identity-bound pending baseline."
);
assert.match(
  cloudLoadControllerSource,
  /commitLoadedCloudDesign[\s\S]*?actions\.setDesignSnapshot\(normalized\.snapshot\);[\s\S]*?actions\.setDesignId\(data\.id\);[\s\S]*?actions\.setLastCloudRevision\(normalized\.revision\);/,
  "The canonical document, design identity, and revision must commit together."
);
assert.match(
  cloudLoadControllerSource,
  /resolveDesignPageCloudPresentation\([\s\S]*?data,[\s\S]*?normalized\.snapshot[\s\S]*?actions\.setNotes\(presentation\.notes[\s\S]*?Loaded \$\{presentation\.title\}/,
  "Owner/client-preview presentation must resolve from the same snapshot-first read model as anonymous sharing."
);
assert.doesNotMatch(
  cloudLoadControllerSource,
  /actions\.setNotes\([^\n]*data\.notes|actions\.setStyle\([^\n]*data\.style|actions\.setBudget\([^\n]*data\.budget|Loaded \$\{data\.title\}/,
  "Owner/client-preview presentation must not read raw envelope fields directly."
);
assert.match(
  cloudBaselineControllerSource,
  /installPendingCloudBaseline\(state, \{[\s\S]*?identity,[\s\S]*?requireFingerprintMatch: true/,
  "Loaded baselines must require the installed canonical fingerprint."
);
assert.match(
  cloudBaselineControllerSource,
  /installPendingCloudBaseline\(state,[\s\S]*?pendingBaselineMatches\(next, \{[\s\S]*?identity,[\s\S]*?fingerprint: loaded\.fingerprint,[\s\S]*?requireFingerprintMatch: true/,
  "A load may commit only when the exact identity and fingerprint were installed."
);
assert.match(
  cloudBaselineControllerSource,
  /acknowledgePendingCloudBaseline\([\s\S]*?store\.baselineRef\.current,[\s\S]*?\{ identity, currentFingerprint \}[\s\S]*?acknowledgeFingerprint\(acknowledged\.fingerprint\)/,
  "Cloud loads should acknowledge only the committed canonical projection."
);
assert.match(
  cloudLoadControllerSource,
  /requestCoordinator\.isCurrent\(request\)\) return "superseded";[\s\S]*?isSupersededDesignPageLoadError[\s\S]*?baseline\.cancelLoad\(request\.epoch\);[\s\S]*?return "superseded";/,
  "Cloud loads should reject superseded responses independently of abort compliance."
);
assert.match(
  cloudLoadControllerSource,
  /handleCloudLoadFailure[\s\S]*?error\.kind === "forbidden" \|\| error\.kind === "not_found"[\s\S]*?\? "missing"[\s\S]*?: "unavailable"/,
  "Cloud loads should distinguish transient failures from missing designs."
);

assert.match(
  controllerSource,
  /if \(!localBackupHydrated\) return;[\s\S]*?writeLocalDesignBackup\(\);[\s\S]*?if \(!designId\) return;[\s\S]*?if \(!localBackupHydrated\) return;/,
  "Both local and cloud writers should remain behind the page-owned hydration gate."
);

assert.match(
  controllerSource,
  /currentCloudWriteIsBlocked\(\)[\s\S]*?const timer = setTimeout\(async \(\) => \{[\s\S]*?const snapshot = getStoredDesignForPersistence\(\);[\s\S]*?const fingerprint = fingerprintStoredDesign\(snapshot\);[\s\S]*?executeDesignPageCloudWrite\(\{[\s\S]*?kind: "update",[\s\S]*?prepare: \(binding\)[\s\S]*?expectedUpdatedAt: binding\.revision[\s\S]*?stage: stageCloudWriteBaseline[\s\S]*?setLastCloudRevision\(result\.revision\)/,
  "Cloud autosave should bind its canonical snapshot, revision, epochs, and request before mutation and acknowledgment."
);
assert.match(
  cloudWriteExecutionSource,
  /queue\.settleSuccess\(binding[\s\S]*?fingerprint: binding\.fingerprint[\s\S]*?requestId: binding\.requestId/,
  "Shared cloud-write completion should stage only the exact settled request."
);

assert.match(
  `${controllerSource}\n${cloudLoadControllerSource}\n${explicitCloudSaveControllerSource}\n${controllerSource}`,
  /const \[lastCloudRevision, setLastCloudRevision\][\s\S]*?setLastCloudRevision\(normalized\.revision\)[\s\S]*?setLastCloudRevision\(saved\.revision\)[\s\S]*?setLastCloudRevision\(result\.revision\)/,
  "Persistence should retain revisions returned by load/create/update operations."
);
assert.match(
  persistenceProjectionSource,
  /reconcileZonesForItems\([\s\S]*?migrateDesignDocument\(snapshotToStored\(normalized\)\)[\s\S]*?storedToSnapshot\(migrated\.document\)[\s\S]*?fingerprintDesignSnapshot\(canonicalSnapshot\)/,
  "Fingerprinting must occur only after editor and persistence normalization."
);
assert.match(
  controllerSource,
  /error\.kind === "conflict"[\s\S]*?setCloudSaveConflict[\s\S]*?if \(cloudSaveConflict\) \{[\s\S]*?setIsSaving\(false\);[\s\S]*?return;/,
  "A revision conflict should become durable UI state and pause repeated autosave writes."
);
assert.match(
  conflictCopyControllerSource,
  /saveConflictAsNewCopy[\s\S]*?currentWriteIsBlocked\(\)[\s\S]*?invalidateCloudWrites\(\)[\s\S]*?prepareConflictCopy\(input\)[\s\S]*?createConflictCopy\(input, prepared\)/,
  "Recovery-copy creation should invalidate older writes before binding its independent request."
);
assert.match(
  conflictCopyControllerSource,
  /commitConflictCopy[\s\S]*?detachBaseline\(\)[\s\S]*?stageWriteBaseline\(/,
  "A recovery copy should detach before staging its new cloud identity."
);
assert.match(
  controllerSource,
  /useDesignPageCloudConflictCopyController\(\{[\s\S]*?const reloadCloudAfterConflict = useCallback[\s\S]*?loadDesign\(conflict\.designId\)/,
  "Conflict resolution should offer the extracted copy path and explicit cloud reload."
);

assert.match(
  controllerSource,
  /if \(designId \|\| isAuthenticated\) return;[\s\S]*?saveGuestDesign\(\{[\s\S]*?designSnapshot: getStoredDesignForPersistence\(\)/,
  "Guest persistence should keep its identity guard and current stored snapshot."
);

for (const apiGuard of [
  /designApi\.claim\(payload\)/,
  /designApi\.share\(id\)/,
  /designApi\.delete\(targetId\)/,
]) {
  assert.match(controllerSource, apiGuard, "Persistence API client operations should remain centralized.");
}

assert.match(
  cloudLoadControllerSource,
  /sanitizeDesignPageSavedViews[\s\S]*?\.slice\(0, 6\)/,
  "Loaded named views should retain the six-view sanitation limit."
);

const sanitizedViews = sanitizeDesignPageSavedViews([
  ...Array.from({ length: 7 }, (_, index) => ({
    name: `View ${index + 1}`,
    view: { pos: [0, 1, 2], target: [3, 4, 5] },
  })),
  { name: "Invalid", view: { pos: [0, 1], target: [3, 4, 5] } },
]);
assert.equal(sanitizedViews.length, 6);
assert.equal(sanitizedViews[0]?.name, "View 1");

const legacyFixture = JSON.parse(
  fs.readFileSync(
    path.join(root, "tests", "fixtures", "design-documents", "legacy-v2-product.json"),
    "utf8"
  )
) as Record<string, unknown>;
const migratedFixture = migrateDesignDocument(legacyFixture);
assert.equal(migratedFixture.ok, true);
if (!migratedFixture.ok) process.exit(1);

const canonicalFixtureSnapshot = storedToSnapshot(migratedFixture.document);
const equivalentMissingDefaults = structuredClone(canonicalFixtureSnapshot);
for (const room of equivalentMissingDefaults.rooms) {
  delete room.floorLevel;
  delete room.layoutVersions;
}
const canonicalFixture = projectCanonicalDesignPersistence(
  canonicalFixtureSnapshot
);
const canonicalEquivalent = projectCanonicalDesignPersistence(
  equivalentMissingDefaults
);
assert.equal(
  canonicalFixture.fingerprint,
  canonicalEquivalent.fingerprint,
  "Canonical persistence defaults must not create a false dirty baseline."
);

const liveProduct = Object.values(CATALOG_ITEMS)[0];
assert.ok(liveProduct, "Cloud baseline coverage requires one catalog item.");
const rawCloudSnapshot = structuredClone(canonicalFixtureSnapshot);
rawCloudSnapshot.rooms[0].items = [
  {
    instanceId: "raw-cloud-item",
    productId: liveProduct.id,
    variantId: liveProduct.defaultVariantId,
    position: [0, 0, 0],
  },
];
const rawCloudStored = projectCanonicalDesignPersistence(rawCloudSnapshot, {
  enrichProducts: false,
}).stored;
const loadedCloud = normalizeLoadedCloudDesign({
  id: "design-a",
  title: "Cloud A",
  roomWidth: 5,
  roomDepth: 4,
  items: [],
  snapshot: rawCloudStored,
  updatedAt: "2026-08-05T01:00:00.000Z",
});
const previewSnapshot = structuredClone(loadedCloud.snapshot);
previewSnapshot.title = "Snapshot-owned preview title";
previewSnapshot.style = "modern";
previewSnapshot.budget = "mid";
previewSnapshot.notes = "Snapshot-owned preview notes";
const clientPreviewPresentation = resolveDesignPageCloudPresentation(
  {
    id: "design-a",
    title: "Divergent raw owner title",
    roomWidth: 5,
    roomDepth: 4,
    items: [],
    style: "Luxury",
    budget: "$$$",
    notes: "PRIVATE RAW OWNER NOTES SENTINEL",
  },
  previewSnapshot
);
assert.deepEqual(clientPreviewPresentation, {
  title: "Snapshot-owned preview title",
  style: "Modern",
  budget: "$$",
  notes: "Snapshot-owned preview notes",
});
assert.equal(
  JSON.stringify(clientPreviewPresentation).includes("PRIVATE RAW OWNER NOTES SENTINEL"),
  false,
  "Owner/client-preview shared fields must ignore divergent raw envelope values."
);
assert.notEqual(
  fingerprintDesignSnapshot(storedToSnapshot(rawCloudStored)),
  loadedCloud.fingerprint,
  "A raw cloud transport snapshot must not own the loaded baseline."
);
assert.equal(
  loadedCloud.fingerprint,
  projectCanonicalDesignPersistence(loadedCloud.snapshot).fingerprint,
  "The normalized installed projection must own the loaded baseline."
);

const identityA: CloudBaselineIdentity = {
  designId: "design-a",
  revision: "2026-08-05T01:00:00.000Z",
  epoch: 1,
};
const identityB: CloudBaselineIdentity = {
  designId: "design-b",
  revision: "2026-08-05T02:00:00.000Z",
  epoch: 2,
};
let baseline = beginCloudBaselineLoad(createDetachedCloudBaseline(), {
  designId: identityA.designId,
  requestEpoch: 1,
});
baseline = installPendingCloudBaseline(baseline, {
  requestEpoch: 1,
  identity: identityA,
  fingerprint: loadedCloud.fingerprint,
  requireFingerprintMatch: true,
});
assert.equal(isCloudAutosaveBlocked(baseline, identityA), true);

const mutations: Array<{ designId: string; fingerprint: string }> = [];
const issueAutosave = (
  state: typeof baseline,
  identity: CloudBaselineIdentity,
  fingerprint: string
) => {
  if (isCloudAutosaveBlocked(state, identity)) return false;
  mutations.push({ designId: identity.designId, fingerprint });
  return true;
};
assert.equal(issueAutosave(baseline, identityA, "transient-empty"), false);
assert.deepEqual(mutations, []);

baseline = acknowledgePendingCloudBaseline(baseline, {
  identity: { ...identityA, revision: "wrong-revision" },
  currentFingerprint: loadedCloud.fingerprint,
});
assert.equal(baseline.status, "pending");
baseline = acknowledgePendingCloudBaseline(baseline, {
  identity: identityA,
  currentFingerprint: "transient-empty",
});
assert.equal(baseline.status, "pending");
baseline = acknowledgePendingCloudBaseline(baseline, {
  identity: identityA,
  currentFingerprint: loadedCloud.fingerprint,
});
assert.equal(baseline.status, "acknowledged");
assert.equal(isCloudAutosaveBlocked(baseline, identityA), false);
assert.equal(
  issueAutosave(baseline, identityA, "real-user-edit"),
  true,
  "A real edit may autosave only after exact acknowledgment."
);

const loadA = beginCloudBaselineLoad(createDetachedCloudBaseline(), {
  designId: identityA.designId,
  requestEpoch: 10,
});
const loadB = beginCloudBaselineLoad(loadA, {
  designId: identityB.designId,
  requestEpoch: 11,
});
const writeIdentityA = {
  ...identityA,
  revision: "2026-08-05T01:30:00.000Z",
};
const loadBWithCompletedWriteA = stagePendingCloudWriteBaseline(
  beginCloudBaselineLoad(baseline, {
    designId: identityB.designId,
    requestEpoch: 12,
  }),
  {
    identity: writeIdentityA,
    fingerprint: loadedCloud.fingerprint,
    writeRequest: { requestId: 1, persistenceEpoch: 0 },
  }
);
assert.equal(loadBWithCompletedWriteA.status, "loading");
if (loadBWithCompletedWriteA.status !== "loading") process.exit(1);
assert.equal(loadBWithCompletedWriteA.previous.status, "pending");
const installedBAfterWriteA = installPendingCloudBaseline(
  loadBWithCompletedWriteA,
  {
    requestEpoch: 12,
    identity: identityB,
    fingerprint: loadedCloud.fingerprint,
    requireFingerprintMatch: true,
  }
);
assert.equal(installedBAfterWriteA.status, "pending");
if (installedBAfterWriteA.status !== "pending") process.exit(1);
assert.deepEqual(installedBAfterWriteA.identity, identityB);
const failedBAfterWriteA = failCloudBaselineLoad(loadBWithCompletedWriteA, {
  designId: identityB.designId,
  requestEpoch: 12,
  reason: "load_failed",
  currentIdentity: identityA,
});
assert.equal(failedBAfterWriteA.status, "pending");
if (failedBAfterWriteA.status !== "pending") process.exit(1);
assert.deepEqual(failedBAfterWriteA.identity, writeIdentityA);
const staleA = installPendingCloudBaseline(loadB, {
  requestEpoch: 10,
  identity: identityA,
  fingerprint: loadedCloud.fingerprint,
  requireFingerprintMatch: true,
});
assert.deepEqual(staleA, loadB, "A superseded response cannot install a baseline.");
assert.equal(isCloudAutosaveBlocked(staleA, identityA), true);
assert.equal(isCloudAutosaveBlocked(staleA, identityB), true);

let duplicateBaseline = installPendingCloudBaseline(loadB, {
  requestEpoch: 11,
  identity: identityB,
  fingerprint: loadedCloud.fingerprint,
  requireFingerprintMatch: true,
});
duplicateBaseline = acknowledgePendingCloudBaseline(duplicateBaseline, {
  identity: identityA,
  currentFingerprint: loadedCloud.fingerprint,
});
assert.equal(duplicateBaseline.status, "pending");
duplicateBaseline = acknowledgePendingCloudBaseline(duplicateBaseline, {
  identity: identityB,
  currentFingerprint: loadedCloud.fingerprint,
});
assert.equal(duplicateBaseline.status, "acknowledged");
assert.equal(isCloudAutosaveBlocked(duplicateBaseline, identityA), true);
assert.equal(isCloudAutosaveBlocked(duplicateBaseline, identityB), false);

const failedBaseline = failCloudBaselineLoad(
  beginCloudBaselineLoad(createDetachedCloudBaseline(), {
    designId: "invalid-design",
    requestEpoch: 20,
  }),
  {
    designId: "invalid-design",
    requestEpoch: 20,
    reason: "normalization_failed",
    currentIdentity: null,
  }
);
assert.equal(failedBaseline.status, "failed");
assert.equal(isCloudAutosaveBlocked(failedBaseline, identityA), true);
assert.equal(isCloudWriteBlocked(failedBaseline, null, false), true);
assert.throws(
  () =>
    normalizeLoadedCloudDesign({
      id: "invalid-design",
      title: "Invalid",
      roomWidth: 5,
      roomDepth: 4,
      items: [],
      snapshot: { ...migratedFixture.document, schemaRevision: 99 },
      updatedAt: "2026-08-05T03:00:00.000Z",
    }),
  /normalize|schema revision/i
);

const reloadedCloud = normalizeLoadedCloudDesign({
  id: identityA.designId,
  title: "Cloud A",
  roomWidth: 5,
  roomDepth: 4,
  items: [],
  snapshot: loadedCloud.stored,
  updatedAt: identityA.revision,
});
assert.equal(reloadedCloud.fingerprint, loadedCloud.fingerprint);
assert.equal(
  isCloudAutosaveBlocked(createDetachedCloudBaseline(), null),
  false,
  "A local-only/new design must not wait for a cloud acknowledgment."
);
assert.equal(
  isCloudWriteBlocked(createDetachedCloudBaseline(), null, false),
  false,
  "A detached local-only design remains writable."
);
assert.equal(
  isCloudWriteBlocked(
    beginCloudBaselineLoad(createDetachedCloudBaseline(), {
      designId: "loading-cloud-design",
      requestEpoch: 30,
    }),
    null,
    false
  ),
  true,
  "A route load blocks transient local writes before cloud identity commits."
);

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function verifyControlledAutosaveAdapter() {
  const completion = createDeferred<string>();
  const writes: string[] = [];
  const write = async (
    state: typeof duplicateBaseline,
    identity: CloudBaselineIdentity
  ) => {
    if (isCloudAutosaveBlocked(state, identity)) return "blocked" as const;
    writes.push(identity.designId);
    return completion.promise;
  };
  assert.equal(await write(baseline, identityB), "blocked");
  const committed = write(duplicateBaseline, identityB);
  assert.deepEqual(writes, [identityB.designId]);
  completion.resolve("saved");
  assert.equal(await committed, "saved");
}

async function verifyRevisionBoundCloudWriteQueue() {
  const revisionN = "2026-08-05T04:00:00.000Z";
  const revisionN1 = "2026-08-05T04:01:00.000Z";
  const revisionN2 = "2026-08-05T04:02:00.000Z";

  const designSwitchQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  const writeACompletion = createDeferred<{ id: string; updatedAt: string }>();
  let writeAStarted = false;
  let staleDesignStages = 0;
  const pendingWriteA = executeDesignPageCloudWrite({
    queue: designSwitchQueue,
    kind: "update",
    fingerprint: "a-n",
    prepare: () => () => {
      writeAStarted = true;
      return writeACompletion.promise;
    },
    stage: () => {
      staleDesignStages += 1;
      return true;
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(writeAStarted, true, "A must be in flight before B loads.");
  designSwitchQueue.invalidate({
    designId: "design-b",
    revision: revisionN1,
    documentEpoch: 2,
  });
  const baselineB = { designId: "design-b", fingerprint: "b-current" };
  writeACompletion.resolve({ id: "design-a", updatedAt: revisionN1 });
  const completedWriteA = await pendingWriteA;
  assert.equal(completedWriteA.status, "stale");
  assert.equal(staleDesignStages, 0);
  assert.deepEqual(baselineB, {
    designId: "design-b",
    fingerprint: "b-current",
  });
  assert.deepEqual(designSwitchQueue.getCurrent(), {
    designId: "design-b",
    revision: revisionN1,
    documentEpoch: 2,
    persistenceEpoch: 1,
  }, "A. An old-design completion must be inert after B loads.");

  const outOfOrderQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  const writeN = outOfOrderQueue.bind({ kind: "update", fingerprint: "n" });
  const writeN1 = outOfOrderQueue.bind({ kind: "update", fingerprint: "n+1" });
  assert.equal(
    outOfOrderQueue.settleSuccess(writeN1, {
      designId: "design-a",
      revision: revisionN2,
    }),
    "accepted",
    "B. The newest out-of-order completion may advance the revision."
  );
  assert.equal(
    outOfOrderQueue.settleSuccess(writeN, {
      designId: "design-a",
      revision: revisionN1,
    }),
    "stale",
    "B. N cannot replace or acknowledge N+1."
  );
  assert.equal(outOfOrderQueue.getCurrent().revision, revisionN2);

  const queuedRevisionQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  const completionN = createDeferred<{ id: string; updatedAt: string }>();
  let mutationNStarted = false;
  let stagedFingerprint: string | null = null;
  const pendingN = executeDesignPageCloudWrite({
    queue: queuedRevisionQueue,
    kind: "update",
    fingerprint: "n",
    prepare: () => () => {
      mutationNStarted = true;
      return completionN.promise;
    },
    stage: (write) => {
      stagedFingerprint = write.fingerprint;
      return true;
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mutationNStarted, true);
  const preparedN1Revisions: Array<string | null> = [];
  const mutatedN1Revisions: Array<string | null> = [];
  const pendingN1 = executeDesignPageCloudWrite({
    queue: queuedRevisionQueue,
    kind: "update",
    fingerprint: "n+1",
    prepare: (binding) => {
      preparedN1Revisions.push(binding.revision);
      return async () => {
        mutatedN1Revisions.push(binding.revision);
        return { id: "design-a", updatedAt: revisionN2 };
      };
    },
    stage: (write) => {
      stagedFingerprint = write.fingerprint;
      return true;
    },
  });
  completionN.resolve({ id: "design-a", updatedAt: revisionN1 });
  assert.equal((await pendingN).status, "stale");
  const completedN1 = await pendingN1;
  assert.equal(completedN1.status, "saved");
  assert.deepEqual(preparedN1Revisions, [revisionN, revisionN1]);
  assert.deepEqual(mutatedN1Revisions, [revisionN1]);
  assert.equal(stagedFingerprint, "n+1");
  assert.equal(
    queuedRevisionQueue.getCurrent().revision,
    revisionN2,
    "B. An in-flight N must rebind, not discard, its newer queued write."
  );

  const epochQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  const epochCompletion = createDeferred<{ id: string; updatedAt: string }>();
  let oldEpochStages = 0;
  const oldEpochWrite = executeDesignPageCloudWrite({
    queue: epochQueue,
    kind: "update",
    fingerprint: "old",
    prepare: () => () => epochCompletion.promise,
    stage: () => {
      oldEpochStages += 1;
      return true;
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  epochQueue.invalidate();
  epochCompletion.resolve({ id: "design-a", updatedAt: revisionN1 });
  assert.equal((await oldEpochWrite).status, "stale");
  assert.equal(oldEpochStages, 0);
  assert.equal(epochQueue.getCurrent().revision, revisionN,
    "C. Completion from an older persistence epoch must be inert.");

  const recoveryQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  const originalCompletion = createDeferred<{ id: string; updatedAt: string }>();
  let recoveryBaseline: CloudBaselineState = createDetachedCloudBaseline();
  let originalStages = 0;
  const originalWrite = executeDesignPageCloudWrite({
    queue: recoveryQueue,
    kind: "update",
    fingerprint: "original",
    prepare: () => () => originalCompletion.promise,
    stage: () => {
      originalStages += 1;
      return true;
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  recoveryQueue.invalidate();
  const recoveryWrite = executeDesignPageCloudWrite({
    queue: recoveryQueue,
    kind: "recovery_copy",
    fingerprint: "recovery",
    prepare: () => async () => ({
      id: "design-recovery",
      updatedAt: revisionN2,
    }),
    stage: (write) => {
      recoveryBaseline = stagePendingCloudWriteBaseline(recoveryBaseline, {
        identity: {
          designId: write.designId,
          revision: write.revision,
          epoch: write.epoch,
        },
        fingerprint: write.fingerprint,
        writeRequest: {
          requestId: write.requestId,
          persistenceEpoch: write.persistenceEpoch,
        },
      });
      return recoveryBaseline.status === "pending";
    },
  });
  originalCompletion.resolve({ id: "design-a", updatedAt: revisionN1 });
  assert.equal((await originalWrite).status, "stale");
  assert.equal(originalStages, 0);
  assert.equal(recoveryBaseline.status, "detached",
    "D. The original write cannot clear recovery dirty state.");
  const completedRecovery = await recoveryWrite;
  assert.equal(completedRecovery.status, "saved");
  assert.equal(recoveryQueue.getCurrent().designId, "design-recovery");
  assert.equal(recoveryBaseline.status, "pending");
  recoveryBaseline = acknowledgePendingCloudBaseline(recoveryBaseline, {
    identity: {
      designId: "design-recovery",
      revision: revisionN2,
      epoch: 1,
    },
    currentFingerprint: "recovery",
  });
  assert.equal(recoveryBaseline.status, "acknowledged");

  const failureQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  const lateFailure = createDeferred<{ id: string; updatedAt: string }>();
  const failingWrite = executeDesignPageCloudWrite({
    queue: failureQueue,
    kind: "update",
    fingerprint: "n",
    prepare: () => () => lateFailure.promise,
  });
  await Promise.resolve();
  await Promise.resolve();
  const newerWrite = failureQueue.bind({ kind: "update", fingerprint: "n+1" });
  assert.equal(failureQueue.settleSuccess(newerWrite, {
    designId: "design-a",
    revision: revisionN1,
  }), "accepted");
  let saveStatus = "saved";
  let failureStatusMutations = 0;
  lateFailure.reject(new Error("obsolete transport failure"));
  const failedResult = await failingWrite;
  if (failedResult.status === "failed") {
    failureStatusMutations += 1;
    saveStatus = "failed";
  }
  assert.equal(failedResult.status, "stale");
  assert.equal(failureStatusMutations, 0);
  assert.equal(
    saveStatus,
    "saved",
    "E. A stale failure cannot downgrade the current save status."
  );

  const obsoleteRetryQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  const preparedRetryRevisions: Array<string | null> = [];
  const mutatedRetryRevisions: Array<string | null> = [];
  const obsoleteRevisionRetry = executeDesignPageCloudWrite({
    queue: obsoleteRetryQueue,
    kind: "update",
    fingerprint: "retry-old-revision",
    prepare: (binding) => {
      preparedRetryRevisions.push(binding.revision);
      return async () => {
        mutatedRetryRevisions.push(binding.revision);
        return { id: "design-a", updatedAt: revisionN2 };
      };
    },
  });
  obsoleteRetryQueue.installIdentity({
    designId: "design-a",
    revision: revisionN1,
    documentEpoch: 1,
  });
  assert.equal((await obsoleteRevisionRetry).status, "saved");
  assert.deepEqual(preparedRetryRevisions, [revisionN, revisionN1]);
  assert.deepEqual(mutatedRetryRevisions, [revisionN1],
    "F. The obsolete revision must be rejected before a newly bound retry mutates.");
  let obsoleteEpochMutations = 0;
  const obsoleteEpochRetry = executeDesignPageCloudWrite({
    queue: obsoleteRetryQueue,
    kind: "update",
    fingerprint: "retry-old-epoch",
    prepare: () => async () => {
      obsoleteEpochMutations += 1;
      return { id: "design-a", updatedAt: revisionN2 };
    },
  });
  obsoleteRetryQueue.invalidate();
  assert.equal((await obsoleteEpochRetry).status, "stale");
  assert.equal(obsoleteEpochMutations, 0,
    "F. An obsolete epoch retry must stop before mutation.");

  const validQueue = createDesignPageCloudWriteQueue({
    designId: "design-a",
    revision: revisionN,
    documentEpoch: 1,
  });
  let validBaseline: CloudBaselineState = createDetachedCloudBaseline();
  const validExecution = await executeDesignPageCloudWrite({
    queue: validQueue,
    kind: "update",
    fingerprint: "valid",
    prepare: () => async () => ({
      id: "design-a",
      updatedAt: revisionN1,
    }),
    stage: (write) => {
      validBaseline = stagePendingCloudWriteBaseline(validBaseline, {
        identity: {
          designId: write.designId,
          revision: write.revision,
          epoch: write.epoch,
        },
        fingerprint: write.fingerprint,
        writeRequest: {
          requestId: write.requestId,
          persistenceEpoch: write.persistenceEpoch,
        },
      });
      return validBaseline.status === "pending";
    },
  });
  assert.equal(validExecution.status, "saved");
  validBaseline = acknowledgePendingCloudBaseline(validBaseline, {
    identity: { designId: "design-a", revision: revisionN1, epoch: 1 },
    currentFingerprint: "newer-local-edit",
  });
  assert.equal(validBaseline.status, "acknowledged");
  if (validBaseline.status !== "acknowledged") process.exit(1);
  assert.equal(
    validBaseline.fingerprint,
    "valid",
    "G. A valid exact acknowledgment advances the canonical baseline."
  );
}

void Promise.all([
  verifyControlledAutosaveAdapter(),
  verifyRevisionBoundCloudWriteQueue(),
]).then(() => {
  console.log("Design page persistence controller guardrails passed.");
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
