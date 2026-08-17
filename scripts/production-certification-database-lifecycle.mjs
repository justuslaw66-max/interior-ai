import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { CertificationPostgresAdapter } from "./production-certification-database-adapter.mjs";
import {
  PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION,
  PRODUCTION_CERTIFICATION_DATABASE_LIFECYCLE_SCHEMA,
  PRODUCTION_CERTIFICATION_DATABASE_STAGE_BINDINGS,
  canonicalDatabaseNonce,
  canonicalJsonBytes,
  createDatabaseLifecycleBinding,
  databaseAdminPolicy,
  databaseLifecycleEvidenceIssues,
  generateCertificationDatabaseName,
  generateProvisionAuthorizationSha256,
  isCanonicalIdentity,
  isSourceSha,
  migrationInventory,
  sealDatabaseLifecycleEvidence,
  sha256,
  targetDatabaseUrl,
} from "./production-certification-database-contract.mjs";

const OWNER_PATHS = Object.freeze([
  "scripts/production-certification-database-contract.mjs",
  "scripts/production-certification-database-adapter.mjs",
  "scripts/production-certification-database-lifecycle.mjs",
]);

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`certification database lifecycle requires ${name}`);
  return value;
}

function git(repositoryRoot, args) {
  const child = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  if (child.status !== 0 || child.signal || child.error) {
    throw new Error("certification database source identity cannot be inspected");
  }
  return child.stdout.trim();
}

function implementationIdentity(repositoryRoot) {
  const files = OWNER_PATHS.map((relativePath) => ({
    path: relativePath,
    sha256: sha256(readFileSync(path.join(repositoryRoot, relativePath))),
  }));
  const policy = {
    version: PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION,
    approvedHosts: ["127.0.0.1", "::1"],
    approvedPorts: [5432],
    adminDatabase: "postgres",
    exactGeneratedTargetOnly: true,
    initialAndFinalEmptyRequired: true,
    genericRowDeletionProhibited: true,
    exactSessionAndDropOwnership: true,
    postDropAbsenceRequired: true,
  };
  return {
    ownerFiles: files,
    ownerAggregateSha256: sha256(canonicalJsonBytes(files)),
    policySha256: sha256(canonicalJsonBytes(policy)),
    generatorSha256: sha256(
      canonicalJsonBytes({
        version: PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION,
        prefix: "interior_ai_gate_a3_test_cert_",
        digestCharacters: 32,
        maximumIdentifierBytes: 63,
      }),
    ),
  };
}

function containedEvidencePath(repositoryRoot, environment) {
  const evidenceRoot = realpathSync(required(environment, "CERTIFICATION_EVIDENCE_ROOT"));
  const requested = path.resolve(
    required(environment, "CERTIFICATION_DATABASE_LIFECYCLE_PATH"),
  );
  const parent = realpathSync(path.dirname(requested));
  const absolutePath = path.join(parent, path.basename(requested));
  if (!parent.startsWith(`${evidenceRoot}${path.sep}`) && parent !== evidenceRoot) {
    throw new Error("database lifecycle evidence parent escapes its authorized root");
  }
  if (lstatSync(parent).isSymbolicLink()) {
    throw new Error("database lifecycle evidence parent cannot be a symbolic link");
  }
  if (!absolutePath.startsWith(`${evidenceRoot}${path.sep}`)) {
    throw new Error("database lifecycle evidence path escapes its authorized root");
  }
  return { evidenceRoot, absolutePath };
}

function descriptor(evidenceRoot, absolutePath) {
  const relativePath = path.relative(evidenceRoot, absolutePath).split(path.sep).join("/");
  return { path: relativePath, sha256: sha256(readFileSync(absolutePath)) };
}

function atomicWrite(filePath, value, { requireAbsent = false } = {}) {
  if (requireAbsent && existsSync(filePath)) {
    throw new Error("database lifecycle evidence target already exists");
  }
  const temporary = `${filePath}.tmp-${process.pid}`;
  const bytes = canonicalJsonBytes(value);
  let handle;
  try {
    handle = openSync(temporary, "wx", 0o600);
    writeFileSync(handle, bytes);
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    renameSync(temporary, filePath);
  } finally {
    if (handle !== undefined) closeSync(handle);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function readEvidence(filePath) {
  const metadata = lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("database lifecycle evidence is not a physical file");
  }
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("database lifecycle evidence is not canonical JSON");
  }
  const issues = databaseLifecycleEvidenceIssues(evidence);
  if (issues.length > 0) throw new Error(issues.join("; "));
  const generated = generateCertificationDatabaseName({
    certificationId: evidence.identity.certificationId,
    candidateId: evidence.identity.candidateId,
    candidateCommitSha: evidence.identity.candidateCommitSha,
    nonce: evidence.database.generatorNonce,
  });
  if (
    generated.name !== evidence.database.name ||
    generated.identitySha256 !== evidence.database.identitySha256 ||
    generated.nonceSha256 !== evidence.database.nonceSha256
  ) {
    throw new Error("database lifecycle generated identity is incoherent");
  }
  return evidence;
}

function withEvidenceLock(filePath, action) {
  const lockPath = `${filePath}.lock`;
  let lock;
  try {
    lock = openSync(lockPath, "wx", 0o600);
  } catch {
    throw new Error("database lifecycle evidence is locked by another owner");
  }
  return Promise.resolve()
    .then(action)
    .finally(() => {
      closeSync(lock);
      unlinkSync(lockPath);
    });
}

function event(state, mode, at, details) {
  return { state, mode, at, details };
}

function advance(evidence, mode, states, details, at = new Date().toISOString()) {
  const next = structuredClone(evidence);
  for (const state of states) next.events.push(event(state, mode, at, details));
  next.currentState = states.at(-1);
  next.updatedAt = at;
  next.complete = new Set(["absence-verified", "abort-absence-verified"]).has(
    next.currentState,
  );
  return sealDatabaseLifecycleEvidence(next);
}

export function redactDatabaseLifecycleFailure(value) {
  let message = value instanceof Error ? value.message : String(value);
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s\"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/:\/\/([^\s\"'/:]+):([^\s\"'@/]+)@/g, "://$1:[REDACTED]@")
    .replace(
      /\b(password|passwd|pwd)\s*[:=]\s*([^\s,;}\]]+)/gi,
      "[REDACTED_CREDENTIAL]",
    );
  return message.slice(0, 1_000);
}

export function databaseLifecycleCliErrorMessage(error) {
  return redactDatabaseLifecycleFailure(error);
}

function nextPersistedRevision(previous, candidate) {
  if (canonicalJsonBytes(previous).equals(canonicalJsonBytes(candidate))) return previous;
  const next = structuredClone(candidate);
  next.revision = previous.revision + 1;
  next.bindingHistory = [
    ...previous.bindingHistory,
    {
      revision: previous.revision,
      lifecycleState: previous.currentState,
      eventCount: previous.events.length,
      aggregateEvidenceSha256: previous.aggregateEvidenceSha256,
      fileSha256: sha256(canonicalJsonBytes(previous)),
    },
  ];
  return sealDatabaseLifecycleEvidence(next);
}

function failureEvidence(evidence, mode, error, details = {}) {
  const at = new Date().toISOString();
  const next = structuredClone(evidence);
  const failure = {
    mode,
    classification: details.classification ?? "DATABASE_LIFECYCLE_FAILURE",
    originalStage: details.originalStage ?? null,
    consumedSubstantiveGate: details.consumedSubstantiveGate ?? false,
    reason: redactDatabaseLifecycleFailure(error),
    at,
  };
  if (next.failure === null) next.failure = failure;
  else next.cleanupFailure = failure;
  return advance(next, mode, ["failed"], { failureRetained: true }, at);
}

function finalEmptyWasVerified(evidence) {
  return (
    evidence.events.some((entry) => entry.state === "final-empty-verified") &&
    evidence.inventories?.final?.totalRows === 0 &&
    evidence.sessions?.final?.count === 0
  );
}

function assertIdentity(evidence, environment) {
  const expected = {
    certificationId: required(environment, "PRODUCTION_CERTIFICATION_ID"),
    candidateId: required(environment, "PRODUCTION_EVIDENCE_CANDIDATE_ID"),
    candidateCommitSha: required(environment, "CERTIFICATION_EXPECTED_COMMIT_SHA"),
    candidateTreeSha: required(environment, "CERTIFICATION_EXPECTED_TREE_SHA"),
  };
  if (JSON.stringify(evidence.identity) !== JSON.stringify(expected)) {
    throw new Error("database lifecycle evidence belongs to another certification or candidate");
  }
}

function adapterFor(options, databaseName) {
  if (options.adapter) return options.adapter;
  databaseAdminPolicy(required(options.environment, "CERTIFICATION_DATABASE_ADMIN_URL"));
  return new CertificationPostgresAdapter({
    adminUrl: options.environment.CERTIFICATION_DATABASE_ADMIN_URL,
    repositoryRoot: options.repositoryRoot,
    databaseName,
  });
}

async function safeDatabaseAdapterCall(action) {
  try {
    return await action();
  } catch (error) {
    throw new Error(redactDatabaseLifecycleFailure(error));
  }
}

export async function planCertificationDatabase({
  repositoryRoot = process.cwd(),
  environment = process.env,
  adapter = null,
  nonce = null,
  qualificationFixture = false,
} = {}) {
  const paths = containedEvidencePath(repositoryRoot, environment);
  if (existsSync(paths.absolutePath)) {
    throw new Error("database lifecycle plan target must be absent");
  }
  const identity = {
    certificationId: required(environment, "PRODUCTION_CERTIFICATION_ID"),
    candidateId: required(environment, "PRODUCTION_EVIDENCE_CANDIDATE_ID"),
    candidateCommitSha: required(environment, "CERTIFICATION_EXPECTED_COMMIT_SHA"),
    candidateTreeSha: required(environment, "CERTIFICATION_EXPECTED_TREE_SHA"),
  };
  if (
    !isCanonicalIdentity(identity.certificationId) ||
    !isCanonicalIdentity(identity.candidateId) ||
    !isSourceSha(identity.candidateCommitSha) ||
    !isSourceSha(identity.candidateTreeSha)
  ) {
    throw new Error("database lifecycle plan identity is malformed");
  }
  const dirty = git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]);
  const qualificationDirtyAllowed =
    qualificationFixture && environment.CERTIFICATION_QUALIFICATION_MODE === "1";
  if (
    git(repositoryRoot, ["rev-parse", "HEAD"]) !== identity.candidateCommitSha ||
    git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]) !== identity.candidateTreeSha ||
    (dirty && !qualificationDirtyAllowed)
  ) {
    throw new Error("database lifecycle plan source is not the exact clean candidate");
  }
  const generatorNonce = canonicalDatabaseNonce(nonce ?? undefined);
  const database = generateCertificationDatabaseName({
    certificationId: identity.certificationId,
    candidateId: identity.candidateId,
    candidateCommitSha: identity.candidateCommitSha,
    nonce: generatorNonce,
  });
  const owner = adapterFor({ repositoryRoot, environment, adapter }, database.name);
  const inspected = await safeDatabaseAdapterCall(() =>
    owner.inspectAdmin(database.name));
  if (inspected.targetExists) {
    throw new Error("generated certification database must be absent during plan");
  }
  const createdAt = new Date().toISOString();
  const implementation = implementationIdentity(repositoryRoot);
  const evidence = sealDatabaseLifecycleEvidence({
    schema: PRODUCTION_CERTIFICATION_DATABASE_LIFECYCLE_SCHEMA,
    version: PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION,
    identity,
    contract: implementation,
    database: {
      classification: "disposable-production-certification-test-database",
      name: database.name,
      nameSha256: database.nameSha256,
      identitySha256: database.identitySha256,
      nonceSha256: database.nonceSha256,
      provisionAuthorizationSha256: generateProvisionAuthorizationSha256({
        identity,
        database,
      }),
      generatorNonce,
      generatorVersion: database.generatorVersion,
    },
    server: inspected,
    preflight: {
      policyPassed: true,
      targetAbsent: true,
      adminConnectionUsable: true,
      targetUrlConstructible: Boolean(
        adapter || targetDatabaseUrl(environment.CERTIFICATION_DATABASE_ADMIN_URL, database.name),
      ),
      checkedAt: createdAt,
    },
    migration: null,
    provisioning: {
      outcome: "not-attempted",
      ownershipRecoverable: false,
    },
    inventories: { initial: null, final: null, abort: null },
    sessions: { initial: null, final: null, release: null, abort: null },
    stageBindings: {
      requiredStages: [...PRODUCTION_CERTIFICATION_DATABASE_STAGE_BINDINGS],
      observed: [],
    },
    cleanup: null,
    failure: null,
    currentState: "planned",
    events: [event("planned", "plan", createdAt, { targetAbsent: true })],
    revision: 0,
    bindingHistory: [],
    createdAt,
    updatedAt: createdAt,
    complete: false,
  });
  atomicWrite(paths.absolutePath, evidence, { requireAbsent: true });
  const currentDescriptor = descriptor(paths.evidenceRoot, paths.absolutePath);
  return {
    evidence,
    descriptor: currentDescriptor,
    binding: createDatabaseLifecycleBinding(evidence, currentDescriptor),
  };
}

async function mutateLifecycle(options, action) {
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const environment = options.environment ?? process.env;
  const paths = containedEvidencePath(repositoryRoot, environment);
  return withEvidenceLock(paths.absolutePath, async () => {
    const evidence = readEvidence(paths.absolutePath);
    let persisted = evidence;
    assertIdentity(evidence, environment);
    const adapter = adapterFor(
      { repositoryRoot, environment, adapter: options.adapter },
      evidence.database.name,
    );
    let next;
    let actionError = null;
    const checkpoint = (checkpointEvidence) => {
      const prepared = nextPersistedRevision(persisted, checkpointEvidence);
      const issues = databaseLifecycleEvidenceIssues(prepared);
      if (issues.length > 0) throw new Error(issues.join("; "));
      if (prepared !== persisted) atomicWrite(paths.absolutePath, prepared);
      persisted = prepared;
      return persisted;
    };
    try {
      next = await action({
        evidence,
        adapter,
        repositoryRoot,
        environment,
        checkpoint,
      });
    } catch (error) {
      actionError = error;
      next = failureEvidence(persisted, options.mode ?? "lifecycle", error);
    }
    next = checkpoint(next);
    const result = {
      evidence: next,
      descriptor: descriptor(paths.evidenceRoot, paths.absolutePath),
      binding: createDatabaseLifecycleBinding(
        next,
        descriptor(paths.evidenceRoot, paths.absolutePath),
      ),
    };
    if (actionError) {
      throw Object.assign(new Error(redactDatabaseLifecycleFailure(actionError)), {
        databaseLifecycleResult: result,
      });
    }
    return result;
  });
}

export function readCertificationDatabaseLifecycle({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const paths = containedEvidencePath(repositoryRoot, environment);
  const evidence = readEvidence(paths.absolutePath);
  assertIdentity(evidence, environment);
  const currentDescriptor = descriptor(paths.evidenceRoot, paths.absolutePath);
  return {
    evidence,
    descriptor: currentDescriptor,
    binding: createDatabaseLifecycleBinding(evidence, currentDescriptor),
  };
}

export async function provisionCertificationDatabase(options = {}) {
  return mutateLifecycle({ ...options, mode: "provision" }, async ({ evidence, adapter, repositoryRoot, checkpoint }) => {
    if (evidence.currentState !== "planned") {
      throw new Error("database provision requires a planned absent target");
    }
    const inspected = await adapter.inspectAdmin(evidence.database.name);
    if (inspected.targetExists) {
      throw new Error("generated certification database appeared after preflight");
    }
    const authorized = structuredClone(evidence);
    authorized.provisioning = {
      outcome: "authorized",
      ownershipRecoverable: true,
    };
    let current = advance(authorized, "provision", ["create-authorized"], {
      targetAbsentImmediatelyBeforeCreate: true,
      provisionAuthorizationSha256: evidence.database.provisionAuthorizationSha256,
    });
    current = checkpoint(current);
    try {
      await adapter.createDatabase(evidence.database.name);
      current = structuredClone(current);
      current.provisioning = {
        outcome: "created",
        ownershipRecoverable: true,
      };
      current = advance(current, "provision", ["provisioned"], {
        created: true,
        recoveredAfterAmbiguousCreate: false,
        provisionAuthorizationSha256: evidence.database.provisionAuthorizationSha256,
      });
      current = checkpoint(current);
      adapter.deployMigrations(evidence.database.name);
      const migrations = migrationInventory(repositoryRoot);
      const applied = await adapter.migrationNames(evidence.database.name);
      if (
        migrations.count !== 43 ||
        JSON.stringify(applied) !==
          JSON.stringify(migrations.migrations.map((migration) => migration.id))
      ) {
        throw new Error("target database did not receive the exact 43 migrations");
      }
      const next = structuredClone(current);
      next.migration = {
        owner: "prisma-migrate-deploy",
        count: migrations.count,
        sourceAggregateSha256: migrations.aggregateSha256,
        appliedNamesSha256: sha256(canonicalJsonBytes(applied)),
        targetIdentitySha256: evidence.database.identitySha256,
      };
      return advance(next, "provision", ["migrated"], {
        migrationCount: migrations.count,
        targetVerified: true,
      });
    } catch (error) {
      if (current.currentState === "create-authorized") {
        const afterError = await adapter.inspectAdmin(evidence.database.name);
        if (
          afterError.targetExists &&
          error?.databaseCreateOutcome !== "not-created"
        ) {
          current = structuredClone(current);
          current.provisioning = {
            outcome: "ambiguous-create-recovered",
            ownershipRecoverable: true,
          };
          current = advance(current, "provision", ["provisioned"], {
            created: true,
            recoveredAfterAmbiguousCreate: true,
            provisionAuthorizationSha256:
              evidence.database.provisionAuthorizationSha256,
          });
          current = checkpoint(current);
        } else if (error?.databaseCreateOutcome === "not-created") {
          current = structuredClone(current);
          current.provisioning = {
            outcome: "foreign-collision",
            ownershipRecoverable: false,
          };
        }
      }
      return failureEvidence(current, "provision", error);
    }
  }).then((result) => {
    if (result.evidence.currentState === "failed") {
      throw Object.assign(new Error(result.evidence.failure.reason), {
        databaseLifecycleResult: result,
      });
    }
    return result;
  });
}

function rowInventory(rows) {
  const ordered = [...rows].sort((left, right) => left.table.localeCompare(right.table));
  return {
    applicationTableCount: ordered.length,
    totalRows: ordered.reduce((total, row) => total + row.count, 0),
    tables: ordered,
    aggregateSha256: sha256(canonicalJsonBytes(ordered)),
  };
}

export async function verifyInitialCertificationDatabase(options = {}) {
  return mutateLifecycle({ ...options, mode: "verify-initial" }, async ({ evidence, adapter }) => {
    if (evidence.currentState !== "migrated") {
      throw new Error("initial database verification requires completed migrations");
    }
    const rows = rowInventory(await adapter.applicationRows(evidence.database.name));
    const sessions = await adapter.targetSessions(evidence.database.name);
    const next = structuredClone(evidence);
    next.inventories.initial = rows;
    next.sessions.initial = { count: sessions.length, sessions };
    if (rows.totalRows !== 0 || sessions.length !== 0) {
      return failureEvidence(next, "verify-initial", new Error(
        "initial certification database is not empty or has unexplained sessions",
      ));
    }
    return advance(
      next,
      "verify-initial",
      ["initial-empty-verified", "active"],
      { applicationTableCount: rows.applicationTableCount, totalRows: 0, sessionCount: 0 },
    );
  }).then((result) => {
    if (result.evidence.currentState === "failed") {
      throw Object.assign(new Error(result.evidence.failure.reason), {
        databaseLifecycleResult: result,
      });
    }
    return result;
  });
}

export async function bindCertificationDatabaseStage(options = {}) {
  return mutateLifecycle({ ...options, mode: "bind-stage" }, async ({ evidence }) => {
    const stage = options.stage;
    if (
      evidence.currentState !== "active" ||
      !PRODUCTION_CERTIFICATION_DATABASE_STAGE_BINDINGS.includes(stage)
    ) {
      throw new Error("database stage binding is not permitted in the current lifecycle state");
    }
    const existing = evidence.stageBindings.observed.find(
      (binding) => binding.stage === stage,
    );
    if (existing) return evidence;
    const next = structuredClone(evidence);
    const boundAt = new Date().toISOString();
    next.stageBindings.observed.push({
      stage,
      databaseIdentitySha256: evidence.database.identitySha256,
      databaseNameSha256: evidence.database.nameSha256,
      boundAt,
    });
    next.stageBindings.observed.sort((left, right) => left.stage.localeCompare(right.stage));
    return advance(next, "bind-stage", ["active"], {
      stage,
      databaseIdentitySha256: evidence.database.identitySha256,
      databaseNameSha256: evidence.database.nameSha256,
    }, boundAt);
  });
}

export async function verifyFinalCertificationDatabase(options = {}) {
  return mutateLifecycle({ ...options, mode: "verify-final" }, async ({ evidence, adapter }) => {
    if (evidence.currentState !== "active") {
      throw new Error("final database verification requires an active lifecycle");
    }
    const observedStages = new Set(
      evidence.stageBindings.observed.map((binding) => binding.stage),
    );
    const missing = evidence.stageBindings.requiredStages.filter(
      (stage) => !observedStages.has(stage),
    );
    const rows = rowInventory(await adapter.applicationRows(evidence.database.name));
    const sessions = await adapter.targetSessions(evidence.database.name);
    const next = structuredClone(evidence);
    next.inventories.final = rows;
    next.sessions.final = { count: sessions.length, sessions };
    if (rows.totalRows !== 0 || sessions.length !== 0 || missing.length !== 0) {
      return failureEvidence(
        next,
        "verify-final",
        new Error("final certification database row, session, or stage-binding contract failed"),
      );
    }
    return advance(next, "verify-final", ["final-empty-verified"], {
      applicationTableCount: rows.applicationTableCount,
      totalRows: 0,
      sessionCount: 0,
      stageBindingCount: observedStages.size,
    });
  }).then((result) => {
    if (result.evidence.currentState === "failed") {
      throw Object.assign(new Error(result.evidence.failure.reason), {
        databaseLifecycleResult: result,
      });
    }
    return result;
  });
}

export async function dropCertificationDatabase(options = {}) {
  return mutateLifecycle({ ...options, mode: "drop" }, async ({ evidence, adapter, checkpoint }) => {
    if (evidence.currentState !== "final-empty-verified") {
      throw new Error("normal database drop requires truthful final-empty verification");
    }
    const release = await adapter.terminateTargetSessions(evidence.database.name);
    if (release.remainingSessionCount !== 0) {
      throw new Error("target sessions remained after exact release");
    }
    const next = structuredClone(evidence);
    next.sessions.release = release;
    const cleared = checkpoint(advance(next, "drop", ["sessions-cleared"], release));
    const dropped = await adapter.dropDatabase(evidence.database.name);
    if (dropped.dropped !== true) {
      throw new Error("normal database drop did not remove the owned target");
    }
    const after = structuredClone(cleared);
    after.cleanup = { mode: "normal", drop: dropped, originalFailureRetained: false };
    return advance(after, "drop", ["dropped"], dropped);
  });
}

export async function verifyCertificationDatabaseAbsent(options = {}) {
  return mutateLifecycle({ ...options, mode: "verify-absent" }, async ({ evidence, adapter }) => {
    if (evidence.currentState !== "dropped") {
      throw new Error("post-drop absence verification requires a dropped lifecycle");
    }
    const inspected = await adapter.inspectAdmin(evidence.database.name);
    if (inspected.targetExists) {
      throw new Error("dropped certification database still exists");
    }
    return advance(evidence, "verify-absent", ["absence-verified"], {
      targetAbsent: true,
      cleanupMode: "normal",
    });
  });
}

export async function abortCertificationDatabase(options = {}) {
  return mutateLifecycle({ ...options, mode: "abort-cleanup" }, async ({ evidence, adapter, checkpoint }) => {
    if (evidence.currentState === "abort-absence-verified") return evidence;
    let next = structuredClone(evidence);
    let inspected = await adapter.inspectAdmin(evidence.database.name);
    const hasProvisionedOwnership = evidence.events.some(
      (entry) => entry.state === "provisioned" && entry.details?.created === true,
    );
    const hasDurableCreateAuthorization = evidence.events.some(
      (entry) =>
        entry.state === "create-authorized" &&
        entry.details?.targetAbsentImmediatelyBeforeCreate === true &&
        entry.details?.provisionAuthorizationSha256 ===
          evidence.database.provisionAuthorizationSha256,
    ) && evidence.provisioning?.ownershipRecoverable === true;
    if (inspected.targetExists && !hasProvisionedOwnership && !hasDurableCreateAuthorization) {
      throw new Error("abort cleanup refuses a target not durably created by this lifecycle");
    }
    if (
      inspected.targetExists &&
      evidence.currentState === "create-authorized" &&
      !hasProvisionedOwnership
    ) {
      next.provisioning = {
        outcome: "ambiguous-create-recovered-during-abort",
        ownershipRecoverable: true,
      };
      next = advance(next, "abort-cleanup", ["provisioned"], {
        created: true,
        recoveredAfterAmbiguousCreate: true,
        provisionAuthorizationSha256:
          evidence.database.provisionAuthorizationSha256,
      });
      next = checkpoint(next);
    }
    const finalEmptyVerified = finalEmptyWasVerified(next);
    next.failure ??= {
      mode: "abort-cleanup",
      classification: options.originalFailure?.classification ?? "CERTIFICATION_ABORTED",
      originalStage: options.originalFailure?.stage ?? null,
      consumedSubstantiveGate: options.originalFailure?.consumedSubstantiveGate ?? false,
      reason: "original certification failure retained",
      at: new Date().toISOString(),
    };
    if (next.currentState !== "abort-cleanup-in-progress") {
      next = advance(next, "abort-cleanup", ["abort-cleanup-in-progress"], {
        originalFailureRetained: true,
        finalEmptyVerified,
      });
      next = checkpoint(next);
    }
    inspected = await adapter.inspectAdmin(evidence.database.name);
    if (inspected.targetExists) {
      const rows = rowInventory(await adapter.applicationRows(evidence.database.name));
      const sessions = await adapter.targetSessions(evidence.database.name);
      next = structuredClone(next);
      next.inventories.abort ??= rows;
      next.sessions.abort ??= { count: sessions.length, sessions };
      next.inventories.abortLatest = rows;
      next.sessions.abortLatest = { count: sessions.length, sessions };
      next = checkpoint(next);
      const release = await adapter.terminateTargetSessions(evidence.database.name);
      next = structuredClone(next);
      next.sessions.abortRelease = release;
      next = checkpoint(next);
      if (release.remainingSessionCount !== 0) {
        throw new Error("abort cleanup could not release exact target sessions");
      }
      const drop = await adapter.dropDatabase(evidence.database.name);
      if (drop.dropped !== true) {
        throw new Error("abort cleanup did not drop the observed owned target");
      }
      next = structuredClone(next);
      next.cleanup = {
        mode: "abort",
        drop,
        targetAbsent: false,
        originalFailureRetained: true,
        finalEmptyVerified,
        failedRunRehabilitated: false,
      };
    } else {
      next = structuredClone(next);
      next.cleanup = {
        ...next.cleanup,
        mode: "abort",
        drop: next.cleanup?.drop ?? { dropped: false, alreadyAbsent: true },
        targetAbsent: true,
        originalFailureRetained: true,
        finalEmptyVerified,
        failedRunRehabilitated: false,
      };
    }
    next = advance(next, "abort-cleanup", ["abort-dropped"], {
      targetWasPresent: inspected.targetExists,
      successfulDropReceiptRetained: next.cleanup?.drop?.dropped === true,
    });
    next = checkpoint(next);
    const absent = await adapter.inspectAdmin(evidence.database.name);
    if (absent.targetExists) {
      throw new Error("abort cleanup did not prove target absence");
    }
    next = structuredClone(next);
    next.cleanup = {
      ...next.cleanup,
      mode: "abort",
      targetAbsent: true,
      originalFailureRetained: true,
      finalEmptyVerified,
      failedRunRehabilitated: false,
    };
    return advance(next, "abort-cleanup", ["abort-absence-verified"], {
      targetAbsent: true,
      failedRunRehabilitated: false,
    });
  });
}

export async function certificationDatabaseStatus(options = {}) {
  const current = readCertificationDatabaseLifecycle(options);
  const adapter = adapterFor(
    {
      repositoryRoot: options.repositoryRoot ?? process.cwd(),
      environment: options.environment ?? process.env,
      adapter: options.adapter,
    },
    current.evidence.database.name,
  );
  const inspected = await safeDatabaseAdapterCall(() =>
    adapter.inspectAdmin(current.evidence.database.name));
  const sessions = inspected.targetExists
    ? await safeDatabaseAdapterCall(() =>
        adapter.targetSessions(current.evidence.database.name))
    : [];
  return {
    schema: "interior-ai.production-certification-database-lifecycle-status.v1",
    mode: "read-only",
    lifecycleState: current.evidence.currentState,
    databaseName: current.evidence.database.name,
    databaseNameSha256: current.evidence.database.nameSha256,
    databaseIdentitySha256: current.evidence.database.identitySha256,
    targetExists: inspected.targetExists,
    sessionCount: sessions.length,
    hostClassification: inspected.hostClassification,
    port: inspected.port,
    serverVersion: inspected.serverVersion,
    serverVersionNumber: inspected.serverVersionNumber,
    roleClassification: inspected.roleClassification,
    canCreateDatabase: inspected.canCreateDatabase,
    evidenceSha256: current.descriptor.sha256,
  };
}

export function certificationDatabaseTargetUrl(environment, binding) {
  if (!binding?.databaseName || !binding?.databaseIdentitySha256) {
    throw new Error("certification database state binding is missing");
  }
  return targetDatabaseUrl(
    required(environment, "CERTIFICATION_DATABASE_ADMIN_URL"),
    binding.databaseName,
  );
}

async function cli() {
  const mode = process.argv[2];
  let result;
  if (mode === "plan") result = await planCertificationDatabase();
  else if (mode === "status") result = await certificationDatabaseStatus();
  else throw new Error("database lifecycle CLI mode is missing or unsupported");
  const safe = result.evidence
    ? {
        schema: result.evidence.schema,
        lifecycleState: result.evidence.currentState,
        databaseName: result.evidence.database.name,
        databaseNameSha256: result.evidence.database.nameSha256,
        evidenceSha256: result.descriptor.sha256,
      }
    : result;
  process.stdout.write(canonicalJsonBytes(safe));
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  cli().catch((error) => {
    console.error(databaseLifecycleCliErrorMessage(error));
    process.exitCode = 1;
  });
}
