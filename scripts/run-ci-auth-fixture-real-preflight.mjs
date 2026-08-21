import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
} from "./production-certification-database-contract.mjs";
import {
  abortAuthSessionPreflightDatabaseLifecycle,
  abortCertificationDatabase,
  completeAuthSessionPreflightDatabaseLifecycle,
  createAuthSessionPreflightDatabaseEnvironment,
  prepareAuthSessionPreflightDatabaseLifecycle,
  readCertificationDatabaseLifecycle,
} from "./production-certification-database-lifecycle.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
} from "./production-certification-stage-environment.mjs";
import {
  completeAuthPreflightWorktree,
  createAuthPreflightWorktree,
  inspectAuthPreflightWorktree,
} from "./ci-auth-preflight-worktree.mjs";

const require = createRequire(import.meta.url);
const authResultContract = require("./ci-auth-fixture-result-contract.cjs");
const authFixtureSession = require("./ci-auth-fixture-session.cjs");

export const AUTH_PREFLIGHT_ORCHESTRATION_FAILURE_SCHEMA =
  "interior-ai.auth-preflight-orchestration-failure.v1";
export const AUTH_PREFLIGHT_ORCHESTRATION_FAILURE_COMPLETION_MARKER =
  "AUTH_PREFLIGHT_ORCHESTRATION_FAILURE_EVIDENCE_COMPLETE";

export function authPreflightOrchestrationFailurePath(resultPath) {
  if (typeof resultPath !== "string" || path.extname(resultPath) !== ".json") {
    throw new Error("Auth preflight failure evidence requires a JSON result path");
  }
  return `${resultPath.slice(0, -".json".length)}.orchestration-failure.json`;
}

function safeOrchestrationFailureCode(error) {
  return typeof error?.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(error.code)
    ? error.code
    : "AUTH_SESSION_PREFLIGHT_ORCHESTRATION_FAILURE";
}

function databaseLifecycleFailureAttribution({
  lifecycleStarted,
  failureResult,
  prepared,
}) {
  const current = failureResult ?? prepared?.current ?? null;
  if (!current?.evidence) {
    return Object.freeze({
      failureSubstage: lifecycleStarted ? "plan" : "not-started",
      lifecycleStateAtFailure: lifecycleStarted ? "not-published" : "not-started",
      failureMode: "not-recorded",
      failureClassification: "NOT_RECORDED",
      lifecycleEvidenceSha256: null,
      planResult: lifecycleStarted ? "failed" : "not-completed",
      provisionResult: "not-completed",
      migrationResult: "not-completed",
      initialVerificationResult: "not-completed",
      scopedRolePrivateSidecarResult: "not-completed",
      stageBindingResult: "not-completed",
      projectionResult: "not-completed",
    });
  }
  const evidence = current.evidence;
  const hasState = (state) =>
    evidence.events?.some((entry) => entry.state === state) === true;
  const planned = hasState("planned");
  const provisioned = hasState("provisioned");
  const migrated = hasState("migrated");
  const migrationsCompleted = migrated || evidence.privateBinding !== null;
  const initialVerified = hasState("initial-empty-verified");
  const stageBound =
    evidence.stageBindings?.observed?.some(
      (binding) => binding.stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
    ) === true;
  let failureSubstage = "complete";
  if (!planned) failureSubstage = "plan";
  else if (!provisioned) failureSubstage = "provision";
  else if (!migrated) {
    failureSubstage = evidence.privateBinding
      ? "scoped-role-private-sidecar"
      : "migrations";
  } else if (!initialVerified) failureSubstage = "initial-verification";
  else if (!stageBound) failureSubstage = "stage-binding";
  else if (!prepared) failureSubstage = "projection";
  const stageResult = (passed, stage) =>
    passed ? "passed" : failureSubstage === stage ? "failed" : "not-completed";
  return Object.freeze({
    failureSubstage,
    lifecycleStateAtFailure: evidence.currentState,
    failureMode: evidence.failure?.mode ?? "none",
    failureClassification: evidence.failure?.classification ?? "NONE",
    lifecycleEvidenceSha256: current.descriptor?.sha256 ?? null,
    planResult: stageResult(planned, "plan"),
    provisionResult: stageResult(provisioned, "provision"),
    migrationResult: stageResult(migrationsCompleted, "migrations"),
    initialVerificationResult: stageResult(
      initialVerified,
      "initial-verification",
    ),
    scopedRolePrivateSidecarResult: stageResult(
      migrated,
      "scoped-role-private-sidecar",
    ),
    stageBindingResult: stageResult(stageBound, "stage-binding"),
    projectionResult: stageResult(prepared !== null, "projection"),
  });
}

function hasExactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function sealAuthPreflightOrchestrationFailure(value) {
  const { aggregateSha256: _discarded, ...payload } = value;
  return Object.freeze({
    ...payload,
    aggregateSha256: authResultContract.sha256Bytes(
      authResultContract.canonicalJsonBytes(payload),
    ),
  });
}

export function writeAuthPreflightOrchestrationFailure({
  repositoryRoot,
  externalRoot,
  publishedResultPath,
  publishedInvocationNonce,
  candidateCommitSha,
  candidateTreeSha,
  fixtureSessionAggregateSha256,
  boundary,
  error,
  evidence,
  sensitiveValues = [],
}) {
  const resultPath = authPreflightOrchestrationFailurePath(
    publishedResultPath,
  );
  const destination = authResultContract.resolveAuthResultDestination({
    repositoryRoot,
    externalRoot,
    resultPath,
  });
  const payload = sealAuthPreflightOrchestrationFailure({
    schema: AUTH_PREFLIGHT_ORCHESTRATION_FAILURE_SCHEMA,
    version: 1,
    classification: "AUTH_SESSION_PREFLIGHT_ORCHESTRATION_FAILURE",
    command: {
      id: "certification:auth-session-preflight",
      mode: "auth-session-preflight",
    },
    identity: {
      candidateCommitSha,
      candidateTreeSha,
      fixtureSessionAggregateSha256,
      publishedInvocationNonceSha256:
        authResultContract.sha256Bytes(publishedInvocationNonce),
      completedAt: new Date().toISOString(),
    },
    failure: {
      boundary,
      code: safeOrchestrationFailureCode(error),
      category: "orchestration",
      completed: true,
    },
    evidence,
    completion: {
      complete: true,
      marker: AUTH_PREFLIGHT_ORCHESTRATION_FAILURE_COMPLETION_MARKER,
    },
  });
  const bytes = authResultContract.canonicalJsonBytes(payload);
  authResultContract.assertNoRawPrivateValues(bytes, sensitiveValues);
  authResultContract.writeSealedResultFiles({
    destination,
    result: payload,
  });
  return validateAuthPreflightOrchestrationFailure({
    repositoryRoot,
    externalRoot,
    resultPath: destination.resultPath,
    expectedCandidateCommitSha: candidateCommitSha,
    expectedCandidateTreeSha: candidateTreeSha,
    expectedPublishedInvocationNonce: publishedInvocationNonce,
    expectedFixtureSessionAggregateSha256: fixtureSessionAggregateSha256,
    sensitiveValues,
  });
}

export function validateAuthPreflightOrchestrationFailure({
  repositoryRoot,
  externalRoot,
  resultPath,
  expectedCandidateCommitSha,
  expectedCandidateTreeSha,
  expectedPublishedInvocationNonce,
  expectedFixtureSessionAggregateSha256,
  sensitiveValues = [],
}) {
  const destination = authResultContract.resolveAuthResultDestination({
    repositoryRoot,
    externalRoot,
    resultPath,
    requireAbsent: false,
  });
  for (const filePath of [destination.resultPath, destination.sidecarPath]) {
    const metadata = lstatSync(filePath);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      (metadata.mode & 0o077) !== 0
    ) {
      throw new Error(
        "Auth preflight failure evidence must be physical owner-only files",
      );
    }
  }
  const bytes = readFileSync(destination.resultPath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Auth preflight failure evidence is not valid JSON");
  }
  if (!bytes.equals(authResultContract.canonicalJsonBytes(value))) {
    throw new Error("Auth preflight failure evidence is not canonical JSON");
  }
  authResultContract.assertNoRawPrivateValues(bytes, sensitiveValues);
  const { aggregateSha256, ...payload } = value;
  const boundaryValues = new Set([
    "database-environment",
    "database-prepare",
    "worktree-provision",
    "stage-environment-projection",
    "auth-child-execution",
    "auth-child-result-validation",
    "workspace-cleanup",
    "composed-result-publication",
    "composed-result-validation",
  ]);
  if (
    !hasExactKeys(value, [
      "schema",
      "version",
      "classification",
      "command",
      "identity",
      "failure",
      "evidence",
      "completion",
      "aggregateSha256",
    ]) ||
    !hasExactKeys(value.command, ["id", "mode"]) ||
    !hasExactKeys(value.identity, [
      "candidateCommitSha",
      "candidateTreeSha",
      "fixtureSessionAggregateSha256",
      "publishedInvocationNonceSha256",
      "completedAt",
    ]) ||
    !hasExactKeys(value.failure, [
      "boundary",
      "code",
      "category",
      "completed",
    ]) ||
    !hasExactKeys(value.evidence, [
      "databaseLifecycleStarted",
      "databaseLifecyclePrepared",
      "databaseLifecycleAttribution",
      "databaseCleanup",
      "workspaceCreated",
      "workspaceCleanup",
      "childResultPublication",
      "childResultValidation",
      "composedResultPublication",
    ]) ||
    !hasExactKeys(value.completion, ["complete", "marker"]) ||
    value.schema !== AUTH_PREFLIGHT_ORCHESTRATION_FAILURE_SCHEMA ||
    value.version !== 1 ||
    value.classification !== "AUTH_SESSION_PREFLIGHT_ORCHESTRATION_FAILURE" ||
    value.command?.id !== "certification:auth-session-preflight" ||
    value.command?.mode !== "auth-session-preflight" ||
    value.identity?.candidateCommitSha !== expectedCandidateCommitSha ||
    value.identity?.candidateTreeSha !== expectedCandidateTreeSha ||
    value.identity?.fixtureSessionAggregateSha256 !==
      expectedFixtureSessionAggregateSha256 ||
    value.identity?.publishedInvocationNonceSha256 !==
      authResultContract.sha256Bytes(expectedPublishedInvocationNonce) ||
    !Number.isFinite(Date.parse(value.identity?.completedAt)) ||
    !/^[a-f0-9]{40}$/.test(value.identity?.candidateCommitSha || "") ||
    !/^[a-f0-9]{40}$/.test(value.identity?.candidateTreeSha || "") ||
    !/^[a-f0-9]{64}$/.test(
      value.identity?.fixtureSessionAggregateSha256 || "",
    ) ||
    !/^[a-f0-9]{64}$/.test(
      value.identity?.publishedInvocationNonceSha256 || "",
    ) ||
    !boundaryValues.has(value.failure?.boundary) ||
    !/^[A-Z][A-Z0-9_]+$/.test(value.failure?.code || "") ||
    value.failure?.category !== "orchestration" ||
    value.failure?.completed !== true ||
    typeof value.evidence?.databaseLifecycleStarted !== "boolean" ||
    typeof value.evidence?.databaseLifecyclePrepared !== "boolean" ||
    !hasExactKeys(value.evidence?.databaseLifecycleAttribution, [
      "failureSubstage",
      "lifecycleStateAtFailure",
      "failureMode",
      "failureClassification",
      "lifecycleEvidenceSha256",
      "planResult",
      "provisionResult",
      "migrationResult",
      "initialVerificationResult",
      "scopedRolePrivateSidecarResult",
      "stageBindingResult",
      "projectionResult",
    ]) ||
    !new Set([
      "not-started",
      "plan",
      "provision",
      "migrations",
      "scoped-role-private-sidecar",
      "initial-verification",
      "stage-binding",
      "projection",
      "complete",
    ]).has(value.evidence?.databaseLifecycleAttribution?.failureSubstage) ||
    typeof value.evidence?.databaseLifecycleAttribution?.lifecycleStateAtFailure !==
      "string" ||
    typeof value.evidence?.databaseLifecycleAttribution?.failureMode !==
      "string" ||
    !/^[A-Z][A-Z0-9_]+$/.test(
      value.evidence?.databaseLifecycleAttribution?.failureClassification || "",
    ) ||
    !(
      value.evidence?.databaseLifecycleAttribution?.lifecycleEvidenceSha256 ===
        null ||
      /^[a-f0-9]{64}$/.test(
        value.evidence?.databaseLifecycleAttribution
          ?.lifecycleEvidenceSha256 || "",
      )
    ) ||
    [
      "planResult",
      "provisionResult",
      "migrationResult",
      "initialVerificationResult",
      "scopedRolePrivateSidecarResult",
      "stageBindingResult",
      "projectionResult",
    ].some(
      (name) =>
        !new Set(["passed", "failed", "not-completed"]).has(
          value.evidence?.databaseLifecycleAttribution?.[name],
        ),
    ) ||
    !new Set([
      "not-started-absence-verified",
      "absence-verified",
      "failed",
      "unverified",
    ]).has(value.evidence?.databaseCleanup) ||
    typeof value.evidence?.workspaceCreated !== "boolean" ||
    !new Set(["not-started", "passed", "failed", "unverified"]).has(
      value.evidence?.workspaceCleanup,
    ) ||
    !new Set(["present", "absent"]).has(
      value.evidence?.childResultPublication,
    ) ||
    !new Set(["passed", "not-completed"]).has(
      value.evidence?.childResultValidation,
    ) ||
    !new Set(["absent", "partial-or-invalid"]).has(
      value.evidence?.composedResultPublication,
    ) ||
    value.completion?.complete !== true ||
    value.completion?.marker !==
      AUTH_PREFLIGHT_ORCHESTRATION_FAILURE_COMPLETION_MARKER ||
    authResultContract.sha256Bytes(
      authResultContract.canonicalJsonBytes(payload),
    ) !== aggregateSha256
  ) {
    throw new Error("Auth preflight failure evidence contract is invalid");
  }
  const expectedSidecar = `${aggregateSha256}  ${path.basename(destination.resultPath)}\n`;
  if (readFileSync(destination.sidecarPath, "utf8") !== expectedSidecar) {
    throw new Error("Auth preflight failure evidence checksum is invalid");
  }
  return Object.freeze({ result: value, destination });
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Real auth preflight could not establish exact source identity");
  }
  return result.stdout.trim();
}

function runChild(command, args, environment, cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
  });
}

function streamDescriptor(value) {
  const bytes = Buffer.from(value ?? "");
  return {
    bytes: bytes.byteLength,
    sha256: authResultContract.sha256Bytes(bytes),
  };
}

function finalFailureEvidence(childResult, safeCode, category) {
  if (childResult?.result === "failure") return childResult.failure;
  return {
    code: safeCode,
    category,
    stdout: streamDescriptor(""),
    stderr: streamDescriptor(`${safeCode}\n`),
    child: {
      exitStatus: childResult?.evidence?.server?.exitStatus ?? null,
      signal: childResult?.evidence?.server?.signal ?? null,
      spawnError: childResult?.evidence?.server?.spawnError ?? null,
    },
    completed: true,
  };
}

function writeFinalAuthResult({
  destination,
  childResult,
  databasePrerequisite,
  workspacePrerequisite,
  invocationNonce,
  candidateCommitSha,
  candidateTreeSha,
  result,
  failure,
  sensitiveValues,
}) {
  const command = {
    id: "certification:auth-session-preflight",
    mode: "auth-session-preflight",
    executable: "node",
    argv: ["scripts/run-ci-auth-fixture-real-preflight.mjs"],
  };
  const identity = {
    ...childResult.identity,
    candidateCommitSha,
    candidateTreeSha,
    invocationNonce,
    externalRootIdentitySha256: destination.externalRootIdentitySha256,
    resultPathIdentitySha256: destination.resultPathIdentitySha256,
    completedAt: new Date().toISOString(),
    fixtureSession: {
      ...childResult.identity.fixtureSession,
      lifecycle: {
        ...childResult.identity.fixtureSession.lifecycle,
        sourceCommand: command.id,
        sourceMode: "real-preflight",
      },
    },
  };
  const evidence = {
    ...childResult.evidence,
    invocation: {
      ...childResult.evidence.invocation,
      packageCommandId: command.id,
      executableClassification: command.executable,
      argvIdentitySha256: authResultContract.sha256Bytes(command.argv.join("\0")),
      environmentNameSetSha256: identity.environmentNameSetSha256,
      resultPathIdentitySha256: destination.resultPathIdentitySha256,
      invocationNonce,
    },
    databasePrerequisite,
    workspacePrerequisite,
  };
  const payload = {
    schema: authResultContract.AUTH_RESULT_SCHEMA,
    version: authResultContract.AUTH_RESULT_VERSION,
    command,
    result,
    valid: result !== "failure",
    identity,
    evidence,
    failure,
    completion: {
      complete: true,
      marker: authResultContract.AUTH_RESULT_COMPLETION_MARKER,
    },
  };
  const sealed = authResultContract.sealAuthCommandResult(payload);
  authResultContract.validateAuthCommandResultValue({
    result: sealed,
    destination,
    expectedNonce: invocationNonce,
    expectedCommandId: command.id,
    expectedMode: command.mode,
    expectedCandidateCommitSha: candidateCommitSha,
    expectedCandidateTreeSha: candidateTreeSha,
    sensitiveValues,
    allowNonConsumableFailure: result === "failure",
  });
  authResultContract.writeAuthCommandResult({ destination, payload });
  return authResultContract.validateAuthCommandResult({
    repositoryRoot: process.cwd(),
    externalRoot: destination.externalRoot,
    resultPath: destination.resultPath,
    expectedNonce: invocationNonce,
    expectedCommandId: command.id,
    expectedMode: command.mode,
    expectedCandidateCommitSha: candidateCommitSha,
    expectedCandidateTreeSha: candidateTreeSha,
    sensitiveValues,
  });
}

export async function runPreparedAuthPreflightDatabaseSequence({
  repositoryRoot,
  prepared,
  adapter = null,
  executeChild,
}) {
  let childProcess = null;
  let childValidated = null;
  let retainedFailure = null;
  let databaseCompletion = null;
  let authPreflightPassed = false;
  try {
    const executed = await executeChild();
    childProcess = executed.childProcess;
    childValidated = executed.childValidated;
    authPreflightPassed =
      !childProcess?.error &&
      !childProcess?.signal &&
      childProcess?.status === 0 &&
      childValidated?.result?.result === "success";
    if (
      childProcess?.error ||
      childProcess?.signal ||
      (childProcess?.status === 0) !==
        (childValidated?.result?.result === "success")
    ) {
      retainedFailure = new Error(
        "Real auth preflight child result did not match its process outcome",
      );
      retainedFailure.code = "AUTH_PREFLIGHT_PROCESS_RESULT_MISMATCH";
    } else if (childValidated.result.result !== "success") {
      retainedFailure = new Error("Real auth preflight server failed closed");
      retainedFailure.code = childValidated.result.failure?.code;
    }
  } catch (error) {
    retainedFailure = error;
  }

  const authSessionServerPreflight =
    authPreflightPassed ? "passed" : "failed";
  if (!retainedFailure) {
    try {
      databaseCompletion =
        await completeAuthSessionPreflightDatabaseLifecycle({
          repositoryRoot,
          environment: prepared.environment,
          adapter,
          preflightLifecycleBinding: prepared.preflightLifecycleBinding,
        });
    } catch (error) {
      retainedFailure = new Error(
        "Real auth preflight normal database cleanup failed",
        { cause: error },
      );
      retainedFailure.code = "AUTH_PREFLIGHT_NORMAL_CLEANUP_FAILURE";
    }
  }
  if (retainedFailure) {
    databaseCompletion = await abortAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot,
      environment: prepared.environment,
      adapter,
      preflightLifecycleBinding: prepared.preflightLifecycleBinding,
      originalFailure: {
        classification:
          childValidated?.result?.failure?.code ??
          retainedFailure.code ??
          "AUTH_SESSION_PREFLIGHT_FAILURE",
      },
      authSessionServerPreflight,
    });
  }
  return Object.freeze({
    childProcess,
    childValidated,
    databaseCompletion,
    retainedFailure,
    authSessionServerPreflight,
  });
}

export async function runRealAuthPreflight({
  baseEnvironment = process.env,
  sourceIdentity = null,
  prepareDatabaseLifecycle = prepareAuthSessionPreflightDatabaseLifecycle,
  databaseAdapter = null,
  databaseTestHooks = null,
} = {}) {
  const status =
    sourceIdentity?.status ??
    git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") {
    throw new Error("Real auth preflight requires an exact clean committed head");
  }
  const candidateCommitSha =
    sourceIdentity?.candidateCommitSha ?? git(["rev-parse", "HEAD"]);
  const candidateTreeSha =
    sourceIdentity?.candidateTreeSha ?? git(["rev-parse", "HEAD^{tree}"]);
  if (
    (baseEnvironment.CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA &&
      baseEnvironment.CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA !==
        candidateCommitSha) ||
    (baseEnvironment.CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA &&
      baseEnvironment.CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA !== candidateTreeSha)
  ) {
    throw new Error("Real auth preflight candidate binding is mismatched");
  }
  const consumedFixtureSession = authFixtureSession.consumeFixtureSession({
    repositoryRoot: process.cwd(),
    environment: baseEnvironment,
    requireAmbientProviderValues: true,
    sourceCommand: "certification:auth-session-preflight",
    sourceMode: "real-preflight",
  });
  const resultRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), "ci-auth-real-preflight-result-")),
  );
  const childResultPath = path.join(resultRoot, "auth-child.json");
  const finalResultPath = path.join(resultRoot, "auth-preflight.json");
  const lifecycleRoot = path.join(resultRoot, "auth-database-lifecycle");
  const invocationNonce =
    `auth-real-preflight-${process.pid}-${randomBytes(6).toString("hex")}`;
  const publishedResultRoot =
    baseEnvironment.CI_AUTH_FIXTURE_RESULT_ROOT || resultRoot;
  const publishedResultPath =
    baseEnvironment.CI_AUTH_FIXTURE_RESULT_PATH || finalResultPath;
  const publishedResultNonce =
    baseEnvironment.CI_AUTH_FIXTURE_RESULT_NONCE || invocationNonce;
  let prepared = null;
  let lifecycleEnvironment = null;
  let childValidated = null;
  let databaseCompletion = null;
  let retainedFailure = null;
  let fallbackCleanupFailure = null;
  let workspaceCleanupFailure = null;
  let orchestrationFailure = null;
  let authWorkspace = null;
  let workspacePrerequisite = null;
  let failureBoundary = "database-environment";
  let terminalDatabaseAbsenceVerified = false;
  let failureEvidencePublicationFailure = null;
  let databaseLifecycleFailureResult = null;
  let composedResultValidated = false;
  try {
    lifecycleEnvironment = createAuthSessionPreflightDatabaseEnvironment({
      baseEnvironment,
      lifecycleRoot,
      candidateCommitSha,
      candidateTreeSha,
      authPreflightInvocationNonce: invocationNonce,
    });
    failureBoundary = "database-prepare";
    prepared = await prepareDatabaseLifecycle({
      repositoryRoot: process.cwd(),
      baseEnvironment,
      lifecycleRoot,
      candidateCommitSha,
      candidateTreeSha,
      authPreflightInvocationNonce: invocationNonce,
      qualificationFixture:
        baseEnvironment.CERTIFICATION_QUALIFICATION_MODE === "1",
      adapter: databaseAdapter,
      testHooks: databaseTestHooks,
    });
    failureBoundary = "worktree-provision";
    authWorkspace = createAuthPreflightWorktree({
      repositoryRoot: process.cwd(),
      candidateCommitSha,
      candidateTreeSha,
      fixtureSessionIdentitySha256:
        consumedFixtureSession.safeIdentity.sessionAggregateSha256,
    });
    failureBoundary = "stage-environment-projection";
    const childBaseEnvironment = {
      ...baseEnvironment,
      ...consumedFixtureSession.assignments,
      CI_AUTH_FIXTURE_RESULT_ROOT: resultRoot,
      CI_AUTH_FIXTURE_RESULT_PATH: childResultPath,
      CI_AUTH_FIXTURE_RESULT_NONCE: invocationNonce,
      CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidateCommitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidateTreeSha,
    };
    const childProfile = certificationEnvironmentProfile(
      process.cwd(),
      AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
    );
    const authStageInputs = Object.fromEntries(
      childProfile.childVisibleVariables
        .filter((name) => childBaseEnvironment[name] !== undefined)
        .map((name) => [name, childBaseEnvironment[name]]),
    );
    const childEnvironment = projectCertificationChildEnvironment({
      repositoryRoot: process.cwd(),
      baseEnvironment: childBaseEnvironment,
      stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      profileId: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      stageInputs: {
        ...authStageInputs,
        ...prepared.projection.environment,
      },
    }).environment;
    failureBoundary = "auth-child-execution";
    const sequence = await runPreparedAuthPreflightDatabaseSequence({
      repositoryRoot: process.cwd(),
      prepared,
      executeChild() {
        const childProcess = runChild(
          "npm",
          ["run", "ci:auth-fixture:preflight-existing"],
          childEnvironment,
          authWorkspace.worktreeRoot,
        );
        let validated;
        try {
          validated = authResultContract.validateAuthCommandResult({
            repositoryRoot: authWorkspace.worktreeRoot,
            externalRoot: resultRoot,
            resultPath: childResultPath,
            expectedNonce: invocationNonce,
            expectedCommandId: "ci:auth-fixture:preflight-existing",
            expectedMode: "auth-session-preflight",
            expectedCandidateCommitSha: candidateCommitSha,
            expectedCandidateTreeSha: candidateTreeSha,
            sensitiveValues:
              authResultContract.privateValuesFromEnvironment(childEnvironment),
          });
        } catch (error) {
          const publicationFailure = new Error(
            "Auth preflight structured result publication failed closed",
            { cause: error },
          );
          publicationFailure.code = "AUTH_PREFLIGHT_RESULT_PUBLICATION_FAILED";
          throw publicationFailure;
        }
        inspectAuthPreflightWorktree(authWorkspace);
        return { childProcess, childValidated: validated };
      },
    });
    childValidated = sequence.childValidated;
    databaseCompletion = sequence.databaseCompletion;
    retainedFailure = sequence.retainedFailure;
    failureBoundary = "workspace-cleanup";
    try {
      workspacePrerequisite = completeAuthPreflightWorktree(authWorkspace);
    } catch (error) {
      if (
        retainedFailure &&
        error.safeEvidence?.cleanup?.completed === true
      ) {
        workspacePrerequisite = error.safeEvidence;
      } else {
        throw error;
      }
    }
    failureBoundary = "auth-child-result-validation";
    if (!childValidated) throw retainedFailure;
    failureBoundary = "composed-result-publication";
    const destination = authResultContract.resolveAuthResultDestination({
      repositoryRoot: process.cwd(),
      externalRoot: publishedResultRoot,
      resultPath: publishedResultPath,
    });
    const finalClassification = retainedFailure ? "failure" : "success";
    const finalValidated = writeFinalAuthResult({
      destination,
      childResult: childValidated.result,
      databasePrerequisite: databaseCompletion.evidence,
      workspacePrerequisite,
      invocationNonce: publishedResultNonce,
      candidateCommitSha,
      candidateTreeSha,
      result: finalClassification,
      failure: retainedFailure
        ? finalFailureEvidence(
            childValidated.result,
            "AUTH_PREFLIGHT_DATABASE_LIFECYCLE_FAILED",
            "database-lifecycle",
          )
        : null,
      sensitiveValues:
        authResultContract.privateValuesFromEnvironment({
          ...baseEnvironment,
          ...prepared.projection.environment,
          CERTIFICATION_DATABASE_ADMIN_URL:
            prepared.environment.CERTIFICATION_DATABASE_ADMIN_URL,
        }),
    });
    composedResultValidated = true;
    failureBoundary = "composed-result-validation";
    const evidence = finalValidated.result.evidence;
    assert.equal(finalValidated.result.result, "success");
    assert.equal(evidence.sessionRequest.statusCode, 200);
    assert.equal(evidence.sessionRequest.contentTypeClassification, "application-json");
    assert.equal(evidence.sessionRequest.redirectCount, 0);
    assert.equal(evidence.sessionRequest.safeBodyType, "null");
    assert.equal(evidence.sessionRequest.signedOutValidation, "passed");
    assert.equal(evidence.cleanup.finalServerTermination, "passed");
    assert.equal(evidence.cleanup.portReleased, true);
    assert.equal(evidence.checks.nonLoopbackRequestCount, 0);
    assert.equal(evidence.databasePrerequisite.dropResult, "passed");
    assert.equal(evidence.databasePrerequisite.absenceResult, "passed");
    assert.equal(evidence.workspacePrerequisite.cleanup.completed, true);
    assert.equal(evidence.workspacePrerequisite.cleanup.registrationAbsent, true);
    assert.equal(
      evidence.workspacePrerequisite.cleanup.sourceByteIdenticalAfterCleanup,
      true,
    );
    assert.equal(
      evidence.databasePrerequisite.classification,
      "AUTH_SESSION_PREFLIGHT_ONLY",
    );
  } catch (error) {
    databaseLifecycleFailureResult = error?.databaseLifecycleResult ?? null;
    orchestrationFailure = error;
  } finally {
    const environment = prepared?.environment ?? lifecycleEnvironment;
    const lifecyclePath = environment?.CERTIFICATION_DATABASE_LIFECYCLE_PATH;
    let lifecycleAttributionResult = databaseLifecycleFailureResult;
    if (
      !lifecycleAttributionResult &&
      environment &&
      lifecyclePath &&
      existsSync(lifecyclePath)
    ) {
      try {
        lifecycleAttributionResult = readCertificationDatabaseLifecycle({
          repositoryRoot: process.cwd(),
          environment,
        });
      } catch {
        // The receipt falls back to the earliest safe database-prepare boundary.
      }
    }
    let terminalAbsenceVerified = new Set([
      "absence-verified",
      "abort-absence-verified",
    ]).has(databaseCompletion?.current?.evidence?.currentState);
    if (
      !terminalAbsenceVerified &&
      environment &&
      lifecyclePath &&
      existsSync(lifecyclePath)
    ) {
      try {
        await abortCertificationDatabase({
          repositoryRoot: process.cwd(),
          environment,
          adapter: databaseAdapter,
          originalFailure: {
            classification: "AUTH_SESSION_PREFLIGHT_ORCHESTRATION_FAILURE",
            stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
            consumedSubstantiveGate: false,
          },
        });
        const current = readCertificationDatabaseLifecycle({
          repositoryRoot: process.cwd(),
          environment,
        });
        terminalAbsenceVerified =
          current.evidence.currentState === "abort-absence-verified";
      } catch (error) {
        fallbackCleanupFailure = error;
      }
    } else if (!lifecyclePath || !existsSync(lifecyclePath)) {
      terminalAbsenceVerified = true;
    }
    terminalDatabaseAbsenceVerified = terminalAbsenceVerified;
    if (authWorkspace && !workspacePrerequisite) {
      try {
        workspacePrerequisite = completeAuthPreflightWorktree(authWorkspace);
      } catch (error) {
        if (error.safeEvidence?.cleanup?.completed === true) {
          workspacePrerequisite = error.safeEvidence;
        } else {
          workspaceCleanupFailure = error;
        }
      }
    }
    if (orchestrationFailure && !composedResultValidated) {
      try {
        writeAuthPreflightOrchestrationFailure({
          repositoryRoot: process.cwd(),
          externalRoot: publishedResultRoot,
          publishedResultPath,
          publishedInvocationNonce: publishedResultNonce,
          candidateCommitSha,
          candidateTreeSha,
          fixtureSessionAggregateSha256:
            consumedFixtureSession.safeIdentity.sessionAggregateSha256,
          boundary: failureBoundary,
          error: orchestrationFailure,
          evidence: {
            databaseLifecycleStarted: lifecycleEnvironment !== null,
            databaseLifecyclePrepared: prepared !== null,
            databaseLifecycleAttribution: databaseLifecycleFailureAttribution({
              lifecycleStarted: lifecycleEnvironment !== null,
              failureResult: lifecycleAttributionResult,
              prepared,
            }),
            databaseCleanup: fallbackCleanupFailure
              ? "failed"
              : terminalDatabaseAbsenceVerified
                ? lifecyclePath && existsSync(lifecyclePath)
                  ? "absence-verified"
                  : "not-started-absence-verified"
                : "unverified",
            workspaceCreated: authWorkspace !== null,
            workspaceCleanup: workspaceCleanupFailure
              ? "failed"
              : authWorkspace === null
                ? "not-started"
                : workspacePrerequisite?.cleanup?.completed === true
                  ? "passed"
                  : "unverified",
            childResultPublication: existsSync(childResultPath)
              ? "present"
              : "absent",
            childResultValidation: childValidated ? "passed" : "not-completed",
            composedResultPublication: existsSync(publishedResultPath)
              ? "partial-or-invalid"
              : "absent",
          },
          sensitiveValues: authResultContract.privateValuesFromEnvironment({
            ...baseEnvironment,
            ...(prepared?.projection?.environment ?? {}),
            ...(prepared?.environment?.CERTIFICATION_DATABASE_ADMIN_URL
              ? {
                  CERTIFICATION_DATABASE_ADMIN_URL:
                    prepared.environment.CERTIFICATION_DATABASE_ADMIN_URL,
                }
              : {}),
          }),
        });
      } catch (error) {
        failureEvidencePublicationFailure = error;
      }
    }
    const publishedResultUsesInternalRoot =
      path.resolve(publishedResultRoot) === path.resolve(resultRoot);
    if (
      terminalAbsenceVerified &&
      !workspaceCleanupFailure &&
      !failureEvidencePublicationFailure &&
      !(orchestrationFailure && publishedResultUsesInternalRoot)
    ) {
      rmSync(resultRoot, { recursive: true, force: true });
    }
  }
  if (failureEvidencePublicationFailure) {
    throw new Error(
      "Real auth preflight failure evidence publication failed; recovery evidence was retained",
    );
  }
  if (fallbackCleanupFailure) {
    throw new Error(
      "Real auth preflight abort cleanup failed; private recovery evidence was retained",
    );
  }
  if (workspaceCleanupFailure) {
    throw new Error(
      "Real auth preflight worktree cleanup failed; task-owned recovery evidence was retained",
    );
  }
  if (orchestrationFailure) throw orchestrationFailure;
  console.log(
    "Real canonical auth-session preflight database lifecycle passed and cleaned up",
  );
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  runRealAuthPreflight().catch(() => {
    console.error(
      "Real canonical auth-session preflight database lifecycle failed closed",
    );
    process.exitCode = 1;
  });
}
