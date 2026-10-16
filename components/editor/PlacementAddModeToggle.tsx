"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";

type PlacementAddMode = "preview" | "auto";

type PlacementAddModeToggleProps = {
  /** Pro only. */
  visible: boolean;
  mode: PlacementAddMode;
  onChange: (mode: PlacementAddMode) => void;
};

const ADD_MODE_OPTIONS = [
  { value: "preview", label: "Preview add", testId: "placement-add-mode-preview" },
  { value: "auto", label: "Auto add", testId: "placement-add-mode-auto" },
] as const;

/**
 * Pro's choice between previewing a product before it's added and adding it straight away. Consumers
 * don't get the choice: their Add places the product, with Undo (audit finding FU4).
 */
export function PlacementAddModeToggle({ visible, mode, onChange }: PlacementAddModeToggleProps) {
  if (!visible) return null;
  return (
    <SegmentedControl
      label="How products are added"
      testId="placement-add-mode"
      className="mb-3"
      fill
      value={mode}
      onChange={onChange}
      options={ADD_MODE_OPTIONS}
    />
  );
}
