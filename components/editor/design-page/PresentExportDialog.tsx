"use client";

import dynamic from "next/dynamic";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import ExportReadinessPreview from "@/components/editor/ExportReadinessPreview";
import PlanOpeningInspector from "@/components/editor/PlanOpeningInspector";
import { LightingPresetsUI } from "@/components/LightingPresetsUI";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { ExportReadinessItem } from "@/lib/design-page-export-readiness";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { PlanLayerPresetId, PlanMeasurementUnit } from "@/lib/design-page-types";
import { compareLayoutVersion, summarizeLayoutVersionComparison } from "@/lib/layout-versions";
import type { LightingPreset } from "@/lib/lightingPresets";
import type { RoomSnapshot, SavedView } from "@/lib/room-types";
import type { ExportStylePreset, PlanLayers, PlanTheme } from "@/lib/useDesignPagePlanState";
import { formatTimeAgo } from "@/lib/design-page-utils";

const PresentExportProfessionalPlanControls = dynamic(
  () => import("@/components/editor/design-page/PresentExportProfessionalPlanControls"),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" className="rounded-lg border border-gray-200/70 p-3 text-xs text-gray-500">
        Loading professional plan controls…
      </div>
    ),
  }
);

type AnnotationToolKind = "note" | "callout" | "room_tag";

type OpeningMetrics = DesignPageOpeningMetricsPatch;

export type PresentExportDialogProps = {
  configuration: {
    open: boolean;
    designerTheme: boolean;
    canUseAdvancedPlanControls: boolean;
    canUseAdvancedExportStyles: boolean;
  };
  state: {
    exportReadiness: { items: ExportReadinessItem[]; readyCount: number; score: number };
    rooms: Array<{ id: string; name: string }>;
    currentRoomId: string | null;
    viewMode: EditorViewMode;
    cameraViewNameInput: string;
    activeRoom: RoomSnapshot | null;
    layoutVersionNameInput: string;
    simplePlanControls: boolean;
    planLayerPreset: PlanLayerPresetId;
    planLayers: PlanLayers;
    planMeasurementUnit: PlanMeasurementUnit;
    planTheme: PlanTheme;
    annotationToolKind: AnnotationToolKind;
    selectedPlanOverlayId: string | null;
    visiblePlanOpening: RoomOpening2D | null;
    visiblePlanOpeningRoomName: string;
    visiblePlanOpeningWallSpanMeters: number;
    visiblePlanOpeningMaxHeightMeters: number;
    lightingPreset: LightingPreset;
    sharingDesign: boolean;
    designId: string | null;
    shareToken: string | null;
    exportStylePreset: ExportStylePreset;
    isExporting: boolean;
    isPdfExporting: boolean;
    sceneReady: boolean;
    aiNotesLoading: boolean;
    hasItems: boolean;
  };
  actions: {
    onClose: () => void;
    onSelectRoom: (roomId: string) => void;
    onViewModeChange: (next: EditorViewMode) => void;
    onFocusCamera: () => void;
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
    onOpeningChange: (id: string, metrics: OpeningMetrics) => void;
    onLightingPresetChange: (preset: LightingPreset) => void;
    onCreateShareLink: () => void;
    onExportStyleChange: (preset: ExportStylePreset) => void;
    onExportImages: () => void;
    onExportPdf: () => void;
    onGenerateAiNotes: () => void;
  };
};

export function PresentExportDialog({ configuration, state, actions }: PresentExportDialogProps) {
  const showDesignerTheme = configuration.designerTheme;
  const canUseAdvancedPlanControls =
    configuration.canUseAdvancedPlanControls;
  const canUseAdvancedExportStyles =
    configuration.canUseAdvancedExportStyles;
  const {
    exportReadiness,
    rooms,
    currentRoomId,
    viewMode,
    cameraViewNameInput,
    activeRoom,
    layoutVersionNameInput,
    simplePlanControls,
    planLayerPreset,
    planLayers,
    planMeasurementUnit,
    planTheme,
    annotationToolKind,
    selectedPlanOverlayId,
    visiblePlanOpening,
    visiblePlanOpeningRoomName,
    visiblePlanOpeningWallSpanMeters,
    visiblePlanOpeningMaxHeightMeters,
    lightingPreset,
    sharingDesign,
    designId,
    shareToken,
    exportStylePreset,
    isExporting,
    isPdfExporting,
    sceneReady,
    aiNotesLoading,
    hasItems,
  } = state;
  const activeRoomSavedViews = activeRoom?.savedViews ?? [];
  const activeRoomLayoutVersions = activeRoom?.layoutVersions ?? [];
  const latestManualLayoutVersion =
    activeRoomLayoutVersions.find(
      (version) => version.source === "manual" && version.name.toLowerCase().startsWith("before")
    ) ?? activeRoomLayoutVersions.find((version) => version.source === "manual") ?? null;

  if (!configuration.open) return null;

  return (
    <EditorDialog
      open
      title="Present & Export"
      description="Review the design, save views, and prepare presentation outputs."
      onClose={actions.onClose}
      closeLabel="Close export panel"
      dark={showDesignerTheme}
      overlayClassName="items-start overflow-y-auto sm:items-center"
      panelClassName={
        showDesignerTheme
          ? "designer-panel max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto"
          : "max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto"
      }
      contentClassName="space-y-4"
    >
          <ExportReadinessPreview
            dark={showDesignerTheme}
            items={exportReadiness.items}
            readyCount={exportReadiness.readyCount}
            score={exportReadiness.score}
          />

          {/* Room Switcher Section */}
          {(() => {
            if (rooms.length > 1) {
              return (
                <div>
                  <h3 className={
                    showDesignerTheme
                      ? "designer-text-primary mb-2 text-sm font-semibold"
                      : "mb-2 text-sm font-semibold text-gray-800"
                  }>
                    Room
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {rooms.map((room) => (
                      <button
                        key={room.id}
                        data-testid="room-select"
                        className={
                          room.id === currentRoomId
                            ? showDesignerTheme
                              ? "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white"
                              : "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white"
                            : showDesignerTheme
                              ? "designer-control rounded-lg border px-3 py-2 text-sm text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                        }
                        onClick={() => actions.onSelectRoom(room.id)}
                      >
                        {room.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Camera Views Section */}
          <div>
            <h3 className={
              showDesignerTheme
                ? "designer-text-primary mb-2 text-sm font-semibold"
                : "mb-2 text-sm font-semibold text-gray-800"
            }>
              Camera Views
            </h3>
            <div className="space-y-2">
              <EditorViewToggle
                value={viewMode}
                onChange={actions.onViewModeChange}
                dark={showDesignerTheme}
              />
              <div className="grid grid-cols-1 gap-2">
              <button
                className={
                  showDesignerTheme
                    ? "designer-control rounded-lg border px-3 py-2 text-sm text-neutral-200"
                    : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                }
                onClick={actions.onFocusCamera}
              >
                Focus
              </button>
            </div>
              <div
                className={
                  showDesignerTheme
                    ? "designer-raised mt-3 rounded-lg p-3"
                    : "mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                }
              >
                <label
                  htmlFor="camera-view-name"
                  className={
                    showDesignerTheme
                      ? "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
                      : "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                  }
                >
                  Named camera view
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    id="camera-view-name"
                    data-testid="camera-view-name-input"
                    value={cameraViewNameInput}
                    onChange={(event) => actions.onCameraViewNameChange(event.target.value)}
                    placeholder={`View ${activeRoomSavedViews.length + 1}`}
                    className={
                      showDesignerTheme
                        ? "min-h-10 rounded-lg border border-neutral-700 bg-[#0f1218] px-3 text-sm text-neutral-100 placeholder:text-neutral-500"
                        : "min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400"
                    }
                  />
                  <button
                    type="button"
                    data-testid="save-named-camera-view"
                    onClick={actions.onSaveCameraView}
                    className="min-h-10 rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white hover:bg-neutral-800"
                  >
                    Save
                  </button>
                </div>
                {activeRoomSavedViews.length > 0 ? (
                  <div className="mt-3 space-y-2" data-testid="saved-camera-view-list">
                    {activeRoomSavedViews.map((view) => (
                      <div
                        key={view.id}
                        className={
                          showDesignerTheme
                            ? "flex items-center justify-between gap-2 rounded-lg bg-[#0f1218] px-3 py-2"
                            : "flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
                        }
                      >
                        <button
                          type="button"
                          data-testid={`saved-camera-view-open-${view.id}`}
                          className={
                            showDesignerTheme
                              ? "min-w-0 flex-1 truncate text-left text-xs font-semibold text-neutral-100"
                              : "min-w-0 flex-1 truncate text-left text-xs font-semibold text-gray-800"
                          }
                          onClick={() => actions.onOpenCameraView(view)}
                        >
                          {view.name}
                        </button>
                        <button
                          type="button"
                          data-testid={`saved-camera-view-delete-${view.id}`}
                          className={
                            showDesignerTheme
                              ? "designer-control rounded border px-2 py-1 text-[11px] font-semibold"
                              : "rounded px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          }
                          onClick={() => actions.onDeleteCameraView(view.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={showDesignerTheme ? "mt-2 text-xs text-neutral-400" : "mt-2 text-xs text-gray-500"}>
                    Saved views appear on share links and export packs.
                  </div>
                )}
              </div>
              <div
                className={
                  showDesignerTheme
                    ? "designer-raised mt-3 rounded-lg p-3"
                    : "mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                }
                data-testid="layout-versions-panel"
              >
                <label
                  htmlFor="layout-version-name"
                  className={
                    showDesignerTheme
                      ? "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
                      : "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                  }
                >
                  Layout versions
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    id="layout-version-name"
                    data-testid="layout-version-name-input"
                    value={layoutVersionNameInput}
                    onChange={(event) => actions.onLayoutVersionNameChange(event.target.value)}
                    placeholder={`Layout ${activeRoomLayoutVersions.length + 1}`}
                    className={
                      showDesignerTheme
                        ? "min-h-10 rounded-lg border border-neutral-700 bg-[#0f1218] px-3 text-sm text-neutral-100 placeholder:text-neutral-500"
                        : "min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400"
                    }
                  />
                  <button
                    type="button"
                    data-testid="save-layout-version"
                    onClick={actions.onSaveLayoutVersion}
                    className="min-h-10 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-500"
                  >
                    Save
                  </button>
                </div>
                {latestManualLayoutVersion ? (
                  <button
                    type="button"
                    data-testid="layout-version-restore-latest-manual"
                    className={
                      showDesignerTheme
                        ? "mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-teal-400/20 bg-teal-400/10 px-3 py-2 text-left text-xs font-semibold text-teal-100 hover:bg-teal-400/15"
                        : "mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-left text-xs font-semibold text-teal-800 hover:bg-teal-100"
                    }
                    onClick={() => actions.onRestoreLayoutVersion(latestManualLayoutVersion.id)}
                  >
                    <span className="min-w-0 truncate">
                      Restore previous manual layout
                    </span>
                    <span className={showDesignerTheme ? "shrink-0 text-teal-200" : "shrink-0 text-teal-700"}>
                      {formatTimeAgo(latestManualLayoutVersion.timestamp)}
                    </span>
                  </button>
                ) : null}
                {activeRoomLayoutVersions.length > 0 && activeRoom ? (
                  <div className="mt-3 space-y-2" data-testid="layout-version-list">
                    {activeRoomLayoutVersions.map((version) => {
                      const comparison = compareLayoutVersion(activeRoom, version);
                      const comparisonSummary = summarizeLayoutVersionComparison(comparison);
                      const sourceLabel =
                        version.source === "make_space"
                          ? "Make space"
                          : version.source === "auto_place"
                            ? "Auto"
                            : version.source === "ai"
                              ? "AI"
                              : "Manual";

                      return (
                        <div
                          key={version.id}
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#0f1218] px-3 py-2"
                              : "rounded-lg bg-white px-3 py-2"
                          }
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div
                                className={
                                  showDesignerTheme
                                    ? "truncate text-xs font-semibold text-neutral-100"
                                    : "truncate text-xs font-semibold text-gray-800"
                                }
                              >
                                {version.name}
                              </div>
                              <div
                                className={
                                  showDesignerTheme
                                    ? "mt-0.5 text-[11px] text-neutral-400"
                                    : "mt-0.5 text-[11px] text-gray-500"
                                }
                              >
                                {sourceLabel} · {formatTimeAgo(version.timestamp)}
                              </div>
                              <div data-testid="layout-version-comparison" className="mt-2 grid grid-cols-2 gap-1.5">
                                <div className={showDesignerTheme ? "designer-recessed rounded-md px-2 py-1.5" : "rounded-md bg-gray-50 px-2 py-1.5"}>
                                  <div className={showDesignerTheme ? "text-[10px] font-semibold uppercase text-neutral-500" : "text-[10px] font-semibold uppercase text-gray-400"}>
                                    Saved
                                  </div>
                                  <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-gray-900"}>
                                    {comparison.savedItemCount} item{comparison.savedItemCount === 1 ? "" : "s"}
                                  </div>
                                </div>
                                <div className={showDesignerTheme ? "designer-recessed rounded-md px-2 py-1.5" : "rounded-md bg-gray-50 px-2 py-1.5"}>
                                  <div className={showDesignerTheme ? "text-[10px] font-semibold uppercase text-neutral-500" : "text-[10px] font-semibold uppercase text-gray-400"}>
                                    Current
                                  </div>
                                  <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-gray-900"}>
                                    {comparison.currentItemCount} item{comparison.currentItemCount === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </div>
                              <div className={showDesignerTheme ? "mt-2 text-[11px] text-neutral-400" : "mt-2 text-[11px] text-gray-500"}>
                                {comparisonSummary.itemDeltaLabel} · {comparisonSummary.movementLabel}
                              </div>
                              <div className={showDesignerTheme ? "mt-0.5 text-[11px] text-neutral-500" : "mt-0.5 text-[11px] text-gray-500"}>
                                {comparisonSummary.zoneDeltaLabel}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                data-testid={`layout-version-restore-${version.id}`}
                                className={
                                  showDesignerTheme
                                    ? "designer-control rounded border px-2 py-1 text-[11px] font-semibold text-teal-200"
                                    : "rounded px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50"
                                }
                                onClick={() => actions.onRestoreLayoutVersion(version.id)}
                              >
                                {comparisonSummary.restoreLabel}
                              </button>
                              <button
                                type="button"
                                data-testid={`layout-version-delete-${version.id}`}
                                className={
                                  showDesignerTheme
                                    ? "designer-control rounded border px-2 py-1 text-[11px] font-semibold"
                                    : "rounded px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                }
                                onClick={() => actions.onDeleteLayoutVersion(version.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={showDesignerTheme ? "mt-2 text-xs text-neutral-400" : "mt-2 text-xs text-gray-500"}>
                    No saved layouts yet.
                  </div>
                )}
              </div>
            </div>
            {viewMode === "2d" && (
              <div className="mt-2 space-y-2">
                <p className={showDesignerTheme ? "text-xs text-neutral-400" : "text-xs text-gray-500"}>
                  Pan and zoom are enabled; rotation is locked for plan editing.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={
                      simplePlanControls
                        ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                        : showDesignerTheme
                          ? "designer-control rounded-lg border px-3 py-2 text-xs text-neutral-200"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                    }
                    onClick={actions.onEnableSimplePlanControls}
                  >
                    Simple controls
                  </button>
                  <button
                    aria-disabled={!canUseAdvancedPlanControls}
                    title={!canUseAdvancedPlanControls ? "Upgrade to Pro to use advanced plan controls" : undefined}
                    className={
                      !simplePlanControls
                        ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                        : showDesignerTheme
                          ? "designer-control rounded-lg border px-3 py-2 text-xs text-neutral-200"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                    }
                    onClick={actions.onEnableProPlanControls}
                  >
                    Pro controls
                  </button>
                </div>

                {simplePlanControls ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-recessed rounded-lg p-3 text-xs text-neutral-300"
                        : "rounded-lg bg-gray-100 p-3 text-xs text-gray-600"
                    }
                  >
                    Simple mode keeps the plan clean. Use Pro controls for layers, doors/windows, and theme tuning.
                  </div>
                ) : (
                  <PresentExportProfessionalPlanControls
                    dark={showDesignerTheme}
                    preset={planLayerPreset}
                    layers={planLayers}
                    theme={planTheme}
                    onPresetChange={actions.onPlanLayerPresetChange}
                    onThemeChange={actions.onPlanThemeChange}
                    onToggleLayer={actions.onTogglePlanLayer}
                  />
                )}
                <div className="rounded-lg border border-gray-200/70 p-2">
                  <div className={showDesignerTheme ? "mb-2 text-[11px] text-neutral-400" : "mb-2 text-[11px] text-gray-500"}>
                    Measurement units
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["mm", "Millimeters"],
                      ["cm", "Centimeters"],
                      ["in", "Inches"],
                    ] as const).map(([unit, label]) => (
                      <button
                        key={unit}
                        className={
                          planMeasurementUnit === unit
                            ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                            : showDesignerTheme
                              ? "designer-control rounded-lg border px-2 py-2 text-[11px] text-neutral-200"
                              : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                        }
                        onClick={() => actions.onMeasurementUnitChange(unit)}
                        title={label}
                      >
                        {unit.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    data-testid="plan-add-note"
                    className={
                      annotationToolKind === "note"
                        ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                        : showDesignerTheme
                          ? "designer-control rounded-lg border px-2 py-2 text-[11px] text-neutral-200"
                          : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                    }
                    onClick={() => actions.onSelectAnnotationTool("note")}
                  >
                    + Note
                  </button>
                  {!simplePlanControls && (
                    <button
                      type="button"
                      data-testid="plan-add-callout"
                      className={
                        annotationToolKind === "callout"
                          ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                          : showDesignerTheme
                            ? "designer-control rounded-lg border px-2 py-2 text-[11px] text-neutral-200"
                            : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                      }
                      onClick={() => actions.onSelectAnnotationTool("callout")}
                    >
                      + Callout
                    </button>
                  )}
                  {!simplePlanControls && (
                    <button
                      type="button"
                      data-testid="plan-add-room-tag"
                      className={
                        annotationToolKind === "room_tag"
                          ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                          : showDesignerTheme
                            ? "designer-control rounded-lg border px-2 py-2 text-[11px] text-neutral-200"
                            : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                      }
                      onClick={() => actions.onSelectAnnotationTool("room_tag")}
                    >
                      + Room Tag
                    </button>
                  )}
                </div>

                {!simplePlanControls && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={
                        showDesignerTheme
                          ? "designer-control rounded-lg border px-3 py-2 text-xs text-neutral-200"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                      }
                      onClick={() => actions.onAddOpening("door")}
                    >
                      + Door
                    </button>
                    <button
                      className={
                        showDesignerTheme
                          ? "designer-control rounded-lg border px-3 py-2 text-xs text-neutral-200"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                      }
                      onClick={() => actions.onAddOpening("window")}
                    >
                      + Window
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {!simplePlanControls ? (
                    <button
                      className={
                        showDesignerTheme
                          ? "designer-control rounded-lg border px-3 py-2 text-xs text-neutral-200"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                      }
                      onClick={actions.onAddBuiltIn}
                    >
                      + Built-in
                    </button>
                  ) : (
                    <div
                      className={
                        showDesignerTheme
                          ? "designer-recessed rounded-lg px-3 py-2 text-center text-xs text-neutral-400"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500"
                      }
                    >
                      Built-ins in Pro
                    </div>
                  )}
                  <button
                    className={
                      selectedPlanOverlayId
                        ? "rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white"
                        : "rounded-lg bg-gray-200 px-3 py-2 text-xs text-gray-500"
                    }
                    disabled={!selectedPlanOverlayId}
                    onClick={actions.onDeleteSelectedPlanOverlay}
                  >
                    Delete Selected
                  </button>
                </div>

                {visiblePlanOpening && (
                  <PlanOpeningInspector
                    opening={visiblePlanOpening}
                    roomName={visiblePlanOpeningRoomName}
                    wallSpanMeters={visiblePlanOpeningWallSpanMeters}
                    maxHeightMeters={visiblePlanOpeningMaxHeightMeters}
                    measurementUnit={planMeasurementUnit}
                    dark={showDesignerTheme}
                    onChange={actions.onOpeningChange}
                  />
                )}
              </div>
            )}
          </div>

          {/* Lighting Section */}
          <div>
            <h3 className={
              showDesignerTheme
                ? "designer-text-primary mb-2 text-sm font-semibold"
                : "mb-2 text-sm font-semibold text-gray-800"
            }>
              Lighting
            </h3>
            <LightingPresetsUI
              current={lightingPreset}
              onChange={actions.onLightingPresetChange}
              theme={showDesignerTheme ? "designer" : "default"}
            />
          </div>

          {/* Client Handoff Section */}
          <div className="space-y-2 border-t pt-4">
            <h3 className={
              showDesignerTheme
                ? "designer-text-primary mb-2 text-sm font-semibold"
                : "mb-2 text-sm font-semibold text-gray-800"
            }>
              Client Handoff
            </h3>
            <button
              data-testid="create-share"
              className={
                showDesignerTheme
                  ? "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  : "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              }
              disabled={sharingDesign || !designId}
              onClick={actions.onCreateShareLink}
              title={!designId ? "Save your design first to create a share link" : ""}
            >
              {sharingDesign ? "Creating link..." : shareToken ? "🔗 Copy Share Link" : "🔗 Create Share Link"}
            </button>
            {!designId && (
              <div className={
                showDesignerTheme
                  ? "text-xs text-neutral-400"
                  : "text-xs text-gray-500"
              }>
                💡 Save your design first to create a share link
              </div>
            )}
            {shareToken && (
              <a
                href={`/share/${shareToken}/export`}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  showDesignerTheme
                    ? "designer-control-active block w-full rounded-lg border px-4 py-3 text-center text-sm font-medium"
                    : "block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
                }
              >
                📦 View Export Pack
              </a>
            )}
          </div>

          {/* Export Section */}
          <div className="space-y-2 border-t pt-4">
            {!simplePlanControls && (
              <>
                <div className={showDesignerTheme ? "text-xs text-neutral-400" : "text-xs text-gray-500"}>
                  Export style preset
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={
                      exportStylePreset === "consumer"
                        ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                        : showDesignerTheme
                          ? "designer-control rounded-lg border px-3 py-2 text-xs text-neutral-200"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                    }
                    onClick={() => actions.onExportStyleChange("consumer")}
                  >
                    Consumer
                  </button>
                  <button
                    aria-disabled={!canUseAdvancedExportStyles}
                    title={!canUseAdvancedExportStyles ? "Upgrade to Pro to use the Pro export preset" : undefined}
                    className={
                      exportStylePreset === "pro"
                        ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                        : showDesignerTheme
                          ? "designer-control rounded-lg border px-3 py-2 text-xs text-neutral-200"
                          : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                    }
                    onClick={() => actions.onExportStyleChange("pro")}
                  >
                    Pro
                  </button>
                </div>
              </>
            )}
            <button
              className={
                showDesignerTheme
                  ? "designer-control-active w-full rounded-lg border px-4 py-3 text-sm font-medium disabled:opacity-50"
                  : "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              }
              disabled={isExporting || !sceneReady}
              onClick={actions.onExportImages}
            >
              {isExporting ? "Exporting..." : "📸 Export Images"}
            </button>
            <button
              className={
                showDesignerTheme
                  ? "designer-control-active w-full rounded-lg border px-4 py-3 text-sm font-medium disabled:opacity-50"
                  : "w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              }
              disabled={isPdfExporting || !sceneReady}
              onClick={actions.onExportPdf}
            >
              {isPdfExporting ? "Generating..." : "📄 Export PDF"}
            </button>
            <button
              className={
                showDesignerTheme
                  ? "designer-control-active w-full rounded-lg border px-4 py-3 text-sm font-medium disabled:opacity-50"
                  : "w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              }
              disabled={aiNotesLoading || !hasItems}
              onClick={actions.onGenerateAiNotes}
            >
              {aiNotesLoading ? "Generating..." : "✨ AI Notes"}
            </button>
          </div>

          {/* Exit Present Mode Button */}
          <div className="border-t pt-4">
            <button
              className={
                showDesignerTheme
                  ? "designer-control w-full rounded-lg border px-4 py-3 text-sm font-medium"
                  : "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              }
              onClick={actions.onClose}
            >
              ← Back to Design Mode
            </button>
          </div>
    </EditorDialog>
  );
}
