import assert from "node:assert/strict";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyConfirmedConsumerWallEditV2, type ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";
import type { DesignSnapshot } from "@/lib/room-types";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { changedOpeningFormFields, proposedOpeningForm } from "@/lib/floor-plan-opening-form";
import { applyFloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import { restoreLayoutVersion } from "@/lib/layout-versions";
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
console.log("PASS: consumer private proposal merge/split, reference immutability, exact world positions, room recovery, integer dimensions and saved reload.");
