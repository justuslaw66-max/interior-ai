import { NextResponse } from "next/server";
import { CATALOG_ITEMS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const itemIds = Object.keys(CATALOG_ITEMS);
    const assetIds = itemIds
      .map((id) => CATALOG_ITEMS[id]?.assets?.assetId)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    return NextResponse.json(
      {
        ids: itemIds,
        itemIds,
        assetIds,
        source: "local-catalog-fallback",
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
