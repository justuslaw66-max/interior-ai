import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";

export function floorPlanPropertyEvidenceLabel(
  evidence: FloorPlanPropertyEvidenceV2
): string {
  if (evidence === "source_documented") return "Source documented";
  if (evidence === "user_confirmed") return "User confirmed";
  if (evidence === "site_measured") return "Site measured";
  return "Assumed";
}

export function floorPlanPropertyEvidenceIsEditable(
  evidence: FloorPlanPropertyEvidenceV2
): boolean {
  return evidence === "assumed" || evidence === "user_confirmed";
}
