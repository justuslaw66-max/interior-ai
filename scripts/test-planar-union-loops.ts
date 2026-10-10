import assert from "node:assert/strict";

import {
  buildPlanarUnionPolygons,
  type PlanarRegionMm,
} from "@/lib/floor-plan-planar-union";

// The boundary walk indexes segments by their start point instead of
// re-scanning every remaining segment at each step (0.5 s per camera cutaway
// change in a 13-room plan). These cases pin what the walk returns, including
// where each ring starts and which way it runs, so the index cannot change the
// geometry the wall bands and slabs are built from.
const rect = (x0: number, z0: number, x1: number, z1: number): PlanarRegionMm => ({
  outer: [
    { xMm: x0, zMm: z0 },
    { xMm: x1, zMm: z0 },
    { xMm: x1, zMm: z1 },
    { xMm: x0, zMm: z1 },
  ],
});

// A long wall with 200 stubs: one polygon, every stub corner kept.
const comb = [rect(0, 0, 200 * 200, 120)];
for (let index = 0; index < 200; index += 1) {
  comb.push(rect(index * 200 + 50, 60, index * 200 + 150, 600));
}
const combUnion = buildPlanarUnionPolygons(comb);
assert.equal(combUnion.length, 1);
assert.equal(combUnion[0].outer.length, 804);
assert.equal(combUnion[0].holes.length, 0);
assert.deepEqual(combUnion[0].outer.slice(0, 3), [
  { xMm: 0, zMm: 0 },
  { xMm: 40000, zMm: 0 },
  { xMm: 40000, zMm: 120 },
]);

// A 4 x 4 grid of rooms: one outline with 16 room holes.
const grid: PlanarRegionMm[] = [];
for (let index = 0; index <= 4; index += 1) {
  grid.push(rect(index * 3000 - 60, -60, index * 3000 + 60, 12060));
  grid.push(rect(-60, index * 3000 - 60, 12060, index * 3000 + 60));
}
const gridUnion = buildPlanarUnionPolygons(grid);
assert.equal(gridUnion.length, 1);
assert.deepEqual(gridUnion[0].outer.slice(0, 2), [
  { xMm: -60, zMm: -60 },
  { xMm: 12060, zMm: -60 },
]);
assert.equal(gridUnion[0].outer.length, 4);
assert.equal(gridUnion[0].holes.length, 16);
assert.deepEqual(gridUnion[0].holes[0].slice(0, 2), [
  { xMm: 11940, zMm: 11940 },
  { xMm: 11940, zMm: 9060 },
]);

console.log("Planar union loop tests passed.");
