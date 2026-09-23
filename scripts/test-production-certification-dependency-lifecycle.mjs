import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CERTIFICATION_STAGE_ORDER,
  PRODUCTION_CERTIFICATION_ATTEMPT_SCHEMA,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  bindCertificationWorktreeDependencies,
  certificationStateSha256,
  createCertificationState,
  failCertificationWorktreeDependencyInstallation,
  readCertificationState,
  sealCertificationState,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  PRODUCTION_CERTIFICATION_DEPENDENCY_BINDING_SCHEMA,
  PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA,
  certificationDependencyInstallationEnvironment,
  dependencyLifecycleIssues,
  installCertificationWorktreeDependencies,
  measureCertificationWorktreeDependencies,
  readAndValidateCertificationDependencyBindingEvidence,
  sealCertificationDependencyBindingEvidence,
  validateCertificationDependencyBindingEvidence,
} from "./production-certification-dependencies.mjs";
import {
  cleanupCertificationStageWorktrees,
  certificationWorktreeIssues,
  createCertificationStageWorktrees,
  resolveCertificationStageWorktree,
} from "./production-certification-worktrees.mjs";
import {
  classifyCertificationDependencyInstallationFailure,
} from "./production-certification-real.mjs";

function run(command, args, cwd, environment = process.env) {
  const child = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
  });
  if (child.error || child.signal || child.status !== 0) {
    throw new Error(String(child.stderr || child.stdout || child.error).trim());
  }
  return child.stdout.trim();
}

function git(cwd, args) {
  return run("git", args, cwd);
}

function write(root, relativePath, value) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value);
  return target;
}

function initializeRepository(root, { dependency = false } = {}) {
  const npmVersion = run("npm", ["--version"], root);
  const npmEnvironment = {
    ...process.env,
    NODE_OPTIONS: "",
    NODE_PATH: "",
    NPM_CONFIG_CACHE: path.join(path.dirname(root), "npm-cache"),
  };
  write(
    root,
    ".gitignore",
    "node_modules/\n.env\n.env.local\n.next/\n.local/\ntest-results/\nplaywright-report/\n",
  );
  write(
    root,
    "package.json",
    `${JSON.stringify(
      {
        name: "dependency-lifecycle-fixture",
        version: "1.0.0",
        private: true,
        packageManager: `npm@${npmVersion}`,
        ...(dependency
          ? { dependencies: { fixture: "file:fixture-1.0.0.tgz" } }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
  if (dependency) {
    write(
      root,
      "fixture-package/package.json",
      '{"name":"fixture","version":"1.0.0","main":"index.js"}\n',
    );
    write(root, "fixture-package/index.js", "module.exports = 'fixture';\n");
    run(
      "npm",
      ["pack", "./fixture-package", "--pack-destination", "."],
      root,
      npmEnvironment,
    );
  }
  run("npm", ["install", "--package-lock-only", "--ignore-scripts"], root, npmEnvironment);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Dependency lifecycle test"]);
  git(root, ["config", "user.email", "dependency-lifecycle@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture base"]);
  write(root, "candidate.txt", "candidate\n");
  git(root, ["add", "candidate.txt"]);
  git(root, ["commit", "-qm", "fixture candidate"]);
  return {
    id: "dependency-lifecycle-candidate",
    commitSha: git(root, ["rev-parse", "HEAD"]),
    treeSha: git(root, ["rev-parse", "HEAD^{tree}"]),
    parentSha: git(root, ["rev-parse", "HEAD^"]),
  };
}

function fixture(options = {}) {
  const owner = mkdtempSync(path.join(tmpdir(), "certification-dependencies-"));
  const canonicalRoot = path.join(owner, "canonical");
  const evidenceRoot = path.join(owner, "evidence");
  const worktreeRoot = path.join(owner, "worktrees");
  for (const root of [canonicalRoot, evidenceRoot, worktreeRoot]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  const candidate = initializeRepository(canonicalRoot, options);
  const certificationId = `dependency-lifecycle-${path.basename(owner).slice(-6)}`;
  const worktrees = createCertificationStageWorktrees({
    canonicalRoot,
    evidenceRoot,
    worktreeRoot,
    certificationId,
    candidate,
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const initialState = createCertificationState({
    certificationId,
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    treeSha: candidate.treeSha,
    parentSha: candidate.parentSha,
    harnessSourceSha256: "a".repeat(64),
    executionClass: "deterministic-simulation",
    createdAt: "2026-08-15T00:00:00.000Z",
    worktrees,
  });
  const state = structuredClone(initialState);
  const sourceStage = state.stages["source-validation"];
  const sourceStageIndex = CERTIFICATION_STAGE_ORDER.indexOf("source-validation");
  sourceStage.status = "running";
  sourceStage.inputFingerprint = sha256Bytes(
    canonicalJsonBytes({
      candidate: state.candidate,
      harness: state.harness,
      priorOutputs: Object.fromEntries(
        CERTIFICATION_STAGE_ORDER.slice(0, sourceStageIndex).map((stage) => [
          stage,
          state.stages[stage].outputHashes,
        ]),
      ),
    }),
  );
  sourceStage.startedAt = state.createdAt;
  sourceStage.attempts = [{
    schema: PRODUCTION_CERTIFICATION_ATTEMPT_SCHEMA,
    id: "source-validation:001",
    number: 1,
    startedAt: state.createdAt,
    completedAt: null,
    exitCode: null,
    signal: null,
    status: "running",
    failureClassification: null,
    consumedSubstantiveGate: false,
  }];
  const statePath = path.join(evidenceRoot, "state.json");
  writeCertificationState(statePath, state, { requireAbsent: true });
  const roots = Object.fromEntries(
    Object.keys(worktrees.roles).map((role) => [
      role,
      resolveCertificationStageWorktree({
        state,
        evidenceRoot,
        canonicalRoot,
        role,
        phase: "pristine",
      }).root,
    ]),
  );
  return { owner, canonicalRoot, evidenceRoot, worktreeRoot, statePath, state, roots };
}

function activateDependencyStage(fixtureValue, role) {
  if (role === "source-validation") return;
  const stageName =
    role === "final-artifact" ? "build" : "browser-owners";
  const state = readCertificationState(fixtureValue.statePath);
  if (state.stages[stageName].status === "running") return;
  const next = structuredClone(state);
  const stageIndex = CERTIFICATION_STAGE_ORDER.indexOf(stageName);
  const startedAt = new Date(Date.parse(state.updatedAt) + 1).toISOString();
  const stage = next.stages[stageName];
  stage.status = "running";
  stage.inputFingerprint = sha256Bytes(
    canonicalJsonBytes({
      candidate: next.candidate,
      harness: next.harness,
      priorOutputs: Object.fromEntries(
        CERTIFICATION_STAGE_ORDER.slice(0, stageIndex).map((name) => [
          name,
          next.stages[name].outputHashes,
        ]),
      ),
    }),
  );
  stage.startedAt = startedAt;
  stage.attempts = [{
    schema: PRODUCTION_CERTIFICATION_ATTEMPT_SCHEMA,
    id: `${stageName}:001`,
    number: 1,
    startedAt,
    completedAt: null,
    exitCode: null,
    signal: null,
    status: "running",
    failureClassification: null,
    consumedSubstantiveGate: false,
  }];
  next.updatedAt = startedAt;
  writeCertificationState(
    fixtureValue.statePath,
    sealCertificationState(next),
    { expectedCurrentSha256: certificationStateSha256(state) },
  );
}

function installEnvironment() {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  return environment;
}

function install(fixtureValue, role = "source-validation", dispatch = null) {
  activateDependencyStage(fixtureValue, role);
  const environment = installEnvironment();
  environment.NPM_CONFIG_CACHE = path.join(fixtureValue.owner, "npm-cache");
  return installCertificationWorktreeDependencies({
    repositoryRoot: fixtureValue.roots[role],
    evidenceRoot: fixtureValue.evidenceRoot,
    state: readCertificationState(fixtureValue.statePath),
    role,
    environment,
    attemptNumber: 1,
    dispatch,
  });
}

function bind(
  fixtureValue,
  installation,
  expectedCurrentSha256 = null,
  role = "source-validation",
) {
  const state = readCertificationState(fixtureValue.statePath);
  return bindCertificationWorktreeDependencies({
    statePath: fixtureValue.statePath,
    expectedCurrentSha256:
      expectedCurrentSha256 ?? certificationStateSha256(state),
    evidenceRoot: fixtureValue.evidenceRoot,
    canonicalRoot: fixtureValue.canonicalRoot,
    role,
    dependencyBindingEvidence: installation.bindingEvidenceDescriptor,
  });
}

function removeFixture(value) {
  for (const root of Object.values(value.roots)) {
    spawnSync("git", ["worktree", "remove", "--force", root], {
      cwd: value.canonicalRoot,
      encoding: "utf8",
    });
  }
  rmSync(value.owner, { recursive: true, force: true });
}

const lifecycle = fixture({ dependency: true });
try {
  const initial = readCertificationState(lifecycle.statePath);
  assert.equal(initial.version, 3);
  assert.equal(initial.worktrees.roles["source-validation"].dependencyStatus, "not-installed");
  assert.equal(initial.worktrees.roles["source-validation"].dependencyIdentitySha256, null);
  assert.equal(initial.worktrees.roles["source-validation"].dependencyBindingEvidence, null);
  assert.deepEqual(
    dependencyLifecycleIssues(initial.worktrees.roles["source-validation"]),
    [],
  );

  const installed = install(lifecycle);
  assert.equal(installed.passed, true);
  assert.equal(installed.bindingEvidence.schema, PRODUCTION_CERTIFICATION_DEPENDENCY_BINDING_SCHEMA);
  const transition = bind(lifecycle, installed);
  assert.equal(transition.mutated, true);
  const bound = readCertificationState(lifecycle.statePath);
  const binding = bound.worktrees.roles["source-validation"];
  assert.equal(binding.dependencyStatus, "installed");
  assert.equal(binding.dependencyIdentitySha256, installed.measured.identitySha256);
  assert.equal(binding.dependencyBindingEvidence.sha256, installed.bindingEvidenceDescriptor.sha256);
  assert.deepEqual(dependencyLifecycleIssues(binding), []);
  assert.equal(
    validateCertificationState({
      state: bound,
      evidenceRoot: lifecycle.evidenceRoot,
      repositoryRoot: lifecycle.canonicalRoot,
      sourceValidationRoot: lifecycle.roots["source-validation"],
      artifactRoot: lifecycle.roots["final-artifact"],
    }).valid,
    true,
  );

  const installedNull = structuredClone(binding);
  installedNull.dependencyIdentitySha256 = null;
  assert.match(dependencyLifecycleIssues(installedNull).join("\n"), /require identity/);
  const notInstalledNonNull = structuredClone(binding);
  notInstalledNonNull.dependencyStatus = "not-installed";
  assert.match(
    dependencyLifecycleIssues(notInstalledNonNull).join("\n"),
    /null identity/,
  );

  const retained = readAndValidateCertificationDependencyBindingEvidence({
    evidenceRoot: lifecycle.evidenceRoot,
    descriptor: binding.dependencyBindingEvidence,
    state: bound,
    role: "source-validation",
    repositoryRoot: lifecycle.roots["source-validation"],
  });
  assert.equal(retained.validation.valid, true);
  for (const [field, replacement, pattern] of [
    ["certificationId", "another-certification", /another certification/],
    ["candidateCommitSha", "f".repeat(40), /another certification or candidate/],
    ["candidateTreeSha", "e".repeat(40), /another certification or candidate/],
    ["worktreeRole", "final-artifact", /another role/],
    ["worktreeIdentitySha256", "d".repeat(64), /another role/],
    ["packageLockSha256", "c".repeat(64), /packageLockSha256/],
    ["packageManifestSha256", "b".repeat(64), /packageManifestSha256/],
    ["nodeVersion", "v0.0.0", /Node\/npm executable identity/],
  ]) {
    const tampered = sealCertificationDependencyBindingEvidence({
      ...retained.evidence,
      [field]: replacement,
    });
    const issues = validateCertificationDependencyBindingEvidence({
      evidence: tampered,
      evidenceRoot: lifecycle.evidenceRoot,
      state: bound,
      role: "source-validation",
      repositoryRoot: lifecycle.roots["source-validation"],
    }).issues.join("\n");
    assert.match(issues, pattern, field);
  }
  const unknownField = sealCertificationDependencyBindingEvidence({
    ...retained.evidence,
    unexpected: true,
  });
  assert.match(
    validateCertificationDependencyBindingEvidence({
      evidence: unknownField,
      evidenceRoot: lifecycle.evidenceRoot,
      state: bound,
      role: "source-validation",
      repositoryRoot: lifecycle.roots["source-validation"],
    }).issues.join("\n"),
    /shape is not exact/,
  );
  const nestedInventoryTamper = sealCertificationDependencyBindingEvidence({
    ...retained.evidence,
    dependencyInventory: {
      ...retained.evidence.dependencyInventory,
      physicalContent: {
        ...retained.evidence.dependencyInventory.physicalContent,
        sha256: "9".repeat(64),
      },
    },
  });
  assert.match(
    validateCertificationDependencyBindingEvidence({
      evidence: nestedInventoryTamper,
      evidenceRoot: lifecycle.evidenceRoot,
      state: bound,
      role: "source-validation",
      repositoryRoot: lifecycle.roots["source-validation"],
    }).issues.join("\n"),
    /inventory|drift/,
  );

  const beforeSame = readFileSync(lifecycle.statePath);
  const same = bind(lifecycle, installed);
  assert.equal(same.mutated, false);
  assert.equal(readFileSync(lifecycle.statePath).equals(beforeSame), true);
  const beforeDifferent = readFileSync(lifecycle.statePath);
  assert.throws(
    () =>
      bindCertificationWorktreeDependencies({
        statePath: lifecycle.statePath,
        expectedCurrentSha256: sha256Bytes(beforeDifferent),
        evidenceRoot: lifecycle.evidenceRoot,
        canonicalRoot: lifecycle.canonicalRoot,
        role: "source-validation",
        dependencyBindingEvidence: {
          ...installed.bindingEvidenceDescriptor,
          sha256: "f".repeat(64),
        },
      }),
    /cannot be overwritten/,
  );
  assert.equal(readFileSync(lifecycle.statePath).equals(beforeDifferent), true);

  write(lifecycle.roots["source-validation"], "package.json", "{}\n");
  const drift = readAndValidateCertificationDependencyBindingEvidence({
    evidenceRoot: lifecycle.evidenceRoot,
    descriptor: binding.dependencyBindingEvidence,
    state: bound,
    role: "source-validation",
    repositoryRoot: lifecycle.roots["source-validation"],
  });
  assert.equal(drift.validation.valid, false);
  assert.match(drift.validation.issues.join("\n"), /drift|packageManifestSha256/);
  writeFileSync(
    path.join(lifecycle.roots["source-validation"], "package.json"),
    readFileSync(path.join(lifecycle.canonicalRoot, "package.json")),
  );
  const dependencyImplementationPath = path.join(
    lifecycle.roots["source-validation"],
    "node_modules/fixture/index.js",
  );
  const dependencyImplementation = readFileSync(dependencyImplementationPath);
  writeFileSync(
    dependencyImplementationPath,
    "module.exports = 'implementation-byte-drift';\n",
  );
  const implementationDrift =
    readAndValidateCertificationDependencyBindingEvidence({
      evidenceRoot: lifecycle.evidenceRoot,
      descriptor: binding.dependencyBindingEvidence,
      state: bound,
      role: "source-validation",
      repositoryRoot: lifecycle.roots["source-validation"],
    });
  assert.equal(implementationDrift.validation.valid, false);
  assert.match(
    implementationDrift.validation.issues.join("\n"),
    /drift|inventory/,
  );
  writeFileSync(dependencyImplementationPath, dependencyImplementation);

  const removedState = structuredClone(bound);
  removedState.stages.continuity.status = "passed";
  removedState.stages["integration-ready"].status = "passed";
  const removed = cleanupCertificationStageWorktrees({
    state: removedState,
    evidenceRoot: lifecycle.evidenceRoot,
    canonicalRoot: lifecycle.canonicalRoot,
    preStateSha256: certificationStateSha256(sealCertificationState(removedState)),
    completedAt: removedState.updatedAt,
    invocationNonce: "dependency-cleanup-fixture-0001",
  });
  assert.equal(removed.roles["source-validation"].dependencyStatus, "removed");
  const cleanedState = structuredClone(bound);
  cleanedState.worktrees = removed;
  assert.throws(
    () =>
      resolveCertificationStageWorktree({
        state: cleanedState,
        evidenceRoot: lifecycle.evidenceRoot,
        canonicalRoot: lifecycle.canonicalRoot,
        role: "source-validation",
      }),
    /not active/,
  );
} finally {
  removeFixture(lifecycle);
}

const failedInstall = fixture();
try {
  const before = readFileSync(failedInstall.statePath);
  const failure = install(failedInstall, "source-validation", () => ({
    status: 17,
    signal: null,
    stdout: "fixture install stdout\n",
    stderr: "fixture install stderr\n",
  }));
  assert.equal(failure.passed, false);
  assert.equal(readFileSync(failedInstall.statePath).equals(before), true);
  const contradictoryFailure = structuredClone(failure.installation);
  contradictoryFailure.child.exitCode = 23;
  assert.throws(
    () =>
      failCertificationWorktreeDependencyInstallation({
        statePath: failedInstall.statePath,
        expectedCurrentSha256: sha256Bytes(before),
        evidenceRoot: failedInstall.evidenceRoot,
        role: "source-validation",
        installationEvidence: failure.installationDescriptor,
        installation: contradictoryFailure,
      }),
    /invalid or contradictory/,
  );
  assert.equal(readFileSync(failedInstall.statePath).equals(before), true);
  const failedTransition = failCertificationWorktreeDependencyInstallation({
    statePath: failedInstall.statePath,
    expectedCurrentSha256: sha256Bytes(before),
    evidenceRoot: failedInstall.evidenceRoot,
    role: "source-validation",
    installationEvidence: failure.installationDescriptor,
    installation: failure.installation,
  });
  assert.equal(
    failedTransition.state.worktrees.roles["source-validation"].dependencyStatus,
    "failed",
  );
  assert.equal(
    failedTransition.state.worktrees.roles["source-validation"]
      .dependencyBindingEvidence,
    null,
  );
  assert.equal(
    validateCertificationState({
      state: failedTransition.state,
      evidenceRoot: failedInstall.evidenceRoot,
      repositoryRoot: failedInstall.canonicalRoot,
    }).valid,
    true,
  );
} finally {
  removeFixture(failedInstall);
}

const nestedInstallFailure = fixture();
try {
  const signalFailure = install(
    nestedInstallFailure,
    "source-validation",
    ({ startedAt }) => ({
      status: 1,
      signal: null,
      stdout: "",
      stderr: "",
      installationAttempted: true,
      installationEvent: {
        status: "failed",
        startedAt,
        completedAt: new Date(Date.parse(startedAt) + 1).toISOString(),
        exitCode: null,
        signal: "SIGTERM",
        failureKind: "child_signal",
      },
    }),
  );
  assert.equal(signalFailure.installation.child.signal, "SIGTERM");
  assert.deepEqual(
    classifyCertificationDependencyInstallationFailure(signalFailure),
    {
      classification: "INFRASTRUCTURE_TRANSIENT",
      exitCode: null,
      signal: "SIGTERM",
    },
  );
  const dispatchFailure = install(
    nestedInstallFailure,
    "final-artifact",
    ({ startedAt }) => ({
      status: 1,
      signal: null,
      stdout: "",
      stderr: "",
      installationAttempted: true,
      installationEvent: {
        status: "failed",
        startedAt,
        completedAt: new Date(Date.parse(startedAt) + 1).toISOString(),
        exitCode: null,
        signal: null,
        failureKind: "dispatch_error",
      },
    }),
  );
  assert.equal(dispatchFailure.installation.child.spawnError, "dispatch_error");
  assert.equal(
    classifyCertificationDependencyInstallationFailure(dispatchFailure)
      .classification,
    "INFRASTRUCTURE_TRANSIENT",
  );
  const wrapperSignalAfterSuccessfulInstall = install(
    nestedInstallFailure,
    "development-browser",
    ({ startedAt }) => ({
      status: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
      installationAttempted: true,
      installationEvent: {
        status: "succeeded",
        startedAt,
        completedAt: new Date(Date.parse(startedAt) + 1).toISOString(),
        exitCode: 0,
        signal: null,
        failureKind: null,
      },
    }),
  );
  assert.equal(
    wrapperSignalAfterSuccessfulInstall.installation.completionMarker.result,
    "wrapper-failed",
  );
  assert.equal(wrapperSignalAfterSuccessfulInstall.installation.child.exitCode, 0);
  assert.equal(
    wrapperSignalAfterSuccessfulInstall.installation.dispatch.signal,
    "SIGTERM",
  );
  assert.deepEqual(
    classifyCertificationDependencyInstallationFailure(
      wrapperSignalAfterSuccessfulInstall,
    ),
    {
      classification: "INFRASTRUCTURE_TRANSIENT",
      exitCode: null,
      signal: "SIGTERM",
    },
  );
  const wrapperFailureState = readCertificationState(
    nestedInstallFailure.statePath,
  );
  const wrapperFailureTransition =
    failCertificationWorktreeDependencyInstallation({
      statePath: nestedInstallFailure.statePath,
      expectedCurrentSha256: certificationStateSha256(wrapperFailureState),
      evidenceRoot: nestedInstallFailure.evidenceRoot,
      role: "development-browser",
      installationEvidence:
        wrapperSignalAfterSuccessfulInstall.installationDescriptor,
      installation: wrapperSignalAfterSuccessfulInstall.installation,
    });
  assert.equal(
    wrapperFailureTransition.state.worktrees.roles["development-browser"]
      .dependencyInstallation.result,
    "wrapper-failed",
  );
  assert.equal(
    wrapperFailureTransition.state.worktrees.roles["development-browser"]
      .dependencyInstallation.signal,
    "SIGTERM",
  );
} finally {
  removeFixture(nestedInstallFailure);
}

const measurementFailure = fixture();
try {
  const before = readFileSync(measurementFailure.statePath);
  const failedMeasurement = install(
    measurementFailure,
    "source-validation",
    () => ({
      status: 0,
      signal: null,
      stdout: "",
      stderr: "",
    }),
  );
  assert.equal(failedMeasurement.passed, false);
  assert.equal(failedMeasurement.failurePhase, "measurement");
  assert.equal(readFileSync(measurementFailure.statePath).equals(before), true);
  const failedTransition = failCertificationWorktreeDependencyInstallation({
    statePath: measurementFailure.statePath,
    expectedCurrentSha256: sha256Bytes(before),
    evidenceRoot: measurementFailure.evidenceRoot,
    role: "source-validation",
    installationEvidence: failedMeasurement.installationDescriptor,
    installation: failedMeasurement.installation,
  });
  assert.equal(
    failedTransition.state.worktrees.roles["source-validation"].dependencyStatus,
    "failed",
  );
  assert.equal(
    failedTransition.state.worktrees.roles["source-validation"]
      .dependencyIdentitySha256,
    null,
  );
  assert.equal(
    validateCertificationState({
      state: failedTransition.state,
      evidenceRoot: measurementFailure.evidenceRoot,
      repositoryRoot: measurementFailure.canonicalRoot,
    }).valid,
    true,
  );
} finally {
  removeFixture(measurementFailure);
}

const staleAndConcurrent = fixture({ dependency: true });
try {
  const installed = install(staleAndConcurrent);
  const current = readCertificationState(staleAndConcurrent.statePath);
  assert.throws(() => bind(staleAndConcurrent, installed, "f".repeat(64)), /changed/);
  const lockPath = `${staleAndConcurrent.statePath}.lock`;
  writeFileSync(lockPath, "concurrent writer\n");
  assert.throws(
    () => bind(staleAndConcurrent, installed, certificationStateSha256(current)),
    /EEXIST/,
  );
  assert.equal(existsSync(lockPath), true);
  unlinkSync(lockPath);
} finally {
  removeFixture(staleAndConcurrent);
}

const staleInstallationTime = fixture({ dependency: true });
try {
  const installed = install(staleInstallationTime);
  const state = readCertificationState(staleInstallationTime.statePath);
  const advanced = structuredClone(state);
  advanced.updatedAt = new Date(
    Date.parse(installed.installation.installationCompletedAt) + 1,
  ).toISOString();
  writeCertificationState(
    staleInstallationTime.statePath,
    sealCertificationState(advanced),
    { expectedCurrentSha256: certificationStateSha256(state) },
  );
  const before = readFileSync(staleInstallationTime.statePath);
  assert.throws(
    () => bind(staleInstallationTime, installed),
    /installation interval is outside its running stage attempt/,
  );
  assert.equal(readFileSync(staleInstallationTime.statePath).equals(before), true);
} finally {
  removeFixture(staleInstallationTime);
}

const bindingRace = fixture({ dependency: true });
try {
  const installed = install(bindingRace);
  const before = readFileSync(bindingRace.statePath);
  const implementationPath = path.join(
    bindingRace.roots["source-validation"],
    "node_modules/fixture/index.js",
  );
  const implementation = readFileSync(implementationPath);
  assert.throws(
    () =>
      bindCertificationWorktreeDependencies({
        statePath: bindingRace.statePath,
        expectedCurrentSha256: sha256Bytes(before),
        evidenceRoot: bindingRace.evidenceRoot,
        canonicalRoot: bindingRace.canonicalRoot,
        role: "source-validation",
        dependencyBindingEvidence: installed.bindingEvidenceDescriptor,
        beforeFinalDependencyMeasurement() {
          writeFileSync(
            implementationPath,
            "module.exports = 'binding-race';\n",
          );
        },
      }),
    /changed between binding validation/,
  );
  assert.equal(readFileSync(bindingRace.statePath).equals(before), true);
  writeFileSync(implementationPath, implementation);
} finally {
  removeFixture(bindingRace);
}

const symlinked = fixture();
try {
  const external = path.join(symlinked.owner, "external-node-modules");
  mkdirSync(external);
  write(external, ".package-lock.json", "{}\n");
  symlinkSync(external, path.join(symlinked.roots["source-validation"], "node_modules"));
  assert.throws(
    () =>
      measureCertificationWorktreeDependencies({
        repositoryRoot: symlinked.roots["source-validation"],
      }),
    /physical local directory/,
  );
} finally {
  removeFixture(symlinked);
}

const crossWorktreeResolution = fixture({ dependency: true });
try {
  assert.equal(install(crossWorktreeResolution, "source-validation").passed, true);
  assert.equal(install(crossWorktreeResolution, "final-artifact").passed, true);
  const sourcePackage = path.join(
    crossWorktreeResolution.roots["source-validation"],
    "node_modules/fixture",
  );
  const artifactPackage = path.join(
    crossWorktreeResolution.roots["final-artifact"],
    "node_modules/fixture",
  );
  rmSync(sourcePackage, { recursive: true, force: true });
  symlinkSync(artifactPackage, sourcePackage);
  assert.throws(
    () =>
      measureCertificationWorktreeDependencies({
        repositoryRoot:
          crossWorktreeResolution.roots["source-validation"],
      }),
    /outside node_modules|external dependency symlink/,
  );
} finally {
  removeFixture(crossWorktreeResolution);
}

const ancestorResolution = fixture({ dependency: true });
try {
  assert.equal(install(ancestorResolution).passed, true);
  const sourceRoot = ancestorResolution.roots["source-validation"];
  const ancestorNodeModules = path.join(path.dirname(sourceRoot), "node_modules");
  write(
    ancestorNodeModules,
    "ambient/package.json",
    '{"name":"ambient","version":"1.0.0","main":"index.js"}\n',
  );
  write(ancestorNodeModules, "ambient/index.js", "module.exports = 'ambient';\n");
  const resolved = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(require.resolve('ambient'))"],
    { cwd: sourceRoot, encoding: "utf8" },
  );
  assert.equal(resolved.status, 0);
  assert.match(resolved.stdout, /ambient/);
  assert.throws(
    () => measureCertificationWorktreeDependencies({ repositoryRoot: sourceRoot }),
    /ancestor Node module search root/,
  );
} finally {
  removeFixture(ancestorResolution);
}

const globalResolution = fixture({ dependency: true });
try {
  assert.equal(install(globalResolution).passed, true);
  const originalNodePath = process.env.NODE_PATH;
  process.env.NODE_PATH = path.join(globalResolution.owner, "global-node-modules");
  try {
    assert.throws(
      () =>
        measureCertificationWorktreeDependencies({
          repositoryRoot: globalResolution.roots["source-validation"],
        }),
      /NODE_PATH/,
    );
  } finally {
    if (originalNodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = originalNodePath;
  }
} finally {
  removeFixture(globalResolution);
}

const evidenceSymlink = fixture({ dependency: true });
try {
  const outside = path.join(evidenceSymlink.owner, "outside-evidence");
  mkdirSync(outside);
  symlinkSync(
    outside,
    path.join(evidenceSymlink.evidenceRoot, "worktree-dependencies"),
  );
  let dispatched = false;
  assert.throws(
    () =>
      install(evidenceSymlink, "source-validation", () => {
        dispatched = true;
        return { status: 0, signal: null, stdout: "", stderr: "" };
      }),
    /contained physical directory/,
  );
  assert.equal(dispatched, false);
  assert.deepEqual(readdirSync(outside), []);
} finally {
  removeFixture(evidenceSymlink);
}

const privateSidecarSymlink = fixture({ dependency: true });
try {
  const installation = install(privateSidecarSymlink);
  assert.equal(installation.passed, true);
  const state = readCertificationState(privateSidecarSymlink.statePath);
  const binding = state.worktrees.roles["source-validation"];
  const sidecarPath = path.join(
    privateSidecarSymlink.evidenceRoot,
    binding.privateSidecar.path,
  );
  const sidecarBytes = readFileSync(sidecarPath);
  const roleDirectory = path.dirname(sidecarPath);
  const outside = path.join(privateSidecarSymlink.owner, "outside-private-sidecar");
  mkdirSync(outside);
  writeFileSync(path.join(outside, path.basename(sidecarPath)), sidecarBytes);
  rmSync(roleDirectory, { recursive: true });
  symlinkSync(outside, roleDirectory);
  const outsideBefore = readdirSync(outside);
  assert.throws(
    () => bind(privateSidecarSymlink, installation),
    /private sidecar parent must be a physical directory/,
  );
  assert.deepEqual(readdirSync(outside), outsideBefore);
  assert.deepEqual(
    readFileSync(path.join(outside, path.basename(sidecarPath))),
    sidecarBytes,
  );
} finally {
  removeFixture(privateSidecarSymlink);
}

const privateSidecarCollision = fixture({ dependency: true });
try {
  const installation = install(privateSidecarCollision);
  assert.equal(installation.passed, true);
  const state = readCertificationState(privateSidecarCollision.statePath);
  const stateBytesBefore = readFileSync(privateSidecarCollision.statePath);
  const resolved = resolveCertificationStageWorktree({
    state,
    evidenceRoot: privateSidecarCollision.evidenceRoot,
    canonicalRoot: privateSidecarCollision.canonicalRoot,
    role: "source-validation",
    phase: "binding",
  });
  const expectedDigest = sha256Bytes(
    canonicalJsonBytes(resolved.privateSidecar),
  );
  const collisionPath = path.join(
    privateSidecarCollision.evidenceRoot,
    "worktrees/private/source-validation",
    `${expectedDigest}.json`,
  );
  writeFileSync(collisionPath, "preseeded contradictory sidecar\n");
  assert.throws(
    () => bind(privateSidecarCollision, installation),
    /exact canonical physical file/,
  );
  assert.deepEqual(
    readFileSync(privateSidecarCollision.statePath),
    stateBytesBefore,
    "a private-sidecar collision must fail before the dependency CAS commits",
  );
} finally {
  removeFixture(privateSidecarCollision);
}

const attemptBoundary = fixture({ dependency: true });
try {
  const state = readCertificationState(attemptBoundary.statePath);
  const environment = installEnvironment();
  environment.NPM_CONFIG_CACHE = path.join(attemptBoundary.owner, "npm-cache");
  const installWithAttempt = (attemptNumber) =>
    installCertificationWorktreeDependencies({
      repositoryRoot: attemptBoundary.roots["source-validation"],
      evidenceRoot: attemptBoundary.evidenceRoot,
      state,
      role: "source-validation",
      environment,
      attemptNumber,
    });
  assert.throws(
    () => installWithAttempt("../../../../../../outside-attempt"),
    /positive safe integer/,
  );
  assert.throws(
    () => installWithAttempt(2),
    /latest running source-validation attempt/,
  );
  assert.equal(
    existsSync(path.join(attemptBoundary.evidenceRoot, "worktree-dependencies")),
    false,
  );
  assert.equal(
    existsSync(path.join(attemptBoundary.owner, "outside-attempt")),
    false,
  );
} finally {
  removeFixture(attemptBoundary);
}

const moduleInfluence = fixture();
try {
  const projected = certificationDependencyInstallationEnvironment({
    ...installEnvironment(),
    OPENAI_API_KEY: "must-not-be-forwarded",
    NPM_TOKEN: "must-not-be-forwarded",
  });
  assert.equal(projected.OPENAI_API_KEY, undefined);
  assert.equal(projected.NPM_TOKEN, undefined);
  assert.equal(
    projected.NPM_CONFIG_USERCONFIG,
    path.join(
      process.platform === "win32" ? "NUL" : "/dev/null",
      "certification-empty-userconfig",
    ),
  );
  assert.equal(
    projected.NPM_CONFIG_GLOBALCONFIG,
    process.platform === "win32" ? "NUL" : "/dev/null",
  );
  assert.throws(
    () =>
      installCertificationWorktreeDependencies({
        repositoryRoot: moduleInfluence.roots["source-validation"],
        evidenceRoot: moduleInfluence.evidenceRoot,
        state: readCertificationState(moduleInfluence.statePath),
        role: "source-validation",
        environment: { ...installEnvironment(), NODE_PATH: "/external/modules" },
        attemptNumber: 1,
      }),
    /rejects NODE_PATH/,
  );
} finally {
  removeFixture(moduleInfluence);
}

const cleanedRetainedEvidence = fixture({ dependency: true });
try {
  let bound;
  for (const role of [
    "source-validation",
    "final-artifact",
    "development-browser",
  ]) {
    const installation = install(cleanedRetainedEvidence, role);
    bound = bind(cleanedRetainedEvidence, installation, null, role).state;
  }
  bound.stages.continuity.status = "passed";
  bound.stages["integration-ready"].status = "passed";
  bound.worktrees = cleanupCertificationStageWorktrees({
    state: bound,
    evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
    canonicalRoot: cleanedRetainedEvidence.canonicalRoot,
    preStateSha256: certificationStateSha256(sealCertificationState(bound)),
    completedAt: bound.updatedAt,
    invocationNonce: "dependency-cleanup-fixture-0002",
  });
  bound.evidenceFiles["worktree-cleanup"] = bound.worktrees.cleanup;
  assert.deepEqual(
    certificationWorktreeIssues({
      state: bound,
      evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
      canonicalRoot: cleanedRetainedEvidence.canonicalRoot,
    }),
    [],
  );
  const ambientAncestorRoot = path.join(
    path.dirname(cleanedRetainedEvidence.roots["source-validation"]),
    "node_modules",
  );
  mkdirSync(ambientAncestorRoot, { recursive: true });
  const originalPath = process.env.PATH;
  process.env.PATH = "/nonexistent-certification-path";
  try {
    assert.deepEqual(
      certificationWorktreeIssues({
        state: bound,
        evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
        canonicalRoot: cleanedRetainedEvidence.canonicalRoot,
        requirePhysical: false,
      }),
      [],
      "cleaned retained evidence must not depend on the current PATH or ambient roots",
    );
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(ambientAncestorRoot, { recursive: true, force: true });
  }
  const cleanedButInstalled = structuredClone(bound);
  cleanedButInstalled.worktrees.roles["source-validation"].dependencyStatus =
    "installed";
  assert.match(
    certificationWorktreeIssues({
      state: sealCertificationState(cleanedButInstalled),
      evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
      canonicalRoot: cleanedRetainedEvidence.canonicalRoot,
      requirePhysical: false,
    }).join("\n"),
    /cleaned worktree dependencies must be removed/,
  );
  const removedButActive = structuredClone(bound);
  Object.assign(removedButActive.worktrees.roles["source-validation"], {
    lifecycleStatus: "active",
    cleanupStatus: "removed",
    dependencyStatus: "installed",
  });
  assert.match(
    certificationWorktreeIssues({
      state: sealCertificationState(removedButActive),
      evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
      canonicalRoot: cleanedRetainedEvidence.canonicalRoot,
      requirePhysical: false,
    }).join("\n"),
    /lifecycle\/cleanup status pair is invalid/,
  );
  const missingReceiptState = structuredClone(bound);
  Object.assign(missingReceiptState.worktrees.roles["source-validation"], {
    dependencyIdentitySha256: null,
    dependencyBindingEvidence: null,
    dependencyInstallation: null,
  });
  assert.match(
    certificationWorktreeIssues({
      state: missingReceiptState,
      evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
      canonicalRoot: cleanedRetainedEvidence.canonicalRoot,
    }).join("\n"),
    /removed dependencies must retain their successful binding receipt/,
  );
  const retainedBinding =
    readAndValidateCertificationDependencyBindingEvidence({
      evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
      descriptor:
        bound.worktrees.roles["source-validation"].dependencyBindingEvidence,
      state: bound,
      role: "source-validation",
      repositoryRoot: cleanedRetainedEvidence.canonicalRoot,
      remeasure: false,
    });
  const emptySearchRoots = structuredClone(
    retainedBinding.evidence.nodeSearchPathProof,
  );
  emptySearchRoots.ancestorRoots = [];
  emptySearchRoots.globalRoots = [];
  const searchPayload = structuredClone(emptySearchRoots);
  delete searchPayload.sha256;
  emptySearchRoots.sha256 = sha256Bytes(canonicalJsonBytes(searchPayload));
  const forgedSearchProof = sealCertificationDependencyBindingEvidence({
    ...retainedBinding.evidence,
    nodeSearchPathProof: emptySearchRoots,
  });
  assert.match(
    validateCertificationDependencyBindingEvidence({
      evidence: forgedSearchProof,
      evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
      state: bound,
      role: "source-validation",
      repositoryRoot: cleanedRetainedEvidence.canonicalRoot,
      remeasure: false,
    }).issues.join("\n"),
    /Node module search-path proof is malformed/,
  );
  unlinkSync(
    path.join(
      cleanedRetainedEvidence.evidenceRoot,
      bound.worktrees.roles["source-validation"].dependencyBindingEvidence.path,
    ),
  );
  assert.match(
    certificationWorktreeIssues({
      state: bound,
      evidenceRoot: cleanedRetainedEvidence.evidenceRoot,
      canonicalRoot: cleanedRetainedEvidence.canonicalRoot,
    }).join("\n"),
    /dependency-binding evidence|ENOENT|missing/,
  );
} finally {
  removeFixture(cleanedRetainedEvidence);
}

const historicalCleanup = fixture();
try {
  const current = readCertificationState(historicalCleanup.statePath);
  const legacyRoles = Object.fromEntries(
    Object.entries(current.worktrees.roles).map(([role, binding]) => {
      const legacy = structuredClone(binding);
      delete legacy.dependencyLifecycleSchema;
      delete legacy.dependencyStatus;
      delete legacy.dependencyBindingEvidence;
      delete legacy.dependencyInstallation;
      return [role, legacy];
    }),
  );
  const legacyState = createCertificationState({
    certificationId: current.certificationId,
    candidateId: current.candidate.id,
    commitSha: current.candidate.commitSha,
    treeSha: current.candidate.treeSha,
    parentSha: current.candidate.parentSha,
    harnessSourceSha256: current.harness.sourceSha256,
    executionClass: current.executionClass,
    createdAt: current.createdAt,
    worktrees: {
      schema: "interior-ai.production-certification-worktrees.v1",
      roles: legacyRoles,
    },
  });
  legacyState.stages.continuity.status = "passed";
  legacyState.stages["integration-ready"].status = "passed";
  const cleanedLegacy = cleanupCertificationStageWorktrees({
    state: legacyState,
    evidenceRoot: historicalCleanup.evidenceRoot,
    canonicalRoot: historicalCleanup.canonicalRoot,
    preStateSha256: certificationStateSha256(sealCertificationState(legacyState)),
    completedAt: legacyState.updatedAt,
    invocationNonce: "dependency-cleanup-fixture-0003",
  });
  assert.equal(
    cleanedLegacy.schema,
    "interior-ai.production-certification-worktrees.v1",
  );
  assert.equal(
    "dependencyStatus" in cleanedLegacy.roles["source-validation"],
    false,
  );
} finally {
  removeFixture(historicalCleanup);
}

const realRunnerSource = readFileSync(
  path.join(process.cwd(), "scripts/production-certification-real.mjs"),
  "utf8",
);
const sourceOwner = realRunnerSource.slice(
  realRunnerSource.indexOf("export async function runSourceValidationStage"),
  realRunnerSource.indexOf("export async function runBuildStage"),
);
assert.ok(
  sourceOwner.indexOf("installAndBindRoleDependencies") <
    sourceOwner.indexOf("sourceValidationStageEvidence"),
  "dependency bind must precede source check execution",
);
assert.ok(
  sourceOwner.indexOf("sourceValidationStageEvidence") <
    sourceOwner.indexOf("validateSourceValidationEvidence"),
  "aggregate validation must follow source check execution",
);
assert.doesNotMatch(sourceOwner, /refreshCertificationStageWorktreeBinding/);
assert.match(
  realRunnerSource,
  /dependency installation could not begin:[\s\S]*?PRECONDITION_ORCHESTRATION_FAILURE/,
);
const buildOwner = realRunnerSource.slice(
  realRunnerSource.indexOf("export async function runBuildStage"),
  realRunnerSource.indexOf("export async function runArchivePreflightStage"),
);
assert.match(
  buildOwner,
  /postBuildDependencyRevalidation[\s\S]*?FINAL_EVIDENCE_FAILURE/,
);
assert.doesNotMatch(
  readFileSync(
    path.join(process.cwd(), "scripts/production-certification-source-continuity.mjs"),
    "utf8",
  ),
  /bindCertificationWorktreeDependencies|writeCertificationState/,
);

const regressionMatrix = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "scripts/production-certification-regressions.json"),
    "utf8",
  ),
);
assert.equal(regressionMatrix.dependencyLifecycleCases.length, 26);
assert.deepEqual(regressionMatrix.dependencyLifecycleCases, [
  "initial-not-installed-null-valid",
  "installed-non-null-valid-evidence",
  "installed-null-rejected",
  "not-installed-non-null-rejected",
  "installation-failure-does-not-bind",
  "measurement-failure-does-not-bind",
  "binding-evidence-tamper-rejected",
  "stale-expected-state-hash-rejected",
  "concurrent-state-writer-rejected",
  "wrong-worktree-role-rejected",
  "wrong-worktree-identity-rejected",
  "wrong-candidate-commit-tree-rejected",
  "wrong-certification-id-rejected",
  "lockfile-mismatch-rejected",
  "package-manifest-mismatch-rejected",
  "symlinked-node-modules-rejected",
  "cross-worktree-resolution-rejected",
  "global-node-path-resolution-rejected",
  "already-bound-same-identity-read-only",
  "already-bound-different-identity-rejected",
  "source-post-check-drift-rejected",
  "post-build-drift-rejected",
  "development-browser-pre-owner-drift-rejected",
  "aggregate-before-state-binding-rejected",
  "post-aggregate-state-mutation-anti-pattern-rejected",
  "removed-worktree-evidence-reuse-rejected",
]);

assert.equal(PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA.endsWith(".v1"), true);
console.log("production certification dependency lifecycle tests passed");
