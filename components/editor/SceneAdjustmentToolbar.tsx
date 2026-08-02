"use client";

import type { EditorViewMode } from "./EditorViewToggle";

type SceneAdjustmentToolbarProps = {
  viewMode: EditorViewMode;
  dark?: boolean;
  roomsActive?: boolean;
  drawingActive?: boolean;
  disabled?: boolean;
  onOpen2D: () => void;
  onOpenRooms: () => void;
  onOpenDrawing: () => void;
  onFitView: () => void;
};

function GripDots() {
  return (
    <span
      className="grid h-10 w-9 shrink-0 grid-cols-2 content-center justify-center gap-1 rounded-l-xl"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="h-1 w-1 rounded-full bg-current opacity-55" />
      ))}
    </span>
  );
}

function FitIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M7 4H4v3M17 4h3v3M20 17v3h-3M4 17v3h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M8 8h8v8H8z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function SceneAdjustmentToolbar({
  viewMode,
  dark = false,
  roomsActive = false,
  drawingActive = false,
  disabled = false,
  onOpen2D,
  onOpenRooms,
  onOpenDrawing,
  onFitView,
}: SceneAdjustmentToolbarProps) {
  const shellClass = dark
    ? "designer-work-surface flex items-center overflow-hidden rounded-xl"
    : "flex items-center overflow-hidden rounded-xl border border-neutral-200 bg-white/95 text-neutral-600 shadow-xl backdrop-blur";
  const dividerClass = dark ? "designer-work-divider h-10 border-l" : "h-10 w-px bg-neutral-200";
  const baseButtonClass =
    "flex h-10 items-center justify-center px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";
  const activeTextClass = dark ? "designer-work-control-active" : "bg-white text-blue-600";
  const idleTextClass = dark ? "designer-work-control" : "hover:bg-neutral-50 hover:text-neutral-950";
  const iconButtonClass = dark
    ? "designer-work-control flex h-10 w-10 items-center justify-center transition disabled:opacity-45"
    : "flex h-10 w-10 items-center justify-center text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-950 disabled:opacity-45";

  return (
    <div data-testid="scene-adjustment-toolbar" className={shellClass} aria-label="Scene adjustment tools">
      <GripDots />
      <button
        type="button"
        data-testid="scene-adjustment-2d"
        className={`${baseButtonClass} ${viewMode === "2d" ? activeTextClass : idleTextClass}`}
        onClick={onOpen2D}
        disabled={disabled}
        aria-pressed={viewMode === "2d"}
      >
        2D
      </button>
      <button
        type="button"
        data-testid="scene-adjustment-rooms"
        className={`${baseButtonClass} ${roomsActive ? activeTextClass : idleTextClass}`}
        onClick={onOpenRooms}
        disabled={disabled}
        aria-pressed={roomsActive}
      >
        Rooms
      </button>
      <button
        type="button"
        data-testid="scene-adjustment-drawing"
        className={`${baseButtonClass} ${drawingActive ? activeTextClass : idleTextClass}`}
        onClick={onOpenDrawing}
        disabled={disabled}
        aria-pressed={drawingActive}
      >
        Drawing
      </button>
      <div className={dividerClass} aria-hidden="true" />
      <button
        type="button"
        data-testid="scene-adjustment-fit"
        className={iconButtonClass}
        onClick={onFitView}
        disabled={disabled}
        aria-label="Fit view"
        title="Fit view"
      >
        <FitIcon />
      </button>
    </div>
  );
}
