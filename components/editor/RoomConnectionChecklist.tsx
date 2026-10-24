"use client";

import type {
  HouseRoomConnectionChecklistItem,
  HouseRoomDoorwaySuggestion,
} from "@/lib/design-page-house-plan";
import { formatDisplayLength, type DisplayUnit } from "@/lib/display-units";
import { Button } from "@/components/ui/Button";

type RoomConnectionChecklistProps = {
  items: HouseRoomConnectionChecklistItem[];
  measurementUnit: DisplayUnit;
  disabled?: boolean;
  variant?: "pro" | "consumer";
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onAddDoorway: (suggestion: HouseRoomDoorwaySuggestion) => void;
};

const STATUS_LABELS: Record<HouseRoomConnectionChecklistItem["status"], string> = {
  connected: "Connected",
  reachable: "Reached through other rooms",
  needs_doorway: "Needs a door",
  detached: "Detached",
  disconnected_group: "Disconnected",
};

export default function RoomConnectionChecklist({
  items,
  measurementUnit,
  disabled = false,
  variant = "consumer",
  collapsed = false,
  onCollapsedChange,
  onAddDoorway,
}: RoomConnectionChecklistProps) {
  if (items.length === 0) return null;

  const shellClass = "rounded-xl border border-box-border bg-field p-3";
  const titleClass = "text-sm font-semibold text-label";
  const rowClass = "rounded-lg border border-box-border bg-tile p-2";
  const labelClass = "text-xs font-semibold text-control-label";
  const metaClass = "text-xs text-label-secondary";
  const connectedClass = "rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint";
  const needsClass = "rounded-full bg-warning-tint px-2 py-1 text-xs font-semibold text-on-warning-tint";
  const reviewClass = "rounded-full bg-warning-tint px-2 py-1 text-xs font-semibold text-on-warning-tint";
  const getStatusClass = (status: HouseRoomConnectionChecklistItem["status"]) => {
    if (status === "connected" || status === "reachable") return connectedClass;
    if (status === "needs_doorway") return needsClass;
    return reviewClass;
  };
  const getItemLabel = (item: HouseRoomConnectionChecklistItem) => {
    if (item.status === "detached") return item.roomNames[0] ?? "Room";
    if (item.status === "disconnected_group") return item.roomNames.join(", ");
    return `${item.roomNames[0]} - ${item.roomNames[1]}`;
  };
  const getItemMeta = (item: HouseRoomConnectionChecklistItem) => {
    if (item.status === "detached") return "No shared wall on this floor";
    if (item.status === "disconnected_group") return "Separate connected group on this floor";
    return `${formatDisplayLength(item.sharedWallLengthMeters * 1000, measurementUnit)} shared wall`;
  };

  return (
    <div data-testid="room-connection-checklist" data-variant={variant} className={shellClass}>
      <div className="flex items-center justify-between gap-2">
        <div className={titleClass}>Connections</div>
        {onCollapsedChange ? (
          <Button
            variant="secondary" size="compact"
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? "Expand" : "Collapse"}
          </Button>
        ) : null}
      </div>
      {collapsed ? null : (
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.id} data-testid="room-connection-row" className={rowClass}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={labelClass}>
                  {getItemLabel(item)}
                </div>
                <div className={metaClass}>{getItemMeta(item)}</div>
              </div>
              <div
                data-testid="room-connection-status"
                className={getStatusClass(item.status)}
              >
                {STATUS_LABELS[item.status]}
              </div>
            </div>
            {item.status === "needs_doorway" && item.doorwaySuggestion && (
              <Button
                data-testid="room-connection-add-doorway"
                variant="primary" size="compact" className="mt-2"
                disabled={disabled}
                onClick={() => onAddDoorway(item.doorwaySuggestion!)}
              >
                Add connecting door
              </Button>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
