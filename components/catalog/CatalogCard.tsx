import { useRef } from "react";
import { Check, Heart, Plus } from "lucide-react";
import type { CatalogCardView } from "@/lib/catalog/view-builders";
import LazyImage from "@/components/common/LazyImage";
import PlaceholderImage from "@/components/common/PlaceholderImage";
import { getCatalogDrawerFocusAttributes } from "./useCatalogDrawerFocusRestoration";
import { formatSgd } from "@/lib/money-format";

/** A card is 232px tall and the grid's gap is 8px; the grid is virtualised on this row height. */
export const CATALOG_CARD_ROW_HEIGHT = 240;

type Props = {
  item: CatalogCardView;
  /** The room Add puts the product in, for Add's accessible name. */
  roomLabel: string;
  inRoom: boolean;
  isFavorite: boolean;
  onPreview: (opener: HTMLButtonElement) => void;
  onAdd: () => void;
  onToggleFavorite: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
};

const FOCUS_RING = "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900";

function CatalogCardImage({ item, inRoom }: Pick<Props, "item" | "inRoom">) {
  return (
    <div className="relative h-24 shrink-0 overflow-hidden rounded-t-lg bg-neutral-50">
      {item.thumbUrl ? (
        <LazyImage src={item.thumbUrl} fallbackSrc={item.fallbackThumbUrl ?? undefined} alt="" className={item.imageClassName} />
      ) : (
        <PlaceholderImage title={item.title} className={item.imageClassName ?? "h-full w-full"} />
      )}
      {inRoom ? (
        <span
          data-testid={`catalog-in-room-${item.id}`}
          className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-bold text-emerald-800 shadow-sm"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          In this room
        </span>
      ) : null}
    </div>
  );
}

function CatalogCardPrice({ item }: Pick<Props, "item">) {
  return (
    <span
      data-testid={`catalog-card-price-${item.id}`}
      className={`mt-1 text-[13px] leading-5 ${item.priceAmount != null ? "font-bold text-neutral-900" : "text-neutral-600"}`}
    >
      {item.priceAmount != null ? formatSgd(item.priceAmount) : "Price on request"}
    </span>
  );
}

/** The heart's words, on the card and in details (UX 4g, FU3): it adds and removes, it doesn't "save". */
export function favouriteLabel(title: string, isFavorite: boolean) {
  return isFavorite ? `Remove ${title} from Favourites` : `Add ${title} to Favourites`;
}

function CatalogCardFavourite({ item, isFavorite, onToggleFavorite }: Pick<Props, "item" | "isFavorite" | "onToggleFavorite">) {
  return (
    <button
      type="button"
      onClick={onToggleFavorite}
      data-testid={`catalog-favorite-toggle-${item.id}`}
      aria-pressed={isFavorite}
      aria-label={favouriteLabel(item.title, isFavorite)}
      className={`absolute right-1.5 top-1.5 flex h-8 w-8 touch:h-11 touch:w-11 items-center justify-center rounded-full bg-white/95 text-neutral-900 shadow-sm hover:bg-white ${FOCUS_RING}`}
    >
      <Heart className={isFavorite ? "h-4 w-4 fill-current text-rose-600" : "h-4 w-4"} aria-hidden="true" />
    </button>
  );
}

/**
 * A product: picture, name, size, price and one Add (audit findings FU1-FU3). A click anywhere else
 * on the card opens its details, where Compare lives; keyboards reach the details through the name.
 */
export default function CatalogCard(props: Props) {
  const { item } = props;
  const previewRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      data-testid={`catalog-card-${item.id}`}
      className="relative flex h-[232px] cursor-pointer flex-col rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-400 hover:shadow-md"
      draggable={Boolean(props.onDragStart)}
      onMouseEnter={props.onHover}
      onMouseLeave={props.onHoverEnd}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a") || !previewRef.current) return;
        props.onPreview(previewRef.current);
      }}
      onDragStart={(event) => {
        if (!props.onDragStart) return;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", item.id);
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
    >
      <CatalogCardImage item={item} inRoom={props.inRoom} />
      <CatalogCardFavourite item={item} isFavorite={props.isFavorite} onToggleFavorite={props.onToggleFavorite} />
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1.5">
        <button
          ref={previewRef}
          type="button"
          data-testid={`catalog-preview-${item.id}`} data-touch-exempt
          {...getCatalogDrawerFocusAttributes({ productId: item.id, action: "details", source: "product-card" })}
          className={`rounded text-left text-[13px] font-semibold leading-[17px] text-neutral-900 ${FOCUS_RING}`}
          onClick={(event) => props.onPreview(event.currentTarget)}
        >
          <span className="line-clamp-2 h-[34px]" title={item.title}>{item.title}</span>
          <span className="sr-only">, view details</span>
        </button>
        <span className="mt-0.5 truncate text-xs leading-4 text-neutral-600">{item.dimsLabel}</span>
        <CatalogCardPrice item={item} />
        <button
          type="button"
          onClick={props.onAdd}
          data-testid={`catalog-add-${item.id}`}
          aria-label={`Add ${item.title} to the ${props.roomLabel}`}
          className={`mt-auto inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white text-[13px] font-bold text-neutral-900 hover:bg-neutral-50 ${FOCUS_RING}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  );
}
