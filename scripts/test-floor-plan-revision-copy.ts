import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { catalogV1ToFloorPlanDocumentV2Fixtures } from "@/lib/floor-plan-catalog-v1-adapter";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import {
  buildUpdatedFloorPlanDesignCopy,
  compareFloorPlanRevisions,
  findLatestFloorPlanRevisionUpdate,
  floorPlanBindingCoversSavedUnit,
  isSameFloorPlanAddressBinding,
  type FloorPlanRevisionUpdateCandidate,
} from "@/lib/floor-plan-revision-updates";
import {
  createRoom,
  type PersistedFloorPlanAddressBinding,
} from "@/lib/room-types";

const binding: PersistedFloorPlanAddressBinding = {
  bindingId: "binding-current",
  countryCode: "SG",
  addressNormalized: "810A CHAI CHEE STREET",
  block: "810A",
  street: "Chai Chee Street",
  postalCode: "461810",
  stack: "509",
  floorMin: 2,
  floorMax: 15,
  transform: "normal",
  unitFloor: 12,
  unitStack: "509",
};

const candidate = (
  id: string,
  publishedAt: string,
  addressBinding: PersistedFloorPlanAddressBinding = {
    ...binding,
    bindingId: `binding-${id}`,
  }
): FloorPlanRevisionUpdateCandidate => ({
  id,
  geometryHash: id.padEnd(64, "0").slice(0, 64),
  verificationTier: "source_verified",
  createdAt: publishedAt,
  publishedAt,
  addressBindings: [addressBinding],
});

assert.equal(
  findLatestFloorPlanRevisionUpdate({
    currentRevisionId: "revision-current",
    currentPublishedAt: "2026-07-01T00:00:00.000Z",
    addressBinding: binding,
    candidates: [],
  }),
  null,
  "No published candidate must produce no update."
);

assert.equal(
  findLatestFloorPlanRevisionUpdate({
    currentRevisionId: "revision-current",
    currentPublishedAt: "2026-07-01T00:00:00.000Z",
    addressBinding: binding,
    candidates: [candidate("revision-current", "2026-07-10T00:00:00.000Z")],
  }),
  null,
  "The current revision must never be offered as its own update."
);

assert.equal(
  findLatestFloorPlanRevisionUpdate({
    currentRevisionId: "revision-current",
    currentPublishedAt: "2026-07-10T00:00:00.000Z",
    addressBinding: binding,
    candidates: [candidate("revision-older", "2026-07-05T00:00:00.000Z")],
  }),
  null,
  "An older matching revision must not be presented as an update."
);

for (const mismatch of [
  { addressNormalized: "811A CHAI CHEE STREET" },
  { stack: "527" },
  { transform: "mirror_x" as const },
  { postalCode: "461811" },
] as const) {
  const wrongBinding = {
    ...binding,
    ...mismatch,
    bindingId: `mismatch-${Object.keys(mismatch)[0]}`,
  };
  assert.equal(isSameFloorPlanAddressBinding(binding, wrongBinding), false);
  assert.equal(
    findLatestFloorPlanRevisionUpdate({
      currentRevisionId: "revision-current",
      currentPublishedAt: "2026-07-01T00:00:00.000Z",
      addressBinding: binding,
      candidates: [candidate("revision-wrong", "2026-07-10T00:00:00.000Z", wrongBinding)],
    }),
    null,
    `A mismatched ${Object.keys(mismatch)[0]} must not be suggested.`
  );
}

const splitLow = {
  ...binding,
  bindingId: "split-low",
  floorMin: 2,
  floorMax: 8,
  unitFloor: undefined,
  unitStack: undefined,
};
const splitHigh = {
  ...binding,
  bindingId: "split-high",
  floorMin: 9,
  floorMax: 15,
  unitFloor: undefined,
  unitStack: undefined,
};
assert.equal(floorPlanBindingCoversSavedUnit(binding, splitLow), false);
assert.equal(floorPlanBindingCoversSavedUnit(binding, splitHigh), true);
assert.equal(
  findLatestFloorPlanRevisionUpdate({
    currentRevisionId: "revision-current",
    currentPublishedAt: "2026-07-01T00:00:00.000Z",
    addressBinding: binding,
    candidates: [candidate("revision-split", "2026-07-08T00:00:00.000Z", splitHigh)],
  })?.addressBinding.bindingId,
  "split-high",
  "The exact searched unit floor must select its containing split replacement range."
);
const legacyBinding = { ...binding, unitFloor: undefined, unitStack: undefined };
assert.equal(
  floorPlanBindingCoversSavedUnit(legacyBinding, splitHigh),
  false,
  "A legacy snapshot without exact unit context must not guess between split ranges."
);

const latest = findLatestFloorPlanRevisionUpdate({
  currentRevisionId: "revision-current",
  currentPublishedAt: "2026-07-01T00:00:00.000Z",
  addressBinding: binding,
  candidates: [
    candidate("revision-older", "2026-07-05T00:00:00.000Z"),
    candidate("revision-latest", "2026-07-12T00:00:00.000Z"),
  ],
});
assert.equal(latest?.revision.id, "revision-latest");
assert.equal(latest?.addressBinding.bindingId, "binding-revision-latest");

const catalog = getAllFloorPlanLibraryCatalogs().find(
  (entry) => entry.floor_plan.plan_id === "sg-hdb-ping-yi-court"
);
assert.ok(catalog);
const fixture = catalogV1ToFloorPlanDocumentV2Fixtures(catalog)[0];
assert.ok(fixture);
const currentDocument = structuredClone(fixture.document);
currentDocument.revisionId = "revision-current";
const nextDocument = structuredClone(fixture.document);
nextDocument.revisionId = "revision-latest";

const changedDocument = structuredClone(nextDocument);
changedDocument.floors[0].rooms[0].name = `${changedDocument.floors[0].rooms[0].name} corrected`;
changedDocument.floors[0].walls[0].thicknessMm += 10;
if (changedDocument.floors[0].openings[0]) {
  changedDocument.floors[0].openings[0].operation =
    changedDocument.floors[0].openings[0].operation === "folding" ? "sliding" : "folding";
}
const diff = compareFloorPlanRevisions(currentDocument, changedDocument);
assert.equal(diff.geometryChanged, true);
assert.equal(diff.rooms.changed, 1);
assert.equal(diff.walls.changed, 1);
assert.equal(diff.openings.changed, changedDocument.floors[0].openings[0] ? 1 : 0);
assert.match(diff.summary, /room/);
assert.match(diff.summary, /wall/);

const canonical = canonicalFloorPlanToDesignSnapshot(currentDocument, {
  addressBinding: binding,
  addressTransform: binding.transform,
  sourceRevisionGeometryHash: "current-geometry-hash",
});
assert.deepEqual(canonical.snapshot.floorPlan?.addressBinding, binding);
assert.equal(
  canonical.snapshot.floorPlan?.sourceRevisionGeometryHash,
  "current-geometry-hash"
);

const stableRoom = canonical.snapshot.rooms[0];
stableRoom.items = [{
  instanceId: "stable-sofa",
  productId: "sofa",
  variantId: "sofa-default",
  position: [0.4, 0, -0.2],
}];
stableRoom.surfaceFinishes = {
  floor: { materialId: "timber-oak" },
};
stableRoom.savedViews = [{
  id: "stable-view",
  name: "Living view",
  cameraPosition: [3, 2, 4],
  cameraTarget: [0, 1, 0],
}];
const ambiguousSnapshot = structuredClone(canonical.snapshot);
ambiguousSnapshot.rooms.push({
  ...structuredClone(stableRoom),
  name: "Duplicate legacy room ID",
  items: [{
    instanceId: "duplicate-id-item",
    productId: "chair",
    variantId: "chair-default",
    position: [0, 0, 0],
  }],
});
const ambiguousCopy = buildUpdatedFloorPlanDesignCopy({
  currentSnapshot: ambiguousSnapshot,
  nextDocument,
  nextGeometryHash: "next-geometry-hash",
  addressBinding: { ...binding, bindingId: "binding-next" },
  title: "Ambiguous copy",
});
assert.equal(
  ambiguousCopy.snapshot.rooms.find((room) => room.id === stableRoom.id)?.items.length,
  0,
  "A duplicated source room ID is ambiguous and must not carry furniture into the copy."
);
assert.ok(ambiguousCopy.preservation.skippedItemCount >= 2);

const unmatchedRoom = createRoom("legacy-room-without-canonical-match", "Old room");
unmatchedRoom.items = [{
  instanceId: "ambiguous-chair",
  productId: "chair",
  variantId: "chair-default",
  position: [0, 0, 0],
}];
canonical.snapshot.rooms.push(unmatchedRoom);

const updated = buildUpdatedFloorPlanDesignCopy({
  currentSnapshot: canonical.snapshot,
  nextDocument,
  nextGeometryHash: "next-geometry-hash",
  addressBinding: { ...binding, bindingId: "binding-next" },
  title: "Home (updated floor plan)",
});
const updatedStableRoom = updated.snapshot.rooms.find((room) => room.id === stableRoom.id);
assert.ok(updatedStableRoom);
assert.deepEqual(updatedStableRoom.items, stableRoom.items);
assert.deepEqual(updatedStableRoom.surfaceFinishes, stableRoom.surfaceFinishes);
assert.deepEqual(updatedStableRoom.savedViews, stableRoom.savedViews);
assert.equal(
  updated.snapshot.rooms.some((room) => room.id === unmatchedRoom.id),
  false,
  "A room without a stable canonical ID must not be guessed into the updated copy."
);
assert.equal(updated.preservation.unmappedRoomCount, 1);
assert.equal(updated.preservation.skippedItemCount, 1);
assert.equal(updated.preservation.preservedItemCount, 1);
assert.equal(updated.snapshot.floorPlan?.revisionId, "revision-latest");
assert.equal(updated.snapshot.floorPlan?.addressBinding?.bindingId, "binding-next");
assert.equal(updated.snapshot.floorPlan?.sourceRevisionGeometryHash, "next-geometry-hash");
canonical.snapshot.floorPlan!.orientationConfirmed = true;
const reoriented = buildUpdatedFloorPlanDesignCopy({
  currentSnapshot: canonical.snapshot,
  nextDocument,
  nextGeometryHash: "next-geometry-hash",
  addressBinding: { ...binding, bindingId: "reoriented", transform: "mirror_x" },
  title: "Reoriented copy",
});
assert.equal(
  reoriented.snapshot.floorPlan?.orientationConfirmed,
  false,
  "A supersede that changes the address transform must ask for orientation confirmation again."
);

const root = process.cwd();
const routeSource = fs.readFileSync(
  path.join(root, "app/api/designs/[id]/floor-plan-update/route.ts"),
  "utf8"
);
const workspaceSource = fs.readFileSync(
  path.join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const lifecycleSource = fs.readFileSync(
  path.join(root, "lib/useDesignPageFloorPlanLifecycleRegistration.ts"),
  "utf8"
);
const promptSource = fs.readFileSync(
  path.join(root, "components/editor/design-page/DesignValidationFeedback.tsx"),
  "utf8"
);
assert.doesNotMatch(
  routeSource,
  /prisma\.design\.update\(/,
  "The revision-copy endpoint must never mutate the source design."
);
assert.match(routeSource, /tx\.design\.create\(/);
assert.match(routeSource, /replacementRevisionId/);
assert.match(routeSource, /supersedesRevisionId/);
assert.match(routeSource, /hashCanonicalJson\(created\.snapshot\)[\s\S]*?hashCanonicalJson\(storedSnapshot\)/);
assert.match(routeSource, /Prisma\.TransactionIsolationLevel\.Serializable/);
assert.match(routeSource, /requestedRevisionId[\s\S]*?update\.revision\.id !== requestedRevisionId/);
assert.match(
  lifecycleSource,
  /preserveCurrentDesign\(\)[\s\S]*?method: "POST"[\s\S]*?revisionId: revisionUpdate\.revisionId/
);
assert.match(workspaceSource, /useDesignPageFloorPlanLifecycleRegistration\(\{/);
assert.match(promptSource, /Your current design will stay unchanged\./);
assert.match(promptSource, /Create updated copy/);
const publicPayloadSource = routeSource.slice(
  routeSource.indexOf("function publicUpdatePayload"),
  routeSource.indexOf("function updatedCopyTitle")
);
assert.doesNotMatch(
  publicPayloadSource,
  /documentJson|nextDocument|canonicalDocument/,
  "The update-check response must summarize changes without exposing revision documents."
);

console.log("Floor-plan revision compare-and-copy checks passed.");
