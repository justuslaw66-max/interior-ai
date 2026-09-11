import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import type { PrivateFloorPlanExactSelection } from "@/lib/floor-plan-catalog-client";
import type { FloorPlanExactSearchRequest } from "@/lib/floor-plan-directory-contract";

import { parseFloorPlanDirectoryResponse } from "@/lib/floor-plan-directory-response";

export async function readFloorPlanDirectoryResponse(
  response: Response, expectedMode?: "browse" | "search"
) {
  if (!response.ok) throw new Error(response.status === 429
    ? "Too many floor-plan searches. Please wait and try again."
    : "Floor-plan search is unavailable. Please try again later.");
  return parseFloorPlanDirectoryResponse(await response.json().catch(() => null), expectedMode);
}

export async function postExactFloorPlanSearch(
  request: FloorPlanExactSearchRequest,
  signal?: AbortSignal
) {
  return readFloorPlanDirectoryResponse(await fetch("/api/floor-plans", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  }), "search");
}

export async function fetchFloorPlanBrowsePage(cursor: string | null) {
  const params = new URLSearchParams({ browse: "1", limit: "12" });
  if (cursor) params.set("cursor", cursor);
  return readFloorPlanDirectoryResponse(await fetch(`/api/floor-plans?${params}`), "browse");
}

export async function fetchPublicFloorPlanRevision(
  result: FloorPlanCatalogSearchResult,
  signal?: AbortSignal
) {
  if (result.revisionUrl !== `/api/floor-plans/revisions/${encodeURIComponent(result.revisionId)}`) {
    throw new Error("The selected floor-plan revision is invalid.");
  }
  const response = await fetch(result.revisionUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error("The verified floor plan could not be loaded.");
  }
  return payload;
}

export function privateSelectionFromSearchRequest(
  request: FloorPlanExactSearchRequest
): PrivateFloorPlanExactSelection {
  return {
    address: request.address.normalizedText,
    floor: request.unit.floor,
    stack: request.unit.stack,
  };
}

export function exactSearchRequestFromPrivateSelection(
  selection: PrivateFloorPlanExactSelection,
  options: { limit?: number; revisionId?: string } = {}
): FloorPlanExactSearchRequest {
  return {
    mode: "search",
    countryCode: "SG",
    address: { normalizedText: selection.address },
    unit: { floor: selection.floor, stack: selection.stack },
    limit: options.limit ?? 12,
    ...(options.revisionId ? { revisionId: options.revisionId } : {}),
  };
}

export async function resolveExactFloorPlanAuthoredVariant(
  selection: PrivateFloorPlanExactSelection,
  revisionId: string,
  signal?: AbortSignal
) {
  const payload = await postExactFloorPlanSearch(
    exactSearchRequestFromPrivateSelection(selection, { revisionId }),
    signal
  );
  const selected = payload.results[0];
  if (payload.results.length !== 1 || !selected || selected.revisionId !== revisionId) {
    throw new Error("The selected reviewed layout is unavailable for this unit.");
  }
  return selected;
}
