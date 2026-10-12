import assert from "node:assert/strict";

import {
  buildPlanarUnionPolygons,
  isPointInPlanarRing,
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

// Faces that run a fraction of a millimetre apart, crossing at a shallow angle: a slanted wall's footprint over a
// level one, as exec's top wall band has them (with a third wall elsewhere, which sets where the walk starts). The
// sides used to be sampled 0.05 mm off pieces rounded to the thousandth, so both faces counted as boundary in parts,
// the walk dead-ended, and the two walls were lost - or, in a whole plan, a room's hole was, and the room filled
// solid. The union is exactly the footprints: every sample point is inside it exactly when it is inside one of them.
{
  const quad = (points: [number, number][]): PlanarRegionMm => ({
    outer: points.map(([xMm, zMm]) => ({ xMm, zMm })),
  });
  const footprints = [
    quad([[17935, 6902.193], [15741.274, 6921.034], [15742.734, 7091.027], [17515, 7075.807]]),
    quad([[15982, 6920], [13716, 6920], [13716, 7090], [15982, 7090]]),
    quad([[15862, 2344.5], [15605, 2344.5], [15605, 2879.5], [15862, 2879.5]]),
  ];
  const union = buildPlanarUnionPolygons(footprints);
  const inUnion = (point: { xMm: number; zMm: number }) =>
    union.some(
      (polygon) =>
        isPointInPlanarRing(point, polygon.outer) &&
        !polygon.holes.some((hole) => isPointInPlanarRing(point, hole))
    );
  let mismatched = 0;
  for (let xMm = 13000.37; xMm < 18500; xMm += 25) {
    for (let zMm = 2000.71; zMm < 7500; zMm += 25) {
      const point = { xMm, zMm };
      const inFootprints = footprints.some((footprint) => isPointInPlanarRing(point, footprint.outer));
      if (inFootprints !== inUnion(point)) mismatched += 1;
    }
  }
  assert.equal(union.length, 2, "The two crossing walls and the wall elsewhere must stay two polygons.");
  assert.equal(mismatched, 0, "The union of faces running a fraction of a millimetre apart must be exactly the footprints.");
}

console.log("Planar union loop tests passed.");
