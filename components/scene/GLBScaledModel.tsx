"use client";

import * as THREE from "three";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { GLBCalibration } from "@/lib/design-page-calibration";
import type { ConfigurableNodeTransform } from "@/lib/design-page-types";
import type { PendantCableAdjustment } from "@/lib/pendant-light-adjustment";
import { FurnitureSelectionOutline } from "./furniture/FurnitureSelectionOutline";
import {
  areGLBLocalRenderBoundsEquivalent,
  createGLBLocalRenderBoundsTracker,
  GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS,
  observeGLBLocalRenderBounds,
  type GLBLocalRenderBounds,
} from "./glb-scaled-model/localRenderBounds";
import {
  GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD,
  recordGLBBoundsObservation,
  recordGLBExcessiveBoundsWarning,
  recordGLBModelMount,
  recordGLBModelRender,
  recordGLBModelUnmount,
  recordGLBSelectionOutlineVisibility,
} from "./glb-scaled-model/modelDiagnostics";
import { normalizeGLBScene } from "./glb-scaled-model/normalizeGLBScene";

export {
  areGLBLocalRenderBoundsEquivalent,
  GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS,
};
export type { GLBLocalRenderBounds };

export type GLBScaledModelProps = {
  url: string;
  productId?: string;
  variantId?: string;
  width: number;
  height: number;
  depth: number;
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  calibration?: GLBCalibration;
  variantColorHex?: string;
  variantName?: string;
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  pendantCableAdjustment?: PendantCableAdjustment | null;
  castShadow?: boolean;
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
  onLocalBoundsChange?: (bounds: GLBLocalRenderBounds) => void;
  diagnosticKey?: string;
  showSelectionOutline?: boolean;
};

function disposeObjectGeometryAndMaterials(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    materials.forEach((material) => material.dispose());
  });
}

function disposeObjectTextures(object: THREE.Object3D) {
  const disposedTextures = new Set<THREE.Texture>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
          disposedTextures.add(value);
          value.dispose();
        }
      }
    }
  });
}

function useSemanticallyStableJSONValue<T>(value: T): T {
  const signature = JSON.stringify(value ?? null);
  // The serialized signature is intentionally the dependency: callers that
  // recreate equivalent configuration objects keep the previous reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [signature]);
}

export const GLBScaledModel = memo(function GLBScaledModel({
  url,
  productId,
  variantId,
  width,
  height,
  depth,
  nodeTransforms,
  calibration,
  variantColorHex,
  variantName,
  variantRenderAssets,
  pendantCableAdjustment,
  castShadow = true,
  onLoadStateChange,
  onLocalBoundsChange,
  diagnosticKey,
  showSelectionOutline = false,
}: GLBScaledModelProps) {
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null);
  const [upholsteryTexturesLoaded, setUpholsteryTexturesLoaded] = useState(false);
  const [upholsteryTextures, setUpholsteryTextures] = useState<{
    baseColorMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
  }>({});
  const onLoadStateChangeRef = useRef(onLoadStateChange);
  const onLocalBoundsChangeRef = useRef(onLocalBoundsChange);
  const localBoundsTrackerRef = useRef(createGLBLocalRenderBoundsTracker());
  const excessiveBoundsWarningIssuedRef = useRef(false);
  const invalidBoundsWarningIssuedRef = useRef(false);
  const resolvedDiagnosticKey =
    diagnosticKey ?? `${productId ?? "unidentified-product"}:${url}`;

  useEffect(() => {
    recordGLBModelMount(resolvedDiagnosticKey, url);
    return () => recordGLBModelUnmount(resolvedDiagnosticKey, url);
  }, [resolvedDiagnosticKey, url]);

  useEffect(() => {
    recordGLBModelRender(resolvedDiagnosticKey, url);
  });

  useEffect(() => {
    onLoadStateChangeRef.current = onLoadStateChange;
  }, [onLoadStateChange]);

  useEffect(() => {
    onLocalBoundsChangeRef.current = onLocalBoundsChange;
  }, [onLocalBoundsChange]);

  useEffect(() => {
    let cancelled = false;
    let ownedTextures: THREE.Texture[] = [];
    setUpholsteryTexturesLoaded((current) => (current ? false : current));
    onLoadStateChangeRef.current?.("loading");
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
      ownedTextures = [baseColorMap, normalMap, roughnessMap].filter(
        (texture): texture is THREE.Texture => Boolean(texture)
      );
      if (cancelled) {
        ownedTextures.forEach((texture) => texture.dispose());
        ownedTextures = [];
        return;
      }
      setUpholsteryTextures({ baseColorMap, normalMap, roughnessMap });
      setUpholsteryTexturesLoaded((current) => (current ? current : true));
    });

    return () => {
      cancelled = true;
      ownedTextures.forEach((texture) => texture.dispose());
      ownedTextures = [];
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
    let dracoLoader: { dispose?: () => void } | null = null;
    let sourceScene: THREE.Object3D | null = null;
    setLoadedScene((current) => (current === null ? current : null));
    onLoadStateChangeRef.current?.("loading");

    (async () => {
      try {
        const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/loaders/DRACOLoader.js"),
        ]);
        if (cancelled) return;

        const loader = new GLTFLoader();
        try {
          const nextDracoLoader = new DRACOLoader();
          nextDracoLoader.setDecoderPath("/draco/");
          loader.setDRACOLoader(nextDracoLoader);
          dracoLoader = nextDracoLoader;
        } catch (decoderError) {
          // Existing non-Draco models should still load if Draco setup is unavailable.
          console.warn("[GLBScaledModel] Draco decoder unavailable", { decoderError });
        }
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
            sourceScene = gltf.scene;
            if (cancelled) {
              disposeObjectTextures(sourceScene);
              disposeObjectGeometryAndMaterials(sourceScene);
              sourceScene = null;
              return;
            }
            setLoadedScene(gltf.scene.clone(true));
          },
          undefined,
          (error) => {
            if (cancelled) return;
            console.warn("[GLBScaledModel] Failed to load", { url, error });
            setLoadedScene((current) => (current === null ? current : null));
            onLoadStateChangeRef.current?.("error");
          }
        );
      } catch (error) {
        if (cancelled) return;
        console.warn("[GLBScaledModel] Failed to import GLTFLoader", { error });
        setLoadedScene((current) => (current === null ? current : null));
        onLoadStateChangeRef.current?.("error");
      }
    })();

    return () => {
      cancelled = true;
      dracoLoader?.dispose?.();
      if (sourceScene) {
        disposeObjectTextures(sourceScene);
        disposeObjectGeometryAndMaterials(sourceScene);
        sourceScene = null;
      }
    };
  }, [url]);

  const stableNodeTransforms = useSemanticallyStableJSONValue(nodeTransforms);
  const stableCalibration = useSemanticallyStableJSONValue(calibration);
  const stableVariantRenderAssets = useSemanticallyStableJSONValue(
    variantRenderAssets
  );
  const stablePendantCableAdjustment = useSemanticallyStableJSONValue(
    pendantCableAdjustment
  );
  const normalizedModel = useMemo(
    () =>
      normalizeGLBScene({
        loadedScene,
        width,
        height,
        depth,
        nodeTransforms: stableNodeTransforms,
        calibration: stableCalibration,
        variantColorHex,
        upholsteryTextures,
        variantRenderAssets: stableVariantRenderAssets,
        url,
        variantName,
        productId,
        variantId,
        pendantCableAdjustment: stablePendantCableAdjustment,
        castShadow,
      }),
    [
      loadedScene,
      width,
      height,
      depth,
      stableNodeTransforms,
      stableCalibration,
      variantColorHex,
      upholsteryTextures,
      stableVariantRenderAssets,
      url,
      variantName,
      productId,
      variantId,
      stablePendantCableAdjustment,
      castShadow,
    ]
  );
  const localRenderBounds = useMemo<GLBLocalRenderBounds | null>(() => {
    if (!normalizedModel) return null;

    // Measure a detached clone so the Furniture group's world position and
    // rotation can never leak into bounds that are consumed in local space.
    const detachedModel = normalizedModel.clone(true);
    detachedModel.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(detachedModel, true);
    if (bounds.isEmpty()) return null;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);
    return {
      center: [center.x, center.y, center.z],
      size: [size.x, size.y, size.z],
    };
  }, [normalizedModel]);

  useEffect(() => {
    const observation = observeGLBLocalRenderBounds(
      localBoundsTrackerRef.current,
      localRenderBounds
    );
    const shouldPublish =
      observation.outcome === "changed" &&
      Boolean(onLocalBoundsChangeRef.current);
    recordGLBBoundsObservation(
      resolvedDiagnosticKey,
      url,
      observation,
      shouldPublish
    );

    if (observation.outcome === "invalid") {
      if (!invalidBoundsWarningIssuedRef.current) {
        invalidBoundsWarningIssuedRef.current = true;
        console.warn("[GLBScaledModel] Ignoring invalid local render bounds", {
          diagnosticKey: resolvedDiagnosticKey,
          url,
          localRenderBounds,
        });
      }
      return;
    }
    if (observation.outcome !== "changed") {
      return;
    }
    if (
      localBoundsTrackerRef.current.materialChangeCount >
        GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD &&
      !excessiveBoundsWarningIssuedRef.current
    ) {
      excessiveBoundsWarningIssuedRef.current = true;
      recordGLBExcessiveBoundsWarning(resolvedDiagnosticKey, url);
      console.warn("[GLBScaledModel] Excessive material bounds changes", {
        diagnosticKey: resolvedDiagnosticKey,
        url,
        materialChangeCount:
          localBoundsTrackerRef.current.materialChangeCount,
      });
    }
    onLocalBoundsChangeRef.current?.(observation.bounds);
  }, [localRenderBounds, resolvedDiagnosticKey, url]);

  const selectionOutlineVisible = Boolean(
    showSelectionOutline &&
      localRenderBounds &&
      normalizedModel &&
      upholsteryTexturesLoaded
  );
  useEffect(() => {
    recordGLBSelectionOutlineVisibility(
      resolvedDiagnosticKey,
      url,
      selectionOutlineVisible
    );
  }, [resolvedDiagnosticKey, selectionOutlineVisible, url]);

  useEffect(() => {
    if (!normalizedModel || !upholsteryTexturesLoaded) return;
    onLoadStateChangeRef.current?.("ready");
  }, [normalizedModel, upholsteryTexturesLoaded]);

  useEffect(() => {
    if (!normalizedModel) return;
    return () => disposeObjectGeometryAndMaterials(normalizedModel);
  }, [normalizedModel]);

  if (!normalizedModel || !upholsteryTexturesLoaded) return null;

  return (
    <>
      <primitive object={normalizedModel} />
      {selectionOutlineVisible && localRenderBounds ? (
        <FurnitureSelectionOutline localRenderBounds={localRenderBounds} />
      ) : null}
    </>
  );
}, areGLBScaledModelPropsEquivalent);

function areGLBScaledModelPropsEquivalent(
  left: GLBScaledModelProps,
  right: GLBScaledModelProps
) {
  return (
    left.url === right.url &&
    left.productId === right.productId &&
    left.variantId === right.variantId &&
    left.width === right.width &&
    left.height === right.height &&
    left.depth === right.depth &&
    left.variantColorHex === right.variantColorHex &&
    left.variantName === right.variantName &&
    left.castShadow === right.castShadow &&
    left.onLoadStateChange === right.onLoadStateChange &&
    left.onLocalBoundsChange === right.onLocalBoundsChange &&
    left.diagnosticKey === right.diagnosticKey &&
    left.showSelectionOutline === right.showSelectionOutline &&
    JSON.stringify(left.nodeTransforms ?? null) ===
      JSON.stringify(right.nodeTransforms ?? null) &&
    JSON.stringify(left.calibration ?? null) ===
      JSON.stringify(right.calibration ?? null) &&
    JSON.stringify(left.variantRenderAssets ?? null) ===
      JSON.stringify(right.variantRenderAssets ?? null) &&
    JSON.stringify(left.pendantCableAdjustment ?? null) ===
      JSON.stringify(right.pendantCableAdjustment ?? null)
  );
}
