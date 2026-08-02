/** Formats persisted enum-like values for human-facing Cabinetry Studio copy. */
export function formatCabinetLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
