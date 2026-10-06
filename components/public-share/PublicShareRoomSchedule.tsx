"use client";

import { usePublicShareLayout } from "@/components/public-share/PublicShareShell";
import { formatSgd } from "@/lib/money-format";
import type { SharePageRoom } from "@/lib/public-share-page-model";

/**
 * The shared design's rooms (UX audit SX7): name, size, products and subtotal. Cards on phones, a
 * table from tablets; the layout mode comes from the share shell, so both never render at once.
 */

function RoomName({ room }: { room: SharePageRoom }) {
  return (
    <>
      <div className="break-words font-semibold text-neutral-950">{room.name}</div>
      {room.floorLabel ? <div className="text-xs text-neutral-500">{room.floorLabel}</div> : null}
    </>
  );
}

function MobileRoomCards({ rooms }: { rooms: readonly SharePageRoom[] }) {
  return (
    <div className="grid gap-2" data-testid="share-room-list-mobile">
      {rooms.map((room) => (
        <article key={room.id} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <RoomName room={room} />
            </div>
            <div className="shrink-0 text-right font-semibold text-neutral-950">{formatSgd(room.subtotal)}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 text-neutral-700">
            <span>{room.sizeLabel}</span>
            <span className="text-neutral-500">{room.areaLabel}</span>
            <span>{room.productLabel}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function RoomTable({ rooms }: { rooms: readonly SharePageRoom[] }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-neutral-200" data-testid="share-room-list-table">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50 text-left text-xs font-semibold text-neutral-600">
          <tr>
            <th scope="col" className="px-3 py-2">Room</th>
            <th scope="col" className="px-3 py-2">Size</th>
            <th scope="col" className="px-3 py-2">Products</th>
            <th scope="col" className="px-3 py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 bg-white">
          {rooms.map((room) => (
            <tr key={room.id}>
              <td className="px-3 py-3">
                <RoomName room={room} />
              </td>
              <td className="px-3 py-3 text-neutral-700">
                <div>{room.sizeLabel}</div>
                <div className="text-xs text-neutral-500">{room.areaLabel}</div>
              </td>
              <td className="px-3 py-3 text-neutral-700">{room.productLabel}</td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-950">{formatSgd(room.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PublicShareRoomSchedule({ rooms }: { rooms: readonly SharePageRoom[] }) {
  const { layoutMode } = usePublicShareLayout();
  return (
    <div className="mt-4" data-testid="share-room-list">
      {layoutMode === "mobile" ? <MobileRoomCards rooms={rooms} /> : null}
      {layoutMode === "tablet" || layoutMode === "desktop" ? <RoomTable rooms={rooms} /> : null}
    </div>
  );
}
