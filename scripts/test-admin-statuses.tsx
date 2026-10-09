import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  IMPORT_JOB_STATUS_SEQUENCE,
  allowedImportStatusesFrom,
  canTransitionImportStatus,
  isImportJobStatus,
} from "../lib/import-jobs/status";

// Admin statuses (UX audit AD5, phase 4i-2). An import job's status sequence is written once, in
// lib/import-jobs/status.ts. The job page's actions, the job's update route and the bulk route
// use it, and the bulk route keeps to the same transitions as a single job's update.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

// The sequence and its transitions.
assert.deepEqual(allowedImportStatusesFrom("received"), [...IMPORT_JOB_STATUS_SEQUENCE]);
assert.deepEqual(allowedImportStatusesFrom("needs_review"), [
  "needs_review",
  "approved",
  "published",
  "failed",
]);
assert.deepEqual(allowedImportStatusesFrom("published"), ["published"]);
assert.deepEqual(allowedImportStatusesFrom("failed"), ["failed"]);
assert.deepEqual(allowedImportStatusesFrom("archived"), ["failed"], "an unknown status can only fail");
assert.equal(isImportJobStatus("needs_mapping"), true);
assert.equal(isImportJobStatus("Needs mapping"), false);
assert.equal(isImportJobStatus(undefined), false);
for (const from of IMPORT_JOB_STATUS_SEQUENCE) {
  for (const to of IMPORT_JOB_STATUS_SEQUENCE) {
    assert.equal(
      allowedImportStatusesFrom(from).includes(to),
      canTransitionImportStatus(from, to),
      `${from} -> ${to}: the job page offers exactly the transitions the update allows`
    );
  }
}

// Written once: no other source lists the sequence.
function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}
const sequenceLiteral = /["']metadata_extracted["'],\s*["']needs_mapping["'],\s*["']needs_review["']/;
const sequenceCopies = ["app", "components", "lib"]
  .flatMap(sourceFiles)
  .filter((path) => sequenceLiteral.test(read(path)))
  .map((path) => relative(root, join(root, path)));
assert.deepEqual(sequenceCopies, ["lib/import-jobs/status.ts"], "the import-job status sequence is written once");

const actions = read("app/admin/imports/[id]/ImportJobActions.tsx");
assert.match(actions, /allowedImportStatusesFrom\(props\.currentStatus\)/);
const jobRoute = read("app/api/admin/imports/[id]/route.ts");
assert.match(jobRoute, /if \(!isImportJobStatus\(status\)\)/);
const bulkRoute = read("app/api/admin/imports/bulk/route.ts");
assert.match(bulkRoute, /if \(!isImportJobStatus\(status\)\)/);
assert.match(
  bulkRoute,
  /jobs\.filter\(\(job\) => !canTransitionImportStatus\(job\.status, status\)\)[\s\S]*Cannot transition jobs to/,
  "the bulk route refuses a transition a single job's update refuses"
);

console.log("Admin status checks passed: one import-job sequence, used by the job page and both routes.");
