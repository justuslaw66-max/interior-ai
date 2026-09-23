import { buildDesignPageViewportRegionAdapter } from "@/lib/design-page-viewport-region-adapter";
import { buildDesignPageViewportWorkspaceReadModel } from "@/lib/design-page-viewport-workspace-read-model";
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
  const { documentRoom, sceneRoomRead, itemSelection, itemDocument } =
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

  const plan = documentRoom.derived.plan;
  const readModel = buildDesignPageViewportWorkspaceReadModel({
    sources: {
      base,
      coreShell,
      documentRoom,
      documentSelection,
      importedWallEditing,
      itemSelection,
      placement,
      planWorkspace,
      sceneRoomRead,
      selection,
      selectionInspection,
      viewportShell,
      zone,
    },
  });

  const region = buildDesignPageViewportRegionAdapter({
    state: readModel.state,
    configuration: readModel.configuration,
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
          changeFixtureLight: (patch) => {
            const selectedInstanceId =
              itemSelection.state.selectedItem?.instanceId;
            if (!selectedInstanceId) return;
            itemDocument.actions.commitItems(
              (items) =>
                items.map((item) =>
                  item.instanceId === selectedInstanceId
                    ? {
                        ...item,
                        fixtureLight: {
                          ...item.fixtureLight,
                          ...patch,
                        },
                      }
                    : item
                ),
              "Change fixture lighting"
            );
          },
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
