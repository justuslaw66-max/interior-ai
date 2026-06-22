"use client";

import { useState } from "react";

export type FloorCreationMode = "blank" | "layout" | "walls";

export type FloorPropertiesPanelProps = {
  dark: boolean;
  canEdit: boolean;
  roomWidth: number;
  roomDepth: number;
  floorOptions: Array<{ level: number; label: string; roomCount: number }>;
  hiddenFloorLevels?: number[];
  activeFloorLevel: number;
  activeFloorRoomCount: number;
  activeRoomHeightMm: number;
  activeRoomWallThicknessMm: number;
  activeRoomSlabThicknessMm: number;
  activeRoomWallOpacity: number;
  activeRoomFloorOpacity: number;
  activeRoomCeilingOpacity: number;
  activeRoomCeilingVisible: boolean;
  activeRoomCeilingColor: string;
  stackedFloorView: boolean;
  onAddUpperFloor: (mode: FloorCreationMode) => void;
  onAddLowerFloor: (mode: FloorCreationMode) => void;
  onToggleFloorVisibility?: (level: number) => void;
  onRenameFloor: (label: string) => void;
  onDuplicateFloor: () => void;
  onDeleteFloor: (confirmed: true) => void;
  onSwitchFloor: (level: number) => void;
  onStackedFloorViewChange: (enabled: boolean) => void;
  onRedo: () => void;
  canRedo: boolean;
  onActiveRoomHeightMmChange: (valueMm: number) => void;
  onActiveRoomWallThicknessMmChange: (valueMm: number) => void;
  onActiveRoomSlabThicknessMmChange: (valueMm: number) => void;
  onActiveRoomSurfaceOpacityChange: (kind: "wall" | "floor" | "ceiling", opacity: number) => void;
  onActiveRoomCeilingVisibleChange: (visible: boolean) => void;
  onActiveRoomCeilingColorChange: (color: string) => void;
};

export default function FloorPropertiesPanel({
  dark,
  canEdit,
  roomWidth,
  roomDepth,
  floorOptions,
  hiddenFloorLevels = [],
  activeFloorLevel,
  activeFloorRoomCount,
  activeRoomHeightMm,
  activeRoomWallThicknessMm,
  activeRoomSlabThicknessMm,
  activeRoomWallOpacity,
  activeRoomFloorOpacity,
  activeRoomCeilingOpacity,
  activeRoomCeilingVisible,
  activeRoomCeilingColor,
  stackedFloorView,
  onAddUpperFloor,
  onAddLowerFloor,
  onToggleFloorVisibility,
  onRenameFloor,
  onDuplicateFloor,
  onDeleteFloor,
  onSwitchFloor,
  onStackedFloorViewChange,
  onRedo,
  canRedo,
  onActiveRoomHeightMmChange,
  onActiveRoomWallThicknessMmChange,
  onActiveRoomSlabThicknessMmChange,
  onActiveRoomSurfaceOpacityChange,
  onActiveRoomCeilingVisibleChange,
  onActiveRoomCeilingColorChange,
}: FloorPropertiesPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [pendingAddDirection, setPendingAddDirection] = useState<"upper" | "lower" | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const metaClass = dark ? "mt-0.5 text-[11px] text-neutral-400" : "mt-0.5 text-[11px] text-neutral-500";
  const panelClass = dark
    ? "relative w-[16.5rem] max-[520px]:w-full rounded-lg border border-white/10 bg-[#151820]/95 p-2 text-neutral-100 shadow-xl backdrop-blur"
    : "relative w-[16.5rem] max-[520px]:w-full rounded-lg border border-neutral-200 bg-white/95 p-2 text-neutral-900 shadow-xl backdrop-blur";
  const secondaryButtonClass = dark
    ? "rounded-lg border border-white/15 px-2 py-1.5 text-[11px] font-semibold text-neutral-100 disabled:opacity-50"
    : "rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50";
  const floorPanelButtonClass = dark
    ? "flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-xs font-semibold text-neutral-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
    : "flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-left text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50";
  const fieldLabelClass = dark ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-neutral-700";
  const floorListButtonClass = (isActive: boolean) => {
    if (dark) {
      return [
        "grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50",
        isActive
          ? "border-blue-300/50 bg-blue-400/15 text-blue-100"
          : "border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10",
      ].join(" ");
    }

    return [
      "grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50",
      isActive
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100",
    ].join(" ");
  };
  const inputClass = dark
    ? "h-8 w-full rounded-lg border border-white/10 bg-[#10131a] px-2 text-right text-sm text-neutral-100"
    : "h-8 w-full rounded-lg border border-neutral-200 bg-white px-2 text-right text-sm text-neutral-900";
  const activeFloorLabel =
    floorOptions.find((option) => option.level === activeFloorLevel)?.label ?? "1F";
  const activeRoomArea = Math.max(0, roomWidth * roomDepth);
  const hiddenFloorLevelSet = new Set(hiddenFloorLevels);
  const getFloorAccentColor = (level: number) => {
    const palette = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
    return palette[Math.abs(level) % palette.length];
  };
  const floorCreationOptions: Array<{
    mode: FloorCreationMode;
    label: string;
    description: string;
  }> = [
    { mode: "blank", label: "Blank floor", description: "Start with one empty room." },
    { mode: "layout", label: "Duplicate layout", description: "Copy rooms, openings, furniture." },
    { mode: "walls", label: "Walls only", description: "Copy rooms and openings only." },
  ];
  const commitFloorCreation = (mode: FloorCreationMode) => {
    if (pendingAddDirection === "upper") onAddUpperFloor(mode);
    if (pendingAddDirection === "lower") onAddLowerFloor(mode);
    setPendingAddDirection(null);
  };
  const openRenameDialog = () => {
    setRenameValue(activeFloorLabel);
    setDeleteOpen(false);
    setRenameOpen(true);
  };
  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === activeFloorLabel) {
      setRenameOpen(false);
      return;
    }
    onRenameFloor(trimmed);
    setRenameOpen(false);
  };
  const openDeleteDialog = () => {
    setRenameOpen(false);
    setDeleteOpen(true);
  };
  const commitDelete = () => {
    onDeleteFloor(true);
    setDeleteOpen(false);
  };

  return (
    <div data-testid="coohom-floor-panel" className={panelClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={titleClass}>Floor</div>
          <div className={metaClass}>
            {activeFloorLabel} · {activeFloorRoomCount} room{activeFloorRoomCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isCollapsed && (
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={!canEdit || !canRedo}
              onClick={onRedo}
            >
              Redo
            </button>
          )}
          <button
            type="button"
            className={secondaryButtonClass}
            aria-label={isCollapsed ? "Expand floor panel" : "Collapse floor panel"}
            title={isCollapsed ? "Expand" : "Collapse"}
            onClick={() => setIsCollapsed((value) => !value)}
          >
            {isCollapsed ? "+" : "-"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>

      <details className="mt-3">
        <summary className={dark ? "cursor-pointer text-xs font-semibold text-neutral-200" : "cursor-pointer text-xs font-semibold text-neutral-700"}>
          Add floor
        </summary>
        <div className="mt-2 grid gap-2">
          <button
            type="button"
            data-testid="floor-add-upper"
            className={floorPanelButtonClass}
            disabled={!canEdit}
            onClick={() =>
              setPendingAddDirection((current) => (current === "upper" ? null : "upper"))
            }
          >
            <span>Upper floor</span>
            <span aria-hidden="true">^</span>
          </button>
          <button
            type="button"
            data-testid="floor-add-lower"
            className={floorPanelButtonClass}
            disabled={!canEdit}
            onClick={() =>
              setPendingAddDirection((current) => (current === "lower" ? null : "lower"))
            }
          >
            <span>Lower floor</span>
            <span aria-hidden="true">v</span>
          </button>
        </div>
      </details>

      {pendingAddDirection && (
        <div
          className={
            dark
              ? "absolute inset-x-2 top-16 z-20 rounded-xl border border-white/10 bg-[#10131a] p-2 shadow-2xl"
              : "absolute inset-x-2 top-16 z-20 rounded-xl border border-neutral-200 bg-white p-2 shadow-2xl"
          }
          data-testid="floor-add-mode-menu"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
                {pendingAddDirection === "upper" ? "New upper floor" : "New lower floor"}
              </div>
              <div className={dark ? "mt-0.5 text-[10px] text-neutral-400" : "mt-0.5 text-[10px] text-neutral-500"}>
                Choose what to copy into the new level.
              </div>
            </div>
            <button
              type="button"
              className={
                dark
                  ? "h-6 w-6 rounded-md text-xs font-semibold text-neutral-300 hover:bg-white/10"
                  : "h-6 w-6 rounded-md text-xs font-semibold text-neutral-500 hover:bg-neutral-100"
              }
              aria-label="Close floor creation menu"
              onClick={() => setPendingAddDirection(null)}
            >
              x
            </button>
          </div>
          <div className="mt-2 grid gap-1.5">
            {floorCreationOptions.map((option) => (
              <button
                key={option.mode}
                type="button"
                data-testid={`floor-add-mode-${option.mode}`}
                className={
                  dark
                    ? "rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-xs text-neutral-100 hover:bg-white/10"
                    : "rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-left text-xs text-neutral-800 hover:bg-neutral-100"
                }
                onClick={() => commitFloorCreation(option.mode)}
              >
                <span className="block font-semibold">{option.label}</span>
                <span className={dark ? "block text-[10px] text-neutral-400" : "block text-[10px] text-neutral-500"}>
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="mt-3 block">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className={fieldLabelClass}>Current floor</span>
        </div>
        <select
          value={activeFloorLevel}
          disabled={!canEdit}
          onChange={(event) => onSwitchFloor(Number(event.target.value))}
          className={inputClass}
        >
          {floorOptions.map((option) => (
            <option key={option.level} value={option.level}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-2 grid gap-1.5">
        {floorOptions
          .slice()
          .sort((first, second) => second.level - first.level)
          .map((option) => {
            const isActive = option.level === activeFloorLevel;
            const isHidden = hiddenFloorLevelSet.has(option.level);
            return (
              <div
                key={option.level}
                className={floorListButtonClass(isActive)}
                data-testid={`floor-row-${option.level}`}
              >
                <button
                  type="button"
                  className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-2 text-left disabled:cursor-default"
                  disabled={!canEdit || isActive}
                  onClick={() => onSwitchFloor(option.level)}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: getFloorAccentColor(option.level) }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{option.label}</span>
                    <span className={dark ? "block text-[11px] text-neutral-400" : "block text-[11px] text-neutral-500"}>
                      {option.roomCount} room{option.roomCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    dark
                      ? "h-7 w-7 rounded-md text-xs font-semibold text-neutral-300 hover:bg-white/10 disabled:opacity-40"
                      : "h-7 w-7 rounded-md text-xs font-semibold text-neutral-500 hover:bg-white disabled:opacity-40"
                  }
                  disabled={!canEdit || isActive || !onToggleFloorVisibility}
                  aria-label={`${isHidden ? "Show" : "Hide"} ${option.label}`}
                  title={isActive ? "Active floor stays visible" : isHidden ? "Show floor" : "Hide floor"}
                  onClick={() => onToggleFloorVisibility?.(option.level)}
                >
                  {isHidden ? "○" : "●"}
                </button>
              </div>
            );
          })}
      </div>

      {hiddenFloorLevels.length > 0 && (
        <div className={dark ? "mt-1 text-[11px] text-neutral-400" : "mt-1 text-[11px] text-neutral-500"}>
          Hidden floors stay out of stacked 3D until shown again.
        </div>
      )}

      <details className="mt-2 border-t border-neutral-200/60 pt-2 dark:border-white/10">
        <summary className={dark ? "cursor-pointer text-sm font-semibold text-neutral-100" : "cursor-pointer text-sm font-semibold text-neutral-800"}>
          Basic
        </summary>
        <div className="mt-2 grid gap-1.5">
          <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
            <span className={fieldLabelClass}>Interior area</span>
            <div className={inputClass}>{activeRoomArea.toFixed(2)} m2</div>
          </div>
          <label className="grid grid-cols-[1fr_7rem] items-center gap-3">
            <span className={fieldLabelClass}>Room height</span>
            <span className="relative">
              <input
                type="number"
                min="2000"
                max="6000"
                step="10"
                value={activeRoomHeightMm}
                disabled={!canEdit}
                className={`${inputClass} pr-9`}
                onChange={(event) => onActiveRoomHeightMmChange(Number(event.currentTarget.value))}
              />
              <span className={dark ? "pointer-events-none absolute right-2 top-2 text-xs text-neutral-400" : "pointer-events-none absolute right-2 top-2 text-xs text-neutral-500"}>
                mm
              </span>
            </span>
          </label>
          <label className="grid grid-cols-[1fr_7rem] items-center gap-3">
            <span className={fieldLabelClass}>Slab thickness</span>
            <span className="relative">
              <input
                type="number"
                min="10"
                max="600"
                step="5"
                value={activeRoomSlabThicknessMm}
                disabled={!canEdit}
                className={`${inputClass} pr-9`}
                onChange={(event) => onActiveRoomSlabThicknessMmChange(Number(event.currentTarget.value))}
              />
              <span className={dark ? "pointer-events-none absolute right-2 top-2 text-xs text-neutral-400" : "pointer-events-none absolute right-2 top-2 text-xs text-neutral-500"}>
                mm
              </span>
            </span>
          </label>
        </div>
      </details>

      <details className="mt-2 border-t border-neutral-200/60 pt-2 dark:border-white/10">
        <summary className={dark ? "cursor-pointer text-sm font-semibold text-neutral-100" : "cursor-pointer text-sm font-semibold text-neutral-800"}>
          Opacity
        </summary>
        <label className="mt-2 grid grid-cols-[3.25rem_1fr_3.3rem] items-center gap-2">
          <span className={fieldLabelClass}>Wall</span>
          <input
            type="range"
            min="5"
            max="100"
            step="1"
            value={Math.round(activeRoomWallOpacity * 100)}
            disabled={!canEdit}
            className="w-full accent-blue-500 disabled:opacity-50"
            onChange={(event) => onActiveRoomSurfaceOpacityChange("wall", Number(event.currentTarget.value) / 100)}
          />
          <span className={inputClass}>{Math.round(activeRoomWallOpacity * 100)}%</span>
        </label>
        <label className="mt-1.5 grid grid-cols-[3.25rem_1fr_3.3rem] items-center gap-2">
          <span className={fieldLabelClass}>Floor</span>
          <input
            type="range"
            min="5"
            max="100"
            step="1"
            value={Math.round(activeRoomFloorOpacity * 100)}
            disabled={!canEdit}
            className="w-full accent-blue-500 disabled:opacity-50"
            onChange={(event) => onActiveRoomSurfaceOpacityChange("floor", Number(event.currentTarget.value) / 100)}
          />
          <span className={inputClass}>{Math.round(activeRoomFloorOpacity * 100)}%</span>
        </label>
      </details>

      <details className="mt-2 border-t border-neutral-200/60 pt-2 dark:border-white/10">
        <summary className={dark ? "cursor-pointer text-xs font-semibold text-neutral-200" : "cursor-pointer text-xs font-semibold text-neutral-700"}>
          Advanced
        </summary>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className={secondaryButtonClass}
            data-testid="floor-rename-open"
            disabled={!canEdit}
            onClick={openRenameDialog}
          >
            Rename
          </button>
          <button type="button" className={secondaryButtonClass} disabled={!canEdit} onClick={onDuplicateFloor}>
            Duplicate
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            data-testid="floor-delete-open"
            disabled={!canEdit || floorOptions.length <= 1}
            onClick={openDeleteDialog}
          >
            Delete
          </button>
        </div>
        {renameOpen && (
          <div
            className={
              dark
                ? "mt-2 rounded-xl border border-white/10 bg-[#10131a] p-2"
                : "mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2"
            }
            data-testid="floor-rename-dialog"
          >
            <label className="block">
              <span className={fieldLabelClass}>Floor name</span>
              <input
                data-testid="floor-rename-input"
                className={`${inputClass} mt-1 text-left`}
                value={renameValue}
                autoFocus
                onChange={(event) => setRenameValue(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setRenameOpen(false);
                }}
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="floor-rename-save"
                className={
                  dark
                    ? "rounded-lg bg-blue-500 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    : "rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                }
                disabled={!renameValue.trim() || renameValue.trim() === activeFloorLabel}
                onClick={commitRename}
              >
                Save
              </button>
            </div>
          </div>
        )}
        {deleteOpen && (
          <div
            className={
              dark
                ? "mt-2 rounded-xl border border-red-400/30 bg-red-500/10 p-2"
                : "mt-2 rounded-xl border border-red-200 bg-red-50 p-2"
            }
            data-testid="floor-delete-dialog"
          >
            <div className={dark ? "text-xs font-semibold text-red-100" : "text-xs font-semibold text-red-800"}>
              Delete {activeFloorLabel}?
            </div>
            <div className={dark ? "mt-0.5 text-[10px] text-red-100/70" : "mt-0.5 text-[10px] text-red-700"}>
              This removes {activeFloorRoomCount} room{activeFloorRoomCount === 1 ? "" : "s"} and linked openings.
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="floor-delete-confirm"
                className={
                  dark
                    ? "rounded-lg bg-red-500 px-2 py-1.5 text-[11px] font-semibold text-white"
                    : "rounded-lg bg-red-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700"
                }
                onClick={commitDelete}
              >
                Delete
              </button>
            </div>
          </div>
        )}
        <label
          className={
            dark
              ? "mt-2 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"
              : "mt-2 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2"
          }
        >
          <span className="min-w-0">
            <span className={`block ${fieldLabelClass}`}>Stacked 3D floors</span>
            <span className={`block ${metaClass}`}>View all levels vertically</span>
          </span>
          <input
            type="checkbox"
            checked={stackedFloorView}
            disabled={!canEdit}
            className="h-5 w-5 justify-self-center accent-blue-500"
            onChange={(event) => onStackedFloorViewChange(event.currentTarget.checked)}
          />
        </label>
        <label className="mt-2 grid grid-cols-[1fr_7rem] items-center gap-3">
          <span className={fieldLabelClass}>Wall thickness</span>
          <span className="relative">
            <input
              type="number"
              min="40"
              max="800"
              step="5"
              value={activeRoomWallThicknessMm}
              disabled={!canEdit}
              className={`${inputClass} pr-9`}
              onChange={(event) => onActiveRoomWallThicknessMmChange(Number(event.currentTarget.value))}
            />
            <span className={dark ? "pointer-events-none absolute right-2 top-2 text-xs text-neutral-400" : "pointer-events-none absolute right-2 top-2 text-xs text-neutral-500"}>
              mm
            </span>
          </span>
        </label>
        <label className="mt-2 grid grid-cols-[3.25rem_1fr_3.3rem] items-center gap-2">
          <span className={fieldLabelClass}>Ceiling</span>
          <input
            type="range"
            min="5"
            max="100"
            step="1"
            value={Math.round(activeRoomCeilingOpacity * 100)}
            disabled={!canEdit || !activeRoomCeilingVisible}
            className="w-full accent-blue-500 disabled:opacity-50"
            onChange={(event) => onActiveRoomSurfaceOpacityChange("ceiling", Number(event.currentTarget.value) / 100)}
          />
          <span className={inputClass}>{Math.round(activeRoomCeilingOpacity * 100)}%</span>
        </label>
        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={activeRoomCeilingVisible}
              disabled={!canEdit}
              className="h-4 w-4 accent-blue-500"
              onChange={(event) => onActiveRoomCeilingVisibleChange(event.currentTarget.checked)}
            />
            <span className={fieldLabelClass}>Visible in 3D</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className={fieldLabelClass}>Color</span>
            <input
              type="color"
              value={activeRoomCeilingColor}
              disabled={!canEdit}
              className="h-8 w-10 rounded border border-neutral-200 bg-transparent p-0 disabled:opacity-50"
              onChange={(event) => onActiveRoomCeilingColorChange(event.currentTarget.value)}
            />
          </label>
        </div>
      </details>
        </>
      )}
    </div>
  );
}
