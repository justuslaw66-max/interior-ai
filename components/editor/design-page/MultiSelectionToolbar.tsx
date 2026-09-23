"use client";

import type { ZoneMin } from "@/lib/room-types";

type MultiSelectionToolbarProps = {
  state: {
    count: number;
    zoneType: ZoneMin["type"];
  };
  configuration: {
    dark: boolean;
  };
  actions: {
    alignX: () => void;
    alignZ: () => void;
    changeZoneType: (zoneType: ZoneMin["type"]) => void;
    createZone: () => void;
    clear: () => void;
  };
};

export function MultiSelectionToolbar({
  state,
  configuration,
  actions,
}: MultiSelectionToolbarProps) {
  const buttonClass = configuration.dark
    ? "rounded-full border px-2 py-1 text-xs"
    : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900";

  return (
    <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
      <div
        className={
          configuration.dark
            ? "designer-panel flex items-center gap-2 rounded-full px-3 py-2"
            : "flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow"
        }
      >
        <div
          className={
            configuration.dark
              ? "designer-text-primary text-xs font-semibold"
              : "text-xs font-semibold text-neutral-900"
          }
        >
          Group ({state.count})
        </div>
        <button className={buttonClass} onClick={actions.alignX}>
          Align X center
        </button>
        <button className={buttonClass} onClick={actions.alignZ}>
          Align Z center
        </button>
        <select
          className={
            configuration.dark
              ? "rounded-full border bg-transparent px-2 py-1 text-xs"
              : "rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900"
          }
          value={state.zoneType}
          onChange={(event) =>
            actions.changeZoneType(event.currentTarget.value as ZoneMin["type"])
          }
        >
          <option value="seating">Seating</option>
          <option value="reading">Reading</option>
          <option value="tv">TV</option>
          <option value="dining">Dining</option>
        </select>
        <button className={buttonClass} onClick={actions.createZone}>
          Create zone
        </button>
        <button className={buttonClass} onClick={actions.clear}>
          Clear
        </button>
      </div>
    </div>
  );
}
