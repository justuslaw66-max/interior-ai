import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS,
  findPotentialLineIntersectionPairs,
  type FloorPlanValidationLineSegment,
} from "@/lib/floor-plan-geometry-validation";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import { CAD_SOURCE_LIMITS } from "@/lib/floor-plan-imports/cad-types";

type Point = { xMm: number; zMm: number };

function orientation(first: Point, second: Point, third: Point): number {
  return (second.xMm - first.xMm) * (third.zMm - first.zMm) -
    (second.zMm - first.zMm) * (third.xMm - first.xMm);
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  return orientation(start, end, point) === 0 &&
    point.xMm >= Math.min(start.xMm, end.xMm) &&
    point.xMm <= Math.max(start.xMm, end.xMm) &&
    point.zMm >= Math.min(start.zMm, end.zMm) &&
    point.zMm <= Math.max(start.zMm, end.zMm);
}

function segmentsIntersect(first: FloorPlanValidationLineSegment, second: FloorPlanValidationLineSegment): boolean {
  const firstA = orientation(first.start, first.end, second.start);
  const firstB = orientation(first.start, first.end, second.end);
  const secondA = orientation(second.start, second.end, first.start);
  const secondB = orientation(second.start, second.end, first.end);
  if ((firstA > 0) !== (firstB > 0) && (secondA > 0) !== (secondB > 0)) return true;
  return (
    (firstA === 0 && pointOnSegment(second.start, first.start, first.end)) ||
    (firstB === 0 && pointOnSegment(second.end, first.start, first.end)) ||
    (secondA === 0 && pointOnSegment(first.start, second.start, second.end)) ||
    (secondB === 0 && pointOnSegment(first.end, second.start, second.end))
  );
}

function bruteForceIntersections(segments: FloorPlanValidationLineSegment[]): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      if (segmentsIntersect(segments[first], segments[second])) {
        result.push([segments[first].wallIndex, segments[second].wallIndex]);
      }
    }
  }
  return result;
}

const characterizationSegments: FloorPlanValidationLineSegment[] = [
  { wallIndex: 0, start: { xMm: 0, zMm: 0 }, end: { xMm: 10, zMm: 10 } },
  { wallIndex: 1, start: { xMm: 0, zMm: 10 }, end: { xMm: 10, zMm: 0 } },
  { wallIndex: 2, start: { xMm: 20, zMm: 0 }, end: { xMm: 30, zMm: 0 } },
  { wallIndex: 3, start: { xMm: 5, zMm: 5 }, end: { xMm: 15, zMm: 15 } },
  { wallIndex: 4, start: { xMm: 10, zMm: 10 }, end: { xMm: 20, zMm: 20 } },
  { wallIndex: 5, start: { xMm: -10, zMm: 40 }, end: { xMm: 40, zMm: 40 } },
];
const characterized = findPotentialLineIntersectionPairs(characterizationSegments);
assert.equal(characterized.budgetExceeded, false);
assert.deepEqual(
  characterized.pairs.filter(([first, second]) =>
    segmentsIntersect(characterizationSegments[first], characterizationSegments[second])
  ),
  bruteForceIntersections(characterizationSegments),
  "The spatial broad phase must preserve the exhaustive validator's exact intersecting-pair set and order."
);

let randomState = 0x6d2b79f5;
function nextCoordinate(): number {
  randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return (randomState % 20_001) - 10_000;
}
for (let fixture = 0; fixture < 20; fixture += 1) {
  const segments = Array.from({ length: 80 }, (_, wallIndex): FloorPlanValidationLineSegment => {
    const start = { xMm: nextCoordinate(), zMm: nextCoordinate() };
    let end = { xMm: nextCoordinate(), zMm: nextCoordinate() };
    if (start.xMm === end.xMm && start.zMm === end.zMm) {
      end = { ...end, xMm: end.xMm + 1 };
    }
    return { wallIndex, start, end };
  });
  const indexed = findPotentialLineIntersectionPairs(segments);
  assert.equal(indexed.budgetExceeded, false);
  assert.deepEqual(
    indexed.pairs.filter(([first, second]) => segmentsIntersect(segments[first], segments[second])),
    bruteForceIntersections(segments),
    `Indexed fixture ${fixture} must preserve every exhaustive intersection in original pair order.`
  );
}

assert.equal(
  FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS.maxLineWallsPerFloor,
  CAD_SOURCE_LIMITS.maxCanonicalWallSegments,
  "CAD promotion and canonical validation must agree on their maximum supported wall count."
);

const maximumSeparatedWalls = Array.from(
  { length: FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS.maxLineWallsPerFloor },
  (_, wallIndex): FloorPlanValidationLineSegment => ({
    wallIndex,
    start: { xMm: 0, zMm: wallIndex * 2 },
    end: { xMm: 1_000_000, zMm: wallIndex * 2 },
  })
);
const startedAt = performance.now();
const maximumResult = findPotentialLineIntersectionPairs(maximumSeparatedWalls);
const elapsedMs = performance.now() - startedAt;
assert.equal(maximumResult.budgetExceeded, false);
assert.equal(maximumResult.sweepAxis, "z", "The index should avoid the adversarial shared X range.");
assert.equal(maximumResult.pairChecks, 0, "Separated walls should not trigger quadratic pair checks.");
assert.deepEqual(maximumResult.pairs, []);
assert.ok(
  elapsedMs < 5_000,
  `Maximum supported separated-wall validation should remain bounded (took ${elapsedMs.toFixed(1)} ms).`
);

const dense = Array.from({ length: 20 }, (_, wallIndex): FloorPlanValidationLineSegment => ({
  wallIndex,
  start: { xMm: 0, zMm: 0 },
  end: { xMm: 1_000, zMm: 1_000 },
}));
const firstBudgetFailure = findPotentialLineIntersectionPairs(dense, { maxPairChecks: 25 });
const secondBudgetFailure = findPotentialLineIntersectionPairs(dense, { maxPairChecks: 25 });
assert.deepEqual(firstBudgetFailure, secondBudgetFailure, "Work-budget failures must be deterministic.");
assert.equal(firstBudgetFailure.budgetExceeded, true);
assert.equal(firstBudgetFailure.pairChecks, 25);
assert.deepEqual(
  firstBudgetFailure.pairs,
  [],
  "A budget failure must not expose a misleading partial validation result."
);

const denseProvenance: FloorPlanEntityProvenanceV2 = {
  confidence: 0.5,
  extractionVersion: "geometry-budget-test",
  evidence: [],
  reviewHistory: [],
};
const denseDocument: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "dense-budget-document",
  revisionId: "dense-budget-revision",
  createdAt: "2026-07-17T00:00:00.000Z",
  verification: { tier: "needs_review", criticalIssueIds: ["geometry-review"] },
  sources: [],
  floors: [{
    id: "dense-floor",
    name: "Dense floor",
    levelIndex: 0,
    elevationMm: 0,
    storeyHeightMm: 2_800,
    slabThicknessMm: 150,
    defaults: {
      wallHeight: { valueMm: 2_600, evidence: "assumed", provenance: denseProvenance },
      doorHeight: { valueMm: 2_100, evidence: "assumed", provenance: denseProvenance },
      windowHeight: { valueMm: 1_200, evidence: "assumed", provenance: denseProvenance },
      windowSillHeight: { valueMm: 900, evidence: "assumed", provenance: denseProvenance },
    },
    calibrations: [],
    vertices: [
      { id: "dense-start", xMm: 0, zMm: 0, provenance: denseProvenance },
      { id: "dense-end", xMm: 1_000, zMm: 1_000, provenance: denseProvenance },
    ],
    walls: Array.from({ length: 449 }, (_, index) => ({
      id: `dense-wall-${index}`,
      path: { kind: "line" as const, startVertexId: "dense-start", endVertexId: "dense-end" },
      thicknessMm: 100,
      classification: "interior" as const,
      adjacentRoomIds: [],
      provenance: denseProvenance,
    })),
    rooms: [],
    openings: [],
    structures: [],
    annotations: [],
    dimensions: [],
  }],
};
assert.ok(
  validateFloorPlanDocumentV2(denseDocument).some(
    (issue) => issue.code === "GEOMETRY_VALIDATION_WORK_BUDGET_EXCEEDED"
  ),
  "Pathological dense geometry must fail closed at the deterministic compiler work budget."
);

console.log(
  `Floor-plan geometry validation checks passed (${maximumSeparatedWalls.length} walls in ${elapsedMs.toFixed(1)} ms).`
);
