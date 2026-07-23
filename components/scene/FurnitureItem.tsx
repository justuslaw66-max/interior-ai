"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges } from "@react-three/drei/core/Edges";
import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import { useCursor } from "@react-three/drei/web/useCursor";
import { track } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import {
  computeSnapCandidates,
  computeAABB,
  pickGuides,
  snapGuideToGuide,
  type Guide,
  type AABB,
} from "@/lib/snapGuides";
import { generateMeasurements, type Measure } from "@/lib/measurements";
import { resolveMaterialProps } from "@/lib/design-page-material-props";
import { shouldApplyVariantColorTint } from "@/lib/catalog-variant-color";
import {
  getRotatedFootprint,
  normalizeRotationDegrees,
  ROTATION_SNAP_STEP_DEGREES,
  ROTATION_SNAP_STEP_RADIANS,
} from "@/lib/design-page-utils";
import { type GLBCalibration, getModelCalibration } from "@/lib/design-page-calibration";
import {
  type SnapNeighbor,
  type ConfigurableNodeTransform,
  type PlanMeasurementUnit,
  type WallDescriptor,
} from "@/lib/design-page-types";
import { SnapGuides } from "@/components/SnapGuides";
import { Measurements } from "@/components/Measurements";
import { GLBScaledModel } from "@/components/scene/GLBScaledModel";
import ItemRenderer2D from "@/components/editor/renderers/ItemRenderer2D";
import { radiansToDeg } from "@/lib/editorScene";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import {
  clampToRoom,
  isAabbWithinPadding,
  resolveAxisAlignedRoomItemBounds,
  resolvePointerRotationRadians,
} from "@/lib/design-page-geometry";
import type { DesignItem, RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";
import { getAdjustablePendantHeight } from "@/lib/pendant-light-adjustment";
import { EDITOR_GEOMETRY_TOLERANCES } from "@/lib/editor-geometry-tolerances";

const normalizeModelCandidate = (value: string | null | undefined): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  if (raw.startsWith("assets/")) return `/${raw}`;
  return `/assets/models/${raw.replace(/^\/+/, "")}`;
};

type FurnitureProps = {
  product: CatalogItemSchema;
  planningBoundsMm?: { w: number; d: number; h: number };
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  variantColor: string;
  variantName?: string;
  variantId: string;
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  hangingHeightCm?: number;
  initialPosition?: [number, number, number];
  initialRotationY?: number;
  roomWidth?: number;
  roomDepth?: number;
  roomOriginX?: number;
  roomOriginZ?: number;
  roomPlanShape?: RoomPlanShape;
  roomPlanPolygon?: RoomPlanPolygonPoint[];
  roomPlanHoles?: RoomPlanPolygonPoint[][];
  wallThickness?: number;
  wallContactInset?: number;
  margin?: number;
  snapDistance?: number;
  enableSnap?: boolean;
  allowCrossRoomDrag?: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  walls?: WallDescriptor[];
  instanceId: string;
  isSelected?: boolean;
  isPrimarySelected?: boolean;
  onSelect?: (id: string, additive: boolean) => void;
  onMove?: (id: string, pos: [number, number, number]) => boolean | void;
  onDragPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRotate?: (
    id: string,
    rotationY: number,
    meta?: {
      source?: "keyboard" | "handle" | "inspector" | "canvas";
      snap?: boolean;
    }
  ) => boolean | void;
  onDragEnd?: (id: string, pos: [number, number, number]) => void;
  locked?: boolean;
  interactive?: boolean;
  showSelection?: boolean;
  showLocks?: boolean;
  onSnapPulse?: () => void;
  onSnapSuccess?: () => void;
  items?: DesignItem[];
  materialPreset?: string;
  materialOverrides?: DesignItem["materialOverrides"];
  itemPlanningBoundsByInstanceId?: Record<string, { w: number; d: number; h: number }>;
  showGuidesAndMeasurements?: boolean;
  cartPreviewed?: boolean;
  viewMode?: EditorViewMode;
  planShowLabels?: boolean;
  planShowDimensions?: boolean;
  planMeasurementUnit?: PlanMeasurementUnit;
  rotationSnapStepRadians?: number;
  rotationSnapStepDegrees?: number;
  rotationSnapEnabled?: boolean;
  renderQuality?: "standard" | "lite";
  renderReadyKey?: string;
  onRenderReadyChange?: (key: string, ready: boolean) => void;
  "data-testid"?: string;
};


type SnapType = "none" | "wall-left" | "wall-right" | "wall-front" | "wall-back";

export function Furniture({
  product,
  planningBoundsMm,
  nodeTransforms,
  variantColor,
  variantName,
  variantId,
  variantRenderAssets,
  hangingHeightCm,
  initialPosition = [0, 0, -1.4] as [number, number, number],
  initialRotationY = 0,
  roomWidth = 5,
  roomDepth = 4,
  roomOriginX = 0,
  roomOriginZ = 0,
  roomPlanShape = "rectangle",
  roomPlanPolygon,
  roomPlanHoles,
  wallThickness = 0.12,
  wallContactInset,
  snapDistance = 0.25,
  enableSnap = true,
  allowCrossRoomDrag = false,
  onDraggingChange,
  instanceId,
  isSelected,
  isPrimarySelected = false,
  onSelect,
  onMove,
  onDragPointerMove,
  onDuplicate,
  onDelete,
  onRotate,
  onDragEnd,
  locked,
  interactive = true,
  showSelection = true,
  showLocks = false,
  onSnapPulse,
  onSnapSuccess,
  items = [],
  materialPreset,
  materialOverrides,
  itemPlanningBoundsByInstanceId,
  showGuidesAndMeasurements = true,
  cartPreviewed = false,
  viewMode = "3d",
  planShowLabels = true,
  planShowDimensions = true,
  planMeasurementUnit = "mm",
  rotationSnapStepRadians = ROTATION_SNAP_STEP_RADIANS,
  rotationSnapStepDegrees = ROTATION_SNAP_STEP_DEGREES,
  rotationSnapEnabled = true,
  renderQuality = "standard",
  renderReadyKey,
  onRenderReadyChange,
}: FurnitureProps) {
  const width = product.dimsMm.w / 1000;
  const depth = product.dimsMm.d / 1000;
  const height = product.dimsMm.h / 1000;
  const planningWidth = (planningBoundsMm?.w ?? product.dimsMm.w) / 1000;
  const planningDepth = (planningBoundsMm?.d ?? product.dimsMm.d) / 1000;
  const pendantCableAdjustment = useMemo(
    () => getAdjustablePendantHeight(product, { hangingHeightCm }),
    [hangingHeightCm, product]
  );
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<[number, number, number]>(
    initialPosition
  );
  const [rotation, setRotation] = useState(initialRotationY); // Y-axis rotation in radians
  const [snapType, setSnapType] = useState<SnapType>("none"); // Track current snap type for auto-facing
  const [snapGuides, setSnapGuides] = useState<Guide[]>([]); // Snap visualization guides
  const [measurements, setMeasurements] = useState<Measure[]>([]); // Real-time measurements
  const [hovered, setHovered] = useState(false);
  const [invalidPlacement, setInvalidPlacement] = useState(false);
  const [rotateDragging, setRotateDragging] = useState(false);
  const [modelExists, setModelExists] = useState<boolean>(false);
  const [runtimeModelUrl, setRuntimeModelUrl] = useState<string | null>(null);
  const [modelLoadState, setModelLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const groupRef = useRef<THREE.Group>(null);
  const shakeUntilRef = useRef(0);
  const placementStartRef = useRef<number | null>(null);
  const snapBumpUntilRef = useRef(0);
  const rotateStartRef = useRef(initialRotationY);
  const rotateTargetRef = useRef(initialRotationY);
  const rotatePointerTargetRef = useRef<HTMLElement | null>(null);
  const rotatePointerIdRef = useRef<number | null>(null);
  const rotateSnapEnabledRef = useRef(true);

  const materialProps = useMemo(() => {
    return resolveMaterialProps({
      category: product.category,
      materialPreset,
      materialOverrides,
      variantColor,
    });
  }, [product.category, materialPreset, materialOverrides, variantColor]);

  useEffect(() => {
    if (dragging) return;
    const frameId = window.requestAnimationFrame(() => {
      setPosition(initialPosition);
      setRotation(initialRotationY);
      setSnapType("none");
      rotateStartRef.current = initialRotationY;
      rotateTargetRef.current = initialRotationY;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [dragging, initialPosition, initialRotationY]);

  useEffect(() => {
    rotateTargetRef.current = rotation;
  }, [rotation]);

  useCursor(hovered && Boolean(locked), "not-allowed");

  useEffect(() => {
    if (!interactive) return;
    placementStartRef.current = performance.now();
  }, [instanceId, interactive]);

  // Keyboard listener for rotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (locked || !interactive || !isPrimarySelected) return;
      if (dragging || rotateDragging) return;
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement) {
        const tagName = activeElement.tagName;
        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT" ||
          activeElement.isContentEditable
        ) {
          return;
        }
      }

      let nextRotation: number | null = null;
      let isSnapped = true;
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        nextRotation = rotation + (e.shiftKey ? -Math.PI / 2 : Math.PI / 2);
      } else if ((e.key === "q" || e.key === "Q") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const step =
          ((rotationSnapEnabled ? rotationSnapStepDegrees : 1) * Math.PI) / 180;
        nextRotation = rotation - step;
        isSnapped = rotationSnapEnabled;
      } else if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const step =
          ((rotationSnapEnabled ? rotationSnapStepDegrees : 1) * Math.PI) / 180;
        nextRotation = rotation + step;
        isSnapped = rotationSnapEnabled;
      } else if (e.key === "0" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        nextRotation = 0;
      }

      if (nextRotation === null) return;
      e.preventDefault();
      setRotation((prev: number) => {
        const fallback = nextRotation ?? prev;
        const accepted = onRotate?.(instanceId, fallback, {
          source: "keyboard",
          snap: isSnapped,
        });
        return accepted === false ? prev : fallback;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    dragging,
    interactive,
    instanceId,
    isPrimarySelected,
    locked,
    onRotate,
    rotateDragging,
    rotation,
    rotationSnapEnabled,
    rotationSnapStepDegrees,
    rotationSnapStepRadians,
  ]);

  const getPointerRotation = (
    e: ThreeEvent<PointerEvent>,
    snapToStep: boolean
  ): number | null => {
    raycaster.setFromCamera(e.pointer, e.camera);
    const hit = raycaster.ray.intersectPlane(plane, intersection);
    if (!hit) return null;
    const dx = intersection.x - position[0];
    const dz = intersection.z - position[2];
    return resolvePointerRotationRadians({
      deltaX: dx,
      deltaZ: dz,
      snapToStep,
      snapEnabled: rotationSnapEnabled,
      snapStepRadians: rotationSnapStepRadians,
    });
  };

  const onRotateHandlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!interactive || locked || viewMode !== "2d") {
      if (locked) {
        shakeUntilRef.current = Number(e.timeStamp) + 220;
      }
      return;
    }
    const pointerTarget = e.target as unknown as HTMLElement;
    pointerTarget.setPointerCapture(e.pointerId);
    rotatePointerTargetRef.current = pointerTarget;
    rotatePointerIdRef.current = e.pointerId;
    setRotateDragging(true);
    onDraggingChange?.(true);
    setInvalidPlacement(false);
    rotateStartRef.current = rotation;
    rotateTargetRef.current = rotation;
    rotateSnapEnabledRef.current = !e.altKey;
    const next = getPointerRotation(e, rotateSnapEnabledRef.current);
    if (next !== null) {
      setRotation(next);
      rotateTargetRef.current = next;
    }
  };

  const onRotateHandlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!rotateDragging) return;
    e.stopPropagation();
    rotateSnapEnabledRef.current = !e.altKey;
    const next = getPointerRotation(e, rotateSnapEnabledRef.current);
    if (next === null) return;
    setRotation(next);
    rotateTargetRef.current = next;
  };

  const onRotateHandlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!rotateDragging) return;
    e.stopPropagation();
    rotatePointerTargetRef.current = null;
    rotatePointerIdRef.current = null;
    try {
      (e.target as unknown as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setRotateDragging(false);
    onDraggingChange?.(false);
    const accepted = onRotate?.(instanceId, rotateTargetRef.current, {
      source: "handle",
      snap: rotateSnapEnabledRef.current,
    });
    if (accepted === false) {
      setInvalidPlacement(true);
      setRotation(rotateStartRef.current);
      rotateTargetRef.current = rotateStartRef.current;
      return;
    }
    setInvalidPlacement(false);
    rotateStartRef.current = rotateTargetRef.current;
  };

  useEffect(() => {
    if (!rotateDragging) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const pointerTarget = rotatePointerTargetRef.current;
      const pointerId = rotatePointerIdRef.current;
      if (pointerTarget && pointerId !== null) {
        try {
          pointerTarget.releasePointerCapture(pointerId);
        } catch {}
      }
      rotatePointerTargetRef.current = null;
      rotatePointerIdRef.current = null;
      setRotateDragging(false);
      onDraggingChange?.(false);
      setRotation(rotateStartRef.current);
      rotateTargetRef.current = rotateStartRef.current;
      setInvalidPlacement(false);
      track("editor_rotate_cancelled", {
        source: "handle_escape",
        instanceId,
      });
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [instanceId, onDraggingChange, rotateDragging]);

  // Room outlines represent wall centrelines. Use the shared inner-face
  // clearance for both clamping and snapping so every wall axis lands at the
  // same visible distance without intersecting the wall mesh.
  const roomWallInset =
    typeof wallContactInset === "number" && Number.isFinite(wallContactInset)
      ? wallContactInset
      : wallThickness;

  const clampWorldToRoomShape = useCallback(
    (
      worldX: number,
      worldZ: number,
      nextRotationY: number = rotation
    ): [number, number] => {
      if (allowCrossRoomDrag) {
        return [worldX, worldZ];
      }

      const [localX, localZ] = clampToRoom(
        worldX - roomOriginX,
        worldZ - roomOriginZ,
        planningWidth,
        planningDepth,
        roomWidth,
        roomDepth,
        roomWallInset,
        nextRotationY,
        roomPlanShape,
        roomPlanPolygon,
        roomPlanHoles
      );

      return [localX + roomOriginX, localZ + roomOriginZ];
    },
    [
      planningDepth,
      planningWidth,
      allowCrossRoomDrag,
      roomDepth,
      roomOriginX,
      roomOriginZ,
      roomPlanPolygon,
      roomPlanHoles,
      roomPlanShape,
      roomWidth,
      rotation,
      roomWallInset,
    ]
  );

  // Update position when rotation changes to keep sofa in bounds
  useEffect(() => {
    // Only adjust position for rotation if NOT currently snapped to a wall
    if (snapType === "none") {
      const [newX, newZ] = clampWorldToRoomShape(position[0], position[2], rotation);
      
      if (newX !== position[0] || newZ !== position[2]) {
        const frameId = window.requestAnimationFrame(() => {
          setPosition([newX, position[1] ?? 0, newZ]);
        });
        return () => window.cancelAnimationFrame(frameId);
      }
    }
  }, [
    planningDepth,
    planningWidth,
    clampWorldToRoomShape,
    position,
    roomDepth,
    roomOriginX,
    roomOriginZ,
    roomWidth,
    rotation,
    snapType,
    wallThickness,
  ]);

  // Reuse Three.js helper objects without recreating them each render.
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const raycasterRef = useRef(new THREE.Raycaster());
  const intersectionRef = useRef(new THREE.Vector3());
  const plane = planeRef.current;
  const raycaster = raycasterRef.current;
  const intersection = intersectionRef.current;

  // Calculate effective dimensions based on rotation (axis-aligned footprint)
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
    planningWidth,
    planningDepth,
    rotation
  );

  // Compute room bounds
  // Hard constraint bounds: prevent items from exiting the room
  // Walls have physical thickness, so we must account for that
  // Items must stay inside the inner room boundaries (wall edges)
  const {
    minX: hardMinX,
    maxX: hardMaxX,
    minZ: hardMinZ,
    maxZ: hardMaxZ,
  } = resolveAxisAlignedRoomItemBounds({
    roomOriginX,
    roomOriginZ,
    roomWidth,
    roomDepth,
    wallContactInset: roomWallInset,
    itemWidth: effectiveWidth,
    itemDepth: effectiveDepth,
  });

  // Soft snap bounds: walls where items snap flush
  // Items snap directly to hard bounds (wall edges), no gap
  // The hard bounds already account for item size, so snap position is flush
  const wallLeftX = hardMinX;
  const wallRightX = hardMaxX;
  const wallFrontZ = hardMinZ;
  const wallBackZ = hardMaxZ;

  // Clamp position to hard bounds (prevent going outside room)
  const [clampedX, clampedZ] = clampWorldToRoomShape(position[0], position[2]);
  const clampedPosition = [
    clampedX,
    position[1],
    clampedZ,
  ] as [number, number, number];

  // Snap to wall when within threshold (typically 3cm)
  const applySnap = (x: number, z: number): [number, number, SnapType] => {
    if (!enableSnap) return [x, z, "none"];

    let snappedX = x;
    let snappedZ = z;
    let snapType: SnapType = "none";

    // Check X-axis walls (left/right) - snap if within threshold
    const distToLeftWall = Math.abs(x - wallLeftX);
    const distToRightWall = Math.abs(x - wallRightX);
    const minDistX = Math.min(distToLeftWall, distToRightWall);

    if (minDistX < snapDistance) {
      snappedX = distToLeftWall < distToRightWall ? wallLeftX : wallRightX;
      snapType = distToLeftWall < distToRightWall ? "wall-left" : "wall-right";
    }

    // Check Z-axis walls (front/back) - snap if within threshold and no X snap yet
    const distToFrontWall = Math.abs(z - wallFrontZ);
    const distToBackWall = Math.abs(z - wallBackZ);
    const minDistZ = Math.min(distToFrontWall, distToBackWall);

    if (minDistZ < snapDistance) {
      snappedZ = distToFrontWall < distToBackWall ? wallFrontZ : wallBackZ;
      // Only set Z snap if no X snap (prioritize first axis snapped)
      if (snapType === "none") {
        snapType = distToFrontWall < distToBackWall ? "wall-front" : "wall-back";
      }
    }

    return [snappedX, snappedZ, snapType];
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!interactive || locked) {
      if (locked) {
        shakeUntilRef.current = performance.now() + 220;
      }
      return;
    }
    // Capture pointer so dragging continues even if cursor leaves the mesh
    (e.target as unknown as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onDraggingChange?.(true); // notify parent
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const wasSnapped = snapType !== "none";
    try {
      (e.target as unknown as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setDragging(false);
    setSnapType("none"); // Reset snap type
    setInvalidPlacement(false);
    if (wasSnapped && interactive) {
      snapBumpUntilRef.current = performance.now() + 160;
      onSnapPulse?.();
      onSnapSuccess?.();
    }
    
    // Trigger constraint check on drag end
    if (interactive && onDragEnd) {
      onDragEnd(instanceId, position);
    }
    onDraggingChange?.(false); // notify parent after the document command finishes
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || locked) return;
    if (rotateDragging) return;
    if (!dragging) return;
    e.stopPropagation(); // prevent OrbitControls from responding
    onDragPointerMove?.(e);

    raycaster.setFromCamera(e.pointer, e.camera);
    raycaster.ray.intersectPlane(plane, intersection);

    const [x, z] = clampWorldToRoomShape(intersection.x, intersection.z);

    // Try to snap to wall if enabled
    let snappedX = x;
    let snappedZ = z;
    let snap: SnapType = "none";

    if (enableSnap) {
      const [resultX, resultZ, resultSnap] = applySnap(x, z);
      snappedX = resultX;
      snappedZ = resultZ;
      snap = resultSnap;
    }

    [snappedX, snappedZ] = clampWorldToRoomShape(snappedX, snappedZ);

    const nextPos: [number, number, number] = [snappedX, position[1] ?? 0, snappedZ];

    // Compute snap guides for visualization
    if (dragging && enableSnap && items && items.length > 0) {
      try {
        const selectedAABB = computeAABB(nextPos, effectiveWidth, effectiveDepth);
        const nearbyItemPadding = Math.max(1.5, snapDistance + 0.5);

        // Limit guides/measurements to nearby items so distant aligned furniture does not create noise.
        const nearbyItems = items
          .filter((item) => item.instanceId !== instanceId) // exclude self
          .map((item): { aabb: AABB; name: string } | null => {
            const itemProduct = CATALOG_ITEMS[item.productId];
            if (!itemProduct) return null;
            const itemPlanningBounds = itemPlanningBoundsByInstanceId?.[item.instanceId];
            const itemRotation = item.rotationY ?? 0;
            const [itemWidth, itemDepth] = getRotatedFootprint(
              (itemPlanningBounds?.w ?? itemProduct.dimsMm.w) / 1000,
              (itemPlanningBounds?.d ?? itemProduct.dimsMm.d) / 1000,
              itemRotation
            );

            return {
              aabb: computeAABB(item.position, itemWidth, itemDepth),
              name: itemProduct.title,
            };
          })
          .filter((item): item is { aabb: AABB; name: string } => item !== null)
          .filter((item) => isAabbWithinPadding(item.aabb, selectedAABB, nearbyItemPadding));

        const neighborGuides: SnapNeighbor[] = nearbyItems.map((item) => ({
          aabb: item.aabb,
          label: item.name,
        }));

        // Wall snap points (flush to walls, no breathing room)
        const walls = [
          { axis: "x" as const, coord: wallLeftX, label: "Left Wall" },
          { axis: "x" as const, coord: wallRightX, label: "Right Wall" },
          { axis: "z" as const, coord: wallFrontZ, label: "Front Wall" },
          { axis: "z" as const, coord: wallBackZ, label: "Back Wall" },
        ];

        // Compute all snap candidates
        const snapCandidates = computeSnapCandidates(selectedAABB, neighborGuides, walls, snapDistance);

        // Convert to Guide type with snapped/showLine/showLabel flags
        // snap threshold = 0.02m (2cm), near threshold = 0.06m (6cm)
        const allGuides: Guide[] = snapCandidates.map((snap) => {
          // Determine target type from label
          let targetType: "wall" | "sofa" | "rug" | "item" = "item";
          let targetId = "wall";

          if (snap.label?.includes("Wall")) {
            targetType = "wall";
            targetId = "wall";
          } else if (snap.label?.includes("Sofa")) {
            targetType = "sofa";
            targetId = "sofa";
          } else if (snap.label?.includes("Rug")) {
            targetType = "rug";
            targetId = "rug";
          }

          return snapGuideToGuide(snap, instanceId, targetType, targetId, 0.02, 0.06);
        });

        // Pick the best guides (one per axis)
        const picked = pickGuides(allGuides);

        setSnapGuides(picked);

        // Compute measurements (gaps, walkways, etc)
        const measures = generateMeasurements(
          selectedAABB,
          product.title,
          nearbyItems,
          { minX: hardMinX, maxX: hardMaxX, minZ: hardMinZ, maxZ: hardMaxZ }
        );
        setMeasurements(measures);
      } catch (error) {
        console.error("[Furniture] Drag snap computation failed", {
          instanceId,
          productId: product.id,
          error,
        });
        setSnapGuides([]);
        setMeasurements([]);
      }
    } else {
      setSnapGuides([]);
      setMeasurements([]);
    }

    let accepted: boolean | void | undefined;
    try {
      accepted = onMove?.(instanceId, nextPos);
    } catch (error) {
      console.error("[Furniture] onMove callback failed", {
        instanceId,
        productId: product.id,
        nextPos,
        error,
      });
      setInvalidPlacement(true);
      return;
    }
    if (accepted === false) {
      setInvalidPlacement(true);
      return;
    }
    setInvalidPlacement(false);
    setSnapType(snap);
    setPosition(nextPos);
  };


  // Determine if current position is snapped (based on snap type rather than position)
  const isSnapped = snapType !== "none";

  useFrame(() => {
    if (!groupRef.current) return;
    const now = performance.now();
    const baseX = clampedPosition[0];
    const baseZ = clampedPosition[2];
    const baseY = (clampedPosition[1] ?? 0) + height / 2;
    const bumpRemaining = snapBumpUntilRef.current - now;
    const bump =
      bumpRemaining > 0
        ? Math.sin((bumpRemaining / 160) * Math.PI) * 0.02
        : 0;

    if (shakeUntilRef.current > now) {
      const phase = (shakeUntilRef.current - now) / 220;
      const offset = Math.sin(phase * Math.PI * 10) * 0.02;
      groupRef.current.position.set(baseX + offset + bump, baseY, baseZ);
    } else {
      groupRef.current.position.set(baseX + bump, baseY, baseZ);
    }

    if (dragging) {
      groupRef.current.scale.set(1, 1, 1);
      return;
    }

    if (cartPreviewed) {
      groupRef.current.scale.set(1.02, 1.02, 1.02);
      return;
    }

    if (!interactive) {
      groupRef.current.scale.set(1, 1, 1);
      return;
    }

    const start = placementStartRef.current;
    if (start !== null) {
      const t = Math.min(1, (now - start) / 160);
      const scale = 0.98 + 0.02 * t;
      groupRef.current.scale.set(scale, scale, scale);
      if (t >= 1) {
        placementStartRef.current = null;
      }
    } else {
      groupRef.current.scale.set(1, 1, 1);
    }
  });

  // finalRotation is the current rotation state (set directly when snapping)
  const finalRotation = rotation;
  const rotationHudLabel =
    viewMode === "2d" && rotateDragging
      ? `${normalizeRotationDegrees(radiansToDeg(rotation))}°`
      : null;
  const activeVariant = product?.variants.find((variant) => variant.id === variantId);
  const modelUrl = activeVariant?.modelUrl ?? (product?.assets?.modelUrl as string | undefined);
  const shouldTintVariantColor = useMemo(
    () => shouldApplyVariantColorTint(product, activeVariant),
    [product, activeVariant],
  );
  const modelCalibration = getModelCalibration(product);
  const variantMarker = `${String(variantName ?? "")} ${String(variantId ?? "")}`.toLowerCase();
  const variantColorKey = String(variantColor ?? "").trim().toLowerCase();
  const isKelseyTableVariant = product.id.startsWith("dining-real-castlery-kelsey-marble-");
  const variantHex = variantColorKey.match(/^#([0-9a-f]{6})$/i)?.[1] ?? null;
  const variantLuma = useMemo(() => {
    if (!variantHex) return null;
    const r = parseInt(variantHex.slice(0, 2), 16) / 255;
    const g = parseInt(variantHex.slice(2, 4), 16) / 255;
    const b = parseInt(variantHex.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }, [variantHex]);
  const normalizedVariantMarker = variantMarker.replace(/[_-]+/g, " ");
  // variantMarker includes variantId (e.g. "cocoa_leather") so check both name and marker.
  const isLeatherVariant = /\bleather\b/i.test(String(variantName ?? "")) || /\bleather\b/i.test(normalizedVariantMarker);
  const isMadisonProduct =
    product.id.startsWith("sofa-real-castlery-madison-") ||
    product.id.startsWith("armchair-real-castlery-madison-");
  const isMadisonFabricVariant = isMadisonProduct && !isLeatherVariant;
  const isMadisonBisqueFabricVariant =
    isMadisonFabricVariant && /\bbisque\b/i.test(normalizedVariantMarker);
  const isMadisonStoneFabricVariant =
    isMadisonFabricVariant && /\bstone\b/i.test(normalizedVariantMarker);
  const isMadisonCamilleForestFabricVariant =
    isMadisonFabricVariant &&
    (/\bcamille\b.*\bforest\b/i.test(normalizedVariantMarker) || /\bforest\b/i.test(normalizedVariantMarker));
  const isDawsonFabricVariant =
    product.id.startsWith("sofa-real-castlery-dawson-") && !isLeatherVariant;
  const isDawsonCreamyWhiteVariant =
    product.id.startsWith("sofa-real-castlery-dawson-") &&
    /(?:\bcreamy[\s_-]*white\b|\bperformance[\s_-]*creamy[\s_-]*white\b|\bpt4001\b)/i.test(variantMarker);
  const isDawsonPerformanceTwillVariant =
    isDawsonFabricVariant &&
    !isDawsonCreamyWhiteVariant &&
    /(?:\bperformance[\s_-]*twill\b|\bperformance_twill_\w+\b|\bpt400[2-5]\b)/i.test(variantMarker);
  const isDawsonPeytonVariant =
    isDawsonFabricVariant &&
    /(?:\bpeyton\b|\bpy400[1-4]\b|\bpeyton_[a-z_]+\b)/i.test(variantMarker);
  const isDawsonGenovaVariant =
    isDawsonFabricVariant &&
    /(?:\bgenova\b|\bperformance_linen_weave\b|\bperformance[\s_-]*linen[\s_-]*weave\b|\bpg400[2-4]\b)/i.test(variantMarker);
  const isDawsonBoucleVariant =
    isDawsonFabricVariant &&
    /(?:\bboucle\b|\bin400[2-5]\b|\bperformance_boucle_cream\b|\bperformance_infinity_boucle_moss\b|\binfinity_boucle_[a-z_]+\b)/i.test(variantMarker);
  const isDawsonChenilleVariant =
    isDawsonFabricVariant &&
    /(?:\bwashed[\s_-]*chenille\b|\bgreta\b|\bgr400[1-4]\b|\bwashed_chenille_[a-z_]+\b|\bgreta_[a-z_]+\b)/i.test(variantMarker);
  const isDawsonStockedLinenVariant =
    isDawsonFabricVariant &&
    /(?:\bbeach[\s_-]*linen\b|\bnavagio\b|\bseagull\b|\bng400[12]\b|\bbeach_linen\b|\bnavagio_seagull\b)/i.test(variantMarker);
  const isJaronProduct =
    product.id.startsWith("sofa-real-castlery-jaron-") ||
    product.id.startsWith("armchair-real-castlery-jaron-");
  const isPerformanceDuneFabricVariant =
    (isJaronProduct && /(?:\bperformance[\s_-]*dune\b|\bdune\b)/.test(variantMarker)) ||
    (/performance\s*dune/i.test(String(variantName ?? "")) &&
      /\bfabric\b/i.test(String(variantName ?? "")));
  const isIvoryLeatherVariant =
    (isJaronProduct && /\bivory\b/.test(variantMarker)) ||
    (isLeatherVariant && /\bivory\b/i.test(String(variantName ?? "")));
  const isCocoaLeatherVariant =
    (isJaronProduct && /\bcocoa\b/.test(variantMarker)) ||
    (isLeatherVariant && /\bcocoa\b/i.test(String(variantName ?? "")));
  const isGraphiteLeatherVariant =
    isLeatherVariant && /\bgraphite\b/i.test(String(variantName ?? ""));
  const isMadisonCaramelLeatherVariant =
    isMadisonProduct &&
    /\bcaramel\b/i.test(String(variantName ?? "")) &&
    /\bleather\b/i.test(String(variantName ?? ""));
  const kelseyHasWhiteToken = /white[\s_-]*wash/i.test(variantMarker);
  const kelseyHasDarkWalnutToken = /dark[\s_-]*walnut/i.test(variantMarker);
  const isKelseyWhiteWashVariant =
    isKelseyTableVariant &&
    (kelseyHasWhiteToken || variantColorKey === "#d8d0c2" || (!kelseyHasDarkWalnutToken && (variantLuma ?? 1) >= 0.72));
  const isKelseyDarkWalnutVariant =
    isKelseyTableVariant &&
    (kelseyHasDarkWalnutToken || variantColorKey === "#7a4b2d" || (!kelseyHasWhiteToken && (variantLuma ?? 1) < 0.72));
  const preferredModelUrl = modelUrl ?? null;
  const expectedModelUrl = useMemo(
    () =>
      [preferredModelUrl, modelUrl]
        .map((value) => normalizeModelCandidate(value))
        .filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index)[0] ?? null,
    [modelUrl, preferredModelUrl]
  );

  const effectiveModelCalibration: GLBCalibration | undefined = (() => {
    const modelUrlKey = String(product.assets?.modelUrl ?? "").toLowerCase();
    const productIdKey = String(product.id ?? "").toLowerCase();
    const variantKey = String(variantName ?? "").toLowerCase();
    const isSloaneOrSawyerSideboard =
      product.category === "sideboard" &&
      (/(sloane|sawyer)[-_ ]sideboard/.test(productIdKey) ||
        /(sloane|sawyer)[-_ ]sideboard/.test(modelUrlKey) ||
        /(sloane|sawyer)/.test(productIdKey) ||
        /(sloane|sawyer)/.test(modelUrlKey) ||
        /(grey\s*oak|natural)/.test(variantKey));

    // Sideboards can arrive through multiple catalog paths/IDs; enforce a stable
    // lighter wood calibration here to avoid crushed dark tones from tint stacking.
    if (isSloaneOrSawyerSideboard) {
      return {
        ...(modelCalibration ?? {}),
        useVariantColor: false,
        brightness: 1.43,
        saturation: 0.94,
        roughnessOverride: 0.82,
        metalnessOverride: 0,
        disableAoMap: false,
        aoMapIntensity: 0.2,
        emissiveBoost: 0,
        specularIntensityOverride: 0.08,
        disableVertexColors: true,
      };
    }

    if (!modelCalibration) return modelCalibration;

    if (isMadisonBisqueFabricVariant) {
      // Madison Bisque fabric: light warm woven beige, matched to the Castlery SG swatch card.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#d8d0c2",
        disableBaseColorMap: true,
        brightness: 1.02,
        saturation: 0.78,
        roughnessOverride: 0.97,
        metalnessOverride: 0,
        aoMapIntensity: 0.2,
        emissiveBoost: 0,
        specularIntensityOverride: 0.05,
      };
    }

    if (isMadisonCamilleForestFabricVariant) {
      // Madison Camille, Forest fabric: muted moss-green, matched to the Castlery SG swatch card.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#566448",
        disableBaseColorMap: true,
        brightness: 0.96,
        saturation: 1.02,
        roughnessOverride: 0.98,
        metalnessOverride: 0,
        aoMapIntensity: 0.22,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
      };
    }

    if (isMadisonStoneFabricVariant) {
      return {
        ...modelCalibration,
        forceBaseColorHex: "#9d9991",
        disableBaseColorMap: true,
        brightness: 0.98,
        saturation: 0.72,
        roughnessOverride: 0.98,
        metalnessOverride: 0,
        aoMapIntensity: 0.22,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
      };
    }

    if (isDawsonCreamyWhiteVariant) {
      // Dawson Creamy White should stay soft and warm relative to Sand, without the
      // crisp, pebbled micro-relief that makes it read as artificial plaster.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#dfd7ca",
        brightness: 0.95,
        saturation: 0.88,
        roughnessOverride: 0.9,
        metalnessOverride: 0,
        aoMapIntensity: 0.18,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.012,
      };
    }

    if (isDawsonPerformanceTwillVariant) {
      return {
        ...modelCalibration,
        brightness: 0.97,
        saturation: 0.94,
        roughnessOverride: 0.9,
        metalnessOverride: 0,
        aoMapIntensity: 0.18,
        emissiveBoost: 0,
        specularIntensityOverride: 0.05,
        importedNormalScale: 0.014,
      };
    }

    if (isDawsonPeytonVariant) {
      return {
        ...modelCalibration,
        brightness: 0.96,
        saturation: 0.94,
        roughnessOverride: 0.93,
        metalnessOverride: 0,
        aoMapIntensity: 0.14,
        emissiveBoost: 0,
        specularIntensityOverride: 0.03,
        importedNormalScale: 0.014,
      };
    }

    if (isDawsonGenovaVariant) {
      return {
        ...modelCalibration,
        brightness: 0.98,
        saturation: 0.94,
        roughnessOverride: 0.92,
        metalnessOverride: 0,
        aoMapIntensity: 0.16,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.016,
      };
    }

    if (isDawsonBoucleVariant) {
      return {
        ...modelCalibration,
        brightness: 0.97,
        saturation: 0.95,
        roughnessOverride: 0.95,
        metalnessOverride: 0,
        aoMapIntensity: 0.12,
        emissiveBoost: 0,
        specularIntensityOverride: 0.025,
        importedNormalScale: 0.02,
      };
    }

    if (isDawsonChenilleVariant) {
      return {
        ...modelCalibration,
        brightness: 0.97,
        saturation: 0.95,
        roughnessOverride: 0.91,
        metalnessOverride: 0,
        aoMapIntensity: 0.16,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.015,
      };
    }

    if (isDawsonStockedLinenVariant) {
      return {
        ...modelCalibration,
        brightness: 0.98,
        saturation: 0.94,
        roughnessOverride: 0.92,
        metalnessOverride: 0,
        aoMapIntensity: 0.16,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.018,
      };
    }


    if (isMadisonCaramelLeatherVariant) {
      // Keep base texture map for Madison caramel leather so non-upholstery parts
      // (legs/frame details) retain separation instead of collapsing into one flat tint.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#956a43",
        disableBaseColorMap: false,
        brightness: 0.86,
        saturation: 0.98,
        roughnessOverride: 0.26,
        metalnessOverride: 0.03,
        aoMapIntensity: 0.36,
        emissiveBoost: 0,
        specularIntensityOverride: 0.5,
        clearcoatOverride: 0.3,
        clearcoatRoughnessOverride: 0.42,
      };
    }

    if (isKelseyDarkWalnutVariant) {
      // Kelsey ships as a single baked material, so tint the lower assembly by height.
      return {
        ...modelCalibration,
        preserveWoodLegColorHex: "#7a4b2d",
        lowerAssemblyTintHex: "#7a4b2d",
        lowerAssemblyTintStrength: 0.95,
        // Cover full legs and underframe while leaving the tabletop cap mostly unchanged.
        lowerAssemblyFadeStart: 0.82,
        lowerAssemblyFadeEnd: 0.94,
      };
    }

    if (isKelseyWhiteWashVariant) {
      return {
        ...modelCalibration,
        preserveWoodLegColorHex: "#d8d0c2",
        lowerAssemblyTintHex: "#e1d6c8",
        lowerAssemblyTintStrength: 0,
        lowerAssemblyFadeStart: 0.82,
        lowerAssemblyFadeEnd: 0.94,
      };
    }

    if (isJaronProduct) {
      if (isPerformanceDuneFabricVariant) {
        // Tweed-like fabric target: matte, soft contrast, almost no glossy rolloff.
        return {
          ...modelCalibration,
          forceBaseColorHex: "#efeae2",
          disableBaseColorMap: true,
          brightness: 1.08,
          saturation: 0.68,
          roughnessOverride: 0.98,
          metalnessOverride: 0,
          aoMapIntensity: 0.3,
          emissiveBoost: 0,
          specularIntensityOverride: 0.02,
          clearcoatOverride: 0,
          clearcoatRoughnessOverride: 1,
        };
      }

      if (!isLeatherVariant && !isCocoaLeatherVariant && !isIvoryLeatherVariant) return modelCalibration;

      if (isCocoaLeatherVariant) {
        // Cocoa Marche leather: rich warm chocolate-brown saddle tone.
        // Reference eyedrop mid-tone #805134 → albedo ~#a87050. Lift brightness
        // and add a small emissive fill so the GLB's baked shadows don't collapse it.
        return {
          ...modelCalibration,
          forceBaseColorHex: "#a87050",
          disableBaseColorMap: true,
          brightness: 1.06,
          saturation: 1.04,
          roughnessOverride: 0.7,
          metalnessOverride: 0.02,
          aoMapIntensity: 0.12,
          emissiveBoost: 0.06,
          specularIntensityOverride: 0.24,
          clearcoatOverride: 0.08,
          clearcoatRoughnessOverride: 0.72,
        };
      }

      if (isIvoryLeatherVariant) {
        // Ivory Marche leather: warm cream/parchment. Reference eyedrop mid-tone
        // #b4afa6 → albedo ~#d0c8b4. Reduce brightness (was 1.2 → pure white) and
        // add warm saturation so it reads as cream, not grey-white.
        return {
          ...modelCalibration,
          forceBaseColorHex: "#cfc4ae",
          disableBaseColorMap: true,
          brightness: 0.9,
          saturation: 1.06,
          roughnessOverride: 0.8,
          metalnessOverride: 0,
          aoMapIntensity: 0.08,
          emissiveBoost: 0.04,
          specularIntensityOverride: 0.14,
          clearcoatOverride: 0.04,
          clearcoatRoughnessOverride: 0.84,
        };
      }

      // Jaron default leather: aligns with cross-brand leather baseline.
      return {
        ...modelCalibration,
        brightness: 0.96,
        saturation: 1.08,
        roughnessOverride: 0.38,
        metalnessOverride: 0.04,
        normalScale: 0.5,
        aoMapIntensity: 0.26,
        emissiveBoost: 0.03,
        specularIntensityOverride: 0.48,
        clearcoatOverride: 0.24,
        clearcoatRoughnessOverride: 0.44,
      };
    }

    if (!isLeatherVariant && !isCocoaLeatherVariant && !isIvoryLeatherVariant) return modelCalibration;

    if (isGraphiteLeatherVariant) {
      // Graphite leather should stay deep, but avoid crushed blacks on large cushions.
      return {
        ...modelCalibration,
        brightness: 1.18,
        saturation: 1.05,
        roughnessOverride: 0.3,
        metalnessOverride: 0.04,
        normalScale: 0.5,
        aoMapIntensity: 0.24,
        emissiveBoost: 0.04,
        specularIntensityOverride: 0.7,
        clearcoatOverride: 0.34,
        clearcoatRoughnessOverride: 0.48,
      };
    }

    // Leather: semi-gloss with visible clearcoat sheen regardless of geometry.
    // Low roughness + high clearcoat so broad cushion faces still catch env reflections.
    // normalScale: 0.5 prevents inheriting fabric-level bump (e.g. Dawson base 4.2)
    // which scatters specular and makes leather read as matte.
    return {
      ...modelCalibration,
      brightness: 0.96,
      saturation: 1.08,
      roughnessOverride: 0.31,
      metalnessOverride: 0.04,
      normalScale: 0.5,
      aoMapIntensity: 0.32,
      emissiveBoost: 0.03,
      specularIntensityOverride: 0.6,
      clearcoatOverride: 0.3,
      clearcoatRoughnessOverride: 0.44,
    };
  })();

  useEffect(() => {
    let cancelled = false;

    if (!modelUrl || !expectedModelUrl) {
      const frameId = window.requestAnimationFrame(() => {
        setModelExists(false);
        setRuntimeModelUrl(null);
        setModelLoadState("idle");
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    // Do not preflight with HEAD requests: some valid model hosts and dev servers
    // reject HEAD while serving GET successfully, which hides models incorrectly.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setRuntimeModelUrl(expectedModelUrl);
      setModelExists(true);
      setModelLoadState("loading");
    });

    return () => {
      cancelled = true;
    };
  }, [expectedModelUrl, modelUrl]);

  const shouldLoadModel =
    viewMode === "3d" && renderQuality !== "lite" && Boolean(runtimeModelUrl) && modelExists;
  const showModel = shouldLoadModel && modelLoadState === "ready";
  const shouldWaitForModel =
    viewMode === "3d" && renderQuality !== "lite" && Boolean(expectedModelUrl);
  const renderReady =
    !shouldWaitForModel ||
    (runtimeModelUrl === expectedModelUrl &&
      (modelLoadState === "ready" || modelLoadState === "error"));

  useEffect(() => {
    if (!renderReadyKey) return;
    onRenderReadyChange?.(renderReadyKey, renderReady);
  }, [onRenderReadyChange, renderReady, renderReadyKey]);

  return (
    <group
      ref={groupRef}
      position={[
        clampedPosition[0],
        viewMode === "2d" ? 0.01 : (clampedPosition[1] ?? 0) + height / 2,
        clampedPosition[2],
      ]}
      rotation-y={finalRotation}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect?.(instanceId, Boolean(e.shiftKey));
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerMove={onPointerMove}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
      }}
    >
      {shouldLoadModel && runtimeModelUrl ? (
        <Suspense fallback={null}>
          <GLBScaledModel
            url={runtimeModelUrl}
            productId={product.id}
            variantId={variantId}
            width={width}
            height={height}
            depth={depth}
            nodeTransforms={nodeTransforms}
            calibration={effectiveModelCalibration}
            variantColorHex={shouldTintVariantColor ? variantColor : undefined}
            variantName={variantName}
            variantRenderAssets={variantRenderAssets}
            pendantCableAdjustment={pendantCableAdjustment}
            onLoadStateChange={(state) => {
              if (state === "loading") setModelLoadState("loading");
              else if (state === "ready") setModelLoadState("ready");
              else setModelLoadState("error");
            }}
          />
        </Suspense>
      ) : null}

      {viewMode === "2d" ? (
        <ItemRenderer2D
          width={planningWidth}
          depth={planningDepth}
          color={materialProps.color}
          category={product.category}
          selected={Boolean(showSelection && isSelected)}
          hovered={hovered}
          dragging={dragging}
          snapped={isSnapped}
          invalidPlacement={invalidPlacement}
          showLabels={planShowLabels}
          showDimensions={planShowDimensions}
          measurementUnit={planMeasurementUnit}
          label={product.title}
          rotationHudLabel={rotationHudLabel}
          onRotateHandlePointerDown={onRotateHandlePointerDown}
          onRotateHandlePointerMove={onRotateHandlePointerMove}
          onRotateHandlePointerUp={onRotateHandlePointerUp}
        />
      ) : (
        <mesh castShadow receiveShadow visible={!showModel}>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial
            color={
              dragging
                ? isSnapped
                  ? "#a8de7e" // green when snapped
                  : "#b8a48a" // tan while dragging unsnaped
                : materialProps.color
            }
            roughness={materialProps.roughness}
            metalness={materialProps.metalness}
            emissive={
              showSelection && isSelected
                ? "#2a66ff"
                : cartPreviewed
                  ? "#8f6d45"
                : isSnapped && dragging
                  ? "#5ec91f"
                  : "#000000"
            }
            emissiveIntensity={
              showSelection && isSelected ? 0.15 : cartPreviewed ? 0.12 : isSnapped && dragging ? 0.3 : 0
            }
          />
        </mesh>
      )}
      {viewMode === "3d" && showSelection && isSelected ? (
        <mesh
          raycast={() => null}
          renderOrder={24}
          userData={{ testId: "selected-furniture-outline" }}
        >
          <boxGeometry args={[width + 0.05, height + 0.05, depth + 0.05]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
          <Edges
            scale={1.012}
            color="#2563eb"
            lineWidth={2.5}
            depthTest={false}
            threshold={12}
          />
        </mesh>
      ) : null}
      {Math.abs(planningWidth - width) > EDITOR_GEOMETRY_TOLERANCES.dimensionMeters ||
      Math.abs(planningDepth - depth) > EDITOR_GEOMETRY_TOLERANCES.dimensionMeters ? (
        <Line
          points={[
            [-planningWidth / 2, 0.01, -planningDepth / 2],
            [planningWidth / 2, 0.01, -planningDepth / 2],
            [planningWidth / 2, 0.01, planningDepth / 2],
            [-planningWidth / 2, 0.01, planningDepth / 2],
            [-planningWidth / 2, 0.01, -planningDepth / 2],
          ]}
          color="#d97706"
          lineWidth={1.5}
          dashed
          dashSize={0.08}
          gapSize={0.05}
        />
      ) : null}
      {viewMode === "2d" && showSelection && isPrimarySelected && !dragging && !rotateDragging && (
        <Html
          zIndexRange={[18, 0]}
          position={[0, 0.08, -planningDepth / 2 - 0.34]}
          center
          transform={false}
        >
          <div
            data-testid="selected-furniture-action-chips"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: 4,
              border: "1px solid rgba(37,99,235,0.24)",
              borderRadius: 999,
              background: "rgba(255,255,255,0.96)",
              boxShadow: "0 8px 22px rgba(15,23,42,0.14)",
              pointerEvents: "auto",
              whiteSpace: "nowrap",
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {[
              {
                id: "rotate",
                label: "Rotate",
                disabled: locked || !interactive || !onRotate,
                action: () =>
                  onRotate?.(instanceId, rotation + Math.PI / 2, {
                    source: "canvas",
                    snap: true,
                  }),
              },
              {
                id: "copy",
                label: "Copy",
                disabled: locked || !interactive || !onDuplicate,
                action: () => onDuplicate?.(instanceId),
              },
              {
                id: "delete",
                label: "Delete",
                disabled: locked || !interactive || !onDelete,
                action: () => onDelete?.(instanceId),
              },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                data-testid={`selected-furniture-${chip.id}`}
                aria-label={`${chip.label} selected furniture`}
                title={`${chip.label} selected furniture`}
                disabled={chip.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  chip.action();
                }}
                style={{
                  border: "none",
                  borderRadius: 999,
                  background: chip.id === "delete" ? "#fee2e2" : "#f3f4f6",
                  color: chip.id === "delete" ? "#991b1b" : "#111827",
                  cursor: chip.disabled ? "not-allowed" : "pointer",
                  fontSize: 10,
                  fontWeight: 800,
                  opacity: chip.disabled ? 0.45 : 1,
                  minWidth: chip.id === "delete" ? 46 : 42,
                  padding: "5px 8px",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </Html>
      )}
      <SnapGuides guides={snapGuides} visible={showGuidesAndMeasurements && dragging} isDesigner={interactive} />
      <Measurements measures={measurements} visible={showGuidesAndMeasurements && dragging} />
      {locked && showLocks && (
        <Html position={[width / 2 - 0.12, height / 2 - 0.12, depth / 2 - 0.12]}>
          <div
            className={`designer-lock ${hovered ? "designer-lock-active" : ""}`}
            title="Locked by designer"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="currentColor"
                d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V7Zm3 9a1 1 0 1 1-2 0v-2a1 1 0 1 1 2 0v2Z"
              />
            </svg>
          </div>
        </Html>
      )}
    </group>
  );
}

export function CameraCapture({
  cameraRef,
  canvasRef,
  rendererRef,
  sceneRef,
}: {
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
}) {
  const { camera, gl, scene } = useThree();

  useFrame(() => {
    cameraRef.current = camera as THREE.Camera;
    rendererRef.current = gl as THREE.WebGLRenderer;
    sceneRef.current = scene;
    canvasRef.current = gl.domElement as HTMLCanvasElement;
  });

  return null;
}
