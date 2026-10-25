"use client";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { DisplayUnit } from "@/lib/display-units";
import { formatPlanDimensionsLabel } from "@/lib/plan-room-summary";

type RoomPlanStatusBarProps = {
  roomName: string;
  roomTypeLabel: string;
  roomCount: number;
  widthMeters: number;
  depthMeters: number;
  /** Null until the saved plan display unit has loaded, so no default-unit size flashes. */
  measurementUnit: DisplayUnit | null;
  healthLevel?: "ready" | "review" | "blocked" | "empty";
  healthScore?: number;
  healthNextAction?: string;
  viewMode: EditorViewMode;
  disabled?: boolean;
  compact?: boolean;
  variant?: "floating" | "command";
  onViewModeChange: (next: EditorViewMode) => void;
  onReviewHealth?: () => void;
  onFitPlan?: () => void;
  onRenameRoom?: () => void;
};

type RoomStatusDetails = Pick<
  RoomPlanStatusBarProps,
  "roomTypeLabel" | "widthMeters" | "depthMeters" | "measurementUnit" | "roomCount"
>;

/** One-line room details for the compact overflow card; the size waits for the display unit. */
export function formatRoomStatusDetails(room: RoomStatusDetails): string {
  const size = room.measurementUnit
    ? formatPlanDimensionsLabel(room.widthMeters, room.depthMeters, room.measurementUnit)
    : null;
  const roomCount = `${room.roomCount} ${room.roomCount === 1 ? "room" : "rooms"}`;
  return [room.roomTypeLabel, size, roomCount].filter(Boolean).join(" · ");
}

function renderRoomSize(widthMeters: number, depthMeters: number, unit: DisplayUnit | null) {
  if (!unit) {
    return (
      <span
        data-testid="room-plan-status-room-size-placeholder"
        aria-hidden="true"
        className="inline-block h-2 w-16 animate-pulse rounded-full bg-current align-middle opacity-20"
      />
    );
  }
  return formatPlanDimensionsLabel(widthMeters, depthMeters, unit);
}

export default function RoomPlanStatusBar({
  roomName,
  roomTypeLabel,
  roomCount,
  widthMeters,
  depthMeters,
  measurementUnit,
  healthLevel,
  healthScore,
  healthNextAction,
  viewMode,
  disabled = false,
  compact = false,
  variant = "floating",
  onViewModeChange,
  onReviewHealth,
  onFitPlan,
  onRenameRoom,
}: RoomPlanStatusBarProps) {
  const isCommand = variant === "command";
  const nextViewMode: EditorViewMode = viewMode === "2d" ? "3d" : "2d";
  const viewActionLabel = viewMode === "2d" ? "Switch to 3D" : "Switch to 2D";
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
      ? "h-[30px] max-w-full gap-1 px-1 py-0 shadow-none"
      : compact
      ? "max-w-[min(34rem,calc(100vw-2rem))] gap-1.5 px-1.5 py-1 shadow-md"
      : "max-w-[min(44rem,calc(100vw-2rem))] gap-2 px-2 py-1.5 shadow-lg",
    isCommand
        ? "border-separator bg-surface/70 text-label"
        : "border-separator bg-surface-floating/95 text-label",
  ].join(" ");
  const pillClass = `rounded-full bg-control-track px-2 py-1 text-xs text-control-label-idle`;
  const metaClass = `text-xs font-medium text-label-secondary`;
  const roomCountClass = [
    metaClass,
    isCommand ? "hidden 2xl:block" : "hidden sm:block",
    compact && roomCount === 1 ? "opacity-60" : "",
  ].join(" ");
  const healthClass =
    healthLevel === "ready"
      ? `rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint`
      : healthLevel === "review"
        ? `rounded-full bg-warning-tint px-2 py-1 text-xs font-semibold text-on-warning-tint`
          : `rounded-full bg-danger-tint px-2 py-1 text-xs font-semibold text-on-danger-tint`;
  const healthActionClass = `${healthClass} disabled:cursor-default`;
  const buttonClass = `rounded-full bg-control-primary ${compact || isCommand ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs"} font-semibold text-control-on-primary hover:bg-control-primary-hover disabled:opacity-50`;
  const secondaryButtonClass = `${isCommand ? "" : "ml-auto"} rounded-full border border-separator ${compact || isCommand ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs"} font-semibold text-control-label-idle hover:bg-control-secondary-hover disabled:opacity-50`;

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
          className={`truncate font-semibold ${compact || isCommand ? "text-[13px] leading-none" : "text-sm leading-5"} ${
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
        data-testid="room-plan-status-room-size" aria-busy={measurementUnit === null}
        className={`${metaClass} whitespace-nowrap`}
      >
        {renderRoomSize(widthMeters, depthMeters, measurementUnit)}
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
        aria-label="Fit to screen"
        title="Fit to screen"
        onClick={onFitPlan}
        disabled={disabled || !onFitPlan}
        className={`${secondaryButtonClass} shrink-0`}
      >
        {compact || isCommand ? "Fit" : "Fit to screen"}
      </button>
      {onRenameRoom && (
        <button
          type="button"
          data-testid="room-plan-status-rename"
          onClick={onRenameRoom}
          disabled={disabled}
          className={`${isCommand ? "hidden 2xl:block" : "hidden lg:block"} shrink-0 rounded-full border border-separator px-2.5 py-1 text-xs font-semibold text-control-label-idle hover:bg-control-secondary-hover disabled:opacity-50`
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
