import { sanitizeStoredDesign, type StoredDesign } from "@/lib/room-persistence";

export type DesignPayloadResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: 400 };

export type ParsedDesignCreatePayload = {
  title: string;
  roomWidth: number;
  roomDepth: number;
  items: unknown;
  zones: unknown;
  savedViews: unknown;
  snapshot: StoredDesign | null;
  style: string | null;
  budget: string | null;
  mode: string;
  notes: string | null;
};

export type ParsedDesignClaimPayload = {
  anonymousId: string;
  roomType: unknown;
  itemsCount: unknown;
  design: ParsedDesignCreatePayload;
};

const INVALID_BASE_PAYLOAD_ERROR =
  "Invalid payload: roomWidth and roomDepth must be numbers, items must be array";
const INVALID_SNAPSHOT_ERROR = "Invalid payload: snapshot must be a v3 design snapshot";
const INVALID_CLAIM_PAYLOAD_ERROR = "Invalid claim payload";

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function getStoredActiveRoom(snapshot: StoredDesign) {
  return snapshot.rooms.find((room) => room.id === snapshot.activeRoomId) ?? snapshot.rooms[0];
}

function buildCanonicalActiveRoomFields(snapshot: StoredDesign) {
  const activeRoom = getStoredActiveRoom(snapshot);
  return {
    roomWidth: activeRoom.geometry.width,
    roomDepth: activeRoom.geometry.depth,
    items: cloneJson(activeRoom.items),
    zones: cloneJson(activeRoom.zones),
    savedViews: cloneJson(activeRoom.savedViews),
  };
}

export function parseDesignCreatePayload(body: unknown): DesignPayloadResult<ParsedDesignCreatePayload> {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const {
    title,
    roomWidth,
    roomDepth,
    items,
    zones,
    savedViews,
    snapshot,
    style,
    budget,
    mode,
    notes,
  } = payload;

  if (
    typeof roomWidth !== "number" ||
    typeof roomDepth !== "number" ||
    !Array.isArray(items)
  ) {
    return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
  }

  const safeSnapshot =
    snapshot === undefined || snapshot === null ? null : sanitizeStoredDesign(snapshot);
  if (snapshot !== undefined && snapshot !== null && !safeSnapshot) {
    return { ok: false, error: INVALID_SNAPSHOT_ERROR, status: 400 };
  }
  const canonicalActiveRoom = safeSnapshot ? buildCanonicalActiveRoomFields(safeSnapshot) : null;

  return {
    ok: true,
    value: {
      title: typeof title === "string" ? title : "Untitled Living Room",
      roomWidth: canonicalActiveRoom?.roomWidth ?? Number(roomWidth),
      roomDepth: canonicalActiveRoom?.roomDepth ?? Number(roomDepth),
      items: canonicalActiveRoom?.items ?? cloneJson(items),
      zones:
        canonicalActiveRoom?.zones ?? (Array.isArray(zones) ? cloneJson(zones) : []),
      savedViews:
        canonicalActiveRoom?.savedViews ??
        (Array.isArray(savedViews) ? cloneJson(savedViews) : []),
      snapshot: safeSnapshot,
      style: typeof style === "string" ? style : null,
      budget: typeof budget === "string" ? budget : null,
      mode: typeof mode === "string" ? mode : "homeowner",
      notes: typeof notes === "string" ? notes : null,
    },
  };
}

export function parseDesignClaimPayload(body: unknown): DesignPayloadResult<ParsedDesignClaimPayload> {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const anonymousId = typeof payload.anonymousId === "string" ? payload.anonymousId.trim() : "";
  const designSnapshot = payload.designSnapshot;

  if (
    !anonymousId ||
    anonymousId.length > 64 ||
    !designSnapshot ||
    typeof designSnapshot !== "object" ||
    Array.isArray(designSnapshot)
  ) {
    return { ok: false, error: INVALID_CLAIM_PAYLOAD_ERROR, status: 400 };
  }

  const parsedDesign = parseDesignCreatePayload(designSnapshot);
  if (!parsedDesign.ok) {
    return parsedDesign;
  }

  return {
    ok: true,
    value: {
      anonymousId,
      roomType: payload.roomType,
      itemsCount: payload.itemsCount,
      design: parsedDesign.value,
    },
  };
}

export function buildDesignUpdatePayload(body: unknown): DesignPayloadResult<Record<string, unknown>> {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const {
    title,
    roomWidth,
    roomDepth,
    items,
    zones,
    savedViews,
    snapshot,
    style,
    budget,
    mode,
    notes,
  } = payload;

  const updateData: Record<string, unknown> = {};
  if (typeof title === "string") updateData.title = title;
  if (typeof roomWidth === "number") updateData.roomWidth = Number(roomWidth);
  if (typeof roomDepth === "number") updateData.roomDepth = Number(roomDepth);
  if (Array.isArray(items)) updateData.items = cloneJson(items);
  if (Array.isArray(zones)) updateData.zones = cloneJson(zones);
  if (Array.isArray(savedViews)) updateData.savedViews = cloneJson(savedViews);
  if (snapshot !== undefined && snapshot !== null) {
    const safeSnapshot = sanitizeStoredDesign(snapshot);
    if (!safeSnapshot) {
      return { ok: false, error: INVALID_SNAPSHOT_ERROR, status: 400 };
    }
    updateData.snapshot = safeSnapshot;
    Object.assign(updateData, buildCanonicalActiveRoomFields(safeSnapshot));
  }
  if (typeof style === "string") updateData.style = style;
  if (typeof budget === "string") updateData.budget = budget;
  if (typeof mode === "string") updateData.mode = mode;
  if (typeof notes === "string") updateData.notes = notes;

  return { ok: true, value: updateData };
}
