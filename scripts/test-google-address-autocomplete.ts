import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GooglePlacesNotConfiguredError,
  normalizeGoogleCountryCode,
  normalizeGooglePlaceId,
  normalizeGoogleSessionToken,
  parseGoogleResolvedAddress,
  resolveGoogleAddress,
  searchGoogleAddresses,
} from "@/lib/google-places-address";

async function main() {
const previousKey = process.env.GOOGLE_MAPS_API_KEY;
process.env.GOOGLE_MAPS_API_KEY = "test-server-side-key";

assert.equal(normalizeGoogleCountryCode(" sg "), "SG");
assert.throws(() => normalizeGoogleCountryCode("Singapore"), /two letters/);
assert.equal(
  normalizeGoogleSessionToken("550e8400-e29b-41d4-a716-446655440000"),
  "550e8400-e29b-41d4-a716-446655440000"
);
assert.throws(() => normalizeGoogleSessionToken("short"), /session token/);
assert.equal(normalizeGooglePlaceId("ChIJ-address_123"), "ChIJ-address_123");
assert.throws(() => normalizeGooglePlaceId("bad"), /place identifier/);

const autocompleteCalls: Array<{ url: string; init?: RequestInit }> = [];
const suggestions = await searchGoogleAddresses({
  query: "810A Chai Chee",
  countryCode: "SG",
  sessionToken: "550e8400-e29b-41d4-a716-446655440000",
  fetchImpl: async (input, init) => {
    autocompleteCalls.push({ url: String(input), init });
    return Response.json({
      suggestions: [{
        placePrediction: {
          placeId: "ChIJ-address_123",
          text: { text: "810A Chai Chee Street, Singapore" },
          structuredFormat: {
            mainText: { text: "810A Chai Chee Street" },
            secondaryText: { text: "Singapore" },
          },
        },
      }],
    });
  },
});
assert.deepEqual(suggestions, [{
  placeId: "ChIJ-address_123",
  text: "810A Chai Chee Street, Singapore",
  mainText: "810A Chai Chee Street",
  secondaryText: "Singapore",
}]);
assert.equal(autocompleteCalls.length, 1);
assert.equal(autocompleteCalls[0].url, "https://places.googleapis.com/v1/places:autocomplete");
assert.deepEqual(
  JSON.parse(String(autocompleteCalls[0].init?.body)),
  {
    input: "810A Chai Chee",
    includedRegionCodes: ["sg"],
    regionCode: "sg",
    languageCode: "en",
    sessionToken: "550e8400-e29b-41d4-a716-446655440000",
  }
);

const googleDetail = {
  id: "ChIJ-address_123",
  formattedAddress: "810A Chai Chee Street, Singapore 461810",
  postalAddress: {
    regionCode: "SG",
    addressLines: ["810A Chai Chee Street"],
  },
  addressComponents: [
    { longText: "810A", shortText: "810A", types: ["street_number"] },
    { longText: "Chai Chee Street", shortText: "Chai Chee St", types: ["route"] },
    { longText: "461810", shortText: "461810", types: ["postal_code"] },
    { longText: "Singapore", shortText: "SG", types: ["country"] },
  ],
  location: { latitude: 1.324, longitude: 103.923 },
};
assert.deepEqual(parseGoogleResolvedAddress(googleDetail, "fallback-place"), {
  provider: "google",
  placeId: "ChIJ-address_123",
  addressNormalized: "810A Chai Chee Street",
  formattedAddress: "810A Chai Chee Street, Singapore 461810",
  countryCode: "SG",
  postalCode: "461810",
  block: "810A",
  street: "Chai Chee Street",
  latitude: 1.324,
  longitude: 103.923,
});

const resolved = await resolveGoogleAddress({
  placeId: "ChIJ-address_123",
  sessionToken: "550e8400-e29b-41d4-a716-446655440000",
  fetchImpl: async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/v1/places/ChIJ-address_123");
    assert.equal(url.searchParams.get("sessionToken"), "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(init?.cache, "no-store");
    return Response.json(googleDetail);
  },
});
assert.equal(resolved.postalCode, "461810");

delete process.env.GOOGLE_MAPS_API_KEY;
await assert.rejects(
  searchGoogleAddresses({
    query: "810A Chai Chee",
    countryCode: "SG",
    sessionToken: "550e8400-e29b-41d4-a716-446655440000",
    fetchImpl: async () => Response.json({ suggestions: [] }),
  }),
  GooglePlacesNotConfiguredError
);
if (previousKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
else process.env.GOOGLE_MAPS_API_KEY = previousKey;

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const route = read("app/api/address-autocomplete/route.ts");
const component = read("components/GoogleAddressAutocomplete.tsx");
const adminEditor = read("app/admin/floor-plans/[id]/AddressBindingEditor.tsx");
const consumerFields = read("components/editor/FloorPlanAddressFields.tsx");
const envExample = read(".env.example");

assert.match(route, /readBoundedJsonObject\(request, MAX_BODY_BYTES\)/);
assert.match(route, /takeSharedRateLimit[\s\S]*?scope: "google-address"/);
assert.match(route, /"Cache-Control": "private, no-store, max-age=0"/);
assert.match(component, /sessionTokenRef[\s\S]*?newSessionToken/);
assert.match(component, /window\.setTimeout\(async \(\) =>[\s\S]*?300/);
assert.match(component, /translate="no"[\s\S]*?Google Maps/);
assert.match(component, /manual entry still works/);
assert.match(adminEditor, /onSelect=\{applyGoogleAddress\}/);
assert.match(adminEditor, /countryCode: address\.countryCode[\s\S]*?postalCode: address\.postalCode/);
assert.match(adminEditor, /uploaded plan still needs independent source proof/);
assert.match(consumerFields, /GoogleAddressAutocomplete/);
assert.match(consumerFields, /floor-plan-address-search/);
assert.match(envExample, /GOOGLE_MAPS_API_KEY=""/);
assert.doesNotMatch(component + route, /NEXT_PUBLIC_GOOGLE/);

console.log("Google address autocomplete checks passed.");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
