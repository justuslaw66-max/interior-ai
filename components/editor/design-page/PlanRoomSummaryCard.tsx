"use client";

import { useMemo, useState } from "react";

import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { buildPlanRoomSummary } from "@/lib/plan-room-summary";

export type PlanRoomSummaryCardState = {
  rooms: HousePlanRoom2D[];
  selectedRoomIds: string[];
};

export type PlanRoomSummaryCardConfiguration = {
  dark: boolean;
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

const formatMeters = (value: number) =>
  value.toFixed(1).replace(/\.0$/, "");

const formatArea = (value: number) =>
  value.toFixed(1).replace(/\.0$/, "");

function Dimensions({ width, depth }: { width: number; depth: number }) {
  return (
    <>
      {formatMeters(width)} × {formatMeters(depth)} m
    </>
  );
}

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
  const shellClass = configuration.dark
    ? "border-white/10 bg-[#171a22]/95 text-neutral-100"
    : "border-neutral-200 bg-white/95 text-neutral-900";
  const mutedClass = configuration.dark ? "text-neutral-400" : "text-neutral-500";
  const metricClass = configuration.dark
    ? "border-white/10 bg-white/[0.06]"
    : "border-neutral-200 bg-neutral-50";

  if (wholePlan.roomCount === 0) return null;

  return (
    <section
      data-testid="plan-room-summary"
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
          <span className={`mt-0.5 block text-[11px] ${mutedClass}`}>
            <Dimensions width={wholePlan.widthMeters} depth={wholePlan.depthMeters} />
            {` · ${formatArea(wholePlan.areaSquareMeters)} m² · ${wholePlan.roomCount} room${wholePlan.roomCount === 1 ? "" : "s"}`}
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
              <div
                className={`text-[11px] font-bold ${
                  configuration.dark ? "text-emerald-300" : "text-emerald-700"
                }`}
              >
                {selection.roomCount} rooms selected
              </div>
              <div className={`mt-0.5 text-[11px] ${mutedClass}`}>
                Combined bounds <Dimensions width={selection.widthMeters} depth={selection.depthMeters} />
                {` · ${formatArea(selection.areaSquareMeters)} m²`}
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
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                    selected
                      ? configuration.dark
                        ? "bg-emerald-400/10 text-emerald-100"
                        : "bg-emerald-50 text-emerald-900"
                      : ""
                  }`}
                >
                  <span className="min-w-0 truncate font-semibold">{room.name}</span>
                  <span className={`shrink-0 ${selected ? "" : mutedClass}`}>
                    <Dimensions width={room.widthMeters} depth={room.depthMeters} />
                    {` · ${formatArea(room.areaSquareMeters)} m²`}
                  </span>
                </div>
              );
            })}
          </div>

          {wholePlan.roomCount > 1 ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={`text-[10px] leading-4 ${mutedClass}`}>
                Shift-click or ⌘/Ctrl-click rooms to compare.
              </span>
              <button
                type="button"
                data-testid={hasAllRoomsSelected ? "clear-room-selection" : "select-all-rooms"}
                className={
                  configuration.dark
                    ? "shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold hover:bg-white/10"
                    : "shrink-0 rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-bold text-neutral-700 hover:bg-neutral-50"
                }
                onClick={
                  hasAllRoomsSelected
                    ? actions.clearRoomSelection
                    : actions.selectAllRooms
                }
              >
                {hasAllRoomsSelected ? "Clear" : "Select all"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
