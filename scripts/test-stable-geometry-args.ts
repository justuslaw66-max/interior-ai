import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { stableExtrudeOptions } from "@/components/editor/renderers/stableExtrudeOptions";

// React Three Fiber rebuilds a geometry when an `args` entry changes identity, so
// extrude options must be the same object for the same depth.
assert.equal(stableExtrudeOptions(2.6, 1), stableExtrudeOptions(2.6, 1));
assert.deepEqual(stableExtrudeOptions(2.6, 1), {
  depth: 2.6,
  bevelEnabled: false,
  steps: 1,
});
assert.deepEqual(stableExtrudeOptions(0.12), { depth: 0.12, bevelEnabled: false });
assert.notEqual(stableExtrudeOptions(0.12), stableExtrudeOptions(0.12, 1));
assert.notEqual(stableExtrudeOptions(0.12), stableExtrudeOptions(0.13));

// The cache is bounded: filling it past its size starts a fresh set of objects,
// which still compare equal by value.
const first = stableExtrudeOptions(1000);
for (let index = 0; index < 600; index += 1) stableExtrudeOptions(2000 + index);
assert.deepEqual(stableExtrudeOptions(1000), first);

// No 3D structure renderer may hand a geometry an object or a freshly built
// shape inline: each re-render (a hover, a camera cutaway change) would rebuild it.
const root = process.cwd();
const rendererRoot = join(root, "components/editor/renderers");
const sourceFiles = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => sourceFiles(join(path, name)))
    : /\.tsx$/.test(path) ? [path] : [];
const structureRenderers3D = [
  "CanonicalFloorPlanStructure.tsx",
  "HousePlanRenderer3D.tsx",
  "house-plan-3d",
  "canonical-floor-plan",
].flatMap((entry) => sourceFiles(join(rendererRoot, entry)));
const offenders: string[] = [];
for (const path of structureRenderers3D) {
  const source = readFileSync(path, "utf8").replace(/\s+/g, " ");
  for (const match of source.matchAll(/<(extrude|shape)Geometry args=\{\[([^\]]*)\]\}/g)) {
    if (/\{\s*depth|(?<!stableExtrudeOptions)\(/.test(match[2])) {
      offenders.push(`${relative(root, path)}: ${match[0].slice(0, 90)}`);
    }
  }
}
assert.deepEqual(
  offenders,
  [],
  "Extrude and shape geometries should get memoized shapes and stableExtrudeOptions, not inline objects."
);

// Wall bodies build their shapes with the bands, not on every render.
const canonicalStructure = readFileSync(
  join(rendererRoot, "CanonicalFloorPlanStructure.tsx"),
  "utf8"
).replace(/\s+/g, " ");
assert.match(
  canonicalStructure,
  /buildCanonicalWallUnionBands\(floor, \{ excludedWallIds \}\)\.map\(\(band\) => \(\{ \.\.\.band, shapes: planarUnionShapes\(band\.polygons\) \}\)\)/,
  "Canonical wall bodies should memoize each band's shapes with the band."
);

console.log("Stable geometry args tests passed.");
