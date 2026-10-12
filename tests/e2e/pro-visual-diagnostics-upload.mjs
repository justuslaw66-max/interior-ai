// Pro matrix diagnostics only. Does not alter the required runner or runtime evidence.
// The sanitising collection is shared with the other required matrices.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { diagnosticsSummary, prepareMatrixDiagnostics } from "./required-matrix-diagnostics-upload.mjs";

const OBSERVED_TESTS = /gives Consumer pointer Share Link Fallback|gives Pro keyboard and narrow Share Link Fallback|keeps Client Preview responsive, scope-cancelled, and Pro-gated/;

export async function prepareProVisualDiagnostics({ repositoryRoot = process.cwd(), environment = process.env } = {}) {
  const result = await prepareMatrixDiagnostics({ repositoryRoot, environment, gateId: "ci.pro-visual-policy",
    output: ".local/pro-visual-diagnostics-upload", schema: "interior-ai.pro-visual-diagnostics.v1",
    matrixOutcome: environment.PRO_VISUAL_MATRIX_OUTCOME ?? "local-diagnostic-control", observations: OBSERVED_TESTS });
  if (environment.GITHUB_OUTPUT) appendFileSync(environment.GITHUB_OUTPUT, `has_payload=${result.payload}\n`);
  const summary = diagnosticsSummary("Pro diagnostic collection", result);
  if (environment.GITHUB_STEP_SUMMARY) appendFileSync(environment.GITHUB_STEP_SUMMARY, summary);
  console.log(summary.trim());
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  prepareProVisualDiagnostics().catch(error => {
    console.error("Pro diagnostic preparation failed; original matrix result remains authoritative.", error.name);
    process.exitCode = 1;
  });
}
