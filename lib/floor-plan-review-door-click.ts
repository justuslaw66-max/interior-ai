/**
 * "Click on a door": in the review's doors and windows step, a click on a door or window the reader found on the page
 * but could not place (its unverified span, `source-proposal:{page}:opening:{i}`, as the reader, a photo review or the
 * reviewer left it) fills in both of its ends and its kind, ready to add as an opening. A click counts as on the
 * symbol within its span's length of the span (a door's swing reaches that far from its wall). A span the reviewer
 * marked as an interior item or a boundary is not an opening and is never filled in.
 */
import type { FloorPlanAnnotationV2, FloorPlanDocumentV2, FloorPlanOpeningKindV2 } from "@/lib/floor-plan-document-v2";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import { INTERIOR_ITEM_REVIEW_CONFIGURATION } from "@/lib/floor-plan-source-span-review";

export type FoundOpeningSymbol = { id: string; kind: FloorPlanOpeningKindV2; points: [ReviewSourcePoint, ReviewSourcePoint] };

/** Within this many page px of a short span still counts as on it. */
const MIN_REACH_PX = 12;
/** The kind a span's note names: "Unverified door span", "Pixel-supported window span", "Manually corrected window proposal". */
const NOTE_KIND = /^(?:Unverified|Pixel-supported|Manually (?:corrected|marked)) (\S+) (?:span|proposal)/i;

function distanceToSpan(point: ReviewSourcePoint, a: ReviewSourcePoint, b: ReviewSourcePoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** The opening kind a span's note names, among those the doors and windows step offers; null where it is no opening. */
export function openingKindFromNote(note: string): FloorPlanOpeningKindV2 | null {
  const named = NOTE_KIND.exec(note)?.[1] ?? "";
  if (/boundary|interior/i.test(named) || /^Reviewed interior item/i.test(note)) return null;
  if (/window|vent|louvre/i.test(named)) return "window";
  if (/passage|opening/i.test(named)) return "open_passage";
  return "door";
}

function openingSpan(annotation: FloorPlanAnnotationV2, sourceId: string, pageNumber: number) {
  const geometry = annotation.geometry;
  if (!new RegExp(`^source-proposal:${pageNumber}:opening:\\d+$`).test(annotation.id)) return null;
  if (annotation.configurationId === INTERIOR_ITEM_REVIEW_CONFIGURATION || geometry.kind !== "source_drawing") return null;
  const kind = openingKindFromNote(annotation.text ?? "");
  const [a, b] = geometry.points;
  return geometry.sourceId === sourceId && kind && a && b ? { kind, a, b } : null;
}

/** The found door or window symbol nearest a click on the page, if the click is on it. */
export function openingSymbolAt(input: {
  document: FloorPlanDocumentV2; floorId: string; sourceId: string; pageNumber: number; point: ReviewSourcePoint;
}): FoundOpeningSymbol | null {
  const floor = input.document.floors.find((entry) => entry.id === input.floorId);
  let best: (FoundOpeningSymbol & { distance: number }) | null = null;
  for (const annotation of floor?.annotations ?? []) {
    const span = openingSpan(annotation, input.sourceId, input.pageNumber);
    if (!span) continue;
    const distance = distanceToSpan(input.point, span.a, span.b);
    if (distance > Math.max(MIN_REACH_PX, Math.hypot(span.b.x - span.a.x, span.b.y - span.a.y)) || (best && best.distance <= distance)) continue;
    best = { id: annotation.id, kind: span.kind, points: [{ ...span.a }, { ...span.b }], distance };
  }
  return best && { id: best.id, kind: best.kind, points: best.points };
}
