import type { CatalogItemSchema, DimensionsMm, ProductVariant } from "@/lib/catalog-schema";
import { mapToTopCategory, type CatalogTopCategory } from "@/lib/catalog/view-builders";
import { computeCirculationAnalysis } from "@/lib/circulation-analysis";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignItem, RoomSnapshot, ZoneMin } from "@/lib/room-types";

export type ManualPlacementScoreKind =
  | "great"
  | "okay"
  | "cramped"
  | "blocks_path"
  | "wrong_zone";

export type ManualPlacementAction =
  | "swap_with_blocker"
  | "move_blocker_aside"
  | "try_smaller_variant"
  | "place_beside_blocker";

export type ManualPlacementScore = {
  kind: ManualPlacementScoreKind;
  label: "Great" | "Okay" | "Cramped" | "Blocks path" | "Wrong zone";
  score: number;
  summary: string;
  warnings: string[];
  suggestions: string[];
  actions: ManualPlacementAction[];
  compatibleZoneIds: string[];
  relationship: "good" | "neutral" | "missing" | "wrong";
};

type ManualPlacementItem = Pick<DesignItem, "instanceId" | "productId" | "variantId" | "position" | "rotationY">;

type ManualPlacementCatalog = Record<string, CatalogItemSchema | undefined>;

type ManualPlacementParams = {
  room: RoomSnapshot;
  item: ManualPlacementItem;
  dimsMm: Pick<DimensionsMm, "w" | "d" | "h">;
  catalogItems: ManualPlacementCatalog;
  openings?: RoomOpening2D[];
  blocker?: DesignItem | null;
  variant?: ProductVariant | null;
  existingItems?: DesignItem[];
};

const RELATIONSHIP_TARGETS: Partial<Record<CatalogTopCategory, CatalogTopCategory[]>> = {
  coffee_table: ["sofa"],
  side_table: ["sofa", "accent_chair", "bed"],
  rug: ["sofa", "accent_chair", "coffee_table", "bed"],
  tv_console: ["sofa"],
  floor_lamp: ["sofa", "accent_chair", "bed"],
  table_lamp: ["side_table", "coffee_table", "dining_table", "tv_console", "bed"],
  ceiling_light: ["dining_table"],
  ottoman: ["sofa", "accent_chair"],
  dining_bench: ["dining_table"],
};

const ZONE_COMPATIBILITY: Partial<Record<CatalogTopCategory, ZoneMin["type"][]>> = {
  sofa: ["seating"],
  accent_chair: ["seating", "reading"],
  coffee_table: ["seating"],
  side_table: ["seating", "reading"],
  rug: ["seating", "reading", "dining"],
  tv_console: ["tv"],
  floor_lamp: ["seating", "reading"],
  table_lamp: ["seating", "reading", "dining"],
  ceiling_light: ["dining"],
  dining_table: ["dining"],
  dining_bench: ["dining"],
  sideboard: ["dining"],
};

function getTopCategory(
  item: CatalogItemSchema | undefined
): CatalogTopCategory | null {
  return item ? mapToTopCategory(item.category, item) : null;
}

function zoneAnchor(zone: ZoneMin): { x: number; z: number } | null {
  if (!zone.anchor) return null;
  return { x: zone.anchor[0], z: zone.anchor[2] };
}

function distance2d(
  first: { x: number; z: number },
  second: { x: number; z: number }
): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function getItemCenter(item: ManualPlacementItem): { x: number; z: number } {
  return { x: item.position[0], z: item.position[2] };
}

function getOpeningCenter(opening: RoomOpening2D, room: RoomSnapshot): { x: number; z: number } {
  const width = room.geometry.width;
  const depth = room.geometry.depth;
  const offset = opening.offsetMm / 1000;

  if (opening.wall === "north") return { x: offset, z: -depth / 2 };
  if (opening.wall === "south") return { x: offset, z: depth / 2 };
  if (opening.wall === "west") return { x: -width / 2, z: offset };
  return { x: width / 2, z: offset };
}

function countStyleMismatches(
  candidate: CatalogItemSchema | undefined,
  existingItems: DesignItem[],
  catalogItems: ManualPlacementCatalog
): number {
  if (!candidate || existingItems.length === 0) return 0;
  const candidateStyles = new Set(candidate.styleTags);
  if (candidateStyles.size === 0) return 0;

  let checked = 0;
  let mismatches = 0;
  for (const item of existingItems.slice(0, 8)) {
    const product = catalogItems[item.productId];
    if (!product?.styleTags.length) continue;
    checked += 1;
    if (!product.styleTags.some((style) => candidateStyles.has(style))) {
      mismatches += 1;
    }
  }

  return checked > 0 && mismatches / checked >= 0.66 ? mismatches : 0;
}

function hasSmallerVariant(
  candidate: CatalogItemSchema | undefined,
  currentDims: Pick<DimensionsMm, "w" | "d">,
  currentVariantId?: string
): boolean {
  if (!candidate) return false;
  const currentArea = currentDims.w * currentDims.d;
  return candidate.variants.some((variant) => {
    if (variant.id === currentVariantId) return false;
    const dims = variant.dimensionsMm ?? candidate.dimsMm;
    return dims.w * dims.d < currentArea * 0.9;
  });
}

export function scoreManualPlacement({
  room,
  item,
  dimsMm,
  catalogItems,
  openings = [],
  blocker = null,
  variant = null,
  existingItems = room.items,
}: ManualPlacementParams): ManualPlacementScore {
  const product = catalogItems[item.productId];
  const category = getTopCategory(product);
  const center = getItemCenter(item);
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
    dimsMm.w / 1000,
    dimsMm.d / 1000,
    item.rotationY ?? 0
  );
  const wallThickness = room.geometry.wallThickness ?? 0.12;
  const clearanceX = room.geometry.width / 2 - wallThickness - effectiveWidth / 2 - Math.abs(center.x);
  const clearanceZ = room.geometry.depth / 2 - wallThickness - effectiveDepth / 2 - Math.abs(center.z);
  const nearestWallClearance = Math.min(clearanceX, clearanceZ);
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const actions: ManualPlacementAction[] = [];
  let score = 86;
  let relationship: ManualPlacementScore["relationship"] = "neutral";

  const compatibleZoneTypes = category ? ZONE_COMPATIBILITY[category] ?? [] : [];
  const compatibleZones = room.zones.filter((zone) => compatibleZoneTypes.includes(zone.type));
  const compatibleZoneIds = compatibleZones.map((zone) => zone.id);
  if (compatibleZoneTypes.length > 0 && room.zones.length > 0) {
    const closeToCompatibleZone = compatibleZones.some((zone) => {
      const anchor = zoneAnchor(zone);
      return anchor ? distance2d(center, anchor) <= 1.6 : zone.itemIds.length > 0;
    });
    if (!closeToCompatibleZone) {
      score -= 20;
      warnings.push("Wrong zone for this item type.");
      suggestions.push(`Move closer to a ${compatibleZoneTypes[0]} zone.`);
    }
  }

  const targetCategories = category ? RELATIONSHIP_TARGETS[category] ?? [] : [];
  if (targetCategories.length > 0) {
    const targetItems = existingItems.filter((existing) => {
      if (existing.instanceId === item.instanceId) return false;
      const existingCategory = getTopCategory(catalogItems[existing.productId]);
      return existingCategory ? targetCategories.includes(existingCategory) : false;
    });
    if (targetItems.length === 0) {
      relationship = "missing";
      score -= 10;
      suggestions.push(`Place near ${targetCategories[0].replace(/_/g, " ")} when one exists.`);
    } else {
      const nearestDistance = Math.min(
        ...targetItems.map((target) => distance2d(center, getItemCenter(target)))
      );
      const goodDistance =
        category === "coffee_table"
          ? nearestDistance >= 0.35 && nearestDistance <= 1.05
          : category === "side_table" || category === "floor_lamp" || category === "table_lamp"
            ? nearestDistance <= 1.15
            : category === "tv_console"
              ? nearestDistance >= 1.8 && nearestDistance <= 4.6
              : nearestDistance <= 1.8;

      if (goodDistance) {
        relationship = "good";
        score += 8;
      } else {
        relationship = "wrong";
        score -= 16;
        warnings.push("Relationship spacing feels off.");
        suggestions.push(
          category === "coffee_table"
            ? "Place the coffee table about 35-105 cm in front of the sofa."
            : category === "tv_console"
              ? "Place the TV console opposite the main sofa."
              : "Move it closer to the seating group."
        );
      }
    }
  }

  if (blocker) {
    score -= 44;
    warnings.push("Blocked by another item.");
    actions.push("swap_with_blocker", "move_blocker_aside", "place_beside_blocker");
  }

  if (hasSmallerVariant(product, dimsMm, variant?.id ?? item.variantId)) {
    actions.push("try_smaller_variant");
  }

  if (nearestWallClearance < 0.08) {
    score -= 22;
    warnings.push("Too tight against the wall.");
    suggestions.push("Leave more edge clearance for cleaning and circulation.");
  } else if (nearestWallClearance < 0.3) {
    score -= 9;
    warnings.push("Clearance is tight.");
  }

  const matchingOpenings = openings.filter((opening) => !opening.roomId || opening.roomId === room.id);
  const nearestDoorDistance = Math.min(
    Infinity,
    ...matchingOpenings
      .filter((opening) => opening.kind === "door")
      .map((opening) => distance2d(center, getOpeningCenter(opening, room)))
  );
  if (nearestDoorDistance < 0.85) {
    score -= 24;
    warnings.push("Too close to a door swing or doorway.");
    suggestions.push("Move it at least 85 cm away from the door opening.");
  }

  const nonRugItems = existingItems.filter((existing) => {
    if (existing.instanceId === item.instanceId) return false;
    const existingCategory = getTopCategory(catalogItems[existing.productId]);
    return existingCategory !== "rug";
  });
  const tooCloseItems = nonRugItems.filter((existing) => {
    const existingCategory = getTopCategory(catalogItems[existing.productId]);
    if (existingCategory === "rug") return false;
    return distance2d(center, getItemCenter(existing)) < 0.72;
  });
  if (tooCloseItems.length >= 2) {
    score -= 18;
    warnings.push("Circulation is cramped around nearby furniture.");
    suggestions.push("Keep at least 70 cm between dense furniture clusters.");
  }

  const circulationItems: DesignItem[] = [
    ...existingItems.filter((existing) => existing.instanceId !== item.instanceId),
    {
      ...item,
      variantId: item.variantId ?? product?.defaultVariantId ?? "",
      position: [item.position[0], item.position[1] ?? 0, item.position[2]],
    } as DesignItem,
  ];
  const circulation = computeCirculationAnalysis({
    room,
    items: circulationItems,
    catalogItems,
    openings,
    zones: room.zones,
  });
  const hasRoomDoor = openings.some((opening) => opening.kind === "door" && (!opening.roomId || opening.roomId === room.id));
  if (hasRoomDoor && !circulation.pathValid) {
    score -= 30;
    warnings.push("Blocks the walking path.");
    suggestions.push("Keep a clear path from the door to the main room zones.");
  } else if (circulation.minClearanceM > 0 && circulation.minClearanceM < 0.32) {
    score -= 18;
    warnings.push("Walking path is too narrow.");
    suggestions.push("Open at least 32 cm of walking clearance through the room.");
  } else if (circulation.minClearanceM > 0 && circulation.minClearanceM < 0.6) {
    score -= 8;
    warnings.push("Walking path is tight.");
  }

  const styleMismatches = countStyleMismatches(product, existingItems, catalogItems);
  if (styleMismatches > 0) {
    score -= 8;
    warnings.push("Style may not match the room palette.");
    suggestions.push("Try a finish or product with overlapping style tags.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const uniqueWarnings = [...new Set(warnings)];
  const uniqueSuggestions = [...new Set(suggestions)];
  const uniqueActions = [...new Set(actions)];

  let kind: ManualPlacementScoreKind = "great";
  if (blocker || uniqueWarnings.some((warning) => /door|Blocked by|Blocks the walking path|No clear walking path/i.test(warning))) {
    kind = "blocks_path";
  } else if (uniqueWarnings.some((warning) => /Wrong zone/i.test(warning))) {
    kind = "wrong_zone";
  } else if (score < 35) {
    kind = "cramped";
  } else if (score < 72) {
    kind = "okay";
  }

  const labelByKind: Record<ManualPlacementScoreKind, ManualPlacementScore["label"]> = {
    great: "Great",
    okay: "Okay",
    cramped: "Cramped",
    blocks_path: "Blocks path",
    wrong_zone: "Wrong zone",
  };

  const priorityWarning =
    uniqueWarnings.find((warning) => /Blocked|door|path/i.test(warning)) ?? uniqueWarnings[0];
  const summary =
    priorityWarning ??
    (relationship === "good"
      ? "Good relationship to nearby furniture."
      : "Placement works for this room.");

  return {
    kind,
    label: labelByKind[kind],
    score,
    summary,
    warnings: uniqueWarnings,
    suggestions: uniqueSuggestions,
    actions: uniqueActions,
    compatibleZoneIds,
    relationship,
  };
}
