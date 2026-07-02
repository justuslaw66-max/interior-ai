"use client";

import { useMemo } from "react";
import type { CatalogCardView } from "@/lib/catalog/view-builders";
import CatalogCard from "./CatalogCard";

type Props = {
  items: CatalogCardView[];
  virtual: { start: number; end: number; topPad: number; bottomPad: number };
  onPreview: (id: string) => void;
  onAdd: (id: string) => void;
  onAutoPlace?: (id: string) => void;
  onCatalogDragStart?: (id: string) => void;
  onCatalogDragEnd?: () => void;
  onToggleCompare: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  compareIds: string[];
  favoriteIds: string[];
  onPrefetch: (id: string) => void;
  onPreviewIntent?: (id: string | null) => void;
  activeRoomName?: string;
  roomProductQuantities?: Record<string, number>;
  roomVariantQuantities?: Record<string, number>;
  guidanceByItemId?: Record<string, string[]>;
};

export default function CatalogGrid({
  items,
  virtual,
  onPreview,
  onAdd,
  onAutoPlace,
  onCatalogDragStart,
  onCatalogDragEnd,
  onToggleCompare,
  onToggleFavorite,
  compareIds,
  favoriteIds,
  onPrefetch,
  onPreviewIntent,
  activeRoomName,
  roomProductQuantities = {},
  roomVariantQuantities = {},
  guidanceByItemId = {},
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
            onPreview={() => onPreview(item.id)}
            onAdd={() => onAdd(item.id)}
            onAutoPlace={onAutoPlace ? () => onAutoPlace(item.id) : undefined}
            onDragStart={onCatalogDragStart ? () => onCatalogDragStart(item.id) : undefined}
            onDragEnd={onCatalogDragEnd}
            onToggleCompare={() => onToggleCompare(item.id)}
            onToggleFavorite={() => onToggleFavorite(item.id)}
            isCompared={compareIds.includes(item.id)}
            isFavorite={favoriteIds.includes(item.id)}
            activeRoomName={activeRoomName}
            roomQuantity={roomProductQuantities[item.id] ?? 0}
            selectedVariantRoomQuantity={roomVariantQuantities[`${item.id}:${item.variantId}`] ?? 0}
            guidanceLabels={guidanceByItemId[item.id] ?? []}
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
