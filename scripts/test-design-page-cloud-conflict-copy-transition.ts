import assert from "node:assert/strict";

import {
  createConflictCopyOperationCoordinator,
  replaceDesignIdInRouteIdentity,
  runConflictCopyTransition,
  type ConflictCopyAuthority,
  type ConflictCopyOperation,
} from "@/lib/design-page-cloud-conflict-copy-transition";

const SOURCE_REVISION = "2026-09-03T01:00:00.000Z";
const COPY_REVISION = "2026-09-03T02:00:00.000Z";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type LocalState = {
  visibleDesignId: string;
  revision: string;
  fingerprint: string;
  documentEpoch: number;
  persistenceEpoch: number;
  baseline: { designId: string; revision: string; fingerprint: string };
  writeIdentity: { designId: string; revision: string };
  requestedLoadEpoch: number;
  shareToken: string | null;
};

type Snapshot = { local: LocalState };
type RouteState = { designId: string | null; identity: string };
type CommitBehavior = "success" | "reject" | "throw" | "invalidate";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function routeDesignId(identity: string): string | null {
  return new URL(identity, "http://design-route.local").searchParams.get("designId");
}

function createHarness() {
  const coordinator = createConflictCopyOperationCoordinator();
  const local: LocalState = {
    visibleDesignId: "design-original",
    revision: SOURCE_REVISION,
    fingerprint: "fingerprint-original",
    documentEpoch: 4,
    persistenceEpoch: 7,
    baseline: {
      designId: "design-original",
      revision: SOURCE_REVISION,
      fingerprint: "fingerprint-original",
    },
    writeIdentity: { designId: "design-original", revision: SOURCE_REVISION },
    requestedLoadEpoch: 3,
    shareToken: "original-share-token",
  };
  let route: RouteState = {
    designId: "design-original",
    identity: "/design?designId=design-original&mode=designer&view=2d&workspace=furnish&utm_source=live#plan",
  };
  const calls: string[] = [];
  const published: string[] = [];
  let copiedWrites = 0;
  let oldWriteCompletions = 0;

  const authority = (): ConflictCopyAuthority => ({
    routeDesignId: route.designId,
    visibleDesignId: local.visibleDesignId,
    revision: local.revision,
    documentFingerprint: local.fingerprint,
    documentEpoch: local.documentEpoch,
    persistenceEpoch: local.persistenceEpoch,
    routeIdentity: route.identity,
  });
  const capture = (): Snapshot => ({ local: clone(local) });
  const begin = (conflictKey: string) => {
    const operation = coordinator.begin({ conflictKey, authority: authority(), now: 10 });
    assert.ok(operation, `operation ${conflictKey} should start`);
    return operation;
  };
  const replaceRoute = (current: RouteState, designId: string) => {
    calls.push("route:replace");
    route = {
      designId,
      identity: replaceDesignIdInRouteIdentity(current.identity, designId),
    };
  };
  const restoreRoute = (original: RouteState, copiedDesignId: string) => {
    calls.push("route:restore");
    if (route.designId !== copiedDesignId) return;
    route = clone(original);
  };
  const commit = (
    snapshot: Snapshot,
    copy: { designId: string; revision: string },
    operation: ConflictCopyOperation,
    behavior: CommitBehavior,
  ) => {
    calls.push("requested-load:cancel");
    local.requestedLoadEpoch += 1;
    calls.push("baseline:commit");
    local.documentEpoch += 1;
    local.baseline = {
      designId: copy.designId,
      revision: copy.revision,
      fingerprint: snapshot.local.fingerprint,
    };
    calls.push("write-identity:commit");
    local.persistenceEpoch += 1;
    local.writeIdentity = { designId: copy.designId, revision: copy.revision };
    local.visibleDesignId = copy.designId;
    local.revision = copy.revision;
    local.shareToken = null;
    if (behavior === "invalidate") coordinator.invalidate();
    if (behavior === "throw") throw new Error("local commit failed");
    return behavior !== "reject" && coordinator.isCurrent(operation);
  };
  const restore = (snapshot: Snapshot) => {
    calls.push("local:restore");
    Object.assign(local, clone(snapshot.local));
  };
  const completeOldWrite = (bindingEpoch: number) => {
    if (bindingEpoch !== local.persistenceEpoch) return;
    oldWriteCompletions += 1;
    local.revision = "obsolete-revision";
  };
  const completeRequestedLoad = (requestEpoch: number) => {
    if (requestEpoch !== local.requestedLoadEpoch) return;
    local.visibleDesignId = "design-original";
  };
  const queueCopiedWrite = (revision: string, fingerprint: string) => {
    assert.equal(local.writeIdentity.designId, local.visibleDesignId);
    assert.equal(local.writeIdentity.revision, revision);
    assert.equal(local.baseline.fingerprint, fingerprint);
    copiedWrites += 1;
  };

  const run = (
    operation: ConflictCopyOperation,
    snapshot: Snapshot,
    transport: Promise<{ id: string; updatedAt: string | null }>,
    options: {
      preflight?: boolean;
      routeFailure?: "before" | "after";
      commit?: CommitBehavior;
    } = {},
  ) => runConflictCopyTransition({
    coordinator,
    operation,
    snapshot,
    adapters: {
      readAuthority: authority,
      readRoute: () => clone(route),
      createCopy: async () => {
        calls.push(`copy:create:${operation.id}`);
        return transport;
      },
      preflight: () => {
        calls.push("baseline:preflight");
        return options.preflight ?? true;
      },
      replaceRoute: (current, designId) => {
        if (options.routeFailure === "before") throw new Error("route failed");
        replaceRoute(current, designId);
        if (options.routeFailure === "after") throw new Error("route failed after replace");
      },
      restoreRoute,
      commit: (original, copy, active) =>
        commit(original, copy, active, options.commit ?? "success"),
      restore,
      publish: (copy) => {
        calls.push("publish");
        published.push(copy.designId);
      },
    },
  });

  return {
    coordinator,
    local,
    calls,
    published,
    authority,
    capture,
    begin,
    run,
    getRoute: () => clone(route),
    setRoute(identity: string) {
      route = { designId: routeDesignId(identity), identity };
    },
    completeOldWrite,
    completeRequestedLoad,
    queueCopiedWrite,
    get copiedWrites() { return copiedWrites; },
    get oldWriteCompletions() { return oldWriteCompletions; },
  };
}

function resolvedCopy(id = "design-copy", revision: string | null = COPY_REVISION) {
  return Promise.resolve({ id, updatedAt: revision });
}

async function verifyHappyPathAndConcurrency() {
  const harness = createHarness();
  const snapshot = harness.capture();
  const sourcePersistenceEpoch = snapshot.local.persistenceEpoch;
  const sourceRequestedEpoch = snapshot.local.requestedLoadEpoch;
  const result = await harness.run(
    harness.begin("conflict-1"),
    snapshot,
    resolvedCopy(),
  );
  assert.deepEqual(result, {
    status: "activated",
    copy: { designId: "design-copy", revision: COPY_REVISION },
  });
  assert.deepEqual(harness.local.baseline, {
    designId: "design-copy",
    revision: COPY_REVISION,
    fingerprint: "fingerprint-original",
  });
  assert.deepEqual(harness.local.writeIdentity, {
    designId: "design-copy",
    revision: COPY_REVISION,
  });
  assert.equal(harness.local.visibleDesignId, "design-copy");
  assert.equal(harness.local.revision, COPY_REVISION);
  assert.deepEqual(harness.published, ["design-copy"]);
  assert.ok(
    harness.calls.indexOf("route:replace") < harness.calls.indexOf("baseline:commit") &&
      harness.calls.indexOf("baseline:commit") < harness.calls.indexOf("publish"),
    "Activation must route, commit local authority, then publish side effects.",
  );
  const copiedUrl = new URL(harness.getRoute().identity, "http://design-route.local");
  assert.equal(copiedUrl.searchParams.get("designId"), "design-copy");
  assert.equal(copiedUrl.searchParams.get("mode"), "designer");
  assert.equal(copiedUrl.searchParams.get("view"), "2d");
  assert.equal(copiedUrl.searchParams.get("workspace"), "furnish");
  assert.equal(copiedUrl.searchParams.get("utm_source"), "live");
  assert.equal(copiedUrl.hash, "#plan");

  harness.completeRequestedLoad(sourceRequestedEpoch);
  assert.equal(harness.local.visibleDesignId, "design-copy");
  harness.completeOldWrite(sourcePersistenceEpoch);
  assert.equal(harness.oldWriteCompletions, 0);
  assert.equal(harness.local.revision, COPY_REVISION);
  harness.queueCopiedWrite(COPY_REVISION, "fingerprint-original");
  assert.equal(harness.copiedWrites, 1);
}

async function verifyAtomicFailures() {
  for (const scenario of [
    { label: "baseline preflight rejection", options: { preflight: false } },
    { label: "route replacement throw", options: { routeFailure: "before" as const } },
    { label: "route partial throw", options: { routeFailure: "after" as const } },
    { label: "local commit rejection", options: { commit: "reject" as const } },
    { label: "local commit throw", options: { commit: "throw" as const } },
  ]) {
    const harness = createHarness();
    const snapshot = harness.capture();
    const originalRoute = harness.getRoute();
    const result = await harness.run(
      harness.begin(scenario.label),
      snapshot,
      resolvedCopy(),
      scenario.options,
    );
    assert.equal(result.status, "copy_created_not_activated", scenario.label);
    assert.deepEqual(harness.local, snapshot.local, scenario.label);
    assert.deepEqual(harness.getRoute(), originalRoute, scenario.label);
    assert.deepEqual(harness.published, [], scenario.label);
    assert.equal(harness.copiedWrites, 0, scenario.label);
  }

  for (const [id, revision] of [
    ["", COPY_REVISION],
    ["   ", COPY_REVISION],
    ["design-original", COPY_REVISION],
    ["design-copy", null],
    ["design-copy", "malformed"],
  ] as const) {
    const harness = createHarness();
    const snapshot = harness.capture();
    const originalRoute = harness.getRoute();
    const result = await harness.run(
      harness.begin(`invalid-${String(id)}-${String(revision)}`),
      snapshot,
      resolvedCopy(id, revision),
    );
    assert.equal(result.status, "copy_created_not_activated");
    assert.deepEqual(harness.local, snapshot.local);
    assert.deepEqual(harness.getRoute(), originalRoute);
    assert.deepEqual(harness.published, []);
  }
}

async function verifySupersession() {
  for (const change of [
    (harness: ReturnType<typeof createHarness>) => harness.coordinator.invalidate(),
    (harness: ReturnType<typeof createHarness>) =>
      harness.setRoute("/design?designId=design-other&view=3d"),
    (harness: ReturnType<typeof createHarness>) =>
      harness.setRoute("/design?designId=design-back&view=2d"),
    (harness: ReturnType<typeof createHarness>) => {
      harness.local.documentEpoch += 1;
      harness.local.fingerprint = "replacement-document";
    },
    (harness: ReturnType<typeof createHarness>) => {
      harness.local.visibleDesignId = "design-other";
    },
  ]) {
    const harness = createHarness();
    const completion = deferred<{ id: string; updatedAt: string | null }>();
    const snapshot = harness.capture();
    const pending = harness.run(
      harness.begin(`supersession-${harness.calls.length}`),
      snapshot,
      completion.promise,
    );
    await Promise.resolve();
    change(harness);
    completion.resolve({ id: "design-copy", updatedAt: COPY_REVISION });
    const result = await pending;
    assert.equal(result.status, "superseded");
    assert.deepEqual(harness.published, []);
    assert.equal(harness.calls.includes("route:replace"), false);
  }

  const liveContext = createHarness();
  const completion = deferred<{ id: string; updatedAt: string | null }>();
  const pending = liveContext.run(
    liveContext.begin("live-context"),
    liveContext.capture(),
    completion.promise,
  );
  await Promise.resolve();
  liveContext.setRoute(
    "/design?designId=design-original&mode=designer&view=3d&workspace=design&campaign=new#latest",
  );
  completion.resolve({ id: "design-copy", updatedAt: COPY_REVISION });
  assert.equal((await pending).status, "activated");
  const finalUrl = new URL(liveContext.getRoute().identity, "http://design-route.local");
  assert.equal(finalUrl.searchParams.get("view"), "3d");
  assert.equal(finalUrl.searchParams.get("campaign"), "new");
  assert.equal(finalUrl.hash, "#latest");

  const invalidatedDuringCommit = createHarness();
  const original = invalidatedDuringCommit.capture();
  const originalRoute = invalidatedDuringCommit.getRoute();
  const invalidated = await invalidatedDuringCommit.run(
    invalidatedDuringCommit.begin("invalidate-during-commit"),
    original,
    resolvedCopy(),
    { commit: "invalidate" },
  );
  assert.equal(invalidated.status, "copy_created_not_activated");
  assert.deepEqual(invalidatedDuringCommit.local, original.local);
  assert.deepEqual(invalidatedDuringCommit.getRoute(), originalRoute);
  assert.deepEqual(invalidatedDuringCommit.published, []);
}

async function verifyOperationOrderingAndRemount() {
  for (const completeNewerFirst of [false, true]) {
    const harness = createHarness();
    const firstCompletion = deferred<{ id: string; updatedAt: string | null }>();
    const secondCompletion = deferred<{ id: string; updatedAt: string | null }>();
    const first = harness.run(
      harness.begin(`first-${completeNewerFirst}`),
      harness.capture(),
      firstCompletion.promise,
    );
    await Promise.resolve();
    const second = harness.run(
      harness.begin(`second-${completeNewerFirst}`),
      harness.capture(),
      secondCompletion.promise,
    );
    if (completeNewerFirst) {
      secondCompletion.resolve({ id: "design-newer", updatedAt: COPY_REVISION });
      assert.equal((await second).status, "activated");
      firstCompletion.resolve({ id: "design-older", updatedAt: COPY_REVISION });
      assert.equal((await first).status, "superseded");
    } else {
      firstCompletion.resolve({ id: "design-older", updatedAt: COPY_REVISION });
      assert.equal((await first).status, "superseded");
      secondCompletion.resolve({ id: "design-newer", updatedAt: COPY_REVISION });
      assert.equal((await second).status, "activated");
    }
    assert.equal(harness.local.visibleDesignId, "design-newer");
    assert.deepEqual(harness.published, ["design-newer"]);
  }

  const duplicateHarness = createHarness();
  const duplicateAuthority = duplicateHarness.authority();
  const duplicateOperation = duplicateHarness.coordinator.begin({
    conflictKey: "duplicate",
    authority: duplicateAuthority,
  });
  assert.ok(duplicateOperation);
  const duplicateCompletion = deferred<{ id: string; updatedAt: string | null }>();
  const duplicatePending = duplicateHarness.run(
    duplicateOperation,
    duplicateHarness.capture(),
    duplicateCompletion.promise,
  );
  await Promise.resolve();
  assert.equal(duplicateHarness.coordinator.begin({
    conflictKey: "duplicate",
    authority: duplicateAuthority,
  }), null);
  assert.equal(
    duplicateHarness.calls.filter((call) => call.startsWith("copy:create:")).length,
    1,
  );
  duplicateCompletion.resolve({ id: "design-copy", updatedAt: COPY_REVISION });
  assert.equal((await duplicatePending).status, "activated");

  const repeated = createHarness();
  assert.equal((await repeated.run(
    repeated.begin("copy-original"),
    repeated.capture(),
    resolvedCopy("design-copy-1"),
  )).status, "activated");
  const repeatedSnapshot = repeated.capture();
  assert.equal((await repeated.run(
    repeated.begin("copy-from-copy"),
    repeatedSnapshot,
    resolvedCopy("design-copy-2", "2026-09-03T03:00:00.000Z"),
  )).status, "activated");
  assert.equal(repeated.local.visibleDesignId, "design-copy-2");
  assert.deepEqual(repeated.published, ["design-copy-1", "design-copy-2"]);

  const oldMount = createHarness();
  const oldCompletion = deferred<{ id: string; updatedAt: string | null }>();
  const oldPending = oldMount.run(
    oldMount.begin("old-mount"),
    oldMount.capture(),
    oldCompletion.promise,
  );
  oldMount.coordinator.invalidate();
  const newMount = createHarness();
  assert.equal((await newMount.run(
    newMount.begin("new-mount"),
    newMount.capture(),
    resolvedCopy("design-remounted-copy"),
  )).status, "activated");
  oldCompletion.resolve({ id: "design-stale-copy", updatedAt: COPY_REVISION });
  assert.equal((await oldPending).status, "superseded");
  assert.deepEqual(oldMount.published, []);
  assert.equal(newMount.local.visibleDesignId, "design-remounted-copy");
}

void Promise.all([
  verifyHappyPathAndConcurrency(),
  verifyAtomicFailures(),
  verifySupersession(),
  verifyOperationOrderingAndRemount(),
]).then(() => {
  console.log("design page cloud conflict-copy behavioral checks passed");
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
