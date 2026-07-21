import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeDesignPageSavedViews } from "../lib/useDesignPagePersistence";

const root = process.cwd();
const pageSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "DesignPageWorkspace.tsx"),
  "utf8"
);
const controllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPagePersistence.ts"),
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
  /const storedSnapshot = getStoredDesignForPersistence\(\);[\s\S]*?const payload = \{[\s\S]*?designApi\.create\(payload\)[\s\S]*?setLastPersistedSnapshotFingerprint\(fingerprintStoredDesign\(storedSnapshot\)\)/,
  "Manual saves should fingerprint the exact event-time snapshot sent through the design API client."
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
  controllerSource,
  /const snapshot = legacyApiToSnapshot\(data\);[\s\S]*?setLastPersistedSnapshotFingerprint\(fingerprintDesignSnapshot\(snapshot\)\);[\s\S]*?setDesignSnapshot\(snapshot\);[\s\S]*?setDesignId\(data\.id\);[\s\S]*?setLastCloudRevision\(loadedRevision\);[\s\S]*?setLastDbSaveAt\(/,
  "Cloud loads should set the persisted fingerprint, identity, revision, and save timestamp."
);
assert.match(
  controllerSource,
  /requestEpoch !== documentEpochRef\.current\) return "superseded";[\s\S]*?error\.kind === "aborted"[\s\S]*?return "superseded";[\s\S]*?error\.kind === "forbidden" \|\| error\.kind === "not_found"[\s\S]*?\? "missing"[\s\S]*?: "unavailable"/,
  "Cloud loads should distinguish superseded and transient requests from missing designs."
);

assert.match(
  controllerSource,
  /if \(!localBackupHydrated\) return;[\s\S]*?writeLocalDesignBackup\(\);[\s\S]*?if \(!designId\) return;[\s\S]*?if \(!localBackupHydrated\) return;/,
  "Both local and cloud writers should remain behind the page-owned hydration gate."
);

assert.match(
  controllerSource,
  /const timer = setTimeout\(async \(\) => \{[\s\S]*?const storedSnapshot = await enqueueCloudWrite\(async \(\) => \{[\s\S]*?const snapshot = getStoredDesignForPersistence\(\);[\s\S]*?designApi\.update\([\s\S]*?designId,[\s\S]*?expectedUpdatedAt: lastCloudRevision[\s\S]*?return \{[\s\S]*?snapshot,[\s\S]*?updatedAt:[\s\S]*?scheduledEpoch === documentEpochRef\.current[\s\S]*?setLastCloudRevision\(storedSnapshot\.updatedAt\);[\s\S]*?if \(!cancelled\) \{[\s\S]*?fingerprintStoredDesign\(storedSnapshot\.snapshot\)/,
  "Cloud autosave should capture its payload, enforce the loaded revision, retain every committed revision, and fingerprint only the current acknowledged snapshot."
);

assert.match(
  controllerSource,
  /const \[lastCloudRevision, setLastCloudRevision\][\s\S]*?typeof data\.updatedAt === "string"[\s\S]*?setLastCloudRevision\(storedSnapshot\.updatedAt\)/,
  "Persistence should retain revisions returned by load/create/update operations."
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
  controllerSource,
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

console.log("Design page persistence controller guardrails passed.");
