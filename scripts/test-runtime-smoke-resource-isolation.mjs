import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  authorizeRuntimeSmokeReportPath,
  resolveRuntimeSmokeStartMarkerPath,
} from "./playwright-report-path.mjs";
import {
  createStableRuntimeRoots,
  removeStableRuntimeRoot,
  stableRuntimePaths,
} from "./stable-runtime-smoke-resources.mjs";
import { createStableRuntimeSmokeTestInjection } from "./stable-runtime-smoke.mjs";
import RuntimeSmokeDirectAttemptReporter, {
  runtimeSmokeDirectAttemptResultPath,
} from "./runtime-smoke-direct-attempt-reporter.mjs";
import { resolveRuntimeSmokeTimingDestination } from "./runtime-smoke-phase-budget.mjs";

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
const stableRuntimeParentSource = readFileSync(
  path.join(process.cwd(), "scripts/stable-runtime-smoke.mjs"),
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
  /npm run evidence:production:stable-runtime-smoke/,
  "Stable checks must dispatch its repository-owned runtime resource parent",
);
assert.doesNotMatch(
  workflowSource,
  /evidence_root="\.local\/production-artifact-evidence"/,
  "certified runtime evidence must not fall back into the repository",
);

{
  const repositoryRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-repeat-attempt-ownership-"),
  );
  try {
    const reporterOutputRoot = path.join(repositoryRoot, "reporter-attempts");
    const reporter = new RuntimeSmokeDirectAttemptReporter({
      outputRoot: reporterOutputRoot,
      timingRoot: path.join(repositoryRoot, "test-results"),
    });
    const timingPaths = new Set();
    const resultPaths = new Set();
    for (let repeatEachIndex = 0; repeatEachIndex < 20; repeatEachIndex += 1) {
      const identity = {
        schema: "interior-ai.runtime-smoke-direct-result.v1",
        invocationId: reporter.invocationId,
        repeatEachIndex,
        retry: 0,
        projectName: "chromium",
        workerIndex: 0,
        parallelIndex: 0,
        testId: "runtime.template-stability",
        processId: 4312,
        candidateCommitSha: "a".repeat(40),
        candidateTreeSha: "b".repeat(40),
        buildIdentity: "next-development-server",
        status: "passed",
      };
      const timingPath = resolveRuntimeSmokeTimingDestination({
          repositoryRoot,
          timingPath:
            `test-results/runtime-repeat-${repeatEachIndex}/` +
            "phase-timings-4312.json",
          environment: {},
        }).outputPath;
      timingPaths.add(timingPath);
      mkdirSync(path.dirname(timingPath), { recursive: true });
      const { status: _status, ...attemptIdentity } = identity;
      attemptIdentity.schema = "interior-ai.runtime-smoke-direct-attempt.v1";
      writeFileSync(
        timingPath,
        `${JSON.stringify({ attemptIdentity })}\n`,
        { flag: "wx", mode: 0o600 },
      );
      const resultPath = runtimeSmokeDirectAttemptResultPath({
        outputRoot: path.join(repositoryRoot, "test-results/direct-attempts"),
        identity,
      });
      resultPaths.add(resultPath);
      mkdirSync(path.dirname(resultPath), { recursive: true });
      writeFileSync(resultPath, `${JSON.stringify(identity)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      assert.deepEqual(JSON.parse(readFileSync(resultPath, "utf8")), identity);
      reporter.onTestEnd(
        {
          title: "furnished template remains stable without a render loop",
          repeatEachIndex,
          id: identity.testId,
          parent: { project: () => ({ name: identity.projectName }) },
          annotations: [
            {
              type: "runtime-smoke-direct-timing-path",
              description: timingPath,
            },
          ],
        },
        { retry: 0, workerIndex: 0, parallelIndex: 0, status: "passed" },
      );
    }
    assert.equal(timingPaths.size, 20);
    assert.equal(resultPaths.size, 20);
    assert.equal(
      [...resultPaths].every((resultPath) => existsSync(resultPath)),
      true,
    );
    reporter.onEnd();
    assert.equal(existsSync(reporter.outputDirectory), false);
    assert.equal(existsSync(reporterOutputRoot), true, "shared parent remains owned by its parent");
    assert.equal(
      [...timingPaths].every((timingPath) => !existsSync(timingPath)),
      true,
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
}
assert.match(
  stableRuntimeParentSource,
  /STABLE_RUNTIME_SMOKE_DATABASE_PROFILE/,
  "the Stable parent must use the canonical scoped database lifecycle",
);
assert.match(
  stableRuntimeParentSource,
  /removeStableRuntimeRoot/,
  "the Stable parent must own external-root cleanup",
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
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: "a".repeat(40),
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: "b".repeat(40),
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: "runtime-owner-build",
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: "c".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256: "d".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256: "e".repeat(64),
    DATABASE_URL: secret,
  };
  try {
    mkdirSync(reportParent, { recursive: true, mode: 0o700 });

    // Authorization fixtures: these are not compiled production-browser runs.
    const authorizeBuildId = (value, requestedPath = reportPath) =>
      authorizeRuntimeSmokeReportPath({
        requestedPath, repositoryRoot, authorizedExternalRoot: evidenceRoot,
        environment: { ...environment, PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: value },
      });
    for (const [index, buildId] of [
      "-HMijapRnjq-h9tldkjN0", "_jT2Js5lQ3W97uL42t3VQ",
      "v3Dmenpr6d_fsLQY9tQPM", "release-2026.09:build_42", "a..b",
      "A", "-", "_", `_${"a".repeat(127)}`,
    ].entries()) {
      const buildReport = path.join(evidenceRoot, `build-${index}`, "playwright-report.json");
      mkdirSync(path.dirname(buildReport));
      assert.equal(authorizeBuildId(buildId, buildReport).authorization.status, "initial");
      const ownerBytes = readFileSync(`${buildReport}.owner.json`);
      assert.equal(JSON.parse(ownerBytes).buildId, buildId);
      assert.equal(authorizeBuildId(buildId, buildReport).authorization.status, "same-run-reentry");
      assert.deepEqual(readFileSync(`${buildReport}.owner.json`), ownerBytes);
      assert.throws(() => authorizeBuildId("foreign-build", buildReport), /owned by another run/);
    }
    for (const value of [undefined, null, ""]) {
      assert.throws(() => authorizeBuildId(value), {
        message: "Runtime-smoke report authorization is missing PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID.",
      });
    }
    for (const value of [
      42, {}, "a\0b", "a\x01b", "a\x7fb", "a\nb", "a\rb", "a\tb", "a\n",
      ".", "..", "../build", "build/../other", "build/file", "build\\file",
      " build", "build ", "build id", ".build", ":build", "build%2Fid",
      "build?id", "build#id", "build+id", "büllid", "a".repeat(129),
    ]) {
      assert.throws(() => authorizeBuildId(value), {
        message: "Runtime-smoke report authorization has invalid PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID.",
      });
      assert.equal(existsSync(authorizationPath), false);
    }
    for (const name of [
      "PRODUCTION_CERTIFICATION_ID", "PRODUCTION_EVIDENCE_CANDIDATE_ID",
      "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE",
    ]) {
      for (const value of ["-identifier", "_identifier", "a".repeat(129)]) {
        assert.throws(() => authorizeRuntimeSmokeReportPath({
          requestedPath: reportPath, repositoryRoot, authorizedExternalRoot: evidenceRoot,
          environment: { ...environment, [name]: value },
        }), /Runtime-smoke report authorization is missing/);
      }
    }

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

    const markerPath = path.join(reportParent, "product-test-start.json");
    const initialMarker = resolveRuntimeSmokeStartMarkerPath({
      requestedPath: markerPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      reportDestination: reentry,
    });
    assert.equal(initialMarker.reentryStatus, "initial");
    writeFileSync(
      markerPath,
      `${JSON.stringify(
        {
          schema: "interior-ai.production-certification-playwright-start.v1",
          boundary: "test-begin",
          gateId: "ci.production-runtime-smoke",
          project: "chromium",
          title: "furnished template remains stable without a render loop",
          retry: 0,
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
    const replacementWorkerReentry = resolveRuntimeSmokeStartMarkerPath({
      requestedPath: markerPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      reportDestination: reentry,
    });
    assert.equal(
      replacementWorkerReentry.reentryStatus,
      "same-run-reentry",
    );

    for (const [name, value] of [
      ["CERTIFICATION_RUNTIME_STAGE_ATTEMPT", "2"],
      [
        "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE",
        "223e4567-e89b-42d3-a456-426614174002",
      ],
      ["PRODUCTION_EVIDENCE_CANDIDATE_ID", "candidate-runtime-foreign"],
      ["PRODUCTION_CERTIFICATION_ID", "certification-runtime-foreign"],
      ["PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA", "1".repeat(40)],
      ["PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA", "2".repeat(40)],
      ["PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID", "foreign-build"],
      ["PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256", "3".repeat(64)],
      ["PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256", "4".repeat(64)],
      ["PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256", "5".repeat(64)],
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

{
  const runnerTemp = mkdtempSync(
    path.join(tmpdir(), "stable-runtime-parent-roots-"),
  );
  const manifest = {
    candidateIdentifier: "github-33641707490-1",
    source: {
      commitSha: "a".repeat(40),
      treeSha: "b".repeat(40),
    },
  };
  const environment = {
    RUNNER_TEMP: runnerTemp,
    GITHUB_RUN_ID: "33641707490",
    GITHUB_RUN_ATTEMPT: "1",
    STABLE_RUNTIME_SMOKE_EXPECTED_SOURCE_SHA: manifest.source.commitSha,
  };
  let roots = null;
  try {
    assert.throws(
      () =>
        createStableRuntimeRoots({
          repositoryRoot: process.cwd(),
          environment: { ...environment, RUNNER_TEMP: "." },
          manifest,
        }),
      /RUNNER_TEMP must be absolute/,
    );
    assert.throws(
      () =>
        createStableRuntimeRoots({
          repositoryRoot: process.cwd(),
          environment: {
            ...environment,
            STABLE_RUNTIME_SMOKE_EXPECTED_SOURCE_SHA: "c".repeat(40),
          },
          manifest,
        }),
      /expected source differs/,
    );
    const rejectedTaskRoot = path.join(
      process.cwd(),
      `interior-ai-stable-runtime-smoke-${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}`,
    );
    assert.equal(existsSync(rejectedTaskRoot), false);
    assert.throws(
      () =>
        createStableRuntimeRoots({
          repositoryRoot: process.cwd(),
          environment: { ...environment, RUNNER_TEMP: process.cwd() },
          manifest,
        }),
      /outside every repository worktree/,
    );
    assert.equal(
      existsSync(rejectedTaskRoot),
      false,
      "a rejected worktree-contained root must be removed transactionally",
    );
    roots = createStableRuntimeRoots({
      repositoryRoot: process.cwd(),
      environment,
      manifest,
    });
    assert.equal(path.isAbsolute(roots.evidenceRoot), true);
    assert.equal(roots.evidenceRoot.startsWith(`${process.cwd()}${path.sep}`), false);
    assert.equal(roots.privateRoot.startsWith(`${process.cwd()}${path.sep}`), false);
    assert.equal(readFileSync(roots.ownerPath, "utf8").includes(process.cwd()), false);
    const paths = stableRuntimePaths(roots.evidenceRoot);
    for (const outputPath of Object.values(paths)) {
      assert.equal(outputPath.startsWith(`${roots.evidenceRoot}${path.sep}`), true);
    }
    assert.throws(
      () =>
        createStableRuntimeRoots({
          repositoryRoot: process.cwd(),
          environment,
          manifest,
        }),
      /task root already exists/,
    );
    const ownerBytes = readFileSync(roots.ownerPath);
    writeFileSync(roots.ownerPath, "foreign owner\n");
    assert.throws(
      () => removeStableRuntimeRoot(roots),
      /root ownership changed/,
    );
    writeFileSync(roots.ownerPath, ownerBytes);
    removeStableRuntimeRoot(roots);
    assert.equal(existsSync(roots.taskRoot), false);
    roots = null;
  } finally {
    if (roots?.taskRoot) rmSync(roots.taskRoot, { recursive: true, force: true });
    rmSync(runnerTemp, { recursive: true, force: true });
  }
}

const repositoryOwnedInjection = createStableRuntimeSmokeTestInjection();
assert.equal(repositoryOwnedInjection.kind, "post-product-diagnostics-timeout");
assert.equal(repositoryOwnedInjection.databaseAdapterFactory, null);
assert.doesNotMatch(
  stableRuntimeParentSource,
  /process\.env\.[A-Z0-9_]*TIMEOUT_INJECTION/,
  "the real post-product timeout must not be activatable by environment",
);

console.log("CH-0029 runtime-smoke resource-isolation contract passed.");

await import("./test-runtime-smoke-direct-ownership.mjs");
