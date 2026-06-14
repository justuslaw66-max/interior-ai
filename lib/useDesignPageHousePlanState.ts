import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  addRoom,
  createRoom,
  getActiveRoom,
  updateRoom,
  switchRoom,
  type DesignSnapshot,
  type RoomPlanShape,
  type RoomType,
} from "@/lib/room-types";
import { track } from "@/lib/analytics";
import { clampToRoom } from "@/lib/design-page-geometry";
import {
  buildHousePlan2D,
  clampRoomDimension,
  getActiveRoomPlanOffset,
  getNextRoomPlanPosition,
  resolveNewRoomName,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
  roundPlanCoordinate,
  snapHouseRoomMove,
} from "@/lib/design-page-house-plan";

type Params = {
  designSnapshot: DesignSnapshot;
  setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
  isPlanView2D: boolean;
};

type RoomDimensionInputState = {
  syncKey: string;
  width: string;
  depth: string;
};

type AddRoomOptions = {
  roomType?: RoomType;
  shape?: RoomPlanShape;
  width?: number;
  depth?: number;
  planPosition?: { x: number; z: number };
  planPolygon?: Array<{ x: number; z: number }>;
};

export function useDesignPageHousePlanState({
  designSnapshot,
  setDesignSnapshot,
  isPlanView2D,
}: Params) {
  const activeRoom = useMemo(() => getActiveRoom(designSnapshot), [designSnapshot]);

  const activeRoomWidth = activeRoom?.geometry.width;
  const roomWidth =
    typeof activeRoomWidth === "number" && Number.isFinite(activeRoomWidth)
      ? activeRoomWidth
      : ROOM_DIMENSION_DEFAULTS.width;

  const activeRoomDepth = activeRoom?.geometry.depth;
  const roomDepth =
    typeof activeRoomDepth === "number" && Number.isFinite(activeRoomDepth)
      ? activeRoomDepth
      : ROOM_DIMENSION_DEFAULTS.depth;

  const activeRoomHeight = activeRoom?.geometry.height;
  const roomHeight =
    typeof activeRoomHeight === "number" && Number.isFinite(activeRoomHeight)
      ? activeRoomHeight
      : ROOM_DIMENSION_DEFAULTS.roomHeight;

  const activeRoomWallThickness = activeRoom?.geometry.wallThickness;
  const wallThickness =
    typeof activeRoomWallThickness === "number" && Number.isFinite(activeRoomWallThickness)
      ? activeRoomWallThickness
      : ROOM_DIMENSION_DEFAULTS.wallThickness;
  const activeRoomPlanShape = activeRoom?.planShape ?? "rectangle";
  const activeRoomPlanPolygon = activeRoom?.planPolygon;

  const clampToActiveRoom = useCallback(
    (
      x: number,
      z: number,
      itemWidth: number,
      itemDepth: number,
      targetRoomWidth: number,
      targetRoomDepth: number,
      targetWallThickness: number,
      rotationY: number = 0
    ) =>
      clampToRoom(
        x,
        z,
        itemWidth,
        itemDepth,
        targetRoomWidth,
        targetRoomDepth,
        targetWallThickness,
        rotationY,
        activeRoomPlanShape,
        activeRoomPlanPolygon
      ),
    [activeRoomPlanPolygon, activeRoomPlanShape]
  );

  const formattedRoomWidth = roomWidth.toFixed(2);
  const formattedRoomDepth = roomDepth.toFixed(2);
  const roomDimensionSyncKey = `${formattedRoomWidth}:${formattedRoomDepth}`;
  const [roomDimensionInputs, setRoomDimensionInputs] =
    useState<RoomDimensionInputState>(() => ({
      syncKey: roomDimensionSyncKey,
      width: formattedRoomWidth,
      depth: formattedRoomDepth,
    }));

  if (roomDimensionInputs.syncKey !== roomDimensionSyncKey) {
    setRoomDimensionInputs({
      syncKey: roomDimensionSyncKey,
      width: formattedRoomWidth,
      depth: formattedRoomDepth,
    });
  }

  const setRoomWidthInput = useCallback((value: SetStateAction<string>) => {
    setRoomDimensionInputs((prev) => ({
      ...prev,
      width: typeof value === "function" ? value(prev.width) : value,
    }));
  }, []);

  const setRoomDepthInput = useCallback((value: SetStateAction<string>) => {
    setRoomDimensionInputs((prev) => ({
      ...prev,
      depth: typeof value === "function" ? value(prev.depth) : value,
    }));
  }, []);

  const [newRoomType, setNewRoomType] = useState<RoomType>("bedroom");
  const [newRoomShape, setNewRoomShape] = useState<RoomPlanShape>("rectangle");

  const activeRoomPresetId = useMemo(() => {
    const preset = ROOM_SIZE_PRESETS.find(
      (candidate) =>
        candidate.width === Number(roomWidth.toFixed(2)) &&
        candidate.depth === Number(roomDepth.toFixed(2))
    );
    return preset ? preset.id : "custom";
  }, [roomDepth, roomWidth]);

  const items = useMemo(() => activeRoom?.items ?? [], [activeRoom]);
  const zones = useMemo(() => activeRoom?.zones ?? [], [activeRoom]);

  const housePlan2D = useMemo(
    () => buildHousePlan2D(designSnapshot.rooms ?? [], roomWidth, roomDepth),
    [designSnapshot.rooms, roomDepth, roomWidth]
  );

  const activeRoomPlanOffset = useMemo(
    () => getActiveRoomPlanOffset(housePlan2D.rooms, designSnapshot.activeRoomId),
    [designSnapshot.activeRoomId, housePlan2D.rooms]
  );

  const planViewWidth = isPlanView2D ? housePlan2D.width : roomWidth;
  const planViewDepth = isPlanView2D ? housePlan2D.depth : roomDepth;

  const handleAddRoom = useCallback((options?: AddRoomOptions) => {
    const nextRoomType = options?.roomType ?? newRoomType;
    const nextRoomShape = options?.shape ?? newRoomShape;
    const nextRoomWidth =
      typeof options?.width === "number"
        ? clampRoomDimension(options.width)
        : roomWidth;
    const nextRoomDepth =
      typeof options?.depth === "number"
        ? clampRoomDimension(options.depth)
        : roomDepth;
    const roomName = resolveNewRoomName(designSnapshot.rooms, nextRoomType);
    const newRoom = createRoom(
      `room_${Date.now()}`,
      roomName,
      nextRoomType,
      {
        width: nextRoomWidth,
        depth: nextRoomDepth,
        wallThickness,
      }
    );
    newRoom.planPosition = options?.planPosition
      ? {
          x: roundPlanCoordinate(options.planPosition.x),
          z: roundPlanCoordinate(options.planPosition.z),
        }
      : getNextRoomPlanPosition(
          housePlan2D.rooms,
          roomWidth,
          nextRoomWidth
        );
    newRoom.planShape = nextRoomShape;
    newRoom.planPolygon = options?.planPolygon;

    setDesignSnapshot((prev) => {
      const updated = addRoom(prev, newRoom);
      return switchRoom(updated, newRoom.id);
    });

    track("editor_room_added", { roomType: newRoom.roomType, roomName: newRoom.name });
  }, [
    designSnapshot.rooms,
    housePlan2D.rooms,
    newRoomShape,
    newRoomType,
    roomDepth,
    roomWidth,
    setDesignSnapshot,
    wallThickness,
  ]);

  const handleRenameRoom = useCallback(
    (roomId: string, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed) return;

      setDesignSnapshot((prev) => {
        const target = prev.rooms.find((room) => room.id === roomId);
        if (!target) return prev;
        return updateRoom(prev, { ...target, name: trimmed });
      });
    },
    [setDesignSnapshot]
  );

  const handleMoveRoom2D = useCallback(
    (roomId: string, x: number, z: number) => {
      const snapped = snapHouseRoomMove(roomId, x, z, housePlan2D.rooms);
      if (!snapped) return;

      setDesignSnapshot((prev) => {
        const target = prev.rooms.find((room) => room.id === roomId);
        if (!target) return prev;
        const nextPosition = {
          x: roundPlanCoordinate(snapped.x),
          z: roundPlanCoordinate(snapped.z),
        };
        const currentPosition = target.planPosition ?? { x: 0, z: 0 };
        if (
          roundPlanCoordinate(currentPosition.x) === nextPosition.x &&
          roundPlanCoordinate(currentPosition.z) === nextPosition.z
        ) {
          return prev;
        }

        return updateRoom(prev, {
          ...target,
          planPosition: nextPosition,
        });
      });
    },
    [housePlan2D.rooms, setDesignSnapshot]
  );

  return {
    activeRoom,
    roomWidth,
    roomDepth,
    roomHeight,
    wallThickness,
    clampToActiveRoom,
    roomWidthInput: roomDimensionInputs.width,
    setRoomWidthInput,
    roomDepthInput: roomDimensionInputs.depth,
    setRoomDepthInput,
    newRoomType,
    setNewRoomType,
    newRoomShape,
    setNewRoomShape,
    activeRoomPresetId,
    items,
    zones,
    housePlan2D,
    activeRoomPlanOffset,
    planViewWidth,
    planViewDepth,
    handleAddRoom,
    handleRenameRoom,
    handleMoveRoom2D,
  };
}
