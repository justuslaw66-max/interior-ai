import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";

import { Client } from "pg";

import {
  PRODUCTION_CERTIFICATION_DATABASE_NAME_PREFIX,
  assertUnprotectedDatabaseName,
  canonicalJsonBytes,
  databaseAdminPolicy,
  databaseLifecycleEvidenceIssues,
  generateCertificationDatabaseName,
  migrationInventory,
  sealDatabaseLifecycleEvidence,
  targetDatabaseUrl,
} from "./production-certification-database-contract.mjs";
import { CertificationPostgresAdapter } from "./production-certification-database-adapter.mjs";
import {
  abortCertificationDatabase,
  bindCertificationDatabaseStage,
  certificationDatabaseStatus,
  databaseLifecycleCliErrorMessage,
  dropCertificationDatabase,
  planCertificationDatabase,
  provisionCertificationDatabase,
  readCertificationDatabaseLifecycle,
  resolveCertificationDatabaseStageEnvironment,
  retainCertificationDatabaseFailureSnapshot,
  verifyCertificationDatabaseAbsent,
  verifyFinalCertificationDatabase,
  verifyInitialCertificationDatabase,
} from "./production-certification-database-lifecycle.mjs";
import {
  projectArtifactProductServerEnvironment,
} from "./production-artifact-evidence.mjs";
import {
  projectCertificationChildEnvironment,
} from "./production-certification-stage-environment.mjs";
import authFixtureSession from "./ci-auth-fixture-session.cjs";
import {
  certificationAppEventRowsSha256,
  inspectCertificationAppEvents,
} from "./production-certification-app-event-lifecycle.mjs";
import {
  certificationStateSha256,
  completeCertificationStage,
  createCertificationState,
  readCertificationState,
  replaceCertificationDatabaseLifecycle,
  startCertificationStage,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  reconcileCertificationDatabaseLifecycleState,
  runDatabaseAbortCleanup,
} from "./production-certification-real.mjs";
import {
  createCertificationAbortCleanupRequest,
  createSerializedTerminalLifecycle,
  nextCertificationCommand,
} from "./production-certification.mjs";
import {
  createCertificationStageCommandResult,
  sealCertificationStageResult,
  validateCertificationStageResult,
} from "./production-certification-stage-result-contract.mjs";
import {
  runCertificationDoctor,
  validateCertificationDatabaseDoctorShape,
} from "./production-certification-doctor.mjs";

const repositoryRoot = process.cwd();
const commitSha = git("HEAD");
const treeSha = git("HEAD^{tree}");
const defaultAppEventWriterFixtureSource =
  "scripts/test-production-certification-app-event-writer.ts";
const appEventWriterFixtureSourceArgument = process.argv.find((argument) =>
  argument.startsWith("--app-event-writer-source="),
);
const appEventWriterFixtureSource = appEventWriterFixtureSourceArgument
  ? appEventWriterFixtureSourceArgument.slice(
      "--app-event-writer-source=".length,
    )
  : defaultAppEventWriterFixtureSource;
assert.equal(
  appEventWriterFixtureSource,
  defaultAppEventWriterFixtureSource,
  "AppEvent writer fixture must remain the exact committed harness source",
);
const migrationNames = migrationInventory(repositoryRoot).migrations.map(
  (migration) => migration.id,
);

function git(revision) {
  const child = spawnSync("git", ["rev-parse", revision], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(child.status, 0);
  return child.stdout.trim();
}

class FakeDatabaseAdapter {
  constructor({
    exists = false,
    createFailure = null,
    createFailureOutcome = "ambiguous",
    failFirstPostDropInspection = false,
    inspectionFailure = null,
    releaseFailure = null,
    foreignStageRole = false,
    stageRoleCollisionOnCreate = false,
    onCreateStageRole = null,
    appEventCleanupFailure = null,
    onDeleteAppEvents = null,
  } = {}) {
    this.exists = exists;
    this.migrated = false;
    this.rows = [{ table: "User", count: 0 }];
    this.appEvents = [];
    this.sessions = [];
    this.unrelatedSessions = [{ database: "postgres", pid: 9001 }];
    this.terminated = [];
    this.dropped = false;
    this.createFailure = createFailure;
    this.createFailureOutcome = createFailureOutcome;
    this.releaseFailure = releaseFailure;
    this.failFirstPostDropInspection = failFirstPostDropInspection;
    this.inspectionFailure = inspectionFailure;
    this.stageRole = null;
    this.foreignStageRole = foreignStageRole;
    this.stageRoleCollisionOnCreate = stageRoleCollisionOnCreate;
    this.onCreateStageRole = onCreateStageRole;
    this.appEventCleanupFailure = appEventCleanupFailure;
    this.onDeleteAppEvents = onDeleteAppEvents;
    this.stageRoleDropCount = 0;
  }

  async inspectAdmin() {
    if (this.inspectionFailure) {
      const failure = this.inspectionFailure;
      this.inspectionFailure = null;
      throw new Error(failure);
    }
    if (this.dropped && this.failFirstPostDropInspection) {
      this.failFirstPostDropInspection = false;
      throw new Error("post-drop absence inspection failed once");
    }
    return {
      hostClassification: "explicit-loopback",
      host: "127.0.0.1",
      port: 5432,
      serverAddressClassification: "loopback",
      serverVersion: "16.14",
      serverVersionNumber: 160014,
      role: "qualification_owner",
      roleClassification: "local-createdb",
      canCreateDatabase: true,
      targetExists: this.exists,
    };
  }

  async createDatabase() {
    if (this.exists) throw new Error("generated certification database already exists");
    this.exists = true;
    if (this.createFailure) {
      const error = new Error(this.createFailure);
      error.databaseCreateOutcome = this.createFailureOutcome;
      throw error;
    }
    return { created: true };
  }

  deployMigrations() {
    this.migrated = true;
    return { exitCode: 0, signal: null };
  }

  async migrationNames() {
    return this.migrated ? migrationNames : [];
  }

  async createStageRole({ roleName, password }) {
    assert.match(roleName, /^interior_ai_cert_stage_[a-f0-9]{32}$/);
    assert.match(password, /^[a-f0-9]{64}$/);
    if (this.stageRoleCollisionOnCreate) {
      this.stageRole = roleName;
      throw Object.assign(
        new Error("certification database stage role already exists"),
        { stageRoleCreateOutcome: "not-created" },
      );
    }
    this.stageRole = roleName;
    this.onCreateStageRole?.();
    return {
      created: true,
      classification: "stage-login-no-admin",
      adminCapabilities: false,
    };
  }

  async inspectStageRole(roleName) {
    if (this.foreignStageRole && this.stageRole === null) {
      this.stageRole = roleName;
    }
    return {
      exists: this.stageRole !== null,
      adminCapabilities: this.foreignStageRole,
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
    return structuredClone(this.rows);
  }

  async appEventRows() {
    return structuredClone(this.appEvents);
  }

  async deleteCertificationAppEvents({
    ownership,
    expectedIds,
    expectedRowsSha256,
  }) {
    await this.onDeleteAppEvents?.();
    if (this.appEventCleanupFailure) {
      throw new Error(this.appEventCleanupFailure);
    }
    assert.deepEqual(
      this.appEvents.map((row) => row.id).sort(),
      expectedIds,
    );
    assert.equal(
      certificationAppEventRowsSha256(this.appEvents, ownership),
      expectedRowsSha256,
    );
    const removedCount = this.appEvents.length;
    this.appEvents = [];
    const appEventTable = this.rows.find((row) => row.table === "AppEvent");
    if (appEventTable) appEventTable.count = 0;
    return { removedCount, remainingCount: 0, exactOwnedRowsOnly: true };
  }

  async targetSessions() {
    return structuredClone(this.sessions);
  }

  async terminateTargetSessions() {
    const pids = this.sessions.map((session) => session.pid);
    this.terminated.push(...pids);
    this.sessions = [];
    const result = {
      matchedSessionCount: pids.length,
      terminatedPids: pids,
      remainingSessionCount: 0,
    };
    if (this.releaseFailure) throw new Error(this.releaseFailure);
    return result;
  }

  async dropDatabase() {
    if (this.sessions.length) throw new Error("target sessions remain");
    const wasPresent = this.exists;
    this.exists = false;
    this.dropped = wasPresent;
    return { dropped: wasPresent, alreadyAbsent: !wasPresent };
  }

  async dropStageRole() {
    this.stageRoleDropCount += 1;
    const dropped = this.stageRole !== null;
    this.stageRole = null;
    return { dropped, alreadyAbsent: !dropped };
  }
}

function fixture({ id, adminUrl = "postgresql://owner:raw-secret@127.0.0.1:5432/postgres" }) {
  const root = mkdtempSync(path.join(tmpdir(), `certification-database-${id}-`));
  const lifecyclePath = path.join(root, "database-lifecycle.json");
  const environment = {
    CERTIFICATION_EVIDENCE_ROOT: root,
    CERTIFICATION_DATABASE_LIFECYCLE_PATH: lifecyclePath,
    CERTIFICATION_DATABASE_ADMIN_URL: adminUrl,
    CERTIFICATION_WORKTREE_ROOT: root,
    CERTIFICATION_QUALIFICATION_MODE: "1",
    PRODUCTION_CERTIFICATION_ID: `certification-${id}`,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: `candidate-${id}`,
    CERTIFICATION_EXPECTED_COMMIT_SHA: commitSha,
    CERTIFICATION_EXPECTED_TREE_SHA: treeSha,
  };
  return { root, lifecyclePath, environment };
}

async function bindAllStages(environment, adapter) {
  for (const stage of [
    "source-validation",
    "build",
    "phase8",
    "runtime-smoke",
    "browser-owners",
  ]) {
    await bindCertificationDatabaseStage({
      repositoryRoot,
      environment,
      adapter,
      stage,
    });
  }
}

const browserOwnerIds = [
  "floor-plan-upload",
  "pro-visual",
  "guest-save",
  "my-designs",
  "public-share",
  "cart",
  "retailer",
];

function appEventOwnership(environment, { runtimeAttempt = 1, browserAttempt = 1 } = {}) {
  return {
    certificationId: environment.PRODUCTION_CERTIFICATION_ID,
    candidateId: environment.PRODUCTION_EVIDENCE_CANDIDATE_ID,
    commitSha,
    treeSha,
    runtimeAttempt,
    browserAttempt,
    browserOwnerIds,
  };
}

function appEventBinding(
  ownership,
  {
    stage = "runtime-smoke",
    stageAttempt = ownership.runtimeAttempt,
    browserOwnerId = null,
    writerClassification = "browser-public-ingestion",
  } = {},
) {
  const binding = {
    schema: "interior-ai.production-certification-app-event-binding.v1",
    certificationId: ownership.certificationId,
    candidateId: ownership.candidateId,
    commitSha: ownership.commitSha,
    treeSha: ownership.treeSha,
    stage,
    stageAttempt,
    browserOwnerId,
    writerClassification,
  };
  return {
    ...binding,
    runIdentitySha256: createHash("sha256")
      .update(`${JSON.stringify([
        binding.schema,
        binding.certificationId,
        binding.candidateId,
        binding.commitSha,
        binding.treeSha,
        binding.stage,
        binding.stageAttempt,
        binding.browserOwnerId,
        binding.writerClassification,
      ])}\n`)
      .digest("hex"),
  };
}

function appEventRow(
  ownership,
  {
    id = "app-event-1",
    eventType = "design_started",
    stage = "runtime-smoke",
    stageAttempt = ownership.runtimeAttempt,
    browserOwnerId = null,
    writerClassification = "browser-public-ingestion",
    createdAt = "2026-08-26T10:48:17.377Z",
    bindingOverrides = {},
    rowOverrides = {},
  } = {},
) {
  const writerContracts = {
    "browser-public-ingestion": [
      "BROWSER_AUTHORIZED_ANALYTICS",
      "PUBLIC_BROWSER_INGESTION",
      "PUBLIC_REQUEST",
      null,
    ],
    "browser-server-action": [
      "BROWSER_AUTHORIZED_ANALYTICS",
      "SERVER_APPLICATION",
      "SERVER_ACTION",
      null,
    ],
    "internal-server-diagnostic": [
      "INTERNAL_DIAGNOSTIC",
      "SERVER_APPLICATION",
      "SERVER_ACTION",
      null,
    ],
    "trusted-stripe-lifecycle": [
      "TRUSTED_SERVER_LIFECYCLE",
      "VERIFIED_STRIPE_WEBHOOK",
      "STRIPE_SIGNATURE",
      "evt_certification_fixture",
    ],
  };
  const [authority, producer, verificationMethod, externalEventId] =
    writerContracts[writerClassification];
  return {
    id,
    eventType,
    authority,
    producer,
    verificationMethod,
    provenanceVersion: 1,
    externalEventId,
    createdAt,
    shareTokenNull: true,
    metaObject: true,
    prohibitedPrivateData: false,
    binding: {
      ...appEventBinding(ownership, {
        stage,
        stageAttempt,
        browserOwnerId,
        writerClassification,
      }),
      ...bindingOverrides,
    },
    ...rowOverrides,
  };
}

async function deterministicContractCoverage() {
  runAppEventWriterFixture("source-contract", {
    ...appEventWriterBaseEnvironment(),
    CERTIFICATION_ENVIRONMENT_STAGE: "production",
    DATABASE_URL: "postgresql://fixture@127.0.0.1:5432/fixture",
    NODE_ENV: "test",
  });
  const directCliSecret = "direct-cli-secret-must-not-survive";
  const directCliMessage = databaseLifecycleCliErrorMessage(
    new Error(
      `postgresql://owner:${directCliSecret}@127.0.0.1:5432/postgres password=${directCliSecret}`,
    ),
  );
  assert.doesNotMatch(directCliMessage, new RegExp(directCliSecret));
  assert.doesNotMatch(directCliMessage, /postgresql:\/\//);
  const longA = generateCertificationDatabaseName({
    certificationId: `cert-${"a".repeat(120)}`,
    candidateId: `candidate-${"b".repeat(100)}`,
    candidateCommitSha: "1".repeat(40),
    nonce: "2".repeat(32),
  });
  const longB = generateCertificationDatabaseName({
    certificationId: `cert-${"a".repeat(120)}`,
    candidateId: `candidate-${"b".repeat(100)}`,
    candidateCommitSha: "1".repeat(40),
    nonce: "3".repeat(32),
  });
  assert.ok(longA.name.startsWith(PRODUCTION_CERTIFICATION_DATABASE_NAME_PREFIX));
  assert.ok(longA.name.length <= 63);
  assert.notEqual(longA.name, longB.name);
  assert.throws(() => assertUnprotectedDatabaseName("postgres"), /protected/);
  assert.throws(
    () => databaseAdminPolicy("postgresql://owner@192.0.2.1:5432/postgres"),
    /loopback/,
  );
  assert.throws(
    () => databaseAdminPolicy("postgresql://owner@127.0.0.1:6432/postgres"),
    /port/,
  );

  const attributionFixture = fixture({ id: "app-event-attribution" });
  try {
    const ownership = appEventOwnership(attributionFixture.environment);
    const ownedRows = [
      appEventRow(ownership),
      appEventRow(ownership, {
        id: "app-event-2",
        eventType: "share_link_created",
        stage: "browser-owners",
        stageAttempt: ownership.browserAttempt,
        browserOwnerId: "public-share",
        writerClassification: "browser-server-action",
        createdAt: "2026-08-26T11:08:15.611Z",
      }),
      appEventRow(ownership, {
        id: "app-event-3",
        eventType: "stripe_webhook_processed",
        writerClassification: "trusted-stripe-lifecycle",
      }),
    ];
    const inspected = inspectCertificationAppEvents(ownedRows, ownership);
    assert.equal(inspected.valid, true);
    assert.equal(inspected.evidence.rowCount, 3);
    assert.equal(inspected.evidence.aggregates.length, 3);
    assert.deepEqual(inspected.removableIds, [
      "app-event-1",
      "app-event-2",
      "app-event-3",
    ]);
    for (const invalidRow of [
      appEventRow(ownership, { id: "unbound", rowOverrides: { binding: null } }),
      appEventRow(
        { ...ownership, certificationId: "certification-foreign" },
        { id: "foreign" },
      ),
      appEventRow(
        { ...ownership, candidateId: "candidate-foreign" },
        { id: "foreign-candidate" },
      ),
      appEventRow(ownership, {
        id: "wrong-attempt",
        stageAttempt: ownership.runtimeAttempt + 1,
      }),
      appEventRow(ownership, {
        id: "wrong-owner",
        stage: "browser-owners",
        browserOwnerId: "not-an-owner",
      }),
      appEventRow(ownership, { id: "unknown-type", eventType: "unknown" }),
      appEventRow(ownership, {
        id: "private-data",
        rowOverrides: { prohibitedPrivateData: true },
      }),
      appEventRow(ownership, {
        id: "wrong-payload",
        rowOverrides: { provenanceVersion: null },
      }),
    ]) {
      const rejected = inspectCertificationAppEvents([invalidRow], ownership);
      assert.equal(rejected.valid, false);
      assert.deepEqual(rejected.removableIds, []);
    }
    const unsafeLabels = inspectCertificationAppEvents(
      [
        appEventRow(ownership, {
          eventType: "private-event-label-must-not-survive",
          bindingOverrides: {
            stage: "private-stage-label-must-not-survive",
            browserOwnerId: "private-owner-label-must-not-survive",
          },
        }),
      ],
      ownership,
    );
    assert.equal(unsafeLabels.valid, false);
    assert.doesNotMatch(
      JSON.stringify(unsafeLabels.evidence),
      /private-(event|stage|owner)-label-must-not-survive/,
    );
  } finally {
    rmSync(attributionFixture.root, { recursive: true, force: true });
  }

  const existingFixture = fixture({ id: "existing" });
  try {
    await assert.rejects(
      planCertificationDatabase({
        repositoryRoot,
        environment: existingFixture.environment,
        adapter: new FakeDatabaseAdapter({ exists: true }),
        nonce: "4".repeat(32),
        qualificationFixture: true,
      }),
      /must be absent/,
    );
  } finally {
    rmSync(existingFixture.root, { recursive: true, force: true });
  }

  const raceFixture = fixture({ id: "foreign-race" });
  const raceAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: raceFixture.environment,
      adapter: raceAdapter,
      nonce: "9".repeat(32),
      qualificationFixture: true,
    });
    raceAdapter.exists = true;
    await assert.rejects(
      provisionCertificationDatabase({
        repositoryRoot,
        environment: raceFixture.environment,
        adapter: raceAdapter,
      }),
      /appeared after preflight/,
    );
    await assert.rejects(
      abortCertificationDatabase({
        repositoryRoot,
        environment: raceFixture.environment,
        adapter: raceAdapter,
      }),
      /not durably created/,
    );
    assert.equal(raceAdapter.exists, true);
    assert.equal(raceAdapter.dropped, false);
  } finally {
    rmSync(raceFixture.root, { recursive: true, force: true });
  }

  const collisionFixture = fixture({ id: "create-collision" });
  const collisionAdapter = new FakeDatabaseAdapter({
    createFailure: "duplicate database created by another owner",
    createFailureOutcome: "not-created",
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: collisionFixture.environment,
      adapter: collisionAdapter,
      nonce: "d".repeat(32),
      qualificationFixture: true,
    });
    await assert.rejects(
      provisionCertificationDatabase({
        repositoryRoot,
        environment: collisionFixture.environment,
        adapter: collisionAdapter,
      }),
      /duplicate database/,
    );
    await assert.rejects(
      abortCertificationDatabase({
        repositoryRoot,
        environment: collisionFixture.environment,
        adapter: collisionAdapter,
      }),
      /not durably created/,
    );
    assert.equal(collisionAdapter.exists, true);
    assert.equal(collisionAdapter.dropped, false);
  } finally {
    rmSync(collisionFixture.root, { recursive: true, force: true });
  }

  const roleCollisionFixture = fixture({ id: "stage-role-collision" });
  const roleCollisionAdapter = new FakeDatabaseAdapter({
    foreignStageRole: true,
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: roleCollisionFixture.environment,
      adapter: roleCollisionAdapter,
      nonce: "e".repeat(32),
      qualificationFixture: true,
    });
    await assert.rejects(
      provisionCertificationDatabase({
        repositoryRoot,
        environment: roleCollisionFixture.environment,
        adapter: roleCollisionAdapter,
      }),
      /stage role must be absent before create authorization/,
    );
    const failedRoleCollision = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: roleCollisionFixture.environment,
    });
    assert.equal(failedRoleCollision.evidence.privateBinding, null);
    const roleCollisionAbort = await abortCertificationDatabase({
      repositoryRoot,
      environment: roleCollisionFixture.environment,
      adapter: roleCollisionAdapter,
    });
    assert.equal(roleCollisionAbort.evidence.currentState, "abort-absence-verified");
    assert.equal(roleCollisionAbort.evidence.privateBinding, null);
    assert.equal(roleCollisionAdapter.stageRoleDropCount, 0);
    assert.notEqual(roleCollisionAdapter.stageRole, null);
  } finally {
    rmSync(roleCollisionFixture.root, { recursive: true, force: true });
  }

  const roleRaceFixture = fixture({ id: "stage-role-create-race" });
  const roleRaceAdapter = new FakeDatabaseAdapter({
    stageRoleCollisionOnCreate: true,
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: roleRaceFixture.environment,
      adapter: roleRaceAdapter,
      nonce: "f".repeat(32),
      qualificationFixture: true,
    });
    await assert.rejects(
      provisionCertificationDatabase({
        repositoryRoot,
        environment: roleRaceFixture.environment,
        adapter: roleRaceAdapter,
      }),
      /stage role already exists/,
    );
    const failedRoleRace = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: roleRaceFixture.environment,
    });
    assert.equal(failedRoleRace.evidence.privateBinding.status, "foreign-collision");
    assert.equal(
      failedRoleRace.evidence.privateBinding.roleCreation
        .roleAbsentImmediatelyBeforeCreate,
      true,
    );
    const roleRaceAbort = await abortCertificationDatabase({
      repositoryRoot,
      environment: roleRaceFixture.environment,
      adapter: roleRaceAdapter,
    });
    assert.equal(roleRaceAbort.evidence.privateBinding.status, "foreign-preserved");
    assert.equal(roleRaceAdapter.stageRoleDropCount, 0);
    assert.notEqual(roleRaceAdapter.stageRole, null);
  } finally {
    rmSync(roleRaceFixture.root, { recursive: true, force: true });
  }

  const sidecarCollisionFixture = fixture({ id: "private-sidecar-collision" });
  const sidecarCollisionAdapter = new FakeDatabaseAdapter();
  let foreignSidecarPath;
  try {
    const plan = await planCertificationDatabase({
      repositoryRoot,
      environment: sidecarCollisionFixture.environment,
      adapter: sidecarCollisionAdapter,
      nonce: "1".repeat(32),
      qualificationFixture: true,
    });
    foreignSidecarPath = path.join(
      sidecarCollisionFixture.root,
      ".database-bindings",
      sidecarCollisionFixture.environment.PRODUCTION_CERTIFICATION_ID,
      `${plan.evidence.database.identitySha256}.json`,
    );
    sidecarCollisionAdapter.onCreateStageRole = () => {
      mkdirSync(path.dirname(foreignSidecarPath), {
        recursive: true,
        mode: 0o700,
      });
      writeFileSync(foreignSidecarPath, "foreign private sidecar\n", {
        mode: 0o600,
      });
    };
    await assert.rejects(
      provisionCertificationDatabase({
        repositoryRoot,
        environment: sidecarCollisionFixture.environment,
        adapter: sidecarCollisionAdapter,
      }),
      /private connection sidecar already exists/,
    );
    const failedSidecarCollision = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: sidecarCollisionFixture.environment,
    });
    assert.equal(
      failedSidecarCollision.evidence.privateBinding.status,
      "foreign-sidecar-collision",
    );
    assert.equal(
      failedSidecarCollision.evidence.privateBinding.sidecarCreation
        .ownershipRecoverable,
      false,
    );
    const sidecarCollisionAbort = await abortCertificationDatabase({
      repositoryRoot,
      environment: sidecarCollisionFixture.environment,
      adapter: sidecarCollisionAdapter,
    });
    assert.equal(
      sidecarCollisionAbort.evidence.privateBinding.status,
      "role-removed-foreign-sidecar-preserved",
    );
    assert.equal(sidecarCollisionAdapter.stageRoleDropCount, 1);
    assert.equal(readFileSync(foreignSidecarPath, "utf8"), "foreign private sidecar\n");
  } finally {
    rmSync(sidecarCollisionFixture.root, { recursive: true, force: true });
  }

  const sidecarPublishRaceFixture = fixture({
    id: "private-sidecar-publish-race",
  });
  const sidecarPublishRaceAdapter = new FakeDatabaseAdapter();
  let racedForeignSidecarPath;
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: sidecarPublishRaceFixture.environment,
      adapter: sidecarPublishRaceAdapter,
      nonce: "4".repeat(32),
      qualificationFixture: true,
    });
    await assert.rejects(
      provisionCertificationDatabase({
        repositoryRoot,
        environment: sidecarPublishRaceFixture.environment,
        adapter: sidecarPublishRaceAdapter,
        testHooks: {
          beforePrivateSidecarPublish({ filePath }) {
            racedForeignSidecarPath = filePath;
            writeFileSync(filePath, "raced foreign private sidecar\n", {
              mode: 0o600,
            });
          },
        },
      }),
      /target already exists/,
    );
    const failedSidecarPublishRace = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: sidecarPublishRaceFixture.environment,
    });
    assert.equal(
      failedSidecarPublishRace.evidence.privateBinding.status,
      "foreign-sidecar-collision",
    );
    assert.equal(
      failedSidecarPublishRace.evidence.privateBinding.sidecarCreation
        .sidecarAbsentImmediatelyBeforeCreate,
      true,
    );
    assert.equal(
      failedSidecarPublishRace.evidence.privateBinding.sidecarCreation
        .ownershipRecoverable,
      false,
    );
    const sidecarPublishRaceAbort = await abortCertificationDatabase({
      repositoryRoot,
      environment: sidecarPublishRaceFixture.environment,
      adapter: sidecarPublishRaceAdapter,
    });
    assert.equal(
      sidecarPublishRaceAbort.evidence.privateBinding.status,
      "role-removed-foreign-sidecar-preserved",
    );
    assert.equal(sidecarPublishRaceAdapter.stageRoleDropCount, 1);
    assert.equal(
      readFileSync(racedForeignSidecarPath, "utf8"),
      "raced foreign private sidecar\n",
    );
  } finally {
    rmSync(sidecarPublishRaceFixture.root, {
      recursive: true,
      force: true,
    });
  }

  const sidecarCrashFixture = fixture({ id: "private-sidecar-crash" });
  const sidecarCrashAdapter = new FakeDatabaseAdapter();
  let ownedSidecarPath;
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: sidecarCrashFixture.environment,
      adapter: sidecarCrashAdapter,
      nonce: "2".repeat(32),
      qualificationFixture: true,
    });
    await assert.rejects(
      provisionCertificationDatabase({
        repositoryRoot,
        environment: sidecarCrashFixture.environment,
        adapter: sidecarCrashAdapter,
        testHooks: {
          afterPrivateSidecarWrite({ filePath }) {
            ownedSidecarPath = filePath;
            throw new Error("simulated crash after private sidecar write");
          },
        },
      }),
      /simulated crash after private sidecar write/,
    );
    const failedSidecarCrash = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: sidecarCrashFixture.environment,
    });
    assert.equal(
      failedSidecarCrash.evidence.privateBinding.status,
      "sidecar-authorized",
    );
    assert.equal(exists(ownedSidecarPath), true);
    const sidecarCrashAbort = await abortCertificationDatabase({
      repositoryRoot,
      environment: sidecarCrashFixture.environment,
      adapter: sidecarCrashAdapter,
    });
    assert.equal(sidecarCrashAbort.evidence.privateBinding.status, "removed");
    assert.equal(exists(ownedSidecarPath), false);
    assert.equal(sidecarCrashAdapter.stageRoleDropCount, 1);
  } finally {
    rmSync(sidecarCrashFixture.root, { recursive: true, force: true });
  }

  const activeSidecarTamperFixture = fixture({
    id: "active-private-sidecar-tamper",
  });
  const activeSidecarTamperAdapter = new FakeDatabaseAdapter();
  let replacedActiveSidecarPath;
  try {
    const plan = await planCertificationDatabase({
      repositoryRoot,
      environment: activeSidecarTamperFixture.environment,
      adapter: activeSidecarTamperAdapter,
      nonce: "3".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: activeSidecarTamperFixture.environment,
      adapter: activeSidecarTamperAdapter,
    });
    replacedActiveSidecarPath = path.join(
      activeSidecarTamperFixture.root,
      ".database-bindings",
      activeSidecarTamperFixture.environment.PRODUCTION_CERTIFICATION_ID,
      `${plan.evidence.database.identitySha256}.json`,
    );
    writeFileSync(replacedActiveSidecarPath, "foreign replacement sidecar\n");
    const tamperedSidecarAbort = await abortCertificationDatabase({
      repositoryRoot,
      environment: activeSidecarTamperFixture.environment,
      adapter: activeSidecarTamperAdapter,
    });
    assert.equal(
      tamperedSidecarAbort.evidence.privateBinding.status,
      "role-removed-foreign-sidecar-preserved",
    );
    assert.equal(
      tamperedSidecarAbort.evidence.cleanup.privateSidecar.foreignPreserved,
      true,
    );
    assert.equal(activeSidecarTamperAdapter.stageRoleDropCount, 1);
    assert.equal(
      readFileSync(replacedActiveSidecarPath, "utf8"),
      "foreign replacement sidecar\n",
    );
  } finally {
    rmSync(activeSidecarTamperFixture.root, {
      recursive: true,
      force: true,
    });
  }

  const ambiguousCreateFixture = fixture({ id: "ambiguous-create" });
  const leakedCredential = "certification-secret-must-not-survive";
  const ambiguousCreateAdapter = new FakeDatabaseAdapter({
    createFailure:
      `postgresql://owner:${leakedCredential}@127.0.0.1:5432/postgres password=${leakedCredential}`,
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: ambiguousCreateFixture.environment,
      adapter: ambiguousCreateAdapter,
      nonce: "b".repeat(32),
      qualificationFixture: true,
    });
    let failure;
    try {
      await provisionCertificationDatabase({
        repositoryRoot,
        environment: ambiguousCreateFixture.environment,
        adapter: ambiguousCreateAdapter,
      });
      assert.fail("ambiguous create must retain a failed lifecycle");
    } catch (error) {
      failure = error;
    }
    assert.doesNotMatch(failure.message, new RegExp(leakedCredential));
    assert.equal(ambiguousCreateAdapter.exists, true);
    const retained = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: ambiguousCreateFixture.environment,
    });
    assert.equal(retained.evidence.currentState, "failed");
    assert.ok(retained.evidence.events.some((entry) => entry.state === "provisioned"));
    assert.doesNotMatch(JSON.stringify(retained.evidence), new RegExp(leakedCredential));
    const cleaned = await abortCertificationDatabase({
      repositoryRoot,
      environment: ambiguousCreateFixture.environment,
      adapter: ambiguousCreateAdapter,
    });
    assert.equal(cleaned.evidence.currentState, "abort-absence-verified");
    assert.equal(cleaned.evidence.cleanup.drop.dropped, true);
    assert.equal(ambiguousCreateAdapter.exists, false);
  } finally {
    rmSync(ambiguousCreateFixture.root, { recursive: true, force: true });
  }

  const successFixture = fixture({ id: "success" });
  const successAdapter = new FakeDatabaseAdapter();
  try {
    const planned = await planCertificationDatabase({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
      nonce: "5".repeat(32),
      qualificationFixture: true,
    });
    const portable = JSON.stringify(planned.evidence);
    assert.equal(portable.includes("raw-secret"), false);
    assert.equal(portable.includes("postgresql://"), false);
    assert.deepEqual(databaseLifecycleEvidenceIssues(planned.evidence), []);
    const impossible = structuredClone(planned.evidence);
    impossible.events.push({
      state: "absence-verified",
      mode: "tamper",
      at: new Date().toISOString(),
      details: { targetAbsent: true, cleanupMode: "normal" },
    });
    impossible.currentState = "absence-verified";
    impossible.complete = true;
    const resealedImpossible = sealDatabaseLifecycleEvidence(impossible);
    assert.match(
      databaseLifecycleEvidenceIssues(resealedImpossible).join("; "),
      /transition is illegal/,
    );
    const foreignStage = structuredClone(planned.evidence);
    foreignStage.stageBindings.observed = [
      {
        stage: "source-validation",
        databaseIdentitySha256: "1".repeat(64),
        databaseNameSha256: "2".repeat(64),
        boundAt: new Date().toISOString(),
      },
    ];
    assert.match(
      databaseLifecycleEvidenceIssues(
        sealDatabaseLifecycleEvidence(foreignStage),
      ).join("; "),
      /stage bindings are malformed or foreign/,
    );
    const forgedAuthorization = structuredClone(planned.evidence);
    forgedAuthorization.database.provisionAuthorizationSha256 = "3".repeat(64);
    assert.match(
      databaseLifecycleEvidenceIssues(
        sealDatabaseLifecycleEvidence(forgedAuthorization),
      ).join("; "),
      /provision authorization is incoherent/,
    );
    const statePath = path.join(successFixture.root, "state.json");
    const baseState = createCertificationState({
      certificationId: successFixture.environment.PRODUCTION_CERTIFICATION_ID,
      candidateId: successFixture.environment.PRODUCTION_EVIDENCE_CANDIDATE_ID,
      commitSha,
      treeSha,
      parentSha: "7".repeat(40),
      harnessSourceSha256: "8".repeat(64),
      executionClass: "real-candidate",
      createdAt: new Date(Date.now() + 1).toISOString(),
    });
    const plannedState = replaceCertificationDatabaseLifecycle(
      baseState,
      planned.binding,
    );
    writeCertificationState(statePath, plannedState, { requireAbsent: true });
    successFixture.environment.PRODUCTION_CERTIFICATION_STATE = statePath;
    const liveStatus = {
      targetExists: false,
      canCreateDatabase: true,
      hostClassification: "explicit-loopback",
      port: 5432,
    };
    const doctorDatabase = await validateCertificationDatabaseDoctorShape(
      repositoryRoot,
      successFixture.environment,
      { statusOwner: async () => liveStatus },
    );
    assert.equal(doctorDatabase.liveCatalogAbsenceChecked, true);
    await assert.rejects(
      validateCertificationDatabaseDoctorShape(
        repositoryRoot,
        successFixture.environment,
        {
          statusOwner: async () => ({ ...liveStatus, targetExists: true }),
        },
      ),
      /absence, capability, or state binding is invalid/,
    );
    const doctorSecret = "doctor-secret-must-not-survive";
    const sealedDoctor = await runCertificationDoctor({
      repositoryRoot,
      environment: successFixture.environment,
      databaseStatusOwner: async () => {
        throw new Error(
          `postgresql://owner:${doctorSecret}@127.0.0.1:5432/postgres password=${doctorSecret}`,
        );
      },
    });
    assert.equal(sealedDoctor.valid, false);
    assert.doesNotMatch(JSON.stringify(sealedDoctor), new RegExp(doctorSecret));
    assert.doesNotMatch(JSON.stringify(sealedDoctor), /postgresql:\/\//);
    const plannedStateSha = certificationStateSha256(plannedState);
    assert.equal(
      nextCertificationCommand(plannedState).canonicalCommand,
      "npm run certification:prepare-resources",
    );
    const preparedState = structuredClone(plannedState);
    preparedState.resourcePreparation = {};
    assert.equal(
      nextCertificationCommand(preparedState).canonicalCommand,
      "npm run certification:doctor",
    );
    preparedState.stages.doctor.status = "passed";
    assert.equal(
      nextCertificationCommand(preparedState).canonicalCommand,
      "npm run certification:database:provision",
    );
    const stalePlanSha = planned.descriptor.sha256;
    const provisioned = await provisionCertificationDatabase({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
    });
    assert.equal(provisioned.evidence.currentState, "migrated");
    assert.equal(provisioned.evidence.migration.count, 43);
    assert.notEqual(provisioned.descriptor.sha256, stalePlanSha);
    assert.throws(
      () =>
        writeCertificationState(
          statePath,
          replaceCertificationDatabaseLifecycle(plannedState, provisioned.binding),
          {
          expectedCurrentSha256: "0".repeat(64),
        }),
      /changed before atomic replacement/,
    );
    const reconciledState = reconcileCertificationDatabaseLifecycleState({
      statePath,
      current: provisioned,
    });
    assert.equal(
      reconciledState.databaseLifecycle.evidence.sha256,
      provisioned.descriptor.sha256,
    );
    assert.notEqual(certificationStateSha256(reconciledState), plannedStateSha);
    const initial = await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
    });
    assert.equal(initial.evidence.currentState, "active");
    assert.equal(initial.evidence.inventories.initial.totalRows, 0);
    await bindAllStages(successFixture.environment, successAdapter);
    successAdapter.rows[0].count = 1;
    successAdapter.rows[0].count = 0;
    const successOwnership = appEventOwnership(successFixture.environment);
    successAdapter.appEvents = [
      appEventRow(successOwnership),
      appEventRow(successOwnership, {
        id: "app-event-browser-owner",
        eventType: "share_link_opened",
        stage: "browser-owners",
        stageAttempt: successOwnership.browserAttempt,
        browserOwnerId: "public-share",
      }),
    ];
    successAdapter.rows.push({ table: "AppEvent", count: 2 });
    successAdapter.onDeleteAppEvents = () => {
      const beforeRemoval = readCertificationDatabaseLifecycle({
        repositoryRoot,
        environment: successFixture.environment,
      });
      assert.equal(
        beforeRemoval.evidence.appEventCleanup.status,
        "evidence-retained",
      );
      assert.equal(
        beforeRemoval.evidence.appEventCleanup.inspection.rowCount,
        2,
      );
      assert.equal(
        beforeRemoval.evidence.events.at(-1).mode,
        "app-event-evidence",
      );
    };
    const final = await verifyFinalCertificationDatabase({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
      appEventOwnership: successOwnership,
    });
    assert.equal(final.evidence.currentState, "final-empty-verified");
    assert.equal(final.evidence.appEventCleanup.inspection.rowCount, 2);
    assert.equal(final.evidence.appEventCleanup.status, "owned-rows-removed");
    assert.equal(final.evidence.appEventCleanup.cleanup.removedCount, 2);
    assert.equal(final.evidence.appEventCleanup.cleanup.remainingCount, 0);
    assert.equal(successAdapter.appEvents.length, 0);
    const contradictoryAggregate = structuredClone(final.evidence);
    contradictoryAggregate.appEventCleanup.inspection.aggregates[0].runBound =
      false;
    contradictoryAggregate.appEventCleanup.inspection.aggregates[0]
      .foreignOrUnbound = true;
    const contradictoryPayload = structuredClone(
      contradictoryAggregate.appEventCleanup.inspection,
    );
    delete contradictoryPayload.aggregateSha256;
    contradictoryAggregate.appEventCleanup.inspection.aggregateSha256 =
      createHash("sha256")
        .update(canonicalJsonBytes(contradictoryPayload))
        .digest("hex");
    assert.match(
      databaseLifecycleEvidenceIssues(
        sealDatabaseLifecycleEvidence(contradictoryAggregate),
      ).join("; "),
      /AppEvent cleanup evidence is malformed/,
    );
    const impossibleOwnedAggregate = structuredClone(final.evidence);
    impossibleOwnedAggregate.appEventCleanup.inspection.aggregates[0]
      .eventType = "unexpected-or-malformed-event-type";
    const impossibleOwnedPayload = structuredClone(
      impossibleOwnedAggregate.appEventCleanup.inspection,
    );
    delete impossibleOwnedPayload.aggregateSha256;
    impossibleOwnedAggregate.appEventCleanup.inspection.aggregateSha256 =
      createHash("sha256")
        .update(canonicalJsonBytes(impossibleOwnedPayload))
        .digest("hex");
    assert.match(
      databaseLifecycleEvidenceIssues(
        sealDatabaseLifecycleEvidence(impossibleOwnedAggregate),
      ).join("; "),
      /AppEvent cleanup evidence is malformed/,
    );
    await dropCertificationDatabase({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
    });
    const absent = await verifyCertificationDatabaseAbsent({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
    });
    assert.equal(absent.evidence.currentState, "absence-verified");
    assert.equal(successAdapter.unrelatedSessions.length, 1);
    const status = await certificationDatabaseStatus({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
    });
    assert.equal(status.mode, "read-only");
    assert.equal(status.targetExists, false);
    const lateAbort = await abortCertificationDatabase({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
      originalFailure: {
        classification: "ARTIFACT_CONTINUITY_FAILURE",
        consumedSubstantiveGate: true,
        stage: "continuity",
      },
    });
    assert.equal(lateAbort.evidence.cleanup.finalEmptyVerified, true);
    assert.equal(lateAbort.evidence.cleanup.drop.dropped, true);
    assert.equal(lateAbort.evidence.cleanup.failedRunRehabilitated, false);
    const changedCandidate = {
      ...successFixture.environment,
      PRODUCTION_EVIDENCE_CANDIDATE_ID: "candidate-foreign",
    };
    assert.throws(
      () => readCertificationDatabaseLifecycle({ repositoryRoot, environment: changedCandidate }),
      /another certification or candidate/,
    );
    assert.throws(
      () =>
        readCertificationDatabaseLifecycle({
          repositoryRoot,
          environment: {
            ...successFixture.environment,
            PRODUCTION_CERTIFICATION_ID: "certification-foreign",
          },
        }),
      /another certification or candidate/,
    );
    assert.throws(
      () =>
        readCertificationDatabaseLifecycle({
          repositoryRoot,
          environment: {
            ...successFixture.environment,
            CERTIFICATION_EXPECTED_COMMIT_SHA: "f".repeat(40),
          },
        }),
      /another certification or candidate/,
    );
  } finally {
    rmSync(successFixture.root, { recursive: true, force: true });
  }

  const emptyFinalFixture = fixture({ id: "empty-final" });
  const emptyFinalAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: emptyFinalFixture.environment,
      adapter: emptyFinalAdapter,
      nonce: "1".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: emptyFinalFixture.environment,
      adapter: emptyFinalAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: emptyFinalFixture.environment,
      adapter: emptyFinalAdapter,
    });
    await bindAllStages(emptyFinalFixture.environment, emptyFinalAdapter);
    const final = await verifyFinalCertificationDatabase({
      repositoryRoot,
      environment: emptyFinalFixture.environment,
      adapter: emptyFinalAdapter,
      appEventOwnership: appEventOwnership(emptyFinalFixture.environment),
    });
    assert.equal(final.evidence.currentState, "final-empty-verified");
    assert.equal(final.evidence.appEventCleanup.inspection.rowCount, 0);
    assert.equal(final.evidence.appEventCleanup.cleanup.removedCount, 0);
    await dropCertificationDatabase({
      repositoryRoot,
      environment: emptyFinalFixture.environment,
      adapter: emptyFinalAdapter,
    });
    const absent = await verifyCertificationDatabaseAbsent({
      repositoryRoot,
      environment: emptyFinalFixture.environment,
      adapter: emptyFinalAdapter,
    });
    assert.equal(absent.evidence.currentState, "absence-verified");
  } finally {
    rmSync(emptyFinalFixture.root, { recursive: true, force: true });
  }

  for (const [index, failureCase] of [
    { id: "other-table-only", rows: 1, sessions: 0, bindStages: true },
    { id: "active-session-only", rows: 0, sessions: 1, bindStages: true },
    { id: "missing-stage-binding-only", rows: 0, sessions: 0, bindStages: false },
  ].entries()) {
    const isolatedFixture = fixture({ id: failureCase.id });
    const isolatedAdapter = new FakeDatabaseAdapter();
    try {
      await planCertificationDatabase({
        repositoryRoot,
        environment: isolatedFixture.environment,
        adapter: isolatedAdapter,
        nonce: String(index + 2).repeat(32),
        qualificationFixture: true,
      });
      await provisionCertificationDatabase({
        repositoryRoot,
        environment: isolatedFixture.environment,
        adapter: isolatedAdapter,
      });
      await verifyInitialCertificationDatabase({
        repositoryRoot,
        environment: isolatedFixture.environment,
        adapter: isolatedAdapter,
      });
      if (failureCase.bindStages) {
        await bindAllStages(isolatedFixture.environment, isolatedAdapter);
      }
      isolatedAdapter.rows[0].count = failureCase.rows;
      isolatedAdapter.sessions = Array.from(
        { length: failureCase.sessions },
        (_, sessionIndex) => ({
          pid: 8100 + sessionIndex,
          role: "isolated_owner",
          applicationName: "isolated-fixture",
          clientAddress: "127.0.0.1",
          state: "idle",
          backendStartedAt: "2026-08-26T10:00:00.000Z",
        }),
      );
      await assert.rejects(
        verifyFinalCertificationDatabase({
          repositoryRoot,
          environment: isolatedFixture.environment,
          adapter: isolatedAdapter,
          appEventOwnership: appEventOwnership(isolatedFixture.environment),
        }),
        /row, session, or stage-binding contract failed/,
      );
      const failed = readCertificationDatabaseLifecycle({
        repositoryRoot,
        environment: isolatedFixture.environment,
      });
      assert.equal(failed.evidence.currentState, "failed");
      assert.equal(
        failed.evidence.inventories.final.totalRows,
        failureCase.rows,
      );
      assert.equal(
        failed.evidence.sessions.final.count,
        failureCase.sessions,
      );
      const failedSnapshot = retainCertificationDatabaseFailureSnapshot({
        repositoryRoot,
        environment: isolatedFixture.environment,
        attempt: 1,
      });
      await abortCertificationDatabase({
        repositoryRoot,
        environment: isolatedFixture.environment,
        adapter: isolatedAdapter,
        originalFailure: {
          classification: "DATABASE_LIFECYCLE_FAILURE",
          consumedSubstantiveGate: true,
          stage: "database:verify-final",
          attempt: 1,
          failedStateSha256: String(index + 5).repeat(64),
          evidenceReferences: { "database-final-failure": failedSnapshot },
        },
      });
    } finally {
      rmSync(isolatedFixture.root, { recursive: true, force: true });
    }
  }

  const foreignEventFixture = fixture({ id: "foreign-app-event" });
  const foreignEventAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: foreignEventFixture.environment,
      adapter: foreignEventAdapter,
      nonce: "e".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: foreignEventFixture.environment,
      adapter: foreignEventAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: foreignEventFixture.environment,
      adapter: foreignEventAdapter,
    });
    await bindAllStages(foreignEventFixture.environment, foreignEventAdapter);
    const ownership = appEventOwnership(foreignEventFixture.environment);
    const foreignOwnership = {
      ...ownership,
      certificationId: "certification-foreign-app-event-owner",
    };
    foreignEventAdapter.appEvents = [appEventRow(foreignOwnership)];
    foreignEventAdapter.rows.push({ table: "AppEvent", count: 1 });
    await assert.rejects(
      verifyFinalCertificationDatabase({
        repositoryRoot,
        environment: foreignEventFixture.environment,
        adapter: foreignEventAdapter,
        appEventOwnership: ownership,
      }),
      /attribution was foreign, unbound, malformed/,
    );
    const failed = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: foreignEventFixture.environment,
    });
    assert.equal(failed.evidence.currentState, "failed");
    assert.equal(failed.evidence.appEventCleanup.status, "evidence-retained");
    assert.equal(failed.evidence.appEventCleanup.inspection.valid, false);
    assert.equal(failed.evidence.appEventCleanup.inspection.rowCount, 1);
    assert.equal(failed.evidence.inventories.final.totalRows, 1);
    assert.equal(failed.evidence.sessions.final.count, 0);
    assert.equal(foreignEventAdapter.appEvents.length, 1);
    const failedSnapshot = retainCertificationDatabaseFailureSnapshot({
      repositoryRoot,
      environment: foreignEventFixture.environment,
      attempt: 1,
    });
    await abortCertificationDatabase({
      repositoryRoot,
      environment: foreignEventFixture.environment,
      adapter: foreignEventAdapter,
      originalFailure: {
        classification: "DATABASE_LIFECYCLE_FAILURE",
        consumedSubstantiveGate: true,
        stage: "database:verify-final",
        attempt: 1,
        failedStateSha256: "c".repeat(64),
        evidenceReferences: { "database-final-failure": failedSnapshot },
      },
    });
  } finally {
    rmSync(foreignEventFixture.root, { recursive: true, force: true });
  }

  const cleanupFailureFixture = fixture({ id: "app-event-cleanup-failure" });
  const cleanupFailureAdapter = new FakeDatabaseAdapter({
    appEventCleanupFailure: "exact AppEvent cleanup transaction failed",
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: cleanupFailureFixture.environment,
      adapter: cleanupFailureAdapter,
      nonce: "f".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: cleanupFailureFixture.environment,
      adapter: cleanupFailureAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: cleanupFailureFixture.environment,
      adapter: cleanupFailureAdapter,
    });
    await bindAllStages(cleanupFailureFixture.environment, cleanupFailureAdapter);
    const ownership = appEventOwnership(cleanupFailureFixture.environment);
    cleanupFailureAdapter.appEvents = [appEventRow(ownership)];
    cleanupFailureAdapter.rows.push({ table: "AppEvent", count: 1 });
    await assert.rejects(
      verifyFinalCertificationDatabase({
        repositoryRoot,
        environment: cleanupFailureFixture.environment,
        adapter: cleanupFailureAdapter,
        appEventOwnership: ownership,
      }),
      /exact AppEvent cleanup transaction failed/,
    );
    const failed = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: cleanupFailureFixture.environment,
    });
    assert.equal(failed.evidence.currentState, "failed");
    assert.equal(failed.evidence.appEventCleanup.status, "evidence-retained");
    assert.equal(failed.evidence.appEventCleanup.inspection.valid, true);
    assert.equal(failed.evidence.inventories.final.totalRows, 1);
    assert.equal(failed.evidence.sessions.final.count, 0);
    assert.equal(cleanupFailureAdapter.appEvents.length, 1);
    const failedSnapshot = retainCertificationDatabaseFailureSnapshot({
      repositoryRoot,
      environment: cleanupFailureFixture.environment,
      attempt: 1,
    });
    const originalFailure = {
      classification: "DATABASE_LIFECYCLE_FAILURE",
      consumedSubstantiveGate: true,
      stage: "database:verify-final",
      attempt: 1,
      failedStateSha256: "d".repeat(64),
      evidenceReferences: { "database-final-failure": failedSnapshot },
    };
    cleanupFailureAdapter.inspectionFailure =
      "abort inspection failed after final database failure";
    await assert.rejects(
      abortCertificationDatabase({
        repositoryRoot,
        environment: cleanupFailureFixture.environment,
        adapter: cleanupFailureAdapter,
        originalFailure,
      }),
      /abort inspection failed/,
    );
    const failedAbort = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: cleanupFailureFixture.environment,
    });
    assert.equal(
      failedAbort.evidence.failure.failedStateSha256,
      originalFailure.failedStateSha256,
    );
    assert.deepEqual(
      failedAbort.evidence.failure.evidenceReferences,
      originalFailure.evidenceReferences,
    );
    assert.equal(
      failedAbort.evidence.cleanupFailure.classification,
      "DATABASE_LIFECYCLE_FAILURE",
    );
    await assert.rejects(
      abortCertificationDatabase({
        repositoryRoot,
        environment: cleanupFailureFixture.environment,
        adapter: cleanupFailureAdapter,
        originalFailure: {
          ...originalFailure,
          failedStateSha256: "e".repeat(64),
        },
      }),
      /contradicts retained database failure/,
    );
    await abortCertificationDatabase({
      repositoryRoot,
      environment: cleanupFailureFixture.environment,
      adapter: cleanupFailureAdapter,
      originalFailure,
    });
  } finally {
    rmSync(cleanupFailureFixture.root, { recursive: true, force: true });
  }

  const initialFailureFixture = fixture({ id: "initial-nonzero" });
  const initialFailureAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: initialFailureFixture.environment,
      adapter: initialFailureAdapter,
      nonce: "a".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: initialFailureFixture.environment,
      adapter: initialFailureAdapter,
    });
    initialFailureAdapter.rows[0].count = 1;
    await assert.rejects(
      verifyInitialCertificationDatabase({
        repositoryRoot,
        environment: initialFailureFixture.environment,
        adapter: initialFailureAdapter,
      }),
      /initial certification database is not empty/,
    );
    const failed = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: initialFailureFixture.environment,
    });
    assert.equal(failed.evidence.currentState, "failed");
    assert.equal(failed.evidence.inventories.initial.totalRows, 1);
    await abortCertificationDatabase({
      repositoryRoot,
      environment: initialFailureFixture.environment,
      adapter: initialFailureAdapter,
    });
  } finally {
    rmSync(initialFailureFixture.root, { recursive: true, force: true });
  }

  const failureFixture = fixture({ id: "abort" });
  const failureAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: failureFixture.environment,
      adapter: failureAdapter,
      nonce: "6".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: failureFixture.environment,
      adapter: failureAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: failureFixture.environment,
      adapter: failureAdapter,
    });
    await bindAllStages(failureFixture.environment, failureAdapter);
    failureAdapter.rows[0].count = 1;
    failureAdapter.sessions = [
      {
        pid: 7001,
        role: "owner",
        applicationName: "fixture",
        clientAddress: "127.0.0.1",
        state: "idle",
        backendStartedAt: "2026-08-17T00:00:00.000Z",
      },
    ];
    await assert.rejects(
      verifyFinalCertificationDatabase({
        repositoryRoot,
        environment: failureFixture.environment,
        adapter: failureAdapter,
      }),
      /row, session, or stage-binding contract failed/,
    );
    const failed = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: failureFixture.environment,
    });
    assert.equal(failed.evidence.currentState, "failed");
    assert.equal(failed.evidence.inventories.final.totalRows, 1);
    assert.equal(failed.evidence.sessions.final.count, 1);
    const failedSnapshot = retainCertificationDatabaseFailureSnapshot({
      repositoryRoot,
      environment: failureFixture.environment,
      attempt: 1,
    });
    const aborted = await abortCertificationDatabase({
      repositoryRoot,
      environment: failureFixture.environment,
      adapter: failureAdapter,
      originalFailure: {
        classification: "DATABASE_LIFECYCLE_FAILURE",
        consumedSubstantiveGate: true,
        stage: "database:verify-final",
        attempt: 1,
        failedStateSha256: "a".repeat(64),
        evidenceReferences: {
          "database-final-failure": failedSnapshot,
        },
      },
    });
    assert.equal(aborted.evidence.currentState, "abort-absence-verified");
    assert.equal(aborted.evidence.cleanup.finalEmptyVerified, false);
    assert.equal(aborted.evidence.cleanup.drop.dropped, true);
    assert.equal(aborted.evidence.cleanup.failedRunRehabilitated, false);
    assert.deepEqual(failureAdapter.terminated, [7001]);
    assert.equal(failureAdapter.unrelatedSessions.length, 1);
    const repeated = await abortCertificationDatabase({
      repositoryRoot,
      environment: failureFixture.environment,
      adapter: failureAdapter,
    });
    assert.equal(repeated.evidence.currentState, "abort-absence-verified");
  } finally {
    rmSync(failureFixture.root, { recursive: true, force: true });
  }

  const runtimeFailureFixture = fixture({ id: "runtime-abort-attribution" });
  const runtimeFailureAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: runtimeFailureFixture.environment,
      adapter: runtimeFailureAdapter,
      nonce: "7".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: runtimeFailureFixture.environment,
      adapter: runtimeFailureAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: runtimeFailureFixture.environment,
      adapter: runtimeFailureAdapter,
    });
    await bindAllStages(runtimeFailureFixture.environment, runtimeFailureAdapter);
    runtimeFailureAdapter.rows[0].count = 3;
    runtimeFailureAdapter.sessions = [
      {
        pid: 7201,
        role: "runtime_owner",
        applicationName: "runtime-fixture",
        clientAddress: "127.0.0.1",
        state: "idle",
        backendStartedAt: "2026-08-17T00:00:00.000Z",
      },
    ];
    const failedStateSha256 = "f".repeat(64);
    const evidenceReferences = {
      "runtime-report": {
        path: "runtime-smoke/playwright-report.json",
        sha256: "a".repeat(64),
      },
      "runtime-phase-timings": {
        path: "runtime-smoke/phase-timings.json",
        sha256: "b".repeat(64),
      },
      "runtime-start": {
        path: "runtime-smoke/product-test-start.json",
        sha256: "c".repeat(64),
      },
    };
    const aborted = await abortCertificationDatabase({
      repositoryRoot,
      environment: runtimeFailureFixture.environment,
      adapter: runtimeFailureAdapter,
      originalFailure: {
        classification: "PRODUCT_ASSERTION_FAILURE",
        consumedSubstantiveGate: true,
        stage: "runtime-smoke",
        attempt: 1,
        failedStateSha256,
        evidenceReferences,
      },
    });
    assert.equal(aborted.evidence.currentState, "abort-absence-verified");
    assert.equal(aborted.evidence.complete, true);
    assert.equal(aborted.evidence.cleanup.targetAbsent, true);
    assert.equal(aborted.evidence.cleanup.finalEmptyVerified, false);
    assert.equal(aborted.evidence.cleanup.failedRunRehabilitated, false);
    assert.equal(aborted.evidence.inventories.abort.totalRows, 3);
    assert.equal(aborted.evidence.sessions.abort.count, 1);
    assert.deepEqual(aborted.evidence.failure, {
      mode: "abort-cleanup",
      classification: "PRODUCT_ASSERTION_FAILURE",
      originalStage: "runtime-smoke",
      attempt: 1,
      consumedSubstantiveGate: true,
      failedStateSha256,
      evidenceReferences,
      reason: "original certification failure retained",
      at: aborted.evidence.failure.at,
    });
    assert.deepEqual(databaseLifecycleEvidenceIssues(aborted.evidence), []);
    const serialized = JSON.stringify(aborted.evidence);
    assert.equal(serialized.includes("raw-secret"), false);
    assert.equal(serialized.includes("postgresql://"), false);
  } finally {
    rmSync(runtimeFailureFixture.root, { recursive: true, force: true });
  }

  const wrapperCleanupFixture = fixture({ id: "wrapper-cleanup-original-failure" });
  const wrapperCleanupAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: wrapperCleanupFixture.environment,
      adapter: wrapperCleanupAdapter,
      nonce: "9".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: wrapperCleanupFixture.environment,
      adapter: wrapperCleanupAdapter,
    });
    const active = await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: wrapperCleanupFixture.environment,
      adapter: wrapperCleanupAdapter,
    });
    const statePath = path.join(wrapperCleanupFixture.root, "state.json");
    const baseTime = Date.parse(active.binding.updatedAt);
    const baseState = createCertificationState({
      certificationId:
        wrapperCleanupFixture.environment.PRODUCTION_CERTIFICATION_ID,
      candidateId:
        wrapperCleanupFixture.environment.PRODUCTION_EVIDENCE_CANDIDATE_ID,
      commitSha,
      treeSha,
      parentSha: git("HEAD^"),
      harnessSourceSha256: "9".repeat(64),
      executionClass: "real-candidate",
      createdAt: new Date(baseTime).toISOString(),
    });
    const boundState = replaceCertificationDatabaseLifecycle(
      baseState,
      active.binding,
    );
    const runningState = startCertificationStage(boundState, {
      stage: "doctor",
      startedAt: new Date(baseTime + 1).toISOString(),
    });
    const failedState = completeCertificationStage(runningState, {
      stage: "doctor",
      passed: false,
      completedAt: new Date(baseTime + 2).toISOString(),
      exitCode: 17,
      failureClassification: "SOURCE_CONTRACT_FAILURE",
      consumedSubstantiveGate: true,
    });
    writeCertificationState(statePath, failedState, { requireAbsent: true });
    wrapperCleanupFixture.environment.PRODUCTION_CERTIFICATION_STATE = statePath;
    const failedStateSha256 = certificationStateSha256(failedState);
    await assert.rejects(
      runDatabaseAbortCleanup({
        repositoryRoot,
        environment: wrapperCleanupFixture.environment,
        adapter: wrapperCleanupAdapter,
        originalFailure: {
          classification: "SOURCE_CONTRACT_FAILURE",
          consumedSubstantiveGate: true,
          stage: "doctor",
          attempt: 2,
          failedStateSha256,
          evidenceReferences: {},
        },
      }),
      /original failure differs from the physical failed stage/,
    );
    const cleanup = await runDatabaseAbortCleanup({
      repositoryRoot,
      environment: wrapperCleanupFixture.environment,
      adapter: wrapperCleanupAdapter,
      originalFailure: {
        classification: "SOURCE_CONTRACT_FAILURE",
        consumedSubstantiveGate: true,
        stage: "doctor",
        attempt: 1,
        failedStateSha256,
        evidenceReferences: {},
      },
    });
    assert.equal(cleanup.classification, "SOURCE_CONTRACT_FAILURE");
    assert.equal(cleanup.consumedSubstantiveGate, true);
    assert.deepEqual(cleanup.originalFailure, {
      classification: "SOURCE_CONTRACT_FAILURE",
      originalStage: "doctor",
      attempt: 1,
      consumedSubstantiveGate: true,
      failedStateSha256,
      evidenceReferences: {},
    });
    const cleanedState = readCertificationState(statePath);
    assert.equal(
      cleanedState.databaseLifecycle.lifecycleState,
      "abort-absence-verified",
    );
    const retainedLifecycle = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: wrapperCleanupFixture.environment,
    });
    assert.equal(
      retainedLifecycle.evidence.failure.failedStateSha256,
      failedStateSha256,
    );
    assert.equal(
      retainedLifecycle.evidence.failure.consumedSubstantiveGate,
      true,
    );
  } finally {
    rmSync(wrapperCleanupFixture.root, { recursive: true, force: true });
  }

  const databaseResultFixture = fixture({
    id: "final-database-failure-result-channel",
  });
  const databaseResultAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: databaseResultFixture.environment,
      adapter: databaseResultAdapter,
      nonce: "8".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: databaseResultFixture.environment,
      adapter: databaseResultAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: databaseResultFixture.environment,
      adapter: databaseResultAdapter,
    });
    await bindAllStages(
      databaseResultFixture.environment,
      databaseResultAdapter,
    );
    const activeLifecycle = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: databaseResultFixture.environment,
    });
    const statePath = path.join(databaseResultFixture.root, "state.json");
    const baseState = createCertificationState({
      certificationId:
        databaseResultFixture.environment.PRODUCTION_CERTIFICATION_ID,
      candidateId:
        databaseResultFixture.environment.PRODUCTION_EVIDENCE_CANDIDATE_ID,
      commitSha,
      treeSha,
      parentSha: git("HEAD^"),
      harnessSourceSha256: "7".repeat(64),
      executionClass: "real-candidate",
      createdAt: activeLifecycle.binding.updatedAt,
    });
    const preState = replaceCertificationDatabaseLifecycle(
      baseState,
      activeLifecycle.binding,
    );
    databaseResultFixture.environment.PRODUCTION_CERTIFICATION_STATE = statePath;
    databaseResultAdapter.rows[0].count = 1;
    let finalError;
    try {
      await verifyFinalCertificationDatabase({
        repositoryRoot,
        environment: databaseResultFixture.environment,
        adapter: databaseResultAdapter,
        appEventOwnership: appEventOwnership(
          databaseResultFixture.environment,
        ),
      });
      assert.fail("non-empty final database must fail");
    } catch (error) {
      finalError = error;
    }
    assert.ok(finalError.databaseLifecycleResult);
    const failedState = replaceCertificationDatabaseLifecycle(
      preState,
      finalError.databaseLifecycleResult.binding,
    );
    writeCertificationState(statePath, failedState, { requireAbsent: true });
    const failedStateSha256 = certificationStateSha256(failedState);
    const snapshot = retainCertificationDatabaseFailureSnapshot({
      repositoryRoot,
      environment: databaseResultFixture.environment,
      attempt: 1,
    });
    const databaseLifecycleFailure = {
      classification: "DATABASE_LIFECYCLE_FAILURE",
      stage: "database:verify-final",
      attempt: 1,
      consumedSubstantiveGate: true,
      failedStateSha256,
      evidenceReferences: { "database-final-failure": snapshot },
    };
    const commandError = {
      classification: "DATABASE_LIFECYCLE_FAILURE",
      consumed: true,
      stage: "database:verify-final",
      stageAttempt: 1,
      failedStateSha256,
      evidenceFiles: databaseLifecycleFailure.evidenceReferences,
      databaseLifecycleFailure,
      databaseLifecycleResult: finalError.databaseLifecycleResult,
    };
    const abortRequest = createCertificationAbortCleanupRequest({
      command: "database:verify-final",
      terminalSignal: null,
      commandError,
      environment: databaseResultFixture.environment,
    });
    const invocation = {
      command: "database:verify-final",
      nonce: "final-database-result-channel-0001",
      statePath,
      preState,
      preStateSha256: certificationStateSha256(preState),
      capturedAt: preState.updatedAt,
    };
    const validationOptions = {
      statePath,
      evidenceRoot: databaseResultFixture.root,
      repositoryRoot,
      expectedCommand: "database:verify-final",
      expectedInvocationNonce: invocation.nonce,
      expectedPreStateSha256: invocation.preStateSha256,
      verifyCurrentSource: false,
    };

    databaseResultAdapter.inspectionFailure =
      "automatic abort inspection failure";
    let cleanupError;
    try {
      await runDatabaseAbortCleanup({
        repositoryRoot,
        environment: abortRequest.environment,
        adapter: databaseResultAdapter,
        originalFailure: abortRequest.originalFailure,
      });
      assert.fail("automatic abort inspection failure must be surfaced");
    } catch (error) {
      cleanupError = error;
    }
    assert.ok(cleanupError.databaseLifecycleResult);
    const failedAbortValue = createCertificationStageCommandResult({
      invocation,
      commandError,
      cleanupError,
      wrapperExitCode: 1,
      evidenceRoot: databaseResultFixture.root,
    });
    assert.equal(failedAbortValue.result, "failed");
    assert.equal(failedAbortValue.details.automaticAbort.outcome, "failed");
    assert.equal(
      validateCertificationStageResult({
        value: failedAbortValue,
        ...validationOptions,
      }).valid,
      true,
    );

    const cleanupResult = await runDatabaseAbortCleanup({
      repositoryRoot,
      environment: {
        ...abortRequest.environment,
        CERTIFICATION_EXPECTED_STATE_SHA256: undefined,
      },
      adapter: databaseResultAdapter,
      originalFailure: abortRequest.originalFailure,
    });
    const completedAbortValue = createCertificationStageCommandResult({
      invocation,
      commandError,
      cleanupResult,
      wrapperExitCode: 1,
      evidenceRoot: databaseResultFixture.root,
    });
    assert.equal(completedAbortValue.result, "failed");
    assert.equal(
      completedAbortValue.classification,
      "DATABASE_LIFECYCLE_FAILURE",
    );
    assert.equal(
      completedAbortValue.stage.attemptId,
      "database-verify-final:001",
    );
    assert.equal(completedAbortValue.consumedSubstantiveGate, true);
    assert.equal(
      completedAbortValue.details.automaticAbort.outcome,
      "completed",
    );
    assert.equal(
      completedAbortValue.details.automaticAbort.originalFailure
        .failedStateSha256,
      failedStateSha256,
    );
    assert.equal(
      validateCertificationStageResult({
        value: completedAbortValue,
        ...validationOptions,
      }).valid,
      true,
    );
    const lostFailure = sealCertificationStageResult({
      ...structuredClone(completedAbortValue),
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
    });
    assert.equal(
      validateCertificationStageResult({
        value: lostFailure,
        ...validationOptions,
      }).valid,
      false,
    );
  } finally {
    rmSync(databaseResultFixture.root, { recursive: true, force: true });
  }

  const deniedCleanupFixture = fixture({
    id: "abort-first-inspection-attribution",
  });
  const deniedCleanupAdapter = new FakeDatabaseAdapter();
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: deniedCleanupFixture.environment,
      adapter: deniedCleanupAdapter,
      nonce: "b".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: deniedCleanupFixture.environment,
      adapter: deniedCleanupAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: deniedCleanupFixture.environment,
      adapter: deniedCleanupAdapter,
    });
    deniedCleanupAdapter.inspectionFailure =
      "connect EPERM 127.0.0.1:5432 - Local (0.0.0.0:0)";
    await assert.rejects(
      abortCertificationDatabase({
        repositoryRoot,
        environment: deniedCleanupFixture.environment,
        adapter: deniedCleanupAdapter,
        originalFailure: {
          classification: "SOURCE_CONTRACT_FAILURE",
          consumedSubstantiveGate: false,
          stage: "archive-preflight",
          attempt: null,
          failedStateSha256: null,
          evidenceReferences: {},
        },
      }),
      /connect EPERM/,
    );
    const denied = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: deniedCleanupFixture.environment,
    });
    assert.equal(denied.evidence.currentState, "failed");
    assert.deepEqual(denied.evidence.failure, {
      mode: "abort-cleanup",
      classification: "SOURCE_CONTRACT_FAILURE",
      originalStage: "archive-preflight",
      attempt: null,
      consumedSubstantiveGate: false,
      failedStateSha256: null,
      evidenceReferences: {},
      reason: "original certification failure retained",
      at: denied.evidence.failure.at,
    });
    assert.equal(
      denied.evidence.cleanupFailure.classification,
      "DATABASE_LIFECYCLE_FAILURE",
    );
    assert.equal(denied.evidence.cleanupFailure.originalStage, null);
    assert.match(denied.evidence.cleanupFailure.reason, /connect EPERM/);
    const recovered = await abortCertificationDatabase({
      repositoryRoot,
      environment: deniedCleanupFixture.environment,
      adapter: deniedCleanupAdapter,
    });
    assert.equal(recovered.evidence.currentState, "abort-absence-verified");
    assert.equal(
      recovered.evidence.failure.originalStage,
      "archive-preflight",
    );
    assert.equal(recovered.evidence.cleanup.failedRunRehabilitated, false);
  } finally {
    rmSync(deniedCleanupFixture.root, { recursive: true, force: true });
  }

  const checkpointFixture = fixture({ id: "abort-checkpoint" });
  const checkpointAdapter = new FakeDatabaseAdapter({
    releaseFailure: "release failed with password=checkpoint-secret",
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: checkpointFixture.environment,
      adapter: checkpointAdapter,
      nonce: "c".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: checkpointFixture.environment,
      adapter: checkpointAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: checkpointFixture.environment,
      adapter: checkpointAdapter,
    });
    checkpointAdapter.rows[0].count = 2;
    checkpointAdapter.sessions = [
      {
        pid: 7101,
        role: "owner",
        applicationName: "checkpoint-fixture",
        clientAddress: "127.0.0.1",
        state: "idle",
        backendStartedAt: "2026-08-17T00:00:00.000Z",
      },
    ];
    let releaseError;
    try {
      await abortCertificationDatabase({
        repositoryRoot,
        environment: checkpointFixture.environment,
        adapter: checkpointAdapter,
        originalFailure: {
          classification: "PRODUCT_ASSERTION_FAILURE",
          consumedSubstantiveGate: true,
          stage: "browser-owners",
        },
      });
      assert.fail("abort release failure must be surfaced");
    } catch (error) {
      releaseError = error;
    }
    assert.match(releaseError.message, /release failed/);
    assert.doesNotMatch(releaseError.message, /checkpoint-secret/);
    const partial = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: checkpointFixture.environment,
    });
    assert.equal(partial.evidence.inventories.abort.totalRows, 2);
    assert.equal(partial.evidence.sessions.abort.count, 1);
    assert.equal(partial.evidence.failure.classification, "PRODUCT_ASSERTION_FAILURE");
    assert.doesNotMatch(JSON.stringify(partial.evidence), /checkpoint-secret/);
    checkpointAdapter.releaseFailure = null;
    const recovered = await abortCertificationDatabase({
      repositoryRoot,
      environment: checkpointFixture.environment,
      adapter: checkpointAdapter,
    });
    assert.equal(recovered.evidence.currentState, "abort-absence-verified");
  } finally {
    rmSync(checkpointFixture.root, { recursive: true, force: true });
  }

  const postDropRetryFixture = fixture({ id: "post-drop-retry" });
  const postDropRetryAdapter = new FakeDatabaseAdapter({
    failFirstPostDropInspection: true,
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment: postDropRetryFixture.environment,
      adapter: postDropRetryAdapter,
      nonce: "e".repeat(32),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: postDropRetryFixture.environment,
      adapter: postDropRetryAdapter,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: postDropRetryFixture.environment,
      adapter: postDropRetryAdapter,
    });
    await assert.rejects(
      abortCertificationDatabase({
        repositoryRoot,
        environment: postDropRetryFixture.environment,
        adapter: postDropRetryAdapter,
        originalFailure: {
          classification: "INFRASTRUCTURE_TRANSIENT",
          consumedSubstantiveGate: false,
          stage: "post-drop-absence",
        },
      }),
      /post-drop absence inspection failed once/,
    );
    const afterDropFailure = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: postDropRetryFixture.environment,
    });
    assert.equal(afterDropFailure.evidence.currentState, "failed");
    assert.equal(afterDropFailure.evidence.cleanup.drop.dropped, true);
    const postDropRecovered = await abortCertificationDatabase({
      repositoryRoot,
      environment: postDropRetryFixture.environment,
      adapter: postDropRetryAdapter,
    });
    assert.equal(postDropRecovered.evidence.currentState, "abort-absence-verified");
    assert.equal(postDropRecovered.evidence.cleanup.drop.dropped, true);
    assert.ok(
      postDropRecovered.evidence.events.filter(
        (entry) => entry.state === "abort-dropped",
      ).length >= 2,
    );
  } finally {
    rmSync(postDropRetryFixture.root, { recursive: true, force: true });
  }

  let finishCommand;
  let cleanupStarted = false;
  const commandBarrier = new Promise((resolve) => {
    finishCommand = resolve;
  });
  const terminal = createSerializedTerminalLifecycle({
    runAbortCleanup: async () => {
      cleanupStarted = true;
    },
  });
  const terminalResult = terminal.execute(() => commandBarrier);
  terminal.requestSignal("SIGTERM");
  await Promise.resolve();
  assert.equal(cleanupStarted, false, "signal cleanup must wait for the active owner");
  finishCommand();
  const settledTerminal = await terminalResult;
  assert.equal(settledTerminal.terminalSignal, "SIGTERM");
  assert.equal(cleanupStarted, true);
}

async function insertAppEventRows(client, rows) {
  await client.query("BEGIN");
  try {
    for (const row of rows) {
      await client.query(
        `INSERT INTO "AppEvent" (
           id, "eventType", meta, authority, producer, "verificationMethod",
           "provenanceVersion", "externalEventId", "createdAt"
         ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.eventType,
          JSON.stringify(
            {
              ...(row.binding === null
                ? {}
                : { certificationRunBinding: row.binding }),
              ...(row.prohibitedPrivateData
                ? { cookie: "private-fixture-value" }
                : {}),
            },
          ),
          row.authority,
          row.producer,
          row.verificationMethod,
          row.provenanceVersion,
          row.externalEventId,
          row.createdAt,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function appEventWriterAuthEnvironment() {
  const nonce = "e".repeat(32);
  const googleClientId =
    `123456789012345-gate-a3-ci-${nonce}.apps.googleusercontent.com`;
  const googleClientSecret = `GOCSPX-gate-a3-ci-${nonce}`;
  return {
    CI_AUTH_FIXTURE_ACTIVE: "1",
    CI_AUTH_FIXTURE_LOCAL_TEST: "1",
    CI_AUTH_FIXTURE_MODE: "1",
    CI_AUTH_FIXTURE_NO_REGENERATION: "1",
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256: createHash("sha256")
      .update(googleClientId)
      .digest("hex"),
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256: createHash("sha256")
      .update(googleClientSecret)
      .digest("hex"),
    CI_AUTH_FIXTURE_SESSION_CLASSIFICATION:
      "PRODUCTION_INELIGIBLE_SYNTHETIC_AUTH",
    CI_AUTH_FIXTURE_SESSION_ID: "app-event-writer-fixture-session-001",
    CI_AUTH_FIXTURE_SESSION_NONCE: "app-event-writer-fixture-nonce-001",
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: commitSha,
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: treeSha,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
  };
}

function appEventWriterBaseEnvironment() {
  return Object.fromEntries(
    ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR"]
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
}

function realCandidateDatabaseState(environment) {
  const current = readCertificationDatabaseLifecycle({
    repositoryRoot,
    environment,
  });
  return {
    executionClass: "real-candidate",
    certificationId: current.binding.certificationId,
    candidate: {
      id: current.binding.candidateId,
      commitSha: current.binding.candidateCommitSha,
      treeSha: current.binding.candidateTreeSha,
    },
    databaseLifecycle: current.binding,
  };
}

function runAppEventWriterFixture(mode, environment) {
  const child = spawnSync(
    "npx",
    [
      "ts-node",
      "--transpile-only",
      "--compiler-options",
      '{"module":"CommonJS","moduleResolution":"node"}',
      "-r",
      "tsconfig-paths/register",
      appEventWriterFixtureSource,
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...environment,
        APP_EVENT_WRITER_FIXTURE_MODE: mode,
        NODE_OPTIONS: "--conditions=react-server",
        NODE_PATH: path.join(
          repositoryRoot,
          "node_modules/next/dist/compiled",
        ),
      },
      encoding: "utf8",
    },
  );
  assert.equal(
    child.status,
    0,
    `actual AppEvent writer fixture ${mode} did not pass`,
  );
  assert.match(
    child.stdout,
    new RegExp(
      `APP_EVENT_WRITER_FIXTURE_RESULT .*"mode":"${mode}".*"passed":true`,
    ),
  );
}

function runtimeProductServerEnvironment({ ownership, databaseUrl }) {
  const authEnvironment = appEventWriterAuthEnvironment();
  const baseEnvironment = {
    ...appEventWriterBaseEnvironment(),
    ...authEnvironment,
    CERTIFICATION_RUNTIME_STAGE_ATTEMPT: String(ownership.runtimeAttempt),
    PRODUCTION_CERTIFICATION_ID: ownership.certificationId,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: ownership.candidateId,
    VERCEL_ENV: "preview",
  };
  const manifest = {
    candidateIdentifier: ownership.candidateId,
    source: { commitSha, treeSha },
    build: {
      applicationEnvironment: "staging",
      nextBuildId: "app-event-writer-fixture-build-001",
      authFixtureContinuity:
        authFixtureSession.validateProjectedFixtureEnvironment(
          baseEnvironment,
          { commitSha, treeSha },
        ),
    },
    artifact: { sha256: "a".repeat(64) },
  };
  const projected = projectArtifactProductServerEnvironment({
    repositoryRoot,
    baseEnvironment,
    manifest,
    databaseUrl,
  });
  assert.equal(projected.CERTIFICATION_ENVIRONMENT_STAGE, "artifact-product-server");
  assert.equal(
    projected.CERTIFICATION_RUNTIME_STAGE_ATTEMPT,
    String(ownership.runtimeAttempt),
  );
  assert.equal(projected.PRODUCTION_CERTIFICATION_ID, ownership.certificationId);
  assert.equal(
    projected.PRODUCTION_EVIDENCE_CANDIDATE_ID,
    ownership.candidateId,
  );
  assert.equal(projected.PRODUCTION_ARTIFACT_COMMIT_SHA, commitSha);
  assert.equal(projected.PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA, treeSha);
  assert.equal(projected.DATABASE_URL, databaseUrl);
  return projected;
}

function browserOwnerWriterEnvironment({ environment, ownership, databaseUrl }) {
  const authEnvironment = appEventWriterAuthEnvironment();
  const evidenceRoot = environment.CERTIFICATION_EVIDENCE_ROOT;
  const stageInputs = {
    ...authEnvironment,
    CERTIFICATION_ENVIRONMENT_STAGE: "browser-owners",
    DATABASE_URL: databaseUrl,
    PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
    PRODUCTION_CERTIFICATION_ID: ownership.certificationId,
    REQUIRED_TEST_ARTIFACT_SHA256: "a".repeat(64),
    REQUIRED_TEST_BROWSER_OWNER_ID: "pro-visual",
    REQUIRED_TEST_BUILD_ID: "app-event-writer-fixture-build-001",
    REQUIRED_TEST_EVIDENCE_PATH: path.join(evidenceRoot, "browser-evidence.json"),
    REQUIRED_TEST_GATE_ID: "app-event-writer-fixture-gate",
    REQUIRED_TEST_HARNESS_SOURCE_SHA256: "b".repeat(64),
    REQUIRED_TEST_HARNESS_VERSION: "1",
    REQUIRED_TEST_RELEASE_CANDIDATE_ID: ownership.candidateId,
    REQUIRED_TEST_RELEASE_ENVIRONMENT: "staging",
    REQUIRED_TEST_REPORT_PATH: path.join(evidenceRoot, "browser-report.json"),
    REQUIRED_TEST_RUN_NONCE: "c".repeat(32),
    REQUIRED_TEST_SOURCE_COMMIT_SHA: commitSha,
    REQUIRED_TEST_SOURCE_TREE_SHA: treeSha,
    REQUIRED_TEST_STAGE_ATTEMPT: String(ownership.browserAttempt),
    REQUIRED_TEST_START_MARKER_PATH: path.join(
      evidenceRoot,
      "browser-start-marker.json",
    ),
  };
  const projected = projectCertificationChildEnvironment({
    repositoryRoot,
    baseEnvironment: appEventWriterBaseEnvironment(),
    stage: "browser-owners",
    profileId: "development-browser-owner",
    stageInputs,
  }).environment;
  assert.equal(projected.CERTIFICATION_ENVIRONMENT_STAGE, "browser-owners");
  assert.equal(projected.REQUIRED_TEST_BROWSER_OWNER_ID, "pro-visual");
  assert.equal(
    projected.REQUIRED_TEST_STAGE_ATTEMPT,
    String(ownership.browserAttempt),
  );
  assert.equal(projected.DATABASE_URL, databaseUrl);
  return projected;
}

async function realRuntimeAttributionCoverage(adminUrl) {
  const positiveFixture = fixture({
    id: `real-runtime-attribution-${Date.now()}`,
    adminUrl,
  });
  let positiveClient = null;
  try {
    const plan = await planCertificationDatabase({
      repositoryRoot,
      environment: positiveFixture.environment,
      nonce: randomUUID().replaceAll("-", ""),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: positiveFixture.environment,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: positiveFixture.environment,
    });
    await bindAllStages(positiveFixture.environment, null);
    const ownership = appEventOwnership(positiveFixture.environment);
    const databaseProjection = resolveCertificationDatabaseStageEnvironment({
      repositoryRoot,
      environment: positiveFixture.environment,
      state: realCandidateDatabaseState(positiveFixture.environment),
      stage: "runtime-smoke",
    });
    const runtimeEnvironment = runtimeProductServerEnvironment({
      ownership,
      databaseUrl: databaseProjection.environment.DATABASE_URL,
    });
    runAppEventWriterFixture("ordinary-production", {
      ...appEventWriterBaseEnvironment(),
      CERTIFICATION_ENVIRONMENT_STAGE: "production",
      DATABASE_URL: databaseProjection.environment.DATABASE_URL,
      NODE_ENV: "production",
    });
    const missingRuntimeEnvironment = { ...runtimeEnvironment };
    delete missingRuntimeEnvironment.CERTIFICATION_RUNTIME_STAGE_ATTEMPT;
    runAppEventWriterFixture(
      "missing-runtime-binding",
      missingRuntimeEnvironment,
    );
    runAppEventWriterFixture("trusted-facades", runtimeEnvironment);
    runAppEventWriterFixture("runtime", runtimeEnvironment);
    runAppEventWriterFixture(
      "browser",
      browserOwnerWriterEnvironment({
        environment: positiveFixture.environment,
        ownership,
        databaseUrl: databaseProjection.environment.DATABASE_URL,
      }),
    );
    positiveClient = new Client({
      connectionString: targetDatabaseUrl(adminUrl, plan.evidence.database.name),
    });
    positiveClient.on("error", () => {});
    await positiveClient.connect();

    let ordinal = 0;
    const rowsFor = ({
      eventType,
      count,
      stage = "runtime-smoke",
      stageAttempt = ownership.runtimeAttempt,
      browserOwnerId = null,
    }) =>
      Array.from({ length: count }, () =>
        appEventRow(ownership, {
          id: `runtime-attribution-${String(++ordinal).padStart(3, "0")}`,
          eventType,
          stage,
          stageAttempt,
          browserOwnerId,
          createdAt: new Date(Date.UTC(2026, 7, 27, 3, 38, ordinal)).toISOString(),
        }),
      );
    const browserRows = [
      ...rowsFor({
        eventType: "export_clicked",
        count: 1,
        stage: "browser-owners",
        stageAttempt: ownership.browserAttempt,
        browserOwnerId: "pro-visual",
      }),
      ...[
        ["floor-plan-upload", 19],
        ["guest-save", 20],
        ["cart", 32],
        ["my-designs", 40],
        ["pro-visual", 68],
      ].flatMap(([browserOwnerId, count]) =>
        rowsFor({
          eventType: "first_run_activation_step_completed",
          count,
          stage: "browser-owners",
          stageAttempt: ownership.browserAttempt,
          browserOwnerId,
        }),
      ),
      ...[
        ["guest-save", 10],
        ["floor-plan-upload", 11],
        ["cart", 16],
        ["my-designs", 16],
        ["pro-visual", 32],
      ].flatMap(([browserOwnerId, count]) =>
        rowsFor({
          eventType: "landing_viewed",
          count,
          stage: "browser-owners",
          stageAttempt: ownership.browserAttempt,
          browserOwnerId,
        }),
      ),
      ...rowsFor({
        eventType: "share_link_opened",
        count: 20,
        stage: "browser-owners",
        stageAttempt: ownership.browserAttempt,
        browserOwnerId: "public-share",
      }),
      ...rowsFor({
        eventType: "upgrade_clicked",
        count: 8,
        stage: "browser-owners",
        stageAttempt: ownership.browserAttempt,
        browserOwnerId: "pro-visual",
      }),
    ];
    assert.equal(browserRows.length, 293);
    await insertAppEventRows(positiveClient, browserRows);

    const inspectionAdapter = new CertificationPostgresAdapter({
      adminUrl,
      repositoryRoot,
    });
    const inspection = inspectCertificationAppEvents(
      await inspectionAdapter.appEventRows(plan.evidence.database.name),
      ownership,
    );
    assert.equal(inspection.valid, true);
    assert.equal(inspection.evidence.rowCount, 313);
    assert.deepEqual(inspection.evidence.classifications, { owned: 313 });
    assert.equal(inspection.evidence.allRunBound, true);
    assert.equal(inspection.evidence.prohibitedPrivateDataCount, 0);
    assert.equal(
      inspection.evidence.aggregates
        .filter((aggregate) => aggregate.stage === "runtime-smoke")
        .reduce((count, aggregate) => count + aggregate.count, 0),
      19,
    );
    assert.equal(
      inspection.evidence.aggregates
        .filter((aggregate) => aggregate.stage === "browser-owners")
        .reduce((count, aggregate) => count + aggregate.count, 0),
      294,
    );

    await positiveClient.end();
    positiveClient = null;
    const final = await verifyFinalCertificationDatabase({
      repositoryRoot,
      environment: positiveFixture.environment,
      appEventOwnership: ownership,
    });
    assert.equal(final.evidence.currentState, "final-empty-verified");
    assert.equal(final.evidence.inventories.final.totalRows, 0);
    assert.equal(final.evidence.sessions.final.count, 0);
    assert.equal(final.evidence.appEventCleanup.inspection.rowCount, 313);
    assert.equal(final.evidence.appEventCleanup.cleanup.removedCount, 313);
    assert.equal(final.evidence.appEventCleanup.cleanup.remainingCount, 0);
    assert.ok(
      final.evidence.events.findIndex((event) => event.mode === "app-event-evidence") <
        final.evidence.events.findIndex((event) => event.mode === "app-event-cleanup"),
    );
    await dropCertificationDatabase({
      repositoryRoot,
      environment: positiveFixture.environment,
    });
    const absent = await verifyCertificationDatabaseAbsent({
      repositoryRoot,
      environment: positiveFixture.environment,
    });
    assert.equal(absent.evidence.currentState, "absence-verified");
    assert.equal(absent.evidence.server.targetExists, false);
  } finally {
    if (positiveClient) await positiveClient.end().catch(() => {});
    if (exists(positiveFixture.lifecyclePath)) {
      const current = readCertificationDatabaseLifecycle({
        repositoryRoot,
        environment: positiveFixture.environment,
      });
      if (!new Set(["absence-verified", "abort-absence-verified"]).has(
        current.evidence.currentState,
      )) {
        await abortCertificationDatabase({
          repositoryRoot,
          environment: positiveFixture.environment,
          originalFailure: {
            classification: "QUALIFICATION_FIXTURE_FAILURE",
            consumedSubstantiveGate: false,
            stage: "runtime-attribution-positive-finally",
          },
        });
      }
    }
    rmSync(positiveFixture.root, { recursive: true, force: true });
  }

  const negativeFixture = fixture({
    id: `real-runtime-attribution-negative-${Date.now()}`,
    adminUrl,
  });
  let negativeClient = null;
  try {
    const plan = await planCertificationDatabase({
      repositoryRoot,
      environment: negativeFixture.environment,
      nonce: randomUUID().replaceAll("-", ""),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: negativeFixture.environment,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: negativeFixture.environment,
    });
    await bindAllStages(negativeFixture.environment, null);
    const ownership = appEventOwnership(negativeFixture.environment);
    const negativeRows = [
      appEventRow(ownership, {
        id: "runtime-negative-unbound",
        rowOverrides: { binding: null },
      }),
      appEventRow(
        { ...ownership, certificationId: "certification-foreign" },
        { id: "runtime-negative-foreign-certification" },
      ),
      appEventRow(
        { ...ownership, candidateId: "candidate-foreign" },
        { id: "runtime-negative-foreign-candidate" },
      ),
      appEventRow(ownership, {
        id: "runtime-negative-wrong-attempt",
        stageAttempt: ownership.runtimeAttempt + 1,
      }),
      appEventRow(ownership, {
        id: "runtime-negative-malformed",
        bindingOverrides: { runIdentitySha256: "0".repeat(64) },
      }),
      appEventRow(ownership, {
        id: "runtime-negative-wrong-writer",
        rowOverrides: {
          binding: appEventBinding(ownership, {
            writerClassification: "browser-server-action",
          }),
        },
      }),
      appEventRow(ownership, {
        id: "runtime-negative-wrong-owner",
        stage: "browser-owners",
        stageAttempt: ownership.browserAttempt,
        browserOwnerId: "foreign-owner",
      }),
      appEventRow(ownership, {
        id: "runtime-negative-private",
        rowOverrides: { prohibitedPrivateData: true },
      }),
    ];
    negativeClient = new Client({
      connectionString: targetDatabaseUrl(adminUrl, plan.evidence.database.name),
    });
    negativeClient.on("error", () => {});
    await negativeClient.connect();
    await insertAppEventRows(negativeClient, negativeRows);
    await negativeClient.end();
    negativeClient = null;

    await assert.rejects(
      verifyFinalCertificationDatabase({
        repositoryRoot,
        environment: negativeFixture.environment,
        appEventOwnership: ownership,
      }),
      /attribution was foreign, unbound, malformed/,
    );
    const failed = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: negativeFixture.environment,
    });
    assert.equal(failed.evidence.currentState, "failed");
    assert.equal(failed.evidence.appEventCleanup.status, "evidence-retained");
    assert.equal(failed.evidence.appEventCleanup.inspection.valid, false);
    assert.equal(failed.evidence.appEventCleanup.inspection.rowCount, 8);
    assert.equal(failed.evidence.appEventCleanup.cleanup, null);
    assert.equal(failed.evidence.appEventCleanup.inspection.removableRowCount, 0);
    const failedSnapshot = retainCertificationDatabaseFailureSnapshot({
      repositoryRoot,
      environment: negativeFixture.environment,
      attempt: 1,
    });
    const aborted = await abortCertificationDatabase({
      repositoryRoot,
      environment: negativeFixture.environment,
      originalFailure: {
        classification: "DATABASE_LIFECYCLE_FAILURE",
        consumedSubstantiveGate: true,
        stage: "database:verify-final",
        attempt: 1,
        failedStateSha256: "a".repeat(64),
        evidenceReferences: { "database-final-failure": failedSnapshot },
      },
    });
    assert.equal(aborted.evidence.currentState, "abort-absence-verified");
    assert.equal(aborted.evidence.cleanup.finalEmptyVerified, false);
    assert.equal(aborted.evidence.cleanup.failedRunRehabilitated, false);
    assert.equal(aborted.evidence.server.targetExists, false);
  } finally {
    if (negativeClient) await negativeClient.end().catch(() => {});
    if (exists(negativeFixture.lifecyclePath)) {
      const current = readCertificationDatabaseLifecycle({
        repositoryRoot,
        environment: negativeFixture.environment,
      });
      if (!new Set(["absence-verified", "abort-absence-verified"]).has(
        current.evidence.currentState,
      )) {
        await abortCertificationDatabase({
          repositoryRoot,
          environment: negativeFixture.environment,
          originalFailure: {
            classification: "QUALIFICATION_FIXTURE_FAILURE",
            consumedSubstantiveGate: false,
            stage: "runtime-attribution-negative-finally",
          },
        });
      }
    }
    rmSync(negativeFixture.root, { recursive: true, force: true });
  }
}

async function realDisposableDatabaseCoverage() {
  const username = encodeURIComponent(userInfo().username);
  const adminUrl =
    process.env.CERTIFICATION_TEST_DATABASE_ADMIN_URL?.trim() ||
    `postgresql://${username}@127.0.0.1:5432/postgres`;
  await realRuntimeAttributionCoverage(adminUrl);
  const realFixture = fixture({ id: `real-${Date.now()}`, adminUrl });
  let targetClient = null;
  let unrelatedClient = null;
  try {
    const plan = await planCertificationDatabase({
      repositoryRoot,
      environment: realFixture.environment,
      nonce: randomUUID().replaceAll("-", ""),
      qualificationFixture: true,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment: realFixture.environment,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment: realFixture.environment,
    });
    await bindAllStages(realFixture.environment, null);
    unrelatedClient = new Client({ connectionString: adminUrl });
    await unrelatedClient.connect();
    targetClient = new Client({
      connectionString: targetDatabaseUrl(adminUrl, plan.evidence.database.name),
    });
    targetClient.on("error", () => {});
    await targetClient.connect();
    await targetClient.query(
      `INSERT INTO "User" (id, email, "updatedAt") VALUES ($1, $2, NOW())`,
      ["database-lifecycle-fixture", "database-lifecycle-fixture@example.test"],
    );
    const ownership = appEventOwnership(realFixture.environment);
    const binding = appEventBinding(ownership);
    await targetClient.query(
      `INSERT INTO "AppEvent" (
         id, "eventType", meta, authority, producer, "verificationMethod",
         "provenanceVersion", "externalEventId", "createdAt"
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, 1, NULL, NOW())`,
      [
        "database-lifecycle-owned-app-event",
        "design_started",
        JSON.stringify({ certificationRunBinding: binding }),
        "BROWSER_AUTHORIZED_ANALYTICS",
        "PUBLIC_BROWSER_INGESTION",
        "PUBLIC_REQUEST",
      ],
    );
    await targetClient.query(
      `INSERT INTO "AppEvent" (
         id, "eventType", meta, authority, producer, "verificationMethod",
         "provenanceVersion", "externalEventId", "createdAt"
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, 1, NULL, NOW())`,
      [
        "database-lifecycle-private-app-event",
        "design_started",
        JSON.stringify({
          cookie: "raw-private-cookie-fixture-must-not-survive",
          certificationRunBinding: binding,
        }),
        "BROWSER_AUTHORIZED_ANALYTICS",
        "PUBLIC_BROWSER_INGESTION",
        "PUBLIC_REQUEST",
      ],
    );
    const inspectionAdapter = new CertificationPostgresAdapter({
      adminUrl,
      repositoryRoot,
    });
    const privateInspection = inspectCertificationAppEvents(
      await inspectionAdapter.appEventRows(plan.evidence.database.name),
      ownership,
    );
    assert.equal(privateInspection.valid, false);
    assert.equal(privateInspection.evidence.prohibitedPrivateDataCount, 1);
    assert.deepEqual(privateInspection.removableIds, []);
    assert.doesNotMatch(
      JSON.stringify(privateInspection.evidence),
      /raw-private-cookie-fixture-must-not-survive/,
    );
    await targetClient.query(`DELETE FROM "AppEvent" WHERE id = $1`, [
      "database-lifecycle-private-app-event",
    ]);
    await assert.rejects(
      verifyFinalCertificationDatabase({
        repositoryRoot,
        environment: realFixture.environment,
        appEventOwnership: ownership,
      }),
      /row, session, or stage-binding contract failed/,
    );
    const failed = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: realFixture.environment,
    });
    assert.equal(failed.evidence.inventories.final.totalRows, 1);
    assert.ok(failed.evidence.sessions.final.count >= 1);
    assert.equal(failed.evidence.appEventCleanup.inspection.rowCount, 1);
    assert.equal(failed.evidence.appEventCleanup.cleanup.removedCount, 1);
    const appEventCount = await targetClient.query(
      `SELECT COUNT(*)::int AS count FROM "AppEvent"`,
    );
    assert.equal(appEventCount.rows[0].count, 0);
    const failedSnapshot = retainCertificationDatabaseFailureSnapshot({
      repositoryRoot,
      environment: realFixture.environment,
      attempt: 1,
    });
    const aborted = await abortCertificationDatabase({
      repositoryRoot,
      environment: realFixture.environment,
      originalFailure: {
        classification: "DATABASE_LIFECYCLE_FAILURE",
        consumedSubstantiveGate: true,
        stage: "database:verify-final",
        attempt: 1,
        failedStateSha256: "f".repeat(64),
        evidenceReferences: { "database-final-failure": failedSnapshot },
      },
    });
    assert.equal(aborted.evidence.currentState, "abort-absence-verified");
    assert.equal(aborted.evidence.cleanup.finalEmptyVerified, false);
    assert.equal(aborted.evidence.inventories.abort.totalRows, 1);
    const unrelated = await unrelatedClient.query("SELECT current_database() AS database");
    assert.equal(unrelated.rows[0].database, "postgres");
    assert.equal(
      JSON.stringify(aborted.evidence).includes(adminUrl),
      false,
    );
  } finally {
    if (targetClient) await targetClient.end().catch(() => {});
    if (unrelatedClient) await unrelatedClient.end().catch(() => {});
    if (exists(realFixture.lifecyclePath)) {
      const current = readCertificationDatabaseLifecycle({
        repositoryRoot,
        environment: realFixture.environment,
      });
      if (!new Set(["absence-verified", "abort-absence-verified"]).has(
        current.evidence.currentState,
      )) {
        await abortCertificationDatabase({
          repositoryRoot,
          environment: realFixture.environment,
          originalFailure: {
            classification: "QUALIFICATION_FIXTURE_FAILURE",
            consumedSubstantiveGate: false,
            stage: "database-lifecycle-test-finally",
          },
        });
      }
    }
    rmSync(realFixture.root, { recursive: true, force: true });
  }
}

function exists(filePath) {
  try {
    readFileSync(filePath);
    return true;
  } catch {
    return false;
  }
}

await deterministicContractCoverage();
if (!process.argv.includes("--contract-only")) {
  await realDisposableDatabaseCoverage();
}
console.log(
  process.argv.includes("--contract-only")
    ? "Production certification database lifecycle contract coverage passed."
    : "Production certification database lifecycle contract and real disposable database coverage passed.",
);
