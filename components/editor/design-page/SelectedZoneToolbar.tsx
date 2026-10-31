"use client";

import { Button } from "@/components/ui/Button";

type SelectedZoneToolbarProps = {
  state: {
    label: string;
  };
  actions: {
    autoLayout: () => void;
    rotate: () => void;
    ungroup: () => void;
  };
};

export function SelectedZoneToolbar({
  state,
  actions,
}: SelectedZoneToolbarProps) {
  return (
    <div className="absolute left-1/2 md:left-[var(--canvas-centre-x,50%)] top-bar-17 z-30 md:top-bar-16 -translate-x-1/2">
      <div data-surface="floating" className="flex items-center gap-2 rounded-full bg-surface-floating px-3 py-2 shadow ring-1 ring-surface-floating-edge">
        <div className="text-xs font-semibold text-label">
          {state.label}
        </div>
        <Button size="compact" onClick={actions.autoLayout}>
          Auto-layout
        </Button>
        <Button size="compact" onClick={actions.rotate}>
          Rotate zone
        </Button>
        <Button size="compact" onClick={actions.ungroup}>
          Ungroup
        </Button>
      </div>
    </div>
  );
}
