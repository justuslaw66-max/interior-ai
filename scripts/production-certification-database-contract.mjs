import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const PRODUCTION_CERTIFICATION_DATABASE_LIFECYCLE_SCHEMA =
  "interior-ai.production-certification-database-lifecycle.v1";
export const PRODUCTION_CERTIFICATION_DATABASE_BINDING_SCHEMA =
  "interior-ai.production-certification-database-lifecycle-binding.v1";
export const PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION = 1;
export const PRODUCTION_CERTIFICATION_DATABASE_NAME_PREFIX =
  "interior_ai_gate_a3_test_cert_";
export const PRODUCTION_CERTIFICATION_DATABASE_EVIDENCE_DOMAIN =
  "interior-ai.production-certification-database-lifecycle-seal.v1\n";
export const PRODUCTION_CERTIFICATION_DATABASE_STATES = Object.freeze([
  "planned",
  "create-authorized",
  "provisioned",
  "migrated",
  "initial-empty-verified",
  "active",
  "stable-runtime-inspected",
  "stable-sessions-cleared",
  "stable-dropped",
  "stable-absence-verified",
  "final-empty-verified",
  "sessions-cleared",
  "dropped",
  "absence-verified",
  "failed",
  "abort-cleanup-in-progress",
  "abort-dropped",
  "abort-absence-verified",
]);
export const PRODUCTION_CERTIFICATION_DATABASE_STAGE_BINDINGS = Object.freeze([
  "source-validation",
  "build",
  "phase8",
  "runtime-smoke",
  "browser-owners",
]);
export const AUTH_SESSION_PREFLIGHT_DATABASE_STAGE =
  "auth-session-preflight";
export const AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS = Object.freeze({
  lifecycle: "AUTH_SESSION_PREFLIGHT_ONLY",
  rehearsal: "NOT_REHEARSAL_DATABASE",
  releaseCertification: "NOT_RELEASE_CERTIFICATION",
  integration: "NOT_VALID_FOR_INTEGRATION",
});
export const STABLE_RUNTIME_SMOKE_DATABASE_PROFILE =
  "stable-runtime-smoke";
export const STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS = Object.freeze({
  lifecycle: "STABLE_RUNTIME_SMOKE_ONLY",
  releaseCertification: "NOT_RELEASE_CERTIFICATION",
  integration: "NOT_VALID_FOR_INTEGRATION",
});
export const PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT = Object.freeze({
  browserEventTypes: Object.freeze([
    "landing_viewed",
    "design_started",
    "first_item_added",
    "third_item_added",
    "first_run_activation_step_completed",
    "export_clicked",
    "upgrade_clicked",
    "share_link_created",
    "share_link_opened",
    "design_duplicated",
    "share_design_duplicated",
    "export_opened",
    "export_printed",
    "export_pdf_clicked",
    "export_upgrade_prompt_shown",
    "checkout_started",
    "checkout_return_observed",
    "upgrade_checkout_started",
    "checkout_success_viewed",
    "billing_portal_opened",
    "beta_feedback_submitted",
  ]),
  trustedEventTypes: Object.freeze([
    "upgrade_checkout_completed",
    "subscription_canceled",
    "webhook_failed",
    "stripe_webhook_processed",
  ]),
  internalEventTypes: Object.freeze([
    "checkout_variant_validation_failed",
    "variant_resolution_issue",
  ]),
  browserOwnerIds: Object.freeze([
    "floor-plan-upload",
    "pro-visual",
    "guest-save",
    "my-designs",
    "public-share",
    "cart",
    "retailer",
  ]),
  writerClassifications: Object.freeze([
    "browser-public-ingestion",
    "browser-server-action",
    "internal-server-diagnostic",
    "trusted-stripe-lifecycle",
    "unexpected-writer-contract",
  ]),
  attributions: Object.freeze([
    "owned",
    "unbound-or-malformed",
    "foreign-identity",
    "foreign-stage-or-run",
  ]),
});

const PROTECTED_DATABASE_NAMES = new Set([
  "postgres",
  "template0",
  "template1",
  "interior_ai",
  "interior_ai_development",
  "interior_ai_staging",
  "interior_ai_production",
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

export function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function isCanonicalIdentity(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

export function isSourceSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
}

export function canonicalDatabaseNonce(value = randomBytes(16).toString("hex")) {
  if (typeof value !== "string" || !/^[0-9a-f]{32,64}$/.test(value)) {
    throw new Error("certification database nonce is malformed");
  }
  return value;
}

export function generateCertificationDatabaseName({
  certificationId,
  candidateId,
  candidateCommitSha,
  nonce,
}) {
  if (
    !isCanonicalIdentity(certificationId) ||
    !isCanonicalIdentity(candidateId) ||
    !isSourceSha(candidateCommitSha)
  ) {
    throw new Error("certification database identity binding is malformed");
  }
  const canonicalNonce = canonicalDatabaseNonce(nonce);
  const digest = sha256(
    canonicalJsonBytes({
      classification: "disposable-production-certification-test-database",
      certificationId,
      candidateId,
      candidateCommitSha,
      nonce: canonicalNonce,
      generatorVersion: PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION,
    }),
  );
  const name = `${PRODUCTION_CERTIFICATION_DATABASE_NAME_PREFIX}${digest.slice(0, 32)}`;
  if (!isCanonicalCertificationDatabaseName(name)) {
    throw new Error("canonical certification database generator produced an unsafe name");
  }
  return Object.freeze({
    name,
    nameSha256: sha256(name),
    identitySha256: digest,
    nonceSha256: sha256(canonicalNonce),
    generatorVersion: PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION,
  });
}

export function generateProvisionAuthorizationSha256({ identity, database }) {
  return sha256(
    canonicalJsonBytes({
      domain: "interior-ai.production-certification-database-provision-authorization.v1",
      identity,
      databaseIdentitySha256: database.identitySha256,
      databaseNameSha256: database.nameSha256,
      nonceSha256: database.nonceSha256,
    }),
  );
}

export function isCanonicalCertificationDatabaseName(name) {
  return (
    typeof name === "string" &&
    name.length <= 63 &&
    /^[a-z][a-z0-9_]*$/.test(name) &&
    name.startsWith(PRODUCTION_CERTIFICATION_DATABASE_NAME_PREFIX) &&
    /^[a-f0-9]{32}$/.test(name.slice(PRODUCTION_CERTIFICATION_DATABASE_NAME_PREFIX.length)) &&
    !PROTECTED_DATABASE_NAMES.has(name)
  );
}

export function assertUnprotectedDatabaseName(name) {
  if (PROTECTED_DATABASE_NAMES.has(String(name).toLowerCase())) {
    throw new Error("protected database name is prohibited");
  }
  if (!isCanonicalCertificationDatabaseName(name)) {
    throw new Error("database name was not generated by the certification lifecycle owner");
  }
}

export function databaseAdminPolicy(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("certification database admin URL is malformed");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("certification database admin protocol is prohibited");
  }
  if (!new Set(["127.0.0.1", "[::1]", "::1"]).has(url.hostname)) {
    throw new Error("certification database host must be an explicit loopback address");
  }
  const port = url.port || "5432";
  if (port !== "5432") {
    throw new Error("certification database port is not approved");
  }
  const adminDatabase = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (adminDatabase !== "postgres") {
    throw new Error("certification database admin connection must target postgres");
  }
  if (!url.username) {
    throw new Error("certification database admin role is missing");
  }
  return Object.freeze({
    url,
    hostClassification: "explicit-loopback",
    host: url.hostname,
    port: Number(port),
    adminDatabase,
  });
}

export function targetDatabaseUrl(rawAdminUrl, databaseName) {
  assertUnprotectedDatabaseName(databaseName);
  const policy = databaseAdminPolicy(rawAdminUrl);
  const target = new URL(policy.url);
  target.pathname = `/${databaseName}`;
  target.search = "";
  target.hash = "";
  return target.toString();
}

export function migrationInventory(repositoryRoot) {
  const root = path.join(repositoryRoot, "prisma/migrations");
  const migrations = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((id) => {
      const bytes = readFileSync(path.join(root, id, "migration.sql"));
      return { id, sha256: sha256(bytes), bytes: bytes.byteLength };
    });
  return Object.freeze({
    count: migrations.length,
    migrations: Object.freeze(migrations),
    aggregateSha256: sha256(canonicalJsonBytes(migrations)),
  });
}

function evidencePayload(evidence) {
  const payload = structuredClone(evidence);
  delete payload.aggregateEvidenceSha256;
  delete payload.seal;
  return payload;
}

const LEGAL_DATABASE_TRANSITIONS = Object.freeze({
  planned: new Set(["create-authorized", "failed", "abort-cleanup-in-progress"]),
  "create-authorized": new Set([
    "provisioned",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  provisioned: new Set(["migrated", "failed", "abort-cleanup-in-progress"]),
  migrated: new Set([
    "initial-empty-verified",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  "initial-empty-verified": new Set(["active"]),
  active: new Set([
    "active",
    "stable-runtime-inspected",
    "final-empty-verified",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  "stable-runtime-inspected": new Set([
    "stable-sessions-cleared",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  "stable-sessions-cleared": new Set([
    "stable-dropped",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  "stable-dropped": new Set([
    "stable-absence-verified",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  "stable-absence-verified": new Set([]),
  "final-empty-verified": new Set([
    "sessions-cleared",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  "sessions-cleared": new Set(["dropped", "failed", "abort-cleanup-in-progress"]),
  dropped: new Set(["absence-verified", "failed", "abort-cleanup-in-progress"]),
  "absence-verified": new Set(["abort-cleanup-in-progress"]),
  failed: new Set(["failed", "abort-cleanup-in-progress"]),
  "abort-cleanup-in-progress": new Set(["abort-dropped", "failed"]),
  "abort-dropped": new Set([
    "abort-absence-verified",
    "failed",
    "abort-cleanup-in-progress",
  ]),
  "abort-absence-verified": new Set([]),
});

function hasState(evidence, state) {
  return evidence.events.some((entry) => entry.state === state);
}

function serverTransportIssues(evidence) {
  const server = evidence.server;
  const native =
    server?.transportClassification === "native-loopback" &&
    server.serverAddressClassification === "loopback" &&
    server.transportAttestationSha256 === null &&
    server.transportVerificationStatus === "verified-live" &&
    server.imageClassification === null &&
    server.imageRepositoryDigestSha256 === null;
  const githubService =
    evidence.lifecycleProfile?.classification ===
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle &&
    server?.transportClassification ===
      "github-hosted-service-container-loopback-forward" &&
    server.serverAddressClassification === "attested-container-network" &&
    isSha256(server.transportAttestationSha256) &&
    server.transportVerificationStatus === "verified-live-attested" &&
    server.imageClassification === "official-postgres-major-15" &&
    isSha256(server.imageRepositoryDigestSha256) &&
    Math.floor(Number(server.serverVersionNumber) / 10_000) === 15;
  if (
    server?.hostClassification !== "explicit-loopback" ||
    !new Set(["127.0.0.1", "::1", "[::1]"]).has(server?.host) ||
    server?.port !== 5432 ||
    Number(server?.serverVersionNumber) < 140000 ||
    server?.canCreateDatabase !== true ||
    !new Set(["local-createdb", "local-superuser-createdb"]).has(
      server?.roleClassification,
    ) ||
    (!native && !githubService)
  ) {
    return ["database lifecycle server transport evidence is malformed or unapproved"];
  }
  return [];
}

export function databaseLifecycleRequiredStages(evidence) {
  const classification = evidence?.lifecycleProfile?.classification;
  if (classification === AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.lifecycle) {
    return [AUTH_SESSION_PREFLIGHT_DATABASE_STAGE];
  }
  if (classification === STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle) {
    return ["runtime-smoke"];
  }
  return [...PRODUCTION_CERTIFICATION_DATABASE_STAGE_BINDINGS];
}

function lifecycleProfileIssues(evidence) {
  const profile = evidence.lifecycleProfile;
  if (profile === undefined) return [];
  if (
    profile?.classification === "RELEASE_CERTIFICATION_DATABASE" &&
    profile?.authPreflightInvocationNonceSha256 === null
  ) {
    return [];
  }
  if (
    profile?.classification ===
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle &&
    profile?.releaseCertificationClassification ===
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.releaseCertification &&
    profile?.integrationClassification ===
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.integration &&
    profile?.authPreflightInvocationNonceSha256 === null
  ) {
    return [];
  }
  if (
    profile?.classification !==
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.lifecycle ||
    profile?.rehearsalClassification !==
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.rehearsal ||
    profile?.releaseCertificationClassification !==
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.releaseCertification ||
    profile?.integrationClassification !==
      AUTH_SESSION_PREFLIGHT_DATABASE_CLASSIFICATIONS.integration ||
    !isSha256(profile?.authPreflightInvocationNonceSha256)
  ) {
    return ["database lifecycle profile or auth-preflight invocation binding is malformed"];
  }
  return [];
}

function validRowInventory(inventory, { requireEmpty = false } = {}) {
  if (
    !inventory ||
    !Number.isSafeInteger(inventory.applicationTableCount) ||
    inventory.applicationTableCount < 0 ||
    !Number.isSafeInteger(inventory.totalRows) ||
    inventory.totalRows < 0 ||
    !Array.isArray(inventory.tables) ||
    inventory.tables.length !== inventory.applicationTableCount ||
    !isSha256(inventory.aggregateSha256) ||
    inventory.tables.some(
      (entry) =>
        typeof entry?.table !== "string" ||
        !Number.isSafeInteger(entry?.count) ||
        entry.count < 0,
    ) ||
    inventory.totalRows !==
      inventory.tables.reduce((total, entry) => total + entry.count, 0) ||
    inventory.aggregateSha256 !== sha256(canonicalJsonBytes(inventory.tables))
  ) {
    return false;
  }
  return !requireEmpty || inventory.totalRows === 0;
}

function validSessionInventory(inventory, { requireEmpty = false } = {}) {
  if (
    !inventory ||
    !Number.isSafeInteger(inventory.count) ||
    inventory.count < 0 ||
    !Array.isArray(inventory.sessions) ||
    inventory.sessions.length !== inventory.count
  ) {
    return false;
  }
  return !requireEmpty || inventory.count === 0;
}

const APP_EVENT_ATTRIBUTIONS = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.attributions,
);
const APP_EVENT_WRITERS = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.writerClassifications,
);
const APP_EVENT_TYPES = new Set([
  ...PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.browserEventTypes,
  ...PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.trustedEventTypes,
  ...PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.internalEventTypes,
  "unexpected-or-malformed-event-type",
]);
const BROWSER_APP_EVENT_TYPES = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.browserEventTypes,
);
const TRUSTED_APP_EVENT_TYPES = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.trustedEventTypes,
);
const INTERNAL_APP_EVENT_TYPES = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.internalEventTypes,
);
const BROWSER_APP_EVENT_WRITERS = new Set([
  "browser-public-ingestion",
  "browser-server-action",
]);
const APP_EVENT_STAGES = new Set([
  "runtime-smoke",
  "browser-owners",
  "unexpected-or-unbound-stage",
]);
const APP_EVENT_BROWSER_OWNERS = new Set([
  ...PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.browserOwnerIds,
  "unexpected-or-unbound-browser-owner",
]);

function appEventWriterMatchesType(entry) {
  if (BROWSER_APP_EVENT_WRITERS.has(entry.writerClassification)) {
    return BROWSER_APP_EVENT_TYPES.has(entry.eventType);
  }
  if (entry.writerClassification === "trusted-stripe-lifecycle") {
    return TRUSTED_APP_EVENT_TYPES.has(entry.eventType);
  }
  if (entry.writerClassification === "internal-server-diagnostic") {
    return INTERNAL_APP_EVENT_TYPES.has(entry.eventType);
  }
  return false;
}

function ownedAppEventAggregateExpected(entry) {
  if (entry.attribution !== "owned") return true;
  const stageExpected =
    (entry.stage === "runtime-smoke" && entry.browserOwnerId === null) ||
    (entry.stage === "browser-owners" &&
      PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.browserOwnerIds.includes(
        entry.browserOwnerId,
      ));
  return (
    stageExpected &&
    Number.isSafeInteger(entry.stageAttempt) &&
    appEventWriterMatchesType(entry)
  );
}

function validAppEventAggregate(entry) {
  return (
    exactKeys(entry, [
      "attribution",
      "browserOwnerId",
      "count",
      "createdAtRange",
      "eventType",
      "foreignOrUnbound",
      "payloadShapeExpected",
      "prohibitedPrivateData",
      "runBound",
      "stage",
      "stageAttempt",
      "writerClassification",
    ]) &&
    APP_EVENT_TYPES.has(entry.eventType) &&
    Number.isSafeInteger(entry.count) &&
    entry.count > 0 &&
    APP_EVENT_WRITERS.has(entry.writerClassification) &&
    APP_EVENT_STAGES.has(entry.stage) &&
    (entry.browserOwnerId === null ||
      APP_EVENT_BROWSER_OWNERS.has(entry.browserOwnerId)) &&
    (entry.stageAttempt === null ||
      (Number.isSafeInteger(entry.stageAttempt) && entry.stageAttempt >= 1)) &&
    exactKeys(entry.createdAtRange, ["first", "last"]) &&
    typeof entry.createdAtRange.first === "string" &&
    typeof entry.createdAtRange.last === "string" &&
    Number.isFinite(Date.parse(entry.createdAtRange.first)) &&
    Number.isFinite(Date.parse(entry.createdAtRange.last)) &&
    Date.parse(entry.createdAtRange.last) >=
      Date.parse(entry.createdAtRange.first) &&
    APP_EVENT_ATTRIBUTIONS.has(entry.attribution) &&
    entry.runBound === (entry.attribution === "owned") &&
    entry.foreignOrUnbound === !entry.runBound &&
    typeof entry.payloadShapeExpected === "boolean" &&
    (!entry.payloadShapeExpected || appEventWriterMatchesType(entry)) &&
    typeof entry.prohibitedPrivateData === "boolean" &&
    ownedAppEventAggregateExpected(entry)
  );
}

function appEventAggregateFacts(aggregates) {
  const classifications = {};
  let rowCount = 0;
  let prohibitedPrivateDataCount = 0;
  for (const entry of aggregates) {
    rowCount += entry.count;
    classifications[entry.attribution] =
      (classifications[entry.attribution] ?? 0) + entry.count;
    if (entry.prohibitedPrivateData) {
      prohibitedPrivateDataCount += entry.count;
    }
  }
  const allRunBound = aggregates.every((entry) => entry.runBound);
  const allPayloadShapesExpected = aggregates.every(
    (entry) => entry.payloadShapeExpected,
  );
  return {
    rowCount,
    classifications,
    allRunBound,
    allPayloadShapesExpected,
    prohibitedPrivateDataCount,
    valid:
      allRunBound &&
      allPayloadShapesExpected &&
      prohibitedPrivateDataCount === 0,
  };
}

function validAppEventClassifications(observed, expected, rowCount) {
  if (!observed || typeof observed !== "object" || Array.isArray(observed)) {
    return false;
  }
  const entries = Object.entries(observed);
  return (
    entries.every(
      ([classification, count]) =>
        APP_EVENT_ATTRIBUTIONS.has(classification) &&
        Number.isSafeInteger(count) &&
        count > 0 &&
        expected[classification] === count,
    ) &&
    Object.keys(expected).every(
      (classification) => observed[classification] === expected[classification],
    ) &&
    entries.reduce((total, [, count]) => total + count, 0) === rowCount
  );
}

function appEventCleanupIssues(evidence) {
  const owner = evidence.appEventCleanup;
  if (owner === undefined || owner === null) return [];
  const inspection = owner.inspection;
  const inspectionPayload = structuredClone(inspection ?? {});
  delete inspectionPayload.aggregateSha256;
  const aggregates = inspection?.aggregates;
  const aggregateCount = Array.isArray(aggregates)
    ? aggregates.reduce((total, entry) => total + (entry?.count ?? 0), 0)
    : -1;
  const aggregatesValid =
    Array.isArray(aggregates) && aggregates.every(validAppEventAggregate);
  const aggregateFacts = aggregatesValid
    ? appEventAggregateFacts(aggregates)
    : null;
  const inspectionValid =
    owner.owner === "final-database-app-event-evidence-and-cleanup" &&
    new Set(["evidence-retained", "owned-rows-removed"]).has(owner.status) &&
    inspection?.schema ===
      "interior-ai.production-certification-app-event-cleanup-evidence.v1" &&
    inspection.inspectedReadOnly === true &&
    Number.isSafeInteger(inspection.rowCount) &&
    inspection.rowCount >= 0 &&
    Number.isSafeInteger(inspection.removableRowCount) &&
    inspection.removableRowCount >= 0 &&
    inspection.removableRowCount <= inspection.rowCount &&
    aggregatesValid &&
    aggregateCount === inspection.rowCount &&
    validAppEventClassifications(
      inspection.classifications,
      aggregateFacts.classifications,
      inspection.rowCount,
    ) &&
    isSha256(inspection.rowIdentitySha256) &&
    inspection.allRunBound === aggregateFacts.allRunBound &&
    inspection.allPayloadShapesExpected ===
      aggregateFacts.allPayloadShapesExpected &&
    inspection.prohibitedPrivateDataCount ===
      aggregateFacts.prohibitedPrivateDataCount &&
    inspection.valid === aggregateFacts.valid &&
    inspection.removableRowCount ===
      (aggregateFacts.valid ? inspection.rowCount : 0) &&
    isSha256(inspection.aggregateSha256) &&
    inspection.aggregateSha256 === sha256(canonicalJsonBytes(inspectionPayload));
  if (!inspectionValid) {
    return ["database AppEvent cleanup evidence is malformed"];
  }
  const evidenceEventIndex = evidence.events.findIndex(
    (entry) =>
      entry.mode === "app-event-evidence" &&
      entry.details?.aggregateSha256 === inspection.aggregateSha256 &&
      entry.details?.evidenceRetainedBeforeRemoval === true,
  );
  const cleanupEventIndex = evidence.events.findIndex(
    (entry) => entry.mode === "app-event-cleanup",
  );
  if (evidenceEventIndex < 0) {
    return ["database AppEvent inspection was not retained before cleanup"];
  }
  if (owner.status === "evidence-retained") {
    return owner.cleanup === null && cleanupEventIndex < 0
      ? []
      : ["database AppEvent cleanup claims removal without a durable receipt"];
  }
  const cleanup = owner.cleanup;
  if (
    inspection.valid !== true ||
    inspection.allRunBound !== true ||
    inspection.allPayloadShapesExpected !== true ||
    inspection.prohibitedPrivateDataCount !== 0 ||
    inspection.removableRowCount !== inspection.rowCount ||
    !Number.isSafeInteger(cleanup?.removedCount) ||
    cleanup.removedCount !== inspection.rowCount ||
    cleanup.remainingCount !== 0 ||
    cleanup.exactOwnedRowsOnly !== true ||
    cleanupEventIndex <= evidenceEventIndex
  ) {
    return ["database AppEvent cleanup receipt is incomplete or unsafe"];
  }
  return [];
}

function semanticEvidenceIssues(evidence) {
  const issues = [];
  issues.push(...lifecycleProfileIssues(evidence));
  issues.push(...serverTransportIssues(evidence));
  issues.push(...appEventCleanupIssues(evidence));
  if (evidence.events[0]?.state !== "planned") {
    issues.push("database lifecycle must begin with planned");
  }
  for (let index = 1; index < evidence.events.length; index += 1) {
    const previous = evidence.events[index - 1].state;
    const current = evidence.events[index].state;
    if (!LEGAL_DATABASE_TRANSITIONS[previous]?.has(current)) {
      issues.push(`database lifecycle transition is illegal: ${previous} -> ${current}`);
      break;
    }
  }
  const terminal = new Set([
    "absence-verified",
    "stable-absence-verified",
    "abort-absence-verified",
  ]);
  if (evidence.complete !== terminal.has(evidence.currentState)) {
    issues.push("database lifecycle completion marker is incoherent");
  }
  if (
    !Number.isSafeInteger(evidence.revision) ||
    evidence.revision < 0 ||
    !Array.isArray(evidence.bindingHistory) ||
    evidence.bindingHistory.length !== evidence.revision ||
    evidence.bindingHistory.some(
      (entry, index) =>
        entry?.revision !== index ||
        !isSha256(entry?.aggregateEvidenceSha256) ||
        !isSha256(entry?.fileSha256) ||
        !PRODUCTION_CERTIFICATION_DATABASE_STATES.includes(entry?.lifecycleState) ||
        !Number.isSafeInteger(entry?.eventCount) ||
        entry.eventCount < 1,
    )
  ) {
    issues.push("database lifecycle revision history is malformed");
  } else if (
    (evidence.revision === 0 &&
      (evidence.currentState !== "planned" || evidence.events.length !== 1)) ||
    evidence.bindingHistory.some(
      (entry, index) =>
        (index === 0 &&
          (entry.lifecycleState !== "planned" || entry.eventCount !== 1)) ||
        (index > 0 &&
          entry.eventCount < evidence.bindingHistory[index - 1].eventCount) ||
        entry.eventCount > evidence.events.length,
    )
  ) {
    issues.push("database lifecycle revision history is semantically incoherent");
  }
  if (
    evidence.database?.classification !==
      "disposable-production-certification-test-database" ||
    evidence.database?.generatorVersion !==
      PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION ||
    !isSha256(evidence.database?.nonceSha256) ||
    !isSha256(evidence.database?.provisionAuthorizationSha256) ||
    typeof evidence.database?.generatorNonce !== "string"
  ) {
    issues.push("database lifecycle generated identity is malformed");
  } else {
    try {
      const generated = generateCertificationDatabaseName({
        certificationId: evidence.identity.certificationId,
        candidateId: evidence.identity.candidateId,
        candidateCommitSha: evidence.identity.candidateCommitSha,
        nonce: evidence.database.generatorNonce,
      });
      if (
        generated.name !== evidence.database.name ||
        generated.nameSha256 !== evidence.database.nameSha256 ||
        generated.identitySha256 !== evidence.database.identitySha256 ||
        generated.nonceSha256 !== evidence.database.nonceSha256
      ) {
        issues.push("database lifecycle generated identity is incoherent");
      }
    } catch {
      issues.push("database lifecycle generated identity is malformed");
    }
  }
  if (
    evidence.database?.provisionAuthorizationSha256 !==
    generateProvisionAuthorizationSha256({
      identity: evidence.identity,
      database: evidence.database,
    })
  ) {
    issues.push("database lifecycle provision authorization is incoherent");
  }
  const privateBinding = evidence.privateBinding;
  const privateBindingRequired = hasState(evidence, "migrated");
  const privateBindingRemoved =
    hasState(evidence, "dropped") ||
    hasState(evidence, "stable-dropped") ||
    hasState(evidence, "abort-dropped");
  const privateRoleStatuses = new Set([
    "create-authorized",
    "role-created",
    "foreign-collision",
    "sidecar-authorized",
    "foreign-sidecar-collision",
    "active",
    "removed",
    "foreign-preserved",
    "role-removed-no-sidecar",
    "role-removed-foreign-sidecar-preserved",
  ]);
  const roleCreationOutcomes = new Set([
    "authorized",
    "created",
    "ambiguous-create-recovered",
    "foreign-collision",
  ]);
  const sidecarCreationOutcomes = new Set([
    "authorized",
    "created",
    "foreign-collision",
  ]);
  const sidecarReceiptRequired = new Set([
    "sidecar-authorized",
    "foreign-sidecar-collision",
    "active",
    "removed",
    "role-removed-foreign-sidecar-preserved",
  ]).has(privateBinding?.status);
  const sidecarReceiptValid = sidecarReceiptRequired
    ? isSha256(privateBinding?.sidecarSha256) &&
      sidecarCreationOutcomes.has(privateBinding?.sidecarCreation?.outcome) &&
      typeof privateBinding?.sidecarCreation?.ownershipRecoverable === "boolean" &&
      typeof privateBinding?.sidecarCreation
        ?.sidecarAbsentImmediatelyBeforeCreate === "boolean"
    : privateBinding?.sidecarSha256 === null &&
      privateBinding?.sidecarCreation === null;
  const privateRoleShapeValid =
    privateBinding === null ||
    (privateBinding?.classification === "private-stage-login-no-admin" &&
      isSha256(privateBinding?.roleNameSha256) &&
      privateRoleStatuses.has(privateBinding?.status) &&
      roleCreationOutcomes.has(privateBinding?.roleCreation?.outcome) &&
      typeof privateBinding?.roleCreation?.ownershipRecoverable === "boolean" &&
      privateBinding?.roleCreation?.roleAbsentImmediatelyBeforeCreate === true &&
      sidecarReceiptValid);
  const activeBindingValid =
    privateBindingRequired &&
    (privateBindingRemoved
      ? new Set([
          "removed",
          "role-removed-foreign-sidecar-preserved",
        ]).has(privateBinding?.status)
      : privateBinding?.status === "active") &&
    privateBinding?.roleCreation?.ownershipRecoverable === true &&
    privateBinding?.sidecarCreation?.ownershipRecoverable === true;
  const preMigrationBindingValid =
    !privateBindingRequired &&
    (privateBinding === null ||
      new Set([
        "create-authorized",
        "role-created",
        "foreign-collision",
        "sidecar-authorized",
        "foreign-sidecar-collision",
        "removed",
        "foreign-preserved",
        "role-removed-no-sidecar",
        "role-removed-foreign-sidecar-preserved",
      ]).has(privateBinding?.status));
  if (
    !privateRoleShapeValid ||
    (!activeBindingValid && !preMigrationBindingValid)
  ) {
    issues.push("database lifecycle private stage binding is incoherent");
  }
  const requiredStages = evidence.stageBindings?.requiredStages;
  const observedStages = evidence.stageBindings?.observed;
  const expectedStages = databaseLifecycleRequiredStages(evidence);
  const authPreflightNonceSha256 =
    evidence.lifecycleProfile?.authPreflightInvocationNonceSha256 ?? null;
  if (
    JSON.stringify(requiredStages) !==
      JSON.stringify(expectedStages) ||
    !Array.isArray(observedStages) ||
    new Set(observedStages?.map((binding) => binding?.stage)).size !==
      observedStages?.length ||
    observedStages?.some(
      (binding) =>
        !expectedStages.includes(binding?.stage) ||
        binding?.databaseIdentitySha256 !== evidence.database.identitySha256 ||
        binding?.databaseNameSha256 !== evidence.database.nameSha256 ||
        (binding?.stage === AUTH_SESSION_PREFLIGHT_DATABASE_STAGE &&
          binding?.authPreflightInvocationNonceSha256 !==
            authPreflightNonceSha256) ||
        typeof binding?.boundAt !== "string" ||
        !Number.isFinite(Date.parse(binding.boundAt)),
    )
  ) {
    issues.push("database lifecycle stage bindings are malformed or foreign");
  } else {
    const bindEvents = evidence.events.filter(
      (entry) => entry.mode === "bind-stage" && entry.state === "active",
    );
    if (
      bindEvents.length !== observedStages.length ||
      observedStages.some(
        (binding) =>
          !bindEvents.some(
            (entry) =>
              entry.details?.stage === binding.stage &&
              entry.details?.databaseIdentitySha256 ===
                evidence.database.identitySha256 &&
              entry.details?.databaseNameSha256 === evidence.database.nameSha256 &&
              (binding.stage !== AUTH_SESSION_PREFLIGHT_DATABASE_STAGE ||
                entry.details?.authPreflightInvocationNonceSha256 ===
                  authPreflightNonceSha256) &&
              entry.at === binding.boundAt,
          ),
      )
    ) {
      issues.push("database lifecycle stage binding events are incoherent");
    }
  }
  const createAuthorization = evidence.events.find(
    (entry) => entry.state === "create-authorized",
  );
  if (
    (hasState(evidence, "create-authorized") || hasState(evidence, "provisioned")) &&
    (createAuthorization?.details?.targetAbsentImmediatelyBeforeCreate !== true ||
      createAuthorization?.details?.provisionAuthorizationSha256 !==
        evidence.database.provisionAuthorizationSha256 ||
      typeof evidence.provisioning?.outcome !== "string" ||
      typeof evidence.provisioning?.ownershipRecoverable !== "boolean")
  ) {
    issues.push("database lifecycle create authorization is incoherent");
  }
  const provisioned = evidence.events.find((entry) => entry.state === "provisioned");
  if (
    hasState(evidence, "provisioned") &&
    (provisioned?.details?.created !== true ||
      provisioned?.details?.provisionAuthorizationSha256 !==
        evidence.database.provisionAuthorizationSha256 ||
      evidence.provisioning?.ownershipRecoverable !== true)
  ) {
    issues.push("database lifecycle provision evidence is incoherent");
  }
  if (
    hasState(evidence, "migrated") &&
    (evidence.migration?.owner !== "prisma-migrate-deploy" ||
      evidence.migration?.count !== 43 ||
      !isSha256(evidence.migration?.sourceAggregateSha256) ||
      !isSha256(evidence.migration?.appliedNamesSha256) ||
      evidence.migration?.targetIdentitySha256 !== evidence.database.identitySha256)
  ) {
    issues.push("database lifecycle migration evidence is incoherent");
  }
  if (
    hasState(evidence, "initial-empty-verified") &&
    (!validRowInventory(evidence.inventories?.initial, { requireEmpty: true }) ||
      !validSessionInventory(evidence.sessions?.initial, { requireEmpty: true }))
  ) {
    issues.push("database lifecycle initial-empty evidence is incoherent");
  }
  if (
    hasState(evidence, "final-empty-verified") &&
    (!validRowInventory(evidence.inventories?.final, { requireEmpty: true }) ||
      !validSessionInventory(evidence.sessions?.final, { requireEmpty: true }) ||
      (evidence.lifecycleProfile?.classification ===
        "RELEASE_CERTIFICATION_DATABASE" &&
        evidence.appEventCleanup?.status !== "owned-rows-removed"))
  ) {
    issues.push("database lifecycle final-empty evidence is incoherent");
  }
  if (
    hasState(evidence, "stable-runtime-inspected") &&
    (evidence.lifecycleProfile?.classification !==
      STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle ||
      !validRowInventory(evidence.inventories?.final) ||
      !validSessionInventory(evidence.sessions?.final, { requireEmpty: true }) ||
      evidence.stageBindings.observed.length !== 1 ||
      evidence.stageBindings.observed[0]?.stage !== "runtime-smoke")
  ) {
    issues.push("stable runtime-smoke database inspection is incoherent");
  }
  if (
    hasState(evidence, "stable-sessions-cleared") &&
    evidence.sessions?.release?.remainingSessionCount !== 0
  ) {
    issues.push("stable runtime-smoke session-release evidence is incoherent");
  }
  if (
    hasState(evidence, "stable-dropped") &&
    (evidence.cleanup?.mode !== "stable-runtime-smoke" ||
      evidence.cleanup?.drop?.dropped !== true ||
      evidence.cleanup?.stageRole?.dropped !== true)
  ) {
    issues.push("stable runtime-smoke database drop evidence is incoherent");
  }
  if (
    hasState(evidence, "stable-absence-verified") &&
    (evidence.cleanup?.mode !== "stable-runtime-smoke" ||
      evidence.cleanup?.targetAbsent !== true ||
      evidence.cleanup?.originalFailureRetained !== false ||
      evidence.events.find(
        (entry) => entry.state === "stable-absence-verified",
      )?.details?.cleanupMode !== "stable-runtime-smoke")
  ) {
    issues.push("stable runtime-smoke database absence evidence is incoherent");
  }
  if (
    hasState(evidence, "sessions-cleared") &&
    evidence.sessions?.release?.remainingSessionCount !== 0
  ) {
    issues.push("database lifecycle session-release evidence is incoherent");
  }
  if (
    hasState(evidence, "dropped") &&
    evidence.events.find((entry) => entry.state === "dropped")?.details?.dropped !== true
  ) {
    issues.push("database lifecycle normal drop evidence is incoherent");
  }
  if (
    hasState(evidence, "absence-verified") &&
    (evidence.events.find((entry) => entry.state === "absence-verified")?.details
      ?.targetAbsent !== true ||
      evidence.events.find((entry) => entry.state === "absence-verified")?.details
        ?.cleanupMode !== "normal")
  ) {
    issues.push("database lifecycle normal absence evidence is incoherent");
  }
  if (
    evidence.currentState.startsWith("abort-") &&
    evidence.failure === null
  ) {
    issues.push("database lifecycle abort evidence lost the original failure");
  }
  if (evidence.failure?.originalStage === "runtime-smoke") {
    const references = evidence.failure.evidenceReferences;
    const consumedRuntimeFailure =
      evidence.failure.consumedSubstantiveGate === true;
    if (
      (consumedRuntimeFailure &&
        (!Number.isSafeInteger(evidence.failure.attempt) ||
          evidence.failure.attempt < 1 ||
          !isSha256(evidence.failure.failedStateSha256) ||
          typeof evidence.failure.classification !== "string" ||
          !evidence.failure.classification ||
          !references?.["runtime-start"])) ||
      (references !== undefined &&
        (!references ||
          typeof references !== "object" ||
          Array.isArray(references) ||
          Object.values(references).some(
            (descriptor) =>
              typeof descriptor?.path !== "string" ||
              path.isAbsolute(descriptor.path) ||
              descriptor.path.includes("\\") ||
              descriptor.path === ".." ||
              descriptor.path.startsWith("../") ||
              !isSha256(descriptor.sha256),
          )))
    ) {
      issues.push(
        "database lifecycle runtime failure attribution is incomplete",
      );
    }
  }
  if (evidence.failure?.originalStage === "database:verify-final") {
    const snapshot =
      evidence.failure.evidenceReferences?.["database-final-failure"];
    const afterAbort = hasState(evidence, "abort-cleanup-in-progress");
    if (
      evidence.failure.classification !== "DATABASE_LIFECYCLE_FAILURE" ||
      !Number.isSafeInteger(evidence.failure.attempt) ||
      evidence.failure.attempt < 1 ||
      evidence.failure.consumedSubstantiveGate !== true ||
      (afterAbort
        ? !isSha256(evidence.failure.failedStateSha256) ||
          typeof snapshot?.path !== "string" ||
          path.isAbsolute(snapshot.path) ||
          snapshot.path.includes("\\") ||
          !isSha256(snapshot.sha256)
        : evidence.failure.failedStateSha256 !== null ||
          Object.keys(evidence.failure.evidenceReferences ?? {}).length !== 0)
    ) {
      issues.push(
        "database final-verification failure attribution is incomplete",
      );
    }
  }
  const abortDropped = evidence.events.filter(
    (entry) => entry.state === "abort-dropped",
  );
  const abortObservedTarget = abortDropped.some(
    (entry) => entry.details?.targetWasPresent === true,
  );
  const successfulDropMustBeRetained =
    abortObservedTarget || hasState(evidence, "dropped");
  if (
    abortDropped.length > 0 &&
    (evidence.cleanup?.mode !== "abort" ||
      (successfulDropMustBeRetained
        ? evidence.cleanup?.drop?.dropped !== true
        : evidence.cleanup?.drop?.alreadyAbsent !== true))
  ) {
    issues.push("database lifecycle abort drop evidence is incoherent");
  }
  if (
    hasState(evidence, "abort-absence-verified") &&
    (evidence.cleanup?.mode !== "abort" ||
      typeof evidence.cleanup?.drop?.dropped !== "boolean" ||
      evidence.cleanup?.targetAbsent !== true ||
      evidence.cleanup?.originalFailureRetained !== true ||
      evidence.cleanup?.failedRunRehabilitated !== false)
  ) {
    issues.push("database lifecycle abort absence evidence is incoherent");
  }
  return issues;
}

export function sealDatabaseLifecycleEvidence(evidence) {
  const payload = evidencePayload(evidence);
  const aggregateEvidenceSha256 = sha256(canonicalJsonBytes(payload));
  const withAggregate = { ...payload, aggregateEvidenceSha256 };
  return {
    ...withAggregate,
    seal: {
      algorithm: "sha256",
      sha256: sha256(
        Buffer.concat([
          Buffer.from(PRODUCTION_CERTIFICATION_DATABASE_EVIDENCE_DOMAIN),
          canonicalJsonBytes(withAggregate),
        ]),
      ),
    },
  };
}

export function databaseLifecycleEvidenceIssues(evidence) {
  const issues = [];
  if (
    evidence?.schema !== PRODUCTION_CERTIFICATION_DATABASE_LIFECYCLE_SCHEMA ||
    evidence?.version !== PRODUCTION_CERTIFICATION_DATABASE_CONTRACT_VERSION ||
    !isCanonicalIdentity(evidence?.identity?.certificationId) ||
    !isCanonicalIdentity(evidence?.identity?.candidateId) ||
    !isSourceSha(evidence?.identity?.candidateCommitSha) ||
    !isSourceSha(evidence?.identity?.candidateTreeSha) ||
    !isCanonicalCertificationDatabaseName(evidence?.database?.name) ||
    !isSha256(evidence?.database?.nameSha256) ||
    !isSha256(evidence?.database?.identitySha256) ||
    !PRODUCTION_CERTIFICATION_DATABASE_STATES.includes(evidence?.currentState) ||
    !Array.isArray(evidence?.events) ||
    evidence.events.length === 0 ||
    evidence.events.some(
      (event) =>
        !PRODUCTION_CERTIFICATION_DATABASE_STATES.includes(event?.state) ||
        typeof event?.mode !== "string" ||
        typeof event?.at !== "string",
    ) ||
    !isSha256(evidence?.aggregateEvidenceSha256) ||
    evidence?.seal?.algorithm !== "sha256" ||
    !isSha256(evidence?.seal?.sha256)
  ) {
    issues.push("database lifecycle evidence shape is malformed");
  }
  if (issues.length === 0) {
    const sealed = sealDatabaseLifecycleEvidence(evidence);
    if (
      sealed.aggregateEvidenceSha256 !== evidence.aggregateEvidenceSha256 ||
      sealed.seal.sha256 !== evidence.seal.sha256 ||
      evidence.database.nameSha256 !== sha256(evidence.database.name) ||
      evidence.events.at(-1)?.state !== evidence.currentState
    ) {
      issues.push("database lifecycle evidence seal or terminal state is inconsistent");
    }
  }
  if (issues.length === 0) issues.push(...semanticEvidenceIssues(evidence));
  if (
    JSON.stringify(evidence).match(
      /postgres(?:ql)?:\/\/|:\/\/[^\s\"'/:]+:[^\s\"'@/]+@|\b(?:password|passwd|pwd)\s*[:=]\s*[^\s,}\]]+/i,
    )
  ) {
    issues.push("database lifecycle evidence contains a prohibited URL or credential field");
  }
  return issues;
}

export function createDatabaseLifecycleBinding(evidence, descriptor) {
  const issues = databaseLifecycleEvidenceIssues(evidence);
  if (issues.length > 0) throw new Error(issues.join("; "));
  if (
    typeof descriptor?.path !== "string" ||
    !isSha256(descriptor?.sha256)
  ) {
    throw new Error("database lifecycle evidence descriptor is malformed");
  }
  return Object.freeze({
    schema: PRODUCTION_CERTIFICATION_DATABASE_BINDING_SCHEMA,
    certificationId: evidence.identity.certificationId,
    candidateId: evidence.identity.candidateId,
    candidateCommitSha: evidence.identity.candidateCommitSha,
    candidateTreeSha: evidence.identity.candidateTreeSha,
    databaseName: evidence.database.name,
    databaseNameSha256: evidence.database.nameSha256,
    databaseIdentitySha256: evidence.database.identitySha256,
    lifecycleState: evidence.currentState,
    evidence: { ...descriptor },
    updatedAt: evidence.updatedAt,
  });
}
