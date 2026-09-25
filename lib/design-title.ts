import type { DesignSnapshot } from "@/lib/room-types";

/** A design's name until someone renames it. Guest designs already used it. */
export const DEFAULT_DESIGN_TITLE = "My Living Room";
/** The designs API keeps titles to 120 characters. */
export const DESIGN_TITLE_MAX_LENGTH = 120;

/** A typed or stored name, trimmed to what the API keeps; empty when there is none. */
export function cleanDesignTitle(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, DESIGN_TITLE_MAX_LENGTH).trim() : "";
}

/**
 * The design's name as the bar shows it. Every cloud write sends the same name, so the design
 * row, which My designs lists, always matches the editor.
 */
export function resolveDesignTitle(title: unknown) {
  return cleanDesignTitle(title) || DEFAULT_DESIGN_TITLE;
}

/**
 * A cloud design opens under its row's title, the one My designs lists. Copies get a new row
 * title ("… (copy)") while their snapshot keeps the original's, and older designs have none in
 * the snapshot at all.
 */
export function withCloudDesignTitle(snapshot: DesignSnapshot, rowTitle: unknown): DesignSnapshot {
  const title = cleanDesignTitle(rowTitle);
  return title && title !== snapshot.title ? { ...snapshot, title } : snapshot;
}

/** A new design starts without the name of the design it replaced. */
export function withoutDesignTitle(snapshot: DesignSnapshot): DesignSnapshot {
  if (snapshot.title === undefined) return snapshot;
  const next = { ...snapshot };
  delete next.title;
  return next;
}
