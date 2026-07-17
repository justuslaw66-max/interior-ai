import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCatalogPlacementRoomTarget } from "@/lib/catalog-placement-policy";
import {
  resolveDesignPageSurfaceBrushAction,
  resolvePlacementAwareRoomSelectionDecision,
} from "@/lib/design-page-placement-target-policy";
import {
  makePolicyPlacement,
  makePolicyRoom,
} from "./catalog-placement-policy-test-utils";

const pendingPlacement = makePolicyPlacement({ roomId: "room-current" });
const targetRoom = makePolicyRoom("room-target", "Dining room");
const smartPlacement = makePolicyPlacement({
  roomId: targetRoom.id,
  position: [1, 0, 1],
  reason: "Auto placed in dining zone",
});

let draftCalls = 0;
const roomDecision = resolveCatalogPlacementRoomTarget({
  pendingPlacement,
  targetRoom,
  options: { source: "room" },
  findPlacement: () => smartPlacement,
  updateDraft: () => {
    draftCalls += 1;
    return null;
  },
  isAcceptable: () => false,
});
assert.ok(roomDecision);
assert.deepEqual(roomDecision.placement, smartPlacement);
assert.equal(roomDecision.target.roomId, targetRoom.id);
assert.equal(roomDecision.target.label, targetRoom.name);
assert.equal(roomDecision.target.valid, false);
assert.equal(roomDecision.message, "Moved preview to Dining room");
assert.equal(draftCalls, 0, "room taps should prefer smart placement");

let smartPlacementCalls = 0;
const zonePosition: [number, number, number] = [0.5, 0, -0.5];
const zoneDecision = resolveCatalogPlacementRoomTarget({
  pendingPlacement,
  targetRoom,
  options: {
    source: "zone",
    localPosition: zonePosition,
    zoneLabel: "Dining zone",
  },
  findPlacement: () => {
    smartPlacementCalls += 1;
    return smartPlacement;
  },
  updateDraft: (placement, rawPosition, rotationY, fallbackReason) => ({
    ...placement,
    position: rawPosition,
    rotationY,
    reason: fallbackReason,
  }),
  isAcceptable: () => true,
});
assert.ok(zoneDecision);
assert.deepEqual(zoneDecision.placement.position, zonePosition);
assert.equal(zoneDecision.placement.reason, "Tapped Dining zone");
assert.equal(zoneDecision.target.valid, true);
assert.equal(zoneDecision.message, "Moved preview to Dining zone");
assert.equal(smartPlacementCalls, 0, "zone taps should honor their local point");

assert.deepEqual(
  resolvePlacementAwareRoomSelectionDecision({
    pendingPlacementHandled: true,
    editorMode: "design",
    activeRoomId: "room-current",
    targetRoomId: "room-target",
  }),
  {
    shouldSetDesignMode: true,
    shouldSwitchRoom: false,
  },
  "a handled pending placement should suppress room switching"
);
assert.deepEqual(
  resolvePlacementAwareRoomSelectionDecision({
    pendingPlacementHandled: false,
    editorMode: "present",
    activeRoomId: "room-current",
    targetRoomId: "room-target",
  }),
  {
    shouldSetDesignMode: false,
    shouldSwitchRoom: true,
  },
  "presentation mode should be preserved while normal room switching remains available"
);
assert.equal(
  resolvePlacementAwareRoomSelectionDecision({
    pendingPlacementHandled: false,
    editorMode: "design",
    activeRoomId: "room-target",
    targetRoomId: "room-target",
  }).shouldSwitchRoom,
  false,
  "selecting the active room should not trigger a redundant switch"
);

const brushPaint = { colorHex: "#cab8a4", name: "Warm neutral" };
assert.deepEqual(
  resolveDesignPageSurfaceBrushAction({
    target: { kind: "floor", roomId: "room-target", id: "floor" },
    active: true,
    canApply: true,
    materialId: "oak-floor",
    paint: brushPaint,
  }),
  { kind: "floor_material", materialId: "oak-floor" },
  "floor targets should use the selected material"
);
assert.deepEqual(
  resolveDesignPageSurfaceBrushAction({
    target: { kind: "ceiling", roomId: "room-target", id: "ceiling" },
    active: true,
    canApply: true,
    materialId: "unused-material",
    paint: brushPaint,
  }),
  { kind: "ceiling_paint", paint: brushPaint },
  "ceiling targets should use the selected paint"
);
assert.deepEqual(
  resolveDesignPageSurfaceBrushAction({
    target: { kind: "wall", roomId: "room-target", id: "wall-1" },
    active: true,
    canApply: true,
    materialId: "wallpaper",
    paint: brushPaint,
  }),
  { kind: "wall_paint", paint: brushPaint },
  "wall paint should take priority when paint and material are both selected"
);
assert.deepEqual(
  resolveDesignPageSurfaceBrushAction({
    target: { kind: "wall", roomId: "room-target", id: "wall-1" },
    active: true,
    canApply: true,
    materialId: "wallpaper",
    paint: null,
  }),
  { kind: "wall_material", materialId: "wallpaper" },
  "wall targets should fall back to the selected material"
);
assert.equal(
  resolveDesignPageSurfaceBrushAction({
    target: { kind: "wall", roomId: "room-target", id: "wall-1" },
    active: false,
    canApply: true,
    materialId: "wallpaper",
    paint: brushPaint,
  }),
  null,
  "inactive surface brushing should not create an action"
);
assert.equal(
  resolveDesignPageSurfaceBrushAction({
    target: { kind: "wall", roomId: "room-target", id: "wall-1" },
    active: true,
    canApply: false,
    materialId: "wallpaper",
    paint: brushPaint,
  }),
  null,
  "read-only surfaces should not create a brush action"
);

const root = process.cwd();
const hookSource = readFileSync(
  join(root, "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const placementTargetControllerSource = readFileSync(
  join(root, "lib/useDesignPagePlacementTargetController.ts"),
  "utf8"
);
const surfaceTargetingFacadeSource = readFileSync(
  join(root, "lib/useDesignPageSurfaceTargetingFacade.ts"),
  "utf8"
);
const designPageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const placementWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPagePlacementWorkspaceRegistration.ts"),
  "utf8"
);
const structureLayerSource = readFileSync(
  join(root, "components/editor/design-page/DesignSceneStructureLayer.tsx"),
  "utf8"
);
const guidanceLayerSource = readFileSync(
  join(root, "components/editor/design-page/DesignSceneGuidanceLayer.tsx"),
  "utf8"
);
const zoneOutlineSource = readFileSync(
  join(root, "components/scene/ZoneOutline.tsx"),
  "utf8"
);

assert.match(hookSource, /resolveCatalogPlacementRoomTarget\(\{/);
assert.match(hookSource, /targetPendingCatalogPlacementToRoom/);
assert.match(
  placementTargetControllerSource,
  /const targetPendingCatalogPlacementToRoom = useCallback/
);
assert.match(
  placementTargetControllerSource,
  /const handlePlacementAwareRoomSelect = useCallback/
);
assert.match(
  placementTargetControllerSource,
  /const handleRendererSurfaceTargetSelect = useCallback/
);
assert.match(
  placementTargetControllerSource,
  /track\("surface_scene_target_selected"/
);
assert.match(
  placementWorkspaceSource,
  /useDesignPageSurfaceTargetingFacade\(\{/
);
assert.match(
  surfaceTargetingFacadeSource,
  /useDesignPagePlacementTargetController\(\{/
);
assert.match(designPageSource, /select: handlePlacementAwareRoomSelect,/);
assert.match(
  designPageSource,
  /selectSurfaceTarget: handleRendererSurfaceTargetSelect,/
);
assert.match(
  designPageSource,
  /targetPendingPlacementToRoom:\s*targetPendingCatalogPlacementToRoom/
);
assert.match(
  structureLayerSource,
  /<RoomRenderer2D[\s\S]*?onSelectRoom=\{actions\.rooms\.select\}[\s\S]*?<HousePlanRenderer3D[\s\S]*?onSelectRoom=\{actions\.rooms\.select\}/
);
assert.match(
  guidanceLayerSource,
  /actions\.targetPendingPlacementToRoom\([\s\S]*source: "zone"[\s\S]*localPosition: \[bounds\.centerX, 0, bounds\.centerZ\]/
);
assert.match(
  zoneOutlineSource,
  /highlighted && \([\s\S]*<mesh[\s\S]*onClick=\{\(e\) => \{[\s\S]*onSelect\(\);/
);

console.log("Tap target placement checks passed");
