import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ShapeGeometry } from "three";
import { isCatalogPlacementLocalFootprintInsideRoom } from "@/lib/catalog-placement";
import { clampToRoom, isFootprintInsideRoomPolygon } from "@/lib/design-page-geometry";
import { buildHousePlan2D } from "@/lib/design-page-house-plan";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { buildCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { buildRoomPlanShape } from "@/lib/room-plan-shape";

const provenance: FloorPlanEntityProvenanceV2 = {
  confidence: 0.99,
  extractionVersion: "room-hole-test-1",
  evidence: [
    {
      sourceId: "source-1",
      basis: "vector_traced",
      confidence: 0.99,
      extractorVersion: "room-hole-test-1",
      pageNumber: 1,
      cropPx: { xPx: 0, yPx: 0, widthPx: 600, heightPx: 400 },
    },
  ],
  reviewHistory: [],
};

const cloneProvenance = () => structuredClone(provenance);
const measured = (valueMm: number) => ({
  valueMm,
  evidence: "assumed" as const,
  provenance: cloneProvenance(),
});

const floor: FloorPlanFloorV2 = {
  id: "floor-1",
  name: "Level 1",
  levelIndex: 0,
  elevationMm: 0,
  storeyHeightMm: 2800,
  slabThicknessMm: 150,
  defaults: {
    wallHeight: measured(2600),
    doorHeight: measured(2100),
    windowHeight: measured(1200),
    windowSillHeight: measured(900),
  },
  calibrations: [],
  vertices: [
    ["o0", 0, 0],
    ["o1", 6000, 0],
    ["o2", 6000, 4000],
    ["o3", 0, 4000],
    ["h0", 2000, 1000],
    ["h1", 4000, 1000],
    ["h2", 4000, 3000],
    ["h3", 2000, 3000],
  ].map(([id, xMm, zMm]) => ({
    id: id as string,
    xMm: xMm as number,
    zMm: zMm as number,
    provenance: cloneProvenance(),
  })),
  walls: [
    ["outer-north", "o0", "o1", "exterior"],
    ["outer-east", "o1", "o2", "exterior"],
    ["outer-south", "o2", "o3", "exterior"],
    ["outer-west", "o3", "o0", "exterior"],
    ["void-north", "h0", "h1", "interior"],
    ["void-east", "h1", "h2", "interior"],
    ["void-south", "h2", "h3", "interior"],
    ["void-west", "h3", "h0", "interior"],
  ].map(([id, startVertexId, endVertexId, classification]) => ({
    id,
    path: { kind: "line" as const, startVertexId, endVertexId },
    thicknessMm: 180,
    classification: classification as "exterior" | "interior",
    adjacentRoomIds: ["living"],
    provenance: cloneProvenance(),
  })),
  rooms: [
    {
      id: "living",
      name: "Living around courtyard",
      roomType: "living",
      wallLoops: [
        {
          kind: "outer",
          walls: ["outer-north", "outer-east", "outer-south", "outer-west"].map(
            (wallId) => ({ wallId, direction: "forward" as const })
          ),
        },
        {
          kind: "hole",
          walls: ["void-north", "void-east", "void-south", "void-west"].map(
            (wallId) => ({ wallId, direction: "forward" as const })
          ),
        },
      ],
      provenance: cloneProvenance(),
    },
  ],
  openings: [],
  structures: [],
  annotations: [],
  dimensions: [],
};

const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "courtyard-home",
  revisionId: "courtyard-revision-1",
  createdAt: "2026-07-16T00:00:00.000Z",
  verification: { tier: "needs_review", criticalIssueIds: [] },
  sources: [
    {
      id: "source-1",
      kind: "pdf",
      name: "Courtyard fixture",
      mimeType: "application/pdf",
      sha256: "b".repeat(64),
      pageCount: 1,
    },
  ],
  floors: [floor],
};

const compiled = compileFloorPlanDocumentV2(document);
assert.equal(compiled.floors[0].rooms[0].areaSquareMm, 20_000_000);
const model = buildCanonicalFloorPlanRenderModel(compiled);
assert.equal(model.geometryHash, compiled.geometryHash);
assert.deepEqual(
  model.floors[0].rooms[0].wallLoops,
  compiled.floors[0].rooms[0].wallLoops,
  "Both render branches must receive the exact compiled outer and hole loops."
);

const { snapshot } = canonicalFloorPlanToDesignSnapshot(document);
const room = snapshot.rooms[0];
assert.equal(room.planHoles?.length, 1);
assert.deepEqual(room.planHoles?.[0], [
  { x: -1, z: -1 },
  { x: 1, z: -1 },
  { x: 1, z: 1 },
  { x: -1, z: 1 },
]);

const restored = storedToSnapshot(
  JSON.parse(JSON.stringify(snapshotToStored(snapshot)))
);
assert.deepEqual(restored.rooms[0].planHoles, room.planHoles);
assert.equal(
  compileFloorPlanDocumentV2(restored.floorPlan!.canonicalDocument!).geometryHash,
  compiled.geometryHash,
  "Save/reload must preserve the canonical geometry hash and room-hole loops."
);

const houseRoom = buildHousePlan2D(restored.rooms, 6, 4).rooms[0];
assert.deepEqual(houseRoom.holes, room.planHoles);
const outer = [...houseRoom.polygon!, houseRoom.polygon![0]].map(
  (point) => [point.x, point.z] as [number, number]
);
const holes = houseRoom.holes!.map((hole) =>
  [...hole, hole[0]].map((point) => [point.x, point.z] as [number, number])
);
const surfaceShape = buildRoomPlanShape(outer, holes);
assert.equal(surfaceShape.holes.length, 1);
const surfaceGeometry = new ShapeGeometry(surfaceShape);
const positions = surfaceGeometry.getAttribute("position");
const triangleIndexes = surfaceGeometry.getIndex();
let triangulatedArea = 0;
const triangleCount = triangleIndexes ? triangleIndexes.count : positions.count;
for (let index = 0; index < triangleCount; index += 3) {
  const a = triangleIndexes?.getX(index) ?? index;
  const b = triangleIndexes?.getX(index + 1) ?? index + 1;
  const c = triangleIndexes?.getX(index + 2) ?? index + 2;
  const ax = positions.getX(a);
  const ay = positions.getY(a);
  const bx = positions.getX(b);
  const by = positions.getY(b);
  const cx = positions.getX(c);
  const cy = positions.getY(c);
  triangulatedArea += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
}
surfaceGeometry.dispose();
assert.equal(triangulatedArea, 20, "Three.js must triangulate the floor/ceiling with the void removed.");

const placementRoom = {
  id: houseRoom.id,
  name: houseRoom.name,
  shape: houseRoom.shape,
  polygon: houseRoom.polygon,
  holes: houseRoom.holes,
  x: 0,
  z: 0,
  w: houseRoom.w,
  d: houseRoom.d,
};
assert.equal(
  isCatalogPlacementLocalFootprintInsideRoom({
    room: placementRoom,
    position: [0, 0, 0],
    rotationY: 0,
    dimsMm: { w: 500, d: 500 },
  }),
  false,
  "Furniture centred in the courtyard void must be rejected."
);
assert.equal(
  isCatalogPlacementLocalFootprintInsideRoom({
    room: placementRoom,
    position: [-2, 0, 0],
    rotationY: 0,
    dimsMm: { w: 500, d: 500 },
  }),
  true
);

const [safeX, safeZ] = clampToRoom(
  0,
  0,
  0.5,
  0.5,
  houseRoom.w,
  houseRoom.d,
  0,
  0,
  "custom_polygon",
  houseRoom.polygon,
  houseRoom.holes
);
assert.equal(
  isFootprintInsideRoomPolygon(
    safeX,
    safeZ,
    0.25,
    0.25,
    houseRoom.polygon!,
    houseRoom.holes
  ),
  true,
  "Clamping must move a footprint out of a canonical void."
);
assert(
  Math.hypot(safeX, safeZ) < 1.3,
  "Clamping should choose the nearest usable edge beside the void."
);

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
assert.match(read("components/editor/renderers/RoomRenderer2D.tsx"), /buildRoomPlanShape/);
assert.match(read("components/editor/renderers/HousePlanRenderer3D.tsx"), /buildRoomPlanShape/);
assert.match(
  read("components/editor/renderers/HousePlanRenderer3D.tsx"),
  /buildHorizontalRoomGeometry[\s\S]*?getRoomHoleOutlinePoints/
);

console.log("Floor-plan canonical room-hole tests passed.");
