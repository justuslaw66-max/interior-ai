"use client";

import { useCallback, useMemo } from "react";

import type { DimensionsMm } from "@/lib/catalog-schema";
import {
  doesCatalogPlacementCollide,
  findCatalogPlacementCollision,
  isCatalogPlacementLocalFootprintInsideRoom,
} from "@/lib/catalog-placement";
import { getFurnitureWallInset, type AABB } from "@/lib/design-page-geometry";
import { clampToRoomInsideFinishes, getRoomOutlineInsideFinishes, type RoomPlanOutline } from "@/lib/room-finished-outline";
import { getRoomWallFinishDepths, type RoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import {
  ROOM_DIMENSION_DEFAULTS,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { compileCanonicalFloorPlanRenderModel, type CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { findCanonicalPlacementWall } from "@/lib/floor-plan-placement-boundaries";

type PlacementDimensions = Pick<DimensionsMm, "w" | "d"> & Partial<Pick<DimensionsMm, "h">>;
type ExcludedPlacementItems = string | string[] | undefined;
type GetItemAABB = (item: DesignItem) => AABB | null;

export type ClampToPlacementRoom = (
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY?: number
) => [number, number];

export type PlacementCollidesInRoom = (
  room: RoomSnapshot,
  productId: string,
  position: [number, number, number],
  rotationY: number,
  dimensions: PlacementDimensions,
  excludedItems?: ExcludedPlacementItems
) => boolean;

export type FindPlacementBlockerInRoom = (
  room: RoomSnapshot,
  productId: string,
  position: [number, number, number],
  rotationY: number,
  dimensions: PlacementDimensions,
  excludedItems?: ExcludedPlacementItems
) => DesignItem | null;

export type IsPlacementContainedInRoom = (
  room: RoomSnapshot,
  position: [number, number, number],
  rotationY: number,
  dimensions: PlacementDimensions
) => boolean;

type UseDesignPagePlacementRoomQueriesInput = {
  configuration: {
    houseRoomById: ReadonlyMap<string, HousePlanRoom2D>;
    canonicalDocument?: FloorPlanDocumentV2;
  };
  actions: {
    getItemAABB: GetItemAABB;
  };
};

export function clampToPlacementRoom(
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY: number = 0
): [number, number] {
  return clampToRoomInsideFinishes(
    x,
    z,
    itemWidth,
    itemDepth,
    room.geometry.width,
    room.geometry.depth,
    getFurnitureWallInset(
      room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness
    ),
    rotationY,
    room.planShape ?? "rectangle",
    room.planPolygon,
    room.planHoles,
    getRoomWallFinishDepths(room)
  );
}

export function placementCollidesInRoom({
  room,
  productId,
  position,
  rotationY,
  dimensions,
  excludedItems,
  getItemAABB,
}: {
  room: RoomSnapshot;
  productId: string;
  position: [number, number, number];
  rotationY: number;
  dimensions: PlacementDimensions;
  excludedItems?: ExcludedPlacementItems;
  getItemAABB: GetItemAABB;
}): boolean {
  return doesCatalogPlacementCollide({
    productId,
    position,
    rotationY,
    dimsMm: dimensions,
    items: room.items,
    getItemAABB,
    excludedInstanceId:
      typeof excludedItems === "string" ? excludedItems : undefined,
    excludedInstanceIds: Array.isArray(excludedItems)
      ? excludedItems
      : undefined,
  });
}

export function findPlacementBlockerInRoom({
  room,
  productId,
  position,
  rotationY,
  dimensions,
  excludedItems,
  getItemAABB,
}: {
  room: RoomSnapshot;
  productId: string;
  position: [number, number, number];
  rotationY: number;
  dimensions: PlacementDimensions;
  excludedItems?: ExcludedPlacementItems;
  getItemAABB: GetItemAABB;
}): DesignItem | null {
  return findCatalogPlacementCollision({
    productId,
    position,
    rotationY,
    dimsMm: dimensions,
    items: room.items,
    getItemAABB,
    excludedInstanceId:
      typeof excludedItems === "string" ? excludedItems : undefined,
    excludedInstanceIds: Array.isArray(excludedItems)
      ? excludedItems
      : undefined,
  });
}

/**
 * The footprint is also tested inside the room's bounding rectangle less the furniture inset, which is the room's one wall
 * thickness. An imported room's edge on a thinner wall stands out past that (a negative depth, getRoomWallFinishDepths), and
 * the clamp stops an item 2 cm off it: the rectangle grows to hold the outline, so the outline decides there, as in the clamp.
 */
function boundsHolding(outline: RoomPlanOutline, depths: RoomWallFinishDepths): { w: number; d: number } {
  const { w, d, polygon } = outline;
  if (!polygon?.length || !Object.values(depths).some((depth) => (depth ?? 0) < 0)) return { w, d };
  const reach = (axis: "x" | "z") => 2 * Math.max(...polygon.map((point) => Math.abs(point[axis])));
  return { w: Math.max(w, reach("x")), d: Math.max(d, reach("z")) };
}

export function isPlacementContainedInRoom({
  room,
  position,
  rotationY,
  dimensions,
  houseRoom,
  canonicalModel,
}: {
  room: RoomSnapshot;
  position: [number, number, number];
  rotationY: number;
  dimensions: PlacementDimensions;
  houseRoom?: HousePlanRoom2D;
  canonicalModel?: CanonicalFloorPlanRenderModel;
}): boolean {
  if (findCanonicalPlacementWall(canonicalModel, room, position, rotationY, dimensions)) return false;
  // Inside the room's laminate panels (lib/room-finished-outline.ts).
  const depths = getRoomWallFinishDepths(room);
  const outline = getRoomOutlineInsideFinishes({
    shape: room.planShape ?? houseRoom?.shape ?? "rectangle",
    polygon: room.planPolygon ?? houseRoom?.polygon,
    holes: room.planHoles ?? houseRoom?.holes,
    w: room.geometry.width,
    d: room.geometry.depth,
  }, depths);
  return isCatalogPlacementLocalFootprintInsideRoom({
    room: { id: room.id, name: room.name, ...outline, ...boundsHolding(outline, depths), x: 0, z: 0 },
    position,
    rotationY,
    dimsMm: dimensions,
    wallThickness: getFurnitureWallInset(
      room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness
    ),
  });
}

export function useDesignPagePlacementRoomQueries({
  configuration,
  actions,
}: UseDesignPagePlacementRoomQueriesInput) {
  const { houseRoomById } = configuration;
  const canonicalModel = useMemo(() => configuration.canonicalDocument
    ? compileCanonicalFloorPlanRenderModel(configuration.canonicalDocument) : undefined, [configuration.canonicalDocument]);
  const { getItemAABB } = actions;

  const catalogPlacementCollidesInRoom =
    useCallback<PlacementCollidesInRoom>(
      (room, productId, position, rotationY, dimensions, excludedItems) =>
        placementCollidesInRoom({
          room, productId, position, rotationY, dimensions, excludedItems, getItemAABB,
        }),
      [getItemAABB]
    );

  const findCatalogPlacementBlockerInRoom =
    useCallback<FindPlacementBlockerInRoom>(
      (room, productId, position, rotationY, dimensions, excludedItems) =>
        findPlacementBlockerInRoom({
          room, productId, position, rotationY, dimensions, excludedItems, getItemAABB,
        }),
      [getItemAABB]
    );

  const isCatalogPlacementContainedInRoom =
    useCallback<IsPlacementContainedInRoom>(
      (room, position, rotationY, dimensions) =>
        isPlacementContainedInRoom({
          room,
          position,
          rotationY,
          dimensions,
          houseRoom: houseRoomById.get(room.id),
          canonicalModel,
        }),
      [houseRoomById, canonicalModel]
    );

  return {
    queries: {
      clampToCatalogPlacementRoom: clampToPlacementRoom,
      catalogPlacementCollidesInRoom,
      findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom,
    },
  };
}
