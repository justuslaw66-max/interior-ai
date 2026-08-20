"use strict";

const { createHash, randomBytes } = module.require("node:crypto");
const {
  chmodSync,
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} = module.require("node:fs");
const path = module.require("node:path");
const { spawnSync } = module.require("node:child_process");

const FIXTURE_SESSION_SCHEMA = "interior-ai.ci-auth-fixture-session.v1";
const FIXTURE_SESSION_VERSION = 1;
const FIXTURE_SESSION_COMPLETION_MARKER = "CI_AUTH_FIXTURE_SESSION_COMPLETE";
const FIXTURE_SESSION_ROOT_ENV = "CI_AUTH_FIXTURE_SESSION_ROOT";
const FIXTURE_SESSION_ID_ENV = "CI_AUTH_FIXTURE_SESSION_ID";
const FIXTURE_SESSION_NONCE_ENV = "CI_AUTH_FIXTURE_SESSION_NONCE";
const FIXTURE_SESSION_CLASSIFICATION_ENV =
  "CI_AUTH_FIXTURE_SESSION_CLASSIFICATION";
const FIXTURE_CLIENT_ID_SHA256_ENV =
  "CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256";
const FIXTURE_CLIENT_SECRET_SHA256_ENV =
  "CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256";
const FIXTURE_NO_REGENERATION_ENV = "CI_AUTH_FIXTURE_NO_REGENERATION";
const FIXTURE_SESSION_CLASSIFICATION = "PRODUCTION_INELIGIBLE_SYNTHETIC_AUTH";
const FIXTURE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_SHA_PATTERN = /^[a-f0-9]{40}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const EXPORTED_VARIABLE_NAMES = Object.freeze([
  "CI_AUTH_FIXTURE_ACTIVE",
  FIXTURE_SESSION_CLASSIFICATION_ENV,
  FIXTURE_SESSION_ID_ENV,
  FIXTURE_SESSION_NONCE_ENV,
  FIXTURE_SESSION_ROOT_ENV,
  FIXTURE_CLIENT_ID_SHA256_ENV,
  FIXTURE_CLIENT_SECRET_SHA256_ENV,
  FIXTURE_NO_REGENERATION_ENV,
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
]);
const PRIVATE_VALUE_NAMES = Object.freeze([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
]);

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function syntheticProviderPairMatches(googleClientId, googleClientSecret) {
  const client = googleClientId?.match(
    /^[0-9]+-gate-a3-ci-([a-f0-9]{32})\.apps\.googleusercontent\.com$/i,
  );
  const secondaryValue = googleClientSecret?.match(
    /^GOCSPX[-_]gate-a3-ci-([a-f0-9]{32})$/i,
  );
  return Boolean(
    client &&
      secondaryValue &&
      client[1]?.toLowerCase() === secondaryValue[1]?.toLowerCase(),
  );
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function seal(value) {
  const { aggregateSha256: _discarded, ...payload } = value;
  return Object.freeze({
    ...payload,
    aggregateSha256: sha256Bytes(canonicalJsonBytes(payload)),
  });
}

function lstatOrNull(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
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

function worktreeRoots(repositoryRoot) {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Auth fixture session could not enumerate repository worktrees");
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => realpathSync(line.slice("worktree ".length)));
}

function assertPrivateDirectory(root) {
  const metadata = lstatSync(root);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Auth fixture session root must be a physical directory");
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error("Auth fixture session root must be owner-only mode 0700");
  }
}

function sessionPaths({ repositoryRoot, environment, createRoot = false }) {
  const rawRoot = environment?.[FIXTURE_SESSION_ROOT_ENV];
  const sessionId = environment?.[FIXTURE_SESSION_ID_ENV];
  const invocationNonce = environment?.[FIXTURE_SESSION_NONCE_ENV];
  if (!rawRoot || !path.isAbsolute(rawRoot)) {
    throw new Error("Auth fixture session requires an absolute external root");
  }
  if (!ID_PATTERN.test(sessionId || "") || !ID_PATTERN.test(invocationNonce || "")) {
    throw new Error("Auth fixture session identity or invocation nonce is malformed");
  }
  const rootMetadata = lstatOrNull(rawRoot);
  if (!rootMetadata && createRoot) {
    mkdirSync(rawRoot, { mode: 0o700 });
  } else if (!rootMetadata) {
    throw new Error("Auth fixture session root is absent");
  }
  assertPrivateDirectory(rawRoot);
  const root = realpathSync(rawRoot);
  if (worktreeRoots(repositoryRoot).some((worktree) => isInside(worktree, root))) {
    throw new Error("Auth fixture session root must remain outside repository worktrees");
  }
  const transportPath = path.join(root, `${sessionId}.transport.env`);
  const manifestPath = path.join(root, `${sessionId}.session.json`);
  return Object.freeze({
    root,
    sessionId,
    invocationNonce,
    transportPath,
    manifestPath,
    transportIdentitySha256: sha256Bytes(transportPath),
    manifestIdentitySha256: sha256Bytes(manifestPath),
  });
}

function writeAtomicAbsent(filePath, bytes) {
  if (lstatOrNull(filePath)) {
    throw new Error("Auth fixture session refuses a second generation attempt");
  }
  const parent = path.dirname(filePath);
  const parentMetadata = lstatSync(parent);
  if (parentMetadata.isSymbolicLink() || !parentMetadata.isDirectory()) {
    throw new Error("Auth fixture session publication parent is unsafe");
  }
  const temporaryPath = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporaryPath, filePath);
    chmodSync(filePath, 0o600);
    unlinkSync(temporaryPath);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary path can be absent after successful publication.
    }
    throw error;
  }
}

function serializeAssignments(assignments) {
  const names = Object.keys(assignments).sort();
  if (JSON.stringify(names) !== JSON.stringify([...EXPORTED_VARIABLE_NAMES].sort())) {
    throw new Error("Auth fixture session exported variable inventory is not exact");
  }
  return `${EXPORTED_VARIABLE_NAMES.map((name) => {
    const value = assignments[name];
    if (typeof value !== "string" || !value || /[\r\n]/.test(value)) {
      throw new Error("Auth fixture session transport values must be non-empty single lines");
    }
    return `${name}=${value}`;
  }).join("\n")}\n`;
}

function parseAssignments(bytes) {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || /\r/.test(text)) {
    throw new Error("Auth fixture session transport has whitespace or newline mutation");
  }
  const entries = text.slice(0, -1).split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error("Auth fixture session transport is malformed");
    return [line.slice(0, separator), line.slice(separator + 1)];
  });
  if (new Set(entries.map(([name]) => name)).size !== entries.length) {
    throw new Error("Auth fixture session transport contains duplicate variables");
  }
  const assignments = Object.fromEntries(entries);
  if (serializeAssignments(assignments) !== text) {
    throw new Error("Auth fixture session transport is non-canonical or mutated");
  }
  return Object.freeze(assignments);
}

function sourceIdentity(repositoryRoot) {
  const generatorPath = path.join(repositoryRoot, "scripts/ci-auth-fixture.ts");
  const policyPath = path.join(repositoryRoot, "scripts/ci-auth-fixture.json");
  return Object.freeze({
    generator: Object.freeze({
      owner: "scripts/ci-auth-fixture.ts#export-github-env",
      sourceSha256: sha256Bytes(readFileSync(generatorPath)),
    }),
    policy: Object.freeze({
      schema: "interior-ai.synthetic-ci-oauth-fixture-policy.v1",
      sourceSha256: sha256Bytes(readFileSync(policyPath)),
    }),
  });
}

function candidateIdentity(environment) {
  const commitSha = environment.CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA || null;
  const treeSha = environment.CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA || null;
  if (Boolean(commitSha) !== Boolean(treeSha)) {
    throw new Error("Auth fixture session candidate commit and tree must be supplied together");
  }
  if (
    (commitSha && !SOURCE_SHA_PATTERN.test(commitSha)) ||
    (treeSha && !SOURCE_SHA_PATTERN.test(treeSha))
  ) {
    throw new Error("Auth fixture session candidate identity is malformed");
  }
  return Object.freeze({ commitSha, treeSha });
}

function safeSessionIdentity(manifest, lifecycle) {
  return Object.freeze({
    schema: manifest.schema,
    version: manifest.version,
    sessionId: manifest.sessionId,
    invocationNonce: manifest.invocationNonce,
    candidate: manifest.candidate,
    generator: manifest.generator,
    policy: manifest.policy,
    exportedVariableNames: manifest.exportedVariableNames,
    exportedVariableNamesSha256: manifest.exportedVariableNamesSha256,
    providerDigests: manifest.providerDigests,
    createdAt: manifest.createdAt,
    classification: manifest.classification,
    privateTransport: manifest.privateTransport,
    completion: manifest.completion,
    sessionAggregateSha256: manifest.aggregateSha256,
    lifecycle: Object.freeze(lifecycle),
  });
}

function publishFixtureSession({
  repositoryRoot = process.cwd(),
  environment = process.env,
  fixture,
  now = () => new Date(),
}) {
  const paths = sessionPaths({ repositoryRoot, environment, createRoot: true });
  if (lstatOrNull(paths.transportPath) || lstatOrNull(paths.manifestPath)) {
    throw new Error("Auth fixture session refuses a second generation attempt");
  }
  if (
    !fixture ||
    typeof fixture.googleClientId !== "string" ||
    typeof fixture.googleClientSecret !== "string" ||
    !syntheticProviderPairMatches(
      fixture.googleClientId,
      fixture.googleClientSecret,
    )
  ) {
    throw new Error(
      "Auth fixture session generator did not supply the canonical provider pair",
    );
  }
  const assignments = Object.freeze({
    GOOGLE_CLIENT_ID: fixture.googleClientId,
    GOOGLE_CLIENT_SECRET: fixture.googleClientSecret,
    CI_AUTH_FIXTURE_ACTIVE: "1",
    [FIXTURE_SESSION_ROOT_ENV]: paths.root,
    [FIXTURE_SESSION_ID_ENV]: paths.sessionId,
    [FIXTURE_SESSION_NONCE_ENV]: paths.invocationNonce,
    [FIXTURE_SESSION_CLASSIFICATION_ENV]: FIXTURE_SESSION_CLASSIFICATION,
    [FIXTURE_CLIENT_ID_SHA256_ENV]: sha256Bytes(fixture.googleClientId),
    [FIXTURE_CLIENT_SECRET_SHA256_ENV]: sha256Bytes(
      fixture.googleClientSecret,
    ),
    [FIXTURE_NO_REGENERATION_ENV]: "1",
  });
  const transportBytes = Buffer.from(serializeAssignments(assignments));
  const identities = sourceIdentity(repositoryRoot);
  const candidate = candidateIdentity(environment);
  const createdAt = now().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("Auth fixture session creation timestamp is invalid");
  }
  const manifest = seal({
    schema: FIXTURE_SESSION_SCHEMA,
    version: FIXTURE_SESSION_VERSION,
    sessionId: paths.sessionId,
    invocationNonce: paths.invocationNonce,
    candidate,
    generator: identities.generator,
    policy: identities.policy,
    exportedVariableNames: [...EXPORTED_VARIABLE_NAMES].sort(),
    exportedVariableNamesSha256: sha256Bytes(
      [...EXPORTED_VARIABLE_NAMES].sort().join("\0"),
    ),
    providerDigests: {
      googleClientIdSha256: sha256Bytes(fixture.googleClientId),
      googleClientSecretSha256: sha256Bytes(fixture.googleClientSecret),
    },
    createdAt,
    classification: FIXTURE_SESSION_CLASSIFICATION,
    privateTransport: {
      identitySha256: paths.transportIdentitySha256,
      contentSha256: sha256Bytes(transportBytes),
      ownerOnlyMode: "0600",
      portable: false,
      rawValuesRetainedInPortableEvidence: false,
    },
    completion: {
      complete: true,
      marker: FIXTURE_SESSION_COMPLETION_MARKER,
      successfulGenerationEvents: 1,
    },
  });
  writeAtomicAbsent(paths.transportPath, transportBytes);
  writeAtomicAbsent(paths.manifestPath, canonicalJsonBytes(manifest));
  return Object.freeze({
    assignments,
    transportBytes,
    manifest,
    safeIdentity: safeSessionIdentity(manifest, {
      action: "generated",
      generationCount: 1,
      regenerationDetected: false,
      sourceCommand: "ci:auth-fixture:export",
      sourceMode: "export-github-env",
      certificationEligibility: "ELIGIBLE_FOR_CANONICAL_AUTH_CONTINUITY_ONLY",
    }),
  });
}

function validateManifest({ manifest, repositoryRoot, environment, paths, now }) {
  const { aggregateSha256, ...payload } = manifest;
  if (
    manifest.schema !== FIXTURE_SESSION_SCHEMA ||
    manifest.version !== FIXTURE_SESSION_VERSION ||
    !SHA256_PATTERN.test(aggregateSha256 || "") ||
    sha256Bytes(canonicalJsonBytes(payload)) !== aggregateSha256
  ) {
    throw new Error("Auth fixture session manifest schema or aggregate is invalid");
  }
  const current = sourceIdentity(repositoryRoot);
  const candidate = candidateIdentity(environment);
  if (
    manifest.sessionId !== paths.sessionId ||
    manifest.invocationNonce !== paths.invocationNonce ||
    JSON.stringify(manifest.candidate) !== JSON.stringify(candidate) ||
    JSON.stringify(manifest.generator) !== JSON.stringify(current.generator) ||
    JSON.stringify(manifest.policy) !== JSON.stringify(current.policy) ||
    JSON.stringify(manifest.exportedVariableNames) !==
      JSON.stringify([...EXPORTED_VARIABLE_NAMES].sort()) ||
    manifest.exportedVariableNamesSha256 !==
      sha256Bytes([...EXPORTED_VARIABLE_NAMES].sort().join("\0")) ||
    manifest.classification !== FIXTURE_SESSION_CLASSIFICATION ||
    manifest.privateTransport?.identitySha256 !== paths.transportIdentitySha256 ||
    manifest.privateTransport?.ownerOnlyMode !== "0600" ||
    manifest.privateTransport?.portable !== false ||
    manifest.privateTransport?.rawValuesRetainedInPortableEvidence !== false ||
    manifest.completion?.complete !== true ||
    manifest.completion?.marker !== FIXTURE_SESSION_COMPLETION_MARKER ||
    manifest.completion?.successfulGenerationEvents !== 1
  ) {
    throw new Error("Auth fixture session identity, owner, policy, or completion is mismatched");
  }
  const createdAt = Date.parse(manifest.createdAt);
  const currentTime = now().getTime();
  if (
    !Number.isFinite(createdAt) ||
    createdAt > currentTime + 60_000 ||
    currentTime - createdAt > FIXTURE_SESSION_MAX_AGE_MS
  ) {
    throw new Error("Auth fixture session is stale or has an invalid creation time");
  }
}

function consumeFixtureSession({
  repositoryRoot = process.cwd(),
  environment = process.env,
  requireAmbientProviderValues = true,
  now = () => new Date(),
  sourceCommand = "unknown",
  sourceMode = "consume-existing",
}) {
  const paths = sessionPaths({ repositoryRoot, environment });
  for (const filePath of [paths.transportPath, paths.manifestPath]) {
    const metadata = lstatSync(filePath);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      (metadata.mode & 0o077) !== 0
    ) {
      throw new Error("Auth fixture session files must be physical owner-only mode-0600 files");
    }
  }
  const manifestBytes = readFileSync(paths.manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Auth fixture session manifest is not valid JSON");
  }
  if (!manifestBytes.equals(canonicalJsonBytes(manifest))) {
    throw new Error("Auth fixture session manifest is non-canonical or mutated");
  }
  validateManifest({ manifest, repositoryRoot, environment, paths, now });
  const transportBytes = readFileSync(paths.transportPath);
  const assignments = parseAssignments(transportBytes);
  if (
    manifest.privateTransport.contentSha256 !== sha256Bytes(transportBytes) ||
    assignments[FIXTURE_SESSION_ROOT_ENV] !== paths.root ||
    assignments[FIXTURE_SESSION_ID_ENV] !== paths.sessionId ||
    assignments[FIXTURE_SESSION_NONCE_ENV] !== paths.invocationNonce ||
    assignments[FIXTURE_SESSION_CLASSIFICATION_ENV] !==
      FIXTURE_SESSION_CLASSIFICATION ||
    assignments[FIXTURE_CLIENT_ID_SHA256_ENV] !==
      manifest.providerDigests.googleClientIdSha256 ||
    assignments[FIXTURE_CLIENT_SECRET_SHA256_ENV] !==
      manifest.providerDigests.googleClientSecretSha256 ||
    assignments[FIXTURE_NO_REGENERATION_ENV] !== "1" ||
    assignments.CI_AUTH_FIXTURE_ACTIVE !== "1" ||
    sha256Bytes(assignments.GOOGLE_CLIENT_ID) !==
      manifest.providerDigests.googleClientIdSha256 ||
    sha256Bytes(assignments.GOOGLE_CLIENT_SECRET) !==
      manifest.providerDigests.googleClientSecretSha256
  ) {
    throw new Error("Auth fixture session private transport or provider digest is mismatched");
  }
  for (const name of PRIVATE_VALUE_NAMES) {
    const ambient = environment[name];
    if (
      (requireAmbientProviderValues && ambient === undefined) ||
      (ambient !== undefined && ambient !== assignments[name])
    ) {
      throw new Error("Auth fixture session rejected a missing or overridden parent provider value");
    }
  }
  for (const name of [
    "CI_AUTH_FIXTURE_ACTIVE",
    FIXTURE_CLIENT_ID_SHA256_ENV,
    FIXTURE_CLIENT_SECRET_SHA256_ENV,
    FIXTURE_NO_REGENERATION_ENV,
  ]) {
    if (
      environment[name] !== undefined &&
      environment[name] !== assignments[name]
    ) {
      throw new Error(
        "Auth fixture session rejected an overridden parent session control",
      );
    }
  }
  for (const name of [
    FIXTURE_SESSION_CLASSIFICATION_ENV,
    FIXTURE_SESSION_ID_ENV,
    FIXTURE_SESSION_NONCE_ENV,
    FIXTURE_SESSION_ROOT_ENV,
  ]) {
    if (environment[name] !== assignments[name]) {
      throw new Error("Auth fixture session rejected foreign or altered session metadata");
    }
  }
  return Object.freeze({
    assignments,
    manifest,
    safeIdentity: safeSessionIdentity(manifest, {
      action: "consumed",
      generationCount: 0,
      regenerationDetected: false,
      sourceCommand,
      sourceMode,
      certificationEligibility: "ELIGIBLE_FOR_CANONICAL_AUTH_CONTINUITY_ONLY",
    }),
  });
}

function projectedFixtureEnvironment(consumed) {
  const digests = consumed.manifest.providerDigests;
  return Object.freeze({
    GOOGLE_CLIENT_ID: consumed.assignments.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: consumed.assignments.GOOGLE_CLIENT_SECRET,
    CI_AUTH_FIXTURE_ACTIVE: "1",
    CI_AUTH_FIXTURE_MODE: "1",
    CI_AUTH_FIXTURE_LOCAL_TEST: "1",
    [FIXTURE_SESSION_ID_ENV]: consumed.manifest.sessionId,
    [FIXTURE_SESSION_NONCE_ENV]: consumed.manifest.invocationNonce,
    [FIXTURE_SESSION_CLASSIFICATION_ENV]: consumed.manifest.classification,
    [FIXTURE_CLIENT_ID_SHA256_ENV]: digests.googleClientIdSha256,
    [FIXTURE_CLIENT_SECRET_SHA256_ENV]: digests.googleClientSecretSha256,
    [FIXTURE_NO_REGENERATION_ENV]: "1",
  });
}

function validateProjectedFixtureEnvironment(environment) {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    FIXTURE_SESSION_ID_ENV,
    FIXTURE_SESSION_NONCE_ENV,
    FIXTURE_CLIENT_ID_SHA256_ENV,
    FIXTURE_CLIENT_SECRET_SHA256_ENV,
  ];
  if (required.some((name) => !environment?.[name])) {
    throw new Error("Build auth fixture continuity projection is incomplete");
  }
  if (
    environment.CI_AUTH_FIXTURE_ACTIVE !== "1" ||
    !(
      environment.CI_AUTH_FIXTURE_LOCAL_TEST === "1" ||
      (environment.CI === "true" && environment.GITHUB_ACTIONS === "true")
    ) ||
    environment[FIXTURE_SESSION_CLASSIFICATION_ENV] !==
      FIXTURE_SESSION_CLASSIFICATION ||
    environment[FIXTURE_NO_REGENERATION_ENV] !== "1" ||
    sha256Bytes(environment.GOOGLE_CLIENT_ID) !==
      environment[FIXTURE_CLIENT_ID_SHA256_ENV] ||
    sha256Bytes(environment.GOOGLE_CLIENT_SECRET) !==
      environment[FIXTURE_CLIENT_SECRET_SHA256_ENV] ||
    !syntheticProviderPairMatches(
      environment.GOOGLE_CLIENT_ID,
      environment.GOOGLE_CLIENT_SECRET,
    )
  ) {
    throw new Error("Build auth fixture continuity digest or classification is mismatched");
  }
  return Object.freeze({
    schema: FIXTURE_SESSION_SCHEMA,
    sessionId: environment[FIXTURE_SESSION_ID_ENV],
    invocationNonce: environment[FIXTURE_SESSION_NONCE_ENV],
    providerDigests: Object.freeze({
      googleClientIdSha256: environment[FIXTURE_CLIENT_ID_SHA256_ENV],
      googleClientSecondaryValueSha256:
        environment[FIXTURE_CLIENT_SECRET_SHA256_ENV],
    }),
    generatedVersusConsumed: "consumed-existing",
    noRegenerationProof: "passed",
    activationScope:
      environment.CI_AUTH_FIXTURE_LOCAL_TEST === "1"
        ? "local-certification-projection"
        : "github-actions",
    certificationEligibility: "ELIGIBLE_FOR_CANONICAL_AUTH_CONTINUITY_ONLY",
    rawValuesRecorded: false,
  });
}

module.exports = Object.freeze({
  EXPORTED_VARIABLE_NAMES,
  FIXTURE_CLIENT_ID_SHA256_ENV,
  FIXTURE_CLIENT_SECRET_SHA256_ENV,
  FIXTURE_NO_REGENERATION_ENV,
  FIXTURE_SESSION_CLASSIFICATION,
  FIXTURE_SESSION_CLASSIFICATION_ENV,
  FIXTURE_SESSION_COMPLETION_MARKER,
  FIXTURE_SESSION_ID_ENV,
  FIXTURE_SESSION_NONCE_ENV,
  FIXTURE_SESSION_ROOT_ENV,
  FIXTURE_SESSION_SCHEMA,
  FIXTURE_SESSION_VERSION,
  canonicalJsonBytes,
  consumeFixtureSession,
  projectedFixtureEnvironment,
  publishFixtureSession,
  seal,
  serializeAssignments,
  sha256Bytes,
  validateProjectedFixtureEnvironment,
});
