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
  onRenameRoom?: () => void;
};

const formatMeters = (value: number) =>
  value.toFixed(1).replace(/\.0$/, "");

export default function RoomPlanStatusBar({
  roomName,
  roomTypeLabel,
  widthMeters,
  depthMeters,
  viewMode,
  disabled = false,
  dark = false,
  onViewModeChange,
  onFitPlan,
  onRenameRoom,
}: RoomPlanStatusBarProps) {
  const nextViewMode: EditorViewMode = viewMode === "2d" ? "3d" : "2d";
  const viewActionLabel = viewMode === "2d" ? "Room view" : "Plan";
  const sizeLabel = `${formatMeters(widthMeters)} x ${formatMeters(depthMeters)}m`;
  const showRoomType = roomTypeLabel.trim().toLowerCase() !== roomName.trim().toLowerCase();
  const containerClass = dark
    ? "flex max-w-[min(38rem,calc(100vw-2rem))] flex-wrap items-center justify-center gap-2 rounded-full border border-white/15 bg-[#12151dcc] px-2 py-1.5 text-neutral-100 shadow-lg backdrop-blur"
    : "flex max-w-[min(38rem,calc(100vw-2rem))] flex-wrap items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white/95 px-2 py-1.5 text-neutral-900 shadow-lg backdrop-blur";
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
      <div className="min-w-0 px-2">
        <div
          data-testid="room-plan-status-room-name"
          className="truncate text-sm font-semibold leading-5"
        >
          {roomName}
        </div>
      </div>
      <div
        data-testid="room-plan-status-room-type"
        className={`${pillClass} ${showRoomType ? "hidden sm:block" : "hidden"}`}
      >
        {roomTypeLabel}
      </div>
      <div
        data-testid="room-plan-status-room-size"
        className={metaClass}
      >
        {sizeLabel}
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
      {onRenameRoom && (
        <button
          type="button"
          data-testid="room-plan-status-rename"
          onClick={onRenameRoom}
          disabled={disabled}
          className={dark
            ? "hidden rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-100 disabled:opacity-50 lg:block"
            : "hidden rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 lg:block"
          }
        >
          Rename
        </button>
      )}
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
