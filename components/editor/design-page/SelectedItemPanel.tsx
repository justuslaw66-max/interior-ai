"use client";

import { type ComponentProps } from "react";
import { createPortal } from "react-dom";

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
import { SelectedItemPanelHeader, type SelectedItemPanelLockLabel } from "@/components/editor/design-page/SelectedItemPanelHeader";
import { ProductLightControls } from "@/components/editor/design-page/ProductLightControls";
import type { ProductFixtureLight } from "@/lib/product-fixture-light";
import type { PlacedFixtureLightState } from "@/lib/room-types";
import type { SelectedItemSummary } from "@/lib/selected-item-summary";
import { isLayoutBlock, type LayoutBlockPatch } from "@/lib/layout-blocks";
import { LayoutBlockFields } from "@/components/editor/design-page/LayoutBlockFields";
import { selectedItemPanelFrameClass, useSelectedItemPanelPlacement } from "@/components/editor/design-page/selectedItemPanelPlacement";

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

export type { SelectedItemPanelLockLabel };

export type SelectedItemPanelState = {
  details: SelectedItemPanelDetailsState;
  /** Picture, price, where it's sold, size and the named swaps (lib/selected-item-summary.ts). */
  summary: SelectedItemSummary;
  rotation: SelectedItemPanelRotationState | null;
  productModelVariants: ProductModelVariantControlsState;
  productFinishes: ProductFinishControlsState;
  lockLabel: SelectedItemPanelLockLabel;
  /** A lamp's light, for Pro (UX 4f): the controls left Plan's inspector for this panel. */
  light?: ProductFixtureLight | null;
};

export type SelectedItemPanelConfiguration = {
  isDesigner: boolean;
  isClientPreview: boolean;
  canEdit: boolean;
  /** The product lists have loaded: a swap picks another product, so it waits for them. */
  canChangeProducts: boolean;
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
  onChangeLight?: (patch: PlacedFixtureLightState) => void;
  /** A layout block's name and size (lib/layout-blocks.ts). */
  onUpdateLayoutBlock: (patch: LayoutBlockPatch) => void;
  /** The design's measuring unit, from the block's size fields as from Plan (J, 13 Nov 2026). */
  onMeasurementUnitChange: (unit: SelectedItemPanelDetailsState["measurementUnit"]) => void;
};

export type SelectedItemPanelProps = {
  state: SelectedItemPanelState;
  configuration: SelectedItemPanelConfiguration;
  actions: SelectedItemPanelActions;
};

/**
 * The one item panel (UX audit FU12), as in the Furnish mockup: the product (picture, name, price,
 * where it's sold), its colour and size, Rotate / Duplicate / Remove, named swaps, then the product's
 * details and the placement tools. The shop's own words ("External retailer", "Check stock") and the
 * second Delete are gone.
 */
export function SelectedItemPanel({ state, configuration, actions }: SelectedItemPanelProps) {
  const { isDesigner, isClientPreview, canEdit, canChangeProducts } = configuration;
  const { details, summary } = state;
  const title = details.selectedModelTitle || summary.title;
  const locked = Boolean(details.item?.locked);
  const editsDisabled = !canEdit || !details.item || locked;
  const placement = useSelectedItemPanelPlacement(isClientPreview);

  const panel = (
    <div className={selectedItemPanelFrameClass(placement.inSheet, isClientPreview)} aria-hidden={isClientPreview}>
      <section
        data-testid="selected-item-panel" data-touch-area data-surface={placement.inSheet ? undefined : "floating"}
        aria-label="Selected product"
        className={`flex w-full flex-col gap-4 rounded-xl p-4 ${placement.inSheet ? "bg-surface-secondary ring-1 ring-box-border" : "bg-surface-floating shadow ring-1 ring-surface-floating-edge"}`}
      >
        <SelectedItemPanelHeader
          title={title}
          canEdit={canEdit}
          lockLabel={state.lockLabel}
          onToggleLock={actions.onToggleLock}
          onDeselect={actions.onDeselect}
        />
        <SelectedItemSummaryCard summary={summary} title={title} locked={locked} onViewProduct={actions.onViewProduct} />
        <SelectedItemOptions state={state} actions={actions} disabled={editsDisabled} />
        <SelectedItemActionRow
          rotationOpen={state.rotation?.expanded ?? false}
          canRotate={Boolean(state.rotation)}
          disabled={editsDisabled}
          onRotate={actions.onToggleRotation}
          onDuplicate={actions.onDuplicate}
          onRemove={actions.onRemove}
        />
        {state.rotation ? (
          <SelectedItemRotationControls isDesigner={isDesigner} {...state.rotation} {...actions.rotation} />
        ) : null}
        <SelectedItemSwaps
          cheaper={summary.swaps.cheaper}
          pricier={summary.swaps.pricier}
          disabled={editsDisabled || !canChangeProducts}
          onSwapToCheaper={actions.onSwapToCheaper}
          onSwapToPricier={actions.onSwapToPricier}
        />
        {state.light && actions.onChangeLight ? <ProductLightControls light={state.light} disabled={editsDisabled} onChange={actions.onChangeLight} /> : null}
        <SelectedItemDetailsPanel isDesigner={isDesigner} canEdit={canEdit} {...details} {...actions.details} />
      </section>
    </div>
  );
  return placement.slot ? createPortal(panel, placement.slot) : panel;
}

/** The product's configuration and colour pickers, then its size in the design's units; a layout block's own name and size. */
function SelectedItemOptions({
  state,
  actions,
  disabled,
}: {
  state: SelectedItemPanelState;
  actions: SelectedItemPanelActions;
  disabled: boolean;
}) {
  const item = state.details.item;
  if (item && isLayoutBlock(item) && item.productSnapshot) {
    return (
      <LayoutBlockFields
        key={`${item.instanceId}:${item.productSnapshot.name}`} name={item.productSnapshot.name} sizeMm={item.productSnapshot.dimensionsMm}
        unit={state.details.measurementUnit} disabled={disabled} onUpdate={actions.onUpdateLayoutBlock} onUnitChange={actions.onMeasurementUnitChange}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ProductModelVariantControls
        state={state.productModelVariants}
        actions={actions.productModelVariants}
      />
      <ProductFinishControls
        state={state.productFinishes}
        actions={actions.productFinishes}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-label">Size</span>
        <span data-testid="selected-item-dimensions" className="text-[13px] text-control-label-idle">
          {state.summary.sizeLabel}
        </span>
      </div>
    </div>
  );
}
