"use client";

type ProgressChip = { label: string; ready: boolean };

/**
 * The doors-and-windows chip. Once there are openings and nothing needs a door, it names what it
 * counts: beside "3 items" a bare "2 placed" read as two of the three items placed (J's browser
 * check, 13 Nov 2026). Otherwise it shows the step's own status ("Needs a door", "Optional").
 */
export function openingsProgressChip({ hasOpenings, hasConnectionBlockers, openingCount, statusLabel }: {
  hasOpenings: boolean;
  hasConnectionBlockers: boolean;
  openingCount: number;
  statusLabel: string;
}): ProgressChip {
  const ready = hasOpenings || !hasConnectionBlockers;
  if (!hasOpenings || hasConnectionBlockers) return { label: statusLabel, ready };
  return { label: openingCount === 1 ? "1 door or window" : `${openingCount} doors & windows`, ready };
}

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
