import type {
  DesignPageSceneRegionReferences,
  DesignPageSceneRegionState,
} from "@/components/editor/design-page/DesignPageSceneRegion";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import {
  resolveDesignPageViewportSelectionControlsState,
  type DesignPageViewportSelectionControlsInput,
} from "@/lib/design-page-viewport-selection-controls";
import {
  buildDesignPageViewportRegionModel,
  type DesignPageViewportRegionModel,
} from "@/lib/design-page-viewport-region-model";

type ViewportState = DesignPageSceneRegionState["viewport"];
type ViewportReferences = DesignPageSceneRegionReferences["viewport"];
type ViewportActions = DesignPageViewportRegionModel["actions"];
type CommitRoomDimensionMm =
  ViewportActions["selectionInspector"]["commitRoomDimensionMm"];
type AddFloor = NonNullable<
  ViewportActions["floorProperties"]["onAddUpperFloor"]
>;
type RotateQuarterTurn =
  ViewportActions["selectionControls"]["selectedZone"]["rotateQuarterTurn"];

export type BuildDesignPageViewportRegionAdapterInput = {
  state: {
    visibility: {
      rail: boolean;
      sceneLoading: boolean;
      selectionInspector: boolean;
      planQuality: boolean;
      floorProperties: boolean;
      isClientPreview: boolean;
    };
    opening: {
      selectedId: string | null;
      value: {
        kind: NonNullable<ViewportState["selectedOpening"]>["kind"];
        wall: NonNullable<ViewportState["selectedOpening"]>["wall"];
        widthMm: number;
      } | null;
    };
    selectionInspector: {
      summary: NonNullable<ViewportState["selectionInspector"]>["summary"] | null;
      selectedRoom: NonNullable<ViewportState["selectionInspector"]>["selectedRoom"];
      hasSelectedItem: boolean;
      hasVisiblePlanOpening: boolean;
      hasSelectedPlanFixedElement: boolean;
      hasSelectedPlanAnnotation: boolean;
      surfaceInspectorIsWall: boolean;
      surfaceInspectorIsCeiling: boolean;
      surfaceInspector: NonNullable<ViewportState["selectionInspector"]>["surfaceInspector"];
      measurementUnit: NonNullable<ViewportState["selectionInspector"]>["measurementUnit"];
      activeRoomHeightMm: number;
      activeFloorRoomCount: number;
      designRoomCount: number;
    };
    planQuality: {
      report: NonNullable<ViewportState["planQuality"]>["report"];
      collapsed: boolean;
    };
    planCanvas: ViewportState["planCanvas"];
    aiLayoutPreview: {
      proposal: {
        items: unknown[];
        itemNames: string[];
      } | null;
      toneText: string;
    };
    crossRoomDragTarget: {
      kind: string;
      valid: boolean;
      label: string;
    } | null;
    navigator: {
      enabled: boolean;
      rooms: NonNullable<ViewportState["navigator"]>["rooms"];
      activeRoomId: NonNullable<ViewportState["navigator"]>["activeRoomId"];
      cameraPosition: NonNullable<ViewportState["navigator"]>["cameraPosition"];
      cameraTarget: NonNullable<ViewportState["navigator"]>["cameraTarget"];
      itemCountsByRoomId: NonNullable<ViewportState["navigator"]>["itemCountsByRoomId"];
      targetRoomId: NonNullable<ViewportState["navigator"]>["targetRoomId"];
      targetRoomValid: NonNullable<ViewportState["navigator"]>["targetRoomValid"];
    };
    floorProperties: Omit<
      NonNullable<ViewportState["floorProperties"]>,
      "canRedo"
    > & { canRedo: boolean };
    selectionControls: DesignPageViewportSelectionControlsInput;
  };
  configuration: {
    dark: boolean;
    sceneBackgroundColor: string;
    canEditPlanGeometry: boolean;
    selectionInspectorDockedWithRightRail: boolean;
    floatingOverlayStackWidthPx: number;
    selectionInspectorRightPx: number;
    selectionInspectorTopPx: number;
    selectionInspectorWidthPx: number;
    planQualityReviewTopPx: number;
    editorMode: "design" | "adjust" | "ai" | "buy" | "present";
  };
  references: ViewportReferences;
  actions: {
    deletePlanOverlay: (overlayId: string | null) => void;
    showToast: (message: string) => void;
    selectionInspector: Omit<
      ViewportActions["selectionInspector"],
      "commitRoomDimensionMm" | "deleteSelectedPlanOverlay"
    > & {
      commitRoomDimensionMeters: (
        roomId: Parameters<CommitRoomDimensionMm>[0],
        dimension: Parameters<CommitRoomDimensionMm>[1],
        valueMeters: number
      ) => void;
    };
    planQuality: ViewportActions["planQuality"];
    planCanvas: ViewportActions["planCanvas"];
    aiLayoutPreview: ViewportActions["aiLayoutPreview"];
    navigator: ViewportActions["navigator"];
    floorProperties: Omit<
      ViewportActions["floorProperties"],
      "onAddUpperFloor" | "onAddLowerFloor"
    > & {
      addFloor: (direction: "upper" | "lower", mode: Parameters<AddFloor>[0]) => void;
    };
    selectionControls: Omit<
      ViewportActions["selectionControls"],
      "selectedZone"
    > & {
      selectedZone: Omit<
        ViewportActions["selectionControls"]["selectedZone"],
        "rotateQuarterTurn"
      > & {
        rotateZone: (
          zoneId: Parameters<RotateQuarterTurn>[0],
          radians: number
        ) => void;
      };
    };
  };
};

export function buildDesignPageViewportRegionAdapter({
  state,
  configuration,
  references,
  actions,
}: BuildDesignPageViewportRegionAdapterInput): DesignPageViewportRegionModel {
  const selectedOverlayId = state.opening.selectedId;
  const selectionSummary = state.selectionInspector.summary;

  return buildDesignPageViewportRegionModel({
    state: {
      railVisible: state.visibility.rail,
      sceneLoadingVisible: state.visibility.sceneLoading,
      selectedOpening:
        !state.visibility.isClientPreview &&
        state.opening.value &&
        selectedOverlayId
          ? {
              kind: state.opening.value.kind,
              wall: state.opening.value.wall,
              widthLabel: formatCabinetMeasurement(
                state.opening.value.widthMm,
                state.selectionInspector.measurementUnit
              ),
            }
          : null,
      selectionInspector:
        state.visibility.selectionInspector && selectionSummary
          ? {
              summary: selectionSummary,
              selectedRoom: state.selectionInspector.selectedRoom,
              hasSelectedItem: state.selectionInspector.hasSelectedItem,
              hasVisiblePlanOpening:
                state.selectionInspector.hasVisiblePlanOpening,
              hasSelectedPlanFixedElement:
                state.selectionInspector.hasSelectedPlanFixedElement,
              hasSelectedPlanAnnotation:
                state.selectionInspector.hasSelectedPlanAnnotation,
              hasSelectedPlanOverlay: Boolean(selectedOverlayId),
              surfaceInspectorIsWall:
                state.selectionInspector.surfaceInspectorIsWall,
              surfaceInspectorIsCeiling:
                state.selectionInspector.surfaceInspectorIsCeiling,
              surfaceInspector: state.selectionInspector.surfaceInspector,
              measurementUnit: state.selectionInspector.measurementUnit,
              activeRoomHeightMm:
                state.selectionInspector.activeRoomHeightMm,
              activeFloorRoomCount:
                state.selectionInspector.activeFloorRoomCount,
              canDeleteSelectedRoom:
                state.selectionInspector.designRoomCount > 1,
            }
          : null,
      planQuality: state.visibility.planQuality
        ? {
            report: state.planQuality.report,
            collapsed: state.planQuality.collapsed,
          }
        : null,
      planCanvas: state.planCanvas,
      aiLayoutPreview:
        state.aiLayoutPreview.proposal && !state.visibility.isClientPreview
          ? {
              itemCount: state.aiLayoutPreview.proposal.items.length,
              itemNames: state.aiLayoutPreview.proposal.itemNames,
              toneText: state.aiLayoutPreview.toneText,
            }
          : null,
      crossRoomDragTarget:
        state.crossRoomDragTarget?.kind === "item"
          ? {
              valid: state.crossRoomDragTarget.valid,
              label: state.crossRoomDragTarget.label,
            }
          : null,
      navigator: state.navigator.enabled
        ? {
            rooms: state.navigator.rooms,
            activeRoomId: state.navigator.activeRoomId,
            cameraPosition: state.navigator.cameraPosition,
            cameraTarget: state.navigator.cameraTarget,
            itemCountsByRoomId: state.navigator.itemCountsByRoomId,
            targetRoomId: state.navigator.targetRoomId,
            targetRoomValid: state.navigator.targetRoomValid,
          }
        : null,
      floorProperties: state.visibility.floorProperties
        ? state.floorProperties
        : null,
      selectionControls: resolveDesignPageViewportSelectionControlsState(
        state.selectionControls
      ),
    },
    configuration: {
      sceneLoading: {
        dark: configuration.dark,
        backgroundColor: configuration.sceneBackgroundColor,
      },
      selectedOpening: { dark: configuration.dark },
      selectionInspector: {
        dark: configuration.dark,
        canEditPlanGeometry: configuration.canEditPlanGeometry,
        dockWhenPortalAvailable:
          configuration.selectionInspectorDockedWithRightRail,
        dockedWidthPx: configuration.floatingOverlayStackWidthPx,
        floatingRightPx: configuration.selectionInspectorRightPx,
        floatingTopPx: configuration.selectionInspectorTopPx,
        floatingWidthPx: configuration.selectionInspectorWidthPx,
      },
      planQuality: {
        dark: configuration.dark,
        dockedWidthPx: configuration.floatingOverlayStackWidthPx,
        floatingRightPx: configuration.selectionInspectorRightPx,
        floatingTopPx: configuration.planQualityReviewTopPx,
        floatingWidthPx: configuration.selectionInspectorWidthPx,
      },
      aiLayoutPreview: { dark: configuration.dark },
      navigator: {
        disabled: configuration.editorMode === "present",
        dark: configuration.dark,
      },
      floorProperties: {
        dark: configuration.dark,
        canEdit: configuration.canEditPlanGeometry,
      },
      selectionControls: { dark: configuration.dark },
    },
    references,
    actions: {
      selectedOpening: {
        deleteOpening: () => {
          actions.deletePlanOverlay(selectedOverlayId);
          actions.showToast("Opening deleted");
        },
      },
      selectionInspector: {
        ...actions.selectionInspector,
        commitRoomDimensionMm: (roomId, dimension, valueMm) =>
          actions.selectionInspector.commitRoomDimensionMeters(
            roomId,
            dimension,
            valueMm / 1000
          ),
        deleteSelectedPlanOverlay: () =>
          actions.deletePlanOverlay(selectedOverlayId),
      },
      planQuality: actions.planQuality,
      planCanvas: actions.planCanvas,
      aiLayoutPreview: actions.aiLayoutPreview,
      navigator: actions.navigator,
      floorProperties: {
        ...actions.floorProperties,
        onAddUpperFloor: (mode) =>
          actions.floorProperties.addFloor("upper", mode),
        onAddLowerFloor: (mode) =>
          actions.floorProperties.addFloor("lower", mode),
      },
      selectionControls: {
        ...actions.selectionControls,
        selectedZone: {
          ...actions.selectionControls.selectedZone,
          rotateQuarterTurn: (zoneId) =>
            actions.selectionControls.selectedZone.rotateZone(
              zoneId,
              Math.PI / 2
            ),
        },
      },
    },
  });
}
