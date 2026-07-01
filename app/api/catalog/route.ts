import { NextResponse } from "next/server";
import { summarizeCatalogPublication } from "@/lib/catalog-publication";
import { getAllCatalogYamlEntries } from "@/lib/catalog-yaml";
import { getCatalogRegistry } from "@/lib/catalog-registry";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeDraftSurfaceMaterials =
      url.searchParams.get("includeDraftSurfaceMaterials") === "true" &&
      process.env.NODE_ENV !== "production";
    const items = getAllCatalogYamlEntries();
    const registry = getCatalogRegistry({ includeDrafts: includeDraftSurfaceMaterials });
    const publication = summarizeCatalogPublication(items);
    return NextResponse.json({
      total: items.length,
      publication,
      statusCounts: publication.statusCounts,
      items,
      registry,
      products: registry.products,
      surfaceMaterials: registry.surfaceMaterials,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
