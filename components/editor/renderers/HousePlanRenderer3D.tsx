"use client";

import { Edges, Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import { resolveCutawayWallOpacity } from "@/lib/design-page-wall-cutaway";

type HousePlanRenderer3DProps = {
  rooms: HousePlanRoom2D[];
  openings?: RoomRendererOpening[];
  activeRoomId: string;
  wallThickness: number;
  wallHeight: number;
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

const CEILING_THICKNESS_METERS = 0.1;
const ACTIVE_WALL_COLOR = "#fbfbf7";
const INACTIVE_WALL_COLOR = "#ddddda";
const ACTIVE_WALL_OPACITY = 1;
const INACTIVE_WALL_OPACITY = 0.9;
const INACTIVE_WALL_CUTAWAY_OPACITY = 0;
const ACTIVE_WALL_EDGE_COLOR = "#d7d7d2";
const INACTIVE_WALL_EDGE_COLOR = "#a4a7a3";
const ACTIVE_ROOM_OUTLINE_COLOR = "#22c55e";
const INACTIVE_ROOM_OUTLINE_COLOR = "#4b5563";

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
  const shape = new THREE.Shape();
  const [firstX, firstZ] = points[0];
  shape.moveTo(firstX, -firstZ);

  for (const [x, z] of points.slice(1, -1)) {
    shape.lineTo(x, -z);
  }

  shape.closePath();
  return shape;
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
  if (!segment.wall) return false;

  const tolerance = 0.08;
  const worldX = room.x + part.x;
  const worldZ = room.z + part.z;
  const wallPartStart = segment.axis === "x"
    ? worldX - part.length / 2
    : worldZ - part.length / 2;
  const wallPartEnd = segment.axis === "x"
    ? worldX + part.length / 2
    : worldZ + part.length / 2;
  const roomLeft = room.x - room.w / 2;
  const roomRight = room.x + room.w / 2;
  const roomNorth = room.z - room.d / 2;
  const roomSouth = room.z + room.d / 2;

  return rooms.some((otherRoom) => {
    if (otherRoom.id === room.id) return false;
    const otherLeft = otherRoom.x - otherRoom.w / 2;
    const otherRight = otherRoom.x + otherRoom.w / 2;
    const otherNorth = otherRoom.z - otherRoom.d / 2;
    const otherSouth = otherRoom.z + otherRoom.d / 2;

    if (segment.wall === "east") {
      if (Math.abs(roomRight - otherLeft) > tolerance) return false;
      return rangesOverlapBy(wallPartStart, wallPartEnd, otherNorth, otherSouth, 0.35);
    }

    if (segment.wall === "west") {
      if (Math.abs(roomLeft - otherRight) > tolerance) return false;
      return rangesOverlapBy(wallPartStart, wallPartEnd, otherNorth, otherSouth, 0.35);
    }

    if (segment.wall === "north") {
      if (Math.abs(roomNorth - otherSouth) > tolerance) return false;
      return rangesOverlapBy(wallPartStart, wallPartEnd, otherLeft, otherRight, 0.35);
    }

    if (Math.abs(roomSouth - otherNorth) > tolerance) return false;
    return rangesOverlapBy(wallPartStart, wallPartEnd, otherLeft, otherRight, 0.35);
  });
}

function CutawayWallMesh({
  room,
  rooms,
  activeRoom,
  segment,
  part,
  wallHeight,
  wallThickness,
  isActive,
}: {
  room: HousePlanRoom2D;
  rooms: HousePlanRoom2D[];
  activeRoom?: HousePlanRoom2D;
  segment: WallSegment3D;
  part: WallPart3D;
  wallHeight: number;
  wallThickness: number;
  isActive: boolean;
}) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const baseOpacity = isActive ? ACTIVE_WALL_OPACITY : INACTIVE_WALL_OPACITY;
  const isInteriorSharedWall = isWallPartSharedWithAnotherRoom(room, rooms, segment, part);
  const isDuplicateOfActiveSharedWall = Boolean(
    activeRoom &&
      !isActive &&
      isWallPartSharedWithAnotherRoom(room, [room, activeRoom], segment, part)
  );

  useFrame(() => {
    if (isDuplicateOfActiveSharedWall) return;

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
          wall: segment.wall,
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

  if (isDuplicateOfActiveSharedWall) return null;

  return (
    <mesh
      ref={meshRef}
      position={[part.x, wallHeight / 2, part.z]}
      rotation-y={segment.rotationY}
      raycast={() => null}
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
      <Edges
        threshold={15}
        color={isActive ? ACTIVE_WALL_EDGE_COLOR : INACTIVE_WALL_EDGE_COLOR}
        lineWidth={isActive ? 1.05 : 0.9}
      />
    </mesh>
  );
}

function CeilingSlabMesh({
  room,
  isActive,
  wallHeight,
}: {
  room: HousePlanRoom2D;
  isActive: boolean;
  wallHeight: number;
}) {
  const { camera } = useThree();
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const baseOpacity = isActive ? 0.24 : 0.38;
  const hiddenOpacity = isActive ? 0.04 : 0.1;

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    const isCameraUnderCeiling = camera.position.y < wallHeight + CEILING_THICKNESS_METERS + 0.25;
    const targetOpacity = isCameraUnderCeiling ? hiddenOpacity : baseOpacity;
    const nextOpacity = material.opacity + (targetOpacity - material.opacity) * 0.2;

    material.opacity = Math.abs(material.opacity - nextOpacity) < 0.002
      ? targetOpacity
      : nextOpacity;
  });

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, wallHeight + 0.012, 0]}
      raycast={() => null}
    >
      <extrudeGeometry
        args={[
          buildRoomShapeGeometry(room),
          {
            depth: CEILING_THICKNESS_METERS,
            bevelEnabled: false,
          },
        ]}
      />
      <meshStandardMaterial
        ref={materialRef}
        color={isActive ? "#f7f7f2" : "#eeeeea"}
        roughness={0.94}
        metalness={0}
        transparent
        opacity={baseOpacity}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function HousePlanRenderer3D({
  rooms,
  openings = [],
  activeRoomId,
  wallThickness,
  wallHeight,
  interactive = false,
  onSelectRoom,
}: HousePlanRenderer3DProps) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);

  return (
    <group data-testid="house-plan-3d">
      {rooms.map((room) => {
        const isActive = room.id === activeRoomId;
        const outlinePoints = getRoomOutlinePoints(room);
        const wallSegments = getWallSegments(room);

        return (
          <group key={room.id} position={[room.x, 0, room.z]}>
            <mesh
              rotation-x={-Math.PI / 2}
              position={[0, 0.001, 0]}
              onClick={(event) => {
                if (!interactive) return;
                event.stopPropagation();
                onSelectRoom?.(room.id);
              }}
            >
              <shapeGeometry args={[buildRoomShapeGeometry(room)]} />
              <meshStandardMaterial
                color={isActive ? "#efe3d0" : "#f4f0e8"}
                roughness={0.82}
                metalness={0}
              />
            </mesh>

            {wallSegments.flatMap((segment) => {
              const wallOpenings = getWallOpenings(room, segment, rooms, openings);
              const parts = buildWallParts(segment, wallOpenings);
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
                    wallThickness={wallThickness}
                    isActive={isActive}
                  />
                )),
                ...thresholds.map((threshold) => (
                  <mesh
                    key={threshold.key}
                    position={[threshold.x, 0.015, threshold.z]}
                    rotation-y={segment.rotationY}
                  >
                    <boxGeometry args={[threshold.length, 0.03, wallThickness * 1.35]} />
                    <meshStandardMaterial color="#d6b88a" roughness={0.78} metalness={0} />
                  </mesh>
                )),
              ];
            })}

            <CeilingSlabMesh
              room={room}
              isActive={isActive}
              wallHeight={wallHeight}
            />

            <Line
              points={outlinePoints.map(([x, z]) => [
                x,
                wallHeight + CEILING_THICKNESS_METERS + 0.015,
                z,
              ])}
              color={isActive ? ACTIVE_ROOM_OUTLINE_COLOR : INACTIVE_ROOM_OUTLINE_COLOR}
              lineWidth={isActive ? 3 : 2.15}
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
                  onSelectRoom?.(room.id);
                }}
                className={`rounded border px-2 py-1 text-[11px] font-semibold shadow-sm ${
                  isActive
                    ? "border-green-200 bg-white text-green-800"
                    : "border-neutral-200 bg-white/80 text-neutral-600"
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
