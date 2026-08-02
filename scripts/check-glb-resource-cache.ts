import assert from "node:assert/strict";

import { createGLBResourceCache } from "../components/scene/glb-scaled-model/glbResourceCache";

async function main() {
type Resource = { id: string };
const disposed: string[] = [];
const cache = createGLBResourceCache<Resource>({
  maximumEntries: 2,
  dispose: (resource) => disposed.push(resource.id),
});

let sharedLoadCount = 0;
let resolveShared!: (resource: Resource) => void;
const first = cache.acquire("/shared.glb", () => {
  sharedLoadCount += 1;
  return new Promise<Resource>((resolve) => {
    resolveShared = resolve;
  });
});
const duplicate = cache.acquire("/shared.glb", async () => {
  sharedLoadCount += 1;
  return { id: "unexpected-duplicate" };
});
assert.equal(first.cacheStatus, "network");
assert.equal(duplicate.cacheStatus, "cache-hit");
assert.equal(sharedLoadCount, 1, "concurrent duplicate URLs should share one parse");
resolveShared({ id: "shared" });
assert.equal((await first.resource).id, "shared");
assert.equal((await duplicate.resource).id, "shared");
first.release();
duplicate.release();

const remount = cache.acquire("/shared.glb", async () => {
  sharedLoadCount += 1;
  return { id: "unexpected-remount" };
});
assert.equal(remount.cacheStatus, "cache-hit");
assert.equal((await remount.resource).id, "shared");
assert.equal(sharedLoadCount, 1, "a cached remount should not parse again");
remount.release();

let failureLoadCount = 0;
const failed = cache.acquire("/failure.glb", async () => {
  failureLoadCount += 1;
  throw new Error("decode failed");
});
await assert.rejects(failed.resource, /decode failed/);
failed.release();
const recovered = cache.acquire("/failure.glb", async () => {
  failureLoadCount += 1;
  return { id: "recovered" };
});
assert.equal(recovered.cacheStatus, "network");
assert.equal((await recovered.resource).id, "recovered");
assert.equal(failureLoadCount, 2, "a failed parse must be evicted for a later mount");
recovered.release();

const third = cache.acquire("/third.glb", async () => ({ id: "third" }));
assert.equal((await third.resource).id, "third");
third.release();
assert.equal(cache.size(), 2, "the cache must retain its configured ownership bound");
assert.deepEqual(disposed, ["shared"], "LRU eviction should dispose the oldest resource");

cache.clear();
assert.equal(cache.size(), 0);
assert.deepEqual(
  disposed.sort(),
  ["recovered", "shared", "third"].sort(),
  "cache cleanup should dispose every retained parsed source exactly once"
);

console.log(
  "GLB resource cache tests passed: concurrent duplicate, cached remount, failure eviction, bounded ownership, and cleanup."
);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
