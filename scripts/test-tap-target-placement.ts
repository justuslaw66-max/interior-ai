import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCatalogPlacementRoomTarget } from "@/lib/catalog-placement-policy";
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

const root = process.cwd();
const hookSource = readFileSync(
  join(root, "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const designPageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
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
assert.match(designPageSource, /select: handlePlacementAwareRoomSelect,/);
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
