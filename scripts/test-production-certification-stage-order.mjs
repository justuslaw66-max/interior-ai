import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CERTIFICATION_STAGE_ORDER,
  PRODUCTION_CERTIFICATION_RESOURCE_PLAN_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import { validateCertificationStageOrderContracts } from "./production-certification-doctor.mjs";
import {
  certificationStateSha256,
  completeCertificationStage,
  createCertificationState,
  readCertificationState,
  replaceCertificationDatabaseLifecycle,
  startCertificationStage,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA,
} from "./production-certification-worktrees.mjs";

const repositoryRoot = process.cwd();
const startingCommit = "ec56e6e7d680ac768624f565cee422d091a78642";
const realRunnerPath = "scripts/production-certification-real.mjs";
const canonicalOwnerPath = "scripts/production-certification-contract.mjs";
const fixtureRoot = mkdtempSync(
  path.join(tmpdir(), "production-certification-stage-order-"),
);

function source(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function changedSource(relativePath, mutate) {
  const original = source(relativePath);
  const changed = mutate(original);
  assert.notEqual(changed, original, `${relativePath} tamper must change source`);
  return { [relativePath]: changed };
}

function assertCoherenceRejected(relativePath, mutate, expected) {
  assert.throws(
    () =>
      validateCertificationStageOrderContracts(repositoryRoot, {
        sourceOverrides: changedSource(relativePath, mutate),
      }),
    expected,
  );
}

function realCandidateFixtureState(statePath) {
  const createdAt = "2026-08-18T00:00:00.000Z";
  const destinations = Array.from({ length: 17 }, (_, index) => ({
    id: `stage-order-fixture-${String(index).padStart(2, "0")}`,
    lifecycleStage: "source-validation",
    targetType: "file",
    destinationClass: "certification-external-evidence-root",
    portableRelativePath: `stage-order-fixture/${String(index).padStart(2, "0")}.json`,
    pathContractSha256: String(index % 10).repeat(64),
    targetIdentitySha256: String((index + 1) % 10).repeat(64),
    targetMustRemainAbsent: true,
    siblingAtomicWriteProbeRequired: true,
  }));
  const resourcePlan = {
    schema: PRODUCTION_CERTIFICATION_RESOURCE_PLAN_SCHEMA,
    version: 1,
    contractMatrixSha256: "3".repeat(64),
    resourceContractSha256: "4".repeat(64),
    externalRootIdentitySha256: "5".repeat(64),
    destinationSetSha256: sha256Bytes(canonicalJsonBytes(destinations)),
    destinations,
  };
  let state = createCertificationState({
    certificationId: "stage-order-dispatch-fixture",
    candidateId: "stage-order-dispatch-candidate",
    commitSha: "a".repeat(40),
    treeSha: "b".repeat(40),
    parentSha: "c".repeat(40),
    harnessSourceSha256: "d".repeat(64),
    executionClass: "real-candidate",
    createdAt,
    worktrees: {
      schema: PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA,
      roles: Object.fromEntries(CERTIFICATION_WORKTREE_ROLES.map((role) => [role, {}])),
    },
    resourcePlan,
  });
  state = replaceCertificationDatabaseLifecycle(state, {
    schema: "interior-ai.production-certification-database-lifecycle-binding.v1",
    certificationId: state.certificationId,
    candidateId: state.candidate.id,
    candidateCommitSha: state.candidate.commitSha,
    candidateTreeSha: state.candidate.treeSha,
    databaseName: "interior_ai_gate_a3_test_cert_stage_order_fixture",
    databaseNameSha256: "e".repeat(64),
    databaseIdentitySha256: "f".repeat(64),
    lifecycleState: "active",
    evidence: { path: "database/lifecycle.json", sha256: "1".repeat(64) },
    updatedAt: "2026-08-18T00:00:00.100Z",
  });
  state = startCertificationStage(state, {
    stage: "doctor",
    startedAt: "2026-08-18T00:00:00.200Z",
  });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-18T00:00:00.300Z",
    exitCode: 0,
    outputHashes: { doctor: "2".repeat(64) },
    evidenceFiles: {
      doctor: { path: "doctor/attempt-001.json", sha256: "2".repeat(64) },
    },
    consumedSubstantiveGate: false,
  });
  writeCertificationState(statePath, state, { requireAbsent: true });
  return readCertificationState(statePath);
}

function historicalRealRunnerSource() {
  const child = spawnSync(
    "git",
    ["show", `${startingCommit}:${realRunnerPath}`],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (child.status === 0) return child.stdout;
  const current = source(realRunnerPath);
  const reconstructed = current.replace(/^  CERTIFICATION_STAGE_ORDER,\n/m, "");
  assert.notEqual(
    reconstructed,
    current,
    "isolated fixture must reconstruct the missing-import starting behavior",
  );
  return reconstructed;
}

function instrumentRealRunner(runnerSource, name, databaseBinding) {
  const stubPath = path.join(fixtureRoot, `${name}-database-lifecycle.mjs`);
  writeFileSync(
    stubPath,
    `const binding = ${JSON.stringify(databaseBinding)};\n` +
      `export function readCertificationDatabaseLifecycle() { return { binding, evidence: { currentState: "active" } }; }\n` +
      `export function retainCertificationDatabaseFailureSnapshot() {}\n` +
      `export function resolveCertificationDatabaseStageEnvironment() { return { environment: {} }; }\n` +
      `export async function bindCertificationDatabaseStage({ stage }) { throw new Error(\`STAGE_DISPATCH_REACHED:\${stage}\`); }\n` +
      `export function abortCertificationDatabase() {}\n` +
      `export function certificationDatabaseStatus() {}\n` +
      `export function certificationDatabaseTargetUrl() {}\n` +
      `export function dropCertificationDatabase() {}\n` +
      `export function provisionCertificationDatabase() {}\n` +
      `export function verifyCertificationDatabaseAbsent() {}\n` +
      `export function verifyFinalCertificationDatabase() {}\n` +
      `export function verifyInitialCertificationDatabase() {}\n`,
  );
  const stubUrl = pathToFileURL(stubPath).href;
  const instrumented = runnerSource.replace(
    /from\s+"(\.\/[^"\n]+)"/g,
    (statement, specifier) => {
      const url =
        specifier === "./production-certification-database-lifecycle.mjs"
          ? stubUrl
          : pathToFileURL(
              path.resolve(repositoryRoot, "scripts", specifier),
            ).href;
      return `from "${url}"`;
    },
  );
  const modulePath = path.join(fixtureRoot, `${name}-real-runner.mjs`);
  writeFileSync(
    modulePath,
    `${instrumented}\nexport { bindDatabaseForStage as __stageOrderDispatch };\n`,
  );
  return import(`${pathToFileURL(modulePath).href}?fixture=${name}`);
}

try {
  const coherence = validateCertificationStageOrderContracts(repositoryRoot);
  assert.equal(coherence.canonicalOwner, canonicalOwnerPath);
  assert.equal(coherence.stageCount, 12);
  assert.equal(coherence.circularDependency, false);
  assert.equal(coherence.duplicateOwner, false);
  assert.equal(coherence.dispatchRegressionRegistered, true);
  assert.deepEqual(coherence.realRunnerStages, CERTIFICATION_STAGE_ORDER);

  assertCoherenceRejected(
    realRunnerPath,
    (value) => value.replace(/^  CERTIFICATION_STAGE_ORDER,\n/m, ""),
    /does not import the canonical certification stage order/,
  );
  assertCoherenceRejected(
    realRunnerPath,
    (value) =>
      value.replace(
        /^  CERTIFICATION_STAGE_ORDER,\n/m,
        "  CERTIFICATION_STAGE_ORDER as ALIASED_STAGE_ORDER,\n",
      ),
    /does not import the canonical certification stage order/,
  );
  assertCoherenceRejected(
    realRunnerPath,
    (value) =>
      `${value}\nconst COPIED_CERTIFICATION_STAGES = Object.freeze([\n${CERTIFICATION_STAGE_ORDER.map(
        (stage) => `  ${JSON.stringify(stage)},`,
      ).join("\n")}\n]);\n`,
    /copies the canonical certification stage order/,
  );
  assertCoherenceRejected(
    canonicalOwnerPath,
    (value) =>
      value.replace(
        '  "doctor",\n  "source-validation",',
        '  "source-validation",\n  "doctor",',
      ),
    /source and runtime identity differ/,
  );
  assertCoherenceRejected(
    canonicalOwnerPath,
    (value) => value.replace('  "continuity",\n', ""),
    /source and runtime identity differ/,
  );
  assertCoherenceRejected(
    canonicalOwnerPath,
    (value) => value.replace('  "doctor",\n', '  "doctor",\n  "doctor",\n'),
    /malformed or duplicated/,
  );
  assertCoherenceRejected(
    realRunnerPath,
    (value) =>
      value.replace(
        'bindDatabaseForStage(\n    context,\n    "source-validation",',
        'bindDatabaseForStage(\n    context,\n    "unknown-stage",',
      ),
    /real runner stage inventory differs from canonical order/,
  );

  const statePath = path.join(fixtureRoot, "state.json");
  const state = realCandidateFixtureState(statePath);
  assert.equal(state.schema, PRODUCTION_CERTIFICATION_STATE_SCHEMA);
  assert.deepEqual(Object.keys(state.stages), CERTIFICATION_STAGE_ORDER);
  assert.equal(CERTIFICATION_STAGE_ORDER.indexOf("source-validation"), 1);
  assert.deepEqual(CERTIFICATION_STAGE_ORDER.slice(0, 1), ["doctor"]);
  assert.equal(state.stages.doctor.status, "passed");
  assert.equal(state.stages["source-validation"].status, "pending");
  assert.equal(state.stages["source-validation"].attempts.length, 0);
  for (const stage of CERTIFICATION_STAGE_ORDER.slice(2)) {
    assert.equal(state.stages[stage].status, "pending", stage);
    assert.equal(state.stages[stage].attempts.length, 0, stage);
  }
  const stateShaBeforeDispatch = certificationStateSha256(state);

  const historicalRunner = await instrumentRealRunner(
    historicalRealRunnerSource(),
    "historical",
    state.databaseLifecycle,
  );
  await assert.rejects(
    historicalRunner.__stageOrderDispatch(
      {
        state,
        canonicalRoot: repositoryRoot,
        environment: {},
        statePath,
      },
      "source-validation",
    ),
    (error) =>
      error instanceof ReferenceError &&
      /CERTIFICATION_STAGE_ORDER is not defined/.test(error.message),
  );

  const correctedRunner = await instrumentRealRunner(
    source(realRunnerPath),
    "corrected",
    state.databaseLifecycle,
  );
  await assert.rejects(
    correctedRunner.__stageOrderDispatch(
      {
        state,
        canonicalRoot: repositoryRoot,
        environment: {},
        statePath,
      },
      "source-validation",
    ),
    (error) =>
      !(error instanceof ReferenceError) &&
      error.message === "STAGE_DISPATCH_REACHED:source-validation",
  );
  await assert.rejects(
    correctedRunner.__stageOrderDispatch(
      {
        state,
        canonicalRoot: repositoryRoot,
        environment: {},
        statePath,
      },
      "unknown-stage",
    ),
    /database stage binding is unknown: unknown-stage/,
  );

  const stateAfterDispatch = readCertificationState(statePath);
  assert.equal(certificationStateSha256(stateAfterDispatch), stateShaBeforeDispatch);
  assert.equal(stateAfterDispatch.stages["source-validation"].status, "pending");
  assert.equal(stateAfterDispatch.stages["source-validation"].attempts.length, 0);
  assert.equal(canonicalJsonBytes(CERTIFICATION_STAGE_ORDER).length > 0, true);
  console.log(
    "Production certification real-runner stage-order dispatch regression passed.",
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
