import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminStatusBadge } from "../app/admin/AdminStatusBadge";
import {
  ADMIN_STATUS_DICTIONARIES,
  describeAdminStatus,
  type AdminStatusKind,
} from "../app/admin/admin-status";
import {
  IMPORT_JOB_STATUS_SEQUENCE,
  allowedImportStatusesFrom,
  canTransitionImportStatus,
  isImportJobStatus,
} from "../lib/import-jobs/status";

// Admin statuses (UX audit AD5, phase 4i-2). An import job's status sequence is written once, in
// lib/import-jobs/status.ts. The job page's actions, the job's update route and the bulk route
// use it, and the bulk route keeps to the same transitions as a single job's update. Every status
// Admin shows takes its label and tone from one dictionary per kind (app/admin/admin-status.ts),
// shown by AdminStatusBadge, instead of raw values and a colour map per page.

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

// One dictionary per kind of status: every value has a label in words and a tone.
const enumValues = (source: string, pattern: RegExp) => {
  const body = source.match(pattern)?.[1];
  assert.ok(body, `${pattern} must be found`);
  return Array.from(body.matchAll(/[a-z_]+/g), (match) => match[0]).sort();
};
const schema = read("prisma/schema.prisma");
const unionValues = (path: string, typeName: string) =>
  enumValues(read(path), new RegExp(`export type ${typeName} =([^;]+);`));
const expectedKinds: Record<AdminStatusKind, string[]> = {
  importJob: [...IMPORT_JOB_STATUS_SEQUENCE].sort(),
  workflowStage: unionValues("lib/import-jobs/types.ts", "CatalogWorkflowStage"),
  floorPlanJob: enumValues(schema, /enum FloorPlanImportJobStatus \{([^}]+)\}/),
  floorPlanPublication: enumValues(schema, /enum FloorPlanPublicationStatus \{([^}]+)\}/),
  modelAsset: unionValues("lib/modelAssetStatus.ts", "ModelAssetStatus"),
  surfacePublication: unionValues("lib/surface-material-schema.ts", "SurfacePublishStatus"),
  sizeCheck: ["match", "mismatch", "missing"],
};
assert.deepEqual(Object.keys(ADMIN_STATUS_DICTIONARIES).sort(), Object.keys(expectedKinds).sort());
for (const [kind, values] of Object.entries(expectedKinds) as Array<[AdminStatusKind, string[]]>) {
  const dictionary: Record<string, { label: string; tone: string }> = ADMIN_STATUS_DICTIONARIES[kind];
  assert.deepEqual(Object.keys(dictionary).sort(), values, `${kind} has one entry per status`);
  for (const [status, { label }] of Object.entries(dictionary)) {
    assert.match(label, /^[A-Z][a-z]+( [a-z]+)*$/, `${kind}.${status} reads as words in sentence case`);
  }
}
assert.deepEqual(describeAdminStatus("importJob", "needs_mapping"), { label: "Needs mapping", tone: "warning" });
assert.deepEqual(describeAdminStatus("floorPlanJob", "awaiting_ocr"), { label: "Awaiting ocr", tone: "neutral" });
assert.deepEqual(describeAdminStatus("importJob", "toString"), { label: "ToString", tone: "neutral" });
assert.deepEqual(describeAdminStatus("modelAsset", ""), { label: "Not set", tone: "neutral" });

const badge = renderToStaticMarkup(<AdminStatusBadge kind="importJob" status="failed" />);
assert.match(badge, /data-status="failed"/);
assert.match(badge, /data-tone="critical"/);
assert.match(badge, /border-red-200 bg-red-50 text-red-700/);
assert.match(badge, />Failed<\/span>$/);
assert.match(badge, /text-xs/, "a badge's text is 12px");

// The colour maps and raw statuses it replaces are gone.
const statusViews: Record<string, Array<[RegExp, string]>> = {
  "app/admin/imports/page.tsx": [[/<AdminStatusBadge kind="importJob" status=\{job\.status\} \/>/, "the list's badge"]],
  "app/admin/imports/[id]/page.tsx": [[/describeAdminStatus\("importJob", job\.status\)\.label/, "the page's status"]],
  "app/admin/imports/[id]/ImportJobActions.tsx": [[/describeAdminStatus\("importJob", nextStatus\)\.label/, "the select's options"]],
  "app/admin/catalog/inbox/page.tsx": [
    [/<AdminStatusBadge kind="workflowStage" status=\{job\.workflowStage\} \/>/, "the blockers table's stage"],
    [/<AdminStatusBadge kind="importJob" status=\{job\.status\} \/>/, "a queue card's status"],
  ],
  "app/admin/catalog/review/page.tsx": [[/<AdminStatusBadge kind="sizeCheck" status=\{row\.state\} \/>/, "the size rows"]],
  "app/admin/models/page.tsx": [[/<AdminStatusBadge kind="modelAsset" status=\{getModelAssetStatus\(a\)\} \/>/, "a model card"]],
  "app/admin/models/[id]/page.tsx": [[/kind="modelAsset" status=\{getModelAssetStatus\(asset\)\}/, "the model page"]],
  "app/admin/models/[id]/viewer.tsx": [[/<AdminStatusBadge kind="modelAsset" status=\{approvalStatus\} \/>/, "Asset QA"]],
  "app/admin/models/[id]/ModelStatusField.tsx": [[/describeAdminStatus\("modelAsset", status\)\.label/, "the select's options"]],
  "app/admin/models/[id]/model-edit-form.tsx": [[/<ModelStatusField\s+value=\{form\.assetStatus\}/, "the form's status"]],
  "app/admin/floor-plans/AdminFloorPlanQueueTable.tsx": [
    [/<AdminStatusBadge kind="floorPlanJob" status=\{job\.status\} \/>/, "the queue's status"],
    [/kind="floorPlanPublication" status=\{job\.revision\.publicationStatus\}/, "the queue's publication"],
  ],
  "app/admin/floor-plans/[id]/FloorPlanJobSummary.tsx": [[/describeAdminStatus\("floorPlanJob", stage\)\.label/, "the stage steps"]],
  "app/admin/floor-plans/[id]/FloorPlanApprovalPanel.tsx": [[/kind="floorPlanPublication" status=\{job\.revision\.publicationStatus\}/, "the approval panel"]],
  "app/admin/audit/page.tsx": [[/<AdminStatusBadge kind="surfacePublication" status=\{material\.publishStatus\} \/>/, "a surface's status"]],
  "app/admin/operations-data.ts": [
    [/statusLabel: label, statusTone: tone/, "a recent operation's label and tone"],
    [/\.\.\.operationStatus\("importJob", job\.status\)/, "an asset import"],
    [/\.\.\.operationStatus\("floorPlanJob", job\.status\)/, "a floor plan"],
  ],
};
for (const [path, checks] of Object.entries(statusViews)) {
  const source = read(path);
  for (const [pattern, place] of checks) assert.match(source, pattern, `${path}: ${place} uses the dictionary`);
}
const retiredColourMaps = /\bSTATUS_TONES?\b|statusPillClass|statusBadgeClass|function statusTone|function formatStatus/;
for (const path of sourceFiles("app/admin")) {
  assert.doesNotMatch(read(path), retiredColourMaps, `${path} keeps no status colour map of its own`);
}

console.log(
  "Admin status checks passed: one import-job sequence, used by the job page and both routes; " +
    `${Object.keys(ADMIN_STATUS_DICTIONARIES).length} status dictionaries and the badge, in every view.`
);
