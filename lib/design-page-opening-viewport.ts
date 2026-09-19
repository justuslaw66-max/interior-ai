import { resolvePlanOpeningVerticalMetrics } from "@/lib/design-page-plan-overlays";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import type { RoomOpening2D } from "@/lib/editorScene";

export type DesignPageViewportOpening = Pick<
  RoomOpening2D,
  "id" | "kind" | "wall" | "widthMm" | "heightMm" | "bottomMm" | "evidence"
> & {
  wallSpanMeters: number;
};

function displayRawOpeningValue(
  raw: number | undefined,
  effective: number,
  acceptsZero: boolean
) {
  if (!Number.isFinite(raw)) return effective;
  if (acceptsZero ? raw! >= 0 : raw! > 0) return raw!;
  return effective;
}

function openingEvidenceState(opening: DesignPageViewportOpening) {
  const widthEvidence = opening.evidence?.width ?? "assumed";
  const heightEvidence = opening.evidence?.height ?? "assumed";
  const sillEvidence = opening.evidence?.sillHeight ?? "assumed";
  return {
    widthEvidence,
    heightEvidence,
    sillEvidence,
    widthEditable: floorPlanPropertyEvidenceIsEditable(widthEvidence),
    heightEditable: floorPlanPropertyEvidenceIsEditable(heightEvidence),
    sillEditable: floorPlanPropertyEvidenceIsEditable(sillEvidence),
  };
}

export function resolveDesignPageOpeningViewportState(
  opening: DesignPageViewportOpening | null,
  maxHeightMm: number
) {
  if (!opening) return null;
  const vertical = resolvePlanOpeningVerticalMetrics(
    {
      kind: opening.kind,
      heightMeters:
        opening.heightMm !== undefined ? opening.heightMm / 1000 : undefined,
      bottomMeters:
        opening.bottomMm !== undefined ? opening.bottomMm / 1000 : undefined,
    },
    maxHeightMm / 1000
  );
  const maxWidthMm = Math.max(
    400,
    Math.round((opening.wallSpanMeters - 0.06) * 1000)
  );

  return {
    toolbar: {
      kind: opening.kind,
      wall: opening.wall,
      widthMm: opening.widthMm,
      maxWidthMm,
    },
    inspector: {
      id: opening.id,
      kind: opening.kind,
      wall: opening.wall,
      hostNeedsRepair: opening.wallSpanMeters <= 0,
      widthMm: opening.widthMm,
      heightMm: displayRawOpeningValue(
        opening.heightMm, Math.round(vertical.heightMeters * 1000), false
      ),
      bottomMm: displayRawOpeningValue(
        opening.bottomMm, Math.round(vertical.bottomMeters * 1000), true
      ),
      effectiveHeightMm: Math.round(vertical.heightMeters * 1000),
      effectiveBottomMm: Math.round(vertical.bottomMeters * 1000),
      heightStatus: vertical.heightStatus,
      bottomStatus: vertical.bottomStatus,
      dimensionIssues: vertical.issues,
      maxWidthMm,
      maxHeightMm,
      ...openingEvidenceState(opening),
    },
  };
}
