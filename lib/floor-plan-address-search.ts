import type { HousePlanTemplate } from "@/lib/design-page-house-plan";
import type {
  FloorPlanLibraryCatalog,
  FloorPlanLibraryLayout,
} from "@/lib/floor-plan-library-schema";
import { resolveFloorPlanRoomIdentities } from "@/lib/floor-plan-room-labels";

export type FloorPlanLibrarySearchResult = {
  id: string;
  planId: string;
  projectName: string;
  addressLabel: string;
  matchedBlocks: string[];
  layoutId: string;
  label: string;
  flatType: string;
  bedroomCount: number;
  floorAreaSqm: number | null;
  previewUrl: string;
  sourcePage: number;
  sourceUrl: string;
  sourceTitle: string;
  publisher: string;
  fidelity: "approximate_editable";
  verificationNote: string;
  accuracyNotice: string;
  matchLevel: "street" | "block" | "unit";
  unitMatches: FloorPlanLibraryUnitMatch[];
  template: HousePlanTemplate;
};

export type FloorPlanLibraryUnitQuery = {
  floor: number;
  stack: string;
  label: string;
};

export type FloorPlanLibraryUnitMatch = FloorPlanLibraryUnitQuery & {
  block: string;
  distributionStatus: "partial" | "verified";
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourcePdfPage: number;
  sourceBrochurePage: number;
};

export function parseFloorPlanUnitNumber(
  value: string
): FloorPlanLibraryUnitQuery | null {
  const match = value
    .normalize("NFKD")
    .match(/(?:#|\bunit\s*#?\s*)(\d{1,2})\s*[-/]\s*(\d{2,5}[a-z]?)\b/i);
  if (!match) return null;

  const floor = Number(match[1]);
  if (!Number.isInteger(floor) || floor < 1 || floor > 99) return null;
  const stack = match[2].toUpperCase();
  return {
    floor,
    stack,
    label: `#${String(floor).padStart(2, "0")}-${stack}`,
  };
}

export function normalizeFloorPlanAddress(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\bunit\s*#?\s*\d{1,2}\s*[-/]\s*\d{2,5}[a-z]?\b/g, " ")
    .replace(/#\s*\d{1,2}\s*[-/]\s*\d{2,5}[a-z]?\b/g, " ")
    .replace(/\b(?:blk|block)\b/g, " ")
    .replace(/\bst\b/g, "street")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  const normalized = normalizeFloorPlanAddress(value);
  return normalized ? normalized.split(" ") : [];
}

function includesEveryToken(haystack: string, queryTokens: string[]): boolean {
  const haystackTokens = new Set(tokenize(haystack));
  return queryTokens.every((token) => haystackTokens.has(token));
}

function getLibraryTemplateId(planId: string, layoutId: string): `library_${string}` {
  const normalizedPlanId = planId.replace(/-/g, "_");
  const normalizedLayoutId = layoutId.replace(/-/g, "_");
  return `library_${normalizedPlanId}__${normalizedLayoutId}`;
}

function layoutToTemplate(
  catalog: FloorPlanLibraryCatalog,
  layout: FloorPlanLibraryLayout
): HousePlanTemplate {
  const roomIdentities = resolveFloorPlanRoomIdentities(layout.template.rooms);
  return {
    id: getLibraryTemplateId(catalog.floor_plan.plan_id, layout.layout_id),
    label: `${layout.label} - ${catalog.floor_plan.project_name}`,
    summary: layout.template.summary,
    bestFor: layout.template.best_for,
    layoutType: layout.template.layout_type,
    footprint: layout.template.footprint,
    bedroomCount: layout.bedroom_count,
    tags: layout.template.tags,
    zones: layout.template.zones,
    realLifeChecks: layout.template.real_life_checks,
    rooms: layout.template.rooms.map((room, index) => ({
      id: room.id,
      name: roomIdentities[index].name,
      roomType: roomIdentities[index].roomType,
      shape: room.shape,
      width: room.width,
      depth: room.depth,
      x: room.x,
      z: room.z,
      ...(room.wall_thickness !== undefined
        ? { wallThickness: room.wall_thickness }
        : {}),
      ...(room.plan_polygon
        ? {
            planPolygon: room.plan_polygon.map((point) => ({ ...point })),
          }
        : {}),
    })),
    doorways: layout.template.doorways.map((doorway) => ({
      fromRoomId: doorway.from_room_id,
      ...(doorway.to_room_id ? { toRoomId: doorway.to_room_id } : {}),
      wall: doorway.wall,
      offsetMeters: doorway.offset_meters,
      widthMeters: doorway.width_meters,
      kind: doorway.kind,
    })),
    windows: layout.template.windows.map((window) => ({
      roomId: window.room_id,
      wall: window.wall,
      offsetMeters: window.offset_meters,
      widthMeters: window.width_meters,
    })),
    referenceZones: layout.template.reference_zones.map((zone) => ({
      id: zone.id,
      label: zone.label,
      kind: zone.kind,
      width: zone.width,
      depth: zone.depth,
      x: zone.x,
      z: zone.z,
      locked: zone.locked,
    })),
    furnishingPacks: [],
  };
}

type CatalogMatch = {
  catalog: FloorPlanLibraryCatalog;
  matchedBuildingIds: string[];
  matchedBlocks: string[];
  addressMatchLevel: "street" | "block";
  score: number;
};

type FloorPlanLibraryBuilding = FloorPlanLibraryCatalog["address"]["buildings"][number];
type FloorPlanLibraryUnitGroup = NonNullable<
  FloorPlanLibraryBuilding["unit_distribution"]
>["groups"][number];

type CatalogUnitMatch = {
  building: FloorPlanLibraryBuilding;
  group: FloorPlanLibraryUnitGroup;
};

function findCatalogUnitMatches(
  catalog: FloorPlanLibraryCatalog,
  matchedBuildingIds: string[],
  unitQuery: FloorPlanLibraryUnitQuery
): CatalogUnitMatch[] {
  return catalog.address.buildings.flatMap((building) => {
    if (!matchedBuildingIds.includes(building.id) || !building.unit_distribution) {
      return [];
    }
    return building.unit_distribution.groups
      .filter(
        (group) =>
          group.stacks.some(
            (stack) => stack.toUpperCase() === unitQuery.stack
          ) &&
          group.floor_ranges.some(
            (range) => unitQuery.floor >= range.from && unitQuery.floor <= range.to
          )
      )
      .map((group) => ({ building, group }));
  });
}

function matchCatalog(
  catalog: FloorPlanLibraryCatalog,
  rawQuery: string,
  queryTokens: string[]
): CatalogMatch | null {
  if (catalog.publication.status !== "published") return null;

  const blockToken = queryTokens.find((token) => /^\d+[a-z]$/i.test(token));
  const matchedBuildings = catalog.address.buildings.filter((building) => {
    const blockMatches = blockToken
      ? normalizeFloorPlanAddress(building.block) === blockToken
      : true;
    if (!blockMatches) return false;

    const searchableAddress = [
      building.block,
      building.postal_code ?? "",
      catalog.address.street_name,
      ...catalog.address.street_aliases,
      ...building.aliases,
      catalog.floor_plan.project_name,
      catalog.floor_plan.title,
      catalog.floor_plan.country_code,
      ...(catalog.floor_plan.country_code === "SG" ? ["Singapore"] : []),
    ].join(" ");
    return includesEveryToken(searchableAddress, queryTokens);
  });

  if (blockToken && matchedBuildings.length === 0) return null;

  const catalogSearchText = [
    catalog.floor_plan.project_name,
    catalog.floor_plan.title,
    catalog.address.street_name,
    ...catalog.address.street_aliases,
    ...catalog.address.buildings.flatMap((building) => [
      building.block,
      building.postal_code ?? "",
      ...building.aliases,
    ]),
    catalog.floor_plan.country_code,
    ...(catalog.floor_plan.country_code === "SG" ? ["Singapore"] : []),
  ].join(" ");
  if (!blockToken && !includesEveryToken(catalogSearchText, queryTokens)) return null;

  const exactAlias = catalog.address.buildings.some((building) =>
    building.aliases.some(
      (alias) => normalizeFloorPlanAddress(alias) === normalizeFloorPlanAddress(rawQuery)
    )
  );
  const hasSpecificBuildingMatch =
    matchedBuildings.length < catalog.address.buildings.length ||
    matchedBuildings.some((building) =>
      queryTokens.includes(normalizeFloorPlanAddress(building.block))
    );

  return {
    catalog,
    matchedBuildingIds: (matchedBuildings.length
      ? matchedBuildings
      : catalog.address.buildings
    ).map((building) => building.id),
    matchedBlocks: (matchedBuildings.length
      ? matchedBuildings
      : catalog.address.buildings
    ).map((building) => building.block),
    addressMatchLevel: hasSpecificBuildingMatch ? "block" : "street",
    score: exactAlias ? 100 : blockToken ? 80 : 50,
  };
}

export function searchFloorPlanLibrary(
  catalogs: FloorPlanLibraryCatalog[],
  rawQuery: string,
  options: { limit?: number } = {}
): FloorPlanLibrarySearchResult[] {
  const queryTokens = tokenize(rawQuery);
  const unitQuery = parseFloorPlanUnitNumber(rawQuery);
  if (queryTokens.length === 0 || normalizeFloorPlanAddress(rawQuery).length < 2) return [];

  const matches = catalogs
    .map((catalog) => matchCatalog(catalog, rawQuery, queryTokens))
    .filter((match): match is CatalogMatch => Boolean(match))
    .sort((a, b) => b.score - a.score || a.catalog.floor_plan.title.localeCompare(b.catalog.floor_plan.title));

  const limit = Math.min(50, Math.max(1, options.limit ?? 24));
  const results: FloorPlanLibrarySearchResult[] = [];
  for (const {
    catalog,
    matchedBuildingIds,
    matchedBlocks,
    addressMatchLevel,
  } of matches) {
    const allBlocks = catalog.address.buildings.map((building) => building.block);
    const addressLabel = `${allBlocks.join(", ")} ${catalog.address.street_name}`;
    const matchedBuildings = catalog.address.buildings.filter((building) =>
      matchedBuildingIds.includes(building.id)
    );
    const hasUnitDistribution = matchedBuildings.some(
      (building) => Boolean(building.unit_distribution)
    );
    const catalogUnitMatches = unitQuery
      ? findCatalogUnitMatches(catalog, matchedBuildingIds, unitQuery)
      : [];
    const requiresExactUnitMatch = Boolean(unitQuery && hasUnitDistribution);
    if (requiresExactUnitMatch && catalogUnitMatches.length === 0) continue;

    for (const layout of catalog.layouts) {
      if (results.length >= limit) return results;
      const layoutUnitMatches = catalogUnitMatches.filter((unitMatch) =>
        unitMatch.group.layout_ids.includes(layout.layout_id)
      );
      const matchesApplicableBuilding = layout.applies_to_building_ids.some(
        (buildingId) => matchedBuildingIds.includes(buildingId)
      );
      if (
        (requiresExactUnitMatch && layoutUnitMatches.length === 0) ||
        (!requiresExactUnitMatch && !matchesApplicableBuilding)
      ) {
        continue;
      }

      const resultBlocks = requiresExactUnitMatch
        ? [...new Set(layoutUnitMatches.map(({ building }) => building.block))]
        : catalog.address.buildings
            .filter(
              (building) =>
                matchedBlocks.includes(building.block) &&
                layout.applies_to_building_ids.includes(building.id)
            )
            .map((building) => building.block);
      const unitMatches: FloorPlanLibraryUnitMatch[] = unitQuery
        ? layoutUnitMatches.map(({ building }) => ({
            ...unitQuery,
            block: building.block,
            distributionStatus: building.unit_distribution?.status ?? "partial",
            sourceUrl: catalog.unit_distribution_source?.source_url ?? null,
            sourceTitle: catalog.unit_distribution_source?.source_title ?? null,
            sourcePdfPage: building.unit_distribution?.source_pdf_page ?? 1,
            sourceBrochurePage:
              building.unit_distribution?.source_brochure_page ?? 1,
          }))
        : [];
      results.push({
        id: `${catalog.floor_plan.plan_id}:${layout.layout_id}`,
        planId: catalog.floor_plan.plan_id,
        projectName: catalog.floor_plan.project_name,
        addressLabel,
        matchedBlocks: resultBlocks,
        layoutId: layout.layout_id,
        label: layout.label,
        flatType: layout.flat_type,
        bedroomCount: layout.bedroom_count,
        floorAreaSqm: layout.floor_area_sqm,
        previewUrl: layout.preview_url,
        sourcePage: layout.source_page,
        sourceUrl: catalog.source.source_url,
        sourceTitle: catalog.source.source_title,
        publisher: catalog.source.publisher,
        fidelity: layout.fidelity,
        verificationNote: layout.verification_note,
        accuracyNotice: catalog.publication.accuracy_notice,
        matchLevel: requiresExactUnitMatch ? "unit" : addressMatchLevel,
        unitMatches,
        template: layoutToTemplate(catalog, layout),
      });
    }
  }

  return results;
}

export function browseFloorPlanLibrary(
  catalogs: FloorPlanLibraryCatalog[],
  options: { limit?: number } = {}
): FloorPlanLibrarySearchResult[] {
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const results: FloorPlanLibrarySearchResult[] = [];
  const publishedCatalogs = catalogs
    .filter((catalog) => catalog.publication.status === "published")
    .sort((a, b) =>
      a.floor_plan.project_name.localeCompare(b.floor_plan.project_name)
    );

  for (const catalog of publishedCatalogs) {
    const allBlocks = catalog.address.buildings.map((building) => building.block);
    const addressLabel = `${allBlocks.join(", ")} ${catalog.address.street_name}`;
    const buildingsById = new Map(
      catalog.address.buildings.map((building) => [building.id, building])
    );

    for (const layout of [...catalog.layouts].sort(
      (a, b) => a.source_page - b.source_page
    )) {
      if (results.length >= limit) return results;
      const matchedBlocks = layout.applies_to_building_ids
        .map((buildingId) => buildingsById.get(buildingId)?.block)
        .filter((block): block is string => Boolean(block));

      results.push({
        id: `${catalog.floor_plan.plan_id}:${layout.layout_id}`,
        planId: catalog.floor_plan.plan_id,
        projectName: catalog.floor_plan.project_name,
        addressLabel,
        matchedBlocks,
        layoutId: layout.layout_id,
        label: layout.label,
        flatType: layout.flat_type,
        bedroomCount: layout.bedroom_count,
        floorAreaSqm: layout.floor_area_sqm,
        previewUrl: layout.preview_url,
        sourcePage: layout.source_page,
        sourceUrl: catalog.source.source_url,
        sourceTitle: catalog.source.source_title,
        publisher: catalog.source.publisher,
        fidelity: layout.fidelity,
        verificationNote: layout.verification_note,
        accuracyNotice: catalog.publication.accuracy_notice,
        matchLevel: "street",
        unitMatches: [],
        template: layoutToTemplate(catalog, layout),
      });
    }
  }

  return results;
}
