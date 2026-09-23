import assert from "node:assert/strict";
import {
  catalogV1ToFloorPlanDocumentV2Fixtures,
} from "@/lib/floor-plan-catalog-v1-adapter";
import {
  hashFloorPlanGeometryV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";

const catalog = getAllFloorPlanLibraryCatalogs().find(
  (candidate) => candidate.floor_plan.plan_id === "sg-hdb-ping-yi-court"
);
assert.ok(catalog, "Expected the Ping Yi Court schema-v1 catalog fixture.");

const fixtures = catalogV1ToFloorPlanDocumentV2Fixtures(catalog);
const secondPass = catalogV1ToFloorPlanDocumentV2Fixtures(catalog);
assert.equal(fixtures.length, 7, "Every Ping Yi source page needs a V2 benchmark fixture.");
assert.deepEqual(
  fixtures.map(({ document }) => hashFloorPlanGeometryV2(document)),
  secondPass.map(({ document }) => hashFloorPlanGeometryV2(document)),
  "Schema-v1 conversion must be deterministic."
);

fixtures.forEach(({ document, reviewIssues }, fixtureIndex) => {
  const layout = catalog.layouts[fixtureIndex];
  const floor = document.floors[0];
  assert.equal(document.schemaVersion, 2);
  assert.equal(document.units, "mm");
  assert.equal(document.verification.tier, "needs_review");
  assert.equal(document.verification.approvedBy, undefined);
  assert.equal(document.verification.approvedAt, undefined);
  assert.equal(floor.calibrations.length, 0, "The adapter must not invent calibration.");
  assert.equal(document.sources.length, 1);
  assert.equal(document.sources[0].kind, "legacy");
  assert.equal(document.sources[0].sha256, catalog.source.sha256 ?? undefined);
  assert.ok(
    reviewIssues.some((issue) => issue.code === "LEGACY_SOURCE_REVIEW_REQUIRED")
  );
  assert.ok(
    reviewIssues.some((issue) => issue.code === "LEGACY_CALIBRATION_UNAVAILABLE")
  );
  assert.deepEqual(
    document.verification.criticalIssueIds,
    reviewIssues
      .filter((issue) => issue.severity === "critical" && !issue.resolved)
      .map((issue) => issue.id)
  );

  assert.deepEqual(
    floor.rooms.map((room) => room.id),
    layout.template.rooms.map((room) => room.id),
    `${layout.layout_id} must preserve stable room IDs.`
  );
  assert.equal(
    floor.annotations.length,
    layout.template.rooms.length + layout.template.annotations.length,
    `${layout.layout_id} must retain room labels and non-physical catalog annotations.`
  );
  for (const room of layout.template.rooms) {
    const label = floor.annotations.find(
      (annotation) => annotation.id === `source-label:${room.id}`
    );
    assert.equal(
      label?.text,
      room.source_label ?? room.name,
      `${layout.layout_id}:${room.id} must preserve its source/inferred label.`
    );
  }
  assert.deepEqual(
    floor.structures.map((structure) => structure.id),
    layout.template.reference_zones.map((zone) => zone.id),
    `${layout.layout_id} must map every reference zone to a locked structure.`
  );
  assert.ok(floor.structures.every((structure) => structure.locked));

  for (const [doorwayIndex, doorway] of layout.template.doorways.entries()) {
    const openingId = `doorway:${doorwayIndex + 1}:${doorway.from_room_id}`;
    const converted = floor.openings.filter(
      (opening) => opening.id === openingId || opening.id.startsWith(`${openingId}:part:`)
    );
    const explicitReview = reviewIssues.some(
      (issue) =>
        issue.entityIds?.includes(openingId) &&
        issue.code === "LEGACY_OPENING_HOST_AMBIGUOUS"
    );
    assert.ok(
      converted.length > 0 || explicitReview,
      `${layout.layout_id}:${openingId} must be converted or explicitly blocked for host review.`
    );
    const expectedOpen = doorway.kind === "opening" || doorway.operation === "open";
    for (const opening of converted) {
      assert.equal(opening.kind, expectedOpen ? "open_passage" : "door");
      assert.equal(opening.operation, expectedOpen ? "open" : doorway.operation ?? "swing");
    }
  }

  for (const [windowIndex, window] of layout.template.windows.entries()) {
    const openingId = `window:${windowIndex + 1}:${window.room_id}`;
    const converted = floor.openings.filter(
      (opening) => opening.id === openingId || opening.id.startsWith(`${openingId}:part:`)
    );
    const explicitReview = reviewIssues.some(
      (issue) =>
        issue.entityIds?.includes(openingId) &&
        issue.code === "LEGACY_OPENING_HOST_AMBIGUOUS"
    );
    assert.ok(
      converted.length > 0 || explicitReview,
      `${layout.layout_id}:${openingId} must be converted or explicitly blocked for host review.`
    );
    for (const opening of converted) {
      assert.equal(opening.kind, window.kind);
      assert.equal(opening.operation, "fixed");
    }
  }

  const sharedWalls = floor.walls.filter((wall) => wall.adjacentRoomIds.length === 2);
  assert.ok(sharedWalls.length > 0, `${layout.layout_id} should retain merged shared walls.`);
  for (const wall of sharedWalls) {
    for (const roomId of wall.adjacentRoomIds) {
      assert.ok(
        floor.rooms
          .find((room) => room.id === roomId)
          ?.wallLoops.some((loop) => loop.walls.some((entry) => entry.wallId === wall.id)),
        `${layout.layout_id}:${wall.id} must be referenced by both adjacent room loops.`
      );
    }
  }

  const validationErrors = validateFloorPlanDocumentV2(document).filter(
    (issue) => issue.severity === "error"
  );
  assert.deepEqual(
    validationErrors,
    [],
    `${layout.layout_id} compatibility fixture must be structurally valid even while it needs review.`
  );
  for (const provenance of [
    ...floor.vertices.map((entity) => entity.provenance),
    ...floor.walls.map((entity) => entity.provenance),
    ...floor.rooms.map((entity) => entity.provenance),
    ...floor.openings.map((entity) => entity.provenance),
    ...floor.structures.map((entity) => entity.provenance),
    ...floor.annotations.map((entity) => entity.provenance),
  ]) {
    assert.ok(provenance.evidence.every((evidence) => evidence.basis === "legacy"));
  }
});

const typeOne = fixtures.find(({ document }) =>
  document.id.endsWith(":2-room-flexi-type-1")
);
assert.ok(typeOne);
assert.ok(
  typeOne.document.floors[0].openings.some(
    (opening) => opening.kind === "door" && opening.operation === "sliding"
  ),
  "The Flexi bedroom partition must retain its sliding operation."
);
assert.ok(
  typeOne.document.floors[0].openings.some(
    (opening) => opening.kind === "door" && opening.operation === "folding"
  ),
  "The Flexi bathroom door must retain its folding operation."
);

const typeTwoOpen = fixtures.find(({ document }) =>
  document.id.endsWith(":2-room-flexi-type-2-open")
);
assert.ok(typeTwoOpen);
assert.equal(
  typeTwoOpen.document.floors[0].rooms.some((room) => room.id === "flex"),
  false,
  "The default open Type 2 configuration must not silently create a flex room."
);
const typeTwoOption = typeTwoOpen.document.floors[0].annotations.find(
  (annotation) => annotation.id === "catalog-annotation:partitioned-flex-option"
);
assert.equal(typeTwoOption?.kind, "suggested_room");
assert.equal(typeTwoOption?.configurationId, "partitioned-flex");
assert.equal(typeTwoOption?.geometry.kind, "polygon");
assert.equal(typeTwoOption?.provenance.evidence[0]?.pageNumber, 3);
assert.ok(
  typeTwoOpen.reviewIssues.some(
    (issue) => issue.code === "LEGACY_OPTIONAL_CONFIGURATION_REVIEW_REQUIRED"
  )
);
assert.equal(typeTwoOpen.document.verification.tier, "needs_review");

const typeTwoPartitionedFixture = fixtures.find(({ document }) =>
  document.id.endsWith(":2-room-flexi-type-2-partitioned")
);
assert.ok(typeTwoPartitionedFixture);
assert.ok(
  typeTwoPartitionedFixture.document.floors[0].rooms.some(
    (room) => room.id === "flex"
  ),
  "The source-authored partitioned variant may contain the flex room only when that layout is explicitly selected."
);
const typeTwoLayouts = catalog.layouts.filter(
  (layout) => layout.configuration?.group_id === "2-room-flexi-type-2"
);
assert.deepEqual(
  typeTwoLayouts.map((layout) => ({
    id: layout.configuration!.option_id,
    defaultSelected: layout.configuration!.default_selected,
  })),
  [
    { id: "open-flex", defaultSelected: true },
    { id: "partitioned-flex", defaultSelected: false },
  ],
  "The open source layout is the only default; the physical partitioned variant requires explicit selection."
);

const fiveRoom = fixtures.find(({ document }) => document.id.endsWith(":5-room"));
assert.ok(fiveRoom);
assert.equal(
  fiveRoom.document.floors[0].rooms.some((room) =>
    room.name.toLowerCase().includes("study")
  ),
  false,
  "SUGGESTED STUDY is source annotation, not a physical room."
);
const suggestedStudy = fiveRoom.document.floors[0].annotations.find(
  (annotation) => annotation.id === "catalog-annotation:suggested-study"
);
assert.equal(suggestedStudy?.kind, "optional_partition");
assert.equal(suggestedStudy?.text, "SUGGESTED STUDY");
assert.equal(suggestedStudy?.configurationId, "suggested-study");
assert.equal(suggestedStudy?.provenance.evidence[0]?.basis, "legacy");
assert.equal(fiveRoom.document.verification.tier, "needs_review");

const threeRoom = fixtures.find(({ document }) => document.id.endsWith(":3-room"));
assert.ok(threeRoom);
assert.ok(
  threeRoom.document.floors[0].openings.some(
    (opening) => opening.kind === "louvre" && opening.operation === "fixed"
  ),
  "The service-strip louvre must remain a fixed canonical louvre."
);

console.log("Schema-v1 to FloorPlanDocumentV2 adapter checks passed.");
