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
import { projectLegacyOpeningGestureToCanonicalWallV2 } from "@/lib/floor-plan-topology-editor";
import { mapPlanOpeningsToRoomRenderer } from "@/lib/design-page-plan-overlay-projections";
import { buildOpeningRenderSegments } from "@/components/editor/renderers/room-renderer-2d-opening-geometry";
import { validateDesignPageOpeningPlacement } from "@/lib/design-page-opening-placement";
import { projectDesignPageViewportOpening, resolveDesignPageOpeningViewportState } from "@/lib/design-page-opening-viewport";
import { buildOpeningGestureDraft } from "@/lib/floor-plan-opening-gesture";
import { buildWallGestureDraft } from "@/lib/floor-plan-wall-gesture";
import { proposedWallLengthEndpoint } from "@/lib/floor-plan-wall-length";

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
const joinSource = structuredClone(partial.document);
joinSource.floors[0].dimensions.push({ id: "diagonal-measure", fromVertexId: "p", toVertexId: "q", axis: "aligned", measuredMm: 2121,
  provenance: structuredClone(original.floors[0].dimensions[0].provenance) });
const beforeJoin = JSON.stringify(joinSource);
const joinStart = mutate(joinSource, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "diagonal", endpoint: "start", to: { xMm: 4000, zMm: 0 } });
assert.equal(joinStart.document.floors[0].walls.find(({ id }) => id === "diagonal")!.path.startVertexId, "b");
assert.equal(joinStart.document.floors[0].vertices.some(({ id }) => id === "p"), false);
assert.equal(joinStart.document.floors[0].dimensions.find(({ id }) => id === "diagonal-measure")!.fromVertexId, "b");
assert.equal(joinStart.document.floors[0].rooms.length, 2, "A joined partial wall does not invent a room");
assert.equal(JSON.stringify(joinSource), beforeJoin);
const joinEnd = mutate(joinStart.document, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "diagonal", endpoint: "end", to: { xMm: 9260, zMm: 6000 }, newRoomId: "joined-room", newRoomName: "Diagonal room" });
assert.equal(joinEnd.document.floors[0].rooms.length, 3);
assert.equal(joinEnd.scene.floors[0].rooms.reduce((total, room) => total + room.areaSquareMm, 0), 9260 * 6000);
assert.equal(joinEnd.document.floors[0].walls.find(({ id }) => id === "diagonal")!.path.endVertexId, "d");
assert.equal(joinEnd.document.floors[0].walls.find(({ id }) => id === "diagonal")!.adjacentRoomIds.length, 2);
assert.equal(joinEnd.document.floors[0].dimensions.find(({ id }) => id === "diagonal-measure")!.toVertexId, "d");
assert.equal(compileFloorPlanDocumentV2(JSON.parse(JSON.stringify(joinEnd.document))).geometryHash, joinEnd.scene.geometryHash);
const joinMiddle = mutate(joinStart.document, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "diagonal", endpoint: "end", to: { xMm: 6000, zMm: 6000 }, newRoomId: "joined-middle-room", newRoomName: "Joined room" });
assert.equal(joinMiddle.document.floors[0].rooms.length, 3);
assert.equal(joinMiddle.wallSplits?.length, 1, "Joining to a host interior splits it atomically for finish reconciliation");
assert.equal(joinMiddle.wallSplits?.[0].splitVertexId, "q");
assert.throws(() => mutate(joinStart.document, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "diagonal", endpoint: "end", to: { xMm: 9260, zMm: 6000 } }), /Name the new room/);
assert.throws(() => mutate(joinSource, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "replacement", endpoint: "start", to: { xMm: 9260, zMm: 6000 } }), /free wall endpoint/);
assert.throws(() => mutate(joinSource, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "diagonal", endpoint: "end", to: { xMm: 6500, zMm: 3500 } }), /exactly on/);
assert.throws(() => mutate(joinSource, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "diagonal", endpoint: "end", to: { xMm: 5500, zMm: 0 } }), /cross|opening/i);
assert.equal(JSON.stringify(joinSource), beforeJoin, "Rejected joins must leave geometry, measurements and openings intact");
const moved = mutate(partial.document, { kind: "move_wall", floorId: "apartment", wallId: "diagonal", deltaXMm: 100, deltaZMm: 200 });
const model = compileCanonicalFloorPlanRenderModel(moved.document);
const diagonal = model.floors[0].walls.find(({ id }) => id === "diagonal")!;
assert.equal(diagonal.solids[0].topMm, 1100);
assert.equal(diagonal.centerlineSegments[0].start.xMm, 6100);
assert.equal(diagonal.centerlineSegments[0].end.zMm, 2700);
assert.equal(compileFloorPlanDocumentV2(JSON.parse(JSON.stringify(moved.document))).geometryHash, model.geometryHash);
const gestureInput = { floorId: "apartment", wallId: "diagonal", path: diagonal.path,
  start: diagonal.centerlineSegments[0].start, end: diagonal.centerlineSegments[0].end, mode: "wall" as const, delta: { xMm: 101.4, zMm: -52.8 } };
const translation = buildWallGestureDraft(gestureInput)!;
assert.deepEqual(translation.start, { xMm: 6201, zMm: 1147 });
assert.deepEqual(translation.end, { xMm: 7701, zMm: 2647 });
const gestureMoved = mutate(moved.document, translation.operation);
assert.deepEqual(compileCanonicalFloorPlanRenderModel(gestureMoved.document).floors[0].walls.find(({ id }) => id === "diagonal")!.centerlineSegments[0].start, translation.start);
for (const mode of ["start", "end"] as const) {
  const draft = buildWallGestureDraft({ ...gestureInput, mode })!;
  const edited = mutate(moved.document, draft.operation);
  const editedWall = compileCanonicalFloorPlanRenderModel(JSON.parse(JSON.stringify(edited.document))).floors[0].walls.find(({ id }) => id === "diagonal")!;
  assert.deepEqual(editedWall.centerlineSegments[0].start, draft.start);
  assert.deepEqual(editedWall.centerlineSegments[0].end, draft.end);
  assert.deepEqual(mode === "start" ? draft.end : draft.start, mode === "start" ? gestureInput.end : gestureInput.start);
}
for (const delta of [{ xMm: 0.4, zMm: -0.4 }, { xMm: Infinity, zMm: 0 }, { xMm: Number.MAX_SAFE_INTEGER, zMm: 0 }]) {
  assert.equal(buildWallGestureDraft({ ...gestureInput, delta }), null);
}
assert.equal(buildWallGestureDraft({ ...gestureInput, path: { kind: "arc", startVertexId: "p", endVertexId: "q", centerVertexId: "arc-center", clockwise: true } }), null, "Curved walls must not be silently converted to a chord drag");
const zeroLength = buildWallGestureDraft({ ...gestureInput, mode: "end", delta: { xMm: -1500, zMm: -1500 } })!;
assert.throws(() => mutate(moved.document, zeroLength.operation), /zero|length|invalid|compile/i);
const lengthDraft = proposedWallLengthEndpoint(moved.document.floors[0], moved.document.floors[0].walls.find(({ id }) => id === "diagonal")!, 2500)!;
assert.deepEqual(lengthDraft.to, { xMm: 7868, zMm: 2968 });
assert(Math.abs(lengthDraft.actualLengthMm - 2500) < 0.71, "Report integer endpoint rounding instead of claiming an exact unattainable length");
const lengthEdited = mutate(moved.document, { kind: "move_vertex", floorId: "apartment", vertexId: lengthDraft.vertexId, to: lengthDraft.to });
const lengthRestored = JSON.parse(JSON.stringify(lengthEdited.document));
assert.equal(compileFloorPlanDocumentV2(lengthRestored).geometryHash, lengthEdited.scene.geometryHash);
assert.equal(lengthRestored.floors[0].vertices.find((v: { id: string }) => v.id === "q").xMm, 7868);
assert.equal(lengthRestored.floors[0].vertices.find((v: { id: string }) => v.id === "q").zMm, 2968);
assert.equal(proposedWallLengthEndpoint(moved.document.floors[0], moved.document.floors[0].walls[0], 0), null);
const diagonalOpening = mutate(moved.document, { kind: "add_opening", floorId: "apartment", opening: {
  id: "diagonal-window", wallId: "diagonal", kind: "window", operation: "fixed", offsetMm: 501, widthMm: 601,
  heightMm: 500, sillHeightMm: 500, hinge: "none", handing: "none",
} });
const diagonalProjection = canonicalFloorPlanToDesignSnapshot(diagonalOpening.document);
const freeWindow = diagonalProjection.openings.find(({ id }) => id === "diagonal-window")!;
assert(freeWindow, "A freestanding diagonal opening must survive the Consumer projection");
assert.equal(freeWindow.roomId, undefined, "Do not invent a room association for a freestanding wall");
const diagonalHouse = buildHousePlan2D(diagonalProjection.snapshot.rooms, 9.26, 6);
const freeHost = resolveDesignPageOpeningHost(freeWindow, diagonalHouse.rooms);
assert.equal(freeHost.status, "resolved");
if (freeHost.status !== "resolved") throw new Error("Expected exact canonical host");
assert.equal(resolveDesignPageOpeningViewportState(projectDesignPageViewportOpening(freeWindow, Math.hypot(1500, 1500) / 1000), 2600)?.toolbar.wall, "Selected wall");
assert.equal(freeHost.host.physicalWallId, "canonical:apartment:diagonal");
assert(Math.abs(freeHost.host.tangent.x - Math.SQRT1_2) < 1e-8);
assert(Math.abs(freeHost.host.tangent.z - Math.SQRT1_2) < 1e-8);
const noMove = projectLegacyOpeningGestureToCanonicalWallV2({ snapshot: diagonalProjection.snapshot, opening: freeWindow,
  centerOffsetMm: freeWindow.offsetMm, widthMm: 601 });
assert.equal(noMove.offsetMm, 501, "An odd-width diagonal opening must not drift through compatibility coordinates");
const advanced = projectLegacyOpeningGestureToCanonicalWallV2({ snapshot: diagonalProjection.snapshot, opening: freeWindow,
  centerOffsetMm: freeWindow.offsetMm + 100, widthMm: 601 });
assert.equal(advanced.offsetMm, 601);
assert.equal(validateDesignPageOpeningPlacement(freeWindow, [freeWindow], freeWindow.id, {
  rooms: diagonalHouse.rooms, planWidthMeters: 9.26, planDepthMeters: 6,
}).valid, true);
const renderedOpenings = mapPlanOpeningsToRoomRenderer([freeWindow], diagonalHouse.rooms);
const segments = buildOpeningRenderSegments({ openings: renderedOpenings, rooms: diagonalHouse.rooms,
  defaultWidth: 9.26, defaultDepth: 6, minimumHitLength: 0.4, hitDepth: 0.1 });
assert.equal(segments.length, 1);
assert(Math.abs(segments[0].hitRotationRad! - Math.PI / 4) < 1e-8);
const exactOpening = diagonalOpening.scene.floors[0].openings.find(({ id }) => id === freeWindow.id)!;
for (const [index, point] of [exactOpening.start, exactOpening.end].entries()) {
  assert(Math.abs(segments[0].points[index][0] * 1000 - point.xMm) < 0.01);
  assert(Math.abs(segments[0].points[index][2] * 1000 - point.zMm) < 0.01);
}
const diagonalReload = canonicalFloorPlanToDesignSnapshot(JSON.parse(JSON.stringify(diagonalOpening.document)));
assert.deepEqual(diagonalReload.openings, diagonalProjection.openings);
for (const reverse of [false, true]) {
  const variant = structuredClone(diagonalOpening.document);
  const floor = variant.floors[0];
  floor.vertices.find(({ id }) => id === "q")!.zMm = 2900;
  const wall = floor.walls.find(({ id }) => id === "diagonal")!;
  if (reverse) [wall.path.startVertexId, wall.path.endVertexId] = [wall.path.endVertexId, wall.path.startVertexId];
  const projection = canonicalFloorPlanToDesignSnapshot(variant);
  const opening = projection.openings.find(({ id }) => id === "diagonal-window")!;
  for (const delta of [0, 99, -101]) {
    const result = projectLegacyOpeningGestureToCanonicalWallV2({ snapshot: projection.snapshot, opening,
      centerOffsetMm: opening.offsetMm + delta, widthMm: 601 });
    assert.equal(result.offsetMm, 501 + (reverse ? -delta : delta), "Non-cardinal forward/reverse wall gestures preserve integer host offsets");
  }
}
const slopedBoundary = mutate(original, { kind: "move_vertex", floorId: "apartment", vertexId: "c", to: { xMm: 9260, zMm: 700 } });
const slopedProjection = canonicalFloorPlanToDesignSnapshot(slopedBoundary.document);
const slopedWindow = slopedProjection.openings.find(({ id }) => id === "window")!;
const slopedHouse = buildHousePlan2D(slopedProjection.snapshot.rooms, 9.26, 6);
const slopedHost = resolveDesignPageOpeningHost(slopedWindow, slopedHouse.rooms);
assert.equal(slopedHost.status, "resolved");
if (slopedHost.status !== "resolved") throw new Error("Expected diagonal room-boundary host");
assert(slopedHost.host.tangent.x > 0 && slopedHost.host.tangent.z > 0);
assert.equal(projectLegacyOpeningGestureToCanonicalWallV2({ snapshot: slopedProjection.snapshot, opening: slopedWindow,
  centerOffsetMm: slopedWindow.offsetMm + 100, widthMm: slopedWindow.widthMm }).offsetMm, 1100);
assert.throws(() => mutate(partial.document, { kind: "add_wall", floorId: "apartment", wallId: "duplicate", startVertexId: "p", endVertexId: "q", thicknessMm: 100 }), /invalid canonical geometry/);
const attached = mutate(merged.document, {
  kind: "add_wall", floorId: "apartment", wallId: "attached", startVertexId: "t1", endVertexId: "t2", thicknessMm: 100,
  vertices: [{ id: "t1", xMm: 3000, zMm: 0 }, { id: "t2", xMm: 3000, zMm: 6000 }], newRoomId: "office", newRoomName: "Office",
});
assert.equal(attached.document.floors[0].rooms.length, 2);
assert.equal(attached.document.floors[0].walls.length, 9, "Two host splits and the new partition are one valid revision");
assert.equal(attached.wallSplits?.length, 2);
assert.deepEqual(attached.wallSplits?.map(({ sourceWallId }) => sourceWallId).sort(), ["north-west", "south-west"]);
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

const openingGestureBase = { wallStart: { xMm: 6100, zMm: 1200 }, wallEnd: { xMm: 7868, zMm: 2968 }, widthMm: 601, revisionId: "gesture-revision" };
const openingMove = buildOpeningGestureDraft({ ...openingGestureBase, anchor: { mode: "move", grabDeltaMm: 0 }, pointerOffsetMm: 901.5 })!;
assert.equal(openingMove.offsetMm, 601);
assert.equal(openingMove.widthMm, 601);
assert(Math.abs(Math.hypot(openingMove.centerMm.xMm - 6100, openingMove.centerMm.zMm - 1200) - 901.5) < 1e-9, "Odd-width centres must not be rounded in world space");
for (const edge of ["start", "end"] as const) {
  const fixedOffsetMm = edge === "start" ? 1102 : 501;
  const draft = buildOpeningGestureDraft({ ...openingGestureBase, anchor: { mode: "resize", fixedOffsetMm, edge }, pointerOffsetMm: edge === "start" ? 401.2 : 1202.4 })!;
  assert.equal(draft.widthMm, 701);
  assert.equal(edge === "start" ? draft.offsetMm + draft.widthMm : draft.offsetMm, fixedOffsetMm);
}
const openingClamp = buildOpeningGestureDraft({ ...openingGestureBase, anchor: { mode: "move", grabDeltaMm: 0 }, pointerOffsetMm: 99999 })!;
assert(openingClamp.offsetMm + openingClamp.widthMm <= Math.hypot(1768, 1768));
assert.equal(buildOpeningGestureDraft({ ...openingGestureBase, anchor: { mode: "move", grabDeltaMm: 0 }, pointerOffsetMm: NaN }), null);
console.log("PASS: shared wall removal, dependency confirmation, room merge/division, partial diagonal partition, exact move, canonical 3D/reload, immutable reference, invalid envelope/overlap.");
