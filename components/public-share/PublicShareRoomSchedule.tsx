"use client";

import { usePublicShareLayout } from "@/components/public-share/PublicShareShell";

export type PublicShareRoomScheduleItem = {
  id: string;
  name: string;
  floorLabel: string;
  roomType: string;
  dimensionsLabel: string;
  areaLabel: string;
  itemCount: number;
  shoppableCount: number;
  subtotal: number;
  healthLabel: "Ready" | "Review" | "Blocked";
  healthScore: number;
  healthNextAction: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function healthClass(label: PublicShareRoomScheduleItem["healthLabel"]) {
  if (label === "Ready") return "font-semibold text-emerald-700";
  if (label === "Review") return "font-semibold text-amber-700";
  return "font-semibold text-red-700";
}

function MobileRoomCards({ rooms }: { rooms: readonly PublicShareRoomScheduleItem[] }) {
  return (
    <div className="grid gap-2" data-testid="share-room-list-mobile">
      {rooms.map((room) => (
        <article key={room.id} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="break-words font-semibold text-neutral-950">{room.name}</div>
              <div className="text-xs text-neutral-500">
                {room.floorLabel} · {room.roomType}
              </div>
            </div>
            <div className="shrink-0 text-right font-semibold text-neutral-950">
              {formatCurrency(room.subtotal)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-neutral-700">
            <div>
              <div>{room.dimensionsLabel}</div>
              <div className="text-xs text-neutral-500">{room.areaLabel}</div>
            </div>
            <div>
              {room.itemCount} item{room.itemCount === 1 ? "" : "s"}
              <div className="text-xs text-neutral-500">{room.shoppableCount} shoppable</div>
            </div>
          </div>
          <div className="mt-3 border-t border-neutral-100 pt-2">
            <div className={healthClass(room.healthLabel)}>
              {room.healthLabel} {room.healthScore}
            </div>
            <div className="mt-0.5 break-words text-xs text-neutral-500">
              {room.healthNextAction}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function RoomTable({ rooms }: { rooms: readonly PublicShareRoomScheduleItem[] }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-neutral-200" data-testid="share-room-list-table">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2">Room</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2">Items</th>
            <th className="px-3 py-2">Health</th>
            <th className="px-3 py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 bg-white">
          {rooms.map((room) => (
            <tr key={room.id}>
              <td className="px-3 py-3">
                <div className="font-semibold text-neutral-950">{room.name}</div>
                <div className="text-xs text-neutral-500">{room.floorLabel}</div>
              </td>
              <td className="px-3 py-3 text-neutral-700">{room.roomType}</td>
              <td className="px-3 py-3 text-neutral-700">
                <div>{room.dimensionsLabel}</div>
                <div className="text-xs text-neutral-500">{room.areaLabel}</div>
              </td>
              <td className="px-3 py-3 text-neutral-700">
                {room.itemCount} item{room.itemCount === 1 ? "" : "s"}
                <div className="text-xs text-neutral-500">{room.shoppableCount} shoppable</div>
              </td>
              <td className="px-3 py-3">
                <div className={healthClass(room.healthLabel)}>
                  {room.healthLabel} {room.healthScore}
                </div>
                <div className="max-w-52 truncate text-xs text-neutral-500" title={room.healthNextAction}>
                  {room.healthNextAction}
                </div>
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                {formatCurrency(room.subtotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PublicShareRoomSchedule({
  rooms,
}: {
  rooms: readonly PublicShareRoomScheduleItem[];
}) {
  const { layoutMode } = usePublicShareLayout();
  return (
    <div className="mt-4" data-testid="share-room-list">
      <div data-testid="share-room-health">
        {layoutMode === "mobile" ? <MobileRoomCards rooms={rooms} /> : null}
        {layoutMode === "tablet" || layoutMode === "desktop" ? (
          <RoomTable rooms={rooms} />
        ) : null}
      </div>
    </div>
  );
}
