import { NextResponse } from "next/server";
import { buildCatalogApiPayload } from "@/lib/catalog-api-payload";
import { getAllCatalogYamlEntries } from "@/lib/catalog-yaml";
import { getCatalogRegistry } from "@/lib/catalog-registry";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeDraftSurfaceMaterials =
      url.searchParams.get("includeDraftSurfaceMaterials") === "true" &&
      process.env.NODE_ENV !== "production";
    const registry = getCatalogRegistry({ includeDrafts: includeDraftSurfaceMaterials });
    return NextResponse.json(
      buildCatalogApiPayload({
        items: getAllCatalogYamlEntries(),
        products: registry.products,
        surfaceMaterials: registry.surfaceMaterials,
      })
    );
  } catch {
    return NextResponse.json({ error: "Catalog is temporarily unavailable." }, { status: 500 });
  }
}
