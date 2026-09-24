"use client";

import { useCallback } from "react";
import type { useDesignPageFloorPlanTracing } from "@/lib/useDesignPageFloorPlanTracing";
import type { useDesignPageFloorPlanUnderlayController } from "@/lib/useDesignPageFloorPlanUnderlayController";
import type { useDesignPagePlanEditingFacade } from "@/lib/useDesignPagePlanEditingFacade";

type EditingActions = Parameters<typeof useDesignPagePlanEditingFacade>[0]["actions"];
type UnderlayActions = Parameters<typeof useDesignPageFloorPlanUnderlayController>[0]["actions"];
type TracingActions = Parameters<typeof useDesignPageFloorPlanTracing>[0]["actions"];

export type DesignPagePlanEmptyCanvasResetActions = {
  document: Pick<EditingActions["document"], "setPlanAnnotations" | "setPlanFixedElements">;
  floorPlanState: Pick<
    UnderlayActions,
    | "setFloorPlanUnderlay"
    | "setFloorPlanPdfSourceReady"
    | "setFloorPlanPdfRenderingPage"
    | "resetFloorPlanInteraction"
    | "resetFloorPlanCalibration"
    | "clearFloorPlanTraceBuffers"
    | "revokeUnderlayObjectUrl"
  >;
  navigation: Pick<EditingActions["navigation"], "goPlan"> &
    Pick<TracingActions, "setDesignPanelOpen"> &
    Pick<UnderlayActions, "setViewMode">;
};

/** After the last room is deleted, return the plan workspace to a blank 2D canvas. */
export function useDesignPagePlanEmptyCanvasReset(
  actions: DesignPagePlanEmptyCanvasResetActions
) {
  return useCallback(() => {
    actions.document.setPlanAnnotations([]);
    actions.document.setPlanFixedElements([]);
    actions.floorPlanState.revokeUnderlayObjectUrl();
    actions.floorPlanState.setFloorPlanUnderlay(null);
    actions.floorPlanState.setFloorPlanPdfSourceReady(false);
    actions.floorPlanState.setFloorPlanPdfRenderingPage(null);
    actions.floorPlanState.resetFloorPlanInteraction();
    actions.floorPlanState.resetFloorPlanCalibration();
    actions.floorPlanState.clearFloorPlanTraceBuffers();
    actions.navigation.setViewMode("2d");
    actions.navigation.goPlan();
    actions.navigation.setDesignPanelOpen(true);
  }, [actions]);
}
