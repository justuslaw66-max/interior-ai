import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  certificationPreparedBuildJournalIssues,
} from "./production-artifact-contract.mjs";
import {
  PRODUCTION_CERTIFICATION_ARTIFACT_ROOT_SCHEMA,
  PRODUCTION_CERTIFICATION_ARTIFACT_SNAPSHOT_SCHEMA,
  PRODUCTION_CERTIFICATION_CONTINUITY_SCHEMA,
  PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA,
  PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA_V3,
  canonicalJsonBytes,
  continuityContract,
  isCanonicalUtcTimestamp,
  isSha256,
  productionCertificationContract,
  sha256Bytes,
  sourceValidationCheckSet,
} from "./production-certification-contract.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
  validateProjectedEnvironmentMetadata,
} from "./production-certification-stage-environment.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";
import {
  dependencyLifecycleIssues,
  readAndValidateCertificationDependencyBindingEvidence,
} from "./production-certification-dependencies.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  PRODUCTION_CERTIFICATION_WORKTREE_PRIVATE_SCHEMA,
} from "./production-certification-worktrees.mjs";

const SOURCE_EVIDENCE_SEAL_DOMAIN =
  "interior-ai.production-certification-source-validation-seal.v1\n";
const CERTIFICATION_STATE_SEAL_DOMAIN =
  "interior-ai.production-certification-state-seal.v1\n";
const SNAPSHOT_SEAL_DOMAIN =
  "interior-ai.production-certification-artifact-snapshot-seal.v1\n";
const ROOT_SEAL_DOMAIN =
  "interior-ai.production-certification-artifact-root-private-seal.v1\n";
const CONTINUITY_SEAL_DOMAIN =
  "interior-ai.production-certification-continuity-seal.v1\n";
const PHYSICAL_INVENTORY_SCHEMA =
  "interior-ai.production-certification-physical-inventory.v1";
const DEFAULT_MANIFEST = ".local/production-artifact-evidence/manifest.json";
const DEFAULT_JOURNAL =
  ".local/production-artifact-evidence/semantic-event-journal.json";
const ARTIFACT_ROOTS = Object.freeze([".next", "public"]);
const ARTIFACT_EXCLUSIONS = Object.freeze([
  ".next/cache",
  ".next/dev",
  ".next/diagnostics",
  ".next/trace",
]);
const IDENTITY_FILES = Object.freeze({
  requiredServerFilesSha256: ".next/required-server-files.json",
  buildManifestSha256: ".next/build-manifest.json",
  routesManifestSha256: ".next/routes-manifest.json",
  prerenderManifestSha256: ".next/prerender-manifest.json",
});
const SNAPSHOT_EVIDENCE_PREFIX = "artifact-snapshot:";
const ROOT_EVIDENCE_PREFIX = "artifact-root:";

function portable(value) {
  return value.split(path.sep).join("/");
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function canonicalRead(filePath, description) {
  const bytes = readFileSync(filePath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${description} is missing or invalid JSON`);
  }
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new Error(`${description} is not canonical JSON`);
  }
  return { bytes, value, sha256: sha256Bytes(bytes) };
}

function containedPhysicalEvidenceDirectory(
  evidenceRoot,
  relativeDirectory,
  { requireAbsent = false } = {},
) {
  if (
    path.isAbsolute(relativeDirectory) ||
    relativeDirectory.includes("\\") ||
    path.normalize(relativeDirectory) !== relativeDirectory ||
    relativeDirectory === ".." ||
    relativeDirectory.startsWith(`..${path.sep}`)
  ) {
    throw new Error("certification evidence directory is not contained");
  }
  const root = realpathSync(evidenceRoot);
  let current = root;
  const components = relativeDirectory.split(path.sep).filter(Boolean);
  for (const [index, component] of components.entries()) {
    current = path.join(current, component);
    const final = index === components.length - 1;
    if (existsSync(current)) {
      if (final && requireAbsent) {
        throw new Error("certification evidence directory target must be absent");
      }
      const metadata = lstatSync(current);
      if (
        !metadata.isDirectory() ||
        metadata.isSymbolicLink() ||
        realpathSync(current) !== current
      ) {
        throw new Error("certification evidence directory is not physical");
      }
    } else {
      mkdirSync(current, { mode: 0o700 });
    }
  }
  if (current !== root && !current.startsWith(`${root}${path.sep}`)) {
    throw new Error("certification evidence directory escapes its root");
  }
  return current;
}

function writeCanonicalExclusive(evidenceRoot, filePath, value) {
  const root = realpathSync(evidenceRoot);
  const lexicalRoot = path.resolve(evidenceRoot);
  const lexicalRequested = path.resolve(filePath);
  const requested = lexicalRequested.startsWith(`${root}${path.sep}`)
    ? lexicalRequested
    : lexicalRequested.startsWith(`${lexicalRoot}${path.sep}`)
      ? path.join(root, path.relative(lexicalRoot, lexicalRequested))
      : null;
  if (requested === null || !requested.startsWith(`${root}${path.sep}`)) {
    throw new Error("certification evidence file escapes its root");
  }
  containedPhysicalEvidenceDirectory(
    root,
    path.relative(root, path.dirname(requested)),
  );
  if (existsSync(requested)) {
    throw new Error("certification evidence file target must be absent");
  }
  writeFileSync(requested, canonicalJsonBytes(value), { flag: "wx", mode: 0o600 });
}

function evidenceDescriptor(evidenceRoot, filePath) {
  const root = realpathSync(evidenceRoot);
  const metadata = lstatSync(filePath);
  const physical = realpathSync(filePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !physical.startsWith(`${root}${path.sep}`)
  ) {
    throw new Error("certification evidence is not a contained physical file");
  }
  return {
    path: portable(path.relative(root, physical)),
    sha256: sha256Bytes(readFileSync(physical)),
  };
}

function resolvedEvidenceFile(evidenceRoot, descriptor, description) {
  if (
    !exactKeys(descriptor, ["path", "sha256"]) ||
    typeof descriptor.path !== "string" ||
    path.isAbsolute(descriptor.path) ||
    descriptor.path.includes("\\") ||
    path.posix.normalize(descriptor.path) !== descriptor.path ||
    !isSha256(descriptor.sha256)
  ) {
    throw new Error(`${description} descriptor is malformed`);
  }
  const root = realpathSync(evidenceRoot);
  const requested = path.resolve(root, descriptor.path);
  const metadata = lstatSync(requested);
  const physical = realpathSync(requested);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !physical.startsWith(`${root}${path.sep}`)
  ) {
    throw new Error(`${description} is not a contained physical file`);
  }
  const bytes = readFileSync(physical);
  if (sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error(`${description} hash mismatch`);
  }
  return { path: physical, bytes };
}

function git(repositoryRoot, args) {
  const child = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  if (child.error || child.signal || child.status !== 0) {
    throw new Error("source-validation Git identity cannot be inspected");
  }
  return child.stdout.trim();
}

export function physicalSourceIdentity(repositoryRoot) {
  return {
    commitSha: git(repositoryRoot, ["rev-parse", "HEAD"]),
    treeSha: git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]),
    clean:
      git(repositoryRoot, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]) === "",
  };
}

function assertExpectedSource(identity, state) {
  if (
    identity.commitSha !== state.candidate.commitSha ||
    identity.treeSha !== state.candidate.treeSha ||
    identity.clean !== true
  ) {
    throw new Error("source commit, tree, or cleanliness changed during validation");
  }
}

function deterministicTimestamp(state, offset) {
  const startedAt = state.stages["source-validation"].startedAt;
  return new Date(Date.parse(startedAt) + 10 + offset).toISOString();
}

function nowForExecution(state, offset) {
  return state.executionClass === "deterministic-simulation"
    ? deterministicTimestamp(state, offset)
    : new Date().toISOString();
}

function fixtureInvocation(check) {
  return {
    executable: process.execPath,
    args: [
      "scripts/production-certification-source-continuity.mjs",
      "fixture-check",
      check.id,
    ],
    display: `node scripts/production-certification-source-continuity.mjs fixture-check ${check.id}`,
  };
}

function realInvocation(check) {
  return {
    executable: check.executable === "node" ? process.execPath : check.executable,
    args: [...check.args],
    display: check.canonicalCommand,
  };
}

function sourceValidationStageInputs(environment, state, check) {
  const inputs = {
    CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
    CERTIFICATION_SOURCE_VALIDATION_CHECK_ID: check.id,
  };
  if (state.executionClass === "deterministic-simulation") {
    inputs.CERTIFICATION_QUALIFICATION_MODE = "1";
    for (const name of [
      "CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG",
      "CERTIFICATION_SOURCE_VALIDATION_DIRTY_ID",
      "CERTIFICATION_SOURCE_VALIDATION_FAIL_ID",
    ]) {
      if (environment[name]?.trim()) inputs[name] = environment[name];
    }
  }
  return inputs;
}

function sourceValidationProfileId(state, check) {
  return state.executionClass === "deterministic-simulation"
    ? check.qualificationEnvironmentProfileId
    : check.environmentProfileId;
}

function sourceValidationPayload(value) {
  const payload = structuredClone(value);
  delete payload.aggregateResultSha256;
  return payload;
}

export function sealSourceValidationEvidence(value) {
  const payload = sourceValidationPayload(value);
  return {
    ...payload,
    aggregateResultSha256: sha256Bytes(
      Buffer.concat([
        Buffer.from(SOURCE_EVIDENCE_SEAL_DOMAIN),
        canonicalJsonBytes(payload),
      ]),
    ),
  };
}

function certificationStateSealValid(state) {
  if (
    !exactKeys(state?.seal, ["algorithm", "sha256"]) ||
    state.seal.algorithm !== "sha256" ||
    !isSha256(state.seal.sha256)
  ) {
    return false;
  }
  const payload = structuredClone(state);
  delete payload.seal;
  return (
    state.seal.sha256 ===
    sha256Bytes(
      Buffer.concat([
        Buffer.from(CERTIFICATION_STATE_SEAL_DOMAIN),
        canonicalJsonBytes(payload),
      ]),
    )
  );
}

function dependencyBindingStateReceiptIssues({ lifecycle, evidenceRoot, state }) {
  const issues = [];
  try {
    const retained = resolvedEvidenceFile(
      evidenceRoot,
      lifecycle?.bindingStateEvidence,
      "source-validation dependency binding-state receipt",
    );
    const receipt = JSON.parse(retained.bytes.toString("utf8"));
    const sourceAttempt = state.stages?.["source-validation"]?.attempts?.at(-1);
    const receiptAttempt =
      receipt.stages?.["source-validation"]?.attempts?.at(-1);
    const currentBinding = state.worktrees?.roles?.["source-validation"];
    const receiptBinding = receipt.worktrees?.roles?.["source-validation"];
    const receiptRoles = receipt.worktrees?.roles;
    const currentRoles = state.worktrees?.roles;
    const expectedBindingKeys = Object.keys(state.bindings ?? {});
    const downstreamStages = Object.keys(state.stages ?? {}).filter(
      (stage) => !new Set(["doctor", "source-validation"]).has(stage),
    );
    const bindingsArePristine =
      exactKeys(receipt.bindings, expectedBindingKeys) &&
      expectedBindingKeys.every((name) =>
        name === "browserOwnerEvidenceSha256"
          ? exactKeys(receipt.bindings[name], [])
          : receipt.bindings[name] === null,
      );
    const downstreamStagesArePristine = downstreamStages.every((stage) => {
      const record = receipt.stages?.[stage];
      return (
        exactKeys(record, Object.keys(state.stages[stage])) &&
        record.status === "pending" &&
        record.canonicalCommand === state.stages[stage].canonicalCommand &&
        record.inputFingerprint === null &&
        record.startedAt === null &&
        record.completedAt === null &&
        record.exitCode === null &&
        record.signal === null &&
        record.failureClassification === null &&
        record.consumedSubstantiveGate === false &&
        exactKeys(record.outputHashes, []) &&
        Array.isArray(record.attempts) &&
        record.attempts.length === 0 &&
        record.invalidationReason === null
      );
    });
    const immutableWorktreeFields = [
      "role",
      "certificationId",
      "candidateCommitSha",
      "candidateTreeSha",
      "gitCommonDirSha256",
      "gitCommonDirFilesystemIdentitySha256",
      "privateRealpathSha256",
      "filesystemIdentitySha256",
      "cleanStateSha256",
      "creationEvent",
    ];
    const worktreeSnapshotsAreExact = CERTIFICATION_WORKTREE_ROLES.every(
      (role) => {
        const receiptRole = receiptRoles?.[role];
        const currentRole = currentRoles?.[role];
        if (
          receiptRole?.lifecycleStatus !== "active" ||
          receiptRole?.cleanupStatus !== "pending" ||
          immutableWorktreeFields.some(
            (field) =>
              JSON.stringify(receiptRole?.[field]) !==
              JSON.stringify(currentRole?.[field]),
          ) ||
          (role === "source-validation"
            ? JSON.stringify(receiptRole?.ignoredPathInventory) !==
              JSON.stringify(currentRole?.ignoredPathInventory)
            : receiptRole?.ignoredPathInventory?.count !== 0 ||
              receiptRole?.ignoredPathInventory?.sha256 !== sha256Bytes(""))
        ) {
          return false;
        }
        try {
          const sidecarFile = resolvedEvidenceFile(
            evidenceRoot,
            receiptRole?.privateSidecar,
            `source binding-state ${role} private sidecar`,
          );
          const sidecar = JSON.parse(sidecarFile.bytes.toString("utf8"));
          return (
            sidecarFile.bytes.equals(canonicalJsonBytes(sidecar)) &&
            exactKeys(sidecar, [
              "schema",
              "certificationId",
              "role",
              "realpath",
              "gitCommonDirRealpath",
              "filesystem",
              "dependency",
            ]) &&
            sidecar.schema === PRODUCTION_CERTIFICATION_WORKTREE_PRIVATE_SCHEMA &&
            sidecar.certificationId === state.certificationId &&
            sidecar.role === role &&
            sha256Bytes(sidecar.realpath) === receiptRole.privateRealpathSha256 &&
            sha256Bytes(sidecar.gitCommonDirRealpath) ===
              receiptRole.gitCommonDirSha256 &&
            sha256Bytes(
              `${sidecar.filesystem?.device}:${sidecar.filesystem?.inode}`,
            ) === receiptRole.filesystemIdentitySha256 &&
            (role === "source-validation"
              ? sidecar.dependency !== null &&
                JSON.stringify(receiptRole.privateSidecar) ===
                  JSON.stringify(currentRole.privateSidecar)
              : sidecar.dependency === null)
          );
        } catch {
          return false;
        }
      },
    );
    const receiptAttempts = receipt.stages?.["source-validation"]?.attempts;
    const currentAttempts = state.stages?.["source-validation"]?.attempts;
    const priorAttemptsAreExact =
      Array.isArray(receiptAttempts) &&
      Array.isArray(currentAttempts) &&
      receiptAttempts.length === currentAttempts.length &&
      receiptAttempts
        .slice(0, -1)
        .every(
          (attempt, index) =>
            JSON.stringify(attempt) === JSON.stringify(currentAttempts[index]),
        );
    const installationStartedAt =
      receiptBinding?.dependencyInstallation?.startedAt;
    const installationCompletedAt =
      receiptBinding?.dependencyInstallation?.completedAt;
    const bindingAttempts = (receiptAttempts ?? []).filter(
      (attempt) =>
        Date.parse(installationStartedAt ?? "") >=
          Date.parse(attempt?.startedAt ?? "") &&
        Date.parse(installationCompletedAt ?? "") <=
          Date.parse(attempt?.completedAt ?? receipt.updatedAt ?? ""),
    );
    const bindingAttemptIsLatest = bindingAttempts[0]?.id === receiptAttempt?.id;
    const expectedReceiptUpdatedAt = bindingAttemptIsLatest
      ? installationCompletedAt
      : receiptAttempt?.startedAt;
    if (
      !retained.bytes.equals(canonicalJsonBytes(receipt)) ||
      !exactKeys(receipt, Object.keys(state)) ||
      lifecycle?.bindingStateEvidence?.sha256 !==
        lifecycle?.stateShaImmediatelyAfterBinding ||
      retained.bytes.length === 0 ||
      sha256Bytes(retained.bytes) !== lifecycle?.stateShaImmediatelyAfterBinding ||
      !certificationStateSealValid(receipt) ||
      receipt.schema !== state.schema ||
      receipt.version !== 3 ||
      receipt.certificationId !== state.certificationId ||
      JSON.stringify(receipt.candidate) !== JSON.stringify(state.candidate) ||
      JSON.stringify(receipt.harness) !== JSON.stringify(state.harness) ||
      receipt.executionClass !== state.executionClass ||
      receipt.createdAt !== state.createdAt ||
      receipt.completionState !== "incomplete" ||
      !bindingsArePristine ||
      !exactKeys(receipt.evidenceFiles, ["doctor"]) ||
      JSON.stringify(receipt.evidenceFiles.doctor) !==
        JSON.stringify(state.evidenceFiles.doctor) ||
      receipt.worktrees?.schema !== state.worktrees?.schema ||
      !exactKeys(receiptRoles, Object.keys(state.worktrees?.roles ?? {})) ||
      dependencyLifecycleIssues(receiptBinding).length > 0 ||
      dependencyLifecycleIssues(receiptRoles?.["final-artifact"]).length > 0 ||
      dependencyLifecycleIssues(receiptRoles?.["development-browser"]).length > 0 ||
      receiptRoles?.["final-artifact"]?.dependencyStatus !== "not-installed" ||
      receiptRoles?.["development-browser"]?.dependencyStatus !==
        "not-installed" ||
      !worktreeSnapshotsAreExact ||
      !exactKeys(receipt.stages, Object.keys(state.stages ?? {})) ||
      JSON.stringify(receipt.stages?.doctor) !==
        JSON.stringify(state.stages?.doctor) ||
      receipt.stages?.["source-validation"]?.status !== "running" ||
      !exactKeys(
        receipt.stages?.["source-validation"],
        Object.keys(state.stages?.["source-validation"] ?? {}),
      ) ||
      receipt.stages["source-validation"].canonicalCommand !==
        state.stages?.["source-validation"]?.canonicalCommand ||
      receipt.stages["source-validation"].inputFingerprint !==
        state.stages?.["source-validation"]?.inputFingerprint ||
      receipt.stages["source-validation"].completedAt !== null ||
      receipt.stages["source-validation"].exitCode !== null ||
      receipt.stages["source-validation"].signal !== null ||
      receipt.stages["source-validation"].failureClassification !== null ||
      receipt.stages["source-validation"].consumedSubstantiveGate !== false ||
      !exactKeys(receipt.stages["source-validation"].outputHashes, []) ||
      receipt.stages["source-validation"].invalidationReason !== null ||
      !priorAttemptsAreExact ||
      !exactKeys(receiptAttempt, Object.keys(sourceAttempt ?? {})) ||
      receiptAttempt?.status !== "running" ||
      receiptAttempt?.id !== sourceAttempt?.id ||
      receiptAttempt?.number !== sourceAttempt?.number ||
      receiptAttempt?.startedAt !== sourceAttempt?.startedAt ||
      receiptAttempt?.completedAt !== null ||
      receiptAttempt?.exitCode !== null ||
      receiptAttempt?.signal !== null ||
      receiptAttempt?.failureClassification !== null ||
      receiptAttempt?.consumedSubstantiveGate !== false ||
      receipt.evidenceFiles?.["source-validation"] !== undefined ||
      !downstreamStagesArePristine ||
      receiptBinding?.dependencyStatus !== "installed" ||
      receiptBinding?.dependencyIdentitySha256 !==
        lifecycle?.dependencyIdentitySha256 ||
      JSON.stringify(receiptBinding?.dependencyBindingEvidence) !==
        JSON.stringify(lifecycle?.bindingEvidence) ||
      JSON.stringify(receiptBinding?.dependencyInstallation) !==
        JSON.stringify(currentBinding?.dependencyInstallation) ||
      bindingAttempts.length !== 1 ||
      receipt.updatedAt !== expectedReceiptUpdatedAt
    ) {
      issues.push(
        `source-validation dependency binding-state receipt is stale or contradictory (${JSON.stringify({
          worktreeSnapshotsAreExact,
          priorAttemptsAreExact,
          bindingAttemptCount: bindingAttempts.length,
          expectedReceiptUpdatedAt,
          observedReceiptUpdatedAt: receipt.updatedAt,
          receiptSourceStatus:
            receipt.stages?.["source-validation"]?.status,
          receiptSourceAttemptCount: receiptAttempts?.length,
          currentSourceAttemptCount: currentAttempts?.length,
        })})`,
      );
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  return issues;
}

function sourceDependencyRevalidationIssues({
  lifecycle,
  evidenceRoot,
  binding,
  state,
  repositoryRoot,
}) {
  const issues = [];
  try {
    const retained =
      readAndValidateCertificationDependencyBindingEvidence({
        evidenceRoot,
        descriptor: lifecycle?.bindingEvidence,
        state,
        role: "source-validation",
        repositoryRoot,
        remeasure: false,
      });
    if (!retained.validation.valid) {
      issues.push(...retained.validation.issues);
      return issues;
    }
    const bindingEvidence = retained.evidence;
    const expected = {
      role: "source-validation",
      dependencyIdentitySha256: bindingEvidence.dependencyIdentitySha256,
      bindingEvidenceSha256: binding?.dependencyBindingEvidence?.sha256,
      packageLockSha256: bindingEvidence.packageLockSha256,
      packageManifestSha256: bindingEvidence.packageManifestSha256,
      nodeModulesRootIdentitySha256:
        bindingEvidence.physicalNodeModulesProof?.nodeModulesRootIdentitySha256,
      nodeModulesFilesystemIdentitySha256:
        bindingEvidence.physicalNodeModulesProof
          ?.nodeModulesFilesystemIdentitySha256,
      dependencyInventorySha256: bindingEvidence.dependencyInventory?.sha256,
      topLevelPackageResolutionSha256:
        bindingEvidence.topLevelPackageResolutionProof?.sha256,
      nodeSearchPathProofSha256: bindingEvidence.nodeSearchPathProof?.sha256,
      isolationPassed: true,
      equalToBoundIdentity: true,
    };
    for (const [name, boundary] of [
      ["preCheckRevalidation", "pre-check"],
      ["postCheckRevalidation", "post-check"],
    ]) {
      const observed = lifecycle?.[name];
      if (
        !exactKeys(observed, [
          "role",
          "boundary",
          "dependencyIdentitySha256",
          "bindingEvidenceSha256",
          "packageLockSha256",
          "packageManifestSha256",
          "nodeModulesRootIdentitySha256",
          "nodeModulesFilesystemIdentitySha256",
          "dependencyInventorySha256",
          "topLevelPackageResolutionSha256",
          "nodeSearchPathProofSha256",
          "isolationPassed",
          "equalToBoundIdentity",
        ]) ||
        observed.boundary !== boundary ||
        Object.entries(expected).some(
          ([field, value]) => observed[field] !== value,
        )
      ) {
        issues.push(
          `source-validation ${name} is not exactly bound to the sealed dependency evidence`,
        );
      }
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  return issues;
}

export function sourceValidationEvidenceNames() {
  return Object.freeze({
    aggregate: "source-validation",
  });
}

export function snapshotEvidenceName(position) {
  return `${SNAPSHOT_EVIDENCE_PREFIX}${position}`;
}

export function rootEvidenceName(position) {
  return `${ROOT_EVIDENCE_PREFIX}${position}`;
}

export function sourceValidationStageEvidence({
  repositoryRoot,
  evidenceRoot,
  state,
  environment = process.env,
  onCheckCompleted = () => {},
  worktreeIdentity = null,
  dependencyBindingStateSha256 = null,
  dependencyRevalidate = null,
}) {
  const contract = sourceValidationCheckSet(repositoryRoot);
  const attempt = state.stages["source-validation"].attempts.at(-1);
  if (attempt?.status !== "running") {
    throw new Error("source-validation evidence requires a running stage attempt");
  }
  const simulation = state.executionClass === "deterministic-simulation";
  if (simulation && environment.CERTIFICATION_QUALIFICATION_MODE !== "1") {
    throw new Error("source-validation fixture execution is restricted to qualification");
  }
  if (
    state.version === 3 &&
    (state.worktrees?.roles?.["source-validation"]?.dependencyStatus !==
      "installed" ||
      !isSha256(dependencyBindingStateSha256) ||
      typeof dependencyRevalidate !== "function")
  ) {
    throw new Error(
      "source-validation requires an installed, durably bound dependency lifecycle",
    );
  }
  const preCheckDependencyRevalidation =
    state.version === 3 ? dependencyRevalidate("pre-check") : null;
  const missingEnvironment = [
    ...new Set(
      contract.checks.flatMap((check) => check.requiredEnvironmentNames),
    ),
  ].filter((name) => !environment[name]?.trim());
  if (missingEnvironment.length > 0) {
    throw new Error(
      `source-validation is missing required environment names: ${missingEnvironment.join(", ")}`,
    );
  }
  const relativeRoot = `source-validation/attempt-${String(attempt.number).padStart(3, "0")}`;
  const absoluteRoot = containedPhysicalEvidenceDirectory(
    evidenceRoot,
    relativeRoot,
    { requireAbsent: true },
  );
  let dependencyBindingStateEvidence = null;
  if (state.version === 3) {
    const bindingStatePath = path.join(
      absoluteRoot,
      "dependency-binding-state.json",
    );
    writeCanonicalExclusive(evidenceRoot, bindingStatePath, state);
    dependencyBindingStateEvidence = evidenceDescriptor(
      evidenceRoot,
      bindingStatePath,
    );
    if (dependencyBindingStateEvidence.sha256 !== dependencyBindingStateSha256) {
      throw new Error(
        "source-validation binding-state receipt differs from the durable state SHA",
      );
    }
  }
  const results = [];
  let failedCheckId = null;
  for (const [index, check] of contract.checks.entries()) {
    const projected = projectCertificationChildEnvironment({
      repositoryRoot,
      baseEnvironment: environment,
      stage: "source-validation",
      checkId: check.id,
      profileId: sourceValidationProfileId(state, check),
      requiredEnvironmentNames: check.requiredEnvironmentNames,
      stageInputs: sourceValidationStageInputs(environment, state, check),
    });
    const missingCheckEnvironment = check.requiredEnvironmentNames.filter(
      (name) => !projected.environment[name]?.trim(),
    );
    if (missingCheckEnvironment.length > 0) {
      throw new Error(
        `source-validation check ${check.id} is missing required environment names: ${missingCheckEnvironment.join(", ")}`,
      );
    }
    const sourceBefore = physicalSourceIdentity(repositoryRoot);
    assertExpectedSource(sourceBefore, state);
    const invocation = simulation ? fixtureInvocation(check) : realInvocation(check);
    const checkRoot = path.join(
      absoluteRoot,
      `${String(index + 1).padStart(3, "0")}-${check.id}`,
    );
    containedPhysicalEvidenceDirectory(
      evidenceRoot,
      path.relative(realpathSync(evidenceRoot), checkRoot),
      { requireAbsent: true },
    );
    const stdoutPath = path.join(checkRoot, "stdout.log");
    const stderrPath = path.join(checkRoot, "stderr.log");
    const stdout = openSync(stdoutPath, "wx", 0o600);
    const stderr = openSync(stderrPath, "wx", 0o600);
    const startedAt = nowForExecution(state, index * 4 + 1);
    let child;
    try {
      child = spawnSync(invocation.executable, invocation.args, {
        cwd: repositoryRoot,
        env: projected.environment,
        stdio: ["ignore", stdout, stderr],
      });
    } finally {
      closeSync(stdout);
      closeSync(stderr);
    }
    const completedAt = nowForExecution(state, index * 4 + 2);
    const sourceAfter = physicalSourceIdentity(repositoryRoot);
    const stdoutDescriptor = evidenceDescriptor(evidenceRoot, stdoutPath);
    const stderrDescriptor = evidenceDescriptor(evidenceRoot, stderrPath);
    const result = {
      id: check.id,
      order: index + 1,
      canonicalCommand: check.canonicalCommand,
      commandOwner: check.commandOwner,
      environmentProfileId: sourceValidationProfileId(state, check),
      environment: projected.metadata,
      requiredEnvironmentNames: [...check.requiredEnvironmentNames],
      expectedEvidence: [...check.expectedEvidence],
      substantive: check.substantive,
      continueAfterFailure: check.continueAfterFailure,
      invocationMode: simulation ? "deterministic-fixture" : "canonical-real",
      invokedCommand: invocation.display,
      invoked: true,
      workingDirectory: {
        policy: contract.workingDirectoryPolicy,
        classification: "exact-candidate-root",
        commitSha: sourceBefore.commitSha,
        treeSha: sourceBefore.treeSha,
      },
      startedAt,
      completedAt,
      sourceBefore,
      sourceAfter,
      process: {
        exitCode:
          child.error || child.signal
            ? null
            : Number.isSafeInteger(child.status)
              ? child.status
              : null,
        signal: child.signal ?? null,
        spawnError: child.error ? child.error.code ?? "spawn-error" : null,
      },
      stdout: {
        ...stdoutDescriptor,
        bytes: statSync(stdoutPath).size,
      },
      stderr: {
        ...stderrDescriptor,
        bytes: statSync(stderrPath).size,
      },
      generatedEvidence: [stdoutDescriptor, stderrDescriptor],
      passed:
        !child.error &&
        !child.signal &&
        child.status === 0 &&
        sourceAfter.commitSha === sourceBefore.commitSha &&
        sourceAfter.treeSha === sourceBefore.treeSha &&
        sourceAfter.clean === true,
    };
    const resultPath = path.join(checkRoot, "result.json");
    writeCanonicalExclusive(evidenceRoot, resultPath, result);
    const resultDescriptor = evidenceDescriptor(evidenceRoot, resultPath);
    result.resultEvidence = resultDescriptor;
    result.generatedEvidence = [
      stdoutDescriptor,
      stderrDescriptor,
      resultDescriptor,
    ];
    results.push(result);
    onCheckCompleted(result);
    if (!result.passed) {
      failedCheckId = check.id;
      break;
    }
  }
  const completedAt = nowForExecution(state, contract.checks.length * 4 + 3);
  const postCheckDependencyRevalidation =
    state.version === 3 ? dependencyRevalidate("post-check") : null;
  const passed = failedCheckId === null && results.length === contract.checks.length;
  const evidence = sealSourceValidationEvidence({
    schema:
      state.version === 3
        ? PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA
        : PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA_V3,
    version: state.version === 3 ? 4 : 3,
    certificationId: state.certificationId,
    candidate: structuredClone(state.candidate),
    harness: structuredClone(state.harness),
    contractMatrixSha256: contract.contractMatrixSha256,
    checkSetSha256: contract.sha256,
    environmentContractSha256: contract.environmentContractSha256,
    runNonce: `${state.certificationId}:${attempt.id}`,
    executionClass: state.executionClass,
    simulation,
    workingDirectoryIdentity: {
      policy: contract.workingDirectoryPolicy,
      classification: "exact-candidate-root",
      commitSha: state.candidate.commitSha,
      treeSha: state.candidate.treeSha,
    },
    ...(new Set([2, 3]).has(state.version)
      ? {
          stageWorktree: {
            role: "source-validation",
            identitySha256: sha256Bytes(canonicalJsonBytes(worktreeIdentity)),
            realpathClassification: "private-sidecar-bound",
            candidateCommitSha: worktreeIdentity?.candidateCommitSha,
            candidateTreeSha: worktreeIdentity?.candidateTreeSha,
            privateRealpathSha256: worktreeIdentity?.privateRealpathSha256,
            dependencyIdentitySha256:
              worktreeIdentity?.dependencyIdentitySha256 ?? null,
            evidenceRootSha256: sha256Bytes(realpathSync(evidenceRoot)),
          },
        }
      : {}),
    ...(state.version === 3
      ? {
          dependencyLifecycle: {
            schema:
              state.worktrees.roles["source-validation"]
                .dependencyLifecycleSchema,
            version: 1,
            status: "installed",
            bindingEvidenceSchema:
              "interior-ai.production-certification-worktree-dependency-binding.v1",
            dependencyIdentitySha256:
              state.worktrees.roles["source-validation"]
                .dependencyIdentitySha256,
            bindingEvidence: structuredClone(
              state.worktrees.roles["source-validation"]
                .dependencyBindingEvidence,
            ),
            stateShaImmediatelyAfterBinding: dependencyBindingStateSha256,
            bindingStateEvidence: dependencyBindingStateEvidence,
            preCheckRevalidation: preCheckDependencyRevalidation,
            postCheckRevalidation: postCheckDependencyRevalidation,
            aggregateEquality: {
              stateDependencyIdentitySha256:
                state.worktrees.roles["source-validation"]
                  .dependencyIdentitySha256,
              aggregateDependencyIdentitySha256:
                worktreeIdentity?.dependencyIdentitySha256 ?? null,
              equal:
                state.worktrees.roles["source-validation"]
                  .dependencyIdentitySha256 ===
                worktreeIdentity?.dependencyIdentitySha256,
            },
          },
        }
      : {}),
    orderedCheckIds: contract.checks.map((check) => check.id),
    canonicalCommands: contract.checks.map((check) => check.canonicalCommand),
    orderedEnvironmentProfileIds: contract.checks.map(
      (check) => sourceValidationProfileId(state, check),
    ),
    environmentProfileHashes: contract.checks.map(
      (check) =>
        certificationEnvironmentProfile(
          repositoryRoot,
          sourceValidationProfileId(state, check),
        ).sha256,
    ),
    startedAt: attempt.startedAt,
    completedAt,
    checks: results,
    failedCheckId,
    passed,
    completionMarker: {
      complete: true,
      result: passed ? "passed" : "failed",
      completedCheckCount: results.length,
    },
  });
  const aggregatePath = path.join(absoluteRoot, "evidence.json");
  writeCanonicalExclusive(evidenceRoot, aggregatePath, evidence);
  return Object.freeze({
    passed,
    failedCheckId,
    evidence,
    descriptor: evidenceDescriptor(evidenceRoot, aggregatePath),
  });
}

function sourceValidationAggregateIssues(evidence) {
  if (!isSha256(evidence?.aggregateResultSha256)) {
    return ["source-validation aggregate result hash is missing"];
  }
  const expected = sealSourceValidationEvidence(evidence).aggregateResultSha256;
  return expected === evidence.aggregateResultSha256
    ? []
    : ["source-validation aggregate result hash mismatch"];
}

export function validateSourceValidationEvidence({
  evidence,
  evidenceRoot,
  state,
  repositoryRoot,
  requirePassed = true,
  verifyPhysicalSource = true,
}) {
  const issues = [];
  let contract;
  try {
    contract = sourceValidationCheckSet(repositoryRoot);
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
  const expectedSchema =
    state.version === 3
      ? PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA
      : PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA_V3;
  if (evidence?.schema !== expectedSchema) {
    issues.push("source-validation evidence schema is unsupported");
  }
  if (
    !exactKeys(evidence, [
      "schema",
      "version",
      "certificationId",
      "candidate",
      "harness",
      "contractMatrixSha256",
      "checkSetSha256",
      "environmentContractSha256",
      "runNonce",
      "executionClass",
      "simulation",
      "workingDirectoryIdentity",
      ...(new Set([2, 3]).has(state.version) ? ["stageWorktree"] : []),
      ...(state.version === 3 ? ["dependencyLifecycle"] : []),
      "orderedCheckIds",
      "canonicalCommands",
      "orderedEnvironmentProfileIds",
      "environmentProfileHashes",
      "startedAt",
      "completedAt",
      "checks",
      "failedCheckId",
      "passed",
      "completionMarker",
      "aggregateResultSha256",
    ])
  ) {
    issues.push("source-validation aggregate fields are missing or unknown");
  }
  const sourceAttempt = state.stages?.["source-validation"]?.attempts?.at(-1);
  if (
    evidence?.version !== (state.version === 3 ? 4 : 3) ||
    evidence?.runNonce !== `${state.certificationId}:${sourceAttempt?.id}` ||
    evidence?.startedAt !== sourceAttempt?.startedAt ||
    !isCanonicalUtcTimestamp(evidence?.completedAt) ||
    (sourceAttempt?.completedAt &&
      Date.parse(evidence.completedAt) > Date.parse(sourceAttempt.completedAt)) ||
    Date.parse(evidence?.completedAt ?? "") < Date.parse(evidence?.startedAt ?? "")
  ) {
    issues.push("source-validation run nonce or aggregate timing is stale");
  }
  if (
    evidence?.certificationId !== state.certificationId ||
    JSON.stringify(evidence?.candidate) !== JSON.stringify(state.candidate)
  ) {
    issues.push("source-validation evidence belongs to another candidate or tree");
  }
  if (
    JSON.stringify(evidence?.harness) !== JSON.stringify(state.harness) ||
    evidence?.contractMatrixSha256 !== contract.contractMatrixSha256 ||
    evidence?.checkSetSha256 !== contract.sha256 ||
    evidence?.environmentContractSha256 !== contract.environmentContractSha256
  ) {
    issues.push("source-validation evidence belongs to another harness or contract matrix");
  }
  if (
    evidence?.executionClass !== state.executionClass ||
    evidence?.simulation !== (state.executionClass === "deterministic-simulation")
  ) {
    issues.push("source-validation execution classification is stale or cross-run");
  }
  const expectedIds = contract.checks.map((check) => check.id);
  const observed = Array.isArray(evidence?.checks) ? evidence.checks : [];
  const observedIds = observed.map((check) => check?.id);
  if (new Set(observedIds).size !== observedIds.length) {
    issues.push("source-validation evidence contains a duplicate check");
  }
  if (observedIds.some((id) => !expectedIds.includes(id))) {
    issues.push("source-validation evidence contains an unknown check");
  }
  if (JSON.stringify(evidence?.orderedCheckIds) !== JSON.stringify(expectedIds)) {
    issues.push("source-validation ordered check-ID contract is incomplete");
  }
  if (
    JSON.stringify(evidence?.canonicalCommands) !==
    JSON.stringify(contract.checks.map((check) => check.canonicalCommand))
  ) {
    issues.push("source-validation canonical command inventory is incomplete");
  }
  if (
    JSON.stringify(evidence?.orderedEnvironmentProfileIds) !==
      JSON.stringify(
        contract.checks.map((check) => sourceValidationProfileId(state, check)),
      ) ||
    !Array.isArray(evidence?.environmentProfileHashes) ||
    evidence.environmentProfileHashes.length !== contract.checks.length
  ) {
    issues.push("source-validation environment profile inventory is incomplete");
  }
  if (requirePassed && JSON.stringify(observedIds) !== JSON.stringify(expectedIds)) {
    issues.push("source-validation check closure is missing or out of order");
  }
  if (!requirePassed) {
    const expectedPrefix = expectedIds.slice(0, observedIds.length);
    if (
      observedIds.length === 0 ||
      JSON.stringify(observedIds) !== JSON.stringify(expectedPrefix) ||
      evidence?.failedCheckId !== observedIds.at(-1)
    ) {
      issues.push("failed source-validation evidence is not a canonical stopped prefix");
    }
  }
  if (
    !exactKeys(evidence?.workingDirectoryIdentity, [
      "policy",
      "classification",
      "commitSha",
      "treeSha",
    ]) ||
    evidence.workingDirectoryIdentity.policy !== contract.workingDirectoryPolicy ||
    evidence.workingDirectoryIdentity.classification !== "exact-candidate-root" ||
    evidence.workingDirectoryIdentity.commitSha !== state.candidate.commitSha ||
    evidence.workingDirectoryIdentity.treeSha !== state.candidate.treeSha
  ) {
    issues.push("source-validation aggregate working directory is invalid");
  }
  if (new Set([2, 3]).has(state.version)) {
    const binding = state.worktrees?.roles?.["source-validation"];
    const portableBinding = binding
      ? Object.fromEntries(
          [
            "role",
            "certificationId",
            "candidateCommitSha",
            "candidateTreeSha",
            "gitCommonDirSha256",
            "gitCommonDirFilesystemIdentitySha256",
            "privateRealpathSha256",
            "filesystemIdentitySha256",
            "cleanStateSha256",
            "ignoredPathInventory",
            "dependencyIdentitySha256",
          ].map((name) => [name, binding[name]]),
        )
      : null;
    if (
      !exactKeys(evidence?.stageWorktree, [
        "role",
        "identitySha256",
        "realpathClassification",
        "candidateCommitSha",
        "candidateTreeSha",
        "privateRealpathSha256",
        "dependencyIdentitySha256",
        "evidenceRootSha256",
      ]) ||
      evidence.stageWorktree.role !== "source-validation" ||
      !isSha256(evidence.stageWorktree.identitySha256) ||
      evidence.stageWorktree.identitySha256 !==
        sha256Bytes(canonicalJsonBytes(portableBinding)) ||
      evidence.stageWorktree.realpathClassification !== "private-sidecar-bound" ||
      evidence.stageWorktree.candidateCommitSha !== state.candidate.commitSha ||
      evidence.stageWorktree.candidateTreeSha !== state.candidate.treeSha ||
      evidence.stageWorktree.privateRealpathSha256 !== binding?.privateRealpathSha256 ||
      evidence.stageWorktree.dependencyIdentitySha256 !==
        binding?.dependencyIdentitySha256 ||
      evidence.stageWorktree.evidenceRootSha256 !==
        sha256Bytes(realpathSync(evidenceRoot))
    ) {
      issues.push("source-validation stage-worktree identity is missing or stale");
    }
  }
  if (state.version === 3) {
    const binding = state.worktrees?.roles?.["source-validation"];
    const lifecycle = evidence?.dependencyLifecycle;
    const stateSha256 = sha256Bytes(canonicalJsonBytes(state));
    issues.push(
      ...dependencyBindingStateReceiptIssues({
        lifecycle,
        evidenceRoot,
        state,
      }),
      ...sourceDependencyRevalidationIssues({
        lifecycle,
        evidenceRoot,
        binding,
        state,
        repositoryRoot,
      }),
    );
    if (
      !exactKeys(lifecycle, [
        "schema",
        "version",
        "status",
        "bindingEvidenceSchema",
        "dependencyIdentitySha256",
        "bindingEvidence",
        "stateShaImmediatelyAfterBinding",
        "bindingStateEvidence",
        "preCheckRevalidation",
        "postCheckRevalidation",
        "aggregateEquality",
      ]) ||
      lifecycle.schema !== binding?.dependencyLifecycleSchema ||
      lifecycle.version !== 1 ||
      lifecycle.status !== "installed" ||
      lifecycle.bindingEvidenceSchema !==
        "interior-ai.production-certification-worktree-dependency-binding.v1" ||
      lifecycle.dependencyIdentitySha256 !==
        binding?.dependencyIdentitySha256 ||
      JSON.stringify(lifecycle.bindingEvidence) !==
        JSON.stringify(binding?.dependencyBindingEvidence) ||
      (!isSha256(lifecycle.stateShaImmediatelyAfterBinding) ||
        (state.stages?.["source-validation"]?.status === "running" &&
          lifecycle.stateShaImmediatelyAfterBinding !== stateSha256)) ||
      !exactKeys(lifecycle.aggregateEquality, [
        "stateDependencyIdentitySha256",
        "aggregateDependencyIdentitySha256",
        "equal",
      ]) ||
      lifecycle.aggregateEquality?.stateDependencyIdentitySha256 !==
        binding?.dependencyIdentitySha256 ||
      lifecycle.aggregateEquality?.aggregateDependencyIdentitySha256 !==
        binding?.dependencyIdentitySha256 ||
      lifecycle.aggregateEquality?.equal !== true
    ) {
      issues.push(
        "source-validation dependency lifecycle, revalidation, or aggregate equality is stale",
      );
    }
  }
  let priorCheckCompletedAt = evidence?.startedAt;
  for (const [index, result] of observed.entries()) {
    const expected = contract.checks[index];
    const expectedFailure = !requirePassed && index === observed.length - 1;
    if (
      !exactKeys(result, [
        "id",
        "order",
        "canonicalCommand",
        "commandOwner",
        "environmentProfileId",
        "environment",
        "requiredEnvironmentNames",
        "expectedEvidence",
        "substantive",
        "continueAfterFailure",
        "invocationMode",
        "invokedCommand",
        "invoked",
        "workingDirectory",
        "startedAt",
        "completedAt",
        "sourceBefore",
        "sourceAfter",
        "process",
        "stdout",
        "stderr",
        "generatedEvidence",
        "passed",
        "resultEvidence",
      ]) ||
      !expected ||
      result?.id !== expected.id ||
      result?.order !== index + 1 ||
      result?.canonicalCommand !== expected.canonicalCommand ||
      result?.commandOwner !== expected.commandOwner ||
      result?.environmentProfileId !== sourceValidationProfileId(state, expected) ||
      JSON.stringify(result?.requiredEnvironmentNames) !==
        JSON.stringify(expected.requiredEnvironmentNames) ||
      JSON.stringify(result?.expectedEvidence) !==
        JSON.stringify(expected.expectedEvidence) ||
      result?.substantive !== expected.substantive ||
      result?.continueAfterFailure !== false ||
      result?.invoked !== true ||
      !exactKeys(result?.workingDirectory, [
        "policy",
        "classification",
        "commitSha",
        "treeSha",
      ]) ||
      !exactKeys(result?.sourceBefore, ["commitSha", "treeSha", "clean"]) ||
      !exactKeys(result?.sourceAfter, ["commitSha", "treeSha", "clean"])
    ) {
      issues.push(`source-validation command or order mismatch at check ${index + 1}`);
      continue;
    }
    const environmentValidation = validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId: expected.id,
      profileId: sourceValidationProfileId(state, expected),
      requiredEnvironmentNames: expected.requiredEnvironmentNames,
      metadata: result.environment,
    });
    if (!environmentValidation.valid) {
      issues.push(
        ...environmentValidation.issues.map(
          (issue) => `source-validation environment ${expected.id}: ${issue}`,
        ),
      );
    }
    if (
      evidence?.environmentProfileHashes?.[index] !==
        result.environment?.profileSha256 ||
      expected.requiredEnvironmentNames.some(
        (name) => !result.environment?.environmentNames?.includes(name),
      )
    ) {
      issues.push(`source-validation environment binding mismatch: ${expected.id}`);
    }
    const expectedInvocation =
      state.executionClass === "deterministic-simulation"
        ? fixtureInvocation(expected)
        : realInvocation(expected);
    if (
      result.invocationMode !==
        (state.executionClass === "deterministic-simulation"
          ? "deterministic-fixture"
          : "canonical-real") ||
      result.invokedCommand !== expectedInvocation.display
    ) {
      issues.push(`source-validation invoked command mismatch: ${expected.id}`);
    }
    const sourceBeforeInvalid =
      result.sourceBefore.commitSha !== state.candidate.commitSha ||
      result.sourceBefore.treeSha !== state.candidate.treeSha ||
      result.sourceBefore.clean !== true;
    const sourceAfterInvalid =
      result.sourceAfter.commitSha !== state.candidate.commitSha ||
      result.sourceAfter.treeSha !== state.candidate.treeSha ||
      result.sourceAfter.clean !== true;
    if (sourceBeforeInvalid || (sourceAfterInvalid && !expectedFailure)) {
      issues.push(`source-validation source changed at check ${expected.id}`);
    }
    if (
      result.workingDirectory?.policy !== "exact-candidate-root" ||
      result.workingDirectory?.classification !== "exact-candidate-root" ||
      result.workingDirectory?.commitSha !== state.candidate.commitSha ||
      result.workingDirectory?.treeSha !== state.candidate.treeSha
    ) {
      issues.push(`source-validation working directory mismatch: ${expected.id}`);
    }
    const processShapeValid = exactKeys(result.process, [
      "exitCode",
      "signal",
      "spawnError",
    ]) &&
      (result.process.exitCode === null ||
        (Number.isSafeInteger(result.process.exitCode) &&
          result.process.exitCode >= 0 &&
          result.process.exitCode <= 255)) &&
      (result.process.signal === null ||
        (typeof result.process.signal === "string" && result.process.signal)) &&
      (result.process.spawnError === null ||
        (typeof result.process.spawnError === "string" &&
          result.process.spawnError));
    const realFailedProcess =
      (Number.isSafeInteger(result.process?.exitCode) &&
        result.process.exitCode !== 0) ||
      (typeof result.process?.signal === "string" && result.process.signal) ||
      (typeof result.process?.spawnError === "string" &&
        result.process.spawnError);
    const sourceDriftFailure =
      expectedFailure && sourceAfterInvalid;
    const failedStageRecord = state.stages?.["source-validation"];
    const failedAsExpected =
      expectedFailure &&
      result.passed === false &&
      (realFailedProcess || sourceDriftFailure) &&
      failedStageRecord?.status === "failed" &&
      failedStageRecord.exitCode ===
        (result.process.exitCode === 0 ? 1 : (result.process.exitCode ?? 1)) &&
      failedStageRecord.signal === result.process.signal;
    const passedAsExpected =
      !expectedFailure &&
      result.process?.exitCode === 0 &&
      result.process?.signal === null &&
      result.process?.spawnError === null &&
      result.passed === true;
    if (!processShapeValid || (!failedAsExpected && !passedAsExpected)) {
      issues.push(`source-validation required check did not exit zero: ${expected.id}`);
    }
    for (const stream of ["stdout", "stderr"]) {
      const streamDescriptor = result?.[stream];
      if (
        !streamDescriptor ||
        !exactKeys(streamDescriptor, ["path", "sha256", "bytes"]) ||
        !isSha256(streamDescriptor.sha256) ||
        !Number.isSafeInteger(streamDescriptor.bytes) ||
        streamDescriptor.bytes < 0
      ) {
        issues.push(`source-validation ${stream} hash is missing: ${expected.id}`);
        continue;
      }
      try {
        const descriptor = {
          path: streamDescriptor.path,
          sha256: streamDescriptor.sha256,
        };
        const retained = resolvedEvidenceFile(
          evidenceRoot,
          descriptor,
          `source-validation ${stream} ${expected.id}`,
        );
        if (retained.bytes.byteLength !== streamDescriptor.bytes) {
          issues.push(`source-validation ${stream} size mismatch: ${expected.id}`);
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (
      !Array.isArray(result.generatedEvidence) ||
      result.generatedEvidence.length !== 3 ||
      !result.resultEvidence ||
      !exactKeys(result.resultEvidence, ["path", "sha256"]) ||
      JSON.stringify(result.generatedEvidence[2]) !==
        JSON.stringify(result.resultEvidence)
    ) {
      issues.push(`source-validation generated evidence is incomplete: ${expected.id}`);
    } else {
      for (const [evidenceIndex, generated] of result.generatedEvidence.entries()) {
      try {
        const retainedGenerated = resolvedEvidenceFile(
          evidenceRoot,
          generated,
          `source-validation generated evidence ${expected.id}:${evidenceIndex + 1}`,
        );
        if (evidenceIndex === 2) {
          const retainedResult = JSON.parse(
            retainedGenerated.bytes.toString("utf8"),
          );
          const expectedResult = structuredClone(result);
          delete expectedResult.resultEvidence;
          expectedResult.generatedEvidence = result.generatedEvidence.slice(0, 2);
          if (
            !retainedGenerated.bytes.equals(canonicalJsonBytes(retainedResult)) ||
            JSON.stringify(retainedResult) !== JSON.stringify(expectedResult)
          ) {
            issues.push(
              `source-validation result evidence contradicts aggregate: ${expected.id}`,
            );
          }
        }
      } catch (error) {
          issues.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    if (
      !isCanonicalUtcTimestamp(result.startedAt) ||
      !isCanonicalUtcTimestamp(result.completedAt) ||
      Date.parse(result.completedAt) < Date.parse(result.startedAt) ||
      Date.parse(result.startedAt) < Date.parse(priorCheckCompletedAt ?? "") ||
      Date.parse(result.completedAt) > Date.parse(evidence?.completedAt ?? "")
    ) {
      issues.push(`source-validation check timing is malformed: ${expected.id}`);
    }
    priorCheckCompletedAt = result.completedAt;
  }
  const expectedCompletionResult = requirePassed ? "passed" : "failed";
  if (
    !exactKeys(evidence?.completionMarker, [
      "complete",
      "result",
      "completedCheckCount",
    ]) ||
    evidence?.completionMarker?.complete !== true ||
    evidence?.completionMarker?.result !== expectedCompletionResult ||
    evidence?.completionMarker?.completedCheckCount !== observed.length ||
    evidence?.passed !== requirePassed ||
    (requirePassed
      ? evidence?.failedCheckId !== null || observed.length !== expectedIds.length
      : evidence?.failedCheckId !== observedIds.at(-1))
  ) {
    issues.push("source-validation completion marker is missing or failed");
  }
  issues.push(...sourceValidationAggregateIssues(evidence));
  if (verifyPhysicalSource) {
    try {
      assertExpectedSource(physicalSourceIdentity(repositoryRoot), state);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { valid: issues.length === 0, issues };
}

function excludedArtifactPath(relativePath) {
  return ARTIFACT_EXCLUSIONS.some(
    (entry) => relativePath === entry || relativePath.startsWith(`${entry}/`),
  );
}

function walkPhysical(root, relativePath, records, { artifact = false } = {}) {
  const absolute = path.join(root, relativePath);
  const metadata = lstatSync(absolute);
  if (metadata.isDirectory()) {
    for (const entry of readdirSync(absolute).sort()) {
      const child = portable(path.posix.join(portable(relativePath), entry));
      if (artifact && excludedArtifactPath(child)) continue;
      walkPhysical(root, child, records, { artifact });
    }
    return;
  }
  if (!metadata.isFile() && !metadata.isSymbolicLink()) {
    throw new Error(`physical inventory contains a prohibited path type: ${relativePath}`);
  }
  if (metadata.isSymbolicLink()) {
    const target = realpathSync(absolute);
    const physicalRoot = realpathSync(root);
    if (target !== physicalRoot && !target.startsWith(`${physicalRoot}${path.sep}`)) {
      throw new Error(`physical inventory contains an escaping symlink: ${relativePath}`);
    }
    const link = readlinkSync(absolute);
    const bytes = Buffer.from(link, "utf8");
    records.push({
      path: portable(relativePath),
      type: "symlink",
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
      target: portable(path.relative(physicalRoot, target)),
    });
    return;
  }
  const bytes = readFileSync(absolute);
  if (bytes.byteLength !== statSync(absolute).size) {
    throw new Error(`physical file changed while hashing: ${relativePath}`);
  }
  records.push({
    path: portable(relativePath),
    type: "file",
    bytes: bytes.byteLength,
    sha256: sha256Bytes(bytes),
    target: null,
  });
}

function sealedInventory(records) {
  const sorted = [...records].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  if (new Set(sorted.map((record) => record.path)).size !== sorted.length) {
    throw new Error("physical inventory contains duplicate paths");
  }
  const semantic = {
    schema: PHYSICAL_INVENTORY_SCHEMA,
    files: sorted,
    fileCount: sorted.length,
    bytes: sorted.reduce((total, record) => total + record.bytes, 0),
  };
  return {
    ...semantic,
    inventorySha256: sha256Bytes(canonicalJsonBytes(semantic)),
  };
}

export function inventoryCanonicalApplicationArtifact(root) {
  const records = [];
  for (const artifactRoot of ARTIFACT_ROOTS) {
    if (!existsSync(path.join(root, artifactRoot))) {
      throw new Error(`canonical application artifact root is missing: ${artifactRoot}`);
    }
    walkPhysical(root, artifactRoot, records, { artifact: true });
  }
  const inventory = sealedInventory(records);
  const legacyDigest = records
    .map(
      (record) =>
        `${record.type}  ${record.sha256}  ${record.bytes}  ${record.path}  ${record.target ?? "-"}\n`,
    )
    .join("");
  return { ...inventory, artifactSha256: sha256Bytes(legacyDigest) };
}

export function inventoryExecutableArchiveClosure(root) {
  const records = [];
  walkPhysical(root, ".", records);
  return sealedInventory(
    records.filter(
      (record) => record.path !== ".certification/archive-inventory.json",
    ),
  );
}

function traceIdentities(root, artifactInventory) {
  const nftFiles = artifactInventory.files.filter((file) =>
    file.path.endsWith(".nft.json"),
  );
  const closure = [];
  const absoluteRoot = path.resolve(root);
  const physicalRoot = realpathSync(root);
  for (const nft of nftFiles) {
    const absolute = path.join(root, nft.path);
    let value;
    try {
      value = JSON.parse(readFileSync(absolute, "utf8"));
    } catch {
      throw new Error(`NFT inventory contains invalid JSON: ${nft.path}`);
    }
    if (!Array.isArray(value.files)) {
      throw new Error(`NFT inventory files array is missing: ${nft.path}`);
    }
    for (const reference of value.files) {
      if (typeof reference !== "string") {
        throw new Error(`NFT inventory contains an invalid reference: ${nft.path}`);
      }
      const resolved = path.resolve(absoluteRoot, path.dirname(nft.path), reference);
      if (
        resolved !== absoluteRoot &&
        !resolved.startsWith(`${absoluteRoot}${path.sep}`)
      ) {
        throw new Error(`NFT inventory reference escapes root: ${nft.path}`);
      }
      if (!existsSync(resolved)) {
        throw new Error(`NFT inventory reference is missing: ${nft.path}`);
      }
      const physicalResolved = realpathSync(resolved);
      if (
        physicalResolved !== physicalRoot &&
        !physicalResolved.startsWith(`${physicalRoot}${path.sep}`)
      ) {
        throw new Error(`NFT inventory reference escapes physical root: ${nft.path}`);
      }
      const metadata = lstatSync(resolved);
      if (metadata.isDirectory()) continue;
      if (!metadata.isFile() && !metadata.isSymbolicLink()) {
        throw new Error(`NFT inventory reference has a prohibited type: ${nft.path}`);
      }
      const bytes = metadata.isSymbolicLink()
        ? Buffer.from(readlinkSync(resolved), "utf8")
        : readFileSync(resolved);
      closure.push({
        nftPath: nft.path,
        path: portable(path.relative(absoluteRoot, resolved)),
        bytes: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
    }
  }
  if (nftFiles.length === 0 || closure.length === 0) {
    throw new Error("NFT and trace inventories must be non-empty");
  }
  return {
    nftInventorySha256: sha256Bytes(canonicalJsonBytes(nftFiles)),
    traceClosureSha256: sha256Bytes(
      canonicalJsonBytes(
        closure.sort((left, right) =>
          `${left.nftPath}:${left.path}`.localeCompare(`${right.nftPath}:${right.path}`),
        ),
      ),
    ),
  };
}

function verifierClosureSha256(root, rootClassification) {
  if (rootClassification === "live-final-artifact") {
    return deriveProductionVerifierClosure(root).closureSha256;
  }
  const closure = canonicalRead(
    path.join(root, ".certification/verifier-source-closure.json"),
    "physical verifier source closure",
  ).value;
  if (!isSha256(closure?.closureSha256)) {
    throw new Error("physical verifier source closure digest is missing");
  }
  return closure.closureSha256;
}

function artifactIdentity(root, rootClassification, state, bindingOverrides = {}) {
  const manifestRead = canonicalRead(
    path.join(root, DEFAULT_MANIFEST),
    "production manifest v3",
  );
  const journalRead = canonicalRead(
    path.join(root, DEFAULT_JOURNAL),
    "semantic journal v2",
  );
  const applicationArtifact = inventoryCanonicalApplicationArtifact(root);
  const manifest = manifestRead.value;
  const journal = journalRead.value;
  const journalIssues = certificationPreparedBuildJournalIssues(journal);
  if (journalIssues.length > 0) {
    throw new Error(`physical semantic journal is invalid: ${journalIssues.join("; ")}`);
  }
  const buildId = readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim();
  const trace = traceIdentities(root, applicationArtifact);
  const expected = { ...state.bindings, ...bindingOverrides };
  if (
    manifest.source?.commitSha !== state.candidate.commitSha ||
    manifest.source?.treeSha !== state.candidate.treeSha ||
    manifest.build?.nextBuildId !== buildId ||
    manifest.artifact?.sha256 !== applicationArtifact.artifactSha256 ||
    journal.schema !== PRODUCTION_EVIDENCE_JOURNAL_SCHEMA ||
    journal.version !== PRODUCTION_EVIDENCE_JOURNAL_VERSION ||
    (expected.nextBuildId && expected.nextBuildId !== buildId) ||
    (expected.artifactSha256 &&
      expected.artifactSha256 !== applicationArtifact.artifactSha256) ||
    (expected.productionManifestSha256 &&
      expected.productionManifestSha256 !== manifestRead.sha256) ||
    (expected.semanticJournalSha256 &&
      expected.semanticJournalSha256 !== journalRead.sha256) ||
    (expected.semanticJournalNonce &&
      expected.semanticJournalNonce !== journal.runNonce)
  ) {
    throw new Error("physical artifact identity contradicts candidate state");
  }
  const files = Object.fromEntries(
    Object.entries(IDENTITY_FILES).map(([name, relativePath]) => {
      const bytes = readFileSync(path.join(root, relativePath));
      return [name, sha256Bytes(bytes)];
    }),
  );
  return {
    identity: {
      certificationId: state.certificationId,
      candidateId: state.candidate.id,
      commitSha: state.candidate.commitSha,
      treeSha: state.candidate.treeSha,
      harnessVersion: state.harness.version,
      harnessSourceSha256: state.harness.sourceSha256,
      nextBuildId: buildId,
      artifactSha256: applicationArtifact.artifactSha256,
      productionManifestSha256: manifestRead.sha256,
      semanticJournalSha256: journalRead.sha256,
      semanticJournalNonce: journal.runNonce,
      verifierSourceClosureSha256: verifierClosureSha256(
        root,
        rootClassification,
      ),
      traceClosureSha256: trace.traceClosureSha256,
      nftInventorySha256: trace.nftInventorySha256,
      ...files,
    },
    applicationArtifact,
  };
}

function safeArchiveEntries(entries) {
  for (const entry of entries) {
    const normalized = path.posix.normalize(entry);
    if (
      entry.startsWith("/") ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized !== entry
    ) {
      throw new Error("compressed archive contains an unsafe path");
    }
  }
}

function inspectCompressedArchive(archivePath, action) {
  const archiveBytes = readFileSync(archivePath);
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), "production-certification-compressed-snapshot-"),
  );
  try {
    const tarPath = path.join(temporaryRoot, "archive.tar");
    const extracted = path.join(temporaryRoot, "root");
    writeFileSync(tarPath, gunzipSync(archiveBytes), { flag: "wx", mode: 0o600 });
    const listed = spawnSync("tar", ["-tf", tarPath], { encoding: "utf8" });
    if (listed.error || listed.signal || listed.status !== 0) {
      throw new Error("compressed archive inventory cannot be read");
    }
    safeArchiveEntries(listed.stdout.trim().split("\n").filter(Boolean));
    mkdirSync(extracted, { mode: 0o700 });
    const extraction = spawnSync("tar", ["-xf", tarPath, "-C", extracted], {
      encoding: "utf8",
    });
    if (extraction.error || extraction.signal || extraction.status !== 0) {
      throw new Error("compressed archive inventory cannot be extracted");
    }
    return action({
      root: extracted,
      bytes: archiveBytes,
      sha256: sha256Bytes(archiveBytes),
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function rootPayload(sidecar) {
  const payload = structuredClone(sidecar);
  delete payload.sealSha256;
  return payload;
}

function sealRootSidecar(sidecar) {
  const payload = rootPayload(sidecar);
  return {
    ...payload,
    sealSha256: sha256Bytes(
      Buffer.concat([Buffer.from(ROOT_SEAL_DOMAIN), canonicalJsonBytes(payload)]),
    ),
  };
}

function snapshotPayload(snapshot) {
  const payload = structuredClone(snapshot);
  delete payload.snapshotSha256;
  return payload;
}

function sealSnapshot(snapshot) {
  const payload = snapshotPayload(snapshot);
  return {
    ...payload,
    snapshotSha256: sha256Bytes(
      Buffer.concat([
        Buffer.from(SNAPSHOT_SEAL_DOMAIN),
        canonicalJsonBytes(payload),
      ]),
    ),
  };
}

function captureTimestamp(state, position) {
  const contract = continuityContractForPosition(state, position);
  const startedAt = state.stages[contract.stage].startedAt;
  return state.executionClass === "deterministic-simulation"
    ? new Date(Date.parse(startedAt) + 50).toISOString()
    : new Date().toISOString();
}

function continuityContractForPosition(state, position, repositoryRoot = null) {
  const root = repositoryRoot ?? process.cwd();
  const contract = continuityContract(root);
  const lifecycle = contract.lifecyclePositions.find((entry) => entry.id === position);
  if (!lifecycle) throw new Error(`unknown continuity lifecycle position: ${position}`);
  if (state.stages[lifecycle.stage]?.status !== "running") {
    throw new Error(`continuity snapshot ${position} requires running stage ${lifecycle.stage}`);
  }
  return lifecycle;
}

function physicalRootRecord(rootPath, lifecycle, state, capturedAt) {
  const resolved = path.resolve(rootPath);
  const metadata = lstatSync(resolved);
  if (metadata.isSymbolicLink()) {
    throw new Error(`continuity physical root is a symlink: ${lifecycle.id}`);
  }
  const expectedFile = lifecycle.rootClassification === "compressed-archive-file";
  if ((expectedFile && !metadata.isFile()) || (!expectedFile && !metadata.isDirectory())) {
    throw new Error(`continuity physical root has the wrong type: ${lifecycle.id}`);
  }
  return sealRootSidecar({
    schema: PRODUCTION_CERTIFICATION_ARTIFACT_ROOT_SCHEMA,
    version: 1,
    certificationId: state.certificationId,
    candidate: structuredClone(state.candidate),
    lifecyclePosition: lifecycle.id,
    rootClassification: lifecycle.rootClassification,
    absoluteRoot: resolved,
    realpath: realpathSync(resolved),
    device: String(metadata.dev),
    inode: String(metadata.ino),
    kind: expectedFile ? "file" : "directory",
    capturedAt,
    complete: true,
  });
}

export function lifecyclePhysicalPath({
  repositoryRoot,
  evidenceRoot,
  position,
}) {
  if (["immediateBuild", "postPhase8Live", "postRuntimeBrowserLive"].includes(position)) {
    return path.resolve(repositoryRoot);
  }
  if (position === "stagedArchive") {
    return path.join(evidenceRoot, "archive/stage");
  }
  if (position === "compressedArchive") {
    return path.join(evidenceRoot, "archive/candidate.tar.gz");
  }
  if (position === "extractedArchive") {
    return path.join(evidenceRoot, "archive/extracted");
  }
  throw new Error(`unknown continuity lifecycle position: ${position}`);
}

function assertLifecycleRootPolicy({
  repositoryRoot,
  evidenceRoot,
  lifecycle,
  rootPath,
}) {
  const repository = realpathSync(repositoryRoot);
  const evidence = realpathSync(evidenceRoot);
  const physical = realpathSync(rootPath);
  if (lifecycle.rootClassification === "live-final-artifact") {
    if (physical !== repository) {
      throw new Error("continuity live root is not the exact candidate worktree");
    }
  } else if (
    physical === repository ||
    physical.startsWith(`${repository}${path.sep}`) ||
    (physical !== evidence && !physical.startsWith(`${evidence}${path.sep}`))
  ) {
    throw new Error("continuity archive root used a source-worktree or canonical-checkout fallback");
  }
}

export function captureArtifactSnapshot({
  repositoryRoot,
  evidenceRoot,
  state,
  position,
  bindingOverrides = {},
}) {
  const contract = continuityContract(repositoryRoot);
  const lifecycle = continuityContractForPosition(state, position, repositoryRoot);
  const rootPath = lifecyclePhysicalPath({ repositoryRoot, evidenceRoot, position });
  assertLifecycleRootPolicy({ repositoryRoot, evidenceRoot, lifecycle, rootPath });
  const capturedAt = captureTimestamp(state, position);
  const rootSidecar = physicalRootRecord(rootPath, lifecycle, state, capturedAt);
  const rootPathEvidence = path.join(
    evidenceRoot,
    "continuity/private",
    `${position}.json`,
  );
  writeCanonicalExclusive(evidenceRoot, rootPathEvidence, rootSidecar);
  const rootDescriptor = evidenceDescriptor(evidenceRoot, rootPathEvidence);
  let measured;
  let archive = null;
  if (position === "compressedArchive") {
    measured = inspectCompressedArchive(rootPath, ({ root, bytes, sha256 }) => {
      const closure = inventoryExecutableArchiveClosure(root);
      return {
        identity: artifactIdentity(
          root,
          "extracted-archive-tree",
          state,
          bindingOverrides,
        ).identity,
        applicationArtifact: null,
        archiveClosure: closure,
        archive: {
          sha256,
          bytes: bytes.byteLength,
          inventorySha256: closure.inventorySha256,
          constructorInventorySha256:
            bindingOverrides.archiveInventorySha256 ??
            state.bindings.archiveInventorySha256,
          constructorVersion: 1,
          constructorSha256: sha256Bytes(
            readFileSync(path.join(repositoryRoot, "scripts/production-archive.mjs")),
          ),
        },
      };
    });
    archive = measured.archive;
  } else {
    const artifact = artifactIdentity(
      rootPath,
      lifecycle.rootClassification,
      state,
      bindingOverrides,
    );
    measured = {
      identity: artifact.identity,
      applicationArtifact: artifact.applicationArtifact,
      archiveClosure: lifecycle.scopes.includes("executableArchiveClosure")
        ? inventoryExecutableArchiveClosure(rootPath)
        : null,
    };
  }
  const snapshotBase = {
    schema: PRODUCTION_CERTIFICATION_ARTIFACT_SNAPSHOT_SCHEMA,
    version: 1,
    certificationId: state.certificationId,
    candidate: structuredClone(state.candidate),
    harness: structuredClone(state.harness),
    contractMatrixSha256: contract.contractMatrixSha256,
    continuityContractSha256: contract.sha256,
    lifecyclePosition: position,
    captureTime: capturedAt,
    captureCommand: lifecycle.captureCommand,
    physicalRootClassification: lifecycle.rootClassification,
    physicalRootEvidenceSha256: rootDescriptor.sha256,
    identity: measured.identity,
    scopes: {
      canonicalApplicationArtifact: measured.applicationArtifact,
      executableArchiveClosure: measured.archiveClosure,
      compressedArchiveBytes: archive,
    },
    completionMarker: { complete: true, measuredFromPhysicalRoot: true },
  };
  const captureEventId = sha256Bytes(canonicalJsonBytes(snapshotBase));
  const snapshot = sealSnapshot({ ...snapshotBase, captureEventId });
  const snapshotPath = path.join(
    evidenceRoot,
    "continuity/snapshots",
    `${position}.json`,
  );
  writeCanonicalExclusive(evidenceRoot, snapshotPath, snapshot);
  return Object.freeze({
    snapshot,
    snapshotDescriptor: evidenceDescriptor(evidenceRoot, snapshotPath),
    rootDescriptor,
  });
}

function snapshotSealIssues(snapshot) {
  if (!isSha256(snapshot?.snapshotSha256)) {
    return ["artifact snapshot seal is missing"];
  }
  return sealSnapshot(snapshot).snapshotSha256 === snapshot.snapshotSha256
    ? []
    : ["artifact snapshot seal mismatch"];
}

function validatePhysicalInventory(inventory, description) {
  const issues = [];
  if (
    !exactKeys(inventory, [
      "schema",
      "files",
      "fileCount",
      "bytes",
      "inventorySha256",
      ...(Object.hasOwn(inventory ?? {}, "artifactSha256")
        ? ["artifactSha256"]
        : []),
    ]) ||
    inventory?.schema !== PHYSICAL_INVENTORY_SCHEMA ||
    !Array.isArray(inventory?.files)
  ) {
    return [`${description} inventory shape is invalid`];
  }
  const paths = [];
  let bytes = 0;
  for (const file of inventory.files) {
    if (
      !exactKeys(file, ["path", "type", "bytes", "sha256", "target"]) ||
      typeof file.path !== "string" ||
      !file.path ||
      path.posix.normalize(file.path) !== file.path ||
      !["file", "symlink"].includes(file.type) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !isSha256(file.sha256) ||
      (file.type === "file" && file.target !== null) ||
      (file.type === "symlink" && typeof file.target !== "string")
    ) {
      issues.push(`${description} inventory file is malformed`);
      continue;
    }
    paths.push(file.path);
    bytes += file.bytes;
  }
  if (
    new Set(paths).size !== paths.length ||
    JSON.stringify(paths) !== JSON.stringify([...paths].sort())
  ) {
    issues.push(`${description} inventory paths are duplicated or unordered`);
  }
  const semantic = {
    schema: inventory.schema,
    files: inventory.files,
    fileCount: inventory.fileCount,
    bytes: inventory.bytes,
  };
  if (
    inventory.fileCount !== inventory.files.length ||
    inventory.bytes !== bytes ||
    inventory.inventorySha256 !== sha256Bytes(canonicalJsonBytes(semantic))
  ) {
    issues.push(`${description} inventory aggregate is invalid`);
  }
  return issues;
}

function expectedSnapshotIdentityKeys() {
  return [
    "certificationId",
    "candidateId",
    "commitSha",
    "treeSha",
    "harnessVersion",
    "harnessSourceSha256",
    "nextBuildId",
    "artifactSha256",
    "productionManifestSha256",
    "semanticJournalSha256",
    "semanticJournalNonce",
    "verifierSourceClosureSha256",
    "traceClosureSha256",
    "nftInventorySha256",
    "requiredServerFilesSha256",
    "buildManifestSha256",
    "routesManifestSha256",
    "prerenderManifestSha256",
  ];
}

export function validateArtifactSnapshotEvidence({
  snapshot,
  rootSidecar,
  state,
  repositoryRoot,
  evidenceRoot,
  position,
  rehashPhysicalRoot = false,
}) {
  const issues = [];
  const mismatches = [];
  let contract;
  let lifecycle;
  try {
    contract = continuityContract(repositoryRoot);
    lifecycle = contract.lifecyclePositions.find((entry) => entry.id === position);
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
  if (
    snapshot?.schema !== PRODUCTION_CERTIFICATION_ARTIFACT_SNAPSHOT_SCHEMA ||
    snapshot?.version !== 1 ||
    snapshot?.lifecyclePosition !== position ||
    snapshot?.captureCommand !== lifecycle.captureCommand ||
    snapshot?.physicalRootClassification !== lifecycle.rootClassification ||
    snapshot?.completionMarker?.complete !== true ||
    snapshot?.completionMarker?.measuredFromPhysicalRoot !== true ||
    !isSha256(snapshot?.captureEventId)
  ) {
    issues.push(`artifact snapshot contract is incomplete: ${position}`);
  }
  if (
    snapshot?.certificationId !== state.certificationId ||
    JSON.stringify(snapshot?.candidate) !== JSON.stringify(state.candidate) ||
    JSON.stringify(snapshot?.harness) !== JSON.stringify(state.harness) ||
    snapshot?.contractMatrixSha256 !== contract.contractMatrixSha256 ||
    snapshot?.continuityContractSha256 !== contract.sha256
  ) {
    issues.push(`artifact snapshot identity is stale or cross-run: ${position}`);
  }
  if (
    !isCanonicalUtcTimestamp(snapshot?.captureTime) ||
    !exactKeys(snapshot?.identity, expectedSnapshotIdentityKeys()) ||
    Object.entries(snapshot?.identity ?? {}).some(([name, value]) =>
      [
        "certificationId",
        "candidateId",
        "commitSha",
        "treeSha",
        "nextBuildId",
        "semanticJournalNonce",
      ].includes(name)
        ? typeof value !== "string" || !value
        : name === "harnessVersion"
          ? value !== state.harness.version
          : !isSha256(value),
    )
  ) {
    issues.push(`artifact snapshot identity fields are malformed: ${position}`);
  }
  const expectedBoundIdentity = {
    certificationId: state.certificationId,
    candidateId: state.candidate.id,
    commitSha: state.candidate.commitSha,
    treeSha: state.candidate.treeSha,
    harnessVersion: state.harness.version,
    harnessSourceSha256: state.harness.sourceSha256,
    nextBuildId: state.bindings.nextBuildId,
    artifactSha256: state.bindings.artifactSha256,
    productionManifestSha256: state.bindings.productionManifestSha256,
    semanticJournalSha256: state.bindings.semanticJournalSha256,
    semanticJournalNonce: state.bindings.semanticJournalNonce,
    verifierSourceClosureSha256: state.bindings.verifierSourceClosureSha256,
  };
  for (const [name, expected] of Object.entries(expectedBoundIdentity)) {
    if (expected !== null && snapshot?.identity?.[name] !== expected) {
      issues.push(`artifact snapshot identity contradicts state: ${position}:${name}`);
    }
  }
  const captureEventPayload = snapshotPayload(snapshot);
  delete captureEventPayload.captureEventId;
  if (
    snapshot?.captureEventId !==
    sha256Bytes(canonicalJsonBytes(captureEventPayload))
  ) {
    issues.push(`artifact snapshot capture event is invalid: ${position}`);
  }
  const app = snapshot?.scopes?.canonicalApplicationArtifact;
  const closure = snapshot?.scopes?.executableArchiveClosure;
  const archive = snapshot?.scopes?.compressedArchiveBytes;
  if (lifecycle.scopes.includes("canonicalApplicationArtifact")) {
    issues.push(...validatePhysicalInventory(app, `${position} application artifact`));
    if (!isSha256(app?.artifactSha256)) {
      issues.push(`artifact snapshot application hash is missing: ${position}`);
    } else if (app.artifactSha256 !== snapshot?.identity?.artifactSha256) {
      issues.push(`artifact snapshot application identity is inconsistent: ${position}`);
    }
  } else if (app !== null) {
    issues.push(`artifact snapshot has an undeclared application scope: ${position}`);
  }
  if (lifecycle.scopes.includes("executableArchiveClosure")) {
    issues.push(...validatePhysicalInventory(closure, `${position} archive closure`));
  } else if (closure !== null) {
    issues.push(`artifact snapshot has an undeclared archive scope: ${position}`);
  }
  if (lifecycle.scopes.includes("compressedArchiveBytes")) {
    if (
      !exactKeys(archive, [
        "sha256",
        "bytes",
        "inventorySha256",
        "constructorInventorySha256",
        "constructorVersion",
        "constructorSha256",
      ]) ||
      !isSha256(archive?.sha256) ||
      !Number.isSafeInteger(archive?.bytes) ||
      archive.bytes <= 0 ||
      archive.inventorySha256 !== closure?.inventorySha256 ||
      archive.constructorInventorySha256 !==
        state.bindings.archiveInventorySha256 ||
      archive.sha256 !== state.bindings.archiveSha256 ||
      archive.constructorVersion !== 1 ||
      archive.constructorSha256 !==
        sha256Bytes(
          readFileSync(path.join(repositoryRoot, "scripts/production-archive.mjs")),
        )
    ) {
      issues.push("compressed archive snapshot identity is incomplete");
    }
  } else if (archive !== null) {
    issues.push(`artifact snapshot has undeclared archive bytes: ${position}`);
  }
  issues.push(...snapshotSealIssues(snapshot));
  const expectedRootKeys = [
    "schema",
    "version",
    "certificationId",
    "candidate",
    "lifecyclePosition",
    "rootClassification",
    "absoluteRoot",
    "realpath",
    "device",
    "inode",
    "kind",
    "capturedAt",
    "complete",
    "sealSha256",
  ];
  if (
    !exactKeys(rootSidecar, expectedRootKeys) ||
    rootSidecar?.schema !== PRODUCTION_CERTIFICATION_ARTIFACT_ROOT_SCHEMA ||
    rootSidecar?.version !== 1 ||
    rootSidecar?.certificationId !== state.certificationId ||
    JSON.stringify(rootSidecar?.candidate) !== JSON.stringify(state.candidate) ||
    rootSidecar?.lifecyclePosition !== position ||
    rootSidecar?.rootClassification !== lifecycle.rootClassification ||
    typeof rootSidecar?.absoluteRoot !== "string" ||
    !path.isAbsolute(rootSidecar.absoluteRoot) ||
    typeof rootSidecar?.realpath !== "string" ||
    !path.isAbsolute(rootSidecar.realpath) ||
    typeof rootSidecar?.device !== "string" ||
    !rootSidecar.device ||
    typeof rootSidecar?.inode !== "string" ||
    !rootSidecar.inode ||
    rootSidecar?.kind !==
      (lifecycle.rootClassification === "compressed-archive-file"
        ? "file"
        : "directory") ||
    rootSidecar?.capturedAt !== snapshot?.captureTime ||
    rootSidecar?.complete !== true ||
    !isSha256(rootSidecar?.sealSha256) ||
    sealRootSidecar(rootSidecar).sealSha256 !== rootSidecar.sealSha256 ||
    snapshot?.physicalRootEvidenceSha256 !==
      sha256Bytes(canonicalJsonBytes(rootSidecar))
  ) {
    issues.push(`artifact snapshot private root evidence is invalid: ${position}`);
  }
  if (rehashPhysicalRoot) {
    try {
      const expectedPath = lifecyclePhysicalPath({
        repositoryRoot,
        evidenceRoot,
        position,
      });
      assertLifecycleRootPolicy({
        repositoryRoot,
        evidenceRoot,
        lifecycle,
        rootPath: expectedPath,
      });
      const metadata = lstatSync(expectedPath);
      if (
        rootSidecar.realpath !== realpathSync(expectedPath) ||
        rootSidecar.device !== String(metadata.dev) ||
        rootSidecar.inode !== String(metadata.ino)
      ) {
        issues.push(`artifact physical root was replaced after capture: ${position}`);
        mismatches.push({
          lifecyclePosition: position,
          scope: "physicalRoot",
          path: ".",
          kind: "replaced-root",
          expected: {
            realpath: rootSidecar.realpath,
            device: rootSidecar.device,
            inode: rootSidecar.inode,
          },
          actual: {
            realpath: realpathSync(expectedPath),
            device: String(metadata.dev),
            inode: String(metadata.ino),
          },
        });
      }
      const current =
        position === "compressedArchive"
          ? inspectCompressedArchive(expectedPath, ({ root, bytes, sha256 }) => {
              const archiveClosure = inventoryExecutableArchiveClosure(root);
              let identity = null;
              let identityError = null;
              try {
                identity = artifactIdentity(
                  root,
                  "extracted-archive-tree",
                  state,
                ).identity;
              } catch (error) {
                identityError = error instanceof Error ? error.message : String(error);
              }
              return {
                applicationArtifact: null,
                archiveClosure,
                archive: {
                  sha256,
                  bytes: bytes.byteLength,
                  inventorySha256: archiveClosure.inventorySha256,
                  constructorInventorySha256:
                    state.bindings.archiveInventorySha256,
                  constructorVersion: 1,
                  constructorSha256: sha256Bytes(
                    readFileSync(
                      path.join(repositoryRoot, "scripts/production-archive.mjs"),
                    ),
                  ),
                },
                identity,
                identityError,
                identityRoot: root,
              };
            })
          : (() => {
              const applicationArtifact =
                inventoryCanonicalApplicationArtifact(expectedPath);
              const archiveClosure = lifecycle.scopes.includes(
                "executableArchiveClosure",
              )
                ? inventoryExecutableArchiveClosure(expectedPath)
                : null;
              let identity = null;
              let identityError = null;
              try {
                identity = artifactIdentity(
                  expectedPath,
                  lifecycle.rootClassification,
                  state,
                ).identity;
              } catch (error) {
                identityError = error instanceof Error ? error.message : String(error);
              }
              return {
                applicationArtifact,
                archiveClosure,
                archive: null,
                identity,
                identityError,
                identityRoot: expectedPath,
              };
            })();
      if (current.identityError) {
        issues.push(
          `artifact physical identity is invalid: ${position}: ${current.identityError}`,
        );
        mismatches.push(
          ...physicalIdentityFileMismatchDetails(
            current.identityRoot,
            snapshot,
            position,
          ),
        );
      }
      if (
        JSON.stringify(current.identity) !== JSON.stringify(snapshot.identity) ||
        JSON.stringify(current.applicationArtifact) !== JSON.stringify(app) ||
        JSON.stringify(current.archiveClosure) !== JSON.stringify(closure) ||
        (position === "compressedArchive" &&
          JSON.stringify(current.archive) !== JSON.stringify(archive))
      ) {
        issues.push(`artifact physical root no longer matches snapshot: ${position}`);
        mismatches.push(
          ...physicalSnapshotMismatchDetails(
            position,
            snapshot,
            current,
          ),
        );
      }
    } catch (error) {
      const physicalPath = lifecyclePhysicalPath({
        repositoryRoot,
        evidenceRoot,
        position,
      });
      const rootStillExists = existsSync(physicalPath);
      issues.push(
        `artifact physical root ${
          rootStillExists ? "measurement failed" : "is unavailable"
        }: ${position}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      mismatches.push({
        lifecyclePosition: position,
        scope: "physicalRoot",
        path: ".",
        kind: rootStillExists ? "measurement-failure" : "unavailable-root",
        expected: rootSidecar?.realpath ?? null,
        actual: null,
      });
      if (rootStillExists && position === "compressedArchive") {
        const bytes = readFileSync(physicalPath);
        mismatches.push({
          lifecyclePosition: position,
          scope: "compressedArchiveBytes",
          path: "archive/candidate.tar.gz",
          kind: "file-identity-mismatch",
          expected: {
            sha256: archive?.sha256 ?? null,
            bytes: archive?.bytes ?? null,
          },
          actual: {
            sha256: sha256Bytes(bytes),
            bytes: bytes.byteLength,
          },
        });
      } else if (rootStillExists) {
        for (const artifactRoot of ARTIFACT_ROOTS) {
          if (!existsSync(path.join(physicalPath, artifactRoot))) {
            mismatches.push({
              lifecyclePosition: position,
              scope: "canonicalApplicationArtifact",
              path: artifactRoot,
              kind: "missing-path",
              expected: "directory",
              actual: null,
            });
          }
        }
      }
    }
  }
  return { valid: issues.length === 0, issues, mismatches };
}

function continuityPayload(value) {
  const payload = structuredClone(value);
  delete payload.continuitySha256;
  return payload;
}

function sealContinuityEvidence(value) {
  const payload = continuityPayload(value);
  return {
    ...payload,
    continuitySha256: sha256Bytes(
      Buffer.concat([
        Buffer.from(CONTINUITY_SEAL_DOMAIN),
        canonicalJsonBytes(payload),
      ]),
    ),
  };
}

function readSnapshotPair({ evidenceRoot, state, position }) {
  const snapshotDescriptor = state.evidenceFiles[snapshotEvidenceName(position)];
  const rootDescriptor = state.evidenceFiles[rootEvidenceName(position)];
  if (!snapshotDescriptor || !rootDescriptor) {
    throw new Error(`continuity snapshot evidence is missing: ${position}`);
  }
  const snapshotRead = resolvedEvidenceFile(
    evidenceRoot,
    snapshotDescriptor,
    `artifact snapshot ${position}`,
  );
  const rootRead = resolvedEvidenceFile(
    evidenceRoot,
    rootDescriptor,
    `artifact root ${position}`,
  );
  return {
    snapshotDescriptor,
    rootDescriptor,
    snapshot: JSON.parse(snapshotRead.bytes.toString("utf8")),
    rootSidecar: JSON.parse(rootRead.bytes.toString("utf8")),
  };
}

function inventoryMismatchDetails(
  expected,
  actual,
  { lifecyclePosition = null, scope },
) {
  if (!Array.isArray(expected?.files) || !Array.isArray(actual?.files)) {
    return [
      {
        lifecyclePosition,
        scope,
        path: ".",
        kind: "invalid-inventory",
        expected: expected?.inventorySha256 ?? null,
        actual: actual?.inventorySha256 ?? null,
      },
    ];
  }
  const expectedFiles = new Map(expected.files.map((file) => [file.path, file]));
  const actualFiles = new Map(actual.files.map((file) => [file.path, file]));
  const details = [];
  for (const filePath of [...new Set([...expectedFiles.keys(), ...actualFiles.keys()])].sort()) {
    const expectedFile = expectedFiles.get(filePath) ?? null;
    const actualFile = actualFiles.get(filePath) ?? null;
    if (!expectedFile) {
      details.push({
        lifecyclePosition,
        scope,
        path: filePath,
        kind: "extra-path",
        expected: null,
        actual: actualFile,
      });
    } else if (!actualFile) {
      details.push({
        lifecyclePosition,
        scope,
        path: filePath,
        kind: "missing-path",
        expected: expectedFile,
        actual: null,
      });
    } else if (JSON.stringify(expectedFile) !== JSON.stringify(actualFile)) {
      details.push({
        lifecyclePosition,
        scope,
        path: filePath,
        kind: "file-identity-mismatch",
        expected: expectedFile,
        actual: actualFile,
      });
    }
  }
  for (const field of ["fileCount", "bytes", "inventorySha256", "artifactSha256"]) {
    if (expected?.[field] !== actual?.[field]) {
      details.push({
        lifecyclePosition,
        scope,
        path: field,
        kind: "aggregate-mismatch",
        expected: expected?.[field] ?? null,
        actual: actual?.[field] ?? null,
      });
    }
  }
  return details;
}

function physicalIdentityFileMismatchDetails(root, snapshot, position) {
  const details = [];
  const files = [
    ["productionManifestSha256", DEFAULT_MANIFEST],
    ["semanticJournalSha256", DEFAULT_JOURNAL],
    ...Object.entries(IDENTITY_FILES),
  ];
  for (const [identityField, relativePath] of files) {
    let actual = null;
    try {
      actual = sha256Bytes(readFileSync(path.join(root, relativePath)));
    } catch {
      // A missing physical identity file is represented by a null actual value.
    }
    const expected = snapshot.identity?.[identityField] ?? null;
    if (actual !== expected) {
      details.push({
        lifecyclePosition: position,
        scope: "identity",
        path: relativePath,
        kind: actual === null ? "missing-path" : "file-identity-mismatch",
        expected,
        actual,
      });
    }
  }
  let actualBuildId = null;
  try {
    actualBuildId = readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim();
  } catch {
    // A missing BUILD_ID is represented by a null actual value.
  }
  if (actualBuildId !== snapshot.identity?.nextBuildId) {
    details.push({
      lifecyclePosition: position,
      scope: "identity",
      path: ".next/BUILD_ID",
      kind: actualBuildId === null ? "missing-path" : "field-mismatch",
      expected: snapshot.identity?.nextBuildId ?? null,
      actual: actualBuildId,
    });
  }
  return details;
}

function objectMismatchDetails(
  expected,
  actual,
  { lifecyclePosition = null, scope },
) {
  const details = [];
  for (const field of [
    ...new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})]),
  ].sort()) {
    if (JSON.stringify(expected?.[field]) !== JSON.stringify(actual?.[field])) {
      details.push({
        lifecyclePosition,
        scope,
        path: field,
        kind: "field-mismatch",
        expected: expected?.[field] ?? null,
        actual: actual?.[field] ?? null,
      });
    }
  }
  return details;
}

function physicalSnapshotMismatchDetails(position, snapshot, current) {
  return [
    ...objectMismatchDetails(snapshot.identity, current.identity, {
      lifecyclePosition: position,
      scope: "identity",
    }),
    ...(snapshot.scopes.canonicalApplicationArtifact === null &&
    current.applicationArtifact === null
      ? []
      : inventoryMismatchDetails(
          snapshot.scopes.canonicalApplicationArtifact,
          current.applicationArtifact,
          { lifecyclePosition: position, scope: "canonicalApplicationArtifact" },
        )),
    ...(snapshot.scopes.executableArchiveClosure === null &&
    current.archiveClosure === null
      ? []
      : inventoryMismatchDetails(
          snapshot.scopes.executableArchiveClosure,
          current.archiveClosure,
          { lifecyclePosition: position, scope: "executableArchiveClosure" },
        )),
    ...(snapshot.scopes.compressedArchiveBytes === null && current.archive === null
      ? []
      : objectMismatchDetails(
          snapshot.scopes.compressedArchiveBytes,
          current.archive,
          { lifecyclePosition: position, scope: "compressedArchiveBytes" },
        )),
  ];
}

function equalityComparison(id, positions, values) {
  const baseline = values[0];
  const mismatches = [];
  for (let index = 1; index < values.length; index += 1) {
    if (JSON.stringify(values[index]) !== JSON.stringify(baseline)) {
      mismatches.push({
        expectedPosition: positions[0],
        actualPosition: positions[index],
        expectedSha256: sha256Bytes(canonicalJsonBytes(baseline)),
        actualSha256: sha256Bytes(canonicalJsonBytes(values[index])),
        details:
          id === "complete-artifact-identity"
            ? objectMismatchDetails(baseline, values[index], { scope: id })
            : inventoryMismatchDetails(baseline, values[index], { scope: id }),
      });
    }
  }
  return { id, positions, equal: mismatches.length === 0, mismatches };
}

export function measureFinalContinuity({
  repositoryRoot,
  evidenceRoot,
  state,
  capturedAt = new Date().toISOString(),
  writeEvidence = true,
}) {
  const contract = continuityContract(repositoryRoot);
  const snapshots = new Map();
  const inputSnapshots = {};
  const issues = [];
  const snapshotPaths = new Set();
  const captureEvents = new Set();
  const physicalMismatches = [];
  for (const lifecycle of contract.lifecyclePositions) {
    try {
      const pair = readSnapshotPair({
        evidenceRoot,
        state,
        position: lifecycle.id,
      });
      if (snapshotPaths.has(pair.snapshotDescriptor.path)) {
        issues.push("continuity lifecycle snapshots share an evidence path");
      }
      snapshotPaths.add(pair.snapshotDescriptor.path);
      if (captureEvents.has(pair.snapshot.captureEventId)) {
        issues.push("continuity lifecycle snapshots share a capture event");
      }
      captureEvents.add(pair.snapshot.captureEventId);
      const validation = validateArtifactSnapshotEvidence({
        snapshot: pair.snapshot,
        rootSidecar: pair.rootSidecar,
        state,
        repositoryRoot,
        evidenceRoot,
        position: lifecycle.id,
        rehashPhysicalRoot: true,
      });
      issues.push(...validation.issues);
      physicalMismatches.push(...validation.mismatches);
      snapshots.set(lifecycle.id, pair.snapshot);
      inputSnapshots[lifecycle.id] = pair.snapshotDescriptor.sha256;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    const stage = realpathSync(
      lifecyclePhysicalPath({
        repositoryRoot,
        evidenceRoot,
        position: "stagedArchive",
      }),
    );
    const extracted = realpathSync(
      lifecyclePhysicalPath({
        repositoryRoot,
        evidenceRoot,
        position: "extractedArchive",
      }),
    );
    if (stage === extracted) {
      issues.push("staged and extracted archive roots alias the same realpath");
      physicalMismatches.push({
        lifecyclePosition: "stagedArchive/extractedArchive",
        scope: "physicalRoot",
        path: ".",
        kind: "aliased-roots",
        expected: "distinct-realpaths",
        actual: stage,
      });
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    physicalMismatches.push({
      lifecyclePosition: "stagedArchive/extractedArchive",
      scope: "physicalRoot",
      path: ".",
      kind: "unavailable-root",
      expected: "two retained distinct roots",
      actual: null,
    });
  }
  const comparisons = [];
  for (const [scope, positions] of Object.entries(contract.comparisons)) {
    if (positions.every((position) => snapshots.has(position))) {
      comparisons.push(
        equalityComparison(
          scope,
          positions,
          positions.map((position) =>
            scope === "canonicalApplicationArtifact"
              ? snapshots.get(position).scopes.canonicalApplicationArtifact
              : snapshots.get(position).scopes.executableArchiveClosure,
          ),
        ),
      );
    }
  }
  const identityPositions = contract.lifecyclePositions.map((entry) => entry.id);
  if (identityPositions.every((position) => snapshots.has(position))) {
    comparisons.push(
      equalityComparison(
        "complete-artifact-identity",
        identityPositions,
        identityPositions.map((position) => snapshots.get(position).identity),
      ),
    );
  }
  for (const comparison of comparisons) {
    if (!comparison.equal) {
      issues.push(`continuity comparison failed: ${comparison.id}`);
    }
  }
  const compressed = snapshots.get("compressedArchive")?.scopes
    ?.compressedArchiveBytes;
  if (
    compressed &&
    (compressed.sha256 !== state.bindings.archiveSha256 ||
      compressed.constructorInventorySha256 !==
        state.bindings.archiveInventorySha256 ||
      snapshots.get("compressedArchive").scopes.executableArchiveClosure
        .inventorySha256 !== compressed.inventorySha256)
  ) {
    issues.push("compressed archive identity contradicts state or closure inventory");
  }
  const completed = sealContinuityEvidence({
    schema: PRODUCTION_CERTIFICATION_CONTINUITY_SCHEMA,
    version: 1,
    certificationId: state.certificationId,
    candidate: structuredClone(state.candidate),
    harness: structuredClone(state.harness),
    contractMatrixSha256: contract.contractMatrixSha256,
    continuityContractSha256: contract.sha256,
    executionClass: state.executionClass,
    simulation: state.executionClass === "deterministic-simulation",
    inputSnapshots,
    comparisons,
    mismatches: [
      ...physicalMismatches,
      ...comparisons.flatMap((comparison) =>
        comparison.mismatches.map((mismatch) => ({
          comparison: comparison.id,
          ...mismatch,
        })),
      ),
    ],
    capturedAt,
    physicalRootsRehashed: true,
    complete: issues.length === 0,
    passed: issues.length === 0,
    issues,
    completionMarker: {
      complete: true,
      result: issues.length === 0 ? "passed" : "failed",
    },
  });
  if (!writeEvidence) return { evidence: completed, descriptor: null, issues };
  const attempt = state.stages?.continuity?.attempts?.at(-1);
  if (attempt?.status !== "running") {
    throw new Error("continuity evidence write requires a running stage attempt");
  }
  const filePath = path.join(
    evidenceRoot,
    "continuity",
    `attempt-${String(attempt.number).padStart(3, "0")}.json`,
  );
  writeCanonicalExclusive(evidenceRoot, filePath, completed);
  return {
    evidence: completed,
    descriptor: evidenceDescriptor(evidenceRoot, filePath),
    issues,
  };
}

export function validateContinuityEvidence(
  evidence,
  state,
  repositoryRoot,
  { requirePassed = true } = {},
) {
  const issues = [];
  let contract;
  try {
    contract = continuityContract(repositoryRoot);
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
  if (
    evidence?.schema !== PRODUCTION_CERTIFICATION_CONTINUITY_SCHEMA ||
    evidence?.version !== 1 ||
    evidence?.certificationId !== state.certificationId ||
    JSON.stringify(evidence?.candidate) !== JSON.stringify(state.candidate) ||
    JSON.stringify(evidence?.harness) !== JSON.stringify(state.harness) ||
    evidence?.contractMatrixSha256 !== contract.contractMatrixSha256 ||
    evidence?.continuityContractSha256 !== contract.sha256 ||
    evidence?.executionClass !== state.executionClass ||
    evidence?.simulation !== (state.executionClass === "deterministic-simulation")
  ) {
    issues.push("artifact continuity evidence is stale, cross-run, or unsupported");
  }
  const expectedPositions = contract.lifecyclePositions.map((entry) => entry.id);
  const expectedInputSnapshots = Object.fromEntries(
    expectedPositions.map((position) => [
      position,
      state.evidenceFiles?.[snapshotEvidenceName(position)]?.sha256,
    ]),
  );
  if (
    !exactKeys(evidence?.inputSnapshots, expectedPositions) ||
    Object.values(evidence?.inputSnapshots ?? {}).some((digest) => !isSha256(digest)) ||
    new Set(Object.values(evidence?.inputSnapshots ?? {})).size !==
      expectedPositions.length ||
    JSON.stringify(evidence?.inputSnapshots) !==
      JSON.stringify(expectedInputSnapshots)
  ) {
    issues.push(
      "artifact continuity input snapshots are incomplete, copied, duplicated, or unbound",
    );
  }
  const expectedComparisons = [
    ...Object.keys(contract.comparisons),
    "complete-artifact-identity",
  ];
  const expectedComparisonPositions = {
    ...contract.comparisons,
    "complete-artifact-identity": expectedPositions,
  };
  const comparisonsMalformed =
    !Array.isArray(evidence?.comparisons) ||
    JSON.stringify(evidence.comparisons.map((entry) => entry.id)) !==
      JSON.stringify(expectedComparisons) ||
    evidence.comparisons.some(
      (entry) =>
        !exactKeys(entry, ["id", "positions", "equal", "mismatches"]) ||
        JSON.stringify(entry.positions) !==
          JSON.stringify(expectedComparisonPositions[entry.id]) ||
        !Array.isArray(entry.mismatches) ||
        (entry.equal === true) !== (entry.mismatches.length === 0),
    );
  const resultMalformed = requirePassed
    ? evidence?.complete !== true ||
      evidence?.passed !== true ||
      evidence?.completionMarker?.result !== "passed" ||
      evidence?.comparisons?.some(
        (entry) => entry.equal !== true || entry.mismatches.length !== 0,
      ) ||
      evidence?.mismatches?.length !== 0 ||
      evidence?.issues?.length !== 0
    : evidence?.complete !== false ||
      evidence?.passed !== false ||
      evidence?.completionMarker?.result !== "failed" ||
      !Array.isArray(evidence?.issues) ||
      evidence.issues.length === 0 ||
      !Array.isArray(evidence?.mismatches) ||
      evidence.mismatches.length === 0;
  if (
    comparisonsMalformed ||
    resultMalformed ||
    !Array.isArray(evidence?.mismatches) ||
    evidence?.physicalRootsRehashed !== true ||
    !isCanonicalUtcTimestamp(evidence?.capturedAt) ||
    evidence?.completionMarker?.complete !== true ||
    !Array.isArray(evidence?.issues)
  ) {
    issues.push("artifact continuity comparisons are partial, synthetic, or failed");
  }
  if (
    !isSha256(evidence?.continuitySha256) ||
    sealContinuityEvidence(evidence).continuitySha256 !== evidence.continuitySha256
  ) {
    issues.push("artifact continuity final seal is missing or invalid");
  }
  return { valid: issues.length === 0, issues };
}

export function readAndValidateSourceEvidence({
  descriptor,
  evidenceRoot,
  state,
  repositoryRoot,
  verifyPhysicalSource = true,
  requirePassed = true,
}) {
  const retained = resolvedEvidenceFile(
    evidenceRoot,
    descriptor,
    "source-validation aggregate evidence",
  );
  const evidence = JSON.parse(retained.bytes.toString("utf8"));
  if (!retained.bytes.equals(canonicalJsonBytes(evidence))) {
    return {
      evidence,
      validation: {
        valid: false,
        issues: ["source-validation aggregate evidence is not canonical JSON"],
      },
    };
  }
  return {
    evidence,
    validation: validateSourceValidationEvidence({
      evidence,
      evidenceRoot,
      state,
      repositoryRoot,
      verifyPhysicalSource,
      requirePassed,
    }),
  };
}

export function readAndValidateContinuityEvidence({
  descriptor,
  evidenceRoot,
  state,
  repositoryRoot,
  requirePassed = true,
}) {
  const retained = resolvedEvidenceFile(
    evidenceRoot,
    descriptor,
    "continuity evidence",
  );
  const evidence = JSON.parse(retained.bytes.toString("utf8"));
  if (!retained.bytes.equals(canonicalJsonBytes(evidence))) {
    return {
      evidence,
      validation: {
        valid: false,
        issues: ["continuity evidence is not canonical JSON"],
      },
    };
  }
  return {
    evidence,
    validation: validateContinuityEvidence(evidence, state, repositoryRoot, {
      requirePassed,
    }),
  };
}

async function runSourceSyntax(repositoryRoot) {
  const tracked = git(repositoryRoot, ["ls-files", "-z"])
    .split("\0")
    .filter(Boolean);
  for (const relativePath of tracked.filter((file) => /\.(?:cjs|js|mjs)$/.test(file))) {
    const child = spawnSync(process.execPath, ["--check", relativePath], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    if (child.error || child.signal || child.status !== 0) {
      throw new Error(`JavaScript syntax failed: ${relativePath}`);
    }
  }
  for (const relativePath of tracked.filter((file) => file.endsWith(".json"))) {
    JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
  }
  for (const relativePath of tracked.filter((file) =>
    /(?:^\.github\/workflows\/.*\.ya?ml$|\.ya?ml$)/.test(file),
  )) {
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        'const {readFileSync}=require("node:fs"); const {parseDocument}=require("yaml"); const document=parseDocument(readFileSync(process.argv[1],"utf8")); if(document.errors.length) process.exit(1);',
        relativePath,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    if (child.error || child.signal || child.status !== 0) {
      throw new Error(`workflow/YAML syntax failed: ${relativePath}`);
    }
  }
  for (const relativePath of tracked.filter((file) => file.endsWith(".sh"))) {
    const child = spawnSync("bash", ["-n", relativePath], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    if (child.error || child.signal || child.status !== 0) {
      throw new Error(`shell syntax failed: ${relativePath}`);
    }
  }
  return {
    javascript: tracked.filter((file) => /\.(?:cjs|js|mjs)$/.test(file)).length,
    typescript: tracked.filter((file) => /\.tsx?$/.test(file)).length,
    json: tracked.filter((file) => file.endsWith(".json")).length,
    workflowAndYaml: tracked.filter((file) => file.endsWith(".yml") || file.endsWith(".yaml")).length,
    shell: tracked.filter((file) => file.endsWith(".sh")).length,
    typescriptSyntaxOwner: "npm run typecheck",
  };
}

function runSourceHygiene(repositoryRoot) {
  const status = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const untracked = git(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]);
  const trackedIgnored = git(repositoryRoot, [
    "ls-files",
    "--ignored",
    "--cached",
    "--exclude-standard",
  ]);
  const diff = spawnSync("git", ["diff", "--check"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const active = [
    "rebase-merge",
    "rebase-apply",
    "sequencer",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "BISECT_LOG",
  ].filter((entry) => existsSync(path.join(repositoryRoot, ".git", entry)));
  if (
    status ||
    untracked ||
    trackedIgnored ||
    active.length > 0 ||
    diff.error ||
    diff.signal ||
    diff.status !== 0
  ) {
    throw new Error("Git source hygiene is not clean and operation-free");
  }
  return { clean: true, activeGitOperations: 0 };
}

async function cli() {
  const command = process.argv[2];
  if (command === "fixture-check") {
    if (process.env.CERTIFICATION_QUALIFICATION_MODE !== "1") {
      throw new Error("source-validation fixture check is restricted to qualification");
    }
    const id = process.argv[3];
    const logPath = process.env.CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG;
    if (!logPath || !path.isAbsolute(logPath)) {
      throw new Error("source-validation fixture log must be absolute");
    }
    writeFileSync(logPath, `${id}\n`, { flag: "a", mode: 0o600 });
    if (process.env.CERTIFICATION_SOURCE_VALIDATION_DIRTY_ID === id) {
      writeFileSync(
        path.join(process.cwd(), ".certification-source-validation-dirty-fixture"),
        `${id}\n`,
        { flag: "wx", mode: 0o600 },
      );
    }
    if (process.env.CERTIFICATION_SOURCE_VALIDATION_FAIL_ID === id) {
      process.exitCode = 17;
    }
    return;
  }
  if (command === "source-syntax") {
    process.stdout.write(`${JSON.stringify(await runSourceSyntax(process.cwd()))}\n`);
    return;
  }
  if (command === "source-hygiene") {
    process.stdout.write(`${JSON.stringify(runSourceHygiene(process.cwd()))}\n`);
    return;
  }
  if (command === "contract-check") {
    const source = sourceValidationCheckSet(process.cwd());
    const continuity = continuityContract(process.cwd());
    const matrix = productionCertificationContract(process.cwd());
    process.stdout.write(
      `${JSON.stringify({
        contractMatrixSha256: matrix.sha256,
        sourceCheckSetSha256: source.sha256,
        sourceCheckCount: source.checks.length,
        continuityContractSha256: continuity.sha256,
        lifecyclePositionCount: continuity.lifecyclePositions.length,
      })}\n`,
    );
    return;
  }
  throw new Error(
    "usage: production-certification-source-continuity.mjs fixture-check|source-syntax|source-hygiene|contract-check",
  );
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
