import { getPlanRoomAreaSquareMeters } from "@/lib/plan-room-summary";
import type { RoomSnapshot } from "@/lib/room-types";

export type DesignPageSurfaceRoomSummary = Pick<RoomSnapshot, "id" | "name" | "roomType" | "floorLabel" | "surfaces" | "surfaceFinishes"> & {
  width: number; depth: number; height?: number; areaSquareMeters?: number;
};

export function buildSurfaceRoomSummary(room: RoomSnapshot): DesignPageSurfaceRoomSummary {
  return {
    id: room.id,
    name: room.name,
    floorLabel: room.floorLabel,
    roomType: room.roomType,
    width: room.geometry.width,
    depth: room.geometry.depth,
    areaSquareMeters: getPlanRoomAreaSquareMeters({
      w: room.geometry.width, d: room.geometry.depth, polygon: room.planPolygon, holes: room.planHoles,
    }),
    height: room.geometry.height,
    surfaces: room.surfaces,
    surfaceFinishes: room.surfaceFinishes,
  };
}

