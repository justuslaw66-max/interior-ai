import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";

export function buildOpeningSelectionSummary(opening: RoomOpening2D, roomName: string, unit: PlanMeasurementUnit) {
  const kind = opening.kind === "door" ? "Door" : "Window";
  return {
    kind,
    title: `${kind} on ${opening.canonicalHost ? "selected wall" : opening.wall}`,
    detail: roomName,
    metrics: [
      `${formatCabinetMeasurement(opening.widthMm, unit)} wide`,
      `${formatCabinetMeasurement(opening.offsetMm, unit)} from center`,
    ],
  };
}
