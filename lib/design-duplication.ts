export type DuplicateDesignSource = {
  title: string;
  roomWidth: number;
  roomDepth: number;
  items: unknown;
  zones: unknown;
  savedViews: unknown;
  style: string | null;
  budget: string | null;
  mode: string | null;
  notes: string | null;
};

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildDuplicateTitle(title: string) {
  const trimmed = title.trim();
  return `${trimmed.length > 0 ? trimmed : "Untitled Living Room"} (copy)`;
}

export function buildDuplicatedDesignData(
  source: DuplicateDesignSource,
  userId: string
) {
  const safeItems = Array.isArray(source.items) ? deepCloneJson(source.items) : [];
  const safeZones = Array.isArray(source.zones) ? deepCloneJson(source.zones) : [];
  const safeSavedViews = Array.isArray(source.savedViews)
    ? deepCloneJson(source.savedViews)
    : [];

  return {
    user: { connect: { id: userId } },
    title: buildDuplicateTitle(source.title),
    roomWidth: Number(source.roomWidth),
    roomDepth: Number(source.roomDepth),
    items: safeItems,
    zones: safeZones,
    savedViews: safeSavedViews,
    style: source.style,
    budget: source.budget,
    mode: source.mode ?? "homeowner",
    notes: source.notes,
    shareEnabled: false,
    shareToken: null,
  };
}
