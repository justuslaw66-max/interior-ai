import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanTopologyMutationContextV2, FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutation-types";
import { demoteTopologyProvenance } from "@/lib/floor-plan-topology-mutation-support";

/** Scoped private-design proposal. Reference correction / Pro override policies remain intact. */
export function forkOpeningEvidenceForProposal(document: FloorPlanDocumentV2, operation: FloorPlanTopologyMutationV2, context: FloorPlanTopologyMutationContextV2) {
  if (operation.kind !== "update_opening") return document;
  const proposed = structuredClone(document);
  const opening = proposed.floors.find(({ id }) => id === operation.floorId)?.openings.find(({ id }) => id === operation.openingId);
  if (!opening) return document; // The canonical transaction returns the typed missing-entity error.
  const fields = [["widthMm", "widthEvidence"], ["heightMm", "heightEvidence"], ["sillHeightMm", "sillHeightEvidence"]] as const;
  for (const [value, evidence] of fields) {
    if ((Object.hasOwn(operation.changes, value) && operation.changes[value] !== opening[value]) ||
      (value === "sillHeightMm" && operation.changes.kind === "door" && opening.kind === "window")) {
      opening[evidence] = "assumed";
    }
  }
  proposed.verification = { tier: "needs_review", criticalIssueIds: [...document.verification.criticalIssueIds] };
  opening.provenance = demoteTopologyProvenance(opening.provenance, opening.id,
    "Private proposed opening dimensions replace affected source claims; immutable original retains the source measurements",
    { document: proposed, context, changedIds: new Set(), operationIndex: 0 });
  return proposed;
}
