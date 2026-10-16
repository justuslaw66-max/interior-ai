"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/Button";

type SurfaceMaterialCardActionsProps = {
  materialId: string;
  productName: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpenDetails: () => void;
};

/**
 * The two actions under a material card. The favourite is an icon toggle, as on
 * product cards, so both actions fit a card in the two-column grid. The heart keeps its red fill
 * when saved (J, 16 Oct) and the Button's 30px height, so the row lines up with Details.
 */
export function SurfaceMaterialCardActions({
  materialId,
  productName,
  favorite,
  onToggleFavorite,
  onOpenDetails,
}: SurfaceMaterialCardActionsProps) {
  const toggleClassName = "flex h-[30px] w-[30px] touch:h-11 touch:w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100";
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
      <Button
        size="compact"
        data-testid={`surface-details-${materialId}`}
        className="min-w-0 flex-1 truncate"
        onClick={onOpenDetails}
      >
        Details
      </Button>
    </div>
  );
}
