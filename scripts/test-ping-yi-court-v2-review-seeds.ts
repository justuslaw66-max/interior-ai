import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  compileFloorPlanDocumentV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import {
  generatePingYiCourtV2ReviewSeedBundle,
  serializePingYiCourtV2ReviewSeedBundle,
  type PingYiCourtReviewSeedV2,
  type PingYiCourtSourceManifestV2,
} from "@/lib/floor-plan-seeds/ping-yi-court-v2";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";

const root = path.join(
  process.cwd(),
  "catalog",
  "floor-plans",
  "sg",
  "hdb",
  "ping-yi-court"
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "source-manifest.json"), "utf8")
) as PingYiCourtSourceManifestV2;
const catalog = getAllFloorPlanLibraryCatalogs().find(
  (candidate) => candidate.floor_plan.plan_id === "sg-hdb-ping-yi-court"
);
assert.ok(catalog);

const first = generatePingYiCourtV2ReviewSeedBundle(catalog, manifest);
const second = generatePingYiCourtV2ReviewSeedBundle(catalog, manifest);
assert.equal(
  serializePingYiCourtV2ReviewSeedBundle(first),
  serializePingYiCourtV2ReviewSeedBundle(second),
  "Native V2 review-seed generation must be byte-for-byte deterministic."
);
assert.equal(first.fixtures.length, 7);
assert.equal(first.verificationTier, "needs_review");
assert.deepEqual(first.publication, { status: "draft", visibility: "review_only" });

const expectedGeometryHashes: Record<string, string> = {
  "2-room-flexi-type-1": "b306845ec092b09d1c51b3781ca7db9677ea4554c3c05ca27dcb872943a0a012",
  "2-room-flexi-type-2-open": "5199acda48d9c6cf48b0c42ef2ebde7355a12284804525affe60fd467096fdee",
  "2-room-flexi-type-2-partitioned": "d7b8c18a29c22a264f7acc9e11d3ca025501ff17e2e1f24ae33d3482eea54a47",
  "3-room": "6a948dd32635a1032d39fcf29d3dfd9607c6ee94a994225bc49d0a13e7f5496a",
  "4-room": "380b1379ef69409f3337ad1ff81318244e65b20c16c06980a2d06725ea74dcdb",
  "5-room": "b61e32d02ddfd56086ccef571c0a7003081ca8dc55a39fb0205daff9dd06e158",
  "3gen": "bc0bacdd118beb1d8f34bb76c3c66728a8f21ce093c44c93332f87acdb94f38f",
};

function fixture(layoutId: string): PingYiCourtReviewSeedV2 {
  const value = first.fixtures.find((candidate) => candidate.layoutId === layoutId);
  assert.ok(value, `Missing native V2 fixture ${layoutId}.`);
  return value;
}

function hasAssertion(
  assertions: Array<Record<string, unknown>>,
  expected: Record<string, unknown>
): boolean {
  return assertions.some((assertion) =>
    Object.entries(expected).every(([key, value]) => assertion[key] === value)
  );
}

for (const seed of first.fixtures) {
  const { document } = seed;
  const floor = document.floors[0];
  assert.equal(seed.geometryHash, expectedGeometryHashes[seed.layoutId]);
  assert.equal(compileFloorPlanDocumentV2(document).geometryHash, seed.geometryHash);
  assert.deepEqual(
    validateFloorPlanDocumentV2(document).filter((issue) => issue.severity === "error"),
    [],
    `${seed.layoutId} must compile as structurally valid V2 geometry.`
  );
  assert.equal(document.verification.tier, "needs_review");
  assert.equal(document.verification.approvedBy, undefined);
  assert.equal(document.verification.approvedAt, undefined);
  assert.ok(document.verification.criticalIssueIds.length > 0);
  assert.ok(
    seed.reviewIssues.some(
      (issue) => issue.code === "SOURCE_MANIFEST_UNRESOLVED" && !issue.resolved
    ),
    `${seed.layoutId} must carry unresolved source-manifest evidence into review.`
  );
  assert.deepEqual(floor.calibrations, []);
  assert.equal(document.sources[0].kind, "pdf");
  assert.equal(document.sources[0].uri, manifest.source.url);
  assert.equal(document.sources[0].sha256, manifest.source.sha256);
  assert.equal(document.sources[1].uri, manifest.official_brochure.url);
  assert.equal(document.sources[1].sha256, manifest.official_brochure.sha256);
  assert.ok(floor.rooms.length > 0, `${seed.layoutId} must retain canonical rooms.`);
  assert.ok(floor.openings.length > 0, `${seed.layoutId} must retain canonical openings.`);
  assert.ok(floor.structures.length > 0, `${seed.layoutId} must retain structures.`);
  assert.ok(seed.sourceEvidence.printedDimensionsMm.length > 0);
  assert.ok(
    seed.sourceEvidence.printedDimensionsMm.every(Number.isSafeInteger),
    `${seed.layoutId} must preserve printed dimensions as integer millimetres.`
  );
  assert.deepEqual(
    floor.dimensions,
    [],
    "Unregistered dimension text must stay in evidence instead of inventing V2 endpoints."
  );
  for (const entity of [
    ...floor.vertices,
    ...floor.walls,
    ...floor.rooms,
    ...floor.openings,
    ...floor.structures,
    ...floor.annotations,
  ]) {
    assert.ok(entity.provenance.evidence.every((evidence) => evidence.basis === "legacy"));
    assert.ok(
      entity.provenance.evidence.every(
        (evidence) => evidence.sourceId === document.sources[0].id
      )
    );
  }
}

const typeOne = fixture("2-room-flexi-type-1");
assert.ok(typeOne.sourceEvidence.printedDimensionsMm.includes(2890));
assert.ok(typeOne.sourceEvidence.printedDimensionsMm.includes(3110));
assert.ok(
  typeOne.document.floors[0].openings.some((opening) => opening.operation === "sliding")
);
assert.ok(
  typeOne.document.floors[0].openings.some((opening) => opening.operation === "folding")
);
assert.deepEqual(
  typeOne.document.floors[0].structures.map((structure) => structure.id),
  ["aircon_ledge", "entry_structure"]
);

const typeTwoOpen = fixture("2-room-flexi-type-2-open");
assert.equal(typeTwoOpen.document.floors[0].rooms.some((room) => room.id === "flex"), false);
assert.ok(
  hasAssertion(typeTwoOpen.sourceEvidence.roomAssertions, {
    room_id: "living_dining",
    width_mm: 5905,
    center_x_mm: 2952.5,
  })
);
assert.ok(
  typeTwoOpen.document.floors[0].annotations.some(
    (annotation) => annotation.configurationId === "partitioned-flex"
  )
);

const typeTwoPartitioned = fixture("2-room-flexi-type-2-partitioned");
assert.ok(typeTwoPartitioned.document.floors[0].rooms.some((room) => room.id === "flex"));
assert.ok(
  hasAssertion(typeTwoPartitioned.sourceEvidence.openingAssertions, {
    from_room_id: "flex",
    to_room_id: "living_dining",
    width_mm: 900,
  })
);

const threeRoom = fixture("3-room");
assert.ok(threeRoom.document.floors[0].rooms.some((room) => room.id === "kitchen_utility"));
assert.ok(
  threeRoom.document.floors[0].openings.some(
    (opening) => opening.kind === "louvre" && opening.operation === "fixed"
  )
);
assert.deepEqual(
  threeRoom.document.floors[0].structures.map((structure) => structure.id),
  ["aircon_ledge", "service_strip"]
);

const fourRoom = fixture("4-room");
assert.ok(
  hasAssertion(fourRoom.sourceEvidence.roomAssertions, {
    room_id: "service_yard",
    width_mm: 1425,
  })
);
assert.ok(
  hasAssertion(fourRoom.sourceEvidence.structureAssertions, {
    zone_id: "service_strip",
    width_mm: 630,
  })
);

const fiveRoom = fixture("5-room");
assert.ok(
  hasAssertion(fiveRoom.sourceEvidence.openingAssertions, {
    from_room_id: "kitchen",
    to_room_id: "living_dining",
    width_mm: 5065,
  })
);
assert.ok(
  fiveRoom.document.floors[0].annotations.some(
    (annotation) =>
      annotation.id === "catalog-annotation:suggested-study" &&
      annotation.kind === "optional_partition"
  )
);

const threeGen = fixture("3gen");
assert.ok(
  hasAssertion(threeGen.sourceEvidence.openingAssertions, {
    from_room_id: "kitchen",
    to_room_id: "living_dining",
    width_mm: 2350,
  })
);
assert.deepEqual(
  threeGen.document.floors[0].structures.map((structure) => structure.id),
  ["aircon_ledge_left", "aircon_ledge_right", "service_strip"]
);

assert.deepEqual(first.stackBindings, [
  {
    block: "810A",
    stacks: ["509", "527"],
    floor_ranges: [{ from: 2, to: 15 }],
    layout_id: "3gen",
    evidence: "official_unit_distribution",
    transform: "needs_review",
  },
]);

console.log("Ping Yi Court native V2 review-seed golden checks passed.");
