import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { authorizeRuntimeSmokeReportPath } from "./playwright-report-path.mjs";

const runtimeSmokeSource = readFileSync(
  path.join(process.cwd(), "tests/e2e/00-runtime-smoke.spec.ts"),
  "utf8",
);
const playwrightConfigSource = readFileSync(
  path.join(process.cwd(), "playwright.config.ts"),
  "utf8",
);
const workflowSource = readFileSync(
  path.join(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

assert.match(
  runtimeSmokeSource,
  /test\.use\(\{\s*trace: "off",\s*video: "off",\s*\}\);/,
  "the constrained production runtime smoke must not continuously record raw trace/video",
);
assert.match(
  playwrightConfigSource,
  /trace: "retain-on-failure",[\s\S]*video: "retain-on-failure"/,
  "non-runtime-smoke tests must retain the existing diagnostic defaults",
);
assert.match(
  playwrightConfigSource,
  /screenshot: "only-on-failure"/,
  "runtime failures must retain the existing screenshot diagnostic",
);
assert.match(
  workflowSource,
  /required_files=\(manifest\.json runtime-smoke\.json runtime-smoke-phases\.json\)/,
  "the safe structured failure artifact contract must remain unchanged",
);
assert.doesNotMatch(
  workflowSource,
  /required_files=\([^\n]*(?:trace\.zip|video\.webm)/,
  "raw trace/video must not become required external evidence",
);
const requiredSnapshotLogSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf('"[runtime-smoke-required-snapshot]"'),
  runtimeSmokeSource.indexOf("const waitForModelDiagnosticsReady"),
);
assert.match(
  requiredSnapshotLogSource,
  /snapshotSummary:\s*\{[\s\S]*safeReadinessSummary:\s*snapshot\.safeReadinessSummary/,
  "required snapshot stdout must retain a bounded safe lifecycle/cache summary",
);
assert.doesNotMatch(
  requiredSnapshotLogSource,
  /\n\s+snapshot,\n/,
  "required snapshot stdout must not duplicate the complete diagnostic object graph",
);

assert.match(
  playwrightConfigSource,
  /retries: 0/,
  "runtime-smoke report re-entry must not enable Playwright retries",
);

{
  const repositoryRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-report-owner-repository-"),
  );
  const evidenceContainer = mkdtempSync(
    path.join(tmpdir(), "runtime-report-owner-evidence-"),
  );
  const broaderEvidenceRoot = path.join(evidenceContainer, "authorized");
  const evidenceRoot = path.join(broaderEvidenceRoot, "exact-root");
  const reportParent = path.join(evidenceRoot, "runtime-smoke");
  const reportPath = path.join(reportParent, "playwright-report.json");
  const authorizationPath = `${reportPath}.owner.json`;
  const secret = "runtime-report-owner-secret-must-not-leak";
  const environment = {
    CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
    CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "1",
    PRODUCTION_CERTIFICATION_ID: "certification-runtime-owner",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: "candidate-runtime-owner",
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE:
      "123e4567-e89b-42d3-a456-426614174001",
    DATABASE_URL: secret,
  };
  try {
    mkdirSync(reportParent, { recursive: true, mode: 0o700 });

    const initial = authorizeRuntimeSmokeReportPath({
      requestedPath: reportPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      environment,
    });
    assert.equal(initial.authorization.status, "initial");
    assert.equal(
      initial.authorization.reportRelativePath,
      "runtime-smoke/playwright-report.json",
    );

    const reentry = authorizeRuntimeSmokeReportPath({
      requestedPath: reportPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      environment,
    });
    assert.equal(reentry.authorization.status, "same-run-reentry");

    for (const [name, value] of [
      ["CERTIFICATION_RUNTIME_STAGE_ATTEMPT", "2"],
      [
        "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE",
        "223e4567-e89b-42d3-a456-426614174002",
      ],
      ["PRODUCTION_EVIDENCE_CANDIDATE_ID", "candidate-runtime-foreign"],
      ["PRODUCTION_CERTIFICATION_ID", "certification-runtime-foreign"],
    ]) {
      assert.throws(
        () =>
          authorizeRuntimeSmokeReportPath({
            requestedPath: reportPath,
            repositoryRoot,
            authorizedExternalRoot: evidenceRoot,
            environment: { ...environment, [name]: value },
          }),
        /owned by another run, attempt, destination, or evidence root/,
      );
    }

    assert.throws(
      () =>
        authorizeRuntimeSmokeReportPath({
          requestedPath: reportPath,
          repositoryRoot,
          authorizedExternalRoot: broaderEvidenceRoot,
          environment,
        }),
      /owned by another run, attempt, destination, or evidence root/,
      "the physical authorized evidence-root identity must bind re-entry",
    );

    const alternateParent = path.join(evidenceRoot, "alternate-runtime");
    const alternateReport = path.join(
      alternateParent,
      "playwright-report.json",
    );
    mkdirSync(alternateParent);
    copyFileSync(authorizationPath, `${alternateReport}.owner.json`);
    assert.throws(
      () =>
        authorizeRuntimeSmokeReportPath({
          requestedPath: alternateReport,
          repositoryRoot,
          authorizedExternalRoot: evidenceRoot,
          environment,
        }),
      /owned by another run, attempt, destination, or evidence root/,
      "same-run authorization must remain bound to one report destination",
    );

    const existingParent = path.join(evidenceRoot, "existing-runtime");
    const existingReport = path.join(
      existingParent,
      "playwright-report.json",
    );
    mkdirSync(existingParent);
    writeFileSync(existingReport, "{}\n", { flag: "wx", mode: 0o600 });
    assert.throws(
      () =>
        authorizeRuntimeSmokeReportPath({
          requestedPath: existingReport,
          repositoryRoot,
          authorizedExternalRoot: evidenceRoot,
          environment,
        }),
      /must not already exist/,
      "an initial existing unowned or completed report must be rejected",
    );

    const authorizationText = readFileSync(authorizationPath, "utf8");
    for (const prohibited of [
      repositoryRoot,
      evidenceRoot,
      reportPath,
      secret,
    ]) {
      assert.equal(
        authorizationText.includes(prohibited),
        false,
        "portable report ownership must omit raw values and machine paths",
      );
    }

    writeFileSync(reportPath, "{}\n", { flag: "wx", mode: 0o600 });
    assert.throws(
      () =>
        authorizeRuntimeSmokeReportPath({
          requestedPath: reportPath,
          repositoryRoot,
          authorizedExternalRoot: evidenceRoot,
          environment,
        }),
      /must not already exist/,
      "even the owning run must not overwrite its completed canonical report",
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(evidenceContainer, { recursive: true, force: true });
  }
}

console.log("CH-0029 runtime-smoke resource-isolation contract passed.");
