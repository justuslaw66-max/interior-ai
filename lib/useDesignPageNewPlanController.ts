"use client";

import { useCallback, useRef, useState } from "react";
import type { PendingPlanTemplateReplacement } from "@/lib/useDesignPageFloorPlanUnderlayController";
import type { PreserveCurrentDesignResult } from "@/lib/useDesignPagePersistence";

type MutableRef<T> = { current: T };

export type DesignPageNewPlanControllerState = {
  isAuthenticated: boolean;
  pendingReplacement: PendingPlanTemplateReplacement | null;
};

export type DesignPageNewPlanControllerActions = {
  closeMyDesigns: () => void;
  setGuidedPlanStartMode: (mode: "template") => void;
  goPlan: () => void;
  setViewMode: (mode: "2d") => void;
  setDesignPanelOpen: (open: boolean) => void;
  setDesignPanelCollapsed: (collapsed: boolean) => void;
  cancelPendingReplacement: () => void;
  confirmPendingReplacement: () => void;
  preserveCurrentDesign: () => Promise<PreserveCurrentDesignResult>;
  detachCurrentDesignForNewDraft: () => void;
  clearHistory: () => void;
  clearPlanAnnotations: () => void;
  requestSignIn: () => void;
  showToast: (message: string) => void;
};

export type UseDesignPageNewPlanControllerInput = {
  state: DesignPageNewPlanControllerState;
  actions: DesignPageNewPlanControllerActions;
};

type ExecuteSaveCurrentAndStartNewPlanInput = {
  state: {
    hasPendingReplacement: boolean;
    isAuthenticated: boolean;
  };
  refs: {
    inFlight: MutableRef<boolean>;
  };
  actions: {
    setStarting: (starting: boolean) => void;
    setError: (error: string | null) => void;
    preserveCurrentDesign: () => Promise<PreserveCurrentDesignResult>;
    detachCurrentDesignForNewDraft: () => void;
    confirmPendingReplacement: () => void;
    clearHistory: () => void;
    clearPlanAnnotations: () => void;
    requestSignIn: () => void;
    showToast: (message: string) => void;
  };
};

export async function executeSaveCurrentAndStartNewPlan({
  state: { hasPendingReplacement, isAuthenticated },
  refs: { inFlight },
  actions: {
    setStarting,
    setError,
    preserveCurrentDesign,
    detachCurrentDesignForNewDraft,
    confirmPendingReplacement,
    clearHistory,
    clearPlanAnnotations,
    requestSignIn,
    showToast,
  },
}: ExecuteSaveCurrentAndStartNewPlanInput): Promise<void> {
  if (!hasPendingReplacement || inFlight.current) return;
  if (!isAuthenticated) {
    requestSignIn();
    return;
  }

  inFlight.current = true;
  setStarting(true);
  setError(null);
  try {
    const result = await preserveCurrentDesign();
    if (!result.ok) {
      setError(
        `We couldn't save your current design. Nothing was replaced. ${result.error}`
      );
      return;
    }

    detachCurrentDesignForNewDraft();
    confirmPendingReplacement();
    clearHistory();
    clearPlanAnnotations();
    showToast("Current design saved. New plan started.");
  } finally {
    inFlight.current = false;
    setStarting(false);
  }
}

export function useDesignPageNewPlanController({
  state: { isAuthenticated, pendingReplacement },
  actions: {
    closeMyDesigns,
    setGuidedPlanStartMode,
    goPlan,
    setViewMode,
    setDesignPanelOpen,
    setDesignPanelCollapsed,
    cancelPendingReplacement,
    confirmPendingReplacement,
    preserveCurrentDesign,
    detachCurrentDesignForNewDraft,
    clearHistory,
    clearPlanAnnotations,
    requestSignIn,
    showToast,
  },
}: UseDesignPageNewPlanControllerInput) {
  const [startingNewPlan, setStartingNewPlan] = useState(false);
  const [newPlanStartError, setNewPlanStartError] = useState<string | null>(null);
  const startingNewPlanRef = useRef(false);

  const openNewPlanPicker = useCallback(() => {
    closeMyDesigns();
    setGuidedPlanStartMode("template");
    goPlan();
    setViewMode("2d");
    setDesignPanelOpen(true);
    setDesignPanelCollapsed(false);
    showToast("Search by address or choose a floor plan template");
  }, [
    closeMyDesigns,
    goPlan,
    setDesignPanelCollapsed,
    setDesignPanelOpen,
    setGuidedPlanStartMode,
    setViewMode,
    showToast,
  ]);

  const cancelPendingPlanChoice = useCallback(() => {
    setNewPlanStartError(null);
    cancelPendingReplacement();
  }, [cancelPendingReplacement]);

  const replaceCurrentPlanFromChoice = useCallback(() => {
    setNewPlanStartError(null);
    confirmPendingReplacement();
  }, [confirmPendingReplacement]);

  const saveCurrentAndStartNewPlan = useCallback(
    () =>
      executeSaveCurrentAndStartNewPlan({
        state: {
          hasPendingReplacement: Boolean(pendingReplacement),
          isAuthenticated,
        },
        refs: { inFlight: startingNewPlanRef },
        actions: {
          setStarting: setStartingNewPlan,
          setError: setNewPlanStartError,
          preserveCurrentDesign,
          detachCurrentDesignForNewDraft,
          confirmPendingReplacement,
          clearHistory,
          clearPlanAnnotations,
          requestSignIn,
          showToast,
        },
      }),
    [
      clearHistory,
      clearPlanAnnotations,
      confirmPendingReplacement,
      detachCurrentDesignForNewDraft,
      isAuthenticated,
      pendingReplacement,
      preserveCurrentDesign,
      requestSignIn,
      showToast,
    ]
  );

  return {
    state: {
      startingNewPlan,
      newPlanStartError,
    },
    actions: {
      openNewPlanPicker,
      cancelPendingPlanChoice,
      replaceCurrentPlanFromChoice,
      saveCurrentAndStartNewPlan,
    },
  };
}
