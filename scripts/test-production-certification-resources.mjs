import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PRODUCTION_CERTIFICATION_STATE_SCHEMA,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  assertCurrentCertificationResourcePlan,
  createCertificationResourcePlan,
  resolveCertificationResourceDestinations,
} from "./production-certification-resource-plan.mjs";
import { resolveCertificationExternalDestination } from "./playwright-report-path.mjs";
import {
  runCertificationResourcePreparation,
  validateCertificationResourcePreparation,
} from "./production-certification-resources.mjs";
import {
  certificationStateSha256,
  createCertificationState,
  readCertificationState,
  sealCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  createCertificationStageWorktrees,
  resolveCertificationStageWorktree,
} from "./production-certification-worktrees.mjs";

const repositoryRoot = process.cwd();

function git(root, args) {
  const child = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (child.status !== 0 || child.signal) {
    throw new Error(String(child.stderr || child.stdout).trim());
  }
  return child.stdout.trim();
}

function resourceEnvironment(evidenceRoot) {
  const environment = {
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    PHASE8_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
    CERTIFICATION_RUNTIME_REPORT_PATH: path.join(
      evidenceRoot,
      "runtime-smoke/playwright-report.json",
    ),
    CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH: path.join(
      evidenceRoot,
      "runtime-smoke/phase-timings.json",
    ),
    CERTIFICATION_RUNTIME_EVIDENCE_PATH: path.join(
      evidenceRoot,
      "runtime-smoke/evidence.json",
    ),
    CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
      evidenceRoot,
      "phase8-summary/evidence.json",
    ),
  };
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    environment[
      `CERTIFICATION_BROWSER_${owner.id.toUpperCase().replaceAll("-", "_")}_REPORT_PATH`
    ] = path.join(evidenceRoot, "browser-reports", owner.id, "playwright.json");
  }
  return environment;
}

function expectFailure(action, pattern) {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.match(message, pattern);
  return message;
}

function initializeRepository(root) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  mkdirSync(path.join(root, "docs/qa"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), "{\"private\":true}\n");
  writeFileSync(
    path.join(root, "docs/qa/production-certification-contract.v1.json"),
    readFileSync(
      path.join(repositoryRoot, "docs/qa/production-certification-contract.v1.json"),
    ),
  );
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Resource preparation test"]);
  git(root, ["config", "user.email", "resource-preparation@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "resource preparation base"]);
  writeFileSync(path.join(root, "candidate.txt"), "candidate\n");
  git(root, ["add", "candidate.txt"]);
  git(root, ["commit", "-qm", "resource preparation candidate"]);
  return {
    id: "resource-preparation-candidate",
    commitSha: git(root, ["rev-parse", "HEAD"]),
    treeSha: git(root, ["rev-parse", "HEAD^{tree}"]),
    parentSha: git(root, ["rev-parse", "HEAD^"]),
  };
}

function fixture() {
  const owner = mkdtempSync(path.join(tmpdir(), "certification-resources-"));
  const canonicalRoot = path.join(owner, "source");
  const evidenceRoot = path.join(owner, "evidence");
  const worktreeRoot = path.join(owner, "worktrees");
  mkdirSync(evidenceRoot, { mode: 0o700 });
  mkdirSync(worktreeRoot, { mode: 0o700 });
  const candidate = initializeRepository(canonicalRoot);
  const certificationId = `resource-preparation-${path.basename(owner).slice(-6)}`;
  const worktrees = createCertificationStageWorktrees({
    canonicalRoot,
    evidenceRoot,
    worktreeRoot,
    certificationId,
    candidate,
    createdAt: "2026-08-16T00:00:00.000Z",
  });
  const environment = resourceEnvironment(evidenceRoot);
  const resourcePlan = createCertificationResourcePlan({
    repositoryRoot: canonicalRoot,
    evidenceRoot,
    environment,
  });
  const state = createCertificationState({
    certificationId,
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    treeSha: candidate.treeSha,
    parentSha: candidate.parentSha,
    harnessSourceSha256: "a".repeat(64),
    executionClass: "deterministic-simulation",
    createdAt: "2026-08-16T00:00:00.000Z",
    worktrees,
    resourcePlan,
  });
  const statePath = path.join(evidenceRoot, "certification-state.json");
  writeCertificationState(statePath, state, { requireAbsent: true });
  const worktreePaths = CERTIFICATION_WORKTREE_ROLES.map(
    (role) =>
      resolveCertificationStageWorktree({
        state,
        evidenceRoot,
        canonicalRoot,
        role,
        phase: "pristine",
      }).root,
  );
  return {
    owner,
    canonicalRoot,
    evidenceRoot,
    environment: {
      ...environment,
      PRODUCTION_CERTIFICATION_STATE: statePath,
      CERTIFICATION_QUALIFICATION_MODE: "1",
      CERTIFICATION_RESOURCE_PREPARATION_STARTED_AT:
        "2026-08-16T00:00:00.100Z",
      CERTIFICATION_RESOURCE_PREPARATION_COMPLETED_AT:
        "2026-08-16T00:00:00.200Z",
    },
    statePath,
    worktreePaths,
  };
}

function cleanupFixture(value) {
  for (const worktree of value.worktreePaths) {
    spawnSync("git", ["worktree", "remove", "--force", worktree], {
      cwd: value.canonicalRoot,
      encoding: "utf8",
    });
  }
  rmSync(value.owner, { recursive: true, force: true });
}

{
  const owner = mkdtempSync(path.join(tmpdir(), "resource-path-safety-"));
  const evidenceRoot = path.join(owner, "evidence");
  mkdirSync(evidenceRoot, { mode: 0o700 });
  const environment = resourceEnvironment(evidenceRoot);
  try {
    const plan = createCertificationResourcePlan({
      repositoryRoot,
      evidenceRoot,
      environment,
    });
    assert.equal(plan.destinations.length, 17);
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_RUNTIME_REPORT_PATH: path.join(owner, "outside.json"),
          },
        }),
      /beneath its authorized root/,
    );
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_RUNTIME_REPORT_PATH: "relative/report.json",
          },
        }),
      /must be absolute/,
    );
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot: "relative-root",
          environment,
        }),
      /absolute|ENOENT/,
    );
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_RUNTIME_REPORT_PATH: `${evidenceRoot}/bad\0name.json`,
          },
        }),
      /malformed/,
    );
    const parentFile = path.join(evidenceRoot, "parent-file");
    writeFileSync(parentFile, "not a directory\n");
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(parentFile, "evidence.json"),
          },
        }),
      /physical directories/,
    );
    const outside = path.join(owner, "outside");
    mkdirSync(outside);
    symlinkSync(outside, path.join(evidenceRoot, "escape"));
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
              evidenceRoot,
              "escape/evidence.json",
            ),
          },
        }),
      /physical directories/,
    );
    const existingParent = path.join(evidenceRoot, "existing");
    mkdirSync(existingParent);
    const existingTarget = path.join(existingParent, "evidence.json");
    writeFileSync(existingTarget, "{}\n");
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_PHASE8_EVIDENCE_PATH: existingTarget,
          },
        }),
      /must remain absent/,
    );
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH:
              environment.CERTIFICATION_RUNTIME_REPORT_PATH,
          },
        }),
      /duplicate certification resource destination/,
    );
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
              evidenceRoot,
              "phase8/evidence.json",
            ),
          },
        }),
      /conflicting certification resource destination types/,
    );
    const changed = {
      ...environment,
      CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
        evidenceRoot,
        "changed/evidence.json",
      ),
    };
    expectFailure(
      () =>
        assertCurrentCertificationResourcePlan({
          statePlan: plan,
          repositoryRoot,
          evidenceRoot,
          environment: changed,
        }),
      /changed after state initialization/,
    );
    expectFailure(
      () =>
        assertCurrentCertificationResourcePlan({
          statePlan: { ...plan, contractMatrixSha256: "b".repeat(64) },
          repositoryRoot,
          evidenceRoot,
          environment,
        }),
      /changed after state initialization/,
    );
    const fakeWorktree = path.join(evidenceRoot, "fake-stage-worktree");
    mkdirSync(fakeWorktree);
    expectFailure(
      () =>
        resolveCertificationResourceDestinations({
          repositoryRoot,
          evidenceRoot,
          environment,
          additionalRepositoryRoots: [fakeWorktree],
        }),
      /cannot contain a worktree/,
    );
    const unwritable = path.join(evidenceRoot, "unwritable");
    mkdirSync(unwritable, { mode: 0o500 });
    expectFailure(
      () =>
        resolveCertificationExternalDestination({
          requestedPath: path.join(unwritable, "evidence.json"),
          repositoryRoot,
          authorizedExternalRoot: evidenceRoot,
          targetType: "file",
          expectedSuffix: ".json",
          requireExistingParents: true,
        }),
      /not writable/,
    );
    chmodSync(unwritable, 0o700);
    expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot: repositoryRoot,
          environment: resourceEnvironment(repositoryRoot),
        }),
      /outside every repository worktree/,
    );
    const secret = "raw-secret-must-not-appear";
    const message = expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot,
          environment: {
            ...environment,
            CERTIFICATION_RUNTIME_REPORT_PATH: secret,
          },
        }),
      /must be absolute/,
    );
    assert.equal(message.includes(secret), false);
    const filesystemSecret = "raw-filesystem-secret-must-not-appear";
    const missingRoot = path.join(owner, filesystemSecret);
    const filesystemMessage = expectFailure(
      () =>
        createCertificationResourcePlan({
          repositoryRoot,
          evidenceRoot: missingRoot,
          environment: resourceEnvironment(missingRoot),
        }),
      /external-root validation failed \(ENOENT\)/,
    );
    assert.equal(filesystemMessage.includes(filesystemSecret), false);
    assert.equal(filesystemMessage.includes(missingRoot), false);
  } finally {
    rmSync(owner, { recursive: true, force: true });
  }
}

{
  const value = fixture();
  try {
    const initial = readCertificationState(value.statePath);
    let conflictingTarget = null;
    expectFailure(
      () =>
        runCertificationResourcePreparation({
          repositoryRoot: value.canonicalRoot,
          environment: {
            ...value.environment,
            CERTIFICATION_EXPECTED_STATE_SHA256:
              certificationStateSha256(initial),
          },
          postCommitValidationHook: ({ evidenceRoot, state }) => {
            conflictingTarget = path.join(
              evidenceRoot,
              state.resourcePlan.destinations[0].portableRelativePath,
            );
            writeFileSync(conflictingTarget, "{}\n");
          },
        }),
      /must remain absent/,
    );
    const committed = readCertificationState(value.statePath);
    const evidencePath = path.join(
      value.evidenceRoot,
      committed.resourcePreparation.evidence.path,
    );
    assert.equal(existsSync(evidencePath), true);
    assert.equal(
      sha256Bytes(readFileSync(evidencePath)),
      committed.resourcePreparation.evidence.sha256,
    );
    unlinkSync(conflictingTarget);
    const retry = runCertificationResourcePreparation({
      repositoryRoot: value.canonicalRoot,
      environment: {
        ...value.environment,
        CERTIFICATION_EXPECTED_STATE_SHA256:
          certificationStateSha256(committed),
      },
    });
    assert.equal(retry.valid, true);
    assert.equal(retry.idempotent, true);
    assert.equal(retry.evidence.sha256, committed.resourcePreparation.evidence.sha256);
  } finally {
    cleanupFixture(value);
  }
}

{
  const value = fixture();
  try {
    const initial = readCertificationState(value.statePath);
    const prepared = runCertificationResourcePreparation({
      repositoryRoot: value.canonicalRoot,
      environment: {
        ...value.environment,
        CERTIFICATION_EXPECTED_STATE_SHA256: certificationStateSha256(initial),
      },
    });
    assert.equal(prepared.valid, true);
    assert.equal(prepared.idempotent, false);
    let state = readCertificationState(value.statePath);
    assert.equal(state.schema, PRODUCTION_CERTIFICATION_STATE_SCHEMA);
    assert.equal(
      state.resourcePlan.destinations.some((destination) =>
        existsSync(
          path.join(value.evidenceRoot, destination.portableRelativePath),
        ),
      ),
      false,
    );
    assert.equal(
      validateCertificationResourcePreparation({
        repositoryRoot: value.canonicalRoot,
        evidenceRoot: value.evidenceRoot,
        environment: value.environment,
        state,
      }).valid,
      true,
    );
    const second = runCertificationResourcePreparation({
      repositoryRoot: value.canonicalRoot,
      environment: {
        ...value.environment,
        CERTIFICATION_EXPECTED_STATE_SHA256: certificationStateSha256(state),
      },
    });
    assert.equal(second.idempotent, true);
    assert.equal(second.evidence.sha256, prepared.evidence.sha256);
    expectFailure(
      () =>
        runCertificationResourcePreparation({
          repositoryRoot: value.canonicalRoot,
          environment: {
            ...value.environment,
            CERTIFICATION_EXPECTED_STATE_SHA256: certificationStateSha256(initial),
          },
        }),
      /changed before atomic transition/,
    );
    const evidencePath = path.join(
      value.evidenceRoot,
      state.resourcePreparation.evidence.path,
    );
    const originalEvidenceBytes = readFileSync(evidencePath);
    writeFileSync(evidencePath, Buffer.concat([originalEvidenceBytes, Buffer.from(" ")]));
    expectFailure(
      () =>
        validateCertificationResourcePreparation({
          repositoryRoot: value.canonicalRoot,
          evidenceRoot: value.evidenceRoot,
          environment: value.environment,
          state,
        }),
      /hash changed/,
    );
    writeFileSync(evidencePath, originalEvidenceBytes);
    const evidence = JSON.parse(originalEvidenceBytes.toString("utf8"));
    const probePath = path.join(
      value.evidenceRoot,
      evidence.destinations[0].siblingProbe.portableProbePath,
    );
    writeFileSync(probePath, "left behind\n");
    expectFailure(
      () =>
        validateCertificationResourcePreparation({
          repositoryRoot: value.canonicalRoot,
          evidenceRoot: value.evidenceRoot,
          environment: value.environment,
          state,
        }),
      /stale/,
    );
    unlinkSync(probePath);
    const finalTarget = path.join(
      value.evidenceRoot,
      state.resourcePlan.destinations[0].portableRelativePath,
    );
    writeFileSync(finalTarget, "{}\n");
    expectFailure(
      () =>
        validateCertificationResourcePreparation({
          repositoryRoot: value.canonicalRoot,
          evidenceRoot: value.evidenceRoot,
          environment: value.environment,
          state,
        }),
      /must remain absent/,
    );
    unlinkSync(finalTarget);
    const replaceableParent = path.join(value.evidenceRoot, "phase8-summary");
    rmSync(replaceableParent, { recursive: true });
    writeFileSync(replaceableParent, "parent replaced by file\n");
    expectFailure(
      () =>
        validateCertificationResourcePreparation({
          repositoryRoot: value.canonicalRoot,
          evidenceRoot: value.evidenceRoot,
          environment: value.environment,
          state,
        }),
      /physical directories/,
    );
    unlinkSync(replaceableParent);
    mkdirSync(replaceableParent);
    const other = JSON.parse(originalEvidenceBytes.toString("utf8"));
    other.certificationId = "another-rehearsal";
    delete other.seal;
    delete other.aggregateEvidenceSha256;
    other.aggregateEvidenceSha256 = sha256Bytes(canonicalJsonBytes(other));
    other.seal = {
      algorithm: "sha256",
      sha256: createHash("sha256")
        .update(
          Buffer.concat([
            Buffer.from(
              "interior-ai.production-certification-resource-preparation-seal.v1\n",
            ),
            canonicalJsonBytes(other),
          ]),
        )
        .digest("hex"),
    };
    const otherBytes = canonicalJsonBytes(other);
    writeFileSync(evidencePath, otherBytes);
    const otherDescriptor = {
      path: state.resourcePreparation.evidence.path,
      sha256: sha256Bytes(otherBytes),
    };
    const changedState = structuredClone(state);
    changedState.bindings.resourcePreparationSha256 = otherDescriptor.sha256;
    changedState.evidenceFiles["resource-preparation"] = otherDescriptor;
    changedState.resourcePreparation.evidence = otherDescriptor;
    state = sealCertificationState(changedState);
    writeCertificationState(value.statePath, state, {
      expectedCurrentSha256: certificationStateSha256(
        readCertificationState(value.statePath),
      ),
    });
    expectFailure(
      () =>
        validateCertificationResourcePreparation({
          repositoryRoot: value.canonicalRoot,
          evidenceRoot: value.evidenceRoot,
          environment: value.environment,
          state,
        }),
      /belongs to another state or contract/,
    );
  } finally {
    cleanupFixture(value);
  }
}

console.log("Production certification resource preparation tests passed.");
