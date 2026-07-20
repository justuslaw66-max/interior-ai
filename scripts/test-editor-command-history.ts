import assert from "node:assert/strict";

import {
  applyDesignItemTransformPatches,
  applyMoveItemsBetweenRoomsCommand,
  applyReplaceRoomItemsCommand,
  SCENE_ITEM_DRAG_COMMAND_ID,
} from "@/lib/design-page-item-commands";
import {
  DEFAULT_HISTORY_MAX_ENTRIES,
  HistoryManager,
} from "@/lib/historyManager";
import {
  createRoom,
  type DesignItem,
  type DesignSnapshot,
} from "@/lib/room-types";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { projectSharedDesignSnapshot } from "@/lib/shared-design-snapshot";

type CounterState = { value: number; label: string };

function createCounterHistory(maxEntries = DEFAULT_HISTORY_MAX_ENTRIES) {
  let state: CounterState = { value: 0, label: "initial" };
  let changeCount = 0;
  const history = new HistoryManager(
    () => state,
    (next) => {
      state = next;
    },
    () => {
      changeCount += 1;
    },
    { maxEntries }
  );
  return {
    history,
    getState: () => state,
    setState: (next: CounterState) => {
      state = next;
    },
    getChangeCount: () => changeCount,
  };
}

function testDiscreteCommandsAndRollback() {
  const workspace = createCounterHistory();
  const input = { delta: 4, label: "moved" };
  workspace.history.executeCommand({
    id: "increment-counter",
    description: "Increment counter",
    input,
    execute: (commandInput) => {
      commandInput.delta = 5;
      workspace.setState({
        value: workspace.getState().value + commandInput.delta,
        label: commandInput.label,
      });
    },
  });

  assert.deepEqual(input, { delta: 4, label: "moved" });
  assert.deepEqual(workspace.getState(), { value: 5, label: "moved" });
  assert.equal(workspace.history.getUndoName(), "Increment counter");
  assert.equal(workspace.history.undo(), "Increment counter");
  assert.deepEqual(workspace.getState(), { value: 0, label: "initial" });
  assert.equal(workspace.history.redo(), "Increment counter");
  assert.deepEqual(workspace.getState(), { value: 5, label: "moved" });

  const beforeFailure = structuredClone(workspace.getState());
  assert.throws(
    () =>
      workspace.history.executeCommand({
        id: "failing-command",
        description: "Fail atomically",
        input: { partialValue: 900 },
        execute: ({ partialValue }) => {
          workspace.setState({ value: partialValue, label: "partial" });
          throw new Error("expected command failure");
        },
      }),
    /expected command failure/
  );
  assert.deepEqual(workspace.getState(), beforeFailure);
  assert.equal(workspace.history.getStatus().activeCommand, null);
  assert.equal(workspace.history.getUndoName(), "Increment counter");
}

function testContinuousCommands() {
  const workspace = createCounterHistory();
  workspace.history.beginContinuousCommand({
    id: SCENE_ITEM_DRAG_COMMAND_ID,
    description: "Move item",
  });
  for (let position = 1; position <= 80; position += 1) {
    workspace.history.updateContinuousCommand({
      id: SCENE_ITEM_DRAG_COMMAND_ID,
      description: "Move item",
      input: { position },
      execute: ({ position: nextPosition }) =>
        workspace.setState({ value: nextPosition, label: "drag" }),
    });
  }
  workspace.history.commitContinuousCommand(SCENE_ITEM_DRAG_COMMAND_ID);

  assert.equal(workspace.history.getStatus().pastCount, 1);
  assert.equal(workspace.getState().value, 80);
  workspace.history.undo();
  assert.deepEqual(workspace.getState(), { value: 0, label: "initial" });
  workspace.history.redo();
  assert.deepEqual(workspace.getState(), { value: 80, label: "drag" });

  workspace.history.beginContinuousCommand({
    id: SCENE_ITEM_DRAG_COMMAND_ID,
    description: "Move item",
  });
  assert.throws(
    () =>
      workspace.history.updateContinuousCommand({
        id: SCENE_ITEM_DRAG_COMMAND_ID,
        description: "Move item",
        input: { position: 999 },
        execute: ({ position }) => {
          workspace.setState({ value: position, label: "partial-drag" });
          throw new Error("drag update failed");
        },
      }),
    /drag update failed/
  );
  assert.deepEqual(workspace.getState(), { value: 80, label: "drag" });
  assert.equal(workspace.history.getStatus().activeCommand, null);
}

function testLongMixedSequenceAndMemoryBound() {
  const workspace = createCounterHistory(100);
  for (let index = 1; index <= 240; index += 1) {
    workspace.history.executeCommand({
      id: index % 2 === 0 ? "move-object" : "change-material",
      description: index % 2 === 0 ? "Move object" : "Change material",
      input: { value: index, label: index % 2 === 0 ? "move" : "material" },
      execute: (next) => workspace.setState(next),
    });
  }
  assert.equal(workspace.history.getStatus().pastCount, 100);
  assert.equal(workspace.history.getStatus().maxEntries, 100);

  for (let index = 0; index < 100; index += 1) {
    assert.notEqual(workspace.history.undo(), null);
  }
  assert.equal(workspace.history.undo(), null);
  assert.equal(workspace.getState().value, 140);

  for (let index = 0; index < 60; index += 1) {
    assert.notEqual(workspace.history.redo(), null);
  }
  assert.equal(workspace.getState().value, 200);
  assert.equal(workspace.history.getStatus().futureCount, 40);

  workspace.history.executeCommand({
    id: "branch-after-undo",
    description: "Branch after undo",
    input: { value: 777, label: "branch" },
    execute: (next) => workspace.setState(next),
  });
  assert.equal(workspace.history.getStatus().futureCount, 0);
  assert.equal(workspace.history.canRedo(), false);
}

function makeItem(instanceId: string, x = 0): DesignItem {
  return {
    instanceId,
    productId: "test-product",
    variantId: "default",
    position: [x, 0, 0],
  };
}

function makeSnapshot(): DesignSnapshot {
  const source = createRoom("source", "Source");
  const target = createRoom("target", "Target");
  source.items = [makeItem("a"), makeItem("b", 1)];
  source.zones = [
    { id: "zone", type: "seating", itemIds: ["a", "b"] },
  ];
  return { version: 3, rooms: [source, target], activeRoomId: source.id };
}

function testPureItemCommandReducers() {
  const original = makeSnapshot();
  const replaced = applyReplaceRoomItemsCommand(original, {
    roomId: "source",
    items: [makeItem("c", 3)],
  });
  assert.deepEqual(original.rooms[0].items.map((item) => item.instanceId), ["a", "b"]);
  assert.deepEqual(replaced.rooms[0].items.map((item) => item.instanceId), ["c"]);

  const moved = applyMoveItemsBetweenRoomsCommand(original, {
    sourceRoomId: "source",
    targetRoomId: "target",
    movedItems: [{ ...original.rooms[0].items[0], position: [2, 0, 2] }],
    activateTargetRoom: true,
  });
  assert.equal(moved.activeRoomId, "target");
  assert.deepEqual(moved.rooms[0].items.map((item) => item.instanceId), ["b"]);
  assert.deepEqual(moved.rooms[0].zones[0].itemIds, ["b"]);
  assert.deepEqual(moved.rooms[1].items.map((item) => item.instanceId), ["a"]);
  assert.deepEqual(original.rooms[0].zones[0].itemIds, ["a", "b"]);

  const transformed = applyDesignItemTransformPatches(original.rooms[0].items, [
    { instanceId: "a", changes: { position: [4, 0, 5], rotationY: 1.5 } },
    { instanceId: "b", changes: { position: [6, 0, 7] } },
  ]);
  assert.deepEqual(transformed[0].position, [4, 0, 5]);
  assert.equal(transformed[0].rotationY, 1.5);
  assert.deepEqual(transformed[1].position, [6, 0, 7]);
  assert.throws(
    () =>
      applyDesignItemTransformPatches(original.rooms[0].items, [
        { instanceId: "missing", changes: { position: [0, 0, 0] } },
      ]),
    /missing item/
  );
  assert.throws(
    () =>
      applyMoveItemsBetweenRoomsCommand(original, {
        sourceRoomId: "source",
        targetRoomId: "target",
        movedItems: [makeItem("missing")],
      }),
    /does not contain/
  );
}

function testPlanAnnotationPersistence() {
  const snapshot: DesignSnapshot = {
    ...makeSnapshot(),
    floorPlan: {
      annotations: [
        {
          id: "note-1",
          xMm: 1250,
          zMm: 900,
          text: "Keep access clear",
          kind: "callout",
          anchorXMm: 1600,
          anchorZMm: 900,
        },
      ],
    },
  };
  const restored = storedToSnapshot(
    JSON.parse(JSON.stringify(snapshotToStored(snapshot)))
  );
  assert.deepEqual(restored.floorPlan?.annotations, snapshot.floorPlan?.annotations);
  assert.deepEqual(
    projectSharedDesignSnapshot(snapshot).floorPlan?.annotations,
    snapshot.floorPlan?.annotations
  );
}

testDiscreteCommandsAndRollback();
testContinuousCommands();
testLongMixedSequenceAndMemoryBound();
testPureItemCommandReducers();
testPlanAnnotationPersistence();

console.log("editor command and history tests passed");
