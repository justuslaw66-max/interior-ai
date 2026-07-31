import {
  BufferGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
} from "three";

import type { CompiledFloorPlanStructureV2 } from "@/lib/floor-plan-compiler-v2";
import type { PlanarUnionPolygonMm } from "@/lib/floor-plan-planar-union";
import type {
  CanonicalFloorPlanLineSegment,
  CanonicalFloorPlanWallSolid,
} from "@/lib/floor-plan-render-model";

export function segmentTransform(segment: CanonicalFloorPlanLineSegment) {
  const startX = segment.start.xMm / 1000;
  const startZ = segment.start.zMm / 1000;
  const endX = segment.end.xMm / 1000;
  const endZ = segment.end.zMm / 1000;
  const dx = endX - startX;
  const dz = endZ - startZ;
  return {
    centerX: (startX + endX) / 2,
    centerZ: (startZ + endZ) / 2,
    length: Math.max(0.001, Math.hypot(dx, dz)),
    rotationY: -Math.atan2(dz, dx),
    points: [
      [startX, 0, startZ],
      [endX, 0, endZ],
    ] as [[number, number, number], [number, number, number]],
  };
}

export function wallSolidShape(solid: CanonicalFloorPlanWallSolid) {
  const shape = new Shape();
  const points = [
    solid.footprint.startLeft,
    solid.footprint.endLeft,
    solid.footprint.endRight,
    solid.footprint.startRight,
  ];
  points.forEach((point, index) => {
    const x = point.xMm / 1000;
    const y = -point.zMm / 1000;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

export function appendPlanarRing(
  path: Shape | Path,
  points: PlanarUnionPolygonMm["outer"]
) {
  points.forEach((point, index) => {
    const x = point.xMm / 1000;
    const y = -point.zMm / 1000;
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
}

export function planarUnionShapes(polygons: PlanarUnionPolygonMm[]) {
  return polygons.map((polygon) => {
    const shape = new Shape();
    appendPlanarRing(shape, polygon.outer);
    for (const holePoints of polygon.holes) {
      const hole = new Path();
      appendPlanarRing(hole, holePoints);
      shape.holes.push(hole);
    }
    return shape;
  });
}

export function wallSurfaceEdge(solid: CanonicalFloorPlanWallSolid, side: 1 | -1) {
  const dx = solid.end.xMm - solid.start.xMm;
  const dz = solid.end.zMm - solid.start.zMm;
  const segmentLengthMm = Math.max(1, Math.hypot(dx, dz));
  const normalX = -dz / segmentLengthMm;
  const normalZ = dx / segmentLengthMm;
  const renderOffsetMm = side * 1.5;
  const authoredStart =
    side === 1 ? solid.footprint.startLeft : solid.footprint.endRight;
  const authoredEnd =
    side === 1 ? solid.footprint.endLeft : solid.footprint.startRight;
  return {
    start: {
      x: (authoredStart.xMm + normalX * renderOffsetMm) / 1000,
      z: (authoredStart.zMm + normalZ * renderOffsetMm) / 1000,
    },
    end: {
      x: (authoredEnd.xMm + normalX * renderOffsetMm) / 1000,
      z: (authoredEnd.zMm + normalZ * renderOffsetMm) / 1000,
    },
  };
}

export function wallSurfaceGeometry(solid: CanonicalFloorPlanWallSolid, side: 1 | -1) {
  const edge = wallSurfaceEdge(solid, side);
  const bottom = solid.bottomMm / 1000;
  const top = solid.topMm / 1000;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        edge.start.x,
        bottom,
        edge.start.z,
        edge.end.x,
        bottom,
        edge.end.z,
        edge.end.x,
        top,
        edge.end.z,
        edge.start.x,
        top,
        edge.start.z,
      ],
      3
    )
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

export function preferredRoomId(roomIds: string[], activeRoomId: string | null) {
  return (activeRoomId && roomIds.includes(activeRoomId) ? activeRoomId : roomIds[0]) ?? null;
}

export function structureShape(points: CompiledFloorPlanStructureV2["points"]) {
  const shape = new Shape();
  points.forEach((point, index) => {
    const x = point.xMm / 1000;
    // Shape geometry is authored in XY, then rotated onto the XZ plan plane.
    const y = -point.zMm / 1000;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  if (points.length > 2) {
    shape.lineTo(points[0].xMm / 1000, -points[0].zMm / 1000);
  }
  return shape;
}

export function structureOutlinePoints(
  points: CompiledFloorPlanStructureV2["points"],
  elevation: number
) {
  if (!points.length) return [];
  return [...points, points[0]].map(
    (point) => [point.xMm / 1000, elevation, point.zMm / 1000] as [number, number, number]
  );
}

export function structureColor(kind: CompiledFloorPlanStructureV2["kind"]) {
  if (kind === "ledge") return "#bfdbfe";
  if (kind === "service_strip") return "#fde68a";
  if (kind === "void") return "#f8fafc";
  if (kind === "shaft") return "#cbd5e1";
  if (kind === "column" || kind === "structural_core") return "#94a3b8";
  return "#d1d5db";
}
