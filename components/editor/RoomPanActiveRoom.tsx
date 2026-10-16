import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";

/** A room's name and product count, as the room navigator's tooltips and header say it. */
export function describeNavigatorRoom(name: string, productCount: number) {
  return productCount > 0 ? `${name} · ${productCount} product${productCount === 1 ? "" : "s"}` : name;
}

type RoomPanActiveRoomProps = {
  room: HousePlanRoom2D | undefined;
  productCount: number;
};

/**
 * The room navigator's header names the selected room and counts its products at 12px. The map's
 * room boxes are too small for 12px names, so they name their rooms in tooltips only (J, 12 Oct).
 */
export default function RoomPanActiveRoom({ room, productCount }: RoomPanActiveRoomProps) {
  if (!room) return <span className="text-neutral-600">Rooms</span>;
  return (
    <span
      data-testid="room-pan-active-room"
      className="flex min-w-0 items-center gap-1.5 text-neutral-700"
      title={describeNavigatorRoom(room.name, productCount)}
    >
      <span className="truncate">{room.name}</span>
      {productCount > 0 ? (
        <span className="shrink-0 rounded-full bg-neutral-700 px-1.5 text-white">
          {productCount}
          <span className="sr-only"> product{productCount === 1 ? "" : "s"}</span>
        </span>
      ) : null}
    </span>
  );
}
