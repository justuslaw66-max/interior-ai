"use client";

import type { Dispatch, SetStateAction } from "react";

import {
  useDesignPageDocumentHistoryController,
} from "@/lib/useDesignPageDocumentHistoryController";
import {
  useDesignPageDocumentRefSynchronization,
  type useDesignPageFloorPlanDocumentState,
  type useDesignPagePlanDocumentState,
  type useDesignPageSnapshotDocumentState,
} from "@/lib/useDesignPageDocumentStateController";

type PlanDocumentBoundary = ReturnType<
  typeof useDesignPagePlanDocumentState
>;
type FloorPlanDocumentBoundary = ReturnType<
  typeof useDesignPageFloorPlanDocumentState
>;
type SnapshotDocumentBoundary = ReturnType<
  typeof useDesignPageSnapshotDocumentState
>;

export type UseDesignPageDocumentHistoryWorkspaceInput = {
  boundaries: {
    plan: PlanDocumentBoundary;
    floorPlan: FloorPlanDocumentBoundary;
    snapshot: SnapshotDocumentBoundary;
  };
  actions: {
    bumpHistoryRevision: Dispatch<SetStateAction<number>>;
  };
};

export type DesignPageDocumentHistoryWorkspace = ReturnType<
  typeof useDesignPageDocumentHistoryController
>;

/**
 * Registers document-ref synchronization before history and keeps the
 * snapshot adapters private to this boundary. The returned state, actions,
 * and refs retain the document-history controller's existing contract.
 */
export function useDesignPageDocumentHistoryWorkspace({
  boundaries: { plan, floorPlan, snapshot },
  actions: { bumpHistoryRevision },
}: UseDesignPageDocumentHistoryWorkspaceInput): DesignPageDocumentHistoryWorkspace {
  const {
    adapters: { captureHistorySnapshot, restoreHistorySnapshot },
  } = useDesignPageDocumentRefSynchronization({
    state: {
      planOpenings: plan.state.planOpenings,
      planAnnotations: plan.state.planAnnotations,
      planFixedElements: plan.state.planFixedElements,
      floorPlanUnderlay: floorPlan.state.floorPlanUnderlay,
    },
    actions: {
      setDesignSnapshot: snapshot.actions.setDesignSnapshot,
      setPlanAnnotations: plan.actions.setPlanAnnotations,
      setPlanFixedElements: plan.actions.setPlanFixedElements,
      setPlanOpenings: plan.actions.setPlanOpenings,
      setFloorPlanUnderlay: floorPlan.actions.setFloorPlanUnderlay,
    },
    refs: {
      designSnapshotRef: snapshot.refs.designSnapshotRef,
      planOpeningsRef: plan.refs.planOpeningsRef,
      planAnnotationsRef: plan.refs.planAnnotationsRef,
      planFixedElementsRef: plan.refs.planFixedElementsRef,
      floorPlanUnderlayRef: floorPlan.refs.floorPlanUnderlayRef,
    },
  });

  return useDesignPageDocumentHistoryController({
    state: {
      designSnapshot: snapshot.state.designSnapshot,
      floorPlanUnderlay: floorPlan.state.floorPlanUnderlay,
      planAnnotations: plan.state.planAnnotations,
      planOpenings: plan.state.planOpenings,
      planFixedElements: plan.state.planFixedElements,
    },
    adapters: {
      captureSnapshot: captureHistorySnapshot,
      restoreSnapshot: restoreHistorySnapshot,
      onHistoryChange: () =>
        bumpHistoryRevision((revision) => revision + 1),
    },
    actions: {
      setFloorPlanUnderlay: floorPlan.actions.setFloorPlanUnderlay,
      setPlanAnnotations: plan.actions.setPlanAnnotations,
      setPlanOpenings: plan.actions.setPlanOpenings,
      setPlanFixedElements: plan.actions.setPlanFixedElements,
      setFloorPlanPdfSourceReady:
        floorPlan.actions.setFloorPlanPdfSourceReady,
      resetFloorPlanInteraction: floorPlan.actions.resetFloorPlanInteraction,
      revokeFloorPlanUnderlayUrl:
        floorPlan.actions.revokeFloorPlanUnderlayUrl,
    },
    refs: {
      designSnapshotRef: snapshot.refs.designSnapshotRef,
      floorPlanPdfSourceDataRef: floorPlan.refs.floorPlanPdfSourceDataRef,
    },
  });
}
