import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { DEFAULT_FLOOR_MATERIAL_ID } from "@/lib/floor-materials";
import {
  roundPlanCoordinate,
  resolveHousePlanTemplateOpeningMetrics,
  type HousePlanTemplate,
  type HousePlanTemplateDoorway,
  type HousePlanTemplateFurnishingIntent,
  type HousePlanTemplateFurnishingPack,
  type HousePlanTemplateFurnishingPackId,
  type HousePlanTemplateWindow,
} from "@/lib/design-page-house-plan";
import {
  isTemplateFurnishingNearDoorway,
  resolveTemplateFurnishingProduct,
} from "@/lib/design-page-template-furnishings";
import { metersToMm, type FixedElement2D, type RoomOpening2D } from "@/lib/editorScene";
import { createRoom, type DesignItem, type RoomSnapshot } from "@/lib/room-types";
import { fitTemplateFurnishing, productFootprint, type PlacedFootprint } from "@/lib/template-furnishing-layout";

type FurnishingCategory = HousePlanTemplateFurnishingIntent["category"];

export type PlanTemplateDocument = {
  rooms: RoomSnapshot[];
  openings: RoomOpening2D[];
  fixedElements: FixedElement2D[];
  pack: HousePlanTemplateFurnishingPack | null;
  furnishedItemCount: number;
  skippedFurnishings: FurnishingCategory[];
};

export type PlanTemplateDocumentOptions = {
  timestamp: number;
  wallThickness: number;
  roomHeight: number;
  furnishingPackId?: HousePlanTemplateFurnishingPackId;
  /** The app's cheapest shoppable product per category; a test passes its own catalogue. */
  resolveProduct?: (intent: HousePlanTemplateFurnishingIntent) => CatalogItemSchema | null;
};

type TemplateRoom = HousePlanTemplate["rooms"][number];

function spanOf(room: TemplateRoom, wall: RoomOpening2D["wall"]) {
  return wall === "north" || wall === "south" ? room.width : room.depth;
}

function doorStyleOf(doorway: HousePlanTemplateDoorway): RoomOpening2D["doorStyle"] {
  if (doorway.kind === "opening" || doorway.operation === "open") return "open";
  if (doorway.operation === "sliding") return "sliding";
  return doorway.operation === "folding" ? "folding" : "swing";
}

function templateRoomSnapshot(
  template: HousePlanTemplate,
  templateRoom: TemplateRoom,
  index: number,
  options: PlanTemplateDocumentOptions
): RoomSnapshot {
  const room = createRoom(
    `template_${template.id}_${templateRoom.id}_${options.timestamp}_${index}`,
    templateRoom.name,
    templateRoom.roomType,
    {
      width: templateRoom.width,
      depth: templateRoom.depth,
      wallThickness: templateRoom.wallThickness ?? options.wallThickness,
      height: options.roomHeight,
    }
  );
  room.planPosition = { x: roundPlanCoordinate(templateRoom.x), z: roundPlanCoordinate(templateRoom.z) };
  room.planShape = templateRoom.planPolygon?.length ? "custom_polygon" : templateRoom.shape;
  room.planPolygon = templateRoom.planPolygon?.map((point) => ({
    x: roundPlanCoordinate(point.x),
    z: roundPlanCoordinate(point.z),
  }));
  room.surfaces = {
    floorMaterialId:
      templateRoom.roomType === "kitchen" || templateRoom.roomType === "toilet"
        ? "light_stone_tile"
        : DEFAULT_FLOOR_MATERIAL_ID,
  };
  room.surfaceFinishes = { ...room.surfaces };
  return room;
}

function doorOpenings(
  template: HousePlanTemplate,
  roomIds: ReadonlyMap<string, string>,
  options: PlanTemplateDocumentOptions
): RoomOpening2D[] {
  return template.doorways.flatMap((doorway, index) => {
    const roomId = roomIds.get(doorway.fromRoomId);
    const sourceRoom = template.rooms.find((entry) => entry.id === doorway.fromRoomId);
    if (!roomId || !sourceRoom || (doorway.toRoomId && !roomIds.get(doorway.toRoomId))) return [];
    const { widthMeters, offsetMeters } = resolveHousePlanTemplateOpeningMetrics(
      spanOf(sourceRoom, doorway.wall),
      doorway.widthMeters ?? 0.9,
      doorway.offsetMeters ?? 0
    );
    return [
      {
        id: `template-opening-${template.id}-${options.timestamp}-${index}`,
        roomId,
        wall: doorway.wall,
        kind: "door" as const,
        doorStyle: doorStyleOf(doorway),
        offsetMm: metersToMm(offsetMeters),
        widthMm: metersToMm(widthMeters),
        ...(doorway.kind === "opening" ? { heightMm: metersToMm(options.roomHeight) } : {}),
      },
    ];
  });
}

function windowOpenings(
  template: HousePlanTemplate,
  roomIds: ReadonlyMap<string, string>,
  options: PlanTemplateDocumentOptions
): RoomOpening2D[] {
  return template.windows.flatMap((windowSpec: HousePlanTemplateWindow, index) => {
    const roomId = roomIds.get(windowSpec.roomId);
    const sourceRoom = template.rooms.find((entry) => entry.id === windowSpec.roomId);
    if (!roomId || !sourceRoom) return [];
    const { widthMeters, offsetMeters } = resolveHousePlanTemplateOpeningMetrics(
      spanOf(sourceRoom, windowSpec.wall),
      windowSpec.widthMeters ?? 1,
      windowSpec.offsetMeters ?? 0
    );
    return [
      {
        id: `template-window-${template.id}-${options.timestamp}-${index}`,
        roomId,
        wall: windowSpec.wall,
        kind: "window" as const,
        offsetMm: metersToMm(offsetMeters),
        widthMm: metersToMm(widthMeters),
      },
    ];
  });
}

function referenceZoneElements(template: HousePlanTemplate, timestamp: number): FixedElement2D[] {
  return (template.referenceZones ?? []).map((zone, index) => ({
    id: `template-reference-zone-${template.id}-${timestamp}-${index}`,
    kind: "reference_zone",
    xMm: metersToMm(zone.x),
    zMm: metersToMm(zone.z),
    widthMm: metersToMm(zone.width),
    depthMm: metersToMm(zone.depth),
    rotationDeg: 0,
    label: zone.label,
    locked: zone.locked ?? true,
  }));
}

function rotationOf(intent: HousePlanTemplateFurnishingIntent, product: CatalogItemSchema) {
  return intent.rotationDeg === undefined ? product.defaultRotation : (intent.rotationDeg * Math.PI) / 180;
}

/** The pack's spot for the piece, fitted to its product's size and the pieces already there. */
function fitIntent(
  intent: HousePlanTemplateFurnishingIntent,
  product: CatalogItemSchema,
  room: RoomSnapshot,
  placedInRoom: readonly PlacedFootprint[],
  keepSpot: boolean
) {
  const size = productFootprint(product, rotationOf(intent, product));
  const footprint = fitTemplateFurnishing(
    { category: intent.category, x: intent.x, z: intent.z, ...size },
    placedInRoom,
    { width: room.geometry.width, depth: room.geometry.depth, wallThickness: room.geometry.wallThickness ?? 0.12 },
    keepSpot
  );
  return { ...intent, x: footprint.x, z: footprint.z, footprint };
}

function furnishingItem(
  intent: HousePlanTemplateFurnishingIntent,
  product: CatalogItemSchema,
  instanceId: string
): DesignItem {
  const resolved = resolveCatalogVariant(product, product.defaultVariantId);
  return {
    instanceId,
    productId: product.id,
    variantId: resolved.variantId,
    position: [intent.x, 0, intent.z],
    rotationY: rotationOf(intent, product),
    qty: 1,
    includeInCheckout: true,
  };
}

/**
 * A template's rooms, doors, windows, reference zones and (with a pack) furniture, as the plan it
 * becomes (UX phase 4g, ST9). Pure: the underlay controller applies it, and
 * `scripts/test-template-review.tsx` reviews every template through it.
 */
export function buildPlanTemplateDocument(
  template: HousePlanTemplate,
  options: PlanTemplateDocumentOptions
): PlanTemplateDocument {
  const roomIds = new Map<string, string>();
  const rooms = template.rooms.map((templateRoom, index) => {
    const room = templateRoomSnapshot(template, templateRoom, index, options);
    roomIds.set(templateRoom.id, room.id);
    return room;
  });
  const openings = [...doorOpenings(template, roomIds, options), ...windowOpenings(template, roomIds, options)];
  const pack = options.furnishingPackId
    ? template.furnishingPacks.find((entry) => entry.id === options.furnishingPackId) ?? null
    : null;
  const resolveProduct = options.resolveProduct ?? resolveTemplateFurnishingProduct;
  const skippedFurnishings: FurnishingCategory[] = [];
  const placed = new Map<string, PlacedFootprint[]>();
  let furnishedItemCount = 0;
  for (const intent of pack?.intents ?? []) {
    const roomId = roomIds.get(intent.roomId);
    const targetRoom = roomId ? rooms.find((room) => room.id === roomId) : null;
    const product = resolveProduct(intent);
    const fitted = targetRoom && product
      ? [false, true]
          .map((keepSpot) => fitIntent(intent, product, targetRoom, placed.get(targetRoom.id) ?? [], keepSpot))
          .find((spot) => !isTemplateFurnishingNearDoorway(template, spot))
      : undefined;
    if (!targetRoom || !product || !fitted) {
      skippedFurnishings.push(intent.category);
      continue;
    }
    placed.set(targetRoom.id, [...(placed.get(targetRoom.id) ?? []), fitted.footprint]);
    const instanceId = `template-furnishing-${template.id}-${intent.id}-${options.timestamp}-${furnishedItemCount}`;
    targetRoom.items = [...targetRoom.items, furnishingItem(fitted, product, instanceId)];
    furnishedItemCount += 1;
  }
  return {
    rooms,
    openings,
    fixedElements: referenceZoneElements(template, options.timestamp),
    pack,
    furnishedItemCount,
    skippedFurnishings,
  };
}
