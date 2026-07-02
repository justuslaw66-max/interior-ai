import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const designPage = readFileSync(join(root, "app/design/page.tsx"), "utf8");
const zoneOutline = readFileSync(join(root, "components/scene/ZoneOutline.tsx"), "utf8");

assert.match(
  designPage,
  /const targetPendingCatalogPlacementToRoom = useCallback/,
  "design page should expose a room/zone tap-target placement helper"
);
assert.match(
  designPage,
  /const handlePlacementAwareRoomSelect = useCallback/,
  "room selection should branch when a pending placement exists"
);
assert.match(
  designPage,
  /onSelectRoom=\{handlePlacementAwareRoomSelect\}/,
  "2D and 3D room renderers should use placement-aware room tapping"
);
assert.match(
  designPage,
  /helperLabel=\{compatible \? `Tap to place in \$\{getZoneLabel\(zone\.type\)\}` : undefined\}/,
  "compatible zones should advertise tap-to-place"
);
assert.match(
  designPage,
  /targetPendingCatalogPlacementToRoom\(activeRoom\.id,[\s\S]*source: "zone"[\s\S]*localPosition: \[bounds\.centerX, 0, bounds\.centerZ\]/,
  "zone tap should target the pending placement to the zone center"
);
assert.match(
  designPage,
  /Drag the preview or tap a room\/highlighted zone, then confirm\./,
  "placement sheet should explain room and zone tap targets"
);
assert.match(
  zoneOutline,
  /highlighted && \([\s\S]*<mesh[\s\S]*onClick=\{\(e\) => \{[\s\S]*onSelect\(\);/,
  "highlighted zones should be tappable across the filled area"
);

console.log("Tap target placement checks passed");
