import { PublicShareRoomSchedule } from "@/components/public-share/PublicShareRoomSchedule";
import type { SharePageRoom } from "@/lib/public-share-page-model";
import { ShareExportPackLink } from "./ShareExportPackLink";

/** The rooms: name, size, products and subtotal, with the plans and schedules beside them (SX7). */
export function ShareRoomsSection({ shareToken, rooms }: { shareToken: string; rooms: readonly SharePageRoom[] }) {
  return (
    <section className="border-t bg-white" aria-labelledby="share-rooms-heading">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="share-rooms-heading" className="text-lg font-semibold text-neutral-950">
            Rooms
          </h2>
          <ShareExportPackLink shareToken={shareToken} />
        </div>
        <PublicShareRoomSchedule rooms={rooms} />
      </div>
    </section>
  );
}
