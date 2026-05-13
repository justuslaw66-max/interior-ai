import type { CatalogCardView } from "@/lib/catalog/view-builders";
import LazyImage from "@/components/common/LazyImage";
import PlaceholderImage from "@/components/common/PlaceholderImage";
import CatalogCardBadges from "./CatalogCardBadges";
import CatalogCardSwatches from "./CatalogCardSwatches";

type Props = {
  item: CatalogCardView;
  onPreview: () => void;
  onAdd: () => void;
  onToggleCompare: () => void;
  isCompared: boolean;
  onHover?: () => void;
};

export default function CatalogCard({ item, onPreview, onAdd, onToggleCompare, isCompared, onHover }: Props) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-2.5">
      <div className="aspect-[4/3] overflow-hidden rounded-lg" onMouseEnter={onHover}>
        {item.thumbUrl ? (
          <LazyImage
            src={item.thumbUrl}
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
      <div className="mt-1 text-xs font-medium text-neutral-800">{item.priceLabel ?? "External retailer"}</div>
      <div className="text-[11px] text-neutral-500">{item.dimsLabel}</div>
      <CatalogCardSwatches swatches={item.primarySwatches} />
      <CatalogCardBadges badges={item.badges} />

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <button
          onClick={onPreview}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-[11px] font-medium text-neutral-700"
        >
          Preview
        </button>
        <button
          onClick={onToggleCompare}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-[11px] font-medium text-neutral-700"
          data-testid={`catalog-compare-toggle-${item.id}`}
        >
          {isCompared ? "Compared" : "Compare"}
        </button>
        <button
          onMouseEnter={onHover}
          onClick={onAdd}
          className="rounded-md bg-neutral-900 px-2 py-1.5 text-[11px] font-medium text-white"
        >
          Add to room
        </button>
      </div>
    </div>
  );
}
