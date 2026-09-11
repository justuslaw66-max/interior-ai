const MAX_ADDRESS_LENGTH = 240;
const MAX_CURSOR_LENGTH = 1_024;
const MAX_PAGE_SIZE = 50;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9:_-]{0,190}$/i;
const SINGAPORE_STACK = /^\d{2,5}[A-Z]?$/;
const BROWSE_PARAMETERS = new Set(["browse", "limit", "cursor"]);

export const FLOOR_PLAN_PRIVATE_GET_PARAMETERS = new Set([
  "q",
  "query",
  "search",
  "address",
  "addressNormalized",
  "postal",
  "postcode",
  "floor",
  "floorNumber",
  "stack",
  "unit",
  "unitNumber",
  "unitFloor",
  "unitStack",
  "exactUnit",
]);

export type FloorPlanExactSearch = {
  countryCode: "SG";
  address: string;
  unit: { floor: number; stack: string };
  revisionId?: string;
};

export type FloorPlanExactSearchRequest = {
  mode: "search";
  countryCode: "SG";
  address: { normalizedText: string };
  unit: { floor: number; stack: string };
  limit: number;
  cursor?: string;
  revisionId?: string;
};

export type FloorPlanDirectoryRequestErrorCode =
  | "INVALID_BROWSE_PARAMETER"
  | "PRIVATE_GET_PARAMETER"
  | "INVALID_EXACT_SEARCH";

export class FloorPlanDirectoryRequestError extends Error {
  constructor(
    public readonly code: FloorPlanDirectoryRequestErrorCode,
    public readonly parameter?: string
  ) {
    super(code);
    this.name = "FloorPlanDirectoryRequestError";
  }
}

function normalizedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return text.length > 0 && text.length <= maximum ? text : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pageLimit(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= MAX_PAGE_SIZE
    ? number
    : null;
}

function invalidExactRequest(): never {
  throw new FloorPlanDirectoryRequestError("INVALID_EXACT_SEARCH");
}

function exactEnvelope(value: Record<string, unknown>) {
  const address = record(value.address);
  const unit = record(value.unit);
  const countryCode = normalizedText(value.countryCode, 2)?.toUpperCase();
  if (
    !exactKeys(value, ["mode", "countryCode", "address", "unit", "limit", "cursor", "revisionId"]) ||
    value.mode !== "search" ||
    countryCode !== "SG" ||
    !address ||
    !exactKeys(address, ["normalizedText"]) ||
    !unit ||
    !exactKeys(unit, ["floor", "stack"])
  ) invalidExactRequest();
  return { address, unit };
}

function exactUnit(value: Record<string, unknown>) {
  const floor = value.floor;
  const stack = normalizedText(value.stack, 6)?.toUpperCase() ?? null;
  if (
    !Number.isSafeInteger(floor) ||
    Number(floor) < 1 ||
    Number(floor) > 99 ||
    !stack ||
    !SINGAPORE_STACK.test(stack)
  ) invalidExactRequest();
  return { floor: Number(floor), stack };
}

function optionalCursor(value: unknown) {
  if (value === undefined) return undefined;
  return normalizedText(value, MAX_CURSOR_LENGTH) ?? invalidExactRequest();
}

function optionalRevisionId(value: unknown) {
  if (value === undefined) return undefined;
  const revisionId = normalizedText(value, 191);
  return revisionId && SAFE_IDENTIFIER.test(revisionId)
    ? revisionId
    : invalidExactRequest();
}

export function parseFloorPlanBrowseParameters(searchParams: URLSearchParams) {
  for (const [name] of searchParams) {
    if (FLOOR_PLAN_PRIVATE_GET_PARAMETERS.has(name)) {
      throw new FloorPlanDirectoryRequestError("PRIVATE_GET_PARAMETER", name);
    }
    if (!BROWSE_PARAMETERS.has(name)) {
      throw new FloorPlanDirectoryRequestError("INVALID_BROWSE_PARAMETER", name);
    }
  }
  if (searchParams.get("browse") !== "1") {
    throw new FloorPlanDirectoryRequestError("INVALID_BROWSE_PARAMETER", "browse");
  }
  const limit = pageLimit(searchParams.get("limit"), 24);
  const cursor = searchParams.get("cursor");
  if (
    limit === null ||
    (cursor !== null && (!cursor || cursor.length > MAX_CURSOR_LENGTH))
  ) {
    throw new FloorPlanDirectoryRequestError("INVALID_BROWSE_PARAMETER");
  }
  return { limit, cursor };
}

export function parseFloorPlanExactSearchRequest(
  value: Record<string, unknown>
): FloorPlanExactSearchRequest {
  const { address, unit } = exactEnvelope(value);
  const normalizedAddress = normalizedText(address.normalizedText, MAX_ADDRESS_LENGTH);
  if (!normalizedAddress) invalidExactRequest();
  const parsedUnit = exactUnit(unit);
  const limit = pageLimit(value.limit, 24);
  if (limit === null) invalidExactRequest();
  const cursor = optionalCursor(value.cursor);
  const revisionId = optionalRevisionId(value.revisionId);
  return {
    mode: "search",
    countryCode: "SG",
    address: { normalizedText: normalizedAddress },
    unit: parsedUnit,
    limit,
    ...(cursor ? { cursor } : {}),
    ...(revisionId ? { revisionId } : {}),
  };
}

export function exactSearchFromRequest(
  request: FloorPlanExactSearchRequest
): FloorPlanExactSearch {
  return {
    countryCode: request.countryCode,
    address: request.address.normalizedText,
    unit: { ...request.unit },
    ...(request.revisionId ? { revisionId: request.revisionId } : {}),
  };
}
