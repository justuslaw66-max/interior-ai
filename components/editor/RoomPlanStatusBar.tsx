"use client";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

type RoomPlanStatusBarProps = {
  roomName: string;
  roomTypeLabel: string;
  roomCount: number;
  widthMeters: number;
  depthMeters: number;
  viewMode: EditorViewMode;
  disabled?: boolean;
  dark?: boolean;
  onViewModeChange: (next: EditorViewMode) => void;
  onFitPlan?: () => void;
};

const formatMeters = (value: number) =>
  value.toFixed(1).replace(/\.0$/, "");

export default function RoomPlanStatusBar({
  roomName,
  roomTypeLabel,
  roomCount,
  widthMeters,
  depthMeters,
  viewMode,
  disabled = false,
  dark = false,
  onViewModeChange,
  onFitPlan,
}: RoomPlanStatusBarProps) {
  const nextViewMode: EditorViewMode = viewMode === "2d" ? "3d" : "2d";
  const viewActionLabel = viewMode === "2d" ? "Room view" : "Plan";
  const roomCountLabel = `${roomCount} ${roomCount === 1 ? "room" : "rooms"}`;
  const sizeLabel = `${formatMeters(widthMeters)} x ${formatMeters(depthMeters)}m`;
  const containerClass = dark
    ? "flex max-w-[min(42rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-white/15 bg-[#12151dcc] px-2 py-1.5 text-neutral-100 shadow-lg backdrop-blur"
    : "flex max-w-[min(42rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-neutral-200 bg-white/95 px-2 py-1.5 text-neutral-900 shadow-lg backdrop-blur";
  const eyebrowClass = dark
    ? "text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
    : "text-[11px] font-semibold uppercase tracking-wide text-neutral-500";
  const pillClass = dark
    ? "rounded-full bg-white/10 px-2 py-1 text-xs text-neutral-200"
    : "rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700";
  const metaClass = dark
    ? "text-xs font-medium text-neutral-300"
    : "text-xs font-medium text-neutral-600";
  const buttonClass = dark
    ? "rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 disabled:opacity-50"
    : "rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50";
  const secondaryButtonClass = dark
    ? "ml-auto rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-100 disabled:opacity-50"
    : "ml-auto rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <div
      data-testid="room-plan-status"
      className={containerClass}
    >
      <div className="min-w-0 px-1">
        <div className={eyebrowClass}>Room</div>
        <div
          data-testid="room-plan-status-room-name"
          className="truncate text-sm font-semibold"
        >
          {roomName}
        </div>
      </div>
      <div
        data-testid="room-plan-status-room-type"
        className={pillClass}
      >
        {roomTypeLabel}
      </div>
      <div
        data-testid="room-plan-status-room-size"
        className={metaClass}
      >
        {sizeLabel}
      </div>
      <div
        data-testid="room-plan-status-room-count"
        className={metaClass}
      >
        {roomCountLabel}
      </div>
      <button
        type="button"
        data-testid="room-plan-status-fit-view"
        onClick={onFitPlan}
        disabled={disabled || !onFitPlan}
        className={secondaryButtonClass}
      >
        Fit plan
      </button>
      <button
        type="button"
        data-testid="room-plan-status-view-toggle"
        onClick={() => onViewModeChange(nextViewMode)}
        disabled={disabled}
        className={buttonClass}
      >
        {viewActionLabel}
      </button>
    </div>
  );
}
