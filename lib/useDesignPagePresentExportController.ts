"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { PlanLayerPresetId } from "@/lib/design-page-types";
import type { PresentationTools } from "@/lib/design-page-presentation-tools";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import type { LightingPreset } from "@/lib/lightingPresets";
import {
  DEFAULT_DOOR_WIDTH_MM,
  DEFAULT_WINDOW_WIDTH_MM,
} from "@/lib/design-page-opening-dimensions";
import type {
  ExportStylePreset,
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";

type PresentExportDialogActions = PresentationTools["actions"];
type PresentExportUpgradeReason = "designer" | "export_images";
type PlanMeasurementUnit = PresentationTools["state"]["planMeasurementUnit"];
type PlanOverlayPresetCommand = `preset:${PlanLayerPresetId}`;
type FunctionalStateAction<T> = T | ((previous: T) => T);

export type DesignPagePresentExportControllerState = {
  tools: PresentationTools["state"];
};

export type DesignPagePresentExportControllerConfiguration = PresentationTools["configuration"];

export type DesignPagePresentExportControllerActions = {
  shell: {
    setUpgradeReason: (reason: PresentExportUpgradeReason) => void;
    setUpgradeOpen: (open: boolean) => void;
  };
  camera: {
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
    applyLayerPresetInTransaction: (preset: PlanLayerPresetId) => void;
  };
  presentation: {
    /** The Lighting drawer's mode buttons (UX audit ED14: lighting has one home). */
    changeLightingPreset: (preset: LightingPreset) => void;
    setExportStylePreset: (
      next: FunctionalStateAction<ExportStylePreset>
    ) => void;
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
}: UseDesignPagePresentExportControllerInput): PresentationTools {
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
      actions.history.runTransaction("Change units", () =>
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
              widthMm: kind === "door" ? DEFAULT_DOOR_WIDTH_MM : DEFAULT_WINDOW_WIDTH_MM,
            },
          ])
      );
      actions.plan.selectOverlay(id);
    },
    [actions.history, actions.plan]
  );

  const addBuiltIn = useCallback(() => {
    const id = `fixed-${Date.now()}`;
    actions.history.runTransaction("Add built-in", () =>
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
    actions.plan.deleteOverlay(state.tools.selectedPlanOverlayId);
  }, [actions.plan, state.tools.selectedPlanOverlayId]);

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

  return {
    configuration: {
      canUseAdvancedPlanControls: configuration.canUseAdvancedPlanControls,
      canUseAdvancedExportStyles: configuration.canUseAdvancedExportStyles,
    },
    state: state.tools,
    actions: {
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
      onExportStyleChange: changeExportStyle,
      onGenerateAiNotes: actions.presentation.generateAiNotes,
    },
  };
}
