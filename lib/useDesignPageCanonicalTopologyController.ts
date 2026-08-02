"use client";

import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import {
  applyFloorPlanMeasuredPropertyMutationV2,
  FloorPlanMeasuredPropertyMutationErrorV2,
  type FloorPlanConsumerMeasurementEvidenceV2,
  type FloorPlanMeasuredPropertyMutationResultV2,
} from "@/lib/floor-plan-measured-property-mutations";
import {
  buildCanonicalOpeningUpdateMutationV2,
  commitCanonicalTopologyMutationToSnapshotV2,
  getCanonicalOpeningByIdV2,
} from "@/lib/floor-plan-topology-editor";
import {
  applyFloorPlanTopologyMutationV2,
  FloorPlanTopologyMutationErrorV2,
  type FloorPlanOpeningChangesV2,
  type FloorPlanTopologyMutationContextV2,
} from "@/lib/floor-plan-topology-mutations";
import type { DesignSnapshot } from "@/lib/room-types";

type FunctionalStateAction<T> = T | ((previous: T) => T);

export type UseDesignPageCanonicalTopologyControllerInput = {
  refs: {
    designSnapshot: MutableRefObject<DesignSnapshot>;
    planOpenings: MutableRefObject<RoomOpening2D[]>;
  };
  actions: {
    setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
    setPlanOpenings: (next: FunctionalStateAction<RoomOpening2D[]>) => void;
    setPlanFixedElements: (next: FunctionalStateAction<FixedElement2D[]>) => void;
    showToast: (message: string) => void;
  };
};

type GestureGroup = {
  openingId: string;
  mutationId: string;
  touchedAt: number;
};

export type CanonicalOpeningDeleteResultV2 =
  | "not_canonical"
  | "committed"
  | "blocked";

export type DesignPageCanonicalTopologyActions = {
  moveOpening: (openingId: string, centerOffsetMeters: number) => boolean;
  resizeOpening: (
    openingId: string,
    metrics: { widthMeters: number; offsetMeters: number }
  ) => boolean;
  updateOpeningMetrics: (
    openingId: string,
    metrics: DesignPageOpeningMetricsPatch
  ) => boolean;
  removeOpening: (openingId: string) => CanonicalOpeningDeleteResultV2;
};

function millimetres(meters: number): number {
  return Math.round(meters * 1000);
}

export function useDesignPageCanonicalTopologyController({
  refs,
  actions,
}: UseDesignPageCanonicalTopologyControllerInput) {
  const sequenceRef = useRef(0);
  const gestureGroupRef = useRef<GestureGroup | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const createContext = useCallback(
    (openingId: string): FloorPlanTopologyMutationContextV2 => {
      const now = Date.now();
      const previous = gestureGroupRef.current;
      if (!previous || previous.openingId !== openingId || now - previous.touchedAt > 800) {
        sequenceRef.current += 1;
        gestureGroupRef.current = {
          openingId,
          mutationId: `opening-edit:${openingId}:${now.toString(36)}:${sequenceRef.current}`,
          touchedAt: now,
        };
      } else {
        previous.touchedAt = now;
      }
      const group = gestureGroupRef.current!;
      sequenceRef.current += 1;
      return {
        mutationId: group.mutationId,
        nextRevisionId: `editor-revision:${now.toString(36)}:${sequenceRef.current}`,
        actorId: "design-editor",
        mutatedAt: new Date(now).toISOString(),
        note: "Opening geometry edited in the design workspace.",
      };
    },
    []
  );

  const reportBlockedEdit = useCallback(
    (cause: unknown) => {
      if (
        cause instanceof FloorPlanTopologyMutationErrorV2 &&
        cause.code === "NO_OP_MUTATION"
      ) {
        return;
      }
      const message = cause instanceof Error ? cause.message : "The opening edit is not valid.";
      if (lastErrorRef.current === message) return;
      lastErrorRef.current = message;
      actions.showToast(`Opening change blocked: ${message}`);
    },
    [actions]
  );

  const commitOpeningMetrics = useCallback(
    ({
      openingId,
      centerOffsetMm,
      widthMm,
      changes,
    }: {
      openingId: string;
      centerOffsetMm: number;
      widthMm: number;
      changes?: FloorPlanOpeningChangesV2;
    }): boolean => {
      const snapshot = refs.designSnapshot.current;
      const document = snapshot.floorPlan?.canonicalDocument;
      if (!document) return false;
      const canonicalExists = document.floors.some((floor) =>
        floor.openings.some((opening) => opening.id === openingId)
      );
      if (!canonicalExists) return false;
      const opening = refs.planOpenings.current.find((candidate) => candidate.id === openingId);
      if (!opening) {
        reportBlockedEdit(new Error(`Opening ${openingId} has no editable projection.`));
        return true;
      }

      try {
        const operation = buildCanonicalOpeningUpdateMutationV2({
          snapshot,
          opening,
          centerOffsetMm,
          widthMm,
          changes,
        });
        const result = applyFloorPlanTopologyMutationV2(
          document,
          operation,
          createContext(openingId)
        );
        const committed = commitCanonicalTopologyMutationToSnapshotV2(snapshot, result);
        actions.setDesignSnapshot(committed.snapshot);
        actions.setPlanOpenings(committed.openings);
        actions.setPlanFixedElements(committed.fixedElements);
        lastErrorRef.current = null;
      } catch (cause) {
        reportBlockedEdit(cause);
      }
      return true;
    },
    [actions, createContext, refs, reportBlockedEdit]
  );

  const moveOpening = useCallback(
    (openingId: string, centerOffsetMeters: number): boolean => {
      const opening = refs.planOpenings.current.find((candidate) => candidate.id === openingId);
      if (!opening) return false;
      return commitOpeningMetrics({
        openingId,
        centerOffsetMm: millimetres(centerOffsetMeters),
        widthMm: opening.widthMm,
      });
    },
    [commitOpeningMetrics, refs.planOpenings]
  );

  const resizeOpening = useCallback(
    (
      openingId: string,
      metrics: { widthMeters: number; offsetMeters: number }
    ): boolean =>
      commitOpeningMetrics({
        openingId,
        centerOffsetMm: millimetres(metrics.offsetMeters),
        widthMm: millimetres(metrics.widthMeters),
      }),
    [commitOpeningMetrics]
  );

  const updateOpeningMetrics = useCallback(
    (openingId: string, metrics: DesignPageOpeningMetricsPatch): boolean => {
      const snapshot = refs.designSnapshot.current;
      const document = snapshot.floorPlan?.canonicalDocument;
      const opening = refs.planOpenings.current.find((candidate) => candidate.id === openingId);
      if (!document || !opening) return false;
      let canonical;
      try {
        canonical = getCanonicalOpeningByIdV2(document, openingId);
      } catch {
        return false;
      }
      const canonicalFloor = document.floors.find((floor) =>
        floor.openings.some((candidate) => candidate.id === openingId)
      );
      if (!canonicalFloor) return false;
      const measuredHeight =
        metrics.heightMeters !== undefined && metrics.heightEvidence !== undefined;
      const measuredSill =
        metrics.bottomMeters !== undefined && metrics.bottomEvidence !== undefined;
      if (measuredHeight || measuredSill) {
        let currentDocument = document;
        let latestResult: FloorPlanMeasuredPropertyMutationResultV2 | null = null;
        const commitMeasurement = (
          kind: "opening_height" | "opening_sill_height",
          valueMeters: number,
          evidence: FloorPlanConsumerMeasurementEvidenceV2
        ) => {
          const baseContext = createContext(openingId);
          latestResult = applyFloorPlanMeasuredPropertyMutationV2(
            currentDocument,
            {
              target: { kind, floorId: canonicalFloor.id, openingId },
              valueMm: millimetres(valueMeters),
              evidence,
            },
            {
              ...baseContext,
              note: metrics.measurementNote?.trim() || baseContext.note,
            }
          );
          currentDocument = latestResult.document;
        };
        try {
          if (measuredHeight) {
            commitMeasurement(
              "opening_height",
              metrics.heightMeters!,
              metrics.heightEvidence!
            );
          }
          if (measuredSill) {
            commitMeasurement(
              "opening_sill_height",
              metrics.bottomMeters!,
              metrics.bottomEvidence!
            );
          }
          if (!latestResult) return true;
          const committed = commitCanonicalTopologyMutationToSnapshotV2(
            snapshot,
            latestResult
          );
          actions.setDesignSnapshot(committed.snapshot);
          actions.setPlanOpenings(committed.openings);
          actions.setPlanFixedElements(committed.fixedElements);
          lastErrorRef.current = null;
        } catch (cause) {
          const message =
            cause instanceof FloorPlanMeasuredPropertyMutationErrorV2
              ? cause.message
              : cause instanceof Error
                ? cause.message
                : "The measurement is not valid.";
          if (lastErrorRef.current !== message) {
            lastErrorRef.current = message;
            actions.showToast(`Measurement change blocked: ${message}`);
          }
        }
        return true;
      }
      const nextKind = metrics.kind;
      const changes: FloorPlanOpeningChangesV2 = {
        ...(metrics.heightMeters !== undefined
          ? { heightMm: millimetres(metrics.heightMeters) }
          : {}),
        ...(metrics.bottomMeters !== undefined
          ? { sillHeightMm: millimetres(metrics.bottomMeters) }
          : {}),
      };
      if (nextKind === "window") {
        Object.assign(changes, {
          kind: "window" as const,
          operation: "fixed" as const,
          hinge: "none" as const,
          handing: "none" as const,
        });
      } else if (nextKind === "door") {
        Object.assign(changes, {
          kind: "door" as const,
          operation:
            canonical.kind === "door" || canonical.kind === "gate"
              ? canonical.operation
              : "swing",
          hinge:
            canonical.kind === "door" || canonical.kind === "gate"
              ? canonical.hinge
              : "unknown",
          handing:
            canonical.kind === "door" || canonical.kind === "gate"
              ? canonical.handing
              : "unknown",
          sillHeightMm: 0,
        });
      }
      return commitOpeningMetrics({
        openingId,
        centerOffsetMm:
          metrics.offsetMeters !== undefined
            ? millimetres(metrics.offsetMeters)
            : opening.offsetMm,
        widthMm:
          metrics.widthMeters !== undefined
            ? millimetres(metrics.widthMeters)
            : opening.widthMm,
        changes,
      });
    },
    [actions, commitOpeningMetrics, createContext, refs]
  );

  const removeOpening = useCallback(
    (openingId: string): CanonicalOpeningDeleteResultV2 => {
      const snapshot = refs.designSnapshot.current;
      const document = snapshot.floorPlan?.canonicalDocument;
      if (!document) return "not_canonical";
      const floor = document.floors.find((candidate) =>
        candidate.openings.some((opening) => opening.id === openingId)
      );
      if (!floor) return "not_canonical";

      try {
        const result = applyFloorPlanTopologyMutationV2(
          document,
          { kind: "remove_opening", floorId: floor.id, openingId },
          createContext(openingId)
        );
        const committed = commitCanonicalTopologyMutationToSnapshotV2(snapshot, result);
        actions.setDesignSnapshot(committed.snapshot);
        actions.setPlanOpenings(committed.openings);
        actions.setPlanFixedElements(committed.fixedElements);
        lastErrorRef.current = null;
        return "committed";
      } catch (cause) {
        reportBlockedEdit(cause);
        return "blocked";
      }
    },
    [actions, createContext, refs, reportBlockedEdit]
  );

  return {
    actions: {
      moveOpening,
      resizeOpening,
      updateOpeningMetrics,
      removeOpening,
    } satisfies DesignPageCanonicalTopologyActions,
  };
}
