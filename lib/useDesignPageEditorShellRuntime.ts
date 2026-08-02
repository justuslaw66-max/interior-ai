"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import type { Plan2DCameraDiagnostics } from "@/components/editor/camera/Plan2DCameraInvariantGuard";
import {
  mergeDesignPageCameraDiagnostics,
  mergeDesignPagePlanMetrics,
  type DesignPagePlanMetricUpdate,
} from "@/lib/design-page-editor-shell-metrics";
import type { DesignPagePlanDebugMetrics } from "@/lib/useDesignPageQaReadModel";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import {
  useDesignPagePanelMode,
  type DesignPageEditorMode,
} from "@/lib/useDesignPagePanelMode";
import { useDesignPageSurfaceStateController } from "@/lib/useDesignPageSurfaceStateController";

export type UseDesignPageEditorShellRuntimeInput = {
  state: {
    debugLayoutParam: string | null;
    designPanelOpen: boolean;
    initialWorkspace?: string | null;
  };
  actions: {
    setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
    setDesignPanelCollapsed: Dispatch<SetStateAction<boolean>>;
    setItemCartOpen: Dispatch<SetStateAction<boolean>>;
    diagnostics: {
      setPlanDebugMetrics: Dispatch<
        SetStateAction<DesignPagePlanDebugMetrics>
      >;
      setShowLayoutDebugOverlay: Dispatch<SetStateAction<boolean>>;
      setViewportSize: Dispatch<
        SetStateAction<{ width: number; height: number }>
      >;
    };
  };
  configuration: { nodeEnv: string | undefined };
};

/** Owns the contiguous cart, surface, editor-mode, panel, and shell-effect slot. */
export function useDesignPageEditorShellRuntime({
  state,
  actions,
  configuration,
}: UseDesignPageEditorShellRuntimeInput) {
  const {
    setDesignPanelOpen,
    setDesignPanelCollapsed,
    setItemCartOpen,
  } = actions;
  const {
    setPlanDebugMetrics,
    setShowLayoutDebugOverlay,
    setViewportSize,
  } = actions.diagnostics;
  const [hoveredCartInstanceId, setHoveredCartInstanceId] =
    useState<string | null>(null);
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [presentModeRoomId, setPresentModeRoomId] =
    useState<string | null>(null);
  const [shoppingReadinessFilter, setShoppingReadinessFilter] =
    useState<ShoppingReadinessFilter>("all");
  const surfaceState = useDesignPageSurfaceStateController();
  const [editorMode, setEditorMode] =
    useState<DesignPageEditorMode>(
      state.initialWorkspace === "furnish" ? "adjust" : "design"
    );
  const [guidedPlanStartMode, setGuidedPlanStartMode] =
    useState<PlanStartMode>("start");
  const panelMode = useDesignPagePanelMode({
    editorMode,
    setEditorMode,
    designPanelOpen: state.designPanelOpen,
    setDesignPanelOpen,
    setItemCartOpen,
  });

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, [setViewportSize]);

  useEffect(() => {
    if (configuration.nodeEnv === "production") return;

    let storedPreference = false;
    try {
      storedPreference =
        window.localStorage.getItem("design_layout_debug") === "1";
    } catch {
      storedPreference = false;
    }

    setShowLayoutDebugOverlay(
      state.debugLayoutParam === "1" || storedPreference
    );
  }, [
    configuration.nodeEnv,
    setShowLayoutDebugOverlay,
    state.debugLayoutParam,
  ]);

  const handlePlanDebugMetricsChange = useCallback(
    (next: DesignPagePlanMetricUpdate) => {
      setPlanDebugMetrics((current) =>
        mergeDesignPagePlanMetrics(current, next)
      );
    },
    [setPlanDebugMetrics]
  );
  const handlePlan2DCameraDiagnosticsChange = useCallback(
    (next: Plan2DCameraDiagnostics) => {
      setPlanDebugMetrics((current) =>
        mergeDesignPageCameraDiagnostics(current, next)
      );
    },
    [setPlanDebugMetrics]
  );

  useEffect(() => {
    if (!state.designPanelOpen) {
      setDesignPanelCollapsed(false);
    }
  }, [setDesignPanelCollapsed, state.designPanelOpen]);

  return {
    boundaries: { surfaceState },
    state: {
      cart: { hoveredCartInstanceId },
      presentation: { showPresentModal, presentModeRoomId },
      shopping: { shoppingReadinessFilter },
      surface: surfaceState.state,
      editor: { editorMode, guidedPlanStartMode },
      panel: {
        designControlsPanelMode: panelMode.designControlsPanelMode,
        designControlsPanelVisible: panelMode.designControlsPanelVisible,
      },
    },
    actions: {
      cart: { setHoveredCartInstanceId },
      presentation: { setShowPresentModal, setPresentModeRoomId },
      shopping: { setShoppingReadinessFilter },
      surface: surfaceState.actions,
      editor: { setEditorMode, setGuidedPlanStartMode },
      panel: {
        goPlan: panelMode.goPlan,
        goFurnish: panelMode.goFurnish,
        goAiDesign: panelMode.goAiDesign,
        goShop: panelMode.goShop,
      },
      diagnostics: {
        handlePlanDebugMetricsChange,
        handlePlan2DCameraDiagnosticsChange,
      },
    },
    configuration: { aiDesignEnabled: true },
  };
}
