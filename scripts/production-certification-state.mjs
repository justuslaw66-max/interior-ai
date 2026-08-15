import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import {
  CERTIFICATION_STAGE_COMMANDS,
  CERTIFICATION_STAGE_ORDER,
  PRODUCTION_CERTIFICATION_HARNESS_VERSION,
  PRODUCTION_CERTIFICATION_ATTEMPT_SCHEMA,
  PRODUCTION_CERTIFICATION_INVALIDATION_PLAN_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
  PRODUCTION_CERTIFICATION_STATE_VALIDATION_SCHEMA,
  REQUIRED_BROWSER_OWNERS,
  assertKnownFailureClassification,
  assertKnownStage,
  assertKnownStageStatus,
  canonicalJsonBytes,
  isCandidateId,
  isCanonicalUtcTimestamp,
  isSha256,
  isSourceSha,
  productionArchiveInventoryIssues,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA,
  certificationWorktreeIssues,
} from "./production-certification-worktrees.mjs";
import {
  readAndValidateContinuityEvidence,
  readAndValidateSourceEvidence,
  rootEvidenceName,
  snapshotEvidenceName,
  validateArtifactSnapshotEvidence,
} from "./production-certification-source-continuity.mjs";

const STATE_SEAL_DOMAIN = "interior-ai.production-certification-state-seal.v1\n";
const VALIDATION_SEAL_DOMAIN =
  "interior-ai.production-certification-state-validation-seal.v1\n";
const INVALIDATION_PLAN_SEAL_DOMAIN =
  "interior-ai.production-certification-invalidation-plan-seal.v1\n";
const COMPLETION_STATES = new Set(["incomplete", "passed", "failed", "invalidated"]);
const EXECUTION_CLASSES = new Set(["real-candidate", "deterministic-simulation"]);
const BINDING_KEYS = Object.freeze([
  "semanticJournalNonce",
  "nextBuildId",
  "artifactSha256",
  "productionManifestSha256",
  "semanticJournalSha256",
  "verifierSourceClosureSha256",
  "archiveSha256",
  "archiveInventorySha256",
  "phase8EvidenceSha256",
  "runtimeSmokeEvidenceSha256",
  "browserOwnerEvidenceSha256",
  "continuityEvidenceSha256",
]);
const STAGE_BINDING_KEYS = Object.freeze({
  build: BINDING_KEYS.slice(0, 5),
  "archive-preflight": ["verifierSourceClosureSha256"],
  archive: ["archiveSha256", "archiveInventorySha256"],
  phase8: ["phase8EvidenceSha256"],
  "runtime-smoke": ["runtimeSmokeEvidenceSha256"],
  "browser-owners": ["browserOwnerEvidenceSha256"],
  continuity: ["continuityEvidenceSha256"],
});
const BROWSER_EVIDENCE_KEYS = Object.freeze([
  ...REQUIRED_BROWSER_OWNERS.flatMap((owner) => [
    `browser:${owner.id}`,
    `browser-report:${owner.id}`,
    `browser-start:${owner.id}`,
  ]),
]);
const STAGE_EVIDENCE_KEYS = Object.freeze({
  doctor: ["doctor"],
  "source-validation": ["source-validation"],
  build: [
    "build",
    snapshotEvidenceName("immediateBuild"),
    rootEvidenceName("immediateBuild"),
  ],
  "archive-preflight": [
    "archive-plan",
    "archive-preflight",
    snapshotEvidenceName("stagedArchive"),
    rootEvidenceName("stagedArchive"),
  ],
  archive: [
    "archive",
    "archive-inventory",
    snapshotEvidenceName("compressedArchive"),
    rootEvidenceName("compressedArchive"),
  ],
  "extracted-archive-preflight": [
    "extracted-archive-preflight",
    snapshotEvidenceName("extractedArchive"),
    rootEvidenceName("extractedArchive"),
  ],
  phase8: [
    "phase8",
    "phase8-raw",
    "phase8-completion",
    snapshotEvidenceName("postPhase8Live"),
    rootEvidenceName("postPhase8Live"),
  ],
  "runtime-smoke": [
    "runtime-smoke",
    "runtime-report",
    "runtime-phase-timings",
    "runtime-start",
  ],
  "browser-owners": [
    ...BROWSER_EVIDENCE_KEYS,
    snapshotEvidenceName("postRuntimeBrowserLive"),
    rootEvidenceName("postRuntimeBrowserLive"),
  ],
  "final-standalone": ["final-standalone"],
  continuity: ["continuity"],
  "integration-ready": ["integration-ready"],
});
const EVIDENCE_OWNER_STAGE = Object.freeze(
  Object.fromEntries(
    Object.entries(STAGE_EVIDENCE_KEYS).flatMap(([stage, names]) =>
      names.map((name) => [name, stage]),
    ),
  ),
);

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function statePayload(state) {
  const payload = structuredClone(state);
  delete payload.seal;
  return payload;
}

export function sealCertificationState(state) {
  const payload = statePayload(state);
  return {
    ...payload,
    seal: {
      algorithm: "sha256",
      sha256: sha256Bytes(
        Buffer.concat([
          Buffer.from(STATE_SEAL_DOMAIN),
          canonicalJsonBytes(payload),
        ]),
      ),
    },
  };
}

export function certificationStateSha256(state) {
  return sha256Bytes(canonicalJsonBytes(state));
}

function sealPayload(value, domain) {
  const payload = structuredClone(value);
  delete payload.seal;
  return {
    ...payload,
    seal: {
      algorithm: "sha256",
      sha256: sha256Bytes(
        Buffer.concat([Buffer.from(domain), canonicalJsonBytes(payload)]),
      ),
    },
  };
}

export function sealCertificationInvalidationPlan(plan) {
  return sealPayload(plan, INVALIDATION_PLAN_SEAL_DOMAIN);
}

export function sealCertificationValidationReport(report) {
  return sealPayload(report, VALIDATION_SEAL_DOMAIN);
}

function sealedValueIssues(value, domain, description) {
  if (value?.seal?.algorithm !== "sha256" || !isSha256(value?.seal?.sha256)) {
    return [`${description} seal is missing or malformed`];
  }
  const expected = sealPayload(value, domain).seal.sha256;
  return value.seal.sha256 === expected
    ? []
    : [`${description} seal mismatch`];
}

export function certificationInvalidationPlanIssues(plan) {
  const issues = sealedValueIssues(
    plan,
    INVALIDATION_PLAN_SEAL_DOMAIN,
    "certification invalidation plan",
  );
  if (
    !exactKeys(plan, [
      "schema",
      "command",
      "stateSha256",
      "canonicalCandidate",
      "stage",
      "reason",
      "issues",
      "provenRetainedInputMismatch",
      "cascadingStages",
      "seal",
    ]) ||
    plan?.schema !== PRODUCTION_CERTIFICATION_INVALIDATION_PLAN_SCHEMA ||
    plan?.command !== "state:reconcile" ||
    !isSha256(plan?.stateSha256) ||
    !CERTIFICATION_STAGE_ORDER.includes(plan?.stage) ||
    typeof plan?.reason !== "string" ||
    !plan.reason ||
    !Array.isArray(plan?.issues) ||
    plan.issues.some((issue) => typeof issue !== "string" || !issue) ||
    plan?.provenRetainedInputMismatch !== true ||
    JSON.stringify(plan?.cascadingStages) !==
      JSON.stringify(
        CERTIFICATION_STAGE_ORDER.slice(
          CERTIFICATION_STAGE_ORDER.indexOf(plan?.stage),
        ),
      )
  ) {
    issues.push("certification invalidation plan is malformed or incomplete");
  }
  return issues;
}

export function createCertificationInvalidationPlan({
  state,
  stage,
  reason,
  issues,
}) {
  assertKnownStage(stage);
  return sealCertificationInvalidationPlan({
    schema: PRODUCTION_CERTIFICATION_INVALIDATION_PLAN_SCHEMA,
    command: "state:reconcile",
    stateSha256: certificationStateSha256(state),
    canonicalCandidate: structuredClone(state.candidate),
    stage,
    reason,
    issues: [...issues],
    provenRetainedInputMismatch: true,
    cascadingStages: CERTIFICATION_STAGE_ORDER.slice(
      CERTIFICATION_STAGE_ORDER.indexOf(stage),
    ),
  });
}

export function createCertificationValidationReport({
  state,
  command,
  valid,
  classification = null,
  issues = [],
  expectedComparators = {},
  invalidationPlan = null,
}) {
  return sealCertificationValidationReport({
    schema: PRODUCTION_CERTIFICATION_STATE_VALIDATION_SCHEMA,
    command,
    mode: "read-only",
    valid: Boolean(valid),
    classification,
    consumedSubstantiveGate: false,
    stateSha256: certificationStateSha256(state),
    canonicalIdentity: {
      certificationId: state.certificationId,
      candidate: structuredClone(state.candidate),
    },
    expectedComparators: structuredClone(expectedComparators),
    issues: [...issues],
    invalidationPlan,
  });
}

export function certificationValidationReportIssues(report) {
  const issues = sealedValueIssues(
    report,
    VALIDATION_SEAL_DOMAIN,
    "certification state-validation report",
  );
  if (
    !exactKeys(report, [
      "schema",
      "command",
      "mode",
      "valid",
      "classification",
      "consumedSubstantiveGate",
      "stateSha256",
      "canonicalIdentity",
      "expectedComparators",
      "issues",
      "invalidationPlan",
      "seal",
    ]) ||
    report?.schema !== PRODUCTION_CERTIFICATION_STATE_VALIDATION_SCHEMA ||
    report?.mode !== "read-only" ||
    typeof report?.valid !== "boolean" ||
    report?.consumedSubstantiveGate !== false ||
    !isSha256(report?.stateSha256) ||
    !Array.isArray(report?.issues)
  ) {
    issues.push("certification state-validation report is malformed");
  }
  if (report?.invalidationPlan) {
    issues.push(...certificationInvalidationPlanIssues(report.invalidationPlan));
  }
  return issues;
}

export function certificationStateSealIssues(state) {
  if (state?.seal?.algorithm !== "sha256" || !isSha256(state?.seal?.sha256)) {
    return ["certification state seal is missing or malformed"];
  }
  const expected = sealCertificationState(state).seal.sha256;
  return state.seal.sha256 === expected
    ? []
    : ["certification state seal mismatch; manual editing is not accepted"];
}

function atomicWrite(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
      );
      if (written <= 0) throw new Error("certification state write made no progress");
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}

export function writeCertificationState(
  statePath,
  state,
  { expectedCurrentSha256 = null, requireAbsent = false } = {},
) {
  const sealed = sealCertificationState(state);
  const resolvedStatePath = path.resolve(statePath);
  mkdirSync(path.dirname(resolvedStatePath), { recursive: true, mode: 0o700 });
  const lockPath = `${resolvedStatePath}.lock`;
  let lockDescriptor = null;
  try {
    lockDescriptor = openSync(lockPath, "wx", 0o600);
    if (requireAbsent && existsSync(resolvedStatePath)) {
      throw new Error("certification state target is no longer absent");
    }
    if (expectedCurrentSha256 !== null) {
      if (!isSha256(expectedCurrentSha256)) {
        throw new Error("certification state CAS expectation is malformed");
      }
      let currentBytes;
      try {
        currentBytes = readFileSync(resolvedStatePath);
      } catch {
        throw new Error("certification state changed before atomic replacement");
      }
      if (sha256Bytes(currentBytes) !== expectedCurrentSha256) {
        throw new Error("certification state changed before atomic replacement");
      }
    }
    atomicWrite(resolvedStatePath, canonicalJsonBytes(sealed));
  } finally {
    if (lockDescriptor !== null) {
      closeSync(lockDescriptor);
      if (existsSync(lockPath)) unlinkSync(lockPath);
    }
  }
  return sealed;
}

export function readCertificationState(statePath) {
  let bytes;
  try {
    bytes = readFileSync(path.resolve(statePath));
  } catch {
    throw new Error("certification state is missing or unreadable");
  }
  let state;
  try {
    state = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("certification state is not valid JSON");
  }
  if (!bytes.equals(canonicalJsonBytes(state))) {
    throw new Error("certification state is not canonical JSON");
  }
  const sealIssues = certificationStateSealIssues(state);
  if (sealIssues.length > 0) throw new Error(sealIssues.join("; "));
  return state;
}

function emptyStage(stage) {
  return {
    status: "pending",
    canonicalCommand: CERTIFICATION_STAGE_COMMANDS[stage],
    inputFingerprint: null,
    startedAt: null,
    completedAt: null,
    exitCode: null,
    signal: null,
    failureClassification: null,
    consumedSubstantiveGate: false,
    outputHashes: {},
    attempts: [],
    invalidationReason: null,
  };
}

export function createCertificationState({
  certificationId,
  candidateId,
  commitSha,
  treeSha,
  parentSha,
  harnessSourceSha256,
  executionClass,
  createdAt,
  worktrees = null,
}) {
  if (!isCandidateId(certificationId) || !isCandidateId(candidateId)) {
    throw new Error("certification ID and candidate ID must use canonical grammar");
  }
  if (!isSourceSha(commitSha) || !isSourceSha(treeSha) || !isSourceSha(parentSha)) {
    throw new Error("candidate commit, tree, or parent bindings are malformed");
  }
  if (!isSha256(harnessSourceSha256)) {
    throw new Error("harness source hash is malformed");
  }
  if (!EXECUTION_CLASSES.has(executionClass)) {
    throw new Error("unknown certification execution classification");
  }
  if (!isCanonicalUtcTimestamp(createdAt)) {
    throw new Error("certification state creation time is not canonical UTC");
  }
  if (
    worktrees !== null &&
    (worktrees?.schema !== PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA ||
      !exactKeys(worktrees?.roles, CERTIFICATION_WORKTREE_ROLES))
  ) {
    throw new Error("certification stage-worktree bindings are malformed");
  }
  return sealCertificationState({
    schema: worktrees ? PRODUCTION_CERTIFICATION_STATE_SCHEMA : PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
    version: worktrees ? 2 : 1,
    certificationId,
    executionClass,
    candidate: { id: candidateId, commitSha, treeSha, parentSha },
    harness: {
      version: PRODUCTION_CERTIFICATION_HARNESS_VERSION,
      sourceSha256: harnessSourceSha256,
    },
    bindings: {
      semanticJournalNonce: null,
      nextBuildId: null,
      artifactSha256: null,
      productionManifestSha256: null,
      semanticJournalSha256: null,
      verifierSourceClosureSha256: null,
      archiveSha256: null,
      archiveInventorySha256: null,
      phase8EvidenceSha256: null,
      runtimeSmokeEvidenceSha256: null,
      browserOwnerEvidenceSha256: {},
      continuityEvidenceSha256: null,
    },
    evidenceFiles: {},
    ...(worktrees ? { worktrees: structuredClone(worktrees) } : {}),
    stages: Object.fromEntries(
      CERTIFICATION_STAGE_ORDER.map((stage) => [stage, emptyStage(stage)]),
    ),
    createdAt,
    updatedAt: createdAt,
    completionState: "incomplete",
  });
}

function cumulativeInputFingerprint(state, stageIndex) {
  const priorOutputs = {};
  for (const priorStage of CERTIFICATION_STAGE_ORDER.slice(0, stageIndex)) {
    priorOutputs[priorStage] = state.stages[priorStage].outputHashes;
  }
  return sha256Bytes(
    canonicalJsonBytes({
      candidate: state.candidate,
      harness: state.harness,
      priorOutputs,
    }),
  );
}

function attemptId(stage, number) {
  return `${stage}:${String(number).padStart(3, "0")}`;
}

export function startCertificationStage(state, { stage, startedAt }) {
  assertKnownStage(stage);
  if (!isCanonicalUtcTimestamp(startedAt)) {
    throw new Error("stage start time is not canonical UTC");
  }
  if (Date.parse(startedAt) < Date.parse(state.updatedAt)) {
    throw new Error("stage start time predates certification state");
  }
  const next = structuredClone(statePayload(state));
  const index = CERTIFICATION_STAGE_ORDER.indexOf(stage);
  for (const priorStage of CERTIFICATION_STAGE_ORDER.slice(0, index)) {
    if (next.stages[priorStage]?.status !== "passed") {
      throw new Error(`stage ${stage} requires passed prior stage ${priorStage}`);
    }
  }
  const record = next.stages[stage];
  assertKnownStageStatus(record?.status);
  const previousAttempt = record.attempts.at(-1);
  if (
    record.status === "running" ||
    record.status === "passed" ||
    record.attempts.some((attempt) => attempt.consumedSubstantiveGate) ||
    (record.status === "failed" && previousAttempt?.consumedSubstantiveGate)
  ) {
    throw new Error(`stage ${stage} cannot be restarted from ${record.status}`);
  }
  const number = record.attempts.length + 1;
  const inputFingerprint = cumulativeInputFingerprint(next, index);
  record.status = "running";
  record.inputFingerprint = inputFingerprint;
  record.startedAt = startedAt;
  record.completedAt = null;
  record.exitCode = null;
  record.signal = null;
  record.failureClassification = null;
  record.consumedSubstantiveGate = false;
  record.outputHashes = {};
  record.invalidationReason = null;
  record.attempts.push({
    schema: PRODUCTION_CERTIFICATION_ATTEMPT_SCHEMA,
    id: attemptId(stage, number),
    number,
    startedAt,
    completedAt: null,
    exitCode: null,
    signal: null,
    status: "running",
    failureClassification: null,
    consumedSubstantiveGate: false,
  });
  next.updatedAt = startedAt;
  next.completionState = "incomplete";
  return sealCertificationState(next);
}

export function completeCertificationStage(
  state,
  {
    stage,
    passed,
    completedAt,
    exitCode,
    signal = null,
    failureClassification = null,
    consumedSubstantiveGate = false,
    outputHashes = {},
    bindingUpdates = {},
    evidenceFiles = {},
  },
) {
  assertKnownStage(stage);
  if (!isCanonicalUtcTimestamp(completedAt)) {
    throw new Error("stage completion time is not canonical UTC");
  }
  if (Date.parse(completedAt) < Date.parse(state.updatedAt)) {
    throw new Error("stage completion time predates certification state");
  }
  if (!passed) assertKnownFailureClassification(failureClassification);
  if (
    (exitCode !== null &&
      (!Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255)) ||
    (signal !== null && (typeof signal !== "string" || !signal)) ||
    (!passed && exitCode === null && signal === null)
  ) {
    throw new Error("stage process result is malformed");
  }
  if (passed && (failureClassification !== null || exitCode !== 0 || signal !== null)) {
    throw new Error("passed stage cannot carry failure process identity");
  }
  for (const [name, digest] of Object.entries(outputHashes)) {
    if (!name || !isSha256(digest)) throw new Error("stage output hash is malformed");
  }
  const unknownBindings = Object.keys(bindingUpdates).filter(
    (name) => !BINDING_KEYS.includes(name),
  );
  if (unknownBindings.length > 0) {
    throw new Error(`unknown certification binding update: ${unknownBindings.join(", ")}`);
  }
  const allowedBindings = STAGE_BINDING_KEYS[stage] ?? [];
  if (Object.keys(bindingUpdates).some((name) => !allowedBindings.includes(name))) {
    throw new Error(`stage ${stage} cannot update the supplied certification binding`);
  }
  const allowedEvidence = STAGE_EVIDENCE_KEYS[stage] ?? [];
  const unknownEvidence = Object.keys(evidenceFiles).filter(
    (name) => !allowedEvidence.includes(name),
  );
  if (unknownEvidence.length > 0) {
    throw new Error(`stage ${stage} cannot retain evidence ${unknownEvidence.join(", ")}`);
  }
  for (const [name, descriptor] of Object.entries(evidenceFiles)) {
    if (
      !name ||
      !exactKeys(descriptor, ["path", "sha256"]) ||
      typeof descriptor.path !== "string" ||
      !isSha256(descriptor.sha256)
    ) {
      throw new Error("certification evidence descriptor is malformed");
    }
  }
  const next = structuredClone(statePayload(state));
  const record = next.stages[stage];
  if (record?.status !== "running") {
    throw new Error(`stage ${stage} is not running`);
  }
  const attempt = record.attempts.at(-1);
  record.status = passed ? "passed" : "failed";
  record.completedAt = completedAt;
  record.exitCode = exitCode;
  record.signal = signal;
  record.failureClassification = failureClassification;
  record.consumedSubstantiveGate = Boolean(consumedSubstantiveGate);
  record.outputHashes = passed ? { ...outputHashes } : {};
  Object.assign(attempt, {
    completedAt,
    exitCode,
    signal,
    status: record.status,
    failureClassification,
    consumedSubstantiveGate: Boolean(consumedSubstantiveGate),
  });
  if (passed) {
    for (const name of allowedBindings) {
      const value = bindingUpdates[name];
      if (name === "browserOwnerEvidenceSha256") {
        if (
          !exactKeys(value, REQUIRED_BROWSER_OWNERS.map((owner) => owner.id)) ||
          Object.values(value).some((digest) => !isSha256(digest))
        ) {
          throw new Error("browser owner binding inventory is incomplete");
        }
      } else if (name === "semanticJournalNonce" || name === "nextBuildId") {
        if (typeof value !== "string" || !value) {
          throw new Error(`certification binding ${name} is missing`);
        }
      } else if (!isSha256(value)) {
        throw new Error(`certification binding ${name} is missing or malformed`);
      }
    }
    const requiredEvidence =
      stage === "continuity" ? ["continuity"] : allowedEvidence;
    for (const name of requiredEvidence) {
      if (!evidenceFiles[name] && !next.evidenceFiles[name]) {
        throw new Error(`passed stage ${stage} is missing evidence ${name}`);
      }
    }
    Object.assign(next.bindings, bindingUpdates);
    Object.assign(next.evidenceFiles, evidenceFiles);
  } else {
    Object.assign(next.evidenceFiles, evidenceFiles);
    const index = CERTIFICATION_STAGE_ORDER.indexOf(stage);
    for (const laterStage of CERTIFICATION_STAGE_ORDER.slice(index + 1)) {
      const later = next.stages[laterStage];
      later.status = "invalidated";
      later.invalidationReason = `prior stage ${stage} failed`;
    }
  }
  next.updatedAt = completedAt;
  next.completionState = passed
    ? stage === "integration-ready"
      ? "passed"
      : "incomplete"
    : "failed";
  return sealCertificationState(next);
}

export function invalidateCertificationState(state, { stage, reason, invalidatedAt }) {
  assertKnownStage(stage);
  if (!reason || !isCanonicalUtcTimestamp(invalidatedAt)) {
    throw new Error("invalidation requires a reason and canonical UTC time");
  }
  if (Date.parse(invalidatedAt) < Date.parse(state.updatedAt)) {
    throw new Error("invalidation time predates certification state");
  }
  const next = structuredClone(statePayload(state));
  const index = CERTIFICATION_STAGE_ORDER.indexOf(stage);
  for (const affected of CERTIFICATION_STAGE_ORDER.slice(index)) {
    const record = next.stages[affected];
    record.status = "invalidated";
    record.invalidationReason = reason;
    record.completedAt = invalidatedAt;
    record.outputHashes = {};
  }
  const invalidatedStages = new Set(CERTIFICATION_STAGE_ORDER.slice(index));
  for (const [ownerStage, keys] of Object.entries(STAGE_BINDING_KEYS)) {
    if (!invalidatedStages.has(ownerStage)) continue;
    for (const key of keys) {
      next.bindings[key] = key === "browserOwnerEvidenceSha256" ? {} : null;
    }
  }
  for (const [name] of Object.entries(next.evidenceFiles)) {
    if (invalidatedStages.has(EVIDENCE_OWNER_STAGE[name])) {
      delete next.evidenceFiles[name];
    }
  }
  next.updatedAt = invalidatedAt;
  next.completionState = "invalidated";
  return sealCertificationState(next);
}

export function reconcileCertificationState(
  state,
  { plan, expectedStateSha256, invalidatedAt },
) {
  const planIssues = certificationInvalidationPlanIssues(plan);
  if (planIssues.length > 0) throw new Error(planIssues.join("; "));
  const currentStateSha256 = certificationStateSha256(state);
  if (!isSha256(expectedStateSha256)) {
    throw new Error("state reconciliation requires an expected state SHA-256");
  }
  if (
    plan.stateSha256 !== currentStateSha256 ||
    expectedStateSha256 !== currentStateSha256
  ) {
    throw new Error("certification state changed after invalidation plan creation");
  }
  if (JSON.stringify(plan.canonicalCandidate) !== JSON.stringify(state.candidate)) {
    throw new Error("certification invalidation plan belongs to another candidate");
  }
  return invalidateCertificationState(state, {
    stage: plan.stage,
    reason: plan.reason,
    invalidatedAt,
  });
}

export function updateCertificationWorktreeBinding(state, { role, binding }) {
  if (!CERTIFICATION_WORKTREE_ROLES.includes(role) || state?.version !== 2) {
    throw new Error("certification worktree binding update is unsupported");
  }
  const next = structuredClone(statePayload(state));
  next.worktrees.roles[role] = structuredClone(binding);
  return sealCertificationState(next);
}

export function replaceCertificationWorktrees(state, worktrees) {
  if (
    state?.version !== 2 ||
    worktrees?.schema !== PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA ||
    !exactKeys(worktrees?.roles, CERTIFICATION_WORKTREE_ROLES)
  ) {
    throw new Error("certification worktree replacement is malformed");
  }
  const next = structuredClone(statePayload(state));
  next.worktrees = structuredClone(worktrees);
  return sealCertificationState(next);
}

function stateShapeIssues(state) {
  const issues = [];
  const versionTwo = state?.version === 2;
  if (
    !exactKeys(state, [
      "schema",
      "version",
      "certificationId",
      "executionClass",
      "candidate",
      "harness",
      "bindings",
      "evidenceFiles",
      ...(versionTwo ? ["worktrees"] : []),
      "stages",
      "createdAt",
      "updatedAt",
      "completionState",
      "seal",
    ]) ||
    !exactKeys(state?.candidate, ["id", "commitSha", "treeSha", "parentSha"]) ||
    !exactKeys(state?.harness, ["version", "sourceSha256"]) ||
    !exactKeys(state?.bindings, BINDING_KEYS)
  ) {
    issues.push("certification state fields are missing or unknown");
  }
  if (
    !(
      (state?.schema === PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1 && state?.version === 1) ||
      (state?.schema === PRODUCTION_CERTIFICATION_STATE_SCHEMA && state?.version === 2)
    )
  ) {
    issues.push("unsupported certification state schema or version");
  }
  if (!isCandidateId(state?.certificationId) || !isCandidateId(state?.candidate?.id)) {
    issues.push("certification or candidate ID is malformed");
  }
  if (
    !isSourceSha(state?.candidate?.commitSha) ||
    !isSourceSha(state?.candidate?.treeSha) ||
    !isSourceSha(state?.candidate?.parentSha)
  ) {
    issues.push("certification candidate source binding is malformed");
  }
  if (
    state?.harness?.version !== PRODUCTION_CERTIFICATION_HARNESS_VERSION ||
    !isSha256(state?.harness?.sourceSha256)
  ) {
    issues.push("certification harness identity is malformed");
  }
  if (!EXECUTION_CLASSES.has(state?.executionClass)) {
    issues.push("certification execution classification is unknown");
  }
  if (!COMPLETION_STATES.has(state?.completionState)) {
    issues.push("certification completion state is unknown");
  }
  for (const name of ["semanticJournalNonce", "nextBuildId"]) {
    if (state?.bindings?.[name] !== null && !state?.bindings?.[name]) {
      issues.push(`certification binding ${name} is malformed`);
    }
  }
  for (const name of BINDING_KEYS.filter(
    (key) => !["semanticJournalNonce", "nextBuildId", "browserOwnerEvidenceSha256"].includes(key),
  )) {
    if (state?.bindings?.[name] !== null && !isSha256(state?.bindings?.[name])) {
      issues.push(`certification binding ${name} is malformed`);
    }
  }
  const browserBindings = state?.bindings?.browserOwnerEvidenceSha256;
  if (
    !browserBindings ||
    Array.isArray(browserBindings) ||
    typeof browserBindings !== "object" ||
    (Object.keys(browserBindings).length > 0 &&
      (!exactKeys(browserBindings, REQUIRED_BROWSER_OWNERS.map((owner) => owner.id)) ||
        Object.values(browserBindings).some((digest) => !isSha256(digest))))
  ) {
    issues.push("certification browser-owner binding inventory is malformed");
  }
  const allowedEvidence = new Set(Object.values(STAGE_EVIDENCE_KEYS).flat());
  for (const [name, descriptor] of Object.entries(state?.evidenceFiles ?? {})) {
    if (
      !allowedEvidence.has(name) ||
      !exactKeys(descriptor, ["path", "sha256"]) ||
      !isSha256(descriptor?.sha256)
    ) {
      issues.push(`certification evidence descriptor is unknown or malformed: ${name}`);
    }
  }
  if (
    !isCanonicalUtcTimestamp(state?.createdAt) ||
    !isCanonicalUtcTimestamp(state?.updatedAt) ||
    Date.parse(state?.updatedAt) < Date.parse(state?.createdAt) ||
    Date.parse(state?.updatedAt) > Date.now() + 5 * 60 * 1000
  ) {
    issues.push("certification state timestamps are invalid");
  }
  if (
    Object.keys(state?.stages ?? {}).join("\n") !==
    CERTIFICATION_STAGE_ORDER.join("\n")
  ) {
    issues.push("certification stage inventory or order is not canonical");
  }
  return issues;
}

function resolvedEvidencePath(evidenceRoot, relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.normalize(relativePath) !== relativePath
  ) {
    throw new Error("certification evidence path is not normalized and relative");
  }
  const root = path.resolve(evidenceRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("certification evidence path escapes its authorized root");
  }
  const metadata = lstatSync(resolved);
  const physical = realpathSync(resolved);
  const physicalRoot = realpathSync(root);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !physical.startsWith(`${physicalRoot}${path.sep}`)
  ) {
    throw new Error("certification evidence path is not a contained physical file");
  }
  return resolved;
}

function requiredPassedStageIssues(state, stage) {
  const issues = [];
  const bindings = state.bindings ?? {};
  const evidence = state.evidenceFiles ?? {};
  const requireEvidence = (...names) => {
    for (const name of names) {
      if (!evidence[name]) issues.push(`passed stage ${stage} is missing evidence ${name}`);
    }
  };
  if (stage === "doctor") requireEvidence("doctor");
  if (stage === "source-validation") requireEvidence("source-validation");
  if (
    stage === "source-validation" &&
    state.stages[stage].outputHashes.sourceValidation !==
      evidence["source-validation"]?.sha256
  ) {
    issues.push("passed source-validation output hash does not bind its aggregate");
  }
  if (stage === "build") {
    requireEvidence(
      "build",
      snapshotEvidenceName("immediateBuild"),
      rootEvidenceName("immediateBuild"),
    );
    for (const name of STAGE_BINDING_KEYS.build) {
      if (name === "semanticJournalNonce") {
        if (typeof bindings[name] !== "string" || !bindings[name]) {
          issues.push("passed build is missing semantic journal nonce");
        }
      } else if (name === "nextBuildId") {
        if (typeof bindings[name] !== "string" || !bindings[name]) {
          issues.push("passed build is missing Build ID");
        }
      } else if (!isSha256(bindings[name])) {
        issues.push(`passed build is missing binding ${name}`);
      }
    }
  }
  if (stage === "archive-preflight") {
    requireEvidence(
      "archive-plan",
      "archive-preflight",
      snapshotEvidenceName("stagedArchive"),
      rootEvidenceName("stagedArchive"),
    );
    if (!isSha256(bindings.verifierSourceClosureSha256)) {
      issues.push("passed archive preflight is missing verifier closure binding");
    }
  }
  if (stage === "archive") {
    requireEvidence(
      "archive",
      "archive-inventory",
      snapshotEvidenceName("compressedArchive"),
      rootEvidenceName("compressedArchive"),
    );
    if (!isSha256(bindings.archiveSha256) || !isSha256(bindings.archiveInventorySha256)) {
      issues.push("passed archive is missing archive or inventory binding");
    }
    if (evidence.archive?.sha256 !== bindings.archiveSha256) {
      issues.push("passed archive retained bytes do not match the archive binding");
    }
  }
  if (stage === "extracted-archive-preflight") {
    requireEvidence(
      "extracted-archive-preflight",
      snapshotEvidenceName("extractedArchive"),
      rootEvidenceName("extractedArchive"),
    );
  }
  if (stage === "phase8") {
    requireEvidence(
      "phase8",
      "phase8-raw",
      "phase8-completion",
      snapshotEvidenceName("postPhase8Live"),
      rootEvidenceName("postPhase8Live"),
    );
    if (!isSha256(bindings.phase8EvidenceSha256)) {
      issues.push("passed Phase 8 is missing its evidence binding");
    }
    if (evidence.phase8?.sha256 !== bindings.phase8EvidenceSha256) {
      issues.push("passed Phase 8 summary does not match its state binding");
    }
  }
  if (stage === "runtime-smoke") {
    requireEvidence(
      "runtime-smoke",
      "runtime-report",
      "runtime-phase-timings",
      "runtime-start",
    );
    if (!isSha256(bindings.runtimeSmokeEvidenceSha256)) {
      issues.push("passed runtime smoke is missing its evidence binding");
    }
    if (evidence["runtime-smoke"]?.sha256 !== bindings.runtimeSmokeEvidenceSha256) {
      issues.push("passed runtime smoke summary does not match its state binding");
    }
  }
  if (stage === "browser-owners") {
    requireEvidence(
      snapshotEvidenceName("postRuntimeBrowserLive"),
      rootEvidenceName("postRuntimeBrowserLive"),
    );
    for (const ownerId of REQUIRED_BROWSER_OWNERS.map((owner) => owner.id)) {
      requireEvidence(
        `browser:${ownerId}`,
        `browser-report:${ownerId}`,
        `browser-start:${ownerId}`,
      );
      if (!isSha256(bindings.browserOwnerEvidenceSha256?.[ownerId])) {
        issues.push(`passed browser owners are missing binding ${ownerId}`);
      }
      if (
        evidence[`browser:${ownerId}`]?.sha256 !==
        bindings.browserOwnerEvidenceSha256?.[ownerId]
      ) {
        issues.push(`passed browser-owner summary does not match binding ${ownerId}`);
      }
    }
  }
  if (stage === "final-standalone") requireEvidence("final-standalone");
  if (stage === "continuity") {
    requireEvidence("continuity");
    if (!isSha256(bindings.continuityEvidenceSha256)) {
      issues.push("passed continuity is missing its evidence binding");
    }
    if (evidence.continuity?.sha256 !== bindings.continuityEvidenceSha256) {
      issues.push("passed continuity evidence does not match its state binding");
    }
  }
  if (stage === "integration-ready") {
    requireEvidence("integration-ready");
    if (
      state.stages?.["source-validation"]?.status !== "passed" ||
      state.stages?.["final-standalone"]?.status !== "passed" ||
      state.stages?.continuity?.status !== "passed" ||
      !evidence["source-validation"] ||
      !evidence.continuity
    ) {
      issues.push(
        "integration-ready requires sealed source validation, final standalone, and measured continuity",
      );
    }
  }
  return issues;
}

export function validateCertificationState({
  state,
  evidenceRoot,
  expectedCandidate,
  expectedHarnessSourceSha256,
  repositoryRoot = process.cwd(),
  sourceValidationRoot = repositoryRoot,
  artifactRoot = repositoryRoot,
  verifyCurrentSource = true,
}) {
  const issues = [
    ...certificationStateSealIssues(state),
    ...stateShapeIssues(state),
  ];
  if (state?.version === 2) {
    issues.push(
      ...certificationWorktreeIssues({
        state,
        evidenceRoot,
        canonicalRoot: repositoryRoot,
        requirePhysical: verifyCurrentSource,
      }),
    );
  }
  if (
    expectedCandidate &&
    JSON.stringify(state?.candidate) !== JSON.stringify(expectedCandidate)
  ) {
    issues.push("certification state belongs to another candidate identity");
  }
  if (
    expectedHarnessSourceSha256 &&
    state?.harness?.sourceSha256 !== expectedHarnessSourceSha256
  ) {
    issues.push("certification state belongs to another harness source");
  }
  let priorPassed = true;
  let priorStageCompletion = state?.createdAt;
  for (const [index, stage] of CERTIFICATION_STAGE_ORDER.entries()) {
    const record = state?.stages?.[stage];
    try {
      assertKnownStageStatus(record?.status);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      priorPassed = false;
      continue;
    }
    if (record.canonicalCommand !== CERTIFICATION_STAGE_COMMANDS[stage]) {
      issues.push(`stage ${stage} command is not canonical`);
    }
    if (
      !exactKeys(record, [
        "status",
        "canonicalCommand",
        "inputFingerprint",
        "startedAt",
        "completedAt",
        "exitCode",
        "signal",
        "failureClassification",
        "consumedSubstantiveGate",
        "outputHashes",
        "attempts",
        "invalidationReason",
      ]) ||
      !Array.isArray(record.attempts)
    ) {
      issues.push(`stage ${stage} fields or attempts are malformed`);
      priorPassed = false;
      continue;
    }
    for (const [attemptIndex, attempt] of record.attempts.entries()) {
      if (
        !exactKeys(attempt, [
          "schema",
          "id",
          "number",
          "startedAt",
          "completedAt",
          "exitCode",
          "signal",
          "status",
          "failureClassification",
          "consumedSubstantiveGate",
        ]) ||
        attempt.schema !== PRODUCTION_CERTIFICATION_ATTEMPT_SCHEMA ||
        attempt.id !== attemptId(stage, attemptIndex + 1) ||
        attempt.number !== attemptIndex + 1 ||
        !isCanonicalUtcTimestamp(attempt.startedAt) ||
        (attempt.completedAt !== null && !isCanonicalUtcTimestamp(attempt.completedAt))
      ) {
        issues.push(`stage ${stage} attempt history is malformed`);
      }
      try {
        assertKnownStageStatus(attempt.status);
        if (!["running", "passed", "failed"].includes(attempt.status)) {
          throw new Error(`stage ${stage} attempt status is not executable`);
        }
        if (attempt.failureClassification !== null) {
          assertKnownFailureClassification(attempt.failureClassification);
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
      if (
        typeof attempt.consumedSubstantiveGate !== "boolean" ||
        (attempt.status === "running") !== (attempt.completedAt === null) ||
        (attempt.status === "passed" &&
          (attempt.exitCode !== 0 ||
            attempt.signal !== null ||
            attempt.failureClassification !== null)) ||
        (attempt.status === "failed" && attempt.failureClassification === null) ||
        (attempt.completedAt !== null &&
          Date.parse(attempt.completedAt) < Date.parse(attempt.startedAt))
      ) {
        issues.push(`stage ${stage} attempt process result is contradictory`);
      }
      if (
        attemptIndex > 0 &&
        Date.parse(attempt.startedAt) <
          Date.parse(record.attempts[attemptIndex - 1].completedAt ?? "")
      ) {
        issues.push(`stage ${stage} attempt chronology is invalid`);
      }
    }
    const latestAttempt = record.attempts.at(-1);
    if (
      record.attempts.length > 0 &&
      record.status !== "invalidated" &&
      (record.status !== latestAttempt.status ||
        record.startedAt !== latestAttempt.startedAt ||
        record.completedAt !== latestAttempt.completedAt ||
        record.exitCode !== latestAttempt.exitCode ||
        record.signal !== latestAttempt.signal ||
        record.failureClassification !== latestAttempt.failureClassification ||
        record.consumedSubstantiveGate !== latestAttempt.consumedSubstantiveGate)
    ) {
      issues.push(`stage ${stage} record contradicts its latest attempt`);
    }
    if (
      (["running", "passed", "failed"].includes(record.status) &&
        record.attempts.length === 0) ||
      (record.status === "pending" &&
        (record.attempts.length !== 0 ||
          record.inputFingerprint !== null ||
          record.startedAt !== null ||
          record.completedAt !== null ||
          record.exitCode !== null ||
          record.signal !== null ||
          record.failureClassification !== null ||
          Object.keys(record.outputHashes).length !== 0)) ||
      (record.status === "failed" && Object.keys(record.outputHashes).length !== 0) ||
      (record.status === "invalidated" && !record.invalidationReason)
    ) {
      issues.push(`stage ${stage} status fields are contradictory`);
    }
    if (
      typeof record.consumedSubstantiveGate !== "boolean" ||
      (record.inputFingerprint !== null && !isSha256(record.inputFingerprint)) ||
      (record.startedAt !== null && !isCanonicalUtcTimestamp(record.startedAt)) ||
      (record.completedAt !== null && !isCanonicalUtcTimestamp(record.completedAt)) ||
      (record.startedAt !== null &&
        record.completedAt !== null &&
        Date.parse(record.completedAt) < Date.parse(record.startedAt)) ||
      (record.startedAt !== null &&
        priorStageCompletion &&
        Date.parse(record.startedAt) < Date.parse(priorStageCompletion))
    ) {
      issues.push(`stage ${stage} timestamps or flags are malformed`);
    }
    if (record.status === "passed") {
      if (!priorPassed) issues.push(`stage ${stage} passed before every prior stage`);
      const expectedFingerprint = cumulativeInputFingerprint(state, index);
      if (record.inputFingerprint !== expectedFingerprint) {
        issues.push(`stage ${stage} input fingerprint no longer matches`);
      }
      for (const digest of Object.values(record.outputHashes ?? {})) {
        if (!isSha256(digest)) issues.push(`stage ${stage} output hash is malformed`);
      }
      issues.push(...requiredPassedStageIssues(state, stage));
      priorStageCompletion = record.completedAt;
    } else {
      priorPassed = false;
    }
  }
  if (
    (state?.completionState === "passed") !==
    (state?.stages?.["integration-ready"]?.status === "passed")
  ) {
    issues.push("certification completion state contradicts integration readiness");
  }
  for (const [name, descriptor] of Object.entries(state?.evidenceFiles ?? {})) {
    if (!isSha256(descriptor?.sha256)) {
      issues.push(`evidence ${name} hash is malformed`);
      continue;
    }
    try {
      const absolutePath = resolvedEvidencePath(evidenceRoot, descriptor.path);
      const actual = sha256Bytes(readFileSync(absolutePath));
      if (actual !== descriptor.sha256) issues.push(`evidence ${name} hash mismatch`);
    } catch (error) {
      issues.push(
        `evidence ${name} is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (
    ["passed", "failed"].includes(
      state?.stages?.["source-validation"]?.status,
    ) &&
    state.evidenceFiles?.["source-validation"]
  ) {
    try {
      const descriptor = state.evidenceFiles?.["source-validation"];
      const result = readAndValidateSourceEvidence({
        descriptor,
        evidenceRoot,
        state,
        repositoryRoot: sourceValidationRoot,
        verifyPhysicalSource: verifyCurrentSource,
        requirePassed:
          state.stages["source-validation"].status === "passed",
      });
      issues.push(...result.validation.issues);
    } catch (error) {
      issues.push(
        `source-validation evidence is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  const lifecycleStages = [
    ["build", "immediateBuild"],
    ["archive-preflight", "stagedArchive"],
    ["archive", "compressedArchive"],
    ["extracted-archive-preflight", "extractedArchive"],
    ["phase8", "postPhase8Live"],
    ["browser-owners", "postRuntimeBrowserLive"],
  ];
  for (const [stage, position] of lifecycleStages) {
    if (state?.stages?.[stage]?.status !== "passed") continue;
    try {
      const snapshotPath = resolvedEvidencePath(
        evidenceRoot,
        state.evidenceFiles?.[snapshotEvidenceName(position)]?.path,
      );
      const rootPath = resolvedEvidencePath(
        evidenceRoot,
        state.evidenceFiles?.[rootEvidenceName(position)]?.path,
      );
      const snapshotBytes = readFileSync(snapshotPath);
      const rootBytes = readFileSync(rootPath);
      const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
      const rootSidecar = JSON.parse(rootBytes.toString("utf8"));
      if (
        !snapshotBytes.equals(canonicalJsonBytes(snapshot)) ||
        !rootBytes.equals(canonicalJsonBytes(rootSidecar))
      ) {
        issues.push(`artifact snapshot evidence is not canonical JSON: ${position}`);
      }
      const validation = validateArtifactSnapshotEvidence({
        snapshot,
        rootSidecar,
        state,
        repositoryRoot: artifactRoot,
        evidenceRoot,
        position,
        rehashPhysicalRoot:
          verifyCurrentSource &&
          state?.stages?.continuity?.status === "passed" &&
          (state?.version !== 2 ||
            Object.values(state.worktrees.roles).every(
              (binding) => binding.lifecycleStatus === "active",
            )),
      });
      issues.push(...validation.issues);
    } catch (error) {
      issues.push(
        `artifact snapshot evidence is invalid: ${position}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (
    ["passed", "failed"].includes(state?.stages?.continuity?.status) &&
    state.evidenceFiles?.continuity
  ) {
    try {
      const result = readAndValidateContinuityEvidence({
        descriptor: state.evidenceFiles?.continuity,
        evidenceRoot,
        state,
        repositoryRoot: artifactRoot,
        requirePassed: state.stages.continuity.status === "passed",
      });
      issues.push(...result.validation.issues);
    } catch (error) {
      issues.push(
        `continuity evidence is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (state?.stages?.archive?.status === "passed") {
    try {
      const descriptor = state.evidenceFiles?.["archive-inventory"];
      const absolutePath = resolvedEvidencePath(evidenceRoot, descriptor.path);
      const bytes = readFileSync(absolutePath);
      const inventory = JSON.parse(bytes.toString("utf8"));
      if (!bytes.equals(canonicalJsonBytes(inventory))) {
        issues.push("archive inventory evidence is not canonical JSON");
      }
      issues.push(...productionArchiveInventoryIssues(inventory));
      if (inventory.inventorySha256 !== state.bindings.archiveInventorySha256) {
        issues.push("archive inventory evidence does not match its state binding");
      }
    } catch (error) {
      issues.push(
        `archive inventory evidence is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return { valid: issues.length === 0, issues };
}
