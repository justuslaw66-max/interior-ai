"use client";

import { useId } from "react";
import LazyImage from "@/components/common/LazyImage";
import type { ActiveRoomShoppingItem } from "@/lib/room-shopping";

type FurnishInThisRoomProps = {
  roomName: string;
  items: ActiveRoomShoppingItem[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (instanceId: string) => void;
};

const ROW_CLASS =
  "flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-10";

function PlacedItemRow({
  item,
  selected,
  canEdit,
  onSelect,
}: {
  item: ActiveRoomShoppingItem;
  selected: boolean;
  canEdit: boolean;
  onSelect: (instanceId: string) => void;
}) {
  const selectionLabel = item.variantLabel ? `Select ${item.title}, ${item.variantLabel}` : `Select ${item.title}`;
  const detail = item.quantity > 1 ? `${item.variantLabel} · Qty ${item.quantity}` : item.variantLabel;
  return (
    <div role="listitem" data-testid="furnish-room-bom-item">
      <button
        type="button"
        aria-label={selectionLabel}
        aria-pressed={selected}
        data-testid={`placed-item-select-${item.instanceId}`}
        disabled={!canEdit}
        onClick={() => onSelect(item.instanceId)}
        className={`${ROW_CLASS} ${selected ? "border-sky-400 bg-sky-50" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}
      >
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-neutral-50">
          {item.imageUrl ? (
            <LazyImage src={item.imageUrl} fallbackSrc={item.fallbackImageUrl ?? undefined} alt="" className="h-full w-full" imageClassName="object-contain object-center" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-neutral-900">{item.title}</span>
          {detail ? <span className="block truncate text-xs text-neutral-600">{detail}</span> : null}
        </span>
        <span className="shrink-0 text-xs font-semibold text-neutral-900">{item.priceLabel}</span>
      </button>
    </div>
  );
}

/**
 * The products in the room, each a button that selects it in the room: the keyboard's way to a
 * placed product. Nothing shows while the room is empty.
 */
export function FurnishInThisRoom({ roomName, items, selectedId, canEdit, onSelect }: FurnishInThisRoomProps) {
  const headingId = useId();
  const hintId = useId();
  if (items.length === 0) return null;
  return (
    <section
      data-testid="furnish-in-this-room"
      aria-labelledby={headingId}
      className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm"
    >
      <h3 id={headingId} className="flex items-baseline gap-1.5 text-sm font-semibold text-neutral-900">
        In this room <span className="text-xs font-normal text-neutral-600">{items.length}</span>
      </h3>
      <p id={hintId} className="sr-only">Tab to an item, then press Enter or Space to select.</p>
      <div data-testid="placed-item-selector" className="mt-2">
        <div
          role="list"
          aria-label={`Placed items in ${roomName}`}
          aria-describedby={hintId}
          data-testid="furnish-room-bom-list"
          className="max-h-60 space-y-1.5 overflow-y-auto pr-1"
        >
          {items.map((item) => (
            <PlacedItemRow
              key={item.instanceId}
              item={item}
              selected={selectedId === item.instanceId}
              canEdit={canEdit}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
