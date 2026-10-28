"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  WALL_PANEL_BOARD_OPTIONS,
  WALL_PANEL_BOARD_THICKNESSES_MM,
  WALL_PANEL_FIXING_OPTIONS,
  type NormalizedWallPanelBacking,
  type WallPanelBoard,
  type WallPanelFixing,
} from "@/lib/laminate-wall-backing";

/** A laminate wall finish's board, as the inspector shows it; null for any other finish. */
export type WallBackingState = {
  backing: NormalizedWallPanelBacking;
  /** How far the finished panel stands off the wall, laminate, board and battens. */
  buildUpMm: number;
  disabled: boolean;
};

const LABEL = "text-xs font-semibold text-control-label-idle";

function boardOf(value: string): WallPanelBoard | null {
  return WALL_PANEL_BOARD_OPTIONS.find((option) => option.id === value)?.id ?? null;
}

/**
 * The board a laminate wall finish is bonded to and how the panel is fixed (J, 28 Oct 2026: never straight on a bare wall;
 * lib/laminate-wall-backing.ts). There is no "none": Greenlam's pasting manual bonds its laminates to a board. Nothing for
 * any other finish (a null `wallBacking`).
 */
export function WallPanelBackingControls({
  wallBacking,
  onChange,
}: {
  wallBacking: WallBackingState | null;
  onChange: (patch: Partial<NormalizedWallPanelBacking>) => void;
}) {
  if (!wallBacking) return null;
  const { backing, disabled } = wallBacking;
  return (
    <div data-testid="selection-inspector-wall-board" className="mt-2 border-t border-separator-subtle pt-2">
      <div className="text-xs font-semibold text-control-label">Board behind the laminate</div>
      <label className={`mt-1 block ${LABEL}`}>
        Board
        <select
          data-testid="wall-panel-board"
          value={backing.board}
          disabled={disabled}
          className="mt-1 h-9 w-full rounded-lg border border-box-border bg-field px-2 text-xs text-control-label"
          onChange={(event) => {
            const board = boardOf(event.currentTarget.value);
            if (board) onChange({ board });
          }}
        >
          {WALL_PANEL_BOARD_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className={`mt-2 ${LABEL}`}>
        Thickness
        <SegmentedControl label="Board thickness" className="mt-1" size="compact" fill disabled={disabled}
          value={backing.boardThicknessMm} onChange={(boardThicknessMm) => onChange({ boardThicknessMm })}
          options={WALL_PANEL_BOARD_THICKNESSES_MM.map((mm) => ({ value: mm, label: `${mm} mm`, testId: `wall-panel-board-thickness-${mm}` }))} />
      </div>
      <div className={`mt-2 ${LABEL}`}>
        Fixed
        <SegmentedControl<WallPanelFixing> label="How the panel is fixed" className="mt-1" size="compact" fill disabled={disabled}
          value={backing.fixing} onChange={(fixing) => onChange({ fixing })}
          options={WALL_PANEL_FIXING_OPTIONS.map((option) => ({ value: option.id, label: option.label, testId: `wall-panel-fixing-${option.id}` }))} />
      </div>
      <div data-testid="wall-panel-build-up" className="mt-1 text-xs text-label-secondary">
        Stands {wallBacking.buildUpMm} mm off the wall{backing.fixing === "battens" ? ", on 25 mm battens 600 mm apart" : ""}.
      </div>
    </div>
  );
}
