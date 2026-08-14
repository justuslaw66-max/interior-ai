import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  canonicalJsonBytes,
  harnessSourceIdentity,
  sha256Bytes,
  sourceValidationCheckSet,
} from "./production-certification-contract.mjs";
import {
  completeCertificationStage,
  createCertificationState,
  startCertificationStage,
} from "./production-certification-state.mjs";
import {
  sourceValidationStageEvidence,
  validateSourceValidationEvidence,
} from "./production-certification-source-continuity.mjs";

const FIXED_GIT_DATE = "2026-08-14T00:00:00Z";
const FIXTURE_DATABASE_URL =
  "postgresql://certification:certification@127.0.0.1:1/certification";
const repositoryRoot = process.cwd();

function run(command, args, cwd, environment = process.env) {
  const child = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (child.error || child.signal || child.status !== 0) {
    throw new Error(`${command} stage-environment regression setup failed`);
  }
  return child.stdout.trim();
}

function copyCurrentSource(sourceRoot) {
  const inventory = run(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    repositoryRoot,
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const relativePath of inventory) {
    const sourcePath = path.join(repositoryRoot, relativePath);
    if (!existsSync(sourcePath)) continue;
    const destination = path.join(sourceRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(sourcePath, destination, {
      recursive: lstatSync(sourcePath).isDirectory(),
      verbatimSymlinks: true,
    });
  }
  symlinkSync(
    path.join(repositoryRoot, "node_modules"),
    path.join(sourceRoot, "node_modules"),
    "dir",
  );
}

function initializeGit(sourceRoot) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
  };
  run("git", ["init", "-q"], sourceRoot, environment);
  run("git", ["config", "user.name", "Certification regression"], sourceRoot);
  run(
    "git",
    ["config", "user.email", "certification-regression@example.test"],
    sourceRoot,
  );
  run("git", ["add", "."], sourceRoot, environment);
  run("git", ["commit", "-qm", "stage environment regression fixture"], sourceRoot, environment);
  const parentSha = run("git", ["rev-parse", "HEAD"], sourceRoot);
  run(
    "git",
    ["commit", "--allow-empty", "-qm", "stage environment regression candidate"],
    sourceRoot,
    environment,
  );
  return {
    commitSha: run("git", ["rev-parse", "HEAD"], sourceRoot),
    treeSha: run("git", ["rev-parse", "HEAD^{tree}"], sourceRoot),
    parentSha,
  };
}

function diagnosticTail(filePath) {
  if (!filePath || !existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(
      /\b([A-Z0-9_]*(?:COOKIE|SECRET|TOKEN|PASSWORD|DATABASE_URL)[A-Z0-9_]*)=\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .trim()
    .split("\n")
    .slice(-20)
    .join("\n");
}

const regressionRoot = mkdtempSync(
  path.join(tmpdir(), "production-certification-stage-environment-regression-"),
);
try {
  const sourceRoot = path.join(regressionRoot, "source");
  const evidenceRoot = path.join(regressionRoot, "evidence");
  mkdirSync(sourceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  copyCurrentSource(sourceRoot);
  const identity = initializeGit(sourceRoot);
  const harness = harnessSourceIdentity(sourceRoot);
  let state = createCertificationState({
    certificationId: "stage-environment-regression",
    candidateId: "stage-environment-regression-candidate",
    commitSha: identity.commitSha,
    treeSha: identity.treeSha,
    parentSha: identity.parentSha,
    harnessSourceSha256: harness.sha256,
    executionClass: "real-candidate",
    createdAt: "2026-08-14T00:01:00.000Z",
  });
  state = startCertificationStage(state, {
    stage: "doctor",
    startedAt: "2026-08-14T00:01:01.000Z",
  });
  const doctorRelativePath = "doctor/attempt-001.json";
  const doctorPath = path.join(evidenceRoot, doctorRelativePath);
  const doctorBytes = canonicalJsonBytes({
    schema: "interior-ai.production-certification-doctor-regression-fixture.v1",
    valid: true,
  });
  mkdirSync(path.dirname(doctorPath), { recursive: true, mode: 0o700 });
  writeFileSync(doctorPath, doctorBytes, { mode: 0o600 });
  const doctorSha256 = sha256Bytes(doctorBytes);
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-14T00:01:02.000Z",
    exitCode: 0,
    outputHashes: { doctor: doctorSha256 },
    evidenceFiles: {
      doctor: { path: doctorRelativePath, sha256: doctorSha256 },
    },
  });
  state = startCertificationStage(state, {
    stage: "source-validation",
    startedAt: "2026-08-14T00:01:03.000Z",
  });
  const result = sourceValidationStageEvidence({
    repositoryRoot: sourceRoot,
    evidenceRoot,
    state,
    environment: {
      ...process.env,
      DATABASE_URL: FIXTURE_DATABASE_URL,
      CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
      PRODUCTION_CERTIFICATION_STATE: path.join(
        evidenceRoot,
        "certification-state.json",
      ),
      CERTIFICATION_RUNTIME_REPORT_PATH: path.join(
        evidenceRoot,
        "runtime/report.json",
      ),
      CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH: path.join(
        evidenceRoot,
        "runtime/timings.json",
      ),
      CERTIFICATION_RUNTIME_EVIDENCE_PATH: path.join(
        evidenceRoot,
        "runtime/evidence.json",
      ),
      CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
        evidenceRoot,
        "phase8/evidence.json",
      ),
      PHASE8_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
      CERTIFICATION_BROWSER_FLOOR_PLAN_UPLOAD_REPORT_PATH: path.join(
        evidenceRoot,
        "browser/floor-plan-upload.json",
      ),
    },
  });
  if (!result.passed) {
    const failed = result.evidence.checks.at(-1);
    throw new Error(
      [
        `source stage regression failed: ${result.failedCheckId}`,
        JSON.stringify(failed?.process ?? null),
        diagnosticTail(
          failed?.stderr?.path
            ? path.join(evidenceRoot, failed.stderr.path)
            : null,
        ),
        diagnosticTail(
          failed?.stdout?.path
            ? path.join(evidenceRoot, failed.stdout.path)
            : null,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  assert.equal(result.evidence.checks.length, 19);
  const first = result.evidence.checks[0];
  assert.equal(first.id, "production-artifact-evidence-contracts");
  assert.equal(first.invocationMode, "canonical-real");
  assert.equal(first.invokedCommand, "npm run test:production-artifact-evidence");
  assert.equal(first.passed, true);
  assert.equal(first.environmentProfileId, "source-validation");
  assert.equal(first.environment.environmentNames.includes("DATABASE_URL"), true);
  assert.equal(
    first.environment.environmentNames.includes("CERTIFICATION_EVIDENCE_ROOT"),
    false,
  );
  assert.equal(
    first.environment.environmentNames.includes(
      "CERTIFICATION_RUNTIME_START_MARKER_PATH",
    ),
    false,
  );
  assert.equal(
    first.environment.strippedKnownCertificationControlVariables.includes(
      "CERTIFICATION_EVIDENCE_ROOT",
    ),
    true,
  );
  assert.equal(existsSync(path.join(evidenceRoot, first.stdout.path)), true);
  assert.equal(existsSync(path.join(evidenceRoot, first.stderr.path)), true);
  assert.equal(existsSync(path.join(evidenceRoot, result.descriptor.path)), true);
  assert.equal(JSON.stringify(result.evidence).includes(FIXTURE_DATABASE_URL), false);
  assert.equal(
    validateSourceValidationEvidence({
      evidence: result.evidence,
      evidenceRoot,
      state,
      repositoryRoot: sourceRoot,
    }).valid,
    true,
  );
  assert.equal(sourceValidationCheckSet(sourceRoot).checks.length, 19);
  process.stdout.write(
    "Production certification stage-environment real-runner regression passed.\n",
  );
} finally {
  rmSync(regressionRoot, { recursive: true, force: true });
}
