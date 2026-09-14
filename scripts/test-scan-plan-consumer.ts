import assert from "node:assert/strict";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyConfirmedConsumerWallEditV2, type ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";
import type { DesignSnapshot } from "@/lib/room-types";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { changedOpeningFormFields, proposedOpeningForm } from "@/lib/floor-plan-opening-form";
import { applyFloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";

const document = authoredApartment();
const original = canonicalFloorPlanToDesignSnapshot(document).snapshot;
original.rooms[0].items.push({ instanceId: "sofa", productId: "authored-sofa", variantId: "default", position: [-0.5, 0, 0.5] });
original.rooms[1].items.push({ instanceId: "desk", productId: "authored-desk", variantId: "default", position: [0, 0, -0.5] });
original.rooms[1].surfaces = { floor: { paintColorHex: "#eeeedd" } };
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
const split = edit(merged, { kind: "add_wall", floorId: "apartment", wallId: "new-partition", startVertexId: "b", endVertexId: "e", thicknessMm: 123, newRoomId: "new-room", newRoomName: "Study" });
assert.equal(split.rooms.length, 2);
assert.deepEqual(world(split), world(original));
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
