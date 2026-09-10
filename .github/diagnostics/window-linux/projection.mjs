import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ document: 32 * 1024 * 1024, artifact: 100 * 1024 * 1024, line: 128 * 1024, events: 12000 });
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const numeric = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
const member = (value, allowed) => allowed.includes(value) ? value : null;
const numbers = (value, keys) => Object.fromEntries(keys.map(key => [key, numeric(value?.[key])]));
const CASES = new Map([
  ['furnished template remains stable without a render loop', 'furnished'],
  ['health and catalog endpoints report ready', 'health'],
]);
const OUTCOMES = ['passed', 'failed', 'timedOut', 'skipped', 'interrupted', 'expected', 'unexpected', 'flaky', 'timed-out', 'stalled', 'terminal-error'];
const FAILURE_KINDS = ['nested-operation-timeout', 'phase-timeout', 'no-progress-watchdog', 'terminal-lifecycle-error', 'assertion-failure', 'unexpected-error'];
export const SIGNALS = ['SIGABRT', 'SIGALRM', 'SIGBUS', 'SIGFPE', 'SIGHUP', 'SIGILL', 'SIGINT', 'SIGKILL', 'SIGPIPE', 'SIGQUIT', 'SIGSEGV', 'SIGTERM', 'SIGTRAP', 'SIGUSR1', 'SIGUSR2', 'SIGXCPU', 'SIGXFSZ'];
const CLASSIFICATIONS = ['PRODUCT_ASSERTION_FAILURE', 'PRECONDITION_ORCHESTRATION_FAILURE', 'INFRASTRUCTURE_TRANSIENT'];
const exact = (value, keys) => value && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const list = value => Array.isArray(value) ? value : [];

export function createProjection(contracts, checkpoints = [], validators = {}) {
  const phases = Object.keys(contracts);
  const operations = [...new Set(Object.values(contracts).flatMap(value => [...value.operations, ...value.nestedOperations].map(item => item.name)))];
  function failure(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      failureKind: member(value.failureKind, FAILURE_KINDS),
      phaseId: member(value.phaseId, phases), operationId: member(value.operationId, operations),
      operationOutcome: member(value.operationOutcome, OUTCOMES),
      ...numbers(value, ['phaseElapsedMs', 'phaseBudgetMs', 'operationElapsedMs', 'operationElapsedPreciseMs', 'operationBudgetMs', 'attemptTimeoutMs', 'remainingAtAttemptStartMs', 'watchdogBudgetMs']),
      deadlineReached: boolean(value.deadlineReached), progressObserved: boolean(value.progressObserved),
      lastSafeCheckpoint: member(value.lastSafeCheckpoint, checkpoints),
      originalCauseName: member(value.originalCause?.name, ['Error', 'AssertionError', 'RuntimeSmokeOperationTimeoutError', 'RuntimeSmokePhaseTimeoutError', 'RuntimeSmokeNoProgressError', 'RuntimeSmokeTerminalError']),
      freeTextOmitted: true,
    };
  }
  function report(value) {
    const cases = []; let omitted = 0; let visited = 0;
    function bounded(value, maximum) {
      if (!Array.isArray(value)) { omitted++; return []; }
      omitted += Math.max(0, value.length - maximum); return value.slice(0, maximum);
    }
    function walk(suites, depth = 0) {
      if (!Array.isArray(suites) || depth > 12 || visited > 1000) { omitted++; return; }
      for (const suite of suites.slice(0, 100)) {
        visited++;
        for (const spec of bounded(suite?.specs ?? [], 100)) {
          const id = CASES.get(spec?.title);
          if (!id || cases.length >= 20) { omitted++; continue; }
          for (const test of bounded(spec.tests, 10)) {
            if (!test || cases.length >= 20) { omitted++; continue; }
            cases.push({ id, expectedStatus: member(test.expectedStatus, OUTCOMES), status: member(test.status, OUTCOMES),
              attempts: list(test.results).slice(0, 10).map(result => ({
                ...numbers(result, ['retry', 'workerIndex', 'parallelIndex', 'duration']), status: member(result.status, OUTCOMES),
                errorCount: Array.isArray(result.errors) ? result.errors.length : null,
                attachmentCount: Array.isArray(result.attachments) ? result.attachments.length : null,
                rawTextAndAttachmentsOmitted: true,
              })), omittedAttemptCount: Math.max(0, (test.results?.length ?? 0) - 10),
            });
          }
        }
        if (suite?.suites?.length) walk(suite.suites, depth + 1);
      }
      omitted += Math.max(0, suites.length - 100);
    }
    walk(value.suites);
    const inventoryValid = cases.length === 2 && ['furnished', 'health'].every(id => cases.filter(item => item.id === id).length === 1) && cases.every(item => item.attempts.length === 1 && item.attempts[0].retry === 0 && item.omittedAttemptCount === 0) && omitted === 0;
    return { stats: numbers(value.stats, ['expected', 'unexpected', 'flaky', 'skipped', 'duration']), cases, omitted, inventoryValid,
      reportErrorCount: Array.isArray(value.errors) ? value.errors.length : null, failure: failure(value.runtimeSmokeFailure), rawFieldsOmitted: true };
  }
  function timings(value) {
    if (value.schema !== 'interior-ai.runtime-smoke-phase-timings.v3') throw new Error('timing-schema');
    const entries = Array.isArray(value.phases) ? value.phases : [];
    const recognized = entries.filter(phase => phases.includes(phase?.name));
    return { complete: boolean(value.complete), ...numbers(value, ['wholeTestTimeoutMs', 'sequentialPhaseBudgetMs']),
      phases: recognized.slice(0, 14).map(phase => ({
        name: phase.name, outcome: member(phase.outcome, OUTCOMES),
        ...numbers(phase, ['startTimeRelativeMs', 'elapsedMs', 'timeoutBudgetMs', 'performanceWarningThresholdMs']),
        performanceWarningExceeded: boolean(phase.performanceWarningExceeded), failure: failure(phase.failure),
        checkpoints: list(phase.progressCheckpoints).slice(0, 1000).map(checkpoint => ({ name: member(checkpoint.name, checkpoints), elapsedMs: numeric(checkpoint.elapsedMs) })),
        omittedCheckpointCount: list(phase.progressCheckpoints).slice(0, 1000).filter(checkpoint => !checkpoints.includes(checkpoint?.name)).length + Math.max(0, list(phase.progressCheckpoints).length - 1000),
      })), omittedPhaseCount: entries.length - Math.min(14, recognized.length), duplicatePhaseCount: recognized.length - new Set(recognized.map(phase => phase.name)).size, failure: failure(value.failure), rawFieldsOmitted: true };
  }
  function event(value) {
    if (!value || typeof value !== 'object' || Object.keys(value).includes('__proto__')) return null;
    if (value.schema === 'interior-ai.window-rendering-attribution.v1') {
      const safe = validators.projectWindowRenderObservation?.(value);
      return safe ? { kind: 'window-render', ...safe } : { kind: 'window-render-invalid' };
    }
    if (value.schema === 'interior-ai.window-rendering-attribution-invalid.v1') return { kind: 'window-render-invalid' };
    if (value.schema === 'interior-ai.window-render-clock.v1') {
      if (!exact(value, ['schema','timeOriginMs','observedAtMs']) || numeric(value.timeOriginMs) === null || numeric(value.observedAtMs) === null) return { kind:'window-render-invalid' };
      return { kind:'window-clock', timeOriginMs:value.timeOriginMs, observedAtMs:value.observedAtMs };
    }
    if (value.schema === 'interior-ai.window-render-admission.v1') {
      if (!exact(value,['schema','phaseName','stage']) || !phases.includes(value.phaseName) || !['reload-start','admission-start','admission-ready'].includes(value.stage)) return { kind:'window-render-invalid' };
      return { kind:'window-admission', phaseName:value.phaseName, stage:value.stage };
    }
    if (value.schema === 'interior-ai.runtime-smoke-browser-heartbeat.v2') {
      try { validators.projectRuntimeSmokeBrowserHeartbeat(value); } catch { return null; }
      const numericKeys = ['sequence', 'observedAtMs', 'eventLoopDelayMs', 'maximumEventLoopDelayMs', 'lastAnimationFrameDelayMs', 'maximumAnimationFrameDelayMs', 'lastAnimationFrameCadenceMs', 'rendererCalls', 'rendererCallDelta', 'rendererCallRateHz', 'activeAnimationCount', 'controlEventCount', 'webglContextLostCount', 'webglContextRestoredCount'];
      const enumKeys = ['kind', 'visibilityState', 'documentReadyState', 'lifecycleState', 'controlActivity'];
      if (Object.keys(value).some(key => !['schema', ...numericKeys, ...enumKeys].includes(key))) return null;
      return { kind: 'heartbeat', ...numbers(value, numericKeys), heartbeatKind: member(value.kind, ['started', 'interval']),
        visibility: member(value.visibilityState, ['visible', 'hidden', 'prerender']), documentState: member(value.documentReadyState, ['loading', 'interactive', 'complete']),
        lifecycle: member(value.lifecycleState, ['active', 'frozen', 'pagehide']), control: member(value.controlActivity, ['idle', 'pointer-active']), animationMeaning: 'running-or-pending-document-animations' };
    }
    if (!phases.includes(value.phaseName)) return null;
    if (value.schema === 'interior-ai.runtime-smoke-readiness-observation.v1') {
      if (!exact(value, ['schema', 'phaseName', 'responseTotal', 'responseRequired', 'requestTotal', 'browserErrorCount', 'safeReadinessSummary']) ||
          ['responseTotal', 'responseRequired', 'requestTotal', 'browserErrorCount'].some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)) return null;
      const summary = value.safeReadinessSummary;
      if (summary !== null && (!exact(summary, ['schema', 'reloadGeneration', 'registryVersion', 'activeSetHash', 'activeRequiredCount', 'includedModelCount', 'omittedModelCount', 'eventLoopDelayMs', 'cacheTotals', 'models']) || summary.schema !== 'interior-ai.glb-safe-readiness-summary.v1')) return null;
      return { kind: 'readiness', phase: value.phaseName, ...numbers(value, ['responseTotal', 'responseRequired', 'requestTotal', 'browserErrorCount']),
        summary: numbers(summary, ['reloadGeneration', 'registryVersion', 'activeRequiredCount', 'includedModelCount', 'omittedModelCount']),
        eventLoopDelayMs: numbers(summary?.eventLoopDelayMs, ['last', 'maximum']), modelsOmitted: true };
    }
    if (!operations.includes(value.operationName)) return null;
    if (!Number.isSafeInteger(value.requestId) || value.requestId <= 0) return null;
    if (value.schema === 'interior-ai.runtime-smoke-browser-callback-request.v1' && exact(value, ['schema', 'phaseName', 'operationName', 'requestId'])) return { kind: 'callback-request', phase: value.phaseName, operation: value.operationName, requestId: value.requestId };
    if (value.schema === 'interior-ai.runtime-smoke-browser-callback.v2' && exact(value, ['schema', 'phaseName', 'operationName', 'requestId', 'stage', 'hostObservedAfterMs'])) {
      try { validators.projectRuntimeSmokeBrowserCallbackMilestone({ schema: value.schema, phaseName: value.phaseName, operationName: value.operationName, requestId: value.requestId, stage: value.stage, observedAtMs: value.hostObservedAfterMs }); } catch { return null; }
      return { kind: 'callback-milestone', phase: value.phaseName, operation: value.operationName, requestId: value.requestId, stage: value.stage, hostObservedAfterMs: value.hostObservedAfterMs, clock: 'host-request-relative' };
    }
    if (value.schema === 'interior-ai.runtime-smoke-browser-callback-timing.v1' && exact(value, ['schema', 'phaseName', 'operationName', 'requestId', 'hostTiming', 'browserTiming', 'lastHeartbeat', 'mainThreadTelemetry'])) return { kind: 'callback-timing', phase: value.phaseName, operation: value.operationName, requestId: numeric(value.requestId),
      hostTiming: numbers(value.hostTiming, ['callbackEnteredAfterMs', 'snapshotCompletedAfterMs', 'callbackExitedAfterMs', 'serializationCompletedAfterMs', 'resultReceivedAfterMs']),
      browserTiming: numbers(value.browserTiming, ['callbackDurationMs', 'bodyStateComputationMs', 'serializationDurationMs']) };
    return null;
  }
  function attribution(value) {
    return { classification: member(value.failure?.classification, CLASSIFICATIONS), consumedSubstantiveGate: boolean(value.failure?.consumedSubstantiveGate),
      childStatus: numeric(value.child?.status), childSignal: member(value.child?.signal, SIGNALS), signalOmitted: value.child?.signal != null && !SIGNALS.includes(value.child.signal),
      spawnError: member(value.child?.spawnErrorClassification, ['child-spawn-error']), freeTextOmitted: true };
  }
  function ownerError(error) {
    return { classification: member(error?.classification, CLASSIFICATIONS), consumedSubstantiveGate: boolean(error?.consumedSubstantiveGate),
      childStatus: numeric(error?.childStatus), childSignal: member(error?.childSignal, SIGNALS), spawnError: member(error?.spawnErrorClassification, ['child-spawn-error']), freeTextOmitted: true };
  }
  return { report, timings, event, failure, attribution, ownerError };
}

export function projectCleanup(evidence, expected) {
  const db = evidence?.database?.name; const role = evidence?.privateBinding?.roleCreation;
  const roleName = evidence?.privateBinding?.roleName ?? role?.roleName;
  if (db !== expected.databaseName || evidence?.provisioning?.databaseOid !== expected.databaseOid || role?.roleOid !== expected.roleOid) throw new Error('cleanup-identity');
  if (roleName !== expected.roleName) throw new Error('cleanup-role-identity');
  const states = ['stable-absence-verified', 'abort-absence-verified', 'absence-verified'];
  const terminal = list(evidence.events).findLast(item => states.includes(item.state));
  if (terminal && terminal.state !== evidence.currentState) throw new Error('cleanup-terminal-incoherent');
  const details = terminal?.details;
  return { databaseName: expected.databaseName, databaseOid: expected.databaseOid, roleName: expected.roleName, roleOid: expected.roleOid,
    state: member(evidence.currentState, [...states, 'stable-runtime-active', 'stage-active', 'abort-blocked', 'failed']),
    targetAbsent: boolean(evidence.cleanup?.targetAbsent), roleAbsent: boolean(evidence.cleanup?.roleAbsent ?? evidence.cleanup?.stageRole?.verifiedAbsent),
    sessionCount: numeric(details?.sessionCount ?? evidence.cleanup?.sessionCount), roleSessionCount: numeric(details?.roleSessionCount ?? evidence.cleanup?.roleSessionCount),
    originalFailureRetained: boolean(evidence.cleanup?.originalFailureRetained), terminalEventObserved: Boolean(terminal), rawDetailsOmitted: true };
}
