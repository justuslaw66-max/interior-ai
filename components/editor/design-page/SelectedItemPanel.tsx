"use client";

import type { ComponentProps } from "react";

import SelectedItemDetailsPanel from "@/components/editor/SelectedItemDetailsPanel";
import SelectedItemRotationControls from "@/components/editor/SelectedItemRotationControls";
import {
  ProductFinishControls,
  type ProductFinishControlsActions,
  type ProductFinishControlsState,
} from "@/components/editor/design-page/ProductFinishControls";
import {
  ProductModelVariantControls,
  type ProductModelVariantControlsActions,
  type ProductModelVariantControlsState,
} from "@/components/editor/design-page/ProductModelVariantControls";

type SelectedItemDetailsPanelProps = ComponentProps<
  typeof SelectedItemDetailsPanel
>;
type SelectedItemRotationControlsProps = ComponentProps<
  typeof SelectedItemRotationControls
>;

export type SelectedItemPanelDetailsState = Pick<
  SelectedItemDetailsPanelProps,
  | "product"
  | "item"
  | "rooms"
  | "activeRoomId"
  | "measurementUnit"
  | "planningDimensionsMm"
  | "selectedBrand"
  | "selectedModelTitle"
  | "selectedCategoryDebugLabel"
  | "activeVariantLabel"
  | "productDetailSections"
  | "fullDimensionsDetails"
  | "selectedDimensionImageUrl"
  | "showInspectorDetails"
  | "showFullDimensions"
  | "showDeliveryWarranty"
  | "showRotationControls"
  | "styleConsistencyReport"
  | "adjustableHangingHeight"
>;

export type SelectedItemPanelDetailsActions = Pick<
  SelectedItemDetailsPanelProps,
  | "onToggleInspectorDetails"
  | "onToggleFullDimensions"
  | "onToggleDeliveryWarranty"
  | "onToggleRotationControls"
  | "onMoveToRoom"
  | "onDuplicate"
  | "onDelete"
  | "onCenterInRoom"
  | "onSnapToWall"
  | "onNudge"
  | "onSetPosition"
  | "onAdjustHangingHeight"
  | "onApplyStyleAlternative"
>;

export type SelectedItemPanelRotationState = Pick<
  SelectedItemRotationControlsProps,
  | "expanded"
  | "selectedRotationDegrees"
  | "rotationSnapEnabled"
  | "rotationSnapStepDegrees"
  | "rotationSnapPresetDegrees"
  | "rotationInputValue"
  | "disabled"
>;

export type SelectedItemPanelRotationActions = Pick<
  SelectedItemRotationControlsProps,
  | "onSnapPresetChange"
  | "onRotateByDegrees"
  | "onResetRotation"
  | "onRotationInputChange"
  | "onApplyRotationInput"
>;

export type SelectedItemPanelCommerceType =
  | "affiliate"
  | "shopify"
  | "not_buyable"
  | null;

export type SelectedItemPanelLockLabel =
  | "Lock"
  | "Unlock"
  | "Lock selected"
  | "Unlock selected";

export type SelectedItemPanelState = {
  details: SelectedItemPanelDetailsState;
  rotation: SelectedItemPanelRotationState | null;
  productModelVariants: ProductModelVariantControlsState;
  productFinishes: ProductFinishControlsState;
  commerceType: SelectedItemPanelCommerceType;
  lockLabel: SelectedItemPanelLockLabel;
};

export type SelectedItemPanelConfiguration = {
  dark: boolean;
  isDesigner: boolean;
  isClientPreview: boolean;
  canEdit: boolean;
};

export type SelectedItemPanelActions = {
  details: SelectedItemPanelDetailsActions;
  rotation: SelectedItemPanelRotationActions;
  productModelVariants: ProductModelVariantControlsActions;
  productFinishes: ProductFinishControlsActions;
  onSwapToCheaper: () => void;
  onUpgradeItem: () => void;
  onOpenCommerce: () => void;
  onToggleLock: () => void;
  onRemove: () => void;
};

export type SelectedItemPanelProps = {
  state: SelectedItemPanelState;
  configuration: SelectedItemPanelConfiguration;
  actions: SelectedItemPanelActions;
};

export function SelectedItemPanel({
  state,
  configuration,
  actions,
}: SelectedItemPanelProps) {
  const { dark, isDesigner, isClientPreview, canEdit } = configuration;
  const commerceAvailable =
    state.commerceType === "affiliate" || state.commerceType === "shopify";

  return (
    <div
      className={`absolute right-4 top-20 z-40 w-[320px] max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 transition-opacity duration-300 md:w-[21.25rem] ${
        isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={isClientPreview}
    >
      <div
        data-testid="selected-item-panel"
        className={
          dark
            ? "designer-panel designer-panel-strong w-full rounded-xl p-4"
            : "w-full rounded-xl bg-white p-4 shadow"
        }
      >
        <div
          className={
            dark
              ? "designer-text-primary text-sm font-semibold"
              : "text-sm font-semibold text-neutral-900"
          }
        >
          <div
            className={
              dark
                ? "designer-raised designer-divider sticky top-0 z-20 -mx-4 mb-2 border-b px-4 py-2"
                : "sticky top-0 z-20 -mx-4 mb-2 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur"
            }
          >
            Selected Item
          </div>
        </div>

        <SelectedItemDetailsPanel
          dark={dark}
          isDesigner={isDesigner}
          canEdit={canEdit}
          {...state.details}
          {...actions.details}
        />

        {state.rotation ? (
          <SelectedItemRotationControls
            dark={dark}
            isDesigner={isDesigner}
            {...state.rotation}
            {...actions.rotation}
          />
        ) : null}

        <ProductModelVariantControls
          state={state.productModelVariants}
          configuration={{ dark }}
          actions={actions.productModelVariants}
        />

        <ProductFinishControls
          state={state.productFinishes}
          configuration={{ dark }}
          actions={actions.productFinishes}
        />

        <button
          className={
            dark
              ? "designer-control mt-2 w-full rounded-lg border px-3 py-2 text-sm text-neutral-100"
              : "mt-2 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
          }
          disabled={!canEdit}
          onClick={actions.onSwapToCheaper}
        >
          Swap to cheaper
        </button>

        <button
          className={
            dark
              ? "mt-2 w-full rounded-lg border px-3 py-2 text-sm"
              : "mt-2 w-full rounded-lg border px-3 py-2 text-sm"
          }
          disabled={!canEdit}
          onClick={actions.onUpgradeItem}
        >
          Upgrade this item
        </button>

        <div className="pt-2 flex gap-2">
          {commerceAvailable ? (
            <button
              className="mt-3 w-full rounded-lg bg-green-600 px-3 py-2 text-sm text-white"
              onClick={actions.onOpenCommerce}
            >
              {state.commerceType === "affiliate" ? "View retailer" : "Buy now"}
            </button>
          ) : (
            <button
              className="mt-3 w-full rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-100"
              disabled
            >
              Needs commerce review
            </button>
          )}

          {isDesigner ? (
            <button
              className={
                dark
                  ? "rounded-lg border px-3 py-2 text-sm"
                  : "rounded-lg border px-3 py-2 text-sm text-neutral-900"
              }
              disabled={!canEdit}
              onClick={actions.onToggleLock}
            >
              {state.lockLabel}
            </button>
          ) : null}

          <button
            className={
              dark
                ? "designer-control rounded-lg border px-3 py-2 text-sm text-neutral-100"
                : "rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-900 hover:bg-neutral-200"
            }
            disabled={!canEdit}
            onClick={actions.onRemove}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
