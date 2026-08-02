"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { track } from "@/lib/analytics";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { useDesignPageConfigState } from "@/lib/design-page-config-state";
import {
  PRODUCT_DETAIL_SECTIONS_BY_PRODUCT_ID,
} from "@/lib/design-page-product-data";
import { buildProductInfoSections } from "@/lib/design-page-product-info";
import {
  clampPendantHeightCm,
  getAdjustablePendantHeight,
} from "@/lib/pendant-light-adjustment";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { evaluateStyleConsistency } from "@/lib/style-consistency";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import { useDesignPageProductConfiguration } from "@/lib/useDesignPageProductConfiguration";
import { useDesignPageProductSelectorState } from "@/lib/useDesignPageProductSelectorState";

type DesignPageConfigState = ReturnType<typeof useDesignPageConfigState>;
type DesignPageProductConfiguration = ReturnType<
  typeof useDesignPageProductConfiguration
>;

export type DesignPageRotationSnapPresetDegrees = 15 | 5 | 0;

export type DesignPageProductInspectionControllerState = {
  items: DesignItem[];
  selectedItem: DesignItem | null;
  selectedInstanceId: string | null;
  activeRoom: RoomSnapshot | null;
  editorMode: DesignPageEditorMode;
};

export type DesignPageProductInspectionControllerConfiguration = {
  catalogItems: typeof CATALOG_ITEMS;
  importedModelOptions: ImportedModelOption[];
  importedCatalogByProductId?: Record<
    string,
    NonNullable<ImportedModelOption["catalog"]>
  >;
  importedModelUrlByAssetId: Record<string, string>;
  canEdit: boolean;
  isClientPreview: boolean;
  liveCatalogReady: boolean;
};

export type DesignPageProductInspectionControllerActions = {
  clearAllSelection: () => void;
  commitItems: (
    updater: DesignItem[] | ((previous: DesignItem[]) => DesignItem[]),
    actionName?: string
  ) => void;
  ensureImportedCatalogItem: (productId: string) => void;
  setHoveredCartInstanceId: (instanceId: string | null) => void;
};

export type UseDesignPageProductInspectionControllerInput = {
  state: DesignPageProductInspectionControllerState;
  configuration: DesignPageProductInspectionControllerConfiguration;
  actions: DesignPageProductInspectionControllerActions;
};

export type DesignPageProductInspectionState = {
  showInspectorDetails: boolean;
  showFullDimensions: boolean;
  showDeliveryWarranty: boolean;
  showRotationControls: boolean;
  rotationInputValue: string;
  rotationSnapPresetDegrees: DesignPageRotationSnapPresetDegrees;
  rotationSnapEnabled: boolean;
  rotationSnapStepDegrees: number;
  rotationSnapStepRadians: number;
  previewVariantId: DesignPageProductConfiguration["state"]["previewVariantId"];
  previewMaterialPresetId: DesignPageProductConfiguration["state"]["previewMaterialPresetId"];
  productModelVariantControlsState: DesignPageProductConfiguration["state"]["productModelVariantControlsState"];
  productFinishControlsState: DesignPageProductConfiguration["state"]["productFinishControlsState"];
};

export type DesignPageProductInspectionDerived = {
  selectedProduct: DesignPageConfigState["selectedProduct"];
  selectedBrand: string | null;
  selectedModelTitle: string | null;
  activeVariantLabel: string | null;
  selectedCategoryDebugLabel: string | null;
  selectedResolvedVariant: ReturnType<typeof resolveCatalogVariant> | null;
  selectedItemPlanningDimensionsMm: { w: number; d: number; h: number } | null;
  selectedAdjustablePendantHeight: ReturnType<
    typeof getAdjustablePendantHeight
  >;
  selectedStyleConsistencyReport: ReturnType<
    typeof evaluateStyleConsistency
  >;
  selectedProductDetailSections: ReturnType<typeof buildProductInfoSections>;
  selectedDimensionImageUrl: string | null;
  fullDimensionsDetails: DesignPageConfigState["fullDimensionsDetails"];
  itemPlanningBoundsByInstanceId: DesignPageConfigState["itemPlanningBoundsByInstanceId"];
};

export type DesignPageProductInspectionActions = {
  setShowInspectorDetails: Dispatch<SetStateAction<boolean>>;
  setShowFullDimensions: Dispatch<SetStateAction<boolean>>;
  setShowDeliveryWarranty: Dispatch<SetStateAction<boolean>>;
  setShowRotationControls: Dispatch<SetStateAction<boolean>>;
  setRotationInputValue: Dispatch<SetStateAction<string>>;
  setRotationSnapPresetDegrees: Dispatch<
    SetStateAction<DesignPageRotationSnapPresetDegrees>
  >;
  adjustSelectedPendantHeight: (heightCm: number) => void;
  switchSelectedProductModel: DesignPageProductConfiguration["actions"]["switchSelectedProductModel"];
  modelControls: DesignPageProductConfiguration["actions"]["modelControls"];
  finishControls: DesignPageProductConfiguration["actions"]["finishControls"];
};

export type DesignPageProductInspectionResolvers = Pick<
  DesignPageConfigState,
  | "resolveItemConfigurationEntry"
  | "resolveConfiguredVisualDimsMm"
  | "resolveConfiguredPlanningDimsMm"
  | "resolveConfiguredNodeTransforms"
  | "resolveConfiguredModelUrl"
>;

export type UseDesignPageProductInspectionControllerOutput = {
  state: DesignPageProductInspectionState;
  derived: DesignPageProductInspectionDerived;
  actions: DesignPageProductInspectionActions;
  resolvers: DesignPageProductInspectionResolvers;
};

export function useDesignPageProductInspectionController({
  state,
  configuration,
  actions,
}: UseDesignPageProductInspectionControllerInput): UseDesignPageProductInspectionControllerOutput {
  const {
    items,
    selectedItem,
    selectedInstanceId,
    activeRoom,
    editorMode,
  } = state;
  const {
    catalogItems,
    importedModelOptions,
    importedCatalogByProductId,
    importedModelUrlByAssetId,
    canEdit,
    isClientPreview,
    liveCatalogReady,
  } = configuration;
  const {
    clearAllSelection,
    commitItems,
    ensureImportedCatalogItem,
    setHoveredCartInstanceId,
  } = actions;

  const [showInspectorDetails, setShowInspectorDetails] = useState(false);
  const [showFullDimensions, setShowFullDimensions] = useState(false);
  const [showDeliveryWarranty, setShowDeliveryWarranty] = useState(false);
  const [showRotationControls, setShowRotationControls] = useState(false);
  const [itemConfigurationByInstanceId, setItemConfigurationByInstanceId] =
    useState<Record<string, string>>({});
  const [rotationInputValue, setRotationInputValue] = useState("0");
  const [rotationSnapPresetDegrees, setRotationSnapPresetDegrees] =
    useState<DesignPageRotationSnapPresetDegrees>(15);

  useEffect(() => {
    // The selector cache is stateful because configuration controls write to it;
    // reconcile it when document membership or explicit configuration changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemConfigurationByInstanceId((previous) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const item of items) {
        const explicit = item.configurationCode?.trim();
        const tracked = previous[item.instanceId];
        const value = explicit || tracked;
        if (value) next[item.instanceId] = value;
      }

      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (previousKeys.length !== nextKeys.length) changed = true;
      if (!changed) {
        for (const key of nextKeys) {
          if (next[key] !== previous[key]) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : previous;
    });
  }, [items]);

  const rotationSnapEnabled = rotationSnapPresetDegrees > 0;
  const rotationSnapStepDegrees = rotationSnapEnabled
    ? rotationSnapPresetDegrees
    : 1;
  const rotationSnapStepRadians = (rotationSnapStepDegrees * Math.PI) / 180;

  useEffect(() => {
    if (!isClientPreview) return;
    clearAllSelection();
  }, [clearAllSelection, isClientPreview]);

  const configState = useDesignPageConfigState({
    importedModelOptions,
    importedCatalogByProductId,
    itemConfigurationByInstanceId,
    importedModelUrlByAssetId,
    selectedItem,
    items,
    catalogItems,
  });
  const {
    importedModelById,
    resolveItemConfigurationEntry,
    resolveConfiguredVisualDimsMm,
    resolveConfiguredPlanningDimsMm,
    resolveConfiguredNodeTransforms,
    resolveConfiguredModelUrl,
    selectedProduct,
    selectedImportedCatalog,
    selectedConfigurationCode,
    selectedConfigUi,
    selectedConfigOptions,
    selectedConfigEntry,
    selectedConfigBehavior,
    fullDimensionsDetails,
    itemPlanningBoundsByInstanceId,
  } = configState;

  const productSelectorState = useDesignPageProductSelectorState({
    selectedProduct,
    selectedItem,
    catalogItems,
  });
  const {
    selectedBrand,
    selectedModelTitle,
    activeVariantLabel,
    selectedCategoryDebugLabel,
  } = productSelectorState;

  const selectedResolvedVariant = useMemo(() => {
    if (!selectedProduct) return null;
    return resolveCatalogVariant(selectedProduct, selectedItem?.variantId);
  }, [selectedItem?.variantId, selectedProduct]);

  const selectedItemPlanningDimensionsMm = useMemo(() => {
    if (!selectedItem || !selectedProduct) return null;
    return resolveConfiguredPlanningDimsMm(selectedItem, selectedProduct);
  }, [resolveConfiguredPlanningDimsMm, selectedItem, selectedProduct]);

  const selectedAdjustablePendantHeight = useMemo(
    () => getAdjustablePendantHeight(selectedProduct, selectedItem),
    [selectedItem, selectedProduct]
  );

  const adjustSelectedPendantHeight = useCallback(
    (heightCm: number) => {
      if (
        !selectedItem ||
        !selectedAdjustablePendantHeight ||
        isClientPreview ||
        !liveCatalogReady
      ) {
        return;
      }
      const nextHeightCm = clampPendantHeightCm(
        heightCm,
        selectedAdjustablePendantHeight
      );
      if (
        Math.abs(nextHeightCm - selectedAdjustablePendantHeight.currentCm) <
        0.05
      ) {
        return;
      }
      commitItems(
        (previous) =>
          previous.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? { ...item, hangingHeightCm: nextHeightCm }
              : item
          ),
        "Adjust pendant hanging height"
      );
      track("pendant_hanging_height_changed", {
        productId: selectedProduct?.id,
        heightCm: nextHeightCm,
      });
    },
    [
      commitItems,
      isClientPreview,
      liveCatalogReady,
      selectedAdjustablePendantHeight,
      selectedItem,
      selectedProduct?.id,
    ]
  );

  const selectedStyleConsistencyReport = useMemo(() => {
    if (!selectedItem || !activeRoom) return null;
    return evaluateStyleConsistency({
      room: activeRoom,
      selectedItem,
      catalogItems,
    });
  }, [activeRoom, catalogItems, selectedItem]);

  const selectedProductDetailSections = useMemo(
    () =>
      buildProductInfoSections({
        selectedProduct,
        selectedItem,
        selectedImportedCatalog,
        override: selectedProduct
          ? PRODUCT_DETAIL_SECTIONS_BY_PRODUCT_ID[selectedProduct.id] ?? null
          : null,
      }),
    [selectedImportedCatalog, selectedItem, selectedProduct]
  );

  const selectedDimensionImageUrl = useMemo(() => {
    if (!selectedProduct) return null;
    const activeVariant =
      selectedProduct.variants.find(
        (variant) => variant.id === selectedItem?.variantId
      ) ?? selectedProduct.variants[0];
    const images = [
      ...(activeVariant?.galleryImages ?? []),
      ...(selectedProduct.metadata?.galleryImages ?? []),
    ];
    return images.find((url) => /(?:-|_)dim(?:-|_|\.)/i.test(url)) ?? null;
  }, [selectedItem?.variantId, selectedProduct]);

  const productConfiguration = useDesignPageProductConfiguration({
    state: {
      selectedItem,
      selectedProduct,
      importedModelById,
      selector: productSelectorState,
    },
    actions: {
      commitItems,
      ensureImportedCatalogItem,
      setItemConfigurationByInstanceId,
    },
    configuration: {
      canEdit,
      selectedConfigurationCode,
      selectedConfigUi,
      selectedConfigOptions,
      selectedConfigEntry,
      selectedConfigBehavior,
    },
  });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- A new primary selection intentionally collapses every disclosure section. */
    setShowInspectorDetails(false);
    setShowFullDimensions(false);
    setShowDeliveryWarranty(false);
    setShowRotationControls(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedInstanceId]);

  useEffect(() => {
    if (editorMode !== "buy") {
      setHoveredCartInstanceId(null);
    }
  }, [editorMode, setHoveredCartInstanceId]);

  return {
    state: {
      showInspectorDetails,
      showFullDimensions,
      showDeliveryWarranty,
      showRotationControls,
      rotationInputValue,
      rotationSnapPresetDegrees,
      rotationSnapEnabled,
      rotationSnapStepDegrees,
      rotationSnapStepRadians,
      previewVariantId: productConfiguration.state.previewVariantId,
      previewMaterialPresetId:
        productConfiguration.state.previewMaterialPresetId,
      productModelVariantControlsState:
        productConfiguration.state.productModelVariantControlsState,
      productFinishControlsState:
        productConfiguration.state.productFinishControlsState,
    },
    derived: {
      selectedProduct,
      selectedBrand,
      selectedModelTitle,
      activeVariantLabel,
      selectedCategoryDebugLabel,
      selectedResolvedVariant,
      selectedItemPlanningDimensionsMm,
      selectedAdjustablePendantHeight,
      selectedStyleConsistencyReport,
      selectedProductDetailSections,
      selectedDimensionImageUrl,
      fullDimensionsDetails,
      itemPlanningBoundsByInstanceId,
    },
    actions: {
      setShowInspectorDetails,
      setShowFullDimensions,
      setShowDeliveryWarranty,
      setShowRotationControls,
      setRotationInputValue,
      setRotationSnapPresetDegrees,
      adjustSelectedPendantHeight,
      switchSelectedProductModel:
        productConfiguration.actions.switchSelectedProductModel,
      modelControls: productConfiguration.actions.modelControls,
      finishControls: productConfiguration.actions.finishControls,
    },
    resolvers: {
      resolveItemConfigurationEntry,
      resolveConfiguredVisualDimsMm,
      resolveConfiguredPlanningDimsMm,
      resolveConfiguredNodeTransforms,
      resolveConfiguredModelUrl,
    },
  };
}
