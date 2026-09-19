import type {
  FloorPlanDefaultsV2,
  FloorPlanOpeningV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";

type ConstructionOpeningIssue = {
  code: string;
  path: string;
  message: string;
  severity: "error";
};

function unverified(evidence: FloorPlanPropertyEvidenceV2) {
  return evidence === "assumed" || evidence === "user_confirmed";
}

function issue(path: string, property: "width" | "height" | "sill"): ConstructionOpeningIssue {
  return {
    code: "UNVERIFIED_CONSTRUCTION_PROPERTY",
    path: `${path}.${property === "sill" ? "sillHeight" : property}Evidence`,
    message: `Construction-verified opening ${property === "sill" ? "sill heights" : `${property}s`} require construction or site-measured evidence.`,
    severity: "error",
  };
}

export function buildUnverifiedConstructionOpeningIssues(
  opening: FloorPlanOpeningV2,
  defaults: FloorPlanDefaultsV2,
  path: string
): ConstructionOpeningIssue[] {
  const windowLike = opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre";
  const widthEvidence = opening.widthEvidence ?? "assumed";
  const heightEvidence = opening.heightMm === undefined
    ? (windowLike ? defaults.windowHeight.evidence : defaults.doorHeight.evidence)
    : opening.heightEvidence ?? "assumed";
  const sillEvidence = opening.sillHeightMm === undefined
    ? defaults.windowSillHeight.evidence
    : opening.sillHeightEvidence ?? "assumed";
  return [
    ...(unverified(widthEvidence) ? [issue(path, "width")] : []),
    ...(unverified(heightEvidence) ? [issue(path, "height")] : []),
    ...(windowLike && unverified(sillEvidence) ? [issue(path, "sill")] : []),
  ];
}
