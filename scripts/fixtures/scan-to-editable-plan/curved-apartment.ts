import { authoredApartment } from "./apartment";

/** Independent inward semicircle: east boundary reaches x=6260 at z=3000. */
export function curvedApartment() {
  const document = authoredApartment(), floor = document.floors[0], provenance = floor.vertices[0].provenance;
  floor.vertices.push({ id: "arc-center", xMm: 9260, zMm: 3000, provenance },
    { id: "loose-start", xMm: 5500, zMm: 1000, provenance }, { id: "loose-end", xMm: 6000, zMm: 2000, provenance });
  floor.walls.find(({ id }) => id === "east")!.path = { kind: "arc", startVertexId: "c", endVertexId: "d", centerVertexId: "arc-center", clockwise: true };
  floor.walls.push({ id: "loose", path: { kind: "line", startVertexId: "loose-start", endVertexId: "loose-end" }, thicknessMm: 100, classification: "partition", adjacentRoomIds: [], provenance });
  return document;
}
