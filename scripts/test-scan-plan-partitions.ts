import assert from "node:assert/strict";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { applyFloorPlanTopologyMutationV2, type FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";

let sequence = 0;
function mutate(document: FloorPlanDocumentV2, operation: FloorPlanTopologyMutationV2) {
  sequence += 1;
  return applyFloorPlanTopologyMutationV2(document, operation, { mutationId: `test-${sequence}`, nextRevisionId: `proposed-${sequence}`, actorId: "fixture-author", mutatedAt: "2026-09-14T01:00:00.000Z" });
}

const original = authoredApartment();
const frozen = JSON.stringify(original);
const sourceScene = compileFloorPlanDocumentV2(original);
assert.equal(sourceScene.floors[0].rooms.length, 2);
const remove = { kind: "remove_wall", floorId: "apartment", wallId: "shared", confirmedOpeningIds: ["door"], keepRoomId: "living" } as const;
assert.throws(() => mutate(original, { ...remove, confirmedOpeningIds: [] }), /Review the current doors/);
const merged = mutate(original, { ...remove, confirmedOpeningIds: ["door"] });
assert.equal(merged.document.floors[0].rooms.length, 1);
assert.equal(merged.scene.floors[0].rooms[0].areaSquareMm, 9260 * 6000);
assert.equal(merged.document.floors[0].openings.length, 1);
assert.equal(JSON.stringify(original), frozen);
assert(!compileCanonicalFloorPlanRenderModel(merged.document).floors[0].walls.some(({ id }) => id === "shared"));
assert.throws(() => mutate(original, { kind: "remove_wall", floorId: "apartment", wallId: "west", confirmedOpeningIds: [] }), /replacement closed boundary/);

const split = mutate(merged.document, {
  kind: "add_wall", floorId: "apartment", wallId: "replacement", startVertexId: "b", endVertexId: "e", thicknessMm: 120,
  newRoomId: "study", newRoomName: "Study",
});
assert.equal(split.document.floors[0].rooms.length, 2);
assert.equal(split.scene.floors[0].rooms.reduce((sum, room) => sum + room.areaSquareMm, 0), 9260 * 6000);
assert.deepEqual(split.document.floors[0].walls.find(({ id }) => id === "replacement")?.adjacentRoomIds, ["living", "study"]);
const partial = mutate(split.document, {
  kind: "add_wall", floorId: "apartment", wallId: "diagonal", startVertexId: "p", endVertexId: "q", thicknessMm: 100, heightMm: 1100,
  vertices: [{ id: "p", xMm: 6000, zMm: 1000 }, { id: "q", xMm: 7500, zMm: 2500 }],
});
assert.equal(partial.document.floors[0].rooms.length, 2);
const moved = mutate(partial.document, { kind: "move_wall", floorId: "apartment", wallId: "diagonal", deltaXMm: 100, deltaZMm: 200 });
const model = compileCanonicalFloorPlanRenderModel(moved.document);
const diagonal = model.floors[0].walls.find(({ id }) => id === "diagonal")!;
assert.equal(diagonal.solids[0].topMm, 1100);
assert.equal(diagonal.centerlineSegments[0].start.xMm, 6100);
assert.equal(diagonal.centerlineSegments[0].end.zMm, 2700);
assert.equal(compileFloorPlanDocumentV2(JSON.parse(JSON.stringify(moved.document))).geometryHash, model.geometryHash);
assert.throws(() => mutate(partial.document, { kind: "add_wall", floorId: "apartment", wallId: "duplicate", startVertexId: "p", endVertexId: "q", thicknessMm: 100 }), /invalid canonical geometry/);
console.log("PASS: shared wall removal, dependency confirmation, room merge/division, partial diagonal partition, exact move, canonical 3D/reload, immutable reference, invalid envelope/overlap.");
