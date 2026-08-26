import { createHash } from "node:crypto";

import {
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT,
  canonicalJsonBytes,
  isCanonicalIdentity,
  isSha256,
  isSourceSha,
} from "./production-certification-database-contract.mjs";

export const CERTIFICATION_APP_EVENT_BINDING_KEY =
  "certificationRunBinding";
export const CERTIFICATION_APP_EVENT_BINDING_SCHEMA =
  "interior-ai.production-certification-app-event-binding.v1";
export const CERTIFICATION_APP_EVENT_EVIDENCE_SCHEMA =
  "interior-ai.production-certification-app-event-cleanup-evidence.v1";

const BROWSER_EVENT_TYPES = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.browserEventTypes,
);
const TRUSTED_EVENT_TYPES = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.trustedEventTypes,
);
const INTERNAL_EVENT_TYPES = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.internalEventTypes,
);
const BROWSER_OWNERS = new Set(
  PRODUCTION_CERTIFICATION_APP_EVENT_CONTRACT.browserOwnerIds,
);
const BINDING_KEYS = [
  "browserOwnerId",
  "candidateId",
  "certificationId",
  "commitSha",
  "runIdentitySha256",
  "schema",
  "stage",
  "stageAttempt",
  "treeSha",
  "writerClassification",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function writerClassification(row) {
  if (
    row.authority === "BROWSER_AUTHORIZED_ANALYTICS" &&
    row.producer === "PUBLIC_BROWSER_INGESTION" &&
    row.verificationMethod === "PUBLIC_REQUEST" &&
    BROWSER_EVENT_TYPES.has(row.eventType)
  ) return "browser-public-ingestion";
  if (
    row.authority === "BROWSER_AUTHORIZED_ANALYTICS" &&
    row.producer === "SERVER_APPLICATION" &&
    row.verificationMethod === "SERVER_ACTION" &&
    BROWSER_EVENT_TYPES.has(row.eventType)
  ) return "browser-server-action";
  if (
    row.authority === "INTERNAL_DIAGNOSTIC" &&
    row.producer === "SERVER_APPLICATION" &&
    row.verificationMethod === "SERVER_ACTION" &&
    INTERNAL_EVENT_TYPES.has(row.eventType)
  ) return "internal-server-diagnostic";
  if (
    row.authority === "TRUSTED_SERVER_LIFECYCLE" &&
    row.producer === "VERIFIED_STRIPE_WEBHOOK" &&
    row.verificationMethod === "STRIPE_SIGNATURE" &&
    TRUSTED_EVENT_TYPES.has(row.eventType)
  ) return "trusted-stripe-lifecycle";
  return null;
}

function expectedRunIdentity(binding) {
  return sha256(`${JSON.stringify([
    binding.schema,
    binding.certificationId,
    binding.candidateId,
    binding.commitSha,
    binding.treeSha,
    binding.stage,
    binding.stageAttempt,
    binding.browserOwnerId,
    binding.writerClassification,
  ])}\n`);
}

function bindingClassification(row, ownership) {
  const binding = row.binding;
  const writer = writerClassification(row);
  if (!exactKeys(binding, BINDING_KEYS)) return "unbound-or-malformed";
  if (
    binding.schema !== CERTIFICATION_APP_EVENT_BINDING_SCHEMA ||
    !isCanonicalIdentity(binding.certificationId) ||
    !isCanonicalIdentity(binding.candidateId) ||
    !isSourceSha(binding.commitSha) ||
    !isSourceSha(binding.treeSha) ||
    !Number.isSafeInteger(binding.stageAttempt) ||
    binding.stageAttempt < 1 ||
    !isSha256(binding.runIdentitySha256) ||
    expectedRunIdentity(binding) !== binding.runIdentitySha256 ||
    writer === null ||
    binding.writerClassification !== writer
  ) return "unbound-or-malformed";
  if (
    binding.certificationId !== ownership.certificationId ||
    binding.candidateId !== ownership.candidateId ||
    binding.commitSha !== ownership.commitSha ||
    binding.treeSha !== ownership.treeSha
  ) return "foreign-identity";
  if (
    binding.stage === "runtime-smoke" &&
    binding.browserOwnerId === null &&
    binding.stageAttempt === ownership.runtimeAttempt
  ) return "owned";
  if (
    binding.stage === "browser-owners" &&
    BROWSER_OWNERS.has(binding.browserOwnerId) &&
    ownership.browserOwnerIds.includes(binding.browserOwnerId) &&
    binding.stageAttempt === ownership.browserAttempt
  ) return "owned";
  return "foreign-stage-or-run";
}

function payloadShapeExpected(row, writer) {
  if (writer === null) return false;
  const trusted = writer === "trusted-stripe-lifecycle";
  return (
    row.provenanceVersion === 1 &&
    row.shareTokenNull === true &&
    row.metaObject === true &&
    (trusted
      ? /^evt_[A-Za-z0-9_]+$/.test(row.externalEventId ?? "")
      : row.externalEventId === null)
  );
}

function safeRow(row, ownership) {
  const writer = writerClassification(row);
  const attribution = bindingClassification(row, ownership);
  const binding = exactKeys(row.binding, BINDING_KEYS) ? row.binding : null;
  const expectedEventType =
    BROWSER_EVENT_TYPES.has(row.eventType) ||
    TRUSTED_EVENT_TYPES.has(row.eventType) ||
    INTERNAL_EVENT_TYPES.has(row.eventType);
  const safeStage = new Set(["runtime-smoke", "browser-owners"]).has(
    binding?.stage,
  )
    ? binding.stage
    : "unexpected-or-unbound-stage";
  const safeBrowserOwnerId =
    binding?.browserOwnerId === null ||
    BROWSER_OWNERS.has(binding?.browserOwnerId)
      ? binding.browserOwnerId
      : "unexpected-or-unbound-browser-owner";
  return {
    id: typeof row.id === "string" ? row.id : "<malformed-row-id>",
    eventType: expectedEventType
      ? row.eventType
      : "unexpected-or-malformed-event-type",
    writerClassification: writer ?? "unexpected-writer-contract",
    stage: safeStage,
    browserOwnerId: safeBrowserOwnerId,
    stageAttempt: Number.isSafeInteger(binding?.stageAttempt)
      ? binding.stageAttempt
      : null,
    createdAt: row.createdAt,
    runBound: attribution === "owned",
    attribution,
    payloadShapeExpected: payloadShapeExpected(row, writer),
    prohibitedPrivateData: row.prohibitedPrivateData === true,
  };
}

function aggregateRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.eventType,
      row.writerClassification,
      row.stage,
      row.browserOwnerId,
      row.stageAttempt,
      row.runBound,
      row.attribution,
      row.payloadShapeExpected,
      row.prohibitedPrivateData,
    ]);
    const group = groups.get(key) ?? {
      eventType: row.eventType,
      count: 0,
      writerClassification: row.writerClassification,
      stage: row.stage,
      browserOwnerId: row.browserOwnerId,
      stageAttempt: row.stageAttempt,
      createdAtRange: { first: row.createdAt, last: row.createdAt },
      runBound: row.runBound,
      attribution: row.attribution,
      foreignOrUnbound: row.attribution !== "owned",
      payloadShapeExpected: row.payloadShapeExpected,
      prohibitedPrivateData: row.prohibitedPrivateData,
    };
    group.count += 1;
    if (row.createdAt < group.createdAtRange.first) {
      group.createdAtRange.first = row.createdAt;
    }
    if (row.createdAt > group.createdAtRange.last) {
      group.createdAtRange.last = row.createdAt;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

export function inspectCertificationAppEvents(rows, ownership) {
  const safeRows = rows.map((row) => safeRow(row, ownership));
  const classifications = Object.fromEntries(
    [...new Set(safeRows.map((row) => row.attribution))]
      .sort()
      .map((classification) => [
        classification,
        safeRows.filter((row) => row.attribution === classification).length,
      ])
  );
  const removable = safeRows.filter(
    (row) =>
      row.attribution === "owned" &&
      row.payloadShapeExpected &&
      !row.prohibitedPrivateData
  );
  const valid = removable.length === safeRows.length;
  const rowIdentity = safeRows
    .map((row) => ({ ...row }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const evidence = {
    schema: CERTIFICATION_APP_EVENT_EVIDENCE_SCHEMA,
    inspectedReadOnly: true,
    rowCount: safeRows.length,
    removableRowCount: valid ? removable.length : 0,
    classifications,
    aggregates: aggregateRows(safeRows),
    rowIdentitySha256: sha256(canonicalJsonBytes(rowIdentity)),
    allRunBound: safeRows.every((row) => row.runBound),
    allPayloadShapesExpected: safeRows.every(
      (row) => row.payloadShapeExpected
    ),
    prohibitedPrivateDataCount: safeRows.filter(
      (row) => row.prohibitedPrivateData
    ).length,
    valid,
  };
  return {
    valid,
    evidence: {
      ...evidence,
      aggregateSha256: sha256(canonicalJsonBytes(evidence)),
    },
    removableIds: valid ? removable.map((row) => row.id).sort() : [],
  };
}

export function certificationAppEventRowsSha256(rows, ownership) {
  return inspectCertificationAppEvents(rows, ownership).evidence.rowIdentitySha256;
}
