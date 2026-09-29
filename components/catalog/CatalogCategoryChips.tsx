"use client";

import { useEffect, useRef } from "react";
import type { CatalogChip, CatalogChipId } from "@/lib/catalog/category-chips";

type CatalogCategoryChipsProps = {
  chips: CatalogChip[];
  selected: CatalogChipId;
  onSelect: (id: CatalogChipId) => void;
};

const CHIP_CLASS =
  "min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1 md:min-h-8";
const ACTIVE_CLASS = "border-neutral-900 bg-neutral-900 text-white";
const IDLE_CLASS = "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50";

/** Scrolls the row sideways, and only sideways, until the pressed chip shows. */
function useChipInView(selected: CatalogChipId) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    const hidden = chip.offsetLeft < row.scrollLeft || chip.offsetLeft + chip.offsetWidth > row.scrollLeft + row.clientWidth;
    if (hidden) row.scrollLeft = Math.max(0, chip.offsetLeft - 12);
  }, [selected]);
  return rowRef;
}

/** One row of chips that scrolls sideways, as in the Furnish mockup. */
export function CatalogCategoryChips({ chips, selected, onSelect }: CatalogCategoryChipsProps) {
  const rowRef = useChipInView(selected);
  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Filter products"
      data-testid="catalog-category-chips"
      className="relative -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1"
    >
      {chips.map((chip) => {
        const active = chip.id === selected;
        return (
          <button
            key={chip.id}
            type="button"
            data-testid={chip.testId}
            data-active={active ? "true" : "false"}
            aria-pressed={active}
            className={`${CHIP_CLASS} ${active ? ACTIVE_CLASS : IDLE_CLASS}`}
            onClick={() => onSelect(chip.id)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
