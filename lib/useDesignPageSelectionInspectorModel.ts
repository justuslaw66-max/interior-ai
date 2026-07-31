import { useMemo } from "react";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import {
  buildDesignSelectionContext,
  type DesignSelectionContext,
} from "@/lib/design-page-selection-context";
import { getItemPrice, normalizeRotationDegrees } from "@/lib/design-page-utils";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { getPlanOpeningWallSpanMeters } from "@/lib/design-page-plan-overlays";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { getWallFaceLabel } from "@/lib/surface-settings";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import {
  radiansToDeg,
  type EditorAnnotation2D,
  type FixedElement2D,
  type RoomOpening2D,
} from "@/lib/editorScene";
import type { DesignItem } from "@/lib/room-types";
import { resolveFixturePhotometrics } from "@/lib/resolve-lighting-scene";

export type DesignPageSelectionInspectorSummary = {
  kind: string;
  title: string;
  detail: string;
  metrics: string[];
};

export type DesignPageSelectionInspectorSurfaceState = {
  displayName: string;
  isCeiling: boolean;
  isWall: boolean;
  wallDefaultHeight: number;
  wallFaceId: string | null;
  wallHeight: number;
};

export type DesignPageSelectionInspectorModelState = {
  activeRoomName: string | null;
  editorMode: DesignPageEditorMode;
  isClientPreview: boolean;
  items: DesignItem[];
  planAnnotations: EditorAnnotation2D[];
  planFixedElements: FixedElement2D[];
  planOpenings: RoomOpening2D[];
  selectedIds: ReadonlySet<string>;
  selectedItem: DesignItem | null;
  selectedItemPlanningDimensionsMm: DimensionsMm | null;
  selectedPlanOverlayId: string | null;
  selectedPlanRoom: HousePlanRoom2D | null;
  selectedProduct: CatalogItemSchema | null;
  surfaceInspector: DesignPageSelectionInspectorSurfaceState;
};

export type DesignPageSelectionInspectorModelConfiguration = {
  houseRoomById: ReadonlyMap<string, HousePlanRoom2D>;
  housePlanRooms: HousePlanRoom2D[];
  planDepthMeters: number;
  planMeasurementUnit: PlanMeasurementUnit;
  planWidthMeters: number;
  roomHeightMeters: number;
};

export type UseDesignPageSelectionInspectorModelParams = {
  state: DesignPageSelectionInspectorModelState;
  configuration: DesignPageSelectionInspectorModelConfiguration;
};

export type DesignPageSelectionInspectorModel = {
  state: {
    floatingSelectionInspectorVisible: boolean;
    selectedObjectContext: DesignSelectionContext | null;
    selectedObjectInspector: DesignPageSelectionInspectorSummary | null;
    selectedPlanAnnotation: EditorAnnotation2D | null;
    selectedPlanFixedElement: FixedElement2D | null;
    visiblePlanOpening: RoomOpening2D | null;
    visiblePlanOpeningMaxHeightMeters: number;
    visiblePlanOpeningRoomName: string;
    visiblePlanOpeningWallSpanMeters: number;
  };
};

export type BuildDesignPageSelectionInspectorSummaryParams = {
  activeRoomName: string | null;
  items: DesignItem[];
  planMeasurementUnit: PlanMeasurementUnit;
  selectedIds: ReadonlySet<string>;
  selectedItem: DesignItem | null;
  selectedItemPlanningDimensionsMm: DimensionsMm | null;
  selectedPlanAnnotation: EditorAnnotation2D | null;
  selectedPlanFixedElement: FixedElement2D | null;
  selectedPlanRoom: HousePlanRoom2D | null;
  selectedProduct: CatalogItemSchema | null;
  surfaceInspector: DesignPageSelectionInspectorSurfaceState;
  visiblePlanOpening: RoomOpening2D | null;
  visiblePlanOpeningRoomName: string;
};

export function buildDesignPageSelectionInspectorSummary({
  activeRoomName,
  items,
  planMeasurementUnit,
  selectedIds,
  selectedItem,
  selectedItemPlanningDimensionsMm,
  selectedPlanAnnotation,
  selectedPlanFixedElement,
  selectedPlanRoom,
  selectedProduct,
  surfaceInspector,
  visiblePlanOpening,
  visiblePlanOpeningRoomName,
}: BuildDesignPageSelectionInspectorSummaryParams): DesignPageSelectionInspectorSummary | null {
  if (selectedIds.size > 1) {
    const selectionItems = items.filter((item) => selectedIds.has(item.instanceId));
    return {
      kind: "Furniture selection",
      title: `${selectionItems.length} items selected`,
      detail: activeRoomName ?? "Current room",
      metrics: [
        `${selectionItems.filter((item) => item.locked).length} locked`,
        `${selectionItems.reduce((sum, item) => sum + (item.qty ?? 1), 0)} total qty`,
      ],
    };
  }

  if (selectedItem && selectedProduct) {
    const dims =
      selectedItemPlanningDimensionsMm ??
      resolveCatalogVariant(selectedProduct, selectedItem.variantId).dimsMm;
    const fixture = resolveFixturePhotometrics(selectedItem, selectedProduct);
    if (fixture) {
      return {
        kind: "Light fixture",
        title: selectedProduct.title,
        detail: activeRoomName ?? "Current room",
        metrics: [
          `${fixture.luminousFluxLumens} lm`,
          `${selectedItem.fixtureLight?.cctKelvin ?? fixture.cctKelvin}K`,
          fixture.verification === "estimated"
            ? "Estimated output"
            : fixture.verification === "manufacturer"
              ? "Manufacturer data"
              : "Photometric data",
        ],
      };
    }
    return {
      kind: "Furniture",
      title: selectedProduct.title,
      detail: activeRoomName ?? "Current room",
      metrics: [
        `${formatCabinetMeasurement(dims.w, planMeasurementUnit)} x ${formatCabinetMeasurement(dims.d, planMeasurementUnit)}`,
        `${normalizeRotationDegrees(radiansToDeg(selectedItem.rotationY ?? 0))}°`,
        `$${getItemPrice(selectedProduct)}`,
      ],
    };
  }

  if (visiblePlanOpening) {
    const kindLabel = visiblePlanOpening.kind === "door" ? "Door" : "Window";
    return {
      kind: kindLabel,
      title: `${kindLabel} on ${visiblePlanOpening.wall}`,
      detail: visiblePlanOpeningRoomName,
      metrics: [
        `${formatCabinetMeasurement(visiblePlanOpening.widthMm, planMeasurementUnit)} wide`,
        `${formatCabinetMeasurement(visiblePlanOpening.offsetMm, planMeasurementUnit)} from center`,
      ],
    };
  }

  if (selectedPlanFixedElement) {
    return {
      kind: "Built-in",
      title: selectedPlanFixedElement.label ?? selectedPlanFixedElement.kind,
      detail: "Plan fixture",
      metrics: [
        `${formatCabinetMeasurement(selectedPlanFixedElement.widthMm, planMeasurementUnit)} x ${formatCabinetMeasurement(selectedPlanFixedElement.depthMm, planMeasurementUnit)}`,
        `${selectedPlanFixedElement.rotationDeg ?? 0}°`,
      ],
    };
  }

  if (selectedPlanAnnotation) {
    return {
      kind: "Annotation",
      title: selectedPlanAnnotation.text || "Note",
      detail: selectedPlanAnnotation.kind,
      metrics: [
        `${formatCabinetMeasurement(selectedPlanAnnotation.xMm, planMeasurementUnit)} x ${formatCabinetMeasurement(selectedPlanAnnotation.zMm, planMeasurementUnit)}`,
      ],
    };
  }

  if (selectedPlanRoom && surfaceInspector.isWall && surfaceInspector.wallFaceId) {
    return {
      kind: "Wall",
      title: `${getWallFaceLabel(surfaceInspector.wallFaceId)} wall`,
      detail: `${selectedPlanRoom.name} · ${surfaceInspector.displayName}`,
      metrics: [
        `${formatCabinetMeasurement(surfaceInspector.wallHeight * 1000, planMeasurementUnit)} high`,
      ],
    };
  }

  if (selectedPlanRoom && surfaceInspector.isCeiling) {
    return {
      kind: "Ceiling",
      title: `${selectedPlanRoom.name} ceiling`,
      detail: surfaceInspector.displayName,
      metrics: [
        `${formatCabinetMeasurement(surfaceInspector.wallDefaultHeight * 1000, planMeasurementUnit)} high`,
      ],
    };
  }

  if (selectedPlanRoom) {
    const roomArea = selectedPlanRoom.w * selectedPlanRoom.d;
    return {
      kind: "Room",
      title: selectedPlanRoom.name,
      detail: `${selectedPlanRoom.roomType} room · ${roomArea.toFixed(1)} sqm`,
      metrics: [],
    };
  }

  return null;
}

export type DesignPageSelectionInspectorVisibilityParams = {
  editorMode: DesignPageEditorMode;
  hasInspectorSummary: boolean;
  hasSelectedProduct: boolean;
  isClientPreview: boolean;
};

export function isDesignPageSelectionInspectorVisible({
  editorMode,
  hasInspectorSummary,
  hasSelectedProduct,
  isClientPreview,
}: DesignPageSelectionInspectorVisibilityParams): boolean {
  return (
    !isClientPreview &&
    hasInspectorSummary &&
    !(editorMode === "adjust" && hasSelectedProduct)
  );
}

export function useDesignPageSelectionInspectorModel({
  state,
  configuration,
}: UseDesignPageSelectionInspectorModelParams): DesignPageSelectionInspectorModel {
  const {
    activeRoomName,
    editorMode,
    isClientPreview,
    items,
    planAnnotations,
    planFixedElements,
    planOpenings,
    selectedIds,
    selectedItem,
    selectedItemPlanningDimensionsMm,
    selectedPlanOverlayId,
    selectedPlanRoom,
    selectedProduct,
    surfaceInspector,
  } = state;
  const {
    displayName: surfaceInspectorDisplayName,
    isCeiling: surfaceInspectorIsCeiling,
    isWall: surfaceInspectorIsWall,
    wallDefaultHeight: wallInspectorDefaultHeight,
    wallFaceId: wallInspectorFaceId,
    wallHeight: wallInspectorHeight,
  } = surfaceInspector;
  const {
    houseRoomById,
    housePlanRooms,
    planDepthMeters,
    planMeasurementUnit,
    planWidthMeters,
    roomHeightMeters,
  } = configuration;

  const visiblePlanOpening = useMemo(
    () =>
      selectedPlanOverlayId
        ? planOpenings.find((opening) => opening.id === selectedPlanOverlayId) ?? null
        : null,
    [planOpenings, selectedPlanOverlayId]
  );
  const selectedPlanFixedElement = useMemo(
    () =>
      selectedPlanOverlayId
        ? planFixedElements.find((entry) => entry.id === selectedPlanOverlayId) ?? null
        : null,
    [planFixedElements, selectedPlanOverlayId]
  );
  const selectedPlanAnnotation = useMemo(
    () =>
      selectedPlanOverlayId
        ? planAnnotations.find((entry) => entry.id === selectedPlanOverlayId) ?? null
        : null,
    [planAnnotations, selectedPlanOverlayId]
  );
  const visiblePlanOpeningRoomName = useMemo(
    () =>
      visiblePlanOpening?.roomId
        ? houseRoomById.get(visiblePlanOpening.roomId)?.name ?? "Room"
        : "Whole plan",
    [houseRoomById, visiblePlanOpening]
  );
  const visiblePlanOpeningWallSpanMeters = useMemo(
    () =>
      visiblePlanOpening
        ? getPlanOpeningWallSpanMeters(visiblePlanOpening, {
            rooms: housePlanRooms,
            planWidthMeters,
            planDepthMeters,
          })
        : 0,
    [housePlanRooms, planDepthMeters, planWidthMeters, visiblePlanOpening]
  );
  const visiblePlanOpeningMaxHeightMeters = Math.max(0.5, roomHeightMeters);

  const selectedObjectInspector = useMemo(
    () =>
      buildDesignPageSelectionInspectorSummary({
        activeRoomName,
        items,
        planMeasurementUnit,
        selectedIds,
        selectedItem,
        selectedItemPlanningDimensionsMm,
        selectedPlanAnnotation,
        selectedPlanFixedElement,
        selectedPlanRoom,
        selectedProduct,
        surfaceInspector: {
          displayName: surfaceInspectorDisplayName,
          isCeiling: surfaceInspectorIsCeiling,
          isWall: surfaceInspectorIsWall,
          wallDefaultHeight: wallInspectorDefaultHeight,
          wallFaceId: wallInspectorFaceId,
          wallHeight: wallInspectorHeight,
        },
        visiblePlanOpening,
        visiblePlanOpeningRoomName,
      }),
    [
      activeRoomName,
      items,
      planMeasurementUnit,
      selectedIds,
      selectedItem,
      selectedItemPlanningDimensionsMm,
      selectedPlanAnnotation,
      selectedPlanFixedElement,
      selectedPlanRoom,
      selectedProduct,
      surfaceInspectorDisplayName,
      surfaceInspectorIsCeiling,
      surfaceInspectorIsWall,
      visiblePlanOpening,
      visiblePlanOpeningRoomName,
      wallInspectorDefaultHeight,
      wallInspectorFaceId,
      wallInspectorHeight,
    ]
  );

  const floatingSelectionInspectorVisible = isDesignPageSelectionInspectorVisible({
    editorMode,
    hasInspectorSummary: Boolean(selectedObjectInspector),
    hasSelectedProduct: Boolean(selectedProduct),
    isClientPreview,
  });
  const selectedObjectContext = useMemo(
    () =>
      buildDesignSelectionContext({
        selectedFurniture:
          selectedItem && selectedProduct
            ? { title: selectedProduct.title, category: selectedProduct.category }
            : null,
        activeRoomName: activeRoomName ?? "Room",
        visiblePlanOpening,
        visiblePlanOpeningRoomName,
        selectedPlanRoom,
      }),
    [
      activeRoomName,
      selectedItem,
      selectedPlanRoom,
      selectedProduct,
      visiblePlanOpening,
      visiblePlanOpeningRoomName,
    ]
  );

  return {
    state: {
      floatingSelectionInspectorVisible,
      selectedObjectContext,
      selectedObjectInspector,
      selectedPlanAnnotation,
      selectedPlanFixedElement,
      visiblePlanOpening,
      visiblePlanOpeningMaxHeightMeters,
      visiblePlanOpeningRoomName,
      visiblePlanOpeningWallSpanMeters,
    },
  };
}
