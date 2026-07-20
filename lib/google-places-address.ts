import type {
  GoogleAddressSuggestion,
  GoogleResolvedAddress,
} from "@/lib/google-address-types";

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const GOOGLE_AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text.text",
  "suggestions.placePrediction.structuredFormat.mainText.text",
  "suggestions.placePrediction.structuredFormat.secondaryText.text",
].join(",");
const GOOGLE_DETAILS_FIELD_MASK = [
  "id",
  "formattedAddress",
  "postalAddress",
  "addressComponents",
  "location",
].join(",");

type GoogleLocalizedText = { text?: unknown };
type GoogleAddressComponent = {
  longText?: unknown;
  shortText?: unknown;
  types?: unknown;
};

export class GooglePlacesNotConfiguredError extends Error {
  constructor() {
    super("Google address search is not configured");
    this.name = "GooglePlacesNotConfiguredError";
  }
}

export class GooglePlacesUpstreamError extends Error {
  readonly status: number;
  readonly reason: string;

  constructor(status: number, reason = "") {
    super("Google address search is temporarily unavailable");
    this.name = "GooglePlacesUpstreamError";
    this.status = status;
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readLocalizedText(value: unknown) {
  if (!isRecord(value)) return "";
  return readText((value as GoogleLocalizedText).text);
}

async function googleUpstreamError(response: Response) {
  return new GooglePlacesUpstreamError(response.status, `status_${response.status}`);
}

async function readBoundedGoogleJson(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 1024 * 1024) {
    throw new GooglePlacesUpstreamError(502, "response_too_large");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 1024 * 1024) {
    throw new GooglePlacesUpstreamError(502, "response_too_large");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GooglePlacesUpstreamError(502, "invalid_json");
  }
}

function googleMapsApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
  if (!key) throw new GooglePlacesNotConfiguredError();
  return key;
}

export function isGoogleMapsAddressConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

export function normalizeGoogleCountryCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error("Country code must contain two letters");
  }
  return normalized;
}

export function normalizeGoogleSessionToken(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalized)) {
    throw new Error("Invalid Google address session token");
  }
  return normalized;
}

export function normalizeGooglePlaceId(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{10,256}$/.test(normalized)) {
    throw new Error("Invalid Google place identifier");
  }
  return normalized;
}

export function parseGoogleAddressSuggestions(
  value: unknown
): GoogleAddressSuggestion[] {
  if (!isRecord(value) || !Array.isArray(value.suggestions)) return [];
  return value.suggestions.slice(0, 20).flatMap((suggestion) => {
    if (!isRecord(suggestion) || !isRecord(suggestion.placePrediction)) {
      return [];
    }
    const prediction = suggestion.placePrediction;
    const placeId = readText(prediction.placeId);
    const text = isRecord(prediction.text)
      ? readLocalizedText(prediction.text)
      : "";
    const structured = isRecord(prediction.structuredFormat)
      ? prediction.structuredFormat
      : null;
    const mainText = structured
      ? readLocalizedText(structured.mainText)
      : text;
    const secondaryText = structured
      ? readLocalizedText(structured.secondaryText)
      : "";
    if (!/^[A-Za-z0-9_-]{10,256}$/.test(placeId) || !text) return [];
    return [{ placeId, text, mainText: mainText || text, secondaryText }];
  });
}

function addressComponent(
  components: GoogleAddressComponent[],
  acceptedTypes: string[],
  preferShort = false
) {
  const accepted = new Set(acceptedTypes);
  const component = components.find((entry) =>
    Array.isArray(entry.types) &&
    entry.types.some((type) => typeof type === "string" && accepted.has(type))
  );
  if (!component) return "";
  const preferred = preferShort ? component.shortText : component.longText;
  return readText(preferred) || readText(component.longText) || readText(component.shortText);
}

export function parseGoogleResolvedAddress(
  value: unknown,
  expectedPlaceId: string
): GoogleResolvedAddress {
  if (!isRecord(value)) {
    throw new Error("Google returned an invalid address response");
  }
  const components = Array.isArray(value.addressComponents)
    ? value.addressComponents.slice(0, 100).filter(isRecord) as GoogleAddressComponent[]
    : [];
  const postalAddress = isRecord(value.postalAddress) ? value.postalAddress : null;
  const addressLines = postalAddress && Array.isArray(postalAddress.addressLines)
    ? postalAddress.addressLines.slice(0, 20).map((line) => readText(line, 300)).filter(Boolean)
    : [];
  const formattedAddress = readText(value.formattedAddress);
  const streetNumber = addressComponent(components, ["street_number", "premise"]);
  const street = addressComponent(components, ["route"]);
  const countryCode = (
    (postalAddress ? readText(postalAddress.regionCode) : "") ||
    addressComponent(components, ["country"], true)
  ).toUpperCase();
  const postalCode = addressComponent(components, ["postal_code"]);
  const returnedPlaceId = readText(value.id, 256);
  const addressNormalized = addressLines.join(", ") || formattedAddress;
  const location = isRecord(value.location) ? value.location : null;
  const latitude = location && typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90
    ? location.latitude
    : null;
  const longitude = location && typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180
    ? location.longitude
    : null;
  if (!addressNormalized || !countryCode) {
    throw new Error("Google could not provide a complete postal address");
  }
  return {
    provider: "google",
    placeId: /^[A-Za-z0-9_-]{10,256}$/.test(returnedPlaceId)
      ? returnedPlaceId
      : expectedPlaceId,
    addressNormalized,
    formattedAddress: formattedAddress || addressNormalized,
    countryCode,
    postalCode,
    block: streetNumber,
    street,
    latitude,
    longitude,
  };
}

export async function searchGoogleAddresses(input: {
  query: string;
  countryCode: string;
  sessionToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleAddressSuggestion[]> {
  const query = input.query.trim();
  if (query.length < 3 || query.length > 120) {
    throw new Error("Address search must contain 3 to 120 characters");
  }
  const countryCode = normalizeGoogleCountryCode(input.countryCode);
  const sessionToken = normalizeGoogleSessionToken(input.sessionToken);
  const response = await (input.fetchImpl ?? fetch)(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleMapsApiKey(),
      "X-Goog-FieldMask": GOOGLE_AUTOCOMPLETE_FIELD_MASK,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: [countryCode.toLowerCase()],
      regionCode: countryCode.toLowerCase(),
      languageCode: "en",
      sessionToken,
    }),
  });
  if (!response.ok) throw await googleUpstreamError(response);
  return parseGoogleAddressSuggestions(await readBoundedGoogleJson(response));
}

export async function resolveGoogleAddress(input: {
  placeId: string;
  sessionToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleResolvedAddress> {
  const placeId = normalizeGooglePlaceId(input.placeId);
  const sessionToken = normalizeGoogleSessionToken(input.sessionToken);
  const url = new URL(`${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeId)}`);
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("languageCode", "en");
  const response = await (input.fetchImpl ?? fetch)(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
    headers: {
      "X-Goog-Api-Key": googleMapsApiKey(),
      "X-Goog-FieldMask": GOOGLE_DETAILS_FIELD_MASK,
    },
  });
  if (!response.ok) throw await googleUpstreamError(response);
  return parseGoogleResolvedAddress(await readBoundedGoogleJson(response), placeId);
}
