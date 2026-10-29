import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { calibratedScaleFixture } from "./scale-review";

/** A reviewed plan with source-drawing marks beside its own annotations, as a traced page has. */
export function tracedPlanDocument(marks = 40) {
  const document = calibratedScaleFixture();
  const provenance = {
    confidence: 0, extractionVersion: "test-trace", reviewHistory: [],
    evidence: [{
      sourceId: "authored-source", pageNumber: 1, basis: "vector_traced" as const, confidence: 0,
      extractorVersion: "test-trace",
      note: "Unclassified reference artwork; no building meaning, scale or verification is inferred.",
    }],
  };
  for (let index = 0; index < marks; index++) {
    document.floors[0].annotations.push({
      id: `source-artwork:1:${index + 1}`, kind: "note", text: "Unclassified source stroke", scope: "reference",
      provenance: structuredClone(provenance),
      geometry: {
        kind: "source_drawing", sourceId: "authored-source", pageNumber: 1, widthPx: 1000, heightPx: 800,
        command: "line", points: [{ x: 10 + (index % 900), y: 10 }, { x: 10 + (index % 900), y: 700 }],
      },
    });
  }
  return document;
}

/** The plan with the opaque entity ids a shared or published plan must have (public-entity-ids.ts). */
export function withPublicIds(document: FloorPlanDocumentV2): FloorPlanDocumentV2 {
  const next = structuredClone(document);
  next.floors.forEach((floor, floorIndex) => {
    const renamed = (entities: Array<{ id: string }>, prefix: string) =>
      new Map(entities.map((entity, index) => [entity.id, `${prefix}-${index + 1}`]));
    const vertex = renamed(floor.vertices, "vertex");
    const wall = renamed(floor.walls, "wall");
    const room = renamed(floor.rooms, "room");
    const opening = renamed(floor.openings, "opening");
    const dimension = renamed(floor.dimensions, "dimension");
    const annotation = renamed(floor.annotations, "annotation");
    const as = (map: Map<string, string>, id: string) => map.get(id) ?? id;
    floor.id = `floor-${floorIndex + 1}`;
    for (const entity of floor.vertices) entity.id = as(vertex, entity.id);
    for (const entity of floor.walls) {
      entity.id = as(wall, entity.id);
      if (entity.path.kind === "line") {
        entity.path.startVertexId = as(vertex, entity.path.startVertexId);
        entity.path.endVertexId = as(vertex, entity.path.endVertexId);
      }
      entity.adjacentRoomIds = entity.adjacentRoomIds?.map((id) => as(room, id));
    }
    for (const entity of floor.rooms) {
      entity.id = as(room, entity.id);
      for (const loop of entity.wallLoops) for (const reference of loop.walls) reference.wallId = as(wall, reference.wallId);
    }
    for (const entity of floor.openings) {
      entity.id = as(opening, entity.id);
      entity.wallId = as(wall, entity.wallId);
    }
    for (const entity of floor.dimensions) {
      entity.id = as(dimension, entity.id);
      entity.fromVertexId = as(vertex, entity.fromVertexId);
      entity.toVertexId = as(vertex, entity.toVertexId);
    }
    for (const entity of floor.annotations) entity.id = as(annotation, entity.id);
  });
  return next;
}
