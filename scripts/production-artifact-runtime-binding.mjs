// Shared, package-free ordinary evidence identity. Resource authority stays in the source driver.
export const ORDINARY_ARTIFACT_RUNTIME_SCHEMA = "ordinary-artifact-runtime/v1";
export function assertNoCertificationContext(environment) {
  if (Object.keys(environment).some((name) =>
    (name.startsWith("CERTIFICATION_") || name.startsWith("PRODUCTION_CERTIFICATION")) &&
    environment[name] !== undefined)) {
    throw new Error("Ordinary artifact execution conflicts with certification context; no fallback is permitted");
  }
}

export function validateOrdinaryRuntimeIdentity(identity, manifest) {
  if (identity?.schema !== ORDINARY_ARTIFACT_RUNTIME_SCHEMA ||
      identity.classification !== "ORDINARY_CI_NOT_CERTIFICATION" ||
      !/^[a-f0-9]{32}$/.test(identity.runId ?? "") ||
      identity.candidateIdentifier !== manifest.candidateIdentifier ||
      identity.sourceCommitSha !== manifest.source.commitSha ||
      identity.sourceTreeSha !== manifest.source.treeSha ||
      identity.buildId !== manifest.build.nextBuildId ||
      identity.artifactSha256 !== manifest.artifact.sha256 ||
      identity.buildRunNonce !== manifest.execution.runNonce) {
    throw new Error("Ordinary runtime source/build/artifact/run identity is mismatched");
  }
  return identity;
}

export function ordinaryRuntimeIdentity(manifest, runId) {
  return validateOrdinaryRuntimeIdentity({
    schema: ORDINARY_ARTIFACT_RUNTIME_SCHEMA,
    classification: "ORDINARY_CI_NOT_CERTIFICATION",
    runId,
    candidateIdentifier: manifest.candidateIdentifier,
    sourceCommitSha: manifest.source.commitSha,
    sourceTreeSha: manifest.source.treeSha,
    buildId: manifest.build.nextBuildId,
    artifactSha256: manifest.artifact.sha256,
    buildRunNonce: manifest.execution.runNonce,
  }, manifest);
}

export function ordinaryRuntimeReportIdentity(environment, manifest) {
  const present = Object.keys(environment).some((name) => name.startsWith("ORDINARY_ARTIFACT_") &&
    environment[name] !== undefined);
  if (!present) return null;
  assertNoCertificationContext(environment);
  if (!environment.ORDINARY_ARTIFACT_CONTEXT_PATH ||
      !/^[a-f0-9]{64}$/.test(environment.ORDINARY_ARTIFACT_BINDING_SHA256 ?? "")) {
    throw new Error("Ordinary runtime report lacks its source owner's binding");
  }
  return ordinaryRuntimeIdentity(manifest, environment.ORDINARY_ARTIFACT_RUN_ID);
}

export function runtimeFailureText(value) {
  return value instanceof Error ? value.message : String(value);
}
