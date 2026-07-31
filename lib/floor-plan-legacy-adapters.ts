import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  compileFloorPlanDocumentV2,
  type CompiledFloorPlanRoomLoopV2,
  type CompiledFloorPlanSceneV2,
  type CompiledFloorPlanWallV2,
} from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import {
  createRoom,
  type DesignSnapshot,
  type PersistedFloorPlanUnderlay,
  type PersistedFloorPlanAddressBinding,
  type RoomSnapshot,
  type RoomSurfaceAssignments,
  type RoomType,
  type SurfaceSettings,
} from "@/lib/room-types";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";

type CanonicalDesignAdapterOptions = {
  baseSnapshot?: DesignSnapshot | null;
  title?: string;
  sourceJobId?: string;
  sourceAssetSha256?: string;
  addressTransform?: FloorPlanAddressTransform;
  addressBinding?: PersistedFloorPlanAddressBinding;
  orientationConfirmed?: boolean;
  sourceRevisionGeometryHash?: string;
  underlay?: PersistedFloorPlanUnderlay | null;
};

export type CanonicalDesignAdapterResult = {
  snapshot: DesignSnapshot;
  openings: RoomOpening2D[];
  fixedElements: FixedElement2D[];
  scene: CompiledFloorPlanSceneV2;
  surfaceMigrationReviewIssues: NonNullable<
    DesignSnapshot["floorPlan"]
  >["surfaceMigrationReviewIssues"];
};

type SurfaceMigrationReviewIssue = NonNullable<
  NonNullable<DesignSnapshot["floorPlan"]>["surfaceMigrationReviewIssues"]
>[number];

function surfaceSettingsEqual(left: SurfaceSettings, right: SurfaceSettings) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function wallTouchesCardinalBoundary(
  wall: CompiledFloorPlanWallV2,
  cardinal: RoomOpening2D["wall"],
  bounds: { left: number; right: number; top: number; bottom: number }
) {
  if (wall.path.kind !== "line") return false;
  const toleranceMm = 1;
  if (cardinal === "north") {
    return Math.abs(wall.start.zMm - bounds.top) <= toleranceMm &&
      Math.abs(wall.end.zMm - bounds.top) <= toleranceMm;
  }
  if (cardinal === "south") {
    return Math.abs(wall.start.zMm - bounds.bottom) <= toleranceMm &&
      Math.abs(wall.end.zMm - bounds.bottom) <= toleranceMm;
  }
  if (cardinal === "west") {
    return Math.abs(wall.start.xMm - bounds.left) <= toleranceMm &&
      Math.abs(wall.end.xMm - bounds.left) <= toleranceMm;
  }
  return Math.abs(wall.start.xMm - bounds.right) <= toleranceMm &&
    Math.abs(wall.end.xMm - bounds.right) <= toleranceMm;
}

/**
 * Copies deterministic legacy wall-face settings to canonical wall IDs while
 * preserving every legacy key for backward compatibility. A face is never
 * guessed: cardinal faces require exactly one matching boundary wall, and
 * ordered `wall-N` faces require a line-only one-to-one outer loop.
 */
export function migrateLegacyWallSurfaceFacesToCanonical({
  roomId,
  previous,
  compiledRoom,
  wallById,
  bounds,
}: {
  roomId: string;
  previous: RoomSnapshot;
  compiledRoom: CompiledFloorPlanSceneV2["floors"][number]["rooms"][number];
  wallById: Map<string, CompiledFloorPlanWallV2>;
  bounds: { left: number; right: number; top: number; bottom: number };
}): {
  surfaces: RoomSurfaceAssignments | undefined;
  issues: SurfaceMigrationReviewIssue[];
} {
  const source = previous.surfaces ?? previous.surfaceFinishes;
  const sourceFaces = source?.walls?.faces;
  if (!source || !sourceFaces || !Object.keys(sourceFaces).length) {
    return { surfaces: source, issues: [] };
  }
  const outer = compiledRoom.wallLoops.find((loop) => loop.kind === "outer");
  if (!outer) return { surfaces: source, issues: [] };
  const canonicalWallIds = new Set(
    compiledRoom.wallLoops.flatMap((loop) => loop.walls.map((reference) => reference.wallId))
  );
  const resultFaces: Record<string, SurfaceSettings> = { ...sourceFaces };
  const migratedTargets = new Map<string, { faceId: string; settings: SurfaceSettings }>();
  const issues: SurfaceMigrationReviewIssue[] = [];
  const lineOnlyOuter = outer.walls.every(
    (reference) => wallById.get(reference.wallId)?.path.kind === "line"
  );
  const orderedFaceCountMatches =
    lineOnlyOuter &&
    (!previous.planPolygon || previous.planPolygon.length === outer.walls.length);

  const reportAmbiguous = (faceId: string, reason: string) => {
    issues.push({
      code: "AMBIGUOUS_LEGACY_WALL_FACE",
      roomId,
      faceId,
      message: `Legacy wall face ${faceId} was retained but not marked canonical: ${reason}`,
    });
  };

  for (const [faceId, settings] of Object.entries(sourceFaces)) {
    if (canonicalWallIds.has(faceId)) continue;
    let targetWallIds: string[] = [];
    const ordered = /^wall-(\d+)$/.exec(faceId);
    if (ordered) {
      const index = Number(ordered[1]);
      if (orderedFaceCountMatches && outer.walls[index]) {
        targetWallIds = [outer.walls[index].wallId];
      }
    } else if (["north", "east", "south", "west"].includes(faceId)) {
      targetWallIds = outer.walls.flatMap((reference) => {
        const wall = wallById.get(reference.wallId);
        return wall &&
          wallTouchesCardinalBoundary(
            wall,
            faceId as RoomOpening2D["wall"],
            bounds
          )
          ? [wall.id]
          : [];
      });
    } else {
      // Unknown historical keys may belong to plugins or prior editor
      // versions. Preserve them, but do not infer a canonical identity.
      reportAmbiguous(faceId, "the key has no deterministic canonical mapping");
      continue;
    }

    targetWallIds = [...new Set(targetWallIds)];
    if (targetWallIds.length !== 1) {
      reportAmbiguous(
        faceId,
        targetWallIds.length
          ? "more than one canonical boundary wall matches"
          : "no one-to-one canonical boundary wall matches"
      );
      continue;
    }
    const targetWallId = targetWallIds[0];
    const existingCanonical = sourceFaces[targetWallId];
    if (existingCanonical) continue;
    const alreadyMigrated = migratedTargets.get(targetWallId);
    if (alreadyMigrated && !surfaceSettingsEqual(alreadyMigrated.settings, settings)) {
      reportAmbiguous(
        faceId,
        `it conflicts with legacy face ${alreadyMigrated.faceId} for canonical wall ${targetWallId}`
      );
      continue;
    }
    resultFaces[targetWallId] = { ...settings };
    migratedTargets.set(targetWallId, { faceId, settings });
  }

  return {
    surfaces: {
      ...source,
      walls: {
        ...source.walls,
        faces: resultFaces,
      },
    },
    issues,
  };
}

function toLegacyRoomType(roomType: string): RoomType {
  const normalized = roomType.toLowerCase();
  if (normalized.includes("bed")) return "bedroom";
  if (normalized.includes("kitchen") || normalized.includes("yard")) return "kitchen";
  if (normalized.includes("bath") || normalized.includes("wc") || normalized.includes("toilet")) {
    return "toilet";
  }
  if (normalized.includes("dining")) return "dining";
  if (normalized.includes("living")) return "living";
  return "custom";
}

function sampleWall(
  wall: CompiledFloorPlanWallV2,
  direction: "forward" | "reverse"
): Array<{ xMm: number; zMm: number }> {
  const authoredStart = direction === "forward" ? wall.start : wall.end;
  if (wall.path.kind === "line" || !wall.center || wall.sweepRadians === undefined) {
    return [authoredStart];
  }
  const sweep = direction === "forward" ? wall.sweepRadians : -wall.sweepRadians;
  const startAngle = Math.atan2(
    authoredStart.zMm - wall.center.zMm,
    authoredStart.xMm - wall.center.xMm
  );
  const radius = Math.hypot(
    authoredStart.xMm - wall.center.xMm,
    authoredStart.zMm - wall.center.zMm
  );
  const segmentCount = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
  return Array.from({ length: segmentCount }, (_, index) => {
    const angle = startAngle + sweep * (index / segmentCount);
    return {
      xMm: Math.round(wall.center!.xMm + Math.cos(angle) * radius),
      zMm: Math.round(wall.center!.zMm + Math.sin(angle) * radius),
    };
  });
}

function roomPolygon(
  loop: CompiledFloorPlanRoomLoopV2,
  wallById: Map<string, CompiledFloorPlanWallV2>
) {
  return loop.walls.flatMap((reference) => {
    const wall = wallById.get(reference.wallId);
    return wall ? sampleWall(wall, reference.direction) : [];
  });
}

function midpoint(
  start: { xMm: number; zMm: number },
  end: { xMm: number; zMm: number }
) {
  return { xMm: (start.xMm + end.xMm) / 2, zMm: (start.zMm + end.zMm) / 2 };
}

function wallOrientationForRoom(
  wall: CompiledFloorPlanWallV2,
  bounds: { left: number; right: number; top: number; bottom: number }
): RoomOpening2D["wall"] | null {
  if (wall.path.kind !== "line") return null;
  const center = midpoint(wall.start, wall.end);
  const horizontal = Math.abs(wall.end.xMm - wall.start.xMm) >= Math.abs(wall.end.zMm - wall.start.zMm);
  if (horizontal) {
    return Math.abs(center.zMm - bounds.top) <= Math.abs(center.zMm - bounds.bottom)
      ? "north"
      : "south";
  }
  return Math.abs(center.xMm - bounds.left) <= Math.abs(center.xMm - bounds.right)
    ? "west"
    : "east";
}

function transformPoint(
  point: { xMm: number; zMm: number },
  transform: FloorPlanAddressTransform
) {
  const { xMm: x, zMm: z } = point;
  switch (transform) {
    case "mirror_x":
      return { xMm: -x, zMm: z };
    case "mirror_z":
      return { xMm: x, zMm: -z };
    case "rotate_90":
      return { xMm: -z, zMm: x };
    case "rotate_180":
      return { xMm: -x, zMm: -z };
    case "rotate_270":
      return { xMm: z, zMm: -x };
    case "mirror_x_rotate_90":
      return { xMm: -z, zMm: -x };
    case "mirror_x_rotate_270":
      return { xMm: z, zMm: x };
    default:
      return point;
  }
}

function reversesOrientation(transform: FloorPlanAddressTransform) {
  return ["mirror_x", "mirror_z", "mirror_x_rotate_90", "mirror_x_rotate_270"].includes(
    transform
  );
}

function swapsPlanAxes(transform: FloorPlanAddressTransform) {
  return [
    "rotate_90",
    "rotate_270",
    "mirror_x_rotate_90",
    "mirror_x_rotate_270",
  ].includes(transform);
}

/** Applies an immutable address binding without duplicating the stored revision. */
export function applyFloorPlanAddressTransformV2(
  document: FloorPlanDocumentV2,
  transform: FloorPlanAddressTransform
): FloorPlanDocumentV2 {
  if (transform === "normal") return structuredClone(document);
  const next = structuredClone(document);
  const transformedByFloor = next.floors.map((floor) => ({
    floor,
    vertices: floor.vertices.map((vertex) => ({
      vertex,
      point: transformPoint(vertex, transform),
    })),
  }));
  const transformedVertices = transformedByFloor.flatMap(
    (entry) => entry.vertices
  );
  const minX = transformedVertices.length
    ? Math.min(...transformedVertices.map((entry) => entry.point.xMm))
    : 0;
  const minZ = transformedVertices.length
    ? Math.min(...transformedVertices.map((entry) => entry.point.zMm))
    : 0;

  // Every floor shares one canonical horizontal coordinate system. Applying a
  // separate translation per floor would erase deliberate inter-storey offsets
  // (for example, an upper floor that steps back from the lower facade).
  for (const { floor, vertices } of transformedByFloor) {
    for (const entry of vertices) {
      entry.vertex.xMm = entry.point.xMm - minX;
      entry.vertex.zMm = entry.point.zMm - minZ;
    }
    // Registration coordinates live in the same canonical plan space as the
    // vertices. Materialising an address transform without transforming these
    // points would leave a verified source overlay registered to the original
    // orientation while the saved design uses the mirrored/rotated geometry.
    for (const calibration of floor.calibrations) {
      for (const controlPoint of calibration.controlPoints) {
        const planPoint = transformPoint(controlPoint.planMm, transform);
        controlPoint.planMm = {
          xMm: planPoint.xMm - minX,
          zMm: planPoint.zMm - minZ,
        };
      }
    }
    if (swapsPlanAxes(transform)) {
      for (const dimension of floor.dimensions) {
        if (dimension.axis === "horizontal") dimension.axis = "vertical";
        else if (dimension.axis === "vertical") dimension.axis = "horizontal";
      }
    }
    if (reversesOrientation(transform)) {
      for (const wall of floor.walls) {
        if (wall.path.kind === "arc") wall.path.clockwise = !wall.path.clockwise;
      }
      for (const opening of floor.openings) {
        if (opening.handing === "left") opening.handing = "right";
        else if (opening.handing === "right") opening.handing = "left";
      }
    }
  }
  return next;
}

/**
 * One-way compatibility adapter. The canonical document remains persisted in
 * the snapshot; legacy rooms/openings are projections for the current editor.
 */
export function canonicalFloorPlanToDesignSnapshot(
  authoredDocument: FloorPlanDocumentV2,
  options: CanonicalDesignAdapterOptions = {}
): CanonicalDesignAdapterResult {
  const transform = options.addressTransform ?? "normal";
  const document = applyFloorPlanAddressTransformV2(authoredDocument, transform);
  const scene = compileFloorPlanDocumentV2(document);
  if (!scene.floors.some((floor) => floor.rooms.length > 0)) {
    throw new Error("The canonical floor plan has no editable rooms");
  }
  const existingById = new Map(
    (options.baseSnapshot?.rooms ?? []).map((room) => [room.id, room])
  );
  const surfaceMigrationReviewIssues: SurfaceMigrationReviewIssue[] = [];
  const rooms: RoomSnapshot[] = scene.floors.flatMap((floor) => {
    const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
    return floor.rooms.map((compiledRoom, roomIndex) => {
      const outer = compiledRoom.wallLoops.find((loop) => loop.kind === "outer");
      if (!outer) throw new Error(`Room ${compiledRoom.id} has no outer loop`);
      const polygon = roomPolygon(outer, wallById);
      if (polygon.length < 3) throw new Error(`Room ${compiledRoom.id} has no usable polygon`);
      const bounds = {
        left: Math.min(...polygon.map((point) => point.xMm)),
        right: Math.max(...polygon.map((point) => point.xMm)),
        top: Math.min(...polygon.map((point) => point.zMm)),
        bottom: Math.max(...polygon.map((point) => point.zMm)),
      };
      const center = {
        xMm: Math.round((bounds.left + bounds.right) / 2),
        zMm: Math.round((bounds.top + bounds.bottom) / 2),
      };
      const adjacentWalls = floor.walls.filter((wall) =>
        wall.adjacentRoomIds.includes(compiledRoom.id)
      );
      const averageWallThickness = adjacentWalls.length
        ? Math.round(
            adjacentWalls.reduce((sum, wall) => sum + wall.thicknessMm, 0) /
              adjacentWalls.length
          )
        : 200;
      const previous = existingById.get(compiledRoom.id);
      const room = createRoom(
        compiledRoom.id,
        compiledRoom.name,
        toLegacyRoomType(compiledRoom.roomType),
        {
          width: (bounds.right - bounds.left) / 1000,
          depth: (bounds.bottom - bounds.top) / 1000,
          wallThickness: averageWallThickness / 1000,
          height: floor.defaults.wallHeight.valueMm / 1000,
          slabThickness: floor.slabThicknessMm / 1000,
        }
      );
      room.floorLevel = floor.levelIndex + 1;
      room.floorLabel = floor.name;
      room.floorElevationMm = floor.elevationMm;
      room.floorStoreyHeightMm = floor.storeyHeightMm;
      room.floorSlabThicknessMm = floor.slabThicknessMm;
      room.planPosition = { x: center.xMm / 1000, z: center.zMm / 1000 };
      room.planShape = "custom_polygon";
      room.planPolygon = polygon.map((point) => ({
        x: (point.xMm - center.xMm) / 1000,
        z: (point.zMm - center.zMm) / 1000,
      }));
      const holePolygons = compiledRoom.wallLoops
        .filter((loop) => loop.kind === "hole")
        .map((loop) => roomPolygon(loop, wallById))
        .filter((points) => points.length >= 3);
      if (holePolygons.length) {
        room.planHoles = holePolygons.map((points) =>
          points.map((point) => ({
            x: (point.xMm - center.xMm) / 1000,
            z: (point.zMm - center.zMm) / 1000,
          }))
        );
      }
      if (previous) {
        const migratedSurfaces = migrateLegacyWallSurfaceFacesToCanonical({
          roomId: compiledRoom.id,
          previous: {
            ...previous,
            surfaces: previous.surfaces,
            surfaceFinishes: undefined,
          },
          compiledRoom,
          wallById,
          bounds,
        });
        const migratedCompatibilitySurfaces = migrateLegacyWallSurfaceFacesToCanonical({
          roomId: compiledRoom.id,
          previous: {
            ...previous,
            surfaces: previous.surfaceFinishes,
            surfaceFinishes: undefined,
          },
          compiledRoom,
          wallById,
          bounds,
        });
        for (const issue of [
          ...migratedSurfaces.issues,
          ...migratedCompatibilitySurfaces.issues,
        ]) {
          if (
            !surfaceMigrationReviewIssues.some(
              (existing) =>
                existing.roomId === issue.roomId &&
                existing.faceId === issue.faceId &&
                existing.message === issue.message
            )
          ) {
            surfaceMigrationReviewIssues.push(issue);
          }
        }
        room.items = previous.items;
        room.zones = previous.zones;
        room.savedViews = previous.savedViews;
        room.layoutVersions = previous.layoutVersions;
        room.surfaces =
          migratedSurfaces.surfaces ?? migratedCompatibilitySurfaces.surfaces;
        room.surfaceFinishes =
          migratedCompatibilitySurfaces.surfaces ?? migratedSurfaces.surfaces;
        room.surfaceOpacity = previous.surfaceOpacity;
        room.ceilingVisible = previous.ceilingVisible;
      }
      if (roomIndex === 0 && !room.surfaces) room.surfaces = {};
      return room;
    });
  });

  const openings: RoomOpening2D[] = scene.floors.flatMap((floor) => {
    const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
    const boundsByRoom = new Map(
      floor.rooms.flatMap((room) => {
        const outer = room.wallLoops.find((loop) => loop.kind === "outer");
        if (!outer) return [];
        const polygon = roomPolygon(outer, wallById);
        if (polygon.length < 3) return [];
        return [[room.id, {
          left: Math.min(...polygon.map((point) => point.xMm)),
          right: Math.max(...polygon.map((point) => point.xMm)),
          top: Math.min(...polygon.map((point) => point.zMm)),
          bottom: Math.max(...polygon.map((point) => point.zMm)),
        }] as const];
      })
    );
    return floor.openings.flatMap((opening) => {
      const wall = wallById.get(opening.wallId);
      const roomId = wall?.adjacentRoomIds[0];
      const bounds = roomId ? boundsByRoom.get(roomId) : null;
      if (!wall || !roomId || !bounds) return [];
      const orientation = wallOrientationForRoom(wall, bounds);
      if (!orientation) return [];
      const center = midpoint(opening.start, opening.end);
      const roomCenterX = (bounds.left + bounds.right) / 2;
      const roomCenterZ = (bounds.top + bounds.bottom) / 2;
      const offsetMm = Math.round(
        orientation === "north" || orientation === "south"
          ? center.xMm - roomCenterX
          : center.zMm - roomCenterZ
      );
      const doorStyle: RoomOpening2D["doorStyle"] =
        opening.operation === "open"
          ? "open"
          : opening.operation === "sliding"
            ? "sliding"
            : opening.operation === "folding"
              ? "folding"
              : "swing";
      return [{
        id: opening.id,
        roomId,
        wall: orientation,
        offsetMm,
        widthMm: opening.widthMm,
        heightMm: opening.heightMm,
        bottomMm: opening.bottomMm,
        kind:
          opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre"
            ? "window"
            : "door",
        doorStyle,
        canonicalWallId: opening.wallId,
        operation: opening.operation,
        evidence: {
          height: opening.heightEvidence,
          sillHeight: opening.sillHeightEvidence,
        },
      }];
    });
  });

  const fixedElements: FixedElement2D[] = scene.floors.flatMap((floor) =>
    floor.structures.map((structure) => {
      const left = Math.min(...structure.points.map((point) => point.xMm));
      const right = Math.max(...structure.points.map((point) => point.xMm));
      const top = Math.min(...structure.points.map((point) => point.zMm));
      const bottom = Math.max(...structure.points.map((point) => point.zMm));
      return {
        id: structure.id,
        kind: "reference_zone" as const,
        xMm: Math.round((left + right) / 2),
        zMm: Math.round((top + bottom) / 2),
        widthMm: right - left,
        depthMm: bottom - top,
        rotationDeg: 0,
        label: structure.name,
        locked: structure.locked,
        canonicalKind: structure.kind,
      };
    })
  );

  const snapshot: DesignSnapshot = {
    ...(options.baseSnapshot ?? {}),
    version: 3,
    rooms,
    activeRoomId:
      rooms.find((room) => room.id === options.baseSnapshot?.activeRoomId)?.id ?? rooms[0].id,
    title: options.title ?? options.baseSnapshot?.title ?? document.id,
    floorPlan: {
      ...options.baseSnapshot?.floorPlan,
      canonicalDocument: document,
      canonicalGeometryHash: scene.geometryHash,
      revisionId: document.revisionId,
      sourceRevisionGeometryHash: options.sourceRevisionGeometryHash,
      verificationTier:
        surfaceMigrationReviewIssues.length > 0
          ? "needs_review"
          : document.verification.tier,
      surfaceMigrationReviewIssues:
        surfaceMigrationReviewIssues.length > 0
          ? surfaceMigrationReviewIssues
          : undefined,
      addressTransform: transform,
      addressBinding: options.addressBinding,
      sourceJobId: options.sourceJobId,
      sourceAssetSha256:
        options.sourceAssetSha256 ?? authoredDocument.sources[0]?.sha256,
      orientationConfirmed:
        options.orientationConfirmed ??
        options.baseSnapshot?.floorPlan?.orientationConfirmed ??
        false,
      underlay:
        options.underlay === undefined
          ? options.baseSnapshot?.floorPlan?.underlay
          : options.underlay,
      openings,
      fixedElements,
    },
  };
  return {
    snapshot,
    openings,
    fixedElements,
    scene,
    surfaceMigrationReviewIssues,
  };
}
