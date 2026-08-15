import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PRODUCTION_CERTIFICATION_STATE_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2,
  canonicalJsonBytes,
  harnessSourceIdentity,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  finalCertificationManifestIdentityIssues,
  finalRuntimeArtifactIdentityIssues,
  isFinalCertificationStateSchemaSupported,
} from "./production-certification-evidence.mjs";
import {
  HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  historicalCertificationManifestIdentityIssues,
  historicalRuntimeArtifactIdentityIssues,
  isHistoricalCertificationStateSchemaSupported,
} from "./production-certification-historical-evidence.mjs";
import { runProductionCertificationSimulation } from "./production-certification-simulation.mjs";
import { validateSourceValidationEvidence } from "./production-certification-source-continuity.mjs";
import { projectCertificationChildEnvironment } from "./production-certification-stage-environment.mjs";
import {
  certificationStateSha256,
  createCertificationInvalidationPlan,
  createCertificationState,
  readCertificationState,
  reconcileCertificationState,
  startCertificationStage,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  certificationWorktreeIssues,
  cleanupCertificationStageWorktrees,
  createCertificationStageWorktrees,
  inspectCertificationStageWorktree,
  resolveCertificationStageWorktree,
} from "./production-certification-worktrees.mjs";

const repositoryRoot = process.cwd();

assert.equal(isFinalCertificationStateSchemaSupported(PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1), false);
assert.equal(isFinalCertificationStateSchemaSupported(PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2), false);
assert.equal(isFinalCertificationStateSchemaSupported(PRODUCTION_CERTIFICATION_STATE_SCHEMA), true);
assert.equal(
  isFinalCertificationStateSchemaSupported(
    "interior-ai.production-certification-state.unknown",
  ),
  false,
);
assert.equal(
  isHistoricalCertificationStateSchemaSupported(PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1),
  true,
);
assert.equal(
  isHistoricalCertificationStateSchemaSupported(PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2),
  true,
);
assert.equal(
  isHistoricalCertificationStateSchemaSupported(PRODUCTION_CERTIFICATION_STATE_SCHEMA),
  false,
);

for (const [schema, version] of [
  [PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1, 1],
  [PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2, 2],
]) {
  const owner = mkdtempSync(path.join(tmpdir(), "historical-final-journal-"));
  try {
    const artifactRoot = path.join(owner, "archive/extracted");
    const evidenceRoot = path.join(owner, "evidence");
    const runNonce = `historical-state-v${version}-journal`;
    const journal = {
      schema: HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
      runNonce,
    };
    const journalBytes = canonicalJsonBytes(journal);
    write(
      artifactRoot,
      ".local/production-artifact-evidence/semantic-event-journal.json",
      journalBytes,
    );
    mkdirSync(evidenceRoot, { recursive: true });
    const manifest = {
      schema: "interior-ai.production-artifact-evidence.v3",
      candidateIdentifier: `historical-state-v${version}`,
      source: { commitSha: "a".repeat(40), treeSha: "b".repeat(40) },
      build: { nextBuildId: `historical-build-v${version}` },
      artifact: { sha256: "c".repeat(64) },
      execution: { runNonce },
    };
    const manifestBytes = canonicalJsonBytes(manifest);
    const state = {
      schema,
      version,
      candidate: {
        id: manifest.candidateIdentifier,
        commitSha: manifest.source.commitSha,
        treeSha: manifest.source.treeSha,
      },
      bindings: {
        nextBuildId: manifest.build.nextBuildId,
        artifactSha256: manifest.artifact.sha256,
        semanticJournalNonce: runNonce,
        semanticJournalSha256: sha256Bytes(journalBytes),
        productionManifestSha256: sha256Bytes(manifestBytes),
      },
    };
    assert.deepEqual(
      historicalCertificationManifestIdentityIssues(
        { value: manifest, sha256: sha256Bytes(manifestBytes) },
        artifactRoot,
        state,
      ),
      [],
      `historical state v${version} must retain semantic journal v1 final identity`,
    );
    const runtimeIdentity = {
      candidateIdentifier: state.candidate.id,
      sourceCommitSha: state.candidate.commitSha,
      sourceTreeSha: state.candidate.treeSha,
      artifactSha256: state.bindings.artifactSha256,
      nextBuildId: state.bindings.nextBuildId,
      runNonce,
      semanticJournalSchema: journal.schema,
      semanticJournalVersion: HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION,
      serverCommand: "npm run evidence:production:serve",
      buildMode: "production",
    };
    assert.deepEqual(historicalRuntimeArtifactIdentityIssues(runtimeIdentity, state), []);
    assert.match(
      historicalRuntimeArtifactIdentityIssues(
        {
          ...runtimeIdentity,
          semanticJournalSchema:
            "interior-ai.production-artifact-semantic-event-journal.v2",
        },
        state,
      ).join("\n"),
      /historical runtime report identity is invalid/,
    );
    assert.notDeepEqual(finalRuntimeArtifactIdentityIssues(runtimeIdentity, state), []);
    assert.notDeepEqual(
      finalCertificationManifestIdentityIssues(
        { value: manifest, sha256: sha256Bytes(manifestBytes) },
        artifactRoot,
        evidenceRoot,
        state,
      ),
      [],
      `current final standalone must reject historical state v${version}`,
    );
  } finally {
    rmSync(owner, { recursive: true, force: true });
  }
}

function run(command, args, cwd, environment = process.env, allowFailure = false) {
  const child = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
  });
  if (!allowFailure && (child.status !== 0 || child.signal || child.error)) {
    throw new Error(String(child.stderr || child.stdout || child.error).trim());
  }
  return child;
}

function git(cwd, args, allowFailure = false) {
  const child = run("git", args, cwd, process.env, allowFailure);
  return child.status === 0 ? child.stdout.trim() : null;
}

function write(root, relativePath, bytes) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return target;
}

function initializeRepository(root) {
  write(
    root,
    ".gitignore",
    ".env\n.env.local\n.local/\n.vercel/\n.next/\nnode_modules/\ntest-results/\nplaywright-report/\nfinal-component\n",
  );
  write(root, "package.json", "{\"name\":\"worktree-fixture\",\"private\":true}\n");
  write(
    root,
    "package-lock.json",
    "{\"name\":\"worktree-fixture\",\"lockfileVersion\":3,\"packages\":{}}\n",
  );
  write(root, "tracked.txt", "candidate\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Certification worktree test"]);
  git(root, ["config", "user.email", "certification-worktree@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "candidate"]);
  return {
    id: "worktree-isolation-candidate",
    commitSha: git(root, ["rev-parse", "HEAD"]),
    treeSha: git(root, ["rev-parse", "HEAD^{tree}"]),
    parentSha: git(root, ["rev-parse", "HEAD^"], true) ?? "0".repeat(40),
  };
}

async function worktreeIsolationMatrix() {
  const owner = mkdtempSync(path.join(tmpdir(), "certification-worktree-matrix-"));
  const canonicalRoot = path.join(owner, "canonical");
  const evidenceRoot = path.join(owner, "evidence");
  const worktreeOwnerRoot = path.join(owner, "owned-worktrees");
  const externalComponent = path.join(owner, "external-component");
  for (const root of [canonicalRoot, evidenceRoot, worktreeOwnerRoot]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  const candidate = initializeRepository(canonicalRoot);
  write(canonicalRoot, ".env", "user-env\n");
  write(canonicalRoot, ".env.local", "user-local-env\n");
  write(canonicalRoot, ".local/history.txt", "history\n");
  write(canonicalRoot, ".vercel/project.json", "{}\n");
  write(canonicalRoot, "test-results/result.txt", "user-result\n");
  write(externalComponent, "component.txt", "external\n");
  symlinkSync(externalComponent, path.join(canonicalRoot, "final-component"));
  const canonicalSnapshot = Object.fromEntries(
    [
      ".env",
      ".env.local",
      ".local/history.txt",
      ".vercel/project.json",
      "test-results/result.txt",
    ].map((relativePath) => [
      relativePath,
      sha256Bytes(readFileSync(path.join(canonicalRoot, relativePath))),
    ]),
  );
  const externalTarget = realpathSync(path.join(canonicalRoot, "final-component"));
  const certificationId = "worktree-isolation-certification";
  assert.throws(
    () =>
      createCertificationStageWorktrees({
        canonicalRoot,
        evidenceRoot,
        worktreeRoot: worktreeOwnerRoot,
        certificationId: "..",
        candidate,
        createdAt: "2026-08-15T00:00:00.000Z",
      }),
    /identity is malformed|cannot escape/,
  );
  const worktrees = createCertificationStageWorktrees({
    canonicalRoot,
    evidenceRoot,
    worktreeRoot: worktreeOwnerRoot,
    certificationId,
    candidate,
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const state = createCertificationState({
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
  const roots = CERTIFICATION_WORKTREE_ROLES.map(
    (role) =>
      resolveCertificationStageWorktree({
        state,
        evidenceRoot,
        canonicalRoot,
        role,
        phase: "pristine",
      }).root,
  );
  assert.equal(new Set(roots).size, 3);
  for (const root of roots) {
    assert.equal(git(root, ["rev-parse", "HEAD"]), candidate.commitSha);
    assert.equal(git(root, ["rev-parse", "HEAD^{tree}"]), candidate.treeSha);
    for (const relativePath of [
      ".env",
      ".env.local",
      ".local",
      ".vercel",
      ".next",
      "node_modules",
      "test-results",
      "playwright-report",
      "final-component",
    ]) {
      assert.equal(existsSync(path.join(root, relativePath)), false);
    }
  }

  const sourceRoot = roots[0];
  const finalRoot = roots[1];
  const developmentRoot = roots[2];
  assert.doesNotThrow(() =>
    inspectCertificationStageWorktree({
      repositoryRoot: finalRoot,
      canonicalRoot,
      evidenceRoot,
      role: "final-artifact",
      certificationId,
      candidate,
      phase: "pristine",
    }),
  );

  write(finalRoot, ".env", "copied-build-env\n");
  assert.throws(
    () =>
      inspectCertificationStageWorktree({
        repositoryRoot: finalRoot,
        canonicalRoot,
        evidenceRoot,
        role: "final-artifact",
        certificationId,
        candidate,
      }),
    /ignored influential paths/,
  );
  unlinkSync(path.join(finalRoot, ".env"));

  write(sourceRoot, ".env.local", "copied-source-env\n");
  assert.throws(
    () =>
      inspectCertificationStageWorktree({
        repositoryRoot: sourceRoot,
        canonicalRoot,
        evidenceRoot,
        role: "source-validation",
        certificationId,
        candidate,
      }),
    /ignored influential paths/,
  );
  unlinkSync(path.join(sourceRoot, ".env.local"));

  write(sourceRoot, "node_modules/.package-lock.json", "source-installed-lock\n");
  symlinkSync(path.join(sourceRoot, "node_modules"), path.join(developmentRoot, "node_modules"));
  assert.throws(
    () =>
      inspectCertificationStageWorktree({
        repositoryRoot: developmentRoot,
        canonicalRoot,
        evidenceRoot,
        role: "development-browser",
        certificationId,
        candidate,
      }),
    /not clean|node_modules must be a physical local directory/,
  );
  unlinkSync(path.join(developmentRoot, "node_modules"));
  assert.throws(
    () =>
      resolveCertificationStageWorktree({
        state,
        evidenceRoot,
        canonicalRoot,
        role: "source-validation",
        phase: "pristine",
      }),
    /must not contain node_modules|ignored influential paths/,
  );
  rmSync(path.join(sourceRoot, "node_modules"), { recursive: true });

  const aliased = structuredClone(state);
  aliased.worktrees.roles["development-browser"] = structuredClone(
    aliased.worktrees.roles["source-validation"],
  );
  aliased.worktrees.roles["development-browser"].role = "development-browser";
  assert.match(
    certificationWorktreeIssues({
      state: aliased,
      evidenceRoot,
      canonicalRoot,
    }).join("\n"),
    /cross-role|alias/,
  );

  write(canonicalRoot, "tracked.txt", "next-commit\n");
  git(canonicalRoot, ["add", "tracked.txt"]);
  git(canonicalRoot, ["commit", "-qm", "other candidate"]);
  const wrongCommit = git(canonicalRoot, ["rev-parse", "HEAD"]);
  git(finalRoot, ["checkout", "--detach", wrongCommit]);
  assert.throws(
    () =>
      inspectCertificationStageWorktree({
        repositoryRoot: finalRoot,
        canonicalRoot,
        evidenceRoot,
        role: "final-artifact",
        certificationId,
        candidate,
      }),
    /exact candidate commit\/tree/,
  );
  git(finalRoot, ["checkout", "--detach", candidate.commitSha]);

  const symlinkAlias = path.join(owner, "final-alias");
  symlinkSync(finalRoot, symlinkAlias);
  assert.throws(
    () =>
      inspectCertificationStageWorktree({
        repositoryRoot: symlinkAlias,
        canonicalRoot,
        evidenceRoot,
        role: "final-artifact",
        certificationId,
        candidate,
      }),
    /physical directory/,
  );
  unlinkSync(symlinkAlias);

  assert.throws(
    () =>
      inspectCertificationStageWorktree({
        repositoryRoot: canonicalRoot,
        canonicalRoot,
        evidenceRoot,
        role: "final-artifact",
        certificationId,
        candidate,
      }),
    /cannot be a stage worktree/,
  );

  const crossCertification = structuredClone(state);
  crossCertification.certificationId = "another-certification";
  assert.match(
    certificationWorktreeIssues({
      state: crossCertification,
      evidenceRoot,
      canonicalRoot,
    }).join("\n"),
    /another certification|cross-certification|malformed/,
  );

  git(canonicalRoot, ["worktree", "remove", "--force", developmentRoot]);
  assert.match(
    certificationWorktreeIssues({
      state,
      evidenceRoot,
      canonicalRoot,
      requirePhysical: true,
    }).join("\n"),
    /missing|invalid|unreadable|ENOENT/,
  );

  for (const [relativePath, digest] of Object.entries(canonicalSnapshot)) {
    assert.equal(
      sha256Bytes(readFileSync(path.join(canonicalRoot, relativePath))),
      digest,
    );
  }
  assert.equal(realpathSync(path.join(canonicalRoot, "final-component")), externalTarget);
  assert.equal(existsSync(path.join(owner, "quarantine")), false);
  assert.equal(existsSync(path.join(owner, "restoration")), false);
  const cleanupReady = structuredClone(state);
  cleanupReady.stages.continuity.status = "passed";
  const cleanedWorktrees = cleanupCertificationStageWorktrees({
    state: cleanupReady,
    evidenceRoot,
    canonicalRoot,
  });
  assert.equal(
    CERTIFICATION_WORKTREE_ROLES.every(
      (role) =>
        cleanedWorktrees.roles[role].lifecycleStatus === "cleaned" &&
        cleanedWorktrees.roles[role].cleanupStatus === "removed",
    ),
    true,
  );
  assert.equal([sourceRoot, finalRoot, developmentRoot].some(existsSync), false);
  rmSync(owner, { recursive: true, force: true });
}

function cliEnvironment(simulationRoot) {
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const state = readCertificationState(statePath);
  return {
    evidenceRoot,
    statePath,
    state,
    environment: {
      ...process.env,
      PRODUCTION_CERTIFICATION_STATE: statePath,
      CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
      CERTIFICATION_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
      CERTIFICATION_EXPECTED_TREE_SHA: state.candidate.treeSha,
      CERTIFICATION_EXPECTED_PARENT_SHA: state.candidate.parentSha,
    },
  };
}

function invokeCertification(cwd, command, environment) {
  return run(
    process.execPath,
    ["scripts/production-certification.mjs", command],
    cwd,
    environment,
    true,
  );
}

async function transactionalValidationMatrix() {
  const simulation = await runProductionCertificationSimulation();
  for (const name of [
    "sourceInstallPreconditionClassified",
    "exactStaleNullOrderingRegressionPassed",
    "staleBindingStateReceiptRejected",
    "contradictoryBindingStateReceiptRejected",
    "sourceDependencyRevalidationTamperRejected",
    "validationBeforeBindingRejected",
    "staleNullDependencyRejected",
    "differentIdentityOverwriteRejected",
    "postAggregateStateMutationRejected",
    "postBindDependencyDriftRejected",
    "sourcePostCheckDependencyDriftRejected",
    "postBuildDependencyDriftRejected",
    "preBrowserDependencyDriftRejected",
    "roleEvidenceSwapRejected",
    "removedWorktreeEvidenceReuseRejected",
    "cleanedDependencyReceiptDeletionRejected",
  ]) {
    assert.equal(
      simulation.tamperCases[name],
      true,
      `simulation dependency behavior must pass: ${name}`,
    );
  }
  assert.equal(simulation.dependencyLifecycle.physicalFixtureInstallation, true);
  assert.equal(simulation.dependencyLifecycle.atomicBinding, true);
  assert.equal(simulation.dependencyLifecycle.postStageRevalidation, true);
  const canonicalRoot = path.join(simulation.simulationRoot, "source");
  const { statePath, state, environment } = cliEnvironment(simulation.simulationRoot);
  assert.equal(state.stages.doctor.status, "passed");
  assert.equal(state.stages["source-validation"].status, "passed");
  const sourceEvidence = JSON.parse(
    readFileSync(
      path.join(
        simulation.simulationRoot,
        "evidence",
        state.evidenceFiles["source-validation"].path,
      ),
      "utf8",
    ),
  );
  sourceEvidence.stageWorktree.identitySha256 = "f".repeat(64);
  assert.match(
    validateSourceValidationEvidence({
      evidence: sourceEvidence,
      evidenceRoot: path.join(simulation.simulationRoot, "evidence"),
      state,
      repositoryRoot: canonicalRoot,
      verifyPhysicalSource: false,
    }).issues.join("\n"),
    /stage-worktree identity is missing or stale/,
  );
  const baselineBytes = readFileSync(statePath);
  const baselineSha256 = sha256Bytes(baselineBytes);
  const baselineStages = canonicalJsonBytes(state.stages);

  const cases = [
    {
      name: "missing-candidate-id",
      command: "build:eligibility",
      mutate(environmentValue) {
        delete environmentValue.PRODUCTION_EVIDENCE_CANDIDATE_ID;
      },
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
    },
    {
      name: "malformed-candidate-id",
      command: "build:eligibility",
      mutate(environmentValue) {
        environmentValue.PRODUCTION_EVIDENCE_CANDIDATE_ID = "bad candidate";
      },
    },
    {
      name: "wrong-expected-candidate-id",
      command: "state:validate",
      mutate(environmentValue) {
        environmentValue.PRODUCTION_EVIDENCE_CANDIDATE_ID = "another-candidate";
      },
    },
    {
      name: "missing-state-path",
      command: "state:validate",
      mutate(environmentValue) {
        delete environmentValue.PRODUCTION_CERTIFICATION_STATE;
      },
    },
    {
      name: "malformed-invocation-mode",
      command: "state:validate:unknown",
      mutate() {},
    },
    {
      name: "missing-expected-source-comparator",
      command: "build:eligibility",
      mutate(environmentValue) {
        environmentValue.PRODUCTION_EVIDENCE_CANDIDATE_ID = state.candidate.id;
        delete environmentValue.CERTIFICATION_EXPECTED_TREE_SHA;
      },
    },
    {
      name: "unknown-environment-variable",
      command: "state:validate",
      mutate(environmentValue) {
        environmentValue.CERTIFICATION_UNKNOWN_MUTATION_SWITCH = "1";
      },
    },
    {
      name: "stale-expected-state-hash",
      command: "state:validate",
      mutate(environmentValue) {
        environmentValue.CERTIFICATION_EXPECTED_STATE_SHA256 = "f".repeat(64);
      },
    },
  ];

  for (const testCase of cases) {
    const invocationEnvironment = { ...environment };
    testCase.mutate(invocationEnvironment);
    const child = invokeCertification(
      canonicalRoot,
      testCase.command,
      invocationEnvironment,
    );
    assert.notEqual(child.status, 0, `${testCase.name} must fail closed`);
    const result = JSON.parse(child.stdout.trim());
    assert.equal(
      result.classification,
      testCase.classification ?? "PRECONDITION_ORCHESTRATION_FAILURE",
    );
    assert.equal(result.consumedSubstantiveGate, false);
    const afterBytes = readFileSync(statePath);
    assert.equal(afterBytes.equals(baselineBytes), true, testCase.name);
    assert.equal(sha256Bytes(afterBytes), baselineSha256, testCase.name);
    assert.equal(
      canonicalJsonBytes(readCertificationState(statePath).stages).equals(baselineStages),
      true,
      testCase.name,
    );
  }

  const unsealedPlanPath = path.join(
    simulation.simulationRoot,
    "evidence",
    "unsealed-invalidation-plan.json",
  );
  const unsealedPlan = createCertificationInvalidationPlan({
    state,
    stage: "source-validation",
    reason: "proven retained source mismatch",
    issues: ["retained source mismatch"],
  });
  delete unsealedPlan.seal;
  writeFileSync(unsealedPlanPath, canonicalJsonBytes(unsealedPlan));
  const unsealedPlanChild = invokeCertification(canonicalRoot, "state:reconcile", {
    ...environment,
    CERTIFICATION_INVALIDATION_PLAN: unsealedPlanPath,
    CERTIFICATION_EXPECTED_STATE_SHA256: baselineSha256,
  });
  assert.notEqual(unsealedPlanChild.status, 0, "unsealed plan must fail closed");
  const unsealedPlanResult = JSON.parse(unsealedPlanChild.stdout.trim());
  assert.equal(
    unsealedPlanResult.classification,
    "PRECONDITION_ORCHESTRATION_FAILURE",
  );
  assert.equal(unsealedPlanResult.consumedSubstantiveGate, false);
  assert.match(unsealedPlanResult.issues.join("\n"), /seal is missing or malformed/);
  assert.equal(readFileSync(statePath).equals(baselineBytes), true);
  assert.equal(sha256Bytes(readFileSync(statePath)), baselineSha256);
  assert.equal(
    canonicalJsonBytes(readCertificationState(statePath).stages).equals(baselineStages),
    true,
  );

  const pending = createCertificationState({
    certificationId: "transaction-plan-test",
    candidateId: "transaction-plan-candidate",
    commitSha: "a".repeat(40),
    treeSha: "b".repeat(40),
    parentSha: "c".repeat(40),
    harnessSourceSha256: "d".repeat(64),
    executionClass: "deterministic-simulation",
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const plan = createCertificationInvalidationPlan({
    state: pending,
    stage: "source-validation",
    reason: "proven retained source mismatch",
    issues: ["retained source mismatch"],
  });
  const changed = startCertificationStage(pending, {
    stage: "doctor",
    startedAt: "2026-08-15T00:00:00.100Z",
  });
  assert.throws(
    () =>
      reconcileCertificationState(changed, {
        plan,
        expectedStateSha256: certificationStateSha256(pending),
        invalidatedAt: "2026-08-15T00:00:00.200Z",
      }),
    /changed after invalidation plan creation/,
  );
  const reconciled = reconcileCertificationState(pending, {
    plan,
    expectedStateSha256: certificationStateSha256(pending),
    invalidatedAt: "2026-08-15T00:00:00.100Z",
  });
  assert.equal(reconciled.stages["source-validation"].status, "invalidated");
  assert.equal(pending.stages["source-validation"].status, "pending");

  const casRoot = mkdtempSync(path.join(tmpdir(), "certification-state-cas-"));
  const casPath = path.join(casRoot, "state.json");
  writeCertificationState(casPath, pending, { requireAbsent: true });
  const pendingSha256 = certificationStateSha256(pending);
  writeCertificationState(casPath, changed, {
    expectedCurrentSha256: pendingSha256,
  });
  const changedBytes = readFileSync(casPath);
  assert.throws(
    () =>
      writeCertificationState(casPath, reconciled, {
        expectedCurrentSha256: pendingSha256,
      }),
    /changed before atomic replacement/,
  );
  assert.equal(readFileSync(casPath).equals(changedBytes), true);
  writeFileSync(`${casPath}.lock`, "owned-by-another-writer\n");
  assert.throws(
    () =>
      writeCertificationState(casPath, changed, {
        expectedCurrentSha256: certificationStateSha256(changed),
      }),
    /EEXIST/,
  );
  assert.equal(existsSync(`${casPath}.lock`), true);
  rmSync(casRoot, { recursive: true, force: true });
}

await worktreeIsolationMatrix();
await transactionalValidationMatrix();

const realSource = readFileSync(
  path.join(repositoryRoot, "scripts/production-certification-real.mjs"),
  "utf8",
);
const worktreeSource = readFileSync(
  path.join(repositoryRoot, "scripts/production-certification-worktrees.mjs"),
  "utf8",
);
const cliSource = readFileSync(
  path.join(repositoryRoot, "scripts/production-certification.mjs"),
  "utf8",
);
const readOnlyGuardSource = realSource.slice(
  realSource.indexOf("async function requireLiveContext"),
  realSource.indexOf("function certificationTimestamp"),
);
assert.doesNotMatch(readOnlyGuardSource, /writeCertificationState|invalidateCertificationState/);
assert.match(realSource, /createCertificationValidationReport/);
assert.match(realSource, /reconcileCertificationState/);
assert.match(realSource, /role: "source-validation"/);
assert.match(realSource, /role: "final-artifact"/);
assert.match(realSource, /role: "development-browser"/);
const sourceStageOwner = realSource.slice(
  realSource.indexOf("export async function runSourceValidationStage"),
  realSource.indexOf("export async function runBuildStage"),
);
assert.match(sourceStageOwner, /repositoryRoot: context\.repositoryRoot/);
assert.doesNotMatch(sourceStageOwner, /ownerRepositoryRoot/);
assert.doesNotMatch(sourceStageOwner, /env: context\.environment/);
assert.equal(
  [...realSource.matchAll(/installAndBindRoleDependencies\(\{/g)].length,
  4,
);
assert.match(
  realSource,
  /\["playwright", "test", "--config", owner\.config, "--list"\],[\s\S]*?cwd: ownerRepositoryRoot/,
);
assert.doesNotMatch(realSource, /git\s+clean|-x\b/);
assert.doesNotMatch(worktreeSource, /git\s+clean|clean\s+-x|quarantine|restoration/);
assert.match(
  cliSource,
  /if \(status\.stdout !== ""\)[\s\S]*?NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT/,
);
const regressionMatrix = JSON.parse(
  readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-regressions.json"),
    "utf8",
  ),
);
assert.deepEqual(regressionMatrix.transactionalStateAndWorktreeCases, [
  "missing-candidate-id-state-immutability",
  "malformed-candidate-id-state-immutability",
  "wrong-candidate-comparator-state-immutability",
  "missing-state-path-no-creation",
  "malformed-validation-mode-state-immutability",
  "missing-source-comparator-state-immutability",
  "unknown-environment-control-state-immutability",
  "stale-expected-state-hash-rejected",
  "sealed-invalidation-plan-required",
  "stale-invalidation-plan-rejected",
  "canonical-ignored-artifact-noninterference",
  "external-target-symlink-noninterference",
  "source-worktree-copied-environment-rejected",
  "final-worktree-ignored-input-rejected",
  "development-worktree-shared-dependency-rejected",
  "stage-role-realpath-alias-rejected",
  "stage-worktree-wrong-identity-rejected",
  "stage-worktree-symlink-alias-rejected",
  "stage-worktree-premature-removal-rejected",
  "cross-certification-worktree-reuse-rejected",
  "canonical-checkout-as-stage-root-rejected",
  "task-worktree-only-cleanup",
]);
assert.equal(
  regressionMatrix.transactionalStateAndWorktreeCases.length,
  22,
  "production certification transactional state/worktree isolation tests passed",
);
assert.equal(harnessSourceIdentity(repositoryRoot).records.length > 0, true);
const projectedQualificationEnvironment = projectCertificationChildEnvironment({
  repositoryRoot,
  baseEnvironment: {
    ...process.env,
    NODE_OPTIONS: "--require=/canonical/ignored-hook.cjs",
    NODE_PATH: "/canonical/ignored-modules",
  },
  stage: "qualification",
  profileId: "qualification",
  stageInputs: {
    CERTIFICATION_ENVIRONMENT_STAGE: "qualification",
    CERTIFICATION_QUALIFICATION_MODE: "1",
  },
});
assert.equal(Object.hasOwn(projectedQualificationEnvironment.environment, "NODE_OPTIONS"), false);
assert.equal(Object.hasOwn(projectedQualificationEnvironment.environment, "NODE_PATH"), false);
assert.deepEqual(
  projectedQualificationEnvironment.metadata.strippedProcessModuleInfluenceVariables,
  ["NODE_OPTIONS", "NODE_PATH"],
);

console.log("production certification transactional state/worktree isolation tests passed");
