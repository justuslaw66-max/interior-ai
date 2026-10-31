import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  CompiledFloorPlanOpeningV2,
  CompiledFloorPlanSceneV2,
  CompiledFloorPlanWallV2,
} from "@/lib/floor-plan-compiler-v2";
import {
  buildCanonicalOpeningSymbolLinesV2,
  getCanonicalOpeningRenderIdentityV2,
} from "@/lib/floor-plan-opening-primitives";
import { buildCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { designSnapshotV3ToFloorPlanDocumentV2 } from "@/lib/design-snapshot-v3-floor-plan-adapter";
import {
  canonicalFloorPlanToDesignSnapshot,
  migrateLegacyWallSurfaceFacesToCanonical,
} from "@/lib/floor-plan-legacy-adapters";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { buildHousePlan2D, type HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { assertSharedDesignInput, assertSharedDesignSnapshotPublic } from "@/lib/shared-design-projection-schema";
import { trimFaceEdge, wallFinishShellGeometry, wallSurfaceEdge } from "@/components/editor/renderers/canonical-floor-plan/geometry";
import {
  getCanonicalFaceTrimsMm,
  getCanonicalPanelStrips2D,
  getCanonicalRoomWallFinish,
  getCanonicalWallPanelDepthMm,
} from "@/components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
import type { FloorPlanDocumentV2, FloorPlanFloorV2 } from "@/lib/floor-plan-document-v2";
import {
  buildCanonicalPlacementPanels,
  findCanonicalPlacementPanel,
  findCanonicalPlacementWall,
} from "@/lib/floor-plan-placement-boundaries";
import { isPointInsideRoomPolygon } from "@/lib/design-page-geometry";
import { getRoomWallFinishDepths, getRoomWallPanelDepths, sanitizePlanEdgeWallThicknesses } from "@/lib/room-wall-finish-depths";
import { clampToRoomInsideFinishes, getRoomClearInsideMetrics } from "@/lib/room-finished-outline";
import { evaluateConstraints } from "@/lib/constraints/evaluate";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { getFurnitureWallInset } from "@/lib/design-page-geometry";
import { curvedApartment } from "./fixtures/scan-to-editable-plan/curved-apartment";
import { OPEN_CORNER_CASES, runImportedPanelCornerProperties } from "./fixtures/imported-panel-corners";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";

const wall = (
  id: string,
  start: { xMm: number; zMm: number },
  end: { xMm: number; zMm: number },
  adjacentRoomIds: string[]
): CompiledFloorPlanWallV2 => ({
  id,
  path: { kind: "line", startVertexId: `${id}:start`, endVertexId: `${id}:end` },
  start,
  end,
  lengthMm: Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm),
  thicknessMm: 200,
  heightMm: 2600,
  heightEvidence: "source_documented",
  baseOffsetMm: 0,
  baseOffsetEvidence: "source_documented",
  classification: adjacentRoomIds.length > 1 ? "interior" : "exterior",
  adjacentRoomIds,
});

const walls = [
  wall("left-north", { xMm: 0, zMm: 0 }, { xMm: 4000, zMm: 0 }, ["left"]),
  wall("shared", { xMm: 4000, zMm: 0 }, { xMm: 4000, zMm: 3000 }, ["left", "right"]),
  wall("left-south", { xMm: 4000, zMm: 3000 }, { xMm: 0, zMm: 3000 }, ["left"]),
  wall("left-west", { xMm: 0, zMm: 3000 }, { xMm: 0, zMm: 0 }, ["left"]),
  wall("right-north", { xMm: 4000, zMm: 0 }, { xMm: 8000, zMm: 0 }, ["right"]),
  wall("right-east", { xMm: 8000, zMm: 0 }, { xMm: 8000, zMm: 3000 }, ["right"]),
  wall("right-south", { xMm: 8000, zMm: 3000 }, { xMm: 4000, zMm: 3000 }, ["right"]),
];
const wallById = new Map(walls.map((entry) => [entry.id, entry]));
const leftLoop = {
  kind: "outer" as const,
  walls: [
    { wallId: "left-north", direction: "forward" as const, start: walls[0].start, end: walls[0].end },
    { wallId: "shared", direction: "forward" as const, start: walls[1].start, end: walls[1].end },
    { wallId: "left-south", direction: "forward" as const, start: walls[2].start, end: walls[2].end },
    { wallId: "left-west", direction: "forward" as const, start: walls[3].start, end: walls[3].end },
  ],
  signedAreaSquareMm: 12_000_000,
};
const rightLoop = {
  kind: "outer" as const,
  walls: [
    { wallId: "right-north", direction: "forward" as const, start: walls[4].start, end: walls[4].end },
    { wallId: "right-east", direction: "forward" as const, start: walls[5].start, end: walls[5].end },
    { wallId: "right-south", direction: "forward" as const, start: walls[6].start, end: walls[6].end },
    { wallId: "shared", direction: "reverse" as const, start: walls[1].end, end: walls[1].start },
  ],
  signedAreaSquareMm: 12_000_000,
};

const scene: CompiledFloorPlanSceneV2 = {
  schemaVersion: 2,
  units: "mm",
  documentId: "finish-test",
  revisionId: "finish-test-r1",
  verificationTier: "needs_review",
  geometryHash: "a".repeat(64),
  warnings: [],
  floors: [
    {
      id: "floor-1",
      name: "Floor 1",
      levelIndex: 0,
      elevationMm: 0,
      elevationEvidence: "source_documented",
      storeyHeightMm: 2800,
      storeyHeightEvidence: "source_documented",
      slabThicknessMm: 150,
      slabThicknessEvidence: "source_documented",
      defaults: {
        wallHeight: { valueMm: 2600, evidence: "source_documented" },
        doorHeight: { valueMm: 2100, evidence: "source_documented" },
        windowHeight: { valueMm: 1200, evidence: "source_documented" },
        windowSillHeight: { valueMm: 900, evidence: "source_documented" },
      },
      vertices: [],
      walls,
      rooms: [
        { id: "left", name: "Left", roomType: "living", wallLoops: [leftLoop], areaSquareMm: 12_000_000 },
        { id: "right", name: "Right", roomType: "bedroom", wallLoops: [rightLoop], areaSquareMm: 12_000_000 },
      ],
      openings: [],
      structures: [],
      annotations: [],
      dimensions: [],
    },
  ],
};

const renderModel = buildCanonicalFloorPlanRenderModel(scene);
const shared = renderModel.floors[0].walls.find((entry) => entry.id === "shared");
assert(shared);
assert.deepEqual(
  shared.roomSides,
  [
    { roomId: "left", side: 1 },
    { roomId: "right", side: -1 },
  ],
  "A shared canonical wall must expose one exact, opposite room-facing surface per adjacent room."
);

const previous: RoomSnapshot = {
  id: "left",
  name: "Left",
  roomType: "living",
  geometry: { width: 4, depth: 3, height: 2.6 },
  planShape: "custom_polygon",
  planPolygon: [
    { x: -2, z: -1.5 },
    { x: 2, z: -1.5 },
    { x: 2, z: 1.5 },
    { x: -2, z: 1.5 },
  ],
  surfaces: {
    walls: {
      default: { paintColorHex: "#eeeeee" },
      faces: {
        north: { paintColorHex: "#aa0000" },
        "wall-1": { paintColorHex: "#0000aa" },
      },
    },
  },
  items: [],
  zones: [],
  savedViews: [],
};
const migrated = migrateLegacyWallSurfaceFacesToCanonical({
  roomId: "left",
  previous,
  compiledRoom: scene.floors[0].rooms[0],
  wallById,
  bounds: { left: 0, right: 4000, top: 0, bottom: 3000 },
});
assert.deepEqual(migrated.issues, []);
assert.equal(migrated.surfaces?.walls?.faces?.north?.paintColorHex, "#aa0000");
assert.equal(migrated.surfaces?.walls?.faces?.["wall-1"]?.paintColorHex, "#0000aa");
assert.equal(migrated.surfaces?.walls?.faces?.["left-north"]?.paintColorHex, "#aa0000");
assert.equal(migrated.surfaces?.walls?.faces?.shared?.paintColorHex, "#0000aa");

const snapshot: DesignSnapshot = {
  version: 3,
  activeRoomId: "left",
  rooms: [{ ...previous, surfaces: migrated.surfaces, surfaceFinishes: migrated.surfaces }],
};
const reloaded = storedToSnapshot(snapshotToStored(snapshot));
assert.equal(
  reloaded.rooms[0].surfaces?.walls?.faces?.shared?.paintColorHex,
  "#0000aa",
  "Canonical wall finish identity must survive save/reload."
);

const ambiguous = migrateLegacyWallSurfaceFacesToCanonical({
  roomId: "left",
  previous: {
    ...previous,
    surfaces: { walls: { faces: { "wall-99": { paintColorHex: "#123456" } } } },
  },
  compiledRoom: scene.floors[0].rooms[0],
  wallById,
  bounds: { left: 0, right: 4000, top: 0, bottom: 3000 },
});
assert.equal(ambiguous.issues[0]?.code, "AMBIGUOUS_LEGACY_WALL_FACE");
assert.equal(ambiguous.surfaces?.walls?.faces?.["wall-99"]?.paintColorHex, "#123456");
const ambiguousRoom: RoomSnapshot = {
  ...previous,
  planPosition: { x: 2, z: 1.5 },
  surfaces: { walls: { faces: { "wall-99": { paintColorHex: "#123456" } } } },
  surfaceFinishes: undefined,
};
const ambiguousSnapshot: DesignSnapshot = {
  version: 3,
  activeRoomId: ambiguousRoom.id,
  rooms: [ambiguousRoom],
};
const compatibilityDocument = designSnapshotV3ToFloorPlanDocumentV2(
  ambiguousSnapshot
).document;
const ambiguousProjection = canonicalFloorPlanToDesignSnapshot(
  compatibilityDocument,
  { baseSnapshot: ambiguousSnapshot }
);
assert.equal(ambiguousProjection.snapshot.floorPlan?.verificationTier, "needs_review");
assert.equal(
  ambiguousProjection.snapshot.floorPlan?.surfaceMigrationReviewIssues?.[0]?.code,
  "AMBIGUOUS_LEGACY_WALL_FACE"
);
assert.equal(
  ambiguousProjection.snapshot.rooms[0].surfaces?.walls?.faces?.["wall-99"]?.paintColorHex,
  "#123456",
  "An ambiguous legacy key must be retained for manual review instead of silently reassigned."
);

const opening = (
  operation: CompiledFloorPlanOpeningV2["operation"],
  kind: CompiledFloorPlanOpeningV2["kind"] = "door",
  handing: CompiledFloorPlanOpeningV2["handing"] = "left",
  hinge: CompiledFloorPlanOpeningV2["hinge"] = "start"
): CompiledFloorPlanOpeningV2 => ({
  id: `${kind}-${operation}-${handing}-${hinge}`,
  wallId: "left-north",
  kind,
  operation,
  offsetMm: 1000,
  widthMm: 900,
  widthEvidence: "source_documented",
  heightMm: kind === "window" || kind === "vent" || kind === "louvre" ? 1200 : 2100,
  heightEvidence: "source_documented",
  sillHeightMm: kind === "window" || kind === "vent" || kind === "louvre" ? 900 : 0,
  sillHeightEvidence: "source_documented",
  bottomMm: kind === "window" || kind === "vent" || kind === "louvre" ? 900 : 0,
  topMm: kind === "window" || kind === "vent" || kind === "louvre" ? 2100 : 2100,
  start: { xMm: 1000, zMm: 0 },
  end: { xMm: 1900, zMm: 0 },
  hinge,
  handing,
});

const leftSwing = buildCanonicalOpeningSymbolLinesV2(opening("swing", "door", "left", "start"));
const rightSwing = buildCanonicalOpeningSymbolLinesV2(opening("swing", "door", "right", "end"));
assert.deepEqual(leftSwing[0].points, [{ xMm: 1000, zMm: 0 }, { xMm: 1900, zMm: 0 }]);
assert(leftSwing.some((line) => line.role === "swing_arc"));
assert((leftSwing.find((line) => line.role === "swing_leaf")?.points[1].zMm ?? 0) > 0);
assert((rightSwing.find((line) => line.role === "swing_leaf")?.points[1].zMm ?? 0) < 0);
assert.deepEqual(rightSwing.find((line) => line.role === "swing_leaf")?.points[0], { xMm: 1900, zMm: 0 });
assert.equal(buildCanonicalOpeningSymbolLinesV2(opening("sliding")).filter((line) => line.role === "sliding_panel").length, 2);
assert.equal(buildCanonicalOpeningSymbolLinesV2(opening("folding")).find((line) => line.role === "folding_leaf")?.points.length, 5);
assert.equal(buildCanonicalOpeningSymbolLinesV2(opening("fixed", "window")).filter((line) => line.role === "fixed_panel").length, 2);
assert.equal(buildCanonicalOpeningSymbolLinesV2(opening("fixed", "louvre")).filter((line) => line.role === "vent_slat").length, 5);
assert.equal(buildCanonicalOpeningSymbolLinesV2(opening("open", "open_passage")).filter((line) => line.role === "open_jamb").length, 2);
const windowIdentity = getCanonicalOpeningRenderIdentityV2(opening("fixed", "window"));
assert.deepEqual(windowIdentity.start, { xMm: 1000, zMm: 0 });
assert.deepEqual(windowIdentity.end, { xMm: 1900, zMm: 0 });
assert.equal(windowIdentity.bottomMm, 900);
assert.equal(windowIdentity.topMm, 2100);

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const canonicalRenderer = read("components/editor/renderers/CanonicalFloorPlanStructure.tsx");
const canonicalWallSurfaceSource = read("components/editor/renderers/canonical-floor-plan/CanonicalWallSurfaceMesh.tsx");
const houseRenderer = read("components/editor/renderers/HousePlanRenderer3D.tsx");
const geometryController = read("lib/useDesignPageRoomGeometry.ts");
const placementWorkspace = read("lib/useDesignPagePlacementWorkspaceRegistration.ts");
// Wiring the 3D view can't be drawn to check here (no WebGL): the walls draw each room's surface through the mesh, which reads
// the room's finish for the wall (getCanonicalRoomWallFinish, tested below).
assert.match(canonicalRenderer, /<CanonicalWallSurfaceMesh\b/);
assert.match(canonicalWallSurfaceSource, /testId: "canonical-wall-surface-3d"/);
assert.match(canonicalWallSurfaceSource, /getCanonicalRoomWallFinish\(room, wallId\)/);
assert.match(canonicalWallSurfaceSource, /canonicalRoomId: room\.id/);
assert.doesNotMatch(
  canonicalWallSurfaceSource,
  /castShadow/,
  "Canonical finish planes must not cast edge shadows over the continuous structural wall body."
);
assert.doesNotMatch(
  canonicalWallSurfaceSource,
  /active \? "#fbfbf7" : "#ddddda"/,
  "Canonical unfinished walls must not change surface color at room boundaries."
);
assert.match(canonicalRenderer, /testId: "canonical-opening-symbol-2d"/);
assert.match(canonicalRenderer, /testId: "canonical-opening-symbol-3d"/);
assert.match(canonicalRenderer, /canonicalHinge: opening\.hinge/);
assert.match(canonicalRenderer, /canonicalHanding: opening\.handing/);
assert.match(houseRenderer, /<CanonicalFloorPlanWalls3D[\s\S]*?rooms=\{rooms\}/);
assert.match(geometryController, /canonicalDocument\?\.floors\.some/);
assert.match(
  placementWorkspace,
  /const canEditPlanGeometry =[\s\S]*?!Boolean\(designSnapshot\.floorPlan\?\.canonicalDocument\)/
);

// ---- Imported plans: the finish at its depth, and the room measured to it (J, 29 Oct 2026: "Two: drawn rooms, then
// imported"). A laminate stands 10 to 44 mm off the wall on its board; anything else is a 1.5 mm skin.
const NORDIC_ACACIA = "greenlam-woodgrains-5394";
const DEEPEST = { board: "mdf", boardThicknessMm: 18, fixing: "battens" } as const;

// The box: from the face out to the finish's depth, with no side against the wall. The shared wall runs down x = 4000 mm and
// is 200 mm thick, so its faces are at 3900 mm (left) and 4100 mm (right). This scene's walls have their own vertices.
const shellX = (side: 1 | -1, depthMm: number) => {
  const geometry = wallFinishShellGeometry(shared.solids[0], side, depthMm);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const normals = geometry.getAttribute("normal");
  const mm = (metres: number) => Math.round(metres * 10_000) / 10;
  return { min: mm(box.min.x), max: mm(box.max.x), top: mm(box.max.y),
    towardWall: Array.from({ length: normals.count }, (_, index) => Math.round(normals.getX(index))).includes(side) };
};
assert.deepEqual(shellX(1, 44), { min: 3856, max: 3900, top: 2600, towardWall: false });
assert.deepEqual(shellX(-1, 44), { min: 4100, max: 4144, top: 2600, towardWall: false });
assert.deepEqual(shellX(1, 1.5), { min: 3898.5, max: 3900, top: 2600, towardWall: false }, "paint is a 1.5 mm skin, as before");
const frontU = (trims = { startMm: 0, endMm: 0 }) => {
  const geometry = wallFinishShellGeometry(shared.solids[0], 1, 44, trims);
  const [normals, positions, uvs] = ["normal", "position", "uv"].map((name) => geometry.getAttribute(name));
  return [...new Set(Array.from({ length: uvs.count }, (_, index) => index).filter((index) => normals.getX(index) < -0.999)
    .map((index) => `${Math.round(positions.getZ(index) * 1000)}:${Math.round(uvs.getX(index) * 1e4) / 1e4}`))].sort();
};
assert.deepEqual(frontU(), ["0:0", "3000:1"], "The front shows the picture from the face's start corner to its end.");
assert.deepEqual(frontU({ startMm: 300, endMm: 0 }), ["3000:1", "300:0.1"], "A box cut back at a corner keeps the picture in place.");

// A plan compiled for real: a left room on joined walls (a 300 mm wall, a 100 mm wall shared with the right room with a door
// in it, a window, and a column, a hole), and a right room whose east wall is an arc. Turned with the address transforms
// and drawn at 30 degrees.
const prov = () => ({ confidence: 0.99, extractionVersion: "t", reviewHistory: [], evidence: [{ sourceId: "source-1",
  basis: "vector_traced" as const, confidence: 0.99, extractorVersion: "t", pageNumber: 1, cropPx: { xPx: 0, yPx: 0, widthPx: 1, heightPx: 1 } }] });
const assumed = (valueMm: number) => ({ valueMm, evidence: "assumed" as const, provenance: prov() });
function jointPlan(turnDeg: number): FloorPlanDocumentV2 {
  const turn = (turnDeg * Math.PI) / 180;
  const at = (x: number, z: number) => ({ xMm: Math.round(4000 + (x - 4000) * Math.cos(turn) - (z - 1500) * Math.sin(turn)),
    zMm: Math.round(1500 + (x - 4000) * Math.sin(turn) + (z - 1500) * Math.cos(turn)) });
  const vertices: Array<[string, number, number]> = [["a", 0, 0], ["b", 4000, 0], ["c", 8000, 0], ["d", 8000, 3000], ["e", 4000, 3000],
    ["f", 0, 3000], ["ac", 8000, 1500], ["h0", 1000, 1000], ["h1", 2000, 1000], ["h2", 2000, 2000], ["h3", 1000, 2000]];
  const line = (id: string, from: string, to: string, rooms: string[], thicknessMm = 200) => ({ id, thicknessMm, adjacentRoomIds: rooms,
    path: { kind: "line" as const, startVertexId: from, endVertexId: to }, classification: rooms.length > 1 ? "interior" as const : "exterior" as const, provenance: prov() });
  const loop = (kind: "outer" | "hole", walls: Array<[string, "forward" | "reverse"]>) => ({ kind, walls: walls.map(([wallId, direction]) => ({ wallId, direction })) });
  return {
    schemaVersion: 2, units: "mm", id: "joint-plan", revisionId: "joint-plan-r1", createdAt: "2026-10-30T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [{ id: "source-1", kind: "pdf", name: "plan", mimeType: "application/pdf", sha256: "b".repeat(64), pageCount: 1 }],
    floors: [{
      id: "floor-1", name: "L1", levelIndex: 0, elevationMm: 0, storeyHeightMm: 2800, slabThicknessMm: 150, calibrations: [],
      defaults: { wallHeight: assumed(2600), doorHeight: assumed(2100), windowHeight: assumed(1200), windowSillHeight: assumed(900) },
      vertices: vertices.map(([id, x, z]) => ({ id, ...at(x, z), provenance: prov() })),
      walls: [
        line("w-ab", "a", "b", ["L"]), line("w-be", "b", "e", ["L", "R"], 100), line("w-ef", "e", "f", ["L"]), line("w-fa", "f", "a", ["L"], 300),
        line("w-bc", "b", "c", ["R"]), line("w-de", "d", "e", ["R"]),
        { ...line("w-cd", "c", "d", ["R"]), path: { kind: "arc" as const, startVertexId: "c", endVertexId: "d", centerVertexId: "ac", clockwise: false } },
        line("h-01", "h0", "h1", ["L"]), line("h-12", "h1", "h2", ["L"]), line("h-23", "h2", "h3", ["L"]), line("h-30", "h3", "h0", ["L"]),
      ],
      rooms: [
        { id: "L", name: "Left", roomType: "living", provenance: prov(), wallLoops: [
          loop("outer", [["w-ab", "forward"], ["w-be", "forward"], ["w-ef", "forward"], ["w-fa", "forward"]]),
          loop("hole", [["h-01", "forward"], ["h-12", "forward"], ["h-23", "forward"], ["h-30", "forward"]])] },
        { id: "R", name: "Right", roomType: "bedroom", provenance: prov(), wallLoops: [
          loop("outer", [["w-bc", "forward"], ["w-cd", "forward"], ["w-de", "forward"], ["w-be", "reverse"]])] },
      ],
      openings: [
        { id: "door", wallId: "w-be", kind: "door", operation: "swing", offsetMm: 1000, widthMm: 900, hinge: "start", handing: "left", provenance: prov() },
        { id: "win", wallId: "w-ab", kind: "window", operation: "fixed", offsetMm: 1500, widthMm: 1000, hinge: "none", handing: "none", provenance: prov() },
      ] as unknown as FloorPlanFloorV2["openings"],
      structures: [], annotations: [], dimensions: [],
    }],
  };
}
const laminated = (room: RoomSnapshot): RoomSnapshot =>
  ({ ...room, surfaces: { walls: { default: { materialId: NORDIC_ACACIA, panelBacking: DEEPEST } } }, surfaceFinishes: undefined });
/** The floor-standing panel outlines of a room's laminates as drawn (bare face, then the panel's face), in plan metres. */
function roomPanelOutlines(floor: ReturnType<typeof buildCanonicalFloorPlanRenderModel>["floors"][number], room: HousePlanRoom2D) {
  return floor.walls.flatMap((wall) => wall.roomSides.filter(({ roomId }) => roomId === room.id).flatMap(({ side }) => {
    const { depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    if (depthMm <= 0) return [];
    return wall.solids.filter((solid) => solid.bottomMm <= wall.baseOffsetMm + 0.5).map((solid, index) => {
      const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
      const bare = trimFaceEdge(wallSurfaceEdge(solid, side, 0), trims), face = trimFaceEdge(wallSurfaceEdge(solid, side, depthMm), trims);
      return { key: `${wall.id}:${index}`, wallId: wall.id, outline: [bare.start, bare.end, face.end, face.start] };
    });
  }));
}
/** The area two convex outlines share, in mm² (Sutherland-Hodgman). */
function overlapMm2(subject: Array<{ x: number; z: number }>, clipper: Array<{ x: number; z: number }>): number {
  const area = (points: Array<{ x: number; z: number }>) =>
    points.reduce((sum, point, index) => sum + point.x * points[(index + 1) % points.length].z - points[(index + 1) % points.length].x * point.z, 0) / 2;
  const edges = area(clipper) > 0 ? clipper : [...clipper].reverse();
  let kept = subject;
  edges.forEach((from, index) => {
    const to = edges[(index + 1) % edges.length];
    const inside = (point: { x: number; z: number }) => (to.x - from.x) * (point.z - from.z) - (to.z - from.z) * (point.x - from.x);
    const input = kept;
    kept = [];
    input.forEach((point, pointIndex) => {
      const next = input[(pointIndex + 1) % input.length];
      const [here, there] = [inside(point), inside(next)];
      if (here >= 0) kept.push(point);
      if ((here >= 0) !== (there >= 0)) {
        const t = here / (here - there);
        kept.push({ x: point.x + (next.x - point.x) * t, z: point.z + (next.z - point.z) * t });
      }
    });
  });
  return Math.abs(area(kept)) * 1e6;
}
for (const [addressTransform, turnDeg] of [["normal", 0], ["rotate_90", 0], ["mirror_x", 0], ["mirror_x_rotate_270", 0], ["normal", 30]] as const) {
  const label = `${addressTransform} at ${turnDeg} degrees`;
  const { snapshot: imported, scene: importedScene } = canonicalFloorPlanToDesignSnapshot(jointPlan(turnDeg), { addressTransform });
  const floor = buildCanonicalFloorPlanRenderModel(importedScene).floors[0];
  const compiledWalls = new Map(importedScene.floors[0].walls.map((entry) => [entry.id, entry]));
  const rooms = imported.rooms.map(laminated);
  const planRooms = buildHousePlan2D(rooms, 8, 3).rooms;
  for (const room of rooms) {
    // Each edge of the outline names the wall it lies on: its middle is on that wall's centre line (an arc's chord within
    // its sag), in the outline's order, one edge per straight wall and several for the arc.
    const origin = room.planPosition!;
    const outline = room.planPolygon!.map(({ x, z }) => ({ x: (x + origin.x) * 1000, z: (z + origin.z) * 1000 }));
    assert.equal(room.planEdgeWallIds?.length, outline.length, label);
    outline.forEach((point, index) => {
      const next = outline[(index + 1) % outline.length];
      const middle = { x: (point.x + next.x) / 2, z: (point.z + next.z) / 2 };
      const host = compiledWalls.get(room.planEdgeWallIds![index])!;
      const off = host.path.kind === "arc" && host.center
        ? Math.abs(Math.hypot(middle.x - host.center.xMm, middle.z - host.center.zMm) - Math.hypot(host.start.xMm - host.center.xMm, host.start.zMm - host.center.zMm)) - 60
        : Math.abs(((middle.x - host.start.xMm) * (host.end.zMm - host.start.zMm) - (middle.z - host.start.zMm) * (host.end.xMm - host.start.xMm)) / host.lengthMm) - 1;
      assert.ok(off <= 0, `${label}: ${room.id}'s edge ${index} lies on ${host.id}`);
    });
  }
  const left = planRooms.find(({ id }) => id === "L")!;
  assert.deepEqual(getRoomWallPanelDepths(left), { "wall-0": 0.044, "wall-1": 0.044, "wall-2": 0.044, "wall-3": 0.044 }, label);
  // Measured from each wall's own face: the room's walls average 200 mm, and w-be is 100 mm, w-fa 300 mm.
  assert.deepEqual(Object.values(getRoomWallFinishDepths(left)).map((metres) => Math.round(metres * 1000)), [44, -6, 44, 94], label);
  assert.equal(getCanonicalRoomWallFinish(left, "h-01").depthMm, 0,
    `${label}: the column's laminate is drawn flat, since the room isn't measured to its walls`);
  // Every panel the room is measured to stands into the room, and ends at the room's corners: none runs into another, none
  // reaches past the room (at b and e the shared wall is the stem of a T, whose footprint runs to the through wall's far side).
  for (const room of planRooms) {
    const panels = roomPanelOutlines(floor, room);
    assert.ok(panels.length > 0, label);
    for (const { wallId, outline } of panels) {
      const middle = outline.reduce((sum, point) => ({ x: sum.x + point.x / 4, z: sum.z + point.z / 4 }), { x: 0, z: 0 });
      assert.ok(isPointInsideRoomPolygon({ x: middle.x - room.x, z: middle.z - room.z }, room.polygon!), `${label}: ${wallId} stands into ${room.id}`);
      for (const point of outline) {
        assert.ok(isPointInsideRoomPolygon({ x: point.x - room.x, z: point.z - room.z }, room.polygon!), `${label}: ${room.id}'s ${wallId} panel stays in the room`);
      }
    }
    panels.forEach((first, index) => panels.slice(index + 1).forEach((second) => {
      // An arc's slices, and its ends where it runs on along a straight wall, meet in mitred slivers, as in drawn rooms. Two
      // straight panels share nothing but the plan's rounding to the millimetre (a corner at 30 degrees is off square by it):
      // they used to overlap by the 44 mm square (1936 mm²) where a face ran past the room's corner.
      const allowed = first.wallId === "w-cd" || second.wallId === "w-cd" ? 150 : 5;
      const shared = overlapMm2(first.outline, second.outline);
      assert.ok(shared < allowed, `${label}: ${room.id}'s ${first.wallId} and ${second.wallId} panels share ${shared.toFixed(1)} mm²`);
    }));
  }
  if (addressTransform === "normal" && !turnDeg) {
    // Each corner of the left room: the earlier id runs to the room's corner, the later one stops at its panel (44 mm deep).
    // a = (0, 0) between w-fa (300 mm) and w-ab, b = (4000, 0) and e = (4000, 3000) on the 100 mm stem w-be, f = (0, 3000).
    const ends = Object.fromEntries(roomPanelOutlines(floor, left).map(({ key, outline: [start, end] }) =>
      [key, [start, end].map(({ x, z }) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`).join(" ")]));
    assert.deepEqual(ends, {
      "w-ab:0": "150,100 1500,100", "w-ab:1": "1500,100 2500,100", "w-ab:2": "2500,100 3950,100", // a, the window's sill, b
      "w-be:0": "3950,144 3950,1000", "w-be:1": "3950,1900 3950,2900", // b, the door, e
      "w-ef:0": "3906,2900 150,2900", // e, f
      "w-fa:0": "150,2856 150,144", // f, a
    });
  }
  // The 2D strips: on the walls the rooms are measured to, stopped at the door, none on the column.
  const strips = getCanonicalPanelStrips2D(floor, planRooms);
  assert.equal(strips.filter(({ wallId, roomId }) => wallId === "w-be" && roomId === "L").length, 2, label);
  assert.ok(!strips.some(({ wallId }) => wallId.startsWith("h-")), label);
  assert.equal(getCanonicalPanelStrips2D(floor, buildHousePlan2D(rooms, 8, 3).rooms)[0], strips[0],
    "a rebuilt list of rooms with the same finishes reuses the strips and their shapes");
  assert.equal(getCanonicalWallPanelDepthMm(floor.walls.find(({ id }) => id === "w-be")!, planRooms), 44, "an opening's box stands in front of it");
  if (addressTransform !== "normal" || turnDeg) continue;
  // Plan review measures from the finished face: w-ab's face is at z = 100 mm, its panel's at 144 mm. A sofa 1 m by 600 mm
  // standing against the panel's face is clear; 10 mm into it is not. Neither touches the wall itself.
  const sofaRoom = rooms.find(({ id }) => id === "L")!;
  const sofaAt = (backMm: number): [number, number, number] =>
    [2 - sofaRoom.planPosition!.x, 0, (backMm + 300) / 1000 - sofaRoom.planPosition!.z];
  const sofa = { w: 1000, d: 600, h: 800 };
  const model = buildCanonicalFloorPlanRenderModel(importedScene);
  const panels = buildCanonicalPlacementPanels(model, rooms);
  assert.equal(findCanonicalPlacementPanel(panels, model, sofaRoom, sofaAt(144), 0, sofa), null);
  assert.equal(findCanonicalPlacementPanel(panels, model, sofaRoom, sofaAt(134), 0, sofa), "w-ab");
  assert.equal(findCanonicalPlacementWall(model, sofaRoom, sofaAt(134), 0, sofa), null);
  assert.equal(findCanonicalPlacementPanel(buildCanonicalPlacementPanels(model, imported.rooms), model, sofaRoom, sofaAt(134), 0, sofa), null,
    "a painted wall has no panel to hit");
}

// A T-junction with a room on each side of the stem and one along the through wall, which runs straight on past the stem.
// Each face ends at its room's corner: the stem's at the through wall's face (z = 100 mm on the stem's side, not its far
// side at -100), and the through wall's two faces on the long room's side meet at the stem's line (x = 4000) instead of
// overlapping by the stem's thickness with their fronts in one plane. With the stem's id sorting first or last.
for (const stem of ["w-be", "w-aa"]) {
  const vertices: Array<[string, number, number]> = [["a", 0, 0], ["b", 4000, 0], ["c", 8000, 0], ["d", 8000, 3000], ["e", 4000, 3000],
    ["f", 0, 3000], ["g", 8000, -3000], ["h", 0, -3000]];
  const wall = (id: string, from: string, to: string, rooms: string[], thicknessMm = 200) => ({ id, thicknessMm, adjacentRoomIds: rooms,
    path: { kind: "line" as const, startVertexId: from, endVertexId: to }, classification: rooms.length > 1 ? "interior" as const : "exterior" as const, provenance: prov() });
  const outer = (walls: Array<[string, "forward" | "reverse"]>) => [{ kind: "outer" as const, walls: walls.map(([wallId, direction]) => ({ wallId, direction })) }];
  const document = { ...jointPlan(0), id: `t-${stem}`, floors: [{ ...jointPlan(0).floors[0],
    vertices: vertices.map(([id, xMm, zMm]) => ({ id, xMm, zMm, provenance: prov() })),
    walls: [wall("w-ab", "a", "b", ["A", "C"]), wall("w-bc", "b", "c", ["B", "C"]), wall(stem, "b", "e", ["A", "B"], 120),
      wall("w-cd", "c", "d", ["B"]), wall("w-de", "d", "e", ["B"]), wall("w-ef", "e", "f", ["A"]), wall("w-fa", "f", "a", ["A"]),
      wall("w-cg", "c", "g", ["C"]), wall("w-gh", "g", "h", ["C"]), wall("w-ha", "h", "a", ["C"])],
    rooms: [
      { id: "A", name: "A", roomType: "living", provenance: prov(), wallLoops: outer([["w-ab", "forward"], [stem, "forward"], ["w-ef", "forward"], ["w-fa", "forward"]]) },
      { id: "B", name: "B", roomType: "bedroom", provenance: prov(), wallLoops: outer([["w-bc", "forward"], ["w-cd", "forward"], ["w-de", "forward"], [stem, "reverse"]]) },
      { id: "C", name: "C", roomType: "living", provenance: prov(), wallLoops: outer([["w-ha", "forward"], ["w-ab", "forward"], ["w-bc", "forward"], ["w-cg", "forward"], ["w-gh", "forward"]]) },
    ],
    openings: [] }] } as unknown as FloorPlanDocumentV2;
  const projected = canonicalFloorPlanToDesignSnapshot(document, {});
  const floor = buildCanonicalFloorPlanRenderModel(projected.scene).floors[0];
  const planRooms = buildHousePlan2D(projected.snapshot.rooms.map(laminated), 8, 6).rooms;
  const extents = (roomId: string, wallId: string) => roomPanelOutlines(floor, planRooms.find(({ id }) => id === roomId)!)
    .filter((panel) => panel.wallId === wallId).map(({ outline: [start, end] }) =>
      [start, end].map(({ x, z }) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`).join(" "));
  const stemFirst = stem < "w-ab";
  assert.deepEqual(extents("A", stem), [stemFirst ? "3940,100 3940,2900" : "3940,144 3940,2900"], `${stem}: room A's stem panel`);
  assert.deepEqual(extents("A", "w-ab"), [stemFirst ? "100,100 3896,100" : "100,100 3940,100"], `${stem}: room A's through-wall panel`);
  assert.deepEqual(extents("C", "w-ab"), ["4000,-100 100,-100"], `${stem}: the long room's faces meet at the stem's line`);
  assert.deepEqual(extents("C", "w-bc"), ["7900,-100 4000,-100"]);
  for (const room of planRooms) {
    const panels = roomPanelOutlines(floor, room);
    panels.forEach((first, index) => panels.slice(index + 1).forEach((second) =>
      assert.ok(overlapMm2(first.outline, second.outline) < 1, `${stem}: ${room.id}'s ${first.wallId} and ${second.wallId} panels overlap`)));
  }
}

// A plan from vertices, walls and rooms (each room one outer loop, its walls forward), for the cases below.
function planOf(id: string, vertices: Array<[string, number, number]>, walls: Array<[string, string, string, number?]>,
  rooms: Array<[string, string[]]>, openings: unknown[] = []): FloorPlanDocumentV2 {
  const base = jointPlan(0);
  const roomsOf = (wallId: string) => rooms.filter(([, loop]) => loop.includes(wallId)).map(([roomId]) => roomId);
  return { ...base, id, floors: [{ ...base.floors[0], openings: openings as FloorPlanFloorV2["openings"],
    vertices: vertices.map(([vertexId, xMm, zMm]) => ({ id: vertexId, xMm, zMm, provenance: prov() })),
    walls: walls.map(([wallId, from, to, thicknessMm = 200]) => ({ id: wallId, thicknessMm, adjacentRoomIds: roomsOf(wallId),
      path: { kind: "line" as const, startVertexId: from, endVertexId: to }, classification: "exterior" as const, provenance: prov() })),
    rooms: rooms.map(([roomId, loop]) => ({ id: roomId, name: roomId, roomType: "living", provenance: prov(),
      wallLoops: [{ kind: "outer" as const, walls: loop.map((wallId) => ({ wallId, direction: "forward" as const })) }] })),
  }] } as unknown as FloorPlanDocumentV2;
}
function importedPlan(document: FloorPlanDocumentV2, finish = laminated) {
  const { snapshot: importedSnapshot, scene: importedScene } = canonicalFloorPlanToDesignSnapshot(document, {});
  const rooms = importedSnapshot.rooms.map(finish);
  const model = buildCanonicalFloorPlanRenderModel(importedScene);
  return { rooms, model, floor: model.floors[0], planRooms: buildHousePlan2D(rooms, 8, 6).rooms };
}
const rectangle: Array<[string, number, number]> = [["a", 0, 0], ["b", 4000, 0], ["c", 4000, 3000], ["d", 0, 3000]];
const ring = (thicknesses: number[]): Array<[string, string, string, number]> =>
  [["w1", "a", "b"], ["w2", "b", "c"], ["w3", "c", "d"], ["w4", "d", "a"]].map(([id, from, to], index) => [id, from, to, thicknesses[index]]);
const painted = (room: RoomSnapshot): RoomSnapshot => ({ ...room, surfaces: { walls: { default: { paintColorHex: "#ffffff" } } }, surfaceFinishes: undefined });

// A face ends at its corner only where the corner is near its vertex, as the footprints' own join takes it: a slight bend, or
// faces crossing far off, end at the vertex instead. The skin is cut the same way, so a bend never takes metres off a finish.
const skinLengthMm = (floor: ReturnType<typeof importedPlan>["floor"], room: HousePlanRoom2D, wallId: string) => {
  const wall = floor.walls.find(({ id }) => id === wallId)!;
  const side = wall.roomSides.find(({ roomId }) => roomId === room.id)!.side;
  return wall.solids.filter((solid) => solid.bottomMm <= wall.baseOffsetMm + 0.5).reduce((sum, solid) => {
    const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
    const edge = trimFaceEdge(wallSurfaceEdge(solid, side, 0), trims);
    return trims.hidden ? sum : sum + Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z) * 1000;
  }, 0);
};
for (const bendMm of [70, 140]) { // 1 and 2 degrees over 4 m
  const bent = importedPlan(planOf(`bend-${bendMm}`, [["a", 0, 0], ["b", 4000, 0], ["c", 8000, bendMm], ["d", 8000, 3000], ["e", 0, 3000]],
    [["w1", "a", "b"], ["w2", "b", "c", 300], ["w3", "c", "d"], ["w4", "d", "e"], ["w5", "e", "a"]], [["R", ["w1", "w2", "w3", "w4", "w5"]]]), painted);
  // To the vertex, less where it runs into the 300 mm wall's square end there (100 mm off its line, a few millimetres).
  const bentMm = skinLengthMm(bent.floor, bent.planRooms[0], "w1");
  assert.ok(bentMm <= 3900.5 && bentMm > 3900 - 100 * Math.tan(Math.atan2(bendMm, 4000)) - 0.5, `a ${bendMm} mm bend: w1's paint runs to the vertex (${bentMm.toFixed(1)} mm)`);
}
const curved = importedPlan(curvedApartment() as FloorPlanDocumentV2, (room) => room);
const bedroom = curved.planRooms.find(({ id }) => id === "bedroom")!;
const northEast = curved.floor.walls.find(({ id }) => id === "north-east")!;
const bedroomSide = northEast.roomSides.find(({ roomId }) => roomId === "bedroom")!.side;
const northEastFaceMm = northEast.solids.filter((solid) => solid.bottomMm <= 0.5).reduce((sum, solid) => {
  const edge = wallSurfaceEdge(solid, bedroomSide, 0);
  return sum + Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z) * 1000;
}, 0);
// It ends where it meets the arc's paint, which turns back along it to a cusp at c = (9260, 0): the arc's face (its slices'
// fronts, about 3100 mm from (9260, 3000)) meets the north-east face (z = 100 mm) 1.1 m short of c. It ran on to c before,
// through the arc's wall and out past it; the shared wall's paint stops at the north-east's (x = 4050 mm).
const arcWall = curved.floor.walls.find(({ id }) => id === "east")!;
const arcSide = arcWall.roomSides.find(({ roomId }) => roomId === "bedroom")!.side;
const cuspEndMm = Math.max(...arcWall.solids.map((solid) => {
  const { start, end } = wallSurfaceEdge(solid, arcSide, 1.5);
  return (start.z - 0.1) * (end.z - 0.1) <= 0 ? (start.x + ((0.1 - start.z) / (end.z - start.z)) * (end.x - start.x)) * 1000 : -Infinity;
})) - 4050;
assert.ok(Math.abs(cuspEndMm - (9260 - Math.sqrt((3100 + 1.5) ** 2 - 2900 ** 2) - 4050)) < 10, "the slices follow the arc");
assert.ok(northEastFaceMm > cuspEndMm + 1000, "the north-east face's footprint runs on to the cusp");
assert.ok(Math.abs(skinLengthMm(curved.floor, bedroom, "north-east") - cuspEndMm) < 3,
  `the curved apartment's bedroom's north-east paint ends at the arc's: ${skinLengthMm(curved.floor, bedroom, "north-east").toFixed(0)} of ${cuspEndMm.toFixed(0)} mm`);

// Furniture stops 2 cm in front of each wall's own panel, though an imported room has one average wall thickness: here 300
// and 100 mm walls, averaging 200 mm, each with a 44 mm laminate. Plan review finds the clamp's own result clear.
const thick = importedPlan(planOf("thick-walls", rectangle, ring([300, 100, 300, 100]), [["R", ["w1", "w2", "w3", "w4"]]]));
const thickRoom = thick.rooms[0];
assert.deepEqual(thickRoom.planEdgeWallThicknessesMm, [300, 100, 300, 100]);
const clamped = (x: number, z: number) => clampToRoomInsideFinishes(x, z, 1, 0.6, 4, 3, getFurnitureWallInset(thickRoom.geometry.wallThickness!), 0,
  "custom_polygon", thickRoom.planPolygon, undefined, getRoomWallFinishDepths(thickRoom));
assert.equal(Math.round((clamped(0, -5)[1] - 0.3 + 1.5) * 1000), 150 + 44 + 20, "against the 300 mm wall");
assert.equal(Math.round((2 - (clamped(5, 0)[0] + 0.5)) * 1000), 50 + 44 + 20, "against the 100 mm wall");
assert.equal(findCanonicalPlacementPanel(buildCanonicalPlacementPanels(thick.model, thick.rooms), thick.model, thickRoom,
  [0, 0, clamped(0, -5)[1]], 0, { w: 1000, d: 600, h: 800 }), null);
assert.deepEqual(getRoomClearInsideMetrics(thick.planRooms[0], (mm) => `${Math.round(mm)}`), [`Clear inside ${4000 - 100 - 88} × ${3000 - 300 - 88}`]);
assert.deepEqual(getRoomClearInsideMetrics(importedPlan(planOf("thick-paint", rectangle, ring([300, 100, 300, 100]), [["R", ["w1", "w2", "w3", "w4"]]]),
  painted).planRooms[0], (mm) => `${mm}`), [], "no clear size without a laminate (J: shown when a wall has one)");

// The checks measure each wall from its own face too (lib/room-finished-faces.ts, with each edge's signed depth): a TV console
// the clamp stops 2 cm off a 100 mm wall, in a room whose walls average 200 mm, is placed nicely against it, painted or
// laminated. It read "Too tight to wall (-3cm)" and "Walkway blocked" when the thinner walls' negative depths were dropped.
const tvConsole = Object.values(CATALOG_ITEMS).find(({ category }) => category === "tv_console")!;
for (const [finish, eastMm] of [[painted, -50], [laminated, -6]] as const) {
  const room = importedPlan(planOf(`thin-checks-${eastMm}`, rectangle, ring([300, 100, 300, 100]), [["R", ["w1", "w2", "w3", "w4"]]]), finish).rooms[0];
  const { width, depth, wallThickness } = room.geometry;
  assert.equal(Math.round(getRoomWallFinishDepths(room)["wall-1"]! * 1000), eastMm, "the 100 mm wall's face stands out");
  const [w, d] = tvConsole.bounds?.type === "aabb" ? [tvConsole.bounds.size.w, tvConsole.bounds.size.d] : [tvConsole.dimsMm.w / 1000, tvConsole.dimsMm.d / 1000];
  const [x, z] = clampToRoomInsideFinishes(9, 0, w, d, width, depth, getFurnitureWallInset(wallThickness!), -Math.PI / 2, "custom_polygon",
    room.planPolygon, undefined, getRoomWallFinishDepths(room));
  const checks = evaluateConstraints({ design: { items: [{ instanceId: "tv", productId: tvConsole.id, position: [x, 0, z], rotationY: -Math.PI / 2 }] },
    movedItemId: "tv", room: { width, depth, wallThickness, wallFinishRoom: room } });
  assert.equal(checks.find(({ id }) => id === "wall-gap")?.message, "Placed nicely against wall (2cm gap)", `${eastMm}: ${JSON.stringify(checks)}`);
  assert.ok(!checks.some(({ message }) => message.includes("-")), "no negative gap");
}

// A slice wholly inside a corner's cut is dropped, not drawn as a sliver: a door 120 mm along w2 from its corner with w1,
// whose panel w2 stops at (100 mm to w1's face, 44 mm of panel). Where w1 is cut away for the camera, w2 runs to the corner.
const doorCorner = importedPlan(planOf("door-corner", rectangle, ring([200, 200, 200, 200]), [["R", ["w1", "w2", "w3", "w4"]]],
  [{ id: "door", wallId: "w2", kind: "door", operation: "swing", offsetMm: 120, widthMm: 900, hinge: "start", handing: "left", provenance: prov() }]));
const w2 = doorCorner.floor.walls.find(({ id }) => id === "w2")!;
const w2Side = w2.roomSides[0].side;
const cornerSlice = w2.solids.find((solid) => solid.startOffsetMm === 0)!;
assert.equal(getCanonicalFaceTrimsMm(doorCorner.planRooms[0], doorCorner.floor.walls, w2, cornerSlice, w2Side).hidden, true);
assert.ok(!getCanonicalPanelStrips2D(doorCorner.floor, doorCorner.planRooms).some(({ key }) => key.includes(cornerSlice.id)));
const w3 = doorCorner.floor.walls.find(({ id }) => id === "w3")!;
const w3Trims = (cutAway: boolean) => getCanonicalFaceTrimsMm(doorCorner.planRooms[0], doorCorner.floor.walls, w3, w3.solids[0], w3.roomSides[0].side,
  (wallId) => cutAway && wallId === "w2");
assert.deepEqual([Math.round(w3Trims(false).startMm), Math.round(w3Trims(true).startMm)], [44, 0],
  "w3 stops at w2's panel, but runs to the corner while w2 is cut away for the camera, as a drawn room's squared end");

// Saved with the room, carried to the plan's rooms, and declared in a shared design's projection.
const jointImport = canonicalFloorPlanToDesignSnapshot(jointPlan(0), {}).snapshot;
const jointIds = jointImport.rooms.map(({ planEdgeWallIds }) => planEdgeWallIds);
assert.deepEqual(storedToSnapshot(snapshotToStored(jointImport)).rooms.map(({ planEdgeWallIds }) => planEdgeWallIds), jointIds);
assert.deepEqual(buildHousePlan2D(jointImport.rooms, 8, 3).rooms.map(({ edgeWallIds }) => edgeWallIds), jointIds);
const sharedDesign = { version: 3, rooms: snapshotToStored(jointImport).rooms, activeRoomId: "L", title: "t" };
assert.doesNotThrow(() => assertSharedDesignInput(sharedDesign));
assert.doesNotThrow(() => assertSharedDesignSnapshotPublic(sharedDesign));

// A room's finish on a wall is the one saved under that wall's id, else its walls' default.
const keyedRoom = buildHousePlan2D([{ ...jointImport.rooms[0], surfaces: { walls: { default: { paintColorHex: "#ffffff" },
  faces: { "w-ab": { materialId: NORDIC_ACACIA, panelBacking: DEEPEST } } } }, surfaceFinishes: undefined }], 8, 3).rooms[0];
assert.deepEqual(["w-ab", "w-be"].map((wallId) => getCanonicalRoomWallFinish(keyedRoom, wallId).depthMm), [44, 0]);
assert.equal(getCanonicalRoomWallFinish(keyedRoom, "w-be").settings.paintColorHex?.toLowerCase(), "#ffffff");

// A design saved before the import named the edges is matched to its plan when it is loaded, so it is measured to its panels
// with no migration; so is one whose saved ids aren't a list of strings, which are dropped first. A room whose outline no
// longer matches its plan isn't named: it keeps the bare wall, and the plan draws its laminate flat, so furniture never
// stands inside a panel.
const unnamed = (rooms: RoomSnapshot[], ids?: unknown) => ({ ...jointImport, rooms: rooms.map((room) => {
  // A damaged design's value, whatever it is.
  const copy: Record<string, unknown> = { ...room };
  if (ids === undefined) delete copy.planEdgeWallIds; else copy.planEdgeWallIds = ids;
  return copy as unknown as RoomSnapshot;
}) });
const loadedIds = (design: DesignSnapshot) => storedToSnapshot(snapshotToStored(design)).rooms.map(({ planEdgeWallIds }) => planEdgeWallIds);
assert.deepEqual(loadedIds(unnamed(jointImport.rooms)), jointIds);
for (const damaged of ["abcd", { length: 4 }, [1, 2, 3, 4], null]) {
  assert.deepEqual(loadedIds(unnamed(jointImport.rooms, damaged)), jointIds, `${JSON.stringify(damaged)} is replaced`);
  assert.deepEqual(getRoomWallFinishDepths(laminated(unnamed(jointImport.rooms, damaged).rooms[0])), {},
    `${JSON.stringify(damaged)} names no edge, and reading it doesn't throw`);
}
const reshaped = jointImport.rooms.map((room) => room.id === "L" ? { ...room, planPolygon: room.planPolygon!.map((point, index) =>
  index === 0 ? { x: point.x + 0.1, z: point.z } : point) } : room);
const reshapedRooms = storedToSnapshot(snapshotToStored(unnamed(reshaped))).rooms;
assert.equal(reshapedRooms.find(({ id }) => id === "L")!.planEdgeWallIds, undefined);
assert.deepEqual(reshapedRooms.find(({ id }) => id === "R")!.planEdgeWallIds, jointIds[1]);
const reshapedLeft = laminated(reshapedRooms.find(({ id }) => id === "L")!);
assert.deepEqual(getRoomWallFinishDepths(reshapedLeft), {});
assert.equal(getCanonicalRoomWallFinish(reshapedLeft, "w-ab").depthMm, 0);
// The walls' thicknesses are named with the edges, and saved, and a design whose saved geometry hash isn't its plan's own isn't
// kept under that hash, so it never names another design's walls.
assert.deepEqual(loadedIds(unnamed(jointImport.rooms)).length, 2);
assert.deepEqual(storedToSnapshot(snapshotToStored(unnamed(jointImport.rooms))).rooms.map(({ planEdgeWallThicknessesMm }) => planEdgeWallThicknessesMm),
  jointImport.rooms.map(({ planEdgeWallThicknessesMm }) => planEdgeWallThicknessesMm));
const thickImport = canonicalFloorPlanToDesignSnapshot({ ...planOf("joint-plan", rectangle, ring([300, 100, 300, 100]),
  [["L", ["w1", "w2", "w3", "w4"]]]), revisionId: "other" } as FloorPlanDocumentV2, {}).snapshot;
const staleHash = { ...unnamed(thickImport.rooms), floorPlan: { ...thickImport.floorPlan!, canonicalGeometryHash: jointImport.floorPlan!.canonicalGeometryHash } };
assert.deepEqual(storedToSnapshot(snapshotToStored(staleHash)).rooms[0].planEdgeWallIds, ["w1", "w2", "w3", "w4"]);
assert.deepEqual(loadedIds(unnamed(jointImport.rooms)), jointIds, "the plan the hash belongs to still names its own walls");
// With its plan at hand, a room's saved thicknesses are the plan's own (a stale save, or a plan edited since), and a thickness
// that isn't over 0 and up to 2 m is dropped.
const loadedThicknesses = (thicknesses: unknown) => storedToSnapshot(snapshotToStored({ ...thickImport,
  rooms: thickImport.rooms.map((room) => ({ ...room, planEdgeWallThicknessesMm: thicknesses as number[] })) })).rooms[0].planEdgeWallThicknessesMm;
assert.deepEqual(loadedThicknesses([300, 100, 300, 250]), [300, 100, 300, 100], "a stale thickness is the plan's");
assert.deepEqual(loadedThicknesses([300, 100, 300, 2500]), [300, 100, 300, 100], "a thickness over 2 m is dropped and named again");
assert.equal(sanitizePlanEdgeWallThicknesses([300, 2000.5], 2), undefined);
assert.deepEqual(sanitizePlanEdgeWallThicknesses([300, 2000], 2), [300, 2000]);

// Naming never stops a damaged design loading (a design without it loads): a plan that isn't an object, or one that doesn't
// compile, names nothing, and nor does an outline with a damaged point.
const storedUnnamed = JSON.parse(JSON.stringify(snapshotToStored(unnamed(jointImport.rooms))));
for (const damagedPlan of ["not-a-document", 42, true, { id: "broken", revisionId: "r", floors: "none" }]) {
  const design = { ...storedUnnamed, floorPlan: { ...storedUnnamed.floorPlan, canonicalDocument: damagedPlan, canonicalGeometryHash: undefined } };
  for (let load = 0; load < 2; load += 1) {
    assert.deepEqual(storedToSnapshot(design).rooms.map(({ planEdgeWallIds }) => planEdgeWallIds), [undefined, undefined],
      `${JSON.stringify(damagedPlan)} loads, unnamed`);
  }
}
const damagedOutline = JSON.parse(JSON.stringify(storedUnnamed));
damagedOutline.rooms[0].planPolygon[1] = null;
assert.deepEqual(storedToSnapshot(damagedOutline).rooms.map(({ planEdgeWallIds }) => planEdgeWallIds), [undefined, jointIds[1]],
  "a damaged outline isn't named, and the design still loads");
// Wiring the 2D renderer can't be drawn to check here (no browser): it hands the imported plan its rooms, which the strips need.
assert.match(read("components/editor/renderers/RoomRenderer2D.tsx"), /<CanonicalFloorPlanWalls2D\s+model=\{canonicalPlan\} rooms=\{rooms\}/,
  "The 2D plan hands its rooms to the imported plan's walls, which draw their panels.");

// Seeded random imported plans, compiled for real (scripts/fixtures/imported-panel-corners.ts): rooms shaped as L, T, cross, Y,
// wedges of 5 to 60 degrees, bends of up to 20 degrees either way, spikes (outside cusps) and arcs (meeting a straight wall in
// and out, at a cusp, and meeting each other), with walls 100 to 300 mm thick, each laminated on a random board or painted,
// turned, mirrored and moved, and some with a door near a corner. Each room's drawn panels are checked: no two overlap, none
// pokes out past the walls or into another wall, each face is covered up to its corners, and furniture placed by the clamp
// stands 2 cm in front of every laminate (each within the stated tolerances). The cases still open are counted, so a count
// can only come down. 100 plans by default; the full 2,000 with IMPORTED_CORNER_PLANS=2000 (about a minute and a half).
const cornerPlans = Number(process.env.IMPORTED_CORNER_PLANS ?? 100);
const corners = runImportedPanelCornerProperties(cornerPlans);
console.log(`Imported panel corners: ${corners.plans} plans (${corners.skipped} invalid, skipped), ${corners.rooms} rooms, ${corners.panels} panels; worst ${JSON.stringify(
  Object.fromEntries(Object.entries(corners.worst).map(([key, value]) => [key, Math.round(value * 100) / 100])))}; failing ${JSON.stringify(corners.failing)}`);
const openCases = OPEN_CORNER_CASES[cornerPlans];
if (openCases) {
  assert.ok(corners.plans >= cornerPlans * 0.99, "the plans compile");
  for (const [key, open] of Object.entries(openCases)) {
    assert.ok((corners.failing[key] ?? 0) <= open, `${key}: ${corners.failing[key]} rooms (${open} known open)\n${corners.failures.join("\n")}`);
  }
  assert.deepEqual(Object.keys(corners.failing).filter((key) => !(key in openCases)), [], corners.failures.join("\n"));
}

console.log("Canonical wall finishes and opening semantics checks passed.");
