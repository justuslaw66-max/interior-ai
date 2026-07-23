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
import { track, trackProductEvent } from "@/lib/analytics";
import {
  clampToRoom,
  getFurnitureWallInset,
} from "@/lib/design-page-geometry";
import {
  buildHousePlan2D,
  clampRoomDimension,
  getActiveRoomPlanOffset,
  getNextRoomPlanPosition,
  resolveHouseRoomMove,
  resolveNewRoomName,
  resolveHouseRoomDimension,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
  roundPlanCoordinate,
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

  const roomWidth = resolveHouseRoomDimension(
    activeRoom?.geometry.width,
    ROOM_DIMENSION_DEFAULTS.width
  );

  const roomDepth = resolveHouseRoomDimension(
    activeRoom?.geometry.depth,
    ROOM_DIMENSION_DEFAULTS.depth
  );

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
  const activeRoomPlanHoles = activeRoom?.planHoles;
  const activeFloorLevel =
    typeof activeRoom?.floorLevel === "number" && Number.isFinite(activeRoom.floorLevel)
      ? activeRoom.floorLevel
      : 1;

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
        getFurnitureWallInset(targetWallThickness),
        rotationY,
        activeRoomPlanShape,
        activeRoomPlanPolygon,
        activeRoomPlanHoles
      ),
    [activeRoomPlanHoles, activeRoomPlanPolygon, activeRoomPlanShape]
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

  const activeFloorRooms = useMemo(
    () =>
      (designSnapshot.rooms ?? []).filter(
        (room) => (room.floorLevel ?? 1) === activeFloorLevel
      ),
    [activeFloorLevel, designSnapshot.rooms]
  );

  const housePlan2D = useMemo(
    () => buildHousePlan2D(activeFloorRooms, roomWidth, roomDepth),
    [activeFloorRooms, roomDepth, roomWidth]
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
    const roomName = resolveNewRoomName(activeFloorRooms, nextRoomType);
    const newRoom = createRoom(
      `room_${Date.now()}`,
      roomName,
      nextRoomType,
      {
        width: nextRoomWidth,
        depth: nextRoomDepth,
        wallThickness,
        height: roomHeight,
        slabThickness:
          activeRoom?.geometry.slabThickness ?? ROOM_DIMENSION_DEFAULTS.slabThickness,
      }
    );
    newRoom.floorLevel = activeFloorLevel;
    newRoom.floorLabel = activeRoom?.floorLabel;
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
    if (activeRoom?.surfaceFinishes) {
      newRoom.surfaceFinishes = { ...activeRoom.surfaceFinishes };
    }
    if (activeRoom?.surfaceOpacity) {
      newRoom.surfaceOpacity = { ...activeRoom.surfaceOpacity };
    }

    setDesignSnapshot((prev) => {
      const updated = addRoom(prev, newRoom);
      return switchRoom(updated, newRoom.id);
    });

    track("editor_room_added", { roomType: newRoom.roomType, roomName: newRoom.name });
    trackProductEvent("room_created", {
      roomType: newRoom.roomType,
      source: "editor",
      roomCount: activeFloorRooms.length + 1,
    });
  }, [
    activeRoom,
    activeFloorLevel,
    activeFloorRooms,
    housePlan2D.rooms,
    newRoomShape,
    newRoomType,
    roomDepth,
    roomWidth,
    roomHeight,
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
    (roomId: string, x: number, z: number, options?: { snap?: boolean }) => {
      const move = resolveHouseRoomMove({
        roomId,
        x,
        z,
        rooms: housePlan2D.rooms,
        snap: options?.snap !== false,
      });
      if (!move || move.movementStatus === "blocked") return;

      setDesignSnapshot((prev) => {
        const target = prev.rooms.find((room) => room.id === roomId);
        if (!target) return prev;
        const nextPosition = {
          x: roundPlanCoordinate(move.x),
          z: roundPlanCoordinate(move.z),
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
