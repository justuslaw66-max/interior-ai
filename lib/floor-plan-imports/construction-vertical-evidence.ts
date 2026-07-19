import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanEvidenceBasisV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";

export type FloorPlanConstructionEvidenceKind =
  | "unit_cad"
  | "as_built"
  | "site_measurement";

export type FloorPlanConstructionVerticalMeasurementProperty =
  | "elevation"
  | "base_offset"
  | "height"
  | "thickness"
  | "sill_height";

export type FloorPlanConstructionVerticalProperty = {
  /**
   * Stable synthetic measurement ID used by the construction-evidence
   * manifest. It is deliberately separate from 2D topology entity IDs.
   */
  id: string;
  floorId: string;
  property: FloorPlanConstructionVerticalMeasurementProperty;
  valueMm: number;
  evidence: FloorPlanPropertyEvidenceV2;
  provenance?: FloorPlanEntityProvenanceV2;
  path: string;
};

const DEFAULT_PROPERTY_SLUGS = {
  wallHeight: "wall-height",
  doorHeight: "door-height",
  windowHeight: "window-height",
  windowSillHeight: "window-sill-height",
} as const;

/**
 * Enumerates every authored vertical claim used by the canonical 3D scene.
 * Inherited wall/opening values are represented once by their floor default;
 * only authored wall/opening overrides receive their own synthetic IDs.
 */
export function collectFloorPlanConstructionVerticalProperties(
  document: FloorPlanDocumentV2
): FloorPlanConstructionVerticalProperty[] {
  return document.floors.flatMap((floor, floorIndex) => {
    const floorPrefix = `vertical:${floor.id}`;
    const properties: FloorPlanConstructionVerticalProperty[] = [
      {
        id: `${floorPrefix}:elevation`,
        floorId: floor.id,
        property: "elevation",
        valueMm: floor.elevationMm,
        evidence: floor.verticalEvidence?.elevation.evidence ?? "assumed",
        provenance: floor.verticalEvidence?.elevation.provenance,
        path: `floors[${floorIndex}].verticalEvidence.elevation`,
      },
      {
        id: `${floorPrefix}:storey-height`,
        floorId: floor.id,
        property: "height",
        valueMm: floor.storeyHeightMm,
        evidence: floor.verticalEvidence?.storeyHeight.evidence ?? "assumed",
        provenance: floor.verticalEvidence?.storeyHeight.provenance,
        path: `floors[${floorIndex}].verticalEvidence.storeyHeight`,
      },
      {
        id: `${floorPrefix}:slab-thickness`,
        floorId: floor.id,
        property: "thickness",
        valueMm: floor.slabThicknessMm,
        evidence: floor.verticalEvidence?.slabThickness.evidence ?? "assumed",
        provenance: floor.verticalEvidence?.slabThickness.provenance,
        path: `floors[${floorIndex}].verticalEvidence.slabThickness`,
      },
    ];

    for (const [propertyName, property] of Object.entries(floor.defaults) as Array<
      [keyof typeof floor.defaults, (typeof floor.defaults)[keyof typeof floor.defaults]]
    >) {
      properties.push({
        id: `${floorPrefix}:default:${DEFAULT_PROPERTY_SLUGS[propertyName]}`,
        floorId: floor.id,
        property: propertyName === "windowSillHeight" ? "sill_height" : "height",
        valueMm: property.valueMm,
        evidence: property.evidence,
        provenance: property.provenance,
        path: `floors[${floorIndex}].defaults.${propertyName}`,
      });
    }

    floor.walls.forEach((wall, wallIndex) => {
      if (wall.heightMm !== undefined) {
        properties.push({
          id: `${floorPrefix}:wall:${wall.id}:height`,
          floorId: floor.id,
          property: "height",
          valueMm: wall.heightMm,
          evidence: wall.heightEvidence ?? "assumed",
          // Entity provenance proves the 2D wall path, not this sibling numeric
          // property. Until schema v2 carries property-specific provenance an
          // exact construction-manifest measurement is required.
          provenance: undefined,
          path: `floors[${floorIndex}].walls[${wallIndex}].heightMm`,
        });
      }
      properties.push({
        id: `${floorPrefix}:wall:${wall.id}:base-offset`,
        floorId: floor.id,
        property: "base_offset",
        valueMm: wall.baseOffsetMm ?? 0,
        evidence:
          wall.baseOffsetEvidence ?? "assumed",
        provenance: undefined,
        path: `floors[${floorIndex}].walls[${wallIndex}].baseOffsetMm`,
      });
    });

    floor.openings.forEach((opening, openingIndex) => {
      if (opening.heightMm !== undefined) {
        properties.push({
          id: `${floorPrefix}:opening:${opening.id}:height`,
          floorId: floor.id,
          property: "height",
          valueMm: opening.heightMm,
          evidence:
            opening.heightEvidence ?? "assumed",
          provenance: undefined,
          path: `floors[${floorIndex}].openings[${openingIndex}].heightMm`,
        });
      }
      if (opening.sillHeightMm !== undefined) {
        properties.push({
          id: `${floorPrefix}:opening:${opening.id}:sill-height`,
          floorId: floor.id,
          property: "sill_height",
          valueMm: opening.sillHeightMm,
          evidence:
            opening.sillHeightEvidence ?? "assumed",
          provenance: undefined,
          path: `floors[${floorIndex}].openings[${openingIndex}].sillHeightMm`,
        });
      }
    });

    floor.structures.forEach((structure, structureIndex) => {
      properties.push(
        {
          id: `${floorPrefix}:structure:${structure.id}:base-offset`,
          floorId: floor.id,
          property: "base_offset",
          valueMm: structure.baseOffsetMm,
          evidence:
            structure.baseOffsetEvidence ?? "assumed",
          provenance: undefined,
          path: `floors[${floorIndex}].structures[${structureIndex}].baseOffsetMm`,
        },
        {
          id: `${floorPrefix}:structure:${structure.id}:height`,
          floorId: floor.id,
          property: "height",
          valueMm: structure.heightMm,
          evidence:
            structure.heightEvidence ?? "assumed",
          provenance: undefined,
          path: `floors[${floorIndex}].structures[${structureIndex}].heightMm`,
        }
      );
    });

    return properties;
  });
}

export function floorPlanConstructionBasisForKind(
  kind: FloorPlanConstructionEvidenceKind
): Extract<FloorPlanEvidenceBasisV2, "cad" | "as_built" | "site_measured"> {
  if (kind === "unit_cad") return "cad";
  if (kind === "as_built") return "as_built";
  return "site_measured";
}

export function floorPlanConstructionPropertyEvidenceForKind(
  kind: FloorPlanConstructionEvidenceKind
): Extract<FloorPlanPropertyEvidenceV2, "source_documented" | "site_measured"> {
  return kind === "site_measurement" ? "site_measured" : "source_documented";
}

export function floorPlanVerticalPropertyHasDirectConstructionEvidence(input: {
  property: FloorPlanConstructionVerticalProperty;
  sourceId: string;
  kind: FloorPlanConstructionEvidenceKind;
}): boolean {
  const expectedBasis = floorPlanConstructionBasisForKind(input.kind);
  return Boolean(
    input.property.provenance?.evidence.some(
      (entry) => entry.sourceId === input.sourceId && entry.basis === expectedBasis
    )
  );
}
