import type { Dispatch, SetStateAction } from "react";

import type { NormalizedSurfaceSettings } from "@/lib/surface-settings";
import {
  DEFAULT_WALL_PAINT_SWATCH,
  NIPPON_WALL_PAINT_COLOUR_COUNT,
  WALL_PAINT_FAMILY_FILTERS,
  getWallPaintDisplayName,
  getWallPaintSwatchLabel,
  normalizeWallPaintColorHex,
  type WallPaintFamilyFilterId,
  type WallPaintSwatch,
} from "@/lib/wall-paint";
import type { SurfaceTargetMode } from "./surfaceCatalog";
import { WALL_PAINT_VISIBLE_INCREMENT } from "./surfaceCatalog";

type WallPaintSource = "swatch" | "nippon" | "custom";

export function WallPaintPicker({
  dark,
  activeTargetSettings,
  wallPaintFamilyFilter,
  setWallPaintFamilyFilter,
  activeSurfaceTarget,
  customWallPaintHex,
  setCustomWallPaintHex,
  wallPaintApplyName,
  setWallPaintApplyName,
  floorMaterialMetaClass,
  canEdit,
  canApplyActiveSurfaceTarget,
  filteredNipponWallPaintSwatches,
  visibleNipponWallPaintSwatches,
  wallPaintSearch,
  setWallPaintSearch,
  setWallPaintVisibleLimit,
  hiddenNipponWallPaintCount,
  progressActionClass,
  progressSecondaryActionClass,
  applyWallPaintToActiveTarget,
  applyWallPaintToAllRooms,
  onResetActiveCeilingSurface,
  onResetActiveWallSurface,
}: {
  dark: boolean;
  activeTargetSettings: NormalizedSurfaceSettings;
  wallPaintFamilyFilter: WallPaintFamilyFilterId;
  setWallPaintFamilyFilter: Dispatch<SetStateAction<WallPaintFamilyFilterId>>;
  activeSurfaceTarget: SurfaceTargetMode;
  customWallPaintHex: string;
  setCustomWallPaintHex: Dispatch<SetStateAction<string>>;
  wallPaintApplyName: string;
  setWallPaintApplyName: Dispatch<SetStateAction<string>>;
  floorMaterialMetaClass: string;
  canEdit: boolean;
  canApplyActiveSurfaceTarget: boolean;
  filteredNipponWallPaintSwatches: WallPaintSwatch[];
  visibleNipponWallPaintSwatches: WallPaintSwatch[];
  wallPaintSearch: string;
  setWallPaintSearch: Dispatch<SetStateAction<string>>;
  setWallPaintVisibleLimit: Dispatch<SetStateAction<number>>;
  hiddenNipponWallPaintCount: number;
  progressActionClass: string;
  progressSecondaryActionClass: string;
  applyWallPaintToActiveTarget: (
    colorHex: string,
    name?: string | null,
    source?: WallPaintSource
  ) => void;
  applyWallPaintToAllRooms: (
    colorHex: string,
    name?: string | null,
    source?: WallPaintSource
  ) => void;
  onResetActiveCeilingSurface: () => void;
  onResetActiveWallSurface: () => void;
}) {
    const activePaintColorHex = activeTargetSettings.paintColorHex;
    const activePaintName = activePaintColorHex
      ? getWallPaintDisplayName(activePaintColorHex, activeTargetSettings.paintName)
      : "No paint selected";
    const activeWallPaintFamilyFilter =
      WALL_PAINT_FAMILY_FILTERS.find((family) => family.id === wallPaintFamilyFilter) ??
      WALL_PAINT_FAMILY_FILTERS[0];
    const paintTargetNoun = activeSurfaceTarget === "ceiling" ? "ceiling" : "wall";
    const normalizedCustomPaintHex =
      normalizeWallPaintColorHex(customWallPaintHex) ?? DEFAULT_WALL_PAINT_SWATCH.hex;
    const wallPaintSearchInputClass = dark
      ? "designer-control h-9 w-full rounded-lg border px-2 text-xs font-semibold text-neutral-100 outline-none placeholder:text-neutral-500"
      : "h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs font-semibold text-neutral-800 outline-none placeholder:text-neutral-400";
    const applyWallPaintSwatch = (swatch: WallPaintSwatch, source: "swatch" | "nippon") => {
      setWallPaintFamilyFilter(swatch.family);
      applyWallPaintToActiveTarget(swatch.hex, getWallPaintSwatchLabel(swatch), source);
    };
    const renderWallPaintSwatchButton = (swatch: WallPaintSwatch, variant: "chip" | "row") => {
      const label = getWallPaintSwatchLabel(swatch);
      const selected = swatch.hex.toUpperCase() === activePaintColorHex?.toUpperCase();
      const source = swatch.source === "nippon" ? "nippon" : "swatch";
      const selectedClass = dark
        ? "border-emerald-300 bg-white/10"
        : "border-emerald-500 bg-emerald-50";
      const idleClass = dark
        ? "designer-control border"
        : "border-neutral-200 bg-white hover:bg-neutral-50";
      if (variant === "chip") {
        return (
          <button
            key={swatch.id}
            type="button"
            data-testid={`wall-paint-swatch-${swatch.id}`}
            className={`grid aspect-square place-items-center rounded-lg border p-1 ${selected ? selectedClass : idleClass}`}
            disabled={!canEdit || !canApplyActiveSurfaceTarget}
            title={label}
            aria-label={`Apply ${label}`}
            onClick={() => applyWallPaintSwatch(swatch, source)}
          >
            <span
              aria-hidden="true"
              className="block h-full w-full rounded-md border border-black/10"
              style={{ backgroundColor: swatch.hex }}
            />
          </button>
        );
      }

      return (
        <button
          key={swatch.id}
          type="button"
          data-testid={`wall-paint-swatch-${swatch.id}`}
          className={`flex h-11 min-w-0 items-center gap-2 rounded-lg border p-1.5 text-left ${selected ? selectedClass : idleClass}`}
          disabled={!canEdit || !canApplyActiveSurfaceTarget}
          title={label}
          aria-label={`Apply ${label}`}
          onClick={() => applyWallPaintSwatch(swatch, source)}
        >
          <span
            aria-hidden="true"
            className="h-7 w-7 shrink-0 rounded-md border border-black/10"
            style={{ backgroundColor: swatch.hex }}
          />
          <span className="min-w-0 flex-1">
            <span className={dark ? "block truncate text-[11px] font-semibold text-neutral-100" : "block truncate text-[11px] font-semibold text-neutral-900"}>
              {swatch.name}
            </span>
            <span className={dark ? "block truncate text-[10px] font-medium text-neutral-400" : "block truncate text-[10px] font-medium text-neutral-500"}>
              {swatch.code ?? swatch.hex}
            </span>
          </span>
        </button>
      );
    };

    return (
      <div
        data-testid="wall-paint-panel"
        className={dark ? "designer-recessed mt-2 rounded-lg p-2" : "mt-2 rounded-lg border border-neutral-200 bg-white p-2"}
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="h-12 w-12 shrink-0 rounded-md border border-black/10"
            style={{ backgroundColor: activePaintColorHex ?? "#f7f5ef" }}
          />
          <div className="min-w-0 flex-1">
            <div className={dark ? "truncate text-xs font-semibold text-neutral-100" : "truncate text-xs font-semibold text-neutral-900"}>
              {activePaintName}
            </div>
            <div className={floorMaterialMetaClass}>
              {activePaintColorHex ?? `Choose a ${paintTargetNoun} colour`}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <div className={dark ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-neutral-700"}>
              Colour family: {activeWallPaintFamilyFilter.id === "all" ? "ALL" : activeWallPaintFamilyFilter.label.toUpperCase()}
            </div>
            {wallPaintFamilyFilter !== "all" ? (
              <button
                type="button"
                data-testid="wall-paint-family-clear"
                className={dark ? "text-[11px] font-semibold text-neutral-300 hover:text-white" : "text-[11px] font-semibold text-neutral-500 hover:text-neutral-900"}
                onClick={() => setWallPaintFamilyFilter("all")}
              >
                All
              </button>
            ) : null}
          </div>
          <div
            data-testid="wall-paint-family-filter"
            className="mt-2 grid grid-flow-col grid-rows-2 auto-cols-max gap-2 overflow-x-auto pb-1"
            aria-label="Filter paint colours by family"
          >
            {WALL_PAINT_FAMILY_FILTERS.filter((family) => family.id !== "all").map((family) => {
              const selected = family.id === wallPaintFamilyFilter;
              const familyButtonClass = selected
                ? dark
                  ? "h-9 w-9 shrink-0 rounded-full border-2 border-emerald-300 shadow-sm ring-2 ring-emerald-300/30"
                  : "h-9 w-9 shrink-0 rounded-full border-2 border-neutral-950 shadow-sm ring-2 ring-emerald-200"
                : dark
                  ? "h-9 w-9 shrink-0 rounded-full border border-white/15 shadow-sm hover:border-white/40"
                  : "h-9 w-9 shrink-0 rounded-full border border-neutral-200 shadow-sm hover:border-neutral-400";
              return (
                <button
                  key={family.id}
                  type="button"
                  data-testid={`wall-paint-family-${family.id}`}
                  className={familyButtonClass}
                  style={{ backgroundColor: family.hex }}
                  aria-label={`Show ${family.label} paint colours`}
                  aria-pressed={selected}
                  title={family.label}
                  onClick={() => setWallPaintFamilyFilter(family.id)}
                >
                  <span className="sr-only">{family.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className={dark ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-neutral-700"}>
              Nippon Paint
            </div>
            <div className={floorMaterialMetaClass}>
              {filteredNipponWallPaintSwatches.length.toLocaleString()} / {NIPPON_WALL_PAINT_COLOUR_COUNT.toLocaleString()}
            </div>
          </div>
          <input
            type="search"
            data-testid="wall-paint-search"
            value={wallPaintSearch}
            onChange={(event) => setWallPaintSearch(event.currentTarget.value)}
            className={wallPaintSearchInputClass}
            placeholder="Search name, code, family, or hex"
          />
          {visibleNipponWallPaintSwatches.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {visibleNipponWallPaintSwatches.map((swatch) => renderWallPaintSwatchButton(swatch, "row"))}
            </div>
          ) : (
            <div className={dark ? "rounded-lg border border-white/10 p-3 text-xs text-neutral-400" : "rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-500"}>
              No Nippon Paint colours match.
            </div>
          )}
          {hiddenNipponWallPaintCount > 0 ? (
            <button
              type="button"
              data-testid="wall-paint-show-more"
              className={`${progressSecondaryActionClass} min-h-9 w-full`}
              onClick={() => setWallPaintVisibleLimit((limit) => limit + WALL_PAINT_VISIBLE_INCREMENT)}
            >
              Show more ({hiddenNipponWallPaintCount.toLocaleString()})
            </button>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-2">
          <label className={dark ? "block text-xs font-semibold text-neutral-200" : "block text-xs font-semibold text-neutral-700"}>
            Custom
            <input
              type="color"
              data-testid="wall-paint-custom-color"
              value={normalizedCustomPaintHex}
              disabled={!canEdit || !canApplyActiveSurfaceTarget}
              onChange={(event) => {
                setCustomWallPaintHex(event.currentTarget.value);
                setWallPaintApplyName("Custom paint");
              }}
              className="mt-1 h-9 w-14 rounded-md border border-black/10 bg-transparent p-0"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="wall-paint-apply-custom"
              className={progressActionClass}
              disabled={!canEdit || !canApplyActiveSurfaceTarget}
              onClick={() => applyWallPaintToActiveTarget(normalizedCustomPaintHex, wallPaintApplyName, "custom")}
            >
              Apply target
            </button>
            <button
              type="button"
              data-testid="wall-paint-apply-all"
              className={progressSecondaryActionClass}
              disabled={!canEdit}
              onClick={() => applyWallPaintToAllRooms(normalizedCustomPaintHex, wallPaintApplyName, "custom")}
            >
              Apply all
            </button>
          </div>
        </div>

        <button
          type="button"
          data-testid="wall-paint-reset"
          className={`${progressSecondaryActionClass} mt-2 min-h-9 w-full`}
          disabled={!canEdit || !canApplyActiveSurfaceTarget}
          onClick={activeSurfaceTarget === "ceiling" ? onResetActiveCeilingSurface : onResetActiveWallSurface}
        >
          Reset {paintTargetNoun} finish
        </button>
      </div>
    );
}
