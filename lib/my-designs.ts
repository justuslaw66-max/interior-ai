import { resolveDesignTitle } from "@/lib/design-title";
import { buildDesignPlanThumbnail } from "@/lib/plan-thumbnail";
import type { DesignPlanThumbnail } from "@/lib/plan-thumbnail-frame";
import { legacyApiToSnapshot } from "@/lib/room-persistence";

// My designs (audit findings MD1 and MD3): what each card shows.

/** The saved-design columns My designs reads. */
export type MyDesignRow = {
  id: string;
  title: string;
  updatedAt: Date;
  shareEnabled: boolean;
  roomWidth: number;
  roomDepth: number;
  items: unknown;
  snapshot: unknown;
};

export type MyDesignCard = {
  id: string;
  title: string;
  editedLabel: string;
  shared: boolean;
  thumbnail: DesignPlanThumbnail | null;
};

/** Edit dates read in Singapore time, where the catalogue, its prices and its homes are. */
export const MY_DESIGNS_TIME_ZONE = "Asia/Singapore";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function calendarDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date);
  const part = (type: "year" | "month" | "day") => Number(parts.find((entry) => entry.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** "Edited today", "Edited yesterday", "Edited 21 Sep", or "Edited 21 Sep 2025" in another year. */
export function formatEditedLabel(updatedAt: Date, now: Date, timeZone = MY_DESIGNS_TIME_ZONE) {
  const edited = calendarDate(updatedAt, timeZone);
  const today = calendarDate(now, timeZone);
  const yesterday = calendarDate(new Date(now.getTime() - DAY_MS), timeZone);
  const same = (left: typeof edited, right: typeof edited) =>
    left.year === right.year && left.month === right.month && left.day === right.day;
  if (same(edited, today)) return "Edited today";
  if (same(edited, yesterday)) return "Edited yesterday";
  const date = `${edited.day} ${MONTHS[edited.month - 1]}`;
  return edited.year === today.year ? `Edited ${date}` : `Edited ${date} ${edited.year}`;
}

function designThumbnail(row: MyDesignRow) {
  try {
    const snapshot = legacyApiToSnapshot({
      id: row.id,
      title: row.title,
      roomWidth: row.roomWidth,
      roomDepth: row.roomDepth,
      items: Array.isArray(row.items) ? row.items : [],
      snapshot: row.snapshot,
    });
    return buildDesignPlanThumbnail(snapshot);
  } catch {
    // A design that can't be read still gets a card; it just has no drawing.
    return null;
  }
}

export function buildMyDesignCard(row: MyDesignRow, now: Date): MyDesignCard {
  return {
    id: row.id,
    title: resolveDesignTitle(row.title),
    editedLabel: formatEditedLabel(row.updatedAt, now),
    shared: row.shareEnabled,
    thumbnail: designThumbnail(row),
  };
}
