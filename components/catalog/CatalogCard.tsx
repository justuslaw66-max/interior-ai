import { Eye, Plus, Sparkles } from "lucide-react";
import type { CatalogCardView } from "@/lib/catalog/view-builders";
import LazyImage from "@/components/common/LazyImage";
import PlaceholderImage from "@/components/common/PlaceholderImage";
import CatalogCardSwatches from "./CatalogCardSwatches";
import { getCatalogDrawerFocusAttributes } from "./useCatalogDrawerFocusRestoration";

type Props = {
  item: CatalogCardView;
  onPreview: (opener: HTMLButtonElement) => void;
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
  onHover,
  onHoverEnd,
}: Props) {
  return (
    <div
      className="rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
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
      <div className="aspect-4/3 overflow-hidden rounded-md">
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

      <div className="mt-1.5 break-words text-[13px] font-semibold leading-snug text-neutral-900" title={item.title}>
        {item.title}
      </div>
      {item.configurationCount && item.configurationCount > 1 ? (
        <div className="mt-1 text-[11px] font-medium text-neutral-500" data-testid={`catalog-family-count-${item.id}`}>
          {item.configurationCount} configurations
        </div>
      ) : null}
      <CatalogCardSwatches swatches={item.primarySwatches} />

      <div className="mt-2 border-t border-neutral-100 pt-1.5">
        <div className="mb-1.5 flex items-center justify-end gap-3">
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
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={(event) => onPreview(event.currentTarget)}
            data-testid={`catalog-preview-${item.id}`} {...getCatalogDrawerFocusAttributes({ productId: item.id, action: "details", source: "product-card" })}
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-1 py-1 text-[11px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
            aria-label="View details"
            title="View details"
          >
            <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onAutoPlace}
            disabled={!onAutoPlace}
            data-testid={`catalog-auto-place-${item.id}`}
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1 py-1 text-[11px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Auto place in room"
            title="Auto place in room"
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onAdd}
            data-testid={`catalog-add-${item.id}`}
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-neutral-900 px-1 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800"
            aria-label="Add item"
            title="Add item"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
