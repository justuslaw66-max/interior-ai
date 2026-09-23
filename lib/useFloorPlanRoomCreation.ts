"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { track } from "@/lib/analytics";
import {
  doesHouseRoomOverlap,
  getRoomTypeLabel,
  ROOM_DIMENSION_DEFAULTS,
  shouldReplaceStarterRoomWithDrawnRoom,
  type HousePlan2D,
} from "@/lib/design-page-house-plan";
import type {
  ResolvedWallDrawRoom,
  TracedRoomRectangle,
} from "@/lib/floor-plan-tracing";
import {
  updateRoom,
  type DesignSnapshot,
  type RoomPlanShape,
  type RoomSnapshot,
  type RoomType,
} from "@/lib/room-types";

type AddFloorPlanRoomOptions = {
  roomType?: RoomType;
  shape?: RoomPlanShape;
  width?: number;
  depth?: number;
  planPosition?: { x: number; z: number };
  planPolygon?: Array<{ x: number; z: number }>;
};

type UseFloorPlanRoomCreationParams = {
  activeRoom: RoomSnapshot | null;
  floorPlanTraceRoomType: RoomType;
  handleAddRoom: (options?: AddFloorPlanRoomOptions) => void;
  housePlanRooms: HousePlan2D["rooms"];
  roomCount: number;
  setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
  showRuleToast: (label: string) => void;
};

type ApplyDrawnRoomParams = {
  bounds: TracedRoomRectangle;
  overlapFallbackRoomId: string;
  planPolygon?: Array<{ x: number; z: number }>;
  shape: RoomPlanShape;
  successLabel: string;
  trackShape?: boolean;
};

function resolveRoomWallThickness(room: RoomSnapshot) {
  return typeof room.geometry.wallThickness === "number" &&
    Number.isFinite(room.geometry.wallThickness)
    ? room.geometry.wallThickness
    : ROOM_DIMENSION_DEFAULTS.wallThickness;
}

export function useFloorPlanRoomCreation({
  activeRoom,
  floorPlanTraceRoomType,
  handleAddRoom,
  housePlanRooms,
  roomCount,
  setDesignSnapshot,
  showRuleToast,
}: UseFloorPlanRoomCreationParams) {
  const applyDrawnRoom = useCallback(
    ({
      bounds,
      overlapFallbackRoomId,
      planPolygon,
      shape,
      successLabel,
      trackShape = false,
    }: ApplyDrawnRoomParams) => {
      const canReplaceStarterRoom =
        roomCount === 1 &&
        shouldReplaceStarterRoomWithDrawnRoom({
          activeRoom,
          rooms: housePlanRooms,
          x: bounds.x,
          z: bounds.z,
          w: bounds.width,
          d: bounds.depth,
        });
      const overlapRoomId =
        canReplaceStarterRoom && activeRoom ? activeRoom.id : overlapFallbackRoomId;

      if (
        doesHouseRoomOverlap(
          overlapRoomId,
          bounds.x,
          bounds.z,
          bounds.width,
          bounds.depth,
          housePlanRooms
        )
      ) {
        showRuleToast("Traced room overlaps another room");
        return false;
      }

      if (canReplaceStarterRoom && activeRoom) {
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((room) => room.id === activeRoom.id);
          if (!target) return prev;

          return updateRoom(prev, {
            ...target,
            name: getRoomTypeLabel(floorPlanTraceRoomType),
            roomType: floorPlanTraceRoomType,
            geometry: {
              ...target.geometry,
              width: bounds.width,
              depth: bounds.depth,
              wallThickness: resolveRoomWallThickness(target),
            },
            planPosition: {
              x: bounds.x,
              z: bounds.z,
            },
            planShape: shape,
            planPolygon,
          });
        });
      } else {
        handleAddRoom({
          roomType: floorPlanTraceRoomType,
          shape,
          width: bounds.width,
          depth: bounds.depth,
          planPosition: {
            x: bounds.x,
            z: bounds.z,
          },
          planPolygon,
        });
      }

      showRuleToast(successLabel);
      track("floor_plan_room_drawn", {
        roomType: floorPlanTraceRoomType,
        width: bounds.width,
        depth: bounds.depth,
        ...(trackShape ? { shape } : {}),
        replacedStarterRoom: canReplaceStarterRoom,
      });
      return true;
    },
    [
      activeRoom,
      floorPlanTraceRoomType,
      handleAddRoom,
      housePlanRooms,
      roomCount,
      setDesignSnapshot,
      showRuleToast,
    ]
  );

  const applyTracedRoomRectangle = useCallback(
    (bounds: TracedRoomRectangle) =>
      applyDrawnRoom({
        bounds,
        overlapFallbackRoomId: "__new_traced_room__",
        shape: "rectangle",
        successLabel: "Room drawn",
      }),
    [applyDrawnRoom]
  );

  const applyResolvedWallDrawRoom = useCallback(
    (resolvedRoom: ResolvedWallDrawRoom) => {
      if (resolvedRoom.shape === "rectangle") {
        return applyTracedRoomRectangle(resolvedRoom.bounds);
      }

      return applyDrawnRoom({
        bounds: resolvedRoom.bounds,
        overlapFallbackRoomId: "__new_wall_room__",
        planPolygon: resolvedRoom.planPolygon,
        shape: resolvedRoom.shape,
        successLabel: "Custom room drawn",
        trackShape: true,
      });
    },
    [applyDrawnRoom, applyTracedRoomRectangle]
  );

  return {
    applyResolvedWallDrawRoom,
    applyTracedRoomRectangle,
  };
}
