import { NextResponse } from "next/server";
import {
  InvalidRequestJsonObjectError,
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import {
  PublishedRevisionFloorPlanCatalogRepository,
} from "@/lib/floor-plan-catalog-repository";
import {
  decodeFloorPlanCatalogCursor,
  encodeFloorPlanCatalogCursor,
} from "@/lib/floor-plan-catalog-cursor";
import { prismaPublishedFloorPlanRevisionDataSource } from "@/lib/floor-plan-catalog-prisma";
import {
  exactSearchFromRequest,
  FloorPlanDirectoryRequestError,
  parseFloorPlanBrowseParameters,
  parseFloorPlanExactSearchRequest,
} from "@/lib/floor-plan-directory-contract";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { takeSharedRateLimit } from "@/lib/shared-rate-limit";

const MAX_BODY_BYTES = 8_192;
const RATE_LIMIT_WINDOW_MS = 60_000;
const SAFE_CACHE_CONTROL = "no-store, max-age=0";

export const runtime = "nodejs";

const floorPlanCatalogRepository = new PublishedRevisionFloorPlanCatalogRepository(
  prismaPublishedFloorPlanRevisionDataSource
);

function noStoreJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": SAFE_CACHE_CONTROL },
  });
}

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function takeDirectoryAllowance(
  request: Request,
  mode: "browse" | "search"
) {
  const subject = clientIp(request);
  const limit = mode === "browse" ? 120 : 30;
  const local = rateLimit(`floor-plan-directory:${mode}:${subject}`, limit, RATE_LIMIT_WINDOW_MS);
  if (!local.ok) return "limited" as const;
  try {
    const shared = await takeSharedRateLimit(prisma, {
      scope: `floor-plan-directory-${mode}`,
      subject,
      limit,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    return shared.ok ? "allowed" as const : "limited" as const;
  } catch (cause) {
    console.error("Floor-plan directory rate limit failed", {
      action: mode,
      status: 503,
      errorType: cause instanceof Error ? cause.name : "unknown",
    });
    return "unavailable" as const;
  }
}

function allowanceResponse(result: "allowed" | "limited" | "unavailable") {
  if (result === "limited") {
    return noStoreJson({ error: "Too many floor-plan requests. Try again shortly." }, 429);
  }
  if (result === "unavailable") {
    return noStoreJson({ error: "Floor-plan request protection is temporarily unavailable." }, 503);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const parsed = parseFloorPlanBrowseParameters(new URL(request.url).searchParams);
    const blocked = allowanceResponse(await takeDirectoryAllowance(request, "browse"));
    if (blocked) return blocked;
    const scope = { mode: "browse" } as const;
    const after = parsed.cursor
      ? decodeFloorPlanCatalogCursor(parsed.cursor, scope)
      : null;
    if (parsed.cursor && !after) {
      return noStoreJson({ error: "Invalid floor-plan browse cursor." }, 400);
    }
    const page = await floorPlanCatalogRepository.browsePage({
      limit: parsed.limit,
      after,
    });
    return noStoreJson({
      mode: "browse",
      count: page.results.length,
      nextCursor: page.nextKey
        ? encodeFloorPlanCatalogCursor(page.nextKey, scope)
        : null,
      results: page.results,
    });
  } catch (cause) {
    if (cause instanceof FloorPlanDirectoryRequestError) {
      return noStoreJson({
        error: "Invalid floor-plan browse request.",
        code: cause.code,
        ...(cause.code === "PRIVATE_GET_PARAMETER" && cause.parameter
          ? { parameter: cause.parameter }
          : {}),
      }, 400);
    }
    console.error("Floor-plan directory browse failed", {
      action: "browse",
      status: 500,
      errorType: cause instanceof Error ? cause.name : "unknown",
    });
    return noStoreJson({ error: "Floor-plan browsing is temporarily unavailable." }, 500);
  }
}

export async function POST(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return noStoreJson({ error: "Floor-plan search requires application/json." }, 415);
  }
  const blocked = allowanceResponse(await takeDirectoryAllowance(request, "search"));
  if (blocked) return blocked;

  try {
    const body = await readBoundedJsonObject(request, MAX_BODY_BYTES);
    const parsed = parseFloorPlanExactSearchRequest(body);
    const exactSearch = exactSearchFromRequest(parsed);
    const scope = { mode: "search", ...exactSearch } as const;
    const after = parsed.cursor
      ? decodeFloorPlanCatalogCursor(parsed.cursor, scope)
      : null;
    if (parsed.cursor && !after) {
      return noStoreJson({ error: "Invalid floor-plan search cursor." }, 400);
    }
    const page = await floorPlanCatalogRepository.searchPage(exactSearch, {
      limit: parsed.limit,
      after,
    });
    return noStoreJson({
      mode: "search",
      count: page.results.length,
      nextCursor: page.nextKey
        ? encodeFloorPlanCatalogCursor(page.nextKey, scope)
        : null,
      results: page.results,
    });
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return noStoreJson({ error: "Floor-plan search request is too large." }, 413);
    }
    if (
      cause instanceof InvalidRequestJsonObjectError ||
      cause instanceof FloorPlanDirectoryRequestError
    ) {
      return noStoreJson({ error: "Invalid floor-plan search request." }, 400);
    }
    console.error("Floor-plan directory exact search failed", {
      action: "search",
      status: 500,
      errorType: cause instanceof Error ? cause.name : "unknown",
    });
    return noStoreJson({ error: "Floor-plan search is temporarily unavailable." }, 500);
  }
}
