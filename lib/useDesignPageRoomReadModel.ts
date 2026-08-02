"use client";

import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import { type CATALOG_ITEMS } from "@/lib/catalog";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import {
  DEFAULT_FLOOR_MATERIAL_ID,
  clampFloorPatternScale,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import {
  countRoomCategories,
  countRoomProductQuantities,
  countRoomVariantQuantities,
  resolveRoomShoppingItems,
  summarizeShoppingRooms,
  summarizeWholeHomeShopping,
} from "@/lib/room-shopping";
import {
  buildRoomHealthSummary,
  resolveDesignPageRoomHealthReviewTarget,
} from "@/lib/room-health-summary";
import type {
  DesignItem,
  DesignSnapshot,
  RoomSnapshot,
} from "@/lib/room-types";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import {
  getCeilingSurfaceSettings,
  getDefaultWallSurfaceSettings,
  getWallPanelSurfaceSettings,
  normalizeFloorSurfaceSettings,
} from "@/lib/surface-settings";
import {
  ROOM_DIMENSION_DEFAULTS,
} from "@/lib/design-page-house-plan";
import { clampEditorOpacity } from "@/lib/design-page-floor-plan-utils";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import {
  useDesignPageSurfaceInspectorContext,
} from "@/lib/useDesignPageSurfaceInspector";
import type {
  SelectedWallSurfaceTarget,
  SurfaceTargetMode,
} from "@/lib/useDesignPageSurfaceActions";

export type UseDesignPageRoomReadModelInput = {
  state: {
    document: {
      designSnapshot: DesignSnapshot;
      activeRoom: RoomSnapshot | null;
      items: DesignItem[];
    };
    plan: {
      planOpenings: RoomOpening2D[];
      selectedPlanRoomId: string | null;
      activeRoomPlanOffset: { x: number; z: number };
      roomHeight: number;
      wallThickness: number;
    };
    surface: {
      activeSurfaceTarget: SurfaceTargetMode;
      selectedWallSurfaceTarget: SelectedWallSurfaceTarget | null;
    };
  };
  configuration: {
    isClientPreview: boolean;
    isDesigner: boolean;
    catalogItems: typeof CATALOG_ITEMS;
  };
  derived: {
    roomSnapshotById: Map<string, RoomSnapshot>;
  };
  actions: {
    setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
    setEditorMode: Dispatch<SetStateAction<DesignPageEditorMode>>;
    setShoppingReadinessFilter: Dispatch<
      SetStateAction<ShoppingReadinessFilter>
    >;
    goPlan: () => void;
    goFurnish: () => void;
    goShop: () => void;
    showToast: (message: string) => void;
  };
};

export function useDesignPageRoomReadModel({
  state,
  configuration,
  derived,
  actions,
}: UseDesignPageRoomReadModelInput) {
  const {
    document: { designSnapshot, activeRoom, items },
    plan: {
      planOpenings,
      selectedPlanRoomId,
      activeRoomPlanOffset,
      roomHeight,
      wallThickness,
    },
    surface: { activeSurfaceTarget, selectedWallSurfaceTarget },
  } = state;
  const { isClientPreview, isDesigner, catalogItems } = configuration;
  const { roomSnapshotById } = derived;
  const {
    setDesignPanelOpen,
    setEditorMode,
    setShoppingReadinessFilter,
    goPlan,
    goFurnish,
    goShop,
    showToast,
  } = actions;

  const roomItemCountsById = useMemo(
    () =>
      Object.fromEntries(
        designSnapshot.rooms.map((room) => [room.id, room.items.length])
      ) as Record<string, number>,
    [designSnapshot.rooms]
  );
  const roomShoppingSummaries = useMemo(
    () =>
      summarizeShoppingRooms(
        designSnapshot.rooms,
        designSnapshot.activeRoomId,
        catalogItems
      ),
    [catalogItems, designSnapshot.activeRoomId, designSnapshot.rooms]
  );
  const activeRoomShoppingSummary =
    roomShoppingSummaries.find(
      (room) => room.roomId === designSnapshot.activeRoomId
    ) ??
    roomShoppingSummaries[0] ??
    null;
  const activeRoomHealthSummary = useMemo(
    () =>
      activeRoom
        ? buildRoomHealthSummary({
            room: activeRoom,
            catalogItems,
            openings: planOpenings,
            shoppingNeedsReviewCount:
              activeRoomShoppingSummary?.needsReviewCount ?? 0,
          })
        : null,
    [
      activeRoom,
      activeRoomShoppingSummary?.needsReviewCount,
      catalogItems,
      planOpenings,
    ]
  );
  const reviewActiveRoomHealth = useCallback(() => {
    const target = resolveDesignPageRoomHealthReviewTarget(
      activeRoomHealthSummary
    );
    if (!target) return;
    setDesignPanelOpen(true);

    if (target === "shopping") {
      goShop();
      setShoppingReadinessFilter("all");
      showToast("Review shopping readiness for this room");
      return;
    }

    if (target === "export") {
      setEditorMode("present");
      showToast("Review export readiness for this room");
      return;
    }

    if (target === "placement") {
      goFurnish();
      showToast("Review placement issues in this room");
      return;
    }

    goPlan();
    showToast("Review room anchors and plan details");
  }, [
    activeRoomHealthSummary,
    goFurnish,
    goPlan,
    goShop,
    setDesignPanelOpen,
    setEditorMode,
    setShoppingReadinessFilter,
    showToast,
  ]);
  const activeRoomSurfaces =
    activeRoom?.surfaces ?? activeRoom?.surfaceFinishes;
  const activeRoomFloorMaterialId =
    activeRoomSurfaces?.floorMaterialId ?? DEFAULT_FLOOR_MATERIAL_ID;
  const activeRoomFloorRotationDeg = normalizeFloorRotationDeg(
    activeRoomSurfaces?.floorRotationDeg
  );
  const activeRoomFloorScale = clampFloorPatternScale(
    activeRoomSurfaces?.floorScale
  );
  const activeRoomFloorSettings = normalizeFloorSurfaceSettings(
    activeRoomSurfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const activeRoomCeilingSettings = getCeilingSurfaceSettings(
    activeRoomSurfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const activeSelectedWallFaceId =
    selectedWallSurfaceTarget &&
    selectedWallSurfaceTarget.roomId === activeRoom?.id
      ? selectedWallSurfaceTarget.faceId
      : null;
  const activeSelectedWallPanelId =
    selectedWallSurfaceTarget &&
    selectedWallSurfaceTarget.roomId === activeRoom?.id
      ? selectedWallSurfaceTarget.panelId ?? null
      : null;
  const activeRoomWallSettings = getDefaultWallSurfaceSettings(
    activeRoomSurfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const activeRoomSelectedWallSettings = getWallPanelSurfaceSettings(
    activeRoomSurfaces,
    activeSelectedWallFaceId,
    activeSelectedWallPanelId,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const surfaceRoomSummaries = useMemo(
    () =>
      designSnapshot.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        floorLabel: room.floorLabel,
        roomType: room.roomType,
        width: room.geometry.width,
        depth: room.geometry.depth,
        height: room.geometry.height,
        surfaces: room.surfaces,
        surfaceFinishes: room.surfaceFinishes,
      })),
    [designSnapshot.rooms]
  );
  const floorInspectorRoom = selectedPlanRoomId
    ? roomSnapshotById.get(selectedPlanRoomId) ?? activeRoom
    : activeRoom;
  const {
    context: surfaceInspectorContext,
    actions: surfaceInspectorUiActions,
  } = useDesignPageSurfaceInspectorContext({
    state: {
      inspectorRoom: floorInspectorRoom,
      activeSurfaceTarget,
      selectedWallSurfaceTarget,
    },
    configuration: {
      isClientPreview,
      isDesigner,
    },
  });
  const {
    wallInspectorFaceId,
    wallInspectorDefaultHeight,
    wallInspectorHeight,
    surfaceInspectorIsWall,
    surfaceInspectorIsCeiling,
    surfaceInspectorDisplayName,
  } = surfaceInspectorContext;
  const activeRoomHeightMm = Math.round(roomHeight * 1000);
  const canonicalActiveFloor = designSnapshot.floorPlan?.canonicalDocument?.floors.find(
    (floor) => floor.levelIndex === (activeRoom?.floorLevel ?? 1) - 1
  );
  const activeRoomWallHeightEvidence: FloorPlanPropertyEvidenceV2 | null =
    canonicalActiveFloor?.defaults.wallHeight.evidence ?? null;
  const canEditActiveRoomWallHeight =
    !isClientPreview &&
    (!activeRoomWallHeightEvidence ||
      floorPlanPropertyEvidenceIsEditable(activeRoomWallHeightEvidence));
  const activeRoomSlabThicknessEvidence: FloorPlanPropertyEvidenceV2 | null =
    canonicalActiveFloor
      ? canonicalActiveFloor.verticalEvidence?.slabThickness.evidence ?? "assumed"
      : null;
  const canEditActiveRoomSlabThickness =
    !isClientPreview &&
    (!activeRoomSlabThicknessEvidence ||
      floorPlanPropertyEvidenceIsEditable(activeRoomSlabThicknessEvidence));
  const activeRoomWallThicknessMm = Math.round(wallThickness * 1000);
  const activeRoomSlabThicknessMm = Math.round(
    canonicalActiveFloor?.slabThicknessMm ??
      (activeRoom?.geometry.slabThickness ??
        ROOM_DIMENSION_DEFAULTS.slabThickness) * 1000
  );
  const activeRoomBaseboardDepthMm = Math.max(
    0,
    Math.round((activeRoom?.geometry.baseboardDepth ?? 0) * 1000)
  );
  const activeRoomWallOpacity = clampEditorOpacity(
    activeRoom?.surfaceOpacity?.wall ?? 1
  );
  const activeRoomFloorOpacity = clampEditorOpacity(
    activeRoom?.surfaceOpacity?.floor ?? 1
  );
  const activeRoomCeilingOpacity = clampEditorOpacity(
    activeRoom?.surfaceOpacity?.ceiling ?? 1
  );
  const activeRoomCeilingVisible = activeRoom?.ceilingVisible ?? true;
  const activeRoomCeilingColor =
    activeRoomCeilingSettings.paintColorHex ??
    activeRoomSurfaces?.ceilingColor ??
    "#f8f8f6";
  const activeRoomCategoryCounts = useMemo(
    () => countRoomCategories(activeRoom, catalogItems),
    [activeRoom, catalogItems]
  );
  const activeRoomProductQuantities = useMemo(
    () => countRoomProductQuantities(activeRoom),
    [activeRoom]
  );
  const activeRoomVariantQuantities = useMemo(
    () => countRoomVariantQuantities(activeRoom, catalogItems),
    [activeRoom, catalogItems]
  );
  const activeRoomShoppingItems = useMemo(
    () => resolveRoomShoppingItems(activeRoom, catalogItems),
    [activeRoom, catalogItems]
  );
  const wholeHomeShoppingSummary = useMemo(
    () => summarizeWholeHomeShopping(roomShoppingSummaries),
    [roomShoppingSummaries]
  );
  const activeSceneItemsForGuides = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        position: [
          item.position[0] + activeRoomPlanOffset.x,
          item.position[1] ?? 0,
          item.position[2] + activeRoomPlanOffset.z,
        ] as [number, number, number],
      })),
    [activeRoomPlanOffset.x, activeRoomPlanOffset.z, items]
  );

  return {
    state: {
      activeRoomHealthSummary,
      surfaceInspectorContext,
      surfaceInspectorUiActions,
    },
    derived: {
      roomItemCountsById,
      roomShoppingSummaries,
      activeRoomShoppingSummary,
      activeRoomSurfaces,
      activeRoomFloorMaterialId,
      activeRoomFloorRotationDeg,
      activeRoomFloorScale,
      activeRoomFloorSettings,
      activeRoomCeilingSettings,
      activeSelectedWallFaceId,
      activeSelectedWallPanelId,
      activeRoomWallSettings,
      activeRoomSelectedWallSettings,
      surfaceRoomSummaries,
      floorInspectorRoom,
      wallInspectorFaceId,
      wallInspectorDefaultHeight,
      wallInspectorHeight,
      surfaceInspectorIsWall,
      surfaceInspectorIsCeiling,
      surfaceInspectorDisplayName,
      activeRoomHeightMm,
      activeRoomWallHeightEvidence,
      canEditActiveRoomWallHeight,
      activeRoomSlabThicknessEvidence,
      canEditActiveRoomSlabThickness,
      activeRoomWallThicknessMm,
      activeRoomSlabThicknessMm,
      activeRoomBaseboardDepthMm,
      activeRoomWallOpacity,
      activeRoomFloorOpacity,
      activeRoomCeilingOpacity,
      activeRoomCeilingVisible,
      activeRoomCeilingColor,
      activeRoomCategoryCounts,
      activeRoomProductQuantities,
      activeRoomVariantQuantities,
      activeRoomShoppingItems,
      wholeHomeShoppingSummary,
      activeSceneItemsForGuides,
    },
    actions: { reviewActiveRoomHealth },
  };
}
