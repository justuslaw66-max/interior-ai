"use client";

import { Line } from "@react-three/drei/core/Line";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  ROOM_DIMENSION_DEFAULTS,
  resolveHouseRoomFloorElevationMeters,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import {
  PLAN_OPENING_EDGE_PADDING_METERS,
  type RoomRendererOpening,
} from "@/lib/design-page-plan-overlays";
import {
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
  type FloorMaterial,
} from "@/lib/floor-materials";
import { resolveCutawayWallOpacity } from "@/lib/design-page-wall-cutaway";
import {
  getRuntimeSurfaceMaterialById,
  getSurfaceMaterialTextureSource,
  type SurfaceMaterialRenderInfo,
} from "@/lib/surface-material-runtime";
import {
  getCeilingSurfaceSettings,
  getDeterministicWallFaceId,
  getWallFaceSurfaceSettings,
  normalizeFloorSurfaceSettings,
} from "@/lib/surface-settings";
import type { RoomFloorPattern } from "@/lib/room-types";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import {
  buildPlanarUnionPolygons,
  type PlanarRegionMm,
  type PlanarUnionPolygonMm,
} from "@/lib/floor-plan-planar-union";
import { CanonicalFloorPlanWalls3D } from "./CanonicalFloorPlanStructure";
import { useSurfaceMaterialTexture } from "./useSurfaceMaterialTexture";
import { buildRoomPlanShape } from "@/lib/room-plan-shape";

type HousePlanRenderer3DProps = {
  rooms: readonly HousePlanRoom2D[];
  openings?: readonly RoomRendererOpening[];
  activeRoomId: string;
  focusRoomId?: string | null;
  activeFloorLevel?: number;
  wallHeight: number;
  stackedFloors?: boolean;
  fadeInactiveFloors?: boolean;
  interactive?: boolean;
  onSelectRoom?: (roomId: string) => void;
  selectedOpeningId?: string | null;
  selectedSurfaceTarget?: { kind: "floor" | "wall" | "ceiling"; roomId: string; id: string } | null;
  onSelectSurfaceTarget?: (target: { kind: "floor" | "wall" | "ceiling"; roomId: string; id: string }) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onMoveOpening?: (openingId: string, offsetMeters: number) => void;
  onResizeOpening?: (
    openingId: string,
    metrics: { widthMeters: number; offsetMeters: number }
  ) => void;
  onOpeningDragStateChange?: (
    isDragging: boolean,
    kind?: "opening" | "opening_resize"
  ) => void;
  canonicalPlan?: CanonicalFloorPlanRenderModel | null;
  canonicalStructureExpected?: boolean;
};

type WallId = RoomRendererOpening["wall"];

type WallSegment3D = {
  key: string;
  wall?: WallId;
  x: number;
  z: number;
  length: number;
  rotationY: number;
  axis: "x" | "z";
};

type WallOpening3D = {
  id: string;
  sourceId: string;
  offset: number;
  width: number;
  height?: number;
  bottom?: number;
  kind: RoomRendererOpening["kind"];
};

type WallPart3D = {
  key: string;
  x: number;
  z: number;
  length: number;
  height?: number;
  centerY?: number;
};

type OpeningThreshold3D = WallPart3D & {
  sourceId: string;
  height: number;
};

type SharedWallRange3D = {
  roomId: string;
  segmentKey?: string;
  start: number;
  end: number;
};

type LegacyFloorSlab3D = {
  key: string;
  floorLevel: number;
  elevationMeters: number;
  thicknessMeters: number;
  polygons: PlanarUnionPolygonMm[];
};

type LegacyWallBand3D = {
  key: string;
  floorLevel: number;
  bottomMeters: number;
  topMeters: number;
  polygons: PlanarUnionPolygonMm[];
};

type StructureTargetKind = "floor" | "wall" | "ceiling" | "opening";

type StructureTarget = {
  kind: StructureTargetKind;
  roomId: string;
  id: string;
};

const STRUCTURE_THICKNESS_METERS = 0.025;
const CEILING_THICKNESS_METERS = STRUCTURE_THICKNESS_METERS;
const FLOOR_THICKNESS_METERS = ROOM_DIMENSION_DEFAULTS.slabThickness;
const CEILING_CAP_COLOR = "#9c9d99";
const CEILING_EDGE_COLOR = "#f1f1ed";
const ACTIVE_WALL_COLOR = "#fbfbf7";
const INACTIVE_WALL_COLOR = "#ddddda";
const ACTIVE_WALL_OPACITY = 1;
const INACTIVE_WALL_OPACITY = 1;
const CAMERA_FACING_WALL_CUTAWAY_OPACITY = 0;
const WALL_SECTION_CAP_COLOR = "#c9cac7";
const WALL_SURFACE_OFFSET_METERS = 0.004;
const STRUCTURE_HOVER_OUTLINE_COLOR = "#00d5e8";
const STRUCTURE_SELECTED_OUTLINE_COLOR = "#2563eb";
const ACTIVE_FLOOR_OUTLINE_COLOR = "#1d4ed8";
const INACTIVE_FLOOR_OPACITY_MULTIPLIER = 0.32;
const WALL_SURFACE_TEXTURE_RESOLUTION = {
  maxSize: 4096,
  minSize: 768,
  pixelsPerMeter: 560,
} as const;

function clampStructureOpacity(value: number | undefined): number {
  return Math.max(0.05, Math.min(1, typeof value === "number" && Number.isFinite(value) ? value : 1));
}

function getRoomFloorLevel(room: HousePlanRoom2D): number {
  return typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
    ? room.floorLevel
    : 1;
}

function createFloorMaterialTexture(
  material: FloorMaterial,
  maxAnisotropy: number,
  floorPattern: RoomFloorPattern = "straight",
  jointSizeMm = 2,
  jointColor = material.lineColor
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = material.renderColor;
  context.fillRect(0, 0, size, size);

  if (material.pattern === "wood_plank") {
    context.save();
    context.globalAlpha = 0.22;
    context.strokeStyle = material.lineColor;
    context.lineWidth = 1;

    for (let y = 24; y < size; y += 34) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
    }

    context.globalAlpha = 0.16;
    for (let row = 0; row < 8; row += 1) {
      const y = row * 34;
      const offset = row % 2 === 0 ? 48 : 112;
      for (let x = offset; x < size; x += 96) {
        context.beginPath();
        context.moveTo(x, y + 2);
        context.lineTo(x, y + 31);
        context.stroke();
      }
    }

    context.globalAlpha = 0.08;
    context.strokeStyle = material.accentColor;
    for (let y = 12; y < size; y += 18) {
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(72, y + 5, 148, y - 5, size, y + 3);
      context.stroke();
    }
    context.restore();
  }

  if (material.pattern === "tile_grid" || floorPattern === "grid" || floorPattern === "checker") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));

    for (let position = 0; position <= size; position += 64) {
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, size);
      context.stroke();
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(size, position);
      context.stroke();
    }

    context.globalAlpha = 0.08;
    context.fillStyle = material.accentColor;
    context.fillRect(0, 0, size, size);
    context.restore();
  }

  if (material.pattern === "soft_fleck") {
    context.save();
    context.globalAlpha = 0.14;
    context.strokeStyle = material.lineColor;
    context.lineWidth = 1;

    for (let index = 0; index < 76; index += 1) {
      const x = (index * 47) % size;
      const y = (index * 83) % size;
      const length = 3 + (index % 5);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length, y + (index % 2 === 0 ? 1 : -1));
      context.stroke();
    }
    context.restore();
  }

  if (floorPattern === "brick") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));
    for (let y = 0; y <= size; y += 42) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
      const offset = Math.floor(y / 42) % 2 === 0 ? 0 : 48;
      for (let x = offset; x <= size; x += 96) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + 42);
        context.stroke();
      }
    }
    context.restore();
  }

  if (floorPattern === "random_stagger") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));
    const rowHeight = 42;
    const tileWidth = 96;
    const rowOffsets = [0, 40, 17, 65];
    for (let y = 0; y <= size; y += rowHeight) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
      const rowIndex = Math.floor(y / rowHeight);
      const offset = rowOffsets[rowIndex % rowOffsets.length];
      for (let x = -tileWidth + offset; x <= size; x += tileWidth) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + rowHeight);
        context.stroke();
      }
    }
    context.restore();
  }

  if (floorPattern === "vertical_brick") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));
    for (let x = 0; x <= size; x += 42) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, size);
      context.stroke();
      const offset = Math.floor(x / 42) % 2 === 0 ? 0 : 48;
      for (let y = offset; y <= size; y += 96) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 42, y);
        context.stroke();
      }
    }
    context.restore();
  }

  if (floorPattern === "herringbone") {
    context.save();
    const materialRgb = /^#([0-9a-f]{6})$/i.test(material.renderColor)
      ? [
          Number.parseInt(material.renderColor.slice(1, 3), 16),
          Number.parseInt(material.renderColor.slice(3, 5), 16),
          Number.parseInt(material.renderColor.slice(5, 7), 16),
        ]
      : [185, 174, 154];
    const jointRgb = /^#([0-9a-f]{6})$/i.test(jointColor)
      ? [
          Number.parseInt(jointColor.slice(1, 3), 16),
          Number.parseInt(jointColor.slice(3, 5), 16),
          Number.parseInt(jointColor.slice(5, 7), 16),
        ]
      : [142, 142, 142];
    const plankLength = 96;
    const plankWidth = 16;
    const aspectRatio = plankLength / plankWidth;
    const jointInset = Math.max(0.7, Math.min(2.5, jointSizeMm * 0.45));
    const imageData = context.createImageData(size, size);
    const data = imageData.data;
    for (let pixelY = 0; pixelY < size; pixelY += 1) {
      const unitY = pixelY / plankWidth;
      const rowIndex = Math.floor(unitY);
      const baseLocalY = ((unitY % 1) + 1) % 1;

      for (let pixelX = 0; pixelX < size; pixelX += 1) {
        const unitX = pixelX / plankWidth;
        let localXUnit = ((unitX - rowIndex) % (aspectRatio * 2) + aspectRatio * 2) % (aspectRatio * 2);
        let localYUnit = baseLocalY;

        if (localXUnit >= aspectRatio) {
          const wrappedX = localXUnit;
          const wrappedY = localYUnit;
          localYUnit = ((wrappedX % 1) + 1) % 1;
          localXUnit = 2 * aspectRatio - Math.ceil(wrappedX) + wrappedY;
        }

        const localX = localXUnit * plankWidth;
        const localY = localYUnit * plankWidth;
        const inJoint =
          localX < jointInset ||
          localX > plankLength - jointInset ||
          localY < jointInset ||
          localY > plankWidth - jointInset;
        const outputIndex = (pixelY * size + pixelX) * 4;
        const color = inJoint ? jointRgb : materialRgb;
        data[outputIndex] = color[0];
        data[outputIndex + 1] = color[1];
        data[outputIndex + 2] = color[2];
        data[outputIndex + 3] = 255;
      }
    }
    context.putImageData(imageData, 0, 0);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  texture.needsUpdate = true;
  return texture;
}

function getSurfaceMaterialRepeatSizeMeters(material: SurfaceMaterialRenderInfo | null) {
  const specs = material?.physical_specs;
  const repeat = material?.texture_assets.texture_repeat_size_cm;
  const widthMm = specs?.tile_width_mm ?? specs?.plank_width_mm ?? null;
  const heightMm = specs?.tile_length_mm ?? specs?.plank_length_mm ?? null;
  if (widthMm && heightMm) {
    return {
      width: Math.max(0.05, widthMm / 1000),
      height: Math.max(0.05, heightMm / 1000),
    };
  }
  if (repeat?.width && repeat?.height) {
    return {
      width: Math.max(0.05, repeat.width / 100),
      height: Math.max(0.05, repeat.height / 100),
    };
  }
  return { width: 1, height: 1 };
}

function getSurfaceMaterialFallbackColor(material: SurfaceMaterialRenderInfo | null): string | null {
  const colorFamily = material?.classification?.color_family;
  if (colorFamily === "grey") return "#b7b7b2";
  if (colorFamily === "charcoal") return "#5b5d5a";
  if (colorFamily === "brown" || colorFamily === "walnut") return "#8b755c";
  if (colorFamily === "cream" || colorFamily === "beige") return "#d8ccbb";
  if (colorFamily === "white") return "#ece9e1";
  return material ? "#c9c2b4" : null;
}

function useSurfaceMaterialSourceTexture({
  material,
  surfaceWidthMeters,
  surfaceHeightMeters,
  scale,
  rotationRad,
  maxAnisotropy,
}: {
  material: SurfaceMaterialRenderInfo | null;
  surfaceWidthMeters: number;
  surfaceHeightMeters: number;
  scale: number;
  rotationRad: number;
  maxAnisotropy: number;
}) {
  const source = useMemo(() => getSurfaceMaterialTextureSource(material), [material]);
  const textureKey = source
    ? [
        material?.surface_material.material_id,
        source.url,
        surfaceWidthMeters,
        surfaceHeightMeters,
        scale,
        rotationRad,
        maxAnisotropy,
      ].join(":")
    : null;
  const [textureState, setTextureState] = useState<{ key: string; texture: THREE.Texture } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedTexture: THREE.Texture | null = null;
    if (!material || !source || !textureKey) {
      return () => {
        cancelled = true;
      };
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      source.url,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        const repeatSize = getSurfaceMaterialRepeatSizeMeters(material);
        const safeScale = Math.max(0.1, Math.min(5, Number.isFinite(scale) ? scale : 1));
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
        texture.center.set(0.5, 0.5);
        texture.rotation = rotationRad;
        texture.repeat.set(
          Math.max(1, surfaceWidthMeters / Math.max(0.05, repeatSize.width * safeScale)),
          Math.max(1, surfaceHeightMeters / Math.max(0.05, repeatSize.height * safeScale))
        );
        texture.needsUpdate = true;
        loadedTexture = texture;
        setTextureState({ key: textureKey, texture });
      },
      undefined,
      () => {
        if (!cancelled) setTextureState((current) => (current?.key === textureKey ? null : current));
      }
    );

    return () => {
      cancelled = true;
      loadedTexture?.dispose();
    };
  }, [
    material,
    maxAnisotropy,
    rotationRad,
    scale,
    source,
    surfaceHeightMeters,
    surfaceWidthMeters,
    textureKey,
  ]);

  return textureState?.key === textureKey ? textureState.texture : null;
}

function getStructureTargetKey(target: StructureTarget | null): string | null {
  if (!target) return null;
  return `${target.kind}:${target.roomId}:${target.id}`;
}

function isSameStructureTarget(first: StructureTarget | null, second: StructureTarget): boolean {
  return getStructureTargetKey(first) === getStructureTargetKey(second);
}

function getStructureOutlineStyle(
  targetKey: string,
  hoveredTargetKey: string | null,
  selectedTargetKey: string | null
) {
  if (selectedTargetKey === targetKey) {
    return { color: STRUCTURE_SELECTED_OUTLINE_COLOR, lineWidth: 2.8 };
  }

  if (hoveredTargetKey === targetKey) {
    return { color: STRUCTURE_HOVER_OUTLINE_COLOR, lineWidth: 2.4 };
  }

  return null;
}

function getRoomOutlinePoints(room: HousePlanRoom2D): Array<[number, number]> {
  if (room.shape === "custom_polygon" && room.polygon && room.polygon.length >= 3) {
    const points = room.polygon.map((point): [number, number] => [point.x, point.z]);
    return [...points, points[0]];
  }

  const left = -room.w / 2;
  const right = room.w / 2;
  const top = -room.d / 2;
  const bottom = room.d / 2;

  if (room.shape === "l_shape") {
    const notchW = room.w * 0.42;
    const notchD = room.d * 0.42;
    return [
      [left, top],
      [right, top],
      [right, bottom - notchD],
      [right - notchW, bottom - notchD],
      [right - notchW, bottom],
      [left, bottom],
      [left, top],
    ];
  }

  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ];
}

function buildRoomShapeGeometry(room: HousePlanRoom2D) {
  const points = getRoomOutlinePoints(room);
  return buildShapeFromOutlinePoints(points, getRoomHoleOutlinePoints(room));
}

function getRoomHoleOutlinePoints(room: HousePlanRoom2D): Array<Array<[number, number]>> {
  return (room.holes ?? [])
    .filter((hole) => hole.length >= 3)
    .map((hole) => {
      const points = hole.map((point): [number, number] => [point.x, point.z]);
      return [...points, points[0]];
    });
}

function getSignedArea(points: Array<[number, number]>) {
  return points.slice(0, -1).reduce((area, [x, z], index) => {
    const [nextX, nextZ] = points[index + 1];
    return area + x * nextZ - nextX * z;
  }, 0) / 2;
}

function intersectOffsetLines(
  firstPoint: [number, number],
  firstDirection: [number, number],
  secondPoint: [number, number],
  secondDirection: [number, number]
): [number, number] | null {
  const cross =
    firstDirection[0] * secondDirection[1] -
    firstDirection[1] * secondDirection[0];

  if (Math.abs(cross) < 0.00001) return null;

  const dx = secondPoint[0] - firstPoint[0];
  const dz = secondPoint[1] - firstPoint[1];
  const t = (dx * secondDirection[1] - dz * secondDirection[0]) / cross;
  return [
    firstPoint[0] + firstDirection[0] * t,
    firstPoint[1] + firstDirection[1] * t,
  ];
}

function offsetRoomOutlinePoints(room: HousePlanRoom2D, offset: number) {
  const outline = getRoomOutlinePoints(room);
  const openPoints = outline.slice(0, -1);

  if (offset <= 0.001 || openPoints.length < 3) {
    return outline;
  }

  const orientation = getSignedArea(outline) >= 0 ? 1 : -1;
  const shiftedEdges = openPoints.map((point, index) => {
    const nextPoint = openPoints[(index + 1) % openPoints.length];
    const dx = nextPoint[0] - point[0];
    const dz = nextPoint[1] - point[1];
    const length = Math.hypot(dx, dz) || 1;
    const direction: [number, number] = [dx / length, dz / length];
    const outwardNormal: [number, number] = orientation > 0
      ? [direction[1], -direction[0]]
      : [-direction[1], direction[0]];

    return {
      point: [
        point[0] + outwardNormal[0] * offset,
        point[1] + outwardNormal[1] * offset,
      ] as [number, number],
      direction,
    };
  });

  const offsetPoints = openPoints.map((point, index): [number, number] => {
    const previous = shiftedEdges[(index - 1 + shiftedEdges.length) % shiftedEdges.length];
    const current = shiftedEdges[index];
    const intersection = intersectOffsetLines(
      previous.point,
      previous.direction,
      current.point,
      current.direction
    );

    return intersection ?? point;
  });

  return [...offsetPoints, offsetPoints[0]];
}

function buildShapeFromOutlinePoints(
  points: Array<[number, number]>,
  holes: Array<Array<[number, number]>> = []
) {
  return buildRoomPlanShape(points, holes);
}

function buildHorizontalRoomGeometry(room: HousePlanRoom2D, edgeOffset = 0) {
  const points = edgeOffset > 0.001
    ? offsetRoomOutlinePoints(room, edgeOffset)
    : getRoomOutlinePoints(room);
  const geometry = new THREE.ShapeGeometry(
    buildShapeFromOutlinePoints(points, getRoomHoleOutlinePoints(room))
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildRoomEdgeBandGeometry(room: HousePlanRoom2D, height: number, edgeOffset = 0) {
  const outline = edgeOffset > 0.001
    ? offsetRoomOutlinePoints(room, edgeOffset)
    : getRoomOutlinePoints(room);
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const loop of [outline, ...getRoomHoleOutlinePoints(room)]) {
    loop.slice(0, -1).forEach(([startX, startZ], index) => {
      const [endX, endZ] = loop[index + 1];
      const baseIndex = vertices.length / 3;

      vertices.push(
        startX, 0, startZ,
        endX, 0, endZ,
        endX, height, endZ,
        startX, height, startZ
      );

      indices.push(
        baseIndex, baseIndex + 1, baseIndex + 2,
        baseIndex, baseIndex + 2, baseIndex + 3
      );
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function getRectangleWallSegments(room: HousePlanRoom2D): WallSegment3D[] {
  return [
    {
      key: `${room.id}-north`,
      wall: "north",
      x: 0,
      z: -room.d / 2,
      length: room.w,
      rotationY: 0,
      axis: "x",
    },
    {
      key: `${room.id}-east`,
      wall: "east",
      x: room.w / 2,
      z: 0,
      length: room.d,
      rotationY: -Math.PI / 2,
      axis: "z",
    },
    {
      key: `${room.id}-south`,
      wall: "south",
      x: 0,
      z: room.d / 2,
      length: room.w,
      rotationY: 0,
      axis: "x",
    },
    {
      key: `${room.id}-west`,
      wall: "west",
      x: -room.w / 2,
      z: 0,
      length: room.d,
      rotationY: -Math.PI / 2,
      axis: "z",
    },
  ];
}

function stopStructurePointerEvent(event: ThreeEvent<MouseEvent | PointerEvent>) {
  event.stopPropagation();
  event.nativeEvent.stopPropagation();
  event.nativeEvent.stopImmediatePropagation?.();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function capturePointerIfSupported(event: ThreeEvent<PointerEvent>) {
  const target = event.target as Element | null;
  if (target && "setPointerCapture" in target) {
    target.setPointerCapture(event.pointerId);
  }
}

function releasePointerCaptureIfSupported(event: ThreeEvent<PointerEvent>) {
  const target = event.target as Element | null;
  if (target && "releasePointerCapture" in target) {
    target.releasePointerCapture(event.pointerId);
  }
}

function getWallSegments(room: HousePlanRoom2D): WallSegment3D[] {
  if (room.shape === "rectangle") {
    return getRectangleWallSegments(room);
  }

  const points = getRoomOutlinePoints(room);
  return points.slice(0, -1).map((point, index): WallSegment3D => {
    const next = points[index + 1];
    const dx = next[0] - point[0];
    const dz = next[1] - point[1];
    return {
      key: `${room.id}-${index}`,
      x: (point[0] + next[0]) / 2,
      z: (point[1] + next[1]) / 2,
      length: Math.hypot(dx, dz),
      rotationY: -Math.atan2(dz, dx),
      axis: Math.abs(dx) >= Math.abs(dz) ? "x" : "z",
    };
  });
}

function getWallSurfaceFaceId(room: HousePlanRoom2D, segment: WallSegment3D): string {
  if (segment.wall) return segment.wall;
  const suffix = segment.key.startsWith(`${room.id}-`)
    ? segment.key.slice(room.id.length + 1)
    : segment.key;
  return getDeterministicWallFaceId(suffix);
}

function getWallInteriorSurfaceSide(segment: WallSegment3D): 1 | -1 {
  if (segment.wall === "north" || segment.wall === "east") return 1;
  if (segment.wall === "south" || segment.wall === "west") return -1;

  const localPlusZNormal = {
    x: Math.sin(segment.rotationY),
    z: Math.cos(segment.rotationY),
  };
  const vectorToRoomCenter = {
    x: -segment.x,
    z: -segment.z,
  };
  return localPlusZNormal.x * vectorToRoomCenter.x + localPlusZNormal.z * vectorToRoomCenter.z >= 0
    ? 1
    : -1;
}

export function getWallInteriorSurfaceSideForTest(
  _room: HousePlanRoom2D,
  segment: {
    wall?: "north" | "east" | "south" | "west";
    x: number;
    z: number;
    rotationY: number;
  }
): 1 | -1 {
  return getWallInteriorSurfaceSide({
    key: "test-wall-segment",
    length: 1,
    axis: "x",
    ...segment,
  });
}

function oppositeWall(wall: WallId): WallId {
  if (wall === "north") return "south";
  if (wall === "south") return "north";
  if (wall === "east") return "west";
  return "east";
}

function getWallCoordinate(room: HousePlanRoom2D, wall: WallId): number {
  if (wall === "west") return room.x - room.w / 2;
  if (wall === "east") return room.x + room.w / 2;
  if (wall === "north") return room.z - room.d / 2;
  return room.z + room.d / 2;
}

function wallPartCenter(segment: WallSegment3D, offset: number) {
  return {
    x: segment.x + Math.cos(segment.rotationY) * offset,
    z: segment.z - Math.sin(segment.rotationY) * offset,
  };
}

type LegacyWallJoinSide = 1 | -1;

type LegacyWallEndJoinOptions = {
  squareStart?: boolean;
  squareEnd?: boolean;
};

const LEGACY_WALL_JOIN_TOLERANCE_METERS = 0.002;

function legacyWallDirection(segment: WallSegment3D): [number, number] {
  return [Math.cos(segment.rotationY), -Math.sin(segment.rotationY)];
}

function legacyWallEndpointLocal(
  segment: WallSegment3D,
  endpoint: "start" | "end"
) {
  const [directionX, directionZ] = legacyWallDirection(segment);
  const offset = (endpoint === "start" ? -1 : 1) * segment.length / 2;
  return {
    x: segment.x + directionX * offset,
    z: segment.z + directionZ * offset,
  };
}

function legacyWallPartAxisRange(segment: WallSegment3D, part: WallPart3D) {
  const [directionX, directionZ] = legacyWallDirection(segment);
  const centerOffset =
    (part.x - segment.x) * directionX +
    (part.z - segment.z) * directionZ;
  return {
    centerOffset,
    startOffset: centerOffset - part.length / 2,
    endOffset: centerOffset + part.length / 2,
  };
}

function legacyWallAdjacentSegment(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  endpoint: "start" | "end"
) {
  const segments = getWallSegments(room);
  const target = legacyWallEndpointLocal(segment, endpoint);
  return segments.find((candidate) => {
    if (candidate.key === segment.key) return false;
    const candidateStart = legacyWallEndpointLocal(candidate, "start");
    const candidateEnd = legacyWallEndpointLocal(candidate, "end");
    return (
      Math.hypot(target.x - candidateStart.x, target.z - candidateStart.z) <=
        LEGACY_WALL_JOIN_TOLERANCE_METERS ||
      Math.hypot(target.x - candidateEnd.x, target.z - candidateEnd.z) <=
        LEGACY_WALL_JOIN_TOLERANCE_METERS
    );
  }) ?? null;
}

function legacyWallCutEndJoinOptions(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  excludedSegmentKeys?: ReadonlySet<string>
): LegacyWallEndJoinOptions {
  if (!excludedSegmentKeys?.size) return {};
  const startNeighbor = legacyWallAdjacentSegment(room, segment, "start");
  const endNeighbor = legacyWallAdjacentSegment(room, segment, "end");
  return {
    squareStart: Boolean(
      startNeighbor && excludedSegmentKeys.has(startNeighbor.key)
    ),
    squareEnd: Boolean(endNeighbor && excludedSegmentKeys.has(endNeighbor.key)),
  };
}

function joinedLegacyWallPartAxisRange(
  _room: HousePlanRoom2D,
  segment: WallSegment3D,
  part: WallPart3D,
  _side: LegacyWallJoinSide,
  wallThicknessMeters: number,
  endJoinOptions: LegacyWallEndJoinOptions = {}
) {
  const range = legacyWallPartAxisRange(segment, part);
  const touchesStart =
    Math.abs(range.startOffset + segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const touchesEnd =
    Math.abs(range.endOffset - segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const capExtension = wallThicknessMeters / 2;
  return {
    startOffset:
      range.startOffset -
      (touchesStart && !endJoinOptions.squareStart ? capExtension : 0),
    endOffset:
      range.endOffset +
      (touchesEnd && !endJoinOptions.squareEnd ? capExtension : 0),
  };
}

function joinedLegacyWallSurfacePart(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  part: WallPart3D,
  side: LegacyWallJoinSide,
  wallThicknessMeters: number,
  endJoinOptions: LegacyWallEndJoinOptions = {}
) {
  const original = legacyWallPartAxisRange(segment, part);
  const joined = joinedLegacyWallPartAxisRange(
    room,
    segment,
    part,
    side,
    wallThicknessMeters,
    endJoinOptions
  );
  const length = Math.max(0.001, joined.endOffset - joined.startOffset);
  const centerOffset = joined.startOffset + length / 2;
  return {
    centerDelta: centerOffset - original.centerOffset,
    length,
  };
}

export function getLegacyWallSurfaceJoinRangesForTest(
  room: HousePlanRoom2D,
  wallThicknessMeters: number,
  excludedSegmentKeys?: ReadonlySet<string>
) {
  return getWallSegments(room).map((segment) => {
    const part: WallPart3D = {
      key: `${segment.key}:join-test`,
      x: segment.x,
      z: segment.z,
      length: segment.length,
    };
    const endJoinOptions = legacyWallCutEndJoinOptions(
      room,
      segment,
      excludedSegmentKeys
    );
    return {
      segmentKey: segment.key,
      plus: joinedLegacyWallSurfacePart(
        room,
        segment,
        part,
        1,
        wallThicknessMeters,
        endJoinOptions
      ),
      minus: joinedLegacyWallSurfacePart(
        room,
        segment,
        part,
        -1,
        wallThicknessMeters,
        endJoinOptions
      ),
    };
  });
}

function getWallOpenings(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  rooms: readonly HousePlanRoom2D[],
  openings: readonly RoomRendererOpening[]
): WallOpening3D[] {
  const directOpenings = segment.wall
    ? openings
    .filter((opening) => opening.roomId === room.id && opening.wall === segment.wall)
    .map((opening) => ({
      id: opening.id,
      sourceId: opening.id,
      offset: opening.offset,
      width: opening.width,
      height: opening.height,
      bottom: opening.bottom,
      kind: opening.kind,
    }))
    : [];

  const mirroredOpenings = openings.flatMap((opening) => {
    if (!opening.roomId) return [];
    if (opening.roomId === room.id && opening.wall === segment.wall) return [];
    const sourceRoom = rooms.find((candidate) => candidate.id === opening.roomId);
    if (!sourceRoom) return [];
    const targetDirection = {
      x: Math.cos(segment.rotationY),
      z: -Math.sin(segment.rotationY),
    };
    const sourceDirection =
      opening.wall === "north" || opening.wall === "south"
        ? { x: 1, z: 0 }
        : { x: 0, z: 1 };
    if (
      Math.abs(
        targetDirection.x * sourceDirection.z -
          targetDirection.z * sourceDirection.x
      ) > 0.01
    ) {
      return [];
    }
    const openingCenter = {
      x:
        opening.wall === "north" || opening.wall === "south"
          ? sourceRoom.x + opening.offset
          : getWallCoordinate(sourceRoom, opening.wall),
      z:
        opening.wall === "east" || opening.wall === "west"
          ? sourceRoom.z + opening.offset
          : getWallCoordinate(sourceRoom, opening.wall),
    };
    const targetCenter = { x: room.x + segment.x, z: room.z + segment.z };
    const delta = {
      x: openingCenter.x - targetCenter.x,
      z: openingCenter.z - targetCenter.z,
    };
    const perpendicularDistance = Math.abs(
      delta.x * -targetDirection.z + delta.z * targetDirection.x
    );
    if (perpendicularDistance > 0.08) return [];
    const offset = delta.x * targetDirection.x + delta.z * targetDirection.z;
    if (Math.abs(offset) > segment.length / 2 + opening.width / 2) return [];

    return [
      {
        id: `${opening.id}-mirrored-${room.id}`,
        sourceId: opening.id,
        offset,
        width: opening.width,
        height: opening.height,
        bottom: opening.bottom,
        kind: opening.kind,
      },
    ];
  });

  return [...directOpenings, ...mirroredOpenings];
}

export function getLegacyWallOpeningCountsForTest(
  rooms: readonly HousePlanRoom2D[],
  openings: readonly RoomRendererOpening[]
) {
  return rooms.map((room) => ({
    roomId: room.id,
    segments: getWallSegments(room).map((segment) =>
      getWallOpenings(room, segment, rooms, openings).map((opening) => opening.sourceId)
    ),
  }));
}

function buildWallParts(segment: WallSegment3D, openings: WallOpening3D[]): WallPart3D[] {
  const minPartLength = 0.08;
  const half = segment.length / 2;
  const gaps = openings
    .map((opening) => ({
      start: Math.max(-half, opening.offset - opening.width / 2),
      end: Math.min(half, opening.offset + opening.width / 2),
    }))
    .filter((gap) => gap.end - gap.start > minPartLength)
    .sort((a, b) => a.start - b.start);
  const mergedGaps: Array<{ start: number; end: number }> = [];

  for (const gap of gaps) {
    const last = mergedGaps[mergedGaps.length - 1];
    if (last && gap.start <= last.end) {
      last.end = Math.max(last.end, gap.end);
    } else {
      mergedGaps.push({ ...gap });
    }
  }

  const parts: WallPart3D[] = [];
  let cursor = -half;

  [...mergedGaps, { start: half, end: half }].forEach((gap, index) => {
    const partLength = gap.start - cursor;
    if (partLength > minPartLength) {
      const centerOffset = cursor + partLength / 2;
      const center = wallPartCenter(segment, centerOffset);
      parts.push({
        key: `${segment.key}-part-${index}`,
        x: center.x,
        z: center.z,
        length: partLength,
      });
    }
    cursor = Math.max(cursor, gap.end);
  });

  return parts;
}

function getOpeningDisplayHeight(
  opening: WallOpening3D,
  wallHeight: number,
  physicalWallHeight: number
): number {
  const requestedHeight = opening.height;
  if (!requestedHeight || !Number.isFinite(requestedHeight)) return wallHeight;
  const displayHeight = (requestedHeight / Math.max(0.2, physicalWallHeight)) * wallHeight;
  return Math.min(Math.max(0.08, displayHeight), wallHeight);
}

function getOpeningDisplayBottom(
  opening: WallOpening3D,
  wallHeight: number,
  physicalWallHeight: number
) {
  const requestedBottom = opening.bottom;
  if (!requestedBottom || !Number.isFinite(requestedBottom)) return 0;
  return Math.min(
    Math.max(0, (requestedBottom / Math.max(0.2, physicalWallHeight)) * wallHeight),
    Math.max(0, wallHeight - 0.08)
  );
}

function buildOpeningLintelParts(
  segment: WallSegment3D,
  openings: WallOpening3D[],
  wallHeight: number,
  physicalWallHeight: number
): WallPart3D[] {
  const minLintelHeight = 0.08;
  const half = segment.length / 2;

  return openings.flatMap((opening): WallPart3D[] => {
    const openingBottom = getOpeningDisplayBottom(
      opening,
      wallHeight,
      physicalWallHeight
    );
    const openingHeight = getOpeningDisplayHeight(opening, wallHeight, physicalWallHeight);
    const openingTop = Math.min(wallHeight, openingBottom + openingHeight);
    const lintelHeight = wallHeight - openingTop;
    if (lintelHeight < minLintelHeight) return [];

    const start = Math.max(-half, opening.offset - opening.width / 2);
    const end = Math.min(half, opening.offset + opening.width / 2);
    const length = end - start;
    if (length <= 0.08) return [];

    const centerOffset = start + length / 2;
    const center = wallPartCenter(segment, centerOffset);
    return [
      {
        key: `${segment.key}-${opening.id}-lintel`,
        x: center.x,
        z: center.z,
        length,
        height: lintelHeight,
        centerY: openingTop + lintelHeight / 2,
      },
    ];
  });
}

function buildOpeningSillParts(
  segment: WallSegment3D,
  openings: WallOpening3D[],
  wallHeight: number,
  physicalWallHeight: number
): WallPart3D[] {
  const half = segment.length / 2;
  return openings.flatMap((opening): WallPart3D[] => {
    const sillHeight = getOpeningDisplayBottom(
      opening,
      wallHeight,
      physicalWallHeight
    );
    if (sillHeight < 0.08) return [];
    const start = Math.max(-half, opening.offset - opening.width / 2);
    const end = Math.min(half, opening.offset + opening.width / 2);
    const length = end - start;
    if (length <= 0.08) return [];
    const centerOffset = start + length / 2;
    const center = wallPartCenter(segment, centerOffset);
    return [
      {
        key: `${segment.key}-${opening.id}-sill`,
        x: center.x,
        z: center.z,
        length,
        height: sillHeight,
        centerY: sillHeight / 2,
      },
    ];
  });
}

function getOpeningThresholds(
  segment: WallSegment3D,
  openings: WallOpening3D[],
  wallHeight: number,
  physicalWallHeight: number
): OpeningThreshold3D[] {
  return openings
    .filter((opening) => opening.kind === "door")
    .map((opening) => {
      const center = wallPartCenter(segment, opening.offset);
      return {
        key: `${segment.key}-${opening.id}-threshold`,
        sourceId: opening.sourceId,
        x: center.x,
        z: center.z,
        length: Math.min(segment.length, opening.width),
        height: getOpeningDisplayHeight(opening, wallHeight, physicalWallHeight),
      };
    });
}

function getSharedWallOverlapRanges(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  minOverlap = 0.35
): SharedWallRange3D[] {
  const tolerance = 0.08;
  const half = segment.length / 2;
  const segmentCenter = segment.axis === "x"
    ? room.x + segment.x
    : room.z + segment.z;
  const segmentStart = segmentCenter - half;
  const segmentEnd = segmentCenter + half;

  if (!segment.wall) {
    const [directionX, directionZ] = legacyWallDirection(segment);
    const normalX = -directionZ;
    const normalZ = directionX;
    const worldCenterX = room.x + segment.x;
    const worldCenterZ = room.z + segment.z;
    return rooms.flatMap((otherRoom): SharedWallRange3D[] => {
      if (otherRoom.id === room.id) return [];
      return getWallSegments(otherRoom).flatMap(
        (otherSegment): SharedWallRange3D[] => {
          const [otherDirectionX, otherDirectionZ] =
            legacyWallDirection(otherSegment);
          const parallelCross = Math.abs(
            directionX * otherDirectionZ - directionZ * otherDirectionX
          );
          if (parallelCross > 0.01) return [];
          const deltaX = otherRoom.x + otherSegment.x - worldCenterX;
          const deltaZ = otherRoom.z + otherSegment.z - worldCenterZ;
          const lineDistance = Math.abs(deltaX * normalX + deltaZ * normalZ);
          if (lineDistance > tolerance) return [];
          const otherCenterOffset = deltaX * directionX + deltaZ * directionZ;
          const directionAlignment = Math.abs(
            directionX * otherDirectionX + directionZ * otherDirectionZ
          );
          const otherHalf = (otherSegment.length * directionAlignment) / 2;
          const overlapStart = Math.max(-half, otherCenterOffset - otherHalf);
          const overlapEnd = Math.min(half, otherCenterOffset + otherHalf);
          if (overlapEnd - overlapStart <= minOverlap) return [];
          return [
            {
              roomId: otherRoom.id,
              segmentKey: otherSegment.key,
              start: overlapStart,
              end: overlapEnd,
            },
          ];
        }
      );
    });
  }

  const roomLeft = room.x - room.w / 2;
  const roomRight = room.x + room.w / 2;
  const roomNorth = room.z - room.d / 2;
  const roomSouth = room.z + room.d / 2;

  return rooms.flatMap((otherRoom): SharedWallRange3D[] => {
    if (otherRoom.id === room.id) return [];

    const otherLeft = otherRoom.x - otherRoom.w / 2;
    const otherRight = otherRoom.x + otherRoom.w / 2;
    const otherNorth = otherRoom.z - otherRoom.d / 2;
    const otherSouth = otherRoom.z + otherRoom.d / 2;

    let otherSpan: { start: number; end: number } | null = null;

    if (segment.wall === "east") {
      if (Math.abs(roomRight - otherLeft) > tolerance) return [];
      otherSpan = { start: otherNorth, end: otherSouth };
    } else if (segment.wall === "west") {
      if (Math.abs(roomLeft - otherRight) > tolerance) return [];
      otherSpan = { start: otherNorth, end: otherSouth };
    } else if (segment.wall === "north") {
      if (Math.abs(roomNorth - otherSouth) > tolerance) return [];
      otherSpan = { start: otherLeft, end: otherRight };
    } else {
      if (Math.abs(roomSouth - otherNorth) > tolerance) return [];
      otherSpan = { start: otherLeft, end: otherRight };
    }

    const overlapStart = Math.max(segmentStart, otherSpan.start);
    const overlapEnd = Math.min(segmentEnd, otherSpan.end);
    if (overlapEnd - overlapStart <= minOverlap) return [];

    return [
      {
        roomId: otherRoom.id,
        start: Math.max(-half, overlapStart - segmentCenter),
        end: Math.min(half, overlapEnd - segmentCenter),
      },
    ];
  });
}

function splitWallPartsAtSharedBoundaries(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  parts: WallPart3D[]
): WallPart3D[] {
  const sharedRanges = getSharedWallOverlapRanges(room, rooms, segment);
  if (!sharedRanges.length) return parts;

  const minPartLength = 0.08;

  return parts.flatMap((part): WallPart3D[] => {
    const centerOffset = segment.axis === "x"
      ? part.x - segment.x
      : part.z - segment.z;
    const partStart = centerOffset - part.length / 2;
    const partEnd = centerOffset + part.length / 2;
    const splitOffsets = sharedRanges
      .flatMap((range) => [range.start, range.end])
      .filter((offset) => offset > partStart + minPartLength && offset < partEnd - minPartLength)
      .sort((a, b) => a - b);

    if (!splitOffsets.length) return [part];

    const bounds = [partStart, ...splitOffsets, partEnd];
    return bounds.slice(0, -1).flatMap((start, index): WallPart3D[] => {
      const end = bounds[index + 1];
      const length = end - start;
      if (length <= minPartLength) return [];

      const nextCenterOffset = start + length / 2;
      return [
        {
          key: `${part.key}-shared-split-${index}`,
          x: segment.axis === "x" ? segment.x + nextCenterOffset : part.x,
          z: segment.axis === "z" ? segment.z + nextCenterOffset : part.z,
          length,
        },
      ];
    });
  });
}

function rangesOverlapBy(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  minOverlap = 0
) {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > minOverlap;
}

function getSharedWallRoomIds(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
): string[] {
  const centerOffset = segment.axis === "x"
    ? part.x - segment.x
    : part.z - segment.z;
  const partStart = centerOffset - part.length / 2;
  const partEnd = centerOffset + part.length / 2;

  return [
    ...new Set(
      getSharedWallOverlapRanges(room, rooms, segment)
        .filter((range) =>
          rangesOverlapBy(partStart, partEnd, range.start, range.end, 0.35)
        )
        .map((range) => range.roomId)
    ),
  ];
}

function getSharedWallMatches(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
) {
  const centerOffset = segment.axis === "x"
    ? part.x - segment.x
    : part.z - segment.z;
  const partStart = centerOffset - part.length / 2;
  const partEnd = centerOffset + part.length / 2;
  const matches = getSharedWallOverlapRanges(room, rooms, segment)
    .filter((range) =>
      rangesOverlapBy(partStart, partEnd, range.start, range.end, 0.35)
    )
    .flatMap((range) => {
      const sharedRoom = rooms.find((candidate) => candidate.id === range.roomId);
      if (!sharedRoom) return [];
      const sharedSegments = getWallSegments(sharedRoom);
      const sharedSegment = range.segmentKey
        ? sharedSegments.find((candidate) => candidate.key === range.segmentKey)
        : segment.wall
          ? sharedSegments.find(
              (candidate) => candidate.wall === oppositeWall(segment.wall as WallId)
            )
          : undefined;
      return sharedSegment ? [{ room: sharedRoom, segment: sharedSegment }] : [];
    });
  return [
    ...new Map(
      matches.map((match) => [
        `${match.room.id}:${match.segment.key}`,
        match,
      ])
    ).values(),
  ];
}

function legacyWallEndpointWorld(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  endpoint: "start" | "end"
) {
  const local = legacyWallEndpointLocal(segment, endpoint);
  return {
    x: room.x + local.x,
    z: room.z + local.z,
  };
}

function legacyPhysicalWallCutEndJoinOptions(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  excludedSegmentKeys?: ReadonlySet<string>
): LegacyWallEndJoinOptions {
  const localOptions = legacyWallCutEndJoinOptions(
    room,
    segment,
    excludedSegmentKeys
  );
  if (!excludedSegmentKeys?.size) return localOptions;

  const endpoints = {
    start: legacyWallEndpointWorld(room, segment, "start"),
    end: legacyWallEndpointWorld(room, segment, "end"),
  };
  const endpointMatches = (
    first: { x: number; z: number },
    second: { x: number; z: number }
  ) => Math.hypot(first.x - second.x, first.z - second.z) <= 0.08;
  const exposedEndpoints = rooms.flatMap((candidateRoom) =>
    getWallSegments(candidateRoom).flatMap((candidateSegment) => {
      if (excludedSegmentKeys.has(candidateSegment.key)) return [];
      const options = legacyWallCutEndJoinOptions(
        candidateRoom,
        candidateSegment,
        excludedSegmentKeys
      );
      return [
        ...(options.squareStart
          ? [legacyWallEndpointWorld(candidateRoom, candidateSegment, "start")]
          : []),
        ...(options.squareEnd
          ? [legacyWallEndpointWorld(candidateRoom, candidateSegment, "end")]
          : []),
      ];
    })
  );

  return {
    squareStart:
      Boolean(localOptions.squareStart) ||
      exposedEndpoints.some((endpoint) =>
        endpointMatches(endpoints.start, endpoint)
      ),
    squareEnd:
      Boolean(localOptions.squareEnd) ||
      exposedEndpoints.some((endpoint) =>
        endpointMatches(endpoints.end, endpoint)
      ),
  };
}

export function getLegacyPhysicalWallCutEndOptionsForTest({
  rooms,
  excludedSegmentKeys,
}: {
  rooms: readonly HousePlanRoom2D[];
  excludedSegmentKeys: ReadonlySet<string>;
}) {
  return rooms.flatMap((room) =>
    getWallSegments(room).map((segment) => ({
      roomId: room.id,
      segmentKey: segment.key,
      ...legacyPhysicalWallCutEndJoinOptions(
        room,
        rooms,
        segment,
        excludedSegmentKeys
      ),
    }))
  );
}

export function getLegacySharedWallMatchesForTest(
  rooms: readonly HousePlanRoom2D[]
) {
  return rooms.flatMap((room) =>
    getWallSegments(room).map((segment) => {
      const part: WallPart3D = {
        key: `${segment.key}:shared-test`,
        x: segment.x,
        z: segment.z,
        length: segment.length,
      };
      return {
        roomId: room.id,
        segmentKey: segment.key,
        matches: getSharedWallMatches(room, rooms, segment, part).map(
          (match) => ({
            roomId: match.room.id,
            segmentKey: match.segment.key,
          })
        ),
      };
    })
  );
}

function getSharedWallRenderOwnerRoomId(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
): string {
  const sharedRoomIds = getSharedWallRoomIds(room, rooms, segment, part);
  if (!sharedRoomIds.length) return room.id;

  return [room.id, ...sharedRoomIds].sort()[0];
}

function legacyPlanarShape(polygons: PlanarUnionPolygonMm[]) {
  return polygons.map((polygon) => {
    const shape = new THREE.Shape();
    polygon.outer.forEach((point, index) => {
      const x = point.xMm / 1000;
      const y = -point.zMm / 1000;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    for (const holePoints of polygon.holes) {
      const hole = new THREE.Path();
      holePoints.forEach((point, index) => {
        const x = point.xMm / 1000;
        const y = -point.zMm / 1000;
        if (index === 0) hole.moveTo(x, y);
        else hole.lineTo(x, y);
      });
      hole.closePath();
      shape.holes.push(hole);
    }
    return shape;
  });
}

function legacyWallPartRegion(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  part: WallPart3D,
  wallThicknessMeters: number,
  endJoinOptions: LegacyWallEndJoinOptions = {}
): PlanarRegionMm {
  const [directionX, directionZ] = legacyWallDirection(segment);
  const normalX = -directionZ;
  const normalZ = directionX;
  const halfThickness = wallThicknessMeters / 2;
  const pointAt = (offset: number, side: LegacyWallJoinSide) => ({
    xMm:
      (room.x + segment.x + directionX * offset + normalX * side * halfThickness) *
      1000,
    zMm:
      (room.z + segment.z + directionZ * offset + normalZ * side * halfThickness) *
      1000,
  });
  const left = joinedLegacyWallPartAxisRange(
    room,
    segment,
    part,
    1,
    wallThicknessMeters,
    endJoinOptions
  );
  const right = joinedLegacyWallPartAxisRange(
    room,
    segment,
    part,
    -1,
    wallThicknessMeters,
    endJoinOptions
  );
  return {
    outer: [
      pointAt(left.startOffset, 1),
      pointAt(left.endOffset, 1),
      pointAt(right.endOffset, -1),
      pointAt(right.startOffset, -1),
    ],
  };
}

function legacyRoomRegion(room: HousePlanRoom2D): PlanarRegionMm {
  const toWorldRing = (points: Array<[number, number]>) =>
    points.slice(0, -1).map(([x, z]) => ({
      xMm: (room.x + x) * 1000,
      zMm: (room.z + z) * 1000,
    }));
  return {
    outer: toWorldRing(getRoomOutlinePoints(room)),
    holes: getRoomHoleOutlinePoints(room).map(toWorldRing),
  };
}

export function buildLegacyFloorSlabsForTest({
  rooms,
  openings = [],
  defaultWallHeight,
  stackedFloors,
}: {
  rooms: readonly HousePlanRoom2D[];
  openings?: readonly RoomRendererOpening[];
  defaultWallHeight: number;
  stackedFloors: boolean;
}): LegacyFloorSlab3D[] {
  const groups = new Map<
    string,
    {
      floorLevel: number;
      elevationMeters: number;
      thicknessMeters: number;
      regions: PlanarRegionMm[];
    }
  >();
  for (const room of rooms) {
    const roomWallHeight = Math.max(0.2, room.height ?? defaultWallHeight);
    const elevationMeters = resolveHouseRoomFloorElevationMeters(
      room,
      roomWallHeight,
      stackedFloors
    );
    const floorLevel = getRoomFloorLevel(room);
    const key = `${floorLevel}:${Math.round(elevationMeters * 1000)}`;
    const group = groups.get(key) ?? {
      floorLevel,
      elevationMeters,
      thicknessMeters: Math.max(0.01, room.slabThickness ?? FLOOR_THICKNESS_METERS),
      regions: [],
    };
    group.thicknessMeters = Math.max(
      group.thicknessMeters,
      Math.max(0.01, room.slabThickness ?? FLOOR_THICKNESS_METERS)
    );
    group.regions.push(legacyRoomRegion(room));
    const wallThickness = Math.max(
      0.01,
      room.wallThickness ?? STRUCTURE_THICKNESS_METERS
    );
    for (const segment of getWallSegments(room)) {
      const faceId = getWallSurfaceFaceId(room, segment);
      const segmentWallHeight = Math.max(
        0.2,
        room.wallHeights?.[faceId] ?? roomWallHeight
      );
      const wallOpenings = getWallOpenings(room, segment, rooms, openings);
      const baseParts = [
        ...splitWallPartsAtSharedBoundaries(
          room,
          rooms,
          segment,
          buildWallParts(segment, wallOpenings)
        ),
        ...buildOpeningSillParts(
          segment,
          wallOpenings,
          segmentWallHeight,
          segmentWallHeight
        ),
      ];
      const endJoinOptions = legacyWallCutEndJoinOptions(room, segment);
      for (const part of baseParts) {
        group.regions.push(
          legacyWallPartRegion(
            room,
            segment,
            part,
            wallThickness,
            endJoinOptions
          )
        );
      }
    }
    groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const polygons = buildPlanarUnionPolygons(group.regions);
    return polygons.length
      ? [
          {
            key,
            floorLevel: group.floorLevel,
            elevationMeters: group.elevationMeters,
            thicknessMeters: group.thicknessMeters,
            polygons,
          },
        ]
      : [];
  });
}

export function buildLegacyWallBandsForTest({
  rooms,
  openings,
  defaultWallHeight,
  stackedFloors,
  excludedSegmentKeys,
}: {
  rooms: readonly HousePlanRoom2D[];
  openings: readonly RoomRendererOpening[];
  defaultWallHeight: number;
  stackedFloors: boolean;
  excludedSegmentKeys?: ReadonlySet<string>;
}): LegacyWallBand3D[] {
  const groups = new Map<
    string,
    {
      floorLevel: number;
      solids: Array<{
        bottomMm: number;
        topMm: number;
        region: PlanarRegionMm;
      }>;
    }
  >();
  for (const room of rooms) {
    const roomWallHeight = Math.max(0.2, room.height ?? defaultWallHeight);
    const floorElevation = resolveHouseRoomFloorElevationMeters(
      room,
      roomWallHeight,
      stackedFloors
    );
    const floorLevel = getRoomFloorLevel(room);
    const key = `${floorLevel}:${Math.round(floorElevation * 1000)}`;
    const group = groups.get(key) ?? { floorLevel, solids: [] };
    const wallThickness = Math.max(
      0.01,
      room.wallThickness ?? STRUCTURE_THICKNESS_METERS
    );
    for (const segment of getWallSegments(room)) {
      if (excludedSegmentKeys?.has(segment.key)) continue;
      const endJoinOptions = legacyPhysicalWallCutEndJoinOptions(
        room,
        rooms,
        segment,
        excludedSegmentKeys
      );
      const faceId = getWallSurfaceFaceId(room, segment);
      const segmentWallHeight = Math.max(
        0.2,
        room.wallHeights?.[faceId] ?? roomWallHeight
      );
      const wallOpenings = getWallOpenings(room, segment, rooms, openings);
      const parts = splitWallPartsAtSharedBoundaries(
        room,
        rooms,
        segment,
        buildWallParts(segment, wallOpenings)
      );
      const lintels = buildOpeningLintelParts(
        segment,
        wallOpenings,
        segmentWallHeight,
        segmentWallHeight
      );
      const sills = buildOpeningSillParts(
        segment,
        wallOpenings,
        segmentWallHeight,
        segmentWallHeight
      );
      for (const part of [...parts, ...lintels, ...sills]) {
        const partHeight = part.height ?? segmentWallHeight;
        const centerY = part.centerY ?? segmentWallHeight / 2;
        group.solids.push({
          bottomMm: Math.round((floorElevation + centerY - partHeight / 2) * 1000),
          topMm: Math.round((floorElevation + centerY + partHeight / 2) * 1000),
          region: legacyWallPartRegion(
            room,
            segment,
            part,
            wallThickness,
            endJoinOptions
          ),
        });
      }
    }
    groups.set(key, group);
  }

  return [...groups.entries()].flatMap(([groupKey, group]) => {
    const boundaries = [
      ...new Set(group.solids.flatMap((solid) => [solid.bottomMm, solid.topMm])),
    ].sort((left, right) => left - right);
    return boundaries.slice(0, -1).flatMap((bottomMm, index) => {
      const topMm = boundaries[index + 1];
      if (topMm - bottomMm <= 1) return [];
      const regions = group.solids
        .filter(
          (solid) => solid.bottomMm <= bottomMm && solid.topMm >= topMm
        )
        .map((solid) => solid.region);
      const polygons = buildPlanarUnionPolygons(regions);
      return polygons.length
        ? [
            {
              key: `${groupKey}:${bottomMm}:${topMm}`,
              floorLevel: group.floorLevel,
              bottomMeters: bottomMm / 1000,
              topMeters: topMm / 1000,
              polygons,
            },
          ]
        : [];
    });
  });
}

export function resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms,
  activeRoomId,
  cameraX,
  cameraZ,
  viewDirectionX,
  viewDirectionZ,
}: {
  rooms: readonly HousePlanRoom2D[];
  activeRoomId: string;
  cameraX: number;
  cameraZ: number;
  viewDirectionX?: number;
  viewDirectionZ?: number;
}): Set<string> {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  if (!activeRoom) return new Set();

  const suppliedViewMagnitude = Math.hypot(
    viewDirectionX ?? 0,
    viewDirectionZ ?? 0
  );
  const sourceDirectionX = suppliedViewMagnitude > 0.001
    ? -(viewDirectionX ?? 0) / suppliedViewMagnitude
    : cameraX - activeRoom.x;
  const sourceDirectionZ = suppliedViewMagnitude > 0.001
    ? -(viewDirectionZ ?? 0) / suppliedViewMagnitude
    : cameraZ - activeRoom.z;
  const sourceMagnitude = Math.hypot(sourceDirectionX, sourceDirectionZ);
  const normalizedSourceX = sourceMagnitude > 0.001
    ? sourceDirectionX / sourceMagnitude
    : 1 / Math.sqrt(2);
  const normalizedSourceZ = sourceMagnitude > 0.001
    ? sourceDirectionZ / sourceMagnitude
    : 1 / Math.sqrt(2);
  const planBounds = rooms.reduce(
    (bounds, room) => ({
      minX: Math.min(bounds.minX, room.x - room.w / 2),
      maxX: Math.max(bounds.maxX, room.x + room.w / 2),
      minZ: Math.min(bounds.minZ, room.z - room.d / 2),
      maxZ: Math.max(bounds.maxZ, room.z + room.d / 2),
    }),
    {
      minX: activeRoom.x - activeRoom.w / 2,
      maxX: activeRoom.x + activeRoom.w / 2,
      minZ: activeRoom.z - activeRoom.d / 2,
      maxZ: activeRoom.z + activeRoom.d / 2,
    }
  );
  const virtualCameraDistance =
    Math.hypot(
      planBounds.maxX - planBounds.minX,
      planBounds.maxZ - planBounds.minZ
    ) * 4 + 4;
  const stableCameraX =
    activeRoom.x + normalizedSourceX * virtualCameraDistance;
  const stableCameraZ =
    activeRoom.z + normalizedSourceZ * virtualCameraDistance;

  const cutawaySegmentKeys = new Set<string>();
  for (const room of rooms) {
    for (const segment of getWallSegments(room)) {
      if (getSharedWallOverlapRanges(room, rooms, segment).length > 0) {
        continue;
      }
      const opacity = resolveCutawayWallOpacity({
        cameraX: stableCameraX,
        cameraZ: stableCameraZ,
        roomX: room.x,
        roomZ: room.z,
        roomWidth: room.w,
        roomDepth: room.d,
        wall: segment.wall,
        baseOpacity: 1,
        cutawayOpacity: CAMERA_FACING_WALL_CUTAWAY_OPACITY,
        targetX: activeRoom.x,
        targetZ: activeRoom.z,
        targetWidth: activeRoom.w,
        targetDepth: activeRoom.d,
        wallCenterX: room.x + segment.x,
        wallCenterZ: room.z + segment.z,
        wallAxis: segment.axis,
        wallLength: segment.length,
      });
      if (opacity <= 0.01) cutawaySegmentKeys.add(segment.key);
    }
  }
  return cutawaySegmentKeys;
}

function legacyCutawaySegmentKeySignature(keys: ReadonlySet<string>) {
  return [...keys].sort().join("|");
}

function useLegacyCameraCutawaySegmentKeys({
  rooms,
  activeRoomId,
  enabled,
}: {
  rooms: readonly HousePlanRoom2D[];
  activeRoomId: string;
  enabled: boolean;
}) {
  const { camera } = useThree();
  const viewDirectionRef = useRef(new THREE.Vector3());
  const initialKeys = useMemo(
    () => {
      if (!enabled) return new Set<string>();
      const viewDirection = camera.getWorldDirection(new THREE.Vector3());
      return resolveLegacyCameraCutawaySegmentKeysForTest({
        rooms,
        activeRoomId,
        cameraX: camera.position.x,
        cameraZ: camera.position.z,
        viewDirectionX: viewDirection.x,
        viewDirectionZ: viewDirection.z,
      });
    },
    [activeRoomId, camera, enabled, rooms]
  );
  const [cutawaySegmentKeys, setCutawaySegmentKeys] = useState(initialKeys);
  const signatureRef = useRef(legacyCutawaySegmentKeySignature(initialKeys));

  useFrame(() => {
    const viewDirection = camera.getWorldDirection(viewDirectionRef.current);
    const nextKeys = enabled
      ? resolveLegacyCameraCutawaySegmentKeysForTest({
          rooms,
          activeRoomId,
          cameraX: camera.position.x,
          cameraZ: camera.position.z,
          viewDirectionX: viewDirection.x,
          viewDirectionZ: viewDirection.z,
        })
      : new Set<string>();
    const nextSignature = legacyCutawaySegmentKeySignature(nextKeys);
    if (nextSignature === signatureRef.current) return;
    signatureRef.current = nextSignature;
    setCutawaySegmentKeys(nextKeys);
  });

  return cutawaySegmentKeys;
}

function LegacyFloorSlabMesh({ slab }: { slab: LegacyFloorSlab3D }) {
  const { camera } = useThree();
  const slabRef = useRef<THREE.Mesh | null>(null);
  const shapes = useMemo(() => legacyPlanarShape(slab.polygons), [slab.polygons]);
  useFrame(() => {
    if (!slabRef.current) return;
    slabRef.current.visible =
      camera.position.y > slab.elevationMeters - slab.thicknessMeters * 0.35;
  });
  return (
    <mesh
      ref={slabRef}
      position={[0, slab.elevationMeters - slab.thicknessMeters, 0]}
      rotation-x={-Math.PI / 2}
      raycast={() => null}
      userData={{
        testId: "legacy-watertight-floor-slab-3d",
        floorLevel: slab.floorLevel,
        polygonCount: slab.polygons.length,
      }}
    >
      <extrudeGeometry
        args={[
          shapes,
          { depth: slab.thicknessMeters, bevelEnabled: false, steps: 1 },
        ]}
      />
      <meshBasicMaterial
        attach="material-0"
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
      <meshBasicMaterial
        attach="material-1"
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
    </mesh>
  );
}

function LegacyWallBandMesh({
  band,
  opacity,
}: {
  band: LegacyWallBand3D;
  opacity: number;
}) {
  const shapes = useMemo(() => legacyPlanarShape(band.polygons), [band.polygons]);
  return (
    <mesh
      position={[0, band.bottomMeters, 0]}
      rotation-x={-Math.PI / 2}
      raycast={() => null}
      userData={{
        testId: "legacy-watertight-wall-band-3d",
        floorLevel: band.floorLevel,
        polygonCount: band.polygons.length,
      }}
    >
      <extrudeGeometry
        args={[
          shapes,
          {
            depth: Math.max(0.001, band.topMeters - band.bottomMeters),
            bevelEnabled: false,
            steps: 1,
          },
        ]}
      />
      <meshStandardMaterial
        color={INACTIVE_WALL_COLOR}
        roughness={0.82}
        flatShading
        transparent={opacity < 0.999}
        opacity={opacity}
      />
    </mesh>
  );
}

function WallSurfaceSideMesh({
  materialKey,
  target,
  settings,
  partLength,
  partHeight,
  centerOffset,
  side,
  wallThickness,
  active,
  baseOpacity,
  renderSurface,
  outlineStyle,
  interactive,
  pickEnabledRef,
  onMaterialReady,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  materialKey: string;
  target: StructureTarget;
  settings: ReturnType<typeof getWallFaceSurfaceSettings>;
  partLength: number;
  partHeight: number;
  centerOffset: number;
  side: 1 | -1;
  wallThickness: number;
  active: boolean;
  baseOpacity: number;
  renderSurface: boolean;
  outlineStyle: ReturnType<typeof getStructureOutlineStyle>;
  interactive: boolean;
  pickEnabledRef: { current: boolean };
  onMaterialReady: (targetKey: string, material: THREE.MeshStandardMaterial | null) => void;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { gl, invalidate } = useThree();
  const surfaceMeshRef = useRef<THREE.Mesh | null>(null);
  const hitMeshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const wallSurfaceMaterial = getRuntimeSurfaceMaterialById(settings.materialId);
  const patternedWallTexture = useSurfaceMaterialTexture({
    material: wallSurfaceMaterial,
    roomWidthMeters: partLength,
    roomDepthMeters: partHeight,
    floorScale: settings.scale,
    rotationRad: THREE.MathUtils.degToRad(settings.rotationDeg),
    floorPattern: settings.pattern,
    patternOffset: settings.offset,
    jointSizeMm: settings.jointSizeMm,
    jointColor: settings.jointColor,
    maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
    uvMode: "normalized",
    textureResolution: WALL_SURFACE_TEXTURE_RESOLUTION,
  });
  const sourceWallTexture = useSurfaceMaterialSourceTexture({
    material: wallSurfaceMaterial,
    surfaceWidthMeters: partLength,
    surfaceHeightMeters: partHeight,
    scale: settings.scale,
    rotationRad: THREE.MathUtils.degToRad(settings.rotationDeg),
    maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
  });
  const wallTexture = patternedWallTexture ?? sourceWallTexture;
  const wallColor =
    wallTexture
      ? "#ffffff"
      : settings.paintColorHex ??
        getSurfaceMaterialFallbackColor(wallSurfaceMaterial) ??
        (active ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR);
  const surfaceOffsetZ =
    side * (wallThickness / 2 + WALL_SURFACE_OFFSET_METERS);
  const surfaceRotationY = side === 1 ? 0 : Math.PI;
  const raycastWhenPickable = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = surfaceMeshRef.current;
      if (!interactive || !pickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive, pickEnabledRef]
  );
  const raycastHitWhenPickable = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = hitMeshRef.current;
      if (!interactive || !pickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive, pickEnabledRef]
  );
  const handlePointerOver = interactive
    ? (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onHoverTarget(target);
      }
    : undefined;
  const handlePointerOut = interactive
    ? (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onClearHoverTarget(target);
      }
    : undefined;
  const handleClick = interactive
    ? (event: ThreeEvent<MouseEvent>) => {
        onSelectTarget(target, event);
      }
    : undefined;

  useEffect(() => {
    onMaterialReady(materialKey, materialRef.current);
    return () => onMaterialReady(materialKey, null);
  }, [materialKey, onMaterialReady]);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.map = wallTexture;
    materialRef.current.color.set(wallColor);
    materialRef.current.needsUpdate = true;
    invalidate();
  }, [invalidate, wallColor, wallTexture]);

  return (
    <group position={[centerOffset, 0, surfaceOffsetZ]} rotation-y={surfaceRotationY}>
      <mesh
        ref={surfaceMeshRef}
        visible={renderSurface}
        renderOrder={12}
        raycast={raycastWhenPickable}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <planeGeometry args={[partLength, partHeight]} />
        <meshStandardMaterial
          ref={materialRef}
          color={wallColor}
          map={wallTexture ?? undefined}
          roughness={wallSurfaceMaterial ? wallSurfaceMaterial.rendering.roughness : 0.86}
          metalness={wallSurfaceMaterial ? wallSurfaceMaterial.rendering.metalness : 0}
          side={THREE.DoubleSide}
          transparent={baseOpacity < 0.999}
          depthWrite={baseOpacity > 0.34}
          opacity={baseOpacity}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
        {outlineStyle ? (
          <Line
            points={[
              [-partLength / 2, -partHeight / 2 + 0.025, 0.003],
              [partLength / 2, -partHeight / 2 + 0.025, 0.003],
              [partLength / 2, partHeight / 2 - 0.025, 0.003],
              [-partLength / 2, partHeight / 2 - 0.025, 0.003],
              [-partLength / 2, -partHeight / 2 + 0.025, 0.003],
            ]}
            color={outlineStyle.color}
            lineWidth={outlineStyle.lineWidth}
            raycast={() => null}
          />
        ) : null}
      </mesh>
      <mesh
        ref={hitMeshRef}
        position={[0, 0, 0.001]}
        raycast={raycastHitWhenPickable}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <planeGeometry args={[partLength + 0.02, partHeight + 0.04]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function CutawayWallMesh({
  room,
  rooms,
  segment,
  part,
  wallHeight,
  wallThickness,
  wallOpacity,
  renderBase,
  renderSurfaces,
  forceCutaway,
  squareStart,
  squareEnd,
  activeRoomId,
  isActive,
  interactive,
  hoveredTargetKey,
  selectedTargetKey,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  rooms: readonly HousePlanRoom2D[];
  segment: WallSegment3D;
  part: WallPart3D;
  wallHeight: number;
  wallThickness: number;
  wallOpacity: number;
  renderBase: boolean;
  renderSurfaces: boolean;
  forceCutaway: boolean;
  squareStart: boolean;
  squareEnd: boolean;
  activeRoomId: string;
  isActive: boolean;
  interactive: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const baseMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const surfaceMaterialRefs = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const baseOpacity = (isActive ? ACTIVE_WALL_OPACITY : INACTIVE_WALL_OPACITY) * wallOpacity;
  const partHeight = part.height ?? wallHeight;
  const partCenterY = part.centerY ?? wallHeight / 2;
  const partAxisRange = legacyWallPartAxisRange(segment, part);
  const partTouchesSegmentStart =
    Math.abs(partAxisRange.startOffset + segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const partTouchesSegmentEnd =
    Math.abs(partAxisRange.endOffset - segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const faceId = getWallSurfaceFaceId(room, segment);
  const currentRoomTarget: StructureTarget = {
    kind: "wall",
    roomId: room.id,
    id: faceId,
  };
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const wallSettings = getWallFaceSurfaceSettings(
    surfaces,
    faceId,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const interiorSurfaceSide = getWallInteriorSurfaceSide(segment);
  const sharedWallMatches = getSharedWallMatches(room, rooms, segment, part);
  const isInteriorSharedWall = sharedWallMatches.length > 0;
  const activeRoom = rooms.find((entry) => entry.id === activeRoomId);
  const sharedRoomIds = getSharedWallRoomIds(room, rooms, segment, part);
  const targetKey = getStructureTargetKey(currentRoomTarget) ?? `${room.id}:${faceId}`;
  const surfaceSides = [
    {
      key: `${part.key}:${targetKey}:interior`,
      targetKey,
      target: currentRoomTarget,
      settings: wallSettings,
      side: interiorSurfaceSide,
      active: room.id === activeRoomId,
    },
    ...sharedWallMatches.flatMap(({ room: sharedRoom, segment: sharedSegment }) => {
          const sharedFaceId = getWallSurfaceFaceId(sharedRoom, sharedSegment);
          const sharedTarget: StructureTarget = {
            kind: "wall",
            roomId: sharedRoom.id,
            id: sharedFaceId,
          };
          const sharedSettings = getWallFaceSurfaceSettings(
            sharedRoom.surfaces ?? sharedRoom.surfaceFinishes,
            sharedFaceId,
            normalizeFloorRotationDeg,
            clampFloorPatternScale
          );
          return [
            {
              key: `${part.key}:${getStructureTargetKey(sharedTarget) ?? `${sharedRoom.id}:${sharedFaceId}`}`,
              targetKey: getStructureTargetKey(sharedTarget) ?? `${sharedRoom.id}:${sharedFaceId}`,
              target: sharedTarget,
              settings: sharedSettings,
              side: -interiorSurfaceSide as 1 | -1,
              active: sharedRoom.id === activeRoomId,
            },
          ];
        }),
    ...(sharedRoomIds.length === 0
      ? [
          {
            key: `${part.key}:${targetKey}:exterior`,
            targetKey,
            target: currentRoomTarget,
            settings: wallSettings,
            side: -interiorSurfaceSide as 1 | -1,
            active: room.id === activeRoomId,
          },
        ]
      : []),
  ];
  const handleSurfaceMaterialReady = useCallback(
    (targetKey: string, material: THREE.MeshStandardMaterial | null) => {
      if (material) {
        surfaceMaterialRefs.current.set(targetKey, material);
        return;
      }
      surfaceMaterialRefs.current.delete(targetKey);
    },
    []
  );
  const sharedWallOwnerRoomId = getSharedWallRenderOwnerRoomId(
    room,
    rooms,
    segment,
    part
  );
  const isDuplicateSharedWall = sharedWallOwnerRoomId !== room.id;
  const pickEnabledRef = useRef(!isDuplicateSharedWall && baseOpacity > 0.01);

  useFrame(() => {
    if (isDuplicateSharedWall) {
      pickEnabledRef.current = false;
      return;
    }

    let targetOpacity = baseOpacity;

    const cutawayEligible = forceCutaway && !isInteriorSharedWall;
    targetOpacity = resolveCutawayWallOpacity({
      cameraX: camera.position.x,
      cameraZ: camera.position.z,
      roomX: room.x,
      roomZ: room.z,
      roomWidth: room.w,
      roomDepth: room.d,
      wall: segment.wall,
      baseOpacity,
      cutawayEligible,
      forceCutaway: cutawayEligible,
      cutawayOpacity: CAMERA_FACING_WALL_CUTAWAY_OPACITY,
      targetX: activeRoom?.x,
      targetZ: activeRoom?.z,
      targetWidth: activeRoom?.w,
      targetDepth: activeRoom?.d,
      wallCenterX: room.x + part.x,
      wallCenterZ: room.z + part.z,
      wallAxis: segment.axis,
      wallLength: part.length,
    });

    const shouldRender = targetOpacity > 0.01;

    if (groupRef.current) {
      groupRef.current.visible = shouldRender;
    }
    pickEnabledRef.current = shouldRender;

    const materials = [baseMaterialRef.current, ...Array.from(surfaceMaterialRefs.current.values())].filter(
      (material): material is THREE.MeshStandardMaterial => Boolean(material)
    );
    if (materials.length === 0) return;

    const referenceOpacity = baseMaterialRef.current?.opacity ?? targetOpacity;
    const nextOpacity = referenceOpacity + (targetOpacity - referenceOpacity) * 0.28;

    materials.forEach((material) => {
      if (Math.abs(material.opacity - nextOpacity) < 0.002) {
        material.opacity = targetOpacity;
      } else {
        material.opacity = nextOpacity;
      }

      const nextTransparent = targetOpacity < 0.999 || material.opacity < 0.999;
      if (material.transparent !== nextTransparent) {
        material.transparent = nextTransparent;
        material.needsUpdate = true;
      }
      material.depthWrite = material.opacity > 0.34;
    });
  });

  if (isDuplicateSharedWall) return null;

  return (
    <group
      ref={groupRef}
      position={[part.x, partCenterY, part.z]}
      rotation-y={segment.rotationY}
    >
      {renderBase ? (
        <mesh raycast={() => null}>
          <boxGeometry args={[part.length, partHeight, wallThickness]} />
          <meshStandardMaterial
            ref={baseMaterialRef}
            color={isActive ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR}
            transparent={baseOpacity < 0.999}
            depthWrite={baseOpacity > 0.34}
            opacity={baseOpacity}
          />
        </mesh>
      ) : null}
      {renderSurfaces && squareStart && partTouchesSegmentStart ? (
        <mesh
          position={[-part.length / 2 - 0.001, 0, 0]}
          rotation-y={-Math.PI / 2}
          raycast={() => null}
          renderOrder={13}
        >
          <planeGeometry
            args={[
              wallThickness + WALL_SURFACE_OFFSET_METERS * 2,
              partHeight,
            ]}
          />
          <meshBasicMaterial color={WALL_SECTION_CAP_COLOR} toneMapped={false} />
        </mesh>
      ) : null}
      {renderSurfaces && squareEnd && partTouchesSegmentEnd ? (
        <mesh
          position={[part.length / 2 + 0.001, 0, 0]}
          rotation-y={Math.PI / 2}
          raycast={() => null}
          renderOrder={13}
        >
          <planeGeometry
            args={[
              wallThickness + WALL_SURFACE_OFFSET_METERS * 2,
              partHeight,
            ]}
          />
          <meshBasicMaterial color={WALL_SECTION_CAP_COLOR} toneMapped={false} />
        </mesh>
      ) : null}
      {surfaceSides.map((surface) => {
        const joinedSurface = joinedLegacyWallSurfacePart(
          room,
          segment,
          part,
          surface.side,
          wallThickness,
          { squareStart, squareEnd }
        );
        return (
          <WallSurfaceSideMesh
            key={surface.key}
            materialKey={surface.key}
            target={surface.target}
            settings={surface.settings}
            partLength={joinedSurface.length}
            partHeight={partHeight}
            centerOffset={joinedSurface.centerDelta}
            side={surface.side}
            wallThickness={wallThickness}
            active={surface.active}
            baseOpacity={baseOpacity}
            renderSurface={renderSurfaces}
            outlineStyle={getStructureOutlineStyle(surface.targetKey, hoveredTargetKey, selectedTargetKey)}
            interactive={interactive}
            pickEnabledRef={pickEnabledRef}
            onMaterialReady={handleSurfaceMaterialReady}
            onHoverTarget={onHoverTarget}
            onClearHoverTarget={onClearHoverTarget}
            onSelectTarget={onSelectTarget}
          />
        );
      })}
    </group>
  );
}

function OpeningThresholdMesh({
  roomId,
  threshold,
  segment,
  wallThickness,
  sourceOpening,
  sourceRoom,
  floorWorldY,
  interactive,
  hoveredTargetKey,
  selectedTargetKey,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
  onMoveOpening,
  onOpeningDragStateChange,
}: {
  roomId: string;
  threshold: OpeningThreshold3D;
  segment: WallSegment3D;
  wallThickness: number;
  sourceOpening?: RoomRendererOpening;
  sourceRoom?: HousePlanRoom2D;
  floorWorldY: number;
  interactive: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
  onMoveOpening?: (openingId: string, offsetMeters: number) => void;
  onOpeningDragStateChange?: (isDragging: boolean) => void;
}) {
  const { camera } = useThree();
  const openingMeshRef = useRef<THREE.Mesh | null>(null);
  const openingHitMeshRef = useRef<THREE.Mesh | null>(null);
  const dragStateRef = useRef<{ pointerId: number; grabDelta: number } | null>(null);
  const dragPointRef = useRef(new THREE.Vector3());
  const openingPickEnabledRef = useRef(true);
  const target: StructureTarget = {
    kind: "opening",
    roomId,
    id: threshold.sourceId,
  };
  const targetKey = getStructureTargetKey(target) ?? "";
  const outlineStyle = getStructureOutlineStyle(targetKey, hoveredTargetKey, selectedTargetKey);
  const thresholdDepth = wallThickness * 1.35;
  const jambHalfWidth = threshold.length / 2;
  const highlightDepth = thresholdDepth + 0.024;
  const highlightThickness = 0.035;
  const jambBaseY = 0.024;
  const jambTopY = Math.max(jambBaseY + 0.2, threshold.height - 0.02);
  const jambHeight = jambTopY - jambBaseY;
  const hitHeight = Math.max(0.75, jambTopY + 0.18);
  const canDragOpening = interactive && Boolean(sourceOpening && sourceRoom && onMoveOpening);
  const raycastOpeningWhenPickable = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = openingMeshRef.current;
      if (!interactive || !openingPickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );
  const raycastOpeningHitWhenPickable = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = openingHitMeshRef.current;
      if (!interactive || !openingPickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );

  useFrame(() => {
    openingPickEnabledRef.current = camera.position.y >= floorWorldY - 0.02;
  });

  const getPointerOffset = (event: ThreeEvent<PointerEvent>) => {
    if (!sourceOpening || !sourceRoom) return null;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorWorldY);
    const point = event.ray.intersectPlane(dragPlane, dragPointRef.current);
    if (!point) return null;

    const axisValue =
      sourceOpening.wall === "north" || sourceOpening.wall === "south" ? point.x : point.z;
    const centerAxis =
      sourceOpening.wall === "north" || sourceOpening.wall === "south"
        ? sourceRoom.x
        : sourceRoom.z;

    return axisValue - centerAxis;
  };

  const getDraggedOffset = (event: ThreeEvent<PointerEvent>) => {
    if (!sourceOpening || !sourceRoom) return null;
    const pointerOffset = getPointerOffset(event);
    if (pointerOffset === null) return null;
    const span =
      sourceOpening.wall === "north" || sourceOpening.wall === "south"
        ? sourceRoom.w
        : sourceRoom.d;
    const maxOffset = Math.max(
      0,
      span / 2 - sourceOpening.width / 2 - PLAN_OPENING_EDGE_PADDING_METERS
    );
    const grabDelta = dragStateRef.current?.grabDelta ?? 0;

    return clamp(pointerOffset + grabDelta, -maxOffset, maxOffset);
  };

  const moveOpeningFromPointer = (event: ThreeEvent<PointerEvent>) => {
    if (!sourceOpening || !onMoveOpening) return;
    const offsetMeters = getDraggedOffset(event);
    if (offsetMeters === null) return;
    onMoveOpening(sourceOpening.id, offsetMeters);
  };

  const finishOpeningDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragStateRef.current) return;
    stopStructurePointerEvent(event);
    releasePointerCaptureIfSupported(event);
    dragStateRef.current = null;
    onOpeningDragStateChange?.(false);
  };

  return (
    <mesh
      ref={openingMeshRef}
      position={[threshold.x, 0.015, threshold.z]}
      rotation-y={segment.rotationY}
      raycast={raycastOpeningWhenPickable}
      onPointerDown={
        interactive
          ? (event) => {
              stopStructurePointerEvent(event);
              onSelectTarget(target, event);
              if (!canDragOpening) return;
              const pointerOffset = getPointerOffset(event) ?? sourceOpening?.offset ?? 0;
              capturePointerIfSupported(event);
              dragStateRef.current = {
                pointerId: event.pointerId,
                grabDelta: (sourceOpening?.offset ?? 0) - pointerOffset,
              };
              onOpeningDragStateChange?.(true);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (event) => {
              const dragState = dragStateRef.current;
              if (!dragState || dragState.pointerId !== event.pointerId) return;
              stopStructurePointerEvent(event);
              moveOpeningFromPointer(event);
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? (event) => {
              finishOpeningDrag(event);
            }
          : undefined
      }
      onPointerCancel={
        interactive
          ? (event) => {
              finishOpeningDrag(event);
            }
          : undefined
      }
      onPointerOver={
        interactive
          ? (event) => {
              event.stopPropagation();
              onHoverTarget(target);
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? (event) => {
              event.stopPropagation();
              onClearHoverTarget(target);
            }
          : undefined
      }
      onClick={
        interactive
          ? (event) => {
              stopStructurePointerEvent(event);
              onSelectTarget(target, event);
            }
          : undefined
      }
    >
      <boxGeometry args={[threshold.length, 0.03, thresholdDepth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <mesh
        ref={openingHitMeshRef}
        position={[0, hitHeight / 2, 0]}
        renderOrder={21}
        raycast={raycastOpeningHitWhenPickable}
      >
        <boxGeometry args={[threshold.length + 0.22, hitHeight, thresholdDepth + 0.22]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {outlineStyle ? (
        <>
          <mesh
            position={[0, jambBaseY, 0]}
            raycast={() => null}
            renderOrder={20}
          >
            <boxGeometry args={[threshold.length, highlightThickness, highlightDepth]} />
            <meshBasicMaterial
              color={outlineStyle.color}
              transparent
              opacity={0.74}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[-jambHalfWidth, jambBaseY + jambHeight / 2, 0]}
            raycast={() => null}
            renderOrder={20}
          >
            <boxGeometry args={[highlightThickness, jambHeight, highlightDepth]} />
            <meshBasicMaterial
              color={outlineStyle.color}
              transparent
              opacity={0.74}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[jambHalfWidth, jambBaseY + jambHeight / 2, 0]}
            raycast={() => null}
            renderOrder={20}
          >
            <boxGeometry args={[highlightThickness, jambHeight, highlightDepth]} />
            <meshBasicMaterial
              color={outlineStyle.color}
              transparent
              opacity={0.74}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}
    </mesh>
  );
}

function RoomFloorMesh({
  room,
  material,
  wallThickness,
  slabThickness,
  showEdgeBand,
  floorWorldY,
  floorOpacity,
  interactive,
  floorTarget,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  material: FloorMaterial;
  wallThickness: number;
  slabThickness: number;
  showEdgeBand: boolean;
  floorWorldY: number;
  floorOpacity: number;
  interactive: boolean;
  floorTarget: StructureTarget;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { camera, gl } = useThree();
  const floorSurfaceRef = useRef<THREE.Mesh | null>(null);
  const floorBandRef = useRef<THREE.Mesh | null>(null);
  const floorPickEnabledRef = useRef(true);
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const floorSettings = normalizeFloorSurfaceSettings(
    surfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const floorRotation = THREE.MathUtils.degToRad(floorSettings.floorRotationDeg);
  const surfaceMaterial = getRuntimeSurfaceMaterialById(surfaces?.floorMaterialId);
  const slabEdgeOffset = wallThickness / 2;
  const floorBandGeometry = useMemo(
    () =>
      showEdgeBand
        ? buildRoomEdgeBandGeometry(room, slabThickness, slabEdgeOffset)
        : null,
    [room, showEdgeBand, slabEdgeOffset, slabThickness]
  );
  const surfaceTexture = useSurfaceMaterialTexture({
    material: surfaceMaterial,
    roomWidthMeters: room.w,
    roomDepthMeters: room.d,
    floorScale: floorSettings.floorScale,
    rotationRad: floorRotation,
    floorPattern: floorSettings.floorPattern,
    patternOffset: floorSettings.floorPatternOffset,
    jointSizeMm: floorSettings.floorJointSizeMm,
    jointColor: floorSettings.floorJointColor,
    maxAnisotropy,
  });
  const defaultTexture = useMemo(() => {
    const nextTexture = createFloorMaterialTexture(
      material,
      maxAnisotropy,
      floorSettings.floorPattern,
      floorSettings.floorJointSizeMm,
      floorSettings.floorJointColor
    );
    if (!nextTexture) return null;

    nextTexture.repeat.set(1 / floorSettings.floorScale, 1 / floorSettings.floorScale);
    nextTexture.center.set(0.5, 0.5);
    nextTexture.offset.set(floorSettings.floorPatternOffset.x, floorSettings.floorPatternOffset.y);
    nextTexture.rotation = floorRotation;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [
    material,
    maxAnisotropy,
    floorSettings.floorPattern,
    floorSettings.floorJointColor,
    floorSettings.floorJointSizeMm,
    floorSettings.floorPatternOffset.x,
    floorSettings.floorPatternOffset.y,
    floorSettings.floorScale,
    floorRotation,
  ]);

  useEffect(() => {
    return () => {
      defaultTexture?.dispose();
    };
  }, [defaultTexture]);

  useEffect(() => {
    return () => {
      floorBandGeometry?.dispose();
    };
  }, [floorBandGeometry]);

  const raycastFloorSurface = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = floorSurfaceRef.current;
      if (!interactive || !floorPickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );

  useFrame(() => {
    const floorVisible = camera.position.y > floorWorldY - slabThickness * 0.35;
    if (floorSurfaceRef.current) floorSurfaceRef.current.visible = floorVisible;
    if (floorBandRef.current) floorBandRef.current.visible = floorVisible;
    floorPickEnabledRef.current = floorVisible;
  });

  return (
    <>
      <mesh
        ref={floorSurfaceRef}
        rotation-x={-Math.PI / 2}
        position={[0, 0.001, 0]}
        receiveShadow
        raycast={raycastFloorSurface}
        onPointerOver={
          interactive
            ? (event) => {
                event.stopPropagation();
                onHoverTarget(floorTarget);
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? (event) => {
                event.stopPropagation();
                onClearHoverTarget(floorTarget);
              }
            : undefined
        }
        onClick={(event) => {
          if (!interactive) return;
          onSelectTarget(floorTarget, event);
        }}
      >
        <shapeGeometry args={[buildRoomShapeGeometry(room)]} />
        <meshStandardMaterial
          color={surfaceTexture || defaultTexture ? "#ffffff" : material.renderColor}
          map={surfaceTexture ?? defaultTexture ?? undefined}
          roughness={surfaceTexture && surfaceMaterial ? surfaceMaterial.rendering.roughness : 0.84}
          metalness={surfaceTexture && surfaceMaterial ? surfaceMaterial.rendering.metalness : 0}
          transparent={floorOpacity < 0.999}
          opacity={floorOpacity}
          depthWrite={floorOpacity > 0.34}
        />
      </mesh>
      {floorBandGeometry ? (
        <mesh
          ref={floorBandRef}
          geometry={floorBandGeometry}
          position={[0, -slabThickness, 0]}
          raycast={() => null}
        >
          <meshBasicMaterial
            color={material.lineColor}
            side={THREE.DoubleSide}
            transparent={floorOpacity < 0.999}
            opacity={floorOpacity}
          />
        </mesh>
      ) : null}
    </>
  );
}

function RoomCeilingCapMesh({
  room,
  floorWorldY,
  wallHeight,
  visible,
  opacity,
  color,
  interactive,
  ceilingTarget,
  outlineStyle,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  floorWorldY: number;
  wallHeight: number;
  visible: boolean;
  opacity: number;
  color: string;
  interactive: boolean;
  ceilingTarget: StructureTarget;
  outlineStyle: ReturnType<typeof getStructureOutlineStyle>;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const ceilingCapMeshRef = useRef<THREE.Mesh | null>(null);
  const ceilingCapPickEnabledRef = useRef(false);
  const ceilingCapGeometry = useMemo(
    () => buildHorizontalRoomGeometry(room),
    [room]
  );
  const ceilingBandGeometry = useMemo(
    () => buildRoomEdgeBandGeometry(room, CEILING_THICKNESS_METERS),
    [room]
  );
  const raycastCeilingCap = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = ceilingCapMeshRef.current;
      if (!interactive || !ceilingCapPickEnabledRef.current) return;
      if (raycaster.ray.direction.y <= 0.001) return;
      if (!mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (!visible) {
      group.visible = false;
      ceilingCapPickEnabledRef.current = false;
      return;
    }

    const ceilingWorldY = floorWorldY + wallHeight;
    const canPickCeilingCap = camera.position.y < ceilingWorldY - 0.005;
    group.visible = canPickCeilingCap;
    ceilingCapPickEnabledRef.current = canPickCeilingCap;
  });

  useEffect(() => {
    return () => {
      ceilingCapGeometry.dispose();
      ceilingBandGeometry.dispose();
    };
  }, [ceilingBandGeometry, ceilingCapGeometry]);

  return (
    <group ref={groupRef} position={[0, wallHeight, 0]} visible={false}>
      <mesh
        ref={ceilingCapMeshRef}
        geometry={ceilingCapGeometry}
        raycast={raycastCeilingCap}
        renderOrder={1}
        onPointerOver={
          interactive
            ? (event) => {
                event.stopPropagation();
                onHoverTarget(ceilingTarget);
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? (event) => {
                event.stopPropagation();
                onClearHoverTarget(ceilingTarget);
              }
            : undefined
        }
        onClick={
          interactive
            ? (event) => {
                onSelectTarget(ceilingTarget, event);
              }
            : undefined
        }
      >
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          transparent={opacity < 0.999}
          side={THREE.DoubleSide}
        />
      </mesh>
      {outlineStyle ? (
        <Line
          points={getRoomOutlinePoints(room).map(([x, z]) => [x, -0.012, z])}
          color={outlineStyle.color}
          lineWidth={outlineStyle.lineWidth}
          depthTest={false}
          raycast={() => null}
        />
      ) : null}
      <mesh
        geometry={ceilingBandGeometry}
        raycast={() => null}
        renderOrder={2}
      >
        <meshBasicMaterial
          color={CEILING_EDGE_COLOR}
          opacity={opacity}
          transparent={opacity < 0.999}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export default function HousePlanRenderer3D({
  rooms,
  openings = [],
  activeRoomId,
  focusRoomId = null,
  activeFloorLevel,
  wallHeight,
  stackedFloors = false,
  fadeInactiveFloors = false,
  interactive = false,
  onSelectRoom,
  selectedOpeningId = null,
  selectedSurfaceTarget = null,
  onSelectSurfaceTarget,
  onSelectOpening,
  onMoveOpening,
  onResizeOpening,
  onOpeningDragStateChange,
  canonicalPlan = null,
  canonicalStructureExpected = false,
}: HousePlanRenderer3DProps) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const resolvedActiveFloorLevel =
    typeof activeFloorLevel === "number" && Number.isFinite(activeFloorLevel)
      ? activeFloorLevel
      : activeRoom
        ? getRoomFloorLevel(activeRoom)
        : 1;
  const [hoveredStructureTarget, setHoveredStructureTarget] = useState<StructureTarget | null>(null);
  const hoveredTargetKey = getStructureTargetKey(hoveredStructureTarget);
  const selectedOpening = selectedOpeningId
    ? openings.find((opening) => opening.id === selectedOpeningId) ?? null
    : null;
  const selectedTargetKey = getStructureTargetKey(
    selectedSurfaceTarget?.roomId === activeRoomId
      ? selectedSurfaceTarget
      : selectedOpening
        ? { kind: "opening", roomId: selectedOpening.roomId ?? activeRoomId, id: selectedOpening.id }
        : null
  );
  const legacyCutawaySegmentKeys = useLegacyCameraCutawaySegmentKeys({
    rooms,
    activeRoomId,
    enabled: !canonicalPlan && rooms.length > 0,
  });
  // These editor-state arrays are immutable snapshots. The React compiler
  // cannot prove that across the legacy geometry helpers, while retaining this
  // memo avoids rebuilding planar unions during unrelated interactive renders.
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const legacyWatertightGeometry = useMemo(() => {
    if (canonicalPlan || rooms.length === 0) return null;
    return {
      floorSlabs: buildLegacyFloorSlabsForTest({
        rooms: [...rooms],
        openings: [...openings],
        defaultWallHeight: wallHeight,
        stackedFloors,
      }),
      wallBands: buildLegacyWallBandsForTest({
        rooms: [...rooms],
        openings: [...openings],
        defaultWallHeight: wallHeight,
        stackedFloors,
        excludedSegmentKeys: legacyCutawaySegmentKeys,
      }),
    };
  }, [
    canonicalPlan,
    legacyCutawaySegmentKeys,
    openings,
    rooms,
    stackedFloors,
    wallHeight,
  ]);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const hasLegacyMergedSlab = Boolean(
    legacyWatertightGeometry?.floorSlabs.length
  );
  const hasLegacyMergedWalls = Boolean(
    legacyWatertightGeometry?.wallBands.length
  );

  const clearHoveredTarget = (target: StructureTarget) => {
    setHoveredStructureTarget((previous) =>
      isSameStructureTarget(previous, target) ? null : previous
    );
  };

  const selectStructureTarget = (
    target: StructureTarget,
    event: ThreeEvent<MouseEvent | PointerEvent>
  ) => {
    if (!interactive) return;
    event.stopPropagation();
    if (target.kind === "opening") {
      onSelectOpening?.(target.id);
      return;
    }
    if (onSelectSurfaceTarget) {
      onSelectSurfaceTarget({
        kind: target.kind,
        roomId: target.roomId,
        id: target.id,
      });
    } else {
      onSelectRoom?.(target.roomId);
    }
    onSelectOpening?.(null);
  };

  return (
    <group>
      {legacyWatertightGeometry?.floorSlabs.map((slab) => (
        <LegacyFloorSlabMesh
          key={`legacy-floor-slab:${slab.key}`}
          slab={slab}
        />
      ))}
      {legacyWatertightGeometry?.wallBands.map((band) => (
        <LegacyWallBandMesh
          key={`legacy-wall-band:${band.key}`}
          band={band}
          opacity={
            stackedFloors &&
            fadeInactiveFloors &&
            band.floorLevel !== resolvedActiveFloorLevel
              ? INACTIVE_FLOOR_OPACITY_MULTIPLIER
              : 1
          }
        />
      ))}
      {canonicalPlan && (
        <CanonicalFloorPlanWalls3D
          model={canonicalPlan}
          rooms={rooms}
          activeRoomId={activeRoomId}
          focusRoomId={focusRoomId}
          activeFloorLevel={resolvedActiveFloorLevel}
          selectedOpeningId={selectedOpeningId}
          selectedWallId={
            selectedSurfaceTarget?.kind === "wall"
              ? selectedSurfaceTarget.id
              : null
          }
          selectedWallRoomId={
            selectedSurfaceTarget?.kind === "wall"
              ? selectedSurfaceTarget.roomId
              : null
          }
          stackedFloors={stackedFloors}
          fadeInactiveFloors={fadeInactiveFloors}
          interactive={interactive}
          onSelectWall={(wallId, roomId, event) => {
            if (!roomId) return;
            selectStructureTarget(
              { kind: "wall", roomId, id: wallId },
              event
            );
          }}
          onSelectOpening={onSelectOpening}
          onEditOpening={(openingId, metrics, mode) => {
            const sourceOpening = openings.find((opening) => opening.id === openingId);
            const sourceRoom = sourceOpening?.roomId
              ? rooms.find((room) => room.id === sourceOpening.roomId)
              : null;
            if (!sourceOpening || !sourceRoom) return;
            const centerOffsetMeters =
              sourceOpening.wall === "north" || sourceOpening.wall === "south"
                ? metrics.centerMm.xMm / 1000 - sourceRoom.x
                : metrics.centerMm.zMm / 1000 - sourceRoom.z;
            if (mode === "resize") {
              onResizeOpening?.(openingId, {
                widthMeters: metrics.widthMm / 1000,
                offsetMeters: centerOffsetMeters,
              });
            } else {
              onMoveOpening?.(openingId, centerOffsetMeters);
            }
          }}
          onOpeningDragStateChange={(dragging, mode) =>
            onOpeningDragStateChange?.(
              dragging,
              mode === "resize" ? "opening_resize" : "opening"
            )
          }
        />
      )}
      {rooms.map((room) => {
        const isActive = room.id === activeRoomId;
        const roomFloorLevel = getRoomFloorLevel(room);
        const isActiveFloor = roomFloorLevel === resolvedActiveFloorLevel;
        const inactiveFloorMultiplier =
          stackedFloors && fadeInactiveFloors && !isActiveFloor
            ? INACTIVE_FLOOR_OPACITY_MULTIPLIER
            : 1;
        const outlinePoints = getRoomOutlinePoints(room);
        const wallSegments = getWallSegments(room);
        const surfaces = room.surfaces ?? room.surfaceFinishes;
        const floorMaterial = getFloorMaterialById(surfaces?.floorMaterialId);
        const wallOpacity = clampStructureOpacity(room.surfaceOpacity?.wall) * inactiveFloorMultiplier;
        const floorOpacity = clampStructureOpacity(room.surfaceOpacity?.floor) * inactiveFloorMultiplier;
        const ceilingOpacity = clampStructureOpacity(room.surfaceOpacity?.ceiling) * inactiveFloorMultiplier;
        const ceilingSettings = getCeilingSurfaceSettings(
          surfaces,
          normalizeFloorRotationDeg,
          clampFloorPatternScale
        );
        const ceilingColor = ceilingSettings.paintColorHex ?? surfaces?.ceilingColor ?? CEILING_CAP_COLOR;
        const slabThickness = Math.max(0.01, room.slabThickness ?? FLOOR_THICKNESS_METERS);
        const roomWallThickness = Math.max(
          0.01,
          room.wallThickness ?? STRUCTURE_THICKNESS_METERS
        );
        const roomWallHeight = Math.max(0.2, room.height ?? wallHeight);
        const floorYOffset = resolveHouseRoomFloorElevationMeters(
          room,
          roomWallHeight,
          stackedFloors
        );
        const floorTarget: StructureTarget = {
          kind: "floor",
          roomId: room.id,
          id: "floor",
        };
        const ceilingTarget: StructureTarget = {
          kind: "ceiling",
          roomId: room.id,
          id: "ceiling",
        };
        const floorTargetKey = getStructureTargetKey(floorTarget) ?? "";
        const ceilingTargetKey = getStructureTargetKey(ceilingTarget) ?? "";
        const floorOutlineStyle = getStructureOutlineStyle(
          floorTargetKey,
          hoveredTargetKey,
          selectedTargetKey
        );
        const ceilingOutlineStyle = getStructureOutlineStyle(
          ceilingTargetKey,
          hoveredTargetKey,
          selectedTargetKey
        );

        return (
          <group key={room.id} position={[room.x, floorYOffset, room.z]}>
            <RoomFloorMesh
              room={room}
              material={floorMaterial}
              wallThickness={roomWallThickness}
              slabThickness={slabThickness}
              showEdgeBand={!canonicalPlan && !hasLegacyMergedSlab}
              floorWorldY={floorYOffset}
              floorOpacity={floorOpacity}
              interactive={interactive}
              floorTarget={floorTarget}
              onHoverTarget={setHoveredStructureTarget}
              onClearHoverTarget={clearHoveredTarget}
              onSelectTarget={selectStructureTarget}
            />

            {floorOutlineStyle ? (
              <Line
                points={outlinePoints.map(([x, z]) => [x, 0.035, z])}
                color={floorOutlineStyle.color}
                lineWidth={floorOutlineStyle.lineWidth}
                raycast={() => null}
              />
            ) : null}

            {stackedFloors && isActiveFloor ? (
              <Line
                points={outlinePoints.map(([x, z]) => [x, 0.055, z])}
                color={ACTIVE_FLOOR_OUTLINE_COLOR}
                lineWidth={2.2}
                raycast={() => null}
              />
            ) : null}

            {!canonicalStructureExpected && wallSegments.flatMap((segment) => {
              const endJoinOptions = legacyPhysicalWallCutEndJoinOptions(
                room,
                rooms,
                segment,
                legacyCutawaySegmentKeys
              );
              const wallFaceId = getWallSurfaceFaceId(room, segment);
              const segmentWallHeight = Math.max(
                0.2,
                room.wallHeights?.[wallFaceId] ?? roomWallHeight
              );
              const wallOpenings = getWallOpenings(room, segment, rooms, openings);
              const parts = splitWallPartsAtSharedBoundaries(
                room,
                rooms,
                segment,
                buildWallParts(segment, wallOpenings)
              );
              const lintelParts = buildOpeningLintelParts(
                segment,
                wallOpenings,
                segmentWallHeight,
                segmentWallHeight
              );
              const sillParts = buildOpeningSillParts(
                segment,
                wallOpenings,
                segmentWallHeight,
                segmentWallHeight
              );
              const thresholds = getOpeningThresholds(
                segment,
                wallOpenings,
                segmentWallHeight,
                segmentWallHeight
              );

              return [
                ...[...parts, ...lintelParts, ...sillParts].map((part) => (
                  <CutawayWallMesh
                    key={part.key}
                    room={room}
                    rooms={rooms}
                    segment={segment}
                    part={part}
                    wallHeight={segmentWallHeight}
                    wallThickness={roomWallThickness}
                    wallOpacity={wallOpacity}
                    renderBase={!hasLegacyMergedWalls}
                    renderSurfaces={!hasLegacyMergedWalls}
                    forceCutaway={legacyCutawaySegmentKeys.has(segment.key)}
                    squareStart={Boolean(endJoinOptions.squareStart)}
                    squareEnd={Boolean(endJoinOptions.squareEnd)}
                    activeRoomId={activeRoomId}
                    isActive={isActive}
                    interactive={interactive}
                    hoveredTargetKey={hoveredTargetKey}
                    selectedTargetKey={selectedTargetKey}
                    onHoverTarget={setHoveredStructureTarget}
                    onClearHoverTarget={clearHoveredTarget}
                    onSelectTarget={selectStructureTarget}
                  />
                )),
                ...thresholds.map((threshold) => {
                  const sourceOpening = openings.find(
                    (opening) => opening.id === threshold.sourceId
                  );
                  const sourceRoom = sourceOpening?.roomId
                    ? rooms.find((candidate) => candidate.id === sourceOpening.roomId)
                    : undefined;

                  return (
                    <OpeningThresholdMesh
                      key={threshold.key}
                      roomId={room.id}
                      threshold={threshold}
                      segment={segment}
                      wallThickness={roomWallThickness}
                      sourceOpening={sourceOpening}
                      sourceRoom={sourceRoom}
                      floorWorldY={floorYOffset}
                      interactive={interactive}
                      hoveredTargetKey={hoveredTargetKey}
                      selectedTargetKey={selectedTargetKey}
                      onHoverTarget={setHoveredStructureTarget}
                      onClearHoverTarget={clearHoveredTarget}
                      onSelectTarget={selectStructureTarget}
                      onMoveOpening={onMoveOpening}
                      onOpeningDragStateChange={onOpeningDragStateChange}
                    />
                  );
                }),
              ];
            })}

            <RoomCeilingCapMesh
              room={room}
              floorWorldY={floorYOffset}
              wallHeight={roomWallHeight}
              visible={room.ceilingVisible ?? true}
              opacity={ceilingOpacity}
              color={ceilingColor}
              interactive={interactive}
              ceilingTarget={ceilingTarget}
              outlineStyle={ceilingOutlineStyle}
              onHoverTarget={setHoveredStructureTarget}
              onClearHoverTarget={clearHoveredTarget}
              onSelectTarget={selectStructureTarget}
            />
          </group>
        );
      })}
    </group>
  );
}
