"use client";

import type { useDesignPageCatalogPlacement } from "@/lib/useDesignPageCatalogPlacement";
import type { useDesignPageCrossRoomItemTransfer } from "@/lib/useDesignPageCrossRoomItemTransfer";
import type { useDesignPageItemDocumentController } from "@/lib/useDesignPageItemDocumentController";
import type { useDesignPageItemGeometry } from "@/lib/useDesignPageItemGeometry";
import {
  useDesignPageItemInteractionFacade,
  type UseDesignPageItemInteractionFacadeInput,
} from "@/lib/useDesignPageItemInteractionFacade";
import type { useDesignPageItemSelectionController } from "@/lib/useDesignPageItemSelectionController";
import type { useDesignPagePlacementRoomQueries } from "@/lib/useDesignPagePlacementRoomQueries";
import type { useDesignPageProductInspectionController } from "@/lib/useDesignPageProductInspectionController";
import type { useDesignPageSelectionCoordinator } from "@/lib/useDesignPageSelectionCoordinator";
import type { useDesignPageSurfaceTargetingFacade } from "@/lib/useDesignPageSurfaceTargetingFacade";

type InteractionInput = UseDesignPageItemInteractionFacadeInput;
type ItemSelectionBoundary = ReturnType<
  typeof useDesignPageItemSelectionController
>;
type ItemDocumentBoundary = ReturnType<
  typeof useDesignPageItemDocumentController
>;
type SelectionCoordinationBoundary = ReturnType<
  typeof useDesignPageSelectionCoordinator
>;
type ProductInspectionBoundary = ReturnType<
  typeof useDesignPageProductInspectionController
>;
type ItemGeometryBoundary = ReturnType<typeof useDesignPageItemGeometry>;
type PlacementRoomQueriesBoundary = ReturnType<
  typeof useDesignPagePlacementRoomQueries
>;
type CatalogPlacementBoundary = ReturnType<
  typeof useDesignPageCatalogPlacement
>;
type CrossRoomTransferBoundary = ReturnType<
  typeof useDesignPageCrossRoomItemTransfer
>;
type PlacementTargetingBoundary = ReturnType<
  typeof useDesignPageSurfaceTargetingFacade
>;

type CrossRoomDragTarget = {
  roomId: string;
  label: string;
  valid: boolean;
  kind: "preview" | "item";
} | null;

export type UseDesignPagePlacementSelectionWorkspaceFacadeInput = {
  boundaries: {
    selection: ItemSelectionBoundary;
    document: ItemDocumentBoundary;
    coordination: SelectionCoordinationBoundary;
    inspection: ProductInspectionBoundary;
    geometry: ItemGeometryBoundary;
    roomQueries: PlacementRoomQueriesBoundary;
    catalogPlacement: CatalogPlacementBoundary;
    crossRoomTransfer: CrossRoomTransferBoundary;
    targeting: PlacementTargetingBoundary;
  };
  state: {
    selection: Pick<
      InteractionInput["state"]["selection"],
      "selectedItemDeleteLabel"
    >;
    room: InteractionInput["state"]["room"];
    editor: InteractionInput["state"]["editor"];
    plan: InteractionInput["state"]["plan"];
    presentation: InteractionInput["state"]["presentation"];
    crossRoomDragTarget: CrossRoomDragTarget;
    placementTargetRoomName: string | null;
  };
  derived: InteractionInput["derived"];
  configuration: InteractionInput["configuration"];
  refs: InteractionInput["refs"];
  actions: {
    document: Pick<
      InteractionInput["actions"]["document"],
      "setDesignSnapshot" | "replaceActiveItemsSnapshot"
    >;
    placement: Pick<
      InteractionInput["actions"]["placement"],
      "clampToActiveRoom" | "getItemDisplayName"
    >;
    room: Pick<InteractionInput["actions"]["room"], "keyboard">;
    history: InteractionInput["actions"]["history"];
    feedback: InteractionInput["actions"]["feedback"];
  };
};

/**
 * Joins the already-registered placement and selection boundaries at the
 * existing item-interaction slot. The owning hooks stay where they were
 * registered; this facade only maps their typed outputs into one workspace
 * contract and derives presentation-only target metadata.
 */
export function useDesignPagePlacementSelectionWorkspaceFacade({
  boundaries,
  state,
  derived,
  configuration,
  refs,
  actions,
}: UseDesignPagePlacementSelectionWorkspaceFacadeInput) {
  const {
    selection,
    document,
    coordination,
    inspection,
    geometry,
    roomQueries,
    catalogPlacement,
    crossRoomTransfer,
    targeting,
  } = boundaries;
  const pendingPlacement = catalogPlacement.state.pendingPlacement;
  const activePlacementTargetValid = pendingPlacement
    ? !catalogPlacement.assessment.pendingCatalogPlacementHardInvalid
    : state.crossRoomDragTarget?.valid ?? true;
  const activePlacementTargetLabel =
    catalogPlacement.scene.pendingCatalogPlacementRoom?.name ??
    state.crossRoomDragTarget?.label ??
    state.placementTargetRoomName;

  const interaction = useDesignPageItemInteractionFacade({
    state: {
      selection: {
        selectedItem: selection.state.selectedItem ?? null,
        selectedProduct: inspection.derived.selectedProduct ?? null,
        selectedIds: selection.state.selectedIds,
        selectedInstanceId: selection.state.selectedInstanceId,
        selectedItemPlanningDimensionsMm:
          inspection.derived.selectedItemPlanningDimensionsMm,
        selectedItemDeleteLabel: state.selection.selectedItemDeleteLabel,
      },
      room: state.room,
      editor: state.editor,
      plan: state.plan,
      placement: { hasPendingCatalogPlacement: Boolean(pendingPlacement) },
      productInspection: {
        rotationInputValue: inspection.state.rotationInputValue,
        selectedResolvedVariant: inspection.derived.selectedResolvedVariant,
        showInspectorDetails: inspection.state.showInspectorDetails,
        showFullDimensions: inspection.state.showFullDimensions,
        showDeliveryWarranty: inspection.state.showDeliveryWarranty,
        showRotationControls: inspection.state.showRotationControls,
      },
      presentation: state.presentation,
    },
    derived,
    configuration,
    refs,
    actions: {
      document: {
        commitItems: document.actions.commitItems,
        createInstanceId: document.actions.createInstanceId,
        setDesignSnapshot: actions.document.setDesignSnapshot,
        replaceActiveItemsSnapshot:
          actions.document.replaceActiveItemsSnapshot,
      },
      selection: {
        updateSelection: selection.actions.updateSelection,
        clearAllSelection: coordination.actions.clearAllSelection,
      },
      geometry: {
        getItemAABB: geometry.actions.getItemAABB,
        getSelectionBounds: geometry.actions.getSelectionBounds,
        getPlanningDimensions:
          inspection.resolvers.resolveConfiguredPlanningDimsMm,
      },
      placement: {
        clampToActiveRoom: actions.placement.clampToActiveRoom,
        clampToCatalogPlacementRoom:
          roomQueries.queries.clampToCatalogPlacementRoom,
        findCatalogPlacementBlockerInRoom:
          roomQueries.queries.findCatalogPlacementBlockerInRoom,
        isCatalogPlacementContainedInRoom:
          roomQueries.queries.isCatalogPlacementContainedInRoom,
        getItemDisplayName: actions.placement.getItemDisplayName,
        cancel: catalogPlacement.actions.cancelPendingCatalogPlacement,
        confirm: catalogPlacement.actions.confirmPendingCatalogPlacement,
        rotate: catalogPlacement.actions.rotatePendingCatalogPlacement,
        nudge: catalogPlacement.actions.nudgePendingCatalogPlacement,
      },
      room: {
        transferItemToRoom:
          crossRoomTransfer.actions.transferItemToRoom,
        keyboard: actions.room.keyboard,
      },
      history: actions.history,
      feedback: actions.feedback,
      productInspection: {
        setRotationInputValue: inspection.actions.setRotationInputValue,
        switchSelectedProductModel:
          inspection.actions.switchSelectedProductModel,
        setShowInspectorDetails: inspection.actions.setShowInspectorDetails,
        setShowFullDimensions: inspection.actions.setShowFullDimensions,
        setShowDeliveryWarranty:
          inspection.actions.setShowDeliveryWarranty,
        setShowRotationControls:
          inspection.actions.setShowRotationControls,
      },
    },
  });

  return {
    state: {
      selection: selection.state,
      inspection: inspection.state,
      targeting: targeting.state,
      interaction: interaction.state,
    },
    derived: {
      inspection: inspection.derived,
      placement: {
        activeTargetValid: activePlacementTargetValid,
        activeTargetLabel: activePlacementTargetLabel,
      },
    },
    configuration,
    refs: {
      selection: selection.refs,
      interaction: refs,
    },
    actions: {
      selection: {
        ...selection.actions,
        ...coordination.actions,
      },
      document: document.actions,
      inspection: inspection.actions,
      placement: {
        roomQueries: roomQueries.queries,
        catalog: catalogPlacement.actions,
        targeting: targeting.actions,
        transferItemToRoom:
          crossRoomTransfer.actions.transferItemToRoom,
      },
      interaction: interaction.actions,
    },
    resolvers: inspection.resolvers,
  };
}
