"use client";

import { useState } from "react";
import LazyImage from "@/components/common/LazyImage";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ProductInfoRow, ProductInfoSections } from "@/lib/design-page-product-info";
import type { DesignItem } from "@/lib/room-types";
import type { StyleConsistencyReport } from "@/lib/style-consistency";

type SelectedItemDetailsPanelProps = {
  dark: boolean;
  isDesigner: boolean;
  product: CatalogItemSchema;
  item: DesignItem | null;
  canEdit: boolean;
  rooms: Array<{ id: string; name: string }>;
  activeRoomId: string;
  planningDimensionsMm?: { w: number; d: number; h: number } | null;
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
  showRotationControls: boolean;
  styleConsistencyReport?: StyleConsistencyReport | null;
  onToggleInspectorDetails: () => void;
  onToggleFullDimensions: () => void;
  onToggleDeliveryWarranty: () => void;
  onToggleRotationControls: () => void;
  onMoveToRoom: (roomId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCenterInRoom: () => void;
  onSnapToWall: () => void;
  onNudge: (deltaX: number, deltaZ: number) => void;
  onSetPosition: (x: number, z: number) => void;
  onApplyStyleAlternative?: (productId: string) => void;
};

export default function SelectedItemDetailsPanel({
  dark,
  isDesigner,
  product,
  item,
  canEdit,
  rooms,
  activeRoomId,
  planningDimensionsMm,
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
  showRotationControls,
  styleConsistencyReport,
  onToggleInspectorDetails,
  onToggleFullDimensions,
  onToggleDeliveryWarranty,
  onToggleRotationControls,
  onMoveToRoom,
  onDuplicate,
  onDelete,
  onCenterInRoom,
  onSnapToWall,
  onNudge,
  onSetPosition,
  onApplyStyleAlternative,
}: SelectedItemDetailsPanelProps) {
  const [positionDraft, setPositionDraft] = useState<{
    itemId: string;
    x: string;
    z: string;
  } | null>(null);
  const titleClass = dark
    ? "designer-text-primary text-base font-semibold"
    : "text-base font-semibold text-neutral-900";
  const metaClass = dark
    ? "designer-text-secondary text-xs font-semibold uppercase tracking-[0.08em]"
    : "text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500";
  const buttonClass = dark
    ? "designer-text-secondary rounded-md border border-white/15 px-2 py-1 text-xs hover:text-white"
    : "rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50";
  const disabledButtonClass = dark
    ? "designer-text-secondary rounded-md border border-white/15 px-2 py-1 text-xs hover:text-white disabled:opacity-40"
    : "rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";
  const panelClass = dark
    ? "mt-2 space-y-3 rounded-lg border border-white/15 bg-white/5 p-3"
    : "mt-2 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3";
  const compactPanelClass = dark
    ? "mt-2 space-y-2 rounded-lg border border-white/15 bg-white/5 p-3"
    : "mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3";
  const sectionTitleClass = dark
    ? "designer-text-primary text-xs font-semibold uppercase tracking-[0.08em]"
    : "text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700";
  const labelClass = dark ? "designer-text-secondary text-xs" : "text-xs text-neutral-600";
  const valueClass = dark ? "designer-text-primary text-xs" : "text-xs text-neutral-900";
  const hasFullDimensions = Boolean(fullDimensionsDetails?.length);
  const hasDeliveryWarranty = Boolean(productDetailSections?.deliveryWarranty?.length);
  const itemActionsDisabled = !item || !canEdit || (isDesigner && Boolean(item.locked));
  const positionX = item?.position?.[0] ?? 0;
  const positionZ = item?.position?.[2] ?? 0;
  const activePositionDraft =
    item && positionDraft?.itemId === item.instanceId ? positionDraft : null;
  const positionXInput = activePositionDraft?.x ?? positionX.toFixed(2);
  const positionZInput = activePositionDraft?.z ?? positionZ.toFixed(2);
  const dimensionLabel = planningDimensionsMm
    ? `${(planningDimensionsMm.w / 1000).toFixed(2)} x ${(planningDimensionsMm.d / 1000).toFixed(2)} x ${(planningDimensionsMm.h / 1000).toFixed(2)} m`
    : `${(product.dimsMm.w / 1000).toFixed(2)} x ${(product.dimsMm.d / 1000).toFixed(2)} x ${(product.dimsMm.h / 1000).toFixed(2)} m`;
  const styleStatusClass =
    styleConsistencyReport?.status === "cohesive"
      ? dark
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-800"
      : styleConsistencyReport?.status === "clashing"
        ? dark
          ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
          : "border-rose-200 bg-rose-50 text-rose-800"
        : dark
          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
          : "border-amber-200 bg-amber-50 text-amber-800";

  const applyPositionInputs = () => {
    const nextX = Number(positionXInput);
    const nextZ = Number(positionZInput);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextZ)) {
      setPositionDraft(null);
      return;
    }
    setPositionDraft(null);
    onSetPosition(nextX, nextZ);
  };
  const setPositionXInput = (x: string) => {
    if (!item) return;
    setPositionDraft({ itemId: item.instanceId, x, z: positionZInput });
  };
  const setPositionZInput = (z: string) => {
    if (!item) return;
    setPositionDraft({ itemId: item.instanceId, x: positionXInput, z });
  };

  return (
    <div className="mt-2 space-y-1.5">
      {selectedBrand ? (
        <>
          <div className={metaClass}>{selectedBrand}</div>
          <h2 className={titleClass}>{selectedModelTitle}</h2>
        </>
      ) : (
        <h2 className={titleClass}>{product.title}</h2>
      )}

      {item?.locked && (
        <div
          className={
            isDesigner
              ? "designer-accent-pill mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs"
              : "mt-2 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
          }
        >
          Locked
        </div>
      )}

      {product.commerce.type === "shopify" ? (
        <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
          Buy on this site
        </span>
      ) : (
        <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
          External retailer
        </span>
      )}

      <div className={dark ? "designer-text-secondary text-sm" : "text-sm text-neutral-900"}>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} onClick={onToggleInspectorDetails}>
            {showInspectorDetails ? "Hide details" : "Show details"}
          </button>
          <button
            className={disabledButtonClass}
            disabled={!hasFullDimensions}
            onClick={onToggleFullDimensions}
            title={
              hasFullDimensions
                ? "Show full dimensions"
                : "Full dimensions dataset not added for this item yet"
            }
          >
            {showFullDimensions ? "Hide full dimensions" : "Full dimensions"}
          </button>
          <button
            className={disabledButtonClass}
            disabled={!hasDeliveryWarranty}
            onClick={onToggleDeliveryWarranty}
            title={
              hasDeliveryWarranty
                ? "Show delivery and warranty"
                : "Delivery and warranty details not added for this item yet"
            }
          >
            {showDeliveryWarranty ? "Hide delivery" : "Delivery & warranty"}
          </button>
          {item ? (
            <button
              className={buttonClass}
              aria-expanded={showRotationControls}
              data-testid="rotation-controls-toggle"
              onClick={onToggleRotationControls}
            >
              {showRotationControls ? "Hide rotation" : "Rotation"}
            </button>
          ) : null}
        </div>
      </div>

      {item ? (
        <div className={compactPanelClass} data-testid="selected-item-actions">
          <div className={sectionTitleClass}>Placement</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`${disabledButtonClass} min-h-10`}
              disabled={itemActionsDisabled}
              onClick={onCenterInRoom}
              data-testid="selected-item-center"
              title="Center selected item in room"
            >
              Center
            </button>
            <button
              type="button"
              className={`${disabledButtonClass} min-h-10`}
              disabled={itemActionsDisabled}
              onClick={onSnapToWall}
              data-testid="selected-item-snap-wall"
              title="Snap selected item to nearest wall"
            >
              Snap wall
            </button>
            <button
              type="button"
              className={`${disabledButtonClass} min-h-10`}
              disabled={itemActionsDisabled}
              onClick={onDuplicate}
              data-testid="selected-item-duplicate"
              title="Duplicate selected item (Cmd/Ctrl+D)"
            >
              Duplicate
            </button>
            <button
              type="button"
              className={`${disabledButtonClass} min-h-10`}
              disabled={itemActionsDisabled}
              onClick={onDelete}
              data-testid="selected-item-delete"
              title="Delete selected item (Delete)"
            >
              Delete
            </button>
          </div>

          <div
            className={
              dark
                ? "rounded-lg border border-white/10 bg-black/10 p-2"
                : "rounded-lg border border-neutral-200 bg-white p-2"
            }
            data-testid="selected-item-precision"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={labelClass}>Size</span>
              <span className={valueClass} data-testid="selected-item-dimensions">
                {dimensionLabel}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
              <label>
                <span className={labelClass}>X m</span>
                <input
                  data-testid="selected-item-position-x"
                  className={
                    dark
                      ? "mt-1 h-9 w-full rounded-md border border-white/15 bg-[#111827] px-2 text-xs text-neutral-100"
                      : "mt-1 h-9 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-900"
                  }
                  type="number"
                  step="0.05"
                  value={positionXInput}
                  disabled={itemActionsDisabled}
                  onChange={(event) => setPositionXInput(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyPositionInputs();
                    }
                  }}
                  onBlur={applyPositionInputs}
                />
              </label>
              <label>
                <span className={labelClass}>Z m</span>
                <input
                  data-testid="selected-item-position-z"
                  className={
                    dark
                      ? "mt-1 h-9 w-full rounded-md border border-white/15 bg-[#111827] px-2 text-xs text-neutral-100"
                      : "mt-1 h-9 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-900"
                  }
                  type="number"
                  step="0.05"
                  value={positionZInput}
                  disabled={itemActionsDisabled}
                  onChange={(event) => setPositionZInput(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyPositionInputs();
                    }
                  }}
                  onBlur={applyPositionInputs}
                />
              </label>
              <button
                type="button"
                data-testid="selected-item-position-apply"
                className={`${disabledButtonClass} min-h-10`}
                disabled={itemActionsDisabled}
                onClick={applyPositionInputs}
              >
                Apply
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <button
                type="button"
                data-testid="selected-item-nudge-left"
                className={`${disabledButtonClass} min-h-10`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item left by 5 centimeters"
                onClick={() => onNudge(-0.05, 0)}
              >
                Left
              </button>
              <button
                type="button"
                data-testid="selected-item-nudge-back"
                className={`${disabledButtonClass} min-h-10`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item back by 5 centimeters"
                onClick={() => onNudge(0, -0.05)}
              >
                Back
              </button>
              <button
                type="button"
                data-testid="selected-item-nudge-front"
                className={`${disabledButtonClass} min-h-10`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item forward by 5 centimeters"
                onClick={() => onNudge(0, 0.05)}
              >
                Front
              </button>
              <button
                type="button"
                data-testid="selected-item-nudge-right"
                className={`${disabledButtonClass} min-h-10`}
                disabled={itemActionsDisabled}
                aria-label="Nudge selected item right by 5 centimeters"
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
              className={
                dark
                  ? "rounded-lg border border-white/10 bg-black/10 p-2"
                  : "rounded-lg border border-neutral-200 bg-white p-2"
              }
              data-testid="selected-item-style-check"
            >
              <div className="flex items-center justify-between gap-2">
                <div className={sectionTitleClass}>Style check</div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${styleStatusClass}`}
                  data-testid="selected-item-style-status"
                >
                  {styleConsistencyReport.status}
                </span>
              </div>
              <div className={dark ? "mt-1 text-xs text-neutral-300" : "mt-1 text-xs text-neutral-700"}>
                {styleConsistencyReport.summary}
              </div>
              {styleConsistencyReport.findings.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {styleConsistencyReport.findings.slice(0, 3).map((finding) => (
                    <div
                      key={`${finding.kind}-${finding.label}`}
                      className={dark ? "text-[11px] text-neutral-400" : "text-[11px] text-neutral-600"}
                    >
                      <span className={dark ? "text-neutral-200" : "font-semibold text-neutral-800"}>
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
                      className={
                        dark
                          ? "w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-[11px] text-neutral-200 hover:bg-white/10"
                          : "w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-100"
                      }
                      data-testid={`selected-item-style-alternative-${alternative.productId}`}
                      disabled={itemActionsDisabled}
                      onClick={() => onApplyStyleAlternative(alternative.productId)}
                      title={alternative.reason}
                    >
                      <span className="block truncate font-semibold">{alternative.title}</span>
                      <span className={dark ? "block text-neutral-400" : "block text-neutral-500"}>
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
                className={
                  dark
                    ? "mt-1 h-9 w-full rounded-md border border-white/15 bg-[#111827] px-2 text-xs text-neutral-100"
                    : "mt-1 h-9 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-900"
                }
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
            <div className={dark ? "designer-text-secondary text-xs" : "text-xs text-neutral-700"}>
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
