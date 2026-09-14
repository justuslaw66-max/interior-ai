import assert from "node:assert/strict";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyConfirmedConsumerWallEditV2, type ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";
import type { DesignSnapshot } from "@/lib/room-types";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { changedOpeningFormFields, proposedOpeningForm } from "@/lib/floor-plan-opening-form";
import { applyFloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import { restoreLayoutVersion } from "@/lib/layout-versions";
import { commitCurrentWallGesture } from "@/lib/floor-plan-wall-gesture";
import { proposedWallEditFailureMessage } from "@/lib/floor-plan-wall-edit-feedback";
import { FloorPlanTopologyMutationErrorV2 } from "@/lib/floor-plan-topology-mutation-types";
import { recoverProposedRoomLayout } from "@/lib/floor-plan-room-recovery";

const document = authoredApartment();
const original = canonicalFloorPlanToDesignSnapshot(document).snapshot;
const livingRoom = original.rooms.find(({ id }) => id === "living")!;
const bedroomRoom = original.rooms.find(({ id }) => id === "bedroom")!;
livingRoom.items.push({ instanceId: "sofa", productId: "authored-sofa", variantId: "default", position: [-0.5, 0, 0.5] });
bedroomRoom.items.push({ instanceId: "desk", productId: "authored-desk", variantId: "default", position: [0, 0, -0.5] });
bedroomRoom.surfaces = { floor: { paintColorHex: "#eeeedd" } };
livingRoom.surfaces = { walls: { faces: { "north-west": { paintColorHex: "#123456" }, "south-west": { paintColorHex: "#abcdef" } } } };
livingRoom.zones = [{ id: "seating", type: "seating", itemIds: ["sofa"], anchor: [-0.5, 0, 0.5] }];
livingRoom.layoutVersions = [{ id: "layout-one", name: "Original layout", source: "manual", timestamp: 1,
  items: structuredClone(livingRoom.items), zones: structuredClone(livingRoom.zones), summary: { itemCount: 1, zoneCount: 1 } }];
bedroomRoom.layoutVersions = [{ id: "bedroom-layout", name: "Desk layout", source: "manual", timestamp: 1,
  items: structuredClone(bedroomRoom.items), zones: [], summary: { itemCount: 1, zoneCount: 0 } }];
let count = 0;
function edit(snapshot: DesignSnapshot, operation: ConsumerWallTopologyMutationV2) {
  count += 1;
  return applyConfirmedConsumerWallEditV2({ snapshot, operation, sourceEditConfirmed: true, context: { mutationId: `consumer-${count}`, nextRevisionId: `local-${count}`, actorId: "consumer", mutatedAt: "2026-09-14T00:00:00Z" } }).snapshot;
}
function world(snapshot: DesignSnapshot) {
  return snapshot.rooms.flatMap((room) => room.items.map((item) => ({ id: item.instanceId, x: item.position[0] + (room.planPosition?.x ?? 0), y: item.position[1], z: item.position[2] + (room.planPosition?.z ?? 0) }))).sort((a, b) => a.id.localeCompare(b.id));
}
const frozen = JSON.stringify(original);
const merged = edit(original, { kind: "remove_wall", floorId: "apartment", wallId: "shared", confirmedOpeningIds: ["door"], keepRoomId: "living" });
assert.equal(merged.rooms.length, 1);
assert.deepEqual(world(merged), world(original));
assert.equal(merged.floorPlan?.proposal?.roomRecovery[0].name, "Bedroom");
assert.deepEqual(merged.floorPlan?.proposal?.originalDocument, document);
assert.equal(JSON.stringify(original), frozen);
const joinFree = edit(merged, { kind: "add_wall", floorId: "apartment", wallId: "join-wall", startVertexId: "join-start", endVertexId: "join-end", thicknessMm: 100,
  vertices: [{ id: "join-start", xMm: 6000, zMm: 1000 }, { id: "join-end", xMm: 7500, zMm: 2500 }] });
const joinAttached = edit(joinFree, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "join-wall", endpoint: "start", to: { xMm: 4000, zMm: 0 } });
const joinDivided = edit(joinAttached, { kind: "join_wall_endpoint", floorId: "apartment", wallId: "join-wall", endpoint: "end", to: { xMm: 9260, zMm: 6000 }, newRoomId: "join-child", newRoomName: "Joined room" });
assert.equal(joinDivided.rooms.length, 2);
assert.deepEqual(world(joinDivided), world(original), "Joining a partition preserves furniture in world space");
assert.deepEqual(world(storedToSnapshot(JSON.parse(JSON.stringify(snapshotToStored(joinDivided))))), world(original));
assert.deepEqual(joinDivided.floorPlan?.proposal?.originalDocument, document);
function encloseConsumerRoom(snapshot: DesignSnapshot, prefix: string, points: number[][]) {
  let current = snapshot;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const vertices = (index === 0 ? [0, 1] : index < points.length - 1 ? [next] : []).map((point) => ({ id: `${prefix}-v${point}`, xMm: points[point][0], zMm: points[point][1] }));
    current = edit(current, { kind: "add_wall", floorId: "apartment", wallId: `${prefix}-w${index}`, startVertexId: `${prefix}-v${index}`, endVertexId: `${prefix}-v${next}`,
      vertices, thicknessMm: 100, newRoomId: prefix, newRoomName: prefix });
  }
  return current;
}
const enclosedConsumer = encloseConsumerRoom(merged, "enclosed", [[1000, 1000], [3000, 1000], [3000, 4500], [1000, 4500]]);
assert.equal(enclosedConsumer.rooms.find(({ id }) => id === "enclosed")!.items[0].instanceId, "sofa");
assert.equal(enclosedConsumer.rooms.find(({ id }) => id === "living")!.items[0].instanceId, "desk");
assert.deepEqual(world(enclosedConsumer), world(original));
const nestedConsumer = encloseConsumerRoom(enclosedConsumer, "surrounding", [[500, 500], [3500, 500], [3500, 5000], [500, 5000]]);
assert.deepEqual(nestedConsumer.rooms.find(({ id }) => id === "surrounding")!.surfaces, livingRoom.surfaces,
  "Room split lineage preserves finishes even when the new room centre falls in an existing hole");
assert.deepEqual(world(storedToSnapshot(JSON.parse(JSON.stringify(snapshotToStored(nestedConsumer))))), world(original));
const reopenedConsumer = edit(nestedConsumer, { kind: "remove_wall", floorId: "apartment", wallId: "enclosed-w0", confirmedOpeningIds: [], keepRoomId: "surrounding" });
assert.deepEqual(world(reopenedConsumer), world(original));
assert.deepEqual(reopenedConsumer.floorPlan?.proposal?.originalDocument, document);
assert(reopenedConsumer.floorPlan?.proposal?.roomRecovery.some(({ id }) => id === "enclosed"));
const issue = { code: "OPENING_OUT_OF_BOUNDS", path: "floors[0].openings[0]", message: "Opening extends beyond its host wall.", severity: "error" as const };
assert.equal(proposedWallEditFailureMessage(new FloorPlanTopologyMutationErrorV2("MUTATION_VALIDATION_FAILED", "Generic", [issue, issue])), issue.message);
assert.equal(proposedWallEditFailureMessage(new Error("Choose a room")), "Choose a room");
assert.equal(proposedWallEditFailureMessage(null), "The geometry is not valid.");
const restoredLayout = restoreLayoutVersion(merged.rooms[0], merged.rooms[0].layoutVersions![0]);
assert.deepEqual(world({ ...merged, rooms: [restoredLayout] }), world({ ...original, rooms: [livingRoom] }), "Saved-layout restoration preserves world position after room-origin changes");
assert.equal(restoredLayout.zones[0].anchor![0] + restoredLayout.planPosition!.x, 1.5);
const recoverInput = { sourceRoomId: "bedroom", targetRoomId: "living", layoutId: "bedroom-layout" };
const beforeRecovery = JSON.stringify(merged);
const recovered = recoverProposedRoomLayout(merged, recoverInput);
assert.deepEqual(world(recovered), world(merged), "Recovery must not replace currently placed furniture");
assert.equal(JSON.stringify(merged), beforeRecovery, "The saved archive and incoming snapshot remain immutable");
assert.equal(recovered.floorPlan?.canonicalDocument, merged.floorPlan?.canonicalDocument);
const recoveredRoom = recovered.rooms.find(({ id }) => id === "living")!;
const recoveredLayout = recoveredRoom.layoutVersions!.find(({ id }) => id === "recovered:bedroom:bedroom-layout")!;
assert.deepEqual(world({ ...recovered, rooms: [restoreLayoutVersion(recoveredRoom, recoveredLayout)] }), world({ ...original, rooms: [bedroomRoom] }));
assert.throws(() => recoverProposedRoomLayout(recovered, recoverInput), /already recovered/);
assert.deepEqual(storedToSnapshot(JSON.parse(JSON.stringify(snapshotToStored(recovered)))).rooms[0].layoutVersions, JSON.parse(JSON.stringify(recovered.rooms[0].layoutVersions)));
const fullRoom = structuredClone(merged);
fullRoom.rooms[0].layoutVersions = Array.from({ length: 8 }, (_, index) => ({ ...recoveredLayout, id: `existing-${index}` }));
assert.throws(() => recoverProposedRoomLayout(fullRoom, recoverInput), /already has 8 saved layouts/);
const differentFloor = structuredClone(merged);
differentFloor.rooms[0].floorLevel = 2;
assert.throws(() => recoverProposedRoomLayout(differentFloor, recoverInput), /original floor/);
const split = edit(merged, { kind: "add_wall", floorId: "apartment", wallId: "new-partition", startVertexId: "b", endVertexId: "e", thicknessMm: 123, newRoomId: "new-room", newRoomName: "Study" });
assert.equal(split.rooms.length, 2);
assert.deepEqual(world(split), world(original));
const surviving = split.rooms.find(({ id }) => id === "living")!;
const restoredAfterSplit = restoreLayoutVersion(surviving, surviving.layoutVersions![0]);
assert.deepEqual(world({ ...split, rooms: [restoredAfterSplit] }), world({ ...original, rooms: [livingRoom] }));
const attached = edit(merged, { kind: "add_wall", floorId: "apartment", wallId: "attached-partition", startVertexId: "attach-start", endVertexId: "attach-end", thicknessMm: 100,
  vertices: [{ id: "attach-start", xMm: 3000, zMm: 0 }, { id: "attach-end", xMm: 3000, zMm: 6000 }], newRoomId: "attached-room", newRoomName: "Office" });
const attachedFloor = attached.floorPlan!.canonicalDocument!.floors[0];
const northTail = attachedFloor.walls.find((wall) => wall.path.startVertexId === "attach-start" && wall.path.endVertexId === "b")!;
assert(northTail, "Expected automatic host split");
for (const roomId of northTail.adjacentRoomIds) {
  const room = attached.rooms.find(({ id }) => id === roomId)!;
  assert.equal(room.surfaces?.walls?.faces?.[northTail.id]?.paintColorHex, "#123456", "Automatic attachment splits inherit the source wall finish on the correct room side");
}
const explicit = edit(original, { kind: "split_wall", floorId: "apartment", wallId: "north-west", offsetMm: 2000, newVertexId: "finish-vertex", newWallId: "finish-wall" });
assert.equal(explicit.rooms.find(({ id }) => id === "living")?.surfaces?.walls?.faces?.["finish-wall"].paintColorHex, "#123456");
assert.equal(split.floorPlan?.canonicalDocument?.parentRevisionId, original.floorPlan?.revisionId);
const reloaded = storedToSnapshot(JSON.parse(JSON.stringify(snapshotToStored(split))));
assert.deepEqual(world(reloaded), world(original));
assert.deepEqual(reloaded.floorPlan, JSON.parse(JSON.stringify(split.floorPlan)));
assert.equal(split.floorPlan?.canonicalDocument?.floors[0].walls.find(({ id }) => id === "new-partition")?.thicknessMm, 123);
const protectedDocument = authoredApartment();
const window = protectedDocument.floors[0].openings.find(({ id }) => id === "window")!;
window.widthEvidence = "source_documented";
window.heightMm = 1200;
window.heightEvidence = "source_documented";
const protectedSnapshot = canonicalFloorPlanToDesignSnapshot(protectedDocument).snapshot;
const widthEdit = { kind: "update_opening", floorId: "apartment", openingId: "window", changes: { widthMm: 1700 } } as const;
assert.throws(() => applyFloorPlanTopologyMutationV2(protectedDocument, widthEdit, { mutationId: "direct", nextRevisionId: "direct-rev", actorId: "test", mutatedAt: "2026-09-14T00:00:00Z" }), /protected|reviewed/i);
const proposedWindow = edit(protectedSnapshot, widthEdit);
assert.equal(proposedWindow.floorPlan?.canonicalDocument?.floors[0].openings.find(({ id }) => id === "window")?.widthMm, 1700);
assert.equal(proposedWindow.floorPlan?.canonicalDocument?.floors[0].openings.find(({ id }) => id === "window")?.heightEvidence, "source_documented");
assert.equal(proposedWindow.floorPlan?.proposal?.originalDocument.floors[0].openings.find(({ id }) => id === "window")?.widthMm, 1800);
const sourceWindow = document.floors[0].openings.find(({ id }) => id === "window")!;
const windowForm = proposedOpeningForm(document.floors[0], sourceWindow);
assert.equal(windowForm.sillHeightMm, document.floors[0].defaults.windowSillHeight.valueMm);
assert.deepEqual(changedOpeningFormFields(document.floors[0], sourceWindow, { ...windowForm, offsetMm: 1100 }), { offsetMm: 1100 });

const staleGesture = { kind: "move_wall", floorId: "apartment", wallId: "shared", deltaXMm: 10, deltaZMm: 0 } as const;
const gestureCommits: ConsumerWallTopologyMutationV2[] = [], gestureMessages: string[] = [];
const recordCommit = (operation: ConsumerWallTopologyMutationV2) => { gestureCommits.push(operation); return true; };
assert.equal(commitCurrentWallGesture(merged, original.floorPlan!.canonicalDocument!.revisionId, staleGesture, recordCommit, (message) => gestureMessages.push(message)), false);
assert.equal(gestureCommits.length, 0, "A stale gesture must not reach the canonical mutation/history owner");
assert.match(gestureMessages[0], /plan changed/);
assert.equal(commitCurrentWallGesture(merged, merged.floorPlan!.canonicalDocument!.revisionId, staleGesture, recordCommit, () => undefined), true);
assert.deepEqual(gestureCommits, [staleGesture]);
console.log("PASS: consumer private proposal merge/split, reference immutability, exact world positions, room recovery, integer dimensions and saved reload.");
