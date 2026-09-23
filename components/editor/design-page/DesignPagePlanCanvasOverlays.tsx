"use client";

import type { RoomOpening2D } from "@/lib/editorScene";
import { DesignToolsRestoreButton } from "@/components/editor/design-page/DesignToolsRestoreButton";
import { EmptyPlanCanvasPrompt } from "@/components/editor/design-page/EmptyPlanCanvasPrompt";
import { PlanCanvasFocusControl } from "@/components/editor/design-page/PlanCanvasFocusControl";
import {
  PlanCanvasGuidance,
  type PlanCanvasGuidancePrimaryAction,
} from "@/components/editor/design-page/PlanCanvasGuidance";
import { PlanGuidedActionsChoice } from "@/components/editor/design-page/PlanGuidedActionsChoice";
import { PlanGuidedActionsToggle } from "@/components/editor/design-page/PlanGuidedActionsToggle";
import { PlanManualQuickActions } from "@/components/editor/design-page/PlanManualQuickActions";
import type {
  DesignPagePlanCanvasOverlaysState as ResolvedPlanCanvasOverlaysState,
} from "@/lib/design-page-plan-canvas-overlays";

export type DesignPagePlanCanvasOverlaysState =
  ResolvedPlanCanvasOverlaysState;

export type DesignPagePlanCanvasOverlaysActions = {
  guidedActionsChoice: {
    close: () => void;
    choose: (guided: boolean) => void;
  };
  manualQuickActions: {
    select: () => void;
    startScale: () => void;
    startRoomDraw: () => void;
    addOpening: (kind: RoomOpening2D["kind"]) => void;
    fit: () => void;
  };
  guidedActionsToggle: {
    toggle: () => void;
  };
  focusControl: {
    undo: () => void;
    clear: () => void;
    togglePanel: () => void;
    finish: () => void;
  };
  guidance: {
    startScale: () => void;
    addOpening: (kind: RoomOpening2D["kind"]) => void;
    furnish: () => void;
    dismiss: (guidanceKey: string) => void;
  };
  emptyPrompt: {
    startRoom: () => void;
  };
  restoreTools: {
    restore: () => void;
  };
};

type DesignPagePlanCanvasOverlaysProps = {
  state: DesignPagePlanCanvasOverlaysState;
  actions: DesignPagePlanCanvasOverlaysActions;
};

function resolveGuidancePrimaryAction(
  action: NonNullable<DesignPagePlanCanvasOverlaysState["guidance"]>["action"],
  actions: DesignPagePlanCanvasOverlaysActions["guidance"]
): PlanCanvasGuidancePrimaryAction | null {
  if (action === "scale") {
    return {
      label: "Set scale",
      ariaLabel: "Start plan scale calibration",
      onClick: actions.startScale,
    };
  }

  if (action === "addOpening") {
    return {
      label: "Add door",
      ariaLabel: "Add a door to the floor plan",
      onClick: () => actions.addOpening("door"),
    };
  }

  if (action === "furnish") {
    return {
      label: "Furnish",
      ariaLabel: "Open furnishing tools",
      onClick: actions.furnish,
    };
  }

  return null;
}

export function DesignPagePlanCanvasOverlays({
  state,
  actions,
}: DesignPagePlanCanvasOverlaysProps) {
  const guidance = state.guidance;
  const guidancePrimaryAction = guidance
    ? resolveGuidancePrimaryAction(guidance.action, actions.guidance)
    : null;

  return (
    <>
      {state.guidedActionsChoiceVisible && (
        <PlanGuidedActionsChoice actions={actions.guidedActionsChoice} />
      )}

      {state.manualQuickActions && (
        <PlanManualQuickActions
          state={state.manualQuickActions}
          actions={{
            select: actions.manualQuickActions.select,
            scale: actions.manualQuickActions.startScale,
            drawRoom: actions.manualQuickActions.startRoomDraw,
            addOpening: actions.manualQuickActions.addOpening,
            fit: actions.manualQuickActions.fit,
          }}
        />
      )}

      {state.guidedActionsToggle && (
        <PlanGuidedActionsToggle
          state={state.guidedActionsToggle}
          actions={actions.guidedActionsToggle}
        />
      )}

      {state.focusControl && (
        <PlanCanvasFocusControl
          state={state.focusControl}
          actions={actions.focusControl}
        />
      )}

      {guidance && (
        <PlanCanvasGuidance
          state={{
            guidance: guidance.guidance,
            primaryAction: guidancePrimaryAction,
            dismissible: guidance.dismissible,
          }}
          actions={{
            dismiss: () => actions.guidance.dismiss(guidance.key),
          }}
        />
      )}

      {state.emptyPromptVisible && (
        <EmptyPlanCanvasPrompt
          actions={actions.emptyPrompt}
        />
      )}

      {state.restoreTools && (
        <DesignToolsRestoreButton
          state={state.restoreTools}
          actions={actions.restoreTools}
        />
      )}
    </>
  );
}
