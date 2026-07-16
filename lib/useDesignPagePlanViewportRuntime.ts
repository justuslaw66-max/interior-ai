"use client";

import { useState } from "react";

import type { DesignPagePlanDebugMetrics } from "@/lib/useDesignPageQaReadModel";
import {
  useDesignPageFloorPlanDocumentState,
  useDesignPagePlanDocumentState,
} from "@/lib/useDesignPageDocumentStateController";
import {
  useDesignPageCameraBridgeController,
  type UseDesignPageCameraBridgeControllerInput,
} from "@/lib/useDesignPageCameraBridgeController";

export type UseDesignPagePlanViewportRuntimeInput = {
  configuration: {
    camera: UseDesignPageCameraBridgeControllerInput["configuration"];
  };
};

const INITIAL_PLAN_DEBUG_METRICS: DesignPagePlanDebugMetrics = {
  zoom: 0,
  visibleLabelCount: 0,
  projectedRoomMinWidthPx: 0,
  projectedRoomMinHeightPx: 0,
  projectedRoomMinAreaPx: 0,
  cameraValid: true,
  cameraRecoveries: 0,
  cameraTargetX: 0,
  cameraTargetZ: 0,
};

/** Owns the contiguous plan-document, viewport, selection, and camera bridge slot. */
export function useDesignPagePlanViewportRuntime({
  configuration,
}: UseDesignPagePlanViewportRuntimeInput) {
  const [planDebugMetrics, setPlanDebugMetrics] =
    useState<DesignPagePlanDebugMetrics>(INITIAL_PLAN_DEBUG_METRICS);
  const [showLayoutDebugOverlay, setShowLayoutDebugOverlay] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const planDocument = useDesignPagePlanDocumentState();
  const floorPlanDocument = useDesignPageFloorPlanDocumentState();
  const [selectedPlanOverlayId, setSelectedPlanOverlayId] =
    useState<string | null>(null);
  const [suppressedDoorwaySuggestionKeys, setSuppressedDoorwaySuggestionKeys] =
    useState<string[]>([]);
  const [selectedPlanRoomId, setSelectedPlanRoomId] =
    useState<string | null>(null);
  const cameraBridge = useDesignPageCameraBridgeController({
    configuration: configuration.camera,
  });

  return {
    boundaries: { planDocument, floorPlanDocument, cameraBridge },
    state: {
      diagnostics: {
        planDebugMetrics,
        showLayoutDebugOverlay,
        viewportSize,
      },
      plan: planDocument.state,
      floorPlan: floorPlanDocument.state,
      overlaySelection: {
        selectedPlanOverlayId,
        suppressedDoorwaySuggestionKeys,
        selectedPlanRoomId,
      },
      camera: cameraBridge.state,
    },
    actions: {
      diagnostics: {
        setPlanDebugMetrics,
        setShowLayoutDebugOverlay,
        setViewportSize,
      },
      plan: planDocument.actions,
      floorPlan: floorPlanDocument.actions,
      overlaySelection: {
        setSelectedPlanOverlayId,
        setSuppressedDoorwaySuggestionKeys,
        setSelectedPlanRoomId,
      },
      camera: cameraBridge.actions,
    },
    refs: {
      plan: planDocument.refs,
      floorPlan: floorPlanDocument.refs,
      camera: cameraBridge.refs,
    },
    configuration: { camera: cameraBridge.configuration },
  };
}
