"use client";

import { useCallback, type MutableRefObject } from "react";

import type { DesignItem, DesignSnapshot } from "@/lib/room-types";
import {
  useDesignPageSelectedItemPanelController,
  type UseDesignPageSelectedItemPanelControllerInput,
} from "@/lib/useDesignPageSelectedItemPanelController";
import {
  useDesignPageSelectionKeyboardController,
  type UseDesignPageSelectionKeyboardControllerInput,
} from "@/lib/useDesignPageSelectionKeyboard";
import {
  useDesignPageSelectionTransforms,
  type UseDesignPageSelectionTransformsInput,
} from "@/lib/useDesignPageSelectionTransforms";

type TransformInput = UseDesignPageSelectionTransformsInput;
type KeyboardInput = UseDesignPageSelectionKeyboardControllerInput;
type PanelInput = UseDesignPageSelectedItemPanelControllerInput;
type SelectionTransforms = ReturnType<typeof useDesignPageSelectionTransforms>;

export type UseDesignPageItemInteractionFacadeInput = {
  state: {
    selection: {
      selectedItem: TransformInput["state"]["selectedItem"];
      selectedProduct: TransformInput["state"]["selectedProduct"];
      selectedIds: TransformInput["state"]["selectedIds"];
      selectedInstanceId: PanelInput["state"]["selectedInstanceId"];
      selectedItemPlanningDimensionsMm: TransformInput["state"]["selectedItemPlanningDimensionsMm"];
      selectedItemDeleteLabel: TransformInput["state"]["selectedItemDeleteLabel"];
    };
    room: {
      activeRoom: TransformInput["state"]["activeRoom"];
      activeRoomShoppingItems: TransformInput["state"]["activeRoomShoppingItems"];
    };
    editor: {
      editorMode: KeyboardInput["state"]["editorMode"];
      isClientPreview: KeyboardInput["state"]["isClientPreview"];
      viewMode: KeyboardInput["state"]["viewMode"];
    };
    plan: {
      selectedPlanOverlayId: KeyboardInput["state"]["selectedPlanOverlayId"];
      selectedPlanRoomId: KeyboardInput["state"]["selectedPlanRoomId"];
      selectedZoneId: KeyboardInput["state"]["selectedZoneId"];
    };
    placement: {
      hasPendingCatalogPlacement: KeyboardInput["state"]["hasPendingCatalogPlacement"];
    };
    productInspection: {
      rotationInputValue: TransformInput["state"]["rotationInputValue"];
      selectedResolvedVariant: PanelInput["state"]["selectedResolvedVariant"];
      showInspectorDetails: PanelInput["state"]["showInspectorDetails"];
      showFullDimensions: PanelInput["state"]["showFullDimensions"];
      showDeliveryWarranty: PanelInput["state"]["showDeliveryWarranty"];
      showRotationControls: PanelInput["state"]["showRotationControls"];
    };
    presentation: {
      style: PanelInput["state"]["style"];
      designId: PanelInput["state"]["designId"];
    };
  };
  derived: Pick<
    TransformInput["configuration"],
    "activeRoomPlanOffset" | "roomSnapshotById"
  >;
  configuration: Pick<
    TransformInput["configuration"],
    | "canEdit"
    | "isDesigner"
    | "roomWidth"
    | "roomDepth"
    | "wallThickness"
    | "rotationSnapEnabled"
    | "rotationSnapStepRadians"
  > & {
    keyboardOwnership: KeyboardInput["refs"]["keyboardOwnership"];
    keyboardShortcutsEnabled: boolean;
    rotationSnapStepDegrees: number;
    catalogItems: PanelInput["configuration"]["catalogItems"];
  };
  refs: {
    items: MutableRefObject<DesignItem[]>;
    selectedIds: MutableRefObject<Set<string>>;
    primaryId: MutableRefObject<string | null>;
    designSnapshot: MutableRefObject<DesignSnapshot>;
  };
  actions: {
    document: Pick<
      TransformInput["actions"],
      "commitItems" | "createInstanceId" | "setDesignSnapshot"
    > & {
      replaceActiveItemsSnapshot: TransformInput["refs"]["replaceActiveItemsSnapshot"];
    };
    selection: {
      updateSelection: TransformInput["actions"]["updateSelection"];
      clearAllSelection: KeyboardInput["actions"]["clearAllSelection"];
    };
    geometry: Pick<
      TransformInput["actions"],
      "getItemAABB" | "getSelectionBounds" | "getPlanningDimensions"
    >;
    placement: Pick<
      TransformInput["actions"],
      | "clampToActiveRoom"
      | "clampToCatalogPlacementRoom"
      | "findCatalogPlacementBlockerInRoom"
      | "isCatalogPlacementContainedInRoom"
      | "getItemDisplayName"
    > &
      KeyboardInput["actions"]["placement"];
    room: {
      transferItemToRoom: TransformInput["actions"]["transferItemToRoom"];
      keyboard: KeyboardInput["actions"]["room"];
    };
    history: TransformInput["actions"]["history"];
    feedback: Pick<
      TransformInput["actions"],
      | "showToast"
      | "showConstraintsForMoment"
      | "showConfidenceSummary"
      | "trackFirstInteraction"
    >;
    productInspection: {
      setRotationInputValue: TransformInput["actions"]["setRotationInputValue"];
      switchSelectedProductModel: PanelInput["actions"]["switchSelectedProductModel"];
      setShowInspectorDetails: PanelInput["actions"]["setShowInspectorDetails"];
      setShowFullDimensions: PanelInput["actions"]["setShowFullDimensions"];
      setShowDeliveryWarranty: PanelInput["actions"]["setShowDeliveryWarranty"];
      setShowRotationControls: PanelInput["actions"]["setShowRotationControls"];
    };
  };
};

function useDesignPageItemInteractionKeyboard(
  input: Pick<
    UseDesignPageItemInteractionFacadeInput,
    "state" | "configuration" | "refs" | "actions"
  >,
  transforms: SelectionTransforms
): void {
  const { state, configuration, refs, actions } = input;
  useDesignPageSelectionKeyboardController({
    state: {
      canEdit: configuration.canEdit,
      editorMode: state.editor.editorMode,
      hasPendingCatalogPlacement: state.placement.hasPendingCatalogPlacement,
      isClientPreview: state.editor.isClientPreview,
      keyboardShortcutsEnabled: configuration.keyboardShortcutsEnabled,
      selectedItemId: state.selection.selectedItem?.instanceId ?? null,
      selectedPlanOverlayId: state.plan.selectedPlanOverlayId,
      selectedPlanRoomId: state.plan.selectedPlanRoomId,
      selectedRotationDegrees: transforms.state.selectedRotationDegrees,
      selectedZoneId: state.plan.selectedZoneId,
      rotationSnapEnabled: configuration.rotationSnapEnabled,
      rotationSnapStepDegrees: configuration.rotationSnapStepDegrees,
      viewMode: state.editor.viewMode,
    },
    refs: {
      keyboardOwnership: configuration.keyboardOwnership,
      primaryId: refs.primaryId,
      selectedIds: refs.selectedIds,
    },
    actions: {
      setRotationInputValue: actions.productInspection.setRotationInputValue,
      clearAllSelection: actions.selection.clearAllSelection,
      placement: {
        cancel: actions.placement.cancel,
        confirm: actions.placement.confirm,
        rotate: actions.placement.rotate,
        nudge: actions.placement.nudge,
      },
      item: {
        duplicate: transforms.actions.duplicateSelectedItem,
        rotateByDegrees: transforms.actions.rotateSelectedByDegrees,
        resetRotation: transforms.actions.resetSelectedRotation,
        nudge: transforms.actions.nudgeSelectedItem,
      },
      room: actions.room.keyboard,
    },
  });
}

export function useDesignPageItemInteractionFacade({
  state,
  derived,
  configuration,
  refs,
  actions,
}: UseDesignPageItemInteractionFacadeInput) {
  const { items: itemsRef, selectedIds: selectedIdsRef, primaryId: primaryIdRef } =
    refs;
  const getSelectedItemPanelSelectedIds = useCallback(
    () => selectedIdsRef.current,
    [selectedIdsRef]
  );
  const getSelectedItemPanelItems = useCallback(
    () => itemsRef.current,
    [itemsRef]
  );
  const getSelectedItemPanelPrimaryId = useCallback(
    () => primaryIdRef.current,
    [primaryIdRef]
  );

  const transforms = useDesignPageSelectionTransforms({
    state: {
      selectedItem: state.selection.selectedItem,
      selectedProduct: state.selection.selectedProduct,
      selectedIds: state.selection.selectedIds,
      selectedItemPlanningDimensionsMm:
        state.selection.selectedItemPlanningDimensionsMm,
      selectedItemDeleteLabel: state.selection.selectedItemDeleteLabel,
      activeRoom: state.room.activeRoom,
      activeRoomShoppingItems: state.room.activeRoomShoppingItems,
      rotationInputValue: state.productInspection.rotationInputValue,
    },
    configuration: {
      canEdit: configuration.canEdit,
      isDesigner: configuration.isDesigner,
      roomWidth: configuration.roomWidth,
      roomDepth: configuration.roomDepth,
      wallThickness: configuration.wallThickness,
      rotationSnapEnabled: configuration.rotationSnapEnabled,
      rotationSnapStepRadians: configuration.rotationSnapStepRadians,
      activeRoomPlanOffset: derived.activeRoomPlanOffset,
      roomSnapshotById: derived.roomSnapshotById,
    },
    refs: {
      getItems: () => refs.items.current,
      getSelectedIds: () => refs.selectedIds.current,
      getPrimaryId: () => refs.primaryId.current,
      getDesignSnapshot: () => refs.designSnapshot.current,
      replaceActiveItemsSnapshot:
        actions.document.replaceActiveItemsSnapshot,
    },
    actions: {
      commitItems: actions.document.commitItems,
      updateSelection: actions.selection.updateSelection,
      createInstanceId: actions.document.createInstanceId,
      clampToActiveRoom: actions.placement.clampToActiveRoom,
      clampToCatalogPlacementRoom:
        actions.placement.clampToCatalogPlacementRoom,
      getItemAABB: actions.geometry.getItemAABB,
      getSelectionBounds: actions.geometry.getSelectionBounds,
      getPlanningDimensions: actions.geometry.getPlanningDimensions,
      findCatalogPlacementBlockerInRoom:
        actions.placement.findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom:
        actions.placement.isCatalogPlacementContainedInRoom,
      getItemDisplayName: actions.placement.getItemDisplayName,
      transferItemToRoom: actions.room.transferItemToRoom,
      setDesignSnapshot: actions.document.setDesignSnapshot,
      history: actions.history,
      showToast: actions.feedback.showToast,
      showConstraintsForMoment: actions.feedback.showConstraintsForMoment,
      showConfidenceSummary: actions.feedback.showConfidenceSummary,
      trackFirstInteraction: actions.feedback.trackFirstInteraction,
      setRotationInputValue:
        actions.productInspection.setRotationInputValue,
    },
  });

  useDesignPageItemInteractionKeyboard(
    { state, configuration, refs, actions },
    transforms
  );

  const selectedItemPanel = useDesignPageSelectedItemPanelController({
    state: {
      showInspectorDetails:
        state.productInspection.showInspectorDetails,
      showFullDimensions: state.productInspection.showFullDimensions,
      showDeliveryWarranty:
        state.productInspection.showDeliveryWarranty,
      showRotationControls: state.productInspection.showRotationControls,
      selectedIds: state.selection.selectedIds,
      selectedInstanceId: state.selection.selectedInstanceId,
      selectedItem: state.selection.selectedItem,
      selectedProduct: state.selection.selectedProduct,
      selectedResolvedVariant:
        state.productInspection.selectedResolvedVariant,
      style: state.presentation.style,
      designId: state.presentation.designId,
    },
    configuration: { catalogItems: configuration.catalogItems },
    refs: {
      getSelectedIds: getSelectedItemPanelSelectedIds,
      getItems: getSelectedItemPanelItems,
      getPrimaryId: getSelectedItemPanelPrimaryId,
    },
    actions: {
      setShowInspectorDetails:
        actions.productInspection.setShowInspectorDetails,
      setShowFullDimensions:
        actions.productInspection.setShowFullDimensions,
      setShowDeliveryWarranty:
        actions.productInspection.setShowDeliveryWarranty,
      setShowRotationControls:
        actions.productInspection.setShowRotationControls,
      moveSelectedItemToPosition:
        transforms.actions.moveSelectedItemToPosition,
      switchSelectedProductModel:
        actions.productInspection.switchSelectedProductModel,
      showToast: actions.feedback.showToast,
      commitItems: actions.document.commitItems,
      updateSelection: actions.selection.updateSelection,
    },
  });

  return {
    state: {
      selectedRotationDegrees: transforms.state.selectedRotationDegrees,
      rotateControlsDisabled: transforms.state.rotateControlsDisabled,
      selectedItemPanelControllerState: selectedItemPanel.state,
    },
    actions: {
      ...transforms.actions,
      selectedItemPanelControllerActions: selectedItemPanel.actions,
    },
  };
}
