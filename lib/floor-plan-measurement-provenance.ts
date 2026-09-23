import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanConsumerMeasurementEvidenceV2,
  FloorPlanMeasuredPropertyMutationContextV2,
} from "@/lib/floor-plan-measured-property-types";
import { failFloorPlanMeasuredPropertyMutationV2 } from "@/lib/floor-plan-measured-property-types";

const EXTRACTION_VERSION = "consumer-measurement-v1";

function measurementSource(
  document: FloorPlanDocumentV2,
  evidence: FloorPlanConsumerMeasurementEvidenceV2,
  context: FloorPlanMeasuredPropertyMutationContextV2,
  provenance: FloorPlanEntityProvenanceV2
): string {
  if (evidence === "site_measured") {
    const existing = document.sources.find((source) => source.kind === "site_measurement");
    if (existing) return existing.id;
    const id = `site-measurement:${context.mutationId}`;
    document.sources.push({
      id,
      kind: "site_measurement",
      name: "Consumer site-measurement attestation",
      mimeType: "application/vnd.interior-ai.site-measurement+json",
    });
    return id;
  }
  const sourceId = provenance.evidence[0]?.sourceId ?? document.sources[0]?.id;
  if (!sourceId) {
    failFloorPlanMeasuredPropertyMutationV2(
      "MUTATION_VALIDATION_FAILED", "The plan has no source for measurement provenance."
    );
  }
  return sourceId;
}

export function markFloorPlanMeasurementProvenanceV2(
  provenance: FloorPlanEntityProvenanceV2,
  document: FloorPlanDocumentV2,
  targetId: string,
  evidence: FloorPlanConsumerMeasurementEvidenceV2,
  context: FloorPlanMeasuredPropertyMutationContextV2
): FloorPlanEntityProvenanceV2 {
  const sourceId = measurementSource(document, evidence, context, provenance);
  const defaultNote = evidence === "site_measured"
    ? "Consumer recorded a site measurement."
    : "Consumer explicitly confirmed the displayed value.";
  const defaultReviewNote = evidence === "site_measured"
    ? "Recorded as site measured; independent review is still required."
    : "Consumer confirmed the displayed measurement.";
  return {
    confidence: evidence === "site_measured" ? 1 : Math.max(0.8, provenance.confidence),
    extractionVersion: EXTRACTION_VERSION,
    evidence: [...provenance.evidence, {
      sourceId,
      basis: evidence,
      confidence: evidence === "site_measured" ? 1 : 0.9,
      extractorVersion: EXTRACTION_VERSION,
      note: context.note?.trim() || defaultNote,
    }],
    reviewHistory: [
      ...provenance.reviewHistory.filter(
        (record) => record.id !== `${context.mutationId}:${targetId}`
      ),
      {
        id: `${context.mutationId}:${targetId}`,
        action: "confirmed",
        reviewerId: context.actorId,
        reviewedAt: context.mutatedAt,
        note: context.note?.trim() || defaultReviewNote,
      },
    ],
  };
}
