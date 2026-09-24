"use client";

import { useDesignPageSceneItemDrag } from "@/lib/useDesignPageSceneItemDrag";
import type { DesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";

/** Connect existing item dragging to its document, placement and viewport owners. */
export function useDesignPageSceneItemDragRegistration(presentation: DesignPagePresentationWorkspaceRegistration) {
  const { aiWorkspace, selection } = presentation.boundaries;
  const { coreShell, documentSelection, planAuthoring, editorInteraction } = aiWorkspace.boundaries;
  const { documentRoom, sceneRoomRead, itemSelection, itemDocument } = documentSelection.boundaries;
  const { selectionInspection } = planAuthoring.boundaries;
  const { camera } = editorInteraction.boundaries;
  const placement = selection.boundaries.placement, placementSelection = selection.boundaries.selection;
  return useDesignPageSceneItemDrag({
    state: {
      hasWholeHousePlan: sceneRoomRead.derived.scene.hasWholeHousePlan,
      designerMode: coreShell.derived.access.isDesigner,
      activeRoom: documentRoom.derived.room.activeRoom,
      roomWidth: documentRoom.derived.room.roomWidth,
      roomDepth: documentRoom.derived.room.roomDepth,
      wallThickness: documentRoom.derived.room.wallThickness,
      roomSnapshotById: sceneRoomRead.derived.scene.roomSnapshotById,
    },
    refs: {
      items: coreShell.refs.itemsRef,
      selectedIds: itemSelection.refs.selectedIds,
      dragCommit: camera.refs.canvas.itemDragCommit,
    },
    actions: {
      findPlanRoomAtWorldPoint:
        sceneRoomRead.queries.scene.findPlanRoomAtWorldPoint,
      setCrossRoomDragTarget: coreShell.actions.placement.setCrossRoomDragTarget,
      findPlacementBlocker:
        placement.actions.catalog.findCatalogPlacementBlockerInRoom,
      isPlacementContained:
        placement.actions.catalog.isCatalogPlacementContainedInRoom,
      clampToRoom: documentRoom.actions.room.clampToActiveRoom,
      getItemBounds: selectionInspection.actions.geometry.getItemAABB,
      getItemDisplayName: placement.actions.catalog.getItemDisplayName,
      previewItems: itemDocument.actions.previewItemsPresent,
      setItems: itemDocument.actions.setItemsPresent,
      history: documentRoom.refs.documentHistory.history,
      flushCoalescedHistoryTransaction:
        documentRoom.actions.history.flushCoalescedHistoryTransaction,
      trackFirstInteraction: coreShell.actions.paywall.trackFirstInteraction,
      showToast: coreShell.actions.feedback.showRuleToast,
      moveSelectionToRoom:
        placementSelection.actions.interaction.moveSelectedItemToRoom,
      transferItemToRoom: placement.actions.catalog.transferItemToRoom,
      showConstraints: coreShell.actions.feedback.showConstraintsForMoment,
      showConfidence: coreShell.actions.feedback.showConfidenceSummary,
    },
  });
}
