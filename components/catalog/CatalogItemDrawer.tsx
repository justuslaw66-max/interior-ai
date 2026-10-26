"use client";

import { useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogDetailView } from "@/lib/catalog/view-builders";
import CatalogPlacementHint from "./CatalogPlacementHint";
import CatalogRoomFitBadge from "./CatalogRoomFitBadge";
import CatalogItemGallery from "./CatalogItemGallery";
import CatalogItemFinishPicker from "./CatalogItemFinishPicker";
import CatalogItemRelatedList from "./CatalogItemRelatedList";
import CatalogComfortProfile from "./CatalogComfortProfile";
import { CatalogItemDrawerAddSection, type CatalogItemDrawerFavourite } from "./CatalogItemDrawerAddSection";
import LazyImage from "@/components/common/LazyImage";
import { Button } from "@/components/ui/Button";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { useCatalogDrawerDialog, type CatalogDrawerFocusRestorationRequest } from "./useCatalogDrawerFocusRestoration";

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
  onAdd: (id: string, variantId?: string, purchaseOptionId?: string) => void; addDisabled?: boolean; // Until the product lists load.
  placesDirectly?: boolean; // Consumers: Add places the product; onChooseSpot opens the preview instead (FU4).
  favourite?: CatalogItemDrawerFavourite; // The heart in details (UX 4g, FU3).
  onChooseSpot?: (id: string, variantId?: string, purchaseOptionId?: string) => void;
  onToggleCompare: (id: string) => void;
  onPreviewRelated: (id: string) => void;
  onSetFinish: (finishId: string, finish: CatalogDetailView["finishOptions"][number]) => void;
  onSetSize?: (sizeId: string) => void;
  configurationOptions?: CatalogConfigurationOption[];
  onSetConfiguration?: (productId: string) => void;
  focusRestoration: CatalogDrawerFocusRestorationRequest | null;
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
  onAdd, addDisabled = false, placesDirectly = false, onChooseSpot, favourite,
  onToggleCompare,
  onPreviewRelated,
  onSetFinish,
  onSetSize,
  configurationOptions = [],
  onSetConfiguration,
  focusRestoration,
}: Props) {
  const [selectedPurchaseOptionId, setSelectedPurchaseOptionId] = useState<string | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const requestClose = useCatalogDrawerDialog({
    open, contentAvailable: Boolean(detail), dialogRef, panelRef, closeButtonRef,
    restorationRequest: focusRestoration, onClose,
  });

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
    <div
      ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
      data-testid="catalog-item-drawer-backdrop" data-editor-dialog-state="mounting"
      className="fixed inset-0 z-[90] bg-transparent outline-hidden"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <aside
        ref={panelRef}
        tabIndex={-1} data-editor-dialog-state="mounting"
        data-testid="catalog-item-drawer" data-surface="floating"
        className="fixed bottom-6 right-4 top-bar-3 md:top-bar-6 flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-separator bg-surface-floating shadow-2xl outline-hidden"
      >
      <div className="flex items-center justify-between border-b border-separator-subtle px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
            Product preview
          </div>
          <div id={titleId} className="text-sm font-semibold text-label">
            Review exact variant
          </div>
        </div>
        <Button ref={closeButtonRef} size="compact" onClick={requestClose} data-testid="catalog-item-drawer-close">
          Close
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <CatalogItemGallery
          images={detail.images}
          title={detail.title}
          imageClassName={detail.galleryImageClassName}
          presentationMode={detail.galleryPresentationMode}
        />

        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
            Product details
          </div>
          <div className="line-clamp-2 text-lg font-semibold leading-snug text-label">
            {detail.title}
          </div>
          <div className="mt-1 text-xs text-label-secondary">
            {detail.brand ?? "Unknown brand"} • {detail.category}
          </div>
        </div>

        <div
          data-testid="catalog-detail-add-context"
          className="mt-3 rounded-xl border border-success-tint-border bg-success-tint p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-on-success-tint">
                Adding to {activeRoomLabel}
              </div>
              <div
                data-testid="catalog-detail-selected-variant-summary"
                className="mt-1 truncate text-sm font-semibold text-label"
              >
                {selectedFinishLabel}
              </div>
              <div className="mt-1 text-xs text-label-secondary">
                {detail.variantLabel} · {dimsCmLabel}
              </div>
              {roomProductQuantity > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-surface-floating px-2 py-0.5 text-xs font-semibold text-on-success-tint">
                {roomProductQuantity} already in {activeRoomLabel}
                  </span>
                  {roomVariantQuantity > 0 ? (
                    <span className="rounded-full bg-surface-floating px-2 py-0.5 text-xs font-semibold text-on-success-tint">
                      {roomVariantQuantity} this variant
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-surface-floating px-2.5 py-1 text-xs font-semibold text-on-success-tint shadow-sm">
              Variant locked
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-box-border bg-tile p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div
                className="h-14 w-14 shrink-0 rounded-xl border border-surface-floating shadow-sm ring-1 ring-swatch-edge"
                style={selectedSwatchStyle}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
                  Exact variant selected
                </div>
                <div
                  className="mt-1 text-sm font-semibold text-label"
                  data-testid="catalog-detail-variant-label"
                >
                  {detail.variantLabel}
                </div>
                <div className="mt-1 text-xs text-label-secondary">Finish: {selectedFinishLabel}</div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="rounded-full bg-surface-floating px-2.5 py-1 text-xs font-semibold text-label-secondary shadow-sm">
                {detail.priceLabel ?? "Price on request"}
              </div>
              <div className="mt-1 rounded-full bg-surface-floating px-2.5 py-1 text-xs font-semibold text-on-success-tint">
                Identity locked
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-label-secondary">
            <div className="rounded-xl bg-surface-floating px-2.5 py-2" data-testid="catalog-detail-dimensions">
              <div className="font-semibold text-label">Dimensions</div>
              <div>{dimsCmLabel}</div>
            </div>
            <div className="rounded-xl bg-surface-floating px-2.5 py-2">
              <div className="font-semibold text-label">Add target</div>
              <div className="truncate">{activeRoomLabel}</div>
            </div>
            <div className="rounded-xl bg-surface-floating px-2.5 py-2">
              <div className="font-semibold text-label">Commerce</div>
              <div className="truncate">
                {detail.retailerUrl ? "Retailer link ready" : "Variant-safe item"}
              </div>
            </div>
          </div>
        </div>

        {detail.purchaseOptions.length > 0 ? (
          <section className="mt-3 rounded-2xl border border-separator bg-surface-floating p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
                  Purchase option
                </div>
                <div className="mt-1 text-sm font-semibold text-label">
                  Choose single or official set
                </div>
              </div>
              {selectedOptionSavings ? (
                <span className="rounded-full bg-success-tint px-2.5 py-1 text-xs font-semibold text-on-success-tint">
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
                  <ChoiceTile
                    key={option.id}
                    selected={isSelected}
                    onClick={() => setSelectedPurchaseOptionId(option.id)}
                    className="p-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className="rounded-full bg-control-track px-2 py-0.5 text-xs font-semibold text-label-secondary">
                        x{option.quantity}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {price ? <span className="font-semibold">{price}</span> : null}
                      {compareAt ? <span className="text-label-secondary line-through">{compareAt}</span> : null}
                      {savings ? <span className="text-on-success-tint">Save {savings}</span> : null}
                    </div>
                  </ChoiceTile>
                );
              })}
            </div>
            {selectedPurchaseOption ? (
              <div className="mt-2 text-xs text-label-secondary">
                {selectedPurchaseOption.quantity > 1
                  ? `Adds ${selectedPurchaseOption.quantity} chairs; the Shopping list keeps them as one Castlery set.`
                  : "Adds one chair and one single-chair purchase line."}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="mt-3 rounded-xl border border-separator bg-surface-floating p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
                Placement preview
              </div>
              <div className="mt-1 text-sm font-semibold text-label">
                Preview before adding
              </div>
              <div className="mt-1 text-xs text-label-secondary">
                The selected variant appears as a placement ghost in {activeRoomLabel}.
              </div>
            </div>
            <div className="shrink-0 rounded-full bg-control-track px-2.5 py-1 text-xs font-semibold text-label-secondary">
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
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
                  Configuration
                </h4>
                <span className="text-xs text-label-secondary">
                  {configurationOptions.length} choices
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {configurationOptions.map((option) => {
                  const isSelected = option.productId === detail.id;
                  return (
                    <ChoiceTile
                      key={option.productId}
                      selected={isSelected}
                      onClick={() => onSetConfiguration?.(option.productId)}
                      data-testid={`catalog-configuration-${option.productId}`}
                      className="overflow-hidden text-left"
                    >
                      {option.thumbUrl ? (
                        <div className="bg-neutral-50">
                          <LazyImage
                            src={option.thumbUrl}
                            alt=""
                            className="aspect-[3/2] w-full object-contain"
                          />
                        </div>
                      ) : null}
                      <div className="px-3 py-2">
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="mt-0.5 text-xs text-label-secondary">{option.dimsLabel}</div>
                      </div>
                    </ChoiceTile>
                  );
                })}
              </div>
            </section>
          )}

          {detail.sizeOptions.length > 1 && (
            <section className="space-y-2" aria-label="Size">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
                  Size
                </h4>
                <span className="text-xs text-label-secondary">Keeps finish when possible</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {detail.sizeOptions.map((size) => {
                  const isSelected = size.id === detail.activeSizeId;
                  return (
                    <ChoiceTile
                      key={size.id}
                      selected={isSelected}
                      onClick={() => onSetSize?.(size.id)}
                      className="px-3 py-2 text-left text-sm font-semibold"
                    >
                      {size.label}
                    </ChoiceTile>
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

      <CatalogItemDrawerAddSection productId={detail.id} variantId={detail.variantId}
        purchaseOptionId={selectedPurchaseOption?.id} addQuantity={addQuantity}
        summary={{ finishLabel: selectedFinishLabel, optionLabel: selectedPurchaseOption?.label ?? "Single", dimsLabel: dimsCmLabel, roomLabel: activeRoomLabel, price: selectedOptionPrice, compareAt: selectedOptionCompareAt }}
        retailerUrl={selectedRetailerUrl} isCompared={isCompared} placesDirectly={placesDirectly}
        onAdd={onAdd} addDisabled={addDisabled} onChooseSpot={onChooseSpot} onToggleCompare={onToggleCompare} onClose={onClose} favourite={favourite} />
      </aside>
    </div>,
    document.body
  );
}
