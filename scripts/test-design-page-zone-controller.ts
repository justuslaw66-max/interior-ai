import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canAutoCreateSeatingZoneForEditor } from "../lib/design-page-zone-orchestration";
import { parseDesignPagePlacementAddMode } from "../lib/design-page-editor-client-preferences";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const normalizeWhitespace = (source: string) => source.replace(/\s+/g, " ");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const sceneRegionSource = readSource(
  "components/editor/design-page/DesignPageSceneRegion.tsx"
);
const sceneRegionWorkspaceRegistrationSource = readSource(
  "lib/useDesignPageSceneRegionWorkspaceRegistration.ts"
);
const sceneAdapterSource = readSource("lib/design-page-scene-region-adapter.ts");
const viewportAdapterSource = readSource(
  "lib/design-page-viewport-region-adapter.ts"
);
const viewportWorkspaceRegistrationSource = readSource(
  "lib/design-page-viewport-workspace-registration.ts"
);
const viewportWorkspaceReadModelSource = readSource(
  "lib/design-page-viewport-workspace-read-model.ts"
);
const structureLayerSource = readSource(
  "components/editor/design-page/DesignSceneStructureLayer.tsx"
);
const viewportOverlaySource = readSource(
  "components/editor/design-page/DesignPageViewportOverlayLayer.tsx"
);
const controllerSource = readSource("lib/useDesignPageZoneController.ts");
const editorInteractionRegistrationSource = readSource(
  "lib/useDesignPageEditorInteractionRegistration.ts"
);
const orchestrationSource = readSource("lib/design-page-zone-orchestration.ts");
const onboardingSource = readSource("lib/useDesignPageOnboarding.ts");
const onboardingRegistrationSource = readSource(
  "lib/useDesignPageOnboardingRegistrationFacade.ts"
);
const commerceOnboardingSource = readSource(
  "lib/useDesignPageCommerceOnboardingRegistration.ts"
);
const clientLifecycleSource = readSource(
  "lib/useDesignPageEditorClientLifecycle.ts"
);
const normalizedController = normalizeWhitespace(controllerSource);
const normalizedEditorInteractionRegistration = normalizeWhitespace(
  editorInteractionRegistrationSource
);

assert.match(
  editorInteractionRegistrationSource,
  /useDesignPageZoneController\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "Editor interaction should compose the zone controller through grouped contracts."
);

for (const contractName of [
  "DesignPageZoneControllerState",
  "DesignPageZoneControllerConfiguration",
  "DesignPageZoneControllerRefs",
  "DesignPageZoneControllerActions",
  "UseDesignPageZoneControllerInput",
] as const) {
  assert.match(
    controllerSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit typed contract.`
  );
}

for (const inlineOwner of [
  "createZoneFromSelection",
  "autoCreateSeatingZone",
  "autoLayoutZone",
  "rotateZone",
  "ungroupZone",
  "getZoneBounds",
] as const) {
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${inlineOwner}\\s*=\\s*use(?:Callback|Memo)`),
    `${inlineOwner} should remain owned by the zone controller.`
  );
  assert.match(
    controllerSource,
    new RegExp(`const ${inlineOwner}\\s*=\\s*use(?:Callback|Memo)`),
    `The zone controller should own ${inlineOwner}.`
  );
}

for (const helperName of [
  "buildManualZoneFromSelection",
  "buildAutoSeatingZone",
  "buildAutoLayoutZoneItems",
  "buildRotatedZoneItems",
  "buildPlanZones2D",
  "resolveZoneBounds",
  "reconcileZonesForItems",
  "zonesEqual",
] as const) {
  assert.ok(
    controllerSource.includes(helperName),
    `The zone controller should own the ${helperName} integration.`
  );
}

assert.doesNotMatch(
  workspaceSource,
  /\b(?:_normalizeZones|_buildAutoZones|_zonesEqual)\b/,
  "Workspace should not retain zone-normalization ownership."
);
assert.match(
  controllerSource,
  /useState<ZoneMin\["type"\]>\(\s*"seating"\s*\)/,
  "New manual zones should continue to default to the seating type."
);
assert.match(
  controllerSource,
  /const selectedSet = selectedIdsRef\.current;\s*if \(!selectedSet\.size\) return;/,
  "Manual creation should continue to read selection at event time and no-op when empty."
);
assert.match(
  controllerSource,
  /const selectedItems = itemsRef\.current\.filter\([\s\S]*?selectedSet\.has\(item\.instanceId\)[\s\S]*?if \(!selectedItems\.length\) return;/,
  "Manual creation should continue to resolve selected items from the event-time item ref."
);
assert.match(
  controllerSource,
  /const nextZones = reconcileZonesForItems\(\{[\s\S]*?zones: next\.manualZones,[\s\S]*?allItems: itemsRef\.current,[\s\S]*?catalogItems,[\s\S]*?history\.begin\("Create zone"\);[\s\S]*?setDesignSnapshot\(\(previous\) =>[\s\S]*?updateActiveRoomZones\(previous, nextZones\)[\s\S]*?history\.commit\(\);[\s\S]*?setSelectedZoneId\(next\.zoneId\);[\s\S]*?clearSelection\(\);/,
  "Manual creation should reconcile auto zones, persist active-room zones, and preserve history/select ordering."
);

for (const fixture of [
  {
    editorMode: "design",
    source: "editor",
    isClientPreview: false,
    expected: true,
  },
  {
    editorMode: "adjust",
    source: "editor",
    isClientPreview: false,
    expected: false,
  },
  {
    editorMode: "adjust",
    source: "onboarding_post_placement",
    isClientPreview: false,
    expected: true,
  },
  {
    editorMode: "ai",
    source: "onboarding_post_placement",
    isClientPreview: false,
    expected: false,
  },
  {
    editorMode: "adjust",
    source: "onboarding_post_placement",
    isClientPreview: true,
    expected: false,
  },
] as const) {
  assert.equal(
    canAutoCreateSeatingZoneForEditor(fixture),
    fixture.expected,
    `${fixture.source} should ${fixture.expected ? "be allowed" : "be blocked"} in ${fixture.editorMode}${fixture.isClientPreview ? " client preview" : " mode"}.`
  );
}
assert.match(
  controllerSource,
  /canAutoCreateSeatingZoneForEditor\(\{[\s\S]*?editorMode,[\s\S]*?isClientPreview,[\s\S]*?source: request\.source/,
  "The controller should enforce the shared source-aware editor-mode policy."
);
assert.ok(
  normalizedController.includes(
    "if (seatingZoneAutoDisabledRef.current) return false;"
  ),
  "Automatic seating-zone creation should preserve the user opt-out gate."
);
assert.match(
  controllerSource,
  /const nextZones = reconcileZonesForItems\(\{[\s\S]*?zones: next\.manualZones,[\s\S]*?allItems: itemsRef\.current,[\s\S]*?catalogItems,[\s\S]*?history\.begin\("auto_create_seating_zone"\);[\s\S]*?setDesignSnapshot\(\(previous\) =>[\s\S]*?updateActiveRoomZones\(previous, nextZones\)[\s\S]*?history\.commit\(\);[\s\S]*?setSelectedZoneId\(next\.zoneId\);/,
  "Automatic creation should reconcile auto zones and preserve its active-room update, history, and selection behavior."
);
assert.match(
  controllerSource,
  /track\("seating_zone_auto_created",\s*\{\s*zoneId: next\.zoneId,\s*trigger: "first_sofa",\s*\}\);/,
  "The controller should preserve the existing first-sofa zone analytics payload."
);
assert.match(
  onboardingSource,
  /const seatingZoneReady = autoCreateSeatingZone\(sofaItem, \{\s*source: "onboarding_post_placement",\s*\}\);\s*if \(!seatingZoneReady\) return;\s*firstSofaHandledRef\.current = true;[\s\S]*?track\("seating_zone_auto_created",\s*\{\s*design_id: state\.designId,\s*isGuest: state\.isGuest,\s*timeSinceStartMs:/,
  "Onboarding should use the explicit post-placement source and latch only after the controller accepts the request."
);

for (const historyLabel of [
  "Rotate zone",
  "Ungroup zone",
] as const) {
  assert.match(
    controllerSource,
    new RegExp("(?:begin|commitItems)\\([^\\n]*" + historyLabel),
    `The controller should preserve the ${historyLabel} history label.`
  );
}
assert.ok(
  normalizedController.includes(
    "`Auto-layout ${autoLayout.zoneType} zone`"
  ),
  "Auto-layout should preserve its dynamic history label."
);
assert.match(
  controllerSource,
  /console\.error\("\[Zone\] Auto-layout failed", \{ zoneId, error \}\)/,
  "Auto-layout failures should remain isolated and reported."
);
assert.match(
  controllerSource,
  /console\.error\("\[Zone\] Rotate failed", \{ zoneId, deltaRot, error \}\)/,
  "Rotation failures should remain isolated and reported."
);

assert.match(
  clientLifecycleSource,
  /localStorage\.getItem\([\s\S]*?"seating_zone_auto_disabled"[\s\S]*?seatingZoneAutoDisabled\.current = seatingDisabled === "1"/,
  "The client lifecycle should continue to hydrate the seating-zone disable preference."
);
assert.equal(parseDesignPagePlacementAddMode("preview"), "preview");
assert.equal(parseDesignPagePlacementAddMode("auto"), "auto");
assert.equal(parseDesignPagePlacementAddMode("manual"), null);
assert.equal(parseDesignPagePlacementAddMode(null), null);
assert.match(
  controllerSource,
  /seatingZoneAutoDisabledRef\.current = true;[\s\S]*?localStorage\.setItem\("seating_zone_auto_disabled", "1"\)/,
  "Ungrouping a seating zone should continue to persist the auto-create opt-out."
);
assert.match(
  controllerSource,
  /history\.begin\("Ungroup zone"\);[\s\S]*?setDesignSnapshot\(\(previous\) =>[\s\S]*?updateActiveRoomZones\(previous, nextZones\)[\s\S]*?history\.commit\(\);[\s\S]*?setSelectedZoneId\(null\);/,
  "Ungroup should persist active-room zones and preserve history/selection ordering."
);
assert.ok(
  normalizedEditorInteractionRegistration.includes(
    "seatingZoneAutoDisabled: coreShell.refs.seatingZoneAutoDisabledRef"
  ),
  "Editor interaction should pass the core shell's hydrated disable ref into the controller."
);

assert.match(
  controllerSource,
  /resolveZoneBounds\(zone, items, getSelectionBounds\)/,
  "Zone bounds should continue to derive from live items and shared selection bounds."
);
assert.match(
  controllerSource,
  /buildPlanZones2D\(zones, items, getSelectionBounds\)/,
  "The controller should continue to build 2D zone models from shared bounds."
);

const selectedZoneCleanupIndex = controllerSource.indexOf(
  "if (!selectedZoneId) return;"
);
const zoneNormalizationIndex = controllerSource.indexOf(
  "const nextZones = reconcileZonesForItems"
);
assert.ok(
  selectedZoneCleanupIndex >= 0 &&
    zoneNormalizationIndex > selectedZoneCleanupIndex,
  "Selected-zone cleanup should remain mounted before automatic zone normalization."
);
assert.match(
  controllerSource,
  /const nextZones = reconcileZonesForItems\(\{[\s\S]*?zones: currentZones,[\s\S]*?allItems: items,[\s\S]*?catalogItems,[\s\S]*?zonesEqual\(nextZones, currentZones\)[\s\S]*?updateActiveRoomZones\(previous, nextZones\)/,
  "Normalization should preserve automatic-zone rebuilding and active-room updates."
);
assert.equal(
  controllerSource.match(/reconcileZonesForItems\(/g)?.length,
  3,
  "Normalization and both creation paths should share one zone reconciler."
);
assert.equal(
  controllerSource.match(/updateActiveRoomZones\(/g)?.length,
  4,
  "Every zone write path should use the shared active-room updater."
);
assert.doesNotMatch(
  controllerSource,
  /setDesignSnapshot\(\{[\s\S]*?\.\.\.designSnapshotRef\.current,[\s\S]*?zones:/,
  "Zone actions must not write the legacy top-level snapshot.zones field."
);
assert.match(
  orchestrationSource,
  /export function reconcileZonesForItems\([\s\S]*?normalizeZones\(zones, allItems\)[\s\S]*?zone\.source === "manual"[\s\S]*?buildAutoZones\(\{[\s\S]*?allItems,[\s\S]*?manualZones,[\s\S]*?catalogItems,[\s\S]*?return \[\.\.\.manualZones, \.\.\.autoZones\];/,
  "The shared reconciler should normalize manual zones and deterministically rebuild automatic zones."
);
assert.match(
  orchestrationSource,
  /export function updateActiveRoomZones\([\s\S]*?getActiveRoom\(snapshot\)[\s\S]*?updateRoom\(snapshot, \{[\s\S]*?\.\.\.activeRoom,[\s\S]*?zones,/,
  "The shared updater should replace zones only on the active room."
);

for (const { pattern, description } of [
  {
    pattern:
      /useDesignPageOnboardingRegistrationFacade\(\{[\s\S]*?actions:\s*\{[\s\S]*?autoCreateSeatingZone:[\s\S]*?editorInteraction\.boundaries\.zone\.actions\.autoCreateSeatingZone[\s\S]*?clampToRoom: documentRoom\.actions\.room\.clampToActiveRoom/,
    description: "onboarding auto-create action",
  },
  { pattern: /zones:\s*planZones2D/, description: "2D plan zones" },
  {
    pattern:
      /changeZoneType:\s*setPendingZoneType,[\s\S]*?createZone:\s*createZoneFromSelection/,
    description: "manual zone action boundary",
  },
] as const) {
  assert.match(
    description === "onboarding auto-create action"
      ? commerceOnboardingSource
      : description === "2D plan zones"
        ? sceneRegionWorkspaceRegistrationSource
        : viewportWorkspaceRegistrationSource,
    description === "2D plan zones"
      ? /zones:\s*zone\.state\.planZones2D/
      : description === "manual zone action boundary"
        ? /changeZoneType:\s*zone\.actions\.setPendingZoneType,[\s\S]*?createZone:\s*zone\.actions\.createZoneFromSelection/
        : pattern,
    `The owning registration should preserve its ${description} wiring.`
  );
}

assert.match(
  onboardingRegistrationSource,
  /useDesignPageOnboarding\(\{[\s\S]*?state,[\s\S]*?actions,[\s\S]*?configuration,/,
  "The onboarding registration facade should pass the verified zone actions to the controller."
);

assert.match(
  sceneRegionWorkspaceRegistrationSource,
  /resolvers:\s*\{[\s\S]*?guidance:\s*\{ getZoneBounds: zone\.resolvers\.getZoneBounds \}/,
  "The scene registration should inject the zone-bounds resolver into the scene adapter."
);
assert.match(
  sceneAdapterSource,
  /resolvers,/,
  "The scene adapter should preserve grouped scene resolvers."
);
assert.match(
  sceneRegionSource,
  /<DesignSceneGuidanceLayer[\s\S]*?resolvers=\{resolvers\.guidance\}/,
  "The scene region should pass the zone-bounds resolver to the guidance layer."
);
assert.match(
  viewportWorkspaceReadModelSource,
  /selectionControls:\s*\{[\s\S]*?pendingZoneType:\s*zone\.state\.pendingZoneType,[\s\S]*?selectedZone:\s*zone\.state\.selectedZone,[\s\S]*?isClientPreview:\s*coreShell\.derived\.access\.isClientPreview/,
  "The viewport read model should inject zone live-policy inputs."
);
assert.match(
  viewportAdapterSource,
  /resolveDesignPageViewportSelectionControlsState\(\s*state\.selectionControls\s*\)/,
  "The viewport adapter should resolve zone live-policy state."
);
assert.match(
  viewportWorkspaceRegistrationSource,
  /selectedZone:\s*\{[\s\S]*?autoLayout:\s*zone\.actions\.autoLayoutZone,[\s\S]*?rotateZone:\s*zone\.actions\.rotateZone,[\s\S]*?ungroup:\s*zone\.actions\.ungroupZone/,
  "The viewport registration should inject selected-zone actions into the adapter."
);
assert.match(
  viewportAdapterSource,
  /rotateQuarterTurn:\s*\(zoneId\)\s*=>[\s\S]*?rotateZone\(\s*zoneId,\s*Math\.PI \/ 2\s*\)/,
  "The viewport adapter should preserve quarter-turn zone rotation."
);

assert.match(
  viewportOverlaySource,
  /<DesignPageViewportSelectionControls\s+[\s\S]*?state=\{state\.selectionControls\}[\s\S]*?configuration=\{configuration\.selectionControls\}[\s\S]*?actions=\{actions\.selectionControls\}/,
  "The viewport layer should own selection-control rendering while Workspace retains live zone policy and actions."
);

assert.match(
  structureLayerSource,
  /zones=\{plan\.zones\}/,
  "The structure layer should pass the composed plan zones to the 2D renderer."
);

console.log("Design-page zone controller guardrails passed.");
