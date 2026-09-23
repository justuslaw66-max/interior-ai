import assert from "node:assert/strict";

import { createGLBResourceCache } from "../components/scene/glb-scaled-model/glbResourceCache";
import { applyGLBResourcePageHidePolicy } from "../components/scene/glb-scaled-model/glbResourcePageLifecycle";

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
const sharedInspection = cache.inspect();
assert.equal(sharedInspection.coherent, true);
assert.equal(sharedInspection.entryCount, 1);
assert.equal(sharedInspection.activeReferenceCount, 2);
assert.equal(sharedInspection.hitCount, 1);
assert.equal(sharedInspection.missCount, 1);
assert.equal(sharedInspection.entries[0]?.state, "ready");
assert.doesNotMatch(
  JSON.stringify(sharedInspection),
  /"resource"|unexpected-duplicate|"id":"shared"/,
  "metadata inspection must not expose cached object graphs"
);
first.release();
duplicate.release();
const retainedInspection = cache.inspect();
assert.equal(retainedInspection.activeReferenceCount, 0);
assert.equal(retainedInspection.zeroReferenceEntryCount, 1);
assert.equal(retainedInspection.entries[0]?.retainedAfterRelease, true);

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
const boundedInspection = cache.inspect();
assert.equal(boundedInspection.coherent, true);
assert.equal(boundedInspection.entryCount, boundedInspection.maximumEntries);
assert.equal(
  boundedInspection.activeReferenceCount,
  boundedInspection.entries.reduce(
    (total, entry) => total + entry.referenceCount,
    0
  )
);
assert.ok(
  boundedInspection.entries.every((entry) => entry.referenceCount >= 0),
  "cache inspection must never expose a negative reference count"
);
assert.deepEqual(disposed, ["shared"], "LRU eviction should dispose the oldest resource");

const deferredDisposals: string[] = [];
const deferredCache = createGLBResourceCache<Resource>({
  maximumEntries: 1,
  dispose: (resource) => deferredDisposals.push(resource.id),
});
let resolveDeferred!: (resource: Resource) => void;
const deferred = deferredCache.acquire(
  "/deferred.glb",
  () => new Promise<Resource>((resolve) => (resolveDeferred = resolve))
);
deferred.release();
const replacement = deferredCache.acquire(
  "/replacement.glb",
  async () => ({ id: "replacement" })
);
await replacement.resource;
resolveDeferred({ id: "deferred" });
await deferred.resource;
const deferredInspection = deferredCache.inspect();
assert.equal(deferredInspection.staleCompletionCount, 1);
assert.equal(deferredInspection.disposalCount, 1);
assert.deepEqual(deferredDisposals, ["deferred"]);
replacement.release();
deferredCache.clear();

const bfcacheDisposals: string[] = [];
const bfcacheCache = createGLBResourceCache<Resource>({
  maximumEntries: 1,
  dispose: (resource) => bfcacheDisposals.push(resource.id),
});
const bfcacheLease = bfcacheCache.acquire(
  "/bfcache.glb",
  async () => ({ id: "bfcache" }),
);
await bfcacheLease.resource;
assert.equal(
  applyGLBResourcePageHidePolicy({
    persisted: true,
    clearPrepared: () => bfcacheCache.clear(),
    clearParsed: () => bfcacheCache.clear(),
  }),
  "retained",
);
assert.equal(bfcacheCache.inspect().activeReferenceCount, 1);
assert.equal(bfcacheCache.inspect().coherent, true);
bfcacheLease.release();
assert.equal(bfcacheCache.inspect().zeroReferenceEntryCount, 1);
const clearOrder: string[] = [];
assert.equal(
  applyGLBResourcePageHidePolicy({
    persisted: false,
    clearPrepared: () => {
      clearOrder.push("prepared");
      bfcacheCache.clear();
    },
    clearParsed: () => clearOrder.push("parsed"),
  }),
  "cleared",
);
assert.deepEqual(clearOrder, ["prepared", "parsed"]);
assert.equal(bfcacheCache.size(), 0);
assert.deepEqual(bfcacheDisposals, ["bfcache"]);

cache.clear();
assert.equal(cache.size(), 0);
assert.deepEqual(
  disposed.sort(),
  ["recovered", "shared", "third"].sort(),
  "cache cleanup should dispose every retained parsed source exactly once"
);

console.log(
  "GLB resource cache tests passed: atomic metadata inspection, reference accounting, concurrent duplicate, cached remount, stale completion, bounded ownership, and cleanup."
);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
