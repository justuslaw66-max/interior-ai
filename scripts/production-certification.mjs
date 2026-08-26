import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  CERTIFICATION_HARNESS_SOURCE_PATHS,
  CERTIFICATION_RESULTS,
  CERTIFICATION_STAGE_ORDER,
  CERTIFICATION_STATE_ENV,
} from "./production-certification-contract.mjs";
import {
  certificationStageEvidenceFiles,
  certificationStateSha256,
  readCertificationState,
} from "./production-certification-state.mjs";
import { projectCertificationChildEnvironment } from "./production-certification-stage-environment.mjs";
import {
  captureCertificationStageResultInvocation,
  certificationStageResultSensitiveValues,
  createCertificationStageCommandResult,
  formatCertificationStageResult,
  isCertificationStageResultCommand,
  PRODUCTION_CERTIFICATION_STAGE_RESULT_NONCE_ENV,
  redactCertificationStageResultDiagnostic,
} from "./production-certification-stage-result-contract.mjs";
import { runCertificationResourcePreparation } from "./production-certification-resources.mjs";
import { redactDatabaseLifecycleFailure } from "./production-certification-database-lifecycle.mjs";
import {
  initializeRealCertification,
  runDatabaseAbortCleanup,
  runDatabaseDrop,
  runDatabaseProvision,
  runDatabaseStatus,
  runDatabaseVerifyAbsent,
  runDatabaseVerifyFinal,
  runDatabaseVerifyInitial,
  cleanupCertificationWorktrees,
  reconcileCertificationValidation,
  runArchivePreflightStage,
  runArchiveStage,
  runBrowserOwnersStage,
  runBuildStage,
  runContinuityStage,
  runDoctorStage,
  runExtractedArchivePreflightStage,
  runFinalStandaloneStage,
  runPhase8Stage,
  runRuntimeSmokeStage,
  runSourceValidationStage,
  runIntegrationReadyStage,
  validateBuildEligibility,
  validateCertificationReadOnly,
} from "./production-certification-real.mjs";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`certification command requires ${name}`);
  return value;
}

async function resumeCommand() {
  const validation = await validateCertificationReadOnly();
  if (!validation.valid) return validation;
  const state = readCertificationState(requiredEnvironment(CERTIFICATION_STATE_ENV));
  return nextCertificationCommand(state);
}

export function nextCertificationCommand(state) {
  if (state.executionClass === "real-candidate" && state.databaseLifecycle) {
    if (
      state.resourcePreparation === null ||
      state.resourcePreparation === undefined
    ) {
      return {
        complete: false,
        nextStage: "resource-preparation",
        canonicalCommand: "npm run certification:prepare-resources",
      };
    }
    if (state.stages.doctor.status !== "passed") {
      return {
        complete: false,
        nextStage: "doctor",
        canonicalCommand: state.stages.doctor.canonicalCommand,
      };
    }
    const lifecycleCommands = {
      planned: "npm run certification:database:provision",
      "create-authorized": "npm run certification:database:abort-cleanup",
      provisioned: "npm run certification:database:abort-cleanup",
      migrated: "npm run certification:database:verify-initial",
      "final-empty-verified": "npm run certification:database:drop",
      "sessions-cleared": "npm run certification:database:abort-cleanup",
      dropped: "npm run certification:database:verify-absent",
      failed: "npm run certification:database:abort-cleanup",
      "abort-cleanup-in-progress": "npm run certification:database:abort-cleanup",
      "abort-dropped": "npm run certification:database:abort-cleanup",
    };
    if (lifecycleCommands[state.databaseLifecycle.lifecycleState]) {
      return {
        complete: false,
        nextStage: `database:${state.databaseLifecycle.lifecycleState}`,
        canonicalCommand: lifecycleCommands[state.databaseLifecycle.lifecycleState],
      };
    }
    if (
      state.stages["browser-owners"].status === "passed" &&
      state.databaseLifecycle.lifecycleState === "active"
    ) {
      return {
        complete: false,
        nextStage: "database:verify-final",
        canonicalCommand: "npm run certification:database:verify-final",
      };
    }
  }
  const nextStage = CERTIFICATION_STAGE_ORDER.find(
    (stage) => state.stages[stage].status !== "passed",
  );
  return nextStage
    ? {
        complete: false,
        nextStage,
        canonicalCommand: state.stages[nextStage].canonicalCommand,
      }
    : { complete: true, nextStage: null, canonicalCommand: null };
}

function qualificationCommand() {
  const prohibitedArtifactPath = (relativePath) =>
    [".local/", ".next/", "test-results/", "playwright-report/"].some(
      (prefix) => relativePath.startsWith(prefix),
    ) || /(?:^|\/)candidate(?:-repeat)?\.tar\.gz$/.test(relativePath);
  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const status = spawnSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (tracked.error || status.error || tracked.signal || status.signal) {
    return "INCONCLUSIVE";
  }
  if (tracked.status !== 0 || status.status !== 0) {
    return "NOT_QUALIFIED_ORCHESTRATION_GAP";
  }
  if (status.stdout !== "") {
    return "NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT";
  }
  const trackedArtifacts = tracked.stdout
    .split("\0")
    .filter(Boolean)
    .filter(prohibitedArtifactPath);
  const changedArtifacts = status.stdout
    .split("\0")
    .filter(Boolean)
    .flatMap((record) => [record, record.length > 3 ? record.slice(3) : record])
    .filter(prohibitedArtifactPath);
  if (trackedArtifacts.length > 0 || changedArtifacts.length > 0) {
    return "NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT";
  }
  const checks = [
    [
      process.execPath,
      ["scripts/test-production-certification-stage-order.mjs"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-stage-result.mjs"],
    ],
    [
      process.execPath,
      ["scripts/production-certification-source-continuity.mjs", "contract-check"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-stage-environment.mjs"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-source-database-projection.mjs"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-source-generated-outputs.mjs"],
    ],
    [
      process.execPath,
      [
        "scripts/test-production-certification-source-generated-outputs.mjs",
        "--real-producers",
      ],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-state-worktrees.mjs"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-state-init-transaction.mjs"],
    ],
    [process.execPath, ["scripts/test-production-certification-resources.mjs"]],
    [
      process.execPath,
      ["scripts/test-production-certification-database-lifecycle.mjs"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-auth-preflight-database.mjs"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-dependency-lifecycle.mjs"],
    ],
    [process.execPath, ["scripts/test-production-trace-archive-policy.mjs"]],
    [process.execPath, ["scripts/test-production-archive-plan-evidence.mjs"]],
    ["npm", ["run", "test:auth-env-hardening"]],
    ["npm", ["run", "test:ci-auth-fixture-session"]],
    ["npm", ["run", "test:ci-auth-fixture-real-preflight"]],
    ["npm", ["run", "certification:simulate"]],
    [process.execPath, ["scripts/test-production-certification.mjs"]],
    [process.execPath, ["scripts/test-production-artifact-evidence.mjs"]],
    [process.execPath, ["scripts/test-required-test-truthfulness.mjs"]],
    [process.execPath, ["scripts/required-test-truthfulness.mjs", "check"]],
    ["npm", ["run", "test:runtime-smoke-phase-budget"]],
    ["npm", ["run", "test:runtime-smoke-deadline-boundary"]],
    ["npm", ["run", "test:runtime-smoke-post-readiness"]],
    ["npm", ["run", "test:runtime-smoke-readiness-diagnostics"]],
    ["npm", ["run", "check:floor-plan-architecture"]],
    ["npm", ["run", "check:cabinetry-architecture"]],
    [process.execPath, ["scripts/check-design-page-architecture.mjs"]],
    ["npm", ["run", "test:tracked-artifact-hygiene"]],
    [
      process.execPath,
      ["scripts/production-certification-source-continuity.mjs", "source-syntax"],
    ],
    ["npm", ["run", "typecheck"]],
    ["npm", ["run", "lint", "--", "--max-warnings=0"]],
    ["npm", ["run", "check:code-quality"]],
    ["git", ["diff", "--check"]],
    ...CERTIFICATION_HARNESS_SOURCE_PATHS
      .filter((relativePath) => relativePath.endsWith(".mjs"))
      .map((relativePath) => [process.execPath, ["--check", relativePath]]),
  ];
  let sawInfrastructureFailure = false;
  const qualificationEnvironment = projectCertificationChildEnvironment({
    repositoryRoot: process.cwd(),
    baseEnvironment: process.env,
    stage: "qualification",
    profileId: "qualification",
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: "qualification",
      CERTIFICATION_QUALIFICATION_MODE: "1",
    },
  }).environment;
  for (const [command, args] of checks) {
    const child = spawnSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: qualificationEnvironment,
    });
    if (child.error) sawInfrastructureFailure = true;
    if (child.status !== 0 || child.signal) {
      if (child.error || child.signal) return "INCONCLUSIVE";
      return args.includes("certification:simulate")
        ? "NOT_QUALIFIED_ORCHESTRATION_GAP"
        : "NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT";
    }
  }
  return sawInfrastructureFailure
    ? "INCONCLUSIVE"
    : "QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION";
}

async function cli() {
  const command = process.argv[2];
  let result;
  if (command === "state:init") result = initializeRealCertification();
  else if (command === "prepare-resources") {
    result = runCertificationResourcePreparation();
  }
  else if (command === "doctor") result = await runDoctorStage();
  else if (command === "database:provision") result = await runDatabaseProvision();
  else if (command === "database:verify-initial") {
    result = await runDatabaseVerifyInitial();
  }
  else if (command === "database:verify-final") result = await runDatabaseVerifyFinal();
  else if (command === "database:drop") result = await runDatabaseDrop();
  else if (command === "database:verify-absent") result = await runDatabaseVerifyAbsent();
  else if (command === "database:abort-cleanup") result = await runDatabaseAbortCleanup();
  else if (command === "database:status") result = await runDatabaseStatus();
  else if (command === "source-validation") {
    result = await runSourceValidationStage();
  }
  else if (command === "state:validate") result = await validateCertificationReadOnly();
  else if (command === "build:eligibility") result = await validateBuildEligibility();
  else if (command === "state:reconcile") result = await reconcileCertificationValidation();
  else if (command === "resume") result = await resumeCommand();
  else if (command === "build") result = await runBuildStage();
  else if (command === "archive-preflight") result = await runArchivePreflightStage();
  else if (command === "archive") result = await runArchiveStage();
  else if (command === "extracted-archive-preflight") {
    result = await runExtractedArchivePreflightStage();
  } else if (command === "phase8") result = await runPhase8Stage();
  else if (command === "runtime-smoke") result = await runRuntimeSmokeStage();
  else if (command === "browser-owners") result = await runBrowserOwnersStage();
  else if (command === "final-standalone") result = await runFinalStandaloneStage();
  else if (command === "continuity") result = await runContinuityStage();
  else if (command === "integration-ready") result = await runIntegrationReadyStage();
  else if (command === "worktrees:cleanup") result = await cleanupCertificationWorktrees();
  else if (command === "simulate") {
    const { runProductionCertificationSimulation } = await import(
      "./production-certification-simulation.mjs"
    );
    result = await runProductionCertificationSimulation();
  } else if (command === "qualify") {
    const classification = qualificationCommand();
    if (!CERTIFICATION_RESULTS.includes(classification)) {
      throw new Error("unknown qualification result");
    }
    console.log(classification);
    if (classification !== "QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION") {
      process.exitCode = 1;
    }
    return;
  } else {
    result = {
      valid: false,
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
      consumedSubstantiveGate: false,
      issues: ["certification invocation mode is missing or malformed"],
    };
  }
  if (!isCertificationStageResultCommand(command)) {
    console.log(JSON.stringify(result));
  }
  if (result?.valid === false) process.exitCode = 1;
  return result;
}

function emitQualificationNoisyOutputFixture(command) {
  const fixture =
    process.env.CERTIFICATION_STAGE_RESULT_NOISY_OUTPUT_FIXTURE?.trim();
  if (!fixture) return;
  if (
    fixture !== "historical-source-validation-npm-prisma" ||
    command !== "source-validation" ||
    process.env.CERTIFICATION_EXECUTION_CLASS !== "deterministic-simulation" ||
    process.env.CERTIFICATION_QUALIFICATION_MODE !== "1"
  ) {
    throw new Error(
      "certification stage-result noisy-output fixture is restricted to source-validation qualification",
    );
  }
  process.stdout.write(
    [
      "> interior-ai@0.1.0 certification:source-validation",
      "> node scripts/production-certification.mjs source-validation",
      "Prisma schema loaded from prisma/schema.prisma",
      "Datasource db: PostgreSQL database certification_fixture",
      "",
    ].join("\n"),
  );
}

function safeStageResultDiagnostic(error) {
  return redactCertificationStageResultDiagnostic(
    redactDatabaseLifecycleFailure(error),
    certificationStageResultSensitiveValues(process.env),
  );
}

export function createSerializedTerminalLifecycle({ runAbortCleanup }) {
  let terminalSignal = null;
  return {
    requestSignal(signal) {
      if (!terminalSignal) terminalSignal = signal;
    },
    async execute(runCommand) {
      let commandError = null;
      let cleanupError = null;
      let cleanupResult = null;
      let commandResult = null;
      try {
        commandResult = await runCommand();
      } catch (error) {
        commandError = error;
      }
      if (terminalSignal || commandError) {
        try {
          cleanupResult = await runAbortCleanup({ terminalSignal, commandError });
        } catch (error) {
          cleanupError = error;
        }
      }
      return {
        terminalSignal,
        commandError,
        cleanupError,
        cleanupResult,
        commandResult,
      };
    },
  };
}

export function createCertificationAbortCleanupRequest({
  command,
  terminalSignal,
  commandError,
  environment = process.env,
}) {
  const statePath = environment.PRODUCTION_CERTIFICATION_STATE?.trim();
  if (!statePath) {
    throw new Error(
      "database abort cleanup requires the physical certification state",
    );
  }
  const physicalState = readCertificationState(statePath);
  const physicalStateSha256 = certificationStateSha256(physicalState);
  const failedStateSha256 = commandError?.failedStateSha256 ?? null;
  const failedStages = CERTIFICATION_STAGE_ORDER.filter(
    (stage) => physicalState.stages?.[stage]?.status === "failed",
  );
  if (failedStages.length > 1) {
    throw new Error("physical certification state has multiple failed stages");
  }
  const physicalFailedStage = failedStages[0] ?? null;
  let originalFailure;
  if (physicalFailedStage) {
    if (!failedStateSha256) {
      throw new Error(
        "stage failure is missing its authoritative failed-state SHA",
      );
    }
    if (failedStateSha256 !== physicalStateSha256) {
      throw new Error(
        "returned failed-state SHA does not match the physical certification state",
      );
    }
    const record = physicalState.stages[physicalFailedStage];
    const attempt = record.attempts.at(-1);
    const callerClassification =
      commandError?.classification ??
      commandError?.certificationResult?.classification ??
      null;
    const callerConsumed =
      commandError?.consumed ??
      commandError?.certificationResult?.consumedSubstantiveGate;
    const callerHasEvidence = Object.hasOwn(
      commandError ?? {},
      "evidenceFiles",
    );
    const callerEvidence = commandError?.evidenceFiles ?? {};
    const physicalEvidence = certificationStageEvidenceFiles(
      physicalState,
      physicalFailedStage,
    );
    const evidenceMatches =
      Object.keys(callerEvidence).sort().join("\n") ===
        Object.keys(physicalEvidence).sort().join("\n") &&
      Object.keys(physicalEvidence).every(
        (name) =>
          callerEvidence[name]?.path === physicalEvidence[name].path &&
          callerEvidence[name]?.sha256 === physicalEvidence[name].sha256,
      );
    if (
      attempt?.status !== "failed" ||
      record.failureClassification !== attempt.failureClassification ||
      record.consumedSubstantiveGate !== attempt.consumedSubstantiveGate
    ) {
      throw new Error(
        "physical certification failed stage attribution is contradictory",
      );
    }
    if (
      command !== physicalFailedStage ||
      commandError?.stage !== physicalFailedStage ||
      commandError?.stageAttempt !== attempt.number ||
      callerClassification !== attempt.failureClassification ||
      typeof callerConsumed !== "boolean" ||
      callerConsumed !== attempt.consumedSubstantiveGate ||
      !callerHasEvidence ||
      !evidenceMatches
    ) {
      throw new Error(
        "returned stage failure attribution does not match the physical failed attempt",
      );
    }
    originalFailure = {
      classification: attempt.failureClassification,
      consumedSubstantiveGate: attempt.consumedSubstantiveGate,
      stage: physicalFailedStage,
      attempt: attempt.number,
      failedStateSha256: physicalStateSha256,
      evidenceReferences: physicalEvidence,
    };
  } else {
    const databaseFailure = commandError?.databaseLifecycleFailure ?? null;
    if (databaseFailure) {
      const currentDatabaseBinding = physicalState.databaseLifecycle;
      if (
        command !== "database:verify-final" ||
        commandError?.stage !== "database:verify-final" ||
        commandError?.stageAttempt !== databaseFailure.attempt ||
        commandError?.classification !== "DATABASE_LIFECYCLE_FAILURE" ||
        commandError?.consumed !== true ||
        databaseFailure.classification !== "DATABASE_LIFECYCLE_FAILURE" ||
        databaseFailure.stage !== "database:verify-final" ||
        !Number.isSafeInteger(databaseFailure.attempt) ||
        databaseFailure.attempt < 1 ||
        databaseFailure.consumedSubstantiveGate !== true ||
        databaseFailure.failedStateSha256 !== physicalStateSha256 ||
        failedStateSha256 !== physicalStateSha256 ||
        JSON.stringify(commandError.databaseLifecycleResult?.binding) !==
          JSON.stringify(currentDatabaseBinding) ||
        currentDatabaseBinding?.lifecycleState !== "failed" ||
        JSON.stringify(databaseFailure.evidenceReferences) !==
          JSON.stringify(commandError.evidenceFiles)
      ) {
        throw new Error(
          "returned final database failure differs from the physical failed lifecycle",
        );
      }
      originalFailure = structuredClone(databaseFailure);
    } else if (failedStateSha256) {
      throw new Error(
        "returned failed-state SHA does not identify a physical failed stage",
      );
    } else {
      originalFailure = {
        classification: terminalSignal
          ? "INFRASTRUCTURE_TRANSIENT"
          : commandError?.classification ??
            commandError?.certificationResult?.classification ??
            "PRECONDITION_ORCHESTRATION_FAILURE",
        consumedSubstantiveGate: false,
        stage: terminalSignal
          ? `terminal-${terminalSignal.toLowerCase()}`
          : commandError?.stage ?? command,
        attempt: null,
        failedStateSha256: null,
        evidenceReferences: {},
      };
    }
  }
  return {
    environment: {
      ...environment,
      CERTIFICATION_EXPECTED_STATE_SHA256: physicalStateSha256,
    },
    originalFailure,
  };
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const command = process.argv[2] ?? "unknown";
  const stageResultInvocation = captureCertificationStageResultInvocation({
    command,
  });
  if (stageResultInvocation) {
    process.env[PRODUCTION_CERTIFICATION_STAGE_RESULT_NONCE_ENV] =
      stageResultInvocation.nonce;
  }
  const terminal = createSerializedTerminalLifecycle({
    runAbortCleanup: async ({ terminalSignal, commandError }) => {
      if (
        process.env.CERTIFICATION_EXECUTION_CLASS !== "real-candidate" ||
        !process.env.PRODUCTION_CERTIFICATION_STATE ||
        (command === "state:init" &&
          !existsSync(process.env.PRODUCTION_CERTIFICATION_STATE)) ||
        !process.env.CERTIFICATION_DATABASE_LIFECYCLE_PATH ||
        command === "database:abort-cleanup" ||
        command === "database:status"
      ) {
        return;
      }
      const cleanup = createCertificationAbortCleanupRequest({
        command,
        terminalSignal,
        commandError,
      });
      return runDatabaseAbortCleanup({
        environment: cleanup.environment,
        originalFailure: cleanup.originalFailure,
      });
    },
  });
  process.once("SIGINT", () => terminal.requestSignal("SIGINT"));
  process.once("SIGTERM", () => terminal.requestSignal("SIGTERM"));
  emitQualificationNoisyOutputFixture(command);
  terminal.execute(cli).then(({
    terminalSignal,
    commandError,
    cleanupError,
    cleanupResult,
    commandResult,
  }) => {
    if (cleanupError) {
      console.error(
        `database abort cleanup failed without replacing the original failure: ${safeStageResultDiagnostic(cleanupError)}`,
      );
    }
    if (commandError) {
      console.error(safeStageResultDiagnostic(commandError));
    }
    if (terminalSignal) {
      process.exitCode = terminalSignal === "SIGINT" ? 130 : 143;
    } else if (commandError) {
      process.exitCode = 1;
    }
    if (stageResultInvocation) {
      try {
        const result = createCertificationStageCommandResult({
          invocation: stageResultInvocation,
          commandResult,
          commandError,
          cleanupError,
          cleanupResult,
          terminalSignal,
          wrapperExitCode: process.exitCode ?? 0,
          evidenceRoot: process.env.CERTIFICATION_EVIDENCE_ROOT,
          sensitiveValues:
            certificationStageResultSensitiveValues(process.env),
        });
        process.stdout.write(formatCertificationStageResult(result));
      } catch (error) {
        console.error(safeStageResultDiagnostic(error));
        process.exitCode = 1;
      }
    }
  }).catch((error) => {
    console.error(safeStageResultDiagnostic(error));
    process.exitCode = 1;
  });
}
