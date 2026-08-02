import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readBoundedJsonObject } from "@/lib/bounded-request-body";
import {
  GooglePlacesNotConfiguredError,
  GooglePlacesUpstreamError,
  isGoogleMapsAddressConfigured,
  resolveGoogleAddress,
  searchGoogleAddresses,
} from "@/lib/google-places-address";
import { rateLimit } from "@/lib/rateLimit";
import { takeSharedRateLimit } from "@/lib/shared-rate-limit";

const MAX_BODY_BYTES = 4_096;
const RATE_LIMIT_WINDOW_MS = 60_000;

export const runtime = "nodejs";

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function noStoreJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET() {
  return noStoreJson({
    provider: "google",
    configured: isGoogleMapsAddressConfigured(),
    minimumCharacters: 3,
  });
}

export async function POST(request: Request) {
  if (!isGoogleMapsAddressConfigured()) {
    return noStoreJson(
      { error: "Address suggestions are not configured.", configured: false },
      503
    );
  }
  const subject = clientIp(request);
  const localAllowance = rateLimit(`google-address:${subject}`, 60, RATE_LIMIT_WINDOW_MS);
  if (!localAllowance.ok) {
    return noStoreJson({ error: "Too many address searches. Try again shortly." }, 429);
  }
  try {
    const sharedAllowance = await takeSharedRateLimit(prisma, {
      scope: "google-address",
      subject,
      limit: 60,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!sharedAllowance.ok) {
      return noStoreJson({ error: "Too many address searches. Try again shortly." }, 429);
    }
  } catch (cause) {
    console.error("Google address shared rate limit failed", {
      errorType: cause instanceof Error ? cause.name : "unknown",
    });
    return noStoreJson({ error: "Address search protection is temporarily unavailable." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, MAX_BODY_BYTES);
  } catch {
    return noStoreJson({ error: "Invalid address search request." }, 400);
  }
  const action = typeof body.action === "string" ? body.action : "";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";
  try {
    if (action === "suggest") {
      const query = typeof body.query === "string" ? body.query : "";
      const countryCode = typeof body.countryCode === "string" ? body.countryCode : "SG";
      return noStoreJson({
        suggestions: await searchGoogleAddresses({ query, countryCode, sessionToken }),
      });
    }
    if (action === "resolve") {
      const placeId = typeof body.placeId === "string" ? body.placeId : "";
      return noStoreJson({
        address: await resolveGoogleAddress({ placeId, sessionToken }),
      });
    }
    return noStoreJson({ error: "Unknown address search action." }, 400);
  } catch (cause) {
    if (cause instanceof GooglePlacesNotConfiguredError) {
      return noStoreJson({ error: "Address suggestions are not configured." }, 503);
    }
    if (cause instanceof GooglePlacesUpstreamError) {
      console.error("Google Places request failed", {
        status: cause.status,
        action,
      });
      return noStoreJson({ error: cause.message }, 502);
    }
    return noStoreJson({ error: "Invalid address search request." }, 400);
  }
}
