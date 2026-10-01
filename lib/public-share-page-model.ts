import { formatSgd } from "@/lib/money-format";
import { getRoomSnapshotFloorAreaSqm } from "@/lib/room-floor-area";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import {
  buildCheckoutReadinessRows,
  buildShareCheckoutLines,
  type ShareCheckoutLine,
} from "@/lib/share-shopping-csv";
import { buildShoppingList, productCountLabel, type ShoppingList } from "@/lib/shopping-list";

/**
 * What a shared design's page shows (UX audit SX7, phase 4e): its rooms, its Shopping list grouped
 * by shop as the editor's Shop shows it, and a one-line summary. No readiness, health or handoff
 * wording: the page is for the person the design was shared with.
 */

export type SharePageRoom = {
  id: string;
  name: string;
  /** The storey, only when the design has more than one. */
  floorLabel: string | null;
  sizeLabel: string;
  areaLabel: string;
  productCount: number;
  /** "3 products", worked out here so the client table needn't import the catalogue. */
  productLabel: string;
  subtotal: number;
};

export type SharePageModel = {
  rooms: SharePageRoom[];
  shopping: ShoppingList;
  /** Products bought here, through Shopify, for the Checkout here button. */
  checkoutLines: ShareCheckoutLine[];
  /** "3 rooms · 12 products · S$4,210". */
  summary: string;
};

function formatMeters(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function countLabel(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function floorLabelFor(room: RoomSnapshot) {
  return room.floorLabel ?? `Floor ${room.floorLevel ?? 1}`;
}

export function buildSharePageRooms(rooms: readonly RoomSnapshot[], shopping: ShoppingList): SharePageRoom[] {
  const multiFloor = new Set(rooms.map(floorLabelFor)).size > 1;
  const lines = [
    ...shopping.retailers.flatMap((retailer) => retailer.lines),
    ...(shopping.checkoutHere?.lines ?? []),
    ...shopping.unavailable,
  ];
  return rooms.map((room) => {
    const roomLines = lines.filter((line) => line.roomId === room.id);
    return {
      id: room.id,
      name: room.name,
      floorLabel: multiFloor ? floorLabelFor(room) : null,
      sizeLabel: `${formatMeters(room.geometry.width)} × ${formatMeters(room.geometry.depth)} m`,
      areaLabel: `${Math.round(getRoomSnapshotFloorAreaSqm(room))} m²`,
      productCount: roomLines.length,
      productLabel: productCountLabel(roomLines.length),
      subtotal: roomLines.reduce((sum, line) => sum + line.price, 0),
    };
  });
}

export function sharePageSummary(roomCount: number, shopping: ShoppingList) {
  const parts = [countLabel(roomCount, "room", "rooms"), productCountLabel(shopping.productCount)];
  if (shopping.total > 0) parts.push(formatSgd(shopping.total));
  return parts.join(" · ");
}

export function buildSharePageModel(snapshot: DesignSnapshot, style: string | null | undefined): SharePageModel {
  const shopping = buildShoppingList({ rooms: snapshot.rooms, style: style ?? "" });
  return {
    rooms: buildSharePageRooms(snapshot.rooms, shopping),
    shopping,
    checkoutLines: buildShareCheckoutLines(buildCheckoutReadinessRows(snapshot.rooms)),
    summary: sharePageSummary(snapshot.rooms.length, shopping),
  };
}
