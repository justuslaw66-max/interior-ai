import assert from "node:assert/strict";
import {
  buildDuplicateTitle,
  buildDuplicatedDesignData,
} from "../lib/design-duplication";

function runFixture(name: string, assertion: () => void) {
  try {
    assertion();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

runFixture("buildDuplicateTitle handles blank and normal titles", () => {
  assert.equal(buildDuplicateTitle("Cozy Loft"), "Cozy Loft (copy)");
  assert.equal(buildDuplicateTitle("   "), "Untitled Living Room (copy)");
});

runFixture("buildDuplicatedDesignData preserves snapshot fields and resets share", () => {
  const source = {
    title: "Client Living Room",
    roomWidth: 5.5,
    roomDepth: 4.3,
    items: [{ instanceId: "i1", productId: "p1" }],
    zones: [{ id: "z1", type: "seating", itemIds: ["i1"] }],
    savedViews: [{ id: "v1", name: "Top", cameraPosition: [0, 5, 0], cameraTarget: [0, 0, 0] }],
    style: "modern",
    budget: "mid",
    mode: "designer",
    notes: "Keep walkway clear",
  };

  const data = buildDuplicatedDesignData(source, "user_123");
  assert.equal(data.user.connect.id, "user_123");
  assert.equal(data.title, "Client Living Room (copy)");
  assert.equal(data.roomWidth, 5.5);
  assert.equal(data.roomDepth, 4.3);
  assert.deepEqual(data.items, source.items);
  assert.deepEqual(data.zones, source.zones);
  assert.deepEqual(data.savedViews, source.savedViews);
  assert.equal(data.style, "modern");
  assert.equal(data.budget, "mid");
  assert.equal(data.mode, "designer");
  assert.equal(data.notes, "Keep walkway clear");
  assert.equal(data.shareEnabled, false);
  assert.equal(data.shareToken, null);

  (source.items as Array<{ productId: string }>)[0].productId = "changed";
  assert.equal((data.items as Array<{ productId: string }>)[0].productId, "p1");
});

console.log("All design duplication fixtures passed.");
