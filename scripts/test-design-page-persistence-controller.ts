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
} from "../lib/design-page-cloud-baseline";
import { migrateDesignDocument } from "../lib/design-document-migrations";
import {
  normalizeLoadedCloudDesign,
  projectCanonicalDesignPersistence,
} from "../lib/design-page-persistence-projection";
import { storedToSnapshot } from "../lib/room-persistence";
import { fingerprintDesignSnapshot } from "../lib/snapshot-fingerprint";
import { sanitizeDesignPageSavedViews } from "../lib/useDesignPagePersistence";

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
  controllerSource,
  /const storedSnapshot = getStoredDesignForPersistence\(\);[\s\S]*?const payload = \{[\s\S]*?designApi\.create\(payload\)[\s\S]*?const savedFingerprint = fingerprintStoredDesign\(storedSnapshot\);[\s\S]*?stageCloudWriteBaseline\(\{[\s\S]*?fingerprint: savedFingerprint/,
  "Manual saves should fingerprint the exact event-time snapshot sent through the design API client."
);
assert.match(
  controllerSource,
  /const saveDesignToCloud = useCallback[\s\S]*?expectedUpdatedAt: lastCloudRevision[\s\S]*?designApi\.update\(designId, payload\)/,
  "Manual updates should reject stale cloud revisions just like autosave."
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
  /currentCloudWriteIsBlocked\(\)[\s\S]*?const timer = setTimeout\(async \(\) => \{[\s\S]*?const storedSnapshot = await enqueueCloudWrite\(async \(\) => \{[\s\S]*?const snapshot = getStoredDesignForPersistence\(\);[\s\S]*?designApi\.update\([\s\S]*?designId,[\s\S]*?expectedUpdatedAt: lastCloudRevision[\s\S]*?scheduledEpoch === documentEpochRef\.current[\s\S]*?stageCloudWriteBaseline\([\s\S]*?fingerprintStoredDesign\(storedSnapshot\.snapshot\)[\s\S]*?epoch: scheduledEpoch[\s\S]*?setLastCloudRevision\(committedRevision\)/,
  "Cloud autosave should remain blocked until acknowledgment, then capture and acknowledge its exact event-time snapshot."
);

assert.match(
  `${controllerSource}\n${cloudLoadControllerSource}\n${controllerSource}`,
  /const \[lastCloudRevision, setLastCloudRevision\][\s\S]*?setLastCloudRevision\(normalized\.revision\)[\s\S]*?setLastCloudRevision\(committedRevision\)/,
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
  /saveConflictAsNewCopy[\s\S]*?currentWriteIsBlocked\(\)[\s\S]*?createConflictCopy\(input\)[\s\S]*?currentWriteIsBlocked\(\)/,
  "Recovery-copy creation should remain gated through its independent baseline commit."
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
  { identity: writeIdentityA, fingerprint: loadedCloud.fingerprint }
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

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
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

void verifyControlledAutosaveAdapter().then(() => {
  console.log("Design page persistence controller guardrails passed.");
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
