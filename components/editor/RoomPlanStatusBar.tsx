"use client";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

type RoomPlanStatusBarProps = {
  roomName: string;
  roomTypeLabel: string;
  roomCount: number;
  widthMeters: number;
  depthMeters: number;
  healthLevel?: "ready" | "review" | "blocked";
  healthScore?: number;
  healthNextAction?: string;
  viewMode: EditorViewMode;
  disabled?: boolean;
  dark?: boolean;
  compact?: boolean;
  onViewModeChange: (next: EditorViewMode) => void;
  onReviewHealth?: () => void;
  onFitPlan?: () => void;
  onRenameRoom?: () => void;
};

const formatMeters = (value: number) =>
  value.toFixed(1).replace(/\.0$/, "");

export default function RoomPlanStatusBar({
  roomName,
  roomTypeLabel,
  roomCount,
  widthMeters,
  depthMeters,
  healthLevel,
  healthScore,
  healthNextAction,
  viewMode,
  disabled = false,
  dark = false,
  compact = false,
  onViewModeChange,
  onReviewHealth,
  onFitPlan,
  onRenameRoom,
}: RoomPlanStatusBarProps) {
  const nextViewMode: EditorViewMode = viewMode === "2d" ? "3d" : "2d";
  const viewActionLabel = viewMode === "2d" ? "Room view" : "Plan";
  const sizeLabel = `${formatMeters(widthMeters)} x ${formatMeters(depthMeters)}m`;
  const roomCountLabel = `${roomCount} room${roomCount === 1 ? "" : "s"}`;
  const showRoomType = roomTypeLabel.trim().toLowerCase() !== roomName.trim().toLowerCase();
  const healthLabel =
    healthLevel === "ready"
      ? "Ready"
      : healthLevel === "review"
        ? "Review"
        : healthLevel === "blocked"
          ? "Blocked"
          : null;
  const containerClass = [
    "flex flex-nowrap items-center justify-start overflow-hidden rounded-full border backdrop-blur",
    compact
      ? "max-w-[min(34rem,calc(100vw-2rem))] gap-1.5 px-1.5 py-1 shadow-md"
      : "max-w-[min(44rem,calc(100vw-2rem))] gap-2 px-2 py-1.5 shadow-lg",
    dark
      ? "border-white/15 bg-[#12151dcc] text-neutral-100"
      : "border-neutral-200 bg-white/95 text-neutral-900",
  ].join(" ");
  const pillClass = dark
    ? `rounded-full bg-white/10 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} text-neutral-200`
    : `rounded-full bg-neutral-100 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} text-neutral-700`;
  const metaClass = dark
    ? `${compact ? "text-[11px]" : "text-xs"} font-medium text-neutral-300`
    : `${compact ? "text-[11px]" : "text-xs"} font-medium text-neutral-600`;
  const roomCountClass = [
    metaClass,
    "hidden sm:block",
    compact && roomCount === 1 ? "opacity-60" : "",
  ].join(" ");
  const healthClass =
    healthLevel === "ready"
      ? dark
        ? `rounded-full bg-emerald-400/15 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} font-semibold text-emerald-200`
        : `rounded-full bg-emerald-50 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} font-semibold text-emerald-700`
      : healthLevel === "review"
        ? dark
          ? `rounded-full bg-amber-400/15 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} font-semibold text-amber-200`
          : `rounded-full bg-amber-50 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} font-semibold text-amber-700`
          : dark
            ? `rounded-full bg-red-400/15 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} font-semibold text-red-200`
            : `rounded-full bg-red-50 px-2 py-1 ${compact ? "text-[11px]" : "text-xs"} font-semibold text-red-700`;
  const healthActionClass = `${healthClass} disabled:cursor-default`;
  const buttonClass = dark
    ? `rounded-full bg-white ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold text-neutral-950 disabled:opacity-50`
    : `rounded-full bg-neutral-900 ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold text-white hover:bg-neutral-700 disabled:opacity-50`;
  const secondaryButtonClass = dark
    ? `ml-auto rounded-full border border-white/15 ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold text-neutral-100 disabled:opacity-50`
    : `ml-auto rounded-full border border-neutral-200 ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50`;

  return (
    <div
      data-testid="room-plan-status"
      data-compact={compact ? "true" : "false"}
      className={containerClass}
    >
      <div className="min-w-0 px-2">
        <div
          data-testid="room-plan-status-room-name"
          className={`truncate font-semibold leading-5 ${compact ? "text-[13px]" : "text-sm"}`}
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
      <div
        data-testid="room-plan-status-room-count"
        data-subtle={compact && roomCount === 1 ? "true" : "false"}
        className={roomCountClass}
      >
        {roomCountLabel}
      </div>
      {healthLabel && (
        <button
          type="button"
          data-testid="room-plan-status-health"
          className={healthActionClass}
          title={healthNextAction}
          onClick={onReviewHealth}
          disabled={disabled || !onReviewHealth || healthLevel === "ready"}
        >
          {healthLabel}
          {typeof healthScore === "number" ? ` ${healthScore}` : ""}
        </button>
      )}
      {healthNextAction && healthLevel !== "ready" && (
        <div
          data-testid="room-plan-status-next-action"
        className={`${metaClass} hidden min-w-0 max-w-36 truncate 2xl:block`}
          title={healthNextAction}
        >
          {healthNextAction}
        </div>
      )}
      <button
        type="button"
        data-testid="room-plan-status-fit-view"
        aria-label="Fit plan"
        title="Fit plan"
        onClick={onFitPlan}
        disabled={disabled || !onFitPlan}
        className={`${secondaryButtonClass} shrink-0`}
      >
        {compact ? "Fit" : "Fit plan"}
      </button>
      {onRenameRoom && (
        <button
          type="button"
          data-testid="room-plan-status-rename"
          onClick={onRenameRoom}
          disabled={disabled}
          className={dark
            ? "hidden shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-100 disabled:opacity-50 lg:block"
            : "hidden shrink-0 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 lg:block"
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
        className={`${buttonClass} shrink-0`}
      >
        {viewActionLabel}
      </button>
    </div>
  );
}
