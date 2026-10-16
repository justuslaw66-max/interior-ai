"use client";

import { Button } from "@/components/ui/Button";

type ProGridSnapTogglesProps = {
  showGrid: boolean;
  snapEnabled: boolean;
  onGridToggle: () => void;
  onSnapToggle: () => void;
};

/** Pro tools' Grid and Snap switches under the Plan and Furnish panels: on/off toggles, black while on (UX 5n). */
export function ProGridSnapToggles({ showGrid, snapEnabled, onGridToggle, onSnapToggle }: ProGridSnapTogglesProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="compact" pressed={showGrid} onClick={onGridToggle}>
        Grid
      </Button>
      <Button size="compact" pressed={snapEnabled} onClick={onSnapToggle}>
        Snap
      </Button>
    </div>
  );
}
