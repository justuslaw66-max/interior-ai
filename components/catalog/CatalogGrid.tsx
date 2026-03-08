"use client";

import { useMemo } from "react";
import type { CatalogCardView } from "@/lib/catalog/view-builders";
import CatalogCard from "./CatalogCard";

type Props = {
  items: CatalogCardView[];
  virtual: { start: number; end: number; topPad: number; bottomPad: number };
  onPreview: (id: string) => void;
  onAdd: (id: string) => void;
  onToggleCompare: (id: string) => void;
  compareIds: string[];
  onPrefetch: (id: string) => void;
};

export default function CatalogGrid({ items, virtual, onPreview, onAdd, onToggleCompare, compareIds, onPrefetch }: Props) {
  const visible = useMemo(() => items.slice(virtual.start, virtual.end), [items, virtual.start, virtual.end]);

  return (
    <div>
      <div style={{ height: virtual.topPad }} />
      <div className="grid grid-cols-2 gap-2">
        {visible.map((item) => (
          <CatalogCard
            key={item.id}
            item={item}
            onPreview={() => onPreview(item.id)}
            onAdd={() => onAdd(item.id)}
            onToggleCompare={() => onToggleCompare(item.id)}
            isCompared={compareIds.includes(item.id)}
            onHover={() => onPrefetch(item.id)}
          />
        ))}
      </div>
      <div style={{ height: virtual.bottomPad }} />
    </div>
  );
}
