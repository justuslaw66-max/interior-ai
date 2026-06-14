"use client";

import LazyImage from "@/components/common/LazyImage";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ProductInfoRow, ProductInfoSections } from "@/lib/design-page-product-info";
import type { DesignItem } from "@/lib/room-types";

type SelectedItemDetailsPanelProps = {
  dark: boolean;
  isDesigner: boolean;
  product: CatalogItemSchema;
  item: DesignItem | null;
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
  onToggleInspectorDetails: () => void;
  onToggleFullDimensions: () => void;
  onToggleDeliveryWarranty: () => void;
  onToggleRotationControls: () => void;
};

export default function SelectedItemDetailsPanel({
  dark,
  isDesigner,
  product,
  item,
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
  onToggleInspectorDetails,
  onToggleFullDimensions,
  onToggleDeliveryWarranty,
  onToggleRotationControls,
}: SelectedItemDetailsPanelProps) {
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
