import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import { openingSymbolAt, type FoundOpeningSymbol } from "@/lib/floor-plan-review-door-click";

/**
 * The doors and windows step's clicks on the plan. With no end placed yet, a click on a door or window the reader
 * found fills in both of its ends and its kind (floor-plan-review-door-click.ts). Any other click places one end, as
 * before: so does a click on the symbol just filled in, once its ends are cleared, so a person can still place their
 * own ends there.
 */
export function openingSymbolClick(input: {
  document: FloorPlanDocumentV2; floorId: string; sourceId: string; pageNumber: number | undefined;
  current: ReviewSourcePoint[]; lastSymbolId: string | undefined;
  setPoints: (points: ReviewSourcePoint[]) => void; setSymbol: (symbol: FoundOpeningSymbol) => void;
}) {
  return (point: ReviewSourcePoint) => {
    const { document, floorId, sourceId, pageNumber, current } = input;
    const symbol = !current.length && pageNumber !== undefined
      ? openingSymbolAt({ document, floorId, sourceId, pageNumber, point }) : null;
    if (symbol && symbol.id !== input.lastSymbolId) {
      input.setSymbol(symbol);
      input.setPoints(symbol.points);
      return;
    }
    input.setPoints(current.length >= 2 ? [point] : [...current, point]);
  };
}
