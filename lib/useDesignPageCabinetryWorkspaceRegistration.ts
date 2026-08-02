"use client";

import { useDesignPageCabinetryRegistrationFacade } from "@/lib/useDesignPageCabinetryRegistrationFacade";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import type { DesignPagePlacementWorkspaceRegistration } from "@/lib/useDesignPagePlacementWorkspaceRegistration";
import type { DesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";

export type UseDesignPageCabinetryWorkspaceRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    planAuthoring: DesignPagePlanAuthoringRegistration;
    placement: DesignPagePlacementWorkspaceRegistration;
  };
};

/** Adapts existing document, plan, selection, and placement owners to cabinetry. */
export function useDesignPageCabinetryWorkspaceRegistration({
  boundaries: { coreShell, documentSelection, planAuthoring, placement },
}: UseDesignPageCabinetryWorkspaceRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const { documentRoom, sceneRoomRead, itemSelection, itemDocument } =
    documentSelection.boundaries;
  const selectionInspection =
    planAuthoring.boundaries.selectionInspection;
  const { activeRoom, roomWidth, roomDepth, wallThickness } =
    documentRoom.derived.room;

  const cabinetry = useDesignPageCabinetryRegistrationFacade({
    state: {
      activeRoom: activeRoom ?? null,
      planRoomById: sceneRoomRead.derived.scene.houseRoomById,
      planRoomCount: documentRoom.derived.plan.housePlan2D.rooms.length,
      planOpenings: viewportShell.state.plan.planOpenings,
      activeSurfaceTarget: viewportShell.state.surface.activeSurfaceTarget,
      selectedWallFaceId:
        sceneRoomRead.derived.room.activeSelectedWallFaceId,
      selectedItem: itemSelection.state.selectedItem ?? null,
      designSnapshot: coreShell.state.document.designSnapshot,
    },
    configuration: {
      isClientPreview: coreShell.derived.access.isClientPreview,
      isDesigner: coreShell.derived.access.isDesigner,
      canEdit: coreShell.derived.access.canEdit,
      designId: base.state.identity.designId,
      roomWidth,
      roomDepth,
      wallThickness,
      rotationSnapEnabled:
        selectionInspection.state.inspection.rotationSnapEnabled,
      rotationSnapStepRadians:
        selectionInspection.state.inspection.rotationSnapStepRadians,
    },
    refs: {
      designSnapshot: coreShell.refs.designSnapshotRef,
      activeItems: coreShell.refs.itemsRef,
    },
    actions: {
      setDesignSnapshot: coreShell.actions.document.setDesignSnapshot,
      commitItems: itemDocument.actions.commitItems,
      commitItemsToRoom: itemDocument.actions.commitItemsToRoom,
      updateSelection: itemSelection.actions.updateSelection,
      createInstanceId: itemDocument.actions.createInstanceId,
      clampToActiveRoom: documentRoom.actions.room.clampToActiveRoom,
      clampToCatalogPlacementRoom:
        placement.actions.catalog.clampToCatalogPlacementRoom,
      isCatalogPlacementContainedInRoom:
        placement.actions.catalog.isCatalogPlacementContainedInRoom,
      getItemAABB: selectionInspection.actions.geometry.getItemAABB,
      getItemDisplayName: placement.actions.catalog.getItemDisplayName,
      showToast: coreShell.actions.feedback.showRuleToast,
    },
  });

  return {
    boundaries: { ...cabinetry.boundaries, placement },
    state: cabinetry.state,
    derived: {},
    configuration: {},
    refs: cabinetry.refs,
    actions: cabinetry.actions,
  };
}

export type DesignPageCabinetryWorkspaceRegistration = ReturnType<
  typeof useDesignPageCabinetryWorkspaceRegistration
>;
