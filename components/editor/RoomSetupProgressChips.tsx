"use client";

type ProgressChip = { label: string; ready: boolean };

type RoomSetupProgressChipsProps = {
  /** The first visit's room, untouched: the card's one badge says so, and these chips wait. */
  roomIsDraft: boolean;
  hasRooms: boolean;
  furniture: ProgressChip;
  openings: ProgressChip;
  readyClass: string;
  todoClass: string;
};

/**
 * Room setup's progress under its heading: products, then doors and windows. For the first visit's
 * untouched room they would say "Not started" next to a room that isn't set up yet (audit finding
 * FR2), so they show once the room is the person's.
 */
export function RoomSetupProgressChips({
  roomIsDraft,
  hasRooms,
  furniture,
  openings,
  readyClass,
  todoClass,
}: RoomSetupProgressChipsProps) {
  if (roomIsDraft) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span data-testid="room-setup-step-furnish-meta" className={furniture.ready ? readyClass : todoClass}>
        {furniture.label}
      </span>
      {hasRooms ? (
        <span className={openings.ready ? readyClass : todoClass}>
          {openings.label}
        </span>
      ) : null}
    </div>
  );
}
