import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { config } from "@/lib/config";
import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { runVariantResolutionAudit } from "@/lib/catalog/variant-audit";
import {
  CATALOG_MEDIA_FALLBACK_POLICY_MATRIX,
  CATALOG_MEDIA_PRESENTATION_PRESETS,
} from "@/lib/catalog/media-policy";

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

    const audit = runVariantResolutionAudit(CATALOG_ITEMS_MAP.values());
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        summary: {
          itemsScanned: audit.itemsScanned,
          variantsScanned: audit.variantsScanned,
          issuesCount: audit.issuesCount,
          mediaParityMismatches: audit.mediaParityMismatches.length,
          lowQualityMedia: audit.lowQualityMedia.length,
          duplicateVariantMedia: audit.duplicateVariantMedia.length,
          invalidMediaUrls: audit.invalidMediaUrls.length,
        },
        issues: {
          mediaParityMismatches: audit.mediaParityMismatches,
          lowQualityMedia: audit.lowQualityMedia,
          duplicateVariantMedia: audit.duplicateVariantMedia,
          invalidMediaUrls: audit.invalidMediaUrls,
          missingMedia: audit.missingMedia,
        },
        policy: {
          fallbackMatrix: CATALOG_MEDIA_FALLBACK_POLICY_MATRIX,
          presentationPresets: CATALOG_MEDIA_PRESENTATION_PRESETS,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
