"use strict";

const { createHash, randomBytes } = module.require("node:crypto");
const {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
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
  if (repositoryWorktrees.some((worktree) => isInside(worktree, root))) {
    throw new Error("Auth result root must remain outside the repository and every worktree");
  }
  const requested = path.resolve(resultPath);
  if (!isInside(root, requested) || requested === root) {
    throw new Error("Auth result path must remain beneath the authorized external root");
  }
  if (path.extname(requested) !== ".json") {
    throw new Error("Auth result path must use a .json target");
  }
  const parent = path.dirname(requested);
  assertPhysicalContainedParent(root, parent);
  accessSync(parent, constants.W_OK);
  const sidecarPath = `${requested}.sha256`;
  if (requireAbsent && (lstatOrNull(requested) || lstatOrNull(sidecarPath))) {
    throw new Error("Auth result and checksum targets must be absent before invocation");
  }
  const relativePath = path.relative(root, requested).split(path.sep).join("/");
  return Object.freeze({
    repositoryRoot: repository,
    externalRoot: root,
    resultPath: requested,
    sidecarPath,
    relativePath,
    externalRootIdentitySha256: sha256Bytes(root),
    resultPathIdentitySha256: sha256Bytes(`${root}\0${relativePath}`),
  });
}

function writeAtomicFile(filePath, bytes) {
  const parent = path.dirname(filePath);
  const stagingPath = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(stagingPath, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (lstatOrNull(filePath)) {
      throw new Error("Auth result target appeared before atomic finalization");
    }
    renameSync(stagingPath, filePath);
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
  if (lstatOrNull(destination.resultPath) || lstatOrNull(destination.sidecarPath)) {
    throw new Error("Auth result writer refuses to overwrite an existing result");
  }
  const result = sealAuthCommandResult(payload);
  const bytes = canonicalJsonBytes(result);
  writeAtomicFile(destination.resultPath, bytes);
  const checksumBytes = Buffer.from(
    `${result.aggregateSha256}  ${path.basename(destination.resultPath)}\n`,
  );
  writeAtomicFile(destination.sidecarPath, checksumBytes);
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

function assertModeEvidence(result) {
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
    if (result.result === "success") {
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
      evidence.cleanup.finalServerTermination === "failed" ||
      evidence.cleanup.portReleased !== true ||
      evidence.cleanup.taskOwnedCleanup === "failed" ||
      evidence.cleanup.completed !== true
    ) {
      throw new Error("Auth preflight result reports failed server cleanup");
    }
    if (
      evidence.server.started === true &&
      (evidence.cleanup.finalServerTermination !== "passed" ||
        evidence.cleanup.taskOwnedCleanup !== "passed")
    ) {
      throw new Error("Auth preflight started a server without completed cleanup");
    }
    if (result.result === "success") {
      if (
        evidence.server.listenerReady !== true ||
        evidence.sessionRequest.endpointClassification !== "loopback-auth-session" ||
        evidence.sessionRequest.method !== "GET" ||
        evidence.sessionRequest.statusCode !== 200 ||
        evidence.sessionRequest.redirectCount !== 0 ||
        evidence.sessionRequest.redirectClassification !== "none" ||
        evidence.sessionRequest.contentTypeClassification !== "application-json" ||
        !Number.isSafeInteger(evidence.sessionRequest.bodyBytes) ||
        !SHA256_PATTERN.test(evidence.sessionRequest.bodySha256) ||
        !new Set(["null", "object"]).has(evidence.sessionRequest.safeBodyType) ||
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
  return [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "DATABASE_URL",
  ]
    .map((name) => environment?.[name])
    .filter((value) => typeof value === "string" && value.length >= 4);
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
  if (
    !Object.values(COMMAND_MODES).some(
      (entry) => entry.commandId === result.command.id && entry.mode === result.command.mode,
    ) ||
    result.command.id !== expectedCommandId ||
    result.command.mode !== expectedMode
  ) {
    throw new Error("Auth result command or mode does not match this invocation");
  }
  if (
    result.command.executable !== "node-ts-node" ||
    !Array.isArray(result.command.argv) ||
    result.command.argv.length !== 2 ||
    result.command.argv[0] !== "scripts/ci-auth-fixture.ts"
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
  } else if (result.failure !== null) {
    throw new Error("Successful auth result must not contain failure evidence");
  }
  assertModeEvidence(result);
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
  const expectedSidecar = `${aggregateSha256}  ${path.basename(destination.resultPath)}\n`;
  if (readFileSync(destination.sidecarPath, "utf8") !== expectedSidecar) {
    throw new Error("Auth result checksum sidecar does not close the result digest");
  }
  assertNoRawPrivateValues(bytes, sensitiveValues);
  return Object.freeze({ result, destination });
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
