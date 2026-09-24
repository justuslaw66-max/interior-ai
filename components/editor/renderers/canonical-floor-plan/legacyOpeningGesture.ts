import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import { legacyOpeningOffsetAtWorldPoint } from "@/lib/design-page-opening-interaction";
import type { CanonicalOpeningEditHandler } from "./openingDrag";

export function legacyOpeningGestureHandler(openings: readonly RoomRendererOpening[],
  onMove?: (id: string, offsetMeters: number) => void,
  onResize?: (id: string, metrics: { widthMeters: number; offsetMeters: number }) => void): CanonicalOpeningEditHandler {
  return (openingId, metrics, mode) => {
    const source = openings.find(({ id }) => id === openingId);
    const host = source?.hostResolution?.status === "resolved" ? source.hostResolution.host : null;
    if (!host) return;
    const offsetMeters = legacyOpeningOffsetAtWorldPoint(host, { x: metrics.centerMm.xMm / 1000, z: metrics.centerMm.zMm / 1000 });
    if (offsetMeters === null) return;
    if (mode === "resize") onResize?.(openingId, { widthMeters: metrics.widthMm / 1000, offsetMeters });
    else onMove?.(openingId, offsetMeters);
  };
}
