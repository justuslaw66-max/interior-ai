"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DisplayUnitSelect } from "@/components/editor/DisplayUnitSelect";
import MeasurementField from "@/components/editor/MeasurementField";
import {
  SelectedSurfaceInspector,
  type SelectedSurfaceInspectorActions,
  type SelectedSurfaceInspectorState,
} from "@/components/editor/design-page/SelectedSurfaceInspector";
import {
  ROOM_DIMENSION_DEFAULTS,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanConsumerMeasurementEvidenceV2 } from "@/lib/floor-plan-measured-property-mutations";
import type { DesignPageSelectionInspectorSummary } from "@/lib/useDesignPageSelectionInspectorModel";
import FloorPlanPropertyEvidenceControl from "@/components/editor/FloorPlanPropertyEvidenceControl";
import { SelectedOpeningDimensions, type SelectedOpeningDimensionsActions as OpeningActions } from "./SelectedOpeningDimensions";
import type { resolveDesignPageOpeningViewportState } from "@/lib/design-page-opening-viewport";
import { inspectorFrame, useInspectorPlacement } from "./selectionInspectorPlacement";

type SelectedRoom = Pick<HousePlanRoom2D, "id" | "w" | "d">;

export type DesignPageSelectionInspectorProps = {
  state: {
    summary: DesignPageSelectionInspectorSummary;
    selectedRoom: SelectedRoom | null;
    hasSelectedItem: boolean;
    hasVisiblePlanOpening: boolean;
    hasSelectedPlanFixedElement: boolean;
    hasSelectedPlanAnnotation: boolean;
    hasSelectedPlanOverlay: boolean;
    selectedOpening: NonNullable<ReturnType<typeof resolveDesignPageOpeningViewportState>>["inspector"] | null;
    surfaceInspectorIsWall: boolean;
    surfaceInspectorIsCeiling: boolean;
    surfaceInspector: SelectedSurfaceInspectorState | null;
    measurementUnit: PlanMeasurementUnit;
    activeRoomHeightMm: number;
    activeRoomWallHeightEvidence: FloorPlanPropertyEvidenceV2 | null;
    canEditActiveRoomWallHeight: boolean;
    activeFloorRoomCount: number;
    canDeleteSelectedRoom: boolean;
  };
  configuration: {
    dark: boolean;
    canEditPlanGeometry: boolean;
    proMode: boolean;
    dockWhenPortalAvailable: boolean;
    portalTarget: HTMLDivElement | null;
    dockedWidthPx: number;
    floatingRightPx: number;
    floatingTopPx: number;
    floatingWidthPx: number;
  };
  actions: {
    clearSelection: () => void;
    setMeasurementUnit: (unit: PlanMeasurementUnit) => void;
    commitRoomDimensionMm: (roomId: string, dimension: "width" | "depth", valueMm: number) => void;
    commitActiveFloorWallHeightMm: (valueMm: number, evidence?: FloorPlanConsumerMeasurementEvidenceV2, measurementNote?: string) => void;
    room: {
      editFloor: (roomId: string) => void;
      fit: (roomId: string) => void;
      duplicate: (roomId: string) => void;
      delete: (roomId: string) => void;
    };
    deleteSelectedPlanOverlay: () => void;
    commitOpeningWidthMm: OpeningActions["commitWidthMm"]; commitOpeningHeightMm: OpeningActions["commitHeightMm"];
    commitOpeningBottomMm: OpeningActions["commitBottomMm"]; commitOpeningKind: OpeningActions["commitKind"];
    commitOpeningWall: OpeningActions["commitWall"]; commitOpeningOffsetMm: OpeningActions["commitOffsetMm"];
    surfaceInspector: SelectedSurfaceInspectorActions;
  };
};

export function DesignPageSelectionInspector({
  state,
  configuration,
  actions,
}: DesignPageSelectionInspectorProps) {
  const roomSelectionActive = Boolean(
    state.selectedRoom &&
      !state.hasSelectedItem &&
      !state.hasVisiblePlanOpening &&
      !state.hasSelectedPlanFixedElement &&
      !state.hasSelectedPlanAnnotation &&
      !state.surfaceInspectorIsWall &&
      !state.surfaceInspectorIsCeiling
  );
  const placement = useInspectorPlacement(state, configuration);
  const frame = inspectorFrame(configuration, placement);
  const inspector = (
    <div data-testid="selection-inspector" data-touch-area data-in-sheet={placement.inSheet ? "true" : undefined}
      className={frame.className} style={frame.style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={
              configuration.dark
                ? "text-[11px] font-semibold uppercase text-neutral-400"
                : "text-[11px] font-semibold uppercase text-neutral-500"
            }
          >
            {state.summary.kind}
          </div>
          <div className="mt-1 truncate text-sm font-semibold">{state.summary.title}</div>
          <div
            className={
              configuration.dark
                ? "mt-0.5 truncate text-neutral-400"
                : "mt-0.5 truncate text-neutral-500"
            }
          >
            {state.summary.detail}
          </div>
        </div>
        <button
          type="button"
          data-testid="selection-inspector-clear"
          className={frame.clearClassName}
          aria-label={placement.inSheet ? undefined : `Deselect ${state.summary.title}`}
          title={placement.inSheet ? undefined : `Deselect ${state.summary.title}`}
          onClick={actions.clearSelection}
        >
          {placement.inSheet ? "Done" : <X className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      {state.selectedOpening ? (
        <SelectedOpeningDimensions
          state={{ ...state.selectedOpening, measurementUnit: state.measurementUnit }}
          configuration={{ dark: configuration.dark, canEdit: configuration.canEditPlanGeometry, proMode: configuration.proMode }}
          actions={{ commitWidthMm: actions.commitOpeningWidthMm, commitHeightMm: actions.commitOpeningHeightMm,
            commitBottomMm: actions.commitOpeningBottomMm, commitKind: actions.commitOpeningKind,
            commitWall: actions.commitOpeningWall, commitOffsetMm: actions.commitOpeningOffsetMm }} />
      ) : state.summary.metrics.length > 0 ? (
        <div
          className={`mt-3 grid gap-2 ${
            state.summary.metrics.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {state.summary.metrics.map((metric) => (
            <div
              key={metric}
              className={
                configuration.dark
                  ? "designer-raised rounded-lg border px-2.5 py-2 font-semibold"
                  : "rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 font-semibold text-neutral-800"
              }
            >
              {metric}
            </div>
          ))}
        </div>
      ) : null}

      {roomSelectionActive && state.selectedRoom ? (
        <div
          data-testid="selection-inspector-room-dimensions"
          className={
            configuration.dark
              ? "designer-divider mt-3 border-t pt-3"
              : "mt-3 border-t border-neutral-200 pt-3"
          }
        >
          <div className="flex items-end justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase text-neutral-500">
              Dimensions
            </div>
            <DisplayUnitSelect
              value={state.measurementUnit}
              dark={configuration.dark}
              testId="selection-inspector-measurement-units"
              className="w-48 max-w-[70%]"
              onChange={actions.setMeasurementUnit}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <MeasurementField
              label="Width"
              valueMm={state.selectedRoom.w * 1000}
              unit={state.measurementUnit}
              minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
              maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
              stepMm={10}
              keyboardStepMm={50}
              disabled={!configuration.canEditPlanGeometry}
              dark={configuration.dark}
              compact
              touchFriendly
              testId="selection-inspector-room-width"
              onCommit={(valueMm) =>
                actions.commitRoomDimensionMm(state.selectedRoom!.id, "width", valueMm)
              }
            />
            <MeasurementField
              label="Depth"
              valueMm={state.selectedRoom.d * 1000}
              unit={state.measurementUnit}
              minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
              maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
              stepMm={10}
              keyboardStepMm={50}
              disabled={!configuration.canEditPlanGeometry}
              dark={configuration.dark}
              compact
              touchFriendly
              testId="selection-inspector-room-depth"
              onCommit={(valueMm) =>
                actions.commitRoomDimensionMm(state.selectedRoom!.id, "depth", valueMm)
              }
            />
          </div>
          <div
            className={
              configuration.dark
                ? "mt-1.5 text-[10px] text-neutral-400"
                : "mt-1.5 text-[10px] text-neutral-500"
            }
          >
            Resize keeps the room centre when space allows. Enter applies; Esc cancels.
          </div>

          <div
            className={
              configuration.dark
                ? "designer-divider mt-3 border-t pt-3"
                : "mt-3 border-t border-neutral-200 pt-3"
            }
          >
            <MeasurementField
              label="Wall height"
              valueMm={state.activeRoomHeightMm}
              unit={state.measurementUnit}
              minMm={ROOM_DIMENSION_DEFAULTS.minRoomHeight * 1000}
              maxMm={ROOM_DIMENSION_DEFAULTS.maxRoomHeight * 1000}
              stepMm={10}
              keyboardStepMm={50}
              disabled={!configuration.canEditPlanGeometry}
              dark={configuration.dark}
              compact
              testId="selection-inspector-floor-wall-height"
              hint={`Applies to ${state.activeFloorRoomCount} room${
                state.activeFloorRoomCount === 1 ? "" : "s"
              } on this level.`}
              onCommit={actions.commitActiveFloorWallHeightMm}
            />
            <FloorPlanPropertyEvidenceControl
              evidence={state.activeRoomWallHeightEvidence}
              dark={configuration.dark}
              disabled={!state.canEditActiveRoomWallHeight}
              testId="selection-inspector-floor-wall-height-evidence"
              onConfirm={(evidence, measurementNote) =>
                actions.commitActiveFloorWallHeightMm(
                  state.activeRoomHeightMm,
                  evidence,
                  measurementNote
                )
              }
            />
          </div>
        </div>
      ) : null}

      <div
        className={
          roomSelectionActive ? "mt-3 grid grid-cols-2 gap-2" : "mt-3 flex flex-wrap gap-2"
        }
      >
        {roomSelectionActive && state.selectedRoom ? (
          <>
            <button
              type="button"
              data-testid="selection-inspector-edit-floor"
              className={
                configuration.dark
                  ? "designer-work-control-active rounded-lg px-2.5 py-1.5 font-semibold"
                  : "rounded-lg bg-neutral-950 px-2.5 py-1.5 font-semibold text-white hover:bg-neutral-800"
              }
              onClick={() => actions.room.editFloor(state.selectedRoom!.id)}
            >
              Surfaces
            </button>
            <button
              type="button"
              data-testid="selection-inspector-fit-room"
              className={
                configuration.dark
                  ? "designer-work-control rounded-lg px-2.5 py-1.5 font-semibold"
                  : "rounded-lg border border-neutral-200 px-2.5 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-50"
              }
              onClick={() => actions.room.fit(state.selectedRoom!.id)}
            >
              Fit
            </button>
            <button
              type="button"
              data-testid="selection-inspector-duplicate-room"
              className={
                configuration.dark
                  ? "designer-work-control rounded-lg px-2.5 py-1.5 font-semibold"
                  : "rounded-lg border border-neutral-200 px-2.5 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-50"
              }
              onClick={() => actions.room.duplicate(state.selectedRoom!.id)}
            >
              Duplicate
            </button>
            <button
              type="button"
              data-testid="selection-inspector-delete-room"
              className={
                configuration.dark
                  ? "designer-status-blocked rounded-lg px-2.5 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  : "rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              }
              disabled={!state.canDeleteSelectedRoom}
              onClick={() => actions.room.delete(state.selectedRoom!.id)}
            >
              Delete
            </button>
          </>
        ) : state.hasSelectedPlanOverlay ? (
          <button
            type="button"
            data-testid="selection-inspector-delete-overlay"
            className={
              configuration.dark
                ? "designer-status-blocked rounded-lg px-2.5 py-1.5 font-semibold"
                : "rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 font-semibold text-red-700 hover:bg-red-100"
            }
            onClick={actions.deleteSelectedPlanOverlay}
          >
            Delete
          </button>
        ) : null}
      </div>

      {state.surfaceInspector ? (
        <SelectedSurfaceInspector
          state={state.surfaceInspector}
          configuration={{ dark: configuration.dark, pro: configuration.proMode }}
          actions={actions.surfaceInspector}
        />
      ) : null}
    </div>
  );

  if (!placement.shown) return null;
  return placement.portalTarget ? createPortal(inspector, placement.portalTarget) : inspector;
}
