import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareBaselineMonotonicity,
  createBaseline,
  evaluateScan,
  scanRepository,
  updateBaseline,
} from "./code-quality/policy.mjs";

const root = mkdtempSync(join(tmpdir(), "interior-ai-code-quality-"));
mkdirSync(join(root, "lib"), { recursive: true });

const policy = {
  sourceRoots: ["lib"],
  rootFiles: [],
  thresholds: {
    typescriptLines: 4,
    tsxLines: 3,
    functionLines: 3,
    complexity: 2,
    nestingDepth: 1,
  },
  excludedExactPaths: new Set(),
};
const exceptions = { schemaVersion: 1, files: {} };
const sourcePath = join(root, "lib/legacy.ts");
const suppressionPath = join(root, "lib/suppressed.ts");
writeFileSync(sourcePath, "export function legacy(value: boolean) {\n  if (value) {\n    return 1;\n  }\n  return 0;\n}\n");
writeFileSync(
  suppressionPath,
  "// eslint-disable-next-line no-console\nexport const suppressed = true;\n"
);

const initialScan = scanRepository(root, policy);
const baseline = createBaseline(initialScan);
assert.equal(evaluateScan(initialScan, baseline, exceptions).length, 0);
assert.equal(baseline.oversizedFiles["lib/legacy.ts"].lines, 6);
const raisedBaseline = structuredClone(baseline);
raisedBaseline.oversizedFiles["lib/legacy.ts"].lines = 7;
assert.ok(compareBaselineMonotonicity(baseline, raisedBaseline)
  .some((failure) => failure.code === "BASELINE_RAISED"));

writeFileSync(
  suppressionPath,
  "// eslint-disable-next-line no-alert\nexport const suppressed = true;\n"
);
let failures = evaluateScan(scanRepository(root, policy), baseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "NEW_LINT_SUPPRESSION"));
writeFileSync(
  suppressionPath,
  "// eslint-disable-next-line no-console\nexport const relocatedSuppression = true;\n"
);
failures = evaluateScan(scanRepository(root, policy), baseline, exceptions);
assert.ok(!failures.some((failure) => failure.code === "NEW_LINT_SUPPRESSION"));
writeFileSync(
  suppressionPath,
  "// eslint-disable-next-line no-console\nexport const suppressed = true;\n"
);

writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}\n`);
failures = evaluateScan(scanRepository(root, policy), baseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "OVERSIZED_FILE_GROWTH"));

const lineException = {
  schemaVersion: 1,
  files: {
    "lib/legacy.ts": {
      reason: "Temporary fixture growth exercises reviewed exceptions.",
      owner: "code-health",
      review: "test-only",
      expiresOn: "2099-01-01",
      allow: { lines: 7 },
    },
  },
};
assert.equal(evaluateScan(scanRepository(root, policy), baseline, lineException).length, 0);
const overbroadException = structuredClone(lineException);
overbroadException.files["lib/legacy.ts"].allow.complexFunctions = {
  count: 10,
  maximum: 100,
};
assert.ok(evaluateScan(scanRepository(root, policy), baseline, overbroadException)
  .some((failure) => failure.code === "UNUSED_EXCEPTION_ALLOWANCE"));
assert.equal(
  updateBaseline(scanRepository(root, policy), baseline).oversizedFiles["lib/legacy.ts"].lines,
  6,
  "an exception must not raise the accepted baseline"
);

writeFileSync(sourcePath, "export function legacy(value: boolean) {\n  if (value) {\n    return 1;\n  }\n  const next = 0;\n  return next;\n}\n");
failures = evaluateScan(scanRepository(root, policy), baseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "FUNCTION_METRIC_GROWTH"));

writeFileSync(sourcePath, "export function legacy(value: boolean) {\n  return value ? 1 : 0;\n}\n");
const improvedScan = scanRepository(root, policy);
failures = evaluateScan(improvedScan, baseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "BASELINE_CAN_DECREASE"));
const loweredBaseline = updateBaseline(improvedScan, baseline);
assert.equal(loweredBaseline.oversizedFiles["lib/legacy.ts"], undefined);
assert.equal(compareBaselineMonotonicity(baseline, loweredBaseline).length, 0);
assert.equal(evaluateScan(improvedScan, loweredBaseline, exceptions).length, 0);

writeFileSync(
  join(root, "lib/directive-text.ts"),
  "/** Do not introduce @ts-ignore here. */\nexport const eslint = { 'no-console': 'off' };\nexport const message = 'eslint-disable and @ts-ignore are documentation text';\n"
);
assert.equal(
  evaluateScan(scanRepository(root, policy), loweredBaseline, exceptions).length,
  0,
  "directive-like text inside a string must not count as a suppression"
);

writeFileSync(join(root, "lib/new-large.ts"), "export const a = 1;\nexport const b = 2;\nexport const c = 3;\nexport const d = 4;\nexport const e = 5;\n");
failures = evaluateScan(scanRepository(root, policy), loweredBaseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "NEW_OVERSIZED_FILE"));

writeFileSync(join(root, "lib/new-large.ts"), "// @ts-ignore\nexport const value: any = 1; // eslint-disable-line no-unused-vars\n");
failures = evaluateScan(scanRepository(root, policy), loweredBaseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "EXPLICIT_ANY"));
assert.ok(failures.some((failure) => failure.code === "NEW_LINT_SUPPRESSION"));
assert.ok(failures.some((failure) => failure.code === "TYPESCRIPT_SUPPRESSION"));

writeFileSync(
  join(root, "lib/new-large.ts"),
  "// @ts-nocheck\n/* eslint no-console: 'off' */\nexport const value = 1;\n"
);
failures = evaluateScan(scanRepository(root, policy), loweredBaseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "TYPESCRIPT_SUPPRESSION"));
assert.ok(failures.some((failure) => failure.code === "NEW_LINT_SUPPRESSION"));

const unmappedException = {
  schemaVersion: 1,
  files: {
    "lib/missing.ts": {
      reason: "Negative test",
      owner: "code-health",
      review: "test-only",
      expiresOn: "2099-01-01",
      allow: { lines: 10 },
    },
  },
};
failures = evaluateScan(scanRepository(root, policy), loweredBaseline, unmappedException);
assert.ok(failures.some((failure) => failure.code === "UNMAPPED_EXCEPTION"));
assert.doesNotThrow(() => evaluateScan(scanRepository(root, policy), loweredBaseline, {
  schemaVersion: 1,
  files: null,
}));
assert.doesNotThrow(() => evaluateScan(scanRepository(root, policy), loweredBaseline, {
  schemaVersion: 1,
  files: { "lib/legacy.ts": null },
}));

mkdirSync(join(root, "lib/generated"), { recursive: true });
writeFileSync(sourcePath, "import { generated } from './generated/value';\nexport const legacy = () => generated;\n");
writeFileSync(
  join(root, "lib/generated/value.ts"),
  "import { legacy } from '../legacy';\nexport const generated = legacy;\n"
);
failures = evaluateScan(scanRepository(root, policy), loweredBaseline, exceptions);
assert.ok(!failures.some((failure) => failure.code === "RUNTIME_CYCLE"));

writeFileSync(
  join(root, "lib/type-a.ts"),
  "import { TypeB } from './type-b';\nexport type TypeA = { value: TypeB };\n"
);
writeFileSync(
  join(root, "lib/type-b.ts"),
  "import { TypeA } from './type-a';\nexport type TypeB = { value: TypeA };\n"
);
failures = evaluateScan(scanRepository(root, policy), loweredBaseline, exceptions);
assert.ok(!failures.some((failure) => failure.code === "RUNTIME_CYCLE"));

writeFileSync(join(root, "lib/new-large.ts"), "import { legacy } from './legacy';\nexport const value = legacy(true);\n");
writeFileSync(sourcePath, "const dependency = require('./new-large');\nexport const legacy = () => dependency.value;\n");
failures = evaluateScan(scanRepository(root, policy), loweredBaseline, exceptions);
assert.ok(failures.some((failure) => failure.code === "RUNTIME_CYCLE"));

console.log("Code-quality ratchet tests passed (baseline, growth, lowering, unsafe syntax, suppressions, and cycles).");
