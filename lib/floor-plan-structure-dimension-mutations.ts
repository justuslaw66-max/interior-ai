import type {
  FloorPlanDimensionV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
  FloorPlanStructureV2,
} from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanTopologyMutationErrorCodeV2,
  FloorPlanTopologyMutationV2,
  FloorPlanVertexDraftV2,
} from "@/lib/floor-plan-topology-mutation-types";

export type FloorPlanEntityMutationServicesV2 = {
  changedIds: Set<string>;
  fail: (code: FloorPlanTopologyMutationErrorCodeV2, message: string) => never;
  assertInteger: (value: number, label: string) => void;
  assertUnusedGlobalId: (id: string, label: string) => void;
  assertKnownVertices: (vertexIds: readonly string[]) => void;
  addNewVertices: (
    vertices: readonly FloorPlanVertexDraftV2[],
    referencedVertexIds: ReadonlySet<string>
  ) => void;
  pruneUnreferencedVertices: (candidateIds: ReadonlySet<string>) => void;
  inferredProvenance: (
    entityId: string,
    reason: string
  ) => FloorPlanEntityProvenanceV2;
  demoteProvenance: (
    provenance: FloorPlanEntityProvenanceV2,
    entityId: string,
    reason: string
  ) => FloorPlanEntityProvenanceV2;
};

export function mutateFloorPlanOpeningV2(
  floor: FloorPlanFloorV2,
  operation: Extract<
    FloorPlanTopologyMutationV2,
    { kind: "add_opening" | "update_opening" | "remove_opening" }
  >,
  services: FloorPlanEntityMutationServicesV2
): void {
  if (operation.kind === "add_opening") {
    services.assertUnusedGlobalId(operation.opening.id, "Opening ID");
    const wall = floor.walls.find(
      (candidate) => candidate.id === operation.opening.wallId
    );
    if (!wall) {
      services.fail("UNKNOWN_WALL", `Unknown wall: ${operation.opening.wallId}.`);
    }
    floor.openings.push({
      ...operation.opening,
      heightEvidence:
        operation.opening.heightMm === undefined ? undefined : "assumed",
      sillHeightEvidence:
        operation.opening.sillHeightMm === undefined ? undefined : "assumed",
      provenance: services.demoteProvenance(
        wall.provenance,
        operation.opening.id,
        `Added opening ${operation.opening.id}`
      ),
    });
    return;
  }
  const index = floor.openings.findIndex(({ id }) => id === operation.openingId);
  if (index < 0) {
    services.fail("UNKNOWN_OPENING", `Unknown opening: ${operation.openingId}.`);
  }
  const opening = floor.openings[index];
  if (operation.kind === "remove_opening") {
    floor.openings.splice(index, 1);
    services.changedIds.add(opening.id);
    const wall = floor.walls.find((candidate) => candidate.id === opening.wallId)!;
    wall.provenance = services.demoteProvenance(
      wall.provenance,
      wall.id,
      `Removed opening ${opening.id}`
    );
    return;
  }
  const changedKeys = Object.keys(operation.changes) as Array<
    keyof typeof operation.changes
  >;
  if (
    !changedKeys.length ||
    changedKeys.every((key) => operation.changes[key] === opening[key])
  ) {
    services.fail("NO_OP_MUTATION", `Opening ${opening.id} update has no changes.`);
  }
  const updatedOpening = {
    ...opening,
    ...operation.changes,
    id: opening.id,
    provenance: services.demoteProvenance(
      opening.provenance,
      opening.id,
      `Updated opening ${opening.id}`
    ),
  };
  if ("heightMm" in operation.changes) {
    updatedOpening.heightEvidence =
      operation.changes.heightMm === undefined ? undefined : "assumed";
  }
  if ("sillHeightMm" in operation.changes) {
    updatedOpening.sillHeightEvidence =
      operation.changes.sillHeightMm === undefined ? undefined : "assumed";
  }
  floor.openings[index] = updatedOpening;
}

function validateStructureValues(
  structure: Pick<FloorPlanStructureV2, "baseOffsetMm" | "heightMm">,
  services: FloorPlanEntityMutationServicesV2
): void {
  services.assertInteger(structure.baseOffsetMm, "Structure base offset");
  services.assertInteger(structure.heightMm, "Structure height");
}

export function mutateFloorPlanStructureV2(
  floor: FloorPlanFloorV2,
  operation: Extract<
    FloorPlanTopologyMutationV2,
    { kind: "add_structure" | "update_structure" | "remove_structure" }
  >,
  services: FloorPlanEntityMutationServicesV2
): void {
  if (operation.kind === "add_structure") {
    services.assertUnusedGlobalId(operation.structure.id, "Structure ID");
    if ((operation.vertices ?? []).some((vertex) => vertex.id === operation.structure.id)) {
      services.fail(
        "DUPLICATE_ENTITY_ID",
        "A structure and one of its new vertices cannot share an ID."
      );
    }
    validateStructureValues(operation.structure, services);
    const vertexIds = new Set(operation.structure.vertexIds);
    services.addNewVertices(operation.vertices ?? [], vertexIds);
    services.assertKnownVertices(operation.structure.vertexIds);
    floor.structures.push({
      ...operation.structure,
      vertexIds: [...operation.structure.vertexIds],
      provenance: services.inferredProvenance(
        operation.structure.id,
        `Added structure ${operation.structure.id}`
      ),
    });
    return;
  }

  const index = floor.structures.findIndex(
    (structure) => structure.id === operation.structureId
  );
  if (index < 0) {
    services.fail("UNKNOWN_STRUCTURE", `Unknown structure: ${operation.structureId}.`);
  }
  const structure = floor.structures[index];
  const oldVertexIds = new Set(structure.vertexIds);
  if (operation.kind === "remove_structure") {
    floor.structures.splice(index, 1);
    services.changedIds.add(structure.id);
    services.pruneUnreferencedVertices(oldVertexIds);
    return;
  }

  if (
    !Object.keys(operation.changes).length ||
    JSON.stringify({ ...structure, provenance: undefined }) ===
      JSON.stringify({ ...structure, ...operation.changes, provenance: undefined })
  ) {
    services.fail("NO_OP_MUTATION", `Structure ${structure.id} update has no changes.`);
  }
  const nextVertexIds = operation.changes.vertexIds ?? structure.vertexIds;
  services.addNewVertices(operation.vertices ?? [], new Set(nextVertexIds));
  services.assertKnownVertices(nextVertexIds);
  const updated: FloorPlanStructureV2 = {
    ...structure,
    ...operation.changes,
    id: structure.id,
    vertexIds: [...nextVertexIds],
    provenance: services.demoteProvenance(
      structure.provenance,
      structure.id,
      `Updated structure ${structure.id}`
    ),
  };
  validateStructureValues(updated, services);
  floor.structures[index] = updated;
  services.pruneUnreferencedVertices(oldVertexIds);
}

function validateDimensionValues(
  dimension: Pick<
    FloorPlanDimensionV2,
    "fromVertexId" | "toVertexId" | "measuredMm"
  >,
  services: FloorPlanEntityMutationServicesV2
): void {
  services.assertInteger(dimension.measuredMm, "Dimension measurement");
  services.assertKnownVertices([dimension.fromVertexId, dimension.toVertexId]);
}

export function mutateFloorPlanDimensionV2(
  floor: FloorPlanFloorV2,
  operation: Extract<
    FloorPlanTopologyMutationV2,
    { kind: "add_dimension" | "update_dimension" | "remove_dimension" }
  >,
  services: FloorPlanEntityMutationServicesV2
): void {
  if (operation.kind === "add_dimension") {
    services.assertUnusedGlobalId(operation.dimension.id, "Dimension ID");
    validateDimensionValues(operation.dimension, services);
    const sourceVertex = floor.vertices.find(
      (vertex) => vertex.id === operation.dimension.fromVertexId
    )!;
    floor.dimensions.push({
      ...operation.dimension,
      provenance: services.demoteProvenance(
        sourceVertex.provenance,
        operation.dimension.id,
        `Added dimension ${operation.dimension.id}`
      ),
    });
    return;
  }

  const index = floor.dimensions.findIndex(
    (dimension) => dimension.id === operation.dimensionId
  );
  if (index < 0) {
    services.fail("UNKNOWN_DIMENSION", `Unknown dimension: ${operation.dimensionId}.`);
  }
  const dimension = floor.dimensions[index];
  if (operation.kind === "remove_dimension") {
    floor.dimensions.splice(index, 1);
    services.changedIds.add(dimension.id);
    services.pruneUnreferencedVertices(
      new Set([dimension.fromVertexId, dimension.toVertexId])
    );
    return;
  }
  if (
    !Object.keys(operation.changes).length ||
    JSON.stringify({ ...dimension, provenance: undefined }) ===
      JSON.stringify({ ...dimension, ...operation.changes, provenance: undefined })
  ) {
    services.fail("NO_OP_MUTATION", `Dimension ${dimension.id} update has no changes.`);
  }
  const updated: FloorPlanDimensionV2 = {
    ...dimension,
    ...operation.changes,
    id: dimension.id,
    provenance: services.demoteProvenance(
      dimension.provenance,
      dimension.id,
      `Updated dimension ${dimension.id}`
    ),
  };
  validateDimensionValues(updated, services);
  floor.dimensions[index] = updated;
  services.pruneUnreferencedVertices(
    new Set([dimension.fromVertexId, dimension.toVertexId])
  );
}
