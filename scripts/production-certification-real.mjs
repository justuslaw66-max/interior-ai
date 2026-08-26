import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  CERTIFICATION_EVIDENCE_ROOT_ENV,
  CERTIFICATION_STAGE_ORDER,
  CERTIFICATION_STATE_ENV,
  PHASE8_SOURCE_BINDING_PATHS,
  PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  harnessSourceIdentity,
  isCandidateId,
  isSha256,
  isSourceSha,
  productionArchiveInventoryIssues,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import { runCertificationDoctor } from "./production-certification-doctor.mjs";
import { verifyFinalCertificationEvidence } from "./production-certification-evidence.mjs";
import {
  NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH,
  finalizeCertificationBuildGeneratedOutput,
  finalizeCertificationFailedBuildGeneratedOutput,
  preflightCertificationBuildGeneratedOutput,
} from "./production-certification-build-generated-output.mjs";
import {
  recordProductionEvidenceTest,
  validateProductionEvidence,
} from "./production-artifact-evidence.mjs";
import {
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  PRODUCTION_EVIDENCE_VERIFICATION_MODES,
  certificationPreparedBuildJournalIssues,
} from "./production-artifact-contract.mjs";
import {
  authorizeRuntimeSmokeReportPath,
  resolveAuthorizedExternalEvidenceRoot,
  resolvePlaywrightReportPath,
  resolveRequiredTestReportPath,
  resolveRetainedExternalEvidenceFile,
  resolveRuntimeSmokeEvidencePath,
} from "./playwright-report-path.mjs";
import { createRuntimeSmokeTimingEvidenceBinding } from "./runtime-smoke-phase-budget.mjs";
import {
  certificationStageEvidenceFiles,
  completeCertificationStage,
  bindCertificationWorktreeDependencies,
  certificationStateSha256,
  certificationInvalidationPlanIssues,
  createCertificationInvalidationPlan,
  createCertificationValidationReport,
  createCertificationState,
  failCertificationWorktreeDependencyBinding,
  failCertificationWorktreeDependencyInstallation,
  readCertificationState,
  reconcileCertificationState,
  replaceCertificationWorktrees,
  replaceCertificationDatabaseLifecycle,
  startCertificationStage,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import {
  abortCertificationDatabase,
  bindCertificationDatabaseStage,
  certificationDatabaseStatus,
  dropCertificationDatabase,
  provisionCertificationDatabase,
  readCertificationDatabaseLifecycle,
  retainCertificationDatabaseFailureSnapshot,
  resolveCertificationDatabaseStageEnvironment,
  verifyCertificationDatabaseAbsent,
  verifyFinalCertificationDatabase,
  verifyInitialCertificationDatabase,
} from "./production-certification-database-lifecycle.mjs";
import { createCertificationResourcePlan } from "./production-certification-resource-plan.mjs";
import {
  installCertificationWorktreeDependencies,
  readAndValidateCertificationDependencyBindingEvidence,
} from "./production-certification-dependencies.mjs";
import {
  captureArtifactSnapshot,
  measureFinalContinuity,
  rootEvidenceName,
  snapshotEvidenceName,
  sourceValidationStageEvidence,
  validateSourceValidationEvidence,
} from "./production-certification-source-continuity.mjs";
import {
  certificationEnvironmentProfile,
  isCertificationControlVariableName,
  projectCertificationChildEnvironment,
  stageEnvironmentContract,
} from "./production-certification-stage-environment.mjs";
import {
  beginBrowserServerTrackedOutputLifecycle,
  completeBrowserServerTrackedOutputLifecycle,
} from "./production-certification-browser-server-lifecycle.mjs";
import {
  CERTIFICATION_WORKTREE_ROOT_ENV,
  CERTIFICATION_WORKTREE_ROLES,
  beginCertificationStageWorktreeTransaction,
  cleanupCertificationStageWorktrees,
  resolveCertificationStageWorktree,
  stageWorktreeRole,
  writeCertificationPreStateFailureReceipt,
} from "./production-certification-worktrees.mjs";
import {
  archivePlanStreamDescriptor,
  createArchivePlanChildEvidence,
  redactArchivePlanStream,
} from "./production-archive-plan-evidence.mjs";
import authFixtureSession from "./ci-auth-fixture-session.cjs";

const DEFAULT_MANIFEST = ".local/production-artifact-evidence/manifest.json";
const DEFAULT_JOURNAL =
  ".local/production-artifact-evidence/semantic-event-journal.json";
const RUNTIME_COMMAND =
  "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium";
const CHILD_SPAWN_ERROR_EXIT_CODE = 255;

function normalizedChildExitCode(status) {
  if (!Number.isSafeInteger(status)) return 1;
  return status === CHILD_SPAWN_ERROR_EXIT_CODE
    ? CHILD_SPAWN_ERROR_EXIT_CODE - 1
    : status;
}

class StageFailure extends Error {
  constructor(
    message,
    classification,
    consumed,
    {
      exitCode = 1,
      signal = null,
      result = null,
      evidenceFiles = {},
      stage = null,
      stageAttempt = null,
      failedStateSha256 = null,
      spawnErrorClassification = null,
    } = {},
  ) {
    super(message);
    this.classification = classification;
    this.consumed = consumed;
    this.exitCode = exitCode;
    this.signal = signal;
    this.certificationResult = result;
    this.evidenceFiles = evidenceFiles;
    this.stage = stage;
    this.stageAttempt = stageAttempt;
    this.failedStateSha256 = failedStateSha256;
    this.spawnErrorClassification = spawnErrorClassification;
  }
}

class InvocationFailure extends Error {
  constructor(message, result = null) {
    super(message);
    this.certificationResult = result ?? {
      valid: false,
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
      consumedSubstantiveGate: false,
      issues: [message],
    };
  }
}

function requiredEnvironment(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`certification command requires ${name}`);
  return value;
}

function git(repositoryRoot, args) {
  const child = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (child.status !== 0 || child.signal) {
    throw new Error("certification source identity cannot be inspected");
  }
  return child.stdout.trim();
}

function currentCandidate(repositoryRoot, canonicalCandidate, environment) {
  const commitSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const parentSha = git(repositoryRoot, ["rev-parse", "HEAD^"]);
  if (
    canonicalCandidate &&
    (canonicalCandidate.commitSha !== commitSha ||
      canonicalCandidate.treeSha !== treeSha ||
      canonicalCandidate.parentSha !== parentSha)
  ) {
    throw new Error(
      "current source commit, tree, or parent differs from the sealed candidate",
    );
  }
  if (git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"])) {
    throw new Error("certification source worktree or index is not clean");
  }
  return {
    id: canonicalCandidate?.id ?? environment.PRODUCTION_EVIDENCE_CANDIDATE_ID?.trim(),
    commitSha,
    treeSha,
    parentSha,
  };
}

const INVOCATION_COMMANDS = new Set([
  "state:init",
  "database:provision",
  "database:verify-initial",
  "database:verify-final",
  "database:drop",
  "database:verify-absent",
  "database:abort-cleanup",
  "database:status",
  "doctor",
  "source-validation",
  "state:validate",
  "build:eligibility",
  "resume",
  "build",
  "archive-preflight",
  "archive",
  "extracted-archive-preflight",
  "phase8",
  "runtime-smoke",
  "browser-owners",
  "final-standalone",
  "continuity",
  "integration-ready",
  "state:reconcile",
  "worktrees:cleanup",
]);

export function validateCertificationInvocation({
  repositoryRoot,
  environment,
  command,
}) {
  if (!INVOCATION_COMMANDS.has(command)) {
    throw new InvocationFailure("certification invocation mode is missing or malformed");
  }
  const required = [CERTIFICATION_STATE_ENV, CERTIFICATION_EVIDENCE_ROOT_ENV];
  if (command === "build:eligibility") {
    required.push(
      "PRODUCTION_EVIDENCE_CANDIDATE_ID",
      "CERTIFICATION_EXPECTED_COMMIT_SHA",
      "CERTIFICATION_EXPECTED_TREE_SHA",
      "CERTIFICATION_EXPECTED_PARENT_SHA",
    );
  }
  if (command === "state:reconcile") {
    required.push(
      "CERTIFICATION_INVALIDATION_PLAN",
      "CERTIFICATION_EXPECTED_STATE_SHA256",
    );
  }
  if (command === "integration-ready") {
    required.push(
      "CERTIFICATION_INTEGRATION_BRANCH_REF",
      "CERTIFICATION_INTEGRATION_TRACKING_REF",
      "CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA",
      "CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA",
    );
  }
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new InvocationFailure(
      `certification command requires ${missing.join(", ")}`,
    );
  }
  const candidateId = environment.PRODUCTION_EVIDENCE_CANDIDATE_ID?.trim();
  if (candidateId && !isCandidateId(candidateId)) {
    throw new InvocationFailure("certification expected candidate ID is malformed");
  }
  for (const name of [
    "CERTIFICATION_EXPECTED_COMMIT_SHA",
    "CERTIFICATION_EXPECTED_TREE_SHA",
    "CERTIFICATION_EXPECTED_PARENT_SHA",
    "CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA",
    "CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA",
  ]) {
    const value = environment[name]?.trim();
    if (value && !isSourceSha(value)) {
      throw new InvocationFailure(`${name} is malformed`);
    }
  }
  const localRef = environment.CERTIFICATION_INTEGRATION_BRANCH_REF?.trim();
  const trackingRef = environment.CERTIFICATION_INTEGRATION_TRACKING_REF?.trim();
  if (localRef && !/^refs\/heads\/[A-Za-z0-9._\/-]+$/.test(localRef)) {
    throw new InvocationFailure("integration branch ref is malformed");
  }
  if (trackingRef && !/^refs\/remotes\/[A-Za-z0-9._\/-]+$/.test(trackingRef)) {
    throw new InvocationFailure("integration tracking ref is malformed");
  }
  const expectedStateSha256 = environment.CERTIFICATION_EXPECTED_STATE_SHA256?.trim();
  if (expectedStateSha256 && !isSha256(expectedStateSha256)) {
    throw new InvocationFailure("certification expected state SHA-256 is malformed");
  }
  const contract = stageEnvironmentContract(repositoryRoot);
  const unknown = Object.keys(environment)
    .filter(
      (name) =>
        isCertificationControlVariableName(name, contract) &&
        !Object.hasOwn(contract.variables, name),
    )
    .sort();
  if (unknown.length > 0) {
    throw new InvocationFailure(
      `unknown certification-control variables are prohibited: ${unknown.join(", ")}`,
    );
  }
  return { command, requiredVariables: required, valid: true };
}

function stateContext(
  canonicalRoot,
  environment,
  { command, role = null } = {},
) {
  validateCertificationInvocation({
    repositoryRoot: canonicalRoot,
    environment,
    command,
  });
  try {
  const statePath = requiredEnvironment(environment, CERTIFICATION_STATE_ENV);
  const evidenceRoot = requiredEnvironment(environment, CERTIFICATION_EVIDENCE_ROOT_ENV);
  resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot: evidenceRoot,
    repositoryRoot: canonicalRoot,
  });
  const retainedState = resolveRetainedExternalEvidenceFile({
    filePath: statePath,
    authorizedExternalRoot: evidenceRoot,
    repositoryRoot: canonicalRoot,
  });
  const state = readCertificationState(retainedState.absolutePath);
  const expectedStateSha256 = environment.CERTIFICATION_EXPECTED_STATE_SHA256?.trim();
  if (
    expectedStateSha256 &&
    certificationStateSha256(state) !== expectedStateSha256
  ) {
    throw new InvocationFailure(
      "certification expected state SHA-256 is stale",
    );
  }
  let repositoryRoot = canonicalRoot;
    if (role) {
      const roleBinding = state.worktrees?.roles?.[role];
      if (roleBinding?.dependencyStatus === "failed") {
        throw new StageFailure(
          `${role} dependency lifecycle is terminally failed`,
          "SOURCE_CONTRACT_FAILURE",
          false,
        );
      }
      repositoryRoot = resolveCertificationStageWorktree({
        state,
        evidenceRoot,
        canonicalRoot,
        role,
        phase:
          roleBinding?.dependencyStatus === "installed" ||
          (roleBinding?.dependencyStatus === undefined &&
            roleBinding?.dependencyIdentitySha256 !== null)
            ? "active"
            : "pristine",
      }).root;
  }
    return {
      command,
      canonicalRoot,
      repositoryRoot,
      environment,
      statePath: retainedState.absolutePath,
      evidenceRoot,
      state,
    };
  } catch (error) {
    if (error instanceof InvocationFailure || error instanceof StageFailure) {
      throw error;
    }
    throw new InvocationFailure(error instanceof Error ? error.message : String(error));
  }
}

function databaseLifecycleBindingIsPredecessor(current, binding) {
  if (
    binding?.certificationId !== current.binding.certificationId ||
    binding?.candidateId !== current.binding.candidateId ||
    binding?.candidateCommitSha !== current.binding.candidateCommitSha ||
    binding?.candidateTreeSha !== current.binding.candidateTreeSha ||
    binding?.databaseNameSha256 !== current.binding.databaseNameSha256 ||
    binding?.databaseIdentitySha256 !== current.binding.databaseIdentitySha256 ||
    binding?.evidence?.path !== current.binding.evidence.path
  ) {
    return false;
  }
  return current.evidence.bindingHistory.some(
    (entry) =>
      entry.fileSha256 === binding.evidence.sha256 &&
      entry.lifecycleState === binding.lifecycleState,
  );
}

export function reconcileCertificationDatabaseLifecycleState({ statePath, current }) {
  let state = readCertificationState(statePath);
  if (JSON.stringify(current.binding) === JSON.stringify(state.databaseLifecycle)) {
    return state;
  }
  if (!databaseLifecycleBindingIsPredecessor(current, state.databaseLifecycle)) {
    throw new InvocationFailure(
      "certification database lifecycle evidence cannot be reconciled from the sealed state binding",
    );
  }
  const next = replaceCertificationDatabaseLifecycle(state, current.binding);
  writeCertificationState(statePath, next, {
    expectedCurrentSha256: certificationStateSha256(state),
  });
  state = readCertificationState(statePath);
  if (JSON.stringify(current.binding) !== JSON.stringify(state.databaseLifecycle)) {
    throw new InvocationFailure(
      "certification database lifecycle reconciliation was not durably committed",
    );
  }
  return state;
}

function reconcileDatabaseLifecycleBinding(context, current) {
  context.state = reconcileCertificationDatabaseLifecycleState({
    statePath: context.statePath,
    current,
  });
  return current;
}

function requireDatabaseLifecycleBinding(
  context,
  allowedStates = null,
  { reconcile = true } = {},
) {
  if (context.state.executionClass !== "real-candidate") return null;
  if (!context.state.databaseLifecycle) {
    throw new InvocationFailure("certification database lifecycle state binding is missing");
  }
  const current = readCertificationDatabaseLifecycle({
    repositoryRoot: context.canonicalRoot,
    environment: context.environment,
  });
  if (JSON.stringify(current.binding) !== JSON.stringify(context.state.databaseLifecycle)) {
    if (!reconcile) {
      throw new InvocationFailure(
        "certification database lifecycle evidence or state binding is stale",
      );
    }
    reconcileDatabaseLifecycleBinding(context, current);
  }
  if (
    allowedStates &&
    !allowedStates.includes(current.evidence.currentState)
  ) {
    throw new InvocationFailure(
      `certification database lifecycle state is not permitted: ${current.evidence.currentState}`,
    );
  }
  return current;
}

function bindDatabaseLifecycleResult(context, result) {
  const currentState = readCertificationState(context.statePath);
  const next = replaceCertificationDatabaseLifecycle(currentState, result.binding);
  writeCertificationState(context.statePath, next, {
    expectedCurrentSha256: certificationStateSha256(currentState),
  });
  return { ...context, state: next };
}

async function runDatabaseLifecycleTransition(context, transition) {
  requireDatabaseLifecycleBinding(context);
  let result;
  try {
    result = await transition();
  } catch (error) {
    if (error?.databaseLifecycleResult) {
      try {
        bindDatabaseLifecycleResult(context, error.databaseLifecycleResult);
      } catch (bindingError) {
        bindingError.databaseLifecycleResult = error.databaseLifecycleResult;
        bindingError.cause = error;
        throw bindingError;
      }
    }
    throw error;
  }
  try {
    bindDatabaseLifecycleResult(context, result);
  } catch (error) {
    error.databaseLifecycleResult = result;
    throw error;
  }
  return result;
}

async function bindDatabaseForStage(context, stage, adapter = null) {
  if (context.state.executionClass !== "real-candidate") return context;
  requireDatabaseLifecycleBinding(context, ["active"]);
  const stageIndex = CERTIFICATION_STAGE_ORDER.indexOf(stage);
  if (stageIndex < 0) {
    throw new InvocationFailure(`database stage binding is unknown: ${stage}`);
  }
  const incompletePrior = CERTIFICATION_STAGE_ORDER.slice(0, stageIndex).find(
    (prior) => context.state.stages[prior]?.status !== "passed",
  );
  if (incompletePrior) {
    throw new InvocationFailure(
      `database stage binding ${stage} requires passed prior stage ${incompletePrior}`,
    );
  }
  const result = await bindCertificationDatabaseStage({
    repositoryRoot: context.canonicalRoot,
    environment: context.environment,
    adapter,
    stage,
  });
  return bindDatabaseLifecycleResult(context, result);
}

function safeEvidenceDirectory(evidenceRoot, relativeDirectory) {
  const root = realpathSync(evidenceRoot);
  const normalized = path.normalize(relativeDirectory);
  if (
    path.isAbsolute(relativeDirectory) ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error("certification evidence directory escapes its authorized root");
  }
  let current = root;
  for (const component of normalized.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (existsSync(current)) {
      const metadata = lstatSync(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("certification evidence directory is not physical");
      }
    } else {
      mkdirSync(current, { mode: 0o700 });
    }
  }
  const physicalCurrent = realpathSync(current);
  if (
    physicalCurrent !== path.resolve(root, normalized) ||
    (physicalCurrent !== root && !physicalCurrent.startsWith(`${root}${path.sep}`))
  ) {
    throw new Error("certification evidence directory escapes its authorized root");
  }
  return current;
}

export function absentEvidenceTarget(evidenceRoot, relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.normalize(relativePath) !== relativePath
  ) {
    throw new Error("certification evidence target is malformed");
  }
  const parent = safeEvidenceDirectory(evidenceRoot, path.dirname(relativePath));
  const target = path.join(parent, path.basename(relativePath));
  if (existsSync(target)) throw new Error("certification evidence target must be absent");
  return target;
}

function writeEvidence(evidenceRoot, relativePath, value) {
  const filePath = absentEvidenceTarget(evidenceRoot, relativePath);
  writeFileSync(filePath, canonicalJsonBytes(value), { flag: "wx", mode: 0o600 });
  return {
    path: relativePath.split(path.sep).join("/"),
    sha256: sha256Bytes(readFileSync(filePath)),
  };
}

function retainedDescriptor(evidenceRoot, absolutePath) {
  const root = realpathSync(evidenceRoot);
  const file = realpathSync(absolutePath);
  if (!file.startsWith(`${root}${path.sep}`) || !lstatSync(file).isFile()) {
    throw new Error("certification evidence file escapes its authorized root");
  }
  return {
    path: path.relative(root, file).split(path.sep).join("/"),
    sha256: sha256Bytes(readFileSync(file)),
  };
}

function readJson(filePath, description) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${description} is missing or invalid JSON`);
  }
}

function childResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : undefined,
    maxBuffer: 16 * 1024 * 1024,
  });
}

export function projectAuthFixtureSessionForStage({
  repositoryRoot,
  environment,
  candidateCommitSha,
  candidateTreeSha,
  stage = "build",
}) {
  for (const [name, expected] of [
    ["CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA", candidateCommitSha],
    ["CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA", candidateTreeSha],
  ]) {
    if (environment[name] !== undefined && environment[name] !== expected) {
      throw new Error(
        `${stage} auth fixture session has an ambient candidate override`,
      );
    }
  }
  const consumed = authFixtureSession.consumeFixtureSession({
    repositoryRoot,
    environment: {
      ...environment,
      CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidateCommitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidateTreeSha,
    },
    requireAmbientProviderValues: false,
    sourceCommand: `certification:${stage}`,
    sourceMode: `${stage}-parent-projection`,
  });
  if (
    consumed.manifest.candidate.commitSha !== candidateCommitSha ||
    consumed.manifest.candidate.treeSha !== candidateTreeSha
  ) {
    throw new Error(`${stage} auth fixture session belongs to another candidate`);
  }
  const projected = authFixtureSession.projectedFixtureEnvironment(consumed);
  return Object.freeze({
    environment: projected,
    continuity: authFixtureSession.validateProjectedFixtureEnvironment(projected, {
      commitSha: candidateCommitSha,
      treeSha: candidateTreeSha,
    }),
  });
}

export function stageChildProjection(
  context,
  { stage, profileId = stage, stageInputs, baseEnvironment = context.environment },
) {
  const profile = certificationEnvironmentProfile(
    context.repositoryRoot,
    profileId,
  );
  const fixtureProjectionStage = new Set([
    "build",
    "phase8",
    "runtime-smoke",
    "browser-owners",
  ]).has(stage);
  const hasFixtureSession =
    fixtureProjectionStage &&
    Boolean(context.environment[authFixtureSession.FIXTURE_SESSION_ROOT_ENV]);
  let authProjection = null;
  if (hasFixtureSession) {
    authProjection = projectAuthFixtureSessionForStage({
      repositoryRoot: context.repositoryRoot,
      environment: context.environment,
      candidateCommitSha: context.state.candidate.commitSha,
      candidateTreeSha: context.state.candidate.treeSha,
      stage,
    });
  } else if (
    fixtureProjectionStage &&
    context.state.executionClass === "real-candidate"
  ) {
    throw new Error(
      `Real certification ${stage} requires the canonical auth fixture session`,
    );
  }
  const ownsDatabaseCapability =
    profile.childVisibleVariables.includes("DATABASE_URL");
  if (Object.hasOwn(stageInputs ?? {}, "DATABASE_URL")) {
    throw new Error("DATABASE_URL is owned by the private stage projector");
  }
  let privateDatabaseEnvironment = {};
  if (ownsDatabaseCapability) {
    if (
      context.state.executionClass === "deterministic-simulation" &&
      context.environment.CERTIFICATION_QUALIFICATION_MODE === "1"
    ) {
      privateDatabaseEnvironment = {
        DATABASE_URL: requiredEnvironment(context.environment, "DATABASE_URL"),
      };
    } else {
      privateDatabaseEnvironment = resolveCertificationDatabaseStageEnvironment({
        repositoryRoot: context.canonicalRoot,
        environment: context.environment,
        state: context.state,
        stage,
      }).environment;
    }
  }
  const projection = projectCertificationChildEnvironment({
    repositoryRoot: context.repositoryRoot,
    baseEnvironment: authProjection
      ? { ...baseEnvironment, ...authProjection.environment }
      : baseEnvironment,
    stage,
    profileId,
    stageInputs: {
      ...stageInputs,
      ...privateDatabaseEnvironment,
      ...(stage === "build" &&
      profile.childVisibleVariables.includes("CERTIFICATION_QUALIFICATION_MODE") &&
      context.environment.CERTIFICATION_QUALIFICATION_MODE
        ? {
            CERTIFICATION_QUALIFICATION_MODE:
              context.environment.CERTIFICATION_QUALIFICATION_MODE,
          }
        : {}),
      ...(authProjection
        ? Object.fromEntries(
            profile.childVisibleVariables
              .filter((name) => authProjection.environment[name] !== undefined)
              .map((name) => [name, authProjection.environment[name]]),
          )
        : {}),
      ...(stage === "build" &&
      !authProjection &&
      context.state.executionClass === "deterministic-simulation" &&
      context.environment.CERTIFICATION_QUALIFICATION_MODE === "1"
        ? Object.fromEntries(
            ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
              .filter((name) => context.environment[name] !== undefined)
              .map((name) => [name, context.environment[name]]),
          )
        : {}),
    },
  });
  if (!authProjection) return projection;
  return Object.freeze({
    ...projection,
    authFixtureContinuity: authProjection.continuity,
  });
}

function stageChildEnvironment(context, options) {
  return stageChildProjection(context, options).environment;
}

function dependencyInstallationEnvironment(context) {
  const contract = stageEnvironmentContract(context.canonicalRoot);
  return Object.fromEntries(
    Object.entries(context.environment).filter(
      ([name]) =>
        !new Set(["NODE_OPTIONS", "NODE_PATH"]).has(name) &&
        !isCertificationControlVariableName(name, contract),
    ),
  );
}

function dependencyRevalidationRecord({ context, state, role, boundary }) {
  const binding = state.worktrees.roles[role];
  const retained = readAndValidateCertificationDependencyBindingEvidence({
    evidenceRoot: context.evidenceRoot,
    descriptor: binding.dependencyBindingEvidence,
    state,
    role,
    repositoryRoot: context.repositoryRoot,
    remeasure: true,
  });
  if (!retained.validation.valid) {
    throw new Error(
      `${role} dependency revalidation failed at ${boundary}: ${retained.validation.issues.join("; ")}`,
    );
  }
  const evidence = retained.evidence;
  return {
    role,
    boundary,
    dependencyIdentitySha256: evidence.dependencyIdentitySha256,
    bindingEvidenceSha256: binding.dependencyBindingEvidence.sha256,
    packageLockSha256: evidence.packageLockSha256,
    packageManifestSha256: evidence.packageManifestSha256,
    nodeModulesRootIdentitySha256:
      evidence.physicalNodeModulesProof.nodeModulesRootIdentitySha256,
    nodeModulesFilesystemIdentitySha256:
      evidence.physicalNodeModulesProof.nodeModulesFilesystemIdentitySha256,
    dependencyInventorySha256: evidence.dependencyInventory.sha256,
    topLevelPackageResolutionSha256:
      evidence.topLevelPackageResolutionProof.sha256,
    nodeSearchPathProofSha256: evidence.nodeSearchPathProof.sha256,
    isolationPassed: evidence.isolation.passed === true,
    equalToBoundIdentity:
      evidence.dependencyIdentitySha256 === binding.dependencyIdentitySha256,
  };
}

export function classifyCertificationDependencyInstallationFailure(
  installation,
) {
  if (!installation?.installationAttempted) {
    return {
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
      exitCode: 1,
      signal: null,
    };
  }
  if (installation.failurePhase === "measurement") {
    return {
      classification: "SOURCE_CONTRACT_FAILURE",
      exitCode: 1,
      signal: null,
    };
  }
  const evidence = installation.installation;
  const child =
    evidence?.completionMarker?.result === "wrapper-failed"
      ? evidence.dispatch
      : evidence?.child;
  const infrastructureFailure = Boolean(child?.spawnError || child?.signal);
  return {
    classification: infrastructureFailure
      ? "INFRASTRUCTURE_TRANSIENT"
      : "SOURCE_CONTRACT_FAILURE",
    exitCode: child?.signal ? null : (child?.exitCode ?? 1),
    signal: child?.signal ?? null,
  };
}

function runQualificationDependencyTestHook(context, hook, payload) {
  if (typeof hook !== "function") return;
  if (
    context.state.executionClass !== "deterministic-simulation" ||
    context.environment.CERTIFICATION_QUALIFICATION_MODE !== "1"
  ) {
    throw new StageFailure(
      "dependency mutation hooks are restricted to deterministic qualification",
      "PRECONDITION_ORCHESTRATION_FAILURE",
      false,
    );
  }
  hook(payload);
}

function installAndBindRoleDependencies({
  context,
  state,
  role,
  dispatch = null,
  beforeFinalDependencyMeasurement = null,
}) {
  const binding = state.worktrees?.roles?.[role];
  if (binding?.dependencyStatus === "installed") {
    dependencyRevalidationRecord({
      context,
      state,
      role,
      boundary: "already-bound-pre-stage",
    });
    return state;
  }
  if (binding?.dependencyStatus !== "not-installed") {
    throw new StageFailure(
      `${role} dependency lifecycle is not installable`,
      "SOURCE_CONTRACT_FAILURE",
      false,
    );
  }
  if (existsSync(path.join(context.repositoryRoot, "node_modules"))) {
    throw new StageFailure(
      `${role} has unbound physical dependencies and cannot run a second installation`,
      "SOURCE_CONTRACT_FAILURE",
      false,
    );
  }
  const stage =
    role === "source-validation"
      ? "source-validation"
      : role === "final-artifact"
        ? "build"
        : "browser-owners";
  let installation;
  try {
    installation = installCertificationWorktreeDependencies({
      repositoryRoot: context.repositoryRoot,
      evidenceRoot: context.evidenceRoot,
      state,
      role,
      environment: dependencyInstallationEnvironment(context),
      attemptNumber: state.stages[stage].attempts.at(-1).number,
      dispatch,
    });
  } catch (error) {
    throw new StageFailure(
      `${role} dependency installation could not begin: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "PRECONDITION_ORCHESTRATION_FAILURE",
      false,
    );
  }
  if (!installation.passed) {
    const failure = classifyCertificationDependencyInstallationFailure(
      installation,
    );
    if (installation.installationAttempted) {
      failCertificationWorktreeDependencyInstallation({
        statePath: context.statePath,
        expectedCurrentSha256: certificationStateSha256(state),
        evidenceRoot: context.evidenceRoot,
        canonicalRoot: context.canonicalRoot,
        role,
        installationEvidence: installation.installationDescriptor,
        installation: installation.installation,
      });
    }
    throw new StageFailure(
      `${role} dependency installation failed${
        installation.measurementError ? `: ${installation.measurementError}` : ""
      }`,
      failure.classification,
      false,
      {
        exitCode: failure.exitCode,
        signal: failure.signal,
      },
    );
  }
  let transition;
  try {
    transition = bindCertificationWorktreeDependencies({
      statePath: context.statePath,
      expectedCurrentSha256: certificationStateSha256(state),
      evidenceRoot: context.evidenceRoot,
      canonicalRoot: context.canonicalRoot,
      role,
      dependencyBindingEvidence: installation.bindingEvidenceDescriptor,
      beforeFinalDependencyMeasurement:
        typeof beforeFinalDependencyMeasurement === "function"
          ? () =>
              runQualificationDependencyTestHook(
                { ...context, state },
                beforeFinalDependencyMeasurement,
                { repositoryRoot: context.repositoryRoot, state },
              )
          : null,
    });
  } catch (error) {
    try {
      const current = readCertificationState(context.statePath);
      if (
        certificationStateSha256(current) === certificationStateSha256(state) &&
        current.worktrees?.roles?.[role]?.dependencyStatus === "not-installed"
      ) {
        failCertificationWorktreeDependencyBinding({
          statePath: context.statePath,
          expectedCurrentSha256: certificationStateSha256(current),
          evidenceRoot: context.evidenceRoot,
          canonicalRoot: context.canonicalRoot,
          role,
          dependencyBindingEvidence: installation.bindingEvidenceDescriptor,
        });
      }
    } catch {
      // Preserve the original bind failure. A retained node_modules root still
      // prevents a second install if a concurrent state writer won the CAS.
    }
    throw new StageFailure(
      `${role} dependency binding failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "SOURCE_CONTRACT_FAILURE",
      false,
    );
  }
  const rebound = readCertificationState(context.statePath);
  if (
    transition.stateSha256 !== certificationStateSha256(rebound) ||
    rebound.worktrees.roles[role].dependencyIdentitySha256 !==
      installation.bindingEvidence.dependencyIdentitySha256
  ) {
    throw new StageFailure(
      `${role} dependency binding was not durably committed`,
      "SOURCE_CONTRACT_FAILURE",
      false,
    );
  }
  return rebound;
}

export function assertCertificationChildPassed(
  child,
  message,
  classification,
  consumed,
) {
  if (child.error) {
    throw new StageFailure(message, "INFRASTRUCTURE_TRANSIENT", false, {
      exitCode: CHILD_SPAWN_ERROR_EXIT_CODE,
      spawnErrorClassification: "child-spawn-error",
    });
  }
  if (child.signal) {
    throw new StageFailure(message, "INFRASTRUCTURE_TRANSIENT", consumed, {
      exitCode: null,
      signal: child.signal,
    });
  }
  if (child.status !== 0 || child.signal) {
    throw new StageFailure(message, classification, consumed, {
      exitCode: normalizedChildExitCode(child.status),
    });
  }
}

function parseLastJson(stdout, description) {
  for (const line of String(stdout).trim().split("\n").reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      // npm may print command banners before the owner's sealed JSON.
    }
  }
  throw new Error(`${description} did not emit sealed JSON`);
}

async function validateLiveContext(
  context,
  { includeArtifact = true, verifyPhysicalWorktrees = true } = {},
) {
  if (context.state.executionClass === "real-candidate") {
    requireDatabaseLifecycleBinding(context, null, { reconcile: false });
  }
  let candidate;
  let harness;
  const comparatorIssues = [];
  const retainedInputIssues = [];
  try {
    candidate = currentCandidate(
      context.repositoryRoot,
      context.state.candidate,
      context.environment,
    );
    harness = harnessSourceIdentity(context.repositoryRoot);
  } catch (error) {
    retainedInputIssues.push(error instanceof Error ? error.message : String(error));
    candidate = context.state.candidate;
    harness = { sha256: context.state.harness.sourceSha256 };
  }
  const expectedCandidateId =
    context.environment.PRODUCTION_EVIDENCE_CANDIDATE_ID?.trim();
  if (expectedCandidateId && expectedCandidateId !== context.state.candidate.id) {
    comparatorIssues.push("expected candidate ID differs from the sealed candidate");
  }
  for (const [name, field] of [
    ["CERTIFICATION_EXPECTED_COMMIT_SHA", "commitSha"],
    ["CERTIFICATION_EXPECTED_TREE_SHA", "treeSha"],
    ["CERTIFICATION_EXPECTED_PARENT_SHA", "parentSha"],
  ]) {
    const expected = context.environment[name]?.trim();
    if (expected && expected !== context.state.candidate[field]) {
      comparatorIssues.push(`${name} differs from the sealed candidate`);
    }
  }
  let sourceValidationRoot = context.repositoryRoot;
  let artifactRoot = context.repositoryRoot;
  const worktreesCleaned =
    new Set([2, 3, 4]).has(context.state.version) &&
    Object.values(context.state.worktrees.roles).every(
      (binding) => binding.lifecycleStatus === "cleaned",
    );
  const worktreesUnavailable = worktreesCleaned || !verifyPhysicalWorktrees;
  if (new Set([2, 3, 4]).has(context.state.version) && !worktreesUnavailable) {
    try {
      sourceValidationRoot = resolveCertificationStageWorktree({
        state: context.state,
        evidenceRoot: context.evidenceRoot,
        canonicalRoot: context.canonicalRoot,
        role: "source-validation",
        phase:
          context.state.worktrees.roles["source-validation"].dependencyStatus ===
            "installed" ||
          (context.state.worktrees.roles["source-validation"]
            .dependencyStatus === undefined &&
            context.state.worktrees.roles["source-validation"]
              .dependencyIdentitySha256 !== null)
            ? "active"
            : "pristine",
      }).root;
      artifactRoot = resolveCertificationStageWorktree({
        state: context.state,
        evidenceRoot: context.evidenceRoot,
        canonicalRoot: context.canonicalRoot,
        role: "final-artifact",
        phase:
          context.state.worktrees.roles["final-artifact"].dependencyStatus ===
            "installed" ||
          (context.state.worktrees.roles["final-artifact"].dependencyStatus ===
            undefined &&
            context.state.worktrees.roles["final-artifact"]
              .dependencyIdentitySha256 !== null)
            ? "active"
            : "pristine",
      }).root;
    } catch (error) {
      retainedInputIssues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const stateValidation = validateCertificationState({
    state: context.state,
    evidenceRoot: context.evidenceRoot,
    expectedCandidate: context.state.candidate,
    expectedHarnessSourceSha256: harness.sha256,
    repositoryRoot: context.canonicalRoot,
    sourceValidationRoot,
    artifactRoot,
    verifyCurrentSource: !worktreesUnavailable,
  });
  retainedInputIssues.push(...stateValidation.issues);
  if (
    includeArtifact &&
    !worktreesUnavailable &&
    context.state.stages.build.status === "passed"
  ) {
    const manifestPath = path.join(artifactRoot, DEFAULT_MANIFEST);
    const journalPath = path.join(artifactRoot, DEFAULT_JOURNAL);
    try {
      const manifest = readJson(manifestPath, "production manifest v3");
      const journal = readJson(journalPath, "semantic journal v2");
      if (
        sha256Bytes(readFileSync(manifestPath)) !==
          context.state.bindings.productionManifestSha256 ||
        sha256Bytes(readFileSync(journalPath)) !==
          context.state.bindings.semanticJournalSha256 ||
        manifest.source?.commitSha !== candidate.commitSha ||
        manifest.source?.treeSha !== candidate.treeSha ||
        manifest.build?.nextBuildId !== context.state.bindings.nextBuildId ||
        manifest.artifact?.sha256 !== context.state.bindings.artifactSha256 ||
        journal.runNonce !== context.state.bindings.semanticJournalNonce ||
        readFileSync(path.join(artifactRoot, ".next/BUILD_ID"), "utf8").trim() !==
          context.state.bindings.nextBuildId
      ) {
        retainedInputIssues.push("live build, manifest, journal, or artifact identity changed");
      }
      const artifact = await validateProductionEvidence({
        repositoryRoot: artifactRoot,
        manifestPath: DEFAULT_MANIFEST,
        verificationMode:
          PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
        environment: context.environment,
      });
      if (!artifact.valid) retainedInputIssues.push(...artifact.issues);
    } catch (error) {
      retainedInputIssues.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (
    includeArtifact &&
    context.state.stages["browser-owners"].status === "passed"
  ) {
    try {
      verifyFinalCertificationEvidence({
        artifactRoot: path.join(context.evidenceRoot, "archive/extracted"),
        manifestPath: DEFAULT_MANIFEST,
        environment: {
          ...context.environment,
          PRODUCTION_CERTIFICATION_STATE: context.statePath,
          CERTIFICATION_EVIDENCE_ROOT: context.evidenceRoot,
          ...(context.state.executionClass === "deterministic-simulation"
            ? { CERTIFICATION_ALLOW_SIMULATION: "1" }
            : {}),
        },
      });
    } catch (error) {
      retainedInputIssues.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (context.state.stages["integration-ready"].status === "passed") {
    try {
      const descriptor = context.state.evidenceFiles["integration-ready"];
      const readiness = readJson(
        path.join(context.evidenceRoot, descriptor.path),
        "integration readiness evidence",
      );
      const localCommitSha = git(context.repositoryRoot, [
        "rev-parse",
        "--verify",
        `${readiness.local.ref}^{commit}`,
      ]);
      const localTreeSha = git(context.repositoryRoot, [
        "rev-parse",
        "--verify",
        `${readiness.local.ref}^{tree}`,
      ]);
      const trackingCommitSha = git(context.repositoryRoot, [
        "rev-parse",
        "--verify",
        `${readiness.tracking.ref}^{commit}`,
      ]);
      const trackingTreeSha = git(context.repositoryRoot, [
        "rev-parse",
        "--verify",
        `${readiness.tracking.ref}^{tree}`,
      ]);
      const ancestry = spawnSync(
        "git",
        ["merge-base", "--is-ancestor", localCommitSha, candidate.commitSha],
        { cwd: context.repositoryRoot, encoding: "utf8" },
      );
      if (
        readiness.schema !==
          "interior-ai.production-certification-integration-readiness.v1" ||
        JSON.stringify(readiness.candidate) !==
          JSON.stringify(context.state.candidate) ||
        readiness.local.commitSha !== localCommitSha ||
        readiness.local.treeSha !== localTreeSha ||
        readiness.tracking.commitSha !== trackingCommitSha ||
        readiness.tracking.treeSha !== trackingTreeSha ||
        localCommitSha !== trackingCommitSha ||
        localTreeSha !== trackingTreeSha ||
        readiness.sourceValidationSha256 !==
          context.state.evidenceFiles["source-validation"]?.sha256 ||
        readiness.finalStandaloneSha256 !==
          context.state.evidenceFiles["final-standalone"]?.sha256 ||
        readiness.continuitySha256 !==
          context.state.evidenceFiles.continuity?.sha256 ||
        readiness.fastForwardReady !== true ||
        readiness.complete !== true ||
        ancestry.status !== 0 ||
        ancestry.signal ||
        ancestry.error
      ) {
        retainedInputIssues.push("integration readiness refs, identity, or ancestry changed");
      }
    } catch (error) {
      retainedInputIssues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const issues = [...comparatorIssues, ...retainedInputIssues];
  const invalidationPlan =
    retainedInputIssues.length > 0
      ? createCertificationInvalidationPlan({
          state: context.state,
          stage: invalidationStage(retainedInputIssues),
          reason: "current source, harness, artifact, worktree, or retained evidence changed",
          issues: retainedInputIssues,
        })
      : null;
  const classification =
    issues.length === 0
      ? null
      : comparatorIssues.length > 0 && retainedInputIssues.length === 0
        ? "PRECONDITION_ORCHESTRATION_FAILURE"
        : "SOURCE_CONTRACT_FAILURE";
  const report = createCertificationValidationReport({
    state: context.state,
    command: context.command,
    valid: issues.length === 0,
    classification,
    issues,
    expectedComparators: {
      candidateId: expectedCandidateId ?? null,
      commitSha: context.environment.CERTIFICATION_EXPECTED_COMMIT_SHA?.trim() ?? null,
      treeSha: context.environment.CERTIFICATION_EXPECTED_TREE_SHA?.trim() ?? null,
      parentSha: context.environment.CERTIFICATION_EXPECTED_PARENT_SHA?.trim() ?? null,
      stateSha256:
        context.environment.CERTIFICATION_EXPECTED_STATE_SHA256?.trim() ?? null,
    },
    invalidationPlan,
  });
  return {
    valid: issues.length === 0,
    issues,
    comparatorIssues,
    retainedInputIssues,
    candidate,
    harness,
    report,
  };
}

function invalidationStage(issues) {
  const message = issues.join("\n");
  if (/harness|doctor/i.test(message)) return "doctor";
  if (/integration[- ]readiness|integration-ready|tracking ref/i.test(message)) {
    return "integration-ready";
  }
  if (/manifest|journal|Build ID|artifact|evidence build/i.test(message)) return "build";
  if (/source|candidate|worktree|tree differs|commit differs/i.test(message)) {
    return "source-validation";
  }
  if (/archive/i.test(message)) return "archive-preflight";
  if (/Phase 8|phase8/i.test(message)) return "phase8";
  if (/runtime/i.test(message)) return "runtime-smoke";
  if (/browser/i.test(message)) return "browser-owners";
  if (/continuity/i.test(message)) return "continuity";
  if (/final/i.test(message)) return "final-standalone";
  return "source-validation";
}

async function requireLiveContext(context, options) {
  const validation = await validateLiveContext(context, options);
  if (!validation.valid) {
    throw new StageFailure(
      validation.issues.join("; "),
      validation.report.classification,
      false,
      { result: validation.report },
    );
  }
  return validation;
}

function certificationTimestamp(environment, suffix) {
  if (
    environment.CERTIFICATION_EXECUTION_CLASS === "deterministic-simulation" &&
    environment.CERTIFICATION_QUALIFICATION_MODE === "1"
  ) {
    return requiredEnvironment(environment, `CERTIFICATION_${suffix}`);
  }
  return new Date().toISOString();
}

export function certificationStageFailure(
  error,
  { consumed = false, classification = "SOURCE_CONTRACT_FAILURE" } = {},
) {
  if (error instanceof StageFailure) {
    if (!consumed || error.consumed) return error;
    return new StageFailure(error.message, error.classification, true, {
      exitCode: error.exitCode,
      signal: error.signal,
      result: error.certificationResult,
      evidenceFiles: error.evidenceFiles,
      stage: error.stage,
      stageAttempt: error.stageAttempt,
      failedStateSha256: error.failedStateSha256,
      spawnErrorClassification: error.spawnErrorClassification,
    });
  }
  return new StageFailure(
    error instanceof Error ? error.message : String(error),
    classification,
    consumed,
  );
}

export function persistManagedCertificationStageFailure({
  statePath,
  stage,
  failure,
  completedAt,
}) {
  const durableFailureState = readCertificationState(statePath);
  const attempt = durableFailureState.stages[stage]?.attempts.at(-1);
  if (attempt?.status !== "running" || attempt.number < 1) {
    throw new Error("managed stage failure is not bound to a running attempt");
  }
  const failedState = completeCertificationStage(durableFailureState, {
    stage,
    passed: false,
    completedAt,
    exitCode: failure.exitCode,
    signal: failure.signal,
    failureClassification: failure.classification,
    consumedSubstantiveGate: failure.consumed,
    evidenceFiles: failure.evidenceFiles,
  });
  const failedStateSha256 = certificationStateSha256(failedState);
  writeCertificationState(statePath, failedState, {
    expectedCurrentSha256: certificationStateSha256(durableFailureState),
  });
  const physicalFailedState = readCertificationState(statePath);
  if (certificationStateSha256(physicalFailedState) !== failedStateSha256) {
    throw new Error(
      "managed stage failed-state SHA does not match the physical state",
    );
  }
  failure.stage = stage;
  failure.stageAttempt = attempt.number;
  failure.failedStateSha256 = failedStateSha256;
  return failure;
}

async function managedStage(
  context,
  stage,
  action,
  {
    consumptionProbe = () => false,
    postBoundaryClassification = "SOURCE_CONTRACT_FAILURE",
  } = {},
) {
  await requireLiveContext(context, { includeArtifact: stage !== "doctor" });
  const priorStateSha256 = certificationStateSha256(context.state);
  const runningState = startCertificationStage(context.state, {
    stage,
    startedAt: certificationTimestamp(context.environment, "STAGE_STARTED_AT"),
  });
  writeCertificationState(context.statePath, runningState, {
    expectedCurrentSha256: priorStateSha256,
  });
  try {
    const result = await action(runningState);
    const validationState = readCertificationState(context.statePath);
    const postAction = await validateLiveContext({
      ...context,
      state: validationState,
    }, {
      includeArtifact: !["doctor", "build"].includes(stage),
    });
    if (!postAction.valid) {
      throw new StageFailure(
        postAction.issues.join("; "),
        /source|candidate|harness/i.test(postAction.issues.join(" "))
          ? "SOURCE_CONTRACT_FAILURE"
          : "ARTIFACT_CONTINUITY_FAILURE",
        result.consumed === true,
      );
    }
    const durableActionState = readCertificationState(context.statePath);
    let completedState = completeCertificationStage(durableActionState, {
      stage,
      passed: true,
      completedAt: certificationTimestamp(context.environment, "STAGE_COMPLETED_AT"),
      exitCode: 0,
      outputHashes: result.outputHashes ?? {},
      bindingUpdates: result.bindingUpdates ?? {},
      evidenceFiles: result.evidenceFiles ?? {},
      consumedSubstantiveGate: result.consumed === true,
    });
    writeCertificationState(context.statePath, completedState, {
      expectedCurrentSha256: certificationStateSha256(durableActionState),
    });
    return result.result ?? result;
  } catch (error) {
    let consumed = false;
    try {
      consumed = consumptionProbe() === true;
    } catch {
      consumed = false;
    }
    const failure = certificationStageFailure(error, {
      consumed,
      classification: consumed
        ? postBoundaryClassification
        : "SOURCE_CONTRACT_FAILURE",
    });
    throw persistManagedCertificationStageFailure({
      statePath: context.statePath,
      stage,
      failure,
      completedAt: certificationTimestamp(
        context.environment,
        "STAGE_COMPLETED_AT",
      ),
    });
  }
}

export function initializeRealCertification({
  repositoryRoot = process.cwd(),
  environment = process.env,
  testHooks = null,
} = {}) {
  validateCertificationInvocation({
    repositoryRoot,
    environment,
    command: "state:init",
  });
  const evidenceRoot = requiredEnvironment(environment, CERTIFICATION_EVIDENCE_ROOT_ENV);
  resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot: evidenceRoot,
    repositoryRoot,
  });
  const requestedStatePath = requiredEnvironment(environment, CERTIFICATION_STATE_ENV);
  const evidenceRootPath = realpathSync(evidenceRoot);
  const requestedAbsoluteStatePath = path.resolve(requestedStatePath);
  const resolvedStatePath = path.join(
    realpathSync(path.dirname(requestedAbsoluteStatePath)),
    path.basename(requestedAbsoluteStatePath),
  );
  if (!resolvedStatePath.startsWith(`${evidenceRootPath}${path.sep}`)) {
    throw new Error("certification state target escapes its authorized evidence root");
  }
  const relativeStatePath = path.relative(evidenceRootPath, resolvedStatePath);
  const statePath = absentEvidenceTarget(evidenceRootPath, relativeStatePath);
  const candidate = currentCandidate(repositoryRoot, null, environment);
  if (!isCandidateId(candidate.id)) {
    throw new InvocationFailure("certification candidate ID is missing or malformed");
  }
  for (const [name, actual] of [
    ["CERTIFICATION_EXPECTED_COMMIT_SHA", candidate.commitSha],
    ["CERTIFICATION_EXPECTED_TREE_SHA", candidate.treeSha],
    ["CERTIFICATION_EXPECTED_PARENT_SHA", candidate.parentSha],
  ]) {
    if (requiredEnvironment(environment, name) !== actual) {
      throw new InvocationFailure(`${name} differs from the candidate source`);
    }
  }
  const harness = harnessSourceIdentity(repositoryRoot);
  const certificationId = requiredEnvironment(environment, "PRODUCTION_CERTIFICATION_ID");
  const executionClass = environment.CERTIFICATION_EXECUTION_CLASS?.trim();
  if (
    executionClass !== "real-candidate" &&
    !(
      executionClass === "deterministic-simulation" &&
      environment.CERTIFICATION_QUALIFICATION_MODE === "1"
    )
  ) {
    throw new Error("state initialization requires a permitted execution classification");
  }
  const createdAt =
    executionClass === "deterministic-simulation"
      ? requiredEnvironment(environment, "CERTIFICATION_CREATED_AT")
      : new Date().toISOString();
  if (
    testHooks !== null &&
    !(
      executionClass === "deterministic-simulation" &&
      environment.CERTIFICATION_QUALIFICATION_MODE === "1"
    )
  ) {
    throw new Error("state initialization test hooks require qualification simulation");
  }
  const invocationNonce = environment.CERTIFICATION_STAGE_RESULT_NONCE?.trim() ?? null;
  createCertificationState({
    certificationId,
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    treeSha: candidate.treeSha,
    parentSha: candidate.parentSha,
    harnessSourceSha256: harness.sha256,
    executionClass,
    createdAt,
  });
  let transaction = null;
  let resourcePlan = null;
  let databaseLifecycle = null;
  let pendingState = null;
  let durableStateCommitted = false;
  try {
    resourcePlan = createCertificationResourcePlan({
      repositoryRoot,
      evidenceRoot: path.resolve(evidenceRoot),
      environment,
    });
    if (executionClass === "real-candidate") {
      const plannedDatabase = readCertificationDatabaseLifecycle({
        repositoryRoot,
        environment,
      });
      if (plannedDatabase.evidence.currentState !== "planned") {
        throw new Error("state initialization requires a fresh planned database lifecycle");
      }
      databaseLifecycle = plannedDatabase.binding;
    }
    transaction = beginCertificationStageWorktreeTransaction({
      canonicalRoot: repositoryRoot,
      evidenceRoot: evidenceRootPath,
      worktreeRoot: requiredEnvironment(environment, CERTIFICATION_WORKTREE_ROOT_ENV),
      certificationId,
      candidate,
      createdAt,
      testHooks,
    });
    const worktrees = transaction.allocate();
    if (testHooks?.failBeforeStateWrite === true) {
      throw new Error("injected failure before certification state write");
    }
    const state = createCertificationState({
      certificationId,
      candidateId: candidate.id,
      commitSha: candidate.commitSha,
      treeSha: candidate.treeSha,
      parentSha: candidate.parentSha,
      harnessSourceSha256: harness.sha256,
      executionClass,
      createdAt,
      worktrees,
      resourcePlan,
      databaseLifecycle,
    });
    pendingState = state;
    (testHooks?.stateWriter ?? writeCertificationState)(statePath, state, {
      requireAbsent: true,
    });
    durableStateCommitted = true;
    transaction.commit();
    if (testHooks?.failAfterStateWrite === true) {
      throw new Error("injected post-state initialization failure");
    }
    return {
      statePath,
      stateSha256: certificationStateSha256(state),
      certificationId,
      candidate,
      harness,
      destinationSetSha256: resourcePlan.destinationSetSha256,
    };
  } catch (error) {
    if (!durableStateCommitted && pendingState && existsSync(statePath)) {
      try {
        durableStateCommitted =
          certificationStateSha256(readCertificationState(statePath)) ===
          certificationStateSha256(pendingState);
      } catch {
        durableStateCommitted = false;
      }
    }
    if (durableStateCommitted) {
      try {
        transaction?.commit();
      } catch {
        // A successful normal commit or post-state injected failure is already durable.
      }
      throw error;
    }
    const emptyInventory = {
      worktreeCount: 0,
      worktreeRoleInventorySha256: sha256Bytes(canonicalJsonBytes([])),
      registrationCount: 0,
      registrationRoleInventorySha256: sha256Bytes(canonicalJsonBytes([])),
      sidecarCount: 0,
      sidecarRoleInventorySha256: sha256Bytes(canonicalJsonBytes([])),
      directoryCount: 0,
      directoryInventorySha256: sha256Bytes(canonicalJsonBytes([])),
    };
    const rollback = transaction
      ? transaction.rollback()
      : {
          outcome: "completed",
          createdResourceInventory: emptyInventory,
          worktrees: [],
          sidecars: [],
          terminalRegistrationAbsence: { proven: true, roleResults: {} },
          canonicalCheckoutUnchanged: true,
          issues: [],
        };
    if (!invocationNonce) {
      throw Object.assign(error, { certificationWorktreeRollback: rollback });
    }
    const preStateFailure = writeCertificationPreStateFailureReceipt({
      evidenceRoot: evidenceRootPath,
      certificationId,
      candidate,
      harnessSourceSha256: harness.sha256,
      invocationNonce,
      originalError: error,
      rollback,
      completedAt:
        executionClass === "deterministic-simulation"
          ? createdAt
          : new Date().toISOString(),
    });
    throw Object.assign(error, {
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
      consumed: false,
      certificationPreStateFailure: preStateFailure,
    });
  }
}

export async function runDoctorStage({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, { command: "doctor" });
  return managedStage(context, "doctor", async (state) => {
    const doctor = await runCertificationDoctor({ repositoryRoot, environment });
    const attemptNumber = state.stages.doctor.attempts.at(-1).number;
    const descriptor = writeEvidence(
      context.evidenceRoot,
      `doctor/attempt-${String(attemptNumber).padStart(3, "0")}.json`,
      doctor,
    );
    if (!doctor.valid) {
      throw new StageFailure(
        doctor.issues.join("; "),
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
        {
          result: doctor,
          evidenceFiles: { doctor: descriptor },
        },
      );
    }
    return {
      outputHashes: { doctor: descriptor.sha256 },
      evidenceFiles: { doctor: descriptor },
      result: doctor,
    };
  });
}

export async function runDatabaseProvision({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "database:provision",
  });
  requireDatabaseLifecycleBinding(context, ["planned"]);
  if (context.state.stages.doctor.status !== "passed") {
    throw new InvocationFailure("database provision requires a passed doctor stage");
  }
  const result = await runDatabaseLifecycleTransition(context, () =>
    provisionCertificationDatabase({ repositoryRoot, environment }),
  );
  return {
    valid: true,
    lifecycleState: result.evidence.currentState,
    databaseNameSha256: result.evidence.database.nameSha256,
    migrationCount: result.evidence.migration.count,
    evidenceSha256: result.descriptor.sha256,
  };
}

export async function runDatabaseVerifyInitial({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "database:verify-initial",
  });
  requireDatabaseLifecycleBinding(context, ["migrated"]);
  const result = await runDatabaseLifecycleTransition(context, () =>
    verifyInitialCertificationDatabase({ repositoryRoot, environment }),
  );
  return {
    valid: true,
    lifecycleState: result.evidence.currentState,
    applicationTableCount:
      result.evidence.inventories.initial.applicationTableCount,
    totalRows: result.evidence.inventories.initial.totalRows,
    sessionCount: result.evidence.sessions.initial.count,
    evidenceSha256: result.descriptor.sha256,
  };
}

export async function runDatabaseVerifyFinal({
  repositoryRoot = process.cwd(),
  environment = process.env,
  adapter = null,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "database:verify-final",
  });
  requireDatabaseLifecycleBinding(context, ["active"]);
  if (context.state.stages["browser-owners"].status !== "passed") {
    throw new InvocationFailure(
      "final database verification requires passed browser owners",
    );
  }
  const runtimeAttempt = context.state.stages["runtime-smoke"].attempts.at(-1);
  const browserAttempt = context.state.stages["browser-owners"].attempts.at(-1);
  const appEventOwnership = {
    certificationId: context.state.certificationId,
    candidateId: context.state.candidate.id,
    commitSha: context.state.candidate.commitSha,
    treeSha: context.state.candidate.treeSha,
    runtimeAttempt: runtimeAttempt?.number,
    browserAttempt: browserAttempt?.number,
    browserOwnerIds: REQUIRED_BROWSER_OWNERS.map((owner) => owner.id),
  };
  let result;
  try {
    result = await runDatabaseLifecycleTransition(context, () =>
      verifyFinalCertificationDatabase({
        repositoryRoot,
        environment,
        adapter,
        appEventOwnership,
      }),
    );
  } catch (error) {
    if (!error?.databaseLifecycleResult) throw error;
    const failedState = readCertificationState(context.statePath);
    const failedStateSha256 = certificationStateSha256(failedState);
    const failure = error.databaseLifecycleResult.evidence.failure;
    const attempt = failure?.attempt;
    const snapshot = retainCertificationDatabaseFailureSnapshot({
      repositoryRoot,
      environment,
      attempt,
    });
    const databaseFailure = new StageFailure(
      error instanceof Error ? error.message : String(error),
      "DATABASE_LIFECYCLE_FAILURE",
      true,
      {
        evidenceFiles: { "database-final-failure": snapshot },
        stage: "database:verify-final",
        stageAttempt: attempt,
        failedStateSha256,
      },
    );
    databaseFailure.databaseLifecycleResult = error.databaseLifecycleResult;
    databaseFailure.databaseLifecycleFailure = {
      classification: "DATABASE_LIFECYCLE_FAILURE",
      stage: "database:verify-final",
      attempt,
      consumedSubstantiveGate: true,
      failedStateSha256,
      evidenceReferences: databaseFailure.evidenceFiles,
    };
    throw databaseFailure;
  }
  return {
    valid: true,
    attempt: 1,
    lifecycleState: result.evidence.currentState,
    totalRows: result.evidence.inventories.final.totalRows,
    sessionCount: result.evidence.sessions.final.count,
    evidenceSha256: result.descriptor.sha256,
  };
}

export async function runDatabaseDrop({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "database:drop",
  });
  requireDatabaseLifecycleBinding(context, ["final-empty-verified"]);
  const result = await runDatabaseLifecycleTransition(context, () =>
    dropCertificationDatabase({ repositoryRoot, environment }),
  );
  return {
    valid: true,
    lifecycleState: result.evidence.currentState,
    terminatedSessionCount:
      result.evidence.sessions.release.matchedSessionCount,
    evidenceSha256: result.descriptor.sha256,
  };
}

export async function runDatabaseVerifyAbsent({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "database:verify-absent",
  });
  requireDatabaseLifecycleBinding(context, ["dropped"]);
  const result = await runDatabaseLifecycleTransition(context, () =>
    verifyCertificationDatabaseAbsent({ repositoryRoot, environment }),
  );
  return {
    valid: true,
    lifecycleState: result.evidence.currentState,
    targetAbsent: true,
    evidenceSha256: result.descriptor.sha256,
  };
}

function originalFailureMatchesPhysical(left, right) {
  const failureKeys = [
    "classification",
    "stage",
    "attempt",
    "consumedSubstantiveGate",
    "failedStateSha256",
    "evidenceReferences",
  ];
  const exactFailureKeys = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") ===
      [...failureKeys].sort().join("\n");
  if (!exactFailureKeys(left) || !exactFailureKeys(right)) return false;
  for (const name of failureKeys.filter((name) => name !== "evidenceReferences")) {
    if (left[name] !== right[name]) return false;
  }
  const leftEvidence = left.evidenceReferences;
  const rightEvidence = right.evidenceReferences;
  if (
    !leftEvidence ||
    !rightEvidence ||
    typeof leftEvidence !== "object" ||
    typeof rightEvidence !== "object" ||
    Array.isArray(leftEvidence) ||
    Array.isArray(rightEvidence)
  ) {
    return false;
  }
  const names = Object.keys(leftEvidence).sort();
  if (names.join("\n") !== Object.keys(rightEvidence).sort().join("\n")) {
    return false;
  }
  return names.every(
    (name) =>
      leftEvidence[name]?.path === rightEvidence[name]?.path &&
      leftEvidence[name]?.sha256 === rightEvidence[name]?.sha256 &&
      Object.keys(leftEvidence[name] ?? {}).sort().join("\n") ===
        "path\nsha256" &&
      Object.keys(rightEvidence[name] ?? {}).sort().join("\n") ===
        "path\nsha256",
  );
}

export async function runDatabaseAbortCleanup({
  repositoryRoot = process.cwd(),
  environment = process.env,
  originalFailure = null,
  adapter = null,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "database:abort-cleanup",
  });
  const lifecycleBeforeCleanup = requireDatabaseLifecycleBinding(context);
  const failedStages = CERTIFICATION_STAGE_ORDER.filter(
    (stage) => context.state.stages?.[stage]?.status === "failed",
  );
  if (failedStages.length > 1) {
    throw new InvocationFailure(
      "database abort cleanup found multiple physical failed stages",
    );
  }
  const failedStage = failedStages[0] ?? null;
  const failedAttempt = failedStage
    ? context.state.stages[failedStage].attempts.at(-1)
    : null;
  const physicalFailure = failedStage
    ? {
        classification: failedAttempt.failureClassification,
        stage: failedStage,
        attempt: failedAttempt.number,
        consumedSubstantiveGate: failedAttempt.consumedSubstantiveGate,
        failedStateSha256: certificationStateSha256(context.state),
        evidenceReferences: certificationStageEvidenceFiles(
          context.state,
          failedStage,
        ),
      }
    : null;
  if (
    physicalFailure &&
    originalFailure &&
    !originalFailureMatchesPhysical(originalFailure, physicalFailure)
  ) {
    throw new InvocationFailure(
      "database abort cleanup original failure differs from the physical failed stage",
    );
  }
  const retainedFailure =
    physicalFailure ??
    originalFailure ??
    (lifecycleBeforeCleanup?.evidence?.failure
      ? {
          classification: lifecycleBeforeCleanup.evidence.failure.classification,
          stage: lifecycleBeforeCleanup.evidence.failure.originalStage,
          attempt: lifecycleBeforeCleanup.evidence.failure.attempt,
          consumedSubstantiveGate:
            lifecycleBeforeCleanup.evidence.failure.consumedSubstantiveGate,
          failedStateSha256:
            lifecycleBeforeCleanup.evidence.failure.failedStateSha256,
          evidenceReferences:
            lifecycleBeforeCleanup.evidence.failure.evidenceReferences,
        }
      : null);
  const wrapperOwnedFailure = retainedFailure ?? {
    classification: "PRECONDITION_ORCHESTRATION_FAILURE",
    stage: "database-abort-cleanup",
    attempt: null,
    consumedSubstantiveGate: false,
    failedStateSha256: null,
    evidenceReferences: {},
  };
  const result = await runDatabaseLifecycleTransition(context, () =>
    abortCertificationDatabase({
      repositoryRoot,
      environment,
      originalFailure: wrapperOwnedFailure,
      adapter,
    }),
  );
  const authoritativeFailure = result.evidence.failure;
  return {
    valid: false,
    classification: authoritativeFailure.classification,
    consumedSubstantiveGate:
      authoritativeFailure.consumedSubstantiveGate,
    lifecycleState: result.evidence.currentState,
    originalFailureRetained: true,
    originalFailure: {
      classification: authoritativeFailure.classification,
      originalStage: authoritativeFailure.originalStage,
      attempt: authoritativeFailure.attempt,
      consumedSubstantiveGate:
        authoritativeFailure.consumedSubstantiveGate,
      failedStateSha256: authoritativeFailure.failedStateSha256,
      evidenceReferences: structuredClone(
        authoritativeFailure.evidenceReferences ?? {},
      ),
    },
    failedRunRehabilitated: false,
    targetAbsent: true,
    evidenceSha256: result.descriptor.sha256,
  };
}

export async function runDatabaseStatus({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "database:status",
  });
  requireDatabaseLifecycleBinding(context, null, { reconcile: false });
  return certificationDatabaseStatus({ repositoryRoot, environment });
}

export async function validateCertificationReadOnly({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "state:validate",
  });
  const validation = await validateLiveContext(context, { includeArtifact: true });
  return validation.report;
}

export async function validateBuildEligibility({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "build:eligibility",
  });
  const validation = await validateLiveContext(context, { includeArtifact: false });
  if (validation.valid && context.state.stages["source-validation"].status !== "passed") {
    return createCertificationValidationReport({
      state: context.state,
      command: "build:eligibility",
      valid: false,
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
      issues: ["build eligibility requires passed source-validation"],
      expectedComparators: validation.report.expectedComparators,
    });
  }
  return validation.report;
}

export async function reconcileCertificationValidation({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "state:reconcile",
  });
  const retainedPlan = resolveRetainedExternalEvidenceFile({
    filePath: requiredEnvironment(environment, "CERTIFICATION_INVALIDATION_PLAN"),
    authorizedExternalRoot: context.evidenceRoot,
    repositoryRoot,
  });
  const bytes = readFileSync(retainedPlan.absolutePath);
  let plan;
  try {
    plan = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new InvocationFailure("certification invalidation plan is not valid JSON");
  }
  if (!bytes.equals(canonicalJsonBytes(plan))) {
    throw new InvocationFailure("certification invalidation plan is not canonical JSON");
  }
  const planIssues = certificationInvalidationPlanIssues(plan);
  if (planIssues.length > 0) throw new InvocationFailure(planIssues.join("; "));
  const currentValidation = await validateLiveContext(context, {
    includeArtifact: true,
  });
  if (
    currentValidation.valid ||
    currentValidation.comparatorIssues.length > 0 ||
    !currentValidation.report.invalidationPlan ||
    !bytes.equals(
      canonicalJsonBytes(currentValidation.report.invalidationPlan),
    )
  ) {
    throw new InvocationFailure(
      "certification invalidation plan no longer matches the current proven mismatch",
    );
  }
  const reconciled = reconcileCertificationState(context.state, {
    plan,
    expectedStateSha256: environment.CERTIFICATION_EXPECTED_STATE_SHA256.trim(),
    invalidatedAt: certificationTimestamp(environment, "INVALIDATED_AT"),
  });
  writeCertificationState(context.statePath, reconciled, {
    expectedCurrentSha256: certificationStateSha256(context.state),
  });
  return {
    valid: true,
    classification: null,
    consumedSubstantiveGate: false,
    stateSha256: certificationStateSha256(reconciled),
    invalidatedStage: plan.stage,
    cascadingStages: plan.cascadingStages,
  };
}

export async function cleanupCertificationWorktrees({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "worktrees:cleanup",
  });
  await requireLiveContext(context, {
    includeArtifact: false,
    verifyPhysicalWorktrees: false,
  });
  const worktrees = cleanupCertificationStageWorktrees({
    state: context.state,
    evidenceRoot: context.evidenceRoot,
    canonicalRoot: context.canonicalRoot,
  });
  const next = replaceCertificationWorktrees(context.state, worktrees);
  writeCertificationState(context.statePath, next, {
    expectedCurrentSha256: certificationStateSha256(context.state),
  });
  return {
    valid: true,
    cleanedRoles: [...CERTIFICATION_WORKTREE_ROLES],
    stateSha256: certificationStateSha256(next),
  };
}

export async function runIntegrationReadyStage({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const context = stateContext(repositoryRoot, environment, {
    command: "integration-ready",
  });
  await requireLiveContext(context, { includeArtifact: true });
  const state = readCertificationState(context.statePath);
  if (
    state.stages.continuity.status === "passed" &&
    state.stages["integration-ready"].status !== "passed"
  ) {
    const refreshed = { ...context, command: "integration-ready", state };
    return managedStage(refreshed, "integration-ready", async () => {
      const localRef = requiredEnvironment(
        environment,
        "CERTIFICATION_INTEGRATION_BRANCH_REF",
      );
      const trackingRef = requiredEnvironment(
        environment,
        "CERTIFICATION_INTEGRATION_TRACKING_REF",
      );
      if (
        !/^refs\/heads\/[A-Za-z0-9._\/-]+$/.test(localRef) ||
        !/^refs\/remotes\/[A-Za-z0-9._\/-]+$/.test(trackingRef)
      ) {
        throw new StageFailure(
          "integration branch or tracking ref is not canonical",
          "PRECONDITION_ORCHESTRATION_FAILURE",
          false,
        );
      }
      const localCommitSha = git(repositoryRoot, ["rev-parse", "--verify", `${localRef}^{commit}`]);
      const localTreeSha = git(repositoryRoot, ["rev-parse", "--verify", `${localRef}^{tree}`]);
      const trackingCommitSha = git(repositoryRoot, [
        "rev-parse",
        "--verify",
        `${trackingRef}^{commit}`,
      ]);
      const trackingTreeSha = git(repositoryRoot, [
        "rev-parse",
        "--verify",
        `${trackingRef}^{tree}`,
      ]);
      const expectedCommitSha = requiredEnvironment(
        environment,
        "CERTIFICATION_EXPECTED_INTEGRATION_COMMIT_SHA",
      );
      const expectedTreeSha = requiredEnvironment(
        environment,
        "CERTIFICATION_EXPECTED_INTEGRATION_TREE_SHA",
      );
      const ancestry = spawnSync(
        "git",
        ["merge-base", "--is-ancestor", localCommitSha, state.candidate.commitSha],
        { cwd: repositoryRoot, encoding: "utf8" },
      );
      if (
        localCommitSha !== expectedCommitSha ||
        trackingCommitSha !== expectedCommitSha ||
        localTreeSha !== expectedTreeSha ||
        trackingTreeSha !== expectedTreeSha ||
        ancestry.status !== 0 ||
        ancestry.signal ||
        ancestry.error
      ) {
        throw new StageFailure(
          "integration branch/tracking identity or exact fast-forward ancestry changed",
          "SOURCE_CONTRACT_FAILURE",
          false,
        );
      }
      const readiness = {
        schema: "interior-ai.production-certification-integration-readiness.v1",
        candidate: state.candidate,
        local: { ref: localRef, commitSha: localCommitSha, treeSha: localTreeSha },
        tracking: {
          ref: trackingRef,
          commitSha: trackingCommitSha,
          treeSha: trackingTreeSha,
        },
        sourceValidationSha256:
          state.evidenceFiles["source-validation"].sha256,
        finalStandaloneSha256: state.evidenceFiles["final-standalone"].sha256,
        continuitySha256: state.evidenceFiles.continuity.sha256,
        fastForwardReady: true,
        complete: true,
      };
      const descriptor = writeEvidence(
        context.evidenceRoot,
        "integration-ready/evidence.json",
        readiness,
      );
      return {
        outputHashes: { readiness: descriptor.sha256 },
        evidenceFiles: { "integration-ready": descriptor },
        result: {
          valid: true,
          advancedStage: "integration-ready",
          readinessSha256: descriptor.sha256,
        },
      };
    });
  }
  throw new StageFailure(
    "integration-ready requires passed continuity and an unpassed readiness stage",
    "PRECONDITION_ORCHESTRATION_FAILURE",
    false,
  );
}

export async function runSourceValidationStage({
  repositoryRoot = process.cwd(),
  environment = process.env,
  testHooks = null,
} = {}) {
  let context = stateContext(repositoryRoot, environment, {
    command: "source-validation",
    role: "source-validation",
  });
  context = await bindDatabaseForStage(
    context,
    "source-validation",
    testHooks?.databaseAdapter ?? null,
  );
  let sourceConsumed = false;
  return managedStage(
    context,
    "source-validation",
    async (state) => {
      const boundState = installAndBindRoleDependencies({
        context,
        state,
        role: "source-validation",
        beforeFinalDependencyMeasurement:
          testHooks?.beforeFinalDependencyMeasurement,
      });
      runQualificationDependencyTestHook(
        { ...context, state: boundState },
        testHooks?.afterDependencyBinding,
        { repositoryRoot: context.repositoryRoot, state: boundState },
      );
      const sourceWorktree = resolveCertificationStageWorktree({
        state: boundState,
        evidenceRoot: context.evidenceRoot,
        canonicalRoot: context.canonicalRoot,
        role: "source-validation",
        phase: "active",
      });
      const qualificationSource =
        boundState.executionClass === "deterministic-simulation" &&
        context.environment.CERTIFICATION_QUALIFICATION_MODE === "1";
      const sourceEnvironment = stageChildEnvironment(
        { ...context, state: boundState },
        {
          stage: "source-validation",
          profileId: qualificationSource
            ? "source-validation-qualification"
            : "source-validation",
          stageInputs: {
            CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
            CERTIFICATION_SOURCE_VALIDATION_CHECK_ID:
              "source-validation-dispatch",
            ...(qualificationSource
              ? Object.fromEntries(
                  [
                    ["CERTIFICATION_QUALIFICATION_MODE", "1"],
                    [
                      "CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG",
                      context.environment.CERTIFICATION_SOURCE_VALIDATION_FIXTURE_LOG,
                    ],
                    [
                      "CERTIFICATION_SOURCE_VALIDATION_DIRTY_ID",
                      context.environment.CERTIFICATION_SOURCE_VALIDATION_DIRTY_ID,
                    ],
                    [
                      "CERTIFICATION_SOURCE_VALIDATION_FAIL_ID",
                      context.environment.CERTIFICATION_SOURCE_VALIDATION_FAIL_ID,
                    ],
                  ].filter(([, value]) => value?.trim()),
                )
              : {}),
          },
        },
      );
      const result = sourceValidationStageEvidence({
        repositoryRoot: context.repositoryRoot,
        canonicalRoot: context.canonicalRoot,
        evidenceRoot: context.evidenceRoot,
        state: boundState,
        environment: sourceEnvironment,
        onCheckCompleted: (check) => {
          sourceConsumed ||= check.substantive;
        },
        worktreeIdentity: sourceWorktree.portable,
        dependencyBindingStateSha256: certificationStateSha256(boundState),
        dependencyRevalidate: (boundary) => {
          if (boundary === "post-check") {
            runQualificationDependencyTestHook(
              { ...context, state: boundState },
              testHooks?.beforePostCheckDependencyRevalidation,
              { repositoryRoot: sourceWorktree.root, state: boundState },
            );
          }
          return dependencyRevalidationRecord({
            context,
            state: boundState,
            role: "source-validation",
            boundary,
          });
        },
      });
      if (!result.passed) {
        const failed = result.evidence.checks.at(-1);
        throw new StageFailure(
          `source-validation required check failed: ${result.failedCheckId}`,
          "SOURCE_CONTRACT_FAILURE",
          result.evidence.checks.some((check) => check.substantive),
          {
            exitCode:
              failed?.process?.exitCode === 0
                ? 1
                : (failed?.process?.exitCode ?? 1),
            signal: failed?.process?.signal ?? null,
            result: {
              failedCheckId: result.failedCheckId,
              sourceValidationEvidenceSha256: result.descriptor.sha256,
            },
            evidenceFiles: { "source-validation": result.descriptor },
          },
        );
      }
      const validation = validateSourceValidationEvidence({
        evidence: result.evidence,
        evidenceRoot: context.evidenceRoot,
        state: boundState,
        repositoryRoot: context.repositoryRoot,
        databaseUrl: sourceEnvironment.DATABASE_URL,
      });
      if (!validation.valid) {
        throw new StageFailure(
          `source-validation aggregate failed before stage completion: ${validation.issues.join("; ")}`,
          "SOURCE_CONTRACT_FAILURE",
          result.evidence.checks.some((check) => check.substantive),
          {
            result: {
              issues: validation.issues,
              sourceValidationEvidenceSha256: result.descriptor.sha256,
            },
            evidenceFiles: { "source-validation": result.descriptor },
          },
        );
      }
      return {
        consumed: result.evidence.checks.some((check) => check.substantive),
        outputHashes: { sourceValidation: result.descriptor.sha256 },
        evidenceFiles: { "source-validation": result.descriptor },
        result: {
          valid: true,
          checkCount: result.evidence.checks.length,
          sourceValidationEvidenceSha256: result.descriptor.sha256,
        },
      };
    },
    {
      consumptionProbe: () => sourceConsumed,
      postBoundaryClassification: "SOURCE_CONTRACT_FAILURE",
    },
  );
}

function failedBuildProcess(child) {
  return {
    exitCode: child.signal ? null : normalizedChildExitCode(child.status),
    signal: child.signal ?? null,
    spawnErrorClassification: child.error ? "child-spawn-error" : null,
  };
}

function buildGeneratedOutputPresentNoFollow(repositoryRoot) {
  try {
    lstatSync(
      path.join(
        repositoryRoot,
        NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH,
      ),
    );
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function sealFailedBuildGeneratedOutput({
  context,
  state,
  preflight,
  preparedRunNonce,
  classification,
  consumed,
  child,
}) {
  if (!buildGeneratedOutputPresentNoFollow(context.repositoryRoot)) {
    return {};
  }
  const generatedOutputLifecycle =
    finalizeCertificationFailedBuildGeneratedOutput({
      repositoryRoot: context.repositoryRoot,
      preflight,
      identity: {
        certificationId: state.certificationId,
        candidateId: state.candidate.id,
        commitSha: state.candidate.commitSha,
        treeSha: state.candidate.treeSha,
        stage: "build",
        attempt: state.stages.build.attempts.at(-1).number,
        classification,
        consumedSubstantiveGate: consumed,
        semanticJournalNonce: preparedRunNonce,
      },
    });
  const descriptor = writeEvidence(
    context.evidenceRoot,
    "build/failed-result.json",
    {
      schema: "interior-ai.production-certification-failed-build-result.v1",
      identity: structuredClone(generatedOutputLifecycle.identity),
      generatedOutputLifecycle,
      process: failedBuildProcess(child),
      complete: true,
    },
  );
  return { build: descriptor };
}

function postDispatchBuildFailure({
  context,
  state,
  preflight,
  preparedRunNonce,
  classification,
  message,
  child,
}) {
  let evidenceFiles;
  try {
    evidenceFiles = sealFailedBuildGeneratedOutput({
      context,
      state,
      preflight,
      preparedRunNonce,
      classification,
      consumed: true,
      child,
    });
  } catch (error) {
    return new StageFailure(
      `strict failed build generated-output lifecycle failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      classification,
      true,
    );
  }
  return new StageFailure(message, classification, true, { evidenceFiles });
}

export async function runBuildStage({
  repositoryRoot = process.cwd(),
  environment = process.env,
  testHooks = null,
} = {}) {
  let context = stateContext(repositoryRoot, environment, {
    command: "build",
    role: "final-artifact",
  });
  context = await bindDatabaseForStage(context, "build");
  let buildConsumed = false;
  return managedStage(context, "build", async (state) => {
    const buildEnvironment = stageChildEnvironment(context, {
      stage: "build",
      stageInputs: {
        CERTIFICATION_ENVIRONMENT_STAGE: "build",
        PRODUCTION_EVIDENCE_CANDIDATE_ID: state.candidate.id,
      },
    });
    let preparedRunNonce =
      state.worktrees.roles["final-artifact"].dependencyStatus === "installed"
        ? readJson(
            path.join(context.repositoryRoot, DEFAULT_JOURNAL),
            "prepared production semantic journal",
          ).runNonce
        : null;
    const boundState = installAndBindRoleDependencies({
      context,
      state,
      role: "final-artifact",
      beforeFinalDependencyMeasurement:
        testHooks?.beforeFinalDependencyMeasurement,
      dispatch: () => {
        const prepared = childResult(
          process.execPath,
          [
            "scripts/production-artifact-evidence.mjs",
            "prepare-certification-build",
          ],
          {
            cwd: context.repositoryRoot,
            env: buildEnvironment,
          },
        );
        if (!prepared.error && !prepared.signal && prepared.status === 0) {
          const output = parseLastJson(
            prepared.stdout,
            "prepared production dependency installation",
          );
          preparedRunNonce = output.runNonce;
          return {
            ...prepared,
            installationEvent: output.dependencyInstall,
            installationAttempted: true,
          };
        }
        let installationEvent = null;
        try {
          installationEvent = readJson(
            path.join(context.repositoryRoot, DEFAULT_JOURNAL),
            "prepared production semantic journal",
          ).events?.dependencyInstall;
        } catch {
          // A wrapper precondition can fail before npm installation begins.
        }
        const installationAttempted = Boolean(
          installationEvent?.startedAt &&
            installationEvent?.status !== "pending",
        );
        return {
          ...prepared,
          ...(installationAttempted ? { installationEvent } : {}),
          installationAttempted,
        };
      },
    });
    runQualificationDependencyTestHook(
      { ...context, state: boundState },
      testHooks?.afterDependencyBinding,
      { repositoryRoot: context.repositoryRoot, state: boundState },
    );
    if (!preparedRunNonce) {
      throw new StageFailure(
        "production build dependency preparation did not retain its run nonce",
        "SOURCE_CONTRACT_FAILURE",
        false,
      );
    }
    let generatedOutputPreflight;
    try {
      generatedOutputPreflight = preflightCertificationBuildGeneratedOutput({
        repositoryRoot: context.repositoryRoot,
      });
    } catch (error) {
      throw new StageFailure(
        `strict build generated-output preflight failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
      );
    }
    const child = childResult(
      process.execPath,
      [
        "scripts/production-artifact-evidence.mjs",
        "complete-certification-build",
        preparedRunNonce,
      ],
      {
        cwd: context.repositoryRoot,
        env: buildEnvironment,
        inherit: testHooks?.suppressBuildChildOutput !== true,
      },
    );
    if (child.status !== 0 || child.signal || child.error) {
      let consumed = false;
      try {
        const journal = readJson(
          path.join(context.repositoryRoot, DEFAULT_JOURNAL),
          "semantic journal v2",
        );
        consumed = Boolean(journal.events?.build?.startedAt);
      } catch {
        // A failure before journal/build dispatch is a correctable precondition.
      }
      const failureClassification =
        child.error || child.signal
          ? "INFRASTRUCTURE_TRANSIENT"
          : consumed
            ? "BUILD_FAILURE"
            : "PRECONDITION_ORCHESTRATION_FAILURE";
      let failureEvidenceFiles;
      try {
        failureEvidenceFiles = sealFailedBuildGeneratedOutput({
          context,
          state: boundState,
          preflight: generatedOutputPreflight,
          preparedRunNonce,
          classification: failureClassification,
          consumed,
          child,
        });
      } catch (error) {
        throw new StageFailure(
          `strict failed build generated-output lifecycle failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          failureClassification,
          consumed,
          failedBuildProcess(child),
        );
      }
      if (child.error || child.signal) {
        throw new StageFailure(
          "strict production build infrastructure failed",
          "INFRASTRUCTURE_TRANSIENT",
          consumed,
          {
            exitCode: child.signal
              ? null
              : CHILD_SPAWN_ERROR_EXIT_CODE,
            signal: child.signal ?? null,
            spawnErrorClassification: child.error
              ? "child-spawn-error"
              : null,
            evidenceFiles: failureEvidenceFiles,
          },
        );
      }
      throw new StageFailure(
        "strict production build failed",
        consumed ? "BUILD_FAILURE" : "PRECONDITION_ORCHESTRATION_FAILURE",
        consumed,
        {
          exitCode: normalizedChildExitCode(child.status),
          evidenceFiles: failureEvidenceFiles,
        },
      );
    }
    buildConsumed = true;
    try {
      testHooks?.afterBuildChild?.({
        repositoryRoot: context.repositoryRoot,
        child: failedBuildProcess(child),
      });
    } catch (error) {
      throw postDispatchBuildFailure({
        context,
        state: boundState,
        preflight: generatedOutputPreflight,
        preparedRunNonce,
        classification: "BUILD_FAILURE",
        message: error instanceof Error ? error.message : String(error),
        child,
      });
    }
    let validation;
    try {
      validation = await validateProductionEvidence({
        repositoryRoot: context.repositoryRoot,
        manifestPath: DEFAULT_MANIFEST,
        verificationMode:
          PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
        environment: buildEnvironment,
      });
    } catch (error) {
      throw postDispatchBuildFailure({
        context,
        state: boundState,
        preflight: generatedOutputPreflight,
        preparedRunNonce,
        classification: "BUILD_FAILURE",
        message: error instanceof Error ? error.message : String(error),
        child,
      });
    }
    if (!validation.valid) {
      throw postDispatchBuildFailure({
        context,
        state: boundState,
        preflight: generatedOutputPreflight,
        preparedRunNonce,
        classification: "BUILD_FAILURE",
        message: validation.issues.join("; "),
        child,
      });
    }
    const manifestPath = path.join(context.repositoryRoot, DEFAULT_MANIFEST);
    const journalPath = path.join(context.repositoryRoot, DEFAULT_JOURNAL);
    let journal;
    let bindingUpdates;
    let handoffIssues;
    try {
      journal = readJson(journalPath, "semantic journal v2");
      handoffIssues = certificationPreparedBuildJournalIssues(journal);
      bindingUpdates = {
        semanticJournalNonce: journal.runNonce,
        nextBuildId: validation.manifest.build.nextBuildId,
        artifactSha256: validation.manifest.artifact.sha256,
        productionManifestSha256: sha256Bytes(readFileSync(manifestPath)),
        semanticJournalSha256: sha256Bytes(readFileSync(journalPath)),
      };
    } catch (error) {
      throw postDispatchBuildFailure({
        context,
        state: boundState,
        preflight: generatedOutputPreflight,
        preparedRunNonce,
        classification: "FINAL_EVIDENCE_FAILURE",
        message: error instanceof Error ? error.message : String(error),
        child,
      });
    }
    if (handoffIssues.length > 0) {
      throw postDispatchBuildFailure({
        context,
        state: boundState,
        preflight: generatedOutputPreflight,
        preparedRunNonce,
        classification: "FINAL_EVIDENCE_FAILURE",
        message: handoffIssues.join("; "),
        child,
      });
    }
    let generatedOutputLifecycle;
    try {
      generatedOutputLifecycle = finalizeCertificationBuildGeneratedOutput({
        repositoryRoot: context.repositoryRoot,
        preflight: generatedOutputPreflight,
        identity: {
          certificationId: boundState.certificationId,
          candidateId: boundState.candidate.id,
          commitSha: boundState.candidate.commitSha,
          treeSha: boundState.candidate.treeSha,
          nextBuildId: bindingUpdates.nextBuildId,
          artifactSha256: bindingUpdates.artifactSha256,
          productionManifestSha256:
            bindingUpdates.productionManifestSha256,
          semanticJournalSha256: bindingUpdates.semanticJournalSha256,
          semanticJournalNonce: bindingUpdates.semanticJournalNonce,
        },
      });
    } catch (error) {
      throw new StageFailure(
        `strict build generated-output lifecycle failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "ARTIFACT_CONTINUITY_FAILURE",
        true,
      );
    }
    runQualificationDependencyTestHook(
      { ...context, state: boundState },
      testHooks?.beforePostBuildDependencyRevalidation,
      { repositoryRoot: context.repositoryRoot, state: boundState },
    );
    let postBuildDependencyRevalidation;
    try {
      postBuildDependencyRevalidation = dependencyRevalidationRecord({
        context,
        state: boundState,
        role: "final-artifact",
        boundary: "post-build",
      });
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "FINAL_EVIDENCE_FAILURE",
        true,
      );
    }
    const descriptor = writeEvidence(context.evidenceRoot, "build/result.json", {
      schema: "interior-ai.production-certification-build-result.v1",
      identity: { ...boundState.candidate, ...bindingUpdates },
      dependencyLifecycle: {
        status: "installed",
        bindingEvidence:
          boundState.worktrees.roles["final-artifact"]
            .dependencyBindingEvidence,
        semanticProcessHandoff: structuredClone(
          journal.owner.processHandoffs[0],
        ),
        postBuildRevalidation: postBuildDependencyRevalidation,
      },
      generatedOutputLifecycle,
      complete: true,
    });
    const snapshot = captureArtifactSnapshot({
      repositoryRoot: context.repositoryRoot,
      evidenceRoot: context.evidenceRoot,
      state: boundState,
      position: "immediateBuild",
      bindingOverrides: bindingUpdates,
    });
    return {
      consumed: true,
      outputHashes: {
        build: descriptor.sha256,
        artifact: bindingUpdates.artifactSha256,
      },
      bindingUpdates,
      evidenceFiles: {
        build: descriptor,
        [snapshotEvidenceName("immediateBuild")]: snapshot.snapshotDescriptor,
        [rootEvidenceName("immediateBuild")]: snapshot.rootDescriptor,
      },
      result: bindingUpdates,
    };
  }, {
    consumptionProbe: () => buildConsumed,
    postBoundaryClassification: "BUILD_FAILURE",
  });
}

export function archiveEnvironmentProjection(context, stage) {
  return projectCertificationChildEnvironment({
    repositoryRoot: context.repositoryRoot,
    baseEnvironment: context.environment,
    stage,
    profileId: stage,
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: stage,
      ...(context.environment.CERTIFICATION_QUALIFICATION_MODE
        ? {
            CERTIFICATION_QUALIFICATION_MODE:
              context.environment.CERTIFICATION_QUALIFICATION_MODE,
          }
        : {}),
      CERTIFICATION_EVIDENCE_ROOT: context.evidenceRoot,
      PRODUCTION_ARCHIVE_SOURCE_ROOT: context.repositoryRoot,
      PRODUCTION_ARCHIVE_PLAN: path.join(context.evidenceRoot, "archive/plan.json"),
      PRODUCTION_ARCHIVE_STAGE_ROOT: path.join(
        context.evidenceRoot,
        "archive/stage",
      ),
      PRODUCTION_ARCHIVE_PATH: path.join(
        context.evidenceRoot,
        "archive/candidate.tar.gz",
      ),
      PRODUCTION_ARCHIVE_EXTRACTION_ROOT: path.join(
        context.evidenceRoot,
        "archive/extracted",
      ),
      PRODUCTION_EVIDENCE_EXPECTED_CANDIDATE_ID: context.state.candidate.id,
      PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: context.state.candidate.commitSha,
      PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: context.state.candidate.treeSha,
      PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: context.state.bindings.nextBuildId,
      PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256:
        context.state.bindings.artifactSha256,
    },
  });
}

function archiveAttemptDirectory(context, stage) {
  const attemptNumber = context.state.stages[stage].attempts.length + 1;
  return `archive/attempt-${String(attemptNumber).padStart(3, "0")}`;
}

function writeArchivePlanStream(context, relativePath, contents) {
  const filePath = absentEvidenceTarget(context.evidenceRoot, relativePath);
  writeFileSync(filePath, contents, { flag: "wx", mode: 0o600 });
  const expected = archivePlanStreamDescriptor(relativePath, contents);
  const retained = retainedDescriptor(context.evidenceRoot, filePath);
  if (retained.sha256 !== expected.sha256) {
    throw new Error("archive planner stream changed while retaining evidence");
  }
  return expected;
}

function archivePlanFailureMessage(evidence) {
  const failure = evidence.failure;
  return [
    "archive plan failed",
    failure.code,
    failure.policyReason,
    failure.rejectedRelativePath,
  ].filter(Boolean).join(": ");
}

export function retainArchivePlanChild(context, stage, child, projection) {
  const attemptDirectory = archiveAttemptDirectory(context, stage);
  const redaction = {
    privatePaths: [
      context.canonicalRoot,
      context.repositoryRoot,
      context.evidenceRoot,
      process.execPath,
    ],
    environment: projection.environment,
  };
  const stdout = redactArchivePlanStream(child.stdout, redaction);
  const stderr = redactArchivePlanStream(child.stderr, redaction);
  const stdoutDescriptor = writeArchivePlanStream(
    context,
    `${attemptDirectory}/plan-stdout.log`,
    stdout,
  );
  const stderrDescriptor = writeArchivePlanStream(
    context,
    `${attemptDirectory}/plan-stderr.log`,
    stderr,
  );
  const evidence = createArchivePlanChildEvidence({
    child,
    stderr,
    stdoutDescriptor,
    stderrDescriptor,
    environmentProfileMetadata: projection.metadata,
    workingDirectory: {
      classification: "exact-candidate-root",
      commitSha: context.state.candidate.commitSha,
      treeSha: context.state.candidate.treeSha,
    },
  });
  const descriptor = writeEvidence(
    context.evidenceRoot,
    `${attemptDirectory}/plan-result.json`,
    evidence,
  );
  return { evidence, descriptor };
}

export function archivePlanStageFailure(child, retained) {
  const infrastructureFailure = Boolean(child.error || child.signal);
  const message = archivePlanFailureMessage(retained.evidence);
  return new StageFailure(
    message,
    infrastructureFailure ? "INFRASTRUCTURE_TRANSIENT" : "ARCHIVE_FAILURE",
    false,
    {
      exitCode: child.signal
        ? null
        : child.error
          ? CHILD_SPAWN_ERROR_EXIT_CODE
          : normalizedChildExitCode(
              retained.evidence.process.exitStatus ?? 1,
            ),
      signal: child.signal ?? null,
      result: {
        valid: false,
        classification: infrastructureFailure
          ? "INFRASTRUCTURE_TRANSIENT"
          : "ARCHIVE_FAILURE",
        consumedSubstantiveGate: false,
        issues: [message],
        archivePlanEvidence: retained.descriptor,
      },
      evidenceFiles: { "archive-plan": retained.descriptor },
      spawnErrorClassification: child.error ? "child-spawn-error" : null,
    },
  );
}

function runArchiveCli(
  context,
  command,
  { stage, consumed = false, onConsumed = () => {} } = {},
) {
  const projection = archiveEnvironmentProjection(context, stage);
  const child = childResult(
    process.execPath,
    ["scripts/production-archive.mjs", command],
    { cwd: context.repositoryRoot, env: projection.environment },
  );
  if (command === "plan") {
    const retained = retainArchivePlanChild(context, stage, child, projection);
    if (retained.evidence.completionMarker.result === "failed") {
      throw archivePlanStageFailure(child, retained);
    }
  }
  assertCertificationChildPassed(
    child,
    `archive ${command} failed`,
    "ARCHIVE_FAILURE",
    consumed,
  );
  return parseCertificationChildJson(child.stdout, `archive ${command}`, {
    consumed,
    onConsumed,
  });
}

export function parseCertificationChildJson(
  stdout,
  description,
  { consumed = false, onConsumed = () => {} } = {},
) {
  if (consumed) onConsumed();
  return parseLastJson(stdout, description);
}

export async function runArchivePreflightStage(options = {}) {
  const context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "archive-preflight", role: "final-artifact" });
  let archivePreflightConsumed = false;
  return managedStage(context, "archive-preflight", async (state) => {
    const archiveRoot = safeEvidenceDirectory(context.evidenceRoot, "archive");
    const plan = runArchiveCli(context, "plan", { stage: "archive-preflight" });
    const verification = runArchiveCli(context, "verify", {
      stage: "archive-preflight",
      consumed: true,
      onConsumed: () => {
        archivePreflightConsumed = true;
      },
    });
    if (verification.preflightPassed !== true) {
      throw new StageFailure("archive preflight did not pass", "ARCHIVE_FAILURE", true);
    }
    const planPath = path.join(archiveRoot, "plan.json");
    const stagedReceipt = path.join(
      archiveRoot,
      "stage/.certification/archive-preflight.json",
    );
    const planValue = readJson(planPath, "archive plan");
    const planDescriptor = retainedDescriptor(context.evidenceRoot, planPath);
    const receiptDescriptor = retainedDescriptor(context.evidenceRoot, stagedReceipt);
    const snapshot = captureArtifactSnapshot({
      repositoryRoot: context.repositoryRoot,
      evidenceRoot: context.evidenceRoot,
      state,
      position: "stagedArchive",
    });
    return {
      consumed: true,
      outputHashes: { plan: planDescriptor.sha256, preflight: receiptDescriptor.sha256 },
      bindingUpdates: {
        verifierSourceClosureSha256: planValue.verifierClosure.closureSha256,
      },
      evidenceFiles: {
        "archive-plan": planDescriptor,
        "archive-preflight": receiptDescriptor,
        [snapshotEvidenceName("stagedArchive")]: snapshot.snapshotDescriptor,
        [rootEvidenceName("stagedArchive")]: snapshot.rootDescriptor,
      },
      result: { ...plan, ...verification },
    };
  }, {
    consumptionProbe: () => archivePreflightConsumed,
    postBoundaryClassification: "ARCHIVE_FAILURE",
  });
}

export async function runArchiveStage(options = {}) {
  const context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "archive", role: "final-artifact" });
  let archiveConsumed = false;
  return managedStage(context, "archive", async (state) => {
    const result = runArchiveCli(context, "create", {
      stage: "archive",
      consumed: true,
      onConsumed: () => {
        archiveConsumed = true;
      },
    });
    const archive = retainedDescriptor(
      context.evidenceRoot,
      path.join(context.evidenceRoot, "archive/candidate.tar.gz"),
    );
    const inventory = retainedDescriptor(
      context.evidenceRoot,
      path.join(context.evidenceRoot, "archive/stage/.certification/archive-inventory.json"),
    );
    const inventoryValue = readJson(
      path.join(
        context.evidenceRoot,
        "archive/stage/.certification/archive-inventory.json",
      ),
      "archive inventory",
    );
    const inventoryIssues = productionArchiveInventoryIssues(inventoryValue);
    if (archive.sha256 !== result.archiveSha256) {
      throw new StageFailure(
        "archive CLI digest does not match retained compressed bytes",
        "ARCHIVE_FAILURE",
        true,
      );
    }
    if (
      inventoryIssues.length > 0 ||
      inventoryValue.inventorySha256 !== result.inventorySha256
    ) {
      throw new StageFailure(
        `archive inventory binding is invalid${
          inventoryIssues.length > 0 ? `: ${inventoryIssues.join("; ")}` : ""
        }`,
        "ARCHIVE_FAILURE",
        true,
      );
    }
    const snapshot = captureArtifactSnapshot({
      repositoryRoot: context.repositoryRoot,
      evidenceRoot: context.evidenceRoot,
      state,
      position: "compressedArchive",
      bindingOverrides: {
        archiveSha256: result.archiveSha256,
        archiveInventorySha256: result.inventorySha256,
      },
    });
    return {
      consumed: true,
      outputHashes: { archive: archive.sha256, inventory: inventory.sha256 },
      bindingUpdates: {
        archiveSha256: result.archiveSha256,
        archiveInventorySha256: result.inventorySha256,
      },
      evidenceFiles: {
        archive,
        "archive-inventory": inventory,
        [snapshotEvidenceName("compressedArchive")]: snapshot.snapshotDescriptor,
        [rootEvidenceName("compressedArchive")]: snapshot.rootDescriptor,
      },
      result,
    };
  }, {
    consumptionProbe: () => archiveConsumed,
    postBoundaryClassification: "ARCHIVE_FAILURE",
  });
}

export async function runExtractedArchivePreflightStage(options = {}) {
  const context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "extracted-archive-preflight", role: "final-artifact" });
  let extractionConsumed = false;
  return managedStage(context, "extracted-archive-preflight", async (state) => {
    const result = runArchiveCli(context, "extract-and-verify", {
      stage: "extracted-archive-preflight",
      consumed: true,
      onConsumed: () => {
        extractionConsumed = true;
      },
    });
    if (result.preflightPassed !== true) {
      throw new StageFailure("extracted archive preflight did not pass", "ARCHIVE_FAILURE", true);
    }
    if (result.inventorySha256 !== context.state.bindings.archiveInventorySha256) {
      throw new StageFailure(
        "extracted archive inventory does not match its state binding",
        "ARCHIVE_FAILURE",
        true,
      );
    }
    const receipt = retainedDescriptor(
      context.evidenceRoot,
      path.join(
        context.evidenceRoot,
        "archive/extracted/.certification/archive-preflight.json",
      ),
    );
    const snapshot = captureArtifactSnapshot({
      repositoryRoot: context.repositoryRoot,
      evidenceRoot: context.evidenceRoot,
      state,
      position: "extractedArchive",
    });
    return {
      consumed: true,
      outputHashes: { extractedPreflight: receipt.sha256 },
      evidenceFiles: {
        "extracted-archive-preflight": receipt,
        [snapshotEvidenceName("extractedArchive")]: snapshot.snapshotDescriptor,
        [rootEvidenceName("extractedArchive")]: snapshot.rootDescriptor,
      },
      result,
    };
  }, {
    consumptionProbe: () => extractionConsumed,
    postBoundaryClassification: "ARCHIVE_FAILURE",
  });
}

function exactPhase8Run(evidenceRoot, before) {
  const rawRoot = path.join(evidenceRoot, "phase8");
  const after = existsSync(rawRoot) ? readdirSync(rawRoot).sort() : [];
  const added = after.filter((entry) => !before.has(entry));
  if (added.length !== 1) throw new Error("Phase 8 produced an ambiguous run inventory");
  return path.join(rawRoot, added[0]);
}

function phase8SamplingStarted(evidenceRoot, before) {
  const rawRoot = path.join(evidenceRoot, "phase8");
  if (!existsSync(rawRoot)) return false;
  return readdirSync(rawRoot).some(
    (entry) =>
      !before.has(entry) &&
      existsSync(path.join(rawRoot, entry, "sampling-started.json")),
  );
}

export function phase8Projection(context) {
  return stageChildProjection(context, {
    stage: "phase8",
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: "phase8",
      CERTIFICATION_EVIDENCE_ROOT: context.evidenceRoot,
      PHASE8_EXTERNAL_EVIDENCE_ROOT: context.evidenceRoot,
    },
  });
}

export async function runPhase8Stage(options = {}) {
  let context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "phase8", role: "final-artifact" });
  context = await bindDatabaseForStage(context, "phase8");
  const rawRoot = path.join(context.evidenceRoot, "phase8");
  const before = new Set(existsSync(rawRoot) ? readdirSync(rawRoot) : []);
  let childCompleted = false;
  return managedStage(context, "phase8", async (state) => {
    let outputPath;
    try {
      outputPath = requiredEnvironment(
        context.environment,
        "CERTIFICATION_PHASE8_EVIDENCE_PATH",
      );
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
      );
    }
    try {
      resolvePlaywrightReportPath({
        requestedPath: outputPath,
        repositoryRoot: context.repositoryRoot,
        authorizedExternalRoot: context.evidenceRoot,
      });
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
      );
    }
    const child = childResult("npm", ["run", "test:phase8-performance"], {
      cwd: context.repositoryRoot,
      env: phase8Projection(context).environment,
      inherit: true,
    });
    if (child.status !== 0 || child.signal || child.error) {
      const substantiveStarted = phase8SamplingStarted(context.evidenceRoot, before);
      if (child.error || child.signal) {
        throw new StageFailure(
          "Phase 8 acceptance gate infrastructure failed",
          "INFRASTRUCTURE_TRANSIENT",
          substantiveStarted,
          {
            exitCode: child.signal
              ? null
              : CHILD_SPAWN_ERROR_EXIT_CODE,
            signal: child.signal ?? null,
            spawnErrorClassification: child.error
              ? "child-spawn-error"
              : null,
          },
        );
      }
      throw new StageFailure(
        "Phase 8 acceptance gate failed",
        substantiveStarted
          ? "PERFORMANCE_GATE_FAILURE"
          : "PRECONDITION_ORCHESTRATION_FAILURE",
        substantiveStarted,
        { exitCode: normalizedChildExitCode(child.status) },
      );
    }
    childCompleted = true;
    const runRoot = exactPhase8Run(context.evidenceRoot, before);
    const rawPath = path.join(runRoot, "evidence.json");
    const completionPath = path.join(runRoot, "complete.json");
    const raw = readJson(rawPath, "Phase 8 raw evidence");
    const completion = readJson(completionPath, "Phase 8 completion marker");
    const rawDescriptor = retainedDescriptor(context.evidenceRoot, rawPath);
    const completionDescriptor = retainedDescriptor(
      context.evidenceRoot,
      completionPath,
    );
    if (
      raw.run?.sourceCommitSha !== state.candidate.commitSha ||
      raw.run?.sourceTreeSha !== state.candidate.treeSha ||
      raw.integrity?.childCalculated?.passed !== true ||
      raw.integrity?.parentValidated?.passed !== true ||
      raw.integrity?.finalPassed !== true ||
      completion.reportSha256 !== rawDescriptor.sha256 ||
      JSON.stringify(raw.sourceBindings?.map((entry) => entry.path)) !==
        JSON.stringify(PHASE8_SOURCE_BINDING_PATHS)
    ) {
      throw new StageFailure(
        "Phase 8 raw evidence is incomplete or cross-candidate",
        "PERFORMANCE_GATE_FAILURE",
        true,
      );
    }
    const evidence = {
      schema: PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
      identity: identityFromState(state),
      executionClass: state.executionClass,
      simulation: false,
      rawEvidenceSha256: rawDescriptor.sha256,
      sourceBindings: raw.sourceBindings.map(({ path: sourcePath, sha256 }) => ({
        path: sourcePath,
        sha256,
      })),
      childCalculatedPassed: true,
      parentValidatedPassed: true,
      measurements: raw.measurements,
      budgets: {
        project: "passed",
        bundle: "passed",
        runtime: "passed",
        boundary: "passed",
      },
      contradictions: [],
      complete: true,
    };
    writeFileSync(outputPath, canonicalJsonBytes(evidence), { flag: "wx", mode: 0o600 });
    const descriptor = retainedDescriptor(context.evidenceRoot, outputPath);
    const snapshot = captureArtifactSnapshot({
      repositoryRoot: context.repositoryRoot,
      evidenceRoot: context.evidenceRoot,
      state,
      position: "postPhase8Live",
    });
    return {
      consumed: true,
      outputHashes: {
        phase8: descriptor.sha256,
        raw: rawDescriptor.sha256,
        completion: completionDescriptor.sha256,
      },
      bindingUpdates: { phase8EvidenceSha256: descriptor.sha256 },
      evidenceFiles: {
        phase8: descriptor,
        "phase8-raw": rawDescriptor,
        "phase8-completion": completionDescriptor,
        [snapshotEvidenceName("postPhase8Live")]: snapshot.snapshotDescriptor,
        [rootEvidenceName("postPhase8Live")]: snapshot.rootDescriptor,
      },
      result: {
        evidenceSha256: descriptor.sha256,
        rawSha256: rawDescriptor.sha256,
        completionSha256: completionDescriptor.sha256,
      },
    };
  }, {
    consumptionProbe: () =>
      childCompleted || phase8SamplingStarted(context.evidenceRoot, before),
    postBoundaryClassification: "PERFORMANCE_GATE_FAILURE",
  });
}

export function preflightRuntimeSmokeEvidenceOutputs({
  repositoryRoot,
  evidenceRoot,
  reportPath,
  timingPath,
  summaryPath,
  startMarkerPath,
  additionalRepositoryRoots = [],
}) {
  const destinations = Object.freeze({
    report: resolveRuntimeSmokeEvidencePath({
      requestedPath: reportPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      outputRole: "report",
      additionalRepositoryRoots,
    }),
    timings: resolveRuntimeSmokeEvidencePath({
      requestedPath: timingPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      outputRole: "timings",
      additionalRepositoryRoots,
    }),
    summary: resolveRuntimeSmokeEvidencePath({
      requestedPath: summaryPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      outputRole: "summary",
      additionalRepositoryRoots,
    }),
    startMarker: resolveRuntimeSmokeEvidencePath({
      requestedPath: startMarkerPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      outputRole: "startMarker",
      additionalRepositoryRoots,
    }),
  });
  const outputPaths = Object.values(destinations).map(
    (destination) => destination.outputPath,
  );
  if (new Set(outputPaths).size !== outputPaths.length) {
    throw new Error("runtime-smoke evidence destinations are not unique");
  }
  return destinations;
}

function runtimeIdentityEnvironment(state) {
  return {
    PRODUCTION_CERTIFICATION_ID: state.certificationId,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: state.candidate.id,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: state.candidate.treeSha,
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: state.bindings.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: state.bindings.artifactSha256,
    PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256:
      state.bindings.productionManifestSha256,
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256:
      state.bindings.semanticJournalSha256,
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE:
      state.bindings.semanticJournalNonce,
  };
}

export async function runRuntimeSmokeStage(options = {}) {
  let context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "runtime-smoke", role: "final-artifact" });
  context = await bindDatabaseForStage(context, "runtime-smoke");
  const startMarkerPath = path.join(
    context.evidenceRoot,
    "runtime-smoke/product-test-start.json",
  );
  const startMarkerExisted = existsSync(startMarkerPath);
  let childCompleted = false;
  return managedStage(context, "runtime-smoke", async (state) => {
    let reportPath;
    let timingPath;
    let outputPath;
    try {
      reportPath = requiredEnvironment(
        context.environment,
        "CERTIFICATION_RUNTIME_REPORT_PATH",
      );
      timingPath = requiredEnvironment(
        context.environment,
        "CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH",
      );
      outputPath = requiredEnvironment(
        context.environment,
        "CERTIFICATION_RUNTIME_EVIDENCE_PATH",
      );
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
      );
    }
    safeEvidenceDirectory(context.evidenceRoot, "runtime-smoke");
    let runtimeDestinations;
    try {
      runtimeDestinations = preflightRuntimeSmokeEvidenceOutputs({
        repositoryRoot: context.repositoryRoot,
        evidenceRoot: context.evidenceRoot,
        reportPath,
        timingPath,
        summaryPath: outputPath,
        startMarkerPath,
      });
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
      );
    }
    const runtimeProfile = certificationEnvironmentProfile(
      context.repositoryRoot,
      "runtime-smoke",
    );
    const childProjection = stageChildProjection({ ...context, state }, {
      baseEnvironment: { ...context.environment, CI: "true" },
      stage: "runtime-smoke",
      profileId: "runtime-smoke",
      stageInputs: {
        CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
        CERTIFICATION_RUNTIME_STAGE_ATTEMPT: String(
          state.stages["runtime-smoke"].attempts.at(-1).number,
        ),
        CERTIFICATION_STAGE_ENVIRONMENT_CONTRACT_SHA256:
          runtimeProfile.contract.sha256,
        CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID: runtimeProfile.id,
        CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256: runtimeProfile.sha256,
        ...runtimeIdentityEnvironment(state),
        PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: context.evidenceRoot,
        PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
        PRODUCTION_EVIDENCE_MANIFEST: DEFAULT_MANIFEST,
        PRODUCTION_EVIDENCE_JOURNAL_PATH: DEFAULT_JOURNAL,
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
        RUNTIME_SMOKE_PHASE_TIMINGS_PATH: timingPath,
        CERTIFICATION_RUNTIME_START_MARKER_PATH: startMarkerPath,
      },
    });
    try {
      authorizeRuntimeSmokeReportPath({
        requestedPath: reportPath,
        repositoryRoot: context.repositoryRoot,
        authorizedExternalRoot: context.evidenceRoot,
        environment: childProjection.environment,
      });
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
      );
    }
    const expectedTimingBinding = createRuntimeSmokeTimingEvidenceBinding({
      environment: childProjection.environment,
      destination: runtimeDestinations.timings,
    });
    const child = childResult(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", "tests/e2e/00-runtime-smoke.spec.ts", "--project=chromium"],
      {
        cwd: context.repositoryRoot,
        env: childProjection.environment,
        inherit: true,
      },
    );
    if (child.status !== 0 || child.signal || child.error) {
      const substantiveStarted = existsSync(startMarkerPath);
      const evidenceFiles = {};
      for (const [name, filePath] of [
        ["runtime-report", reportPath],
        ["runtime-phase-timings", timingPath],
        ["runtime-start", startMarkerPath],
      ]) {
        if (!existsSync(filePath)) continue;
        try {
          evidenceFiles[name] = retainedDescriptor(
            context.evidenceRoot,
            filePath,
          );
        } catch {
          // Invalid output cannot become an authoritative evidence reference.
        }
      }
      if (child.error || child.signal) {
        throw new StageFailure(
          "runtime-smoke infrastructure failed",
          "INFRASTRUCTURE_TRANSIENT",
          substantiveStarted,
          {
            exitCode: child.signal
              ? null
              : CHILD_SPAWN_ERROR_EXIT_CODE,
            signal: child.signal ?? null,
            evidenceFiles,
            spawnErrorClassification: child.error
              ? "child-spawn-error"
              : null,
          },
        );
      }
      throw new StageFailure(
        "runtime-smoke product tests failed",
        substantiveStarted
          ? "PRODUCT_ASSERTION_FAILURE"
          : "PRECONDITION_ORCHESTRATION_FAILURE",
        substantiveStarted,
        {
          exitCode: normalizedChildExitCode(child.status),
          evidenceFiles,
        },
      );
    }
    childCompleted = true;
    const rawReportDescriptor = retainedDescriptor(
      context.evidenceRoot,
      reportPath,
    );
    const validation = await recordProductionEvidenceTest({
      repositoryRoot: context.repositoryRoot,
      manifestPath: DEFAULT_MANIFEST,
      reportPath,
      phaseTimingPath: timingPath,
      name: "runtime-smoke",
      command: RUNTIME_COMMAND,
      processExitCode: 0,
      environment: childProjection.environment,
      persistManifest: false,
      expectedRawReportSha256: rawReportDescriptor.sha256,
    });
    const reportDescriptor = retainedDescriptor(context.evidenceRoot, reportPath);
    if (reportDescriptor.sha256 !== rawReportDescriptor.sha256) {
      throw new StageFailure(
        "runtime-smoke raw report changed during portable evidence validation",
        "FINAL_EVIDENCE_FAILURE",
        true,
      );
    }
    const timingDescriptor = retainedDescriptor(context.evidenceRoot, timingPath);
    const startDescriptor = retainedDescriptor(
      context.evidenceRoot,
      startMarkerPath,
    );
    const records = validation.truthfulness.records;
    if (
      validation.phaseTimings?.complete !== true ||
      JSON.stringify(validation.phaseTimings?.evidenceBinding) !==
        JSON.stringify(expectedTimingBinding)
    ) {
      throw new StageFailure(
        "runtime-smoke timing evidence root or identity binding is invalid",
        "FINAL_EVIDENCE_FAILURE",
        true,
      );
    }
    const evidence = {
      schema: PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
      identity: identityFromState(state),
      journalIdentity: {
        schema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
        version: PRODUCTION_EVIDENCE_JOURNAL_VERSION,
        sha256: state.bindings.semanticJournalSha256,
        runNonce: state.bindings.semanticJournalNonce,
      },
      executionClass: state.executionClass,
      simulation: false,
      reportSha256: reportDescriptor.sha256,
      phaseTimingsSha256: timingDescriptor.sha256,
      phaseTimings: {
        sha256: timingDescriptor.sha256,
        complete: validation.phaseTimings.complete,
        completionMarker: validation.phaseTimings.evidenceBinding.completionMarker,
        rootContract: validation.phaseTimings.evidenceBinding.rootContract,
        identity: validation.phaseTimings.evidenceBinding.identity,
      },
      stageEnvironment: {
        profileId: childProjection.metadata.profileId,
        profileSha256: childProjection.metadata.profileSha256,
        contractSchema: childProjection.metadata.contractSchema,
        contractSha256: childProjection.metadata.contractSha256,
        environmentNames: childProjection.metadata.environmentNames,
        environmentNamesSha256: childProjection.metadata.environmentNamesSha256,
        allowedVariableNamesSha256:
          childProjection.metadata.allowedVariableNamesSha256,
        requiredVariableNamesSha256:
          childProjection.metadata.requiredVariableNamesSha256,
      },
      stats: {
        expected: 2,
        passed: records.filter((record) => record.outcome === "passed").length,
        unexpected: validation.truthfulness.stats.unexpected,
        skipped: validation.truthfulness.stats.skipped,
        flaky: validation.truthfulness.stats.flaky,
        retries: records.reduce((total, record) => total + record.retries, 0),
      },
      tests: validation.truthfulness.gate.requiredTests.map((requirement) => {
        const matches = records.filter(
          (record) =>
            record.file === requirement.file && record.title === requirement.title,
        );
        return {
          id: requirement.id,
          outcome: matches.every((record) => record.outcome === "passed")
            ? "passed"
            : "failed",
          retries: matches.reduce((total, record) => total + record.retries, 0),
          skipped: matches.some((record) => record.outcome === "skipped"),
        };
      }),
      telemetryProvenance: validation.telemetryBootstrap.observations.map(
        (observation) => ({
          realm:
            observation.phaseName === "initial-document"
              ? "initial"
              : observation.phaseName,
          activationGeneration:
            observation.telemetry.collectorActivationGeneration,
          valid: observation.valid,
        }),
      ),
      complete: true,
    };
    writeFileSync(outputPath, canonicalJsonBytes(evidence), { flag: "wx", mode: 0o600 });
    const descriptor = retainedDescriptor(context.evidenceRoot, outputPath);
    return {
      consumed: true,
      outputHashes: {
        runtime: descriptor.sha256,
        report: reportDescriptor.sha256,
        timings: timingDescriptor.sha256,
      },
      bindingUpdates: { runtimeSmokeEvidenceSha256: descriptor.sha256 },
      evidenceFiles: {
        "runtime-smoke": descriptor,
        "runtime-report": reportDescriptor,
        "runtime-phase-timings": timingDescriptor,
        "runtime-start": startDescriptor,
      },
      result: {
        evidenceSha256: descriptor.sha256,
        reportSha256: reportDescriptor.sha256,
        timingSha256: timingDescriptor.sha256,
      },
    };
  }, {
    consumptionProbe: () =>
      childCompleted || (!startMarkerExisted && existsSync(startMarkerPath)),
    postBoundaryClassification: "FINAL_EVIDENCE_FAILURE",
  });
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

export function browserEnvironment(
  context,
  state,
  owner,
  reportPath,
  evidencePath,
  startMarkerPath,
  runNonce,
) {
  const baseEnvironment = {
    ...context.environment,
    APP_ENV: owner.applicationEnvironment,
    NEXT_PUBLIC_APP_ENV: owner.applicationEnvironment,
    NODE_ENV: owner.productionServer ? "production" : "development",
    CI: "true",
  };
  delete baseEnvironment.VERCEL_ENV;
  delete baseEnvironment.PLAYWRIGHT_RELEASE_BASE_URL;
  if (owner.id === "public-share") {
    baseEnvironment.CATALOG_STRICT_VALIDATION = "true";
  } else {
    delete baseEnvironment.CATALOG_STRICT_VALIDATION;
  }
  const stageInputs = {
    CERTIFICATION_ENVIRONMENT_STAGE: "browser-owners",
    PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: context.evidenceRoot,
    PRODUCTION_CERTIFICATION_ID: state.certificationId,
    REQUIRED_TEST_REPORT_PATH: reportPath,
    REQUIRED_TEST_EVIDENCE_PATH: evidencePath,
    REQUIRED_TEST_START_MARKER_PATH: startMarkerPath,
    REQUIRED_TEST_ARTIFACT_SHA256: state.bindings.artifactSha256,
    REQUIRED_TEST_BUILD_ID: state.bindings.nextBuildId,
    REQUIRED_TEST_RELEASE_CANDIDATE_ID: state.candidate.id,
    REQUIRED_TEST_HARNESS_VERSION: String(state.harness.version),
    REQUIRED_TEST_HARNESS_SOURCE_SHA256: state.harness.sourceSha256,
    REQUIRED_TEST_GATE_ID: owner.gateId,
    REQUIRED_TEST_BROWSER_OWNER_ID: owner.id,
    REQUIRED_TEST_STAGE_ATTEMPT: String(
      state.stages["browser-owners"].attempts.at(-1).number,
    ),
    REQUIRED_TEST_RUN_NONCE: runNonce,
    REQUIRED_TEST_RELEASE_ENVIRONMENT: owner.applicationEnvironment,
    REQUIRED_TEST_SOURCE_COMMIT_SHA: state.candidate.commitSha,
    REQUIRED_TEST_SOURCE_TREE_SHA: state.candidate.treeSha,
  };
  if (owner.productionServer) {
    stageInputs.PLAYWRIGHT_USE_PRODUCTION_SERVER = "1";
  }
  return stageChildEnvironment({ ...context, state }, {
    stage: "browser-owners",
    profileId: owner.productionServer
      ? "production-browser-owner"
      : "development-browser-owner",
    baseEnvironment,
    stageInputs,
  });
}

function browserListEnvironment(context, owner) {
  const baseEnvironment = {
    ...context.environment,
    APP_ENV: owner.applicationEnvironment,
    NEXT_PUBLIC_APP_ENV: owner.applicationEnvironment,
    NODE_ENV: owner.productionServer ? "production" : "development",
    CI: "true",
  };
  delete baseEnvironment.VERCEL_ENV;
  delete baseEnvironment.PLAYWRIGHT_RELEASE_BASE_URL;
  const stageInputs = {
    CERTIFICATION_ENVIRONMENT_STAGE: "browser-owners",
  };
  if (owner.productionServer) {
    stageInputs.PLAYWRIGHT_USE_PRODUCTION_SERVER = "1";
  }
  if (owner.id === "public-share") {
    baseEnvironment.CATALOG_STRICT_VALIDATION = "true";
  } else {
    delete baseEnvironment.CATALOG_STRICT_VALIDATION;
  }
  return stageChildEnvironment(context, {
    stage: "browser-owners",
    profileId: owner.productionServer
      ? "production-browser-owner-discovery"
      : "development-browser-owner-discovery",
    baseEnvironment,
    stageInputs,
  });
}

function observedBrowserEvidence(owner, state, requiredEvidence, gate) {
  const expectedIdentity = {
    sourceCommitSha: state.candidate.commitSha,
    sourceTreeSha: state.candidate.treeSha,
    artifactSha256: state.bindings.artifactSha256,
    nextBuildId: state.bindings.nextBuildId,
    candidateId: state.candidate.id,
    harnessVersion: String(state.harness.version),
    harnessSourceSha256: state.harness.sourceSha256,
    executionClass: "real-candidate",
  };
  for (const [name, expected] of Object.entries(expectedIdentity)) {
    if (requiredEvidence[name] !== expected) {
      throw new Error(`browser owner ${owner.id} observed mismatched ${name}`);
    }
  }
  const identities = requiredEvidence.report?.testIdentities ?? [];
  const tests = gate.requiredTests.flatMap((requirement) =>
    gate.requiredProjects.map((project) => {
      const matches = identities.filter(
        (record) =>
          record.file === requirement.file &&
          record.title === requirement.title &&
          record.project === project,
      );
      if (matches.length !== 1) {
        throw new Error(`browser owner ${owner.id} observed incomplete test identities`);
      }
      const record = matches[0];
      return {
        id: requirement.id,
        file: record.file,
        title: record.title,
        project: record.project,
        outcome: record.outcome,
        retries: record.retries,
        skipped: record.outcome === "skipped",
      };
    }),
  );
  return {
    schema: PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA,
    ownerId: owner.id,
    gateId: owner.gateId,
    identity: identityFromState(state),
    executionClass: state.executionClass,
    simulation: false,
    reportSha256: requiredEvidence.report.sha256,
    stats: {
      passed: tests.filter((test) => test.outcome === "passed").length,
      unexpected: tests.filter((test) => test.outcome === "failed").length,
      skipped: tests.filter((test) => test.skipped).length,
      flaky: tests.filter((test) => test.outcome === "flaky").length,
      retries: tests.reduce((total, test) => total + test.retries, 0),
    },
    tests,
    complete: requiredEvidence.complete === true && requiredEvidence.result === "passed",
  };
}

export function executeDevelopmentBrowserOwnerChild({
  repositoryRoot,
  candidate,
  certificationId,
  ownerId,
  stageAttempt,
  dependencyBinding,
  executeChild,
}) {
  if (typeof executeChild !== "function") {
    throw new Error("development browser owner requires an exact child executor");
  }
  const lifecycle = beginBrowserServerTrackedOutputLifecycle({
    repositoryRoot,
    candidate,
    certificationId,
    ownerId,
    stageAttempt,
    dependencyBinding,
  });
  let child;
  try {
    child = executeChild();
  } catch (error) {
    child = {
      status: null,
      signal: null,
      error:
        error instanceof Error
          ? error
          : new Error("browser owner child dispatch threw"),
    };
  }
  let lifecycleEvidence;
  let lifecycleFailure = null;
  try {
    lifecycleEvidence = completeBrowserServerTrackedOutputLifecycle(lifecycle, {
      processExitCode: Number.isSafeInteger(child?.status) ? child.status : null,
      signal: child?.signal ?? null,
      dispatchError: Boolean(child?.error),
    });
  } catch (error) {
    lifecycleFailure = error;
    lifecycleEvidence = error?.safeEvidence;
  }
  return { child, lifecycleEvidence, lifecycleFailure };
}

export function developmentBrowserOwnerStageFailure({
  ownerId,
  lifecycleResult,
  ownerStarted,
  consumed,
  evidenceFiles = {},
  lifecyclePublicationFailure = null,
}) {
  const { child, lifecycleFailure } = lifecycleResult;
  const lifecycleFinalizationFailure =
    lifecycleFailure ?? lifecyclePublicationFailure;
  const ownerConsumed = consumed || ownerStarted;
  let failure = null;
  if (child.error || child.signal) {
    failure = new StageFailure(
      `required browser owner infrastructure failed: ${ownerId}`,
      "INFRASTRUCTURE_TRANSIENT",
      ownerConsumed,
      {
        exitCode: child.signal ? null : CHILD_SPAWN_ERROR_EXIT_CODE,
        signal: child.signal ?? null,
        spawnErrorClassification: child.error ? "child-spawn-error" : null,
        evidenceFiles,
      },
    );
  } else if (child.status !== 0) {
    failure = new StageFailure(
      `required browser owner failed: ${ownerId}`,
      ownerStarted
        ? "PRODUCT_ASSERTION_FAILURE"
        : "PRECONDITION_ORCHESTRATION_FAILURE",
      ownerConsumed,
      {
        exitCode: normalizedChildExitCode(child.status),
        evidenceFiles,
      },
    );
  } else if (lifecycleFinalizationFailure) {
    failure = new StageFailure(
      `browser server generated-output lifecycle failed: ${ownerId}`,
      "ARTIFACT_CONTINUITY_FAILURE",
      ownerConsumed,
      { evidenceFiles },
    );
  }
  if (failure && lifecycleFinalizationFailure) {
    failure.cleanupFailure = Object.freeze({
      code:
        lifecycleFinalizationFailure.code ??
        "BROWSER_SERVER_GENERATED_OUTPUT_REJECTED",
      message:
        lifecycleFinalizationFailure instanceof Error
          ? lifecycleFinalizationFailure.message
          : String(lifecycleFinalizationFailure),
    });
  }
  return failure;
}

export async function runBrowserOwnersStage(options = {}) {
  let context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "browser-owners" });
  context = await bindDatabaseForStage(context, "browser-owners");
  const preexistingStartMarkers = new Set(
    REQUIRED_BROWSER_OWNERS.map((owner) =>
      path.join(
        context.evidenceRoot,
        "browser-owners",
        owner.id,
        "discovery-start.json",
      ),
    ).filter((markerPath) => existsSync(markerPath)),
  );
  let consumed = false;
  return managedStage(context, "browser-owners", async (state) => {
    const pristineDevelopmentBrowserRoot = resolveCertificationStageWorktree({
      state,
      evidenceRoot: context.evidenceRoot,
      canonicalRoot: context.canonicalRoot,
      role: "development-browser",
      phase: "pristine",
    }).root;
    const developmentContext = {
      ...context,
      repositoryRoot: pristineDevelopmentBrowserRoot,
    };
    const boundState = installAndBindRoleDependencies({
      context: developmentContext,
      state,
      role: "development-browser",
      beforeFinalDependencyMeasurement:
        options.testHooks?.beforeFinalDependencyMeasurement,
    });
    runQualificationDependencyTestHook(
      { ...developmentContext, state: boundState },
      options.testHooks?.afterDependencyBinding,
      {
        repositoryRoot: developmentContext.repositoryRoot,
        state: boundState,
      },
    );
    const finalArtifactRoot = resolveCertificationStageWorktree({
      state: boundState,
      evidenceRoot: context.evidenceRoot,
      canonicalRoot: context.canonicalRoot,
      role: "final-artifact",
      phase: "active",
    }).root;
    const developmentBrowserRoot = resolveCertificationStageWorktree({
      state: boundState,
      evidenceRoot: context.evidenceRoot,
      canonicalRoot: context.canonicalRoot,
      role: "development-browser",
      phase: "active",
    }).root;
    runQualificationDependencyTestHook(
      { ...context, state: boundState },
      options.testHooks?.beforePreOwnerDependencyRevalidation,
      {
        finalArtifactRoot,
        developmentBrowserRoot,
        state: boundState,
      },
    );
    let finalArtifactPreOwnerRevalidation;
    let developmentBrowserPreOwnerRevalidation;
    try {
      finalArtifactPreOwnerRevalidation = dependencyRevalidationRecord({
        context: { ...context, repositoryRoot: finalArtifactRoot },
        state: boundState,
        role: "final-artifact",
        boundary: "pre-browser-owners",
      });
      developmentBrowserPreOwnerRevalidation = dependencyRevalidationRecord({
        context: { ...context, repositoryRoot: developmentBrowserRoot },
        state: boundState,
        role: "development-browser",
        boundary: "pre-browser-owners",
      });
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "FINAL_EVIDENCE_FAILURE",
        false,
      );
    }
    const requiredManifest = readJson(
      path.join(finalArtifactRoot, "scripts/required-test-manifest.json"),
      "required-test manifest",
    );
    const ownerInputs = [];
    const ownerTargets = new Set();
    for (const owner of REQUIRED_BROWSER_OWNERS) {
      const role = stageWorktreeRole("browser-owners", owner.id);
      const ownerRepositoryRoot =
        role === "development-browser" ? developmentBrowserRoot : finalArtifactRoot;
      const ownerContext = { ...context, repositoryRoot: ownerRepositoryRoot };
      const ownerRoot = path.join(context.evidenceRoot, "browser-owners", owner.id);
      safeEvidenceDirectory(
        context.evidenceRoot,
        path.relative(context.evidenceRoot, ownerRoot),
      );
      let reportPath;
      try {
        reportPath = requiredEnvironment(
          context.environment,
          `CERTIFICATION_BROWSER_${owner.id.toUpperCase().replaceAll("-", "_")}_REPORT_PATH`,
        );
      } catch (error) {
        throw new StageFailure(
          error instanceof Error ? error.message : String(error),
          "PRECONDITION_ORCHESTRATION_FAILURE",
          false,
        );
      }
      let report;
      try {
        report = resolveRequiredTestReportPath({
          requestedPath: reportPath,
          repositoryRoot: ownerRepositoryRoot,
          gateId: owner.gateId,
          authorizedExternalRoot: context.evidenceRoot,
        });
      } catch (error) {
        throw new StageFailure(
          error instanceof Error ? error.message : String(error),
          "PRECONDITION_ORCHESTRATION_FAILURE",
          false,
        );
      }
      const evidencePath = path.join(ownerRoot, "required-evidence.json");
      const certificationPath = path.join(ownerRoot, "certification-evidence.json");
      const serverLifecyclePath = owner.productionServer
        ? null
        : absentEvidenceTarget(
            context.evidenceRoot,
            `browser-owners/${owner.id}/server-lifecycle.json`,
          );
      const startMarkerPath = absentEvidenceTarget(
        context.evidenceRoot,
        `browser-owners/${owner.id}/discovery-start.json`,
      );
      for (const target of [
        report.outputPath,
        evidencePath,
        certificationPath,
        startMarkerPath,
        ...(serverLifecyclePath ? [serverLifecyclePath] : []),
      ]) {
        const physicalTarget = path.resolve(target);
        if (ownerTargets.has(physicalTarget)) {
          throw new StageFailure(
            "browser-owner evidence destinations are not unique",
            "PRECONDITION_ORCHESTRATION_FAILURE",
            false,
          );
        }
        ownerTargets.add(physicalTarget);
      }
      if (existsSync(evidencePath) || existsSync(certificationPath)) {
        throw new StageFailure(
          "browser-owner evidence target already exists",
          "PRECONDITION_ORCHESTRATION_FAILURE",
          false,
        );
      }
      const list = childResult(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["playwright", "test", "--config", owner.config, "--list"],
        {
          cwd: ownerRepositoryRoot,
          env: browserListEnvironment(ownerContext, owner),
        },
      );
      assertCertificationChildPassed(
        list,
        `browser owner config preflight failed: ${owner.id}`,
        "PRECONDITION_ORCHESTRATION_FAILURE",
        false,
      );
      ownerInputs.push({
        owner,
        ownerRoot,
        reportPath: report.outputPath,
        evidencePath,
        certificationPath,
        serverLifecyclePath,
        startMarkerPath,
        repositoryRoot: ownerRepositoryRoot,
        context: ownerContext,
        runNonce: randomUUID(),
      });
    }
    const descriptors = {};
    const browserHashes = {};
    for (const input of ownerInputs) {
      const ownerEnvironment = browserEnvironment(
        input.context,
        boundState,
        input.owner,
        input.reportPath,
        input.evidencePath,
        input.startMarkerPath,
        input.runNonce,
      );
      const executeChild = () =>
        childResult(
          "npm",
          ["run", input.owner.packageCommand],
          {
            cwd: input.repositoryRoot,
            env: ownerEnvironment,
            inherit: true,
          },
        );
      const lifecycleResult = input.serverLifecyclePath
        ? executeDevelopmentBrowserOwnerChild({
            repositoryRoot: input.repositoryRoot,
            candidate: boundState.candidate,
            certificationId: boundState.certificationId,
            ownerId: input.owner.id,
            stageAttempt:
              boundState.stages["browser-owners"].attempts.at(-1).number,
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
            executeChild,
          })
        : { child: executeChild(), lifecycleEvidence: null, lifecycleFailure: null };
      const ownerStarted = existsSync(input.startMarkerPath);
      consumed ||= ownerStarted;
      let serverLifecycleDescriptor = null;
      let lifecyclePublicationFailure = null;
      if (input.serverLifecyclePath) {
        const lifecycleEvidence = lifecycleResult.lifecycleEvidence;
        if (!lifecycleEvidence) {
          lifecyclePublicationFailure = new Error(
            `browser server lifecycle produced no safe evidence: ${input.owner.id}`,
          );
        } else {
          try {
            writeFileSync(
              input.serverLifecyclePath,
              canonicalJsonBytes(lifecycleEvidence),
              { flag: "wx", mode: 0o600 },
            );
            serverLifecycleDescriptor = retainedDescriptor(
              context.evidenceRoot,
              input.serverLifecyclePath,
            );
            descriptors[`browser-server-lifecycle:${input.owner.id}`] =
              serverLifecycleDescriptor;
          } catch (error) {
            lifecyclePublicationFailure =
              error instanceof Error
                ? error
                : new Error(
                    `browser server lifecycle evidence publication failed: ${input.owner.id}`,
                  );
          }
        }
      }
      const ownerFailure = developmentBrowserOwnerStageFailure({
        ownerId: input.owner.id,
        lifecycleResult,
        ownerStarted,
        consumed,
        lifecyclePublicationFailure,
        evidenceFiles: serverLifecycleDescriptor
          ? {
              [`browser-server-lifecycle:${input.owner.id}`]:
                serverLifecycleDescriptor,
            }
          : {},
      });
      if (ownerFailure) throw ownerFailure;
      consumed = true;
      let requiredEvidence;
      let certificationEvidence;
      try {
        requiredEvidence = readJson(
          input.evidencePath,
          `required browser evidence ${input.owner.id}`,
        );
        const gate = requiredManifest.gates.find(
          (entry) => entry.id === input.owner.gateId,
        );
        certificationEvidence = observedBrowserEvidence(
          input.owner,
          boundState,
          requiredEvidence,
          gate,
        );
      } catch (error) {
        throw new StageFailure(
          error instanceof Error ? error.message : String(error),
          "FINAL_EVIDENCE_FAILURE",
          true,
        );
      }
      writeFileSync(input.certificationPath, canonicalJsonBytes(certificationEvidence), {
        flag: "wx",
        mode: 0o600,
      });
      const descriptor = retainedDescriptor(
        context.evidenceRoot,
        input.certificationPath,
      );
      const reportDescriptor = retainedDescriptor(context.evidenceRoot, input.reportPath);
      const startDescriptor = retainedDescriptor(
        context.evidenceRoot,
        input.startMarkerPath,
      );
      if (reportDescriptor.sha256 !== certificationEvidence.reportSha256) {
        throw new StageFailure(
          `browser owner raw report hash mismatch: ${input.owner.id}`,
          "FINAL_EVIDENCE_FAILURE",
          true,
        );
      }
      descriptors[`browser:${input.owner.id}`] = descriptor;
      descriptors[`browser-report:${input.owner.id}`] = reportDescriptor;
      descriptors[`browser-start:${input.owner.id}`] = startDescriptor;
      browserHashes[input.owner.id] = descriptor.sha256;
    }
    let developmentBrowserTerminalValidation;
    try {
      developmentBrowserTerminalValidation = resolveCertificationStageWorktree({
        state: boundState,
        evidenceRoot: context.evidenceRoot,
        canonicalRoot: context.canonicalRoot,
        role: "development-browser",
        phase: "active",
      }).portable;
    } catch (error) {
      throw new StageFailure(
        error instanceof Error ? error.message : String(error),
        "ARTIFACT_CONTINUITY_FAILURE",
        true,
      );
    }
    const snapshot = captureArtifactSnapshot({
      repositoryRoot: finalArtifactRoot,
      evidenceRoot: context.evidenceRoot,
      state: boundState,
      position: "postRuntimeBrowserLive",
    });
    const finalArtifactDependencyRevalidation = dependencyRevalidationRecord({
      context: { ...context, repositoryRoot: finalArtifactRoot },
      state: boundState,
      role: "final-artifact",
      boundary: "post-browser-owners",
    });
    const developmentBrowserDependencyRevalidation =
      dependencyRevalidationRecord({
        context: developmentContext,
        state: boundState,
        role: "development-browser",
        boundary: "post-browser-owners",
      });
    return {
      consumed: true,
      outputHashes: browserHashes,
      bindingUpdates: {
        browserOwnerEvidenceSha256: browserHashes,
      },
      evidenceFiles: {
        ...descriptors,
        [snapshotEvidenceName("postRuntimeBrowserLive")]:
          snapshot.snapshotDescriptor,
        [rootEvidenceName("postRuntimeBrowserLive")]: snapshot.rootDescriptor,
      },
      result: {
        ownerCount: REQUIRED_BROWSER_OWNERS.length,
        browserHashes,
        dependencyRevalidation: {
          finalArtifactPreOwners: finalArtifactPreOwnerRevalidation,
          developmentBrowserPreOwners:
            developmentBrowserPreOwnerRevalidation,
          finalArtifact: finalArtifactDependencyRevalidation,
          developmentBrowser: developmentBrowserDependencyRevalidation,
        },
        terminalDevelopmentBrowserWorktree: {
          validated: true,
          candidateCommitSha:
            developmentBrowserTerminalValidation.candidateCommitSha,
          candidateTreeSha:
            developmentBrowserTerminalValidation.candidateTreeSha,
          cleanStateSha256:
            developmentBrowserTerminalValidation.cleanStateSha256,
          ignoredPathInventory:
            developmentBrowserTerminalValidation.ignoredPathInventory,
          dependencyIdentitySha256:
            developmentBrowserTerminalValidation.dependencyIdentitySha256,
        },
      },
    };
  }, {
    consumptionProbe: () =>
      consumed ||
      REQUIRED_BROWSER_OWNERS.some((owner) => {
        const markerPath = path.join(
          context.evidenceRoot,
          "browser-owners",
          owner.id,
          "discovery-start.json",
        );
        return !preexistingStartMarkers.has(markerPath) && existsSync(markerPath);
      }),
    postBoundaryClassification: "FINAL_EVIDENCE_FAILURE",
  });
}

export function assertCanonicalExtractedArchiveRoot(
  evidenceRoot,
  requestedExtractionRoot,
) {
  const physicalEvidenceRoot = realpathSync(evidenceRoot);
  const canonicalExtractionRoot = path.join(
    path.resolve(evidenceRoot),
    "archive/extracted",
  );
  const expectedPhysicalExtractionRoot = path.join(
    physicalEvidenceRoot,
    "archive/extracted",
  );
  const requested = path.resolve(
    requestedExtractionRoot || canonicalExtractionRoot,
  );
  if (requested !== canonicalExtractionRoot) {
    throw new Error("final verification requires the canonical extracted archive");
  }
  const metadata = lstatSync(canonicalExtractionRoot);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("final extracted archive must be a physical directory");
  }
  if (realpathSync(canonicalExtractionRoot) !== expectedPhysicalExtractionRoot) {
    throw new Error("final extracted archive is not the canonical physical directory");
  }
  return canonicalExtractionRoot;
}

export async function runFinalStandaloneStage(options = {}) {
  const context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "final-standalone", role: "final-artifact" });
  if (context.state.executionClass === "real-candidate") {
    requireDatabaseLifecycleBinding(context, ["absence-verified"]);
  }
  return managedStage(context, "final-standalone", async () => {
    const extractionRoot = assertCanonicalExtractedArchiveRoot(
      context.evidenceRoot,
      context.environment.PRODUCTION_ARCHIVE_EXTRACTION_ROOT,
    );
    const child = childResult(
      process.execPath,
      ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
      {
        cwd: extractionRoot,
        env: stageChildEnvironment(context, {
          stage: "final-standalone",
          stageInputs: {
            CERTIFICATION_ENVIRONMENT_STAGE: "final-standalone",
            PRODUCTION_CERTIFICATION_STATE: context.statePath,
            CERTIFICATION_EVIDENCE_ROOT: context.evidenceRoot,
            PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA:
              context.state.candidate.commitSha,
            ...(context.state.executionClass === "deterministic-simulation"
              ? { CERTIFICATION_ALLOW_SIMULATION: "1" }
              : {}),
          },
        }),
      },
    );
    assertCertificationChildPassed(
      child,
      "final standalone verification failed",
      "FINAL_EVIDENCE_FAILURE",
      false,
    );
    const value = parseLastJson(child.stdout, "final standalone verifier");
    if (value.certificationComplete !== true || value.simulationComplete !== false) {
      throw new StageFailure(
        "final standalone verifier did not certify the real candidate",
        "FINAL_EVIDENCE_FAILURE",
        false,
      );
    }
    const descriptor = writeEvidence(
      context.evidenceRoot,
      "final-standalone/evidence.json",
      value,
    );
    return {
      outputHashes: { final: descriptor.sha256 },
      evidenceFiles: { "final-standalone": descriptor },
      result: value,
    };
  });
}

export async function runContinuityStage(options = {}) {
  const context = stateContext(options.repositoryRoot ?? process.cwd(), options.environment ?? process.env, { command: "continuity", role: "final-artifact" });
  return managedStage(context, "continuity", async (state) => {
    const capturedAt =
      state.executionClass === "deterministic-simulation"
        ? new Date(Date.parse(state.stages.continuity.startedAt) + 50).toISOString()
        : new Date().toISOString();
    const measured = measureFinalContinuity({
      repositoryRoot: context.repositoryRoot,
      evidenceRoot: context.evidenceRoot,
      state,
      capturedAt,
    });
    if (measured.issues.length > 0 || !measured.descriptor) {
      throw new StageFailure(
        `artifact continuity physical comparison failed: ${measured.issues.join("; ")}`,
        "ARTIFACT_CONTINUITY_FAILURE",
        false,
        {
          result: measured.evidence,
          evidenceFiles: measured.descriptor
            ? { continuity: measured.descriptor }
            : {},
        },
      );
    }
    return {
      outputHashes: { continuity: measured.descriptor.sha256 },
      bindingUpdates: {
        continuityEvidenceSha256: measured.descriptor.sha256,
      },
      evidenceFiles: { continuity: measured.descriptor },
      result: measured.descriptor,
    };
  });
}
