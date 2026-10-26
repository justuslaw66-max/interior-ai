"use client";

import { Trash2 } from "lucide-react";
import LazyImage from "@/components/common/LazyImage";
import { Button } from "@/components/ui/Button";
import PlaceholderImage from "@/components/common/PlaceholderImage";
import type { ShoppingListLine } from "@/lib/shopping-list";

export type ShoppingListRowProps = {
  line: ShoppingListLine;
  canEdit: boolean;
  /** A swap picks another product, so it waits for the product lists; Remove doesn't. Defaults to canEdit. */
  canSwap?: boolean;
  onRemove: (line: ShoppingListLine) => void;
  onSwapForCheaper: (line: ShoppingListLine) => void;
};

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

function ShoppingLineDetail({ line, canSwap, onSwapForCheaper }: Pick<ShoppingListRowProps, "line" | "onSwapForCheaper"> & { canSwap: boolean }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-label-secondary md:text-[13px]">
      <span data-testid="shopping-list-row-detail">{line.detail}</span>
      <span className="rounded-md bg-control-track px-2 py-0.5 text-xs font-bold text-label-secondary">{line.roomName}</span>
      {line.addCount > 1 ? <span data-testid="shopping-list-row-quantity">Qty {line.addCount}</span> : null}
      {line.cheaperSwap && canSwap ? (
        <Button
          variant="link"
          size="inline"
          data-testid="shopping-list-swap"
          aria-label={`Swap ${line.title} for ${line.cheaperSwap.title}, which costs less`}
          onClick={() => onSwapForCheaper(line)}
          className="min-h-8"
        >
          Swap for cheaper
        </Button>
      ) : null}
    </div>
  );
}

/** One product in the Shopping list: picture, name, variant, room, price, and remove (FU8). */
export function ShoppingListRow({ line, canEdit, canSwap = canEdit, onRemove, onSwapForCheaper }: ShoppingListRowProps) {
  return (
    <li
      data-testid="shopping-list-row"
      data-instance-id={line.instanceId}
      data-product-id={line.productId}
      className="flex items-center gap-3 border-b border-separator-subtle py-2.5 pl-3.5 pr-2 last:border-b-0 md:gap-4 md:pl-5 md:pr-3"
    >
      <ShoppingLineImage line={line} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-label md:text-[15px]" title={line.title}>
          {line.title}
        </div>
        <ShoppingLineDetail line={line} canSwap={canSwap} onSwapForCheaper={onSwapForCheaper} />
      </div>
      <span data-testid="shopping-list-row-price" className="shrink-0 text-sm font-bold text-label md:text-[15px]">
        {line.priceLabel}
      </span>
      <Button
        variant="quiet"
        size="icon"
        data-testid="shopping-list-remove"
        aria-label={`Remove ${line.title} from the design`}
        disabled={!canEdit}
        onClick={() => onRemove(line)}
      >
        <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
      </Button>
    </li>
  );
}
