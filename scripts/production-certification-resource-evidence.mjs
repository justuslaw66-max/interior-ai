import path from "node:path";

import {
  PRODUCTION_CERTIFICATION_RESOURCE_PREPARATION_EVIDENCE_SCHEMA,
  canonicalJsonBytes,
  isCanonicalUtcTimestamp,
  isSha256,
  sha256Bytes,
} from "./production-certification-contract.mjs";

const EVIDENCE_SEAL_DOMAIN =
  "interior-ai.production-certification-resource-preparation-seal.v1\n";
const PROBE_SCHEMA =
  "interior-ai.production-certification-resource-sibling-probe.v1";
const EVIDENCE_KEYS = Object.freeze([
  "schema",
  "version",
  "certificationId",
  "candidate",
  "harnessSourceSha256",
  "stateShaBeforePreparation",
  "contractMatrixSha256",
  "resourceContractSha256",
  "destinationIds",
  "destinationSetSha256",
  "destinations",
  "startedAt",
  "completedAt",
  "completionMarker",
  "aggregateEvidenceSha256",
  "seal",
]);
const RESULT_KEYS = Object.freeze([
  "id",
  "lifecycleStage",
  "targetType",
  "destinationClass",
  "portableRelativePath",
  "pathContractSha256",
  "targetIdentitySha256",
  "parent",
  "externalRootContained",
  "targetAbsent",
  "siblingProbe",
]);

function exactKeys(value, keys) {
  return (
    value &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function evidencePayload({ state, stateSha256, plan, results, timestamps }) {
  return {
    schema: PRODUCTION_CERTIFICATION_RESOURCE_PREPARATION_EVIDENCE_SCHEMA,
    version: 1,
    certificationId: state.certificationId,
    candidate: state.candidate,
    harnessSourceSha256: state.harness.sourceSha256,
    stateShaBeforePreparation: stateSha256,
    contractMatrixSha256: plan.contractMatrixSha256,
    resourceContractSha256: plan.resourceContractSha256,
    destinationIds: plan.destinations.map((entry) => entry.id),
    destinationSetSha256: plan.destinationSetSha256,
    destinations: results,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    completionMarker: "complete",
  };
}

function sealPreparationEvidence(payload) {
  const aggregateEvidenceSha256 = sha256Bytes(canonicalJsonBytes(payload));
  const sealedPayload = { ...payload, aggregateEvidenceSha256 };
  return {
    ...sealedPayload,
    seal: {
      algorithm: "sha256",
      sha256: sha256Bytes(
        Buffer.concat([
          Buffer.from(EVIDENCE_SEAL_DOMAIN),
          canonicalJsonBytes(sealedPayload),
        ]),
      ),
    },
  };
}

export function createPreparationEvidence(options) {
  return sealPreparationEvidence(evidencePayload(options));
}

export function preparationTimestamps(state, environment, clock) {
  const custom = [
    environment.CERTIFICATION_RESOURCE_PREPARATION_STARTED_AT,
    environment.CERTIFICATION_RESOURCE_PREPARATION_COMPLETED_AT,
  ];
  if (custom.some(Boolean)) {
    if (
      state.executionClass !== "deterministic-simulation" ||
      environment.CERTIFICATION_QUALIFICATION_MODE !== "1" ||
      custom.some((value) => !isCanonicalUtcTimestamp(value))
    ) {
      throw new Error("custom resource preparation timestamps are prohibited");
    }
    return { startedAt: custom[0], completedAt: custom[1] };
  }
  return { startedAt: clock().toISOString(), completedAt: clock().toISOString() };
}

export function resourceSiblingProbeContract(destination) {
  const base = `.certification-resource-${destination.id}-${destination.pathContractSha256.slice(0, 12)}.probe`;
  const portableParent = path.posix.dirname(destination.portableRelativePath);
  const portableProbePath =
    portableParent === "." ? base : path.posix.join(portableParent, base);
  const bytes = canonicalJsonBytes({
    schema: PROBE_SCHEMA,
    destinationId: destination.id,
    targetIdentitySha256: destination.targetIdentitySha256,
  });
  return {
    bytes,
    sha256: sha256Bytes(bytes),
    portableProbePath,
    portableStagingPath: `${portableProbePath}.tmp`,
  };
}

export function preparationEvidenceIssues(evidence) {
  const issues = [];
  const payload = structuredClone(evidence ?? {});
  delete payload.seal;
  const aggregate = payload.aggregateEvidenceSha256;
  delete payload.aggregateEvidenceSha256;
  if (
    !exactKeys(evidence, EVIDENCE_KEYS) ||
    evidence?.schema !== PRODUCTION_CERTIFICATION_RESOURCE_PREPARATION_EVIDENCE_SCHEMA ||
    evidence?.version !== 1 ||
    evidence?.completionMarker !== "complete" ||
    !isSha256(aggregate) ||
    aggregate !== sha256Bytes(canonicalJsonBytes(payload)) ||
    !exactKeys(evidence?.seal, ["algorithm", "sha256"]) ||
    evidence.seal.algorithm !== "sha256" ||
    evidence.seal.sha256 !== sealPreparationEvidence(payload).seal.sha256
  ) {
    issues.push("certification resource preparation evidence seal is invalid");
  }
  if (
    !isCanonicalUtcTimestamp(evidence?.startedAt) ||
    !isCanonicalUtcTimestamp(evidence?.completedAt) ||
    Date.parse(evidence?.completedAt) < Date.parse(evidence?.startedAt) ||
    !Array.isArray(evidence?.destinationIds) ||
    !Array.isArray(evidence?.destinations) ||
    evidence.destinationIds.length !== 17 ||
    evidence.destinations.length !== 17 ||
    !isSha256(evidence?.stateShaBeforePreparation) ||
    !isSha256(evidence?.contractMatrixSha256) ||
    !isSha256(evidence?.resourceContractSha256) ||
    !isSha256(evidence?.destinationSetSha256)
  ) {
    issues.push("certification resource preparation evidence fields are malformed");
  }
  return issues;
}

export function preparationEvidenceBindingIssues({ evidence, state, plan }) {
  const issues = [];
  if (
    evidence?.certificationId !== state.certificationId ||
    JSON.stringify(evidence?.candidate) !== JSON.stringify(state.candidate) ||
    evidence?.harnessSourceSha256 !== state.harness.sourceSha256 ||
    evidence?.stateShaBeforePreparation !==
      state.resourcePreparation?.stateShaBeforePreparation ||
    evidence?.contractMatrixSha256 !== plan.contractMatrixSha256 ||
    evidence?.resourceContractSha256 !== plan.resourceContractSha256 ||
    evidence?.destinationSetSha256 !== plan.destinationSetSha256 ||
    JSON.stringify(evidence?.destinationIds) !==
      JSON.stringify(plan.destinations.map((entry) => entry.id))
  ) {
    issues.push("certification resource preparation belongs to another state or contract");
  }
  for (const [index, destination] of plan.destinations.entries()) {
    const result = evidence?.destinations?.[index];
    const probe = resourceSiblingProbeContract(destination);
    if (
      !exactKeys(result, RESULT_KEYS) ||
      result?.id !== destination.id ||
      result?.lifecycleStage !== destination.lifecycleStage ||
      result?.targetType !== destination.targetType ||
      result?.destinationClass !== destination.destinationClass ||
      result?.portableRelativePath !== destination.portableRelativePath ||
      result?.pathContractSha256 !== destination.pathContractSha256 ||
      result?.targetIdentitySha256 !== destination.targetIdentitySha256 ||
      !exactKeys(result?.parent, [
        "existedBefore",
        "createdByPreparation",
        "exists",
        "writable",
        "realpathClass",
      ]) ||
      typeof result.parent.existedBefore !== "boolean" ||
      result.parent.createdByPreparation !== !result.parent.existedBefore ||
      result.parent.exists !== true ||
      result.parent.writable !== true ||
      result.parent.realpathClass !== "authorized-external-root" ||
      result?.externalRootContained !== true ||
      result?.targetAbsent !== true ||
      !exactKeys(result?.siblingProbe, [
        "required",
        "passed",
        "sha256",
        "portableProbePath",
        "portableStagingPath",
        "removed",
      ]) ||
      result.siblingProbe.required !== true ||
      result.siblingProbe.passed !== true ||
      result.siblingProbe.sha256 !== probe.sha256 ||
      result.siblingProbe.portableProbePath !== probe.portableProbePath ||
      result.siblingProbe.portableStagingPath !== probe.portableStagingPath ||
      result.siblingProbe.removed !== true
    ) {
      issues.push(`certification resource preparation result is malformed: ${destination.id}`);
    }
  }
  return issues;
}
