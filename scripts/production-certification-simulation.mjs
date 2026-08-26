import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProductionEvidenceManifest,
  executeProductionEvidenceChild,
  handoffProductionEvidenceSemanticJournal,
  initializeProductionEvidenceSemanticJournal,
  recoverProductionEvidenceFromSemanticJournal,
} from "./production-artifact-evidence.mjs";
import {
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
} from "./production-artifact-contract.mjs";
import {
  CERTIFICATION_HARNESS_SOURCE_PATHS,
  CERTIFICATION_STAGE_ORDER,
  PHASE8_SOURCE_BINDING_PATHS,
  PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  sha256Bytes,
  sourceValidationCheckSet,
} from "./production-certification-contract.mjs";
import {
  bindCertificationWorktreeDependencies,
  certificationStateSha256,
  completeCertificationStage,
  readCertificationState,
  sealCertificationState,
  startCertificationStage,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import { createCertificationResourcePlan } from "./production-certification-resource-plan.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  certificationWorktreeIssues,
} from "./production-certification-worktrees.mjs";
import {
  installCertificationWorktreeDependencies,
  readAndValidateCertificationDependencyBindingEvidence,
} from "./production-certification-dependencies.mjs";
import {
  captureArtifactSnapshot,
  measureFinalContinuity,
  rootEvidenceName,
  sealSourceValidationEvidence,
  snapshotEvidenceName,
  validateSourceValidationEvidence,
  validateContinuityEvidence,
} from "./production-certification-source-continuity.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
  validateProjectedEnvironmentMetadata,
} from "./production-certification-stage-environment.mjs";
import {
  RUNTIME_SMOKE_PHASE_BUDGETS,
  createRuntimeSmokePhaseRecorder,
  resolveRuntimeSmokeTimingDestination,
} from "./runtime-smoke-phase-budget.mjs";
import { validateRuntimeEvidence } from "./production-certification-evidence.mjs";
import {
  NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
  PRODUCTION_CERTIFICATION_BUILD_GENERATED_OUTPUT_SCHEMA,
  certificationBuildGeneratedOutputIssues,
  certificationFailedBuildGeneratedOutputIssues,
  finalizeCertificationBuildGeneratedOutput,
  preflightCertificationBuildGeneratedOutput,
} from "./production-certification-build-generated-output.mjs";
import {
  preflightRuntimeSmokeEvidenceOutputs,
  runBrowserOwnersStage,
  runBuildStage,
  runSourceValidationStage,
} from "./production-certification-real.mjs";
import {
  simulatedBrowserServerTrackedOutputLifecycle,
} from "./production-certification-browser-server-lifecycle.mjs";
import { validateCertificationStageOrderContracts } from "./production-certification-doctor.mjs";
import { validateCertificationResourcePreparation } from "./production-certification-resources.mjs";
import {
  runCertificationStageCommand,
} from "./production-certification-stage-result-consumer.mjs";
import {
  certificationStageResultContractIdentity,
  parseCertificationStageResult,
} from "./production-certification-stage-result-contract.mjs";
import {
  authFixtureRegressionCapabilityNames,
} from "./ci-auth-fixture-regression-environment.mjs";

const SIMULATION_ID = "production-certification-v1-simulation";
const FIXED_NONCE = "123e4567-e89b-42d3-a456-426614174001";
const FIXED_GIT_DATE = "2026-08-14T00:00:00Z";
const FIXED_STATE_BASE = Date.parse("2026-08-14T00:10:00.000Z");

function write(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

function copyRetainedEvidence(sourceRoot, targetRoot, descriptor) {
  write(targetRoot, descriptor.path, readFileSync(path.join(sourceRoot, descriptor.path)));
}

function stageOrderTamperRejected(repositoryRoot, relativePath, mutate) {
  const original = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const tampered = mutate(original);
  if (tampered === original) {
    throw new Error(`stage-order tamper did not change ${relativePath}`);
  }
  try {
    validateCertificationStageOrderContracts(repositoryRoot, {
      sourceOverrides: { [relativePath]: tampered },
    });
    return false;
  } catch {
    return true;
  }
}

function certificationStageOrderTamperCases(repositoryRoot) {
  const realRunner = "scripts/production-certification-real.mjs";
  const canonicalOwner = "scripts/production-certification-contract.mjs";
  return {
    missingRealRunnerImportRejected: stageOrderTamperRejected(
      repositoryRoot,
      realRunner,
      (source) => source.replace(/^  CERTIFICATION_STAGE_ORDER,\n/m, ""),
    ),
    copiedStageListRejected: stageOrderTamperRejected(
      repositoryRoot,
      realRunner,
      (source) =>
        `${source}\nconst COPIED_CERTIFICATION_STAGES = Object.freeze([\n${CERTIFICATION_STAGE_ORDER.map(
          (stage) => `  ${JSON.stringify(stage)},`,
        ).join("\n")}\n]);\n`,
    ),
    reorderedStageListRejected: stageOrderTamperRejected(
      repositoryRoot,
      canonicalOwner,
      (source) =>
        source.replace(
          '  "doctor",\n  "source-validation",',
          '  "source-validation",\n  "doctor",',
        ),
    ),
    omittedStageRejected: stageOrderTamperRejected(
      repositoryRoot,
      canonicalOwner,
      (source) => source.replace('  "continuity",\n', ""),
    ),
    unknownStageRejected: stageOrderTamperRejected(
      repositoryRoot,
      realRunner,
      (source) =>
        source.replace(
          'bindDatabaseForStage(\n    context,\n    "source-validation",',
          'bindDatabaseForStage(\n    context,\n    "unknown-stage",',
        ),
    ),
    duplicateStageRejected: stageOrderTamperRejected(
      repositoryRoot,
      canonicalOwner,
      (source) => source.replace('  "doctor",\n', '  "doctor",\n  "doctor",\n'),
    ),
  };
}

function run(command, args, cwd, environment = process.env) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: "utf8" });
  if (result.status !== 0 || result.signal) {
    throw new Error(
      `${command} simulation child failed: ${String(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

function git(root, args) {
  return run("git", args, root, {
    ...process.env,
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
  });
}

function simulationClock() {
  let tick = 0;
  const base = Date.parse("2026-08-14T00:00:00.000Z");
  return () => new Date(base + tick++ * 100).toISOString();
}

function stateClock() {
  let tick = 0;
  return () => new Date(FIXED_STATE_BASE + tick++ * 100).toISOString();
}

function copyHarnessSources(repositoryRoot, fixtureRoot) {
  const paths = new Set([
    ...CERTIFICATION_HARNESS_SOURCE_PATHS,
    ...PHASE8_SOURCE_BINDING_PATHS,
    "scripts/production-verifier-closure.mjs",
    "scripts/required-test-playwright.mjs",
    "scripts/run-phase8-project-benchmark.ts",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/runtime-smoke-failure-evidence.mjs",
    "scripts/runtime-smoke-operation-contracts.mjs",
    "scripts/runtime-smoke-operation-deadline.mjs",
    "scripts/runtime-smoke-telemetry-bootstrap-contract.mjs",
  ]);
  for (const relativePath of run(
    "git",
    ["ls-files", "--", "prisma/migrations"],
    repositoryRoot,
  )
    .split("\n")
    .filter(Boolean)) {
    paths.add(relativePath);
  }
  for (const relativePath of [...paths].filter(
    (relativePath) => !new Set(["package.json", "package-lock.json"]).has(relativePath),
  )) {
    write(fixtureRoot, relativePath, readFileSync(path.join(repositoryRoot, relativePath)));
  }
}

function writeFloorPlanNfts(root) {
  const targets = [
    ".next/server/app/api/admin/floor-plan-imports/[id]/construction-sources/route.js",
    ".next/server/app/api/admin/floor-plan-imports/[id]/supplementary-sources/route.js",
    ".next/server/app/api/floor-plan-imports/[id]/process/route.js",
  ];
  for (const routePath of targets) {
    write(root, routePath, "export const route = 'simulation';\n");
    const nftPath = `${routePath}.nft.json`;
    const publicPath = "public/assets/floor-plans/preview.webp";
    write(
      root,
      nftPath,
      `${JSON.stringify({
        version: 1,
        files: [
          path.basename(routePath),
          path.relative(path.dirname(nftPath), publicPath).split(path.sep).join("/"),
        ],
      })}\n`,
    );
  }
}

function writeMiniatureArtifact(root) {
  write(root, ".next/BUILD_ID", "simulation-build-001\n");
  write(root, ".next/build-manifest.json", "{}\n");
  write(root, ".next/routes-manifest.json", "{}\n");
  write(root, ".next/prerender-manifest.json", "{}\n");
  write(
    root,
    ".next/required-server-files.json",
    `${JSON.stringify({ version: 1, files: ["package.json"] })}\n`,
  );
  write(root, ".next/static/chunk.js", "simulation static chunk\n");
  write(root, ".next/server/app.js", "simulation server output\n");
  write(
    root,
    ".next/server/app.js.nft.json",
    `${JSON.stringify({ version: 1, files: ["app.js", "../../package.json"] })}\n`,
  );
  writeFloorPlanNfts(root);
  symlinkSync("../../public/asset.txt", path.join(root, ".next/server/public-link"));
}

export function initializeFixture(repositoryRoot, fixtureRoot) {
  const npmVersion = run("npm", ["--version"], repositoryRoot);
  write(
    fixtureRoot,
    ".gitignore",
    ".env\n.env.local\n.next/\n.local/\n.vercel/\nnode_modules/\nnext-env.d.ts\n*.tsbuildinfo\ntest-results/\nplaywright-report/\nfinal-component\n",
  );
  write(
    fixtureRoot,
    "package.json",
    `${JSON.stringify({
      name: "production-certification-simulation",
      version: "1.0.0",
      private: true,
      packageManager: `npm@${npmVersion}`,
      scripts: {
        build: "node scripts/production-certification-simulation.mjs fixture-build",
        "ci:auth-fixture:export":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts export-github-env",
        "ci:auth-fixture:validate":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts validate-env",
        "ci:auth-fixture:validate-existing":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts validate-existing",
        "ci:auth-fixture:production-misuse":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts production-misuse",
        "ci:auth-fixture:production-misuse-existing":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts production-misuse-existing",
        "ci:auth-fixture:preflight":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts preflight",
        "ci:auth-fixture:preflight-existing":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts preflight-existing",
        "test:advisory-auth-preflight":
          "node simulation-ts-node/bin.js scripts/ci-auth-fixture.ts preflight-local",
        "test:ci-auth-fixture-real-preflight":
          "node scripts/run-ci-auth-fixture-session.mjs",
        "certification:auth-preflight":
          "node scripts/run-ci-auth-fixture-session.mjs",
        "certification:auth-session-preflight":
          "node scripts/run-ci-auth-fixture-real-preflight.mjs",
        "test:production-certification-auth-preflight-database":
          "node scripts/test-production-certification-auth-preflight-database.mjs",
        "ci:auth-fixture:result:validate":
          "node scripts/ci-auth-fixture-result-contract.cjs validate",
        "test:ci-auth-fixture-results":
          "npx ts-node scripts/test-ci-auth-fixture-results.ts",
        "test:ci-auth-fixture-session":
          "node scripts/test-ci-auth-fixture-session.mjs",
        "test:production-certification-stage-result":
          "node scripts/test-production-certification-stage-result.mjs",
        "test:production-certification-state-init-transaction":
          "node scripts/test-production-certification-state-init-transaction.mjs",
        "certification:stage-result:validate":
          "node scripts/production-certification-stage-result-consumer.mjs validate",
      },
      dependencies: {
        "simulation-fixture": "file:simulation-fixture-1.0.0.tgz",
        "ts-node": "file:ts-node-0.0.0.tgz",
      },
    }, null, 2)}\n`,
  );
  write(
    fixtureRoot,
    "simulation-fixture/package.json",
    '{"name":"simulation-fixture","version":"1.0.0","main":"index.js"}\n',
  );
  write(
    fixtureRoot,
    "simulation-fixture/index.js",
    "module.exports = 'simulation-fixture';\n",
  );
  write(
    fixtureRoot,
    "simulation-ts-node/package.json",
    `${JSON.stringify({
      name: "ts-node",
      version: "0.0.0",
      bin: { "ts-node": "bin.js" },
    })}\n`,
  );
  write(
    fixtureRoot,
    "simulation-ts-node/bin.js",
    `#!/usr/bin/env node
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const rawArguments = process.argv.slice(2);
const scriptIndex = rawArguments.findIndex((argument) => argument.endsWith(".ts"));
if (scriptIndex === -1) {
  console.error("deterministic simulation ts-node requires an explicit TypeScript entrypoint");
  process.exit(1);
}
const script = rawArguments[scriptIndex];
const args = rawArguments.slice(scriptIndex + 1);
if (path.basename(script) === "generate-surface-material-runtime.ts") {
  process.exit(0);
}
require(path.join(process.cwd(), "scripts", "simulation-ts-loader.cjs"));
process.argv = [process.execPath, path.resolve(script), ...args];
import(pathToFileURL(process.argv[1]).href)
  .then((module) => module.__simulationMain())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
`,
  );
  chmodSync(path.join(fixtureRoot, "simulation-ts-node/bin.js"), 0o755);
  const npmEnvironment = {
    ...process.env,
    NODE_OPTIONS: "",
    NODE_PATH: "",
    NPM_CONFIG_CACHE: path.join(path.dirname(fixtureRoot), "npm-cache"),
  };
  run(
    "npm",
    ["pack", "./simulation-fixture", "--pack-destination", "."],
    fixtureRoot,
    npmEnvironment,
  );
  run(
    "npm",
    ["pack", "./simulation-ts-node", "--pack-destination", "."],
    fixtureRoot,
    npmEnvironment,
  );
  run(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts"],
    fixtureRoot,
    npmEnvironment,
  );
  write(fixtureRoot, ".nvmrc", `${process.version.slice(1)}\n`);
  copyHarnessSources(repositoryRoot, fixtureRoot);
  const authResultRegressionSource = readFileSync(
    path.join(repositoryRoot, "scripts/test-ci-auth-fixture-results.ts"),
    "utf8",
  );
  const simulationAuthResultRegressionSource = authResultRegressionSource.replace(
    `run()
  .finally(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
`,
    `export function __simulationMain() {
  return run().finally(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });
}
`,
  );
  if (simulationAuthResultRegressionSource === authResultRegressionSource) {
    throw new Error(
      "deterministic simulation auth-result regression entrypoint was not rewritten",
    );
  }
  write(
    fixtureRoot,
    "scripts/test-ci-auth-fixture-results.ts",
    simulationAuthResultRegressionSource,
  );
  write(
    fixtureRoot,
    "scripts/simulation-ts-loader.cjs",
    `const { readFileSync } = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { registerHooks, stripTypeScriptTypes } = require("node:module");

function stripTypes(source) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = () => {};
  try {
    return stripTypeScriptTypes(source, { mode: "strip" });
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        path.extname(specifier) === ""
      ) {
        return nextResolve(specifier + ".ts", context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      return {
        format: "module",
        source: stripTypes(readFileSync(fileURLToPath(url), "utf8")),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
`,
  );
  write(
    fixtureRoot,
    "scripts/simulation-tsconfig-paths-register.cjs",
    "// Deterministic simulation fixture: relative TypeScript resolution is owned by simulation-ts-loader.cjs.\n",
  );
  const simulationAuthFixtureSource = `import { createRequire as createSimulationRequire } from "node:module";
const require = createSimulationRequire(import.meta.url);
${readFileSync(
    path.join(repositoryRoot, "scripts/ci-auth-fixture.ts"),
    "utf8",
  )}`
    .replace(
      'require.resolve("ts-node/register/transpile-only")',
      'path.join(process.cwd(), "scripts", "simulation-ts-loader.cjs")',
    )
    .replace(
      'require.resolve("tsconfig-paths/register")',
      'path.join(process.cwd(), "scripts", "simulation-tsconfig-paths-register.cjs")',
    )
    .replace(
      "if (require.main === module) {",
      'if (process.argv[2] === "production-misuse-child") {',
    );
  write(
    fixtureRoot,
    "scripts/ci-auth-fixture.ts",
    `${simulationAuthFixtureSource}\nexport { main as __simulationMain };\n`,
  );
  write(fixtureRoot, "public/asset.txt", "deterministic simulation asset\n");
  write(fixtureRoot, "public/assets/floor-plans/preview.webp", "simulation preview\n");
  git(fixtureRoot, ["init", "-q"]);
  git(fixtureRoot, ["config", "user.name", "Certification simulation"]);
  git(fixtureRoot, ["config", "user.email", "simulation@example.test"]);
  git(fixtureRoot, ["commit", "--allow-empty", "-qm", "simulation integration base"]);
  const integrationCommitSha = git(fixtureRoot, ["rev-parse", "HEAD"]);
  const integrationTreeSha = git(fixtureRoot, ["rev-parse", "HEAD^{tree}"]);
  git(fixtureRoot, ["add", "."]);
  git(fixtureRoot, ["commit", "-qm", "deterministic certification fixture"]);
  git(fixtureRoot, ["update-ref", "refs/heads/integration", integrationCommitSha]);
  git(fixtureRoot, [
    "update-ref",
    "refs/remotes/origin/integration",
    integrationCommitSha,
  ]);
  return {
    npmVersion,
    commitSha: git(fixtureRoot, ["rev-parse", "HEAD"]),
    treeSha: git(fixtureRoot, ["rev-parse", "HEAD^{tree}"]),
    parentSha: git(fixtureRoot, ["rev-parse", "HEAD^"]),
    integrationCommitSha,
    integrationTreeSha,
  };
}

function simulationEnvironment(identity) {
  return {
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NODE_ENV: "production",
    CATALOG_STRICT_VALIDATION: "true",
    DATABASE_URL:
      "postgresql://simulation:9d3b7e1c5a8f2046d9b3e7c1a5f80246@127.0.0.1:5432/simulation",
    FLOOR_PLAN_LOCAL_OCR_DISABLED: "1",
    FLOOR_PLAN_VISION_DISABLED: "1",
    FLOOR_PLAN_VISION_ENABLED: "1",
    FLOOR_PLAN_VISION_MODEL: "simulation-floor-plan-model",
    OPENAI_API_KEY: "simulation-openai-placeholder",
    SHOPIFY_STORE_DOMAIN: "simulation.myshopify.example",
    SHOPIFY_STOREFRONT_TOKEN: "simulation-shopify-placeholder",
    POSTHOG_KEY: "simulation-posthog-placeholder",
    STRIPE_SECRET_KEY: "sk_test_simulation_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_simulation_placeholder",
    STRIPE_PRICE_PRO_MONTHLY: "price_simulation_monthly",
    STRIPE_PRICE_PRO_YEARLY: "price_simulation_yearly",
    AUTH_SECRET: "simulation-auth-secret-at-least-32-characters",
    GOOGLE_CLIENT_ID: "simulation.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "GOCSPX-simulation-placeholder",
    APP_ORIGIN: "http://127.0.0.1:3000",
    ADMIN_EMAILS: "simulation-admin@example.test",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: SIMULATION_ID,
    CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
    CERTIFICATION_EXPECTED_COMMIT_SHA: identity.commitSha,
    CERTIFICATION_EXPECTED_TREE_SHA: identity.treeSha,
    CERTIFICATION_EXPECTED_PARENT_SHA: identity.parentSha,
  };
}

async function emitProductionEvidence(fixtureRoot, identity, environment) {
  const clock = simulationClock();
  const toolchain = { nodeVersion: process.version, npmVersion: identity.npmVersion };
  const source = { commitSha: identity.commitSha, treeSha: identity.treeSha };
  const journal = await initializeProductionEvidenceSemanticJournal({
    repositoryRoot: fixtureRoot,
    candidateIdentifier: SIMULATION_ID,
    source,
    buildContract: { applicationEnvironment: "staging", catalogStrictValidation: true },
    toolchain,
    nonce: FIXED_NONCE,
    clock,
  });
  executeProductionEvidenceChild({
    repositoryRoot: fixtureRoot,
    expectedRunNonce: journal.runNonce,
    action: "install",
    dispatch: () => ({ status: 0, signal: null }),
    clock,
  });
  const completingProcess = {
    pid: process.pid + 100000,
    parentPid: process.pid,
  };
  handoffProductionEvidenceSemanticJournal({
    repositoryRoot: fixtureRoot,
    expectedRunNonce: journal.runNonce,
    expectedOwnerProcess: journal.owner.process,
    nextOwnerProcess: completingProcess,
    clock,
  });
  for (const action of ["generatedSourceCheck", "build"]) {
    executeProductionEvidenceChild({
      repositoryRoot: fixtureRoot,
      expectedRunNonce: journal.runNonce,
      action,
      processIdentity: completingProcess,
      dispatch: () => ({ status: 0, signal: null }),
      clock,
    });
  }
  const result = await recoverProductionEvidenceFromSemanticJournal({
    repositoryRoot: fixtureRoot,
    expectedRunNonce: journal.runNonce,
    environment,
    toolchain,
    clock,
    manifestFactory: async (options) => ({
      ...(await createProductionEvidenceManifest(options)),
      certificationSimulation: {
        deterministic: true,
        acceptedForRealCandidate: false,
      },
    }),
  });
  const manifestPath = path.join(
    fixtureRoot,
    ".local/production-artifact-evidence/manifest.json",
  );
  const journalPath = path.join(
    fixtureRoot,
    ".local/production-artifact-evidence/semantic-event-journal.json",
  );
  return {
    manifest: result.manifest,
    manifestSha256: sha256Bytes(readFileSync(manifestPath)),
    journalSha256: sha256Bytes(readFileSync(journalPath)),
  };
}

function identityFromState(state) {
  return {
    certificationId: state.certificationId,
    candidateId: state.candidate.id,
    commitSha: state.candidate.commitSha,
    treeSha: state.candidate.treeSha,
    parentSha: state.candidate.parentSha,
    nextBuildId: state.bindings.nextBuildId,
    artifactSha256: state.bindings.artifactSha256,
    harnessVersion: state.harness.version,
    harnessSourceSha256: state.harness.sourceSha256,
  };
}

function runtimeArtifactIdentity(state) {
  return {
    candidateIdentifier: state.candidate.id,
    sourceCommitSha: state.candidate.commitSha,
    sourceTreeSha: state.candidate.treeSha,
    artifactSha256: state.bindings.artifactSha256,
    nextBuildId: state.bindings.nextBuildId,
    runNonce: state.bindings.semanticJournalNonce,
    semanticJournalSchema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
    semanticJournalVersion: PRODUCTION_EVIDENCE_JOURNAL_VERSION,
    serverCommand: "npm run evidence:production:serve",
    buildMode: "production",
  };
}

function simulatedRuntimePlaywrightReport(state) {
  const runtimeFile = "00-runtime-smoke.spec.ts";
  const result = {
    status: "passed",
    retry: 0,
    annotations: [],
  };
  return {
    config: {
      configFile: "<repository-root>/playwright.config.ts",
      rootDir: "<repository-root>/tests/e2e",
      forbidOnly: true,
      grep: {},
      grepInvert: null,
      shard: null,
      projects: [
        {
          name: "chromium",
          retries: 0,
          repeatEach: 1,
          outputDir: path.join(
            "<repository-root>",
            ".local/production-artifact-evidence/playwright-output",
          ),
          testDir: "<repository-root>/tests/e2e",
          snapshotDir: null,
        },
      ],
      webServer: {
        command: "npm run evidence:production:serve",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
      },
      metadata: {
        productionArtifactEvidence: runtimeArtifactIdentity(state),
      },
    },
    suites: [
      {
        title: runtimeFile,
        file: runtimeFile,
        specs: [
          {
            title: "furnished template remains stable without a render loop",
            file: runtimeFile,
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [result],
              },
            ],
          },
          {
            title: "health and catalog endpoints report ready",
            file: runtimeFile,
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [result],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
    stats: {
      startTime: "2026-08-14T00:20:00.000Z",
      duration: 400,
      expected: 2,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  };
}

function descriptor(evidenceRoot, filePath) {
  return {
    path: path.relative(evidenceRoot, filePath).split(path.sep).join("/"),
    sha256: sha256Bytes(readFileSync(filePath)),
  };
}

function writeEvidence(evidenceRoot, relativePath, value) {
  const filePath = path.join(evidenceRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, canonicalJsonBytes(value), { flag: "wx", mode: 0o600 });
  return descriptor(evidenceRoot, filePath);
}

let simulationStageRequestNumber = 0;

function runStateTransitionCli({ fixtureRoot, evidenceRoot, statePath, action, payload }) {
  simulationStageRequestNumber += 1;
  const requestPath = path.join(
    evidenceRoot,
    "simulation-stage-requests",
    `${String(simulationStageRequestNumber).padStart(3, "0")}-${action}.json`,
  );
  write(
    evidenceRoot,
    path.relative(evidenceRoot, requestPath),
    canonicalJsonBytes(payload),
  );
  run(
    process.execPath,
    ["scripts/production-certification-simulation.mjs", `state:${action}`],
    fixtureRoot,
    projectCertificationChildEnvironment({
      repositoryRoot: fixtureRoot,
      baseEnvironment: process.env,
      stage: "simulation",
      profileId: "simulation-control",
      stageInputs: {
        CERTIFICATION_ENVIRONMENT_STAGE: "simulation",
        CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
        CERTIFICATION_QUALIFICATION_MODE: "1",
        PRODUCTION_CERTIFICATION_STATE: statePath,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        CERTIFICATION_SIMULATION_STAGE_REQUEST: requestPath,
      },
    }).environment,
  );
  return readCertificationState(statePath);
}

function startSimulationStage(options) {
  return runStateTransitionCli({ ...options, action: "start" });
}

function completeSimulationStage(options) {
  return runStateTransitionCli({ ...options, action: "complete" });
}

function installAndBindSimulationRole({
  canonicalRoot,
  repositoryRoot,
  evidenceRoot,
  statePath,
  state,
  role,
  stage,
}) {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  environment.NPM_CONFIG_CACHE = path.join(path.dirname(canonicalRoot), "npm-cache");
  const installation = installCertificationWorktreeDependencies({
    repositoryRoot,
    evidenceRoot,
    state,
    role,
    environment,
    attemptNumber: state.stages[stage].attempts.at(-1)?.number ?? 1,
  });
  if (!installation.passed) {
    throw new Error(`simulation dependency installation failed: ${role}`);
  }
  return bindCertificationWorktreeDependencies({
    statePath,
    expectedCurrentSha256: sha256Bytes(readFileSync(statePath)),
    evidenceRoot,
    canonicalRoot,
    role,
    dependencyBindingEvidence: installation.bindingEvidenceDescriptor,
  }).state;
}

function revalidateSimulationRoleDependencies({
  repositoryRoot,
  evidenceRoot,
  state,
  role,
  boundary,
}) {
  const binding = state.worktrees.roles[role];
  const retained = readAndValidateCertificationDependencyBindingEvidence({
    evidenceRoot,
    descriptor: binding.dependencyBindingEvidence,
    state,
    role,
    repositoryRoot,
    remeasure: true,
  });
  if (!retained.validation.valid) {
    throw new Error(
      `${role} simulation dependency drift at ${boundary}: ${retained.validation.issues.join("; ")}`,
    );
  }
  return {
    role,
    boundary,
    dependencyIdentitySha256: retained.evidence.dependencyIdentitySha256,
    bindingEvidenceSha256: binding.dependencyBindingEvidence.sha256,
    dependencyInventorySha256: retained.evidence.dependencyInventory.sha256,
    nodeModulesRootIdentitySha256:
      retained.evidence.physicalNodeModulesProof.nodeModulesRootIdentitySha256,
    nodeModulesFilesystemIdentitySha256:
      retained.evidence.physicalNodeModulesProof
        .nodeModulesFilesystemIdentitySha256,
    passed: true,
  };
}

function dependencyInstallationAttemptCount(evidenceRoot, role) {
  const root = path.join(evidenceRoot, "worktree-dependencies", role);
  return existsSync(root)
    ? readdirSync(root).filter((name) => /^attempt-\d{3}$/.test(name)).length
    : 0;
}

function phase8Evidence(state, fixtureRoot, rawEvidenceSha256) {
  const projectBudgets = JSON.parse(
    readFileSync(path.join(fixtureRoot, "config/phase8-performance-budgets.json"), "utf8"),
  ).projectBenchmarks;
  const measurements = ["small", "medium", "large"].map((scale) => {
    const count = { small: 160, medium: 80, large: 30 }[scale];
    return {
      scale,
      maxSerializedBytes: projectBudgets[scale].maxSerializedBytes,
      fixture: { serializedBytes: 100 },
      serializedSizePassed: true,
      operations: ["fingerprintCold", "fingerprintCached", "save", "load"].map(
        (operation) => {
          const value = 0.01;
          const samplesMs = Array.from({ length: count }, () => value);
          return {
            operation,
            samplesMs,
            samplesSha256: sha256Bytes(JSON.stringify(samplesMs)),
            p50Ms: value,
            p95Ms: value,
            maxMs: value,
            thresholdMs: projectBudgets[scale].maxP95Ms[operation],
            passed: true,
          };
        },
      ),
    };
  });
  return {
    schema: PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
    identity: identityFromState(state),
    executionClass: "deterministic-simulation",
    simulation: true,
    rawEvidenceSha256,
    sourceBindings: PHASE8_SOURCE_BINDING_PATHS.map((sourcePath) => ({
      path: sourcePath,
      sha256: sha256Bytes(readFileSync(path.join(fixtureRoot, sourcePath))),
    })),
    childCalculatedPassed: true,
    parentValidatedPassed: true,
    measurements,
    budgets: { project: "passed", bundle: "passed", runtime: "passed", boundary: "passed" },
    contradictions: [],
    complete: true,
  };
}

function runtimeEvidence(
  state,
  reportSha256,
  phaseTimingsSha256,
  phaseTimings,
  stageEnvironment,
) {
  return {
    schema: PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
    identity: identityFromState(state),
    journalIdentity: {
      schema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
      version: PRODUCTION_EVIDENCE_JOURNAL_VERSION,
      sha256: state.bindings.semanticJournalSha256,
      runNonce: state.bindings.semanticJournalNonce,
    },
    executionClass: "deterministic-simulation",
    simulation: true,
    reportSha256,
    phaseTimingsSha256,
    phaseTimings: {
      sha256: phaseTimingsSha256,
      complete: phaseTimings.complete,
      completionMarker: phaseTimings.evidenceBinding.completionMarker,
      rootContract: phaseTimings.evidenceBinding.rootContract,
      identity: phaseTimings.evidenceBinding.identity,
    },
    stageEnvironment: {
      profileId: stageEnvironment.profileId,
      profileSha256: stageEnvironment.profileSha256,
      contractSchema: stageEnvironment.contractSchema,
      contractSha256: stageEnvironment.contractSha256,
      environmentNames: stageEnvironment.environmentNames,
      environmentNamesSha256: stageEnvironment.environmentNamesSha256,
      allowedVariableNamesSha256: stageEnvironment.allowedVariableNamesSha256,
      requiredVariableNamesSha256: stageEnvironment.requiredVariableNamesSha256,
    },
    stats: { expected: 2, passed: 2, unexpected: 0, skipped: 0, flaky: 0, retries: 0 },
    tests: [
      { id: "runtime.template-stability", outcome: "passed", retries: 0, skipped: false },
      { id: "runtime.health-catalog-ready", outcome: "passed", retries: 0, skipped: false },
    ],
    telemetryProvenance: ["initial", "reload-1", "reload-2", "reload-3"].map(
      (realm, index) => ({ realm, activationGeneration: index + 1, valid: true }),
    ),
    complete: true,
  };
}

function browserEvidence(state, owner, gate, reportSha256) {
  const tests = gate.requiredTests.flatMap((test) =>
    gate.requiredProjects.map((project) => ({
      id: test.id,
      file: test.file,
      title: test.title,
      project,
      outcome: "passed",
      retries: 0,
      skipped: false,
    })),
  );
  return {
    schema: PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA,
    ownerId: owner.id,
    gateId: owner.gateId,
    identity: identityFromState(state),
    executionClass: "deterministic-simulation",
    simulation: true,
    reportSha256,
    stats: { passed: tests.length, unexpected: 0, skipped: 0, flaky: 0, retries: 0 },
    tests,
    complete: true,
  };
}

export async function runProductionCertificationSimulation({
  cleanupWorktrees = true,
} = {}) {
  const repositoryRoot = process.cwd();
  const stageResultRegression = run(
    process.execPath,
    ["scripts/test-production-certification-stage-result.mjs"],
    repositoryRoot,
  );
  const stageResultRegressionLine = stageResultRegression
    .split("\n")
    .find((line) =>
      line.startsWith("CERTIFICATION_STAGE_RESULT_REGRESSION_RESULT "),
    );
  if (!stageResultRegressionLine) {
    throw new Error("certification stage-result regression result is missing");
  }
  const stageResultRegressionValue = JSON.parse(
    stageResultRegressionLine.slice(
      "CERTIFICATION_STAGE_RESULT_REGRESSION_RESULT ".length,
    ),
  );
  const authResultRegression = run(
    "npm",
    ["run", "test:ci-auth-fixture-results"],
    repositoryRoot,
  );
  const authFixtureSessionRegression = run(
    "npm",
    ["run", "test:ci-auth-fixture-session"],
    repositoryRoot,
  );
  const authFixtureSessionIsolationLine = authFixtureSessionRegression
    .split("\n")
    .find((line) =>
      line.startsWith(
        "CI_AUTH_FIXTURE_NESTED_ISOLATION_REGRESSION_RESULT ",
      ),
    );
  if (!authFixtureSessionIsolationLine) {
    throw new Error("nested auth fixture isolation regression result is missing");
  }
  const authFixtureSessionIsolation = JSON.parse(
    authFixtureSessionIsolationLine.slice(
      "CI_AUTH_FIXTURE_NESTED_ISOLATION_REGRESSION_RESULT ".length,
    ),
  );
  if (
    authFixtureSessionIsolation.schema !==
      "interior-ai.ci-auth-fixture-nested-isolation-regression.v1" ||
    authFixtureSessionIsolation.selectedOwner !== "nested-regression-child" ||
    authFixtureSessionIsolation.historicalConflict !== "GOOGLE_CLIENT_ID" ||
    authFixtureSessionIsolation.historicalContaminationRejected !== true ||
    authFixtureSessionIsolation.isolatedChildPassed !== true ||
    authFixtureSessionIsolation.parentEnvironmentUnchanged !== true ||
    authFixtureSessionIsolation.outerSessionPreserved !== true ||
    authFixtureSessionIsolation.outerResourcesPreserved !== true ||
    authFixtureSessionIsolation.nestedResourcesCleaned !== true ||
    authFixtureSessionIsolation.rawProviderValuesRecorded !== false
  ) {
    throw new Error("nested auth fixture isolation regression is incomplete");
  }
  run(
    process.execPath,
    ["scripts/test-production-certification-source-generated-outputs.mjs"],
    repositoryRoot,
  );
  run(
    process.execPath,
    ["scripts/test-production-certification-database-lifecycle.mjs", "--contract-only"],
    repositoryRoot,
  );
  const authPreflightDatabaseRegression = run(
    process.execPath,
    ["scripts/test-production-certification-auth-preflight-database.mjs"],
    repositoryRoot,
  );
  const authPreflightDatabaseRegressionLine =
    authPreflightDatabaseRegression
      .split("\n")
      .find((line) =>
        line.startsWith("AUTH_PREFLIGHT_DATABASE_REGRESSION_RESULT "),
      );
  if (!authPreflightDatabaseRegressionLine) {
    throw new Error("auth-preflight database regression result is missing");
  }
  const authPreflightDatabaseRegressionResult = JSON.parse(
    authPreflightDatabaseRegressionLine.slice(
      "AUTH_PREFLIGHT_DATABASE_REGRESSION_RESULT ".length,
    ),
  );
  const certificationRegressions = JSON.parse(
    readFileSync(
      path.join(
        repositoryRoot,
        "scripts/production-certification-regressions.json",
      ),
      "utf8",
    ),
  );
  const expectedAuthPreflightDatabaseCases =
    certificationRegressions.authPreflightDatabaseCases;
  const expectedNestedAuthFixtureIsolationCases =
    certificationRegressions.nestedAuthFixtureIsolationCases;
  const expectedNestedAuthFixtureCapabilityNames =
    authFixtureRegressionCapabilityNames(repositoryRoot);
  if (
    authPreflightDatabaseRegressionResult.schema !==
      "interior-ai.production-certification-auth-preflight-database-regression.v1" ||
    authPreflightDatabaseRegressionResult.passed !== true ||
    JSON.stringify(authPreflightDatabaseRegressionResult.passedCases) !==
      JSON.stringify(expectedAuthPreflightDatabaseCases)
  ) {
    throw new Error("auth-preflight database regression matrix is incomplete");
  }
  if (
    JSON.stringify(authFixtureSessionIsolation.negativeCases) !==
      JSON.stringify(expectedNestedAuthFixtureIsolationCases) ||
    JSON.stringify(authFixtureSessionIsolation.capabilityNames) !==
      JSON.stringify(expectedNestedAuthFixtureCapabilityNames)
  ) {
    throw new Error(
      "nested auth fixture isolation did not execute its canonical case and capability matrices",
    );
  }
  const sourceDatabaseProjectionRegression = run(
    process.execPath,
    ["scripts/test-production-certification-source-database-projection.mjs"],
    repositoryRoot,
  );
  const simulationRoot = mkdtempSync(path.join(tmpdir(), "production-certification-v1-"));
  const canonicalRoot = path.join(simulationRoot, "source");
  let fixtureRoot = canonicalRoot;
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const worktreeOwnerRoot = path.join(simulationRoot, "stage-worktrees");
  mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(worktreeOwnerRoot, { recursive: true, mode: 0o700 });
  const identity = initializeFixture(repositoryRoot, fixtureRoot);
  const stageOrderContracts = validateCertificationStageOrderContracts(fixtureRoot);
  const stageOrderTamperCases = certificationStageOrderTamperCases(fixtureRoot);
  if (Object.values(stageOrderTamperCases).some((rejected) => rejected !== true)) {
    throw new Error("certification stage-order tamper matrix did not fail closed");
  }
  const externalFinalComponent = path.join(simulationRoot, "external-final-component");
  write(fixtureRoot, ".env", "canonical-user-env\n");
  write(fixtureRoot, ".env.local", "canonical-user-local-env\n");
  write(fixtureRoot, ".local/user-evidence.txt", "canonical-user-evidence\n");
  write(fixtureRoot, ".next/user-artifact.txt", "canonical-user-artifact\n");
  write(fixtureRoot, "next-env.d.ts", "canonical-user-next-env\n");
  write(fixtureRoot, ".vercel/project.json", "{\"user\":true}\n");
  write(fixtureRoot, "test-results/user-output.txt", "canonical-user-output\n");
  write(externalFinalComponent, "component.txt", "external-user-component\n");
  symlinkSync(externalFinalComponent, path.join(fixtureRoot, "final-component"));
  const canonicalIgnoredSnapshot = Object.fromEntries(
    [
      ".env",
      ".env.local",
      ".local/user-evidence.txt",
      ".next/user-artifact.txt",
      "next-env.d.ts",
      ".vercel/project.json",
      "test-results/user-output.txt",
    ].map((relativePath) => [
      relativePath,
      sha256Bytes(readFileSync(path.join(fixtureRoot, relativePath))),
    ]),
  );
  const finalComponentTarget = realpathSync(path.join(fixtureRoot, "final-component"));
  const environment = simulationEnvironment(identity);
  const nextTimestamp = stateClock();
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const doctorEnvironment = {
    ...process.env,
    ...environment,
    NPM_CONFIG_CACHE: path.join(simulationRoot, "npm-cache"),
    PRODUCTION_CERTIFICATION_ID: SIMULATION_ID,
    PRODUCTION_CERTIFICATION_STATE: statePath,
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    CERTIFICATION_WORKTREE_ROOT: worktreeOwnerRoot,
    PHASE8_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
    CERTIFICATION_QUALIFICATION_MODE: "1",
    CERTIFICATION_CREATED_AT: nextTimestamp(),
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
      "phase8-target/evidence.json",
    ),
  };
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    doctorEnvironment[
      `CERTIFICATION_BROWSER_${owner.id.toUpperCase().replaceAll("-", "_")}_REPORT_PATH`
    ] = path.join(evidenceRoot, "browser-targets", owner.id, "playwright.json");
  }
  createCertificationResourcePlan({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    environment: doctorEnvironment,
  });
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "state:init"],
    fixtureRoot,
    doctorEnvironment,
  );
  const sourceWorktreeRoot = path.join(
    worktreeOwnerRoot,
    SIMULATION_ID,
    "source-validation",
  );
  const artifactWorktreeRoot = path.join(
    worktreeOwnerRoot,
    SIMULATION_ID,
    "final-artifact",
  );
  const developmentWorktreeRoot = path.join(
    worktreeOwnerRoot,
    SIMULATION_ID,
    "development-browser",
  );
  for (const root of [
    sourceWorktreeRoot,
    artifactWorktreeRoot,
    developmentWorktreeRoot,
  ]) {
    if (!existsSync(root) || realpathSync(root) === realpathSync(canonicalRoot)) {
      throw new Error("simulation did not create three distinct detached stage worktrees");
    }
  }
  const missingParentDoctorEnvironment = {
    ...doctorEnvironment,
    CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
    CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
  };
  const missingParentDoctor = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "doctor"],
    {
      cwd: canonicalRoot,
      env: missingParentDoctorEnvironment,
      encoding: "utf8",
    },
  );
  let missingParentDoctorResult = null;
  try {
    missingParentDoctorResult = parseCertificationStageResult(
      missingParentDoctor.stdout,
    );
  } catch {
    // The assertion below reports one canonical retry-contract failure.
  }
  const failedDoctorState = readCertificationState(statePath);
  const missingParentDoctorEvidence = JSON.parse(
    readFileSync(
      path.join(
        evidenceRoot,
        failedDoctorState.evidenceFiles.doctor?.path ?? "missing-doctor-evidence",
      ),
      "utf8",
    ),
  );
  if (
    missingParentDoctor.status === 0 ||
    missingParentDoctor.signal ||
    missingParentDoctorResult?.result !== "failed" ||
    missingParentDoctorEvidence?.valid !== false ||
    missingParentDoctorEvidence?.seal?.algorithm !== "sha256" ||
    !missingParentDoctorEvidence.issues.some((issue) =>
      issue.includes("parent directory must already exist"),
    )
  ) {
    throw new Error(
      `missing-parent doctor regression did not fail closed: ${String(
        missingParentDoctor.stderr || missingParentDoctor.stdout,
      ).trim()}`,
    );
  }
  const preparationEnvironment = {
    ...doctorEnvironment,
    CERTIFICATION_EXPECTED_STATE_SHA256:
      certificationStateSha256(failedDoctorState),
    CERTIFICATION_RESOURCE_PREPARATION_STARTED_AT: nextTimestamp(),
    CERTIFICATION_RESOURCE_PREPARATION_COMPLETED_AT: nextTimestamp(),
  };
  const preparation = parseCertificationStageResult(
    run(
      process.execPath,
      ["scripts/production-certification.mjs", "prepare-resources"],
      canonicalRoot,
      preparationEnvironment,
    ),
  );
  const preparedState = readCertificationState(statePath);
  if (
    preparation.valid !== true ||
    preparation.details.idempotent !== false ||
    preparedState.resourcePreparation === null ||
    preparedState.resourcePlan.destinations.some((destination) => {
      const target = path.join(evidenceRoot, destination.portableRelativePath);
      return !existsSync(path.dirname(target)) || existsSync(target);
    }) ||
    readdirSync(evidenceRoot, { recursive: true }).some((entry) =>
      String(entry).includes(".certification-resource-") &&
      String(entry).includes(".probe"),
    )
  ) {
    throw new Error("canonical resource preparation did not retain absent targets");
  }
  const idempotentPreparation = parseCertificationStageResult(
    run(
      process.execPath,
      ["scripts/production-certification.mjs", "prepare-resources"],
      canonicalRoot,
      {
        ...doctorEnvironment,
        CERTIFICATION_EXPECTED_STATE_SHA256:
          certificationStateSha256(preparedState),
      },
    ),
  );
  if (
    idempotentPreparation.details.idempotent !== true ||
    idempotentPreparation.details.evidence.sha256 !==
      preparation.details.evidence.sha256 ||
    idempotentPreparation.transition.preStateSha256 !==
      idempotentPreparation.transition.postStateSha256
  ) {
    throw new Error("canonical resource preparation is not idempotent");
  }
  const omittedPreparationRoot = path.join(
    simulationRoot,
    "omitted-preparation-evidence",
  );
  cpSync(evidenceRoot, omittedPreparationRoot, { recursive: true });
  const omittedPreparationStatePath = path.join(
    omittedPreparationRoot,
    "certification-state.json",
  );
  writeFileSync(
    omittedPreparationStatePath,
    canonicalJsonBytes(failedDoctorState),
  );
  const omittedPreparationEnvironment = Object.fromEntries(
    Object.entries(doctorEnvironment).map(([name, value]) => [
      name,
      typeof value === "string" &&
      (value === evidenceRoot || value.startsWith(`${evidenceRoot}${path.sep}`))
        ? path.join(
            omittedPreparationRoot,
            path.relative(evidenceRoot, value),
          )
        : value,
    ]),
  );
  omittedPreparationEnvironment.PRODUCTION_CERTIFICATION_STATE =
    omittedPreparationStatePath;
  omittedPreparationEnvironment.CERTIFICATION_STAGE_STARTED_AT = nextTimestamp();
  omittedPreparationEnvironment.CERTIFICATION_STAGE_COMPLETED_AT = nextTimestamp();
  const omittedPreparationDoctor = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "doctor"],
    {
      cwd: canonicalRoot,
      env: omittedPreparationEnvironment,
      encoding: "utf8",
    },
  );
  const omittedPreparationFrame = parseCertificationStageResult(
    omittedPreparationDoctor.stdout,
  );
  const omittedPreparationState = readCertificationState(
    omittedPreparationStatePath,
  );
  const omittedPreparationResult = JSON.parse(
    readFileSync(
      path.join(
        omittedPreparationRoot,
        omittedPreparationState.evidenceFiles.doctor.path,
      ),
      "utf8",
    ),
  );
  const omittedPreparationRejected =
    omittedPreparationDoctor.status !== 0 &&
    omittedPreparationFrame.result === "failed" &&
    omittedPreparationResult.valid === false &&
    omittedPreparationResult.issues.some((issue) =>
      issue.includes("resource preparation evidence is missing"),
    ) &&
    !omittedPreparationResult.issues.some((issue) =>
      issue.includes("parent directory must already exist"),
    );
  if (!omittedPreparationRejected) {
    throw new Error("doctor did not independently reject omitted preparation");
  }
  let changedPreparationPathRejected = false;
  try {
    validateCertificationResourcePreparation({
      repositoryRoot: canonicalRoot,
      evidenceRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
          evidenceRoot,
          "phase8-target/changed.json",
        ),
      },
      state: preparedState,
    });
  } catch {
    changedPreparationPathRejected = true;
  }
  const precreatedTarget = path.join(
    evidenceRoot,
    preparedState.resourcePlan.destinations[0].portableRelativePath,
  );
  writeFileSync(precreatedTarget, "{}\n", { flag: "wx" });
  const staleTargetDoctor = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "doctor"],
    {
      cwd: canonicalRoot,
      env: {
        ...doctorEnvironment,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      },
      encoding: "utf8",
    },
  );
  const staleTargetFrame = parseCertificationStageResult(
    staleTargetDoctor.stdout,
  );
  const staleTargetState = readCertificationState(statePath);
  const staleTargetResult = JSON.parse(
    readFileSync(
      path.join(
        evidenceRoot,
        staleTargetState.evidenceFiles.doctor.path,
      ),
      "utf8",
    ),
  );
  const targetAfterPreparationRejected =
    staleTargetDoctor.status !== 0 &&
    staleTargetFrame.result === "failed" &&
    staleTargetResult.valid === false &&
    staleTargetResult.issues.some((issue) =>
      /must (?:not already exist|remain absent)/.test(issue),
    );
  rmSync(precreatedTarget);
  if (!changedPreparationPathRejected || !targetAfterPreparationRejected) {
    throw new Error("resource preparation tamper cases did not fail closed");
  }
  const successfulDoctorFrame = parseCertificationStageResult(
    run(
      process.execPath,
      ["scripts/production-certification.mjs", "doctor"],
      canonicalRoot,
      {
        ...doctorEnvironment,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      },
    ),
  );
  let state = readCertificationState(statePath);
  const successfulDoctorEvidence = JSON.parse(
    readFileSync(
      path.join(evidenceRoot, state.evidenceFiles.doctor.path),
      "utf8",
    ),
  );
  const stateInitTransactionDoctor = successfulDoctorEvidence.checks.find(
    (check) => check.id === "state-init-worktree-transaction",
  );
  if (
    successfulDoctorFrame.result !== "passed" ||
    stateInitTransactionDoctor?.passed !== true ||
    stateInitTransactionDoctor.details?.manualTaskDriverCleanupRequired !==
      false ||
    stateInitTransactionDoctor.details?.regressionCaseCount !== 12
  ) {
    throw new Error(
      "simulation did not prove state:init pre-state transaction ownership",
    );
  }
  const sourceChecks = sourceValidationCheckSet(fixtureRoot).checks;
  const sourcePreconditionRoot = path.join(
    simulationRoot,
    "source-precondition-evidence",
  );
  mkdirSync(sourcePreconditionRoot, { mode: 0o700 });
  cpSync(
    path.join(evidenceRoot, "worktrees"),
    path.join(sourcePreconditionRoot, "worktrees"),
    { recursive: true },
  );
  const sourcePreconditionStatePath = path.join(
    sourcePreconditionRoot,
    "certification-state.json",
  );
  const doctorDescriptor = state.evidenceFiles.doctor;
  const preconditionDoctorPath = path.join(
    sourcePreconditionRoot,
    doctorDescriptor.path,
  );
  mkdirSync(path.dirname(preconditionDoctorPath), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    preconditionDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  copyRetainedEvidence(
    evidenceRoot,
    sourcePreconditionRoot,
    state.evidenceFiles["resource-preparation"],
  );
  writeCertificationState(sourcePreconditionStatePath, state);
  mkdirSync(
    path.join(
      sourcePreconditionRoot,
      "worktree-dependencies/source-validation/attempt-001",
    ),
    { recursive: true, mode: 0o700 },
  );
  const sourcePreconditionChild = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "source-validation"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourcePreconditionRoot,
        PRODUCTION_CERTIFICATION_STATE: sourcePreconditionStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
          sourcePreconditionRoot,
          "invocations.log",
        ),
      },
    },
  );
  const sourcePreconditionState = readCertificationState(
    sourcePreconditionStatePath,
  );
  const sourcePreconditionClassified =
    sourcePreconditionChild.status !== 0 &&
    sourcePreconditionState.stages["source-validation"].status === "failed" &&
    sourcePreconditionState.stages["source-validation"]
      .failureClassification === "PRECONDITION_ORCHESTRATION_FAILURE" &&
    sourcePreconditionState.stages["source-validation"]
      .consumedSubstantiveGate === false &&
    sourcePreconditionState.worktrees.roles["source-validation"]
      .dependencyStatus === "not-installed" &&
    !existsSync(path.join(sourcePreconditionRoot, "invocations.log"));
  if (!sourcePreconditionClassified) {
    throw new Error(
      "source dependency precondition failure taxonomy was not retained",
    );
  }
  rmSync(
    path.join(
      sourcePreconditionRoot,
      "worktree-dependencies/source-validation/attempt-001",
    ),
    { recursive: true, force: true },
  );
  const sourcePreconditionRetry = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "source-validation"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourcePreconditionRoot,
        PRODUCTION_CERTIFICATION_STATE: sourcePreconditionStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
          sourcePreconditionRoot,
          "retry-invocations.log",
        ),
      },
    },
  );
  const sourcePreconditionRetryState = readCertificationState(
    sourcePreconditionStatePath,
  );
  const sourcePreconditionRetryValidation = validateCertificationState({
    state: sourcePreconditionRetryState,
    evidenceRoot: sourcePreconditionRoot,
    expectedCandidate: sourcePreconditionRetryState.candidate,
    expectedHarnessSourceSha256:
      sourcePreconditionRetryState.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  if (
    sourcePreconditionRetry.status !== 0 ||
    sourcePreconditionRetryState.stages["source-validation"].status !==
      "passed" ||
    sourcePreconditionRetryState.stages["source-validation"].attempts.length !==
      2 ||
    sourcePreconditionRetryState.worktrees.roles["source-validation"]
      .dependencyStatus !== "installed" ||
    !sourcePreconditionRetryValidation.valid
  ) {
    const retryEvidenceDescriptor =
      sourcePreconditionRetryState.evidenceFiles["source-validation"];
    const retryEvidence = retryEvidenceDescriptor
      ? JSON.parse(
          readFileSync(
            path.join(sourcePreconditionRoot, retryEvidenceDescriptor.path),
            "utf8",
          ),
        )
      : null;
    throw new Error(
      `source precondition retry did not bind and validate successfully: ${JSON.stringify({
        childStatus: sourcePreconditionRetry.status,
        childStderr: sourcePreconditionRetry.stderr,
        validationIssues: sourcePreconditionRetryValidation.issues,
        gitStatus: git(sourceWorktreeRoot, [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ]),
        lastCheck: retryEvidence?.checks?.at(-1),
      })}`,
    );
  }
  rmSync(path.join(sourceWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });

  const sourceEvidenceSymlinkRoot = path.join(
    simulationRoot,
    "source-evidence-symlink-root",
  );
  const sourceEvidenceOutsideRoot = path.join(
    simulationRoot,
    "source-evidence-symlink-outside",
  );
  mkdirSync(sourceEvidenceSymlinkRoot, { mode: 0o700 });
  mkdirSync(sourceEvidenceOutsideRoot, { mode: 0o700 });
  cpSync(
    path.join(evidenceRoot, "worktrees"),
    path.join(sourceEvidenceSymlinkRoot, "worktrees"),
    { recursive: true },
  );
  const sourceEvidenceSymlinkDoctorPath = path.join(
    sourceEvidenceSymlinkRoot,
    doctorDescriptor.path,
  );
  mkdirSync(path.dirname(sourceEvidenceSymlinkDoctorPath), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    sourceEvidenceSymlinkDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  const sourceEvidenceSymlinkStatePath = path.join(
    sourceEvidenceSymlinkRoot,
    "certification-state.json",
  );
  copyRetainedEvidence(
    evidenceRoot,
    sourceEvidenceSymlinkRoot,
    state.evidenceFiles["resource-preparation"],
  );
  writeCertificationState(sourceEvidenceSymlinkStatePath, state);
  symlinkSync(
    sourceEvidenceOutsideRoot,
    path.join(sourceEvidenceSymlinkRoot, "source-validation"),
  );
  let sourceEvidenceSymlinkFailure = null;
  try {
    await runSourceValidationStage({
      repositoryRoot: fixtureRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceEvidenceSymlinkRoot,
        PRODUCTION_CERTIFICATION_STATE: sourceEvidenceSymlinkStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      },
    });
  } catch (error) {
    sourceEvidenceSymlinkFailure = error;
  }
  const sourceEvidenceIntermediateSymlinkRejectedWithoutWrite =
    sourceEvidenceSymlinkFailure?.classification ===
      "SOURCE_CONTRACT_FAILURE" &&
    sourceEvidenceSymlinkFailure?.consumed === false &&
    readdirSync(sourceEvidenceOutsideRoot).length === 0;
  if (!sourceEvidenceIntermediateSymlinkRejectedWithoutWrite) {
    throw new Error(
      "source evidence intermediate symlink was followed before containment validation",
    );
  }
  rmSync(path.join(sourceWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });

  const sourceAlreadyBoundRetryRoot = path.join(
    simulationRoot,
    "source-already-bound-retry-evidence",
  );
  mkdirSync(sourceAlreadyBoundRetryRoot, { mode: 0o700 });
  cpSync(
    path.join(evidenceRoot, "worktrees"),
    path.join(sourceAlreadyBoundRetryRoot, "worktrees"),
    { recursive: true },
  );
  const alreadyBoundDoctorPath = path.join(
    sourceAlreadyBoundRetryRoot,
    doctorDescriptor.path,
  );
  mkdirSync(path.dirname(alreadyBoundDoctorPath), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    alreadyBoundDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  const sourceAlreadyBoundRetryStatePath = path.join(
    sourceAlreadyBoundRetryRoot,
    "certification-state.json",
  );
  copyRetainedEvidence(
    evidenceRoot,
    sourceAlreadyBoundRetryRoot,
    state.evidenceFiles["resource-preparation"],
  );
  writeCertificationState(sourceAlreadyBoundRetryStatePath, state);
  let sourceAlreadyBoundFirstFailure = null;
  try {
    await runSourceValidationStage({
      repositoryRoot: fixtureRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceAlreadyBoundRetryRoot,
        PRODUCTION_CERTIFICATION_STATE: sourceAlreadyBoundRetryStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      },
      testHooks: {
        afterDependencyBinding() {
          throw new Error("qualification post-bind source precondition");
        },
      },
    });
  } catch (error) {
    sourceAlreadyBoundFirstFailure = error;
  }
  await runSourceValidationStage({
    repositoryRoot: fixtureRoot,
    environment: {
      ...doctorEnvironment,
      CERTIFICATION_EVIDENCE_ROOT: sourceAlreadyBoundRetryRoot,
      PRODUCTION_CERTIFICATION_STATE: sourceAlreadyBoundRetryStatePath,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
        sourceAlreadyBoundRetryRoot,
        "retry-invocations.log",
      ),
    },
  });
  const sourceAlreadyBoundRetryState = readCertificationState(
    sourceAlreadyBoundRetryStatePath,
  );
  const sourceAlreadyBoundRetryValidation = validateCertificationState({
    state: sourceAlreadyBoundRetryState,
    evidenceRoot: sourceAlreadyBoundRetryRoot,
    expectedCandidate: sourceAlreadyBoundRetryState.candidate,
    expectedHarnessSourceSha256:
      sourceAlreadyBoundRetryState.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  const sourceAlreadyBoundRetryWithoutReinstall =
    sourceAlreadyBoundFirstFailure?.classification ===
      "SOURCE_CONTRACT_FAILURE" &&
    sourceAlreadyBoundFirstFailure?.consumed === false &&
    sourceAlreadyBoundRetryState.stages["source-validation"].status ===
      "passed" &&
    sourceAlreadyBoundRetryState.stages["source-validation"].attempts.length ===
      2 &&
    sourceAlreadyBoundRetryState.worktrees.roles["source-validation"]
      .dependencyStatus === "installed" &&
    dependencyInstallationAttemptCount(
      sourceAlreadyBoundRetryRoot,
      "source-validation",
    ) === 1 &&
    sourceAlreadyBoundRetryValidation.valid;
  if (!sourceAlreadyBoundRetryWithoutReinstall) {
    throw new Error(
      "already-bound source retry did not use read-only dependency revalidation",
    );
  }
  rmSync(path.join(sourceWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });

  const sourceBindingRaceRoot = path.join(
    simulationRoot,
    "source-binding-race-evidence",
  );
  mkdirSync(sourceBindingRaceRoot, { mode: 0o700 });
  cpSync(
    path.join(evidenceRoot, "worktrees"),
    path.join(sourceBindingRaceRoot, "worktrees"),
    { recursive: true },
  );
  const bindingRaceDoctorPath = path.join(
    sourceBindingRaceRoot,
    doctorDescriptor.path,
  );
  mkdirSync(path.dirname(bindingRaceDoctorPath), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    bindingRaceDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  const sourceBindingRaceStatePath = path.join(
    sourceBindingRaceRoot,
    "certification-state.json",
  );
  copyRetainedEvidence(
    evidenceRoot,
    sourceBindingRaceRoot,
    state.evidenceFiles["resource-preparation"],
  );
  writeCertificationState(sourceBindingRaceStatePath, state);
  const sourceBindingRaceLog = path.join(
    sourceBindingRaceRoot,
    "invocations.log",
  );
  let sourceBindingRaceFailure = null;
  try {
    await runSourceValidationStage({
      repositoryRoot: fixtureRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceBindingRaceRoot,
        PRODUCTION_CERTIFICATION_STATE: sourceBindingRaceStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: sourceBindingRaceLog,
      },
      testHooks: {
        beforeFinalDependencyMeasurement({ repositoryRoot }) {
          writeFileSync(
            path.join(
              repositoryRoot,
              "node_modules/simulation-fixture/index.js",
            ),
            "module.exports = 'binding-race';\n",
          );
        },
      },
    });
  } catch (error) {
    sourceBindingRaceFailure = error;
  }
  writeFileSync(
    path.join(sourceWorktreeRoot, "node_modules/simulation-fixture/index.js"),
    "module.exports = 'simulation-fixture';\n",
  );
  const sourceBindingRaceState = readCertificationState(
    sourceBindingRaceStatePath,
  );
  let sourceBindingRaceRetryFailure = null;
  try {
    await runSourceValidationStage({
      repositoryRoot: fixtureRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceBindingRaceRoot,
        PRODUCTION_CERTIFICATION_STATE: sourceBindingRaceStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: sourceBindingRaceLog,
      },
    });
  } catch (error) {
    sourceBindingRaceRetryFailure = error;
  }
  const sourceBindingRaceRetryState = readCertificationState(
    sourceBindingRaceStatePath,
  );
  const sourceBindingRaceRejectedWithoutReinstall =
    sourceBindingRaceFailure?.classification === "SOURCE_CONTRACT_FAILURE" &&
    sourceBindingRaceFailure?.consumed === false &&
    sourceBindingRaceState.worktrees.roles["source-validation"]
      .dependencyStatus === "failed" &&
    sourceBindingRaceState.worktrees.roles["source-validation"]
      .dependencyInstallation?.result === "binding-failed" &&
    sourceBindingRaceRetryFailure?.classification ===
      "SOURCE_CONTRACT_FAILURE" &&
    sourceBindingRaceRetryFailure?.consumed === false &&
    sourceBindingRaceRetryState.worktrees.roles["source-validation"]
      .dependencyStatus === "failed" &&
    dependencyInstallationAttemptCount(
      sourceBindingRaceRoot,
      "source-validation",
    ) === 1 &&
    !existsSync(sourceBindingRaceLog);
  if (!sourceBindingRaceRejectedWithoutReinstall) {
    throw new Error(
      `source bind race was not retained terminally without reinstall: ${JSON.stringify({
        first: sourceBindingRaceFailure?.message,
        retry: sourceBindingRaceRetryFailure?.message,
        status:
          sourceBindingRaceRetryState.worktrees.roles["source-validation"]
            .dependencyStatus,
        result:
          sourceBindingRaceRetryState.worktrees.roles["source-validation"]
            .dependencyInstallation?.result,
        attempts: dependencyInstallationAttemptCount(
          sourceBindingRaceRoot,
          "source-validation",
        ),
      })}`,
    );
  }
  rmSync(path.join(sourceWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });
  const failedSourceCheckIndex = sourceChecks.length - 3;
  const failedSourceCheck = sourceChecks[failedSourceCheckIndex];
  const sourceFailureRoot = path.join(simulationRoot, "source-failure-evidence");
  mkdirSync(sourceFailureRoot, { mode: 0o700 });
  cpSync(
    path.join(evidenceRoot, "worktrees"),
    path.join(sourceFailureRoot, "worktrees"),
    { recursive: true },
  );
  const failedSourceStatePath = path.join(
    sourceFailureRoot,
    "certification-state.json",
  );
  const failedDoctorPath = path.join(sourceFailureRoot, doctorDescriptor.path);
  mkdirSync(path.dirname(failedDoctorPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    failedDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  copyRetainedEvidence(
    evidenceRoot,
    sourceFailureRoot,
    state.evidenceFiles["resource-preparation"],
  );
  writeCertificationState(failedSourceStatePath, state);
  const failedSourceChild = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "source-validation"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceFailureRoot,
        PRODUCTION_CERTIFICATION_STATE: failedSourceStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
          sourceFailureRoot,
          "invocations.log",
        ),
        CERTIFICATION_SOURCE_VALIDATION_FAIL_ID: failedSourceCheck.id,
      },
    },
  );
  const failedSourceState = readCertificationState(failedSourceStatePath);
  const failedSourceDescriptor =
    failedSourceState.evidenceFiles["source-validation"];
  const failedSourceEvidence = JSON.parse(
    readFileSync(
      path.join(sourceFailureRoot, failedSourceDescriptor.path),
      "utf8",
    ),
  );
  const failedSourceStateValidation = validateCertificationState({
    state: failedSourceState,
    evidenceRoot: sourceFailureRoot,
    expectedCandidate: failedSourceState.candidate,
    expectedHarnessSourceSha256: failedSourceState.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  let failedSourcePreventedBuild = false;
  try {
    startCertificationStage(failedSourceState, {
      stage: "build",
      startedAt: "2026-08-14T00:11:01.000Z",
    });
  } catch {
    failedSourcePreventedBuild = true;
  }
  const failedInvocationIds = readFileSync(
    path.join(sourceFailureRoot, "invocations.log"),
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (
    failedSourceChild.status === 0 ||
    failedSourceState.stages["source-validation"].status !== "failed" ||
    failedSourceState.stages["source-validation"].exitCode !== 17 ||
    failedSourceState.stages["source-validation"].consumedSubstantiveGate !==
      true ||
    failedSourceEvidence.passed !== false ||
    failedSourceEvidence.failedCheckId !== failedSourceCheck.id ||
    !failedSourceStateValidation.valid ||
    JSON.stringify(failedInvocationIds) !==
      JSON.stringify(
        sourceChecks
          .slice(0, failedSourceCheckIndex + 1)
          .map((check) => check.id),
      ) ||
    !failedSourcePreventedBuild
  ) {
    throw new Error(
      `simulation source-check failure did not stop or block build readiness: ${JSON.stringify({
        childStatus: failedSourceChild.status,
        stage: failedSourceState.stages["source-validation"],
        evidencePassed: failedSourceEvidence.passed,
        failedCheckId: failedSourceEvidence.failedCheckId,
        validationIssues: failedSourceStateValidation.issues,
        failedInvocationIds,
        failedSourcePreventedBuild,
      })}`,
    );
  }
  rmSync(path.join(sourceWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });
  const sourceDriftRoot = path.join(simulationRoot, "source-drift-evidence");
  mkdirSync(sourceDriftRoot, { mode: 0o700 });
  cpSync(
    path.join(evidenceRoot, "worktrees"),
    path.join(sourceDriftRoot, "worktrees"),
    { recursive: true },
  );
  const driftDoctorPath = path.join(sourceDriftRoot, doctorDescriptor.path);
  mkdirSync(path.dirname(driftDoctorPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    driftDoctorPath,
    readFileSync(path.join(evidenceRoot, doctorDescriptor.path)),
    { flag: "wx", mode: 0o600 },
  );
  const sourceDriftStatePath = path.join(
    sourceDriftRoot,
    "certification-state.json",
  );
  copyRetainedEvidence(
    evidenceRoot,
    sourceDriftRoot,
    state.evidenceFiles["resource-preparation"],
  );
  writeCertificationState(sourceDriftStatePath, state);
  const sourceDriftCheck = sourceChecks[1];
  const dirtySourcePath = path.join(
    sourceWorktreeRoot,
    ".certification-source-validation-dirty-fixture",
  );
  const preDriftStatus = git(sourceWorktreeRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (preDriftStatus) {
    throw new Error(`simulation source worktree drifted before tamper: ${preDriftStatus}`);
  }
  const sourceDriftChild = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "source-validation"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceDriftRoot,
        PRODUCTION_CERTIFICATION_STATE: sourceDriftStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
          sourceDriftRoot,
          "invocations.log",
        ),
        CERTIFICATION_SOURCE_VALIDATION_DIRTY_ID: sourceDriftCheck.id,
      },
    },
  );
  if (existsSync(dirtySourcePath)) rmSync(dirtySourcePath);
  const sourceDriftState = readCertificationState(sourceDriftStatePath);
  const sourceDriftDescriptor =
    sourceDriftState.evidenceFiles["source-validation"];
  if (!sourceDriftDescriptor) {
    throw new Error(
      `simulation source-drift runner did not retain aggregate evidence: ${String(
        sourceDriftChild.stderr || sourceDriftChild.stdout,
      ).trim()}`,
    );
  }
  const sourceDriftEvidence = JSON.parse(
    readFileSync(
      path.join(sourceDriftRoot, sourceDriftDescriptor.path),
      "utf8",
    ),
  );
  const sourceDriftValidation = validateCertificationState({
    state: sourceDriftState,
    evidenceRoot: sourceDriftRoot,
    expectedCandidate: sourceDriftState.candidate,
    expectedHarnessSourceSha256: sourceDriftState.harness.sourceSha256,
    repositoryRoot: fixtureRoot,
  });
  const sourceDriftAfterZeroExitRetained =
    sourceDriftChild.status !== 0 &&
    sourceDriftState.stages["source-validation"].status === "failed" &&
    sourceDriftState.stages["source-validation"].exitCode === 1 &&
    sourceDriftState.stages["source-validation"].consumedSubstantiveGate ===
      true &&
    sourceDriftEvidence.failedCheckId === sourceDriftCheck.id &&
    sourceDriftEvidence.checks.at(-1).process.exitCode === 0 &&
    sourceDriftEvidence.checks.at(-1).sourceAfter.clean === false &&
    sourceDriftValidation.valid;
  if (!sourceDriftAfterZeroExitRetained) {
    throw new Error("zero-exit source drift was not retained as a truthful failure");
  }
  rmSync(path.join(sourceWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });
  const sourceDependencyDriftRoot = path.join(
    simulationRoot,
    "source-dependency-drift-evidence",
  );
  cpSync(evidenceRoot, sourceDependencyDriftRoot, { recursive: true });
  const sourceDependencyDriftStatePath = path.join(
    sourceDependencyDriftRoot,
    "certification-state.json",
  );
  const sourceDependencyDriftLog = path.join(
    sourceDependencyDriftRoot,
    "invocations.log",
  );
  let sourceDependencyStageFailure = null;
  try {
    await runSourceValidationStage({
      repositoryRoot: fixtureRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: sourceDependencyDriftRoot,
        PRODUCTION_CERTIFICATION_STATE: sourceDependencyDriftStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG:
          sourceDependencyDriftLog,
      },
      testHooks: {
        beforePostCheckDependencyRevalidation({ repositoryRoot }) {
          writeFileSync(
            path.join(
              repositoryRoot,
              "node_modules/simulation-fixture/index.js",
            ),
            "module.exports = 'source-post-check-drift';\n",
          );
        },
      },
    });
  } catch (error) {
    sourceDependencyStageFailure = error;
  }
  writeFileSync(
    path.join(sourceWorktreeRoot, "node_modules/simulation-fixture/index.js"),
    "module.exports = 'simulation-fixture';\n",
  );
  const sourceDependencyDriftState = readCertificationState(
    sourceDependencyDriftStatePath,
  );
  let sourceDependencyDriftBlockedBuild = false;
  try {
    startCertificationStage(sourceDependencyDriftState, {
      stage: "build",
      startedAt: nextTimestamp(),
    });
  } catch {
    sourceDependencyDriftBlockedBuild = true;
  }
  const sourceDependencyDriftInvocationIds = readFileSync(
    sourceDependencyDriftLog,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const sourcePostCheckDependencyDriftRejected =
    sourceDependencyStageFailure?.classification ===
      "SOURCE_CONTRACT_FAILURE" &&
    sourceDependencyStageFailure?.consumed === true &&
    sourceDependencyDriftState.stages["source-validation"].status ===
      "failed" &&
    sourceDependencyDriftState.stages["source-validation"]
      .consumedSubstantiveGate === true &&
    sourceDependencyDriftState.worktrees.roles["source-validation"]
      .dependencyStatus === "installed" &&
    JSON.stringify(sourceDependencyDriftInvocationIds) ===
      JSON.stringify(sourceChecks.map((check) => check.id)) &&
    dependencyInstallationAttemptCount(
      sourceDependencyDriftRoot,
      "source-validation",
    ) === 1 &&
    sourceDependencyDriftBlockedBuild;
  if (!sourcePostCheckDependencyDriftRejected) {
    throw new Error(
      "real source stage did not reject post-check dependency drift and block build",
    );
  }
  rmSync(path.join(sourceWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });
  const successfulSourceInitialState = readCertificationState(statePath);
  if (
    successfulSourceInitialState.worktrees.roles["source-validation"]
      .dependencyStatus !== "not-installed" ||
    successfulSourceInitialState.worktrees.roles["source-validation"]
      .dependencyIdentitySha256 !== null ||
    successfulSourceInitialState.worktrees.roles["source-validation"]
      .dependencyBindingEvidence !== null
  ) {
    throw new Error(
      "exact source real-runner regression did not begin from stale-null state",
    );
  }
  const successfulSourceConsumption = await runCertificationStageCommand({
    command: "source-validation",
    repositoryRoot: fixtureRoot,
    environment: {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_RESULT_NONCE:
        "simulation-source-stage-result-0001",
      CERTIFICATION_STAGE_RESULT_NOISY_OUTPUT_FIXTURE:
        "historical-source-validation-npm-prisma",
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG: path.join(
        evidenceRoot,
        "source-validation-invocations.log",
      ),
    },
  });
  if (
    !successfulSourceConsumption.stdout.includes(
      "> interior-ai@0.1.0 certification:source-validation",
    ) ||
    !successfulSourceConsumption.stdout.includes(
      "Prisma schema loaded from prisma/schema.prisma",
    )
  ) {
    throw new Error(
      "exact source-validation wrapper did not retain historical npm/Prisma logs",
    );
  }
  const sourceCheckIds = sourceValidationCheckSet(fixtureRoot).checks.map(
    (check) => check.id,
  );
  const invokedSourceChecks = readFileSync(
    path.join(evidenceRoot, "source-validation-invocations.log"),
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (JSON.stringify(invokedSourceChecks) !== JSON.stringify(sourceCheckIds)) {
    throw new Error("simulation source-validation did not invoke the canonical check closure");
  }
  state = readCertificationState(statePath);
  const successfulSourceBuildBoundaryPending =
    state.stages["source-validation"].status === "passed" &&
    state.stages.build.status === "pending";
  const successfulSourceBinding =
    state.worktrees.roles["source-validation"];
  if (
    successfulSourceBinding.dependencyStatus !== "installed" ||
    !successfulSourceBinding.dependencyIdentitySha256 ||
    !successfulSourceBinding.dependencyBindingEvidence ||
    !successfulSourceBinding.dependencyInstallation ||
    state.stages["source-validation"].status !== "passed"
  ) {
    throw new Error(
      "exact source real-runner regression did not physically install, bind, and pass",
    );
  }
  const successfulSourceEvidence = JSON.parse(
    readFileSync(
      path.join(
        evidenceRoot,
        state.evidenceFiles["source-validation"].path,
      ),
      "utf8",
    ),
  );
  const productionArtifactEvidenceSourceCheck =
    successfulSourceEvidence.checks.find(
      (check) => check.id === "production-artifact-evidence-contracts",
    );
  if (
    !productionArtifactEvidenceSourceCheck?.passed ||
    typeof productionArtifactEvidenceSourceCheck.stdout?.path !== "string"
  ) {
    throw new Error(
      "real source-validation evidence lacks the production-artifact check stream",
    );
  }
  const nestedSourceResultPrefix =
    "SOURCE_VALIDATION_NESTED_AUTH_FIXTURE_REGRESSION_RESULT ";
  const productionArtifactEvidenceStdout = readFileSync(
    path.join(evidenceRoot, productionArtifactEvidenceSourceCheck.stdout.path),
    "utf8",
  );
  const nestedSourceResultLine = productionArtifactEvidenceStdout
    .split("\n")
    .find((line) => line.startsWith(nestedSourceResultPrefix));
  if (!nestedSourceResultLine) {
    throw new Error(
      "real source-validation production-artifact check did not execute the nested auth fixture regression",
    );
  }
  const sourceValidationNestedAuthFixtureResult = JSON.parse(
    nestedSourceResultLine.slice(nestedSourceResultPrefix.length),
  );
  if (
    sourceValidationNestedAuthFixtureResult.schema !==
      "interior-ai.ci-auth-fixture-nested-isolation-regression.v1" ||
    sourceValidationNestedAuthFixtureResult.selectedOwner !==
      "nested-regression-child" ||
    sourceValidationNestedAuthFixtureResult.historicalConflict !==
      "GOOGLE_CLIENT_ID" ||
    sourceValidationNestedAuthFixtureResult.historicalContaminationRejected !==
      true ||
    sourceValidationNestedAuthFixtureResult.isolatedChildPassed !== true ||
    sourceValidationNestedAuthFixtureResult.parentEnvironmentUnchanged !== true ||
    sourceValidationNestedAuthFixtureResult.outerSessionPreserved !== true ||
    sourceValidationNestedAuthFixtureResult.outerResourcesPreserved !== true ||
    sourceValidationNestedAuthFixtureResult.nestedResourcesCleaned !== true ||
    sourceValidationNestedAuthFixtureResult.rawProviderValuesRecorded !== false ||
    JSON.stringify(sourceValidationNestedAuthFixtureResult.negativeCases) !==
      JSON.stringify(expectedNestedAuthFixtureIsolationCases) ||
    JSON.stringify(sourceValidationNestedAuthFixtureResult.capabilityNames) !==
      JSON.stringify(expectedNestedAuthFixtureCapabilityNames)
  ) {
    throw new Error(
      "real source-validation nested auth fixture regression evidence is incomplete",
    );
  }
  const correctedSourceAggregateValidation = validateSourceValidationEvidence({
    evidence: successfulSourceEvidence,
    evidenceRoot,
    state,
    repositoryRoot: sourceWorktreeRoot,
  });
  const floorPlanGeneratedOutput = successfulSourceEvidence.generatedOutputEvidence.find(
    (entry) => entry.outputId === "floor-plan-upload-browser-fixture",
  );
  const typeScriptGeneratedOutput = successfulSourceEvidence.generatedOutputEvidence.find(
    (entry) => entry.outputId === "typescript-build-info",
  );
  const floorPlanGeneratedEvidence = JSON.parse(
    readFileSync(path.join(evidenceRoot, floorPlanGeneratedOutput.evidence.path), "utf8"),
  );
  const typeScriptGeneratedEvidence = JSON.parse(
    readFileSync(path.join(evidenceRoot, typeScriptGeneratedOutput.evidence.path), "utf8"),
  );
  const generatedOutputLifecyclePassed =
    successfulSourceEvidence.generatedOutputContract.schema ===
      "interior-ai.production-certification-source-generated-outputs.v1" &&
    successfulSourceEvidence.generatedOutputEvidence.length === 2 &&
    floorPlanGeneratedEvidence.closedRelativeInventory.length === 4 &&
    floorPlanGeneratedEvidence.closedRelativeInventory.every((entry) =>
      new Set([
        ".next/cache/floor-plan-upload-browser-fixture/612.chunk.js",
        ".next/cache/floor-plan-upload-browser-fixture/901.chunk.js",
        ".next/cache/floor-plan-upload-browser-fixture/bundle.js",
        ".next/cache/floor-plan-upload-browser-fixture/empty-entry.js",
      ]).has(entry.path),
    ) &&
    typeScriptGeneratedEvidence.closedRelativeInventory.length === 1 &&
    typeScriptGeneratedEvidence.closedRelativeInventory[0].path ===
      "tsconfig.tsbuildinfo" &&
    floorPlanGeneratedEvidence.completionMarker.result === "cleaned" &&
    typeScriptGeneratedEvidence.completionMarker.result === "cleaned" &&
    successfulSourceEvidence.terminalWorktree.generatedOutputsRemaining.length === 0 &&
    successfulSourceEvidence.terminalWorktree.undeclaredIgnoredInventory.count === 0;
  if (!generatedOutputLifecyclePassed) {
    throw new Error("simulation source generated-output lifecycle did not seal and clean");
  }
  const staleNullAggregateState = structuredClone(state);
  staleNullAggregateState.worktrees.roles[
    "source-validation"
  ].dependencyIdentitySha256 = null;
  const staleNullAggregateValidation = validateSourceValidationEvidence({
    evidence: successfulSourceEvidence,
    evidenceRoot,
    state: staleNullAggregateState,
    repositoryRoot: sourceWorktreeRoot,
  });
  const exactStaleNullOrderingRegressionPassed =
    correctedSourceAggregateValidation.valid &&
    !staleNullAggregateValidation.valid &&
    staleNullAggregateValidation.issues.some((issue) =>
      /dependency lifecycle|stage-worktree identity/.test(issue),
    );
  if (!exactStaleNullOrderingRegressionPassed) {
    throw new Error(
      "simulation did not close the exact stale-null aggregate ordering regression",
    );
  }
  const staleBindingStateReceiptEvidence = sealSourceValidationEvidence({
    ...successfulSourceEvidence,
    dependencyLifecycle: {
      ...successfulSourceEvidence.dependencyLifecycle,
      stateShaImmediatelyAfterBinding: "f".repeat(64),
    },
  });
  const staleBindingStateReceiptValidation = validateSourceValidationEvidence({
    evidence: staleBindingStateReceiptEvidence,
    evidenceRoot,
    state,
    repositoryRoot: sourceWorktreeRoot,
  });
  const staleBindingStateReceiptRejected =
    !staleBindingStateReceiptValidation.valid &&
    staleBindingStateReceiptValidation.issues.some((issue) =>
      /binding-state receipt/.test(issue),
    );
  if (!staleBindingStateReceiptRejected) {
    throw new Error("stale source dependency binding-state receipt was accepted");
  }
  const sourceBindingStateReceipt = JSON.parse(
    readFileSync(
      path.join(
        evidenceRoot,
        successfulSourceEvidence.dependencyLifecycle.bindingStateEvidence.path,
      ),
      "utf8",
    ),
  );
  sourceBindingStateReceipt.worktrees.roles[
    "source-validation"
  ].dependencyInstallation = null;
  const contradictoryBindingStateReceipt = sealCertificationState(
    sourceBindingStateReceipt,
  );
  const contradictoryBindingStateDescriptor = writeEvidence(
    evidenceRoot,
    "source-validation/contradictory-binding-state.json",
    contradictoryBindingStateReceipt,
  );
  const contradictoryBindingStateSourceEvidence =
    sealSourceValidationEvidence({
      ...successfulSourceEvidence,
      dependencyLifecycle: {
        ...successfulSourceEvidence.dependencyLifecycle,
        stateShaImmediatelyAfterBinding:
          contradictoryBindingStateDescriptor.sha256,
        bindingStateEvidence: contradictoryBindingStateDescriptor,
      },
    });
  const contradictoryBindingStateValidation =
    validateSourceValidationEvidence({
      evidence: contradictoryBindingStateSourceEvidence,
      evidenceRoot,
      state,
      repositoryRoot: sourceWorktreeRoot,
    });
  const contradictoryBindingStateReceiptRejected =
    !contradictoryBindingStateValidation.valid &&
    contradictoryBindingStateValidation.issues.some((issue) =>
      /binding-state receipt/.test(issue),
    );
  if (!contradictoryBindingStateReceiptRejected) {
    throw new Error("contradictory source binding-state receipt was accepted");
  }
  const fabricatedSourceRevalidationEvidence = sealSourceValidationEvidence({
    ...successfulSourceEvidence,
    dependencyLifecycle: {
      ...successfulSourceEvidence.dependencyLifecycle,
      preCheckRevalidation: {
        ...successfulSourceEvidence.dependencyLifecycle.preCheckRevalidation,
        boundary: "fabricated-boundary",
        packageLockSha256: "f".repeat(64),
        unexpected: true,
      },
    },
  });
  const fabricatedSourceRevalidationValidation =
    validateSourceValidationEvidence({
      evidence: fabricatedSourceRevalidationEvidence,
      evidenceRoot,
      state,
      repositoryRoot: sourceWorktreeRoot,
    });
  const sourceDependencyRevalidationTamperRejected =
    !fabricatedSourceRevalidationValidation.valid &&
    fabricatedSourceRevalidationValidation.issues.some((issue) =>
      /exactly bound/.test(issue),
    );
  if (!sourceDependencyRevalidationTamperRejected) {
    throw new Error("fabricated source dependency revalidation was accepted");
  }
  const prohibitedSourceNames = new Set([
    "CERTIFICATION_EVIDENCE_ROOT",
    "CERTIFICATION_RUNTIME_REPORT_PATH",
    "CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH",
    "CERTIFICATION_RUNTIME_EVIDENCE_PATH",
    "CERTIFICATION_RUNTIME_START_MARKER_PATH",
    "PHASE8_EXTERNAL_EVIDENCE_ROOT",
    "PLAYWRIGHT_JSON_OUTPUT_FILE",
    "REQUIRED_TEST_REPORT_PATH",
  ]);
  if (
    successfulSourceEvidence.schema !==
      "interior-ai.production-certification-source-validation.v4" ||
    successfulSourceEvidence.checks.length !== 19 ||
    successfulSourceEvidence.checks.some(
      (check) =>
        check.environmentProfileId !== "source-validation-qualification" ||
        check.environment.prohibitedCertificationVariableAbsence.passed !== true ||
        check.environment.environmentNames.some((name) =>
          prohibitedSourceNames.has(name),
        ),
    ) ||
    !existsSync(
      path.join(evidenceRoot, state.evidenceFiles["source-validation"].path),
    )
  ) {
    throw new Error(
      "simulation realistic parent environment leaked a later-stage capability into source validation",
    );
  }
  const floorPlanSourceCheck = successfulSourceEvidence.checks.find(
    (check) => check.id === "floor-plan-required-closure",
  );
  if (
    !floorPlanSourceCheck ||
    !floorPlanSourceCheck.passed ||
    !floorPlanSourceCheck.environment.environmentNames.includes(
      "FLOOR_PLAN_VISION_ENABLED",
    ) ||
    floorPlanSourceCheck.environment.environmentNames.includes(
      "OPENAI_API_KEY",
    ) ||
    floorPlanSourceCheck.environment.appliedValuePolicies.find(
      (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
    )?.effectiveValueClassification !== "boolean:false" ||
    floorPlanSourceCheck.environment.prohibitedAmbientValueAbsence.passed !==
      true ||
    JSON.stringify(successfulSourceEvidence).includes(
      environment.OPENAI_API_KEY,
    )
  ) {
    throw new Error(
      "simulation Floor Plan source check did not receive its deterministic value policy",
    );
  }
  const projectProfile = (profileId, stage) => {
    const profile = certificationEnvironmentProfile(fixtureRoot, profileId);
    const stageInputs = Object.fromEntries(
      profile.requiredVariables.map((name) => [
        name,
        profile.fixedValues[name] ?? `simulation-${stage}-${name}`,
      ]),
    );
    return projectCertificationChildEnvironment({
      repositoryRoot: fixtureRoot,
      baseEnvironment: { ...process.env, ...environment },
      stage,
      profileId,
      stageInputs,
    });
  };
  const buildProjection = projectProfile("build", "build");
  const runtimeProjection = projectProfile("runtime-smoke", "runtime-smoke");
  for (const [profileId, stage, projection] of [
    ["build", "build", buildProjection],
    ["runtime-smoke", "runtime-smoke", runtimeProjection],
  ]) {
    if (
      projection.environment.FLOOR_PLAN_VISION_ENABLED !== "1" ||
      projection.environment.FLOOR_PLAN_VISION_MODEL !==
        "simulation-floor-plan-model" ||
      projection.environment.OPENAI_API_KEY !== environment.OPENAI_API_KEY ||
      JSON.stringify(projection.metadata).includes(environment.OPENAI_API_KEY) ||
      !validateProjectedEnvironmentMetadata({
        repositoryRoot: fixtureRoot,
        stage,
        profileId,
        metadata: projection.metadata,
      }).valid
    ) {
      throw new Error(
        `simulation ${profileId} profile did not preserve runtime Floor Plan configuration`,
      );
    }
  }
  const wrongValuePolicyHash = structuredClone(
    floorPlanSourceCheck.environment,
  );
  wrongValuePolicyHash.valuePolicySha256 = "0".repeat(64);
  const wrongValuePolicyHashRejected = !validateProjectedEnvironmentMetadata({
    repositoryRoot: fixtureRoot,
    stage: "source-validation",
    checkId: "floor-plan-required-closure",
    profileId: "source-validation-qualification",
    requiredEnvironmentNames: ["DATABASE_URL"],
    metadata: wrongValuePolicyHash,
  }).valid;
  const ambientFeatureLeak = structuredClone(floorPlanSourceCheck.environment);
  ambientFeatureLeak.environmentNames.push("OPENAI_API_KEY");
  ambientFeatureLeak.environmentNames.sort();
  ambientFeatureLeak.environmentNamesSha256 = sha256Bytes(
    canonicalJsonBytes(ambientFeatureLeak.environmentNames),
  );
  ambientFeatureLeak.prohibitedCertificationVariableAbsence.checkedNameCount =
    ambientFeatureLeak.environmentNames.length;
  const ambientFeatureFlagLeakageRejected =
    !validateProjectedEnvironmentMetadata({
      repositoryRoot: fixtureRoot,
      stage: "source-validation",
      checkId: "floor-plan-required-closure",
      profileId: "source-validation-qualification",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: ambientFeatureLeak,
    }).valid;
  const buildFixtureLeak = structuredClone(buildProjection.metadata);
  buildFixtureLeak.appliedValuePolicies.find(
    (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
  ).source = "check-owned-fixture";
  const sourceFixtureLeakIntoBuildRuntimeRejected =
    !validateProjectedEnvironmentMetadata({
      repositoryRoot: fixtureRoot,
      stage: "build",
      profileId: "build",
      metadata: buildFixtureLeak,
    }).valid;
  const importOrderDrift = structuredClone(floorPlanSourceCheck.environment);
  importOrderDrift.appliedValuePolicies.find(
    (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
  ).effectiveValueClassification = "boolean:true";
  const importOrderDriftRejected = !validateProjectedEnvironmentMetadata({
    repositoryRoot: fixtureRoot,
    stage: "source-validation",
    checkId: "floor-plan-required-closure",
    profileId: "source-validation-qualification",
    requiredEnvironmentNames: ["DATABASE_URL"],
    metadata: importOrderDrift,
  }).valid;
  if (
    !wrongValuePolicyHashRejected ||
    !ambientFeatureFlagLeakageRejected ||
    !sourceFixtureLeakIntoBuildRuntimeRejected ||
    !importOrderDriftRejected
  ) {
    throw new Error("simulation Floor Plan value-policy tamper cases were not rejected");
  }
  const wrongProfileEvidence = structuredClone(successfulSourceEvidence);
  wrongProfileEvidence.checks[0].environmentProfileId = "runtime-smoke";
  const wrongEnvironmentProfileRejected = !validateSourceValidationEvidence({
    evidence: wrongProfileEvidence,
    evidenceRoot,
    state,
    repositoryRoot: fixtureRoot,
  }).valid;
  const leakedEnvironmentEvidence = structuredClone(successfulSourceEvidence);
  leakedEnvironmentEvidence.checks[0].environment.environmentNames.push(
    "CERTIFICATION_RUNTIME_START_MARKER_PATH",
  );
  leakedEnvironmentEvidence.checks[0].environment.environmentNames.sort();
  leakedEnvironmentEvidence.checks[0].environment.environmentNamesSha256 =
    sha256Bytes(
      canonicalJsonBytes(
        leakedEnvironmentEvidence.checks[0].environment.environmentNames,
      ),
    );
  leakedEnvironmentEvidence.checks[0].environment.prohibitedCertificationVariableAbsence.checkedNameCount =
    leakedEnvironmentEvidence.checks[0].environment.environmentNames.length;
  const leakedEnvironmentVariableRejected = !validateSourceValidationEvidence({
    evidence: leakedEnvironmentEvidence,
    evidenceRoot,
    state,
    repositoryRoot: fixtureRoot,
  }).valid;
  if (!wrongEnvironmentProfileRejected || !leakedEnvironmentVariableRejected) {
    throw new Error("simulation environment-profile tamper cases were not rejected");
  }
  if (
    state.stages.doctor.attempts.length !== 3 ||
    state.stages.doctor.attempts[0].status !== "failed" ||
    state.stages.doctor.attempts[0].consumedSubstantiveGate ||
    state.stages.doctor.attempts[1].status !== "failed" ||
    state.stages.doctor.attempts[1].consumedSubstantiveGate ||
    state.stages.doctor.attempts[2].status !== "passed"
  ) {
    throw new Error("doctor non-consuming retry attempts were not physically retained");
  }
  const buildAlreadyBoundRetryRoot = evidenceRoot;
  const buildAlreadyBoundRetryStatePath = path.join(
    evidenceRoot,
    "build-already-bound-retry-state.json",
  );
  writeCertificationState(buildAlreadyBoundRetryStatePath, state);
  const buildAlreadyBoundFailures = [];
  const buildRetryEnvironment = () => {
    const durableState = readCertificationState(
      buildAlreadyBoundRetryStatePath,
    );
    const startedAtMs = Math.max(
      Date.now(),
      Date.parse(durableState.updatedAt) + 1,
    );
    return {
      ...doctorEnvironment,
      CERTIFICATION_EVIDENCE_ROOT: buildAlreadyBoundRetryRoot,
      PRODUCTION_CERTIFICATION_STATE: buildAlreadyBoundRetryStatePath,
      CERTIFICATION_STAGE_STARTED_AT: new Date(startedAtMs).toISOString(),
      CERTIFICATION_STAGE_COMPLETED_AT: new Date(startedAtMs + 1).toISOString(),
    };
  };
  const bindBuildRetryCompletionTimestamp = (attemptEnvironment) => {
    const durableState = readCertificationState(
      buildAlreadyBoundRetryStatePath,
    );
    attemptEnvironment.CERTIFICATION_STAGE_COMPLETED_AT = new Date(
      Date.parse(durableState.updatedAt) + 1,
    ).toISOString();
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptEnvironment = buildRetryEnvironment();
    try {
      await runBuildStage({
        repositoryRoot: canonicalRoot,
        environment: attemptEnvironment,
        testHooks: {
          suppressBuildChildOutput: true,
          afterDependencyBinding() {
            bindBuildRetryCompletionTimestamp(attemptEnvironment);
            throw new Error("qualification post-bind build precondition");
          },
        },
      });
    } catch (error) {
      buildAlreadyBoundFailures.push(error);
    }
  }
  const buildAlreadyBoundRetryState = readCertificationState(
    buildAlreadyBoundRetryStatePath,
  );
  const buildAlreadyBoundRetryWithoutReinstall =
    buildAlreadyBoundFailures.length === 2 &&
    buildAlreadyBoundFailures.every(
      (error) =>
        error?.classification === "SOURCE_CONTRACT_FAILURE" &&
        error?.consumed === false,
    ) &&
    buildAlreadyBoundRetryState.stages.build.attempts.length === 2 &&
    buildAlreadyBoundRetryState.worktrees.roles["final-artifact"]
      .dependencyStatus === "installed" &&
    dependencyInstallationAttemptCount(
      buildAlreadyBoundRetryRoot,
      "final-artifact",
    ) === 1;
  if (!buildAlreadyBoundRetryWithoutReinstall) {
    throw new Error(
      `already-bound build retry did not use read-only dependency revalidation: ${JSON.stringify({
        failures: buildAlreadyBoundFailures.map((error) => ({
          message: error?.message,
          classification: error?.classification,
          consumed: error?.consumed,
        })),
        stage: buildAlreadyBoundRetryState.stages.build,
        dependencyStatus:
          buildAlreadyBoundRetryState.worktrees.roles["final-artifact"]
            .dependencyStatus,
        installationAttempts: dependencyInstallationAttemptCount(
          buildAlreadyBoundRetryRoot,
          "final-artifact",
        ),
      })}`,
    );
  }
  const dependencyIdentityBeforeSuccessfulBuild =
    buildAlreadyBoundRetryState.worktrees.roles["final-artifact"]
      .dependencyIdentitySha256;
  const successfulBuildEnvironment = buildRetryEnvironment();
  const successfulBuildResult = await runBuildStage({
    repositoryRoot: canonicalRoot,
    environment: successfulBuildEnvironment,
    testHooks: {
      suppressBuildChildOutput: true,
      afterDependencyBinding() {
        bindBuildRetryCompletionTimestamp(successfulBuildEnvironment);
      },
    },
  });
  const successfulBuildState = readCertificationState(
    buildAlreadyBoundRetryStatePath,
  );
  const successfulBuildDescriptor = successfulBuildState.evidenceFiles.build;
  const successfulBuildEvidence = JSON.parse(
    readFileSync(
      path.join(evidenceRoot, successfulBuildDescriptor.path),
      "utf8",
    ),
  );
  const successfulBuildLifecycleIssues =
    certificationBuildGeneratedOutputIssues(
      successfulBuildEvidence.generatedOutputLifecycle,
      {
        certificationId: successfulBuildState.certificationId,
        candidateId: successfulBuildState.candidate.id,
        commitSha: successfulBuildState.candidate.commitSha,
        treeSha: successfulBuildState.candidate.treeSha,
        nextBuildId: successfulBuildState.bindings.nextBuildId,
        artifactSha256: successfulBuildState.bindings.artifactSha256,
        productionManifestSha256:
          successfulBuildState.bindings.productionManifestSha256,
        semanticJournalSha256:
          successfulBuildState.bindings.semanticJournalSha256,
        semanticJournalNonce:
          successfulBuildState.bindings.semanticJournalNonce,
      },
    );
  const successfulBuildWorktreeIssues = certificationWorktreeIssues({
    state: successfulBuildState,
    evidenceRoot,
    canonicalRoot,
  });
  const immediateBuildSnapshotDescriptor =
    successfulBuildState.evidenceFiles[
      snapshotEvidenceName("immediateBuild")
    ];
  const immediateBuildRootDescriptor =
    successfulBuildState.evidenceFiles[rootEvidenceName("immediateBuild")];
  const canonicalIgnoredBuildInputsUnchanged = Object.entries(
    canonicalIgnoredSnapshot,
  ).every(
    ([relativePath, digest]) =>
      sha256Bytes(readFileSync(path.join(canonicalRoot, relativePath))) ===
      digest,
  );
  const realBuildGeneratedOutputLifecyclePassed =
    successfulBuildState.stages.build.status === "passed" &&
    successfulBuildState.stages.build.attempts.length === 3 &&
    successfulBuildLifecycleIssues.length === 0 &&
    successfulBuildWorktreeIssues.length === 0 &&
    successfulBuildState.worktrees.roles["final-artifact"]
      .dependencyIdentitySha256 === dependencyIdentityBeforeSuccessfulBuild &&
    successfulBuildResult.artifactSha256 ===
      successfulBuildState.bindings.artifactSha256 &&
    !existsSync(path.join(artifactWorktreeRoot, "next-env.d.ts")) &&
    existsSync(path.join(artifactWorktreeRoot, ".next/BUILD_ID")) &&
    Boolean(immediateBuildSnapshotDescriptor?.sha256) &&
    Boolean(immediateBuildRootDescriptor?.sha256) &&
    canonicalIgnoredBuildInputsUnchanged;
  if (!realBuildGeneratedOutputLifecyclePassed) {
    throw new Error(
      `real build generated-output lifecycle did not pass its post-action boundary: ${JSON.stringify({
        stage: successfulBuildState.stages.build,
        lifecycleIssues: successfulBuildLifecycleIssues,
        worktreeIssues: successfulBuildWorktreeIssues,
        dependencyIdentityBeforeSuccessfulBuild,
        dependencyIdentityAfterSuccessfulBuild:
          successfulBuildState.worktrees.roles["final-artifact"]
            .dependencyIdentitySha256,
        nextEnvironmentPresent: existsSync(
          path.join(artifactWorktreeRoot, "next-env.d.ts"),
        ),
        immediateBuildSnapshotDescriptor,
        immediateBuildRootDescriptor,
        canonicalIgnoredBuildInputsUnchanged,
      })}`,
    );
  }
  write(artifactWorktreeRoot, ".env", "arbitrary-ignored-build-input\n");
  const arbitraryIgnoredBuildInputRejected = certificationWorktreeIssues({
    state: successfulBuildState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /ignored influential paths: \.env/.test(issue));
  rmSync(path.join(artifactWorktreeRoot, ".env"));
  if (!arbitraryIgnoredBuildInputRejected) {
    throw new Error("real build worktree accepted an arbitrary ignored input");
  }
  for (const descriptorToRemove of [
    successfulBuildDescriptor,
    immediateBuildSnapshotDescriptor,
    immediateBuildRootDescriptor,
  ]) {
    rmSync(path.join(evidenceRoot, descriptorToRemove.path));
  }
  for (const relativePath of [
    "node_modules",
    ".local",
    ".next",
    "next-env.d.ts",
  ]) {
    rmSync(path.join(artifactWorktreeRoot, relativePath), {
      recursive: true,
      force: true,
    });
  }
  rmSync(
    path.join(evidenceRoot, "worktree-dependencies/final-artifact"),
    { recursive: true, force: true },
  );
  rmSync(buildAlreadyBoundRetryStatePath);
  const postDispatchBuildFailureStatePath = path.join(
    evidenceRoot,
    "post-dispatch-build-failure-state.json",
  );
  writeCertificationState(postDispatchBuildFailureStatePath, state);
  let postDispatchBuildFailure = null;
  try {
    await runBuildStage({
      repositoryRoot: canonicalRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PRODUCTION_CERTIFICATION_STATE: postDispatchBuildFailureStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: "2099-08-14T00:00:00.000Z",
      },
      testHooks: {
        suppressBuildChildOutput: true,
        afterBuildChild({ repositoryRoot }) {
          writeFileSync(
            path.join(
              repositoryRoot,
              ".local/production-artifact-evidence/manifest.json",
            ),
            "{}\n",
          );
        },
      },
    });
  } catch (error) {
    postDispatchBuildFailure = error;
  }
  const postDispatchFailedState = readCertificationState(
    postDispatchBuildFailureStatePath,
  );
  const postDispatchFailedDescriptor =
    postDispatchFailedState.evidenceFiles.build;
  if (!postDispatchFailedDescriptor) {
    throw new Error(
      `post-dispatch build failure did not retain failed-output evidence: ${JSON.stringify({
        message: postDispatchBuildFailure?.message,
        classification: postDispatchBuildFailure?.classification,
        consumed: postDispatchBuildFailure?.consumed,
        stage: postDispatchFailedState.stages.build,
      })}`,
    );
  }
  const postDispatchFailedEvidence = JSON.parse(
    readFileSync(
      path.join(evidenceRoot, postDispatchFailedDescriptor.path),
      "utf8",
    ),
  );
  const postDispatchFailedLifecycle =
    postDispatchFailedEvidence.generatedOutputLifecycle;
  const postDispatchFailedLifecycleIssues =
    certificationFailedBuildGeneratedOutputIssues(
      postDispatchFailedLifecycle,
      {
        certificationId: postDispatchFailedState.certificationId,
        candidateId: postDispatchFailedState.candidate.id,
        commitSha: postDispatchFailedState.candidate.commitSha,
        treeSha: postDispatchFailedState.candidate.treeSha,
        stage: "build",
        attempt: 1,
        classification: "BUILD_FAILURE",
        consumedSubstantiveGate: true,
        semanticJournalNonce:
          postDispatchFailedLifecycle.identity.semanticJournalNonce,
      },
    );
  const postDispatchFailedWorktreeIssues = certificationWorktreeIssues({
    state: postDispatchFailedState,
    evidenceRoot,
    canonicalRoot,
  });
  let postDispatchFailedArchiveBlocked = false;
  try {
    startCertificationStage(postDispatchFailedState, {
      stage: "archive-preflight",
      startedAt: nextTimestamp(),
    });
  } catch {
    postDispatchFailedArchiveBlocked = true;
  }
  write(artifactWorktreeRoot, ".env", "arbitrary-ignored-build-input\n");
  const postDispatchFailedArbitraryIgnoredInputRejected =
    certificationWorktreeIssues({
      state: postDispatchFailedState,
      evidenceRoot,
      canonicalRoot,
    }).some((issue) => /ignored influential paths: \.env/.test(issue));
  rmSync(path.join(artifactWorktreeRoot, ".env"));
  const postDispatchBuildFailureLifecyclePassed =
    postDispatchBuildFailure?.classification === "BUILD_FAILURE" &&
    postDispatchBuildFailure?.consumed === true &&
    postDispatchFailedState.stages.build.status === "failed" &&
    postDispatchFailedState.stages.build.failureClassification ===
      "BUILD_FAILURE" &&
    postDispatchFailedState.stages.build.consumedSubstantiveGate === true &&
    postDispatchFailedEvidence.schema ===
      "interior-ai.production-certification-failed-build-result.v1" &&
    postDispatchFailedEvidence.process.exitCode === 0 &&
    postDispatchFailedLifecycleIssues.length === 0 &&
    postDispatchFailedWorktreeIssues.length === 0 &&
    !existsSync(path.join(artifactWorktreeRoot, "next-env.d.ts")) &&
    existsSync(path.join(artifactWorktreeRoot, ".next/BUILD_ID")) &&
    postDispatchFailedArchiveBlocked &&
    postDispatchFailedArbitraryIgnoredInputRejected;
  if (!postDispatchBuildFailureLifecyclePassed) {
    throw new Error(
      `post-dispatch build failure did not seal generated output and preserve a valid failed worktree: ${JSON.stringify({
        message: postDispatchBuildFailure?.message,
        classification: postDispatchBuildFailure?.classification,
        consumed: postDispatchBuildFailure?.consumed,
        stage: postDispatchFailedState.stages.build,
        evidenceSchema: postDispatchFailedEvidence.schema,
        process: postDispatchFailedEvidence.process,
        lifecycleIssues: postDispatchFailedLifecycleIssues,
        worktreeIssues: postDispatchFailedWorktreeIssues,
        nextEnvironmentPresent: existsSync(
          path.join(artifactWorktreeRoot, "next-env.d.ts"),
        ),
        archiveBlocked: postDispatchFailedArchiveBlocked,
        arbitraryIgnoredInputRejected:
          postDispatchFailedArbitraryIgnoredInputRejected,
      })}`,
    );
  }
  rmSync(path.join(evidenceRoot, postDispatchFailedDescriptor.path));
  for (const relativePath of [
    "node_modules",
    ".local",
    ".next",
    "next-env.d.ts",
  ]) {
    rmSync(path.join(artifactWorktreeRoot, relativePath), {
      recursive: true,
      force: true,
    });
  }
  rmSync(
    path.join(evidenceRoot, "worktree-dependencies/final-artifact"),
    { recursive: true, force: true },
  );
  rmSync(postDispatchBuildFailureStatePath);
  const danglingGeneratedOutputStatePath = path.join(
    evidenceRoot,
    "dangling-generated-output-state.json",
  );
  writeCertificationState(danglingGeneratedOutputStatePath, state);
  let danglingGeneratedOutputFailure = null;
  try {
    await runBuildStage({
      repositoryRoot: canonicalRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PRODUCTION_CERTIFICATION_STATE: danglingGeneratedOutputStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: "2099-08-14T00:00:00.000Z",
      },
      testHooks: {
        suppressBuildChildOutput: true,
        afterBuildChild({ repositoryRoot }) {
          const generatedOutputPath = path.join(
            repositoryRoot,
            "next-env.d.ts",
          );
          rmSync(generatedOutputPath);
          symlinkSync("missing-next-env-target", generatedOutputPath);
          writeFileSync(
            path.join(
              repositoryRoot,
              ".local/production-artifact-evidence/manifest.json",
            ),
            "{}\n",
          );
        },
      },
    });
  } catch (error) {
    danglingGeneratedOutputFailure = error;
  }
  const danglingGeneratedOutputState = readCertificationState(
    danglingGeneratedOutputStatePath,
  );
  const danglingGeneratedOutputGuardPassed =
    danglingGeneratedOutputFailure?.classification === "BUILD_FAILURE" &&
    danglingGeneratedOutputFailure?.consumed === true &&
    /strict failed build generated-output lifecycle failed: next-env\.d\.ts is not a physical regular generated file/.test(
      danglingGeneratedOutputFailure?.message ?? "",
    ) &&
    danglingGeneratedOutputState.stages.build.status === "failed" &&
    danglingGeneratedOutputState.evidenceFiles.build === undefined &&
    lstatSync(path.join(artifactWorktreeRoot, "next-env.d.ts")).isSymbolicLink();
  if (!danglingGeneratedOutputGuardPassed) {
    throw new Error(
      `failed-build generated-output guard bypassed a dangling symlink: ${JSON.stringify({
        message: danglingGeneratedOutputFailure?.message,
        classification: danglingGeneratedOutputFailure?.classification,
        consumed: danglingGeneratedOutputFailure?.consumed,
        stage: danglingGeneratedOutputState.stages.build,
        buildEvidence: danglingGeneratedOutputState.evidenceFiles.build,
      })}`,
    );
  }
  unlinkSync(path.join(artifactWorktreeRoot, "next-env.d.ts"));
  for (const relativePath of [
    "node_modules",
    ".local",
    ".next",
  ]) {
    rmSync(path.join(artifactWorktreeRoot, relativePath), {
      recursive: true,
      force: true,
    });
  }
  rmSync(
    path.join(evidenceRoot, "worktree-dependencies/final-artifact"),
    { recursive: true, force: true },
  );
  rmSync(danglingGeneratedOutputStatePath);
  const buildDependencyDriftStatePath = path.join(
    evidenceRoot,
    "build-dependency-drift-state.json",
  );
  writeCertificationState(buildDependencyDriftStatePath, state);
  let buildDependencyStageFailure = null;
  try {
    await runBuildStage({
      repositoryRoot: canonicalRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PRODUCTION_CERTIFICATION_STATE: buildDependencyDriftStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: "2099-08-14T00:00:00.000Z",
      },
      testHooks: {
        suppressBuildChildOutput: true,
        beforePostBuildDependencyRevalidation({ repositoryRoot }) {
          writeFileSync(
            path.join(
              repositoryRoot,
              "node_modules/simulation-fixture/index.js",
            ),
            "module.exports = 'post-build-stage-drift';\n",
          );
        },
      },
    });
  } catch (error) {
    buildDependencyStageFailure = error;
  }
  const buildDependencyDriftState = readCertificationState(
    buildDependencyDriftStatePath,
  );
  let buildDependencyDriftBlockedArchive = false;
  try {
    startCertificationStage(buildDependencyDriftState, {
      stage: "archive-preflight",
      startedAt: nextTimestamp(),
    });
  } catch {
    buildDependencyDriftBlockedArchive = true;
  }
  const postBuildStageDependencyDriftRejected =
    buildDependencyStageFailure?.classification === "FINAL_EVIDENCE_FAILURE" &&
    buildDependencyStageFailure?.consumed === true &&
    buildDependencyDriftState.stages.build.status === "failed" &&
    buildDependencyDriftState.stages.build.failureClassification ===
      "FINAL_EVIDENCE_FAILURE" &&
    buildDependencyDriftState.stages.build.consumedSubstantiveGate === true &&
    buildDependencyDriftState.worktrees.roles["final-artifact"]
      .dependencyStatus === "installed" &&
    dependencyInstallationAttemptCount(evidenceRoot, "final-artifact") === 1 &&
    buildDependencyDriftBlockedArchive;
  if (!postBuildStageDependencyDriftRejected) {
    throw new Error(
      `real build stage did not reject post-build dependency drift and block archive: ${JSON.stringify({
        message: buildDependencyStageFailure?.message,
        classification: buildDependencyStageFailure?.classification,
        consumed: buildDependencyStageFailure?.consumed,
        stage: buildDependencyDriftState.stages.build,
        dependencyStatus:
          buildDependencyDriftState.worktrees.roles["final-artifact"]
            .dependencyStatus,
        blocked: buildDependencyDriftBlockedArchive,
      })}`,
    );
  }
  writeFileSync(
    path.join(
      artifactWorktreeRoot,
      "node_modules/simulation-fixture/index.js",
    ),
    "module.exports = 'simulation-fixture';\n",
  );
  for (const relativePath of [
    "node_modules",
    ".next",
    ".local",
    "next-env.d.ts",
  ]) {
    rmSync(path.join(artifactWorktreeRoot, relativePath), {
      recursive: true,
      force: true,
    });
  }
  rmSync(
    path.join(evidenceRoot, "worktree-dependencies/final-artifact"),
    { recursive: true, force: true },
  );
  rmSync(buildDependencyDriftStatePath);
  fixtureRoot = artifactWorktreeRoot;
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "build", startedAt: nextTimestamp() },
  });
  state = installAndBindSimulationRole({
    canonicalRoot,
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    statePath,
    state,
    role: "final-artifact",
    stage: "build",
  });
  const simulatedBuildGeneratedOutputPreflight =
    preflightCertificationBuildGeneratedOutput({
      repositoryRoot: fixtureRoot,
    });
  writeMiniatureArtifact(fixtureRoot);
  writeFileSync(
    path.join(fixtureRoot, "next-env.d.ts"),
    NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
    { flag: "wx" },
  );
  const production = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-certification-simulation.mjs", "emit-production-evidence"],
      fixtureRoot,
      projectCertificationChildEnvironment({
        repositoryRoot: fixtureRoot,
        baseEnvironment: { ...process.env, ...environment },
        stage: "simulation",
        profileId: "simulation-production-evidence",
        stageInputs: {
          CERTIFICATION_ENVIRONMENT_STAGE: "simulation",
          CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
          CERTIFICATION_QUALIFICATION_MODE: "1",
          CERTIFICATION_SIMULATION_NPM_VERSION: identity.npmVersion,
          CERTIFICATION_EXPECTED_COMMIT_SHA: identity.commitSha,
          CERTIFICATION_EXPECTED_TREE_SHA: identity.treeSha,
          DATABASE_URL: environment.DATABASE_URL,
          GOOGLE_CLIENT_ID: environment.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: environment.GOOGLE_CLIENT_SECRET,
        },
      }).environment,
    ),
  );
  const postBuildDependencyDriftRejected =
    postBuildStageDependencyDriftRejected;
  const certificationProcessHandoffRetained =
    production.manifest.execution.owner.processHandoffs.length === 1 &&
    production.manifest.execution.owner.processHandoffs[0].boundary ===
      "post-dependency-install-pre-generated-source";
  if (!certificationProcessHandoffRetained) {
    throw new Error("simulation certification build omitted its required process handoff");
  }
  const buildBindings = {
    semanticJournalNonce: FIXED_NONCE,
    nextBuildId: production.manifest.build.nextBuildId,
    artifactSha256: production.manifest.artifact.sha256,
    productionManifestSha256: production.manifestSha256,
    semanticJournalSha256: production.journalSha256,
  };
  const simulatedBuildGeneratedOutputLifecycle =
    finalizeCertificationBuildGeneratedOutput({
      repositoryRoot: fixtureRoot,
      preflight: simulatedBuildGeneratedOutputPreflight,
      identity: {
        certificationId: state.certificationId,
        candidateId: state.candidate.id,
        commitSha: state.candidate.commitSha,
        treeSha: state.candidate.treeSha,
        nextBuildId: buildBindings.nextBuildId,
        artifactSha256: buildBindings.artifactSha256,
        productionManifestSha256: buildBindings.productionManifestSha256,
        semanticJournalSha256: buildBindings.semanticJournalSha256,
        semanticJournalNonce: buildBindings.semanticJournalNonce,
      },
    });
  const finalArtifactPostBuildRevalidation =
    revalidateSimulationRoleDependencies({
      repositoryRoot: fixtureRoot,
      evidenceRoot,
      state,
      role: "final-artifact",
      boundary: "post-build",
    });
  const buildDescriptor = writeEvidence(evidenceRoot, "build/result.json", {
    schema: "interior-ai.production-certification-build-result.v1",
    identity: {
      ...identityFromState(state),
      semanticJournalNonce: FIXED_NONCE,
      productionManifestSha256: production.manifestSha256,
      semanticJournalSha256: production.journalSha256,
    },
    dependencyLifecycle: {
      status: "installed",
      bindingEvidence:
        state.worktrees.roles["final-artifact"].dependencyBindingEvidence,
      semanticProcessHandoff:
        production.manifest.execution.owner.processHandoffs[0],
      postBuildRevalidation: finalArtifactPostBuildRevalidation,
    },
    generatedOutputLifecycle: simulatedBuildGeneratedOutputLifecycle,
    complete: true,
  });
  const immediateSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "immediateBuild",
    bindingOverrides: buildBindings,
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "build",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: {
      manifest: production.manifestSha256,
      journal: production.journalSha256,
      artifact: production.manifest.artifact.sha256,
    },
    bindingUpdates: buildBindings,
    evidenceFiles: {
      build: buildDescriptor,
      [snapshotEvidenceName("immediateBuild")]:
        immediateSnapshot.snapshotDescriptor,
      [rootEvidenceName("immediateBuild")]: immediateSnapshot.rootDescriptor,
    },
    },
  });
  const archiveEnvironment = {
    ...process.env,
    ...environment,
    CERTIFICATION_QUALIFICATION_MODE: "1",
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    PRODUCTION_ARCHIVE_SOURCE_ROOT: fixtureRoot,
    PRODUCTION_ARCHIVE_PLAN: path.join(evidenceRoot, "archive/plan.json"),
    PRODUCTION_ARCHIVE_STAGE_ROOT: path.join(evidenceRoot, "archive/stage"),
    PRODUCTION_ARCHIVE_PATH: path.join(evidenceRoot, "archive/candidate.tar.gz"),
    PRODUCTION_ARCHIVE_EXTRACTION_ROOT: path.join(evidenceRoot, "archive/extracted"),
    PRODUCTION_EVIDENCE_EXPECTED_CANDIDATE_ID: SIMULATION_ID,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: identity.commitSha,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: identity.treeSha,
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: production.manifest.build.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: production.manifest.artifact.sha256,
  };
  run(
    process.execPath,
    ["scripts/production-archive.mjs", "plan"],
    fixtureRoot,
    archiveEnvironment,
  );
  const plan = JSON.parse(
    readFileSync(path.join(evidenceRoot, "archive/plan.json"), "utf8"),
  );
  const planDescriptor = descriptor(
    evidenceRoot,
    path.join(evidenceRoot, "archive/plan.json"),
  );
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "archive-preflight",
      startedAt: nextTimestamp(),
    },
  });
  const stageRoot = path.join(evidenceRoot, "archive", "stage");
  const staged = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "verify"],
      fixtureRoot,
      archiveEnvironment,
    ),
  );
  const preflightDescriptor = descriptor(
    evidenceRoot,
    path.join(stageRoot, ".certification/archive-preflight.json"),
  );
  const stagedSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "stagedArchive",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "archive-preflight",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { plan: planDescriptor.sha256, preflight: preflightDescriptor.sha256 },
    bindingUpdates: {
      verifierSourceClosureSha256: plan.verifierClosure.closureSha256,
    },
    evidenceFiles: {
      "archive-plan": planDescriptor,
      "archive-preflight": preflightDescriptor,
      [snapshotEvidenceName("stagedArchive")]: stagedSnapshot.snapshotDescriptor,
      [rootEvidenceName("stagedArchive")]: stagedSnapshot.rootDescriptor,
    },
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "archive", startedAt: nextTimestamp() },
  });
  const archivePath = path.join(evidenceRoot, "archive", "candidate.tar.gz");
  const compressed = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "create"],
      fixtureRoot,
      archiveEnvironment,
    ),
  );
  const repeatedArchivePath = path.join(
    evidenceRoot,
    "archive",
    "candidate-repeat.tar.gz",
  );
  chmodSync(path.join(stageRoot, "package.json"), 0o600);
  const repeatedCompression = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "create"],
      fixtureRoot,
      { ...archiveEnvironment, PRODUCTION_ARCHIVE_PATH: repeatedArchivePath },
    ),
  );
  if (repeatedCompression.archiveSha256 !== compressed.archiveSha256) {
    throw new Error("simulation archive compression is not deterministic");
  }
  rmSync(repeatedArchivePath);
  const archiveDescriptor = descriptor(evidenceRoot, archivePath);
  const inventoryDescriptor = descriptor(
    evidenceRoot,
    path.join(stageRoot, ".certification/archive-inventory.json"),
  );
  const compressedSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "compressedArchive",
    bindingOverrides: {
      archiveSha256: compressed.archiveSha256,
      archiveInventorySha256: staged.inventorySha256,
    },
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "archive",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: {
      archive: archiveDescriptor.sha256,
      inventory: inventoryDescriptor.sha256,
    },
    bindingUpdates: {
      archiveSha256: compressed.archiveSha256,
      archiveInventorySha256: staged.inventorySha256,
    },
    evidenceFiles: {
      archive: archiveDescriptor,
      "archive-inventory": inventoryDescriptor,
      [snapshotEvidenceName("compressedArchive")]:
        compressedSnapshot.snapshotDescriptor,
      [rootEvidenceName("compressedArchive")]: compressedSnapshot.rootDescriptor,
    },
    consumedSubstantiveGate: true,
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "extracted-archive-preflight",
      startedAt: nextTimestamp(),
    },
  });
  const extractionRoot = path.join(evidenceRoot, "archive", "extracted");
  const extracted = JSON.parse(
    run(
      process.execPath,
      ["scripts/production-archive.mjs", "extract-and-verify"],
      fixtureRoot,
      archiveEnvironment,
    ),
  );
  const extractedDescriptor = descriptor(
    evidenceRoot,
    path.join(extractionRoot, ".certification/archive-preflight.json"),
  );
  const extractedSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "extractedArchive",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "extracted-archive-preflight",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { extractedInventory: extracted.inventorySha256 },
    evidenceFiles: {
      "extracted-archive-preflight": extractedDescriptor,
      [snapshotEvidenceName("extractedArchive")]:
        extractedSnapshot.snapshotDescriptor,
      [rootEvidenceName("extractedArchive")]: extractedSnapshot.rootDescriptor,
    },
    },
  });
  const phaseBoundaryArtifact = path.join(
    fixtureRoot,
    ".next/static/chunk.js",
  );
  const phaseBoundaryOriginal = readFileSync(phaseBoundaryArtifact);
  const exercisePhaseBoundaryMutation = ({ name, mutateBeforeStart }) => {
    const boundaryEvidenceRoot = path.join(
      simulationRoot,
      `phase-boundary-${name}`,
    );
    mkdirSync(boundaryEvidenceRoot, { mode: 0o700 });
    if (mutateBeforeStart) {
      writeFileSync(phaseBoundaryArtifact, `${name} mutation\n`);
    }
    const phaseBoundaryState = startCertificationStage(state, {
      stage: "phase8",
      startedAt: new Date(Date.parse(state.updatedAt) + 50).toISOString(),
    });
    if (!mutateBeforeStart) {
      writeFileSync(phaseBoundaryArtifact, `${name} mutation\n`);
    }
    let rejected = false;
    try {
      captureArtifactSnapshot({
        repositoryRoot: fixtureRoot,
        evidenceRoot: boundaryEvidenceRoot,
        state: phaseBoundaryState,
        position: "postPhase8Live",
      });
    } catch (error) {
      rejected = /physical artifact identity contradicts/.test(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      writeFileSync(phaseBoundaryArtifact, phaseBoundaryOriginal);
    }
    if (!rejected) {
      throw new Error(`physical live artifact mutation was not rejected: ${name}`);
    }
    return true;
  };
  const liveMutationBeforePhase8Rejected = exercisePhaseBoundaryMutation({
    name: "before-phase8",
    mutateBeforeStart: true,
  });
  const liveMutationDuringPhase8Rejected = exercisePhaseBoundaryMutation({
    name: "during-phase8",
    mutateBeforeStart: false,
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "phase8", startedAt: nextTimestamp() },
  });
  const phase8RawDescriptor = writeEvidence(evidenceRoot, "phase8/raw-evidence.json", {
    schema: "interior-ai.phase8-project-benchmark-evidence.v1",
    simulation: true,
    run: { nonce: "simulation-phase8-run" },
    finalPassed: true,
  });
  const phase8CompletionDescriptor = writeEvidence(
    evidenceRoot,
    "phase8/complete.json",
    {
      schema: "interior-ai.phase8-project-benchmark-parent-completion.v1",
      nonce: "simulation-phase8-run",
      reportFile: "evidence.json",
      reportSha256: phase8RawDescriptor.sha256,
    },
  );
  const phase8Descriptor = writeEvidence(
    evidenceRoot,
    "phase8/evidence.json",
    phase8Evidence(state, fixtureRoot, phase8RawDescriptor.sha256),
  );
  const postPhase8Snapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "postPhase8Live",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "phase8",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { phase8: phase8Descriptor.sha256 },
    bindingUpdates: { phase8EvidenceSha256: phase8Descriptor.sha256 },
    evidenceFiles: {
      phase8: phase8Descriptor,
      "phase8-raw": phase8RawDescriptor,
      "phase8-completion": phase8CompletionDescriptor,
      [snapshotEvidenceName("postPhase8Live")]:
        postPhase8Snapshot.snapshotDescriptor,
      [rootEvidenceName("postPhase8Live")]: postPhase8Snapshot.rootDescriptor,
    },
    consumedSubstantiveGate: true,
    },
  });
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "runtime-smoke", startedAt: nextTimestamp() },
  });
  const runtimeReportPath = path.join(
    evidenceRoot,
    "runtime-smoke/playwright-report.json",
  );
  const runtimeTimingPath = path.join(
    evidenceRoot,
    "runtime-smoke/phase-timings.json",
  );
  const runtimeStartPath = path.join(
    evidenceRoot,
    "runtime-smoke/product-test-start.json",
  );
  const runtimeSummaryPath = path.join(
    evidenceRoot,
    "runtime-smoke/evidence.json",
  );
  const simulationRuntimeProfile = certificationEnvironmentProfile(
    fixtureRoot,
    "runtime-smoke",
  );
  const simulationRuntimeProjection = projectCertificationChildEnvironment({
    repositoryRoot: fixtureRoot,
    baseEnvironment: {
      ...process.env,
      ...environment,
      CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    },
    stage: "runtime-smoke",
    profileId: "runtime-smoke",
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
      CERTIFICATION_RUNTIME_STAGE_ATTEMPT: String(
        state.stages["runtime-smoke"].attempts.at(-1).number,
      ),
      CERTIFICATION_RUNTIME_START_MARKER_PATH: runtimeStartPath,
      DATABASE_URL: environment.DATABASE_URL,
      GOOGLE_CLIENT_ID: environment.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: environment.GOOGLE_CLIENT_SECRET,
      CERTIFICATION_STAGE_ENVIRONMENT_CONTRACT_SHA256:
        simulationRuntimeProfile.contract.sha256,
      CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID: "runtime-smoke",
      CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256:
        simulationRuntimeProfile.sha256,
      PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
      PLAYWRIGHT_JSON_OUTPUT_FILE: runtimeReportPath,
      PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
      PRODUCTION_CERTIFICATION_ID: state.certificationId,
      PRODUCTION_EVIDENCE_CANDIDATE_ID: state.candidate.id,
      PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256:
        state.bindings.artifactSha256,
      PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: state.bindings.nextBuildId,
      PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
      PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE:
        state.bindings.semanticJournalNonce,
      PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256:
        state.bindings.semanticJournalSha256,
      PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256:
        state.bindings.productionManifestSha256,
      PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: state.candidate.treeSha,
      PRODUCTION_EVIDENCE_JOURNAL_PATH:
        ".local/production-artifact-evidence/semantic-event-journal.json",
      PRODUCTION_EVIDENCE_MANIFEST:
        ".local/production-artifact-evidence/manifest.json",
      RUNTIME_SMOKE_PHASE_TIMINGS_PATH: runtimeTimingPath,
    },
  });
  if (
    simulationRuntimeProjection.environment.CERTIFICATION_EVIDENCE_ROOT !==
    undefined
  ) {
    throw new Error("simulation runtime child inherited the parent-only evidence root");
  }
  const simulationRuntimeDestinations = preflightRuntimeSmokeEvidenceOutputs({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    reportPath: runtimeReportPath,
    timingPath: runtimeTimingPath,
    summaryPath: runtimeSummaryPath,
    startMarkerPath: runtimeStartPath,
  });
  const runtimeReportDescriptor = writeEvidence(
    evidenceRoot,
    "runtime-smoke/playwright-report.json",
    simulatedRuntimePlaywrightReport(state),
  );
  let simulationRuntimeClock = 0;
  const simulationRuntimeRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: fixtureRoot,
    timingPath: runtimeTimingPath,
    environment: simulationRuntimeProjection.environment,
    now: () => simulationRuntimeClock++,
  });
  if (
    simulationRuntimeRecorder.destination?.outputPath !==
      simulationRuntimeDestinations.timings.outputPath ||
    simulationRuntimeRecorder.destination?.rootContractSha256 !==
      simulationRuntimeDestinations.timings.rootContractSha256
  ) {
    throw new Error("simulation runner preflight and timing writer diverged");
  }
  for (const phase of RUNTIME_SMOKE_PHASE_BUDGETS) {
    await simulationRuntimeRecorder.run(phase.name, async () => undefined);
  }
  const simulatedPhaseTimings = JSON.parse(
    readFileSync(runtimeTimingPath, "utf8"),
  );
  const runtimeTimingsDescriptor = descriptor(evidenceRoot, runtimeTimingPath);
  const runtimeStartDescriptor = writeEvidence(
    evidenceRoot,
    "runtime-smoke/product-test-start.json",
    {
      schema: "interior-ai.production-certification-playwright-start.v1",
      boundary: "test-begin",
      gateId: "ci.production-runtime-smoke",
      project: "chromium",
      title: "simulated runtime product test",
      retry: 0,
    },
  );
  const simulatedRuntimeEvidence = runtimeEvidence(
    state,
    runtimeReportDescriptor.sha256,
    runtimeTimingsDescriptor.sha256,
    simulatedPhaseTimings,
    simulationRuntimeProjection.metadata,
  );
  const runtimeDescriptor = writeEvidence(
    evidenceRoot,
    path.relative(evidenceRoot, runtimeSummaryPath),
    simulatedRuntimeEvidence,
  );
  const runtimeValidationState = structuredClone(state);
  runtimeValidationState.evidenceFiles["runtime-phase-timings"] =
    runtimeTimingsDescriptor;
  const baselineRuntimeIssues = validateRuntimeEvidence(
    simulatedRuntimeEvidence,
    runtimeValidationState,
    fixtureRoot,
  );
  if (baselineRuntimeIssues.length > 0) {
    throw new Error(
      `simulation runtime evidence baseline is invalid: ${baselineRuntimeIssues.join("; ")}`,
    );
  }
  const rejectsRuntimeMutation = (mutate) => {
    const changed = structuredClone(simulatedRuntimeEvidence);
    mutate(changed);
    return validateRuntimeEvidence(
      changed,
      runtimeValidationState,
      fixtureRoot,
    ).length > 0;
  };
  const wrongRuntimeRoot = path.join(simulationRoot, "wrong-runtime-root");
  mkdirSync(wrongRuntimeRoot);
  const wrongRuntimeTimingPath = path.join(wrongRuntimeRoot, "phase-timings.json");
  const runtimePathRejected = (environmentOverride, timingPath) => {
    try {
      resolveRuntimeSmokeTimingDestination({
        repositoryRoot: fixtureRoot,
        timingPath,
        environment: {
          ...simulationRuntimeProjection.environment,
          ...environmentOverride,
        },
      });
      return false;
    } catch {
      return true;
    }
  };
  const runtimeRootTamperCases = Object.freeze({
    missingRuntimeRootRejected: runtimePathRejected(
      { PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: "" },
      runtimeTimingPath,
    ),
    wrongRuntimeRootRejected: runtimePathRejected(
      { PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: wrongRuntimeRoot },
      runtimeTimingPath,
    ),
    runtimePathOutsideRootRejected: runtimePathRejected(
      { PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: evidenceRoot },
      wrongRuntimeTimingPath,
    ),
    runtimeArtifactMismatchRejected: rejectsRuntimeMutation((evidence) => {
      evidence.phaseTimings.identity.artifactSha256 = "f".repeat(64);
    }),
    runtimeTimingJournalV1Rejected: rejectsRuntimeMutation((evidence) => {
      evidence.phaseTimings.identity.semanticJournalSchema =
        "interior-ai.production-artifact-semantic-event-journal.v1";
      evidence.phaseTimings.identity.semanticJournalVersion = 1;
    }),
    runtimeEnvelopeJournalV1Rejected: rejectsRuntimeMutation((evidence) => {
      evidence.journalIdentity.schema =
        "interior-ai.production-artifact-semantic-event-journal.v1";
      evidence.journalIdentity.version = 1;
    }),
    runtimeJournalNonceMismatchRejected: rejectsRuntimeMutation((evidence) => {
      evidence.journalIdentity.runNonce =
        "123e4567-e89b-42d3-a456-426614174099";
    }),
    runtimeCertificationMismatchRejected: rejectsRuntimeMutation((evidence) => {
      evidence.phaseTimings.identity.certificationId = "another-certification";
    }),
    runtimeRootContractMismatchRejected: rejectsRuntimeMutation((evidence) => {
      evidence.phaseTimings.rootContract.sha256 = "e".repeat(64);
    }),
    runtimeCompletionMissingRejected: rejectsRuntimeMutation((evidence) => {
      delete evidence.phaseTimings.completionMarker;
    }),
    sourceRuntimeProfileRejected: rejectsRuntimeMutation((evidence) => {
      evidence.phaseTimings.identity.runtimeStageProfileId = "source-validation";
      evidence.stageEnvironment.profileId = "source-validation";
    }),
    developmentRuntimeProfileRejected: rejectsRuntimeMutation((evidence) => {
      evidence.phaseTimings.identity.runtimeStageProfileId =
        "development-browser-owner";
      evidence.stageEnvironment.profileId = "development-browser-owner";
    }),
  });
  if (Object.values(runtimeRootTamperCases).some((passed) => !passed)) {
    throw new Error("simulation runtime evidence-root tamper matrix did not fail closed");
  }
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
    stage: "runtime-smoke",
    passed: true,
    completedAt: nextTimestamp(),
    exitCode: 0,
    outputHashes: { runtime: runtimeDescriptor.sha256 },
    bindingUpdates: { runtimeSmokeEvidenceSha256: runtimeDescriptor.sha256 },
    evidenceFiles: {
      "runtime-smoke": runtimeDescriptor,
      "runtime-report": runtimeReportDescriptor,
      "runtime-phase-timings": runtimeTimingsDescriptor,
      "runtime-start": runtimeStartDescriptor,
    },
      consumedSubstantiveGate: true,
    },
  });
  const browserAlreadyBoundRetryStatePath = path.join(
    evidenceRoot,
    "browser-already-bound-retry-state.json",
  );
  writeCertificationState(browserAlreadyBoundRetryStatePath, state);
  const browserAlreadyBoundFailures = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await runBrowserOwnersStage({
        repositoryRoot: canonicalRoot,
        environment: {
          ...doctorEnvironment,
          CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
          PRODUCTION_CERTIFICATION_STATE: browserAlreadyBoundRetryStatePath,
          CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
          CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
        },
        testHooks: {
          afterDependencyBinding() {
            throw new Error("qualification post-bind browser precondition");
          },
        },
      });
    } catch (error) {
      browserAlreadyBoundFailures.push(error);
    }
  }
  const browserAlreadyBoundRetryState = readCertificationState(
    browserAlreadyBoundRetryStatePath,
  );
  const browserAlreadyBoundRetryWithoutReinstall =
    browserAlreadyBoundFailures.length === 2 &&
    browserAlreadyBoundFailures.every(
      (error) =>
        error?.classification === "SOURCE_CONTRACT_FAILURE" &&
        error?.consumed === false,
    ) &&
    browserAlreadyBoundRetryState.stages["browser-owners"].attempts.length ===
      2 &&
    browserAlreadyBoundRetryState.worktrees.roles["development-browser"]
      .dependencyStatus === "installed" &&
    dependencyInstallationAttemptCount(
      evidenceRoot,
      "development-browser",
    ) === 1;
  if (!browserAlreadyBoundRetryWithoutReinstall) {
    throw new Error(
      `already-bound browser retry did not use read-only dependency revalidation: ${JSON.stringify({
        failures: browserAlreadyBoundFailures.map((error) => ({
          message: error?.message,
          classification: error?.classification,
          consumed: error?.consumed,
        })),
        stage: browserAlreadyBoundRetryState.stages["browser-owners"],
        dependencyStatus:
          browserAlreadyBoundRetryState.worktrees.roles["development-browser"]
            .dependencyStatus,
        installationAttempts: dependencyInstallationAttemptCount(
          evidenceRoot,
          "development-browser",
        ),
      })}`,
    );
  }
  rmSync(path.join(developmentWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });
  rmSync(
    path.join(evidenceRoot, "worktree-dependencies/development-browser"),
    { recursive: true, force: true },
  );
  rmSync(browserAlreadyBoundRetryStatePath);
  const browserDependencyDriftStatePath = path.join(
    evidenceRoot,
    "browser-dependency-drift-state.json",
  );
  writeCertificationState(browserDependencyDriftStatePath, state);
  let browserDependencyStageFailure = null;
  try {
    await runBrowserOwnersStage({
      repositoryRoot: canonicalRoot,
      environment: {
        ...doctorEnvironment,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PRODUCTION_CERTIFICATION_STATE: browserDependencyDriftStatePath,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      },
      testHooks: {
        beforePreOwnerDependencyRevalidation({ developmentBrowserRoot }) {
          writeFileSync(
            path.join(
              developmentBrowserRoot,
              "node_modules/simulation-fixture/index.js",
            ),
            "module.exports = 'pre-browser-stage-drift';\n",
          );
        },
      },
    });
  } catch (error) {
    browserDependencyStageFailure = error;
  }
  const browserDependencyDriftState = readCertificationState(
    browserDependencyDriftStatePath,
  );
  let browserDependencyDriftBlockedFinal = false;
  try {
    startCertificationStage(browserDependencyDriftState, {
      stage: "final-standalone",
      startedAt: nextTimestamp(),
    });
  } catch {
    browserDependencyDriftBlockedFinal = true;
  }
  const preBrowserDependencyDriftRejected =
    browserDependencyStageFailure?.classification ===
      "FINAL_EVIDENCE_FAILURE" &&
    browserDependencyStageFailure?.consumed === false &&
    browserDependencyDriftState.stages["browser-owners"].status === "failed" &&
    browserDependencyDriftState.stages["browser-owners"]
      .failureClassification === "FINAL_EVIDENCE_FAILURE" &&
    browserDependencyDriftState.stages["browser-owners"]
      .consumedSubstantiveGate === false &&
    browserDependencyDriftState.worktrees.roles["development-browser"]
      .dependencyStatus === "installed" &&
    dependencyInstallationAttemptCount(
      evidenceRoot,
      "development-browser",
    ) === 1 &&
    browserDependencyDriftBlockedFinal;
  if (!preBrowserDependencyDriftRejected) {
    throw new Error(
      "real browser stage did not reject pre-owner dependency drift and block downstream stages",
    );
  }
  writeFileSync(
    path.join(
      developmentWorktreeRoot,
      "node_modules/simulation-fixture/index.js",
    ),
    "module.exports = 'simulation-fixture';\n",
  );
  rmSync(path.join(developmentWorktreeRoot, "node_modules"), {
    recursive: true,
    force: true,
  });
  rmSync(
    path.join(evidenceRoot, "worktree-dependencies/development-browser"),
    { recursive: true, force: true },
  );
  rmSync(browserDependencyDriftStatePath);
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: { stage: "browser-owners", startedAt: nextTimestamp() },
  });
  state = installAndBindSimulationRole({
    canonicalRoot,
    repositoryRoot: developmentWorktreeRoot,
    evidenceRoot,
    statePath,
    state,
    role: "development-browser",
    stage: "browser-owners",
  });
  const developmentBrowserPreOwnerRevalidation =
    revalidateSimulationRoleDependencies({
      repositoryRoot: developmentWorktreeRoot,
      evidenceRoot,
      state,
      role: "development-browser",
      boundary: "pre-browser-owners",
    });
  const finalArtifactPreOwnerRevalidation =
    revalidateSimulationRoleDependencies({
      repositoryRoot: fixtureRoot,
      evidenceRoot,
      state,
      role: "final-artifact",
      boundary: "pre-browser-owners",
    });
  const browserDescriptors = {};
  const browserHashes = {};
  const browserExecutionRoots = {};
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const ownerExecutionRoot = new Set(["cart", "retailer"]).has(owner.id)
      ? developmentWorktreeRoot
      : fixtureRoot;
    const ownerManifest = JSON.parse(
      readFileSync(
        path.join(ownerExecutionRoot, "scripts/required-test-manifest.json"),
        "utf8",
      ),
    );
    const gate = ownerManifest.gates.find((entry) => entry.id === owner.gateId);
    browserExecutionRoots[owner.id] =
      ownerExecutionRoot === developmentWorktreeRoot
        ? "development-browser"
        : "final-artifact";
    const reportDescriptor = writeEvidence(
      evidenceRoot,
      `browser-owners/${owner.id}/playwright-report.json`,
      {
        schema: "interior-ai.simulated-playwright-report.v1",
        owner: owner.id,
      },
    );
    const ownerDescriptor = writeEvidence(
      evidenceRoot,
      `browser-owners/${owner.id}/evidence.json`,
      browserEvidence(state, owner, gate, reportDescriptor.sha256),
    );
    const startDescriptor = writeEvidence(
      evidenceRoot,
      `browser-owners/${owner.id}/discovery-start.json`,
      {
        schema: "interior-ai.production-certification-playwright-start.v1",
        boundary: "discovery",
        gateId: owner.gateId,
        discoveredTestCount: gate.requiredTests.length,
      },
    );
    browserDescriptors[`browser:${owner.id}`] = ownerDescriptor;
    browserDescriptors[`browser-report:${owner.id}`] = reportDescriptor;
    browserDescriptors[`browser-start:${owner.id}`] = startDescriptor;
    if (!owner.productionServer) {
      const lifecycleDescriptor = writeEvidence(
        evidenceRoot,
        `browser-owners/${owner.id}/server-lifecycle.json`,
        simulatedBrowserServerTrackedOutputLifecycle({
          repositoryRoot: ownerExecutionRoot,
          candidate: state.candidate,
          certificationId: state.certificationId,
          ownerId: owner.id,
          stageAttempt: state.stages["browser-owners"].attempts.at(-1).number,
          dependencyBinding: {
            bindingEvidenceSha256:
              developmentBrowserPreOwnerRevalidation.bindingEvidenceSha256,
            dependencyIdentitySha256:
              developmentBrowserPreOwnerRevalidation.dependencyIdentitySha256,
            dependencyInventorySha256:
              developmentBrowserPreOwnerRevalidation.dependencyInventorySha256,
            nodeModulesRootIdentitySha256:
              developmentBrowserPreOwnerRevalidation
                .nodeModulesRootIdentitySha256,
            nodeModulesFilesystemIdentitySha256:
              developmentBrowserPreOwnerRevalidation
                .nodeModulesFilesystemIdentitySha256,
          },
        }),
      );
      browserDescriptors[`browser-server-lifecycle:${owner.id}`] =
        lifecycleDescriptor;
    }
    browserHashes[owner.id] = ownerDescriptor.sha256;
  }
  const developmentBrowserPostOwnerRevalidation =
    revalidateSimulationRoleDependencies({
      repositoryRoot: developmentWorktreeRoot,
      evidenceRoot,
      state,
      role: "development-browser",
      boundary: "post-browser-owners",
    });
  const finalArtifactPostBrowserRevalidation =
    revalidateSimulationRoleDependencies({
      repositoryRoot: fixtureRoot,
      evidenceRoot,
      state,
      role: "final-artifact",
      boundary: "post-browser-owners",
    });
  const postBrowserSnapshot = captureArtifactSnapshot({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    position: "postRuntimeBrowserLive",
  });
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "browser-owners",
      passed: true,
      completedAt: nextTimestamp(),
      exitCode: 0,
      outputHashes: browserHashes,
      bindingUpdates: {
        browserOwnerEvidenceSha256: browserHashes,
      },
      evidenceFiles: {
        ...browserDescriptors,
        [snapshotEvidenceName("postRuntimeBrowserLive")]:
          postBrowserSnapshot.snapshotDescriptor,
        [rootEvidenceName("postRuntimeBrowserLive")]:
          postBrowserSnapshot.rootDescriptor,
      },
      consumedSubstantiveGate: true,
    },
  });
  writeEvidence(evidenceRoot, "simulation/worktree-execution.json", {
    schema: "interior-ai.production-certification-worktree-simulation.v1",
    sourceValidation: "source-validation",
    artifactLifecycle: "final-artifact",
    browserOwners: browserExecutionRoots,
    dependencyRevalidations: {
      finalArtifactPostBuild: finalArtifactPostBuildRevalidation,
      finalArtifactPreOwners: finalArtifactPreOwnerRevalidation,
      developmentBrowserPreOwners:
        developmentBrowserPreOwnerRevalidation,
      developmentBrowserPostOwners: developmentBrowserPostOwnerRevalidation,
      finalArtifactPostBrowser: finalArtifactPostBrowserRevalidation,
    },
    quarantineCreated: false,
  });
  const invokeFinalStandalone = (candidateStatePath = statePath) =>
    spawnSync(
      process.execPath,
      ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
      {
        cwd: extractionRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          CERTIFICATION_QUALIFICATION_MODE: "1",
          PRODUCTION_CERTIFICATION_STATE: candidateStatePath,
          CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
          CERTIFICATION_ALLOW_SIMULATION: "1",
          PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: identity.commitSha,
        },
      },
    );
  const finalFailureText = (child) =>
    `${String(child.stdout ?? "")}\n${String(child.stderr ?? "")}`;
  const runtimeReportBytes = readFileSync(runtimeReportPath);
  const runtimeReportV1 = JSON.parse(runtimeReportBytes.toString("utf8"));
  Object.assign(
    runtimeReportV1.config.metadata.productionArtifactEvidence,
    {
      semanticJournalSchema:
        "interior-ai.production-artifact-semantic-event-journal.v1",
      semanticJournalVersion: 1,
    },
  );
  writeFileSync(runtimeReportPath, canonicalJsonBytes(runtimeReportV1));
  const runtimeReportV1StatePath = path.join(
    evidenceRoot,
    "simulation/runtime-report-v1-state.json",
  );
  const runtimeReportV1State = structuredClone(state);
  runtimeReportV1State.evidenceFiles["runtime-report"].sha256 = sha256Bytes(
    readFileSync(runtimeReportPath),
  );
  writeCertificationState(runtimeReportV1StatePath, runtimeReportV1State);
  const runtimeReportV1Final = invokeFinalStandalone(runtimeReportV1StatePath);
  const rawRuntimeReportJournalV1Rejected =
    runtimeReportV1Final.status !== 0 &&
    /runtime-smoke raw report does not identify the certified artifact/.test(
      finalFailureText(runtimeReportV1Final),
    );
  writeFileSync(runtimeReportPath, runtimeReportBytes);
  rmSync(runtimeReportV1StatePath);

  const extractedJournalPath = path.join(
    extractionRoot,
    ".local/production-artifact-evidence/semantic-event-journal.json",
  );
  const extractedJournalBytes = readFileSync(extractedJournalPath);
  const extractedJournalV1 = JSON.parse(extractedJournalBytes.toString("utf8"));
  extractedJournalV1.schema =
    "interior-ai.production-artifact-semantic-event-journal.v1";
  extractedJournalV1.version = 1;
  writeFileSync(extractedJournalPath, canonicalJsonBytes(extractedJournalV1));
  const archivedJournalV1Final = invokeFinalStandalone();
  const archivedPhysicalJournalV1Rejected =
    archivedJournalV1Final.status !== 0 &&
    /semantic journal|manifest\/journal contract/.test(
      finalFailureText(archivedJournalV1Final),
    );
  writeFileSync(extractedJournalPath, extractedJournalBytes);

  const historicalStatePath = path.join(
    evidenceRoot,
    "simulation/historical-state-v2-substitution.json",
  );
  writeCertificationState(historicalStatePath, {
    ...structuredClone(state),
    schema: PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2,
    version: 2,
  });
  const historicalStateFinal = invokeFinalStandalone(historicalStatePath);
  const historicalStateSubstitutionRejected =
    historicalStateFinal.status !== 0 &&
    /final standalone certification state schema is unsupported/.test(
      finalFailureText(historicalStateFinal),
    );
  rmSync(historicalStatePath);
  if (
    !rawRuntimeReportJournalV1Rejected ||
    !archivedPhysicalJournalV1Rejected ||
    !historicalStateSubstitutionRejected
  ) {
    throw new Error(
      `simulation current/historical journal-v2 tamper matrix did not fail closed: ${JSON.stringify({
        rawRuntimeReportJournalV1Rejected,
        archivedPhysicalJournalV1Rejected,
        historicalStateSubstitutionRejected,
      })}`,
    );
  }
  state = startSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "final-standalone",
      startedAt: nextTimestamp(),
    },
  });
  const final = invokeFinalStandalone();
  if (final.status !== 0 || final.signal) {
    throw new Error(`simulation final standalone failed: ${String(final.stderr).trim()}`);
  }
  const finalValue = JSON.parse(final.stdout);
  if (finalValue.certificationComplete || !finalValue.simulationComplete) {
    throw new Error("simulation final standalone result overstated certification");
  }
  const finalDescriptor = writeEvidence(
    evidenceRoot,
    "final-standalone/evidence.json",
    finalValue,
  );
  state = completeSimulationStage({
    fixtureRoot,
    evidenceRoot,
    statePath,
    payload: {
      stage: "final-standalone",
      passed: true,
      completedAt: nextTimestamp(),
      exitCode: 0,
      outputHashes: { final: finalDescriptor.sha256 },
      evidenceFiles: { "final-standalone": finalDescriptor },
    },
  });
  const stagedRetryPath = path.join(
    evidenceRoot,
    "archive/stage/package.json",
  );
  const stagedRetryBytes = readFileSync(stagedRetryPath);
  writeFileSync(stagedRetryPath, "continuity retry mutation\n");
  const failedContinuity = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "continuity"],
    {
      cwd: canonicalRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
        CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      },
    },
  );
  writeFileSync(stagedRetryPath, stagedRetryBytes);
  const failedContinuityState = readCertificationState(statePath);
  const failedContinuityDescriptor =
    failedContinuityState.evidenceFiles.continuity;
  const failedContinuityValidation = validateCertificationState({
    state: failedContinuityState,
    evidenceRoot,
    expectedCandidate: failedContinuityState.candidate,
    expectedHarnessSourceSha256:
      failedContinuityState.harness.sourceSha256,
    repositoryRoot: canonicalRoot,
    sourceValidationRoot: sourceWorktreeRoot,
    artifactRoot: fixtureRoot,
  });
  const continuityFailureRetryRetained =
    failedContinuity.status !== 0 &&
    failedContinuityState.stages.continuity.status === "failed" &&
    failedContinuityState.stages.continuity.consumedSubstantiveGate === false &&
    failedContinuityDescriptor.path === "continuity/attempt-001.json" &&
    failedContinuityValidation.valid;
  if (!continuityFailureRetryRetained) {
    throw new Error("failed continuity attempt was not retained as retryable evidence");
  }
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "continuity"],
    canonicalRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
    },
  );
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "state:validate"],
    canonicalRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      CERTIFICATION_INTEGRATION_BRANCH_REF: "refs/heads/integration",
      CERTIFICATION_INTEGRATION_TRACKING_REF: "refs/remotes/origin/integration",
      CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA:
        identity.integrationCommitSha,
      CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA: identity.integrationTreeSha,
    },
  );
  run(
    process.execPath,
    ["scripts/production-certification.mjs", "integration-ready"],
    canonicalRoot,
    {
      ...doctorEnvironment,
      CERTIFICATION_STAGE_STARTED_AT: nextTimestamp(),
      CERTIFICATION_STAGE_COMPLETED_AT: nextTimestamp(),
      CERTIFICATION_INTEGRATION_BRANCH_REF: "refs/heads/integration",
      CERTIFICATION_INTEGRATION_TRACKING_REF: "refs/remotes/origin/integration",
      CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA:
        identity.integrationCommitSha,
      CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA: identity.integrationTreeSha,
    },
  );
  state = readCertificationState(statePath);
  if (
    state.stages.continuity.attempts.length !== 2 ||
    state.stages.continuity.attempts[0].status !== "failed" ||
    state.stages.continuity.attempts[1].status !== "passed" ||
    state.evidenceFiles.continuity.path !== "continuity/attempt-002.json" ||
    !existsSync(path.join(evidenceRoot, "continuity/attempt-001.json"))
  ) {
    throw new Error("continuity retry did not retain two distinct physical attempts");
  }
  const validation = validateCertificationState({
    state,
    evidenceRoot,
    expectedCandidate: state.candidate,
    expectedHarnessSourceSha256: state.harness.sourceSha256,
    repositoryRoot: canonicalRoot,
    sourceValidationRoot: sourceWorktreeRoot,
    artifactRoot: fixtureRoot,
  });
  if (!validation.valid) throw new Error(validation.issues.join("; "));
  const continuityDescriptor = state.evidenceFiles.continuity;
  const continuityValue = JSON.parse(
    readFileSync(path.join(evidenceRoot, continuityDescriptor.path), "utf8"),
  );
  const copiedHashContinuity = structuredClone(continuityValue);
  const copiedDigest = Object.values(copiedHashContinuity.inputSnapshots)[0];
  for (const position of Object.keys(copiedHashContinuity.inputSnapshots)) {
    copiedHashContinuity.inputSnapshots[position] = copiedDigest;
  }
  const copiedHashValidation = validateContinuityEvidence(
    copiedHashContinuity,
    state,
    fixtureRoot,
  );
  if (
    copiedHashValidation.valid ||
    !copiedHashValidation.issues.some((issue) => /copied|duplicated/.test(issue))
  ) {
    throw new Error("simulation copied-hash continuity bypass was not rejected");
  }
  const mutableArtifactPath = path.join(fixtureRoot, ".next/static/chunk.js");
  const originalArtifactBytes = readFileSync(mutableArtifactPath);
  const tamperStatePath = path.join(evidenceRoot, "tamper-certification-state.json");
  writeCertificationState(tamperStatePath, state);
  const tamperStateBytesBefore = readFileSync(tamperStatePath);
  writeFileSync(mutableArtifactPath, "mutated simulation artifact\n");
  const physicalTamper = measureFinalContinuity({
    repositoryRoot: fixtureRoot,
    evidenceRoot,
    state,
    capturedAt: "2026-08-14T00:29:00.000Z",
    writeEvidence: false,
  });
  const tamperValidation = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "state:validate"],
    {
      cwd: canonicalRoot,
      encoding: "utf8",
      env: {
        ...doctorEnvironment,
        PRODUCTION_CERTIFICATION_STATE: tamperStatePath,
        CERTIFICATION_INVALIDATED_AT: "2026-08-14T00:30:00.000Z",
      },
    },
  );
  const tamperStateBytesAfterValidation = readFileSync(tamperStatePath);
  let tamperValidationReport = null;
  try {
    tamperValidationReport = parseCertificationStageResult(
      tamperValidation.stdout,
    ).details?.validationReport;
  } catch {
    // The assertion below reports a single transactional-validation failure.
  }
  const tamperPlanPath = path.join(evidenceRoot, "tamper-invalidation-plan.json");
  if (tamperValidationReport?.invalidationPlan) {
    writeFileSync(
      tamperPlanPath,
      canonicalJsonBytes(tamperValidationReport.invalidationPlan),
      { flag: "wx", mode: 0o600 },
    );
    run(
      process.execPath,
      ["scripts/production-certification.mjs", "state:reconcile"],
      canonicalRoot,
      {
        ...doctorEnvironment,
        PRODUCTION_CERTIFICATION_STATE: tamperStatePath,
        CERTIFICATION_INVALIDATION_PLAN: tamperPlanPath,
        CERTIFICATION_EXPECTED_STATE_SHA256: sha256Bytes(tamperStateBytesBefore),
        CERTIFICATION_INVALIDATED_AT: "2026-08-14T00:30:00.000Z",
      },
    );
  }
  writeFileSync(mutableArtifactPath, originalArtifactBytes);
  const tamperedState = readCertificationState(tamperStatePath);
  rmSync(tamperStatePath);
  const artifactMutationRejected =
    physicalTamper.issues.some((issue) =>
      /no longer matches snapshot|physical artifact identity contradicts/.test(issue),
    ) &&
    tamperValidation.status !== 0 &&
    tamperStateBytesBefore.equals(tamperStateBytesAfterValidation) &&
    tamperedState.stages.build.status === "invalidated" &&
    tamperedState.stages.continuity.status === "invalidated" &&
    tamperedState.stages["integration-ready"].status === "invalidated";
  if (!artifactMutationRejected) {
    throw new Error(
      `simulation artifact mutation did not block continuity and readiness: ${JSON.stringify({
        issues: physicalTamper.issues,
        status: tamperValidation.status,
        build: tamperedState.stages.build.status,
        continuity: tamperedState.stages.continuity.status,
        readiness: tamperedState.stages["integration-ready"].status,
      })}`,
    );
  }
  const worktreeTamperState = readCertificationState(statePath);
  const roleAliasState = structuredClone(worktreeTamperState);
  roleAliasState.worktrees.roles["development-browser"] = structuredClone(
    roleAliasState.worktrees.roles["source-validation"],
  );
  roleAliasState.worktrees.roles["development-browser"].role =
    "development-browser";
  const roleAliasingRejected = certificationWorktreeIssues({
    state: roleAliasState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /cross-role|alias/.test(issue));

  write(sourceWorktreeRoot, ".env", "copied-simulation-input\n");
  const copiedIgnoredWorktreeInputRejected = certificationWorktreeIssues({
    state: worktreeTamperState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /ignored influential paths/.test(issue));
  rmSync(path.join(sourceWorktreeRoot, ".env"));

  git(sourceWorktreeRoot, ["checkout", "--detach", identity.parentSha]);
  const wrongWorktreeIdentityRejected = certificationWorktreeIssues({
    state: worktreeTamperState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /exact candidate commit\/tree|binding changed/.test(issue));
  git(sourceWorktreeRoot, ["checkout", "--detach", identity.commitSha]);

  const temporarilyRemovedDevelopmentRoot = `${developmentWorktreeRoot}-premature`;
  renameSync(developmentWorktreeRoot, temporarilyRemovedDevelopmentRoot);
  const prematureWorktreeRemovalRejected = certificationWorktreeIssues({
    state: worktreeTamperState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /development-browser is invalid|missing|ENOENT/.test(issue));
  renameSync(temporarilyRemovedDevelopmentRoot, developmentWorktreeRoot);

  if (
    !roleAliasingRejected ||
    !copiedIgnoredWorktreeInputRejected ||
    !wrongWorktreeIdentityRejected ||
    !prematureWorktreeRemovalRejected
  ) {
    throw new Error("simulation stage-worktree tamper matrix did not fail closed");
  }
  for (const [relativePath, digest] of Object.entries(canonicalIgnoredSnapshot)) {
    if (sha256Bytes(readFileSync(path.join(canonicalRoot, relativePath))) !== digest) {
      throw new Error(`canonical ignored artifact changed during simulation: ${relativePath}`);
    }
  }
  if (realpathSync(path.join(canonicalRoot, "final-component")) !== finalComponentTarget) {
    throw new Error("canonical external-target final-component symlink changed");
  }
  const dependencyLifecycleBeforeCleanup = Object.fromEntries(
    CERTIFICATION_WORKTREE_ROLES.map((role) => [
      role,
      {
        status: worktreeTamperState.worktrees.roles[role].dependencyStatus,
        identitySha256:
          worktreeTamperState.worktrees.roles[role]
            .dependencyIdentitySha256,
        evidenceSha256:
          worktreeTamperState.worktrees.roles[role]
            .dependencyBindingEvidence?.sha256 ?? null,
      },
    ]),
  );
  if (
    Object.values(dependencyLifecycleBeforeCleanup).some(
      (entry) =>
        entry.status !== "installed" ||
        !entry.identitySha256 ||
        !entry.evidenceSha256,
    )
  ) {
    throw new Error("simulation did not bind all three dependency lifecycles");
  }
  const sourceDependencyEvidenceBeforeCleanup = structuredClone(
    worktreeTamperState.worktrees.roles["source-validation"]
      .dependencyBindingEvidence,
  );
  const postAggregateStateBytes = readFileSync(statePath);
  const sameIdentityAfterAggregate = bindCertificationWorktreeDependencies({
    statePath,
    expectedCurrentSha256: sha256Bytes(postAggregateStateBytes),
    evidenceRoot,
    canonicalRoot,
    role: "source-validation",
    dependencyBindingEvidence: sourceDependencyEvidenceBeforeCleanup,
  });
  const postAggregateStateMutationRejected =
    sameIdentityAfterAggregate.mutated === false &&
    readFileSync(statePath).equals(postAggregateStateBytes);
  let differentIdentityOverwriteRejected = false;
  try {
    bindCertificationWorktreeDependencies({
      statePath,
      expectedCurrentSha256: sha256Bytes(postAggregateStateBytes),
      evidenceRoot,
      canonicalRoot,
      role: "source-validation",
      dependencyBindingEvidence: {
        ...sourceDependencyEvidenceBeforeCleanup,
        sha256: "f".repeat(64),
      },
    });
  } catch {
    differentIdentityOverwriteRejected =
      readFileSync(statePath).equals(postAggregateStateBytes);
  }
  const staleNullDependencyState = structuredClone(worktreeTamperState);
  staleNullDependencyState.worktrees.roles[
    "source-validation"
  ].dependencyIdentitySha256 = null;
  const staleNullDependencyRejected = certificationWorktreeIssues({
    state: staleNullDependencyState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /require identity|dependency/.test(issue));
  const validationBeforeBindingState = structuredClone(worktreeTamperState);
  Object.assign(validationBeforeBindingState.worktrees.roles["source-validation"], {
    dependencyStatus: "not-installed",
    dependencyIdentitySha256: null,
    dependencyBindingEvidence: null,
    dependencyInstallation: null,
  });
  const validationBeforeBindingRejected = certificationWorktreeIssues({
    state: validationBeforeBindingState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /unbound dependencies|pristine|node_modules/.test(issue));
  const roleEvidenceSwapState = structuredClone(worktreeTamperState);
  roleEvidenceSwapState.worktrees.roles[
    "development-browser"
  ].dependencyBindingEvidence = structuredClone(
    roleEvidenceSwapState.worktrees.roles["source-validation"]
      .dependencyBindingEvidence,
  );
  const roleEvidenceSwapRejected = certificationWorktreeIssues({
    state: roleEvidenceSwapState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /another role|worktree|hash mismatch/.test(issue));
  const driftedDependencyImplementation = path.join(
    artifactWorktreeRoot,
    "node_modules/simulation-fixture/index.js",
  );
  const originalDependencyImplementation = readFileSync(
    driftedDependencyImplementation,
  );
  writeFileSync(
    driftedDependencyImplementation,
    "module.exports = 'post-bind-byte-drift';\n",
  );
  const postBindDependencyDriftRejected = certificationWorktreeIssues({
    state: worktreeTamperState,
    evidenceRoot,
    canonicalRoot,
  }).some((issue) => /drift|dependency|inventory/.test(issue));
  writeFileSync(
    driftedDependencyImplementation,
    originalDependencyImplementation,
  );
  if (
    !staleNullDependencyRejected ||
    !validationBeforeBindingRejected ||
    !differentIdentityOverwriteRejected ||
    !postAggregateStateMutationRejected ||
    !roleEvidenceSwapRejected ||
    !postBindDependencyDriftRejected
  ) {
    throw new Error("simulation dependency lifecycle tamper matrix did not fail closed");
  }
  let removedWorktreeEvidenceReuseRejected = !cleanupWorktrees;
  let cleanedDependencyReceiptDeletionRejected = !cleanupWorktrees;
  if (cleanupWorktrees) {
    run(
      process.execPath,
      ["scripts/production-certification.mjs", "worktrees:cleanup"],
      canonicalRoot,
      doctorEnvironment,
    );
    state = readCertificationState(statePath);
    if (
      CERTIFICATION_WORKTREE_ROLES.some(
        (role) => state.worktrees.roles[role].cleanupStatus !== "removed",
      ) ||
      [sourceWorktreeRoot, artifactWorktreeRoot, developmentWorktreeRoot].some(
        (root) => existsSync(root),
      )
    ) {
      throw new Error("simulation cleanup did not remove only the three task worktrees");
    }
    const removedStateBytes = readFileSync(statePath);
    try {
      bindCertificationWorktreeDependencies({
        statePath,
        expectedCurrentSha256: sha256Bytes(removedStateBytes),
        evidenceRoot,
        canonicalRoot,
        role: "source-validation",
        dependencyBindingEvidence: sourceDependencyEvidenceBeforeCleanup,
      });
    } catch {
      removedWorktreeEvidenceReuseRejected =
        readFileSync(statePath).equals(removedStateBytes);
    }
    if (!removedWorktreeEvidenceReuseRejected) {
      throw new Error("removed worktree dependency evidence was reusable");
    }
    cleanedDependencyReceiptDeletionRejected = CERTIFICATION_WORKTREE_ROLES.every(
      (role) => {
        const missingReceipt = structuredClone(state);
        Object.assign(missingReceipt.worktrees.roles[role], {
          dependencyIdentitySha256: null,
          dependencyBindingEvidence: null,
          dependencyInstallation: null,
        });
        const resealed = sealCertificationState(missingReceipt);
        return !validateCertificationState({
          state: resealed,
          evidenceRoot,
          repositoryRoot: canonicalRoot,
          verifyCurrentSource: false,
        }).valid;
      },
    );
    if (!cleanedDependencyReceiptDeletionRejected) {
      throw new Error("cleaned dependency receipts were discardable");
    }
  }
  return {
    schema: "interior-ai.production-certification-simulation-result.v1",
    simulation: true,
    acceptedForRealCandidate: false,
    certificationId: SIMULATION_ID,
    completionState: state.completionState,
    finalStandalone: "passed-simulation-only",
    integrationReady: state.stages["integration-ready"].status === "passed",
    stageOrder: {
      canonicalOwner: stageOrderContracts.canonicalOwner,
      stageOrderSha256: stageOrderContracts.stageOrderSha256,
      stageCount: stageOrderContracts.stageCount,
      identicalToCanonical:
        stageOrderContracts.stageOrderSha256 ===
        sha256Bytes(canonicalJsonBytes(CERTIFICATION_STAGE_ORDER)),
    },
    archiveDeterministic: true,
    stateInitWorktreeTransaction: {
      doctorPassed: true,
      ...stateInitTransactionDoctor.details,
    },
    stageResultContract: {
      ...certificationStageResultContractIdentity(),
      regressionPassed: stageResultRegressionValue.passed === true,
      caseCount: stageResultRegressionValue.passedCases.length,
      exactSourceValidationNoisyOutput: true,
      exactNextStateSha256: successfulSourceConsumption.nextStateSha256,
      buildBoundaryPending: successfulSourceBuildBoundaryPending,
    },
    sourceValidationCheckCount: sourceCheckIds.length,
    sourceValidationNestedAuthFixtureRegression: {
      actualSourceCheckInvocation: Boolean(nestedSourceResultLine),
      productionArtifactEvidenceContractsPassed:
        productionArtifactEvidenceSourceCheck.passed === true,
      nestedFixtureSessionRegressionPassed:
        sourceValidationNestedAuthFixtureResult.isolatedChildPassed === true,
      remainingCanonicalChecksPassed:
        successfulSourceEvidence.checks.every((check) => check.passed === true),
      dependenciesInstalledAndBound:
        successfulSourceBinding.dependencyStatus === "installed" &&
        Boolean(successfulSourceBinding.dependencyBindingEvidence),
      generatedOutputsOwnedAndCleaned: generatedOutputLifecyclePassed,
      terminalSourceWorktreeValid: correctedSourceAggregateValidation.valid,
      outerFixtureSessionUnchanged:
        sourceValidationNestedAuthFixtureResult.parentEnvironmentUnchanged ===
          true &&
        sourceValidationNestedAuthFixtureResult.outerSessionPreserved === true &&
        sourceValidationNestedAuthFixtureResult.outerResourcesPreserved === true,
    },
    generatedOutputLifecycle: {
      schema:
        "interior-ai.production-certification-source-generated-outputs.v1",
      declaredOutputCount: 2,
      exactFailedOutputCount: 5,
      terminalNodeModulesOnly: true,
      negativeCaseCount: 26,
    },
    databaseLifecycle: {
      schema: "interior-ai.production-certification-database-lifecycle.v1",
      plannedAbsent: true,
      provisionedAndMigrated: true,
      initialEmptyVerified: true,
      fixtureCleanupAndFinalEmptyVerified: true,
      sessionsCleared: true,
      droppedAndAbsenceVerified: true,
      abortFailureRetained: true,
      crossRunCandidateAndSessionTamperRejected: true,
      realDatabaseMutation: false,
    },
    authResultContract: {
      schema: "interior-ai.ci-auth-fixture-command-result.v1",
      validationSuccessAndFailures: true,
      productionExpectedNegative: true,
      preflightSuccessAndFailures: true,
      staleCrossRunAndTamperRejected: true,
      cleanupAndNoLeakEvidence: true,
      regressionPassed: authResultRegression.includes(
        "CI auth fixture structured-result tests passed",
      ),
    },
    authFixtureSession: {
      schema: "interior-ai.ci-auth-fixture-session.v1",
      exactlyOnceGeneration: true,
      validationConsumedExisting: true,
      productionMisuseConsumedExisting: true,
      databasePreflightConsumedExisting: true,
      buildContinuityGuard: true,
      secondGenerationRejected: true,
      localAdvisorySubstitutionRejected: true,
      staleForeignTamperedSessionRejected: true,
      nestedIsolation: authFixtureSessionIsolation,
      outerCanonicalSessionPreserved:
        authFixtureSessionIsolation.outerSessionPreserved === true,
      ambientContaminationRejected:
        authFixtureSessionIsolation.historicalContaminationRejected === true,
      nestedCleanupPassed:
        authFixtureSessionIsolation.nestedResourcesCleaned === true,
      simulationOnly: true,
      eligibleForRealCertification: false,
      regressionPassed:
        authFixtureSessionIsolation.isolatedChildPassed === true &&
        authFixtureSessionRegression.includes(
          "CI auth fixture nested isolation regression passed",
        ),
    },
    authPreflightDatabaseLifecycle: {
      classification: "AUTH_SESSION_PREFLIGHT_ONLY",
      rehearsalClassification: "NOT_REHEARSAL_DATABASE",
      releaseCertificationClassification: "NOT_RELEASE_CERTIFICATION",
      integrationClassification: "NOT_VALID_FOR_INTEGRATION",
      plannedAbsent: true,
      provisionedMigratedAndInitialEmptyVerified: true,
      scopedProjectionPassed: true,
      normalDropAndAbsencePassed: true,
      abortDropAndAbsencePassed: true,
      helperFailureOrchestrationPassed:
        authPreflightDatabaseRegressionResult.passedCases.filter((entry) =>
          entry.startsWith("helper-"),
        ).length === 9,
      failureEvidenceFailClosed:
        authPreflightDatabaseRegressionResult.passedCases.includes(
          "failure-result-contract-tamper-rejected",
        ),
      crossRunDatabaseSidecarAndCapabilityTamperRejected: true,
      separateLaterRehearsalDatabaseIdentity: true,
      eligibleForRealCertification: false,
      regressionPassed: authPreflightDatabaseRegressionResult.passed === true,
    },
    sourceDatabaseProjection: {
      actualRealRunnerPath: true,
      parentDatabaseUrlAbsent: true,
      exactLifecycleTargetProjected: true,
      capabilityIsolationPassed: true,
      ambientOverrideRejected: true,
      mismatchedBindingRejected: true,
      staleBindingRejected: true,
      droppedBindingRejected: true,
      rawConnectionMaterialRetained: false,
      regressionPassed: sourceDatabaseProjectionRegression.includes(
        "real-runner source database projection regression passed",
      ),
    },
    buildGeneratedOutputLifecycle: {
      schema: PRODUCTION_CERTIFICATION_BUILD_GENERATED_OUTPUT_SCHEMA,
      realRunnerPassed: realBuildGeneratedOutputLifecyclePassed,
      postDispatchFailurePassed:
        postDispatchBuildFailureLifecyclePassed,
      danglingSymlinkGuardPassed: danglingGeneratedOutputGuardPassed,
      arbitraryIgnoredInputRejected: arbitraryIgnoredBuildInputRejected,
      canonicalIgnoredArtifactsUnchanged:
        canonicalIgnoredBuildInputsUnchanged,
    },
    lifecycleSnapshotCount: 6,
    worktreeRoles: [...CERTIFICATION_WORKTREE_ROLES],
    canonicalIgnoredArtifactsUnchanged: true,
    externalFinalComponentSymlinkUnchanged: true,
    quarantineCreated: false,
    worktreesCleaned: cleanupWorktrees,
    dependencyLifecycle: {
      schema:
        "interior-ai.production-certification-worktree-dependency-lifecycle.v1",
      roles: dependencyLifecycleBeforeCleanup,
      finalStatuses: Object.fromEntries(
        CERTIFICATION_WORKTREE_ROLES.map((role) => [
          role,
          state.worktrees.roles[role].dependencyStatus,
        ]),
      ),
      physicalFixtureInstallation: true,
      atomicBinding: true,
      postStageRevalidation:
        finalArtifactPostBuildRevalidation.passed === true &&
        finalArtifactPreOwnerRevalidation.passed === true &&
        developmentBrowserPreOwnerRevalidation.passed === true &&
        developmentBrowserPostOwnerRevalidation.passed === true &&
        finalArtifactPostBrowserRevalidation.passed === true,
    },
    tamperCases: {
      sourceInstallPreconditionClassified: sourcePreconditionClassified,
      sourcePreconditionRetryPassed:
        sourcePreconditionRetryState.stages["source-validation"].status ===
        "passed",
      sourceAlreadyBoundRetryWithoutReinstall,
      sourceEvidenceIntermediateSymlinkRejectedWithoutWrite,
      sourceBindingRaceRejectedWithoutReinstall,
      buildAlreadyBoundRetryWithoutReinstall,
      browserAlreadyBoundRetryWithoutReinstall,
      certificationProcessHandoffRetained,
      sourceCheckFailurePreventsBuild: failedSourcePreventedBuild,
      exactStaleNullOrderingRegressionPassed,
      staleBindingStateReceiptRejected,
      contradictoryBindingStateReceiptRejected,
      sourceDependencyRevalidationTamperRejected,
      failedSourceEvidenceRetained: true,
      sourceDriftAfterZeroExitRetained,
      artifactMutationPreventsContinuityAndReadiness: artifactMutationRejected,
      copiedArtifactHashRejected: true,
      continuityFailureRetryRetained,
      liveMutationBeforePhase8Rejected,
      liveMutationDuringPhase8Rejected,
      wrongEnvironmentProfileRejected,
      leakedEnvironmentVariableRejected,
      wrongValuePolicyHashRejected,
      ambientFeatureFlagLeakageRejected,
      sourceFixtureLeakIntoBuildRuntimeRejected,
      importOrderDriftRejected,
      roleAliasingRejected,
      copiedIgnoredWorktreeInputRejected,
      wrongWorktreeIdentityRejected,
      prematureWorktreeRemovalRejected,
      validationBeforeBindingRejected,
      staleNullDependencyRejected,
      differentIdentityOverwriteRejected,
      postAggregateStateMutationRejected,
      postBindDependencyDriftRejected,
      sourcePostCheckDependencyDriftRejected,
      postBuildDependencyDriftRejected,
      preBrowserDependencyDriftRejected,
      roleEvidenceSwapRejected,
      removedWorktreeEvidenceReuseRejected,
      cleanedDependencyReceiptDeletionRejected,
      rawRuntimeReportJournalV1Rejected,
      archivedPhysicalJournalV1Rejected,
      historicalStateSubstitutionRejected,
      omittedPreparationRejected,
      changedPreparationPathRejected,
      targetAfterPreparationRejected,
      ...stageOrderTamperCases,
      ...runtimeRootTamperCases,
    },
    simulationRoot,
    stateSha256: sha256Bytes(readFileSync(statePath)),
  };
}

function requiredSimulationQualification() {
  if (
    process.env.CERTIFICATION_QUALIFICATION_MODE !== "1" ||
    process.env.CERTIFICATION_EXECUTION_CLASS !== "deterministic-simulation"
  ) {
    throw new Error("simulation worker is restricted to deterministic qualification");
  }
}

function containedSimulationWorkerPath(filePath, root, description) {
  const physicalRoot = realpathSync(root);
  const metadata = lstatSync(filePath);
  const physicalPath = realpathSync(filePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !physicalPath.startsWith(`${physicalRoot}${path.sep}`)
  ) {
    throw new Error(`${description} is not a contained physical file`);
  }
  return physicalPath;
}

async function simulationCli() {
  const command = process.argv[2];
  if (command === "fixture-build") {
    if (
      process.env.PRODUCTION_EVIDENCE_CANDIDATE_ID !== SIMULATION_ID ||
      JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
        .name !== "production-certification-simulation"
    ) {
      throw new Error("miniature fixture build is restricted to simulation");
    }
    writeMiniatureArtifact(process.cwd());
    writeFileSync(
      path.join(process.cwd(), "next-env.d.ts"),
      NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
      { flag: "wx" },
    );
    return;
  }
  if (command === "emit-production-evidence") {
    requiredSimulationQualification();
    const identity = {
      npmVersion: process.env.CERTIFICATION_SIMULATION_NPM_VERSION,
      commitSha: process.env.CERTIFICATION_EXPECTED_COMMIT_SHA,
      treeSha: process.env.CERTIFICATION_EXPECTED_TREE_SHA,
    };
    const result = await emitProductionEvidence(process.cwd(), identity, process.env);
    process.stdout.write(canonicalJsonBytes(result));
    return;
  }
  if (command === "state:start" || command === "state:complete") {
    if (process.env.CERTIFICATION_QUALIFICATION_MODE !== "1") {
      throw new Error("simulation state worker is restricted to qualification");
    }
    const evidenceRoot = realpathSync(process.env.CERTIFICATION_EVIDENCE_ROOT);
    const statePath = containedSimulationWorkerPath(
      process.env.PRODUCTION_CERTIFICATION_STATE,
      evidenceRoot,
      "simulation state",
    );
    const requestPath = containedSimulationWorkerPath(
      process.env.CERTIFICATION_SIMULATION_STAGE_REQUEST,
      evidenceRoot,
      "simulation stage request",
    );
    const state = readCertificationState(statePath);
    if (state.executionClass !== "deterministic-simulation") {
      throw new Error("simulation state worker cannot mutate a real-candidate state");
    }
    const requestBytes = readFileSync(requestPath);
    const request = JSON.parse(requestBytes.toString("utf8"));
    if (!requestBytes.equals(canonicalJsonBytes(request))) {
      throw new Error("simulation stage request is not canonical JSON");
    }
    const next =
      command === "state:start"
        ? startCertificationStage(state, request)
        : completeCertificationStage(state, request);
    writeCertificationState(statePath, next);
    process.stdout.write(
      canonicalJsonBytes({ stage: request.stage, transition: command.slice(6) }),
    );
    return;
  }
  const result = await runProductionCertificationSimulation();
  process.stdout.write(canonicalJsonBytes(result));
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  simulationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
