import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
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
  AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
  canonicalJsonBytes,
  generateCertificationDatabaseName,
  migrationInventory,
  sealDatabaseLifecycleEvidence,
  sha256,
} from "./production-certification-database-contract.mjs";
import {
  abortAuthSessionPreflightDatabaseLifecycle,
  bindCertificationDatabaseStage,
  completeAuthSessionPreflightDatabaseLifecycle,
  createAuthSessionPreflightDatabaseBinding,
  createAuthSessionPreflightDatabaseEnvironment,
  planCertificationDatabase,
  prepareAuthSessionPreflightDatabaseLifecycle,
  readCertificationDatabaseLifecycle,
  resolveCertificationDatabaseStageEnvironment,
} from "./production-certification-database-lifecycle.mjs";
import {
  runPreparedAuthPreflightDatabaseSequence,
} from "./run-ci-auth-fixture-real-preflight.mjs";
import {
  projectCertificationChildEnvironment,
} from "./production-certification-stage-environment.mjs";
import {
  completeAuthPreflightWorktree,
  createAuthPreflightWorktree,
  NEXT_GENERATED_TSCONFIG_INCLUDE,
} from "./ci-auth-preflight-worktree.mjs";

const repositoryRoot = process.cwd();
const require = createRequire(import.meta.url);
const authResultContract = require("./ci-auth-fixture-result-contract.cjs");
const coveredAuthPreflightDatabaseCases = Object.freeze([
  "explicit-auth-session-preflight-stage",
  "planned-lifecycle-rejected-before-provision",
  "foreign-invocation-nonce-rejected",
  "candidate-commit-tree-mismatch-rejected",
  "database-identity-mismatch-rejected",
  "private-sidecar-mismatch-rejected",
  "non-loopback-target-rejected",
  "ambient-database-url-override-rejected",
  "admin-capability-not-projected",
  "scoped-role-collision-abort-cleanup",
  "private-sidecar-publication-race-abort-cleanup",
  "normal-cleanup-failure-abort-cleanup",
  "original-auth-failure-retained",
  "unrelated-database-and-session-preserved",
  "normal-drop-and-absence-required-for-success",
  "preflight-database-identity-distinct-from-later-rehearsal",
  "helper-create-database-source-guard",
  "helper-drop-database-source-guard",
  "helper-manual-database-url-source-guard",
  "helper-server-before-listener-abort-cleanup",
  "helper-readiness-failure-abort-cleanup",
  "helper-invalid-session-response-abort-cleanup",
  "helper-structured-result-publication-abort-cleanup",
  "helper-active-session-exact-target-termination",
  "helper-repeated-abort-failure-retains-recovery-evidence",
  "failure-result-contract-tamper-rejected",
  "auth-passed-database-cleanup-failure-classified-accurately",
  "database-preflight-consumes-existing-fixture-session",
  "certification-helper-rejects-preflight-local-delegation",
  "auth-server-receives-existing-provider-digests",
  "exact-head-worktree-canonical-source-immutable",
  "deterministic-next-tsconfig-output-contained",
  "clean-no-output-terminal-state-accepted",
  "unexpected-tracked-output-rejected-and-cleaned",
  "staged-output-rejected-and-cleaned",
  "untracked-output-rejected-and-cleaned",
  "symlink-tsconfig-rejected-and-cleaned",
  "task-owned-cleanup-preserves-foreign-worktree",
]);
const candidateCommitSha = git("HEAD");
const candidateTreeSha = git("HEAD^{tree}");
const migrationNames = migrationInventory(repositoryRoot).migrations.map(
  ({ id }) => id,
);

function fixtureAuthStageInputs() {
  return {
    CI_AUTH_FIXTURE_ACTIVE: "1",
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidateCommitSha,
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidateTreeSha,
    CI_AUTH_FIXTURE_MODE: "1",
    CI_AUTH_FIXTURE_NO_REGENERATION: "1",
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256: "a".repeat(64),
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256: "b".repeat(64),
    CI_AUTH_FIXTURE_RESULT_NONCE: "auth-result-nonce-fixture",
    CI_AUTH_FIXTURE_RESULT_PATH: "/private/auth-result.json",
    CI_AUTH_FIXTURE_RESULT_ROOT: "/private/auth-results",
    CI_AUTH_FIXTURE_SESSION_CLASSIFICATION:
      "PRODUCTION_INELIGIBLE_SYNTHETIC_AUTH",
    CI_AUTH_FIXTURE_SESSION_ID: "auth-session-fixture",
    CI_AUTH_FIXTURE_SESSION_NONCE: "auth-session-nonce-fixture",
    CI_AUTH_FIXTURE_SESSION_ROOT: "/private/auth-session",
    GOOGLE_CLIENT_ID: "synthetic-provider-client-id",
    GOOGLE_CLIENT_SECRET: "synthetic-provider-secondary-value",
  };
}

function git(revision) {
  const result = spawnSync("git", ["rev-parse", revision], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  return result.stdout.trim();
}

class AuthPreflightAdapter {
  constructor({ roleCollision = false, dropFailures = 0 } = {}) {
    this.exists = false;
    this.migrated = false;
    this.rows = [];
    this.sessions = [];
    this.roleName = null;
    this.roleCollision = roleCollision;
    this.dropFailures = dropFailures;
    this.unrelatedDatabaseExists = true;
    this.unrelatedSessionExists = true;
  }

  async inspectAdmin() {
    return {
      hostClassification: "explicit-loopback",
      host: "127.0.0.1",
      port: 5432,
      serverAddressClassification: "loopback",
      serverVersion: "16.14",
      serverVersionNumber: 160014,
      role: "auth_preflight_admin",
      roleClassification: "local-createdb",
      canCreateDatabase: true,
      targetExists: this.exists,
    };
  }

  async createDatabase() {
    assert.equal(this.exists, false);
    this.exists = true;
    return { created: true };
  }

  deployMigrations() {
    this.migrated = true;
    return { exitCode: 0, signal: null };
  }

  async migrationNames() {
    return this.migrated ? migrationNames : [];
  }

  async inspectStageRole() {
    return {
      exists: this.roleName !== null,
      adminCapabilities: false,
    };
  }

  async createStageRole({ roleName, password }) {
    assert.match(roleName, /^interior_ai_cert_stage_[a-f0-9]{32}$/);
    assert.match(password, /^[a-f0-9]{64}$/);
    if (this.roleCollision) {
      throw Object.assign(new Error("scoped role collision"), {
        stageRoleCreateOutcome: "not-created",
      });
    }
    this.roleName = roleName;
    return {
      created: true,
      classification: "stage-login-no-admin",
      adminCapabilities: false,
    };
  }

  async inspectStageConnection({ roleName }) {
    return {
      exactTarget: this.exists,
      exactRole: this.roleName === roleName,
      adminCapabilities: false,
    };
  }

  async applicationRows() {
    return this.rows;
  }

  async targetSessions() {
    return this.sessions;
  }

  async terminateTargetSessions() {
    const matchedSessionCount = this.sessions.length;
    this.sessions = [];
    return {
      matchedSessionCount,
      terminatedPids: [],
      remainingSessionCount: 0,
    };
  }

  async dropDatabase() {
    if (this.dropFailures > 0) {
      this.dropFailures -= 1;
      throw new Error("injected exact-target drop failure");
    }
    if (!this.exists) return { dropped: false, alreadyAbsent: true };
    this.exists = false;
    return { dropped: true, alreadyAbsent: false };
  }

  async dropStageRole() {
    if (this.roleName === null) {
      return { dropped: false, alreadyAbsent: true };
    }
    this.roleName = null;
    return { dropped: true, alreadyAbsent: false };
  }
}

function invocationNonce(label) {
  return `auth-preflight-${label}-${randomBytes(8).toString("hex")}`;
}

function fixture(label, adapter = new AuthPreflightAdapter()) {
  const root = mkdtempSync(
    path.join(tmpdir(), `auth-preflight-database-${label}-`),
  );
  const nonce = invocationNonce(label);
  const baseEnvironment = {
    ...process.env,
    CERTIFICATION_QUALIFICATION_MODE: "1",
    CERTIFICATION_TEST_DATABASE_ADMIN_URL:
      "postgresql://auth_preflight_admin:private-test-value@127.0.0.1:5432/postgres",
  };
  delete baseEnvironment.DATABASE_URL;
  return { root, nonce, baseEnvironment, adapter };
}

async function prepare(fixtureValue, options = {}) {
  return prepareAuthSessionPreflightDatabaseLifecycle({
    repositoryRoot,
    baseEnvironment: fixtureValue.baseEnvironment,
    lifecycleRoot: fixtureValue.root,
    candidateCommitSha,
    candidateTreeSha,
    authPreflightInvocationNonce: fixtureValue.nonce,
    databaseNonce: randomBytes(16).toString("hex"),
    qualificationFixture: true,
    adapter: fixtureValue.adapter,
    ...options,
  });
}

function expectSafeError(action, pattern) {
  let retained = null;
  try {
    action();
  } catch (error) {
    retained = error;
  }
  assert.ok(retained instanceof Error);
  assert.match(retained.message, pattern);
  assert.doesNotMatch(retained.message, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(retained.message, /private-test-value/i);
}

async function normalLifecycleAndProjectionCoverage() {
  const value = fixture("normal");
  try {
    const prepared = await prepare(value);
    assert.deepEqual(prepared.current.evidence.stageBindings.requiredStages, [
      AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
    ]);
    assert.equal(
      prepared.current.evidence.lifecycleProfile.classification,
      "AUTH_SESSION_PREFLIGHT_ONLY",
    );
    assert.equal(prepared.projection.identity.stage, AUTH_SESSION_PREFLIGHT_DATABASE_STAGE);
    assert.equal(prepared.projection.identity.lifecycleState, "active");
    assert.equal(prepared.projection.identity.scopedRoleClassification,
      "private-stage-login-no-admin");
    assert.equal(Object.keys(prepared.projection.environment).join(","), "DATABASE_URL");

    const projected = projectCertificationChildEnvironment({
      repositoryRoot,
      baseEnvironment: {
        ...process.env,
        DATABASE_URL: "postgresql://ambient:ambient@127.0.0.1:5432/foreign",
        CERTIFICATION_DATABASE_ADMIN_URL:
          prepared.environment.CERTIFICATION_DATABASE_ADMIN_URL,
      },
      stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      profileId: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      stageInputs: {
        ...fixtureAuthStageInputs(),
        ...prepared.projection.environment,
      },
    });
    assert.equal(projected.environment.DATABASE_URL,
      prepared.projection.environment.DATABASE_URL);
    assert.equal(
      Object.hasOwn(projected.environment, "CERTIFICATION_DATABASE_ADMIN_URL"),
      false,
    );
    assert.equal(
      Object.hasOwn(projected.environment, "CERTIFICATION_DATABASE_LIFECYCLE_PATH"),
      false,
    );

    expectSafeError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot,
          environment: {
            ...prepared.environment,
            DATABASE_URL: "postgresql://ambient:ambient@127.0.0.1:5432/foreign",
          },
          stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
          preflightLifecycleBinding: prepared.preflightLifecycleBinding,
          authPreflightInvocationNonce: value.nonce,
        }),
      /ambient DATABASE_URL cannot override/,
    );

    const complete = await completeAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot,
      environment: prepared.environment,
      adapter: value.adapter,
      preflightLifecycleBinding: prepared.preflightLifecycleBinding,
    });
    assert.equal(complete.current.evidence.currentState, "absence-verified");
    assert.equal(complete.evidence.cleanupMode, "normal");
    assert.equal(complete.evidence.dropResult, "passed");
    assert.equal(complete.evidence.absenceResult, "passed");
    assert.equal(complete.evidence.failedPreflightRehabilitated, false);
    const laterRehearsalDatabase = generateCertificationDatabaseName({
      certificationId: "fresh-rehearsal-after-auth-preflight",
      candidateId: "fresh-rehearsal-candidate-after-auth-preflight",
      candidateCommitSha,
      nonce: randomBytes(16).toString("hex"),
    });
    assert.notEqual(
      laterRehearsalDatabase.identitySha256,
      complete.evidence.databaseIdentitySha256,
    );
    authResultContract.validateAuthPreflightDatabaseEvidence(
      complete.evidence,
      "success",
    );
    for (const [field, replacement] of [
      ["connectionProjectionResult", "failed"],
      ["adminCapabilities", true],
      ["dropResult", "failed"],
      ["absenceResult", "failed"],
      ["cleanupMode", "abort"],
    ]) {
      assert.throws(
        () =>
          authResultContract.validateAuthPreflightDatabaseEvidence(
            { ...complete.evidence, [field]: replacement },
            "success",
          ),
        /database prerequisite|database prerequisite and cleanup proof/i,
      );
    }
    assert.equal(value.adapter.exists, false);
    assert.equal(value.adapter.roleName, null);
    assert.equal(value.adapter.unrelatedDatabaseExists, true);
    assert.equal(value.adapter.unrelatedSessionExists, true);

    expectSafeError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot,
          environment: prepared.environment,
          stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
          preflightLifecycleBinding: prepared.preflightLifecycleBinding,
          authPreflightInvocationNonce: value.nonce,
        }),
      /not active or complete|not ready/,
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
}

async function projectionTamperCoverage() {
  const value = fixture("tamper");
  try {
    const prepared = await prepare(value);
    expectSafeError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot,
          environment: prepared.environment,
          stage: "unknown-database-stage",
        }),
      /not permitted/,
    );
    expectSafeError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot,
          environment: prepared.environment,
          stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
          preflightLifecycleBinding: prepared.preflightLifecycleBinding,
          authPreflightInvocationNonce: invocationNonce("foreign"),
        }),
      /not active or complete|stale or foreign/,
    );
    for (const field of [
      "candidateCommitSha",
      "candidateTreeSha",
      "databaseIdentitySha256",
      "databaseNameSha256",
      "privateSidecarSha256",
    ]) {
      const foreign = {
        ...prepared.preflightLifecycleBinding,
        [field]: field.startsWith("candidate")
          ? "0".repeat(40)
          : "0".repeat(64),
      };
      expectSafeError(
        () =>
          resolveCertificationDatabaseStageEnvironment({
            repositoryRoot,
            environment: prepared.environment,
            stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
            preflightLifecycleBinding: foreign,
            authPreflightInvocationNonce: value.nonce,
          }),
        /stale or foreign/,
      );
    }
    expectSafeError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot,
          environment: prepared.environment,
          state: {},
          stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
          preflightLifecycleBinding: prepared.preflightLifecycleBinding,
          authPreflightInvocationNonce: value.nonce,
        }),
      /cannot consume rehearsal state/,
    );
    const sidecarPath = path.join(
      value.root,
      "database-private",
      ".database-bindings",
      prepared.current.evidence.identity.certificationId,
      `${prepared.current.evidence.database.identitySha256}.json`,
    );
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
    const nonLoopback = new URL(sidecar.targetUrl);
    nonLoopback.hostname = "192.0.2.17";
    const tamperedSidecar = { ...sidecar, targetUrl: nonLoopback.toString() };
    writeFileSync(sidecarPath, canonicalJsonBytes(tamperedSidecar));
    const tamperedLifecycle = structuredClone(prepared.current.evidence);
    tamperedLifecycle.privateBinding.sidecarSha256 = sha256(
      canonicalJsonBytes(tamperedSidecar),
    );
    const resealed = sealDatabaseLifecycleEvidence(tamperedLifecycle);
    writeFileSync(
      prepared.environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH,
      canonicalJsonBytes(resealed),
    );
    const tamperedCurrent = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: prepared.environment,
    });
    const tamperedBinding = createAuthSessionPreflightDatabaseBinding({
      current: tamperedCurrent,
      authPreflightInvocationNonce: value.nonce,
    });
    expectSafeError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot,
          environment: prepared.environment,
          stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
          preflightLifecycleBinding: tamperedBinding,
          authPreflightInvocationNonce: value.nonce,
        }),
      /private target differs/,
    );
    await abortAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot,
      environment: prepared.environment,
      adapter: value.adapter,
      preflightLifecycleBinding: tamperedBinding,
      originalFailure: { classification: "AUTH_PROJECTION_TAMPER_TEST" },
    });
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
}

async function lifecycleReadinessCoverage() {
  const value = fixture("planned");
  try {
    const environment = createAuthSessionPreflightDatabaseEnvironment({
      baseEnvironment: value.baseEnvironment,
      lifecycleRoot: value.root,
      candidateCommitSha,
      candidateTreeSha,
      authPreflightInvocationNonce: value.nonce,
    });
    await planCertificationDatabase({
      repositoryRoot,
      environment,
      adapter: value.adapter,
      nonce: randomBytes(16).toString("hex"),
      qualificationFixture: true,
      profile: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      authPreflightInvocationNonce: value.nonce,
    });
    await assert.rejects(
      bindCertificationDatabaseStage({
        repositoryRoot,
        environment,
        adapter: value.adapter,
        stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
        authPreflightInvocationNonce: value.nonce,
      }),
      /not permitted in the current lifecycle state/,
    );
    const current = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment,
    });
    assert.equal(current.evidence.currentState, "failed");
    await abortAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot,
      environment,
      adapter: value.adapter,
      preflightLifecycleBinding: {
        lifecycleEvidenceSha256: current.descriptor.sha256,
        scopedRoleClassification: "private-stage-login-no-admin",
        scopedRoleIdentitySha256: "0".repeat(64),
      },
      originalFailure: { classification: "AUTH_PREFLIGHT_NOT_READY" },
    }).catch(() => undefined);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
}

async function abortAndFailureCoverage() {
  const authFailure = fixture("auth-failure");
  try {
    const prepared = await prepare(authFailure);
    authFailure.adapter.rows = [{ table: "User", count: 1 }];
    authFailure.adapter.sessions = [{ pid: 441, role: "scoped" }];
    const aborted = await abortAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot,
      environment: prepared.environment,
      adapter: authFailure.adapter,
      preflightLifecycleBinding: prepared.preflightLifecycleBinding,
      originalFailure: { classification: "AUTH_PREFLIGHT_SESSION_RESPONSE_INVALID" },
    });
    assert.equal(aborted.current.evidence.currentState, "abort-absence-verified");
    assert.equal(
      aborted.current.evidence.failure.classification,
      "AUTH_PREFLIGHT_SESSION_RESPONSE_INVALID",
    );
    assert.equal(aborted.current.evidence.cleanup.failedRunRehabilitated, false);
    assert.equal(aborted.evidence.authSessionServerPreflight, "failed");
    assert.equal(aborted.evidence.finalInspectionResult, "abort-inspected");
    assert.equal(aborted.evidence.dropResult, "passed");
    assert.equal(authFailure.adapter.unrelatedDatabaseExists, true);
    assert.equal(authFailure.adapter.unrelatedSessionExists, true);
  } finally {
    rmSync(authFailure.root, { recursive: true, force: true });
  }

  const cleanupFailure = fixture(
    "cleanup-failure",
    new AuthPreflightAdapter({ dropFailures: 1 }),
  );
  try {
    const prepared = await prepare(cleanupFailure);
    await assert.rejects(
      completeAuthSessionPreflightDatabaseLifecycle({
        repositoryRoot,
        environment: prepared.environment,
        adapter: cleanupFailure.adapter,
        preflightLifecycleBinding: prepared.preflightLifecycleBinding,
      }),
      /injected exact-target drop failure/,
    );
    const aborted = await abortAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot,
      environment: prepared.environment,
      adapter: cleanupFailure.adapter,
      preflightLifecycleBinding: prepared.preflightLifecycleBinding,
      originalFailure: { classification: "AUTH_PREFLIGHT_NORMAL_CLEANUP_FAILURE" },
      authSessionServerPreflight: "passed",
    });
    assert.equal(aborted.evidence.cleanupMode, "abort");
    assert.equal(aborted.evidence.authSessionServerPreflight, "passed");
    assert.equal(aborted.evidence.absenceResult, "passed");
    assert.equal(aborted.evidence.originalFailureRetained, true);
  } finally {
    rmSync(cleanupFailure.root, { recursive: true, force: true });
  }
}

async function realHelperFailureOrchestrationCoverage() {
  for (const [label, code] of [
    ["server-before-listener", "AUTH_PREFLIGHT_SERVER_EXITED_BEFORE_LISTENER"],
    ["readiness-failure", "AUTH_PREFLIGHT_READINESS_FAILED"],
    ["invalid-session", "AUTH_PREFLIGHT_SESSION_SHAPE_INVALID"],
  ]) {
    const value = fixture(`helper-${label}`);
    try {
      const prepared = await prepare(value);
      value.adapter.sessions = [{ pid: 772, role: "scoped" }];
      const sequence = await runPreparedAuthPreflightDatabaseSequence({
        repositoryRoot,
        prepared,
        adapter: value.adapter,
        executeChild: async () => ({
          childProcess: { error: null, signal: null, status: 1 },
          childValidated: {
            result: {
              result: "failure",
              failure: { code },
            },
          },
        }),
      });
      assert.equal(sequence.retainedFailure instanceof Error, true);
      assert.equal(sequence.authSessionServerPreflight, "failed");
      assert.equal(
        sequence.databaseCompletion.current.evidence.currentState,
        "abort-absence-verified",
      );
      assert.equal(
        sequence.databaseCompletion.current.evidence.failure.classification,
        code,
      );
      assert.equal(sequence.databaseCompletion.evidence.originalFailureRetained, true);
      assert.equal(sequence.databaseCompletion.evidence.failedPreflightRehabilitated, false);
      assert.equal(sequence.databaseCompletion.evidence.absenceResult, "passed");
      assert.equal(value.adapter.sessions.length, 0);
      assert.equal(value.adapter.unrelatedDatabaseExists, true);
      assert.equal(value.adapter.unrelatedSessionExists, true);
      authResultContract.validateAuthPreflightDatabaseEvidence(
        sequence.databaseCompletion.evidence,
        "failure",
      );
      for (const [field, replacement] of [
        ["originalFailureRetained", false],
        ["failedPreflightRehabilitated", true],
        ["cleanupMode", "normal"],
        ["dropResult", "failed"],
        ["absenceResult", "failed"],
      ]) {
        assert.throws(
          () =>
            authResultContract.validateAuthPreflightDatabaseEvidence(
              {
                ...sequence.databaseCompletion.evidence,
                [field]: replacement,
              },
              "failure",
            ),
          /retained failure and complete abort cleanup proof/i,
        );
      }
      assert.doesNotMatch(
        JSON.stringify(sequence.databaseCompletion.evidence),
        /postgres(?:ql)?:\/\//i,
      );
      assert.doesNotMatch(
        JSON.stringify(sequence.databaseCompletion.evidence),
        /private-test-value/i,
      );
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  }

  const publication = fixture("helper-result-publication");
  try {
    const prepared = await prepare(publication);
    const sequence = await runPreparedAuthPreflightDatabaseSequence({
      repositoryRoot,
      prepared,
      adapter: publication.adapter,
      executeChild: async () => {
        throw Object.assign(
          new Error("injected structured result publication failure"),
          { code: "AUTH_PREFLIGHT_RESULT_PUBLICATION_FAILED" },
        );
      },
    });
    assert.match(sequence.retainedFailure.message, /publication failure/);
    assert.equal(
      sequence.databaseCompletion.current.evidence.currentState,
      "abort-absence-verified",
    );
    assert.equal(
      sequence.databaseCompletion.current.evidence.failure.classification,
      "AUTH_PREFLIGHT_RESULT_PUBLICATION_FAILED",
    );
    assert.equal(sequence.databaseCompletion.evidence.originalFailureRetained, true);
    assert.equal(sequence.databaseCompletion.evidence.absenceResult, "passed");
  } finally {
    rmSync(publication.root, { recursive: true, force: true });
  }

  const cleanup = fixture(
    "helper-normal-cleanup-failure",
    new AuthPreflightAdapter({ dropFailures: 1 }),
  );
  try {
    const prepared = await prepare(cleanup);
    const sequence = await runPreparedAuthPreflightDatabaseSequence({
      repositoryRoot,
      prepared,
      adapter: cleanup.adapter,
      executeChild: async () => ({
        childProcess: { error: null, signal: null, status: 0 },
        childValidated: { result: { result: "success", failure: null } },
      }),
    });
    assert.equal(sequence.authSessionServerPreflight, "passed");
    assert.equal(sequence.databaseCompletion.evidence.authSessionServerPreflight, "passed");
    assert.equal(sequence.databaseCompletion.evidence.cleanupMode, "abort");
    assert.equal(sequence.databaseCompletion.evidence.originalFailureRetained, true);
    authResultContract.validateAuthPreflightDatabaseEvidence(
      sequence.databaseCompletion.evidence,
      "failure",
    );
  } finally {
    rmSync(cleanup.root, { recursive: true, force: true });
  }

  const repeatedAbort = fixture(
    "helper-repeated-abort-failure",
    new AuthPreflightAdapter({ dropFailures: 2 }),
  );
  try {
    const prepared = await prepare(repeatedAbort);
    const executeChild = async () => ({
      childProcess: { error: null, signal: null, status: 1 },
      childValidated: {
        result: {
          result: "failure",
          failure: { code: "AUTH_PREFLIGHT_READINESS_FAILED" },
        },
      },
    });
    await assert.rejects(
      runPreparedAuthPreflightDatabaseSequence({
        repositoryRoot,
        prepared,
        adapter: repeatedAbort.adapter,
        executeChild,
      }),
      /injected exact-target drop failure/,
    );
    assert.equal(
      existsSync(prepared.environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH),
      true,
    );
    await assert.rejects(
      runPreparedAuthPreflightDatabaseSequence({
        repositoryRoot,
        prepared,
        adapter: repeatedAbort.adapter,
        executeChild,
      }),
      /injected exact-target drop failure/,
    );
    assert.equal(
      existsSync(prepared.environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH),
      true,
    );
    const recovered = await abortAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot,
      environment: prepared.environment,
      adapter: repeatedAbort.adapter,
      preflightLifecycleBinding: prepared.preflightLifecycleBinding,
      originalFailure: { classification: "AUTH_PREFLIGHT_READINESS_FAILED" },
    });
    assert.equal(recovered.evidence.absenceResult, "passed");
  } finally {
    rmSync(repeatedAbort.root, { recursive: true, force: true });
  }
}

async function collisionAndPublicationRaceCoverage() {
  const collision = fixture(
    "role-collision",
    new AuthPreflightAdapter({ roleCollision: true }),
  );
  try {
    await assert.rejects(prepare(collision), /scoped role collision/);
    assert.equal(collision.adapter.exists, false);
    assert.equal(collision.adapter.unrelatedDatabaseExists, true);
  } finally {
    rmSync(collision.root, { recursive: true, force: true });
  }

  const race = fixture("sidecar-race");
  try {
    await assert.rejects(
      prepare(race, {
        testHooks: {
          beforePrivateSidecarPublish({ filePath }) {
            writeFileSync(filePath, "foreign-sidecar\n", {
              flag: "wx",
              mode: 0o600,
            });
          },
        },
      }),
      /target already exists/,
    );
    assert.equal(race.adapter.exists, false);
    assert.equal(race.adapter.roleName, null);
  } finally {
    rmSync(race.root, { recursive: true, force: true });
  }
}

function sourceOwnershipGuardCoverage() {
  const helper = readFileSync(
    path.join(repositoryRoot, "scripts/run-ci-auth-fixture-real-preflight.mjs"),
    "utf8",
  );
  const assertCanonicalOwnership = (source) => {
    assert.doesNotMatch(
      source,
      /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|VACUUM|REINDEX)\b/i,
      "auth helper must not contain direct database SQL",
    );
    assert.doesNotMatch(
      source,
      /\b(?:psql|createdb|dropdb|pg_dump|pg_restore)\b|\.(?:query|execute)\s*\(|\bsql\s*`|(?:from|require\s*\()\s*["'](?:pg|postgres|postgres\.js)["']/i,
      "auth helper must not invoke a database client",
    );
    assert.doesNotMatch(
      source,
      /pg_terminate_backend|\bDATABASE_URL\b|postgres(?:ql)?:\/\/|\bnew\s+URL\s*\(|\bURL\.(?:parse|canParse)\s*\(|\burl\.(?:parse|format|resolve)\s*\(|\.(?:href|hostname|pathname|password|username|protocol)\s*=/i,
      "auth helper must not construct a database connection URL",
    );
  };
  assertCanonicalOwnership(helper);
  for (const forbiddenSource of [
    'client.query("SELECT current_database()")',
    'await client.execute("ALTER ROLE scoped CREATEDB")',
    'spawnSync("psql", ["-c", "GRANT ALL"]);',
    'const target = URL.parse(parts.join(""));',
    'const target = url.format(parts);',
    'target.hostname = "127.0.0.1";',
  ]) {
    assert.throws(
      () => assertCanonicalOwnership(`${helper}\n${forbiddenSource}\n`),
      /auth helper must not/,
    );
  }
  assert.doesNotMatch(helper, /interior_ai_auth_/i);
  assert.match(helper, /prepareAuthSessionPreflightDatabaseLifecycle/);
  assert.match(helper, /completeAuthSessionPreflightDatabaseLifecycle/);
  assert.match(helper, /abortAuthSessionPreflightDatabaseLifecycle/);
  assert.match(helper, /projectCertificationChildEnvironment/);
  assert.match(helper, /runPreparedAuthPreflightDatabaseSequence/);
  assert.match(helper, /consumeFixtureSession/);
  assert.match(helper, /createAuthPreflightWorktree/);
  assert.match(helper, /completeAuthPreflightWorktree/);
  assert.match(helper, /ci:auth-fixture:preflight-existing/);
  assert.doesNotMatch(helper, /test:advisory-auth-preflight/);
  assert.match(helper, /fixtureSession/);
  assert.match(helper, /private recovery evidence was retained/);
  assert.doesNotMatch(helper, /\.catch\(\(\)\s*=>\s*undefined\)/);
  const packageValue = JSON.parse(
    readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  assert.equal(
    packageValue.scripts["certification:auth-session-preflight"],
    "node scripts/run-ci-auth-fixture-real-preflight.mjs",
  );
}

function runGit(repositoryRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `workspace regression Git command failed: git ${args.join(" ")}`,
  );
  return result.stdout.trim();
}

function workspaceFixture(label) {
  const root = mkdtempSync(
    path.join(tmpdir(), `auth-preflight-worktree-regression-${label}-`),
  );
  const sourceRoot = path.join(root, "source");
  mkdirSync(sourceRoot);
  mkdirSync(path.join(sourceRoot, "node_modules"));
  writeFileSync(path.join(sourceRoot, ".gitignore"), "/node_modules\n");
  writeFileSync(path.join(sourceRoot, "marker.txt"), "canonical-marker\n");
  writeFileSync(
    path.join(sourceRoot, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: {}, include: ["**/*.ts"] }, null, 2)}\n`,
  );
  runGit(sourceRoot, ["init", "--quiet"]);
  runGit(sourceRoot, ["config", "user.name", "Auth Workspace Regression"]);
  runGit(sourceRoot, ["config", "user.email", "auth-workspace@example.invalid"]);
  runGit(sourceRoot, ["add", "."]);
  runGit(sourceRoot, ["commit", "--quiet", "-m", "fixture"]);
  const candidateCommitSha = runGit(sourceRoot, ["rev-parse", "HEAD"]);
  const candidateTreeSha = runGit(sourceRoot, ["rev-parse", "HEAD^{tree}"]);
  const sourceTsconfigSha256 = sha256(
    readFileSync(path.join(sourceRoot, "tsconfig.json")),
  );
  const workspace = createAuthPreflightWorktree({
    repositoryRoot: sourceRoot,
    candidateCommitSha,
    candidateTreeSha,
    fixtureSessionIdentitySha256: "a".repeat(64),
  });
  return {
    root,
    sourceRoot,
    candidateCommitSha,
    candidateTreeSha,
    sourceTsconfigSha256,
    workspace,
  };
}

function assertWorkspaceFixtureClean(value) {
  assert.equal(runGit(value.sourceRoot, ["status", "--porcelain=v1"]), "");
  assert.equal(
    sha256(readFileSync(path.join(value.sourceRoot, "tsconfig.json"))),
    value.sourceTsconfigSha256,
  );
  assert.equal(
    runGit(value.sourceRoot, ["worktree", "list", "--porcelain"]).includes(
      value.workspace.worktreeRoot,
    ),
    false,
  );
}

function expectedGeneratedTsconfig(value) {
  const filePath = path.join(value.workspace.worktreeRoot, "tsconfig.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  parsed.include.push(NEXT_GENERATED_TSCONFIG_INCLUDE);
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function assertSafeWorkspaceEvidence(value, evidence) {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /private-test-value/i);
  assert.equal(serialized.includes(value.sourceRoot), false);
  assert.equal(serialized.includes(value.workspace.worktreeRoot), false);
  assert.equal(evidence.cleanup.completed, true);
  assert.equal(evidence.cleanup.registrationAbsent, true);
  assert.equal(evidence.cleanup.sourceByteIdenticalAfterCleanup, true);
}

function workspaceLifecycleCoverage() {
  {
    const value = workspaceFixture("deterministic");
    try {
      assert.equal(runGit(value.workspace.worktreeRoot, ["branch", "--show-current"]), "");
      assert.equal(
        runGit(value.workspace.worktreeRoot, ["rev-parse", "HEAD"]),
        value.candidateCommitSha,
      );
      expectedGeneratedTsconfig(value);
      const evidence = completeAuthPreflightWorktree(value.workspace);
      assert.equal(
        evidence.trackedOutput.mutationClassification,
        "deterministic-next-generated",
      );
      assert.deepEqual(evidence.trackedOutput.changedPaths, ["tsconfig.json"]);
      assertSafeWorkspaceEvidence(value, evidence);
      const resultIdentity = {
        result: "success",
        identity: {
          candidateCommitSha: value.candidateCommitSha,
          candidateTreeSha: value.candidateTreeSha,
          fixtureSession: { sessionAggregateSha256: "a".repeat(64) },
        },
      };
      authResultContract.validateAuthPreflightWorkspaceEvidence(
        evidence,
        resultIdentity,
      );
      assert.throws(
        () =>
          authResultContract.validateAuthPreflightWorkspaceEvidence(
            {
              ...evidence,
              trackedOutput: {
                ...evidence.trackedOutput,
                expectedGeneratedSha256: "b".repeat(64),
              },
            },
            resultIdentity,
          ),
        /worktree prerequisite|worktree isolation/i,
      );
      assertWorkspaceFixtureClean(value);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  }

  {
    const value = workspaceFixture("absent");
    try {
      const evidence = completeAuthPreflightWorktree(value.workspace);
      assert.equal(evidence.trackedOutput.mutationClassification, "absent");
      assert.equal(evidence.trackedOutput.changedPathCount, 0);
      assertSafeWorkspaceEvidence(value, evidence);
      assertWorkspaceFixtureClean(value);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  }

  for (const scenario of [
    {
      label: "unexpected-tracked",
      mutate(value) {
        writeFileSync(
          path.join(value.workspace.worktreeRoot, "marker.txt"),
          "unexpected tracked mutation\n",
        );
      },
      issue: "unexpected-tracked-paths",
    },
    {
      label: "staged",
      mutate(value) {
        writeFileSync(
          path.join(value.workspace.worktreeRoot, "marker.txt"),
          "staged mutation\n",
        );
        runGit(value.workspace.worktreeRoot, ["add", "marker.txt"]);
      },
      issue: "staged-paths",
    },
    {
      label: "untracked",
      mutate(value) {
        writeFileSync(
          path.join(value.workspace.worktreeRoot, "unexpected.txt"),
          "ordinary untracked output\n",
        );
      },
      issue: "ordinary-untracked-paths",
    },
    {
      label: "symlink-tsconfig",
      mutate(value) {
        const tsconfigPath = path.join(value.workspace.worktreeRoot, "tsconfig.json");
        unlinkSync(tsconfigPath);
        symlinkSync("marker.txt", tsconfigPath);
      },
      issue: "tsconfig-type",
    },
  ]) {
    const value = workspaceFixture(scenario.label);
    try {
      scenario.mutate(value);
      let retained = null;
      try {
        completeAuthPreflightWorktree(value.workspace);
      } catch (error) {
        retained = error;
      }
      assert.ok(retained instanceof Error);
      assert.equal(
        retained.code,
        "AUTH_PREFLIGHT_WORKTREE_OUTPUT_REJECTED",
      );
      assert.ok(retained.safeEvidence.trackedOutput.issues.includes(scenario.issue));
      assertSafeWorkspaceEvidence(value, retained.safeEvidence);
      assertWorkspaceFixtureClean(value);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  }

  {
    const value = workspaceFixture("foreign-preserved");
    const foreignRoot = path.join(value.root, "foreign-worktree");
    try {
      runGit(value.sourceRoot, ["worktree", "add", "--detach", foreignRoot, "HEAD"]);
      const evidence = completeAuthPreflightWorktree(value.workspace);
      assertSafeWorkspaceEvidence(value, evidence);
      assert.equal(
        runGit(value.sourceRoot, ["worktree", "list", "--porcelain"]).includes(
          foreignRoot,
        ),
        true,
      );
      runGit(value.sourceRoot, ["worktree", "remove", "--force", foreignRoot]);
      assertWorkspaceFixtureClean(value);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  }
}

sourceOwnershipGuardCoverage();
workspaceLifecycleCoverage();
await normalLifecycleAndProjectionCoverage();
await projectionTamperCoverage();
await lifecycleReadinessCoverage();
await abortAndFailureCoverage();
await realHelperFailureOrchestrationCoverage();
await collisionAndPublicationRaceCoverage();

const regressionMatrix = JSON.parse(
  readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-regressions.json"),
    "utf8",
  ),
);
assert.deepEqual(
  regressionMatrix.authPreflightDatabaseCases,
  coveredAuthPreflightDatabaseCases,
);

console.log(
  "Production certification auth-preflight database lifecycle coverage passed.",
);
console.log(
  `AUTH_PREFLIGHT_DATABASE_REGRESSION_RESULT ${JSON.stringify({
    schema:
      "interior-ai.production-certification-auth-preflight-database-regression.v1",
    passedCases: coveredAuthPreflightDatabaseCases,
    passed: true,
  })}`,
);
