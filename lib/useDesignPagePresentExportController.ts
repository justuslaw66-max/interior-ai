"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { PresentExportDialogProps } from "@/components/editor/design-page/PresentExportDialog";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type {
  CameraView,
  PlanLayerPresetId,
} from "@/lib/design-page-types";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import {
  switchRoom,
  type DesignSnapshot,
} from "@/lib/room-types";
import type {
  ExportStylePreset,
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

type PresentExportDialogActions = PresentExportDialogProps["actions"];
type PresentExportUpgradeReason = "designer" | "export_images";
type PlanMeasurementUnit = PresentExportDialogProps["state"]["planMeasurementUnit"];
type PlanOverlayPresetCommand = `preset:${PlanLayerPresetId}`;
type FunctionalStateAction<T> = T | ((previous: T) => T);

export type DesignPagePresentExportControllerState = {
  dialog: PresentExportDialogProps["state"];
  document: {
    snapshot: DesignSnapshot;
  };
};

export type DesignPagePresentExportControllerConfiguration = {
  open: boolean;
  designerTheme: boolean;
  canUseAdvancedPlanControls: boolean;
  canUseAdvancedExportStyles: boolean;
  eyeLevelTransitionDurationMs: number;
  focusTransitionDurationMs: number;
};

export type DesignPagePresentExportControllerActions = {
  shell: {
    setPresentModalOpen: (open: boolean) => void;
    setEditorMode: (mode: DesignPageEditorMode) => void;
    setPresentModeRoomId: (roomId: string) => void;
    setDesignSnapshot: (snapshot: DesignSnapshot) => void;
    changeViewMode: (viewMode: EditorViewMode) => void;
    setUpgradeReason: (reason: PresentExportUpgradeReason) => void;
    setUpgradeOpen: (open: boolean) => void;
  };
  camera: {
    getEyeLevelView: () => CameraView;
    getFocusView: () => CameraView;
    transitionToView: (view: CameraView, durationMs: number) => void;
    setName: PresentExportDialogActions["onCameraViewNameChange"];
    save: PresentExportDialogActions["onSaveCameraView"];
    open: PresentExportDialogActions["onOpenCameraView"];
    delete: PresentExportDialogActions["onDeleteCameraView"];
  };
  layoutVersions: {
    setName: PresentExportDialogActions["onLayoutVersionNameChange"];
    save: PresentExportDialogActions["onSaveLayoutVersion"];
    restore: PresentExportDialogActions["onRestoreLayoutVersion"];
    delete: PresentExportDialogActions["onDeleteLayoutVersion"];
  };
  history: {
    runTransaction: (name: string, action: () => void) => void;
  };
  plan: {
    setSimpleControls: (enabled: boolean) => void;
    runOverlayCommand: (command: PlanOverlayPresetCommand) => void;
    setTheme: (next: FunctionalStateAction<PlanTheme>) => void;
    setLayers: (next: FunctionalStateAction<PlanLayers>) => void;
    setMeasurementUnit: (
      next: FunctionalStateAction<PlanMeasurementUnit>
    ) => void;
    setOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
    setFixedElements: Dispatch<SetStateAction<FixedElement2D[]>>;
    selectOverlay: (id: string | null) => void;
    selectAnnotationTool: PresentExportDialogActions["onSelectAnnotationTool"];
    deleteOverlay: (id: string | null) => void;
    changeOpening: PresentExportDialogActions["onOpeningChange"];
    applyLayerPresetInTransaction: (preset: PlanLayerPresetId) => void;
  };
  presentation: {
    changeLightingPreset: PresentExportDialogActions["onLightingPresetChange"];
    createShareLink: PresentExportDialogActions["onCreateShareLink"];
    setExportStylePreset: (
      next: FunctionalStateAction<ExportStylePreset>
    ) => void;
    exportImages: PresentExportDialogActions["onExportImages"];
    exportPdf: PresentExportDialogActions["onExportPdf"];
    generateAiNotes: PresentExportDialogActions["onGenerateAiNotes"];
  };
};

export type UseDesignPagePresentExportControllerInput = {
  state: DesignPagePresentExportControllerState;
  configuration: DesignPagePresentExportControllerConfiguration;
  actions: DesignPagePresentExportControllerActions;
};

export function useDesignPagePresentExportController({
  state,
  configuration,
  actions,
}: UseDesignPagePresentExportControllerInput): PresentExportDialogProps {
  const closeToDesign = useCallback(() => {
    actions.shell.setPresentModalOpen(false);
    actions.shell.setEditorMode("design");
  }, [actions.shell]);

  const selectRoom = useCallback(
    (roomId: string) => {
      actions.shell.setPresentModeRoomId(roomId);
      actions.shell.setDesignSnapshot(
        switchRoom(state.document.snapshot, roomId)
      );
    },
    [actions.shell, state.document.snapshot]
  );

  const changeViewMode = useCallback(
    (next: EditorViewMode) => {
      actions.shell.changeViewMode(next);
      if (next === "3d") {
        actions.camera.transitionToView(
          actions.camera.getEyeLevelView(),
          configuration.eyeLevelTransitionDurationMs
        );
      }
    },
    [actions.camera, actions.shell, configuration.eyeLevelTransitionDurationMs]
  );

  const focusCamera = useCallback(() => {
    actions.shell.changeViewMode("3d");
    actions.camera.transitionToView(
      actions.camera.getFocusView(),
      configuration.focusTransitionDurationMs
    );
  }, [actions.camera, actions.shell, configuration.focusTransitionDurationMs]);

  const enableProPlanControls = useCallback(() => {
    if (!configuration.canUseAdvancedPlanControls) {
      actions.shell.setUpgradeReason("designer");
      actions.shell.setUpgradeOpen(true);
      return;
    }
    actions.plan.setSimpleControls(false);
  }, [
    actions.plan,
    actions.shell,
    configuration.canUseAdvancedPlanControls,
  ]);

  const changePlanLayerPreset = useCallback(
    (preset: PlanLayerPresetId) => {
      actions.plan.runOverlayCommand(`preset:${preset}`);
    },
    [actions.plan]
  );

  const changePlanTheme = useCallback(
    (theme: PlanTheme) => {
      actions.history.runTransaction("Change plan theme", () =>
        actions.plan.setTheme(theme)
      );
    },
    [actions.history, actions.plan]
  );

  const togglePlanLayer = useCallback(
    (key: keyof PlanLayers) => {
      actions.history.runTransaction("Toggle plan layer", () =>
        actions.plan.setLayers((previous) => ({
          ...previous,
          [key]: !previous[key],
        }))
      );
    },
    [actions.history, actions.plan]
  );

  const changeMeasurementUnit = useCallback(
    (unit: PlanMeasurementUnit) => {
      actions.history.runTransaction("Change measurement unit", () =>
        actions.plan.setMeasurementUnit(unit)
      );
    },
    [actions.history, actions.plan]
  );

  const addOpening = useCallback(
    (kind: RoomOpening2D["kind"]) => {
      const id = `opening-${Date.now()}`;
      actions.history.runTransaction(
        kind === "door" ? "Add door" : "Add window",
        () =>
          actions.plan.setOpenings((previous) => [
            ...previous,
            {
              id,
              wall: kind === "door" ? "south" : "north",
              kind,
              offsetMm: 0,
              widthMm: kind === "door" ? 900 : 1200,
            },
          ])
      );
      actions.plan.selectOverlay(id);
    },
    [actions.history, actions.plan]
  );

  const addBuiltIn = useCallback(() => {
    const id = `fixed-${Date.now()}`;
    actions.history.runTransaction("Add plan fixture", () =>
      actions.plan.setFixedElements((previous) => [
        ...previous,
        {
          id,
          kind: "wardrobe",
          xMm: 0,
          zMm: 0,
          widthMm: 1200,
          depthMm: 600,
          rotationDeg: 0,
          label: "Wardrobe",
        },
      ])
    );
    actions.plan.selectOverlay(id);
  }, [actions.history, actions.plan]);

  const deleteSelectedOverlay = useCallback(() => {
    actions.plan.deleteOverlay(state.dialog.selectedPlanOverlayId);
  }, [actions.plan, state.dialog.selectedPlanOverlayId]);

  const changeExportStyle = useCallback(
    (preset: ExportStylePreset) => {
      if (preset === "pro" && !configuration.canUseAdvancedExportStyles) {
        actions.shell.setUpgradeReason("export_images");
        actions.shell.setUpgradeOpen(true);
        return;
      }
      actions.history.runTransaction("Change export style", () => {
        actions.presentation.setExportStylePreset(preset);
        actions.plan.applyLayerPresetInTransaction(
          preset === "pro" ? "technical" : "presentation"
        );
      });
    },
    [
      actions.history,
      actions.plan,
      actions.presentation,
      actions.shell,
      configuration.canUseAdvancedExportStyles,
    ]
  );

  const exportImages = useCallback(() => {
    actions.presentation.exportImages();
    closeToDesign();
  }, [actions.presentation, closeToDesign]);

  const exportPdf = useCallback(() => {
    actions.presentation.exportPdf();
    closeToDesign();
  }, [actions.presentation, closeToDesign]);

  const generateAiNotes = useCallback(() => {
    actions.presentation.generateAiNotes();
    closeToDesign();
  }, [actions.presentation, closeToDesign]);

  return {
    configuration: {
      open: configuration.open,
      designerTheme: configuration.designerTheme,
      canUseAdvancedPlanControls: configuration.canUseAdvancedPlanControls,
      canUseAdvancedExportStyles: configuration.canUseAdvancedExportStyles,
    },
    state: state.dialog,
    actions: {
      onClose: closeToDesign,
      onSelectRoom: selectRoom,
      onViewModeChange: changeViewMode,
      onFocusCamera: focusCamera,
      onCameraViewNameChange: actions.camera.setName,
      onSaveCameraView: actions.camera.save,
      onOpenCameraView: actions.camera.open,
      onDeleteCameraView: actions.camera.delete,
      onLayoutVersionNameChange: actions.layoutVersions.setName,
      onSaveLayoutVersion: actions.layoutVersions.save,
      onRestoreLayoutVersion: actions.layoutVersions.restore,
      onDeleteLayoutVersion: actions.layoutVersions.delete,
      onEnableSimplePlanControls: () => actions.plan.setSimpleControls(true),
      onEnableProPlanControls: enableProPlanControls,
      onPlanLayerPresetChange: changePlanLayerPreset,
      onPlanThemeChange: changePlanTheme,
      onTogglePlanLayer: togglePlanLayer,
      onMeasurementUnitChange: changeMeasurementUnit,
      onSelectAnnotationTool: actions.plan.selectAnnotationTool,
      onAddOpening: addOpening,
      onAddBuiltIn: addBuiltIn,
      onDeleteSelectedPlanOverlay: deleteSelectedOverlay,
      onOpeningChange: actions.plan.changeOpening,
      onLightingPresetChange: actions.presentation.changeLightingPreset,
      onCreateShareLink: actions.presentation.createShareLink,
      onExportStyleChange: changeExportStyle,
      onExportImages: exportImages,
      onExportPdf: exportPdf,
      onGenerateAiNotes: generateAiNotes,
    },
  };
}
