"use client";

import type { Dispatch, SetStateAction } from "react";

import type {
  DesignPageEditorChromeActions,
  DesignPageEditorChromeConfiguration,
  DesignPageEditorChromeProps,
  DesignPageEditorChromeState,
} from "@/components/editor/design-page/DesignPageEditorChrome";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

type CommandBarActions = DesignPageEditorChromeActions["commandBar"]["commandBar"];
type RoomActions = DesignPageEditorChromeActions["commandBar"]["room"];
type ScenePerformanceActions =
  DesignPageEditorChromeActions["commandBar"]["scenePerformance"];
type SceneLightingActions =
  DesignPageEditorChromeActions["commandBar"]["sceneLighting"];

export type UseDesignPageEditorChromeControllerInput = {
  state: {
    commandBar: DesignPageEditorChromeState["commandBar"];
    betaStart: {
      visible: boolean;
      panel: DesignPageEditorChromeState["betaStart"]["panel"];
    };
    designPanelOpen: boolean;
  };
  configuration: {
    commandBar: DesignPageEditorChromeConfiguration["commandBar"];
    toolRail: DesignPageEditorChromeConfiguration["toolRail"];
    canUseDesigner: boolean;
    canUseCabinetryStudio: boolean;
  };
  actions: {
    navigation: {
      plan: CommandBarActions["onPlan"];
      furnish: CommandBarActions["onFurnish"];
      aiDesign: CommandBarActions["onAiDesign"];
      shop: CommandBarActions["onShop"];
      changeViewMode: CommandBarActions["onViewModeChange"];
      fitPlan: NonNullable<RoomActions["onFitPlan"]>;
    };
    history: {
      undo: CommandBarActions["onUndo"];
      redo: CommandBarActions["onRedo"];
    };
    editor: {
      setMode: Dispatch<SetStateAction<DesignPageEditorMode>>;
      setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
      setDesignPanelCollapsed: Dispatch<SetStateAction<boolean>>;
      setItemCartOpen: Dispatch<SetStateAction<boolean>>;
      setClientPreview: Dispatch<SetStateAction<boolean>>;
      setUrlMode: (mode: "designer" | "homeowner") => void;
    };
    dialogs: {
      setPlansOpen: Dispatch<SetStateAction<boolean>>;
      openNewPlan: CommandBarActions["onNewPlan"];
      setFeedbackOpen: Dispatch<SetStateAction<boolean>>;
      setPresentOpen: Dispatch<SetStateAction<boolean>>;
      setUpgradeReason: (reason: "designer") => void;
      setUpgradeOpen: Dispatch<SetStateAction<boolean>>;
    };
    billing: {
      openPortal: () => void | Promise<unknown>;
    };
    persistence: {
      toggleMyDesigns: CommandBarActions["onToggleLoadDesign"];
      saveDesignToCloud: () => Promise<string | null | undefined>;
      retrySaveStatus: CommandBarActions["onRetrySaveStatus"];
      openGuestPrompt: (reason: string, onContinue: () => void) => void;
    };
    cabinetry: {
      openStudio: () => void;
    };
    room: {
      reviewHealth: RoomActions["onReviewHealth"];
      rename: RoomActions["rename"];
    };
    scenePerformance: {
      changeMode: ScenePerformanceActions["changeMode"];
    };
    sceneLighting: SceneLightingActions;
    betaStart: DesignPageEditorChromeActions["betaStart"];
    showToast: (message: string) => void;
  };
};

export function useDesignPageEditorChromeController({
  state,
  configuration,
  actions,
}: UseDesignPageEditorChromeControllerInput): DesignPageEditorChromeProps {
  const commandState = state.commandBar.commandBar;

  const runAiDesign = () => {
    if (commandState.aiDesignEnabled) {
      actions.navigation.aiDesign();
    }
  };

  const togglePresentMode = () => {
    if (commandState.editorMode === "present") {
      actions.dialogs.setPresentOpen(false);
      actions.editor.setMode("design");
      return;
    }
    actions.editor.setMode("present");
  };

  const toggleDesignerMode = () => {
    if (!configuration.canUseDesigner && !commandState.isDesigner) {
      actions.dialogs.setUpgradeReason("designer");
      actions.dialogs.setUpgradeOpen(true);
      return;
    }
    actions.editor.setUrlMode(
      commandState.isDesigner ? "homeowner" : "designer"
    );
  };

  const toggleClientPreview = () => {
    actions.editor.setClientPreview((visible) => !visible);
  };

  const openPlans = () => {
    actions.dialogs.setPlansOpen(true);
  };

  const manageBilling = () => {
    void actions.billing.openPortal();
  };

  const openFeedback = () => {
    actions.dialogs.setFeedbackOpen(true);
  };

  const save = async () => {
    if (!commandState.isAuthed) {
      actions.persistence.openGuestPrompt("save", () => {});
      return;
    }

    const savedId = await actions.persistence.saveDesignToCloud();
    if (savedId) {
      actions.showToast("Saved to cloud");
    }
  };

  const openPresentExport = () => {
    actions.dialogs.setPresentOpen(true);
  };

  const openDesignTools = () => {
    actions.editor.setMode("design");
    actions.editor.setDesignPanelOpen(true);
  };

  const toggleDesignSidebar = () => {
    if (!state.designPanelOpen) {
      actions.editor.setDesignPanelOpen(true);
      actions.editor.setDesignPanelCollapsed(false);
      return;
    }
    actions.editor.setDesignPanelCollapsed((collapsed) => !collapsed);
  };

  const openAdjustTools = () => {
    actions.editor.setMode("adjust");
    actions.editor.setDesignPanelOpen(true);
  };

  const openAiTools = () => {
    actions.editor.setMode("ai");
    actions.editor.setDesignPanelOpen(true);
  };

  const openCart = () => {
    actions.editor.setMode("buy");
    actions.editor.setItemCartOpen(false);
  };

  return {
    state: {
      commandBar: state.commandBar,
      betaStart: {
        visible:
          !commandState.isClientPreview &&
          state.betaStart.visible &&
          !state.designPanelOpen,
        panel: state.betaStart.panel,
      },
      toolRail: {
        visible: !commandState.isClientPreview && commandState.isDesigner,
        mode: commandState.editorMode,
      },
    },
    configuration: {
      commandBar: configuration.commandBar,
      toolRail: configuration.toolRail,
    },
    actions: {
      commandBar: {
        commandBar: {
          onPlan: actions.navigation.plan,
          onMillwork: configuration.canUseCabinetryStudio
            ? actions.cabinetry.openStudio
            : undefined,
          onFurnish: actions.navigation.furnish,
          onAiDesign: runAiDesign,
          onShop: actions.navigation.shop,
          onExport: togglePresentMode,
          onUndo: actions.history.undo,
          onRedo: actions.history.redo,
          onToggleDesignSidebar: toggleDesignSidebar,
          onViewModeChange: actions.navigation.changeViewMode,
          onToggleDesignerMode: toggleDesignerMode,
          onToggleClientPreview: toggleClientPreview,
          onViewPlans: openPlans,
          onNewPlan: actions.dialogs.openNewPlan,
          onManageBilling: manageBilling,
          onFeedback: openFeedback,
          onToggleLoadDesign: actions.persistence.toggleMyDesigns,
          onSave: save,
          onRetrySaveStatus: actions.persistence.retrySaveStatus,
          onOpenPresentExport: openPresentExport,
        },
        room: {
          onViewModeChange: actions.navigation.changeViewMode,
          onReviewHealth: actions.room.reviewHealth,
          onFitPlan: actions.navigation.fitPlan,
          rename: actions.room.rename,
        },
        scenePerformance: {
          changeMode: actions.scenePerformance.changeMode,
        },
        sceneLighting: actions.sceneLighting,
      },
      betaStart: actions.betaStart,
      toolRail: {
        onDesign: openDesignTools,
        onAdjust: openAdjustTools,
        onAi: openAiTools,
        onCart: openCart,
        onPresent: togglePresentMode,
        onFitPlan: actions.navigation.fitPlan,
      },
    },
  };
}
