"use client";

import { Html, Line } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { FloorPlanDrawRoomMode, FloorPlanPoint } from "@/lib/floor-plan-types";
import type { RoomType } from "@/lib/room-types";
import {
  resolveArcWallDrawPreview,
  resolveRoomDrawPreview,
  type ArcWallDrawPreview,
  type RoomDrawPreview,
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
  drawRoomMode?: boolean;
  drawRoomPoints?: FloorPlanPoint[];
  drawRoomPreviewPoint?: FloorPlanPoint | null;
  onDrawRoomPoint?: (point: FloorPlanPoint) => void;
  onDrawRoomPreviewPoint?: (point: FloorPlanPoint | null) => void;
  onDrawRoomDrag?: (start: FloorPlanPoint, end: FloorPlanPoint) => void;
  drawRoomInteractionMode?: FloorPlanDrawRoomMode;
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
  width: number,
  depth: number
): Array<{ id: string; points: Array<[number, number, number]> }> {
  if (!previousPoint || !previewPoint) return [];
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  return [
    {
      id: "wall-guide-x",
      points: [
        [previewPoint.x, 0.0085, -halfDepth],
        [previewPoint.x, 0.0085, halfDepth],
      ],
    },
    {
      id: "wall-guide-z",
      points: [
        [-halfWidth, 0.0085, previewPoint.z],
        [halfWidth, 0.0085, previewPoint.z],
      ],
    },
    {
      id: "wall-guide-previous-x",
      points: [
        [previousPoint.x, 0.008, -halfDepth],
        [previousPoint.x, 0.008, halfDepth],
      ],
    },
    {
      id: "wall-guide-previous-z",
      points: [
        [-halfWidth, 0.008, previousPoint.z],
        [halfWidth, 0.008, previousPoint.z],
      ],
    },
  ];
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
  drawRoomMode = false,
  drawRoomPoints = [],
  drawRoomPreviewPoint = null,
  onDrawRoomPoint,
  onDrawRoomPreviewPoint,
  onDrawRoomDrag,
  drawRoomInteractionMode = "rectangle_wall",
}: RoomRenderer2DProps) {
  const htmlZIndexRange: [number, number] = [5, 0];
  const { camera, gl } = useThree();

  const halfW = width / 2;
  const halfD = depth / 2;
  const isPro = theme === "pro";
  const hasHouseRooms = rooms.length > 1;
  const canEditPlan = interactive && !drawRoomMode;
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
  const [localDrawStartPoint, setLocalDrawStartPoint] = useState<FloorPlanPoint | null>(null);
  const [localDrawPreviewPoint, setLocalDrawPreviewPoint] = useState<FloorPlanPoint | null>(null);
  const [roomSnapPreview, setRoomSnapPreview] = useState<HouseRoomSnapPreview | null>(null);

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

    return resolveRoomDrawPreview(activeDrawRoomPoints[0], activeDrawRoomPreviewPoint, { rooms });
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
        drawSurfaceWidth,
        drawSurfaceDepth
      )
    : [];
  const arcWallDrawPreview = useMemo(() => {
    if (
      !canDrawRoomOnGrid ||
      !isArcWallDrawMode ||
      activeDrawRoomPoints.length !== 1 ||
      !activeDrawRoomPreviewPoint
    ) {
      return null;
    }

    return resolveArcWallDrawPreview(activeDrawRoomPoints[0], activeDrawRoomPreviewPoint, { rooms });
  }, [activeDrawRoomPoints, activeDrawRoomPreviewPoint, canDrawRoomOnGrid, isArcWallDrawMode, rooms]);
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

  const getDrawPointFromEvent = (event: ThreeEvent<PointerEvent>): FloorPlanPoint => ({
    x: Number(event.point.x.toFixed(3)),
    z: Number(event.point.z.toFixed(3)),
  });

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

      event.preventDefault();
      nativePointerIds.add(event.pointerId);
      roomDrawDragStartRef.current = point;
      roomDrawLatestPointRef.current = point;
      roomDrawDragMovedRef.current = false;
      setLocalDrawStartPoint(point);
      setLocalDrawPreviewPoint(null);
      if (drawRoomInteractionMode === "straight_wall") {
        onDrawRoomPoint?.(point);
      }

      if ("setPointerCapture" in canvas) {
        canvas.setPointerCapture(event.pointerId);
      }
    };

    const handleNativePointerMove = (event: PointerEvent) => {
      if (!nativePointerIds.has(event.pointerId)) return;
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      if (!point) return;

      event.preventDefault();
      markRoomDrawMoved(point);
      roomDrawLatestPointRef.current = point;
      setLocalDrawPreviewPoint(point);
      onDrawRoomPreviewPoint?.(point);
    };

    const handleNativeMouseMove = (event: MouseEvent) => {
      if (!roomDrawDragStartRef.current) return;
      const point = getDrawPointFromClientPosition(event.clientX, event.clientY);
      if (!point) return;

      markRoomDrawMoved(point);
      roomDrawLatestPointRef.current = point;
      setLocalDrawPreviewPoint(point);
      onDrawRoomPreviewPoint?.(point);
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
    getDrawPointFromClientPosition,
    gl.domElement,
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
    event.stopPropagation();
    roomDrawDragStartRef.current = point;
    roomDrawLatestPointRef.current = point;
    roomDrawDragMovedRef.current = false;
    setLocalDrawStartPoint(point);
    setLocalDrawPreviewPoint(null);
    if (drawRoomInteractionMode === "straight_wall") {
      onDrawRoomPoint?.(point);
    }
    setPointerCaptureIfSupported(event);

    const start = point;
    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = getDrawPointFromClientPosition(moveEvent.clientX, moveEvent.clientY);
      if (!nextPoint) return;

      const deltaX = Math.abs(nextPoint.x - start.x);
      const deltaZ = Math.abs(nextPoint.z - start.z);
      if (deltaX > 0.12 || deltaZ > 0.12) {
        roomDrawDragMovedRef.current = true;
      }

      roomDrawLatestPointRef.current = nextPoint;
      setLocalDrawPreviewPoint(nextPoint);
      onDrawRoomPreviewPoint?.(nextPoint);
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
    markRoomDrawMoved(point);
    roomDrawLatestPointRef.current = point;
    setLocalDrawPreviewPoint(point);
    onDrawRoomPreviewPoint?.(point);
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

      {!hasHouseRooms && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.0005, 0]}>
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
                onClick={(event) => {
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
                    position={[0, 0.018, -room.d / 2 - 0.2]}
                    center
                    transform={false}
                  >
                    <div
                      data-testid="active-room-dimension-width"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#166534",
                        background: "rgba(240,253,244,0.96)",
                        border: "1px solid rgba(34,197,94,0.36)",
                        borderRadius: 6,
                        padding: "2px 7px",
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                        boxShadow: "0 1px 4px rgba(15,23,42,0.12)",
                      }}
                    >
                      W {formatDimension(room.w)}
                    </div>
                  </Html>
                  <Html
                    zIndexRange={htmlZIndexRange}
                    position={[-room.w / 2 - 0.22, 0.018, 0]}
                    center
                    transform={false}
                  >
                    <div
                      data-testid="active-room-dimension-depth"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#166534",
                        background: "rgba(240,253,244,0.96)",
                        border: "1px solid rgba(34,197,94,0.36)",
                        borderRadius: 6,
                        padding: "2px 7px",
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                        boxShadow: "0 1px 4px rgba(15,23,42,0.12)",
                      }}
                    >
                      D {formatDimension(room.d)}
                    </div>
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
          position={[suggestion.labelPosition.x, 0.095, suggestion.labelPosition.z]}
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

      {isStraightWallDrawMode && wallDrawLinePoints.length >= 2 && (
        <Line
          points={wallDrawLinePoints}
          color="#2563eb"
          lineWidth={3}
        />
      )}

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
                <circleGeometry args={[0.05, 20]} />
                <meshBasicMaterial
                  color={selectedOverlayId === seg.id ? "#f97316" : "#fb923c"}
                  transparent
                  opacity={0.95}
                />
              </mesh>
            )}
          </group>
        ))}

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
