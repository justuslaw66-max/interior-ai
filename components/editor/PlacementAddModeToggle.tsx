"use client";

type PlacementAddMode = "preview" | "auto";

type PlacementAddModeToggleProps = {
  /** Pro only. */
  visible: boolean;
  mode: PlacementAddMode;
  onChange: (mode: PlacementAddMode) => void;
};

const ACTIVE_CLASS = "rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white";
const IDLE_CLASS =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50";

/**
 * Pro's choice between previewing a product before it's added and adding it straight away. Consumers
 * don't get the choice: their Add places the product, with Undo (audit finding FU4).
 */
export function PlacementAddModeToggle({ visible, mode, onChange }: PlacementAddModeToggleProps) {
  if (!visible) return null;
  return (
    <div className="mb-3 grid grid-cols-2 gap-2" data-testid="placement-add-mode">
      {(["preview", "auto"] as const).map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`placement-add-mode-${option}`}
          data-active={mode === option ? "true" : "false"}
          className={mode === option ? ACTIVE_CLASS : IDLE_CLASS}
          onClick={() => onChange(option)}
        >
          {option === "preview" ? "Preview Add" : "Auto Add"}
        </button>
      ))}
    </div>
  );
}
