"use client";

import { useCallback, useMemo } from "react";

import type { DimensionsMm } from "@/lib/catalog-schema";
import {
  doesCatalogPlacementCollide,
  findCatalogPlacementCollision,
  isCatalogPlacementLocalFootprintInsideRoom,
} from "@/lib/catalog-placement";
import { getFurnitureWallInset, type AABB } from "@/lib/design-page-geometry";
import { clampToRoomInsideFinishes, getRoomOutlineInsideFinishes } from "@/lib/room-finished-outline";
import { getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import {
  ROOM_DIMENSION_DEFAULTS,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { compileCanonicalFloorPlanRenderModel, type CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { findCanonicalPlacementWall } from "@/lib/floor-plan-placement-boundaries";
import {
  builtInFootprintFits,
  getBuiltInStandOff,
  getRoomBuiltInFaces,
  usesFurnitureRuleForBuiltIns,
  type BuiltInPlanRooms,
} from "@/lib/room-built-in-faces";

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
  dimensions: PlacementDimensions,
  /** A built-in cabinet, which may stand against the finished face; furniture keeps 2 cm off it. */
  builtIn?: boolean
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

export function isPlacementContainedInRoom({
  room,
  position,
  rotationY,
  dimensions,
  houseRoom,
  canonicalModel,
  builtIn = false,
  planRooms,
}: {
  room: RoomSnapshot;
  position: [number, number, number];
  rotationY: number;
  dimensions: PlacementDimensions;
  houseRoom?: HousePlanRoom2D;
  canonicalModel?: CanonicalFloorPlanRenderModel;
  builtIn?: boolean;
  /** The plan's rooms: the walls the 3D view draws around the room stand in its region (lib/room-built-in-faces.ts). */
  planRooms?: BuiltInPlanRooms;
}): boolean {
  // A built-in may stand against the finished face (one on the floor against the baseboard), by its real (turned) footprint,
  // and anywhere furniture may; a room on furniture's rule for built-ins keeps that alone (lib/room-built-in-faces.ts).
  if (builtIn && !usesFurnitureRuleForBuiltIns(room, undefined, planRooms) && builtInFootprintFits(getRoomBuiltInFaces(room, undefined, planRooms),
    position[0], position[2], dimensions.w / 1000, dimensions.d / 1000, rotationY, undefined, getBuiltInStandOff(room, position[1]))) return true;
  if (findCanonicalPlacementWall(canonicalModel, room, position, rotationY, dimensions)) return false;
  // Inside the room's laminate panels (lib/room-finished-outline.ts).
  const outline = getRoomOutlineInsideFinishes({
    shape: room.planShape ?? houseRoom?.shape ?? "rectangle",
    polygon: room.planPolygon ?? houseRoom?.polygon,
    holes: room.planHoles ?? houseRoom?.holes,
    w: room.geometry.width,
    d: room.geometry.depth,
  }, getRoomWallFinishDepths(room));
  return isCatalogPlacementLocalFootprintInsideRoom({
    room: { id: room.id, name: room.name, ...outline, x: 0, z: 0 },
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
      (room, position, rotationY, dimensions, builtIn) =>
        isPlacementContainedInRoom({
          room,
          position,
          rotationY,
          dimensions,
          houseRoom: houseRoomById.get(room.id),
          canonicalModel,
          builtIn,
          planRooms: houseRoomById,
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
