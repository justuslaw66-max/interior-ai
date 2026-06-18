"use client";

import type { CatalogDetailView } from "@/lib/catalog/view-builders";
import CatalogPlacementHint from "./CatalogPlacementHint";
import CatalogRoomFitBadge from "./CatalogRoomFitBadge";
import CatalogItemGallery from "./CatalogItemGallery";
import CatalogItemFinishPicker from "./CatalogItemFinishPicker";
import CatalogItemRelatedList from "./CatalogItemRelatedList";
import CatalogComfortProfile from "./CatalogComfortProfile";

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
  activeRoomName?: string;
  onClose: () => void;
  onAdd: (id: string, variantId?: string) => void;
  onToggleCompare: (id: string) => void;
  onPreviewRelated: (id: string) => void;
  onSetFinish: (finishId: string, finish: CatalogDetailView["finishOptions"][number]) => void;
  onSetSize?: (sizeId: string) => void;
};

export default function CatalogItemDrawer({
  open,
  detail,
  activeFinishId,
  relatedSections,
  isCompared,
  activeRoomName,
  onClose,
  onAdd,
  onToggleCompare,
  onPreviewRelated,
  onSetFinish,
  onSetSize,
}: Props) {
  if (!open || !detail) return null;

  const dimsCmLabel = `${(detail.dimsMm.w / 10).toFixed(1).replace(/\.0$/, "")} x ${(detail.dimsMm.d / 10)
    .toFixed(1)
    .replace(/\.0$/, "")} x ${(detail.dimsMm.h / 10).toFixed(1).replace(/\.0$/, "")} cm`;
  const activeRoomLabel = activeRoomName?.trim() || "this room";
  const selectedFinishLabel =
    detail.finishOptions.find((finish) => finish.id === activeFinishId || finish.variantId === detail.variantId)
      ?.label ?? detail.variantLabel;

  return (
    <aside className="absolute bottom-6 right-4 top-20 z-30 flex w-[25rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Product details
          </div>
          <div className="text-sm font-semibold text-neutral-900">Choose exact variant</div>
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
        />

        <div className="mt-4">
          <div className="line-clamp-2 text-lg font-semibold leading-snug text-neutral-950">
            {detail.title}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {detail.brand ?? "Unknown brand"} • {detail.category}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Selected variant
              </div>
              <div
                className="mt-1 text-sm font-semibold text-neutral-950"
                data-testid="catalog-detail-variant-label"
              >
                Variant: {detail.variantLabel}
              </div>
              <div className="mt-1 text-xs text-neutral-600">Finish: {selectedFinishLabel}</div>
            </div>
            <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm">
              {detail.priceLabel ?? "External retailer"}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600">
            <div className="rounded-lg bg-white px-2.5 py-2">
              <div className="font-semibold text-neutral-900">Dimensions</div>
              <div>{dimsCmLabel}</div>
            </div>
            <div className="rounded-lg bg-white px-2.5 py-2">
              <div className="font-semibold text-neutral-900">Adds to</div>
              <div className="truncate">{activeRoomLabel}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {detail.badges.map((badge) => (
            <CatalogRoomFitBadge key={badge} label={badge} />
          ))}
        </div>

        <div className="mt-4 space-y-4">
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

      <div className="border-t border-neutral-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => onAdd(detail.id, detail.variantId)}
          data-testid="catalog-detail-add-to-room"
          className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
        >
          Add selected variant to {activeRoomLabel}
        </button>
        <div className="mt-2 text-center text-[11px] text-neutral-500">
          Uses this exact variant ID, media, dimensions, and retailer mapping.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {detail.retailerUrl ? (
            <a
              href={detail.retailerUrl}
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
    </aside>
  );
}
