"use client";

type ProGridSnapTogglesProps = {
  dark: boolean;
  showGrid: boolean;
  snapEnabled: boolean;
  onGridToggle: () => void;
  onSnapToggle: () => void;
};

/** Pro tools' Grid and Snap switches under the Plan and Furnish panels. */
export function ProGridSnapToggles({ dark, showGrid, snapEnabled, onGridToggle, onSnapToggle }: ProGridSnapTogglesProps) {
  const selectedButtonClass = dark ? "designer-control-active border" : "bg-neutral-900 text-white";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        className={`text-xs px-3 py-2 rounded-lg ${
          showGrid ? selectedButtonClass : dark ? "designer-raised text-neutral-200" : "bg-neutral-100"
        }`}
        onClick={onGridToggle}
      >
        Grid
      </button>
      <button
        className={`text-xs px-3 py-2 rounded-lg ${
          snapEnabled ? selectedButtonClass : dark ? "designer-raised text-neutral-200" : "bg-neutral-100"
        }`}
        onClick={onSnapToggle}
      >
        Snap
      </button>
    </div>
  );
}
