"use client";

import { useMemo, useState } from "react";

import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { DisplayUnit } from "@/lib/display-units";
import {
  buildPlanRoomSummary,
  formatPlanRoomMetricLabel,
} from "@/lib/plan-room-summary";
import { Button } from "@/components/ui/Button";

export type PlanRoomSummaryCardState = {
  rooms: HousePlanRoom2D[];
  selectedRoomIds: string[];
};

export type PlanRoomSummaryCardConfiguration = {
  measurementUnit: DisplayUnit;
  mobile?: boolean;
};

export type PlanRoomSummaryCardActions = {
  selectAllRooms: () => void;
  clearRoomSelection: () => void;
};

type PlanRoomSummaryCardProps = {
  state: PlanRoomSummaryCardState;
  configuration: PlanRoomSummaryCardConfiguration;
  actions: PlanRoomSummaryCardActions;
};

export function PlanRoomSummaryCard({
  state,
  configuration,
  actions,
}: PlanRoomSummaryCardProps) {
  const [expanded, setExpanded] = useState(!configuration.mobile);
  const wholePlan = useMemo(
    () => buildPlanRoomSummary(state.rooms),
    [state.rooms]
  );
  const selectedRooms = useMemo(() => {
    const selectedIds = new Set(state.selectedRoomIds);
    return state.rooms.filter((room) => selectedIds.has(room.id));
  }, [state.rooms, state.selectedRoomIds]);
  const selection = useMemo(
    () => buildPlanRoomSummary(selectedRooms),
    [selectedRooms]
  );
  const hasMultipleSelectedRooms = selection.roomCount > 1;
  const hasAllRoomsSelected =
    wholePlan.roomCount > 1 && selection.roomCount === wholePlan.roomCount;
  const shellClass = "border-separator bg-surface-floating/95 text-label";
  const mutedClass = "text-label-secondary";
  const metricClass = "border-box-border bg-tile";

  if (wholePlan.roomCount === 0) return null;

  return (
    <section
      data-testid="plan-room-summary" data-surface="floating"
      data-selected-room-count={selection.roomCount}
      className={`pointer-events-auto w-full rounded-xl border shadow-lg backdrop-blur ${shellClass}`}
      aria-label="Whole plan dimensions and room selection summary"
    >
      <button
        type="button"
        data-testid="plan-room-summary-toggle"
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setExpanded((current) => !current)}
      >
        <span>
          <span className="block text-xs font-bold">Plan summary</span>
          <span className={`mt-0.5 block text-xs ${mutedClass}`}>
            {`${formatPlanRoomMetricLabel(wholePlan, configuration.measurementUnit)} · ${wholePlan.roomCount} room${wholePlan.roomCount === 1 ? "" : "s"}`}
          </span>
        </span>
        <span aria-hidden="true" className={`text-xs ${mutedClass}`}>
          {expanded ? "Hide" : "Show"}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-inherit px-3 pb-3 pt-2">
          {hasMultipleSelectedRooms ? (
            <div
              data-testid="plan-room-selection-summary"
              className={`mb-2 rounded-lg border px-2.5 py-2 ${metricClass}`}
            >
              <div className="text-xs font-bold text-on-success-tint">
                {selection.roomCount} rooms selected
              </div>
              <div className={`mt-0.5 text-xs ${mutedClass}`}>
                Combined bounds {formatPlanRoomMetricLabel(selection, configuration.measurementUnit)}
              </div>
            </div>
          ) : null}

          <div className="max-h-36 space-y-1 overflow-y-auto pr-0.5">
            {wholePlan.rooms.map((room) => {
              const selected = state.selectedRoomIds.includes(room.id);
              return (
                <div
                  key={room.id}
                  data-testid="plan-room-summary-row"
                  data-room-id={room.id}
                  data-selected={selected ? "true" : "false"}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                    selected
                      ? "bg-success-tint text-on-success-tint"
                      : ""
                  }`}
                >
                  <span className="min-w-0 truncate font-semibold">{room.name}</span>
                  <span className={`shrink-0 ${selected ? "" : mutedClass}`}>
                    {formatPlanRoomMetricLabel(room, configuration.measurementUnit)}
                  </span>
                </div>
              );
            })}
          </div>

          {wholePlan.roomCount > 1 ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={`text-xs leading-4 ${mutedClass}`}>
                Shift-click or ⌘/Ctrl-click rooms to compare.
              </span>
              <Button
                data-testid={hasAllRoomsSelected ? "clear-room-selection" : "select-all-rooms"}
                variant="secondary" size="compact" className="shrink-0"
                onClick={
                  hasAllRoomsSelected
                    ? actions.clearRoomSelection
                    : actions.selectAllRooms
                }
              >
                {hasAllRoomsSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
