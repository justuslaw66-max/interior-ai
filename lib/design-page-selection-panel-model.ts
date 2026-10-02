import type { SelectedCabinetPanelProps } from "@/components/editor/design-page/SelectedCabinetPanel";
import type { SelectedItemPanelProps } from "@/components/editor/design-page/SelectedItemPanel";
import {
  buildSelectedItemSummary,
  NO_SELECTED_ITEM_SUMMARY,
  type BuildSelectedItemSummaryInput,
} from "@/lib/selected-item-summary";

type ItemDetailsState = SelectedItemPanelProps["state"]["details"];
type ItemRotationState = NonNullable<
  SelectedItemPanelProps["state"]["rotation"]
>;
type ItemDetailsActions = SelectedItemPanelProps["actions"]["details"];
type ItemActions = SelectedItemPanelProps["actions"];
type ModelActions = SelectedItemPanelProps["actions"]["productModelVariants"];
type FinishActions = SelectedItemPanelProps["actions"]["productFinishes"];

type ProductModelControlSources = {
  handleSelectProductOrientation: ModelActions["onSelectOrientation"];
  handleSelectJaronConfigurationGroup: ModelActions["jaron"]["onSelectGroup"];
  handleSelectJaronConfigurationOption: ModelActions["jaron"]["onSelectOption"];
  handleSelectJaronArm: ModelActions["jaron"]["onSelectArm"];
  handleSelectAuburnConfigurationGroup: ModelActions["auburn"]["onSelectGroup"];
  handleSelectAuburnConfigurationOption: ModelActions["auburn"]["onSelectOption"];
  handleSelectAuburnOrientation: ModelActions["auburn"]["onSelectOrientation"];
  handleSelectArmStyleVariant: ModelActions["onSelectArmStyle"];
  handleSelectProductModelVariant: ModelActions["onSelectModel"];
  handleSelectProductShapeVariant: ModelActions["onSelectShape"];
  handleSelectProductLengthVariant: ModelActions["onSelectLengthVariant"];
  handleSelectSloaneBenchCushion: ModelActions["onSelectSloaneBenchCushion"];
  handleSelectProductLength: ModelActions["onSelectLength"];
  handleSelectHuggModel: ModelActions["onSelectHuggModel"];
  handleSelectSebModel: ModelActions["onSelectSebModel"];
  handleSelectProductConfiguration: ModelActions["onSelectLayout"];
};

type ProductFinishControlSources = {
  handleSelectFinishButton: FinishActions["onSelectFinishButton"];
  handleSelectFinishSwatch: FinishActions["onSelectFinishSwatch"];
  handleSelectLegFinish: FinishActions["onSelectLegFinish"];
  handleSelectProductSize: FinishActions["onSelectSize"];
  handleSelectStructuredColour: FinishActions["onSelectStructuredColour"];
  handleShowStructuredColourPreview: FinishActions["onShowStructuredColourPreview"];
  handleHideStructuredColourPreview: FinishActions["onHideStructuredColourPreview"];
  handleBlurStructuredColourPreview: FinishActions["onBlurStructuredColourPreview"];
};

export type BuildDesignPageSelectionPanelModelsInput = {
  cabinet: {
    state: Pick<SelectedCabinetPanelProps, "measurementUnit" | "cabinet" | "project">;
    configuration: SelectedCabinetPanelProps["access"];
    actions: SelectedCabinetPanelProps["actions"];
  };
  item: {
    state: {
      document: Pick<ItemDetailsState, "rooms" | "activeRoomId">;
      details: Omit<
        ItemDetailsState,
        | "rooms"
        | "activeRoomId"
        | "showInspectorDetails"
        | "showFullDimensions"
        | "showDeliveryWarranty"
        | "adjustableHangingHeight"
      >;
      /** What the summary also needs: the design's style (for swaps) and the product's planning size. */
      summarySource: Pick<BuildSelectedItemSummaryInput, "style" | "planningDimensionsMm">;
      rotation: {
        enabled: boolean;
        state: Omit<ItemRotationState, "expanded">;
      };
      productModelVariants: SelectedItemPanelProps["state"]["productModelVariants"];
      productFinishes: SelectedItemPanelProps["state"]["productFinishes"];
      inspectionController: {
        state: Pick<
          ItemDetailsState,
          | "showInspectorDetails"
          | "showFullDimensions"
          | "showDeliveryWarranty"
        > & {
          showRotationControls: boolean;
          selectedItemLockLabel: SelectedItemPanelProps["state"]["lockLabel"];
        };
        adjustableHangingHeight: ItemDetailsState["adjustableHangingHeight"];
      };
    };
    configuration: SelectedItemPanelProps["configuration"];
    actions: {
      inspectionController: {
        toggleSelectedItemDetails: ItemDetailsActions["onToggleInspectorDetails"];
        toggleSelectedItemDimensions: ItemDetailsActions["onToggleFullDimensions"];
        toggleSelectedItemDeliveryWarranty: ItemDetailsActions["onToggleDeliveryWarranty"];
        toggleSelectedItemRotationControls: ItemActions["onToggleRotation"];
        setSelectedItemPosition: ItemDetailsActions["onSetPosition"];
        applySelectedItemStyleAlternative: ItemDetailsActions["onApplyStyleAlternative"];
        swapSelectedItemToCheaper: ItemActions["onSwapToCheaper"];
        swapSelectedItemToPricier: ItemActions["onSwapToPricier"];
        openSelectedItemCommerce: ItemActions["onViewProduct"];
        toggleSelectedItemLock: ItemActions["onToggleLock"];
      };
      placement: Pick<
        ItemDetailsActions,
        | "onMoveToRoom"
        | "onCenterInRoom"
        | "onSnapToWall"
        | "onNudge"
        | "onAdjustHangingHeight"
      > & {
        onDuplicate: ItemActions["onDuplicate"];
        /** The one Remove: the placement's delete, recorded as "Remove <product>" (FU12, ED3). */
        onDelete: ItemActions["onRemove"];
      };
      selection: { clearAllSelection: ItemActions["onDeselect"] };
      rotation: SelectedItemPanelProps["actions"]["rotation"];
      productConfiguration: {
        model: ProductModelControlSources;
        finish: ProductFinishControlSources;
        selectVariant: ModelActions["onSelectVariant"];
      };
    };
  };
};

export type DesignPageSelectionPanelModels = {
  selectedCabinet: SelectedCabinetPanelProps;
  selectedItem: SelectedItemPanelProps;
};

/** Picture, price, where it's sold, size and the named swaps; nothing while no product is selected. */
function selectedItemSummaryOf(
  state: BuildDesignPageSelectionPanelModelsInput["item"]["state"]
): SelectedItemPanelProps["state"]["summary"] {
  const { product, item, measurementUnit } = state.details;
  if (!product) return NO_SELECTED_ITEM_SUMMARY;
  return buildSelectedItemSummary({ product, item, measurementUnit, ...state.summarySource });
}

/** Builds both mutually-exclusive selection inspectors from domain groups. */
export function buildDesignPageSelectionPanelModels({
  cabinet,
  item,
}: BuildDesignPageSelectionPanelModelsInput): DesignPageSelectionPanelModels {
  const { onDuplicate, onDelete, ...placementDetails } = item.actions.placement;
  return {
    selectedCabinet: {
      ...cabinet.state,
      access: cabinet.configuration,
      actions: cabinet.actions,
    },
    selectedItem: {
      state: {
        details: {
          ...item.state.document,
          ...item.state.details,
          showInspectorDetails:
            item.state.inspectionController.state.showInspectorDetails,
          showFullDimensions:
            item.state.inspectionController.state.showFullDimensions,
          showDeliveryWarranty:
            item.state.inspectionController.state.showDeliveryWarranty,
          adjustableHangingHeight:
            item.state.inspectionController.adjustableHangingHeight,
        },
        rotation: item.state.rotation.enabled
          ? {
              expanded:
                item.state.inspectionController.state.showRotationControls,
              ...item.state.rotation.state,
            }
          : null,
        summary: selectedItemSummaryOf(item.state),
        productModelVariants: item.state.productModelVariants,
        productFinishes: item.state.productFinishes,
        lockLabel: item.state.inspectionController.state.selectedItemLockLabel,
      },
      configuration: item.configuration,
      actions: {
        details: {
          onToggleInspectorDetails:
            item.actions.inspectionController.toggleSelectedItemDetails,
          onToggleFullDimensions:
            item.actions.inspectionController.toggleSelectedItemDimensions,
          onToggleDeliveryWarranty:
            item.actions.inspectionController.toggleSelectedItemDeliveryWarranty,
          ...placementDetails,
          onSetPosition:
            item.actions.inspectionController.setSelectedItemPosition,
          onApplyStyleAlternative:
            item.actions.inspectionController.applySelectedItemStyleAlternative,
        },
        rotation: item.actions.rotation,
        productModelVariants: {
          onSelectOrientation:
            item.actions.productConfiguration.model
              .handleSelectProductOrientation,
          jaron: {
            onSelectGroup:
              item.actions.productConfiguration.model
                .handleSelectJaronConfigurationGroup,
            onSelectOption:
              item.actions.productConfiguration.model
                .handleSelectJaronConfigurationOption,
            onSelectArm:
              item.actions.productConfiguration.model.handleSelectJaronArm,
          },
          auburn: {
            onSelectGroup:
              item.actions.productConfiguration.model
                .handleSelectAuburnConfigurationGroup,
            onSelectOption:
              item.actions.productConfiguration.model
                .handleSelectAuburnConfigurationOption,
            onSelectOrientation:
              item.actions.productConfiguration.model
                .handleSelectAuburnOrientation,
          },
          onSelectArmStyle:
            item.actions.productConfiguration.model.handleSelectArmStyleVariant,
          onSelectModel:
            item.actions.productConfiguration.model
              .handleSelectProductModelVariant,
          onSelectShape:
            item.actions.productConfiguration.model
              .handleSelectProductShapeVariant,
          onSelectLengthVariant:
            item.actions.productConfiguration.model
              .handleSelectProductLengthVariant,
          onSelectSloaneBenchCushion:
            item.actions.productConfiguration.model
              .handleSelectSloaneBenchCushion,
          onSelectVariant: item.actions.productConfiguration.selectVariant,
          onSelectLength:
            item.actions.productConfiguration.model.handleSelectProductLength,
          onSelectHuggModel:
            item.actions.productConfiguration.model.handleSelectHuggModel,
          onSelectSebModel:
            item.actions.productConfiguration.model.handleSelectSebModel,
          onSelectLayout:
            item.actions.productConfiguration.model
              .handleSelectProductConfiguration,
        },
        productFinishes: {
          onSelectFinishButton:
            item.actions.productConfiguration.finish.handleSelectFinishButton,
          onSelectFinishSwatch:
            item.actions.productConfiguration.finish.handleSelectFinishSwatch,
          onSelectLegFinish:
            item.actions.productConfiguration.finish.handleSelectLegFinish,
          onSelectSloaneBenchCushion:
            item.actions.productConfiguration.model
              .handleSelectSloaneBenchCushion,
          onSelectSize:
            item.actions.productConfiguration.finish.handleSelectProductSize,
          onSelectStructuredColour:
            item.actions.productConfiguration.finish
              .handleSelectStructuredColour,
          onShowStructuredColourPreview:
            item.actions.productConfiguration.finish
              .handleShowStructuredColourPreview,
          onHideStructuredColourPreview:
            item.actions.productConfiguration.finish
              .handleHideStructuredColourPreview,
          onBlurStructuredColourPreview:
            item.actions.productConfiguration.finish
              .handleBlurStructuredColourPreview,
        },
        onToggleRotation:
          item.actions.inspectionController.toggleSelectedItemRotationControls,
        onDuplicate,
        onRemove: onDelete,
        onDeselect: item.actions.selection.clearAllSelection,
        onSwapToCheaper:
          item.actions.inspectionController.swapSelectedItemToCheaper,
        onSwapToPricier:
          item.actions.inspectionController.swapSelectedItemToPricier,
        onViewProduct:
          item.actions.inspectionController.openSelectedItemCommerce,
        onToggleLock:
          item.actions.inspectionController.toggleSelectedItemLock,
      },
    },
  };
}
