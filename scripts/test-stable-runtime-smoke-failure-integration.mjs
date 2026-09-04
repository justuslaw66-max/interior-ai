import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "pg";

import { CertificationPostgresAdapter } from "./production-certification-database-adapter.mjs";
import { STABLE_RUNTIME_SMOKE_DATABASE_PROFILE } from "./production-certification-database-contract.mjs";
import {
  createStableRuntimeSmokeTestInjection,
  runStableRuntimeSmoke,
} from "./stable-runtime-smoke.mjs";
import {
  STABLE_JOURNAL_PATH,
  STABLE_MANIFEST_PATH,
  removeStableRuntimeRoot,
} from "./stable-runtime-smoke-resources.mjs";

const repositoryRoot = process.cwd();
const adminUrl =
  process.env.CERTIFICATION_DATABASE_ADMIN_URL ??
  "postgresql://justus@127.0.0.1:5432/postgres";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function likePrefixPattern(value) {
  return `${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

async function adminCounts(databaseName, roleName) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const databases = await client.query(
      "SELECT count(*)::int AS count FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    const databasePrefix = await client.query(
      "SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE $1 ESCAPE '\\'",
      [likePrefixPattern(databaseName)],
    );
    const roles = await client.query(
      "SELECT count(*)::int AS count FROM pg_roles WHERE rolname = $1",
      [roleName],
    );
    const rolePrefix = await client.query(
      "SELECT count(*)::int AS count FROM pg_roles WHERE rolname LIKE $1 ESCAPE '\\'",
      [likePrefixPattern(roleName)],
    );
    return {
      database: databases.rows[0].count,
      databasePrefix: databasePrefix.rows[0].count,
      role: roles.rows[0].count,
      rolePrefix: rolePrefix.rows[0].count,
    };
  } finally {
    await client.end();
  }
}

class PostDropAbsenceProofFailureAdapter {
  constructor({ environment }) {
    this.environment = environment;
    this.delegate = null;
    this.dropReceipt = null;
    this.calls = [];
  }

  ensureDelegate(databaseName) {
    this.delegate ??= new CertificationPostgresAdapter({
      adminUrl: this.environment.CERTIFICATION_DATABASE_ADMIN_URL,
      repositoryRoot,
      databaseName,
      environment: this.environment,
      lifecycleProfile: STABLE_RUNTIME_SMOKE_DATABASE_PROFILE,
    });
    return this.delegate;
  }

  async inspectAdmin(databaseName) {
    this.calls.push("inspectAdmin");
    if (this.dropReceipt?.dropped === true) {
      throw new Error("injected post-drop absence-proof inspection failure");
    }
    return this.ensureDelegate(databaseName).inspectAdmin(databaseName);
  }

  async invoke(method, ...args) {
    this.calls.push(method);
    assert.ok(this.delegate, `real adapter must exist before ${method}`);
    return this.delegate[method](...args);
  }

  createDatabase(...args) { return this.invoke("createDatabase", ...args); }
  createStageRole(...args) { return this.invoke("createStageRole", ...args); }
  inspectStageRole(...args) { return this.invoke("inspectStageRole", ...args); }
  inspectStageConnection(...args) { return this.invoke("inspectStageConnection", ...args); }
  deployMigrations(...args) { return this.invoke("deployMigrations", ...args); }
  applicationRows(...args) { return this.invoke("applicationRows", ...args); }
  targetSessions(...args) { return this.invoke("targetSessions", ...args); }
  terminateTargetSessions(...args) { return this.invoke("terminateTargetSessions", ...args); }
  dropStageRole(...args) { return this.invoke("dropStageRole", ...args); }

  async dropDatabase(...args) {
    this.dropReceipt = await this.invoke("dropDatabase", ...args);
    return this.dropReceipt;
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function retainedRuntimePaths(evidenceRoot) {
  const directory = path.join(evidenceRoot, "runtime-smoke");
  return {
    report: path.join(directory, "playwright-report.json"),
    timings: path.join(directory, "phase-timings.json"),
    marker: path.join(directory, "product-test-start.json"),
    summary: path.join(directory, "evidence.json"),
    failure: path.join(directory, "failure.json"),
  };
}

function validatePhysicalFailureEvidence({ capture, manifest, journal }) {
  const { attributionResult, roots } = capture;
  const { attribution, failure } = attributionResult;
  const paths = retainedRuntimePaths(roots.evidenceRoot);
  const report = readJson(paths.report);
  const timings = readJson(paths.timings);
  const marker = readJson(paths.marker);
  const reportText = JSON.stringify(report);
  const timingText = JSON.stringify(timings);

  assert.equal(marker.schema, "interior-ai.production-certification-playwright-start.v1");
  assert.equal(marker.boundary, "test-begin");
  assert.equal(marker.gateId, "ci.production-runtime-smoke");
  assert.equal(marker.project, "chromium");
  assert.equal(timings.schema, "interior-ai.runtime-smoke-phase-timings.v3");
  assert.equal(timings.complete, false);
  assert.match(reportText, /RuntimeSmokeOperationTimeoutError/);
  assert.match(reportText, /reload-1/);
  assert.match(reportText, /diagnostics-settle-evaluation/);
  assert.match(timingText, /reload-1/);
  assert.match(timingText, /diagnostics-settle-evaluation/);
  assert.equal(timings.failure.failureKind, "nested-operation-timeout");
  assert.equal(timings.failure.phaseId, "reload-1");
  assert.equal(
    timings.failure.operationId,
    "diagnostics-settle-evaluation",
  );
  assert.equal(timings.failure.operationOutcome, "timed-out");
  assert.equal(timings.failure.deadlineReached, true);

  assert.equal(attribution.failure.classification, "PRODUCT_ASSERTION_FAILURE");
  assert.equal(attribution.failure.consumedSubstantiveGate, true);
  assert.equal(attribution.failure.attempt, 1);
  assert.equal(attribution.failure.failedStateSha256, attribution.lifecycle.sha256);
  assert.equal(attribution.child.status, 1);
  assert.equal(attribution.child.signal, null);
  assert.equal(
    attribution.child.command,
    "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium " +
      "--config=playwright.runtime-smoke-timeout.config.ts",
  );
  assert.equal(attribution.identity.sourceCommitSha, manifest.source.commitSha);
  assert.equal(attribution.identity.sourceTreeSha, manifest.source.treeSha);
  assert.equal(attribution.identity.buildId, manifest.build.nextBuildId);
  assert.equal(attribution.identity.artifactSha256, manifest.artifact.sha256);
  assert.equal(attribution.identity.journalNonce, journal.runNonce);
  assert.match(attribution.identity.manifestSha256, /^[a-f0-9]{64}$/);
  assert.match(attribution.identity.journalSha256, /^[a-f0-9]{64}$/);
  assert.equal(attribution.stageEnvironment.id, "runtime-smoke");
  assert.equal(attribution.evidenceRootOwner.certificationId, roots.owner.certificationId);
  assert.equal(attribution.evidenceRootOwner.runId, roots.owner.runId);
  assert.equal(attribution.evidenceRootOwner.runAttempt, roots.owner.runAttempt);
  assert.equal(attribution.evidenceRootOwner.lifecycleNonce, roots.owner.lifecycleNonce);
  assert.equal(
    attribution.evidenceRootOwner.ownerSha256,
    sha256(readFileSync(roots.ownerPath)),
  );

  for (const [referenceName, filePath] of [
    ["runtime-report", paths.report],
    ["runtime-phase-timings", paths.timings],
    ["runtime-start", paths.marker],
    ["runtime-failure", paths.failure],
  ]) {
    const descriptor = failure.evidenceReferences[referenceName];
    assert.ok(descriptor, `${referenceName} descriptor must exist`);
    assert.equal(descriptor.sha256, sha256(readFileSync(filePath)));
  }
  assert.equal(existsSync(paths.summary), false);
}

function stableEnvironment({ manifest, runnerTemp, runId }) {
  return {
    ...process.env,
    CERTIFICATION_DATABASE_ADMIN_URL: adminUrl,
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_RUN_ID: runId,
    RUNNER_TEMP: runnerTemp,
    STABLE_RUNTIME_SMOKE_EXPECTED_SOURCE_SHA: manifest.source.commitSha,
  };
}

async function runTimeoutCase({ manifest, journal, runnerTemp, runId, failAbsenceProof }) {
  const capture = {
    attributionResult: null,
    failureEvidenceValidationError: null,
    failureEvidenceValidated: false,
    prepared: null,
    cleaned: null,
    roots: null,
  };
  let wrapper = null;
  const testInjection = createStableRuntimeSmokeTestInjection({
    databaseAdapterFactory: failAbsenceProof
      ? ({ environment }) => {
          wrapper = new PostDropAbsenceProofFailureAdapter({ environment });
          return wrapper;
        }
      : null,
  });
  const environment = stableEnvironment({ manifest, runnerTemp, runId });
  await assert.rejects(
    runStableRuntimeSmoke({
      repositoryRoot,
      environment,
      testInjection,
      testHooks: {
        async afterDatabasePrepared({ databaseState, roots }) {
          const roleName = decodeURIComponent(
            new URL(databaseState.database.environment.DATABASE_URL).username,
          );
          const databaseName = databaseState.active.binding.databaseName;
          assert.equal(databaseState.active.evidence.migration.count, 43);
          assert.deepEqual(await adminCounts(databaseName, roleName), {
            database: 1,
            databasePrefix: 1,
            role: 1,
            rolePrefix: 1,
          });
          capture.prepared = { databaseName, roleName };
          capture.roots = roots;
        },
        afterFailureAttribution(result) {
          capture.attributionResult = structuredClone(result);
          try {
            validatePhysicalFailureEvidence({ capture, manifest, journal });
            capture.failureEvidenceValidated = true;
          } catch (error) {
            capture.failureEvidenceValidationError = error;
          }
        },
        afterDatabaseAbort(result) {
          capture.cleaned = structuredClone(result);
          capture.cleanedLifecycle = readJson(
            path.join(capture.roots.evidenceRoot, "database/lifecycle.json"),
          );
        },
        afterFailedCleanup(result) {
          capture.failedCleanup = structuredClone(result);
        },
      },
    }),
    /stable runtime-smoke product tests failed/,
  );
  assert.ifError(capture.failureEvidenceValidationError);
  assert.equal(capture.failureEvidenceValidated, true);
  assert.ok(capture.attributionResult);
  assert.ok(capture.prepared);
  return { capture, wrapper };
}

const manifest = readJson(path.join(repositoryRoot, STABLE_MANIFEST_PATH));
const journal = readJson(path.join(repositoryRoot, STABLE_JOURNAL_PATH));
const runnerTemp = mkdtempSync(
  path.join(tmpdir(), "interior-ai-real-runtime-failure-integration-"),
);
const runIdBase = BigInt(Date.now()) * 10n;

try {
  const successfulAbort = await runTimeoutCase({
    manifest,
    journal,
    runnerTemp,
    runId: String(runIdBase + 1n),
    failAbsenceProof: false,
  });
  assert.equal(successfulAbort.capture.cleaned.databaseAbsent, true);
  assert.equal(
    successfulAbort.capture.cleanedLifecycle.currentState,
    "abort-absence-verified",
  );
  assert.equal(successfulAbort.capture.cleanedLifecycle.cleanup.drop.dropped, true);
  assert.equal(
    successfulAbort.capture.cleanedLifecycle.cleanup.stageRole.verifiedAbsent,
    true,
  );
  assert.equal(
    successfulAbort.capture.cleanedLifecycle.cleanup.privateSidecar.removed,
    true,
  );
  assert.equal(successfulAbort.capture.cleanedLifecycle.cleanup.targetAbsent, true);
  assert.equal(
    successfulAbort.capture.cleanedLifecycle.failure.classification,
    "PRODUCT_ASSERTION_FAILURE",
  );
  assert.equal(successfulAbort.capture.cleanedLifecycle.failure.originalStage, "runtime-smoke");
  assert.equal(successfulAbort.capture.failedCleanup.roots, null);
  assert.equal(existsSync(successfulAbort.capture.roots.taskRoot), false);
  assert.deepEqual(
    await adminCounts(
      successfulAbort.capture.prepared.databaseName,
      successfulAbort.capture.prepared.roleName,
    ),
    { database: 0, databasePrefix: 0, role: 0, rolePrefix: 0 },
  );

  const failedProof = await runTimeoutCase({
    manifest,
    journal,
    runnerTemp,
    runId: String(runIdBase + 2n),
    failAbsenceProof: true,
  });
  assert.ok(
    failedProof.capture.failedCleanup.cleanupIssues.some((issue) =>
      issue.includes("injected post-drop absence-proof inspection failure"),
    ),
  );
  assert.equal(failedProof.capture.failedCleanup.databaseAbsent, false);
  assert.equal(existsSync(failedProof.capture.roots.taskRoot), true);
  assert.deepEqual(
    await adminCounts(
      failedProof.capture.prepared.databaseName,
      failedProof.capture.prepared.roleName,
    ),
    { database: 0, databasePrefix: 0, role: 0, rolePrefix: 0 },
  );
  for (const delegated of [
    "createDatabase",
    "createStageRole",
    "deployMigrations",
    "terminateTargetSessions",
    "dropDatabase",
    "dropStageRole",
    "inspectStageRole",
  ]) {
    assert.ok(failedProof.wrapper.calls.includes(delegated), `${delegated} must delegate`);
  }
  const retainedLifecycle = readJson(
    path.join(failedProof.capture.roots.evidenceRoot, "database/lifecycle.json"),
  );
  assert.equal(retainedLifecycle.failure.classification, "PRODUCT_ASSERTION_FAILURE");
  assert.equal(retainedLifecycle.failure.originalStage, "runtime-smoke");
  assert.equal(retainedLifecycle.cleanup.drop.dropped, true);
  assert.equal(retainedLifecycle.cleanup.stageRole.dropped, true);
  assert.equal(retainedLifecycle.cleanup.targetAbsent, false);
  removeStableRuntimeRoot(failedProof.capture.roots);
  assert.equal(existsSync(failedProof.capture.roots.taskRoot), false);
} finally {
  rmSync(runnerTemp, { recursive: true, force: true });
}

console.log(
  "Stable runtime-smoke real timeout, abort, and cleanup-proof integration passed.",
);
