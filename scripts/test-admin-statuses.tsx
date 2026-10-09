import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminPager } from "../app/admin/AdminPager";
import { AdminStatusBadge } from "../app/admin/AdminStatusBadge";
import { describeImportStatusChange } from "../app/admin/imports/[id]/importStatusChange";
import {
  adminListHref,
  adminPageArgs,
  adminPageFromRows,
  adminPageHrefs,
  parseAdminPageRequest,
} from "../app/admin/admin-paging";
import {
  importJobListOrder,
  importJobListParams,
  importJobListWhere,
  parseImportJobListFilters,
} from "../app/admin/imports/import-jobs-list";
import { modelListWhere, parseModelListFilters } from "../app/admin/models/models-list";
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
  "app/admin/imports/ImportJobsList.tsx": [
    [/<AdminStatusBadge kind="importJob" status=\{job\.status\} \/>/, "the list's badge"],
    [/describeAdminStatus\("importJob", status\)\.label/, "the status filter"],
  ],
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

// Status changes that can't be undone are confirmed first (UX audit AD4): an import job's, and a
// model's approval. The shared ConfirmDialog runs the change only from its confirm button.
for (const status of IMPORT_JOB_STATUS_SEQUENCE) {
  const copy = describeImportStatusChange(status);
  assert.match(copy.title, /^[A-Z][^?]*\?$/, `${status}: the dialog asks a question`);
  assert.ok(copy.confirmLabel.length > 0 && !/^(OK|Yes|Confirm)$/.test(copy.confirmLabel), `${status}: the button names the change`);
  assert.equal(copy.destructive, status === "failed", `${status}: only failing a job is destructive`);
}
assert.match(describeImportStatusChange("published").description, /^Published is final/);
assert.match(describeImportStatusChange("failed").description, /^Failed is final/);
assert.deepEqual(describeImportStatusChange("optimized"), {
  title: "Move this job to optimized?",
  description: "A job can't go back to an earlier status.",
  confirmLabel: "Move to optimized",
  destructive: false,
});

const confirmation = read("app/admin/useAdminConfirmation.tsx");
assert.match(confirmation, /<ConfirmDialog[\s\S]*onCancel=\{\(\) => setPending\(null\)\}[\s\S]*onConfirm=\{\(\) => \{\s*setPending\(null\);\s*pending\.onConfirm\(\);/);
const statusChange = read("app/admin/imports/[id]/useImportStatusChange.ts");
assert.match(statusChange, /if \(nextStatus === currentStatus\) return apply\(nextStatus\);/, "saving at the current status doesn't ask");
assert.match(statusChange, /confirm\(\{ \.\.\.describeImportStatusChange\(nextStatus\), onConfirm: \(\) => apply\(nextStatus\) \}\)/);
assert.match(actions, /useImportStatusChange\(props\.currentStatus, \(nextStatus\) => \{\s*setStatus\(nextStatus\);\s*runUpdate\(nextStatus\);/);
assert.match(actions, /event\.preventDefault\(\);\s*requestUpdate\(status\);/, "the form's Save asks before a status change");
for (const [status, label] of [["needs_review", "Mark needs review"], ["approved", "Mark approved"], ["published", "Mark published"]]) {
  assert.match(actions, new RegExp(`onClick=\\{\\(\\) => requestUpdate\\("${status}"\\)\\}\\s*>\\s*${label}`), `${label} asks first`);
}
assert.equal(actions.match(/runUpdate\(/g)?.length, 1, "runUpdate runs only from the confirmed change");
assert.match(actions, /\{dialog\}/);
const modelApproval = read("app/admin/models/[id]/modelApproval.tsx");
assert.match(modelApproval, /if \(nextStatus !== "approved" \|\| initialStatus === "approved"\) return save\(\);/);
assert.match(modelApproval, /confirmLabel: "Approve and save",\s*onConfirm: save,/);
const modelForm = read("app/admin/models/[id]/model-edit-form.tsx");
assert.match(modelForm, /onClick=\{\(\) => requestSave\(form\.assetStatus, \(\) => void save\(\)\)\}/, "Save asks before approving");
assert.doesNotMatch(modelForm, /onClick=\{save\}/);
assert.match(modelForm, /\{dialog\}/);

// Lists (UX audit AD6): filters, search and sort in the URL, keyset pages both ways, true counts.
const rows = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => ({ id: `r${from + index}` }));
assert.deepEqual(parseAdminPageRequest({}), { direction: "first" });
assert.deepEqual(parseAdminPageRequest({ after: "cm1abc" }), { direction: "after", cursor: "cm1abc" });
assert.deepEqual(parseAdminPageRequest({ before: ["armchair-real-castlery-mori-performance-fabric-armchair-walnut-wood"] }), {
  direction: "before",
  cursor: "armchair-real-castlery-mori-performance-fabric-armchair-walnut-wood",
});
assert.deepEqual(parseAdminPageRequest({ after: "x' OR 1=1" }), { direction: "first" }, "a malformed cursor is the first page");
assert.deepEqual(adminPageArgs({ direction: "first" }, 3), { take: 4 });
assert.deepEqual(adminPageArgs({ direction: "after", cursor: "r3" }, 3), { cursor: { id: "r3" }, skip: 1, take: 4 });
assert.deepEqual(adminPageArgs({ direction: "before", cursor: "r4" }, 3), { cursor: { id: "r4" }, skip: 1, take: -4 });
assert.deepEqual(adminPageFromRows(rows(1, 4), { direction: "first" }, 3), { rows: rows(1, 3), previousCursor: null, nextCursor: "r3" });
assert.deepEqual(adminPageFromRows(rows(4, 7), { direction: "after", cursor: "r3" }, 3), { rows: rows(4, 6), previousCursor: "r4", nextCursor: "r6" });
assert.deepEqual(adminPageFromRows(rows(7, 8), { direction: "after", cursor: "r6" }, 3), { rows: rows(7, 8), previousCursor: "r7", nextCursor: null });
assert.deepEqual(adminPageFromRows(rows(3, 6), { direction: "before", cursor: "r7" }, 3), { rows: rows(4, 6), previousCursor: "r4", nextCursor: "r6" });
assert.deepEqual(adminPageFromRows(rows(1, 3), { direction: "before", cursor: "r4" }, 3), { rows: rows(1, 3), previousCursor: null, nextCursor: "r3" }, "the first page reached backwards has no Previous");
assert.equal(adminListHref("/admin/imports", { status: null, q: "", sort: "updated" }), "/admin/imports?sort=updated");
assert.deepEqual(adminPageHrefs("/admin/imports", { status: "failed", q: "sofa a" }, { previousCursor: "r4", nextCursor: null }), {
  previousHref: "/admin/imports?status=failed&q=sofa+a&before=r4",
  nextHref: null,
});

const importFilters = parseImportJobListFilters({ status: "needs_review", q: "  Castlery ", sort: "oldest" });
assert.deepEqual(importFilters, { status: "needs_review", query: "Castlery", sort: "oldest" });
assert.deepEqual(parseImportJobListFilters({ status: "archived", sort: "toString" }), { status: null, query: "", sort: "newest" });
assert.deepEqual(importJobListParams(parseImportJobListFilters({})), { status: null, q: "", sort: null }, "defaults stay out of the URL");
assert.deepEqual(importJobListWhere(parseImportJobListFilters({})), {});
assert.deepEqual(importJobListWhere(importFilters), {
  AND: [
    { status: "needs_review" },
    {
      OR: ["id", "sourceFileName", "sourceBrand", "sourceSku"].map((field) => ({
        [field]: { contains: "Castlery", mode: "insensitive" },
      })),
    },
  ],
});
assert.deepEqual(importJobListOrder("oldest"), [{ createdAt: "asc" }, { id: "asc" }], "every order ends on id, so pages never overlap");
assert.deepEqual(importJobListOrder("updated"), [{ updatedAt: "desc" }, { id: "desc" }]);
assert.deepEqual(modelListWhere(parseModelListFilters({ approval: "not_approved", q: "mori" })), {
  AND: [{ approved: false }, { OR: [{ id: { contains: "mori", mode: "insensitive" } }, { modelUrl: { contains: "mori", mode: "insensitive" } }] }],
});

const importList = read("app/admin/imports/load-import-jobs.ts");
assert.match(importList, /prisma\.importJob\.groupBy\(\{ by: \["status"\], _count: \{ _all: true \} \}\)/, "Import jobs counts every job");
assert.doesNotMatch(importList + read("app/admin/imports/page.tsx"), /take: 200/, "no newest-200 cut-off");
assert.match(importList, /\.\.\.adminPageArgs\(request\)/);
assert.match(read("app/admin/models/load-models.ts"), /\.\.\.adminPageArgs\(request, MODEL_PAGE_SIZE\)/, "3D models load a page at a time");
assert.doesNotMatch(read("app/admin/models/page.tsx"), /prisma\.modelAsset\.findMany/);
for (const path of ["app/admin/imports/page.tsx", "app/admin/models/page.tsx"]) {
  assert.match(read(path), /<AdminPager \{\.\.\.pages\} cursorLost=\{list\.cursorLost\} \/>/, `${path} has Previous and Next`);
}
const pager = renderToStaticMarkup(<AdminPager previousHref="/admin/imports?before=r4" nextHref={null} cursorLost />);
assert.match(pager, /That page is no longer available/);
assert.match(pager, /<a [^>]*href="\/admin\/imports\?before=r4"[^>]*>Previous<\/a>/);
assert.match(pager, /<span [^>]*>Next<\/span>/, "Next isn't a link on the last page");

console.log(
  "Admin status checks passed: one import-job sequence, used by the job page and both routes; " +
    `${Object.keys(ADMIN_STATUS_DICTIONARIES).length} status dictionaries and the badge, in every view; ` +
    "status changes and a model's approval confirmed first; Import jobs and 3D models paged both ways."
);
