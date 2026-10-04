import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { stableExtrudeOptions } from "@/components/editor/renderers/stableExtrudeOptions";
import { createLeastRecentlyUsedCache } from "@/lib/least-recently-used-cache";

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
const structureRenderers = [
  "CanonicalFloorPlanStructure.tsx",
  "HousePlanRenderer3D.tsx",
  "house-plan-3d",
  "canonical-floor-plan",
].flatMap((entry) => sourceFiles(join(rendererRoot, entry)));
// Calls that return the same object for the same input.
const stableBuilders = /(?<!stableExtrudeOptions)\(/;
const offenders: string[] = [];
for (const path of structureRenderers) {
  const source = readFileSync(path, "utf8").replace(/\s+/g, " ");
  for (const match of source.matchAll(/<(extrude|shape)Geometry args=\{\[([^\]]*)\]\}/g)) {
    if (/\{\s*depth/.test(match[2]) || stableBuilders.test(match[2])) {
      offenders.push(`${relative(root, path)}: ${match[0].slice(0, 90)}`);
    }
  }
}
assert.deepEqual(
  offenders,
  [],
  "Extrude and shape geometries should get memoized shapes and stableExtrudeOptions, not inline objects."
);

// Wall bodies build their shapes with the bands, and keep them per cut-away set.
const wallBands = readFileSync(
  join(rendererRoot, "canonical-floor-plan/useCanonicalWallBands.ts"),
  "utf8"
).replace(/\s+/g, " ");
assert.match(
  wallBands,
  /cache\.get\(\[\.\.\.excludedWallIds\]\.sort\(\)\.join\("\|"\), \(\) => buildCanonicalWallUnionBands\(floor, \{ excludedWallIds \}\)\.map\(\(band\) => \(\{ \.\.\.band, shapes: planarUnionShapes\(band\.polygons\), \}\)\) \)/,
  "Canonical wall bodies should keep each band's shapes with the band, per cut-away set."
);
assert.match(
  wallBands,
  /const bandsByFloor = new WeakMap</,
  "Each floor model keeps its own bands, so an edited plan never reuses old bands."
);

// The cache keeps the most recently used entries.
const cache = createLeastRecentlyUsedCache<{ key: string }>(2);
const built: string[] = [];
const value = (key: string) => cache.get(key, () => {
  built.push(key);
  return { key };
});
const a = value("a");
value("b");
assert.equal(value("a"), a, "A cached key returns the same object.");
value("c");
assert.equal(cache.size, 2);
value("a");
value("b");
assert.deepEqual(built, ["a", "b", "c", "b"], "Adding c evicts b, the least recently used.");

console.log("Stable geometry args tests passed.");
