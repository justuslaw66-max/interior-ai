import { NextResponse } from "next/server";
import {
  browseFloorPlanLibrary,
  parseFloorPlanUnitNumber,
  searchFloorPlanLibrary,
} from "@/lib/floor-plan-address-search";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";

const MAX_QUERY_LENGTH = 120;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Address search is limited to ${MAX_QUERY_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const requestedLimit = Number(url.searchParams.get("limit") ?? 24);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 24;
    const browse = url.searchParams.get("browse") === "1";
    const catalogs = getAllFloorPlanLibraryCatalogs();
    const results = browse
      ? browseFloorPlanLibrary(catalogs, { limit })
      : searchFloorPlanLibrary(catalogs, query, { limit });
    const unitQuery = browse ? null : parseFloorPlanUnitNumber(query);

    return NextResponse.json(
      {
        mode: browse ? "browse" : "search",
        query,
        unitQuery,
        count: results.length,
        results,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Floor-plan library search failed", error);
    return NextResponse.json(
      { error: "Floor-plan search is temporarily unavailable." },
      { status: 500 }
    );
  }
}
