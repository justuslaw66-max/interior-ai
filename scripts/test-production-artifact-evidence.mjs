import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PRODUCTION_EVIDENCE_SCHEMA,
  PRODUCTION_EVIDENCE_SERVER_COMMAND,
  canonicalizeProductionEvidenceReport,
  comparePortablePaths,
  createProductionEvidenceBundle,
  createProductionEvidenceManifest,
  recordProductionEvidenceTest,
  validateProductionEvidence,
  writeProductionEvidenceManifest,
} from "./production-artifact-evidence.mjs";
import { inspectGitTree } from "./vercel-output-manifest.mjs";
import {
  GITLEAKS_ARCHIVE_ENTRIES,
  GITLEAKS_STAGING_ROOT,
  prepareGitleaksArtifact,
} from "./gitleaks-artifact.mjs";
import {
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
  RUNTIME_SMOKE_PHASE_BUDGETS,
  RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  RuntimeSmokeTerminalError,
  createRuntimeSmokePhaseRecorder,
  deriveRuntimeSmokeWholeTestTimeout,
} from "./runtime-smoke-phase-budget.mjs";

const sequentialRuntimeSmokeBudgetMs = RUNTIME_SMOKE_PHASE_BUDGETS.reduce(
  (total, phase) => total + phase.timeoutMs,
  0,
);
const runtimeSmokeOverheadBudgetMs = Object.values(
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
).reduce((total, budget) => total + budget, 0);
assert.equal(
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  sequentialRuntimeSmokeBudgetMs + runtimeSmokeOverheadBudgetMs,
  "the whole-test timeout must equal all sequential phase budgets plus explicit overhead",
);
assert.ok(
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS > sequentialRuntimeSmokeBudgetMs,
  "the whole-test timeout must leave explicit setup, teardown, assertion, and orchestration headroom",
);
const increasedPhaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS.map((phase, index) =>
  index === 0 ? { ...phase, timeoutMs: phase.timeoutMs + 7_000 } : phase,
);
assert.equal(
  deriveRuntimeSmokeWholeTestTimeout({ phases: increasedPhaseBudgets }),
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS + 7_000,
  "changing one canonical phase budget must mechanically update the whole-test timeout",
);

{
  const terminalRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "terminal-fixture", timeoutMs: 1_000 }],
  });
  let attempts = 0;
  await assert.rejects(
    terminalRecorder.run("terminal-fixture", async () => {
      attempts += 1;
      throw new RuntimeSmokeTerminalError("terminal-fixture");
    }, () => "error"),
    /reached terminal lifecycle state error/,
  );
  assert.equal(attempts, 1, "a terminal lifecycle error must fail immediately");
  assert.deepEqual(
    terminalRecorder.records.map(({ outcome, safeDiagnosticCategory }) => ({
      outcome,
      safeDiagnosticCategory,
    })),
    [{ outcome: "terminal-error", safeDiagnosticCategory: "glb-terminal-error" }],
  );
}

{
  const timeoutRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "bounded-fixture", timeoutMs: 5 }],
  });
  await assert.rejects(
    timeoutRecorder.run("bounded-fixture", () => new Promise(() => {})),
    /Runtime-smoke phase bounded-fixture exceeded its 5ms budget/,
  );
  assert.equal(timeoutRecorder.records[0]?.outcome, "timed-out");
  assert.equal(
    timeoutRecorder.records[0]?.safeDiagnosticCategory,
    "phase-timeout",
    "a bounded phase must emit its own diagnostic before the whole-test envelope",
  );
}

const runtimeSmokeSource = readFileSync(
  path.join(process.cwd(), "tests/e2e/00-runtime-smoke.spec.ts"),
  "utf8",
);
assert.match(
  runtimeSmokeSource,
  /test\.setTimeout\(RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS\)/,
  "the required identity must consume the derived timeout without duplicating a number",
);
assert.doesNotMatch(runtimeSmokeSource, /test\.slow\(|test\.skip\(|retries\s*:/);

{
  const root = mkdtempSync(path.join(tmpdir(), "ch-0017-gitleaks-artifact-"));
  const sarifBytes = Buffer.from(
    `${JSON.stringify({
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "gitleaks" } }, results: [] }],
    }, null, 2)}\n`,
  );
  write(root, "results.sarif", sarifBytes);
  write(root, "unrelated-runner-file.txt", "must not enter the artifact\n");
  const manifest = prepareGitleaksArtifact({
    repositoryRoot: root,
    sourceCommitSha: "7".repeat(40),
    runId: "30684560486",
    runAttempt: "1",
  });
  assert.deepEqual(
    readdirSync(path.join(root, GITLEAKS_STAGING_ROOT)).sort(),
    [...GITLEAKS_ARCHIVE_ENTRIES],
    "the staging tree must contain only deterministic root-level entries",
  );
  assert.deepEqual(
    readFileSync(path.join(root, GITLEAKS_STAGING_ROOT, "results.sarif")),
    sarifBytes,
    "portable staging must preserve the already-scanned SARIF bytes",
  );
  assert.equal(manifest.sarif.archiveEntry, "results.sarif");
  assert.equal(
    readFileSync(path.join(root, GITLEAKS_STAGING_ROOT, "artifact-manifest.json"), "utf8")
      .includes("work/interior-ai/interior-ai"),
    false,
  );

  write(
    root,
    "results.sarif",
    `${JSON.stringify({
      version: "2.1.0",
      runs: [{ artifacts: [{ location: { uri: "/home/runner/work/repo/results" } }] }],
    })}\n`,
  );
  assert.throws(
    () =>
      prepareGitleaksArtifact({
        repositoryRoot: root,
        sourceCommitSha: "7".repeat(40),
        runId: "30684560486",
        runAttempt: "1",
      }),
    /contains runner paths/,
  );
  assert.equal(existsSync(path.join(root, GITLEAKS_STAGING_ROOT)), false);
  assert.equal(existsSync(path.join(root, `${GITLEAKS_STAGING_ROOT}.staging`)), false);
}

assert.deepEqual(
  ["é", "a", "Z", "!"].sort(comparePortablePaths),
  ["!", "Z", "a", "é"],
  "artifact paths must use locale-independent code-unit ordering",
);

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function fixture({ environmentOverrides = {}, publicArtifactText = "public artifact\n" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "ch-0016-evidence-"));
  write(root, ".gitignore", ".next/\n.local/\nnode_modules/\n*.local.js\n");
  write(root, "package.json", `${JSON.stringify({
    name: "evidence-fixture",
    private: true,
    packageManager: "npm@11.6.2",
  }, null, 2)}\n`);
  write(root, "package-lock.json", `${JSON.stringify({
    name: "evidence-fixture",
    lockfileVersion: 3,
    packages: {},
  }, null, 2)}\n`);
  write(root, ".nvmrc", "24.13.0\n");
  write(
    root,
    "scripts/production-artifact-evidence.mjs",
    readFileSync(path.join(process.cwd(), "scripts/production-artifact-evidence.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/required-test-truthfulness.mjs",
    readFileSync(path.join(process.cwd(), "scripts/required-test-truthfulness.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/runtime-smoke-phase-budget.mjs",
    readFileSync(path.join(process.cwd(), "scripts/runtime-smoke-phase-budget.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/required-test-manifest.json",
    readFileSync(path.join(process.cwd(), "scripts/required-test-manifest.json"), "utf8"),
  );
  write(root, "generated/runtime.ts", "export const generated = true;\n");
  write(root, "public/asset.txt", publicArtifactText);
  write(root, ".next/BUILD_ID", "build-fixture-001\n");
  write(root, ".next/build-manifest.json", "{}\n");
  write(root, ".next/required-server-files.json", "{}\n");
  write(root, ".next/static/chunk.js", "static chunk\n");
  write(root, ".next/server/app.js", "server output\n");
  write(root, ".next/server/app.js.nft.json", `${JSON.stringify({
    version: 1,
    files: ["../../package.json", "../../node_modules/.package-lock.json"],
  })}\n`);
  symlinkSync("../../public/asset.txt", path.join(root, ".next/server/public-asset-link"));
  write(root, ".next/cache/excluded.txt", "mutable cache\n");
  write(root, ".next/dev/excluded.txt", "development output\n");
  write(root, ".next/diagnostics/excluded.txt", "diagnostics\n");
  write(root, ".next/trace/excluded.txt", "trace\n");
  write(root, "node_modules/.package-lock.json", "installed dependency identity\n");

  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "CH-0016 test"]);
  git(root, ["config", "user.email", "ch-0016@example.test"]);
  git(root, [
    "add",
    ".gitignore",
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "scripts/production-artifact-evidence.mjs",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/required-test-truthfulness.mjs",
    "scripts/required-test-manifest.json",
    "generated/runtime.ts",
    "public/asset.txt",
  ]);
  git(root, ["commit", "-qm", "fixture"]);

  const evidenceDirectory = ".local/production-artifact-evidence";
  const manifestPath = `${evidenceDirectory}/manifest.json`;
  const reportPath = `${evidenceDirectory}/runtime-smoke.json`;
  const phaseTimingPath = `${evidenceDirectory}/runtime-smoke-phases.json`;
  const manifest = await createProductionEvidenceManifest({
    repositoryRoot: root,
    candidateIdentifier: "ch-0016-fixture",
    evidenceDirectory,
    dependencyInstall: {
      command: "npm ci --include=dev",
      startedAt: "2026-07-31T00:00:00.000Z",
      completedAt: "2026-07-31T00:00:01.000Z",
    },
    generatedSourceCheck: {
      command:
        "npx ts-node --transpile-only --compiler-options '{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}' scripts/generate-surface-material-runtime.ts --check",
      status: "passed",
      completedAt: "2026-07-31T00:00:02.000Z",
    },
    build: {
      command: "npm run build",
      startedAt: "2026-07-31T00:00:03.000Z",
      completedAt: "2026-07-31T00:00:04.000Z",
      applicationEnvironment: "staging",
      catalogStrictValidation: true,
    },
    toolchain: { nodeVersion: "v24.13.0", npmVersion: "11.6.2" },
    environment: {
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_ENV: "staging",
      NODE_ENV: "production",
      CATALOG_STRICT_VALIDATION: "true",
      DATABASE_URL: "postgresql://test:test@localhost:5432/evidence_fixture",
      OPENAI_API_KEY: "fixture-openai-placeholder",
      SHOPIFY_STORE_DOMAIN: "fixture.myshopify.example",
      SHOPIFY_STOREFRONT_TOKEN: "fixture-shopify-placeholder",
      POSTHOG_KEY: "fixture-posthog-placeholder",
      STRIPE_SECRET_KEY: "sk_test_fixture_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture_placeholder",
      STRIPE_PRICE_PRO_MONTHLY: "price_fixture_monthly",
      STRIPE_PRICE_PRO_YEARLY: "price_fixture_yearly",
      AUTH_SECRET: "fixture-auth-secret-at-least-32-characters",
      GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-fixture-placeholder",
      APP_ORIGIN: "http://127.0.0.1:3000",
      ADMIN_EMAILS: "fixture-admin@example.test",
      ...environmentOverrides,
    },
  });
  await writeProductionEvidenceManifest({ repositoryRoot: root, manifestPath, manifest });
  const report = {
    config: {
      configFile: path.join(root, "playwright.config.ts"),
      rootDir: path.join(root, "tests/e2e"),
      forbidOnly: true,
      grep: {},
      grepInvert: null,
      shard: null,
      projects: [
        {
          name: "chromium",
          retries: 0,
          repeatEach: 1,
          outputDir: path.join(root, ".local/production-artifact-evidence/playwright-output"),
          testDir: path.join(root, "tests/e2e"),
          snapshotDir: null,
        },
      ],
      webServer: {
        command: PRODUCTION_EVIDENCE_SERVER_COMMAND,
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
      },
      metadata: {
        productionArtifactEvidence: {
          schema: PRODUCTION_EVIDENCE_SCHEMA,
          sourceCommitSha: manifest.source.commitSha,
          artifactSha256: manifest.artifact.sha256,
          nextBuildId: manifest.build.nextBuildId,
          serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
          buildMode: "production",
        },
      },
    },
    suites: [
      {
        title: "00-runtime-smoke.spec.ts",
        file: "00-runtime-smoke.spec.ts",
        specs: [
          {
            title: "furnished template remains stable without a render loop",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [{ status: "passed", retry: 0, annotations: [] }],
              },
            ],
          },
          {
            title: "health and catalog endpoints report ready",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [{ status: "passed", retry: 0, annotations: [] }],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
    stats: {
      startTime: "2026-07-31T00:00:04.500Z",
      duration: 400,
      expected: 2,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  };
  write(root, reportPath, `${JSON.stringify(report, null, 2)}\n`);
  write(
    root,
    phaseTimingPath,
    `${JSON.stringify({
      schema: RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
      testIdentity: "runtime.template-stability",
      wholeTestTimeoutMs: RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
      sequentialPhaseBudgetMs: sequentialRuntimeSmokeBudgetMs,
      overheadBudgets: RUNTIME_SMOKE_OVERHEAD_BUDGETS,
      phaseBudgets: RUNTIME_SMOKE_PHASE_BUDGETS,
      phases: RUNTIME_SMOKE_PHASE_BUDGETS.map((phase, index) => ({
        name: phase.name,
        startTimeRelativeMs: index * 10,
        elapsedMs: 10,
        outcome: "passed",
        timeoutBudgetMs: phase.timeoutMs,
        finalLifecycleState: index < 5 ? "loading" : "stable",
        safeDiagnosticCategory: "none",
      })),
      complete: true,
    }, null, 2)}\n`,
  );
  canonicalizeProductionEvidenceReport(root, reportPath);
  const canonicalReport = readFileSync(path.join(root, reportPath), "utf8");
  assert.equal(canonicalReport.includes(root), false);
  assert.match(canonicalReport, /<repository-root>/);
  await recordProductionEvidenceTest({
    repositoryRoot: root,
    manifestPath,
    reportPath,
    phaseTimingPath,
    name: "runtime-smoke",
    command: "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium",
    processExitCode: 0,
    completedAt: "2026-07-31T00:00:05.000Z",
  });
  return { root, manifestPath, reportPath, phaseTimingPath };
}

function readManifest(root, manifestPath) {
  return JSON.parse(readFileSync(path.join(root, manifestPath), "utf8"));
}

async function rewriteManifest(root, manifestPath, mutate) {
  const manifest = readManifest(root, manifestPath);
  mutate(manifest);
  await writeProductionEvidenceManifest({ repositoryRoot: root, manifestPath, manifest });
}

async function rewritePhaseTimings(context, mutate) {
  const absolutePath = path.join(context.root, context.phaseTimingPath);
  const timing = JSON.parse(readFileSync(absolutePath, "utf8"));
  mutate(timing);
  const bytes = Buffer.from(`${JSON.stringify(timing, null, 2)}\n`);
  writeFileSync(absolutePath, bytes);
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].phaseTimings.sha256 = createHash("sha256").update(bytes).digest("hex");
  });
}

async function expectRejected(context, expectedText) {
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
  });
  assert.equal(result.valid, false, `expected rejection containing ${expectedText}`);
  assert.ok(
    result.issues.some((issue) => issue.includes(expectedText)),
    `missing rejection ${JSON.stringify(expectedText)} in ${JSON.stringify(result.issues)}`,
  );
}

{
  const context = await fixture();
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
  assert.equal(result.manifest.repositoryEvidence.status, "valid");
  assert.equal(result.manifest.repositoryEvidence.releaseReady, false);
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[1].startTimeRelativeMs =
      timing.phases[0].startTimeRelativeMs + timing.phases[0].elapsedMs - 1;
  });
  await expectRejected(context, "phase timing timeline is overlapping");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    const finalPhase = timing.phases.at(-1);
    finalPhase.startTimeRelativeMs = timing.wholeTestTimeoutMs - finalPhase.elapsedMs + 1;
  });
  await expectRejected(context, "exceeds the whole-test timeout");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].message = "private diagnostic text must not be retained";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].finalLifecycleState = "credential-bearing-private-state";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const openAiSecret = "gate-a3-ci-openai-placeholder";
  const context = await fixture({
    environmentOverrides: { OPENAI_API_KEY: openAiSecret },
    publicArtifactText: `embedded ${openAiSecret}\n`,
  });
  await assert.rejects(
    () =>
      createProductionEvidenceBundle({
        repositoryRoot: context.root,
        manifestPath: context.manifestPath,
        reportPath: context.reportPath,
        environment: { OPENAI_API_KEY: openAiSecret },
      }),
    /production artifact contains sensitive environment values: OPENAI_API_KEY/,
  );
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  rmSync(path.join(context.root, ".git"), { recursive: true, force: true });
  rmSync(path.join(context.root, "node_modules"), { recursive: true, force: true });
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
    standalone: true,
    expectedSourceCommitSha: manifest.source.commitSha,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true, "downloaded evidence must verify without Git or node_modules");

  const mismatched = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
    standalone: true,
    expectedSourceCommitSha: "f".repeat(40),
  });
  assert.equal(mismatched.valid, false);
  assert.ok(
    mismatched.issues.includes("standalone evidence belongs to another source commit"),
  );
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  const bundle = await createProductionEvidenceBundle({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
  });
  const absoluteBundlePath = path.join(context.root, bundle.bundlePath);
  const archiveBytes = readFileSync(absoluteBundlePath);
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  assert.equal(bundle.bundleSha256, archiveSha256);
  assert.equal(
    readFileSync(`${absoluteBundlePath}.sha256`, "utf8"),
    `${archiveSha256}  ${path.basename(absoluteBundlePath)}\n`,
  );

  const archiveEntries = execFileSync("tar", ["-tzf", absoluteBundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((entry) => entry.replace(/\/$/, ""));
  const allowedFiles = new Set([
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "scripts/production-artifact-evidence.mjs",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/required-test-truthfulness.mjs",
    "scripts/required-test-manifest.json",
    context.manifestPath,
    `${context.manifestPath}.sha256`,
    context.reportPath,
    ".local/production-artifact-evidence/runtime-smoke-phases.json",
  ]);
  const allowedDirectories = new Set([
    ".next",
    "public",
    "scripts",
    ".local",
    ".local/production-artifact-evidence",
  ]);
  for (const entry of archiveEntries) {
    assert.ok(
      allowedFiles.has(entry) ||
        allowedDirectories.has(entry) ||
        entry.startsWith(".next/") ||
        entry.startsWith("public/"),
      `standalone archive contains non-allowlisted input ${entry}`,
    );
    assert.equal(
      /^(?:\.next\/(?:cache|dev|diagnostics|trace))(?:\/|$)/.test(entry),
      false,
      `standalone archive contains mutable artifact path ${entry}`,
    );
  }

  const extractedRoot = mkdtempSync(path.join(tmpdir(), "ch-0016-bundle-roundtrip-"));
  execFileSync("tar", ["-xzf", absoluteBundlePath, "-C", extractedRoot]);
  const extractedLink = path.join(extractedRoot, ".next/server/public-asset-link");
  assert.equal(lstatSync(extractedLink).isSymbolicLink(), true);
  assert.equal(readlinkSync(extractedLink), "../../public/asset.txt");
  const standaloneOutput = execFileSync(
    process.execPath,
    ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
    {
      cwd: extractedRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
      },
    },
  );
  assert.match(standaloneOutput, /Standalone production artifact evidence valid/);
}

{
  const context = await fixture();
  const packagePath = path.join(context.root, "package.json");
  const packageBefore = readFileSync(packagePath, "utf8");
  await assert.rejects(
    () =>
      createProductionEvidenceBundle({
        repositoryRoot: context.root,
        manifestPath: context.manifestPath,
        reportPath: context.reportPath,
        bundlePath: "bundle.tar.gz",
      }),
    /evidence bundle path must be exactly/,
  );
  assert.equal(
    readFileSync(packagePath, "utf8"),
    packageBefore,
    "an unsafe bundle override must be rejected before any repository mutation",
  );
}

{
  const context = await fixture();
  write(context.root, "generated/runtime.ts", "export const generated = false;\n");
  await expectRejected(context, "working tree is not clean");
}

{
  const context = await fixture();
  write(context.root, "untracked-source.js", "throw new Error('untracked build influence');\n");
  await expectRejected(context, "untracked source files are present");
}

{
  const context = await fixture();
  write(context.root, "next.config.local.js", "throw new Error('ignored build influence');\n");
  await expectRejected(context, "ignored files could influence the build");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.source.commitSha = "f".repeat(40);
  });
  await expectRejected(context, "source commit does not match HEAD");
}

{
  const context = await fixture();
  write(context.root, "package-lock.json", `${JSON.stringify({
    name: "evidence-fixture-changed",
    lockfileVersion: 3,
    packages: {},
  }, null, 2)}\n`);
  await expectRejected(context, "lockfile SHA-256 mismatch");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, "package-lock.json"));
  await expectRejected(context, "required lockfile is missing");
}

{
  const context = await fixture();
  write(context.root, "node_modules/.package-lock.json", "tampered installed identity\n");
  await expectRejected(context, "installed dependency identity does not match");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.generatedSourceCheck.status = "failed";
  });
  await expectRejected(context, "generated-source drift check did not pass");
}

{
  const context = await fixture();
  write(context.root, ".next/server/app.js", "tampered server output\n");
  await expectRejected(context, "artifact SHA-256 mismatch");
}

{
  const context = await fixture();
  const outside = path.join(tmpdir(), `ch-0016-symlink-${process.pid}.txt`);
  writeFileSync(outside, "outside repository\n");
  symlinkSync(outside, path.join(context.root, ".next/server/outside-link"));
  await expectRejected(context, "Production artifact symlink .next/server/outside-link escapes");
  rmSync(outside);
}

{
  const context = await fixture();
  symlinkSync(
    path.join(context.root, ".git/config"),
    path.join(context.root, ".next/server/prohibited-link"),
  );
  await expectRejected(context, "targets prohibited path .git/config");
}

{
  const context = await fixture();
  write(context.root, context.reportPath, "{\"tampered\":true}\n");
  await expectRejected(context, "test report SHA-256 mismatch");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, context.reportPath));
  await expectRejected(context, "required test report is missing");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, context.manifestPath));
  await expectRejected(context, "production evidence manifest is missing");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, ".next/build-manifest.json"));
  await expectRejected(context, "Required production artifact path is missing");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.applicationEnvironment = "development";
  });
  await expectRejected(context, "production evidence environment must be staging or production");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.mode = "development";
  });
  await expectRejected(context, "development-mode evidence is not accepted");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.environmentIdentity.nextPublicAppEnv = "production";
  });
  await expectRejected(context, "recorded application environment identity is contradictory");
}

await assert.rejects(
  () => fixture({ environmentOverrides: { NEXT_PUBLIC_APP_ENV: "production" } }),
  /NEXT_PUBLIC_APP_ENV must exactly match APP_ENV/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { VERCEL_ENV: "production" } }),
  /VERCEL_ENV contradicts APP_ENV/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { APP_ENV: "unknown" } }),
  /APP_ENV must exactly match the recorded production evidence environment/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { APP_ENV: undefined } }),
  /APP_ENV must exactly match the recorded production evidence environment/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { OPENAI_API_KEY: undefined } }),
  /required staging configuration shape is incomplete/,
);

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.catalogStrictValidation = false;
  });
  await expectRejected(context, "strict catalog validation was not enabled");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.developmentOnlyFlags.NEXT_PUBLIC_ENABLE_TEST_FIXTURES = true;
  });
  await expectRejected(context, "development-only flags are enabled");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.unexpected = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains failures or flaky tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].processExitCode = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "production smoke command exited nonzero");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.flaky = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains failures or flaky tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.expected = 0;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains zero passing tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.skipped = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "critical production smoke contains skipped tests");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.forbidOnly = false;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "focused .only execution is forbidden");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.suites[0].specs.pop();
  report.stats.expected = 1;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "requirement runtime.health-catalog-ready is missing");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.projects[0].name = "webkit";
  report.suites[0].specs.forEach((spec) => {
    spec.tests[0].projectId = "webkit";
    spec.tests[0].projectName = "webkit";
  });
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "required project chromium is missing");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].artifactSha256 = "0".repeat(64);
  });
  await expectRejected(context, "test report is bound to another artifact");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.serverCommand = "npm run dev";
  });
  await expectRejected(context, "build or production-server command is not canonical");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.webServer.command = "npm run dev";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report does not prove the canonical non-reused production server");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.webServer.reuseExistingServer = true;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report does not prove the canonical non-reused production server");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].completedAt = "2026-07-31T00:00:03.000Z";
  });
  await expectRejected(context, "test evidence predates the recorded artifact");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.createdAt = "July 31 2026 00:00:04 UTC";
  });
  await expectRejected(context, "evidence timestamps must use valid UTC ISO 8601 values");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].completedAt = "2026-07-31T08:00:05+08:00";
  });
  await expectRejected(context, "test evidence timestamp must use valid UTC ISO 8601 format");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.externalControls[0].status = "verified";
  });
  await expectRejected(context, "external controls must remain not_verified");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.repositoryEvidence.statement =
      "Repository evidence proves the Vercel production deployment is verified.";
  });
  await expectRejected(context, "repository evidence claim is not canonical");
}

{
  const context = await fixture();
  write(context.root, ".next/server/app.js.nft.json", `${JSON.stringify({
    version: 1,
    files: ["../../../missing-runtime-file"],
  })}\n`);
  await expectRejected(context, "traced output contains missing files");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, ".next/server/app.js.nft.json"));
  await expectRejected(context, "traced output inventory is empty");
}

{
  const context = await fixture();
  const manifestAbsolutePath = path.join(context.root, context.manifestPath);
  writeFileSync(manifestAbsolutePath, `${readFileSync(manifestAbsolutePath, "utf8")} `);
  await expectRejected(context, "manifest SHA-256 sidecar mismatch");
}

{
  const secretFixture = "postgresql://secret-user:secret-password@example.test/private";
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = secretFixture;
  try {
    const context = await fixture();
    const manifestBytes = readFileSync(path.join(context.root, context.manifestPath), "utf8");
    assert.equal(manifestBytes.includes(secretFixture), false);
    assert.equal(manifestBytes.includes("secret-password"), false);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.metadata.productionArtifactEvidence.authToken = "not-recordable";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report contains prohibited secret-bearing fields");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.configFile = "/home/runner/substituted/playwright.config.ts";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report contains non-canonical or machine-local Playwright paths");
}

{
  const root = mkdtempSync(path.join(tmpdir(), "ch-0016-vercel-source-"));
  write(root, ".gitignore", "*.local.js\n");
  write(root, "tracked.js", "export const tracked = true;\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "CH-0016 test"]);
  git(root, ["config", "user.email", "ch-0016@example.test"]);
  git(root, ["add", ".gitignore", "tracked.js"]);
  git(root, ["commit", "-qm", "fixture"]);
  assert.equal((await inspectGitTree(root)).clean, true);
  write(root, "untracked.js", "export const untracked = true;\n");
  assert.equal((await inspectGitTree(root)).clean, false);
  rmSync(path.join(root, "untracked.js"));
  write(root, "next.config.local.js", "throw new Error('ignored');\n");
  const ignoredResult = await inspectGitTree(root);
  assert.equal(ignoredResult.clean, false);
  assert.deepEqual(ignoredResult.ignoredInfluentialFiles, ["next.config.local.js"]);
}

{
  const context = await fixture();
  const secretFixture = "fixture-report-secret-value";
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = secretFixture;
  try {
    const manifest = readManifest(context.root, context.manifestPath);
    const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
    report.config.metadata.productionArtifactEvidence.note = secretFixture;
    write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    manifest.tests[0].report.sha256 = "0".repeat(64);
    await writeProductionEvidenceManifest({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      manifest,
    });
    await expectRejected(context, "test report contains sensitive environment values");
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
}

assert.equal(PRODUCTION_EVIDENCE_SERVER_COMMAND, "npm run evidence:production:serve");
const playwrightConfiguration = readFileSync(
  path.join(process.cwd(), "playwright.config.ts"),
  "utf8",
);
assert.match(
  playwrightConfiguration,
  /command: productionArtifactEvidence[\s\S]{0,160}"npm run evidence:production:serve"[\s\S]{0,160}useProductionServer[\s\S]{0,100}"npm run start"[\s\S]{0,100}"npm run dev"/,
  "production artifact evidence must select its verified server before any dev fallback",
);
assert.match(
  playwrightConfiguration,
  /reuseExistingServer: productionArtifactEvidence \? false/,
  "production artifact evidence must never reuse an unrelated listener",
);
assert.match(
  playwrightConfiguration,
  /captureGitInfo:\s*\{\s*commit:\s*false,\s*diff:\s*false\s*\}/,
  "portable reports must not capture a source diff that can contain configured secrets",
);
const proVisualPlaywrightConfiguration = readFileSync(
  path.join(process.cwd(), "playwright.pro-visual.config.ts"),
  "utf8",
);
assert.match(
  proVisualPlaywrightConfiguration,
  /captureGitInfo:\s*\{\s*commit:\s*false,\s*diff:\s*false\s*\}/,
  "the required Pro visual report must not capture a secret-bearing CI diff",
);
const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
assert.equal(workflow.includes('CATALOG_STRICT_VALIDATION: "false"'), false);
assert.match(workflow, /npm run evidence:production:build/);
assert.match(workflow, /npm run evidence:production:smoke/);
assert.match(workflow, /npm run evidence:production:bundle/);
assert.match(workflow, /\.local\/production-artifact-evidence\/upload\//);
const vercelManifestSource = readFileSync(
  path.join(process.cwd(), "scripts/vercel-output-manifest.mjs"),
  "utf8",
);
assert.match(vercelManifestSource, /--untracked-files=all/);
assert.match(vercelManifestSource, /--ignored/);
assert.match(vercelManifestSource, /gitUntrackedFilesChecked: true/);
assert.match(vercelManifestSource, /gitIgnoredInfluentialFilesChecked: true/);
const nextConfiguration = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
for (const requiredExclusion of ["./.env*", "./.git/**/*", "./.local/**/*", "./.vercel/**/*", "./release-evidence-private/**/*"]) {
  assert.ok(
    nextConfiguration.includes(requiredExclusion),
    `missing traced-output exclusion ${requiredExclusion}`,
  );
}
const catalogRuntime = readFileSync(path.join(process.cwd(), "lib/catalog-runtime.ts"), "utf8");
const rootLayout = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
assert.match(catalogRuntime, /isProdLike \|\| process\.env\.CATALOG_STRICT_VALIDATION === "true"/);
assert.match(rootLayout, /validateCatalogOrThrow\(\)/);
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "ts-node",
    "--transpile-only",
    "--compiler-options",
    '{"module":"CommonJS","moduleResolution":"node"}',
    "-e",
    'import assert from "node:assert/strict"; import { CatalogValidator } from "./lib/catalog-validation"; const result = new CatalogValidator().validateCatalog({ invalid: { id: "invalid" } }); assert.equal(result.valid, false); assert.ok(result.summary.invalid > 0);',
  ],
  { cwd: process.cwd(), stdio: "pipe" },
);
console.log("CH-0016 production artifact evidence tests passed.");
