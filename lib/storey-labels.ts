/**
 * Storeys read "Level 1" and "Basement 1" (UX audit ED7, phase 4f). Designs save short labels
 * ("1F", "B1", "3F Copy"); they are mapped when shown and never rewritten, so saved designs and
 * share links keep what they have. A storey someone renamed ("Mezzanine") shows as it is.
 */
export function storeyDisplayLabel(label: string): string {
  const trimmed = label.trim();
  const match = /^(?:(\d+)F|B(\d+))(\s+copy)?$/i.exec(trimmed);
  if (!match) return trimmed;
  const [, upper, lower, copy] = match;
  const name = upper ? `Level ${Number(upper)}` : `Basement ${Number(lower)}`;
  return copy ? `${name} copy` : name;
}

/** The name of a storey that has no saved label: level 1 is "Level 1", level 0 "Basement 1". */
export function storeyLevelLabel(level: number): string {
  return level <= 0 ? `Basement ${Math.abs(level) + 1}` : `Level ${level}`;
}
