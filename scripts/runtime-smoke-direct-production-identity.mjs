import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateProductionEvidence,
} from "./production-artifact-evidence.mjs";
import { PRODUCTION_EVIDENCE_VERIFICATION_MODES } from "./production-artifact-contract.mjs";
import { STABLE_MANIFEST_PATH } from "./stable-runtime-smoke-resources.mjs";

export async function inspectDirectProductionIdentity({
  repositoryRoot,
  manifestPath = STABLE_MANIFEST_PATH,
  environment = process.env,
}) {
  const validation = await validateProductionEvidence({
    repositoryRoot, manifestPath, environment,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
  });
  if (!validation.valid) {
    throw new Error(`Direct production identity rejected: ${validation.issues.join("; ")}`);
  }
  const manifest = validation.manifest;
  if (environment.APP_ENV !== manifest.build.applicationEnvironment ||
      environment.NEXT_PUBLIC_APP_ENV !== environment.APP_ENV) {
    throw new Error("Direct production environment conflicts with its build manifest");
  }
  const identity = {
    executionMode: "production",
    candidateCommitSha: manifest.source.commitSha,
    candidateTreeSha: manifest.source.treeSha,
    buildIdentity: manifest.build.nextBuildId,
    artifactSha256: manifest.artifact.sha256,
    manifestSha256: createHash("sha256")
      .update(readFileSync(path.resolve(repositoryRoot, manifestPath))).digest("hex"),
  };
  for (const [name, value] of [
    ["PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA", identity.candidateCommitSha],
    ["PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA", identity.candidateTreeSha],
    ["PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID", identity.buildIdentity],
    ["PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256", identity.artifactSha256],
    ["PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256", identity.manifestSha256],
  ]) {
    if (environment[name] && environment[name] !== value) {
      throw new Error(`Direct production identity conflicts with ${name}`);
    }
  }
  return identity;
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  inspectDirectProductionIdentity({ repositoryRoot: process.argv[3] })
    .then((identity) => console.log(JSON.stringify(identity)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
