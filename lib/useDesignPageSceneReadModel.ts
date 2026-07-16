"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { findCatalogPlacementPlanRoomAtWorldPoint } from "@/lib/catalog-placement";
import { buildAiLayoutPreviewFootprints } from "@/lib/design-page-ai-layout-preview";
import type { PendingAiLayoutProposal } from "@/lib/design-page-ai-layout-proposal";
import {
  HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS,
} from "@/lib/design-page-floor-plan-utils";
import {
  ROOM_DIMENSION_DEFAULTS,
  buildHousePlan2D,
} from "@/lib/design-page-house-plan";
import type {
  DesignItem,
  DesignSnapshot,
  RoomSnapshot,
} from "@/lib/room-types";
import type { SurfaceTargetMode } from "@/lib/useDesignPageSurfaceActions";
import { useDesignPageScenePerformance } from "@/lib/useDesignPageScenePerformance";

type HousePlanRoom = ReturnType<typeof buildHousePlan2D>["rooms"][number];

type SceneRoomItem = {
  item: DesignItem;
  roomId: string;
  roomOffset: { x: number; z: number };
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  roomPlanShape: NonNullable<RoomSnapshot["planShape"]>;
  roomPlanPolygon: RoomSnapshot["planPolygon"];
  roomWallThickness: number;
  roomWallInset: number;
  isActiveRoom: boolean;
};

export type BuildDesignPageSceneRoomItemsInput = {
  activeRoom: RoomSnapshot | null;
  designSnapshot: DesignSnapshot;
  hasWholeHousePlan: boolean;
  housePlanRooms: HousePlanRoom[];
  houseRoomById: Map<string, HousePlanRoom>;
  usesHousePlanScene: boolean;
  viewMode: EditorViewMode;
};

export function buildDesignPageSceneRoomItems({
  activeRoom,
  designSnapshot,
  hasWholeHousePlan,
  housePlanRooms,
  houseRoomById,
  usesHousePlanScene,
  viewMode,
}: BuildDesignPageSceneRoomItemsInput): SceneRoomItem[] {
  if (!hasWholeHousePlan) {
    if (!activeRoom) return [];
    const planRoom = houseRoomById.get(activeRoom.id);
    return activeRoom.items.map((item) => ({
      item,
      roomId: activeRoom.id,
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
      roomWidth: activeRoom.geometry.width,
      roomDepth: activeRoom.geometry.depth,
      roomHeight:
        activeRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
      roomPlanShape: activeRoom.planShape ?? "rectangle",
      roomPlanPolygon: activeRoom.planPolygon,
      roomWallThickness:
        activeRoom.geometry.wallThickness ??
        ROOM_DIMENSION_DEFAULTS.wallThickness,
      roomWallInset:
        viewMode === "2d"
          ? 0
          : usesHousePlanScene
            ? HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS / 2
            : activeRoom.geometry.wallThickness ??
              ROOM_DIMENSION_DEFAULTS.wallThickness,
      isActiveRoom: true,
    }));
  }

  const visibleRoomIds = new Set(housePlanRooms.map((room) => room.id));
  return designSnapshot.rooms
    .filter((room) => visibleRoomIds.has(room.id))
    .flatMap((room) => {
      const planRoom = houseRoomById.get(room.id);
      const roomOffset = { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 };
      return room.items.map((item) => ({
        item,
        roomId: room.id,
        roomOffset,
        roomWidth: room.geometry.width,
        roomDepth: room.geometry.depth,
        roomHeight:
          room.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
        roomPlanShape: room.planShape ?? "rectangle",
        roomPlanPolygon: room.planPolygon,
        roomWallThickness:
          viewMode === "2d"
            ? room.geometry.wallThickness ??
              ROOM_DIMENSION_DEFAULTS.wallThickness
            : HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS,
        roomWallInset:
          viewMode === "2d"
            ? 0
            : HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS / 2,
        isActiveRoom: room.id === designSnapshot.activeRoomId,
      }));
    });
}

export function reconcileDesignPageSceneReadiness(
  current: Record<string, boolean>,
  renderItemKeys: string[]
): Record<string, boolean> {
  const activeKeys = new Set(renderItemKeys);
  const next: Record<string, boolean> = {};
  let changed = Object.keys(current).length !== renderItemKeys.length;

  for (const key of renderItemKeys) {
    if (current[key] !== undefined) {
      next[key] = current[key];
    } else {
      changed = true;
    }
  }

  for (const key of Object.keys(current)) {
    if (!activeKeys.has(key)) {
      changed = true;
      break;
    }
  }

  return changed ? next : current;
}

export type UseDesignPageSceneReadModelInput = {
  state: {
    document: {
      designSnapshot: DesignSnapshot;
      activeRoom: RoomSnapshot | null;
      items: DesignItem[];
    };
    plan: {
      housePlanRooms: HousePlanRoom[];
      activeRoomPlanOffset: { x: number; z: number };
      roomWidth: number;
      roomDepth: number;
      stackedFloorView: boolean;
      hiddenFloorLevels: number[];
      selectedPlanRoomId: string | null;
    };
    editor: {
      viewMode: EditorViewMode;
      activeSurfaceTarget: SurfaceTargetMode;
      surfaceBrushActive: boolean;
    };
    ai: {
      pendingProposal: PendingAiLayoutProposal | null;
    };
  };
  actions: {
    setSelectedPlanRoomId: Dispatch<SetStateAction<string | null>>;
    showToast: (message: string) => void;
  };
};

export function useDesignPageSceneReadModel({
  state,
  actions,
}: UseDesignPageSceneReadModelInput) {
  const {
    document: { designSnapshot, activeRoom, items },
    plan: {
      housePlanRooms,
      activeRoomPlanOffset,
      roomWidth,
      roomDepth,
      stackedFloorView,
      hiddenFloorLevels,
      selectedPlanRoomId,
    },
    editor: { viewMode, activeSurfaceTarget, surfaceBrushActive },
    ai: { pendingProposal },
  } = state;
  const { setSelectedPlanRoomId, showToast } = actions;
  const [sceneProgressReady, setSceneProgressReady] = useState(false);
  const [sceneRenderItemReadyByKey, setSceneRenderItemReadyByKey] = useState<
    Record<string, boolean>
  >({});
  const previousSelectedPlanActiveRoomIdRef = useRef<string | null>(null);

  const hasWholeHousePlan = housePlanRooms.length > 1;
  const hasWallSurfaceFinishes = designSnapshot.rooms.some((room) => {
    const surfaces = room.surfaces ?? room.surfaceFinishes;
    const defaultWall = surfaces?.walls?.default;
    const faceSettings = Object.values(surfaces?.walls?.faces ?? {});
    return Boolean(
      surfaces?.wallMaterialId ||
        defaultWall?.materialId ||
        defaultWall?.paintColorHex ||
        faceSettings.some(
          (settings) => settings.materialId || settings.paintColorHex
        )
    );
  });
  const usesHousePlanScene =
    stackedFloorView ||
    hasWholeHousePlan ||
    activeSurfaceTarget !== "floor" ||
    surfaceBrushActive ||
    hasWallSurfaceFinishes ||
    housePlanRooms.some((room) => room.shape !== "rectangle");
  const sceneHousePlanRooms3D = useMemo(
    () =>
      stackedFloorView
        ? buildHousePlan2D(
            designSnapshot.rooms.filter(
              (room) => !hiddenFloorLevels.includes(room.floorLevel ?? 1)
            ),
            roomWidth,
            roomDepth
          ).rooms
        : housePlanRooms,
    [
      designSnapshot.rooms,
      hiddenFloorLevels,
      housePlanRooms,
      roomDepth,
      roomWidth,
      stackedFloorView,
    ]
  );

  useEffect(() => {
    const activeRoomId = designSnapshot.activeRoomId ?? null;
    const activeRoomChanged =
      previousSelectedPlanActiveRoomIdRef.current !== activeRoomId;
    const roomIds = new Set(housePlanRooms.map((room) => room.id));

    if (activeRoomChanged) {
      previousSelectedPlanActiveRoomIdRef.current = activeRoomId;
      setSelectedPlanRoomId(
        activeRoomId && roomIds.has(activeRoomId) ? activeRoomId : null
      );
      return;
    }

    setSelectedPlanRoomId((currentRoomId) =>
      currentRoomId && !roomIds.has(currentRoomId) ? null : currentRoomId
    );
  }, [
    designSnapshot.activeRoomId,
    housePlanRooms,
    setSelectedPlanRoomId,
  ]);

  const houseRoomById = useMemo(
    () => new Map(housePlanRooms.map((room) => [room.id, room])),
    [housePlanRooms]
  );
  const selectedPlanRoomContext = selectedPlanRoomId
    ? houseRoomById.get(selectedPlanRoomId) ?? null
    : null;
  const roomSnapshotById = useMemo(
    () => new Map(designSnapshot.rooms.map((room) => [room.id, room])),
    [designSnapshot.rooms]
  );
  const findPlanRoomAtWorldPoint = useCallback(
    (x: number, z: number) =>
      findCatalogPlacementPlanRoomAtWorldPoint(sceneHousePlanRooms3D, x, z),
    [sceneHousePlanRooms3D]
  );
  const {
    state: {
      mode: scenePerformanceMode,
      autoLite: autoLiteScene,
      sample: scenePerformanceSample,
      liteEnabled: liteSceneEnabled,
      renderQuality: sceneRenderQuality,
    },
    actions: {
      changeMode: handleScenePerformanceModeChange,
      recordSample: handleScenePerformanceSample,
      handleSustainedLowFps,
    },
  } = useDesignPageScenePerformance({
    state: { itemCount: items.length, viewMode },
    actions: { showToast },
  });
  const sceneRoomItems = useMemo(
    () =>
      buildDesignPageSceneRoomItems({
        activeRoom,
        designSnapshot,
        hasWholeHousePlan,
        housePlanRooms,
        houseRoomById,
        usesHousePlanScene,
        viewMode,
      }),
    [
      activeRoom,
      designSnapshot,
      hasWholeHousePlan,
      housePlanRooms,
      houseRoomById,
      usesHousePlanScene,
      viewMode,
    ]
  );
  const sceneRenderItemKeys = useMemo(
    () =>
      viewMode === "3d"
        ? sceneRoomItems.map((entry) =>
            [
              entry.roomId,
              entry.item.instanceId,
              entry.item.productId,
              entry.item.variantId ?? "",
              sceneRenderQuality,
            ].join(":")
          )
        : [],
    [sceneRenderQuality, sceneRoomItems, viewMode]
  );

  useEffect(() => {
    // Readiness belongs to the current render-key set and must be pruned when it changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSceneRenderItemReadyByKey((current) =>
      reconcileDesignPageSceneReadiness(current, sceneRenderItemKeys)
    );
  }, [sceneRenderItemKeys]);

  const handleSceneRenderItemReadyChange = useCallback(
    (key: string, ready: boolean) => {
      setSceneRenderItemReadyByKey((current) =>
        current[key] === ready ? current : { ...current, [key]: ready }
      );
    },
    []
  );
  const sceneRenderItemsReady =
    viewMode !== "3d" ||
    sceneRenderItemKeys.length === 0 ||
    sceneRenderItemKeys.every(
      (key) => sceneRenderItemReadyByKey[key] === true
    );
  const sceneReady =
    viewMode === "3d"
      ? sceneProgressReady && sceneRenderItemsReady
      : sceneProgressReady;
  const showSceneLoadingVeil = viewMode === "3d" && !sceneReady;
  const aiLayoutPreviewFootprints = useMemo(
    () =>
      pendingProposal
        ? buildAiLayoutPreviewFootprints({
            items: pendingProposal.items,
            roomOffset: activeRoomPlanOffset,
          })
        : [],
    [activeRoomPlanOffset, pendingProposal]
  );
  const aiLayoutPreviewTone =
    pendingProposal?.fitRisk === "high"
      ? {
          fill: "#f59e0b",
          line: "#d97706",
          text: "Needs review",
        }
      : pendingProposal?.fitRisk === "medium"
        ? {
            fill: "#38bdf8",
            line: "#0284c7",
            text: "Check clearances",
          }
        : {
            fill: "#10b981",
            line: "#059669",
            text: "Ready to apply",
          };

  return {
    state: {
      sceneReady,
      showSceneLoadingVeil,
      scenePerformanceMode,
      autoLiteScene,
      scenePerformanceSample,
      liteSceneEnabled,
      sceneRenderQuality,
    },
    derived: {
      hasWholeHousePlan,
      usesHousePlanScene,
      sceneHousePlanRooms3D,
      houseRoomById,
      selectedPlanRoomContext,
      roomSnapshotById,
      sceneRoomItems,
      aiLayoutPreviewFootprints,
      aiLayoutPreviewTone,
    },
    actions: {
      setSceneProgressReady,
      handleSceneRenderItemReadyChange,
      handleScenePerformanceModeChange,
      handleScenePerformanceSample,
      handleSustainedLowFps,
    },
    queries: { findPlanRoomAtWorldPoint },
  };
}
