/**
 * "Click on a door": in the review's doors and windows step, a click on a door or window the reader found on the page
 * but could not place (its unverified span, `source-proposal:{page}:opening:{i}`) fills in both of its ends and its
 * kind, ready to add as an opening. A click counts as on the symbol within its span's length of the span (a door's
 * swing reaches that far from its wall).
 */
import type { FloorPlanDocumentV2, FloorPlanOpeningKindV2 } from "@/lib/floor-plan-document-v2";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";

export type FoundOpeningSymbol = { id: string; kind: FloorPlanOpeningKindV2; points: [ReviewSourcePoint, ReviewSourcePoint] };

/** Within this many page px of a short span still counts as on it. */
const MIN_REACH_PX = 12;

function distanceToSpan(point: ReviewSourcePoint, a: ReviewSourcePoint, b: ReviewSourcePoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** The kind a symbol's note names ("Unverified window span; ..."), among those the doors and windows step offers. */
export function openingKindFromNote(note: string): FloorPlanOpeningKindV2 {
  const named = /^Unverified (\S+) span/i.exec(note)?.[1] ?? "";
  if (/window/i.test(named)) return "window";
  if (/passage|opening/i.test(named)) return "open_passage";
  return "door";
}

/** The found door or window symbol nearest a click on the page, if the click is on it. */
export function openingSymbolAt(input: {
  document: FloorPlanDocumentV2; floorId: string; sourceId: string; pageNumber: number; point: ReviewSourcePoint;
}): FoundOpeningSymbol | null {
  const floor = input.document.floors.find((entry) => entry.id === input.floorId);
  const pattern = new RegExp(`^source-proposal:${input.pageNumber}:opening:\\d+$`);
  let best: (FoundOpeningSymbol & { distance: number }) | null = null;
  for (const annotation of floor?.annotations ?? []) {
    const geometry = annotation.geometry;
    if (!pattern.test(annotation.id) || geometry.kind !== "source_drawing" || geometry.sourceId !== input.sourceId) continue;
    const [a, b] = geometry.points;
    if (!a || !b) continue;
    const distance = distanceToSpan(input.point, a, b);
    if (distance > Math.max(MIN_REACH_PX, Math.hypot(b.x - a.x, b.y - a.y)) || (best && best.distance <= distance)) continue;
    best = { id: annotation.id, kind: openingKindFromNote(annotation.text ?? ""), points: [{ ...a }, { ...b }], distance };
  }
  return best && { id: best.id, kind: best.kind, points: best.points };
}
