import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
  databaseAdminPolicy,
  databaseLifecycleEvidenceIssues,
  generateCertificationDatabaseName,
  migrationInventory,
  sealDatabaseLifecycleEvidence,
  targetDatabaseUrl,
} from "./production-certification-database-contract.mjs";
import {
  abortCertificationDatabase,
  bindCertificationDatabaseStage,
  certificationDatabaseStatus,
  databaseLifecycleCliErrorMessage,
  dropCertificationDatabase,
  planCertificationDatabase,
  provisionCertificationDatabase,
  readCertificationDatabaseLifecycle,
  verifyCertificationDatabaseAbsent,
  verifyFinalCertificationDatabase,
  verifyInitialCertificationDatabase,
} from "./production-certification-database-lifecycle.mjs";
import {
  certificationStateSha256,
  createCertificationState,
  replaceCertificationDatabaseLifecycle,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  reconcileCertificationDatabaseLifecycleState,
} from "./production-certification-real.mjs";
import {
  createSerializedTerminalLifecycle,
  nextCertificationCommand,
} from "./production-certification.mjs";
import {
  runCertificationDoctor,
  validateCertificationDatabaseDoctorShape,
} from "./production-certification-doctor.mjs";

const repositoryRoot = process.cwd();
const commitSha = git("HEAD");
const treeSha = git("HEAD^{tree}");
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
    releaseFailure = null,
    foreignStageRole = false,
    stageRoleCollisionOnCreate = false,
    onCreateStageRole = null,
  } = {}) {
    this.exists = exists;
    this.migrated = false;
    this.rows = [{ table: "User", count: 0 }];
    this.sessions = [];
    this.unrelatedSessions = [{ database: "postgres", pid: 9001 }];
    this.terminated = [];
    this.dropped = false;
    this.createFailure = createFailure;
    this.createFailureOutcome = createFailureOutcome;
    this.releaseFailure = releaseFailure;
    this.failFirstPostDropInspection = failFirstPostDropInspection;
    this.stageRole = null;
    this.foreignStageRole = foreignStageRole;
    this.stageRoleCollisionOnCreate = stageRoleCollisionOnCreate;
    this.onCreateStageRole = onCreateStageRole;
    this.stageRoleDropCount = 0;
  }

  async inspectAdmin() {
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

async function deterministicContractCoverage() {
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
    const final = await verifyFinalCertificationDatabase({
      repositoryRoot,
      environment: successFixture.environment,
      adapter: successAdapter,
    });
    assert.equal(final.evidence.currentState, "final-empty-verified");
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
    const aborted = await abortCertificationDatabase({
      repositoryRoot,
      environment: failureFixture.environment,
      adapter: failureAdapter,
      originalFailure: {
        classification: "PRODUCT_ASSERTION_FAILURE",
        consumedSubstantiveGate: true,
        stage: "browser-owners",
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

async function realDisposableDatabaseCoverage() {
  const username = encodeURIComponent(userInfo().username);
  const adminUrl =
    process.env.CERTIFICATION_TEST_DATABASE_ADMIN_URL?.trim() ||
    `postgresql://${username}@127.0.0.1:5432/postgres`;
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
    await assert.rejects(
      verifyFinalCertificationDatabase({
        repositoryRoot,
        environment: realFixture.environment,
      }),
      /row, session, or stage-binding contract failed/,
    );
    const failed = readCertificationDatabaseLifecycle({
      repositoryRoot,
      environment: realFixture.environment,
    });
    assert.equal(failed.evidence.inventories.final.totalRows, 1);
    assert.ok(failed.evidence.sessions.final.count >= 1);
    const aborted = await abortCertificationDatabase({
      repositoryRoot,
      environment: realFixture.environment,
      originalFailure: {
        classification: "PRODUCT_ASSERTION_FAILURE",
        consumedSubstantiveGate: true,
        stage: "database-real-fixture",
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
