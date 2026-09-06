import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createServer } from "node:net";
import { once } from "node:events";
import {
  assertWindowOpeningTestOwner, assertWindowOpeningReportContext, canonicalWindowOpeningContext,
  localWindowOpeningContext, prepareCanonicalWindowOpeningContext,
  windowOpeningCapturePaths,
} from "./window-opening-browser-context.mjs";
import {
  observeWindowOpeningLocalListener, windowOpeningCaptureProvenance,
} from "./window-opening-capture-provenance.mjs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  watch,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import {
  REQUIRED_TEST_EVIDENCE_SCHEMA,
  REQUIRED_TEST_MANIFEST_SCHEMA,
  assertCleanRequiredTestSource,
  auditRetainedEvidenceDirectory,
  canonicalizeRequiredTestReport,
  prepareRequiredTestEvidenceUpload,
  removeUnsafeRequiredTestArtifacts,
  requiredTestArtifactsAreUnsafe,
  sanitizePortableEvidenceText,
  verifyRequiredTestEvidenceArchive,
  validateRequiredTestEvidence,
  validateRequiredTestReport,
  validateRequiredTestRepository,
  validateAdvisoryWorkflowHandoff,
} from "./required-test-truthfulness.mjs";
import {
  validateGateA3CertificationEvidence,
  validateGateA3PromotionCertification,
} from "./vercel-prebuilt-release.mjs";

if (!process.argv.includes("--advisory-upload-only")) {
  await verifyWindowOpeningExecutionContracts();
  await verifyCanonicalOutputIsolation();
}
if (process.argv.includes("--window-opening-context-only")) {
  console.log("Window-opening execution-context contracts passed (synthetic artifacts; no HTTPS execution).");
  process.exit(0);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function inventoryHash(files) {
  return sha256(`${files.sort().join("\n")}\n`);
}

function packageClosure(packageScripts, rootNames) {
  const entries = new Map();
  const visit = (name) => {
    if (entries.has(name)) return;
    const script = packageScripts[name];
    assert.equal(typeof script, "string", `fixture package script ${name} must exist`);
    entries.set(name, script);
    for (const match of script.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)) visit(match[1]);
  };
  rootNames.forEach(visit);
  const lines = [...entries.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, script]) => `${name}\u0000${script}`);
  return { expectedScriptCount: lines.length, expectedSha256: sha256(`${lines.join("\n")}\n`) };
}

function makeRepository() {
  const root = mkdtempSync(path.join(tmpdir(), "ch-0017-required-tests-"));
  write(
    root,
    "scripts/fixture-module.mjs",
    "export function runFixtureChecks() { return true; }\n",
  );
  write(
    root,
    "scripts/test-fixture.mjs",
    'import assert from "node:assert/strict";\nimport { runFixtureChecks } from "./fixture-module.mjs";\nconst fixtureResult = runFixtureChecks();\nassert.equal(fixtureResult, true, "fixture exclusion semantic assertion");\n',
  );
  write(
    root,
    "tests/e2e/required-module.ts",
    "export function registerRequiredTests() { test('required identity', async () => { expect(true).toBeTruthy(); }); }\n",
  );
  write(
    root,
    "tests/e2e/required.spec.ts",
    'import { registerRequiredTests } from "./required-module";\nregisterRequiredTests();\n',
  );
  write(root, "playwright.config.ts", "export default {};\n");
  const packageScripts = {
    "test:fixture": "npm run test:fixture-child",
    "test:fixture-child": "node scripts/test-fixture.mjs",
    "test:release": "playwright test tests/e2e/required.spec.ts",
    "test:advisory": "playwright test tests/e2e/required.spec.ts",
  };
  write(
    root,
    "package.json",
    `${JSON.stringify(
      {
        scripts: packageScripts,
      },
      null,
      2,
    )}\n`,
  );
  write(
    root,
    ".github/workflows/ci.yml",
    `jobs:
  stable-checks:
    steps:
      - name: Prerequisite
        run: node scripts/fixture-module.mjs
      - name: Fixture
        run: npm run test:fixture
  e2e-full:
    continue-on-error: true
    steps:
      - name: Advisory
        run: npm run test:advisory
  merge-gate:
    needs: [stable-checks]
    steps:
      - name: Check required results
        run: |
          if [ "$STABLE_CHECKS_RESULT" != "success" ]; then
            exit 1
          fi
`,
  );
  const requiredGate = {
    id: "release.fixture",
    invariant: "A required browser identity executes against its source and artifact.",
    cadence: "release-blocking",
    blocking: true,
    command: "npm run test:release",
    packageScript: "test:release",
    packageClosure: packageClosure(packageScripts, ["test:release"]),
    runner: "playwright",
    supportingInventories: ["browser-test-modules"],
    reportOwnershipRegistrations: ["fixture-browser-registration"],
    requiredSources: ["tests/e2e/required.spec.ts"],
    requiredTests: [
      {
        id: "fixture.required",
        file: "tests/e2e/required.spec.ts",
        title: "required identity",
      },
    ],
    requiredProjects: ["chromium"],
    allowSkips: false,
    allowRetries: false,
    allowAnnotations: false,
    reportType: "required-test-evidence",
    reportPath: "evidence/evidence.json",
    maxAgeMinutes: 30,
    artifactBinding: "source-artifact",
    playwright: { config: "playwright.config.ts", args: ["playwright", "test"] },
  };
  const advisoryGate = {
    ...requiredGate,
    id: "advisory.fixture",
    invariant: "Advisory failures remain visible without becoming release claims.",
    cadence: "advisory",
    blocking: false,
    command: "npm run test:advisory",
    packageScript: "test:advisory",
    packageClosure: packageClosure(packageScripts, ["test:advisory"]),
    allowSkips: true,
    allowRetries: true,
    allowAnnotations: true,
    reportPath: ".local/required-test-evidence/advisory.fixture/evidence.json",
    artifactBinding: "none",
    ci: { job: "e2e-full", step: "Advisory" },
  };
  const inventoryGate = {
    ...requiredGate,
    id: "release.inventory-fixture",
    invariant: "Every inventoried browser spec executes in the required project.",
    requiredInventory: "browser-specs",
    requiredSources: [],
    requiredTests: [],
    reportPath: "evidence/inventory-evidence.json",
    artifactBinding: "none",
  };
  const mergeGate = {
    id: "ci.merge-fixture",
    invariant: "Required fixture results are aggregated without a fail-open path.",
    cadence: "merge-required",
    blocking: true,
    command: "GitHub Actions fixture merge aggregation",
    runner: "github-actions",
    requiredSources: [".github/workflows/ci.yml"],
    requiredProjects: [],
    allowSkips: false,
    allowRetries: false,
    reportType: "github-check",
    artifactBinding: "source-workflow-results",
    ci: {
      job: "merge-gate",
      step: "Check required results",
      invocations: [
        "needs: [stable-checks]",
        'if [ "$STABLE_CHECKS_RESULT" != "success" ]; then',
        "exit 1",
      ],
    },
  };
  const manifest = {
    schema: REQUIRED_TEST_MANIFEST_SCHEMA,
    sourceInventories: [
      {
        id: "script-tests",
        root: "scripts",
        filePattern: "^test-.*\\.mjs$",
        classification: "risk-triggered",
        expectedFileCount: 1,
        expectedPathSha256: inventoryHash(["scripts/test-fixture.mjs"]),
      },
      {
        id: "script-support-modules",
        root: "scripts",
        filePattern: "^fixture-module\\.mjs$",
        classification: "merge-required-imported-test-modules",
        expectedFileCount: 1,
        expectedPathSha256: inventoryHash(["scripts/fixture-module.mjs"]),
      },
      {
        id: "browser-specs",
        root: "tests/e2e",
        filePattern: "\\.spec\\.ts$",
        classification: "release-only",
        expectedFileCount: 1,
        expectedPathSha256: inventoryHash(["tests/e2e/required.spec.ts"]),
      },
      {
        id: "browser-test-modules",
        root: "tests/e2e",
        filePattern: "^required-module\\.ts$",
        classification: "release-only-imported-test-modules",
        expectedFileCount: 1,
        expectedPathSha256: inventoryHash(["tests/e2e/required-module.ts"]),
      },
    ],
    gates: [
      {
        id: "ci.fixture",
        invariant: "The fixture process test executes in required CI.",
        cadence: "merge-required",
        blocking: true,
        command: "npm run test:fixture",
        packageScript: "test:fixture",
        packageClosure: packageClosure(packageScripts, ["test:fixture"]),
        runner: "node",
        supportingInventories: ["script-support-modules"],
        requiredSources: ["scripts/test-fixture.mjs"],
        requiredCommandSources: ["scripts/test-fixture.mjs"],
        forbiddenCommandFragments: ["--filter", "--skip", "--retry", "--only"],
        forbidCommandFailureSwallowing: true,
        requiredContributions: [
          {
            id: "fixture.exclusion",
            source: "scripts/test-fixture.mjs",
            marker: "fixture exclusion semantic assertion",
          },
        ],
        requiredProjects: [],
        allowSkips: false,
        allowRetries: false,
        reportType: "process-exit",
        artifactBinding: "none",
        ci: {
          job: "stable-checks",
          step: "Fixture",
          afterSteps: ["Prerequisite"],
          stepInvocations: [
            { step: "Fixture", invocation: "npm run test:fixture" },
          ],
        },
      },
      requiredGate,
      inventoryGate,
      advisoryGate,
      mergeGate,
    ],
    staticPolicies: {
      forbidFocusedTestsIn: ["tests/e2e"],
      failClosedPrerequisiteSources: ["tests/e2e/required.spec.ts"],
    },
    requiredRegistrations: [
      {
        id: "fixture-script-registration",
        entry: "scripts/test-fixture.mjs",
        registrations: [{ module: "./fixture-module.mjs", symbol: "runFixtureChecks" }],
      },
      {
        id: "fixture-browser-registration",
        entry: "tests/e2e/required.spec.ts",
        registrations: [{ module: "./required-module", symbol: "registerRequiredTests" }],
      },
    ],
    externalControls: [],
  };
  write(root, "scripts/required-test-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifest };
}

const SOURCE_SHA = "1".repeat(40);
const ARTIFACT_SHA = "2".repeat(64);

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function makeReport({
  sourceSha = SOURCE_SHA,
  artifactSha = ARTIFACT_SHA,
  project = "chromium",
  file = "required-module.ts",
  title = "required identity",
  status = "passed",
  declaredStatus = "expected",
  retry = 0,
  annotations = [],
  startTime = new Date().toISOString(),
} = {}) {
  return {
    config: {
      configFile: "<repository-root>/playwright.config.ts",
      rootDir: "<repository-root>/tests/e2e",
      forbidOnly: true,
      grep: {},
      grepInvert: null,
      shard: null,
      projects: [{ id: project, name: project, retries: 0, repeatEach: 1 }],
      metadata: {
        gateA3ReleaseBaseURL: "https://staged.example.test",
        requiredTestEvidence: {
          schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
          gateId: "release.fixture",
          sourceCommitSha: sourceSha,
          artifactSha256: artifactSha,
        },
      },
    },
    errors: [],
    suites: [
      {
        title: file,
        file,
        specs: [
          {
            title,
            file,
            ok: status === "passed",
            tests: [
              {
                projectId: project,
                projectName: project,
                status: declaredStatus,
                annotations,
                results:
                  status === "not-run"
                    ? []
                    : [{ status, retry, annotations }],
              },
            ],
          },
        ],
      },
    ],
    stats: {
      startTime,
      duration: 100,
      expected: status === "passed" ? 1 : 0,
      skipped: status === "skipped" ? 1 : 0,
      unexpected: status === "failed" ? 1 : 0,
      flaky: retry > 0 ? 1 : 0,
    },
  };
}

function expectIssue(result, text) {
  assert.equal(result.valid, false, `expected rejection containing ${text}`);
  assert.ok(
    result.issues.some((issue) => issue.includes(text)),
    `missing ${JSON.stringify(text)} in ${JSON.stringify(result.issues)}`,
  );
}

function reportResult(
  root,
  report,
  processExitCode = 0,
  gateId = "release.fixture",
  environment = process.env,
) {
  return validateRequiredTestReport({
    repositoryRoot: root,
    gateId,
    report,
    processExitCode,
    requireMetadata: gateId !== "advisory.fixture",
    expectedSourceCommitSha: gateId === "release.fixture" ? SOURCE_SHA : undefined,
    expectedArtifactSha256: gateId === "release.fixture" ? ARTIFACT_SHA : undefined,
    environment,
  });
}

function writeEvidence(root, { report = makeReport(), mutateEvidence } = {}) {
  const reportPath = "evidence/playwright.json";
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  write(root, reportPath, reportBytes);
  const startedAt = new Date(Date.parse(report.stats.startTime) - 100).toISOString();
  const completedAt = new Date(Date.parse(report.stats.startTime) + report.stats.duration + 100).toISOString();
  const evidence = {
    schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
    gateId: "release.fixture",
    command: "npm run test:release",
    sourceCommitSha: SOURCE_SHA,
    artifactSha256: ARTIFACT_SHA,
    processExitCode: 0,
    startedAt,
    completedAt,
    report: { path: reportPath, sha256: sha256(reportBytes) },
    result: "passed",
    diagnostics: [],
  };
  mutateEvidence?.(evidence);
  write(root, "evidence/evidence.json", `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function writeAdvisoryUploadEvidence(
  root,
  {
    status = "failed",
    processExitCode = status === "passed" ? 0 : 1,
    includeNotRun = false,
  } = {},
) {
  const gateId = "advisory.fixture";
  const report = makeReport({
    status,
    declaredStatus: status === "passed" ? "expected" : "unexpected",
  });
  report.config.metadata.requiredTestEvidence = {
    schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
    gateId,
    sourceCommitSha: SOURCE_SHA,
    artifactSha256: null,
    releaseCandidateId: null,
    releaseEnvironment: null,
  };
  report.config.metadata.gateA3ReleaseBaseURL = null;
  report.config.metadata.productionArtifactEvidence = null;
  if (includeNotRun) {
    report.suites[0].specs.push({
      title: "not-run advisory identity",
      file: "required-module.ts",
      ok: false,
      tests: [
        {
          projectId: "chromium",
          projectName: "chromium",
          status: "unexpected",
          annotations: [],
          results: [],
        },
      ],
    });
  }
  const reportPath =
    `.local/required-test-evidence/${gateId}/playwright.json`;
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const truthfulness = validateRequiredTestReport({
    repositoryRoot: root,
    gateId,
    report,
    processExitCode,
    requireMetadata: true,
    expectedSourceCommitSha: SOURCE_SHA,
    environment: {},
  });
  write(root, reportPath, reportBytes);
  write(
    root,
    `.local/required-test-evidence/${gateId}/evidence.json`,
    `${JSON.stringify({
      schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
      gateId,
      command: "npm run test:advisory",
      sourceCommitSha: SOURCE_SHA,
      artifactSha256: null,
      processExitCode,
      startedAt: new Date(Date.parse(report.stats.startTime) - 100).toISOString(),
      completedAt: new Date(Date.parse(report.stats.startTime) + 200).toISOString(),
      report: { path: reportPath, sha256: sha256(reportBytes) },
      result: truthfulness.valid ? "passed" : "failed",
      diagnostics: truthfulness.issues,
    }, null, 2)}\n`,
  );
  return { report, reportPath };
}

function prepareAdvisoryUpload(context, options = {}) {
  const prepared = prepareRequiredTestEvidenceUpload({
    repositoryRoot: context.root,
    evidencePath: ".local/required-test-evidence/advisory.fixture/evidence.json",
    expectedSourceCommitSha: SOURCE_SHA,
    ...options,
  });
  context.uploadRoot = prepared.archiveRoot;
  return prepared;
}

function rewriteAdvisoryUploadPair(root, { mutateEvidence, mutateReport } = {}) {
  const gateId = "advisory.fixture";
  const reportPath = `.local/required-test-evidence/${gateId}/playwright.json`;
  const evidencePath = `.local/required-test-evidence/${gateId}/evidence.json`;
  const report = JSON.parse(readFileSync(path.join(root, reportPath), "utf8"));
  const evidence = JSON.parse(readFileSync(path.join(root, evidencePath), "utf8"));
  mutateReport?.(report);
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  write(root, reportPath, reportBytes);
  evidence.report.sha256 = sha256(reportBytes);
  mutateEvidence?.(evidence);
  write(root, evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv.includes("--advisory-upload-only")) {
  verifyCanonicalReportHandoff();
  process.exit(0);
}

{
  const context = makeRepository();
  const repository = validateRequiredTestRepository({ repositoryRoot: context.root });
  assert.deepEqual(repository.issues, []);
  assert.equal(repository.valid, true);
  const result = reportResult(context.root, makeReport());
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true, "a complete required suite must pass");
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  const unsafeFileName = "GOCSPX-not-retained-filename.log";
  write(
    context.root,
    `.local/required-test-evidence/advisory.fixture/playwright-output/${unsafeFileName}`,
    "safe diagnostic content\n",
  );
  const prepared = prepareAdvisoryUpload(context);
  assert.equal(prepared.omitted[0]?.reasonCode, "optional-unsafe-path");
  assert.match(prepared.omitted[0]?.path ?? "", /^\.omitted\/optional-path-sha256-[0-9a-f]{64}$/);
  const inventoryText = readFileSync(
    path.join(context.root, `${context.uploadRoot}/retained-evidence-inventory.json`),
    "utf8",
  );
  assert.equal(inventoryText.includes(unsafeFileName), false);
  assert.doesNotThrow(() =>
    auditRetainedEvidenceDirectory({ repositoryRoot: context.root }),
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  rewriteAdvisoryUploadPair(context.root, {
    mutateEvidence: (evidence) => {
      evidence.result = "passed";
      evidence.diagnostics = [];
    },
  });
  assert.throws(
    () => prepareAdvisoryUpload(context),
    /conclusion, process, report, or diagnostics are contradictory/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root, { status: "passed" });
  rewriteAdvisoryUploadPair(context.root, {
    mutateEvidence: (evidence) => {
      evidence.result = "failed";
      evidence.diagnostics = ["invented failure"];
    },
  });
  assert.throws(
    () => prepareAdvisoryUpload(context),
    /conclusion, process, report, or diagnostics are contradictory/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  rewriteAdvisoryUploadPair(context.root, {
    mutateReport: (report) => {
      const record = report.suites[0].specs[0].tests[0];
      record.projectId = "webkit";
      record.projectName = "webkit";
    },
  });
  assert.throws(
    () => prepareAdvisoryUpload(context),
    /unexpected record project/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  assert.throws(
    () => prepareAdvisoryUpload(context, { expectedSourceCommitSha: "f".repeat(40) }),
    /belongs to another source commit/,
  );
}

for (const mutation of [
  {
    mutateEvidence: (evidence) => {
      evidence.command = "npm run test:e2e:release";
    },
  },
  {
    mutateEvidence: (evidence) => {
      evidence.artifactSha256 = "2".repeat(64);
    },
  },
  {
    mutateReport: (report) => {
      report.config.metadata.requiredTestEvidence.artifactSha256 = "2".repeat(64);
    },
  },
  {
    mutateReport: (report) => {
      report.config.metadata.requiredTestEvidence.releaseCandidateId = "rc-masquerade";
    },
  },
  {
    mutateReport: (report) => {
      report.config.metadata.requiredTestEvidence.releaseEnvironment = "staging";
    },
  },
  {
    mutateReport: (report) => {
      report.config.metadata.gateA3ReleaseBaseURL = "https://release.example.test";
    },
  },
  {
    mutateReport: (report) => {
      report.config.metadata.productionArtifactEvidence = {
        sourceCommitSha: SOURCE_SHA,
      };
    },
  },
]) {
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  rewriteAdvisoryUploadPair(context.root, mutation);
  assert.throws(
    () => prepareAdvisoryUpload(context),
    /canonical command|advisory artifact binding|release or production-artifact identity/,
  );
}

for (const testCase of [
  {
    mutateEvidence: (evidence) => {
      evidence.processExitCode = -1;
    },
    expected: /evidence\.json is malformed/,
  },
  {
    mutateEvidence: (evidence) => {
      evidence.startedAt = new Date(Date.parse(evidence.completedAt) + 1_000).toISOString();
    },
    expected: /evidence\.json is malformed/,
  },
  {
    mutateReport: (report) => {
      report.stats.startTime = "2020-01-01T00:00:00.000Z";
    },
    expected: /report timing is outside the recorded process interval/,
  },
  {
    mutateEvidence: (evidence) => {
      evidence.startedAt = "2020-01-01T00:00:00.000Z";
      evidence.completedAt = "2020-01-01T00:00:01.000Z";
    },
    mutateReport: (report) => {
      report.stats.startTime = "2020-01-01T00:00:00.100Z";
    },
    expected: /is stale/,
  },
  {
    mutateEvidence: (evidence) => {
      const future = Date.now() + 10 * 60 * 1_000;
      evidence.startedAt = new Date(future).toISOString();
      evidence.completedAt = new Date(future + 1_000).toISOString();
    },
    mutateReport: (report) => {
      report.stats.startTime = new Date(Date.now() + 10 * 60 * 1_000 + 100).toISOString();
    },
    expected: /timestamp is in the future/,
  },
]) {
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  rewriteAdvisoryUploadPair(context.root, testCase);
  assert.throws(() => prepareAdvisoryUpload(context), testCase.expected);
}

{
  const context = makeRepository();
  const portableCases = [
    "/home/runner/work/interior-ai/interior-ai/test-results/error-context.md",
    "/Users/example/Developer/interior-ai/test-results/error-context.md",
    "C:\\Users\\example\\Developer\\interior-ai\\test-results\\error-context.md",
    "/private/tmp/ch-0017/results/error-context.md",
  ];
  for (const machinePath of portableCases) {
    const sanitized = sanitizePortableEvidenceText(
      `Failure attachment: ${machinePath}`,
      context.root,
    );
    assert.equal(sanitized.includes(machinePath), false);
    assert.match(sanitized, /<WORKSPACE>/);
  }
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root, { includeNotRun: true });
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/failure/error-context.md",
    "Location: /home/runner/work/interior-ai/interior-ai/tests/e2e/required.spec.ts:10:3\n",
  );
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/failure/nested/debug.log",
    "macOS source /Users/example/Developer/interior-ai/tests/e2e/required.spec.ts\n",
  );
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/failure/trace.zip",
    "uninspectable archive fixture",
  );
  const lastRunBytes = Buffer.from(
    `${JSON.stringify({ status: "failed", failedTests: ["advisory fixture"] })}\n`,
  );
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/.last-run.json",
    lastRunBytes,
  );
  const prepared = prepareAdvisoryUpload(context, {
    environment: { AUTH_SECRET: "fixture-sensitive-value" },
  });
  assert.equal(prepared.included.length, 5);
  assert.deepEqual(prepared.omitted, [
    {
      path: "advisory.fixture/playwright-output/.last-run.json",
      omissionCategory: "redundant-playwright-run-state",
      reasonCode: "redundant-with-hash-bound-playwright-report-and-evidence-envelope",
      originalSha256: sha256(lastRunBytes),
    },
    {
      path: "advisory.fixture/playwright-output/failure/trace.zip",
      omissionCategory: "prohibited-binary-or-uninspectable-evidence",
      reasonCode: "optional-uninspectable-extension",
      originalSha256: sha256(Buffer.from("uninspectable archive fixture")),
    },
  ]);
  const retainedErrorContext = readFileSync(
    path.join(
      context.root,
      `${context.uploadRoot}/optional-diagnostics/advisory.fixture/failure/error-context.md`,
    ),
    "utf8",
  );
  assert.equal(retainedErrorContext.includes("/home/runner/work/"), false);
  assert.match(retainedErrorContext, /<WORKSPACE>/);
  const inventory = JSON.parse(
    readFileSync(
      path.join(context.root, `${context.uploadRoot}/retained-evidence-inventory.json`),
      "utf8",
    ),
  );
  assert.deepEqual(inventory.included, [
    "optional-diagnostics/advisory.fixture/failure/error-context.md",
    "optional-diagnostics/advisory.fixture/failure/nested/debug.log",
    "required-test-evidence/advisory.fixture/evidence.json",
    "required-test-evidence/advisory.fixture/playwright.json",
    "retained-evidence-inventory.json",
  ]);
  assert.equal(
    existsSync(
      path.join(
        context.root,
        `${context.uploadRoot}/optional-diagnostics/advisory.fixture/.last-run.json`,
      ),
    ),
    false,
  );
  assert.equal(inventory.policy.rawPlaywrightDirectoriesUploaded, false);
  assert.equal(inventory.advisorySummaries[0].conclusion, "failed");
  assert.equal(inventory.advisorySummaries[0].processExitCode, 1);
  assert.equal(inventory.advisorySummaries[0].failed, 1);
  assert.equal(inventory.advisorySummaries[0].notRun, 1);
  assert.equal(inventory.advisorySummaries[0].discovered, 2);
  assert.doesNotThrow(() =>
    auditRetainedEvidenceDirectory({
      repositoryRoot: context.root,
      environment: { AUTH_SECRET: "fixture-sensitive-value" },
    }),
  );
  write(
    context.root,
    `${context.uploadRoot}/late-unsafe.log`,
    "late path /tmp/ch-0017/unsafe.log\n",
  );
  assert.throws(
    () =>
      auditRetainedEvidenceDirectory({
        repositoryRoot: context.root,
        environment: { AUTH_SECRET: "fixture-sensitive-value" },
      }),
    /contains a machine-local path/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  prepareAdvisoryUpload(context);
  const downloadedRoot = ".local/downloaded-playwright-full-results";
  renameSync(
    path.join(context.root, context.uploadRoot),
    path.join(context.root, downloadedRoot),
  );
  assert.doesNotThrow(() =>
    verifyRequiredTestEvidenceArchive({
      repositoryRoot: context.root,
      archiveRoot: downloadedRoot,
    }),
  );
  write(context.root, `${downloadedRoot}/extra.log`, "unexpected archive entry\n");
  assert.throws(
    () =>
      verifyRequiredTestEvidenceArchive({
        repositoryRoot: context.root,
        archiveRoot: downloadedRoot,
      }),
    /does not exactly match the archive tree/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  prepareAdvisoryUpload(context);
  rmSync(
    path.join(
      context.root,
      `${context.uploadRoot}/required-test-evidence/advisory.fixture/playwright.json`,
    ),
  );
  assert.throws(
    () => verifyRequiredTestEvidenceArchive({ repositoryRoot: context.root, archiveRoot: context.uploadRoot }),
    /does not exactly match the archive tree/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  prepareAdvisoryUpload(context);
  write(context.root, `${context.uploadRoot}/.hidden.json`, "{}\n");
  assert.throws(
    () => verifyRequiredTestEvidenceArchive({ repositoryRoot: context.root, archiveRoot: context.uploadRoot }),
    /hidden path entry/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/.other-hidden.json",
    "{}\n",
  );
  assert.throws(
    () => prepareAdvisoryUpload(context),
    /unsupported hidden path/,
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/nested.json",
    `${JSON.stringify({ metadata: { OPENAI_API_KEY: "gate-a3-ci-openai-placeholder" } })}\n`,
  );
  const prepared = prepareAdvisoryUpload(context);
  assert.equal(prepared.omitted[0]?.path, "advisory.fixture/playwright-output/nested.json");
  assert.match(prepared.omitted[0]?.reasonCode ?? "", /optional-(?:environment-output|sensitive-structure)/);
  assert.equal(existsSync(path.join(context.root, ".local/required-test-upload")), true);
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/environment.log",
    "OPENAI_API_KEY: gate-a3-ci-openai-placeholder\n",
  );
  const prepared = prepareAdvisoryUpload(context);
  assert.equal(prepared.omitted[0]?.reasonCode, "optional-environment-output");
  assert.equal(existsSync(path.join(context.root, ".local/required-test-upload")), true);
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/renamed-archive.log",
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]),
  );
  const prepared = prepareAdvisoryUpload(context);
  assert.equal(prepared.omitted[0]?.reasonCode, "optional-uninspectable-content");
  assert.equal(
    existsSync(path.join(context.root, ".local/required-test-upload")),
    true,
    "a binary optional diagnostic must not eliminate truthful mandatory evidence",
  );
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/credential.txt",
    "Authorization: Bearer github_pat_this_is_not_retained_123456\n",
  );
  const prepared = prepareAdvisoryUpload(context);
  assert.equal(prepared.omitted[0]?.reasonCode, "optional-credential-value");
}

for (const [fileName, content, expectedReason] of [
  [
    "safe-name-database.txt",
    "FLOORING_DEBUG_VALUE=postgresql://user:password@localhost:5432/private\n",
    "optional-database-url",
  ],
  [
    "oauth-shaped.txt",
    "FLOORING_DEBUG_VALUE=GOCSPX-not-retained-value\n",
    "optional-oauth-or-shaped-secret",
  ],
  [
    "private-key.txt",
    "-----BEGIN PRIVATE KEY-----\nnot-retained\n-----END PRIVATE KEY-----\n",
    "optional-credential-value",
  ],
]) {
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  write(
    context.root,
    `.local/required-test-evidence/advisory.fixture/playwright-output/${fileName}`,
    content,
  );
  const prepared = prepareAdvisoryUpload(context);
  assert.equal(prepared.omitted[0]?.reasonCode, expectedReason);
}

{
  const context = makeRepository();
  writeAdvisoryUploadEvidence(context.root);
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/evidence.json",
    "{ malformed\n",
  );
  assert.throws(
    () => prepareAdvisoryUpload(context),
    /malformed JSON/,
  );
  assert.equal(existsSync(path.join(context.root, ".local/required-test-upload")), false);
  assert.equal(
    existsSync(path.join(context.root, ".local/required-test-upload.staging")),
    false,
  );
}

{
  const context = makeRepository();
  const sentinelPath = path.join(context.root, "repository-sentinel.txt");
  write(context.root, "repository-sentinel.txt", "must survive unsafe output input\n");
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/evidence.json",
    "{}\n",
  );
  assert.throws(
    () =>
      prepareAdvisoryUpload(context, {
        uploadRoot: ".",
      }),
    /upload root must be exactly \.local\/required-test-upload/,
  );
  assert.equal(
    readFileSync(sentinelPath, "utf8"),
    "must survive unsafe output input\n",
    "an invalid upload root must be rejected before any cleanup",
  );
}

{
  const context = makeRepository();
  const { report, reportPath } = writeAdvisoryUploadEvidence(context.root);
  report.config.metadata.OPENAI_API_KEY = "gate-a3-ci-openai-placeholder";
  write(
    context.root,
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.throws(
    () => prepareAdvisoryUpload(context),
    /contains prohibited environment output|contains secret-bearing fields/,
  );
  assert.equal(
    existsSync(path.join(context.root, ".local/required-test-upload")),
    false,
    "unsafe required evidence must leave no canonical upload directory",
  );
  assert.equal(
    existsSync(path.join(context.root, ".local/required-test-upload.staging")),
    false,
    "failed sanitization must remove partial staging output",
  );
}

{
  const context = makeRepository();
  const importedModuleReport = makeReport({ file: "required-module.ts" });
  const result = reportResult(context.root, importedModuleReport);
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true, "an imported test module must report through its aggregator owner");
  assert.equal(result.records[0].file, "tests/e2e/required.spec.ts");
  assert.equal(result.records[0].reportedFile, "tests/e2e/required-module.ts");
}

{
  const context = makeRepository();
  expectIssue(
    reportResult(context.root, makeReport({ file: "required.spec.ts" })),
    "registered imported module tests/e2e/required-module.ts did not contribute test records in project chromium",
  );
}

{
  const context = makeRepository();
  for (const gate of context.manifest.gates) {
    delete gate.reportOwnershipRegistrations;
  }
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "omits aggregator ownership registration group fixture-browser-registration",
  );
}

{
  const context = makeRepository();
  context.manifest.sourceInventories.find(
    (inventory) => inventory.id === "browser-test-modules",
  ).filePattern = "^intentionally-hidden-module\\.ts$";
  context.manifest.sourceInventories.find(
    (inventory) => inventory.id === "browser-test-modules",
  ).expectedFileCount = 0;
  context.manifest.sourceInventories.find(
    (inventory) => inventory.id === "browser-test-modules",
  ).expectedPathSha256 = inventoryHash([]);
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "registered imported module tests/e2e/required-module.ts is not classified by a supporting inventory",
  );
}

{
  const context = makeRepository();
  rmSync(path.join(context.root, "tests/e2e/required-module.ts"));
  const result = validateRequiredTestRepository({ repositoryRoot: context.root });
  expectIssue(result, "required registration fixture-browser-registration module ./required-module is missing");
}

{
  const context = makeRepository();
  runGit(context.root, ["init"]);
  runGit(context.root, ["add", "."]);
  runGit(context.root, [
    "-c",
    "user.name=CH-0017 Fixture",
    "-c",
    "user.email=ch-0017@example.test",
    "commit",
    "-m",
    "fixture",
  ]);
  assert.doesNotThrow(() => assertCleanRequiredTestSource(context.root));
  write(context.root, "tests/e2e/required.spec.ts", "// dirty required source\n");
  assert.throws(
    () => assertCleanRequiredTestSource(context.root),
    /requires a clean source checkout/,
  );
}

{
  const context = makeRepository();
  const workflowPath = path.join(context.root, ".github/workflows/ci.yml");
  const workflow = readFileSync(workflowPath, "utf8").replace("            exit 1\n", "            :\n");
  write(context.root, ".github/workflows/ci.yml", workflow);
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "does not contain gate ci.merge-fixture invocation",
  );
}

{
  const context = makeRepository();
  const workflowPath = path.join(context.root, ".github/workflows/ci.yml");
  const workflow = readFileSync(workflowPath, "utf8").replace(
    "- name: Fixture",
    "- name: Renamed fixture",
  );
  write(context.root, ".github/workflows/ci.yml", workflow);
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "does not contain gate ci.fixture step Fixture",
  );
}

{
  const context = makeRepository();
  const workflowPath = path.join(context.root, ".github/workflows/ci.yml");
  const workflow = readFileSync(workflowPath, "utf8").replace(
    `      - name: Prerequisite
        run: node scripts/fixture-module.mjs
      - name: Fixture
        run: npm run test:fixture`,
    `      - name: Fixture
        run: npm run test:fixture
      - name: Prerequisite
        run: node scripts/fixture-module.mjs`,
  );
  write(context.root, ".github/workflows/ci.yml", workflow);
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "step Fixture must run after CI step Prerequisite",
  );
}

{
  const context = makeRepository();
  const workflowPath = path.join(context.root, ".github/workflows/ci.yml");
  const workflow = readFileSync(workflowPath, "utf8").replace(
    `      - name: Prerequisite
        run: node scripts/fixture-module.mjs
      - name: Fixture
        run: npm run test:fixture`,
    `      - name: Prerequisite
        run: npm run test:fixture
      - name: Fixture
        run: node scripts/fixture-module.mjs`,
  );
  write(context.root, ".github/workflows/ci.yml", workflow);
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "step Fixture does not contain its bound invocation",
  );
}

{
  const context = makeRepository();
  const workflowPath = path.join(context.root, ".github/workflows/ci.yml");
  const workflow = readFileSync(workflowPath, "utf8").replace(
    "run: npm run test:fixture",
    "run: npm run test:fixture || true",
  );
  write(context.root, ".github/workflows/ci.yml", workflow);
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "cannot fail open",
  );
}

{
  const context = makeRepository();
  write(
    context.root,
    "scripts/test-fixture.mjs",
    'import { runFixtureChecks } from "./fixture-module.mjs";\n',
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "does not invoke runFixtureChecks",
  );
}

{
  const context = makeRepository();
  const packageJsonPath = path.join(context.root, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.scripts["test:fixture"] = "node scripts/test-fixture.mjs";
  write(context.root, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "package-script closure changed",
  );
}

{
  const context = makeRepository();
  const packageJsonPath = path.join(context.root, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.scripts["test:fixture-child"] = "node scripts/fixture-module.mjs";
  write(context.root, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  const gate = context.manifest.gates.find((entry) => entry.id === "ci.fixture");
  gate.packageClosure = packageClosure(packageJson.scripts, ["test:fixture"]);
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "does not execute required source scripts/test-fixture.mjs through its package command",
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "does not execute required command source scripts/test-fixture.mjs through its package command",
  );
}

{
  const context = makeRepository();
  const fixturePath = path.join(context.root, "scripts/test-fixture.mjs");
  write(
    context.root,
    "scripts/test-fixture.mjs",
    readFileSync(fixturePath, "utf8").replace("fixture exclusion semantic assertion", "removed contribution"),
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required contribution fixture.exclusion executable marker is missing",
  );
}

{
  const context = makeRepository();
  const fixturePath = path.join(context.root, "scripts/test-fixture.mjs");
  write(
    context.root,
    "scripts/test-fixture.mjs",
    `${readFileSync(fixturePath, "utf8").replace(
      '"fixture exclusion semantic assertion"',
      '"removed executable contribution"',
    )}// fixture exclusion semantic assertion\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required contribution fixture.exclusion executable marker is missing",
  );
}

{
  const context = makeRepository();
  const fixturePath = path.join(context.root, "scripts/test-fixture.mjs");
  write(
    context.root,
    "scripts/test-fixture.mjs",
    readFileSync(fixturePath, "utf8").replace(
      'assert.equal(fixtureResult, true, "fixture exclusion semantic assertion");',
      "assert.equal(fixtureResult, true /* fixture exclusion semantic assertion */);",
    ),
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required contribution fixture.exclusion executable marker is missing",
  );
}

{
  const context = makeRepository();
  const fixturePath = path.join(context.root, "scripts/test-fixture.mjs");
  write(
    context.root,
    "scripts/test-fixture.mjs",
    `${readFileSync(fixturePath, "utf8").replace(
      'assert.equal(fixtureResult, true, "fixture exclusion semantic assertion");',
      "assert.equal(fixtureResult, true);",
    )}// assert.equal(true, "fixture exclusion semantic assertion");\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required contribution fixture.exclusion executable marker is missing",
  );
}

for (const unsafeSuffix of [
  " --filter narrowed",
  " --skip",
  " --retry=1",
  " --only",
]) {
  const context = makeRepository();
  const packageJsonPath = path.join(context.root, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.scripts["test:fixture-child"] += unsafeSuffix;
  write(context.root, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  const gate = context.manifest.gates.find((entry) => entry.id === "ci.fixture");
  gate.packageClosure = packageClosure(packageJson.scripts, ["test:fixture"]);
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "contains forbidden command fragment",
  );
}

for (const failOpenSuffix of [" || true", "||true", " || :", "; exit 0"]) {
  const context = makeRepository();
  const packageJsonPath = path.join(context.root, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.scripts["test:fixture-child"] += failOpenSuffix;
  write(context.root, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  const gate = context.manifest.gates.find((entry) => entry.id === "ci.fixture");
  gate.packageClosure = packageClosure(packageJson.scripts, ["test:fixture"]);
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "can swallow process failures",
  );
}

{
  const context = makeRepository();
  const gate = context.manifest.gates.find((entry) => entry.id === "release.fixture");
  gate.packagePrerequisites = ["test:fixture"];
  gate.requiredSources = [...gate.requiredSources, "scripts/test-fixture.mjs"];
  gate.packageClosure = packageClosure(
    JSON.parse(readFileSync(path.join(context.root, "package.json"), "utf8")).scripts,
    ["test:release", "test:fixture"],
  );
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  const prerequisiteRepository = validateRequiredTestRepository({ repositoryRoot: context.root });
  assert.equal(
    prerequisiteRepository.valid,
    true,
    `a declared Playwright prerequisite must contribute to the package closure: ${JSON.stringify(prerequisiteRepository.issues)}`,
  );
  delete gate.packagePrerequisites;
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "does not execute required source scripts/test-fixture.mjs through its package command",
  );
}

{
  const context = makeRepository();
  rmSync(path.join(context.root, "scripts/test-fixture.mjs"));
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required source scripts/test-fixture.mjs is missing",
  );
}

{
  const context = makeRepository();
  context.manifest.sourceInventories[0].expectedPathSha256 = "0".repeat(64);
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "source inventory script-tests changed",
  );
}

{
  const context = makeRepository();
  const mergeGate = context.manifest.gates.find((gate) => gate.id === "ci.merge-fixture");
  mergeGate.requiredSources.push("scripts/test-fixture.mjs");
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required source scripts/test-fixture.mjs has more than one merge-required owner",
  );
}

{
  const context = makeRepository();
  const processGate = context.manifest.gates.find((gate) => gate.id === "ci.fixture");
  const mergeGate = context.manifest.gates.find((gate) => gate.id === "ci.merge-fixture");
  const focusedSources = [
    "scripts/test-focused.tsx",
    "tests/required/focused.spec.ts",
  ];
  for (const source of focusedSources) write(context.root, source, "export {};\n");
  processGate.requiredSources.push(...focusedSources);
  mergeGate.requiredSources.push(...focusedSources);
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  const result = validateRequiredTestRepository({ repositoryRoot: context.root });
  for (const source of focusedSources) {
    expectIssue(result, `required source ${source} has more than one merge-required owner`);
  }
}

{
  const context = makeRepository();
  const gate = context.manifest.gates.find((entry) => entry.id === "release.fixture");
  gate.playwright.args = ["playwright", "test", "--config=other.config.ts"];
  write(context.root, "other.config.ts", "export default {};\n");
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "Playwright invocation does not use its exact config",
  );
}

{
  const context = makeRepository();
  const gate = context.manifest.gates.find((entry) => entry.id === "release.fixture");
  gate.playwright.config = "other.config.ts";
  gate.playwright.args = ["playwright", "test", "--config=other.config.ts"];
  gate.playwright.exactConfigOnly = true;
  write(context.root, "other.config.ts", "export default {};\n");
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "exact Playwright config is not a required source",
  );
}

{
  const context = makeRepository();
  rmSync(path.join(context.root, "tests/e2e/required.spec.ts"));
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required source tests/e2e/required.spec.ts is missing",
  );
}

{
  const context = makeRepository();
  const report = makeReport();
  report.suites = [];
  report.stats.expected = 0;
  expectIssue(reportResult(context.root, report), "discovered zero tests");
}

{
  const context = makeRepository();
  expectIssue(reportResult(context.root, makeReport({ project: "webkit" })), "required project chromium is missing");
}

{
  const context = makeRepository();
  const report = makeReport({ project: "webkit" });
  report.config.projects = [{ id: "chromium", name: "chromium", retries: 0, repeatEach: 1 }];
  report.config.metadata.requiredTestEvidence.gateId = "release.inventory-fixture";
  expectIssue(
    reportResult(context.root, report, 0, "release.inventory-fixture"),
    "test record uses unexpected project webkit",
  );
}

{
  const context = makeRepository();
  expectIssue(reportResult(context.root, makeReport({ file: "other.spec.ts" })), "required spec tests/e2e/required.spec.ts is missing");
}

{
  const context = makeRepository();
  expectIssue(
    reportResult(context.root, makeReport({ title: "renamed required identity" })),
    "requirement fixture.required is missing or duplicated",
  );
}

{
  const context = makeRepository();
  const report = makeReport();
  report.config.grep = { source: "required identity", flags: "" };
  expectIssue(reportResult(context.root, report), "unapproved grep or shard filter");
}

{
  const context = makeRepository();
  const report = makeReport();
  report.config.shard = { current: 1, total: 2 };
  expectIssue(reportResult(context.root, report), "unapproved grep or shard filter");
}

{
  const context = makeRepository();
  const report = makeReport();
  report.config.configFile = "/tmp/other/playwright.config.ts";
  report.config.rootDir = "/tmp/other/tests/e2e";
  expectIssue(
    reportResult(context.root, report),
    "produced by another Playwright configuration",
  );
  expectIssue(reportResult(context.root, report), "unexpected test root");
}

{
  const context = makeRepository();
  const gate = context.manifest.gates.find((entry) => entry.id === "release.fixture");
  write(
    context.root,
    "tests/required/focused.spec.ts",
    "test('required identity', async () => { expect(true).toBeTruthy(); });\n",
  );
  gate.requiredSources = ["tests/required/focused.spec.ts"];
  gate.requiredTests[0].file = "tests/required/focused.spec.ts";
  gate.playwright.testRoot = "tests/required";
  delete gate.reportOwnershipRegistrations;
  delete gate.supportingInventories;
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  const report = makeReport({ file: "focused.spec.ts" });
  report.config.rootDir = "<repository-root>/tests/required";
  const result = reportResult(context.root, report);
  assert.deepEqual(result.issues, [], "an explicit focused test root must remain truthful");
  assert.equal(result.valid, true);
}

{
  const context = makeRepository();
  const gate = context.manifest.gates.find((entry) => entry.id === "release.fixture");
  gate.playwright.testRoot = "tests/../outside";
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "malformed Playwright invocation",
  );
}

{
  const context = makeRepository();
  expectIssue(
    reportResult(context.root, makeReport({ status: "skipped", declaredStatus: "skipped" })),
    "required test was skipped",
  );
}

{
  const context = makeRepository();
  expectIssue(reportResult(context.root, makeReport({ retry: 1 })), "required test was flaky or retried");
}

for (const missingProject of ["chromium", "webkit"]) {
  const context = makeRepository();
  const gate = context.manifest.gates.find((entry) => entry.id === "release.fixture");
  gate.requiredProjects = ["chromium", "webkit"];
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  const presentProject = missingProject === "chromium" ? "webkit" : "chromium";
  expectIssue(
    reportResult(context.root, makeReport({ project: presentProject })),
    `required project ${missingProject} is missing`,
  );
}

{
  const context = makeRepository();
  const report = makeReport();
  report.stats.expected = 2;
  expectIssue(reportResult(context.root, report), "aggregate counts do not match parsed test results");
}

{
  const context = makeRepository();
  write(
    context.root,
    "tests/e2e/required.spec.ts",
    "test.only('required identity', async () => { expect(true).toBeTruthy(); });\n",
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "focused test execution is prohibited",
  );
}

{
  const context = makeRepository();
  expectIssue(reportResult(context.root, makeReport(), 1), "test process exited nonzero");
}

{
  const context = makeRepository();
  expectIssue(reportResult(context.root, makeReport({ status: "failed" })), "required test failed");
}

{
  const context = makeRepository();
  const report = makeReport();
  report.suites[0].specs[0].ok = false;
  expectIssue(reportResult(context.root, report), "required test failed");
}

{
  const context = makeRepository();
  writeEvidence(context.root);
  rmSync(path.join(context.root, "evidence/playwright.json"));
  expectIssue(
    validateRequiredTestEvidence({
      repositoryRoot: context.root,
      gateId: "release.fixture",
      evidencePath: "evidence/evidence.json",
    }),
    "required-test report is missing",
  );
}

{
  const context = makeRepository();
  writeEvidence(context.root);
  write(context.root, "evidence/playwright.json", "{\"truncated\":");
  expectIssue(
    validateRequiredTestEvidence({
      repositoryRoot: context.root,
      gateId: "release.fixture",
      evidencePath: "evidence/evidence.json",
    }),
    "report is malformed or truncated",
  );
}

{
  const context = makeRepository();
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const report = makeReport({ startTime: stale });
  writeEvidence(context.root, {
    report,
    mutateEvidence: (evidence) => {
      evidence.startedAt = new Date(Date.parse(stale) - 100).toISOString();
      evidence.completedAt = new Date(Date.parse(stale) + 200).toISOString();
    },
  });
  expectIssue(
    validateRequiredTestEvidence({
      repositoryRoot: context.root,
      gateId: "release.fixture",
      evidencePath: "evidence/evidence.json",
    }),
    "evidence is stale",
  );
}

{
  const context = makeRepository();
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const report = makeReport({ startTime: stale });
  writeEvidence(context.root, {
    report,
    mutateEvidence: (evidence) => {
      evidence.startedAt = new Date(Date.parse(stale) - 100).toISOString();
      evidence.completedAt = new Date().toISOString();
    },
  });
  expectIssue(
    validateRequiredTestEvidence({
      repositoryRoot: context.root,
      gateId: "release.fixture",
      evidencePath: "evidence/evidence.json",
    }),
    "report is stale even though its evidence envelope is fresh",
  );
}

{
  const context = makeRepository();
  writeEvidence(context.root);
  expectIssue(
    validateRequiredTestEvidence({
      repositoryRoot: context.root,
      gateId: "release.fixture",
      evidencePath: "evidence/evidence.json",
      expectedSourceCommitSha: "3".repeat(40),
    }),
    "another source commit",
  );
}

{
  const context = makeRepository();
  writeEvidence(context.root);
  expectIssue(
    validateRequiredTestEvidence({
      repositoryRoot: context.root,
      gateId: "release.fixture",
      evidencePath: "evidence/evidence.json",
      expectedArtifactSha256: "4".repeat(64),
    }),
    "another artifact",
  );
}

{
  const context = makeRepository();
  writeEvidence(context.root, {
    mutateEvidence: (evidence) => {
      evidence.sourceCommitSha = null;
      evidence.artifactSha256 = null;
    },
  });
  const result = validateRequiredTestEvidence({
    repositoryRoot: context.root,
    gateId: "release.fixture",
    evidencePath: "evidence/evidence.json",
  });
  expectIssue(result, "source commit identity is missing or invalid");
  expectIssue(result, "artifact identity is missing or invalid");
}

{
  const context = makeRepository();
  writeEvidence(context.root);
  const manifest = { gitCommit: SOURCE_SHA, artifactSha256: ARTIFACT_SHA };
  const staged = {
    deploymentUrl: "https://staged.example.test",
    artifactSha256: ARTIFACT_SHA,
    gitCommit: SOURCE_SHA,
  };
  const valid = validateGateA3CertificationEvidence({
    repositoryRoot: context.root,
    manifest,
    staged,
    evidencePath: "evidence/evidence.json",
    certifiedDeploymentUrl: staged.deploymentUrl,
    gateId: "release.fixture",
  });
  assert.equal(valid.valid, true, "Gate A3 certification must accept exact bound evidence");
  const evidenceBytes = readFileSync(path.join(context.root, "evidence/evidence.json"));
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  const report = JSON.parse(
    readFileSync(path.join(context.root, evidence.report.path), "utf8"),
  );
  const certification = {
    schema: "interior-ai.gate-a3-prebuilt-certification.v1",
    deploymentUrl: staged.deploymentUrl,
    artifactSha256: ARTIFACT_SHA,
    gitCommit: SOURCE_SHA,
    requiredTestEvidencePath: "evidence/evidence.json",
    requiredTestEvidenceSha256: sha256(evidenceBytes),
    reportPath: evidence.report.path,
    reportSha256: evidence.report.sha256,
    stats: report.stats,
  };
  await assert.doesNotReject(() =>
    validateGateA3PromotionCertification({
      repositoryRoot: context.root,
      manifest,
      staged,
      certification,
      gateId: "release.fixture",
    }),
  );
  await assert.rejects(
    () =>
      validateGateA3PromotionCertification({
        repositoryRoot: context.root,
        manifest,
        staged,
        certification: {
          ...certification,
          requiredTestEvidenceSha256: "6".repeat(64),
        },
        gateId: "release.fixture",
      }),
    /evidence SHA-256 does not match/,
  );
  assert.throws(
    () =>
      validateGateA3CertificationEvidence({
        repositoryRoot: context.root,
        manifest: { ...manifest, gitCommit: "3".repeat(40) },
        staged: { ...staged, gitCommit: "3".repeat(40) },
        evidencePath: "evidence/evidence.json",
        certifiedDeploymentUrl: staged.deploymentUrl,
        gateId: "release.fixture",
      }),
    /another source commit/,
  );
  assert.throws(
    () =>
      validateGateA3CertificationEvidence({
        repositoryRoot: context.root,
        manifest,
        staged: { ...staged, artifactSha256: "4".repeat(64) },
        evidencePath: "evidence/evidence.json",
        certifiedDeploymentUrl: staged.deploymentUrl,
        gateId: "release.fixture",
      }),
    /does not match the current/,
  );
  assert.throws(
    () =>
      validateGateA3CertificationEvidence({
        repositoryRoot: context.root,
        manifest,
        staged: { ...staged, gitCommit: "5".repeat(40) },
        evidencePath: "evidence/evidence.json",
        certifiedDeploymentUrl: staged.deploymentUrl,
        gateId: "release.fixture",
      }),
    /current source commit/,
  );
  assert.throws(
    () =>
      validateGateA3CertificationEvidence({
        repositoryRoot: context.root,
        manifest,
        staged: { ...staged, deploymentUrl: "https://another-stage.example.test" },
        evidencePath: "evidence/evidence.json",
        certifiedDeploymentUrl: "https://another-stage.example.test",
        gateId: "release.fixture",
      }),
    /targets another staged deployment/,
  );
}

{
  const context = makeRepository();
  renameSync(
    path.join(context.root, "tests/e2e/required.spec.ts"),
    path.join(context.root, "tests/e2e/renamed.spec.ts"),
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "required source tests/e2e/required.spec.ts is missing",
  );
}

{
  const context = makeRepository();
  write(
    context.root,
    "tests/e2e/required.spec.ts",
    'import { registerRequiredTests } from "./required-module";\n',
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "does not invoke registerRequiredTests",
  );
}

{
  const context = makeRepository();
  const failed = makeReport({ status: "failed" });
  failed.config.metadata.requiredTestEvidence.gateId = "advisory.fixture";
  const result = reportResult(context.root, failed, 1, "advisory.fixture");
  assert.equal(result.valid, false, "advisory failures must remain visible");
  assert.equal(result.blocking, false, "advisory failures follow the documented non-blocking policy");
}

{
  const context = makeRepository();
  const report = makeReport();
  report.config.metadata.requiredTestEvidence.authToken = "machine-local-secret";
  expectIssue(reportResult(context.root, report), "secret-bearing fields");
}

{
  const context = makeRepository();
  const report = makeReport();
  report.stdout = [{ text: "neutral-field-sensitive-value" }];
  expectIssue(
    reportResult(context.root, report, 0, "release.fixture", {
      AUTH_SECRET: "neutral-field-sensitive-value",
    }),
    "sensitive environment values",
  );
}

{
  const context = makeRepository();
  const report = makeReport();
  report.config.metadata.requiredTestEvidence.outputPath =
    "/Users/example/Library/Caches/private-report.json";
  expectIssue(reportResult(context.root, report), "machine-local paths");
}

{
  const context = makeRepository();
  const report = makeReport();
  report.config.configFile = path.join(context.root, "playwright.config.ts");
  write(context.root, "evidence/playwright.json", `${JSON.stringify(report, null, 2)}\n`);
  canonicalizeRequiredTestReport(context.root, "evidence/playwright.json");
  const canonical = readFileSync(path.join(context.root, "evidence/playwright.json"), "utf8");
  assert.equal(canonical.includes(context.root), false, "repository paths must be canonicalized");
  assert.equal(canonical.includes("<repository-root>/playwright.config.ts"), true);
}

{
  const context = makeRepository();
  const reportPath = "evidence/playwright.json";
  const outputPath =
    ".local/required-test-evidence/release.fixture/playwright-output/unsafe-attachment.txt";
  write(context.root, reportPath, "neutral-field-sensitive-value\n");
  write(context.root, outputPath, "neutral-field-sensitive-value\n");
  removeUnsafeRequiredTestArtifacts({
    repositoryRoot: context.root,
    gateId: "release.fixture",
    reportPath,
  });
  assert.equal(existsSync(path.join(context.root, reportPath)), false);
  assert.equal(existsSync(path.join(context.root, outputPath)), false);
}

assert.equal(
  requiredTestArtifactsAreUnsafe({
    reportWasParsed: false,
    validationIssues: ["Unexpected end of JSON input"],
  }),
  true,
  "malformed or truncated reports must never remain eligible for artifact upload",
);
assert.equal(
  requiredTestArtifactsAreUnsafe({
    reportWasParsed: true,
    validationIssues: ["required test failed"],
  }),
  false,
  "valid failed reports remain available for safe diagnostics",
);

{
  const context = makeRepository();
  write(
    context.root,
    "tests/e2e/required.spec.ts",
    "test('required identity', async () => { test.info().annotations.push({ type: 'note' }); return; });\n",
  );
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "can be annotated away",
  );
}

{
  const requiredWorkflow = readFileSync(
    path.join(process.cwd(), ".github/workflows/ci.yml"),
    "utf8",
  );
  const advisoryWorkflow = readFileSync(
    path.join(process.cwd(), ".github/workflows/full-advisory-e2e.yml"),
    "utf8",
  );
  const requiredDefinition = parseYaml(requiredWorkflow);
  const advisoryDefinition = parseYaml(advisoryWorkflow);
  assert.ok(requiredDefinition && advisoryDefinition, "both workflow files must be valid YAML");
  const requiredJobs = requiredDefinition.jobs;
  assert.ok(requiredJobs?.["secret-scan"], "the required secret-scan job must retain its exact id");
  assert.ok(requiredJobs?.["stable-checks"], "the required stable-checks job must retain its exact id");
  assert.ok(
    requiredJobs?.["advisory-contract-preflight"],
    "the required advisory-contract-preflight job must retain its exact id",
  );
  assert.ok(requiredJobs?.["merge-gate"], "the required merge-gate job must retain its exact id");
  const requiredSourceJobs = [
    "secret-scan",
    "stable-checks",
    "advisory-contract-preflight",
  ];
  for (const jobId of requiredSourceJobs) {
    const job = requiredJobs[jobId];
    const checkout = job.steps.find((step) => step.uses === "actions/checkout@v4");
    const sourceVerification = job.steps.find(
      (step) => step.name === "Verify checked-out source identity",
    );
    assert.equal(
      checkout?.with?.ref,
      "${{ github.event.pull_request.head.sha || github.sha }}",
      `${jobId} must checkout the exact pull-request head`,
    );
    assert.equal(
      sourceVerification?.run,
      "node scripts/gitleaks-artifact.mjs verify-source",
      `${jobId} must independently verify git rev-parse HEAD`,
    );
    assert.equal(
      sourceVerification?.env?.GITLEAKS_EXPECTED_SOURCE_SHA,
      "${{ github.event.pull_request.head.sha || github.sha }}",
      `${jobId} must compare the checkout to the workflow's exact expected source`,
    );
  }
  assert.equal(
    requiredDefinition.concurrency,
    undefined,
    "workflow-wide cancellation must not couple stable and advisory preflight jobs",
  );
  assert.notEqual(
    requiredJobs["stable-checks"].concurrency.group,
    requiredJobs["advisory-contract-preflight"].concurrency.group,
    "stable and advisory preflight jobs need separate concurrency groups",
  );
  assert.equal(requiredJobs["stable-checks"].concurrency["cancel-in-progress"], false);
  assert.equal(
    requiredJobs["advisory-contract-preflight"].concurrency["cancel-in-progress"],
    true,
  );
  const stableJob = requiredWorkflow.slice(
    requiredWorkflow.indexOf("  stable-checks:"),
    requiredWorkflow.indexOf("  advisory-contract-preflight:"),
  );
  const contractPreflightJob = requiredWorkflow.slice(
    requiredWorkflow.indexOf("  advisory-contract-preflight:"),
    requiredWorkflow.indexOf("  merge-gate:"),
  );
  assert.ok(
    stableJob.indexOf("Apply database migrations") <
      stableJob.indexOf("Build strict production-equivalent artifact evidence"),
    "the fresh PostgreSQL service must be migrated before production smoke",
  );
  assert.ok(
    stableJob.indexOf("Run runtime smoke tests") <
      stableJob.indexOf("Prepare standalone production evidence bundle"),
    "only completed smoke evidence may be bundled",
  );
  assert.ok(
    stableJob.indexOf("Build strict production-equivalent artifact evidence") <
        stableJob.indexOf("Run required responsive public-share matrix") &&
      stableJob.indexOf("Install Playwright Chromium and WebKit") <
        stableJob.indexOf("Run required responsive public-share matrix") &&
      stableJob.indexOf("Run required responsive public-share matrix") <
        stableJob.indexOf("Run Pro visual policy matrix"),
    "the responsive public-share gate must reuse the strict build and installed Chromium/WebKit before the remaining browser policy",
  );
  assert.match(
    stableJob,
    /Run required responsive public-share matrix[\s\S]*?npm run test:public-share-responsive-required/,
  );
  const responsiveConfig = readFileSync(
    path.join(process.cwd(), "playwright.share-responsive.config.ts"),
    "utf8",
  );
  assert.match(
    responsiveConfig,
    /if \(requiredTestGateId && !useProductionServer\)[\s\S]*Required responsive evidence must use the strict production server/,
    "required responsive evidence must fail instead of selecting the development server",
  );
  assert.doesNotMatch(
    stableJob.slice(0, stableJob.indexOf("Build strict production-equivalent artifact evidence")),
    /ci:auth-fixture:preflight|next dev|test:advisory-auth-preflight/,
    "stable-checks must not start a live Next server before the strict build",
  );
  assert.ok(
    stableJob.indexOf("Verify pristine strict-build workspace") <
      stableJob.indexOf("Build strict production-equivalent artifact evidence"),
    "the strict build must be guarded by a pristine-workspace assertion",
  );
  assert.match(stableJob, /if \[ -e \.next \]/);
  assert.match(stableJob, /git status --porcelain=v1 --untracked-files=all --ignored=matching/);
  assert.match(stableJob, /TESTED_SOURCE_SHA:\s*\$\{\{ steps\.verify-source\.outputs\.tested_source_sha \}\}/);
  assert.match(stableJob, /Configure synthetic CI OAuth fixture[\s\S]*npm run ci:auth-fixture:export/);
  assert.ok(
    stableJob.indexOf("npm run ci:auth-fixture:export") <
      stableJob.indexOf("npm run ci:auth-fixture:validate-existing") &&
      stableJob.indexOf("npm run ci:auth-fixture:validate-existing") <
        stableJob.indexOf("npm run ci:auth-fixture:production-misuse-existing") &&
      stableJob.indexOf("npm run ci:auth-fixture:production-misuse-existing") <
        stableJob.indexOf("Apply database migrations"),
    "stable CI must validate and production-check the exported fixture session",
  );
  assert.match(stableJob, /CI_AUTH_FIXTURE_SESSION_ID:/);
  assert.match(stableJob, /CI_AUTH_FIXTURE_SESSION_NONCE:/);
  assert.ok(
    stableJob.indexOf("npm run test:auth-env-hardening") <
        stableJob.indexOf("npm run test:required-test-truthfulness") &&
      stableJob.indexOf("npm run test:required-test-truthfulness") <
        stableJob.indexOf("Build strict production-equivalent artifact evidence"),
    "stable-checks may retain non-server structural validation before the expensive build",
  );
  assert.match(stableJob, /Verify standalone production evidence bundle/);
  assert.match(stableJob, /verify-standalone/);
  assert.match(
    contractPreflightJob,
    /Preflight advisory authentication environment[\s\S]*npm run ci:auth-fixture:preflight-existing/,
  );
  assert.match(contractPreflightJob, /npm run test:auth-env-hardening/);
  assert.match(contractPreflightJob, /npm run test:required-test-truthfulness/);
  assert.match(contractPreflightJob, /Verify advisory preflight cleanup and isolation/);
  assert.match(contractPreflightJob, /if \[ ! -d \.next \]/);
  assert.doesNotMatch(contractPreflightJob, /test:e2e:advisory|Run advisory full E2E inventory/);
  assert.equal(
    requiredJobs["stable-checks"].steps.filter((step) => step.uses === "actions/checkout@v4").length,
    1,
  );
  assert.equal(
    requiredJobs["advisory-contract-preflight"].steps.filter(
      (step) => step.uses === "actions/checkout@v4",
    ).length,
    1,
    "the live preflight must own a separate checkout/workspace boundary",
  );
  const stableSteps = requiredJobs["stable-checks"].steps;
  const failureDiagnostics = stableSteps.find(
    (step) => step.name === "Prepare safe runtime failure diagnostics",
  );
  const failureUpload = stableSteps.find(
    (step) => step.name === "Upload safe runtime failure diagnostics",
  );
  const stableReady = stableSteps.find((step) => step.name === "Declare stable evidence ready");
  const stableUpload = stableSteps.find(
    (step) => step.name === "Upload stable production evidence",
  );
  assert.equal(
    failureDiagnostics?.if,
    "failure() && !cancelled() && steps.strict-build.outcome == 'success' && steps.runtime-smoke.outcome == 'failure'",
    "runtime diagnostics may be prepared only after a failing runtime producer",
  );
  assert.equal(
    failureUpload?.if,
    "always() && !cancelled() && steps.failure-diagnostics.outputs.safe_failure_diagnostics_ready == 'true'",
    "runtime diagnostics upload must be skipped when no producer declared a safe payload",
  );
  assert.equal(failureUpload?.with?.["if-no-files-found"], "error");
  assert.match(failureDiagnostics.run, /failure-upload\.staging/);
  assert.match(
    failureDiagnostics.run,
    /node scripts\/production-artifact-evidence\.mjs verify-runtime-failure/,
  );
  assert.match(failureDiagnostics.run, /Runtime failure diagnostics inventory is not exact/);
  assert.match(failureDiagnostics.run, /safe_failure_diagnostics_ready=true/);
  const runWorkflowShell = (source, cwd, environment = {}) =>
    spawnSync("bash", ["-c", source], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
  {
    const root = mkdtempSync(path.join(tmpdir(), "ch-0017-no-runtime-diagnostics-"));
    const outputPath = path.join(root, "github-output");
    const result = runWorkflowShell(failureDiagnostics.run, root, {
      GITHUB_OUTPUT: outputPath,
    });
    assert.equal(result.status, 0, "an absent runtime producer must not invent a payload");
    assert.equal(existsSync(path.join(root, ".local/production-artifact-evidence/failure-upload")), false);
    assert.equal(existsSync(outputPath), false, "an absent producer must not report ready=true");
    rmSync(root, { recursive: true, force: true });
  }
  {
    const root = mkdtempSync(path.join(tmpdir(), "ch-0017-safe-runtime-diagnostics-"));
    const evidenceRoot = ".local/production-artifact-evidence";
    const outputPath = path.join(root, "github-output");
    for (const file of ["manifest.json", "runtime-smoke.json", "runtime-smoke-phases.json"]) {
      write(root, `${evidenceRoot}/${file}`, `${JSON.stringify({ schema: file })}\n`);
    }
    const result = runWorkflowShell(
      failureDiagnostics.run.replace(
        "node scripts/production-artifact-evidence.mjs verify-runtime-failure",
        "true",
      ),
      root,
      {
      GITHUB_OUTPUT: outputPath,
      GOOGLE_CLIENT_ID: "generated-client-value.example.test",
      GOOGLE_CLIENT_SECRET: "generated-secret-value",
      AUTH_SECRET: "generated-auth-secret-value",
      NEXTAUTH_SECRET: "generated-nextauth-secret-value",
      DATABASE_URL: "database-url-value",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(outputPath, "utf8"), "safe_failure_diagnostics_ready=true\n");
    assert.deepEqual(
      readdirSync(path.join(root, `${evidenceRoot}/failure-upload`)).sort(),
      ["manifest.json", "runtime-smoke-phases.json", "runtime-smoke.json"],
    );
    assert.equal(existsSync(path.join(root, `${evidenceRoot}/failure-upload.staging`)), false);
    rmSync(root, { recursive: true, force: true });
  }
  {
    const root = mkdtempSync(path.join(tmpdir(), "ch-0017-unsafe-runtime-diagnostics-"));
    const evidenceRoot = ".local/production-artifact-evidence";
    const outputPath = path.join(root, "github-output");
    write(root, `${evidenceRoot}/manifest.json`, `${JSON.stringify({ value: "generated-secret-value" })}\n`);
    write(root, `${evidenceRoot}/runtime-smoke.json`, "{}\n");
    write(root, `${evidenceRoot}/runtime-smoke-phases.json`, "{}\n");
    const result = runWorkflowShell(
      failureDiagnostics.run.replace(
        "node scripts/production-artifact-evidence.mjs verify-runtime-failure",
        "true",
      ),
      root,
      {
      GITHUB_OUTPUT: outputPath,
      GOOGLE_CLIENT_SECRET: "generated-secret-value",
      },
    );
    assert.notEqual(result.status, 0, "credential-bearing failure diagnostics must fail closed");
    assert.equal(existsSync(path.join(root, `${evidenceRoot}/failure-upload`)), false);
    assert.equal(existsSync(path.join(root, `${evidenceRoot}/failure-upload.staging`)), false);
    assert.equal(existsSync(outputPath), false);
    rmSync(root, { recursive: true, force: true });
  }
  assert.ok(
    stableJob.indexOf("Verify standalone production evidence bundle") <
      stableJob.indexOf("Declare stable evidence ready") &&
      stableJob.indexOf("Declare stable evidence ready") <
        stableJob.indexOf("Upload stable production evidence"),
    "successful standalone evidence must be verified before it becomes mandatory to upload",
  );
  assert.match(stableReady.run, /Stable evidence producer completed without its upload directory/);
  assert.match(stableReady.run, /Stable evidence upload inventory contains a non-regular entry/);
  assert.match(stableReady.run, /stable_evidence_ready=true/);
  {
    const root = mkdtempSync(path.join(tmpdir(), "ch-0017-stable-evidence-ready-"));
    const uploadRoot = ".local/production-artifact-evidence/upload";
    const outputPath = path.join(root, "github-output");
    write(root, `${uploadRoot}/ch0016-ch0017-evidence-bundle.tar.gz`, "bundle");
    write(root, `${uploadRoot}/ch0016-ch0017-evidence-bundle.tar.gz.sha256`, "hash\n");
    const ready = runWorkflowShell(stableReady.run, root, { GITHUB_OUTPUT: outputPath });
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(readFileSync(outputPath, "utf8"), "stable_evidence_ready=true\n");
    rmSync(root, { recursive: true, force: true });
  }
  {
    const root = mkdtempSync(path.join(tmpdir(), "ch-0017-stable-evidence-missing-"));
    const uploadRoot = ".local/production-artifact-evidence/upload";
    const outputPath = path.join(root, "github-output");
    write(root, `${uploadRoot}/ch0016-ch0017-evidence-bundle.tar.gz`, "bundle");
    const missing = runWorkflowShell(stableReady.run, root, { GITHUB_OUTPUT: outputPath });
    assert.notEqual(missing.status, 0, "a declared stable producer with a missing file must fail closed");
    assert.equal(existsSync(outputPath), false, "a missing stable payload must not report ready=true");
    rmSync(root, { recursive: true, force: true });
  }
  {
    const root = mkdtempSync(path.join(tmpdir(), "ch-0017-stable-evidence-extra-"));
    const uploadRoot = ".local/production-artifact-evidence/upload";
    const outputPath = path.join(root, "github-output");
    write(root, `${uploadRoot}/ch0016-ch0017-evidence-bundle.tar.gz`, "bundle");
    write(root, `${uploadRoot}/ch0016-ch0017-evidence-bundle.tar.gz.sha256`, "hash\n");
    mkdirSync(path.join(root, uploadRoot, "unexpected-directory"));
    const extra = runWorkflowShell(stableReady.run, root, { GITHUB_OUTPUT: outputPath });
    assert.notEqual(extra.status, 0, "an extra stable upload directory must fail closed");
    assert.equal(existsSync(outputPath), false, "an extra entry must not report ready=true");
    rmSync(root, { recursive: true, force: true });
  }
  {
    const root = mkdtempSync(path.join(tmpdir(), "ch-0017-stable-evidence-symlink-"));
    const uploadRoot = ".local/production-artifact-evidence/upload";
    const outputPath = path.join(root, "github-output");
    write(root, "real-bundle", "bundle");
    write(root, `${uploadRoot}/ch0016-ch0017-evidence-bundle.tar.gz.sha256`, "hash\n");
    symlinkSync(
      path.join(root, "real-bundle"),
      path.join(root, uploadRoot, "ch0016-ch0017-evidence-bundle.tar.gz"),
    );
    const symlink = runWorkflowShell(stableReady.run, root, { GITHUB_OUTPUT: outputPath });
    assert.notEqual(symlink.status, 0, "a symlinked stable bundle must fail closed");
    assert.equal(existsSync(outputPath), false, "a symlinked payload must not report ready=true");
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(
    stableUpload?.if,
    "steps.stable-evidence.outputs.stable_evidence_ready == 'true'",
  );
  assert.equal(stableUpload?.with?.["if-no-files-found"], "error");
  assert.equal(stableUpload?.with?.path, ".local/production-artifact-evidence/upload/");
  assert.doesNotMatch(stableJob, /if-no-files-found:\s*ignore/);
  assert.match(
    stableJob,
    /Explain absent production evidence payload[\s\S]*No production evidence payload was expected because the strict build did not complete/,
    "a pre-runtime build failure must explain why every upload is skipped",
  );
  assert.doesNotMatch(stableJob, /^\s+GOOGLE_CLIENT_(?:ID|SECRET):/m);
  assert.doesNotMatch(contractPreflightJob, /^\s+GOOGLE_CLIENT_(?:ID|SECRET):/m);
  assert.doesNotMatch(requiredWorkflow, /^  e2e-full:\s*$/m);
  assert.doesNotMatch(requiredWorkflow, /npm run test:e2e:advisory/);
  const advisoryJob = advisoryWorkflow.slice(advisoryWorkflow.indexOf("  e2e-full:"));
  assert.ok(
    advisoryJob.indexOf("Prepare portable advisory evidence") <
      advisoryJob.indexOf("Upload test results"),
    "advisory output must be sanitized immediately before retention",
  );
  verifyAdvisoryWorkflowContract(advisoryWorkflow);
  assert.doesNotMatch(advisoryJob, /\n\s+needs:\s*stable-checks/);
  assert.ok(
    advisoryJob.indexOf("Preflight advisory authentication environment") <
      advisoryJob.indexOf("Install Playwright browsers"),
    "a malformed advisory auth environment must fail before browser installation",
  );
  assert.match(advisoryJob, /npm run ci:auth-fixture:preflight-existing/);
  assert.ok(
    advisoryJob.indexOf("npm run ci:auth-fixture:export") <
      advisoryJob.indexOf("npm run ci:auth-fixture:validate-existing") &&
      advisoryJob.indexOf("npm run ci:auth-fixture:validate-existing") <
        advisoryJob.indexOf("npm run ci:auth-fixture:production-misuse-existing") &&
      advisoryJob.indexOf("npm run ci:auth-fixture:production-misuse-existing") <
        advisoryJob.indexOf("Apply database migrations"),
    "advisory CI must validate and production-check the exported fixture session",
  );
  assert.match(advisoryJob, /CI_AUTH_FIXTURE_SESSION_ID:/);
  assert.doesNotMatch(advisoryJob, /^\s+GOOGLE_CLIENT_(?:ID|SECRET):/m);
  assert.doesNotMatch(
    advisoryJob,
    /path:\s*[|>]?[\s\S]*?\.local\/required-test-evidence\//,
    "raw Playwright evidence must not be uploaded",
  );
  const assertRoutingPolicy = (required, advisory) => {
    const approvedPrTargets = ["main", "develop", "staging", "integration/deep-clean-v1"];
    assert.deepEqual(Object.keys(required.on).sort(), ["pull_request", "push", "workflow_dispatch"]);
    assert.deepEqual(required.on.pull_request, { branches: approvedPrTargets },
      "required CI must retain its approved PR targets and default activity types");
    assert.deepEqual(required.on.push, { branches: ["main", "develop", "staging"] });
    assert.equal(required.on.workflow_dispatch, null);
    assert.deepEqual(Object.keys(advisory.on).sort(), ["pull_request", "schedule", "workflow_dispatch"]);
    assert.deepEqual(Object.keys(advisory.on.pull_request).sort(), ["branches", "types"]);
    assert.deepEqual(advisory.on.pull_request.branches, approvedPrTargets,
      "full advisory must retain exactly the approved PR targets");
    assert.deepEqual(advisory.on.pull_request.types, ["labeled"],
      "ordinary PR synchronize events must not launch the full advisory workflow");
    assert.equal(advisory.jobs["e2e-full"].if.replace(/\s+/g, " ").trim(),
      "github.event_name == 'workflow_dispatch' || github.event_name == 'schedule' || " +
        "(github.event_name == 'pull_request' && github.event.action == 'labeled' && " +
        "github.event.label.name == 'run-full-e2e')",
      "full advisory PR execution must require the run-full-e2e label");
    assert.deepEqual(advisory.on.schedule, [{ cron: "17 2 * * *" }]);
    assert.deepEqual(advisory.on.workflow_dispatch, {
      inputs: { source_sha: { description: "Exact 40-character commit SHA to test", required: true, type: "string" } },
    });
    for (const workflow of [required, advisory]) {
      assert.deepEqual(workflow.permissions, { contents: "read" });
    }
  };
  assertRoutingPolicy(requiredDefinition, advisoryDefinition);
  const routingMutations = [
    ["missing canonical CI target", (required) => required.on.pull_request.branches.pop()],
    ["unauthorized CI target", (required) => required.on.pull_request.branches.push("feature/unapproved")],
    ["unauthorized CI event", (required) => { required.on.pull_request_target = {}; }],
    ["changed CI push routing", (required) => required.on.push.branches.push("integration/deep-clean-v1")],
    ["missing canonical advisory target", (_, advisory) => advisory.on.pull_request.branches.pop()],
    ["wildcard advisory target", (_, advisory) => { advisory.on.pull_request.branches = ["*"]; }],
    ["unauthorized advisory target", (_, advisory) => advisory.on.pull_request.branches.push("feature/unapproved")],
    ["unauthorized advisory event", (_, advisory) => { advisory.on.push = {}; }],
    ["ordinary synchronize event", (_, advisory) => advisory.on.pull_request.types.push("synchronize")],
    ["implicit PR activity types", (_, advisory) => { delete advisory.on.pull_request.types; }],
    ["wrong advisory label", (_, advisory) => { advisory.jobs["e2e-full"].if = advisory.jobs["e2e-full"].if.replace("run-full-e2e", "unapproved-label"); }],
    ["missing label requirement", (_, advisory) => { advisory.jobs["e2e-full"].if = "github.event_name == 'pull_request'"; }],
    ["broadened advisory condition", (_, advisory) => { advisory.jobs["e2e-full"].if += " || true"; }],
    ["changed advisory schedule", (_, advisory) => { advisory.on.schedule[0].cron = "* * * * *"; }],
    ["optional dispatch source", (_, advisory) => { advisory.on.workflow_dispatch.inputs.source_sha.required = false; }],
    ["write permission", (_, advisory) => { advisory.permissions.contents = "write"; }],
  ];
  for (const [label, mutate] of routingMutations) {
    const required = structuredClone(requiredDefinition);
    const advisory = structuredClone(advisoryDefinition);
    mutate(required, advisory);
    assert.throws(() => assertRoutingPolicy(required, advisory), assert.AssertionError,
      `routing policy must reject ${label}`);
  }
  assert.doesNotMatch(advisoryWorkflow, /types:\s*\[[^\]]*synchronize/);
  assert.match(advisoryWorkflow, /github\.event\.label\.name == 'run-full-e2e'/);
  assert.match(advisoryWorkflow, /workflow_dispatch:[\s\S]*source_sha:[\s\S]*required:\s*true/);
  assert.match(advisoryWorkflow, /schedule:[\s\S]*cron:/);
  assert.match(advisoryWorkflow, /'refs\/heads\/staging'/);
  assert.match(
    advisoryWorkflow,
    /ref:\s*\$\{\{[^\n]*github\.event\.pull_request\.head\.sha[^\n]*inputs\.source_sha[^\n]*refs\/heads\/staging[^\n]*\}\}/,
    "label, manual, and scheduled full-advisory runs must select an explicit source",
  );
  assert.ok(
    advisoryJob.indexOf("Verify full-advisory source identity") <
      advisoryJob.indexOf("Apply database migrations") &&
      advisoryJob.indexOf("EXPECTED_SOURCE_SHA") <
        advisoryJob.indexOf("Run advisory full E2E inventory"),
    "the deliberate full suite must verify the exact checkout before execution",
  );
  assert.match(advisoryWorkflow, /group:\s*full-advisory-/);
  assert.match(advisoryWorkflow, /cancel-in-progress:\s*true/);
  assert.doesNotMatch(advisoryWorkflow, /group:\s*ci-/);
  assert.doesNotMatch(
    advisoryJob,
    /continue-on-error:\s*true/,
    "the separate informational workflow must preserve a real failed job conclusion",
  );
  assert.match(advisoryJob, /if:\s*always\(\) && !cancelled\(\)/);
  assert.match(requiredWorkflow, /merge-gate:\n\s+name:\s*merge-gate\n/);
  assert.deepEqual(
    requiredJobs["merge-gate"].needs,
    ["secret-scan", "stable-checks", "advisory-contract-preflight"],
    "merge-gate must fail closed over every required job",
  );
  const mergeGateSource = requiredWorkflow.slice(requiredWorkflow.indexOf("  merge-gate:"));
  assert.match(
    mergeGateSource,
    /ADVISORY_CONTRACT_PREFLIGHT_RESULT:\s*\$\{\{ needs\.advisory-contract-preflight\.result \}\}/,
  );
  assert.match(
    mergeGateSource,
    /\[ "\$ADVISORY_CONTRACT_PREFLIGHT_RESULT" != "success" \]/,
    "a failed or cancelled required preflight must fail merge-gate",
  );
  assert.doesNotMatch(mergeGateSource, /e2e-full|full-advisory|test:e2e:advisory/);
  const secretScanJob = requiredWorkflow.slice(
    requiredWorkflow.indexOf("  secret-scan:"),
    requiredWorkflow.indexOf("  stable-checks:"),
  );
  assert.match(secretScanJob, /GITLEAKS_ENABLE_UPLOAD_ARTIFACT:\s*"false"/);
  assert.doesNotMatch(secretScanJob, /^\s+GITHUB_SHA:/m);
  assert.ok(
    secretScanJob.indexOf("gitleaks-artifact.mjs verify-source") <
      secretScanJob.indexOf("gitleaks-artifact.mjs prepare"),
    "the checkout identity must be verified before Gitleaks artifact preparation",
  );
  assert.match(
    secretScanJob,
    /GITLEAKS_SOURCE_COMMIT_SHA:\s*\$\{\{ steps\.verify-source\.outputs\.tested_source_sha \}\}/,
  );
  assert.match(secretScanJob, /GITLEAKS_WORKFLOW_CONTEXT_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(secretScanJob, /node scripts\/gitleaks-artifact\.mjs prepare/);
  assert.match(secretScanJob, /path:\s*\.local\/gitleaks-upload\//);
  assert.match(secretScanJob, /retention-days:\s*90/);
}

{
  const context = makeRepository();
  const advisoryGate = context.manifest.gates.find((gate) => gate.id === "advisory.fixture");
  advisoryGate.ci.workflow = ".github/workflows/full-advisory-e2e.yml";
  write(
    context.root,
    "scripts/required-test-manifest.json",
    `${JSON.stringify(context.manifest, null, 2)}\n`,
  );
  write(
    context.root,
    ".github/workflows/full-advisory-e2e.yml",
    `jobs:
  e2e-full:
    steps:
      - name: Advisory
        run: npm run test:advisory
`,
  );
  assert.deepEqual(
    validateRequiredTestRepository({ repositoryRoot: context.root }).issues,
    [],
    "an advisory gate may have a separate explicit workflow owner",
  );
  rmSync(path.join(context.root, ".github/workflows/full-advisory-e2e.yml"));
  expectIssue(
    validateRequiredTestRepository({ repositoryRoot: context.root }),
    "CI workflow .github/workflows/full-advisory-e2e.yml for gate advisory.fixture is missing",
  );
}

// Installed-Playwright runner/output contracts only: no browser, app, DB or HTTPS.
function waitForOutputBarrier(file) {
  return new Promise((resolve, reject) => {
    const watcher = watch(path.dirname(file), check);
    const deadline = setTimeout(() => finish(new Error(`Output barrier missing: ${file}`)), 30_000);
    function finish(error) { clearTimeout(deadline); watcher.close(); if (error) reject(error); else resolve(); }
    function check() { if (existsSync(file)) finish(); }
    watcher.on("error", finish);
    check();
  });
}

function outputTree(root) {
  if (!existsSync(root)) return {};
  const files = {};
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files[path.relative(root, file)] = sha256(readFileSync(file));
    }
  };
  visit(root);
  return files;
}

function writeOutputProbeFixture(root) {
  symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
  const helper = new URL("./window-opening-browser-context.mjs", import.meta.url).href;
  write(root, "playwright.config.mjs", `
import { appendFileSync } from 'node:fs';
import { canonicalWindowOpeningContext, assertCanonicalWindowOpeningConfiguration } from ${JSON.stringify(helper)};
const context = canonicalWindowOpeningContext(process.env, 'http://127.0.0.1:3000', process.env.REQUIRED_TEST_REPORT_PATH);
const config = { testDir: './probe', workers: 1, retries: 0, timeout: 30000,
  outputDir: context.outputPath, use: { trace: 'on' }, projects: [{ name: 'chromium' }],
  reporter: [['list'], ['json', { outputFile: context.reportPath }]],
  metadata: { windowOpeningExecution: context, windowOpeningTargetBaseURL: context.baseURL,
    requiredTestEvidence: { gateId: context.owner, sourceCommitSha: context.sourceCommitSha, artifactSha256: null } } };
if (process.env.OUTPUT_PROBE_OVERRIDE) config.outputDir = process.env.OUTPUT_PROBE_OVERRIDE;
if (process.env.OUTPUT_PROBE_PROJECT) config.projects[0].outputDir = process.env.OUTPUT_PROBE_PROJECT;
assertCanonicalWindowOpeningConfiguration(context, config);
appendFileSync(context.runRoot + '-config-loads.jsonl', JSON.stringify(context) + '\\n');
// Disposable negative control reproduces only the previous shared-output setting.
// The normal probe always runs the production allocation and config guard.
if (process.env.OUTPUT_PROBE_LEGACY) config.outputDir = process.cwd() + '/legacy-shared-output';
export default config;
`);
  write(root, "probe/identical.spec.ts", `
import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync, watch } from 'node:fs';
import path from 'node:path';
test('identical synthetic output', async ({}, info) => {
  const context = info.config.metadata.windowOpeningExecution;
  mkdirSync(info.outputDir, { recursive: true });
  const sentinel = info.outputPath('sentinel.txt');
  writeFileSync(sentinel, context.runId);
  await info.attach('identifiable-output', { path: sentinel, contentType: 'text/plain' });
  if (process.env.OUTPUT_PROBE_BARRIER) {
    const ready = context.runRoot + '.ready';
    const release = context.runRoot + '.release';
    await new Promise<void>((resolve, reject) => {
      const watcher = watch(path.dirname(release), check);
      const deadline = setTimeout(() => finish(new Error('controller did not release barrier')), 25000);
      function finish(error?: Error) { clearTimeout(deadline); watcher.close(); error ? reject(error) : resolve(); }
      function check() { if (existsSync(release)) finish(); }
      watcher.on('error', finish);
      writeFileSync(ready, context.runId);
      check();
    });
  }
  expect(process.env.OUTPUT_PROBE_FAIL ?? '0').toBe('0');
});
`);
}

function advisoryInvocationFixture() {
  const fixture = makeRepository();
  const root = realpathSync(fixture.root);
  const gate = fixture.manifest.gates.find((entry) => entry.id === "advisory.fixture");
  gate.id = "advisory.full-e2e";
  gate.reportPath = `.local/required-test-evidence/${gate.id}/evidence.json`;
  write(root, "scripts/required-test-manifest.json", JSON.stringify(fixture.manifest));
  const allocate = (options = {}) => prepareCanonicalWindowOpeningContext({ repositoryRoot: root,
    gateId: gate.id, environment: {}, sourceCommitSha: SOURCE_SHA,
    sourceTreeSha: "3".repeat(40), ...options });
  const complete = (run, { status = "passed", missingCoverage = false } = {}) => {
    const report = makeReport({ artifactSha: null, sourceSha: run.sourceCommitSha, status,
      declaredStatus: status === "passed" ? "expected" : "unexpected" });
    report.config.projects[0].outputDir = run.outputPath;
    report.config.metadata = { gateA3ReleaseBaseURL: null, productionArtifactEvidence: null,
      windowOpeningExecution: run, windowOpeningTargetBaseURL: run.baseURL,
      requiredTestEvidence: { schema: REQUIRED_TEST_EVIDENCE_SCHEMA, gateId: gate.id,
        sourceCommitSha: run.sourceCommitSha, artifactSha256: null, releaseCandidateId: null, releaseEnvironment: null } };
    if (missingCoverage) { report.suites = []; report.stats.expected = 0; }
    write(root, run.reportPath, JSON.stringify(report));
    const canonical = canonicalizeRequiredTestReport(root, run.reportPath);
    const processExitCode = status === "passed" && !missingCoverage ? 0 : 1;
    const result = validateRequiredTestReport({ repositoryRoot: root, gateId: gate.id, report: canonical,
      processExitCode, expectedSourceCommitSha: run.sourceCommitSha,
      expectedWindowOpeningRunId: run.runId, environment: {} });
    if (processExitCode === 0) assert.deepEqual(result.issues, []);
    write(root, run.evidencePath, JSON.stringify({ schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
      gateId: gate.id, runId: run.runId, command: gate.command, sourceCommitSha: run.sourceCommitSha,
      sourceTreeSha: run.sourceTreeSha, artifactSha256: null, processExitCode,
      startedAt: new Date(Date.parse(report.stats.startTime) - 100).toISOString(),
      completedAt: new Date(Date.parse(report.stats.startTime) + 200).toISOString(),
      report: { path: run.reportPath, sha256: sha256(readFileSync(path.join(root, run.reportPath))) },
      complete: result.valid, result: result.valid ? "passed" : "failed", diagnostics: result.issues }));
    const before = outputTree(run.runRoot);
    const verified = validateRequiredTestEvidence({ repositoryRoot: root, gateId: gate.id,
      evidencePath: run.evidencePath, expectedSourceCommitSha: run.sourceCommitSha });
    if (result.valid) assert.deepEqual(verified.issues, []);
    else assert.equal(verified.valid, false);
    assert.deepEqual(outputTree(run.runRoot), before, "verification must not change the recorded run");
    return run;
  };
  const prepare = (run, options = {}) => prepareRequiredTestEvidenceUpload({ repositoryRoot: root,
    evidencePath: run?.evidencePath, expectedSourceCommitSha: SOURCE_SHA, environment: {}, ...options });
  const verify = (prepared) => verifyRequiredTestEvidenceArchive({ repositoryRoot: root,
    archiveRoot: prepared.archiveRoot, environment: {} });
  return { root, gate, allocate, complete, prepare, verify };
}

function assertSelectedAdvisoryBundle(fixture, selected, excluded = []) {
  const rawBefore = outputTree(path.join(fixture.root, ".local/required-test-evidence"));
  const prepared = fixture.prepare(selected);
  const { inventory } = fixture.verify(prepared);
  assert.equal(inventory.selectedInvocation.runId, selected.runId);
  assert.equal(inventory.selectedInvocation.sourceCommitSha, SOURCE_SHA);
  assert.equal(inventory.advisorySummaries.length, 1);
  for (const name of ["evidence.json", "playwright.json"]) {
    assert.ok(prepared.included.some((file) => file.includes(selected.runId) && file.endsWith(`/${name}`)));
  }
  for (const run of excluded) assert.equal(JSON.stringify(inventory).includes(run.runId), false);
  assert.deepEqual(outputTree(path.join(fixture.root, ".local/required-test-evidence")), rawBefore);
  return prepared;
}

function withAdvisoryAssemblyWrite(intercept, callback) {
  const original = fs.writeFileSync;
  fs.writeFileSync = (file, ...args) => {
    if (String(file).includes("/.local/required-test-upload/attempt-")) intercept(file, original);
    return original(file, ...args);
  };
  syncBuiltinESMExports();
  try { callback(); }
  finally { fs.writeFileSync = original; syncBuiltinESMExports(); }
}

function verifyAdvisorySiblingSelection(kind) {
  const fixture = advisoryInvocationFixture();
  const { root, allocate, complete } = fixture;
  try {
    const a = complete(allocate({ runId: "77777777-7777-4777-8777-777777777777" }));
    assertSelectedAdvisoryBundle(fixture, a); // A: completed A alone.
    const siblings = [];
    if (kind !== "historical") siblings.push(allocate({ runId: "11111111-1111-4111-8111-111111111111" }));
    if (kind !== "active") siblings.push(complete(allocate({
      sourceCommitSha: "4".repeat(40), runId: "ffffffff-ffff-4fff-8fff-ffffffffffff" })));
    const prepared = assertSelectedAdvisoryBundle(fixture, a, siblings);
    if (kind === "both") {
      // Reinsert siblings in reverse physical creation order; selection is still A.
      for (const run of [...siblings].reverse()) {
        renameSync(run.runRoot, `${run.runRoot}.order`);
        renameSync(`${run.runRoot}.order`, run.runRoot);
      }
      const reordered = assertSelectedAdvisoryBundle(fixture, a, siblings);
      assert.notEqual(reordered.archiveRoot, prepared.archiveRoot);
      fixture.verify(prepared);
      // Unrelated malformed reports and symlinks are never read by selection.
      write(root, `${siblings[0].reportPath}`, "malformed sibling report");
      symlinkSync(root, path.join(siblings[0].runRoot, "unrelated-link"), "dir");
      const siblingBytes = readFileSync(path.join(root, siblings[0].reportPath));
      fixture.verify(fixture.prepare(a));
      assert.deepEqual(readFileSync(path.join(root, siblings[0].reportPath)), siblingBytes);
      unlinkSync(path.join(siblings[0].runRoot, "unrelated-link"));
    }
    console.log(`Advisory selection ${kind}: selected A verified; raw runs unchanged; siblings excluded.`);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function verifyAdvisoryRejectedSelection() {
  const fixture = advisoryInvocationFixture();
  const { root, allocate, complete, prepare, verify } = fixture;
  try {
    const a = complete(allocate());
    const previous = prepare(a);
    const previousBytes = outputTree(path.join(root, previous.archiveRoot));
    const unfinished = allocate();
    const historical = complete(allocate({ sourceCommitSha: "4".repeat(40) }));
    const b = complete(allocate());
    const rawBefore = outputTree(path.join(root, ".local/required-test-evidence"));
    assert.throws(() => prepare(unfinished), /missing/);
    assert.throws(() => prepare(historical), /another source commit/);
    assert.throws(() => prepare(), /Select one completed invocation/);
    assert.throws(() => prepare({ evidencePath: [a.evidencePath, b.evidencePath] }), /Select one/);
    assert.deepEqual(outputTree(path.join(root, previous.archiveRoot)), previousBytes);
    assert.deepEqual(outputTree(path.join(root, ".local/required-test-evidence")), rawBefore);
    const envelope = readFileSync(path.join(root, b.evidencePath));
    const report = readFileSync(path.join(root, b.reportPath));
    for (const corruption of ["report-path", "report-run", "envelope-run", "malformed", "missing-report", "context"]) {
      const changed = JSON.parse(envelope);
      if (corruption === "report-path") changed.report = JSON.parse(readFileSync(path.join(root, a.evidencePath))).report;
      if (corruption === "envelope-run") changed.runId = a.runId;
      if (corruption === "report-run") {
        write(root, b.reportPath, readFileSync(path.join(root, a.reportPath)));
        changed.report.sha256 = sha256(readFileSync(path.join(root, b.reportPath)));
      }
      write(root, b.evidencePath, corruption === "malformed" ? "{ truncated" : JSON.stringify(changed));
      if (corruption === "missing-report") rmSync(path.join(root, b.reportPath));
      const contextBytes = readFileSync(path.join(root, b.contextPath));
      if (corruption === "context") write(root, b.contextPath, "{}");
      assert.throws(() => prepare(b), /does not bind|another run|malformed JSON|missing|allocated context/);
      assert.deepEqual(outputTree(path.join(root, previous.archiveRoot)), previousBytes);
      write(root, b.reportPath, report); write(root, b.evidencePath, envelope); write(root, b.contextPath, contextBytes);
    }
    // Leaf and parent symlink escapes both fail before copying.
    for (const file of [b.reportPath, b.evidencePath, b.contextPath]) {
      const original = readFileSync(path.join(root, file));
      rmSync(path.join(root, file)); symlinkSync(path.join(root, a.reportPath), path.join(root, file));
      assert.throws(() => prepare(b), /symbolic link/);
      unlinkSync(path.join(root, file)); write(root, file, original);
    }
    renameSync(b.runRoot, `${b.runRoot}.held`); symlinkSync(a.runRoot, b.runRoot, "dir");
    assert.throws(() => prepare(b), /symbolic link/);
    unlinkSync(b.runRoot); renameSync(`${b.runRoot}.held`, b.runRoot);
    assert.deepEqual(outputTree(path.join(root, ".local/required-test-evidence")), rawBefore);
    verify(previous);
    console.log("Advisory invalid selection: incomplete, historical, absent, ambiguous, corrupted, substituted and symlinked inputs rejected; previous bundle unchanged.");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function verifyAdvisoryPreparationPreservation() {
  const fixture = advisoryInvocationFixture();
  const { root, allocate, complete, prepare, verify } = fixture;
  try {
    const a = complete(allocate());
    const previous = prepare(a);
    const b = complete(allocate());
    allocate(); complete(allocate({ sourceCommitSha: "4".repeat(40) }));
    const before = outputTree(path.join(root, ".local"));
    let writes = 0;
    withAdvisoryAssemblyWrite(() => {
      if (++writes === 2) throw new Error("controlled assembly write failure");
    }, () => assert.throws(() => prepare(b), /controlled assembly write failure/));
    assert.equal(writes, 2);
    assert.deepEqual(outputTree(path.join(root, ".local")), before);
    assert.deepEqual(readdirSync(path.join(root, ".local/required-test-upload")), [path.basename(previous.archiveRoot)]);
    const uploadParent = path.join(root, ".local/required-test-upload");
    renameSync(uploadParent, `${uploadParent}.held`);
    write(root, ".local/outside-upload/sentinel.txt", "preserved");
    symlinkSync(path.join(root, ".local/outside-upload"), uploadParent, "dir");
    assert.throws(() => prepare(b), /symbolic link/);
    assert.deepEqual(readdirSync(path.join(root, ".local/outside-upload")), ["sentinel.txt"]);
    unlinkSync(uploadParent); renameSync(`${uploadParent}.held`, uploadParent);
    const preparedB = assertSelectedAdvisoryBundle(fixture, b, [a]);
    assert.notEqual(previous.archiveRoot, preparedB.archiveRoot);
    verify(previous); verify(preparedB);
    const preparedAgain = prepare(a);
    assert.notEqual(previous.archiveRoot, preparedAgain.archiveRoot);
    verify(previous); verify(preparedB); verify(preparedAgain);
    const rawReport = readFileSync(path.join(root, b.reportPath));
    let mutated = false;
    withAdvisoryAssemblyWrite((_file, original) => {
      if (!mutated) { mutated = true; original(path.join(root, b.reportPath), "{}\n"); }
    }, () => assert.throws(() => prepare(b), /changed during upload preparation/));
    write(root, b.reportPath, rawReport);
    verify(previous); verify(preparedB);
    assert.equal(readdirSync(path.join(root, ".local/required-test-upload")).length, 3);
    // Mutations to the assembled copy fail the actual archive verifier.
    write(root, `${preparedB.archiveRoot}/required-test-evidence/${path.relative(".local/required-test-evidence", b.reportPath)}`, "{}\n");
    assert.throws(() => verify(preparedB), /content hashes/);
    verify(previous);
    console.log(`Advisory preservation: rejected/write-failed attempts preserve raw runs and previous bundles; separate destinations ${previous.archiveRoot} and ${preparedB.archiveRoot}; source/copy mutation rejected.`);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function verifyAdvisoryFailedOutcomes() {
  const fixture = advisoryInvocationFixture();
  const { root, allocate, complete, prepare, verify } = fixture;
  try {
    complete(allocate());
    for (const options of [{ status: "failed" }, { missingCoverage: true }]) {
      const failed = complete(allocate(), options);
      const { inventory } = verify(prepare(failed));
      assert.equal(inventory.advisorySummaries[0].conclusion, "failed");
      assert.equal(inventory.advisorySummaries[0].processExitCode, 1);
      if (options.status) assert.equal(inventory.advisorySummaries[0].failed, 1);
      const envelope = JSON.parse(readFileSync(path.join(root, failed.evidencePath)));
      assert.ok(envelope.diagnostics.length > 0);
      envelope.result = "passed"; envelope.diagnostics = [];
      write(root, failed.evidencePath, JSON.stringify(envelope));
      assert.throws(() => prepare(failed), /contradictory/);
      rmSync(path.join(root, failed.reportPath));
      assert.throws(() => prepare(failed), /missing evidence.json or playwright.json/);
    }
    console.log("Advisory outcomes: completed failures and missing coverage remain failed; forged passing conclusions and missing mandatory reports rejected.");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function verifyAdvisoryUploadCli() {
  const fixture = advisoryInvocationFixture();
  const { root, allocate, complete, verify } = fixture;
  try {
    const a = complete(allocate());
    const b = allocate();
    const script = path.resolve("scripts/required-test-truthfulness.mjs");
    // Only Git identity is synthetic; the real CLI/parser/preparer/verifier execute.
    const bootstrap = `import child from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      child.spawnSync = (command, args) => {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") return { status: 0, stdout: "${SOURCE_SHA}" };
        throw new Error("Unexpected child process in report-consumer fixture");
      };
      syncBuiltinESMExports();
      process.argv = [process.execPath, ${JSON.stringify(script)}, ...process.argv.slice(1)];
      await import(${JSON.stringify(script)});`;
    const output = path.join(root, "github-output.txt");
    const cli = (...args) => spawnSync(process.execPath, ["--input-type=module", "-e", bootstrap, "--", ...args], {
      cwd: root, env: { PATH: process.env.PATH, GITHUB_OUTPUT: output }, encoding: "utf8",
    });
    for (const args of [["prepare-upload"], ["prepare-upload", a.evidencePath, b.evidencePath],
      ["prepare-upload", b.evidencePath]]) {
      const result = cli(...args);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(output), false, "a rejected invocation cannot emit a ready path");
    }
    const prepared = cli("prepare-upload", a.evidencePath);
    assert.equal(prepared.status, 0, prepared.stderr);
    const archiveRoot = prepared.stdout.trim();
    assert.match(archiveRoot, /^\.local\/required-test-upload\/attempt-[^/]+$/);
    assert.equal(readFileSync(output, "utf8"), `archive_root=${archiveRoot}\n`);
    verify({ archiveRoot });
    const checked = cli("verify-upload", archiveRoot);
    assert.equal(checked.status, 0, checked.stderr);
    assert.notEqual(cli("verify-upload").status, 0);
    console.log("Advisory CLI: explicit envelope -> verified bundle path -> verify-upload; absent/ambiguous/incomplete selections emit no ready path.");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function verifyAdvisoryWorkflowContract(workflow) {
  assert.deepEqual(validateAdvisoryWorkflowHandoff(workflow), []);
  const mutations = [
    ["duplicate producer ID", (steps) => { steps[0].id = "advisory-run"; }],
    ["duplicate preparation ID", (steps) => { steps[0].id = "advisory-evidence"; }],
    ["missing producer ID", (_s, producer) => { delete producer.id; }],
    ["missing preparation ID", (_s, _p, preparation) => { delete preparation.id; }],
    ["wrong producer", (_s, _p, preparation) => { preparation.env.EVIDENCE_PATH = "${{ steps.verify-source.outputs.evidence_path }}"; }],
    ["wrong producer output", (_s, _p, preparation) => { preparation.env.EVIDENCE_PATH = "${{ steps.advisory-run.outputs.report_path }}"; }],
    ["selection fallback", (_s, _p, preparation) => { preparation.env.EVIDENCE_PATH = "${{ steps.advisory-run.outputs.evidence_path || '.local/required-test-evidence' }}"; }],
    ["unquoted selection", (_s, _p, preparation) => { preparation.run = preparation.run.replace('"$EVIDENCE_PATH"', "$EVIDENCE_PATH"); }],
    ["success-only preparation", (_s, _p, preparation) => { preparation.if = "success()"; }],
    ["skipped producer preparation", (_s, _p, preparation) => { preparation.if = "always() && !cancelled()"; }],
    ["implicit upload success", (_s, _p, _e, upload) => { upload.if = upload.if.replace("always() && !cancelled() && ", ""); }],
    ["cancelled upload", (_s, _p, _e, upload) => { upload.if = upload.if.replace("!cancelled() && ", ""); }],
    ["conclusion instead of outcome", (_s, _p, _e, upload) => { upload.if = upload.if.replace(".outcome", ".conclusion"); }],
    ["empty upload output", (_s, _p, _e, upload) => { upload.if = upload.if.replace(" && steps.advisory-evidence.outputs.archive_root != ''", ""); }],
    ["wrong preparation", (_s, _p, _e, upload) => { upload.with.path = "${{ steps.advisory-run.outputs.archive_root }}"; }],
    ["wrong preparation output", (_s, _p, _e, upload) => { upload.with.path = "${{ steps.advisory-evidence.outputs.evidence_path }}"; }],
    ...[".local/required-test-upload/", ".local/required-test-upload/attempt-old", ".local/required-test-upload/attempt-*",
      "${{ steps.advisory-evidence.outputs.archive_root || '.local/required-test-upload/' }}"].map((value) =>
      [`unsafe upload ${value}`, (_s, _p, _e, upload) => { upload.with.path = value; }]),
    ["ignored missing bundle", (_s, _p, _e, upload) => { upload.with["if-no-files-found"] = "ignore"; }],
    ["producer failure suppression", (_s, producer) => { producer.run += " || true"; }],
    ["preparation failure suppression", (_s, _p, preparation) => { preparation["continue-on-error"] = true; }],
    ["reordered handoff", (steps) => { steps.reverse(); }],
  ];
  for (const [label, mutate] of mutations) {
    const changed = parseYaml(workflow);
    const steps = changed.jobs["e2e-full"].steps;
    mutate(steps, steps.find((s) => s.id === "advisory-run"), steps.find((s) => s.id === "advisory-evidence"),
      steps.find((s) => s.name === "Upload test results"));
    assert.ok(validateAdvisoryWorkflowHandoff(JSON.stringify(changed)).length > 0, label);
  }
  console.log(`Advisory workflow contract: actual YAML accepted; ${mutations.length} broken handoffs rejected, including skipped/cancelled gates and unsafe upload selections.`);
}

function installAdvisoryWorkflowCliFixture(fixture, workflow) {
  const { root, gate } = fixture;
  const scripts = JSON.parse(readFileSync(path.resolve("package.json"))).scripts;
  const fixturePackage = JSON.parse(readFileSync(path.join(root, "package.json")));
  for (const name of ["test:e2e:advisory", "evidence:required-tests:prepare-upload"]) fixturePackage.scripts[name] = scripts[name];
  write(root, "package.json", JSON.stringify(fixturePackage));
  gate.packageScript = "test:e2e:advisory"; gate.command = "npm run test:e2e:advisory";
  gate.packageClosure = packageClosure(fixturePackage.scripts, [gate.packageScript]);
  gate.ci = { workflow: ".github/workflows/full-advisory-e2e.yml", job: "e2e-full", step: "Run advisory full E2E inventory" };
  const manifest = JSON.parse(readFileSync(path.join(root, "scripts/required-test-manifest.json")));
  manifest.gates = manifest.gates.map((entry) => entry.id === gate.id ? gate : entry);
  write(root, "scripts/required-test-manifest.json", JSON.stringify(manifest));
  write(root, gate.ci.workflow, workflow);
  const script = path.resolve("scripts/required-test-truthfulness.mjs");
  // Only Git identity and the Playwright child are synthetic. The actual runner,
  // GITHUB_OUTPUT emission, shell command, npm scripts and preparation CLI execute.
  write(root, "scripts/required-test-truthfulness.mjs", `
import child from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const originalWrite = fs.writeFileSync;
fs.writeFileSync = (file, ...args) => {
  if (process.env.FIXTURE_ASSEMBLY_FAILURE && String(file).includes("/.local/required-test-upload/attempt-")) throw new Error("controlled CLI assembly failure");
  return originalWrite(file, ...args);
};
child.spawnSync = (command, args, options) => {
  if (command === "git" && args.join(" ") === "rev-parse HEAD") return { status: 0, stdout: "${SOURCE_SHA}" };
  if (command === "git" && args.join(" ") === "rev-parse HEAD^{tree}") return { status: 0, stdout: "${"3".repeat(40)}" };
  if (command !== "npx") throw new Error("Unexpected fixture child process");
  const context = JSON.parse(options.env.WINDOW_OPENING_CANONICAL_CONTEXT);
  if (fs.readFileSync(process.env.GITHUB_OUTPUT, "utf8") !== "evidence_path=" + context.evidencePath + "\\n") throw new Error("Producer output was not recorded before execution");
  if (process.env.FIXTURE_MISSING_REPORT) return { status: 1 };
  const report = JSON.parse(fs.readFileSync(process.env.FIXTURE_REPORT, "utf8"));
  report.config.metadata.windowOpeningExecution = context;
  report.config.projects[0].outputDir = context.outputPath;
  report.stats.startTime = new Date().toISOString(); report.stats.duration = 0;
  fs.writeFileSync(path.resolve(context.reportPath), JSON.stringify(report));
  return { status: report.stats.unexpected ? 1 : 0 };
};
syncBuiltinESMExports();
process.argv = [process.execPath, ${JSON.stringify(script)}, ...process.argv.slice(2)];
await import(${JSON.stringify(script)});
`);
  assert.deepEqual(validateRequiredTestRepository({ repositoryRoot: root }).issues, []);
}

function verifyAdvisoryWorkflowShell() {
  const fixture = advisoryInvocationFixture();
  const { root, allocate, complete, prepare, verify } = fixture;
  const workflow = readFileSync(path.resolve(".github/workflows/full-advisory-e2e.yml"), "utf8");
  const steps = parseYaml(workflow).jobs["e2e-full"].steps;
  const producer = steps.find((step) => step.id === "advisory-run");
  const preparation = steps.find((step) => step.id === "advisory-evidence");
  const shell = (step, output, environment = {}) => spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run], {
    cwd: root, env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, ...environment }, encoding: "utf8",
  });
  let attempt = 0;
  const prepareSelected = (evidencePath, environment = {}) => {
    const output = path.join(root, `preparation-${attempt++}.output`);
    const result = shell(preparation, output, { EVIDENCE_PATH: evidencePath, ...environment });
    const values = existsSync(output) ? readFileSync(output, "utf8") : "";
    if (result.status !== 0) { assert.equal(values, ""); return { result, archiveRoot: null }; }
    const archiveRoot = result.stdout.trim();
    assert.match(archiveRoot, /^\.local\/required-test-upload\/attempt-[^/]+$/);
    assert.equal(values, `archive_root=${archiveRoot}\n`);
    return { result, archiveRoot };
  };
  try {
    installAdvisoryWorkflowCliFixture(fixture, workflow);
    const prior = prepare(complete(allocate()));
    const active = allocate(); const historical = complete(allocate({ sourceCommitSha: "4".repeat(40) }));
    for (const status of ["passed", "failed", "missing"]) {
      const template = complete(allocate(), { status: status === "failed" ? "failed" : "passed" });
      const output = path.join(root, `producer-${status}.output`);
      const result = shell(producer, output, { FIXTURE_REPORT: path.join(root, template.reportPath),
        ...(status === "missing" ? { FIXTURE_MISSING_REPORT: "1" } : {}) });
      assert.equal(result.status, status === "passed" ? 0 : 1, result.stderr);
      const recorded = readFileSync(output, "utf8");
      assert.match(recorded, /^evidence_path=\.local\/required-test-evidence\/advisory.full-e2e\/playwright-output\/[^/]+\/evidence.json\n$/);
      const evidencePath = recorded.slice("evidence_path=".length).trim();
      const before = outputTree(path.join(root, ".local"));
      const prepared = prepareSelected(evidencePath);
      if (status === "missing") {
        assert.notEqual(prepared.result.status, 0); assert.equal(prepared.archiveRoot, null);
        assert.deepEqual(outputTree(path.join(root, ".local")), before); continue;
      }
      assert.equal(prepared.result.status, 0, prepared.result.stderr);
      const { inventory } = verify(prepared);
      assert.equal(inventory.advisorySummaries[0].conclusion, status);
      assert.equal(inventory.advisorySummaries[0].processExitCode, status === "passed" ? 0 : 1);
      assert.equal(inventory.selectedInvocation.runId, path.basename(path.dirname(evidencePath)));
      for (const sibling of [template, active, historical]) assert.equal(JSON.stringify(inventory).includes(sibling.runId), false);
      const preserved = outputTree(path.join(root, ".local"));
      const rejected = prepareSelected(evidencePath, { FIXTURE_ASSEMBLY_FAILURE: "1" });
      assert.notEqual(rejected.result.status, 0); assert.equal(rejected.archiveRoot, null);
      assert.match(rejected.result.stderr, /controlled CLI assembly failure/);
      assert.deepEqual(outputTree(path.join(root, ".local")), preserved); verify(prior); verify(prepared);
    }
    for (const selection of ["", active.evidencePath, "missing envelope with spaces.json", `${active.evidencePath} ${historical.evidencePath}`]) {
      const before = outputTree(path.join(root, ".local"));
      const rejected = prepareSelected(selection);
      assert.notEqual(rejected.result.status, 0); assert.equal(rejected.archiveRoot, null);
      assert.doesNotMatch(rejected.result.stderr, /Select exactly one invocation/, "the shell must pass even empty/space-containing paths as one argument");
      assert.deepEqual(outputTree(path.join(root, ".local")), before);
    }
    write(root, fixture.gate.ci.workflow, workflow.replace("steps.advisory-evidence.outputs.archive_root }}", "steps.advisory-run.outputs.archive_root }}"));
    expectIssue(validateRequiredTestRepository({ repositoryRoot: root }), "upload path must be only the actual preparation archive_root");
    console.log("Advisory workflow shell/CLI: real producer outputs precede synthetic execution; passing/failed diagnostic bundles selected; missing/incomplete inputs and injected preparation failures emit no archive_root and preserve old bundles/raw siblings. No upload action executed.");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function verifyCanonicalReportHandoff() {
  for (const kind of ["active", "historical", "both"]) verifyAdvisorySiblingSelection(kind);
  verifyAdvisoryRejectedSelection();
  verifyAdvisoryPreparationPreservation();
  verifyAdvisoryFailedOutcomes();
  verifyAdvisoryUploadCli();
  verifyAdvisoryWorkflowShell();
}

async function verifyCanonicalOutputIsolation() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "canonical-output-contract-")));
  const processes = [];
  const allocate = (runId) => prepareCanonicalWindowOpeningContext({ repositoryRoot: root,
    gateId: "advisory.full-e2e", environment: {}, sourceCommitSha: "a".repeat(40), sourceTreeSha: "b".repeat(40), runId });
  const start = (context, extra = {}, args = []) => {
    const child = spawn(process.execPath, [path.resolve("node_modules/playwright/cli.js"), "test", ...args], {
      cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        REQUIRED_TEST_GATE_ID: context.owner, REQUIRED_TEST_REPORT_PATH: context.reportPath,
        REQUIRED_TEST_SOURCE_COMMIT_SHA: context.sourceCommitSha, REQUIRED_TEST_SOURCE_TREE_SHA: context.sourceTreeSha,
        WINDOW_OPENING_CANONICAL_CONTEXT: JSON.stringify(context), ...extra }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const deadline = setTimeout(() => child.kill("SIGTERM"), 40_000);
    const done = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => { clearTimeout(deadline); resolve({ code, output }); });
    });
    processes.push({ child, done });
    return done;
  };
  const success = async (done) => { const result = await done; assert.equal(result.code, 0, result.output); };
  const report = (run) => JSON.parse(readFileSync(path.join(root, run.reportPath), "utf8"));
  const describe = (run) => {
    const configLoads = readFileSync(run.runRoot + "-config-loads.jsonl", "utf8").trim().split("\n").map(JSON.parse);
    for (const loaded of configLoads) assert.deepEqual(loaded, run, "every process/worker config load consumes the original allocation");
    const traces = Object.keys(outputTree(run.outputPath)).filter((file) => file.endsWith("trace.zip"));
    assert.equal(traces.length, 1, "installed Playwright must produce its actual trace");
    assertWindowOpeningReportContext(report(run).config.metadata, run.owner,
      { repositoryRoot: root, config: report(run).config, expectedRunId: run.runId });
    return { runId: run.runId, output: run.outputPath, report: path.join(root, run.reportPath),
      trace: path.join(run.outputPath, traces[0]), stableConfigLoads: configLoads.length, sha256ByFile: outputTree(run.runRoot) };
  };
  try {
    writeOutputProbeFixture(root);
    const a = allocate();
    const b = allocate();
    assert.notEqual(a.runId, b.runId);
    assert.notEqual(a.outputPath, b.outputPath);
    assert.notEqual(a.reportPath, b.reportPath);
    const beforeLoad = outputTree(a.runRoot);
    await success(start(a, {}, ["--list"]));
    await success(start(a, {}, ["--list"]));
    const loads = readFileSync(a.runRoot + "-config-loads.jsonl", "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(loads.length, 2);
    assert.deepEqual(loads, [a, a], "config reads the same allocation, without replacing it");
    assert.equal(outputTree(a.runRoot)[path.basename(a.contextPath)], beforeLoad[path.basename(a.contextPath)]);
    await success(start(a));
    const completeA = outputTree(a.runRoot);
    await success(start(b));
    assert.deepEqual(outputTree(a.runRoot), completeA, "sequential startup/completion preserves run A");
    const sequential = [describe(a), describe(b)];
    assert.notEqual(sequential[0].trace, sequential[1].trace);
    assert.throws(() => allocate(a.runId), /EEXIST/);
    assert.throws(() => allocate("../another-run"), /owner and run ID/);
    assert.deepEqual(outputTree(a.runRoot), completeA, "collision never reuses or deletes output");
    assert.throws(() => assertWindowOpeningReportContext(report(a).config.metadata, a.owner,
      { repositoryRoot: root, config: report(a).config, expectedRunId: b.runId }), /another run/);
    const immutable = path.join(root, ".vercel/output");
    write(root, ".vercel/output/sentinel.txt", "immutable synthetic artifact");
    const artifactBefore = outputTree(immutable);
    for (const output of [path.dirname(a.runRoot), b.outputPath, immutable, path.join(a.outputPath, "../escape")]) {
      const result = await start(a, { OUTPUT_PROBE_OVERRIDE: output });
      assert.notEqual(result.code, 0);
      assert.match(result.output, /must use the allocated run/);
    }
    for (const extra of [{ OUTPUT_PROBE_PROJECT: b.outputPath },
      { PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(root, b.reportPath) },
      { PW_TEST_REPORTER: "html" },
      { WINDOW_OPENING_CANONICAL_CONTEXT: JSON.stringify({ ...a, runId: b.runId }) },
      { WINDOW_OPENING_CANONICAL_CONTEXT: JSON.stringify({ ...a, owner: "release.gate-a3" }) }]) {
      assert.notEqual((await start(a, extra)).code, 0);
    }
    assert.notEqual((await start(a, {}, ["--output", path.dirname(a.runRoot)])).code, 0);
    assert.notEqual((await start(a, {}, ["--reporter=json"])).code, 0);
    assert.deepEqual(outputTree(a.runRoot), completeA, "wrong ownership is refused before startup cleanup");
    assert.deepEqual(outputTree(immutable), artifactBefore);
    const symlinkRun = allocate();
    symlinkSync(b.outputPath, symlinkRun.outputPath, "dir");
    assert.notEqual((await start(symlinkRun)).code, 0);
    assert.throws(() => removeUnsafeRequiredTestArtifacts({ repositoryRoot: root, gateId: a.owner,
      runId: symlinkRun.runId, reportPath: symlinkRun.reportPath }), /symlink/);
    unlinkSync(symlinkRun.outputPath);
    const c = allocate();
    const d = allocate();
    const runningC = start(c, { OUTPUT_PROBE_BARRIER: "1" });
    await waitForOutputBarrier(c.runRoot + ".ready");
    const activeOutput = (run) => Object.fromEntries(Object.entries(outputTree(run.outputPath)).filter(([file]) => /sentinel\.txt$|attachments\//.test(file)));
    const activeC = activeOutput(c);
    assert.ok(Object.keys(activeC).length > 0);
    const runningD = start(d, { OUTPUT_PROBE_BARRIER: "1" });
    await waitForOutputBarrier(d.runRoot + ".ready");
    assert.deepEqual(activeOutput(c), activeC, "overlapping startup preserves active output");
    const activeD = activeOutput(d);
    writeFileSync(c.runRoot + ".release", "release");
    await success(runningC);
    assert.deepEqual(activeOutput(d), activeD, "first completion preserves active sibling");
    const completeC = outputTree(c.runRoot);
    writeFileSync(d.runRoot + ".release", "release");
    await success(runningD);
    assert.deepEqual(outputTree(c.runRoot), completeC, "second completion preserves completed sibling");
    const overlapping = [describe(c), describe(d)];
    const preserved = outputTree(a.runRoot);
    const failed = allocate();
    assert.equal((await start(failed, { OUTPUT_PROBE_FAIL: "1" })).code, 1);
    assert.equal(report(failed).stats.unexpected, 1, "failed test retains its authoritative report");
    describe(failed);
    assert.throws(() => removeUnsafeRequiredTestArtifacts({ repositoryRoot: root, gateId: a.owner,
      runId: failed.runId, reportPath: a.reportPath }), /does not belong/);
    removeUnsafeRequiredTestArtifacts({ repositoryRoot: root, gateId: a.owner,
      runId: failed.runId, reportPath: failed.reportPath });
    assert.deepEqual(outputTree(failed.runRoot), { "context.json": sha256(readFileSync(path.join(root, failed.contextPath))) });
    assert.deepEqual(outputTree(a.runRoot), preserved, "failure cleanup preserves sibling and common parent");
    assert.deepEqual(outputTree(b.runRoot), sequential[1].sha256ByFile);
    // Demonstrate regression sensitivity at the same installed cleanup boundary.
    const legacyA = allocate();
    const legacyB = allocate();
    await success(start(legacyA, { OUTPUT_PROBE_LEGACY: "1" }));
    const legacyOutput = path.join(root, "legacy-shared-output");
    write(root, "legacy-shared-output/only-run-a.txt", legacyA.runId);
    const oldA = outputTree(legacyOutput);
    await success(start(legacyB, { OUTPUT_PROBE_LEGACY: "1" }));
    assert.throws(() => assert.deepEqual(outputTree(legacyOutput), oldA), assert.AssertionError,
      "the preservation regression must reject the previous shared-output behavior");
    assert.equal(existsSync(path.join(legacyOutput, "only-run-a.txt")), false);
    console.log("OUTPUT-ISOLATION PROOF " + JSON.stringify({ classification: "synthetic runner/output contract",
      sequential, overlapping, stableConfigurationLoads: loads.length, collision: "refused unchanged",
      ownership: "refused before cleanup", failureCleanup: "owned subtree only", legacyControl: "preservation assertion fails",
      syntheticArtifactUnchanged: true, cleanup: "fixture and subprocesses removed in finally" }));
  } finally {
    for (const { child } of processes) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await Promise.allSettled(processes.map(({ done }) => done));
    rmSync(root, { recursive: true, force: true });
  }
}

async function verifyWindowOpeningExecutionContracts() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "window-opening-context-contract-")));
  const localRoot = path.join(root, "local");
  mkdirSync(localRoot);
  const server = createServer();
  try {
    // Synthetic capture context; the socket PID/cwd observation itself is real.
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = server.address().port;
    const baseURL = `http://127.0.0.1:${port}`;
    const localServer = { schemaVersion: "window-opening-server-context/v1", runId: "synthetic-local",
      runRoot: localRoot, evidenceRoot: localRoot, repositoryRoot: process.cwd(),
      serverCwd: process.cwd(), serverExecutable: process.execPath, baseUrl: baseURL,
      listenerPid: process.pid, launcherPid: process.pid, port,
      sourceCompleteStateIdentitySha256: "a".repeat(64) };
    const localEnvironment = {
      WINDOW_OPENING_BASE_URL: baseURL, WINDOW_OPENING_RUN_ROOT: localRoot,
      WINDOW_OPENING_EVIDENCE_ROOT: localRoot,
      WINDOW_OPENING_SCREENSHOT_DIR: path.join(localRoot, "screenshots"),
      WINDOW_OPENING_NETWORK_EVIDENCE_PATH: path.join(localRoot, "network"),
      WINDOW_OPENING_RUNTIME_EVIDENCE_PATH: path.join(localRoot, "runtime"),
      WINDOW_OPENING_SERVER_CONTEXT_PATH: path.join(localRoot, "server-context.json"),
      WINDOW_OPENING_SOURCE_IDENTITY: "a".repeat(64),
    };
    writeFileSync(localEnvironment.WINDOW_OPENING_SERVER_CONTEXT_PATH, JSON.stringify(localServer));
    const local = localWindowOpeningContext(localEnvironment);
    assertWindowOpeningTestOwner(local, { baseURL, configFile: "playwright.window-opening.config.ts", project: "chromium" });
    const observation = await observeWindowOpeningLocalListener(local);
    assert.equal(observation.observation.pid, process.pid);
    const provenance = await windowOpeningCaptureProvenance(local, "synthetic-capture", `${baseURL}/design`);
    assert.equal(provenance.listenerPid, process.pid);
    assert.equal(provenance.serverCwd, process.cwd());
    assert.equal(provenance.sourceCompleteStateIdentitySha256, "a".repeat(64));
    assert.equal(sha256(readFileSync(provenance.listenerOwnership.record.absolutePath)), provenance.listenerOwnership.record.sha256);
    for (const name of Object.keys(localEnvironment)) {
      const missing = { ...localEnvironment };
      delete missing[name];
      assert.throws(() => localWindowOpeningContext(missing), /Window-opening execution prerequisite/);
    }
    assert.throws(() => localWindowOpeningContext({ ...localEnvironment, REQUIRED_TEST_GATE_ID: "release.gate-a3" }), /cannot consume/);
    for (const mutation of [{ listenerPid: 1 }, { serverCwd: root, repositoryRoot: root }]) {
      writeFileSync(localEnvironment.WINDOW_OPENING_SERVER_CONTEXT_PATH, JSON.stringify({ ...localServer, ...mutation }));
      await assert.rejects(() => observeWindowOpeningLocalListener(localWindowOpeningContext(localEnvironment)), /missing or mismatched/);
    }
    writeFileSync(localEnvironment.WINDOW_OPENING_SERVER_CONTEXT_PATH, JSON.stringify(localServer));
    await new Promise((resolve) => server.close(resolve));
    await assert.rejects(() => observeWindowOpeningLocalListener(local), /missing or mismatched/);
    await assert.rejects(() => windowOpeningCaptureProvenance(local, "wrong-target", "https://wrong.example.test/design"), /target origin/);

    // Synthetic prebuilt output and stage record. Execute the actual physical
    // verifier in an isolated Git fixture; this is not deployment evidence.
    const releaseRoot = path.join(root, "release");
    write(releaseRoot, ".gitignore", ".vercel/\n");
    write(releaseRoot, "synthetic.txt", "synthetic artifact fixture only\n");
    write(releaseRoot, "scripts/vercel-output-manifest.mjs", readFileSync(new URL("./vercel-output-manifest.mjs", import.meta.url)));
    for (const args of [["init", "--quiet"], ["add", ".gitignore", "synthetic.txt", "scripts/vercel-output-manifest.mjs"],
      ["-c", "user.name=Synthetic Contract", "-c", "user.email=synthetic@example.invalid", "commit", "--quiet", "-m", "synthetic fixture"]]) {
      assert.equal(spawnSync("git", args, { cwd: releaseRoot }).status, 0);
    }
    write(releaseRoot, ".vercel/output/config.json", '{"version":3}\n');
    write(releaseRoot, ".vercel/output/static/synthetic.txt", "synthetic output\n");
    assert.equal(spawnSync(process.execPath, ["scripts/vercel-output-manifest.mjs"], { cwd: releaseRoot }).status, 0);
    const manifest = JSON.parse(readFileSync(path.join(releaseRoot, ".vercel/prebuilt-manifest.json")));
    const sourceTreeSha = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: releaseRoot, encoding: "utf8" }).stdout.trim();
    const staged = { schema: "interior-ai.vercel-staged-deployment.v1", gitCommit: manifest.gitCommit,
      artifactSha256: manifest.artifactSha256, deploymentUrl: "https://synthetic-staged.example.test", stagedAt: new Date().toISOString() };
    write(releaseRoot, ".vercel/staged-deployment.json", JSON.stringify(staged));
    const environment = { PLAYWRIGHT_RELEASE_BASE_URL: staged.deploymentUrl, REQUIRED_TEST_ARTIFACT_SHA256: manifest.artifactSha256 };
    const options = { repositoryRoot: releaseRoot, gateId: "release.gate-a3", environment,
      sourceCommitSha: manifest.gitCommit, sourceTreeSha };
    const release = prepareCanonicalWindowOpeningContext(options);
    assert.equal(release.deployment.artifactSha256, manifest.artifactSha256);
    assert.equal(release.baseURL, staged.deploymentUrl);
    const reportMetadata = { windowOpeningExecution: release, windowOpeningTargetBaseURL: release.baseURL,
      gateA3ReleaseBaseURL: release.baseURL, requiredTestEvidence: { gateId: release.owner,
        sourceCommitSha: release.sourceCommitSha, artifactSha256: release.deployment.artifactSha256 } };
    assertWindowOpeningReportContext(reportMetadata, release.owner, { repositoryRoot: releaseRoot });
    for (const mutation of [{ windowOpeningExecution: null }, { windowOpeningTargetBaseURL: "https://wrong.example.test" },
      { requiredTestEvidence: { ...reportMetadata.requiredTestEvidence, artifactSha256: "b".repeat(64) } }]) {
      assert.throws(() => assertWindowOpeningReportContext({ ...reportMetadata, ...mutation }, release.owner), /canonical report/);
    }
    const releaseProvenance = await windowOpeningCaptureProvenance(release, "synthetic-release", `${release.baseURL}/design`);
    assert.equal(releaseProvenance.execution.owner, "release.gate-a3");
    assert.equal(releaseProvenance.listenerPid, undefined, "canonical release must not fabricate local application ownership");
    const configEnvironment = { ...environment, REQUIRED_TEST_GATE_ID: release.owner,
      REQUIRED_TEST_SOURCE_COMMIT_SHA: release.sourceCommitSha, REQUIRED_TEST_SOURCE_TREE_SHA: sourceTreeSha,
      WINDOW_OPENING_CANONICAL_CONTEXT: JSON.stringify(release) };
    const moduleURL = new URL("./window-opening-browser-context.mjs", import.meta.url).href;
    const checkConfig = (contextEnvironment) => spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { canonicalWindowOpeningContext } from ${JSON.stringify(moduleURL)}; canonicalWindowOpeningContext(process.env, ${JSON.stringify(release.baseURL)}, ${JSON.stringify(release.reportPath)}, ${JSON.stringify(release.outputPath)});`],
    { cwd: releaseRoot, env: { ...process.env, ...contextEnvironment }, encoding: "utf8" });
    const releaseConfig = checkConfig(configEnvironment);
    assert.equal(releaseConfig.status, 0, `config consumes independently verified physical artifact context: ${releaseConfig.stderr}`);
    write(releaseRoot, path.relative(releaseRoot, release.outputPath) + "/synthetic-capture.json", '{"synthetic":true}\n');
    assert.equal(checkConfig(configEnvironment).status, 0, "owned capture output must not invalidate the unchanged physical release artifact");
    assert.notEqual(checkConfig({ ...configEnvironment, WINDOW_OPENING_CANONICAL_CONTEXT: "" }).status, 0);
    for (const mutation of [{ baseURL: "https://wrong.example.test" }, { owner: "advisory.full-e2e" },
      { reportPath: "other.json" }, { outputPath: path.join(root, "wrong-output") }, { sourceTreeSha: "b".repeat(40) }, { deployment: null }]) {
      assert.notEqual(checkConfig({ ...configEnvironment, WINDOW_OPENING_CANONICAL_CONTEXT: JSON.stringify({ ...release, ...mutation }) }).status, 0);
    }
    for (const mutation of [{ artifactSha256: "b".repeat(64) }, { gitCommit: "b".repeat(40) },
      { deploymentUrl: "https://wrong.example.test" }]) {
      write(releaseRoot, ".vercel/staged-deployment.json", JSON.stringify({ ...staged, ...mutation }));
      assert.throws(() => prepareCanonicalWindowOpeningContext(options), /execution prerequisite/);
    }
    write(releaseRoot, ".vercel/staged-deployment.json", JSON.stringify(staged));
    write(releaseRoot, ".vercel/output/static/synthetic.txt", "changed output\n");
    assert.throws(() => prepareCanonicalWindowOpeningContext(options), /prebuilt output is unavailable or invalid/);
    assert.notEqual(checkConfig(configEnvironment).status, 0, "caller identity strings cannot replace actual output verification");
    assert.throws(() => prepareCanonicalWindowOpeningContext({ ...options, environment: {} }), /execution prerequisite/);
    assert.throws(() => prepareCanonicalWindowOpeningContext({ ...options, environment: { ...environment, ...localEnvironment } }), /inherited WINDOW_OPENING/);

    const advisory = prepareCanonicalWindowOpeningContext({ ...options, gateId: "advisory.full-e2e",
      environment: { PLAYWRIGHT_ADVISORY_BASE_URL: "https://synthetic-advisory.example.test" } });
    assert.equal(advisory.deployment, null);
    assert.equal(advisory.baseURL, "https://synthetic-advisory.example.test");
    const advisoryEnvironment = { REQUIRED_TEST_GATE_ID: advisory.owner, REQUIRED_TEST_SOURCE_COMMIT_SHA: advisory.sourceCommitSha,
      REQUIRED_TEST_SOURCE_TREE_SHA: advisory.sourceTreeSha, WINDOW_OPENING_CANONICAL_CONTEXT: JSON.stringify(advisory) };
    const originalCwd = process.cwd();
    try {
      process.chdir(releaseRoot);
      assert.deepEqual(canonicalWindowOpeningContext(advisoryEnvironment, advisory.baseURL, advisory.reportPath, advisory.outputPath), advisory);
      assert.throws(() => canonicalWindowOpeningContext({ ...advisoryEnvironment, REQUIRED_TEST_GATE_ID: "release.gate-a3" }, advisory.baseURL, advisory.reportPath, advisory.outputPath), /execution prerequisite/);
      assert.throws(() => canonicalWindowOpeningContext({ ...advisoryEnvironment, REQUIRED_TEST_ARTIFACT_SHA256: manifest.artifactSha256 }, advisory.baseURL, advisory.reportPath, advisory.outputPath), /release authority/);
    } finally { process.chdir(originalCwd); }
    assert.throws(() => assertWindowOpeningTestOwner(null, {}), /select test:window-opening-mounted/);
    assert.throws(() => assertWindowOpeningTestOwner(advisory, { baseURL, configFile: "playwright.config.ts", project: "chromium" }), /differs/);
    assertWindowOpeningTestOwner(advisory, { baseURL: advisory.baseURL, configFile: "playwright.config.ts", project: "webkit" });
    const capture = { outputDir: path.join(advisory.outputPath, "synthetic-test"), testId: "window-opening-01", project: "chromium", screenshotId: "capture-01" };
    const paths = [windowOpeningCapturePaths(advisory, capture),
      windowOpeningCapturePaths(advisory, { ...capture, project: "webkit" }),
      windowOpeningCapturePaths(advisory, { ...capture, testId: "window-opening-02" }),
      windowOpeningCapturePaths(advisory, { ...capture, screenshotId: "capture-02" })];
    assert.equal(new Set(paths.map((entry) => entry.screenshotPath)).size, 4);
    assert.equal(paths[0].tracePath, path.join(capture.outputDir, "trace.zip"));
    assert.throws(() => windowOpeningCapturePaths(advisory, { ...capture, screenshotId: "../escape" }), /invalid/);
    mkdirSync(path.dirname(paths[0].screenshotPath), { recursive: true });
    symlinkSync(path.join(root, "escape.png"), paths[0].screenshotPath);
    assert.throws(() => windowOpeningCapturePaths(advisory, capture), /symlink/);
    unlinkSync(paths[0].screenshotPath);
    const spec = readFileSync(new URL("../tests/e2e/window-opening-corrections.spec.ts", import.meta.url), "utf8");
    const inventory = JSON.parse(readFileSync(new URL("./window-opening-mounted-tests.json", import.meta.url)));
    const titles = [...spec.matchAll(/^test\("([^"]+)",/gm)].map((match) => match[1]);
    assert.deepEqual(titles, inventory.map((entry) => entry.title), "all 12 functional cases retain their fixed owner/title");
    assert.doesNotMatch(spec, /test\.(?:skip|fixme|only)\s*\(|waitForTimeout\s*\(/);
    const canonical = JSON.parse(readFileSync(new URL("./required-test-manifest.json", import.meta.url)));
    for (const id of ["release.gate-a3", "advisory.full-e2e"]) {
      const gate = canonical.gates.find((entry) => entry.id === id);
      assert.equal(gate.requiredInventory, "browser-specs");
      assert.deepEqual(gate.requiredProjects, ["chromium"]);
      assert.equal(gate.playwright.config, "playwright.config.ts");
    }
    assert.equal(canonical.gates.find((entry) => entry.id === "release.gate-a3").blocking, true);
    // Exercise the actual canonical config/module graph, without starting a
    // server or browser. This catches Playwright's CJS/ESM loading boundary.
    const currentGit = (args) => spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
    const discovery = prepareCanonicalWindowOpeningContext({ repositoryRoot: process.cwd(),
      gateId: "advisory.full-e2e", environment: {}, sourceCommitSha: currentGit(["rev-parse", "HEAD"]),
      sourceTreeSha: currentGit(["rev-parse", "HEAD^{tree}"]) });
    try {
    const listed = spawnSync(path.join(process.cwd(), "node_modules/.bin/playwright"), ["test", "--list"], {
      cwd: process.cwd(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        REQUIRED_TEST_GATE_ID: discovery.owner, REQUIRED_TEST_REPORT_PATH: discovery.reportPath,
        REQUIRED_TEST_SOURCE_COMMIT_SHA: discovery.sourceCommitSha,
        REQUIRED_TEST_SOURCE_TREE_SHA: discovery.sourceTreeSha,
        WINDOW_OPENING_CANONICAL_CONTEXT: JSON.stringify(discovery) },
    });
    assert.equal(listed.status, 0, listed.stderr);
    const discoveryReport = JSON.parse(readFileSync(path.resolve(discovery.reportPath), "utf8"));
    assert.deepEqual(discoveryReport.errors, []);
    assertWindowOpeningReportContext(discoveryReport.config.metadata, discovery.owner, { config: discoveryReport.config, expectedRunId: discovery.runId });
    const discovered = [];
    const visit = (suite) => { discovered.push(...suite.specs ?? []); (suite.suites ?? []).forEach(visit); };
    discoveryReport.suites.forEach(visit);
    const windowCases = discovered.filter((entry) => entry.file.endsWith("window-opening-corrections.spec.ts"));
    assert.deepEqual(windowCases.map((entry) => entry.title), inventory.map((entry) => entry.title));
    assert.deepEqual(discoveryReport.config.projects.map((project) => project.name), ["chromium"]);
    for (const entry of windowCases) {
      assert.equal(entry.tests.length, 1);
      assert.equal(entry.tests[0].projectName, "chromium");
      assert.equal(entry.tests[0].timeout, 240_000);
    }
    console.log("Canonical discovery: all 12 window cases; Chromium; original timeouts.");
    } finally { rmSync(discovery.runRoot, { recursive: true, force: true }); }

  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

verifyCanonicalReportHandoff();

const realRepository = validateRequiredTestRepository({ repositoryRoot: process.cwd() });
assert.deepEqual(realRepository.issues, [], "the checked-in required-test contract must validate itself");
assert.equal(realRepository.valid, true);

console.log("CH-0017 required-test truthfulness tests passed.");
