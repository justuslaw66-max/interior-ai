import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CERTIFICATION_FAILURE_CLASSIFICATIONS,
  CERTIFICATION_STAGE_ORDER,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  harnessSourceIdentity,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  assertFileBackedOwner,
  runCertificationDoctor,
} from "./production-certification-doctor.mjs";
import {
  certificationStateSealIssues,
  completeCertificationStage,
  createCertificationState,
  invalidateCertificationState,
  readCertificationState,
  startCertificationStage,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import { runProductionCertificationSimulation } from "./production-certification-simulation.mjs";
import {
  absentEvidenceTarget,
  assertCanonicalExtractedArchiveRoot,
  assertCertificationChildPassed,
  browserEnvironment,
  certificationStageFailure,
} from "./production-certification-real.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";
import CertificationPlaywrightStartReporter from "./certification-playwright-start-reporter.mjs";
import {
  resolvePlaywrightReportPath,
  resolveRequiredTestReportPath,
} from "./playwright-report-path.mjs";

const repositoryRoot = process.cwd();
const fixedTime = "2026-08-14T00:00:00.000Z";
const candidate = {
  id: "certification-test-candidate",
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  parentSha: "9".repeat(40),
};
const coveredRegressionIds = new Set();

function finalSimulationChild(
  simulationRoot,
  { allowSimulation = true, artifactRoot } = {},
) {
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const state = readCertificationState(statePath);
  const environment = {
    ...process.env,
    PRODUCTION_CERTIFICATION_STATE: statePath,
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
  };
  if (allowSimulation) environment.CERTIFICATION_ALLOW_SIMULATION = "1";
  return spawnSync(
    process.execPath,
    ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
    {
      cwd: artifactRoot ?? path.join(evidenceRoot, "archive/extracted"),
      env: environment,
      encoding: "utf8",
    },
  );
}

function cloneSimulation(simulationRoot) {
  const root = mkdtempSync(path.join(tmpdir(), "certification-negative-"));
  const clone = path.join(root, "fixture");
  cpSync(simulationRoot, clone, { recursive: true, verbatimSymlinks: true });
  return clone;
}

function mutateBoundEvidence(simulationRoot, name, mutate, binding) {
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const state = readCertificationState(statePath);
  const descriptor = state.evidenceFiles[name];
  const evidencePath = path.join(evidenceRoot, descriptor.path);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  mutate(evidence);
  writeFileSync(evidencePath, canonicalJsonBytes(evidence));
  descriptor.sha256 = sha256Bytes(readFileSync(evidencePath));
  if (binding?.startsWith("browser:")) {
    state.bindings.browserOwnerEvidenceSha256[binding.slice("browser:".length)] =
      descriptor.sha256;
  } else if (binding) {
    state.bindings[binding] = descriptor.sha256;
  }
  writeCertificationState(statePath, state);
}

function mutateExtractedManifest(simulationRoot, mutate) {
  const manifestPath = path.join(
    simulationRoot,
    "evidence/archive/extracted/.local/production-artifact-evidence/manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mutate(manifest);
  writeFileSync(manifestPath, canonicalJsonBytes(manifest));
  writeFileSync(
    `${manifestPath}.sha256`,
    `${sha256Bytes(readFileSync(manifestPath))}  manifest.json\n`,
  );
}

function stateFixture() {
  return createCertificationState({
    certificationId: "certification-test",
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    treeSha: candidate.treeSha,
    parentSha: candidate.parentSha,
    harnessSourceSha256: "c".repeat(64),
    executionClass: "deterministic-simulation",
    createdAt: fixedTime,
  });
}

{
  const state = stateFixture();
  assert.equal(state.schema, PRODUCTION_CERTIFICATION_STATE_SCHEMA);
  assert.deepEqual(Object.keys(state.stages), CERTIFICATION_STAGE_ORDER);
  assert.throws(
    () => startCertificationStage(state, { stage: "build", startedAt: fixedTime }),
    /requires passed prior stage doctor/,
  );
  const edited = structuredClone(state);
  edited.candidate.treeSha = "d".repeat(40);
  assert.deepEqual(certificationStateSealIssues(edited), [
    "certification state seal mismatch; manual editing is not accepted",
  ]);
  assert.throws(
    () =>
      createCertificationState({
        certificationId: "certification-test",
        candidateId: "bad candidate",
        commitSha: candidate.commitSha,
        treeSha: candidate.treeSha,
        parentSha: candidate.parentSha,
        harnessSourceSha256: "c".repeat(64),
        executionClass: "real-candidate",
        createdAt: fixedTime,
      }),
    /canonical grammar/,
  );
  coveredRegressionIds.add(3);
}

{
  let state = stateFixture();
  state = startCertificationStage(state, { stage: "doctor", startedAt: fixedTime });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: false,
    completedAt: "2026-08-14T00:00:00.100Z",
    exitCode: 1,
    failureClassification: "PRECONDITION_ORCHESTRATION_FAILURE",
    consumedSubstantiveGate: true,
  });
  assert.throws(
    () =>
      startCertificationStage(state, {
        stage: "doctor",
        startedAt: "2026-08-14T00:00:00.200Z",
      }),
    /cannot be restarted/,
  );
  const invalidated = invalidateCertificationState(state, {
    stage: "build",
    reason: "source changed",
    invalidatedAt: "2026-08-14T00:00:00.300Z",
  });
  assert.equal(invalidated.stages.build.status, "invalidated");
  assert.equal(invalidated.stages.phase8.status, "invalidated");
}

{
  let state = stateFixture();
  state = startCertificationStage(state, { stage: "doctor", startedAt: fixedTime });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: false,
    completedAt: "2026-08-14T00:00:00.100Z",
    exitCode: 1,
    failureClassification: "PRECONDITION_ORCHESTRATION_FAILURE",
    consumedSubstantiveGate: false,
  });
  state = startCertificationStage(state, {
    stage: "doctor",
    startedAt: "2026-08-14T00:00:00.200Z",
  });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-14T00:00:00.300Z",
    exitCode: 0,
    outputHashes: { doctor: "d".repeat(64) },
    evidenceFiles: {
      doctor: { path: "doctor/attempt-002.json", sha256: "d".repeat(64) },
    },
  });
  assert.deepEqual(
    state.stages.doctor.attempts.map((attempt) => ({
      number: attempt.number,
      status: attempt.status,
      consumed: attempt.consumedSubstantiveGate,
    })),
    [
      { number: 1, status: "failed", consumed: false },
      { number: 2, status: "passed", consumed: false },
    ],
  );
}

{
  const root = mkdtempSync(path.join(tmpdir(), "certification-state-hash-"));
  const evidencePath = path.join(root, "doctor.json");
  writeFileSync(evidencePath, "{}\n");
  let state = stateFixture();
  state = startCertificationStage(state, { stage: "doctor", startedAt: fixedTime });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-14T00:00:00.100Z",
    exitCode: 0,
    outputHashes: { doctor: sha256Bytes("{}\n") },
    evidenceFiles: {
      doctor: { path: "doctor.json", sha256: sha256Bytes("{}\n") },
    },
  });
  assert.equal(
    validateCertificationState({
      state,
      evidenceRoot: root,
      expectedCandidate: candidate,
      expectedHarnessSourceSha256: "c".repeat(64),
    }).valid,
    true,
  );
  writeFileSync(evidencePath, "{\"changed\":true}\n");
  assert.match(
    validateCertificationState({
      state,
      evidenceRoot: root,
      expectedCandidate: candidate,
      expectedHarnessSourceSha256: "c".repeat(64),
    }).issues.join("\n"),
    /evidence doctor hash mismatch/,
  );
}

{
  const base = mkdtempSync(path.join(tmpdir(), "certification-paths-"));
  const sourceRoot = path.join(base, "source");
  const evidenceRoot = path.join(base, "evidence");
  const ownerRoot = path.join(evidenceRoot, "owner");
  const outsideRoot = path.join(base, "outside");
  for (const directory of [sourceRoot, evidenceRoot, ownerRoot, outsideRoot]) {
    mkdirSync(directory, { recursive: true });
  }
  const runtimePath = path.join(ownerRoot, "runtime.json");
  assert.equal(
    resolvePlaywrightReportPath({
      requestedPath: runtimePath,
      repositoryRoot: sourceRoot,
      authorizedExternalRoot: evidenceRoot,
    }).destinationClass,
    "external-evidence-root",
    "repository-relative-only rejection of a safe external path must not recur",
  );
  const owner = REQUIRED_BROWSER_OWNERS[0];
  const ownerPath = path.join(ownerRoot, "owner.json");
  assert.equal(
    resolveRequiredTestReportPath({
      requestedPath: ownerPath,
      repositoryRoot: sourceRoot,
      gateId: owner.gateId,
      authorizedExternalRoot: evidenceRoot,
    }).outputPath,
    ownerPath,
  );
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: undefined,
        repositoryRoot: sourceRoot,
        gateId: owner.gateId,
        authorizedExternalRoot: evidenceRoot,
      }),
    /is required/,
  );
  const missingPlaywrightEnvironment = {};
  assert.throws(
    () =>
      resolvePlaywrightReportPath({
        requestedPath:
          missingPlaywrightEnvironment.PLAYWRIGHT_JSON_OUTPUT_FILE,
        repositoryRoot: sourceRoot,
        authorizedExternalRoot: evidenceRoot,
      }),
    /is required/,
  );
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: path.join(outsideRoot, "outside.json"),
        repositoryRoot: sourceRoot,
        gateId: owner.gateId,
        authorizedExternalRoot: evidenceRoot,
      }),
    /beneath the authorized external evidence root/,
  );
  writeFileSync(ownerPath, "{}\n");
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: ownerPath,
        repositoryRoot: sourceRoot,
        gateId: owner.gateId,
        authorizedExternalRoot: evidenceRoot,
      }),
    /must not already exist/,
  );
  coveredRegressionIds.add(4);
  coveredRegressionIds.add(5);
  coveredRegressionIds.add(6);
}

{
  const evidenceRoot = mkdtempSync(
    path.join(tmpdir(), "certification-start-markers-"),
  );
  const discoveryPath = path.join(evidenceRoot, "browser/discovery.json");
  mkdirSync(path.dirname(discoveryPath), { recursive: true });
  const discoveryReporter = new CertificationPlaywrightStartReporter({
    markerPath: discoveryPath,
    boundary: "discovery",
    gateId: "ci.test-browser-owner",
  });
  discoveryReporter.onBegin(null, { allTests: () => [{}, {}] });
  assert.deepEqual(JSON.parse(readFileSync(discoveryPath, "utf8")), {
    schema: "interior-ai.production-certification-playwright-start.v1",
    boundary: "discovery",
    gateId: "ci.test-browser-owner",
    discoveredTestCount: 2,
  });

  const runtimePath = path.join(evidenceRoot, "runtime/start.json");
  mkdirSync(path.dirname(runtimePath), { recursive: true });
  const runtimeReporter = new CertificationPlaywrightStartReporter({
    markerPath: runtimePath,
    boundary: "test-begin",
    gateId: "ci.production-runtime-smoke",
  });
  runtimeReporter.onBegin(null, { allTests: () => [{}] });
  assert.equal(existsSync(runtimePath), false);
  runtimeReporter.onTestBegin(
    { title: "runtime product assertion", parent: {} },
    { retry: 0 },
  );
  assert.equal(
    JSON.parse(readFileSync(runtimePath, "utf8")).boundary,
    "test-begin",
  );

  const staleMarker = path.join(evidenceRoot, "browser-owner/stale.json");
  mkdirSync(path.dirname(staleMarker), { recursive: true });
  writeFileSync(staleMarker, "{}\n");
  assert.throws(
    () => absentEvidenceTarget(evidenceRoot, "browser-owner/stale.json"),
    /must be absent/,
    "a stale browser start marker must fail before discovery without consumption",
  );
  rmSync(evidenceRoot, { recursive: true, force: true });
}

{
  for (const [stage, classification] of [
    ["phase8", "PERFORMANCE_GATE_FAILURE"],
    ["runtime-smoke", "FINAL_EVIDENCE_FAILURE"],
    ["browser-owners", "FINAL_EVIDENCE_FAILURE"],
  ]) {
    const failure = certificationStageFailure(
      new Error(`${stage} post-boundary evidence processing failed`),
      { consumed: true, classification },
    );
    assert.equal(failure.consumed, true);
    assert.equal(failure.classification, classification);
    assert.match(failure.message, /post-boundary evidence processing failed/);
  }
}

{
  const evidenceRoot = mkdtempSync(
    path.join(tmpdir(), "certification-final-extraction-"),
  );
  const extracted = path.join(evidenceRoot, "archive/extracted");
  const alternate = path.join(evidenceRoot, "archive/staged");
  mkdirSync(extracted, { recursive: true });
  mkdirSync(alternate, { recursive: true });
  assert.equal(assertCanonicalExtractedArchiveRoot(evidenceRoot), extracted);
  assert.throws(
    () => assertCanonicalExtractedArchiveRoot(evidenceRoot, alternate),
    /requires the canonical extracted archive/,
  );
  rmSync(extracted, { recursive: true });
  symlinkSync(alternate, extracted, "dir");
  assert.throws(
    () => assertCanonicalExtractedArchiveRoot(evidenceRoot),
    /physical directory/,
  );
  rmSync(evidenceRoot, { recursive: true, force: true });
}

{
  const closure = deriveProductionVerifierClosure(repositoryRoot);
  assert.ok(closure.files.length > 9);
  assert.ok(closure.edges.some((edge) => edge.kind === "local"));
  assert.equal(closure.missingImports.length, 0);
  assert.equal(closure.sourceWorktreeFallback, false);
  const fixture = mkdtempSync(path.join(tmpdir(), "certification-closure-"));
  for (const file of closure.files) {
    const destination = path.join(fixture, file.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(repositoryRoot, file.path), destination);
  }
  const removable = closure.edges.find(
    (edge) => edge.kind === "local" && edge.resolution.endsWith(".mjs"),
  );
  rmSync(path.join(fixture, removable.resolution));
  assert.throws(
    () => deriveProductionVerifierClosure(fixture),
    /verifier (?:source|local import) is missing/,
    "a missing transitive verifier dependency must fail closed",
  );
  const resolverSource = readFileSync("scripts/production-verifier-closure.mjs", "utf8");
  assert.doesNotMatch(resolverSource, /import\.meta\.resolve\s*\(/);
  coveredRegressionIds.add(12);
  coveredRegressionIds.add(13);
  coveredRegressionIds.add(14);
}

{
  const artifactContract = readFileSync("scripts/production-artifact-contract.mjs", "utf8");
  const artifactOwner = readFileSync("scripts/production-artifact-evidence.mjs", "utf8");
  const archiveOwner = readFileSync("scripts/production-archive.mjs", "utf8");
  const finalOwner = readFileSync("scripts/production-certification-evidence.mjs", "utf8");
  const phase8Owner = readFileSync("scripts/run-phase8-project-benchmark.ts", "utf8");
  assert.match(artifactContract, /production-artifact-evidence\.v3/);
  assert.doesNotMatch(artifactContract, /production-artifact-evidence\.v2/);
  assert.match(artifactOwner, /testPolicy: "external-certification-required"/);
  assert.doesNotMatch(artifactOwner, /requireTests:\s*false/);
  assert.match(artifactOwner, /verifyFinalCertificationEvidence/);
  for (const marker of ["phase8", "runtime-smoke", "browser:", "continuity"]) {
    assert.ok(finalOwner.includes(marker), `final verifier must bind ${marker}`);
  }
  assert.match(finalOwner, /deterministic simulation evidence cannot certify a real candidate/);
  assert.match(archiveOwner, /verify-archive-preflight/);
  assert.match(archiveOwner, /deterministicArchive/);
  assert.doesNotMatch(archiveOwner, /\btee\b|data:text\/javascript|\beval\s*\(/);
  assert.match(phase8Owner, /PHASE8_EXTERNAL_EVIDENCE_ROOT/);
  assert.match(phase8Owner, /CERTIFICATION_EVIDENCE_ROOT/);
}

{
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const source = readFileSync(owner.config, "utf8");
    assert.match(source, /requiredTestPlaywrightEvidence/);
    assert.doesNotMatch(source, /must remain repository-relative/);
    assert.ok(source.includes(owner.gateId));
  }
  assert.equal(new Set(REQUIRED_BROWSER_OWNERS.map((owner) => owner.id)).size, 7);
}

{
  const owner = REQUIRED_BROWSER_OWNERS[0];
  const environment = browserEnvironment(
    {
      environment: {
        REQUIRED_TEST_SOURCE_COMMIT_SHA: "0".repeat(40),
        REQUIRED_TEST_SOURCE_TREE_SHA: "1".repeat(40),
      },
      evidenceRoot: "/external/certification-evidence",
    },
    {
      candidate,
      harness: { version: 1, sourceSha256: "c".repeat(64) },
      bindings: {
        artifactSha256: "d".repeat(64),
        nextBuildId: "build-id",
      },
    },
    owner,
    "/external/certification-evidence/report.json",
    "/external/certification-evidence/evidence.json",
    "/external/certification-evidence/start.json",
  );
  assert.equal(environment.REQUIRED_TEST_SOURCE_COMMIT_SHA, candidate.commitSha);
  assert.equal(environment.REQUIRED_TEST_SOURCE_TREE_SHA, candidate.treeSha);
  assert.equal(environment.APP_ENV, owner.applicationEnvironment);
  assert.equal(environment.NEXT_PUBLIC_APP_ENV, owner.applicationEnvironment);
}

{
  const missingEnvironment = {
    DATABASE_URL: "not-a-database-url",
    APP_ORIGIN: "credential://unsafe",
    CERTIFICATION_EXPECTED_COMMIT_SHA: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).stdout.trim(),
    CERTIFICATION_EXPECTED_TREE_SHA: "e".repeat(40),
    CERTIFICATION_EXPECTED_PARENT_SHA: spawnSync("git", ["rev-parse", "HEAD^"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).stdout.trim(),
  };
  const doctor = runCertificationDoctor({
    repositoryRoot,
    environment: missingEnvironment,
  });
  assert.equal(doctor.valid, false);
  assert.ok(doctor.issues.length >= 5, "doctor must report every pre-consumption gap");
  assert.doesNotMatch(JSON.stringify(doctor), /not-a-database-url|credential:\/\/unsafe/);
  assert.match(doctor.issues.join("\n"), /candidate-id/);
  assert.match(doctor.issues.join("\n"), /source tree does not match/);
  coveredRegressionIds.add(1);
  coveredRegressionIds.add(2);
}

{
  const root = mkdtempSync(path.join(tmpdir(), "certification-file-owner-"));
  writeFileSync(path.join(root, "owner.mjs"), "export default 'data:text/javascript,pass';\n");
  assert.throws(
    () => assertFileBackedOwner(root, "owner.mjs"),
    /data URL, eval, or stdin execution/,
  );
  rmSync(root, { recursive: true, force: true });
  coveredRegressionIds.add(11);
}

{
  const regressions = JSON.parse(
    readFileSync("scripts/production-certification-regressions.json", "utf8"),
  );
  assert.equal(regressions.cases.length, 26);
  assert.deepEqual(
    regressions.cases.map((entry) => entry.id),
    Array.from({ length: 26 }, (_, index) => index + 1),
  );
  assert.equal(new Set(regressions.cases.map((entry) => entry.defect)).size, 26);
}

{
  const configEvidenceRoot = mkdtempSync(
    path.join(tmpdir(), "certification-config-list-"),
  );
  const commitSha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const treeSha = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const harnessSha256 = harnessSourceIdentity(repositoryRoot).sha256;
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const environment = { ...process.env };
    for (const name of Object.keys(environment)) {
      if (name.startsWith("REQUIRED_TEST_")) delete environment[name];
    }
    environment.APP_ENV = owner.applicationEnvironment;
    environment.NEXT_PUBLIC_APP_ENV = owner.applicationEnvironment;
    environment.CI = "true";
    delete environment.VERCEL_ENV;
    delete environment.PLAYWRIGHT_RELEASE_BASE_URL;
    environment.DATABASE_URL ||= "postgresql://list:list@127.0.0.1:5432/list";
    if (owner.productionServer) environment.PLAYWRIGHT_USE_PRODUCTION_SERVER = "1";
    else delete environment.PLAYWRIGHT_USE_PRODUCTION_SERVER;
    if (owner.id === "public-share") environment.CATALOG_STRICT_VALIDATION = "true";
    else delete environment.CATALOG_STRICT_VALIDATION;
    const ownerRoot = path.join(configEvidenceRoot, owner.id);
    mkdirSync(ownerRoot);
    environment.CERTIFICATION_EVIDENCE_ROOT = configEvidenceRoot;
    environment.REQUIRED_TEST_GATE_ID = owner.gateId;
    environment.REQUIRED_TEST_REPORT_PATH = path.join(ownerRoot, "playwright.json");
    environment.REQUIRED_TEST_SOURCE_COMMIT_SHA = commitSha;
    environment.REQUIRED_TEST_SOURCE_TREE_SHA = treeSha;
    environment.REQUIRED_TEST_ARTIFACT_SHA256 = "a".repeat(64);
    environment.REQUIRED_TEST_BUILD_ID = "config-list-build";
    environment.REQUIRED_TEST_RELEASE_CANDIDATE_ID = "config-list-candidate";
    environment.REQUIRED_TEST_RELEASE_ENVIRONMENT = owner.applicationEnvironment;
    environment.REQUIRED_TEST_HARNESS_VERSION = "1";
    environment.REQUIRED_TEST_HARNESS_SOURCE_SHA256 = harnessSha256;
    const listed = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", "--config", owner.config, "--list"],
      { cwd: repositoryRoot, env: environment, encoding: "utf8" },
    );
    assert.equal(
      listed.status,
      0,
      `${owner.id} config must list through the real Playwright CLI: ${listed.stderr}`,
    );
    assert.match(listed.stdout, /Total: \d+ tests? in \d+ files?/);
  }
  rmSync(configEvidenceRoot, { recursive: true, force: true });
  coveredRegressionIds.add(4);
}

{
  const pathRoot = mkdtempSync(path.join(tmpdir(), "phase8-path-negative-"));
  const evidenceRoot = path.join(pathRoot, "evidence");
  const outsideRoot = path.join(pathRoot, "outside");
  mkdirSync(evidenceRoot);
  mkdirSync(outsideRoot);
  symlinkSync(outsideRoot, path.join(evidenceRoot, "phase8"));
  const child = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "ts-node",
      "--transpile-only",
      "--compiler-options",
      '{"module":"CommonJS","moduleResolution":"node"}',
      "-r",
      "tsconfig-paths/register",
      "scripts/run-phase8-project-benchmark.ts",
      "--validate-evidence-destination-only",
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PHASE8_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(child.status, 0);
  assert.match(`${child.stdout}\n${child.stderr}`, /must be physical/);
  rmSync(pathRoot, { recursive: true, force: true });
  coveredRegressionIds.add(20);
}

{
  const simulation = await runProductionCertificationSimulation();
  const base = simulation.simulationRoot;
  assert.equal(simulation.integrationReady, true);
  const completeFinalChild = finalSimulationChild(base);
  assert.equal(completeFinalChild.status, 0);
  const completeFinal = JSON.parse(completeFinalChild.stdout.trim());
  assert.match(completeFinal.identity.archiveInventorySha256, /^[0-9a-f]{64}$/);
  assert.match(completeFinal.identity.phase8CompletionSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    Object.keys(completeFinal.identity.browserReportSha256),
    REQUIRED_BROWSER_OWNERS.map((owner) => owner.id),
  );

  {
    const child = finalSimulationChild(base, {
      artifactRoot: path.join(base, "evidence/archive/stage"),
    });
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /not canonical physical paths/,
      "the direct standalone CLI must reject staged bytes",
    );
  }

  {
    const clone = cloneSimulation(base);
    const state = readCertificationState(
      path.join(clone, "evidence/certification-state.json"),
    );
    unlinkSync(
      path.join(
        clone,
        "evidence",
        state.evidenceFiles["phase8-completion"].path,
      ),
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /missing|unreadable/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  for (const [id, evidenceName] of [
    [16, "phase8"],
    [17, "runtime-smoke"],
  ]) {
    const clone = cloneSimulation(base);
    const state = readCertificationState(
      path.join(clone, "evidence/certification-state.json"),
    );
    unlinkSync(path.join(clone, "evidence", state.evidenceFiles[evidenceName].path));
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /unavailable|missing|unreadable/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(id);
  }

  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const clone = cloneSimulation(base);
    const state = readCertificationState(
      path.join(clone, "evidence/certification-state.json"),
    );
    unlinkSync(
      path.join(clone, "evidence", state.evidenceFiles[`browser:${owner.id}`].path),
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0, `missing ${owner.id} evidence must fail final`);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }
  coveredRegressionIds.add(18);

  {
    const clone = cloneSimulation(base);
    const owner = REQUIRED_BROWSER_OWNERS[0];
    mutateBoundEvidence(
      clone,
      `browser:${owner.id}`,
      (evidence) => {
        evidence.identity.commitSha = "f".repeat(40);
      },
      `browser:${owner.id}`,
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /another candidate, artifact, or harness/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(19);
  }

  for (const mutation of [
    {
      name: "phase8",
      binding: "phase8EvidenceSha256",
      mutate(evidence) {
        evidence.measurements[0].operations[0].passed = false;
      },
      expected: /Phase 8 small fingerprintCold raw evidence is incomplete/,
    },
    {
      name: "runtime-smoke",
      binding: "runtimeSmokeEvidenceSha256",
      mutate(evidence) {
        evidence.tests[0].outcome = "failed";
      },
      expected: /per-test outcomes contradict/,
    },
    {
      name: `browser:${REQUIRED_BROWSER_OWNERS[0].id}`,
      binding: `browser:${REQUIRED_BROWSER_OWNERS[0].id}`,
      mutate(evidence) {
        evidence.tests[0].skipped = true;
      },
      expected: /outcomes are not complete and clean/,
    },
  ]) {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(clone, mutation.name, mutation.mutate, mutation.binding);
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, mutation.expected);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }
  coveredRegressionIds.add(24);

  {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(
      clone,
      "continuity",
      (evidence) => {
        evidence.artifactSha256.extractedArchive = "0".repeat(64);
      },
      "continuityEvidenceSha256",
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /continuity hashes are incomplete or contradictory/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(25);
  }

  {
    const child = finalSimulationChild(base, { allowSimulation: false });
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /cannot certify a real candidate/);
    coveredRegressionIds.add(26);
  }

  {
    const clone = cloneSimulation(base);
    unlinkSync(
      path.join(
        clone,
        "evidence/archive/extracted/.local/production-artifact-evidence/semantic-event-journal.json",
      ),
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /semantic journal v1 is missing/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(8);
  }

  {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(clone, "archive-inventory", (inventory) => {
      inventory.inventorySha256 = "f".repeat(64);
    });
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /archive inventory (?:semantic digest|evidence does not match)/,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  for (const mutation of [
    {
      id: 7,
      mutate(manifest) {
        manifest.schema = "interior-ai.production-artifact-evidence.v2";
        manifest.validatorVersion = 2;
      },
      expected: /unsupported production evidence schema or validator version/,
    },
    {
      id: 9,
      mutate(manifest) {
        manifest.build.mtime = manifest.build.completedAt;
      },
      expected: /filesystem timestamps cannot populate portable semantic evidence/,
    },
    {
      id: 10,
      mutate(manifest) {
        manifest.generatedSourceCheck.completedAt = manifest.build.completedAt;
        manifest.build.startedAt = manifest.generatedSourceCheck.startedAt;
      },
      expected: /evidence timestamps are stale or contradictory|generated-source\/build ordering invalid/,
    },
    {
      id: 21,
      mutate(manifest) {
        manifest.generatedSourceCheck.command = "noncanonical-generated-source-check";
      },
      expected: /generated-source drift check command is not canonical/,
    },
  ]) {
    const clone = cloneSimulation(base);
    mutateExtractedManifest(clone, mutation.mutate);
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, mutation.expected);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(mutation.id);
  }

  {
    const clone = cloneSimulation(base);
    const statePath = path.join(clone, "evidence/certification-state.json");
    const state = readCertificationState(statePath);
    state.stages["archive-preflight"].status = "pending";
    writeCertificationState(statePath, state);
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /requires passed stage archive-preflight/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(15);
  }

  {
    const child = spawnSync(
      process.execPath,
      ["scripts/production-archive.mjs", "plan"],
      {
        cwd: path.join(base, "source"),
        env: { ...process.env, PRODUCTION_ARCHIVE_PLAN: "" },
        encoding: "utf8",
      },
    );
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /archive plan path must be absolute/);
  }

  {
    const child = spawnSync(process.execPath, ["-e", "process.exit(17)"], {
      encoding: "utf8",
    });
    assert.throws(
      () =>
        assertCertificationChildPassed(
          child,
          "producer child failed",
          "ARCHIVE_FAILURE",
          true,
        ),
      (error) => {
        assert.equal(error.message, "producer child failed");
        assert.equal(error.exitCode, 17);
        assert.equal(error.classification, "ARCHIVE_FAILURE");
        assert.equal(error.consumed, true);
        return true;
      },
      "a producer child nonzero exit must propagate through the harness adapter",
    );
    coveredRegressionIds.add(23);
  }

  {
    const clone = cloneSimulation(base);
    const evidenceRoot = path.join(clone, "evidence");
    const state = readCertificationState(
      path.join(evidenceRoot, "certification-state.json"),
    );
    const owner = REQUIRED_BROWSER_OWNERS[0];
    const rawDescriptor = state.evidenceFiles[`browser-report:${owner.id}`];
    unlinkSync(path.join(evidenceRoot, rawDescriptor.path));
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /browser-report:|missing or unreadable/,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(22);
  }

  for (const target of ["package.json", ".next/BUILD_ID"]) {
    const clone = cloneSimulation(base);
    const sourceRoot = path.join(clone, "source");
    const statePath = path.join(clone, "evidence/certification-state.json");
    const state = readCertificationState(statePath);
    writeFileSync(path.join(sourceRoot, target), `changed-${target}\n`);
    const child = spawnSync(
      process.execPath,
      ["scripts/production-certification.mjs", "state:validate"],
      {
        cwd: sourceRoot,
        env: {
          ...process.env,
          PRODUCTION_CERTIFICATION_STATE: statePath,
          CERTIFICATION_EVIDENCE_ROOT: path.join(clone, "evidence"),
          PRODUCTION_EVIDENCE_CANDIDATE_ID: state.candidate.id,
          CERTIFICATION_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
          CERTIFICATION_EXPECTED_TREE_SHA: state.candidate.treeSha,
          CERTIFICATION_EXPECTED_PARENT_SHA: state.candidate.parentSha,
          CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
          CERTIFICATION_QUALIFICATION_MODE: "1",
          CERTIFICATION_INVALIDATED_AT: "2026-08-14T00:20:00.000Z",
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(child.status, 0);
    const invalidated = readCertificationState(statePath);
    assert.equal(
      invalidated.stages[target === "package.json" ? "source-validation" : "build"].status,
      "invalidated",
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }
  {
    const clone = cloneSimulation(base);
    const sourceRoot = path.join(clone, "source");
    const evidenceRoot = path.join(clone, "evidence");
    const statePath = path.join(evidenceRoot, "certification-state.json");
    const state = readCertificationState(statePath);
    const movedTracking = spawnSync(
      "git",
      [
        "update-ref",
        "refs/remotes/origin/integration",
        state.candidate.commitSha,
      ],
      { cwd: sourceRoot, encoding: "utf8" },
    );
    assert.equal(movedTracking.status, 0);
    const child = spawnSync(
      process.execPath,
      ["scripts/production-certification.mjs", "state:validate"],
      {
        cwd: sourceRoot,
        env: {
          ...process.env,
          PRODUCTION_CERTIFICATION_STATE: statePath,
          CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
          PRODUCTION_EVIDENCE_CANDIDATE_ID: state.candidate.id,
          CERTIFICATION_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
          CERTIFICATION_EXPECTED_TREE_SHA: state.candidate.treeSha,
          CERTIFICATION_EXPECTED_PARENT_SHA: state.candidate.parentSha,
          CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
          CERTIFICATION_QUALIFICATION_MODE: "1",
          CERTIFICATION_INVALIDATED_AT: "2026-08-14T00:30:00.000Z",
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /integration readiness/);
    assert.equal(
      readCertificationState(statePath).stages["integration-ready"].status,
      "invalidated",
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  rmSync(base, { recursive: true, force: true });
}

assert.deepEqual(
  [...coveredRegressionIds].sort((left, right) => left - right),
  Array.from({ length: 26 }, (_, index) => index + 1),
  "every documented regression must be exercised by an executable assertion",
);

assert.deepEqual(CERTIFICATION_FAILURE_CLASSIFICATIONS, [
  "PRECONDITION_ORCHESTRATION_FAILURE",
  "INFRASTRUCTURE_TRANSIENT",
  "SOURCE_CONTRACT_FAILURE",
  "BUILD_FAILURE",
  "ARCHIVE_FAILURE",
  "PERFORMANCE_GATE_FAILURE",
  "PRODUCT_ASSERTION_FAILURE",
  "ARTIFACT_CONTINUITY_FAILURE",
  "FINAL_EVIDENCE_FAILURE",
]);
assert.ok(harnessSourceIdentity(repositoryRoot).sha256.match(/^[0-9a-f]{64}$/));
assert.equal(
  CERTIFICATION_STAGE_ORDER.length,
  12,
  "Production certification harness tests passed.",
);

console.log("Production certification harness tests passed.");
