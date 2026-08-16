import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  archivePlanStreamDescriptor,
  createArchivePlanChildEvidence,
  redactArchivePlanStream,
} from "./production-archive-plan-evidence.mjs";
import {
  archivePlanStageFailure,
  archiveEnvironmentProjection,
  certificationStageFailure,
  retainArchivePlanChild,
} from "./production-certification-real.mjs";
import { TRACE_POLICY_REASONS } from "./production-trace-archive-policy.mjs";

const hash = "a".repeat(64);
const environmentProfileMetadata = Object.freeze({
  profileId: "archive-preflight",
  stage: "archive-preflight",
  contractSchema: "interior-ai.production-certification-stage-environment.v2",
  contractSha256: hash,
  profileSha256: hash,
  allowedVariableNamesSha256: hash,
  requiredVariableNamesSha256: hash,
  valuePolicySha256: hash,
  environmentNamesSha256: hash,
  valuePolicyValidation: { passed: true },
});
const workingDirectory = Object.freeze({
  classification: "exact-candidate-root",
  commitSha: "b".repeat(40),
  treeSha: "c".repeat(40),
});

function evidenceFor({
  status = 0,
  signal = null,
  error = null,
  pid = 1234,
  stdout = '{"planSha256":"fixture"}\n',
  stderr = "",
} = {}) {
  const stdoutDescriptor = archivePlanStreamDescriptor(
    "archive/attempt-001/plan-stdout.log",
    stdout,
  );
  const stderrDescriptor = archivePlanStreamDescriptor(
    "archive/attempt-001/plan-stderr.log",
    stderr,
  );
  return createArchivePlanChildEvidence({
    child: { status, signal, error, pid },
    stderr,
    stdoutDescriptor,
    stderrDescriptor,
    environmentProfileMetadata,
    workingDirectory,
  });
}

const policyFailure = `${JSON.stringify({
  schema: "interior-ai.production-archive-failure.v1",
  failureCode: "ARCHIVE_TRACE_POLICY_REJECTION",
  rejectedRelativePath: "scripts/test-floor-plan-construction-sources.ts",
  policyDecision: "reject",
  policyReason: TRACE_POLICY_REASONS.PROVEN_OVERTRACE,
  completionMarker: "failed",
})}\n`;

{
  const evidence = evidenceFor({ status: 1, stderr: policyFailure });
  assert.equal(
    evidence.failure.code,
    "ARCHIVE_TRACE_POLICY_REJECTION",
    "Archive plan policy rejection survives parent adaptation.",
  );
  assert.equal(
    evidence.failure.rejectedRelativePath,
    "scripts/test-floor-plan-construction-sources.ts",
  );
  assert.equal(evidence.failure.policyDecision, "reject");
  assert.equal(
    evidence.failure.policyReason,
    TRACE_POLICY_REASONS.PROVEN_OVERTRACE,
  );
}

{
  const evidence = evidenceFor({ status: 17, stderr: "nonzero\n" });
  assert.equal(evidence.process.exitStatus, 17);
  assert.equal(evidence.process.signal, null);
  assert.equal(evidence.completionMarker.result, "failed");
}

{
  const evidence = evidenceFor({ status: null, signal: "SIGTERM" });
  assert.equal(evidence.process.exitStatus, null);
  assert.equal(evidence.process.signal, "SIGTERM");
  assert.equal(evidence.completionMarker.result, "failed");
}

{
  const error = Object.assign(new Error("spawn failed"), { code: "ENOENT" });
  const evidence = evidenceFor({ status: null, error, pid: 0 });
  assert.equal(evidence.process.childPid, null);
  assert.equal(evidence.process.spawnErrorClassification, "ENOENT");
  assert.equal(evidence.completionMarker.result, "failed");
}

{
  const evidence = evidenceFor({
    status: 9,
    stdout: "planner stdout\n",
    stderr: "planner stderr\n",
  });
  assert.deepEqual(evidence.stdout, {
    path: "archive/attempt-001/plan-stdout.log",
    sha256: "e5d20cc8909a97d129ca87347b96ece330b4a7db05389d3f242ec527d9d468fd",
    bytes: 15,
  });
  assert.equal(evidence.stderr.path, "archive/attempt-001/plan-stderr.log");
  assert.match(evidence.stderr.sha256, /^[0-9a-f]{64}$/);
  assert.equal(evidence.stderr.bytes, 15);
}

{
  const secret = "raw-credential-value";
  const privatePath = "/Users/example/private/archive/plan.json";
  const redacted = redactArchivePlanStream(
    `failure ${secret} at ${privatePath}\n`,
    {
      privatePaths: [privatePath],
      environment: { STRIPE_SECRET_KEY: secret },
    },
  );
  assert.equal(redacted.includes(secret), false);
  assert.equal(redacted.includes(privatePath), false);
  assert.match(redacted, /<redacted>/);
}

{
  const evidence = evidenceFor();
  assert.equal(evidence.completionMarker.result, "succeeded");
  assert.equal(evidence.process.exitStatus, 0);
  assert.equal(evidence.failure, null);
  assert.equal(JSON.parse('{"planSha256":"fixture"}').planSha256, "fixture");
}

{
  const unsafeFailure = `${JSON.stringify({
    schema: "interior-ai.production-archive-failure.v1",
    failureCode: "ARCHIVE_TRACE_POLICY_REJECTION",
    rejectedRelativePath: "/Users/private/source.ts",
    policyDecision: "reject",
    policyReason: TRACE_POLICY_REASONS.PROVEN_OVERTRACE,
    completionMarker: "failed",
  })}\n`;
  const evidence = evidenceFor({ status: 1, stderr: unsafeFailure });
  assert.equal(evidence.failure.code, "ARCHIVE_PLAN_CHILD_FAILURE");
  assert.equal(evidence.failure.rejectedRelativePath, null);
}

{
  const repositoryRoot = process.cwd();
  const evidenceRoot = mkdtempSync(
    path.join(tmpdir(), "interior-ai-archive-parent-evidence-"),
  );
  const context = {
    canonicalRoot: repositoryRoot,
    repositoryRoot,
    evidenceRoot,
    environment: {},
    state: {
      candidate: {
        id: "CERT-20260816T165333Z-635be527",
        commitSha: workingDirectory.commitSha,
        treeSha: workingDirectory.treeSha,
      },
      bindings: {
        nextBuildId: "fixture-build-id",
        artifactSha256: hash,
      },
      stages: { "archive-preflight": { attempts: [] } },
    },
  };
  try {
    const projection = archiveEnvironmentProjection(
      context,
      "archive-preflight",
    );
    assert.equal(projection.metadata.profileId, "archive-preflight");
    assert.equal(
      projection.environment.PRODUCTION_ARCHIVE_SOURCE_ROOT,
      repositoryRoot,
    );
    assert.equal(
      projection.environment.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA,
      workingDirectory.commitSha,
    );

    const child = {
      status: 1,
      signal: null,
      error: null,
      pid: 9876,
      stdout: "planner stdout\n",
      stderr: policyFailure,
    };
    const retained = retainArchivePlanChild(
      context,
      "archive-preflight",
      child,
      projection,
    );
    assert.equal(
      retained.descriptor.path,
      "archive/attempt-001/plan-result.json",
    );
    assert.equal(
      retained.evidence.environmentProfile.profileId,
      "archive-preflight",
    );
    assert.equal(
      retained.evidence.failure.rejectedRelativePath,
      "scripts/test-floor-plan-construction-sources.ts",
    );
    const stageFailure = certificationStageFailure(
      archivePlanStageFailure(child, retained),
    );
    assert.equal(stageFailure.classification, "ARCHIVE_FAILURE");
    assert.equal(stageFailure.exitCode, 1);
    assert.deepEqual(stageFailure.evidenceFiles, {
      "archive-plan": retained.descriptor,
    });
    assert.deepEqual(
      stageFailure.certificationResult.archivePlanEvidence,
      retained.descriptor,
    );
    assert.match(
      stageFailure.message,
      /PROVEN_NFT_OVERTRACE_REJECTED: scripts\/test-floor-plan-construction-sources\.ts/,
    );
    for (const relativePath of [
      retained.descriptor.path,
      retained.evidence.stdout.path,
      retained.evidence.stderr.path,
    ]) {
      const retainedBytes = readFileSync(path.join(evidenceRoot, relativePath));
      assert.equal(retainedBytes.includes(Buffer.from(repositoryRoot)), false);
    }
  } finally {
    rmSync(evidenceRoot, { recursive: true, force: true });
  }
}

const parentSource = readFileSync("scripts/production-certification-real.mjs", "utf8");
assert.match(parentSource, /evidenceFiles: \{ "archive-plan": retained\.descriptor \}/);
assert.doesNotMatch(
  readFileSync("scripts/production-archive-plan-evidence.mjs", "utf8"),
  /environmentProfile:\s*environment|rawEnvironment|process\.env/,
);

console.log("Archive plan failure evidence tests passed.");
