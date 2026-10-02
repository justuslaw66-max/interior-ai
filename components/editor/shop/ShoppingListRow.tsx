"use client";

import { Trash2 } from "lucide-react";
import LazyImage from "@/components/common/LazyImage";
import PlaceholderImage from "@/components/common/PlaceholderImage";
import type { ShoppingListLine } from "@/lib/shopping-list";

export type ShoppingListRowProps = {
  line: ShoppingListLine;
  canEdit: boolean;
  onRemove: (line: ShoppingListLine) => void;
  onSwapForCheaper: (line: ShoppingListLine) => void;
};

const FOCUS_RING = "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

function ShoppingLineImage({ line }: Pick<ShoppingListRowProps, "line">) {
  return (
    <div className="relative h-[42px] w-14 shrink-0 overflow-hidden rounded-lg bg-[#f4f1eb] md:h-[54px] md:w-[72px]">
      {line.imageUrl ? (
        <LazyImage src={line.imageUrl} fallbackSrc={line.fallbackImageUrl ?? undefined} alt="" className="h-full w-full" />
      ) : (
        <PlaceholderImage title={line.title} className="h-full w-full" />
      )}
    </div>
  );
}

function ShoppingLineDetail({ line, canEdit, onSwapForCheaper }: Omit<ShoppingListRowProps, "onRemove">) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-600 md:text-[13px]">
      <span data-testid="shopping-list-row-detail">{line.detail}</span>
      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">{line.roomName}</span>
      {line.addCount > 1 ? <span data-testid="shopping-list-row-quantity">Qty {line.addCount}</span> : null}
      {line.cheaperSwap && canEdit ? (
        <button
          type="button"
          data-testid="shopping-list-swap"
          aria-label={`Swap ${line.title} for ${line.cheaperSwap.title}, which costs less`}
          onClick={() => onSwapForCheaper(line)}
          className={`min-h-8 rounded text-left font-bold text-blue-800 hover:underline ${FOCUS_RING}`}
        >
          Swap for cheaper
        </button>
      ) : null}
    </div>
  );
}

/** One product in the Shopping list: picture, name, variant, room, price, and remove (FU8). */
export function ShoppingListRow({ line, canEdit, onRemove, onSwapForCheaper }: ShoppingListRowProps) {
  return (
    <li
      data-testid="shopping-list-row"
      data-instance-id={line.instanceId}
      data-product-id={line.productId}
      className="flex items-center gap-3 border-b border-neutral-100 py-2.5 pl-3.5 pr-2 last:border-b-0 md:gap-4 md:pl-5 md:pr-3"
    >
      <ShoppingLineImage line={line} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-neutral-900 md:text-[15px]" title={line.title}>
          {line.title}
        </div>
        <ShoppingLineDetail line={line} canEdit={canEdit} onSwapForCheaper={onSwapForCheaper} />
      </div>
      <span data-testid="shopping-list-row-price" className="shrink-0 text-sm font-bold text-neutral-900 md:text-[15px]">
        {line.priceLabel}
      </span>
      <button
        type="button"
        data-testid="shopping-list-remove"
        aria-label={`Remove ${line.title} from the design`}
        disabled={!canEdit}
        onClick={() => onRemove(line)}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40 md:h-9 md:w-9 ${FOCUS_RING}`}
      >
        <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </li>
  );
}
