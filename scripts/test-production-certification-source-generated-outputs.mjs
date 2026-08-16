import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  canonicalJsonBytes,
  harnessSourceIdentity,
  sha256Bytes,
  validateSourceGeneratedOutputContractValue,
} from "./production-certification-contract.mjs";
import {
  installCertificationWorktreeDependencies,
  measureCertificationWorktreeDependencies,
  readAndValidateCertificationDependencyBindingEvidence,
} from "./production-certification-dependencies.mjs";
import {
  SourceGeneratedOutputLifecycle,
  SourceGeneratedOutputLifecycleError,
  validateSourceGeneratedOutputAggregate,
} from "./production-certification-source-generated-outputs.mjs";
import {
  sourceValidationStageEvidence,
  validateSourceValidationEvidence,
} from "./production-certification-source-continuity.mjs";
import {
  bindCertificationWorktreeDependencies,
  certificationStateSha256,
  completeCertificationStage,
  createCertificationState,
  startCertificationStage,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  createCertificationStageWorktrees,
  resolveCertificationStageWorktree,
  sourceValidationWorktreeOutputState,
} from "./production-certification-worktrees.mjs";

const repositoryRoot = process.cwd();
const fixedBefore = "2026-08-16T04:00:00.000Z";
const fixedAfter = "2026-08-16T04:00:01.000Z";
const inventoryDomain =
  "interior-ai.production-certification-source-generated-output-inventory-seal.v1\n";
const evidenceDomain =
  "interior-ai.production-certification-source-generated-output-evidence-seal.v1\n";
const aggregateDomain =
  "interior-ai.production-certification-source-generated-output-aggregate-seal.v1\n";

function resealGeneratedOutputEvidence(evidence) {
  const payload = structuredClone(evidence);
  delete payload.aggregateEvidenceSha256;
  evidence.aggregateEvidenceSha256 = sha256Bytes(
    Buffer.concat([Buffer.from(evidenceDomain), canonicalJsonBytes(payload)]),
  );
}

function rewriteGeneratedOutputEvidence(testFixture, aggregate, mutate) {
  const summary = aggregate.generatedOutputEvidence[0];
  const evidencePath = path.join(testFixture.evidenceRoot, summary.evidence.path);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  mutate(evidence);
  resealGeneratedOutputEvidence(evidence);
  const bytes = canonicalJsonBytes(evidence);
  writeFileSync(evidencePath, bytes);
  summary.evidence.sha256 = sha256Bytes(bytes);
  summary.aggregateEvidenceSha256 = evidence.aggregateEvidenceSha256;
  aggregate.aggregateGeneratedOutputEvidenceSha256 = sha256Bytes(
    Buffer.concat([
      Buffer.from(aggregateDomain),
      canonicalJsonBytes(aggregate.generatedOutputEvidence),
    ]),
  );
}

function runGit(root, args) {
  const child = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (child.status !== 0) {
    throw new Error(String(child.stderr || child.stdout).trim());
  }
  return child.stdout.trim();
}

function write(root, relativePath, bytes) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
}

function fixture({ mutateContract = null } = {}) {
  const owner = mkdtempSync(path.join(tmpdir(), "source-generated-output-test-"));
  const sourceRoot = path.join(owner, "source");
  const canonicalRoot = path.join(owner, "canonical");
  const evidenceRoot = path.join(owner, "evidence");
  for (const directory of [sourceRoot, canonicalRoot, evidenceRoot]) {
    mkdirSync(directory, { recursive: true });
  }
  for (const relativePath of [
    "docs/qa/production-certification-contract.v1.json",
    "docs/qa/production-certification-stage-environment.v2.json",
  ]) {
    const destination = path.join(sourceRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(repositoryRoot, relativePath), destination);
  }
  const generatedContract = JSON.parse(
    readFileSync(
      path.join(
        repositoryRoot,
        "docs/qa/production-certification-source-generated-outputs.v1.json",
      ),
      "utf8",
    ),
  );
  mutateContract?.(generatedContract);
  write(
    sourceRoot,
    "docs/qa/production-certification-source-generated-outputs.v1.json",
    canonicalJsonBytes(generatedContract),
  );
  for (const relativePath of generatedContract.outputs[0].inventoryPolicy
    .producerSourcePaths) {
    write(sourceRoot, relativePath, `fixture producer source: ${relativePath}\n`);
  }
  write(
    sourceRoot,
    ".gitignore",
    "/node_modules/\n/.next*/\n*.tsbuildinfo\n",
  );
  runGit(sourceRoot, ["init", "-q"]);
  runGit(sourceRoot, ["config", "user.email", "certification@example.invalid"]);
  runGit(sourceRoot, ["config", "user.name", "Certification Fixture"]);
  runGit(sourceRoot, ["add", "."]);
  runGit(sourceRoot, ["commit", "-qm", "fixture"]);
  const commitSha = runGit(sourceRoot, ["rev-parse", "HEAD"]);
  const treeSha = runGit(sourceRoot, ["rev-parse", "HEAD^{tree}"]);
  write(sourceRoot, "node_modules/simulation-fixture/index.js", "module.exports = true;\n");
  const certificationId = "source-generated-output-test";
  const dependencyIdentitySha256 = "d".repeat(64);
  const worktreeIdentity = {
    role: "source-validation",
    certificationId,
    candidateCommitSha: commitSha,
    candidateTreeSha: treeSha,
    gitCommonDirSha256: "1".repeat(64),
    gitCommonDirFilesystemIdentitySha256: "2".repeat(64),
    privateRealpathSha256: sha256Bytes(realpathSync(sourceRoot)),
    filesystemIdentitySha256: "3".repeat(64),
    cleanStateSha256: "4".repeat(64),
    ignoredPathInventory: { count: 1, sha256: "5".repeat(64) },
    dependencyIdentitySha256,
  };
  const state = {
    version: 3,
    certificationId,
    candidate: {
      id: "source-generated-output-candidate",
      commitSha,
      treeSha,
      parentSha: "0".repeat(40),
    },
    stages: {
      "source-validation": { attempts: [{ number: 1, id: "source-validation:001" }] },
    },
    worktrees: {
      roles: {
        "source-validation": { dependencyIdentitySha256 },
      },
    },
  };
  const lifecycle = new SourceGeneratedOutputLifecycle({
    repositoryRoot: sourceRoot,
    canonicalRoot,
    evidenceRoot,
    evidenceRelativeRoot: "source-validation/attempt-001",
    state,
    worktreeIdentity,
  });
  return {
    owner,
    sourceRoot,
    canonicalRoot,
    evidenceRoot,
    state,
    worktreeIdentity,
    lifecycle,
    contract: generatedContract,
  };
}

function floorOutput(testFixture) {
  return testFixture.contract.outputs.find(
    (entry) => entry.id === "floor-plan-upload-browser-fixture",
  );
}

function writeFloorOutput(testFixture, { extraFile = null, symlinkDescendant = false } = {}) {
  const output = floorOutput(testFixture);
  const outputRoot = path.join(
    testFixture.sourceRoot,
    ...output.relativePath.split("/"),
  );
  mkdirSync(outputRoot, { recursive: true });
  for (const name of ["612.chunk.js", "901.chunk.js", "bundle.js", "empty-entry.js"]) {
    writeFileSync(path.join(outputRoot, name), `floor output: ${name}\n`);
  }
  const manifestNames = ["612.chunk.js", "901.chunk.js", "bundle.js", "empty-entry.js"];
  const files = manifestNames.sort().map((name) => {
    const bytes = readFileSync(path.join(outputRoot, name));
    return { path: name, size: bytes.byteLength, sha256: sha256Bytes(bytes) };
  });
  const closedInventory = files.map((file) => ({
    path: `${output.relativePath}/${file.path}`,
    type: "file",
    size: file.size,
    sha256: file.sha256,
  }));
  const manifest = {
    schema: output.inventoryPolicy.schema,
    outputPath: output.relativePath,
    files,
    producerSources: output.inventoryPolicy.producerSourcePaths.map(
      (relativePath) => ({
        path: relativePath,
        sha256: sha256Bytes(
          readFileSync(path.join(testFixture.sourceRoot, relativePath)),
        ),
      }),
    ),
    inventorySha256: sha256Bytes(
      Buffer.concat([Buffer.from(inventoryDomain), canonicalJsonBytes(closedInventory)]),
    ),
  };
  if (extraFile) writeFileSync(path.join(outputRoot, extraFile), "undeclared extra\n");
  if (symlinkDescendant) {
    symlinkSync(path.join(outputRoot, "bundle.js"), path.join(outputRoot, "linked.js"));
  }
  const stdoutPath = path.join(testFixture.evidenceRoot, "floor-stdout.log");
  writeFileSync(
    stdoutPath,
    `${output.inventoryPolicy.stdoutPrefix}${JSON.stringify(manifest)}\n`,
  );
  return { output, outputRoot, stdoutPath };
}

function writeTypeScriptOutput(testFixture, value = "typescript build info\n") {
  const output = testFixture.contract.outputs.find(
    (entry) => entry.id === "typescript-build-info",
  );
  const absolutePath = path.join(testFixture.sourceRoot, output.relativePath);
  writeFileSync(absolutePath, value);
  const stdoutPath = path.join(testFixture.evidenceRoot, "typecheck-stdout.log");
  writeFileSync(stdoutPath, "typecheck passed\n");
  return { output, absolutePath, stdoutPath };
}

function aggregate(testFixture, summary) {
  return {
    stageWorktree: {
      identitySha256: sha256Bytes(canonicalJsonBytes(testFixture.worktreeIdentity)),
      privateRealpathSha256: testFixture.worktreeIdentity.privateRealpathSha256,
    },
    generatedOutputContract: summary.contract,
    declaredGeneratedOutputIds: summary.declaredOutputIds,
    generatedOutputEvidence: summary.evidenceEntries,
    aggregateGeneratedOutputEvidenceSha256:
      summary.aggregateGeneratedOutputEvidenceSha256,
    terminalWorktree: summary.terminalWorktree,
  };
}

function completePositive(testFixture) {
  const floorId = "floor-plan-upload-static-owner";
  testFixture.lifecycle.beforeCheck(floorId, fixedBefore);
  const floor = writeFloorOutput(testFixture);
  const floorResult = testFixture.lifecycle.afterCheck({
    checkId: floorId,
    observedAt: fixedAfter,
    stdoutPath: floor.stdoutPath,
    commandSucceeded: true,
  });
  assert.equal(floorResult.passed, true);
  assert.equal(existsSync(floor.outputRoot), false);

  const typecheckId = "typescript-typecheck";
  testFixture.lifecycle.beforeCheck(typecheckId, fixedBefore);
  const typescript = writeTypeScriptOutput(testFixture);
  const typecheckResult = testFixture.lifecycle.afterCheck({
    checkId: typecheckId,
    observedAt: fixedAfter,
    stdoutPath: typescript.stdoutPath,
    commandSucceeded: true,
  });
  assert.equal(typecheckResult.passed, true);
  assert.equal(existsSync(typescript.absolutePath), false);
  const summary = testFixture.lifecycle.finalize();
  const value = aggregate(testFixture, summary);
  const validation = validateSourceGeneratedOutputAggregate({
    aggregate: value,
    evidenceRoot: testFixture.evidenceRoot,
    state: testFixture.state,
    repositoryRoot: testFixture.sourceRoot,
  });
  assert.deepEqual(validation.issues, []);
  return { summary, aggregate: value };
}

function expectLifecycleFailure(action, pattern) {
  assert.throws(
    action,
    (error) =>
      error instanceof SourceGeneratedOutputLifecycleError && pattern.test(error.message),
  );
}

function copyCurrentTrackedSource(destination) {
  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (tracked.status !== 0) throw new Error("unable to enumerate tracked real-runner source");
  const developmentAdditions = [
    "docs/qa/production-certification-source-generated-outputs.v1.json",
    "scripts/production-certification-resource-evidence.mjs",
    "scripts/production-certification-resource-plan.mjs",
    "scripts/production-certification-resources.mjs",
    "scripts/production-certification-source-generated-outputs.mjs",
    "scripts/test-production-certification-resources.mjs",
    "scripts/test-production-certification-source-generated-outputs.mjs",
  ];
  const paths = new Set([
    ...tracked.stdout.split("\0").filter(Boolean),
    ...developmentAdditions.filter((relativePath) =>
      existsSync(path.join(repositoryRoot, relativePath)),
    ),
  ]);
  for (const relativePath of paths) {
    const source = path.join(repositoryRoot, relativePath);
    const target = path.join(destination, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { dereference: false });
  }
}

function runCanonical(root, command, args) {
  const child = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.status !== 0 || child.signal || child.error) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${String(child.stderr || child.stdout).trim()}`,
    );
  }
  return child;
}

function dependencyRevalidation({ evidenceRoot, state, repositoryRoot, boundary }) {
  const binding = state.worktrees.roles["source-validation"];
  const retained = readAndValidateCertificationDependencyBindingEvidence({
    evidenceRoot,
    descriptor: binding.dependencyBindingEvidence,
    state,
    role: "source-validation",
    repositoryRoot,
    remeasure: true,
  });
  assert.deepEqual(retained.validation.issues, []);
  const evidence = retained.evidence;
  return {
    role: "source-validation",
    boundary,
    dependencyIdentitySha256: evidence.dependencyIdentitySha256,
    bindingEvidenceSha256: binding.dependencyBindingEvidence.sha256,
    packageLockSha256: evidence.packageLockSha256,
    packageManifestSha256: evidence.packageManifestSha256,
    nodeModulesRootIdentitySha256:
      evidence.physicalNodeModulesProof.nodeModulesRootIdentitySha256,
    nodeModulesFilesystemIdentitySha256:
      evidence.physicalNodeModulesProof.nodeModulesFilesystemIdentitySha256,
    dependencyInventorySha256: evidence.dependencyInventory.sha256,
    topLevelPackageResolutionSha256:
      evidence.topLevelPackageResolutionProof.sha256,
    nodeSearchPathProofSha256: evidence.nodeSearchPathProof.sha256,
    isolationPassed: evidence.isolation.passed === true,
    equalToBoundIdentity:
      evidence.dependencyIdentitySha256 === binding.dependencyIdentitySha256,
  };
}

function runCorrectedRealRunnerRegression() {
  const owner = mkdtempSync(path.join(tmpdir(), "source-generated-real-runner-"));
  const canonicalRoot = path.join(owner, "canonical");
  const evidenceRoot = path.join(owner, "evidence");
  const worktreeRoot = path.join(owner, "worktrees");
  for (const directory of [canonicalRoot, evidenceRoot, worktreeRoot]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  try {
    copyCurrentTrackedSource(canonicalRoot);
    runGit(canonicalRoot, ["init", "-q"]);
    runGit(canonicalRoot, ["config", "user.email", "certification@example.invalid"]);
    runGit(canonicalRoot, ["config", "user.name", "Certification Real Runner"]);
    runGit(canonicalRoot, ["add", "."]);
    runGit(canonicalRoot, ["commit", "-qm", "real runner parent fixture"]);
    const parentSha = runGit(canonicalRoot, ["rev-parse", "HEAD"]);
    runGit(canonicalRoot, [
      "commit",
      "--allow-empty",
      "-qm",
      "real runner candidate fixture",
    ]);
    const candidate = {
      id: "source-generated-real-runner-candidate",
      commitSha: runGit(canonicalRoot, ["rev-parse", "HEAD"]),
      treeSha: runGit(canonicalRoot, ["rev-parse", "HEAD^{tree}"]),
      parentSha,
    };
    const certificationId = "source-generated-real-runner";
    const worktrees = createCertificationStageWorktrees({
      canonicalRoot,
      evidenceRoot,
      worktreeRoot,
      certificationId,
      candidate,
      createdAt: "2026-08-16T05:00:00.000Z",
    });
    let state = createCertificationState({
      certificationId,
      candidateId: candidate.id,
      commitSha: candidate.commitSha,
      treeSha: candidate.treeSha,
      parentSha: candidate.parentSha,
      harnessSourceSha256: harnessSourceIdentity(canonicalRoot).sha256,
      executionClass: "real-candidate",
      createdAt: "2026-08-16T05:00:00.000Z",
      worktrees,
    });
    state = startCertificationStage(state, {
      stage: "doctor",
      startedAt: "2026-08-16T05:00:00.100Z",
    });
    const doctorPath = "doctor/attempt-001.json";
    const doctorBytes = canonicalJsonBytes({
      schema: "interior-ai.production-certification-doctor-real-runner-fixture.v1",
      valid: true,
    });
    write(evidenceRoot, doctorPath, doctorBytes);
    const doctorDescriptor = { path: doctorPath, sha256: sha256Bytes(doctorBytes) };
    state = completeCertificationStage(state, {
      stage: "doctor",
      passed: true,
      completedAt: "2026-08-16T05:00:00.200Z",
      exitCode: 0,
      outputHashes: { doctor: doctorDescriptor.sha256 },
      evidenceFiles: { doctor: doctorDescriptor },
    });
    state = startCertificationStage(state, {
      stage: "source-validation",
      startedAt: "2026-08-16T05:00:01.000Z",
    });
    const statePath = path.join(evidenceRoot, "certification-state.json");
    writeCertificationState(statePath, state, { requireAbsent: true });
    const pristineSource = resolveCertificationStageWorktree({
      state,
      evidenceRoot,
      canonicalRoot,
      role: "source-validation",
      phase: "pristine",
    });
    const installationTimes = [
      "2026-08-16T05:00:01.100Z",
      "2026-08-16T05:00:01.200Z",
    ];
    const installation = installCertificationWorktreeDependencies({
      repositoryRoot: pristineSource.root,
      evidenceRoot,
      state,
      role: "source-validation",
      environment: process.env,
      attemptNumber: 1,
      now: () => installationTimes.shift(),
      dispatch: () =>
        spawnSync(
          "cp",
          ["-cR", path.join(repositoryRoot, "node_modules"), pristineSource.root],
          { encoding: "utf8" },
        ),
    });
    assert.equal(installation.passed, true);
    const transition = bindCertificationWorktreeDependencies({
      statePath,
      expectedCurrentSha256: certificationStateSha256(state),
      evidenceRoot,
      canonicalRoot,
      role: "source-validation",
      dependencyBindingEvidence: installation.bindingEvidenceDescriptor,
    });
    state = transition.state;
    assert.equal(transition.stateSha256, certificationStateSha256(state));
    const sourceWorktree = resolveCertificationStageWorktree({
      state,
      evidenceRoot,
      canonicalRoot,
      role: "source-validation",
      phase: "active",
    });
    const sourceResult = sourceValidationStageEvidence({
      repositoryRoot: sourceWorktree.root,
      canonicalRoot,
      evidenceRoot,
      state,
      environment: {
        ...process.env,
        DATABASE_URL:
          "postgresql://certification:certification@127.0.0.1:1/certification",
        FLOOR_PLAN_LOCAL_OCR_DISABLED: "1",
        FLOOR_PLAN_VISION_DISABLED: "1",
        FLOOR_PLAN_VISION_ENABLED: "0",
      },
      worktreeIdentity: sourceWorktree.portable,
      dependencyBindingStateSha256: certificationStateSha256(state),
      dependencyRevalidate: (boundary) =>
        dependencyRevalidation({
          evidenceRoot,
          state,
          repositoryRoot: sourceWorktree.root,
          boundary,
        }),
    });
    assert.equal(sourceResult.passed, true);
    assert.equal(sourceResult.evidence.checks.length, 19);
    assert.deepEqual(
      sourceResult.evidence.generatedOutputEvidence.map((entry) => entry.outputId),
      ["floor-plan-upload-browser-fixture", "typescript-build-info"],
    );
    const floorEvidence = JSON.parse(
      readFileSync(
        path.join(
          evidenceRoot,
          sourceResult.evidence.generatedOutputEvidence[0].evidence.path,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      floorEvidence.closedRelativeInventory.map((entry) => entry.path),
      [
        ".next/cache/floor-plan-upload-browser-fixture/612.chunk.js",
        ".next/cache/floor-plan-upload-browser-fixture/901.chunk.js",
        ".next/cache/floor-plan-upload-browser-fixture/bundle.js",
        ".next/cache/floor-plan-upload-browser-fixture/empty-entry.js",
      ],
    );
    assert.deepEqual(
      validateSourceValidationEvidence({
        evidence: sourceResult.evidence,
        evidenceRoot,
        state,
        repositoryRoot: sourceWorktree.root,
      }).issues,
      [],
    );
    const completedAt = new Date(Date.now() + 1_000).toISOString();
    const completedState = completeCertificationStage(state, {
      stage: "source-validation",
      passed: true,
      completedAt,
      exitCode: 0,
      consumedSubstantiveGate: true,
      outputHashes: { sourceValidation: sourceResult.descriptor.sha256 },
      evidenceFiles: { "source-validation": sourceResult.descriptor },
    });
    assert.deepEqual(
      validateSourceValidationEvidence({
        evidence: sourceResult.evidence,
        evidenceRoot,
        state: completedState,
        repositoryRoot: sourceWorktree.root,
      }).issues,
      [],
    );
    const stateValidation = validateCertificationState({
      state: completedState,
      evidenceRoot,
      expectedCandidate: completedState.candidate,
      expectedHarnessSourceSha256: completedState.harness.sourceSha256,
      repositoryRoot: canonicalRoot,
      sourceValidationRoot: sourceWorktree.root,
    });
    assert.deepEqual(stateValidation.issues, []);
    const dependencyAfter = measureCertificationWorktreeDependencies({
      repositoryRoot: sourceWorktree.root,
    });
    assert.equal(
      dependencyAfter.identitySha256,
      state.worktrees.roles["source-validation"].dependencyIdentitySha256,
    );
    const terminal = sourceValidationWorktreeOutputState({
      repositoryRoot: sourceWorktree.root,
    });
    assert.equal(terminal.valid, true);
    assert.deepEqual(terminal.undeclaredIgnoredPaths, []);
    assert.equal(terminal.declaredGeneratedInventory.count, 0);
    console.log(
      "Corrected 19-check real source-validation generated-output regression passed.",
    );
  } finally {
    rmSync(owner, { recursive: true, force: true });
  }
}

function runRealProducerRegression() {
  const owner = mkdtempSync(path.join(tmpdir(), "source-generated-real-producers-"));
  const sourceRoot = path.join(owner, "source-validation");
  const canonicalRoot = path.join(owner, "canonical");
  const evidenceRoot = path.join(owner, "evidence");
  for (const directory of [sourceRoot, canonicalRoot, evidenceRoot]) {
    mkdirSync(directory, { recursive: true });
  }
  copyCurrentTrackedSource(sourceRoot);
  runGit(sourceRoot, ["init", "-q"]);
  runGit(sourceRoot, ["config", "user.email", "certification@example.invalid"]);
  runGit(sourceRoot, ["config", "user.name", "Certification Real Producer"]);
  runGit(sourceRoot, ["add", "."]);
  runGit(sourceRoot, ["commit", "-qm", "real producer fixture"]);
  runCanonical(owner, "cp", ["-cR", path.join(repositoryRoot, "node_modules"), sourceRoot]);
  const dependencyBefore = measureCertificationWorktreeDependencies({
    repositoryRoot: sourceRoot,
  });
  const floorLegacy = runCanonical(
    sourceRoot,
    "npm",
    ["run", "test:floor-plan-upload-accessibility-static"],
  );
  const typecheckLegacy = runCanonical(sourceRoot, "npm", ["run", "typecheck"]);
  assert.equal(floorLegacy.status, 0);
  assert.equal(typecheckLegacy.status, 0);
  const legacyState = sourceValidationWorktreeOutputState({ repositoryRoot: sourceRoot });
  const exactFailedPaths = [
    ".next/cache/floor-plan-upload-browser-fixture/612.chunk.js",
    ".next/cache/floor-plan-upload-browser-fixture/901.chunk.js",
    ".next/cache/floor-plan-upload-browser-fixture/bundle.js",
    ".next/cache/floor-plan-upload-browser-fixture/empty-entry.js",
    "tsconfig.tsbuildinfo",
  ];
  assert.deepEqual(legacyState.undeclaredIgnoredPaths, exactFailedPaths);
  assert.equal(legacyState.valid, false);

  for (const relativePath of exactFailedPaths.slice(0, 4)) {
    const absolutePath = path.join(sourceRoot, relativePath);
    const metadata = lstatSync(absolutePath);
    assert.equal(metadata.isFile() && !metadata.isSymbolicLink(), true);
    unlinkSync(absolutePath);
  }
  rmdirSync(
    path.join(sourceRoot, ".next/cache/floor-plan-upload-browser-fixture"),
  );
  const buildInfoPath = path.join(sourceRoot, "tsconfig.tsbuildinfo");
  const buildInfoMetadata = lstatSync(buildInfoPath);
  assert.equal(buildInfoMetadata.isFile() && !buildInfoMetadata.isSymbolicLink(), true);
  unlinkSync(buildInfoPath);

  const commitSha = runGit(sourceRoot, ["rev-parse", "HEAD"]);
  const treeSha = runGit(sourceRoot, ["rev-parse", "HEAD^{tree}"]);
  const dependencyIdentitySha256 = dependencyBefore.identitySha256;
  const worktreeIdentity = {
    role: "source-validation",
    certificationId: "source-generated-real-producers",
    candidateCommitSha: commitSha,
    candidateTreeSha: treeSha,
    gitCommonDirSha256: "1".repeat(64),
    gitCommonDirFilesystemIdentitySha256: "2".repeat(64),
    privateRealpathSha256: sha256Bytes(realpathSync(sourceRoot)),
    filesystemIdentitySha256: "3".repeat(64),
    cleanStateSha256: "4".repeat(64),
    ignoredPathInventory: legacyState.persistentIgnoredInventory,
    dependencyIdentitySha256,
  };
  const state = {
    version: 3,
    certificationId: worktreeIdentity.certificationId,
    candidate: {
      id: "source-generated-real-producers-candidate",
      commitSha,
      treeSha,
      parentSha: "0".repeat(40),
    },
    stages: {
      "source-validation": { attempts: [{ number: 1, id: "source-validation:001" }] },
    },
    worktrees: {
      roles: { "source-validation": { dependencyIdentitySha256 } },
    },
  };
  const lifecycle = new SourceGeneratedOutputLifecycle({
    repositoryRoot: sourceRoot,
    canonicalRoot,
    evidenceRoot,
    evidenceRelativeRoot: "source-validation/attempt-001",
    state,
    worktreeIdentity,
  });
  lifecycle.beforeCheck("floor-plan-upload-static-owner", fixedBefore);
  const floorCorrected = runCanonical(
    sourceRoot,
    "npm",
    ["run", "test:floor-plan-upload-accessibility-static"],
  );
  const floorStdout = path.join(evidenceRoot, "real-floor-stdout.log");
  writeFileSync(floorStdout, floorCorrected.stdout);
  assert.equal(
    lifecycle.afterCheck({
      checkId: "floor-plan-upload-static-owner",
      observedAt: fixedAfter,
      stdoutPath: floorStdout,
      commandSucceeded: true,
    }).passed,
    true,
  );
  lifecycle.beforeCheck("typescript-typecheck", fixedBefore);
  const typecheckCorrected = runCanonical(sourceRoot, "npm", ["run", "typecheck"]);
  const typecheckStdout = path.join(evidenceRoot, "real-typecheck-stdout.log");
  writeFileSync(typecheckStdout, typecheckCorrected.stdout);
  assert.equal(
    lifecycle.afterCheck({
      checkId: "typescript-typecheck",
      observedAt: fixedAfter,
      stdoutPath: typecheckStdout,
      commandSucceeded: true,
    }).passed,
    true,
  );
  const summary = lifecycle.finalize();
  const dependencyAfter = measureCertificationWorktreeDependencies({
    repositoryRoot: sourceRoot,
  });
  assert.equal(dependencyAfter.identitySha256, dependencyBefore.identitySha256);
  assert.deepEqual(
    sourceValidationWorktreeOutputState({ repositoryRoot: sourceRoot })
      .undeclaredIgnoredPaths,
    [],
  );
  assert.equal(summary.evidenceEntries.length, 2);
  rmSync(owner, { recursive: true, force: true });
  console.log(
    "Exact five-output real Floor Plan/TypeScript producer regression passed.",
  );
  runCorrectedRealRunnerRegression();
}

// A. Correct production, sealing, exact cleanup, and terminal node_modules-only state.
{
  const testFixture = fixture();
  const completed = completePositive(testFixture);
  assert.equal(completed.summary.evidenceEntries.length, 2);
  assert.deepEqual(completed.summary.declaredOutputIds, [
    "floor-plan-upload-browser-fixture",
    "typescript-build-info",
  ]);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// B/Q. A declared output present before its owner is prohibited.
for (const outputId of ["floor", "typescript"]) {
  const testFixture = fixture();
  if (outputId === "floor") writeFloorOutput(testFixture);
  else writeTypeScriptOutput(testFixture);
  expectLifecycleFailure(
    () =>
      testFixture.lifecycle.beforeCheck(
        outputId === "floor"
          ? "floor-plan-upload-static-owner"
          : "typescript-typecheck",
        fixedBefore,
      ),
    /existed before|undeclared ignored/,
  );
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// C/D/N/O. Undeclared and wrong-owner ignored output fails closed.
for (const relativePath of [
  ".next/cache/unrelated.js",
  ".next/cache/floor-plan-upload-browser-fixture/bundle.js",
]) {
  const testFixture = fixture();
  write(testFixture.sourceRoot, relativePath, "wrong owner\n");
  expectLifecycleFailure(
    () =>
      testFixture.lifecycle.beforeCheck("production-artifact-evidence-contracts", fixedBefore),
    /undeclared ignored output/,
  );
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// E. A successful owner command that omits its required output is rejected.
{
  const testFixture = fixture();
  testFixture.lifecycle.beforeCheck("typescript-typecheck", fixedBefore);
  const stdoutPath = path.join(testFixture.evidenceRoot, "missing.log");
  writeFileSync(stdoutPath, "typecheck claimed success\n");
  const result = testFixture.lifecycle.afterCheck({
    checkId: "typescript-typecheck",
    observedAt: fixedAfter,
    stdoutPath,
    commandSucceeded: true,
  });
  assert.equal(result.passed, false);
  assert.match(result.issues.join("\n"), /required generated output is missing/);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// F. A retained output changed before its permitted consumer is rejected.
{
  const testFixture = fixture({
    mutateContract(value) {
      const output = value.outputs[0];
      output.permittedConsumerCheckIds = ["telemetry-bootstrap-contracts"];
      output.retentionLifetime.lastConsumerCheckId = "telemetry-bootstrap-contracts";
      output.cleanupOwnerCheckId = "telemetry-bootstrap-contracts";
      output.cleanupDeadline.checkId = "telemetry-bootstrap-contracts";
    },
  });
  testFixture.lifecycle.beforeCheck("floor-plan-upload-static-owner", fixedBefore);
  const floor = writeFloorOutput(testFixture);
  assert.equal(
    testFixture.lifecycle.afterCheck({
      checkId: "floor-plan-upload-static-owner",
      observedAt: fixedAfter,
      stdoutPath: floor.stdoutPath,
      commandSucceeded: true,
    }).passed,
    true,
  );
  writeFileSync(path.join(floor.outputRoot, "bundle.js"), "mutated before consumer\n");
  expectLifecycleFailure(
    () =>
      testFixture.lifecycle.beforeCheck("telemetry-bootstrap-contracts", fixedBefore),
    /drifted before check/,
  );
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// G/T. Mutation after the consumer but before cleanup blocks exact removal.
{
  const testFixture = fixture();
  testFixture.lifecycle.beforeCheck("floor-plan-upload-static-owner", fixedBefore);
  const floor = writeFloorOutput(testFixture);
  const result = testFixture.lifecycle.afterCheck({
    checkId: "floor-plan-upload-static-owner",
    observedAt: fixedAfter,
    stdoutPath: floor.stdoutPath,
    commandSucceeded: true,
    beforeCleanup() {
      writeFileSync(path.join(floor.outputRoot, "bundle.js"), "changed hash\n");
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.issues.join("\n"), /changed before cleanup/);
  assert.equal(existsSync(floor.outputRoot), true);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// H. A retained output that crosses its cleanup deadline is rejected.
{
  const testFixture = fixture({
    mutateContract(value) {
      const output = value.outputs[0];
      output.permittedConsumerCheckIds = ["telemetry-bootstrap-contracts"];
      output.retentionLifetime.lastConsumerCheckId = "telemetry-bootstrap-contracts";
      output.cleanupOwnerCheckId = "telemetry-bootstrap-contracts";
      output.cleanupDeadline.checkId = "telemetry-bootstrap-contracts";
    },
  });
  testFixture.lifecycle.beforeCheck("floor-plan-upload-static-owner", fixedBefore);
  const floor = writeFloorOutput(testFixture);
  testFixture.lifecycle.afterCheck({
    checkId: "floor-plan-upload-static-owner",
    observedAt: fixedAfter,
    stdoutPath: floor.stdoutPath,
    commandSucceeded: true,
  });
  testFixture.lifecycle.beforeCheck("telemetry-bootstrap-contracts", fixedBefore);
  expectLifecycleFailure(
    () => testFixture.lifecycle.beforeCheck("critical-required", fixedAfter),
    /survived its cleanup deadline/,
  );
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// I/J/W/X/Z. Tamper, missing cleanup, certification/role swap, and dependency drift reject.
for (const kind of [
  "bytes-tamper",
  "cleanup-marker",
  "certification-swap",
  "role-swap",
  "dependency-drift",
]) {
  const testFixture = fixture();
  const completed = completePositive(testFixture);
  const value = structuredClone(completed.aggregate);
  const descriptor = value.generatedOutputEvidence[0].evidence;
  if (kind === "bytes-tamper" || kind === "cleanup-marker") {
    const evidencePath = path.join(testFixture.evidenceRoot, descriptor.path);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    if (kind === "bytes-tamper") evidence.closedRelativeInventory[0].size += 1;
    else delete evidence.cleanupEvent;
    writeFileSync(evidencePath, canonicalJsonBytes(evidence));
  } else if (kind === "certification-swap") {
    testFixture.state.certificationId = "another-certification";
  } else if (kind === "role-swap") {
    value.stageWorktree.identitySha256 = "f".repeat(64);
  } else {
    testFixture.state.worktrees.roles[
      "source-validation"
    ].dependencyIdentitySha256 = "e".repeat(64);
  }
  const validation = validateSourceGeneratedOutputAggregate({
    aggregate: value,
    evidenceRoot: testFixture.evidenceRoot,
    state: testFixture.state,
    repositoryRoot: testFixture.sourceRoot,
  });
  assert.equal(validation.valid, false, `${kind} must be rejected`);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// Recomputed public seals cannot make false consumer or nested lifecycle claims valid.
for (const kind of ["consumer-observation", "nested-lifecycle-shape"]) {
  const testFixture = fixture();
  const completed = completePositive(testFixture);
  const value = structuredClone(completed.aggregate);
  rewriteGeneratedOutputEvidence(testFixture, value, (evidence) => {
    if (kind === "consumer-observation") {
      evidence.consumerObservations = [
        {
          checkId: "floor-plan-upload-static-owner",
          observedAt: fixedAfter,
          aggregateInventorySha256: evidence.aggregateInventorySha256,
        },
      ];
    } else {
      evidence.cleanupEvent.manuallyEdited = true;
    }
  });
  const validation = validateSourceGeneratedOutputAggregate({
    aggregate: value,
    evidenceRoot: testFixture.evidenceRoot,
    state: testFixture.state,
    repositoryRoot: testFixture.sourceRoot,
  });
  assert.equal(validation.valid, false, `${kind} reseal must be rejected`);
  assert.match(validation.issues.join("\n"), /consumer observation|nested lifecycle/);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// Intermediate symlinks in retained evidence descriptors are never followed.
{
  const testFixture = fixture();
  const completed = completePositive(testFixture);
  const generatedRoot = path.join(
    testFixture.evidenceRoot,
    "source-validation/attempt-001/generated-outputs",
  );
  const outsideRoot = path.join(testFixture.owner, "outside-generated-evidence");
  renameSync(generatedRoot, outsideRoot);
  symlinkSync(outsideRoot, generatedRoot, "dir");
  const validation = validateSourceGeneratedOutputAggregate({
    aggregate: completed.aggregate,
    evidenceRoot: testFixture.evidenceRoot,
    state: testFixture.state,
    repositoryRoot: testFixture.sourceRoot,
  });
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join("\n"), /physical contained file/);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// K/L/R. Symlink outputs, symlink descendants, and wrong TypeScript path types reject.
for (const kind of ["file-symlink", "directory-symlink", "descendant-symlink", "ts-directory"] ) {
  const testFixture = fixture();
  const checkId = kind === "ts-directory" ? "typescript-typecheck" : "floor-plan-upload-static-owner";
  testFixture.lifecycle.beforeCheck(checkId, fixedBefore);
  let stdoutPath;
  if (kind === "ts-directory") {
    mkdirSync(path.join(testFixture.sourceRoot, "tsconfig.tsbuildinfo"));
    stdoutPath = path.join(testFixture.evidenceRoot, "wrong-ts-type.log");
    writeFileSync(stdoutPath, "wrong type\n");
  } else if (kind === "descendant-symlink") {
    ({ stdoutPath } = writeFloorOutput(testFixture, { symlinkDescendant: true }));
  } else {
    const output = floorOutput(testFixture);
    const target = path.join(testFixture.evidenceRoot, "symlink-target");
    writeFileSync(target, "target\n");
    const outputPath = path.join(testFixture.sourceRoot, output.relativePath);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    symlinkSync(target, outputPath, kind === "directory-symlink" ? "dir" : "file");
    stdoutPath = path.join(testFixture.evidenceRoot, "symlink.log");
    writeFileSync(stdoutPath, "symlink\n");
  }
  const result = testFixture.lifecycle.afterCheck({
    checkId,
    observedAt: fixedAfter,
    stdoutPath,
    commandSucceeded: true,
  });
  assert.equal(result.passed, false, `${kind} must be rejected`);
  assert.match(result.issues.join("\n"), /symlink|regular file|non-file|physical directory/);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// M/V. Escapes, broad cache ownership, and node_modules transient ownership are invalid contracts.
for (const relativePath of ["../escape", ".next/cache", "node_modules"]) {
  const value = JSON.parse(
    readFileSync(
      path.join(
        repositoryRoot,
        "docs/qa/production-certification-source-generated-outputs.v1.json",
      ),
      "utf8",
    ),
  );
  value.outputs[0].relativePath = relativePath;
  assert.equal(validateSourceGeneratedOutputContractValue(value).valid, false);
}
{
  const value = JSON.parse(
    readFileSync(
      path.join(
        repositoryRoot,
        "docs/qa/production-certification-source-generated-outputs.v1.json",
      ),
      "utf8",
    ),
  );
  value.outputs[0].permittedConsumerCheckIds = [
    value.outputs[0].ownerCheckId,
  ];
  assert.equal(validateSourceGeneratedOutputContractValue(value).valid, false);
}

// P/S. An additional fixture file is not admitted and cleanup leaves it untouched.
{
  const testFixture = fixture();
  testFixture.lifecycle.beforeCheck("floor-plan-upload-static-owner", fixedBefore);
  const floor = writeFloorOutput(testFixture, { extraFile: "unexpected.js" });
  const result = testFixture.lifecycle.afterCheck({
    checkId: "floor-plan-upload-static-owner",
    observedAt: fixedAfter,
    stdoutPath: floor.stdoutPath,
    commandSucceeded: true,
  });
  assert.equal(result.passed, false);
  assert.match(result.issues.join("\n"), /contradicts the closed inventory|undeclared/);
  assert.equal(existsSync(path.join(floor.outputRoot, "unexpected.js")), true);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// U. The canonical checkout can never be a cleanup target.
{
  const testFixture = fixture();
  assert.throws(
    () =>
      new SourceGeneratedOutputLifecycle({
        repositoryRoot: testFixture.sourceRoot,
        canonicalRoot: testFixture.sourceRoot,
        evidenceRoot: testFixture.evidenceRoot,
        evidenceRelativeRoot: "source-validation/attempt-001",
        state: testFixture.state,
        worktreeIdentity: testFixture.worktreeIdentity,
      }),
    /disposable source-validation worktree/,
  );
  rmSync(testFixture.owner, { recursive: true, force: true });
}

// Y. Terminal ordinary-untracked contamination invalidates a previously sealed aggregate.
{
  const testFixture = fixture();
  const completed = completePositive(testFixture);
  write(testFixture.sourceRoot, "undeclared-terminal.txt", "terminal drift\n");
  const validation = validateSourceGeneratedOutputAggregate({
    aggregate: completed.aggregate,
    evidenceRoot: testFixture.evidenceRoot,
    state: testFixture.state,
    repositoryRoot: testFixture.sourceRoot,
  });
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join("\n"), /terminal worktree inventory changed/);
  rmSync(testFixture.owner, { recursive: true, force: true });
}

if (process.argv.includes("--real-producers")) {
  runRealProducerRegression();
}

console.log("Production certification source generated-output lifecycle tests passed.");
