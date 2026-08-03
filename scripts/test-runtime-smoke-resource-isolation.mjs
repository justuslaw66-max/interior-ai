import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const runtimeSmokeSource = readFileSync(
  path.join(process.cwd(), "tests/e2e/00-runtime-smoke.spec.ts"),
  "utf8",
);
const playwrightConfigSource = readFileSync(
  path.join(process.cwd(), "playwright.config.ts"),
  "utf8",
);
const workflowSource = readFileSync(
  path.join(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

assert.match(
  runtimeSmokeSource,
  /test\.use\(\{\s*trace: "off",\s*video: "off",\s*\}\);/,
  "the constrained production runtime smoke must not continuously record raw trace/video",
);
assert.match(
  playwrightConfigSource,
  /trace: "retain-on-failure",[\s\S]*video: "retain-on-failure"/,
  "non-runtime-smoke tests must retain the existing diagnostic defaults",
);
assert.match(
  playwrightConfigSource,
  /screenshot: "only-on-failure"/,
  "runtime failures must retain the existing screenshot diagnostic",
);
assert.match(
  workflowSource,
  /required_files=\(manifest\.json runtime-smoke\.json runtime-smoke-phases\.json\)/,
  "the safe structured failure artifact contract must remain unchanged",
);
assert.doesNotMatch(
  workflowSource,
  /required_files=\([^\n]*(?:trace\.zip|video\.webm)/,
  "raw trace/video must not become required external evidence",
);
const requiredSnapshotLogSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf('"[runtime-smoke-required-snapshot]"'),
  runtimeSmokeSource.indexOf("const waitForModelDiagnosticsReady"),
);
assert.match(
  requiredSnapshotLogSource,
  /snapshotSummary:\s*\{[\s\S]*safeReadinessSummary:\s*snapshot\.safeReadinessSummary/,
  "required snapshot stdout must retain a bounded safe lifecycle/cache summary",
);
assert.doesNotMatch(
  requiredSnapshotLogSource,
  /\n\s+snapshot,\n/,
  "required snapshot stdout must not duplicate the complete diagnostic object graph",
);

console.log("CH-0029 runtime-smoke resource-isolation contract passed.");
