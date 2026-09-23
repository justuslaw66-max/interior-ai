"use client";

import { useEffect, type MutableRefObject } from "react";

import type { CATALOG_ITEMS } from "@/lib/catalog";
import { useDesignPageEditorShellRuntime } from "@/lib/useDesignPageEditorShellRuntime";
import { useDesignPageImportedModels } from "@/lib/useDesignPageImportedModels";
import { useDesignPageItemDocumentController } from "@/lib/useDesignPageItemDocumentController";
import { useDesignPageItemGeometry } from "@/lib/useDesignPageItemGeometry";
import { useDesignPageItemSelectionController } from "@/lib/useDesignPageItemSelectionController";
import { useDesignPageLateBoundRef } from "@/lib/useDesignPageLateBoundRef";
import { useDesignPagePlanViewportRuntime } from "@/lib/useDesignPagePlanViewportRuntime";
import {
  useDesignPageProductInspectionController,
  type UseDesignPageProductInspectionControllerOutput,
} from "@/lib/useDesignPageProductInspectionController";
import { useDesignPageRoomGeometry } from "@/lib/useDesignPageRoomGeometry";
import {
  useDesignPageSelectionCoordinator,
  type UseDesignPageSelectionCoordinatorInput,
} from "@/lib/useDesignPageSelectionCoordinator";
import { useDesignPageSnapshotDocumentState } from "@/lib/useDesignPageDocumentStateController";
import { useDesignPageDocumentRoomRegistration } from "@/lib/useDesignPageDocumentRoomRegistration";

type PlanViewportBoundary = ReturnType<
  typeof useDesignPagePlanViewportRuntime
>;
type EditorShellBoundary = ReturnType<
  typeof useDesignPageEditorShellRuntime
>;
type SnapshotDocumentBoundary = ReturnType<
  typeof useDesignPageSnapshotDocumentState
>;
type DocumentRoomBoundary = ReturnType<
  typeof useDesignPageDocumentRoomRegistration
>;
type ItemSelectionBoundary = ReturnType<
  typeof useDesignPageItemSelectionController
>;
type ItemDocumentBoundary = ReturnType<
  typeof useDesignPageItemDocumentController
>;
type ImportedModelsBoundary = ReturnType<
  typeof useDesignPageImportedModels
>;
type PlanningResolver =
  UseDesignPageProductInspectionControllerOutput["resolvers"]["resolveConfiguredPlanningDimsMm"];
type RoomGeometryInput = Parameters<typeof useDesignPageRoomGeometry>[0];

export type UseDesignPageSelectionInspectionRuntimeInput = {
  boundaries: {
    planViewport: PlanViewportBoundary;
    editorShell: EditorShellBoundary;
    snapshotDocument: SnapshotDocumentBoundary;
    documentRoom: DocumentRoomBoundary;
    itemSelection: ItemSelectionBoundary;
    itemDocument: ItemDocumentBoundary;
    importedModels: ImportedModelsBoundary;
  };
  state: {
    isClientPreview: boolean;
    canEdit: boolean;
    liveCatalogReady: boolean;
  };
  configuration: { catalogItems: typeof CATALOG_ITEMS };
  refs: {
    localBackupPlanningResolver: MutableRefObject<PlanningResolver>;
  };
  actions: {
    setSelectedZoneId: UseDesignPageSelectionCoordinatorInput["actions"]["setSelectedZoneId"];
    showToast: RoomGeometryInput["actions"]["showToast"];
  };
};

/**
 * Owns the contiguous selection, room-geometry, inspection, and item-geometry
 * registration slot. Raw controller results are returned without adaptation so
 * later plan and placement facades retain their existing boundary identities.
 */
export function useDesignPageSelectionInspectionRuntime({
  boundaries,
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageSelectionInspectionRuntimeInput) {
  const {
    planViewport,
    editorShell,
    snapshotDocument,
    documentRoom,
    itemSelection,
    itemDocument,
    importedModels,
  } = boundaries;
  const { editorMode } = editorShell.state.editor;
  const { items, activeRoom } = documentRoom.derived.room;
  const { housePlan2D } = documentRoom.derived.plan;
  const { activeFloorLevel } = documentRoom.derived.floor;
  const planDocument = planViewport.boundaries.planDocument;
  const historyBoundary = documentRoom.boundaries.history;
  const { bindFloorSelectionAction } = planViewport.actions.camera;

  const selectionCoordinator = useDesignPageSelectionCoordinator({
    state: {
      editorMode,
      housePlanRooms: housePlan2D.rooms,
      isClientPreview: state.isClientPreview,
      items,
      selectedPlanOverlayId:
        planViewport.state.overlaySelection.selectedPlanOverlayId,
    },
    configuration: { catalogItems: configuration.catalogItems },
    refs: {
      designSnapshot: snapshotDocument.refs.designSnapshotRef,
      planAnnotations: planDocument.refs.planAnnotationsRef,
      planFixedElements: planDocument.refs.planFixedElementsRef,
      planOpenings: planDocument.refs.planOpeningsRef,
      selectedIds: itemSelection.refs.selectedIds,
    },
    actions: {
      clearSelection: itemSelection.actions.clearSelection,
      commitItems: itemDocument.actions.commitItems,
      history: historyBoundary.refs.history,
      preserveCameraAfterPlanOverlaySelection:
        planViewport.actions.camera.navigation
          .preserveCameraAfterPlanOverlaySelection,
      setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
      setEditorMode: editorShell.actions.editor.setEditorMode,
      setPlanAnnotations: planDocument.actions.setPlanAnnotations,
      setPlanFixedElements: planDocument.actions.setPlanFixedElements,
      setPlanOpenings: planDocument.actions.setPlanOpenings,
      setSelectedPlanOverlayId:
        planViewport.actions.overlaySelection.setSelectedPlanOverlayId,
      setSelectedPlanRoomId:
        planViewport.actions.overlaySelection.setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget:
        editorShell.boundaries.surfaceState.actions
          .setSelectedRendererSurfaceTarget,
      setSelectedZoneId: actions.setSelectedZoneId,
      setSuppressedDoorwaySuggestionKeys:
        planViewport.actions.overlaySelection
          .setSuppressedDoorwaySuggestionKeys,
      showToast: actions.showToast,
    },
  });
  const {
    clearNonRoomSelection,
    clearAllSelection,
  } = selectionCoordinator.actions;

  useEffect(() => {
    bindFloorSelectionAction(clearNonRoomSelection);
  }, [bindFloorSelectionAction, clearNonRoomSelection]);

  const roomGeometry = useDesignPageRoomGeometry({
    state: { activeFloorLevel },
    refs: {
      designSnapshot: snapshotDocument.refs.designSnapshotRef,
    },
    actions: {
      setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
      setPlanOpenings: planDocument.actions.setPlanOpenings,
      setPlanFixedElements: planDocument.actions.setPlanFixedElements,
      history: historyBoundary.refs.history,
      runHistoryTransaction:
        historyBoundary.actions.runHistoryTransaction,
      runCoalescedHistoryTransaction:
        historyBoundary.actions.runCoalescedHistoryTransaction,
      showToast: actions.showToast,
    },
  });

  const productInspectionController =
    useDesignPageProductInspectionController({
      state: {
        items,
        selectedItem: itemSelection.state.selectedItem,
        selectedInstanceId: itemSelection.state.selectedInstanceId,
        activeRoom: activeRoom ?? null,
        editorMode,
      },
      configuration: {
        catalogItems: configuration.catalogItems,
        importedModelOptions: importedModels.state.modelOptions,
        importedCatalogByProductId:
          importedModels.state.catalogByProductId,
        importedModelUrlByAssetId:
          importedModels.state.modelUrlByAssetId,
        canEdit: state.canEdit,
        isClientPreview: state.isClientPreview,
        liveCatalogReady: state.liveCatalogReady,
      },
      actions: {
        clearAllSelection,
        commitItems: itemDocument.actions.commitItems,
        ensureImportedCatalogItem:
          importedModels.actions.ensureCatalogItem,
        setHoveredCartInstanceId:
          editorShell.actions.cart.setHoveredCartInstanceId,
      },
    });

  useDesignPageLateBoundRef(
    refs.localBackupPlanningResolver,
    productInspectionController.resolvers.resolveConfiguredPlanningDimsMm
  );

  const itemGeometryController = useDesignPageItemGeometry({
    configuration: {
      catalogItems: configuration.catalogItems,
      resolveConfiguredPlanningDimsMm:
        productInspectionController.resolvers
          .resolveConfiguredPlanningDimsMm,
    },
  });

  return {
    boundaries: {
      coordination: selectionCoordinator,
      inspection: productInspectionController,
      geometry: itemGeometryController,
    },
    state: { inspection: productInspectionController.state },
    derived: productInspectionController.derived,
    resolvers: productInspectionController.resolvers,
    actions: {
      selection: selectionCoordinator.actions,
      roomGeometry: roomGeometry.actions,
      geometry: itemGeometryController.actions,
    },
  };
}

export type DesignPageSelectionInspectionRuntime = ReturnType<
  typeof useDesignPageSelectionInspectionRuntime
>;
