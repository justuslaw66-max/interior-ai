import type { CatalogCardView } from "@/lib/catalog/view-builders";
import LazyImage from "@/components/common/LazyImage";
import PlaceholderImage from "@/components/common/PlaceholderImage";
import CatalogCardBadges from "./CatalogCardBadges";
import CatalogCardSwatches from "./CatalogCardSwatches";
import CatalogRoomFitBadge from "./CatalogRoomFitBadge";

type Props = {
  item: CatalogCardView;
  onPreview: () => void;
  onAdd: () => void;
  onAutoPlace?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onToggleCompare: () => void;
  onToggleFavorite: () => void;
  isCompared: boolean;
  isFavorite: boolean;
  activeRoomName?: string;
  roomQuantity?: number;
  selectedVariantRoomQuantity?: number;
  guidanceLabels?: string[];
  onHover?: () => void;
  onHoverEnd?: () => void;
};

export default function CatalogCard({
  item,
  onPreview,
  onAdd,
  onAutoPlace,
  onDragStart,
  onDragEnd,
  onToggleCompare,
  onToggleFavorite,
  isCompared,
  isFavorite,
  activeRoomName,
  roomQuantity = 0,
  selectedVariantRoomQuantity = 0,
  guidanceLabels = [],
  onHover,
  onHoverEnd,
}: Props) {
  const activeRoomLabel = activeRoomName?.trim() || "room";

  return (
    <div
      className="rounded-xl border border-neutral-200 bg-white p-2.5"
      draggable={Boolean(onDragStart)}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onDragStart={(event) => {
        if (!onDragStart) return;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="aspect-4/3 overflow-hidden rounded-lg">
        {item.thumbUrl ? (
          <LazyImage
            src={item.thumbUrl}
            fallbackSrc={item.fallbackThumbUrl ?? undefined}
            alt={item.title}
            className={item.imageClassName}
          />
        ) : (
          <PlaceholderImage
            title={item.title}
            className={item.imageClassName ?? "h-full w-full"}
          />
        )}
      </div>

      <div className="mt-2 line-clamp-1 text-sm font-semibold text-neutral-900">{item.title}</div>
      <div className="line-clamp-1 text-xs text-neutral-500">{item.brand ?? "Unknown brand"} • {item.category}</div>
      <div className="line-clamp-1 text-xs text-neutral-500">{item.variantLabel}</div>
      {roomQuantity > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            {roomQuantity} in {activeRoomLabel}
          </span>
          {selectedVariantRoomQuantity > 0 ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
              {selectedVariantRoomQuantity} this variant
            </span>
          ) : null}
        </div>
      ) : null}
      {guidanceLabels.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5" data-testid={`catalog-guidance-${item.id}`}>
          {guidanceLabels.map((label) => (
            <CatalogRoomFitBadge key={label} label={label} />
          ))}
        </div>
      ) : null}
      <div className="mt-1 text-xs font-medium text-neutral-800">{item.priceLabel ?? "External retailer"}</div>
      <div className="text-[11px] text-neutral-500">{item.dimsLabel}</div>
      <CatalogCardSwatches swatches={item.primarySwatches} />
      <CatalogCardBadges badges={item.badges} />

      <div className="mt-3 border-t border-neutral-100 pt-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[11px] font-medium text-neutral-500">
            Add to {activeRoomLabel}
          </div>
          <button
            type="button"
            onClick={onToggleCompare}
            className="shrink-0 text-[11px] font-semibold text-neutral-500 transition-colors hover:text-neutral-900"
            data-testid={`catalog-compare-toggle-${item.id}`}
          >
            {isCompared ? "Compared" : "Compare"}
          </button>
          <button
            type="button"
            onClick={onToggleFavorite}
            className={[
              "shrink-0 text-[11px] font-semibold transition-colors",
              isFavorite ? "text-amber-600 hover:text-amber-700" : "text-neutral-500 hover:text-neutral-900",
            ].join(" ")}
            data-testid={`catalog-favorite-toggle-${item.id}`}
            aria-pressed={isFavorite}
          >
            {isFavorite ? "Saved" : "Save"}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onPreview}
            data-testid={`catalog-preview-${item.id}`}
            className="min-h-9 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={onAutoPlace}
            disabled={!onAutoPlace}
            data-testid={`catalog-auto-place-${item.id}`}
            className="min-h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Auto
          </button>
          <button
            type="button"
            onClick={onAdd}
            data-testid={`catalog-add-${item.id}`}
            className="min-h-9 rounded-lg bg-neutral-900 px-2.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
