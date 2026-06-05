import { NextResponse } from "next/server";
import { summarizeCatalogPublication } from "@/lib/catalog-publication";
import { getAllCatalogYamlEntries } from "@/lib/catalog-yaml";

export async function GET() {
  try {
    const items = getAllCatalogYamlEntries();
    const publication = summarizeCatalogPublication(items);
    return NextResponse.json({
      total: items.length,
      publication,
      statusCounts: publication.statusCounts,
      items,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
