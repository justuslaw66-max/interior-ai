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
  variant?: "floating" | "command";
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
  variant = "floating",
  onViewModeChange,
  onReviewHealth,
  onFitPlan,
  onRenameRoom,
}: RoomPlanStatusBarProps) {
  const isCommand = variant === "command";
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
    "flex min-w-0 flex-nowrap items-center justify-start overflow-hidden rounded-full border backdrop-blur",
    isCommand
      ? "h-9 max-w-full gap-1 px-1 py-0 shadow-none"
      : compact
      ? "max-w-[min(34rem,calc(100vw-2rem))] gap-1.5 px-1.5 py-1 shadow-md"
      : "max-w-[min(44rem,calc(100vw-2rem))] gap-2 px-2 py-1.5 shadow-lg",
    dark
      ? isCommand
        ? "border-white/10 bg-white/[0.04] text-neutral-100"
        : "designer-work-surface"
      : isCommand
        ? "border-neutral-200 bg-white/70 text-neutral-900"
        : "border-neutral-200 bg-white/95 text-neutral-900",
  ].join(" ");
  const pillClass = dark
    ? isCommand
      ? `rounded-full bg-white/10 px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} text-neutral-200`
      : `designer-work-muted rounded-full px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"}`
    : `rounded-full bg-neutral-100 px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} text-neutral-700`;
  const metaClass = dark
    ? isCommand
      ? `${compact || isCommand ? "text-[11px]" : "text-xs"} font-medium text-neutral-300`
      : `designer-work-muted ${compact || isCommand ? "text-[11px]" : "text-xs"} font-medium`
    : `${compact || isCommand ? "text-[11px]" : "text-xs"} font-medium text-neutral-600`;
  const roomCountClass = [
    metaClass,
    isCommand ? "hidden 2xl:block" : "hidden sm:block",
    compact && roomCount === 1 ? "opacity-60" : "",
  ].join(" ");
  const healthClass =
    healthLevel === "ready"
      ? dark
        ? `designer-status-ready rounded-full px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} font-semibold`
        : `rounded-full bg-emerald-50 px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} font-semibold text-emerald-700`
      : healthLevel === "review"
        ? dark
          ? `designer-status-warning rounded-full px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} font-semibold`
          : `rounded-full bg-amber-50 px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} font-semibold text-amber-700`
          : dark
            ? `designer-status-blocked rounded-full px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} font-semibold`
            : `rounded-full bg-red-50 px-2 py-1 ${compact || isCommand ? "text-[11px]" : "text-xs"} font-semibold text-red-700`;
  const healthActionClass = `${healthClass} disabled:cursor-default`;
  const buttonClass = dark
    ? `${isCommand ? "designer-command-selection" : "designer-work-control-active"} rounded-full ${compact || isCommand ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold disabled:opacity-50`
    : `rounded-full bg-neutral-900 ${compact || isCommand ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold text-white hover:bg-neutral-700 disabled:opacity-50`;
  const secondaryButtonClass = dark
    ? `${isCommand ? "border border-white/15 text-neutral-100 hover:bg-white/10" : "designer-work-control ml-auto"} rounded-full ${compact || isCommand ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold disabled:opacity-50`
    : `${isCommand ? "" : "ml-auto"} rounded-full border border-neutral-200 ${compact || isCommand ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50`;

  return (
    <div
      data-testid="room-plan-status"
      data-compact={compact ? "true" : "false"}
      data-variant={variant}
      className={containerClass}
    >
      <div className="min-w-0 px-2">
        <div
          data-testid="room-plan-status-room-name"
          className={`truncate font-semibold leading-5 ${compact || isCommand ? "text-[13px]" : "text-sm"} ${
            isCommand ? "max-w-[7.5rem] xl:max-w-[10rem] 2xl:max-w-[12rem]" : ""
          }`}
        >
          {roomName}
        </div>
      </div>
      <div
        data-testid="room-plan-status-room-type"
        className={`${pillClass} ${showRoomType ? (isCommand ? "hidden 2xl:block" : "hidden sm:block") : "hidden"}`}
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
          className={`${metaClass} hidden min-w-0 max-w-36 truncate ${isCommand ? "" : "2xl:block"}`}
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
        {compact || isCommand ? "Fit" : "Fit plan"}
      </button>
      {onRenameRoom && (
        <button
          type="button"
          data-testid="room-plan-status-rename"
          onClick={onRenameRoom}
          disabled={disabled}
          className={dark
            ? `${isCommand ? "hidden 2xl:block border border-white/15 text-neutral-100 hover:bg-white/10" : "designer-work-control hidden lg:block"} shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50`
            : `${isCommand ? "hidden 2xl:block" : "hidden lg:block"} shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50`
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
