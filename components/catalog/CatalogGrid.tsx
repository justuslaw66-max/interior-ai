"use client";

import { useMemo } from "react";
import type { CatalogCardView } from "@/lib/catalog/view-builders";
import CatalogCard from "./CatalogCard";

type Props = {
  items: CatalogCardView[];
  virtual: { start: number; end: number; topPad: number; bottomPad: number };
  /** The room Add puts products in. */
  roomLabel: string;
  /** How many of each card's product are in the room already, by card id. */
  roomQuantityById: Record<string, number>;
  favoriteIds: string[];
  onPreview: (id: string, opener: HTMLButtonElement) => void;
  onAdd: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onPrefetch: (id: string) => void;
  onPreviewIntent?: (id: string | null) => void;
  onCatalogDragStart?: (id: string) => void;
  onCatalogDragEnd?: () => void;
};

export default function CatalogGrid({
  items,
  virtual,
  roomLabel,
  roomQuantityById,
  favoriteIds,
  onPreview,
  onAdd,
  onToggleFavorite,
  onPrefetch,
  onPreviewIntent,
  onCatalogDragStart,
  onCatalogDragEnd,
}: Props) {
  const visible = useMemo(() => items.slice(virtual.start, virtual.end), [items, virtual.start, virtual.end]);

  return (
    <div>
      <div style={{ height: virtual.topPad }} />
      <div className="grid grid-cols-2 gap-2">
        {visible.map((item) => (
          <CatalogCard
            key={item.id}
            item={item}
            roomLabel={roomLabel}
            inRoom={(roomQuantityById[item.id] ?? 0) > 0}
            isFavorite={favoriteIds.includes(item.id)}
            onPreview={(opener) => onPreview(item.id, opener)}
            onAdd={() => onAdd(item.id)}
            onToggleFavorite={() => onToggleFavorite(item.id)}
            onDragStart={onCatalogDragStart ? () => onCatalogDragStart(item.id) : undefined}
            onDragEnd={onCatalogDragEnd}
            onHover={() => {
              onPrefetch(item.id);
              onPreviewIntent?.(item.id);
            }}
            onHoverEnd={() => onPreviewIntent?.(null)}
          />
        ))}
      </div>
      <div style={{ height: virtual.bottomPad }} />
    </div>
  );
}
