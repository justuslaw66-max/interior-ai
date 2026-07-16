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
      designSnapshot: snapshot.state.designSnapshot,
      planOpenings: plan.state.planOpenings,
      planAnnotations: plan.state.planAnnotations,
      planFixedElements: plan.state.planFixedElements,
      planTheme: plan.state.planTheme,
      planLayers: plan.state.planLayers,
      planLayerPreset: plan.state.planLayerPreset,
      planMeasurementUnit: plan.state.planMeasurementUnit,
      exportStylePreset: plan.state.exportStylePreset,
      floorPlanUnderlay: floorPlan.state.floorPlanUnderlay,
    },
    actions: {
      setDesignSnapshot: snapshot.actions.setDesignSnapshot,
      setPlanAnnotationsState: plan.restoreActions.setPlanAnnotationsState,
      setPlanFixedElementsState: plan.restoreActions.setPlanFixedElementsState,
      setPlanOpeningsState: plan.restoreActions.setPlanOpeningsState,
      setPlanThemeState: plan.restoreActions.setPlanThemeState,
      setPlanLayersState: plan.restoreActions.setPlanLayersState,
      setPlanLayerPresetState: plan.restoreActions.setPlanLayerPresetState,
      setPlanMeasurementUnitState:
        plan.restoreActions.setPlanMeasurementUnitState,
      setExportStylePresetState:
        plan.restoreActions.setExportStylePresetState,
      setFloorPlanUnderlayState:
        floorPlan.restoreActions.setFloorPlanUnderlayState,
    },
    refs: {
      designSnapshotRef: snapshot.refs.designSnapshotRef,
      planOpeningsRef: plan.refs.planOpeningsRef,
      planAnnotationsRef: plan.refs.planAnnotationsRef,
      planFixedElementsRef: plan.refs.planFixedElementsRef,
      planThemeRef: plan.refs.planThemeRef,
      planLayersRef: plan.refs.planLayersRef,
      planLayerPresetRef: plan.refs.planLayerPresetRef,
      planMeasurementUnitRef: plan.refs.planMeasurementUnitRef,
      exportStylePresetRef: plan.refs.exportStylePresetRef,
      floorPlanUnderlayRef: floorPlan.refs.floorPlanUnderlayRef,
    },
  });

  return useDesignPageDocumentHistoryController({
    state: {
      designSnapshot: snapshot.state.designSnapshot,
      floorPlanUnderlay: floorPlan.state.floorPlanUnderlay,
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
