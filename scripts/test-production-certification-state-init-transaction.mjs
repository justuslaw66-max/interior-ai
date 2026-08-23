import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CERTIFICATION_HARNESS_SOURCE_PATHS,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import { initializeRealCertification } from "./production-certification-real.mjs";
import {
  createCertificationStageCommandResult,
  parseCertificationStageResult,
  validateCertificationStageResult,
} from "./production-certification-stage-result-contract.mjs";
import { readCertificationState } from "./production-certification-state.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  readCertificationPreStateFailureReceipt,
} from "./production-certification-worktrees.mjs";

const repositoryRoot = process.cwd();
const createdAt = "2026-08-24T00:00:00.000Z";
const root = mkdtempSync(path.join(tmpdir(), "certification-state-init-transaction-"));
const templateRoot = path.join(root, "template");
const cases = [];

function git(cwd, args, { allowFailure = false, trim = true } = {}) {
  const child = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.error || child.signal || (!allowFailure && child.status !== 0)) {
    throw new Error(String(child.stderr || child.stdout || child.error).trim());
  }
  if (child.status !== 0) return null;
  return trim ? child.stdout.trim() : child.stdout;
}

function initializeTemplate() {
  mkdirSync(templateRoot, { recursive: true, mode: 0o700 });
  cpSync(path.join(repositoryRoot, "scripts"), path.join(templateRoot, "scripts"), {
    recursive: true,
  });
  for (const relativePath of CERTIFICATION_HARNESS_SOURCE_PATHS) {
    const destination = path.join(templateRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    cpSync(path.join(repositoryRoot, relativePath), destination);
  }
  git(templateRoot, ["init", "-q"]);
  git(templateRoot, ["config", "user.name", "State init transaction test"]);
  git(templateRoot, ["config", "user.email", "state-init-transaction@example.test"]);
  git(templateRoot, ["add", "."]);
  git(templateRoot, ["commit", "-qm", "harness base"]);
  writeFileSync(path.join(templateRoot, "candidate-marker.txt"), "candidate\n");
  git(templateRoot, ["add", "candidate-marker.txt"]);
  git(templateRoot, ["commit", "-qm", "candidate"]);
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

let fixtureNumber = 0;
function fixture() {
  fixtureNumber += 1;
  const owner = path.join(root, `fixture-${String(fixtureNumber).padStart(2, "0")}`);
  const canonicalRoot = path.join(owner, "canonical");
  const evidenceRoot = path.join(owner, "evidence");
  const worktreeRoot = path.join(owner, "worktrees");
  mkdirSync(owner, { recursive: true, mode: 0o700 });
  git(owner, ["clone", "-q", templateRoot, canonicalRoot]);
  mkdirSync(evidenceRoot, { mode: 0o700 });
  mkdirSync(worktreeRoot, { mode: 0o700 });
  const candidate = {
    id: `state-init-transaction-candidate-${fixtureNumber}`,
    commitSha: git(canonicalRoot, ["rev-parse", "HEAD"]),
    treeSha: git(canonicalRoot, ["rev-parse", "HEAD^{tree}"]),
    parentSha: git(canonicalRoot, ["rev-parse", "HEAD^"]),
  };
  const certificationId = `state-init-transaction-${fixtureNumber}`;
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const nonce = `state-init-transaction-nonce-${String(fixtureNumber).padStart(4, "0")}`;
  const environment = {
    ...resourceEnvironment(evidenceRoot),
    PRODUCTION_CERTIFICATION_STATE: statePath,
    CERTIFICATION_WORKTREE_ROOT: worktreeRoot,
    PRODUCTION_CERTIFICATION_ID: certificationId,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: candidate.id,
    CERTIFICATION_EXPECTED_COMMIT_SHA: candidate.commitSha,
    CERTIFICATION_EXPECTED_TREE_SHA: candidate.treeSha,
    CERTIFICATION_EXPECTED_PARENT_SHA: candidate.parentSha,
    CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
    CERTIFICATION_QUALIFICATION_MODE: "1",
    CERTIFICATION_CREATED_AT: createdAt,
    CERTIFICATION_STAGE_RESULT_NONCE: nonce,
  };
  return {
    owner,
    canonicalRoot,
    evidenceRoot,
    worktreeRoot,
    candidate,
    certificationId,
    statePath,
    nonce,
    environment,
  };
}

function registeredPaths(canonicalRoot) {
  return git(canonicalRoot, ["worktree", "list", "--porcelain"], {
    trim: false,
  })
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)));
}

function candidateRegistrations(value) {
  const ownerRoot = realpathSync(value.worktreeRoot);
  return registeredPaths(value.canonicalRoot).filter((entry) =>
    entry.startsWith(`${ownerRoot}${path.sep}`),
  );
}

function trackedCheckoutSha256(canonicalRoot) {
  const paths = git(canonicalRoot, ["ls-files", "-z"], { trim: false })
    .split("\0")
    .filter(Boolean);
  return sha256Bytes(
    Buffer.concat(
      paths.flatMap((relativePath) => [
        Buffer.from(`${relativePath}\0`),
        readFileSync(path.join(canonicalRoot, relativePath)),
      ]),
    ),
  );
}

function expectPreStateFailure(value, testHooks = null) {
  let failure = null;
  try {
    initializeRealCertification({
      repositoryRoot: value.canonicalRoot,
      environment: value.environment,
      testHooks,
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, "state:init fixture must fail");
  assert.equal(existsSync(value.statePath), false);
  assert.ok(failure.certificationPreStateFailure);
  const receipt = readCertificationPreStateFailureReceipt({
    evidenceRoot: value.evidenceRoot,
    descriptor: failure.certificationPreStateFailure.descriptor,
    expectedInvocationNonce: value.nonce,
  });
  assert.equal(receipt.stateCreated, false);
  return { failure, receipt };
}

function spawnStateInitWrapper(value) {
  return spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "state:init"],
    {
      cwd: value.canonicalRoot,
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        LANG: process.env.LANG,
        ...value.environment,
      },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
}

function expectWrapperPreStateFailure(value) {
  const child = spawnStateInitWrapper(value);
  assert.equal(child.status, 1, child.stderr);
  assert.equal(child.signal, null);
  assert.match(
    child.stdout,
    /^INTERIOR_AI_CERTIFICATION_STAGE_RESULT_V1 /m,
    child.stderr,
  );
  const result = parseCertificationStageResult(child.stdout);
  const validation = validateCertificationStageResult({
    value: result,
    statePath: value.statePath,
    evidenceRoot: value.evidenceRoot,
    repositoryRoot: value.canonicalRoot,
    expectedCommand: "state:init",
    expectedInvocationNonce: value.nonce,
    expectedPreStateSha256: null,
    expectedCertificationId: value.certificationId,
    expectedCandidate: {
      id: value.candidate.id,
      commitSha: value.candidate.commitSha,
      treeSha: value.candidate.treeSha,
    },
    expectedHarnessSourceSha256: result.harness.sourceSha256,
    verifyCurrentSource: false,
  });
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.valid, true);
  const receipt = readCertificationPreStateFailureReceipt({
    evidenceRoot: value.evidenceRoot,
    descriptor: result.details.preStateFailure.receipt,
    expectedInvocationNonce: value.nonce,
  });
  return { result, receipt };
}

function assertSuccessfulRollback(value, receipt, createdCount) {
  assert.equal(receipt.createdResourceInventory.worktreeCount, createdCount);
  assert.equal(receipt.rollback.outcome, "completed");
  assert.equal(receipt.terminalRegistrationAbsence.proven, true);
  assert.equal(receipt.rollback.canonicalCheckoutUnchanged, true);
  assert.equal(
    receipt.rollback.worktrees.every((entry) => entry.physicalPathAbsent),
    true,
  );
  assert.equal(receipt.rollback.sidecars.every((entry) => entry.removed), true);
  assert.deepEqual(candidateRegistrations(value), []);
  assert.equal(
    existsSync(path.join(value.worktreeRoot, value.certificationId)),
    false,
  );
  assert.equal(existsSync(path.join(value.evidenceRoot, "worktrees")), false);
  assert.equal(existsSync(value.statePath), false);
}

initializeTemplate();

try {
  {
    const value = fixture();
    value.environment.CERTIFICATION_RUNTIME_REPORT_PATH =
      value.environment.CERTIFICATION_PHASE8_EVIDENCE_PATH;
    const { result, receipt } = expectWrapperPreStateFailure(value);
    assertSuccessfulRollback(value, receipt, 0);
    assert.equal(result.details.preStateFailure.stateCreated, false);
    const receiptPath = path.join(
      value.evidenceRoot,
      result.details.preStateFailure.receipt.path,
    );
    const retainedReceiptBytes = readFileSync(receiptPath);
    const repeated = spawnStateInitWrapper(value);
    assert.equal(repeated.status, 1);
    assert.doesNotMatch(
      repeated.stdout,
      /^INTERIOR_AI_CERTIFICATION_STAGE_RESULT_V1 /m,
    );
    assert.equal(readFileSync(receiptPath).equals(retainedReceiptBytes), true);
    assert.match(
      repeated.stderr,
      /pre-state failure receipt target is no longer absent/,
    );
    const alternateReceiptPath = path.join(
      value.evidenceRoot,
      "state-init/pre-state-failures/alternate-receipt.json",
    );
    copyFileSync(receiptPath, alternateReceiptPath);
    assert.throws(
      () =>
        readCertificationPreStateFailureReceipt({
          evidenceRoot: value.evidenceRoot,
          descriptor: {
            path: "state-init/pre-state-failures/alternate-receipt.json",
            sha256: result.details.preStateFailure.receipt.sha256,
          },
          expectedInvocationNonce: value.nonce,
        }),
      /invalid or stale/,
    );
    cases.push("resource-plan-conflict-zero-worktrees");
  }

  {
    const value = fixture();
    value.environment.CERTIFICATION_PHASE8_EVIDENCE_PATH = path.join(
      value.evidenceRoot,
      "phase8/evidence.json",
    );
    const { receipt } = expectPreStateFailure(value);
    assertSuccessfulRollback(value, receipt, 0);
    cases.push("phase8-file-directory-overlap-zero-worktrees");
  }

  for (const count of [1, 2]) {
    const value = fixture();
    const { receipt } = expectPreStateFailure(value, {
      failAfterWorktreeCount: count,
    });
    assertSuccessfulRollback(value, receipt, count);
    cases.push(`failure-after-${count === 1 ? "first" : "second"}-worktree-rolls-back`);
  }

  {
    const value = fixture();
    const { failure, receipt } = expectPreStateFailure(value, {
      failBeforeStateWrite: true,
    });
    assertSuccessfulRollback(value, receipt, 3);
    const result = createCertificationStageCommandResult({
      invocation: {
        command: "state:init",
        nonce: value.nonce,
        statePath: value.statePath,
        preState: null,
        preStateSha256: null,
        capturedAt: createdAt,
      },
      commandError: failure,
      wrapperExitCode: 1,
      evidenceRoot: value.evidenceRoot,
      completedAt: createdAt,
    });
    const validation = validateCertificationStageResult({
      value: result,
      statePath: value.statePath,
      evidenceRoot: value.evidenceRoot,
      repositoryRoot: value.canonicalRoot,
      expectedCommand: "state:init",
      expectedInvocationNonce: value.nonce,
      expectedPreStateSha256: null,
      expectedCertificationId: value.certificationId,
      expectedCandidate: {
        id: value.candidate.id,
        commitSha: value.candidate.commitSha,
        treeSha: value.candidate.treeSha,
      },
      expectedHarnessSourceSha256: result.harness.sourceSha256,
      verifyCurrentSource: false,
    });
    assert.deepEqual(validation.issues, []);
    assert.equal(validation.valid, true);
    assert.equal(validation.nextStateSha256, null);
    assert.equal(JSON.stringify(result).includes(value.owner), false);
    cases.push("failure-after-all-three-before-state-write-rolls-back");
    cases.push("truthful-non-state-stage-result-is-portable-and-consumable");
  }

  {
    const value = fixture();
    writeFileSync(`${value.statePath}.lock`, "foreign publication lock\n");
    const { receipt } = expectPreStateFailure(value);
    assertSuccessfulRollback(value, receipt, 3);
    cases.push("state-publication-failure-rolls-back-provisional-resources");
  }

  {
    const value = fixture();
    const { receipt } = expectPreStateFailure(value, {
      failBeforeStateWrite: true,
      failRollbackRole: "source-validation",
    });
    assert.equal(receipt.rollback.outcome, "failed");
    assert.equal(receipt.terminalRegistrationAbsence.proven, false);
    assert.equal(
      receipt.terminalRegistrationAbsence.roleResults["source-validation"],
      false,
    );
    assert.ok(receipt.rollback.issues.includes("registration-remains:source-validation"));
    assert.equal(candidateRegistrations(value).length, 1);
    cases.push("cleanup-failure-retained-without-absence-claim");
  }

  {
    const value = fixture();
    const foreignPath = path.join(value.owner, "foreign-worktree");
    const historicalPath = path.join(value.worktreeRoot, "historical-certification");
    git(value.canonicalRoot, ["worktree", "add", "--detach", foreignPath, value.candidate.commitSha]);
    git(value.canonicalRoot, ["worktree", "add", "--detach", historicalPath, value.candidate.commitSha]);
    const before = trackedCheckoutSha256(value.canonicalRoot);
    const { receipt } = expectPreStateFailure(value, {
      failBeforeStateWrite: true,
    });
    assert.equal(trackedCheckoutSha256(value.canonicalRoot), before);
    assert.equal(receipt.rollback.canonicalCheckoutUnchanged, true);
    const registrations = registeredPaths(value.canonicalRoot);
    assert.ok(registrations.includes(realpathSync(foreignPath)));
    assert.ok(registrations.includes(realpathSync(historicalPath)));
    assert.equal(
      registrations.some((entry) =>
        entry.startsWith(
          `${realpathSync(value.worktreeRoot)}${path.sep}${value.certificationId}${path.sep}`,
        ),
      ),
      false,
    );
    cases.push("foreign-and-historical-worktrees-survive");
    cases.push("canonical-checkout-byte-identical-and-registrations-absent");
  }

  {
    const value = fixture();
    const initialized = initializeRealCertification({
      repositoryRoot: value.canonicalRoot,
      environment: value.environment,
    });
    const state = readCertificationState(value.statePath);
    assert.equal(initialized.stateSha256.length, 64);
    assert.deepEqual(Object.keys(state.worktrees.roles).sort(), [
      ...CERTIFICATION_WORKTREE_ROLES,
    ].sort());
    assert.equal(candidateRegistrations(value).length, 3);
    cases.push("successful-state-init-creates-three-worktrees-and-state");
  }

  {
    const value = fixture();
    let failure = null;
    try {
      initializeRealCertification({
        repositoryRoot: value.canonicalRoot,
        environment: value.environment,
        testHooks: { failAfterStateWrite: true },
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure);
    assert.equal(existsSync(value.statePath), true);
    assert.equal(candidateRegistrations(value).length, 3);
    assert.equal(failure.certificationPreStateFailure, undefined);
    assert.equal(
      existsSync(path.join(value.evidenceRoot, "state-init/pre-state-failures")),
      false,
    );
    const wrapperSource = readFileSync(
      path.join(repositoryRoot, "scripts/production-certification.mjs"),
      "utf8",
    );
    assert.match(
      wrapperSource,
      /command === "state:init" &&[\s\S]*?!existsSync\(process\.env\.PRODUCTION_CERTIFICATION_STATE\)/,
    );
    assert.doesNotMatch(
      wrapperSource,
      /\n\s*!existsSync\(process\.env\.PRODUCTION_CERTIFICATION_STATE\)\s*\|\|/,
    );
    cases.push("post-state-failure-keeps-existing-state-backed-policy");
  }

  const expectedCases = [
    "resource-plan-conflict-zero-worktrees",
    "phase8-file-directory-overlap-zero-worktrees",
    "failure-after-first-worktree-rolls-back",
    "failure-after-second-worktree-rolls-back",
    "failure-after-all-three-before-state-write-rolls-back",
    "truthful-non-state-stage-result-is-portable-and-consumable",
    "state-publication-failure-rolls-back-provisional-resources",
    "cleanup-failure-retained-without-absence-claim",
    "foreign-and-historical-worktrees-survive",
    "canonical-checkout-byte-identical-and-registrations-absent",
    "successful-state-init-creates-three-worktrees-and-state",
    "post-state-failure-keeps-existing-state-backed-policy",
  ];
  assert.deepEqual(cases, expectedCases);
  const regressionMatrix = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "scripts/production-certification-regressions.json"),
      "utf8",
    ),
  );
  assert.deepEqual(regressionMatrix.stateInitWorktreeTransactionCases, expectedCases);
  process.stdout.write(
    `${canonicalJsonBytes({ valid: true, cases: cases.length }).toString("utf8")}`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
