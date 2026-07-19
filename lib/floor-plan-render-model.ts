import {
  compileFloorPlanDocumentV2,
  type CompiledFloorPlanOpeningV2,
  type CompiledFloorPlanSceneV2,
  type CompiledFloorPlanWallV2,
} from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2, FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";
import {
  applyCanonicalWallFootprintJoins,
  buildRectangularWallFootprint,
  type CanonicalFloorPlanWallFootprint,
} from "@/lib/floor-plan-wall-footprints";

export type { CanonicalFloorPlanWallFootprint } from "@/lib/floor-plan-wall-footprints";

export type CanonicalFloorPlanLineSegment = {
  start: FloorPlanPointMmV2;
  end: FloorPlanPointMmV2;
  startOffsetMm: number;
  endOffsetMm: number;
};

export type CanonicalFloorPlanWallSolid = CanonicalFloorPlanLineSegment & {
  id: string;
  wallId: string;
  bottomMm: number;
  topMm: number;
  /**
   * Exact derived plan footprint for this extrusion slice. Connected wall
   * segments share mitered corner points so 3D walls do not overlap or leave
   * hollow wedges at authored vertices.
   */
  footprint: CanonicalFloorPlanWallFootprint;
};

export type CanonicalFloorPlanWallRenderModel = {
  id: string;
  path: CompiledFloorPlanWallV2["path"];
  thicknessMm: number;
  heightMm: number;
  heightEvidence: CompiledFloorPlanWallV2["heightEvidence"];
  baseOffsetMm: number;
  baseOffsetEvidence: CompiledFloorPlanWallV2["baseOffsetEvidence"];
  classification: CompiledFloorPlanWallV2["classification"];
  adjacentRoomIds: string[];
  /**
   * The physical side of the authored wall occupied by each adjacent room.
   * `1` is the wall segment's local +Z (left normal while following the
   * authored path); `-1` is local -Z. This lets a shared wall carry a distinct
   * room-facing finish on each side without duplicating wall geometry.
   */
  roomSides: Array<{ roomId: string; side: 1 | -1 }>;
  centerlineSegments: CanonicalFloorPlanLineSegment[];
  planSegments: CanonicalFloorPlanLineSegment[];
  solids: CanonicalFloorPlanWallSolid[];
  openings: CompiledFloorPlanOpeningV2[];
  openingPaths: Array<{
    opening: CompiledFloorPlanOpeningV2;
    segments: CanonicalFloorPlanLineSegment[];
  }>;
};

export type CanonicalFloorPlanFloorRenderModel = {
  id: string;
  levelIndex: number;
  elevationMm: number;
  elevationEvidence: CompiledFloorPlanSceneV2["floors"][number]["elevationEvidence"];
  storeyHeightMm: number;
  storeyHeightEvidence: CompiledFloorPlanSceneV2["floors"][number]["storeyHeightEvidence"];
  slabThicknessMm: number;
  slabThicknessEvidence: CompiledFloorPlanSceneV2["floors"][number]["slabThicknessEvidence"];
  walls: CanonicalFloorPlanWallRenderModel[];
  rooms: CompiledFloorPlanSceneV2["floors"][number]["rooms"];
  structures: CompiledFloorPlanSceneV2["floors"][number]["structures"];
};

export type CanonicalFloorPlanRenderModel = {
  documentId: string;
  revisionId: string;
  geometryHash: string;
  verificationTier: CompiledFloorPlanSceneV2["verificationTier"];
  compiledScene: CompiledFloorPlanSceneV2;
  floors: CanonicalFloorPlanFloorRenderModel[];
};

export type CanonicalFloorPlan2DActiveFloor = {
  floorId?: string | null;
  /** One-based editor floor level (`floor.levelIndex + 1`). */
  floorLevel?: number | null;
};

/**
 * Resolve the single canonical floor that may participate in the 2D scene.
 *
 * A multi-floor document deliberately has no implicit first-floor fallback:
 * rendering nothing is safer than exposing overlapping geometry or hit targets
 * from the wrong storey. A one-floor document remains compatible with older
 * snapshots that did not persist an active-floor selector.
 */
export function resolveCanonicalFloorPlan2DActiveFloor(
  model: CanonicalFloorPlanRenderModel,
  selection: CanonicalFloorPlan2DActiveFloor
): CanonicalFloorPlanFloorRenderModel | null {
  if (model.floors.length === 1) return model.floors[0];

  const hasFloorId =
    typeof selection.floorId === "string" && selection.floorId.trim().length > 0;
  const hasFloorLevel =
    typeof selection.floorLevel === "number" &&
    Number.isInteger(selection.floorLevel);
  const floorById = hasFloorId
    ? model.floors.find((floor) => floor.id === selection.floorId) ?? null
    : null;
  const floorByLevel = hasFloorLevel
    ? model.floors.find(
        (floor) => floor.levelIndex + 1 === selection.floorLevel
      ) ?? null
    : null;

  if (hasFloorId && hasFloorLevel) {
    return floorById && floorByLevel && floorById.id === floorByLevel.id
      ? floorById
      : null;
  }
  if (hasFloorId) return floorById;
  if (hasFloorLevel) return floorByLevel;
  return null;
}

function pointAlongWall(wall: CompiledFloorPlanWallV2, offsetMm: number) {
  if (wall.lengthMm <= 0) return { ...wall.start };
  const ratio = Math.max(0, Math.min(1, offsetMm / wall.lengthMm));
  if (wall.path.kind === "line" || !wall.center || wall.sweepRadians === undefined) {
    return {
      xMm: Math.round(wall.start.xMm + (wall.end.xMm - wall.start.xMm) * ratio),
      zMm: Math.round(wall.start.zMm + (wall.end.zMm - wall.start.zMm) * ratio),
    };
  }
  const radius = Math.hypot(
    wall.start.xMm - wall.center.xMm,
    wall.start.zMm - wall.center.zMm
  );
  const startAngle = Math.atan2(
    wall.start.zMm - wall.center.zMm,
    wall.start.xMm - wall.center.xMm
  );
  const angle = startAngle + wall.sweepRadians * ratio;
  return {
    xMm: Math.round(wall.center.xMm + Math.cos(angle) * radius),
    zMm: Math.round(wall.center.zMm + Math.sin(angle) * radius),
  };
}

function segmentWallRange(
  wall: CompiledFloorPlanWallV2,
  startOffsetMm: number,
  endOffsetMm: number
): CanonicalFloorPlanLineSegment[] {
  if (endOffsetMm - startOffsetMm <= 0) return [];
  const rangeSweep =
    wall.path.kind === "arc" && wall.sweepRadians !== undefined
      ? Math.abs(wall.sweepRadians) * ((endOffsetMm - startOffsetMm) / wall.lengthMm)
      : 0;
  const segmentCount = Math.max(1, Math.ceil(rangeSweep / (Math.PI / 32)));
  return Array.from({ length: segmentCount }, (_, index) => {
    const start =
      startOffsetMm + ((endOffsetMm - startOffsetMm) * index) / segmentCount;
    const end =
      startOffsetMm + ((endOffsetMm - startOffsetMm) * (index + 1)) / segmentCount;
    return {
      start: pointAlongWall(wall, start),
      end: pointAlongWall(wall, end),
      startOffsetMm: start,
      endOffsetMm: end,
    };
  });
}

function uniqueBoundaries(wall: CompiledFloorPlanWallV2, openings: CompiledFloorPlanOpeningV2[]) {
  return [
    0,
    wall.lengthMm,
    ...openings.flatMap((opening) => [
      Math.max(0, opening.offsetMm),
      Math.min(wall.lengthMm, opening.offsetMm + opening.widthMm),
    ]),
  ]
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.001);
}

function openingAtOffset(openings: CompiledFloorPlanOpeningV2[], offsetMm: number) {
  return openings.find(
    (opening) =>
      offsetMm > opening.offsetMm - 0.001 &&
      offsetMm < opening.offsetMm + opening.widthMm + 0.001
  );
}

function buildWallRenderModel(
  wall: CompiledFloorPlanWallV2,
  openings: CompiledFloorPlanOpeningV2[],
  roomSides: Array<{ roomId: string; side: 1 | -1 }>
): CanonicalFloorPlanWallRenderModel {
  const boundaries = uniqueBoundaries(wall, openings);
  const planSegments: CanonicalFloorPlanLineSegment[] = [];
  const solids: CanonicalFloorPlanWallSolid[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startOffsetMm = boundaries[index];
    const endOffsetMm = boundaries[index + 1];
    if (endOffsetMm - startOffsetMm <= 0.001) continue;
    const opening = openingAtOffset(openings, (startOffsetMm + endOffsetMm) / 2);
    const segments = segmentWallRange(wall, startOffsetMm, endOffsetMm);
    if (!opening) planSegments.push(...segments);

    const verticalRanges = opening
      ? [
          ...(opening.bottomMm > 0
            ? [{ bottomMm: wall.baseOffsetMm, topMm: wall.baseOffsetMm + opening.bottomMm }]
            : []),
          ...(opening.topMm < wall.heightMm
            ? [
                {
                  bottomMm: wall.baseOffsetMm + opening.topMm,
                  topMm: wall.baseOffsetMm + wall.heightMm,
                },
              ]
            : []),
        ]
      : [
          {
            bottomMm: wall.baseOffsetMm,
            topMm: wall.baseOffsetMm + wall.heightMm,
          },
        ];

    for (const [verticalIndex, vertical] of verticalRanges.entries()) {
      for (const [segmentIndex, segment] of segments.entries()) {
        solids.push({
          ...segment,
          id: `${wall.id}:${index}:${verticalIndex}:${segmentIndex}`,
          wallId: wall.id,
          bottomMm: vertical.bottomMm,
          topMm: vertical.topMm,
          footprint: buildRectangularWallFootprint(segment, wall.thicknessMm),
        });
      }
    }
  }

  return {
    id: wall.id,
    path: wall.path,
    thicknessMm: wall.thicknessMm,
    heightMm: wall.heightMm,
    heightEvidence: wall.heightEvidence,
    baseOffsetMm: wall.baseOffsetMm,
    baseOffsetEvidence: wall.baseOffsetEvidence,
    classification: wall.classification,
    adjacentRoomIds: wall.adjacentRoomIds,
    roomSides,
    centerlineSegments: segmentWallRange(wall, 0, wall.lengthMm),
    planSegments,
    solids,
    openings,
    openingPaths: openings.map((opening) => ({
      opening,
      segments: segmentWallRange(
        wall,
        opening.offsetMm,
        opening.offsetMm + opening.widthMm
      ),
    })),
  };
}

function buildRoomSideIndex(
  rooms: CompiledFloorPlanSceneV2["floors"][number]["rooms"]
) {
  const result = new Map<string, Map<string, 1 | -1>>();
  for (const room of rooms) {
    for (const loop of room.wallLoops) {
      const windingSide: 1 | -1 = loop.signedAreaSquareMm >= 0 ? 1 : -1;
      // For an outer loop the room lies inside the polygon. For a hole it lies
      // outside the polygon, so the physical room-facing side is inverted.
      const loopSide: 1 | -1 = loop.kind === "outer" ? windingSide : windingSide === 1 ? -1 : 1;
      for (const reference of loop.walls) {
        const authoredSide: 1 | -1 =
          reference.direction === "forward"
            ? loopSide
            : loopSide === 1
              ? -1
              : 1;
        const sides = result.get(reference.wallId) ?? new Map<string, 1 | -1>();
        // A valid topology references one physical side only once. If a
        // malformed loop disagrees, omit that room-side rather than rendering
        // a finish on an arbitrary face; validation will report the topology.
        const previous = sides.get(room.id);
        if (previous !== undefined && previous !== authoredSide) sides.delete(room.id);
        else sides.set(room.id, authoredSide);
        result.set(reference.wallId, sides);
      }
    }
  }
  return result;
}

export function buildCanonicalFloorPlanRenderModel(
  scene: CompiledFloorPlanSceneV2
): CanonicalFloorPlanRenderModel {
  return {
    documentId: scene.documentId,
    revisionId: scene.revisionId,
    geometryHash: scene.geometryHash,
    verificationTier: scene.verificationTier,
    compiledScene: scene,
    floors: scene.floors.map((floor) => {
      const roomSidesByWall = buildRoomSideIndex(floor.rooms);
      return {
        id: floor.id,
        levelIndex: floor.levelIndex,
        elevationMm: floor.elevationMm,
        elevationEvidence: floor.elevationEvidence,
        storeyHeightMm: floor.storeyHeightMm,
        storeyHeightEvidence: floor.storeyHeightEvidence,
        slabThicknessMm: floor.slabThicknessMm,
        slabThicknessEvidence: floor.slabThicknessEvidence,
        rooms: floor.rooms,
        structures: floor.structures,
        walls: applyCanonicalWallFootprintJoins(
          floor.walls.map((wall) =>
            buildWallRenderModel(
              wall,
              floor.openings.filter((opening) => opening.wallId === wall.id),
              [...(roomSidesByWall.get(wall.id)?.entries() ?? [])].map(
                ([roomId, side]) => ({ roomId, side })
              )
            )
          )
        ),
      };
    }),
  };
}

export function compileCanonicalFloorPlanRenderModel(
  document: FloorPlanDocumentV2,
  expectedGeometryHash?: string | null
) {
  const scene = compileFloorPlanDocumentV2(document);
  if (expectedGeometryHash && scene.geometryHash !== expectedGeometryHash) {
    throw new Error(
      `CANONICAL_GEOMETRY_HASH_MISMATCH: stored ${expectedGeometryHash}, compiled ${scene.geometryHash}`
    );
  }
  return buildCanonicalFloorPlanRenderModel(scene);
}
