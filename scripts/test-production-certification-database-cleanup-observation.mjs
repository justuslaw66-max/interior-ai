import assert from "node:assert/strict";
import {
  createDatabaseCleanupObservation,
  assertAutomaticDatabaseCleanupMayStart,
  databaseCleanupObservationIssues,
} from "./production-certification-database-cleanup-observation.mjs";

const worker = { pid: 123, backendType: "autovacuum worker", clientAddress: null };
function controlled(identity = async () => {}) {
  const clock = { time: 0, sleeps: [], snapshots: [], identities: 0 };
  clock.observer = createDatabaseCleanupObservation({
    mode: "abort", now: () => clock.time,
    sleep: async (ms) => { clock.sleeps.push(ms); clock.time += ms; },
    assertIdentity: async (details) => { clock.identities++; await identity(clock, details); },
    record: (snapshot) => {
      assert.deepEqual(databaseCleanupObservationIssues([snapshot]), []);
      clock.snapshots.push(snapshot);
    },
  });
  return clock;
}
const latest = (clock) => clock.snapshots.at(-1);

async function completionAndDeadlineCoverage() {
  const empty = controlled();
  await empty.observer.observe(async () => [], "release");
  await empty.observer.observe(async () => [], "pre-drop");
  await empty.observer.beforeDrop();
  assert.deepEqual(empty.sleeps, []);
  assert.equal(latest(empty).budgetStartedAtMs, null);

  const natural = controlled();
  let calls = 0;
  await natural.observer.observe(async () => calls++ === 0 ? [worker] : [], "release");
  assert.deepEqual(natural.sleeps, [50]);
  assert.equal(latest(natural).finalObservedCount, 0);
  assert.deepEqual(latest(natural).events.find((event) => event.sessions?.length).sessions, [worker]);

  const persistent = controlled();
  let polls = 0;
  await assert.rejects(persistent.observer.observe(async () => { polls++; return [worker]; }, "release"), /budget expired/);
  assert.equal(persistent.time, 2000);
  assert.equal(polls, 40);
  assert.equal(persistent.sleeps.length, 40);
  assert.equal(latest(persistent).outcome, "expired");
  assert.throws(() => assertAutomaticDatabaseCleanupMayStart({ currentState: "failed", sessions: {
    cleanupObservations: [latest(persistent)],
  } }), /automatic cleanup replay/);

  const finalOnly = controlled();
  await finalOnly.observer.observe(async () => [], "release");
  let finalCalls = 0;
  await finalOnly.observer.observe(async () => finalCalls++ === 0 ? [worker] : [], "pre-drop");
  assert.equal(finalCalls, 2);
  assert.deepEqual(finalOnly.sleeps, [50]);

  const shared = controlled();
  let releaseCalls = 0;
  await shared.observer.observe(async () => releaseCalls++ === 0 ? [worker] : [], "release");
  shared.time = 1990;
  let sharedFinalCalls = 0;
  await assert.rejects(shared.observer.observe(async () => { sharedFinalCalls++; return [worker]; }, "pre-drop"), /budget expired/);
  assert.equal(sharedFinalCalls, 1);
  assert.deepEqual(shared.sleeps, [50, 10]);
  assert.equal(latest(shared).budgetStartedAtMs, 0);
}

async function refusalAndFailureCoverage() {
  for (const sessions of [
    [{ ...worker, backendType: "client backend" }],
    [{ ...worker, backendType: null }], [{ pid: 124 }],
    [{ ...worker, backendType: "parallel worker" }],
    [worker, { ...worker, pid: 125, backendType: "client backend" }],
  ]) {
    const clock = controlled();
    await assert.rejects(clock.observer.observe(async () => sessions, "release"), /refuses active sessions/);
    assert.equal(clock.identities, 0);
    assert.deepEqual(clock.sleeps, []);
    assert.deepEqual(latest(clock).events.find((event) => event.kind === "observation").sessions, sessions);
  }
  for (const reason of ["database replacement", "missing ownership", "role replacement"]) {
    const clock = controlled(async () => { throw new Error(reason); });
    await assert.rejects(clock.observer.observe(async () => [worker], "release"), new RegExp(reason));
    assert.deepEqual(clock.sleeps, []);
    assert.equal(latest(clock).events.at(-1).kind, "identity-failed");
    assert.equal(latest(clock).finalObservedCount, 1);
  }
  const later = controlled(async (clock) => {
    if (clock.identities === 2) throw new Error("later identity failure");
  });
  await assert.rejects(later.observer.observe(async () => [worker], "release"), /later identity failure/);
  assert.equal(latest(later).events.filter((event) => event.sessions?.length).length, 2);
  assert.equal(latest(later).elapsedMs, 50);
}

async function inFlightCoverage() {
  for (const result of [[], [worker]]) {
    const clock = controlled();
    let calls = 0;
    const operation = clock.observer.observe(async () => {
      if (calls++ === 0) return [worker];
      clock.time = 2100;
      return result;
    }, "release");
    if (result.length) await assert.rejects(operation, /budget expired/);
    else await operation;
    assert.equal(calls, 2);
    assert.deepEqual(clock.sleeps, [50]);
    assert.equal(latest(clock).elapsedMs, 2100);
    // Mandatory final observation still runs, without another sleep or budget.
    await clock.observer.observe(async () => [], "pre-drop");
    assert.deepEqual(clock.sleeps, [50]);
    assert.equal(latest(clock).budgetStartedAtMs, 0);
  }
  const slowIdentity = controlled(async (clock) => { clock.time += 2100; });
  await assert.rejects(slowIdentity.observer.observe(async () => [worker], "release"), /budget expired/);
  assert.deepEqual(slowIdentity.sleeps, []);
  assert.equal(latest(slowIdentity).elapsedMs, 2100);

  const queryFailure = controlled();
  let calls = 0;
  await assert.rejects(queryFailure.observer.observe(async () => {
    if (calls++ === 0) return [worker];
    throw new Error("query failed");
  }, "release"), /query failed/);
  assert.equal(latest(queryFailure).events.at(-1).kind, "query-failed");
  assert.equal(latest(queryFailure).finalObservedCount, 1);
  for (const kind of ["identity", "query"]) {
    const late = controlled(async (clock) => {
      if (kind === "identity" && clock.identities > 1) {
        clock.time = 2100; throw new Error("late identity error");
      }
    });
    let calls = 0;
    await assert.rejects(late.observer.observe(async () => {
      if (calls++ > 0 && kind === "query") {
        late.time = 2100; throw new Error("late query error");
      }
      return [worker];
    }, "release"), /late .* error/);
    const state = latest(late);
    assert.equal(state.outcome, "failed");
    assert.equal(state.remainingMs, 0);
    const snapshots = late.snapshots.length;
    assert.throws(() => assertAutomaticDatabaseCleanupMayStart({ currentState: "failed", sessions: {
      cleanupObservations: [state],
    } }), /automatic cleanup replay/);
    assert.equal(late.snapshots.length, snapshots);
    assert.equal(calls, 2);
    assert.deepEqual(late.sleeps, [50]);
  }
  assert.doesNotThrow(() => assertAutomaticDatabaseCleanupMayStart({ currentState: "failed", sessions: {} }));
}

export async function verifyDatabaseCleanupObservation() {
  await completionAndDeadlineCoverage();
  await refusalAndFailureCoverage();
  await inFlightCoverage();
  assert.deepEqual(databaseCleanupObservationIssues(undefined), []);
  assert.ok(databaseCleanupObservationIssues({}).length);
  const clock = controlled();
  let calls = 0;
  await clock.observer.observe(async () => calls++ === 0 ? [worker] : [], "release");
  for (const tamper of [
    (state) => { state.budgetMs = 4000; },
    (state) => { state.budgetStartedAtMs = 50; state.elapsedMs = 0; state.remainingMs = 2000; },
    (state) => { state.events.find((event) => event.sessions?.length).sessions = [null]; },
    (state) => { state.events.find((event) => event.sessions?.length).sessions = 1; },
    (state) => { state.finalObservedCount = 1; },
    (state) => { state.events.find((event) => event.kind === "sleep").requestedMs = 51; },
    (state) => { state.events.find((event) => event.sessions?.length).sessions[0].backendType = null; },
    (state) => { state.events.find((event) => event.kind === "poll-start").atMs = 2001; },
    (state) => { state.events.find((event) => event.kind === "poll-start").kind = "guard-start"; },
  ]) {
    const copy = structuredClone(latest(clock)); tamper(copy);
    assert.ok(databaseCleanupObservationIssues([copy]).length);
  }
}

export async function verifyCleanupLifecycleCheckpoints({
  fixture, FakeDatabaseAdapter, repositoryRoot, planCertificationDatabase,
  provisionCertificationDatabase, abortCertificationDatabase,
  readCertificationDatabaseLifecycle, removeFixture,
}) {
  for (const scenario of ["later-database-replacement", "later-role-replacement", "drop-failure", "final-worker"]) {
    const current = fixture({ id: `cleanup-observation-${scenario}` });
    const adapter = new FakeDatabaseAdapter();
    const options = { repositoryRoot, environment: current.environment, adapter };
    try {
      await planCertificationDatabase({ ...options, nonce: "f".repeat(32), qualificationFixture: true });
      await provisionCertificationDatabase(options);
      let reads = 0;
      let dropping = false;
      const originalDrop = adapter.dropDatabase.bind(adapter);
      adapter.targetSessions = async () => {
        if (scenario === "final-worker" && !dropping) return [];
        reads++;
        if (reads === 1) return [worker];
        if (scenario === "later-database-replacement") adapter.databaseOid++;
        if (scenario === "later-role-replacement") adapter.roleOid++;
        return [];
      };
      let dropCalls = 0;
      adapter.dropDatabase = async (...args) => {
        dropping = true; dropCalls++;
        if (scenario === "drop-failure") {
          await args[2].observe(() => adapter.targetSessions(), "pre-drop");
          await args[2].beforeDrop();
          throw new Error("single DROP failed password=observation-secret");
        }
        return originalDrop(...args);
      };
      const operation = abortCertificationDatabase({ ...options, originalFailure: {
        classification: "PRODUCT_ASSERTION_FAILURE", stage: "browser-owners", consumedSubstantiveGate: true,
      } });
      if (scenario === "final-worker") await operation;
      else await assert.rejects(operation, /identity changed|replacement|single DROP failed/);
      const { evidence } = readCertificationDatabaseLifecycle(options);
      assert.equal(evidence.failure.classification, "PRODUCT_ASSERTION_FAILURE");
      assert.doesNotMatch(JSON.stringify(evidence), /observation-secret/);
      const observation = evidence.sessions.cleanupObservations.at(-1);
      assert.deepEqual(databaseCleanupObservationIssues([observation]), []);
      assert.ok(observation.events.some((event) => event.sessions?.[0]?.backendType === "autovacuum worker"));
      assert.ok(observation.elapsedMs >= 50);
      assert.equal(dropCalls, scenario.startsWith("later-") ? 0 : 1);
      assert.deepEqual(adapter.terminated, []);
      assert.deepEqual(adapter.unrelatedSessions, [{ database: "postgres", pid: 9001 }]);
      if (scenario === "final-worker") {
        assert.equal(evidence.cleanup.failedRunRehabilitated, false);
        assert.equal(evidence.currentState, "abort-absence-verified");
        assert.equal(adapter.exists, false);
      } else {
        assert.equal(adapter.exists, true);
        assert.equal(evidence.currentState, "failed");
        assert.ok(evidence.cleanupFailure);
        if (scenario !== "drop-failure") assert.equal(observation.events.at(-1).kind, "identity-failed");
      }
    } finally { removeFixture(current.root); }
  }
}

export async function exhaustedCleanupObservationFixture() {
  const clock = controlled();
  await assert.rejects(clock.observer.observe(async () => [worker], "release"), /budget expired/);
  return latest(clock);
}
