import { PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX } from "@/lib/design-page-editor-configuration";
import type { BuildDesignPageViewportRegionAdapterInput } from "@/lib/design-page-viewport-region-adapter";
import { resolveDesignLightingSettings } from "@/lib/design-lighting-settings";
import { LIGHTING_PRESETS } from "@/lib/lightingPresets";
import { resolveFixturePhotometrics } from "@/lib/resolve-lighting-scene";
import type { DesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";

type ViewportState = BuildDesignPageViewportRegionAdapterInput["state"];
type ViewportConfiguration =
  BuildDesignPageViewportRegionAdapterInput["configuration"];

export type DesignPageViewportWorkspaceReadModel = {
  state: ViewportState;
  configuration: ViewportConfiguration;
};

type PresentationBoundaries =
  DesignPagePresentationWorkspaceRegistration["boundaries"];
type AiWorkspace = PresentationBoundaries["aiWorkspace"];
type SelectionWorkspace = PresentationBoundaries["selection"];
type CoreShell = AiWorkspace["boundaries"]["coreShell"];
type DocumentSelection = AiWorkspace["boundaries"]["documentSelection"];
type PlanAuthoring = AiWorkspace["boundaries"]["planAuthoring"];
type EditorInteraction = AiWorkspace["boundaries"]["editorInteraction"];

export type BuildDesignPageViewportWorkspaceReadModelInput = {
  sources: {
    base: Pick<CoreShell["boundaries"]["base"], "state">;
    coreShell: Pick<CoreShell, "state" | "derived">;
    documentRoom: Pick<
      DocumentSelection["boundaries"]["documentRoom"],
      "state" | "derived"
    >;
    documentSelection: Pick<DocumentSelection, "state">;
    importedWallEditing: Pick<
      PlanAuthoring["boundaries"]["importedWallEditing"],
      "state"
    >;
    itemSelection: Pick<
      DocumentSelection["boundaries"]["itemSelection"],
      "state"
    >;
    placement: Pick<
      SelectionWorkspace["boundaries"]["placement"],
      "state" | "derived"
    >;
    planWorkspace: Pick<
      PlanAuthoring["boundaries"]["planWorkspace"],
      "state" | "derived"
    >;
    sceneRoomRead: Pick<
      DocumentSelection["boundaries"]["sceneRoomRead"],
      "state" | "derived"
    >;
    selection: Pick<SelectionWorkspace, "derived">;
    selectionInspection: Pick<
      PlanAuthoring["boundaries"]["selectionInspection"],
      "derived"
    >;
    viewportShell: Pick<CoreShell["boundaries"]["viewportShell"], "state">;
    zone: Pick<EditorInteraction["boundaries"]["zone"], "state">;
  };
};

type ViewportReadModelSources =
  BuildDesignPageViewportWorkspaceReadModelInput["sources"];

function resolveSelectedFixtureLight({
  coreShell,
  itemSelection,
  selectionInspection,
}: ViewportReadModelSources): ViewportState["selectionInspector"]["selectedFixtureLight"] {
  const selectedItem = itemSelection.state.selectedItem;
  if (!coreShell.derived.access.isDesigner || !selectedItem) return null;

  const photometrics = resolveFixturePhotometrics(
    selectedItem,
    selectionInspection.derived.selectedProduct
  );
  if (!photometrics) return null;

  const lightingSettings = resolveDesignLightingSettings(
    coreShell.state.document.designSnapshot
  );
  return {
    isOn:
      selectedItem.fixtureLight?.isOn ??
      LIGHTING_PRESETS[lightingSettings.preset].fixtureDefaultOn,
    dimmer: selectedItem.fixtureLight?.dimmer ?? 1,
    cctKelvin:
      selectedItem.fixtureLight?.cctKelvin ?? photometrics.cctKelvin,
    beamAngleDeg:
      selectedItem.fixtureLight?.beamAngleDeg ?? photometrics.beamAngleDeg,
    beamAdjustable: photometrics.emitterType === "spot",
    luminousFluxLumens: photometrics.luminousFluxLumens,
    dimmable: photometrics.dimmable,
    verification: photometrics.verification,
  };
}

function buildSelectionInspectorState(
  sources: ViewportReadModelSources
): Pick<ViewportState, "selectionInspector"> {
  const { coreShell, documentRoom, itemSelection, planWorkspace } = sources;
  const inspector = planWorkspace.state.inspector;
  const roomRead = sources.sceneRoomRead.derived.room;

  return {
    selectionInspector: {
      summary: inspector.selectedObjectInspector,
      selectedRoom: sources.sceneRoomRead.derived.scene.selectedPlanRoomContext,
      hasSelectedItem: Boolean(itemSelection.state.selectedItem),
      hasVisiblePlanOpening: Boolean(inspector.visiblePlanOpening),
      hasSelectedPlanFixedElement: Boolean(inspector.selectedPlanFixedElement),
      hasSelectedPlanAnnotation: Boolean(inspector.selectedPlanAnnotation),
      surfaceInspectorIsWall: roomRead.surfaceInspectorIsWall,
      surfaceInspectorIsCeiling: roomRead.surfaceInspectorIsCeiling,
      surfaceInspector: sources.placement.state.surfaceInspector,
      measurementUnit: sources.viewportShell.state.plan.planMeasurementUnit,
      activeRoomHeightMm: roomRead.activeRoomHeightMm,
      activeRoomWallHeightEvidence: roomRead.activeRoomWallHeightEvidence,
      canEditActiveRoomWallHeight: roomRead.canEditActiveRoomWallHeight,
      activeFloorRoomCount:
        documentRoom.derived.floor.activeFloorRoomCount,
      designRoomCount: coreShell.state.document.designSnapshot.rooms.length,
      selectedFixtureLight: resolveSelectedFixtureLight(sources),
    },
  };
}

function buildViewportPanelState(
  sources: ViewportReadModelSources
): Pick<
  ViewportState,
  "visibility" | "opening" | "planQuality" | "planCanvas" | "importedWallEditor"
> {
  const { coreShell, importedWallEditing, planWorkspace, sceneRoomRead } =
    sources;
  const inspector = planWorkspace.state.inspector;
  const quality = planWorkspace.state.quality;

  return {
    visibility: {
      rail:
        planWorkspace.derived.floatingPlanOverlayStackVisible ||
        importedWallEditing.state.available,
      sceneLoading: sceneRoomRead.state.scene.showSceneLoadingVeil,
      selectionInspector: inspector.floatingSelectionInspectorVisible,
      planQuality: quality.reviewPanelVisible,
      floorProperties: planWorkspace.derived.floatingFloorPropertiesPanelVisible,
      isClientPreview: coreShell.derived.access.isClientPreview,
    },
    opening: {
      selectedId: sources.viewportShell.state.planSelection.selectedPlanOverlayId,
      value: inspector.visiblePlanOpening
        ? {
            kind: inspector.visiblePlanOpening.kind,
            wall: inspector.visiblePlanOpening.wall,
            widthMm: inspector.visiblePlanOpening.widthMm,
            wallSpanMeters: inspector.visiblePlanOpeningWallSpanMeters,
          }
        : null,
    },
    planQuality: {
      report: quality.report,
      collapsed: quality.reviewPanelCollapsed,
    },
    planCanvas: planWorkspace.derived.planCanvasOverlaysState,
    importedWallEditor: importedWallEditing.state.available
      ? importedWallEditing.state
      : null,
  };
}

function buildViewportNavigationState(
  sources: ViewportReadModelSources
): Pick<
  ViewportState,
  "planSummary" | "aiLayoutPreview" | "crossRoomDragTarget" | "navigator"
> {
  const { base, coreShell, documentRoom, sceneRoomRead } =
    sources;
  const planRooms = documentRoom.derived.plan.housePlan2D.rooms;
  const scene = sceneRoomRead.derived.scene;

  return {
    planSummary:
      base.state.editor.viewMode === "2d" && planRooms.length > 0
        ? {
            rooms: planRooms,
            selectedRoomIds:
              sources.viewportShell.state.planSelection.selectedPlanRoomIds,
          }
        : null,
    aiLayoutPreview: {
      proposal: coreShell.state.placement.pendingAiLayoutProposal,
      toneText: scene.aiLayoutPreviewTone.text,
    },
    crossRoomDragTarget: coreShell.state.placement.crossRoomDragTarget,
    navigator: {
      enabled: base.state.editor.viewMode === "3d" && scene.hasWholeHousePlan,
      rooms: planRooms,
      activeRoomId: coreShell.state.document.designSnapshot.activeRoomId,
      cameraPosition: sources.viewportShell.state.camera.cameraView.pos,
      cameraTarget: sources.viewportShell.state.camera.cameraView.target,
      itemCountsByRoomId: sceneRoomRead.derived.room.roomItemCountsById,
      targetRoomId: sources.placement.derived.placementTargetRoomId,
      targetRoomValid: sources.selection.derived.placement.activeTargetValid,
    },
  };
}

function buildViewportPlanControlState(
  sources: ViewportReadModelSources
): Pick<ViewportState, "floorProperties" | "selectionControls"> {
  const { base, coreShell, documentRoom, itemSelection, viewportShell, zone } =
    sources;
  const floor = documentRoom.derived.floor;
  const floorState = documentRoom.state.floor;
  const room = documentRoom.derived.room;
  const roomRead = sources.sceneRoomRead.derived.room;

  return {
    floorProperties: {
      roomWidth: room.roomWidth,
      roomDepth: room.roomDepth,
      floorOptions: floor.floorOptions,
      hiddenFloorLevels: floorState.hiddenFloorLevels,
      activeFloorLevel: floor.activeFloorLevel,
      activeFloorRoomCount: floor.activeFloorRoomCount,
      measurementUnit: viewportShell.state.plan.planMeasurementUnit,
      activeRoomHeightMm: roomRead.activeRoomHeightMm,
      activeRoomWallHeightEvidence: roomRead.activeRoomWallHeightEvidence,
      canEditActiveRoomWallHeight: roomRead.canEditActiveRoomWallHeight,
      activeRoomWallThicknessMm: roomRead.activeRoomWallThicknessMm,
      activeRoomSlabThicknessMm: roomRead.activeRoomSlabThicknessMm,
      activeRoomSlabThicknessEvidence: roomRead.activeRoomSlabThicknessEvidence,
      canEditActiveRoomSlabThickness: roomRead.canEditActiveRoomSlabThickness,
      activeRoomBaseboardDepthMm: roomRead.activeRoomBaseboardDepthMm,
      activeRoomWallOpacity: roomRead.activeRoomWallOpacity,
      activeRoomFloorOpacity: roomRead.activeRoomFloorOpacity,
      activeRoomCeilingOpacity: roomRead.activeRoomCeilingOpacity,
      activeRoomCeilingVisible: roomRead.activeRoomCeilingVisible,
      activeRoomCeilingColor: roomRead.activeRoomCeilingColor,
      stackedFloorView: floorState.stackedFloorView,
      canRedo: sources.documentSelection.state.history.canRedo,
    },
    selectionControls: {
      viewMode: base.state.editor.viewMode,
      stackedFloorView: floorState.stackedFloorView,
      floorOptions: floor.floorOptions,
      activeFloorLevel: floor.activeFloorLevel,
      hiddenFloorLevels: floorState.hiddenFloorLevels,
      selectedCount: itemSelection.state.selectedIds.size,
      pendingZoneType: zone.state.pendingZoneType,
      selectedZone: zone.state.selectedZone,
      isClientPreview: coreShell.derived.access.isClientPreview,
    },
  };
}

function buildViewportConfiguration(
  sources: ViewportReadModelSources
): ViewportConfiguration {
  const { coreShell, planWorkspace, viewportShell } = sources;
  const quality = planWorkspace.state.quality;
  const dark = coreShell.derived.access.showDesignerTheme;

  return {
    dark,
    sceneBackgroundColor: planWorkspace.derived.sceneBackgroundColor,
    canEditPlanGeometry: sources.placement.derived.canEditPlanGeometry,
    selectionInspectorDockedWithRightRail:
      planWorkspace.derived.selectionInspectorDockedWithRightRail,
    floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
    selectionInspectorRightPx: planWorkspace.derived.selectionInspectorRightPx,
    selectionInspectorTopPx: planWorkspace.derived.selectionInspectorTopPx,
    selectionInspectorWidthPx: planWorkspace.derived.selectionInspectorWidthPx,
    planQualityReviewTopPx: quality.reviewPanelTopPx,
    editorMode: viewportShell.state.editor.editorMode,
    importedWallEditor: { dark },
  };
}

/** Builds the immutable viewport state/configuration projection. */
export function buildDesignPageViewportWorkspaceReadModel({
  sources,
}: BuildDesignPageViewportWorkspaceReadModelInput): DesignPageViewportWorkspaceReadModel {
  return {
    state: {
      ...buildViewportPanelState(sources),
      ...buildSelectionInspectorState(sources),
      ...buildViewportNavigationState(sources),
      ...buildViewportPlanControlState(sources),
    },
    configuration: buildViewportConfiguration(sources),
  };
}
