import type { SemanticDimensionLabel } from "./deterministic-evidence";

/** Preserve number provenance and separately identify supplemental endpoint hints. Different numbers are never duplicates. */
export function mergeDimensionLabels(preferred: SemanticDimensionLabel[], supplemental: SemanticDimensionLabel[]) {
  const result = preferred.map((label) => ({ ...label }));
  for (const candidate of supplemental) {
    const existing = result.find((label) => label.valueMm === candidate.valueMm &&
      (label.orientation === candidate.orientation || label.orientation === "unknown" || candidate.orientation === "unknown") &&
      Math.hypot(label.centerXRatio - candidate.centerXRatio, label.centerYRatio - candidate.centerYRatio) <= 0.04);
    if (!existing) { result.push({ ...candidate }); continue; }
    if (!existing.extensionStart && !existing.extensionEnd && candidate.extensionStart && candidate.extensionEnd) {
      existing.extensionStart = candidate.extensionStart;
      existing.extensionEnd = candidate.extensionEnd;
      existing.extensionEvidenceKind = candidate.extensionEvidenceKind ?? candidate.evidenceKind;
    }
  }
  return result;
}
