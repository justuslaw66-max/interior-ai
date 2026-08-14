import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProductionEvidenceManifest,
  executeProductionEvidenceChild,
  initializeProductionEvidenceSemanticJournal,
  recoverProductionEvidenceFromSemanticJournal,
} from "./production-artifact-evidence.mjs";
import {
  CERTIFICATION_HARNESS_SOURCE_PATHS,
  PHASE8_SOURCE_BINDING_PATHS,
  PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  sha256Bytes,
  sourceValidationCheckSet,
} from "./production-certification-contract.mjs";
import {
  completeCertificationStage,
  readCertificationState,
  startCertificationStage,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  captureArtifactSnapshot,
  measureFinalContinuity,
  rootEvidenceName,
  snapshotEvidenceName,
  validateSourceValidationEvidence,
  validateContinuityEvidence,
} from "./production-certification-source-continuity.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
  validateProjectedEnvironmentMetadata,
} from "./production-certification-stage-environment.mjs";

const SIMULATION_ID = "production-certification-v1-simulation";
const FIXED_NONCE = "123e4567-e89b-42d3-a456-426614174001";
const FIXED_GIT_DATE = "2026-08-14T00:00:00Z";
const FIXED_STATE_BASE = Date.parse("2026-08-14T00:10:00.000Z");

function write(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

function run(command, args, cwd, environment = process.env) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: "utf8" });
  if (result.status !== 0 || result.signal) {
    throw new Error(
      `${command} simulation child failed: ${String(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

function git(root, args) {
  return run("git", args, root, {
    ...process.env,
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
  });
}

function simulationClock() {
  let tick = 0;
  const base = Date.parse("2026-08-14T00:00:00.000Z");
  return () => new Date(base + tick++ * 100).toISOString();
}

function stateClock() {
  let tick = 0;
  return () => new Date(FIXED_STATE_BASE + tick++ * 100).toISOString();
}

function copyHarnessSources(repositoryRoot, fixtureRoot) {
  const paths = new Set([
    ...CERTIFICATION_HARNESS_SOURCE_PATHS,
    ...PHASE8_SOURCE_BINDING_PATHS,
    "scripts/production-verifier-closure.mjs",
    "scripts/required-test-playwright.mjs",
    "scripts/run-phase8-project-benchmark.ts",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/runtime-smoke-failure-evidence.mjs",
    "scripts/runtime-smoke-operation-contracts.mjs",
    "scripts/runtime-smoke-operation-deadline.mjs",
    "scripts/runtime-smoke-telemetry-bootstrap-contract.mjs",
  ]);
  for (const relativePath of paths) {
    write(fixtureRoot, relativePath, readFileSync(path.join(repositoryRoot, relativePath)));
  }
}

function writeFloorPlanNfts(root) {
  const targets = [
    ".next/server/app/api/admin/floor-plan-imports/[id]/construction-sources/route.js",
    ".next/server/app/api/admin/floor-plan-imports/[id]/supplementary-sources/route.js",
    ".next/server/app/api/floor-plan-imports/[id]/process/route.js",
  ];
  for (const routePath of targets) {
    write(root, routePath, "export const route = 'simulation';\n");
    const nftPath = `${routePath}.nft.json`;
    const publicPath = "public/assets/floor-plans/preview.webp";
    write(
      root,
      nftPath,
      `${JSON.stringify({
        version: 1,
        files: [
          path.basename(routePath),
          path.relative(path.dirname(nftPath), publicPath).split(path.sep).join("/"),
        ],
      })}\n`,
    );
  }
}

function writeMiniatureArtifact(root) {
  write(root, ".next/BUILD_ID", "simulation-build-001\n");
  write(root, ".next/build-manifest.json", "{}\n");
  write(root, ".next/routes-manifest.json", "{}\n");
  write(root, ".next/prerender-manifest.json", "{}\n");
  write(
    root,
    ".next/required-server-files.json",
    `${JSON.stringify({ version: 1, files: ["package.json"] })}\n`,
  );
  write(root, ".next/static/chunk.js", "simulation static chunk\n");
  write(root, ".next/server/app.js", "simulation server output\n");
  write(
    root,
    ".next/server/app.js.nft.json",
    `${JSON.stringify({ version: 1, files: ["app.js", "../../package.json"] })}\n`,
  );
  writeFloorPlanNfts(root);
  symlinkSync("../../public/asset.txt", path.join(root, ".next/server/public-link"));
  write(root, "node_modules/.package-lock.json", "simulation installed identity\n");
}

function initializeFixture(repositoryRoot, fixtureRoot) {
  const npmVersion = run("npm", ["--version"], repositoryRoot);
  write(fixtureRoot, ".gitignore", ".next/\n.local/\nnode_modules/\n");
  write(
    fixtureRoot,
    "package.json",
    `${JSON.stringify({
      name: "production-certification-simulation",
      private: true,
      packageManager: `npm@${npmVersion}`,
    }, null, 2)}\n`,
  );
  write(
    fixtureRoot,
    "package-lock.json",
    `${JSON.stringify({
      name: "production-certification-simulation",
      lockfileVersion: 3,
      packages: {},
    }, null, 2)}\n`,
  );
  write(fixtureRoot, ".nvmrc", `${process.version.slice(1)}\n`);
  copyHarnessSources(repositoryRoot, fixtureRoot);
  write(fixtureRoot, "public/asset.txt", "deterministic simulation asset\n");
  write(fixtureRoot, "public/assets/floor-plans/preview.webp", "simulation preview\n");
  git(fixtureRoot, ["init", "-q"]);
  git(fixtureRoot, ["config", "user.name", "Certification simulation"]);
  git(fixtureRoot, ["config", "user.email", "simulation@example.test"]);
  git(fixtureRoot, ["commit", "--allow-empty", "-qm", "simulation integration base"]);
  const integrationCommitSha = git(fixtureRoot, ["rev-parse", "HEAD"]);
  const integrationTreeSha = git(fixtureRoot, ["rev-parse", "HEAD^{tree}"]);
  git(fixtureRoot, ["add", "."]);
  git(fixtureRoot, ["commit", "-qm", "deterministic certification fixture"]);
  git(fixtureRoot, ["update-ref", "refs/heads/integration", integrationCommitSha]);
  git(fixtureRoot, [
    "update-ref",
    "refs/remotes/origin/integration",
    integrationCommitSha,
  ]);
  return {
    npmVersion,
    commitSha: git(fixtureRoot, ["rev-parse", "HEAD"]),
    treeSha: git(fixtureRoot, ["rev-parse", "HEAD^{tree}"]),
    parentSha: git(fixtureRoot, ["rev-parse", "HEAD^"]),
    integrationCommitSha,
    integrationTreeSha,
  };
}

function simulationEnvironment(identity) {
  return {
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NODE_ENV: "production",
    CATALOG_STRICT_VALIDATION: "true",
    DATABASE_URL: "postgresql://simulation:simulation@127.0.0.1:5432/simulation",
    FLOOR_PLAN_LOCAL_OCR_DISABLED: "1",
    FLOOR_PLAN_VISION_DISABLED: "1",
    FLOOR_PLAN_VISION_ENABLED: "1",
    FLOOR_PLAN_VISION_MODEL: "simulation-floor-plan-model",
    OPENAI_API_KEY: "simulation-openai-placeholder",
    SHOPIFY_STORE_DOMAIN: "simulation.myshopify.example",
    SHOPIFY_STOREFRONT_TOKEN: "simulation-shopify-placeholder",
    POSTHOG_KEY: "simulation-posthog-placeholder",
    STRIPE_SECRET_KEY: "sk_test_simulation_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_simulation_placeholder",
    STRIPE_PRICE_PRO_MONTHLY: "price_simulation_monthly",
    STRIPE_PRICE_PRO_YEARLY: "price_simulation_yearly",
    AUTH_SECRET: "simulation-auth-secret-at-least-32-characters",
    GOOGLE_CLIENT_ID: "simulation.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "GOCSPX-simulation-placeholder",
    APP_ORIGIN: "http://127.0.0.1:3000",
    ADMIN_EMAILS: "simulation-admin@example.test",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: SIMULATION_ID,
    CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
    CERTIFICATION_EXPECTED_COMMIT_SHA: identity.commitSha,
    CERTIFICATION_EXPECTED_TREE_SHA: identity.treeSha,
    CERTIFICATION_EXPECTED_PARENT_SHA: identity.parentSha,
  };
}

async function emitProductionEvidence(fixtureRoot, identity, environment) {
  const clock = simulationClock();
  const toolchain = { nodeVersion: process.version, npmVersion: identity.npmVersion };
  const source = { commitSha: identity.commitSha, treeSha: identity.treeSha };
  const journal = await initializeProductionEvidenceSemanticJournal({
    repositoryRoot: fixtureRoot,
    candidateIdentifier: SIMULATION_ID,
    source,
    buildContract: { applicationEnvironment: "staging", catalogStrictValidation: true },
    toolchain,
    nonce: FIXED_NONCE,
    clock,
  });
  for (const action of ["install", "generatedSourceCheck", "build"]) {
    executeProductionEvidenceChild({
      repositoryRoot: fixtureRoot,
      expectedRunNonce: journal.runNonce,
      action,
      dispatch: () => ({ status: 0, signal: null }),
      clock,
    });
  }
  const result = await recoverProductionEvidenceFromSemanticJournal({
    repositoryRoot: fixtureRoot,
    expectedRunNonce: journal.runNonce,
    environment,
    toolchain,
    clock,
    manifestFactory: async (options) => ({
      ...(await createProductionEvidenceManifest(options)),
      certificationSimulation: {
        deterministic: true,
        acceptedForRealCandidate: false,
      },
    }),
  });
  const manifestPath = path.join(
    fixtureRoot,
    ".local/production-artifact-evidence/manifest.json",
  );
  const journalPath = path.join(
    fixtureRoot,
    ".local/production-artifact-evidence/semantic-event-journal.json",
  );
  return {
    manifest: result.manifest,
    manifestSha256: sha256Bytes(readFileSync(manifestPath)),
    journalSha256: sha256Bytes(readFileSync(journalPath)),
  };
}

function identityFromState(state) {
  return {
    certificationId: state.certificationId,
    candidateId: state.candidate.id,
    commitSha: state.candidate.commitSha,
    treeSha: state.candidate.treeSha,
    parentSha: state.candidate.parentSha,
    nextBuildId: state.bindings.nextBuildId,
    artifactSha256: state.bindings.artifactSha256,
    harnessVersion: state.harness.version,
    harnessSourceSha256: state.harness.sourceSha256,
  };
}

function descriptor(evidenceRoot, filePath) {
  return {
    path: path.relative(evidenceRoot, filePath).split(path.sep).join("/"),
    sha256: sha256Bytes(readFileSync(filePath)),
  };
}

function writeEvidence(evidenceRoot, relativePath, value) {
  const filePath = path.join(evidenceRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, canonicalJsonBytes(value), { flag: "wx", mode: 0o600 });
  return descriptor(evidenceRoot, filePath);
}

let simulationStageRequestNumber = 0;

function runStateTransitionCli({ fixtureRoot, evidenceRoot, statePath, action, payload }) {
  simulationStageRequestNumber += 1;
  const requestPath = path.join(
    evidenceRoot,
    "simulation-stage-requests",
    `${String(simulationStageRequestNumber).padStart(3, "0")}-${action}.json`,
  );
  write(
    evidenceRoot,
    path.relative(evidenceRoot, requestPath),
    canonicalJsonBytes(payload),
  );
  run(
    process.execPath,
    ["scripts/production-certification-simulation.mjs", `state:${action}`],
    fixtureRoot,
    projectCertificationChildEnvironment({
      repositoryRoot: fixtureRoot,
      baseEnvironment: process.env,
      stage: "simulation",
      profileId: "simulation-control",
      stageInputs: {
        CERTIFICATION_ENVIRONMENT_STAGE: "simulation",
        CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
        CERTIFICATION_QUALIFICATION_MODE: "1",
        PRODUCTION_CERTIFICATION_STATE: statePath,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        CERTIFICATION_SIMULATION_STAGE_REQUEST: requestPath,
      },
    }).environment,
  );
  return readCertificationState(statePath);
}

function startSimulationStage(options) {
  return runStateTransitionCli({ ...options, action: "start" });
}

function completeSimulationStage(options) {
  return runStateTransitionCli({ ...options, action: "complete" });
}

function phase8Evidence(state, fixtureRoot, rawEvidenceSha256) {
  const projectBudgets = JSON.parse(
    readFileSync(path.join(fixtureRoot, "config/phase8-performance-budgets.json"), "utf8"),
  ).projectBenchmarks;
  const measurements = ["small", "medium", "large"].map((scale) => {
    const count = { small: 160, medium: 80, large: 30 }[scale];
    return {
      scale,
      maxSerializedBytes: projectBudgets[scale].maxSerializedBytes,
      fixture: { serializedBytes: 100 },
      serializedSizePassed: true,
      operations: ["fingerprintCold", "fingerprintCached", "save", "load"].map(
        (operation) => {
          const value = 0.01;
          const samplesMs = Array.from({ length: count }, () => value);
          return {
            operation,
            samplesMs,
            samplesSha256: sha256Bytes(JSON.stringify(samplesMs)),
            p50Ms: value,
            p95Ms: value,
            maxMs: value,
            thresholdMs: projectBudgets[scale].maxP95Ms[operation],
            passed: true,
          };
        },
      ),
    };
  });
  return {
    schema: PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
    identity: identityFromState(state),
    executionClass: "deterministic-simulation",
    simulation: true,
    rawEvidenceSha256,
    sourceBindings: PHASE8_SOURCE_BINDING_PATHS.map((sourcePath) => ({
      path: sourcePath,
      sha256: sha256Bytes(readFileSync(path.join(fixtureRoot, sourcePath))),
    })),
    childCalculatedPassed: true,
    parentValidatedPassed: true,
    measurements,
    budgets: { project: "passed", bundle: "passed", runtime: "passed", boundary: "passed" },
    contradictions: [],
    complete: true,
  };
}

function runtimeEvidence(state, reportSha256, phaseTimingsSha256) {
  return {
    schema: PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
    identity: identityFromState(state),
    executionClass: "deterministic-simulation",
    simulation: true,
    reportSha256,
    phaseTimingsSha256,
    stats: { expected: 2, passed: 2, unexpected: 0, skipped: 0, flaky: 0, retries: 0 },
    tests: [
      { id: "runtime.template-stability", outcome: "passed", retries: 0, skipped: false },
      { id: "runtime.health-catalog-ready", outcome: "passed", retries: 0, skipped: false },
    ],
    telemetryProvenance: ["initial", "reload-1", "reload-2", "reload-3"].map(
      (realm, index) => ({ realm, activationGeneration: index + 1, valid: true }),
    ),
    complete: true,
  };
}

function browserEvidence(state, owner, gate, reportSha256) {
  const tests = gate.requiredTests.flatMap((test) =>
    gate.requiredProjects.map((project) => ({
      id: test.id,
      file: test.file,
      title: test.title,
      project,
      outcome: "passed",
      retries: 0,
      skipped: false,
    })),
  );
  return {
    schema: PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA,
    ownerId: owner.id,
    gateId: owner.gateId,
    identity: identityFromState(state),
    executionClass: "deterministic-simulation",
    simulation: true,
    reportSha256,
    stats: { passed: tests.length, unexpected: 0, skipped: 0, flaky: 0, retries: 0 },
    tests,
    complete: true,
  };
}

export async function runProductionCertificationSimulation() {
  const repositoryRoot = process.cwd();
  const simulationRoot = mkdtempSync(path.join(tmpdir(), "production-certification-v1-"));
  const fixtureRoot = path.join(simulationRoot, "source");
  const evidenceRoot = path.join(simulationRoot, "evidence");
  mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  const identity = initializeFixture(repositoryRoot, fixtureRoot);
  const environment = simulationEnvironment(identity);
  const nextTimestamp = stateClock();
  const statePath = path.join(evidenceRoot, "certification-state.json");
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    mkdirSync(path.join(evidenceRoot, "browser-targets", owner.id), { recursive: true });
  }
  mkdirSync(path.join(evidenceRoot, "runtime-target"), { recursive: true });
  mkdirSync(path.join(evidenceRoot, "phase8-target"), { recursive: true });
  mkdirSync(path.join(evidenceRoot, "runtime-evidence-target"), { recursive: true });
  const doctorEnvironment = {
    ...process.env,
    ...environment,
    PRODUCTION_CERTIFICATION_ID: SIMULATION_ID,
    PRODUCTION_CERTIFICATION_STATE: statePath,
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    PHASE8_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
    CERTIFICATION_QUALIFICATION_MODE: "1",
    CERTIFICATION_CREATED_AT: nextTimestamp(),
    CERTIFICATION_RUNTIME_REPORT_PATH: path.join(
      evidenceRoot,
      "runtime-target/playwright.json",
    ),
    CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH: path.join(
      evidenceRoot,
      "runtime-target/phase-timings.json",
    ),
    CERTIFICATION_RUNTIME_EVIDENCE_PATH: path.join(
      evidenceRoot,
      "runtime-evidence-target/evidence.json",
    ),
    CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
      evidenceRoot,
      "phase8-target/evidence.json",
    ),
  };
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    doctorEnvironment[
      `CERTIFICATION_BROWSER_${owner.id.toUpperCase().replaceAll("-", "_")}_REPORT_PATH`
    ] = path.join(evidenceRoot, "browser-targets", owner.id, "playwright.json");
  }
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "state:init"],
    fixtureRoot,
    doctorEnvironment,
  );
  const invalidDoctorEnvironment = {
    ...doctorEnvironment,
    CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
    CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
  };
  delete invalidDoctorEnvironment.OPENAI_API_KEY;
  const invalidDoctor = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "doctor"],
    {
      cwd: fixtureRoot,
      env: invalidDoctorEnvironment,
      encoding: "utf8",
    },
  );
  let invalidDoctorResult = null;
  try {
    invalidDoctorResult = JSON.parse(invalidDoctor.stdout.trim());
  } catch {
    // The assertion below reports one canonical retry-contract failure.
  }
  if (
    invalidDoctor.status === 0 ||
    invalidDoctor.signal ||
    invalidDoctorResult?.valid !== false ||
    invalidDoctorResult?.seal?.algorithm !== "sha256"
  ) {
    throw new Error("invalid doctor CLI did not emit sealed JSON and fail nonzero");
  }
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "doctor"],
    fixtureRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
    },
  );
  let state = readCertificationState(statePath);
  const sourceChecks = sourceValidationCheckSet(fixtureRoot).checks;
  const failedSourceCheckIndex = sourceChecks.length - 3;
  const failedSourceCheck = sourceChecks[failedSourceCheckIndex];
  const sourceFailureRoot = path.join(simulationRoot, "source-failure-evidence");
  mkdirSync(sourceFailureRoot, { mode: 0o700 });
  const failedSourceStatePath = path.join(
    sourceFailureRoot,
    "certification-state.json",
  );
  const doctorDescriptor = state.evidenceFiles.doctor;
  const failedDoctorPath = path.join(sourceFailureRoot, doctorDescriptor.path);
  mkdirSync(path.dirname(failedDoctorPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    failedDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  writeCertificationState(failedSourceStatePath, state);
  const failedSourceChild = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "source-validation"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceFailureRoot,
        PRODUCTION_CERTIFICATION_STATE: failedSourceStatePath,
        CERTIFICATION_STAGE_STARTED_AT: "2026-08-14T00:11:00.000Z",
        CERTIFICATION_STAGE_COMPLETED_AT: "2026-08-14T00:11:00.500Z",
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
          sourceFailureRoot,
          "invocations.log",
        ),
        CERTIFICATION_SOURCE_VALIDATION_FAIL_ID: failedSourceCheck.id,
      },
    },
  );
  const failedSourceState = readCertificationState(failedSourceStatePath);
  const failedSourceDescriptor =
    failedSourceState.evidenceFiles["source-validation"];
  const failedSourceEvidence = JSON.parse(
    readFileSync(
      path.join(sourceFailureRoot, failedSourceDescriptor.path),
      "utf8",
    ),
  );
  const failedSourceStateValidation = validateCertificationState({
    state: failedSourceState,
    evidenceRoot: sourceFailureRoot,
    expectedCandidate: failedSourceState.candidate,
    expectedHarnessSourceSha256: failedSourceState.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  let failedSourcePreventedBuild = false;
  try {
    startCertificationStage(failedSourceState, {
      stage: "build",
      startedAt: "2026-08-14T00:11:01.000Z",
    });
  } catch {
    failedSourcePreventedBuild = true;
  }
  const failedInvocationIds = readFileSync(
    path.join(sourceFailureRoot, "invocations.log"),
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (
    failedSourceChild.status === 0 ||
    failedSourceState.stages["source-validation"].status !== "failed" ||
    failedSourceState.stages["source-validation"].exitCode !== 17 ||
    failedSourceState.stages["source-validation"].consumedSubstantiveGate !==
      true ||
    failedSourceEvidence.passed !== false ||
    failedSourceEvidence.failedCheckId !== failedSourceCheck.id ||
    !failedSourceStateValidation.valid ||
    JSON.stringify(failedInvocationIds) !==
      JSON.stringify(
        sourceChecks
          .slice(0, failedSourceCheckIndex + 1)
          .map((check) => check.id),
      ) ||
    !failedSourcePreventedBuild
  ) {
    throw new Error("simulation source-check failure did not stop or block build readiness");
  }
  const sourceDriftRoot = path.join(simulationRoot, "source-drift-evidence");
  mkdirSync(sourceDriftRoot, { mode: 0o700 });
  const driftDoctorPath = path.join(sourceDriftRoot, doctorDescriptor.path);
  mkdirSync(path.dirname(driftDoctorPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    driftDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  const sourceDriftStatePath = path.join(
    sourceDriftRoot,
    "certification-state.json",
  );
  writeCertificationState(sourceDriftStatePath, state);
  const sourceDriftCheck = sourceChecks[1];
  const dirtySourcePath = path.join(
    fixtureRoot,
    ".certification-source-validation-dirty-fixture",
  );
  const sourceDriftChild = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "source-validation"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceDriftRoot,
        PRODUCTION_CERTIFICATION_STATE: sourceDriftStatePath,
        CERTIFICATION_STAGE_STARTED_AT: "2026-08-14T00:11:01.000Z",
        CERTIFICATION_STAGE_COMPLETED_AT: "2026-08-14T00:11:01.500Z",
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
          sourceDriftRoot,
          "invocations.log",
        ),
        CERTIFICATION_SOURCE_VALIDATION_DIRTY_ID: sourceDriftCheck.id,
      },
    },
  );
  if (existsSync(dirtySourcePath)) rmSync(dirtySourcePath);
  const sourceDriftState = readCertificationState(sourceDriftStatePath);
  const sourceDriftDescriptor =
    sourceDriftState.evidenceFiles["source-validation"];
  const sourceDriftEvidence = JSON.parse(
    readFileSync(
      path.join(sourceDriftRoot, sourceDriftDescriptor.path),
      "utf8",
    ),
  );
  const sourceDriftValidation = validateCertificationState({
    state: sourceDriftState,
    evidenceRoot: sourceDriftRoot,
    expectedCandidate: sourceDriftState.candidate,
    expectedHarnessSourceSha256: sourceDriftState.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  const sourceDriftAfterZeroExitRetained =
    sourceDriftChild.status !== 0 &&
    sourceDriftState.stages["source-validation"].status === "failed" &&
    sourceDriftState.stages["source-validation"].exitCode === 1 &&
    sourceDriftState.stages["source-validation"].consumedSubstantiveGate ===
      true &&
    sourceDriftEvidence.failedCheckId === sourceDriftCheck.id &&
    sourceDriftEvidence.checks.at(-1).process.exitCode === 0 &&
    sourceDriftEvidence.checks.at(-1).sourceAfter.clean === false &&
    sourceDriftValidation.valid;
  if (!sourceDriftAfterZeroExitRetained) {
    throw new Error("zero-exit source drift was not retained as a truthful failure");
  }
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "source-validation"],
    fixtureRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
        evidenceRoot,
        "source-validation-invocations.log",
      ),
    },
  );
  const sourceCheckIds = sourceValidationCheckSet(fixtureRoot).checks.map(
    (check) => check.id,
  );
  const invokedSourceChecks = readFileSync(
    path.join(evidenceRoot, "source-validation-invocations.log"),
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (JSON.stringify(invokedSourceChecks) !== JSON.stringify(sourceCheckIds)) {
    throw new Error("simulation source-validation did not invoke the canonical check closure");
  }
  state = readCertificationState(statePath);
  const successfulSourceEvidence = JSON.parse(
    readFileSync(
      path.join(
        evidenceRoot,
        state.evidenceFiles["source-validation"].path,
      ),
      "utf8",
    ),
  );
  const prohibitedSourceNames = new Set([
    "CERTIFICATION_EVIDENCE_ROOT",
    "CERTIFICATION_RUNTIME_REPORT_PATH",
    "CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH",
    "CERTIFICATION_RUNTIME_EVIDENCE_PATH",
    "CERTIFICATION_RUNTIME_START_MARKER_PATH",
    "PHASE8_EXTERNAL_EVIDENCE_ROOT",
    "PLAYWRIGHT_JSON_OUTPUT_FILE",
    "REQUIRED_TEST_REPORT_PATH",
  ]);
  if (
    successfulSourceEvidence.schema !==
      "interior-ai.production-certification-source-validation.v3" ||
    successfulSourceEvidence.checks.length !== 19 ||
    successfulSourceEvidence.checks.some(
      (check) =>
        check.environmentProfileId !== "source-validation-qualification" ||
        check.environment.prohibitedCertificationVariableAbsence.passed !== true ||
        check.environment.environmentNames.some((name) =>
          prohibitedSourceNames.has(name),
        ),
    ) ||
    !existsSync(
      path.join(evidenceRoot, state.evidenceFiles["source-validation"].path),
    )
  ) {
    throw new Error(
      "simulation realistic parent environment leaked a later-stage capability into source validation",
    );
  }
  const floorPlanSourceCheck = successfulSourceEvidence.checks.find(
    (check) => check.id === "floor-plan-required-closure",
  );
  if (
    !floorPlanSourceCheck ||
    !floorPlanSourceCheck.passed ||
    !floorPlanSourceCheck.environment.environmentNames.includes(
      "FLOOR_PLAN_VISION_ENABLED",
    ) ||
    floorPlanSourceCheck.environment.environmentNames.includes(
      "OPENAI_API_KEY",
    ) ||
    floorPlanSourceCheck.environment.appliedValuePolicies.find(
      (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
    )?.effectiveValueClassification !== "boolean:false" ||
    floorPlanSourceCheck.environment.prohibitedAmbientValueAbsence.passed !==
      true ||
    JSON.stringify(successfulSourceEvidence).includes(
      environment.OPENAI_API_KEY,
    )
  ) {
    throw new Error(
      "simulation Floor Plan source check did not receive its deterministic value policy",
    );
  }
  const projectProfile = (profileId, stage) => {
    const profile = certificationEnvironmentProfile(fixtureRoot, profileId);
    const stageInputs = Object.fromEntries(
      profile.requiredVariables.map((name) => [
        name,
        profile.fixedValues[name] ?? `simulation-${stage}-${name}`,
      ]),
    );
    return projectCertificationChildEnvironment({
      repositoryRoot: fixtureRoot,
      baseEnvironment: { ...process.env, ...environment },
      stage,
      profileId,
      stageInputs,
    });
  };
  const buildProjection = projectProfile("build", "build");
  const runtimeProjection = projectProfile("runtime-smoke", "runtime-smoke");
  for (const [profileId, stage, projection] of [
    ["build", "build", buildProjection],
    ["runtime-smoke", "runtime-smoke", runtimeProjection],
  ]) {
    if (
      projection.environment.FLOOR_PLAN_VISION_ENABLED !== "1" ||
      projection.environment.FLOOR_PLAN_VISION_MODEL !==
        "simulation-floor-plan-model" ||
      projection.environment.OPENAI_API_KEY !== environment.OPENAI_API_KEY ||
      JSON.stringify(projection.metadata).includes(environment.OPENAI_API_KEY) ||
      !validateProjectedEnvironmentMetadata({
        repositoryRoot: fixtureRoot,
        stage,
        profileId,
        metadata: projection.metadata,
      }).valid
    ) {
      throw new Error(
        `simulation ${profileId} profile did not preserve runtime Floor Plan configuration`,
      );
    }
  }
  const wrongValuePolicyHash = structuredClone(
    floorPlanSourceCheck.environment,
  );
  wrongValuePolicyHash.valuePolicySha256 = "0".repeat(64);
  const wrongValuePolicyHashRejected = !validateProjectedEnvironmentMetadata({
    repositoryRoot: fixtureRoot,
    stage: "source-validation",
    checkId: "floor-plan-required-closure",
    profileId: "source-validation-qualification",
    requiredEnvironmentNames: ["DATABASE_URL"],
    metadata: wrongValuePolicyHash,
  }).valid;
  const ambientFeatureLeak = structuredClone(floorPlanSourceCheck.environment);
  ambientFeatureLeak.environmentNames.push("OPENAI_API_KEY");
  ambientFeatureLeak.environmentNames.sort();
  ambientFeatureLeak.environmentNamesSha256 = sha256Bytes(
    canonicalJsonBytes(ambientFeatureLeak.environmentNames),
  );
  ambientFeatureLeak.prohibitedCertificationVariableAbsence.checkedNameCount =
    ambientFeatureLeak.environmentNames.length;
  const ambientFeatureFlagLeakageRejected =
    !validateProjectedEnvironmentMetadata({
      repositoryRoot: fixtureRoot,
      stage: "source-validation",
      checkId: "floor-plan-required-closure",
      profileId: "source-validation-qualification",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: ambientFeatureLeak,
    }).valid;
  const buildFixtureLeak = structuredClone(buildProjection.metadata);
  buildFixtureLeak.appliedValuePolicies.find(
    (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
  ).source = "check-owned-fixture";
  const sourceFixtureLeakIntoBuildRuntimeRejected =
    !validateProjectedEnvironmentMetadata({
      repositoryRoot: fixtureRoot,
      stage: "build",
      profileId: "build",
      metadata: buildFixtureLeak,
    }).valid;
  const importOrderDrift = structuredClone(floorPlanSourceCheck.environment);
  importOrderDrift.appliedValuePolicies.find(
    (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
  ).effectiveValueClassification = "boolean:true";
  const importOrderDriftRejected = !validateProjectedEnvironmentMetadata({
    repositoryRoot: fixtureRoot,
    stage: "source-validation",
    checkId: "floor-plan-required-closure",
    profileId: "source-validation-qualification",
    requiredEnvironmentNames: ["DATABASE_URL"],
    metadata: importOrderDrift,
  }).valid;
  if (
    !wrongValuePolicyHashRejected ||
    !ambientFeatureFlagLeakageRejected ||
    !sourceFixtureLeakIntoBuildRuntimeRejected ||
    !importOrderDriftRejected
  ) {
    throw new Error("simulation Floor Plan value-policy tamper cases were not rejected");
  }
  const wrongProfileEvidence = structuredClone(successfulSourceEvidence);
  wrongProfileEvidence.checks[0].environmentProfileId = "runtime-smoke";
  const wrongEnvironmentProfileRejected = !validateSourceValidationEvidence({
    evidence: wrongProfileEvidence,
    evidenceRoot,
    state,
    repositoryRoot: fixtureRoot,
  }).valid;
  const leakedEnvironmentEvidence = structuredClone(successfulSourceEvidence);
  leakedEnvironmentEvidence.checks[0].environment.environmentNames.push(
    "CERTIFICATION_RUNTIME_START_MARKER_PATH",
  );
  leakedEnvironmentEvidence.checks[0].environment.environmentNames.sort();
  leakedEnvironmentEvidence.checks[0].environment.environmentNamesSha256 =
    sha256Bytes(
      canonicalJsonBytes(
        leakedEnvironmentEvidence.checks[0].environment.environmentNames,
      ),
    );
  leakedEnvironmentEvidence.checks[0].environment.prohibitedCertificationVariableAbsence.checkedNameCount =
    leakedEnvironmentEvidence.checks[0].environment.environmentNames.length;
  const leakedEnvironmentVariableRejected = !validateSourceValidationEvidence({
    evidence: leakedEnvironmentEvidence,
    evidenceRoot,
    state,
    repositoryRoot: fixtureRoot,
  }).valid;
  if (!wrongEnvironmentProfileRejected || !leakedEnvironmentVariableRejected) {
    throw new Error("simulation environment-profile tamper cases were not rejected");
  }
  if (
    state.stages.doctor.attempts.length !== 2 ||
    state.stages.doctor.attempts[0].status !== "failed" ||
    state.stages.doctor.attempts[0].consumedSubstantiveGate ||
    state.stages.doctor.attempts[1].status !== "passed"
  ) {
    throw new Error("doctor non-consuming retry attempts were not physically retained");
  }
  writeMiniatureArtifact(fixtureRoot);
  const production = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-certification-simulation.mjs", "emit-production-evidence"],
      fixtureRoot,
      projectCertificationChildEnvironment({
        repositoryRoot: fixtureRoot,
        baseEnvironment: { ...process.env, ...environment },
        stage: "simulation",
        profileId: "simulation-control",
        stageInputs: {
          CERTIFICATION_ENVIRONMENT_STAGE: "simulation",
          CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
          CERTIFICATION_QUALIFICATION_MODE: "1",
          CERTIFICATION_SIMULATION_NPM_VERSION: identity.npmVersion,
          CERTIFICATION_EXPECTED_COMMIT_SHA: identity.commitSha,
          CERTIFICATION_EXPECTED_TREE_SHA: identity.treeSha,
        },
      }).environment,
    ),
  );
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "build", startedAt: nextTimestamp() },
  });
  const buildDescriptor = writeEvidence(evidenceRoot, "build/result.json", {
    schema: "interior-ai.production-certification-build-result.v1",
    identity: {
      ...identityFromState(state),
      semanticJournalNonce: FIXED_NONCE,
      productionManifestSha256: production.manifestSha256,
      semanticJournalSha256: production.journalSha256,
    },
    complete: true,
  });
  const buildBindings = {
    semanticJournalNonce: FIXED_NONCE,
    nextBuildId: production.manifest.build.nextBuildId,
    artifactSha256: production.manifest.artifact.sha256,
    productionManifestSha256: production.manifestSha256,
    semanticJournalSha256: production.journalSha256,
  };
  const immediateSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "immediateBuild",
    bindingOverrides: buildBindings,
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "build",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: {
      manifest: production.manifestSha256,
      journal: production.journalSha256,
      artifact: production.manifest.artifact.sha256,
    },
    bindingUpdates: buildBindings,
    evidenceFiles: {
      build: buildDescriptor,
      [snapshotEvidenceName("immediateBuild")]:
        immediateSnapshot.snapshotDescriptor,
      [rootEvidenceName("immediateBuild")]: immediateSnapshot.rootDescriptor,
    },
    },
  });
  const archiveEnvironment = {
    ...process.env,
    ...environment,
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    PRODUCTION_ARCHIVE_SOURCE_ROOT: fixtureRoot,
    PRODUCTION_ARCHIVE_PLAN: path.join(evidenceRoot, "archive/plan.json"),
    PRODUCTION_ARCHIVE_STAGE_ROOT: path.join(evidenceRoot, "archive/stage"),
    PRODUCTION_ARCHIVE_PATH: path.join(evidenceRoot, "archive/candidate.tar.gz"),
    PRODUCTION_ARCHIVE_EXTRACTION_ROOT: path.join(evidenceRoot, "archive/extracted"),
    PRODUCTION_EVIDENCE_EXPECTED_CANDIDATE_ID: SIMULATION_ID,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: identity.commitSha,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: identity.treeSha,
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: production.manifest.build.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: production.manifest.artifact.sha256,
  };
  mkdirSync(path.join(evidenceRoot, "archive"), { mode: 0o700 });
  run(
    process.execPath,
    ["scripts/production-archive.mjs", "plan"],
    fixtureRoot,
    archiveEnvironment,
  );
  const plan = JSON.parse(
    readFileSync(path.join(evidenceRoot, "archive/plan.json"), "utf8"),
  );
  const planDescriptor = descriptor(
    evidenceRoot,
    path.join(evidenceRoot, "archive/plan.json"),
  );
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "archive-preflight",
      startedAt: nextTimestamp(),
    },
  });
  const stageRoot = path.join(evidenceRoot, "archive", "stage");
  const staged = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "verify"],
      fixtureRoot,
      archiveEnvironment,
    ),
  );
  const preflightDescriptor = descriptor(
    evidenceRoot,
    path.join(stageRoot, ".certification/archive-preflight.json"),
  );
  const stagedSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "stagedArchive",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "archive-preflight",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { plan: planDescriptor.sha256, preflight: preflightDescriptor.sha256 },
    bindingUpdates: {
      verifierSourceClosureSha256: plan.verifierClosure.closureSha256,
    },
    evidenceFiles: {
      "archive-plan": planDescriptor,
      "archive-preflight": preflightDescriptor,
      [snapshotEvidenceName("stagedArchive")]: stagedSnapshot.snapshotDescriptor,
      [rootEvidenceName("stagedArchive")]: stagedSnapshot.rootDescriptor,
    },
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "archive", startedAt: nextTimestamp() },
  });
  const archivePath = path.join(evidenceRoot, "archive", "candidate.tar.gz");
  const compressed = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "create"],
      fixtureRoot,
      archiveEnvironment,
    ),
  );
  const repeatedArchivePath = path.join(
    evidenceRoot,
    "archive",
    "candidate-repeat.tar.gz",
  );
  chmodSync(path.join(stageRoot, "package.json"), 0o600);
  const repeatedCompression = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "create"],
      fixtureRoot,
      { ...archiveEnvironment, PRODUCTION_ARCHIVE_PATH: repeatedArchivePath },
    ),
  );
  if (repeatedCompression.archiveSha256 !== compressed.archiveSha256) {
    throw new Error("simulation archive compression is not deterministic");
  }
  rmSync(repeatedArchivePath);
  const archiveDescriptor = descriptor(evidenceRoot, archivePath);
  const inventoryDescriptor = descriptor(
    evidenceRoot,
    path.join(stageRoot, ".certification/archive-inventory.json"),
  );
  const compressedSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "compressedArchive",
    bindingOverrides: {
      archiveSha256: compressed.archiveSha256,
      archiveInventorySha256: staged.inventorySha256,
    },
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "archive",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: {
      archive: archiveDescriptor.sha256,
      inventory: inventoryDescriptor.sha256,
    },
    bindingUpdates: {
      archiveSha256: compressed.archiveSha256,
      archiveInventorySha256: staged.inventorySha256,
    },
    evidenceFiles: {
      archive: archiveDescriptor,
      "archive-inventory": inventoryDescriptor,
      [snapshotEvidenceName("compressedArchive")]:
        compressedSnapshot.snapshotDescriptor,
      [rootEvidenceName("compressedArchive")]: compressedSnapshot.rootDescriptor,
    },
    consumedSubstantiveGate: true,
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "extracted-archive-preflight",
      startedAt: nextTimestamp(),
    },
  });
  const extractionRoot = path.join(evidenceRoot, "archive", "extracted");
  const extracted = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "extract-and-verify"],
      fixtureRoot,
      archiveEnvironment,
    ),
  );
  const extractedDescriptor = descriptor(
    evidenceRoot,
    path.join(extractionRoot, ".certification/archive-preflight.json"),
  );
  const extractedSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "extractedArchive",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "extracted-archive-preflight",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { extractedInventory: extracted.inventorySha256 },
    evidenceFiles: {
      "extracted-archive-preflight": extractedDescriptor,
      [snapshotEvidenceName("extractedArchive")]:
        extractedSnapshot.snapshotDescriptor,
      [rootEvidenceName("extractedArchive")]: extractedSnapshot.rootDescriptor,
    },
    },
  });
  const phaseBoundaryArtifact = path.join(
    fixtureRoot,
    ".next/static/chunk.js",
  );
  const phaseBoundaryOriginal = readFileSync(phaseBoundaryArtifact);
  const exercisePhaseBoundaryMutation = ({ name, mutateBeforeStart }) => {
    const boundaryEvidenceRoot = path.join(
      simulationRoot,
      `phase-boundary-${name}`,
    );
    mkdirSync(boundaryEvidenceRoot, { mode: 0o700 });
    if (mutateBeforeStart) {
      writeFileSync(phaseBoundaryArtifact, `${name} mutation\n`);
    }
    const phaseBoundaryState = startCertificationStage(state, {
      stage: "phase8",
      startedAt: new Date(Date.parse(state.updatedAt) + 50).toISOString(),
    });
    if (!mutateBeforeStart) {
      writeFileSync(phaseBoundaryArtifact, `${name} mutation\n`);
    }
    let rejected = false;
    try {
      captureArtifactSnapshot({
        repositoryRoot: fixtureRoot,
        evidenceRoot: boundaryEvidenceRoot,
        state: phaseBoundaryState,
        position: "postPhase8Live",
      });
    } catch (error) {
      rejected = /physical artifact identity contradicts/.test(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      writeFileSync(phaseBoundaryArtifact, phaseBoundaryOriginal);
    }
    if (!rejected) {
      throw new Error(`physical live artifact mutation was not rejected: ${name}`);
    }
    return true;
  };
  const liveMutationBeforePhase8Rejected = exercisePhaseBoundaryMutation({
    name: "before-phase8",
    mutateBeforeStart: true,
  });
  const liveMutationDuringPhase8Rejected = exercisePhaseBoundaryMutation({
    name: "during-phase8",
    mutateBeforeStart: false,
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "phase8", startedAt: nextTimestamp() },
  });
  const phase8RawDescriptor = writeEvidence(evidenceRoot, "phase8/raw-evidence.json", {
    schema: "interior-ai.phase8-project-benchmark-evidence.v1",
    simulation: true,
    run: { nonce: "simulation-phase8-run" },
    finalPassed: true,
  });
  const phase8CompletionDescriptor = writeEvidence(
    evidenceRoot,
    "phase8/complete.json",
    {
      schema: "interior-ai.phase8-project-benchmark-parent-completion.v1",
      nonce: "simulation-phase8-run",
      reportFile: "evidence.json",
      reportSha256: phase8RawDescriptor.sha256,
    },
  );
  const phase8Descriptor = writeEvidence(
    evidenceRoot,
    "phase8/evidence.json",
    phase8Evidence(state, fixtureRoot, phase8RawDescriptor.sha256),
  );
  const postPhase8Snapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "postPhase8Live",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "phase8",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { phase8: phase8Descriptor.sha256 },
    bindingUpdates: { phase8EvidenceSha256: phase8Descriptor.sha256 },
    evidenceFiles: {
      phase8: phase8Descriptor,
      "phase8-raw": phase8RawDescriptor,
      "phase8-completion": phase8CompletionDescriptor,
      [snapshotEvidenceName("postPhase8Live")]:
        postPhase8Snapshot.snapshotDescriptor,
      [rootEvidenceName("postPhase8Live")]: postPhase8Snapshot.rootDescriptor,
    },
    consumedSubstantiveGate: true,
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "runtime-smoke", startedAt: nextTimestamp() },
  });
  const runtimeReportDescriptor = writeEvidence(
    evidenceRoot,
    "runtime-smoke/playwright-report.json",
    { schema: "interior-ai.simulated-playwright-report.v1", owner: "runtime-smoke" },
  );
  const runtimeTimingsDescriptor = writeEvidence(
    evidenceRoot,
    "runtime-smoke/phase-timings.json",
    { schema: "interior-ai.simulated-runtime-phase-timings.v1", complete: true },
  );
  const runtimeStartDescriptor = writeEvidence(
    evidenceRoot,
    "runtime-smoke/product-test-start.json",
    {
      schema: "interior-ai.production-certification-playwright-start.v1",
      boundary: "test-begin",
      gateId: "ci.production-runtime-smoke",
      project: "chromium",
      title: "simulated runtime product test",
      retry: 0,
    },
  );
  const runtimeDescriptor = writeEvidence(
    evidenceRoot,
    "runtime-smoke/evidence.json",
    runtimeEvidence(
      state,
      runtimeReportDescriptor.sha256,
      runtimeTimingsDescriptor.sha256,
    ),
  );
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "runtime-smoke",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { runtime: runtimeDescriptor.sha256 },
    bindingUpdates: { runtimeSmokeEvidenceSha256: runtimeDescriptor.sha256 },
    evidenceFiles: {
      "runtime-smoke": runtimeDescriptor,
      "runtime-report": runtimeReportDescriptor,
      "runtime-phase-timings": runtimeTimingsDescriptor,
      "runtime-start": runtimeStartDescriptor,
    },
    consumedSubstantiveGate: true,
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "browser-owners", startedAt: nextTimestamp() },
  });
  const requiredManifest = JSON.parse(
    readFileSync(path.join(fixtureRoot, "scripts/required-test-manifest.json"), "utf8"),
  );
  const browserDescriptors = {};
  const browserHashes = {};
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const gate = requiredManifest.gates.find((entry) => entry.id === owner.gateId);
    const reportDescriptor = writeEvidence(
      evidenceRoot,
      `browser-owners/${owner.id}/playwright-report.json`,
      {
        schema: "interior-ai.simulated-playwright-report.v1",
        owner: owner.id,
      },
    );
    const ownerDescriptor = writeEvidence(
      evidenceRoot,
      `browser-owners/${owner.id}/evidence.json`,
      browserEvidence(state, owner, gate, reportDescriptor.sha256),
    );
    const startDescriptor = writeEvidence(
      evidenceRoot,
      `browser-owners/${owner.id}/discovery-start.json`,
      {
        schema: "interior-ai.production-certification-playwright-start.v1",
        boundary: "discovery",
        gateId: owner.gateId,
        discoveredTestCount: gate.requiredTests.length,
      },
    );
    browserDescriptors[`browser:${owner.id}`] = ownerDescriptor;
    browserDescriptors[`browser-report:${owner.id}`] = reportDescriptor;
    browserDescriptors[`browser-start:${owner.id}`] = startDescriptor;
    browserHashes[owner.id] = ownerDescriptor.sha256;
  }
  const postBrowserSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "postRuntimeBrowserLive",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "browser-owners",
      passed: true,
      completedAt: nextTimestamp(),
      exitCode: 0,
      outputHashes: browserHashes,
      bindingUpdates: {
        browserOwnerEvidenceSha256: browserHashes,
      },
      evidenceFiles: {
        ...browserDescriptors,
        [snapshotEvidenceName("postRuntimeBrowserLive")]:
          postBrowserSnapshot.snapshotDescriptor,
        [rootEvidenceName("postRuntimeBrowserLive")]:
          postBrowserSnapshot.rootDescriptor,
      },
      consumedSubstantiveGate: true,
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "final-standalone",
      startedAt: nextTimestamp(),
    },
  });
  const final = spawnSync(
    process.execPath,
    ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
    {
      cwd: extractionRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION_CERTIFICATION_STATE: statePath,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        CERTIFICATION_ALLOW_SIMULATION: "1",
        PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: identity.commitSha,
      },
    },
  );
  if (final.status !== 0 || final.signal) {
    throw new Error(`simulation final standalone failed: ${String(final.stderr).trim()}`);
  }
  const finalValue = JSON.parse(final.stdout);
  if (finalValue.certificationComplete || !finalValue.simulationComplete) {
    throw new Error("simulation final standalone result overstated certification");
  }
  const finalDescriptor = writeEvidence(
    evidenceRoot,
    "final-standalone/evidence.json",
    finalValue,
  );
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "final-standalone",
      passed: true,
      completedAt: nextTimestamp(),
      exitCode: 0,
      outputHashes: { final: finalDescriptor.sha256 },
      evidenceFiles: { "final-standalone": finalDescriptor },
    },
  });
  const stagedRetryPath = path.join(
    evidenceRoot,
    "archive/stage/package.json",
  );
  const stagedRetryBytes = readFileSync(stagedRetryPath);
  writeFileSync(stagedRetryPath, "continuity retry mutation\n");
  const failedContinuity = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "continuity"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      },
    },
  );
  writeFileSync(stagedRetryPath, stagedRetryBytes);
  const failedContinuityState = readCertificationState(statePath);
  const failedContinuityDescriptor =
    failedContinuityState.evidenceFiles.continuity;
  const failedContinuityValidation = validateCertificationState({
    state: failedContinuityState,
    evidenceRoot,
    expectedCandidate: failedContinuityState.candidate,
    expectedHarnessSourceSha256:
      failedContinuityState.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  const continuityFailureRetryRetained =
    failedContinuity.status !== 0 &&
    failedContinuityState.stages.continuity.status === "failed" &&
    failedContinuityState.stages.continuity.consumedSubstantiveGate === false &&
    failedContinuityDescriptor.path === "continuity/attempt-001.json" &&
    failedContinuityValidation.valid;
  if (!continuityFailureRetryRetained) {
    throw new Error("failed continuity attempt was not retained as retryable evidence");
  }
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "continuity"],
    fixtureRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
    },
  );
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "state:validate"],
    fixtureRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      CERTIFICATION_INTEGRATION_BRANCH_REF: "refs/heads/integration",
      CERTIFICATION_INTEGRATION_TRACKING_REF: "refs/remotes/origin/integration",
      CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA:
        identity.integrationCommitSha,
      CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA: identity.integrationTreeSha,
    },
  );
  state = readCertificationState(statePath);
  if (
    state.stages.continuity.attempts.length !== 2 ||
    state.stages.continuity.attempts[0].status !== "failed" ||
    state.stages.continuity.attempts[1].status !== "passed" ||
    state.evidenceFiles.continuity.path !== "continuity/attempt-002.json" ||
    !existsSync(path.join(evidenceRoot, "continuity/attempt-001.json"))
  ) {
    throw new Error("continuity retry did not retain two distinct physical attempts");
  }
  const validation = validateCertificationState({
    state,
    evidenceRoot,
    expectedCandidate: state.candidate,
    expectedHarnessSourceSha256: state.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  if (!validation.valid) throw new Error(validation.issues.join("; "));
  const continuityDescriptor = state.evidenceFiles.continuity;
  const continuityValue = JSON.parse(
    readFileSync(path.join(evidenceRoot, continuityDescriptor.path), "utf8"),
  );
  const copiedHashContinuity = structuredClone(continuityValue);
  const copiedDigest = Object.values(copiedHashContinuity.inputSnapshots)[0];
  for (const position of Object.keys(copiedHashContinuity.inputSnapshots)) {
    copiedHashContinuity.inputSnapshots[position] = copiedDigest;
  }
  const copiedHashValidation = validateContinuityEvidence(
    copiedHashContinuity,
    state,
    fixtureRoot,
  );
  if (
    copiedHashValidation.valid ||
    !copiedHashValidation.issues.some((issue) => /copied|duplicated/.test(issue))
  ) {
    throw new Error("simulation copied-hash continuity bypass was not rejected");
  }
  const mutableArtifactPath = path.join(fixtureRoot, ".next/static/chunk.js");
  const originalArtifactBytes = readFileSync(mutableArtifactPath);
  const tamperStatePath = path.join(evidenceRoot, "tamper-certification-state.json");
  writeCertificationState(tamperStatePath, state);
  writeFileSync(mutableArtifactPath, "mutated simulation artifact\n");
  const physicalTamper = measureFinalContinuity({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    capturedAt: "2026-08-14T00:29:00.000Z",
    writeEvidence: false,
  });
  const tamperValidation = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "state:validate"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        PRODUCTION_CERTIFICATION_STATE: tamperStatePath,
        CERTIFICATION_INVALIDATED_AT: "2026-08-14T00:30:00.000Z",
      },
    },
  );
  writeFileSync(mutableArtifactPath, originalArtifactBytes);
  const tamperedState = readCertificationState(tamperStatePath);
  rmSync(tamperStatePath);
  const artifactMutationRejected =
    physicalTamper.issues.some((issue) =>
      /no longer matches snapshot|physical artifact identity contradicts/.test(issue),
    ) &&
    tamperValidation.status !== 0 &&
    tamperedState.stages.build.status === "invalidated" &&
    tamperedState.stages.continuity.status === "invalidated" &&
    tamperedState.stages["integration-ready"].status === "invalidated";
  if (!artifactMutationRejected) {
    throw new Error(
      `simulation artifact mutation did not block continuity and readiness: ${JSON.stringify({
        issues: physicalTamper.issues,
        status: tamperValidation.status,
        build: tamperedState.stages.build.status,
        continuity: tamperedState.stages.continuity.status,
        readiness: tamperedState.stages["integration-ready"].status,
      })}`,
    );
  }
  return {
    schema: "interior-ai.production-certification-simulation-result.v1",
    simulation: true,
    acceptedForRealCandidate: false,
    certificationId: SIMULATION_ID,
    completionState: state.completionState,
    finalStandalone: "passed-simulation-only",
    integrationReady: state.stages["integration-ready"].status === "passed",
    archiveDeterministic: true,
    sourceValidationCheckCount: sourceCheckIds.length,
    lifecycleSnapshotCount: 6,
    tamperCases: {
      sourceCheckFailurePreventsBuild: failedSourcePreventedBuild,
      failedSourceEvidenceRetained: true,
      sourceDriftAfterZeroExitRetained,
      artifactMutationPreventsContinuityAndReadiness: artifactMutationRejected,
      copiedArtifactHashRejected: true,
      continuityFailureRetryRetained,
      liveMutationBeforePhase8Rejected,
      liveMutationDuringPhase8Rejected,
      wrongEnvironmentProfileRejected,
      leakedEnvironmentVariableRejected,
      wrongValuePolicyHashRejected,
      ambientFeatureFlagLeakageRejected,
      sourceFixtureLeakIntoBuildRuntimeRejected,
      importOrderDriftRejected,
    },
    simulationRoot,
    stateSha256: sha256Bytes(readFileSync(statePath)),
  };
}

function requiredSimulationQualification() {
  if (
    process.env.CERTIFICATION_QUALIFICATION_MODE !== "1" ||
    process.env.CERTIFICATION_EXECUTION_CLASS !== "deterministic-simulation"
  ) {
    throw new Error("simulation worker is restricted to deterministic qualification");
  }
}

function containedSimulationWorkerPath(filePath, root, description) {
  const physicalRoot = realpathSync(root);
  const metadata = lstatSync(filePath);
  const physicalPath = realpathSync(filePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !physicalPath.startsWith(`${physicalRoot}${path.sep}`)
  ) {
    throw new Error(`${description} is not a contained physical file`);
  }
  return physicalPath;
}

async function simulationCli() {
  const command = process.argv[2];
  if (command === "emit-production-evidence") {
    requiredSimulationQualification();
    const identity = {
      npmVersion: process.env.CERTIFICATION_SIMULATION_NPM_VERSION,
      commitSha: process.env.CERTIFICATION_EXPECTED_COMMIT_SHA,
      treeSha: process.env.CERTIFICATION_EXPECTED_TREE_SHA,
    };
    const result = await emitProductionEvidence(process.cwd(), identity, process.env);
    process.stdout.write(canonicalJsonBytes(result));
    return;
  }
  if (command === "state:start" || command === "state:complete") {
    if (process.env.CERTIFICATION_QUALIFICATION_MODE !== "1") {
      throw new Error("simulation state worker is restricted to qualification");
    }
    const evidenceRoot = realpathSync(process.env.CERTIFICATION_EVIDENCE_ROOT);
    const statePath = containedSimulationWorkerPath(
      process.env.PRODUCTION_CERTIFICATION_STATE,
      evidenceRoot,
      "simulation state",
    );
    const requestPath = containedSimulationWorkerPath(
      process.env.CERTIFICATION_SIMULATION_STAGE_REQUEST,
      evidenceRoot,
      "simulation stage request",
    );
    const state = readCertificationState(statePath);
    if (state.executionClass !== "deterministic-simulation") {
      throw new Error("simulation state worker cannot mutate a real-candidate state");
    }
    const requestBytes = readFileSync(requestPath);
    const request = JSON.parse(requestBytes.toString("utf8"));
    if (!requestBytes.equals(canonicalJsonBytes(request))) {
      throw new Error("simulation stage request is not canonical JSON");
    }
    const next =
      command === "state:start"
        ? startCertificationStage(state, request)
        : completeCertificationStage(state, request);
    writeCertificationState(statePath, next);
    process.stdout.write(
      canonicalJsonBytes({ stage: request.stage, transition: command.slice(6) }),
    );
    return;
  }
  const result = await runProductionCertificationSimulation();
  process.stdout.write(canonicalJsonBytes(result));
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  simulationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
