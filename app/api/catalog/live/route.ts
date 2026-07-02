import { NextResponse } from "next/server";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { buildLiveCatalogPayload } from "@/lib/catalog-live";
import { getAllCatalogYamlEntries } from "@/lib/catalog-yaml";
import { getPublishedFlooringMaterials } from "@/lib/catalog-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const yamlEntries = getAllCatalogYamlEntries();
    const payload = buildLiveCatalogPayload({
      catalogItems: CATALOG_ITEMS,
      yamlEntries,
      surfaceMaterials: getPublishedFlooringMaterials(),
    });

    return NextResponse.json(
      payload,
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
