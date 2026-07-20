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
const MAX_ITEMS = 2_000;
const MAX_ZONES = 500;
const MAX_SAVED_VIEWS = 50;
const MAX_NOTES_LENGTH = 20_000;

function isValidDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= 100;
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : null;
}

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
    !isValidDimension(roomWidth) ||
    !isValidDimension(roomDepth) ||
    !Array.isArray(items) ||
    items.length > MAX_ITEMS ||
    (zones !== undefined && (!Array.isArray(zones) || zones.length > MAX_ZONES)) ||
    (savedViews !== undefined && (!Array.isArray(savedViews) || savedViews.length > MAX_SAVED_VIEWS)) ||
    (notes !== undefined && notes !== null &&
      (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH))
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
      title: boundedString(title, 120) || "Untitled Living Room",
      roomWidth: canonicalActiveRoom?.roomWidth ?? Number(roomWidth),
      roomDepth: canonicalActiveRoom?.roomDepth ?? Number(roomDepth),
      items: canonicalActiveRoom?.items ?? cloneJson(items),
      zones:
        canonicalActiveRoom?.zones ?? (Array.isArray(zones) ? cloneJson(zones) : []),
      savedViews:
        canonicalActiveRoom?.savedViews ??
        (Array.isArray(savedViews) ? cloneJson(savedViews) : []),
      snapshot: safeSnapshot,
      style: boundedString(style, 80),
      budget: boundedString(budget, 20),
      mode: mode === "designer" ? "designer" : "homeowner",
      notes: typeof notes === "string" ? notes.trim() : null,
    },
  };
}

export function parseDesignClaimPayload(body: unknown): DesignPayloadResult<ParsedDesignClaimPayload> {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const anonymousId = typeof payload.anonymousId === "string" ? payload.anonymousId.trim() : "";
  const designSnapshot = payload.designSnapshot;

  if (
    !anonymousId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(anonymousId) ||
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
  if (title !== undefined) {
    const safeTitle = boundedString(title, 120);
    if (!safeTitle) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.title = safeTitle;
  }
  if (roomWidth !== undefined) {
    if (!isValidDimension(roomWidth)) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.roomWidth = roomWidth;
  }
  if (roomDepth !== undefined) {
    if (!isValidDimension(roomDepth)) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.roomDepth = roomDepth;
  }
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length > MAX_ITEMS) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.items = cloneJson(items);
  }
  if (zones !== undefined) {
    if (!Array.isArray(zones) || zones.length > MAX_ZONES) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.zones = cloneJson(zones);
  }
  if (savedViews !== undefined) {
    if (!Array.isArray(savedViews) || savedViews.length > MAX_SAVED_VIEWS) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.savedViews = cloneJson(savedViews);
  }
  if (snapshot !== undefined && snapshot !== null) {
    const safeSnapshot = sanitizeStoredDesign(snapshot);
    if (!safeSnapshot) {
      return { ok: false, error: INVALID_SNAPSHOT_ERROR, status: 400 };
    }
    updateData.snapshot = safeSnapshot;
    Object.assign(updateData, buildCanonicalActiveRoomFields(safeSnapshot));
  }
  if (style !== undefined) {
    const safeStyle = boundedString(style, 80);
    if (!safeStyle) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.style = safeStyle;
  }
  if (budget !== undefined) {
    const safeBudget = boundedString(budget, 20);
    if (!safeBudget) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.budget = safeBudget;
  }
  if (mode !== undefined) {
    if (mode !== "homeowner" && mode !== "designer") return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.mode = mode;
  }
  if (notes !== undefined) {
    if (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH) return { ok: false, error: INVALID_BASE_PAYLOAD_ERROR, status: 400 };
    updateData.notes = notes.trim();
  }

  return { ok: true, value: updateData };
}
