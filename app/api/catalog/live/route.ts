import { NextResponse } from "next/server";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { getAllCatalogYamlEntries } from "@/lib/catalog-yaml";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const yamlEntries = getAllCatalogYamlEntries();
    const yamlAssetIdSet = new Set(
      yamlEntries
        .map((entry) => String(entry.assets?.asset_id ?? "").trim())
        .filter((assetId) => assetId.length > 0)
    );

    const itemIds = Object.keys(CATALOG_ITEMS).filter((itemId) => {
      const assetId = String(CATALOG_ITEMS[itemId]?.assets?.assetId ?? "").trim();
      return assetId.length > 0 && yamlAssetIdSet.has(assetId);
    });
    const assetIds = Array.from(yamlAssetIdSet.values());

    return NextResponse.json(
      {
        ids: itemIds,
        itemIds,
        assetIds,
        source: "catalog-yaml",
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
