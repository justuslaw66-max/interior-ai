"use client";

import { Html, Line } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { FloorPlanDrawRoomMode, FloorPlanPoint } from "@/lib/floor-plan-types";
import type { RoomType } from "@/lib/room-types";
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
  resolveHouseRoomSnapPreview,
  type HouseRoomDoorwaySuggestion,
  type HouseRoomSnapPreview,
} from "@/lib/design-page-house-plan";

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
  kind: "door" | "window";
};

type FixedElement2D = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label?: string;
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
  x: number;
  z: number;
  w: number;
  d: number;
};

type RoomResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";

const DRAW_WORKSPACE_MIN_SIZE_METERS = 60;
const DRAW_WORKSPACE_PADDING_METERS = 20;
const DRAW_SNAP_VISUAL_EPSILON_METERS = 0.01;

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

type RoomRenderer2DProps = {
  width: number;
  depth: number;
  measurementUnit?: "mm" | "cm" | "in";
  showGrid?: boolean;
  showDimensions?: boolean;
  showOpenings?: boolean;
  showBuiltIns?: boolean;
  showAnnotations?: boolean;
  showZones?: boolean;
  theme?: "consumer" | "pro";
  gridStep?: number;
  openings?: Opening2D[];
  fixedElements?: FixedElement2D[];
  annotations?: Annotation2D[];
  zones?: RectZone[];
  rooms?: HouseRoom2D[];
  activeRoomId?: string | null;
  onSelectRoom?: (roomId: string) => void;
  onMoveRoom?: (roomId: string, x: number, z: number) => void;
  onResizeRoom?: (roomId: string, next: { x: number; z: number; w: number; d: number }) => void;
  interactive?: boolean;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onMoveOpening?: (id: string, offset: number) => void;
  onMoveFixedElement?: (id: string, x: number, z: number) => void;
  onMoveAnnotation?: (id: string, x: number, z: number) => void;
  onAddDoorwaySuggestion?: (suggestion: HouseRoomDoorwaySuggestion) => void;
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

const buildRoomShapeGeometry = (room: HouseRoom2D) => {
  const points = getRoomOutlinePoints(room);
  const shape = new THREE.Shape();
  const [firstX, firstZ] = points[0];
  shape.moveTo(firstX, -firstZ);

  for (const [x, z] of points.slice(1, -1)) {
    shape.lineTo(x, -z);
  }

  shape.closePath();
  return shape;
};

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

export default function RoomRenderer2D({
  width,
  depth,
  measurementUnit = "mm",
  showGrid = true,
  showDimensions = true,
  showOpenings = true,
  showBuiltIns = true,
  showAnnotations = true,
  showZones = true,
  theme = "consumer",
  gridStep = 0.5,
  openings = [],
  fixedElements = [],
  annotations = [],
  zones = [],
  rooms = [],
  activeRoomId = null,
  onSelectRoom,
  onMoveRoom,
  onResizeRoom,
  interactive = false,
  selectedOverlayId = null,
  onSelectOverlay,
  onMoveOpening,
  onMoveFixedElement,
  onMoveAnnotation,
  onAddDoorwaySuggestion,
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
}: RoomRenderer2DProps) {
  const htmlZIndexRange: [number, number] = [5, 0];
  const { camera, gl } = useThree();

  const halfW = width / 2;
  const halfD = depth / 2;
  const isPro = theme === "pro";
  const hasHouseRooms = rooms.length > 1;
  const canEditPlan = interactive && !drawRoomMode && !traceOpeningMode;
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

  const floorColor = isPro ? "#ffffff" : "#f4f2ed";
  const borderColor = isPro ? "#111111" : "#9a9a9a";
  const minorGridColor = isPro ? "#e1e1e1" : "#d8d8d8";
  const majorGridColor = isPro ? "#c4c4c4" : "#c8c8c8";
  const zoneFillColor = isPro ? "#0f766e" : "#0ea5a0";
  const zoneLabelColor = isPro ? "#115e59" : "#0f766e";
  const roomFillColor = isPro ? "#ffffff" : "#f6efe2";
  const inactiveRoomFillColor = isPro ? "#fafafa" : "#f3dfbd";
  const activeRoomBorderColor = "#22c55e";
  const openingDoorColor = isPro ? "#0b3b6f" : "#1d4ed8";
  const openingWindowColor = isPro ? "#0f766e" : "#0f766e";
  const snapThreshold = 0.12;
  const dragTargetRef = useRef<
    | null
    | { kind: "opening"; id: string }
    | { kind: "fixed"; id: string; width: number; depth: number }
    | { kind: "annotation"; id: string }
    | { kind: "room"; id: string; grabOffsetX: number; grabOffsetZ: number }
  >(null);
  const roomDrawDragStartRef = useRef<FloorPlanPoint | null>(null);
  const roomDrawLatestPointRef = useRef<FloorPlanPoint | null>(null);
  const roomDrawDragMovedRef = useRef(false);
  const nativeRoomDrawPointerIdsRef = useRef<Set<number>>(new Set());
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

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
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
    isStraightWallDrawMode && activeDrawRoomPoints.length > 0
      ? activeDrawRoomPoints[activeDrawRoomPoints.length - 1]
      : null;
  const wallDrawLinePoints = isStraightWallDrawMode
    ? buildWallDrawLinePoints(activeDrawRoomPoints, activeDrawRoomPreviewPoint)
    : [];
  const wallDrawGuideLines = isStraightWallDrawMode
      ? buildWallDrawGuideLines(
        lastWallDrawPoint,
        activeDrawRoomPreviewPoint,
        rooms,
        drawSurfaceWidth,
        drawSurfaceDepth
      )
    : [];
  const wallDrawAlignmentCue = isStraightWallDrawMode
    ? buildWallDrawAlignmentCue(lastWallDrawPoint, activeDrawRoomPreviewPoint, rooms)
    : null;
  const wallDrawContinuationCue =
    isStraightWallDrawMode && activeDrawRoomPoints.length > 0
      ? buildWallDrawContinuationCue(activeDrawRoomPoints[activeDrawRoomPoints.length - 1], rooms)
      : null;
  const wallDrawCloseCue =
    isStraightWallDrawMode
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
  const visibleAdjacencyGuides = useMemo(() => {
    if (rooms.length < 2) return [];
    const guides = buildHouseRoomAdjacencyGuides(rooms);
    return activeRoomId
      ? guides.filter((guide) => guide.roomIds.includes(activeRoomId))
      : guides;
  }, [activeRoomId, rooms]);
  const visibleDoorwaySuggestions = useMemo(() => {
    if (!onAddDoorwaySuggestion || rooms.length < 2) return [];
    return buildHouseRoomDoorwaySuggestions(rooms, activeRoomId).filter(
      (suggestion) =>
        !openings.some(
          (opening) =>
            opening.kind === "door" &&
            opening.roomId === suggestion.roomId &&
            opening.wall === suggestion.wall &&
            Math.abs(opening.offset - suggestion.offsetMeters) <=
              Math.max(0.15, suggestion.widthMeters / 2)
        )
    );
  }, [activeRoomId, onAddDoorwaySuggestion, openings, rooms]);
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

  useEffect(() => {
    if (!canTraceOpeningOnGrid) return;

    const canvas = gl.domElement;
    const handleNativePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      if (!point) return;

      event.preventDefault();
      event.stopPropagation();
      commitOpeningTracePoint(point);
    };

    canvas.addEventListener("pointerdown", handleNativePointerDown, { capture: true });
    return () => canvas.removeEventListener("pointerdown", handleNativePointerDown, { capture: true });
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
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp, { once: true });
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

  const getOpeningRoom = (opening: Opening2D) =>
    opening.roomId ? rooms.find((room) => room.id === opening.roomId) : undefined;

  const handleOpeningMove = (opening: Opening2D, event: ThreeEvent<PointerEvent>) => {
    if (!onMoveOpening) return;
    const openingRoom = getOpeningRoom(opening);
    const span =
      opening.wall === "north" || opening.wall === "south"
        ? openingRoom?.w ?? width
        : openingRoom?.d ?? depth;
    const maxOffset = span / 2 - opening.width / 2 - 0.03;
    const rawOffset =
      opening.wall === "north" || opening.wall === "south"
        ? event.point.x - (openingRoom?.x ?? 0)
        : event.point.z - (openingRoom?.z ?? 0);
    const nextOffset = clamp(rawOffset, -maxOffset, maxOffset);
    onMoveOpening(opening.id, nextOffset);
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
    onSelectRoom?.(room.id);

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
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaZ = (moveEvent.clientY - startY) / zoom;
      resizeRoomFromEdges(room, handle, edges, deltaX, deltaZ);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
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
    const epsilon = 1e-6;

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

  const openingSegments = openings.map((o) => {
    const openingRoom = getOpeningRoom(o);
    const centerX = openingRoom?.x ?? 0;
    const centerZ = openingRoom?.z ?? 0;
    const openingHalfW = (openingRoom?.w ?? width) / 2;
    const openingHalfD = (openingRoom?.d ?? depth) / 2;

    if (o.wall === "north" || o.wall === "south") {
      const z = centerZ + (o.wall === "north" ? -openingHalfD : openingHalfD);
      const x0 = centerX + o.offset - o.width / 2;
      const x1 = centerX + o.offset + o.width / 2;
      return {
        id: o.id,
        kind: o.kind,
        wall: o.wall,
        offset: o.offset,
        width: o.width,
        points: [
          [x0, 0.0022, z] as [number, number, number],
          [x1, 0.0022, z] as [number, number, number],
        ],
      };
    }
    const x = centerX + (o.wall === "west" ? -openingHalfW : openingHalfW);
    const z0 = centerZ + o.offset - o.width / 2;
    const z1 = centerZ + o.offset + o.width / 2;
    return {
      id: o.id,
      kind: o.kind,
      wall: o.wall,
      offset: o.offset,
      width: o.width,
      points: [
        [x, 0.0022, z0] as [number, number, number],
        [x, 0.0022, z1] as [number, number, number],
      ],
    };
  });

  return (
    <group>
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
          return (
            <group key={room.id} position={[room.x, 0, room.z]}>
              <mesh
                rotation-x={-Math.PI / 2}
                position={[0, 0.0007, 0]}
                onPointerDown={(event) => {
                  if (canTraceOpeningOnGrid) {
                    handleOpeningTraceCommit(event);
                    return;
                  }
                  if (canDrawRoomOnGrid) {
                    handleRoomDrawPointerDown(event);
                    return;
                  }
                  if (!canEditPlan || !onMoveRoom) return;
                  event.stopPropagation();
                  onSelectRoom?.(room.id);
                  dragTargetRef.current = {
                    kind: "room",
                    id: room.id,
                    grabOffsetX: event.point.x - room.x,
                    grabOffsetZ: event.point.z - room.z,
                  };
                  setRoomSnapPreview(null);
                  setPointerCaptureIfSupported(event);
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
                  event.stopPropagation();
                  const nextX = event.point.x - drag.grabOffsetX;
                  const nextZ = event.point.z - drag.grabOffsetZ;
                  setRoomSnapPreview(resolveHouseRoomSnapPreview(room.id, nextX, nextZ, rooms));
                  onMoveRoom?.(room.id, nextX, nextZ);
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
                    dragTargetRef.current = null;
                  }
                  setRoomSnapPreview(null);
                  releasePointerCaptureIfSupported(event);
                }}
                onPointerOut={handleOpeningTracePointerOut}
                onClick={(event) => {
                  if (canTraceOpeningOnGrid) {
                    handleOpeningTraceCommit(event);
                    return;
                  }
                  if (canDrawRoomOnGrid) {
                    event.stopPropagation();
                    return;
                  }
                  event.stopPropagation();
                  onSelectRoom?.(room.id);
                }}
              >
                <shapeGeometry args={[buildRoomShapeGeometry(room)]} />
                <meshBasicMaterial color={isActiveRoom ? roomFillColor : inactiveRoomFillColor} />
              </mesh>
              <Line
                points={getRoomOutlinePoints(room).map(([x, z]) => [x, 0.0026, z])}
                color={isActiveRoom ? activeRoomBorderColor : borderColor}
                lineWidth={isActiveRoom ? 3 : 1.5}
              />
              <Html zIndexRange={htmlZIndexRange} position={[0, 0.012, 0]} center transform={false}>
                <div
                  data-testid="house-room-2d-label"
                  data-room-id={room.id}
                  data-active={isActiveRoom ? "true" : "false"}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isActiveRoom ? "#166534" : "#525252",
                    background: "rgba(255,255,255,0.78)",
                    border: isActiveRoom ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(82,82,82,0.18)",
                    borderRadius: 4,
                    padding: "2px 7px",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {room.name}
                </div>
              </Html>

              {isActiveRoom && showDimensions && (
                <>
                  <Html
                    zIndexRange={htmlZIndexRange}
                    position={[0, 0.018, -room.d / 2]}
                    center
                    transform={false}
                  >
                    {editingRoomDimension?.roomId === room.id &&
                    editingRoomDimension.axis === "width" ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#166534",
                          background: "rgba(255,255,255,0.98)",
                          border: "1px solid rgba(34,197,94,0.4)",
                          borderRadius: 8,
                          padding: "4px 8px",
                          pointerEvents: "auto",
                          whiteSpace: "nowrap",
                          boxShadow: "0 2px 10px rgba(15,23,42,0.14)",
                          transform: "translateY(-30px)",
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <span>W</span>
                        <input
                          data-testid="active-room-dimension-editor-width"
                          autoFocus
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          defaultValue={editingRoomDimension.value}
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
                            width: 72,
                            border: "none",
                            background: "transparent",
                            color: "#166534",
                            fontSize: 11,
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
                      title="Double-click to edit width"
                      onPointerDown={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        startDimensionEdit(room, "width");
                      }}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#166534",
                        background: "rgba(240,253,244,0.96)",
                        border: "1px solid rgba(34,197,94,0.36)",
                        borderRadius: 6,
                        padding: "2px 7px",
                        pointerEvents: canEditPlan && onCommitRoomDimensionEdit ? "auto" : "none",
                        whiteSpace: "nowrap",
                        boxShadow: "0 1px 4px rgba(15,23,42,0.12)",
                        cursor: canEditPlan && onCommitRoomDimensionEdit ? "text" : "default",
                        transform: "translateY(-30px)",
                      }}
                    >
                      W {formatDimension(room.w)}
                    </button>
                    )}
                  </Html>
                  <Html
                    zIndexRange={htmlZIndexRange}
                    position={[-room.w / 2, 0.018, 0]}
                    center
                    transform={false}
                  >
                    {editingRoomDimension?.roomId === room.id &&
                    editingRoomDimension.axis === "depth" ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#166534",
                          background: "rgba(255,255,255,0.98)",
                          border: "1px solid rgba(34,197,94,0.4)",
                          borderRadius: 8,
                          padding: "4px 8px",
                          pointerEvents: "auto",
                          whiteSpace: "nowrap",
                          boxShadow: "0 2px 10px rgba(15,23,42,0.14)",
                          transform: "translate(-58px, 28px)",
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <span>D</span>
                        <input
                          data-testid="active-room-dimension-editor-depth"
                          autoFocus
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          defaultValue={editingRoomDimension.value}
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
                            width: 72,
                            border: "none",
                            background: "transparent",
                            color: "#166534",
                            fontSize: 11,
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
                      title="Double-click to edit depth"
                      onPointerDown={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        startDimensionEdit(room, "depth");
                      }}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#166534",
                        background: "rgba(240,253,244,0.96)",
                        border: "1px solid rgba(34,197,94,0.36)",
                        borderRadius: 6,
                        padding: "2px 7px",
                        pointerEvents: canEditPlan && onCommitRoomDimensionEdit ? "auto" : "none",
                        whiteSpace: "nowrap",
                        boxShadow: "0 1px 4px rgba(15,23,42,0.12)",
                        cursor: canEditPlan && onCommitRoomDimensionEdit ? "text" : "default",
                        transform: "translate(-58px, 28px)",
                      }}
                    >
                      D {formatDimension(room.d)}
                    </button>
                    )}
                  </Html>
                </>
              )}

              {isActiveRoom &&
                canEditPlan &&
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
                          width: handle.shape === "edge-z" ? 10 : handle.shape === "edge-x" ? 34 : 18,
                          height: handle.shape === "edge-z" ? 34 : handle.shape === "edge-x" ? 10 : 18,
                          borderRadius: handle.shape === "corner" ? 3 : 999,
                          background: "#22c55e",
                          border: "1px solid rgba(21,128,61,0.75)",
                          cursor: handle.cursor,
                          pointerEvents: "auto",
                          boxShadow: "0 1px 4px rgba(15,23,42,0.22)",
                          touchAction: "none",
                          userSelect: "none",
                        }}
                      />
                    </Html>
                  </group>
                ))}
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
          <Html
            zIndexRange={[8, 0]}
            position={[guide.labelPosition.x, 0.065, guide.labelPosition.z]}
            center
            transform={false}
          >
            <div
              data-testid="room-adjacency-guide"
              style={{
                border: "1px solid rgba(34,197,94,0.32)",
                borderRadius: 6,
                background: "rgba(240,253,244,0.94)",
                color: "#166534",
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.1)",
                transform:
                  guide.orientation === "vertical"
                    ? "translate(48px, -18px)"
                    : "translateY(28px)",
              }}
            >
              Shared wall
            </div>
          </Html>
        </group>
      ))}

      {visibleDoorwaySuggestions.map((suggestion) => (
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
              border: "1px solid rgba(37,99,235,0.35)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.96)",
              color: "#1d4ed8",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 800,
              padding: "3px 7px",
              pointerEvents: "auto",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 6px rgba(15,23,42,0.16)",
            }}
          >
            {suggestion.label}
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

      {isStraightWallDrawMode && wallDrawLinePoints.length >= 2 && (
        <Line
          points={wallDrawLinePoints}
          color="#2563eb"
          lineWidth={3}
        />
      )}

      {isStraightWallDrawMode &&
        onCommitWallDrawSegmentLength &&
        activeDrawRoomPoints.slice(1).map((point, offsetIndex) => {
          const segmentIndex = offsetIndex + 1;
          const previousPoint = activeDrawRoomPoints[segmentIndex - 1];
          if (!previousPoint) return null;
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
                    step={1}
                    defaultValue={editingWallDrawSegment.value}
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
                  title="Double-click to edit wall length"
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => {
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

      {isStraightWallDrawMode &&
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

      {isStraightWallDrawMode && lastWallDrawPoint && activeDrawRoomPreviewPoint && (
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

      {showOpenings &&
        openingSegments.map((seg) => (
          <group key={seg.id}>
            <Line
              points={seg.points}
              color={seg.kind === "door" ? openingDoorColor : openingWindowColor}
              lineWidth={selectedOverlayId === seg.id ? 3 : 2.2}
            />
            {selectedOverlayId === seg.id && (
              <Html
                zIndexRange={[11, 0]}
                position={[
                  (seg.points[0][0] + seg.points[1][0]) / 2,
                  0.07,
                  (seg.points[0][2] + seg.points[1][2]) / 2,
                ]}
                center
                transform={false}
                style={{ pointerEvents: "none" }}
              >
                <div
                  data-testid="plan-opening-live-label"
                  style={{
                    border: "1px solid rgba(15,118,110,0.28)",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.94)",
                    color: "#0f766e",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "3px 7px",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
                  }}
                >
                  {seg.kind === "door" ? "Door" : "Window"} {formatDimension(seg.width)}
                  {" · "}
                  {seg.wall} {formatDimension(seg.offset)}
                </div>
              </Html>
            )}
            {interactive && (
              <mesh
                position={[
                  (seg.points[0][0] + seg.points[1][0]) / 2,
                  0.003,
                  (seg.points[0][2] + seg.points[1][2]) / 2,
                ]}
                rotation-x={-Math.PI / 2}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectOverlay?.(seg.id);
                  dragTargetRef.current = { kind: "opening", id: seg.id };
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  if (!dragTargetRef.current || dragTargetRef.current.id !== seg.id) return;
                  event.stopPropagation();
                  const opening = openings.find((entry) => entry.id === seg.id);
                  if (!opening) return;
                  handleOpeningMove(opening, event);
                }}
                onPointerUp={(event) => {
                  if (dragTargetRef.current?.id === seg.id) {
                    dragTargetRef.current = null;
                  }
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <circleGeometry args={[selectedOverlayId === seg.id ? 0.07 : 0.05, 20]} />
                <meshBasicMaterial
                  color={selectedOverlayId === seg.id ? "#f97316" : "#fb923c"}
                  transparent
                  opacity={0.95}
                />
              </mesh>
            )}
          </group>
        ))}

      {canTraceOpeningOnGrid && openingPreview && (
        <>
          <Line
            points={openingPreview.segment.map((point) => [point.x, 0.006, point.z])}
            color={openingPreview.status === "valid" ? "#0f766e" : "#f97316"}
            lineWidth={3}
          />
          {openingPreview.segment.map((point, index) => (
            <mesh
              key={`opening-preview-endpoint-${index}`}
              position={[point.x, 0.008, point.z]}
              rotation-x={-Math.PI / 2}
            >
              <circleGeometry args={[0.055, 20]} />
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
        fixedElements.map((fixed) => (
          <group
            key={fixed.id}
            position={[fixed.x, 0, fixed.z]}
            onClick={(event) => {
              event.stopPropagation();
              onSelectOverlay?.(fixed.id);
            }}
          >
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.0016, 0]}>
              <planeGeometry args={[fixed.w, fixed.d]} />
              <meshBasicMaterial color={isPro ? "#d7d7d7" : "#e2ddd3"} transparent opacity={0.85} />
            </mesh>
            {interactive && (
              <mesh
                rotation-x={-Math.PI / 2}
                position={[0, 0.003, 0]}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectOverlay?.(fixed.id);
                  dragTargetRef.current = {
                    kind: "fixed",
                    id: fixed.id,
                    width: fixed.w,
                    depth: fixed.d,
                  };
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  const drag = dragTargetRef.current;
                  if (!drag || drag.kind !== "fixed" || drag.id !== fixed.id) return;
                  event.stopPropagation();
                  handleFixedMove(fixed, event, drag.width, drag.depth);
                }}
                onPointerUp={(event) => {
                  const drag = dragTargetRef.current;
                  if (drag?.kind === "fixed" && drag.id === fixed.id) {
                    dragTargetRef.current = null;
                  }
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <planeGeometry args={[fixed.w, fixed.d]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
            {interactive && (
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.0032, 0]}>
                <circleGeometry args={[0.05, 20]} />
                <meshBasicMaterial color={selectedOverlayId === fixed.id ? "#f97316" : "#9ca3af"} />
              </mesh>
            )}
            {fixed.label && (
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
        ))}

      {showDimensions && (
        <>
          <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, -halfD - 0.18]} center transform={false}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(120,120,120,0.35)",
                borderRadius: 6,
                padding: "2px 7px",
                pointerEvents: "none",
              }}
            >
              {formatDimension(width)}
            </div>
          </Html>
          <Html zIndexRange={htmlZIndexRange} position={[-halfW - 0.16, 0.01, 0]} center transform={false}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(120,120,120,0.35)",
                borderRadius: 6,
                padding: "2px 7px",
                pointerEvents: "none",
              }}
            >
              {formatDimension(depth)}
            </div>
          </Html>
        </>
      )}

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
                  event.stopPropagation();
                  onSelectOverlay?.(note.id);
                  dragTargetRef.current = { kind: "annotation", id: note.id };
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  const drag = dragTargetRef.current;
                  if (!drag || drag.kind !== "annotation" || drag.id !== note.id) return;
                  event.stopPropagation();
                  handleAnnotationMove(note, event);
                }}
                onPointerUp={(event) => {
                  const drag = dragTargetRef.current;
                  if (drag?.kind === "annotation" && drag.id === note.id) {
                    dragTargetRef.current = null;
                  }
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <circleGeometry args={[0.05, 20]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
