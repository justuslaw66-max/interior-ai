import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import {
  getRelativeCatalogPath,
  runCatalogGovernanceAudit,
  runCatalogQualityAudit,
} from "@/lib/catalog-audit";
import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { summarizeCatalogPublication } from "@/lib/catalog-publication";
import { getAllCatalogYamlEntries } from "@/lib/catalog-yaml";
import { runVariantResolutionAudit } from "@/lib/catalog/variant-audit";
import { CATALOG_MEDIA_FALLBACK_POLICY_MATRIX } from "@/lib/catalog/media-policy";
import {
  buildSurfaceMaterialAdminAuditSummaries,
  getRelativeSurfaceMaterialPath,
  runSurfaceMaterialAudit,
} from "@/lib/surface-material-audit";
import AuditActions from "./AuditActions";

function toneClass(hasIssue: boolean) {
  return hasIssue
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : "border-green-300 bg-green-50 text-green-900";
}

function formatAuditValue(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "Not set";
}

function statusPillClass(status: string) {
  if (status === "published") return "bg-green-50 text-green-700 ring-green-100";
  if (status === "draft") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "blocked") return "bg-red-50 text-red-700 ring-red-100";
  return "bg-neutral-100 text-neutral-700 ring-neutral-200";
}

type SurfaceMaterialAuditFilter =
  | "all"
  | "draft"
  | "published"
  | "needs_permission"
  | "missing_assets"
  | "missing_specs"
  | "unresolved_blockers"
  | "sample_available"
  | "missing_links";

type SurfaceMaterialAuditSort =
  | "blocker_count"
  | "supplier"
  | "material_family"
  | "publish_status"
  | "license_status";

const SURFACE_MATERIAL_AUDIT_FILTERS: Array<{
  id: SurfaceMaterialAuditFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "published", label: "Published" },
  { id: "needs_permission", label: "Needs permission" },
  { id: "missing_assets", label: "Missing assets" },
  { id: "missing_specs", label: "Missing specs" },
  { id: "unresolved_blockers", label: "Unresolved blockers" },
  { id: "sample_available", label: "Sample available" },
  { id: "missing_links", label: "Missing sample/source link" },
];

const SURFACE_MATERIAL_AUDIT_SORTS: Array<{
  id: SurfaceMaterialAuditSort;
  label: string;
}> = [
  { id: "blocker_count", label: "Blocker count" },
  { id: "supplier", label: "Supplier" },
  { id: "material_family", label: "Material family" },
  { id: "publish_status", label: "Publish status" },
  { id: "license_status", label: "License status" },
];

function getSearchParamValue(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSurfaceMaterialFilter(value: string | undefined): SurfaceMaterialAuditFilter {
  return SURFACE_MATERIAL_AUDIT_FILTERS.some((filter) => filter.id === value)
    ? (value as SurfaceMaterialAuditFilter)
    : "all";
}

function normalizeSurfaceMaterialSort(value: string | undefined): SurfaceMaterialAuditSort {
  return SURFACE_MATERIAL_AUDIT_SORTS.some((sort) => sort.id === value)
    ? (value as SurfaceMaterialAuditSort)
    : "blocker_count";
}

function matchesSurfaceMaterialFilter(
  material: ReturnType<typeof buildSurfaceMaterialAdminAuditSummaries>[number],
  filter: SurfaceMaterialAuditFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "draft") return material.publishStatus === "draft";
  if (filter === "published") return material.publishStatus === "published";
  if (filter === "needs_permission") return material.licenseStatus === "needs_permission";
  if (filter === "missing_assets") return material.missingAssets.length > 0;
  if (filter === "missing_specs") return material.missingSpecs.length > 0;
  if (filter === "unresolved_blockers") return material.blockers.length > 0;
  if (filter === "sample_available") return material.sampleAvailable === true;
  if (filter === "missing_links") return !material.sourceUrl || !material.sampleRequestUrl;
  return true;
}

function sortSurfaceMaterialSummaries(
  summaries: ReturnType<typeof buildSurfaceMaterialAdminAuditSummaries>,
  sort: SurfaceMaterialAuditSort
) {
  return [...summaries].sort((a, b) => {
    if (sort === "blocker_count") return b.blockers.length - a.blockers.length;
    if (sort === "supplier") return a.supplier.localeCompare(b.supplier);
    if (sort === "material_family") return a.materialFamily.localeCompare(b.materialFamily);
    if (sort === "publish_status") return a.publishStatus.localeCompare(b.publishStatus);
    if (sort === "license_status") return a.licenseStatus.localeCompare(b.licenseStatus);
    return 0;
  });
}

function surfaceAuditHref(filter: SurfaceMaterialAuditFilter, sort: SurfaceMaterialAuditSort) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("surfaceFilter", filter);
  if (sort !== "blocker_count") params.set("surfaceSort", sort);
  const query = params.toString();
  return query ? `/admin/audit?${query}#surface-material-qa` : "/admin/audit#surface-material-qa";
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeSurfaceMaterialFilter = normalizeSurfaceMaterialFilter(
    getSearchParamValue(resolvedSearchParams, "surfaceFilter")
  );
  const activeSurfaceMaterialSort = normalizeSurfaceMaterialSort(
    getSearchParamValue(resolvedSearchParams, "surfaceSort")
  );
  const refreshedAt = new Date();

  const [governance, quality] = await Promise.all([
    runCatalogGovernanceAudit(),
    Promise.resolve(runCatalogQualityAudit()),
  ]);
  const surfaceMaterials = runSurfaceMaterialAudit();
  const allSurfaceMaterialSummaries = buildSurfaceMaterialAdminAuditSummaries();
  const surfaceMaterialSummaries = sortSurfaceMaterialSummaries(
    allSurfaceMaterialSummaries.filter((material) =>
      matchesSurfaceMaterialFilter(material, activeSurfaceMaterialFilter)
    ),
    activeSurfaceMaterialSort
  );
  const draftSurfaceMaterialCount = allSurfaceMaterialSummaries.filter(
    (material) => material.publishStatus === "draft"
  ).length;
  const variantAudit = runVariantResolutionAudit(CATALOG_ITEMS_MAP.values());
  const catalogPublication = summarizeCatalogPublication(getAllCatalogYamlEntries());
  const catalogStatusEntries = Object.entries(catalogPublication.statusCounts).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const governanceWarnings = governance.missingAssetIdFiles.length;
  const activeModelFailures = governance.orphanActiveCatalogIds.length;
  const draftModelBlockers = governance.orphanDraftCatalogIds.length;
  const qualityDuplicateEntries = Array.from(quality.duplicates.entries());
  const governanceDuplicateEntries = Array.from(governance.duplicateIds.entries());
  const issueAudits = quality.audits.filter((audit) => audit.failures.length > 0 || audit.warnings.length > 0);

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Catalog Audit</h1>
          <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-700">
            Back to overview
          </Link>
          <AuditActions />
        </div>
        <p className="text-sm text-neutral-600">
          Shared view of the same governance and quality checks enforced in local audit scripts and CI.
        </p>
        <p className="text-xs text-neutral-500" title={refreshedAt.toISOString()}>
          Last refreshed: {refreshedAt.toLocaleString()}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
        <div className={`rounded-xl border p-4 ${toneClass(governance.hasFailures)}`}>
          <div className="text-xs uppercase tracking-wide">Governance</div>
          <div className="mt-2 text-2xl font-semibold">{governance.hasFailures ? "Needs action" : "Passing"}</div>
          <div className="mt-1 text-sm">
            {governance.missingCatalog.length} missing mappings, {governance.duplicateIds.size} duplicates, {activeModelFailures} active model failures
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${toneClass(quality.hasFailures)}`}>
          <div className="text-xs uppercase tracking-wide">Quality</div>
          <div className="mt-2 text-2xl font-semibold">{quality.hasFailures ? "Needs action" : "Passing"}</div>
          <div className="mt-1 text-sm">
            {quality.failureCount} failures, {quality.warningCount} warnings, {quality.duplicates.size} duplicate asset ids
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Catalog files</div>
          <div className="mt-2 text-2xl font-semibold">{quality.files.length}</div>
          <div className="mt-1 text-sm text-neutral-600">YAML files scanned under catalog/furniture</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Publication state</div>
          <div className="mt-2 text-2xl font-semibold">{catalogPublication.liveCount}</div>
          <div className="mt-1 text-sm text-neutral-600">
            Live-compatible YAML entries, with {catalogPublication.draftCount} draft-blocked
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Approved assets</div>
          <div className="mt-2 text-2xl font-semibold">{governance.approvedImportedAssets.length}</div>
          <div className="mt-1 text-sm text-neutral-600">
            Imported approved assets, with {activeModelFailures} active model failures, {governanceWarnings} governance warnings, and {draftModelBlockers} draft blockers
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${toneClass(variantAudit.mediaParityMismatches.length > 0 || variantAudit.lowQualityMedia.length > 0)}`}>
          <div className="text-xs uppercase tracking-wide">Variant media health</div>
          <div className="mt-2 text-2xl font-semibold">
            {variantAudit.mediaParityMismatches.length > 0 || variantAudit.lowQualityMedia.length > 0 ? "Needs action" : "Passing"}
          </div>
          <div className="mt-1 text-sm">
            {variantAudit.mediaParityMismatches.length} parity mismatches, {variantAudit.lowQualityMedia.length} low-quality galleries
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${toneClass(surfaceMaterials.hasFailures)}`}>
          <div className="text-xs uppercase tracking-wide">Surface materials</div>
          <div className="mt-2 text-2xl font-semibold">{surfaceMaterials.hasFailures ? "Needs action" : "Passing"}</div>
          <div className="mt-1 text-sm">
            {surfaceMaterials.files.length} files, {surfaceMaterials.draftCount} draft, {surfaceMaterials.failureCount} failures
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Governance Summary</h2>
            <p className="text-sm text-neutral-600">Coverage between approved ModelAsset rows and catalog mappings.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Approved assets</div>
              <div className="text-lg font-semibold">{governance.approvedAssets.length}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Catalog asset ids</div>
              <div className="text-lg font-semibold">{governance.catalogIds.size}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Missing mappings</div>
              <div className="text-lg font-semibold">{governance.missingCatalog.length}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Active orphan asset ids</div>
              <div className="text-lg font-semibold">{governance.orphanActiveCatalogIds.length}</div>
            </div>
          </div>

          {governance.missingCatalog.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Missing catalog mappings</h3>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {governance.missingCatalog.map((asset) => (
                  <li key={asset.id}>{asset.id}</li>
                ))}
              </ul>
            </div>
          )}

          {governanceDuplicateEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Duplicate asset ids</h3>
              <div className="mt-2 space-y-3 text-sm text-neutral-700">
                {governanceDuplicateEntries.map(([assetId, filePaths]) => (
                  <div key={assetId} className="rounded-lg border p-3">
                    <div className="font-medium">{assetId}</div>
                    {filePaths.map((filePath) => (
                      <div key={filePath} className="mt-1 text-xs text-neutral-600">
                        {getRelativeCatalogPath(filePath)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {governance.parseErrorFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Parse errors</h3>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {governance.parseErrorFiles.map((filePath) => (
                  <li key={filePath}>{getRelativeCatalogPath(filePath)}</li>
                ))}
              </ul>
            </div>
          )}

          {governance.missingAssetIdFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Missing asset_id warnings</h3>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {governance.missingAssetIdFiles.map((filePath) => (
                  <li key={filePath}>{getRelativeCatalogPath(filePath)}</li>
                ))}
              </ul>
            </div>
          )}

          {governance.orphanActiveCatalogIds.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Active model approval failures</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Active YAML entries must have approved ModelAsset rows before they can pass governance.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {governance.orphanActiveCatalogIds.map((assetId) => (
                  <li key={assetId}>{assetId}</li>
                ))}
              </ul>
            </div>
          )}

          {governance.orphanDraftCatalogIds.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Draft model blockers</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Draft YAML entries without approved ModelAsset rows. These should remain draft until model assets are approved.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {governance.orphanDraftCatalogIds.map((assetId) => (
                  <li key={assetId}>{assetId}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium">Publication states</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-neutral-500">Live-compatible</div>
                <div className="text-lg font-semibold">{catalogPublication.liveCount}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-neutral-500">Draft-blocked</div>
                <div className="text-lg font-semibold">{catalogPublication.draftCount}</div>
              </div>
            </div>
            {catalogStatusEntries.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-700">
                {catalogStatusEntries.map(([status, count]) => (
                  <span key={status} className="rounded-full border px-2 py-1">
                    {status}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Quality Summary</h2>
            <p className="text-sm text-neutral-600">Frozen vocabulary, publish-readiness, variants, and duplicate checks.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Files with failures</div>
              <div className="text-lg font-semibold">{quality.failingFiles.length}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Files with warnings</div>
              <div className="text-lg font-semibold">{quality.warningFiles.length}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Total failures</div>
              <div className="text-lg font-semibold">{quality.failureCount}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-neutral-500">Total warnings</div>
              <div className="text-lg font-semibold">{quality.warningCount}</div>
            </div>
          </div>

          {qualityDuplicateEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Duplicate quality asset ids</h3>
              <div className="mt-2 space-y-3 text-sm text-neutral-700">
                {qualityDuplicateEntries.map(([assetId, filePaths]) => (
                  <div key={assetId} className="rounded-lg border p-3">
                    <div className="font-medium">{assetId}</div>
                    {filePaths.map((filePath) => (
                      <div key={filePath} className="mt-1 text-xs text-neutral-600">
                        {getRelativeCatalogPath(filePath)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium">File detail</h3>
            {issueAudits.length === 0 ? (
              <div className="mt-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
                No file-level failures or warnings in the current quality audit.
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                {issueAudits.map((audit) => (
                  <div key={audit.filePath} className="rounded-lg border p-3">
                    <div className="font-medium">{getRelativeCatalogPath(audit.filePath)}</div>
                    {audit.failures.map((entry) => (
                      <div key={`fail-${entry}`} className="mt-2 text-sm text-red-700">
                        FAIL: {entry}
                      </div>
                    ))}
                    {audit.warnings.map((entry) => (
                      <div key={`warn-${entry}`} className="mt-2 text-sm text-amber-700">
                        WARN: {entry}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="surface-material-qa" className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Surface Material QA</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Separate flooring/material catalog checks. Draft blockers are shown for admin import QA and are not furniture cart lines.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Files scanned</div>
            <div className="text-lg font-semibold">{surfaceMaterials.files.length}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Draft flooring</div>
            <div className="text-lg font-semibold">{draftSurfaceMaterialCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Failures</div>
            <div className="text-lg font-semibold">{surfaceMaterials.failureCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Warnings</div>
            <div className="text-lg font-semibold">{surfaceMaterials.warningCount}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border bg-neutral-50 p-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Filter</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SURFACE_MATERIAL_AUDIT_FILTERS.map((filter) => (
                <Link
                  key={filter.id}
                  href={surfaceAuditHref(filter.id, activeSurfaceMaterialSort)}
                  className={
                    activeSurfaceMaterialFilter === filter.id
                      ? "rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700"
                  }
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sort</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SURFACE_MATERIAL_AUDIT_SORTS.map((sort) => (
                <Link
                  key={sort.id}
                  href={surfaceAuditHref(activeSurfaceMaterialFilter, sort.id)}
                  className={
                    activeSurfaceMaterialSort === sort.id
                      ? "rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700"
                  }
                >
                  {sort.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {surfaceMaterialSummaries.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium">
              Surface material status ({surfaceMaterialSummaries.length} of {allSurfaceMaterialSummaries.length})
            </h3>
            <div className="mt-2 space-y-4 text-sm text-neutral-700">
              {surfaceMaterialSummaries.map((material) => {
                const hasMissingAssets = material.missingAssets.length > 0;
                const hasMissingSpecs = material.missingSpecs.length > 0;
                const hasAuditIssues = material.failures.length > 0 || material.warnings.length > 0;
                const hasSwatch = !material.missingAssets.includes("swatch_url");
                const hasBaseColor = !material.missingAssets.includes("base_color_url");
                return (
                  <div key={`${material.materialId}:${material.filePath}`} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{material.productName || material.materialId}</div>
                        <div className="mt-1 font-mono text-xs text-neutral-700">{material.materialId}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {getRelativeSurfaceMaterialPath(material.filePath)}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ${statusPillClass(material.publishStatus)}`}>
                        {formatAuditValue(material.publishStatus)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border bg-neutral-50 p-2">
                        <div className="text-neutral-500">Supplier</div>
                        <div className="mt-0.5 font-medium text-neutral-900">
                          {material.brand ?? formatAuditValue(material.supplier)}
                        </div>
                      </div>
                      <div className="rounded-md border bg-neutral-50 p-2">
                        <div className="text-neutral-500">Material family</div>
                        <div className="mt-0.5 font-medium text-neutral-900">
                          {formatAuditValue(material.materialFamily)}
                        </div>
                      </div>
                      <div className="rounded-md border bg-neutral-50 p-2">
                        <div className="text-neutral-500">License status</div>
                        <div className="mt-0.5 font-medium text-neutral-900">
                          {formatAuditValue(material.licenseStatus)}
                        </div>
                      </div>
                      <div className="rounded-md border bg-neutral-50 p-2">
                        <div className="text-neutral-500">Sample available</div>
                        <div className="mt-0.5 font-medium text-neutral-900">
                          {String(material.sampleAvailable)}
                        </div>
                      </div>
                      <div className="rounded-md border bg-neutral-50 p-2">
                        <div className="text-neutral-500">Swatch / base texture</div>
                        <div className="mt-0.5 font-medium text-neutral-900">
                          {hasSwatch ? "Swatch ok" : "Swatch missing"} / {hasBaseColor ? "Base ok" : "Base missing"}
                        </div>
                      </div>
                      <div className="rounded-md border bg-neutral-50 p-2">
                        <div className="text-neutral-500">Blocker count</div>
                        <div className="mt-0.5 font-medium text-neutral-900">
                          {material.blockers.length}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                      <div className={hasMissingAssets ? "rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800" : "rounded-md border border-green-200 bg-green-50 p-2 text-green-800"}>
                        <div className="font-semibold">Missing assets</div>
                        <div className="mt-1">
                          {hasMissingAssets ? material.missingAssets.map(formatAuditValue).join(", ") : "None"}
                        </div>
                      </div>
                      <div className={hasMissingSpecs ? "rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800" : "rounded-md border border-green-200 bg-green-50 p-2 text-green-800"}>
                        <div className="font-semibold">Missing specs</div>
                        <div className="mt-1">
                          {hasMissingSpecs ? material.missingSpecs.map(formatAuditValue).join(", ") : "None"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                      <div className="rounded-md border p-2">
                        <div className="font-semibold text-neutral-700">Source URL</div>
                        {material.sourceUrl ? (
                          <a className="mt-1 block break-all text-blue-700" href={material.sourceUrl} target="_blank" rel="noreferrer">
                            {material.sourceUrl}
                          </a>
                        ) : (
                          <div className="mt-1 text-red-700">Missing</div>
                        )}
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="font-semibold text-neutral-700">Sample / quote URL</div>
                        {material.sampleRequestUrl ? (
                          <a className="mt-1 block break-all text-blue-700" href={material.sampleRequestUrl} target="_blank" rel="noreferrer">
                            {material.sampleRequestUrl}
                          </a>
                        ) : (
                          <div className="mt-1 text-red-700">Missing</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 rounded-md border p-2 text-xs">
                      <div className="font-semibold text-neutral-700">Publish blockers</div>
                      <div className={material.blockers.length > 0 ? "mt-1 text-amber-700" : "mt-1 text-green-700"}>
                        {material.blockers.length > 0 ? material.blockers.map(formatAuditValue).join("; ") : "None"}
                      </div>
                    </div>

                    {hasAuditIssues ? (
                      <div className="mt-3 rounded-md border p-2 text-xs">
                        <div className="font-semibold text-neutral-700">Audit detail</div>
                        {material.failures.map((entry) => (
                          <div key={`fail-${entry}`} className="mt-1 text-red-700">
                            FAIL: {entry}
                          </div>
                        ))}
                        {material.warnings.map((entry) => (
                          <div key={`warn-${entry}`} className="mt-1 text-amber-700">
                            WARN: {entry}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
            No surface materials match the current filter.
          </div>
        )}

        {surfaceMaterials.parseErrorFiles.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Surface material parse errors</h3>
            <ul className="mt-2 space-y-1 text-sm text-red-700">
              {surfaceMaterials.parseErrorFiles.map((filePath) => (
                <li key={filePath}>{getRelativeSurfaceMaterialPath(filePath)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Variant Media Health</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Detects image-count parity drift, likely packshot-only variants, duplicate URLs, and malformed media links.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Variants scanned</div>
            <div className="text-lg font-semibold">{variantAudit.variantsScanned}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Parity mismatches</div>
            <div className="text-lg font-semibold">{variantAudit.mediaParityMismatches.length}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Low-quality galleries</div>
            <div className="text-lg font-semibold">{variantAudit.lowQualityMedia.length}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-neutral-500">Invalid media URLs</div>
            <div className="text-lg font-semibold">{variantAudit.invalidMediaUrls.length}</div>
          </div>
        </div>

        {variantAudit.mediaParityMismatches.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Parity mismatches</h3>
            <div className="mt-2 space-y-2">
              {variantAudit.mediaParityMismatches.slice(0, 20).map((entry) => (
                <div key={`${entry.catalogItemId}:${entry.variantId}:${entry.issue}`} className="rounded-md border p-2 text-sm text-amber-800">
                  {entry.catalogItemId}: {entry.issue}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-medium">Fallback policy matrix</h3>
          <div className="mt-2 space-y-2">
            {CATALOG_MEDIA_FALLBACK_POLICY_MATRIX.map((row) => (
              <div key={row.source} className="rounded-md border p-2 text-sm text-neutral-700">
                {row.order}. {row.source}: {row.description}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Operator Checklist</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-neutral-700 md:grid-cols-3">
          <div className="rounded-lg border p-3">Run `npm run test:catalog-audit` before publishing new YAML.</div>
          <div className="rounded-lg border p-3">Use the gold-standard checklist for folder naming, taxonomy, and variant completeness.</div>
          <div className="rounded-lg border p-3">Use this page to spot missing mappings or authoring regressions without dropping to CLI.</div>
        </div>
      </section>
    </div>
  );
}
