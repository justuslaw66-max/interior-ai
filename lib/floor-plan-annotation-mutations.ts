import type { FloorPlanFloorV2 } from "./floor-plan-document-v2";
import { demoteTopologyProvenance, topologyMutationFail, type FloorPlanTopologyMutationStateV2 } from "./floor-plan-topology-mutation-support";

export function updateAnnotationText(floor: FloorPlanFloorV2, annotationId: string, text: string, state: FloorPlanTopologyMutationStateV2) {
  const annotation = floor.annotations.find((item) => item.id === annotationId);
  if (!annotation) topologyMutationFail("MUTATION_VALIDATION_FAILED", "The selected drawing annotation is no longer available.");
  if (typeof text !== "string" || text.length > 2_000) {
    topologyMutationFail("MUTATION_VALIDATION_FAILED", "Drawing text must contain at most 2,000 characters.");
  }
  if (text === annotation.text) topologyMutationFail("NO_OP_MUTATION", "The drawing text has not changed.");
  annotation.text = text;
  annotation.provenance = demoteTopologyProvenance(annotation.provenance, annotation.id, "Corrected source drawing text for planning review", state);
}
