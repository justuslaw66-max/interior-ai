import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";

export type StructuredFloorPlanAddressQuery = {
  address: string;
  floor: string;
  stack: string;
};

export function buildStructuredFloorPlanAddressQuery(
  input: StructuredFloorPlanAddressQuery
) {
  const address = input.address.trim().replace(/\s+/g, " ");
  const floorValue = input.floor.trim();
  const stack = input.stack.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  const floor = /^\d{1,2}$/.test(floorValue) ? Number(floorValue) : null;
  const unit =
    floor !== null && floor >= 1 && floor <= 99 && /^\d{2,5}[A-Z]?$/.test(stack)
      ? `#${String(floor).padStart(2, "0")}-${stack}`
      : "";
  return [address, unit].filter(Boolean).join(" ");
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
