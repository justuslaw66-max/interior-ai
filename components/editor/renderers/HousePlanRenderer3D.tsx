"use client";

import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import {
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
  type FloorMaterial,
} from "@/lib/floor-materials";
import { resolveCutawayWallOpacity } from "@/lib/design-page-wall-cutaway";

type HousePlanRenderer3DProps = {
  rooms: HousePlanRoom2D[];
  openings?: RoomRendererOpening[];
  activeRoomId: string;
  activeFloorLevel?: number;
  wallHeight: number;
  stackedFloors?: boolean;
  fadeInactiveFloors?: boolean;
  interactive?: boolean;
  onSelectRoom?: (roomId: string) => void;
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
  offset: number;
  width: number;
  kind: RoomRendererOpening["kind"];
};

type WallPart3D = {
  key: string;
  x: number;
  z: number;
  length: number;
};

type SharedWallRange3D = {
  roomId: string;
  start: number;
  end: number;
};

type StructureTargetKind = "floor" | "wall" | "opening";

type StructureTarget = {
  kind: StructureTargetKind;
  roomId: string;
  id: string;
};

const STRUCTURE_THICKNESS_METERS = 0.025;
const CEILING_THICKNESS_METERS = STRUCTURE_THICKNESS_METERS;
const FLOOR_THICKNESS_METERS = STRUCTURE_THICKNESS_METERS;
const CEILING_CAP_COLOR = "#9c9d99";
const CEILING_EDGE_COLOR = "#f1f1ed";
const ACTIVE_WALL_COLOR = "#fbfbf7";
const INACTIVE_WALL_COLOR = "#ddddda";
const ACTIVE_WALL_OPACITY = 1;
const INACTIVE_WALL_OPACITY = 0.9;
const INACTIVE_WALL_CUTAWAY_OPACITY = 0;
const STRUCTURE_HOVER_OUTLINE_COLOR = "#00d5e8";
const STRUCTURE_SELECTED_OUTLINE_COLOR = "#2563eb";
const ACTIVE_FLOOR_OUTLINE_COLOR = "#1d4ed8";
const INACTIVE_FLOOR_OPACITY_MULTIPLIER = 0.32;

function clampStructureOpacity(value: number | undefined): number {
  return Math.max(0.05, Math.min(1, typeof value === "number" && Number.isFinite(value) ? value : 1));
}

function getFloorYOffset(room: HousePlanRoom2D, wallHeight: number, stackedFloors: boolean): number {
  if (!stackedFloors) return 0;
  const level = typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel) ? room.floorLevel : 1;
  return (level - 1) * (wallHeight + Math.max(0.08, room.slabThickness ?? FLOOR_THICKNESS_METERS) + 0.28);
}

function getRoomFloorLevel(room: HousePlanRoom2D): number {
  return typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
    ? room.floorLevel
    : 1;
}

function getFloorLabel(room: HousePlanRoom2D): string {
  const level = getRoomFloorLevel(room);
  if (room.floorLabel) return room.floorLabel;
  if (level <= 0) return `B${Math.abs(level) + 1}`;
  return `${level}F`;
}

function createFloorMaterialTexture(
  material: FloorMaterial,
  maxAnisotropy: number
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

  if (material.pattern === "tile_grid") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = material.lineColor;
    context.lineWidth = 1.2;

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

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  texture.needsUpdate = true;
  return texture;
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
  return buildShapeFromOutlinePoints(points);
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

function buildShapeFromOutlinePoints(points: Array<[number, number]>) {
  const shape = new THREE.Shape();
  const [firstX, firstZ] = points[0];
  shape.moveTo(firstX, -firstZ);

  for (const [x, z] of points.slice(1, -1)) {
    shape.lineTo(x, -z);
  }

  shape.closePath();
  return shape;
}

function buildHorizontalRoomGeometry(room: HousePlanRoom2D, edgeOffset = 0) {
  const points = edgeOffset > 0
    ? offsetRoomOutlinePoints(room, edgeOffset)
    : getRoomOutlinePoints(room);
  const geometry = new THREE.ShapeGeometry(buildShapeFromOutlinePoints(points));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildRoomEdgeBandGeometry(room: HousePlanRoom2D, height: number, edgeOffset = 0) {
  const outline = edgeOffset > 0
    ? offsetRoomOutlinePoints(room, edgeOffset)
    : getRoomOutlinePoints(room);
  const vertices: number[] = [];
  const indices: number[] = [];

  outline.slice(0, -1).forEach(([startX, startZ], index) => {
    const [endX, endZ] = outline[index + 1];
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

function getWallSpan(room: HousePlanRoom2D, wall: WallId): { start: number; end: number } {
  if (wall === "north" || wall === "south") {
    return { start: room.x - room.w / 2, end: room.x + room.w / 2 };
  }
  return { start: room.z - room.d / 2, end: room.z + room.d / 2 };
}

function getOpeningWorldOffset(room: HousePlanRoom2D, opening: RoomRendererOpening): number {
  return opening.wall === "north" || opening.wall === "south"
    ? room.x + opening.offset
    : room.z + opening.offset;
}

function wallsShareLine(
  room: HousePlanRoom2D,
  wall: WallId,
  otherRoom: HousePlanRoom2D,
  otherWall: WallId,
  tolerance = 0.04
): boolean {
  if (oppositeWall(wall) !== otherWall) return false;
  if (Math.abs(getWallCoordinate(room, wall) - getWallCoordinate(otherRoom, otherWall)) > tolerance) {
    return false;
  }

  const span = getWallSpan(room, wall);
  const otherSpan = getWallSpan(otherRoom, otherWall);
  return Math.min(span.end, otherSpan.end) - Math.max(span.start, otherSpan.start) > 0.45;
}

function getWallOpenings(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  rooms: HousePlanRoom2D[],
  openings: RoomRendererOpening[]
): WallOpening3D[] {
  if (!segment.wall) return [];

  const directOpenings = openings
    .filter((opening) => opening.roomId === room.id && opening.wall === segment.wall)
    .map((opening) => ({
      id: opening.id,
      offset: opening.offset,
      width: opening.width,
      kind: opening.kind,
    }));

  const mirroredOpenings = openings.flatMap((opening) => {
    if (!opening.roomId || opening.roomId === room.id || opening.wall !== oppositeWall(segment.wall!)) {
      return [];
    }

    const sourceRoom = rooms.find((candidate) => candidate.id === opening.roomId);
    if (!sourceRoom || !wallsShareLine(room, segment.wall!, sourceRoom, opening.wall)) {
      return [];
    }

    const offset = getOpeningWorldOffset(sourceRoom, opening) -
      (segment.axis === "x" ? room.x : room.z);

    if (Math.abs(offset) > segment.length / 2 + opening.width / 2) {
      return [];
    }

    return [
      {
        id: `${opening.id}-mirrored-${room.id}`,
        offset,
        width: opening.width,
        kind: opening.kind,
      },
    ];
  });

  return [...directOpenings, ...mirroredOpenings];
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
      parts.push({
        key: `${segment.key}-part-${index}`,
        x: segment.x + (segment.axis === "x" ? centerOffset : 0),
        z: segment.z + (segment.axis === "z" ? centerOffset : 0),
        length: partLength,
      });
    }
    cursor = Math.max(cursor, gap.end);
  });

  return parts;
}

function getOpeningThresholds(segment: WallSegment3D, openings: WallOpening3D[]): WallPart3D[] {
  if (!segment.wall) return [];
  return openings
    .filter((opening) => opening.kind === "door")
    .map((opening) => ({
      key: `${segment.key}-${opening.id}-threshold`,
      x: segment.x + (segment.axis === "x" ? opening.offset : 0),
      z: segment.z + (segment.axis === "z" ? opening.offset : 0),
      length: Math.min(segment.length, opening.width),
    }));
}

function getSharedWallOverlapRanges(
  room: HousePlanRoom2D,
  rooms: HousePlanRoom2D[],
  segment: WallSegment3D,
  minOverlap = 0.35
): SharedWallRange3D[] {
  if (!segment.wall) return [];

  const tolerance = 0.08;
  const half = segment.length / 2;
  const segmentCenter = segment.axis === "x"
    ? room.x + segment.x
    : room.z + segment.z;
  const segmentStart = segmentCenter - half;
  const segmentEnd = segmentCenter + half;
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
  rooms: HousePlanRoom2D[],
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

function shouldCutAwayActiveWallPart(
  room: HousePlanRoom2D,
  rooms: HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D,
  cameraX: number,
  cameraZ: number
): boolean {
  if (!segment.wall || isWallPartSharedWithAnotherRoom(room, rooms, segment, part)) {
    return false;
  }

  const toRoomX = room.x - cameraX;
  const toRoomZ = room.z - cameraZ;
  const roomDistance = Math.hypot(toRoomX, toRoomZ);

  if (roomDistance < 0.001) return false;

  const wallCenterX = room.x + part.x;
  const wallCenterZ = room.z + part.z;
  const toWallX = wallCenterX - cameraX;
  const toWallZ = wallCenterZ - cameraZ;
  const projectedDistance =
    (toWallX * toRoomX + toWallZ * toRoomZ) / roomDistance;

  return projectedDistance > 0.05 && projectedDistance < roomDistance - 0.05;
}

function isWallPartSharedWithAnotherRoom(
  room: HousePlanRoom2D,
  rooms: HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
): boolean {
  return getSharedWallRoomIds(room, rooms, segment, part).length > 0;
}

function getSharedWallRoomIds(
  room: HousePlanRoom2D,
  rooms: HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
): string[] {
  if (!segment.wall) return [];

  const centerOffset = segment.axis === "x"
    ? part.x - segment.x
    : part.z - segment.z;
  const partStart = centerOffset - part.length / 2;
  const partEnd = centerOffset + part.length / 2;

  return getSharedWallOverlapRanges(room, rooms, segment)
    .filter((range) => rangesOverlapBy(partStart, partEnd, range.start, range.end, 0.35))
    .map((range) => range.roomId);
}

function getSharedWallRenderOwnerRoomId(
  room: HousePlanRoom2D,
  rooms: HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D,
  activeRoomId?: string
): string {
  const sharedRoomIds = getSharedWallRoomIds(room, rooms, segment, part);
  if (!sharedRoomIds.length) return room.id;

  if (activeRoomId && (room.id === activeRoomId || sharedRoomIds.includes(activeRoomId))) {
    return activeRoomId;
  }

  return [room.id, ...sharedRoomIds].sort()[0];
}

function CutawayWallMesh({
  room,
  rooms,
  activeRoom,
  segment,
  part,
  wallHeight,
  wallThickness,
  wallOpacity,
  isActive,
  interactive,
  hoveredTargetKey,
  selectedTargetKey,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  rooms: HousePlanRoom2D[];
  activeRoom?: HousePlanRoom2D;
  segment: WallSegment3D;
  part: WallPart3D;
  wallHeight: number;
  wallThickness: number;
  wallOpacity: number;
  isActive: boolean;
  interactive: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent>) => void;
}) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const baseOpacity = (isActive ? ACTIVE_WALL_OPACITY : INACTIVE_WALL_OPACITY) * wallOpacity;
  const target: StructureTarget = {
    kind: "wall",
    roomId: room.id,
    id: part.key,
  };
  const targetKey = getStructureTargetKey(target) ?? "";
  const outlineStyle = getStructureOutlineStyle(targetKey, hoveredTargetKey, selectedTargetKey);
  const isInteriorSharedWall = isWallPartSharedWithAnotherRoom(room, rooms, segment, part);
  const sharedWallOwnerRoomId = getSharedWallRenderOwnerRoomId(
    room,
    rooms,
    segment,
    part,
    activeRoom?.id
  );
  const isDuplicateSharedWall = sharedWallOwnerRoomId !== room.id;

  useFrame(() => {
    if (isDuplicateSharedWall) return;

    const material = materialRef.current;
    if (!material) return;

    const wallCenterX = room.x + part.x;
    const wallCenterZ = room.z + part.z;
    const targetRoom = activeRoom ?? room;
    let targetOpacity = baseOpacity;

    if (isActive) {
      targetOpacity = shouldCutAwayActiveWallPart(
          room,
          rooms,
          segment,
          part,
          camera.position.x,
          camera.position.z
        )
        ? 0
        : baseOpacity;
    } else if (!isInteriorSharedWall) {
      targetOpacity = resolveCutawayWallOpacity({
          cameraX: camera.position.x,
          cameraZ: camera.position.z,
          roomX: room.x,
          roomZ: room.z,
          roomWidth: room.w,
          roomDepth: room.d,
          baseOpacity,
          cutawayEligible: true,
          targetX: targetRoom.x,
          targetZ: targetRoom.z,
          targetWidth: targetRoom.w,
          targetDepth: targetRoom.d,
          wallCenterX,
          wallCenterZ,
          wallAxis: segment.axis,
          wallLength: part.length,
          cutawayOpacity: INACTIVE_WALL_CUTAWAY_OPACITY,
        });
    }
    const nextOpacity = material.opacity + (targetOpacity - material.opacity) * 0.28;
    const shouldRender = targetOpacity > 0.01;

    if (meshRef.current) {
      meshRef.current.visible = shouldRender;
    }

    if (Math.abs(material.opacity - nextOpacity) < 0.002) {
      material.opacity = targetOpacity;
    } else {
      material.opacity = nextOpacity;
    }

    material.transparent = true;
    material.depthWrite = material.opacity > 0.34;
  });

  if (isDuplicateSharedWall) return null;

  return (
    <mesh
      ref={meshRef}
      position={[part.x, wallHeight / 2, part.z]}
      rotation-y={segment.rotationY}
      raycast={interactive ? undefined : () => null}
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
              onSelectTarget(target, event);
            }
          : undefined
      }
    >
      <boxGeometry args={[part.length, wallHeight, wallThickness]} />
      <meshStandardMaterial
        ref={materialRef}
        color={isActive ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR}
        roughness={0.86}
        metalness={0}
        transparent
        depthWrite={baseOpacity > 0.34}
        opacity={baseOpacity}
      />
      {outlineStyle ? (
        <>
          <Line
            points={[
              [-part.length / 2, -wallHeight / 2 + 0.025, wallThickness / 2 + 0.012],
              [part.length / 2, -wallHeight / 2 + 0.025, wallThickness / 2 + 0.012],
              [part.length / 2, wallHeight / 2 - 0.025, wallThickness / 2 + 0.012],
              [-part.length / 2, wallHeight / 2 - 0.025, wallThickness / 2 + 0.012],
              [-part.length / 2, -wallHeight / 2 + 0.025, wallThickness / 2 + 0.012],
            ]}
            color={outlineStyle.color}
            lineWidth={outlineStyle.lineWidth}
          />
          <Line
            points={[
              [-part.length / 2, -wallHeight / 2 + 0.025, -wallThickness / 2 - 0.012],
              [part.length / 2, -wallHeight / 2 + 0.025, -wallThickness / 2 - 0.012],
              [part.length / 2, wallHeight / 2 - 0.025, -wallThickness / 2 - 0.012],
              [-part.length / 2, wallHeight / 2 - 0.025, -wallThickness / 2 - 0.012],
              [-part.length / 2, -wallHeight / 2 + 0.025, -wallThickness / 2 - 0.012],
            ]}
            color={outlineStyle.color}
            lineWidth={outlineStyle.lineWidth}
          />
        </>
      ) : null}
    </mesh>
  );
}

function OpeningThresholdMesh({
  roomId,
  threshold,
  segment,
  wallThickness,
  interactive,
  hoveredTargetKey,
  selectedTargetKey,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  roomId: string;
  threshold: WallPart3D;
  segment: WallSegment3D;
  wallThickness: number;
  interactive: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent>) => void;
}) {
  const target: StructureTarget = {
    kind: "opening",
    roomId,
    id: threshold.key,
  };
  const targetKey = getStructureTargetKey(target) ?? "";
  const outlineStyle = getStructureOutlineStyle(targetKey, hoveredTargetKey, selectedTargetKey);
  const thresholdDepth = wallThickness * 1.35;

  return (
    <mesh
      position={[threshold.x, 0.015, threshold.z]}
      rotation-y={segment.rotationY}
      raycast={interactive ? undefined : () => null}
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
              onSelectTarget(target, event);
            }
          : undefined
      }
    >
      <boxGeometry args={[threshold.length, 0.03, thresholdDepth]} />
      <meshStandardMaterial color="#d6b88a" roughness={0.78} metalness={0} />
      {outlineStyle ? (
        <Line
          points={[
            [-threshold.length / 2, 0.024, -thresholdDepth / 2 - 0.012],
            [threshold.length / 2, 0.024, -thresholdDepth / 2 - 0.012],
            [threshold.length / 2, 0.024, thresholdDepth / 2 + 0.012],
            [-threshold.length / 2, 0.024, thresholdDepth / 2 + 0.012],
            [-threshold.length / 2, 0.024, -thresholdDepth / 2 - 0.012],
          ]}
          color={outlineStyle.color}
          lineWidth={outlineStyle.lineWidth}
        />
      ) : null}
    </mesh>
  );
}

function RoomFloorMesh({
  room,
  material,
  wallThickness,
  slabThickness,
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
  floorWorldY: number;
  floorOpacity: number;
  interactive: boolean;
  floorTarget: StructureTarget;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent>) => void;
}) {
  const { camera, gl } = useThree();
  const floorSurfaceRef = useRef<THREE.Mesh | null>(null);
  const floorBandRef = useRef<THREE.Mesh | null>(null);
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const floorScale = clampFloorPatternScale(room.surfaceFinishes?.floorScale);
  const floorRotation = THREE.MathUtils.degToRad(
    normalizeFloorRotationDeg(room.surfaceFinishes?.floorRotationDeg)
  );
  const slabEdgeOffset = wallThickness / 2;
  const floorBandGeometry = useMemo(
    () => buildRoomEdgeBandGeometry(room, slabThickness, slabEdgeOffset),
    [room, slabEdgeOffset, slabThickness]
  );
  const texture = useMemo(() => {
    const nextTexture = createFloorMaterialTexture(material, maxAnisotropy);
    if (!nextTexture) return null;

    nextTexture.repeat.set(1 / floorScale, 1 / floorScale);
    nextTexture.center.set(0.5, 0.5);
    nextTexture.rotation = floorRotation;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [material, maxAnisotropy, floorScale, floorRotation]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  useEffect(() => {
    return () => {
      floorBandGeometry.dispose();
    };
  }, [floorBandGeometry]);

  useFrame(() => {
    const floorVisible = camera.position.y > floorWorldY - slabThickness * 0.35;
    if (floorSurfaceRef.current) floorSurfaceRef.current.visible = floorVisible;
    if (floorBandRef.current) floorBandRef.current.visible = floorVisible;
  });

  return (
    <>
      <mesh
        ref={floorSurfaceRef}
        rotation-x={-Math.PI / 2}
        position={[0, 0.001, 0]}
        raycast={interactive ? undefined : () => null}
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
          color={texture ? "#ffffff" : material.renderColor}
          map={texture ?? undefined}
          roughness={0.84}
          metalness={0}
          transparent={floorOpacity < 0.999}
          opacity={floorOpacity}
          depthWrite={floorOpacity > 0.34}
        />
      </mesh>
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
    </>
  );
}

function RoomCeilingCapMesh({
  room,
  wallHeight,
  wallThickness,
  visible,
  opacity,
  color,
}: {
  room: HousePlanRoom2D;
  wallHeight: number;
  wallThickness: number;
  visible: boolean;
  opacity: number;
  color: string;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const cameraDirectionRef = useRef(new THREE.Vector3());
  const slabEdgeOffset = wallThickness / 2;
  const ceilingCapGeometry = useMemo(
    () => buildHorizontalRoomGeometry(room, slabEdgeOffset),
    [room, slabEdgeOffset]
  );
  const ceilingBandGeometry = useMemo(
    () => buildRoomEdgeBandGeometry(room, CEILING_THICKNESS_METERS, slabEdgeOffset),
    [room, slabEdgeOffset]
  );

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (!visible) {
      group.visible = false;
      return;
    }

    camera.getWorldDirection(cameraDirectionRef.current);
    const isLowEnoughForUnderside =
      camera.position.y < wallHeight + CEILING_THICKNESS_METERS + 0.35;
    const isLookingIntoRoom = cameraDirectionRef.current.y > -0.02;
    group.visible = isLowEnoughForUnderside && isLookingIntoRoom;
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
        geometry={ceilingCapGeometry}
        raycast={() => null}
        renderOrder={1}
      >
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          transparent={opacity < 0.999}
          side={THREE.DoubleSide}
        />
      </mesh>
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
  activeFloorLevel,
  wallHeight,
  stackedFloors = false,
  fadeInactiveFloors = false,
  interactive = false,
  onSelectRoom,
}: HousePlanRenderer3DProps) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const resolvedActiveFloorLevel =
    typeof activeFloorLevel === "number" && Number.isFinite(activeFloorLevel)
      ? activeFloorLevel
      : activeRoom
        ? getRoomFloorLevel(activeRoom)
        : 1;
  const activeFloorBounds = useMemo(() => {
    const activeFloorRooms = rooms.filter(
      (room) => getRoomFloorLevel(room) === resolvedActiveFloorLevel
    );
    if (!activeFloorRooms.length) return null;

    return activeFloorRooms.reduce(
      (bounds, room) => ({
        minX: Math.min(bounds.minX, room.x - room.w / 2),
        maxX: Math.max(bounds.maxX, room.x + room.w / 2),
        minZ: Math.min(bounds.minZ, room.z - room.d / 2),
        maxZ: Math.max(bounds.maxZ, room.z + room.d / 2),
        label: room.floorLabel ?? bounds.label,
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity,
        label: activeFloorRooms[0] ? getFloorLabel(activeFloorRooms[0]) : "1F",
      }
    );
  }, [resolvedActiveFloorLevel, rooms]);
  const [hoveredStructureTarget, setHoveredStructureTarget] = useState<StructureTarget | null>(null);
  const [selectedStructureTarget, setSelectedStructureTarget] = useState<StructureTarget | null>(null);
  const hoveredTargetKey = getStructureTargetKey(hoveredStructureTarget);
  const selectedTargetKey = getStructureTargetKey(
    selectedStructureTarget?.roomId === activeRoomId ? selectedStructureTarget : null
  );

  const clearHoveredTarget = (target: StructureTarget) => {
    setHoveredStructureTarget((previous) =>
      isSameStructureTarget(previous, target) ? null : previous
    );
  };

  const selectStructureTarget = (
    target: StructureTarget,
    event: ThreeEvent<MouseEvent>
  ) => {
    if (!interactive) return;
    event.stopPropagation();
    setSelectedStructureTarget(target);
    onSelectRoom?.(target.roomId);
  };

  return (
    <group>
      {stackedFloors && activeFloorBounds ? (
        <Html
          zIndexRange={[7, 0]}
          position={[
            activeFloorBounds.maxX + 0.45,
            (resolvedActiveFloorLevel - 1) *
              (wallHeight + Math.max(0.08, FLOOR_THICKNESS_METERS) + 0.28) +
              wallHeight * 0.5,
            activeFloorBounds.minZ,
          ]}
          center
          transform={false}
        >
          <div className="rounded border border-blue-200 bg-white/90 px-2 py-1 text-[11px] font-semibold text-blue-700 shadow-sm">
            {activeFloorBounds.label}
          </div>
        </Html>
      ) : null}
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
        const floorMaterial = getFloorMaterialById(room.surfaceFinishes?.floorMaterialId);
        const wallOpacity = clampStructureOpacity(room.surfaceOpacity?.wall) * inactiveFloorMultiplier;
        const floorOpacity = clampStructureOpacity(room.surfaceOpacity?.floor) * inactiveFloorMultiplier;
        const ceilingOpacity = clampStructureOpacity(room.surfaceOpacity?.ceiling) * inactiveFloorMultiplier;
        const ceilingColor = room.surfaceFinishes?.ceilingColor ?? CEILING_CAP_COLOR;
        const slabThickness = Math.max(0.01, room.slabThickness ?? FLOOR_THICKNESS_METERS);
        const floorYOffset = getFloorYOffset(room, wallHeight, stackedFloors);
        const floorTarget: StructureTarget = {
          kind: "floor",
          roomId: room.id,
          id: "floor",
        };
        const floorTargetKey = getStructureTargetKey(floorTarget) ?? "";
        const floorOutlineStyle = getStructureOutlineStyle(
          floorTargetKey,
          hoveredTargetKey,
          selectedTargetKey
        );

        return (
          <group key={room.id} position={[room.x, floorYOffset, room.z]}>
            <RoomFloorMesh
              room={room}
              material={floorMaterial}
              wallThickness={STRUCTURE_THICKNESS_METERS}
              slabThickness={slabThickness}
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
              />
            ) : null}

            {stackedFloors && isActiveFloor ? (
              <Line
                points={outlinePoints.map(([x, z]) => [x, 0.055, z])}
                color={ACTIVE_FLOOR_OUTLINE_COLOR}
                lineWidth={2.2}
              />
            ) : null}

            {wallSegments.flatMap((segment) => {
              const wallOpenings = getWallOpenings(room, segment, rooms, openings);
              const parts = splitWallPartsAtSharedBoundaries(
                room,
                rooms,
                segment,
                buildWallParts(segment, wallOpenings)
              );
              const thresholds = getOpeningThresholds(segment, wallOpenings);

              return [
                ...parts.map((part) => (
                  <CutawayWallMesh
                    key={part.key}
                    room={room}
                    rooms={rooms}
                    activeRoom={activeRoom}
                    segment={segment}
                    part={part}
                    wallHeight={wallHeight}
                    wallThickness={STRUCTURE_THICKNESS_METERS}
                    wallOpacity={wallOpacity}
                    isActive={isActive}
                    interactive={interactive}
                    hoveredTargetKey={hoveredTargetKey}
                    selectedTargetKey={selectedTargetKey}
                    onHoverTarget={setHoveredStructureTarget}
                    onClearHoverTarget={clearHoveredTarget}
                    onSelectTarget={selectStructureTarget}
                  />
                )),
                ...thresholds.map((threshold) => (
                  <OpeningThresholdMesh
                    key={threshold.key}
                    roomId={room.id}
                    threshold={threshold}
                    segment={segment}
                    wallThickness={STRUCTURE_THICKNESS_METERS}
                    interactive={interactive}
                    hoveredTargetKey={hoveredTargetKey}
                    selectedTargetKey={selectedTargetKey}
                    onHoverTarget={setHoveredStructureTarget}
                    onClearHoverTarget={clearHoveredTarget}
                    onSelectTarget={selectStructureTarget}
                  />
                )),
              ];
            })}

            <RoomCeilingCapMesh
              room={room}
              wallHeight={wallHeight}
              wallThickness={STRUCTURE_THICKNESS_METERS}
              visible={room.ceilingVisible ?? true}
              opacity={ceilingOpacity}
              color={ceilingColor}
            />

            <Html
              zIndexRange={[5, 0]}
              position={[0, wallHeight + CEILING_THICKNESS_METERS + 0.1, 0]}
              center
              transform={false}
            >
              <button
                type="button"
                data-testid="house-room-3d-label"
                onClick={(event) => {
                  if (!interactive) return;
                  event.stopPropagation();
                  setSelectedStructureTarget({
                    kind: "floor",
                    roomId: room.id,
                    id: "floor",
                  });
                  onSelectRoom?.(room.id);
                }}
                className={`rounded border px-2 py-1 text-[11px] font-semibold shadow-sm ${
                  isActive
                    ? "border-green-200 bg-white text-green-800"
                    : isActiveFloor
                      ? "border-blue-200 bg-white/80 text-blue-700"
                      : "border-neutral-200 bg-white/60 text-neutral-500"
                }`}
              >
                {room.name}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
