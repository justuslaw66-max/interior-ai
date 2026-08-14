import { spawnSync } from "node:child_process";

import {
  CERTIFICATION_HARNESS_SOURCE_PATHS,
  CERTIFICATION_RESULTS,
  CERTIFICATION_STAGE_ORDER,
  CERTIFICATION_STATE_ENV,
} from "./production-certification-contract.mjs";
import { readCertificationState } from "./production-certification-state.mjs";
import { projectCertificationChildEnvironment } from "./production-certification-stage-environment.mjs";
import {
  initializeRealCertification,
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
  validateAndAdvanceCertification,
} from "./production-certification-real.mjs";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`certification command requires ${name}`);
  return value;
}

async function resumeCommand() {
  await validateAndAdvanceCertification();
  const state = readCertificationState(requiredEnvironment(CERTIFICATION_STATE_ENV));
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
      ["scripts/production-certification-source-continuity.mjs", "contract-check"],
    ],
    [
      process.execPath,
      ["scripts/test-production-certification-stage-environment.mjs"],
    ],
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
  else if (command === "doctor") result = await runDoctorStage();
  else if (command === "source-validation") {
    result = await runSourceValidationStage();
  }
  else if (command === "state:validate") {
    result = await validateAndAdvanceCertification();
  } else if (command === "resume") result = await resumeCommand();
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
    throw new Error(
      "usage: production-certification.mjs state:init|doctor|source-validation|state:validate|resume|build|archive-preflight|archive|extracted-archive-preflight|phase8|runtime-smoke|browser-owners|final-standalone|continuity|simulate|qualify",
    );
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  cli().catch((error) => {
    if (error?.certificationResult) {
      console.log(JSON.stringify(error.certificationResult));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  });
}
