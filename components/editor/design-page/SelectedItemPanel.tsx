"use client";

import { type ComponentProps } from "react";
import { X } from "lucide-react";

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
import { SelectedItemActionRow, SelectedItemSwaps } from "@/components/editor/design-page/SelectedItemQuickActions";
import { SelectedItemSummaryCard } from "@/components/editor/design-page/SelectedItemSummaryCard";
import type { SelectedItemSummary } from "@/lib/selected-item-summary";

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
  | "styleConsistencyReport"
  | "adjustableHangingHeight"
>;

export type SelectedItemPanelDetailsActions = Pick<
  SelectedItemDetailsPanelProps,
  | "onToggleInspectorDetails"
  | "onToggleFullDimensions"
  | "onToggleDeliveryWarranty"
  | "onMoveToRoom"
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

export type SelectedItemPanelLockLabel =
  | "Lock"
  | "Unlock"
  | "Lock selected"
  | "Unlock selected";

export type SelectedItemPanelState = {
  details: SelectedItemPanelDetailsState;
  /** Picture, price, where it's sold, size and the named swaps (lib/selected-item-summary.ts). */
  summary: SelectedItemSummary;
  rotation: SelectedItemPanelRotationState | null;
  productModelVariants: ProductModelVariantControlsState;
  productFinishes: ProductFinishControlsState;
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
  onToggleRotation: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDeselect: () => void;
  onSwapToCheaper: () => void;
  onSwapToPricier: () => void;
  onViewProduct: () => void;
  onToggleLock: () => void;
};

export type SelectedItemPanelProps = {
  state: SelectedItemPanelState;
  configuration: SelectedItemPanelConfiguration;
  actions: SelectedItemPanelActions;
};

type SelectedItemPanelHeaderProps = {
  title: string;
  isDesigner: boolean;
  canEdit: boolean;
  lockLabel: SelectedItemPanelLockLabel;
  onToggleLock: () => void;
  onDeselect: () => void;
};

/** "Selected", Pro's Lock, and Deselect (the mockup's ×), kept in view while the panel scrolls. */
function SelectedItemPanelHeader({ title, isDesigner, canEdit, lockLabel, onToggleLock, onDeselect }: SelectedItemPanelHeaderProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-3 rounded-t-xl border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur">
      <span className="text-[13px] font-bold text-neutral-600">Selected</span>
      <div className="flex items-center gap-1">
        {isDesigner ? (
          <button
            type="button"
            disabled={!canEdit}
            onClick={onToggleLock}
            className="min-h-8 rounded-lg border border-neutral-200 px-3 text-xs font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
          >
            {lockLabel}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="selected-item-deselect"
          aria-label={`Deselect ${title}`}
          onClick={onDeselect}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 md:h-8 md:w-8"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * The one item panel (UX audit FU12), as in the Furnish mockup: the product (picture, name, price,
 * where it's sold), its colour and size, Rotate / Duplicate / Remove, named swaps, then the product's
 * details and the placement tools. The shop's own words ("External retailer", "Check stock") and the
 * second Delete are gone.
 */
export function SelectedItemPanel({ state, configuration, actions }: SelectedItemPanelProps) {
  const { dark, isDesigner, isClientPreview, canEdit } = configuration;
  const { details, summary } = state;
  const title = details.selectedModelTitle || summary.title;
  const locked = Boolean(details.item?.locked);
  const editsDisabled = !canEdit || !details.item || (isDesigner && locked);

  return (
    <div
      className={`absolute right-4 top-bar-17 z-40 md:top-bar-6 w-[320px] max-h-[calc(100vh-12.75rem-env(safe-area-inset-bottom))] overflow-y-auto pr-1 transition-opacity duration-300 md:max-h-[calc(100vh-var(--editor-bar-h)-2.5rem)] md:w-[21.25rem] ${
        isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={isClientPreview}
    >
      <section
        data-testid="selected-item-panel" data-touch-area
        aria-label="Selected product"
        className={
          dark
            ? "designer-panel designer-panel-strong flex w-full flex-col gap-4 rounded-xl p-4"
            : "flex w-full flex-col gap-4 rounded-xl bg-white p-4 shadow"
        }
      >
        <SelectedItemPanelHeader
          title={title}
          isDesigner={isDesigner}
          canEdit={canEdit}
          lockLabel={state.lockLabel}
          onToggleLock={actions.onToggleLock}
          onDeselect={actions.onDeselect}
        />
        <SelectedItemSummaryCard summary={summary} title={title} locked={locked} onViewProduct={actions.onViewProduct} />
        <SelectedItemOptions state={state} dark={dark} actions={actions} />
        <SelectedItemActionRow
          rotationOpen={state.rotation?.expanded ?? false}
          canRotate={Boolean(state.rotation)}
          disabled={editsDisabled}
          onRotate={actions.onToggleRotation}
          onDuplicate={actions.onDuplicate}
          onRemove={actions.onRemove}
        />
        {state.rotation ? (
          <SelectedItemRotationControls dark={dark} isDesigner={isDesigner} {...state.rotation} {...actions.rotation} />
        ) : null}
        <SelectedItemSwaps
          cheaper={summary.swaps.cheaper}
          pricier={summary.swaps.pricier}
          disabled={editsDisabled}
          onSwapToCheaper={actions.onSwapToCheaper}
          onSwapToPricier={actions.onSwapToPricier}
        />
        <SelectedItemDetailsPanel dark={dark} isDesigner={isDesigner} canEdit={canEdit} {...details} {...actions.details} />
      </section>
    </div>
  );
}

/** The product's configuration and colour pickers, then its size in the design's units. */
function SelectedItemOptions({
  state,
  dark,
  actions,
}: {
  state: SelectedItemPanelState;
  dark: boolean;
  actions: SelectedItemPanelActions;
}) {
  return (
    <div className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-neutral-900">Size</span>
        <span data-testid="selected-item-dimensions" className="text-[13px] text-neutral-700">
          {state.summary.sizeLabel}
        </span>
      </div>
    </div>
  );
}
