import type { FloorPlanDocumentV2, FloorPlanEntityProvenanceV2, FloorPlanFloorV2 } from "@/lib/floor-plan-document-v2";

/** Independently authored integration geometry. Never scan-recognition ground truth. */
export function authoredApartment(): FloorPlanDocumentV2 {
  const provenance: FloorPlanEntityProvenanceV2 = {
    confidence: 1, extractionVersion: "authored-integration-fixture-v1",
    evidence: [{ sourceId: "authored-source", basis: "user_confirmed", confidence: 1, extractorVersion: "authored-integration-fixture-v1" }],
    reviewHistory: [],
  };
  const property = (valueMm: number) => ({ valueMm, evidence: "assumed" as const, provenance });
  const floor: FloorPlanFloorV2 = {
    id: "apartment", name: "Apartment", levelIndex: 0, elevationMm: 0, storeyHeightMm: 2800, slabThicknessMm: 150,
    defaults: { wallHeight: property(2600), doorHeight: property(2100), windowHeight: property(1200), windowSillHeight: property(900) },
    calibrations: [],
    vertices: [["a", 0, 0], ["b", 4000, 0], ["c", 9260, 0], ["d", 9260, 6000], ["e", 4000, 6000], ["f", 0, 6000]].map(([id, xMm, zMm]) => ({ id: String(id), xMm: Number(xMm), zMm: Number(zMm), provenance })),
    walls: [], rooms: [],
    openings: [
      { id: "door", wallId: "shared", kind: "door", operation: "swing", offsetMm: 1200, widthMm: 900, hinge: "start", handing: "left", provenance },
      { id: "window", wallId: "north-east", kind: "window", operation: "fixed", offsetMm: 1000, widthMm: 1800, hinge: "none", handing: "none", provenance },
    ],
    structures: [], annotations: [],
    dimensions: [{ id: "overall-width", fromVertexId: "a", toVertexId: "c", axis: "horizontal", measuredMm: 9260, provenance }],
  };
  const walls: [string, string, string, string[]][] = [
    ["north-west", "a", "b", ["living"]], ["north-east", "b", "c", ["bedroom"]],
    ["east", "c", "d", ["bedroom"]], ["south-east", "d", "e", ["bedroom"]],
    ["south-west", "e", "f", ["living"]], ["west", "f", "a", ["living"]],
    ["shared", "b", "e", ["living", "bedroom"]],
  ];
  floor.walls = walls.map(([id, startVertexId, endVertexId, adjacentRoomIds]) => ({
    id, path: { kind: "line", startVertexId, endVertexId }, thicknessMm: id === "shared" ? 100 : 200,
    classification: id === "shared" ? "interior" : "exterior", adjacentRoomIds, provenance,
  }));
  floor.rooms = [
    { id: "living", name: "Living", roomType: "living", wallLoops: [{ kind: "outer", walls: ["north-west", "shared", "south-west", "west"].map((wallId) => ({ wallId, direction: "forward" })) }], provenance },
    { id: "bedroom", name: "Bedroom", roomType: "bedroom", wallLoops: [{ kind: "outer", walls: [...["north-east", "east", "south-east"].map((wallId) => ({ wallId, direction: "forward" as const })), { wallId: "shared", direction: "reverse" }] }], provenance },
  ];
  return structuredClone({
    schemaVersion: 2, units: "mm", id: "authored-apartment", revisionId: "authored-reference", createdAt: "2026-09-14T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [{ id: "authored-source", kind: "legacy", name: "Independent integration fixture", mimeType: "application/json" }], floors: [floor],
  });
}
