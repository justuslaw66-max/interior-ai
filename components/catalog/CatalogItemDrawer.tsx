"use client";

import type { CatalogDetailView } from "@/lib/catalog/view-builders";
import CatalogPlacementHint from "./CatalogPlacementHint";
import CatalogRoomFitBadge from "./CatalogRoomFitBadge";
import CatalogItemGallery from "./CatalogItemGallery";
import CatalogItemFinishPicker from "./CatalogItemFinishPicker";
import CatalogItemRelatedList from "./CatalogItemRelatedList";

type RelatedSection = {
  title: string;
  ids: string[];
};

type Props = {
  open: boolean;
  detail: CatalogDetailView | null;
  activeFinishId?: string;
  relatedSections: RelatedSection[];
  isCompared: boolean;
  onClose: () => void;
  onAdd: (id: string, variantId?: string) => void;
  onToggleCompare: (id: string) => void;
  onPreviewRelated: (id: string) => void;
  onSetFinish: (finishId: string) => void;
  onSetSize?: (sizeId: string) => void;
};

export default function CatalogItemDrawer({
  open,
  detail,
  activeFinishId,
  relatedSections,
  isCompared,
  onClose,
  onAdd,
  onToggleCompare,
  onPreviewRelated,
  onSetFinish,
  onSetSize,
}: Props) {
  if (!open || !detail) return null;

  return (
    <aside className="absolute right-4 top-20 z-30 w-[360px] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-neutral-900">Product details</div>
        <button onClick={onClose} className="text-xs text-neutral-500">Close</button>
      </div>

      <CatalogItemGallery
        images={detail.images}
        title={detail.title}
        imageClassName={detail.galleryImageClassName}
      />

      <div className="mt-3 text-lg font-semibold text-neutral-900">{detail.title}</div>
      <div className="text-xs text-neutral-500">{detail.brand ?? "Unknown brand"} • {detail.category}</div>
      <div className="text-xs text-neutral-500" data-testid="catalog-detail-variant-label">Variant: {detail.variantLabel}</div>
      <div className="text-xs text-neutral-500">Dimensions: {detail.dimsMm.w} x {detail.dimsMm.d} x {detail.dimsMm.h} mm</div>
      <div className="mt-1 text-sm font-medium text-neutral-800">{detail.priceLabel ?? "External retailer"}</div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {detail.badges.map((badge) => (
          <CatalogRoomFitBadge key={badge} label={badge} />
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {detail.sizeOptions.length > 1 && (
          <section className="space-y-2" aria-label="Size">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Size</h4>
            <div className="grid grid-cols-2 gap-2">
              {detail.sizeOptions.map((size) => {
                const isSelected = size.id === detail.activeSizeId;
                return (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => onSetSize?.(size.id)}
                    className={[
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
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
      </div>

      <div className="mt-3">
        <CatalogPlacementHint hints={detail.roomFitHints} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onAdd(detail.id, activeFinishId ?? detail.variantId)}
          data-testid="catalog-detail-add-to-room"
          className="rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"
        >
          Add to room
        </button>
        {detail.retailerUrl ? (
          <a
            href={detail.retailerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-200 px-3 py-2 text-center text-xs font-semibold text-neutral-700"
          >
            Retailer link
          </a>
        ) : (
          <div className="rounded-md border border-neutral-100 px-3 py-2 text-center text-xs text-neutral-400">No retailer link</div>
        )}
      </div>

      <button
        onClick={() => onToggleCompare(detail.id)}
        className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700"
        data-testid={`catalog-compare-toggle-drawer-${detail.id}`}
      >
        {isCompared ? "Remove from compare" : "Add to compare"}
      </button>

      <div className="mt-4">
        <CatalogItemRelatedList sections={relatedSections} onPreviewRelated={onPreviewRelated} />
      </div>
    </aside>
  );
}
