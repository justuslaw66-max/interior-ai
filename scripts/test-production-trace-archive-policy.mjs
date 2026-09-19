import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import {
  chmodSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { inspectTraceInventory } from "./production-artifact-evidence.mjs";
import {
  ProductionArchivePolicyError,
  compressProductionArchive,
  immutableNextArtifactFiles,
  inventoryProductionArchiveTree,
  nftDerivedInputs,
  productionTarOwnershipArguments,
} from "./production-archive.mjs";
import {
  GLB_OPTIMIZER_NFT_MANIFEST,
  TRACE_INPUT_PROVENANCE,
  TRACE_POLICY_REASONS,
  TRACE_RUNTIME_NECESSITY,
  TRACE_SENSITIVE_SCAN,
  decideNftTraceArchiveInclusion,
  decideNftTraceReferenceInclusion,
  decideProductionTraceArchiveInclusion,
  formatTraceArchivePolicyRejection,
  isTestSourcePath,
  resolveNftTraceReference,
} from "./production-trace-archive-policy.mjs";

function traceFixture(relativePath) {
  const fixture = JSON.parse(readFileSync(relativePath, "utf8"));
  assert.equal(
    fixture.schema,
    "interior-ai.production-trace-regression-fixture.v1",
  );
  assert.equal(fixture.nftManifestPath, GLB_OPTIMIZER_NFT_MANIFEST);
  assert.ok(Array.isArray(fixture.files));
  return fixture;
}

function fixtureClosure(fixture) {
  return fixture.files.map((reference) => {
    const relativePath = resolveNftTraceReference({
      nftManifestPath: fixture.nftManifestPath,
      reference,
    });
    assert.ok(relativePath, `fixture NFT reference is malformed: ${reference}`);
    return { reference, relativePath };
  });
}

const retainedOvertraceFixture = traceFixture(
  "scripts/fixtures/production-trace/glb-optimizer-retained-overtrace.nft.json",
);
const postCorrectionFixture = traceFixture(
  "scripts/fixtures/production-trace/glb-optimizer-post-correction.nft.json",
);
const retainedOvertraceClosure = fixtureClosure(retainedOvertraceFixture);
const postCorrectionClosure = fixtureClosure(postCorrectionFixture);

export const GLB_OPTIMIZER_CURRENT_TEST_OVERTRACE_PATHS = Object.freeze(
  retainedOvertraceClosure
    .map(({ relativePath }) => relativePath)
    .filter(isTestSourcePath),
);
assert.equal(
  GLB_OPTIMIZER_CURRENT_TEST_OVERTRACE_PATHS.length,
  8,
  "Production trace/archive policy tests passed.",
);
assert.deepEqual(
  postCorrectionClosure.filter(({ relativePath }) => isTestSourcePath(relativePath)),
  [],
  "the post-correction GLB optimizer route NFT fixture must contain zero test paths",
);

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function nftFixture(references) {
  const root = mkdtempSync(path.join(tmpdir(), "trace-archive-policy-"));
  for (const reference of references) {
    const relativePath = resolveNftTraceReference({
      nftManifestPath: GLB_OPTIMIZER_NFT_MANIFEST,
      reference,
    });
    assert.ok(relativePath);
    write(root, relativePath, "fixture source\n");
  }
  write(
    root,
    GLB_OPTIMIZER_NFT_MANIFEST,
    `${JSON.stringify({ version: 1, files: references })}\n`,
  );
  return root;
}

{
  const result = decideProductionTraceArchiveInclusion({
    relativePath: "scripts/test-manually-added.ts",
    provenance: TRACE_INPUT_PROVENANCE.MANUAL,
  });
  assert.equal(result.decision, "reject");
  assert.equal(result.reason, TRACE_POLICY_REASONS.MANUAL_TEST_SOURCE);
}

{
  const result = decideNftTraceArchiveInclusion({
    relativePath: "scripts/test-unrelated.ts",
    nftManifestPath: ".next/server/app/api/unrelated/route.js.nft.json",
  });
  assert.equal(result.decision, "reject");
  assert.equal(result.reason, TRACE_POLICY_REASONS.UNKNOWN_RUNTIME_NECESSITY);
}

for (const relativePath of [
  ".env.production",
  ".git/config",
  ".local/private-evidence.json",
  ".next/cache/mutable.bin",
  "release-evidence-private/report.json",
]) {
  const result = decideProductionTraceArchiveInclusion({
    relativePath,
    provenance: TRACE_INPUT_PROVENANCE.NFT,
    nftManifestPath: ".next/server/app/api/example/route.js.nft.json",
    runtimeNecessity: TRACE_RUNTIME_NECESSITY.REQUIRED,
  });
  assert.equal(result.decision, "reject");
  assert.equal(result.reason, TRACE_POLICY_REASONS.PROHIBITED_PATH);
}

{
  const sealedEvidence = decideProductionTraceArchiveInclusion({
    relativePath: ".local/production-artifact-evidence/manifest.json",
    provenance: TRACE_INPUT_PROVENANCE.CERTIFICATION_EVIDENCE,
  });
  const unrelatedLocal = decideProductionTraceArchiveInclusion({
    relativePath: ".local/production-artifact-evidence/private-note.json",
    provenance: TRACE_INPUT_PROVENANCE.CERTIFICATION_EVIDENCE,
  });
  assert.equal(sealedEvidence.decision, "include");
  assert.equal(unrelatedLocal.decision, "reject");
  assert.equal(unrelatedLocal.reason, TRACE_POLICY_REASONS.PROHIBITED_PATH);

  const sensitiveEvidence = decideProductionTraceArchiveInclusion({
    relativePath: ".local/production-artifact-evidence/manifest.json",
    provenance: TRACE_INPUT_PROVENANCE.CERTIFICATION_EVIDENCE,
    sensitiveScan: TRACE_SENSITIVE_SCAN.MATCH,
  });
  assert.equal(sensitiveEvidence.decision, "reject");
  assert.equal(sensitiveEvidence.reason, TRACE_POLICY_REASONS.SENSITIVE_MATCH);
}

for (const relativePath of [
  ".next/cache/mutable.bin",
  ".next/dev/mutable.bin",
  ".next/diagnostics/mutable.bin",
  ".next/trace",
]) {
  const result = decideProductionTraceArchiveInclusion({
    relativePath,
    provenance: TRACE_INPUT_PROVENANCE.MANUAL,
  });
  assert.equal(result.decision, "reject");
  assert.equal(result.reason, TRACE_POLICY_REASONS.PROHIBITED_PATH);
}

{
  const root = mkdtempSync(path.join(tmpdir(), "trace-archive-mutable-nft-"));
  try {
    write(root, ".next/server/kept.txt", "immutable artifact\n");
    write(
      root,
      ".next/trace/diagnostic.nft.json",
      `${JSON.stringify({
        version: 1,
        files: ["../../scripts/test-mutable-diagnostic.ts"],
      })}\n`,
    );
    mkdirSync(path.join(root, ".next/cache"), { recursive: true });
    symlinkSync(tmpdir(), path.join(root, ".next/cache/outside-link"));
    assert.deepEqual(immutableNextArtifactFiles(root), [
      ".next/server/kept.txt",
    ]);
    assert.deepEqual(nftDerivedInputs(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const invalidReference of [
  "/etc/passwd",
  "C:\\Users\\private\\secret.txt",
  "runtime\\backslash.js",
  "runtime/contains\0nul.js",
  "../../../../../../../outside-repository.js",
  null,
]) {
  const root = mkdtempSync(path.join(tmpdir(), "trace-archive-invalid-nft-"));
  const manifestPath = ".next/server/app/api/example/route.js.nft.json";
  try {
    write(
      root,
      manifestPath,
      `${JSON.stringify({ version: 1, files: [invalidReference] })}\n`,
    );
    const expected = decideNftTraceReferenceInclusion({
      nftManifestPath: manifestPath,
      reference: invalidReference,
    });
    assert.equal(expected.decision, "reject");
    assert.equal(
      expected.reason,
      TRACE_POLICY_REASONS.MALFORMED_NFT_REFERENCE,
    );
    const artifact = await inspectTraceInventory(root, [{ path: manifestPath }]);
    assert.deepEqual(artifact.policyRejections, [
      formatTraceArchivePolicyRejection(expected),
    ]);
    assert.throws(
      () => nftDerivedInputs(root),
      (error) => {
        assert.ok(error instanceof ProductionArchivePolicyError);
        assert.equal(error.message, artifact.policyRejections[0]);
        assert.equal(error.policyDecision, expected.decision);
        assert.equal(error.policyReason, expected.reason);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(path.join(tmpdir(), "trace-archive-missing-nft-"));
  const manifestPath = ".next/server/app/api/example/route.js.nft.json";
  const missingPath = "runtime/missing-input.js";
  const rawReference = path
    .relative(path.dirname(manifestPath), missingPath)
    .split(path.sep)
    .join("/");
  try {
    write(
      root,
      manifestPath,
      `${JSON.stringify({ version: 1, files: [rawReference] })}\n`,
    );
    const artifact = await inspectTraceInventory(root, [{ path: manifestPath }]);
    assert.deepEqual(artifact.missingPaths, [missingPath]);
    assert.throws(
      () => nftDerivedInputs(root),
      /NFT manifest reference is missing: runtime\/missing-input\.js/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const result = decideProductionTraceArchiveInclusion({
    relativePath: "public/runtime.json",
    provenance: "unclassified",
  });
  assert.equal(result.decision, "reject");
  assert.equal(result.reason, TRACE_POLICY_REASONS.UNKNOWN_PROVENANCE);
}

{
  const result = decideProductionTraceArchiveInclusion({
    relativePath: "public/runtime.json",
    provenance: TRACE_INPUT_PROVENANCE.NFT,
    nftManifestPath: ".next/server/app/api/example/route.js.nft.json",
    runtimeNecessity: TRACE_RUNTIME_NECESSITY.REQUIRED,
    sensitiveScan: TRACE_SENSITIVE_SCAN.MATCH,
  });
  assert.equal(result.decision, "reject");
  assert.equal(result.reason, TRACE_POLICY_REASONS.SENSITIVE_MATCH);
}

for (const { reference, relativePath } of retainedOvertraceClosure.filter(
  (entry) => isTestSourcePath(entry.relativePath),
)) {
  const expected = decideNftTraceArchiveInclusion({
    relativePath,
    nftManifestPath: GLB_OPTIMIZER_NFT_MANIFEST,
  });
  assert.equal(expected.decision, "reject");
  assert.equal(expected.reason, TRACE_POLICY_REASONS.PROVEN_OVERTRACE);

  const root = nftFixture([reference]);
  try {
    const artifact = await inspectTraceInventory(root, [
      { path: GLB_OPTIMIZER_NFT_MANIFEST },
    ]);
    assert.deepEqual(artifact.policyRejections, [
      formatTraceArchivePolicyRejection(expected),
    ]);
    assert.throws(
      () => nftDerivedInputs(root),
      (error) => {
        assert.ok(error instanceof ProductionArchivePolicyError);
        assert.equal(error.message, artifact.policyRejections[0]);
        assert.equal(error.policyDecision, expected.decision);
        assert.equal(error.policyReason, expected.reason);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = nftFixture(retainedOvertraceFixture.files);
  try {
    const artifact = await inspectTraceInventory(root, [
      { path: GLB_OPTIMIZER_NFT_MANIFEST },
    ]);
    const expectedRejections = retainedOvertraceClosure
      .map(({ reference }) =>
        decideNftTraceReferenceInclusion({
          nftManifestPath: GLB_OPTIMIZER_NFT_MANIFEST,
          reference,
        }),
      )
      .map(formatTraceArchivePolicyRejection)
      .sort();
    assert.deepEqual(artifact.policyRejections, expectedRejections);
    assert.equal(artifact.policyRejections.length, 8);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = nftFixture(postCorrectionFixture.files);
  try {
    const artifact = await inspectTraceInventory(root, [
      { path: GLB_OPTIMIZER_NFT_MANIFEST },
    ]);
    assert.deepEqual(artifact.policyRejections, []);
    assert.deepEqual(artifact.prohibitedPaths, []);
    assert.deepEqual(
      nftDerivedInputs(root),
      postCorrectionClosure.map(({ relativePath }) => relativePath).sort(),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const glbRoute = readFileSync("app/api/tools/glb-optimizer/route.ts", "utf8");
const optimizer = readFileSync("lib/asset-pipeline/optimize.ts", "utf8");
const normalizer = readFileSync("lib/asset-pipeline/normalize.ts", "utf8");
assert.doesNotMatch(`${glbRoute}\n${optimizer}\n${normalizer}`, /scripts\/test-|readdir/);

const nextConfig = readFileSync("next.config.ts", "utf8");
assert.match(
  nextConfig,
  /"\/api\/tools\/glb-optimizer": \["\.\/scripts\/test-\*"\]/,
);
assert.doesNotMatch(nextConfig, /"\/\*":\s*\[[^\]]*scripts\/test-/);

const policySource = readFileSync("scripts/production-trace-archive-policy.mjs", "utf8");
for (const relativePath of GLB_OPTIMIZER_CURRENT_TEST_OVERTRACE_PATHS) {
  assert.equal(
    policySource.includes(relativePath),
    false,
    "the canonical policy must not hardcode the diagnostic filenames",
  );
}

const sensitiveShapedFixtures = GLB_OPTIMIZER_CURRENT_TEST_OVERTRACE_PATHS.filter(
  (relativePath) =>
    /raw-secret-must-not-appear|raw-filesystem-secret-must-not-appear|DATABASE_URL/.test(
      readFileSync(relativePath, "utf8"),
    ),
);
assert.deepEqual(sensitiveShapedFixtures, [
  "scripts/test-production-certification-resources.mjs",
  "scripts/test-production-certification-source-generated-outputs.mjs",
  "scripts/test-runtime-smoke-resource-isolation.mjs",
]);

assert.deepEqual(productionTarOwnershipArguments("tar (GNU tar) 1.35\n"), [
  "--owner=root:0", "--group=root:0",
]);
assert.deepEqual(productionTarOwnershipArguments("bsdtar 3.5.3 - libarchive 3.7.4\n"), [
  "--uid", "0", "--gid", "0", "--uname", "root", "--gname", "root",
]);
for (const version of ["", "tar", "BusyBox v1.36", "tar (GNU tar)", "bsdtar"]) {
  assert.throws(() => productionTarOwnershipArguments(version), /requires GNU tar or bsdtar/);
}

{
  const root = mkdtempSync(path.join(tmpdir(), "trace-archive-compression-"));
  const previousEvidenceRoot = process.env.CERTIFICATION_EVIDENCE_ROOT;
  try {
    process.env.CERTIFICATION_EVIDENCE_ROOT = root;
    const archiveRoot = path.join(root, "archive");
    const stageRoot = path.join(archiveRoot, "stage");
    write(stageRoot, "z.txt", "last\n");
    write(stageRoot, "a.txt", "first\n");
    symlinkSync("a.txt", path.join(stageRoot, "link"));
    write(stageRoot, ".certification/archive-inventory.json", JSON.stringify(
      inventoryProductionArchiveTree(stageRoot),
    ));
    const compress = (filename) => compressProductionArchive({
      repositoryRoot: process.cwd(), stageRoot, archivePath: path.join(archiveRoot, filename),
    });
    const first = compress("first.tar.gz");
    const tar = gunzipSync(readFileSync(first.archivePath));
    const entries = [];
    for (let offset = 0; offset < tar.length && tar[offset] !== 0;) {
      const header = tar.subarray(offset, offset + 512);
      const field = (start, length) => header.subarray(start, start + length)
        .toString("utf8").replace(/\0.*$/s, "").trim();
      const name = field(0, 100);
      const size = Number.parseInt(field(124, 12), 8);
      const type = field(156, 1);
      assert.equal(Number.parseInt(field(108, 8), 8), 0, `${name}: uid`);
      assert.equal(Number.parseInt(field(116, 8), 8), 0, `${name}: gid`);
      assert.equal(field(265, 32), "root", `${name}: uname`);
      assert.equal(field(297, 32), "root", `${name}: gname`);
      assert.equal(Number.parseInt(field(136, 12), 8), 0, `${name}: mtime`);
      if (type === "2") {
        assert.equal(name, "link");
        assert.equal(field(157, 100), "a.txt");
      } else {
        assert.ok(type === "0" || type === "", `${name}: regular file`);
        assert.equal(Number.parseInt(field(100, 8), 8), 0o644, `${name}: mode`);
        assert.deepEqual(tar.subarray(offset + 512, offset + 512 + size),
          readFileSync(path.join(stageRoot, name)), `${name}: payload`);
      }
      entries.push(name);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    assert.deepEqual(entries, [".certification/archive-inventory.json", "a.txt", "link", "z.txt"]);
    chmodSync(path.join(stageRoot, "a.txt"), 0o600);
    utimesSync(path.join(stageRoot, "a.txt"), new Date(), new Date());
    lutimesSync(path.join(stageRoot, "link"), new Date(), new Date());
    const repeated = compress("repeat.tar.gz");
    assert.equal(repeated.archiveSha256, first.archiveSha256);
    assert.deepEqual(readFileSync(repeated.archivePath), readFileSync(first.archivePath));
    assert.throws(() => compress("first.tar.gz"), /archive target must be absent/);
  } finally {
    if (previousEvidenceRoot === undefined) delete process.env.CERTIFICATION_EVIDENCE_ROOT;
    else process.env.CERTIFICATION_EVIDENCE_ROOT = previousEvidenceRoot;
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("Production trace/archive policy tests passed.");
