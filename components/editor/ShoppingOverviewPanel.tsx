"use client";

import type { RoomType } from "@/lib/room-types";

export type ShoppingRoomSummary = {
  roomId: string;
  roomName: string;
  roomType: RoomType;
  itemCount: number;
  includedCount: number;
  shoppableCount: number;
  needsReviewCount: number;
  subtotal: number;
  previewNames: string[];
  isActive: boolean;
};

export type ShoppingHomeSummary = {
  itemCount: number;
  includedCount: number;
  shoppableCount: number;
  needsReviewCount: number;
  subtotal: number;
};

type ShoppingOverviewPanelProps = {
  dark?: boolean;
  activeRoom: ShoppingRoomSummary | null;
  rooms: ShoppingRoomSummary[];
  wholeHome: ShoppingHomeSummary;
  onSelectRoom: (roomId: string) => void;
  onGoFurnish: () => void;
};

function formatMoney(value: number) {
  return `$${Math.round(value)}`;
}

export default function ShoppingOverviewPanel({
  dark = false,
  activeRoom,
  rooms,
  wholeHome,
  onSelectRoom,
  onGoFurnish,
}: ShoppingOverviewPanelProps) {
  const panelClass = dark
    ? "rounded-2xl border border-white/10 bg-[#151820] p-4"
    : "rounded-2xl border border-neutral-200 bg-white p-4 shadow";
  const mutedClass = dark ? "text-neutral-400" : "text-neutral-500";
  const cardClass = dark
    ? "rounded-xl border border-white/10 bg-black/10 p-3"
    : "rounded-xl border border-neutral-200 bg-neutral-50 p-3";
  const metricClass = dark ? "rounded-lg bg-[#1b2030] p-2" : "rounded-lg bg-white p-2";
  const primaryButtonClass = dark
    ? "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200"
    : "rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800";
  const readyRooms = rooms.filter((room) => room.itemCount > 0 && room.needsReviewCount === 0);
  const reviewRooms = rooms.filter((room) => room.needsReviewCount > 0);
  const emptyRooms = rooms.filter((room) => room.itemCount === 0);
  const renderRoomButton = (room: ShoppingRoomSummary) => (
    <button
      key={room.roomId}
      type="button"
      onClick={() => onSelectRoom(room.roomId)}
      className={
        dark
          ? `w-full rounded-xl border px-3 py-2 text-left ${room.isActive ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 bg-[#151820]"}`
          : `w-full rounded-xl border px-3 py-2 text-left ${room.isActive ? "border-emerald-300 bg-emerald-50" : "border-neutral-200 bg-white"}`
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={dark ? "truncate text-sm font-semibold text-neutral-100" : "truncate text-sm font-semibold text-neutral-900"}>
            {room.roomName}
          </div>
          <div className={`truncate text-xs ${mutedClass}`}>
            {room.previewNames.length ? room.previewNames.join(", ") : "No furniture yet"}
          </div>
        </div>
        <div className={dark ? "shrink-0 text-right text-xs text-neutral-300" : "shrink-0 text-right text-xs text-neutral-600"}>
          <div>{room.itemCount} item{room.itemCount === 1 ? "" : "s"}</div>
          <div>{formatMoney(room.subtotal)}</div>
        </div>
      </div>
    </button>
  );

  return (
    <section className={panelClass} data-testid="shopping-overview-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
            Shopping overview
          </div>
          <div className={`mt-1 text-xs ${mutedClass}`}>
            Room-aware list for placed purchasable furniture.
          </div>
        </div>
        {wholeHome.itemCount > 0 && (
          <div className={dark ? "text-right text-sm font-semibold text-neutral-100" : "text-right text-sm font-semibold text-neutral-900"}>
            {formatMoney(wholeHome.subtotal)}
          </div>
        )}
      </div>

      {wholeHome.itemCount === 0 ? (
        <div className={dark ? "mt-3 rounded-xl border border-white/10 p-3 text-sm text-neutral-300" : "mt-3 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-600"}>
          <div className={dark ? "font-semibold text-neutral-100" : "font-semibold text-neutral-900"}>
            No furniture in the shopping list yet
          </div>
          <div className={`mt-1 text-xs ${mutedClass}`}>
            Add real catalog items to a room first, then this panel becomes your bill of materials.
          </div>
          <button type="button" className={`mt-3 ${primaryButtonClass}`} onClick={onGoFurnish}>
            Add furniture
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className={cardClass}>
            <div className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
              Current room
            </div>
            <div className={dark ? "mt-1 text-sm font-semibold text-neutral-100" : "mt-1 text-sm font-semibold text-neutral-900"}>
              {activeRoom?.roomName ?? "Room"}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className={metricClass}>
                <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                  {activeRoom?.itemCount ?? 0}
                </div>
                <div className={`text-[11px] ${mutedClass}`}>Items</div>
              </div>
              <div className={metricClass}>
                <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                  {activeRoom?.shoppableCount ?? 0}
                </div>
                <div className={`text-[11px] ${mutedClass}`}>Shoppable</div>
              </div>
              <div className={metricClass}>
                <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                  {formatMoney(activeRoom?.subtotal ?? 0)}
                </div>
                <div className={`text-[11px] ${mutedClass}`}>Est.</div>
              </div>
            </div>
          </div>

          <div className={dark ? "rounded-xl border border-white/10 p-3" : "rounded-xl border border-neutral-200 p-3"}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Whole home
                </div>
                <div className={dark ? "mt-1 text-sm text-neutral-200" : "mt-1 text-sm text-neutral-700"}>
                  {wholeHome.itemCount} items across {rooms.length} room{rooms.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className={dark ? "text-right text-sm font-semibold text-neutral-100" : "text-right text-sm font-semibold text-neutral-900"}>
                {formatMoney(wholeHome.subtotal)}
              </div>
            </div>
            {wholeHome.needsReviewCount > 0 && (
              <div className={dark ? "mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-100" : "mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800"}>
                {wholeHome.needsReviewCount} item{wholeHome.needsReviewCount === 1 ? "" : "s"} need commerce review before checkout.
              </div>
            )}
          </div>

          <div className="space-y-3" data-testid="shopping-room-list">
            {readyRooms.length > 0 && (
              <div data-testid="shopping-ready-rooms">
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Ready to buy
                </div>
                <div className="space-y-2">{readyRooms.map(renderRoomButton)}</div>
              </div>
            )}
            {reviewRooms.length > 0 && (
              <div data-testid="shopping-review-rooms">
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Needs review
                </div>
                <div className="space-y-2">{reviewRooms.map(renderRoomButton)}</div>
              </div>
            )}
            {emptyRooms.length > 0 && (
              <div data-testid="shopping-empty-rooms">
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Not furnished yet
                </div>
                <div className="space-y-2">{emptyRooms.map(renderRoomButton)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
