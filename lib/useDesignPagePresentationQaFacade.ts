"use client";

import type { BetaFeedbackContext } from "@/components/BetaFeedbackWidget";
import type { DesignPageEditorChromeProps } from "@/components/editor/design-page/DesignPageEditorChrome";
import type { DesignPageHistoryQaSummary, DesignPageProjectQaMarkersProps, DesignPageRuntimeQaMarkersProps } from "@/components/editor/design-page/DesignPageQaMarkers";
import type { DesignPagePresentationQaLayerProps } from "@/components/editor/design-page/DesignPagePresentationQaLayer";
import { buildDesignPageBetaFeedbackContext, type DesignPageBetaFeedbackInput } from "@/lib/design-page-beta-feedback";
import { getRoomTypeLabel } from "@/lib/design-page-house-plan";
import { getEditorPlanLabel, resolveEditorCapabilities } from "@/lib/editor-capabilities";
import type { DesignLightingSettings } from "@/lib/lightingPresets";
import { getAllRoomNames } from "@/lib/room-hooks";
import { useDesignPageCommandPalette, type DesignPageCommandPaletteActions } from "@/lib/useDesignPageCommandPalette";
import { useDesignPageEditorChromeController, type UseDesignPageEditorChromeControllerInput } from "@/lib/useDesignPageEditorChromeController";
import { useDesignPagePlanCanvasActionsController, type UseDesignPagePlanCanvasActionsControllerInput } from "@/lib/useDesignPagePlanCanvasActionsController";
import { useDesignPagePresentExportController, type UseDesignPagePresentExportControllerInput } from "@/lib/useDesignPagePresentExportController";
import { useDesignPageQaReadModel, type UseDesignPageQaReadModelInput } from "@/lib/useDesignPageQaReadModel";

type PresentInput = UseDesignPagePresentExportControllerInput;
type PresentDialogState = PresentInput["state"]["dialog"];
type PresentActions = PresentInput["actions"];
type QaInput = UseDesignPageQaReadModelInput;
type CommandActions = DesignPageCommandPaletteActions;
type PlanCanvasInputActions = UseDesignPagePlanCanvasActionsControllerInput["actions"];
type ChromeInput = UseDesignPageEditorChromeControllerInput;
type ChromeCommandState = ChromeInput["state"]["commandBar"]["commandBar"];
type ChromeRoomState = NonNullable<ChromeInput["state"]["commandBar"]["room"]>;
type ChromeActions = ChromeInput["actions"];

export type UseDesignPagePresentationQaFacadeInput = {
  state: {
    identity: DesignPageBetaFeedbackInput["identity"];
    editor: {
      mode: DesignPageBetaFeedbackInput["editor"]["mode"];
      viewMode: PresentDialogState["viewMode"];
      editorMode: QaInput["state"]["layout"]["editorMode"];
      isClientPreview: boolean;
      isDesigner: boolean;
      authenticated: boolean;
      plan: DesignPageBetaFeedbackInput["editor"]["plan"];
      aiDesignEnabled: ChromeCommandState["aiDesignEnabled"];
      canUndo: ChromeCommandState["canUndo"];
      canRedo: ChromeCommandState["canRedo"];
      undoName: ChromeCommandState["undoName"];
      redoName: ChromeCommandState["redoName"];
    };
    document: {
      snapshot: PresentInput["state"]["document"]["snapshot"];
      activeRoom: PresentDialogState["activeRoom"];
      activeRoomItemCount: number;
      roomWidth: number;
      roomDepth: number;
      zones: DesignPageProjectQaMarkersProps["activeRoomZones"];
    };
    persistence: {
      currentStoredDesignFingerprint: QaInput["state"]["persistence"]["currentStoredDesignFingerprint"];
      isSaving: ChromeCommandState["isSaving"];
      saveStatus: ChromeCommandState["saveStatus"];
    };
    presentation: Pick<PresentDialogState,
      "cameraViewNameInput" | "layoutVersionNameInput" | "exportReadiness" | "simplePlanControls" |
      "lightingPreset" | "sharingDesign" | "exportStylePreset" | "isExporting" | "isPdfExporting" | "aiNotesLoading"
    > & {
      presentModeRoomId: string | null;
      lightingSettings: DesignLightingSettings;
      lightingStatus: {
        placedFixtureCount: number;
        activeFixtureCount: number;
        estimatedFixtureCount: number;
      };
    };
    plan: Pick<PresentDialogState,
      "planLayerPreset" | "planLayers" | "planMeasurementUnit" | "planTheme" | "annotationToolKind" |
      "selectedPlanOverlayId" | "visiblePlanOpening" | "visiblePlanOpeningRoomName" |
      "visiblePlanOpeningWallSpanMeters" | "visiblePlanOpeningMaxHeightMeters"
    > & {
      houseRoomCount: number;
      openingCount: number;
      selectedPlanRoomId: string | null;
      commandSelectedPlanRoomId: string | null;
    };
    scene: QaInput["state"]["scene"] & {
      planDebugMetrics: QaInput["state"]["layout"]["planDebugMetrics"];
    };
    selection: DesignPageBetaFeedbackInput["selection"] & {
      hasSelectedItem: boolean;
    };
    placement: Omit<DesignPageBetaFeedbackInput["placement"], "fallbackRoomName">;
    shopping: DesignPageBetaFeedbackInput["shopping"];
    viewport: DesignPageBetaFeedbackInput["viewport"];
    chrome: {
      openingBillingPortal: ChromeCommandState["isOpeningBillingPortal"];
      millworkActive: ChromeCommandState["millworkActive"];
      activeRoomHealthSummary: null | {
        level: NonNullable<ChromeRoomState["health"]>["level"];
        placementScore: NonNullable<ChromeRoomState["health"]>["score"];
        nextAction: NonNullable<ChromeRoomState["health"]>["nextAction"];
      };
      showBetaStart: boolean;
      firstRunActivation: DesignPageRuntimeQaMarkersProps["firstRunActivation"];
      designPanelOpen: boolean;
      designPanelCollapsed: boolean;
    };
    qa: {
      showLayoutDebugOverlay: DesignPageRuntimeQaMarkersProps["showLayoutDebugOverlay"];
      history: DesignPageHistoryQaSummary;
      cabinetSchedule: DesignPageProjectQaMarkersProps["cabinetSchedule"];
      cabinetHandoff: DesignPageProjectQaMarkersProps["cabinetHandoff"];
    };
  };
  configuration: {
    commandPaletteScopeKey: string; presentOpen: boolean;
    designerTheme: boolean;
    canUseAdvancedPlanControls: boolean;
    canUseAdvancedExportStyles: boolean;
    canUseDesigner: ChromeInput["configuration"]["canUseDesigner"];
    canUseCabinetryStudio: ChromeInput["configuration"]["canUseCabinetryStudio"];
    compactRoomStatus: ChromeInput["configuration"]["commandBar"]["compactRoomStatus"];
    showRoomHealth: ChromeInput["configuration"]["commandBar"]["showRoomHealth"];
    eyeLevelTransitionDurationMs: number;
    focusTransitionDurationMs: number;
  };
  actions: {
    shell: {
      setPresentModalOpen: ChromeActions["dialogs"]["setPresentOpen"];
      setEditorMode: ChromeActions["editor"]["setMode"];
      setPresentModeRoomId: PresentActions["shell"]["setPresentModeRoomId"];
      setDesignSnapshot: PresentActions["shell"]["setDesignSnapshot"];
      changeViewMode: PresentActions["shell"]["changeViewMode"];
      setUpgradeReason: PresentActions["shell"]["setUpgradeReason"];
      setUpgradeOpen: ChromeActions["dialogs"]["setUpgradeOpen"];
      setDesignPanelOpen: ChromeActions["editor"]["setDesignPanelOpen"];
      setDesignPanelCollapsed: ChromeActions["editor"]["setDesignPanelCollapsed"];
      setItemCartOpen: ChromeActions["editor"]["setItemCartOpen"];
      setClientPreview: ChromeActions["editor"]["setClientPreview"];
      setUrlMode: ChromeActions["editor"]["setUrlMode"];
    };
    camera: PresentActions["camera"];
    layoutVersions: PresentActions["layoutVersions"];
    history: {
      runTransaction: PresentActions["history"]["runTransaction"];
      undo: ChromeActions["history"]["undo"];
      redo: ChromeActions["history"]["redo"];
    };
    plan: PresentActions["plan"] & {
      addFloorPlanOpening: CommandActions["addFloorPlanOpening"];
      fitPlanView: CommandActions["fitPlanView"];
      duplicateRoom: CommandActions["duplicateRoom"];
      deleteRoom: CommandActions["deleteRoom"];
    };
    planCanvas: Omit<PlanCanvasInputActions,
      "addFloorPlanOpening" | "fitPlanView" | "setDesignPanelOpen" | "goPlan" | "goFurnish"
    >;
    selection: {
      duplicateItem: CommandActions["duplicateItem"];
      deleteItem: CommandActions["deleteItem"];
    };
    navigation: Omit<ChromeActions["navigation"], "changeViewMode" | "fitPlan">;
    dialogs: Pick<ChromeActions["dialogs"], "setPlansOpen" | "openNewPlan" | "setFeedbackOpen">;
    billing: ChromeActions["billing"];
    persistence: ChromeActions["persistence"];
    cabinetry: ChromeActions["cabinetry"];
    room: ChromeActions["room"];
    scenePerformance: ChromeActions["scenePerformance"];
    lighting: {
      changeShadowsEnabled: (enabled: boolean) => void;
      updateSettings: (patch: Partial<DesignLightingSettings>) => void;
    };
    betaStart: ChromeActions["betaStart"];
    presentation: PresentActions["presentation"];
    feedback: { showToast: ChromeActions["showToast"] };
  };
};

export type DesignPagePresentationQaFacade = {
  state: {
    commandPalette: ReturnType<typeof useDesignPageCommandPalette>["state"];
  };
  derived: {
    betaFeedbackContext: BetaFeedbackContext;
    qa: ReturnType<typeof useDesignPageQaReadModel>["derived"];
  };
  actions: {
    commandPalette: ReturnType<typeof useDesignPageCommandPalette>["actions"];
    planCanvas: ReturnType<typeof useDesignPagePlanCanvasActionsController>["actions"];
  };
  regions: {
    presentExport: ReturnType<typeof useDesignPagePresentExportController>;
    editorChrome: DesignPageEditorChromeProps;
    presentationQaLayer: DesignPagePresentationQaLayerProps;
  };
};

export function useDesignPagePresentationQaFacade({
  state,
  configuration,
  actions,
}: UseDesignPagePresentationQaFacadeInput): DesignPagePresentationQaFacade {
  const editorCapabilities = resolveEditorCapabilities(state.editor.plan);
  const presentExport = useDesignPagePresentExportController({
    state: {
      dialog: {
        exportReadiness: state.presentation.exportReadiness,
        rooms: getAllRoomNames(state.document.snapshot),
        currentRoomId:
          state.presentation.presentModeRoomId ??
          state.document.snapshot.activeRoomId ??
          null,
        viewMode: state.editor.viewMode,
        cameraViewNameInput: state.presentation.cameraViewNameInput,
        activeRoom: state.document.activeRoom,
        layoutVersionNameInput: state.presentation.layoutVersionNameInput,
        simplePlanControls: state.presentation.simplePlanControls,
        planLayerPreset: state.plan.planLayerPreset,
        planLayers: state.plan.planLayers,
        planMeasurementUnit: state.plan.planMeasurementUnit,
        planTheme: state.plan.planTheme,
        annotationToolKind: state.plan.annotationToolKind,
        selectedPlanOverlayId: state.plan.selectedPlanOverlayId,
        visiblePlanOpening: state.plan.visiblePlanOpening,
        visiblePlanOpeningRoomName: state.plan.visiblePlanOpeningRoomName,
        visiblePlanOpeningWallSpanMeters:
          state.plan.visiblePlanOpeningWallSpanMeters,
        visiblePlanOpeningMaxHeightMeters:
          state.plan.visiblePlanOpeningMaxHeightMeters,
        lightingPreset: state.presentation.lightingPreset,
        sharingDesign: state.presentation.sharingDesign,
        designId: state.identity.designId,
        shareToken: state.identity.shareToken,
        exportStylePreset: state.presentation.exportStylePreset,
        isExporting: state.presentation.isExporting,
        isPdfExporting: state.presentation.isPdfExporting,
        sceneReady: state.scene.sceneReady,
        aiNotesLoading: state.presentation.aiNotesLoading,
        hasItems: state.document.activeRoomItemCount > 0,
      },
      document: { snapshot: state.document.snapshot },
    },
    configuration: {
      open: configuration.presentOpen,
      designerTheme: configuration.designerTheme,
      canUseAdvancedPlanControls: configuration.canUseAdvancedPlanControls,
      canUseAdvancedExportStyles: configuration.canUseAdvancedExportStyles,
      eyeLevelTransitionDurationMs:
        configuration.eyeLevelTransitionDurationMs,
      focusTransitionDurationMs: configuration.focusTransitionDurationMs,
    },
    actions: {
      shell: {
        setPresentModalOpen: actions.shell.setPresentModalOpen,
        setEditorMode: actions.shell.setEditorMode,
        setPresentModeRoomId: actions.shell.setPresentModeRoomId,
        setDesignSnapshot: actions.shell.setDesignSnapshot,
        changeViewMode: actions.shell.changeViewMode,
        setUpgradeReason: actions.shell.setUpgradeReason,
        setUpgradeOpen: actions.shell.setUpgradeOpen,
      },
      camera: actions.camera,
      layoutVersions: actions.layoutVersions,
      history: { runTransaction: actions.history.runTransaction },
      plan: actions.plan,
      presentation: actions.presentation,
    },
  });

  const betaFeedbackContext = buildDesignPageBetaFeedbackContext({
    identity: state.identity,
    editor: {
      mode: state.editor.mode,
      viewMode: state.editor.viewMode,
      plan: state.editor.plan,
      saveStatus: state.persistence.saveStatus.kind,
      shareEnabled: Boolean(state.identity.shareToken),
    },
    project: {
      activeRoomName: state.document.activeRoom?.name ?? "Current room",
      roomCount: state.plan.houseRoomCount,
      itemCount: state.document.activeRoomItemCount,
      openingCount: state.plan.openingCount,
      exportReadinessScore: state.presentation.exportReadiness.score,
    },
    selection: {
      itemId: state.selection.itemId,
      productId: state.selection.productId,
    },
    placement: {
      ...state.placement,
      fallbackRoomName: state.document.activeRoom?.name ?? null,
    },
    shopping: state.shopping,
    viewport: state.viewport,
  });

  const qaReadModel = useDesignPageQaReadModel({
    state: {
      persistence: {
        currentStoredDesignFingerprint:
          state.persistence.currentStoredDesignFingerprint,
      },
      scene: state.scene,
      layout: {
        viewMode: state.editor.viewMode,
        editorMode: state.editor.editorMode,
        designSnapshot: state.document.snapshot,
        activeRoom: state.document.activeRoom,
        planDebugMetrics: state.scene.planDebugMetrics,
        selectedPlanRoomId: state.plan.selectedPlanRoomId,
      },
    },
  });

  const commandPalette = useDesignPageCommandPalette({
    scopeKey: configuration.commandPaletteScopeKey, state: {
      isClientPreview: state.editor.isClientPreview,
      canUndo: state.editor.canUndo,
      canRedo: state.editor.canRedo,
      undoName: state.editor.undoName,
      redoName: state.editor.redoName,
      viewMode: state.editor.viewMode,
      planRoomCount: state.plan.houseRoomCount,
      designRoomCount: state.document.snapshot.rooms.length,
      selectedPlanOverlayId: state.plan.selectedPlanOverlayId,
      selectedPlanRoomId: state.plan.commandSelectedPlanRoomId,
      hasSelectedItem: state.selection.hasSelectedItem,
      planLayerPreset: state.plan.planLayerPreset,
    },
    actions: {
      undo: actions.history.undo,
      redo: actions.history.redo,
      fitPlanView: actions.plan.fitPlanView,
      changeViewMode: actions.shell.changeViewMode,
      addFloorPlanOpening: actions.plan.addFloorPlanOpening,
      runHistoryTransaction: actions.history.runTransaction,
      setPlanOpenings: actions.plan.setOpenings,
      selectPlanOverlay: actions.plan.selectOverlay,
      deletePlanOverlay: actions.plan.deleteOverlay,
      duplicateRoom: actions.plan.duplicateRoom,
      deleteRoom: actions.plan.deleteRoom,
      duplicateItem: actions.selection.duplicateItem,
      deleteItem: actions.selection.deleteItem,
      runPlanPreset: (preset) =>
        actions.plan.runOverlayCommand(`preset:${preset}`),
    },
  });

  const { actions: planCanvas } = useDesignPagePlanCanvasActionsController({
    actions: {
      ...actions.planCanvas,
      addFloorPlanOpening: actions.plan.addFloorPlanOpening,
      fitPlanView: actions.plan.fitPlanView,
      setDesignPanelOpen: actions.shell.setDesignPanelOpen,
      goPlan: actions.navigation.plan,
      goFurnish: actions.navigation.furnish,
    },
  });

  const editorChrome = useDesignPageEditorChromeController({
    state: {
      commandBar: {
        commandBar: {
          isClientPreview: state.editor.isClientPreview,
          editorMode: state.editor.editorMode,
          viewMode: state.editor.viewMode,
          isDesigner: state.editor.isDesigner,
          isAuthed: state.editor.authenticated,
          planLabel: getEditorPlanLabel(state.editor.plan),
          canManageBilling: editorCapabilities.manageSubscription,
          isOpeningBillingPortal: state.chrome.openingBillingPortal,
          aiDesignEnabled: state.editor.aiDesignEnabled,
          canUndo: state.editor.canUndo,
          canRedo: state.editor.canRedo,
          undoName: state.editor.undoName,
          redoName: state.editor.redoName,
          designSidebarCollapsed:
            state.chrome.designPanelCollapsed ||
            !state.chrome.designPanelOpen,
          millworkActive: state.chrome.millworkActive,
          showLoadDesign: state.editor.authenticated,
          isSaving: state.persistence.isSaving,
          saveStatus: state.persistence.saveStatus,
        },
        room: state.document.activeRoom
          ? {
              id: state.document.activeRoom.id,
              roomName: state.document.activeRoom.name,
              roomTypeLabel: getRoomTypeLabel(
                state.document.activeRoom.roomType
              ),
              roomCount: state.document.snapshot.rooms.length,
              widthMeters: state.document.roomWidth,
              depthMeters: state.document.roomDepth,
              viewMode: state.editor.viewMode,
              health: state.chrome.activeRoomHealthSummary
                ? {
                    level: state.chrome.activeRoomHealthSummary.level,
                    score: state.chrome.activeRoomHealthSummary.placementScore,
                    nextAction: state.chrome.activeRoomHealthSummary.nextAction,
                  }
                : null,
            }
          : null,
        scenePerformance: {
          mode: state.scene.mode,
          liteEnabled: state.scene.liteEnabled,
        },
        sceneLighting: {
          settings: state.presentation.lightingSettings,
          liteEnabled: state.scene.liteEnabled,
          ...state.presentation.lightingStatus,
        },
      },
      betaStart: {
        visible: state.chrome.showBetaStart,
        panel: {
          nextStepLabel:
            state.chrome.firstRunActivation.nextStep?.label ?? null,
          progressPercent: state.chrome.firstRunActivation.progressPercent,
        },
      },
      designPanelOpen: state.chrome.designPanelOpen,
    },
    configuration: {
      commandBar: {
        dark: configuration.designerTheme,
        compactRoomStatus: configuration.compactRoomStatus,
        showRoomHealth: configuration.showRoomHealth,
      },
      toolRail: {
        dark: configuration.designerTheme,
        aiDesignEnabled: state.editor.aiDesignEnabled,
      },
      canUseDesigner: configuration.canUseDesigner,
      canUseCabinetryStudio: configuration.canUseCabinetryStudio,
    },
    actions: {
      navigation: {
        ...actions.navigation,
        changeViewMode: actions.shell.changeViewMode,
        fitPlan: actions.plan.fitPlanView,
      },
      history: { undo: actions.history.undo, redo: actions.history.redo },
      editor: {
        setMode: actions.shell.setEditorMode,
        setDesignPanelOpen: actions.shell.setDesignPanelOpen,
        setDesignPanelCollapsed: actions.shell.setDesignPanelCollapsed,
        setItemCartOpen: actions.shell.setItemCartOpen,
        setClientPreview: actions.shell.setClientPreview,
        setUrlMode: actions.shell.setUrlMode,
      },
      dialogs: {
        ...actions.dialogs,
        setPresentOpen: actions.shell.setPresentModalOpen,
        setUpgradeReason: actions.shell.setUpgradeReason,
        setUpgradeOpen: actions.shell.setUpgradeOpen,
      },
      billing: actions.billing,
      persistence: actions.persistence,
      cabinetry: actions.cabinetry,
      room: actions.room,
      scenePerformance: actions.scenePerformance,
      sceneLighting: {
        changePreset: actions.presentation.changeLightingPreset,
        changeShadowsEnabled: actions.lighting.changeShadowsEnabled,
        updateSettings: actions.lighting.updateSettings,
      },
      betaStart: actions.betaStart,
      showToast: actions.feedback.showToast,
    },
  });

  const { qaSnapshotFingerprint, qaScenePerformanceSnapshot, qaDesignLayoutSnapshot } = qaReadModel.derived;
  const presentationQaLayer: DesignPagePresentationQaLayerProps = {
    project: {
      snapshotFingerprint: qaSnapshotFingerprint,
      cloudDesignId: state.identity.designId,
      activeRoomId: state.document.snapshot.activeRoomId,
      activeRoomZones: state.document.zones,
      cabinetSchedule: state.qa.cabinetSchedule,
      cabinetHandoff: state.qa.cabinetHandoff,
    },
    cabinetAssets: { rooms: state.document.snapshot.rooms },
    runtime: {
      qaHooksEnabled: process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1",
      firstRunActivation: state.chrome.firstRunActivation,
      scenePerformance: qaScenePerformanceSnapshot,
      layout: qaDesignLayoutSnapshot,
      showLayoutDebugOverlay: state.qa.showLayoutDebugOverlay,
      history: state.qa.history,
    },
    commandPalette: {
      open: commandPalette.state.open,
      query: commandPalette.state.query,
      actions: commandPalette.state.actions,
      designerTheme: configuration.designerTheme,
      returnFocusIds: commandPalette.state.returnFocusIds,
      focusRestorationEnabledRef: commandPalette.state.focusRestorationEnabledRef,
      onClose: commandPalette.actions.close,
      onQueryChange: commandPalette.actions.setQuery,
      onRunAction: commandPalette.actions.runAction,
    },
  };

  return {
    state: { commandPalette: commandPalette.state },
    derived: { betaFeedbackContext, qa: qaReadModel.derived },
    actions: { commandPalette: commandPalette.actions, planCanvas },
    regions: { presentExport, editorChrome, presentationQaLayer },
  };
}
