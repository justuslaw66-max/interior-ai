"use client";

import * as THREE from "three";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, MapControls, Edges, Environment, Html, Lightformer, Line, useCursor } from "@react-three/drei";
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
import QuickAddPanel from "@/components/QuickAddPanel";
import ItemCartDrawer from "@/components/ItemCartDrawer";
import { SnapGuides } from "@/components/SnapGuides";
import { Measurements } from "@/components/Measurements";
import { LightingPresetsUI } from "@/components/LightingPresetsUI";
import { LIGHTING_PRESETS, type LightingPreset } from "@/lib/lightingPresets";
import { CATALOG_ITEMS, CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { type CatalogItemSchema, type ProductCategory, type RoomTag } from "@/lib/catalog-schema";
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
import {
  getDefaultPreset,
  getPresetById,
} from "@/lib/materialPresets";
import {
  saveGuestDesign,
  loadGuestDesigns,
  markGuestDesignClaimed,
} from "@/lib/guestDesigns";
import { findSwapOptions } from "@/lib/swap";
import type { DesignSnapshot as MultiRoomSnapshot, DesignItem, ZoneMin } from "@/lib/room-types";
import { getActiveRoom, switchRoom, createRoom, addRoom, migrateToV3 } from "@/lib/room-types";
import { getAllRoomNames } from "@/lib/room-hooks";
import { RoomSwitcher } from "@/components/RoomSwitcher";
import CatalogPanel from "@/components/catalog/CatalogPanel";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import EditorCamera2D from "@/components/editor/camera/EditorCamera2D";
import RoomRenderer2D from "@/components/editor/renderers/RoomRenderer2D";
import ItemRenderer2D from "@/components/editor/renderers/ItemRenderer2D";
import { CanvasErrorBoundary } from "@/components/CanvasErrorBoundary";
import { metersToMm, mmToMeters, radiansToDeg, type EditorAnnotation2D, type EditorScene2D, type FixedElement2D, type RoomOpening2D } from "@/lib/editorScene";
import { legacyApiToSnapshot, snapshotToLegacyApi } from "@/lib/room-persistence";
import {
  buildImportedModelOptions,
  normalizeImportedFamilyName,
  shouldRefreshImportedCatalogItem,
  type ImportedModelDebugEntry,
  type ImportedModelOption,
  upsertImportedCatalogItem,
} from "@/lib/catalog/imported-model-assembly";
import {
  inferMaterialTypeFromText,
  sentenceCaseLabel,
  shouldShowCollectionGrouping,
} from "@/lib/catalog/variant-normalization";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import {
  clamp,
  formatMoney,
  formatTimeAgo,
  getDimensions,
  getItemPrice,
  getRotatedFootprint,
  normalizeRotationDegrees,
  parseVariantLabel,
  ROTATION_SNAP_STEP_DEGREES,
  ROTATION_SNAP_STEP_RADIANS,
  snapRotationRadians,
} from "@/lib/design-page-utils";
import {
  type GLBCalibration,
  GLB_CALIBRATION_BY_PRODUCT_ID,
  STANDARD_IMPORTED_CASTLERY_SOFA_CALIBRATION,
  getModelCalibration,
} from "@/lib/design-page-calibration";
import {
  MODEL_FAMILY_BY_PRODUCT_ID,
  MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID,
  MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID,
  ARM_STYLE_OPTIONS_BY_PRODUCT_ID,
  LENGTH_OPTIONS_BY_PRODUCT_ID,
  SHAPE_OPTIONS_BY_PRODUCT_ID,
  ORIENTATION_OPTIONS_BY_PRODUCT_ID,
} from "@/lib/design-page-model-maps";
import {
  type FabricDetailProfile,
  IMPORTED_VARIANT_BY_PRODUCT_ID,
  IMPORTED_VARIANTS_BY_PRODUCT_ID,
  IMPORTED_PRODUCT_CONFIG_BY_ID,
  SLOANE_TABLE_TO_BENCH_RECOMMENDATION,
  SLOANE_BENCH_PRODUCT_ID_BY_OPTION,
  SLOANE_TABLE_PRODUCT_IDS,
  SLOANE_BENCH_PRODUCT_IDS,
  getSloaneBenchOptionFromProductId,
  getSloaneBenchProductId,
  CASTLERY_DAWSON_SWATCH_IMAGE_BY_FINISH_CODE,
  CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY,
  resolveFabricDetailProfile,
  FULL_DIMENSIONS_BY_PRODUCT_ID,
} from "@/lib/design-page-product-data";
import {
  STYLES,
  type Style,
  type CameraView,
  type NamedCameraView,
  type LayoutPlan,
  type AINotesResponse,
  type SnapNeighbor,
  type PlanLayerPresetId,
  PLAN_LAYER_PRESETS,
  type PlanMeasurementUnit,
  type WallDescriptor,
  type ConfigurableNodeTransform,
  type ConfigurableBoundsCm,
  type RoomBounds,
} from "@/lib/design-page-types";
import {
  hashStringToVariant,
  normalizeExperimentSlot,
  normalizeUpgradeVariant,
  type FunnelEventName,
  type UpgradeCtaVariant,
  type PricingLayoutVariant,
  type PaywallExperimentSlot,
} from "@/lib/design-page-paywall";

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

const STORAGE_KEY = "interior-ai:v1:livingroom-design";

type SnapType = "none" | "wall-left" | "wall-right" | "wall-front" | "wall-back";

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
  const { camera, gl } = useThree();
  const floorTexture = useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ddd6c8";
    ctx.fillRect(0, 0, size, size);

    const rowHeight = 34;
    const gap = 2;
    const baseColor = [221, 214, 200];
    const noise = (seed: number) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    for (let y = 0, row = 0; y < size; y += rowHeight + gap, row += 1) {
      let plank = 0;
      let x = -Math.floor(noise(row + 0.17) * 120);
      while (x < size) {
        const plankWidth = 140 + Math.floor(noise(row * 97 + plank * 13 + 0.31) * 170);
        const grainShift = Math.floor(noise(row * 53 + plank * 19 + 0.73) * 14) - 7;
        const r = Math.max(170, Math.min(240, baseColor[0] + grainShift));
        const g = Math.max(150, Math.min(225, baseColor[1] + grainShift));
        const b = Math.max(125, Math.min(205, baseColor[2] + grainShift));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, plankWidth, rowHeight);

        ctx.globalAlpha = 0.08;
        ctx.fillStyle = grainShift > 0 ? "#ffffff" : "#8f7a5f";
        for (let i = 0; i < 4; i += 1) {
          const grainY = y + 3 + i * 7;
          ctx.fillRect(x + 3, grainY, plankWidth - 6, 1);
        }
        ctx.globalAlpha = 1;

        x += plankWidth + gap;
        plank += 1;
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1, width / 1.8), Math.max(1, depth / 1.8));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }, [depth, gl.capabilities, width]);

  const floorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#efe8dc",
        map: floorTexture ?? null,
        roughness: 0.78,
        metalness: 0,
        emissive: "#ffffff",
        emissiveIntensity: 0.02,
      }),
    [floorTexture]
  );
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f4f2",
        roughness: 0.92,
        metalness: 0,
        emissive: "#ffffff",
        emissiveIntensity: 0.015,
      }),
    []
  );
  const ceilingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f8f8f6",
        roughness: 0.93,
        metalness: 0,
        emissive: "#ffffff",
        emissiveIntensity: 0.01,
      }),
    []
  );

  useEffect(() => {
    return () => {
      floorTexture?.dispose();
      floorMat.dispose();
      wallMat.dispose();
      ceilingMat.dispose();
    };
  }, [ceilingMat, floorMat, floorTexture, wallMat]);

  const ceilingRef = useRef<THREE.Mesh>(null);
  const frontWallRef = useRef<THREE.Mesh>(null);
  const backWallRef = useRef<THREE.Mesh>(null);
  const leftWallRef = useRef<THREE.Mesh>(null);
  const rightWallRef = useRef<THREE.Mesh>(null);

  const halfW = width / 2;
  const halfD = depth / 2;
  const frontZ = -halfD + wallThickness / 2;
  const backZ = halfD - wallThickness / 2;
  const leftX = -halfW + wallThickness / 2;
  const rightX = halfW - wallThickness / 2;

  useFrame(() => {
    const outsideBuffer = 0.02;

    const wallCandidates: Array<{ key: "front" | "back" | "left" | "right"; distance: number }> = [];
    if (camera.position.z < frontZ - outsideBuffer) {
      wallCandidates.push({ key: "front", distance: Math.abs(camera.position.z - frontZ) });
    }
    if (camera.position.z > backZ + outsideBuffer) {
      wallCandidates.push({ key: "back", distance: Math.abs(camera.position.z - backZ) });
    }
    if (camera.position.x < leftX - outsideBuffer) {
      wallCandidates.push({ key: "left", distance: Math.abs(camera.position.x - leftX) });
    }
    if (camera.position.x > rightX + outsideBuffer) {
      wallCandidates.push({ key: "right", distance: Math.abs(camera.position.x - rightX) });
    }

    // At corner viewpoints, two walls can block interior visibility. Hide up to two closest.
    const hiddenWallSet = new Set<"front" | "back" | "left" | "right">();
    wallCandidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .forEach((entry) => hiddenWallSet.add(entry.key));

    if (frontWallRef.current) frontWallRef.current.visible = !hiddenWallSet.has("front");
    if (backWallRef.current) backWallRef.current.visible = !hiddenWallSet.has("back");
    if (leftWallRef.current) leftWallRef.current.visible = !hiddenWallSet.has("left");
    if (rightWallRef.current) rightWallRef.current.visible = !hiddenWallSet.has("right");
    if (ceilingRef.current) {
      ceilingRef.current.visible = camera.position.y <= height + wallThickness + outsideBuffer;
    }
  });

  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <primitive object={floorMat} attach="material" />
      </mesh>

      <mesh ref={ceilingRef} receiveShadow castShadow position={[0, height + wallThickness / 2, 0]}>
        <boxGeometry args={[width, wallThickness, depth]} />
        <primitive object={ceilingMat} attach="material" />
      </mesh>

      <mesh
        ref={frontWallRef}
        receiveShadow
        castShadow
        position={[0, height / 2, frontZ]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        ref={backWallRef}
        receiveShadow
        castShadow
        position={[0, height / 2, backZ]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        ref={leftWallRef}
        receiveShadow
        castShadow
        position={[leftX, height / 2, 0]}
      >
        <boxGeometry args={[wallThickness, height, depth]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        ref={rightWallRef}
        receiveShadow
        castShadow
        position={[rightX, height / 2, 0]}
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

function GLBScaledModel({
  url,
  width,
  height,
  depth,
  nodeTransforms,
  calibration,
  variantColorHex,
  variantName,
  variantRenderAssets,
  onLoadStateChange,
}: {
  url: string;
  width: number;
  height: number;
  depth: number;
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  calibration?: GLBCalibration;
  variantColorHex?: string;
  variantName?: string;
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
}) {
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null);
  const [upholsteryTextures, setUpholsteryTextures] = useState<{
    baseColorMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
  }>({});

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const tileX = variantRenderAssets?.tileScale?.x ?? 1;
    const tileY = variantRenderAssets?.tileScale?.y ?? 1;

    const loadTexture = (url: string | undefined, colorSpace?: THREE.ColorSpace) =>
      new Promise<THREE.Texture | undefined>((resolve) => {
        if (!url) {
          resolve(undefined);
          return;
        }
        loader.load(
          url,
          (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(tileX, tileY);
            if (colorSpace) {
              texture.colorSpace = colorSpace;
            }
            texture.needsUpdate = true;
            resolve(texture);
          },
          undefined,
          () => {
            resolve(undefined);
          }
        );
      });

    Promise.all([
      loadTexture(variantRenderAssets?.baseColorMap, THREE.SRGBColorSpace),
      loadTexture(variantRenderAssets?.normalMap),
      loadTexture(variantRenderAssets?.roughnessMap),
    ]).then(([baseColorMap, normalMap, roughnessMap]) => {
      if (cancelled) return;
      setUpholsteryTextures({ baseColorMap, normalMap, roughnessMap });
    });

    return () => {
      cancelled = true;
    };
  }, [
    variantRenderAssets?.baseColorMap,
    variantRenderAssets?.normalMap,
    variantRenderAssets?.roughnessMap,
    variantRenderAssets?.tileScale?.x,
    variantRenderAssets?.tileScale?.y,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoadedScene(null);
    onLoadStateChange?.("loading");

    (async () => {
      try {
        const { GLTFLoader } = await import("three-stdlib");
        if (cancelled) return;

        const loader = new GLTFLoader();
        try {
          const meshoptModule = (await import("meshoptimizer")) as {
            MeshoptDecoder?: { ready?: Promise<unknown> };
          };
          const MeshoptDecoder = meshoptModule.MeshoptDecoder;
          if (MeshoptDecoder?.ready) {
            await MeshoptDecoder.ready;
          }
          const loaderWithMeshopt = loader as typeof loader & {
            setMeshoptDecoder?: (decoder: unknown) => void;
          };
          if (typeof loaderWithMeshopt.setMeshoptDecoder === "function" && MeshoptDecoder) {
            loaderWithMeshopt.setMeshoptDecoder(MeshoptDecoder);
          }
        } catch (decoderError) {
          // Keep fallback box visible if decoder setup fails.
          console.warn("[GLBScaledModel] Meshopt decoder unavailable", { decoderError });
        }
        loader.load(
          url,
          (gltf) => {
            if (cancelled) return;
            setLoadedScene(gltf.scene.clone(true));
            onLoadStateChange?.("ready");
          },
          undefined,
          (error) => {
            if (cancelled) return;
            console.warn("[GLBScaledModel] Failed to load", { url, error });
            setLoadedScene(null);
            onLoadStateChange?.("error");
          }
        );
      } catch (error) {
        if (cancelled) return;
        console.warn("[GLBScaledModel] Failed to import GLTFLoader", { error });
        setLoadedScene(null);
        onLoadStateChange?.("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const normalizedModel = useMemo(() => {
    if (!loadedScene) return null;

    const scene = loadedScene.clone(true);
    const bbox = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);

    const targetWidth = calibration?.swapWidthDepthAxes ? depth : width;
    const targetDepth = calibration?.swapWidthDepthAxes ? width : depth;

    let sx = size.x > 0 ? targetWidth / size.x : 1;
    let sy = size.y > 0 ? height / size.y : 1;
    let sz = size.z > 0 ? targetDepth / size.z : 1;

    if (calibration?.uniformScale) {
      const uniform = Math.min(sx, sy, sz);
      sx = uniform;
      sy = uniform;
      sz = uniform;
    }

    scene.scale.set(sx, sy, sz);

    const minYScaled = bbox.min.y * sy;
    scene.position.set(-center.x * sx, -height / 2 - minYScaled, -center.z * sz);
    if (calibration?.swapWidthDepthAxes) {
      scene.rotation.y = Math.PI / 2;
    }

    if (nodeTransforms) {
      Object.entries(nodeTransforms).forEach(([nodeName, transform]) => {
        const node = scene.getObjectByName(nodeName);
        if (!node) return;
        if (transform.position) {
          const [x, y, z] = transform.position;
          node.position.set(
            sx !== 0 ? x / sx : x,
            sy !== 0 ? y / sy : y,
            sz !== 0 ? z / sz : z
          );
        }
        if (transform.rotation) {
          node.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
        }
        if (transform.scale) {
          node.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
        }
        if (typeof transform.visible === "boolean") {
          node.visible = transform.visible;
        }
      });
    }

    const applyPhysicalMaterialClamps = (material: THREE.MeshStandardMaterial) => {
      material.roughness = Math.max(0, Math.min(1, material.roughness));
      material.metalness = Math.max(0, Math.min(1, material.metalness));
      material.emissiveIntensity = Math.max(0, Math.min(1, material.emissiveIntensity));

      const physicalMat = material as THREE.MeshPhysicalMaterial;
      if (physicalMat.specularIntensity !== undefined) {
        physicalMat.specularIntensity = Math.max(0, Math.min(1, physicalMat.specularIntensity));
      }
      if (physicalMat.clearcoat !== undefined) {
        physicalMat.clearcoat = Math.max(0, Math.min(1, physicalMat.clearcoat));
      }
      if (physicalMat.clearcoatRoughness !== undefined) {
        physicalMat.clearcoatRoughness = Math.max(0, Math.min(1, physicalMat.clearcoatRoughness));
      }
      if (physicalMat.specularColor?.isColor) {
        physicalMat.specularColor.r = Math.max(0, Math.min(1, physicalMat.specularColor.r));
        physicalMat.specularColor.g = Math.max(0, Math.min(1, physicalMat.specularColor.g));
        physicalMat.specularColor.b = Math.max(0, Math.min(1, physicalMat.specularColor.b));
      }
    };

    const applyLowerAssemblyTint = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial
    ) => {
      if (!calibration?.lowerAssemblyTintHex) return;
      mesh.updateWorldMatrix(true, false);
      const bbox = new THREE.Box3().setFromObject(mesh);
      if (!bbox) return;

      const minY = bbox.min.y;
      const maxY = bbox.max.y;
      const heightRange = Math.max(maxY - minY, 0.0001);
      // GLBScaledModel is rendered inside Furniture group at y = height / 2.
      // Shader uses final world-space y, so include this offset in mask thresholds.
      const furnitureGroupYOffset = height * 0.5;
      const fadeStart =
        minY + heightRange * (calibration.lowerAssemblyFadeStart ?? 0.44) + furnitureGroupYOffset;
      const fadeEnd =
        minY + heightRange * (calibration.lowerAssemblyFadeEnd ?? 0.68) + furnitureGroupYOffset;
      const tintStrength = calibration.lowerAssemblyTintStrength ?? 0.82;
      const tintColor = new THREE.Color(calibration.lowerAssemblyTintHex);

      material.customProgramCacheKey = () =>
        [
          "kelsey-lower-assembly-tint",
          calibration.lowerAssemblyTintHex,
          tintStrength,
          fadeStart,
          fadeEnd,
        ].join(":");

      material.onBeforeCompile = (shader) => {
        shader.uniforms.kelseyLowerTintColor = { value: tintColor };
        shader.uniforms.kelseyLowerTintStrength = { value: tintStrength };
        shader.uniforms.kelseyLowerTintStart = { value: fadeStart };
        shader.uniforms.kelseyLowerTintEnd = { value: fadeEnd };

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying float vKelseyWorldY;`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>\nvKelseyWorldY = (modelMatrix * vec4(position, 1.0)).y;`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying float vKelseyWorldY;\nuniform vec3 kelseyLowerTintColor;\nuniform float kelseyLowerTintStrength;\nuniform float kelseyLowerTintStart;\nuniform float kelseyLowerTintEnd;`
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>\nfloat kelseyLowerMask = 1.0 - smoothstep(kelseyLowerTintStart, kelseyLowerTintEnd, vKelseyWorldY);\nvec3 kelseyLowerTinted = diffuseColor.rgb * mix(vec3(1.0), kelseyLowerTintColor * 1.18, kelseyLowerTintStrength);\ndiffuseColor.rgb = mix(diffuseColor.rgb, kelseyLowerTinted, clamp(kelseyLowerMask, 0.0, 1.0));`
          );
      };
    };

    const applyHuggTopTint = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial,
      tintHex: string
    ) => {
      if (!isHuggModel || !tintHex) return;
      mesh.updateWorldMatrix(true, false);
      const bbox = new THREE.Box3().setFromObject(mesh);
      const minY = bbox.min.y;
      const maxY = bbox.max.y;
      const heightRange = Math.max(maxY - minY, 0.0001);
      const centerX = (bbox.min.x + bbox.max.x) * 0.5;
      const centerZ = (bbox.min.z + bbox.max.z) * 0.5;
      // Keep tint tightly on tabletop cap to avoid bleed onto ottomans/sides.
      const radiusX = Math.max(width * 0.16, (bbox.max.x - bbox.min.x) * 0.11);
      const radiusZ = Math.max(depth * 0.16, (bbox.max.z - bbox.min.z) * 0.11);
      const yStart = minY + heightRange * 0.8;
      const yEnd = minY + heightRange * 0.985;
      const tintStrength = 0.88;
      const tintColor = new THREE.Color(tintHex);

      material.customProgramCacheKey = () =>
        [
          "hugg-top-tint",
          tintHex,
          tintStrength,
          yStart,
          yEnd,
          radiusX,
          radiusZ,
          centerX,
          centerZ,
        ].join(":");

      material.onBeforeCompile = (shader) => {
        shader.uniforms.huggTintColor = { value: tintColor };
        shader.uniforms.huggTintStrength = { value: tintStrength };
        shader.uniforms.huggTintYStart = { value: yStart };
        shader.uniforms.huggTintYEnd = { value: yEnd };
        shader.uniforms.huggTintCenterX = { value: centerX };
        shader.uniforms.huggTintCenterZ = { value: centerZ };
        shader.uniforms.huggTintRadiusX = { value: radiusX };
        shader.uniforms.huggTintRadiusZ = { value: radiusZ };

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vHuggWorldPos;\nvarying vec3 vHuggWorldNormal;"
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvHuggWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvHuggWorldNormal = normalize(mat3(modelMatrix) * normal);"
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vHuggWorldPos;\nvarying vec3 vHuggWorldNormal;\nuniform vec3 huggTintColor;\nuniform float huggTintStrength;\nuniform float huggTintYStart;\nuniform float huggTintYEnd;\nuniform float huggTintCenterX;\nuniform float huggTintCenterZ;\nuniform float huggTintRadiusX;\nuniform float huggTintRadiusZ;"
          )
          .replace(
            "#include <map_fragment>",
            "#include <map_fragment>\nfloat huggYMask = smoothstep(huggTintYStart, huggTintYEnd, vHuggWorldPos.y);\nfloat huggXMask = 1.0 - smoothstep(huggTintRadiusX * 0.62, huggTintRadiusX * 0.92, abs(vHuggWorldPos.x - huggTintCenterX));\nfloat huggZMask = 1.0 - smoothstep(huggTintRadiusZ * 0.62, huggTintRadiusZ * 0.92, abs(vHuggWorldPos.z - huggTintCenterZ));\nfloat huggUpMask = smoothstep(0.58, 0.9, vHuggWorldNormal.y);\nfloat huggTopMask = clamp(pow(huggYMask, 1.7) * huggXMask * huggZMask * huggUpMask, 0.0, 1.0);\nvec3 huggTinted = diffuseColor.rgb * mix(vec3(1.0), huggTintColor * 1.08, huggTintStrength);\ndiffuseColor.rgb = mix(diffuseColor.rgb, huggTinted, huggTopMask);"
          );
      };
    };

    // Madison family keeps real wood leg materials; avoid upholstery overrides on those parts.
    const WOOD_LEG_PART_REGEX = /\b(leg|legs|foot|feet|wood|walnut|oak|beech|birch|rubberwood|timber)\b/i;
    const KELSEY_WOOD_BASE_PART_REGEX = /\b(leg|legs|base|support|stretcher|frame|foot|feet|wood|walnut|oak)\b/i;
    const HARPER_WOOD_BASE_PART_REGEX = /\b(base|pedestal|fluted|column|support|wood|oak|veneer)\b/i;
    const OTTOMAN_UPHOLSTERY_REGEX = /\b(ottoman|seat|stool|cushion|upholstery|fabric|arms?|back)\b/i;
    const HUGG_WOOD_PART_REGEX = /\b(table|top|base|frame|support|stretcher|leg|legs|foot|feet|wood|timber|veneer|oak|walnut)\b/i;
    const meshLegLikeCache = new Map<string, boolean>();
    const huggTableLikeCache = new Map<string, boolean>();
    const huggOttomanLikeCache = new Map<string, boolean>();
    const isHuggModel = /\bhugg\b/i.test(url);
    const huggVariantMarker = String(variantName ?? "").toLowerCase();
    const resolvedVariantColorHex = (() => {
      if (!isHuggModel) return variantColorHex;
      if (huggVariantMarker.includes("black")) return "#1f1f1f";
      if (huggVariantMarker.includes("chestnut")) return "#8B6F47";
      if (huggVariantMarker.includes("natural")) return "#a89070";
      return variantColorHex;
    })();

    const getMeshBounds = (mesh: THREE.Mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      return { size, center };
    };

    const isLikelyHuggTableMesh = (mesh: THREE.Mesh) => {
      if (!isHuggModel) return false;
      const cached = huggTableLikeCache.get(mesh.uuid);
      if (cached !== undefined) return cached;

      const { size, center } = getMeshBounds(mesh);
      const totalArea = Math.max(width * depth, 0.0001);
      const areaRatio = (size.x * size.z) / totalArea;
      const nearCenter = Math.abs(center.x) <= width * 0.2 && Math.abs(center.z) <= depth * 0.2;
      const likely = areaRatio >= 0.14 && nearCenter && size.y <= height * 0.8;

      huggTableLikeCache.set(mesh.uuid, likely);
      return likely;
    };

    const isLikelyHuggOttomanMesh = (mesh: THREE.Mesh) => {
      if (!isHuggModel) return false;
      const cached = huggOttomanLikeCache.get(mesh.uuid);
      if (cached !== undefined) return cached;

      const { size, center } = getMeshBounds(mesh);
      const compactFootprint = size.x <= width * 0.45 && size.z <= depth * 0.45;
      const offsetFromCenter = Math.abs(center.x) >= width * 0.08 || Math.abs(center.z) >= depth * 0.08;
      const likely = compactFootprint && offsetFromCenter && size.y <= height * 0.75;

      huggOttomanLikeCache.set(mesh.uuid, likely);
      return likely;
    };

    const isLikelyLegMesh = (mesh: THREE.Mesh) => {
      if (!calibration?.preserveWoodLegMaterials) return false;
      const cached = meshLegLikeCache.get(mesh.uuid);
      if (cached !== undefined) return cached;

      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);

      const touchesFloor = box.min.y <= -height / 2 + height * 0.08;
      const nearBottom = box.max.y <= -height / 2 + height * 0.4;
      const slenderX = size.x > 0 && size.x <= width * 0.2;
      const slenderZ = size.z > 0 && size.z <= depth * 0.2;
      const shortEnough = size.y > 0 && size.y <= height * 0.45;

      let likelyLeg = touchesFloor && nearBottom && slenderX && slenderZ && shortEnough;

      if (!likelyLeg && calibration?.woodLegDetectionMode === "kelsey") {
        const lowerAssembly =
          box.min.y <= -height / 2 + height * 0.14 &&
          box.max.y <= -height / 2 + height * 0.78;
        const supportLike =
          (size.y >= height * 0.12 && (size.x <= width * 0.34 || size.z <= depth * 0.34)) ||
          (size.y <= height * 0.2 && box.max.y <= -height / 2 + height * 0.58);
        likelyLeg = lowerAssembly && supportLike;
      }

      if (!likelyLeg && calibration?.woodLegDetectionMode === "harper") {
        const lowerAssembly =
          box.min.y <= -height / 2 + height * 0.12 &&
          box.max.y <= -height / 2 + height * 0.86;
        const pedestalLike =
          size.y >= height * 0.22 &&
          size.y <= height * 0.9 &&
          ((size.x <= width * 0.72 && size.z <= depth * 0.72) ||
            (size.x <= width * 0.5 || size.z <= depth * 0.5));
        likelyLeg = lowerAssembly && pedestalLike;
      }

      meshLegLikeCache.set(mesh.uuid, likelyLeg);
      return likelyLeg;
    };

    const shouldPreserveWoodLegMaterial = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial
    ) => {
      if (!calibration?.preserveWoodLegMaterials) return false;
      const parentName = mesh.parent?.name ?? "";
      const partNames = `${mesh.name} ${parentName} ${material.name}`;
      if (isHuggModel) {
        if (isOttomanUpholsteryMesh(mesh)) return false;
        return isHuggWoodMesh(mesh, material);
      }
      if (calibration?.woodLegDetectionMode === "kelsey" && KELSEY_WOOD_BASE_PART_REGEX.test(partNames)) {
        return true;
      }
      if (calibration?.woodLegDetectionMode === "harper" && HARPER_WOOD_BASE_PART_REGEX.test(partNames)) {
        return true;
      }
      if (WOOD_LEG_PART_REGEX.test(partNames)) return true;
      return isLikelyLegMesh(mesh);
    };
    const isOttomanUpholsteryMesh = (mesh: THREE.Mesh) => {
      const parentName = mesh.parent?.name ?? "";
      const partNames = `${mesh.name} ${parentName}`;
      return OTTOMAN_UPHOLSTERY_REGEX.test(partNames) || isLikelyHuggOttomanMesh(mesh);
    };

    const isHuggWoodMesh = (mesh: THREE.Mesh, material: THREE.MeshStandardMaterial) => {
      const parentName = mesh.parent?.name ?? "";
      const partNames = `${mesh.name} ${parentName} ${material.name}`;
      return HUGG_WOOD_PART_REGEX.test(partNames) || isLikelyHuggTableMesh(mesh);
    };

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      // Madison GLBs can reuse one material across body + legs.
      // Clone per mesh so upholstery overrides do not bleed into leg parts.
      if (calibration?.preserveWoodLegMaterials) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }

      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          if (!m) return;
          const hasUpholsteryShadingMaps = Boolean(
            upholsteryTextures.normalMap || upholsteryTextures.roughnessMap
          );
          applyPhysicalMaterialClamps(m);
          if (shouldPreserveWoodLegMaterial(mesh, m)) {
            const woodColorHex = calibration?.preserveWoodLegColorHex ?? resolvedVariantColorHex;
            if (woodColorHex) {
              m.color = new THREE.Color(woodColorHex);
            }
            if (calibration?.preserveWoodLegDisableBaseColorMap) {
              m.map = null;
            }
            m.emissive = new THREE.Color(0x000000);
            m.emissiveIntensity = 0;
            m.metalness = Math.min(m.metalness, 0.1);
            m.roughness = Math.max(m.roughness, 0.65);
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            applyLowerAssemblyTint(mesh, m);
            m.needsUpdate = true;
            return;
          }
          // Hugg: only allow wood/table parts to receive finish color tint.
          const isHuggOttoman = isHuggModel && isOttomanUpholsteryMesh(mesh);
          const allowVariantColor = calibration?.useVariantColor ?? true;
          const huggFinishColorHex = isHuggModel ? resolvedVariantColorHex : undefined;
          const colorHex =
            calibration?.forceBaseColorHex ??
              (allowVariantColor && (!isHuggModel && !isHuggOttoman)
                ? resolvedVariantColorHex
                : undefined);
          const shouldUseImportedUpholsteryOverride = Boolean(variantRenderAssets);
          if (shouldUseImportedUpholsteryOverride) {
            // Imported upholstery variants should not inherit baked GLB maps.
            m.map = null;
            m.normalMap = null;
            m.roughnessMap = null;
            m.metalnessMap = null;
            m.aoMap = null;
            m.aoMapIntensity = 0;
            m.lightMap = null;
            m.emissiveMap = null;
            m.bumpMap = null;
            m.alphaMap = null;
            m.displacementMap = null;
            m.emissive = new THREE.Color(0x000000);
            m.emissiveIntensity = 0;
            // Vertex colors baked into the GLB create organic-pattern artifacts.
            m.vertexColors = false;
          }
          const shouldClearInheritedBaseMap = Boolean(
            variantRenderAssets && !upholsteryTextures.baseColorMap
          );
          if (shouldClearInheritedBaseMap) {
            m.map = null;
          }
          if (upholsteryTextures.baseColorMap) {
            m.map = upholsteryTextures.baseColorMap;
            if (colorHex) {
              m.color = new THREE.Color("#ffffff").lerp(
                new THREE.Color(colorHex),
                Math.max(0, Math.min(1, calibration?.variantMapTintStrength ?? 0.85))
              );
            } else {
              m.color = new THREE.Color("#ffffff");
            }
          } else if (colorHex) {
            m.color = new THREE.Color(colorHex);
          }
          if (upholsteryTextures.normalMap) {
            m.normalMap = upholsteryTextures.normalMap;
            // Very low scale — just enough micro-texture to read as fabric, not leather.
            const importedNormalScale = shouldUseImportedUpholsteryOverride
              ? (calibration?.importedNormalScale ?? 0.06)
              : (calibration?.normalScale ?? 0.06);
            m.normalScale = new THREE.Vector2(importedNormalScale, importedNormalScale);
          }
          if (upholsteryTextures.roughnessMap) {
            m.roughnessMap = upholsteryTextures.roughnessMap;
          }
          if (calibration?.disableVertexColors) {
            m.vertexColors = false;
          }
          if (calibration?.disableBaseColorMap) {
            m.map = null;
          }
          if (calibration?.disableShadingMaps && !upholsteryTextures.normalMap && !upholsteryTextures.roughnessMap) {
            m.normalMap = null;
            m.roughnessMap = null;
            m.metalnessMap = null;
            m.aoMap = null;
            m.aoMapIntensity = 0;
            m.lightMap = null;
          }
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          if (calibration?.brightness !== undefined) {
            m.color.multiplyScalar(calibration.brightness);
          }
          if (calibration?.saturation !== undefined) {
            const hsl = { h: 0, s: 0, l: 0 };
            m.color.getHSL(hsl);
            m.color.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s * calibration.saturation)), hsl.l);
          }
          if (calibration?.roughnessScale !== undefined) {
            m.roughness = Math.max(0, Math.min(1, m.roughness * calibration.roughnessScale));
          }
          if (calibration?.roughnessOverride !== undefined) {
            m.roughness = Math.max(0, Math.min(1, calibration.roughnessOverride));
          }
          if (calibration?.metalnessOverride !== undefined) {
            m.metalness = Math.max(0, Math.min(1, calibration.metalnessOverride));
          }
          // For imported upholstery: force fabric-like roughness/metalness after all overrides,
          // so calibration or residual GLB values cannot make it appear leather-like.
          if (shouldUseImportedUpholsteryOverride) {
            m.roughness = 0.92;
            m.metalness = 0.0;
          }
          if (calibration?.disableAoMap) {
            m.aoMap = null;
            m.aoMapIntensity = 0;
          }
          if (m.aoMap && calibration?.aoMapIntensity !== undefined) {
            m.aoMapIntensity = calibration.aoMapIntensity;
          }
          // Upgrade MeshStandardMaterial → MeshPhysicalMaterial when clearcoat or
          // specularIntensity overrides are requested so those properties actually exist.
          let physicalMat: THREE.MeshPhysicalMaterial;
          if (
            (calibration?.clearcoatOverride !== undefined || calibration?.specularIntensityOverride !== undefined) &&
            !(m instanceof THREE.MeshPhysicalMaterial)
          ) {
            physicalMat = new THREE.MeshPhysicalMaterial();
            physicalMat.copy(m);
            const matArr = mesh.material as THREE.MeshStandardMaterial[];
            const idx = matArr.indexOf(m);
            if (idx >= 0) matArr[idx] = physicalMat;
          } else {
            physicalMat = m as THREE.MeshPhysicalMaterial;
          }
          if (calibration?.specularIntensityOverride !== undefined) {
            physicalMat.specularIntensity = Math.max(0, calibration.specularIntensityOverride);
          }
          if (calibration?.clearcoatOverride !== undefined) {
            physicalMat.clearcoat = Math.max(0, Math.min(1, calibration.clearcoatOverride));
          }
          if (calibration?.clearcoatRoughnessOverride !== undefined) {
            physicalMat.clearcoatRoughness = Math.max(
              0,
              Math.min(1, calibration.clearcoatRoughnessOverride)
            );
          }
          if (calibration?.emissiveBoost !== undefined) {
            physicalMat.emissive = physicalMat.color.clone();
            physicalMat.emissiveIntensity = calibration.emissiveBoost;
          }
          if (huggFinishColorHex) {
            applyHuggTopTint(mesh, physicalMat, huggFinishColorHex);
          }
          applyLowerAssemblyTint(mesh, physicalMat);
          physicalMat.needsUpdate = true;
        });
      } else if (mat) {
        const hasUpholsteryShadingMaps = Boolean(
          upholsteryTextures.normalMap || upholsteryTextures.roughnessMap
        );
        applyPhysicalMaterialClamps(mat);
        if (shouldPreserveWoodLegMaterial(mesh, mat)) {
          const woodColorHex = calibration?.preserveWoodLegColorHex ?? resolvedVariantColorHex;
          if (woodColorHex) {
            mat.color = new THREE.Color(woodColorHex);
          }
          if (calibration?.preserveWoodLegDisableBaseColorMap) {
            mat.map = null;
          }
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
          mat.metalness = Math.min(mat.metalness, 0.1);
          mat.roughness = Math.max(mat.roughness, 0.65);
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          applyLowerAssemblyTint(mesh, mat);
          mat.needsUpdate = true;
          return;
        }
        const isHuggOttoman = isHuggModel && isOttomanUpholsteryMesh(mesh);
        const allowVariantColor = calibration?.useVariantColor ?? true;
        const huggFinishColorHex = isHuggModel ? resolvedVariantColorHex : undefined;
        const colorHex =
          calibration?.forceBaseColorHex ??
          (allowVariantColor && (!isHuggModel && !isHuggOttoman)
            ? resolvedVariantColorHex
            : undefined);
        const shouldUseImportedUpholsteryOverride = Boolean(variantRenderAssets);
        if (shouldUseImportedUpholsteryOverride) {
          // Imported upholstery variants should not inherit baked GLB maps.
          mat.map = null;
          mat.normalMap = null;
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.aoMap = null;
          mat.aoMapIntensity = 0;
          mat.lightMap = null;
          mat.emissiveMap = null;
          mat.bumpMap = null;
          mat.alphaMap = null;
          mat.displacementMap = null;
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
          // Vertex colors baked into the GLB create organic-pattern artifacts.
          mat.vertexColors = false;
        }
        const shouldClearInheritedBaseMap = Boolean(
          variantRenderAssets && !upholsteryTextures.baseColorMap
        );
        if (shouldClearInheritedBaseMap) {
          mat.map = null;
        }
        if (upholsteryTextures.baseColorMap) {
          mat.map = upholsteryTextures.baseColorMap;
          if (colorHex) {
            mat.color = new THREE.Color("#ffffff").lerp(
              new THREE.Color(colorHex),
              Math.max(0, Math.min(1, calibration?.variantMapTintStrength ?? 0.85))
            );
          } else {
            mat.color = new THREE.Color("#ffffff");
          }
        } else if (colorHex) {
          mat.color = new THREE.Color(colorHex);
        }
        if (upholsteryTextures.normalMap) {
          mat.normalMap = upholsteryTextures.normalMap;
          // Very low scale — just enough micro-texture to read as fabric, not leather.
          const importedNormalScale = shouldUseImportedUpholsteryOverride
            ? (calibration?.importedNormalScale ?? 0.06)
            : (calibration?.normalScale ?? 0.06);
          mat.normalScale = new THREE.Vector2(importedNormalScale, importedNormalScale);
        }
        if (upholsteryTextures.roughnessMap) {
          mat.roughnessMap = upholsteryTextures.roughnessMap;
        }
        if (calibration?.disableVertexColors) {
          mat.vertexColors = false;
        }
        if (calibration?.disableBaseColorMap) {
          mat.map = null;
        }
        if (calibration?.disableShadingMaps && !upholsteryTextures.normalMap && !upholsteryTextures.roughnessMap) {
          mat.normalMap = null;
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.aoMap = null;
          mat.aoMapIntensity = 0;
          mat.lightMap = null;
        }
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        if (calibration?.brightness !== undefined) {
          mat.color.multiplyScalar(calibration.brightness);
        }
        if (calibration?.saturation !== undefined) {
          const hsl = { h: 0, s: 0, l: 0 };
          mat.color.getHSL(hsl);
          mat.color.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s * calibration.saturation)), hsl.l);
        }
        if (calibration?.roughnessScale !== undefined) {
          mat.roughness = Math.max(0, Math.min(1, mat.roughness * calibration.roughnessScale));
        }
        if (calibration?.roughnessOverride !== undefined) {
          mat.roughness = Math.max(0, Math.min(1, calibration.roughnessOverride));
        }
        if (calibration?.metalnessOverride !== undefined) {
          mat.metalness = Math.max(0, Math.min(1, calibration.metalnessOverride));
        }
        // For imported upholstery: force fabric-like roughness/metalness after all overrides.
        if (shouldUseImportedUpholsteryOverride) {
          mat.roughness = 0.92;
          mat.metalness = 0.0;
        }
        if (calibration?.disableAoMap) {
          mat.aoMap = null;
          mat.aoMapIntensity = 0;
        }
        if (mat.aoMap && calibration?.aoMapIntensity !== undefined) {
          mat.aoMapIntensity = calibration.aoMapIntensity;
        }
        // Upgrade MeshStandardMaterial → MeshPhysicalMaterial when clearcoat or
        // specularIntensity overrides are requested so those properties actually exist.
        let physicalMat: THREE.MeshPhysicalMaterial;
        if (
          (calibration?.clearcoatOverride !== undefined || calibration?.specularIntensityOverride !== undefined) &&
          !(mat instanceof THREE.MeshPhysicalMaterial)
        ) {
          physicalMat = new THREE.MeshPhysicalMaterial();
          physicalMat.copy(mat);
          mesh.material = physicalMat;
        } else {
          physicalMat = mat as THREE.MeshPhysicalMaterial;
        }
        if (calibration?.specularIntensityOverride !== undefined) {
          physicalMat.specularIntensity = Math.max(0, calibration.specularIntensityOverride);
        }
        if (calibration?.clearcoatOverride !== undefined) {
          physicalMat.clearcoat = Math.max(0, Math.min(1, calibration.clearcoatOverride));
        }
        if (calibration?.clearcoatRoughnessOverride !== undefined) {
          physicalMat.clearcoatRoughness = Math.max(
            0,
            Math.min(1, calibration.clearcoatRoughnessOverride)
          );
        }
        if (calibration?.emissiveBoost !== undefined) {
          physicalMat.emissive = physicalMat.color.clone();
          physicalMat.emissiveIntensity = calibration.emissiveBoost;
        }
        if (huggFinishColorHex) {
          applyHuggTopTint(mesh, physicalMat, huggFinishColorHex);
        }
        applyLowerAssemblyTint(mesh, physicalMat);
        physicalMat.needsUpdate = true;
      }
    });

    return scene;
  }, [loadedScene, width, height, depth, nodeTransforms, calibration, variantColorHex, upholsteryTextures, variantRenderAssets]);

  if (!normalizedModel) return null;

  return <primitive object={normalizedModel} />;
}

function Furniture({
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

    // Apply overrides if provided.
    // Priority: explicit override > selected variant color > preset fallback.
    const color = materialOverrides?.colorHex || variantColor || preset.color;
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

function CameraCapture({
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

function PageContent() {
  const TDZ_TRACE = true;

  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const stripeSessionId = searchParams.get("session_id");
  const paywallVariantOverride = searchParams.get("paywall_variant");
  const paywallOpenParam = searchParams.get("paywall_open");
  const plansOpenParam = searchParams.get("plans_open");
  const [sofaDragging, setSofaDragging] = useState(false);
  const [designId, setDesignId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [, setShareOrigin] = useState("");
  const [style, setStyle] = useState<Style>("Modern");
  const [budget, setBudget] = useState<"$" | "$$" | "$$$">("$$");
  const [mode, setMode] = useState<"homeowner" | "designer">(
    urlMode === "designer" ? "designer" : "homeowner"
  );
  const [notes, setNotes] = useState("");
  const [aiSeed, setAiSeed] = useState<number>(Date.now());
  const [plan, setPlan] = useState<Plan>("free");
  const [, setRefreshingPlan] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"designer" | "export_images" | "export_pdf" | null>(null);
  const [upgradeCtaVariant, setUpgradeCtaVariant] = useState<UpgradeCtaVariant>("unlock_pro_exports");
  const [pricingLayoutVariant, setPricingLayoutVariant] = useState<PricingLayoutVariant>("default");
  const [showAINotes, setShowAINotes] = useState(false);
  const [aiNotesLoading, setAiNotesLoading] = useState(false);
  const [aiNotesData, setAiNotesData] = useState<AINotesResponse | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridPulse, setGridPulse] = useState(false);
  const [clientPreview, setClientPreview] = useState(false);
  const [itemCartOpen, setItemCartOpen] = useState(false);
  const [itemCart, setItemCart] = useState<Array<{ id: string; productId: string; title: string; qty: number; thumbUrl?: string }>>([]);
  const [selectedImportedFamilyKey, setSelectedImportedFamilyKey] = useState<string>("");
  const [selectedImportedProductId, setSelectedImportedProductId] = useState<string>("");
  const [importedModelOptions, setImportedModelOptions] = useState<ImportedModelOption[]>([]);
  const [importedModelUrlByAssetId, setImportedModelUrlByAssetId] = useState<Record<string, string>>({});
  
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
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>("studio");
  const [viewMode, setViewMode] = useState<EditorViewMode>("3d");
  const [planTheme, setPlanTheme] = useState<"consumer" | "pro">("consumer");
  const [planLayers, setPlanLayers] = useState({
    grid: true,
    dimensions: true,
    labels: true,
    openings: true,
    builtIns: true,
    zones: true,
    annotations: true,
  });
  const [planAnnotations, setPlanAnnotations] = useState<EditorAnnotation2D[]>([]);
  const [planOpenings, setPlanOpenings] = useState<RoomOpening2D[]>([]);
  const [planFixedElements, setPlanFixedElements] = useState<FixedElement2D[]>([]);
  const [selectedPlanOverlayId, setSelectedPlanOverlayId] = useState<string | null>(null);
  const [annotationToolKind, setAnnotationToolKind] = useState<"note" | "callout" | "room_tag">("note");
  const [simplePlanControls, setSimplePlanControls] = useState(true);
  const [planLayerPreset, setPlanLayerPreset] = useState<PlanLayerPresetId>("technical");
  const [planMeasurementUnit, setPlanMeasurementUnit] = useState<PlanMeasurementUnit>("mm");
  const [exportStylePreset, setExportStylePreset] = useState<"consumer" | "pro">("consumer");
  const [planSettingsLoaded, setPlanSettingsLoaded] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView>({
    pos: [4.5, 3.2, 5.5],
    target: [0, 1.1, 0],
    fov: 45,
  });
  const [savedViews, setSavedViews] = useState<NamedCameraView[]>([]);
  const [hoveredCartInstanceId, setHoveredCartInstanceId] = useState<string | null>(null);
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
  const landingTrackedRef = useRef(false);
  const designStartedTrackedRef = useRef(false);
  const firstItemFunnelTrackedRef = useRef(false);
  const thirdItemTrackedRef = useRef(false);
  const guestPromptActionRef = useRef<null | (() => void)>(null);
  const [guestPromptReason, setGuestPromptReason] = useState<string | null>(null);
  const dragCommitRef = useRef(false);
  const snapToastTimerRef = useRef<number | null>(null);
  const ruleToastTimerRef = useRef<number | null>(null);
  const onboardingStartedAtRef = useRef<number | null>(null);
  const firstItemTrackedRef = useRef(false);
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

  const qaPaywallHooksEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "true";
  const paywallWinnerDefault = normalizeUpgradeVariant(process.env.NEXT_PUBLIC_PAYWALL_WINNER_DEFAULT ?? null);
  const paywallFallbackVariant =
    normalizeUpgradeVariant(process.env.NEXT_PUBLIC_PAYWALL_FALLBACK_VARIANT ?? null) ?? "unlock_pro_exports";
  const paywallForceFallback =
    process.env.NEXT_PUBLIC_PAYWALL_FORCE_FALLBACK === "1" ||
    process.env.NEXT_PUBLIC_PAYWALL_FORCE_FALLBACK === "true";
  const paywallExperimentSlot = normalizeExperimentSlot(process.env.NEXT_PUBLIC_PAYWALL_EXPERIMENT_SLOT ?? null);

  const paywallVariant = useMemo(() => {
    if (typeof window === "undefined") return "unlock_pro_exports" as UpgradeCtaVariant;
    const override = qaPaywallHooksEnabled
      ? normalizeUpgradeVariant(paywallVariantOverride) ??
        normalizeUpgradeVariant(window.localStorage.getItem("paywall_variant_override"))
      : null;
    if (override) return override;
    if (paywallForceFallback) return paywallFallbackVariant;
    if (paywallWinnerDefault) return paywallWinnerDefault;
    const seed = session?.user?.id ?? designId ?? getAnonId();
    return hashStringToVariant(seed);
  }, [
    designId,
    paywallFallbackVariant,
    paywallForceFallback,
    paywallVariantOverride,
    paywallWinnerDefault,
    qaPaywallHooksEnabled,
    session?.user?.id,
  ]);

  const resolvedPricingLayout = useMemo<PricingLayoutVariant>(() => {
    return paywallVariant === "see_pricing" ? "annual_highlight" : "default";
  }, [paywallVariant]);

  const primaryUpgradeCtaLabel =
    upgradeCtaVariant === "see_pricing" ? "See pricing" : "Unlock Pro exports";

  const annualPlanSavingsLabel = "Best value: yearly plan saves 20%";
  const paywallContextMeta = {
    cta_variant: upgradeCtaVariant,
    pricing_layout: pricingLayoutVariant,
    experiment_slot: paywallExperimentSlot,
    force_fallback: paywallForceFallback,
  };

  const logFunnelEvent = useCallback(
    (eventType: FunnelEventName, meta?: Record<string, unknown>) => {
      fetch("/api/track/app-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          designId,
          shareToken,
          meta,
        }),
      }).catch(() => undefined);
    },
    [designId, shareToken]
  );

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
    if (typeof window === "undefined") return;
    try {
      const storedTheme = localStorage.getItem("plan_theme");
      if (storedTheme === "consumer" || storedTheme === "pro") {
        setPlanTheme(storedTheme);
      }

      const storedLayerPreset = localStorage.getItem("plan_layer_preset");
      if (storedLayerPreset === "presentation" || storedLayerPreset === "technical" || storedLayerPreset === "staging") {
        setPlanLayerPreset(storedLayerPreset);
      }

      const storedExportPreset = localStorage.getItem("plan_export_preset");
      if (storedExportPreset === "consumer" || storedExportPreset === "pro") {
        setExportStylePreset(storedExportPreset);
      }
      const storedMeasurementUnit = localStorage.getItem("plan_measurement_unit");
      if (storedMeasurementUnit === "mm" || storedMeasurementUnit === "cm" || storedMeasurementUnit === "in") {
        setPlanMeasurementUnit(storedMeasurementUnit);
      }

      const storedLayers = localStorage.getItem("plan_layers");
      if (storedLayers) {
        const parsed = JSON.parse(storedLayers) as Partial<typeof planLayers>;
        setPlanLayers((prev) => ({ ...prev, ...parsed }));
      }

      const storedAnnotations = localStorage.getItem("plan_annotations");
      if (storedAnnotations) {
        const parsed = JSON.parse(storedAnnotations) as Array<Partial<EditorAnnotation2D> & { id?: string; xMm?: number; zMm?: number; text?: string }>;
        if (Array.isArray(parsed)) {
          const normalized: EditorAnnotation2D[] = [];
          for (let i = 0; i < parsed.length; i += 1) {
            const entry = parsed[i];
            if (typeof entry.id !== "string" || typeof entry.xMm !== "number" || typeof entry.zMm !== "number") {
              continue;
            }
            const kind: EditorAnnotation2D["kind"] =
              entry.kind === "callout" || entry.kind === "room_tag" ? entry.kind : "note";
            normalized.push({
              id: entry.id || `note-${i}`,
              xMm: Number(entry.xMm),
              zMm: Number(entry.zMm),
              text: String(entry.text ?? "Note"),
              kind,
              anchorXMm: typeof entry.anchorXMm === "number" ? entry.anchorXMm : undefined,
              anchorZMm: typeof entry.anchorZMm === "number" ? entry.anchorZMm : undefined,
            });
          }
          setPlanAnnotations(normalized);
        }
      }

      const storedOpenings = localStorage.getItem("plan_openings");
      if (storedOpenings) {
        const parsed = JSON.parse(storedOpenings) as RoomOpening2D[];
        if (Array.isArray(parsed)) {
          setPlanOpenings(parsed);
        }
      }

      const storedFixed = localStorage.getItem("plan_fixed_elements");
      if (storedFixed) {
        const parsed = JSON.parse(storedFixed) as FixedElement2D[];
        if (Array.isArray(parsed)) {
          setPlanFixedElements(parsed);
        }
      }
    } catch {
      // ignore malformed storage payloads
    } finally {
      setPlanSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_theme", planTheme);
    } catch {
      // ignore storage errors
    }
  }, [planSettingsLoaded, planTheme]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_layers", JSON.stringify(planLayers));
    } catch {
      // ignore storage errors
    }
  }, [planLayers, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_layer_preset", planLayerPreset);
    } catch {
      // ignore storage errors
    }
  }, [planLayerPreset, planSettingsLoaded]);
  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_measurement_unit", planMeasurementUnit);
    } catch {
      // ignore storage errors
    }
  }, [planMeasurementUnit, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_export_preset", exportStylePreset);
    } catch {
      // ignore storage errors
    }
  }, [exportStylePreset, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_annotations", JSON.stringify(planAnnotations));
    } catch {
      // ignore storage errors
    }
  }, [planAnnotations, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_openings", JSON.stringify(planOpenings));
    } catch {
      // ignore storage errors
    }
  }, [planOpenings, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_fixed_elements", JSON.stringify(planFixedElements));
    } catch {
      // ignore storage errors
    }
  }, [planFixedElements, planSettingsLoaded]);

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

    if (!designStartedTrackedRef.current) {
      track("design_started", {
        design_id: designId ?? null,
        mode,
        is_guest: !session?.user,
      });
      logFunnelEvent("design_started", {
        mode,
        is_guest: !session?.user,
      });
      designStartedTrackedRef.current = true;
    }

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
      const planningDims = resolveConfiguredPlanningDimsMm(item, product);
      const [effW, effD] = getRotatedFootprint(
        planningDims.w / 1000,
        planningDims.d / 1000,
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
  const [liveCatalogReady, setLiveCatalogReady] = useState(false);

  useEffect(() => {
    designSnapshotRef.current = designSnapshot;
  }, [designSnapshot]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/catalog/live", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({ ids: [], itemIds: [], assetIds: [] }))) as {
          ids?: string[];
          itemIds?: string[];
          assetIds?: string[];
        };
        const allowedItemIds = new Set(
          Array.isArray(payload.itemIds)
            ? payload.itemIds
            : Array.isArray(payload.ids)
              ? payload.ids
              : []
        );
        const allowedAssetIds = new Set(Array.isArray(payload.assetIds) ? payload.assetIds : []);

        if (cancelled) return;

        // If live gate currently yields no eligible items, keep the local catalog so
        // starter flows and manual placement remain usable.
        if (allowedItemIds.size === 0 && allowedAssetIds.size === 0) {
          console.warn("Live catalog returned zero eligible IDs; using local catalog fallback.");
          return;
        }

        let keptCount = 0;
        const idsToRemove: string[] = [];
        for (const id of Object.keys(CATALOG_ITEMS)) {
          const catalogItem = CATALOG_ITEMS[id];
          const assetId = catalogItem?.assets?.assetId;
          const allowed =
            allowedItemIds.has(id) ||
            (typeof assetId === "string" && allowedAssetIds.has(assetId));

          if (!allowed) {
            idsToRemove.push(id);
          } else {
            keptCount += 1;
          }
        }

        // Guard against accidental full-prune when IDs are in a different domain.
        if (keptCount === 0 && (allowedItemIds.size > 0 || allowedAssetIds.size > 0)) {
          console.warn("Live catalog IDs did not match local catalog IDs; skipping prune.", {
            itemIds: allowedItemIds.size,
            assetIds: allowedAssetIds.size,
          });
        } else {
          for (const id of idsToRemove) {
            delete CATALOG_ITEMS[id];
            CATALOG_ITEMS_MAP.delete(id);
          }
        }
      } catch {
        // If live catalog fetch fails, keep local catalog so editor remains usable.
        console.warn("Live catalog fetch failed; using local catalog fallback.");
      } finally {
        if (!cancelled) setLiveCatalogReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
    [history]
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
  const cameraRef = useRef<THREE.Camera | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const isCameraAnimatingRef = useRef(false);
  const last3DViewRef = useRef<CameraView | null>(null);
  const cartHoverCameraBaselineRef = useRef<CameraView | null>(null);
  const cartHoverFocusTimerRef = useRef<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const updateProjection = useCallback((cam: THREE.Camera | null) => {
    if (!cam) return;
    if (cam instanceof THREE.PerspectiveCamera || cam instanceof THREE.OrthographicCamera) {
      cam.updateProjectionMatrix();
    }
  }, []);

  const updateCameraViewFromScene = useCallback(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    const target = controls.target as THREE.Vector3;
    const perspectiveFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined;
    const next: CameraView = {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      fov: perspectiveFov,
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
    const isPerspective = camera instanceof THREE.PerspectiveCamera;
    const fromFov = isPerspective ? camera.fov : cameraView.fov ?? 45;
    const toFov = nextView.fov ?? fromFov;
    const start = performance.now();

    const tick = (ts: number) => {
      const t = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(fromPos, toPos, eased);
      (controls.target as THREE.Vector3).lerpVectors(fromTarget, toTarget, eased);
      if (isPerspective) {
        camera.fov = fromFov + (toFov - fromFov) * eased;
      }
      updateProjection(camera);
      controls.update();

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      isCameraAnimatingRef.current = false;
      updateCameraViewFromScene();
    };

    requestAnimationFrame(tick);
  }, [cameraView.fov, updateCameraViewFromScene, updateProjection]);

  useEffect(() => {
    const controls = orbitControlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    if (cartHoverFocusTimerRef.current) {
      window.clearTimeout(cartHoverFocusTimerRef.current);
      cartHoverFocusTimerRef.current = null;
    }

    if (editorMode !== "buy" || viewMode === "2d") {
      cartHoverCameraBaselineRef.current = null;
      return;
    }

    if (!hoveredCartInstanceId) {
      if (cartHoverCameraBaselineRef.current) {
        transitionToCameraView(cartHoverCameraBaselineRef.current, 260);
        cartHoverCameraBaselineRef.current = null;
      }
      return;
    }

    const hoveredItem = items.find((it) => it.instanceId === hoveredCartInstanceId);
    if (!hoveredItem) return;
    const hoveredProduct = CATALOG_ITEMS[hoveredItem.productId];
    if (!hoveredProduct) return;

    const currentTarget = (controls.target as THREE.Vector3).clone();
    const currentPos = camera.position.clone();

    const perspectiveFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : cameraView.fov ?? 45;

    if (!cartHoverCameraBaselineRef.current) {
      cartHoverCameraBaselineRef.current = {
        pos: [currentPos.x, currentPos.y, currentPos.z],
        target: [currentTarget.x, currentTarget.y, currentTarget.z],
        fov: perspectiveFov,
      };
    }

    const itemX = hoveredItem.position?.[0] ?? 0;
    const itemZ = hoveredItem.position?.[2] ?? 0;
    const itemY = Math.max(0.45, hoveredProduct.dimsMm.h / 1000 * 0.52);

    const deltaX = itemX - currentTarget.x;
    const deltaZ = itemZ - currentTarget.z;

    cartHoverFocusTimerRef.current = window.setTimeout(() => {
      transitionToCameraView(
        {
          pos: [
            currentPos.x + deltaX * 0.22,
            currentPos.y,
            currentPos.z + deltaZ * 0.22,
          ],
          target: [
            currentTarget.x + deltaX * 0.45,
            itemY,
            currentTarget.z + deltaZ * 0.45,
          ],
          fov: perspectiveFov,
        },
        260
      );
      cartHoverFocusTimerRef.current = null;
    }, 120);

    return () => {
      if (cartHoverFocusTimerRef.current) {
        window.clearTimeout(cartHoverFocusTimerRef.current);
        cartHoverFocusTimerRef.current = null;
      }
    };
  }, [cameraView.fov, editorMode, hoveredCartInstanceId, items, transitionToCameraView, viewMode]);

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
    track("export_clicked", {
      design_id: designId,
      channel: "images",
      is_pro: isPro(plan),
      export_style: exportStylePreset,
    });
    logFunnelEvent("export_clicked", {
      channel: "images",
      plan,
      export_style: exportStylePreset,
    });

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

      const angles =
        exportStylePreset === "pro"
          ? [
              { name: "hero", yaw: 0 },
              { name: "left", yaw: Math.PI / 9 },
              { name: "right", yaw: -Math.PI / 9 },
              { name: "overview", yaw: Math.PI / 4 },
            ]
          : [
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
        updateProjection(cameraRef.current);

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
      updateProjection(cameraRef.current);

      // Deactivate client preview
      setClientPreview(false);

      // Create download links with delays to prevent browser throttling
      images.forEach(({ name, url }, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = url;
          link.download = `room-${exportStylePreset}-${name}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 300); // 300ms delay between downloads
      });

      track("images_exported", {
        design_id: designId,
        count: images.length,
        is_pro: isPro(plan),
        export_style: exportStylePreset,
      });

      if (!isPro(plan)) {
        track("upgrade_prompt_shown", { source: "export_images" });
        setUpgradeReason("export_images");
        setShowUpgrade(true);
      }

      alert(`Exported ${images.length} ${exportStylePreset} images! Check your downloads.`);
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

    const angles =
      exportStylePreset === "pro"
        ? [
            { name: "hero", yaw: 0 },
            { name: "left", yaw: Math.PI / 9 },
            { name: "right", yaw: -Math.PI / 9 },
            { name: "overview", yaw: Math.PI / 4 },
          ]
        : [
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
      updateProjection(cameraRef.current);

      await waitForFrames(2);

      const imageUrl = captureCanvasImageForPdf();
      if (imageUrl) images.push(imageUrl);
    }

    cameraRef.current.position.copy(originalPos);
    if (orbitControlsRef.current) {
      (orbitControlsRef.current.target as THREE.Vector3).copy(originalTarget);
    }
    cameraRef.current.lookAt(originalTarget);
    updateProjection(cameraRef.current);
    setClientPreview(previousPreview);

    return images;
  };

  const exportPdf = async () => {
    track("export_clicked", {
      design_id: designId,
      channel: "pdf",
      is_pro: isPro(plan),
      export_style: exportStylePreset,
    });
    logFunnelEvent("export_clicked", {
      channel: "pdf",
      plan,
      export_style: exportStylePreset,
    });

    const isProPlan = isPro(plan);
    if (!isProPlan) {
      track("pdf_export_attempted", { is_pro: false, tier: "free" });
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
      const tierImages = isProPlan ? images : images.slice(0, 1);

      const pdfPayload = {
        title:
          isProPlan
            ? exportStylePreset === "pro"
              ? "Interior AI Room Design - Technical Set"
              : "Interior AI Room Design - Presentation Set"
            : "Interior AI Room Design - Free Preview",
        images: tierImages,
        exportStylePreset,
        requestedTier: isProPlan ? "pro" : "free",
        items: items
          .map((item) => {
            const product = CATALOG_ITEMS[item.productId];
            if (!product) return null;
            return {
              name: product.title,
              price: getItemPrice(product),
              qty: item.qty || 1,
              retailer: product.commerce.type === "affiliate" ? product.commerce.data.retailer : null,
              buyUrl: product.commerce.type === "affiliate" ? product.commerce.data.url : null,
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
        is_pro: isProPlan,
        tier: isProPlan ? "pro" : "free",
        export_style: exportStylePreset,
      });

      if (!isProPlan) {
        track("upgrade_prompt_shown", { source: "export_pdf_free_completion" });
        setUpgradeReason("export_pdf");
        setShowUpgrade(true);
      }
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
      track("checkout_started", {
        source: "upgrade_modal",
        interval,
        design_id: designId ?? null,
        reason: upgradeReason ?? "unknown",
        ...paywallContextMeta,
      });
      logFunnelEvent("checkout_started", {
        source: "upgrade_modal",
        interval,
        reason: upgradeReason ?? "unknown",
        ...paywallContextMeta,
      });
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
    if (landingTrackedRef.current) return;
    track("landing_viewed", {
      design_id: designId ?? null,
      mode,
      is_guest: !session?.user,
    });
    logFunnelEvent("landing_viewed", {
      mode,
      is_guest: !session?.user,
    });
    landingTrackedRef.current = true;
  }, [designId, logFunnelEvent, mode, session?.user]);

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
    setUpgradeCtaVariant(paywallVariant);
  }, [paywallVariant]);

  useEffect(() => {
    setPricingLayoutVariant(resolvedPricingLayout);
  }, [resolvedPricingLayout]);

  useEffect(() => {
    if (!qaPaywallHooksEnabled) return;
    if (paywallOpenParam !== "1") return;
    setUpgradeReason((current) => current ?? "designer");
    setShowUpgrade(true);
  }, [paywallOpenParam, qaPaywallHooksEnabled]);

  useEffect(() => {
    if (!qaPaywallHooksEnabled) return;
    if (plansOpenParam !== "1") return;
    setShowPlans(true);
  }, [plansOpenParam, qaPaywallHooksEnabled]);

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

  useEffect(() => {
    if (!planSettingsLoaded) return;
    if (planOpenings.length > 0) return;
    setPlanOpenings([
      {
        id: "door-east-main",
        wall: "east",
        offsetMm: 0,
        widthMm: 900,
        kind: "door",
      },
      {
        id: "window-west-main",
        wall: "west",
        offsetMm: 0,
        widthMm: 1200,
        kind: "window",
      },
    ]);
  }, [planOpenings.length, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    if (planFixedElements.length > 0) return;
    setPlanFixedElements([
      {
        id: "kitchen-run-top",
        kind: "kitchen_counter",
        xMm: 0,
        zMm: -metersToMm(roomDepth / 2) + 300,
        widthMm: 2600,
        depthMm: 600,
        rotationDeg: 0,
        label: "Kitchen run",
      },
      {
        id: "kitchen-island",
        kind: "island",
        xMm: -1050,
        zMm: -300,
        widthMm: 1200,
        depthMm: 600,
        rotationDeg: 0,
        label: "Island",
      },
    ]);
  }, [planFixedElements.length, planSettingsLoaded, roomDepth]);


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
    setSelectedPlanOverlayId(null);
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

  useEffect(() => {
    setItemConfigurationByInstanceId((prev) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const item of items) {
        const explicit = item.configurationCode?.trim();
        const tracked = prev[item.instanceId];
        const value = explicit || tracked;
        if (value) next[item.instanceId] = value;
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) changed = true;
      if (!changed) {
        for (const key of nextKeys) {
          if (next[key] !== prev[key]) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [items]);

  const [showInspectorDetails, setShowInspectorDetails] = useState(false);
  const [showFullDimensions, setShowFullDimensions] = useState(false);
  const [showRotationControls, setShowRotationControls] = useState(false);
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const [previewMaterialPresetId, setPreviewMaterialPresetId] = useState<string | null>(null);
  const [hoveredColourVariantId, setHoveredColourVariantId] = useState<string | null>(null);
  const [hoveredColourPreview, setHoveredColourPreview] = useState<{
    variantId: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredColourPreviewVisible, setHoveredColourPreviewVisible] = useState(false);
  const hoveredColourPreviewHideTimerRef = useRef<number | null>(null);
  const [itemConfigurationByInstanceId, setItemConfigurationByInstanceId] = useState<Record<string, string>>({});
    useEffect(() => {
      return () => {
        if (hoveredColourPreviewHideTimerRef.current) {
          window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
          hoveredColourPreviewHideTimerRef.current = null;
        }
      };
    }, []);

  const [rotationInputValue, setRotationInputValue] = useState("0");
  const [rotationSnapPresetDegrees, setRotationSnapPresetDegrees] = useState<15 | 5 | 0>(15);

  const rotationSnapEnabled = rotationSnapPresetDegrees > 0;
  const rotationSnapStepDegrees = rotationSnapEnabled
    ? rotationSnapPresetDegrees
    : 1;
  const rotationSnapStepRadians = (rotationSnapStepDegrees * Math.PI) / 180;

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

  const importedModelById = useMemo(
    () => new Map(importedModelOptions.map((option) => [option.id, option])),
    [importedModelOptions]
  );

  const dimsFromBoundsCm = useCallback((
    bounds: ConfigurableBoundsCm | undefined,
    fallbackHeightMm: number
  ): { w: number; d: number; h: number } | null => {
    const widthCm = Number(bounds?.width ?? 0);
    const depthCm = Number(bounds?.depth ?? 0);
    const heightCm = Number(bounds?.height ?? fallbackHeightMm / 10);
    if (!(widthCm > 0 && depthCm > 0)) return null;
    return {
      w: Math.round(widthCm * 10),
      d: Math.round(depthCm * 10),
      h: Math.round(heightCm * 10),
    };
  }, []);

  const resolveItemConfigurationCode = useCallback((item: DesignItem | null | undefined) => {
    if (!item) return null;
    const explicit = item.configurationCode?.trim();
    if (explicit) return explicit;
    const tracked = itemConfigurationByInstanceId[item.instanceId]?.trim();
    if (tracked) return tracked;
    const catalog = importedModelById.get(item.productId)?.catalog;
    const defaultCode = catalog?.configurableMetadata?.default_configuration?.trim();
    return defaultCode || null;
  }, [importedModelById, itemConfigurationByInstanceId]);

  const resolveItemConfigurationEntry = useCallback((item: DesignItem | null | undefined) => {
    if (!item) return null;
    const code = resolveItemConfigurationCode(item);
    if (!code) return null;

    const catalog = importedModelById.get(item.productId)?.catalog;
    return catalog?.configurations?.find((entry) => entry.configuration_code === code) ?? null;
  }, [importedModelById, resolveItemConfigurationCode]);

  const resolveConfiguredVisualDimsMm = useCallback((
    item: DesignItem,
    fallbackProduct: CatalogItemSchema
  ): { w: number; d: number; h: number } => {
    const cfg = resolveItemConfigurationEntry(item);
    if (!cfg) return { ...fallbackProduct.dimsMm };

    const visualDims =
      dimsFromBoundsCm(cfg.visual_bounds_cm, fallbackProduct.dimsMm.h) ??
      (() => {
        const sourceDims = cfg.dimensions_estimate ?? cfg.dimensions;
        const widthCm = Number(sourceDims?.width_cm ?? 0);
        const depthCm = Number(sourceDims?.depth_cm ?? 0);
        const heightCm = Number(sourceDims?.height_cm ?? fallbackProduct.dimsMm.h / 10);
        if (!(widthCm > 0 && depthCm > 0)) return null;
        return {
          w: Math.round(widthCm * 10),
          d: Math.round(depthCm * 10),
          h: Math.round(heightCm * 10),
        };
      })();

    return visualDims ?? { ...fallbackProduct.dimsMm };
  }, [dimsFromBoundsCm, resolveItemConfigurationEntry]);

  const resolveConfiguredPlanningDimsMm = useCallback((
    item: DesignItem,
    fallbackProduct: CatalogItemSchema
  ): { w: number; d: number; h: number } => {
    const cfg = resolveItemConfigurationEntry(item);
    if (!cfg) return { ...fallbackProduct.dimsMm };

    const planningDims =
      dimsFromBoundsCm(cfg.planning_bounds_cm, fallbackProduct.dimsMm.h) ??
      (() => {
        const recommended = cfg.dimensions_recommended_planning;
        const footprint = cfg.placement_footprint;
        const widthCm = Number(recommended?.width_cm ?? footprint?.planning_width_cm ?? 0);
        const depthCm = Number(recommended?.depth_cm ?? footprint?.planning_depth_cm ?? 0);
        const heightCm = Number(recommended?.height_cm ?? fallbackProduct.dimsMm.h / 10);
        if (!(widthCm > 0 && depthCm > 0)) return null;
        return {
          w: Math.round(widthCm * 10),
          d: Math.round(depthCm * 10),
          h: Math.round(heightCm * 10),
        };
      })();

    return planningDims ?? resolveConfiguredVisualDimsMm(item, fallbackProduct);
  }, [dimsFromBoundsCm, resolveConfiguredVisualDimsMm, resolveItemConfigurationEntry]);

  const resolveConfiguredNodeTransforms = useCallback((item: DesignItem | null | undefined) => {
    const nodeTransforms = resolveItemConfigurationEntry(item)?.node_transforms;
    if (!nodeTransforms || typeof nodeTransforms !== "object") {
      return null;
    }

    return nodeTransforms as Record<string, ConfigurableNodeTransform>;
  }, [resolveItemConfigurationEntry]);

  const resolveConfiguredModelUrl = useCallback((
    item: DesignItem,
    fallbackModelUrl: string | undefined,
    variantId: string
  ) => {
    const code = resolveItemConfigurationCode(item);
    if (!code) return fallbackModelUrl;

    const catalog = importedModelById.get(item.productId)?.catalog;
    const assetMap = catalog?.configurableMetadata?.configuration_model_assets?.[code];
    if (!assetMap) return fallbackModelUrl;

    const variantCode = variantId
      .replace(`imported-${item.productId}-`, "")
      .trim()
      .toLowerCase();
    const variantMeta = CATALOG_ITEMS[item.productId]?.variants.find((variant) => variant.id === variantId);
    const finishCode = String(variantMeta?.finishCode ?? "").trim().toLowerCase();
    const lookupKeys = [
      variantCode,
      variantCode.replace(/-/g, "_"),
      variantCode.split("__")[0],
      finishCode,
      finishCode.replace(/-/g, "_"),
      finishCode.split("__")[0],
    ].filter((key) => key.length > 0);
    const candidateAssetId =
      lookupKeys
        .map((key) => assetMap[key])
        .find((assetId) => typeof assetId === "string" && assetId.trim().length > 0) ||
      assetMap.default;
    if (!candidateAssetId) return fallbackModelUrl;

    const mappedOption = importedModelById.get(candidateAssetId);
    if (mappedOption?.modelUrl) return mappedOption.modelUrl;

    const mappedUrl = importedModelUrlByAssetId[candidateAssetId];
    if (mappedUrl) return mappedUrl;

    return `/assets/models/${candidateAssetId}.glb`;
  }, [importedModelById, importedModelUrlByAssetId, resolveItemConfigurationCode]);

  const selectedProduct = selectedItem ? CATALOG_ITEMS[selectedItem.productId] : null;
  const selectedImportedCatalog = selectedProduct
    ? importedModelById.get(selectedProduct.id)?.catalog ?? null
    : null;
  const selectedConfigurationCode = resolveItemConfigurationCode(selectedItem);
  const selectedConfigUi = selectedImportedCatalog?.configurableMetadata?.configuration_ui;
  const selectedConfigOptions = selectedConfigUi?.options ?? [];
  const selectedConfigEntry = selectedItem ? resolveItemConfigurationEntry(selectedItem) : null;
  const selectedConfigBehavior = selectedImportedCatalog?.configurableMetadata?.configuration_behavior;
  const fullDimensionsDetails = selectedProduct
    ? FULL_DIMENSIONS_BY_PRODUCT_ID[selectedProduct.id] ?? null
    : null;
  const itemPlanningBoundsByInstanceId = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => {
          const product = CATALOG_ITEMS[item.productId];
          if (!product) return [item.instanceId, { w: 0, d: 0, h: 0 }];
          return [item.instanceId, resolveConfiguredPlanningDimsMm(item, product)];
        })
      ),
    [items, resolveConfiguredPlanningDimsMm]
  );
  const selectedBrand = useMemo(() => {
    if (!selectedProduct) return null;
    const metadataBrand = selectedProduct.metadata?.brand?.trim();
    if (metadataBrand) return metadataBrand;
    // Legacy fallback for already imported titles that include brand in title.
    if (selectedProduct.title.startsWith("Castlery ")) return "Castlery";
    return null;
  }, [selectedProduct]);
  const selectedModelTitle = useMemo(() => {
    if (!selectedProduct) return "";
    const metadataName = selectedProduct.metadata?.productName?.trim();
    if (metadataName) {
      return metadataName;
    }
    if (selectedBrand && selectedProduct.title.startsWith(`${selectedBrand} `)) {
      return selectedProduct.title.slice(selectedBrand.length + 1);
    }
    return selectedProduct.title;
  }, [selectedProduct, selectedBrand]);
  const modelOptionProductIds = useMemo(
    () =>
      selectedProduct
        ? (MODEL_FAMILY_BY_PRODUCT_ID[selectedProduct.id] ?? [selectedProduct.id]).filter(
            (id) => Boolean(CATALOG_ITEMS[id])
          )
        : [],
    [selectedProduct]
  );
  const armStyleOptions = useMemo(() => {
    if (!selectedProduct) return null;

    const direct = ARM_STYLE_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (direct) return direct;

    for (const options of Object.values(ARM_STYLE_OPTIONS_BY_PRODUCT_ID)) {
      if (options.some((option) => option.productId === selectedProduct.id)) {
        return options;
      }
    }

    return null;
  }, [selectedProduct]);
  const hasStructuredVariantLabels = Boolean(
    selectedProduct?.variants.some((v) => Boolean(v.finishLabel?.trim()) || /\(([^)]+)\)/.test(v.label))
  );
  const modelSelectorProductIds = useMemo(() => {
    if (!selectedProduct) return [] as string[];
    const explicit = MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[selectedProduct.id];
    if (explicit?.length) {
      return explicit.filter((id) => Boolean(CATALOG_ITEMS[id]));
    }
    if (!armStyleOptions?.length) return modelOptionProductIds;

    // Keep arm-style changes out of the Model selector.
    const slimOption = armStyleOptions.find(
      (option) => /slim\s*arm/i.test(option.label) && option.productId
    );
    if (slimOption?.productId && CATALOG_ITEMS[slimOption.productId]) {
      return [slimOption.productId];
    }

    return [selectedProduct.id];
  }, [selectedProduct, armStyleOptions, modelOptionProductIds]);
  const selectedModelProductId = useMemo(() => {
    if (!selectedProduct) return null;
    if (modelSelectorProductIds.includes(selectedProduct.id)) {
      return selectedProduct.id;
    }

    const representativeModelId =
      MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID[selectedProduct.id];
    if (representativeModelId && modelSelectorProductIds.includes(representativeModelId)) {
      return representativeModelId;
    }

    if (armStyleOptions?.length) {
      const slimOption = armStyleOptions.find(
        (option) => /slim\s*arm/i.test(option.label) && option.productId
      );
      if (slimOption?.productId && modelSelectorProductIds.includes(slimOption.productId)) {
        return slimOption.productId;
      }
    }

    return modelSelectorProductIds[0] ?? selectedProduct.id;
  }, [selectedProduct, modelSelectorProductIds, armStyleOptions]);
  const lengthOptions = useMemo(() => {
    if (!selectedProduct) return null;
    const direct = LENGTH_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (direct?.length) return direct;
    if (selectedModelProductId) {
      const fromModel = LENGTH_OPTIONS_BY_PRODUCT_ID[selectedModelProductId];
      if (fromModel?.length) return fromModel;
    }
    return null;
  }, [selectedProduct, selectedModelProductId]);
  const shapeOptions = useMemo(() => {
    if (!selectedProduct) return null;
    const direct = SHAPE_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (direct?.length) return direct;
    if (selectedModelProductId) {
      const fromModel = SHAPE_OPTIONS_BY_PRODUCT_ID[selectedModelProductId];
      if (fromModel?.length) return fromModel;
    }
    return null;
  }, [selectedProduct, selectedModelProductId]);
  const orientationOptions = useMemo(() => {
    if (!selectedProduct) return null;
    const direct = ORIENTATION_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (!direct?.length) return null;
    return direct;
  }, [selectedProduct]);
  const structuredVariants = useMemo(() => {
    if (!selectedProduct) return [];
    return selectedProduct.variants.map((variant) => {
      const parts = parseVariantLabel(variant.label);
      const materialType =
        variant.materialType ??
        inferMaterialTypeFromText(
          variant.finishLabel,
          variant.finishCode,
          variant.swatchGroup,
          parts.materialLabel,
          variant.label
        );
      const collectionType = String(variant.collectionType ?? "").trim().toLowerCase();
      return {
        variant,
        colourLabel: variant.label.trim() || parts.colourLabel,
        materialLabel: materialType,
        materialType,
        collectionType,
      };
    });
  }, [selectedProduct]);
  const activeStructuredVariant = useMemo(() => {
    if (!structuredVariants.length) return null;
    return (
      structuredVariants.find((x) => x.variant.id === selectedItem?.variantId) ??
      structuredVariants[0]
    );
  }, [structuredVariants, selectedItem?.variantId]);
  const activeMaterialLabel = activeStructuredVariant?.materialLabel ?? null;
  const activeMaterialType = activeStructuredVariant?.materialType ?? null;
  const activeVariantLabel = activeStructuredVariant?.variant.label ?? null;
  const activeVariantColorHex = activeStructuredVariant?.variant.colorHex ?? null;
  const activeColourLabel = activeStructuredVariant?.colourLabel ?? null;
  const showFabricGroupingDebug = process.env.NODE_ENV !== "production";
  const selectedModelLabel = selectedProduct?.metadata?.modelLabel?.trim() ?? null;
  const selectedCategoryDebugLabel = selectedProduct
    ? selectedProduct.category.replace(/_/g, " ")
    : null;
  const selectedFamily = selectedProduct?.metadata?.productFamily?.trim().toLowerCase() ?? "";
  const selectedName = selectedProduct?.metadata?.productName?.trim().toLowerCase() ?? "";
  const isCasaTvConsoleSelected =
    selectedFamily === "casa" &&
    selectedProduct?.category === "tv_console" &&
    selectedName.includes("tv console");
  const isSebTvConsoleSelected =
    selectedFamily === "seb" &&
    selectedProduct?.category === "tv_console" &&
    selectedName.includes("tv console");
  const isSloaneTvConsoleSelected =
    selectedFamily === "sloane" &&
    selectedProduct?.category === "tv_console" &&
    selectedName.includes("tv console");
  const isSloaneTableSelected =
    Boolean(selectedProduct && SLOANE_TABLE_PRODUCT_IDS.includes(selectedProduct.id as (typeof SLOANE_TABLE_PRODUCT_IDS)[number])) ||
    (selectedFamily === "sloane" && selectedProduct?.category === "dining_table");
  const isSloaneBenchSelected =
    Boolean(selectedProduct && SLOANE_BENCH_PRODUCT_IDS.includes(selectedProduct.id)) ||
    (selectedFamily === "sloane" && selectedName.includes("bench"));
  const selectedSloaneCompanionBenchItem = useMemo(() => {
    return items.find((it) => SLOANE_BENCH_PRODUCT_IDS.includes(it.productId)) ?? null;
  }, [items]);
  const selectedSloaneCompanionTableItem = useMemo(() => {
    return items.find((it) => SLOANE_TABLE_PRODUCT_IDS.includes(it.productId as (typeof SLOANE_TABLE_PRODUCT_IDS)[number])) ?? null;
  }, [items]);
  const selectedBenchOption = selectedProduct ? getSloaneBenchOptionFromProductId(selectedProduct.id) : null;
  const companionBenchOption = selectedSloaneCompanionBenchItem
    ? getSloaneBenchOptionFromProductId(selectedSloaneCompanionBenchItem.productId)
    : null;
  const defaultBenchSizeFromTable =
    selectedProduct && isSloaneTableSelected
      ? (SLOANE_TABLE_TO_BENCH_RECOMMENDATION[selectedProduct.id] ?? 150)
      : 150;
  const activeCompanionBenchSize: 150 | 180 =
    companionBenchOption?.size ?? selectedBenchOption?.size ?? defaultBenchSizeFromTable;
  const activeCompanionBenchCushion: "no" | "leather" =
    companionBenchOption?.cushion ?? selectedBenchOption?.cushion ?? "no";
  const activeSelectedBenchSize: 150 | 180 = selectedBenchOption?.size ?? 150;
  const activeSelectedBenchCushion: "no" | "leather" = selectedBenchOption?.cushion ?? "no";
  const activeCompanionTableProductId =
    selectedSloaneCompanionTableItem?.productId ??
    (selectedProduct && isSloaneTableSelected ? selectedProduct.id : "dining-real-castlery-sloane-travertine-220");
  const visibleColourVariants = useMemo(() => {
    if (!hasStructuredVariantLabels || !activeMaterialType) {
      return structuredVariants;
    }
    return structuredVariants.filter((x) => x.materialType === activeMaterialType);
  }, [structuredVariants, hasStructuredVariantLabels, activeMaterialType]);
  const groupedVisibleColourVariants = useMemo(() => {
    if (!shouldShowCollectionGrouping(visibleColourVariants.map((entry) => entry.collectionType))) {
      return [{ key: "all" as const, label: null, entries: visibleColourVariants }];
    }

    const normalizeCollectionType = (value: string | null | undefined): "stocked" | "custom" =>
      String(value ?? "").trim().toLowerCase() === "stocked" ? "stocked" : "custom";

    const stocked = visibleColourVariants.filter(
      (entry) => normalizeCollectionType(entry.collectionType) === "stocked"
    );
    const custom = visibleColourVariants.filter(
      (entry) => normalizeCollectionType(entry.collectionType) === "custom"
    );

    const groups: Array<{ key: "stocked" | "custom" | "all"; label: string | null; entries: typeof visibleColourVariants }> = [];
    if (stocked.length) groups.push({ key: "stocked", label: "Stocked", entries: stocked });
    if (custom.length) groups.push({ key: "custom", label: "Custom", entries: custom });
    return groups;
  }, [visibleColourVariants]);
  const hideColourSelector = Boolean(
    selectedProduct?.id.startsWith("dining-real-castlery-forma-") ||
      selectedProduct?.id.startsWith("dining-real-castlery-brighton-") ||
      isCasaTvConsoleSelected ||
        isSebTvConsoleSelected ||
        isSloaneTvConsoleSelected
  );
  const materialOptions = useMemo(() => {
    if (!selectedProduct) {
      return [] as Array<{ type: "Fabric" | "Leather"; variantId: string; colorHex: string }>;
    }
    const orderedTypes = ["Fabric", "Leather"] as const;
    const byType = new Map<"Fabric" | "Leather", { variantId: string; colorHex: string }>();

    for (const entry of structuredVariants) {
      if (!byType.has(entry.materialType)) {
        byType.set(entry.materialType, {
          variantId: entry.variant.id,
          colorHex: entry.variant.swatchHex ?? entry.variant.colorHex,
        });
      }
    }

    return orderedTypes
      .map((type) => {
        const mapped = byType.get(type);
        if (!mapped) return null;
        return { type, variantId: mapped.variantId, colorHex: mapped.colorHex };
      })
      .filter((entry): entry is { type: "Fabric" | "Leather"; variantId: string; colorHex: string } => Boolean(entry));
  }, [selectedProduct, structuredVariants]);
  const useLengthOptionsAsVariants = Boolean(
    !hasStructuredVariantLabels &&
      !isSloaneBenchSelected &&
      !(shapeOptions?.length && (shapeOptions?.length ?? 0) > 1) &&
      lengthOptions?.length &&
      (selectedProduct?.variants.length ?? 0) <= 1
  );
  const useShapeOptionsAsVariants = Boolean(
    !hasStructuredVariantLabels &&
      !isSloaneBenchSelected &&
      shapeOptions?.length &&
      shapeOptions.length > 1
  );
  const variantOptionCount = useMemo(() => {
    if (!selectedProduct) return 0;
    if (hasStructuredVariantLabels) {
      return modelSelectorProductIds.length;
    }
    if (useShapeOptionsAsVariants) {
      return (shapeOptions ?? []).filter((option) => Boolean(option.productId)).length;
    }
    if (useLengthOptionsAsVariants) {
      return (lengthOptions ?? []).filter((option) => Boolean(option.productId)).length;
    }
    if (isSloaneBenchSelected) {
      return 2;
    }
    return selectedProduct.variants.length;
  }, [
    selectedProduct,
    hasStructuredVariantLabels,
    modelSelectorProductIds,
    useShapeOptionsAsVariants,
    shapeOptions,
    useLengthOptionsAsVariants,
    lengthOptions,
    isSloaneBenchSelected,
  ]);
  const showVariantsSection = variantOptionCount > 1;
  const showFinishSection =
    !isCasaTvConsoleSelected &&
    !isSebTvConsoleSelected &&
    !isSloaneTvConsoleSelected &&
    materialOptions.length > 1;

  useEffect(() => {
    setPreviewVariantId(null);
    setPreviewMaterialPresetId(null);
    setShowInspectorDetails(false);
    setShowFullDimensions(false);
    setShowRotationControls(false);
  }, [selectedInstanceId]);

  useEffect(() => {
    if (editorMode !== "buy") {
      setHoveredCartInstanceId(null);
    }
  }, [editorMode]);

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
      try {
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
      } catch (error) {
        console.error("[Zone] Auto-layout failed", { zoneId, error });
      }
    },
    [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]
  );

  const rotateZone = useCallback(
    (zoneId: string, deltaRot: number) => {
      try {
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
      } catch (error) {
        console.error("[Zone] Rotate failed", { zoneId, deltaRot, error });
      }
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

  const planZones2D = useMemo(() => {
    return zones
      .map((zone) => {
        const bounds = getZoneBounds(zone);
        if (!bounds) return null;
        return {
          id: zone.id,
          x: bounds.centerX,
          z: bounds.centerZ,
          w: Math.max(0.01, bounds.maxX - bounds.minX),
          d: Math.max(0.01, bounds.maxZ - bounds.minZ),
          label: getZoneLabel(zone.type),
        };
      })
      .filter((entry): entry is { id: string; x: number; z: number; w: number; d: number; label: string } => Boolean(entry));
  }, [getZoneBounds, getZoneLabel, zones]);

  const editorScene2D: EditorScene2D = useMemo(
    () => ({
      room: {
        widthMm: metersToMm(roomWidth),
        depthMm: metersToMm(roomDepth),
      },
      items: items.map((it) => {
        const product = CATALOG_ITEMS[it.productId];
        const planning = itemPlanningBoundsByInstanceId[it.instanceId];
        const dimsW = planning?.w ?? product?.dimsMm.w ?? 0;
        const dimsD = planning?.d ?? product?.dimsMm.d ?? 0;
        const dimsH = planning?.h ?? product?.dimsMm.h ?? 0;
        return {
          id: it.instanceId,
          catalogItemId: it.productId,
          positionMm: {
            x: metersToMm(it.position[0]),
            z: metersToMm(it.position[2]),
          },
          rotationDeg: radiansToDeg(it.rotationY ?? 0),
          widthMm: dimsW,
          depthMm: dimsD,
          heightMm: dimsH,
          label: product?.title ?? it.productId,
          category: product?.category ?? "item",
        };
      }),
      selectedItemId: selectedInstanceId,
      annotations: planAnnotations,
      openings: planOpenings,
      fixedElements: planFixedElements,
    }),
    [
      itemPlanningBoundsByInstanceId,
      items,
      planAnnotations,
      planFixedElements,
      planOpenings,
      roomDepth,
      roomWidth,
      selectedInstanceId,
    ]
  );

  const applyPlanLayerPreset = useCallback((presetId: PlanLayerPresetId) => {
    const selectedPreset = PLAN_LAYER_PRESETS[presetId];
    setPlanLayerPreset(presetId);
    setPlanTheme(selectedPreset.theme);
    setPlanLayers({ ...selectedPreset.layers });
  }, []);

  const addPlanAnnotation = useCallback(
    (kind: "note" | "callout" | "room_tag") => {
      const defaultText =
        kind === "room_tag" ? "Living Room" : kind === "callout" ? "Keep clear" : "Main circulation";
      const text = window.prompt(
        kind === "room_tag" ? "Room tag" : kind === "callout" ? "Callout text" : "Annotation text",
        defaultText
      );
      if (!text) return;
      const id = `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const base: EditorAnnotation2D = {
        id,
        xMm: 0,
        zMm: 0,
        text: text.trim(),
        kind,
      };
      const withAnchor =
        kind === "callout"
          ? {
              ...base,
              xMm: 450,
              zMm: 450,
              anchorXMm: 0,
              anchorZMm: 0,
            }
          : base;

      setPlanAnnotations((prev) => [...prev, withAnchor]);
      setSelectedPlanOverlayId(id);
    },
    []
  );

  const handleMoveOpening2D = useCallback((id: string, offsetMeters: number) => {
    setPlanOpenings((prev) =>
      prev.map((opening) => (opening.id === id ? { ...opening, offsetMm: Math.round(offsetMeters * 1000) } : opening))
    );
  }, []);

  const handleMoveFixedElement2D = useCallback((id: string, xMeters: number, zMeters: number) => {
    setPlanFixedElements((prev) =>
      prev.map((fixed) =>
        fixed.id === id
          ? {
              ...fixed,
              xMm: metersToMm(xMeters),
              zMm: metersToMm(zMeters),
            }
          : fixed
      )
    );
  }, []);

  const handleMoveAnnotation2D = useCallback((id: string, xMeters: number, zMeters: number) => {
    setPlanAnnotations((prev) =>
      prev.map((note) =>
        note.id === id
          ? {
              ...note,
              xMm: metersToMm(xMeters),
              zMm: metersToMm(zMeters),
            }
          : note
      )
    );
  }, []);

  const getTopDownView = useCallback((): CameraView => {
    const height = Math.max(roomWidth, roomDepth) + roomHeight + 0.8;
    return {
      target: [0, roomHeight * 0.5, 0],
      pos: [0.001, height, 0.001],
      fov: 45,
    };
  }, [roomDepth, roomHeight, roomWidth]);

  const getPlan2DView = useCallback((): CameraView => {
    const span = Math.max(roomWidth, roomDepth);
    const height = span * 2.4 + roomHeight;
    return {
      target: [0, 0, 0],
      pos: [0, height, 0],
      // Wider FOV plus higher camera keeps the full room visible in plan mode.
      fov: 30,
    };
  }, [roomDepth, roomHeight, roomWidth]);

  useEffect(() => {
    if (TDZ_TRACE) {
      console.log("[TDZTrace] viewMode-camera-effect", {
        sceneReady,
        viewMode,
      });
    }
    if (!sceneReady) return;

    if (viewMode === "2d") {
      if (!last3DViewRef.current) {
        last3DViewRef.current = cameraView;
      }
      transitionToCameraView(getPlan2DView(), 420);
      return;
    }

    if (last3DViewRef.current) {
      const restore = last3DViewRef.current;
      last3DViewRef.current = null;
      transitionToCameraView(restore, 420);
    }
  }, [TDZ_TRACE, cameraView, getPlan2DView, sceneReady, transitionToCameraView, viewMode]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    if (viewMode === "2d") {
      // For a true plan view, avoid up-vector singularity when looking straight down.
      camera.up.set(0, 0, -1);
      (controls.target as THREE.Vector3).set(0, 0, 0);
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = 0;
      controls.minAzimuthAngle = 0;
      controls.maxAzimuthAngle = 0;
    } else {
      camera.up.set(0, 1, 0);
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    }

    updateProjection(camera);
    controls.update();
  }, [updateProjection, viewMode]);

  const getEyeLevelView = useCallback((): CameraView => {
    const sofa =
      items.find((it) => {
        const catalogItem = CATALOG_ITEMS[it.productId];
        return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
      }) ?? null;
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
    if (TDZ_TRACE) {
      console.log("[TDZTrace] zone-recompute-effect", {
        itemsCount: items.length,
        currentZones: zonesRef.current.length,
      });
    }
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

  function getItemAABB(
    item: PlacedItem,
    positionOverride?: [number, number, number],
    rotationOverride?: number
  ) {
    const product = CATALOG_ITEMS[item.productId];
    if (!product) return null;
    const configuredDims = resolveConfiguredPlanningDimsMm(item, product);
    const rotationY = rotationOverride ?? item.rotationY ?? 0;
    const [w, d] = getRotatedFootprint(
      configuredDims.w / 1000,
      configuredDims.d / 1000,
      rotationY
    );
    const pos = positionOverride ?? item.position;
    return computeAABB(pos, w, d);
  }

  function getSelectionBounds(selected: PlacedItem[]) {
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
  }

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

  const buildLocalStarterPlan = (seedNum: number) => {
    const all = Object.values(CATALOG_ITEMS);
    const styleNorm = String(style ?? "Modern").toLowerCase();
    const budgetNorm = String(budget ?? "$$");

    const seeded = (offset: number) => {
      const x = Math.sin(seedNum + offset) * 10000;
      return x - Math.floor(x);
    };

    const pickLocalByCategory = (category: string, offset: number) => {
      const styleItems = all
        .filter(
          (p) =>
            mapToTopCategory(p.category, p) === category &&
            p.styleTags?.some((t) => String(t).toLowerCase() === styleNorm)
        )
        .sort((a, b) => getItemPrice(a) - getItemPrice(b));

      const allItems = all
        .filter((p) => mapToTopCategory(p.category, p) === category)
        .sort((a, b) => getItemPrice(a) - getItemPrice(b));

      const items = styleItems.length >= 2 ? styleItems : allItems;
      if (!items.length) return null;

      if (budgetNorm === "$") return items[0];
      if (budgetNorm === "$$$") return items[items.length - 1];

      const idx = Math.floor(seeded(offset) * items.length);
      return items[Math.max(0, Math.min(items.length - 1, idx))];
    };

    return {
      picks: {
        sofa: pickLocalByCategory("sofa", 11)?.id,
        rug: pickLocalByCategory("rug", 22)?.id,
        coffee_table: pickLocalByCategory("coffee_table", 33)?.id,
        tv_console:
          pickLocalByCategory("tv_console", 44)?.id ??
          pickLocalByCategory("sideboard", 444)?.id ??
          null,
        accent_chair: pickLocalByCategory("accent_chair", 55)?.id ?? null,
        floor_lamp: pickLocalByCategory("floor_lamp", 66)?.id ?? null,
      },
      meta: { style: styleNorm, budget: budgetNorm, seed: seedNum, source: "local_fallback" },
    };
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

    const applyFallbackLayout = (reason: string) => {
      const fallback = buildLocalStarterPlan(seedToUse);
      const hasCoreStarter = Boolean(fallback.picks.sofa && fallback.picks.coffee_table && fallback.picks.rug);
      if (!hasCoreStarter) {
        alert(reason || "Starter layout unavailable. Please add items manually.");
        return;
      }
      applyLayoutPlan(fallback);
      showRuleToast("Starter generated locally");
      track("ai_layout_fallback_used", { reason, seed: seedToUse, style, budget });
    };

    const describeStarterValidationIssues = (plan: LayoutPlan): string[] => {
      const issues: string[] = [];
      const picks = plan?.picks ?? {};
      const requiredRoles: Array<"sofa" | "rug" | "coffee_table"> = ["sofa", "rug", "coffee_table"];

      for (const role of requiredRoles) {
        const pickId = picks?.[role];
        if (!pickId || typeof pickId !== "string") {
          issues.push(`${role} missing catalog item`);
          continue;
        }
        if (!CATALOG_ITEMS[pickId]) {
          issues.push(`${role} catalog item not found: ${pickId}`);
        }
      }

      return issues;
    };

    const requiredCategoryCounts = {
      sofa: catalogList.filter((p) => p.category === "sofa").length,
      rug: catalogList.filter((p) => p.category === "rug").length,
      coffee_table: catalogList.filter((p) => p.category === "coffee_table").length,
    };

    if (!requiredCategoryCounts.sofa || !requiredCategoryCounts.rug || !requiredCategoryCounts.coffee_table) {
      const reasons: string[] = [];
      if (!requiredCategoryCounts.sofa) reasons.push("no live-approved sofa available");
      if (!requiredCategoryCounts.rug) reasons.push("no live-approved rug available");
      if (!requiredCategoryCounts.coffee_table) reasons.push("no live-approved coffee_table available");
      applyFallbackLayout(`Starter plan failed validation: ${reasons.join(", ")}`);
      return;
    }

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
      console.log("AI starter plan response:", plan);

      if (!res.ok) {
        applyFallbackLayout(plan?.error ?? "AI failed");
        return;
      }

      const issues = describeStarterValidationIssues(plan);
      if (issues.length > 0) {
        applyFallbackLayout(`Starter plan failed validation: ${issues.join("; ")}`);
        return;
      }

      applyLayoutPlan(plan);
    } catch (err) {
      applyFallbackLayout(err instanceof Error ? err.message : "AI failed");
    }
  };

  const onBulkSwap = (direction: "cheaper" | "premium") => {
    const actionName = direction === "cheaper" ? "Make room cheaper" : "Make room premium";
    commitItems((prev) => bulkSwapItems({ items: prev, style, direction }), actionName);
  };

  const addItem = (
    productId: string,
    position: [number, number, number],
    rotationY?: number,
    variantId?: string
  ) => {
    const product = CATALOG_ITEMS[productId];
    if (!product) return;

    const instanceId = newInstanceId();
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

    commitItems(
      (prev) => [
        ...prev,
        {
          instanceId,
          productId,
          variantId: variantId ?? product.defaultVariantId,
          position: [safeX, position[1], safeZ],
          rotationY,
          qty: 1,
          includeInCheckout: true,
        },
      ],
      `Add ${product.title || "Item"}`
    );
    updateSelection(new Set([instanceId]), instanceId);
  };

  const addCatalogItemToRoom = useCallback((productId: string, variantId?: string) => {
    const itemCount = itemsRef.current.length;
    const column = itemCount % 3;
    const row = Math.floor(itemCount / 3);
    const position: [number, number, number] =
      itemCount === 0
        ? [0, 0, -1.4]
        : [(column - 1) * 0.9, 0, Math.min(1.6, -0.4 + row * 0.9)];

    addItem(productId, position, undefined, variantId);
  }, [addItem]);

  const isEmpty = items.length === 0;
  const canEdit = !isClientPreview && liveCatalogReady;
  const _isSharedLink = Boolean(shareToken) || pathname?.includes("/share/");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalogItems = useMemo(() => Object.values(CATALOG_ITEMS), [importedModelOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models/debug", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({ models: [] }))) as {
          models?: ImportedModelDebugEntry[];
        };
        if (cancelled) return;
        const { options, modelUrlByAssetId } = buildImportedModelOptions({
          models: payload.models ?? [],
          importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
        });

        setImportedModelUrlByAssetId(modelUrlByAssetId);
        setImportedModelOptions(options);
      } catch {
        if (!cancelled) {
          setImportedModelUrlByAssetId({});
          setImportedModelOptions([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ensureImportedCatalogItem = useCallback((productId: string) => {
    const existing = CATALOG_ITEMS[productId];
    if (existing && !String(existing.defaultVariantId ?? "").startsWith("imported-")) {
      return;
    }

    const imported = importedModelById.get(productId);
    if (!imported) return;

    upsertImportedCatalogItem({
      productId,
      imported,
      importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
      importedVariantByProductId: IMPORTED_VARIANT_BY_PRODUCT_ID,
      importedVariantsByProductId: IMPORTED_VARIANTS_BY_PRODUCT_ID,
    });
  }, [importedModelById]);

  const importedFamilyOptions = useMemo(() => {
    const seen = new Set<string>();
    return importedModelOptions
      .filter((option) => {
        if (!option.familyKey || seen.has(option.familyKey)) {
          return false;
        }
        seen.add(option.familyKey);
        return true;
      })
      .map((option) => ({
        familyKey: option.familyKey,
        familyLabel: option.familyLabel,
      }));
  }, [importedModelOptions]);

  const visibleImportedModelOptions = useMemo(() => {
    if (!selectedImportedFamilyKey) {
      return importedModelOptions;
    }

    const matchingOptions = importedModelOptions.filter(
      (option) => option.familyKey === selectedImportedFamilyKey
    );

    return matchingOptions.length > 0 ? matchingOptions : importedModelOptions;
  }, [importedModelOptions, selectedImportedFamilyKey]);

  useEffect(() => {
    if (importedFamilyOptions.length === 0) {
      if (selectedImportedFamilyKey !== "") {
        setSelectedImportedFamilyKey("");
      }
      if (selectedImportedProductId !== "") {
        setSelectedImportedProductId("");
      }
      return;
    }

    const familyExists = importedFamilyOptions.some(
      (option) => option.familyKey === selectedImportedFamilyKey
    );
    const nextFamilyKey = familyExists
      ? selectedImportedFamilyKey
      : importedFamilyOptions[0]?.familyKey ?? "";

    if (nextFamilyKey !== selectedImportedFamilyKey) {
      setSelectedImportedFamilyKey(nextFamilyKey);
    }

    const matchingOptions = importedModelOptions.filter(
      (option) => option.familyKey === nextFamilyKey
    );
    const nextVisibleOptions =
      matchingOptions.length > 0 ? matchingOptions : importedModelOptions;
    const productExists = nextVisibleOptions.some(
      (option) => option.id === selectedImportedProductId
    );
    const nextProductId = productExists
      ? selectedImportedProductId
      : nextVisibleOptions[0]?.id ?? "";

    if (nextProductId !== selectedImportedProductId) {
      setSelectedImportedProductId(nextProductId);
    }
  }, [
    importedFamilyOptions,
    importedModelOptions,
    selectedImportedFamilyKey,
    selectedImportedProductId,
  ]);

  useEffect(() => {
    if (importedModelOptions.length === 0) return;

    let injectedAny = false;
    for (const option of importedModelOptions) {
      const existing = CATALOG_ITEMS[option.id];
      const isImportedExisting = Boolean(
        existing && String(existing.defaultVariantId ?? "").startsWith("imported-")
      );
      if (existing && !isImportedExisting) {
        continue;
      }
      if (!shouldRefreshImportedCatalogItem(existing, option)) {
        continue;
      }
      ensureImportedCatalogItem(option.id);
      injectedAny = true;
    }

    // Force a render pass so CatalogPanel/quick-add reflect newly injected items.
    if (injectedAny) {
      setImportedModelOptions((prev) => [...prev]);
    }
  }, [ensureImportedCatalogItem, importedModelOptions]);

  const getRelatedImportedProductIds = useCallback((productId: string) => {
    const related = new Set<string>([productId]);

    const family = MODEL_FAMILY_BY_PRODUCT_ID[productId] ?? [];
    for (const id of family) related.add(id);

    const armOptions = ARM_STYLE_OPTIONS_BY_PRODUCT_ID[productId] ?? [];
    for (const option of armOptions) {
      if (option.productId) related.add(option.productId);
    }

    const lengthOpts = LENGTH_OPTIONS_BY_PRODUCT_ID[productId] ?? [];
    for (const option of lengthOpts) {
      if (option.productId) related.add(option.productId);
    }

    const modelSelector = MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[productId] ?? [];
    for (const id of modelSelector) related.add(id);

    const orientationOpts = ORIENTATION_OPTIONS_BY_PRODUCT_ID[productId] ?? [];
    for (const option of orientationOpts) {
      if (option.productId) related.add(option.productId);
    }

    const source = importedModelOptions.find((opt) => opt.id === productId);
    const sourceFamilyRaw = source?.catalog?.productFamily ?? "";
    const sourceFamily = normalizeImportedFamilyName(sourceFamilyRaw).toLowerCase();
    const linkedProducts = source?.catalog?.compatibility?.related_products ?? [];
    const linkedNames = linkedProducts
      .map((entry) => String(entry?.product_name ?? "").trim().toLowerCase())
      .filter(Boolean);
    for (const option of importedModelOptions) {
      const optionFamilyRaw = option.catalog?.productFamily ?? "";
      const optionFamily = normalizeImportedFamilyName(optionFamilyRaw).toLowerCase();
      const optionName = option.catalog?.productName?.trim().toLowerCase();
      if (sourceFamily && optionFamily === sourceFamily) {
        related.add(option.id);
        continue;
      }
      if (optionName && linkedNames.includes(optionName)) {
        related.add(option.id);
      }
    }

    return Array.from(related);
  }, [importedModelOptions]);

  const addSelectedImportedToRoom = useCallback(() => {
    if (!selectedImportedProductId) return;
    const related = getRelatedImportedProductIds(selectedImportedProductId);
    related.forEach((id) => ensureImportedCatalogItem(id));
    addCatalogItemToRoom(selectedImportedProductId);
  }, [
    addCatalogItemToRoom,
    ensureImportedCatalogItem,
    getRelatedImportedProductIds,
    selectedImportedProductId,
  ]);

  // Add item to temporary cart (drawer panel)
  const addItemToCart = useCallback(
    (productId: string, _categoryHint?: string) => {
      // For category hints, pick best item from that category
      let selectedProductId = productId;
      
      if (!productId && _categoryHint) {
        const candidates = Object.values(CATALOG_ITEMS).filter(
          (p) => p.category === _categoryHint
        );
        if (candidates.length === 0) return;
        selectedProductId = candidates[0].id;
      }

      const product = CATALOG_ITEMS[selectedProductId];
      if (!product) return;

      // Check if item already in cart
      const existing = itemCart.find((i) => i.productId === selectedProductId);
      if (existing) {
        // Increase quantity
        setItemCart((prev) =>
          prev.map((i) =>
            i.productId === selectedProductId
              ? { ...i, qty: i.qty + 1 }
              : i
          )
        );
      } else {
        // Add new item
        setItemCart((prev) => [
          ...prev,
          {
            id: `${selectedProductId}-${Date.now()}`,
            productId: selectedProductId,
            title: product.title,
            qty: 1,
            thumbUrl: product.assets.thumbUrl,
          },
        ]);
      }
    },
    [itemCart]
  );

  const removeFromCart = useCallback((productId: string) => {
    setItemCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateCartQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
    } else {
      setItemCart((prev) =>
        prev.map((i) =>
          i.productId === productId ? { ...i, qty } : i
        )
      );
    }
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItemCart([]);
  }, []);

  const addAllToRoom = useCallback(() => {
    // Add all items from cart to the room
    itemCart.forEach((cartItem) => {
      for (let i = 0; i < cartItem.qty; i++) {
        addCatalogItemToRoom(cartItem.productId);
      }
    });
    clearCart();
    setItemCartOpen(false);
  }, [itemCart, addCatalogItemToRoom, clearCart]);

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

  useEffect(() => {
    if (items.length < 1 || firstItemFunnelTrackedRef.current) return;

    const firstItem = items[items.length - 1];
    const firstProduct = CATALOG_ITEMS[firstItem.productId];
    const meta = {
      itemType: firstProduct?.category ?? "unknown",
      isGuest: !session?.user,
      mode,
    };

    if (!onboardingState.enabled) {
      track("first_item_added", {
        design_id: designId,
        ...meta,
      });
    }

    logFunnelEvent("first_item_added", meta);
    firstItemFunnelTrackedRef.current = true;
  }, [items, onboardingState.enabled, session?.user, mode, designId, logFunnelEvent]);

  useEffect(() => {
    if (items.length < 3 || thirdItemTrackedRef.current) return;

    track("third_item_added", {
      design_id: designId,
      isGuest: !session?.user,
      mode,
      items_count: items.length,
    });
    logFunnelEvent("third_item_added", {
      isGuest: !session?.user,
      mode,
      items_count: items.length,
    });
    thirdItemTrackedRef.current = true;
  }, [items.length, designId, logFunnelEvent, mode, session?.user]);

  // Step 2: First sofa placed → auto-create seating zone + show affirmation + queue ghosts
  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step !== "prompt_add_sofa") return;

    const sofaItem = items.find((item) => {
      const catalogItem = CATALOG_ITEMS[item.productId];
      return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
    });
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

    const sofaItem = items.find((item) => {
      const catalogItem = CATALOG_ITEMS[item.productId];
      return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
    });
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
        const sofaItem = items.find((item) => {
          const catalogItem = CATALOG_ITEMS[item.productId];
          return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
        });
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

  const applyItemRotation = useCallback(
    (
      id: string,
      targetRotationY: number,
      options?: {
        snap?: boolean;
        actionLabel?: string;
        source?: "keyboard" | "handle" | "inspector" | "canvas";
      }
    ) => {
      try {
        trackFirstInteraction();
        const shouldSnap = options?.snap ?? true;
        const resolvedRotationY = shouldSnap && rotationSnapEnabled
          ? snapRotationRadians(targetRotationY, rotationSnapStepRadians)
          : targetRotationY;
        const selectedSet = selectedIdsRef.current;
        const isGroupRotate = selectedSet.size > 1 && selectedSet.has(id);
        const source = options?.source ?? "canvas";
        if (!isGroupRotate) {
          const previous = itemsRef.current.find((x) => x.instanceId === id)?.rotationY ?? 0;
          commitItems(
            (prev: PlacedItem[]) =>
              prev.map((x) =>
                x.instanceId === id ? { ...x, rotationY: resolvedRotationY } : x
              ),
            options?.actionLabel ?? "Rotate item"
          );
          track("editor_item_rotated", {
            source,
            snapped: shouldSnap,
            selectionType: "single",
            deltaDeg: Number(radiansToDeg(resolvedRotationY - previous).toFixed(2)),
          });
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
        const deltaRot = resolvedRotationY - (mover.rotationY ?? 0);

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
          const nextPos: [number, number, number] = [safeX, item.position[1] ?? 0, safeZ];
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

        commitItems(nextItems, options?.actionLabel ?? "Rotate group");
        track("editor_item_rotated", {
          source,
          snapped: shouldSnap,
          selectionType: "group",
          selectionSize: movableIds.size,
          deltaDeg: Number(radiansToDeg(deltaRot).toFixed(2)),
        });
        const results = evaluateConstraints({
          design: { items: itemsRef.current },
          movedItemId: id,
          room: { width: roomWidth, depth: roomDepth, wallThickness },
        });
        showConstraintsForMoment(results);
        showConfidenceSummary(results);
        return true;
      } catch (error) {
        console.error("[Editor] applyItemRotation failed", {
          id,
          targetRotationY,
          options,
          error,
        });
        return false;
      }
    },
    [
      commitItems,
      evaluateConstraints,
      isDesigner,
      rotationSnapEnabled,
      rotationSnapStepRadians,
      roomDepth,
      roomWidth,
      showConfidenceSummary,
      showConstraintsForMoment,
      trackFirstInteraction,
      wallThickness,
    ]
  );

  const selectedRotationDegrees = useMemo(() => {
    if (!selectedItem) return 0;
    return normalizeRotationDegrees(radiansToDeg(selectedItem.rotationY ?? 0));
  }, [selectedItem]);
  const rotateControlsDisabled =
    !canEdit || (isDesigner && selectedIds.size <= 1 && Boolean(selectedItem?.locked));

  useEffect(() => {
    if (!selectedItem) {
      setRotationInputValue("0");
      return;
    }
    setRotationInputValue(String(selectedRotationDegrees));
  }, [selectedItem, selectedRotationDegrees]);

  const rotateSelectedByDegrees = useCallback(
    (deltaDegrees: number) => {
      if (!selectedItem) return;
      const deltaRadians = (deltaDegrees * Math.PI) / 180;
      applyItemRotation(
        selectedItem.instanceId,
        (selectedItem.rotationY ?? 0) + deltaRadians,
        {
          actionLabel: `Rotate ${deltaDegrees > 0 ? "+" : ""}${deltaDegrees}°`,
          source: "inspector",
        }
      );
    },
    [applyItemRotation, selectedItem]
  );

  const resetSelectedRotation = useCallback(() => {
    if (!selectedItem) return;
    applyItemRotation(selectedItem.instanceId, 0, {
      actionLabel: "Reset rotation",
      source: "inspector",
    });
  }, [applyItemRotation, selectedItem]);

  const setSelectedRotationDegrees = useCallback(
    (degrees: number, snap: boolean, actionLabel: string) => {
      if (!selectedItem) return;
      const radians = (degrees * Math.PI) / 180;
      const accepted = applyItemRotation(selectedItem.instanceId, radians, {
        snap,
        actionLabel,
        source: "inspector",
      });
      if (accepted !== false) {
        setRotationInputValue(String(normalizeRotationDegrees(degrees)));
      }
    },
    [applyItemRotation, selectedItem]
  );

  const applyRotationInputValue = useCallback(() => {
    if (!selectedItem) return;
    const parsed = Number(rotationInputValue);
    if (!Number.isFinite(parsed)) {
      setRotationInputValue(String(selectedRotationDegrees));
      return;
    }
    setSelectedRotationDegrees(parsed, false, `Set rotation to ${parsed}°`);
  }, [rotationInputValue, selectedItem, selectedRotationDegrees, setSelectedRotationDegrees]);

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
          <CanvasErrorBoundary>
          <Canvas
            data-testid="scene-canvas"
            shadows={false}
            dpr={[1, 2]}
            gl={{
              antialias: true,
              outputColorSpace: THREE.SRGBColorSpace,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: lightConfig.exposure ?? 1,
            }}
            camera={{ position: [4.5, 3.2, 5.5], fov: 45, near: 0.1, far: 100 }}
            onCreated={({ gl }) => {
              (gl as THREE.WebGLRenderer & { physicallyCorrectLights?: boolean }).physicallyCorrectLights = true;
            }}
            onPointerMissed={() => clearAllSelection()}
          >
            <EditorCamera2D
              active={viewMode === "2d"}
              roomWidth={roomWidth}
              roomDepth={roomDepth}
              roomHeight={roomHeight}
            />
            <color attach="background" args={["#ffffff"]} />
            <LoadingOverlay />
            <SceneProgressBridge onReadyChange={setSceneReady} />
            <Suspense fallback={null}>
              <Environment resolution={128}>
                <Lightformer
                  intensity={0.9}
                  color={lightConfig.keyColor ?? "#ffffff"}
                  position={[5, 6, 4]}
                  rotation={[0, Math.PI / 4, 0]}
                  scale={[8, 8, 1]}
                />
                <Lightformer
                  intensity={0.45}
                  color={lightConfig.fillColor ?? "#f1f4f8"}
                  position={[-4, 3, -3]}
                  rotation={[0, -Math.PI / 6, 0]}
                  scale={[6, 6, 1]}
                />
              </Environment>
            </Suspense>
            {/* Apply lighting preset */}
            <ambientLight
              color={lightConfig.ambientColor ?? "#f6f6f4"}
              intensity={lightConfig.ambientIntensity}
            />
            <ambientLight
              color="#ffffff"
              intensity={0.24}
            />
            <directionalLight
              position={[5, 7, 4]}
              color={lightConfig.keyColor ?? "#ffffff"}
              intensity={lightConfig.keyIntensity ?? lightConfig.directionalIntensity}
            />
            <directionalLight
              position={[-4, 4, -3]}
              color={lightConfig.fillColor ?? "#f1f4f8"}
              intensity={lightConfig.fillIntensity ?? lightConfig.directionalIntensity * 0.5}
            />

            <Suspense fallback={<RoomSkeleton />}>
              {viewMode === "2d" ? (
                <RoomRenderer2D
                  width={roomWidth}
                  depth={roomDepth}
                  measurementUnit={planMeasurementUnit}
                  theme={planTheme}
                  showGrid={planLayers.grid}
                  showDimensions={planLayers.dimensions}
                  showOpenings={planLayers.openings}
                  showBuiltIns={planLayers.builtIns}
                  showAnnotations={planLayers.annotations}
                  showZones={planLayers.zones}
                  interactive={editorMode !== "present"}
                  selectedOverlayId={selectedPlanOverlayId}
                  onSelectOverlay={setSelectedPlanOverlayId}
                  onMoveOpening={handleMoveOpening2D}
                  onMoveFixedElement={handleMoveFixedElement2D}
                  onMoveAnnotation={handleMoveAnnotation2D}
                  openings={editorScene2D.openings.map((opening) => ({
                    id: opening.id,
                    wall: opening.wall,
                    kind: opening.kind,
                    offset: mmToMeters(opening.offsetMm),
                    width: mmToMeters(opening.widthMm),
                  }))}
                  fixedElements={editorScene2D.fixedElements.map((fixed) => ({
                    id: fixed.id,
                    x: mmToMeters(fixed.xMm),
                    z: mmToMeters(fixed.zMm),
                    w: mmToMeters(fixed.widthMm),
                    d: mmToMeters(fixed.depthMm),
                    label: fixed.label,
                  }))}
                  annotations={editorScene2D.annotations.map((note) => ({
                    id: note.id,
                    x: mmToMeters(note.xMm),
                    z: mmToMeters(note.zMm),
                    text: note.text,
                    kind: note.kind,
                    anchorX: note.anchorXMm !== undefined ? mmToMeters(note.anchorXMm) : undefined,
                    anchorZ: note.anchorZMm !== undefined ? mmToMeters(note.anchorZMm) : undefined,
                  }))}
                  zones={planZones2D}
                />
              ) : (
                <Room
                  width={roomWidth}
                  depth={roomDepth}
                  height={roomHeight}
                  wallThickness={wallThickness}
                />
              )}

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
                const effectiveVariantId =
                  it.instanceId === selectedInstanceId && previewVariantId
                    ? previewVariantId
                    : it.variantId;
                const variant =
                  product.variants.find((v) => v.id === effectiveVariantId) ??
                  product.variants[0];
                const configuredVisualDims = resolveConfiguredVisualDimsMm(it, product);
                const configuredPlanningDims = resolveConfiguredPlanningDimsMm(it, product);
                const configuredModelUrl = resolveConfiguredModelUrl(
                  it,
                  product.assets.modelUrl,
                  variant.id
                );
                const configuredNodeTransforms = resolveConfiguredNodeTransforms(it);
                const effectiveProduct =
                  configuredVisualDims.w === product.dimsMm.w &&
                  configuredVisualDims.d === product.dimsMm.d &&
                  configuredVisualDims.h === product.dimsMm.h &&
                  configuredModelUrl === product.assets.modelUrl
                    ? product
                    : {
                        ...product,
                        dimsMm: configuredVisualDims,
                        dimensionsMm: configuredVisualDims,
                        bounds: {
                          type: "aabb" as const,
                          size: {
                            w: configuredVisualDims.w / 1000,
                            d: configuredVisualDims.d / 1000,
                            h: configuredVisualDims.h / 1000,
                          },
                          center: [0, configuredVisualDims.h / 2000, 0] as [number, number, number],
                        },
                        assets: {
                          ...product.assets,
                          modelUrl: configuredModelUrl ?? product.assets.modelUrl,
                        },
                      };
                const effectiveMaterialPreset =
                  it.instanceId === selectedInstanceId && previewMaterialPresetId
                    ? previewMaterialPresetId
                    : it.materialPreset;

                return (
                  <Furniture
                    key={it.instanceId}
                    data-testid="item-in-scene"
                    product={effectiveProduct}
                    variantColor={variant.colorHex}
                    variantName={variant.label}
                    variantId={variant.id}
                    variantRenderAssets={variant.renderAssets}
                    planningBoundsMm={configuredPlanningDims}
                    nodeTransforms={configuredNodeTransforms ?? undefined}
                    initialPosition={it.position}
                    initialRotationY={it.rotationY ?? 0}
                    roomWidth={roomWidth}
                    roomDepth={roomDepth}
                    wallThickness={wallThickness}
                    onDraggingChange={handleDraggingChange}
                    walls={walls}
                    instanceId={it.instanceId}
                    isSelected={editorMode !== "present" && selectedIds.has(it.instanceId)}
                    isPrimarySelected={it.instanceId === selectedInstanceId}
                    rotationSnapStepRadians={rotationSnapStepRadians}
                    rotationSnapStepDegrees={rotationSnapStepDegrees}
                    rotationSnapEnabled={rotationSnapEnabled}
                    showGuidesAndMeasurements={editorMode === "design" || editorMode === "adjust"}
                    cartPreviewed={editorMode === "buy" && hoveredCartInstanceId === it.instanceId}
                    viewMode={viewMode}
                    planShowLabels={planLayers.labels}
                    planShowDimensions={planLayers.dimensions}
                    planMeasurementUnit={planMeasurementUnit}
                    onSelect={(id: string, additive: boolean) => {
                      if (editorMode === "buy" || editorMode === "present") return;
                      trackFirstInteraction();
                      handleSelect(id, additive);
                    }}
                    onMove={(id: string, pos: [number, number, number]) => {
                      try {
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
                      } catch (error) {
                        console.error("[Editor] onMove handler failed", { id, pos, error });
                        return false;
                      }
                    }}
                    onRotate={(id: string, rotY: number, meta) =>
                      applyItemRotation(id, rotY, {
                        source: meta?.source ?? "canvas",
                        snap: meta?.snap,
                      })
                    }
                    locked={it.locked}
                    interactive={canEdit}
                    showSelection={canEdit}
                    showLocks={isDesigner && !isClientPreview}
                    onSnapPulse={triggerGridPulse}
                    enableSnap={snapEnabled && !isClientPreview}
                    items={items}
                    itemPlanningBoundsByInstanceId={itemPlanningBoundsByInstanceId}
                    materialPreset={effectiveMaterialPreset}
                    materialOverrides={it.materialOverrides}
                    onDragEnd={(id: string, pos: [number, number, number]) => {
                      try {
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
                      } catch (error) {
                        console.error("[Editor] onDragEnd handler failed", { id, pos, error });
                      }
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

            {viewMode === "2d" ? (
              <MapControls
                ref={orbitControlsRef}
                target={[0, 0, 0]}
                enableDamping
                dampingFactor={0.08}
                enablePan={!isClientPreview}
                enableZoom={!isClientPreview}
                enableRotate={false}
                screenSpacePanning
                enabled={!sofaDragging}
              />
            ) : (
              <OrbitControls
                ref={orbitControlsRef}
                target={[0, 1.1, 0]}
                enableDamping
                dampingFactor={0.08}
                enablePan={!isClientPreview}
                enableZoom={!isClientPreview}
                enableRotate={!isClientPreview}
                rotateSpeed={0.8}
                minDistance={2.5}
                maxDistance={10}
                minPolarAngle={0.02}
                maxPolarAngle={Math.PI - 0.02}
                enabled={!sofaDragging}
                onChange={() => {
                  if (!isCameraAnimatingRef.current) {
                    updateCameraViewFromScene();
                  }
                }}
              />
            )}
          </Canvas>
          </CanvasErrorBoundary>

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
              data-testid="designer-mode-toggle"
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
          className={`absolute right-4 top-20 z-20 w-[340px] max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 space-y-4 transition-opacity duration-300 ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
          <div
            className={
              showDesignerTheme
                ? "sticky top-0 z-30 rounded-lg border border-white/15 bg-[#12151dcc] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200 backdrop-blur"
                : "sticky top-0 z-30 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700 backdrop-blur"
            }
          >
            Cart & Buy
          </div>
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
          className={`absolute right-4 top-20 z-20 w-[320px] md:w-[340px] max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 transition-opacity duration-300 ${
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
              <div
                className={
                  showDesignerTheme
                    ? "sticky top-0 z-20 -mx-4 mb-2 border-b border-white/15 bg-[#12151dcc] px-4 py-2 backdrop-blur"
                    : "sticky top-0 z-20 -mx-4 mb-2 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur"
                }
              >
                Selected Item
              </div>
            </div>

            <div className="mt-2 space-y-1.5">
              {selectedBrand ? (
                <>
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary text-xs font-semibold uppercase tracking-[0.08em]"
                        : "text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500"
                    }
                  >
                    {selectedBrand}
                  </div>
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-primary text-base font-semibold"
                        : "text-base font-semibold text-neutral-900"
                    }
                  >
                    {selectedModelTitle}
                  </div>
                </>
              ) : (
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-base font-semibold"
                      : "text-base font-semibold text-neutral-900"
                  }
                >
                  {selectedProduct.title}
                </div>
              )}
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
                <div className="flex flex-wrap gap-2">
                  <button
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary rounded-md border border-white/15 px-2 py-1 text-xs hover:text-white"
                        : "rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                    }
                    onClick={() => setShowInspectorDetails((v) => !v)}
                  >
                    {showInspectorDetails ? "Hide details" : "Show details"}
                  </button>
                  <button
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary rounded-md border border-white/15 px-2 py-1 text-xs hover:text-white disabled:opacity-40"
                        : "rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                    }
                    disabled={!fullDimensionsDetails?.length}
                    onClick={() => setShowFullDimensions((v) => !v)}
                    title={
                      fullDimensionsDetails?.length
                        ? "Show full dimensions"
                        : "Full dimensions dataset not added for this item yet"
                    }
                  >
                    {showFullDimensions ? "Hide full dimensions" : "Full dimensions"}
                  </button>
                  {selectedItem ? (
                    <button
                      className={
                        showDesignerTheme
                          ? "designer-text-secondary rounded-md border border-white/15 px-2 py-1 text-xs hover:text-white"
                          : "rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                      }
                      aria-expanded={showRotationControls}
                      data-testid="rotation-controls-toggle"
                      onClick={() => setShowRotationControls((value) => !value)}
                    >
                      {showRotationControls ? "Hide rotation" : "Rotation"}
                    </button>
                  ) : null}
                </div>
              </div>

              {showInspectorDetails && (
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-2 space-y-1 text-sm"
                      : "mt-2 space-y-1 text-sm text-neutral-900"
                  }
                >
                  <div>ID: {selectedProduct.id}</div>
                  <div>Price: {formatMoney(getItemPrice(selectedProduct))}</div>
                  <div>
                    Size: {selectedProduct.dimsMm.w / 1000}m × {selectedProduct.dimsMm.d / 1000}m × {selectedProduct.dimsMm.h / 1000}m
                  </div>
                  <div
                    className={
                      showDesignerTheme
                        ? "mt-3 space-y-2 rounded-lg border border-white/15 bg-white/5 p-3"
                        : "mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                    }
                  >
                    <div
                      className={
                        showDesignerTheme
                          ? "designer-text-primary text-xs font-semibold uppercase tracking-[0.08em]"
                          : "text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700"
                      }
                    >
                      Debug metadata
                    </div>
                    <div className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1 text-xs">
                      <div>Brand</div>
                      <div>{selectedBrand ?? "-"}</div>
                      <div>Model</div>
                      <div>{selectedModelLabel ?? selectedModelTitle ?? "-"}</div>
                      <div>Category</div>
                      <div>{selectedCategoryDebugLabel ?? "-"}</div>
                      <div>Variant</div>
                      <div>{activeVariantLabel ?? "-"}</div>
                      <div>Colour</div>
                      <div>{activeVariantColorHex ?? "-"}</div>
                      <div>Asset ID</div>
                      <div>{selectedProduct.assets.assetId ?? "-"}</div>
                      <div>Model URL</div>
                      <div className="break-all">{selectedProduct.assets.modelUrl ?? "-"}</div>
                    </div>
                  </div>
                </div>
              )}

              {showFullDimensions && fullDimensionsDetails?.length ? (
                <div
                  className={
                    showDesignerTheme
                      ? "mt-2 space-y-2 rounded-lg border border-white/15 bg-white/5 p-3"
                      : "mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                  }
                >
                  {fullDimensionsDetails.map((detail) => (
                    <div key={detail.label} className="grid grid-cols-[140px_1fr] gap-2">
                      <div
                        className={
                          showDesignerTheme
                            ? "designer-text-secondary text-xs"
                            : "text-xs text-neutral-600"
                        }
                      >
                        {detail.label}:
                      </div>
                      <div
                        className={
                          showDesignerTheme
                            ? "designer-text-primary text-xs"
                            : "text-xs text-neutral-900"
                        }
                      >
                        {detail.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {selectedItem ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Rotation
                </div>
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-1 text-xs"
                      : "mt-1 text-xs text-neutral-600"
                  }
                  data-testid="rotation-angle-label"
                >
                  Angle {selectedRotationDegrees} deg ({rotationSnapEnabled ? `snap ${rotationSnapStepDegrees} deg` : "free"})
                </div>
                {showRotationControls ? (
                  <>
                    <div
                      className={
                        showDesignerTheme
                          ? "designer-text-secondary mt-2 text-[11px]"
                          : "mt-2 text-[11px] text-neutral-500"
                      }
                    >
                      Snap locks rotation to common angles. Disable for fine control.
                    </div>
                    {isDesigner ? (
                      <div
                        className={
                          showDesignerTheme
                            ? "designer-text-secondary mt-1 text-xs"
                            : "mt-1 text-xs text-neutral-500"
                        }
                      >
                        Pro tip: hold Option/Alt while dragging the rotate handle for free rotation.
                      </div>
                    ) : null}
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        data-testid="rotation-snap-preset-15"
                        className={`rounded-lg border px-2 py-1.5 text-xs ${
                          rotationSnapPresetDegrees === 15
                            ? "designer-accent-border"
                            : showDesignerTheme
                              ? "border-white/15"
                              : "border-neutral-200 text-neutral-800"
                        }`}
                        disabled={rotateControlsDisabled}
                        title="Snap to coarse 15° increments for quick positioning"
                        onClick={() => setRotationSnapPresetDegrees(15)}
                      >
                        Quick Turns
                      </button>
                      <button
                        data-testid="rotation-snap-preset-5"
                        className={`rounded-lg border px-2 py-1.5 text-xs ${
                          rotationSnapPresetDegrees === 5
                            ? "designer-accent-border"
                            : showDesignerTheme
                              ? "border-white/15"
                              : "border-neutral-200 text-neutral-800"
                        }`}
                        disabled={rotateControlsDisabled}
                        title="Snap to fine 5° increments for precise angle control"
                        onClick={() => setRotationSnapPresetDegrees(5)}
                      >
                        Precise Angle
                      </button>
                      <button
                        data-testid="rotation-snap-preset-free"
                        className={`rounded-lg border px-2 py-1.5 text-xs ${
                          rotationSnapPresetDegrees === 0
                            ? "designer-accent-border"
                            : showDesignerTheme
                              ? "border-white/15"
                              : "border-neutral-200 text-neutral-800"
                        }`}
                        disabled={rotateControlsDisabled}
                        title="Disable snap for unrestricted rotation"
                        onClick={() => setRotationSnapPresetDegrees(0)}
                      >
                        Free Rotate
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      <button
                        data-testid="rotation-btn-step-negative"
                        className={
                          showDesignerTheme
                            ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                            : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                        }
                        disabled={rotateControlsDisabled}
                        title={`Rotate left by ${rotationSnapStepDegrees} degrees`}
                        aria-keyshortcuts="q"
                        onClick={() => rotateSelectedByDegrees(-rotationSnapStepDegrees)}
                      >
                        -{rotationSnapStepDegrees} deg
                      </button>
                      <button
                        data-testid="rotation-btn-step-positive"
                        className={
                          showDesignerTheme
                            ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                            : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                        }
                        disabled={rotateControlsDisabled}
                        title={`Rotate right by ${rotationSnapStepDegrees} degrees`}
                        aria-keyshortcuts="e"
                        onClick={() => rotateSelectedByDegrees(rotationSnapStepDegrees)}
                      >
                        +{rotationSnapStepDegrees} deg
                      </button>
                      <button
                        data-testid="rotation-btn-quarter-turn"
                        className={
                          showDesignerTheme
                            ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                            : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                        }
                        disabled={rotateControlsDisabled}
                        title="Rotate right by 90 degrees"
                        aria-keyshortcuts="r"
                        onClick={() => rotateSelectedByDegrees(90)}
                      >
                        +90 deg
                      </button>
                      <button
                        data-testid="rotation-btn-reset"
                        className={
                          showDesignerTheme
                            ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                            : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                        }
                        disabled={rotateControlsDisabled}
                        title="Reset rotation to 0 degrees"
                        aria-keyshortcuts="0"
                        onClick={resetSelectedRotation}
                      >
                        Reset
                      </button>
                    </div>
                    {isDesigner ? (
                      <>
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          <button
                            className={
                              showDesignerTheme
                                ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                                : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                            }
                            disabled={rotateControlsDisabled}
                            onClick={() => rotateSelectedByDegrees(-1)}
                          >
                            -1 deg
                          </button>
                          <button
                            className={
                              showDesignerTheme
                                ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                                : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                            }
                            disabled={rotateControlsDisabled}
                            onClick={() => rotateSelectedByDegrees(1)}
                          >
                            +1 deg
                          </button>
                          <button
                            className={
                              showDesignerTheme
                                ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                                : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                            }
                            disabled={rotateControlsDisabled}
                            onClick={() => rotateSelectedByDegrees(-5)}
                          >
                            -5 deg
                          </button>
                          <button
                            className={
                              showDesignerTheme
                                ? "rounded-lg border border-white/15 px-2 py-2 text-xs"
                                : "rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-800"
                            }
                            disabled={rotateControlsDisabled}
                            onClick={() => rotateSelectedByDegrees(5)}
                          >
                            +5 deg
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            data-testid="rotation-input"
                            className={
                              showDesignerTheme
                                ? "w-full rounded-lg border border-white/15 bg-transparent px-2 py-1.5 text-xs"
                                : "w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900"
                            }
                            type="number"
                            step="0.1"
                            value={rotationInputValue}
                            disabled={rotateControlsDisabled}
                            onChange={(e) => setRotationInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyRotationInputValue();
                              }
                            }}
                            onBlur={applyRotationInputValue}
                            aria-label="Exact rotation angle in degrees"
                          />
                          <button
                            data-testid="rotation-input-apply"
                            className={
                              showDesignerTheme
                                ? "rounded-lg border border-white/15 px-3 py-1.5 text-xs"
                                : "rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-800"
                            }
                            disabled={rotateControlsDisabled}
                            onClick={applyRotationInputValue}
                          >
                            Apply
                          </button>
                        </div>
                      </>
                    ) : null}
                    <div
                      className={
                        showDesignerTheme
                          ? "designer-text-secondary mt-2 text-[11px]"
                          : "mt-2 text-[11px] text-neutral-500"
                      }
                      data-testid="rotation-shortcut-hint"
                    >
                      Shortcuts: R +90 deg, Shift+R -90 deg, Q/E -/+{rotationSnapStepDegrees} deg, 0 reset
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {orientationOptions?.length ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Orientation
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {orientationOptions.map((option) => {
                    const active = option.productId === selectedProduct.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={`orientation-${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct.id) return;

                          ensureImportedCatalogItem(option.productId);
                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariant = selectedProduct.variants.find(
                                (variant) => variant.id === current?.variantId
                              );
                              const currentFinishCode = String(
                                currentVariant?.finishCode ?? ""
                              )
                                .trim()
                                .toLowerCase();
                              const currentLabel = String(currentVariant?.label ?? "")
                                .trim()
                                .toLowerCase();
                              const nextVariant =
                                optionProduct.variants.find((variant) =>
                                  currentFinishCode
                                    ? String(variant.finishCode ?? "")
                                        .trim()
                                        .toLowerCase() === currentFinishCode
                                    : false
                                ) ??
                                optionProduct.variants.find(
                                  (variant) =>
                                    String(variant.label ?? "")
                                      .trim()
                                      .toLowerCase() === currentLabel
                                ) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change orientation to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {armStyleOptions?.length ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Variant
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {armStyleOptions.map((option) => {
                    const active = option.productId === selectedProduct.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={option.label}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct.id) return;

                          ensureImportedCatalogItem(option.productId);
                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change variant to ${option.label}`
                          );
                        }}
                        title={
                          option.productId
                            ? option.label
                            : `${option.label} (model not added yet)`
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {showVariantsSection ? (
              <div className="pt-2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-primary text-sm font-semibold"
                    : "text-sm font-semibold text-neutral-900"
                }
              >
                {hasStructuredVariantLabels ? "Model" : "Variants"}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {hasStructuredVariantLabels ? (
                  modelSelectorProductIds.map((productId) => {
                    const optionProduct = CATALOG_ITEMS[productId];
                    if (!optionProduct) return null;
                    const active = optionProduct.id === selectedModelProductId;
                    const casaWidthMatch = optionProduct.id.match(/(?:casa|seb|sloane)-tv-console-(\d+)/i);
                    const optionLabel =
                      (casaWidthMatch ? `${casaWidthMatch[1]}CM` : null) ??
                      optionProduct.metadata?.modelLabel ??
                      optionProduct.title.match(/(\d+\s*Seater)/i)?.[1] ??
                      "Standard";

                    return (
                      <button
                        key={optionProduct.id}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={!canEdit}
                        onClick={() => {
                          if (!selectedItem) return;
                          if (optionProduct.id === selectedProduct.id) return;

                          ensureImportedCatalogItem(optionProduct.id);

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change model to ${optionLabel}`
                          );
                        }}
                        title={optionLabel}
                      >
                        {optionLabel}
                      </button>
                    );
                  })
                ) : useShapeOptionsAsVariants ? (
                  (shapeOptions ?? []).map((option) => {
                    const active = option.productId === selectedProduct?.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={`variant-shape-${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct?.id) return;

                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change variant to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })
                ) : useLengthOptionsAsVariants ? (
                  (lengthOptions ?? []).map((option) => {
                    const active = option.productId === selectedProduct?.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={`variant-length-${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct?.id) return;

                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change variant to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })
                ) : (
                  isSloaneBenchSelected ? (
                    [
                      { key: "no" as const, label: "No Cushion", colorHex: "#9c9c9c" },
                      { key: "leather" as const, label: "Leather Cushion", colorHex: "#8a643f" },
                    ].map((option) => {
                      const active = activeSelectedBenchCushion === option.key;
                      return (
                        <button
                          key={`variant-swatch-sloane-bench-${option.key}`}
                          data-testid={`variant-swatch-sloane-bench-${option.key}`}
                          data-active={active ? "true" : "false"}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            showDesignerTheme
                              ? "designer-text-primary"
                              : "text-neutral-900"
                          } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                          onClick={() => {
                            if (!selectedItem) return;
                            const targetProductId = getSloaneBenchProductId(activeSelectedBenchSize, option.key);
                            ensureImportedCatalogItem(targetProductId);
                            const optionProduct = CATALOG_ITEMS[targetProductId];
                            if (!optionProduct) return;

                            commitItems(
                              (prev) =>
                                prev.map((it) =>
                                  it.instanceId === selectedItem.instanceId
                                    ? {
                                        ...it,
                                        productId: optionProduct.id,
                                        variantId: optionProduct.defaultVariantId,
                                      }
                                    : it
                                ),
                              `Change variant to ${option.label}`
                            );
                          }}
                        >
                          <span
                            className="h-5 w-5 rounded-full border"
                            style={{ background: option.colorHex }}
                          />
                          {option.label}
                        </button>
                      );
                    })
                  ) : (
                    selectedProduct.variants.map((v) => {
                      const active = v.id === selectedItem?.variantId;
                      return (
                        <button
                          key={v.id}
                          data-testid={`variant-swatch-${v.id}`}
                          data-active={active ? "true" : "false"}
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
                            className="h-5 w-5 rounded-full border"
                            style={{ background: v.colorHex }}
                          />
                          {v.label.replace(/^\s*\d+\s*(?:cm)?\s*/i, "").trim()}
                        </button>
                      );
                    })
                  )
                )}
              </div>
              </div>
            ) : null}

            {lengthOptions?.length && !useLengthOptionsAsVariants ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Length
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {lengthOptions.map((option) => {
                    const active = option.productId === selectedProduct.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={option.label}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct.id) return;

                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change length to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {selectedItem && selectedConfigOptions.length > 1 ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  {selectedConfigUi?.label ?? "Layout"}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedConfigOptions.map((code) => {
                    const active = code === selectedConfigurationCode;
                    const optionLabel = selectedConfigUi?.option_labels?.[code] ?? code;
                    return (
                      <button
                        key={`config-${code}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={!canEdit}
                        onClick={() => {
                          if (!selectedItem) return;
                          setItemConfigurationByInstanceId((prev) => ({
                            ...prev,
                            [selectedItem.instanceId]: code,
                          }));
                          commitItems(
                            (prev) =>
                              prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? { ...it, configurationCode: code }
                                  : it
                              ),
                            `Change layout to ${optionLabel}`
                          );
                        }}
                      >
                        {optionLabel}
                      </button>
                    );
                  })}
                </div>

                {selectedConfigUi?.helper_text ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    {selectedConfigUi.helper_text}
                  </div>
                ) : null}

                {selectedConfigEntry ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    Recommended planning size: {Math.round(Number(selectedConfigEntry.planning_bounds_cm?.width ?? selectedConfigEntry.dimensions_recommended_planning?.width_cm ?? selectedConfigEntry.placement_footprint?.planning_width_cm ?? 0))} x {Math.round(Number(selectedConfigEntry.planning_bounds_cm?.depth ?? selectedConfigEntry.dimensions_recommended_planning?.depth_cm ?? selectedConfigEntry.placement_footprint?.planning_depth_cm ?? 0))} cm
                  </div>
                ) : null}

                {selectedConfigBehavior?.affects_visual_footprint && selectedConfigEntry?.visual_bounds_cm ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-1 text-xs"
                        : "mt-1 text-xs text-neutral-600"
                    }
                  >
                    Visual footprint: {Math.round(Number(selectedConfigEntry.visual_bounds_cm.width ?? 0))} x {Math.round(Number(selectedConfigEntry.visual_bounds_cm.depth ?? 0))} cm
                  </div>
                ) : null}

                {selectedConfigEntry?.estimation_note ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    {selectedConfigEntry.estimation_note}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(isSloaneTableSelected || isSloaneBenchSelected) ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Complete the set
                </div>

                {isSloaneTableSelected ? (
                  <>
                    <div className={showDesignerTheme ? "mt-1 text-xs designer-text-secondary" : "mt-1 text-xs text-neutral-600"}>
                      Matching companion: Sloane Dining Bench
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {[150, 180].map((size) => {
                        const active = activeCompanionBenchSize === size;
                        return (
                          <button
                            key={`bench-size-${size}`}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              showDesignerTheme
                                ? "designer-text-primary"
                                : "text-neutral-900"
                            } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                            disabled={!canEdit}
                            onClick={() => {
                              const targetProductId = getSloaneBenchProductId(size as 150 | 180, activeCompanionBenchCushion);
                              ensureImportedCatalogItem(targetProductId);
                              const targetProduct = CATALOG_ITEMS[targetProductId];
                              if (!targetProduct) return;

                              if (selectedSloaneCompanionBenchItem) {
                                commitItems(
                                  (prev) =>
                                    prev.map((it) =>
                                      it.instanceId === selectedSloaneCompanionBenchItem.instanceId
                                        ? {
                                            ...it,
                                            productId: targetProduct.id,
                                            variantId: targetProduct.defaultVariantId,
                                          }
                                        : it
                                    ),
                                  `Change bench size to ${size}CM`
                                );
                                return;
                              }

                              addCatalogItemToRoom(targetProductId);
                            }}
                            title={`${size}CM`}
                          >
                            {size}CM
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { key: "no" as const, label: "No Cushion" },
                        { key: "leather" as const, label: "Leather Cushion" },
                      ].map((option) => {
                        const active = activeCompanionBenchCushion === option.key;
                        return (
                          <button
                            key={`bench-cushion-${option.key}`}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              showDesignerTheme
                                ? "designer-text-primary"
                                : "text-neutral-900"
                            } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                            disabled={!canEdit}
                            onClick={() => {
                              const targetProductId = getSloaneBenchProductId(activeCompanionBenchSize, option.key);
                              ensureImportedCatalogItem(targetProductId);
                              const targetProduct = CATALOG_ITEMS[targetProductId];
                              if (!targetProduct) return;

                              if (selectedSloaneCompanionBenchItem) {
                                commitItems(
                                  (prev) =>
                                    prev.map((it) =>
                                      it.instanceId === selectedSloaneCompanionBenchItem.instanceId
                                        ? {
                                            ...it,
                                            productId: targetProduct.id,
                                            variantId: targetProduct.defaultVariantId,
                                          }
                                        : it
                                    ),
                                  `Change bench option to ${option.label}`
                                );
                                return;
                              }

                              addCatalogItemToRoom(targetProductId);
                            }}
                            title={option.label}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}

                {isSloaneBenchSelected ? (
                  <>
                    <div className={showDesignerTheme ? "mt-1 text-xs designer-text-secondary" : "mt-1 text-xs text-neutral-600"}>
                      Matching companion: Sloane Travertine Dining Table
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { label: "180CM", productId: "dining-real-castlery-sloane-travertine-180" },
                        { label: "220CM", productId: "dining-real-castlery-sloane-travertine-220" },
                      ].map((option) => {
                        const active = option.productId === activeCompanionTableProductId;
                        return (
                          <button
                            key={option.productId}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              showDesignerTheme
                                ? "designer-text-primary"
                                : "text-neutral-900"
                            } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                            disabled={!canEdit}
                            onClick={() => {
                              ensureImportedCatalogItem(option.productId);
                              const optionProduct = CATALOG_ITEMS[option.productId];
                              if (!optionProduct) return;

                              if (selectedSloaneCompanionTableItem) {
                                commitItems(
                                  (prev) =>
                                    prev.map((it) =>
                                      it.instanceId === selectedSloaneCompanionTableItem.instanceId
                                        ? {
                                            ...it,
                                            productId: optionProduct.id,
                                            variantId: optionProduct.defaultVariantId,
                                          }
                                        : it
                                    ),
                                  `Change table size to ${option.label}`
                                );
                                return;
                              }

                              addCatalogItemToRoom(option.productId);
                            }}
                            title={option.label}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {showFinishSection ? (
              <div className="pt-3">
              <div className="flex items-center justify-between gap-2">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Material
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                {materialOptions.map((option) => {
                  const active = option.type === activeMaterialType;
                  return (
                    <button
                      key={option.type}
                      className={`min-w-[108px] rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : showDesignerTheme
                          ? "designer-text-primary border-neutral-200 bg-white hover:border-neutral-300"
                          : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400"
                      }`}
                      onClick={() => {
                        if (!selectedItem) return;
                        const target =
                          structuredVariants.find(
                            (entry) =>
                              entry.materialType === option.type &&
                              entry.colourLabel === activeColourLabel
                          ) ?? structuredVariants.find((entry) => entry.materialType === option.type);
                        if (!target) return;
                        commitItems(
                          (prev) =>
                            prev.map((it) =>
                              it.instanceId === selectedItem.instanceId
                                ? { ...it, variantId: target.variant.id }
                                : it
                            ),
                          `Change material to ${option.type}`
                        );
                      }}
                      title={option.type}
                    >
                      {option.type}
                    </button>
                  );
                })}
              </div>

              {showFabricGroupingDebug ? (
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-2 text-xs"
                      : "mt-2 text-xs text-neutral-500"
                  }
                >
                  Grouping debug: fabric={activeMaterialLabel ?? "(none)"}; colour={activeColourLabel ?? "(none)"}; variant={activeVariantLabel ?? "(none)"}
                </div>
              ) : null}
              </div>
            ) : null}

            {hasStructuredVariantLabels && !hideColourSelector && (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Colour
                </div>

                {activeStructuredVariant ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    Selected: {activeStructuredVariant.colourLabel}
                  </div>
                ) : null}

                {(() => {
                  const previewEntry = hoveredColourPreview
                    ? structuredVariants.find((x) => x.variant.id === hoveredColourPreview.variantId)
                    : null;
                  const previewGroup = previewEntry
                    ? groupedVisibleColourVariants.find((g) => g.entries.some((e) => e.variant.id === previewEntry.variant.id))
                    : null;
                  if (!previewEntry || !hoveredColourPreview) return null;

                  const previewFinishKey = String(previewEntry.variant.finishCode ?? "")
                    .trim()
                    .toLowerCase()
                    .replace(/_/g, "-");
                  const previewSwatchUrl =
                    CASTLERY_DAWSON_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishKey] ??
                    CASTLERY_DAWSON_SWATCH_IMAGE_BY_FINISH_CODE[
                      `${String(previewEntry.materialType).toLowerCase()}-${previewEntry.colourLabel
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")}`
                    ] ??
                    null;
                  const previewTitle = previewEntry.variant.finishLabel?.trim() || previewEntry.colourLabel;
                  const previewSubtitle = [previewEntry.materialType, previewGroup?.label].filter(Boolean).join(" • ");
                  const previewProfile = resolveFabricDetailProfile({
                    finishCode: previewFinishKey,
                    finishLabel: previewEntry.variant.finishLabel?.trim() || "",
                    colourLabel: previewEntry.colourLabel,
                    materialType: previewEntry.materialType,
                  });

                  return (
                    <div
                      className="pointer-events-none fixed z-[90] overflow-hidden rounded-sm shadow-2xl transition-opacity duration-150 ease-out"
                      style={{
                        left: hoveredColourPreview.x,
                        top: hoveredColourPreview.y,
                        width: 320,
                        opacity: hoveredColourPreviewVisible ? 1 : 0,
                      }}
                    >
                      <div
                        className="h-44 w-full bg-cover bg-center"
                        style={{
                          backgroundColor: previewEntry.variant.swatchHex ?? previewEntry.variant.colorHex,
                          backgroundImage: previewSwatchUrl ? `url(${previewSwatchUrl})` : undefined,
                        }}
                      />
                      <div className="space-y-1 bg-white px-4 py-3">
                        <div className="font-serif text-[18px] leading-snug text-[#4b2635]">{previewTitle}</div>
                        {previewSubtitle ? (
                          <div className="text-[12px] text-neutral-600">{previewSubtitle}</div>
                        ) : null}
                        {previewProfile ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {previewProfile.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-sm bg-[#f4f1eb] px-2 py-1 text-[11px] text-[#5b2d3c]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {previewEntry.variant.finishCode ? (
                          <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                            {previewEntry.variant.finishCode.replace(/_/g, " ")}
                          </div>
                        ) : null}
                        {previewProfile ? (
                          <>
                            <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                              {String(previewEntry.materialType).toLowerCase() === "leather"
                                ? "Leather composition"
                                : "Fabric composition"}
                            </div>
                            <div className="text-[12px] leading-snug text-neutral-700">
                              {previewProfile.composition}
                            </div>
                            <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                              Care
                            </div>
                            <div className="text-[12px] leading-snug text-neutral-700">
                              {previewProfile.care}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-2 space-y-3">
                  {groupedVisibleColourVariants.map((group) => (
                    <div key={group.key}>
                      {group.label ? (
                        <div
                          className={
                            showDesignerTheme
                              ? "designer-text-secondary mb-2 text-[15px] font-medium tracking-tight"
                              : "mb-2 text-[15px] font-medium tracking-tight text-[#4b2635]"
                          }
                        >
                          {group.label === "Stocked" ? "Stocked fabrics:" : "Custom fabrics:"}
                        </div>
                      ) : null}
                      {group.key === "custom" ? (
                        <div className="mb-2 text-[13px] text-neutral-600">
                          Create a piece made just for you in one of our custom fabrics.
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {group.entries.map((entry) => {
                          const { variant, colourLabel } = entry;
                          const active = variant.id === selectedItem?.variantId;
                          const isHovered = variant.id === hoveredColourVariantId;
                          const finishKey = String(variant.finishCode ?? "")
                            .trim()
                            .toLowerCase()
                            .replace(/_/g, "-");
                          const swatchTextureUrl =
                            CASTLERY_DAWSON_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                            CASTLERY_DAWSON_SWATCH_IMAGE_BY_FINISH_CODE[
                              `${String(entry.materialType).toLowerCase()}-${colourLabel
                                .trim()
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")}`
                            ] ??
                            null;
                          return (
                            <button
                              key={variant.id}
                              className="flex-shrink-0 h-[67px] w-[67px] rounded-sm bg-cover bg-center transition-all"
                              style={{
                                backgroundColor: variant.swatchHex ?? variant.colorHex,
                                backgroundImage: swatchTextureUrl ? `url(${swatchTextureUrl})` : undefined,
                                boxShadow: active
                                  ? "0 0 0 2px #fff, 0 0 0 4px #5a2135"
                                  : isHovered
                                  ? "0 0 0 2px #fff, 0 0 0 3px #a0a0a0"
                                  : "none",
                              }}
                              onClick={() => {
                                if (!selectedItem) return;
                                commitItems((prev) =>
                                  prev.map((it) =>
                                    it.instanceId === selectedItem.instanceId
                                      ? { ...it, variantId: variant.id }
                                      : it
                                  ),
                                  `Change colour to ${colourLabel}`
                                );
                              }}
                              onMouseEnter={(event) => {
                                if (hoveredColourPreviewHideTimerRef.current) {
                                  window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
                                  hoveredColourPreviewHideTimerRef.current = null;
                                }
                                const rect = event.currentTarget.getBoundingClientRect();
                                const cardWidth = 320;
                                const offset = 12;
                                let x = rect.right + offset;
                                if (x + cardWidth > window.innerWidth - 8) {
                                  x = Math.max(8, rect.left - cardWidth - offset);
                                }
                                const hoverProfile = resolveFabricDetailProfile({
                                  finishCode: finishKey,
                                  finishLabel: variant.finishLabel?.trim() || "",
                                  colourLabel,
                                  materialType: entry.materialType,
                                });
                                const estimatedCardHeight = hoverProfile ? 560 : 340;
                                const y = Math.max(
                                  8,
                                  Math.min(rect.top - 40, window.innerHeight - estimatedCardHeight - 8)
                                );
                                setHoveredColourVariantId(variant.id);
                                setHoveredColourPreview({ variantId: variant.id, x, y });
                                window.requestAnimationFrame(() => {
                                  setHoveredColourPreviewVisible(true);
                                });
                              }}
                              onMouseLeave={() => {
                                setHoveredColourVariantId((current) => (current === variant.id ? null : current));
                                setHoveredColourPreviewVisible(false);
                                if (hoveredColourPreviewHideTimerRef.current) {
                                  window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
                                }
                                hoveredColourPreviewHideTimerRef.current = window.setTimeout(() => {
                                  setHoveredColourPreview((current) =>
                                    current?.variantId === variant.id ? null : current
                                  );
                                  hoveredColourPreviewHideTimerRef.current = null;
                                }, 140);
                              }}
                              onFocus={() => {
                                setHoveredColourVariantId(variant.id);
                                setHoveredColourPreviewVisible(false);
                                setHoveredColourPreview(null);
                              }}
                              onBlur={() => {
                                setHoveredColourVariantId((current) => (current === variant.id ? null : current));
                                setHoveredColourPreviewVisible(false);
                                setHoveredColourPreview((current) =>
                                  current?.variantId === variant.id ? null : current
                                );
                              }}
                              aria-label={`Select ${colourLabel}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
        <div className="absolute left-4 top-20 z-20 w-[380px] max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 pb-4 space-y-4">
          <div
            className={
              showDesignerTheme
                ? "sticky top-0 z-30 rounded-lg border border-white/15 bg-[#12151dcc] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200 backdrop-blur"
                : "sticky top-0 z-30 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700 backdrop-blur"
            }
          >
            Design Controls
          </div>
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

              <button
                className={
                  showDesignerTheme
                    ? "mt-2 w-full rounded-lg border border-[#2b3245] bg-[#151820] px-4 py-2.5 text-sm font-medium text-white"
                    : "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900"
                }
                data-testid="add-imported-btn"
                onClick={addSelectedImportedToRoom}
                disabled={!selectedImportedProductId || !canEdit}
              >
                + Add Imported Furniture
              </button>

              <div className="mt-4">
                <div className="mb-4 rounded-xl bg-blue-50 p-4">
                  <div className="mb-3 text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                    Quick Add Items
                  </div>
                  <QuickAddPanel
                    onAddItem={addItemToCart}
                    categories={[
                      { label: "Coffee Table", icon: "☕", categoryKey: "coffee_table" },
                      { label: "Rug", icon: "🧶", categoryKey: "rug" },
                      { label: "Chair", icon: "🪑", categoryKey: "accent_chair" },
                      { label: "Lamp", icon: "💡", categoryKey: "floor_lamp" },
                    ]}
                  />
                  <div className="mt-3 border-t border-blue-200 pt-3">
                    <div className="mb-2 text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                      Imported Furniture
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <select
                        data-testid="imported-family-select"
                        className="w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-xs text-neutral-900"
                        value={selectedImportedFamilyKey}
                        onChange={(e) => {
                          const nextFamilyKey = e.target.value;
                          setSelectedImportedFamilyKey(nextFamilyKey);
                          const firstInFamily = importedModelOptions.find(
                            (item) => item.familyKey === nextFamilyKey
                          );
                          if (firstInFamily) {
                            setSelectedImportedProductId(firstInFamily.id);
                          }
                        }}
                      >
                        {importedFamilyOptions.map((item) => (
                          <option key={item.familyKey} value={item.familyKey}>
                            {item.familyLabel}
                          </option>
                        ))}
                      </select>
                      <select
                        data-testid="imported-product-select"
                        className="w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-xs text-neutral-900"
                        value={selectedImportedProductId}
                        onChange={(e) => setSelectedImportedProductId(e.target.value)}
                      >
                        {visibleImportedModelOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.pickerLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex">
                      <button
                        className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={addSelectedImportedToRoom}
                        disabled={!selectedImportedProductId || !canEdit}
                      >
                        Add Imported
                      </button>
                    </div>
                  </div>
                </div>
                <CatalogPanel
                  items={catalogItems}
                  canEdit={canEdit}
                  onAddToRoom={addCatalogItemToRoom}
                />
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
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-400" data-testid="upgrade-variant-label">
              Variant: {upgradeCtaVariant}
            </div>
            <div className="mt-2 text-sm text-neutral-600">
              {upgradeReason === "export_images" &&
                "Free gives you a preview. Pro unlocks clean HD room images, multiple camera angles, and presentation-ready exports."}
              {upgradeReason === "export_pdf" &&
                "Free includes a watermarked one-page preview. Pro unlocks clean PDFs, branded covers, room summaries, and client-ready boards."}
              {upgradeReason === "designer" &&
                "Designer mode, presentation tools, and polished export workflows are available on the Pro plan."}
              {!upgradeReason &&
                "Unlock clean exports, designer tools, and a faster client presentation workflow."}
            </div>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
              {upgradeCtaVariant === "unlock_pro_exports" ? (
                <div data-testid="upgrade-variant-unlock-pro-exports">
                  <div className="font-medium text-neutral-900">Best for active projects</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-neutral-600">
                    <li>Clean PDF exports without watermark</li>
                    <li>Multi-angle image exports and branded presentation packs</li>
                    <li>
                      {paywallExperimentSlot === "value_stack_v2"
                        ? "Client-ready exports in minutes with less manual formatting"
                        : "Room summaries and smoother designer workflow"}
                    </li>
                  </ul>
                  <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                    {annualPlanSavingsLabel}
                  </div>
                </div>
              ) : (
                <div data-testid="upgrade-variant-see-pricing">
                  <div className="font-medium text-neutral-900">Free vs Pro at a glance</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                      <div className="font-semibold text-neutral-900">Free</div>
                      <div className="mt-1">Watermarked preview export</div>
                      <div>Basic sharing</div>
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                      <div className="font-semibold text-neutral-900">Pro</div>
                      <div className="mt-1">Clean branded exports</div>
                      <div>Presentation-ready workflow</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {paywallExperimentSlot === "value_stack_v2"
                      ? "Teams with weekly client reviews usually recover yearly pricing within the first month."
                      : "Use yearly if you expect to export for more than 2 active projects this quarter."}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                data-testid="upgrade-see-plans"
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={startingCheckout}
                onClick={() => {
                  track("upgrade_clicked", {
                    source: "upgrade_modal",
                    cta: "see_plans",
                    reason: upgradeReason || "unknown",
                    cta_position: "primary",
                    ...paywallContextMeta,
                  });
                  logFunnelEvent("upgrade_clicked", {
                    source: "upgrade_modal",
                    cta: "see_plans",
                    reason: upgradeReason || "unknown",
                    cta_position: "primary",
                    ...paywallContextMeta,
                  });
                  setShowPlans(true);
                }}
              >
                {primaryUpgradeCtaLabel}
              </button>
              {!session?.user && (
                <button
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700"
                  onClick={() => {
                    track("upgrade_clicked", {
                      source: "upgrade_modal",
                      cta: "sign_in_google",
                      reason: upgradeReason || "unknown",
                      cta_position: "secondary",
                      ...paywallContextMeta,
                    });
                    logFunnelEvent("upgrade_clicked", {
                      source: "upgrade_modal",
                      cta: "sign_in_google",
                      reason: upgradeReason || "unknown",
                      cta_position: "secondary",
                      ...paywallContextMeta,
                    });
                    track("upgrade_prompt_clicked", { reason: upgradeReason || "unknown" });
                    signIn("google");
                  }}
                >
                  Sign in to save progress
                </button>
              )}
              <button
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
                onClick={() => {
                  setShowUpgrade(false);
                  setUpgradeReason(null);
                }}
              >
                {upgradeCtaVariant === "see_pricing" ? "Maybe later" : "Close"}
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
              {pricingLayoutVariant === "annual_highlight" ? (
                <>
                  <div data-testid="plans-layout-annual-highlight" style={{ marginBottom: 8 }}><b>Pro Yearly</b> — best for ongoing client work, cleaner exports, and the lowest effective monthly cost</div>
                  <div style={{ marginBottom: 8 }}><b>Pro Monthly</b> — flexible access for short project bursts</div>
                  <div style={{ marginBottom: 12, color: "#047857", fontWeight: 600 }}>{annualPlanSavingsLabel}</div>
                </>
              ) : (
                <>
                  <div data-testid="plans-layout-default" style={{ marginBottom: 8 }}><b>Free</b> — design, save, share, and export a watermarked preview</div>
                  <div style={{ marginBottom: 12 }}><b>Pro</b> — clean exports, multi-angle images, branded PDF cover pages, and client workflow</div>
                  <div style={{ marginBottom: 12, color: "#047857", fontWeight: 600 }}>{annualPlanSavingsLabel}</div>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {pricingLayoutVariant === "annual_highlight" ? (
                <>
                  <button
                    data-testid="checkout-yearly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #059669", background: "#ecfdf5", fontWeight: 600 }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      void startCheckout("yearly");
                    }}
                  >
                    Start yearly and save
                  </button>

                  <button
                    data-testid="checkout-monthly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      void startCheckout("monthly");
                    }}
                  >
                    Or start monthly
                  </button>
                </>
              ) : (
                <>
                  <button
                    data-testid="checkout-monthly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      void startCheckout("monthly");
                    }}
                  >
                    Start Pro monthly
                  </button>

                  <button
                    data-testid="checkout-yearly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      void startCheckout("yearly");
                    }}
                  >
                    Save with yearly
                  </button>
                </>
              )}
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" 
          onClick={() => {
            setShowPresentModal(false);
            setEditorMode("design");
          }}
        >
          <div 
            className={
              showDesignerTheme
                ? "designer-panel max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl p-6 shadow-2xl"
                : "max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
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
                <div className="space-y-2">
                  <EditorViewToggle
                    value={viewMode}
                    onChange={(next) => {
                      setViewMode(next);
                      if (next === "3d") {
                        transitionToCameraView(getEyeLevelView(), 500);
                      }
                    }}
                    dark={showDesignerTheme}
                  />
                  <div className="grid grid-cols-1 gap-2">
                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                    }
                    onClick={() => {
                      setViewMode("3d");
                      transitionToCameraView(getFocusView(), 460);
                    }}
                  >
                    Focus
                  </button>
                </div>
                </div>
                {viewMode === "2d" && (
                  <div className="mt-2 space-y-2">
                    <p className={showDesignerTheme ? "text-xs text-neutral-400" : "text-xs text-gray-500"}>
                      Pan and zoom are enabled; rotation is locked for plan editing.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={
                          simplePlanControls
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => setSimplePlanControls(true)}
                      >
                        Simple controls
                      </button>
                      <button
                        className={
                          !simplePlanControls
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => setSimplePlanControls(false)}
                      >
                        Advanced controls
                      </button>
                    </div>

                    {simplePlanControls ? (
                      <div
                        className={
                          showDesignerTheme
                            ? "rounded-lg bg-[#151820] p-3 text-xs text-neutral-300"
                            : "rounded-lg bg-gray-100 p-3 text-xs text-gray-600"
                        }
                      >
                        Basic mode keeps things simple. Use Advanced controls for layer details, openings, and theme tuning.
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-gray-200/70 p-2">
                          <div className={showDesignerTheme ? "mb-2 text-[11px] text-neutral-400" : "mb-2 text-[11px] text-gray-500"}>
                            Layer Presets
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              className={
                                planLayerPreset === "presentation"
                                  ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                              }
                              onClick={() => applyPlanLayerPreset("presentation")}
                            >
                              {PLAN_LAYER_PRESETS.presentation.label}
                            </button>
                            <button
                              className={
                                planLayerPreset === "technical"
                                  ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                              }
                              onClick={() => applyPlanLayerPreset("technical")}
                            >
                              {PLAN_LAYER_PRESETS.technical.label}
                            </button>
                            <button
                              className={
                                planLayerPreset === "staging"
                                  ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                              }
                              onClick={() => applyPlanLayerPreset("staging")}
                            >
                              {PLAN_LAYER_PRESETS.staging.label}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className={
                              planTheme === "consumer"
                                ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                                  : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                            }
                            onClick={() => setPlanTheme("consumer")}
                          >
                            Consumer Theme
                          </button>
                          <button
                            className={
                              planTheme === "pro"
                                ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                                  : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                            }
                            onClick={() => setPlanTheme("pro")}
                          >
                            Pro Theme
                          </button>
                        </div>
                      </>
                    )}

                    {!simplePlanControls && (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["grid", "Grid"],
                          ["dimensions", "Dimensions"],
                          ["labels", "Labels"],
                          ["openings", "Openings"],
                          ["builtIns", "Built-ins"],
                          ["zones", "Zones"],
                          ["annotations", "Annotations"],
                        ].map(([rawKey, label]) => {
                          const key = rawKey as keyof typeof planLayers;
                          return (
                            <button
                              key={rawKey}
                              className={
                                planLayers[key]
                                  ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                              }
                              onClick={() =>
                                setPlanLayers((prev) => ({
                                  ...prev,
                                  [key]: !prev[key],
                                }))
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="rounded-lg border border-gray-200/70 p-2">
                      <div className={showDesignerTheme ? "mb-2 text-[11px] text-neutral-400" : "mb-2 text-[11px] text-gray-500"}>
                        Measurement units
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["mm", "Millimeters"],
                          ["cm", "Centimeters"],
                          ["in", "Inches"],
                        ] as const).map(([unit, label]) => (
                          <button
                            key={unit}
                            className={
                              planMeasurementUnit === unit
                                ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                  : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                            }
                            onClick={() => setPlanMeasurementUnit(unit)}
                            title={label}
                          >
                            {unit.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        className={
                          annotationToolKind === "note"
                            ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                              : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                        }
                        onClick={() => {
                          setAnnotationToolKind("note");
                          addPlanAnnotation("note");
                        }}
                      >
                        + Note
                      </button>
                      {!simplePlanControls && (
                        <button
                          className={
                            annotationToolKind === "callout"
                              ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                              : showDesignerTheme
                                ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                          }
                          onClick={() => {
                            setAnnotationToolKind("callout");
                            addPlanAnnotation("callout");
                          }}
                        >
                          + Callout
                        </button>
                      )}
                      {!simplePlanControls && (
                        <button
                          className={
                            annotationToolKind === "room_tag"
                              ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                              : showDesignerTheme
                                ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                          }
                          onClick={() => {
                            setAnnotationToolKind("room_tag");
                            addPlanAnnotation("room_tag");
                          }}
                        >
                          + Room Tag
                        </button>
                      )}
                    </div>

                    {!simplePlanControls && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                          }
                          onClick={() => {
                            const id = `opening-${Date.now()}`;
                            setPlanOpenings((prev) => [
                              ...prev,
                              {
                                id,
                                wall: "south",
                                kind: "door",
                                offsetMm: 0,
                                widthMm: 900,
                              },
                            ]);
                            setSelectedPlanOverlayId(id);
                          }}
                        >
                          + Door
                        </button>
                        <button
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                          }
                          onClick={() => {
                            const id = `opening-${Date.now()}`;
                            setPlanOpenings((prev) => [
                              ...prev,
                              {
                                id,
                                wall: "north",
                                kind: "window",
                                offsetMm: 0,
                                widthMm: 1200,
                              },
                            ]);
                            setSelectedPlanOverlayId(id);
                          }}
                        >
                          + Window
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {!simplePlanControls ? (
                        <button
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                          }
                          onClick={() => {
                            const id = `fixed-${Date.now()}`;
                            setPlanFixedElements((prev) => [
                              ...prev,
                              {
                                id,
                                kind: "wardrobe",
                                xMm: 0,
                                zMm: 0,
                                widthMm: 1200,
                                depthMm: 600,
                                rotationDeg: 0,
                                label: "Wardrobe",
                              },
                            ]);
                            setSelectedPlanOverlayId(id);
                          }}
                        >
                          + Built-in
                        </button>
                      ) : (
                        <div
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-center text-xs text-neutral-400"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500"
                          }
                        >
                          Built-ins in Advanced
                        </div>
                      )}
                      <button
                        className={
                          selectedPlanOverlayId
                            ? "rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white"
                            : "rounded-lg bg-gray-200 px-3 py-2 text-xs text-gray-500"
                        }
                        disabled={!selectedPlanOverlayId}
                        onClick={() => {
                          const selectedId = selectedPlanOverlayId;
                          if (!selectedId) return;
                          setPlanOpenings((prev) => prev.filter((entry) => entry.id !== selectedId));
                          setPlanFixedElements((prev) => prev.filter((entry) => entry.id !== selectedId));
                          setPlanAnnotations((prev) => prev.filter((entry) => entry.id !== selectedId));
                          setSelectedPlanOverlayId(null);
                        }}
                      >
                        Delete Selected
                      </button>
                    </div>
                  </div>
                )}
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
                {!simplePlanControls && (
                  <>
                    <div className={showDesignerTheme ? "text-xs text-neutral-400" : "text-xs text-gray-500"}>
                      Export style preset
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={
                          exportStylePreset === "consumer"
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => {
                          setExportStylePreset("consumer");
                          applyPlanLayerPreset("presentation");
                        }}
                      >
                        Consumer
                      </button>
                      <button
                        className={
                          exportStylePreset === "pro"
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => {
                          setExportStylePreset("pro");
                          applyPlanLayerPreset("technical");
                        }}
                      >
                        Pro
                      </button>
                    </div>
                  </>
                )}
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

      {/* Item Cart Drawer */}
      <ItemCartDrawer
        items={itemCart}
        onRemove={removeFromCart}
        onUpdateQty={updateCartQty}
        onClear={clearCart}
        onAddAllToRoom={addAllToRoom}
        isOpen={itemCartOpen}
        onToggle={() => setItemCartOpen((v) => !v)}
      />

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
