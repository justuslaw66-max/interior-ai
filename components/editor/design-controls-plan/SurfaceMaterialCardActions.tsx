"use client";

import { Heart } from "lucide-react";

type SurfaceMaterialCardActionsProps = {
  materialId: string;
  productName: string;
  favorite: boolean;
  dark: boolean;
  detailsClassName: string;
  onToggleFavorite: () => void;
  onOpenDetails: () => void;
};

/**
 * The two actions under a material card. The favourite is an icon toggle, as on
 * product cards, so both actions fit a card in the two-column grid.
 */
export function SurfaceMaterialCardActions({
  materialId,
  productName,
  favorite,
  dark,
  detailsClassName,
  onToggleFavorite,
  onOpenDetails,
}: SurfaceMaterialCardActionsProps) {
  const toggleClassName = dark
    ? "designer-control flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
    : "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100";
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button
        type="button"
        data-testid={`surface-favorite-${materialId}`}
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${productName} from Favourites` : `Save ${productName} to Favourites`}
        className={toggleClassName}
        onClick={onToggleFavorite}
      >
        <Heart className={favorite ? "h-3.5 w-3.5 fill-current text-rose-600" : "h-3.5 w-3.5"} aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid={`surface-details-${materialId}`}
        className={`${detailsClassName} h-7 min-w-0 flex-1 truncate`}
        onClick={onOpenDetails}
      >
        Details
      </button>
    </div>
  );
}
