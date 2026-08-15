import {
  linkSync,
  lstatSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
} from "./production-artifact-contract.mjs";
import {
  PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT,
  resolvePlaywrightReportPath,
  resolveRuntimeSmokeEvidencePath,
} from "./playwright-report-path.mjs";
import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
} from "./runtime-smoke-operation-contracts.mjs";
import {
  RuntimeSmokeNoProgressError,
  RuntimeSmokePhaseTimeoutError,
  createRuntimeSmokeFailureProvenance,
  runtimeSmokeFailureDisposition,
} from "./runtime-smoke-failure-evidence.mjs";

export {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT,
} from "./runtime-smoke-operation-contracts.mjs";
export {
  RuntimeSmokeOperationAttemptTimeoutError,
  RuntimeSmokeOperationTimeoutError,
  createRuntimeSmokeOperationDeadline,
  runRuntimeSmokeBoundedOperation,
  runtimeSmokeOperationAttempt,
  waitForRuntimeSmokeOperationDeadline,
} from "./runtime-smoke-operation-deadline.mjs";
export {
  RuntimeSmokeNoProgressError,
  RuntimeSmokePhaseTimeoutError,
  RuntimeSmokeTerminalError,
} from "./runtime-smoke-failure-evidence.mjs";

export const RUNTIME_SMOKE_PHASE_TIMING_SCHEMA =
  "interior-ai.runtime-smoke-phase-timings.v3";
export const RUNTIME_SMOKE_TIMING_EVIDENCE_BINDING_SCHEMA =
  "interior-ai.runtime-smoke-timing-evidence-binding.v1";
export const RUNTIME_SMOKE_TIMING_COMPLETION_MARKER =
  "timing-file-finalized";

export function deriveFurnishedTemplatePhaseTimeout(contract) {
  return sumNonNegativeIntegers(
    [
      ...contract.operations.map((operation) => operation.timeoutMs),
      contract.orchestrationMarginMs,
    ],
    "furnished-template phase contract",
  );
}

export function runtimeSmokeAggregateLifecycleState({
  expectedModelCount,
  readyModelCount,
  loadingModelCount,
  terminalErrorModelCount,
  combinedReadinessSatisfied,
}) {
  if (terminalErrorModelCount > 0) return "error";
  if (
    combinedReadinessSatisfied &&
    readyModelCount === expectedModelCount &&
    loadingModelCount === 0
  ) {
    return "ready";
  }
  return "loading";
}

export const RUNTIME_SMOKE_PHASE_BUDGETS = Object.freeze(
  Object.entries(FURNISHED_TEMPLATE_PHASE_CONTRACTS).map(([name, contract]) => ({
    name,
    timeoutMs: deriveFurnishedTemplatePhaseTimeout(contract),
  })),
);

export const RUNTIME_SMOKE_OVERHEAD_BUDGETS = Object.freeze({
  fixtureSetupMs: 15_000,
  fixtureTeardownMs: 15_000,
  assertionSchedulingMs: 15_000,
  orchestrationMarginMs: 30_000,
});

function sumNonNegativeIntegers(values, description) {
  return values.reduce((total, value) => {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${description} must contain non-negative integer milliseconds`);
    }
    return total + value;
  }, 0);
}

export function deriveRuntimeSmokeWholeTestTimeout({
  phases = RUNTIME_SMOKE_PHASE_BUDGETS,
  overhead = RUNTIME_SMOKE_OVERHEAD_BUDGETS,
} = {}) {
  const phaseBudgetMs = sumNonNegativeIntegers(
    phases.map((phase) => phase.timeoutMs),
    "runtime-smoke phase budgets",
  );
  const overheadBudgetMs = sumNonNegativeIntegers(
    Object.values(overhead),
    "runtime-smoke overhead budgets",
  );
  return phaseBudgetMs + overheadBudgetMs;
}

export const RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS =
  deriveRuntimeSmokeWholeTestTimeout();

export function runtimeSmokePhaseBudget(
  phaseName,
  phases = RUNTIME_SMOKE_PHASE_BUDGETS,
) {
  const phase = phases.find(
    (candidate) => candidate.name === phaseName,
  );
  if (!phase) throw new Error(`Unknown runtime-smoke phase: ${phaseName}`);
  return phase.timeoutMs;
}


function safeLifecycleState(value) {
  return ["not-observed", "loading", "ready", "error", "stable", "persisted"].includes(
    value,
  )
    ? value
    : "not-observed";
}

const CERTIFICATION_RUNTIME_IDENTITY_NAMES = Object.freeze([
  "PRODUCTION_CERTIFICATION_ID",
  "PRODUCTION_EVIDENCE_CANDIDATE_ID",
  "PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA",
  "PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA",
  "PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID",
  "PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256",
  "PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256",
  "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256",
  "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE",
  "CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID",
  "CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256",
  "CERTIFICATION_STAGE_ENVIRONMENT_CONTRACT_SHA256",
]);

function optionalEnvironmentValue(environment, name) {
  const value = environment[name]?.trim();
  return value || null;
}

function runtimeTimingIdentity(environment) {
  if (environment.CERTIFICATION_ENVIRONMENT_STAGE === "runtime-smoke") {
    const missing = CERTIFICATION_RUNTIME_IDENTITY_NAMES.filter(
      (name) => !environment[name]?.trim(),
    );
    if (missing.length > 0) {
      throw new Error(
        `runtime-smoke timing identity is missing required names: ${missing.join(", ")}`,
      );
    }
  }
  return Object.freeze({
    certificationId: optionalEnvironmentValue(
      environment,
      "PRODUCTION_CERTIFICATION_ID",
    ),
    candidateId: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_CANDIDATE_ID",
    ),
    commitSha: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA",
    ),
    treeSha: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA",
    ),
    nextBuildId: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID",
    ),
    artifactSha256: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256",
    ),
    productionManifestSha256: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256",
    ),
    semanticJournalSha256: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256",
    ),
    semanticJournalNonce: optionalEnvironmentValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE",
    ),
    semanticJournalSchema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
    semanticJournalVersion: PRODUCTION_EVIDENCE_JOURNAL_VERSION,
    runtimeStage: optionalEnvironmentValue(
      environment,
      "CERTIFICATION_ENVIRONMENT_STAGE",
    ),
    runtimeStageProfileId: optionalEnvironmentValue(
      environment,
      "CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID",
    ),
    runtimeStageProfileSha256: optionalEnvironmentValue(
      environment,
      "CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256",
    ),
    stageEnvironmentContractSha256: optionalEnvironmentValue(
      environment,
      "CERTIFICATION_STAGE_ENVIRONMENT_CONTRACT_SHA256",
    ),
  });
}

export function createRuntimeSmokeTimingEvidenceBinding({
  environment,
  destination,
}) {
  return Object.freeze({
    schema: RUNTIME_SMOKE_TIMING_EVIDENCE_BINDING_SCHEMA,
    rootContract: Object.freeze({
      schema: destination.rootContractSchema,
      version: destination.rootContractVersion,
      sha256: destination.rootContractSha256,
      rootVariableName: destination.rootVariableName,
      destinationClass: destination.destinationClass,
      relativePath: destination.portableRelativePath,
    }),
    identity: runtimeTimingIdentity(environment),
    completionMarker: RUNTIME_SMOKE_TIMING_COMPLETION_MARKER,
  });
}

export function resolveRuntimeSmokeTimingDestination({
  repositoryRoot,
  timingPath,
  environment = process.env,
  additionalRepositoryRoots = [],
}) {
  if (!timingPath) {
    throw new Error("runtime-smoke phase timing path is required");
  }
  if (environment.CERTIFICATION_ENVIRONMENT_STAGE !== "runtime-smoke") {
    if (path.isAbsolute(timingPath)) {
      return resolvePlaywrightReportPath({
        requestedPath: timingPath,
        repositoryRoot,
        authorizedExternalRoot: environment[PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT],
        additionalRepositoryRoots,
      });
    }
    const root = path.resolve(repositoryRoot);
    const outputPath = path.resolve(root, timingPath);
    if (!outputPath.startsWith(`${root}${path.sep}`)) {
      throw new Error("runtime-smoke phase timing path must remain inside the repository");
    }
    return Object.freeze({
      outputPath,
      destinationClass: "repository-relative-runtime-timing",
    });
  }
  return resolveRuntimeSmokeEvidencePath({
    requestedPath: timingPath,
    repositoryRoot,
    authorizedExternalRoot: environment[PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT],
    outputRole: "timings",
    additionalRepositoryRoots,
  });
}

export function createRuntimeSmokePhaseRecorder({
  repositoryRoot,
  timingPath,
  environment = process.env,
  additionalRepositoryRoots = [],
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  phaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS,
  phaseContracts = FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  writePerformanceWarning = (message) => console.warn(message),
}) {
  const testStartedAt = now();
  const records = [];
  const completedNames = new Set();
  const timingDestination = timingPath
    ? resolveRuntimeSmokeTimingDestination({
        repositoryRoot,
        timingPath,
        environment,
        additionalRepositoryRoots,
      })
    : null;
  const absoluteTimingPath = timingDestination?.outputPath ?? null;
  const stagingPath = absoluteTimingPath ? `${absoluteTimingPath}.staging` : null;
  const evidenceBinding = timingDestination?.rootContractSchema
    ? createRuntimeSmokeTimingEvidenceBinding({ environment, destination: timingDestination })
    : null;
  if (stagingPath) {
    try {
      lstatSync(stagingPath);
      throw new Error("runtime-smoke phase timing staging path must not already exist");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const write = () => {
    if (!absoluteTimingPath) return;
    const payload = {
      schema: RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
      testIdentity: "runtime.template-stability",
      wholeTestTimeoutMs: deriveRuntimeSmokeWholeTestTimeout({ phases: phaseBudgets }),
      sequentialPhaseBudgetMs: sumNonNegativeIntegers(
        phaseBudgets.map((phase) => phase.timeoutMs),
        "runtime-smoke phase budgets",
      ),
      overheadBudgets: RUNTIME_SMOKE_OVERHEAD_BUDGETS,
      phaseBudgets,
      phases: records,
      failure: records.find((record) => record.failure !== null)?.failure ?? null,
      complete: records.length === phaseBudgets.length &&
        records.every((record) => record.outcome === "passed"),
      ...(evidenceBinding ? { evidenceBinding } : {}),
    };
    if (timingDestination.destinationClass === "repository-relative-runtime-timing") {
      mkdirSync(path.dirname(absoluteTimingPath), { recursive: true });
    }
    writeFileSync(stagingPath, `${JSON.stringify(payload, null, 2)}\n`, {
      flag: records.length === 1 ? "wx" : "w",
      mode: 0o600,
    });
    if (payload.complete || payload.failure !== null) {
      linkSync(stagingPath, absoluteTimingPath);
      unlinkSync(stagingPath);
    }
  };

  return {
    async run(phaseName, task, finalLifecycleState = () => "not-observed") {
      if (completedNames.has(phaseName)) {
        throw new Error(`Runtime-smoke phase ${phaseName} was recorded more than once`);
      }
      const timeoutMs = runtimeSmokePhaseBudget(phaseName, phaseBudgets);
      const phaseContract = phaseContracts[phaseName] ?? null;
      const startedAt = now();
      let timeoutHandle;
      let noProgressHandle;
      let rejectNoProgress;
      let acceptsProgressCheckpoints = true;
      const progressCheckpoints = [];
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimer(
          () => reject(
            new RuntimeSmokePhaseTimeoutError({
              phaseId: phaseName,
              phaseBudgetMs: timeoutMs,
            }),
          ),
          timeoutMs,
        );
      });
      const noProgress = phaseContract
        ? new Promise((_, reject) => {
            rejectNoProgress = reject;
          })
        : null;
      const scheduleNoProgressTimeout = () => {
        if (!phaseContract || !rejectNoProgress) return;
        if (noProgressHandle !== undefined) clearTimer(noProgressHandle);
        noProgressHandle = setTimer(
          () => rejectNoProgress(
            new RuntimeSmokeNoProgressError({
              phaseId: phaseName,
              noProgressBudgetMs: phaseContract.noProgressTimeoutMs,
            }),
          ),
          phaseContract.noProgressTimeoutMs,
        );
      };
      const checkpoint = (
        name,
        lifecycleState = safeLifecycleState(finalLifecycleState()),
      ) => {
        if (!acceptsProgressCheckpoints) return;
        if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(name)) {
          throw new Error("Runtime-smoke progress checkpoint name is unsafe");
        }
        progressCheckpoints.push({
          name,
          elapsedMs: Math.max(0, now() - startedAt),
          finalLifecycleState: safeLifecycleState(lifecycleState),
        });
        scheduleNoProgressTimeout();
      };
      const createRecord = ({ outcome, error = null }) => {
        const elapsedMs = Math.max(0, now() - startedAt);
        const finalState = safeLifecycleState(finalLifecycleState());
        const performanceWarningThresholdMs =
          phaseContract?.performanceWarningThresholdMs ?? null;
        const performanceWarningExceeded =
          performanceWarningThresholdMs !== null &&
          elapsedMs > performanceWarningThresholdMs;
        if (performanceWarningExceeded) {
          writePerformanceWarning(
            `Runtime-smoke phase ${phaseName} completed in ${elapsedMs}ms; ` +
              `the non-failing performance observation threshold is ` +
              `${performanceWarningThresholdMs}ms.`,
          );
        }
        return {
          name: phaseName,
          startTimeRelativeMs: startedAt - testStartedAt,
          elapsedMs,
          outcome,
          timeoutBudgetMs: timeoutMs,
          performanceWarningThresholdMs,
          performanceWarningExceeded,
          finalLifecycleState: finalState,
          failure: error
            ? createRuntimeSmokeFailureProvenance({
                error,
                phaseId: phaseName,
                phaseElapsedMs: elapsedMs,
                phaseBudgetMs: timeoutMs,
                progressCheckpoints,
                safeLifecycleState: finalState,
              })
            : null,
          progressCheckpoints,
        };
      };
      checkpoint("phase-start");
      try {
        const racers = [
          Promise.resolve().then(() => task({ checkpoint })),
          timeout,
        ];
        if (noProgress) racers.push(noProgress);
        const result = await Promise.race(racers);
        checkpoint("phase-complete");
        records.push(createRecord({
          outcome: "passed",
        }));
        completedNames.add(phaseName);
        write();
        return result;
      } catch (error) {
        const disposition = runtimeSmokeFailureDisposition(error);
        records.push(createRecord({
          outcome: disposition.phaseOutcome,
          error,
        }));
        completedNames.add(phaseName);
        write();
        throw error;
      } finally {
        acceptsProgressCheckpoints = false;
        if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
        if (noProgressHandle !== undefined) clearTimer(noProgressHandle);
      }
    },
    records,
    destination: timingDestination,
  };
}
