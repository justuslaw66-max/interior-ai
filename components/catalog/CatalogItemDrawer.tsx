"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogDetailView } from "@/lib/catalog/view-builders";
import CatalogPlacementHint from "./CatalogPlacementHint";
import CatalogRoomFitBadge from "./CatalogRoomFitBadge";
import CatalogItemGallery from "./CatalogItemGallery";
import CatalogItemFinishPicker from "./CatalogItemFinishPicker";
import CatalogItemRelatedList from "./CatalogItemRelatedList";
import CatalogComfortProfile from "./CatalogComfortProfile";
import LazyImage from "@/components/common/LazyImage";

type RelatedSection = {
  title: string;
  ids: string[];
};

export type CatalogConfigurationOption = {
  productId: string;
  label: string;
  thumbUrl?: string;
  dimsLabel: string;
};

type Props = {
  open: boolean;
  detail: CatalogDetailView | null;
  activeFinishId?: string;
  relatedSections: RelatedSection[];
  isCompared: boolean;
  activeRoomName?: string;
  roomProductQuantity?: number;
  roomVariantQuantity?: number;
  onClose: () => void;
  onAdd: (id: string, variantId?: string, purchaseOptionId?: string) => void;
  onToggleCompare: (id: string) => void;
  onPreviewRelated: (id: string) => void;
  onSetFinish: (finishId: string, finish: CatalogDetailView["finishOptions"][number]) => void;
  onSetSize?: (sizeId: string) => void;
  configurationOptions?: CatalogConfigurationOption[];
  onSetConfiguration?: (productId: string) => void;
};

export default function CatalogItemDrawer({
  open,
  detail,
  activeFinishId,
  relatedSections,
  isCompared,
  activeRoomName,
  roomProductQuantity = 0,
  roomVariantQuantity = 0,
  onClose,
  onAdd,
  onToggleCompare,
  onPreviewRelated,
  onSetFinish,
  onSetSize,
  configurationOptions = [],
  onSetConfiguration,
}: Props) {
  const [selectedPurchaseOptionId, setSelectedPurchaseOptionId] = useState<string | null>(null);

  const selectedPurchaseOption = useMemo(() => {
    if (!detail) return null;
    return (
      detail.purchaseOptions.find((option) => option.id === selectedPurchaseOptionId) ??
      detail.purchaseOptions.find((option) => option.quantity === 1) ??
      detail.purchaseOptions[0] ??
      null
    );
  }, [detail, selectedPurchaseOptionId]);

  if (!open || !detail || typeof document === "undefined") return null;

  const dimsCmLabel = `${(detail.dimsMm.w / 10).toFixed(1).replace(/\.0$/, "")} x ${(detail.dimsMm.d / 10)
    .toFixed(1)
    .replace(/\.0$/, "")} x ${(detail.dimsMm.h / 10).toFixed(1).replace(/\.0$/, "")} cm`;
  const activeRoomLabel = activeRoomName?.trim() || "this room";
  const selectedFinishOption = detail.finishOptions.find(
    (finish) =>
      finish.id === activeFinishId ||
      finish.variantId === activeFinishId ||
      finish.variantId === detail.variantId
  );
  const selectedFinishLabel = selectedFinishOption?.label ?? detail.variantLabel;
  const addQuantity = selectedPurchaseOption?.quantity ?? 1;
  const selectedRetailerUrl = selectedPurchaseOption?.affiliateUrl ?? detail.retailerUrl;
  const formatPrice = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(0)}` : null;
  const selectedOptionPrice = formatPrice(selectedPurchaseOption?.priceHint);
  const selectedOptionCompareAt = formatPrice(selectedPurchaseOption?.compareAtPriceHint);
  const selectedOptionSavings = formatPrice(selectedPurchaseOption?.savingsHint);
  const selectedSwatchStyle = selectedFinishOption
    ? {
        backgroundColor: selectedFinishOption.swatchHex ?? "#d1d5db",
        backgroundImage: selectedFinishOption.swatchTextureUrl
          ? `url(${selectedFinishOption.swatchTextureUrl})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  return createPortal(
    <aside
      data-testid="catalog-item-drawer"
      className="fixed bottom-6 right-4 top-20 z-[90] flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Product preview
          </div>
          <div className="text-sm font-semibold text-neutral-900">Review exact variant</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <CatalogItemGallery
          images={detail.images}
          title={detail.title}
          imageClassName={detail.galleryImageClassName}
          presentationMode={detail.galleryPresentationMode}
        />

        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Product details
          </div>
          <div className="line-clamp-2 text-lg font-semibold leading-snug text-neutral-950">
            {detail.title}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {detail.brand ?? "Unknown brand"} • {detail.category}
          </div>
        </div>

        <div
          data-testid="catalog-detail-add-context"
          className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Adding to {activeRoomLabel}
              </div>
              <div
                data-testid="catalog-detail-selected-variant-summary"
                className="mt-1 truncate text-sm font-semibold text-neutral-950"
              >
                {selectedFinishLabel}
              </div>
              <div className="mt-1 text-xs text-neutral-600">
                {detail.variantLabel} · {dimsCmLabel}
              </div>
              {roomProductQuantity > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {roomProductQuantity} already in {activeRoomLabel}
                  </span>
                  {roomVariantQuantity > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      {roomVariantQuantity} this variant
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
              Variant locked
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div
                className="h-14 w-14 shrink-0 rounded-xl border border-white shadow-sm ring-1 ring-neutral-200"
                style={selectedSwatchStyle}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Exact variant selected
                </div>
                <div
                  className="mt-1 text-sm font-semibold text-neutral-950"
                  data-testid="catalog-detail-variant-label"
                >
                  {detail.variantLabel}
                </div>
                <div className="mt-1 text-xs text-neutral-600">Finish: {selectedFinishLabel}</div>
                <div className="mt-1 truncate text-[11px] font-medium text-neutral-500">
                  Variant ID: {detail.variantId}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm">
                {detail.priceLabel ?? "External retailer"}
              </div>
              <div className="mt-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                Identity locked
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-neutral-600">
            <div className="rounded-xl bg-white px-2.5 py-2" data-testid="catalog-detail-dimensions">
              <div className="font-semibold text-neutral-900">Dimensions</div>
              <div>{dimsCmLabel}</div>
            </div>
            <div className="rounded-xl bg-white px-2.5 py-2">
              <div className="font-semibold text-neutral-900">Add target</div>
              <div className="truncate">{activeRoomLabel}</div>
            </div>
            <div className="rounded-xl bg-white px-2.5 py-2">
              <div className="font-semibold text-neutral-900">Commerce</div>
              <div className="truncate">
                {detail.retailerUrl ? "Retailer link ready" : "Variant-safe item"}
              </div>
            </div>
          </div>
        </div>

        {detail.purchaseOptions.length > 0 ? (
          <section className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Purchase option
                </div>
                <div className="mt-1 text-sm font-semibold text-neutral-950">
                  Choose single or official set
                </div>
              </div>
              {selectedOptionSavings ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Save {selectedOptionSavings}
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {detail.purchaseOptions.map((option) => {
                const isSelected = option.id === selectedPurchaseOption?.id;
                const price = formatPrice(option.priceHint);
                const compareAt = formatPrice(option.compareAtPriceHint);
                const savings = formatPrice(option.savingsHint);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedPurchaseOptionId(option.id)}
                    aria-pressed={isSelected}
                    className={[
                      "rounded-xl border p-3 text-left transition-colors",
                      isSelected
                        ? "border-neutral-900 bg-neutral-950 text-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-300",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          isSelected ? "bg-white/15 text-white" : "bg-white text-neutral-600",
                        ].join(" ")}
                      >
                        x{option.quantity}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {price ? <span className="font-semibold">{price}</span> : null}
                      {compareAt ? (
                        <span
                          className={isSelected ? "text-white/60 line-through" : "text-neutral-400 line-through"}
                        >
                          {compareAt}
                        </span>
                      ) : null}
                      {savings ? (
                        <span className={isSelected ? "text-emerald-100" : "text-emerald-700"}>
                          Save {savings}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedPurchaseOption ? (
              <div className="mt-2 text-xs text-neutral-600">
                {selectedPurchaseOption.quantity > 1
                  ? `Adds ${selectedPurchaseOption.quantity} chairs visually, but keeps one official Castlery set line in cart.`
                  : "Adds one chair and one single-chair purchase line."}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Placement preview
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-950">
                Preview before adding
              </div>
              <div className="mt-1 text-xs text-neutral-600">
                The selected variant appears as a placement ghost in {activeRoomLabel}.
              </div>
            </div>
            <div className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
              Strict bounds
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {detail.badges.map((badge) => (
            <CatalogRoomFitBadge key={badge} label={badge} />
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {configurationOptions.length > 1 && (
            <section className="space-y-2" aria-label="Configuration" data-testid="catalog-configuration-picker">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Configuration
                </h4>
                <span className="text-[11px] text-neutral-500">
                  {configurationOptions.length} choices
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {configurationOptions.map((option) => {
                  const isSelected = option.productId === detail.id;
                  return (
                    <button
                      key={option.productId}
                      type="button"
                      onClick={() => onSetConfiguration?.(option.productId)}
                      aria-pressed={isSelected}
                      data-testid={`catalog-configuration-${option.productId}`}
                      className={[
                        "overflow-hidden rounded-xl border text-left transition-colors",
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300",
                      ].join(" ")}
                    >
                      {option.thumbUrl ? (
                        <div className={isSelected ? "bg-white" : "bg-neutral-50"}>
                          <LazyImage
                            src={option.thumbUrl}
                            alt=""
                            className="aspect-[3/2] w-full object-contain"
                          />
                        </div>
                      ) : null}
                      <div className="px-3 py-2">
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className={isSelected ? "mt-0.5 text-[11px] text-white/70" : "mt-0.5 text-[11px] text-neutral-500"}>
                          {option.dimsLabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {detail.sizeOptions.length > 1 && (
            <section className="space-y-2" aria-label="Size">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Size
                </h4>
                <span className="text-[11px] text-neutral-500">Keeps finish when possible</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {detail.sizeOptions.map((size) => {
                  const isSelected = size.id === detail.activeSizeId;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => onSetSize?.(size.id)}
                      aria-pressed={isSelected}
                      className={[
                        "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors",
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      {size.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <CatalogItemFinishPicker
            finishOptions={detail.finishOptions}
            activeFinishId={activeFinishId}
            onSetFinish={onSetFinish}
          />

          <CatalogComfortProfile axes={detail.comfortProfile} />
        </div>

        <div className="mt-4">
          <CatalogPlacementHint hints={detail.roomFitHints} />
        </div>

        <div className="mt-5">
          <CatalogItemRelatedList sections={relatedSections} onPreviewRelated={onPreviewRelated} />
        </div>
      </div>

      <div className="border-t border-neutral-100 bg-white px-4 pb-4 pt-3">
        <div className="mb-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          <span className="font-semibold text-neutral-900">Ready to preview:</span> {selectedFinishLabel} ·{" "}
          {selectedPurchaseOption?.label ?? "Single"} · {dimsCmLabel} · {activeRoomLabel}
          {selectedOptionPrice ? (
            <span className="ml-1 font-semibold text-neutral-900">
              {selectedOptionPrice}
              {selectedOptionCompareAt ? (
                <span className="ml-1 font-medium text-neutral-400 line-through">{selectedOptionCompareAt}</span>
              ) : null}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onAdd(detail.id, detail.variantId, selectedPurchaseOption?.id)}
          data-testid="catalog-detail-add-to-room"
          className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
        >
          {addQuantity > 1 ? `Add set of ${addQuantity} to ${activeRoomLabel}` : `Add to ${activeRoomLabel}`}
        </button>
        <div className="mt-2 text-center text-[11px] text-neutral-500">
          Next: confirm the placement ghost before it becomes part of the room.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {selectedRetailerUrl ? (
            <a
              href={selectedRetailerUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-center text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Retailer link
            </a>
          ) : (
            <div className="rounded-lg border border-neutral-100 px-3 py-2 text-center text-xs text-neutral-400">
              No retailer link
            </div>
          )}
          <button
            type="button"
            onClick={() => onToggleCompare(detail.id)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            data-testid={`catalog-compare-toggle-drawer-${detail.id}`}
          >
            {isCompared ? "Remove compare" : "Compare"}
          </button>
        </div>
      </div>
    </aside>,
    document.body
  );
}
