import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

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
import {
  assertSafeProductionArchiveEntries,
  compressProductionArchive,
  inventoryProductionArchiveTree,
  productionArchiveTarCommand,
} from "./production-archive.mjs";
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

function tarText(header, offset, length) {
  return header.subarray(offset, offset + length).toString("utf8").split("\0", 1)[0];
}

function tarNumber(header, offset, length) {
  return Number.parseInt(tarText(header, offset, length).trim() || "0", 8);
}

function tarHeaders(bytes) {
  const headers = [];
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const size = tarNumber(header, 124, 12);
    headers.push({
      mode: tarNumber(header, 100, 8), uid: tarNumber(header, 108, 8),
      gid: tarNumber(header, 116, 8), mtime: tarNumber(header, 136, 12),
      type: tarText(header, 156, 1) || "0", link: tarText(header, 157, 100),
      uname: tarText(header, 265, 32), gname: tarText(header, 297, 32),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return headers;
}

function createArchiveStage(owner, name, unsafe = false) {
  const root = path.join(owner, name);
  const nested = path.join(root, "nested");
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, "file.txt"), "portable archive bytes\n");
  writeFileSync(path.join(nested, "empty.txt"), "");
  writeFileSync(path.join(nested, "東京.txt"), "unicode\n");
  const longPath = path.join(root, "long", "a".repeat(96), "b".repeat(96), "file.txt");
  mkdirSync(path.dirname(longPath), { recursive: true });
  writeFileSync(longPath, "long path\n");
  symlinkSync("file.txt", path.join(nested, "relative-link"));
  if (unsafe) writeFileSync(path.join(root, "-C"), "unsafe list directive\n");
  chmodSync(path.join(nested, "file.txt"), 0o600);
  mkdirSync(path.join(root, ".certification"));
  const inventory = inventoryProductionArchiveTree(root);
  writeFileSync(path.join(root, ".certification/archive-inventory.json"), JSON.stringify(inventory));
  return { root, inventory };
}

{
  const command = productionArchiveTarCommand({ tarPath: "/archive.tar", stageRoot: "/stage", listPath: "/files.txt", members: ["file"] });
  assert.equal(command.executable, "tar");
  assert.equal(Object.hasOwn(command, "shell"), false);
  assert.ok(command.args.includes("--owner=root:0"));
  assert.ok(command.args.includes("--group=root:0"));
  for (const option of ["--uid", "--gid", "--uname", "--gname"]) {
    assert.equal(command.args.includes(option), false);
  }
  for (const member of ["-C", "line\nfeed", "carriage\rreturn", "nul\0byte", "back\\slash", " padded"]) {
    assert.throws(() => productionArchiveTarCommand({ ...command, members: [member] }), /safe tar file-list/);
  }
  assert.throws(() => productionArchiveTarCommand({ ...command, members: ["z", "a"] }), /sorted/);
  assert.doesNotThrow(() => assertSafeProductionArchiveEntries(["safe/path"]));
  for (const entry of ["/absolute", "../parent", "safe/../../parent"]) {
    assert.throws(() => assertSafeProductionArchiveEntries([entry]), /unsafe extraction path/);
  }
}

{
  const owner = mkdtempSync(path.join(tmpdir(), "production-archive-portability-"));
  const evidenceRoot = path.join(owner, "evidence");
  const previousEvidenceRoot = process.env.CERTIFICATION_EVIDENCE_ROOT;
  const tarTempsBefore = readdirSync(tmpdir()).filter((entry) => entry.startsWith("production-archive-tar-")).sort();
  try {
    process.env.CERTIFICATION_EVIDENCE_ROOT = owner;
    mkdirSync(evidenceRoot);
    const first = createArchiveStage(evidenceRoot, "stage-one");
    const second = createArchiveStage(evidenceRoot, "stage-two");
    const firstPath = path.join(evidenceRoot, "first.tar.gz");
    const secondPath = path.join(evidenceRoot, "second.tar.gz");
    const firstResult = compressProductionArchive({ repositoryRoot: process.cwd(), stageRoot: first.root, archivePath: firstPath });
    const secondResult = compressProductionArchive({ repositoryRoot: process.cwd(), stageRoot: second.root, archivePath: secondPath });
    assert.equal(firstResult.archiveSha256, secondResult.archiveSha256);
    console.log(`Portable archive two-run SHA-256: ${firstResult.archiveSha256}`);
    const gzip = readFileSync(firstPath);
    assert.equal(gzip.readUInt32LE(4), 0);
    assert.equal(gzip[3], 0);
    const raw = gunzipSync(gzip);
    const listed = spawnSync("tar", ["-tf", "-"], { input: raw, encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    const entries = listed.stdout.trim().split("\n");
    assert.deepEqual(entries, [...entries].sort());
    assert.equal(entries.some((entry) => entry.length > 180), true);
    assert.equal(entries.some((entry) => entry.startsWith("._") || entry.includes("/._")), false);
    assert.equal(raw.includes(Buffer.from("SCHILY.xattr")), false);
    const headers = tarHeaders(raw).filter((header) => ["0", "2"].includes(header.type));
    assert.ok(headers.length >= entries.length);
    for (const header of headers) {
      assert.equal(header.uid, 0); assert.equal(header.gid, 0);
      assert.equal(header.uname, "root"); assert.equal(header.gname, "root");
      assert.equal(header.mtime, 0);
      if (header.type === "0") assert.equal(header.mode & 0o777, 0o644);
    }
    assert.equal(headers.some((header) => header.type === "2" && header.link === "file.txt"), true);
    const extracted = path.join(owner, "extracted");
    mkdirSync(extracted);
    const extraction = spawnSync("tar", ["-xf", "-", "-C", extracted], { input: raw, encoding: "utf8" });
    assert.equal(extraction.status, 0, extraction.stderr);
    assert.equal(lstatSync(path.join(extracted, "nested/relative-link")).isSymbolicLink(), true);
    assert.equal(readlinkSync(path.join(extracted, "nested/relative-link")), "file.txt");
    assert.equal(readFileSync(path.join(extracted, "nested/file.txt"), "utf8"), "portable archive bytes\n");
    assert.equal(readFileSync(path.join(extracted, "nested/東京.txt"), "utf8"), "unicode\n");
    const extractedInventory = inventoryProductionArchiveTree(extracted);
    assert.equal(extractedInventory.inventorySha256, first.inventory.inventorySha256);
    assert.throws(() => compressProductionArchive({ repositoryRoot: process.cwd(), stageRoot: first.root, archivePath: firstPath }), /target must be absent/);
    const unsafe = createArchiveStage(evidenceRoot, "stage-unsafe", true);
    const unsafePath = path.join(evidenceRoot, "unsafe.tar.gz");
    assert.throws(() => compressProductionArchive({ repositoryRoot: process.cwd(), stageRoot: unsafe.root, archivePath: unsafePath }), /safe tar file-list/);
    assert.equal(existsSync(unsafePath), false);
  } finally {
    if (previousEvidenceRoot === undefined) delete process.env.CERTIFICATION_EVIDENCE_ROOT;
    else process.env.CERTIFICATION_EVIDENCE_ROOT = previousEvidenceRoot;
    rmSync(owner, { recursive: true, force: true });
  }
  const tarTempsAfter = readdirSync(tmpdir()).filter((entry) => entry.startsWith("production-archive-tar-")).sort();
  assert.deepEqual(tarTempsAfter, tarTempsBefore);
}

console.log("Archive plan failure evidence tests passed.");
