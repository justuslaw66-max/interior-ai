import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveFloorOptions } from "../lib/floor-manager-logic";
import { buildSharePageRooms } from "../lib/public-share-page-model";
import type { RoomSnapshot } from "../lib/room-types";
import { storeyDisplayLabel, storeyLevelLabel } from "../lib/storey-labels";
import { buildSurfaceRoomSummaries } from "../components/editor/design-controls-plan/surfaceSummaryRows";

// UX phase 4f (audit ED7): the Plan's words. Storeys read "Level 1" and "Basement 1": the saved
// "1F", "B1" and "3F Copy" are mapped when shown, never rewritten. The canvas's Floor chip is
// Surfaces. "Clear" (deselect) is × "Deselect <name>".

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

assert.equal(storeyDisplayLabel("1F"), "Level 1");
assert.equal(storeyDisplayLabel("12F"), "Level 12");
assert.equal(storeyDisplayLabel("B1"), "Basement 1");
assert.equal(storeyDisplayLabel("b2"), "Basement 2");
assert.equal(storeyDisplayLabel("3F Copy"), "Level 3 copy");
assert.equal(storeyDisplayLabel("B1 Copy"), "Basement 1 copy");
assert.equal(storeyDisplayLabel("Mezzanine"), "Mezzanine", "A storey someone named keeps its name.");
assert.equal(storeyDisplayLabel("1F Living"), "1F Living", "Only a whole label is mapped.");
assert.equal(storeyLevelLabel(1), "Level 1");
assert.equal(storeyLevelLabel(0), "Basement 1");
assert.equal(storeyLevelLabel(-1), "Basement 2");

const room = (id: string, floorLevel: number, floorLabel?: string) =>
  ({
    id,
    name: id,
    roomType: "living",
    floorLevel,
    ...(floorLabel ? { floorLabel } : {}),
    geometry: { width: 4, depth: 3, wallThickness: 0.12 },
    items: [],
    zones: [],
    savedViews: [],
  }) as unknown as RoomSnapshot;
const rooms = [room("a", 1, "1F"), room("b", 2, "2F Copy"), room("c", 0, "B1"), room("d", 3, "Loft")];
assert.deepEqual(resolveFloorOptions(rooms).map((option) => option.label), ["Basement 1", "Level 1", "Level 2 copy", "Loft"]);
assert.deepEqual(rooms.map((entry) => entry.floorLabel), ["1F", "2F Copy", "B1", "Loft"], "Saved labels are untouched.");
assert.deepEqual(buildSurfaceRoomSummaries(rooms, []).map((summary) => summary.floorLabel), ["Level 1", "Level 2 copy", "Basement 1", "Loft"]);
const shareRooms = buildSharePageRooms(rooms, { retailers: [], checkoutHere: null, unavailable: [], total: 0, productCount: 0 });
assert.deepEqual(shareRooms.map((entry) => entry.floorLabel), ["Level 1", "Level 2 copy", "Basement 1", "Loft"]);

// The Levels panel speaks of levels; the test ids stay.
const levels = read("components/editor/FloorPropertiesPanel.tsx");
for (const words of ["Levels", "Add level", "Level above", "Level below", "Blank level", "Current level", "Wall height"]) {
  assert.ok(levels.includes(words), `The Levels panel says "${words}".`);
}
assert.match(levels, /aria-label=\{isCollapsed \? "Expand Levels" : "Collapse Levels"\}/);
assert.match(read("lib/useFloorManager.ts"), /runHistoryTransaction\(direction === "upper" \? "Add level above" : "Add level below", \(\) => \{/);
assert.match(read("lib/ui-glossary.ts"), /retire: \["add floor", "upper floor", "lower floor", "current floor", "floor panel", "hidden floors"\]/);
assert.match(read("components/ShareFloorPlanPreview.tsx"), /label: storeyDisplayLabel\(source\?\.floorLabel \?\? room\.floorLabel \?\? storeyLevelLabel\(floorLevel\)\),/);
assert.match(read("app/share/[shareToken]/export/page.tsx"), /const floorLabel = storeyDisplayLabel\(sourceRoom\?\.floorLabel \?\? room\.floorLabel \?\? storeyLevelLabel\(floorLevel\)\);/);

// The canvas's room toolbar and the inspector open the room's surfaces with "Surfaces".
const renderer = read("components/editor/renderers/RoomRenderer2D.tsx");
assert.match(renderer, /\{ id: "floor", label: "Surfaces", action: onEditFloor \},/);
assert.match(renderer, /aria-label=\{tool\.id === "floor" \? "Room surfaces" : `\$\{tool\.label\} room`\}/);
assert.match(read("components/editor/design-page/DesignPageSelectionInspector.tsx"), /data-testid="selection-inspector-edit-floor"[\s\S]*?>\s*Surfaces\s*<\/button>/);

// × Deselect <name> where "Clear" deselected (the inspector, the multi-selection bar, the room summary).
assert.match(read("components/editor/design-page/MultiSelectionToolbar.tsx"), /aria-label=\{`Deselect \$\{state\.count\} products`\}[\s\S]*?<X className="h-4 w-4" aria-hidden="true" \/>/);
assert.match(read("components/editor/design-page/PlanRoomSummaryCard.tsx"), /\{hasAllRoomsSelected \? "Deselect all" : "Select all"\}/);
for (const file of ["components/editor/design-page/MultiSelectionToolbar.tsx", "components/editor/design-page/PlanRoomSummaryCard.tsx"]) {
  assert.doesNotMatch(read(file), />\s*Clear\s*</, `${file} no longer says Clear.`);
}

console.log("Plan words (levels, Surfaces, Deselect) checks passed");
