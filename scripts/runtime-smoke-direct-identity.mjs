import { execFileSync } from "node:child_process";
import path from "node:path";

export function loadDirectRuntimeSmokeIdentity({ repositoryRoot, useProductionServer, releaseBaseURL }) {
  if (releaseBaseURL) return null;
  if (useProductionServer) {
    return JSON.parse(execFileSync(process.execPath, [
      path.join(repositoryRoot, "scripts/runtime-smoke-direct-production-identity.mjs"), "inspect", repositoryRoot,
    ], { cwd: repositoryRoot, encoding: "utf8" }));
  }
  const git = (revision) => execFileSync("git", ["rev-parse", revision], {
    cwd: repositoryRoot, encoding: "utf8",
  }).trim();
  return {
    executionMode: "development",
    candidateCommitSha: git("HEAD"),
    candidateTreeSha: git("HEAD^{tree}"),
    buildIdentity: "next-development-server",
    artifactSha256: null,
    manifestSha256: null,
  };
}

/** @returns {Record<string, string>} */
export function directRuntimeSmokeServerEnvironment(identity) {
  if (identity?.executionMode !== "production") return {};
  return {
    PRODUCTION_ARTIFACT_EVIDENCE: "1",
    PRODUCTION_ARTIFACT_BUILD_ID: identity.buildIdentity,
    PRODUCTION_ARTIFACT_SHA256: identity.artifactSha256,
    PRODUCTION_ARTIFACT_COMMIT_SHA: identity.candidateCommitSha,
  };
}

export function assertDirectRuntimeSmokeServer(identity, health) {
  if (identity?.executionMode !== "production") return;
  const actual = health?.productionArtifact;
  if (health?.build !== identity.buildIdentity ||
      actual?.kind !== "local-production-mode-artifact" ||
      actual.nextBuildId !== identity.buildIdentity ||
      actual.artifactSha256 !== identity.artifactSha256 ||
      actual.sourceCommitSha !== identity.candidateCommitSha) {
    throw new Error("Direct production server does not match the validated artifact");
  }
}
