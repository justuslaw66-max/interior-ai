/**
 * Status copy for the consumer room-setup card and Plan palette. Openings load
 * with the plan settings, so until then the copy says it is checking instead
 * of claiming the room has no doors or windows.
 */
export function roomSetupOpeningStatus({
  hasConnectionBlockers,
  planSettingsReady,
  openingCount,
}: {
  hasConnectionBlockers: boolean;
  planSettingsReady: boolean;
  openingCount: number;
}): string {
  if (hasConnectionBlockers) return "A connected room still needs a doorway. Add one before furnishing.";
  if (!planSettingsReady) return "Checking doors and windows…";
  if (openingCount > 0) return `${openingCount} door/window opening${openingCount === 1 ? "" : "s"} placed.`;
  return "No doors or windows placed yet. Add only the openings that affect fit.";
}

export function planPaletteOpeningSummary(planSettingsReady: boolean, openingCount: number): string {
  if (!planSettingsReady) return "";
  return openingCount > 0 ? `${openingCount} openings placed.` : "Openings optional.";
}
