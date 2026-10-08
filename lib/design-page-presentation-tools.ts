import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { PlanLayerPresetId, PlanMeasurementUnit } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { RoomSnapshot, SavedView } from "@/lib/room-types";
import type { ExportStylePreset, PlanLayers, PlanTheme } from "@/lib/useDesignPagePlanState";

type AnnotationToolKind = "note" | "callout" | "room_tag";

/**
 * The editor's presentation tools, which Present & export used to hold (retired in phase 4's small
 * PR, J's Q5): the plan display at the foot of Plan, layout versions above Furnish's foot, AI notes
 * at the foot of Suggest a layout, saved views on the 3D view, and the export state Download reads.
 */
export type PresentationTools = {
  configuration: {
    canUseAdvancedPlanControls: boolean;
    canUseAdvancedExportStyles: boolean;
  };
  state: {
    viewMode: EditorViewMode;
    activeRoom: RoomSnapshot | null;
    layoutVersionNameInput: string;
    simplePlanControls: boolean;
    planLayerPreset: PlanLayerPresetId;
    planLayers: PlanLayers;
    planMeasurementUnit: PlanMeasurementUnit;
    planTheme: PlanTheme;
    annotationToolKind: AnnotationToolKind;
    selectedPlanOverlayId: string | null;
    designId: string | null;
    exportStylePreset: ExportStylePreset;
    isExporting: boolean;
    isPdfExporting: boolean;
    sceneReady: boolean;
    aiNotesLoading: boolean;
    hasItems: boolean;
  };
  actions: {
    onCameraViewNameChange: (name: string) => void;
    onSaveCameraView: () => void;
    onOpenCameraView: (view: SavedView) => void;
    onDeleteCameraView: (viewId: string) => void;
    onLayoutVersionNameChange: (name: string) => void;
    onSaveLayoutVersion: () => void;
    onRestoreLayoutVersion: (versionId: string) => void;
    onDeleteLayoutVersion: (versionId: string) => void;
    onEnableSimplePlanControls: () => void;
    onEnableProPlanControls: () => void;
    onPlanLayerPresetChange: (preset: PlanLayerPresetId) => void;
    onPlanThemeChange: (theme: PlanTheme) => void;
    onTogglePlanLayer: (layer: keyof PlanLayers) => void;
    onMeasurementUnitChange: (unit: PlanMeasurementUnit) => void;
    onSelectAnnotationTool: (kind: AnnotationToolKind) => void;
    onAddOpening: (kind: RoomOpening2D["kind"]) => void;
    onAddBuiltIn: () => void;
    onDeleteSelectedPlanOverlay: () => void;
    onExportStyleChange: (preset: ExportStylePreset) => void;
    onGenerateAiNotes: () => void;
  };
};
