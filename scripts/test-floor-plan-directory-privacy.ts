import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "../lib/bounded-request-body";
import { buildStructuredFloorPlanAddressQuery } from "../lib/floor-plan-consumer-search";
import {
  FloorPlanDirectoryRequestError,
  parseFloorPlanBrowseParameters,
  parseFloorPlanExactSearchRequest,
} from "../lib/floor-plan-directory-contract";
import {
  maskFloorPlanReplayNetworkRequest,
  sanitizeFloorPlanAnalyticsUrl,
  sanitizePostHogEvent,
} from "../lib/posthog-privacy";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const route = source("app/api/floor-plans/route.ts");
const search = source("components/editor/FloorPlanAddressSearch.tsx");
const fields = source("components/editor/FloorPlanAddressFields.tsx");
const results = source("components/editor/FloorPlanCatalogResultList.tsx");
const client = source("lib/floor-plan-directory-client.ts");
const revisionRoute = source("app/api/floor-plans/revisions/[id]/route.ts");
const replay = source("app/providers/PostHogProvider.tsx");

assert.doesNotMatch(search, /floor-plan-address-requested/);
assert.doesNotMatch(search, /floorPlanRequest(?:=1|\b)/);
assert.doesNotMatch(search, /new URLSearchParams\(\{\s*q:/);
assert.match(client, /method:\s*"POST"/);
assert.match(client, /"Content-Type":\s*"application\/json"/);
assert.match(search, /Upload your floor plan/);
assert.doesNotMatch(search, /Request (?:noted|this address)|requestRecorded/);

assert.match(route, /export async function POST/);
assert.doesNotMatch(route, /searchParams\.get\("q"\)/);
assert.match(route, /readBoundedJsonObject/);
assert.match(route, /8_192/);
assert.match(route, /takeSharedRateLimit/);
assert.match(route, /SAFE_CACHE_CONTROL = "no-store, max-age=0"/);
assert.match(route, /"Cache-Control": SAFE_CACHE_CONTROL/);

for (const privateField of [
  "unitQuery",
  "unitMatches",
  "floorMin",
  "floorMax",
  "addressNormalized",
]) {
  assert.doesNotMatch(route, new RegExp(`\\b${privateField}\\b`));
}
assert.doesNotMatch(revisionRoute, /addressBindings:\s*revision\.addressBindings\.map/);

assert.match(fields, /ph-no-capture/);
assert.match(results, /ph-no-capture/);
assert.match(results, /Exact unit match/);
assert.doesNotMatch(results, /unitMatches|unitMatch\.label|unitMatch\.block/);

assert.match(replay, /maskAllInputs:\s*true/);
assert.match(replay, /recordHeaders:\s*false/);
assert.match(replay, /recordBody:\s*false/);
assert.match(replay, /maskCapturedNetworkRequestFn/);
assert.match(replay, /get_current_url/);
assert.match(replay, /before_send:\s*sanitizePostHogEvent/);
assert.match(replay, /try \{[\s\S]*?posthog\.init[\s\S]*?catch \{[\s\S]*?setClientAnalyticsDisabled\(true\)/);

const browse = parseFloorPlanBrowseParameters(
  new URLSearchParams({ browse: "1", limit: "12" })
);
assert.deepEqual(browse, { limit: 12, cursor: null });
for (const name of ["q", "address", "floor", "stack", "unit", "exactUnit"]) {
  assert.throws(
    () => parseFloorPlanBrowseParameters(
      new URLSearchParams({ browse: "1", [name]: "PRIVATE-SENTINEL" })
    ),
    (cause) => cause instanceof FloorPlanDirectoryRequestError &&
      cause.code === "PRIVATE_GET_PARAMETER" &&
      cause.parameter === name
  );
}
for (const params of [
  new URLSearchParams({ browse: "0" }),
  new URLSearchParams({ browse: "1", limit: "0" }),
  new URLSearchParams({ browse: "1", limit: "not-a-number" }),
  new URLSearchParams({ browse: "1", facet: "private" }),
]) {
  assert.throws(() => parseFloorPlanBrowseParameters(params));
}

const sentinel = {
  address: "867A Exact Privacy Sentinel Street",
  floor: "73",
  stack: "731",
};
const requestBody = buildStructuredFloorPlanAddressQuery({ ...sentinel, limit: 12 });
assert.ok(requestBody);
const serializedBody = JSON.stringify(requestBody);
assert.match(serializedBody, /Exact Privacy Sentinel/);
assert.match(serializedBody, /"floor":73/);
assert.match(serializedBody, /"stack":"731"/);
assert.equal("/api/floor-plans".includes("Exact Privacy Sentinel"), false);

const parsed = parseFloorPlanExactSearchRequest(requestBody);
assert.equal(parsed.countryCode, "SG");
assert.equal(parsed.unit.floor, 73);
assert.equal(parsed.unit.stack, "731");
for (const mutation of [
  { ...requestBody, countryCode: "US" },
  { ...requestBody, unit: { floor: 0, stack: "731" } },
  { ...requestBody, unit: { floor: 73, stack: "bad-stack" } },
  { ...requestBody, unit: { floor: 73 } },
  { ...requestBody, unit: null },
]) {
  assert.throws(() => parseFloorPlanExactSearchRequest(mutation));
}

const sanitizedUrl = sanitizeFloorPlanAnalyticsUrl(
  "https://example.com/design?address=PRIVATE&q=SECRET&browse=1&floorPlanRequest=1#plan"
);
assert.equal(sanitizedUrl.includes("PRIVATE"), false);
assert.equal(sanitizedUrl.includes("SECRET"), false);
assert.equal(sanitizedUrl, "https://example.com/design");
assert.doesNotMatch(sanitizedUrl, /floorPlanRequest/i);
assert.equal(
  sanitizeFloorPlanAnalyticsUrl("/design/private?unit=PRIVATE#fragment"),
  "/design/private"
);
assert.equal(
  sanitizeFloorPlanAnalyticsUrl("https://[invalid/?private=PRIVATE#fragment"),
  ""
);

const replayRequest = maskFloorPlanReplayNetworkRequest({
  name: "https://example.com/api/floor-plans?address=PRIVATE",
  entryType: "resource",
  duration: 1,
  startTime: 0,
  requestHeaders: {
    Authorization: "Bearer SECRET",
    Cookie: "session=SECRET",
    "X-Anonymous-ID": "SECRET-ID",
  },
  responseHeaders: { "Set-Cookie": "SECRET" },
  requestBody: serializedBody,
  responseBody: serializedBody,
});
assert.equal(replayRequest.requestBody, null);
assert.equal(replayRequest.responseBody, null);
assert.deepEqual(replayRequest.requestHeaders, {});
assert.deepEqual(replayRequest.responseHeaders, {});
assert.equal(replayRequest.name.includes("PRIVATE"), false);
const futureRequest = maskFloorPlanReplayNetworkRequest({
  name: "/api/floor-plan-requests",
  entryType: "resource",
  duration: 1,
  startTime: 0,
  requestBody: serializedBody,
});
assert.equal(futureRequest.requestBody, null);

const analyticsSentinel = "C1-REFERRER-QUERY-SENTINEL-9D7E";
const analytics = sanitizePostHogEvent({
  uuid: "00000000-0000-4000-8000-000000000001",
  event: "floor_plan_test",
  properties: {
    countryCode: "SG",
    mode: "search",
    address: sentinel.address,
    unitFloor: 73,
    bindingId: "binding-private",
    addressTransform: "mirror_x",
    $current_url: `https://example.com/current?private=${analyticsSentinel}#fragment`,
    $initial_current_url: `/initial?private=${analyticsSentinel}#fragment`,
    $session_entry_url: `https://example.com/session?private=${analyticsSentinel}`,
    $referrer: `https://referrer.example/source?private=${analyticsSentinel}#fragment`,
    $initial_referrer: `/initial-referrer?private=${analyticsSentinel}`,
    $session_entry_referrer: `https://referrer.example/session?private=${analyticsSentinel}`,
    CHECKOUTUrl: `/checkout?private=${analyticsSentinel}#fragment`,
    malformed_referrer: `https://[invalid/?private=${analyticsSentinel}`,
  },
  $set: {
    profile_url: `https://example.com/profile?private=${analyticsSentinel}`,
    cohort: "floor-plan-consumer",
  },
  $set_once: {
    Initial_Referrer: `/signup?private=${analyticsSentinel}#fragment`,
    signupSource: "editor",
  },
});
assert.ok(analytics);
assert.deepEqual(analytics.properties, {
  countryCode: "SG",
  mode: "search",
  $current_url: "https://example.com/current",
  $initial_current_url: "/initial",
  $session_entry_url: "https://example.com/session",
  $referrer: "https://referrer.example/source",
  $initial_referrer: "/initial-referrer",
  $session_entry_referrer: "https://referrer.example/session",
  CHECKOUTUrl: "/checkout",
  malformed_referrer: "",
});
assert.deepEqual(analytics.$set, {
  profile_url: "https://example.com/profile",
  cohort: "floor-plan-consumer",
});
assert.deepEqual(analytics.$set_once, {
  Initial_Referrer: "/signup",
  signupSource: "editor",
});
assert.doesNotMatch(JSON.stringify(analytics), new RegExp(analyticsSentinel));

const throwingProperties = {};
Object.defineProperty(throwingProperties, "$referrer", {
  enumerable: true,
  get() {
    throw new Error("synthetic sanitizer failure");
  },
});
assert.equal(sanitizePostHogEvent({
  uuid: "00000000-0000-4000-8000-000000000002",
  event: "floor_plan_test",
  properties: throwingProperties,
}), null, "Sanitizer failures must drop the unsafe event instead of returning it raw");

async function main() {
  await assert.rejects(
    readBoundedJsonObject(new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(100) }),
    }), 16),
    RequestBodyTooLargeError
  );
  await assert.rejects(
    readBoundedJsonObject(new Request("https://example.com", {
      method: "POST",
      body: "not-json",
    }), 128)
  );
  await assert.rejects(
    readBoundedJsonObject(new Request("https://example.com", {
      method: "POST",
      body: "[]",
    }), 128)
  );
  console.log("floor-plan directory privacy tests passed");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
