"use client";

type RotationSnapPresetDegrees = 15 | 5 | 0;

type SelectedItemRotationControlsProps = {
  dark: boolean;
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
  dark,
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
  const textPrimaryClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-900";
  const textSecondaryClass = dark
    ? "designer-text-secondary mt-1 text-xs"
    : "mt-1 text-xs text-neutral-600";
  const hintClass = dark
    ? "designer-text-secondary mt-2 text-[11px]"
    : "mt-2 text-[11px] text-neutral-500";
  const buttonClass = dark
    ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
    : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800";
  const snapPresetClass = (preset: RotationSnapPresetDegrees) =>
    `rounded-lg border px-2 py-1.5 text-xs ${
      rotationSnapPresetDegrees === preset
        ? "designer-accent-border"
        : dark
          ? "border-white/15"
          : "border-neutral-200 text-neutral-800"
    }`;

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
            <div
              className={
                dark
                  ? "designer-text-secondary mt-1 text-xs"
                  : "mt-1 text-xs text-neutral-500"
              }
            >
              Pro tip: hold Option/Alt while dragging the rotate handle for free rotation.
            </div>
          ) : null}

          <div className="mt-2 grid grid-cols-3 gap-2">
            <button
              data-testid="rotation-snap-preset-15"
              className={snapPresetClass(15)}
              disabled={disabled}
              title="Snap to coarse 15° increments for quick positioning"
              onClick={() => onSnapPresetChange(15)}
            >
              Quick Turns
            </button>
            <button
              data-testid="rotation-snap-preset-5"
              className={snapPresetClass(5)}
              disabled={disabled}
              title="Snap to fine 5° increments for precise angle control"
              onClick={() => onSnapPresetChange(5)}
            >
              Precise Angle
            </button>
            <button
              data-testid="rotation-snap-preset-free"
              className={snapPresetClass(0)}
              disabled={disabled}
              title="Disable snap for unrestricted rotation"
              onClick={() => onSnapPresetChange(0)}
            >
              Free Rotate
            </button>
          </div>

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
                  className={
                    dark
                      ? "w-full rounded-lg border border-white/15 bg-transparent px-2 py-1.5 text-xs"
                      : "w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900"
                  }
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
                <button
                  data-testid="rotation-input-apply"
                  className={
                    dark
                      ? "rounded-lg border border-white/15 px-3 py-1.5 text-xs"
                      : "rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-800"
                  }
                  disabled={disabled}
                  onClick={onApplyRotationInput}
                >
                  Apply
                </button>
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
