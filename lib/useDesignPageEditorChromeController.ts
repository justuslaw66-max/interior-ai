"use client";

import type { Dispatch, SetStateAction } from "react";

import type {
  DesignPageEditorChromeActions,
  DesignPageEditorChromeConfiguration,
  DesignPageEditorChromeProps,
  DesignPageEditorChromeState,
} from "@/components/editor/design-page/DesignPageEditorChrome";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import type { GuestPromptReason } from "@/lib/guest-save-prompt";
import { PLANS_GET_PRO_OPENER_ID } from "@/lib/plans-dialog-focus";

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
  };
  actions: {
    navigation: {
      plan: CommandBarActions["onPlan"];
      furnish: CommandBarActions["onFurnish"];
      shop: CommandBarActions["onShop"];
      changeViewMode: CommandBarActions["onViewModeChange"];
      fitPlan: NonNullable<RoomActions["onFitPlan"]>;
      /** Goes to the My designs page. */
      myDesigns: () => void;
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
      /** Pricing returns focus to this control when it closes; null means Account, then More. */
      setPlansOpenerId: (id: string | null) => void;
      openNewPlan: CommandBarActions["onNewPlan"];
      /** Opens Rename design for the design's name in the bar, or for More below `xl`. */
      openDesignRename: () => void;
      setFeedbackOpen: Dispatch<SetStateAction<boolean>>;
      setDownloadOpen: Dispatch<SetStateAction<boolean>>;
      setPresentOpen: Dispatch<SetStateAction<boolean>>;
      setUpgradeReason: (reason: "designer") => void;
      setUpgradeOpen: Dispatch<SetStateAction<boolean>>;
    };
    billing: {
      openPortal: () => void | Promise<unknown>;
    };
    persistence: {
      /** Saves a cloud design's latest edits; false when that failed or the design changed meanwhile. */
      saveBeforeLeaving: () => Promise<boolean>;
      saveDesignToCloud: () => Promise<string | null | undefined>;
      /** Saves a design that isn't in the cloud yet, then creates and copies its share link. */
      shareDesign: () => Promise<void>;
      retrySaveStatus: CommandBarActions["onRetrySaveStatus"];
      openGuestPrompt: (
        reason: GuestPromptReason,
        onContinue: () => void
      ) => void;
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

type ChromeActions = UseDesignPageEditorChromeControllerInput["actions"];

// My designs is its own page (MD1). A cloud design's latest edits are saved first; if that
// fails, the editor stays open and shows the failed save. Edits made while it saved keep it open too.
async function openMyDesigns(actions: Pick<ChromeActions, "persistence" | "navigation">) {
  if (await actions.persistence.saveBeforeLeaving()) actions.navigation.myDesigns();
}

export function useDesignPageEditorChromeController({
  state,
  configuration,
  actions,
}: UseDesignPageEditorChromeControllerInput): DesignPageEditorChromeProps {
  const commandState = state.commandBar.commandBar;

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

  const toggleClientPreview = () => { actions.editor.setClientPreview((visible) => !visible); };

  const openPlans = () => { actions.dialogs.setPlansOpenerId(null); actions.dialogs.setPlansOpen(true); };
  const getPro = () => { actions.dialogs.setPlansOpenerId(PLANS_GET_PRO_OPENER_ID); actions.dialogs.setPlansOpen(true); };

  const manageBilling = () => { void actions.billing.openPortal(); };

  const openFeedback = () => { actions.dialogs.setFeedbackOpen(true); };

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

  // Share links need an account, so guests get the sign-in prompt first.
  const share = () => {
    if (!commandState.isAuthed) return actions.persistence.openGuestPrompt("share", () => {});
    void actions.persistence.shareDesign();
  };
  const openPresentExport = () => { actions.dialogs.setPresentOpen(true); };

  // Downloads capture the 3D view, so the 3D view shows behind the Download dialog.
  const openDownload = () => {
    actions.navigation.changeViewMode("3d");
    actions.dialogs.setDownloadOpen(true);
  };

  // The Pro tool rail's steps show their panel even when the sidebar was collapsed (ST13).
  const openToolsPanel = (mode: "design" | "adjust" | "ai") => {
    actions.editor.setMode(mode);
    actions.editor.setDesignPanelOpen(true);
    actions.editor.setDesignPanelCollapsed(false);
  };
  const openDesignTools = () => openToolsPanel("design");

  const toggleDesignSidebar = () => {
    if (!state.designPanelOpen) {
      actions.editor.setDesignPanelOpen(true);
      actions.editor.setDesignPanelCollapsed(false);
      return;
    }
    actions.editor.setDesignPanelCollapsed((collapsed) => !collapsed);
  };

  const openAdjustTools = () => openToolsPanel("adjust");
  const openAiTools = () => openToolsPanel("ai");

  const openCart = () => {
    actions.editor.setMode("buy");
    actions.editor.setItemCartOpen(false);
  };

  return {
    state: {
      commandBar: state.commandBar,
      betaStart: {
        visible: !commandState.isClientPreview && state.betaStart.visible && !state.designPanelOpen,
        panel: state.betaStart.panel,
      },
      toolRail: { visible: !commandState.isClientPreview && commandState.isDesigner, mode: commandState.editorMode },
    },
    configuration: {
      commandBar: configuration.commandBar,
      toolRail: configuration.toolRail,
    },
    actions: {
      commandBar: {
        commandBar: {
          onPlan: actions.navigation.plan,
          onFurnish: actions.navigation.furnish,
          onShop: actions.navigation.shop,
          onExport: togglePresentMode,
          onUndo: actions.history.undo,
          onRedo: actions.history.redo,
          onToggleDesignSidebar: toggleDesignSidebar,
          onViewModeChange: actions.navigation.changeViewMode,
          onToggleDesignerMode: toggleDesignerMode,
          onToggleClientPreview: toggleClientPreview,
          onViewPlans: openPlans, onGetPro: getPro,
          onNewPlan: actions.dialogs.openNewPlan, onRenameDesign: actions.dialogs.openDesignRename,
          onManageBilling: manageBilling,
          onFeedback: openFeedback,
          onOpenMyDesigns: () => void openMyDesigns(actions),
          onSave: save,
          onShare: share,
          onDownload: openDownload,
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
