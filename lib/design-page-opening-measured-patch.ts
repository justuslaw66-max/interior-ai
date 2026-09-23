import {
  applyOpeningKindPlanToMetrics,
  floorPlanOpeningChangesFromDesignPageMetrics,
  type DesignPageOpeningMetricsPatch,
} from "@/lib/design-page-opening-metrics";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  applyFloorPlanTopologyMutationV2,
  type FloorPlanOpeningChangesV2,
  type FloorPlanTopologyMutationContextV2,
  type FloorPlanTopologyMutationResultV2,
} from "@/lib/floor-plan-topology-mutations";

export function hasDesignPageOpeningMeasurement(metrics: DesignPageOpeningMetricsPatch) {
  return (metrics.widthMeters !== undefined && metrics.widthEvidence !== undefined) ||
    (metrics.heightMeters !== undefined && metrics.heightEvidence !== undefined) ||
    (metrics.bottomMeters !== undefined && metrics.bottomEvidence !== undefined);
}

export function applyDesignPageOpeningMeasurements({
  createContext,
  document,
  floorId,
  metrics,
  openingId,
}: {
  createContext: (openingId: string) => FloorPlanTopologyMutationContextV2;
  document: FloorPlanDocumentV2;
  floorId: string;
  metrics: DesignPageOpeningMetricsPatch;
  openingId: string;
}): FloorPlanTopologyMutationResultV2 | null {
  const changes = floorPlanOpeningChangesFromDesignPageMetrics(metrics);
  if (!Object.keys(changes).length) return null;
  const context = createContext(openingId);
  return applyFloorPlanTopologyMutationV2(
    document,
    {
      kind: "update_opening",
      floorId,
      openingId,
      changes,
      mutationPurpose: metrics.kind ? "opening_kind_change" : "measurement_edit",
      ...(metrics.openingOverrideAuthorization
        ? { reviewedEvidenceOverride: metrics.openingOverrideAuthorization }
        : {}),
    },
    {
      ...context,
      note: metrics.measurementNote?.trim() || context.note,
    }
  );
}

type CanonicalOpeningOperationState = {
  kind: "door" | "window" | "open_passage" | "gate" | "vent" | "louvre";
  operation: "swing" | "sliding" | "folding" | "fixed" | "open";
  hinge: "start" | "end" | "none" | "unknown";
  handing: "left" | "right" | "double" | "none" | "unknown";
};

export function planCanonicalOpeningMetrics({
  canonical, metrics, opening,
}: {
  canonical: CanonicalOpeningOperationState;
  metrics: DesignPageOpeningMetricsPatch;
  opening: RoomOpening2D;
}) {
  const plannedMetrics = applyOpeningKindPlanToMetrics(opening, metrics);
  const changes: FloorPlanOpeningChangesV2 = {
    ...floorPlanOpeningChangesFromDesignPageMetrics(plannedMetrics),
  };
  if (plannedMetrics.kind === "window") {
    Object.assign(changes, { kind: "window" as const, operation: "fixed" as const,
      hinge: "none" as const, handing: "none" as const });
  } else if (plannedMetrics.kind === "door") {
    const wasDoor = canonical.kind === "door" || canonical.kind === "gate";
    Object.assign(changes, { kind: "door" as const,
      operation: wasDoor ? canonical.operation : "swing",
      hinge: wasDoor ? canonical.hinge : "unknown",
      handing: wasDoor ? canonical.handing : "unknown" });
  }
  return { changes, plannedMetrics };
}

export function applyCanonicalOpeningCompositeMeasurements({
  changes, createContext, document, floorId, metrics, openingId,
}: {
  changes: FloorPlanOpeningChangesV2;
  createContext: (openingId: string) => FloorPlanTopologyMutationContextV2;
  document: FloorPlanDocumentV2;
  floorId: string;
  metrics: DesignPageOpeningMetricsPatch;
  openingId: string;
}): FloorPlanTopologyMutationResultV2 | null {
  const mergedMetrics = { ...metrics };
  const mergedChanges = { ...floorPlanOpeningChangesFromDesignPageMetrics(metrics), ...changes };
  if (!Object.keys(mergedChanges).length) return null;
  const context = createContext(openingId);
  return applyFloorPlanTopologyMutationV2(
    document,
    {
      kind: "update_opening",
      floorId,
      openingId,
      changes: mergedChanges,
      mutationPurpose: metrics.kind ? "opening_kind_change" : "measurement_edit",
      ...(mergedMetrics.openingOverrideAuthorization
        ? { reviewedEvidenceOverride: mergedMetrics.openingOverrideAuthorization }
        : {}),
    },
    { ...context, note: metrics.measurementNote?.trim() || context.note }
  );
}
