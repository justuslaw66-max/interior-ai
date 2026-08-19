import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
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
  projectCertificationChildEnvironment,
} from "./production-certification-stage-environment.mjs";

const require = createRequire(import.meta.url);
const authResultContract = require("./ci-auth-fixture-result-contract.cjs");

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

function runChild(command, args, environment) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
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
  invocationNonce,
  candidateCommitSha,
  candidateTreeSha,
  result,
  failure,
  sensitiveValues,
}) {
  const command = {
    id: "test:ci-auth-fixture-real-preflight",
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

export async function runRealAuthPreflight() {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") {
    throw new Error("Real auth preflight requires an exact clean committed head");
  }
  const candidateCommitSha = git(["rev-parse", "HEAD"]);
  const candidateTreeSha = git(["rev-parse", "HEAD^{tree}"]);
  const resultRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), "ci-auth-real-preflight-result-")),
  );
  const childResultPath = path.join(resultRoot, "auth-child.json");
  const finalResultPath = path.join(resultRoot, "auth-preflight.json");
  const lifecycleRoot = path.join(resultRoot, "auth-database-lifecycle");
  const invocationNonce =
    `auth-real-preflight-${process.pid}-${randomBytes(6).toString("hex")}`;
  let prepared = null;
  let lifecycleEnvironment = null;
  let childValidated = null;
  let databaseCompletion = null;
  let retainedFailure = null;
  let fallbackCleanupFailure = null;
  let orchestrationFailure = null;
  try {
    lifecycleEnvironment = createAuthSessionPreflightDatabaseEnvironment({
      baseEnvironment: process.env,
      lifecycleRoot,
      candidateCommitSha,
      candidateTreeSha,
      authPreflightInvocationNonce: invocationNonce,
    });
    prepared = await prepareAuthSessionPreflightDatabaseLifecycle({
      repositoryRoot: process.cwd(),
      baseEnvironment: process.env,
      lifecycleRoot,
      candidateCommitSha,
      candidateTreeSha,
      authPreflightInvocationNonce: invocationNonce,
      qualificationFixture:
        process.env.CERTIFICATION_QUALIFICATION_MODE === "1",
    });
    const childBaseEnvironment = {
      ...process.env,
      CI_AUTH_FIXTURE_RESULT_ROOT: resultRoot,
      CI_AUTH_FIXTURE_RESULT_PATH: childResultPath,
      CI_AUTH_FIXTURE_RESULT_NONCE: invocationNonce,
      CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidateCommitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidateTreeSha,
    };
    const childEnvironment = projectCertificationChildEnvironment({
      repositoryRoot: process.cwd(),
      baseEnvironment: childBaseEnvironment,
      stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      profileId: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      stageInputs: prepared.projection.environment,
    }).environment;
    const sequence = await runPreparedAuthPreflightDatabaseSequence({
      repositoryRoot: process.cwd(),
      prepared,
      executeChild() {
        const childProcess = runChild(
          "npm",
          ["run", "test:advisory-auth-preflight"],
          childEnvironment,
        );
        let validated;
        try {
          validated = authResultContract.validateAuthCommandResult({
            repositoryRoot: process.cwd(),
            externalRoot: resultRoot,
            resultPath: childResultPath,
            expectedNonce: invocationNonce,
            expectedCommandId: "test:advisory-auth-preflight",
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
        return { childProcess, childValidated: validated };
      },
    });
    childValidated = sequence.childValidated;
    databaseCompletion = sequence.databaseCompletion;
    retainedFailure = sequence.retainedFailure;
    if (!childValidated) throw retainedFailure;
    const destination = authResultContract.resolveAuthResultDestination({
      repositoryRoot: process.cwd(),
      externalRoot: resultRoot,
      resultPath: finalResultPath,
    });
    const finalClassification = retainedFailure ? "failure" : "success";
    const finalValidated = writeFinalAuthResult({
      destination,
      childResult: childValidated.result,
      databasePrerequisite: databaseCompletion.evidence,
      invocationNonce,
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
          ...process.env,
          ...prepared.projection.environment,
          CERTIFICATION_DATABASE_ADMIN_URL:
            prepared.environment.CERTIFICATION_DATABASE_ADMIN_URL,
        }),
    });
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
    assert.equal(
      evidence.databasePrerequisite.classification,
      "AUTH_SESSION_PREFLIGHT_ONLY",
    );
  } catch (error) {
    orchestrationFailure = error;
  } finally {
    const environment = prepared?.environment ?? lifecycleEnvironment;
    const lifecyclePath = environment?.CERTIFICATION_DATABASE_LIFECYCLE_PATH;
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
    if (terminalAbsenceVerified) {
      rmSync(resultRoot, { recursive: true, force: true });
    }
  }
  if (fallbackCleanupFailure) {
    throw new Error(
      "Real auth preflight abort cleanup failed; private recovery evidence was retained",
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
