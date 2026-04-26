"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, Html, Line, useCursor } from "@react-three/drei";
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
import {
  clamp,
  getRotatedFootprint,
  normalizeRotationDegrees,
  ROTATION_SNAP_STEP_DEGREES,
  ROTATION_SNAP_STEP_RADIANS,
  snapRotationRadians,
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
import type { DesignItem } from "@/lib/room-types";
type FurnitureProps = {
  product: CatalogItemSchema;
  planningBoundsMm?: { w: number; d: number; h: number };
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  variantColor: string;
  variantName?: string;
  variantId: string;
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  initialPosition?: [number, number, number];
  initialRotationY?: number;
  roomWidth?: number;
  roomDepth?: number;
  wallThickness?: number;
  margin?: number;
  snapDistance?: number;
  enableSnap?: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  walls?: WallDescriptor[];
  instanceId: string;
  isSelected?: boolean;
  isPrimarySelected?: boolean;
  onSelect?: (id: string, additive: boolean) => void;
  onMove?: (id: string, pos: [number, number, number]) => boolean | void;
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
  initialPosition = [0, 0, -1.4] as [number, number, number],
  initialRotationY = 0,
  roomWidth = 5,
  roomDepth = 4,
  wallThickness = 0.12,
  snapDistance = 0.25,
  enableSnap = true,
  onDraggingChange,
  instanceId,
  isSelected,
  isPrimarySelected = false,
  onSelect,
  onMove,
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
}: FurnitureProps) {
  const width = product.dimsMm.w / 1000;
  const depth = product.dimsMm.d / 1000;
  const height = product.dimsMm.h / 1000;
  const planningWidth = (planningBoundsMm?.w ?? product.dimsMm.w) / 1000;
  const planningDepth = (planningBoundsMm?.d ?? product.dimsMm.d) / 1000;
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
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return null;
    const raw = Math.atan2(dx, -dz);
    const shouldSnap = snapToStep && rotationSnapEnabled;
    return shouldSnap
      ? snapRotationRadians(raw, rotationSnapStepRadians)
      : raw;
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

  // Update position when rotation changes to keep sofa in bounds
  useEffect(() => {
    // Only adjust position for rotation if NOT currently snapped to a wall
    if (snapType === "none") {
      // Calculate new bounds based on current rotation
      const [effW, effD] = getRotatedFootprint(planningWidth, planningDepth, rotation);
      
      const halfRoomW = roomWidth / 2;
      const halfRoomD = roomDepth / 2;
      const halfEffW = effW / 2;
      const halfEffD = effD / 2;
      
      // Use hard bounds: items must maintain distance from walls
      // Walls have physical thickness, so we must account for that
      const hardMinX = -halfRoomW + wallThickness + halfEffW;
      const hardMaxX = halfRoomW - wallThickness - halfEffW;
      const hardMinZ = -halfRoomD + wallThickness + halfEffD;
      const hardMaxZ = halfRoomD - wallThickness - halfEffD;
      
      // Clamp current position to new bounds
      const newX = clamp(position[0], hardMinX, hardMaxX);
      const newZ = clamp(position[2], hardMinZ, hardMaxZ);
      
      if (newX !== position[0] || newZ !== position[2]) {
        const frameId = window.requestAnimationFrame(() => {
          setPosition([newX, 0, newZ]);
        });
        return () => window.cancelAnimationFrame(frameId);
      }
    }
  }, [planningDepth, planningWidth, position, roomDepth, roomWidth, rotation, snapType, wallThickness]);

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
  const halfRoomW = roomWidth / 2;
  const halfRoomD = roomDepth / 2;
  const halfEffectiveW = effectiveWidth / 2;
  const halfEffectiveD = effectiveDepth / 2;

  // Hard constraint bounds: prevent items from exiting the room
  // Walls have physical thickness, so we must account for that
  // Items must stay inside the inner room boundaries (wall edges)
  const hardMinX = -halfRoomW + wallThickness + halfEffectiveW;
  const hardMaxX = halfRoomW - wallThickness - halfEffectiveW;
  const hardMinZ = -halfRoomD + wallThickness + halfEffectiveD;
  const hardMaxZ = halfRoomD - wallThickness - halfEffectiveD;

  // Soft snap bounds: walls where items snap flush
  // Items snap directly to hard bounds (wall edges), no gap
  // The hard bounds already account for item size, so snap position is flush
  const wallLeftX = hardMinX;
  const wallRightX = hardMaxX;
  const wallFrontZ = hardMinZ;
  const wallBackZ = hardMaxZ;

  // Clamp position to hard bounds (prevent going outside room)
  const clampedPosition = [
    clamp(position[0], hardMinX, hardMaxX),
    position[1],
    clamp(position[2], hardMinZ, hardMaxZ),
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
    onDraggingChange?.(false); // notify parent
    if (wasSnapped && interactive) {
      snapBumpUntilRef.current = performance.now() + 160;
      onSnapPulse?.();
      onSnapSuccess?.();
    }
    
    // Trigger constraint check on drag end
    if (interactive && onDragEnd) {
      onDragEnd(instanceId, position);
    }
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || locked) return;
    if (rotateDragging) return;
    if (!dragging) return;
    e.stopPropagation(); // prevent OrbitControls from responding

    raycaster.setFromCamera(e.pointer, e.camera);
    raycaster.ray.intersectPlane(plane, intersection);

    // Hard-clamp to room bounds to prevent going outside
    const x = clamp(intersection.x, hardMinX, hardMaxX);
    const z = clamp(intersection.z, hardMinZ, hardMaxZ);

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

    const nextPos: [number, number, number] = [snappedX, 0, snappedZ];

    // Compute snap guides for visualization
    if (dragging && enableSnap && items && items.length > 0) {
      try {
        const selectedAABB = computeAABB(nextPos, effectiveWidth, effectiveDepth);

        // Find nearby furniture (simple bounds check on all items)
        const neighborGuides = items
          .filter((item) => item.instanceId !== instanceId) // exclude self
          .map((item): SnapNeighbor | null => {
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
              label: `${itemProduct.title}`,
            };
          })
          .filter((item): item is SnapNeighbor => item !== null);

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
        const neighborMeasures = items
          .filter((item) => item.instanceId !== instanceId)
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
          .filter((item): item is { aabb: AABB; name: string } => item !== null);

        const measures = generateMeasurements(
          selectedAABB,
          product.title,
          neighborMeasures,
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
    const baseY = height / 2;
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
  const modelUrl = product?.assets?.modelUrl as string | undefined;
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
  // variantMarker includes variantId (e.g. "cocoa_leather") so check both name and marker.
  const isLeatherVariant = /\bleather\b/i.test(String(variantName ?? "")) || /\bleather\b/i.test(variantMarker);
  const isMadisonStoneFabricVariant =
    product.id.startsWith("sofa-real-castlery-madison-") &&
    /\bstone\b/i.test(String(variantName ?? "")) &&
    /\bfabric\b/i.test(String(variantName ?? ""));
  const isMadisonBisqueFabricVariant =
    product.id.startsWith("sofa-real-castlery-madison-") &&
    /\bbisque\b/i.test(String(variantName ?? "")) &&
    /\bfabric\b/i.test(String(variantName ?? ""));
  const isMadisonCamilleForestFabricVariant =
    product.id.startsWith("sofa-real-castlery-madison-") &&
    /camille,?\s*forest/i.test(String(variantName ?? "")) &&
    /\bfabric\b/i.test(String(variantName ?? ""));
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
  const isPerformanceDuneFabricVariant =
    (product.id.startsWith("sofa-real-castlery-jaron-") &&
      /(?:\bperformance[\s_-]*dune\b|\bdune\b)/.test(variantMarker)) ||
    (/performance\s*dune/i.test(String(variantName ?? "")) &&
      /\bfabric\b/i.test(String(variantName ?? "")));
  const isIvoryLeatherVariant =
    (product.id.startsWith("sofa-real-castlery-jaron-") && /\bivory\b/.test(variantMarker)) ||
    (isLeatherVariant && /\bivory\b/i.test(String(variantName ?? "")));
  const isCocoaLeatherVariant =
    (product.id.startsWith("sofa-real-castlery-jaron-") && /\bcocoa\b/.test(variantMarker)) ||
    (isLeatherVariant && /\bcocoa\b/i.test(String(variantName ?? "")));
  const isGraphiteLeatherVariant =
    isLeatherVariant && /\bgraphite\b/i.test(String(variantName ?? ""));
  const isMadisonCaramelLeatherVariant =
    product.id.startsWith("sofa-real-castlery-madison-") &&
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
  const effectiveModelCalibration: GLBCalibration | undefined = (() => {
    if (!modelCalibration) return modelCalibration;

    if (isMadisonBisqueFabricVariant) {
      // Madison Bisque fabric: warm beige with a softer matte woven response.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#c5b49d",
        brightness: 0.96,
        saturation: 0.86,
        roughnessOverride: 0.97,
        metalnessOverride: 0,
        aoMapIntensity: 0.28,
        emissiveBoost: 0,
        specularIntensityOverride: 0.05,
      };
    }

    if (isMadisonStoneFabricVariant) {
      // Madison Stone fabric: darker charcoal gray with visible woven contrast.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#6b6762",
        brightness: 0.9,
        saturation: 0.9,
        roughnessOverride: 0.94,
        metalnessOverride: 0,
        aoMapIntensity: 0.36,
        emissiveBoost: 0,
        specularIntensityOverride: 0.06,
      };
    }

    if (isMadisonCamilleForestFabricVariant) {
      // Madison Camille, Forest fabric: deep muted green with soft matte weave.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#5a6356",
        brightness: 0.88,
        saturation: 0.84,
        roughnessOverride: 0.98,
        metalnessOverride: 0,
        aoMapIntensity: 0.36,
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

    if (product.id.startsWith("sofa-real-castlery-jaron-")) {
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
          brightness: 1.18,
          saturation: 1.04,
          roughnessOverride: 0.48,
          metalnessOverride: 0.02,
          aoMapIntensity: 0.12,
          emissiveBoost: 0.06,
          specularIntensityOverride: 0.38,
          clearcoatOverride: 0.12,
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
          brightness: 0.98,
          saturation: 1.06,
          roughnessOverride: 0.56,
          metalnessOverride: 0,
          aoMapIntensity: 0.08,
          emissiveBoost: 0.04,
          specularIntensityOverride: 0.22,
          clearcoatOverride: 0.06,
          clearcoatRoughnessOverride: 0.84,
        };
      }

      // Jaron default leather: aligns with cross-brand leather baseline.
      return {
        ...modelCalibration,
        brightness: 1.06,
        saturation: 1.08,
        roughnessOverride: 0.26,
        metalnessOverride: 0.04,
        normalScale: 0.5,
        aoMapIntensity: 0.26,
        emissiveBoost: 0.03,
        specularIntensityOverride: 0.75,
        clearcoatOverride: 0.38,
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
      brightness: 1.06,
      saturation: 1.08,
      roughnessOverride: 0.26,
      metalnessOverride: 0.04,
      normalScale: 0.5,
      aoMapIntensity: 0.32,
      emissiveBoost: 0.03,
      specularIntensityOverride: 0.75,
      clearcoatOverride: 0.38,
      clearcoatRoughnessOverride: 0.44,
    };
  })();

  useEffect(() => {
    let cancelled = false;

    if (!modelUrl) {
      const frameId = window.requestAnimationFrame(() => {
        setModelExists(false);
        setRuntimeModelUrl(null);
        setModelLoadState("idle");
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const candidates = [preferredModelUrl, modelUrl].filter(
      (value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index
    );

    if (candidates.length === 0) {
      return;
    }

    (async () => {
      for (const candidate of candidates) {
        try {
          const res = await fetch(candidate, { method: "HEAD" });
          if (cancelled) return;
          if (res.ok) {
            setRuntimeModelUrl(candidate);
            setModelExists(true);
            setModelLoadState("loading");
            return;
          }
        } catch {
          // Try next fallback candidate.
        }
      }
      if (cancelled) return;
      setRuntimeModelUrl(null);
      setModelExists(false);
      setModelLoadState("error");
    })();

    return () => {
      cancelled = true;
    };
  }, [modelUrl, preferredModelUrl]);

  const shouldLoadModel = viewMode === "3d" && Boolean(runtimeModelUrl) && modelExists;
  const showModel = shouldLoadModel && modelLoadState === "ready";

  return (
    <group
      ref={groupRef}
      position={[clampedPosition[0], viewMode === "2d" ? 0.01 : height / 2, clampedPosition[2]]}
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
            width={width}
            height={height}
            depth={depth}
            nodeTransforms={nodeTransforms}
            calibration={effectiveModelCalibration}
            variantColorHex={variantColor}
            variantName={variantName}
            variantRenderAssets={variantRenderAssets}
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
          {showSelection && isSelected && <Edges scale={1.01} />}
        </mesh>
      )}
      {Math.abs(planningWidth - width) > 0.001 || Math.abs(planningDepth - depth) > 0.001 ? (
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

