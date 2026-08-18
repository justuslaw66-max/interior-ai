"use strict";

const { createHash, randomBytes } = module.require("node:crypto");
const {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} = module.require("node:fs");
const path = module.require("node:path");
const { spawnSync } = module.require("node:child_process");

const AUTH_RESULT_SCHEMA = "interior-ai.ci-auth-fixture-command-result.v1";
const AUTH_RESULT_VERSION = 1;
const AUTH_RESULT_COMPLETION_MARKER = "CI_AUTH_FIXTURE_COMMAND_RESULT_COMPLETE";
const AUTH_RESULT_ROOT_ENV = "CI_AUTH_FIXTURE_RESULT_ROOT";
const AUTH_RESULT_PATH_ENV = "CI_AUTH_FIXTURE_RESULT_PATH";
const AUTH_RESULT_NONCE_ENV = "CI_AUTH_FIXTURE_RESULT_NONCE";
const AUTH_RESULT_EXPECTED_COMMAND_ENV = "CI_AUTH_FIXTURE_EXPECTED_COMMAND_ID";
const AUTH_RESULT_EXPECTED_MODE_ENV = "CI_AUTH_FIXTURE_EXPECTED_MODE";
const AUTH_RESULT_COMMAND_STATUS_ENV = "CI_AUTH_FIXTURE_ACTUAL_EXIT_STATUS";
const AUTH_RESULT_CANDIDATE_COMMIT_ENV = "CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA";
const AUTH_RESULT_CANDIDATE_TREE_ENV = "CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA";

const COMMAND_MODES = Object.freeze({
  "export-github-env": Object.freeze({
    commandId: "ci:auth-fixture:export",
    mode: "provider-fixture-export",
  }),
  "validate-env": Object.freeze({
    commandId: "ci:auth-fixture:validate",
    mode: "auth-environment-validation",
  }),
  "production-misuse": Object.freeze({
    commandId: "ci:auth-fixture:production-misuse",
    mode: "production-misuse-validation",
  }),
  preflight: Object.freeze({
    commandId: "ci:auth-fixture:preflight",
    mode: "auth-session-preflight",
  }),
  "preflight-local": Object.freeze({
    commandId: "test:advisory-auth-preflight",
    mode: "auth-session-preflight",
  }),
});

const RESULT_VALUES = new Set(["success", "expected-negative-pass", "failure"]);
const SAFE_ENVIRONMENT_CLASSIFICATIONS = new Set([
  "development",
  "staging",
  "production",
  "invalid",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_SHA_PATTERN = /^[a-f0-9]{40}$/;
const NONCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PROCESS_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const RESOLVED_AUTH_RESULT_DESTINATIONS = new WeakSet();
const AUTH_VALIDATION_FAILURE_CATEGORIES = Object.freeze({
  SYNTHETIC_AUTH_FIXTURE_MODE_NOT_ENABLED: "fixture-activation",
  SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED:
    "production-activation-prohibited",
  SYNTHETIC_AUTH_FIXTURE_ENVIRONMENT_INVALID: "environment-classification",
  AUTH_FIXTURE_VALIDATION_NOT_GITHUB_CI: "fixture-validation-scope",
  AUTH_SECRET_ALIAS_MISMATCH: "auth-secret-alias-policy",
  AUTH_PROVIDER_VARIABLE_MISSING: "provider-presence",
  AUTH_PROVIDER_VARIABLE_EMPTY: "provider-presence",
  AUTH_SECRET_MISSING: "auth-secret-presence",
  AUTH_SECRET_EMPTY: "auth-secret-presence",
  AUTH_SECRET_INVALID: "auth-secret-grammar",
  AUTH_PROVIDER_CLIENT_ID_GRAMMAR_INVALID: "provider-client-id-grammar",
  AUTH_PROVIDER_CLIENT_SECRET_GRAMMAR_INVALID:
    "provider-client-secret-grammar",
  RETIRED_SYNTHETIC_AUTH_FIXTURE_REJECTED: "synthetic-fixture-policy",
  SYNTHETIC_AUTH_FIXTURE_SCOPE_REJECTED: "synthetic-fixture-scope",
  AUTH_FIXTURE_PAIR_COHERENCE_INVALID: "provider-pair-coherence",
});

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function lstatOrNull(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function discoverGitWorktrees(repositoryRoot) {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Auth result destination could not enumerate repository worktrees");
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .map((worktree) => realpathSync(worktree));
}

function assertPhysicalContainedParent(root, parent) {
  const relative = path.relative(root, parent);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Auth result parent escapes the authorized external root");
  }
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const metadata = lstatSync(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Auth result parent contains a symlink or non-directory component");
    }
  }
  if (realpathSync(parent) !== parent) {
    throw new Error("Auth result parent is not a canonical physical directory");
  }
}

function resolveAuthResultDestination({
  repositoryRoot,
  externalRoot,
  resultPath,
  requireAbsent = true,
  worktreeRoots,
}) {
  if (!path.isAbsolute(repositoryRoot || "")) {
    throw new Error("Auth result validation requires an absolute repository root");
  }
  if (!path.isAbsolute(externalRoot || "") || !path.isAbsolute(resultPath || "")) {
    throw new Error("Auth result root and result path must be explicit absolute paths");
  }
  const repository = realpathSync(repositoryRoot);
  const rootMetadata = lstatSync(externalRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error("Auth result root must be a physical directory");
  }
  const root = realpathSync(externalRoot);
  if (root !== path.resolve(externalRoot)) {
    throw new Error("Auth result root must be supplied as its canonical physical path");
  }
  const repositoryWorktrees = (worktreeRoots || discoverGitWorktrees(repository)).map((entry) =>
    realpathSync(entry),
  );
  if (
    repositoryWorktrees.some(
      (worktree) => isInside(worktree, root) || isInside(root, worktree),
    )
  ) {
    throw new Error("Auth result root must remain outside the repository and every worktree");
  }
  const requested = path.resolve(resultPath);
  if (!isInside(root, requested) || requested === root) {
    throw new Error("Auth result path must remain beneath the authorized external root");
  }
  if (repositoryWorktrees.some((worktree) => isInside(worktree, requested))) {
    throw new Error("Auth result path must remain outside every repository worktree");
  }
  if (path.extname(requested) !== ".json") {
    throw new Error("Auth result path must use a .json target");
  }
  const parent = path.dirname(requested);
  assertPhysicalContainedParent(root, parent);
  const parentMetadata = lstatSync(parent);
  accessSync(parent, constants.W_OK);
  const sidecarPath = `${requested}.sha256`;
  if (requireAbsent && (lstatOrNull(requested) || lstatOrNull(sidecarPath))) {
    throw new Error("Auth result and checksum targets must be absent before invocation");
  }
  const relativePath = path.relative(root, requested).split(path.sep).join("/");
  const destination = Object.freeze({
    repositoryRoot: repository,
    externalRoot: root,
    resultPath: requested,
    sidecarPath,
    parentPath: parent,
    parentDevice: parentMetadata.dev,
    parentInode: parentMetadata.ino,
    relativePath,
    externalRootIdentitySha256: sha256Bytes(root),
    resultPathIdentitySha256: sha256Bytes(`${root}\0${relativePath}`),
  });
  RESOLVED_AUTH_RESULT_DESTINATIONS.add(destination);
  return destination;
}

function assertDestinationParentIdentity(destination) {
  assertPhysicalContainedParent(destination.externalRoot, destination.parentPath);
  const metadata = lstatSync(destination.parentPath);
  if (
    metadata.dev !== destination.parentDevice ||
    metadata.ino !== destination.parentInode
  ) {
    throw new Error("Auth result parent identity changed during publication");
  }
}

function assertDestinationPathBindings(destination) {
  if (
    !RESOLVED_AUTH_RESULT_DESTINATIONS.has(destination) ||
    destination.sidecarPath !== `${destination.resultPath}.sha256` ||
    path.dirname(destination.resultPath) !== destination.parentPath ||
    path.dirname(destination.sidecarPath) !== destination.parentPath ||
    !isInside(destination.externalRoot, destination.resultPath) ||
    destination.resultPath === destination.externalRoot ||
    destination.relativePath !==
      path.relative(destination.externalRoot, destination.resultPath)
        .split(path.sep)
        .join("/") ||
    destination.externalRootIdentitySha256 !==
      sha256Bytes(destination.externalRoot) ||
    destination.resultPathIdentitySha256 !==
      sha256Bytes(`${destination.externalRoot}\0${destination.relativePath}`)
  ) {
    throw new Error("Auth result destination path bindings are inconsistent");
  }
}

function writeAtomicFile(destination, filePath, bytes) {
  const parent = path.dirname(filePath);
  const stagingPath = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    assertDestinationPathBindings(destination);
    if (
      (filePath !== destination.resultPath &&
        filePath !== destination.sidecarPath) ||
      parent !== destination.parentPath
    ) {
      throw new Error("Auth result writer target is not bound to its verified parent");
    }
    assertDestinationParentIdentity(destination);
    descriptor = openSync(stagingPath, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // A same-filesystem hard link publishes the fully fsynced inode atomically
    // while retaining O_EXCL semantics. Unlike POSIX rename, link never
    // overwrites a target that appears after the destination preflight.
    linkSync(stagingPath, filePath);
    unlinkSync(stagingPath);
    assertDestinationParentIdentity(destination);
    const parentDescriptor = openSync(parent, "r");
    try {
      fsyncSync(parentDescriptor);
    } finally {
      closeSync(parentDescriptor);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(stagingPath)) unlinkSync(stagingPath);
  }
}

function sealAuthCommandResult(payload) {
  const aggregateSha256 = sha256Bytes(canonicalJsonBytes(payload));
  return Object.freeze({ ...payload, aggregateSha256 });
}

function writeAuthCommandResult({ destination, payload }) {
  assertDestinationPathBindings(destination);
  if (lstatOrNull(destination.resultPath) || lstatOrNull(destination.sidecarPath)) {
    throw new Error("Auth result writer refuses to overwrite an existing result");
  }
  const result = sealAuthCommandResult(payload);
  const bytes = canonicalJsonBytes(result);
  writeAtomicFile(destination, destination.resultPath, bytes);
  const checksumBytes = Buffer.from(
    `${result.aggregateSha256}  ${path.basename(destination.resultPath)}\n`,
  );
  writeAtomicFile(destination, destination.sidecarPath, checksumBytes);
  return result;
}

function assertExactKeys(value, expected, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${description} has missing or unknown fields`);
  }
}

function assertDescriptor(value, description) {
  assertExactKeys(value, ["bytes", "sha256"], description);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error(`${description} is malformed`);
  }
}

function assertModeEvidence(result, allowNonConsumableFailure = false) {
  const evidence = result.evidence;
  if (result.command.mode === "provider-fixture-export") {
    assertExactKeys(
      evidence,
      [
        "variableNames",
        "providerVariablesPresent",
        "maskRegistrationCount",
        "privateGithubEnvironment",
        "rawValuesRetained",
        "completed",
      ],
      "Auth export evidence",
    );
    if (
      result.result === "success" &&
      (
      JSON.stringify(evidence.variableNames) !==
        JSON.stringify(["CI_AUTH_FIXTURE_ACTIVE", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) ||
      evidence.providerVariablesPresent !== true ||
      evidence.maskRegistrationCount !== 2 ||
      evidence.privateGithubEnvironment !== true ||
      evidence.rawValuesRetained !== false ||
      evidence.completed !== true
      )
    ) {
      throw new Error("Auth export evidence is incomplete");
    }
    return;
  }
  if (result.command.mode === "auth-environment-validation") {
    assertExactKeys(
      evidence,
      [
        "providerVariablesPresent",
        "providerClientIdGrammar",
        "providerPairCoherence",
        "authSecretPresence",
        "aliasPolicy",
        "nonProductionClassification",
        "applicationValidator",
        "networkClassification",
        "leakScan",
        "completed",
      ],
      "Auth validation evidence",
    );
    if (result.result === "success") {
      if (
        evidence.providerVariablesPresent !== true ||
        evidence.providerClientIdGrammar !== "passed" ||
        evidence.providerPairCoherence !== "passed" ||
        evidence.authSecretPresence !== "passed" ||
        !new Set(["auth-secret-only", "nextauth-secret-only", "dual-equal"]).has(
          evidence.aliasPolicy,
        ) ||
        !new Set(["development", "staging"]).has(evidence.nonProductionClassification) ||
        evidence.applicationValidator !== "passed" ||
        evidence.networkClassification !== "not-used" ||
        evidence.leakScan !== "passed" ||
        evidence.completed !== true
      ) {
        throw new Error("Auth validation success evidence is incomplete");
      }
    } else if (
      typeof evidence.providerVariablesPresent !== "boolean" ||
      !new Set(["passed", "failed", "not-completed"]).has(
        evidence.providerClientIdGrammar,
      ) ||
      !new Set(["passed", "failed", "not-completed"]).has(
        evidence.providerPairCoherence,
      ) ||
      !new Set(["passed", "failed"]).has(evidence.authSecretPresence) ||
      !new Set([
        "dual-equal",
        "mismatch-rejected",
        "auth-secret-only",
        "nextauth-secret-only",
        "missing",
      ]).has(
        evidence.aliasPolicy,
      ) ||
      !new Set([
        "development",
        "staging",
        "production-rejected",
        "invalid",
      ]).has(evidence.nonProductionClassification) ||
      evidence.applicationValidator !== "failed" ||
      evidence.networkClassification !== "not-used" ||
      evidence.leakScan !== "passed" ||
      evidence.completed !== true
    ) {
      throw new Error("Auth validation failure evidence is incomplete");
    }
    if (result.result === "failure") {
      const expectedCategory =
        AUTH_VALIDATION_FAILURE_CATEGORIES[result.failure.code];
      if (!expectedCategory || result.failure.category !== expectedCategory) {
        throw new Error("Auth validation failure code and category are inconsistent");
      }
      if (
        new Set([
          "AUTH_PROVIDER_VARIABLE_MISSING",
          "AUTH_PROVIDER_VARIABLE_EMPTY",
        ]).has(result.failure.code) &&
        evidence.providerVariablesPresent !== false
      ) {
        throw new Error("Auth validation provider-presence evidence is inconsistent");
      }
      if (
        result.failure.code === "AUTH_PROVIDER_CLIENT_ID_GRAMMAR_INVALID" &&
        evidence.providerClientIdGrammar !== "failed"
      ) {
        throw new Error("Auth validation client-ID evidence is inconsistent");
      }
      if (
        result.failure.code === "AUTH_FIXTURE_PAIR_COHERENCE_INVALID" &&
        evidence.providerPairCoherence !== "failed"
      ) {
        throw new Error("Auth validation provider-pair evidence is inconsistent");
      }
      if (
        new Set(["AUTH_SECRET_MISSING", "AUTH_SECRET_EMPTY"]).has(
          result.failure.code,
        ) &&
        evidence.authSecretPresence !== "failed"
      ) {
        throw new Error("Auth validation secret-presence evidence is inconsistent");
      }
      if (
        result.failure.code === "AUTH_SECRET_ALIAS_MISMATCH" &&
        evidence.aliasPolicy !== "mismatch-rejected"
      ) {
        throw new Error("Auth validation alias evidence is inconsistent");
      }
      if (
        evidence.providerPairCoherence === "passed" &&
        (evidence.providerVariablesPresent !== true ||
          evidence.providerClientIdGrammar !== "passed")
      ) {
        throw new Error("Auth validation provider evidence is contradictory");
      }
      if (
        evidence.aliasPolicy === "mismatch-rejected" &&
        evidence.authSecretPresence !== "passed"
      ) {
        throw new Error("Auth validation alias/secret evidence is contradictory");
      }
      if (
        result.failure.code ===
          "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED" &&
        evidence.nonProductionClassification !== "production-rejected"
      ) {
        throw new Error("Auth validation production evidence is inconsistent");
      }
      if (
        result.failure.child.exitStatus !== null ||
        result.failure.child.signal !== null ||
        result.failure.child.spawnError !== null
      ) {
        throw new Error("Auth validation failure has contradictory child evidence");
      }
    }
    return;
  }
  if (result.command.mode === "production-misuse-validation") {
    assertExactKeys(
      evidence,
      [
        "expectedNegativeClassification",
        "child",
        "safeFailureCode",
        "intendedRejectionProved",
        "syntheticFixtureUseProved",
        "productionActivationProhibitedProved",
        "excludedFailureCauses",
        "stdout",
        "stderr",
        "rawValueLeakScan",
        "completed",
      ],
      "Production-misuse evidence",
    );
    assertExactKeys(evidence.child, ["exitStatus", "signal", "spawnError"], "Production child");
    assertExactKeys(
      evidence.excludedFailureCauses,
      [
        "missingDependency",
        "loaderFailure",
        "syntaxError",
        "transportFailure",
        "missingInput",
        "databaseFailure",
      ],
      "Production excluded causes",
    );
    assertDescriptor(evidence.stdout, "Production child stdout");
    assertDescriptor(evidence.stderr, "Production child stderr");
    if (
      result.result === "expected-negative-pass" &&
      (
      result.result !== "expected-negative-pass" ||
      evidence.expectedNegativeClassification !== "intended-production-rejection" ||
      !Number.isSafeInteger(evidence.child.exitStatus) ||
      evidence.child.exitStatus === 0 ||
      evidence.child.signal !== null ||
      evidence.child.spawnError !== null ||
      evidence.safeFailureCode !==
        "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED" ||
      evidence.intendedRejectionProved !== true ||
      evidence.syntheticFixtureUseProved !== true ||
      evidence.productionActivationProhibitedProved !== true ||
      Object.values(evidence.excludedFailureCauses).some((value) => value !== true) ||
      evidence.rawValueLeakScan !== "passed" ||
      evidence.completed !== true
      )
    ) {
      throw new Error("Production-misuse intended rejection proof is incomplete");
    }
    if (
      result.result === "failure" &&
      (JSON.stringify(result.failure.child) !== JSON.stringify(evidence.child) ||
        JSON.stringify(result.failure.stdout) !== JSON.stringify(evidence.stdout) ||
        JSON.stringify(result.failure.stderr) !== JSON.stringify(evidence.stderr))
    ) {
      throw new Error("Production-misuse failure child or stream evidence is inconsistent");
    }
    return;
  }
  if (result.command.mode === "auth-session-preflight") {
    assertExactKeys(
      evidence,
      ["invocation", "server", "sessionRequest", "checks", "cleanup"],
      "Auth preflight evidence",
    );
    assertExactKeys(
      evidence.invocation,
      [
        "packageCommandId",
        "executableClassification",
        "argvIdentitySha256",
        "fixturePolicySha256",
        "authValidatorSha256",
        "environmentNameSetSha256",
        "resultPathIdentitySha256",
        "invocationNonce",
      ],
      "Auth preflight invocation",
    );
    if (
      evidence.invocation.packageCommandId !== result.command.id ||
      evidence.invocation.executableClassification !== result.command.executable ||
      evidence.invocation.argvIdentitySha256 !==
        sha256Bytes(`${result.command.argv[0]}\0${result.command.argv[1]}`) ||
      evidence.invocation.fixturePolicySha256 !==
        result.identity.fixturePolicy.sha256 ||
      evidence.invocation.authValidatorSha256 !==
        result.identity.authValidator.sha256 ||
      evidence.invocation.environmentNameSetSha256 !==
        result.identity.environmentNameSetSha256 ||
      evidence.invocation.resultPathIdentitySha256 !==
        result.identity.resultPathIdentitySha256 ||
      evidence.invocation.invocationNonce !== result.identity.invocationNonce
    ) {
      throw new Error("Auth preflight invocation evidence is not identity-bound");
    }
    assertExactKeys(
      evidence.server,
      [
        "commandClassification",
        "pid",
        "started",
        "closed",
        "exitStatus",
        "signal",
        "spawnError",
        "stdout",
        "stderr",
        "listenerReady",
        "readinessAttemptCount",
        "readinessStartedAt",
        "readinessCompletedAt",
      ],
      "Auth preflight server",
    );
    assertDescriptor(evidence.server.stdout, "Auth preflight server stdout");
    assertDescriptor(evidence.server.stderr, "Auth preflight server stderr");
    if (
      evidence.server.commandClassification !== "next-dev-webpack-loopback" ||
      (evidence.server.pid !== null &&
        (!Number.isSafeInteger(evidence.server.pid) || evidence.server.pid <= 0)) ||
      typeof evidence.server.started !== "boolean" ||
      typeof evidence.server.closed !== "boolean" ||
      (evidence.server.exitStatus !== null &&
        !Number.isSafeInteger(evidence.server.exitStatus)) ||
      (evidence.server.signal !== null &&
        !new Set(["SIGTERM", "SIGKILL"]).has(evidence.server.signal)) ||
      (evidence.server.spawnError !== null &&
        !PROCESS_ERROR_CODE_PATTERN.test(evidence.server.spawnError)) ||
      typeof evidence.server.listenerReady !== "boolean" ||
      !Number.isSafeInteger(evidence.server.readinessAttemptCount) ||
      evidence.server.readinessAttemptCount < 0 ||
      !Number.isFinite(Date.parse(evidence.server.readinessStartedAt)) ||
      (evidence.server.readinessCompletedAt !== null &&
        !Number.isFinite(Date.parse(evidence.server.readinessCompletedAt)))
    ) {
      throw new Error("Auth preflight server evidence is malformed");
    }
    assertExactKeys(
      evidence.sessionRequest,
      [
        "endpointClassification",
        "method",
        "statusCode",
        "redirectCount",
        "redirectClassification",
        "contentTypeClassification",
        "bodyBytes",
        "bodySha256",
        "safeBodyType",
        "jsonParseResult",
        "signedOutValidation",
      ],
      "Auth preflight session request",
    );
    assertExactKeys(
      evidence.checks,
      [
        "providerEndpointContract",
        "csrfContract",
        "signOutContract",
        "googleSignInContract",
        "inertDiscoveryContract",
        "nonLoopbackRequestCount",
        "logSafetyScan",
      ],
      "Auth preflight checks",
    );
    assertExactKeys(
      evidence.cleanup,
      [
        "sigtermAttempted",
        "sigkillFallbackAttempted",
        "finalServerTermination",
        "portReleased",
        "taskOwnedCleanup",
        "completed",
      ],
      "Auth preflight cleanup",
    );
    if (
      evidence.sessionRequest.endpointClassification !== "loopback-auth-session" ||
      evidence.sessionRequest.method !== "GET" ||
      (evidence.sessionRequest.statusCode !== null &&
        (!Number.isSafeInteger(evidence.sessionRequest.statusCode) ||
          evidence.sessionRequest.statusCode < 100 ||
          evidence.sessionRequest.statusCode > 599)) ||
      !Number.isSafeInteger(evidence.sessionRequest.redirectCount) ||
      evidence.sessionRequest.redirectCount < 0 ||
      !new Set(["not-observed", "none", "http-redirect-rejected"]).has(
        evidence.sessionRequest.redirectClassification,
      ) ||
      !new Set(["not-observed", "application-json", "html", "other", "missing"]).has(
        evidence.sessionRequest.contentTypeClassification,
      ) ||
      !Number.isSafeInteger(evidence.sessionRequest.bodyBytes) ||
      evidence.sessionRequest.bodyBytes < 0 ||
      !SHA256_PATTERN.test(evidence.sessionRequest.bodySha256) ||
      !new Set([
        "null",
        "object",
        "array",
        "scalar",
        "HTML",
        "text",
        "empty",
        "malformed",
      ]).has(evidence.sessionRequest.safeBodyType) ||
      !new Set(["not-attempted", "passed", "failed"]).has(
        evidence.sessionRequest.jsonParseResult,
      ) ||
      !new Set(["not-attempted", "passed", "failed"]).has(
        evidence.sessionRequest.signedOutValidation,
      ) ||
      typeof evidence.cleanup.sigtermAttempted !== "boolean" ||
      typeof evidence.cleanup.sigkillFallbackAttempted !== "boolean" ||
      !new Set(["not-started", "passed", "failed"]).has(
        evidence.cleanup.finalServerTermination,
      ) ||
      !new Set(["not-required", "passed", "failed"]).has(
        evidence.cleanup.taskOwnedCleanup,
      ) ||
      typeof evidence.cleanup.portReleased !== "boolean" ||
      evidence.cleanup.completed !== true
    ) {
      throw new Error("Auth preflight request or cleanup evidence is malformed");
    }
    for (const checkName of [
      "providerEndpointContract",
      "csrfContract",
      "signOutContract",
      "googleSignInContract",
      "inertDiscoveryContract",
      "logSafetyScan",
    ]) {
      if (
        !new Set(["passed", "failed", "not-attempted"]).has(
          evidence.checks[checkName],
        )
      ) {
        throw new Error("Auth preflight check classification is invalid");
      }
    }
    if (
      !Number.isSafeInteger(evidence.checks.nonLoopbackRequestCount) ||
      evidence.checks.nonLoopbackRequestCount < 0 ||
      typeof evidence.server.started !== "boolean" ||
      typeof evidence.server.closed !== "boolean"
    ) {
      throw new Error("Auth preflight lifecycle or network evidence is invalid");
    }
    const taskOwnedSignalConsistent =
      evidence.cleanup.taskOwnedCleanup !== "passed" ||
      (evidence.cleanup.sigtermAttempted === true &&
        (evidence.cleanup.sigkillFallbackAttempted === true
          ? evidence.server.signal === "SIGKILL"
          : evidence.server.signal === "SIGTERM" ||
            (evidence.server.signal === null &&
              Number.isSafeInteger(evidence.server.exitStatus))));
    if (
      (evidence.cleanup.sigkillFallbackAttempted === true &&
        evidence.cleanup.sigtermAttempted !== true) ||
      !taskOwnedSignalConsistent
    ) {
      if (!(allowNonConsumableFailure && result.result === "failure")) {
        throw new Error("Auth preflight cleanup signal evidence is inconsistent");
      }
    }
    if (
      evidence.cleanup.finalServerTermination === "failed" ||
      evidence.cleanup.portReleased !== true ||
      evidence.cleanup.taskOwnedCleanup === "failed" ||
      evidence.cleanup.completed !== true
    ) {
      if (!(allowNonConsumableFailure && result.result === "failure")) {
        throw new Error("Auth preflight result reports failed server cleanup");
      }
    }
    if (
      evidence.server.started === true &&
      (evidence.server.closed !== true ||
        evidence.cleanup.finalServerTermination !== "passed")
    ) {
      if (!(allowNonConsumableFailure && result.result === "failure")) {
        throw new Error("Auth preflight started a server without completed cleanup");
      }
    }
    if (
      result.result === "failure" &&
      (result.failure.child.exitStatus !== evidence.server.exitStatus ||
        result.failure.child.signal !== evidence.server.signal ||
        result.failure.child.spawnError !== evidence.server.spawnError)
    ) {
      throw new Error("Auth preflight failure child evidence is inconsistent");
    }
    if (result.result === "success") {
      if (
        evidence.server.started !== true ||
        evidence.server.closed !== true ||
        evidence.server.spawnError !== null ||
        evidence.server.listenerReady !== true ||
        evidence.cleanup.sigtermAttempted !== true ||
        evidence.cleanup.taskOwnedCleanup !== "passed" ||
        (evidence.cleanup.sigkillFallbackAttempted === true
          ? evidence.server.signal !== "SIGKILL"
          : !(
              evidence.server.signal === "SIGTERM" ||
              (evidence.server.signal === null &&
                Number.isSafeInteger(evidence.server.exitStatus))
            )) ||
        evidence.sessionRequest.endpointClassification !== "loopback-auth-session" ||
        evidence.sessionRequest.method !== "GET" ||
        evidence.sessionRequest.statusCode !== 200 ||
        evidence.sessionRequest.redirectCount !== 0 ||
        evidence.sessionRequest.redirectClassification !== "none" ||
        evidence.sessionRequest.contentTypeClassification !== "application-json" ||
        !Number.isSafeInteger(evidence.sessionRequest.bodyBytes) ||
        !SHA256_PATTERN.test(evidence.sessionRequest.bodySha256) ||
        evidence.sessionRequest.safeBodyType !== "null" ||
        evidence.sessionRequest.jsonParseResult !== "passed" ||
        evidence.sessionRequest.signedOutValidation !== "passed" ||
        Object.entries(evidence.checks).some(([name, value]) =>
          name === "nonLoopbackRequestCount" ? value !== 0 : value !== "passed",
        )
      ) {
        throw new Error("Auth preflight success lacks canonical session-response proof");
      }
    }
    return;
  }
  throw new Error("Auth result mode is unknown or unsupported");
}

function privateValuesFromEnvironment(environment) {
  const values = [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "DATABASE_URL",
  ].flatMap((name) => {
    const raw = environment?.[name];
    if (typeof raw !== "string") return [];
    const normalized = raw.trim();
    if (normalized.length < 4) return [];
    return [raw, normalized];
  });
  return [...new Set(values)];
}

function assertNoRawPrivateValues(bytes, sensitiveValues = []) {
  const text = bytes.toString("utf8");
  for (const value of sensitiveValues) {
    if (value && text.includes(value)) {
      throw new Error("Auth result contains a raw private value");
    }
  }
  if (
    /postgres(?:ql)?:\/\//i.test(text) ||
    /authjs\.(?:csrf-token|session-token)=/i.test(text) ||
    /GOCSPX[-_][A-Za-z0-9_-]{8,}/.test(text) ||
    /[0-9]+-gate-a3-ci-[a-f0-9]{32}\.apps\.googleusercontent\.com/i.test(text)
  ) {
    throw new Error("Auth result contains credential, cookie, or database material");
  }
}

function validateAuthCommandResultValue({
  result,
  destination,
  expectedNonce,
  expectedCommandId,
  expectedMode,
  expectedCandidateCommitSha,
  expectedCandidateTreeSha,
  sensitiveValues = [],
  expectedStreamDescriptors,
  allowNonConsumableFailure = false,
}) {
  const bytes = canonicalJsonBytes(result);
  assertNoRawPrivateValues(bytes, sensitiveValues);
  assertExactKeys(
    result,
    [
      "schema",
      "version",
      "command",
      "result",
      "valid",
      "identity",
      "evidence",
      "failure",
      "completion",
      "aggregateSha256",
    ],
    "Auth result",
  );
  if (result.schema !== AUTH_RESULT_SCHEMA || result.version !== AUTH_RESULT_VERSION) {
    throw new Error("Auth result schema or version is unknown or from the future");
  }
  assertExactKeys(result.command, ["id", "mode", "executable", "argv"], "Auth command");
  const commandEntry = Object.entries(COMMAND_MODES).find(
    ([, entry]) =>
      entry.commandId === result.command.id && entry.mode === result.command.mode,
  );
  if (
    !commandEntry ||
    result.command.id !== expectedCommandId ||
    result.command.mode !== expectedMode
  ) {
    throw new Error("Auth result command or mode does not match this invocation");
  }
  if (
    result.command.executable !== "node-ts-node" ||
    !Array.isArray(result.command.argv) ||
    result.command.argv.length !== 2 ||
    result.command.argv[0] !== "scripts/ci-auth-fixture.ts" ||
    result.command.argv[1] !== commandEntry[0]
  ) {
    throw new Error("Auth result executable or argv identity is invalid");
  }
  if (!RESULT_VALUES.has(result.result) || result.valid !== (result.result !== "failure")) {
    throw new Error("Auth result classification is invalid");
  }
  if (
    result.command.mode !== "production-misuse-validation" &&
    result.result === "expected-negative-pass"
  ) {
    throw new Error("Expected-negative result is invalid for this auth mode");
  }
  assertExactKeys(
    result.identity,
    [
      "candidateCommitSha",
      "candidateTreeSha",
      "invocationNonce",
      "fixturePolicy",
      "authValidator",
      "environmentNameSetSha256",
      "environmentClassification",
      "externalRootIdentitySha256",
      "resultPathIdentitySha256",
      "startedAt",
      "completedAt",
    ],
    "Auth result identity",
  );
  if (!NONCE_PATTERN.test(result.identity.invocationNonce) || result.identity.invocationNonce !== expectedNonce) {
    throw new Error("Auth result nonce is stale or belongs to another invocation");
  }
  if (
    result.identity.candidateCommitSha !== (expectedCandidateCommitSha || null) ||
    result.identity.candidateTreeSha !== (expectedCandidateTreeSha || null)
  ) {
    throw new Error("Auth result candidate commit or tree binding is mismatched");
  }
  if (
    (result.identity.candidateCommitSha !== null &&
      !SOURCE_SHA_PATTERN.test(result.identity.candidateCommitSha)) ||
    (result.identity.candidateTreeSha !== null &&
      !SOURCE_SHA_PATTERN.test(result.identity.candidateTreeSha))
  ) {
    throw new Error("Auth result candidate identity is malformed");
  }
  assertExactKeys(result.identity.fixturePolicy, ["schema", "sha256"], "Fixture policy identity");
  assertExactKeys(result.identity.authValidator, ["owner", "sha256"], "Auth validator identity");
  if (
    result.identity.fixturePolicy.schema !==
      "interior-ai.synthetic-ci-oauth-fixture-policy.v1" ||
    !SHA256_PATTERN.test(result.identity.fixturePolicy.sha256) ||
    result.identity.authValidator.owner !== "lib/auth-env.ts" ||
    !SHA256_PATTERN.test(result.identity.authValidator.sha256) ||
    !SHA256_PATTERN.test(result.identity.environmentNameSetSha256) ||
    !SAFE_ENVIRONMENT_CLASSIFICATIONS.has(result.identity.environmentClassification) ||
    result.identity.externalRootIdentitySha256 !== destination.externalRootIdentitySha256 ||
    result.identity.resultPathIdentitySha256 !== destination.resultPathIdentitySha256
  ) {
    throw new Error("Auth result owner, environment, or external destination binding is invalid");
  }
  const started = Date.parse(result.identity.startedAt);
  const completed = Date.parse(result.identity.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    throw new Error("Auth result timestamps are invalid");
  }
  assertExactKeys(result.completion, ["complete", "marker"], "Auth completion marker");
  if (
    result.completion.complete !== true ||
    result.completion.marker !== AUTH_RESULT_COMPLETION_MARKER
  ) {
    throw new Error("Auth result completion marker is missing");
  }
  if (result.result === "failure") {
    assertExactKeys(
      result.failure,
      ["code", "category", "stdout", "stderr", "child", "completed"],
      "Auth failure evidence",
    );
    if (
      !/^[A-Z][A-Z0-9_]+$/.test(result.failure.code) ||
      !/^[a-z][a-z0-9-]+$/.test(result.failure.category) ||
      result.failure.completed !== true
    ) {
      throw new Error("Auth failure code or category is invalid");
    }
    assertDescriptor(result.failure.stdout, "Auth failure stdout");
    assertDescriptor(result.failure.stderr, "Auth failure stderr");
    assertExactKeys(result.failure.child, ["exitStatus", "signal", "spawnError"], "Auth failure child");
    if (
      (result.failure.child.exitStatus !== null &&
        !Number.isSafeInteger(result.failure.child.exitStatus)) ||
      (result.failure.child.signal !== null &&
        typeof result.failure.child.signal !== "string") ||
      (result.failure.child.spawnError !== null &&
        !PROCESS_ERROR_CODE_PATTERN.test(result.failure.child.spawnError))
    ) {
      throw new Error("Auth failure child process evidence is malformed");
    }
  } else if (result.failure !== null) {
    throw new Error("Successful auth result must not contain failure evidence");
  }
  assertModeEvidence(result, allowNonConsumableFailure);
  if (expectedStreamDescriptors) {
    if (result.command.mode !== "production-misuse-validation") {
      throw new Error("Auth stream binding is only valid for production-misuse results");
    }
    assertDescriptor(expectedStreamDescriptors.stdout, "Expected production stdout");
    assertDescriptor(expectedStreamDescriptors.stderr, "Expected production stderr");
    if (
      JSON.stringify(result.evidence.stdout) !==
        JSON.stringify(expectedStreamDescriptors.stdout) ||
      JSON.stringify(result.evidence.stderr) !==
        JSON.stringify(expectedStreamDescriptors.stderr)
    ) {
      throw new Error("Production-misuse result stream descriptor mismatch");
    }
  }
  if (!SHA256_PATTERN.test(result.aggregateSha256)) {
    throw new Error("Auth result aggregate SHA-256 is malformed");
  }
  const { aggregateSha256, ...payload } = result;
  if (sha256Bytes(canonicalJsonBytes(payload)) !== aggregateSha256) {
    throw new Error("Auth result aggregate hash mismatch indicates manual editing");
  }
  assertNoRawPrivateValues(bytes, sensitiveValues);
  return Object.freeze({ result, destination });
}

function validateAuthCommandResult({
  repositoryRoot,
  externalRoot,
  resultPath,
  expectedNonce,
  expectedCommandId,
  expectedMode,
  expectedCandidateCommitSha,
  expectedCandidateTreeSha,
  sensitiveValues = [],
  expectedStreamDescriptors,
  worktreeRoots,
}) {
  const destination = resolveAuthResultDestination({
    repositoryRoot,
    externalRoot,
    resultPath,
    requireAbsent: false,
    worktreeRoots,
  });
  const resultMetadata = lstatSync(destination.resultPath);
  const sidecarMetadata = lstatSync(destination.sidecarPath);
  if (
    resultMetadata.isSymbolicLink() ||
    !resultMetadata.isFile() ||
    sidecarMetadata.isSymbolicLink() ||
    !sidecarMetadata.isFile()
  ) {
    throw new Error("Auth result and checksum must be physical files");
  }
  const bytes = readFileSync(destination.resultPath);
  let result;
  try {
    result = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Auth result is not valid JSON");
  }
  if (!bytes.equals(canonicalJsonBytes(result))) {
    throw new Error("Auth result is not canonical JSON");
  }
  const validated = validateAuthCommandResultValue({
    result,
    destination,
    expectedNonce,
    expectedCommandId,
    expectedMode,
    expectedCandidateCommitSha,
    expectedCandidateTreeSha,
    sensitiveValues,
    expectedStreamDescriptors,
  });
  const expectedSidecar = `${result.aggregateSha256}  ${path.basename(destination.resultPath)}\n`;
  if (readFileSync(destination.sidecarPath, "utf8") !== expectedSidecar) {
    throw new Error("Auth result checksum sidecar does not close the result digest");
  }
  return validated;
}

function commandMode(command) {
  const mode = COMMAND_MODES[command];
  if (!mode) throw new Error("Auth command result mode is unknown");
  return mode;
}

function cli() {
  if (process.argv[2] !== "validate") {
    throw new Error("Usage: ci-auth-fixture-result-contract.cjs validate");
  }
  const validated = validateAuthCommandResult({
    repositoryRoot: process.cwd(),
    externalRoot: process.env[AUTH_RESULT_ROOT_ENV],
    resultPath: process.env[AUTH_RESULT_PATH_ENV],
    expectedNonce: process.env[AUTH_RESULT_NONCE_ENV],
    expectedCommandId: process.env[AUTH_RESULT_EXPECTED_COMMAND_ENV],
    expectedMode: process.env[AUTH_RESULT_EXPECTED_MODE_ENV],
    expectedCandidateCommitSha: process.env[AUTH_RESULT_CANDIDATE_COMMIT_ENV],
    expectedCandidateTreeSha: process.env[AUTH_RESULT_CANDIDATE_TREE_ENV],
    sensitiveValues: privateValuesFromEnvironment(process.env),
  });
  const rawStatus = process.env[AUTH_RESULT_COMMAND_STATUS_ENV];
  if (!/^(?:0|[1-9][0-9]{0,2})$/.test(rawStatus || "")) {
    throw new Error("Auth result validator requires the actual command exit status");
  }
  const actualStatus = Number(rawStatus);
  if (actualStatus > 255) {
    throw new Error("Auth result command exit status is invalid");
  }
  if ((actualStatus === 0) !== (validated.result.result !== "failure")) {
    throw new Error("Auth result classification does not match the command exit status");
  }
  process.stdout.write(
    `Validated canonical auth result for ${validated.result.command.id}.\n`,
  );
}

module.exports = Object.freeze({
  AUTH_RESULT_SCHEMA,
  AUTH_RESULT_VERSION,
  AUTH_RESULT_COMPLETION_MARKER,
  AUTH_RESULT_ROOT_ENV,
  AUTH_RESULT_PATH_ENV,
  AUTH_RESULT_NONCE_ENV,
  AUTH_RESULT_EXPECTED_COMMAND_ENV,
  AUTH_RESULT_EXPECTED_MODE_ENV,
  AUTH_RESULT_COMMAND_STATUS_ENV,
  AUTH_RESULT_CANDIDATE_COMMIT_ENV,
  AUTH_RESULT_CANDIDATE_TREE_ENV,
  COMMAND_MODES,
  canonicalJsonBytes,
  commandMode,
  privateValuesFromEnvironment,
  resolveAuthResultDestination,
  sealAuthCommandResult,
  sha256Bytes,
  validateAuthCommandResult,
  validateAuthCommandResultValue,
  writeAuthCommandResult,
});

if (require.main === module) {
  try {
    cli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
