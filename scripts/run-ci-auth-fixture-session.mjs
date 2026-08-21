import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const resultContract = require("./ci-auth-fixture-result-contract.cjs");
const sessionContract = require("./ci-auth-fixture-session.cjs");

export const CALLER_RETAINED_AUTH_RESULT_DIRECTORY =
  "auth-preflight-results";

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function canonicalWorktreeRoots(repositoryRoot) {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Canonical auth result owner could not enumerate worktrees");
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => realpathSync(line.slice("worktree ".length)));
}

function validatedCallerSessionRoot(rawRoot, repositoryRoot) {
  if (typeof rawRoot !== "string" || !path.isAbsolute(rawRoot)) {
    throw new Error("Caller-owned auth fixture session root must be absolute");
  }
  const metadata = lstatSync(rawRoot);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error(
      "Caller-owned auth fixture session root must be a physical owner-only directory",
    );
  }
  const resolved = realpathSync(rawRoot);
  if (resolved !== path.resolve(rawRoot)) {
    throw new Error(
      "Caller-owned auth fixture session root must be a canonical physical path",
    );
  }
  if (
    canonicalWorktreeRoots(repositoryRoot).some(
      (worktree) => isInside(worktree, resolved) || isInside(resolved, worktree),
    )
  ) {
    throw new Error(
      "Caller-owned auth fixture session root must remain outside every worktree",
    );
  }
  return resolved;
}

function git(revision) {
  const result = spawnSync("git", ["rev-parse", revision], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Canonical auth fixture session could not bind source identity");
  }
  return result.stdout.trim();
}

function canonicalIdentity(result) {
  const session = result.identity.fixtureSession;
  return {
    sessionId: session.sessionId,
    invocationNonce: session.invocationNonce,
    candidate: session.candidate,
    generator: session.generator,
    policy: session.policy,
    exportedVariableNamesSha256: session.exportedVariableNamesSha256,
    providerDigests: session.providerDigests,
    classification: session.classification,
    privateTransport: session.privateTransport,
    completion: session.completion,
    sessionAggregateSha256: session.sessionAggregateSha256,
  };
}

function runStructuredCommand({
  script,
  commandId,
  mode,
  resultRoot,
  nonce,
  suffix,
  environment,
  candidateCommitSha,
  candidateTreeSha,
}) {
  const resultPath = path.join(resultRoot, `${suffix}.json`);
  const childEnvironment = {
    ...environment,
    CI_AUTH_FIXTURE_RESULT_ROOT: resultRoot,
    CI_AUTH_FIXTURE_RESULT_PATH: resultPath,
    CI_AUTH_FIXTURE_RESULT_NONCE: nonce,
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidateCommitSha,
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidateTreeSha,
  };
  const child = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: childEnvironment,
    encoding: "utf8",
  });
  if (child.error || child.signal) {
    throw new Error("Canonical auth fixture command could not complete");
  }
  const validated = resultContract.validateAuthCommandResult({
    repositoryRoot: process.cwd(),
    externalRoot: resultRoot,
    resultPath,
    expectedNonce: nonce,
    expectedCommandId: commandId,
    expectedMode: mode,
    expectedCandidateCommitSha: candidateCommitSha,
    expectedCandidateTreeSha: candidateTreeSha,
    sensitiveValues: resultContract.privateValuesFromEnvironment(childEnvironment),
  });
  if ((child.status === 0) !== (validated.result.result !== "failure")) {
    throw new Error("Canonical auth fixture result contradicts its process outcome");
  }
  if (child.status !== 0) {
    throw new Error("Canonical auth fixture command failed closed");
  }
  return validated.result;
}

export function canonicalSessionOwnership(environment = process.env) {
  const sessionRoot = environment[sessionContract.FIXTURE_SESSION_ROOT_ENV];
  const sessionId = environment[sessionContract.FIXTURE_SESSION_ID_ENV];
  const sessionNonce = environment[sessionContract.FIXTURE_SESSION_NONCE_ENV];
  const sessionClassification =
    environment[sessionContract.FIXTURE_SESSION_CLASSIFICATION_ENV];
  if (!sessionRoot) {
    if (sessionId || sessionNonce || sessionClassification) {
      throw new Error(
        "Canonical auth fixture session retention metadata is incomplete",
      );
    }
    return Object.freeze({
      ownedSessionRoot: true,
      sessionRoot: null,
      sessionId: null,
      sessionNonce: null,
    });
  }
  if (
    !sessionId ||
    !sessionNonce ||
    sessionClassification !== sessionContract.FIXTURE_SESSION_CLASSIFICATION
  ) {
    throw new Error(
      "Caller-owned auth fixture session requires root, ID, nonce, and classification",
    );
  }
  return Object.freeze({
    ownedSessionRoot: false,
    sessionRoot,
    sessionId,
    sessionNonce,
  });
}

export function canonicalAuthResultOwnership({
  sessionOwnership,
  orchestrationRoot,
  repositoryRoot = process.cwd(),
}) {
  const retainedByCaller = !sessionOwnership.ownedSessionRoot;
  const resultRoot = retainedByCaller
    ? path.join(
        validatedCallerSessionRoot(sessionOwnership.sessionRoot, repositoryRoot),
        CALLER_RETAINED_AUTH_RESULT_DIRECTORY,
      )
    : path.join(orchestrationRoot, "results");
  let created = false;
  try {
    mkdirSync(resultRoot, { mode: 0o700 });
    created = true;
    chmodSync(resultRoot, 0o700);
    resultContract.resolveAuthResultDestination({
      repositoryRoot,
      externalRoot: resultRoot,
      resultPath: path.join(resultRoot, "ownership-probe.json"),
    });
  } catch (error) {
    if (created) rmSync(resultRoot, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze({ resultRoot, retainedByCaller });
}

export async function runCanonicalAuthFixtureSession() {
  const candidateCommitSha = git("HEAD");
  const candidateTreeSha = git("HEAD^{tree}");
  const ownership = canonicalSessionOwnership(process.env);
  const orchestrationRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), "ci-auth-fixture-orchestration-")),
  );
  chmodSync(orchestrationRoot, 0o700);
  const ownedSessionRoot = ownership.ownedSessionRoot;
  const identitySuffix = randomBytes(8).toString("hex");
  let retained = false;
  let workspaceTerminalEvidence = null;
  try {
    const resultOwnership = canonicalAuthResultOwnership({
      sessionOwnership: ownership,
      orchestrationRoot,
    });
    const resultRoot = resultOwnership.resultRoot;
    const sessionRoot = ownedSessionRoot
      ? path.join(orchestrationRoot, "session")
      : ownership.sessionRoot;
    const sessionId = ownedSessionRoot
      ? `auth-fixture-session-${process.pid}-${identitySuffix}`
      : ownership.sessionId;
    const sessionNonce = ownedSessionRoot
      ? `auth-fixture-nonce-${process.pid}-${identitySuffix}`
      : ownership.sessionNonce;
    const githubEnvironmentPath = path.join(
      orchestrationRoot,
      "github-environment",
    );
    writeFileSync(githubEnvironmentPath, "", { flag: "wx", mode: 0o600 });
    const baseEnvironment = {
      ...process.env,
      APP_ENV: "development",
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: githubEnvironmentPath,
      GITHUB_WORKSPACE: process.cwd(),
      CI_AUTH_FIXTURE_MODE: "1",
      AUTH_SECRET:
        process.env.AUTH_SECRET ||
        "ci-auth-certification-session-secret-at-least-32-characters",
      NEXTAUTH_SECRET:
        process.env.NEXTAUTH_SECRET ||
        process.env.AUTH_SECRET ||
        "ci-auth-certification-session-secret-at-least-32-characters",
      CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidateCommitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidateTreeSha,
      [sessionContract.FIXTURE_SESSION_ROOT_ENV]: sessionRoot,
      [sessionContract.FIXTURE_SESSION_ID_ENV]: sessionId,
      [sessionContract.FIXTURE_SESSION_NONCE_ENV]: sessionNonce,
      [sessionContract.FIXTURE_SESSION_CLASSIFICATION_ENV]:
        sessionContract.FIXTURE_SESSION_CLASSIFICATION,
    };
    const exportResult = runStructuredCommand({
      script: "ci:auth-fixture:export",
      commandId: "ci:auth-fixture:export",
      mode: "provider-fixture-export",
      resultRoot,
      nonce: `${sessionNonce}-export`,
      suffix: "export",
      environment: baseEnvironment,
      candidateCommitSha,
      candidateTreeSha,
    });
    const consumed = sessionContract.consumeFixtureSession({
      repositoryRoot: process.cwd(),
      environment: baseEnvironment,
      requireAmbientProviderValues: false,
      sourceCommand: "certification:auth-preflight",
      sourceMode: "orchestration",
    });
    const consumerEnvironment = {
      ...baseEnvironment,
      ...consumed.assignments,
    };
    const validateResult = runStructuredCommand({
      script: "ci:auth-fixture:validate-existing",
      commandId: "ci:auth-fixture:validate-existing",
      mode: "auth-environment-validation",
      resultRoot,
      nonce: `${sessionNonce}-validate`,
      suffix: "validate",
      environment: consumerEnvironment,
      candidateCommitSha,
      candidateTreeSha,
    });
    const misuseResult = runStructuredCommand({
      script: "ci:auth-fixture:production-misuse-existing",
      commandId: "ci:auth-fixture:production-misuse-existing",
      mode: "production-misuse-validation",
      resultRoot,
      nonce: `${sessionNonce}-misuse`,
      suffix: "production-misuse",
      environment: consumerEnvironment,
      candidateCommitSha,
      candidateTreeSha,
    });
    const preflightResult = runStructuredCommand({
      script: "certification:auth-session-preflight",
      commandId: "certification:auth-session-preflight",
      mode: "auth-session-preflight",
      resultRoot,
      nonce: `${sessionNonce}-database-preflight-wrapper`,
      suffix: "database-preflight-wrapper",
      environment: consumerEnvironment,
      candidateCommitSha,
      candidateTreeSha,
    });
    const identities = [
      exportResult,
      validateResult,
      misuseResult,
      preflightResult,
    ].map(canonicalIdentity);
    for (const identity of identities.slice(1)) {
      assert.deepEqual(identity, identities[0]);
    }
    assert.equal(misuseResult.result, "expected-negative-pass");
    assert.equal(
      misuseResult.evidence.safeFailureCode,
      "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED",
    );
    assert.equal(preflightResult.evidence.databasePrerequisite.dropResult, "passed");
    assert.equal(preflightResult.evidence.databasePrerequisite.absenceResult, "passed");
    const workspaceEvidence = preflightResult.evidence.workspacePrerequisite;
    assert.equal(workspaceEvidence.exactHeadDetached, true);
    assert.equal(workspaceEvidence.sourceRoot.byteIdenticalBeforeAndDuring, true);
    assert.equal(workspaceEvidence.cleanup.completed, true);
    assert.equal(workspaceEvidence.cleanup.registrationAbsent, true);
    assert.equal(
      workspaceEvidence.cleanup.sourceByteIdenticalAfterCleanup,
      true,
    );
    workspaceTerminalEvidence = {
      schema: workspaceEvidence.schema,
      classification: workspaceEvidence.classification,
      candidateCommitSha: workspaceEvidence.candidateCommitSha,
      candidateTreeSha: workspaceEvidence.candidateTreeSha,
      fixtureSessionIdentitySha256:
        workspaceEvidence.fixtureSessionIdentitySha256,
      pathIdentitySha256: workspaceEvidence.pathIdentitySha256,
      exactHeadDetached: workspaceEvidence.exactHeadDetached,
      sourceRoot: workspaceEvidence.sourceRoot,
      trackedOutput: workspaceEvidence.trackedOutput,
      cleanup: workspaceEvidence.cleanup,
    };
    retained = resultOwnership.retainedByCaller;
  } finally {
    rmSync(orchestrationRoot, { recursive: true, force: true });
  }
  console.log(
    `AUTH_PREFLIGHT_WORKSPACE_RESULT ${JSON.stringify(workspaceTerminalEvidence)}`,
  );
  console.log(
    retained
      ? "Canonical exactly-once auth fixture session preflight passed; private session retained by caller"
      : "Canonical exactly-once auth fixture session preflight passed and task-owned private session was removed",
  );
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  runCanonicalAuthFixtureSession().catch(() => {
    console.error("Canonical exactly-once auth fixture session preflight failed closed");
    process.exitCode = 1;
  });
}
