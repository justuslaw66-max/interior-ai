import type { CaptureResult, CapturedNetworkRequest, Properties } from "posthog-js";

const SENSITIVE_QUERY_PARAMETERS = new Set([
  "q",
  "query",
  "search",
  "address",
  "addressnormalized",
  "postal",
  "postcode",
  "floor",
  "floornumber",
  "stack",
  "unit",
  "unitnumber",
  "unitfloor",
  "unitstack",
  "exactunit",
  "floorplanrequest",
]);

const SENSITIVE_PROPERTY_KEYS = new Set([
  ...SENSITIVE_QUERY_PARAMETERS,
  "placeid",
  "providersessiontoken",
  "bindingid",
  "selectedbindingid",
  "addresstransform",
  "requestbody",
]);

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-anonymous-id",
]);

const KNOWN_URL_PROPERTY_KEYS = new Set([
  "$current_url",
  "$initial_current_url",
  "$session_entry_url",
  "$referrer",
  "$initial_referrer",
  "$session_entry_referrer",
]);

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function sanitizeFloorPlanAnalyticsUrl(value: string) {
  try {
    const relative = !/^[a-z][a-z\d+.-]*:/i.test(value);
    const protocolRelative = value.startsWith("//");
    const url = new URL(value, "https://privacy.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (protocolRelative) return `//${url.host}${url.pathname}`;
    return relative ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function sanitizeHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !SENSITIVE_HEADERS.has(key.toLowerCase()))
  );
}

function isPrivateFloorPlanEndpoint(value: string) {
  try {
    const path = new URL(value, "https://privacy.invalid").pathname;
    return path === "/api/floor-plans" || path === "/api/floor-plan-requests";
  } catch {
    return false;
  }
}

export function maskFloorPlanReplayNetworkRequest(
  request: CapturedNetworkRequest
): CapturedNetworkRequest {
  const name = sanitizeFloorPlanAnalyticsUrl(request.name);
  const protectedEndpoint = isPrivateFloorPlanEndpoint(request.name);
  return {
    ...request,
    name,
    requestHeaders: protectedEndpoint ? {} : sanitizeHeaders(request.requestHeaders),
    responseHeaders: protectedEndpoint ? {} : sanitizeHeaders(request.responseHeaders),
    requestBody: protectedEndpoint ? null : request.requestBody,
    responseBody: protectedEndpoint ? null : request.responseBody,
  };
}

function sanitizeProperties(properties: Properties | undefined): Properties | undefined {
  if (!properties) return properties;
  const sanitized: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    const normalized = normalizeKey(key);
    if (SENSITIVE_PROPERTY_KEYS.has(normalized)) continue;
    const propertyKey = key.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const isUrlProperty =
      KNOWN_URL_PROPERTY_KEYS.has(propertyKey) ||
      propertyKey.endsWith("_url") ||
      propertyKey.endsWith("_referrer") ||
      normalized.endsWith("url") ||
      normalized.endsWith("referrer");
    if (isUrlProperty) {
      if (typeof value === "string") {
        sanitized[key] = sanitizeFloorPlanAnalyticsUrl(value);
      }
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export function sanitizePostHogEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  try {
    return {
      ...event,
      properties: sanitizeProperties(event.properties) ?? {},
      $set: sanitizeProperties(event.$set),
      $set_once: sanitizeProperties(event.$set_once),
    };
  } catch {
    return null;
  }
}
