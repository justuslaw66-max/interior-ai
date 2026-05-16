import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { config } from "@/lib/config";
import {
  getRelativeCatalogPath,
  runCatalogGovernanceAudit,
  runCatalogQualityAudit,
} from "@/lib/catalog-audit";
import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { runVariantResolutionAudit } from "@/lib/catalog/variant-audit";
import {
  CATALOG_MEDIA_FALLBACK_POLICY_MATRIX,
  CATALOG_MEDIA_PRESENTATION_PRESETS,
} from "@/lib/catalog/media-policy";

function asRecord(entry: { [key: string]: unknown }) {
  return entry;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const allowDevBypass =
      config.isDev &&
      url.searchParams.get("devBypass") === "1" &&
      request.headers.get("x-interior-admin-bypass") === "1";

    const session = await auth();
    if (!allowDevBypass && (!session?.user?.email || !isAdminEmail(session.user.email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const shouldDownload = url.searchParams.get("download") === "1";

    const [governance, quality] = await Promise.all([
      runCatalogGovernanceAudit(),
      Promise.resolve(runCatalogQualityAudit()),
    ]);
    const variantAudit = runVariantResolutionAudit(CATALOG_ITEMS_MAP.values());

    const payload = {
      generatedAt: new Date().toISOString(),
      governance: {
        hasFailures: governance.hasFailures,
        approvedAssets: governance.approvedAssets.length,
        approvedImportedAssets: governance.approvedImportedAssets.length,
        catalogAssetIds: governance.catalogIds.size,
        missingCatalog: governance.missingCatalog.map((asset) => asRecord({
          id: asset.id,
          modelUrl: asset.modelUrl,
        })),
        duplicateIds: Array.from(governance.duplicateIds.entries()).map(([assetId, filePaths]) =>
          asRecord({
            assetId,
            filePaths: filePaths.map((filePath) => getRelativeCatalogPath(filePath)),
          })
        ),
        parseErrorFiles: governance.parseErrorFiles.map((filePath) => getRelativeCatalogPath(filePath)),
        missingAssetIdFiles: governance.missingAssetIdFiles.map((filePath) => getRelativeCatalogPath(filePath)),
        orphanCatalogIds: governance.orphanCatalogIds,
      },
      quality: {
        hasFailures: quality.hasFailures,
        filesScanned: quality.files.length,
        filesWithFailures: quality.failingFiles.length,
        filesWithWarnings: quality.warningFiles.length,
        totalFailures: quality.failureCount,
        totalWarnings: quality.warningCount,
        duplicateAssetIds: Array.from(quality.duplicates.entries()).map(([assetId, filePaths]) =>
          asRecord({
            assetId,
            filePaths: filePaths.map((filePath) => getRelativeCatalogPath(filePath)),
          })
        ),
        issues: quality.audits
          .filter((audit) => audit.failures.length > 0 || audit.warnings.length > 0)
          .map((audit) =>
            asRecord({
              filePath: getRelativeCatalogPath(audit.filePath),
              failures: audit.failures,
              warnings: audit.warnings,
            })
          ),
      },
      variantResolution: {
        itemsScanned: variantAudit.itemsScanned,
        variantsScanned: variantAudit.variantsScanned,
        issuesCount: variantAudit.issuesCount,
        itemsWithIssues: variantAudit.itemsWithIssues,
        variantsWithIssues: variantAudit.variantsWithIssues,
        missingMedia: variantAudit.missingMedia,
        missingCommerceMapping: variantAudit.missingCommerceMapping,
        unavailableCommerce: variantAudit.unavailableCommerce,
        requestedFallbacks: variantAudit.requestedFallbacks,
        mediaParityMismatches: variantAudit.mediaParityMismatches,
        lowQualityMedia: variantAudit.lowQualityMedia,
        duplicateVariantMedia: variantAudit.duplicateVariantMedia,
        invalidMediaUrls: variantAudit.invalidMediaUrls,
        issues: variantAudit.issues,
      },
      mediaPolicy: {
        fallbackMatrix: CATALOG_MEDIA_FALLBACK_POLICY_MATRIX,
        presentationPresets: CATALOG_MEDIA_PRESENTATION_PRESETS,
      },
    };

    const fileName = `catalog-audit-${payload.generatedAt.replace(/[:.]/g, "-")}.json`;
    const body = JSON.stringify(payload, null, 2);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...(shouldDownload ? { "Content-Disposition": `attachment; filename=\"${fileName}\"` } : {}),
      },
    });
  } catch (error) {
    console.error("Error generating admin audit payload:", error);
    return NextResponse.json({ error: "Failed to generate audit results" }, { status: 500 });
  }
}