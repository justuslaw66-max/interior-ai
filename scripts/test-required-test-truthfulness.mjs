import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
  validateRequiredTestEvidence,
  validateRequiredTestReport,
  validateRequiredTestRepository,
} from "./required-test-truthfulness.mjs";
import {
  validateGateA3CertificationEvidence,
  validateGateA3PromotionCertification,
} from "./vercel-prebuilt-release.mjs";

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
    'import { runFixtureChecks } from "./fixture-module.mjs";\nrunFixtureChecks();\n',
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
    reportPath: "evidence/advisory-evidence.json",
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
        requiredProjects: [],
        allowSkips: false,
        allowRetries: false,
        reportType: "process-exit",
        artifactBinding: "none",
        ci: { job: "stable-checks", step: "Fixture" },
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
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/evidence.json",
    `${JSON.stringify({
      schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
      gateId: "advisory.fixture",
      sourceCommitSha: SOURCE_SHA,
      diagnostics: ["failed at /home/runner/work/interior-ai/interior-ai/tests/e2e/required.spec.ts"],
    })}\n`,
  );
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
  const prepared = prepareRequiredTestEvidenceUpload({
    repositoryRoot: context.root,
    environment: { AUTH_SECRET: "fixture-sensitive-value" },
  });
  assert.equal(prepared.included.length, 3);
  assert.deepEqual(prepared.omitted, [
    {
      path: "advisory.fixture/playwright-output/failure/trace.zip",
      reason: "uninspectable-or-binary",
    },
  ]);
  const retainedErrorContext = readFileSync(
    path.join(
      context.root,
      ".local/required-test-upload/required-test-evidence/advisory.fixture/playwright-output/failure/error-context.md",
    ),
    "utf8",
  );
  assert.equal(retainedErrorContext.includes("/home/runner/work/"), false);
  assert.match(retainedErrorContext, /<WORKSPACE>/);
  assert.doesNotThrow(() =>
    auditRetainedEvidenceDirectory({
      repositoryRoot: context.root,
      environment: { AUTH_SECRET: "fixture-sensitive-value" },
    }),
  );
  write(
    context.root,
    ".local/required-test-upload/late-unsafe.log",
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
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/nested.json",
    `${JSON.stringify({ metadata: { OPENAI_API_KEY: "gate-a3-ci-openai-placeholder" } })}\n`,
  );
  assert.throws(
    () => prepareRequiredTestEvidenceUpload({ repositoryRoot: context.root }),
    /contains prohibited environment output|contains secret-bearing fields/,
  );
  assert.equal(existsSync(path.join(context.root, ".local/required-test-upload")), false);
}

{
  const context = makeRepository();
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/environment.log",
    "OPENAI_API_KEY: gate-a3-ci-openai-placeholder\n",
  );
  assert.throws(
    () => prepareRequiredTestEvidenceUpload({ repositoryRoot: context.root }),
    /contains prohibited environment output/,
  );
  assert.equal(existsSync(path.join(context.root, ".local/required-test-upload")), false);
}

{
  const context = makeRepository();
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/renamed-archive.log",
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]),
  );
  assert.throws(
    () => prepareRequiredTestEvidenceUpload({ repositoryRoot: context.root }),
    /has a binary or archive signature/,
  );
  assert.equal(
    existsSync(path.join(context.root, ".local/required-test-upload")),
    false,
    "a binary-under-text-extension failure must leave nothing uploadable",
  );
}

{
  const context = makeRepository();
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/credential.txt",
    "Authorization: Bearer github_pat_this_is_not_retained_123456\n",
  );
  assert.throws(
    () => prepareRequiredTestEvidenceUpload({ repositoryRoot: context.root }),
    /contains a generic credential value/,
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
      prepareRequiredTestEvidenceUpload({
        repositoryRoot: context.root,
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
  write(
    context.root,
    ".local/required-test-evidence/advisory.fixture/playwright-output/error-context.md",
    "unsafe shaped value sk_test_gate_a3_ci_placeholder\n",
  );
  assert.throws(
    () => prepareRequiredTestEvidenceUpload({ repositoryRoot: context.root }),
    /contains a shaped secret value/,
  );
  assert.equal(
    existsSync(path.join(context.root, ".local/required-test-upload")),
    false,
    "failed sanitization must leave no canonical upload directory",
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
  expectIssue(
    reportResult(context.root, makeReport({ status: "skipped", declaredStatus: "skipped" })),
    "required test was skipped",
  );
}

{
  const context = makeRepository();
  expectIssue(reportResult(context.root, makeReport({ retry: 1 })), "required test was flaky or retried");
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
  const workflow = readFileSync(
    path.join(process.cwd(), ".github/workflows/ci.yml"),
    "utf8",
  );
  const exactHeadCheckouts = [
    ...workflow.matchAll(
      /uses:\s*actions\/checkout@v4[\s\S]{0,180}?ref:\s*\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/g,
    ),
  ];
  assert.equal(
    exactHeadCheckouts.length,
    3,
    "every CI checkout must bind pull-request execution to the exact head commit",
  );
  const stableJob = workflow.slice(
    workflow.indexOf("  stable-checks:"),
    workflow.indexOf("  e2e-full:"),
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
  assert.match(stableJob, /if-no-files-found:\s*error/);
  assert.match(stableJob, /path:\s*\.local\/production-artifact-evidence\/upload\//);
  const advisoryJob = workflow.slice(
    workflow.indexOf("  e2e-full:"),
    workflow.indexOf("  merge-gate:"),
  );
  assert.ok(
    advisoryJob.indexOf("Prepare portable advisory evidence") <
      advisoryJob.indexOf("Upload test results"),
    "advisory output must be sanitized immediately before retention",
  );
  assert.match(advisoryJob, /npm run evidence:required-tests:prepare-upload/);
  assert.match(advisoryJob, /path:\s*\.local\/required-test-upload\//);
  assert.match(advisoryJob, /if-no-files-found:\s*error/);
  assert.doesNotMatch(
    advisoryJob,
    /path:\s*[|>]?[\s\S]*?\.local\/required-test-evidence\//,
    "raw Playwright evidence must not be uploaded",
  );
  assert.match(
    workflow,
    /e2e-full:[\s\S]*?if:\s*always\(\)[^\n]*github\.event_name == 'pull_request'/,
    "the non-blocking advisory inventory must still execute on the verification PR",
  );
  assert.match(workflow, /merge-gate:\n\s+name:\s*merge-gate\n/);
}

const realRepository = validateRequiredTestRepository({ repositoryRoot: process.cwd() });
assert.deepEqual(realRepository.issues, [], "the checked-in required-test contract must validate itself");
assert.equal(realRepository.valid, true);

console.log("CH-0017 required-test truthfulness tests passed.");
