"use client";

/** The room card's one badge (audit finding FR2). */
export type RoomSetupStatus = "draft" | "ready" | "none";

const LABELS: Record<RoomSetupStatus, string> = {
  // The first visit's room, untouched: its size is the default, not the person's room.
  draft: "Default size",
  ready: "Room ready",
  none: "Needs a room",
};

const READY_CLASS = "rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint";
const TODO_CLASS = "rounded-full bg-warning-tint px-2 py-1 text-xs font-semibold text-on-warning-tint";

export function roomSetupStatus(hasRooms: boolean, roomIsDraft: boolean): RoomSetupStatus {
  if (!hasRooms) return "none";
  return roomIsDraft ? "draft" : "ready";
}

export function RoomSetupStatusBadge({ status }: { status: RoomSetupStatus }) {
  const ready = status === "ready";
  const className = ready ? READY_CLASS : TODO_CLASS;
  return (
    <span data-testid="room-setup-status" data-status={status} className={className}>
      {LABELS[status]}
    </span>
  );
}
