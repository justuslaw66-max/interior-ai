"use client";

import type {
  HouseRoomConnectionChecklistItem,
  HouseRoomDoorwaySuggestion,
} from "@/lib/design-page-house-plan";

type RoomConnectionChecklistProps = {
  items: HouseRoomConnectionChecklistItem[];
  disabled?: boolean;
  dark?: boolean;
  variant?: "pro" | "consumer";
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onAddDoorway: (suggestion: HouseRoomDoorwaySuggestion) => void;
};

const formatMeters = (value: number) => value.toFixed(1).replace(/\.0$/, "");

export default function RoomConnectionChecklist({
  items,
  disabled = false,
  dark = false,
  variant = "consumer",
  collapsed = false,
  onCollapsedChange,
  onAddDoorway,
}: RoomConnectionChecklistProps) {
  if (items.length === 0) return null;

  const shellClass = dark
    ? "rounded-xl border border-white/10 bg-[#151820] p-3"
    : "rounded-xl border border-neutral-200 bg-white p-3";
  const titleClass = dark
    ? "text-sm font-semibold text-neutral-100"
    : "text-sm font-semibold text-neutral-900";
  const rowClass = dark
    ? "rounded-lg border border-white/10 bg-white/5 p-2"
    : "rounded-lg border border-neutral-200 bg-neutral-50 p-2";
  const labelClass = dark
    ? "text-xs font-semibold text-neutral-100"
    : "text-xs font-semibold text-neutral-800";
  const metaClass = dark ? "text-[11px] text-neutral-400" : "text-[11px] text-neutral-500";
  const connectedClass = dark
    ? "rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-semibold text-emerald-200"
    : "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700";
  const needsClass = dark
    ? "rounded-full bg-amber-400/15 px-2 py-1 text-[11px] font-semibold text-amber-200"
    : "rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700";
  const buttonClass = dark
    ? "rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:opacity-50"
    : "rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-700 disabled:opacity-50";
  const toggleClass = dark
    ? "rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-neutral-300"
    : "rounded-lg border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-600";

  return (
    <div data-testid="room-connection-checklist" data-variant={variant} className={shellClass}>
      <div className="flex items-center justify-between gap-2">
        <div className={titleClass}>Connections</div>
        {onCollapsedChange ? (
          <button
            type="button"
            className={toggleClass}
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        ) : null}
      </div>
      {collapsed ? null : (
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.id} data-testid="room-connection-row" className={rowClass}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={labelClass}>
                  {item.roomNames[0]} - {item.roomNames[1]}
                </div>
                <div className={metaClass}>
                  {formatMeters(item.sharedWallLengthMeters)}m shared wall
                </div>
              </div>
              <div
                data-testid="room-connection-status"
                className={item.status === "connected" ? connectedClass : needsClass}
              >
                {item.status === "connected" ? "Doorway ready" : "Needs doorway"}
              </div>
            </div>
            {item.status === "needs_doorway" && item.doorwaySuggestion && (
              <button
                type="button"
                data-testid="room-connection-add-doorway"
                className={`${buttonClass} mt-2`}
                disabled={disabled}
                onClick={() => onAddDoorway(item.doorwaySuggestion!)}
              >
                Add doorway
              </button>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
