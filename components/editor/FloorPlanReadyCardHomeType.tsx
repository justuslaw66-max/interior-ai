import { useMemo, useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { applyReviewHomeType, reviewHomeTypeFor, type ReviewHomeTypeId } from "@/lib/floor-plan-imports/review-home-type";
import FloorPlanReviewHomeType from "./floor-plan-import-review/FloorPlanReviewHomeType";

type Floor = FloorPlanDocumentV2["floors"][number];

/**
 * The ready card's home type (J, 1 Nov 2026: "On the ready card"; a plan that needs review asks it in the review). It
 * starts on the home type the floor's assumed walls are, and previews the walls and storey it gives. `chosen` is what
 * Create design sends: the home type, once it isn't the one the card started on. The server applies it to every floor.
 */
export function useReadyCardHomeType(candidate: FloorPlanDocumentV2 | null, floor: Floor | null) {
  const starting = useMemo(() => reviewHomeTypeFor(floor ?? undefined), [floor]);
  const [homeType, setHomeType] = useState<ReviewHomeTypeId>(starting);
  const preview = useMemo(
    () => (candidate && floor ? applyReviewHomeType(candidate, { floorId: floor.id, homeType, storeyTyped: false }) : null),
    [candidate, floor, homeType]
  );
  return { homeType, setHomeType, preview, chosen: homeType === starting ? null : homeType };
}

type ReadyHomeTypeProps = { floor: Floor | null; heights: ReturnType<typeof useReadyCardHomeType>; disabled: boolean };

/** The home type field, showing the floor as the chosen home type leaves it. */
export default function ReadyCardHomeType({ floor, heights, disabled }: ReadyHomeTypeProps) {
  if (!floor || !heights.preview) return null;
  const { document, kept, refused, storeyBelowWalls } = heights.preview;
  return (
    <FloorPlanReviewHomeType floor={document.floors.find((entry) => entry.id === floor.id) ?? floor} homeType={heights.homeType}
      kept={kept} refused={Boolean(refused)} storeyBelowWalls={Boolean(storeyBelowWalls)} disabled={disabled}
      onChange={heights.setHomeType} detailsHint={false} />
  );
}
