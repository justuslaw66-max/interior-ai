import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import type { FloorPlanExactSearchRequest } from "@/lib/floor-plan-directory-contract";

export type StructuredFloorPlanAddressQuery = {
  address: string;
  floor: string;
  stack: string;
};

export function buildStructuredFloorPlanAddressQuery(
  input: StructuredFloorPlanAddressQuery & {
    limit?: number;
    cursor?: string;
    revisionId?: string;
  }
): FloorPlanExactSearchRequest | null {
  const address = input.address.normalize("NFKC").trim().replace(/\s+/g, " ");
  const floorValue = input.floor.trim();
  const stack = input.stack.normalize("NFKC").trim().toUpperCase();
  const floor = /^\d{1,2}$/.test(floorValue) ? Number(floorValue) : null;
  if (
    address.length < 2 ||
    address.length > 240 ||
    floor === null ||
    floor < 1 ||
    floor > 99 ||
    !/^\d{2,5}[A-Z]?$/.test(stack)
  ) {
    return null;
  }
  return {
    mode: "search",
    countryCode: "SG",
    address: { normalizedText: address },
    unit: { floor, stack },
    limit: input.limit ?? 12,
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(input.revisionId ? { revisionId: input.revisionId } : {}),
  };
}

export function floorPlanSearchFacets(results: FloorPlanCatalogSearchResult[]) {
  return {
    projects: [...new Set(results.map((result) => result.projectName))].sort(),
    flatTypes: [...new Set(results.map((result) => result.flatType))].sort(),
  };
}

export function filterFloorPlanSearchResults(
  results: FloorPlanCatalogSearchResult[],
  filters: { project: string; flatType: string }
) {
  return results.filter(
    (result) =>
      (!filters.project || result.projectName === filters.project) &&
      (!filters.flatType || result.flatType === filters.flatType)
  );
}

export function groupFloorPlanSearchResults(results: FloorPlanCatalogSearchResult[]) {
  const groups = new Map<string, FloorPlanCatalogSearchResult[]>();
  for (const result of results) {
    const current = groups.get(result.projectName) ?? [];
    current.push(result);
    groups.set(result.projectName, current);
  }
  return [...groups.entries()].map(([projectName, plans]) => ({ projectName, plans }));
}
