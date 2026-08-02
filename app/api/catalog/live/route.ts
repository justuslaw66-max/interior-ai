import { NextResponse } from "next/server";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { buildLiveCatalogPayload } from "@/lib/catalog-live";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import { getPublishedFlooringMaterials } from "@/lib/catalog-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const liveCatalogPayload = buildLiveCatalogPayload({
      catalogItems: CATALOG_ITEMS,
      yamlEntries: Array.from(getFreshCatalogYamlMap().values()),
      surfaceMaterials: getPublishedFlooringMaterials(),
    });

    return NextResponse.json(
      liveCatalogPayload,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Live catalog is temporarily unavailable." }, { status: 500 });
  }
}
