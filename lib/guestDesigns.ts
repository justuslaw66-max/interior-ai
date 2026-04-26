import { getAnonId } from "./anon";

const LEGACY_GUEST_ID_KEY = "interior_ai_guest_id";
const LEGACY_GUEST_DESIGNS_KEY = (guestId: string) =>
  `interior_ai_guest_designs_${guestId}`;
const GUEST_DESIGNS_KEY = "guest_designs_v1";

export type GuestDesign = {
  localId: string;
  updatedAt: number;
  roomType: "living_room";
  itemsCount: number;
  snapshot: {
    title: string;
    roomWidth: number;
    roomDepth: number;
    items: unknown[];
    style?: string | null;
    budget?: string | null;
    mode?: string | null;
    notes?: string | null;
  };
  anonymousId: string;
  dbDesignId?: string;
};

function migrateLegacyDesigns() {
  const legacyId = localStorage.getItem(LEGACY_GUEST_ID_KEY);
  if (!legacyId) return;
  const raw = localStorage.getItem(LEGACY_GUEST_DESIGNS_KEY(legacyId));
  if (!raw) return;

  try {
    const list = JSON.parse(raw) as Array<{
      id: string;
      title: string;
      roomWidth: number;
      roomDepth: number;
      items: unknown[];
      style?: string | null;
      budget?: string | null;
      mode?: string | null;
      updatedAt: number;
    }>;

    if (!Array.isArray(list) || list.length === 0) return;

    const anonId = getAnonId();
    const migrated: GuestDesign[] = list.map((d) => ({
      localId: d.id,
      updatedAt: d.updatedAt,
      roomType: "living_room",
      itemsCount: Array.isArray(d.items) ? d.items.length : 0,
      snapshot: {
        title: d.title ?? "Guest Design",
        roomWidth: Number(d.roomWidth) || 4.2,
        roomDepth: Number(d.roomDepth) || 4.2,
        items: Array.isArray(d.items) ? d.items : [],
        style: typeof d.style === "string" ? d.style : null,
        budget: typeof d.budget === "string" ? d.budget : null,
        mode: typeof d.mode === "string" ? d.mode : null,
      },
      anonymousId: anonId,
    }));

    localStorage.setItem(GUEST_DESIGNS_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_GUEST_DESIGNS_KEY(legacyId));
  } catch {
    // ignore migration issues
  }
}

export function loadGuestDesigns(): GuestDesign[] {
  if (typeof window === "undefined") return [];
  migrateLegacyDesigns();
  const raw = localStorage.getItem(GUEST_DESIGNS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as GuestDesign[];
  } catch {
    return [];
  }
}

export function saveGuestDesign(d: Omit<GuestDesign, "anonymousId">) {
  if (typeof window === "undefined") return;
  const anonId = getAnonId();
  const list = loadGuestDesigns();
  const next: GuestDesign = { ...d, anonymousId: anonId };
  const merged = [next, ...list.filter((x) => x.localId !== d.localId)].slice(0, 50);
  localStorage.setItem(GUEST_DESIGNS_KEY, JSON.stringify(merged));
}

export function markGuestDesignClaimed(localId: string, dbDesignId: string) {
  if (typeof window === "undefined") return;
  const list = loadGuestDesigns();
  const next = list.map((d) =>
    d.localId === localId ? { ...d, dbDesignId } : d
  );
  localStorage.setItem(GUEST_DESIGNS_KEY, JSON.stringify(next));
}

export function clearGuestDesigns() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GUEST_DESIGNS_KEY);
}
