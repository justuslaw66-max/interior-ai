"use client";

import { useEffect, useRef } from "react";
import { Chip } from "@/components/ui/Chip";
import type { CatalogChip, CatalogChipId } from "@/lib/catalog/category-chips";

type CatalogCategoryChipsProps = {
  chips: CatalogChip[];
  selected: CatalogChipId;
  onSelect: (id: CatalogChipId) => void;
};

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
          <Chip
            key={chip.id}
            data-testid={chip.testId}
            data-active={active ? "true" : "false"}
            pressed={active}
            onClick={() => onSelect(chip.id)}
          >
            {chip.label}
          </Chip>
        );
      })}
    </div>
  );
}
