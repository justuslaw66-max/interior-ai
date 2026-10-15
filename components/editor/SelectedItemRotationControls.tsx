"use client";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type RotationSnapPresetDegrees = 15 | 5 | 0;

const SNAP_PRESET_OPTIONS: ReadonlyArray<{ value: RotationSnapPresetDegrees; label: string; testId: string; title: string }> = [
  { value: 15, label: "Quick turns", testId: "rotation-snap-preset-15", title: "Snap to coarse 15° increments for quick positioning" },
  { value: 5, label: "Precise angle", testId: "rotation-snap-preset-5", title: "Snap to fine 5° increments for precise angle control" },
  { value: 0, label: "Free rotate", testId: "rotation-snap-preset-free", title: "Disable snap for unrestricted rotation" },
];

type SelectedItemRotationControlsProps = {
  isDesigner: boolean;
  expanded: boolean;
  selectedRotationDegrees: number;
  rotationSnapEnabled: boolean;
  rotationSnapStepDegrees: number;
  rotationSnapPresetDegrees: RotationSnapPresetDegrees;
  rotationInputValue: string;
  disabled: boolean;
  onSnapPresetChange: (degrees: RotationSnapPresetDegrees) => void;
  onRotateByDegrees: (degrees: number) => void;
  onResetRotation: () => void;
  onRotationInputChange: (value: string) => void;
  onApplyRotationInput: () => void;
};

export default function SelectedItemRotationControls({
  isDesigner,
  expanded,
  selectedRotationDegrees,
  rotationSnapEnabled,
  rotationSnapStepDegrees,
  rotationSnapPresetDegrees,
  rotationInputValue,
  disabled,
  onSnapPresetChange,
  onRotateByDegrees,
  onResetRotation,
  onRotationInputChange,
  onApplyRotationInput,
}: SelectedItemRotationControlsProps) {
  const textPrimaryClass = "text-sm font-semibold text-neutral-900";
  const textSecondaryClass = "mt-1 text-xs text-neutral-600";
  const hintClass = "mt-2 text-xs text-neutral-500";
  const buttonClass = "min-h-11 rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800";

  return (
    <div className="pt-3">
      <div className={textPrimaryClass}>Rotation</div>
      <div className={textSecondaryClass} data-testid="rotation-angle-label">
        Angle {selectedRotationDegrees} deg (
        {rotationSnapEnabled ? `snap ${rotationSnapStepDegrees} deg` : "free"})
      </div>

      {expanded ? (
        <>
          <div className={hintClass}>
            Snap locks rotation to common angles. Disable for fine control.
          </div>
          {isDesigner ? (
            <div className="mt-1 text-xs text-neutral-500">
              Pro tip: hold Option/Alt while dragging the rotate handle for free rotation.
            </div>
          ) : null}

          <SegmentedControl
            label="Rotation snap"
            className="mt-2"
            size="compact"
            fill
            disabled={disabled}
            value={rotationSnapPresetDegrees}
            onChange={onSnapPresetChange}
            options={SNAP_PRESET_OPTIONS}
          />

          <div className="mt-2 grid grid-cols-4 gap-2">
            <button
              data-testid="rotation-btn-step-negative"
              className={buttonClass}
              disabled={disabled}
              title={`Rotate left by ${rotationSnapStepDegrees} degrees`}
              aria-keyshortcuts="q"
              onClick={() => onRotateByDegrees(-rotationSnapStepDegrees)}
            >
              -{rotationSnapStepDegrees} deg
            </button>
            <button
              data-testid="rotation-btn-step-positive"
              className={buttonClass}
              disabled={disabled}
              title={`Rotate right by ${rotationSnapStepDegrees} degrees`}
              aria-keyshortcuts="e"
              onClick={() => onRotateByDegrees(rotationSnapStepDegrees)}
            >
              +{rotationSnapStepDegrees} deg
            </button>
            <button
              data-testid="rotation-btn-quarter-turn"
              className={buttonClass}
              disabled={disabled}
              title="Rotate right by 90 degrees"
              aria-keyshortcuts="r"
              onClick={() => onRotateByDegrees(90)}
            >
              +90 deg
            </button>
            <button
              data-testid="rotation-btn-reset"
              className={buttonClass}
              disabled={disabled}
              title="Reset rotation to 0 degrees"
              aria-keyshortcuts="0"
              onClick={onResetRotation}
            >
              Reset
            </button>
          </div>

          {isDesigner ? (
            <>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <button
                  className={buttonClass}
                  disabled={disabled}
                  onClick={() => onRotateByDegrees(-1)}
                >
                  -1 deg
                </button>
                <button
                  className={buttonClass}
                  disabled={disabled}
                  onClick={() => onRotateByDegrees(1)}
                >
                  +1 deg
                </button>
                <button
                  className={buttonClass}
                  disabled={disabled}
                  onClick={() => onRotateByDegrees(-5)}
                >
                  -5 deg
                </button>
                <button
                  className={buttonClass}
                  disabled={disabled}
                  onClick={() => onRotateByDegrees(5)}
                >
                  +5 deg
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  data-testid="rotation-input"
                  className="min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900"
                  type="number"
                  step="0.1"
                  value={rotationInputValue}
                  disabled={disabled}
                  onChange={(event) => onRotationInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onApplyRotationInput();
                    }
                  }}
                  onBlur={onApplyRotationInput}
                  aria-label="Exact rotation angle in degrees"
                />
                <Button
                  data-testid="rotation-input-apply"
                  variant="secondary" size="touch"
                  disabled={disabled}
                  onClick={onApplyRotationInput}
                >
                  Apply
                </Button>
              </div>
            </>
          ) : null}

          <div className={hintClass} data-testid="rotation-shortcut-hint">
            Shortcuts: R +90 deg, Shift+R -90 deg, Q/E -/+{rotationSnapStepDegrees} deg, 0 reset
          </div>
        </>
      ) : null}
    </div>
  );
}
