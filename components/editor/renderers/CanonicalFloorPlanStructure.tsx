"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Line } from "@react-three/drei/core/Line";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  Path,
  Plane,
  Shape,
  Vector3,
} from "three";
import type {
  CompiledFloorPlanOpeningV2,
  CompiledFloorPlanStructureV2,
} from "@/lib/floor-plan-compiler-v2";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  buildCanonicalOpeningSymbolLinesV2,
  getCanonicalOpeningRenderIdentityV2,
  type CanonicalOpeningSymbolRole,
} from "@/lib/floor-plan-opening-primitives";
import type {
  CanonicalFloorPlanLineSegment,
  CanonicalFloorPlanFloorRenderModel,
  CanonicalFloorPlanRenderModel,
  CanonicalFloorPlanWallSolid,
} from "@/lib/floor-plan-render-model";
import { resolveCanonicalFloorPlan2DActiveFloor } from "@/lib/floor-plan-render-model";
import type { PlanarUnionPolygonMm } from "@/lib/floor-plan-planar-union";
import {
  buildCanonicalFloorSlabPolygons,
  buildCanonicalWallUnionBands,
} from "@/lib/floor-plan-watertight-geometry";
import {
  canonicalWallCutawayKey,
  resolveCanonicalCameraCutawayWallKeys,
  type CanonicalCutawayTarget,
} from "@/lib/floor-plan-camera-cutaway";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "@/lib/floor-materials";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { getWallFaceSurfaceSettings } from "@/lib/surface-settings";
import type { RoomSurfaceAssignments } from "@/lib/room-types";
import { useSurfaceMaterialTexture } from "./useSurfaceMaterialTexture";

type CanonicalPointerEvent = ThreeEvent<MouseEvent | PointerEvent>;

export type CanonicalOpeningDragMetricsV2 = {
  centerMm: { xMm: number; zMm: number };
  widthMm: number;
};

type CanonicalOpeningDragMode = "move" | "resize";

function capturePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as EventTarget & {
    setPointerCapture?: (pointerId: number) => void;
  };
  target.setPointerCapture?.(event.pointerId);
}

function releasePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as EventTarget & {
    releasePointerCapture?: (pointerId: number) => void;
  };
  target.releasePointerCapture?.(event.pointerId);
}

function useCanonicalOpeningDrag({
  opening,
  wallStart,
  wallEnd,
  floorY,
  enabled,
  onEdit,
  onDragStateChange,
}: {
  opening: CompiledFloorPlanOpeningV2;
  wallStart: { xMm: number; zMm: number };
  wallEnd: { xMm: number; zMm: number };
  floorY: number;
  enabled: boolean;
  onEdit?: (
    openingId: string,
    metrics: CanonicalOpeningDragMetricsV2,
    mode: CanonicalOpeningDragMode
  ) => void;
  onDragStateChange?: (dragging: boolean, mode: CanonicalOpeningDragMode) => void;
}) {
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), -floorY), [floorY]);
  const pointRef = useRef(new Vector3());
  const dragRef = useRef<
    | { pointerId: number; mode: "move"; grabDeltaMm: number }
    | { pointerId: number; mode: "resize"; fixedOffsetMm: number }
    | null
  >(null);
  const dx = wallEnd.xMm - wallStart.xMm;
  const dz = wallEnd.zMm - wallStart.zMm;
  const wallLengthMm = Math.hypot(dx, dz);

  const pointerOffsetMm = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const point = event.ray.intersectPlane(plane, pointRef.current);
      if (!point || wallLengthMm <= 0) return null;
      const xMm = point.x * 1000;
      const zMm = point.z * 1000;
      return (
        ((xMm - wallStart.xMm) * dx + (zMm - wallStart.zMm) * dz) /
        wallLengthMm
      );
    },
    [dx, dz, plane, wallLengthMm, wallStart.xMm, wallStart.zMm]
  );

  const emit = useCallback(
    (offsetMm: number, widthMm: number, mode: CanonicalOpeningDragMode) => {
      if (!onEdit || wallLengthMm <= 0) return;
      const centerOffsetMm = offsetMm + widthMm / 2;
      onEdit(
        opening.id,
        {
          centerMm: {
            xMm: Math.round(wallStart.xMm + (dx * centerOffsetMm) / wallLengthMm),
            zMm: Math.round(wallStart.zMm + (dz * centerOffsetMm) / wallLengthMm),
          },
          widthMm: Math.round(widthMm),
        },
        mode
      );
    },
    [dx, dz, onEdit, opening.id, wallLengthMm, wallStart.xMm, wallStart.zMm]
  );

  const beginMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!enabled) return;
      const pointer = pointerOffsetMm(event);
      if (pointer === null) return;
      event.stopPropagation();
      capturePointer(event);
      dragRef.current = {
        pointerId: event.pointerId,
        mode: "move",
        grabDeltaMm: opening.offsetMm + opening.widthMm / 2 - pointer,
      };
      onDragStateChange?.(true, "move");
    },
    [enabled, onDragStateChange, opening.offsetMm, opening.widthMm, pointerOffsetMm]
  );

  const beginResize = useCallback(
    (edge: "start" | "end", event: ThreeEvent<PointerEvent>) => {
      if (!enabled) return;
      event.stopPropagation();
      capturePointer(event);
      dragRef.current = {
        pointerId: event.pointerId,
        mode: "resize",
        fixedOffsetMm:
          edge === "start" ? opening.offsetMm + opening.widthMm : opening.offsetMm,
      };
      onDragStateChange?.(true, "resize");
    },
    [enabled, onDragStateChange, opening.offsetMm, opening.widthMm]
  );

  const move = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const pointer = pointerOffsetMm(event);
      if (pointer === null) return;
      event.stopPropagation();
      if (drag.mode === "move") {
        const halfWidth = opening.widthMm / 2;
        const center = Math.min(
          wallLengthMm - halfWidth,
          Math.max(halfWidth, pointer + drag.grabDeltaMm)
        );
        emit(center - halfWidth, opening.widthMm, "move");
        return;
      }
      const minimumWidthMm = 400;
      let moving = Math.min(wallLengthMm, Math.max(0, pointer));
      if (Math.abs(moving - drag.fixedOffsetMm) < minimumWidthMm) {
        moving = Math.min(
          wallLengthMm,
          Math.max(
            0,
            drag.fixedOffsetMm + (moving >= drag.fixedOffsetMm ? minimumWidthMm : -minimumWidthMm)
          )
        );
      }
      emit(
        Math.min(moving, drag.fixedOffsetMm),
        Math.abs(moving - drag.fixedOffsetMm),
        "resize"
      );
    },
    [emit, opening.widthMm, pointerOffsetMm, wallLengthMm]
  );

  const finish = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      releasePointer(event);
      dragRef.current = null;
      onDragStateChange?.(false, drag.mode);
    },
    [onDragStateChange]
  );

  return { beginMove, beginResize, move, finish };
}

const WALL_SURFACE_TEXTURE_RESOLUTION = {
  maxSize: 4096,
  minSize: 768,
  pixelsPerMeter: 560,
} as const;

function surfaceMaterialFallbackColor(
  material: ReturnType<typeof getRuntimeSurfaceMaterialById>
) {
  const family = material?.classification?.color_family;
  if (family === "grey") return "#b7b7b2";
  if (family === "charcoal") return "#5b5d5a";
  if (family === "brown" || family === "walnut") return "#8b755c";
  if (family === "cream" || family === "beige") return "#d8ccbb";
  if (family === "white") return "#ece9e1";
  return material ? "#c9c2b4" : null;
}

function resolveRoomSurfaceAssignments(room: HousePlanRoom2D): RoomSurfaceAssignments | undefined {
  const compatibility = room.surfaceFinishes;
  const current = room.surfaces;
  if (!compatibility) return current;
  if (!current) return compatibility;
  return {
    ...compatibility,
    ...current,
    walls:
      compatibility.walls || current.walls
        ? {
            ...compatibility.walls,
            ...current.walls,
            default: {
              ...compatibility.walls?.default,
              ...current.walls?.default,
            },
            faces: {
              ...compatibility.walls?.faces,
              ...current.walls?.faces,
            },
          }
        : undefined,
  };
}

function segmentTransform(segment: CanonicalFloorPlanLineSegment) {
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

function wallSolidShape(solid: CanonicalFloorPlanWallSolid) {
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

function appendPlanarRing(
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

function planarUnionShapes(polygons: PlanarUnionPolygonMm[]) {
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

function wallKeySignature(keys: ReadonlySet<string>) {
  return [...keys].sort().join("|");
}

function useCanonicalCameraCutawayWallKeys(
  model: CanonicalFloorPlanRenderModel,
  target: CanonicalCutawayTarget | null
) {
  const { camera } = useThree();
  const [cutawayWallKeys, setCutawayWallKeys] = useState(() =>
    resolveCanonicalCameraCutawayWallKeys(model, camera.position, target)
  );
  const signatureRef = useRef(wallKeySignature(cutawayWallKeys));

  useFrame(() => {
    const next = resolveCanonicalCameraCutawayWallKeys(
      model,
      camera.position,
      target
    );
    const signature = wallKeySignature(next);
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;
    setCutawayWallKeys(next);
  });

  return cutawayWallKeys;
}

function wallSurfaceEdge(solid: CanonicalFloorPlanWallSolid, side: 1 | -1) {
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

function wallSurfaceGeometry(solid: CanonicalFloorPlanWallSolid, side: 1 | -1) {
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

function preferredRoomId(roomIds: string[], activeRoomId: string | null) {
  return (activeRoomId && roomIds.includes(activeRoomId) ? activeRoomId : roomIds[0]) ?? null;
}

function structureShape(points: CompiledFloorPlanStructureV2["points"]) {
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

function structureOutlinePoints(
  points: CompiledFloorPlanStructureV2["points"],
  elevation: number
) {
  if (!points.length) return [];
  return [...points, points[0]].map(
    (point) => [point.xMm / 1000, elevation, point.zMm / 1000] as [number, number, number]
  );
}

function structureColor(kind: CompiledFloorPlanStructureV2["kind"]) {
  if (kind === "ledge") return "#bfdbfe";
  if (kind === "service_strip") return "#fde68a";
  if (kind === "void") return "#f8fafc";
  if (kind === "shaft") return "#cbd5e1";
  if (kind === "column" || kind === "structural_core") return "#94a3b8";
  return "#d1d5db";
}

function CanonicalStructure2D({
  structure,
  floorId,
  geometryHash,
  theme,
}: {
  structure: CompiledFloorPlanStructureV2;
  floorId: string;
  geometryHash: string;
  theme: "consumer" | "pro";
}) {
  const shape = useMemo(() => structureShape(structure.points), [structure.points]);
  const outline = useMemo(
    () => structureOutlinePoints(structure.points, 0.012),
    [structure.points]
  );
  if (structure.points.length < 3) return null;
  const color = structureColor(structure.kind);
  return (
    <group
      userData={{
        testId: "canonical-structure-2d",
        canonicalFloorId: floorId,
        canonicalStructureId: structure.id,
        canonicalStructureKind: structure.kind,
        canonicalGeometryHash: geometryHash,
      }}
    >
      {structure.kind !== "void" && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} raycast={() => null}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial
            color={theme === "pro" && structure.kind === "other" ? "#a1a1aa" : color}
            transparent
            opacity={structure.kind === "ledge" || structure.kind === "service_strip" ? 0.42 : 0.62}
            depthWrite={false}
          />
        </mesh>
      )}
      <Line
        points={outline}
        color={structure.kind === "void" ? "#64748b" : "#6b7280"}
        lineWidth={structure.locked ? 1.6 : 1.2}
        dashed={structure.kind === "void"}
        dashSize={0.12}
        gapSize={0.08}
        raycast={() => null}
      />
    </group>
  );
}

function CanonicalStructure3D({
  structure,
  floorId,
  floorElevationMm,
  geometryHash,
  opacity,
}: {
  structure: CompiledFloorPlanStructureV2;
  floorId: string;
  floorElevationMm: number;
  geometryHash: string;
  opacity: number;
}) {
  const shape = useMemo(() => structureShape(structure.points), [structure.points]);
  const baseMeters = (floorElevationMm + structure.baseOffsetMm) / 1000;
  const heightMeters = Math.max(0.001, structure.heightMm / 1000);
  const outline = useMemo(
    () => structureOutlinePoints(structure.points, baseMeters + 0.003),
    [baseMeters, structure.points]
  );
  if (structure.points.length < 3) return null;
  if (structure.kind === "void") {
    return (
      <Line
        points={outline}
        color="#64748b"
        lineWidth={1.4}
        dashed
        dashSize={0.12}
        gapSize={0.08}
        raycast={() => null}
        userData={{
          testId: "canonical-structure-3d",
          canonicalFloorId: floorId,
          canonicalStructureId: structure.id,
          canonicalStructureKind: structure.kind,
          canonicalGeometryHash: geometryHash,
        }}
      />
    );
  }
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, baseMeters, 0]}
      raycast={() => null}
      userData={{
        testId: "canonical-structure-3d",
        canonicalFloorId: floorId,
        canonicalStructureId: structure.id,
        canonicalStructureKind: structure.kind,
        canonicalGeometryHash: geometryHash,
      }}
    >
      <extrudeGeometry args={[shape, { depth: heightMeters, bevelEnabled: false }]} />
      <meshStandardMaterial
        color={structureColor(structure.kind)}
        roughness={0.86}
        transparent={opacity < 0.999 || structure.kind === "ledge" || structure.kind === "service_strip"}
        opacity={
          opacity * (structure.kind === "ledge" || structure.kind === "service_strip" ? 0.68 : 1)
        }
      />
    </mesh>
  );
}

function openingColor(opening: CompiledFloorPlanOpeningV2, selected: boolean) {
  if (selected) return "#f97316";
  if (opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre") {
    return "#0891b2";
  }
  return "#1d4ed8";
}

function symbolLineStyle(role: CanonicalOpeningSymbolRole) {
  if (role === "swing_arc") return { width: 1.15, dashed: true };
  if (role === "host_span") return { width: 3.2, dashed: false };
  if (role === "open_jamb" || role === "vent_slat") return { width: 1.35, dashed: false };
  return { width: 1.8, dashed: false };
}

function CanonicalOpening2DSymbol({
  opening,
  wallId,
  floorId,
  hostSegments,
  geometryHash,
  selected,
  interactive,
  onSelect,
  wallStart,
  wallEnd,
  onEdit,
  onDragStateChange,
}: {
  opening: CompiledFloorPlanOpeningV2;
  wallId: string;
  floorId: string;
  hostSegments: CanonicalFloorPlanLineSegment[];
  geometryHash: string;
  selected: boolean;
  interactive: boolean;
  onSelect?: (openingId: string | null) => void;
  wallStart: { xMm: number; zMm: number };
  wallEnd: { xMm: number; zMm: number };
  onEdit?: (
    openingId: string,
    metrics: CanonicalOpeningDragMetricsV2,
    mode: CanonicalOpeningDragMode
  ) => void;
  onDragStateChange?: (dragging: boolean, mode: CanonicalOpeningDragMode) => void;
}) {
  const identity = getCanonicalOpeningRenderIdentityV2(opening);
  const symbols = buildCanonicalOpeningSymbolLinesV2(opening);
  const exactHostPoints = hostSegments.length
    ? [hostSegments[0].start, ...hostSegments.map((segment) => segment.end)]
    : [opening.start, opening.end];
  const color = openingColor(opening, selected);
  const drag = useCanonicalOpeningDrag({
    opening,
    wallStart,
    wallEnd,
    floorY: 0,
    enabled: interactive && Boolean(onEdit),
    onEdit,
    onDragStateChange,
  });
  return (
    <group
      userData={{
        testId: "canonical-opening-symbol-2d",
        canonicalFloorId: floorId,
        canonicalOpeningId: opening.id,
        canonicalWallId: wallId,
        canonicalOpeningKind: opening.kind,
        canonicalOperation: opening.operation,
        canonicalHinge: opening.hinge,
        canonicalHanding: opening.handing,
        canonicalHostStartMm: identity.start,
        canonicalHostEndMm: identity.end,
        canonicalBottomMm: opening.bottomMm,
        canonicalTopMm: opening.topMm,
        canonicalWidthMm: opening.widthMm,
        canonicalGeometryHash: geometryHash,
      }}
    >
      {symbols.map((symbol) => {
        const style = symbolLineStyle(symbol.role);
        const sourcePoints = symbol.role === "host_span" ? exactHostPoints : symbol.points;
        return (
          <Line
            key={`${opening.id}:${symbol.role}:${symbol.points
              .map((point) => `${point.xMm},${point.zMm}`)
              .join(";")}`}
            points={sourcePoints.map((point) => [point.xMm / 1000, 0.014, point.zMm / 1000])}
            color={color}
            lineWidth={selected && symbol.role === "host_span" ? 5 : style.width}
            dashed={style.dashed || opening.operation === "open"}
            dashSize={0.08}
            gapSize={0.05}
            raycast={interactive && symbol.role === "host_span" ? undefined : () => null}
            userData={{
              testId: symbol.role === "host_span" ? "canonical-opening-2d" : "canonical-opening-semantic-2d",
              canonicalFloorId: floorId,
              canonicalOpeningId: opening.id,
              canonicalWallId: wallId,
              canonicalSymbolRole: symbol.role,
              canonicalOperation: opening.operation,
              canonicalGeometryHash: geometryHash,
            }}
            onClick={
              interactive && symbol.role === "host_span"
                ? (event: CanonicalPointerEvent) => {
                    event.stopPropagation();
                    onSelect?.(opening.id);
                  }
                : undefined
            }
            onPointerDown={
              interactive && symbol.role === "host_span" && onEdit
                ? (event) => {
                    onSelect?.(opening.id);
                    drag.beginMove(event);
                  }
                : undefined
            }
            onPointerMove={
              interactive && symbol.role === "host_span" && onEdit
                ? drag.move
                : undefined
            }
            onPointerUp={
              interactive && symbol.role === "host_span" && onEdit
                ? drag.finish
                : undefined
            }
            onPointerCancel={
              interactive && symbol.role === "host_span" && onEdit
                ? drag.finish
                : undefined
            }
          />
        );
      })}
      {interactive && selected && onEdit && (
        <>
          {(["start", "end"] as const).map((edge) => {
            const point = edge === "start" ? opening.start : opening.end;
            return (
              <mesh
                key={`${opening.id}:resize:${edge}`}
                position={[point.xMm / 1000, 0.026, point.zMm / 1000]}
                rotation-x={-Math.PI / 2}
                userData={{
                  testId: "canonical-opening-resize-handle-2d",
                  canonicalOpeningId: opening.id,
                  canonicalResizeEdge: edge,
                }}
                onPointerDown={(event) => drag.beginResize(edge, event)}
                onPointerMove={drag.move}
                onPointerUp={drag.finish}
                onPointerCancel={drag.finish}
              >
                <circleGeometry args={[0.085, 20]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            );
          })}
        </>
      )}
    </group>
  );
}

function CanonicalWallSolidHitMesh({
  solid,
  wallId,
  pathKind,
  thicknessMm,
  floorElevationMm,
  geometryHash,
  roomId,
  onSelectWall,
  onSelectOpening,
}: {
  solid: CanonicalFloorPlanWallSolid;
  wallId: string;
  pathKind: "line" | "arc";
  thicknessMm: number;
  floorElevationMm: number;
  geometryHash: string;
  roomId: string | null;
  onSelectWall?: (
    wallId: string,
    roomId: string | null,
    event: CanonicalPointerEvent
  ) => void;
  onSelectOpening?: (openingId: string | null) => void;
}) {
  const shape = useMemo(() => wallSolidShape(solid), [solid]);
  const height = Math.max(0.001, (solid.topMm - solid.bottomMm) / 1000);
  return (
    <mesh
      position={[0, floorElevationMm / 1000 + solid.bottomMm / 1000, 0]}
      rotation-x={-Math.PI / 2}
      userData={{
        testId: "canonical-wall-3d",
        canonicalWallId: wallId,
        canonicalPathKind: pathKind,
        canonicalThicknessMm: thicknessMm,
        canonicalGeometryHash: geometryHash,
      }}
      onClick={(event: CanonicalPointerEvent) => {
        event.stopPropagation();
        onSelectWall?.(wallId, roomId, event);
        onSelectOpening?.(null);
      }}
    >
      <extrudeGeometry
        args={[shape, { depth: height, bevelEnabled: false, steps: 1 }]}
      />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
    </mesh>
  );
}

function CanonicalFloorSlab3D({
  floor,
  geometryHash,
}: {
  floor: CanonicalFloorPlanFloorRenderModel;
  geometryHash: string;
}) {
  const { camera } = useThree();
  const slabRef = useRef<Mesh | null>(null);
  const polygons = useMemo(() => buildCanonicalFloorSlabPolygons(floor), [floor]);
  const shapes = useMemo(() => planarUnionShapes(polygons), [polygons]);
  const thicknessMeters = Math.max(0.01, floor.slabThicknessMm / 1000);
  useFrame(() => {
    if (!slabRef.current) return;
    slabRef.current.visible =
      camera.position.y > floor.elevationMm / 1000 - thicknessMeters * 0.35;
  });
  if (!shapes.length) return null;
  return (
    <mesh
      ref={slabRef}
      position={[0, floor.elevationMm / 1000 - thicknessMeters, 0]}
      rotation-x={-Math.PI / 2}
      raycast={() => null}
      userData={{
        testId: "canonical-floor-slab-3d",
        canonicalFloorId: floor.id,
        canonicalSlabPolygonCount: polygons.length,
        canonicalGeometryHash: geometryHash,
      }}
    >
      <extrudeGeometry
        args={[shapes, { depth: thicknessMeters, bevelEnabled: false, steps: 1 }]}
      />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
    </mesh>
  );
}

function CanonicalWallBodies3D({
  floor,
  geometryHash,
  opacity,
  cutawayWallKeys,
}: {
  floor: CanonicalFloorPlanFloorRenderModel;
  geometryHash: string;
  opacity: number;
  cutawayWallKeys: ReadonlySet<string>;
}) {
  const bands = useMemo(() => {
    const excludedWallIds = new Set(
      floor.walls
        .filter((wall) =>
          cutawayWallKeys.has(canonicalWallCutawayKey(floor.id, wall.id))
        )
        .map((wall) => wall.id)
    );
    return buildCanonicalWallUnionBands(floor, { excludedWallIds });
  }, [cutawayWallKeys, floor]);
  return bands.map((band, index) => {
    const shapes = planarUnionShapes(band.polygons);
    const heightMeters = Math.max(0.001, (band.topMm - band.bottomMm) / 1000);
    return (
      <mesh
        key={`${floor.id}:wall-band:${band.bottomMm}:${band.topMm}:${index}`}
        position={[0, floor.elevationMm / 1000 + band.bottomMm / 1000, 0]}
        rotation-x={-Math.PI / 2}
        raycast={() => null}
        userData={{
          testId: "canonical-wall-body-3d",
          canonicalFloorId: floor.id,
          canonicalWallBandBottomMm: band.bottomMm,
          canonicalWallBandTopMm: band.topMm,
          canonicalWallPolygonCount: band.polygons.length,
          canonicalGeometryHash: geometryHash,
        }}
      >
        <extrudeGeometry
          args={[shapes, { depth: heightMeters, bevelEnabled: false, steps: 1 }]}
        />
        <meshStandardMaterial
          color="#9b978f"
          roughness={0.82}
          transparent={opacity < 0.999}
          opacity={opacity}
        />
      </mesh>
    );
  });
}

function CanonicalWallSurfaceMesh({
  solid,
  wallId,
  floorId,
  floorElevationMm,
  room,
  side,
  active,
  selected,
  opacity,
  geometryHash,
  interactive,
  onSelectWall,
  onSelectOpening,
}: {
  solid: CanonicalFloorPlanWallSolid;
  wallId: string;
  floorId: string;
  floorElevationMm: number;
  room: HousePlanRoom2D;
  side: 1 | -1;
  active: boolean;
  selected: boolean;
  opacity: number;
  geometryHash: string;
  interactive: boolean;
  onSelectWall?: (wallId: string, roomId: string | null, event: CanonicalPointerEvent) => void;
  onSelectOpening?: (openingId: string | null) => void;
}) {
  const { gl } = useThree();
  const edge = wallSurfaceEdge(solid, side);
  const geometry = useMemo(() => wallSurfaceGeometry(solid, side), [side, solid]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const surfaceLength = Math.max(
    0.001,
    Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z)
  );
  const height = Math.max(0.001, (solid.topMm - solid.bottomMm) / 1000);
  const settings = getWallFaceSurfaceSettings(
    resolveRoomSurfaceAssignments(room),
    wallId,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const material = getRuntimeSurfaceMaterialById(settings.materialId);
  const texture = useSurfaceMaterialTexture({
    material,
    roomWidthMeters: surfaceLength,
    roomDepthMeters: height,
    floorScale: settings.scale,
    rotationRad: (settings.rotationDeg * Math.PI) / 180,
    floorPattern: settings.pattern,
    patternOffset: settings.offset,
    jointSizeMm: settings.jointSizeMm,
    jointColor: settings.jointColor,
    maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
    uvMode: "normalized",
    textureResolution: WALL_SURFACE_TEXTURE_RESOLUTION,
  });
  const color = texture
    ? "#ffffff"
    : settings.paintColorHex ??
      surfaceMaterialFallbackColor(material) ??
      (active ? "#fbfbf7" : "#ddddda");
  const roomOpacity = Math.max(
    0.05,
    Math.min(1, Number.isFinite(room.surfaceOpacity?.wall) ? room.surfaceOpacity!.wall! : 1)
  );
  return (
    <mesh
      position={[0, floorElevationMm / 1000, 0]}
      renderOrder={12}
      raycast={interactive ? undefined : () => null}
      userData={{
        testId: "canonical-wall-surface-3d",
        canonicalFloorId: floorId,
        canonicalWallId: wallId,
        canonicalRoomId: room.id,
        canonicalRoomSide: side,
        canonicalSurfaceFaceId: wallId,
        canonicalMaterialId: settings.materialId,
        canonicalGeometryHash: geometryHash,
      }}
      onClick={
        interactive
          ? (event: CanonicalPointerEvent) => {
              event.stopPropagation();
              onSelectWall?.(wallId, room.id, event);
              onSelectOpening?.(null);
            }
          : undefined
      }
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial
        color={color}
        map={texture ?? undefined}
        roughness={material?.rendering.roughness ?? 0.86}
        metalness={material?.rendering.metalness ?? 0}
        side={DoubleSide}
        transparent={opacity * roomOpacity < 0.999}
        opacity={opacity * roomOpacity}
        depthWrite={opacity * roomOpacity > 0.34}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
      {selected && (
        <Line
          points={[
            [edge.start.x, solid.bottomMm / 1000 + 0.02, edge.start.z],
            [edge.end.x, solid.bottomMm / 1000 + 0.02, edge.end.z],
            [edge.end.x, solid.topMm / 1000 - 0.02, edge.end.z],
            [edge.start.x, solid.topMm / 1000 - 0.02, edge.start.z],
            [edge.start.x, solid.bottomMm / 1000 + 0.02, edge.start.z],
          ]}
          color="#f97316"
          lineWidth={2.2}
          raycast={() => null}
        />
      )}
    </mesh>
  );
}

function CanonicalOpening3DSymbol({
  opening,
  wallId,
  wallThicknessMm,
  floorId,
  floorElevationMm,
  hostSegments,
  geometryHash,
  selected,
  opacity,
  interactive,
  onSelect,
  wallStart,
  wallEnd,
  onEdit,
  onDragStateChange,
}: {
  opening: CompiledFloorPlanOpeningV2;
  wallId: string;
  wallThicknessMm: number;
  floorId: string;
  floorElevationMm: number;
  hostSegments: CanonicalFloorPlanLineSegment[];
  geometryHash: string;
  selected: boolean;
  opacity: number;
  interactive: boolean;
  onSelect?: (openingId: string | null) => void;
  wallStart: { xMm: number; zMm: number };
  wallEnd: { xMm: number; zMm: number };
  onEdit?: (
    openingId: string,
    metrics: CanonicalOpeningDragMetricsV2,
    mode: CanonicalOpeningDragMode
  ) => void;
  onDragStateChange?: (dragging: boolean, mode: CanonicalOpeningDragMode) => void;
}) {
  const identity = getCanonicalOpeningRenderIdentityV2(opening);
  const chord: CanonicalFloorPlanLineSegment = {
    start: opening.start,
    end: opening.end,
    startOffsetMm: opening.offsetMm,
    endOffsetMm: opening.offsetMm + opening.widthMm,
  };
  const geometry = segmentTransform(chord);
  const spanLength = Math.max(0.001, opening.widthMm / 1000);
  const height = Math.max(0.001, opening.heightMm / 1000);
  const bottom = opening.bottomMm / 1000;
  const color = openingColor(opening, selected);
  const normalSign = opening.handing === "right" ? -1 : 1;
  const hingeX = opening.hinge === "end" ? spanLength / 2 : -spanLength / 2;
  const panelMaterial = () => (
    <meshStandardMaterial
      color={color}
      transparent
      opacity={Math.min(0.82, opacity * 0.72)}
      roughness={0.55}
      side={DoubleSide}
    />
  );
  const semantic =
    opening.operation === "open" || opening.kind === "open_passage" ? (
      <Line
        points={[
          [-spanLength / 2, bottom, 0],
          [-spanLength / 2, bottom + height, 0],
          [spanLength / 2, bottom + height, 0],
          [spanLength / 2, bottom, 0],
        ]}
        color={color}
        lineWidth={1.8}
        dashed
        dashSize={0.08}
        gapSize={0.05}
        raycast={() => null}
      />
    ) : opening.kind === "vent" || opening.kind === "louvre" ? (
      <group>
        {Array.from({ length: 6 }, (_, index) => (
          <mesh
            key={`${opening.id}:slat:${index}`}
            position={[0, bottom + (height * (index + 1)) / 7, 0]}
            raycast={() => null}
          >
            <boxGeometry args={[spanLength, 0.025, Math.max(0.025, wallThicknessMm / 2500)]} />
            {panelMaterial()}
          </mesh>
        ))}
      </group>
    ) : opening.kind === "window" || opening.operation === "fixed" ? (
      <mesh position={[0, bottom + height / 2, 0]} raycast={() => null}>
        <boxGeometry args={[spanLength, height, 0.025]} />
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={Math.min(0.48, opacity * 0.42)}
          roughness={0.12}
          transmission={0.35}
          side={DoubleSide}
        />
      </mesh>
    ) : opening.operation === "sliding" ? (
      <group position={[0, bottom + height / 2, 0]}>
        {[-1, 1].map((direction) => (
          <mesh
            key={`${opening.id}:sliding:${direction}`}
            position={[direction * spanLength * 0.23, 0, direction * 0.025]}
            raycast={() => null}
          >
            <boxGeometry args={[spanLength * 0.54, height, 0.035]} />
            {panelMaterial()}
          </mesh>
        ))}
      </group>
    ) : opening.operation === "folding" ? (
      <group position={[0, bottom + height / 2, 0]}>
        {Array.from({ length: 4 }, (_, index) => (
          <mesh
            key={`${opening.id}:fold:${index}`}
            position={[-spanLength * 0.375 + index * spanLength * 0.25, 0, index % 2 ? 0.035 : -0.035]}
            rotation-y={index % 2 ? 0.34 : -0.34}
            raycast={() => null}
          >
            <boxGeometry args={[spanLength / 4, height, 0.03]} />
            {panelMaterial()}
          </mesh>
        ))}
      </group>
    ) : opening.handing === "double" ? (
      <group position={[0, bottom + height / 2, 0]}>
        {[-1, 1].map((direction) => (
          <mesh
            key={`${opening.id}:swing:${direction}`}
            position={[direction * spanLength / 2, 0, normalSign * spanLength / 4]}
            raycast={() => null}
          >
            <boxGeometry args={[0.035, height, spanLength / 2]} />
            {panelMaterial()}
          </mesh>
        ))}
      </group>
    ) : (
      <mesh
        position={[hingeX, bottom + height / 2, normalSign * spanLength / 2]}
        raycast={() => null}
      >
        <boxGeometry args={[0.035, height, spanLength]} />
        {panelMaterial()}
      </mesh>
    );

  const exactHostSegments = hostSegments.length ? hostSegments : [chord];
  const drag = useCanonicalOpeningDrag({
    opening,
    wallStart,
    wallEnd,
    floorY: floorElevationMm / 1000,
    enabled: interactive && Boolean(onEdit),
    onEdit,
    onDragStateChange,
  });
  return (
    <>
      <group
        position={[geometry.centerX, floorElevationMm / 1000, geometry.centerZ]}
        rotation-y={geometry.rotationY}
        userData={{
          testId: "canonical-opening-symbol-3d",
          canonicalFloorId: floorId,
          canonicalOpeningId: opening.id,
          canonicalWallId: wallId,
          canonicalOpeningKind: opening.kind,
          canonicalOperation: opening.operation,
          canonicalHinge: opening.hinge,
          canonicalHanding: opening.handing,
          canonicalHostStartMm: identity.start,
          canonicalHostEndMm: identity.end,
          canonicalBottomMm: identity.bottomMm,
          canonicalTopMm: identity.topMm,
          canonicalWidthMm: opening.widthMm,
          canonicalGeometryHash: geometryHash,
        }}
      >
        {semantic}
      </group>
      {exactHostSegments.map((segment, segmentIndex) => {
        const host = segmentTransform(segment);
        return (
          <mesh
            key={`${opening.id}:hit:${segmentIndex}`}
            position={[
              host.centerX,
              floorElevationMm / 1000 + bottom + height / 2,
              host.centerZ,
            ]}
            rotation-y={host.rotationY}
            raycast={interactive ? undefined : () => null}
            userData={{
              testId: "canonical-opening-3d",
              canonicalOpeningId: opening.id,
              canonicalWallId: wallId,
              canonicalHostSegmentLength: host.length,
              canonicalOperation: opening.operation,
              canonicalGeometryHash: geometryHash,
            }}
            onClick={
              interactive
                ? (event: CanonicalPointerEvent) => {
                    event.stopPropagation();
                    onSelect?.(opening.id);
                  }
                : undefined
            }
            onPointerDown={
              interactive && onEdit
                ? (event) => {
                    onSelect?.(opening.id);
                    drag.beginMove(event);
                  }
                : undefined
            }
            onPointerMove={interactive && onEdit ? drag.move : undefined}
            onPointerUp={interactive && onEdit ? drag.finish : undefined}
            onPointerCancel={interactive && onEdit ? drag.finish : undefined}
          >
            <boxGeometry args={[host.length, height, Math.max(0.08, wallThicknessMm / 1000)]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={selected ? 0.18 : 0.001}
              depthWrite={false}
            />
          </mesh>
        );
      })}
      {interactive && selected && onEdit &&
        (["start", "end"] as const).map((edge) => {
          const point = edge === "start" ? opening.start : opening.end;
          return (
            <mesh
              key={`${opening.id}:resize:${edge}`}
              position={[
                point.xMm / 1000,
                floorElevationMm / 1000 + bottom + Math.min(height / 2, 0.55),
                point.zMm / 1000,
              ]}
              userData={{
                testId: "canonical-opening-resize-handle-3d",
                canonicalOpeningId: opening.id,
                canonicalResizeEdge: edge,
              }}
              onPointerDown={(event) => drag.beginResize(edge, event)}
              onPointerMove={drag.move}
              onPointerUp={drag.finish}
              onPointerCancel={drag.finish}
            >
              <sphereGeometry args={[0.09, 16, 12]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          );
        })}
    </>
  );
}

type CanonicalFloorPlanWalls2DProps = {
  model: CanonicalFloorPlanRenderModel;
  activeFloorId?: string | null;
  /** One-based editor floor level (`canonical floor.levelIndex + 1`). */
  activeFloorLevel: number;
  activeRoomId: string | null;
  selectedOpeningId?: string | null;
  showOpenings?: boolean;
  showStructures?: boolean;
  interactive?: boolean;
  theme?: "consumer" | "pro";
  onSelectRoom?: (roomId: string) => void;
  onSelectWall?: (wallId: string, roomId: string | null) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onEditOpening?: (
    openingId: string,
    metrics: CanonicalOpeningDragMetricsV2,
    mode: CanonicalOpeningDragMode
  ) => void;
  onOpeningDragStateChange?: (
    dragging: boolean,
    mode: CanonicalOpeningDragMode
  ) => void;
};

export function CanonicalFloorPlanWalls2D({
  model,
  activeFloorId = null,
  activeFloorLevel,
  activeRoomId,
  selectedOpeningId = null,
  showOpenings = true,
  showStructures = true,
  interactive = false,
  theme = "consumer",
  onSelectRoom,
  onSelectWall,
  onSelectOpening,
  onEditOpening,
  onOpeningDragStateChange,
}: CanonicalFloorPlanWalls2DProps) {
  const wallColor = theme === "pro" ? "#a1a1aa" : "#b8b0a1";
  const activeWallColor = "#16a34a";
  const activeFloor = resolveCanonicalFloorPlan2DActiveFloor(model, {
    floorId: activeFloorId,
    floorLevel: activeFloorLevel,
  });
  return (
    <group
      userData={{
        testId: "canonical-floor-plan-walls-2d",
        canonicalFloorId: activeFloor?.id ?? null,
        canonicalFloorLevel: activeFloor ? activeFloor.levelIndex + 1 : null,
        canonicalGeometryHash: model.geometryHash,
        canonicalRevisionId: model.revisionId,
      }}
    >
      {showStructures &&
        activeFloor?.structures.map((structure) => (
          <CanonicalStructure2D
            key={`${activeFloor.id}:structure:${structure.id}`}
            structure={structure}
            floorId={activeFloor.id}
            geometryHash={model.geometryHash}
            theme={theme}
          />
        ))}
      {activeFloor?.walls.flatMap((wall) => {
        const roomId = preferredRoomId(wall.adjacentRoomIds, activeRoomId);
        const color = roomId === activeRoomId ? activeWallColor : wallColor;
        return wall.planSegments.map((segment) => {
          const geometry = segmentTransform(segment);
          return (
            <mesh
              key={`${activeFloor.id}:wall:${wall.id}:segment:${segment.startOffsetMm}:${segment.endOffsetMm}`}
              position={[geometry.centerX, 0.009, geometry.centerZ]}
              rotation-y={geometry.rotationY}
              raycast={interactive ? undefined : () => null}
              userData={{
                testId: "canonical-wall-2d",
                canonicalFloorId: activeFloor.id,
                canonicalWallId: wall.id,
                canonicalPathKind: wall.path.kind,
                canonicalThicknessMm: wall.thicknessMm,
                canonicalGeometryHash: model.geometryHash,
              }}
              onClick={
                interactive
                  ? (event: CanonicalPointerEvent) => {
                      event.stopPropagation();
                      if (onSelectWall) onSelectWall(wall.id, roomId);
                      else if (roomId) onSelectRoom?.(roomId);
                      onSelectOpening?.(null);
                    }
                  : undefined
              }
            >
              <boxGeometry
                args={[
                  geometry.length,
                  0.018,
                  Math.max(0.01, wall.thicknessMm / 1000),
                ]}
              />
              <meshBasicMaterial color={color} />
            </mesh>
          );
        });
      })}

      {showOpenings &&
        activeFloor?.walls.flatMap((wall) =>
          wall.openingPaths.map(({ opening, segments }) => (
            <CanonicalOpening2DSymbol
              key={`${activeFloor.id}:wall:${wall.id}:opening:${opening.id}`}
              opening={opening}
              wallId={wall.id}
              floorId={activeFloor.id}
              hostSegments={segments}
              geometryHash={model.geometryHash}
              selected={opening.id === selectedOpeningId}
              interactive={interactive}
              onSelect={onSelectOpening}
              wallStart={wall.centerlineSegments[0]?.start ?? opening.start}
              wallEnd={wall.centerlineSegments.at(-1)?.end ?? opening.end}
              onEdit={wall.path.kind === "line" ? onEditOpening : undefined}
              onDragStateChange={onOpeningDragStateChange}
            />
          ))
        )}
    </group>
  );
}

type CanonicalFloorPlanWalls3DProps = {
  model: CanonicalFloorPlanRenderModel;
  rooms?: readonly HousePlanRoom2D[];
  activeRoomId: string | null;
  activeFloorLevel?: number;
  selectedOpeningId?: string | null;
  selectedWallId?: string | null;
  selectedWallRoomId?: string | null;
  stackedFloors?: boolean;
  fadeInactiveFloors?: boolean;
  interactive?: boolean;
  onSelectWall?: (
    wallId: string,
    roomId: string | null,
    event: CanonicalPointerEvent
  ) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onEditOpening?: (
    openingId: string,
    metrics: CanonicalOpeningDragMetricsV2,
    mode: CanonicalOpeningDragMode
  ) => void;
  onOpeningDragStateChange?: (
    dragging: boolean,
    mode: CanonicalOpeningDragMode
  ) => void;
};

export function CanonicalFloorPlanWalls3D({
  model,
  rooms = [],
  activeRoomId,
  activeFloorLevel = 1,
  selectedOpeningId = null,
  selectedWallId = null,
  selectedWallRoomId = null,
  stackedFloors = false,
  fadeInactiveFloors = false,
  interactive = false,
  onSelectWall,
  onSelectOpening,
  onEditOpening,
  onOpeningDragStateChange,
}: CanonicalFloorPlanWalls3DProps) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const cutawayTarget = useMemo<CanonicalCutawayTarget | null>(
    () =>
      activeRoom
        ? {
            x: activeRoom.x,
            z: activeRoom.z,
            width: activeRoom.w,
            depth: activeRoom.d,
          }
        : null,
    [activeRoom]
  );
  const cutawayWallKeys = useCanonicalCameraCutawayWallKeys(
    model,
    cutawayTarget
  );
  return (
    <group
      userData={{
        testId: "canonical-floor-plan-walls-3d",
        canonicalGeometryHash: model.geometryHash,
        canonicalRevisionId: model.revisionId,
      }}
    >
      {model.floors.flatMap((floor) => {
        const floorLevel = floor.levelIndex + 1;
        const isActiveFloor = floorLevel === activeFloorLevel;
        const opacity =
          stackedFloors && fadeInactiveFloors && !isActiveFloor ? 0.28 : 1;
        const structures = floor.structures.map((structure) => (
          <CanonicalStructure3D
            key={`${floor.id}:${structure.id}:structure`}
            structure={structure}
            floorId={floor.id}
            floorElevationMm={floor.elevationMm}
            geometryHash={model.geometryHash}
            opacity={opacity}
          />
        ));
        const slab = (
          <CanonicalFloorSlab3D
            key={`${floor.id}:slab`}
            floor={floor}
            geometryHash={model.geometryHash}
          />
        );
        const wallBodies = (
          <CanonicalWallBodies3D
            key={`${floor.id}:wall-bodies`}
            floor={floor}
            geometryHash={model.geometryHash}
            opacity={opacity}
            cutawayWallKeys={cutawayWallKeys}
          />
        );
        const walls = floor.walls.flatMap((wall) => {
          if (cutawayWallKeys.has(canonicalWallCutawayKey(floor.id, wall.id))) {
            return [];
          }
          const roomId = preferredRoomId(wall.adjacentRoomIds, activeRoomId);
          const selected = wall.id === selectedWallId;
          return wall.solids.flatMap((solid) => {
            const hitTarget = interactive ? (
              <CanonicalWallSolidHitMesh
                key={`${floor.id}:${solid.id}:hit`}
                solid={solid}
                wallId={wall.id}
                pathKind={wall.path.kind}
                thicknessMm={wall.thicknessMm}
                floorElevationMm={floor.elevationMm}
                geometryHash={model.geometryHash}
                roomId={roomId}
                onSelectWall={onSelectWall}
                onSelectOpening={onSelectOpening}
              />
            ) : null;
            const surfaces = wall.roomSides.flatMap(({ roomId: surfaceRoomId, side }) => {
              const room = rooms.find((candidate) => candidate.id === surfaceRoomId);
              if (!room) return [];
              return [
                <CanonicalWallSurfaceMesh
                  key={`${floor.id}:${solid.id}:surface:${surfaceRoomId}`}
                  solid={solid}
                  wallId={wall.id}
                  floorId={floor.id}
                  floorElevationMm={floor.elevationMm}
                  room={room}
                  side={side}
                  active={surfaceRoomId === activeRoomId}
                  selected={
                    selected &&
                    (selectedWallRoomId === null || selectedWallRoomId === surfaceRoomId)
                  }
                  opacity={opacity}
                  geometryHash={model.geometryHash}
                  interactive={interactive}
                  onSelectWall={onSelectWall}
                  onSelectOpening={onSelectOpening}
                />,
              ];
            });
            return [hitTarget, ...surfaces];
          });
        });
        return [slab, wallBodies, ...structures, ...walls];
      })}

      {model.floors.flatMap((floor) => {
        const floorLevel = floor.levelIndex + 1;
        const opacity =
          stackedFloors && fadeInactiveFloors && floorLevel !== activeFloorLevel ? 0.28 : 1;
        return floor.walls.flatMap((wall) =>
          cutawayWallKeys.has(canonicalWallCutawayKey(floor.id, wall.id))
            ? []
            : wall.openingPaths.map(({ opening, segments }) => (
                <CanonicalOpening3DSymbol
                  key={`${floor.id}:${opening.id}:opening`}
                  opening={opening}
                  wallId={wall.id}
                  wallThicknessMm={wall.thicknessMm}
                  floorId={floor.id}
                  floorElevationMm={floor.elevationMm}
                  hostSegments={segments}
                  geometryHash={model.geometryHash}
                  selected={opening.id === selectedOpeningId}
                  opacity={opacity}
                  interactive={interactive}
                  onSelect={onSelectOpening}
                  wallStart={wall.centerlineSegments[0]?.start ?? opening.start}
                  wallEnd={wall.centerlineSegments.at(-1)?.end ?? opening.end}
                  onEdit={wall.path.kind === "line" ? onEditOpening : undefined}
                  onDragStateChange={onOpeningDragStateChange}
                />
              ))
        );
      })}
    </group>
  );
}
