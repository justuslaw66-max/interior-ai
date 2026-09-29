"use client";

type AiLayoutRoomLimitProps = {
  roomName: string;
  /** "Bedroom · 4 × 3.6 m · 14.4 m²" */
  roomSummary: string;
};

/**
 * Suggest a layout in a room it can't lay out yet (audit finding ST14): the limit comes first, and
 * no brief to fill in.
 */
export function AiLayoutRoomLimit({ roomName, roomSummary }: AiLayoutRoomLimitProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4" data-testid="ai-layout-room-limit">
      <div className="text-sm font-semibold text-neutral-900">Suggest a layout works in living rooms for now</div>
      <p className="mt-1 text-xs text-neutral-600">
        Choose a living room in Plan to get a suggested layout. You can still add products to the {roomName} from Furnish.
      </p>
      <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
        <div className="truncate text-sm font-semibold text-neutral-900">{roomName}</div>
        <div className="mt-0.5 text-xs text-neutral-600">{roomSummary}</div>
      </div>
    </div>
  );
}
