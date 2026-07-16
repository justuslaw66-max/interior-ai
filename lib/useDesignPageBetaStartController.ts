"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import type { BetaStartPanelProps } from "@/components/editor/design-page/BetaStartPanel";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

export const BETA_START_DISMISSED_STORAGE_KEY =
  "interior-ai:beta-start-dismissed";

export type UseDesignPageBetaStartControllerInput = {
  state: {
    isClientPreview: boolean;
    planRoomCount: number;
    itemCount: number;
  };
  actions: {
    setGuidedPlanStartMode: Dispatch<SetStateAction<PlanStartMode>>;
    goPlan: () => void;
    goAiDesign: () => void;
    setViewMode: Dispatch<SetStateAction<EditorViewMode>>;
    setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
    activateFloorPlanRoomTrace: (enabled: boolean) => void;
    showToast: (message: string) => void;
  };
};

export type DesignPageBetaStartController = {
  state: { visible: boolean };
  actions: BetaStartPanelProps["actions"];
};

export function useDesignPageBetaStartController({
  state,
  actions,
}: UseDesignPageBetaStartControllerInput): DesignPageBetaStartController {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state.isClientPreview) return;

    const workspaceIsEmpty =
      state.planRoomCount === 0 && state.itemCount === 0;
    /* eslint-disable react-hooks/set-state-in-effect -- This intentionally hydrates an external localStorage preference at the same passive-effect boundary as the original workspace. */
    try {
      const dismissed =
        window.localStorage.getItem(BETA_START_DISMISSED_STORAGE_KEY) === "1";
      setVisible(!dismissed && workspaceIsEmpty);
    } catch {
      setVisible(workspaceIsEmpty);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state.isClientPreview, state.itemCount, state.planRoomCount]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(BETA_START_DISMISSED_STORAGE_KEY, "1");
    } catch {
      // Preference storage must never block the editor.
    }
  }, []);

  const chooseTemplate = useCallback(() => {
    actions.setGuidedPlanStartMode("template");
    actions.goPlan();
    actions.setViewMode("2d");
    actions.setDesignPanelOpen(true);
    actions.showToast("Choose a room template in the Plan panel");
    dismiss();
  }, [actions, dismiss]);

  const drawRoom = useCallback(() => {
    actions.setGuidedPlanStartMode("draw");
    actions.goPlan();
    actions.setViewMode("2d");
    actions.activateFloorPlanRoomTrace(true);
    actions.setDesignPanelOpen(true);
    actions.showToast("Draw room walls in 2D plan mode");
    dismiss();
  }, [actions, dismiss]);

  const uploadPlan = useCallback(() => {
    actions.setGuidedPlanStartMode("upload");
    actions.goPlan();
    actions.setViewMode("2d");
    actions.setDesignPanelOpen(true);
    actions.showToast(
      "Upload a plan from the Plan panel, then calibrate and trace"
    );
    dismiss();
  }, [actions, dismiss]);

  const generateAiLayout = useCallback(() => {
    actions.goAiDesign();
    actions.setDesignPanelOpen(true);
    actions.showToast("Complete the AI brief, then generate a layout");
    dismiss();
  }, [actions, dismiss]);

  const controllerActions = useMemo(
    () => ({
      dismiss,
      chooseTemplate,
      drawRoom,
      uploadPlan,
      generateAiLayout,
    }),
    [chooseTemplate, dismiss, drawRoom, generateAiLayout, uploadPlan]
  );

  return {
    state: { visible },
    actions: controllerActions,
  };
}
