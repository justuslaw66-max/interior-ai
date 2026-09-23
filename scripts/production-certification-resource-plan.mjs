import { realpathSync } from "node:fs";
import path from "node:path";

import {
  PRODUCTION_CERTIFICATION_RESOURCE_PLAN_SCHEMA,
  canonicalJsonBytes,
  isSha256,
  resourcePreparationContract,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  resolveCertificationExternalDestination,
  resolvePlaywrightReportPath,
  resolveRequiredTestReportPath,
  resolveRuntimeSmokeEvidencePath,
} from "./playwright-report-path.mjs";

const DESTINATION_KEYS = Object.freeze([
  "id",
  "lifecycleStage",
  "targetType",
  "destinationClass",
  "portableRelativePath",
  "pathContractSha256",
  "targetIdentitySha256",
  "targetMustRemainAbsent",
  "siblingAtomicWriteProbeRequired",
]);

function exactKeys(value, keys) {
  return (
    value &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function sanitizedFilesystemError(error, context) {
  if (typeof error?.code === "string") {
    return new Error(`${context} (${error.code})`);
  }
  return error instanceof Error ? error : new Error(context);
}

function requiredDestinationPath(definition, evidenceRoot, environment) {
  if (definition.environmentName !== null) {
    const value = environment[definition.environmentName];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(
        `certification resource destination requires ${definition.environmentName}`,
      );
    }
    return value;
  }
  return path.join(evidenceRoot, definition.relativePath);
}

function strictCanonicalDestination({
  definition,
  requestedPath,
  repositoryRoot,
  evidenceRoot,
  additionalRepositoryRoots,
}) {
  if (definition.resolver === "runtime-smoke") {
    return resolveRuntimeSmokeEvidencePath({
      requestedPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      outputRole: definition.outputRole,
      additionalRepositoryRoots,
    });
  }
  if (definition.resolver === "playwright-report") {
    return resolvePlaywrightReportPath({
      requestedPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      additionalRepositoryRoots,
    });
  }
  if (definition.resolver === "required-test-report") {
    return resolveRequiredTestReportPath({
      requestedPath,
      repositoryRoot,
      authorizedExternalRoot: evidenceRoot,
      gateId: definition.gateId,
      additionalRepositoryRoots,
    });
  }
  return resolveCertificationExternalDestination({
    requestedPath,
    repositoryRoot,
    authorizedExternalRoot: evidenceRoot,
    additionalRepositoryRoots,
    targetType: definition.targetType,
    expectedSuffix: definition.expectedSuffix,
    requireExistingParent: true,
  });
}

function assertUniqueDestinations(destinations) {
  const sorted = [...destinations].sort((left, right) =>
    left.outputPath.localeCompare(right.outputPath),
  );
  for (const [index, left] of sorted.entries()) {
    for (const right of sorted.slice(index + 1)) {
      if (left.outputPath === right.outputPath) {
        throw new Error(`duplicate certification resource destination: ${right.id}`);
      }
      if (
        (left.targetType === "directory" &&
          right.outputPath.startsWith(`${left.outputPath}${path.sep}`)) ||
        (right.targetType === "directory" &&
          left.outputPath.startsWith(`${right.outputPath}${path.sep}`))
      ) {
        throw new Error(
          `conflicting certification resource destination types: ${left.id}, ${right.id}`,
        );
      }
    }
  }
}

export function resolveCertificationResourceDestinations({
  repositoryRoot,
  evidenceRoot,
  environment,
  requireExistingParents = false,
  additionalRepositoryRoots = [],
}) {
  const contract = resourcePreparationContract(repositoryRoot);
  let rootRealpath;
  try {
    rootRealpath = realpathSync(evidenceRoot);
  } catch (error) {
    throw sanitizedFilesystemError(
      error,
      "certification resource external-root validation failed",
    );
  }
  const rootIdentitySha256 = sha256Bytes(rootRealpath);
  const destinations = contract.destinations.map((definition) => {
    try {
      const requestedPath = requiredDestinationPath(
        definition,
        evidenceRoot,
        environment,
      );
      const preparable = resolveCertificationExternalDestination({
        requestedPath,
        repositoryRoot,
        authorizedExternalRoot: evidenceRoot,
        additionalRepositoryRoots,
        targetType: definition.targetType,
        expectedSuffix: definition.expectedSuffix,
        requireExistingParent: requireExistingParents,
      });
      const canonical = requireExistingParents
        ? strictCanonicalDestination({
            definition,
            requestedPath,
            repositoryRoot,
            evidenceRoot,
            additionalRepositoryRoots,
          })
        : preparable;
      const portableRelativePath = preparable.portableRelativePath;
      return Object.freeze({
        id: definition.id,
        definition,
        outputPath: preparable.outputPath,
        parentPath: preparable.parentPath,
        parentExists: preparable.parentExists,
        parentRealpath: canonical.parentRealpath ?? preparable.parentRealpath,
        targetType: definition.targetType,
        lifecycleStage: definition.lifecycleStage,
        destinationClass: "certification-external-evidence-root",
        portableRelativePath,
        pathContractSha256: contract.destinationContractSha256[definition.id],
        targetIdentitySha256: sha256Bytes(
          canonicalJsonBytes({ rootIdentitySha256, portableRelativePath }),
        ),
      });
    } catch (error) {
      const safeError = sanitizedFilesystemError(
        error,
        "certification resource filesystem validation failed",
      );
      throw new Error(
        `${definition.id}: ${safeError.message}`,
      );
    }
  });
  assertUniqueDestinations(destinations);
  return Object.freeze({ contract, rootIdentitySha256, destinations });
}

function portableDestination(destination) {
  return {
    id: destination.id,
    lifecycleStage: destination.lifecycleStage,
    targetType: destination.targetType,
    destinationClass: destination.destinationClass,
    portableRelativePath: destination.portableRelativePath,
    pathContractSha256: destination.pathContractSha256,
    targetIdentitySha256: destination.targetIdentitySha256,
    targetMustRemainAbsent: true,
    siblingAtomicWriteProbeRequired: true,
  };
}

export function createCertificationResourcePlan(options) {
  const resolved = resolveCertificationResourceDestinations(options);
  const destinations = resolved.destinations.map(portableDestination);
  const destinationSetSha256 = sha256Bytes(canonicalJsonBytes(destinations));
  return Object.freeze({
    schema: PRODUCTION_CERTIFICATION_RESOURCE_PLAN_SCHEMA,
    version: 1,
    contractMatrixSha256: resolved.contract.matrixSha256,
    resourceContractSha256: resolved.contract.sha256,
    externalRootIdentitySha256: resolved.rootIdentitySha256,
    destinationSetSha256,
    destinations,
  });
}

export function certificationResourcePlanIssues(plan) {
  const issues = [];
  const destinations = Array.isArray(plan?.destinations) ? plan.destinations : [];
  if (
    !exactKeys(plan, [
      "schema",
      "version",
      "contractMatrixSha256",
      "resourceContractSha256",
      "externalRootIdentitySha256",
      "destinationSetSha256",
      "destinations",
    ]) ||
    plan?.schema !== PRODUCTION_CERTIFICATION_RESOURCE_PLAN_SCHEMA ||
    plan?.version !== 1 ||
    destinations.length !== 17 ||
    !isSha256(plan?.contractMatrixSha256) ||
    !isSha256(plan?.resourceContractSha256) ||
    !isSha256(plan?.externalRootIdentitySha256) ||
    !isSha256(plan?.destinationSetSha256)
  ) {
    issues.push("certification resource plan header is malformed");
  }
  for (const destination of destinations) {
    if (
      !exactKeys(destination, DESTINATION_KEYS) ||
      typeof destination.id !== "string" ||
      typeof destination.lifecycleStage !== "string" ||
      !new Set(["file", "directory"]).has(destination.targetType) ||
      destination.destinationClass !== "certification-external-evidence-root" ||
      typeof destination.portableRelativePath !== "string" ||
      !destination.portableRelativePath ||
      path.isAbsolute(destination.portableRelativePath) ||
      destination.portableRelativePath.includes("\\") ||
      path.posix.normalize(destination.portableRelativePath) !==
        destination.portableRelativePath ||
      !isSha256(destination.pathContractSha256) ||
      !isSha256(destination.targetIdentitySha256) ||
      destination.targetMustRemainAbsent !== true ||
      destination.siblingAtomicWriteProbeRequired !== true
    ) {
      issues.push(`certification resource plan destination is malformed: ${String(destination?.id)}`);
    }
  }
  if (new Set(destinations.map((entry) => entry?.id)).size !== destinations.length) {
    issues.push("certification resource plan destination IDs are duplicated");
  }
  if (
    plan?.destinationSetSha256 !==
    sha256Bytes(canonicalJsonBytes(destinations))
  ) {
    issues.push("certification resource plan destination-set hash is stale");
  }
  return issues;
}

export function assertCurrentCertificationResourcePlan({ statePlan, ...options }) {
  const issues = certificationResourcePlanIssues(statePlan);
  if (issues.length > 0) throw new Error(issues.join("; "));
  const current = createCertificationResourcePlan(options);
  if (canonicalJsonBytes(current).compare(canonicalJsonBytes(statePlan)) !== 0) {
    throw new Error(
      "certification resource destinations changed after state initialization",
    );
  }
  return current;
}
