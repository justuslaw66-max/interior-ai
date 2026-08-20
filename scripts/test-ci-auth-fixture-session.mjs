import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { projectAuthFixtureSessionForStage } from "./production-certification-real.mjs";
import { canonicalSessionOwnership } from "./run-ci-auth-fixture-session.mjs";

const require = createRequire(import.meta.url);
const resultContract = require("./ci-auth-fixture-result-contract.cjs");
const sessionContract = require("./ci-auth-fixture-session.cjs");
const repositoryRoot = process.cwd();
const roots = [];
const candidateCommitSha = git("HEAD");
const candidateTreeSha = git("HEAD^{tree}");
const authSecret = "fixture-session-test-auth-secret-at-least-32-characters";

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

function baseEnvironment(sessionRoot, sessionId, sessionNonce) {
  return {
    ...process.env,
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
    `${script} failed: ${child.stderr || child.stdout}`,
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
  const environment = baseEnvironment(sessionRoot, sessionId, sessionNonce);
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
  console.log("CI auth fixture exactly-once session tests passed");
} finally {
  for (const value of roots) rmSync(value, { recursive: true, force: true });
}
