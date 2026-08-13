export const PRODUCTION_EVIDENCE_SCHEMA =
  "interior-ai.production-artifact-evidence.v3";
export const PRODUCTION_EVIDENCE_VALIDATOR_VERSION = 3;
export const PRODUCTION_EVIDENCE_JOURNAL_SCHEMA =
  "interior-ai.production-artifact-semantic-event-journal.v1";
export const PRODUCTION_EVIDENCE_JOURNAL_VERSION = 1;
export const PRODUCTION_EVIDENCE_SERVER_COMMAND =
  "npm run evidence:production:serve";
export const PRODUCTION_EVIDENCE_UNDERLYING_SERVER_COMMAND = "npm run start";
export const PRODUCTION_EVIDENCE_WRAPPER_VERSION = 3;
export const GENERATED_SOURCE_CHECK_COMMAND =
  "npx ts-node --transpile-only --compiler-options '{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}' scripts/generate-surface-material-runtime.ts --check";
export const BUILD_COMMAND = "npm run build";
export const DEPENDENCY_INSTALL_COMMAND = "npm ci --include=dev";
export const PRODUCTION_EVIDENCE_JOURNAL_BASENAME =
  "semantic-event-journal.json";
export const PRODUCTION_EVIDENCE_JOURNAL_PATH =
  ".local/production-artifact-evidence/semantic-event-journal.json";
export const CURRENT_PRODUCTION_EVIDENCE_VERSIONS = Object.freeze([
  PRODUCTION_EVIDENCE_VALIDATOR_VERSION,
]);

const PRODUCTION_ENVIRONMENTS = new Set(["staging", "production"]);
const SHA_256 = /^[0-9a-f]{64}$/;
const SOURCE_SHA = /^[0-9a-f]{40,64}$/i;
const RUN_NONCE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function canonicalUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    UTC_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function containsMatchingKey(value, pattern) {
  if (Array.isArray(value)) {
    return value.some((entry) => containsMatchingKey(entry, pattern));
  }
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => pattern.test(key) || containsMatchingKey(nested, pattern),
  );
}

function successfulEvent(event) {
  return (
    event?.status === "succeeded" &&
    canonicalUtcTimestamp(event.startedAt) &&
    canonicalUtcTimestamp(event.completedAt) &&
    event.exitCode === 0 &&
    event.signal === null &&
    event.failureKind === null
  );
}

function semanticJournalIssues(journal) {
  const issues = [];
  if (
    journal?.schema !== PRODUCTION_EVIDENCE_JOURNAL_SCHEMA ||
    journal?.version !== PRODUCTION_EVIDENCE_JOURNAL_VERSION
  ) {
    issues.push("unsupported semantic event journal schema or version");
  }
  if (!RUN_NONCE.test(journal?.runNonce ?? "")) {
    issues.push("semantic event journal run nonce is malformed");
  }
  if (
    !SOURCE_SHA.test(journal?.source?.commitSha ?? "") ||
    !SOURCE_SHA.test(journal?.source?.treeSha ?? "")
  ) {
    issues.push("semantic event journal source binding is malformed");
  }
  if (
    journal?.commands?.dependencyInstall !== DEPENDENCY_INSTALL_COMMAND ||
    journal?.commands?.generatedSourceCheck !== GENERATED_SOURCE_CHECK_COMMAND ||
    journal?.commands?.build !== BUILD_COMMAND
  ) {
    issues.push("semantic event journal command binding is not canonical");
  }
  if (
    !successfulEvent(journal?.events?.dependencyInstall) ||
    !successfulEvent(journal?.events?.generatedSourceCheck) ||
    !successfulEvent(journal?.events?.build) ||
    journal?.events?.artifactInventory?.status !== "succeeded" ||
    journal?.events?.artifactInventory?.failureKind !== null
  ) {
    issues.push("semantic event journal does not record a complete successful build");
  }
  const timeline = [
    journal?.events?.cycleStartedAt,
    journal?.events?.dependencyInstall?.startedAt,
    journal?.events?.dependencyInstall?.completedAt,
    journal?.events?.generatedSourceCheck?.startedAt,
    journal?.events?.generatedSourceCheck?.completedAt,
    journal?.events?.build?.startedAt,
    journal?.events?.build?.completedAt,
    journal?.events?.artifactInventory?.startedAt,
    journal?.events?.artifactInventory?.completedAt,
    journal?.manifest?.createdAt,
  ];
  if (
    timeline.some((value) => !canonicalUtcTimestamp(value)) ||
    timeline.some(
      (value, index) => index > 0 && Date.parse(value) < Date.parse(timeline[index - 1]),
    )
  ) {
    issues.push("semantic event journal ordering is invalid");
  }
  if (
    journal?.manifest?.status !== "created" ||
    journal?.completionState !== "manifest_created"
  ) {
    issues.push("semantic event journal does not record manifest completion");
  }
  if (
    typeof journal?.bindings?.nextBuildId !== "string" ||
    journal.bindings.nextBuildId.length === 0 ||
    !SHA_256.test(journal?.bindings?.artifactSha256 ?? "")
  ) {
    issues.push("semantic event journal artifact binding is malformed");
  }
  return issues;
}

function manifestSchemaIssues(manifest) {
  const issues = [];
  if (
    manifest?.schema !== PRODUCTION_EVIDENCE_SCHEMA ||
    manifest?.validatorVersion !== PRODUCTION_EVIDENCE_VALIDATOR_VERSION
  ) {
    issues.push("unsupported production evidence schema or validator version");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(manifest?.candidateIdentifier ?? "")) {
    issues.push("candidate identity is missing or malformed");
  }
  if (
    !SOURCE_SHA.test(manifest?.source?.commitSha ?? "") ||
    !SOURCE_SHA.test(manifest?.source?.treeSha ?? "")
  ) {
    issues.push("manifest source binding is malformed");
  }
  if (
    containsMatchingKey(
      manifest,
      /(secret|token|password|private.?key|api.?key|access.?key|cookie|database.?url|credential)/i,
    )
  ) {
    issues.push("manifest contains prohibited secret-bearing fields");
  }
  if (containsMatchingKey(manifest, /^(?:birthtime|ctime|mtime)$/i)) {
    issues.push("filesystem timestamps cannot populate portable semantic evidence");
  }
  return issues;
}

function manifestJournalBindingIssues(manifest, journal) {
  const issues = [];
  if (
    manifest?.candidateIdentifier !== journal?.candidateIdentifier ||
    manifest?.source?.commitSha !== journal?.source?.commitSha ||
    manifest?.source?.treeSha !== journal?.source?.treeSha
  ) {
    issues.push("candidate, commit, or tree does not match the semantic event journal");
  }
  if (
    manifest?.execution?.runNonce !== journal?.runNonce ||
    manifest?.execution?.semanticJournalSchema !== PRODUCTION_EVIDENCE_JOURNAL_SCHEMA ||
    !same(manifest?.execution?.owner?.process, journal?.owner?.process) ||
    !same(manifest?.execution?.owner?.wrapper, journal?.owner?.wrapper) ||
    !same(manifest?.execution?.commands, journal?.commands)
  ) {
    issues.push("manifest semantic journal nonce, owner, or command binding is invalid");
  }
  return issues;
}

function recordedChildMatches(
  recorded,
  event,
  command,
  { commandField = "command", startedAtField = "startedAt", completedAtField = "completedAt" } = {},
) {
  return (
    recorded?.[commandField] === command &&
    recorded?.[startedAtField] === event?.startedAt &&
    recorded?.[completedAtField] === event?.completedAt &&
    recorded?.processExitCode === 0 &&
    recorded?.processSignal === null
  );
}

function manifestBuildIssues(manifest, journal) {
  const issues = [];
  if (
    !recordedChildMatches(
      manifest?.dependencies,
      journal?.events?.dependencyInstall,
      DEPENDENCY_INSTALL_COMMAND,
      {
        commandField: "installCommand",
        startedAtField: "installStartedAt",
        completedAtField: "installCompletedAt",
      },
    )
  ) {
    issues.push("dependency installation evidence is incomplete or mismatched");
  }
  if (
    manifest?.generatedSourceCheck?.status !== "passed" ||
    !recordedChildMatches(
      manifest?.generatedSourceCheck,
      journal?.events?.generatedSourceCheck,
      GENERATED_SOURCE_CHECK_COMMAND,
    )
  ) {
    issues.push("generated-source evidence is incomplete or mismatched");
  }
  if (
    manifest?.build?.mode !== "production" ||
    !PRODUCTION_ENVIRONMENTS.has(manifest?.build?.applicationEnvironment) ||
    manifest?.build?.catalogStrictValidation !== true ||
    manifest?.build?.command !== BUILD_COMMAND ||
    manifest?.build?.serverCommand !== PRODUCTION_EVIDENCE_SERVER_COMMAND ||
    manifest?.build?.underlyingServerCommand !==
      PRODUCTION_EVIDENCE_UNDERLYING_SERVER_COMMAND ||
    manifest?.build?.wrapperStartedAt !== journal?.events?.buildWrapperStartedAt ||
    !recordedChildMatches(manifest?.build, journal?.events?.build, BUILD_COMMAND)
  ) {
    issues.push("production build evidence is incomplete or mismatched");
  }
  return issues;
}

function manifestArtifactIssues(manifest, journal) {
  const issues = [];
  if (
    manifest?.artifactInventory?.status !== "completed" ||
    manifest?.artifactInventory?.startedAt !==
      journal?.events?.artifactInventory?.startedAt ||
    manifest?.artifactInventory?.completedAt !==
      journal?.events?.artifactInventory?.completedAt
  ) {
    issues.push("artifact inventory evidence is incomplete or mismatched");
  }
  if (
    !SHA_256.test(manifest?.artifact?.sha256 ?? "") ||
    manifest?.artifact?.sha256 !== journal?.bindings?.artifactSha256 ||
    !Number.isSafeInteger(manifest?.artifact?.fileCount) ||
    manifest.artifact.fileCount <= 0 ||
    !Number.isSafeInteger(manifest?.artifact?.bytes) ||
    manifest.artifact.bytes <= 0 ||
    !Array.isArray(manifest?.artifact?.files) ||
    manifest.artifact.files.length !== manifest.artifact.fileCount ||
    !same(manifest?.artifact?.roots, [".next", "public"]) ||
    manifest?.artifact?.hashAlgorithm !== "sha256" ||
    !manifest.artifact.files.some((file) => file?.path === ".next/BUILD_ID")
  ) {
    issues.push("artifact identity or inventory is incomplete or mismatched");
  }
  if (
    manifest?.build?.nextBuildId !== journal?.bindings?.nextBuildId ||
    typeof manifest?.build?.nextBuildId !== "string" ||
    manifest.build.nextBuildId.length === 0
  ) {
    issues.push("Next.js Build ID does not match the semantic event journal");
  }
  return issues;
}

function manifestCompletionIssues(manifest, journal, requirePendingTests) {
  const issues = [];
  if (
    manifest?.cycleStartedAt !== journal?.events?.cycleStartedAt ||
    manifest?.createdAt !== journal?.manifest?.createdAt ||
    !canonicalUtcTimestamp(manifest?.createdAt)
  ) {
    issues.push("manifest creation or cycle timestamp does not match the semantic event journal");
  }
  if (!Array.isArray(manifest?.tests)) {
    issues.push("test evidence list is malformed");
  } else if (
    requirePendingTests &&
    (manifest.tests.length !== 0 || manifest?.repositoryEvidence?.status !== "pending_tests")
  ) {
    issues.push("Playwright requires a pre-runtime manifest with pending test evidence");
  }
  if (
    manifest?.repositoryEvidence?.releaseReady !== false ||
    manifest?.repositoryEvidence?.actualDeploymentVerified !== false
  ) {
    issues.push("repository evidence overstates release or deployment completion");
  }
  return issues;
}

function expectedIdentityIssues(manifest, expected) {
  const issues = [];
  if (
    manifest?.source?.commitSha !== expected?.sourceCommitSha ||
    manifest?.source?.treeSha !== expected?.sourceTreeSha
  ) {
    issues.push("manifest source identity does not match canonical preflight");
  }
  if (manifest?.build?.nextBuildId !== expected?.nextBuildId) {
    issues.push("manifest Build ID does not match canonical preflight");
  }
  if (manifest?.artifact?.sha256 !== expected?.artifactSha256) {
    issues.push("manifest artifact SHA-256 does not match canonical preflight");
  }
  return issues;
}

export function validateCurrentProductionEvidenceManifest({
  manifest,
  semanticJournal,
  expectedIdentity,
  requirePendingTests = false,
}) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, issues: ["production evidence manifest shape is malformed"] };
  }
  const issues = [
    ...manifestSchemaIssues(manifest),
    ...semanticJournalIssues(semanticJournal),
    ...manifestJournalBindingIssues(manifest, semanticJournal),
    ...manifestBuildIssues(manifest, semanticJournal),
    ...manifestArtifactIssues(manifest, semanticJournal),
    ...manifestCompletionIssues(manifest, semanticJournal, requirePendingTests),
    ...(expectedIdentity ? expectedIdentityIssues(manifest, expectedIdentity) : []),
  ];
  return {
    valid: issues.length === 0,
    issues,
    identity:
      issues.length === 0
        ? {
            schema: manifest.schema,
            validatorVersion: manifest.validatorVersion,
            candidateIdentifier: manifest.candidateIdentifier,
            sourceCommitSha: manifest.source.commitSha,
            sourceTreeSha: manifest.source.treeSha,
            artifactSha256: manifest.artifact.sha256,
            nextBuildId: manifest.build.nextBuildId,
            semanticJournalSchema: manifest.execution.semanticJournalSchema,
            semanticJournalVersion: semanticJournal.version,
            runNonce: manifest.execution.runNonce,
            serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
            buildMode: manifest.build.mode,
          }
        : null,
  };
}
