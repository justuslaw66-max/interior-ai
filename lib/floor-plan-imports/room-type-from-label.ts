import type { PageSemanticEvidence } from "./deterministic-evidence";

/** The kind of room a printed name says it is, or null where the name does not say. */
export function roomTypeFromLabel(label: string): PageSemanticEvidence["roomLabels"][number]["roomType"] | null {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return null;
  if (/bed|master|main room/.test(normalized)) return "bedroom";
  if (/kitchen/.test(normalized)) return "kitchen";
  if (/bath|wc|toilet/.test(normalized)) return "toilet";
  if (/service yard|utility/.test(normalized)) return "service_yard";
  if (/shelter|store/.test(normalized)) return "shelter";
  if (/study/.test(normalized)) return "study";
  if (/living/.test(normalized)) return "living";
  if (/dining/.test(normalized)) return "dining";
  return null;
}
