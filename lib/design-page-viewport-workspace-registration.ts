import { buildDesignPageViewportRegionAdapter } from "@/lib/design-page-viewport-region-adapter";
import { PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX } from "@/lib/design-page-editor-configuration";
import type { DesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";

export type BuildDesignPageViewportWorkspaceRegistrationInput = {
  boundaries: {
    presentation: DesignPagePresentationWorkspaceRegistration;
  };
};
/**
 * Builds the viewport overlays and editor controls from existing domain
 * boundaries. The registration is pure and owns no document or UI state.
 */
export function buildDesignPageViewportWorkspaceRegistration({
  boundaries: { presentation },
}: BuildDesignPageViewportWorkspaceRegistrationInput) {
  const { aiWorkspace, selection } = presentation.boundaries;
  const { coreShell, documentSelection, planAuthoring, editorInteraction } =
    aiWorkspace.boundaries;
  const { base, viewportShell } = coreShell.boundaries;
  const { documentRoom, sceneRoomRead, itemSelection } =
    documentSelection.boundaries;
  const {
    selectionInspection,
    planWorkspace,
    importedWallEditing,
    surfaceWorkspace,
  } = planAuthoring.boundaries;
  const { camera, zone } = editorInteraction.boundaries;
  const placement = selection.boundaries.placement;
  const placementSelection = selection.boundaries.selection;

  const floor = documentRoom.derived.floor;
  const floorState = documentRoom.state.floor;
  const room = documentRoom.derived.room;
  const plan = documentRoom.derived.plan;
  const scene = sceneRoomRead.derived.scene;
  const roomRead = sceneRoomRead.derived.room;
  const quality = planWorkspace.state.quality;
  const inspector = planWorkspace.state.inspector;

  const region = buildDesignPageViewportRegionAdapter({
    state: {
      visibility: {
        rail: planWorkspace.derived.floatingPlanOverlayStackVisible ||
          importedWallEditing.state.available,
        sceneLoading: sceneRoomRead.state.scene.showSceneLoadingVeil,
        selectionInspector: inspector.floatingSelectionInspectorVisible,
        planQuality: quality.reviewPanelVisible,
        floorProperties: planWorkspace.derived.floatingFloorPropertiesPanelVisible,
        isClientPreview: coreShell.derived.access.isClientPreview,
      },
      opening: {
        selectedId: viewportShell.state.planSelection.selectedPlanOverlayId,
        value: inspector.visiblePlanOpening
          ? {
              kind: inspector.visiblePlanOpening.kind,
              wall: inspector.visiblePlanOpening.wall,
              widthMm: inspector.visiblePlanOpening.widthMm,
              wallSpanMeters: inspector.visiblePlanOpeningWallSpanMeters,
            }
          : null,
      },
      selectionInspector: {
        summary: inspector.selectedObjectInspector,
        selectedRoom: scene.selectedPlanRoomContext,
        hasSelectedItem: Boolean(itemSelection.state.selectedItem),
        hasVisiblePlanOpening: Boolean(inspector.visiblePlanOpening),
        hasSelectedPlanFixedElement: Boolean(inspector.selectedPlanFixedElement),
        hasSelectedPlanAnnotation: Boolean(inspector.selectedPlanAnnotation),
        surfaceInspectorIsWall: roomRead.surfaceInspectorIsWall,
        surfaceInspectorIsCeiling: roomRead.surfaceInspectorIsCeiling,
        surfaceInspector: placement.state.surfaceInspector,
        measurementUnit: viewportShell.state.plan.planMeasurementUnit,
        activeRoomHeightMm: roomRead.activeRoomHeightMm,
        activeRoomWallHeightEvidence: roomRead.activeRoomWallHeightEvidence,
        canEditActiveRoomWallHeight: roomRead.canEditActiveRoomWallHeight,
        activeFloorRoomCount: floor.activeFloorRoomCount,
        designRoomCount: coreShell.state.document.designSnapshot.rooms.length,
      },
      planSummary:
        base.state.editor.viewMode === "2d" && plan.housePlan2D.rooms.length > 0
          ? {
              rooms: plan.housePlan2D.rooms,
              selectedRoomIds:
                viewportShell.state.planSelection.selectedPlanRoomIds,
            }
          : null,
      planQuality: {
        report: quality.report,
        collapsed: quality.reviewPanelCollapsed,
      },
      planCanvas: planWorkspace.derived.planCanvasOverlaysState,
      aiLayoutPreview: {
        proposal: coreShell.state.placement.pendingAiLayoutProposal,
        toneText: scene.aiLayoutPreviewTone.text,
      },
      crossRoomDragTarget: coreShell.state.placement.crossRoomDragTarget,
      navigator: {
        enabled:
          base.state.editor.viewMode === "3d" && scene.hasWholeHousePlan,
        rooms: plan.housePlan2D.rooms,
        activeRoomId: coreShell.state.document.designSnapshot.activeRoomId,
        cameraPosition: viewportShell.state.camera.cameraView.pos,
        cameraTarget: viewportShell.state.camera.cameraView.target,
        itemCountsByRoomId: roomRead.roomItemCountsById,
        targetRoomId: placement.derived.placementTargetRoomId,
        targetRoomValid: selection.derived.placement.activeTargetValid,
      },
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
        activeRoomSlabThicknessEvidence:
          roomRead.activeRoomSlabThicknessEvidence,
        canEditActiveRoomSlabThickness:
          roomRead.canEditActiveRoomSlabThickness,
        activeRoomBaseboardDepthMm: roomRead.activeRoomBaseboardDepthMm,
        activeRoomWallOpacity: roomRead.activeRoomWallOpacity,
        activeRoomFloorOpacity: roomRead.activeRoomFloorOpacity,
        activeRoomCeilingOpacity: roomRead.activeRoomCeilingOpacity,
        activeRoomCeilingVisible: roomRead.activeRoomCeilingVisible,
        activeRoomCeilingColor: roomRead.activeRoomCeilingColor,
        stackedFloorView: floorState.stackedFloorView,
        canRedo: documentSelection.state.history.canRedo,
      },
      importedWallEditor: importedWallEditing.state.available
        ? importedWallEditing.state
        : null,
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
    },
    configuration: {
      dark: coreShell.derived.access.showDesignerTheme,
      sceneBackgroundColor: planWorkspace.derived.sceneBackgroundColor,
      canEditPlanGeometry: placement.derived.canEditPlanGeometry,
      selectionInspectorDockedWithRightRail:
        planWorkspace.derived.selectionInspectorDockedWithRightRail,
      floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
      selectionInspectorRightPx:
        planWorkspace.derived.selectionInspectorRightPx,
      selectionInspectorTopPx: planWorkspace.derived.selectionInspectorTopPx,
      selectionInspectorWidthPx:
        planWorkspace.derived.selectionInspectorWidthPx,
      planQualityReviewTopPx: quality.reviewPanelTopPx,
      editorMode: viewportShell.state.editor.editorMode,
      importedWallEditor: {
        dark: coreShell.derived.access.showDesignerTheme,
      },
    },
    references: {
      planQuality: {
        setPanel: planWorkspace.refs.quality.setReviewPanelNode,
      },
    },
    actions: {
      deletePlanOverlay:
        selectionInspection.actions.selection.deletePlanOverlayById,
      updateOpeningMetrics: planWorkspace.actions.overlay.handleUpdateOpeningMetrics2D,
      showToast: coreShell.actions.feedback.showRuleToast,
      selectionInspector: {
        clearSelection:
          selectionInspection.actions.selection.clearAllSelection,
        setMeasurementUnit: viewportShell.actions.plan.setPlanMeasurementUnit,
        commitRoomDimensionMeters:
          planWorkspace.actions.room.commitRoomDimensionEdit2D,
        commitActiveFloorWallHeightMm:
          selectionInspection.actions.roomGeometry.changeActiveRoomHeightMm,
        item: {
          center:
            placementSelection.actions.interaction.centerSelectedItemInRoom,
          snapToWall:
            placementSelection.actions.interaction.snapSelectedItemToNearestWall,
          duplicate:
            placementSelection.actions.interaction.duplicateSelectedItem,
          delete: placementSelection.actions.interaction.deleteSelectedItem,
        },
        room: {
          editFloor: surfaceWorkspace.actions.openFloorEditorForRoom,
          fit: camera.actions.navigation.handleFitSelectedPlanRoom,
          duplicate: planWorkspace.actions.room.duplicateRoom,
          delete: planWorkspace.actions.room.deleteRoom,
        },
        surfaceInspector: placement.actions.targeting.surfaceInspector,
      },
      planSummary: {
        selectAllRooms: () => {
          selectionInspection.actions.selection.clearNonRoomSelection();
          const roomIds = plan.housePlan2D.rooms.map((room) => room.id);
          const primaryId =
            viewportShell.state.planSelection.selectedPlanRoomId ??
            coreShell.state.document.designSnapshot.activeRoomId ??
            roomIds[0] ??
            null;
          viewportShell.actions.plan.setSelectedPlanRoomSelection(
            roomIds,
            primaryId
          );
        },
        clearRoomSelection:
          selectionInspection.actions.selection.clearAllSelection,
      },
      planQuality: {
        toggleCollapsed: planWorkspace.actions.quality.toggleReviewPanel,
        activateIssue: planWorkspace.actions.quality.activateIssue,
      },
      planCanvas: presentation.actions.planCanvas,
      aiLayoutPreview: {
        apply:
          aiWorkspace.boundaries.aiPanel.actions.layout.applyPendingProposal,
        dismiss:
          aiWorkspace.boundaries.aiPanel.actions.layout.dismissPendingProposal,
      },
      navigator: {
        onMoveCamera: camera.actions.navigation.handleWholeHomeMoveCamera,
        onMoveTarget: camera.actions.navigation.handleWholeHomeMoveTarget,
        onFocusRoom: camera.actions.navigation.handleWholeHomeFocusRoom,
        onZoom: camera.actions.navigation.handleWholeHomeNavigatorZoom,
        onResetView: camera.actions.navigation.handleFitPlanView,
      },
      floorProperties: {
        addFloor: documentRoom.actions.floor.handleAddFloor,
        onToggleFloorVisibility:
          documentRoom.actions.floor.handleToggleFloorVisibility,
        onRenameFloor: documentRoom.actions.floor.handleRenameFloor,
        onDuplicateFloor: documentRoom.actions.floor.handleDuplicateFloor,
        onDeleteFloor: documentRoom.actions.floor.handleDeleteFloor,
        onSwitchFloor: documentRoom.actions.floor.handleSwitchFloor,
        onStackedFloorViewChange:
          documentRoom.actions.floor.setStackedFloorView,
        onRedo: documentSelection.actions.history.redoSafe,
        onActiveRoomHeightMmChange:
          selectionInspection.actions.roomGeometry.changeActiveRoomHeightMm,
        onActiveRoomWallThicknessMmChange:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomWallThicknessMm,
        onActiveRoomSlabThicknessMmChange:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomSlabThicknessMm,
        onActiveRoomBaseboardDepthMmChange:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomBaseboardDepthMm,
        onActiveRoomSurfaceOpacityChange:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomSurfaceOpacity,
        onActiveRoomCeilingVisibleChange:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomCeilingVisible,
        onActiveRoomCeilingColorChange:
          selectionInspection.actions.roomGeometry.changeActiveRoomCeilingColor,
      },
      importedWallEditor: importedWallEditing.actions,
      selectionControls: {
        floorStack: {
          switchFloor: documentRoom.actions.floor.handleSwitchFloor,
        },
        multiSelection: {
          alignX: placementSelection.actions.interaction.alignSelectionX,
          alignZ: placementSelection.actions.interaction.alignSelectionZ,
          changeZoneType: zone.actions.setPendingZoneType,
          createZone: zone.actions.createZoneFromSelection,
          clear: selectionInspection.actions.selection.clearAllSelection,
        },
        selectedZone: {
          autoLayout: zone.actions.autoLayoutZone,
          rotateZone: zone.actions.rotateZone,
          ungroup: zone.actions.ungroupZone,
        },
      },
    },
  });

  return {
    boundaries: { presentation },
    state: {},
    derived: {},
    configuration: {},
    refs: {},
    actions: {},
    regions: { viewport: region },
  };
}

export type DesignPageViewportWorkspaceRegistration = ReturnType<
  typeof buildDesignPageViewportWorkspaceRegistration
>;
