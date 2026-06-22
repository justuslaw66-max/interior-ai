import { execFileSync } from "child_process";

type StatusEntry = {
  status: string;
  path: string;
};

type BucketName =
  | "beta gate / hygiene"
  | "share / export"
  | "catalog readiness"
  | "editor stability"
  | "api / persistence"
  | "shared ui / app shell"
  | "generated cleanup"
  | "other";

const COPY_SUFFIX_PATTERN = /(^|\/)[^/]+ 2(\.[^/.]+)?$/;
const GENERATED_COPY_DIR_PATTERN = /(^|\/)(\.next|node_modules) 2(\/|$)/;

const BETA_GATE_PATHS = new Set([
  ".gitignore",
  "lib/snapshot-fingerprint.ts",
  "tests/e2e/00-beta-smoke.spec.ts",
  "tests/e2e/beta-seed.ts",
  "reports/beta-release-hygiene-2026-06-22.md",
  "reports/beta-release-split-2026-06-22.md",
  "scripts/check-beta-release-worktree.ts",
]);

const MIXED_BETA_GATE_PATHS = new Set([
  "package.json",
  "app/design/page.tsx",
  "app/share/[shareToken]/page.tsx",
  "app/share/[shareToken]/export/page.tsx",
]);

const SHARE_EXPORT_PATHS = new Set([
  "components/SharePageActions.tsx",
  "components/DuplicateDesignButton.tsx",
  "app/share/[shareToken]/export/PlanSvgDownload.tsx",
  "app/share/[shareToken]/export/ShoppingCsvDownload.tsx",
  "app/share/[shareToken]/export/ShoppingList.tsx",
]);

const EDITOR_PREFIXES = [
  "components/editor/",
  "components/scene/",
  "lib/design-page-",
  "lib/useDesignPage",
  "lib/useFloorManager.ts",
  "lib/floor-",
  "lib/layout-versions.ts",
  "lib/manual-placement-scoring.ts",
  "lib/room-",
  "components/DesignerCanvas.tsx",
  "components/ReadOnlyViewer.tsx",
  "components/ShareViewer.tsx",
  "components/SnapGuides.tsx",
  "tests/e2e/",
  "scripts/test-",
];

const CATALOG_PREFIXES = [
  "catalog/",
  "public/assets/models/armchair",
  "public/assets/models/armchairs/",
  "public/assets/thumbs/armchair",
  "lib/catalog",
  "components/catalog/",
];

const SHARE_EXPORT_PREFIXES = [
  "app/share/[shareToken]/export/pdf/",
  "lib/share-shopping-csv.ts",
];

const API_PERSISTENCE_PREFIXES = [
  "app/api/",
  "lib/design-duplication.ts",
  "lib/design-route-payload.ts",
  "lib/shopping-readiness.ts",
  "lib/shopping-replacements.ts",
  "lib/ai/layout-planner.ts",
  "next.config.ts",
];

const SHARED_UI_APP_SHELL_PREFIXES = [
  "app/admin/",
  "app/globals.css",
  "app/hugg-test/",
  "app/icon.svg",
  "app/layout.tsx",
  "components/AdminTestPanel.tsx",
  "components/CartSidebar.tsx",
  "components/ConfirmDialog.tsx",
  "components/CopyFallbackDialog.tsx",
  "components/DeleteAllDesignsButton.tsx",
  "components/DeleteDesignButton.tsx",
  "components/DesignsListWithSelection.tsx",
  "components/InviteCopyButton.tsx",
  "components/ItemCartDrawer.tsx",
  "components/PDFDownloadButton.tsx",
  "components/RecentClicksTable.tsx",
  "lib/sentry-browser-noop.ts",
  "lib/style-consistency.ts",
  "public/draco/",
];

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function parseStatus(output: string): StatusEntry[] {
  if (output.length === 0) {
    return [];
  }

  const records = output.split("\0").filter(Boolean);
  const entries: StatusEntry[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    entries.push({
      status,
      path: record.slice(3),
    });

    if (status.includes("R") || status.includes("C")) {
      index += 1;
    }
  }

  return entries;
}

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function classify(path: string): BucketName {
  if (path.startsWith(".next 2/") || path.startsWith(".next 3/")) {
    return "generated cleanup";
  }

  if (BETA_GATE_PATHS.has(path) || MIXED_BETA_GATE_PATHS.has(path)) {
    return "beta gate / hygiene";
  }

  if (SHARE_EXPORT_PATHS.has(path) || startsWithAny(path, SHARE_EXPORT_PREFIXES)) {
    return "share / export";
  }

  if (startsWithAny(path, CATALOG_PREFIXES)) {
    return "catalog readiness";
  }

  if (startsWithAny(path, EDITOR_PREFIXES)) {
    return "editor stability";
  }

  if (startsWithAny(path, API_PERSISTENCE_PREFIXES)) {
    return "api / persistence";
  }

  if (startsWithAny(path, SHARED_UI_APP_SHELL_PREFIXES)) {
    return "shared ui / app shell";
  }

  return "other";
}

function formatEntries(entries: StatusEntry[]): string[] {
  return entries.map((entry) => `  ${entry.status} ${entry.path}`);
}

function main() {
  const entries = parseStatus(
    git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  );
  const trackedPaths = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const deletedPaths = new Set(
    entries.filter((entry) => entry.status.trim() === "D").map((entry) => entry.path),
  );
  const buckets = new Map<BucketName, StatusEntry[]>();
  const failures: string[] = [];

  for (const entry of entries) {
    const bucket = classify(entry.path);
    const current = buckets.get(bucket) ?? [];
    current.push(entry);
    buckets.set(bucket, current);

    const isExpectedGeneratedCleanup =
      bucket === "generated cleanup" && entry.status.trim() === "D";

    if (
      (COPY_SUFFIX_PATTERN.test(entry.path) || GENERATED_COPY_DIR_PATTERN.test(entry.path)) &&
      !isExpectedGeneratedCleanup
    ) {
      failures.push(`copy-suffix artifact still present: ${entry.status} ${entry.path}`);
    }
  }

  for (const path of trackedPaths) {
    if (deletedPaths.has(path)) {
      continue;
    }

    if (COPY_SUFFIX_PATTERN.test(path) || GENERATED_COPY_DIR_PATTERN.test(path)) {
      failures.push(`tracked copy-suffix artifact still present: ${path}`);
    }
  }

  const orderedBuckets: BucketName[] = [
    "beta gate / hygiene",
    "share / export",
    "catalog readiness",
    "editor stability",
    "api / persistence",
    "shared ui / app shell",
    "generated cleanup",
    "other",
  ];

  console.log("Beta release worktree audit");
  console.log("============================");
  console.log(`Changed paths: ${entries.length}`);
  console.log("");

  for (const bucket of orderedBuckets) {
    const bucketEntries = buckets.get(bucket) ?? [];
    console.log(`${bucket} (${bucketEntries.length})`);
    if (bucketEntries.length === 0) {
      console.log("  -");
    } else {
      console.log(formatEntries(bucketEntries).join("\n"));
    }
    console.log("");
  }

  const mixedTouched = Array.from(MIXED_BETA_GATE_PATHS).filter((path) =>
    entries.some((entry) => entry.path === path),
  );

  if (mixedTouched.length > 0) {
    console.log("Mixed beta-gate files that need patch staging:");
    for (const path of mixedTouched) {
      console.log(`  - ${path}`);
    }
    console.log("");
  }

  if (failures.length > 0) {
    console.error("Release hygiene blockers:");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log("No accidental copy-suffix artifacts detected outside expected generated deletions.");
}

main();
