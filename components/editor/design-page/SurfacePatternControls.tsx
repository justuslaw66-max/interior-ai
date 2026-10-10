"use client";

import type { KeyboardEvent } from "react";
import SurfacePatternPreview from "@/components/editor/design-page/SurfacePatternPreview";
import type { RoomFloorPattern } from "@/lib/room-types";

export type SurfaceGroutState = {
  groutSizes: Array<{ valueMm: number; selected: boolean; testId: string }>;
  groutColor: string;
  groutPaletteOpen: boolean;
  groutColors: Array<{ key: string; color: string; selected: boolean; testId: string }>;
  disabled: boolean;
};

export type FloorPatternState = SurfaceGroutState & {
  value: RoomFloorPattern;
  options: Array<{ id: RoomFloorPattern; label: string; selected: boolean }>;
  rotations: Array<{ value: number; selected: boolean }>;
  scale: number;
  offset: { x: number; y: number };
};

export type SurfaceGroutActions = {
  onSelectGroutSize: (sizeMm: number) => void;
  onToggleGroutPalette: () => void;
  onSelectGroutColor: (color: string) => void;
};

export type SurfacePatternActions = SurfaceGroutActions & {
  onSelectPattern: (pattern: RoomFloorPattern) => void;
  onSelectRotation: (rotationDeg: number) => void;
  onChangeScale: (scale: number) => void;
  onMovePattern: (deltaX: number, deltaY: number) => void;
  onResetPattern: () => void;
  onResetSurface: () => void;
};

const LABEL = "text-xs font-semibold text-neutral-700";
const CHOICE = "min-h-8 rounded-lg px-2 py-1 text-xs font-semibold touch:min-h-11";
const choiceClass = (selected: boolean) =>
  selected
    ? `${CHOICE} bg-neutral-900 text-white`
    : `${CHOICE} border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100`;

type GroutProps = { grout: SurfaceGroutState; actions: SurfaceGroutActions; testIdPrefix: "surface" | "wall-surface" };

function GroutPalette({ grout, actions, testIdPrefix }: GroutProps) {
  return (
    <div data-testid={`${testIdPrefix}-grout-color-palette`} className="mt-2 grid grid-cols-5 gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1.5">
      {grout.groutColors.map((color) => (
        <button
          key={color.key}
          type="button"
          data-testid={color.testId}
          aria-pressed={color.selected}
          disabled={grout.disabled}
          className={
            color.selected
              ? "grid aspect-square min-h-8 place-items-center rounded-md border border-neutral-200 bg-white p-0 shadow-sm"
              : "grid aspect-square min-h-8 place-items-center rounded-md border border-transparent bg-white p-0 hover:border-neutral-200"
          }
          aria-label={`Set grout colour ${color.color}`}
          title={color.color}
          onClick={() => actions.onSelectGroutColor(color.color)}
        >
          <span aria-hidden="true" className="block h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-md border border-black/5" style={{ backgroundColor: color.color }} />
        </button>
      ))}
    </div>
  );
}

/** Grout size and colour, for tiled floors and walls. */
export function SurfaceGroutControls({ grout, actions, testIdPrefix }: GroutProps) {
  return (
    <div className="mt-2">
      <div className={LABEL}>Grout</div>
      <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
        <div className={`block ${LABEL}`}>
          Grout size
          <div className="mt-1 grid grid-cols-3 gap-1">
            {grout.groutSizes.map((size) => (
              <button key={size.valueMm} type="button" data-testid={size.testId} aria-pressed={size.selected} disabled={grout.disabled}
                className={choiceClass(size.selected)} onClick={() => actions.onSelectGroutSize(size.valueMm)}>
                {size.valueMm} mm
              </button>
            ))}
          </div>
        </div>
        <div className={`block ${LABEL}`}>
          Colour
          <button
            type="button"
            data-testid={`${testIdPrefix}-joint-color`}
            disabled={grout.disabled}
            className="mt-1 grid h-8 w-12 place-items-center rounded-lg border border-neutral-200 bg-white p-1 disabled:opacity-50 touch:h-11"
            aria-label="Choose grout colour"
            aria-expanded={grout.groutPaletteOpen}
            title="Choose grout colour"
            onClick={actions.onToggleGroutPalette}
          >
            <span aria-hidden="true" className="block h-full w-full rounded border border-black/15" style={{ backgroundColor: grout.groutColor }} />
          </button>
        </div>
      </div>
      {grout.groutPaletteOpen ? <GroutPalette grout={grout} actions={actions} testIdPrefix={testIdPrefix} /> : null}
    </div>
  );
}

const MOVES = [
  { label: "Left", x: -0.05, y: 0 },
  { label: "Right", x: 0.05, y: 0 },
  { label: "Up", x: 0, y: 0.05 },
  { label: "Down", x: 0, y: -0.05 },
] as const;
const ARROW_MOVES: Record<string, { x: number; y: number }> = {
  ArrowLeft: MOVES[0],
  ArrowRight: MOVES[1],
  ArrowUp: MOVES[2],
  ArrowDown: MOVES[3],
};

type PatternProps = { pattern: FloorPatternState; actions: SurfacePatternActions };

function PatternChoices({ pattern, actions }: PatternProps) {
  return (
    <>
      <div className={LABEL}>Pattern</div>
      <select
        data-testid="surface-pattern-select"
        aria-label="Floor pattern"
        value={pattern.value}
        disabled={pattern.disabled}
        className="sr-only"
        onChange={(event) => actions.onSelectPattern(event.currentTarget.value as RoomFloorPattern)}
      >
        {pattern.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <div data-testid="surface-pattern-options" className="mt-1.5 grid grid-cols-3 gap-1.5">
        {pattern.options.map((option) => (
          <button
            key={option.id}
            type="button"
            data-testid={`surface-pattern-option-${option.id}`}
            aria-label={`Set ${option.label} pattern`}
            aria-pressed={option.selected}
            title={option.label}
            disabled={pattern.disabled}
            className={
              option.selected
                ? "grid h-12 place-items-center rounded-lg border border-emerald-400 bg-emerald-50 p-1 shadow-sm"
                : "grid h-12 place-items-center rounded-lg border border-neutral-200 bg-white p-1 hover:border-neutral-300 hover:bg-neutral-50"
            }
            onClick={() => actions.onSelectPattern(option.id)}
          >
            <SurfacePatternPreview pattern={option.id} dark={false} />
            <span className="sr-only">{option.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function PatternRotationAndSize({ pattern, actions }: PatternProps) {
  return (
    <>
      <div className={`mt-2 ${LABEL}`}>Rotation</div>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {pattern.rotations.map((rotation) => (
          <button key={rotation.value} type="button" data-testid={`surface-rotation-${rotation.value}`} aria-pressed={rotation.selected}
            className={choiceClass(rotation.selected)} disabled={pattern.disabled} onClick={() => actions.onSelectRotation(rotation.value)}>
            {rotation.value}°
          </button>
        ))}
      </div>
      <label className={`mt-2 block ${LABEL}`}>
        Pattern size · {pattern.scale.toFixed(2)}x
        <input
          type="range"
          data-testid="surface-pattern-scale"
          min={0.5}
          max={2}
          step={0.05}
          value={pattern.scale}
          disabled={pattern.disabled}
          onChange={(event) => actions.onChangeScale(Number(event.currentTarget.value))}
          className="mt-2 w-full accent-emerald-600 disabled:opacity-50"
        />
      </label>
    </>
  );
}

function PatternMove({ pattern, actions }: PatternProps) {
  const onOffsetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = ARROW_MOVES[event.key];
    if (!delta) return;
    event.preventDefault();
    actions.onMovePattern(delta.x, delta.y);
  };
  return (
    <div data-testid="surface-offset-controls" role="group" tabIndex={0} aria-label="Move floor pattern" className="mt-2" onKeyDown={onOffsetKeyDown}>
      <div className={LABEL}>Move pattern</div>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {MOVES.map((move) => (
          <button key={move.label} type="button" data-testid={`surface-offset-${move.label.toLowerCase()}`} className={choiceClass(false)}
            disabled={pattern.disabled} onClick={() => actions.onMovePattern(move.x, move.y)}>
            {move.label}
          </button>
        ))}
      </div>
      <div className="mt-1 text-xs text-neutral-600">
        Offset {pattern.offset.x.toFixed(2)}, {pattern.offset.y.toFixed(2)}
      </div>
    </div>
  );
}

/**
 * A tiled or planked floor's pattern (UX audit ED5, phase 4f): the laying pattern, its rotation and
 * size, grout, moving it (arrow keys too) and the two resets. It sits in "Adjust pattern", closed
 * for consumers and open for Pro. Extracted from `SelectedSurfaceInspector`, which can't grow.
 */
export function SurfacePatternControls({ pattern, actions }: PatternProps) {
  return (
    <div className="mt-2 border-t border-neutral-100 pt-2">
      <PatternChoices pattern={pattern} actions={actions} />
      <PatternRotationAndSize pattern={pattern} actions={actions} />
      <SurfaceGroutControls grout={pattern} actions={actions} testIdPrefix="surface" />
      <PatternMove pattern={pattern} actions={actions} />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" className={choiceClass(false)} disabled={pattern.disabled} onClick={actions.onResetPattern}>
          Reset pattern
        </button>
        <button type="button" className={choiceClass(false)} disabled={pattern.disabled} onClick={actions.onResetSurface}>
          Reset surface
        </button>
      </div>
    </div>
  );
}
