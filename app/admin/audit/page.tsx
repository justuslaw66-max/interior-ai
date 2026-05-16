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
import { runVariantResolutionAudit } from "@/lib/catalog/variant-audit";
import { CATALOG_MEDIA_FALLBACK_POLICY_MATRIX } from "@/lib/catalog/media-policy";
import AuditActions from "./AuditActions";

function toneClass(hasIssue: boolean) {
  return hasIssue
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : "border-green-300 bg-green-50 text-green-900";
}

export default async function AdminAuditPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const refreshedAt = new Date();

  const [governance, quality] = await Promise.all([
    runCatalogGovernanceAudit(),
    Promise.resolve(runCatalogQualityAudit()),
  ]);
  const variantAudit = runVariantResolutionAudit(CATALOG_ITEMS_MAP.values());

  const governanceWarnings = governance.missingAssetIdFiles.length + governance.orphanCatalogIds.length;
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

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-xl border p-4 ${toneClass(governance.hasFailures)}`}>
          <div className="text-xs uppercase tracking-wide">Governance</div>
          <div className="mt-2 text-2xl font-semibold">{governance.hasFailures ? "Needs action" : "Passing"}</div>
          <div className="mt-1 text-sm">
            {governance.missingCatalog.length} missing mappings, {governance.duplicateIds.size} duplicates, {governance.parseErrorFiles.length} parse errors
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
          <div className="text-xs uppercase tracking-wide text-neutral-500">Approved assets</div>
          <div className="mt-2 text-2xl font-semibold">{governance.approvedImportedAssets.length}</div>
          <div className="mt-1 text-sm text-neutral-600">
            Imported approved assets, with {governanceWarnings} non-blocking governance warnings
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
              <div className="text-neutral-500">Orphan asset ids</div>
              <div className="text-lg font-semibold">{governance.orphanCatalogIds.length}</div>
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

          {governance.orphanCatalogIds.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Orphan asset ids</h3>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {governance.orphanCatalogIds.map((assetId) => (
                  <li key={assetId}>{assetId}</li>
                ))}
              </ul>
            </div>
          )}
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