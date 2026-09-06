import path from "node:path";
import process from "node:process";
import {
  createProductionEvidenceBundle as createBundle,
  recordProductionEvidenceTest as recordTest,
  validateProductionEvidence as validateEvidence,
  verifyRuntimeSmokeFailureEvidence as verifyRuntimeFailure,
  runProductionArtifactEvidenceCli,
} from "./production-artifact-evidence.mjs";
// The literal source-only dependency loads after a fresh build installs its
// declared packages. It never enters the portable verifier closure.
async function loadSourceRepositoryValidator() {
  return (await import("./required-test-truthfulness.mjs")).validateRequiredTestRepository;
}

// This source-only driver supplies the real repository policy to artifact
// operations. It is deliberately outside the standalone verifier closure.
const sourceOptions = async (options) => ({
  ...options,
  sourceRepositoryValidator: await loadSourceRepositoryValidator(),
});
export const validateProductionEvidence = async (options) => validateEvidence(await sourceOptions(options));
export const recordProductionEvidenceTest = async (options) => recordTest(await sourceOptions(options));
export const verifyRuntimeSmokeFailureEvidence = async (options) => verifyRuntimeFailure(await sourceOptions(options));
export const createProductionEvidenceBundle = async (options) => createBundle(await sourceOptions(options));

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  runProductionArtifactEvidenceCli({ loadSourceRepositoryValidator })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
