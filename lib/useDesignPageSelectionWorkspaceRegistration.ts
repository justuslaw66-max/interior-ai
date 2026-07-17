"use client";

import type { MutableRefObject } from "react";

import { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignItem } from "@/lib/room-types";
import type { DesignPageCabinetryWorkspaceRegistration } from "@/lib/useDesignPageCabinetryWorkspaceRegistration";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import { useDesignPagePlacementSelectionWorkspaceFacade } from "@/lib/useDesignPagePlacementSelectionWorkspaceFacade";
import type { DesignPagePlacementWorkspaceRegistration } from "@/lib/useDesignPagePlacementWorkspaceRegistration";
import type { DesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";

export type UseDesignPageSelectionWorkspaceRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    planAuthoring: DesignPagePlanAuthoringRegistration;
    placement: DesignPagePlacementWorkspaceRegistration;
    cabinetry: DesignPageCabinetryWorkspaceRegistration;
  };
};

function replaceActiveItemsSnapshot(
  targetRef: MutableRefObject<DesignItem[]>,
  nextItems: DesignItem[]
): void {
  targetRef.current = nextItems;
}

/**
 * Registers selected-item transforms, shortcuts, and placement-aware transfer
 * behavior after cabinetry has supplied its domain-specific item label.
 */
export function useDesignPageSelectionWorkspaceRegistration({
  boundaries: {
    coreShell,
    documentSelection,
    planAuthoring,
    placement,
    cabinetry,
  },
}: UseDesignPageSelectionWorkspaceRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const { documentRoom, sceneRoomRead, itemSelection, itemDocument } =
    documentSelection.boundaries;
  const { selectionInspection, planWorkspace } = planAuthoring.boundaries;
  const { coordination, inspection, geometry } =
    selectionInspection.boundaries;
  const { activeRoom, roomWidth, roomDepth, wallThickness } =
    documentRoom.derived.room;
  const itemsRef = coreShell.refs.itemsRef;
  const selectedCabinetItem = cabinetry.state.selectedItem;
  const selectedProduct = selectionInspection.derived.selectedProduct;
  const selectedPlanRoom = sceneRoomRead.derived.scene.selectedPlanRoomContext;

  const selection = useDesignPagePlacementSelectionWorkspaceFacade({
    boundaries: {
      selection: itemSelection,
      document: itemDocument,
      coordination,
      inspection,
      geometry,
      roomQueries: placement.boundaries.roomQueries,
      catalogPlacement: placement.boundaries.catalogPlacementController,
      crossRoomTransfer: placement.boundaries.crossRoomTransfer,
      targeting: placement.boundaries.targeting,
    },
    state: {
      selection: {
        selectedItemDeleteLabel:
          selectedCabinetItem?.name ??
          selectedCabinetItem?.cabinetDefinition.name ??
          selectedProduct?.title ??
          "Item",
      },
      room: {
        activeRoom: activeRoom ?? null,
        activeRoomShoppingItems:
          sceneRoomRead.derived.room.activeRoomShoppingItems,
      },
      editor: {
        editorMode: viewportShell.state.editor.editorMode,
        isClientPreview: coreShell.derived.access.isClientPreview,
        viewMode: base.state.editor.viewMode,
      },
      plan: {
        selectedPlanOverlayId:
          viewportShell.state.planSelection.selectedPlanOverlayId,
        selectedPlanRoomId: selectedPlanRoom?.id ?? null,
        selectedZoneId: documentSelection.state.selectedZoneId,
      },
      presentation: {
        style: base.state.brief.style,
        designId: base.state.identity.designId,
      },
      crossRoomDragTarget: coreShell.state.placement.crossRoomDragTarget,
      placementTargetRoomName:
        placement.derived.placementTargetRoom?.name ?? null,
    },
    configuration: {
      canEdit: coreShell.derived.access.canEdit,
      isDesigner: coreShell.derived.access.isDesigner,
      roomWidth,
      roomDepth,
      wallThickness,
      rotationSnapEnabled:
        selectionInspection.state.inspection.rotationSnapEnabled,
      rotationSnapStepRadians:
        selectionInspection.state.inspection.rotationSnapStepRadians,
      catalogItems: CATALOG_ITEMS,
    },
    derived: {
      activeRoomPlanOffset: documentRoom.derived.plan.activeRoomPlanOffset,
      roomSnapshotById: sceneRoomRead.derived.scene.roomSnapshotById,
    },
    refs: {
      items: itemsRef,
      selectedIds: itemSelection.refs.selectedIds,
      primaryId: itemSelection.refs.primaryId,
      designSnapshot: coreShell.refs.designSnapshotRef,
    },
    actions: {
      document: {
        setDesignSnapshot: coreShell.actions.document.setDesignSnapshot,
        replaceActiveItemsSnapshot: (nextItems) => {
          replaceActiveItemsSnapshot(itemsRef, nextItems);
        },
      },
      placement: {
        clampToActiveRoom: documentRoom.actions.room.clampToActiveRoom,
        getItemDisplayName: placement.actions.catalog.getItemDisplayName,
      },
      room: {
        keyboard: {
          delete: planWorkspace.actions.room.deleteRoom,
          duplicate: planWorkspace.actions.room.duplicateRoom,
          nudge: planWorkspace.actions.room.nudgeSelectedPlanRoom,
        },
      },
      history: documentRoom.refs.documentHistory.history,
      feedback: {
        showToast: coreShell.actions.feedback.showRuleToast,
        showConstraintsForMoment:
          coreShell.actions.feedback.showConstraintsForMoment,
        showConfidenceSummary:
          coreShell.actions.feedback.showConfidenceSummary,
        trackFirstInteraction: coreShell.actions.paywall.trackFirstInteraction,
      },
    },
  });

  return {
    boundaries: { selection, placement, cabinetry },
    state: selection.state,
    derived: selection.derived,
    configuration: {},
    refs: selection.refs,
    actions: selection.actions,
  };
}

export type DesignPageSelectionWorkspaceRegistration = ReturnType<
  typeof useDesignPageSelectionWorkspaceRegistration
>;
