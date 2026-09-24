import { authoredApartment } from "./apartment";

/** Dense authored stress variant: same two-room footprint, 100 wall segments and 50 small windows.
 * Exercises the frozen entity-count budget; never recognition or typical-apartment evidence. */
export function densePerformanceApartment() {
  const document = authoredApartment(), floor = document.floors[0];
  const walls = floor.walls, splits = new Map<string, string[]>();
  floor.walls = []; floor.openings = [];
  for (const [wallIndex, wall] of walls.entries()) {
    const path = wall.path;
    if (path.kind !== "line") throw new Error("Expected authored straight walls");
    const start = floor.vertices.find(({ id }) => id === path.startVertexId)!;
    const end = floor.vertices.find(({ id }) => id === path.endVertexId)!;
    const count = wallIndex < 2 ? 15 : 14, vertexIds = [start.id], wallIds: string[] = [];
    for (let index = 1; index < count; index++) {
      const id = `${wall.id}-point-${index}`;
      floor.vertices.push({ id, xMm: Math.round(start.xMm + (end.xMm - start.xMm) * index / count),
        zMm: Math.round(start.zMm + (end.zMm - start.zMm) * index / count), provenance: wall.provenance });
      vertexIds.push(id);
    }
    vertexIds.push(end.id);
    for (let index = 0; index < count; index++) {
      const id = index === 0 ? wall.id : `${wall.id}-segment-${index}`;
      wallIds.push(id);
      floor.walls.push({ ...wall, id, path: { kind: "line", startVertexId: vertexIds[index], endVertexId: vertexIds[index + 1] } });
    }
    splits.set(wall.id, wallIds);
  }
  for (const room of floor.rooms) for (const loop of room.wallLoops) {
    loop.walls = loop.walls.flatMap((reference) => {
      const ids = splits.get(reference.wallId)!;
      return (reference.direction === "reverse" ? [...ids].reverse() : ids).map((wallId) => ({ wallId, direction: reference.direction }));
    });
  }
  floor.openings = floor.walls.filter((_, index) => index % 2 === 0).map((wall, index) => ({
    id: `stress-window-${index}`, wallId: wall.id, kind: "window", operation: "fixed", offsetMm: 60, widthMm: 120,
    hinge: "none", handing: "none", provenance: wall.provenance,
  }));
  return document;
}
