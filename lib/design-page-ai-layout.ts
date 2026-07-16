import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { catalogMatchesAiLayoutRole, type AiLayoutRole } from "@/lib/ai/layout-planner";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import { footprintRadius, separateIfOverlapping } from "@/lib/design-page-geometry";
import { pickBestRugForSofa } from "@/lib/design-page-rug-sizing";
import type { LayoutPlan } from "@/lib/design-page-types";
import { getDimensions, getItemPrice } from "@/lib/design-page-utils";
import type { DesignItem } from "@/lib/room-types";

export type AiLayoutBudget = "$" | "$$" | "$$$";

export type ClampAiLayoutItem = (
  x: number,
  z: number,
  width: number,
  depth: number,
  roomWidth: number,
  roomDepth: number,
  wallThickness: number,
  rotationY?: number
) => [number, number];

export type AiLayoutCatalogEntry = {
  id: string;
  category: string;
  price: number;
  styleTags: string[];
  dimensions: { w: number; d: number; h: number };
  defaultVariantId: string;
};

export function getRandomAiLayoutSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return Number(buffer[0]);
  }
  return Math.floor(Math.random() * 1_000_000_000);
}

export function buildAiLayoutCatalogEntries(
  catalogItems: Record<string, CatalogItemSchema> = CATALOG_ITEMS
): AiLayoutCatalogEntry[] {
  return Object.values(catalogItems).map((product) => ({
    id: product.id,
    category: product.category,
    price: getItemPrice(product),
    styleTags: product.styleTags,
    dimensions: getDimensions(product),
    defaultVariantId: product.defaultVariantId,
  }));
}

export function getRequiredAiLayoutCatalogCounts(
  catalog: Pick<AiLayoutCatalogEntry, "category">[]
): Record<"sofa" | "coffee_table", number> {
  return {
    sofa: catalog.filter((product) =>
      catalogMatchesAiLayoutRole("sofa", product.category)
    ).length,
    coffee_table: catalog.filter((product) =>
      catalogMatchesAiLayoutRole("coffee_table", product.category)
    ).length,
  };
}

export function describeAiStarterValidationIssues(
  plan: LayoutPlan,
  catalogItems: Record<string, CatalogItemSchema> = CATALOG_ITEMS
): string[] {
  const issues: string[] = [];
  const picks = plan.picks ?? {};
  const requiredRoles = ["sofa", "coffee_table"] as const;

  for (const role of requiredRoles) {
    const productId = picks[role];
    if (!productId || typeof productId !== "string") {
      issues.push(`${role} missing catalog item`);
      continue;
    }
    if (!catalogItems[productId]) {
      issues.push(`${role} catalog item not found: ${productId}`);
    }
  }

  return issues;
}

export function buildLocalAiStarterPlan({
  seed,
  requestedRoles,
  style,
  budget,
  catalogItems = CATALOG_ITEMS,
}: {
  seed: number;
  requestedRoles?: AiLayoutRole[];
  style: string;
  budget: AiLayoutBudget;
  catalogItems?: Record<string, CatalogItemSchema>;
}): LayoutPlan {
  const allItems = Object.values(catalogItems);
  const normalizedStyle = String(style || "Modern").toLowerCase();
  const normalizedRoles = Array.from(
    new Set<AiLayoutRole>(["sofa", "coffee_table", ...(requestedRoles ?? [])])
  );
  const roleRequested = (role: AiLayoutRole) => normalizedRoles.includes(role);
  const seeded = (offset: number) => {
    const value = Math.sin(seed + offset) * 10_000;
    return value - Math.floor(value);
  };

  const pickByCategory = (category: string, offset: number) => {
    const matchingStyle = allItems
      .filter(
        (product) =>
          mapToTopCategory(product.category, product) === category &&
          product.styleTags?.some((tag) => tag.toLowerCase() === normalizedStyle)
      )
      .sort((left, right) => getItemPrice(left) - getItemPrice(right));
    const matchingCategory = allItems
      .filter((product) => mapToTopCategory(product.category, product) === category)
      .sort((left, right) => getItemPrice(left) - getItemPrice(right));
    const candidates = matchingStyle.length >= 2 ? matchingStyle : matchingCategory;

    if (!candidates.length) return null;
    if (budget === "$") return candidates[0];
    if (budget === "$$$") return candidates[candidates.length - 1];

    const index = Math.floor(seeded(offset) * candidates.length);
    return candidates[Math.max(0, Math.min(candidates.length - 1, index))];
  };

  return {
    picks: {
      sofa: pickByCategory("sofa", 11)?.id,
      rug: roleRequested("rug") ? pickByCategory("rug", 22)?.id : null,
      coffee_table: pickByCategory("coffee_table", 33)?.id,
      tv_console: roleRequested("tv_console")
        ? pickByCategory("tv_console", 44)?.id ??
          pickByCategory("sideboard", 444)?.id ??
          null
        : null,
      accent_chair: roleRequested("accent_chair")
        ? pickByCategory("accent_chair", 55)?.id ?? null
        : null,
      floor_lamp: roleRequested("floor_lamp")
        ? pickByCategory("floor_lamp", 66)?.id ?? null
        : null,
    },
    meta: {
      style: normalizedStyle,
      budget,
      seed,
      source: "local_fallback",
      requestedRoles: normalizedRoles,
    } as LayoutPlan["meta"] & { source: string },
  };
}

export function buildAiLayoutItemsFromPlan({
  plan,
  roomWidth,
  roomDepth,
  wallThickness,
  style,
  budget,
  createInstanceId,
  clampToRoom,
  catalogItems = CATALOG_ITEMS,
}: {
  plan: LayoutPlan;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  style: string;
  budget: AiLayoutBudget;
  createInstanceId: () => string;
  clampToRoom: ClampAiLayoutItem;
  catalogItems?: Record<string, CatalogItemSchema>;
}): { items: DesignItem[]; appliedRugRule: boolean } {
  const picks = plan.picks ?? {};
  const backWallZ = -roomDepth / 2 + wallThickness + 0.2;
  const frontWallZ = roomDepth / 2 - wallThickness - 0.2;
  const walkway = 0.6;

  const sofaId = picks.sofa ?? undefined;
  let rugId = picks.rug ?? undefined;
  const coffeeTableId = picks.coffee_table ?? undefined;
  const tvConsoleId = picks.tv_console ?? undefined;
  const accentChairId = picks.accent_chair ?? undefined;
  const floorLampId = picks.floor_lamp ?? undefined;
  const items: DesignItem[] = [];
  const sofa = sofaId ? catalogItems[sofaId] : null;
  const rugRequested =
    !plan.meta?.requestedRoles || plan.meta.requestedRoles.includes("rug");
  let appliedRugRule = false;
  let sofaX = 0;
  let sofaZ = backWallZ;
  let coffeeX = 0;
  let coffeeZ = backWallZ + 1.4;
  let lampX = 0;
  let lampZ = 0;

  const addItem = (
    product: CatalogItemSchema,
    position: [number, number, number],
    rotationY?: number
  ) => {
    items.push({
      instanceId: createInstanceId(),
      productId: product.id,
      variantId: product.defaultVariantId,
      position,
      ...(rotationY === undefined ? {} : { rotationY }),
      qty: 1,
      includeInCheckout: true,
    });
  };

  if (sofa) {
    [sofaX, sofaZ] = clampToRoom(
      sofaX,
      sofaZ,
      sofa.dimsMm.w / 1000,
      sofa.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness
    );
    addItem(sofa, [sofaX, 0, sofaZ], 0);
  }

  if (sofa && rugRequested) {
    const bestRug = pickBestRugForSofa({
      sofaWidth: sofa.dimsMm.w / 1000,
      style,
      budget,
    });
    if (bestRug) {
      rugId = bestRug.id;
      appliedRugRule = true;
    }
  }

  const rug = rugId ? catalogItems[rugId] : null;
  if (rug && sofa) {
    let rugX = sofaX;
    let rugZ = sofaZ + (sofa.dimsMm.d / 1000) * 0.35;
    [rugX, rugZ] = clampToRoom(
      rugX,
      rugZ,
      rug.dimsMm.w / 1000,
      rug.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness
    );
    addItem(rug, [rugX, 0, rugZ], 0);
  }

  const coffeeTable = coffeeTableId ? catalogItems[coffeeTableId] : null;
  if (coffeeTable && sofa) {
    coffeeX = sofaX;
    coffeeZ =
      sofaZ + sofa.dimsMm.d / 2000 + walkway + coffeeTable.dimsMm.d / 2000;
    [coffeeX, coffeeZ] = clampToRoom(
      coffeeX,
      coffeeZ,
      coffeeTable.dimsMm.w / 1000,
      coffeeTable.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness
    );
    addItem(coffeeTable, [coffeeX, 0, coffeeZ], 0);
  }

  const tvConsole = tvConsoleId ? catalogItems[tvConsoleId] : null;
  if (tvConsole) {
    let tvX = 0;
    let tvZ = frontWallZ;
    [tvX, tvZ] = clampToRoom(
      tvX,
      tvZ,
      tvConsole.dimsMm.w / 1000,
      tvConsole.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness
    );
    addItem(tvConsole, [tvX, 0, tvZ]);
  }

  let chairX = -1.1;
  let chairZ = backWallZ + 1.2;
  lampX = chairX + 0.45;
  lampZ = chairZ + 0.25;

  const accentChair = accentChairId ? catalogItems[accentChairId] : null;
  if (accentChair) {
    const chairRadius = footprintRadius(
      accentChair.dimsMm.w / 1000,
      accentChair.dimsMm.d / 1000
    );

    if (sofa) {
      [chairX, chairZ] = separateIfOverlapping(
        chairX,
        chairZ,
        chairRadius,
        sofaX,
        sofaZ,
        footprintRadius(sofa.dimsMm.w / 1000, sofa.dimsMm.d / 1000),
        0.25
      );
    }
    if (coffeeTable) {
      [chairX, chairZ] = separateIfOverlapping(
        chairX,
        chairZ,
        chairRadius,
        coffeeX,
        coffeeZ,
        footprintRadius(coffeeTable.dimsMm.w / 1000, coffeeTable.dimsMm.d / 1000),
        0.25
      );
    }

    const floorLamp = floorLampId ? catalogItems[floorLampId] : null;
    if (floorLamp) {
      [chairX, chairZ] = separateIfOverlapping(
        chairX,
        chairZ,
        chairRadius,
        lampX,
        lampZ,
        footprintRadius(floorLamp.dimsMm.w / 1000, floorLamp.dimsMm.d / 1000),
        0.2
      );
    }

    const targetZ = coffeeZ;
    const preliminaryRotation = Math.atan2(-chairX, targetZ - chairZ);
    [chairX, chairZ] = clampToRoom(
      chairX,
      chairZ,
      accentChair.dimsMm.w / 1000,
      accentChair.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      preliminaryRotation
    );
    addItem(
      accentChair,
      [chairX, 0, chairZ],
      Math.atan2(-chairX, targetZ - chairZ)
    );
  }

  const floorLamp = floorLampId ? catalogItems[floorLampId] : null;
  if (floorLamp) {
    lampX = chairX + 0.45;
    lampZ = chairZ + 0.25;
    const preliminaryRotation = Math.atan2(chairX - lampX, chairZ - lampZ);
    [lampX, lampZ] = clampToRoom(
      lampX,
      lampZ,
      floorLamp.dimsMm.w / 1000,
      floorLamp.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      preliminaryRotation
    );
    addItem(
      floorLamp,
      [lampX, 0, lampZ],
      Math.atan2(chairX - lampX, chairZ - lampZ)
    );
  }

  return { items, appliedRugRule };
}
