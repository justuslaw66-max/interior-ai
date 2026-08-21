import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  authFixtureRegressionCapabilityNames,
  isolatedAuthFixtureRegressionEnvironment,
} from "./ci-auth-fixture-regression-environment.mjs";
import { migrationInventory } from "./production-certification-database-contract.mjs";
import { projectAuthFixtureSessionForStage } from "./production-certification-real.mjs";
import {
  authPreflightOrchestrationFailurePath,
  runRealAuthPreflight,
  validateAuthPreflightOrchestrationFailure,
} from "./run-ci-auth-fixture-real-preflight.mjs";
import {
  CALLER_RETAINED_AUTH_RESULT_DIRECTORY,
  canonicalAuthResultOwnership,
  canonicalSessionOwnership,
} from "./run-ci-auth-fixture-session.mjs";

const require = createRequire(import.meta.url);
const resultContract = require("./ci-auth-fixture-result-contract.cjs");
const sessionContract = require("./ci-auth-fixture-session.cjs");
const repositoryRoot = process.cwd();
const roots = [];
const candidateCommitSha = git("HEAD");
const candidateTreeSha = git("HEAD^{tree}");
const authSecret = "fixture-session-test-auth-secret-at-least-32-characters";
const ISOLATED_CHILD_ARGUMENT = "--isolated-auth-fixture-regression-child";
const NESTED_ISOLATION_NEGATIVE_CASES = Object.freeze([
  "outer-provider-variable-remains",
  "outer-fixture-session-id-remains",
  "outer-root-remains",
  "outer-nonce-remains",
  "outer-digest-metadata-remains",
  "nested-session-uses-outer-transport",
  "mixed-provider-bytes-with-distinct-session-ids",
  "parent-environment-mutation",
  "nested-cleanup-removes-outer-resources",
  "missing-nested-session-identity",
  "nested-duplicate-generation",
  "raw-provider-value-leak",
  "foreign-candidate-session-result",
]);

const AUTH_FIXTURE_CAPABILITY_NAMES =
  authFixtureRegressionCapabilityNames(repositoryRoot);
const certificationMigrationNames = migrationInventory(repositoryRoot).migrations.map(
  ({ id }) => id,
);

class InnerFailureDatabaseAdapter {
  constructor() {
    this.exists = false;
    this.migrated = false;
    this.roleName = null;
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
    return this.migrated ? certificationMigrationNames : [];
  }

  async inspectStageRole() {
    return { exists: this.roleName !== null, adminCapabilities: false };
  }

  async createStageRole({ roleName }) {
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
    return [];
  }

  async targetSessions() {
    return [];
  }

  async terminateTargetSessions() {
    return {
      matchedSessionCount: 0,
      terminatedPids: [],
      remainingSessionCount: 0,
    };
  }

  async dropDatabase() {
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

function isolatedRegressionChildEnvironment(parentEnvironment) {
  return isolatedAuthFixtureRegressionEnvironment({
    repositoryRoot,
    parentEnvironment,
  });
}

function environmentIdentity(environment, names = Object.keys(environment)) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...names]
          .sort()
          .map((name) => [name, environment[name] ?? null]),
      ),
    )
    .digest("hex");
}

function sessionResourceIdentity(sessionRoot) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        readdirSync(sessionRoot)
          .sort()
          .map((name) => [
            name,
            createHash("sha256")
              .update(readFileSync(path.join(sessionRoot, name)))
              .digest("hex"),
          ]),
      ),
    )
    .digest("hex");
}

function safeChildProcessEvidence(child) {
  const stdout = String(child.stdout ?? "");
  const stderr = String(child.stderr ?? "");
  return {
    exitCode: Number.isSafeInteger(child.status) ? child.status : null,
    signal: child.signal ?? null,
    spawnError: child.error?.code ?? null,
    stdout: {
      bytes: Buffer.byteLength(stdout),
      sha256: createHash("sha256").update(stdout).digest("hex"),
    },
    stderr: {
      bytes: Buffer.byteLength(stderr),
      sha256: createHash("sha256").update(stderr).digest("hex"),
    },
  };
}

function assertEnvironmentIdentityUnchanged(environment, names, expected) {
  if (environmentIdentity(environment, names) !== expected) {
    throw new Error("nested auth fixture regression mutated its parent environment");
  }
}

function assertSessionResourceIdentityUnchanged(sessionRoot, expected) {
  let actual = null;
  try {
    actual = sessionResourceIdentity(sessionRoot);
  } catch {
    // A missing or malformed outer resource is still a fail-closed mismatch.
  }
  if (actual !== expected) {
    throw new Error("nested auth fixture cleanup changed outer resources");
  }
}

function git(revision) {
  const result = spawnSync("git", ["rev-parse", revision], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  return result.stdout.trim();
}

function root(prefix) {
  const value = realpathSync(
    mkdtempSync(path.join(tmpdir(), `ci-auth-session-${prefix}-`)),
  );
  chmodSync(value, 0o700);
  roots.push(value);
  return value;
}

function baseEnvironment(
  sessionRoot,
  sessionId,
  sessionNonce,
  parentEnvironment = process.env,
) {
  return {
    ...parentEnvironment,
    APP_ENV: "development",
    CI: "true",
    GITHUB_ACTIONS: "true",
    CI_AUTH_FIXTURE_MODE: "1",
    AUTH_SECRET: authSecret,
    NEXTAUTH_SECRET: authSecret,
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidateCommitSha,
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidateTreeSha,
    [sessionContract.FIXTURE_SESSION_ROOT_ENV]: sessionRoot,
    [sessionContract.FIXTURE_SESSION_ID_ENV]: sessionId,
    [sessionContract.FIXTURE_SESSION_NONCE_ENV]: sessionNonce,
    [sessionContract.FIXTURE_SESSION_CLASSIFICATION_ENV]:
      sessionContract.FIXTURE_SESSION_CLASSIFICATION,
  };
}

function runStructured({ script, commandId, mode, environment, resultRoot, suffix }) {
  const resultPath = path.join(resultRoot, `${suffix}.json`);
  const nonce = `fixture-session-result-${suffix}-001`;
  const childEnvironment = {
    ...environment,
    CI_AUTH_FIXTURE_RESULT_ROOT: resultRoot,
    CI_AUTH_FIXTURE_RESULT_PATH: resultPath,
    CI_AUTH_FIXTURE_RESULT_NONCE: nonce,
  };
  const child = spawnSync("npm", ["run", script], {
    cwd: repositoryRoot,
    env: childEnvironment,
    encoding: "utf8",
  });
  assert.equal(
    child.status,
    0,
    `${script} failed: ${JSON.stringify(safeChildProcessEvidence(child))}`,
  );
  return resultContract.validateAuthCommandResult({
    repositoryRoot,
    externalRoot: resultRoot,
    resultPath,
    expectedNonce: nonce,
    expectedCommandId: commandId,
    expectedMode: mode,
    expectedCandidateCommitSha: candidateCommitSha,
    expectedCandidateTreeSha: candidateTreeSha,
    sensitiveValues: resultContract.privateValuesFromEnvironment(childEnvironment),
  }).result;
}

function safeContinuity(result) {
  const session = result.identity.fixtureSession;
  return {
    sessionId: session.sessionId,
    invocationNonce: session.invocationNonce,
    candidate: session.candidate,
    generator: session.generator,
    policy: session.policy,
    providerDigests: session.providerDigests,
    sessionAggregateSha256: session.sessionAggregateSha256,
  };
}

function publishTestSession(prefix, options = {}) {
  const ownerRoot = root(prefix);
  const sessionRoot = path.join(ownerRoot, "private-session");
  const sessionId = `fixture-session-${prefix}-001`;
  const sessionNonce = `fixture-nonce-${prefix}-001`;
  const environment = baseEnvironment(
    sessionRoot,
    sessionId,
    sessionNonce,
    options.parentEnvironment,
  );
  const fixtureNonce = options.fixtureNonce || "b".repeat(32);
  const published = sessionContract.publishFixtureSession({
    repositoryRoot,
    environment,
    fixture: {
      googleClientId:
        `123456789012345-gate-a3-ci-${fixtureNonce}.apps.googleusercontent.com`,
      googleClientSecret: `GOCSPX-gate-a3-ci-${fixtureNonce}`,
    },
    ...(options.now ? { now: options.now } : {}),
  });
  return { ownerRoot, sessionRoot, sessionId, sessionNonce, environment, published };
}

function sourceGuards() {
  const helper = readFileSync(
    path.join(repositoryRoot, "scripts/run-ci-auth-fixture-real-preflight.mjs"),
    "utf8",
  );
  const fixtureOwner = readFileSync(
    path.join(repositoryRoot, "scripts/ci-auth-fixture.ts"),
    "utf8",
  );
  const packageValue = JSON.parse(
    readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  assert.match(helper, /ci:auth-fixture:preflight-existing/);
  assert.doesNotMatch(helper, /test:advisory-auth-preflight/);
  assert.match(fixtureOwner, /LOCAL_ADVISORY_ONLY/);
  assert.match(fixtureOwner, /NOT_CERTIFICATION_FIXTURE_SESSION/);
  assert.equal(
    packageValue.scripts["certification:auth-preflight"],
    "node scripts/run-ci-auth-fixture-session.mjs",
  );
}

async function runIsolatedAuthFixtureRegressionChild() {
const executedNegativeCases = new Set();
let completedNegativeCases = [];
assert.deepEqual(canonicalSessionOwnership({}), {
  ownedSessionRoot: true,
  sessionRoot: null,
  sessionId: null,
  sessionNonce: null,
});
assert.throws(
  () =>
    canonicalSessionOwnership({
      [sessionContract.FIXTURE_SESSION_ROOT_ENV]: "/private/session",
    }),
  /requires root, ID, nonce, and classification/,
);
assert.deepEqual(
  canonicalSessionOwnership({
    [sessionContract.FIXTURE_SESSION_ROOT_ENV]: "/private/session",
    [sessionContract.FIXTURE_SESSION_ID_ENV]: "caller-session-id-001",
    [sessionContract.FIXTURE_SESSION_NONCE_ENV]: "caller-session-nonce-001",
    [sessionContract.FIXTURE_SESSION_CLASSIFICATION_ENV]:
      sessionContract.FIXTURE_SESSION_CLASSIFICATION,
  }),
  {
    ownedSessionRoot: false,
    sessionRoot: "/private/session",
    sessionId: "caller-session-id-001",
    sessionNonce: "caller-session-nonce-001",
  },
);

const retentionOwnerRoot = root("result-retention");
const retainedSessionRoot = path.join(retentionOwnerRoot, "caller-session");
const retainedOrchestrationRoot = path.join(
  retentionOwnerRoot,
  "caller-orchestration",
);
mkdirSync(retainedSessionRoot, { mode: 0o700 });
mkdirSync(retainedOrchestrationRoot, { mode: 0o700 });
const retainedResultOwnership = canonicalAuthResultOwnership({
  sessionOwnership: canonicalSessionOwnership({
    [sessionContract.FIXTURE_SESSION_ROOT_ENV]: retainedSessionRoot,
    [sessionContract.FIXTURE_SESSION_ID_ENV]: "caller-session-retention-001",
    [sessionContract.FIXTURE_SESSION_NONCE_ENV]:
      "caller-session-retention-nonce-001",
    [sessionContract.FIXTURE_SESSION_CLASSIFICATION_ENV]:
      sessionContract.FIXTURE_SESSION_CLASSIFICATION,
  }),
  orchestrationRoot: retainedOrchestrationRoot,
});
assert.equal(retainedResultOwnership.retainedByCaller, true);
assert.equal(
  retainedResultOwnership.resultRoot,
  path.join(retainedSessionRoot, CALLER_RETAINED_AUTH_RESULT_DIRECTORY),
);
assert.equal(
  (lstatSync(retainedResultOwnership.resultRoot).mode & 0o077) === 0,
  true,
);
assert.equal(lstatSync(retainedResultOwnership.resultRoot).isDirectory(), true);
assert.equal(lstatSync(retainedResultOwnership.resultRoot).isSymbolicLink(), false);
writeFileSync(
  path.join(retainedResultOwnership.resultRoot, "retained-result-marker"),
  "retained\n",
  { flag: "wx", mode: 0o600 },
);
assert.throws(
  () =>
    canonicalAuthResultOwnership({
      sessionOwnership: canonicalSessionOwnership({
        [sessionContract.FIXTURE_SESSION_ROOT_ENV]: retainedSessionRoot,
        [sessionContract.FIXTURE_SESSION_ID_ENV]:
          "caller-session-retention-001",
        [sessionContract.FIXTURE_SESSION_NONCE_ENV]:
          "caller-session-retention-nonce-001",
        [sessionContract.FIXTURE_SESSION_CLASSIFICATION_ENV]:
          sessionContract.FIXTURE_SESSION_CLASSIFICATION,
      }),
      orchestrationRoot: retainedOrchestrationRoot,
    }),
  /EEXIST/,
  "caller-owned result evidence must be no-overwrite",
);
assert.equal(
  readFileSync(
    path.join(retainedResultOwnership.resultRoot, "retained-result-marker"),
    "utf8",
  ),
  "retained\n",
  "a repeated result-root attempt must preserve existing evidence",
);

const unsafeModeRoot = path.join(retentionOwnerRoot, "unsafe-mode-session");
mkdirSync(unsafeModeRoot, { mode: 0o755 });
chmodSync(unsafeModeRoot, 0o755);
assert.throws(
  () =>
    canonicalAuthResultOwnership({
      sessionOwnership: {
        ownedSessionRoot: false,
        sessionRoot: unsafeModeRoot,
      },
      orchestrationRoot: retainedOrchestrationRoot,
    }),
  /physical owner-only directory/,
);
assert.equal(
  existsSync(path.join(unsafeModeRoot, CALLER_RETAINED_AUTH_RESULT_DIRECTORY)),
  false,
);

const symlinkTargetRoot = path.join(retentionOwnerRoot, "symlink-target-session");
const symlinkSessionRoot = path.join(retentionOwnerRoot, "symlink-session");
mkdirSync(symlinkTargetRoot, { mode: 0o700 });
symlinkSync(symlinkTargetRoot, symlinkSessionRoot, "dir");
assert.throws(
  () =>
    canonicalAuthResultOwnership({
      sessionOwnership: {
        ownedSessionRoot: false,
        sessionRoot: symlinkSessionRoot,
      },
      orchestrationRoot: retainedOrchestrationRoot,
    }),
  /physical owner-only directory/,
);
assert.equal(
  existsSync(
    path.join(symlinkTargetRoot, CALLER_RETAINED_AUTH_RESULT_DIRECTORY),
  ),
  false,
);

const containedSessionRoot = mkdtempSync(
  path.join(repositoryRoot, ".ci-auth-contained-session-"),
);
chmodSync(containedSessionRoot, 0o700);
try {
  assert.throws(
    () =>
      canonicalAuthResultOwnership({
        sessionOwnership: {
          ownedSessionRoot: false,
          sessionRoot: containedSessionRoot,
        },
        orchestrationRoot: retainedOrchestrationRoot,
      }),
    /outside every worktree/,
  );
  assert.equal(
    existsSync(
      path.join(
        containedSessionRoot,
        CALLER_RETAINED_AUTH_RESULT_DIRECTORY,
      ),
    ),
    false,
  );
} finally {
  rmSync(containedSessionRoot, { recursive: true, force: true });
}
rmSync(retainedOrchestrationRoot, { recursive: true, force: true });
assert.equal(
  existsSync(
    path.join(retainedResultOwnership.resultRoot, "retained-result-marker"),
  ),
  true,
  "caller-owned result evidence must survive orchestration cleanup",
);

const taskOwnedOrchestrationRoot = path.join(
  retentionOwnerRoot,
  "task-owned-orchestration",
);
mkdirSync(taskOwnedOrchestrationRoot, { mode: 0o700 });
const taskOwnedResultOwnership = canonicalAuthResultOwnership({
  sessionOwnership: canonicalSessionOwnership({}),
  orchestrationRoot: taskOwnedOrchestrationRoot,
});
assert.equal(taskOwnedResultOwnership.retainedByCaller, false);
writeFileSync(
  path.join(taskOwnedResultOwnership.resultRoot, "task-owned-result-marker"),
  "task-owned\n",
  { flag: "wx", mode: 0o600 },
);
rmSync(taskOwnedOrchestrationRoot, { recursive: true, force: true });
assert.equal(
  existsSync(taskOwnedResultOwnership.resultRoot),
  false,
  "task-owned success evidence must remain subject to task cleanup",
);

const collisionOwnerRoot = root("canonical-result-collision");
const collisionSessionRoot = path.join(collisionOwnerRoot, "private-session");
const collisionResultRoot = path.join(
  collisionSessionRoot,
  CALLER_RETAINED_AUTH_RESULT_DIRECTORY,
);
mkdirSync(collisionSessionRoot, { mode: 0o700 });
mkdirSync(collisionResultRoot, { mode: 0o700 });
writeFileSync(path.join(collisionResultRoot, "existing-evidence"), "existing\n", {
  flag: "wx",
  mode: 0o600,
});
const orchestrationRootsBeforeCollision = readdirSync(tmpdir())
  .filter((name) => name.startsWith("ci-auth-fixture-orchestration-"))
  .sort();
const collisionChild = spawnSync(
  "npm",
  ["run", "certification:auth-preflight"],
  {
    cwd: repositoryRoot,
    env: baseEnvironment(
      collisionSessionRoot,
      "fixture-session-result-collision-001",
      "fixture-nonce-result-collision-001",
    ),
    encoding: "utf8",
  },
);
assert.equal(collisionChild.status, 1);
assert.equal(
  readFileSync(path.join(collisionResultRoot, "existing-evidence"), "utf8"),
  "existing\n",
);
assert.deepEqual(
  readdirSync(tmpdir())
    .filter((name) => name.startsWith("ci-auth-fixture-orchestration-"))
    .sort(),
  orchestrationRootsBeforeCollision,
  "result-root collision must not leak the production orchestration root",
);

const failureOwnerRoot = root("canonical-failure-retention");
const failureSessionRoot = path.join(failureOwnerRoot, "private-session");
mkdirSync(failureSessionRoot, { mode: 0o700 });
const failureSessionId = "fixture-session-failure-retention-001";
const failureSessionNonce = "fixture-nonce-failure-retention-001";
const failureEnvironment = {
  ...baseEnvironment(
    failureSessionRoot,
    failureSessionId,
    failureSessionNonce,
  ),
  AUTH_SECRET: "fixture-session-retention-secret-a-at-least-32-characters",
  NEXTAUTH_SECRET:
    "fixture-session-retention-secret-b-at-least-32-characters",
};
const failureChild = spawnSync(
  "npm",
  ["run", "certification:auth-preflight"],
  {
    cwd: repositoryRoot,
    env: failureEnvironment,
    encoding: "utf8",
  },
);
assert.equal(
  failureChild.status,
  1,
  `canonical failure-retention child had an unexpected outcome: ${JSON.stringify(safeChildProcessEvidence(failureChild))}`,
);
const failureConsumed = sessionContract.consumeFixtureSession({
  repositoryRoot,
  environment: failureEnvironment,
  requireAmbientProviderValues: false,
  sourceCommand: "test:ci-auth-fixture-session",
  sourceMode: "failure-retention-validation",
});
const failureOutput = `${failureChild.stdout}\n${failureChild.stderr}`;
assert.equal(
  [
    failureConsumed.assignments.GOOGLE_CLIENT_ID,
    failureConsumed.assignments.GOOGLE_CLIENT_SECRET,
  ].some((value) => failureOutput.includes(value)),
  false,
  "canonical failure output must not expose retained provider values",
);
const failureResultRoot = path.join(
  failureSessionRoot,
  CALLER_RETAINED_AUTH_RESULT_DIRECTORY,
);
assert.deepEqual(readdirSync(failureResultRoot).sort(), [
  "export.json",
  "export.json.sha256",
  "validate.json",
  "validate.json.sha256",
]);
const failureSensitiveValues = resultContract.privateValuesFromEnvironment({
  ...failureEnvironment,
  ...failureConsumed.assignments,
});
const retainedExportResult = resultContract.validateAuthCommandResult({
  repositoryRoot,
  externalRoot: failureResultRoot,
  resultPath: path.join(failureResultRoot, "export.json"),
  expectedNonce: `${failureSessionNonce}-export`,
  expectedCommandId: "ci:auth-fixture:export",
  expectedMode: "provider-fixture-export",
  expectedCandidateCommitSha: candidateCommitSha,
  expectedCandidateTreeSha: candidateTreeSha,
  sensitiveValues: failureSensitiveValues,
}).result;
const retainedValidateResult = resultContract.validateAuthCommandResult({
  repositoryRoot,
  externalRoot: failureResultRoot,
  resultPath: path.join(failureResultRoot, "validate.json"),
  expectedNonce: `${failureSessionNonce}-validate`,
  expectedCommandId: "ci:auth-fixture:validate-existing",
  expectedMode: "auth-environment-validation",
  expectedCandidateCommitSha: candidateCommitSha,
  expectedCandidateTreeSha: candidateTreeSha,
  sensitiveValues: failureSensitiveValues,
}).result;
assert.equal(retainedExportResult.result, "success");
assert.equal(retainedValidateResult.result, "failure");
assert.equal(retainedValidateResult.failure.code, "AUTH_SECRET_ALIAS_MISMATCH");
assert.equal(retainedValidateResult.completion.complete, true);
assert.equal(
  retainedValidateResult.completion.marker,
  resultContract.AUTH_RESULT_COMPLETION_MARKER,
);

const innerFailureSession = publishTestSession(
  "inner-orchestration-failure-retention",
);
const innerFailureResultRoot = path.join(
  innerFailureSession.ownerRoot,
  "outer-results",
);
mkdirSync(innerFailureResultRoot, { mode: 0o700 });
const innerFailurePublishedPath = path.join(
  innerFailureResultRoot,
  "database-preflight-wrapper.json",
);
const innerFailurePublishedNonce =
  "fixture-nonce-inner-orchestration-failure-result-001";
const innerFailureEnvironment = {
  ...innerFailureSession.environment,
  ...innerFailureSession.published.assignments,
  CERTIFICATION_QUALIFICATION_MODE: "1",
  CERTIFICATION_TEST_DATABASE_ADMIN_URL:
    "postgresql://auth_preflight_admin:private-test-value@127.0.0.1:5432/postgres",
  CI_AUTH_FIXTURE_RESULT_ROOT: innerFailureResultRoot,
  CI_AUTH_FIXTURE_RESULT_PATH: innerFailurePublishedPath,
  CI_AUTH_FIXTURE_RESULT_NONCE: innerFailurePublishedNonce,
};
const partialPublishedBytes = Buffer.from(
  '{"classification":"partial-publication-regression"}\n',
);
writeFileSync(innerFailurePublishedPath, partialPublishedBytes, {
  flag: "wx",
  mode: 0o600,
});
const innerResultRootsBefore = readdirSync(tmpdir())
  .filter((name) => name.startsWith("ci-auth-real-preflight-result-"))
  .sort();
let innerFailureError = null;
try {
  await runRealAuthPreflight({
    baseEnvironment: innerFailureEnvironment,
    sourceIdentity: {
      status: "",
      candidateCommitSha,
      candidateTreeSha,
    },
    databaseAdapter: new InnerFailureDatabaseAdapter(),
    databaseTestHooks: {
      afterPrivateSidecarWrite() {
        const error = new Error(
          "injected safe scoped-role private-sidecar activation failure",
        );
        error.code =
          "AUTH_PREFLIGHT_DATABASE_PRIVATE_SIDECAR_INJECTED_FAILURE";
        throw error;
      },
    },
  });
} catch (error) {
  innerFailureError = error;
}
assert.ok(innerFailureError instanceof Error);
assert.match(innerFailureError.message, /private-sidecar activation failure/);
assert.deepEqual(readFileSync(innerFailurePublishedPath), partialPublishedBytes);
const innerFailureReceiptPath = authPreflightOrchestrationFailurePath(
  innerFailurePublishedPath,
);
assert.deepEqual(readdirSync(innerFailureResultRoot).sort(), [
  path.basename(innerFailurePublishedPath),
  path.basename(innerFailureReceiptPath),
  `${path.basename(innerFailureReceiptPath)}.sha256`,
]);
const validatedInnerFailure = validateAuthPreflightOrchestrationFailure({
  repositoryRoot,
  externalRoot: innerFailureResultRoot,
  resultPath: innerFailureReceiptPath,
  expectedCandidateCommitSha: candidateCommitSha,
  expectedCandidateTreeSha: candidateTreeSha,
  expectedPublishedInvocationNonce: innerFailurePublishedNonce,
  expectedFixtureSessionAggregateSha256:
    innerFailureSession.published.safeIdentity.sessionAggregateSha256,
  sensitiveValues: resultContract.privateValuesFromEnvironment(
    innerFailureEnvironment,
  ),
}).result;
assert.equal(validatedInnerFailure.failure.boundary, "database-prepare");
assert.equal(
  validatedInnerFailure.failure.code,
  "AUTH_SESSION_PREFLIGHT_ORCHESTRATION_FAILURE",
);
assert.deepEqual(validatedInnerFailure.evidence, {
  databaseLifecycleStarted: true,
  databaseLifecyclePrepared: false,
  databaseLifecycleAttribution: {
    failureSubstage: "scoped-role-private-sidecar",
    lifecycleStateAtFailure: "failed",
    failureMode: "provision",
    failureClassification: "DATABASE_LIFECYCLE_FAILURE",
    lifecycleEvidenceSha256:
      validatedInnerFailure.evidence.databaseLifecycleAttribution
        .lifecycleEvidenceSha256,
    planResult: "passed",
    provisionResult: "passed",
    migrationResult: "passed",
    initialVerificationResult: "not-completed",
    scopedRolePrivateSidecarResult: "failed",
    stageBindingResult: "not-completed",
    projectionResult: "not-completed",
  },
  databaseCleanup: "absence-verified",
  workspaceCreated: false,
  workspaceCleanup: "not-started",
  childResultPublication: "absent",
  childResultValidation: "not-completed",
  composedResultPublication: "partial-or-invalid",
});
assert.match(
  validatedInnerFailure.evidence.databaseLifecycleAttribution
    .lifecycleEvidenceSha256,
  /^[a-f0-9]{64}$/,
);
assert.deepEqual(
  readdirSync(tmpdir())
    .filter((name) => name.startsWith("ci-auth-real-preflight-result-"))
    .sort(),
  innerResultRootsBefore,
  "structured inner failure publication must not leak its private result root",
);

try {
  const ownerRoot = root("canonical");
  const sessionRoot = path.join(ownerRoot, "private-session");
  const resultRoot = path.join(ownerRoot, "results");
  const githubWorkspace = path.join(ownerRoot, "workspace");
  const githubEnvironment = path.join(ownerRoot, "github-environment");
  mkdirSync(resultRoot, { mode: 0o700 });
  mkdirSync(githubWorkspace, { mode: 0o700 });
  writeFileSync(githubEnvironment, "", { flag: "wx", mode: 0o600 });
  const sessionId = "fixture-session-canonical-001";
  const sessionNonce = "fixture-nonce-canonical-001";
  const exportEnvironment = {
    ...baseEnvironment(sessionRoot, sessionId, sessionNonce),
    GITHUB_ENV: githubEnvironment,
    GITHUB_WORKSPACE: githubWorkspace,
  };
  const exportResult = runStructured({
    script: "ci:auth-fixture:export",
    commandId: "ci:auth-fixture:export",
    mode: "provider-fixture-export",
    environment: exportEnvironment,
    resultRoot,
    suffix: "export",
  });
  const consumed = sessionContract.consumeFixtureSession({
    repositoryRoot,
    environment: exportEnvironment,
    requireAmbientProviderValues: false,
    sourceCommand: "test:ci-auth-fixture-session",
    sourceMode: "test-consume",
  });
  const consumerEnvironment = {
    ...exportEnvironment,
    ...consumed.assignments,
  };
  const validateResult = runStructured({
    script: "ci:auth-fixture:validate-existing",
    commandId: "ci:auth-fixture:validate-existing",
    mode: "auth-environment-validation",
    environment: consumerEnvironment,
    resultRoot,
    suffix: "validate",
  });
  const misuseResult = runStructured({
    script: "ci:auth-fixture:production-misuse-existing",
    commandId: "ci:auth-fixture:production-misuse-existing",
    mode: "production-misuse-validation",
    environment: consumerEnvironment,
    resultRoot,
    suffix: "misuse",
  });
  assert.deepEqual(safeContinuity(validateResult), safeContinuity(exportResult));
  assert.deepEqual(safeContinuity(misuseResult), safeContinuity(exportResult));
  assert.equal(misuseResult.result, "expected-negative-pass");
  assert.equal(
    misuseResult.evidence.safeFailureCode,
    "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED",
  );
  assert.equal(misuseResult.evidence.excludedFailureCauses.databaseFailure, true);
  assert.throws(
    () =>
      sessionContract.publishFixtureSession({
        repositoryRoot,
        environment: exportEnvironment,
        fixture: {
          googleClientId: consumed.assignments.GOOGLE_CLIENT_ID,
          googleClientSecret: consumed.assignments.GOOGLE_CLIENT_SECRET,
        },
      }),
    /second generation attempt/,
  );
  executedNegativeCases.add("nested-duplicate-generation");

  const buildParentEnvironment = { ...consumerEnvironment };
  delete buildParentEnvironment.CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA;
  delete buildParentEnvironment.CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA;
  const projected = projectAuthFixtureSessionForStage({
    repositoryRoot,
    environment: buildParentEnvironment,
    candidateCommitSha,
    candidateTreeSha,
  });
  assert.deepEqual(
    projected.continuity.providerDigests,
    {
      googleClientIdSha256:
        consumed.manifest.providerDigests.googleClientIdSha256,
      googleClientSecondaryValueSha256:
        consumed.manifest.providerDigests.googleClientSecretSha256,
    },
  );
  assert.equal(projected.continuity.noRegenerationProof, "passed");
  assert.throws(
    () =>
      projectAuthFixtureSessionForStage({
        repositoryRoot,
        environment: {
          ...buildParentEnvironment,
          CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: "0".repeat(40),
        },
        candidateCommitSha,
        candidateTreeSha,
      }),
    /ambient candidate override/,
  );
  assert.throws(
    () =>
      sessionContract.validateProjectedFixtureEnvironment({
        ...projected.environment,
        GOOGLE_CLIENT_SECRET: `GOCSPX-gate-a3-ci-${"c".repeat(32)}`,
      }),
    /digest or classification/,
  );
  const reconstructedRandomHexSecret = "d".repeat(64);
  assert.throws(
    () =>
      sessionContract.validateProjectedFixtureEnvironment({
        ...projected.environment,
        GOOGLE_CLIENT_SECRET: reconstructedRandomHexSecret,
        [sessionContract.FIXTURE_CLIENT_SECRET_SHA256_ENV]: createHash("sha256")
          .update(reconstructedRandomHexSecret)
          .digest("hex"),
      }),
    /digest or classification/,
  );

  assert.throws(
    () =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: {
          ...consumerEnvironment,
          [sessionContract.FIXTURE_NO_REGENERATION_ENV]: "0",
        },
        sourceCommand: "parent-control-override-test",
        sourceMode: "consume-existing",
      }),
    /overridden parent session control/,
  );

  assert.throws(
    () =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: {
          ...consumerEnvironment,
          GOOGLE_CLIENT_SECRET: `${consumerEnvironment.GOOGLE_CLIENT_SECRET} `,
        },
        sourceCommand: "mutation-test",
        sourceMode: "consume-existing",
      }),
    /overridden parent provider value/,
  );
  assert.throws(
    () =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: {
          ...consumerEnvironment,
          GOOGLE_CLIENT_ID: undefined,
        },
        sourceCommand: "missing-provider-test",
        sourceMode: "consume-existing",
      }),
    /missing or overridden parent provider value/,
  );
  assert.throws(
    () =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: {
          ...consumerEnvironment,
          CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: "0".repeat(40),
        },
        sourceCommand: "candidate-test",
        sourceMode: "consume-existing",
      }),
    /candidate|identity/,
  );
  assert.throws(
    () =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: {
          ...consumerEnvironment,
          [sessionContract.FIXTURE_SESSION_NONCE_ENV]:
            "fixture-nonce-foreign-session-001",
        },
        sourceCommand: "nonce-test",
        sourceMode: "consume-existing",
      }),
  );

  const negativeOuter = publishTestSession("negative-outer", {
    fixtureNonce: "c".repeat(32),
  });
  const negativeOuterConsumed = sessionContract.consumeFixtureSession({
    repositoryRoot,
    environment: negativeOuter.environment,
    requireAmbientProviderValues: false,
    sourceCommand: "nested-isolation-negative-outer",
    sourceMode: "test-consume",
  });
  const expectNestedContaminationRejected = (caseId, mutate) => {
    const contaminated = { ...consumerEnvironment };
    mutate(contaminated, negativeOuterConsumed.assignments);
    assert.throws(() =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: contaminated,
        requireAmbientProviderValues: true,
        sourceCommand: "nested-isolation-negative",
        sourceMode: "test-consume",
      }),
    );
    executedNegativeCases.add(caseId);
  };
  expectNestedContaminationRejected("outer-provider-variable-remains", (environment, outer) => {
    environment.GOOGLE_CLIENT_ID = outer.GOOGLE_CLIENT_ID;
  });
  expectNestedContaminationRejected("outer-fixture-session-id-remains", (environment, outer) => {
    environment[sessionContract.FIXTURE_SESSION_ID_ENV] =
      outer[sessionContract.FIXTURE_SESSION_ID_ENV];
  });
  expectNestedContaminationRejected("outer-root-remains", (environment, outer) => {
    environment[sessionContract.FIXTURE_SESSION_ROOT_ENV] =
      outer[sessionContract.FIXTURE_SESSION_ROOT_ENV];
  });
  expectNestedContaminationRejected("outer-nonce-remains", (environment, outer) => {
    environment[sessionContract.FIXTURE_SESSION_NONCE_ENV] =
      outer[sessionContract.FIXTURE_SESSION_NONCE_ENV];
  });
  expectNestedContaminationRejected("outer-digest-metadata-remains", (environment, outer) => {
    environment[sessionContract.FIXTURE_CLIENT_ID_SHA256_ENV] =
      outer[sessionContract.FIXTURE_CLIENT_ID_SHA256_ENV];
  });
  expectNestedContaminationRejected("nested-session-uses-outer-transport", (environment, outer) => {
    environment[sessionContract.FIXTURE_SESSION_ROOT_ENV] =
      outer[sessionContract.FIXTURE_SESSION_ROOT_ENV];
    environment[sessionContract.FIXTURE_SESSION_ID_ENV] =
      outer[sessionContract.FIXTURE_SESSION_ID_ENV];
    environment[sessionContract.FIXTURE_SESSION_NONCE_ENV] =
      outer[sessionContract.FIXTURE_SESSION_NONCE_ENV];
  });
  expectNestedContaminationRejected("mixed-provider-bytes-with-distinct-session-ids", (environment, outer) => {
    environment.GOOGLE_CLIENT_ID = outer.GOOGLE_CLIENT_ID;
    environment.GOOGLE_CLIENT_SECRET = outer.GOOGLE_CLIENT_SECRET;
  });
  expectNestedContaminationRejected("missing-nested-session-identity", (environment) => {
    delete environment[sessionContract.FIXTURE_SESSION_ID_ENV];
  });

  assert.throws(
    () =>
      resultContract.validateAuthCommandResultValue({
        result: validateResult,
        destination: {
          externalRootIdentitySha256:
            validateResult.identity.externalRootIdentitySha256,
          resultPathIdentitySha256:
            validateResult.identity.resultPathIdentitySha256,
        },
        expectedNonce: validateResult.identity.invocationNonce,
        expectedCommandId: validateResult.command.id,
        expectedMode: validateResult.command.mode,
        expectedCandidateCommitSha: "0".repeat(40),
        expectedCandidateTreeSha: candidateTreeSha,
      }),
    /candidate commit or tree binding/,
  );
  assert.throws(
    () =>
      resultContract.validateAuthCommandResultValue({
        result: validateResult,
        destination: {
          externalRootIdentitySha256:
            validateResult.identity.externalRootIdentitySha256,
          resultPathIdentitySha256:
            validateResult.identity.resultPathIdentitySha256,
        },
        expectedNonce: "fixture-session-result-foreign-001",
        expectedCommandId: validateResult.command.id,
        expectedMode: validateResult.command.mode,
        expectedCandidateCommitSha: candidateCommitSha,
        expectedCandidateTreeSha: candidateTreeSha,
      }),
    /nonce is stale or belongs to another invocation/,
  );
  executedNegativeCases.add("foreign-candidate-session-result");

  const rawLeakResult = structuredClone(validateResult);
  rawLeakResult.identity.environmentClassification =
    consumed.assignments.GOOGLE_CLIENT_SECRET;
  assert.throws(
    () =>
      resultContract.validateAuthCommandResultValue({
        result: rawLeakResult,
        destination: {
          externalRootIdentitySha256:
            validateResult.identity.externalRootIdentitySha256,
          resultPathIdentitySha256:
            validateResult.identity.resultPathIdentitySha256,
        },
        expectedNonce: validateResult.identity.invocationNonce,
        expectedCommandId: validateResult.command.id,
        expectedMode: validateResult.command.mode,
        expectedCandidateCommitSha: candidateCommitSha,
        expectedCandidateTreeSha: candidateTreeSha,
        sensitiveValues: [
          consumed.assignments.GOOGLE_CLIENT_ID,
          consumed.assignments.GOOGLE_CLIENT_SECRET,
        ],
      }),
    /raw private value/,
  );
  executedNegativeCases.add("raw-provider-value-leak");

  const tampered = publishTestSession("tamper");
  const transportPath = path.join(
    tampered.sessionRoot,
    `${tampered.sessionId}.transport.env`,
  );
  writeFileSync(
    transportPath,
    readFileSync(transportPath, "utf8").replace("CI_AUTH_FIXTURE_ACTIVE=1", "CI_AUTH_FIXTURE_ACTIVE=1 "),
    { mode: 0o600 },
  );
  assert.throws(
    () =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: tampered.environment,
        requireAmbientProviderValues: false,
        sourceCommand: "tamper-test",
        sourceMode: "consume-existing",
      }),
    /transport|mutated|canonical/,
  );

  const missing = publishTestSession("missing");
  rmSync(path.join(missing.sessionRoot, `${missing.sessionId}.transport.env`));
  assert.throws(() =>
    sessionContract.consumeFixtureSession({
      repositoryRoot,
      environment: missing.environment,
      requireAmbientProviderValues: false,
      sourceCommand: "missing-test",
      sourceMode: "consume-existing",
    }),
  );

  const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const stale = publishTestSession("stale", { now: () => oldDate });
  assert.throws(
    () =>
      sessionContract.consumeFixtureSession({
        repositoryRoot,
        environment: stale.environment,
        requireAmbientProviderValues: false,
        sourceCommand: "stale-test",
        sourceMode: "consume-existing",
      }),
    /stale/,
  );

  const portable = JSON.stringify([
    exportResult,
    validateResult,
    misuseResult,
    projected.continuity,
  ]);
  assert.equal(portable.includes(consumed.assignments.GOOGLE_CLIENT_ID), false);
  assert.equal(portable.includes(consumed.assignments.GOOGLE_CLIENT_SECRET), false);
  assert.equal(/postgres(?:ql)?:\/\//i.test(portable), false);
  sourceGuards();
  completedNegativeCases = NESTED_ISOLATION_NEGATIVE_CASES.filter((caseId) =>
    executedNegativeCases.has(caseId),
  );
  assert.deepEqual(
    completedNegativeCases,
    NESTED_ISOLATION_NEGATIVE_CASES.filter(
      (caseId) =>
        caseId !== "parent-environment-mutation" &&
        caseId !== "nested-cleanup-removes-outer-resources",
    ),
    "nested child must execute every child-owned isolation negative",
  );
} finally {
  const childOwnedRoots = [...roots];
  for (const value of childOwnedRoots) {
    rmSync(value, { recursive: true, force: true });
  }
  assert.equal(
    childOwnedRoots.some((value) => existsSync(value)),
    false,
    "nested auth fixture regression resources must be removed by their child owner",
  );
}
  console.log(
    `CI_AUTH_FIXTURE_NESTED_ISOLATION_CHILD_RESULT ${JSON.stringify({
      schema: "interior-ai.ci-auth-fixture-nested-isolation-child-result.v1",
      negativeCases: completedNegativeCases,
      resourcesCleaned: true,
      rawProviderValuesRecorded: false,
    })}`,
  );
  console.log("CI_AUTH_FIXTURE_NESTED_ISOLATION_CHILD_COMPLETE");
  console.log("CI auth fixture exactly-once session tests passed");
}

function runAuthFixtureRegressionHarness() {
  const executedNegativeCases = new Set();
  const parentIdentityBefore = environmentIdentity(process.env);
  const syntheticOuterBase = isolatedRegressionChildEnvironment(process.env);
  try {
    const historicalOuter = publishTestSession("historical-outer", {
      fixtureNonce: "a".repeat(32),
      parentEnvironment: syntheticOuterBase,
    });
    const historicalOuterConsumed = sessionContract.consumeFixtureSession({
      repositoryRoot,
      environment: historicalOuter.environment,
      requireAmbientProviderValues: false,
      sourceCommand: "historical-ambient-contamination-parent",
      sourceMode: "outer-parent",
    });
    const outerParentEnvironment = {
      ...syntheticOuterBase,
      ...historicalOuter.environment,
      ...historicalOuterConsumed.assignments,
    };
    const outerCapabilityIdentityBefore = environmentIdentity(
      outerParentEnvironment,
      AUTH_FIXTURE_CAPABILITY_NAMES,
    );
    const outerEnvironmentIdentityBefore = environmentIdentity(
      outerParentEnvironment,
    );
    const outerResourceIdentityBefore = sessionResourceIdentity(
      historicalOuter.sessionRoot,
    );
    const nestedProviderValues = [
      `123456789012345-gate-a3-ci-${"b".repeat(32)}.apps.googleusercontent.com`,
      `GOCSPX-gate-a3-ci-${"b".repeat(32)}`,
    ];
    const contaminatedChild = spawnSync(
      process.execPath,
      [process.argv[1], ISOLATED_CHILD_ARGUMENT],
      {
        cwd: repositoryRoot,
        env: outerParentEnvironment,
        encoding: "utf8",
      },
    );
    const contaminatedOutput = `${contaminatedChild.stdout}\n${contaminatedChild.stderr}`;
    assert.notEqual(
      contaminatedChild.status,
      0,
      "historical ambient auth fixture contamination must fail closed",
    );
    assert.equal(
      [
        historicalOuterConsumed.assignments.GOOGLE_CLIENT_ID,
        historicalOuterConsumed.assignments.GOOGLE_CLIENT_SECRET,
        ...nestedProviderValues,
      ].some((value) => contaminatedOutput.includes(value)),
      false,
      "historical failure output must not contain raw outer provider values",
    );
    assert.match(contaminatedOutput, /overridden parent provider value/);

    const isolatedChildEnvironment =
      isolatedRegressionChildEnvironment(outerParentEnvironment);
    assert.deepEqual(
      AUTH_FIXTURE_CAPABILITY_NAMES.filter((name) =>
        Object.hasOwn(isolatedChildEnvironment, name),
      ),
      [],
      "nested regression child must receive no outer fixture-session capability",
    );
    const correctedChild = spawnSync(
      process.execPath,
      [process.argv[1], ISOLATED_CHILD_ARGUMENT],
      {
        cwd: repositoryRoot,
        env: isolatedChildEnvironment,
        encoding: "utf8",
      },
    );
    const correctedOutput = `${correctedChild.stdout}\n${correctedChild.stderr}`;
    assert.equal(
      correctedChild.status,
      0,
      `isolated auth fixture regression child failed: ${JSON.stringify(safeChildProcessEvidence(correctedChild))}`,
    );
    assert.equal(
      [
        historicalOuterConsumed.assignments.GOOGLE_CLIENT_ID,
        historicalOuterConsumed.assignments.GOOGLE_CLIENT_SECRET,
        ...nestedProviderValues,
      ].some((value) => correctedOutput.includes(value)),
      false,
      "corrected child output must not contain raw provider values",
    );
    assert.match(
      correctedOutput,
      /CI_AUTH_FIXTURE_NESTED_ISOLATION_CHILD_COMPLETE/,
    );
    const childResultLine = correctedOutput
      .split("\n")
      .find((line) =>
        line.startsWith(
          "CI_AUTH_FIXTURE_NESTED_ISOLATION_CHILD_RESULT ",
        ),
      );
    assert.ok(childResultLine, "isolated child result is missing");
    const childResult = JSON.parse(
      childResultLine.slice(
        "CI_AUTH_FIXTURE_NESTED_ISOLATION_CHILD_RESULT ".length,
      ),
    );
    assert.equal(
      childResult.schema,
      "interior-ai.ci-auth-fixture-nested-isolation-child-result.v1",
    );
    assert.equal(childResult.resourcesCleaned, true);
    assert.equal(childResult.rawProviderValuesRecorded, false);
    for (const caseId of childResult.negativeCases) {
      executedNegativeCases.add(caseId);
    }

    const preservedOuter = sessionContract.consumeFixtureSession({
      repositoryRoot,
      environment: outerParentEnvironment,
      requireAmbientProviderValues: true,
      sourceCommand: "historical-ambient-contamination-parent",
      sourceMode: "outer-parent-preservation",
    });
    assert.deepEqual(
      preservedOuter.manifest.providerDigests,
      historicalOuterConsumed.manifest.providerDigests,
    );
    assertEnvironmentIdentityUnchanged(
      outerParentEnvironment,
      AUTH_FIXTURE_CAPABILITY_NAMES,
      outerCapabilityIdentityBefore,
    );
    assertEnvironmentIdentityUnchanged(
      outerParentEnvironment,
      undefined,
      outerEnvironmentIdentityBefore,
    );
    assertSessionResourceIdentityUnchanged(
      historicalOuter.sessionRoot,
      outerResourceIdentityBefore,
    );
    assert.equal(
      environmentIdentity(process.env),
      parentIdentityBefore,
      "nested regression harness must not mutate global process.env",
    );

    const mutatedParentEnvironment = {
      ...outerParentEnvironment,
      AUTH_SECRET: "injected-parent-mutation-at-least-32-characters",
    };
    assert.throws(
      () =>
        assertEnvironmentIdentityUnchanged(
          mutatedParentEnvironment,
          AUTH_FIXTURE_CAPABILITY_NAMES,
          outerCapabilityIdentityBefore,
        ),
      /mutated its parent environment/,
    );
    executedNegativeCases.add("parent-environment-mutation");

    const cleanupNegativeOuter = publishTestSession("cleanup-negative-outer", {
      fixtureNonce: "d".repeat(32),
      parentEnvironment: syntheticOuterBase,
    });
    const cleanupNegativeIdentity = sessionResourceIdentity(
      cleanupNegativeOuter.sessionRoot,
    );
    rmSync(
      path.join(
        cleanupNegativeOuter.sessionRoot,
        `${cleanupNegativeOuter.sessionId}.transport.env`,
      ),
    );
    assert.throws(
      () =>
        assertSessionResourceIdentityUnchanged(
          cleanupNegativeOuter.sessionRoot,
          cleanupNegativeIdentity,
        ),
      /cleanup changed outer resources/,
    );
    executedNegativeCases.add("nested-cleanup-removes-outer-resources");

    const executedNegativeCaseList = NESTED_ISOLATION_NEGATIVE_CASES.filter(
      (caseId) => executedNegativeCases.has(caseId),
    );
    assert.deepEqual(
      executedNegativeCaseList,
      NESTED_ISOLATION_NEGATIVE_CASES,
      "nested isolation negative matrix execution is incomplete",
    );

    const result = {
      schema: "interior-ai.ci-auth-fixture-nested-isolation-regression.v1",
      selectedOwner: "nested-regression-child",
      historicalConflict: "GOOGLE_CLIENT_ID",
      historicalContaminationRejected: true,
      isolatedChildPassed: true,
      parentEnvironmentUnchanged: true,
      outerSessionPreserved: true,
      outerResourcesPreserved: true,
      nestedResourcesCleaned: true,
      rawProviderValuesRecorded: false,
      capabilityNames: AUTH_FIXTURE_CAPABILITY_NAMES,
      capabilityNamesSha256: createHash("sha256")
        .update(AUTH_FIXTURE_CAPABILITY_NAMES.join("\0"))
        .digest("hex"),
      outerSessionIdentitySha256: createHash("sha256")
        .update(historicalOuter.sessionId)
        .digest("hex"),
      outerProviderDigests: historicalOuterConsumed.manifest.providerDigests,
      negativeCases: executedNegativeCaseList,
    };
    console.log(
      `CI_AUTH_FIXTURE_NESTED_ISOLATION_REGRESSION_RESULT ${JSON.stringify(result)}`,
    );
    console.log("CI auth fixture nested isolation regression passed");
  } finally {
    for (const value of [...roots]) {
      rmSync(value, { recursive: true, force: true });
    }
  }
}

if (process.argv[2] === ISOLATED_CHILD_ARGUMENT) {
  await runIsolatedAuthFixtureRegressionChild();
} else {
  runAuthFixtureRegressionHarness();
}
