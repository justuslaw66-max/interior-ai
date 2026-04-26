"use client";

import * as THREE from "three";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Edges, Environment, Html, Line, useCursor } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { signIn, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthButtons } from "@/components/AuthButtons";
import { DesignerGrid } from "@/components/scene/DesignerGrid";
import { LoadingOverlay } from "@/components/scene/LoadingOverlay";
import { RoomSkeleton } from "@/components/scene/RoomSkeleton";
import { SceneProgressBridge } from "@/components/scene/SceneProgressBridge";
import CartSidebar from "@/components/CartSidebar";
import { SnapGuides } from "@/components/SnapGuides";
import { Measurements } from "@/components/Measurements";
import { LightingPresetsUI } from "@/components/LightingPresetsUI";
import { LIGHTING_PRESETS, type LightingPreset } from "@/lib/lightingPresets";
import { CATALOG_ITEMS, CATALOG_ITEMS_MAP } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { bulkSwapItems } from "@/lib/bulkSwap";
import { isPro, type Plan } from "@/lib/plan";
import { useEditorMode } from "@/hooks/useEditorMode";
import { useUndoRedoHotkeys } from "@/hooks/useUndoRedoHotkeys";
import { HistoryManager } from "@/lib/historyManager";
import { track } from "@/lib/analytics";
import { getAnonId } from "@/lib/anon";
import { preloadCoreAssets } from "@/lib/preloadAssets";
import { canAddToCart, reconcileCart, getNonBuyableReason } from "@/lib/commerce-helpers";
import { evaluateConstraints, type ConstraintResult } from "@/lib/constraints/evaluate";
import { initializeCatalog } from "@/lib/catalog-init";
import {
  isOnboardingEligible,
  checkActivation,
  getNextBestActionNudge,
  EventDedup,
  type OnboardingState,
} from "@/lib/onboarding";
import { applyAISuggestionAction, type AISuggestionAction } from "@/lib/ai/applySuggestion";
import {
  computeSnapCandidates,
  computeAABB,
  pickGuides,
  snapGuideToGuide,
  type Guide,
  type AABB,
} from "@/lib/snapGuides";
import { generateMeasurements, type Measure } from "@/lib/measurements";
import { getDefaultPreset, getPresetById, getPresetsForCategory } from "@/lib/materialPresets";
import {
  saveGuestDesign,
  loadGuestDesigns,
  markGuestDesignClaimed,
} from "@/lib/guestDesigns";
import { findSwapOptions } from "../lib/swap";
import type { DesignSnapshot as MultiRoomSnapshot, DesignItem, ZoneMin } from "@/lib/room-types";
import { getActiveRoom, switchRoom, createRoom, addRoom, migrateToV3 } from "@/lib/room-types";
import { getAllRoomNames } from "@/lib/room-hooks";
import { RoomSwitcher } from "@/components/RoomSwitcher";
import { legacyApiToSnapshot, snapshotToLegacyApi } from "@/lib/room-persistence";

const STYLES = ["Scandi", "Luxury", "Modern", "Japandi", "Minimalistic"] as const;
type Style = (typeof STYLES)[number];

type CameraView = {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
};

type NamedCameraView = {
  name: string;
  view: CameraView;
};

type LayoutPlan = {
  picks?: Partial<Record<"sofa" | "rug" | "coffee_table" | "tv_console" | "accent_chair" | "floor_lamp", string>>;
};

type AINotesResponse = {
  summary: string[];
  rationale: string;
  suggestions: Array<{
    id: string;
    label: string;
    action: AISuggestionAction;
  }>;
  cached?: boolean;
  ms?: number;
};

type SnapNeighbor = {
  aabb: AABB;
  label: string;
};

type WallDescriptor = {
  axis: "x" | "z";
  coord: number;
  min: number;
  max: number;
};

type FurnitureProps = {
  product: CatalogItemSchema;
  variantColor: string;
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
  onSelect?: (id: string, additive: boolean) => void;
  onMove?: (id: string, pos: [number, number, number]) => boolean | void;
  onRotate?: (id: string, rotationY: number) => boolean | void;
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
  showGuidesAndMeasurements?: boolean;
  "data-testid"?: string;
};

/**
 * Room bounds define the available floor space for furniture placement.
 * All values in meters, centered at origin (0, 0).
 */
type RoomBounds = {
  width: number;   // Total room width (X axis)
  depth: number;   // Total room depth (Z axis)
  height?: number; // Room height (optional, for ceiling references)
  wallThickness?: number; // Wall thickness for constraint calculations
};

const STORAGE_KEY = "interior-ai:v1:livingroom-design";

// Helper to extract price from catalog item commerce mapping
function getItemPrice(item: CatalogItemSchema | undefined | null): number {
  if (!item) return 0;
  if (item.commerce.type === "affiliate") {
    return item.commerce.data.priceHint ?? 0;
  }
  return 0;
}

// Helper to get dimensions in meters from catalog item
function getDimensions(item: CatalogItemSchema) {
  return {
    w: item.dimsMm.w / 1000,
    d: item.dimsMm.d / 1000,
    h: item.dimsMm.h / 1000,
  };
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatTimeAgo(ts: number) {
  const delta = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type SnapType = "none" | "wall-left" | "wall-right" | "wall-front" | "wall-back";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getRotatedFootprint(
  itemWidth: number,
  itemDepth: number,
  rotationY: number
): [number, number] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const effW = Math.abs(cos) * itemWidth + Math.abs(sin) * itemDepth;
  const effD = Math.abs(sin) * itemWidth + Math.abs(cos) * itemDepth;
  return [effW, effD];
}


function _snapToNearest(value: number, snapDistance: number): number {
  const snapSize = 0.5; // snap to 0.5m grid
  const snapped = Math.round(value / snapSize) * snapSize;
  return Math.abs(value - snapped) < snapDistance ? snapped : value;
}

type RoomProps = {
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
};

function Room({
  width = 5,
  depth = 4,
  height = 2.6,
  wallThickness = 0.12,
}: RoomProps) {
  const floorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d4c6b4",
        roughness: 0.95,
        metalness: 0.0,
      }),
    []
  );

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ece4d8",
        roughness: 0.98,
        metalness: 0.0,
      }),
    []
  );

  const halfW = width / 2;
  const halfD = depth / 2;

  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <primitive object={floorMat} attach="material" />
      </mesh>

      <mesh
        receiveShadow
        castShadow
        position={[0, height / 2, -halfD + wallThickness / 2]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        receiveShadow
        castShadow
        position={[0, height / 2, halfD - wallThickness / 2]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        receiveShadow
        castShadow
        position={[-halfW + wallThickness / 2, height / 2, 0]}
      >
        <boxGeometry args={[wallThickness, height, depth]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        receiveShadow
        castShadow
        position={[halfW - wallThickness / 2, height / 2, 0]}
      >
        <boxGeometry args={[wallThickness, height, depth]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
    </group>
  );
}

function ZoneOutline({
  bounds,
  label,
  selected,
  onSelect,
}: {
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
  };
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const points = useMemo(() => {
    const y = 0.02;
    return [
      new THREE.Vector3(bounds.minX, y, bounds.minZ),
      new THREE.Vector3(bounds.maxX, y, bounds.minZ),
      new THREE.Vector3(bounds.maxX, y, bounds.maxZ),
      new THREE.Vector3(bounds.minX, y, bounds.maxZ),
      new THREE.Vector3(bounds.minX, y, bounds.minZ),
    ];
  }, [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ]);

  return (
    <group>
      <Line
        points={points}
        dashed
        dashSize={0.2}
        gapSize={0.12}
        color={selected ? "#5ec91f" : "#7a8aa0"}
        opacity={selected ? 0.9 : 0.5}
        transparent
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {selected && (
        <Html position={[bounds.centerX, 0.05, bounds.centerZ]}>
          <div
            style={{
              background: "rgba(20, 24, 32, 0.85)",
              color: "#ffffff",
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function Furniture({
  product,
  variantColor,
  initialPosition = [0, 0, -1.4] as [number, number, number],
  initialRotationY = 0,
  roomWidth = 5,
  roomDepth = 4,
  wallThickness = 0.12,
  margin: _margin = 0.05,
  snapDistance = 0.25,
  enableSnap = true,
  onDraggingChange,
  walls: _walls,
  instanceId,
  isSelected,
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
  showGuidesAndMeasurements = true,
}: FurnitureProps) {
  const width = product.dimsMm.w / 1000;
  const depth = product.dimsMm.d / 1000;
  const height = product.dimsMm.h / 1000;
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<[number, number, number]>(
    initialPosition
  );
  const [rotation, setRotation] = useState(initialRotationY); // Y-axis rotation in radians
  const [snapType, setSnapType] = useState<SnapType>("none"); // Track current snap type for auto-facing
  const [snapGuides, setSnapGuides] = useState<Guide[]>([]); // Snap visualization guides
  const [measurements, setMeasurements] = useState<Measure[]>([]); // Real-time measurements
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const shakeUntilRef = useRef(0);
  const placementStartRef = useRef<number | null>(null);
  const snapBumpUntilRef = useRef(0);

  // Compute material properties from preset
  const materialProps = useMemo(() => {
    // Get preset (use materialPreset if provided, otherwise get default for category)
    let preset =
      materialPreset && materialPreset
        ? getPresetById(product.category, materialPreset)
        : null;

    if (!preset) {
      preset = getDefaultPreset(product.category);
    }

    if (!preset) {
      // Fallback if no presets for category
      return {
        color: variantColor,
        roughness: 0.8,
        metalness: 0.05,
      };
    }

    // Apply overrides if provided
    const color = materialOverrides?.colorHex || preset.color;
    const roughness = materialOverrides?.roughness !== undefined ? materialOverrides.roughness : preset.roughness;
    const metalness = materialOverrides?.metalness !== undefined ? materialOverrides.metalness : preset.metalness;

    return { color, roughness, metalness };
  }, [product.category, materialPreset, materialOverrides, variantColor]);

  useEffect(() => {
    if (dragging) return;
    const frameId = window.requestAnimationFrame(() => {
      setPosition(initialPosition);
      setRotation(initialRotationY);
      setSnapType("none");
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [dragging, initialPosition, initialRotationY]);

  useCursor(hovered && Boolean(locked), "not-allowed");

  useEffect(() => {
    if (!interactive) return;
    placementStartRef.current = performance.now();
  }, [instanceId, interactive]);

  // Keyboard listener for rotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (locked || !interactive) return;
      if ((e.key === "r" || e.key === "R") && !dragging) {
        setRotation((prev: number) => {
          const next = prev + Math.PI / 2;
          const accepted = onRotate?.(instanceId, next);
          return accepted === false ? prev : next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dragging, instanceId, locked, interactive, onRotate]);

  // Update position when rotation changes to keep sofa in bounds
  useEffect(() => {
    // Only adjust position for rotation if NOT currently snapped to a wall
    if (snapType === "none") {
      // Calculate new bounds based on current rotation
      const [effW, effD] = getRotatedFootprint(width, depth, rotation);
      
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
  }, [depth, position, roomDepth, roomWidth, rotation, snapType, wallThickness, width]);

  // Reuse objects (avoid recreating every render)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);

  // Calculate effective dimensions based on rotation (axis-aligned footprint)
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
    width,
    depth,
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
      const selectedAABB = computeAABB(nextPos, effectiveWidth, effectiveDepth);
      
      // Find nearby furniture (simple bounds check on all items)
      const neighborGuides = items
        .filter((item) => item.instanceId !== instanceId) // exclude self
        .map((item): SnapNeighbor | null => {
          const itemProduct = CATALOG_ITEMS[item.productId];
          if (!itemProduct) return null;
          const itemRotation = item.rotationY ?? 0;
          const [itemWidth, itemDepth] = getRotatedFootprint(
            itemProduct.dimsMm.w / 1000,
            itemProduct.dimsMm.d / 1000,
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
          const itemRotation = item.rotationY ?? 0;
          const [itemWidth, itemDepth] = getRotatedFootprint(
            itemProduct.dimsMm.w / 1000,
            itemProduct.dimsMm.d / 1000,
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
    } else {
      setSnapGuides([]);
      setMeasurements([]);
    }

    const accepted = onMove?.(instanceId, nextPos);
    if (accepted === false) return;
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

    if (!interactive || dragging) {
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

  const _baseColor = useMemo(() => {
    if (!locked) return variantColor;
    const color = new THREE.Color(variantColor);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, hsl.s * 0.9, hsl.l);
    return `#${color.getHexString()}`;
  }, [locked, variantColor]);

  // finalRotation is the current rotation state (set directly when snapping)
  const finalRotation = rotation;

  return (
    <group
      ref={groupRef}
      position={[clampedPosition[0], height / 2, clampedPosition[2]]}
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
      <mesh castShadow receiveShadow>
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
              : isSnapped && dragging
                ? "#5ec91f"
                : "#000000"
          }
          emissiveIntensity={
            showSelection && isSelected ? 0.15 : isSnapped && dragging ? 0.3 : 0
          }
        />
        {showSelection && isSelected && <Edges scale={1.01} />}
      </mesh>
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

function CameraCapture({
  cameraRef,
  canvasRef,
  rendererRef,
  sceneRef,
}: {
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
}) {
  const { camera, gl, scene } = useThree();

  useFrame(() => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
    rendererRef.current = gl as THREE.WebGLRenderer;
    sceneRef.current = scene;
    canvasRef.current = gl.domElement as HTMLCanvasElement;
  });

  return null;
}

function PageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const stripeSessionId = searchParams.get("session_id");
  const [sofaDragging, setSofaDragging] = useState(false);
  const [designId, setDesignId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [_shareOrigin, setShareOrigin] = useState("");
  const [style, setStyle] = useState<Style>("Modern");
  const [budget, setBudget] = useState<"$" | "$$" | "$$$">("$$");
  const [mode, setMode] = useState<"homeowner" | "designer">(
    urlMode === "designer" ? "designer" : "homeowner"
  );
  const [notes, setNotes] = useState("");
  const [aiSeed, setAiSeed] = useState<number>(Date.now());
  const [plan, setPlan] = useState<Plan>("free");
  const [_refreshingPlan, setRefreshingPlan] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"designer" | "export_images" | "export_pdf" | null>(null);
  const [showAINotes, setShowAINotes] = useState(false);
  const [aiNotesLoading, setAiNotesLoading] = useState(false);
  const [aiNotesData, setAiNotesData] = useState<AINotesResponse | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridPulse, setGridPulse] = useState(false);
  const [clientPreview, setClientPreview] = useState(false);
  
  // Onboarding state model (new system)
  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    enabled: false,
    step: "idle",
    startedAtMs: Date.now(),
    lastInteractionAtMs: Date.now(),
    dismissedHints: {},
  });
  
  // Onboarding timings and UI state
  const [_sofaNudgeVisible, setSofaNudgeVisible] = useState(false);
  const [_sofaReinforceMessage, setSofaReinforceMessage] = useState<string | null>(null);
  const [_emptyStateCoaching, _setEmptyStateCoaching] = useState<string | null>(null);
  const [nextBestActionNudge, setNextBestActionNudge] = useState<string | null>(null);
  const [_ghostSuggestions, setGhostSuggestions] = useState<
    Array<{
      id: string;
      productId: string;
      position: [number, number, number];
      rotationY?: number;
    }>
  >([]);
  const [_showGhostHint, setShowGhostHint] = useState(false);
  const [lastLocalAutosaveAt, setLastLocalAutosaveAt] = useState<number | null>(
    null
  );
  const [lastDbSaveAt, setLastDbSaveAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [snapToast, setSnapToast] = useState(false);
  const [ruleToast, setRuleToast] = useState<string | null>(null);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>("daylight");
  const [cameraView, setCameraView] = useState<CameraView>({
    pos: [4.5, 3.2, 5.5],
    target: [0, 1.1, 0],
    fov: 45,
  });
  const [savedViews, setSavedViews] = useState<NamedCameraView[]>([]);
  const [_showCartPanel, _setShowCartPanel] = useState(false);
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [presentModeRoomId, setPresentModeRoomId] = useState<string | null>(null);
  const [sharingDesign, setSharingDesign] = useState(false);
  const [shareSuccessToast, setShareSuccessToast] = useState(false);
  const [shareErrorToast, setShareErrorToast] = useState<string | null>(null);
  const [shareLinkFallback, setShareLinkFallback] = useState<string | null>(null);
  const [showMyDesigns, setShowMyDesigns] = useState(false);
  const [myDesigns, setMyDesigns] = useState<Array<{ id: string; title: string; createdAt: string }>>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  
  // Editor Modes
  type EditorMode = "design" | "adjust" | "buy" | "present";
  const [editorMode, setEditorMode] = useState<EditorMode>("design");
  const wantsDesigner = urlMode === "designer";
  const canUseDesigner = plan === "pro";
  const { isDesigner, isClientPreview } = useEditorMode(plan, clientPreview);
  const showDesignerTheme = isDesigner && !isClientPreview;
  const gridPulseTimerRef = useRef<number | null>(null);
  const firstInteractionRef = useRef(false);
  const firstSaveRef = useRef(false);
  const upgradeShownRef = useRef(false);
  const designerAttemptRef = useRef(false);
  const editorOpenedRef = useRef(false);
  const guestPromptActionRef = useRef<null | (() => void)>(null);
  const [guestPromptReason, setGuestPromptReason] = useState<string | null>(null);
  const dragCommitRef = useRef(false);
  const snapToastTimerRef = useRef<number | null>(null);
  const ruleToastTimerRef = useRef<number | null>(null);
  const onboardingStartedAtRef = useRef<number | null>(null);
  const _onboardingStartTrackedRef = useRef(false);
  const firstItemTrackedRef = useRef(false);
  const _firstValidLayoutRef = useRef(false);
  const _onboardingCompletedRef = useRef(false);
  const seatingZoneAutoDisabledRef = useRef(false);
  const sofaNudgeTimerRef = useRef<number | null>(null);
  const ghostTimerRef = useRef<number | null>(null);
  const firstSofaHandledRef = useRef(false);
  const nudgeShownCountRef = useRef(0);
  const lastActionTimeRef = useRef<number>(Date.now());
  const stallDetectionTimerRef = useRef<number | null>(null);
  const eventDedupRef = useRef(EventDedup.createSession());
  
  // Smart Constraints + Visual Feedback state
  const [constraintResults, setConstraintResults] = useState<ConstraintResult[]>([]);
  const [layoutConfidence, setLayoutConfidence] = useState<string | null>(null);
  const constraintTimerRef = useRef<number | null>(null);
  const confidenceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("onboarded");
      if (stored === "1") {
        setOnboardingState((prev) => ({
          ...prev,
          enabled: false,
          step: "completed",
        }));
      }
      const seatingDisabled = localStorage.getItem("seating_zone_auto_disabled");
      seatingZoneAutoDisabledRef.current = seatingDisabled === "1";
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    preloadCoreAssets();
  }, []);

  // Check onboarding eligibility and enable if needed
  useEffect(() => {
    const eligible = isOnboardingEligible({
      isNewUser: !onboardingState.enabled && onboardingState.step === "idle",
      isPro: plan === "pro",
      isShared: !!shareToken,
      isClientPreview,
      mode: editorMode,
    });

    if (eligible && !onboardingState.enabled) {
      const now = Date.now();
      setOnboardingState({
        enabled: true,
        step: "prompt_add_sofa",
        startedAtMs: now,
        lastInteractionAtMs: now,
        dismissedHints: {},
      });
      setSofaNudgeVisible(true);
      onboardingStartedAtRef.current = now;
      track("onboarding_started", {
        design_id: designId,
        plan,
        isGuest: !session?.user,
      });
    }
  }, [plan, shareToken, isClientPreview, editorMode, session?.user, designId, onboardingState.enabled, onboardingState.step]);

  // Auto-open present modal when entering present mode
  useEffect(() => {
    if (editorMode === "present") {
      setShowPresentModal(true);
      // Reset present mode room (will default to activeRoomId in render)
      setPresentModeRoomId(null);
    } else if (editorMode === "buy") {
      // Clear selection when entering BUY mode
      setSelectedIds(new Set());
      setPrimaryId(null);
      setSelectedZoneId(null);
    }
  }, [editorMode]);

  const showSnapToastOnce = useCallback(() => {
    if (isClientPreview) return;
    try {
      if (sessionStorage.getItem("snap_toast_shown")) return;
      sessionStorage.setItem("snap_toast_shown", "1");
    } catch {
      // ignore storage errors
    }
    setSnapToast(true);
    if (snapToastTimerRef.current) {
      window.clearTimeout(snapToastTimerRef.current);
    }
    snapToastTimerRef.current = window.setTimeout(() => {
      setSnapToast(false);
      snapToastTimerRef.current = null;
    }, 1200);
  }, [isClientPreview]);

  const showRuleToast = useCallback(
    (message: string) => {
      if (isClientPreview) return;
      setRuleToast(message);
      if (ruleToastTimerRef.current) {
        window.clearTimeout(ruleToastTimerRef.current);
      }
      ruleToastTimerRef.current = window.setTimeout(() => {
        setRuleToast(null);
        ruleToastTimerRef.current = null;
      }, 1500);
    },
    [isClientPreview]
  );

  // Show constraint results (auto-dismiss after 1.8 seconds)
  const showConstraintsForMoment = useCallback(
    (results: ConstraintResult[]) => {
      if (isClientPreview || editorMode !== "design") return;
      setConstraintResults(results);

      if (constraintTimerRef.current) {
        window.clearTimeout(constraintTimerRef.current);
      }

      constraintTimerRef.current = window.setTimeout(() => {
        setConstraintResults([]);
        constraintTimerRef.current = null;
      }, 1800);
    },
    [isClientPreview, editorMode]
  );

  const showConfidenceSummary = useCallback(
    (results: ConstraintResult[]) => {
      if (isClientPreview || editorMode !== "design") return;
      const issueCount = results.filter((item) => item.level !== "ok").length;
      const message =
        issueCount === 0
          ? "Layout looks good"
          : issueCount === 1
          ? "1 spacing issue detected"
          : `${issueCount} spacing issues detected`;

      if (confidenceTimerRef.current) {
        window.clearTimeout(confidenceTimerRef.current);
      }

      confidenceTimerRef.current = window.setTimeout(() => {
        setLayoutConfidence(message);
        window.setTimeout(() => {
          setLayoutConfidence(null);
        }, 1500);
      }, 700);
    },
    [isClientPreview, editorMode]
  );

  const pickTopConstraints = (items: ConstraintResult[]) => {
    const errors = items.filter((item) => item.level === "error");
    if (errors.length) return [errors[0]];
    const warns = items.filter((item) => item.level === "warn");
    if (warns.length) return warns.slice(0, 2);
    const oks = items.filter((item) => item.level === "ok");
    return oks.slice(0, 1);
  };


  const setUrlMode = (nextMode: "designer" | "homeowner") => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "designer") {
      params.set("mode", "designer");
    } else {
      params.delete("mode");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const openGuestPrompt = (reason: string, onContinue: () => void) => {
    guestPromptActionRef.current = onContinue;
    setGuestPromptReason(reason);
  };

  const claimGuestDesign = async () => {
    if (session?.user) return;
    const anonId = getAnonId();
    const existing = loadGuestDesigns().find((d) => d.localId === "current");
    if (existing?.dbDesignId) return;

    const payload = {
      anonymousId: anonId,
      roomType: "living_room",
      itemsCount: items.length,
      designSnapshot: {
        title: "Guest Design",
        roomWidth,
        roomDepth,
        items,
        zones,
        style,
        budget,
        mode,
        notes,
      },
    };

    const res = await fetch("/api/designs/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.designId) {
      markGuestDesignClaimed("current", data.designId);
    }
  };

  const saveDesignToCloud = async () => {
    try {
      // NEW: Convert to legacy API format for backward compatibility
      const legacyData = snapshotToLegacyApi(designSnapshotRef.current);
      
      const payload = {
        title: "My Living Room",
        ...legacyData,
        savedViews,
        style,
        budget,
        mode,
        notes,
      };

      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorMessage = "Unknown error";
        try {
          const textResponse = await res.text();
          if (textResponse) {
            try {
              const errorData = JSON.parse(textResponse);
              errorMessage = errorData?.error || "Unknown error";
            } catch {
              errorMessage = `Server error (${res.status}): ${textResponse}`;
            }
          } else {
            errorMessage = `Server error (${res.status}): No response body`;
          }
        } catch {
          errorMessage = `Server error (${res.status}): Unable to read response`;
        }
        if (res.status === 403) {
          setShowUpgrade(true);
          track("upgrade_prompt_shown", { reason: "max_designs" });
        }
        alert(`Save failed: ${errorMessage}`);
        return null;
      }

      const data = await res.json();
      if (data?.id) {
        setDesignId(data.id);
        setLastDbSaveAt(Date.now());
        fetchShareStatus(data.id);
        if (isDesigner) {
          void enableShare(data.id);
        }
        if (!firstSaveRef.current) {
          track("design_saved_db", {
            design_id: data.id,
            items_count: items.length,
            room_type: "living_room",
            mode,
            is_guest: !session?.user,
          });
          firstSaveRef.current = true;
        }
        return data.id as string;
      }

      alert("Save failed: No ID returned from server.");
      return null;
    } catch (err) {
      alert(
        `Error saving to cloud: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  };

  const fetchMyDesigns = async () => {
    if (!session?.user) return;
    setLoadingDesigns(true);
    try {
      const res = await fetch("/api/designs");
      if (!res.ok) {
        console.error("Failed to fetch designs:", res.status);
        return;
      }
      const data = await res.json();
      setMyDesigns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching designs:", err);
    } finally {
      setLoadingDesigns(false);
    }
  };

  const handleLoadDesign = async (id: string) => {
    await loadDesign(id);
    setShowMyDesigns(false);
  };

  const trackFirstInteraction = () => {
    if (firstInteractionRef.current) return;
    track("editor_first_interaction", {
      design_id: designId ?? null,
      items_count: items.length,
      room_type: "living_room",
      mode,
      is_guest: !session?.user,
    });
    firstInteractionRef.current = true;
  };

  type PlacedItem = DesignItem;

  type Zone = ZoneMin;

  type DesignSnapshot = MultiRoomSnapshot;

  const normalizeItemsToRoom = (
    items: PlacedItem[],
    width: number,
    depth: number,
    wall: number
  ): PlacedItem[] => {
    return items.map((item) => {
      const product = CATALOG_ITEMS[item.productId];
      if (!product || !item.position) return item;
      const rotationY = item.rotationY ?? 0;
      const [effW, effD] = getRotatedFootprint(
        product.dimsMm.w / 1000,
        product.dimsMm.d / 1000,
        rotationY
      );
      const minX = -width / 2 + wall + effW / 2;
      const maxX = width / 2 - wall - effW / 2;
      const minZ = -depth / 2 + wall + effD / 2;
      const maxZ = depth / 2 - wall - effD / 2;

      const x = clamp(item.position[0], minX, maxX);
      const z = clamp(item.position[2], minZ, maxZ);
      if (x === item.position[0] && z === item.position[2]) return item;
      return { ...item, position: [x, item.position[1] ?? 0, z] };
    });
  };

  const computeZoneAnchor = (zoneItems: PlacedItem[]) => {
    if (!zoneItems.length) return undefined;
    const sum = zoneItems.reduce(
      (acc, item) => {
        acc.x += item.position[0];
        acc.z += item.position[2];
        return acc;
      },
      { x: 0, z: 0 }
    );
    const x = sum.x / zoneItems.length;
    const z = sum.z / zoneItems.length;
    return [x, 0, z] as [number, number, number];
  };

  const normalizeZones = (nextZones: Zone[], allItems: PlacedItem[]) => {
    const itemMap = new Map(allItems.map((item) => [item.instanceId, item]));
    return nextZones
      .map((zone) => {
        const itemIds = zone.itemIds.filter((id) => itemMap.has(id));
        const zoneItems = itemIds.map((id) => itemMap.get(id)!).filter(Boolean);
        const anchor = computeZoneAnchor(zoneItems);
        return {
          ...zone,
          itemIds,
            zones,
          anchor,
          source: zone.source ?? "manual",
        } as Zone;
      })
      .filter((zone) => zone.itemIds.length > 0);
  };

  const zonesEqual = (a: Zone[], b: Zone[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const left = a[i];
      const right = b[i];
      if (
        left.id !== right.id ||
        left.type !== right.type ||
        left.itemIds.length !== right.itemIds.length
      ) {
        return false;
      }
      for (let j = 0; j < left.itemIds.length; j += 1) {
        if (left.itemIds[j] !== right.itemIds[j]) return false;
      }
    }
    return true;
  };

  const buildAutoZones = (allItems: PlacedItem[], manualZones: Zone[]) => {
    const assigned = new Set<string>();
    for (const zone of manualZones) {
      for (const id of zone.itemIds) assigned.add(id);
    }

    const itemByCategory = (category: string) =>
      allItems.filter(
        (item) => CATALOG_ITEMS[item.productId]?.category === category
      );

    const distanceSq = (a: PlacedItem, b: PlacedItem) => {
      const dx = a.position[0] - b.position[0];
      const dz = a.position[2] - b.position[2];
      return dx * dx + dz * dz;
    };

    const pickNearest = (
      anchor: PlacedItem,
      candidates: PlacedItem[],
      limit: number
    ) => {
      const sorted = candidates
        .filter((item) => !assigned.has(item.instanceId))
        .sort((a, b) => distanceSq(anchor, a) - distanceSq(anchor, b));
      return sorted.slice(0, limit);
    };

    const autoZones: Zone[] = [];

    const chairs = itemByCategory("accent_chair");
    const lamps = itemByCategory("floor_lamp");
    const tvConsoles = [
      ...itemByCategory("tv_console"),
      ...itemByCategory("sideboard"),
    ];

    // Seating zones are created only once when the first sofa is placed.

    for (const chair of chairs) {
      if (assigned.has(chair.instanceId)) continue;
      const nearestLamp = pickNearest(chair, lamps, 1)[0];
      if (!nearestLamp) continue;
      if (assigned.has(nearestLamp.instanceId)) continue;
      const zoneItems = [chair, nearestLamp];
      assigned.add(chair.instanceId);
      assigned.add(nearestLamp.instanceId);
      autoZones.push({
        id: `auto-reading-${chair.instanceId}`,
        type: "reading",
        itemIds: zoneItems.map((item) => item.instanceId),
        anchor: computeZoneAnchor(zoneItems),
        source: "auto",
      });
    }

    for (const tv of tvConsoles) {
      if (assigned.has(tv.instanceId)) continue;
      assigned.add(tv.instanceId);
      autoZones.push({
        id: `auto-tv-${tv.instanceId}`,
        type: "tv",
        itemIds: [tv.instanceId],
        anchor: computeZoneAnchor([tv]),
        source: "auto",
      });
    }

    return autoZones;
  };

  const fetchShareStatus = async (id?: string) => {
    const targetId = id ?? designId;
    if (!targetId) return;

    try {
      const res = await fetch(`/api/designs/${targetId}`);
      if (!res.ok) return;
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      setShareToken(data?.shareToken ?? null);
      setShareEnabled(Boolean(data?.shareEnabled));
    } catch {
      // ignore share status errors
    }
  };

  const enableShare = async (id: string) => {
    try {
      const res = await fetch(`/api/designs/${id}/share`, { method: "POST" });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (res.ok) {
        setShareToken(data?.shareToken ?? null);
        setShareEnabled(true);
        if (data?.shareToken) {
          track("share_link_created", {
            design_id: id,
            share_token: data.shareToken,
          });
        }
      }
    } catch (err) {
      console.error("Share enable error:", err);
    }
  };

  const createShareLinkAndCopy = async () => {
    if (!designId) return;
    setSharingDesign(true);
    try {
      const res = await fetch(`/api/designs/${designId}/share`, { method: "POST" });
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (parseErr) {
        console.error("Failed to parse share response:", parseErr, raw);
        setShareErrorToast("Failed to create share link (invalid response)");
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }
      
      if (!res.ok) {
        const errorMsg = data?.error || `Server error (${res.status})`;
        console.error("Share creation failed:", errorMsg);
        setShareErrorToast(`Failed to create share link: ${errorMsg}`);
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }
      
      if (!data?.shareToken) {
        console.error("No share token in response:", data);
        setShareErrorToast("Failed to create share link (no token)");
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }
      
      setShareToken(data.shareToken);
      setShareEnabled(true);
      const shareUrl = `${window.location.origin}/share/${data.shareToken}`;
      
      // Try to copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareSuccessToast(true);
        setTimeout(() => setShareSuccessToast(false), 3000);
        track("share_link_copied", {
          design_id: designId,
          share_token: data.shareToken,
        });
      } catch (clipboardErr) {
        // Clipboard failed - show fallback modal
        console.warn("Clipboard access denied, showing fallback modal:", clipboardErr);
        setShareLinkFallback(shareUrl);
        track("share_link_created_fallback", {
          design_id: designId,
          share_token: data.shareToken,
          error: clipboardErr instanceof Error ? clipboardErr.name : String(clipboardErr),
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Share error:", err);
      setShareErrorToast(`Failed to create share link: ${errorMsg}`);
      setTimeout(() => setShareErrorToast(null), 3000);
    } finally {
      setSharingDesign(false);
    }
  };



  const loadDesign = async (id: string) => {
    try {
      const res = await fetch(`/api/designs/${id}`);
      if (!res.ok) {
        alert("Design not found");
        return;
      }

      const data = await res.json();
      
      // NEW: Use migration helper to support legacy format
      // This automatically converts single-room designs to multi-room
      const snapshot = legacyApiToSnapshot(data);
      setDesignSnapshot(snapshot);
      history.clear();
      setDesignId(data.id);
      const nextMode = data?.mode === "designer" ? "designer" : "homeowner";
      setMode(nextMode);
      setNotes(typeof data?.notes === "string" ? data.notes : "");
      const nextSavedViews = Array.isArray(data?.savedViews)
        ? (data.savedViews as NamedCameraView[])
            .filter(
              (entry) =>
                entry &&
                typeof entry.name === "string" &&
                Array.isArray(entry.view?.pos) &&
                entry.view.pos.length === 3 &&
                Array.isArray(entry.view?.target) &&
                entry.view.target.length === 3
            )
            .slice(0, 6)
        : [];
      setSavedViews(nextSavedViews);
      if (typeof data?.style === "string" && STYLES.includes(data.style)) {
        setStyle(data.style);
      }
      if (typeof data?.budget === "string" && ["$", "$$", "$$$"] .includes(data.budget)) {
        setBudget(data.budget);
      }
      fetchShareStatus(data.id);
      if (nextMode === "designer" && !data?.shareEnabled) {
        void enableShare(data.id);
      }
      alert(`Loaded design: ${data.title}`);
    } catch (err) {
      console.error("Load error:", err);
      alert("Failed to load design");
    }
  };

  const fallbackProduct =
    Object.values(CATALOG_ITEMS).find(
      (item) => typeof item.assets?.modelUrl === "string" && item.assets.modelUrl.length > 0
    ) ?? Object.values(CATALOG_ITEMS)[0];

  const fallbackItems: PlacedItem[] = fallbackProduct
    ? [
        {
          instanceId: "i-1",
          productId: fallbackProduct.id,
          variantId: fallbackProduct.defaultVariantId,
          position: [0, 0, -1.4],
          qty: 1,
          includeInCheckout: true,
        },
      ]
    : [];

  // State for design snapshot with ref for synchronous access
  // NEW: Initialize with v3 multi-room format using migrateToV3
  const defaultSnapshot: DesignSnapshot = migrateToV3({
    items: fallbackItems,
    zones: [],
    roomBounds: { width: 5, depth: 4, wallThickness: 0.12 },
  } as unknown as DesignSnapshot);

  const [designSnapshot, setDesignSnapshot] = useState<DesignSnapshot>(
    defaultSnapshot
  );
  const designSnapshotRef = useRef(designSnapshot);

  useEffect(() => {
    designSnapshotRef.current = designSnapshot;
  }, [designSnapshot]);

  // Initialize HistoryManager (once)
  const historyRef = useRef<HistoryManager<DesignSnapshot> | null>(null);
  if (!historyRef.current) {
    historyRef.current = new HistoryManager(
      () => designSnapshotRef.current,
      (snapshot) => {
        designSnapshotRef.current = snapshot;
        setDesignSnapshot(snapshot);
      }
    );
  }
  const history = historyRef.current!;

  // NEW: Get active room and its items/zones
  const _activeRoom = useMemo(
    () => getActiveRoom(designSnapshot),
    [designSnapshot]
  );

  const items = useMemo(() => {
    const room = getActiveRoom(designSnapshot);
    return room?.items ?? [];
  }, [designSnapshot]);
  const itemsRef = useRef(items);

  const zones = useMemo(() => {
    const room = getActiveRoom(designSnapshot);
    return room?.zones ?? [];
  }, [designSnapshot]);
  const zonesRef = useRef(zones);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  // Action: Commit items with transaction tracking
  // Used for user-initiated actions that should be undoable
  // Step 8: Reconcile cart to remove invalid items
  const commitItems = useCallback(
    (updater: PlacedItem[] | ((prev: PlacedItem[]) => PlacedItem[]), actionName: string = "Edit") => {
      if (!sceneReady) return;
      history.begin(actionName);
      const nextItems =
        typeof updater === "function" ? updater(itemsRef.current) : updater;
      
      // Reconcile cart: removes items that can't be purchased
      const { valid: validItems, invalid } = reconcileCart(
        nextItems,
        CATALOG_ITEMS_MAP
      );
      if (invalid.length > 0) {
        console.warn(`Removed ${invalid.length} invalid items from cart`);
        track("commerce_invalid_items_removed", {
          count: invalid.length,
          items: invalid,
        });
      }

      // NEW: Update only the active room (items stored in room.items[])
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) {
        history.commit();
        return;
      }

      const updatedRoom = { ...room, items: validItems };
      const nextSnapshot = {
        ...designSnapshotRef.current,
        rooms: designSnapshotRef.current.rooms.map((r) =>
          r.id === room.id ? updatedRoom : r
        ),
      };

      itemsRef.current = validItems;
      setDesignSnapshot(nextSnapshot);
      history.commit();
    },
    [sceneReady, history]
  );

  // Action: Update items without transaction (for drag in-progress)
  // Used during dragging or continuous operations
  // Step 8: Check items can be added to cart before allowing
  const setItemsPresent = useCallback(
    (updater: PlacedItem[] | ((prev: PlacedItem[]) => PlacedItem[])) => {
      const nextItems =
        typeof updater === "function" ? updater(itemsRef.current) : updater;
      
      // Validate items can be added to cart
      const validItems = nextItems.filter(item => {
        const catalogItem = CATALOG_ITEMS[item.productId];
        if (!catalogItem) {
          console.warn(`Item ${item.productId} not found in catalog`);
          return false;
        }
        if (!canAddToCart(catalogItem)) {
          console.warn(
            `Item ${item.productId} cannot be added to cart: ${getNonBuyableReason(catalogItem)}`
          );
          return false;
        }
        return true;
      });

      // NEW: Update only the active room (items stored in room.items[])
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      const updatedRoom = { ...room, items: validItems };
      const nextSnapshot = {
        ...designSnapshotRef.current,
        rooms: designSnapshotRef.current.rooms.map((r) =>
          r.id === room.id ? updatedRoom : r
        ),
      };

      itemsRef.current = validItems;
      setDesignSnapshot(nextSnapshot);
    },
    []
  );

  // Getters for undo/redo state
  const canUndo = history.canUndo();
  const canRedo = history.canRedo();
  const undoName = history.getUndoName();
  const redoName = history.getRedoName();

  // ========================================================================
  // Step 7: Validate Catalog on Startup
  // ========================================================================
  useEffect(() => {
    const validation = initializeCatalog();
    
    console.log(`📦 Catalog Status:`);
    console.log(`   Total: ${validation.summary.total}`);
    console.log(`   Valid: ${validation.summary.valid}`);
    console.log(`   Errors: ${validation.summary.total - validation.summary.valid}`);
    
    track("catalog_initialized", {
      total_items: validation.summary.total,
      valid_items: validation.summary.valid,
      has_errors: !validation.valid,
    });
  }, []);

  const undoSafe = useCallback(() => {
    if (isClientPreview) return;
    history.undo();
  }, [isClientPreview, history]);

  const redoSafe = useCallback(() => {
    if (isClientPreview) return;
    history.redo();
  }, [isClientPreview, history]);

  // Hotkeys for undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
  useUndoRedoHotkeys({ undo: undoSafe, redo: redoSafe });

  // Global keyboard shortcut for Present Mode toggle (P key)
  useEffect(() => {
    const handlePresentModeHotkey = (e: KeyboardEvent) => {
      if (!isDesigner) return;
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setClientPreview((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handlePresentModeHotkey);
    return () => window.removeEventListener("keydown", handlePresentModeHotkey);
  }, [isDesigner]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const isCameraAnimatingRef = useRef(false);
  const [isExporting, setIsExporting] = useState(false);

  const updateCameraViewFromScene = useCallback(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    const target = controls.target as THREE.Vector3;
    const next: CameraView = {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      fov: camera.fov,
    };

    setCameraView((prev) => {
      const [px, py, pz] = prev.pos;
      const [tx, ty, tz] = prev.target;
      const changed =
        Math.abs(px - next.pos[0]) > 0.001 ||
        Math.abs(py - next.pos[1]) > 0.001 ||
        Math.abs(pz - next.pos[2]) > 0.001 ||
        Math.abs(tx - next.target[0]) > 0.001 ||
        Math.abs(ty - next.target[1]) > 0.001 ||
        Math.abs(tz - next.target[2]) > 0.001 ||
        Math.abs((prev.fov ?? 45) - (next.fov ?? 45)) > 0.01;
      return changed ? next : prev;
    });
  }, []);

  const transitionToCameraView = useCallback((nextView: CameraView, durationMs = 520) => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    isCameraAnimatingRef.current = true;
    const fromPos = camera.position.clone();
    const fromTarget = (controls.target as THREE.Vector3).clone();
    const toPos = new THREE.Vector3(...nextView.pos);
    const toTarget = new THREE.Vector3(...nextView.target);
    const fromFov = camera.fov;
    const toFov = nextView.fov ?? fromFov;
    const start = performance.now();

    const tick = (ts: number) => {
      const t = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(fromPos, toPos, eased);
      (controls.target as THREE.Vector3).lerpVectors(fromTarget, toTarget, eased);
      camera.fov = fromFov + (toFov - fromFov) * eased;
      camera.updateProjectionMatrix();
      controls.update();

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      isCameraAnimatingRef.current = false;
      updateCameraViewFromScene();
    };

    requestAnimationFrame(tick);
  }, [updateCameraViewFromScene]);

  const waitForFrames = (count: number) =>
    new Promise<void>((resolve) => {
      let frames = 0;
      const tick = () => {
        frames += 1;
        if (frames >= count) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  const _addWatermark = (canvas: HTMLCanvasElement, isFree: boolean): HTMLCanvasElement => {
    if (!isFree) return canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "INTERIOR AI - FREE TIER",
      canvas.width / 2,
      canvas.height / 2
    );

    return canvas;
  };

  const captureCanvasImage = (): string | null => {
    if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return null;

    rendererRef.current.render(sceneRef.current, cameraRef.current);

    const canvas = rendererRef.current.domElement ?? canvasRef.current;
    if (!canvas) return null;

    const width = canvas.width;
    const height = canvas.height;

    // Create off-screen canvas at 2x DPR
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width * 2;
    offscreenCanvas.height = height * 2;

    const offscreenCtx = offscreenCanvas.getContext("2d");
    if (!offscreenCtx) return null;

    // Scale and draw
    offscreenCtx.scale(2, 2);
    offscreenCtx.drawImage(canvas, 0, 0);

    // Add watermark if free tier
    const isFree = plan !== "pro";
    if (isFree) {
      // Scale context back for text rendering
      offscreenCtx.resetTransform();
      offscreenCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
      offscreenCtx.font = "bold 32px sans-serif";
      offscreenCtx.textAlign = "center";
      offscreenCtx.textBaseline = "middle";
      offscreenCtx.fillText(
        "Free Tier - Interior AI",
        (width * 2) / 2,
        (height * 2) / 2
      );
    }

    return offscreenCanvas.toDataURL("image/png");
  };

  const captureCanvasImageForPdf = (): string | null => {
    if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return null;

    rendererRef.current.render(sceneRef.current, cameraRef.current);

    const canvas = rendererRef.current.domElement ?? canvasRef.current;
    if (!canvas) return null;

    const width = Math.max(1, Math.floor(canvas.width * 0.6));
    const height = Math.max(1, Math.floor(canvas.height * 0.6));

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;

    const offscreenCtx = offscreenCanvas.getContext("2d");
    if (!offscreenCtx) return null;

    offscreenCtx.drawImage(canvas, 0, 0, width, height);

    return offscreenCanvas.toDataURL("image/jpeg", 0.8);
  };

  const exportImages = async () => {
    if (!canvasRef.current || !cameraRef.current || !sceneReady) {
      alert("Scene not ready for export");
      return;
    }

    if (!isPro(plan)) {
      track("export_attempted", { is_pro: false });
    }

    setIsExporting(true);

    try {
      // Store original camera state
      const originalPos = cameraRef.current.position.clone();
      const originalTarget = new THREE.Vector3(...cameraView.target);

      // Activate client preview to hide UI
      setClientPreview(true);
      await waitForFrames(2);

      const angles = [
        { name: "hero", yaw: 0 },
        { name: "left", yaw: Math.PI / 9 },
        { name: "right", yaw: -Math.PI / 9 },
      ];

      const images: Array<{ name: string; url: string }> = [];

      for (const angle of angles) {
        // Position camera at angle
        const distance = 8;
        const height = 3.5;
        const x = Math.sin(angle.yaw) * distance;
        const z = Math.cos(angle.yaw) * distance;

        cameraRef.current.position.set(x, height, z);
        cameraRef.current.lookAt(originalTarget);
        cameraRef.current.updateProjectionMatrix();

        // Wait for render
        await waitForFrames(2);

        // Capture image
        const imageUrl = captureCanvasImage();
        if (imageUrl) {
          images.push({ name: angle.name, url: imageUrl });
          console.log(`Captured ${angle.name} image, total: ${images.length}`);
        } else {
          console.warn(`Failed to capture ${angle.name} image`);
        }
      }
      
      console.log(`Total images captured: ${images.length}`);

      // Restore original camera state
      cameraRef.current.position.copy(originalPos);
      if (orbitControlsRef.current) {
        (orbitControlsRef.current.target as THREE.Vector3).copy(originalTarget);
      }
      cameraRef.current.lookAt(originalTarget);
      cameraRef.current.updateProjectionMatrix();

      // Deactivate client preview
      setClientPreview(false);

      // Create download links with delays to prevent browser throttling
      images.forEach(({ name, url }, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = url;
          link.download = `room-${name}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 300); // 300ms delay between downloads
      });

      track("images_exported", {
        design_id: designId,
        count: images.length,
        is_pro: isPro(plan),
      });

      if (!isPro(plan)) {
        track("upgrade_prompt_shown", { source: "export_images" });
        setUpgradeReason("export_images");
        setShowUpgrade(true);
      }

      alert(`Exported ${images.length} images! Check your downloads.`);
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed. See console for details.");
      setClientPreview(false);
    } finally {
      setIsExporting(false);
    }
  };

  const [isPdfExporting, setIsPdfExporting] = useState(false);

  const captureExportImages = async () => {
    if (!canvasRef.current || !cameraRef.current || !sceneReady) {
      throw new Error("Scene not ready for export");
    }

    const originalPos = cameraRef.current.position.clone();
    const originalTarget = new THREE.Vector3(...cameraView.target);
    const previousPreview = clientPreview;

    setClientPreview(true);
    await waitForFrames(2);

    const angles = [
      { name: "hero", yaw: 0 },
      { name: "left", yaw: Math.PI / 9 },
      { name: "right", yaw: -Math.PI / 9 },
    ];

    const images: string[] = [];
    for (const angle of angles) {
      const distance = 8;
      const height = 3.5;
      const x = Math.sin(angle.yaw) * distance;
      const z = Math.cos(angle.yaw) * distance;

      cameraRef.current.position.set(x, height, z);
      cameraRef.current.lookAt(originalTarget);
      cameraRef.current.updateProjectionMatrix();

      await waitForFrames(2);

      const imageUrl = captureCanvasImageForPdf();
      if (imageUrl) images.push(imageUrl);
    }

    cameraRef.current.position.copy(originalPos);
    if (orbitControlsRef.current) {
      (orbitControlsRef.current.target as THREE.Vector3).copy(originalTarget);
    }
    cameraRef.current.lookAt(originalTarget);
    cameraRef.current.updateProjectionMatrix();
    setClientPreview(previousPreview);

    return images;
  };

  const exportPdf = async () => {
    if (!isPro(plan)) {
      track("pdf_export_attempted", { is_pro: false });
      track("upgrade_prompt_shown", { source: "export_pdf" });
      setUpgradeReason("export_pdf");
      setShowUpgrade(true);
      return;
    }

    if (items.length === 0) {
      alert("Add some items before exporting to PDF");
      return;
    }

    setIsPdfExporting(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const images = await captureExportImages();

      const pdfPayload = {
        title: "Interior AI Room Design",
        images,
        items: items
          .map((item) => {
            const product = CATALOG_ITEMS[item.productId];
            if (!product) return null;
            return {
              name: product.title,
              price: getItemPrice(product),
              qty: item.qty || 1,
              retailer: product.commerce.type === "affiliate" ? product.commerce.data.retailer : null,
            };
          })
          .filter(Boolean),
      };

      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdfPayload),
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PDF export failed: ${res.status} ${text}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `room-design-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      track("pdf_exported", {
        design_id: designId,
        items_count: items.length,
        is_pro: true,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "PDF generation timed out. Please try again."
          : err instanceof Error
            ? err.message
            : "PDF export failed";
      console.error("PDF export error:", err);
      alert(message);
    } finally {
      window.clearTimeout(timeoutId);
      setIsPdfExporting(false);
    }
  };

  const generateAINotes = async () => {
    if (!items.length) {
      alert("Add some items to your design first");
      return;
    }

    setAiNotesLoading(true);
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      setAiNotesLoading(false);
      alert(
        "AI generation is taking longer than expected. Please check that OPENAI_API_KEY is set in .env.local and restart the dev server."
      );
    }, 45000); // 45s timeout warning

    try {
      const response = await fetch("/api/ai/design-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          design: {
            items: items.map((item) => ({
              productId: item.productId,
              quantity: item.qty || 1,
              price: getItemPrice(CATALOG_ITEMS[item.productId]) || 0,
            })),
            categories: [...new Set(items.map((i) => CATALOG_ITEMS[i.productId]?.category))],
          },
          budget: items.reduce((sum, i) => sum + (getItemPrice(CATALOG_ITEMS[i.productId]) || 0) * (i.qty || 1), 0),
          mode: isDesigner ? "designer" : "homeowner",
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || `API error: ${response.statusText}`);
      }

      const data = (await response.json()) as AINotesResponse & { error?: string };

      if (data?.error) {
        throw new Error(data.error);
      }

      const ms = Date.now() - startTime;
      
      // Track analytics with cache info
      if (data?.cached) {
        track("ai_notes_cached_hit", {
          design_id: designId,
          ms,
        });
      } else {
        track("ai_notes_generated", {
          design_id: designId,
          mode: isDesigner ? "designer" : "homeowner",
          item_count: items.length,
          ms,
        });
      }

      setAiNotesData(data);
      setShowAINotes(true);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("AI notes error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate AI notes. See console for details.";
      
      // Track error/rate-limit
      if (message.includes("Too many AI requests")) {
        track("ai_rate_limited", { keyType: session?.user ? "user" : "anon" });
      }
      showRuleToast(message);
    } finally {
      setAiNotesLoading(false);
    }
  };

  const applySuggestion = async (action: AISuggestionAction) => {
    try {
      await applyAISuggestionAction({
        action,
        editor: {
          getItemById: (id: string) =>
            itemsRef.current.find((item) => item.instanceId === id) ?? null,
          findFirstByCategory: (category: string) =>
            itemsRef.current.find(
              (item) => CATALOG_ITEMS[item.productId]?.category === category
            ) ?? null,
          resizeRugToSofaRule,
          makeRoomCheaper: () => {
            onBulkSwap("cheaper");
          },
          addLampNearReadingCorner: async () => {
            // Legacy AI suggestion - lamp adding not part of new onboarding
            // Just add the item directly instead
            addItem("floor-lamp-arc-01", itemsRef.current.length > 0 ? [2, 0, 2] : [1.5, 0, 1.5]);
          },
          commitDesignSnapshot: (next) => {
            if (next?.items) {
              const actionName = action?.type ? `AI: ${action.type}` : "AI suggestion";
              commitItems(next.items as PlacedItem[], actionName);
            }
          },
          getDesignSnapshot: () => ({
            items: itemsRef.current,
            zones: zonesRef.current,
          }),
        },
      });

      // Track successful suggestion application
      track("ai_suggestion_applied", {
        action_type: action?.type,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not apply suggestion";
      showRuleToast(message);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        items: PlacedItem[];
        zones?: Zone[];
        savedViews?: NamedCameraView[];
      };
      const cleaned = (parsed.items || [])
        .filter((it) => CATALOG_ITEMS[it.productId])
        .map((it) => {
          const product = CATALOG_ITEMS[it.productId];
          const validVariant = product.variants.some((v) => v.id === it.variantId)
            ? it.variantId
            : product.defaultVariantId;

          return {
            ...it,
            variantId: validVariant,
            position: it.position ?? [0, 0, 0],
            qty: typeof it.qty === "number" && it.qty > 0 ? it.qty : 1,
            includeInCheckout: it.includeInCheckout ?? true,
            locked: Boolean(it.locked),
          } as PlacedItem;
        });

      if (cleaned.length) {
        const normalized = normalizeItemsToRoom(
          cleaned,
          roomWidth,
          roomDepth,
          wallThickness
        );
        // NEW: Use migration helper for localStorage items too
        const snapshot = migrateToV3({
          items: normalized,
          zones: parsed.zones ?? [],
          roomBounds: { width: roomWidth, depth: roomDepth, wallThickness },
        } as unknown as DesignSnapshot);
        setDesignSnapshot(snapshot);
        history.clear();
      }
      const hydratedViews = Array.isArray(parsed.savedViews)
        ? parsed.savedViews
            .filter(
              (entry) =>
                entry &&
                typeof entry.name === "string" &&
                Array.isArray(entry.view?.pos) &&
                entry.view.pos.length === 3 &&
                Array.isArray(entry.view?.target) &&
                entry.view.target.length === 3
            )
            .slice(0, 6)
        : [];
      setSavedViews(hydratedViews);
    } catch {
      // ignore invalid saved data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareOrigin(window.location.origin);
  }, []);

  const refreshPlan = async () => {
    setRefreshingPlan(true);
    try {
      const res = await fetch("/api/me");
      const data = await res.json().catch(() => ({}));
      const newPlan = data?.plan === "pro" ? "pro" : "free";
      setPlan(newPlan);
      showRuleToast(`Plan status: ${newPlan === "pro" ? "Pro" : "Free"}`);
      track("plan_refreshed", { plan: newPlan });
    } catch {
      showRuleToast("Failed to refresh plan status");
      setPlan("free");
    } finally {
      setRefreshingPlan(false);
    }
  };

  const _openBillingPortal = async () => {
    if (!session?.user) {
      signIn("google");
      return;
    }

    try {
      showRuleToast("Opening billing portal...");
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || !data?.url) {
        const errorMsg = data?.error || "Unable to open billing portal. Please try again.";
        showRuleToast(errorMsg);
        console.error("Portal error:", errorMsg);
        return;
      }
      
      // Redirect to portal
      window.location.href = data.url as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to open billing portal";
      showRuleToast(msg);
      console.error("Billing portal error:", err);
    }
  };

  const startCheckout = async (interval: "monthly" | "yearly" = "monthly") => {
    if (!session?.user) {
      signIn("google");
      return;
    }

    setStartingCheckout(true);
    try {
      showRuleToast("Opening checkout...");
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || "Unable to start checkout right now.";
        showRuleToast(msg);
        console.error("Checkout error:", msg);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      showRuleToast("No checkout URL returned. Please try again.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to start checkout right now.";
      console.error("Failed to start checkout:", err);
      showRuleToast(msg);
    } finally {
      setStartingCheckout(false);
    }
  };

  useEffect(() => {
    refreshPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!stripeSessionId) return;
    let alive = true;

    const syncPlanAfterCheckout = async () => {
      try {
        const res = await fetch("/api/me");
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const nextPlan: Plan = data?.plan === "pro" ? "pro" : "free";
        setPlan(nextPlan);
        if (nextPlan === "pro") {
          setShowUpgrade(false);
        }
      } catch {
        return;
      } finally {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("session_id");
        const qs = nextParams.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    };

    void syncPlanAfterCheckout();

    return () => {
      alive = false;
    };
  }, [pathname, router, searchParams, stripeSessionId]);

  useEffect(() => {
    // Auto-refresh plan after returning from Stripe portal
    const refreshPlanParam = searchParams.get("refresh_plan");
    if (!refreshPlanParam) return;

    let alive = true;

    const syncPlanAfterPortal = async () => {
      try {
        const res = await fetch("/api/me");
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const nextPlan: Plan = data?.plan === "pro" ? "pro" : "free";
        setPlan(nextPlan);
        
        // Show success toast
        showRuleToast(
          nextPlan === "pro"
            ? "Plan updated! You now have Pro access."
            : "Plan information refreshed."
        );
      } catch {
        console.warn("Failed to sync plan after portal return");
      } finally {
        // Clean up URL param
        if (alive) {
          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.delete("refresh_plan");
          const qs = nextParams.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
      }
    };

    syncPlanAfterPortal();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (editorOpenedRef.current) return;
    track("editor_opened", {
      design_id: designId ?? null,
      room_type: "living_room",
      mode,
      is_guest: !session?.user,
    });
    editorOpenedRef.current = true;
  }, [designId, mode, session?.user]);

  useEffect(() => {
    if (session?.user) return;
    try {
      const key = "ph_guest_started";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      track("guest_session_start", { is_guest: true });
    } catch {
      // ignore sessionStorage errors
    }
  }, [session?.user]);


  useEffect(() => {
    if (!wantsDesigner) return;
    if (!canUseDesigner) {
      if (!designerAttemptRef.current) {
        track("mode_designer_attempted", { is_pro: false });
        designerAttemptRef.current = true;
      }
      setShowUpgrade(true);
      setMode("homeowner");
      return;
    }
    setMode("designer");
  }, [wantsDesigner, canUseDesigner]);

  useEffect(() => {
    if (!showUpgrade) {
      upgradeShownRef.current = false;
      return;
    }
    if (upgradeShownRef.current) return;
    track("upgrade_prompt_shown", { reason: "mode_designer" });
    upgradeShownRef.current = true;
  }, [showUpgrade]);

  useEffect(() => {
    if (!isDesigner) return;
    if (!designId || shareEnabled) return;
    void enableShare(designId);
  }, [isDesigner, designId, shareEnabled]);

  useEffect(() => {
    if (!designId) {
      setIsSaving(false);
    }
  }, [designId]);

  useEffect(() => {
    return () => {
      if (gridPulseTimerRef.current) {
        window.clearTimeout(gridPulseTimerRef.current);
      }
      if (snapToastTimerRef.current) {
        window.clearTimeout(snapToastTimerRef.current);
      }
      if (ruleToastTimerRef.current) {
        window.clearTimeout(ruleToastTimerRef.current);
      }
    };
  }, []);

  const roomWidth = 5;
  const roomDepth = 4;
  const roomHeight = 2.6;
  const wallThickness = 0.12;
  const _roomMargin = 0.05; // 5cm breathing room from wall
  const _snapThreshold = 0.03; // 3cm threshold for wall snapping

  // Create room bounds object for reference
  const _roomBounds: RoomBounds = {
    width: roomWidth,
    depth: roomDepth,
    height: roomHeight,
    wallThickness: wallThickness,
  };


  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  const primaryIdRef = useRef(primaryId);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    primaryIdRef.current = primaryId;
  }, [primaryId]);

  const updateSelection = useCallback(
    (next: Set<string>, nextPrimary: string | null) => {
      setSelectedIds(next);
      setPrimaryId(nextPrimary);
      
      // Auto mode switching: ADJUST when item selected, DESIGN when cleared
      if (next.size > 0 && editorMode === "design") {
        setEditorMode("adjust");
      } else if (next.size === 0 && editorMode === "adjust") {
        setEditorMode("design");
      }
    },
    [editorMode]
  );

  const clearSelection = useCallback(() => {
    updateSelection(new Set(), null);
  }, [updateSelection]);

  const clearZoneSelection = useCallback(() => {
    setSelectedZoneId(null);
  }, []);

  const clearAllSelection = useCallback(() => {
    clearSelection();
    clearZoneSelection();
  }, [clearSelection, clearZoneSelection]);

  // Global keyboard shortcut for Delete/Backspace
  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (isClientPreview) return;
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const selectedIds = Array.from(selectedIdsRef.current);
        if (selectedIds.length === 0) return;

        // Get names of items being deleted for better action label
        const itemNames = selectedIds
          .map(id => {
            const item = items.find(x => x.instanceId === id);
            return item ? CATALOG_ITEMS[item.productId]?.title || "Item" : "Item";
          })
          .filter((name, index, arr) => arr.indexOf(name) === index);
        
        const actionLabel = selectedIds.length === 1 
          ? `Delete ${itemNames[0]}`
          : `Delete ${selectedIds.length} items`;

        commitItems(
          (prev) => prev.filter((x) => !selectedIds.includes(x.instanceId)),
          actionLabel
        );
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  }, [isClientPreview, items, commitItems, clearSelection]);

  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      if (selectedZoneId) setSelectedZoneId(null);
      const current = new Set(selectedIdsRef.current);
      if (additive) {
        if (current.has(id)) {
          current.delete(id);
          const nextPrimary =
            primaryIdRef.current === id
              ? current.size
                ? Array.from(current)[current.size - 1]
                : null
              : primaryIdRef.current;
          updateSelection(current, nextPrimary);
          return;
        }
        current.add(id);
        updateSelection(current, id);
        return;
      }
      updateSelection(new Set([id]), id);
    },
    [selectedZoneId, updateSelection]
  );

  // NEW: Handle room switching with proper state cleanup
  const handleSwitchRoom = useCallback((roomId: string) => {
    // Switch room
    setDesignSnapshot((prev) => switchRoom(prev, roomId));

    // Clear selection when switching rooms (keeps UI calm)
    clearAllSelection();

    // Reset camera to room bounds
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 3, 3);
      cameraRef.current.lookAt(0, 0, 0);
    }

    track("editor_room_switched", { roomId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NEW: Handle adding new room
  const handleAddRoom = useCallback(() => {
    // For now, create a default bedroom with next numbering
    const roomCount = designSnapshotRef.current.rooms.length;
    const roomNum = roomCount + 1;
    const roomName = `Room ${roomNum}`;

    const newRoom = createRoom(
      "room_" + Date.now(),
      roomName,
      roomCount === 0 ? "living" : "bedroom",
      { width: 4, depth: 5, wallThickness: 0.2 }
    );

    setDesignSnapshot((prev) => {
      const updated = addRoom(prev, newRoom);
      return switchRoom(updated, newRoom.id);
    });

    track("editor_room_added", { roomType: newRoom.roomType });
  }, []);

  const selectedInstanceId = primaryId;

  const selectedItem = selectedInstanceId
    ? items.find((i) => i.instanceId === selectedInstanceId) ?? null
    : null;

  const selectedZone = selectedZoneId
    ? zones.find((zone) => zone.id === selectedZoneId) ?? null
    : null;

  const [pendingZoneType, setPendingZoneType] = useState<Zone["type"]>(
    "seating"
  );

  const createZoneFromSelection = useCallback(() => {
    const selectedSet = selectedIdsRef.current;
    if (!selectedSet.size) return;
    const selectedItems = itemsRef.current.filter((item) =>
      selectedSet.has(item.instanceId)
    );
    if (!selectedItems.length) return;

    const zoneId = `zone-${Date.now().toString(36)}`;
    const itemIds = selectedItems.map((item) => item.instanceId);
    const anchor = computeZoneAnchor(selectedItems);
    const newZone: Zone = {
      id: zoneId,
      type: pendingZoneType,
      itemIds,
      anchor,
      source: "manual",
    };

    const existing = zonesRef.current ?? [];
    const manualZones = existing
      .filter((zone) => zone.source === "manual")
      .map((zone) => ({
        ...zone,
        itemIds: zone.itemIds.filter((id) => !selectedSet.has(id)),
      }))
      .filter((zone) => zone.itemIds.length > 0);

    setDesignSnapshot({
      ...designSnapshotRef.current,
      zones: [...manualZones, newZone],
    });
    setSelectedZoneId(zoneId);
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSelection, pendingZoneType]);

  const autoCreateSeatingZone = useCallback(
    (sofaItem: PlacedItem) => {
      if (editorMode !== "design" || isClientPreview) return;
      if (seatingZoneAutoDisabledRef.current) return;
      const existing = zonesRef.current ?? [];
      if (existing.some((zone) => zone.type === "seating")) return;

      const zoneId = `zone-${Date.now().toString(36)}`;
      const newZone: Zone = {
        id: zoneId,
        type: "seating",
        itemIds: [sofaItem.instanceId],
        anchor: computeZoneAnchor([sofaItem]),
        source: "manual",
      };

      history.begin("auto_create_seating_zone");

      // NEW: Update only the active room
      const room = getActiveRoom(designSnapshotRef.current);
      if (room) {
        const updatedRoom = {
          ...room,
          zones: [...existing.filter((zone) => zone.source === "manual"), newZone],
        };
        const nextSnapshot = {
          ...designSnapshotRef.current,
          rooms: designSnapshotRef.current.rooms.map((r) =>
            r.id === room.id ? updatedRoom : r
          ),
        };
        setDesignSnapshot(nextSnapshot);
      }

      history.commit();
      setSelectedZoneId(zoneId);
      track("seating_zone_auto_created", { zoneId, trigger: "first_sofa" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorMode, history, isClientPreview]
  );

  useEffect(() => {
    if (!isClientPreview) return;
    clearAllSelection();
  }, [clearAllSelection, isClientPreview]);

  const selectedProduct = selectedItem ? CATALOG_ITEMS[selectedItem.productId] : null;

  const alignSelectionX = useCallback(() => {
    const selectedSet = selectedIdsRef.current;
    if (selectedSet.size < 2) return;
    const currentItems = itemsRef.current;
    const movable = currentItems.filter(
      (x) => selectedSet.has(x.instanceId) && !(isDesigner && x.locked)
    );
    if (!movable.length) return;
    const bounds = getSelectionBounds(movable);
    if (!bounds) return;
    const targetX = bounds.centerX;

    const movableIds = new Set(movable.map((x) => x.instanceId));
    const blockers = currentItems.filter((x) => !movableIds.has(x.instanceId));
    const nextItems = currentItems.map((item) => {
      if (!movableIds.has(item.instanceId)) return item;
      const product = CATALOG_ITEMS[item.productId];
      if (!product) return item;
      const [safeX, safeZ] = clampToRoom(
        targetX,
        item.position[2],
        product.dimsMm.w / 1000,
        product.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        item.rotationY ?? 0
      );
      const nextPos: [number, number, number] = [
        safeX,
        item.position[1] ?? 0,
        safeZ,
      ];
      return { ...item, position: nextPos };
    });

    for (const moved of nextItems) {
      if (!movableIds.has(moved.instanceId)) continue;
      const movedAABB = getItemAABB(moved);
      if (!movedAABB) continue;
      for (const blocker of blockers) {
        const blockerAABB = getItemAABB(blocker);
        if (!blockerAABB) continue;
        if (aabbIntersects(movedAABB, blockerAABB)) return;
      }
    }

    commitItems(nextItems, "Align X center");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]);

  const alignSelectionZ = useCallback(() => {
    const selectedSet = selectedIdsRef.current;
    if (selectedSet.size < 2) return;
    const currentItems = itemsRef.current;
    const movable = currentItems.filter(
      (x) => selectedSet.has(x.instanceId) && !(isDesigner && x.locked)
    );
    if (!movable.length) return;
    const bounds = getSelectionBounds(movable);
    if (!bounds) return;
    const targetZ = bounds.centerZ;

    const movableIds = new Set(movable.map((x) => x.instanceId));
    const blockers = currentItems.filter((x) => !movableIds.has(x.instanceId));
    const nextItems = currentItems.map((item) => {
      if (!movableIds.has(item.instanceId)) return item;
      const product = CATALOG_ITEMS[item.productId];
      if (!product) return item;
      const [safeX, safeZ] = clampToRoom(
        item.position[0],
        targetZ,
        product.dimsMm.w / 1000,
        product.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        item.rotationY ?? 0
      );
      const nextPos: [number, number, number] = [
        safeX,
        item.position[1] ?? 0,
        safeZ,
      ];
      return { ...item, position: nextPos };
    });

    for (const moved of nextItems) {
      if (!movableIds.has(moved.instanceId)) continue;
      const movedAABB = getItemAABB(moved);
      if (!movedAABB) continue;
      for (const blocker of blockers) {
        const blockerAABB = getItemAABB(blocker);
        if (!blockerAABB) continue;
        if (aabbIntersects(movedAABB, blockerAABB)) return;
      }
    }

    commitItems(nextItems, "Align Z center");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]);

  const autoLayoutZone = useCallback(
    (zoneId: string) => {
      const zone = zonesRef.current.find((z) => z.id === zoneId);
      if (!zone) return;
      const currentItems = itemsRef.current;
      const zoneSet = new Set(zone.itemIds);
      const zoneItems = currentItems.filter((item) => zoneSet.has(item.instanceId));
      if (!zoneItems.length) return;

      const updates = new Map<string, PlacedItem>();
      const getCategory = (item: PlacedItem) =>
        CATALOG_ITEMS[item.productId]?.category;

      if (zone.type === "seating") {
        const sofa = zoneItems.find((item) => getCategory(item) === "sofa");
        if (!sofa) return;
        const sofaProduct = CATALOG_ITEMS[sofa.productId];
        const sofaDepth = (sofaProduct?.dimsMm.d ?? 900) / 1000;
        const sofaWidth = (sofaProduct?.dimsMm.w ?? 1800) / 1000;

        const coffee = zoneItems.find(
          (item) => getCategory(item) === "coffee_table"
        );
        if (coffee && !(isDesigner && coffee.locked)) {
          const coffeeProduct = CATALOG_ITEMS[coffee.productId];
          const coffeeDepth = (coffeeProduct?.dimsMm.d ?? 600) / 1000;
          const sofaFrontZ = sofa.position[2] + sofaDepth / 2;
          const targetZ = sofaFrontZ + 0.45 + coffeeDepth / 2;
          const [safeX, safeZ] = clampToRoom(
            sofa.position[0],
            targetZ,
            (coffeeProduct?.dimsMm.w ?? 600) / 1000,
            (coffeeProduct?.dimsMm.d ?? 600) / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            coffee.rotationY ?? 0
          );
          updates.set(coffee.instanceId, {
            ...coffee,
            position: [safeX, coffee.position[1] ?? 0, safeZ],
          });
        }

        const rug = zoneItems.find((item) => getCategory(item) === "rug");
        if (rug && !(isDesigner && rug.locked)) {
          const rugProduct = CATALOG_ITEMS[rug.productId];
          const rugZ = sofa.position[2] + sofaDepth * 0.35;
          const [safeX, safeZ] = clampToRoom(
            sofa.position[0],
            rugZ,
            rugProduct.dimsMm.w / 1000,
            rugProduct.dimsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            rug.rotationY ?? 0
          );
          updates.set(rug.instanceId, {
            ...rug,
            position: [safeX, rug.position[1] ?? 0, safeZ],
          });
        }

        const chairs = zoneItems.filter(
          (item) => getCategory(item) === "accent_chair"
        );
        const baseZ = sofa.position[2] + sofaDepth * 0.4;
        chairs.forEach((chair, index) => {
          if (isDesigner && chair.locked) return;
          const chairProduct = CATALOG_ITEMS[chair.productId];
          const chairWidth = (chairProduct?.dimsMm.w ?? 800) / 1000;
          const offsetX = sofaWidth / 2 + chairWidth / 2 + 0.25;
          const sign = index % 2 === 0 ? -1 : 1;
          const targetX = sofa.position[0] + sign * offsetX;
          const [safeX, safeZ] = clampToRoom(
            targetX,
            baseZ,
            (chairProduct?.dimsMm.w ?? 800) / 1000,
            (chairProduct?.dimsMm.d ?? 800) / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            chair.rotationY ?? 0
          );
          updates.set(chair.instanceId, {
            ...chair,
            position: [safeX, chair.position[1] ?? 0, safeZ],
          });
        });
      }

      if (zone.type === "reading") {
        const chair = zoneItems.find(
          (item) => getCategory(item) === "accent_chair"
        );
        const lamp = zoneItems.find(
          (item) => getCategory(item) === "floor_lamp"
        );
        if (chair && lamp && !(isDesigner && lamp.locked)) {
          const lampProduct = CATALOG_ITEMS[lamp.productId];
          const targetX = chair.position[0] + 0.45;
          const targetZ = chair.position[2] + 0.25;
          const [safeX, safeZ] = clampToRoom(
            targetX,
            targetZ,
            lampProduct.dimsMm.w / 1000,
            lampProduct.dimsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            lamp.rotationY ?? 0
          );
          updates.set(lamp.instanceId, {
            ...lamp,
            position: [safeX, lamp.position[1] ?? 0, safeZ],
          });
        }
      }

      if (zone.type === "tv") {
        const consoleItem = zoneItems.find((item) => {
          const category = getCategory(item);
          return category === "tv_console" || category === "sideboard";
        });
        if (consoleItem && !(isDesigner && consoleItem.locked)) {
          const consoleProduct = CATALOG_ITEMS[consoleItem.productId];
          const targetX = 0;
          const targetZ = roomDepth / 2 - wallThickness - consoleProduct.dimsMm.d / 1000 / 2;
          const [safeX, safeZ] = clampToRoom(
            targetX,
            targetZ,
            consoleProduct.dimsMm.w / 1000,
            consoleProduct.dimsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            consoleItem.rotationY ?? 0
          );
          updates.set(consoleItem.instanceId, {
            ...consoleItem,
            position: [safeX, consoleItem.position[1] ?? 0, safeZ],
          });
        }
      }

      if (!updates.size) return;
      const nextItems = currentItems.map((item) =>
        updates.get(item.instanceId) ?? item
      );
      commitItems(nextItems, `Auto-layout ${zone.type} zone`);
    },
    [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]
  );

  const rotateZone = useCallback(
    (zoneId: string, deltaRot: number) => {
      const zone = zonesRef.current.find((z) => z.id === zoneId);
      if (!zone) return;
      const currentItems = itemsRef.current;
      const zoneSet = new Set(zone.itemIds);
      const movable = currentItems.filter(
        (item) => zoneSet.has(item.instanceId) && !(isDesigner && item.locked)
      );
      if (!movable.length) return;
      const movableIds = new Set(movable.map((item) => item.instanceId));
      const blockers = currentItems.filter((item) => !movableIds.has(item.instanceId));
      const bounds = getSelectionBounds(movable);
      if (!bounds) return;

      const pivotX = bounds.centerX;
      const pivotZ = bounds.centerZ;
      const cos = Math.cos(deltaRot);
      const sin = Math.sin(deltaRot);

      const nextItems = currentItems.map((item) => {
        if (!movableIds.has(item.instanceId)) return item;
        const product = CATALOG_ITEMS[item.productId];
        if (!product) return item;
        const offsetX = item.position[0] - pivotX;
        const offsetZ = item.position[2] - pivotZ;
        const rotatedX = offsetX * cos - offsetZ * sin;
        const rotatedZ = offsetX * sin + offsetZ * cos;
        const nextRot = (item.rotationY ?? 0) + deltaRot;
        const [safeX, safeZ] = clampToRoom(
          pivotX + rotatedX,
          pivotZ + rotatedZ,
          product.dimsMm.w / 1000,
          product.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness,
          nextRot
        );
        const nextPos: [number, number, number] = [
          safeX,
          item.position[1] ?? 0,
          safeZ,
        ];
        return {
          ...item,
          position: nextPos,
          rotationY: nextRot,
        };
      });

      for (const moved of nextItems) {
        if (!movableIds.has(moved.instanceId)) continue;
        const movedProduct = CATALOG_ITEMS[moved.productId];
        if (movedProduct?.category === "rug") continue;
        const movedAABB = getItemAABB(moved);
        if (!movedAABB) continue;
        for (const blocker of blockers) {
          const blockerProduct = CATALOG_ITEMS[blocker.productId];
          if (blockerProduct?.category === "rug") continue;
          const blockerAABB = getItemAABB(blocker);
          if (!blockerAABB) continue;
          if (aabbIntersects(movedAABB, blockerAABB)) return;
        }
      }

      commitItems(nextItems, "Rotate zone");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]
  );

  const ungroupZone = useCallback((zoneId: string) => {
    const zoneToRemove = (zonesRef.current ?? []).find((z) => z.id === zoneId);
    if (zoneToRemove?.type === "seating") {
      seatingZoneAutoDisabledRef.current = true;
      try {
        localStorage.setItem("seating_zone_auto_disabled", "1");
      } catch {
        // ignore storage errors
      }
    }
    const nextZones = (zonesRef.current ?? []).filter((z) => z.id !== zoneId);
    setDesignSnapshot({
      ...designSnapshotRef.current,
      zones: nextZones,
    });
    setSelectedZoneId(null);
  }, []);

  const getZoneBounds = useCallback(
    (zone: Zone) => {
      const zoneSet = new Set(zone.itemIds);
      const zoneItems = items.filter((item) => zoneSet.has(item.instanceId));
      return getSelectionBounds(zoneItems);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );

  const getZoneLabel = (zoneType: Zone["type"]) => {
    switch (zoneType) {
      case "seating":
        return "Seating area";
      case "reading":
        return "Reading nook";
      case "tv":
        return "TV area";
      case "dining":
        return "Dining area";
      default:
        return "Zone";
    }
  };

  const getTopDownView = useCallback((): CameraView => {
    const height = Math.max(roomWidth, roomDepth) + roomHeight + 0.8;
    return {
      target: [0, roomHeight * 0.5, 0],
      pos: [0.001, height, 0.001],
      fov: 45,
    };
  }, [roomDepth, roomHeight, roomWidth]);

  const getEyeLevelView = useCallback((): CameraView => {
    const sofa = items.find((it) => CATALOG_ITEMS[it.productId]?.category === "sofa") ?? null;
    if (!sofa) {
      return {
        target: [0, 1.1, 0],
        pos: [0, 1.5, 3.2],
        fov: 45,
      };
    }

    const product = CATALOG_ITEMS[sofa.productId];
    const sofaX = sofa.position?.[0] ?? 0;
    const sofaZ = sofa.position?.[2] ?? 0;
    const targetY = Math.max(0.8, product.dimsMm.h / 1000 * 0.5);
    const offsetBack = Math.max(2.2, product.dimsMm.d / 1000 * 2.8);

    return {
      target: [sofaX, targetY, sofaZ],
      pos: [sofaX, 1.5, sofaZ + offsetBack],
      fov: 45,
    };
  }, [items]);

  const getFocusView = useCallback((): CameraView => {
    if (!selectedItem || !selectedProduct) {
      return getEyeLevelView();
    }

    const rotation = selectedItem.rotationY ?? 0;
    const normalizedQuarterTurns =
      ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
    const isOddRot = normalizedQuarterTurns % 2 !== 0;
    const width = isOddRot ? selectedProduct.dimsMm.d / 1000 : selectedProduct.dimsMm.w / 1000;
    const depth = isOddRot ? selectedProduct.dimsMm.w / 1000 : selectedProduct.dimsMm.d / 1000;
    const centerX = selectedItem.position?.[0] ?? 0;
    const centerZ = selectedItem.position?.[2] ?? 0;
    const centerY = Math.max(0.4, selectedProduct.dimsMm.h / 1000 * 0.52);
    const itemSize = Math.max(width, depth, selectedProduct.dimsMm.h / 1000);
    const distance = Math.max(1.8, Math.min(4.4, itemSize * 2.4));

    return {
      target: [centerX, centerY, centerZ],
      pos: [
        centerX + distance * 0.42,
        centerY + Math.max(0.5, itemSize * 0.45),
        centerZ + distance,
      ],
      fov: 45,
    };
  }, [getEyeLevelView, selectedItem, selectedProduct]);

  const _saveCurrentView = useCallback(() => {
    const label = `View ${savedViews.length + 1}`;
    const next = [...savedViews, { name: label, view: cameraView }].slice(-6);
    setSavedViews(next);
    showRuleToast("Camera view saved");
  }, [cameraView, savedViews, showRuleToast]);

  useEffect(() => {
    const existing = new Set(items.map((it) => it.instanceId));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => existing.has(id)));
      const primary = primaryIdRef.current;
      const hasPrimary = primary ? next.has(primary) : false;
      if (!hasPrimary) {
        setPrimaryId(next.size ? Array.from(next)[0] : null);
      }
      if (next.size !== prev.size) return next;
      return prev;
    });
  }, [items]);

  useEffect(() => {
    if (!selectedZoneId) return;
    if (!zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zones]);

  useEffect(() => {
    const currentZones = zonesRef.current ?? [];
    const manualZones = normalizeZones(
      currentZones.filter((zone) => zone.source === "manual"),
      items
    );
    const autoZones = buildAutoZones(items, manualZones);
    const nextZones = [...manualZones, ...autoZones];
    if (!zonesEqual(nextZones, currentZones)) {
      setDesignSnapshot({
        ...designSnapshotRef.current,
        zones: nextZones,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (!sceneReady) return;
    const t = window.setTimeout(() => {
      updateCameraViewFromScene();
    }, 0);
    return () => window.clearTimeout(t);
  }, [sceneReady, updateCameraViewFromScene]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ items, zones, savedViews })
      );
      setLastLocalAutosaveAt(Date.now());
    } catch {
      // ignore quota errors for now
    }
  }, [items, zones, savedViews]);

  useEffect(() => {
    if (!designId) return;
    let cancelled = false;
    setIsSaving(true);
    const t = setTimeout(async () => {
      try {
        await fetch(`/api/designs/${designId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            zones,
            savedViews,
            roomWidth,
            roomDepth,
          }),
        });
        if (!cancelled) {
          setLastDbSaveAt(Date.now());
        }
      } catch {
        // ignore autosave errors
      } finally {
        if (!cancelled) {
          setIsSaving(false);
        }
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [items, designId, zones, savedViews]);

  useEffect(() => {
    if (designId || session?.user) return;
    const t = setTimeout(() => {
      saveGuestDesign({
        localId: "current",
        updatedAt: Date.now(),
        roomType: "living_room",
        itemsCount: items.length,
        snapshot: {
          title: "Guest Design",
          roomWidth,
          roomDepth,
          items,
          style: style ?? null,
          budget: budget ?? null,
          mode: mode ?? null,
          notes: notes ?? null,
        },
      });
    }, 800);

    return () => clearTimeout(t);
  }, [designId, session?.user, items, style, budget, mode, roomWidth, roomDepth, notes]);
  // Precompute wall descriptors for Furniture to snap against (inner face coords)
  const halfW = roomWidth / 2;
  const halfD = roomDepth / 2;
  const halfLong = 2.2 / 2; // default sofa long half (adjusts per item via product.dimensions)

  const walls = [
    // left wall (inner face X)
    {
      axis: "x" as const,
      coord: -halfW + wallThickness / 2,
      // allowed range along Z when sofa long side is parallel to wall
      min: -halfD + wallThickness / 2 + halfLong,
      max: halfD - wallThickness / 2 - halfLong,
    },
    // right wall
    {
      axis: "x" as const,
      coord: halfW - wallThickness / 2,
      min: -halfD + wallThickness / 2 + halfLong,
      max: halfD - wallThickness / 2 - halfLong,
    },
    // front wall (negative Z)
    {
      axis: "z" as const,
      coord: -halfD + wallThickness / 2,
      min: -halfW + wallThickness / 2 + halfLong,
      max: halfW - wallThickness / 2 - halfLong,
    },
    // back wall (positive Z)
    {
      axis: "z" as const,
      coord: halfD - wallThickness / 2,
      min: -halfW + wallThickness / 2 + halfLong,
      max: halfW - wallThickness / 2 - halfLong,
    },
  ];

  const instanceCounterRef = useRef(0);
  const newInstanceId = () => {
    instanceCounterRef.current += 1;
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `i-${crypto.randomUUID()}`;
    }
    return `i-${Date.now()}-${instanceCounterRef.current}`;
  };

  const clampToRoom = (
    x: number,
    z: number,
    itemWidth: number,
    itemDepth: number,
    roomW: number,
    roomD: number,
    wall: number,
    rotationY: number = 0
  ): [number, number] => {
    const [effW, effD] = getRotatedFootprint(itemWidth, itemDepth, rotationY);
    const minX = -roomW / 2 + wall + effW / 2;
    const maxX = roomW / 2 - wall - effW / 2;
    const minZ = -roomD / 2 + wall + effD / 2;
    const maxZ = roomD / 2 - wall - effD / 2;

    const clampedX = Math.max(minX, Math.min(maxX, x));
    const clampedZ = Math.max(minZ, Math.min(maxZ, z));

    return [clampedX, clampedZ];
  };

  const aabbIntersects = (a: AABB, b: AABB) => {
    return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  };

  const getItemAABB = (
    item: PlacedItem,
    positionOverride?: [number, number, number],
    rotationOverride?: number
  ) => {
    const product = CATALOG_ITEMS[item.productId];
    if (!product) return null;
    const rotationY = rotationOverride ?? item.rotationY ?? 0;
    const [w, d] = getRotatedFootprint(
      product.dimsMm.w / 1000,
      product.dimsMm.d / 1000,
      rotationY
    );
    const pos = positionOverride ?? item.position;
    return computeAABB(pos, w, d);
  };

  const getSelectionBounds = (selected: PlacedItem[]) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const item of selected) {
      const aabb = getItemAABB(item);
      if (!aabb) continue;
      minX = Math.min(minX, aabb.minX);
      maxX = Math.max(maxX, aabb.maxX);
      minZ = Math.min(minZ, aabb.minZ);
      maxZ = Math.max(maxZ, aabb.maxZ);
    }
    if (!Number.isFinite(minX)) return null;
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  };

  const footprintRadius = (w: number, d: number) => {
    return Math.sqrt((w / 2) ** 2 + (d / 2) ** 2);
  };

  const separateIfOverlapping = (
    ax: number,
    az: number,
    ar: number,
    bx: number,
    bz: number,
    br: number,
    padding = 0.15
  ): [number, number] => {
    const dx = ax - bx;
    const dz = az - bz;
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.0001;
    const minDist = ar + br + padding;

    if (dist >= minDist) return [ax, az];

    const push = minDist - dist;
    const nx = dx / dist;
    const nz = dz / dist;

    return [ax + nx * push, az + nz * push];
  };

  const pickBestRugForSofa = ({
    sofaWidth,
    style: styleInput,
    budget: budgetInput,
  }: {
    sofaWidth: number;
    style: string;
    budget: "$" | "$$" | "$$$";
  }) => {
    const styleNorm = styleInput.toLowerCase();
    const minRugW = sofaWidth + 0.3;
    const maxRugW = sofaWidth + 0.5;
    const targetRugW = sofaWidth + 0.4;

    const rugs = Object.values(CATALOG_ITEMS).filter((p) => p.category === "rug");
    const styleRugs = rugs.filter((r) =>
      r.styleTags.some((t) => t.toLowerCase() === styleNorm)
    );

    const pool = styleRugs.length ? styleRugs : rugs;
    const sortedByPrice = [...pool].sort((a, b) => getItemPrice(a) - getItemPrice(b));
    const budgetPool =
      budgetInput === "$"
        ? sortedByPrice.slice(
            0,
            Math.max(2, Math.floor(sortedByPrice.length * 0.4))
          )
        : budgetInput === "$$$"
          ? sortedByPrice.slice(Math.floor(sortedByPrice.length * 0.6))
          : sortedByPrice;

    if (!budgetPool.length) return null;

    const within = budgetPool.filter(
      (r) => r.dimsMm.w / 1000 >= minRugW && r.dimsMm.w / 1000 <= maxRugW
    );

    const candidates = within.length ? within : budgetPool;

    let best = candidates[0];
    let bestDiff = Math.abs(best.dimsMm.w / 1000 - targetRugW);

    for (const r of candidates) {
      const diff = Math.abs(r.dimsMm.w / 1000 - targetRugW);
      if (diff < bestDiff) {
        best = r;
        bestDiff = diff;
      }
    }

    return best;
  };

  const resizeRugToSofaRule = (sofaItem: PlacedItem) => {
    const sofaProduct = CATALOG_ITEMS[sofaItem.productId];
    if (!sofaProduct) {
      throw new Error("No sofa found to size rug against.");
    }

    const bestRug = pickBestRugForSofa({
      sofaWidth: sofaProduct.dimsMm.w / 1000,
      style,
      budget,
    });

    if (!bestRug) {
      throw new Error("No rug available for this style and budget.");
    }

    const sofaX = sofaItem.position?.[0] ?? 0;
    const sofaZ = sofaItem.position?.[2] ?? -1.4;
    const sofaDepth = sofaProduct.dimsMm.d / 1000;
    const rugZ = sofaZ + sofaDepth * 0.35;

    let hasRug = false;
    const nextItems = itemsRef.current.map((item) => {
      if (CATALOG_ITEMS[item.productId]?.category !== "rug") return item;
      hasRug = true;
      return {
        ...item,
        productId: bestRug.id,
        variantId: bestRug.defaultVariantId,
      };
    });

    if (!hasRug) {
      const [safeX, safeZ] = clampToRoom(
        sofaX,
        rugZ,
        bestRug.dimsMm.w / 1000,
        bestRug.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        0
      );
      nextItems.push({
        instanceId: newInstanceId(),
        productId: bestRug.id,
        variantId: bestRug.defaultVariantId,
        position: [safeX, 0, safeZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
    }

    showRuleToast("Rug sized to sofa width");
    track("rule_applied", { rule: "rug_size", design_id: designId ?? null });

    return { items: nextItems } as DesignSnapshot;
  };

  const applyLayoutPlan = (plan: LayoutPlan) => {
    const picks = plan?.picks ?? {};

    const backWallZ = -roomDepth / 2 + wallThickness + 0.2;
    const frontWallZ = roomDepth / 2 - wallThickness - 0.2;
    const centerX = 0;
    const WALKWAY = 0.6;

    const sofaId = picks.sofa as string | undefined;
    let rugId = picks.rug as string | undefined;
    const coffeeId = picks.coffee_table as string | undefined;
    const tvId = picks.tv_console as string | undefined;
    const chairId = picks.accent_chair as string | undefined;
    const lampId = picks.floor_lamp as string | undefined;

    const next: PlacedItem[] = [];

    const sofaP = sofaId ? CATALOG_ITEMS[sofaId] : null;
    let appliedRugRule = false;

    let sofaX = 0;
    let sofaZ = backWallZ;
    let coffeeX = centerX;
    let coffeeZ = backWallZ + 1.4;
    let lampX = 0;
    let lampZ = 0;

    if (sofaId && sofaP) {
      const p = sofaP;
      sofaX = 0;
      sofaZ = backWallZ;
      const [safeX, safeZ] = clampToRoom(
        sofaX,
        sofaZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      sofaX = safeX;
      sofaZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [sofaX, 0, sofaZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
    }

    if (sofaP) {
      const bestRug = pickBestRugForSofa({
        sofaWidth: sofaP.dimsMm.w / 1000,
        style,
        budget,
      });
      if (bestRug) {
        rugId = bestRug.id;
        appliedRugRule = true;
      }
    }

    if (rugId && sofaP && CATALOG_ITEMS[rugId]) {
      const rugP = CATALOG_ITEMS[rugId];
      let rugX = sofaX;
      let rugZ = sofaZ + sofaP.dimsMm.d / 1000 * 0.35;
      const [safeX, safeZ] = clampToRoom(
        rugX,
        rugZ,
        rugP.dimsMm.w / 1000,
        rugP.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      rugX = safeX;
      rugZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: rugP.id,
        variantId: rugP.defaultVariantId,
        position: [rugX, 0, rugZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
      if (appliedRugRule) {
        showRuleToast("Rug sized to sofa width");
        track("rule_applied", { rule: "rug_size", design_id: designId ?? null });
      }
    }

    if (coffeeId && sofaP && CATALOG_ITEMS[coffeeId]) {
      const coffeeP = CATALOG_ITEMS[coffeeId];

      const sofaDepth = sofaP.dimsMm.d / 1000;
      const coffeeDepth = coffeeP.dimsMm.d / 1000;
      const sofaFrontZ = sofaZ + sofaDepth / 2;

      coffeeX = sofaX;
      coffeeZ = sofaFrontZ + WALKWAY + coffeeDepth / 2;
      const [safeX, safeZ] = clampToRoom(
        coffeeX,
        coffeeZ,
        coffeeP.dimsMm.w / 1000,
        coffeeP.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      coffeeX = safeX;
      coffeeZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: coffeeP.id,
        variantId: coffeeP.defaultVariantId,
        position: [coffeeX, 0, coffeeZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
    }

    if (tvId && CATALOG_ITEMS[tvId]) {
      const p = CATALOG_ITEMS[tvId];
      let tvX = centerX;
      let tvZ = frontWallZ;
      const [safeX, safeZ] = clampToRoom(
        tvX,
        tvZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      tvX = safeX;
      tvZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [tvX, 0, tvZ],
        qty: 1,
        includeInCheckout: true,
      });
    }

    let chairX = -1.1;
    let chairZ = backWallZ + 1.2;
    lampX = chairX + 0.45;
    lampZ = chairZ + 0.25;

    if (chairId && CATALOG_ITEMS[chairId]) {
      const p = CATALOG_ITEMS[chairId];
      const chairR = footprintRadius(p.dimsMm.w / 1000, p.dimsMm.d / 1000);

      if (sofaP) {
        const sofaR = footprintRadius(sofaP.dimsMm.w / 1000, sofaP.dimsMm.d / 1000);
        [chairX, chairZ] = separateIfOverlapping(
          chairX,
          chairZ,
          chairR,
          sofaX,
          sofaZ,
          sofaR,
          0.25
        );
      }

      if (coffeeId && CATALOG_ITEMS[coffeeId]) {
        const coffeeP = CATALOG_ITEMS[coffeeId];
        const coffeeR = footprintRadius(
          coffeeP.dimsMm.w / 1000,
          coffeeP.dimsMm.d / 1000
        );
        [chairX, chairZ] = separateIfOverlapping(
          chairX,
          chairZ,
          chairR,
          coffeeX,
          coffeeZ,
          coffeeR,
          0.25
        );
      }

      if (lampId && CATALOG_ITEMS[lampId]) {
        const lampP = CATALOG_ITEMS[lampId];
        const lampR = footprintRadius(lampP.dimsMm.w / 1000, lampP.dimsMm.d / 1000);
        [chairX, chairZ] = separateIfOverlapping(
          chairX,
          chairZ,
          chairR,
          lampX,
          lampZ,
          lampR,
          0.2
        );
      }

      const targetX = 0;
      const targetZ = coffeeZ;
      const preRotY = Math.atan2(targetX - chairX, targetZ - chairZ);

      const [safeX, safeZ] = clampToRoom(
        chairX,
        chairZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        preRotY
      );

      chairX = safeX;
      chairZ = safeZ;

      const rotationY = Math.atan2(targetX - chairX, targetZ - chairZ);

      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [chairX, 0, chairZ],
        rotationY,
        qty: 1,
        includeInCheckout: true,
      });
    }

    if (lampId && CATALOG_ITEMS[lampId]) {
      const p = CATALOG_ITEMS[lampId];
      lampX = chairX + 0.45;
      lampZ = chairZ + 0.25;

      const preLampRotY = Math.atan2(chairX - lampX, chairZ - lampZ);
      const [safeX, safeZ] = clampToRoom(
        lampX,
        lampZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        preLampRotY
      );

      lampX = safeX;
      lampZ = safeZ;

      const lampRotY = Math.atan2(chairX - lampX, chairZ - lampZ);

      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [lampX, 0, lampZ],
        rotationY: lampRotY,
        qty: 1,
        includeInCheckout: true,
      });
    }

    commitItems(next, "AI layout arrangement");
    clearAllSelection();
  };

  const _getRandomSeed = () => {
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return Number(buf[0]);
    }
    return Math.floor(Math.random() * 1_000_000_000);
  };

  const runAiLayout = async (nextSeed?: number) => {
    if (!session?.user) {
      openGuestPrompt("ai_layout", () => {});
      return;
    }
    const seedToUse = nextSeed ?? aiSeed;

    if (nextSeed !== undefined) {
      setAiSeed(nextSeed);
    }

    const catalogList = Object.values(CATALOG_ITEMS).map((p) => ({
      id: p.id,
      category: p.category,
      price: getItemPrice(p),
      styleTags: p.styleTags,
      dimensions: getDimensions(p),
      defaultVariantId: p.defaultVariantId,
    }));

    try {
      const res = await fetch("/api/ai/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomWidth,
          roomDepth,
          style,
          budget,
          seed: seedToUse,
          catalog: catalogList,
        }),
      });

      const plan = await res.json();
      if (!res.ok) {
        alert(plan?.error ?? "AI failed");
        return;
      }

      applyLayoutPlan(plan);
    } catch (err) {
      alert(err instanceof Error ? err.message : "AI failed");
    }
  };

  const onBulkSwap = (direction: "cheaper" | "premium") => {
    const actionName = direction === "cheaper" ? "Make room cheaper" : "Make room premium";
    commitItems((prev) => bulkSwapItems({ items: prev, style, direction }), actionName);
  };

  const isEmpty = items.length === 0;
  const canEdit = !isClientPreview && sceneReady;
  const _isSharedLink = Boolean(shareToken) || pathname?.includes("/share/");

  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step === "completed") return;
    if (!isEmpty) {
      setSofaNudgeVisible(false);
      return;
    }
    if (sofaNudgeTimerRef.current) {
      window.clearTimeout(sofaNudgeTimerRef.current);
    }
    sofaNudgeTimerRef.current = window.setTimeout(() => {
      setSofaNudgeVisible(true);
    }, 800);
    return () => {
      if (sofaNudgeTimerRef.current) {
        window.clearTimeout(sofaNudgeTimerRef.current);
      }
    };
  }, [onboardingState.enabled, onboardingState.step, isEmpty]);

  const addItem = (
    productId: string,
    position: [number, number, number],
    rotationY?: number
  ) => {
    if (!sceneReady) return;
    const product = CATALOG_ITEMS[productId];
    if (!product) return;
    const id = newInstanceId();
    const productName = product.title || "Item";
    
    // Clamp new item position to room bounds to prevent wall penetration
    const [safeX, safeZ] = clampToRoom(
      position[0],
      position[2],
      product.dimsMm.w / 1000,
      product.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      rotationY ?? 0
    );
    
    commitItems((prev) => [
      ...prev,
      {
        instanceId: id,
        productId,
        variantId: product.defaultVariantId,
        position: [safeX, position[1], safeZ],
        rotationY,
        qty: 1,
        includeInCheckout: true,
      },
    ],
    `Add ${productName}`);
    updateSelection(new Set([id]), id);

    // Track meaningful action for stall detection
    trackMeaningfulAction();
  };

  const pickBestByCategory = useCallback(
    (category: string, targetWidth?: number) => {
      const candidates = Object.values(CATALOG_ITEMS).filter(
        (product) => product.category === category
      );
      if (!candidates.length) return null;
      if (!targetWidth) return candidates[0];
      let best = candidates[0];
      let bestDelta = Math.abs(candidates[0].dimsMm.w / 1000 - targetWidth);
      for (const candidate of candidates) {
        const delta = Math.abs(candidate.dimsMm.w / 1000 - targetWidth);
        if (delta < bestDelta) {
          best = candidate;
          bestDelta = delta;
        }
      }
      return best;
    },
    []
  );

  const buildGhostSuggestions = useCallback(
    (sofaItem: PlacedItem) => {
      const sofaProduct = CATALOG_ITEMS[sofaItem.productId];
      if (!sofaProduct) return [];

      const suggestions: Array<{
        id: string;
        productId: string;
        position: [number, number, number];
        rotationY?: number;
      }> = [];

      const targetRugWidth = sofaProduct.dimsMm.w / 1000 * 0.72;
      const rugProduct = pickBestByCategory("rug", targetRugWidth);
      if (rugProduct) {
        const rugZ = sofaItem.position[2] + sofaProduct.dimsMm.d / 1000 * 0.35;
        const [safeX, safeZ] = clampToRoom(
          sofaItem.position[0],
          rugZ,
          rugProduct.dimsMm.w / 1000,
          rugProduct.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness
        );
        suggestions.push({
          id: "ghost-rug",
          productId: rugProduct.id,
          position: [safeX, 0, safeZ],
        });
      }

      const coffeeProduct = pickBestByCategory("coffee_table");
      if (coffeeProduct) {
        const sofaFrontZ = sofaItem.position[2] + sofaProduct.dimsMm.d / 1000 / 2;
        const coffeeZ = sofaFrontZ + 0.45 + coffeeProduct.dimsMm.d / 1000 / 2;
        const [safeX, safeZ] = clampToRoom(
          sofaItem.position[0],
          coffeeZ,
          coffeeProduct.dimsMm.w / 1000,
          coffeeProduct.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness
        );
        suggestions.push({
          id: "ghost-coffee",
          productId: coffeeProduct.id,
          position: [safeX, 0, safeZ],
        });
      }

      const nearLeft = sofaItem.position[0] < -roomWidth * 0.25;
      const nearRight = sofaItem.position[0] > roomWidth * 0.25;
      const nearBack = sofaItem.position[2] < -roomDepth * 0.25;
      const nearFront = sofaItem.position[2] > roomDepth * 0.25;
      const isCorner = (nearLeft || nearRight) && (nearBack || nearFront);
      const lampProduct = pickBestByCategory("floor_lamp");

      if (isCorner && lampProduct) {
        const side = nearLeft ? -1 : 1;
        const depth = nearBack ? -1 : 1;
        const lampX =
          sofaItem.position[0] +
          side * (sofaProduct.dimsMm.w / 1000 / 2 + lampProduct.dimsMm.w / 1000 / 2 + 0.2);
        const lampZ =
          sofaItem.position[2] +
          depth * (sofaProduct.dimsMm.d / 1000 / 2 + lampProduct.dimsMm.d / 1000 / 2 + 0.2);
        const [safeX, safeZ] = clampToRoom(
          lampX,
          lampZ,
          lampProduct.dimsMm.w / 1000,
          lampProduct.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness
        );
        suggestions.push({
          id: "ghost-lamp",
          productId: lampProduct.id,
          position: [safeX, 0, safeZ],
        });
      }

      return suggestions;
    },
    [pickBestByCategory, roomDepth, roomWidth, wallThickness]
  );

  // Step 1: Track first item added
  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step === "completed") return;
    if (!items.length || firstItemTrackedRef.current) return;

    const firstItem = items[items.length - 1];
    const firstProduct = CATALOG_ITEMS[firstItem.productId];

    const eventKey = EventDedup.makeKey("first_item_added", designId);
    if (!eventDedupRef.current.has(eventKey)) {
      eventDedupRef.current.mark(eventKey);
      const startedAt = onboardingStartedAtRef.current ?? Date.now();
      track("first_item_added", {
        design_id: designId,
        isGuest: !session?.user,
        itemType: firstProduct?.category ?? "unknown",
        timeSinceStartMs: Date.now() - startedAt,
      });
    }
    firstItemTrackedRef.current = true;
  }, [items, onboardingState.enabled, onboardingState.step, designId, session?.user]);

  // Step 2: First sofa placed → auto-create seating zone + show affirmation + queue ghosts
  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step !== "prompt_add_sofa") return;

    const sofaItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "sofa");
    if (!sofaItem || firstSofaHandledRef.current) return;

    firstSofaHandledRef.current = true;

    // Hide nudge, show affirmation
    setSofaNudgeVisible(false);
    setSofaReinforceMessage("Nice. This defines your seating area.");
    window.setTimeout(() => setSofaReinforceMessage(null), 2000);

    // Auto-create seating zone
    autoCreateSeatingZone(sofaItem);

    // Evaluate constraints and show feedback
    const results = evaluateConstraints({
      design: { items },
      movedItemId: sofaItem.instanceId,
      room: { width: roomWidth, depth: roomDepth, wallThickness },
    });
    showConstraintsForMoment(results);
    showConfidenceSummary(results);

    // Fire event
    track("seating_zone_auto_created", {
      design_id: designId,
      isGuest: !session?.user,
      timeSinceStartMs: Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
    });

    // Transition to sofa_placed
    setOnboardingState((prev) => ({
      ...prev,
      step: "sofa_placed",
      lastInteractionAtMs: Date.now(),
    }));

    // Queue ghost suggestions after 600ms
    if (ghostTimerRef.current) {
      window.clearTimeout(ghostTimerRef.current);
    }
    ghostTimerRef.current = window.setTimeout(() => {
      const suggestions = buildGhostSuggestions(sofaItem);
      if (suggestions.length > 0) {
        setGhostSuggestions(suggestions);
        setShowGhostHint(true);

        // Track ghost shown
        track("ghost_suggestion_shown", {
          design_id: designId,
          isGuest: !session?.user,
          suggestionCount: suggestions.length,
        });

        // Auto-hide after 8s
        if (ghostTimerRef.current) {
          window.clearTimeout(ghostTimerRef.current);
        }
        ghostTimerRef.current = window.setTimeout(() => {
          setGhostSuggestions([]);
          setShowGhostHint(false);

          // Transition to ghosts_shown
          setOnboardingState((prev) => ({
            ...prev,
            step: "ghosts_shown",
            lastInteractionAtMs: Date.now(),
          }));
        }, 8000);
      } else {
        // No ghosts, skip to ghosts_shown
        setOnboardingState((prev) => ({
          ...prev,
          step: "ghosts_shown",
          lastInteractionAtMs: Date.now(),
        }));
      }
    }, 600);
  }, [
    autoCreateSeatingZone,
    buildGhostSuggestions,
    items,
    onboardingState.enabled,
    onboardingState.step,
    designId,
    roomDepth,
    roomWidth,
    showConfidenceSummary,
    showConstraintsForMoment,
    wallThickness,
    session?.user,
  ]);

  // Step 3: Detect activation (valid layout) → auto-complete onboarding
  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step === "completed") return;

    const sofaItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "sofa");
    const rugItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "rug");
    const coffeeItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "coffee_table");
    const hasSeatingZone = zones.some((zone) => zone.type === "seating");

    // Evaluate activation condition
    const isActivated = checkActivation({
      constraintResults,
      hasSofa: !!sofaItem,
      hasRug: !!rugItem,
      hasCoffeeTable: !!coffeeItem,
      hasSeatingZone,
    });

    if (isActivated && onboardingState.step !== "activated") {
      // Transition to activated
      setOnboardingState((prev) => ({
        ...prev,
        step: "activated",
        lastInteractionAtMs: Date.now(),
      }));

      // Show affirmation
      setSofaReinforceMessage("This room already works.");
      window.setTimeout(() => setSofaReinforceMessage(null), 2000);

      // Fire event
      const eventKey = EventDedup.makeKey("first_valid_layout", designId);
      if (!eventDedupRef.current.has(eventKey)) {
        eventDedupRef.current.mark(eventKey);
        track("first_valid_layout", {
          design_id: designId,
          isGuest: !session?.user,
          has: {
            sofa: !!sofaItem,
            rug: !!rugItem,
            coffee_table: !!coffeeItem,
            seating_zone: hasSeatingZone,
          },
          timeSinceStartMs: Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
        });
      }

      // Schedule auto-complete in 2.5s
      window.setTimeout(() => {
        setOnboardingState((prev) => ({
          ...prev,
          step: "completed",
        }));
        try {
          localStorage.setItem("onboarded", "1");
        } catch {
          // ignore
        }
        track("onboarding_completed", {
          design_id: designId,
          isGuest: !session?.user,
          completionReason: "valid_layout",
          timeSinceStartMs: Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
        });
      }, 2500);
    }
  }, [
    onboardingState.enabled,
    onboardingState.step,
    items,
    zones,
    constraintResults,
    designId,
    session?.user,
  ]);

  const _findByCategory = (category: string) => {
    return (
      items.find((i) => CATALOG_ITEMS[i.productId]?.category === category) ?? null
    );
  };

  // Track meaningful actions for stall detection
  const trackMeaningfulAction = useCallback(() => {
    lastActionTimeRef.current = Date.now();
    setOnboardingState((prev) => ({
      ...prev,
      lastInteractionAtMs: Date.now(),
    }));
  }, []);

  // Stall detection: show nudge if idle for 12-15s and onboarding enabled or < 5 actions
  useEffect(() => {
    if (!onboardingState.enabled || editorMode === "present" || isClientPreview) return;

    if (stallDetectionTimerRef.current) {
      window.clearTimeout(stallDetectionTimerRef.current);
    }

    const stallThresholdMs = 13000; // 13 seconds
    stallDetectionTimerRef.current = window.setTimeout(() => {
      const timeSinceLastAction = Date.now() - lastActionTimeRef.current;

      if (timeSinceLastAction >= stallThresholdMs && nudgeShownCountRef.current < 2) {
        // Calculate context
        const sofaItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "sofa");
        const rugItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "rug");
        const coffeeItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "coffee_table");

        const nudgeText = getNextBestActionNudge({
          hasItems: items.length > 0,
          hasSofa: !!sofaItem,
          hasRug: !!rugItem,
          hasCoffeeTable: !!coffeeItem,
          contentWarningCount: constraintResults.filter((r) => r.level === "warn" || r.level === "error").length,
          cartCount: items.filter((i) => i.includeInCheckout).length,
          mode: editorMode as "design" | "adjust" | "buy" | "present",
        });

        if (nudgeText) {
          setNextBestActionNudge(nudgeText);
          nudgeShownCountRef.current += 1;

          // Auto-dismiss after 5s
          window.setTimeout(() => {
            setNextBestActionNudge(null);
          }, 5000);

          track("stall_nudge_shown", {
            design_id: designId,
            nudge_text: nudgeText,
            nudge_count: nudgeShownCountRef.current,
          });
        }
      }
    }, stallThresholdMs);

    return () => {
      if (stallDetectionTimerRef.current) {
        window.clearTimeout(stallDetectionTimerRef.current);
      }
    };
  }, [onboardingState.enabled, editorMode, isClientPreview, items, constraintResults, designId]);

  const _saveStatusText = useMemo(() => {
    if (isSaving) return "Saving...";
    if (designId && lastDbSaveAt) {
      return `Saved ${formatTimeAgo(lastDbSaveAt)}`;
    }
    if (!designId && lastLocalAutosaveAt) return "Offline (saved locally)";
    return designId ? "Not saved yet" : "Offline (saved locally)";
  }, [designId, isSaving, lastDbSaveAt, lastLocalAutosaveAt]);

  const handleDraggingChange = (isDragging: boolean) => {
    setSofaDragging(isDragging);
    if (isDragging) {
      dragCommitRef.current = false;
      return;
    }
    // On drag end, commit the transaction if one was started
    if (dragCommitRef.current) {
      history.commit();
      dragCommitRef.current = false;
    }
  };

  const triggerGridPulse = () => {
    if (!showGrid || !snapEnabled || !isDesigner) return;
    setGridPulse(true);
    if (gridPulseTimerRef.current) {
      window.clearTimeout(gridPulseTimerRef.current);
    }
    gridPulseTimerRef.current = window.setTimeout(() => {
      setGridPulse(false);
    }, 240);
  };

  const _handleSnapSuccess = () => {
    triggerGridPulse();
    showSnapToastOnce();
  };

  const visibleConstraints = pickTopConstraints(constraintResults);
  const lightConfig = LIGHTING_PRESETS[lightingPreset];

  return (
    <main
      className="appShell relative min-h-screen w-screen"
      data-theme={showDesignerTheme ? "designer" : "default"}
      style={{ transition: "background 200ms ease, color 200ms ease" }}
    >
      <div className="absolute inset-0">
        <div className="relative h-full w-full">
          <Canvas
            data-testid="scene-canvas"
            shadows
            dpr={[1, 2]}
            gl={{
              preserveDrawingBuffer: true,
              antialias: true,
              outputColorSpace: THREE.SRGBColorSpace,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: lightConfig.exposure ?? 0.88,
            }}
            camera={{ position: [4.5, 3.2, 5.5], fov: 45, near: 0.1, far: 100 }}
            onCreated={({ gl }) => {
              (gl as THREE.WebGLRenderer & { physicallyCorrectLights?: boolean }).physicallyCorrectLights = true;
            }}
            onPointerMissed={() => clearAllSelection()}
          >
            <LoadingOverlay />
            <SceneProgressBridge onReadyChange={setSceneReady} />
            <Suspense fallback={null}>
              <Environment preset={lightConfig.envPreset ?? "apartment"} />
            </Suspense>
            {/* Apply lighting preset */}
            <hemisphereLight
              args={[
                lightConfig.skyColor ?? "#eaf1ff",
                lightConfig.groundColor ?? "#c9b8a3",
                lightConfig.hemiIntensity ?? 0.45,
              ]}
            />
            <ambientLight
              color={lightConfig.ambientColor ?? "#f4efe5"}
              intensity={lightConfig.ambientIntensity}
            />
            <directionalLight
              position={[6, 8, 4]}
              color={lightConfig.keyColor ?? "#fff1db"}
              intensity={lightConfig.keyIntensity ?? lightConfig.directionalIntensity}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-near={1}
              shadow-camera-far={25}
              shadow-camera-left={-10}
              shadow-camera-right={10}
              shadow-camera-top={10}
              shadow-camera-bottom={-10}
              shadow-bias={lightConfig.shadowBias}
              shadow-radius={lightConfig.shadowRadius}
            />
            <directionalLight
              position={[-4, 4, -3]}
              color={lightConfig.fillColor ?? "#d7e5ff"}
              intensity={lightConfig.fillIntensity ?? lightConfig.directionalIntensity * 0.5}
            />

            <Suspense fallback={<RoomSkeleton />}>
              <Room
                width={roomWidth}
                depth={roomDepth}
                height={roomHeight}
                wallThickness={wallThickness}
              />

              <DesignerGrid
                visible={isDesigner && showGrid && !isClientPreview && (editorMode === "design" || editorMode === "adjust")}
                pulse={gridPulse}
              />

              {!isClientPreview &&
                editorMode !== "present" &&
                zones.map((zone) => {
                  const bounds = getZoneBounds(zone);
                  if (!bounds) return null;
                  return (
                    <ZoneOutline
                      key={zone.id}
                      data-testid={zone.type === "seating" ? "seating-zone" : `${zone.type}-zone`}
                      bounds={bounds}
                      label={getZoneLabel(zone.type)}
                      selected={zone.id === selectedZoneId}
                      onSelect={() => {
                        setSelectedZoneId(zone.id);
                        clearSelection();
                      }}
                    />
                  );
                })}

              {items.map((it) => {
                const product = CATALOG_ITEMS[it.productId];
                if (!product) return null;
                const variant =
                  product.variants.find((v) => v.id === it.variantId) ??
                  product.variants[0];

                return (
                  <Furniture
                    key={it.instanceId}
                    data-testid="item-in-scene"
                    product={product}
                    variantColor={variant.colorHex}
                    initialPosition={it.position}
                    initialRotationY={it.rotationY ?? 0}
                    roomWidth={roomWidth}
                    roomDepth={roomDepth}
                    wallThickness={wallThickness}
                    onDraggingChange={handleDraggingChange}
                    walls={walls}
                    instanceId={it.instanceId}
                    isSelected={editorMode !== "present" && selectedIds.has(it.instanceId)}
                    showGuidesAndMeasurements={editorMode === "design" || editorMode === "adjust"}
                    onSelect={(id: string, additive: boolean) => {
                      if (editorMode === "buy" || editorMode === "present") return;
                      trackFirstInteraction();
                      handleSelect(id, additive);
                    }}
                    onMove={(id: string, pos: [number, number, number]) => {
                      trackFirstInteraction();
                      const selectedSet = selectedIdsRef.current;
                      const isGroupMove = selectedSet.size > 1 && selectedSet.has(id);

                      if (!isGroupMove) {
                        const currentItems = itemsRef.current;
                        const mover = currentItems.find((x) => x.instanceId === id);
                        if (!mover) return false;
                        const moverProduct = CATALOG_ITEMS[mover.productId];
                        if (moverProduct?.category === "rug") {
                          return true;
                        }
                        const candidate = { ...mover, position: pos };
                        const moverAABB = getItemAABB(candidate);
                        if (moverAABB) {
                          for (const blocker of currentItems) {
                            if (blocker.instanceId === id) continue;
                            const blockerProduct = CATALOG_ITEMS[blocker.productId];
                            if (blockerProduct?.category === "rug") continue;
                            const blockerAABB = getItemAABB(blocker);
                            if (!blockerAABB) continue;
                            if (aabbIntersects(moverAABB, blockerAABB)) {
                              showRuleToast("Overlapping item — move blocked");
                              return false;
                            }
                          }
                        }
                        const updater = (prev: PlacedItem[]) =>
                          prev.map((x) =>
                            x.instanceId === id ? { ...x, position: pos } : x
                          );
                        if (!dragCommitRef.current) {
                          // First move: start transaction and update state
                          history.begin("Move item");
                          const nextItems = updater(itemsRef.current);
                          itemsRef.current = nextItems;
                          setDesignSnapshot({
                            ...designSnapshotRef.current,
                            items: nextItems,
                          });
                          dragCommitRef.current = true;
                        } else {
                          // Subsequent moves: just update state (transaction continues)
                          setItemsPresent(updater);
                        }
                        return true;
                      }

                      const currentItems = itemsRef.current;
                      const mover = currentItems.find((x) => x.instanceId === id);
                      if (!mover) return false;

                      const deltaX = pos[0] - mover.position[0];
                      const deltaZ = pos[2] - mover.position[2];

                      const movable = currentItems.filter(
                        (x) => selectedSet.has(x.instanceId) && !(isDesigner && x.locked)
                      );
                      if (!movable.length) return false;
                      const movableIds = new Set(movable.map((x) => x.instanceId));
                      const blockers = currentItems.filter((x) => !movableIds.has(x.instanceId));

                      const nextItems = currentItems.map((item) => {
                        if (!movableIds.has(item.instanceId)) return item;
                        const product = CATALOG_ITEMS[item.productId];
                        if (!product) return item;
                        const nextX = item.position[0] + deltaX;
                        const nextZ = item.position[2] + deltaZ;
                        const [safeX, safeZ] = clampToRoom(
                          nextX,
                          nextZ,
                          product.dimsMm.w / 1000,
                          product.dimsMm.d / 1000,
                          roomWidth,
                          roomDepth,
                          wallThickness,
                          item.rotationY ?? 0
                        );
                        const nextPos: [number, number, number] = [
                          safeX,
                          item.position[1] ?? 0,
                          safeZ,
                        ];
                        return { ...item, position: nextPos };
                      });

                      let collision = false;
                      for (const moved of nextItems) {
                        if (!movableIds.has(moved.instanceId)) continue;
                        const movedProduct = CATALOG_ITEMS[moved.productId];
                        if (movedProduct?.category === "rug") continue;
                        const movedAABB = getItemAABB(moved);
                        if (!movedAABB) continue;
                        for (const blocker of blockers) {
                          const blockerProduct = CATALOG_ITEMS[blocker.productId];
                          if (blockerProduct?.category === "rug") continue;
                          const blockerAABB = getItemAABB(blocker);
                          if (!blockerAABB) continue;
                          if (aabbIntersects(movedAABB, blockerAABB)) {
                            collision = true;
                            break;
                          }
                        }
                        if (collision) break;
                      }
                      if (collision) return false;

                      if (!dragCommitRef.current) {
                        history.begin("Move group");
                        itemsRef.current = nextItems;
                        setDesignSnapshot({
                          ...designSnapshotRef.current,
                          items: nextItems,
                        });
                        dragCommitRef.current = true;
                      } else {
                        itemsRef.current = nextItems;
                        setDesignSnapshot({
                          ...designSnapshotRef.current,
                          items: nextItems,
                        });
                      }
                      return true;
                    }}
                    onRotate={(id: string, rotY: number) => {
                      trackFirstInteraction();
                      const selectedSet = selectedIdsRef.current;
                      const isGroupRotate = selectedSet.size > 1 && selectedSet.has(id);
                      if (!isGroupRotate) {
                        commitItems((prev: PlacedItem[]) =>
                          prev.map((x) =>
                            x.instanceId === id ? { ...x, rotationY: rotY } : x
                          ),
                          "Rotate item"
                        );
                        const results = evaluateConstraints({
                          design: { items: itemsRef.current },
                          movedItemId: id,
                          room: { width: roomWidth, depth: roomDepth, wallThickness },
                        });
                        showConstraintsForMoment(results);
                        showConfidenceSummary(results);
                        return true;
                      }

                      const currentItems = itemsRef.current;
                      const mover = currentItems.find((x) => x.instanceId === id);
                      if (!mover) return false;
                      const deltaRot = rotY - (mover.rotationY ?? 0);

                      const movable = currentItems.filter(
                        (x) => selectedSet.has(x.instanceId) && !(isDesigner && x.locked)
                      );
                      if (!movable.length) return false;
                      const movableIds = new Set(movable.map((x) => x.instanceId));
                      const blockers = currentItems.filter((x) => !movableIds.has(x.instanceId));
                      const bounds = getSelectionBounds(movable);
                      if (!bounds) return false;

                      const pivotX = bounds.centerX;
                      const pivotZ = bounds.centerZ;
                      const cos = Math.cos(deltaRot);
                      const sin = Math.sin(deltaRot);

                      const nextItems = currentItems.map((item) => {
                        if (!movableIds.has(item.instanceId)) return item;
                        const product = CATALOG_ITEMS[item.productId];
                        if (!product) return item;
                        const offsetX = item.position[0] - pivotX;
                        const offsetZ = item.position[2] - pivotZ;
                        const rotatedX = offsetX * cos - offsetZ * sin;
                        const rotatedZ = offsetX * sin + offsetZ * cos;
                        const nextRot = (item.rotationY ?? 0) + deltaRot;
                        const [safeX, safeZ] = clampToRoom(
                          pivotX + rotatedX,
                          pivotZ + rotatedZ,
                          product.dimsMm.w / 1000,
                          product.dimsMm.d / 1000,
                          roomWidth,
                          roomDepth,
                          wallThickness,
                          nextRot
                        );
                        const nextPos: [number, number, number] = [
                          safeX,
                          item.position[1] ?? 0,
                          safeZ,
                        ];
                        return {
                          ...item,
                          position: nextPos,
                          rotationY: nextRot,
                        };
                      });

                      let collision = false;
                      for (const moved of nextItems) {
                        if (!movableIds.has(moved.instanceId)) continue;
                        const movedProduct = CATALOG_ITEMS[moved.productId];
                        if (movedProduct?.category === "rug") continue;
                        const movedAABB = getItemAABB(moved);
                        if (!movedAABB) continue;
                        for (const blocker of blockers) {
                          const blockerProduct = CATALOG_ITEMS[blocker.productId];
                          if (blockerProduct?.category === "rug") continue;
                          const blockerAABB = getItemAABB(blocker);
                          if (!blockerAABB) continue;
                          if (aabbIntersects(movedAABB, blockerAABB)) {
                            collision = true;
                            break;
                          }
                        }
                        if (collision) break;
                      }
                      if (collision) return false;

                      commitItems(nextItems, "Rotate group");
                      const results = evaluateConstraints({
                        design: { items: itemsRef.current },
                        movedItemId: id,
                        room: { width: roomWidth, depth: roomDepth, wallThickness },
                      });
                      showConstraintsForMoment(results);
                      showConfidenceSummary(results);
                      return true;
                    }}
                    locked={it.locked}
                    interactive={canEdit}
                    showSelection={canEdit}
                    showLocks={isDesigner && !isClientPreview}
                    onSnapPulse={triggerGridPulse}
                    enableSnap={snapEnabled && !isClientPreview}
                    items={items}
                    materialPreset={it.materialPreset}
                    materialOverrides={it.materialOverrides}
                    onDragEnd={(id: string, pos: [number, number, number]) => {
                      const nextItems = itemsRef.current.map((item) =>
                        item.instanceId === id ? { ...item, position: pos } : item
                      );
                      const results = evaluateConstraints({
                        design: { items: nextItems },
                        movedItemId: id,
                        room: { width: roomWidth, depth: roomDepth, wallThickness },
                      });
                      showConstraintsForMoment(results);
                      showConfidenceSummary(results);
                    }}
                  />
                );
              })}
            </Suspense>

            <CameraCapture
              cameraRef={cameraRef}
              canvasRef={canvasRef}
              rendererRef={rendererRef}
              sceneRef={sceneRef}
            />

            <OrbitControls
              ref={orbitControlsRef}
              target={[0, 1.1, 0]}
              enableDamping
              dampingFactor={0.08}
              enablePan={!isClientPreview}
              enableZoom={!isClientPreview}
              rotateSpeed={0.8}
              minDistance={2.5}
              maxDistance={10}
              minPolarAngle={0.35}
              maxPolarAngle={Math.PI / 2.05}
              enabled={!sofaDragging}
              onChange={() => {
                if (!isCameraAnimatingRef.current) {
                  updateCameraViewFromScene();
                }
              }}
            />
          </Canvas>

          {selectedIds.size > 1 && !isClientPreview && (
            <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-panel flex items-center gap-2 rounded-full px-3 py-2"
                    : "flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow"
                }
              >
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-xs font-semibold"
                      : "text-xs font-semibold text-neutral-900"
                  }
                >
                  Group ({selectedIds.size})
                </div>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={alignSelectionX}
                >
                  Align X center
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={alignSelectionZ}
                >
                  Align Z center
                </button>
                <select
                  className={
                    showDesignerTheme
                      ? "rounded-full border bg-transparent px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900"
                  }
                  value={pendingZoneType}
                  onChange={(e) =>
                    setPendingZoneType(e.target.value as Zone["type"])
                  }
                >
                  <option value="seating">Seating</option>
                  <option value="reading">Reading</option>
                  <option value="tv">TV</option>
                  <option value="dining">Dining</option>
                </select>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={createZoneFromSelection}
                >
                  Create zone
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => clearAllSelection()}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {selectedZone && !isClientPreview && (
            <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-panel flex items-center gap-2 rounded-full px-3 py-2"
                    : "flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow"
                }
              >
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-xs font-semibold"
                      : "text-xs font-semibold text-neutral-900"
                  }
                >
                  {getZoneLabel(selectedZone.type)}
                </div>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => autoLayoutZone(selectedZone.id)}
                >
                  Auto-layout
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => rotateZone(selectedZone.id, Math.PI / 2)}
                >
                  Rotate zone
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => ungroupZone(selectedZone.id)}
                >
                  Ungroup
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Layer 1: Minimal Top Bar */}
        <div className={`absolute left-0 right-0 top-0 z-50 flex items-center justify-between px-4 py-3 transition-opacity duration-300 ${
          isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
        }`}>
          {/* Left: Undo/Redo */}
          <div className="flex items-center gap-2">
            <button
              className={
                showDesignerTheme
                  ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
                  : "rounded-lg bg-white px-3 py-2 text-sm text-neutral-900 shadow hover:bg-neutral-50 disabled:opacity-50"
              }
              onClick={undoSafe}
              disabled={isClientPreview || !canUndo}
              title={undoName ? `Undo "${undoName}" (Cmd/Ctrl+Z)` : "Undo (Cmd/Ctrl+Z)"}
            >
              ↶ Undo
            </button>
            <button
              className={
                showDesignerTheme
                  ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
                  : "rounded-lg bg-white px-3 py-2 text-sm text-neutral-900 shadow hover:bg-neutral-50 disabled:opacity-50"
              }
              onClick={redoSafe}
              disabled={isClientPreview || !canRedo}
              title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
            >
              ↷ Redo
            </button>
          </div>

          {/* Center: Mode Switcher + NEW: Room Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow">
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  editorMode === "design"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
                onClick={() => setEditorMode("design")}
              >
                Design
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  editorMode === "adjust"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
                onClick={() => setEditorMode("adjust")}
              >
                Adjust
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  editorMode === "buy"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
                onClick={() => setEditorMode("buy")}
              >
                Cart
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  editorMode === "present"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
                onClick={() => {
                  if (editorMode === "present") {
                    setShowPresentModal(false);
                    setEditorMode("design");
                  } else {
                    setEditorMode("present");
                  }
                }}
              >
                {editorMode === "present" ? "Exit Present" : "Present"}
              </button>
            </div>

            {/* NEW: Room Switcher Component */}
            <RoomSwitcher
              snapshot={designSnapshot}
              onSwitchRoom={handleSwitchRoom}
              onAddRoom={handleAddRoom}
              disabled={editorMode === "present" || isClientPreview}
            />
          </div>

          {/* Right: Auth + Save + Cart + Present buttons */}
          <div className="flex items-center gap-2">
            <AuthButtons isAuthed={!!session?.user} />
            
            <button
              className={
                isDesigner
                  ? "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-700"
                  : "rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 shadow hover:bg-gray-200"
              }
              onClick={() => {
                if (!canUseDesigner && !isDesigner) {
                  setUpgradeReason("designer");
                  setShowUpgrade(true);
                  return;
                }
                setUrlMode(isDesigner ? "homeowner" : "designer");
              }}
              title={isDesigner ? "Exit Designer Mode" : "Enter Designer Mode (Pro)"}
            >
              {isDesigner ? "🎨 Designer" : "Designer"}
            </button>
            
            {isDesigner && (
              <button
                data-testid="present-mode"
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                  isClientPreview
                    ? "bg-red-600 text-white hover:bg-red-700 shadow"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow"
                }`}
                onClick={() => setClientPreview((v) => !v)}
                title="Toggle Present Mode (P)"
              >
                {isClientPreview ? "🎨 Exit Presentation (P)" : "👁️ Present Mode (P)"}
              </button>
            )}
            
            {session?.user && (
              <button
                data-testid="load-design"
                className={
                  showDesignerTheme
                    ? "rounded-lg bg-[#2a3a4a] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a4a5a]"
                    : "rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-700"
                }
                onClick={() => {
                  if (!showMyDesigns) {
                    fetchMyDesigns();
                  }
                  setShowMyDesigns(!showMyDesigns);
                }}
                title="Load a saved design"
              >
                📂 Load Design
              </button>
            )}
            
            <button
              data-testid="save-design"
              className={
                showDesignerTheme
                  ? "rounded-lg bg-[#1b2030] px-4 py-2 text-sm font-medium text-white"
                  : "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
              }
              onClick={async () => {
                if (!session?.user) {
                  openGuestPrompt("save", () => {});
                  return;
                }
                const savedId = await saveDesignToCloud();
                if (savedId) {
                  alert(`Saved to cloud! Design ID: ${savedId}`);
                }
              }}
            >
              {session?.user ? "Save" : "Save (Sign in)"}
            </button>
            
            {editorMode === "present" && (
              <button
                className={
                  showDesignerTheme
                    ? "rounded-lg bg-[#151820] px-4 py-2 text-sm text-neutral-200"
                    : "rounded-lg bg-white px-4 py-2 text-sm shadow hover:bg-neutral-50"
                }
                onClick={() => setShowPresentModal(true)}
              >
                Export & Camera
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Exit Client Preview Button - Always Visible */}
      {isClientPreview && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 transform">
          <button
            className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-700"
            onClick={() => setClientPreview(false)}
            title="Exit Presentation Mode (P)"
          >
            ✕ Exit Presentation
          </button>
        </div>
      )}

      {/* Layer 2C: Commerce Panel (visible in BUY mode) */}
      {editorMode === "buy" && (
        <div
          className={`absolute right-4 top-20 z-20 w-[340px] space-y-4 transition-opacity duration-300 ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
          <CartSidebar
          items={items}
          designId={designId ?? null}
          plan={plan}
          isGuest={!session?.user}
          onGuestCapture={(reason, onContinue) => openGuestPrompt(reason, onContinue)}
          onRemove={(instanceId) => {
            const removedItem = items.find(x => x.instanceId === instanceId);
            const productName = removedItem ? CATALOG_ITEMS[removedItem.productId]?.title || "Item" : "Item";
            commitItems((prev) => prev.filter((x) => x.instanceId !== instanceId), `Delete ${productName}`);
            if (selectedIdsRef.current.has(instanceId)) {
              const next = new Set(selectedIdsRef.current);
              next.delete(instanceId);
              const nextPrimary =
                primaryIdRef.current === instanceId
                  ? next.size
                    ? Array.from(next)[next.size - 1]
                    : null
                  : primaryIdRef.current;
              updateSelection(next, nextPrimary);
            }
          }}
          onSetQty={(instanceId, qty) => {
            commitItems((prev) =>
              prev.map((x) => (x.instanceId === instanceId ? { ...x, qty } : x)),
              "Change quantity"
            );
          }}
          onSetInclude={(instanceId, includeInCheckout) => {
            commitItems((prev) =>
              prev.map((x) =>
                x.instanceId === instanceId ? { ...x, includeInCheckout } : x
              ),
              includeInCheckout ? "Include in checkout" : "Exclude from checkout"
            );
          }}
          onBulkSwap={onBulkSwap}
          onShowUpgrade={() => setShowUpgrade(true)}
          theme={showDesignerTheme ? "designer" : "default"}
        />
        </div>
      )}

      {/* Layer 2B: Inspector Panel (visible in ADJUST mode when item selected) */}
      {editorMode === "adjust" && selectedProduct && (
        <div
          className={`absolute right-4 top-20 z-20 w-[340px] transition-opacity duration-300 ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
        {selectedProduct && (
          <div
            className={
              showDesignerTheme
                ? "designer-panel designer-panel-strong w-[340px] rounded-xl p-4"
                : "w-[340px] rounded-xl bg-white p-4 shadow"
            }
          >
            <div
              className={
                showDesignerTheme
                  ? "designer-text-primary text-sm font-semibold"
                  : "text-sm font-semibold text-neutral-900"
              }
            >
              Selected Item
            </div>

            <div className="mt-3 space-y-2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-primary text-base font-semibold"
                    : "text-base font-semibold text-neutral-900"
                }
              >
                {selectedProduct.title}
              </div>
              {selectedItem?.locked && (
                <div
                  className={
                    isDesigner
                      ? "designer-accent-pill mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs"
                      : "mt-2 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
                  }
                >
                  Locked
                </div>
              )}
              {selectedProduct.commerce.type === "shopify" ? (
                <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                  Buy on this site
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                  External retailer
                </span>
              )}
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-secondary text-sm"
                    : "text-sm text-neutral-900"
                }
              >
                ID: {selectedProduct.id}
              </div>
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-secondary text-sm"
                    : "text-sm text-neutral-900"
                }
              >
                Price: {formatMoney(getItemPrice(selectedProduct))}
              </div>
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-secondary text-sm"
                    : "text-sm text-neutral-900"
                }
              >
                Size: {selectedProduct.dimsMm.w / 1000}m × {selectedProduct.dimsMm.d / 1000}m × {selectedProduct.dimsMm.h / 1000}m
              </div>
            </div>

            <div className="pt-2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-primary text-sm font-semibold"
                    : "text-sm font-semibold text-neutral-900"
                }
              >
                Variants
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {selectedProduct.variants.map((v) => {
                  const active = v.id === selectedItem?.variantId;
                  return (
                    <button
                      key={v.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        showDesignerTheme
                          ? "designer-text-primary"
                          : "text-neutral-900"
                      } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                      onClick={() => {
                        if (!selectedItem) return;
                        commitItems((prev) =>
                          prev.map((it) =>
                            it.instanceId === selectedItem.instanceId
                              ? { ...it, variantId: v.id }
                              : it
                          )
                        );
                      }}
                    >
                      <span
                        className="h-4 w-4 rounded-full border"
                        style={{ background: v.colorHex }}
                      />
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3">
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-primary text-sm font-semibold"
                    : "text-sm font-semibold text-neutral-900"
                }
              >
                Finish
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {(() => {
                  const presets = getPresetsForCategory(selectedProduct.category);
                  if (presets.length === 0) {
                    return <div className={showDesignerTheme ? "designer-text-muted text-xs" : "text-xs text-neutral-500"}>No finish options</div>;
                  }
                  return presets.map((preset) => {
                    const active = selectedItem?.materialPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        style={{
                          backgroundColor: active ? `${preset.color}20` : "transparent",
                          borderColor: active ? preset.color : undefined,
                        }}
                        onClick={() => {
                          if (!selectedItem) return;
                          commitItems((prev) =>
                            prev.map((it) =>
                              it.instanceId === selectedItem.instanceId
                                ? { ...it, materialPreset: preset.id }
                                : it
                            ),
                            `Change finish to ${preset.label}`
                          );
                        }}
                        title={preset.label}
                      >
                        <span
                          className="inline-block mr-2 h-3 w-3 rounded-full border border-neutral-300"
                          style={{ backgroundColor: preset.color }}
                        />
                        {preset.label}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <button
              className={
                showDesignerTheme
                  ? "mt-2 w-full rounded-lg bg-[#1b2030] px-3 py-2 text-sm text-white"
                  : "mt-2 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
              }
              disabled={!canEdit}
              onClick={() => {
                if (!selectedInstanceId || !selectedProduct) return;

                const options = findSwapOptions({
                  productId: selectedProduct.id,
                  style,
                  direction: "cheaper",
                });

                const best = options[0];
                if (!best) return alert("No cheaper alternatives found.");

                commitItems((prev) =>
                  prev.map((x) =>
                    x.instanceId === selectedInstanceId
                      ? { ...x, productId: best.id, variantId: best.defaultVariantId }
                      : x
                  )
                );
              }}
            >
              Swap to cheaper
            </button>

            <button
              className={
                showDesignerTheme
                  ? "mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                  : "mt-2 w-full rounded-lg border px-3 py-2 text-sm"
              }
              disabled={!canEdit}
              onClick={() => {
                if (!selectedInstanceId || !selectedProduct) return;

                const options = findSwapOptions({
                  productId: selectedProduct.id,
                  style,
                  direction: "premium",
                });

                const best = options[0];
                if (!best) return alert("No premium alternatives found.");

                commitItems((prev) =>
                  prev.map((x) =>
                    x.instanceId === selectedInstanceId
                      ? { ...x, productId: best.id, variantId: best.defaultVariantId }
                      : x
                  )
                );
              }}
            >
              Upgrade this item
            </button>

            <div className="pt-2 flex gap-2">
              {(selectedProduct.commerce.type === "affiliate" || selectedProduct.commerce.type === "shopify") ? (
                <button
                  className="mt-3 w-full rounded-lg bg-green-600 px-3 py-2 text-sm text-white"
                  onClick={async () => {
                    const buyUrl = selectedProduct.commerce.type === "affiliate" 
                      ? selectedProduct.commerce.data.url 
                      : selectedProduct.commerce.type === "shopify"
                      ? `https://yoursite.com/products/${selectedProduct.id}`
                      : "";
                    const retailer = selectedProduct.commerce.type === "affiliate" ? selectedProduct.commerce.data.retailer : null;
                    try {
                      const res = await fetch("/api/track/click", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          designId: designId ?? null,
                          productId: selectedProduct.id,
                          price: getItemPrice(selectedProduct),
                          retailer: retailer,
                          buyUrl: buyUrl,
                        }),
                      });
                      const data = await res.json();
                      const clickKey = data?.clickKey as string | undefined;

                      const url = new URL(buyUrl);
                      if (clickKey) url.searchParams.set("clickKey", clickKey);
                      url.searchParams.set("utm_source", "interior-ai");
                      url.searchParams.set("utm_medium", "affiliate");

                      window.open(url.toString(), "_blank", "noopener,noreferrer");
                    } catch {
                      window.open(buyUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  Buy now
                </button>
              ) : (
                <button
                  className="mt-3 w-full rounded-lg bg-neutral-200 px-3 py-2 text-sm text-neutral-700"
                  disabled
                >
                  Buy link coming soon
                </button>
              )}

              {isDesigner && (
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-lg border px-3 py-2 text-sm"
                      : "rounded-lg border px-3 py-2 text-sm text-neutral-900"
                  }
                  disabled={!canEdit}
                  onClick={() => {
                    const selectedSet = selectedIdsRef.current;
                    if (selectedSet.size > 1) {
                      const selectedItems = itemsRef.current.filter((x) =>
                        selectedSet.has(x.instanceId)
                      );
                      if (!selectedItems.length) return;
                      const shouldLock = selectedItems.some((x) => !x.locked);
                      commitItems(
                        (prev) =>
                          prev.map((x) =>
                            selectedSet.has(x.instanceId)
                              ? { ...x, locked: shouldLock }
                              : x
                          ),
                        shouldLock ? "Lock selected" : "Unlock selected"
                      );
                      return;
                    }

                    if (!selectedItem) return;
                    const nextLocked = !selectedItem.locked;
                    commitItems(
                      (prev) =>
                        prev.map((x) =>
                          x.instanceId === selectedItem.instanceId
                            ? { ...x, locked: nextLocked }
                            : x
                        ),
                      nextLocked ? "Lock item" : "Unlock item"
                    );
                  }}
                >
                  {selectedIds.size > 1
                    ? itemsRef.current
                        .filter((x) => selectedIdsRef.current.has(x.instanceId))
                        .every((x) => x.locked)
                      ? "Unlock selected"
                      : "Lock selected"
                    : selectedItem?.locked
                      ? "Unlock"
                      : "Lock"}
                </button>
              )}

              <button
                className={
                  showDesignerTheme
                    ? "rounded-lg bg-[#1b2030] px-3 py-2 text-sm text-white hover:bg-[#232b3f]"
                    : "rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-900 hover:bg-neutral-200"
                }
                disabled={!canEdit}
                onClick={() => {
                  if (!selectedItem) return;

                  commitItems((prev) =>
                    prev.filter((x) => x.instanceId !== selectedItem.instanceId)
                  );
                  if (selectedIdsRef.current.has(selectedItem.instanceId)) {
                    const next = new Set(selectedIdsRef.current);
                    next.delete(selectedItem.instanceId);
                    const nextPrimary =
                      primaryIdRef.current === selectedItem.instanceId
                        ? next.size
                          ? Array.from(next)[next.size - 1]
                          : null
                        : primaryIdRef.current;
                    updateSelection(next, nextPrimary);
                  }
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Layer 2A: Design Panel (visible in DESIGN mode) */}
      {editorMode === "design" && (
        <div className="absolute left-4 top-20 z-20 w-[380px] space-y-4">
          {!isClientPreview && (
          <>
            {!session?.user && (
              <div
                className={
                  showDesignerTheme
                    ? "designer-panel rounded-xl p-3"
                    : "rounded-xl bg-white p-3 shadow"
                }
              >
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold"
                  }
                >
                  You are designing as a guest
                </div>
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-muted mt-1 text-xs"
                      : "mt-1 text-xs text-neutral-500"
                  }
                >
                  Sign in to save to cloud and share.
                </div>
                <button
                  className={
                    showDesignerTheme
                      ? "mt-2 rounded-lg bg-[#1b2030] px-3 py-2 text-sm text-white"
                      : "mt-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
                  }
                  onClick={() => signIn("google")}
                >
                  Sign in to save
                </button>
              </div>
            )}
            <div
              className={
                showDesignerTheme
                  ? "designer-panel rounded-xl p-4"
                  : "rounded-xl bg-white p-4 shadow"
              }
            >
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-primary text-sm font-semibold"
                    : "text-sm font-semibold text-neutral-800"
                }
              >
                Style
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    className={`rounded-lg px-2 py-2 text-xs ${
                      style === s
                        ? showDesignerTheme
                          ? "bg-[#1b2030] text-white"
                          : "bg-neutral-900 text-white"
                        : showDesignerTheme
                          ? "bg-[#151820] text-neutral-200"
                          : "bg-neutral-100 text-neutral-900"
                    }`}
                    onClick={() => setStyle(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-800"
                  }
                >
                  Budget
                </div>
                <div className="flex gap-2">
                  {(["$", "$$", "$$$"] as const).map((b) => (
                    <button
                      key={b}
                      className={`rounded-lg px-3 py-1 text-sm ${
                        budget === b
                          ? showDesignerTheme
                            ? "bg-[#1b2030] text-white"
                            : "bg-neutral-900 text-white"
                          : showDesignerTheme
                            ? "bg-[#151820] text-neutral-200"
                            : "bg-neutral-100 text-neutral-900"
                      }`}
                      onClick={() => setBudget(b)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className={
                  showDesignerTheme
                    ? "mt-4 w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white"
                    : "mt-4 w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
                }
                onClick={() => {
                  void runAiLayout();
                }}
              >
                Design My Room
              </button>

              <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
                    }
                    disabled={!canEdit}
                    onClick={() => addItem("coffee-scandi-01", [0, 0, 0])}
                  >
                    + Coffee Table
                  </button>

                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
                    }
                    disabled={!canEdit}
                    onClick={() => addItem("rug-scandi-01", [0, 0, 0])}
                  >
                    + Rug
                  </button>

                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
                    }
                    disabled={!canEdit}
                    onClick={() => addItem("chair-scandi-01", [0.8, 0, -0.6])}
                  >
                    + Chair
                  </button>

                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
                    }
                    disabled={!canEdit}
                    onClick={() => addItem("lamp-scandi-01", [1.2, 0, 1.2], 0)}
                  >
                    + Lamp
                  </button>
              </div>

              {isDesigner && (
                <div className="mt-3 flex gap-2">
                  <button
                    className={`text-xs px-3 py-2 rounded-lg ${
                      showGrid 
                        ? showDesignerTheme 
                          ? "bg-[#1b2030] text-white" 
                          : "bg-neutral-900 text-white"
                        : showDesignerTheme
                          ? "bg-[#151820] text-neutral-200"
                          : "bg-neutral-100"
                    }`}
                    onClick={() => setShowGrid((v) => !v)}
                  >
                    Grid
                  </button>
                  <button
                    className={`text-xs px-3 py-2 rounded-lg ${
                      snapEnabled 
                        ? showDesignerTheme 
                          ? "bg-[#1b2030] text-white" 
                          : "bg-neutral-900 text-white"
                        : showDesignerTheme
                          ? "bg-[#151820] text-neutral-200"
                          : "bg-neutral-100"
                    }`}
                    onClick={() => setSnapEnabled((v) => !v)}
                  >
                    Snap
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        </div>
      )}

      {isClientPreview && (
        <div className="absolute right-6 top-6 z-30 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white">
          Client-safe view - nothing editable
        </div>
      )}

      {isClientPreview && (
        <div className="absolute bottom-5 right-6 z-30 text-xs text-white/40">
          beta preview
        </div>
      )}


      {isEmpty && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow">
            <div className="text-xl font-semibold">Start your living room</div>
            <div className="mt-1 text-sm text-neutral-600">
              Choose a starter to instantly generate a usable layout.
            </div>

            <div className="mt-4 grid gap-2">
              <button
                className="rounded-xl bg-neutral-900 px-4 py-3 text-left text-sm text-white"
                onClick={() => {
                  void runAiLayout();
                }}
              >
                <div className="font-semibold">Start with a living room</div>
                <div className="text-xs text-white/80">
                  Sofa + rug + table + lighting
                </div>
              </button>

              <button
                className="rounded-xl border px-4 py-3 text-left text-sm"
                onClick={() => alert("Floor plan upload is beta (coming next).")}
              >
                <div className="font-semibold">Upload floor plan (beta)</div>
                <div className="text-xs text-neutral-500">
                  Generate a room from a plan
                </div>
              </button>

              <button
                className="rounded-xl border px-4 py-3 text-left text-sm"
                onClick={() => alert("Inspiration gallery coming next.")}
              >
                <div className="font-semibold">Browse inspiration</div>
                <div className="text-xs text-neutral-500">
                  Starter styles and templates
                </div>
              </button>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              Tip: You can change style and budget anytime.
            </div>
          </div>
        </div>
      )}

      {showUpgrade && !isClientPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
            <div className="text-lg font-semibold">Upgrade to Pro</div>
            <div className="mt-2 text-sm text-neutral-600">
              {upgradeReason === "export_images" &&
                "Export high-quality room images in multiple angles. Free tier is limited to designer-only features."}
              {upgradeReason === "export_pdf" &&
                "Generate professional single-page PDF boards for client presentations. Share your designs like a pro."}
              {upgradeReason === "designer" &&
                "Designer mode with advanced tools is available on the Pro plan."}
              {!upgradeReason &&
                "Unlock Pro features and tools to enhance your design workflow."}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {!session?.user && (
                <button
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white"
                  onClick={() => {
                    track("upgrade_prompt_clicked", { reason: upgradeReason || "unknown" });
                    signIn("google");
                  }}
                >
                  Sign in with Google
                </button>
              )}
              <button
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
                onClick={() => {
                  setShowUpgrade(false);
                  setUpgradeReason(null);
                }}
              >
                Close
              </button>
              <button
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={startingCheckout}
                onClick={() => {
                  console.log("See plans clicked");
                  setShowPlans(true);
                }}
              >
                See plans
              </button>
            </div>
          </div>
        </div>
      )}

      {guestPromptReason && !isClientPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
            <div className="text-lg font-semibold">Save and sync this design?</div>
            <div className="mt-2 text-sm text-neutral-600">
              We will save this design so it shows up on your account after login.
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
                onClick={() => {
                  const action = guestPromptActionRef.current;
                  guestPromptActionRef.current = null;
                  setGuestPromptReason(null);
                  action?.();
                }}
              >
                Not now
              </button>
              <button
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
                onClick={async () => {
                  setGuestPromptReason(null);
                  await claimGuestDesign();
                  signIn("google");
                }}
              >
                Save and continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlans && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowPlans(false)}
        >
          <div
            className="panel"
            style={{ width: 420, padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>Plans</div>
              <button onClick={() => setShowPlans(false)}>✕</button>
            </div>

            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
              <div style={{ marginBottom: 8 }}><b>Free</b> — design + save + share</div>
              <div style={{ marginBottom: 12 }}><b>Pro</b> — designer tools + exports + client workflow</div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                data-testid="checkout-monthly"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                onClick={() => {
                  setShowPlans(false);
                  void startCheckout("monthly");
                }}
              >
                Upgrade (Monthly)
              </button>

              <button
                data-testid="checkout-yearly"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                onClick={() => {
                  setShowPlans(false);
                  void startCheckout("yearly");
                }}
              >
                Upgrade (Yearly)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Notes Panel */}
      {showAINotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg dark:bg-[#1e2839]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">AI Design Notes</h2>
                {aiNotesData?.cached && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                    ✓ Instant (cached)
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowAINotes(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {aiNotesData && (
              <div className="space-y-4">
                {/* Summary */}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Summary</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    {aiNotesData.summary?.map((point: string, idx: number) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ul>
                </div>

                {/* Rationale */}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Rationale</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {aiNotesData.rationale}
                  </p>
                </div>

                {/* Suggestions */}
                {aiNotesData.suggestions && aiNotesData.suggestions.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Suggestions</h3>
                    <div className="mt-2 space-y-2">
                      {aiNotesData.suggestions.map((suggestion, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {suggestion.label}
                          </p>
                          {isPro(plan) ? (
                            <button
                              onClick={() => applySuggestion(suggestion.action)}
                              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                            >
                              Apply
                            </button>
                          ) : (
                            <button
                              disabled
                              className="rounded bg-gray-400 px-3 py-1 text-sm text-white"
                              title="Upgrade to pro to apply suggestions"
                            >
                              Pro Only
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isPro(plan) && (
                  <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Upgrade to Pro to apply AI suggestions to your design.
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowAINotes(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layer 3: Present Modal (visible in PRESENT mode) */}
      {editorMode === "present" && showPresentModal && !isClientPreview && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" 
          onClick={() => {
            setShowPresentModal(false);
            setEditorMode("design");
          }}
        >
          <div 
            className={
              showDesignerTheme
                ? "designer-panel w-full max-w-lg rounded-xl p-6 shadow-2xl"
                : "w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className={
                showDesignerTheme
                  ? "designer-text-primary text-xl font-bold"
                  : "text-xl font-bold"
              }>
                Present & Export
              </h2>
              <button
                onClick={() => {
                  setShowPresentModal(false);
                  setEditorMode("design");
                }}
                className={
                  showDesignerTheme
                    ? "designer-text-secondary text-2xl hover:text-white"
                    : "text-2xl text-gray-500 hover:text-gray-700"
                }
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Room Switcher Section */}
              {(() => {
                const rooms = getAllRoomNames(designSnapshot);
                if (rooms.length > 1) {
                  const currentRoomId = presentModeRoomId ?? designSnapshot.activeRoomId;
                  return (
                    <div>
                      <h3 className={
                        showDesignerTheme
                          ? "designer-text-primary mb-2 text-sm font-semibold"
                          : "mb-2 text-sm font-semibold text-gray-800"
                      }>
                        Room
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {rooms.map((room) => (
                          <button
                            key={room.id}
                            data-testid="room-select"
                            className={
                              room.id === currentRoomId
                                ? showDesignerTheme
                                  ? "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white"
                                  : "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200 hover:bg-[#1b2030]"
                                  : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                            }
                            onClick={() => {
                              setPresentModeRoomId(room.id);
                              // Switch the active room in the design snapshot
                              setDesignSnapshot(switchRoom(designSnapshot, room.id));
                            }}
                          >
                            {room.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Camera Views Section */}
              <div>
                <h3 className={
                  showDesignerTheme
                    ? "designer-text-primary mb-2 text-sm font-semibold"
                    : "mb-2 text-sm font-semibold text-gray-800"
                }>
                  Camera Views
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                    }
                    onClick={() => transitionToCameraView(getTopDownView(), 520)}
                  >
                    Top-down
                  </button>
                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                    }
                    onClick={() => transitionToCameraView(getEyeLevelView(), 500)}
                  >
                    Eye-level
                  </button>
                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                    }
                    onClick={() => transitionToCameraView(getFocusView(), 460)}
                  >
                    Focus
                  </button>
                </div>
              </div>

              {/* Lighting Section */}
              <div>
                <h3 className={
                  showDesignerTheme
                    ? "designer-text-primary mb-2 text-sm font-semibold"
                    : "mb-2 text-sm font-semibold text-gray-800"
                }>
                  Lighting
                </h3>
                <LightingPresetsUI 
                  current={lightingPreset} 
                  onChange={setLightingPreset}
                  theme={showDesignerTheme ? "designer" : "default"}
                />
              </div>

              {/* Client Handoff Section */}
              <div className="space-y-2 border-t pt-4">
                <h3 className={
                  showDesignerTheme
                    ? "designer-text-primary mb-2 text-sm font-semibold"
                    : "mb-2 text-sm font-semibold text-gray-800"
                }>
                  Client Handoff
                </h3>
                <button
                  data-testid="create-share"
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                      : "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  }
                  disabled={sharingDesign || !designId}
                  onClick={createShareLinkAndCopy}
                  title={!designId ? "Save your design first to create a share link" : ""}
                >
                  {sharingDesign ? "Creating link..." : shareToken ? "🔗 Copy Share Link" : "🔗 Create Share Link"}
                </button>
                {!designId && (
                  <div className={
                    showDesignerTheme
                      ? "text-xs text-neutral-400"
                      : "text-xs text-gray-500"
                  }>
                    💡 Save your design first to create a share link
                  </div>
                )}
                {shareToken && (
                  <a
                    href={`/share/${shareToken}/export`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      showDesignerTheme
                        ? "block w-full rounded-lg bg-[#1b2030] px-4 py-3 text-center text-sm font-medium text-white hover:bg-[#232938]"
                        : "block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
                    }
                  >
                    📦 View Export Pack
                  </a>
                )}
              </div>

              {/* Export Section */}
              <div className="space-y-2 border-t pt-4">
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                      : "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  }
                  disabled={isExporting || !sceneReady}
                  onClick={() => {
                    exportImages();
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  {isExporting ? "Exporting..." : "📸 Export Images"}
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                      : "w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                  }
                  disabled={isPdfExporting || !sceneReady}
                  onClick={() => {
                    exportPdf();
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  {isPdfExporting ? "Generating..." : "📄 Export PDF"}
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                      : "w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  }
                  disabled={aiNotesLoading || !items.length}
                  onClick={() => {
                    generateAINotes();
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  {aiNotesLoading ? "Generating..." : "✨ AI Notes"}
                </button>
              </div>

              {/* Exit Present Mode Button */}
              <div className="border-t pt-4">
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg border border-neutral-600 px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-[#151820]"
                      : "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  }
                  onClick={() => {
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  ← Back to Design Mode
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My Designs Modal */}
      {showMyDesigns && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" 
          onClick={() => setShowMyDesigns(false)}
        >
          <div 
            data-testid="load-designs-modal"
            className={
              showDesignerTheme
                ? "designer-panel w-full max-w-2xl max-h-[80vh] rounded-xl p-6 shadow-2xl overflow-y-auto"
                : "w-full max-w-2xl max-h-[80vh] rounded-xl bg-white p-6 shadow-2xl overflow-y-auto"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className={
                showDesignerTheme
                  ? "designer-text-primary text-xl font-bold"
                  : "text-xl font-bold"
              }>
                My Designs
              </h2>
              <button
                onClick={() => setShowMyDesigns(false)}
                className={
                  showDesignerTheme
                    ? "designer-text-secondary text-2xl hover:text-white"
                    : "text-2xl text-gray-500 hover:text-gray-700"
                }
              >
                ✕
              </button>
            </div>

            {loadingDesigns ? (
              <div className={
                showDesignerTheme
                  ? "text-center text-neutral-400"
                  : "text-center text-gray-500"
              }>
                Loading your designs...
              </div>
            ) : myDesigns.length === 0 ? (
              <div className={
                showDesignerTheme
                  ? "text-center text-neutral-400"
                  : "text-center text-gray-500"
              }>
                <p className="mb-2">No saved designs yet</p>
                <p className="text-sm">Click &quot;Save&quot; to save your current design</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myDesigns.map((design) => (
                  <button
                    key={design.id}
                    onClick={() => handleLoadDesign(design.id)}
                    className={
                      showDesignerTheme
                        ? "w-full rounded-lg border border-neutral-600 bg-[#151820] p-4 text-left hover:bg-[#1b2838] transition-colors"
                        : "w-full rounded-lg border border-gray-200 bg-gray-50 p-4 text-left hover:bg-gray-100 transition-colors"
                    }
                  >
                    <div className={
                      showDesignerTheme
                        ? "font-medium text-neutral-200"
                        : "font-medium text-gray-900"
                    }>
                      {design.title}
                    </div>
                    <div className={
                      showDesignerTheme
                        ? "text-xs text-neutral-500"
                        : "text-xs text-gray-500"
                    }>
                      {new Date(design.createdAt).toLocaleDateString()} {new Date(design.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Snap to Wall Toast */}
      {snapToast && (
        <div data-testid="snap-toast" className="fixed top-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            📍 Snapped to wall!
          </div>
        </div>
      )}

      {/* Collision/Rule Toast */}
      {ruleToast && (
        <div data-testid="collision-toast" className="fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ⚠️ {ruleToast}
          </div>
        </div>
      )}

      {/* Onboarding/Nudge Toast */}
      {nextBestActionNudge && (
        <div data-testid="sofa-nudge" className="fixed top-28 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            💡 {nextBestActionNudge}
          </div>
        </div>
      )}

      {/* Snap to Wall Toast */}
      {snapToast && (
        <div data-testid="snap-toast" className="fixed top-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            📍 Snapped to wall!
          </div>
        </div>
      )}

      {/* Collision/Rule Toast */}
      {ruleToast && (
        <div data-testid="collision-toast" className="fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ⚠️ {ruleToast}
          </div>
        </div>
      )}

      {/* Onboarding/Nudge Toast */}
      {nextBestActionNudge && (
        <div data-testid="sofa-nudge" className="fixed top-28 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            💡 {nextBestActionNudge}
          </div>
        </div>
      )}

      {/* Share Success Toast */}
      {shareSuccessToast && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ✅ Share link copied to clipboard!
          </div>
        </div>
      )}

      {/* Share Error Toast */}
      {shareErrorToast && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ❌ {shareErrorToast}
          </div>
        </div>
      )}

      {/* Share Link Fallback Modal */}
      {shareLinkFallback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div 
            data-testid="share-fallback-modal"
            className={
            showDesignerTheme
              ? "designer-panel w-full max-w-md rounded-xl p-6 shadow-2xl"
              : "w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
          }>
            <button
              onClick={() => setShareLinkFallback(null)}
              className={
                showDesignerTheme
                  ? "designer-text-secondary absolute right-4 top-4 text-2xl hover:text-white"
                  : "absolute right-4 top-4 text-2xl text-gray-500 hover:text-gray-700"
              }
            >
              ✕
            </button>

            <h2 className={
              showDesignerTheme
                ? "designer-text-primary mb-4 text-xl font-bold"
                : "mb-4 text-xl font-bold text-gray-900"
            }>
              Share Link
            </h2>

            <p className={
              showDesignerTheme
                ? "designer-text-secondary mb-4 text-sm"
                : "mb-4 text-sm text-gray-600"
            }>
              Copy this link to share your design:
            </p>

            <div className="mb-4 flex gap-2">
              <input
                type="text"
                readOnly
                data-testid="share-url-input"
                value={shareLinkFallback}
                className={
                  showDesignerTheme
                    ? "flex-1 rounded-lg border border-neutral-600 bg-[#1b2030] px-3 py-2 text-sm text-neutral-200 font-mono"
                    : "flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-700"
                }
              />
              <button
                data-testid="share-copy-button"
                onClick={() => {
                  navigator.clipboard.writeText(shareLinkFallback);
                  setShareSuccessToast(true);
                  setTimeout(() => setShareSuccessToast(false), 3000);
                }}
                className={
                  showDesignerTheme
                    ? "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                    : "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                }
              >
                Copy
              </button>
            </div>

            <div className="flex gap-2">
              <button
                data-testid="share-open-button"
                onClick={() => {
                  window.open(shareLinkFallback, "_blank");
                  setShareLinkFallback(null);
                }}
                className={
                  showDesignerTheme
                    ? "flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    : "flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                }
              >
                Open Link
              </button>
              <button
                data-testid="share-done-button"
                onClick={() => setShareLinkFallback(null)}
                className={
                  showDesignerTheme
                    ? "flex-1 rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-[#151820]"
                    : "flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                }
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Complete Message */}
      {onboardingState.step === "completed" && (
        <div data-testid="onboarding-complete" className="pointer-events-none fixed top-1/2 left-1/2 z-40 -translate-x-1/2 -translate-y-1/2 animate-fade-in">
          <div className="rounded-xl bg-green-600 px-8 py-6 text-center shadow-2xl">
            <div className="text-2xl font-bold text-white">✅ Setup Complete!</div>
            <div className="mt-2 text-sm text-green-100">Your room is ready to explore</div>
          </div>
        </div>
      )}

      {/* Constraint Feedback */}
      {!isClientPreview && visibleConstraints.length > 0 && (
        <div data-testid="constraint-feedback" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in">
          <div className="flex items-center gap-2">
            {visibleConstraints.map((item: ConstraintResult) => (
              <div
                key={item.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                  item.level === "ok"
                    ? "bg-green-600 text-white"
                    : item.level === "warn"
                    ? "bg-orange-500 text-white"
                    : "bg-red-600 text-white"
                }`}
              >
                {item.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layout Confidence Summary */}
      {layoutConfidence && !isClientPreview && (
        <div data-testid="layout-confidence" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in">
          <div className="rounded-full bg-neutral-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
            {layoutConfidence}
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <PageContent />
    </Suspense>
  );
}
