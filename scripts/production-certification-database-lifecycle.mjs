import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";

import { CertificationPostgresAdapter } from "./production-certification-database-adapter.mjs";
import { inspectCertificationAppEvents } from "./production-certification-app-event-lifecycle.mjs";
import {
  AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS,
  AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
  PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION,
  PRODUCTION_CERTIFICATION_DATABASE_LIFECYCLE_SCHEMA,
  PRODUCTION_CERTIFICATION_DATABASE_STAGE_BINDINGS,
  STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS,
  STABLE_RUNTIME_SMOKE_DATABASE_PROFILE,
  canonicalDatabaseNonce,
  canonicalJsonBytes,
  createDatabaseLifecycleBinding,
  databaseLifecycleRequiredStages,
  databaseAdminPolicy,
  databaseLifecycleEvidenceIssues,
  generateCertificationDatabaseName,
  generateProvisionAuthorizationSha256,
  isCanonicalIdentity,
  isSha256,
  isSourceSha,
  migrationInventory,
  sealDatabaseLifecycleEvidence,
  sha256,
  targetDatabaseUrl,
} from "./production-certification-database-contract.mjs";

const OWNER_PATHS = Object.freeze([
  "lib/app-event-provenance.ts",
  "lib/app-events.ts",
  "lib/certification-app-event-binding.ts",
  "lib/trusted-app-event-core.ts",
  "scripts/production-certification-database-contract.mjs",
  "scripts/production-certification-database-adapter.mjs",
  "scripts/production-certification-app-event-lifecycle.mjs",
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

function atomicWrite(
  filePath,
  value,
  { requireAbsent = false, beforePublish } = {},
) {
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
    beforePublish?.({ filePath, temporaryPath: temporary });
    if (requireAbsent) {
      try {
        linkSync(temporary, filePath);
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new Error("database lifecycle evidence target already exists", {
            cause: error,
          });
        }
        throw error;
      }
    } else {
      renameSync(temporary, filePath);
    }
  } finally {
    if (handle !== undefined) closeSync(handle);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function stageRoleName(evidence) {
  return `interior_ai_cert_stage_${evidence.database.identitySha256.slice(0, 32)}`;
}

function authPreflightInvocationNonceSha256(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)
  ) {
    throw new Error("auth-session preflight invocation nonce is malformed");
  }
  return sha256(value);
}

function databaseLifecycleProfile({
  profile = "release-certification",
  authPreflightInvocationNonce = null,
} = {}) {
  if (profile === "release-certification") {
    if (authPreflightInvocationNonce !== null) {
      throw new Error("release database lifecycle cannot bind an auth-preflight nonce");
    }
    return {
      classification: "RELEASE_CERTIFICATION_DATABASE",
      authPreflightInvocationNonceSha256: null,
    };
  }
  if (profile === STABLE_RUNTIME_SMOKE_DATABASE_PROFILE) {
    if (authPreflightInvocationNonce !== null) {
      throw new Error("stable runtime-smoke database cannot bind an auth-preflight nonce");
    }
    return {
      classification: STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle,
      releaseCertificationClassification:
        STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.releaseCertification,
      integrationClassification:
        STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.integration,
      authPreflightInvocationNonceSha256: null,
    };
  }
  if (profile !== AUTH_SESSION_PREFLIGHT_DATABASE_STAGE) {
    throw new Error("database lifecycle profile is unknown or unsupported");
  }
  return {
    classification: AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.lifecycle,
    rehearsalClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.rehearsal,
    releaseCertificationClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.releaseCertification,
    integrationClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.integration,
    authPreflightInvocationNonceSha256:
      authPreflightInvocationNonceSha256(authPreflightInvocationNonce),
  };
}

function privateBindingPath(environment, evidence, { createParent = false } = {}) {
  const ownerRoot = realpathSync(
    required(environment, "CERTIFICATION_WORKTREE_ROOT"),
  );
  if (!lstatSync(ownerRoot).isDirectory() || lstatSync(ownerRoot).isSymbolicLink()) {
    throw new Error("certification database private binding root is not physical");
  }
  const parent = path.join(
    ownerRoot,
    ".database-bindings",
    evidence.identity.certificationId,
  );
  if (createParent) mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (!existsSync(parent)) {
    throw new Error("certification database private connection sidecar is missing");
  }
  const physicalParent = realpathSync(parent);
  if (
    (!physicalParent.startsWith(`${ownerRoot}${path.sep}`) &&
      physicalParent !== ownerRoot) ||
    !lstatSync(physicalParent).isDirectory() ||
    lstatSync(physicalParent).isSymbolicLink()
  ) {
    throw new Error("certification database private binding parent is not physical");
  }
  return path.join(
    physicalParent,
    `${evidence.database.identitySha256}.json`,
  );
}

function stageDatabaseUrl(adminUrl, databaseName, roleName, password) {
  const target = new URL(targetDatabaseUrl(adminUrl, databaseName));
  target.username = roleName;
  target.password = password;
  return target.toString();
}

function preparePrivateDatabaseBinding(environment, evidence, password) {
  const roleName = stageRoleName(evidence);
  const targetUrl = stageDatabaseUrl(
    required(environment, "CERTIFICATION_DATABASE_ADMIN_URL"),
    evidence.database.name,
    roleName,
    password,
  );
  const sidecar = {
    schema: "interior-ai.production-certification-database-private-binding.v1",
    certificationId: evidence.identity.certificationId,
    candidateId: evidence.identity.candidateId,
    candidateCommitSha: evidence.identity.candidateCommitSha,
    candidateTreeSha: evidence.identity.candidateTreeSha,
    databaseIdentitySha256: evidence.database.identitySha256,
    databaseNameSha256: evidence.database.nameSha256,
    roleName,
    targetUrl,
  };
  return {
    filePath: privateBindingPath(environment, evidence, { createParent: true }),
    sidecar,
    sidecarSha256: sha256(canonicalJsonBytes(sidecar)),
  };
}

function readPrivateDatabaseBinding(environment, evidence) {
  const filePath = privateBindingPath(environment, evidence);
  if (!existsSync(filePath)) {
    throw new Error("certification database private connection sidecar is missing");
  }
  const metadata = lstatSync(filePath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error("certification database private connection sidecar is invalid");
  }
  const bytes = readFileSync(filePath);
  let sidecar;
  try {
    sidecar = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("certification database private connection sidecar is invalid");
  }
  const roleName = stageRoleName(evidence);
  if (
    !bytes.equals(canonicalJsonBytes(sidecar)) ||
    evidence.privateBinding?.status !== "active" ||
    evidence.privateBinding?.classification !== "private-stage-login-no-admin" ||
    evidence.privateBinding?.roleNameSha256 !== sha256(roleName) ||
    evidence.privateBinding?.sidecarSha256 !== sha256(bytes) ||
    sidecar.schema !==
      "interior-ai.production-certification-database-private-binding.v1" ||
    sidecar.certificationId !== evidence.identity.certificationId ||
    sidecar.candidateId !== evidence.identity.candidateId ||
    sidecar.candidateCommitSha !== evidence.identity.candidateCommitSha ||
    sidecar.candidateTreeSha !== evidence.identity.candidateTreeSha ||
    sidecar.databaseIdentitySha256 !== evidence.database.identitySha256 ||
    sidecar.databaseNameSha256 !== evidence.database.nameSha256 ||
    sidecar.roleName !== roleName ||
    typeof sidecar.targetUrl !== "string"
  ) {
    throw new Error(
      "certification database private connection sidecar is stale or foreign",
    );
  }
  return { filePath, sidecar };
}

function inspectPrivateDatabaseBindingFile(environment, evidence) {
  let filePath;
  try {
    filePath = privateBindingPath(environment, evidence);
  } catch (error) {
    if (evidence.privateBinding === null) {
      return { status: "absent", filePath: null };
    }
    throw error;
  }
  if (!existsSync(filePath)) return { status: "absent", filePath };
  const metadata = lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    return { status: "foreign", filePath };
  }
  return {
    status:
      sha256(readFileSync(filePath)) === evidence.privateBinding?.sidecarSha256
        ? "owned"
        : "foreign",
    filePath,
  };
}

function removePrivateDatabaseBinding(environment, evidence) {
  const inspected = inspectPrivateDatabaseBindingFile(environment, evidence);
  if (inspected.status === "foreign") {
    throw new Error(
      "certification database private connection sidecar is foreign",
    );
  }
  if (inspected.status === "owned") rmSync(inspected.filePath);
  return {
    removed: inspected.status === "owned",
    alreadyAbsent: inspected.status === "absent",
  };
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
  next.complete = new Set([
    "absence-verified",
    "stable-absence-verified",
    "abort-absence-verified",
  ]).has(next.currentState);
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
    attempt: details.attempt ?? null,
    consumedSubstantiveGate: details.consumedSubstantiveGate ?? false,
    failedStateSha256: details.failedStateSha256 ?? null,
    evidenceReferences: portableOriginalEvidenceReferences(
      details.evidenceReferences,
    ),
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

function portableOriginalEvidenceReferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const references = {};
  for (const [name, descriptor] of Object.entries(value)) {
    if (
      !/^[a-z0-9][a-z0-9:-]*$/.test(name) ||
      !descriptor ||
      typeof descriptor !== "object" ||
      Array.isArray(descriptor) ||
      Object.keys(descriptor).sort().join("\n") !== "path\nsha256" ||
      typeof descriptor.path !== "string" ||
      path.isAbsolute(descriptor.path) ||
      descriptor.path.includes("\\") ||
      path.normalize(descriptor.path) !== descriptor.path ||
      descriptor.path === ".." ||
      descriptor.path.startsWith(`..${path.sep}`) ||
      typeof descriptor.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(descriptor.sha256)
    ) {
      throw new Error("original failure evidence references are malformed");
    }
    references[name] = { path: descriptor.path, sha256: descriptor.sha256 };
  }
  return references;
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
  profile = "release-certification",
  authPreflightInvocationNonce = null,
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
  const lifecycleProfile = databaseLifecycleProfile({
    profile,
    authPreflightInvocationNonce,
  });
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
    lifecycleProfile,
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
    privateBinding: null,
    provisioning: {
      outcome: "not-attempted",
      ownershipRecoverable: false,
    },
    inventories: { initial: null, final: null, abort: null },
    sessions: { initial: null, final: null, release: null, abort: null },
    stageBindings: {
      requiredStages: databaseLifecycleRequiredStages({ lifecycleProfile }),
      observed: [],
    },
    cleanup: null,
    appEventCleanup: null,
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
      next = failureEvidence(
        persisted,
        options.mode ?? "lifecycle",
        error,
        options.failureDetails,
      );
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
  return mutateLifecycle({ ...options, mode: "provision" }, async ({ evidence, adapter, repositoryRoot, environment, checkpoint }) => {
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
      const roleName = stageRoleName(evidence);
      const password = randomBytes(32).toString("hex");
      const stageRolePreflight = await adapter.inspectStageRole(roleName);
      if (stageRolePreflight.exists) {
        throw new Error(
          "certification database stage role must be absent before create authorization",
        );
      }
      current = structuredClone(current);
      current.privateBinding = {
        classification: "private-stage-login-no-admin",
        roleNameSha256: sha256(roleName),
        sidecarSha256: null,
        status: "create-authorized",
        roleCreation: {
          outcome: "authorized",
          ownershipRecoverable: true,
          roleAbsentImmediatelyBeforeCreate: true,
        },
        sidecarCreation: null,
      };
      current = checkpoint(current);
      let stageRole;
      try {
        stageRole = await adapter.createStageRole({
          databaseName: evidence.database.name,
          roleName,
          password,
        });
      } catch (error) {
        if (error?.stageRoleCreateOutcome === "not-created") {
          current = structuredClone(current);
          current.privateBinding = {
            ...current.privateBinding,
            status: "foreign-collision",
            roleCreation: {
              outcome: "foreign-collision",
              ownershipRecoverable: false,
              roleAbsentImmediatelyBeforeCreate: true,
            },
          };
          throw error;
        }
        const inspectedRole = await adapter.inspectStageRole(roleName);
        if (inspectedRole.exists) {
          current = structuredClone(current);
          current.privateBinding = {
            ...current.privateBinding,
            status: "role-created",
            roleCreation: {
              outcome: "ambiguous-create-recovered",
              ownershipRecoverable: true,
              roleAbsentImmediatelyBeforeCreate: true,
            },
          };
          current = checkpoint(current);
        }
        throw error;
      }
      current = structuredClone(current);
      current.privateBinding = {
        ...current.privateBinding,
        status: "role-created",
        roleCreation: {
          outcome: "created",
          ownershipRecoverable: true,
          roleAbsentImmediatelyBeforeCreate: true,
        },
      };
      current = checkpoint(current);
      if (
        stageRole?.created !== true ||
        stageRole?.classification !== "stage-login-no-admin" ||
        stageRole?.adminCapabilities !== false
      ) {
        throw new Error("certification database stage role was not created safely");
      }
      const preparedSidecar = preparePrivateDatabaseBinding(
        environment,
        current,
        password,
      );
      if (existsSync(preparedSidecar.filePath)) {
        current = structuredClone(current);
        current.privateBinding = {
          ...current.privateBinding,
          sidecarSha256: preparedSidecar.sidecarSha256,
          status: "foreign-sidecar-collision",
          sidecarCreation: {
            outcome: "foreign-collision",
            ownershipRecoverable: false,
            sidecarAbsentImmediatelyBeforeCreate: false,
          },
        };
        throw new Error(
          "certification database private connection sidecar already exists",
        );
      }
      current = structuredClone(current);
      current.privateBinding = {
        ...current.privateBinding,
        sidecarSha256: preparedSidecar.sidecarSha256,
        status: "sidecar-authorized",
        sidecarCreation: {
          outcome: "authorized",
          ownershipRecoverable: true,
          sidecarAbsentImmediatelyBeforeCreate: true,
        },
      };
      current = checkpoint(current);
      try {
        atomicWrite(preparedSidecar.filePath, preparedSidecar.sidecar, {
          requireAbsent: true,
          beforePublish: ({ filePath, temporaryPath }) =>
            options.testHooks?.beforePrivateSidecarPublish?.({
              filePath,
              temporaryPath,
              sidecarSha256: preparedSidecar.sidecarSha256,
            }),
        });
      } catch (error) {
        const inspectedSidecar = inspectPrivateDatabaseBindingFile(
          environment,
          current,
        );
        if (inspectedSidecar.status === "foreign") {
          current = structuredClone(current);
          current.privateBinding = {
            ...current.privateBinding,
            status: "foreign-sidecar-collision",
            sidecarCreation: {
              outcome: "foreign-collision",
              ownershipRecoverable: false,
              sidecarAbsentImmediatelyBeforeCreate: true,
            },
          };
        }
        throw error;
      }
      await options.testHooks?.afterPrivateSidecarWrite?.({
        filePath: preparedSidecar.filePath,
        sidecarSha256: preparedSidecar.sidecarSha256,
      });
      const next = structuredClone(current);
      next.privateBinding = {
        ...current.privateBinding,
        status: "active",
        sidecarCreation: {
          outcome: "created",
          ownershipRecoverable: true,
          sidecarAbsentImmediatelyBeforeCreate: true,
        },
      };
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

async function settledTargetSessions(adapter, databaseName) {
  let sessions = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    sessions = await adapter.targetSessions(databaseName);
    if (sessions.length === 0) return sessions;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return sessions;
}

export async function verifyInitialCertificationDatabase(options = {}) {
  return mutateLifecycle({ ...options, mode: "verify-initial" }, async ({ evidence, adapter }) => {
    if (evidence.currentState !== "migrated") {
      throw new Error("initial database verification requires completed migrations");
    }
    const rows = rowInventory(await adapter.applicationRows(evidence.database.name));
    const sessions = await settledTargetSessions(adapter, evidence.database.name);
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
  return mutateLifecycle({ ...options, mode: "bind-stage" }, async ({ evidence, adapter, environment }) => {
    const stage = options.stage;
    const requiredStages = databaseLifecycleRequiredStages(evidence);
    const authNonceSha256 =
      stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE
        ? authPreflightInvocationNonceSha256(
            options.authPreflightInvocationNonce,
          )
        : null;
    if (
      evidence.currentState !== "active" ||
      !requiredStages.includes(stage) ||
      (stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE &&
        authNonceSha256 !==
          evidence.lifecycleProfile?.authPreflightInvocationNonceSha256)
    ) {
      throw new Error("database stage binding is not permitted in the current lifecycle state");
    }
    const privateBinding = readPrivateDatabaseBinding(environment, evidence);
    const live = await adapter.inspectStageConnection({
      databaseUrl: privateBinding.sidecar.targetUrl,
      databaseName: evidence.database.name,
      roleName: stageRoleName(evidence),
    });
    if (
      live.exactTarget !== true ||
      live.exactRole !== true ||
      live.adminCapabilities !== false
    ) {
      throw new Error(
        "database stage binding did not prove the exact non-admin live target",
      );
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
      ...(stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE
        ? { authPreflightInvocationNonceSha256: authNonceSha256 }
        : {}),
      boundAt,
    });
    next.stageBindings.observed.sort((left, right) => left.stage.localeCompare(right.stage));
    return advance(next, "bind-stage", ["active"], {
      stage,
      databaseIdentitySha256: evidence.database.identitySha256,
      databaseNameSha256: evidence.database.nameSha256,
      ...(stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE
        ? { authPreflightInvocationNonceSha256: authNonceSha256 }
        : {}),
    }, boundAt);
  });
}

export async function verifyFinalCertificationDatabase(options = {}) {
  const failureDetails = {
    classification: "DATABASE_LIFECYCLE_FAILURE",
    originalStage: "database:verify-final",
    attempt: 1,
    consumedSubstantiveGate: true,
  };
  return mutateLifecycle({
    ...options,
    mode: "verify-final",
    failureDetails,
  }, async ({ evidence, adapter, checkpoint }) => {
    if (evidence.currentState !== "active") {
      throw new Error("final database verification requires an active lifecycle");
    }
    const observedStages = new Set(
      evidence.stageBindings.observed.map((binding) => binding.stage),
    );
    const missing = evidence.stageBindings.requiredStages.filter(
      (stage) => !observedStages.has(stage),
    );
    let current = structuredClone(evidence);
    if (
      evidence.lifecycleProfile.classification ===
      "RELEASE_CERTIFICATION_DATABASE"
    ) {
      const inspectedAppEvents = inspectCertificationAppEvents(
        await adapter.appEventRows(evidence.database.name),
        options.appEventOwnership,
      );
      const beforeCleanupRows = rowInventory(
        await adapter.applicationRows(evidence.database.name),
      );
      const beforeCleanupSessions = await adapter.targetSessions(
        evidence.database.name,
      );
      current.inventories.final = beforeCleanupRows;
      current.sessions.final = {
        count: beforeCleanupSessions.length,
        sessions: beforeCleanupSessions,
      };
      current.appEventCleanup = {
        owner: "final-database-app-event-evidence-and-cleanup",
        status: "evidence-retained",
        inspection: inspectedAppEvents.evidence,
        cleanup: null,
      };
      current = checkpoint(advance(current, "app-event-evidence", ["active"], {
        inspectedReadOnly: true,
        rowCount: inspectedAppEvents.evidence.rowCount,
        evidenceRetainedBeforeRemoval: true,
        aggregateSha256: inspectedAppEvents.evidence.aggregateSha256,
      }));
      if (!inspectedAppEvents.valid) {
        return failureEvidence(
          current,
          "verify-final",
          new Error(
            "final certification AppEvent attribution was foreign, unbound, malformed, or outside the permitted contract",
          ),
          failureDetails,
        );
      }
      const cleanup = inspectedAppEvents.removableIds.length === 0
        ? { removedCount: 0, remainingCount: 0, exactOwnedRowsOnly: true }
        : await adapter.deleteCertificationAppEvents({
            databaseName: evidence.database.name,
            ownership: options.appEventOwnership,
            expectedIds: inspectedAppEvents.removableIds,
            expectedRowsSha256:
              inspectedAppEvents.evidence.rowIdentitySha256,
          });
      current = structuredClone(current);
      current.appEventCleanup = {
        ...current.appEventCleanup,
        status: "owned-rows-removed",
        cleanup,
      };
      current = checkpoint(advance(current, "app-event-cleanup", ["active"], {
        removedCount: cleanup.removedCount,
        remainingCount: cleanup.remainingCount,
        exactOwnedRowsOnly: cleanup.exactOwnedRowsOnly,
        evidenceRetainedBeforeRemoval: true,
      }));
    }
    const rows = rowInventory(await adapter.applicationRows(evidence.database.name));
    const sessions = await settledTargetSessions(adapter, evidence.database.name);
    const next = structuredClone(current);
    next.inventories.final = rows;
    next.sessions.final = { count: sessions.length, sessions };
    if (rows.totalRows !== 0 || sessions.length !== 0 || missing.length !== 0) {
      return failureEvidence(
        next,
        "verify-final",
        new Error("final certification database row, session, or stage-binding contract failed"),
        failureDetails,
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

function assertStableRuntimeCompletionReady(evidence) {
  const observed = evidence.stageBindings.observed;
  if (
    evidence.currentState !== "active" ||
    evidence.lifecycleProfile.classification !==
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle ||
    observed.length !== 1 ||
    observed[0]?.stage !== "runtime-smoke"
  ) {
    throw new Error(
      "stable runtime-smoke database completion requires its exact active binding",
    );
  }
  return observed;
}

async function inspectStableRuntimeDatabase(evidence, adapter) {
  const rows = rowInventory(
    await adapter.applicationRows(evidence.database.name),
  );
  const sessions = await settledTargetSessions(adapter, evidence.database.name);
  if (sessions.length !== 0) {
    throw new Error("stable runtime-smoke database retained unexplained sessions");
  }
  return rows;
}

async function removeStableRuntimeDatabase({
  evidence,
  adapter,
  environment,
  checkpoint,
  current,
  rows,
}) {
  const release = await adapter.terminateTargetSessions(evidence.database.name);
  if (release.remainingSessionCount !== 0) {
    throw new Error("stable runtime-smoke could not release exact target sessions");
  }
  let next = structuredClone(current);
  next.sessions.release = release;
  next = checkpoint(
    advance(next, "stable-runtime-complete", ["stable-sessions-cleared"], release),
  );
  const drop = await adapter.dropDatabase(evidence.database.name);
  const stageRole = await adapter.dropStageRole(stageRoleName(evidence));
  if (drop.dropped !== true || stageRole.dropped !== true) {
    throw new Error("stable runtime-smoke did not remove its exact database and role");
  }
  removePrivateDatabaseBinding(environment, evidence);
  next = structuredClone(next);
  next.privateBinding = { ...next.privateBinding, status: "removed" };
  next.cleanup = {
    mode: "stable-runtime-smoke",
    drop,
    stageRole,
    targetAbsent: false,
    finalEmptyVerified: rows.totalRows === 0,
    originalFailureRetained: false,
  };
  return checkpoint(
    advance(next, "stable-runtime-complete", ["stable-dropped"], drop),
  );
}

async function proveStableRuntimeDatabaseAbsent(evidence, adapter) {
  const inspected = await adapter.inspectAdmin(evidence.database.name);
  if (inspected.targetExists) {
    throw new Error("stable runtime-smoke database remained after exact drop");
  }
  const next = structuredClone(evidence);
  next.cleanup.targetAbsent = true;
  return advance(
    next,
    "stable-runtime-complete",
    ["stable-absence-verified"],
    { targetAbsent: true, cleanupMode: "stable-runtime-smoke" },
  );
}

export async function completeStableRuntimeSmokeDatabase(options = {}) {
  return mutateLifecycle(
    { ...options, mode: "stable-runtime-complete" },
    async ({ evidence, adapter, environment, checkpoint }) => {
      const observed = assertStableRuntimeCompletionReady(evidence);
      const rows = await inspectStableRuntimeDatabase(evidence, adapter);
      const next = structuredClone(evidence);
      next.inventories.final = rows;
      next.sessions.final = { count: 0, sessions: [] };
      const inspected = checkpoint(
        advance(next, "stable-runtime-complete", ["stable-runtime-inspected"], {
          applicationTableCount: rows.applicationTableCount,
          totalRows: rows.totalRows,
          sessionCount: 0,
          stageBindingCount: observed.length,
        }),
      );
      const dropped = await removeStableRuntimeDatabase({
        evidence, adapter, environment, checkpoint, current: inspected, rows,
      });
      return proveStableRuntimeDatabaseAbsent(dropped, adapter);
    },
  );
}

export function retainCertificationDatabaseFailureSnapshot({
  repositoryRoot = process.cwd(),
  environment = process.env,
  attempt = 1,
} = {}) {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("database failure snapshot attempt is malformed");
  }
  const paths = containedEvidencePath(repositoryRoot, environment);
  const evidence = readEvidence(paths.absolutePath);
  assertIdentity(evidence, environment);
  if (
    evidence.currentState !== "failed" ||
    evidence.failure?.originalStage !== "database:verify-final" ||
    evidence.failure?.attempt !== attempt
  ) {
    throw new Error("database failure snapshot requires the exact failed verification");
  }
  const directory = path.join(paths.evidenceRoot, "database-failures");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink()) {
    throw new Error("database failure snapshot directory cannot be a symbolic link");
  }
  const filePath = path.join(
    directory,
    `verify-final-attempt-${String(attempt).padStart(3, "0")}.json`,
  );
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath);
    if (!existing.equals(canonicalJsonBytes(evidence))) {
      throw new Error("database failure snapshot target already contains other evidence");
    }
  } else {
    atomicWrite(filePath, evidence, { requireAbsent: true });
  }
  return descriptor(paths.evidenceRoot, filePath);
}

export async function dropCertificationDatabase(options = {}) {
  return mutateLifecycle({ ...options, mode: "drop" }, async ({ evidence, adapter, environment, checkpoint }) => {
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
    const stageRole = await adapter.dropStageRole(stageRoleName(evidence));
    if (stageRole.dropped !== true) {
      throw new Error("normal database drop did not remove the private stage role");
    }
    removePrivateDatabaseBinding(environment, evidence);
    const after = structuredClone(cleared);
    after.privateBinding = {
      ...after.privateBinding,
      status: "removed",
    };
    after.cleanup = {
      mode: "normal",
      drop: dropped,
      stageRole,
      originalFailureRetained: false,
    };
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
  return mutateLifecycle({ ...options, mode: "abort-cleanup" }, async ({ evidence, adapter, environment, checkpoint }) => {
    if (evidence.currentState === "abort-absence-verified") return evidence;
    let next = structuredClone(evidence);
    const finalEmptyVerified = finalEmptyWasVerified(next);
    const retainedOriginalFailure = options.originalFailure
      ? {
          mode: next.failure?.mode ?? "abort-cleanup",
          classification: options.originalFailure.classification,
          originalStage: options.originalFailure.stage,
          attempt: options.originalFailure.attempt ?? null,
          consumedSubstantiveGate:
            options.originalFailure.consumedSubstantiveGate ?? false,
          failedStateSha256:
            options.originalFailure.failedStateSha256 ?? null,
          evidenceReferences: portableOriginalEvidenceReferences(
            options.originalFailure.evidenceReferences,
          ),
          reason:
            next.failure?.reason ?? "original certification failure retained",
          at: next.failure?.at ?? new Date().toISOString(),
        }
      : null;
    if (
      next.failure &&
      retainedOriginalFailure &&
      next.failure.originalStage === "database:verify-final" &&
      (next.failure.classification !== retainedOriginalFailure.classification ||
        next.failure.originalStage !== retainedOriginalFailure.originalStage ||
        next.failure.attempt !== retainedOriginalFailure.attempt ||
        next.failure.consumedSubstantiveGate !==
          retainedOriginalFailure.consumedSubstantiveGate ||
        (next.failure.failedStateSha256 !== null &&
          next.failure.failedStateSha256 !==
            retainedOriginalFailure.failedStateSha256) ||
        (Object.keys(next.failure.evidenceReferences ?? {}).length > 0 &&
          JSON.stringify(next.failure.evidenceReferences) !==
            JSON.stringify(retainedOriginalFailure.evidenceReferences)))
    ) {
      throw new Error(
        "abort cleanup original failure contradicts retained database failure",
      );
    }
    const deferDatabaseFailureEnrichment =
      next.failure?.originalStage === "database:verify-final" &&
      retainedOriginalFailure !== null;
    if (
      retainedOriginalFailure &&
      !deferDatabaseFailureEnrichment &&
      next.failure === null
    ) {
      next.failure = retainedOriginalFailure;
    }
    next.failure ??= {
      mode: "abort-cleanup",
      classification: options.originalFailure?.classification ?? "CERTIFICATION_ABORTED",
      originalStage: options.originalFailure?.stage ?? null,
      attempt: options.originalFailure?.attempt ?? null,
      consumedSubstantiveGate: options.originalFailure?.consumedSubstantiveGate ?? false,
      failedStateSha256: options.originalFailure?.failedStateSha256 ?? null,
      evidenceReferences: portableOriginalEvidenceReferences(
        options.originalFailure?.evidenceReferences,
      ),
      reason: "original certification failure retained",
      at: new Date().toISOString(),
    };
    if (deferDatabaseFailureEnrichment) {
      next.failure = retainedOriginalFailure;
      if (next.currentState !== "abort-cleanup-in-progress") {
        next = advance(next, "abort-cleanup", ["abort-cleanup-in-progress"], {
          originalFailureRetained: true,
          finalEmptyVerified,
        });
      }
    }
    next = checkpoint(next);
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
    const ownsStageRole =
      next.privateBinding?.roleCreation?.ownershipRecoverable === true;
    const stageRole = ownsStageRole
      ? await adapter.dropStageRole(stageRoleName(evidence))
      : {
          dropped: false,
          alreadyAbsent: false,
          foreignPreserved: true,
        };
    if (
      ownsStageRole &&
      stageRole.dropped !== true &&
      stageRole.alreadyAbsent !== true
    ) {
      throw new Error("abort cleanup did not remove the private stage role");
    }
    let sidecarCleanup = {
      removed: false,
      alreadyAbsent: true,
      foreignPreserved: false,
    };
    if (typeof next.privateBinding?.sidecarSha256 === "string") {
      const inspectedSidecar = inspectPrivateDatabaseBindingFile(
        environment,
        next,
      );
      if (inspectedSidecar.status === "foreign") {
        sidecarCleanup = {
          removed: false,
          alreadyAbsent: false,
          foreignPreserved: true,
        };
      } else {
        sidecarCleanup = {
          ...removePrivateDatabaseBinding(environment, next),
          foreignPreserved: false,
        };
      }
    }
    next.privateBinding = next.privateBinding
      ? {
          ...next.privateBinding,
          status: !ownsStageRole
            ? "foreign-preserved"
            : sidecarCleanup.foreignPreserved
              ? "role-removed-foreign-sidecar-preserved"
              : typeof next.privateBinding.sidecarSha256 === "string"
                ? "removed"
                : "role-removed-no-sidecar",
        }
      : null;
    next.cleanup = { ...next.cleanup, stageRole, privateSidecar: sidecarCleanup };
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
    delete next.cleanupFailure;
    return advance(next, "abort-cleanup", ["abort-absence-verified"], {
      targetAbsent: true,
      failedRunRehabilitated: false,
    });
  });
}

export function createAuthSessionPreflightDatabaseEnvironment({
  baseEnvironment = process.env,
  lifecycleRoot,
  candidateCommitSha,
  candidateTreeSha,
  authPreflightInvocationNonce,
} = {}) {
  if (
    typeof lifecycleRoot !== "string" ||
    !path.isAbsolute(lifecycleRoot) ||
    !isSourceSha(candidateCommitSha) ||
    !isSourceSha(candidateTreeSha)
  ) {
    throw new Error("auth-session preflight database context is malformed");
  }
  const invocationNonceSha256 = authPreflightInvocationNonceSha256(
    authPreflightInvocationNonce,
  );
  mkdirSync(lifecycleRoot, { recursive: true, mode: 0o700 });
  const root = realpathSync(lifecycleRoot);
  const evidenceRoot = path.join(root, "database-evidence");
  const worktreeRoot = path.join(root, "database-private");
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  let adminUrl = baseEnvironment.CERTIFICATION_TEST_DATABASE_ADMIN_URL?.trim();
  if (!adminUrl) {
    const local = new URL("postgresql://127.0.0.1:5432/postgres");
    local.username = userInfo().username;
    adminUrl = local.toString();
  }
  databaseAdminPolicy(adminUrl);
  const environment = {
    ...baseEnvironment,
    CERTIFICATION_DATABASE_ADMIN_URL: adminUrl,
    CERTIFICATION_DATABASE_LIFECYCLE_PATH: path.join(
      evidenceRoot,
      "auth-session-preflight-database-lifecycle.json",
    ),
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    CERTIFICATION_EXPECTED_COMMIT_SHA: candidateCommitSha,
    CERTIFICATION_EXPECTED_TREE_SHA: candidateTreeSha,
    CERTIFICATION_WORKTREE_ROOT: worktreeRoot,
    PRODUCTION_CERTIFICATION_ID: `auth-session-preflight-${invocationNonceSha256.slice(0, 24)}`,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: `auth-session-preflight-candidate-${candidateCommitSha.slice(0, 16)}`,
  };
  delete environment.DATABASE_URL;
  return Object.freeze(environment);
}

export async function prepareAuthSessionPreflightDatabaseLifecycle({
  repositoryRoot = process.cwd(),
  baseEnvironment = process.env,
  lifecycleRoot,
  candidateCommitSha,
  candidateTreeSha,
  authPreflightInvocationNonce,
  databaseNonce = null,
  adapter = null,
  qualificationFixture = false,
  testHooks = null,
} = {}) {
  const environment = createAuthSessionPreflightDatabaseEnvironment({
    baseEnvironment,
    lifecycleRoot,
    candidateCommitSha,
    candidateTreeSha,
    authPreflightInvocationNonce,
  });
  try {
    await planCertificationDatabase({
      repositoryRoot,
      environment,
      adapter,
      nonce: databaseNonce,
      qualificationFixture,
      profile: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      authPreflightInvocationNonce,
    });
    await provisionCertificationDatabase({
      repositoryRoot,
      environment,
      adapter,
      testHooks,
    });
    await verifyInitialCertificationDatabase({
      repositoryRoot,
      environment,
      adapter,
    });
    await bindCertificationDatabaseStage({
      repositoryRoot,
      environment,
      adapter,
      stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      authPreflightInvocationNonce,
    });
  } catch (error) {
    if (existsSync(environment.CERTIFICATION_DATABASE_LIFECYCLE_PATH)) {
      try {
        await abortCertificationDatabase({
          repositoryRoot,
          environment,
          adapter,
          originalFailure: {
            classification: "AUTH_SESSION_PREFLIGHT_DATABASE_PREREQUISITE_FAILURE",
            stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
            consumedSubstantiveGate: false,
          },
        });
      } catch (cleanupError) {
        error.authPreflightDatabaseCleanupFailure =
          redactDatabaseLifecycleFailure(cleanupError);
      }
    }
    throw error;
  }
  const current = readCertificationDatabaseLifecycle({
    repositoryRoot,
    environment,
  });
  const preflightLifecycleBinding =
    createAuthSessionPreflightDatabaseBinding({
      current,
      authPreflightInvocationNonce,
    });
  const projection = resolveCertificationDatabaseStageEnvironment({
    repositoryRoot,
    environment,
    stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
    preflightLifecycleBinding,
    authPreflightInvocationNonce,
  });
  return Object.freeze({
    environment,
    current,
    preflightLifecycleBinding,
    projection,
  });
}

function authSessionPreflightDatabaseEvidence({
  current,
  preflightLifecycleBinding,
  authSessionServerPreflight,
  cleanupMode,
}) {
  const evidence = current.evidence;
  const normal = cleanupMode === "normal";
  const targetAbsent = normal
    ? evidence.currentState === "absence-verified"
    : evidence.currentState === "abort-absence-verified";
  return Object.freeze({
    schema:
      "interior-ai.ci-auth-fixture-database-prerequisite-evidence.v1",
    classification: AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.lifecycle,
    rehearsalClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.rehearsal,
    releaseCertificationClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.releaseCertification,
    integrationClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.integration,
    stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
    lifecycleIdentitySha256: sha256(
      canonicalJsonBytes({
        identity: evidence.identity,
        lifecycleProfile: evidence.lifecycleProfile,
      }),
    ),
    databaseIdentitySha256: evidence.database.identitySha256,
    databaseNameSha256: evidence.database.nameSha256,
    authPreflightInvocationNonceSha256:
      evidence.lifecycleProfile.authPreflightInvocationNonceSha256,
    projectionLifecycleEvidenceSha256:
      preflightLifecycleBinding.lifecycleEvidenceSha256,
    completionLifecycleEvidenceSha256: current.descriptor.sha256,
    planResult: evidence.events.some((entry) => entry.state === "planned")
      ? "passed"
      : "failed",
    provisionResult: evidence.events.some(
      (entry) => entry.state === "provisioned",
    )
      ? "passed"
      : "failed",
    migrationResult: evidence.events.some((entry) => entry.state === "migrated")
      ? "passed"
      : "failed",
    initialVerificationResult: evidence.events.some(
      (entry) => entry.state === "initial-empty-verified",
    )
      ? "passed"
      : "failed",
    scopedRoleClassification:
      preflightLifecycleBinding.scopedRoleClassification,
    scopedRoleIdentitySha256:
      preflightLifecycleBinding.scopedRoleIdentitySha256,
    connectionProjectionResult: "passed",
    adminCapabilities: false,
    authSessionServerPreflight,
    finalInspectionResult: normal
      ? evidence.events.some((entry) => entry.state === "final-empty-verified")
        ? "passed"
        : "failed"
      : evidence.inventories.abort || evidence.cleanup?.drop?.alreadyAbsent
        ? "abort-inspected"
        : "failed",
    cleanupMode,
    scopedRoleRemovalResult:
      evidence.cleanup?.stageRole?.dropped === true ||
      evidence.cleanup?.stageRole?.alreadyAbsent === true
        ? "passed"
        : "failed",
    dropResult:
      evidence.cleanup?.drop?.dropped === true ||
      evidence.cleanup?.drop?.alreadyAbsent === true
        ? "passed"
        : "failed",
    absenceResult: targetAbsent && evidence.cleanup?.targetAbsent !== false
      ? "passed"
      : "failed",
    originalFailureRetained: normal
      ? false
      : evidence.cleanup?.originalFailureRetained === true,
    failedPreflightRehabilitated:
      evidence.cleanup?.failedRunRehabilitated === true,
    completionMarker: targetAbsent
      ? "AUTH_SESSION_PREFLIGHT_DATABASE_LIFECYCLE_COMPLETE"
      : "AUTH_SESSION_PREFLIGHT_DATABASE_LIFECYCLE_INCOMPLETE",
  });
}

export async function completeAuthSessionPreflightDatabaseLifecycle({
  repositoryRoot = process.cwd(),
  environment,
  adapter = null,
  preflightLifecycleBinding,
} = {}) {
  await verifyFinalCertificationDatabase({
    repositoryRoot,
    environment,
    adapter,
  });
  await dropCertificationDatabase({ repositoryRoot, environment, adapter });
  await verifyCertificationDatabaseAbsent({
    repositoryRoot,
    environment,
    adapter,
  });
  const current = readCertificationDatabaseLifecycle({
    repositoryRoot,
    environment,
  });
  return Object.freeze({
    current,
    evidence: authSessionPreflightDatabaseEvidence({
      current,
      preflightLifecycleBinding,
      authSessionServerPreflight: "passed",
      cleanupMode: "normal",
    }),
  });
}

export async function abortAuthSessionPreflightDatabaseLifecycle({
  repositoryRoot = process.cwd(),
  environment,
  adapter = null,
  preflightLifecycleBinding,
  originalFailure = null,
  authSessionServerPreflight = "failed",
} = {}) {
  if (!new Set(["passed", "failed"]).has(authSessionServerPreflight)) {
    throw new Error(
      "Auth-session preflight cleanup requires an explicit server outcome",
    );
  }
  await abortCertificationDatabase({
    repositoryRoot,
    environment,
    adapter,
    originalFailure: {
      classification:
        originalFailure?.classification ?? "AUTH_SESSION_PREFLIGHT_FAILURE",
      stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
      consumedSubstantiveGate: false,
    },
  });
  const current = readCertificationDatabaseLifecycle({
    repositoryRoot,
    environment,
  });
  return Object.freeze({
    current,
    evidence: authSessionPreflightDatabaseEvidence({
      current,
      preflightLifecycleBinding,
      authSessionServerPreflight,
      cleanupMode: "abort",
    }),
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

function assertDatabaseProjectionReadiness(
  evidence,
  stage,
  authPreflightInvocationNonce = null,
) {
  const requiredStates = [
    "provisioned",
    "migrated",
    "initial-empty-verified",
    "active",
  ];
  if (
    evidence.currentState !== "active" ||
    requiredStates.some(
      (state) => !evidence.events.some((entry) => entry.state === state),
    ) ||
    evidence.inventories.initial?.totalRows !== 0 ||
    evidence.sessions.initial?.count !== 0
  ) {
    throw new Error(
      "certification database is not ready for private stage projection",
    );
  }
  const observed = evidence.stageBindings.observed.find(
    (binding) => binding.stage === stage,
  );
  if (
    !observed ||
    observed.databaseIdentitySha256 !== evidence.database.identitySha256 ||
    observed.databaseNameSha256 !== evidence.database.nameSha256 ||
    (stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE &&
      (observed.authPreflightInvocationNonceSha256 !==
        authPreflightInvocationNonceSha256(authPreflightInvocationNonce) ||
        observed.authPreflightInvocationNonceSha256 !==
          evidence.lifecycleProfile?.authPreflightInvocationNonceSha256))
  ) {
    throw new Error(
      "certification database stage binding is missing or foreign",
    );
  }
}

export function createAuthSessionPreflightDatabaseBinding({
  current,
  authPreflightInvocationNonce,
}) {
  const nonceSha256 = authPreflightInvocationNonceSha256(
    authPreflightInvocationNonce,
  );
  const evidence = current?.evidence;
  if (
    current?.binding?.lifecycleState !== "active" ||
    evidence?.lifecycleProfile?.classification !==
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.lifecycle ||
    evidence.lifecycleProfile.authPreflightInvocationNonceSha256 !==
      nonceSha256 ||
    !isSourceSha(current.binding.candidateCommitSha) ||
    !isSourceSha(current.binding.candidateTreeSha) ||
    !isSha256(current.binding.databaseNameSha256) ||
    !isSha256(current.binding.databaseIdentitySha256) ||
    !isSha256(current.binding.evidence?.sha256) ||
    !isSha256(evidence.privateBinding?.sidecarSha256) ||
    !isSha256(evidence.privateBinding?.roleNameSha256)
  ) {
    throw new Error("auth-session preflight database binding is not active or complete");
  }
  return Object.freeze({
    schema:
      "interior-ai.production-certification-auth-preflight-database-binding.v1",
    classification: AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.lifecycle,
    rehearsalClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.rehearsal,
    releaseCertificationClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.releaseCertification,
    integrationClassification:
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.integration,
    stage: AUTH_SESSION_PREFLIGHT_DATABASE_STAGE,
    authPreflightInvocationNonceSha256: nonceSha256,
    candidateCommitSha: current.binding.candidateCommitSha,
    candidateTreeSha: current.binding.candidateTreeSha,
    databaseNameSha256: current.binding.databaseNameSha256,
    databaseIdentitySha256: current.binding.databaseIdentitySha256,
    lifecycleEvidenceSha256: current.binding.evidence.sha256,
    privateSidecarSha256: evidence.privateBinding.sidecarSha256,
    scopedRoleIdentitySha256: evidence.privateBinding.roleNameSha256,
    scopedRoleClassification: evidence.privateBinding.classification,
    hostClassification: evidence.server.hostClassification,
    serverRoleClassification: evidence.server.roleClassification,
    lifecycleState: current.binding.lifecycleState,
  });
}

function assertDatabaseProjectionPreflightBinding({
  binding,
  current,
  authPreflightInvocationNonce,
}) {
  const expected = createAuthSessionPreflightDatabaseBinding({
    current,
    authPreflightInvocationNonce,
  });
  if (JSON.stringify(binding) !== JSON.stringify(expected)) {
    throw new Error(
      "auth-session preflight database projection binding is stale or foreign",
    );
  }
}

function assertDatabaseProjectionStateBinding(state, current) {
  const binding = current.binding;
  if (
    state.executionClass !== "real-candidate" ||
    state.certificationId !== binding.certificationId ||
    state.candidate?.id !== binding.candidateId ||
    state.candidate?.commitSha !== binding.candidateCommitSha ||
    state.candidate?.treeSha !== binding.candidateTreeSha ||
    JSON.stringify(state.databaseLifecycle) !== JSON.stringify(binding)
  ) {
    throw new Error(
      "certification database private projection binding is stale or foreign",
    );
  }
}

export function createStableRuntimeSmokeDatabaseBinding({ current }) {
  const evidence = current?.evidence;
  if (
    current?.binding?.lifecycleState !== "active" ||
    evidence?.lifecycleProfile?.classification !==
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle ||
    !isSourceSha(current.binding.candidateCommitSha) ||
    !isSourceSha(current.binding.candidateTreeSha) ||
    !isSha256(current.binding.databaseNameSha256) ||
    !isSha256(current.binding.databaseIdentitySha256) ||
    !isSha256(current.binding.evidence?.sha256) ||
    !isSha256(evidence.privateBinding?.sidecarSha256) ||
    !isSha256(evidence.privateBinding?.roleNameSha256)
  ) {
    throw new Error("stable runtime-smoke database binding is not active or complete");
  }
  return Object.freeze({
    schema: "interior-ai.stable-runtime-smoke-database-binding.v1",
    classification: STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle,
    releaseCertificationClassification:
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.releaseCertification,
    integrationClassification:
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.integration,
    stage: "runtime-smoke",
    candidateCommitSha: current.binding.candidateCommitSha,
    candidateTreeSha: current.binding.candidateTreeSha,
    databaseNameSha256: current.binding.databaseNameSha256,
    databaseIdentitySha256: current.binding.databaseIdentitySha256,
    lifecycleEvidenceSha256: current.binding.evidence.sha256,
    privateSidecarSha256: evidence.privateBinding.sidecarSha256,
    scopedRoleIdentitySha256: evidence.privateBinding.roleNameSha256,
    scopedRoleClassification: evidence.privateBinding.classification,
    hostClassification: evidence.server.hostClassification,
    serverRoleClassification: evidence.server.roleClassification,
    lifecycleState: current.binding.lifecycleState,
  });
}

function assertStableRuntimeSmokeDatabaseBinding(binding, current) {
  const expected = createStableRuntimeSmokeDatabaseBinding({ current });
  if (JSON.stringify(binding) !== JSON.stringify(expected)) {
    throw new Error("stable runtime-smoke database projection binding is stale or foreign");
  }
}

export function resolveCertificationDatabaseStageEnvironment({
  repositoryRoot = process.cwd(),
  environment = process.env,
  state = null,
  stage,
  preflightLifecycleBinding = null,
  stableRuntimeLifecycleBinding = null,
  authPreflightInvocationNonce = null,
}) {
  const knownStage =
    PRODUCTION_CERTIFICATION_DATABASE_STAGE_BINDINGS.includes(stage) ||
    stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE;
  if (!knownStage) {
    throw new Error("certification database stage projection is not permitted");
  }
  const current = readCertificationDatabaseLifecycle({
    repositoryRoot,
    environment,
  });
  const stableRuntimeProfile =
    current.evidence.lifecycleProfile?.classification ===
    STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle;
  if (stableRuntimeProfile) {
    if (
      stage !== "runtime-smoke" ||
      state !== null ||
      preflightLifecycleBinding !== null ||
      authPreflightInvocationNonce !== null
    ) {
      throw new Error(
        "stable runtime-smoke database projection cannot consume certification state",
      );
    }
    assertStableRuntimeSmokeDatabaseBinding(
      stableRuntimeLifecycleBinding,
      current,
    );
  } else if (stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE) {
    if (stableRuntimeLifecycleBinding !== null) {
      throw new Error(
        "auth-session preflight database projection cannot consume a stable runtime binding",
      );
    }
    if (state !== null) {
      throw new Error(
        "auth-session preflight database projection cannot consume rehearsal state",
      );
    }
    assertDatabaseProjectionPreflightBinding({
      binding: preflightLifecycleBinding,
      current,
      authPreflightInvocationNonce,
    });
  } else {
    if (
      preflightLifecycleBinding !== null ||
      stableRuntimeLifecycleBinding !== null ||
      authPreflightInvocationNonce !== null
    ) {
      throw new Error(
        "rehearsal database projection cannot consume auth-preflight bindings",
      );
    }
    assertDatabaseProjectionStateBinding(state, current);
  }
  assertDatabaseProjectionReadiness(
    current.evidence,
    stage,
    authPreflightInvocationNonce,
  );
  const privateBinding = readPrivateDatabaseBinding(
    environment,
    current.evidence,
  );
  const databaseUrl = privateBinding.sidecar.targetUrl;
  let target;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("certification database private target is malformed");
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(target.protocol) ||
    !new Set(["127.0.0.1", "[::1]", "::1"]).has(target.hostname) ||
    (target.port || "5432") !== "5432" ||
    decodeURIComponent(target.pathname.replace(/^\//, "")) !==
      current.binding.databaseName ||
    decodeURIComponent(target.username) !== stageRoleName(current.evidence) ||
    !target.password ||
    decodeURIComponent(target.username) === current.evidence.server.role ||
    target.search !== "" ||
    target.hash !== "" ||
    current.binding.databaseNameSha256 !==
      current.evidence.database.nameSha256 ||
    current.binding.databaseIdentitySha256 !==
      current.evidence.database.identitySha256
  ) {
    throw new Error(
      "certification database private target differs from the lifecycle binding",
    );
  }
  const ambientDatabaseUrl = environment.DATABASE_URL?.trim();
  if (ambientDatabaseUrl && ambientDatabaseUrl !== databaseUrl) {
    throw new Error(
      "ambient DATABASE_URL cannot override the certification database binding",
    );
  }
  return Object.freeze({
    environment: Object.freeze({ DATABASE_URL: databaseUrl }),
    identity: Object.freeze({
      databaseNameSha256: current.binding.databaseNameSha256,
      databaseIdentitySha256: current.binding.databaseIdentitySha256,
      lifecycleEvidenceSha256: current.binding.evidence.sha256,
      lifecycleState: current.binding.lifecycleState,
      privateSidecarSha256: current.evidence.privateBinding.sidecarSha256,
      scopedRoleIdentitySha256:
        current.evidence.privateBinding.roleNameSha256,
      scopedRoleClassification:
        current.evidence.privateBinding.classification,
      authPreflightInvocationNonceSha256:
        stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE
          ? current.evidence.lifecycleProfile
              .authPreflightInvocationNonceSha256
          : null,
      stage,
    }),
  });
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
