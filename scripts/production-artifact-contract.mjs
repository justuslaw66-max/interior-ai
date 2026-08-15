export const PRODUCTION_EVIDENCE_SCHEMA =
  "interior-ai.production-artifact-evidence.v3";
export const PRODUCTION_EVIDENCE_VALIDATOR_VERSION = 3;
export const PRODUCTION_EVIDENCE_JOURNAL_SCHEMA =
  "interior-ai.production-artifact-semantic-event-journal.v2";
export const PRODUCTION_EVIDENCE_JOURNAL_VERSION = 2;
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
export const PRODUCTION_EVIDENCE_VERIFICATION_RESULT_SCHEMA =
  "interior-ai.production-artifact-verification-result.v1";
export const PRODUCTION_EVIDENCE_VERIFICATION_MODES = Object.freeze({
  REPOSITORY_PREFLIGHT: "repository-preflight",
  ARCHIVE_PREFLIGHT: "archive-preflight",
  REPOSITORY_FINAL: "repository-final",
  REPOSITORY_RUNTIME_FAILURE: "repository-runtime-failure",
  STANDALONE_FINAL: "standalone-final",
});
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

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
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

function validProcessIdentity(value) {
  return (
    exactKeys(value, ["pid", "parentPid"]) &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    Number.isSafeInteger(value.parentPid) &&
    value.parentPid >= 0
  );
}

function childEventIssues(name, event) {
  if (
    !exactKeys(event, [
      "status",
      "startedAt",
      "completedAt",
      "exitCode",
      "signal",
      "failureKind",
    ])
  ) {
    return [`semantic event journal ${name} event shape is malformed`];
  }
  const issues = [];
  const terminal = event.status === "succeeded" || event.status === "failed";
  if (!new Set(["pending", "running", "succeeded", "failed"]).has(event.status)) {
    issues.push(`semantic event journal ${name} status is invalid`);
  }
  if (
    event.status === "pending" &&
    [event.startedAt, event.completedAt, event.exitCode, event.signal, event.failureKind]
      .some((value) => value !== null)
  ) {
    issues.push(`semantic event journal ${name} pending state is contradictory`);
  }
  if (
    event.status === "running" &&
    (!canonicalUtcTimestamp(event.startedAt) ||
      event.completedAt !== null ||
      event.exitCode !== null ||
      event.signal !== null ||
      event.failureKind !== null)
  ) {
    issues.push(`semantic event journal ${name} running state is contradictory`);
  }
  if (
    terminal &&
    (!canonicalUtcTimestamp(event.startedAt) ||
      !canonicalUtcTimestamp(event.completedAt))
  ) {
    issues.push(`semantic event journal ${name} terminal timestamps are invalid`);
  }
  if (
    event.status === "succeeded" &&
    (event.exitCode !== 0 || event.signal !== null || event.failureKind !== null)
  ) {
    issues.push(`semantic event journal ${name} success is contradictory`);
  }
  if (event.status === "failed") {
    const childExit =
      Number.isSafeInteger(event.exitCode) &&
      event.exitCode !== 0 &&
      event.signal === null &&
      event.failureKind === "child_exit_nonzero";
    const childSignal =
      event.exitCode === null &&
      typeof event.signal === "string" &&
      /^SIG[A-Z0-9]+$/.test(event.signal) &&
      event.failureKind === "child_signal";
    const dispatchFailure =
      event.exitCode === null &&
      event.signal === null &&
      event.failureKind === "dispatch_error";
    if (!childExit && !childSignal && !dispatchFailure) {
      issues.push(`semantic event journal ${name} failure status is malformed`);
    }
  }
  return issues;
}

function inventoryEventIssues(event) {
  if (!exactKeys(event, ["status", "startedAt", "completedAt", "failureKind"])) {
    return ["semantic event journal artifact inventory shape is malformed"];
  }
  const issues = [];
  if (!new Set(["pending", "running", "succeeded", "failed"]).has(event.status)) {
    issues.push("semantic event journal artifact inventory status is invalid");
  }
  if (
    event.status === "pending" &&
    [event.startedAt, event.completedAt, event.failureKind].some(
      (value) => value !== null,
    )
  ) {
    issues.push("semantic event journal pending artifact inventory is contradictory");
  }
  if (
    event.status === "running" &&
    (!canonicalUtcTimestamp(event.startedAt) ||
      event.completedAt !== null ||
      event.failureKind !== null)
  ) {
    issues.push("semantic event journal running artifact inventory is contradictory");
  }
  if (
    new Set(["succeeded", "failed"]).has(event.status) &&
    (!canonicalUtcTimestamp(event.startedAt) ||
      !canonicalUtcTimestamp(event.completedAt))
  ) {
    issues.push("semantic event journal artifact inventory timestamps are invalid");
  }
  if (event.status === "succeeded" && event.failureKind !== null) {
    issues.push("semantic event journal successful artifact inventory is contradictory");
  }
  if (event.status === "failed" && event.failureKind !== "inventory_error") {
    issues.push("semantic event journal artifact inventory failure is malformed");
  }
  return issues;
}

function expectedJournalCompletionState(journal) {
  if (journal.manifest?.status === "created") return "manifest_created";
  const inventoryStatus = journal.events?.artifactInventory?.status;
  if (inventoryStatus !== "pending") return `artifact_inventory_${inventoryStatus}`;
  const buildStatus = journal.events?.build?.status;
  if (buildStatus !== "pending") return `build_${buildStatus}`;
  const generatedStatus = journal.events?.generatedSourceCheck?.status;
  if (generatedStatus !== "pending") return `generated_source_check_${generatedStatus}`;
  const installStatus = journal.events?.dependencyInstall?.status;
  if (installStatus !== "pending") return `dependency_install_${installStatus}`;
  return "initialized";
}

function journalTimeline(journal) {
  return [
    ["cycleStartedAt", journal.events?.cycleStartedAt],
    ["installStartedAt", journal.events?.dependencyInstall?.startedAt],
    ["installCompletedAt", journal.events?.dependencyInstall?.completedAt],
    ...(Array.isArray(journal.owner?.processHandoffs)
      ? journal.owner.processHandoffs.map((handoff, index) => [
          `processHandoff${index + 1}At`,
          handoff?.completedAt,
        ])
      : []),
    [
      "generatedSourceCheckStartedAt",
      journal.events?.generatedSourceCheck?.startedAt,
    ],
    [
      "generatedSourceCheckCompletedAt",
      journal.events?.generatedSourceCheck?.completedAt,
    ],
    ["buildStartedAt", journal.events?.build?.startedAt],
    ["buildCompletedAt", journal.events?.build?.completedAt],
    ["artifactInventoryStartedAt", journal.events?.artifactInventory?.startedAt],
    [
      "artifactInventoryCompletedAt",
      journal.events?.artifactInventory?.completedAt,
    ],
    ["manifestCreatedAt", journal.manifest?.createdAt],
  ].filter(([, value]) => value !== null && value !== undefined);
}

function journalBindingIssues(journal) {
  const binding = journal.bindings;
  if (!exactKeys(binding, ["artifactInventory", "nextBuildId", "artifactSha256"])) {
    return ["semantic event journal output binding shape is malformed"];
  }
  if (journal.events?.artifactInventory?.status === "succeeded") {
    if (
      !exactKeys(binding.artifactInventory, ["path", "sha256"]) ||
      binding.artifactInventory.path !==
        ".local/production-artifact-evidence/artifact-inventory.json" ||
      !SHA_256.test(binding.artifactInventory.sha256 ?? "") ||
      typeof binding.nextBuildId !== "string" ||
      binding.nextBuildId.length === 0 ||
      !SHA_256.test(binding.artifactSha256 ?? "")
    ) {
      return ["semantic event journal completed output binding is malformed"];
    }
  } else if (
    binding.artifactInventory !== null ||
    binding.nextBuildId !== null ||
    binding.artifactSha256 !== null
  ) {
    return ["semantic event journal exposes output bindings before completion"];
  }
  return [];
}

function journalDiagnosticsIssues(diagnostics) {
  if (
    !exactKeys(diagnostics, ["filesystemMetadata"]) ||
    !Array.isArray(diagnostics.filesystemMetadata)
  ) {
    return ["semantic event journal diagnostic metadata shape is malformed"];
  }
  const issues = [];
  for (const entry of diagnostics.filesystemMetadata) {
    if (!exactKeys(entry, ["label", "birthtime", "ctime", "mtime"])) {
      issues.push("semantic event journal filesystem diagnostics are malformed");
      continue;
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(entry.label ?? "")) {
      issues.push("semantic event journal filesystem diagnostic label is unsafe");
    }
    for (const value of [entry.birthtime, entry.ctime, entry.mtime]) {
      if (value !== null && !canonicalUtcTimestamp(value)) {
        issues.push("semantic event journal filesystem diagnostic timestamp is invalid");
      }
    }
  }
  return issues;
}

function semanticJournalIssues(journal) {
  if (
    !exactKeys(journal, [
      "schema",
      "version",
      "runNonce",
      "candidateIdentifier",
      "source",
      "owner",
      "commands",
      "buildContract",
      "toolchain",
      "events",
      "bindings",
      "manifest",
      "completionState",
      "diagnostics",
    ])
  ) {
    return ["semantic event journal shape is malformed"];
  }
  const issues = [];
  if (
    journal.schema !== PRODUCTION_EVIDENCE_JOURNAL_SCHEMA ||
    journal.version !== PRODUCTION_EVIDENCE_JOURNAL_VERSION
  ) {
    issues.push("unsupported semantic event journal schema or version");
  }
  if (!RUN_NONCE.test(journal.runNonce ?? "")) {
    issues.push("semantic event journal run nonce is malformed");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(journal.candidateIdentifier ?? "")) {
    issues.push("semantic event journal candidate identity is malformed");
  }
  if (
    !exactKeys(journal.source, ["commitSha", "treeSha"]) ||
    !SOURCE_SHA.test(journal.source?.commitSha ?? "") ||
    !SOURCE_SHA.test(journal.source?.treeSha ?? "")
  ) {
    issues.push("semantic event journal source binding is malformed");
  }
  const handoffs = journal.owner?.processHandoffs;
  if (
    !exactKeys(journal.owner, [
      "process",
      "processHandoffs",
      "worktreeIdentitySha256",
      "wrapper",
    ]) ||
    !validProcessIdentity(journal.owner?.process) ||
    !Array.isArray(handoffs) ||
    handoffs.length > 1 ||
    handoffs.some(
      (handoff) =>
        !exactKeys(handoff, ["from", "to", "boundary", "completedAt"]) ||
        !validProcessIdentity(handoff?.from) ||
        !validProcessIdentity(handoff?.to) ||
        same(handoff.from, handoff.to) ||
        handoff.boundary !== "post-dependency-install-pre-generated-source" ||
        !canonicalUtcTimestamp(handoff.completedAt),
    ) ||
    (handoffs.length > 0 && !same(handoffs.at(-1).to, journal.owner?.process)) ||
    !SHA_256.test(journal.owner?.worktreeIdentitySha256 ?? "") ||
    !exactKeys(journal.owner?.wrapper, ["version", "path", "sha256"]) ||
    journal.owner?.wrapper?.version !== PRODUCTION_EVIDENCE_WRAPPER_VERSION ||
    journal.owner?.wrapper?.path !== "scripts/production-artifact-evidence.mjs" ||
    !SHA_256.test(journal.owner?.wrapper?.sha256 ?? "")
  ) {
    issues.push("semantic event journal owner binding is malformed");
  }
  if (
    !exactKeys(journal.commands, [
      "dependencyInstall",
      "generatedSourceCheck",
      "build",
    ]) ||
    journal.commands?.dependencyInstall !== DEPENDENCY_INSTALL_COMMAND ||
    journal.commands?.generatedSourceCheck !== GENERATED_SOURCE_CHECK_COMMAND ||
    journal.commands?.build !== BUILD_COMMAND
  ) {
    issues.push("semantic event journal command binding is not canonical");
  }
  if (
    !exactKeys(journal.buildContract, [
      "applicationEnvironment",
      "catalogStrictValidation",
    ]) ||
    !PRODUCTION_ENVIRONMENTS.has(journal.buildContract?.applicationEnvironment) ||
    journal.buildContract?.catalogStrictValidation !== true
  ) {
    issues.push("semantic event journal build contract is malformed");
  }
  if (
    !exactKeys(journal.toolchain, ["nodeVersion", "npmVersion"]) ||
    typeof journal.toolchain?.nodeVersion !== "string" ||
    journal.toolchain.nodeVersion.length === 0 ||
    typeof journal.toolchain?.npmVersion !== "string" ||
    journal.toolchain.npmVersion.length === 0
  ) {
    issues.push("semantic event journal toolchain binding is malformed");
  }
  if (
    !exactKeys(journal.events, [
      "cycleStartedAt",
      "buildWrapperStartedAt",
      "dependencyInstall",
      "generatedSourceCheck",
      "build",
      "artifactInventory",
    ]) ||
    !canonicalUtcTimestamp(journal.events?.cycleStartedAt) ||
    !canonicalUtcTimestamp(journal.events?.buildWrapperStartedAt)
  ) {
    issues.push("semantic event journal event envelope is malformed");
  } else {
    issues.push(
      ...childEventIssues("dependency install", journal.events.dependencyInstall),
      ...childEventIssues(
        "generated-source check",
        journal.events.generatedSourceCheck,
      ),
      ...childEventIssues("build", journal.events.build),
      ...inventoryEventIssues(journal.events.artifactInventory),
    );
    if (
      Date.parse(journal.events.buildWrapperStartedAt) <
      Date.parse(journal.events.cycleStartedAt)
    ) {
      issues.push("semantic event journal build wrapper start is out of order");
    }
    if (
      canonicalUtcTimestamp(journal.events.build.startedAt) &&
      Date.parse(journal.events.buildWrapperStartedAt) >
        Date.parse(journal.events.build.startedAt)
    ) {
      issues.push("semantic event journal build dispatch is out of order");
    }
  }
  if (
    !exactKeys(journal.manifest, ["status", "createdAt"]) ||
    !new Set(["pending", "created"]).has(journal.manifest?.status) ||
    (journal.manifest?.status === "pending"
      ? journal.manifest.createdAt !== null
      : !canonicalUtcTimestamp(journal.manifest?.createdAt))
  ) {
    issues.push("semantic event journal manifest state is malformed");
  }
  if (
    journal.events?.generatedSourceCheck?.status !== "pending" &&
    journal.events?.dependencyInstall?.status !== "succeeded"
  ) {
    issues.push("generated-source check started before dependency installation succeeded");
  }
  const handoff = handoffs?.[0];
  if (
    handoff &&
    (journal.events?.dependencyInstall?.status !== "succeeded" ||
      Date.parse(handoff.completedAt) <
        Date.parse(journal.events.dependencyInstall.completedAt) ||
      (canonicalUtcTimestamp(journal.events?.generatedSourceCheck?.startedAt) &&
        Date.parse(handoff.completedAt) >
          Date.parse(journal.events.generatedSourceCheck.startedAt)))
  ) {
    issues.push("semantic process handoff boundary is malformed or out of order");
  }
  if (
    journal.events?.build?.status !== "pending" &&
    journal.events?.generatedSourceCheck?.status !== "succeeded"
  ) {
    issues.push("build started before generated-source verification succeeded");
  }
  if (
    journal.events?.artifactInventory?.status !== "pending" &&
    journal.events?.build?.status !== "succeeded"
  ) {
    issues.push("artifact inventory started before the build succeeded");
  }
  if (
    journal.manifest?.status === "created" &&
    journal.events?.artifactInventory?.status !== "succeeded"
  ) {
    issues.push("manifest was claimed before artifact inventory succeeded");
  }
  issues.push(
    ...journalBindingIssues(journal),
    ...journalDiagnosticsIssues(journal.diagnostics),
  );
  const timeline = journalTimeline(journal);
  if (timeline.some(([, value]) => !canonicalUtcTimestamp(value))) {
    issues.push("semantic event journal timestamps are invalid");
  }
  for (let index = 1; index < timeline.length; index += 1) {
    if (Date.parse(timeline[index][1]) < Date.parse(timeline[index - 1][1])) {
      issues.push(
        `semantic event journal ${timeline[index][0]} predates ${timeline[index - 1][0]}`,
      );
    }
  }
  if (journal.completionState !== expectedJournalCompletionState(journal)) {
    issues.push("semantic event journal completion state is contradictory");
  }
  return issues;
}

function completedSemanticJournalIssues(journal) {
  const issues = semanticJournalIssues(journal);
  if (
    !successfulEvent(journal?.events?.dependencyInstall) ||
    !successfulEvent(journal?.events?.generatedSourceCheck) ||
    !successfulEvent(journal?.events?.build) ||
    journal?.events?.artifactInventory?.status !== "succeeded" ||
    journal?.events?.artifactInventory?.failureKind !== null
  ) {
    issues.push("semantic event journal does not record a complete successful build");
  }
  if (
    journal?.manifest?.status !== "created" ||
    journal?.completionState !== "manifest_created"
  ) {
    issues.push("semantic event journal does not record manifest completion");
  }
  return issues;
}

export function validateCurrentProductionEvidenceSemanticJournal(journal) {
  const issues = semanticJournalIssues(journal);
  return { valid: issues.length === 0, issues };
}

export function certificationPreparedBuildJournalIssues(journal) {
  const issues = completedSemanticJournalIssues(journal);
  if (journal?.owner?.processHandoffs?.length !== 1) {
    issues.push(
      "certification prepared build requires exactly one process handoff",
    );
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
    !same(
      manifest?.execution?.owner?.processHandoffs,
      journal?.owner?.processHandoffs,
    ) ||
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
    ...completedSemanticJournalIssues(semanticJournal),
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
