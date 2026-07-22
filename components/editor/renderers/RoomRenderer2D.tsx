"use client";

import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import type { FloorPlanDrawRoomMode, FloorPlanPoint } from "@/lib/floor-plan-types";
import type { RoomSurfaceFinishes, RoomType } from "@/lib/room-types";
import {
  isClosingWallDrawPoint,
  resolveOpeningPlacementFromPoint,
  resolveArcWallDrawPreview,
  resolveRoomDrawPreview,
  snapFloorPlanPointForWallDraw,
  type ArcWallDrawPreview,
  type RoomDrawPreview,
  type TracedOpeningPreview,
} from "@/lib/floor-plan-tracing";
import {
  buildHouseRoomAdjacencyGuides,
  buildHouseRoomDoorwaySuggestions,
  HOUSE_ROOM_WALL_SNAP_DISTANCE_METERS,
  ROOM_DIMENSION_DEFAULTS,
  resolveHouseRoomMove,
  type HouseRoomDoorwaySuggestion,
  type HouseRoomSnapPreview,
} from "@/lib/design-page-house-plan";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { getWallFaceSurfaceSettings, normalizeFloorSurfaceSettings } from "@/lib/surface-settings";
import { useSurfaceMaterialTexture } from "./useSurfaceMaterialTexture";
import {
  buildInnerFloorGeometry2D,
  buildWallBandCornerCaps2D,
  buildRoomWallSegments2D,
  buildWallBandGeometry2D,
  mergeSharedWallSegments2D,
  splitWallBandByOpenings2D,
} from "@/lib/room-renderer-2d-walls";
import { EDITOR_GEOMETRY_TOLERANCES } from "@/lib/editor-geometry-tolerances";
import type { Plan2DViewOrientation } from "@/components/editor/camera/EditorCamera2D";
import {
  CanonicalFloorPlanWalls2D,
  type CanonicalOpeningDragMetricsV2,
} from "./CanonicalFloorPlanStructure";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { buildRoomPlanShape } from "@/lib/room-plan-shape";

type RectZone = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label: string;
};

type Opening2D = {
  id: string;
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  offset: number;
  width: number;
  height?: number;
  kind: "door" | "window";
  doorStyle?: "swing" | "sliding" | "folding" | "open";
};

type OpeningSegment2D = {
  id: string;
  kind: Opening2D["kind"];
  doorStyle?: NonNullable<Opening2D["doorStyle"]>;
  wall: Opening2D["wall"];
  points: [[number, number, number], [number, number, number]];
};

type OpeningRenderSegment2D = OpeningSegment2D & {
  offset: number;
  width: number;
  center: [number, number, number];
  hitSize: [number, number];
  labelPosition: [number, number, number];
};

function buildOpeningSymbolLines(
  segment: OpeningSegment2D
): Array<Array<[number, number, number]>> {
  const [start, end] = segment.points;
  if (segment.kind !== "door" || !segment.doorStyle || segment.doorStyle === "swing") {
    return [[start, end]];
  }
  if (segment.doorStyle === "open") return [];

  const horizontal = segment.wall === "north" || segment.wall === "south";
  const alongX = end[0] - start[0];
  const alongZ = end[2] - start[2];
  const perpendicularX = horizontal ? 0 : 0.055;
  const perpendicularZ = horizontal ? 0.055 : 0;
  if (segment.doorStyle === "sliding") {
    const firstEnd: [number, number, number] = [
      start[0] + alongX * 0.58,
      start[1],
      start[2] + alongZ * 0.58,
    ];
    const secondStart: [number, number, number] = [
      start[0] + alongX * 0.42 + perpendicularX,
      start[1],
      start[2] + alongZ * 0.42 + perpendicularZ,
    ];
    const secondEnd: [number, number, number] = [
      end[0] + perpendicularX,
      end[1],
      end[2] + perpendicularZ,
    ];
    return [[start, firstEnd], [secondStart, secondEnd]];
  }

  const foldPoints = Array.from({ length: 5 }, (_, index): [number, number, number] => {
    const ratio = index / 4;
    const fold = index === 0 || index === 4 ? 0 : index % 2 === 0 ? -0.07 : 0.07;
    return [
      start[0] + alongX * ratio + (horizontal ? 0 : fold),
      start[1],
      start[2] + alongZ * ratio + (horizontal ? fold : 0),
    ];
  });
  return [foldPoints];
}

function openingDisplayName(segment: OpeningSegment2D) {
  if (segment.kind !== "door") return "Window";
  if (segment.doorStyle === "open") return "Opening";
  if (segment.doorStyle === "sliding") return "Sliding door";
  if (segment.doorStyle === "folding") return "Folding door";
  return "Door";
}

type FixedElement2D = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label?: string;
  kind?: "kitchen_counter" | "island" | "wardrobe" | "window" | "door" | "reference_zone";
  locked?: boolean;
};

type Annotation2D = {
  id: string;
  x: number;
  z: number;
  text: string;
  kind: "note" | "callout" | "room_tag";
  anchorX?: number;
  anchorZ?: number;
};

type HouseRoom2D = {
  id: string;
  name: string;
  roomType: RoomType;
  shape: "rectangle" | "l_shape" | "custom_polygon";
  polygon?: Array<{ x: number; z: number }>;
  holes?: Array<Array<{ x: number; z: number }>>;
  surfaces?: RoomSurfaceFinishes;
  surfaceFinishes?: RoomSurfaceFinishes;
  x: number;
  z: number;
  w: number;
  d: number;
  wallThickness?: number;
};

type RoomResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";
type CameraNavigationHandle = "camera" | "target";
type PlanOverlayDragKind = "opening" | "opening_resize" | "fixed" | "annotation";
type RoomDragStatus = "free" | "snapped" | "blocked";

type CameraNavigation2D = {
  enabled: boolean;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  onMoveCamera: (x: number, z: number) => void;
  onMoveTarget: (x: number, z: number) => void;
};

function getHouseRoomFloorPlanColor(
  room: HouseRoom2D,
  isActiveRoom: boolean,
  isPro: boolean
): string {
  if (isPro) return isActiveRoom ? "#ffffff" : "#fafafa";
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const material = getFloorMaterialById(surfaces?.floorMaterialId);
  return isActiveRoom ? material.planColor : material.planMutedColor;
}

function getSurfaceMaterialPlanColor(materialId: string | null | undefined, fallback: string): string {
  const material = getRuntimeSurfaceMaterialById(materialId);
  if (!material) return fallback;
  const colorFamily = material.classification?.color_family ?? "";
  if (colorFamily.includes("grey") || colorFamily.includes("gray")) return "#b9b8b3";
  if (colorFamily.includes("walnut") || colorFamily.includes("brown")) return "#9b7659";
  if (colorFamily.includes("oak") || colorFamily.includes("maple") || colorFamily.includes("wood")) return "#c6a77b";
  if (colorFamily.includes("white") || colorFamily.includes("ivory")) return "#eeeae0";
  if (colorFamily.includes("beige") || colorFamily.includes("cream")) return "#d8ccb8";
  if (colorFamily.includes("black") || colorFamily.includes("anthracite")) return "#6f6f70";
  return "#c5beb0";
}

function getHouseRoomWallPlanColor(room: HouseRoom2D, wall: Opening2D["wall"], isPro: boolean): string {
  const fallback = isPro ? "#d4d4d8" : "#c9c2b4";
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const settings = getWallFaceSurfaceSettings(
    surfaces,
    wall,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  if (settings.paintColorHex) return settings.paintColorHex;
  return getSurfaceMaterialPlanColor(settings.materialId, fallback);
}

function HouseRoomFloorFill2D({
  room,
  fillColor,
  dragStatus,
  isDraggingRoom,
  fillOpacity,
  interactive,
  onSelectRoom,
  onSelectSurfaceTarget,
}: {
  room: HouseRoom2D;
  fillColor: string;
  dragStatus: "blocked" | "snapped" | "free" | null;
  isDraggingRoom: boolean;
  fillOpacity: number;
  interactive: boolean;
  onSelectRoom?: (
    roomId: string,
    options?: { additive?: boolean }
  ) => void;
  onSelectSurfaceTarget?: (target: { kind: "floor" | "wall"; roomId: string; id: string }) => void;
}) {
  const { gl } = useThree();
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const surfaceMaterial = getRuntimeSurfaceMaterialById(surfaces?.floorMaterialId);
  const floorSettings = normalizeFloorSurfaceSettings(
    surfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const floorRotation = THREE.MathUtils.degToRad(floorSettings.floorRotationDeg);
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
    maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
  });
  const canShowTexture = Boolean(surfaceTexture && dragStatus !== "blocked");

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0.0007, 0]}
      raycast={interactive ? undefined : () => null}
      onPointerDown={
        interactive
          ? (event) => {
              event.stopPropagation();
            }
          : undefined
      }
      onClick={
        interactive
          ? (event) => {
              event.stopPropagation();
              const additive =
                event.nativeEvent.shiftKey ||
                event.nativeEvent.metaKey ||
                event.nativeEvent.ctrlKey;
              if (additive) {
                onSelectRoom?.(room.id, { additive: true });
              } else if (onSelectSurfaceTarget) {
                onSelectSurfaceTarget({ kind: "floor", roomId: room.id, id: "floor" });
              } else {
                onSelectRoom?.(room.id);
              }
            }
          : undefined
      }
    >
      <shapeGeometry args={[buildInnerFloorShapeGeometry(room)]} />
      <meshBasicMaterial
        color={canShowTexture ? "#ffffff" : dragStatus === "blocked" ? "#fed7aa" : fillColor}
        map={canShowTexture ? surfaceTexture ?? undefined : undefined}
        transparent={isDraggingRoom}
        opacity={fillOpacity}
      />
    </mesh>
  );
}

function HouseRoomComparisonOverlay2D({
  room,
  active,
}: {
  room: HouseRoom2D;
  active: boolean;
}) {
  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.0035, 0]}
        raycast={() => null}
        renderOrder={17}
      >
        <shapeGeometry args={[buildRoomShapeGeometry(room)]} />
        <meshBasicMaterial
          color="#10b981"
          transparent
          opacity={active ? 0.13 : 0.17}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={getRoomOutlinePoints(room).map(([x, z]) => [x, 0.021, z])}
        color={active ? "#047857" : "#10b981"}
        lineWidth={active ? 4.8 : 4.2}
        depthTest={false}
        renderOrder={18}
      />
    </>
  );
}

const DRAW_WORKSPACE_MIN_SIZE_METERS = 60;
const DRAW_WORKSPACE_PADDING_METERS = 20;
const DRAW_SNAP_VISUAL_EPSILON_METERS =
  EDITOR_GEOMETRY_TOLERANCES.drawSnapMeters;

type RoomDrawGuideLine = {
  id: string;
  points: Array<[number, number, number]>;
  emphasis?: "soft" | "strong";
};

type WallDrawAlignmentCue = {
  id: string;
  point: FloorPlanPoint;
  label: string;
};

type RoomDrawSnapMarker = {
  id: string;
  point: FloorPlanPoint;
  label: "Corner" | "Wall edge" | "Shared wall" | "Close room";
  displayLabel?: string;
  subtle?: boolean;
};

type RoomDrawPointSnapLabel = Exclude<RoomDrawSnapMarker["label"], "Shared wall" | "Close room">;

type SharedWallPreviewSegment = {
  id: string;
  points: [[number, number, number], [number, number, number]];
  labelPosition: FloorPlanPoint;
  lengthMeters: number;
};

type OpeningPreviewWallGuide = {
  points: [[number, number, number], [number, number, number]];
  labelPosition: FloorPlanPoint;
  label: string;
};

type RoomRenderer2DProps = {
  width: number;
  depth: number;
  measurementUnit?: "mm" | "cm" | "in";
  showGrid?: boolean;
  showDimensions?: boolean;
  showLabels?: boolean;
  showOpenings?: boolean;
  showBuiltIns?: boolean;
  showAnnotations?: boolean;
  showZones?: boolean;
  theme?: "consumer" | "pro";
  planViewOrientation?: Plan2DViewOrientation;
  gridStep?: number;
  openings?: Opening2D[];
  fixedElements?: FixedElement2D[];
  annotations?: Annotation2D[];
  zones?: RectZone[];
  rooms?: HouseRoom2D[];
  activeFloorId?: string | null;
  activeFloorLevel: number;
  activeRoomId?: string | null;
  selectedRoomIds?: readonly string[];
  onSelectRoom?: (
    roomId: string,
    options?: { additive?: boolean }
  ) => void;
  onSelectSurfaceTarget?: (target: { kind: "floor" | "wall"; roomId: string; id: string }) => void;
  onClearRoomSelection?: () => void;
  onRenameRoom?: (roomId: string) => void;
  onDuplicateRoom?: (roomId: string) => void;
  onDeleteRoom?: (roomId: string) => void;
  onEditFloor?: (roomId: string) => void;
  onFitRoom?: (roomId: string) => void;
  onMoveRoom?: (roomId: string, x: number, z: number, options?: { snap?: boolean }) => void;
  onResizeRoom?: (roomId: string, next: { x: number; z: number; w: number; d: number }) => void;
  onRoomDragStateChange?: (isDragging: boolean) => void;
  onRoomResizeStateChange?: (isResizing: boolean) => void;
  interactive?: boolean;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onDeleteOverlay?: (id: string) => void;
  onMoveOpening?: (id: string, offset: number) => void;
  onResizeOpening?: (
    id: string,
    metrics: { widthMeters: number; offsetMeters: number }
  ) => void;
  onMoveFixedElement?: (id: string, x: number, z: number) => void;
  onMoveAnnotation?: (id: string, x: number, z: number) => void;
  onOverlayDragStateChange?: (
    isDragging: boolean,
    kind?: PlanOverlayDragKind
  ) => void;
  onAddDoorwaySuggestion?: (suggestion: HouseRoomDoorwaySuggestion) => void;
  suppressedDoorwaySuggestionKeys?: string[];
  onCommitRoomDimensionEdit?: (
    roomId: string,
    axis: "width" | "depth",
    valueMeters: number
  ) => void;
  onCommitWallDrawSegmentLength?: (segmentIndex: number, valueMeters: number) => void;
  drawRoomMode?: boolean;
  drawRoomPoints?: FloorPlanPoint[];
  drawRoomPreviewPoint?: FloorPlanPoint | null;
  onDrawRoomPoint?: (point: FloorPlanPoint) => void;
  onDrawRoomPreviewPoint?: (point: FloorPlanPoint | null) => void;
  onDrawRoomDrag?: (start: FloorPlanPoint, end: FloorPlanPoint) => void;
  drawRoomInteractionMode?: FloorPlanDrawRoomMode;
  traceOpeningMode?: boolean;
  traceOpeningKind?: Opening2D["kind"];
  onTraceOpeningPoint?: (point: FloorPlanPoint) => void;
  cameraNavigation?: CameraNavigation2D;
  onPlanDebugMetricsChange?: (metrics: { zoom: number; visibleLabelCount: number }) => void;
  canonicalPlan?: CanonicalFloorPlanRenderModel | null;
  canonicalStructureExpected?: boolean;
};

const getRoomOutlinePoints = (room: HouseRoom2D): Array<[number, number]> => {
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
};

const getRoomHoleOutlinePoints = (room: HouseRoom2D): Array<Array<[number, number]>> =>
  (room.holes ?? [])
    .filter((hole) => hole.length >= 3)
    .map((hole) => {
      const points = hole.map((point): [number, number] => [point.x, point.z]);
      return [...points, points[0]];
    });

const buildRoomShapeGeometry = (room: HouseRoom2D) =>
  buildRoomPlanShape(getRoomOutlinePoints(room), getRoomHoleOutlinePoints(room));

const buildInnerFloorShapeGeometry = (room: HouseRoom2D) =>
  buildRoomPlanShape(buildInnerFloorGeometry2D(room), getRoomHoleOutlinePoints(room));

function buildRectangleLinePoints(points: FloorPlanPoint[]): Array<[number, number, number]> {
  if (points.length !== 2) return [];
  const [first, second] = points;
  return [
    [first.x, 0.006, first.z],
    [second.x, 0.006, first.z],
    [second.x, 0.006, second.z],
    [first.x, 0.006, second.z],
    [first.x, 0.006, first.z],
  ];
}

function buildArcWallLinePoints(
  preview: ArcWallDrawPreview
): Array<[number, number, number]> {
  if (preview.outline.length < 3) return [];
  return [...preview.outline, preview.outline[0]].map((point) => [point.x, 0.009, point.z]);
}

function buildWallDrawLinePoints(
  points: FloorPlanPoint[],
  previewPoint: FloorPlanPoint | null
): Array<[number, number, number]> {
  const visiblePoints =
    previewPoint && points.length > 0 ? [...points, previewPoint] : points;
  return visiblePoints.map((point) => [point.x, 0.009, point.z]);
}

function buildWallDrawGuideLines(
  previousPoint: FloorPlanPoint | null,
  previewPoint: FloorPlanPoint | null,
  rooms: HouseRoom2D[],
  width: number,
  depth: number
): RoomDrawGuideLine[] {
  if (!previousPoint || !previewPoint) return [];
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const guides: RoomDrawGuideLine[] = [];

  const addVerticalGuide = (id: string, x: number, y: number) => {
    guides.push({
      id,
      points: [
        [x, y, -halfDepth],
        [x, y, halfDepth],
      ],
    });
  };
  const addHorizontalGuide = (id: string, z: number, y: number) => {
    guides.push({
      id,
      points: [
        [-halfWidth, y, z],
        [halfWidth, y, z],
      ],
    });
  };

  const previewAlignment = getRoomDrawPointAlignment(previewPoint, rooms);
  const previousAlignment = getRoomDrawPointAlignment(previousPoint, rooms);
  if (previewAlignment.alignsX || Math.abs(previewPoint.x - previousPoint.x) <= DRAW_SNAP_VISUAL_EPSILON_METERS) {
    addVerticalGuide("wall-guide-x", previewPoint.x, 0.0085);
  }
  if (previewAlignment.alignsZ || Math.abs(previewPoint.z - previousPoint.z) <= DRAW_SNAP_VISUAL_EPSILON_METERS) {
    addHorizontalGuide("wall-guide-z", previewPoint.z, 0.0085);
  }
  if (previousAlignment.alignsX) {
    addVerticalGuide("wall-guide-previous-x", previousPoint.x, 0.008);
  }
  if (previousAlignment.alignsZ) {
    addHorizontalGuide("wall-guide-previous-z", previousPoint.z, 0.008);
  }

  return guides;
}

function buildWallDrawAlignmentCue(
  previousPoint: FloorPlanPoint | null,
  previewPoint: FloorPlanPoint | null,
  rooms: HouseRoom2D[]
): WallDrawAlignmentCue | null {
  if (!previousPoint || !previewPoint) return null;
  if (isClosingWallDrawPoint(previewPoint, previousPoint, 3)) return null;

  const alignment = getRoomDrawPointAlignment(previewPoint, rooms);
  const sameX = Math.abs(previewPoint.x - previousPoint.x) <= DRAW_SNAP_VISUAL_EPSILON_METERS;
  const sameZ = Math.abs(previewPoint.z - previousPoint.z) <= DRAW_SNAP_VISUAL_EPSILON_METERS;

  if (alignment.label === "Corner") {
    return {
      id: "wall-align-corner",
      point: previewPoint,
      label: "Corner locked",
    };
  }

  if (alignment.label === "Wall edge") {
    return {
      id: "wall-align-edge",
      point: previewPoint,
      label: "Wall edge locked",
    };
  }

  if (sameX) {
    return {
      id: "wall-align-vertical",
      point: previewPoint,
      label: "Vertical alignment",
    };
  }

  if (sameZ) {
    return {
      id: "wall-align-horizontal",
      point: previewPoint,
      label: "Horizontal alignment",
    };
  }

  return null;
}

function buildWallDrawContinuationCue(
  point: FloorPlanPoint | null,
  rooms: HouseRoom2D[]
): WallDrawAlignmentCue | null {
  if (!point) return null;

  const alignment = getRoomDrawPointAlignment(point, rooms);
  if (alignment.label === "Corner") {
    return {
      id: "wall-continue-corner",
      point,
      label: "Continue from corner",
    };
  }

  if (alignment.label === "Wall edge") {
    return {
      id: "wall-continue-edge",
      point,
      label: "Continue on wall",
    };
  }

  return null;
}

function buildWallDrawCloseCue(
  points: FloorPlanPoint[],
  previewPoint: FloorPlanPoint | null
): WallDrawAlignmentCue | null {
  if (points.length < 3) return null;
  const firstPoint = points[0];
  if (!firstPoint) return null;
  if (previewPoint && isClosingWallDrawPoint(previewPoint, firstPoint, points.length)) {
    return null;
  }

  return {
    id: "wall-close-cue",
    point: firstPoint,
    label: "Close room here",
  };
}

function getRoomBounds(room: HouseRoom2D) {
  return {
    left: room.x - room.w / 2,
    right: room.x + room.w / 2,
    top: room.z - room.d / 2,
    bottom: room.z + room.d / 2,
  };
}

function getRoomsBounds(rooms: HouseRoom2D[]) {
  if (rooms.length === 0) return null;

  return rooms.reduce(
    (bounds, room) => {
      const roomBounds = getRoomBounds(room);
      return {
        left: Math.min(bounds.left, roomBounds.left),
        right: Math.max(bounds.right, roomBounds.right),
        top: Math.min(bounds.top, roomBounds.top),
        bottom: Math.max(bounds.bottom, roomBounds.bottom),
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    }
  );
}

function isNearPlanValue(first: number, second: number): boolean {
  return Math.abs(first - second) <= DRAW_SNAP_VISUAL_EPSILON_METERS;
}

function getRoomDrawPointAlignment(
  point: FloorPlanPoint,
  rooms: HouseRoom2D[]
): {
  alignsX: boolean;
  alignsZ: boolean;
  label: RoomDrawPointSnapLabel | null;
} {
  let alignsX = false;
  let alignsZ = false;
  let touchesEdge = false;
  let touchesCorner = false;

  for (const room of rooms) {
    const bounds = getRoomBounds(room);
    const onLeftOrRight = isNearPlanValue(point.x, bounds.left) || isNearPlanValue(point.x, bounds.right);
    const onTopOrBottom = isNearPlanValue(point.z, bounds.top) || isNearPlanValue(point.z, bounds.bottom);
    const withinVerticalSpan =
      point.z >= bounds.top - DRAW_SNAP_VISUAL_EPSILON_METERS &&
      point.z <= bounds.bottom + DRAW_SNAP_VISUAL_EPSILON_METERS;
    const withinHorizontalSpan =
      point.x >= bounds.left - DRAW_SNAP_VISUAL_EPSILON_METERS &&
      point.x <= bounds.right + DRAW_SNAP_VISUAL_EPSILON_METERS;

    alignsX = alignsX || onLeftOrRight;
    alignsZ = alignsZ || onTopOrBottom;
    touchesCorner = touchesCorner || (onLeftOrRight && onTopOrBottom);
    touchesEdge =
      touchesEdge ||
      (onLeftOrRight && withinVerticalSpan) ||
      (onTopOrBottom && withinHorizontalSpan);
  }

  return {
    alignsX,
    alignsZ,
    label: touchesCorner ? "Corner" : touchesEdge ? "Wall edge" : null,
  };
}

function buildRoomDrawGuideLines(
  preview: RoomDrawPreview | ArcWallDrawPreview | null,
  rooms: HouseRoom2D[],
  width: number,
  depth: number
): RoomDrawGuideLine[] {
  if (!preview) return [];
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const guidePoints = [
    { id: "start", point: preview.start, y: 0.008 },
    { id: "end", point: preview.end, y: 0.0085 },
  ];

  return guidePoints.flatMap(({ id, point, y }) => {
    const alignment = getRoomDrawPointAlignment(point, rooms);
    const guides: RoomDrawGuideLine[] = [];
    if (alignment.alignsX) {
      guides.push({
        id: `room-guide-${id}-x`,
        emphasis: alignment.label ? "strong" : "soft",
        points: [
          [point.x, y, -halfDepth],
          [point.x, y, halfDepth],
        ],
      });
    }
    if (alignment.alignsZ) {
      guides.push({
        id: `room-guide-${id}-z`,
        emphasis: alignment.label ? "strong" : "soft",
        points: [
          [-halfWidth, y, point.z],
          [halfWidth, y, point.z],
        ],
      });
    }
    return guides;
  });
}

function buildRectangleGhostGuideLines(
  preview: RoomDrawPreview | null,
  rooms: HouseRoom2D[]
): RoomDrawGuideLine[] {
  if (!preview?.rectangle) return [];
  const candidate = {
    left: preview.rectangle.x - preview.rectangle.width / 2,
    right: preview.rectangle.x + preview.rectangle.width / 2,
    top: preview.rectangle.z - preview.rectangle.depth / 2,
    bottom: preview.rectangle.z + preview.rectangle.depth / 2,
  };
  const guides: RoomDrawGuideLine[] = [];

  for (const room of rooms) {
    const bounds = getRoomBounds(room);
    const addVerticalGuide = (id: string, x: number, z1: number, z2: number) => {
      guides.push({
        id,
        emphasis: "strong",
        points: [
          [x, 0.013, z1],
          [x, 0.013, z2],
        ],
      });
    };
    const addHorizontalGuide = (id: string, z: number, x1: number, x2: number) => {
      guides.push({
        id,
        emphasis: "strong",
        points: [
          [x1, 0.013, z],
          [x2, 0.013, z],
        ],
      });
    };

    if (isNearPlanValue(candidate.left, bounds.right)) {
      addVerticalGuide(`rect-ghost-left-${room.id}`, candidate.left, candidate.top, candidate.bottom);
    }
    if (isNearPlanValue(candidate.right, bounds.left)) {
      addVerticalGuide(`rect-ghost-right-${room.id}`, candidate.right, candidate.top, candidate.bottom);
    }
    if (isNearPlanValue(candidate.top, bounds.bottom)) {
      addHorizontalGuide(`rect-ghost-top-${room.id}`, candidate.top, candidate.left, candidate.right);
    }
    if (isNearPlanValue(candidate.bottom, bounds.top)) {
      addHorizontalGuide(`rect-ghost-bottom-${room.id}`, candidate.bottom, candidate.left, candidate.right);
    }
  }

  return guides;
}

function buildRoomDrawSnapMarkers(
  preview: RoomDrawPreview | ArcWallDrawPreview | null,
  rooms: HouseRoom2D[]
): RoomDrawSnapMarker[] {
  if (!preview) return [];
  return [
    { id: "start", point: preview.start },
    { id: "end", point: preview.end },
  ].flatMap(({ id, point }) => {
    const label = getRoomDrawPointAlignment(point, rooms).label;
    return label ? [{ id: `snap-${id}`, point, label }] : [];
  });
}

function buildRoomDrawStartSnapMarkers(
  rooms: HouseRoom2D[],
  hoverPoint: FloorPlanPoint | null
): RoomDrawSnapMarker[] {
  if (!rooms.length) return [];

  const targets = new Map<
    string,
    {
      point: FloorPlanPoint;
      label: RoomDrawSnapMarker["label"];
      priority: number;
    }
  >();

  for (const room of rooms) {
    const bounds = getRoomBounds(room);
    const corners = [
      { x: bounds.left, z: bounds.top },
      { x: bounds.right, z: bounds.top },
      { x: bounds.right, z: bounds.bottom },
      { x: bounds.left, z: bounds.bottom },
    ];
    const edges = [
      { x: room.x, z: bounds.top },
      { x: bounds.right, z: room.z },
      { x: room.x, z: bounds.bottom },
      { x: bounds.left, z: room.z },
    ];

    corners.forEach((point) => {
      const key = `${point.x.toFixed(3)}:${point.z.toFixed(3)}`;
      targets.set(key, { point, label: "Corner", priority: 0 });
    });

    edges.forEach((point) => {
      const key = `${point.x.toFixed(3)}:${point.z.toFixed(3)}`;
      if (!targets.has(key)) {
        targets.set(key, { point, label: "Wall edge", priority: 1 });
      }
    });
  }

  let nearestKey: string | null = null;
  let nearestScore = Infinity;
  if (hoverPoint) {
    for (const [key, target] of targets) {
      const score = Math.hypot(target.point.x - hoverPoint.x, target.point.z - hoverPoint.z);
      if (score < nearestScore) {
        nearestScore = score;
        nearestKey = key;
      }
    }
  }

  return Array.from(targets.entries())
    .sort(([, a], [, b]) => a.priority - b.priority || a.point.z - b.point.z || a.point.x - b.point.x)
    .map(([key, target]) => {
      const isHovered = key === nearestKey && nearestScore <= 0.55;
      return {
        id: `start-snap-${key}`,
        point: target.point,
        label: target.label,
        displayLabel: isHovered
          ? target.label === "Corner"
            ? "Start at corner"
            : "Start on wall"
          : undefined,
        subtle: !isHovered,
      };
    });
}

function buildSharedWallPreviewMarker(
  preview: RoomDrawPreview | null,
  rooms: HouseRoom2D[]
): RoomDrawSnapMarker | null {
  const segment = buildSharedWallPreviewSegment(preview, rooms);
  if (!segment) return null;

  return {
    id: "shared-wall-preview",
    label: "Shared wall",
    point: segment.labelPosition,
  };
}

function buildSharedWallPreviewSegment(
  preview: RoomDrawPreview | null,
  rooms: HouseRoom2D[]
): SharedWallPreviewSegment | null {
  if (!preview?.rectangle) return null;
  const candidate = {
    left: preview.rectangle.x - preview.rectangle.width / 2,
    right: preview.rectangle.x + preview.rectangle.width / 2,
    top: preview.rectangle.z - preview.rectangle.depth / 2,
    bottom: preview.rectangle.z + preview.rectangle.depth / 2,
  };

  for (const room of rooms) {
    const bounds = getRoomBounds(room);
    const verticalOverlap =
      Math.min(candidate.bottom, bounds.bottom) - Math.max(candidate.top, bounds.top);
    const horizontalOverlap =
      Math.min(candidate.right, bounds.right) - Math.max(candidate.left, bounds.left);
    const anchoredWallSegment = [preview.start, preview.end]
      .map((point) => {
        const withinHorizontalSpan =
          point.x >= bounds.left - DRAW_SNAP_VISUAL_EPSILON_METERS &&
          point.x <= bounds.right + DRAW_SNAP_VISUAL_EPSILON_METERS;
        const withinVerticalSpan =
          point.z >= bounds.top - DRAW_SNAP_VISUAL_EPSILON_METERS &&
          point.z <= bounds.bottom + DRAW_SNAP_VISUAL_EPSILON_METERS;

        if (withinHorizontalSpan && isNearPlanValue(point.z, bounds.top)) {
          const startX = Math.max(candidate.left, bounds.left);
          const endX = Math.min(candidate.right, bounds.right);
          if (endX - startX > 0.3) {
            return {
              id: "shared-wall-preview",
              points: [
                [startX, 0.018, bounds.top],
                [endX, 0.018, bounds.top],
              ] as Array<[number, number, number]>,
              labelPosition: {
                x: (startX + endX) / 2,
                z: bounds.top,
              },
              lengthMeters: Number(Math.abs(endX - startX).toFixed(3)),
            };
          }
        }

        if (withinHorizontalSpan && isNearPlanValue(point.z, bounds.bottom)) {
          const startX = Math.max(candidate.left, bounds.left);
          const endX = Math.min(candidate.right, bounds.right);
          if (endX - startX > 0.3) {
            return {
              id: "shared-wall-preview",
              points: [
                [startX, 0.018, bounds.bottom],
                [endX, 0.018, bounds.bottom],
              ] as Array<[number, number, number]>,
              labelPosition: {
                x: (startX + endX) / 2,
                z: bounds.bottom,
              },
              lengthMeters: Number(Math.abs(endX - startX).toFixed(3)),
            };
          }
        }

        if (withinVerticalSpan && isNearPlanValue(point.x, bounds.left)) {
          const startZ = Math.max(candidate.top, bounds.top);
          const endZ = Math.min(candidate.bottom, bounds.bottom);
          if (endZ - startZ > 0.3) {
            return {
              id: "shared-wall-preview",
              points: [
                [bounds.left, 0.018, startZ],
                [bounds.left, 0.018, endZ],
              ] as Array<[number, number, number]>,
              labelPosition: {
                x: bounds.left,
                z: (startZ + endZ) / 2,
              },
              lengthMeters: Number(Math.abs(endZ - startZ).toFixed(3)),
            };
          }
        }

        if (withinVerticalSpan && isNearPlanValue(point.x, bounds.right)) {
          const startZ = Math.max(candidate.top, bounds.top);
          const endZ = Math.min(candidate.bottom, bounds.bottom);
          if (endZ - startZ > 0.3) {
            return {
              id: "shared-wall-preview",
              points: [
                [bounds.right, 0.018, startZ],
                [bounds.right, 0.018, endZ],
              ] as Array<[number, number, number]>,
              labelPosition: {
                x: bounds.right,
                z: (startZ + endZ) / 2,
              },
              lengthMeters: Number(Math.abs(endZ - startZ).toFixed(3)),
            };
          }
        }

        return null;
      })
      .find((segment): segment is SharedWallPreviewSegment => Boolean(segment));

    if (anchoredWallSegment) {
      return anchoredWallSegment;
    }

    if (
      verticalOverlap > 0.3 &&
      (isNearPlanValue(candidate.left, bounds.right) || isNearPlanValue(candidate.right, bounds.left))
    ) {
      const x = isNearPlanValue(candidate.left, bounds.right) ? candidate.left : candidate.right;
      const startZ = Math.max(candidate.top, bounds.top);
      const endZ = Math.min(candidate.bottom, bounds.bottom);
      return {
        id: "shared-wall-preview",
        points: [
          [x, 0.018, startZ],
          [x, 0.018, endZ],
        ],
        labelPosition: {
          x,
          z: (startZ + endZ) / 2,
        },
        lengthMeters: Number(Math.abs(endZ - startZ).toFixed(3)),
      };
    }

    if (
      horizontalOverlap > 0.3 &&
      (isNearPlanValue(candidate.top, bounds.bottom) || isNearPlanValue(candidate.bottom, bounds.top))
    ) {
      const z = isNearPlanValue(candidate.top, bounds.bottom) ? candidate.top : candidate.bottom;
      const startX = Math.max(candidate.left, bounds.left);
      const endX = Math.min(candidate.right, bounds.right);
      return {
        id: "shared-wall-preview",
        points: [
          [startX, 0.018, z],
          [endX, 0.018, z],
        ],
        labelPosition: {
          x: (startX + endX) / 2,
          z,
        },
        lengthMeters: Number(Math.abs(endX - startX).toFixed(3)),
      };
    }
  }

  return null;
}

function buildRoomDrawAnchorCue(
  point: FloorPlanPoint | null,
  rooms: HouseRoom2D[]
): { point: FloorPlanPoint; label: string } | null {
  if (!point) return null;
  const snapLabel = getRoomDrawPointAlignment(point, rooms).label;
  if (!snapLabel) return null;

  return {
    point,
    label: snapLabel === "Corner" ? "Locked to corner" : "Locked to wall",
  };
}

function buildDoorwaySuggestionUiPosition(
  suggestion: HouseRoomDoorwaySuggestion,
  room: HouseRoom2D | undefined,
  isActiveRoom: boolean,
  showDimensions: boolean
): FloorPlanPoint {
  if (!room) return suggestion.labelPosition;

  const dimensionAware = isActiveRoom && showDimensions;
  const inset = dimensionAware ? 0.34 : 0.2;
  const biasRatio = dimensionAware ? 0.76 : 0.5;
  const [start, end] = suggestion.points;

  if (suggestion.wall === "west" || suggestion.wall === "east") {
    const startZ = Math.min(start[1], end[1]);
    const endZ = Math.max(start[1], end[1]);
    const z = startZ + (endZ - startZ) * biasRatio;
    return {
      x:
        suggestion.wall === "west"
          ? room.x - room.w / 2 + inset
          : room.x + room.w / 2 - inset,
      z,
    };
  }

  const startX = Math.min(start[0], end[0]);
  const endX = Math.max(start[0], end[0]);
  const x = startX + (endX - startX) * biasRatio;
  return {
    x,
    z:
      suggestion.wall === "north"
        ? room.z - room.d / 2 + inset
        : room.z + room.d / 2 - inset,
  };
}

function buildWallDrawSnapMarker(
  previewPoint: FloorPlanPoint | null,
  points: FloorPlanPoint[],
  rooms: HouseRoom2D[]
): RoomDrawSnapMarker | null {
  if (!previewPoint) return null;

  if (isClosingWallDrawPoint(previewPoint, points[0], points.length)) {
    return {
      id: "wall-preview-close",
      point: points[0],
      label: "Close room",
      displayLabel: "Click to close room",
    };
  }

  const label = getRoomDrawPointAlignment(previewPoint, rooms).label;
  if (!label) return null;

  return {
    id: "wall-preview-snap",
    point: previewPoint,
    label,
    displayLabel: label === "Corner" ? "Snap to corner" : "Snap to wall",
  };
}

function buildRoomDrawPreviewLabel(preview: RoomDrawPreview): string {
  const width = preview.width.toFixed(1).replace(/\.0$/, "");
  const depth = preview.depth.toFixed(1).replace(/\.0$/, "");
  const area = preview.areaSqm.toFixed(1).replace(/\.0$/, "");
  return preview.rectangle ? `${width} x ${depth}m (${area} m2)` : `${width} x ${depth}m`;
}

function buildWallDrawPreviewLabel(
  start: FloorPlanPoint,
  end: FloorPlanPoint
): string {
  const lengthMm = Math.round(Math.hypot(end.x - start.x, end.z - start.z) * 1000);
  return `${lengthMm} mm`;
}

const MAX_WALL_DRAW_SEGMENT_LENGTH_METERS = ROOM_DIMENSION_DEFAULTS.max;
const ROOM_DIMENSION_EDITOR_MIN_MILLIMETERS = ROOM_DIMENSION_DEFAULTS.min * 1000;
const ROOM_DIMENSION_EDITOR_MAX_MILLIMETERS = ROOM_DIMENSION_DEFAULTS.max * 1000;

function getWallDrawSegmentLengthMeters(start: FloorPlanPoint, end: FloorPlanPoint): number {
  return Math.hypot(end.x - start.x, end.z - start.z);
}

function isWallDrawSegmentLengthRenderable(start: FloorPlanPoint, end: FloorPlanPoint): boolean {
  const length = getWallDrawSegmentLengthMeters(start, end);
  return Number.isFinite(length) && length > 0 && length <= MAX_WALL_DRAW_SEGMENT_LENGTH_METERS;
}

function areWallDrawSegmentsRenderable(points: FloorPlanPoint[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (!isWallDrawSegmentLengthRenderable(points[index - 1], points[index])) {
      return false;
    }
  }
  return true;
}

function formatMillimeters(meters: number): string {
  return `${Math.round(meters * 1000)} mm`;
}

function getOpeningPreviewHelpText(preview: TracedOpeningPreview): string | null {
  if (preview.status === "valid") return null;

  if (!preview.opening) {
    return "Move the cursor onto a room edge.";
  }

  if (preview.reason === "too_close_to_corner") {
    return "Move it farther from the nearest corner.";
  }

  if (preview.reason === "too_close_to_opening") {
    return "Move it away from the existing door or window.";
  }

  if (preview.reason === "opening_too_wide") {
    return "Use a wider wall or a smaller opening.";
  }

  return "Choose another point on the wall.";
}

function getOpeningPreviewDetailText(preview: TracedOpeningPreview): string | null {
  if (!preview.opening) return null;

  const widthLabel = formatMillimeters(preview.opening.widthMm / 1000);
  const offsetLabel = formatMillimeters(Math.abs(preview.opening.offsetMm) / 1000);
  const offsetSuffix = preview.opening.offsetMm === 0 ? "centered" : `${offsetLabel} from center`;
  return `${widthLabel} · ${preview.opening.wall} wall · ${offsetSuffix}`;
}

function buildOpeningPreviewWallGuide(
  preview: TracedOpeningPreview | null,
  rooms: HouseRoom2D[]
): OpeningPreviewWallGuide | null {
  if (!preview?.opening) return null;
  const room = rooms.find((entry) => entry.id === preview.opening?.roomId);
  if (!room) return null;

  const left = room.x - room.w / 2;
  const right = room.x + room.w / 2;
  const top = room.z - room.d / 2;
  const bottom = room.z + room.d / 2;
  const wall = preview.opening.wall;
  const isHorizontal = wall === "north" || wall === "south";
  const labelInset = preview.status === "valid" ? 0.28 : 0.34;

  if (isHorizontal) {
    const z = wall === "north" ? top : bottom;
    return {
      points: [
        [left, 0.0055, z],
        [right, 0.0055, z],
      ],
      labelPosition: {
        x: preview.labelPosition.x,
        z: wall === "north" ? z - labelInset : z + labelInset,
      },
      label: preview.status === "valid" ? "Wall edge" : "Invalid wall position",
    };
  }

  const x = wall === "west" ? left : right;
  return {
    points: [
      [x, 0.0055, top],
      [x, 0.0055, bottom],
    ],
    labelPosition: {
      x: wall === "west" ? x - labelInset : x + labelInset,
      z: preview.labelPosition.z,
    },
    label: preview.status === "valid" ? "Wall edge" : "Invalid wall position",
  };
}

function getDoorwaySuggestionKey(suggestion: HouseRoomDoorwaySuggestion) {
  return [
    suggestion.roomId,
    suggestion.adjacentRoomId,
    suggestion.wall,
    Math.round((suggestion.offsetMeters * 1000) / 50),
    Math.round((suggestion.widthMeters * 1000) / 50),
  ].join(":");
}

export default function RoomRenderer2D({
  width,
  depth,
  measurementUnit = "mm",
  showGrid = true,
  showDimensions = true,
  showLabels = true,
  showOpenings = true,
  showBuiltIns = true,
  showAnnotations = true,
  showZones = true,
  theme = "consumer",
  planViewOrientation = "normal",
  gridStep = 0.5,
  openings = [],
  fixedElements = [],
  annotations = [],
  zones = [],
  rooms = [],
  activeFloorId = null,
  activeFloorLevel,
  activeRoomId = null,
  selectedRoomIds = [],
  onSelectRoom,
  onSelectSurfaceTarget,
  onClearRoomSelection,
  onRenameRoom,
  onDuplicateRoom,
  onDeleteRoom,
  onEditFloor,
  onFitRoom,
  onMoveRoom,
  onResizeRoom,
  onRoomDragStateChange,
  onRoomResizeStateChange,
  interactive = false,
  selectedOverlayId = null,
  onSelectOverlay,
  onMoveOpening,
  onResizeOpening,
  onMoveFixedElement,
  onMoveAnnotation,
  onOverlayDragStateChange,
  onAddDoorwaySuggestion,
  suppressedDoorwaySuggestionKeys = [],
  onCommitRoomDimensionEdit,
  onCommitWallDrawSegmentLength,
  drawRoomMode = false,
  drawRoomPoints = [],
  drawRoomPreviewPoint = null,
  onDrawRoomPoint,
  onDrawRoomPreviewPoint,
  onDrawRoomDrag,
  drawRoomInteractionMode = "rectangle_wall",
  traceOpeningMode = false,
  traceOpeningKind = "door",
  onTraceOpeningPoint,
  cameraNavigation,
  onPlanDebugMetricsChange,
  canonicalPlan = null,
  canonicalStructureExpected = false,
}: RoomRenderer2DProps) {
  const htmlZIndexRange: [number, number] = [5, 0];
  const { camera, gl } = useThree();
  const readPlanZoom = useCallback(
    () => ("zoom" in camera && typeof camera.zoom === "number" ? camera.zoom : 80),
    [camera]
  );

  const halfW = width / 2;
  const halfD = depth / 2;
  const isPro = theme === "pro";
  const hasHouseRooms = rooms.length > 1;
  const canEditPlan = interactive && !drawRoomMode && !traceOpeningMode;
  const canEditRoomGeometry = canEditPlan && !canonicalStructureExpected;
  const canClearRoomSelection = canEditPlan && Boolean(onClearRoomSelection);
  const workspaceWidth = drawRoomMode
    ? Math.max(DRAW_WORKSPACE_MIN_SIZE_METERS, width + DRAW_WORKSPACE_PADDING_METERS)
    : width;
  const workspaceDepth = drawRoomMode
    ? Math.max(DRAW_WORKSPACE_MIN_SIZE_METERS, depth + DRAW_WORKSPACE_PADDING_METERS)
    : depth;
  const drawSurfaceWidth = workspaceWidth;
  const drawSurfaceDepth = workspaceDepth;
  const isStraightWallDrawMode = drawRoomMode && drawRoomInteractionMode === "straight_wall";
  const isRectangleWallDrawMode = drawRoomMode && drawRoomInteractionMode === "rectangle_wall";
  const isArcWallDrawMode = drawRoomMode && drawRoomInteractionMode === "arc_wall";
  const canTraceOpeningOnGrid = interactive && traceOpeningMode && !drawRoomMode;
  const canNavigateCameraOnPlan =
    interactive &&
    Boolean(cameraNavigation?.enabled) &&
    !drawRoomMode &&
    !traceOpeningMode;

  const floorColor = isPro ? "#ffffff" : "#f4f2ed";
  const borderColor = isPro ? "#111111" : "#9a9a9a";
  const minorGridColor = isPro ? "#e1e1e1" : "#d8d8d8";
  const majorGridColor = isPro ? "#c4c4c4" : "#c8c8c8";
  const zoneFillColor = isPro ? "#0f766e" : "#0ea5a0";
  const zoneLabelColor = isPro ? "#115e59" : "#0f766e";
  const activeRoomBorderColor = "#22c55e";
  const activeRoomHandleColor = "#16a34a";
  const openingDoorColor = isPro ? "#0b3b6f" : "#1d4ed8";
  const openingWindowColor = isPro ? "#0f766e" : "#0f766e";
  const snapThreshold = 0.12;
  const openingMinWidth = 0.4;
  const openingEdgePadding = 0.03;
  const openingMinHitLength = 0.45;
  const openingHitDepth = 0.32;
  const dragTargetRef = useRef<
    | null
    | { kind: "opening"; id: string; grabOffset: number }
    | { kind: "opening_resize"; id: string; fixedAxis: number }
    | { kind: "fixed"; id: string; width: number; depth: number }
    | { kind: "annotation"; id: string }
    | {
        kind: "room";
        id: string;
        grabOffsetX: number;
        grabOffsetZ: number;
        snap: boolean;
        latestX: number;
        latestZ: number;
        lastValidX: number;
        lastValidZ: number;
      }
  >(null);
  const cameraNavigationDragRef = useRef<CameraNavigationHandle | null>(null);
  const roomDrawDragStartRef = useRef<FloorPlanPoint | null>(null);
  const roomDrawLatestPointRef = useRef<FloorPlanPoint | null>(null);
  const roomDrawDragMovedRef = useRef(false);
  const nativeRoomDrawPointerIdsRef = useRef<Set<number>>(new Set());
  const activeWindowGestureCleanupRef = useRef<(() => void) | null>(null);
  const roomDragPreviewFrameRef = useRef<number | null>(null);
  const pendingRoomDragPreviewRef = useRef<{
    id: string;
    x: number;
    z: number;
    status: RoomDragStatus;
  } | null>(null);
  const roomBodyPointerRef = useRef<{
    roomId: string;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [roomDragGestureLocked, setRoomDragGestureLocked] = useState(false);
  const [roomDragPreview, setRoomDragPreview] = useState<{
    id: string;
    x: number;
    z: number;
    status: RoomDragStatus;
  } | null>(null);
  const lastOpeningTraceCommitRef = useRef<{
    x: number;
    z: number;
    time: number;
  } | null>(null);
  const [localDrawStartPoint, setLocalDrawStartPoint] = useState<FloorPlanPoint | null>(null);
  const [localDrawPreviewPoint, setLocalDrawPreviewPoint] = useState<FloorPlanPoint | null>(null);
  const [localOpeningPreviewPoint, setLocalOpeningPreviewPoint] =
    useState<FloorPlanPoint | null>(null);
  const [roomSnapPreview, setRoomSnapPreview] = useState<HouseRoomSnapPreview | null>(null);
  const [editingRoomDimension, setEditingRoomDimension] = useState<{
    roomId: string;
    axis: "width" | "depth";
    value: string;
  } | null>(null);
  const [editingWallDrawSegment, setEditingWallDrawSegment] = useState<{
    segmentIndex: number;
    value: string;
  } | null>(null);
  const [planZoom, setPlanZoom] = useState(readPlanZoom);
  const planZoomRef = useRef(planZoom);

  const registerWindowGestureCleanup = useCallback((cleanup: () => void) => {
    activeWindowGestureCleanupRef.current?.();
    let active = true;
    const registeredCleanup = () => {
      if (!active) return;
      active = false;
      cleanup();
      if (activeWindowGestureCleanupRef.current === registeredCleanup) {
        activeWindowGestureCleanupRef.current = null;
      }
    };
    activeWindowGestureCleanupRef.current = registeredCleanup;
    return registeredCleanup;
  }, []);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const planLabelDensity = useMemo(() => {
    if (traceOpeningMode || roomSnapPreview) {
      return { maxAdjacency: 4, maxDoorways: 6, scale: 0.9 };
    }
    if (planZoom < 56) return { maxAdjacency: 0, maxDoorways: 0, scale: 0.48 };
    if (planZoom < 74) return { maxAdjacency: 1, maxDoorways: 2, scale: 0.54 };
    if (planZoom < 94) return { maxAdjacency: 2, maxDoorways: 3, scale: 0.66 };
    if (planZoom < 124) return { maxAdjacency: 3, maxDoorways: 4, scale: 0.78 };
    return { maxAdjacency: 6, maxDoorways: 8, scale: 1 };
  }, [planZoom, roomSnapPreview, traceOpeningMode]);
  const contextLabelScale = planLabelDensity.scale;
  const showAdjacencyLabels = planLabelDensity.maxAdjacency > 0 || Boolean(roomSnapPreview);
  const showDoorwaySuggestionLabels = planLabelDensity.maxDoorways > 0 || traceOpeningMode;
  const compactContextLabelStyle = {
    borderRadius: 5,
    fontSize: 8,
    fontWeight: 800,
    padding: "1px 5px",
    whiteSpace: "nowrap",
    transform: `scale(${contextLabelScale})`,
    transformOrigin: "center",
  } as const;

  useFrame(() => {
    const nextZoom = readPlanZoom();
    if (Math.abs(planZoomRef.current - nextZoom) < 0.5) return;
    planZoomRef.current = nextZoom;
    setPlanZoom(nextZoom);
  });

  const flushRoomDragPreview = useCallback(() => {
    roomDragPreviewFrameRef.current = null;
    const nextPreview = pendingRoomDragPreviewRef.current;
    if (!nextPreview) return;
    pendingRoomDragPreviewRef.current = null;
    setRoomDragPreview(nextPreview);
  }, []);

  const scheduleRoomDragPreview = useCallback(
    (nextPreview: { id: string; x: number; z: number; status: RoomDragStatus }) => {
      pendingRoomDragPreviewRef.current = nextPreview;
      if (roomDragPreviewFrameRef.current !== null) return;
      roomDragPreviewFrameRef.current = window.requestAnimationFrame(flushRoomDragPreview);
    },
    [flushRoomDragPreview]
  );

  const clearActiveDrag = useCallback(() => {
    const dragKind = dragTargetRef.current?.kind;
    if (dragKind === "room") {
      const drag = dragTargetRef.current;
      if (drag?.kind === "room") {
        onMoveRoom?.(drag.id, drag.latestX, drag.latestZ, { snap: false });
      }
      if (roomDragPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(roomDragPreviewFrameRef.current);
        roomDragPreviewFrameRef.current = null;
      }
      pendingRoomDragPreviewRef.current = null;
      onRoomDragStateChange?.(false);
      setRoomDragGestureLocked(false);
    } else if (
      dragKind === "opening" ||
      dragKind === "opening_resize" ||
      dragKind === "fixed" ||
      dragKind === "annotation"
    ) {
      onOverlayDragStateChange?.(false, dragKind);
    }
    dragTargetRef.current = null;
    setRoomDragPreview(null);
    setRoomSnapPreview(null);
    document.body.style.cursor = "";
  }, [onMoveRoom, onOverlayDragStateChange, onRoomDragStateChange]);
  const pointerDragWasReleased = (event: ThreeEvent<PointerEvent>) =>
    event.nativeEvent.pointerType !== "touch" && event.nativeEvent.buttons === 0;
  const roomBodyClickThresholdPx = 6;

  useEffect(() => {
    if (!interactive) return;

    const clearDrag = () => {
      clearActiveDrag();
    };

    window.addEventListener("pointerup", clearDrag);
    window.addEventListener("pointercancel", clearDrag);
    window.addEventListener("blur", clearDrag);
    window.addEventListener("contextmenu", clearDrag);

    return () => {
      window.removeEventListener("pointerup", clearDrag);
      window.removeEventListener("pointercancel", clearDrag);
      window.removeEventListener("blur", clearDrag);
      window.removeEventListener("contextmenu", clearDrag);
    };
  }, [clearActiveDrag, interactive]);

  useEffect(() => {
    if (!roomDragGestureLocked) return;

    const snapshot = {
      bodyUserSelect: document.body.style.userSelect,
      bodyTouchAction: document.body.style.touchAction,
    };

    document.body.style.userSelect = "none";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.userSelect = snapshot.bodyUserSelect;
      document.body.style.touchAction = snapshot.bodyTouchAction;
    };
  }, [roomDragGestureLocked]);

  useEffect(() => {
    return () => {
      activeWindowGestureCleanupRef.current?.();
      if (roomDragPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(roomDragPreviewFrameRef.current);
      }
    };
  }, [registerWindowGestureCleanup]);

  const canDrawRoomOnGrid = drawRoomMode;
  const activeDrawRoomPoints = useMemo(
    () =>
      drawRoomPoints.length > 0
        ? drawRoomPoints
        : localDrawStartPoint
          ? [localDrawStartPoint]
          : [],
    [drawRoomPoints, localDrawStartPoint]
  );
  const wallDrawInProgress = isStraightWallDrawMode && activeDrawRoomPoints.length > 0;
  const wallDrawSegmentsRenderable = useMemo(
    () => areWallDrawSegmentsRenderable(activeDrawRoomPoints),
    [activeDrawRoomPoints]
  );
  const canRenderWallDrawTrace = isStraightWallDrawMode && wallDrawSegmentsRenderable;
  const canRenderWallDrawSegmentMeasurements =
    canRenderWallDrawTrace && activeDrawRoomPoints.length >= 2;
  const activeDrawRoomPreviewPoint = drawRoomPreviewPoint ?? localDrawPreviewPoint;
  const roomDrawPreview = useMemo(() => {
    if (
      !canDrawRoomOnGrid ||
      !isRectangleWallDrawMode ||
      activeDrawRoomPoints.length !== 1 ||
      !activeDrawRoomPreviewPoint
    ) {
      return null;
    }

    return resolveRoomDrawPreview(activeDrawRoomPoints[0], activeDrawRoomPreviewPoint, {
      rooms,
    });
  }, [
    activeDrawRoomPoints,
    activeDrawRoomPreviewPoint,
    canDrawRoomOnGrid,
    isRectangleWallDrawMode,
    rooms,
  ]);
  const drawRoomLinePoints =
    activeDrawRoomPoints.length === 2
      ? activeDrawRoomPoints
      : roomDrawPreview
        ? [roomDrawPreview.start, roomDrawPreview.end]
        : [];
  const lastWallDrawPoint =
    canRenderWallDrawTrace && activeDrawRoomPoints.length > 0
      ? activeDrawRoomPoints[activeDrawRoomPoints.length - 1]
      : null;
  const wallDrawLinePoints = canRenderWallDrawTrace
    ? buildWallDrawLinePoints(activeDrawRoomPoints, activeDrawRoomPreviewPoint)
    : [];
  const wallDrawGuideLines = canRenderWallDrawTrace
      ? buildWallDrawGuideLines(
        lastWallDrawPoint,
        activeDrawRoomPreviewPoint,
        rooms,
        drawSurfaceWidth,
        drawSurfaceDepth
      )
    : [];
  const wallDrawAlignmentCue = canRenderWallDrawTrace
    ? buildWallDrawAlignmentCue(lastWallDrawPoint, activeDrawRoomPreviewPoint, rooms)
    : null;
  const wallDrawContinuationCue =
    canRenderWallDrawTrace && activeDrawRoomPoints.length > 0
      ? buildWallDrawContinuationCue(activeDrawRoomPoints[activeDrawRoomPoints.length - 1], rooms)
      : null;
  const wallDrawCloseCue =
    canRenderWallDrawTrace
      ? buildWallDrawCloseCue(activeDrawRoomPoints, activeDrawRoomPreviewPoint)
      : null;
  const arcWallDrawPreview = useMemo(() => {
    if (
      !canDrawRoomOnGrid ||
      !isArcWallDrawMode ||
      activeDrawRoomPoints.length !== 1 ||
      !activeDrawRoomPreviewPoint
    ) {
      return null;
    }

    return resolveArcWallDrawPreview(activeDrawRoomPoints[0], activeDrawRoomPreviewPoint, {
      rooms,
    });
  }, [activeDrawRoomPoints, activeDrawRoomPreviewPoint, canDrawRoomOnGrid, isArcWallDrawMode, rooms]);
  const roomDrawGuideLines =
    canDrawRoomOnGrid && (isRectangleWallDrawMode || isArcWallDrawMode)
      ? buildRoomDrawGuideLines(
          isRectangleWallDrawMode ? roomDrawPreview : arcWallDrawPreview,
          rooms,
          drawSurfaceWidth,
          drawSurfaceDepth
        )
      : [];
  const rectangleGhostGuideLines =
    canDrawRoomOnGrid && isRectangleWallDrawMode
      ? buildRectangleGhostGuideLines(roomDrawPreview, rooms)
      : [];
  const drawSnapMarkers: RoomDrawSnapMarker[] =
    canDrawRoomOnGrid && (isRectangleWallDrawMode || isArcWallDrawMode)
      ? buildRoomDrawSnapMarkers(
          isRectangleWallDrawMode ? roomDrawPreview : arcWallDrawPreview,
          rooms
        )
      : [];
  const wallDrawSnapMarker: RoomDrawSnapMarker | null =
    isStraightWallDrawMode
      ? buildWallDrawSnapMarker(activeDrawRoomPreviewPoint, activeDrawRoomPoints, rooms)
      : null;
  const sharedWallPreviewMarker =
    canDrawRoomOnGrid && isRectangleWallDrawMode
      ? buildSharedWallPreviewMarker(roomDrawPreview, rooms)
      : null;
  const sharedWallPreviewSegment =
    canDrawRoomOnGrid && isRectangleWallDrawMode
      ? buildSharedWallPreviewSegment(roomDrawPreview, rooms)
      : null;
  const roomDrawAnchorCue =
    canDrawRoomOnGrid && isRectangleWallDrawMode
      ? buildRoomDrawAnchorCue(activeDrawRoomPoints[0] ?? null, rooms)
      : null;
  const startSnapMarkers =
    canDrawRoomOnGrid &&
    activeDrawRoomPoints.length === 0 &&
    !roomDrawPreview &&
    !arcWallDrawPreview
      ? buildRoomDrawStartSnapMarkers(rooms, activeDrawRoomPreviewPoint)
      : [];
  const overallPlanBounds = useMemo(() => getRoomsBounds(rooms), [rooms]);
  const overallPlanDimension =
    overallPlanBounds && rooms.length > 1
      ? {
          width: overallPlanBounds.right - overallPlanBounds.left,
          depth: overallPlanBounds.bottom - overallPlanBounds.top,
          centerX: (overallPlanBounds.left + overallPlanBounds.right) / 2,
          centerZ: (overallPlanBounds.top + overallPlanBounds.bottom) / 2,
          widthGuideZ: overallPlanBounds.top - 0.78,
          depthGuideX: overallPlanBounds.left - 0.78,
          tick: 0.13,
          y: 0.017,
        }
      : null;
  const overallWidthLabel =
    planViewOrientation === "rotated" ? "Overall vertical" : "Overall horizontal";
  const overallDepthLabel =
    planViewOrientation === "rotated" ? "Overall horizontal" : "Overall vertical";
  const visibleAdjacencyGuides = useMemo(() => {
    if (rooms.length < 2) return [];
    const guides = buildHouseRoomAdjacencyGuides(rooms);
    const activeGuides = activeRoomId
      ? guides.filter((guide) => guide.roomIds.includes(activeRoomId))
      : guides;
    return activeGuides
      .slice()
      .sort((a, b) => {
        const activePriority =
          Number(!activeRoomId || b.roomIds.includes(activeRoomId)) -
          Number(!activeRoomId || a.roomIds.includes(activeRoomId));
        if (activePriority !== 0) return activePriority;
        return b.lengthMeters - a.lengthMeters;
      })
      .slice(0, planLabelDensity.maxAdjacency);
  }, [activeRoomId, planLabelDensity.maxAdjacency, rooms]);
  const visibleDoorwaySuggestions = useMemo(() => {
    if (!onAddDoorwaySuggestion || rooms.length < 2) return [];
    const suppressedKeys = new Set(suppressedDoorwaySuggestionKeys);
    return buildHouseRoomDoorwaySuggestions(rooms, activeRoomId)
      .filter(
        (suggestion) =>
          !suppressedKeys.has(getDoorwaySuggestionKey(suggestion)) &&
          !openings.some(
            (opening) =>
              opening.kind === "door" &&
              opening.roomId === suggestion.roomId &&
              opening.wall === suggestion.wall &&
              Math.abs(opening.offset - suggestion.offsetMeters) <=
                Math.max(0.15, suggestion.widthMeters / 2)
          )
      )
      .sort((a, b) => {
        const activePriority =
          Number(b.roomId === activeRoomId) - Number(a.roomId === activeRoomId);
        if (activePriority !== 0) return activePriority;
        return b.widthMeters - a.widthMeters;
      })
      .slice(0, planLabelDensity.maxDoorways);
  }, [
    activeRoomId,
    onAddDoorwaySuggestion,
    openings,
    planLabelDensity.maxDoorways,
    rooms,
    suppressedDoorwaySuggestionKeys,
  ]);
  const visiblePlanLabelCount =
    (showAdjacencyLabels ? visibleAdjacencyGuides.length : 0) +
    (showDoorwaySuggestionLabels ? visibleDoorwaySuggestions.length : 0) +
    (showDimensions && overallPlanDimension ? 2 : 0) +
    (showDimensions && rooms.some((room) => room.id === activeRoomId) ? 2 : 0);

  useEffect(() => {
    onPlanDebugMetricsChange?.({
      zoom: Number(planZoom.toFixed(1)),
      visibleLabelCount: visiblePlanLabelCount,
    });
  }, [onPlanDebugMetricsChange, planZoom, visiblePlanLabelCount]);
  const getDimensionEditorValue = useCallback(
    (meters: number) => String(Math.round(meters * 1000)),
    []
  );
  const startDimensionEdit = useCallback(
    (room: HouseRoom2D, axis: "width" | "depth") => {
      setEditingRoomDimension({
        roomId: room.id,
        axis,
        value: getDimensionEditorValue(axis === "width" ? room.w : room.d),
      });
    },
    [getDimensionEditorValue]
  );
  const cancelDimensionEdit = useCallback(() => {
    setEditingRoomDimension(null);
  }, []);
  const commitDimensionEdit = useCallback(
    (rawValue?: string) => {
      if (!editingRoomDimension) return;
      const finalMillimeters = Number(rawValue ?? editingRoomDimension.value);
      if (!Number.isFinite(finalMillimeters) || finalMillimeters <= 0) {
        setEditingRoomDimension(null);
        return;
      }
      onCommitRoomDimensionEdit?.(
        editingRoomDimension.roomId,
        editingRoomDimension.axis,
        finalMillimeters / 1000
      );
      setEditingRoomDimension(null);
    },
    [editingRoomDimension, onCommitRoomDimensionEdit]
  );
  const updateDimensionEditorValue = useCallback(
    (value: string) => {
      setEditingRoomDimension((current) => (current ? { ...current, value } : current));
      const finalMillimeters = Number(value);
      if (
        Number.isFinite(finalMillimeters) &&
        finalMillimeters > ROOM_DIMENSION_EDITOR_MAX_MILLIMETERS
      ) {
        commitDimensionEdit(value);
      }
    },
    [commitDimensionEdit]
  );

  if (editingRoomDimension) {
    const finalMillimeters = Number(editingRoomDimension.value);
    if (
      !rooms.some((room) => room.id === editingRoomDimension.roomId) ||
      (Number.isFinite(finalMillimeters) &&
        finalMillimeters > ROOM_DIMENSION_EDITOR_MAX_MILLIMETERS)
    ) {
      setEditingRoomDimension(null);
    }
  }

  const startWallDrawSegmentLengthEdit = useCallback(
    (segmentIndex: number, start: FloorPlanPoint, end: FloorPlanPoint) => {
      const lengthMm = Math.round(Math.hypot(end.x - start.x, end.z - start.z) * 1000);
      setEditingWallDrawSegment({
        segmentIndex,
        value: String(lengthMm),
      });
    },
    []
  );
  const cancelWallDrawSegmentLengthEdit = useCallback(() => {
    setEditingWallDrawSegment(null);
  }, []);
  const commitWallDrawSegmentLengthEdit = useCallback(
    (rawValue?: string) => {
      if (!editingWallDrawSegment) return;
      const finalMillimeters = Number(rawValue ?? editingWallDrawSegment.value);
      if (!Number.isFinite(finalMillimeters) || finalMillimeters <= 0) {
        setEditingWallDrawSegment(null);
        return;
      }
      onCommitWallDrawSegmentLength?.(
        editingWallDrawSegment.segmentIndex,
        finalMillimeters / 1000
      );
      setEditingWallDrawSegment(null);
    },
    [editingWallDrawSegment, onCommitWallDrawSegmentLength]
  );
  const updateWallDrawSegmentEditorValue = useCallback(
    (value: string) => {
      setEditingWallDrawSegment((current) => (current ? { ...current, value } : current));
      const finalMillimeters = Number(value);
      if (
        Number.isFinite(finalMillimeters) &&
        finalMillimeters > MAX_WALL_DRAW_SEGMENT_LENGTH_METERS * 1000
      ) {
        commitWallDrawSegmentLengthEdit(value);
      }
    },
    [commitWallDrawSegmentLengthEdit]
  );

  if (editingWallDrawSegment) {
    const finalMillimeters = Number(editingWallDrawSegment.value);
    if (
      !canRenderWallDrawSegmentMeasurements ||
      editingWallDrawSegment.segmentIndex <= 0 ||
      editingWallDrawSegment.segmentIndex >= activeDrawRoomPoints.length ||
      (Number.isFinite(finalMillimeters) &&
        finalMillimeters > MAX_WALL_DRAW_SEGMENT_LENGTH_METERS * 1000)
    ) {
      setEditingWallDrawSegment(null);
    }
  }

  const openingPreview = useMemo<TracedOpeningPreview | null>(() => {
    if (!canTraceOpeningOnGrid || !localOpeningPreviewPoint) return null;

    return resolveOpeningPlacementFromPoint(
      localOpeningPreviewPoint,
      rooms,
      traceOpeningKind,
      openings.map((opening) => ({
        id: opening.id,
        roomId: opening.roomId,
        wall: opening.wall,
        kind: opening.kind,
        offsetMm: Math.round(opening.offset * 1000),
        widthMm: Math.round(opening.width * 1000),
      }))
    );
  }, [canTraceOpeningOnGrid, localOpeningPreviewPoint, openings, rooms, traceOpeningKind]);
  const openingPreviewWallGuide = buildOpeningPreviewWallGuide(openingPreview, rooms);
  const openingPreviewHelpText = openingPreview ? getOpeningPreviewHelpText(openingPreview) : null;
  const openingPreviewDetailText = openingPreview
    ? getOpeningPreviewDetailText(openingPreview)
    : null;

  const formatDimension = (meters: number) => {
    const millimeters = meters * 1000;
    if (measurementUnit === "cm") {
      const value = (millimeters / 10).toFixed(1).replace(/\.0$/, "");
      return `${value} cm`;
    }
    if (measurementUnit === "in") {
      const value = (millimeters / 25.4).toFixed(1).replace(/\.0$/, "");
      return `${value} in`;
    }
    return `${Math.round(millimeters)} mm`;
  };

  const setPointerCaptureIfSupported = (event: ThreeEvent<PointerEvent>) => {
    const target = event.target as Element | null;
    if (target && "setPointerCapture" in target) {
      target.setPointerCapture(event.pointerId);
    }
  };

  const getDrawPointFromEvent = (event: ThreeEvent<PointerEvent | MouseEvent>): FloorPlanPoint => ({
    x: Number(event.point.x.toFixed(3)),
    z: Number(event.point.z.toFixed(3)),
  });

  const getSnappedRoomDrawPoint = useCallback(
    (point: FloorPlanPoint, points: FloorPlanPoint[]): FloorPlanPoint => {
      if (drawRoomInteractionMode !== "straight_wall") {
        return point;
      }

      return snapFloorPlanPointForWallDraw(point, {
        rooms,
        previousPoint: points.length > 0 ? points[points.length - 1] : null,
        firstPoint: points.length > 0 ? points[0] : null,
        pointCount: points.length,
      });
    },
    [drawRoomInteractionMode, rooms]
  );

  const handleOpeningTracePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!canTraceOpeningOnGrid) return;
    event.stopPropagation();
    setLocalOpeningPreviewPoint(getDrawPointFromEvent(event));
  };

  const commitOpeningTracePoint = useCallback(
    (point: FloorPlanPoint) => {
      if (!canTraceOpeningOnGrid) return;

      const lastCommit = lastOpeningTraceCommitRef.current;
      const now = Date.now();
      if (
        lastCommit &&
        now - lastCommit.time < 350 &&
        Math.abs(lastCommit.x - point.x) <= 0.01 &&
        Math.abs(lastCommit.z - point.z) <= 0.01
      ) {
        return;
      }
      lastOpeningTraceCommitRef.current = { ...point, time: now };
      setLocalOpeningPreviewPoint(point);
      onTraceOpeningPoint?.(point);
    },
    [canTraceOpeningOnGrid, onTraceOpeningPoint]
  );

  const handleOpeningTraceCommit = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!canTraceOpeningOnGrid) return;
    event.stopPropagation();
    commitOpeningTracePoint(getDrawPointFromEvent(event));
  };

  const handleOpeningTracePointerOut = (event: ThreeEvent<PointerEvent>) => {
    if (!canTraceOpeningOnGrid) return;
    event.stopPropagation();
    setLocalOpeningPreviewPoint(null);
  };

  const getDrawPointFromClientPosition = useCallback(
    (clientX: number, clientY: number): FloorPlanPoint | null => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }

      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      raycaster.setFromCamera(pointer, camera);

      if (!raycaster.ray.intersectPlane(floorPlane, intersection)) return null;

      return {
        x: Number(intersection.x.toFixed(3)),
        z: Number(intersection.z.toFixed(3)),
      };
    },
    [camera, gl]
  );

  const getNavigationPointFromEvent = (event: ThreeEvent<PointerEvent>): FloorPlanPoint => {
    const nativeEvent = event.nativeEvent;
    return (
      getDrawPointFromClientPosition(nativeEvent.clientX, nativeEvent.clientY) ??
      getDrawPointFromEvent(event)
    );
  };

  const getPlanPointFromPointerEvent = (event: ThreeEvent<PointerEvent>): FloorPlanPoint => {
    const nativeEvent = event.nativeEvent;
    return (
      getDrawPointFromClientPosition(nativeEvent.clientX, nativeEvent.clientY) ??
      getDrawPointFromEvent(event)
    );
  };

  const lockRoomDragGesture = () => {
    setRoomDragGestureLocked(true);
  };

  const stopDomRoomMoveEvent = (event: PointerEvent | ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if ("nativeEvent" in event) {
      event.nativeEvent.stopImmediatePropagation?.();
    } else {
      event.stopImmediatePropagation?.();
    }
  };

  const moveRoomDragToClientPoint = (room: HouseRoom2D, clientX: number, clientY: number) => {
    const drag = dragTargetRef.current;
    if (!drag || drag.kind !== "room" || drag.id !== room.id) return;
    const planPoint = getDrawPointFromClientPosition(clientX, clientY);
    if (!planPoint) return;

    const nextX = planPoint.x - drag.grabOffsetX;
    const nextZ = planPoint.z - drag.grabOffsetZ;
    const move = resolveHouseRoomMove({
      roomId: room.id,
      x: nextX,
      z: nextZ,
      rooms,
      snap: drag.snap,
    });
    if (!move) return;

    const blocked = move.movementStatus === "blocked";
    const nextStatus: RoomDragStatus = move.movementStatus;
    if (blocked) {
      drag.latestX = drag.lastValidX;
      drag.latestZ = drag.lastValidZ;
    } else {
      drag.latestX = move.x;
      drag.latestZ = move.z;
      drag.lastValidX = move.x;
      drag.lastValidZ = move.z;
    }
    scheduleRoomDragPreview({
      id: room.id,
      x: blocked ? move.attemptedX : move.x,
      z: blocked ? move.attemptedZ : move.z,
      status: nextStatus,
    });
    setRoomSnapPreview(move.snapPreview);
  };

  const startExplicitRoomMove = (
    room: HouseRoom2D,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if (!canEditRoomGeometry || !onMoveRoom) return;
    stopDomRoomMoveEvent(event);
    const planPoint = getDrawPointFromClientPosition(event.clientX, event.clientY);
    if (!planPoint) return;

    onSelectRoom?.(room.id);
    dragTargetRef.current = {
      kind: "room",
      id: room.id,
      grabOffsetX: planPoint.x - room.x,
      grabOffsetZ: planPoint.z - room.z,
      snap: !event.shiftKey,
      latestX: room.x,
      latestZ: room.z,
      lastValidX: room.x,
      lastValidZ: room.z,
    };
    setRoomDragPreview({ id: room.id, x: room.x, z: room.z, status: "free" });
    onRoomDragStateChange?.(true);
    lockRoomDragGesture();
    setRoomSnapPreview(null);
    document.body.style.cursor = "grabbing";

    const moveTarget = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      moveTarget.setPointerCapture(pointerId);
    } catch {}

    const onPointerMove = (moveEvent: PointerEvent) => {
      const drag = dragTargetRef.current;
      if (!drag || drag.kind !== "room" || drag.id !== room.id) return;
      stopDomRoomMoveEvent(moveEvent);
      drag.snap = !moveEvent.shiftKey;
      moveRoomDragToClientPoint(room, moveEvent.clientX, moveEvent.clientY);
    };

    let cleanupWindowGesture = () => {};
    const onPointerUp = (upEvent: PointerEvent) => {
      stopDomRoomMoveEvent(upEvent);
      cleanupWindowGesture();
      try {
        moveTarget.releasePointerCapture(pointerId);
      } catch {}
      clearActiveDrag();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    cleanupWindowGesture = registerWindowGestureCleanup(() => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      try {
        moveTarget.releasePointerCapture(pointerId);
      } catch {}
    });
  };

  const moveCameraNavigationHandle = (
    handle: CameraNavigationHandle,
    point: FloorPlanPoint
  ) => {
    if (handle === "camera") {
      cameraNavigation?.onMoveCamera(point.x, point.z);
      return;
    }
    cameraNavigation?.onMoveTarget(point.x, point.z);
  };

  const handleCameraNavigationPointerDown = (
    handle: CameraNavigationHandle,
    event: ThreeEvent<PointerEvent>
  ) => {
    if (!canNavigateCameraOnPlan) return;
    event.stopPropagation();
    setPointerCaptureIfSupported(event);
    cameraNavigationDragRef.current = handle;
    moveCameraNavigationHandle(handle, getNavigationPointFromEvent(event));
  };

  const handleCameraNavigationPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!canNavigateCameraOnPlan || !cameraNavigationDragRef.current) return;
    event.stopPropagation();
    moveCameraNavigationHandle(
      cameraNavigationDragRef.current,
      getNavigationPointFromEvent(event)
    );
  };

  const handleCameraNavigationPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!cameraNavigationDragRef.current) return;
    event.stopPropagation();
    const target = event.target as Element | null;
    if (target && "releasePointerCapture" in target) {
      target.releasePointerCapture(event.pointerId);
    }
    cameraNavigationDragRef.current = null;
  };

  useEffect(() => {
    if (!canTraceOpeningOnGrid) return;

    const canvas = gl.domElement;
    const handleNativePointerMove = (event: PointerEvent) => {
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      setLocalOpeningPreviewPoint(point);
    };
    const handleNativePointerLeave = () => {
      setLocalOpeningPreviewPoint(null);
    };
    const handleNativePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      if (!point) return;

      event.preventDefault();
      event.stopPropagation();
      commitOpeningTracePoint(point);
    };

    canvas.addEventListener("pointermove", handleNativePointerMove, { capture: true });
    canvas.addEventListener("pointerleave", handleNativePointerLeave);
    canvas.addEventListener("pointerdown", handleNativePointerDown, { capture: true });
    window.addEventListener("pointermove", handleNativePointerMove, { capture: true });
    window.addEventListener("pointerdown", handleNativePointerDown, { capture: true });
    return () => {
      canvas.removeEventListener("pointermove", handleNativePointerMove, { capture: true });
      canvas.removeEventListener("pointerleave", handleNativePointerLeave);
      canvas.removeEventListener("pointerdown", handleNativePointerDown, { capture: true });
      window.removeEventListener("pointermove", handleNativePointerMove, { capture: true });
      window.removeEventListener("pointerdown", handleNativePointerDown, { capture: true });
    };
  }, [canTraceOpeningOnGrid, commitOpeningTracePoint, getDrawPointFromClientPosition, gl]);

  const markRoomDrawMoved = (point: FloorPlanPoint) => {
    const start = roomDrawDragStartRef.current;
    if (!start) return;

    const deltaX = Math.abs(point.x - start.x);
    const deltaZ = Math.abs(point.z - start.z);
    if (deltaX > 0.12 || deltaZ > 0.12) {
      roomDrawDragMovedRef.current = true;
    }
  };

  useEffect(() => {
    if (!canDrawRoomOnGrid) return;

    const canvas = gl.domElement;
    const nativePointerIds = nativeRoomDrawPointerIdsRef.current;

    const handleNativePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      if (!point) return;
      const snappedPoint = getSnappedRoomDrawPoint(point, activeDrawRoomPoints);

      event.preventDefault();
      nativePointerIds.add(event.pointerId);
      roomDrawDragStartRef.current = snappedPoint;
      roomDrawLatestPointRef.current = snappedPoint;
      roomDrawDragMovedRef.current = false;
      setLocalDrawStartPoint(snappedPoint);
      setLocalDrawPreviewPoint(null);
      if (drawRoomInteractionMode === "straight_wall") {
        onDrawRoomPoint?.(snappedPoint);
      }

      if ("setPointerCapture" in canvas) {
        canvas.setPointerCapture(event.pointerId);
      }
    };

    const handleNativePointerMove = (event: PointerEvent) => {
      if (!nativePointerIds.has(event.pointerId)) return;
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      if (!point) return;
      const snappedPoint = getSnappedRoomDrawPoint(point, activeDrawRoomPoints);

      event.preventDefault();
      markRoomDrawMoved(snappedPoint);
      roomDrawLatestPointRef.current = snappedPoint;
      setLocalDrawPreviewPoint(snappedPoint);
      onDrawRoomPreviewPoint?.(snappedPoint);
    };

    const handleNativeMouseMove = (event: MouseEvent) => {
      if (!roomDrawDragStartRef.current) return;
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      if (!point) return;
      const snappedPoint = getSnappedRoomDrawPoint(point, activeDrawRoomPoints);

      markRoomDrawMoved(snappedPoint);
      roomDrawLatestPointRef.current = snappedPoint;
      setLocalDrawPreviewPoint(snappedPoint);
      onDrawRoomPreviewPoint?.(snappedPoint);
    };

    const finishNativePointer = (event: PointerEvent) => {
      if (!nativePointerIds.has(event.pointerId)) return;

      event.preventDefault();
      const endPoint =
        getDrawPointFromClientPosition(event.clientX, event.clientY) ??
        roomDrawLatestPointRef.current;
      if (endPoint) {
        markRoomDrawMoved(endPoint);
      }
      const start = roomDrawDragStartRef.current;
      if (start && endPoint && roomDrawDragMovedRef.current) {
        onDrawRoomDrag?.(start, endPoint);
      } else if (start && drawRoomInteractionMode !== "straight_wall") {
        onDrawRoomPoint?.(start);
      }

      nativePointerIds.delete(event.pointerId);
      roomDrawDragStartRef.current = null;
      roomDrawLatestPointRef.current = null;
      roomDrawDragMovedRef.current = false;
      setLocalDrawStartPoint(null);
      setLocalDrawPreviewPoint(null);

      if ("releasePointerCapture" in canvas) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener("pointerdown", handleNativePointerDown);
    window.addEventListener("pointermove", handleNativePointerMove);
    window.addEventListener("mousemove", handleNativeMouseMove);
    window.addEventListener("pointerup", finishNativePointer);
    window.addEventListener("pointercancel", finishNativePointer);

    return () => {
      canvas.removeEventListener("pointerdown", handleNativePointerDown);
      window.removeEventListener("pointermove", handleNativePointerMove);
      window.removeEventListener("mousemove", handleNativeMouseMove);
      window.removeEventListener("pointerup", finishNativePointer);
      window.removeEventListener("pointercancel", finishNativePointer);
    };
  }, [
    canDrawRoomOnGrid,
    drawRoomInteractionMode,
    getSnappedRoomDrawPoint,
    getDrawPointFromClientPosition,
    gl.domElement,
    activeDrawRoomPoints,
    onDrawRoomDrag,
    onDrawRoomPoint,
    onDrawRoomPreviewPoint,
  ]);

  const handleRoomDrawPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (nativeRoomDrawPointerIdsRef.current.has(event.pointerId)) {
      event.stopPropagation();
      return;
    }
    const point = getDrawPointFromEvent(event);
    const snappedPoint = getSnappedRoomDrawPoint(point, activeDrawRoomPoints);
    event.stopPropagation();
    roomDrawDragStartRef.current = snappedPoint;
    roomDrawLatestPointRef.current = snappedPoint;
    roomDrawDragMovedRef.current = false;
    setLocalDrawStartPoint(snappedPoint);
    setLocalDrawPreviewPoint(null);
    if (drawRoomInteractionMode === "straight_wall") {
      onDrawRoomPoint?.(snappedPoint);
    }
    setPointerCaptureIfSupported(event);

    const start = snappedPoint;
    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = getDrawPointFromClientPosition(moveEvent.clientX, moveEvent.clientY);
      if (!nextPoint) return;
      const snappedPoint = getSnappedRoomDrawPoint(nextPoint, activeDrawRoomPoints);

      const deltaX = Math.abs(snappedPoint.x - start.x);
      const deltaZ = Math.abs(snappedPoint.z - start.z);
      if (deltaX > 0.12 || deltaZ > 0.12) {
        roomDrawDragMovedRef.current = true;
      }

      roomDrawLatestPointRef.current = snappedPoint;
      setLocalDrawPreviewPoint(snappedPoint);
      onDrawRoomPreviewPoint?.(snappedPoint);
    };
    let cleanupWindowGesture = () => {};
    const handleWindowPointerUp = (upEvent: PointerEvent) => {
      const endPoint =
        getDrawPointFromClientPosition(upEvent.clientX, upEvent.clientY) ??
        roomDrawLatestPointRef.current;
      if (endPoint) {
        markRoomDrawMoved(endPoint);
      }
      if (endPoint && roomDrawDragMovedRef.current) {
        onDrawRoomDrag?.(start, endPoint);
      } else if (drawRoomInteractionMode !== "straight_wall") {
        onDrawRoomPoint?.(start);
      }

      roomDrawDragStartRef.current = null;
      roomDrawLatestPointRef.current = null;
      roomDrawDragMovedRef.current = false;
      setLocalDrawStartPoint(null);
      setLocalDrawPreviewPoint(null);
      cleanupWindowGesture();
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp, { once: true });
    cleanupWindowGesture = registerWindowGestureCleanup(() => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    });
  };

  const handleRoomDrawPointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const point = getDrawPointFromEvent(event);
    const snappedPoint = getSnappedRoomDrawPoint(point, activeDrawRoomPoints);
    markRoomDrawMoved(snappedPoint);
    roomDrawLatestPointRef.current = snappedPoint;
    setLocalDrawPreviewPoint(snappedPoint);
    onDrawRoomPreviewPoint?.(snappedPoint);
  };

  const releasePointerCaptureIfSupported = (event: ThreeEvent<PointerEvent>) => {
    const target = event.target as Element | null;
    if (target && "releasePointerCapture" in target) {
      target.releasePointerCapture(event.pointerId);
    }
  };

  const stopNativeRoomDragEvent = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    event.nativeEvent.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();
  };

  const getOpeningRoom = (opening: Opening2D) =>
    opening.roomId ? rooms.find((room) => room.id === opening.roomId) : undefined;

  const getOpeningAxisValue = (
    opening: Pick<Opening2D, "wall">,
    point: { x: number; z: number }
  ) => (opening.wall === "north" || opening.wall === "south" ? point.x : point.z);

  const getOpeningPointerAxisValue = (
    opening: Pick<Opening2D, "wall">,
    event: ThreeEvent<PointerEvent>
  ) => getOpeningAxisValue(opening, getPlanPointFromPointerEvent(event));

  const getOpeningRoomAxisCenter = (opening: Opening2D) => {
    const openingRoom = getOpeningRoom(opening);
    return opening.wall === "north" || opening.wall === "south"
      ? openingRoom?.x ?? 0
      : openingRoom?.z ?? 0;
  };

  const getOpeningWallSpan = (opening: Opening2D) => {
    const openingRoom = getOpeningRoom(opening);
    return opening.wall === "north" || opening.wall === "south"
      ? openingRoom?.w ?? width
      : openingRoom?.d ?? depth;
  };

  const startOpeningMoveDrag = (openingId: string, event: ThreeEvent<PointerEvent>) => {
    stopNativeRoomDragEvent(event);
    onSelectOverlay?.(openingId);
    const opening = openings.find((entry) => entry.id === openingId);
    if (!opening) return false;

    const centerAxis = getOpeningRoomAxisCenter(opening);
    const pointerOffset = getOpeningPointerAxisValue(opening, event) - centerAxis;
    dragTargetRef.current = {
      kind: "opening",
      id: openingId,
      grabOffset: opening.offset - pointerOffset,
    };
    onOverlayDragStateChange?.(true, "opening");
    setPointerCaptureIfSupported(event);
    return true;
  };

  const handleOpeningMove = (
    opening: Opening2D,
    event: ThreeEvent<PointerEvent>,
    grabOffset: number
  ) => {
    if (!onMoveOpening) return;
    const centerAxis = getOpeningRoomAxisCenter(opening);
    const span = getOpeningWallSpan(opening);
    const maxOffset = Math.max(0, span / 2 - opening.width / 2 - openingEdgePadding);
    const rawOffset = getOpeningPointerAxisValue(opening, event) - centerAxis + grabOffset;
    const nextOffset = clamp(rawOffset, -maxOffset, maxOffset);
    onMoveOpening(opening.id, nextOffset);
  };

  const getOpeningResizeCursor = (wall: Opening2D["wall"]) =>
    wall === "north" || wall === "south" ? "ew-resize" : "ns-resize";

  const handleOpeningResize = (
    opening: Opening2D,
    fixedAxis: number,
    event: ThreeEvent<PointerEvent>
  ) => {
    if (!onResizeOpening) return;
    const centerAxis = getOpeningRoomAxisCenter(opening);
    const span = getOpeningWallSpan(opening);
    const minAxis = centerAxis - span / 2 + openingEdgePadding;
    const maxAxis = centerAxis + span / 2 - openingEdgePadding;
    const rawPointerAxis = getOpeningPointerAxisValue(opening, event);
    const rawDirection = rawPointerAxis >= fixedAxis ? 1 : -1;
    let pointerAxis = clamp(rawPointerAxis, minAxis, maxAxis);

    if (Math.abs(pointerAxis - fixedAxis) < openingMinWidth) {
      pointerAxis = clamp(fixedAxis + rawDirection * openingMinWidth, minAxis, maxAxis);
    }

    const widthMeters = Math.max(openingMinWidth, Math.abs(pointerAxis - fixedAxis));
    const offsetMeters = (pointerAxis + fixedAxis) / 2 - centerAxis;
    onResizeOpening(opening.id, { widthMeters, offsetMeters });
  };

  const handleFixedMove = (
    fixed: FixedElement2D,
    event: ThreeEvent<PointerEvent>,
    widthHint?: number,
    depthHint?: number
  ) => {
    if (!onMoveFixedElement) return;
    const elemW = widthHint ?? fixed.w;
    const elemD = depthHint ?? fixed.d;
    const minX = -halfW + elemW / 2;
    const maxX = halfW - elemW / 2;
    const minZ = -halfD + elemD / 2;
    const maxZ = halfD - elemD / 2;

    let nextX = clamp(event.point.x, minX, maxX);
    let nextZ = clamp(event.point.z, minZ, maxZ);

    const west = minX;
    const east = maxX;
    const north = minZ;
    const south = maxZ;

    if (Math.abs(nextX - west) < snapThreshold) nextX = west;
    if (Math.abs(nextX - east) < snapThreshold) nextX = east;
    if (Math.abs(nextZ - north) < snapThreshold) nextZ = north;
    if (Math.abs(nextZ - south) < snapThreshold) nextZ = south;

    onMoveFixedElement(fixed.id, nextX, nextZ);
  };

  const handleAnnotationMove = (annotation: Annotation2D, event: ThreeEvent<PointerEvent>) => {
    if (!onMoveAnnotation) return;
    const nextX = clamp(event.point.x, -halfW + 0.05, halfW - 0.05);
    const nextZ = clamp(event.point.z, -halfD + 0.05, halfD - 0.05);
    onMoveAnnotation(annotation.id, nextX, nextZ);
  };

  const resizeRoomFromEdges = (
    room: HouseRoom2D,
    handle: RoomResizeHandle,
    edges: { left: number; right: number; top: number; bottom: number },
    deltaX: number,
    deltaZ: number
  ) => {
    if (!onResizeRoom) return;

    const minRoomSize = 1.8;
    const maxRoomSize = 20;
    let nextLeft = edges.left;
    let nextRight = edges.right;
    let nextTop = edges.top;
    let nextBottom = edges.bottom;

    if (handle.includes("w")) nextLeft = edges.left + deltaX;
    if (handle.includes("e")) nextRight = edges.right + deltaX;
    if (handle.includes("n")) nextTop = edges.top + deltaZ;
    if (handle.includes("s")) nextBottom = edges.bottom + deltaZ;

    if (nextRight - nextLeft < minRoomSize) {
      if (handle.includes("w")) nextLeft = nextRight - minRoomSize;
      if (handle.includes("e")) nextRight = nextLeft + minRoomSize;
    }

    if (nextBottom - nextTop < minRoomSize) {
      if (handle.includes("n")) nextTop = nextBottom - minRoomSize;
      if (handle.includes("s")) nextBottom = nextTop + minRoomSize;
    }

    if (nextRight - nextLeft > maxRoomSize) {
      if (handle.includes("w")) nextLeft = nextRight - maxRoomSize;
      if (handle.includes("e")) nextRight = nextLeft + maxRoomSize;
    }

    if (nextBottom - nextTop > maxRoomSize) {
      if (handle.includes("n")) nextTop = nextBottom - maxRoomSize;
      if (handle.includes("s")) nextBottom = nextTop + maxRoomSize;
    }

    const snapRoomWallEdge = (value: number, axis: "x" | "z") => {
      const candidates = rooms
        .filter((entry) => entry.id !== room.id)
        .flatMap((entry) => {
          const bounds = getRoomBounds(entry);
          return axis === "x" ? [bounds.left, bounds.right] : [bounds.top, bounds.bottom];
        })
        .map((candidate) => ({
          value: candidate,
          distance: Math.abs(value - candidate),
        }))
        .filter((candidate) => candidate.distance <= HOUSE_ROOM_WALL_SNAP_DISTANCE_METERS)
        .sort((first, second) => first.distance - second.distance)[0];

      return candidates?.value ?? value;
    };

    if (handle.includes("w")) nextLeft = snapRoomWallEdge(nextLeft, "x");
    if (handle.includes("e")) nextRight = snapRoomWallEdge(nextRight, "x");
    if (handle.includes("n")) nextTop = snapRoomWallEdge(nextTop, "z");
    if (handle.includes("s")) nextBottom = snapRoomWallEdge(nextBottom, "z");

    if (nextRight - nextLeft < minRoomSize) {
      if (handle.includes("w")) nextLeft = nextRight - minRoomSize;
      if (handle.includes("e")) nextRight = nextLeft + minRoomSize;
    }

    if (nextBottom - nextTop < minRoomSize) {
      if (handle.includes("n")) nextTop = nextBottom - minRoomSize;
      if (handle.includes("s")) nextBottom = nextTop + minRoomSize;
    }

    if (nextRight - nextLeft > maxRoomSize) {
      if (handle.includes("w")) nextLeft = nextRight - maxRoomSize;
      if (handle.includes("e")) nextRight = nextLeft + maxRoomSize;
    }

    if (nextBottom - nextTop > maxRoomSize) {
      if (handle.includes("n")) nextTop = nextBottom - maxRoomSize;
      if (handle.includes("s")) nextBottom = nextTop + maxRoomSize;
    }

    onResizeRoom(room.id, {
      x: (nextLeft + nextRight) / 2,
      z: (nextTop + nextBottom) / 2,
      w: nextRight - nextLeft,
      d: nextBottom - nextTop,
    });
  };

  const startDomRoomResize = (
    room: HouseRoom2D,
    handle: RoomResizeHandle,
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!onResizeRoom) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();
    onSelectRoom?.(room.id);
    onRoomResizeStateChange?.(true);
    const resizeTarget = event.currentTarget;
    const resizePointerId = event.pointerId;
    try {
      resizeTarget.setPointerCapture(resizePointerId);
    } catch {}

    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = "zoom" in camera && typeof camera.zoom === "number" ? camera.zoom : 80;
    const edges = {
      left: room.x - room.w / 2,
      right: room.x + room.w / 2,
      top: room.z - room.d / 2,
      bottom: room.z + room.d / 2,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      moveEvent.stopImmediatePropagation?.();
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaZ = (moveEvent.clientY - startY) / zoom;
      resizeRoomFromEdges(room, handle, edges, deltaX, deltaZ);
    };

    let cleanupWindowGesture = () => {};
    const onPointerUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      upEvent.stopImmediatePropagation?.();
      cleanupWindowGesture();
      try {
        resizeTarget.releasePointerCapture(resizePointerId);
      } catch {}
      onRoomResizeStateChange?.(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    cleanupWindowGesture = registerWindowGestureCleanup(() => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      try {
        resizeTarget.releasePointerCapture(resizePointerId);
      } catch {}
    });
  };

  const roomResizeHandles: Array<{
    id: RoomResizeHandle;
    x: number;
    z: number;
    cursor: string;
    shape: "edge-x" | "edge-z" | "corner";
  }> = [
    { id: "n", x: 0, z: -0.5, cursor: "ns-resize", shape: "edge-x" },
    { id: "e", x: 0.5, z: 0, cursor: "ew-resize", shape: "edge-z" },
    { id: "s", x: 0, z: 0.5, cursor: "ns-resize", shape: "edge-x" },
    { id: "w", x: -0.5, z: 0, cursor: "ew-resize", shape: "edge-z" },
    { id: "nw", x: -0.5, z: -0.5, cursor: "nwse-resize", shape: "corner" },
    { id: "ne", x: 0.5, z: -0.5, cursor: "nesw-resize", shape: "corner" },
    { id: "se", x: 0.5, z: 0.5, cursor: "nwse-resize", shape: "corner" },
    { id: "sw", x: -0.5, z: 0.5, cursor: "nesw-resize", shape: "corner" },
  ];

  const gridLines: Array<{ points: Array<[number, number, number]>; major: boolean; key: string }> = [];
  if (showGrid) {
    const startX = -workspaceWidth / 2;
    const endX = workspaceWidth / 2;
    const startZ = -workspaceDepth / 2;
    const endZ = workspaceDepth / 2;
    const epsilon = EDITOR_GEOMETRY_TOLERANCES.boundaryMeters;

    for (let x = startX; x <= endX + epsilon; x += gridStep) {
      const mm = Math.round(Math.abs(x * 1000));
      const major = mm % 1000 === 0;
      gridLines.push({
        key: `gx-${x.toFixed(3)}`,
        major,
        points: [
          [x, 0.0018, startZ],
          [x, 0.0018, endZ],
        ],
      });
    }

    for (let z = startZ; z <= endZ + epsilon; z += gridStep) {
      const mm = Math.round(Math.abs(z * 1000));
      const major = mm % 1000 === 0;
      gridLines.push({
        key: `gz-${z.toFixed(3)}`,
        major,
        points: [
          [startX, 0.0018, z],
          [endX, 0.0018, z],
        ],
      });
    }
  }

  const wallBandRooms = useMemo(
    () =>
      rooms.map((room) =>
        roomDragPreview?.id === room.id
          ? { ...room, x: roomDragPreview.x, z: roomDragPreview.z }
          : room
      ),
    [roomDragPreview, rooms]
  );

  const openingSegments = openings.map((o): OpeningRenderSegment2D => {
    const openingRoom = getOpeningRoom(o);
    const centerX = openingRoom?.x ?? 0;
    const centerZ = openingRoom?.z ?? 0;
    const openingHalfW = (openingRoom?.w ?? width) / 2;
    const openingHalfD = (openingRoom?.d ?? depth) / 2;

    if (o.wall === "north" || o.wall === "south") {
      const z = centerZ + (o.wall === "north" ? -openingHalfD : openingHalfD);
      const x0 = centerX + o.offset - o.width / 2;
      const x1 = centerX + o.offset + o.width / 2;
      const center = [(x0 + x1) / 2, 0.003, z] as [number, number, number];
      return {
        id: o.id,
        kind: o.kind,
        doorStyle: o.doorStyle,
        wall: o.wall,
        offset: o.offset,
        width: o.width,
        center,
        hitSize: [Math.max(o.width, openingMinHitLength), openingHitDepth] as [number, number],
        labelPosition: [
          center[0],
          0.07,
          z + (o.wall === "north" ? -0.34 : 0.34),
        ] as [number, number, number],
        points: [
          [x0, 0.0022, z] as [number, number, number],
          [x1, 0.0022, z] as [number, number, number],
        ],
      };
    }
    const x = centerX + (o.wall === "west" ? -openingHalfW : openingHalfW);
    const z0 = centerZ + o.offset - o.width / 2;
    const z1 = centerZ + o.offset + o.width / 2;
    const center = [x, 0.003, (z0 + z1) / 2] as [number, number, number];
    return {
      id: o.id,
      kind: o.kind,
      doorStyle: o.doorStyle,
      wall: o.wall,
      offset: o.offset,
      width: o.width,
      center,
      hitSize: [openingHitDepth, Math.max(o.width, openingMinHitLength)] as [number, number],
      labelPosition: [
        x + (o.wall === "west" ? -0.34 : 0.34),
        0.07,
        center[2],
      ] as [number, number, number],
      points: [
        [x, 0.0022, z0] as [number, number, number],
        [x, 0.0022, z1] as [number, number, number],
      ],
    };
  });
  const wallBandLayout = useMemo(() => {
    if (!hasHouseRooms || canonicalStructureExpected) {
      return { parts: [], windowMarkers: [], cornerCaps: [] };
    }
    const mergedSegments = mergeSharedWallSegments2D(buildRoomWallSegments2D(wallBandRooms));
    return mergedSegments.reduce(
      (layout, segment) => {
        const split = splitWallBandByOpenings2D(segment, openings);
        layout.parts.push(...split.parts);
        layout.windowMarkers.push(...split.windowMarkers);
        return layout;
      },
      {
        parts: [] as ReturnType<typeof splitWallBandByOpenings2D>["parts"],
        windowMarkers: [] as ReturnType<typeof splitWallBandByOpenings2D>["windowMarkers"],
        cornerCaps: buildWallBandCornerCaps2D(mergedSegments),
      }
    );
  }, [canonicalStructureExpected, hasHouseRooms, openings, wallBandRooms]);
  const navigationCameraPoint = cameraNavigation
    ? {
        x: cameraNavigation.cameraPosition[0],
        z: cameraNavigation.cameraPosition[2],
      }
    : null;
  const navigationTargetPoint = cameraNavigation
    ? {
        x: cameraNavigation.cameraTarget[0],
        z: cameraNavigation.cameraTarget[2],
      }
    : null;
  const navigationAimRadians =
    navigationCameraPoint && navigationTargetPoint
      ? Math.atan2(
          navigationTargetPoint.x - navigationCameraPoint.x,
          navigationTargetPoint.z - navigationCameraPoint.z
        )
      : 0;
  const navigationDashSegments =
    navigationCameraPoint && navigationTargetPoint
      ? (() => {
          const dx = navigationTargetPoint.x - navigationCameraPoint.x;
          const dz = navigationTargetPoint.z - navigationCameraPoint.z;
          const length = Math.hypot(dx, dz);
          if (length <= EDITOR_GEOMETRY_TOLERANCES.wallSegmentMeters) return [];
          const dashLength = 0.18;
          const gapLength = 0.14;
          const step = dashLength + gapLength;
          const segments: Array<[[number, number, number], [number, number, number]]> = [];
          for (let start = 0; start < length; start += step) {
            const end = Math.min(length, start + dashLength);
            segments.push([
              [
                navigationCameraPoint.x + (dx * start) / length,
                0.075,
                navigationCameraPoint.z + (dz * start) / length,
              ],
              [
                navigationCameraPoint.x + (dx * end) / length,
                0.075,
                navigationCameraPoint.z + (dz * end) / length,
              ],
            ]);
          }
          return segments;
        })()
      : [];

  return (
    <group>
      {hasHouseRooms && canClearRoomSelection && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.0002, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            clearActiveDrag();
            onClearRoomSelection?.();
          }}
        >
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial
            transparent
            opacity={0.001}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {canDrawRoomOnGrid && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.05, 0]}
          onPointerDown={handleRoomDrawPointerDown}
          onPointerMove={handleRoomDrawPointerMove}
          onPointerOut={(event) => {
            event.stopPropagation();
            if (!roomDrawDragStartRef.current) {
              setLocalDrawStartPoint(null);
              setLocalDrawPreviewPoint(null);
              onDrawRoomPreviewPoint?.(null);
            }
          }}
        >
          <planeGeometry args={[drawSurfaceWidth, drawSurfaceDepth]} />
          <meshBasicMaterial
            transparent
            opacity={0.001}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {canTraceOpeningOnGrid && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.052, 0]}
          onPointerDown={handleOpeningTraceCommit}
          onPointerMove={handleOpeningTracePointerMove}
          onPointerOut={handleOpeningTracePointerOut}
          onClick={handleOpeningTraceCommit}
        >
          <planeGeometry args={[drawSurfaceWidth, drawSurfaceDepth]} />
          <meshBasicMaterial
            transparent
            opacity={0.001}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {canNavigateCameraOnPlan && navigationCameraPoint && navigationTargetPoint && (
        <group>
          {navigationDashSegments.map((segment, index) => (
            <Line
              key={`camera-navigation-dash-${index}`}
              points={segment}
              color={isPro ? "#111827" : "#3f3f46"}
              lineWidth={1.4}
              transparent
              opacity={0.9}
            />
          ))}

          <group
            position={[navigationCameraPoint.x, 0.1, navigationCameraPoint.z]}
            rotation-y={navigationAimRadians}
            onPointerDown={(event) => handleCameraNavigationPointerDown("camera", event)}
            onPointerMove={handleCameraNavigationPointerMove}
            onPointerUp={handleCameraNavigationPointerUp}
            onPointerCancel={handleCameraNavigationPointerUp}
          >
            <mesh>
              <boxGeometry args={[0.52, 0.08, 0.34]} />
              <meshBasicMaterial color={isPro ? "#1f2937" : "#4b5563"} />
            </mesh>
            <mesh position={[0, 0, -0.25]}>
              <boxGeometry args={[0.3, 0.08, 0.16]} />
              <meshBasicMaterial color={isPro ? "#1f2937" : "#4b5563"} />
            </mesh>
            <mesh position={[0, 0.055, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.78, 0.62]} />
              <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
            </mesh>
          </group>

          <group
            position={[navigationTargetPoint.x, 0.11, navigationTargetPoint.z]}
            onPointerDown={(event) => handleCameraNavigationPointerDown("target", event)}
            onPointerMove={handleCameraNavigationPointerMove}
            onPointerUp={handleCameraNavigationPointerUp}
            onPointerCancel={handleCameraNavigationPointerUp}
          >
            <mesh rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.16, 32]} />
              <meshBasicMaterial color={isPro ? "#4b5563" : "#71717a"} />
            </mesh>
            <mesh position={[0, 0, -0.33]} rotation-x={-Math.PI / 2}>
              <coneGeometry args={[0.11, 0.18, 3]} />
              <meshBasicMaterial color={isPro ? "#4b5563" : "#71717a"} />
            </mesh>
            <mesh position={[0, 0, 0.33]} rotation-x={Math.PI / 2}>
              <coneGeometry args={[0.11, 0.18, 3]} />
              <meshBasicMaterial color={isPro ? "#4b5563" : "#71717a"} />
            </mesh>
            <mesh position={[-0.33, 0, 0]} rotation-z={Math.PI / 2} rotation-x={-Math.PI / 2}>
              <coneGeometry args={[0.11, 0.18, 3]} />
              <meshBasicMaterial color={isPro ? "#4b5563" : "#71717a"} />
            </mesh>
            <mesh position={[0.33, 0, 0]} rotation-z={-Math.PI / 2} rotation-x={-Math.PI / 2}>
              <coneGeometry args={[0.11, 0.18, 3]} />
              <meshBasicMaterial color={isPro ? "#4b5563" : "#71717a"} />
            </mesh>
            <mesh position={[0, 0.055, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.9, 0.9]} />
              <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
            </mesh>
          </group>
        </group>
      )}

      {!hasHouseRooms && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.0005, 0]}
          onPointerDown={handleOpeningTraceCommit}
          onPointerMove={handleOpeningTracePointerMove}
          onPointerOut={handleOpeningTracePointerOut}
          onClick={handleOpeningTraceCommit}
        >
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial color={floorColor} />
        </mesh>
      )}

      {hasHouseRooms &&
        rooms.map((room) => {
          const isActiveRoom = room.id === activeRoomId;
          const isSelectedRoom = selectedRoomIds.includes(room.id);
          const isHoveredRoom = hoveredRoomId === room.id && canEditRoomGeometry;
          const roomFillColor =
            isHoveredRoom && !isActiveRoom
              ? isPro
                ? "#fafafa"
                : "#ebe8df"
              : getHouseRoomFloorPlanColor(room, isActiveRoom, isPro);
          const roomOutlineColor = isActiveRoom
            ? activeRoomBorderColor
            : isSelectedRoom
              ? "#10b981"
            : isHoveredRoom
              ? "#0f766e"
              : borderColor;
          const previewPosition = roomDragPreview?.id === room.id ? roomDragPreview : null;
          const renderX = previewPosition?.x ?? room.x;
          const renderZ = previewPosition?.z ?? room.z;
          const isDraggingRoom = Boolean(previewPosition);
          const dragStatus = previewPosition?.status ?? null;
          const dragOutlineColor =
            dragStatus === "blocked"
              ? "#f97316"
              : dragStatus === "snapped"
                ? "#2563eb"
                : activeRoomBorderColor;
          const effectiveRoomOutlineColor = isDraggingRoom ? dragOutlineColor : roomOutlineColor;
          const effectiveRoomLineWidth = isDraggingRoom
            ? 4.2
            : isActiveRoom
              ? 3
              : isSelectedRoom
                ? 2.7
                : isHoveredRoom
                  ? 2.4
                  : 1.5;
          const effectiveFillOpacity = isDraggingRoom
            ? dragStatus === "blocked"
              ? 0.54
              : 0.72
            : 1;
          const dragHudStatusLabel =
            dragStatus === "blocked"
              ? "Overlap blocked"
              : dragStatus === "snapped"
                ? "Snapped to wall"
                : "Free move";
          const dimensionGuideColor = "#16a34a";
          const dimensionGuideY = 0.018;
          const widthDimensionGuideOffset = 0.3;
          const depthDimensionGuideOffset = 0.46;
          const dimensionGuideTick = 0.09;
          const widthDimensionZ = -room.d / 2 - widthDimensionGuideOffset;
          const depthDimensionX = -room.w / 2 - depthDimensionGuideOffset;
          return (
            <group key={room.id} position={[renderX, isDraggingRoom ? 0.01 : 0, renderZ]}>
              <HouseRoomFloorFill2D
                room={room}
                fillColor={roomFillColor}
                dragStatus={dragStatus}
                isDraggingRoom={isDraggingRoom}
                fillOpacity={effectiveFillOpacity}
                interactive={interactive}
                onSelectRoom={onSelectRoom}
                onSelectSurfaceTarget={onSelectSurfaceTarget}
              />
              <mesh
                userData={{
                  dragState: dragStatus ?? undefined,
                  testId: isDraggingRoom ? "room-drag-preview" : undefined,
                }}
                rotation-x={-Math.PI / 2}
                position={[0, 0.0009, 0]}
                onPointerDown={(event) => {
                  if (canTraceOpeningOnGrid) {
                    handleOpeningTraceCommit(event);
                    return;
                  }
                  if (canDrawRoomOnGrid) {
                    handleRoomDrawPointerDown(event);
                    return;
                  }
                  if (!canEditRoomGeometry) return;
                  roomBodyPointerRef.current = {
                    roomId: room.id,
                    clientX: event.nativeEvent.clientX,
                    clientY: event.nativeEvent.clientY,
                  };
                }}
                onPointerMove={(event) => {
                  if (canTraceOpeningOnGrid) {
                    handleOpeningTracePointerMove(event);
                    return;
                  }
                  if (canDrawRoomOnGrid) {
                    handleRoomDrawPointerMove(event);
                    return;
                  }
                  const drag = dragTargetRef.current;
                  if (!drag || drag.kind !== "room" || drag.id !== room.id) return;
                  if (pointerDragWasReleased(event)) {
                    clearActiveDrag();
                    releasePointerCaptureIfSupported(event);
                    return;
                  }
                  stopNativeRoomDragEvent(event);
                  const planPoint = getPlanPointFromPointerEvent(event);
                  const nextX = planPoint.x - drag.grabOffsetX;
                  const nextZ = planPoint.z - drag.grabOffsetZ;
                  const snapEnabled = !event.nativeEvent.shiftKey;
                  drag.snap = snapEnabled;
                  const move = resolveHouseRoomMove({
                    roomId: room.id,
                    x: nextX,
                    z: nextZ,
                    rooms,
                    snap: snapEnabled,
                  });
                  if (!move) return;
                  const blocked = move.movementStatus === "blocked";
                  const nextStatus: RoomDragStatus = move.movementStatus;
                  if (blocked) {
                    drag.latestX = drag.lastValidX;
                    drag.latestZ = drag.lastValidZ;
                  } else {
                    drag.latestX = move.x;
                    drag.latestZ = move.z;
                    drag.lastValidX = move.x;
                    drag.lastValidZ = move.z;
                  }
                  scheduleRoomDragPreview({
                    id: room.id,
                    x: blocked ? move.attemptedX : move.x,
                    z: blocked ? move.attemptedZ : move.z,
                    status: nextStatus,
                  });
                  setRoomSnapPreview(move.snapPreview);
                }}
                onPointerUp={(event) => {
                  if (canTraceOpeningOnGrid) {
                    event.stopPropagation();
                    return;
                  }
                  if (canDrawRoomOnGrid) {
                    event.stopPropagation();
                    return;
                  }
                  const drag = dragTargetRef.current;
                  if (drag?.kind === "room" && drag.id === room.id) {
                    clearActiveDrag();
                    releasePointerCaptureIfSupported(event);
                    return;
                  }
                  const pointerStart = roomBodyPointerRef.current;
                  if (pointerStart?.roomId === room.id) {
                    const deltaX = event.nativeEvent.clientX - pointerStart.clientX;
                    const deltaY = event.nativeEvent.clientY - pointerStart.clientY;
                    roomBodyPointerRef.current = null;
                    if (Math.hypot(deltaX, deltaY) <= roomBodyClickThresholdPx) {
                      onSelectRoom?.(room.id, {
                        additive:
                          event.nativeEvent.shiftKey ||
                          event.nativeEvent.metaKey ||
                          event.nativeEvent.ctrlKey,
                      });
                    }
                  }
                }}
                onPointerCancel={(event) => {
                  roomBodyPointerRef.current = null;
                  clearActiveDrag();
                  releasePointerCaptureIfSupported(event);
                }}
                onPointerOver={(event) => {
                  if (!canEditRoomGeometry || canTraceOpeningOnGrid || canDrawRoomOnGrid) return;
                  event.stopPropagation();
                  setHoveredRoomId(room.id);
                  document.body.style.cursor = "grab";
                }}
                onPointerOut={(event) => {
                  if (hoveredRoomId === room.id) setHoveredRoomId(null);
                  if (dragTargetRef.current?.kind !== "room") document.body.style.cursor = "";
                  handleOpeningTracePointerOut(event);
                }}
                onClick={(event) => {
                  if (canTraceOpeningOnGrid) {
                    handleOpeningTraceCommit(event);
                    return;
                  }
                  if (canDrawRoomOnGrid) {
                    event.stopPropagation();
                    return;
                  }
                }}
              >
                <shapeGeometry args={[buildRoomShapeGeometry(room)]} />
                <meshBasicMaterial
                  transparent
                  opacity={0.001}
                  depthWrite={false}
                />
              </mesh>
              {!canonicalStructureExpected && (
                <Line
                  points={getRoomOutlinePoints(room).map(([x, z]) => [x, isDraggingRoom ? 0.008 : 0.0026, z])}
                  color={effectiveRoomOutlineColor}
                  lineWidth={effectiveRoomLineWidth}
                />
              )}
              {isSelectedRoom && !isDraggingRoom && (
                <HouseRoomComparisonOverlay2D room={room} active={isActiveRoom} />
              )}
              {isDraggingRoom && (
                <Html
                  zIndexRange={[18, 0]}
                  position={[0, 0.09, -room.d / 2 - 0.34]}
                  center
                  transform={false}
                  style={{ pointerEvents: "none" }}
                >
                  <div
                    data-testid="room-drag-hud"
                    data-drag-state={dragStatus}
                    style={{
                      minWidth: 154,
                      border:
                        dragStatus === "blocked"
                          ? "1px solid rgba(249,115,22,0.42)"
                          : dragStatus === "snapped"
                            ? "1px solid rgba(37,99,235,0.42)"
                            : "1px solid rgba(34,197,94,0.36)",
                      borderRadius: 7,
                      background:
                        dragStatus === "blocked"
                          ? "rgba(255,247,237,0.96)"
                          : dragStatus === "snapped"
                            ? "rgba(239,246,255,0.96)"
                            : "rgba(240,253,244,0.96)",
                      boxShadow: "0 7px 18px rgba(15,23,42,0.14)",
                      color:
                        dragStatus === "blocked"
                          ? "#c2410c"
                          : dragStatus === "snapped"
                            ? "#1d4ed8"
                            : "#166534",
                      display: "grid",
                      gap: 2,
                      fontSize: 10,
                      fontWeight: 750,
                      lineHeight: 1.25,
                      padding: "6px 8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>{room.name}</span>
                      <span>{dragHudStatusLabel}</span>
                    </div>
                    <div style={{ color: "#4b5563", display: "flex", gap: 8, fontWeight: 650 }}>
                      <span>X {renderX.toFixed(2)}m</span>
                      <span>Z {renderZ.toFixed(2)}m</span>
                      <span>Shift: no snap</span>
                    </div>
                  </div>
                </Html>
              )}
              {showLabels && (
                <Html zIndexRange={htmlZIndexRange} position={[0, 0.012, 0]} center transform={false}>
                  <div
                    data-testid="house-room-2d-label"
                    data-room-id={room.id}
                    data-active={isActiveRoom ? "true" : "false"}
                    data-selected={isSelectedRoom ? "true" : "false"}
                    data-selection-visual={isSelectedRoom ? "comparison" : "none"}
                    data-room-x={renderX.toFixed(3)}
                    data-room-z={renderZ.toFixed(3)}
                    style={{
                      alignItems: "center",
                      background: isSelectedRoom
                        ? "rgba(209,250,229,0.97)"
                        : "rgba(255,255,255,0.78)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: isActiveRoom || isSelectedRoom ? "#166534" : "#525252",
                      border:
                        isSelectedRoom
                          ? "2px solid rgba(16,185,129,0.78)"
                          : isActiveRoom
                            ? "1px solid rgba(34,197,94,0.35)"
                          : "1px solid rgba(82,82,82,0.18)",
                      borderRadius: 4,
                      boxShadow: isSelectedRoom
                        ? "0 2px 8px rgba(5,150,105,0.24)"
                        : "none",
                      display: "flex",
                      gap: 4,
                      padding: "2px 7px",
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isSelectedRoom ? (
                      <span
                        data-testid="house-room-2d-selection-badge"
                        data-room-id={room.id}
                        aria-hidden="true"
                        style={{ fontSize: 10, fontWeight: 900 }}
                      >
                        ✓
                      </span>
                    ) : null}
                    {room.name}
                  </div>
                </Html>
              )}
              {isActiveRoom && (
                <Html zIndexRange={[1, 0]} position={[0, 0.012, 0]} center transform={false}>
                  <div
                    data-testid="house-room-2d-hit-probe"
                    data-room-id={room.id}
                    data-room-x={renderX.toFixed(3)}
                    data-room-z={renderZ.toFixed(3)}
                    style={{
                      width: 1,
                      height: 1,
                      overflow: "hidden",
                      pointerEvents: "none",
                    }}
                  />
                </Html>
              )}

              {isActiveRoom && canEditPlan && (
                <Html
                  zIndexRange={[16, 0]}
                  position={[0, 0.04, room.d / 2 + 0.28]}
                  center
                  transform={false}
                >
                  <div
                    data-testid="selected-room-toolbar"
                    data-room-id={room.id}
                    data-room-x={renderX.toFixed(3)}
                    data-room-z={renderZ.toFixed(3)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      padding: 2,
                      border: "1px solid rgba(34,197,94,0.22)",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.9)",
                      boxShadow: "0 5px 14px rgba(15,23,42,0.12)",
                      pointerEvents: "auto",
                      whiteSpace: "nowrap",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label="Move room"
                      title="Move room"
                      data-testid="selected-room-move"
                      disabled={!onMoveRoom}
                      onPointerDown={(event) => startExplicitRoomMove(room, event)}
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        border: "none",
                        borderRadius: 5,
                        background: "rgba(220,252,231,0.95)",
                        color: "#166534",
                        cursor: onMoveRoom ? "grab" : "not-allowed",
                        fontSize: 9,
                        fontWeight: 800,
                        opacity: onMoveRoom ? 1 : 0.45,
                        minWidth: 32,
                        padding: "3px 6px",
                        touchAction: "none",
                        userSelect: "none",
                      }}
                    >
                      Move
                    </button>
                    {[
                      { id: "floor", label: "Floor", action: onEditFloor },
                      { id: "fit", label: "Fit", action: onFitRoom },
                      { id: "rename", label: "Name", action: onRenameRoom },
                      { id: "duplicate", label: "Copy", action: onDuplicateRoom },
                      { id: "delete", label: "Delete", action: onDeleteRoom },
                    ].map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        aria-label={`${tool.label} room`}
                        title={`${tool.label} room`}
                        data-testid={`selected-room-${tool.id}`}
                        disabled={!tool.action}
                        onClick={(event) => {
                          event.stopPropagation();
                          tool.action?.(room.id);
                        }}
                        style={{
                          border: "none",
                          borderRadius: 5,
                          background: tool.id === "delete" ? "#fee2e2" : "rgba(243,244,246,0.9)",
                          color: tool.id === "delete" ? "#991b1b" : "#111827",
                          cursor: tool.action ? "pointer" : "not-allowed",
                          fontSize: 9,
                          fontWeight: 800,
                          opacity: tool.action ? 1 : 0.45,
                          minWidth: tool.id === "delete" ? 34 : 26,
                          padding: "3px 6px",
                        }}
                      >
                        {tool.id === "rename" ? "Name" : tool.id === "duplicate" ? "Copy" : tool.label}
                      </button>
                    ))}
                  </div>
                </Html>
              )}

              {isActiveRoom && showDimensions && !wallDrawInProgress && (
                <Html
                  zIndexRange={[15, 0]}
                  position={[room.w / 2, 0.035, -room.d / 2]}
                  center
                  transform={false}
                >
                  <div
                    data-testid="active-room-measurement-hud"
                    style={{
                      minWidth: 0,
                      border: "1px solid rgba(34,197,94,0.22)",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.9)",
                      boxShadow: "0 5px 14px rgba(15,23,42,0.12)",
                      color: "#14532d",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "4px 7px",
                      pointerEvents: "none",
                      transform: "translate(14px, -16px)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ color: "#166534", fontSize: 11 }}>
                      {formatDimension(room.w)} x {formatDimension(room.d)}
                      <span style={{ color: "#4b5563", fontWeight: 600, marginLeft: 6 }}>
                        {(room.w * room.d).toFixed(1)} m2
                      </span>
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 9, fontWeight: 650, marginTop: 1 }}>
                      Wall {formatDimension(room.wallThickness ?? 0.12)}
                    </div>
                    {canEditPlan && onCommitRoomDimensionEdit ? (
                      <div style={{ color: "#6b7280", fontSize: 9, fontWeight: 600, marginTop: 1 }}>
                        Click Width or Depth to edit
                      </div>
                    ) : null}
                  </div>
                </Html>
              )}

              {isActiveRoom && showDimensions && !wallDrawInProgress && (
                <>
                  <Line
                    points={[
                      [-room.w / 2, dimensionGuideY, widthDimensionZ],
                      [room.w / 2, dimensionGuideY, widthDimensionZ],
                    ]}
                    color={dimensionGuideColor}
                    lineWidth={1.8}
                    transparent
                    opacity={0.92}
                    raycast={() => null}
                    userData={{ testId: "active-room-dimension-guide-width" }}
                  />
                  <Line
                    points={[
                      [-room.w / 2, dimensionGuideY, widthDimensionZ - dimensionGuideTick],
                      [-room.w / 2, dimensionGuideY, widthDimensionZ + dimensionGuideTick],
                    ]}
                    color={dimensionGuideColor}
                    lineWidth={1.8}
                    transparent
                    opacity={0.92}
                    raycast={() => null}
                  />
                  <Line
                    points={[
                      [room.w / 2, dimensionGuideY, widthDimensionZ - dimensionGuideTick],
                      [room.w / 2, dimensionGuideY, widthDimensionZ + dimensionGuideTick],
                    ]}
                    color={dimensionGuideColor}
                    lineWidth={1.8}
                    transparent
                    opacity={0.92}
                    raycast={() => null}
                  />
                  <Line
                    points={[
                      [depthDimensionX, dimensionGuideY, -room.d / 2],
                      [depthDimensionX, dimensionGuideY, room.d / 2],
                    ]}
                    color={dimensionGuideColor}
                    lineWidth={1.8}
                    transparent
                    opacity={0.92}
                    raycast={() => null}
                    userData={{ testId: "active-room-dimension-guide-depth" }}
                  />
                  <Line
                    points={[
                      [depthDimensionX - dimensionGuideTick, dimensionGuideY, -room.d / 2],
                      [depthDimensionX + dimensionGuideTick, dimensionGuideY, -room.d / 2],
                    ]}
                    color={dimensionGuideColor}
                    lineWidth={1.8}
                    transparent
                    opacity={0.92}
                    raycast={() => null}
                  />
                  <Line
                    points={[
                      [depthDimensionX - dimensionGuideTick, dimensionGuideY, room.d / 2],
                      [depthDimensionX + dimensionGuideTick, dimensionGuideY, room.d / 2],
                    ]}
                    color={dimensionGuideColor}
                    lineWidth={1.8}
                    transparent
                    opacity={0.92}
                    raycast={() => null}
                  />
                  <Html
                    zIndexRange={[20, 0]}
                    position={[0, 0.022, widthDimensionZ]}
                    center
                    transform={false}
                  >
                    {editingRoomDimension?.roomId === room.id &&
                    editingRoomDimension.axis === "width" ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#166534",
                          background: "rgba(255,255,255,0.98)",
                          border: "1px solid rgba(34,197,94,0.32)",
                          borderRadius: 6,
                          padding: "3px 6px",
                          pointerEvents: "auto",
                          whiteSpace: "nowrap",
                          boxShadow: "0 1px 6px rgba(15,23,42,0.12)",
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <span>Width</span>
                        <input
                          data-testid="active-room-dimension-editor-width"
                          autoFocus
                          type="number"
                          inputMode="numeric"
                          min={ROOM_DIMENSION_EDITOR_MIN_MILLIMETERS}
                          max={ROOM_DIMENSION_EDITOR_MAX_MILLIMETERS}
                          step={1}
                          value={editingRoomDimension.value}
                          onChange={(event) => updateDimensionEditorValue(event.currentTarget.value)}
                          onBlur={(event) => commitDimensionEdit(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitDimensionEdit(event.currentTarget.value);
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelDimensionEdit();
                            }
                          }}
                          style={{
                            width: 58,
                            border: "none",
                            background: "transparent",
                            color: "#166534",
                            fontSize: 10,
                            fontWeight: 700,
                            outline: "none",
                          }}
                        />
                        <span style={{ color: "#4b5563", fontWeight: 600 }}>mm</span>
                      </div>
                    ) : (
                    <button
                      type="button"
                      data-testid="active-room-dimension-width"
                      title="Click to edit width"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        startDimensionEdit(room, "width");
                      }}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#166534",
                        background: "rgba(240,253,244,0.88)",
                        border: "1px solid rgba(34,197,94,0.26)",
                        borderRadius: 5,
                        padding: "1px 5px",
                        pointerEvents: canEditPlan && onCommitRoomDimensionEdit ? "auto" : "none",
                        whiteSpace: "nowrap",
                        boxShadow: "0 1px 3px rgba(15,23,42,0.1)",
                        cursor: canEditPlan && onCommitRoomDimensionEdit ? "text" : "default",
                      }}
                    >
                      Width {formatDimension(room.w)}
                    </button>
                    )}
                  </Html>
                  <Html
                    zIndexRange={[20, 0]}
                    position={[depthDimensionX, 0.022, 0]}
                    center
                    transform={false}
                  >
                    {editingRoomDimension?.roomId === room.id &&
                    editingRoomDimension.axis === "depth" ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#166534",
                          background: "rgba(255,255,255,0.98)",
                          border: "1px solid rgba(34,197,94,0.32)",
                          borderRadius: 6,
                          padding: "3px 6px",
                          pointerEvents: "auto",
                          whiteSpace: "nowrap",
                          boxShadow: "0 1px 6px rgba(15,23,42,0.12)",
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <span>Depth</span>
                        <input
                          data-testid="active-room-dimension-editor-depth"
                          autoFocus
                          type="number"
                          inputMode="numeric"
                          min={ROOM_DIMENSION_EDITOR_MIN_MILLIMETERS}
                          max={ROOM_DIMENSION_EDITOR_MAX_MILLIMETERS}
                          step={1}
                          value={editingRoomDimension.value}
                          onChange={(event) => updateDimensionEditorValue(event.currentTarget.value)}
                          onBlur={(event) => commitDimensionEdit(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitDimensionEdit(event.currentTarget.value);
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelDimensionEdit();
                            }
                          }}
                          style={{
                            width: 58,
                            border: "none",
                            background: "transparent",
                            color: "#166534",
                            fontSize: 10,
                            fontWeight: 700,
                            outline: "none",
                          }}
                        />
                        <span style={{ color: "#4b5563", fontWeight: 600 }}>mm</span>
                      </div>
                    ) : (
                    <button
                      type="button"
                      data-testid="active-room-dimension-depth"
                      title="Click to edit depth"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        startDimensionEdit(room, "depth");
                      }}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#166534",
                        background: "rgba(240,253,244,0.88)",
                        border: "1px solid rgba(34,197,94,0.26)",
                        borderRadius: 5,
                        padding: "1px 5px",
                        pointerEvents: canEditPlan && onCommitRoomDimensionEdit ? "auto" : "none",
                        whiteSpace: "nowrap",
                        boxShadow: "0 1px 3px rgba(15,23,42,0.1)",
                        cursor: canEditPlan && onCommitRoomDimensionEdit ? "text" : "default",
                      }}
                    >
                      Depth {formatDimension(room.d)}
                    </button>
                    )}
                  </Html>
                </>
              )}

              {isActiveRoom &&
                canEditRoomGeometry &&
                onResizeRoom &&
                room.shape !== "custom_polygon" &&
                roomResizeHandles.map((handle) => (
                  <group
                    key={handle.id}
                    position={[handle.x * room.w, 0, handle.z * room.d]}
                  >
                    <Html zIndexRange={htmlZIndexRange} position={[0, 0.02, 0]} center transform={false}>
                      <div
                        data-testid={`room-resize-handle-${room.id}-${handle.id}`}
                        onPointerDown={(event) => startDomRoomResize(room, handle.id, event)}
                        style={{
                          width: handle.shape === "edge-z" ? 28 : handle.shape === "edge-x" ? 64 : 44,
                          height: handle.shape === "edge-z" ? 64 : handle.shape === "edge-x" ? 28 : 44,
                          borderRadius: handle.shape === "corner" ? 5 : 999,
                          display: "grid",
                          placeItems: "center",
                          cursor: handle.cursor,
                          pointerEvents: "auto",
                          touchAction: "none",
                          userSelect: "none",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: handle.shape === "edge-z" ? 12 : handle.shape === "edge-x" ? 36 : 20,
                            height: handle.shape === "edge-z" ? 36 : handle.shape === "edge-x" ? 12 : 20,
                            borderRadius: handle.shape === "corner" ? 5 : 999,
                            background: "rgba(255,255,255,0.88)",
                            border: `1.5px solid ${activeRoomHandleColor}`,
                            boxShadow: "0 1px 4px rgba(15,23,42,0.14)",
                            outline: "1px solid rgba(255,255,255,0.58)",
                          }}
                        />
                      </div>
                    </Html>
                  </group>
                ))}
            </group>
          );
        })}

      {showDimensions && overallPlanBounds && overallPlanDimension && !wallDrawInProgress && (
        <group>
          <Line
            points={[
              [overallPlanBounds.left, overallPlanDimension.y, overallPlanDimension.widthGuideZ],
              [overallPlanBounds.right, overallPlanDimension.y, overallPlanDimension.widthGuideZ],
            ]}
            color="#52525b"
            lineWidth={1.6}
            transparent
            opacity={0.72}
            raycast={() => null}
            userData={{ testId: "overall-plan-dimension-guide-width" }}
          />
          <Line
            points={[
              [overallPlanBounds.left, overallPlanDimension.y, overallPlanDimension.widthGuideZ - overallPlanDimension.tick],
              [overallPlanBounds.left, overallPlanDimension.y, overallPlanDimension.widthGuideZ + overallPlanDimension.tick],
            ]}
            color="#52525b"
            lineWidth={1.6}
            transparent
            opacity={0.72}
            raycast={() => null}
          />
          <Line
            points={[
              [overallPlanBounds.right, overallPlanDimension.y, overallPlanDimension.widthGuideZ - overallPlanDimension.tick],
              [overallPlanBounds.right, overallPlanDimension.y, overallPlanDimension.widthGuideZ + overallPlanDimension.tick],
            ]}
            color="#52525b"
            lineWidth={1.6}
            transparent
            opacity={0.72}
            raycast={() => null}
          />
          <Html
            zIndexRange={[13, 0]}
            position={[overallPlanDimension.centerX, 0.021, overallPlanDimension.widthGuideZ]}
            center
            transform={false}
          >
            <div
              data-testid="overall-plan-dimension-width"
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(82,82,91,0.28)",
                borderRadius: 6,
                boxShadow: "0 1px 4px rgba(15,23,42,0.1)",
                color: "#3f3f46",
                fontSize: 10,
                fontWeight: 750,
                padding: "2px 6px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {overallWidthLabel} {formatDimension(overallPlanDimension.width)}
            </div>
          </Html>
          <Line
            points={[
              [overallPlanDimension.depthGuideX, overallPlanDimension.y, overallPlanBounds.top],
              [overallPlanDimension.depthGuideX, overallPlanDimension.y, overallPlanBounds.bottom],
            ]}
            color="#52525b"
            lineWidth={1.6}
            transparent
            opacity={0.72}
            raycast={() => null}
            userData={{ testId: "overall-plan-dimension-guide-depth" }}
          />
          <Line
            points={[
              [overallPlanDimension.depthGuideX - overallPlanDimension.tick, overallPlanDimension.y, overallPlanBounds.top],
              [overallPlanDimension.depthGuideX + overallPlanDimension.tick, overallPlanDimension.y, overallPlanBounds.top],
            ]}
            color="#52525b"
            lineWidth={1.6}
            transparent
            opacity={0.72}
            raycast={() => null}
          />
          <Line
            points={[
              [overallPlanDimension.depthGuideX - overallPlanDimension.tick, overallPlanDimension.y, overallPlanBounds.bottom],
              [overallPlanDimension.depthGuideX + overallPlanDimension.tick, overallPlanDimension.y, overallPlanBounds.bottom],
            ]}
            color="#52525b"
            lineWidth={1.6}
            transparent
            opacity={0.72}
            raycast={() => null}
          />
          <Html
            zIndexRange={[13, 0]}
            position={[overallPlanDimension.depthGuideX, 0.021, overallPlanDimension.centerZ]}
            center
            transform={false}
          >
            <div
              data-testid="overall-plan-dimension-depth"
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(82,82,91,0.28)",
                borderRadius: 6,
                boxShadow: "0 1px 4px rgba(15,23,42,0.1)",
                color: "#3f3f46",
                fontSize: 10,
                fontWeight: 750,
                padding: "2px 6px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {overallDepthLabel} {formatDimension(overallPlanDimension.depth)}
            </div>
          </Html>
        </group>
      )}

      {canonicalPlan && (
        <CanonicalFloorPlanWalls2D
          model={canonicalPlan}
          activeFloorId={activeFloorId}
          activeFloorLevel={activeFloorLevel}
          activeRoomId={activeRoomId}
          selectedOpeningId={selectedOverlayId}
          showOpenings={showOpenings}
          showStructures={showBuiltIns}
          interactive={interactive}
          theme={theme}
          onSelectRoom={onSelectRoom}
          onSelectWall={(wallId, roomId) => {
            if (roomId && onSelectSurfaceTarget) {
              onSelectSurfaceTarget({ kind: "wall", roomId, id: wallId });
            } else if (roomId) {
              onSelectRoom?.(roomId);
            }
          }}
          onSelectOpening={onSelectOverlay}
          onEditOpening={(
            openingId: string,
            metrics: CanonicalOpeningDragMetricsV2,
            mode
          ) => {
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
            onOverlayDragStateChange?.(
              dragging,
              mode === "resize" ? "opening_resize" : "opening"
            )
          }
        />
      )}

      {hasHouseRooms &&
        wallBandLayout.parts.map((part) => {
          const geometry = buildWallBandGeometry2D(part);
          const bandRoom = wallBandRooms.find((room) => part.roomIds.includes(room.id)) ?? null;
          const bandColor = bandRoom
            ? getHouseRoomWallPlanColor(bandRoom, part.wall, isPro)
            : isPro
              ? "#d4d4d8"
              : "#c9c2b4";
          return (
            <group
              key={part.key}
              position={[geometry.position[0], 0.0015, geometry.position[1]]}
              rotation-y={geometry.rotationY}
            >
              <mesh
                rotation-x={-Math.PI / 2}
                raycast={interactive ? undefined : () => null}
                userData={{ testId: "room-wall-band-2d" }}
                onClick={
                  interactive && bandRoom
                    ? (event) => {
                        event.stopPropagation();
                        if (onSelectSurfaceTarget) {
                          onSelectSurfaceTarget({
                            kind: "wall",
                            roomId: bandRoom.id,
                            id: part.wall,
                          });
                        } else {
                          onSelectRoom?.(bandRoom.id);
                        }
                      }
                    : undefined
                }
              >
                <planeGeometry args={geometry.size} />
                <meshBasicMaterial
                  color={bandColor}
                  transparent
                  opacity={0.96}
                  depthWrite={false}
                />
              </mesh>
            </group>
          );
        })}

      {hasHouseRooms &&
        wallBandLayout.cornerCaps.map((cap) => (
          <mesh
            key={cap.key}
            position={[cap.x, 0.0016, cap.z]}
            rotation-x={-Math.PI / 2}
            raycast={() => null}
            userData={{ testId: "room-wall-corner-cap-2d" }}
          >
            <planeGeometry args={[cap.size, cap.size]} />
            <meshBasicMaterial
              color={isPro ? "#d4d4d8" : "#c9c2b4"}
              transparent
              opacity={0.96}
              depthWrite={false}
            />
          </mesh>
        ))}

      {hasHouseRooms &&
        wallBandLayout.windowMarkers.map((marker) => {
          const geometry = buildWallBandGeometry2D(marker);
          return (
            <group
              key={marker.key}
              position={[geometry.position[0], 0.0019, geometry.position[1]]}
              rotation-y={geometry.rotationY}
            >
              <mesh
                rotation-x={-Math.PI / 2}
                raycast={() => null}
                userData={{ testId: "room-window-band-marker-2d" }}
              >
                <planeGeometry args={[geometry.size[0], Math.max(0.025, geometry.size[1] * 0.34)]} />
                <meshBasicMaterial
                  color={isPro ? "#60a5fa" : "#38bdf8"}
                  transparent
                  opacity={0.92}
                  depthWrite={false}
                />
              </mesh>
            </group>
          );
        })}

      {showZones &&
        zones.map((zone) => (
          <group key={zone.id} position={[zone.x, 0, zone.z]}>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.0012, 0]}>
              <planeGeometry args={[zone.w, zone.d]} />
              <meshBasicMaterial color={zoneFillColor} transparent opacity={0.12} />
            </mesh>
            <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, 0]} center transform={false}>
              <div
                style={{
                  fontSize: 10,
                  color: zoneLabelColor,
                  background: "rgba(255,255,255,0.82)",
                  borderRadius: 6,
                  border: "1px solid rgba(15,118,110,0.22)",
                  padding: "2px 6px",
                  pointerEvents: "none",
                }}
              >
                {zone.label}
              </div>
            </Html>
          </group>
        ))}

      {showGrid &&
        gridLines.map((line) => (
          <Line
            key={line.key}
            points={line.points}
            color={line.major ? majorGridColor : minorGridColor}
            lineWidth={line.major ? 1.1 : 0.6}
          />
        ))}

      {roomSnapPreview && (
        <group>
          <Line
            points={roomSnapPreview.points.map(([x, z]) => [x, 0.008, z])}
            color="#2563eb"
            lineWidth={4}
          />
          <Html
            zIndexRange={[12, 0]}
            position={[
              roomSnapPreview.labelPosition.x,
              0.08,
              roomSnapPreview.labelPosition.z,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="room-snap-preview"
              style={{
                border: "1px solid rgba(37,99,235,0.35)",
                borderRadius: 6,
                background: "rgba(239,246,255,0.96)",
                color: "#1d4ed8",
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
              }}
            >
              {roomSnapPreview.label}
            </div>
          </Html>
        </group>
      )}

      {visibleAdjacencyGuides.map((guide) => (
        <group key={guide.id}>
          <Line
            points={guide.points.map(([x, z]) => [x, 0.0065, z])}
            color="#22c55e"
            lineWidth={3}
          />
          {showAdjacencyLabels && (
            <Html
              zIndexRange={[8, 0]}
              position={[guide.labelPosition.x, 0.065, guide.labelPosition.z]}
              center
              transform={false}
            >
              <div
                data-testid="room-adjacency-guide"
                style={{
                  ...compactContextLabelStyle,
                  border: "1px solid rgba(34,197,94,0.22)",
                  background: "rgba(240,253,244,0.78)",
                  color: "#166534",
                  pointerEvents: "none",
                  boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
                  transform:
                    guide.orientation === "vertical"
                      ? `translate(28px, -12px) scale(${contextLabelScale})`
                      : `translateY(16px) scale(${contextLabelScale})`,
                }}
              >
                Shared wall
              </div>
            </Html>
          )}
        </group>
      ))}

      {showDoorwaySuggestionLabels && visibleDoorwaySuggestions.map((suggestion) => (
        <Html
          key={suggestion.id}
          zIndexRange={[14, 0]}
          position={(() => {
            const suggestionRoom = rooms.find((room) => room.id === suggestion.roomId);
            const uiPosition = buildDoorwaySuggestionUiPosition(
              suggestion,
              suggestionRoom,
              suggestion.roomId === activeRoomId,
              showDimensions
            );
            return [uiPosition.x, 0.095, uiPosition.z] as [number, number, number];
          })()}
          center
          transform={false}
        >
          <button
            type="button"
            data-testid="room-doorway-suggestion"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onAddDoorwaySuggestion?.(suggestion);
            }}
            style={{
              ...compactContextLabelStyle,
              border: "1px solid rgba(37,99,235,0.28)",
              background: "rgba(255,255,255,0.9)",
              color: "#1d4ed8",
              cursor: "pointer",
              pointerEvents: "auto",
              boxShadow: "0 1px 4px rgba(15,23,42,0.12)",
            }}
          >
            Doorway
          </button>
        </Html>
      ))}

      {isStraightWallDrawMode &&
        wallDrawGuideLines.map((guide) => (
          <Line
            key={guide.id}
            points={guide.points}
            color="#14b8a6"
            lineWidth={1.4}
            dashed
            dashSize={0.28}
            gapSize={0.16}
            transparent
            opacity={0.72}
          />
        ))}

      {isStraightWallDrawMode && wallDrawAlignmentCue && (
        <Html
          zIndexRange={[12, 0]}
          position={[wallDrawAlignmentCue.point.x, 0.085, wallDrawAlignmentCue.point.z + 0.24]}
          center
          transform={false}
          style={{ pointerEvents: "none" }}
        >
          <div
            data-testid="wall-draw-alignment-cue"
            style={{
              border: "1px solid rgba(20,184,166,0.32)",
              borderRadius: 999,
              background: "rgba(240,253,250,0.96)",
              color: "#0f766e",
              fontSize: 10,
              fontWeight: 800,
              padding: "2px 8px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
            }}
          >
            {wallDrawAlignmentCue.label}
          </div>
        </Html>
      )}

      {isStraightWallDrawMode && wallDrawContinuationCue && (
        <Html
          zIndexRange={[12, 0]}
          position={[wallDrawContinuationCue.point.x, 0.085, wallDrawContinuationCue.point.z - 0.24]}
          center
          transform={false}
          style={{ pointerEvents: "none" }}
        >
          <div
            data-testid="wall-draw-continuation-cue"
            style={{
              border: "1px solid rgba(37,99,235,0.26)",
              borderRadius: 999,
              background: "rgba(239,246,255,0.96)",
              color: "#1d4ed8",
              fontSize: 10,
              fontWeight: 800,
              padding: "2px 8px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
            }}
          >
            {wallDrawContinuationCue.label}
          </div>
        </Html>
      )}

      {isStraightWallDrawMode && wallDrawCloseCue && (
        <Html
          zIndexRange={[12, 0]}
          position={[wallDrawCloseCue.point.x, 0.085, wallDrawCloseCue.point.z + 0.24]}
          center
          transform={false}
          style={{ pointerEvents: "none" }}
        >
          <div
            data-testid="wall-draw-close-cue"
            style={{
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 999,
              background: "rgba(240,253,244,0.96)",
              color: "#166534",
              fontSize: 10,
              fontWeight: 800,
              padding: "2px 8px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
            }}
          >
            {wallDrawCloseCue.label}
          </div>
        </Html>
      )}

      {roomDrawGuideLines.map((guide) => (
        <Line
          key={guide.id}
          points={guide.points}
          color="#14b8a6"
          lineWidth={guide.emphasis === "strong" ? 2.1 : 1.35}
          dashed
          dashSize={guide.emphasis === "strong" ? 0.36 : 0.28}
          gapSize={guide.emphasis === "strong" ? 0.1 : 0.16}
          transparent
          opacity={guide.emphasis === "strong" ? 0.92 : 0.7}
        />
      ))}

      {rectangleGhostGuideLines.map((guide) => (
        <Line
          key={guide.id}
          points={guide.points}
          color="#22c55e"
          lineWidth={2.6}
          dashed
          dashSize={0.2}
          gapSize={0.08}
          transparent
          opacity={0.9}
        />
      ))}

      {sharedWallPreviewSegment && (
        <>
          <Line
            points={sharedWallPreviewSegment.points}
            color="#22c55e"
            lineWidth={6}
            transparent
            opacity={0.95}
          />
          <Line
            points={sharedWallPreviewSegment.points}
            color="#ffffff"
            lineWidth={2}
            transparent
            opacity={0.88}
          />
          <Html
            zIndexRange={[12, 0]}
            position={[
              sharedWallPreviewSegment.labelPosition.x,
              0.085,
              sharedWallPreviewSegment.labelPosition.z,
            ]}
            center
            transform={false}
            style={{ pointerEvents: "none" }}
          >
            <div
              data-testid="rectangle-wall-shared-wall-preview"
              style={{
                border: "1px solid rgba(34,197,94,0.38)",
                borderRadius: 999,
                background: "rgba(240,253,244,0.96)",
                color: "#166534",
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 8px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.14)",
              }}
            >
              Shared wall · {formatMillimeters(sharedWallPreviewSegment.lengthMeters)}
            </div>
          </Html>
        </>
      )}

      {roomDrawAnchorCue && (
        <Html
          zIndexRange={[12, 0]}
          position={[roomDrawAnchorCue.point.x, 0.085, roomDrawAnchorCue.point.z + 0.24]}
          center
          transform={false}
          style={{ pointerEvents: "none" }}
        >
          <div
            data-testid="rectangle-wall-anchor-cue"
            style={{
              border: "1px solid rgba(20,184,166,0.3)",
              borderRadius: 999,
              background: "rgba(240,253,250,0.96)",
              color: "#0f766e",
              fontSize: 10,
              fontWeight: 800,
              padding: "2px 8px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
            }}
          >
            {roomDrawAnchorCue.label}
          </div>
        </Html>
      )}

      {[
        ...startSnapMarkers,
        ...drawSnapMarkers,
        ...(wallDrawSnapMarker ? [wallDrawSnapMarker] : []),
        ...(sharedWallPreviewMarker ? [sharedWallPreviewMarker] : []),
      ].map((marker) => (
          <group key={marker.id} position={[marker.point.x, 0, marker.point.z]}>
            {marker.id.startsWith("start-snap-") && (
              <Html
                zIndexRange={[1, 0]}
                position={[0, 0.02, 0]}
                center
                transform={false}
                style={{ pointerEvents: "none" }}
              >
                <div
                  aria-hidden="true"
                  data-testid={`floor-plan-start-snap-${marker.label
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`}
                  data-plan-x={marker.point.x.toFixed(3)}
                  data-plan-z={marker.point.z.toFixed(3)}
                  style={{
                    width: 1,
                    height: 1,
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                />
              </Html>
            )}
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
              <circleGeometry
                args={[
                  marker.label === "Shared wall" || marker.label === "Close room"
                    ? 0.07
                    : marker.subtle
                      ? 0.038
                      : 0.055,
                  24,
                ]}
              />
              <meshBasicMaterial
                color={
                  marker.label === "Shared wall" || marker.label === "Close room"
                    ? "#22c55e"
                    : "#14b8a6"
                }
                transparent={marker.subtle}
                opacity={marker.subtle ? 0.42 : 1}
              />
            </mesh>
            {(marker.displayLabel || !marker.subtle) && (
              <Html
                zIndexRange={[12, 0]}
                position={[0, 0.075, marker.label === "Shared wall" ? 0 : -0.22]}
                center
                transform={false}
                style={{ pointerEvents: "none" }}
              >
                <div
                  data-testid="floor-plan-draw-snap-label"
                  style={{
                    border: "1px solid rgba(20,184,166,0.32)",
                    borderRadius: 999,
                    background:
                      marker.label === "Shared wall" || marker.label === "Close room"
                        ? "rgba(240,253,244,0.96)"
                        : "rgba(240,253,250,0.96)",
                    color:
                      marker.label === "Shared wall" || marker.label === "Close room"
                        ? "#166534"
                        : "#0f766e",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 7px",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
                  }}
                >
                  {marker.displayLabel ?? marker.label}
                </div>
              </Html>
            )}
          </group>
        ))}

      {canRenderWallDrawTrace && wallDrawLinePoints.length >= 2 && (
        <Line
          points={wallDrawLinePoints}
          color="#2563eb"
          lineWidth={3}
        />
      )}

      {canRenderWallDrawSegmentMeasurements &&
        onCommitWallDrawSegmentLength &&
        activeDrawRoomPoints.slice(1).map((point, offsetIndex) => {
          const segmentIndex = offsetIndex + 1;
          const previousPoint = activeDrawRoomPoints[segmentIndex - 1];
          if (!previousPoint) return null;
          if (!isWallDrawSegmentLengthRenderable(previousPoint, point)) return null;
          const midpoint = {
            x: (previousPoint.x + point.x) / 2,
            z: (previousPoint.z + point.z) / 2,
          };
          const isEditing = editingWallDrawSegment?.segmentIndex === segmentIndex;
          return (
            <Html
              key={`wall-segment-length-${segmentIndex}`}
              zIndexRange={[11, 0]}
              position={[midpoint.x, 0.066, midpoint.z]}
              center
              transform={false}
            >
              {isEditing ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#1d4ed8",
                    background: "rgba(255,255,255,0.98)",
                    border: "1px solid rgba(37,99,235,0.38)",
                    borderRadius: 8,
                    padding: "4px 8px",
                    pointerEvents: "auto",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 10px rgba(15,23,42,0.14)",
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <input
                    data-testid="wall-draw-segment-length-editor"
                    autoFocus
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_WALL_DRAW_SEGMENT_LENGTH_METERS * 1000}
                    step={1}
                    value={editingWallDrawSegment.value}
                    onChange={(event) =>
                      updateWallDrawSegmentEditorValue(event.currentTarget.value)
                    }
                    onBlur={(event) =>
                      commitWallDrawSegmentLengthEdit(event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitWallDrawSegmentLengthEdit(event.currentTarget.value);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelWallDrawSegmentLengthEdit();
                      }
                    }}
                    style={{
                      width: 76,
                      border: "none",
                      background: "transparent",
                      color: "#1d4ed8",
                      fontSize: 11,
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                  <span style={{ color: "#4b5563", fontWeight: 700 }}>mm</span>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid={`wall-draw-segment-length-${segmentIndex}`}
                  title="Click to edit wall length"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    startWallDrawSegmentLengthEdit(segmentIndex, previousPoint, point);
                  }}
                  style={{
                    border: "1px solid rgba(37,99,235,0.32)",
                    borderRadius: 5,
                    background: "rgba(255,255,255,0.94)",
                    color: "#1d4ed8",
                    cursor: "text",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "2px 7px",
                    pointerEvents: "auto",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
                  }}
                >
                  {buildWallDrawPreviewLabel(previousPoint, point)}
                </button>
              )}
            </Html>
          );
        })}

      {canRenderWallDrawTrace &&
        activeDrawRoomPoints.map((point, index) => (
          <mesh
            key={`${point.x}-${point.z}-${index}`}
            position={[point.x, 0.011, point.z]}
            rotation-x={-Math.PI / 2}
          >
            <circleGeometry args={[index === 0 ? 0.075 : 0.055, 24]} />
            <meshBasicMaterial color={index === 0 ? "#0f766e" : "#2563eb"} />
          </mesh>
        ))}

      {canRenderWallDrawTrace && lastWallDrawPoint && activeDrawRoomPreviewPoint && (
        <Html
          zIndexRange={[10, 0]}
          position={[
            (lastWallDrawPoint.x + activeDrawRoomPreviewPoint.x) / 2,
            0.06,
            (lastWallDrawPoint.z + activeDrawRoomPreviewPoint.z) / 2,
          ]}
          center
          transform={false}
        >
          <div
            data-testid="wall-draw-preview"
            style={{
              border: "1px solid rgba(20,184,166,0.4)",
              borderRadius: 5,
              background: "rgba(255,255,255,0.94)",
              color: "#0f766e",
              fontSize: 11,
              fontWeight: 800,
              padding: "2px 7px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
            }}
          >
            {buildWallDrawPreviewLabel(lastWallDrawPoint, activeDrawRoomPreviewPoint)}
          </div>
        </Html>
      )}

      {canDrawRoomOnGrid && isRectangleWallDrawMode && drawRoomLinePoints.length === 2 && (
        <Line
          points={buildRectangleLinePoints(drawRoomLinePoints)}
          color={roomDrawPreview?.rectangle === null ? "#f97316" : "#2563eb"}
          lineWidth={2}
        />
      )}

      {canDrawRoomOnGrid && isRectangleWallDrawMode && roomDrawPreview && (
        <Html
          zIndexRange={[10, 0]}
          position={[
            (roomDrawPreview.start.x + roomDrawPreview.end.x) / 2,
            0.055,
            (roomDrawPreview.start.z + roomDrawPreview.end.z) / 2,
          ]}
          center
          transform={false}
        >
          <div
            data-testid="blank-room-draw-preview"
            style={{
              border: roomDrawPreview.rectangle
                ? "1px solid rgba(37,99,235,0.3)"
                : "1px solid rgba(249,115,22,0.38)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.9)",
              color: roomDrawPreview.rectangle ? "#1d4ed8" : "#c2410c",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 7px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
            }}
          >
            {buildRoomDrawPreviewLabel(roomDrawPreview)}
          </div>
        </Html>
      )}

      {canDrawRoomOnGrid && isRectangleWallDrawMode && roomDrawPreview && (
        <>
          <Html
            zIndexRange={[11, 0]}
            position={[
              (roomDrawPreview.start.x + roomDrawPreview.end.x) / 2,
              0.06,
              roomDrawPreview.start.z - 0.22,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="rectangle-wall-draw-width"
              style={{
                border: "1px solid rgba(37,99,235,0.32)",
                borderRadius: 5,
                background: "rgba(255,255,255,0.94)",
                color: "#1d4ed8",
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 7px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
              }}
            >
              {formatMillimeters(roomDrawPreview.width)}
            </div>
          </Html>
          <Html
            zIndexRange={[11, 0]}
            position={[
              roomDrawPreview.start.x - 0.22,
              0.06,
              (roomDrawPreview.start.z + roomDrawPreview.end.z) / 2,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="rectangle-wall-draw-depth"
              style={{
                border: "1px solid rgba(37,99,235,0.32)",
                borderRadius: 5,
                background: "rgba(255,255,255,0.94)",
                color: "#1d4ed8",
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 7px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
                writingMode: "vertical-rl",
              }}
            >
              {formatMillimeters(roomDrawPreview.depth)}
            </div>
          </Html>
        </>
      )}

      {canDrawRoomOnGrid && isArcWallDrawMode && arcWallDrawPreview && (
        <>
          <Line
            points={buildArcWallLinePoints(arcWallDrawPreview)}
            color={arcWallDrawPreview.resolvedRoom ? "#2563eb" : "#f97316"}
            lineWidth={3}
          />
          <Html
            zIndexRange={[11, 0]}
            position={[
              arcWallDrawPreview.labelPosition.x,
              0.06,
              arcWallDrawPreview.labelPosition.z,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="arc-wall-draw-length"
              style={{
                border: "1px solid rgba(37,99,235,0.32)",
                borderRadius: 5,
                background: "rgba(255,255,255,0.94)",
                color: "#1d4ed8",
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 7px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
              }}
            >
              {formatMillimeters(arcWallDrawPreview.arcLengthMeters)}
            </div>
          </Html>
          <Html
            zIndexRange={[11, 0]}
            position={[
              arcWallDrawPreview.angleLabelPosition.x,
              0.06,
              arcWallDrawPreview.angleLabelPosition.z,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="arc-wall-draw-angle"
              style={{
                color: "#171717",
                fontSize: 12,
                fontWeight: 800,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px rgba(255,255,255,0.9)",
              }}
            >
              {arcWallDrawPreview.angleDeg.toFixed(1)}°
            </div>
          </Html>
        </>
      )}

      {!hasHouseRooms && (
        <Line
          points={[
            [-halfW, 0.002, -halfD],
            [halfW, 0.002, -halfD],
            [halfW, 0.002, halfD],
            [-halfW, 0.002, halfD],
            [-halfW, 0.002, -halfD],
          ]}
          color={borderColor}
          lineWidth={isPro ? 2 : 1.5}
        />
      )}

      {showOpenings && !canonicalStructureExpected &&
        openingSegments.map((seg) => (
          <group key={seg.id}>
            {buildOpeningSymbolLines(seg).map((points, lineIndex) => (
              <Line
                key={`${seg.id}-symbol-${lineIndex}`}
                points={points}
                color={seg.kind === "door" ? openingDoorColor : openingWindowColor}
                lineWidth={selectedOverlayId === seg.id ? 4 : 3.2}
              />
            ))}
            {selectedOverlayId === seg.id && (
              <>
                <Line
                  points={seg.points.map(([x, y, z]) => [x, y + 0.001, z])}
                  color="#f97316"
                  lineWidth={9}
                  transparent
                  opacity={0.55}
                />
                {seg.points.map((point, index) => (
                  <group
                    key={`${seg.id}-endpoint-${index}`}
                    position={[point[0], 0.006, point[2]]}
                    rotation-x={-Math.PI / 2}
                    onPointerDown={(event) => {
                      stopNativeRoomDragEvent(event);
                      const opening = openings.find((entry) => entry.id === seg.id);
                      if (!opening) return;
                      const fixedPoint = seg.points[index === 0 ? 1 : 0];
                      onSelectOverlay?.(seg.id);
                      dragTargetRef.current = {
                        kind: "opening_resize",
                        id: seg.id,
                        fixedAxis: getOpeningAxisValue(opening, {
                          x: fixedPoint[0],
                          z: fixedPoint[2],
                        }),
                      };
                      document.body.style.cursor = getOpeningResizeCursor(seg.wall);
                      onOverlayDragStateChange?.(true, "opening_resize");
                      setPointerCaptureIfSupported(event);
                    }}
                    onPointerMove={(event) => {
                      const drag = dragTargetRef.current;
                      if (!drag || drag.kind !== "opening_resize" || drag.id !== seg.id) return;
                      if (pointerDragWasReleased(event)) {
                        clearActiveDrag();
                        releasePointerCaptureIfSupported(event);
                        return;
                      }
                      stopNativeRoomDragEvent(event);
                      const opening = openings.find((entry) => entry.id === seg.id);
                      if (!opening) return;
                      handleOpeningResize(opening, drag.fixedAxis, event);
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      const drag = dragTargetRef.current;
                      if (drag?.kind === "opening_resize" && drag.id === seg.id) {
                        clearActiveDrag();
                      }
                      releasePointerCaptureIfSupported(event);
                    }}
                    onPointerCancel={(event) => {
                      clearActiveDrag();
                      releasePointerCaptureIfSupported(event);
                    }}
                    onPointerOver={(event) => {
                      event.stopPropagation();
                      document.body.style.cursor = getOpeningResizeCursor(seg.wall);
                    }}
                    onPointerOut={(event) => {
                      event.stopPropagation();
                      if (dragTargetRef.current?.id !== seg.id) document.body.style.cursor = "";
                    }}
                  >
                    <mesh
                      userData={{
                        testId: index === 0 ? "selected-opening-start-handle" : "selected-opening-end-handle",
                      }}
                    >
                      <circleGeometry args={[0.105, 24]} />
                      <meshBasicMaterial color="#f97316" />
                    </mesh>
                    <mesh position={[0, 0, 0.001]}>
                      <circleGeometry args={[0.064, 24]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                  </group>
                ))}
              </>
            )}
            {selectedOverlayId === seg.id && (
              <Html
                zIndexRange={[11, 0]}
                position={seg.labelPosition}
                center
                transform={false}
                style={{ pointerEvents: "none" }}
              >
                <div
                  data-testid="plan-opening-live-label"
                  style={{
                    alignItems: "center",
                    border: "1px solid rgba(249,115,22,0.36)",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.94)",
                    color: "#c2410c",
                    display: "flex",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "3px 7px",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
                  }}
                >
                  <span>
                    {openingDisplayName(seg)} {formatDimension(seg.width)}
                    {" · "}
                    {seg.wall} {formatDimension(seg.offset)}
                  </span>
                </div>
              </Html>
            )}
            {interactive && seg.doorStyle !== "open" && (
              <>
                <mesh
                  userData={{ testId: "selected-opening-hit-target" }}
                  position={seg.center}
                  rotation-x={-Math.PI / 2}
                  onPointerDown={(event) => {
                    if (startOpeningMoveDrag(seg.id, event)) {
                      document.body.style.cursor = "grabbing";
                    }
                  }}
                  onPointerMove={(event) => {
                    const drag = dragTargetRef.current;
                    if (!drag || drag.kind !== "opening" || drag.id !== seg.id) return;
                    if (pointerDragWasReleased(event)) {
                      clearActiveDrag();
                      releasePointerCaptureIfSupported(event);
                      return;
                    }
                    stopNativeRoomDragEvent(event);
                    const opening = openings.find((entry) => entry.id === seg.id);
                    if (!opening) return;
                    handleOpeningMove(opening, event, drag.grabOffset);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    const drag = dragTargetRef.current;
                    if (drag?.kind === "opening" && drag.id === seg.id) {
                      clearActiveDrag();
                    }
                    releasePointerCaptureIfSupported(event);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectOverlay?.(seg.id);
                  }}
                  onPointerCancel={(event) => {
                    clearActiveDrag();
                    releasePointerCaptureIfSupported(event);
                  }}
                  onPointerOver={(event) => {
                    event.stopPropagation();
                    document.body.style.cursor = "grab";
                  }}
                  onPointerOut={(event) => {
                    event.stopPropagation();
                    if (dragTargetRef.current?.id !== seg.id) document.body.style.cursor = "";
                  }}
                >
                  <planeGeometry args={seg.hitSize} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
                <mesh
                  userData={{ testId: "selected-opening-center-handle" }}
                  position={[seg.center[0], 0.0065, seg.center[2]]}
                  rotation-x={-Math.PI / 2}
                  onPointerDown={(event) => {
                    if (startOpeningMoveDrag(seg.id, event)) {
                      document.body.style.cursor = "grabbing";
                    }
                  }}
                  onPointerMove={(event) => {
                    const drag = dragTargetRef.current;
                    if (!drag || drag.kind !== "opening" || drag.id !== seg.id) return;
                    if (pointerDragWasReleased(event)) {
                      clearActiveDrag();
                      releasePointerCaptureIfSupported(event);
                      return;
                    }
                    stopNativeRoomDragEvent(event);
                    const opening = openings.find((entry) => entry.id === seg.id);
                    if (!opening) return;
                    handleOpeningMove(opening, event, drag.grabOffset);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    const drag = dragTargetRef.current;
                    if (drag?.kind === "opening" && drag.id === seg.id) {
                      clearActiveDrag();
                    }
                    releasePointerCaptureIfSupported(event);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectOverlay?.(seg.id);
                  }}
                  onPointerCancel={(event) => {
                    clearActiveDrag();
                    releasePointerCaptureIfSupported(event);
                  }}
                  onPointerOver={(event) => {
                    event.stopPropagation();
                    document.body.style.cursor = "grab";
                  }}
                  onPointerOut={(event) => {
                    event.stopPropagation();
                    if (dragTargetRef.current?.id !== seg.id) document.body.style.cursor = "";
                  }}
                >
                  <planeGeometry
                    args={
                      seg.wall === "north" || seg.wall === "south"
                        ? selectedOverlayId === seg.id
                          ? [0.28, 0.14]
                          : [0.22, 0.11]
                        : selectedOverlayId === seg.id
                          ? [0.14, 0.28]
                          : [0.11, 0.22]
                    }
                  />
                  <meshBasicMaterial
                    color={selectedOverlayId === seg.id ? "#2563eb" : "#3b82f6"}
                    transparent
                    opacity={selectedOverlayId === seg.id ? 0.96 : 0.82}
                  />
                </mesh>
              </>
            )}
          </group>
        ))}

      {canTraceOpeningOnGrid && openingPreview && (
        <>
          {openingPreviewWallGuide && (
            <>
              <Line
                points={openingPreviewWallGuide.points}
                color={openingPreview.status === "valid" ? "#0f766e" : "#f97316"}
                lineWidth={2}
                transparent
                opacity={openingPreview.status === "valid" ? 0.55 : 0.72}
              />
              <Html
                zIndexRange={[11, 0]}
                position={[
                  openingPreviewWallGuide.labelPosition.x,
                  0.072,
                  openingPreviewWallGuide.labelPosition.z,
                ]}
                center
                transform={false}
                style={{ pointerEvents: "none" }}
              >
                <div
                  data-testid="blank-plan-opening-wall-guide"
                  style={{
                    border:
                      openingPreview.status === "valid"
                        ? "1px solid rgba(15,118,110,0.28)"
                        : "1px solid rgba(249,115,22,0.34)",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.94)",
                    color: openingPreview.status === "valid" ? "#0f766e" : "#c2410c",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 8px",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
                  }}
                >
                  {openingPreviewWallGuide.label}
                </div>
              </Html>
            </>
          )}
          <Line
            points={openingPreview.segment.map((point) => [point.x, 0.0062, point.z])}
            color={openingPreview.status === "valid" ? "#0f766e" : "#f97316"}
            lineWidth={7}
            transparent
            opacity={openingPreview.status === "valid" ? 0.92 : 0.82}
          />
          <Line
            points={openingPreview.segment.map((point) => [point.x, 0.0067, point.z])}
            color="#ffffff"
            lineWidth={2.1}
            transparent
            opacity={openingPreview.status === "valid" ? 0.9 : 0.7}
          />
          {openingPreview.segment.map((point, index) => (
            <mesh
              key={`opening-preview-endpoint-${index}`}
              position={[point.x, 0.008, point.z]}
              rotation-x={-Math.PI / 2}
            >
              <circleGeometry args={[0.065, 20]} />
              <meshBasicMaterial
                color={openingPreview.status === "valid" ? "#0f766e" : "#f97316"}
                transparent
                opacity={0.95}
              />
            </mesh>
          ))}
          <Html
            zIndexRange={[12, 0]}
            position={[
              openingPreview.labelPosition.x,
              0.075,
              openingPreview.labelPosition.z,
            ]}
            center
            transform={false}
            style={{ pointerEvents: "none" }}
          >
            <div
              data-testid="blank-plan-opening-snap-preview"
              style={{
                border:
                  openingPreview.status === "valid"
                    ? "1px solid rgba(15,118,110,0.32)"
                    : "1px solid rgba(249,115,22,0.38)",
                borderRadius: 6,
                background: "rgba(255,255,255,0.94)",
                color: openingPreview.status === "valid" ? "#0f766e" : "#c2410c",
                fontSize: 11,
                fontWeight: 800,
                padding: openingPreviewHelpText ? "5px 8px" : "3px 7px",
                pointerEvents: "none",
                textAlign: "center",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
              }}
            >
              <div>{openingPreview.label}</div>
              {openingPreviewDetailText && (
                <div
                  data-testid="blank-plan-opening-snap-detail"
                  style={{
                    color: openingPreview.status === "valid" ? "#047857" : "#9a3412",
                    fontSize: 10,
                    fontWeight: 700,
                    marginTop: 2,
                  }}
                >
                  {openingPreviewDetailText}
                </div>
              )}
              {openingPreviewHelpText && (
                <div
                  data-testid="blank-plan-opening-error-detail"
                  style={{
                    color: "#9a3412",
                    fontSize: 10,
                    fontWeight: 700,
                    marginTop: 2,
                  }}
                >
                  {openingPreviewHelpText}
                </div>
              )}
            </div>
          </Html>
        </>
      )}

      {showBuiltIns &&
        fixedElements.map((fixed) => {
          const isReferenceZone = fixed.kind === "reference_zone";
          return (
            <group
            key={fixed.id}
            position={[fixed.x, 0, fixed.z]}
            onClick={(event) => {
              if (fixed.locked) return;
              event.stopPropagation();
              onSelectOverlay?.(fixed.id);
            }}
          >
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.0016, 0]}>
              <planeGeometry args={[fixed.w, fixed.d]} />
              <meshBasicMaterial
                color={isReferenceZone ? "#e5e7eb" : isPro ? "#d7d7d7" : "#e2ddd3"}
                transparent
                opacity={isReferenceZone ? 0.5 : 0.85}
              />
            </mesh>
            {(isReferenceZone || selectedOverlayId === fixed.id) && (
              <Line
                points={[
                  [-fixed.w / 2, 0.004, -fixed.d / 2],
                  [fixed.w / 2, 0.004, -fixed.d / 2],
                  [fixed.w / 2, 0.004, fixed.d / 2],
                  [-fixed.w / 2, 0.004, fixed.d / 2],
                  [-fixed.w / 2, 0.004, -fixed.d / 2],
                ]}
                color={selectedOverlayId === fixed.id ? "#f97316" : "#9ca3af"}
                lineWidth={selectedOverlayId === fixed.id ? 3 : 1.5}
              />
            )}
            {interactive && !fixed.locked && (
              <mesh
                rotation-x={-Math.PI / 2}
                position={[0, 0.003, 0]}
                onPointerDown={(event) => {
                  stopNativeRoomDragEvent(event);
                  onSelectOverlay?.(fixed.id);
                  dragTargetRef.current = {
                    kind: "fixed",
                    id: fixed.id,
                    width: fixed.w,
                    depth: fixed.d,
                  };
                  onOverlayDragStateChange?.(true, "fixed");
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  const drag = dragTargetRef.current;
                  if (!drag || drag.kind !== "fixed" || drag.id !== fixed.id) return;
                  if (pointerDragWasReleased(event)) {
                    clearActiveDrag();
                    releasePointerCaptureIfSupported(event);
                    return;
                  }
                  stopNativeRoomDragEvent(event);
                  handleFixedMove(fixed, event, drag.width, drag.depth);
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  const drag = dragTargetRef.current;
                  if (drag?.kind === "fixed" && drag.id === fixed.id) {
                    clearActiveDrag();
                  }
                  releasePointerCaptureIfSupported(event);
                }}
                onPointerCancel={(event) => {
                  clearActiveDrag();
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <planeGeometry args={[fixed.w, fixed.d]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
            {interactive && (showLabels || selectedOverlayId === fixed.id) && (
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.0032, 0]}>
                <circleGeometry args={[selectedOverlayId === fixed.id ? 0.065 : 0.05, 20]} />
                <meshBasicMaterial color={selectedOverlayId === fixed.id ? "#f97316" : "#9ca3af"} />
              </mesh>
            )}
            {fixed.label && (isReferenceZone || showLabels || selectedOverlayId === fixed.id) && (
              <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, 0]} center transform={false}>
                <div
                  style={{
                    fontSize: 10,
                    background: "rgba(255,255,255,0.88)",
                    border: "1px solid rgba(100,100,100,0.25)",
                    borderRadius: 5,
                    padding: "1px 5px",
                    pointerEvents: "none",
                  }}
                >
                  {fixed.label}
                </div>
              </Html>
            )}
            </group>
          );
        })}

      {showAnnotations &&
        annotations.map((note) => (
          <group
            key={note.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelectOverlay?.(note.id);
            }}
          >
            {note.kind === "callout" &&
              note.anchorX !== undefined &&
              note.anchorZ !== undefined && (
                <>
                  <Line
                    points={[
                      [note.anchorX, 0.0025, note.anchorZ],
                      [note.x, 0.0025, note.z],
                    ]}
                    color="#374151"
                    lineWidth={1.2}
                  />
                  <mesh rotation-x={-Math.PI / 2} position={[note.anchorX, 0.0028, note.anchorZ]}>
                    <circleGeometry args={[0.018, 16]} />
                    <meshBasicMaterial color="#374151" />
                  </mesh>
                </>
              )}

            {interactive && (
              <mesh
                rotation-x={-Math.PI / 2}
                position={[note.x, 0.003, note.z]}
                onPointerDown={(event) => {
                  stopNativeRoomDragEvent(event);
                  onSelectOverlay?.(note.id);
                  dragTargetRef.current = { kind: "annotation", id: note.id };
                  onOverlayDragStateChange?.(true, "annotation");
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  const drag = dragTargetRef.current;
                  if (!drag || drag.kind !== "annotation" || drag.id !== note.id) return;
                  if (pointerDragWasReleased(event)) {
                    clearActiveDrag();
                    releasePointerCaptureIfSupported(event);
                    return;
                  }
                  stopNativeRoomDragEvent(event);
                  handleAnnotationMove(note, event);
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  const drag = dragTargetRef.current;
                  if (drag?.kind === "annotation" && drag.id === note.id) {
                    clearActiveDrag();
                  }
                  releasePointerCaptureIfSupported(event);
                }}
                onPointerCancel={(event) => {
                  clearActiveDrag();
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <circleGeometry args={[selectedOverlayId === note.id ? 0.07 : 0.05, 20]} />
                <meshBasicMaterial
                  color="#f97316"
                  transparent
                  opacity={selectedOverlayId === note.id ? 0.28 : 0}
                  depthWrite={false}
                />
              </mesh>
            )}

            <Html zIndexRange={htmlZIndexRange} position={[note.x, 0.01, note.z]} center transform={false}>
              <div
                style={{
                  fontSize: note.kind === "room_tag" ? 12 : 11,
                  fontWeight: note.kind === "room_tag" ? 700 : 500,
                  letterSpacing: note.kind === "room_tag" ? 0.2 : 0,
                  color: note.kind === "room_tag" ? "#0f172a" : "#1f2937",
                  background: "rgba(255,255,255,0.92)",
                  border:
                    note.kind === "callout"
                      ? "1px solid rgba(55,65,81,0.45)"
                      : note.kind === "room_tag"
                        ? "1px solid rgba(15,23,42,0.35)"
                        : "1px dashed rgba(31,41,55,0.45)",
                  borderRadius: note.kind === "room_tag" ? 4 : 6,
                  padding: note.kind === "room_tag" ? "2px 8px" : "2px 6px",
                  pointerEvents: "none",
                }}
              >
                {note.text}
              </div>
            </Html>
          </group>
        ))}
    </group>
  );
}
