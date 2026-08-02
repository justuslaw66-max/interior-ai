import assert from "node:assert/strict";

import {
  buildDesignPageSceneRoomItems,
  resolveSceneItemViewContinuity,
} from "@/lib/design-page-scene-domain";
import { projectSceneRoomItem } from "@/lib/design-page-scene-projection";
import { createAllPhase8RepresentativeProjects } from "./phase8-representative-projects";

for (const project of createAllPhase8RepresentativeProjects()) {
  const snapshot = project.snapshot;
  const activeRoom = snapshot.rooms.find((room) => room.id === snapshot.activeRoomId) ?? null;
  const planRooms = snapshot.rooms.map((room) => ({
    id: room.id,
    x: room.planPosition?.x ?? 0,
    z: room.planPosition?.z ?? 0,
  }));
  const entries = buildDesignPageSceneRoomItems({
    activeRoom,
    designSnapshot: snapshot,
    hasWholeHousePlan: true,
    housePlanRooms: planRooms,
    houseRoomById: new Map(planRooms.map((room) => [room.id, room])),
    usesHousePlanScene: true,
  });

  assert.equal(entries.length, project.itemCount, `${project.scale}: every item must render`);
  assert.equal(
    new Set(entries.map((entry) => entry.item.instanceId)).size,
    project.itemCount,
    `${project.scale}: renderer identity must stay unique`
  );

  const selectedId = activeRoom?.items.at(Math.floor((activeRoom.items.length - 1) / 2))?.instanceId;
  let selectedCount = 0;

  for (const entry of entries) {
    const itemBeforeProjection = JSON.stringify(entry.item);
    const dimensions = entry.item.productSnapshot?.dimensionsMm;
    assert.ok(dimensions, `${project.scale}/${entry.item.instanceId}: dimensions are required`);

    const input = {
      visualDimensionsMm: dimensions,
      planningDimensionsMm: dimensions,
      materialPreset: entry.item.materialPreset,
      materialOverrides: entry.item.materialOverrides,
      selected: entry.item.instanceId === selectedId,
    };
    const planState = resolveSceneItemViewContinuity(entry, input);
    const planProjection = projectSceneRoomItem(entry, "plan");
    const spatialState = resolveSceneItemViewContinuity(entry, input);
    const spatialProjection = projectSceneRoomItem(entry, "spatial");

    assert.deepEqual(
      spatialState,
      planState,
      `${project.scale}/${entry.item.instanceId}: 2D and 3D continuity state must match`
    );
    assert.equal(planState.instanceId, entry.item.instanceId);
    assert.equal(planState.productId, entry.item.productId);
    assert.equal(planState.variantId, entry.item.variantId);
    assert.equal(planState.productSnapshot, entry.item.productSnapshot);
    assert.deepEqual(planState.localPosition, entry.item.position);
    assert.equal(planState.rotationY, entry.item.rotationY ?? 0);
    assert.deepEqual(planState.visualDimensionsMm, dimensions);
    assert.deepEqual(planState.planningDimensionsMm, dimensions);
    assert.equal(planState.materialPreset, entry.item.materialPreset);
    assert.deepEqual(planState.materialOverrides, entry.item.materialOverrides);
    assert.equal(planState.visible, true);
    assert.equal(planState.layerId, `room:${entry.roomId}:items`);
    assert.equal(planProjection.rotationY, spatialProjection.rotationY);
    assert.deepEqual(
      [planProjection.position[0], planProjection.position[2]],
      [spatialProjection.position[0], spatialProjection.position[2]],
      `${project.scale}/${entry.item.instanceId}: view projection may only change elevation`
    );
    assert.equal(
      JSON.stringify(entry.item),
      itemBeforeProjection,
      `${project.scale}/${entry.item.instanceId}: projection must not mutate the document item`
    );
    if (planState.selected) selectedCount += 1;
  }

  assert.equal(selectedCount, 1, `${project.scale}: selection must survive the view round-trip`);
}

console.log("design page 2D/3D representative-project continuity passed");
