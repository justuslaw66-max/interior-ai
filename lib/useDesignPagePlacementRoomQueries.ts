"use client";

import { useCallback, useMemo } from "react";

import type { DimensionsMm } from "@/lib/catalog-schema";
import {
  doesCatalogPlacementCollide,
  findCatalogPlacementCollision,
  isCatalogPlacementLocalFootprintInsideRoom,
} from "@/lib/catalog-placement";
import { FURNITURE_WALL_CLEARANCE_METERS, getFurnitureWallInset, type AABB } from "@/lib/design-page-geometry";
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
import { getFurnitureRoomContext } from "@/lib/furniture-room-context";
import { getFurnitureFaces, isFurnitureFootprintClear, type FurnitureRoomContext } from "@/lib/furniture-room-fit";
import {
  builtInFootprintFits,
  getBuiltInDragPlace,
  getBuiltInStandOff,
  getRoomBuiltInFaces,
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

/** Where a built-in dragged from `from` to `position` goes (getBuiltInDragPlace): there, or out of a place it doesn't fit. */
export type PlaceBuiltInDragInRoom = (
  room: RoomSnapshot, from: [number, number, number], position: [number, number, number], rotationY: number, dimensions: PlacementDimensions
) => [number, number, number];

type UseDesignPagePlacementRoomQueriesInput = {
  configuration: {
    houseRoomById: ReadonlyMap<string, HousePlanRoom2D>;
    canonicalDocument?: FloorPlanDocumentV2;
  };
  actions: {
    getItemAABB: GetItemAABB;
  };
};

/**
 * Furniture's clamp in a room, 2 cm off its walls as its 3D view draws them: the plan's rooms next door's too (`planRooms`), and
 * an imported plan's as compiled (`floors`).
 */
export function clampToPlacementRoom(
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY: number = 0,
  planRooms?: BuiltInPlanRooms,
  floors?: CanonicalFloorPlanRenderModel["floors"]
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
    getRoomWallFinishDepths(room),
    getFurnitureRoomContext(room, planRooms, floors)
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

/** Whether furniture stands clear in its room's outline by its 3D view's walls; null where the room's walls aren't known. */
function isFurnitureClearInRoom(
  outline: RoomPlanOutline, position: [number, number, number], rotationY: number, dimensions: PlacementDimensions,
  context: FurnitureRoomContext
): boolean | null {
  if (outline.shape !== "custom_polygon" || !outline.polygon?.length) return null;
  const faces = getFurnitureFaces(outline.polygon, outline.holes ?? [], FURNITURE_WALL_CLEARANCE_METERS, context);
  return faces && isFurnitureFootprintClear(faces, position[0], position[2], dimensions.w / 1000, dimensions.d / 1000, rotationY);
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
  // A built-in stands in its room's region by its real (turned) footprint, crossing no wall, panel or column (the walls of the
  // rooms next door included; an imported plan's own 3D walls and panels, from `canonicalModel`), against the finished face,
  // and one on the floor against the baseboard, never in it (lib/room-built-in-faces.ts). Only a room on furniture's rule for
  // built-ins (no exposed face, or an imported room its model doesn't hold) takes furniture's containment.
  if (builtIn) {
    const faces = getRoomBuiltInFaces(room, undefined, planRooms, canonicalModel);
    if (!faces.furnitureRule) {
      return builtInFootprintFits(faces, position[0], position[2], dimensions.w / 1000, dimensions.d / 1000, rotationY, undefined,
        getBuiltInStandOff(room, position[1]));
    }
  }
  // Inside the room's laminate panels (lib/room-finished-outline.ts).
  const depths = getRoomWallFinishDepths(room);
  const outline = getRoomOutlineInsideFinishes({
    shape: room.planShape ?? houseRoom?.shape ?? "rectangle",
    polygon: room.planPolygon ?? houseRoom?.polygon,
    holes: room.planHoles ?? houseRoom?.holes,
    w: room.geometry.width,
    d: room.geometry.depth,
  }, depths);
  // Furniture in a drawn or imported room: its real footprint 2 cm off the walls as the 3D view draws them (a door's or a
  // window's reveal and the wall over it counted as wall), and nothing else: the clamp keeps to the same shapes.
  const context = builtIn ? null : getFurnitureRoomContext(room, planRooms, canonicalModel?.floors);
  const exact = context && isFurnitureClearInRoom(outline, position, rotationY, dimensions, context);
  if (typeof exact === "boolean") return exact;
  if (findCanonicalPlacementWall(canonicalModel, room, position, rotationY, dimensions)) return false;
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
      (room, position, rotationY, dimensions, builtIn) =>
        isPlacementContainedInRoom({
          room, position, rotationY, dimensions, houseRoom: houseRoomById.get(room.id), canonicalModel, builtIn, planRooms: houseRoomById,
        }),
      [houseRoomById, canonicalModel]
    );

  // Furniture's clamp knows the plan's rooms next door and an imported plan's walls as compiled.
  const clampToCatalogPlacementRoom = useCallback<ClampToPlacementRoom>((room, x, z, itemWidth, itemDepth, rotationY) =>
    clampToPlacementRoom(room, x, z, itemWidth, itemDepth, rotationY, houseRoomById, canonicalModel?.floors), [houseRoomById, canonicalModel]);

  const placeBuiltInDragInRoom = useCallback<PlaceBuiltInDragInRoom>((room, from, position, rotationY, dimensions) => {
    const [x, z] = getBuiltInDragPlace(room, [from[0], from[2]], position[0], position[2], dimensions.w / 1000, dimensions.d / 1000, rotationY,
      { planRooms: houseRoomById, canonical: canonicalModel, bottom: position[1] });
    return [x, position[1], z];
  }, [houseRoomById, canonicalModel]);

  return {
    /** The imported plan's canonical model, compiled once here: built-ins' moves read it too (features/cabinetry). */
    canonicalModel,
    queries: {
      placeBuiltInDragInRoom,
      clampToCatalogPlacementRoom,
      catalogPlacementCollidesInRoom,
      findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom,
    },
  };
}
