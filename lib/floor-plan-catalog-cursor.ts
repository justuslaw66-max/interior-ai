import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizeFloorPlanAddress } from "@/lib/floor-plan-address-search";
import type { PublishedFloorPlanCatalogKey } from "@/lib/floor-plan-catalog-repository";

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 1_024;
const PUBLIC_FALLBACK_KEY = "interior-ai:public-floor-plan-catalog-cursor:v1";

export type FloorPlanCatalogCursorScope = {
  mode: "browse" | "search";
  query: string;
};

type FloorPlanCatalogCursorPayload = {
  v: typeof CURSOR_VERSION;
  m: "b" | "s";
  q: string;
  p: string;
  r: string;
  a: string;
};

function queryFingerprint(scope: FloorPlanCatalogCursorScope) {
  const normalized = scope.mode === "browse" ? "" : normalizeFloorPlanAddress(scope.query);
  return createHash("sha256").update(normalized).digest("base64url").slice(0, 22);
}

function signingKey() {
  // A cursor is not an authorization token: every decoded key is still run
  // through the published-revision, evidence and serving-integrity gates. A
  // deployment secret makes tampering impractical, while the namespaced
  // fallback keeps local development pagination functional.
  return (
    process.env.FLOOR_PLAN_CATALOG_CURSOR_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    PUBLIC_FALLBACK_KEY
  );
}

function signature(encodedPayload: string) {
  return createHmac("sha256", signingKey())
    .update(encodedPayload)
    .digest("base64url")
    .slice(0, 32);
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 191;
}

function parsePublishedAt(value: unknown) {
  if (typeof value !== "string" || value.length > 40) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) return null;
  return value;
}

/**
 * Produces a short, signed, query-bound token. It contains only immutable
 * public ordering keys; private source metadata and the address query itself
 * are never embedded in the token.
 */
export function encodeFloorPlanCatalogCursor(
  key: PublishedFloorPlanCatalogKey,
  scope: FloorPlanCatalogCursorScope
) {
  const payload: FloorPlanCatalogCursorPayload = {
    v: CURSOR_VERSION,
    m: scope.mode === "browse" ? "b" : "s",
    q: queryFingerprint(scope),
    p: key.publishedAt,
    r: key.revisionId,
    a: key.bindingId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload)}`;
}

/** Rejects malformed, tampered, stale-scope and cross-query cursors closed. */
export function decodeFloorPlanCatalogCursor(
  cursor: string,
  scope: FloorPlanCatalogCursorScope
): PublishedFloorPlanCatalogKey | null {
  if (!cursor || cursor.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor)) {
    return null;
  }
  const [encodedPayload, suppliedSignature] = cursor.split(".");
  const expectedSignature = signature(encodedPayload);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Partial<FloorPlanCatalogCursorPayload>;
  const publishedAt = parsePublishedAt(value.p);
  if (
    value.v !== CURSOR_VERSION ||
    value.m !== (scope.mode === "browse" ? "b" : "s") ||
    value.q !== queryFingerprint(scope) ||
    !publishedAt ||
    !validIdentifier(value.r) ||
    !validIdentifier(value.a)
  ) {
    return null;
  }
  return { publishedAt, revisionId: value.r, bindingId: value.a };
}
