import { NextResponse } from "next/server";
import {
  parseFloorPlanUnitNumber,
} from "@/lib/floor-plan-address-search";
import {
  PublishedRevisionFloorPlanCatalogRepository,
} from "@/lib/floor-plan-catalog-repository";
import {
  decodeFloorPlanCatalogCursor,
  encodeFloorPlanCatalogCursor,
} from "@/lib/floor-plan-catalog-cursor";
import { prismaPublishedFloorPlanRevisionDataSource } from "@/lib/floor-plan-catalog-prisma";

const MAX_QUERY_LENGTH = 120;
const MAX_PAGE_SIZE = 50;

export const runtime = "nodejs";

// Public search fails closed and reads only immutable canonical revisions that
// passed the database-backed licence, overlay, review and binding gates. YAML
// compatibility catalogs are review-only and never serve as an outage fallback.
const floorPlanCatalogRepository = new PublishedRevisionFloorPlanCatalogRepository(
  prismaPublishedFloorPlanRevisionDataSource
);

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
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)))
      : 24;
    const browse = url.searchParams.get("browse") === "1";
    const cursorScope = { mode: browse ? "browse" : "search", query } as const;
    const cursorValue = url.searchParams.get("cursor");
    const after = cursorValue
      ? decodeFloorPlanCatalogCursor(cursorValue, cursorScope)
      : null;
    if (cursorValue && !after) {
      return NextResponse.json({ error: "Invalid floor-plan search cursor." }, { status: 400 });
    }
    const page = browse
      ? await floorPlanCatalogRepository.browsePage({ limit, after })
      : await floorPlanCatalogRepository.searchPage(query, { limit, after });
    const unitQuery = browse ? null : parseFloorPlanUnitNumber(query);

    return NextResponse.json(
      {
        mode: browse ? "browse" : "search",
        query,
        unitQuery,
        count: page.results.length,
        nextCursor: page.nextKey
          ? encodeFloorPlanCatalogCursor(page.nextKey, cursorScope)
          : null,
        results: page.results,
      },
      {
        headers: {
          // Publication and withdrawal gates are accuracy-critical. Do not let a
          // shared or browser cache keep serving a revision after it is retired.
          "Cache-Control": "no-store, max-age=0",
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
