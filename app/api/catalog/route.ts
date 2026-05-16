import { NextResponse } from "next/server";
import { getAllCatalogYamlEntries } from "@/lib/catalog-yaml";

export async function GET() {
  try {
    const items = getAllCatalogYamlEntries();
    return NextResponse.json({ total: items.length, items });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
