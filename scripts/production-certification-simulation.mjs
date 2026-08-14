import { spawnSync } from "node:child_process";
import {
  chmodSync,
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
  PRODUCTION_CERTIFICATION_CONTINUITY_SCHEMA,
  PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  completeCertificationStage,
  readCertificationState,
  startCertificationStage,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";

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
    {
      ...process.env,
      CERTIFICATION_QUALIFICATION_MODE: "1",
      PRODUCTION_CERTIFICATION_STATE: statePath,
      CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
      CERTIFICATION_SIMULATION_STAGE_REQUEST: requestPath,
    },
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

function continuityEvidence(state) {
  const artifactSha256 = Object.fromEntries(
    [
      "immediateBuild",
      "stagedArchive",
      "compressedArchive",
      "extractedArchive",
      "postPhase8Live",
      "postRuntimeBrowserLive",
    ].map((name) => [name, state.bindings.artifactSha256]),
  );
  return {
    schema: PRODUCTION_CERTIFICATION_CONTINUITY_SCHEMA,
    identity: identityFromState(state),
    executionClass: "deterministic-simulation",
    simulation: true,
    artifactSha256,
    archiveSha256: state.bindings.archiveSha256,
    archiveInventorySha256: state.bindings.archiveInventorySha256,
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
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "state:validate"],
    fixtureRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
    },
  );
  let state = readCertificationState(statePath);
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
      {
        ...process.env,
        ...environment,
        CERTIFICATION_QUALIFICATION_MODE: "1",
        CERTIFICATION_SIMULATION_NPM_VERSION: identity.npmVersion,
      },
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
    bindingUpdates: {
      semanticJournalNonce: FIXED_NONCE,
      nextBuildId: production.manifest.build.nextBuildId,
      artifactSha256: production.manifest.artifact.sha256,
      productionManifestSha256: production.manifestSha256,
      semanticJournalSha256: production.journalSha256,
    },
    evidenceFiles: { build: buildDescriptor },
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
    evidenceFiles: { "archive-plan": planDescriptor, "archive-preflight": preflightDescriptor },
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
    evidenceFiles: { archive: archiveDescriptor, "archive-inventory": inventoryDescriptor },
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
    evidenceFiles: { "extracted-archive-preflight": extractedDescriptor },
    },
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
  const continuityDescriptor = writeEvidence(
    evidenceRoot,
    "continuity/evidence.json",
    continuityEvidence(state),
  );
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
        continuityEvidenceSha256: continuityDescriptor.sha256,
      },
      evidenceFiles: { ...browserDescriptors, continuity: continuityDescriptor },
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
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "continuity", startedAt: nextTimestamp() },
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "continuity",
      passed: true,
      completedAt: nextTimestamp(),
      exitCode: 0,
      outputHashes: { continuity: continuityDescriptor.sha256 },
      evidenceFiles: { continuity: continuityDescriptor },
    },
  });
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
  const validation = validateCertificationState({
    state,
    evidenceRoot,
    expectedCandidate: state.candidate,
    expectedHarnessSourceSha256: state.harness.sourceSha256,
  });
  if (!validation.valid) throw new Error(validation.issues.join("; "));
  return {
    schema: "interior-ai.production-certification-simulation-result.v1",
    simulation: true,
    acceptedForRealCandidate: false,
    certificationId: SIMULATION_ID,
    completionState: state.completionState,
    finalStandalone: "passed-simulation-only",
    integrationReady: state.stages["integration-ready"].status === "passed",
    archiveDeterministic: true,
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
