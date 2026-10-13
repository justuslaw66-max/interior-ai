"use client";

import { useState } from "react";
import { Info, Ruler, SlidersHorizontal, Truck } from "lucide-react";
import LazyImage from "@/components/common/LazyImage";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ProductInfoRow, ProductInfoSections } from "@/lib/design-page-product-info";
import type { DesignItem } from "@/lib/room-types";
import type { StyleConsistencyReport } from "@/lib/style-consistency";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import MeasurementField from "./MeasurementField";
import { Button } from "@/components/ui/Button";

type SelectedItemDetailsPanelProps = {
  isDesigner: boolean;
  product: CatalogItemSchema;
  item: DesignItem | null;
  canEdit: boolean;
  rooms: Array<{ id: string; name: string }>;
  activeRoomId: string;
  measurementUnit: PlanMeasurementUnit;
  selectedBrand?: string | null;
  selectedModelTitle?: string | null;
  selectedCategoryDebugLabel?: string | null;
  activeVariantLabel?: string | null;
  productDetailSections: ProductInfoSections | null;
  fullDimensionsDetails?: ProductInfoRow[] | null;
  selectedDimensionImageUrl?: string | null;
  showInspectorDetails: boolean;
  showFullDimensions: boolean;
  showDeliveryWarranty: boolean;
  styleConsistencyReport?: StyleConsistencyReport | null;
  onToggleInspectorDetails: () => void;
  onToggleFullDimensions: () => void;
  onToggleDeliveryWarranty: () => void;
  onMoveToRoom: (roomId: string) => void;
  onCenterInRoom: () => void;
  onSnapToWall: () => void;
  onNudge: (deltaX: number, deltaZ: number) => void;
  onSetPosition: (x: number, z: number) => void;
  adjustableHangingHeight?: {
    valueCm: number;
    minCm: number;
    maxCm: number;
    stepCm: number;
  } | null;
  onAdjustHangingHeight?: (heightCm: number) => void;
  onApplyStyleAlternative?: (productId: string) => void;
};

export default function SelectedItemDetailsPanel({
  isDesigner,
  product,
  item,
  canEdit,
  rooms,
  activeRoomId,
  measurementUnit,
  selectedBrand,
  selectedModelTitle,
  selectedCategoryDebugLabel,
  activeVariantLabel,
  productDetailSections,
  fullDimensionsDetails,
  selectedDimensionImageUrl,
  showInspectorDetails,
  showFullDimensions,
  showDeliveryWarranty,
  styleConsistencyReport,
  onToggleInspectorDetails,
  onToggleFullDimensions,
  onToggleDeliveryWarranty,
  onMoveToRoom,
  onCenterInRoom,
  onSnapToWall,
  onNudge,
  onSetPosition,
  adjustableHangingHeight,
  onAdjustHangingHeight,
  onApplyStyleAlternative,
}: SelectedItemDetailsPanelProps) {
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const disabledButtonClass = "rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";
  const actionToggleClass = (active: boolean, disabled = false) => {
    const base =
      "inline-flex min-h-11 items-center justify-start gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors";
    if (disabled) {
      return `${base} cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 opacity-80`;
    }
    if (active) {
      return `${base} border-neutral-900 bg-neutral-900 text-white shadow-sm`;
    }
    return `${base} border-neutral-200 bg-white text-neutral-700 shadow-sm hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950`;
  };
  const actionIconClass = "h-3.5 w-3.5 shrink-0";
  const panelClass = "mt-2 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3";
  const compactPanelClass = "mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3";
  const sectionTitleClass = "text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700";
  const labelClass = "text-xs text-neutral-600";
  const valueClass = "text-xs text-neutral-900";
  const hasFullDimensions = Boolean(fullDimensionsDetails?.length);
  const hasDeliveryWarranty = Boolean(productDetailSections?.deliveryWarranty?.length);
  const itemActionsDisabled = !item || !canEdit || (isDesigner && Boolean(item.locked));
  const positionX = item?.position?.[0] ?? 0;
  const positionZ = item?.position?.[2] ?? 0;
  const styleStatusClass =
    styleConsistencyReport?.status === "cohesive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : styleConsistencyReport?.status === "clashing"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-amber-200 bg-amber-50 text-amber-800";


  return (
    <div className="mt-2 space-y-1.5" data-testid="selected-item-details">
      <div className="pt-1">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={actionToggleClass(showInspectorDetails)}
            aria-label={showInspectorDetails ? "Hide details" : "Show details"}
            aria-pressed={showInspectorDetails}
            onClick={onToggleInspectorDetails}
            title={showInspectorDetails ? "Hide details" : "Show details"}
          >
            <Info className={actionIconClass} aria-hidden="true" />
            <span>Details</span>
          </button>
          <button
            type="button"
            className={actionToggleClass(showFullDimensions, !hasFullDimensions)}
            aria-label={
              hasFullDimensions
                ? showFullDimensions
                  ? "Hide full dimensions"
                  : "Full dimensions"
                : "Full dimensions unavailable"
            }
            disabled={!hasFullDimensions}
            aria-pressed={showFullDimensions}
            onClick={onToggleFullDimensions}
            title={
              hasFullDimensions
                ? "Show full dimensions"
                : "Full dimensions dataset not added for this item yet"
            }
          >
            <Ruler className={actionIconClass} aria-hidden="true" />
            <span>Dimensions</span>
          </button>
          <button
            type="button"
            className={actionToggleClass(showDeliveryWarranty, !hasDeliveryWarranty)}
            aria-label={
              hasDeliveryWarranty
                ? showDeliveryWarranty
                  ? "Hide delivery and warranty"
                  : "Delivery & warranty"
                : "Delivery and warranty unavailable"
            }
            disabled={!hasDeliveryWarranty}
            aria-pressed={showDeliveryWarranty}
            onClick={onToggleDeliveryWarranty}
            title={
              hasDeliveryWarranty
                ? "Show delivery and warranty"
                : "Delivery and warranty details not added for this item yet"
            }
          >
            <Truck className={actionIconClass} aria-hidden="true" />
            <span>Delivery</span>
          </button>
          {item ? (
            <button
              type="button"
              className={actionToggleClass(showAdvancedControls)}
              aria-expanded={showAdvancedControls}
              aria-pressed={showAdvancedControls}
              data-testid="selected-item-advanced-controls-toggle"
              onClick={() => setShowAdvancedControls((value) => !value)}
              title={showAdvancedControls ? "Hide controls" : "Show controls"}
            >
              <SlidersHorizontal className={actionIconClass} aria-hidden="true" />
              <span>More controls</span>
            </button>
          ) : null}
        </div>
      </div>

      {item && adjustableHangingHeight && onAdjustHangingHeight ? (
        <div className={compactPanelClass} data-testid="selected-item-hanging-height-control">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={sectionTitleClass}>Hanging height</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                Adjusts only the central cable
              </div>
            </div>
            <MeasurementField
              className="w-28"
              label="Pendant hanging height"
              hideLabel
              testId="selected-item-hanging-height-number"
              valueMm={adjustableHangingHeight.valueCm * 10}
              unit={measurementUnit}
              minMm={adjustableHangingHeight.minCm * 10}
              maxMm={adjustableHangingHeight.maxCm * 10}
              stepMm={adjustableHangingHeight.stepCm * 10}
              keyboardStepMm={adjustableHangingHeight.stepCm * 10}
              disabled={itemActionsDisabled}
              compact
              onCommit={(valueMm) => onAdjustHangingHeight(valueMm / 10)}
            />
          </div>
          <input
            data-testid="selected-item-hanging-height-slider"
            className="w-full accent-blue-600"
            type="range"
            min={adjustableHangingHeight.minCm}
            max={adjustableHangingHeight.maxCm}
            step={adjustableHangingHeight.stepCm}
            value={adjustableHangingHeight.valueCm}
            disabled={itemActionsDisabled}
            onChange={(event) => {
              onAdjustHangingHeight(Number(event.currentTarget.value));
            }}
            aria-label="Adjust pendant hanging height"
          />
          <div className="flex justify-between text-xs text-neutral-500">
            <span>{formatCabinetMeasurement(adjustableHangingHeight.minCm * 10, measurementUnit)}</span>
            <span>{formatCabinetMeasurement(adjustableHangingHeight.maxCm * 10, measurementUnit)}</span>
          </div>
        </div>
      ) : null}

      {item && showAdvancedControls ? (
        <div className={compactPanelClass} data-testid="selected-item-placement">
          <div className={sectionTitleClass}>Placement</div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary" size="touch"
              disabled={itemActionsDisabled}
              onClick={onCenterInRoom}
              data-testid="selected-item-center"
              title="Centre selected item in room"
            >
              Centre
            </Button>
            <Button
              variant="secondary" size="touch"
              disabled={itemActionsDisabled}
              onClick={onSnapToWall}
              data-testid="selected-item-snap-wall"
              title="Snap selected item to nearest wall"
            >
              Snap wall
            </Button>
          </div>

          <div
            className="rounded-lg border border-neutral-200 bg-white p-2"
            data-testid="selected-item-precision"
          >
            <div
              className="text-xs text-neutral-500"
              data-testid="selected-item-size-guidance"
            >
              Catalogue size is preserved. Choose an available model or size option below to resize accurately.
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MeasurementField
                label="Position X"
                testId="selected-item-position-x"
                valueMm={positionX * 1000}
                unit={measurementUnit}
                stepMm={10}
                keyboardStepMm={50}
                disabled={itemActionsDisabled}
                compact
                touchFriendly
                onCommit={(valueMm) => onSetPosition(valueMm / 1000, positionZ)}
              />
              <MeasurementField
                label="Position Z"
                testId="selected-item-position-z"
                valueMm={positionZ * 1000}
                unit={measurementUnit}
                stepMm={10}
                keyboardStepMm={50}
                disabled={itemActionsDisabled}
                compact
                touchFriendly
                onCommit={(valueMm) => onSetPosition(positionX, valueMm / 1000)}
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <button
                type="button"
                data-testid="selected-item-nudge-left"
                className={`${disabledButtonClass} min-h-11`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item left by 5 centimetres"
                onClick={() => onNudge(-0.05, 0)}
              >
                Left
              </button>
              <button
                type="button"
                data-testid="selected-item-nudge-back"
                className={`${disabledButtonClass} min-h-11`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item back by 5 centimetres"
                onClick={() => onNudge(0, -0.05)}
              >
                Back
              </button>
              <button
                type="button"
                data-testid="selected-item-nudge-front"
                className={`${disabledButtonClass} min-h-11`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item forward by 5 centimetres"
                onClick={() => onNudge(0, 0.05)}
              >
                Front
              </button>
              <button
                type="button"
                data-testid="selected-item-nudge-right"
                className={`${disabledButtonClass} min-h-11`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item right by 5 centimetres"
                onClick={() => onNudge(0.05, 0)}
              >
                Right
              </button>
            </div>
          </div>
          <div className={labelClass}>
            R rotate · arrows nudge · Shift+arrows larger nudge
          </div>
          {styleConsistencyReport && styleConsistencyReport.status !== "solo" ? (
            <div
              className="rounded-lg border border-neutral-200 bg-white p-2"
              data-testid="selected-item-style-check"
            >
              <div className="flex items-center justify-between gap-2">
                <div className={sectionTitleClass}>Style check</div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${styleStatusClass}`}
                  data-testid="selected-item-style-status"
                >
                  {styleConsistencyReport.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-700">
                {styleConsistencyReport.summary}
              </div>
              {styleConsistencyReport.findings.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {styleConsistencyReport.findings.slice(0, 3).map((finding) => (
                    <div
                      key={`${finding.kind}-${finding.label}`}
                      className="text-xs text-neutral-600"
                    >
                      <span className="font-semibold text-neutral-800">
                        {finding.label}:
                      </span>{" "}
                      {finding.message}
                    </div>
                  ))}
                </div>
              ) : null}
              {styleConsistencyReport.alternatives.length > 0 && onApplyStyleAlternative ? (
                <div className="mt-2 space-y-1.5">
                  {styleConsistencyReport.alternatives.map((alternative) => (
                    <button
                      key={alternative.productId}
                      type="button"
                      className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
                      data-testid={`selected-item-style-alternative-${alternative.productId}`}
                      disabled={itemActionsDisabled}
                      onClick={() => onApplyStyleAlternative(alternative.productId)}
                      title={alternative.reason}
                    >
                      <span className="block truncate font-semibold">{alternative.title}</span>
                      <span className="block text-neutral-500">
                        {alternative.reason}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {rooms.length > 1 ? (
            <label className="block">
              <span className={labelClass}>Move to room</span>
              <select
                data-testid="selected-item-move-room"
                className="mt-1 h-11 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-900"
                value={activeRoomId}
                disabled={itemActionsDisabled}
                onChange={(event) => onMoveToRoom(event.currentTarget.value)}
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {showInspectorDetails && (
        <div className={panelClass} data-testid="selected-product-details-panel">
          <div className={sectionTitleClass}>Material</div>
          {productDetailSections?.material?.length ? (
            <div className="space-y-2">
              {productDetailSections.material.map((detail, index) => (
                <DetailRow
                  key={`${detail.label}-${detail.value}-${index}`}
                  detail={detail}
                  labelClass={labelClass}
                  valueClass={valueClass}
                  labelWidthClass="grid-cols-[132px_1fr]"
                  gapClass="gap-3"
                />
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-700">
              {selectedBrand ? `${selectedBrand} - ` : ""}
              {selectedCategoryDebugLabel ?? product.category.replace(/_/g, " ")}
              {activeVariantLabel ? ` - ${activeVariantLabel}` : ""}
            </div>
          )}
        </div>
      )}

      {showFullDimensions && hasFullDimensions ? (
        <div className={compactPanelClass} data-testid="selected-product-dimensions-panel">
          {selectedDimensionImageUrl ? (
            <div className="mb-3 overflow-hidden rounded-md bg-white">
              <LazyImage
                src={selectedDimensionImageUrl}
                alt={`${selectedModelTitle ?? product.title} dimensions`}
                className="aspect-4/3 w-full"
                imageClassName="object-contain object-center"
                testId="selected-product-dimensions-image"
              />
            </div>
          ) : null}
          {fullDimensionsDetails?.map((detail, index) => (
            <DetailRow
              key={`${detail.label}-${detail.value}-${index}`}
              detail={detail}
              labelClass={labelClass}
              valueClass={valueClass}
              labelWidthClass="grid-cols-[140px_1fr]"
              gapClass="gap-2"
            />
          ))}
        </div>
      ) : null}

      {showDeliveryWarranty && hasDeliveryWarranty ? (
        <div className={panelClass} data-testid="selected-product-delivery-warranty-panel">
          <div className={sectionTitleClass}>Delivery & warranty</div>
          <div className="space-y-2">
            {productDetailSections?.deliveryWarranty.map((detail, index) => (
              <DetailRow
                key={`${detail.label}-${detail.value}-${index}`}
                detail={detail}
                labelClass={labelClass}
                valueClass={valueClass}
                labelWidthClass="grid-cols-[132px_1fr]"
                gapClass="gap-3"
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  detail,
  labelClass,
  valueClass,
  labelWidthClass,
  gapClass,
}: {
  detail: ProductInfoRow;
  labelClass: string;
  valueClass: string;
  labelWidthClass: string;
  gapClass: string;
}) {
  return (
    <div className={`grid ${labelWidthClass} ${gapClass}`}>
      <div className={labelClass}>{detail.label}:</div>
      <div className={valueClass}>{detail.value}</div>
    </div>
  );
}
