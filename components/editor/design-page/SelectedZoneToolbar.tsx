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
    <div className="absolute left-1/2 top-bar-17 z-30 md:top-bar-16 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow">
        <div className="text-xs font-semibold text-neutral-900">
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
