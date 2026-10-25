"use client";

import { X } from "lucide-react";
import type { ZoneMin } from "@/lib/room-types";
import { Button } from "@/components/ui/Button";

type MultiSelectionToolbarProps = {
  state: {
    count: number;
    zoneType: ZoneMin["type"];
    /** Pro only (UX 4g, FU6): zone type and Create zone. */
    zoneTools?: boolean;
  };
  actions: {
    alignX: () => void;
    alignZ: () => void;
    changeZoneType: (zoneType: ZoneMin["type"]) => void;
    createZone: () => void;
    clear: () => void;
  };
};

/** Pro's zone type and Create zone (UX 4g, FU6); consumers align a group but make no zones. */
function ZoneCreateControls({ state, actions }: MultiSelectionToolbarProps) {
  return (
    <>
      <select
        className="rounded-full border border-box-border bg-field px-2 py-1 text-xs text-label"
        value={state.zoneType}
        onChange={(event) => actions.changeZoneType(event.currentTarget.value as ZoneMin["type"])}
      >
        <option value="seating">Seating</option>
        <option value="reading">Reading</option>
        <option value="tv">TV</option>
        <option value="dining">Dining</option>
      </select>
      <Button size="compact" onClick={actions.createZone}>
        Create zone
      </Button>
    </>
  );
}

export function MultiSelectionToolbar({
  state,
  actions,
}: MultiSelectionToolbarProps) {
  return (
    <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 md:top-bar-16">
      <div data-surface="floating" className="flex items-center gap-2 rounded-full bg-surface-floating px-3 py-2 shadow ring-1 ring-surface-floating-edge">
        <div className="text-xs font-semibold text-label">
          Group ({state.count})
        </div>
        <Button size="compact" onClick={actions.alignX}>
          Align X centre
        </Button>
        <Button size="compact" onClick={actions.alignZ}>
          Align Z centre
        </Button>
        {state.zoneTools ? <ZoneCreateControls state={state} actions={actions} /> : null}
        <Button variant="quiet" size="icon"
          aria-label={`Deselect ${state.count} products`} title={`Deselect ${state.count} products`} onClick={actions.clear}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
