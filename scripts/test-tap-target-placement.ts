import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const designPage = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const sceneStructureLayer = readFileSync(
  join(root, "components/editor/design-page/DesignSceneStructureLayer.tsx"),
  "utf8"
);
const catalogPlacementHook = readFileSync(
  join(root, "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const sceneGuidanceLayer = readFileSync(
  join(root, "components/editor/design-page/DesignSceneGuidanceLayer.tsx"),
  "utf8"
);
const confirmPanel = readFileSync(
  join(root, "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"),
  "utf8"
);
const zoneOutline = readFileSync(join(root, "components/scene/ZoneOutline.tsx"), "utf8");

assert.match(
  catalogPlacementHook,
  /const targetPendingCatalogPlacementToRoom = useCallback/,
  "design page should expose a room/zone tap-target placement helper"
);
assert.match(
  designPage,
  /const handlePlacementAwareRoomSelect = useCallback/,
  "room selection should branch when a pending placement exists"
);
assert.match(
  sceneStructureLayer,
  /<RoomRenderer2D[\s\S]*?onSelectRoom=\{actions\.rooms\.select\}[\s\S]*?<HousePlanRenderer3D[\s\S]*?onSelectRoom=\{actions\.rooms\.select\}/,
  "2D and 3D room renderers should use the structure layer's room-selection action"
);
assert.match(
  designPage,
  /select: handlePlacementAwareRoomSelect,/,
  "the workspace should wire placement-aware room tapping into the structure layer"
);
assert.match(
  sceneGuidanceLayer,
  /helperLabel=\{compatible \? `Tap to place in \$\{label\}` : undefined\}/,
  "compatible zones should advertise tap-to-place"
);
assert.match(
  sceneGuidanceLayer,
  /actions\.targetPendingPlacementToRoom\([\s\S]*configuration\.activeRoomId,[\s\S]*source: "zone"[\s\S]*localPosition: \[bounds\.centerX, 0, bounds\.centerZ\]/,
  "zone tap should target the pending placement to the zone center"
);
assert.match(
  confirmPanel,
  /Drag the preview or tap a room\/highlighted zone, then confirm\./,
  "placement sheet should explain room and zone tap targets"
);
assert.match(
  zoneOutline,
  /highlighted && \([\s\S]*<mesh[\s\S]*onClick=\{\(e\) => \{[\s\S]*onSelect\(\);/,
  "highlighted zones should be tappable across the filled area"
);

console.log("Tap target placement checks passed");
