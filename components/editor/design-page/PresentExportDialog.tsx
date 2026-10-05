"use client";

import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { Button } from "@/components/ui/Button";
import { LayoutVersionsSection } from "@/components/editor/design-page/LayoutVersionsSection";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { ExportReadinessItem } from "@/lib/design-page-export-readiness";
import type { PlanLayerPresetId, PlanMeasurementUnit } from "@/lib/design-page-types";
import type { RoomSnapshot, SavedView } from "@/lib/room-types";
import { PRESENT_EXPORT_CLOSE_ACTION_ID, PRESENT_EXPORT_CREATE_SHARE_ACTION_ID } from "@/lib/share-link-fallback-dialog-focus";
import type { ExportStylePreset, PlanLayers, PlanTheme } from "@/lib/useDesignPagePlanState";

type AnnotationToolKind = "note" | "callout" | "room_tag";

export type PresentExportDialogProps = {
  configuration: {
    open: boolean;
    designerTheme: boolean;
    canUseAdvancedPlanControls: boolean;
    canUseAdvancedExportStyles: boolean; shareFallbackOpen?: boolean;
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
    rooms,
    currentRoomId,
    viewMode,
    activeRoom,
    layoutVersionNameInput,
    sharingDesign,
    designId,
    shareToken,
    isExporting,
    isPdfExporting,
    sceneReady,
    aiNotesLoading,
    hasItems,
  } = state;

  if (!configuration.open) return null;

  return (
    <EditorDialog
      open
      title="Present & Export"
      description="Share the design, and export images or a PDF."
      onClose={actions.onClose}
      closeLabel="Close export panel"
      closeDisabled={Boolean(configuration.shareFallbackOpen)}
      closeButtonId={PRESENT_EXPORT_CLOSE_ACTION_ID} closeButtonTestId="present-export-close"
      testId="present-export-dialog" cancelFocusRestorationOnUnmount manageBackground
      dark={showDesignerTheme}
      overlayClassName="items-start overflow-y-auto sm:items-center"
      panelClassName={
        showDesignerTheme
          ? "designer-panel max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto"
          : "max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto"
      }
      contentClassName="space-y-4"
    >
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
              View
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
              {canUseAdvancedPlanControls ? (
                <LayoutVersionsSection
                  activeRoom={activeRoom}
                  nameInput={layoutVersionNameInput}
                  onNameChange={actions.onLayoutVersionNameChange}
                  onSave={actions.onSaveLayoutVersion}
                  onRestore={actions.onRestoreLayoutVersion}
                  onDelete={actions.onDeleteLayoutVersion}
                />
              ) : null}
            </div>
          </div>

          <p data-testid="presentation-lighting-status" className="text-xs text-gray-500">
            While this panel is open, the 3D view shows presentation lighting and quality, which image
            and PDF exports use.
          </p>

          {/* Client Handoff Section */}
          <div className="space-y-2 border-t pt-4">
            <h3 className={
              showDesignerTheme
                ? "designer-text-primary mb-2 text-sm font-semibold"
                : "mb-2 text-sm font-semibold text-gray-800"
            }>
              Share
            </h3>
            <Button
              id={PRESENT_EXPORT_CREATE_SHARE_ACTION_ID} data-testid="create-share"
              className="w-full"
              disabled={sharingDesign || !designId}
              onClick={actions.onCreateShareLink}
              title={!designId ? "Save your design first to share it" : ""}
            >
              {sharingDesign ? "Creating link…" : shareToken ? "Copy link" : "Create link"}
            </Button>
            {!designId && (
              <div className="text-xs text-gray-500">
                Save your design first to share it
              </div>
            )}
          </div>

          {/* Export Section */}
          <div className="space-y-2 border-t pt-4">
            {/* UX audit SX4 (phase 4e): one primary action, no emoji; AI Notes is Pro's (Q5). */}
            <Button
              variant="primary"
              className="w-full"
              disabled={isExporting || !sceneReady}
              onClick={actions.onExportImages}
            >
              {isExporting ? "Exporting…" : "Export Images"}
            </Button>
            <Button className="w-full" disabled={isPdfExporting || !sceneReady} onClick={actions.onExportPdf}>
              {isPdfExporting ? "Generating…" : "Export PDF"}
            </Button>
            {canUseAdvancedExportStyles ? (
              <Button className="w-full" disabled={aiNotesLoading || !hasItems} onClick={actions.onGenerateAiNotes}>
                {aiNotesLoading ? "Generating…" : "AI Notes"}
              </Button>
            ) : null}
          </div>

          {/* Exit Present Mode Button */}
          <div className="border-t pt-4">
            <Button
              variant="quiet"
              className="w-full"
              disabled={Boolean(configuration.shareFallbackOpen)}
              onClick={actions.onClose}
            >
              Back to Design Mode
            </Button>
          </div>
    </EditorDialog>
  );
}
