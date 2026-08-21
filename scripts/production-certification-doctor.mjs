import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statfsSync,
} from "node:fs";
import path from "node:path";

import {
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
} from "./production-artifact-contract.mjs";
import {
  CERTIFICATION_EVIDENCE_ROOT_ENV,
  CERTIFICATION_HARNESS_SOURCE_PATHS,
  CERTIFICATION_STAGE_COMMANDS,
  CERTIFICATION_STAGE_ORDER,
  PHASE8_EXTERNAL_EVIDENCE_ROOT_ENV,
  PRODUCTION_CERTIFICATION_DOCTOR_SCHEMA,
  PRODUCTION_CERTIFICATION_HARNESS_VERSION,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  harnessSourceIdentity,
  isCandidateId,
  isSourceSha,
  continuityContract,
  productionCertificationContract,
  sourceValidationCheckSet,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  isCertificationControlVariableName,
  stageEnvironmentContract,
} from "./production-certification-stage-environment.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";
import {
  resolveAuthorizedExternalEvidenceRoot,
  resolvePlaywrightReportPath,
  resolveRequiredTestReportPath,
  resolveRuntimeSmokeEvidencePath,
} from "./playwright-report-path.mjs";
import { readCertificationState } from "./production-certification-state.mjs";
import { validateCertificationResourcePreparation } from "./production-certification-resources.mjs";
import {
  certificationDatabaseStatus,
  certificationDatabaseTargetUrl,
  databaseLifecycleCliErrorMessage,
  readCertificationDatabaseLifecycle,
  redactDatabaseLifecycleFailure,
} from "./production-certification-database-lifecycle.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  certificationWorktreeIssues,
  resolveCertificationStageWorktree,
} from "./production-certification-worktrees.mjs";
import authResultContract from "./ci-auth-fixture-result-contract.cjs";
import {
  authFixtureRegressionCapabilityNames,
  isolatedAuthFixtureRegressionEnvironment,
} from "./ci-auth-fixture-regression-environment.mjs";
import {
  PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS,
  PRODUCTION_CERTIFICATION_STAGE_RESULT_PREFIX,
  PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA,
  certificationStageResultContractIdentity,
} from "./production-certification-stage-result-contract.mjs";

const REQUIRED_APPLICATION_ENVIRONMENT_NAMES = Object.freeze([
  "CERTIFICATION_DATABASE_ADMIN_URL",
  "CERTIFICATION_DATABASE_LIFECYCLE_PATH",
  "OPENAI_API_KEY",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_STOREFRONT_TOKEN|SHOPIFY_STOREFRONT_ACCESS_TOKEN",
  "POSTHOG_KEY|NEXT_PUBLIC_POSTHOG_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APP_ORIGIN",
  "ADMIN_EMAILS",
]);
const PORTS = Object.freeze([3000, 3317]);

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function git(repositoryRoot, args) {
  const result = run("git", args, repositoryRoot);
  return result.status === 0 ? result.stdout.trim() : null;
}

function check(checks, issues, id, action) {
  try {
    const details = action();
    checks.push({ id, passed: true, details: details ?? null });
  } catch (error) {
    checks.push({ id, passed: false, details: null });
    issues.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredAlternativesPresent(environment, alternatives) {
  return alternatives.split("|").some((name) => environment[name]?.trim());
}

export async function validateCertificationDatabaseDoctorShape(
  repositoryRoot,
  environment,
  { statusOwner = certificationDatabaseStatus } = {},
) {
  if (environment.CERTIFICATION_EXECUTION_CLASS === "deterministic-simulation") {
    return { simulation: true, realDatabaseMutation: false };
  }
  const state = readCertificationState(environment.PRODUCTION_CERTIFICATION_STATE);
  const current = readCertificationDatabaseLifecycle({ repositoryRoot, environment });
  const live = await statusOwner({ repositoryRoot, environment });
  if (
    current.evidence.currentState !== "planned" ||
    current.evidence.preflight?.policyPassed !== true ||
    current.evidence.preflight?.targetAbsent !== true ||
    current.evidence.preflight?.adminConnectionUsable !== true ||
    current.evidence.server?.canCreateDatabase !== true ||
    current.evidence.server?.hostClassification !== "explicit-loopback" ||
    current.evidence.server?.port !== 5432 ||
    JSON.stringify(current.binding) !== JSON.stringify(state.databaseLifecycle) ||
    live.targetExists !== false ||
    live.canCreateDatabase !== true ||
    live.hostClassification !== "explicit-loopback" ||
    live.port !== 5432
  ) {
    throw new Error("database lifecycle plan, absence, capability, or state binding is invalid");
  }
  if (Date.now() - Date.parse(current.evidence.preflight.checkedAt) > 30 * 60 * 1000) {
    throw new Error("database lifecycle plan absence proof is stale");
  }
  if (!certificationDatabaseTargetUrl(environment, current.binding)) {
    throw new Error("database lifecycle target URL cannot be constructed privately");
  }
  for (const relativePath of [
    "scripts/production-certification-database-lifecycle.mjs",
    "scripts/production-certification-database-adapter.mjs",
    "scripts/production-certification-database-contract.mjs",
  ]) {
    assertFileBackedOwner(repositoryRoot, relativePath);
  }
  const owner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-database-lifecycle.mjs"),
    "utf8",
  );
  for (const marker of [
    "provisionCertificationDatabase",
    "verifyInitialCertificationDatabase",
    "verifyFinalCertificationDatabase",
    "dropCertificationDatabase",
    "verifyCertificationDatabaseAbsent",
    "abortCertificationDatabase",
  ]) {
    if (!owner.includes(marker)) throw new Error(`database lifecycle owner is missing ${marker}`);
  }
  return {
    lifecycleState: "planned",
    databaseNameSha256: current.evidence.database.nameSha256,
    databaseIdentitySha256: current.evidence.database.identitySha256,
    hostClassification: current.evidence.server.hostClassification,
    port: current.evidence.server.port,
    serverVersion: current.evidence.server.serverVersion,
    roleClassification: current.evidence.server.roleClassification,
    targetAbsent: true,
    liveCatalogAbsenceChecked: true,
    cleanupOwnersRegistered: true,
  };
}

function validateNetworkShape(environment) {
  let origin;
  try {
    origin = new URL(environment.APP_ORIGIN);
  } catch {
    throw new Error("APP_ORIGIN network shape is invalid");
  }
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password) {
    throw new Error("APP_ORIGIN network shape is unsafe");
  }
  return { protocol: origin.protocol, hostPresent: Boolean(origin.hostname) };
}

export function assertFileBackedOwner(repositoryRoot, relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const metadata = lstatSync(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${relativePath} is not a physical source file`);
  }
  const source = readFileSync(absolutePath, "utf8");
  if (/data:text\/javascript|\beval\s*\(|node\s+-|\/dev\/stdin/.test(source)) {
    throw new Error(`${relativePath} permits data URL, eval, or stdin execution`);
  }
  return { sourceSha256: sha256Bytes(source) };
}

export function validateCertificationStageResultContracts(repositoryRoot) {
  const ownerPath =
    "scripts/production-certification-stage-result-contract.mjs";
  const consumerPath =
    "scripts/production-certification-stage-result-consumer.mjs";
  const wrapperPath = "scripts/production-certification.mjs";
  const testPath = "scripts/test-production-certification-stage-result.mjs";
  const simulationPath = "scripts/production-certification-simulation.mjs";
  for (const relativePath of [
    ownerPath,
    consumerPath,
    wrapperPath,
    testPath,
    simulationPath,
  ]) {
    assertFileBackedOwner(repositoryRoot, relativePath);
  }
  const owner = readFileSync(path.join(repositoryRoot, ownerPath), "utf8");
  const consumer = readFileSync(path.join(repositoryRoot, consumerPath), "utf8");
  const wrapper = readFileSync(path.join(repositoryRoot, wrapperPath), "utf8");
  const test = readFileSync(path.join(repositoryRoot, testPath), "utf8");
  const simulation = readFileSync(path.join(repositoryRoot, simulationPath), "utf8");
  const packageJson = JSON.parse(
    readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const matrix = productionCertificationContract(repositoryRoot).value;
  const schemaOwners = readdirSync(path.join(repositoryRoot, "scripts"))
    .filter((name) => name.endsWith(".mjs"))
    .filter((name) =>
      /^export const PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA\s*=/m.test(
        readFileSync(path.join(repositoryRoot, "scripts", name), "utf8"),
      ),
    );
  if (
    JSON.stringify(schemaOwners) !==
      JSON.stringify(["production-certification-stage-result-contract.mjs"]) ||
    matrix.stageCommandResult.schema !==
      PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA ||
    matrix.stageCommandResult.prefix !==
      PRODUCTION_CERTIFICATION_STAGE_RESULT_PREFIX ||
    matrix.stageCommandResult.canonicalOwner !== ownerPath ||
    matrix.stageCommandResult.canonicalConsumer !== consumerPath ||
    !owner.includes("parseCertificationStageResult") ||
    !owner.includes("validateCertificationStageResult") ||
    !consumer.includes("runCertificationStageCommand") ||
    !consumer.includes("validateCertificationStageResultFile") ||
    /parseCertificationChildJson|parseLastJson|\.reverse\(\)/.test(consumer) ||
    !wrapper.includes("formatCertificationStageResult") ||
    !wrapper.includes("createCertificationStageCommandResult") ||
    wrapper.includes(
      "console.log(JSON.stringify(commandError.certificationResult))",
    ) ||
    !wrapper.includes("if (!isCertificationStageResultCommand(command))") ||
    !test.includes("multiple competing") ||
    !test.includes("final non-empty") ||
    !test.includes("passed-source-check-failure-rejected") ||
    !test.includes("real-source-wrapper-consumer-build-boundary-registered") ||
    !simulation.includes("runCertificationStageCommand") ||
    !simulation.includes("historical-source-validation-npm-prisma") ||
    !simulation.includes("exactNextStateSha256") ||
    packageJson.scripts["test:production-certification-stage-result"] !==
      "node scripts/test-production-certification-stage-result.mjs" ||
    packageJson.scripts["certification:stage-result:validate"] !==
      "node scripts/production-certification-stage-result-consumer.mjs validate" ||
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(ownerPath) ||
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(consumerPath) ||
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(testPath)
  ) {
    throw new Error(
      "canonical certification stage-result producer/consumer contract is incoherent",
    );
  }
  const dispatched = PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS.filter(
    (command) =>
      wrapper.includes(`command === ${JSON.stringify(command)}`) ||
      command === "resume",
  );
  if (
    JSON.stringify(dispatched) !==
    JSON.stringify(PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS)
  ) {
    throw new Error("a required top-level stage wrapper lacks canonical framing");
  }
  const realRunner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-real.mjs"),
    "utf8",
  );
  if (
    !realRunner.includes("export function parseCertificationChildJson") ||
    consumer.includes("production-certification-real.mjs") ||
    owner.includes("production-certification-real.mjs")
  ) {
    throw new Error(
      "archive backward JSON parser ownership escaped into stage-result framing",
    );
  }
  const auth = validateAuthResultContracts(repositoryRoot);
  if (
    auth.schema !== "interior-ai.ci-auth-fixture-command-result.v1" ||
    matrix.databaseLifecycle.canonicalOwner !==
      "scripts/production-certification-database-lifecycle.mjs"
  ) {
    throw new Error("auth or database result-channel ownership changed");
  }
  return {
    ...certificationStageResultContractIdentity(),
    transport: "final-framed-stdout-record",
    commandCount: PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS.length,
    canonicalOwner: ownerPath,
    canonicalConsumer: consumerPath,
    physicalStateAndEvidenceValidation: true,
    archiveBackwardSearchReused: false,
    taskDriverCopiedParserRequired: false,
  };
}

export function validateAuthResultContracts(repositoryRoot) {
  const ownerPaths = [
    "scripts/ci-auth-fixture-result-contract.cjs",
    "scripts/ci-auth-fixture-result-contract.d.cts",
    "scripts/ci-auth-fixture-session.cjs",
    "scripts/ci-auth-fixture-session.d.cts",
    "scripts/ci-auth-fixture-regression-environment.mjs",
    "scripts/ci-auth-fixture.ts",
    "scripts/run-ci-auth-fixture-real-preflight.mjs",
    "scripts/run-ci-auth-fixture-session.mjs",
    "scripts/test-ci-auth-fixture-results.ts",
    "scripts/test-ci-auth-fixture-session.mjs",
    "scripts/test-production-certification-auth-preflight-database.mjs",
    "lib/auth-env.ts",
  ];
  const ownerHashes = Object.fromEntries(
    ownerPaths.map((relativePath) => [
      relativePath,
      assertFileBackedOwner(repositoryRoot, relativePath).sourceSha256,
    ]),
  );
  const packageJson = JSON.parse(
    readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const fixtureSource = readFileSync(
    path.join(repositoryRoot, "scripts/ci-auth-fixture.ts"),
    "utf8",
  );
  const contractSource = readFileSync(
    path.join(repositoryRoot, "scripts/ci-auth-fixture-result-contract.cjs"),
    "utf8",
  );
  const realPreflightSource = readFileSync(
    path.join(repositoryRoot, "scripts/run-ci-auth-fixture-real-preflight.mjs"),
    "utf8",
  );
  const fixtureSessionSource = readFileSync(
    path.join(repositoryRoot, "scripts/ci-auth-fixture-session.cjs"),
    "utf8",
  );
  const fixtureSessionRunnerSource = readFileSync(
    path.join(repositoryRoot, "scripts/run-ci-auth-fixture-session.mjs"),
    "utf8",
  );
  const fixtureSessionRegressionSource = readFileSync(
    path.join(repositoryRoot, "scripts/test-ci-auth-fixture-session.mjs"),
    "utf8",
  );
  const fixtureRegressionEnvironmentSource = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/ci-auth-fixture-regression-environment.mjs",
    ),
    "utf8",
  );
  const certificationRunnerSource = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-real.mjs"),
    "utf8",
  );
  const artifactEvidenceSource = readFileSync(
    path.join(repositoryRoot, "scripts/production-artifact-evidence.mjs"),
    "utf8",
  );
  const databaseLifecycleSource = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-database-lifecycle.mjs",
    ),
    "utf8",
  );
  const authDatabaseRegressionSource = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/test-production-certification-auth-preflight-database.mjs",
    ),
    "utf8",
  );
  const qualificationSource = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification.mjs"),
    "utf8",
  );
  const simulationSource = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-simulation.mjs"),
    "utf8",
  );
  const sourceContinuitySource = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-source-continuity.mjs",
    ),
    "utf8",
  );
  const regressionMatrix = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "scripts/production-certification-regressions.json"),
      "utf8",
    ),
  );
  const environmentContract = stageEnvironmentContract(repositoryRoot);
  const canonicalCapabilityNames =
    authFixtureRegressionCapabilityNames(repositoryRoot);
  const isolationProbeParent = {
    PATH: "/doctor-preserved-path",
    DATABASE_URL: "doctor-preserved-database-value",
    DOCTOR_ORDINARY_VARIABLE: "doctor-preserved-ordinary-value",
    ...Object.fromEntries(
      canonicalCapabilityNames.map((name, index) => [
        name,
        `doctor-private-capability-${index}`,
      ]),
    ),
  };
  const isolationProbeParentBefore = JSON.stringify(isolationProbeParent);
  const isolationProbeChild = isolatedAuthFixtureRegressionEnvironment({
    repositoryRoot,
    parentEnvironment: isolationProbeParent,
  });
  const isolationProbe = {
    returnsFreshEnvironment: isolationProbeChild !== isolationProbeParent,
    parentEnvironmentUnchanged:
      JSON.stringify(isolationProbeParent) === isolationProbeParentBefore,
    capabilitiesRemoved: canonicalCapabilityNames.every(
      (name) => !Object.hasOwn(isolationProbeChild, name),
    ),
    ordinaryVariablesPreserved:
      isolationProbeChild.PATH === isolationProbeParent.PATH &&
      isolationProbeChild.DATABASE_URL === isolationProbeParent.DATABASE_URL &&
      isolationProbeChild.DOCTOR_ORDINARY_VARIABLE ===
        isolationProbeParent.DOCTOR_ORDINARY_VARIABLE,
  };
  const nestedRegressionChild = spawnSync(
    "npm",
    ["run", "test:ci-auth-fixture-session"],
    {
      cwd: repositoryRoot,
      env: { ...process.env },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const nestedRegressionStdout = String(nestedRegressionChild.stdout ?? "");
  const nestedRegressionStderr = String(nestedRegressionChild.stderr ?? "");
  const nestedRegressionOutput =
    `${nestedRegressionStdout}\n${nestedRegressionStderr}`;
  const nestedRegressionProcessEvidence = {
    exitCode: Number.isSafeInteger(nestedRegressionChild.status)
      ? nestedRegressionChild.status
      : null,
    signal: nestedRegressionChild.signal ?? null,
    spawnError: nestedRegressionChild.error?.code ?? null,
    stdout: {
      bytes: Buffer.byteLength(nestedRegressionStdout),
      sha256: sha256Bytes(nestedRegressionStdout),
    },
    stderr: {
      bytes: Buffer.byteLength(nestedRegressionStderr),
      sha256: sha256Bytes(nestedRegressionStderr),
    },
  };
  if (
    nestedRegressionChild.error ||
    nestedRegressionChild.signal ||
    nestedRegressionChild.status !== 0
  ) {
    throw new Error(
      `nested auth fixture regression execution failed: ${JSON.stringify(
        nestedRegressionProcessEvidence,
      )}`,
    );
  }
  const ambientPrivateValues =
    authResultContract.privateValuesFromEnvironment(process.env);
  if (
    ambientPrivateValues.some((value) => nestedRegressionOutput.includes(value)) ||
    /GOCSPX[-_][A-Za-z0-9_-]{8,}/.test(nestedRegressionOutput) ||
    /[0-9]+-gate-a3-ci-[a-f0-9]{32}\.apps\.googleusercontent\.com/i.test(
      nestedRegressionOutput,
    )
  ) {
    throw new Error("nested auth fixture regression emitted raw private values");
  }
  const nestedRegressionPrefix =
    "CI_AUTH_FIXTURE_NESTED_ISOLATION_REGRESSION_RESULT ";
  const nestedRegressionLine = nestedRegressionOutput
    .split("\n")
    .find((line) => line.startsWith(nestedRegressionPrefix));
  if (!nestedRegressionLine) {
    throw new Error("nested auth fixture regression execution result is missing");
  }
  const nestedRegressionResult = JSON.parse(
    nestedRegressionLine.slice(nestedRegressionPrefix.length),
  );
  const workflowSource = [
    ".github/workflows/ci.yml",
    ".github/workflows/full-advisory-e2e.yml",
  ]
    .map((relativePath) =>
      readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    )
    .join("\n");
  const requiredScripts = {
    "ci:auth-fixture:export": "export-github-env",
    "ci:auth-fixture:validate": "validate-env",
    "ci:auth-fixture:validate-existing": "validate-existing",
    "ci:auth-fixture:production-misuse": "production-misuse",
    "ci:auth-fixture:production-misuse-existing":
      "production-misuse-existing",
    "ci:auth-fixture:preflight": "preflight",
    "ci:auth-fixture:preflight-existing": "preflight-existing",
    "test:advisory-auth-preflight": "preflight-local",
    "test:ci-auth-fixture-real-preflight":
      "run-ci-auth-fixture-session.mjs",
    "certification:auth-preflight": "run-ci-auth-fixture-session.mjs",
    "certification:auth-session-preflight":
      "run-ci-auth-fixture-real-preflight.mjs",
    "test:production-certification-auth-preflight-database":
      "test-production-certification-auth-preflight-database.mjs",
    "ci:auth-fixture:result:validate":
      "ci-auth-fixture-result-contract.cjs validate",
    "test:ci-auth-fixture-results": "test-ci-auth-fixture-results.ts",
    "test:ci-auth-fixture-session": "test-ci-auth-fixture-session.mjs",
  };
  for (const [scriptId, marker] of Object.entries(requiredScripts)) {
    if (!packageJson.scripts?.[scriptId]?.includes(marker)) {
      throw new Error(`canonical auth result command ${scriptId} is not registered`);
    }
  }
  for (const marker of [
    "CI_AUTH_FIXTURE_RESULT_ROOT",
    "CI_AUTH_FIXTURE_RESULT_PATH",
    "CI_AUTH_FIXTURE_RESULT_NONCE",
    "CI_AUTH_FIXTURE_ACTUAL_EXIT_STATUS",
    "writeStructuredResult",
    "validateAuthCommandResultValue",
    "validateAuthCommandResult",
    "RESOLVED_AUTH_RESULT_DESTINATIONS",
    "linkSync",
    "parent identity changed during publication",
    "observeChildClose",
    "AUTH_PREFLIGHT_CLEANUP_SIGNAL_MISMATCH",
    "Auth preflight cleanup signal evidence is inconsistent",
    "isInside(root, worktree)",
    "raw.trim()",
    'safeBodyType !== "null"',
    "productionMisuseEvidence",
    "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED",
    "sessionRequest",
    "readinessAttemptCount",
    "taskOwnedCleanup",
  ]) {
    if (!fixtureSource.includes(marker) && !contractSource.includes(marker)) {
      throw new Error(`auth result ownership is missing ${marker}`);
    }
  }
  if (
    authResultContract.AUTH_RESULT_SCHEMA !==
      "interior-ai.ci-auth-fixture-command-result.v1" ||
    authResultContract.AUTH_RESULT_VERSION !== 1 ||
    typeof authResultContract.validateAuthCommandResultValue !== "function" ||
    typeof authResultContract.validateAuthCommandResult !== "function" ||
    typeof authResultContract.writeAuthCommandResult !== "function" ||
    !contractSource.includes("Auth preflight success lacks canonical session-response proof") ||
    !contractSource.includes("Production-misuse intended rejection proof is incomplete") ||
    !contractSource.includes("Auth result contains a raw private value") ||
    !realPreflightSource.includes(
      'assert.equal(evidence.sessionRequest.safeBodyType, "null")',
    ) ||
    /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|VACUUM|REINDEX)\b/i.test(
      realPreflightSource,
    ) ||
    /\b(?:psql|createdb|dropdb|pg_dump|pg_restore)\b|\.(?:query|execute)\s*\(|\bsql\s*`|(?:from|require\s*\()\s*["'](?:pg|postgres|postgres\.js)["']/i.test(
      realPreflightSource,
    ) ||
    /pg_terminate_backend|\bDATABASE_URL\b|postgres(?:ql)?:\/\/|\bnew\s+URL\s*\(|\bURL\.(?:parse|canParse)\s*\(|\burl\.(?:parse|format|resolve)\s*\(|\.(?:href|hostname|pathname|password|username|protocol)\s*=/i.test(
      realPreflightSource,
    ) ||
    !realPreflightSource.includes(
      "prepareAuthSessionPreflightDatabaseLifecycle",
    ) ||
    !realPreflightSource.includes(
      "completeAuthSessionPreflightDatabaseLifecycle",
    ) ||
    !realPreflightSource.includes(
      "abortAuthSessionPreflightDatabaseLifecycle",
    ) ||
    !realPreflightSource.includes("projectCertificationChildEnvironment") ||
    !databaseLifecycleSource.includes(
      "AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS",
    ) ||
    !databaseLifecycleSource.includes(
      "createAuthSessionPreflightDatabaseBinding",
    ) ||
    !databaseLifecycleSource.includes(
      "resolveCertificationDatabaseStageEnvironment",
    ) ||
    !contractSource.includes(
      "Auth preflight success lacks complete database prerequisite and cleanup proof",
    ) ||
    !authDatabaseRegressionSource.includes("scoped role collision") ||
    !authDatabaseRegressionSource.includes("beforePrivateSidecarPublish") ||
    !qualificationSource.includes('"test:auth-env-hardening"') ||
    !qualificationSource.includes('"test:ci-auth-fixture-session"') ||
    !qualificationSource.includes('"test:ci-auth-fixture-real-preflight"') ||
    !qualificationSource.includes(
      '"scripts/test-production-certification-auth-preflight-database.mjs"',
    )
  ) {
    throw new Error("canonical auth result schema, validator, or no-leak policy is incomplete");
  }
  if (
    !fixtureSessionSource.includes(
      '"interior-ai.ci-auth-fixture-session.v1"',
    ) ||
    !fixtureSessionSource.includes("refuses a second generation attempt") ||
    !fixtureSessionSource.includes("owner-only mode 0700") ||
    !fixtureSessionSource.includes("owner-only mode-0600") ||
    !fixtureSessionSource.includes("rejected a missing or overridden parent") ||
    !fixtureSessionRunnerSource.includes("ci:auth-fixture:export") ||
    !fixtureSessionRunnerSource.includes("ci:auth-fixture:validate-existing") ||
    !fixtureSessionRunnerSource.includes(
      "ci:auth-fixture:production-misuse-existing",
    ) ||
    !fixtureSessionRunnerSource.includes(
      "certification:auth-session-preflight",
    ) ||
    !realPreflightSource.includes("ci:auth-fixture:preflight-existing") ||
    realPreflightSource.includes("test:advisory-auth-preflight") ||
    !fixtureSource.includes("LOCAL_ADVISORY_ONLY") ||
    !fixtureSource.includes("NOT_CERTIFICATION_FIXTURE_SESSION") ||
    !fixtureSessionRegressionSource.includes(
      "CI auth fixture exactly-once session tests passed",
    ) ||
    !fixtureSessionRegressionSource.includes(
      "isolatedAuthFixtureRegressionEnvironment",
    ) ||
    !fixtureSessionRegressionSource.includes(
      "AUTH_FIXTURE_CAPABILITY_NAMES",
    ) ||
    !fixtureRegressionEnvironmentSource.includes(
      "authFixtureRegressionCapabilityNames",
    ) ||
    !fixtureRegressionEnvironmentSource.includes(
      "delete environment[name]",
    ) ||
    !fixtureSessionRegressionSource.includes(
      "[process.argv[1], ISOLATED_CHILD_ARGUMENT]",
    ) ||
    !fixtureSessionRegressionSource.includes(
      "historical ambient auth fixture contamination must fail closed",
    ) ||
    !fixtureSessionRegressionSource.includes(
      "nested regression harness must not mutate global process.env",
    ) ||
    !Object.values(isolationProbe).every((value) => value === true) ||
    !sourceContinuitySource.includes(
      "runNestedAuthFixtureSourceRegression",
    ) ||
    !sourceContinuitySource.includes(
      "SOURCE_VALIDATION_NESTED_AUTH_FIXTURE_REGRESSION_RESULT",
    ) ||
    !simulationSource.includes(
      "SOURCE_VALIDATION_NESTED_AUTH_FIXTURE_REGRESSION_RESULT",
    ) ||
    !simulationSource.includes("sourceValidationNestedAuthFixtureRegression") ||
    !regressionMatrix.cases.some(
      (entry) =>
        entry.id === 38 &&
        entry.defect === "nested-auth-fixture-regression-ambient-contamination",
    ) ||
    JSON.stringify(regressionMatrix.nestedAuthFixtureIsolationCases) !==
      JSON.stringify([
        "outer-provider-variable-remains",
        "outer-fixture-session-id-remains",
        "outer-root-remains",
        "outer-nonce-remains",
        "outer-digest-metadata-remains",
        "nested-session-uses-outer-transport",
        "mixed-provider-bytes-with-distinct-session-ids",
        "parent-environment-mutation",
        "nested-cleanup-removes-outer-resources",
        "missing-nested-session-identity",
        "nested-duplicate-generation",
        "raw-provider-value-leak",
        "foreign-candidate-session-result",
      ]) ||
    JSON.stringify(canonicalCapabilityNames) !==
      JSON.stringify([
        "AUTH_SECRET",
        "CI_AUTH_FIXTURE_ACTIVE",
        "CI_AUTH_FIXTURE_ACTUAL_EXIT_STATUS",
        "CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA",
        "CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA",
        "CI_AUTH_FIXTURE_EXPECTED_COMMAND_ID",
        "CI_AUTH_FIXTURE_EXPECTED_MODE",
        "CI_AUTH_FIXTURE_LOCAL_TEST",
        "CI_AUTH_FIXTURE_MODE",
        "CI_AUTH_FIXTURE_NO_REGENERATION",
        "CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256",
        "CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256",
        "CI_AUTH_FIXTURE_RESULT_NONCE",
        "CI_AUTH_FIXTURE_RESULT_PATH",
        "CI_AUTH_FIXTURE_RESULT_ROOT",
        "CI_AUTH_FIXTURE_SESSION_CLASSIFICATION",
        "CI_AUTH_FIXTURE_SESSION_ID",
        "CI_AUTH_FIXTURE_SESSION_NONCE",
        "CI_AUTH_FIXTURE_SESSION_ROOT",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "NEXTAUTH_SECRET",
      ]) ||
    nestedRegressionResult.schema !==
      "interior-ai.ci-auth-fixture-nested-isolation-regression.v1" ||
    nestedRegressionResult.selectedOwner !== "nested-regression-child" ||
    nestedRegressionResult.historicalConflict !== "GOOGLE_CLIENT_ID" ||
    nestedRegressionResult.historicalContaminationRejected !== true ||
    nestedRegressionResult.isolatedChildPassed !== true ||
    nestedRegressionResult.parentEnvironmentUnchanged !== true ||
    nestedRegressionResult.outerSessionPreserved !== true ||
    nestedRegressionResult.outerResourcesPreserved !== true ||
    nestedRegressionResult.nestedResourcesCleaned !== true ||
    nestedRegressionResult.rawProviderValuesRecorded !== false ||
    JSON.stringify(nestedRegressionResult.negativeCases) !==
      JSON.stringify(regressionMatrix.nestedAuthFixtureIsolationCases) ||
    JSON.stringify(nestedRegressionResult.capabilityNames) !==
      JSON.stringify(canonicalCapabilityNames) ||
    environmentContract.value.baseEnvironmentPolicy.ordinaryVariables !==
      "preserve" ||
    !environmentContract.profiles["auth-session-preflight"].childVisibleVariables.includes(
      "CI_AUTH_FIXTURE_SESSION_ROOT",
    ) ||
    !environmentContract.profiles.build.childVisibleVariables.includes(
      "CI_AUTH_FIXTURE_SESSION_ID",
    ) ||
    !certificationRunnerSource.includes(
      "projectAuthFixtureSessionForStage",
    ) ||
    !certificationRunnerSource.includes(
      "Build auth fixture session belongs to another candidate",
    ) ||
    !artifactEvidenceSource.includes("authFixtureBuildContinuity") ||
    !artifactEvidenceSource.includes(
      "validateProjectedFixtureEnvironment",
    )
  ) {
    throw new Error("canonical exactly-once auth fixture session ownership is incomplete");
  }
  if (
    !fixtureSource.includes("process.stdout.write(stdout)") ||
    !fixtureSource.includes("process.stderr.write(stderr)") ||
    !fixtureSource.includes("writeStructuredResult(context")
  ) {
    throw new Error("auth stdout/stderr logs or structured result ownership are ambiguous");
  }
  const workflowCommandCount =
    workflowSource.match(
      /npm run ci:auth-fixture:(?:export|validate-existing|production-misuse-existing|preflight-existing)(?:\s|$)/g,
    )?.length ?? 0;
  const workflowValidatorCount =
    workflowSource.match(/npm run ci:auth-fixture:result:validate(?:\s|$)/g)
      ?.length ?? 0;
  const workflowStatusBindingCount =
    workflowSource.match(/CI_AUTH_FIXTURE_ACTUAL_EXIT_STATUS=/g)?.length ?? 0;
  const workflowFailureCaptureCount =
    workflowSource.match(/^\s+set \+e$/gm)?.length ?? 0;
  if (
    workflowCommandCount !== 11 ||
    workflowValidatorCount !== workflowCommandCount ||
    workflowStatusBindingCount !== workflowCommandCount ||
    workflowFailureCaptureCount !== workflowCommandCount
  ) {
    throw new Error(
      "auth workflow results are not validated for both success and failure exits",
    );
  }
  return {
    schema: authResultContract.AUTH_RESULT_SCHEMA,
    version: authResultContract.AUTH_RESULT_VERSION,
    explicitExternalDestination: true,
    canonicalValidatorRegistered: true,
    proseSuccessAuthority: false,
    arbitraryNonzeroExpectedNegativeAccepted: false,
    sessionServerResponseEvidenceRetained: true,
    authPreflightDatabaseLifecycleCanonical: true,
    authPreflightScopedRoleAdminCapabilities: false,
    authPreflightPortableRawDatabaseValues: false,
    authPreflightDatabaseDroppedBeforeSuccess: true,
    canonicalFixtureSessionSchema:
      "interior-ai.ci-auth-fixture-session.v1",
    soleCertificationGenerator: "ci:auth-fixture:export",
    validationConsumesExistingSession: true,
    productionMisuseConsumesExistingSession: true,
    databasePreflightConsumesExistingSession: true,
    localAdvisoryCertificationEligible: false,
    fixtureSessionBuildContinuity: true,
    exactlyOnceRegressionRegistered: true,
    nestedFixtureRegressionChildIsolation:
      isolationProbe.returnsFreshEnvironment &&
      isolationProbe.capabilitiesRemoved &&
      nestedRegressionResult.isolatedChildPassed === true,
    nestedFixtureRegressionCapabilityNameCount: canonicalCapabilityNames.length,
    historicalAmbientContaminationRegressionRegistered: true,
    nestedIsolationNegativeCaseCount:
      nestedRegressionResult.negativeCases.length,
    parentProcessEnvironmentMutation:
      !isolationProbe.parentEnvironmentUnchanged ||
      nestedRegressionResult.parentEnvironmentUnchanged !== true,
    outerFixtureProfilesPreserved:
      isolationProbe.ordinaryVariablesPreserved &&
      nestedRegressionResult.outerSessionPreserved === true &&
      nestedRegressionResult.outerResourcesPreserved === true,
    conflictDetectionFailClosed:
      nestedRegressionResult.historicalContaminationRejected === true &&
      nestedRegressionResult.historicalConflict === "GOOGLE_CLIENT_ID",
    rehearsalDatabaseIndependent: true,
    workflowFailureResultsValidated: true,
    rawAuthMaterialPortable: false,
    ownerHashes,
  };
}

function validatePortsAndProcesses(repositoryRoot) {
  const occupied = [];
  for (const port of PORTS) {
    const result = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], repositoryRoot);
    if (result.status === 0 && result.stdout.trim()) occupied.push(port);
  }
  if (occupied.length > 0) {
    throw new Error(`required certification ports are occupied: ${occupied.join(", ")}`);
  }
  const orchestrationPids = new Set([process.pid]);
  let ancestor = process.pid;
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = run("ps", ["-o", "ppid=", "-p", String(ancestor)], repositoryRoot);
    const parentPid = Number(parent.stdout?.trim());
    if (!Number.isSafeInteger(parentPid) || parentPid <= 1 || orchestrationPids.has(parentPid)) {
      break;
    }
    orchestrationPids.add(parentPid);
    ancestor = parentPid;
  }
  const processes = run("lsof", ["-nP", "-a", "-d", "cwd", "+D", repositoryRoot], repositoryRoot);
  const prohibited = (processes.stdout ?? "")
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("COMMAND") &&
        !orchestrationPids.has(Number(line.trim().split(/\s+/)[1])) &&
        /\b(?:npm|node|next|playwright|prisma|benchmark)\b/i.test(line),
    );
  if (prohibited.length > 0) {
    throw new Error("repository-owned application/build/test process is running");
  }
  return { ports: [...PORTS], repositoryOwnedProcesses: 0 };
}

function validateEvidenceDestinations(repositoryRoot, environment) {
  const evidenceRoot = environment[CERTIFICATION_EVIDENCE_ROOT_ENV];
  resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot: evidenceRoot,
    repositoryRoot,
  });
  if (environment[PHASE8_EXTERNAL_EVIDENCE_ROOT_ENV] !== evidenceRoot) {
    throw new Error("Phase 8 and certification evidence roots must be identical");
  }
  const destinations = new Set();
  const add = (value, name) => {
    if (destinations.has(value)) throw new Error(`duplicate evidence target: ${name}`);
    destinations.add(value);
  };
  const root = realpathSync(evidenceRoot);
  const absentContainedTarget = (value, name, { directory = false } = {}) => {
    if (!path.isAbsolute(value ?? "")) {
      throw new Error(`${name} target must be absolute`);
    }
    const resolved = path.resolve(value);
    let existingParent = path.dirname(resolved);
    while (!existsSync(existingParent)) {
      const next = path.dirname(existingParent);
      if (next === existingParent) break;
      existingParent = next;
    }
    const parent = realpathSync(existingParent);
    if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${name} target escapes its authorized root`);
    }
    if (lstatSync(existingParent).isSymbolicLink()) {
      throw new Error(`${name} target parent must be physical`);
    }
    if (existsSync(resolved)) throw new Error(`${name} target must be absent`);
    add(resolved, name);
    return { path: resolved, kind: directory ? "directory" : "file" };
  };
  for (const [variable, name, outputRole] of [
    ["CERTIFICATION_RUNTIME_REPORT_PATH", "runtime-smoke", "report"],
    ["CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH", "runtime phase timings", "timings"],
    ["CERTIFICATION_RUNTIME_EVIDENCE_PATH", "runtime certification evidence", "summary"],
  ]) {
    try {
      const destination = resolveRuntimeSmokeEvidencePath({
        requestedPath: environment[variable],
        repositoryRoot,
        authorizedExternalRoot: evidenceRoot,
        outputRole,
      });
      add(destination.outputPath, name);
    } catch (error) {
      throw new Error(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const runtimeStart = resolveRuntimeSmokeEvidencePath({
    requestedPath: path.join(
      path.resolve(evidenceRoot),
      "runtime-smoke/product-test-start.json",
    ),
    repositoryRoot,
    authorizedExternalRoot: evidenceRoot,
    outputRole: "startMarker",
  });
  add(runtimeStart.outputPath, "runtime start marker");
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const variable = `CERTIFICATION_BROWSER_${owner.id.toUpperCase().replaceAll("-", "_")}_REPORT_PATH`;
    const destination = resolveRequiredTestReportPath({
      requestedPath: environment[variable],
      repositoryRoot,
      gateId: owner.gateId,
      authorizedExternalRoot: evidenceRoot,
    });
    add(destination.outputPath, owner.id);
  }
  const phase8Path = resolvePlaywrightReportPath({
    requestedPath: environment.CERTIFICATION_PHASE8_EVIDENCE_PATH,
    repositoryRoot,
    authorizedExternalRoot: evidenceRoot,
  });
  add(phase8Path.outputPath, "phase8 certification evidence");
  absentContainedTarget(path.join(root, "phase8"), "Phase 8 raw evidence root", {
    directory: true,
  });
  for (const [relativeTarget, name, directory] of [
    ["archive/plan.json", "archive plan", false],
    ["archive/stage", "archive stage", true],
    ["archive/candidate.tar.gz", "compressed archive", false],
    ["archive/extracted", "archive extraction", true],
  ]) {
    absentContainedTarget(path.join(root, relativeTarget), name, { directory });
  }
  const requestedStatePath = path.resolve(
    environment.PRODUCTION_CERTIFICATION_STATE ?? "",
  );
  const statePath = path.join(
    realpathSync(path.dirname(requestedStatePath)),
    path.basename(requestedStatePath),
  );
  if (!statePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("certification state escapes its authorized root");
  }
  const stateMetadata = lstatSync(statePath);
  if (!stateMetadata.isFile() || stateMetadata.isSymbolicLink()) {
    throw new Error("certification state must be a physical file");
  }
  add(statePath, "certification state");
  const state = readCertificationState(statePath);
  const preparation = validateCertificationResourcePreparation({
    repositoryRoot,
    evidenceRoot,
    environment,
    state,
  });
  return {
    rootClass: "external",
    uniqueTargetCount: destinations.size,
    resourcePreparationValid: preparation.valid,
    preparedDestinationCount: preparation.destinationCount,
  };
}

function validateSource(repositoryRoot, environment) {
  const commitSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const status = git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]);
  if (!isSourceSha(commitSha) || !isSourceSha(treeSha)) {
    throw new Error("source SHA or tree cannot be resolved");
  }
  if (commitSha !== environment.CERTIFICATION_EXPECTED_COMMIT_SHA) {
    throw new Error("source commit does not match the declared candidate");
  }
  if (treeSha !== environment.CERTIFICATION_EXPECTED_TREE_SHA) {
    throw new Error("source tree does not match the declared candidate");
  }
  if (status !== "") throw new Error("source worktree or index is not clean");
  const parent = git(repositoryRoot, ["rev-parse", "HEAD^"]);
  if (!isSourceSha(environment.CERTIFICATION_EXPECTED_PARENT_SHA)) {
    throw new Error("declared candidate parent SHA is missing or malformed");
  }
  if (parent !== environment.CERTIFICATION_EXPECTED_PARENT_SHA) {
    throw new Error("candidate parentage is not exact");
  }
  return { commitSha, treeSha, parentSha: parent, trackedAndUntrackedClean: true };
}

function validateBuildTargetsPristine(repositoryRoot) {
  const targets = [
    ".next",
    ".local/production-artifact-evidence/semantic-event-journal.json",
    ".local/production-artifact-evidence/manifest.json",
    ".local/production-artifact-evidence/artifact-inventory.json",
  ];
  const present = targets.filter((relativePath) =>
    existsSync(path.join(repositoryRoot, relativePath)),
  );
  if (present.length > 0) {
    throw new Error(`strict build targets are not pristine: ${present.join(", ")}`);
  }
  return { absentTargets: targets };
}

function validateStageWorktreeIsolation(repositoryRoot, environment) {
  const statePath = environment.PRODUCTION_CERTIFICATION_STATE?.trim();
  const evidenceRoot = environment.CERTIFICATION_EVIDENCE_ROOT?.trim();
  if (!statePath || !evidenceRoot) {
    throw new Error("stage-worktree validation requires state and evidence roots");
  }
  const state = readCertificationState(statePath);
  const issues = certificationWorktreeIssues({
    state,
    evidenceRoot,
    canonicalRoot: repositoryRoot,
    requirePhysical: true,
  });
  if (issues.length > 0) throw new Error(issues.join("; "));
  const roots = [];
  for (const role of CERTIFICATION_WORKTREE_ROLES) {
    const resolved = resolveCertificationStageWorktree({
      state,
      evidenceRoot,
      canonicalRoot: repositoryRoot,
      role,
      phase: "pristine",
    });
    const capacity = statfsSync(resolved.root);
    if (Number(capacity.bavail) * Number(capacity.bsize) < 1024 ** 3) {
      throw new Error(`stage worktree filesystem capacity is below policy: ${role}`);
    }
    roots.push(resolved.root);
  }
  if (new Set(roots).size !== CERTIFICATION_WORKTREE_ROLES.length) {
    throw new Error("stage worktree roles are not physically distinct");
  }
  return {
    roles: [...CERTIFICATION_WORKTREE_ROLES],
    pathsOutsideCanonicalCheckout: true,
    pathsOutsideEvidenceRoot: true,
    symlinkAliasesRejected: true,
    exactCandidateAvailable: true,
    creationPermissionsProven: true,
    filesystemCapacityPolicyBytes: 1024 ** 3,
    pristineIgnoredPathCount: 0,
    canonicalIgnoredArtifactsInArtifactContract: false,
    quarantineRequired: false,
  };
}

function validateContracts(repositoryRoot) {
  const artifactContract = readFileSync(
    path.join(repositoryRoot, "scripts/production-artifact-contract.mjs"),
    "utf8",
  );
  const artifactOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-artifact-evidence.mjs"),
    "utf8",
  );
  const playwrightOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-artifact-playwright.mjs"),
    "utf8",
  );
  const finalOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-evidence.mjs"),
    "utf8",
  );
  const historicalOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-historical-evidence.mjs",
    ),
    "utf8",
  );
  const timingOwner = readFileSync(
    path.join(repositoryRoot, "scripts/runtime-smoke-phase-budget.mjs"),
    "utf8",
  );
  const archiveOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-archive.mjs"),
    "utf8",
  );
  const simulationOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-simulation.mjs"),
    "utf8",
  );
  const phase8Owner = readFileSync(
    path.join(repositoryRoot, "scripts/run-phase8-project-benchmark.ts"),
    "utf8",
  );
  const certificationRunner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-real.mjs"),
    "utf8",
  );
  const sourceContinuityOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-source-continuity.mjs",
    ),
    "utf8",
  );
  const worktreeOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-worktrees.mjs"),
    "utf8",
  );
  const worktreeRegressionOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/test-production-certification-state-worktrees.mjs",
    ),
    "utf8",
  );
  const contractMatrix = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "docs/qa/production-certification-contract.v1.json"),
      "utf8",
    ),
  );
  const requiredTestManifest = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "scripts/required-test-manifest.json"),
      "utf8",
    ),
  );
  const artifactGate = requiredTestManifest.gates?.find(
    (gate) => gate.id === "ci.production-artifact-contract",
  );
  for (const marker of [
    "interior-ai.production-artifact-evidence.v3",
    "interior-ai.production-artifact-semantic-event-journal.v2",
    "ARCHIVE_PREFLIGHT",
    "STANDALONE_FINAL",
  ]) {
    if (!artifactContract.includes(marker) && !artifactOwner.includes(marker)) {
      throw new Error(`verification compatibility marker is missing: ${marker}`);
    }
  }
  const currentJournalImports = [
    artifactOwner,
    playwrightOwner,
    finalOwner,
    timingOwner,
    certificationRunner,
    sourceContinuityOwner,
  ];
  if (
    PRODUCTION_EVIDENCE_JOURNAL_SCHEMA !==
      "interior-ai.production-artifact-semantic-event-journal.v2" ||
    PRODUCTION_EVIDENCE_JOURNAL_VERSION !== 2 ||
    !artifactContract.includes("validateCurrentProductionEvidenceSemanticJournal") ||
    !artifactOwner.includes("validateCurrentProductionEvidenceSemanticJournal") ||
    currentJournalImports.some(
      (sourceText) => !sourceText.includes("production-artifact-contract.mjs"),
    ) ||
    !playwrightOwner.includes("validateCurrentProductionEvidenceManifest") ||
    !finalOwner.includes("validateCurrentProductionEvidenceManifest") ||
    !finalOwner.includes(
      "identity?.semanticJournalVersion !== PRODUCTION_EVIDENCE_JOURNAL_VERSION",
    ) ||
    !finalOwner.includes(
      "evidence?.journalIdentity?.version !== PRODUCTION_EVIDENCE_JOURNAL_VERSION",
    ) ||
    /semanticJournalVersion\s*!==\s*1/.test(finalOwner) ||
    /journalIdentity\?\.version\s*!==\s*1/.test(finalOwner) ||
    !timingOwner.includes("semanticJournalVersion: PRODUCTION_EVIDENCE_JOURNAL_VERSION") ||
    !certificationRunner.includes(
      "schema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA",
    ) ||
    !certificationRunner.includes(
      "version: PRODUCTION_EVIDENCE_JOURNAL_VERSION",
    ) ||
    archiveOwner.includes("semantic-journal-v1") ||
    !sourceContinuityOwner.includes("certificationPreparedBuildJournalIssues") ||
    !simulationOwner.includes("runtimeArtifactIdentity(state)") ||
    !simulationOwner.includes("journalIdentity") ||
    !artifactGate?.requiredSources?.includes(
      "scripts/test-production-certification.mjs",
    ) ||
    !historicalOwner.includes("HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION") ||
    finalOwner.includes("HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION") ||
    contractMatrix.stages?.some?.(
      (stage) => stage.id === "semantic-journal-v1",
    )
  ) {
    throw new Error(
      "current journal-v2 producer, runtime, archive, continuity, final, or historical boundary is incoherent",
    );
  }
  if (
    !artifactOwner.includes('testPolicy: "external-certification-required"') ||
    artifactOwner.includes("requireTests: false") ||
    !phase8Owner.includes("PHASE8_EXTERNAL_EVIDENCE_ROOT")
  ) {
    throw new Error("verification mode or external Phase 8 policy is incomplete");
  }
  const generatedCompleted = artifactOwner.indexOf("generatedSourceCheck.completedAt");
  const buildStarted = artifactOwner.indexOf("manifest.build.startedAt");
  if (generatedCompleted < 0 || buildStarted < 0) {
    throw new Error("generated-source/build ordering contract is missing");
  }
  if (
    !artifactContract.includes(
      "filesystem timestamps cannot populate portable semantic evidence",
    )
  ) {
    throw new Error("semantic timestamp ownership rejection is missing");
  }
  const source = sourceValidationCheckSet(repositoryRoot);
  const continuity = continuityContract(repositoryRoot);
  if (
    source.checks.length === 0 ||
    source.checks.some(
      (check) => !check.canonicalCommand || check.continueAfterFailure !== false,
    ) ||
    continuity.lifecyclePositions.length !== 6 ||
    continuity.syntheticCopiedHashAllowed !== false ||
    continuity.retainPhysicalRootsUntilPassed !== true ||
    JSON.stringify(continuity.integrationReadyRequires) !==
      JSON.stringify(["source-validation", "final-standalone", "continuity"]) ||
    !certificationRunner.includes("sourceValidationStageEvidence") ||
    !certificationRunner.includes("captureArtifactSnapshot") ||
    !certificationRunner.includes("measureFinalContinuity") ||
    !sourceContinuityOwner.includes("rehashPhysicalRoot: true") ||
    contractMatrix.transactionalStateValidation?.canonicalIdentitySource !==
      "sealed certification state" ||
    contractMatrix.stageWorktrees?.minimumDistinctPhysicalRoots !== 3 ||
    !worktreeOwner.includes("CERTIFICATION_WORKTREE_ROLES") ||
    !worktreeRegressionOwner.includes('name: "missing-candidate-id"') ||
    !worktreeRegressionOwner.includes("canonical-checkout-as-stage-root-rejected") ||
    /git\s+clean|clean\s+-x/.test(`${certificationRunner}\n${worktreeOwner}`) ||
    /\.map\(\(name\) => \[name, state\.bindings\.artifactSha256\]\)/.test(
      certificationRunner,
    )
  ) {
    throw new Error(
      "source-validation execution or measured continuity contract is incomplete",
    );
  }
  return {
    artifactSchema: "v3",
    journalSchema: "v2",
    journalCoherence: {
      schema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
      version: PRODUCTION_EVIDENCE_JOURNAL_VERSION,
      canonicalOwner: "scripts/production-artifact-contract.mjs",
      producerAndCurrentConsumersAligned: true,
      historicalV1Isolated: true,
      currentPositiveFixtureRegistered: true,
    },
    verificationModes: ["verify-preflight", "verify-archive-preflight", "verify-standalone"],
    sourceValidation: {
      schema: "interior-ai.production-certification-source-validation.v4",
      checkCount: source.checks.length,
      checkSetSha256: source.sha256,
      allCanonicalCommandsPresent: true,
    },
    continuity: {
      schema: "interior-ai.production-certification-artifact-snapshot.v1",
      lifecyclePositions: continuity.lifecyclePositions.map((entry) => entry.id),
      captureCommandsDeclared: true,
      comparisonScopes: Object.keys(continuity.comparisons),
      retainedPhysicalRoots: true,
      syntheticCopiedHashAllowed: false,
      integrationReadyRequires: continuity.integrationReadyRequires,
    },
  };
}

function validateDependencyLifecycleContracts(repositoryRoot) {
  const read = (relativePath) =>
    readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const dependencyOwner = read(
    "scripts/production-certification-dependencies.mjs",
  );
  const stateOwner = read("scripts/production-certification-state.mjs");
  const worktreeOwner = read("scripts/production-certification-worktrees.mjs");
  const realRunner = read("scripts/production-certification-real.mjs");
  const sourceOwner = read(
    "scripts/production-certification-source-continuity.mjs",
  );
  const regressionOwner = read(
    "scripts/test-production-certification-dependency-lifecycle.mjs",
  );
  const matrix = JSON.parse(
    read("docs/qa/production-certification-contract.v1.json"),
  );
  const sourceStage = realRunner.slice(
    realRunner.indexOf("export async function runSourceValidationStage"),
    realRunner.indexOf("export async function runBuildStage"),
  );
  const buildStage = realRunner.slice(
    realRunner.indexOf("export async function runBuildStage"),
    realRunner.indexOf("function archiveEnvironment"),
  );
  const browserStage = realRunner.slice(
    realRunner.indexOf("export async function runBrowserOwnersStage"),
    realRunner.indexOf("export async function runFinalStandaloneStage"),
  );
  const ordered = (source, first, second) =>
    source.indexOf(first) >= 0 &&
    source.indexOf(second) > source.indexOf(first);
  const postStageRevalidation =
    buildStage.includes("postBuildDependencyRevalidation") &&
    buildStage.includes('boundary: "post-build"') &&
    buildStage.includes('"FINAL_EVIDENCE_FAILURE"') &&
    browserStage.includes("finalArtifactDependencyRevalidation") &&
    browserStage.includes("developmentBrowserDependencyRevalidation") &&
    [...browserStage.matchAll(/boundary: "post-browser-owners"/g)].length >= 2 &&
    browserStage.includes("finalArtifactPreOwnerRevalidation") &&
    browserStage.includes("developmentBrowserPreOwnerRevalidation");
  if (
    !dependencyOwner.includes(
      "interior-ai.production-certification-worktree-dependency-binding.v1",
    ) ||
    !dependencyOwner.includes("not-installed") ||
    !dependencyOwner.includes("installed") ||
    !dependencyOwner.includes("removed") ||
    !dependencyOwner.includes("physicalContentInventory") ||
    !dependencyOwner.includes("nodeModuleSearchPathProof") ||
    !dependencyOwner.includes("certificationDependencyInstallationEnvironment") ||
    !dependencyOwner.includes("dependency-binding evidence shape is not exact") ||
    !stateOwner.includes("bindCertificationWorktreeDependencies") ||
    !stateOwner.includes("transitionCertificationState") ||
    !stateOwner.includes("expectedCurrentSha256") ||
    !stateOwner.includes("beforeFinalDependencyMeasurement") ||
    !stateOwner.includes("changed between binding validation and atomic state commit") ||
    !worktreeOwner.includes("dependencyStatus: \"not-installed\"") ||
    !ordered(
      sourceStage,
      "installAndBindRoleDependencies",
      "sourceValidationStageEvidence",
    ) ||
    !ordered(
      sourceStage,
      "sourceValidationStageEvidence",
      "validateSourceValidationEvidence",
    ) ||
    !ordered(
      buildStage,
      "installAndBindRoleDependencies",
      "complete-certification-build",
    ) ||
    !ordered(
      browserStage,
      "installAndBindRoleDependencies",
      '"--list"',
    ) ||
    [...realRunner.matchAll(/installAndBindRoleDependencies\(\{/g)].length !== 4 ||
    sourceOwner.includes("bindCertificationWorktreeDependencies") ||
    sourceOwner.includes("writeCertificationState") ||
    !sourceOwner.includes("preCheckRevalidation") ||
    !sourceOwner.includes("postCheckRevalidation") ||
    !sourceOwner.includes("bindingStateEvidence") ||
    !sourceOwner.includes("dependencyBindingStateReceiptIssues") ||
    !postStageRevalidation ||
    !regressionOwner.includes("already-bound dependencies cannot be overwritten") &&
      !regressionOwner.includes("cannot be overwritten") ||
    matrix.dependencyLifecycle?.schema !==
      "interior-ai.production-certification-worktree-dependency-lifecycle.v1" ||
    matrix.dependencyLifecycle?.bindingTransition !==
      "worktree-dependencies:bind"
  ) {
    throw new Error(
      "dependency lifecycle, durable binding order, or anti-bypass contract is incomplete",
    );
  }
  return {
    schema:
      "interior-ai.production-certification-worktree-dependency-lifecycle.v1",
    evidenceSchema:
      "interior-ai.production-certification-worktree-dependency-binding.v1",
    stateSchema: "interior-ai.production-certification-state.v4",
    roles: [...CERTIFICATION_WORKTREE_ROLES],
    initialStatus: "not-installed",
    bindingTransition: "worktree-dependencies:bind",
    sourceBindBeforeChecksAndAggregateValidation: true,
    finalArtifactBindBeforeGeneratedSourceAndBuild: true,
    developmentBrowserBindBeforeDiscoveryAndOwners: true,
    postStageRevalidation,
    crossWorktreeAndGlobalResolutionRejected: true,
  };
}

function namedImportsFromCanonicalContract(source) {
  const names = new Map();
  const pattern =
    /import\s*\{([^}]*)\}\s*from\s*["']\.\/production-certification-contract\.mjs["']/g;
  for (const match of source.matchAll(pattern)) {
    for (const entry of match[1].split(",")) {
      const [imported, local = imported] = entry.trim().split(/\s+as\s+/);
      if (imported) names.set(imported, local);
    }
  }
  return names;
}

function stringArrayLiteral(value) {
  const stages = [];
  const remainder = value.replace(
    /(["'])([a-z0-9]+(?:-[a-z0-9]+)*)\1/g,
    (_match, _quote, stage) => {
      stages.push(stage);
      return "";
    },
  );
  return /^[\s\[\],]*$/.test(remainder) ? stages : null;
}

function literalStageOrder(source) {
  const match = source.match(
    /export\s+const\s+CERTIFICATION_STAGE_ORDER\s*=\s*Object\.freeze\(\s*(\[[\s\S]*?\])\s*\);/,
  );
  if (!match) {
    throw new Error("canonical certification stage-order export is missing");
  }
  const order = stringArrayLiteral(match[1]);
  if (order === null) {
    throw new Error("canonical certification stage-order export is not a literal array");
  }
  if (
    !Array.isArray(order) ||
    order.some((stage) => typeof stage !== "string" || !stage) ||
    new Set(order).size !== order.length
  ) {
    throw new Error("canonical certification stage order is malformed or duplicated");
  }
  return order;
}

function copiedStageOrderNames(source) {
  const names = [];
  const declaration =
    /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\(\s*)?(\[[\s\S]*?\])\s*\)?;/gm;
  for (const match of source.matchAll(declaration)) {
    if (match[1] === "CERTIFICATION_STAGE_ORDER") continue;
    const value = stringArrayLiteral(match[2]);
    if (
      value !== null &&
      value.length === CERTIFICATION_STAGE_ORDER.length &&
      value.every((stage) => CERTIFICATION_STAGE_ORDER.includes(stage))
    ) {
      names.push(match[1]);
    }
  }
  return names;
}

export function validateCertificationStageOrderContracts(
  repositoryRoot,
  { sourceOverrides = {} } = {},
) {
  const read = (relativePath) =>
    Object.hasOwn(sourceOverrides, relativePath)
      ? sourceOverrides[relativePath]
      : readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const canonicalOwner = "scripts/production-certification-contract.mjs";
  const expectedConsumers = [
    "scripts/production-certification-state.mjs",
    "scripts/production-certification-real.mjs",
    "scripts/production-certification-doctor.mjs",
    "scripts/production-certification-simulation.mjs",
    "scripts/production-certification.mjs",
    "scripts/test-production-certification-stage-order.mjs",
  ];
  const canonicalSource = read(canonicalOwner);
  const sourceOrder = literalStageOrder(canonicalSource);
  if (JSON.stringify(sourceOrder) !== JSON.stringify(CERTIFICATION_STAGE_ORDER)) {
    throw new Error("canonical certification stage-order source and runtime identity differ");
  }
  if (
    Object.keys(CERTIFICATION_STAGE_COMMANDS).join("\n") !==
    CERTIFICATION_STAGE_ORDER.join("\n")
  ) {
    throw new Error("certification stage commands and canonical order differ");
  }

  const scriptPaths = readdirSync(path.join(repositoryRoot, "scripts"))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => `scripts/${name}`)
    .sort();
  const sources = Object.fromEntries(scriptPaths.map((name) => [name, read(name)]));
  const importGraph = Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [
      name,
      [...source.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.\/[^"']+)["']/g)]
        .map((match) =>
          path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1])),
        )
        .filter((target) => Object.hasOwn(sources, target)),
    ]),
  );
  const reachesRealRunner = (start) => {
    const pending = [start];
    const visited = new Set();
    while (pending.length > 0) {
      const name = pending.pop();
      if (name === "scripts/production-certification-real.mjs") return true;
      if (visited.has(name)) continue;
      visited.add(name);
      pending.push(...(importGraph[name] ?? []));
    }
    return false;
  };
  if (reachesRealRunner(canonicalOwner)) {
    throw new Error("canonical certification stage-order import creates a cycle");
  }
  const definitions = Object.entries(sources)
    .filter(([, source]) =>
      /^(?:export\s+)?(?:const|let|var)\s+CERTIFICATION_STAGE_ORDER\b/m.test(
        source,
      ),
    )
    .map(([name]) => name);
  if (JSON.stringify(definitions) !== JSON.stringify([canonicalOwner])) {
    throw new Error("certification stage order has a missing or duplicate owner");
  }

  const consumers = Object.entries(sources)
    .filter(
      ([name, source]) =>
        name !== canonicalOwner && source.includes("CERTIFICATION_STAGE_ORDER"),
    )
    .map(([name, source]) => {
      if (
        namedImportsFromCanonicalContract(source).get(
          "CERTIFICATION_STAGE_ORDER",
        ) !== "CERTIFICATION_STAGE_ORDER"
      ) {
        throw new Error(`${name} does not import the canonical certification stage order`);
      }
      const copied = copiedStageOrderNames(source);
      if (copied.length > 0) {
        throw new Error(
          `${name} copies the canonical certification stage order as ${copied.join(", ")}`,
        );
      }
      return name;
    });
  for (const consumer of expectedConsumers) {
    if (!consumers.includes(consumer)) {
      throw new Error(`${consumer} does not resolve the canonical certification stage order`);
    }
  }

  const realRunner = sources["scripts/production-certification-real.mjs"];
  const runnerStages = [
    ...realRunner.matchAll(
      /(?:managedStage|bindDatabaseForStage)\s*\(\s*(?:context|refreshed),\s*["']([^"']+)["']/g,
    ),
    ...realRunner.matchAll(/\.stages\s*\[\s*["']([^"']+)["']\s*\]/g),
  ].map((match) => match[1]);
  const unknownRunnerStages = [...new Set(runnerStages)].filter(
    (stage) => !CERTIFICATION_STAGE_ORDER.includes(stage),
  );
  const missingRunnerStages = CERTIFICATION_STAGE_ORDER.filter(
    (stage) => !runnerStages.includes(stage),
  );
  if (unknownRunnerStages.length > 0 || missingRunnerStages.length > 0) {
    throw new Error(
      `real runner stage inventory differs from canonical order: unknown=${unknownRunnerStages.join(",")}; missing=${missingRunnerStages.join(",")}`,
    );
  }

  const qualificationOwner = sources["scripts/production-certification.mjs"];
  const harnessTestOwner = sources["scripts/test-production-certification.mjs"];
  const regressionMatrix = JSON.parse(
    read("scripts/production-certification-regressions.json"),
  );
  if (
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(
      "scripts/test-production-certification-stage-order.mjs",
    ) ||
    !qualificationOwner.includes(
      '"scripts/test-production-certification-stage-order.mjs"',
    ) ||
    !harnessTestOwner.includes(
      'import "./test-production-certification-stage-order.mjs"',
    ) ||
    !regressionMatrix.cases.some(
      (entry) => entry.defect === "real-runner-stage-order-missing-import",
    )
  ) {
    throw new Error(
      "real-runner stage-order dispatch regression is not registered in qualification",
    );
  }

  return {
    canonicalOwner,
    stageCount: CERTIFICATION_STAGE_ORDER.length,
    stageOrderSha256: sha256Bytes(canonicalJsonBytes(CERTIFICATION_STAGE_ORDER)),
    consumers,
    realRunnerStages: CERTIFICATION_STAGE_ORDER.filter((stage) =>
      runnerStages.includes(stage),
    ),
    duplicateOwner: false,
    circularDependency: false,
    dispatchRegressionRegistered: true,
  };
}

function validateSourceGeneratedOutputContracts(repositoryRoot) {
  const source = sourceValidationCheckSet(repositoryRoot);
  const generated = source.generatedOutputs;
  const byId = Object.fromEntries(
    generated.value.outputs.map((entry) => [entry.id, entry]),
  );
  const worktreeOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-worktrees.mjs"),
    "utf8",
  );
  const lifecycleOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-source-generated-outputs.mjs",
    ),
    "utf8",
  );
  const sourceOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-source-continuity.mjs",
    ),
    "utf8",
  );
  const qualificationOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification.mjs"),
    "utf8",
  );
  const regressionOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/test-production-certification-source-generated-outputs.mjs",
    ),
    "utf8",
  );
  const regressionMatrix = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "scripts/production-certification-regressions.json"),
      "utf8",
    ),
  );
  if (
    source.checks.length !== 19 ||
    generated.value.checkPolicies.length !== 19 ||
    generated.value.outputs.length !== 2 ||
    generated.value.unknownGeneratedOutputPolicy !== "fail-closed" ||
    JSON.stringify(generated.value.terminalPersistentIgnoredRoots) !==
      JSON.stringify(["node_modules"]) ||
    byId["floor-plan-upload-browser-fixture"]?.relativePath !==
      ".next/cache/floor-plan-upload-browser-fixture" ||
    byId["floor-plan-upload-browser-fixture"]?.ownerCheckId !==
      "floor-plan-upload-static-owner" ||
    JSON.stringify(
      byId["floor-plan-upload-browser-fixture"]?.permittedConsumerCheckIds,
    ) !== "[]" ||
    byId["floor-plan-upload-browser-fixture"]?.inventoryPolicy?.kind !==
      "producer-stdout-manifest" ||
    byId["typescript-build-info"]?.relativePath !== "tsconfig.tsbuildinfo" ||
    byId["typescript-build-info"]?.ownerCheckId !== "typescript-typecheck" ||
    generated.value.outputs.some(
      (entry) =>
        entry.relativePath === ".next" ||
        entry.relativePath === ".next/cache" ||
        /[*?\[\]{}]/.test(entry.relativePath) ||
        entry.symlinkPolicy !== "prohibited" ||
        entry.evidenceInventoryRequired !== true ||
        entry.cleanupDeadline?.kind !== "immediately-after-check",
    ) ||
    !worktreeOwner.includes('"source-validation": ["node_modules"]') ||
    worktreeOwner.includes('"source-validation": ["node_modules", ".next') ||
    worktreeOwner.includes('"source-validation": ["node_modules", "tsconfig.tsbuildinfo') ||
    !sourceOwner.includes("generatedOutputLifecycle?.beforeCheck") ||
    !sourceOwner.includes("generatedOutputLifecycle?.afterCheck") ||
    !sourceOwner.includes("validateSourceGeneratedOutputAggregate") ||
    !sourceOwner.includes("generatedOutputBoundaryIssues") ||
    !lifecycleOwner.includes("preCheckAbsenceProof") ||
    !lifecycleOwner.includes("closedRelativeInventory") ||
    !lifecycleOwner.includes("postCleanupAbsenceProof") ||
    !lifecycleOwner.includes("unlinkSync") ||
    !lifecycleOwner.includes("rmdirSync") ||
    lifecycleOwner.includes("rmSync") ||
    /git\s+clean|rm\s+-rf/.test(lifecycleOwner) ||
    !lifecycleOwner.includes("exact disposable source-validation worktree") ||
    !qualificationOwner.includes(
      "test-production-certification-source-generated-outputs.mjs",
    ) ||
    !qualificationOwner.includes('"--real-producers"') ||
    !regressionOwner.includes("additional fixture file") ||
    !regressionOwner.includes("canonical checkout can never be a cleanup target") ||
    !regressionOwner.includes("runCorrectedRealRunnerRegression") ||
    !regressionOwner.includes("sourceValidationStageEvidence") ||
    !regressionOwner.includes("validateCertificationState") ||
    !regressionOwner.includes(
      "Corrected 19-check real source-validation generated-output regression passed.",
    ) ||
    !regressionMatrix.cases.some(
      (entry) => entry.defect === "source-validation-generated-output-ownership",
    ) ||
    !Array.isArray(regressionMatrix.generatedOutputCases) ||
    regressionMatrix.generatedOutputCases.length !== 26
  ) {
    throw new Error(
      "source generated-output ownership, evidence, cleanup, or qualification contract is incomplete",
    );
  }
  return {
    schema: generated.value.schema,
    contractSha256: generated.sha256,
    checkPolicyCount: generated.value.checkPolicies.length,
    outputCount: generated.value.outputs.length,
    terminalPersistentIgnoredRoots:
      generated.value.terminalPersistentIgnoredRoots,
    cleanupPolicy: "exact-hash-matched-no-follow",
    regressionCaseCount: regressionMatrix.generatedOutputCases.length,
  };
}

function validateStageEnvironmentCapabilities(repositoryRoot, environment) {
  const contract = stageEnvironmentContract(repositoryRoot);
  const profileEntries = Object.entries(contract.profiles);
  const missingStages = CERTIFICATION_STAGE_ORDER.filter(
    (stage) => !profileEntries.some(([, profile]) => profile.stages.includes(stage)),
  );
  if (missingStages.length > 0) {
    throw new Error(
      `certification stages are missing environment profiles: ${missingStages.join(", ")}`,
    );
  }
  const source = sourceValidationCheckSet(repositoryRoot);
  if (
    source.checks.length !== 19 ||
    source.checks.some(
      (check) =>
        !check.environmentProfileId ||
        !contract.profiles[check.environmentProfileId]?.stages.includes(
          "source-validation",
        ) ||
        !check.qualificationEnvironmentProfileId ||
        !contract.profiles[
          check.qualificationEnvironmentProfileId
        ]?.stages.includes("source-validation"),
    )
  ) {
    throw new Error("all 19 source checks must declare source-validation profiles");
  }
  const sourceProfile = contract.profiles["source-validation"];
  const authPreflightProfile = contract.profiles["auth-session-preflight"];
  const buildProfile = contract.profiles.build;
  const runtimeProfile = contract.profiles["runtime-smoke"];
  const phase8Profile = contract.profiles.phase8;
  const productionBrowser = contract.profiles["production-browser-owner"];
  const developmentBrowser = contract.profiles["development-browser-owner"];
  const qualificationSourceProfile =
    contract.profiles["source-validation-qualification"];
  const expectedAuthPreflightVariables = [
    "CI_AUTH_FIXTURE_ACTIVE",
    "CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA",
    "CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA",
    "CI_AUTH_FIXTURE_MODE",
    "CI_AUTH_FIXTURE_NO_REGENERATION",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256",
    "CI_AUTH_FIXTURE_RESULT_NONCE",
    "CI_AUTH_FIXTURE_RESULT_PATH",
    "CI_AUTH_FIXTURE_RESULT_ROOT",
    "CI_AUTH_FIXTURE_SESSION_CLASSIFICATION",
    "CI_AUTH_FIXTURE_SESSION_ID",
    "CI_AUTH_FIXTURE_SESSION_NONCE",
    "CI_AUTH_FIXTURE_SESSION_ROOT",
    "DATABASE_URL",
  ];
  const expectedBuildAuthVariables = [
    "CI_AUTH_FIXTURE_ACTIVE",
    "CI_AUTH_FIXTURE_LOCAL_TEST",
    "CI_AUTH_FIXTURE_MODE",
    "CI_AUTH_FIXTURE_NO_REGENERATION",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256",
    "CI_AUTH_FIXTURE_SESSION_CLASSIFICATION",
    "CI_AUTH_FIXTURE_SESSION_ID",
    "CI_AUTH_FIXTURE_SESSION_NONCE",
  ];
  const databaseVariable = contract.variables.DATABASE_URL;
  const expectedDatabaseProfiles = [
    "artifact-product-server",
    "auth-session-preflight",
    "build",
    "development-browser-owner",
    "development-browser-owner-discovery",
    "phase8",
    "production-browser-owner",
    "production-browser-owner-discovery",
    "runtime-smoke",
    "simulation-production-evidence",
    "source-validation",
    "source-validation-qualification",
  ];
  const actualDatabaseProfiles = Object.entries(contract.profiles)
    .filter(([, profile]) =>
      profile.childVisibleVariables.includes("DATABASE_URL"),
    )
    .map(([profileId]) => profileId)
    .sort();
  const floorPlanCheck = source.checks.find(
    (entry) => entry.id === "floor-plan-required-closure",
  );
  const sourcePolicies = sourceProfile.valuePolicies;
  const qualificationSourcePolicies = qualificationSourceProfile.valuePolicies;
  const floorPlanLocalOcrTest = readFileSync(
    path.join(repositoryRoot, "scripts/test-floor-plan-local-ocr.ts"),
    "utf8",
  );
  const floorPlanAdapter = readFileSync(
    path.join(repositoryRoot, "lib/floor-plan-imports/pdf-raster-adapter.ts"),
    "utf8",
  );
  const floorPlanVisionConfiguration = readFileSync(
    path.join(
      repositoryRoot,
      "lib/floor-plan-imports/vision-configuration.ts",
    ),
    "utf8",
  );
  const stageEnvironmentRegression = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/test-production-certification-stage-environment.mjs",
    ),
    "utf8",
  );
  const sourceDatabaseProjectionRegression = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/test-production-certification-source-database-projection.mjs",
    ),
    "utf8",
  );
  const regressionMatrix = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "scripts/production-certification-regressions.json"),
      "utf8",
    ),
  );
  const runtimeTimingWriter = readFileSync(
    path.join(repositoryRoot, "scripts/runtime-smoke-phase-budget.mjs"),
    "utf8",
  );
  const certificationRunner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-real.mjs"),
    "utf8",
  );
  const sourceRunnerDispatch = certificationRunner.slice(
    certificationRunner.indexOf("export async function runSourceValidationStage"),
    certificationRunner.indexOf("export async function runBuildStage"),
  );
  const databaseLifecycleOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-database-lifecycle.mjs",
    ),
    "utf8",
  );
  const databaseAdapterOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-database-adapter.mjs",
    ),
    "utf8",
  );
  const sourceContinuityOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-source-continuity.mjs",
    ),
    "utf8",
  );
  const artifactEvidenceOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-artifact-evidence.mjs"),
    "utf8",
  );
  if (
    !sourceProfile.requiredVariables.includes("DATABASE_URL") ||
    !sourceProfile.childVisibleVariables.includes("DATABASE_URL") ||
    databaseVariable?.owner !==
      "production certification private database-binding projector" ||
    databaseVariable?.classification !== "private-stage-database-connection" ||
    databaseVariable?.portable !== false ||
    databaseVariable?.secret !== true ||
    JSON.stringify(actualDatabaseProfiles) !==
      JSON.stringify(expectedDatabaseProfiles) ||
    actualDatabaseProfiles.some(
      (profileId) =>
        !contract.profiles[profileId].requiredVariables.includes("DATABASE_URL"),
    ) ||
    contract.profiles.doctor.childVisibleVariables.includes("DATABASE_URL")
  ) {
    throw new Error("database stage capability ownership is incoherent");
  }
  if (
    !certificationRunner.includes(
      "resolveCertificationDatabaseStageEnvironment",
    ) ||
    !certificationRunner.includes("environment: sourceEnvironment") ||
    sourceRunnerDispatch.indexOf("bindDatabaseForStage") < 0 ||
    sourceRunnerDispatch.indexOf("const sourceEnvironment") <
      sourceRunnerDispatch.indexOf("bindDatabaseForStage") ||
    sourceRunnerDispatch.indexOf("sourceValidationStageEvidence") <
      sourceRunnerDispatch.indexOf("const sourceEnvironment") ||
    certificationRunner.includes(
      "sourceValidationStageEvidence({\n        repositoryRoot: context.repositoryRoot,\n        canonicalRoot: context.canonicalRoot,\n        evidenceRoot: context.evidenceRoot,\n        state: boundState,\n        environment: context.environment",
    )
  ) {
    throw new Error("source-validation database projection order is incoherent");
  }
  if (
    !databaseLifecycleOwner.includes("readPrivateDatabaseBinding") ||
    !databaseLifecycleOwner.includes("private-stage-login-no-admin") ||
    !databaseLifecycleOwner.includes("inspectStageConnection") ||
    !databaseLifecycleOwner.includes("ownershipRecoverable") ||
    !databaseLifecycleOwner.includes("foreignPreserved") ||
    !databaseLifecycleOwner.includes("linkSync(temporary, filePath)") ||
    !databaseLifecycleOwner.includes("beforePrivateSidecarPublish") ||
    !databaseAdapterOwner.includes("NOSUPERUSER NOCREATEDB NOCREATEROLE") ||
    !databaseAdapterOwner.includes("stageRoleCreateOutcome") ||
    !databaseAdapterOwner.includes("adminCapabilities: false") ||
    !sourceContinuityOwner.includes(
      "sanitizeSourceValidationDatabaseOutput",
    ) ||
    !sourceContinuityOwner.includes(
      "containsRawSourceValidationDatabaseMaterial",
    ) ||
    !sourceContinuityOwner.includes('stdio: ["ignore", "pipe", "pipe"]') ||
    !sourceContinuityOwner.includes("retainedRawDatabaseConnection: false") ||
    !sourceContinuityOwner.includes("[REDACTED_DATABASE_URL]") ||
    !sourceDatabaseProjectionRegression.includes("retainedLog") ||
    !sourceDatabaseProjectionRegression.includes("privateStagePassword") ||
    !artifactEvidenceOwner.includes("certifiedNestedDatabaseUrl") ||
    artifactEvidenceOwner.includes("DATABASE_URL: process.env.DATABASE_URL")
  ) {
    throw new Error("database private-binding or output-redaction boundary is missing");
  }
  if (
    !sourceProfile.parentOnlyVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    sourceProfile.childVisibleVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    JSON.stringify(authPreflightProfile?.stages) !==
      JSON.stringify(["auth-session-preflight"]) ||
    JSON.stringify(authPreflightProfile?.childVisibleVariables) !==
      JSON.stringify(expectedAuthPreflightVariables) ||
    JSON.stringify(authPreflightProfile?.requiredVariables) !==
      JSON.stringify(expectedAuthPreflightVariables) ||
    !contract.prefixes.includes("CI_AUTH_") ||
    contract.variables.CI_AUTH_FIXTURE_SESSION_ROOT?.portable !== false ||
    expectedBuildAuthVariables.some(
      (name) =>
        !buildProfile?.childVisibleVariables.includes(name) ||
        !buildProfile?.optionalVariables.includes(name) ||
        buildProfile?.requiredVariables.includes(name),
    ) ||
    buildProfile?.childVisibleVariables.includes("CI_AUTH_FIXTURE_SESSION_ROOT") ||
    !authPreflightProfile?.parentOnlyVariables.includes(
      "CERTIFICATION_DATABASE_ADMIN_URL",
    ) ||
    !authPreflightProfile?.parentOnlyVariables.includes(
      "CERTIFICATION_DATABASE_LIFECYCLE_PATH",
    ) ||
    sourceProfile.childVisibleVariables.some((name) =>
      new Set([
        "CERTIFICATION_RUNTIME_START_MARKER_PATH",
        "PLAYWRIGHT_JSON_OUTPUT_FILE",
        "PHASE8_EXTERNAL_EVIDENCE_ROOT",
        "REQUIRED_TEST_GATE_ID",
      ]).has(name),
    ) ||
    runtimeProfile.fixedValues.CERTIFICATION_ENVIRONMENT_STAGE !==
      "runtime-smoke" ||
    !runtimeProfile.requiredVariables.includes(
      "CERTIFICATION_RUNTIME_START_MARKER_PATH",
    ) ||
    !runtimeProfile.requiredVariables.includes(
      "PRODUCTION_EVIDENCE_MANIFEST",
    ) ||
    !runtimeProfile.parentOnlyVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    runtimeProfile.childVisibleVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    !runtimeProfile.requiredVariables.includes(
      "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT",
    ) ||
    !runtimeProfile.requiredVariables.includes("RUNTIME_SMOKE_PHASE_TIMINGS_PATH") ||
    !runtimeProfile.requiredVariables.includes(
      "CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256",
    ) ||
    sourceProfile.childVisibleVariables.includes(
      "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT",
    ) ||
    sourceProfile.childVisibleVariables.includes("RUNTIME_SMOKE_PHASE_TIMINGS_PATH") ||
    developmentBrowser.childVisibleVariables.includes(
      "RUNTIME_SMOKE_PHASE_TIMINGS_PATH",
    ) ||
    runtimeTimingWriter.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    !runtimeTimingWriter.includes("resolveRuntimeSmokeEvidencePath") ||
    !runtimeTimingWriter.includes("PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT") ||
    !certificationRunner.includes("preflightRuntimeSmokeEvidenceOutputs") ||
    !certificationRunner.includes("createRuntimeSmokeTimingEvidenceBinding") ||
    !phase8Profile.requiredVariables.includes("PHASE8_EXTERNAL_EVIDENCE_ROOT") ||
    productionBrowser.fixedValues.PLAYWRIGHT_USE_PRODUCTION_SERVER !== "1" ||
    developmentBrowser.childVisibleVariables.includes(
      "PLAYWRIGHT_USE_PRODUCTION_SERVER",
    ) ||
    floorPlanCheck?.canonicalCommand !== "npm run test:floor-plan-required" ||
    sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.policy !==
      "check-owned-fixture-value" ||
    sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.value !== "0" ||
    sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.valueType !== "boolean" ||
    JSON.stringify(
      sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.ownerCheckIds,
    ) !== JSON.stringify(["floor-plan-required-closure"]) ||
    JSON.stringify(sourcePolicies) !==
      JSON.stringify(qualificationSourcePolicies) ||
    [
      "FLOOR_PLAN_LOCAL_OCR_DISABLED",
      "FLOOR_PLAN_VISION_DISABLED",
      "FLOOR_PLAN_VISION_MODEL",
      "OPENAI_API_KEY",
    ].some((name) => sourcePolicies[name]?.policy !== "must-be-absent") ||
    [contract.profiles.build, runtimeProfile].some(
      (profile) =>
        profile.valuePolicies.FLOOR_PLAN_VISION_ENABLED?.policy !==
          "optional-non-secret-enum" ||
        profile.valuePolicies.OPENAI_API_KEY?.policy !==
          "optional-secret-value-not-recorded" ||
        Object.values(profile.valuePolicies).some(
          (policy) => policy.policy === "check-owned-fixture-value",
        ),
    ) ||
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(
      "scripts/test-production-certification-stage-environment.mjs",
    ) ||
    !/module import before environment setup/i.test(stageEnvironmentRegression) ||
    !/historical real-runner leakage reproduction/i.test(
      stageEnvironmentRegression,
    ) ||
    !sourceDatabaseProjectionRegression.includes("runSourceValidationStage") ||
    !sourceDatabaseProjectionRegression.includes(
      "Object.hasOwn(environment, \"DATABASE_URL\")",
    ) ||
    !sourceDatabaseProjectionRegression.includes(
      "resolveCertificationDatabaseStageEnvironment",
    ) ||
    !sourceDatabaseProjectionRegression.includes(
      "adminCredentialPresent, false",
    ) ||
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(
      "scripts/test-production-certification-source-database-projection.mjs",
    ) ||
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(
      "scripts/test-production-certification-auth-preflight-database.mjs",
    ) ||
    !regressionMatrix.cases.some(
      (entry) =>
        entry.defect === "source-validation-database-environment-projection",
    ) ||
    !regressionMatrix.cases.some(
      (entry) =>
        entry.defect === "auth-session-preflight-database-lifecycle-bridge",
    ) ||
    !regressionMatrix.cases.some(
      (entry) =>
        entry.defect === "auth-fixture-session-continuity-owner-missing",
    ) ||
    regressionMatrix.authPreflightDatabaseCases?.length !== 30 ||
    !/externalVisionEnabled, false/.test(floorPlanLocalOcrTest) ||
    /process\.env|delete\s+process\.env/.test(floorPlanLocalOcrTest) ||
    !/externalVisionEnabled:\s*environment\.FLOOR_PLAN_VISION_ENABLED === "1"/.test(
      floorPlanVisionConfiguration,
    ) ||
    !/const vision = floorPlanVisionRuntimeConfiguration\(\)/.test(
      floorPlanAdapter,
    ) ||
    !/externalVisionEnabled: vision\.externalVisionEnabled/.test(
      floorPlanAdapter,
    ) ||
    !/!vision\.externalVisionEnabled/.test(floorPlanAdapter) ||
    !/!vision\.apiKeyConfigured/.test(floorPlanAdapter)
  ) {
    throw new Error(
      "runtime, browser-owner, Phase 8, or source-validation environment profiles are incoherent",
    );
  }
  const unknownParentControls = Object.keys(environment)
    .filter(
      (name) =>
        isCertificationControlVariableName(name, contract) &&
        !Object.hasOwn(contract.variables, name),
    )
    .sort();
  if (unknownParentControls.length > 0) {
    throw new Error(
      `unknown certification-control variables are prohibited: ${unknownParentControls.join(", ")}`,
    );
  }
  return {
    schema: contract.value.schema,
    contractSha256: contract.sha256,
    profileCount: profileEntries.length,
    sourceCheckCount: source.checks.length,
    sourceEvidenceRootParentOnly: true,
    floorPlanSourceConfigurationOwned: true,
    sourceDatabaseProjectionOwner:
      "resolveCertificationDatabaseStageEnvironment",
    sourceDatabaseProjectionRegressionRegistered: true,
    databaseCapabilityIsolation: true,
    databaseCapableProfiles: actualDatabaseProfiles,
    valuePolicySha256: sourceProfile.valuePolicySha256,
    importOrderRegressionRegistered: true,
    historicalFloorPlanRegressionRegistered: true,
    buildRuntimeVisionConfigurationPreserved: true,
    runtimeActivationExplicit: true,
    runtimeTimingRootOwner: "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT",
    runtimeTimingTargetPreflight: true,
    runtimeTimingWriterContractShared: true,
    unknownControlPolicy: "fail-closed-in-doctor; strip-and-record-in-projector",
  };
}

export async function runCertificationDoctor({
  repositoryRoot = process.cwd(),
  environment = process.env,
  databaseStatusOwner = certificationDatabaseStatus,
}) {
  const root = path.resolve(repositoryRoot);
  const checks = [];
  const issues = [];
  check(checks, issues, "source-identity", () => validateSource(root, environment));
  check(checks, issues, "candidate-id", () => {
    if (!isCandidateId(environment.PRODUCTION_EVIDENCE_CANDIDATE_ID)) {
      throw new Error("candidate ID is missing or malformed");
    }
    return { propagatedName: "PRODUCTION_EVIDENCE_CANDIDATE_ID" };
  });
  check(checks, issues, "environment-name-shape", () => {
    const requiredNames =
      environment.CERTIFICATION_EXECUTION_CLASS === "deterministic-simulation"
        ? REQUIRED_APPLICATION_ENVIRONMENT_NAMES.filter(
            (name) => !name.startsWith("CERTIFICATION_DATABASE_"),
          )
        : REQUIRED_APPLICATION_ENVIRONMENT_NAMES;
    const missing = requiredNames.filter(
      (name) => !requiredAlternativesPresent(environment, name),
    );
    if (missing.length > 0) throw new Error(`missing required names: ${missing.join(", ")}`);
    return { requiredNameCount: requiredNames.length };
  });
  check(checks, issues, "execution-classification", () => {
    if (!new Set(["real-candidate", "deterministic-simulation"]).has(environment.CERTIFICATION_EXECUTION_CLASS)) {
      throw new Error("execution classification is missing or unknown");
    }
    return { executionClass: environment.CERTIFICATION_EXECUTION_CLASS };
  });
  try {
    checks.push({
      id: "database-lifecycle",
      passed: true,
      details: await validateCertificationDatabaseDoctorShape(root, environment, {
        statusOwner: databaseStatusOwner,
      }),
    });
  } catch (error) {
    checks.push({ id: "database-lifecycle", passed: false, details: null });
    issues.push(
      `database-lifecycle: ${redactDatabaseLifecycleFailure(error)}`,
    );
  }
  check(checks, issues, "network-shape", () => validateNetworkShape(environment));
  check(checks, issues, "external-evidence-destinations", () =>
    validateEvidenceDestinations(root, environment));
  check(checks, issues, "stage-worktree-isolation", () =>
    validateStageWorktreeIsolation(root, environment));
  check(checks, issues, "strict-build-target-absence", () => {
    const state = readCertificationState(environment.PRODUCTION_CERTIFICATION_STATE);
    const finalArtifact = resolveCertificationStageWorktree({
      state,
      evidenceRoot: environment.CERTIFICATION_EVIDENCE_ROOT,
      canonicalRoot: root,
      role: "final-artifact",
      phase: "pristine",
    });
    return validateBuildTargetsPristine(finalArtifact.root);
  });
  check(checks, issues, "schema-and-mode-compatibility", () => validateContracts(root));
  check(checks, issues, "auth-result-contract", () =>
    validateAuthResultContracts(root));
  check(checks, issues, "stage-result-contract", () =>
    validateCertificationStageResultContracts(root));
  check(checks, issues, "stage-order-import-coherence", () =>
    validateCertificationStageOrderContracts(root));
  check(checks, issues, "dependency-lifecycle-order", () =>
    validateDependencyLifecycleContracts(root));
  check(checks, issues, "source-generated-output-contract", () =>
    validateSourceGeneratedOutputContracts(root));
  check(checks, issues, "stage-environment-capabilities", () =>
    validateStageEnvironmentCapabilities(root, environment));
  check(checks, issues, "archive-file-backed-owner", () =>
    assertFileBackedOwner(root, "scripts/production-archive.mjs"));
  check(checks, issues, "verifier-transitive-closure", () => {
    const closure = deriveProductionVerifierClosure(root);
    if (
      closure.missingImports.length ||
      closure.escapingImports.length ||
      closure.destinationCollisions.length ||
      closure.sourceWorktreeFallback ||
      closure.globalModuleFallback
    ) {
      throw new Error("verifier source closure is incomplete or unsafe");
    }
    return {
      fileCount: closure.files.length,
      edgeCount: closure.edges.length,
      closureSha256: closure.closureSha256,
    };
  });
  check(checks, issues, "runtime-browser-inventory", () => ({
    runtimeSmokeCount: 2,
    browserOwners: REQUIRED_BROWSER_OWNERS.map((owner) => owner.id),
  }));
  check(checks, issues, "ports-and-processes", () => validatePortsAndProcesses(root));
  const sourceIdentity = harnessSourceIdentity(root);
  const payload = {
    schema: PRODUCTION_CERTIFICATION_DOCTOR_SCHEMA,
    harnessVersion: PRODUCTION_CERTIFICATION_HARNESS_VERSION,
    harnessSourceSha256: sourceIdentity.sha256,
    nonConsuming: true,
    substantiveGateConsumed: false,
    canonicalCommand: CERTIFICATION_STAGE_COMMANDS.doctor,
    valid: issues.length === 0,
    checks,
    issues,
  };
  return {
    ...payload,
    seal: { algorithm: "sha256", sha256: sha256Bytes(canonicalJsonBytes(payload)) },
  };
}

async function cli() {
  const repositoryRoot = process.env.CERTIFICATION_SOURCE_ROOT || process.cwd();
  const result = await runCertificationDoctor({ repositoryRoot });
  process.stdout.write(canonicalJsonBytes(result));
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  cli().catch((error) => {
    console.error(databaseLifecycleCliErrorMessage(error));
    process.exitCode = 1;
  });
}
