import assert from "node:assert/strict";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { applyFloorPlanTopologyMutationV2, type FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { findCanonicalPlacementWall } from "@/lib/floor-plan-placement-boundaries";
import { buildHousePlan2D } from "@/lib/design-page-house-plan";
import { resolveDesignPageOpeningHost } from "@/lib/design-page-opening-host";

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
const attached = mutate(merged.document, {
  kind: "add_wall", floorId: "apartment", wallId: "attached", startVertexId: "t1", endVertexId: "t2", thicknessMm: 100,
  vertices: [{ id: "t1", xMm: 3000, zMm: 0 }, { id: "t2", xMm: 3000, zMm: 6000 }], newRoomId: "office", newRoomName: "Office",
});
assert.equal(attached.document.floors[0].rooms.length, 2);
assert.equal(attached.document.floors[0].walls.length, 9, "Two host splits and the new partition are one valid revision");
assert.equal(attached.scene.floors[0].rooms.reduce((sum, room) => sum + room.areaSquareMm, 0), 9260 * 6000);
const attachedProjection = canonicalFloorPlanToDesignSnapshot(attached.document);
const house = buildHousePlan2D(attachedProjection.snapshot.rooms, 9.26, 6);
const windowHost = resolveDesignPageOpeningHost(attachedProjection.openings[0], house.rooms);
assert.equal(windowHost.status, "resolved", "A split collinear boundary must use the canonical opening centre, not shift it onto each sibling segment");
if (windowHost.status === "resolved") assert.equal(windowHost.host.worldCenter.x, 5.9);
const immutableBeforeRejectedJunction = JSON.stringify(merged.document);
assert.throws(() => mutate(merged.document, {
  kind: "add_wall", floorId: "apartment", wallId: "crosses-window", startVertexId: "t1", endVertexId: "t2", thicknessMm: 100,
  vertices: [{ id: "t1", xMm: 5500, zMm: 0 }, { id: "t2", xMm: 5500, zMm: 6000 }], newRoomId: "office", newRoomName: "Office",
}), /crosses the requested wall split/);
assert.equal(JSON.stringify(merged.document), immutableBeforeRejectedJunction);
const firstHalf = mutate(merged.document, {
  kind: "add_wall", floorId: "apartment", wallId: "half", startVertexId: "b", endVertexId: "middle", thicknessMm: 100,
  vertices: [{ id: "middle", xMm: 4000, zMm: 3000 }],
});
assert.equal(firstHalf.document.floors[0].rooms.length, 1);
const completed = mutate(firstHalf.document, {
  kind: "add_wall", floorId: "apartment", wallId: "last-half", startVertexId: "middle", endVertexId: "e", thicknessMm: 100,
  newRoomId: "completed", newRoomName: "Completed room",
});
assert.equal(completed.document.floors[0].rooms.length, 2);
assert.deepEqual(completed.document.floors[0].walls.find(({ id }) => id === "half")?.adjacentRoomIds, ["living", "completed"]);
const resized = mutate(original, { kind: "move_vertex", floorId: "apartment", vertexId: "c", to: { xMm: 9460, zMm: 0 } });
assert.equal(resized.document.floors[0].dimensions[0].measuredMm, 9460);
assert.equal(original.floors[0].dimensions[0].measuredMm, 9260);
const mergedRoom = canonicalFloorPlanToDesignSnapshot(merged.document).snapshot.rooms[0];
const position: [number, number, number] = [4 - mergedRoom.planPosition!.x, 0, 3 - mergedRoom.planPosition!.z];
const itemSize = { w: 500, d: 500, h: 1000 };
assert.equal(findCanonicalPlacementWall(compileCanonicalFloorPlanRenderModel(original), mergedRoom, position, 0, itemSize), "shared");
assert.equal(findCanonicalPlacementWall(compileCanonicalFloorPlanRenderModel(merged.document), mergedRoom, position, 0, itemSize), null, "Removed wall leaves no invisible placement barrier");
assert.equal(findCanonicalPlacementWall(compileCanonicalFloorPlanRenderModel(firstHalf.document), mergedRoom, position, 0, itemSize), "half");
const raised = mutate(firstHalf.document, { kind: "update_wall", floorId: "apartment", wallId: "half", changes: { heightMm: 900, baseOffsetMm: 1200 } });
assert.equal(findCanonicalPlacementWall(compileCanonicalFloorPlanRenderModel(raised.document), mergedRoom, position, 0, itemSize), null, "Furniture below a raised wall follows the visible extrusion");
assert.equal(findCanonicalPlacementWall(compileCanonicalFloorPlanRenderModel(raised.document), mergedRoom, [position[0], 1, position[2]], 0, itemSize), "half");
const annotated = authoredApartment();
annotated.floors[0].annotations.push({ id: "source-mark", kind: "note", text: "Historical source mark", geometry: { kind: "wall_span", wallId: "shared", offsetMm: 3000, widthMm: 500 }, provenance: annotated.floors[0].walls[0].provenance });
const detached = mutate(annotated, { ...remove, confirmedOpeningIds: ["door"] });
assert.equal(detached.document.floors[0].annotations[0].geometry.kind, "polyline");
assert.equal(detached.document.floors[0].annotations[0].scope, "reference");
assert.equal(compileFloorPlanDocumentV2(detached.document).floors[0].annotations[0].geometry.kind, "polyline");
console.log("PASS: shared wall removal, dependency confirmation, room merge/division, partial diagonal partition, exact move, canonical 3D/reload, immutable reference, invalid envelope/overlap.");
