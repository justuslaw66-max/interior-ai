import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  migrationInventory,
  sealDatabaseLifecycleEvidence,
} from "./production-certification-database-contract.mjs";
import {
  abortCertificationDatabase,
  planCertificationDatabase,
  provisionCertificationDatabase,
  readCertificationDatabaseLifecycle,
  resolveCertificationDatabaseStageEnvironment,
  verifyInitialCertificationDatabase,
} from "./production-certification-database-lifecycle.mjs";
import {
  initializeRealCertification,
  runSourceValidationStage,
} from "./production-certification-real.mjs";
import { runCertificationResourcePreparation } from "./production-certification-resources.mjs";
import { initializeFixture } from "./production-certification-simulation.mjs";
import { validateSourceValidationEvidence } from "./production-certification-source-continuity.mjs";
import {
  certificationStateSha256,
  completeCertificationStage,
  readCertificationState,
  replaceCertificationDatabaseLifecycle,
  startCertificationStage,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
} from "./production-certification-stage-environment.mjs";

const repositoryRoot = process.cwd();
const RAW_SECRET = "projection-regression-private-secret";

function git(root, args) {
  const child = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  return child.stdout.trim();
}

class ProjectionDatabaseAdapter {
  constructor(root) {
    this.migrations = migrationInventory(root).migrations.map(({ id }) => id);
    this.exists = false;
    this.migrated = false;
    this.stageRole = null;
  }

  async inspectAdmin() {
    return {
      hostClassification: "explicit-loopback",
      host: "127.0.0.1",
      port: 5432,
      serverAddressClassification: "loopback",
      transportClassification: "native-loopback",
      transportAttestationSha256: null,
      transportVerificationStatus: "verified-live",
      imageClassification: null,
      imageRepositoryDigestSha256: null,
      serverVersion: "16.14",
      serverVersionNumber: 160014,
      role: "projection",
      roleClassification: "local-createdb",
      canCreateDatabase: true,
      targetExists: this.exists,
    };
  }

  async createDatabase() {
    this.exists = true;
    return { created: true };
  }

  deployMigrations() {
    this.migrated = true;
    return { exitCode: 0, signal: null };
  }

  async migrationNames() {
    return this.migrated ? this.migrations : [];
  }

  async createStageRole({ roleName, password }) {
    assert.match(roleName, /^interior_ai_cert_stage_[a-f0-9]{32}$/);
    assert.match(password, /^[a-f0-9]{64}$/);
    this.stageRole = roleName;
    return {
      created: true,
      classification: "stage-login-no-admin",
      adminCapabilities: false,
    };
  }

  async inspectStageRole() {
    return {
      exists: this.stageRole !== null,
      adminCapabilities: false,
    };
  }

  async inspectStageConnection({ roleName }) {
    return {
      exactTarget: this.exists,
      exactRole: this.stageRole === roleName,
      adminCapabilities: false,
    };
  }

  async applicationRows() {
    return [];
  }

  async targetSessions() {
    return [];
  }

  async terminateTargetSessions() {
    return { terminatedSessionCount: 0, remainingSessionCount: 0 };
  }

  async dropStageRole() {
    const dropped = this.stageRole !== null;
    this.stageRole = null;
    return { dropped, alreadyAbsent: !dropped };
  }

  async dropDatabase() {
    const dropped = this.exists;
    this.exists = false;
    return { dropped };
  }
}

function expectError(action, pattern) {
  let retained = null;
  try {
    action();
  } catch (error) {
    retained = error;
  }
  assert.ok(retained instanceof Error, "expected an error");
  assert.match(retained.message, pattern);
  assert.doesNotMatch(retained.message, new RegExp(RAW_SECRET));
  assert.doesNotMatch(retained.message, /postgres(?:ql)?:\/\//i);
  return retained;
}

function addProjectionProbe(fixtureRoot, probePath) {
  cpSync(
    path.join(repositoryRoot, "prisma/migrations"),
    path.join(fixtureRoot, "prisma/migrations"),
    { recursive: true },
  );
  const packagePath = path.join(fixtureRoot, "package.json");
  const packageValue = JSON.parse(readFileSync(packagePath, "utf8"));
  packageValue.scripts["test:production-artifact-evidence"] =
    "node scripts/source-database-projection-probe.mjs";
  writeFileSync(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`);
  writeFileSync(
    path.join(fixtureRoot, "scripts/source-database-projection-probe.mjs"),
    [
      'import { writeFileSync } from "node:fs";',
      'const target = new URL(process.env.DATABASE_URL ?? "");',
      "const result = {",
      '  databaseName: decodeURIComponent(target.pathname.replace(/^\\//, "")),',
      "  host: target.hostname,",
      "  roleName: decodeURIComponent(target.username),",
      "  hasCredentials: Boolean(target.username),",
      "  adminCredentialPresent: Boolean(process.env.CERTIFICATION_DATABASE_ADMIN_URL),",
      "  lifecycleControlPresent: Boolean(process.env.CERTIFICATION_DATABASE_LIFECYCLE_PATH),",
      "};",
      "writeFileSync(process.env.SOURCE_DATABASE_PROJECTION_PROBE_PATH, JSON.stringify(result));",
      "console.log(process.env.DATABASE_URL);",
      "console.error(`password=${new URL(process.env.DATABASE_URL).password}`);",
      "process.exitCode = 0;",
      "",
    ].join("\n"),
  );
  git(fixtureRoot, ["add", "package.json", "prisma/migrations", "scripts/source-database-projection-probe.mjs"]);
  git(fixtureRoot, ["commit", "-qm", "add database projection probe"]);
  assert.equal(path.isAbsolute(probePath), true);
}

function certificationEnvironment({
  fixtureRoot,
  evidenceRoot,
  worktreeRoot,
  probePath,
}) {
  const commitSha = git(fixtureRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(fixtureRoot, ["rev-parse", "HEAD^{tree}"]);
  const parentSha = git(fixtureRoot, ["rev-parse", "HEAD^"]);
  const environment = {
    ...process.env,
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NODE_ENV: "production",
    CATALOG_STRICT_VALIDATION: "true",
    CERTIFICATION_DATABASE_ADMIN_URL:
      `postgresql://projection:${RAW_SECRET}@127.0.0.1:5432/postgres`,
    CERTIFICATION_DATABASE_LIFECYCLE_PATH: path.join(
      evidenceRoot,
      "database/lifecycle.json",
    ),
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    CERTIFICATION_EXECUTION_CLASS: "real-candidate",
    CERTIFICATION_EXPECTED_COMMIT_SHA: commitSha,
    CERTIFICATION_EXPECTED_PARENT_SHA: parentSha,
    CERTIFICATION_EXPECTED_TREE_SHA: treeSha,
    CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
      evidenceRoot,
      "phase8-target/evidence.json",
    ),
    CERTIFICATION_QUALIFICATION_MODE: "1",
    CERTIFICATION_RUNTIME_EVIDENCE_PATH: path.join(
      evidenceRoot,
      "runtime-smoke/evidence.json",
    ),
    CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH: path.join(
      evidenceRoot,
      "runtime-smoke/phase-timings.json",
    ),
    CERTIFICATION_RUNTIME_REPORT_PATH: path.join(
      evidenceRoot,
      "runtime-smoke/playwright-report.json",
    ),
    CERTIFICATION_WORKTREE_ROOT: worktreeRoot,
    NPM_CONFIG_CACHE: path.join(path.dirname(fixtureRoot), "npm-cache"),
    PRODUCTION_CERTIFICATION_ID: "source-database-projection-regression",
    PRODUCTION_CERTIFICATION_STATE: path.join(
      evidenceRoot,
      "certification-state.json",
    ),
    PRODUCTION_EVIDENCE_CANDIDATE_ID:
      "source-database-projection-regression-candidate",
    SOURCE_DATABASE_PROJECTION_PROBE_PATH: probePath,
  };
  delete environment.DATABASE_URL;
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    environment[
      `CERTIFICATION_BROWSER_${owner.id.toUpperCase().replaceAll("-", "_")}_REPORT_PATH`
    ] = path.join(evidenceRoot, "browser-targets", owner.id, "playwright.json");
  }
  return environment;
}

function retainPassedDoctor(environment) {
  let state = readCertificationState(environment.PRODUCTION_CERTIFICATION_STATE);
  const doctorPath = path.join(environment.CERTIFICATION_EVIDENCE_ROOT, "doctor/fixture.json");
  mkdirSync(path.dirname(doctorPath), { recursive: true, mode: 0o700 });
  const doctorBytes = canonicalJsonBytes({
    schema: "interior-ai.production-certification-doctor-projection-fixture.v1",
    valid: true,
  });
  writeFileSync(doctorPath, doctorBytes, { flag: "wx", mode: 0o600 });
  const startedAt = new Date(Date.parse(state.updatedAt) + 1).toISOString();
  let next = startCertificationStage(state, { stage: "doctor", startedAt });
  writeCertificationState(environment.PRODUCTION_CERTIFICATION_STATE, next, {
    expectedCurrentSha256: certificationStateSha256(state),
  });
  state = next;
  const descriptor = { path: "doctor/fixture.json", sha256: sha256Bytes(doctorBytes) };
  next = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: new Date(Date.parse(startedAt) + 1).toISOString(),
    exitCode: 0,
    outputHashes: { doctor: descriptor.sha256 },
    evidenceFiles: { doctor: descriptor },
  });
  writeCertificationState(environment.PRODUCTION_CERTIFICATION_STATE, next, {
    expectedCurrentSha256: certificationStateSha256(state),
  });
}

function bindLifecycleToState(environment, lifecycle) {
  const state = readCertificationState(environment.PRODUCTION_CERTIFICATION_STATE);
  const next = replaceCertificationDatabaseLifecycle(state, lifecycle.binding);
  writeCertificationState(environment.PRODUCTION_CERTIFICATION_STATE, next, {
    expectedCurrentSha256: certificationStateSha256(state),
  });
  return next;
}

async function verifyFailedMigrationCannotProject(root) {
  const fixtureRoot = path.join(root, "incomplete-migration-source");
  const evidenceRoot = path.join(root, "incomplete-migration-evidence");
  const worktreeRoot = path.join(root, "incomplete-migration-worktrees");
  const probePath = path.join(root, "incomplete-migration-probe.json");
  mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  initializeFixture(repositoryRoot, fixtureRoot);
  const environment = certificationEnvironment({
    fixtureRoot,
    evidenceRoot,
    worktreeRoot,
    probePath,
  });
  environment.PRODUCTION_CERTIFICATION_ID =
    "source-database-projection-incomplete-migrations";
  environment.PRODUCTION_EVIDENCE_CANDIDATE_ID =
    "source-database-projection-incomplete-migrations-candidate";
  mkdirSync(path.dirname(environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH), {
    recursive: true,
    mode: 0o700,
  });
  const adapter = new ProjectionDatabaseAdapter(fixtureRoot);
  adapter.migrationNames = async () => adapter.migrations.slice(0, -1);
  await planCertificationDatabase({
    repositoryRoot: fixtureRoot,
    environment,
    adapter,
    nonce: "b".repeat(32),
    qualificationFixture: true,
  });
  initializeRealCertification({ repositoryRoot: fixtureRoot, environment });
  let provisionFailure = null;
  try {
    await provisionCertificationDatabase({
      repositoryRoot: fixtureRoot,
      environment,
      adapter,
    });
  } catch (error) {
    provisionFailure = error;
  }
  assert.equal(
    provisionFailure?.databaseLifecycleResult?.evidence.currentState,
    "failed",
  );
  const failedState = bindLifecycleToState(
    environment,
    provisionFailure.databaseLifecycleResult,
  );
  expectError(
    () =>
      resolveCertificationDatabaseStageEnvironment({
        repositoryRoot: fixtureRoot,
        environment,
        state: failedState,
        stage: "source-validation",
      }),
    /not ready/,
  );
  assert.equal(existsSync(probePath), false);
}

async function verifyHistoricalParentHandoffFails(root) {
  const fixtureRoot = path.join(root, "historical-parent-source");
  const evidenceRoot = path.join(root, "historical-parent-evidence");
  const worktreeRoot = path.join(root, "historical-parent-worktrees");
  const probePath = path.join(root, "historical-parent-probe.json");
  mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  initializeFixture(repositoryRoot, fixtureRoot);
  addProjectionProbe(fixtureRoot, probePath);
  const environment = certificationEnvironment({
    fixtureRoot,
    evidenceRoot,
    worktreeRoot,
    probePath,
  });
  environment.PRODUCTION_CERTIFICATION_ID =
    "source-database-projection-historical-parent";
  environment.PRODUCTION_EVIDENCE_CANDIDATE_ID =
    "source-database-projection-historical-parent-candidate";
  mkdirSync(path.dirname(environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH), {
    recursive: true,
    mode: 0o700,
  });
  const adapter = new ProjectionDatabaseAdapter(fixtureRoot);
  await planCertificationDatabase({
    repositoryRoot: fixtureRoot,
    environment,
    adapter,
    nonce: "c".repeat(32),
    qualificationFixture: true,
  });
  initializeRealCertification({ repositoryRoot: fixtureRoot, environment });
  const plannedState = readCertificationState(
    environment.PRODUCTION_CERTIFICATION_STATE,
  );
  runCertificationResourcePreparation({
    repositoryRoot: fixtureRoot,
    environment: {
      ...environment,
      CERTIFICATION_EXPECTED_STATE_SHA256:
        certificationStateSha256(plannedState),
    },
  });
  retainPassedDoctor(environment);
  await provisionCertificationDatabase({
    repositoryRoot: fixtureRoot,
    environment,
    adapter,
  });
  const active = await verifyInitialCertificationDatabase({
    repositoryRoot: fixtureRoot,
    environment,
    adapter,
  });
  bindLifecycleToState(environment, active);
  const runnerPath = path.join(
    fixtureRoot,
    "scripts/production-certification-real.mjs",
  );
  const correctedRunner = readFileSync(runnerPath, "utf8");
  const historicalRunner = correctedRunner.replace(
    "environment: sourceEnvironment,",
    "environment: context.environment,",
  );
  assert.notEqual(historicalRunner, correctedRunner);
  const instrumented = historicalRunner.replace(
    /from "(\.\/[^\"]+)";/g,
    (_match, specifier) =>
      `from "${pathToFileURL(path.resolve(path.dirname(runnerPath), specifier)).href}";`,
  );
  const instrumentedPath = path.join(root, "historical-parent-runner.mjs");
  writeFileSync(instrumentedPath, instrumented);
  const historical = await import(
    `${pathToFileURL(instrumentedPath).href}?case=historical-parent`
  );
  let failure = null;
  try {
    await historical.runSourceValidationStage({
      repositoryRoot: fixtureRoot,
      environment,
      testHooks: { databaseAdapter: adapter },
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(
    failure?.classification,
    "SOURCE_CONTRACT_FAILURE",
    failure?.stack ?? failure?.message,
  );
  assert.equal(failure?.consumed, false);
  assert.match(failure?.message ?? "", /missing required environment names: DATABASE_URL/);
  assert.equal(existsSync(probePath), false);
}

async function runRegression() {
  const root = mkdtempSync(path.join(tmpdir(), "source-database-projection-"));
  const fixtureRoot = path.join(root, "source");
  const evidenceRoot = path.join(root, "evidence");
  const worktreeRoot = path.join(root, "worktrees");
  const probePath = path.join(root, "projection-probe.json");
  mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  try {
    await verifyFailedMigrationCannotProject(root);
    await verifyHistoricalParentHandoffFails(root);
    initializeFixture(repositoryRoot, fixtureRoot);
    addProjectionProbe(fixtureRoot, probePath);
    const environment = certificationEnvironment({
      fixtureRoot,
      evidenceRoot,
      worktreeRoot,
      probePath,
    });
    const sourceProfile = certificationEnvironmentProfile(
      fixtureRoot,
      "source-validation",
    );
    assert.equal(sourceProfile.requiredVariables.includes("DATABASE_URL"), true);
    mkdirSync(
      path.dirname(environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH),
      { recursive: true, mode: 0o700 },
    );
    const adapter = new ProjectionDatabaseAdapter(fixtureRoot);
    await planCertificationDatabase({
      repositoryRoot: fixtureRoot,
      environment,
      adapter,
      nonce: "a".repeat(32),
      qualificationFixture: true,
    });
    initializeRealCertification({ repositoryRoot: fixtureRoot, environment });
    let state = readCertificationState(environment.PRODUCTION_CERTIFICATION_STATE);
    assert.throws(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment,
          state,
          stage: "source-validation",
        }),
      /not ready/,
    );
    runCertificationResourcePreparation({
      repositoryRoot: fixtureRoot,
      environment: {
        ...environment,
        CERTIFICATION_EXPECTED_STATE_SHA256: certificationStateSha256(state),
      },
    });
    retainPassedDoctor(environment);
    const migrated = await provisionCertificationDatabase({
      repositoryRoot: fixtureRoot,
      environment,
      adapter,
    });
    const migratedState = bindLifecycleToState(environment, migrated);
    assert.throws(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment,
          state: migratedState,
          stage: "source-validation",
        }),
      /not ready/,
    );
    const active = await verifyInitialCertificationDatabase({
      repositoryRoot: fixtureRoot,
      environment,
      adapter,
    });
    const activeState = bindLifecycleToState(environment, active);
    const privateSidecarPath = path.join(
      worktreeRoot,
      ".database-bindings",
      environment.PRODUCTION_CERTIFICATION_ID,
      `${activeState.databaseLifecycle.databaseIdentitySha256}.json`,
    );
    const privateDatabaseUrl = JSON.parse(
      readFileSync(privateSidecarPath, "utf8"),
    ).targetUrl;
    const privateStagePassword = new URL(privateDatabaseUrl).password;
    assert.match(privateStagePassword, /^[a-f0-9]{64}$/);
    assert.throws(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment,
          state: activeState,
          stage: "source-validation",
        }),
      /stage binding is missing or foreign/,
    );
    assert.equal(Object.hasOwn(environment, "DATABASE_URL"), false);
    let failure = null;
    try {
      await runSourceValidationStage({
        repositoryRoot: fixtureRoot,
        environment,
        testHooks: { databaseAdapter: adapter },
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.classification, "SOURCE_CONTRACT_FAILURE");
    assert.equal(failure?.consumed, true, failure?.message);
    assert.doesNotMatch(failure.message, /missing required environment names|ReferenceError/);
    const failedState = readCertificationState(
      environment.PRODUCTION_CERTIFICATION_STATE,
    );
    const descriptor = failedState.evidenceFiles["source-validation"];
    const evidence = JSON.parse(
      readFileSync(path.join(evidenceRoot, descriptor.path), "utf8"),
    );
    assert.equal(evidence.checks.length, 1);
    assert.equal(evidence.checks[0].order, 1);
    assert.equal(evidence.checks[0].invoked, true);
    assert.deepEqual(evidence.checks[0].outputSecurity, {
      rawDatabaseConnectionDetected: true,
      retainedRawDatabaseConnection: false,
    });
    assert.equal(evidence.checks[0].process.exitCode, 0);
    assert.equal(evidence.checks[0].passed, false);
    assert.equal(failedState.stages["source-validation"].exitCode, 1);
    assert.equal(evidence.checks[0].environment.environmentNames.includes("DATABASE_URL"), true);
    assert.equal(
      evidence.checks[0].environment.environmentNames.includes(
        "CERTIFICATION_DATABASE_ADMIN_URL",
      ),
      false,
    );
    assert.equal(
      evidence.checks[0].environment.environmentNames.includes(
        "CERTIFICATION_DATABASE_LIFECYCLE_PATH",
      ),
      false,
    );
    assert.deepEqual(
      evidence.checks[0].environment.environmentNames.filter((name) =>
        /CERTIFICATION_DATABASE|DATABASE_(?:ADMIN|DROP|SESSION|LIFECYCLE)/.test(
          name,
        ),
      ),
      [],
    );
    const probeBytes = readFileSync(probePath);
    const probe = JSON.parse(probeBytes.toString("utf8"));
    assert.equal(probe.databaseName, failedState.databaseLifecycle.databaseName);
    assert.equal(probe.host, "127.0.0.1");
    assert.equal(probe.hasCredentials, true);
    assert.match(probe.roleName, /^interior_ai_cert_stage_[a-f0-9]{32}$/);
    assert.notEqual(probe.roleName, "projection");
    assert.equal(probe.adminCredentialPresent, false);
    assert.equal(probe.lifecycleControlPresent, false);
    for (const stream of ["stdout", "stderr"]) {
      const retainedLog = readFileSync(
        path.join(evidenceRoot, evidence.checks[0][stream].path),
        "utf8",
      );
      assert.match(
        retainedLog,
        stream === "stdout"
          ? /\[REDACTED_DATABASE_URL\]/
          : /\[REDACTED_DATABASE_PASSWORD\]/,
      );
      assert.doesNotMatch(retainedLog, new RegExp(RAW_SECRET));
      assert.doesNotMatch(retainedLog, new RegExp(privateStagePassword));
      assert.doesNotMatch(retainedLog, /postgres(?:ql)?:\/\//i);
    }
    assert.equal(
      failedState.databaseLifecycle.databaseIdentitySha256,
      activeState.databaseLifecycle.databaseIdentitySha256,
    );
    const retainedBytes = JSON.stringify({ evidence, failedState, failure: failure.message });
    assert.doesNotMatch(retainedBytes, new RegExp(RAW_SECRET));
    assert.doesNotMatch(retainedBytes, new RegExp(privateStagePassword));
    assert.doesNotMatch(retainedBytes, /postgres(?:ql)?:\/\//i);
    const stdoutAbsolutePath = path.join(
      evidenceRoot,
      evidence.checks[0].stdout.path,
    );
    const retainedStdoutBytes = readFileSync(stdoutAbsolutePath);
    const tamperedEvidence = structuredClone(evidence);
    const tamperedStdoutBytes = Buffer.from(`password=${privateStagePassword}\n`);
    writeFileSync(stdoutAbsolutePath, tamperedStdoutBytes);
    tamperedEvidence.checks[0].stdout.sha256 = sha256Bytes(
      tamperedStdoutBytes,
    );
    tamperedEvidence.checks[0].stdout.bytes = tamperedStdoutBytes.byteLength;
    const tamperedLogValidation = validateSourceValidationEvidence({
      evidence: tamperedEvidence,
      evidenceRoot,
      state: failedState,
      repositoryRoot: fixtureRoot,
      databaseUrl: privateDatabaseUrl,
    });
    assert.equal(tamperedLogValidation.valid, false);
    assert.ok(
      tamperedLogValidation.issues.some((issue) =>
        /stdout contains raw database material/.test(issue),
      ),
    );
    writeFileSync(stdoutAbsolutePath, retainedStdoutBytes);
    expectError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment: {
            ...environment,
            DATABASE_URL: `postgresql://foreign:${RAW_SECRET}@127.0.0.1:5432/foreign`,
          },
          state: failedState,
          stage: "source-validation",
        }),
      /cannot override/,
    );
    const environmentWithoutAdmin = { ...environment };
    delete environmentWithoutAdmin.CERTIFICATION_DATABASE_ADMIN_URL;
    const adminFreeProjection = resolveCertificationDatabaseStageEnvironment({
      repositoryRoot: fixtureRoot,
      environment: environmentWithoutAdmin,
      state: failedState,
      stage: "source-validation",
    });
    assert.match(
      new URL(adminFreeProjection.environment.DATABASE_URL).username,
      /^interior_ai_cert_stage_[a-f0-9]{32}$/,
    );
    const privateSidecarBytes = readFileSync(privateSidecarPath);
    rmSync(privateSidecarPath);
    expectError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment: environmentWithoutAdmin,
          state: failedState,
          stage: "source-validation",
        }),
      /sidecar is invalid|sidecar is missing/,
    );
    writeFileSync(privateSidecarPath, privateSidecarBytes, { mode: 0o600 });
    const hashMismatchSidecar = JSON.parse(privateSidecarBytes.toString("utf8"));
    hashMismatchSidecar.targetUrl = hashMismatchSidecar.targetUrl.replace(
      /:[^:@/]+@/,
      ":different-private-password@",
    );
    writeFileSync(
      privateSidecarPath,
      canonicalJsonBytes(hashMismatchSidecar),
    );
    expectError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment: environmentWithoutAdmin,
          state: failedState,
          stage: "source-validation",
        }),
      /sidecar is stale or foreign/,
    );
    writeFileSync(privateSidecarPath, privateSidecarBytes);
    const lifecycleBytes = readFileSync(
      environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH,
    );
    for (const [mutateTarget, pattern] of [
      [
        (target) => {
          target.hostname = "192.0.2.1";
        },
        /private target differs/,
      ],
      [
        (target) => {
          target.pathname = "/foreign";
        },
        /private target differs/,
      ],
      [
        (target) => {
          target.username = "foreign-stage-role";
        },
        /private target differs/,
      ],
    ]) {
      const sidecar = JSON.parse(privateSidecarBytes.toString("utf8"));
      const target = new URL(sidecar.targetUrl);
      mutateTarget(target);
      sidecar.targetUrl = target.toString();
      const sidecarBytes = canonicalJsonBytes(sidecar);
      writeFileSync(privateSidecarPath, sidecarBytes);
      const lifecycle = JSON.parse(lifecycleBytes.toString("utf8"));
      lifecycle.privateBinding.sidecarSha256 = sha256Bytes(sidecarBytes);
      const sealedLifecycle = sealDatabaseLifecycleEvidence(lifecycle);
      writeFileSync(
        environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH,
        canonicalJsonBytes(sealedLifecycle),
      );
      const rebound = readCertificationDatabaseLifecycle({
        repositoryRoot: fixtureRoot,
        environment,
      });
      const reboundState = replaceCertificationDatabaseLifecycle(
        failedState,
        rebound.binding,
      );
      expectError(
        () =>
          resolveCertificationDatabaseStageEnvironment({
            repositoryRoot: fixtureRoot,
            environment: environmentWithoutAdmin,
            state: reboundState,
            stage: "source-validation",
          }),
        pattern,
      );
      writeFileSync(
        environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH,
        lifecycleBytes,
      );
      writeFileSync(privateSidecarPath, privateSidecarBytes);
    }
    for (const mutate of [
      (value) => {
        value.certificationId = "foreign-certification";
      },
      (value) => {
        value.candidate.id = "foreign-candidate";
      },
      (value) => {
        value.candidate.commitSha = "1".repeat(40);
      },
      (value) => {
        value.candidate.treeSha = "2".repeat(40);
      },
      (value) => {
        value.databaseLifecycle.databaseIdentitySha256 = "3".repeat(64);
      },
    ]) {
      const foreign = structuredClone(failedState);
      mutate(foreign);
      assert.throws(
        () =>
          resolveCertificationDatabaseStageEnvironment({
            repositoryRoot: fixtureRoot,
            environment,
            state: foreign,
            stage: "source-validation",
          }),
        /stale or foreign/,
      );
    }
    assert.throws(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment,
          state: activeState,
          stage: "source-validation",
        }),
      /stale or foreign/,
    );
    const databaseFree = projectCertificationChildEnvironment({
      repositoryRoot: fixtureRoot,
      baseEnvironment: {
        DATABASE_URL: "postgresql://foreign:foreign@127.0.0.1:5432/foreign",
      },
      stage: "doctor",
      profileId: "doctor",
    });
    assert.equal(databaseFree.environment.DATABASE_URL, undefined);
    assert.equal(
      databaseFree.metadata.strippedKnownCertificationControlVariables.includes(
        "DATABASE_URL",
      ),
      true,
    );
    const current = readCertificationDatabaseLifecycle({
      repositoryRoot: fixtureRoot,
      environment,
    });
    assert.equal(
      current.binding.databaseIdentitySha256,
      failedState.databaseLifecycle.databaseIdentitySha256,
    );
    const dropped = await abortCertificationDatabase({
      repositoryRoot: fixtureRoot,
      environment,
      adapter,
      originalFailure: {
        classification: "SOURCE_CONTRACT_FAILURE",
        stage: "source-validation",
        consumedSubstantiveGate: true,
      },
    });
    assert.equal(dropped.evidence.currentState, "abort-absence-verified");
    const droppedState = bindLifecycleToState(environment, dropped);
    assert.equal(adapter.stageRole, null);
    assert.equal(existsSync(privateSidecarPath), false);
    expectError(
      () =>
        resolveCertificationDatabaseStageEnvironment({
          repositoryRoot: fixtureRoot,
          environment,
          state: droppedState,
          stage: "source-validation",
        }),
      /not ready/,
    );
    assert.deepEqual(readFileSync(probePath), probeBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

await runRegression();
console.log(
  "Production certification real-runner source database projection regression passed.",
);
