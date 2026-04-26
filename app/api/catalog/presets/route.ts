import { NextResponse } from "next/server";
import { catalogCategoryPresets } from "@/lib/catalog-presets";

export async function GET() {
  return NextResponse.json({
    total: Object.keys(catalogCategoryPresets).length,
    presets: catalogCategoryPresets,
  });
}