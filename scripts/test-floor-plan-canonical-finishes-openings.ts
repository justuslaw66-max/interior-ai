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
const houseRenderer = read("components/editor/renderers/HousePlanRenderer3D.tsx");
const geometryController = read("lib/useDesignPageRoomGeometry.ts");
const placementWorkspace = read("lib/useDesignPagePlacementWorkspaceRegistration.ts");
assert.match(canonicalRenderer, /testId: "canonical-wall-surface-3d"/);
assert.match(canonicalRenderer, /getWallFaceSurfaceSettings\([\s\S]*?wallId/);
assert.match(canonicalRenderer, /canonicalRoomId: room\.id/);
const canonicalWallSurfaceSource = canonicalRenderer.slice(
  canonicalRenderer.indexOf("function CanonicalWallSurfaceMesh"),
  canonicalRenderer.indexOf("function CanonicalOpening3DSymbol")
);
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

console.log("Canonical wall finishes and opening semantics checks passed.");
