import { performance } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";

const BUDGET_MS = 2_000;
const INTERVAL_MS = 50;

// One instance belongs to one cleanup invocation, including its final DROP guard.
// SQL already in flight is deliberately not cancelled when this deadline expires.
export function createDatabaseCleanupObservation({
  mode, assertIdentity, record, now = () => performance.now(),
  sleep = (milliseconds) => setTimeout(milliseconds),
}) {
  const origin = now();
  const state = {
    mode, budgetMs: BUDGET_MS, intervalMs: INTERVAL_MS,
    budgetStartedAtMs: null, elapsedMs: 0, remainingMs: BUDGET_MS,
    outcome: "observing", finalObservedCount: null, events: [],
  };
  const timestamp = () => Math.max(0, now() - origin);
  const remaining = () => state.budgetStartedAtMs === null ? BUDGET_MS
    : Math.max(0, BUDGET_MS - (timestamp() - state.budgetStartedAtMs));
  function publish(kind, guard, details = {}, atMs = timestamp()) {
    state.events.push({ kind, guard, atMs, ...details });
    state.elapsedMs = state.budgetStartedAtMs === null ? 0 : atMs - state.budgetStartedAtMs;
    state.remainingMs = Math.max(0, BUDGET_MS - state.elapsedMs);
    record(structuredClone(state));
  }
  async function identity(guard, waiting, observedAtMs = null) {
    try {
      await assertIdentity({ waiting });
      if (waiting && state.budgetStartedAtMs === null) state.budgetStartedAtMs = observedAtMs;
      publish("identity-verified", guard, { waiting });
    } catch (error) {
      state.outcome = "failed";
      publish("identity-failed", guard);
      throw error;
    }
  }
  async function observe(readSessions, guard) {
    let initial = true;
    while (true) {
      // The initial observation is mandatory even if the shared budget expired.
      const atMs = timestamp();
      if (!initial && state.budgetStartedAtMs !== null && atMs - state.budgetStartedAtMs >= BUDGET_MS) {
        state.outcome = "expired";
        publish("expired", guard);
        throw new Error("database cleanup autovacuum observation budget expired");
      }
      state.outcome = "observing";
      let sessions;
      try {
        const pending = readSessions();
        publish(initial ? "guard-start" : "poll-start", guard, {}, atMs);
        initial = false;
        sessions = await pending;
      } catch (error) {
        state.outcome = "failed";
        publish("query-failed", guard);
        throw error;
      }
      const observedAtMs = timestamp();
      state.finalObservedCount = sessions.length;
      state.outcome = sessions.length === 0 ? "empty" : "observing";
      publish("observation", guard, { sessions }, observedAtMs);
      if (sessions.length === 0) {
        if (state.budgetStartedAtMs !== null) await identity(guard, false);
        return sessions;
      }
      if (sessions.some((session) => session.backendType !== "autovacuum worker")) {
        state.outcome = "refused";
        publish("refused", guard);
        throw new Error("database cleanup refuses active sessions other than explicit autovacuum workers");
      }
      await identity(guard, true, observedAtMs);
      if (remaining() <= 0) {
        state.outcome = "expired";
        publish("expired", guard);
        throw new Error("database cleanup autovacuum observation budget expired");
      }
      state.outcome = "waiting";
      const sleepAtMs = timestamp();
      const requestedMs = Math.min(INTERVAL_MS, Math.max(0, BUDGET_MS - (sleepAtMs - state.budgetStartedAtMs)));
      if (requestedMs <= 0) continue;
      const pendingSleep = sleep(requestedMs);
      publish("sleep", guard, { requestedMs }, sleepAtMs);
      await pendingSleep;
    }
  }
  return { observe, beforeDrop: () => identity("pre-drop", false) };
}

// Historical evidence may omit this field. If present, its polling policy and
// chronology are validated without imposing a timeout on in-flight SQL.
export function databaseCleanupObservationIssues(invocations) {
  if (invocations === undefined) return [];
  if (!Array.isArray(invocations)) return ["database cleanup observations must be an array"];
  return invocations.flatMap((state) => validObservationState(state)
    ? [] : ["database cleanup observation evidence is incoherent"]);
}

function validObservationState(state) {
  if (!state || !["normal", "abort"].includes(state.mode) || state.budgetMs !== BUDGET_MS ||
      state.intervalMs !== INTERVAL_MS || !Array.isArray(state.events) || !state.events.length ||
      !["observing", "empty", "waiting", "refused", "expired", "failed"].includes(state.outcome)) return false;
  const history = { previous: 0, start: null, sessions: null, observedAt: null, verified: false, guards: new Set(), activeGuard: null, previousKind: null };
  for (const event of state.events) {
    if (!validObservationEvent(event, history)) return false;
  }
  const count = history.sessions?.length ?? null;
  const elapsed = history.start === null ? 0 : history.previous - history.start;
  if (state.budgetStartedAtMs !== history.start || state.finalObservedCount !== count ||
      state.elapsedMs !== elapsed || state.remainingMs !== Math.max(0, BUDGET_MS - elapsed)) return false;
  const lastKind = state.events.at(-1).kind;
  if (state.outcome === "empty") return count === 0 && ["observation", "identity-verified"].includes(lastKind);
  if (state.outcome === "expired") return lastKind === "expired" && count > 0 && state.remainingMs === 0;
  if (state.outcome === "waiting") return lastKind === "sleep";
  if (state.outcome === "failed") return ["identity-failed", "query-failed"].includes(lastKind);
  if (state.outcome === "refused") return lastKind === "refused" && count > 0 &&
    history.sessions.some((session) => session.backendType !== "autovacuum worker");
  return ["guard-start", "poll-start", "observation", "identity-verified"].includes(lastKind);
}

function validObservationEvent(event, history) {
  if (!event || !Number.isFinite(event.atMs) || event.atMs < history.previous ||
      !["release", "pre-drop"].includes(event.guard)) return false;
  history.previous = event.atMs;
  if (event.kind === "guard-start") {
    if (history.guards.has(event.guard)) return false;
    history.guards.add(event.guard);
    history.activeGuard = event.guard;
  } else if (event.kind !== "query-failed" && history.activeGuard !== event.guard) return false;
  if (event.kind === "observation") {
    if (!Array.isArray(event.sessions) || event.sessions.some((session) =>
      !session || typeof session !== "object" || Array.isArray(session) ||
      (session.backendType !== undefined && session.backendType !== null && typeof session.backendType !== "string"))) return false;
    history.sessions = event.sessions;
    history.observedAt = event.atMs;
    history.verified = false;
  } else if (event.kind === "identity-verified") {
    if (typeof event.waiting !== "boolean") return false;
    if (event.waiting) {
      if (!history.sessions?.length || history.sessions.some((session) => session.backendType !== "autovacuum worker")) return false;
      history.start ??= history.observedAt;
    }
    history.verified = true;
  } else if (!["guard-start", "poll-start", "query-failed", "identity-failed", "expired", "refused", "sleep"].includes(event.kind)) return false;
  if (["sleep", "poll-start"].includes(event.kind)) {
    if (event.kind === "poll-start" && history.previousKind !== "sleep") return false;
    const left = history.start === null ? 0 : BUDGET_MS - (event.atMs - history.start);
    if (left <= 0 || !history.verified || !history.sessions?.length ||
        history.sessions.some((session) => session.backendType !== "autovacuum worker")) return false;
    if (event.kind === "sleep" && (!Number.isFinite(event.requestedMs) ||
        event.requestedMs <= 0 || event.requestedMs > Math.min(INTERVAL_MS, left))) return false;
  }
  history.previousKind = event.kind;
  return true;
}

// Automatic fallbacks must not replay a failed cleanup or retry its DROP. The
// explicit cleanup owner remains available later after conditions have changed.
export function assertAutomaticDatabaseCleanupMayStart(evidence, cause = null) {
  if (evidence.currentState === "failed" && evidence.sessions?.cleanupObservations?.length > 0) {
    throw new Error("Retain failed cleanup observation; automatic cleanup replay is prohibited", { cause });
  }
}
