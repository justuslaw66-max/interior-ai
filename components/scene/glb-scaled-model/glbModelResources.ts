import * as THREE from "three";

import { createGLBResourceCache, type GLBResourceLease } from "./glbResourceCache";
import type { GLBLocalRenderBounds } from "./localRenderBounds";
import type {
  GLBModelCacheStatus,
  GLBModelTerminalErrorCategory,
} from "./modelLifecycleTypes";
import {
  normalizeGLBScene,
  type NormalizeGLBSceneInput,
} from "./normalizeGLBScene";

export type GLBModelNormalizationConfig = Omit<
  NormalizeGLBSceneInput,
  "loadedScene" | "upholsteryTextures"
>;
export type GLBLoadedResource =
  | { kind: "parsed"; scene: THREE.Object3D }
  | {
      kind: "prepared";
      model: THREE.Object3D;
      localRenderBounds: GLBLocalRenderBounds;
    };

type CachedGLBSource = {
  scene: THREE.Object3D;
  deliveryCacheStatus: GLBModelCacheStatus;
};
type PreparedGLBResource = {
  scene: THREE.Object3D;
  localRenderBounds: GLBLocalRenderBounds;
  deliveryCacheStatus: GLBModelCacheStatus;
  releaseSource: () => void;
};

export class GLBSourceLoadError extends Error {
  readonly category: GLBModelTerminalErrorCategory;

  constructor(category: GLBModelTerminalErrorCategory) {
    super(category);
    this.name = "GLBSourceLoadError";
    this.category = category;
  }
}

export function categorizeGLBBoundsFailure(error: unknown) {
  return error instanceof GLBSourceLoadError
    ? error
    : new GLBSourceLoadError("glb-bounds-failed");
}

export function disposeObjectGeometryAndMaterials(object: THREE.Object3D) {
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

const parsedCache = createGLBResourceCache<CachedGLBSource>({
  maximumEntries: 32,
  dispose: ({ scene }) => {
    disposeObjectTextures(scene);
    disposeObjectGeometryAndMaterials(scene);
  },
});
const preparedCache = createGLBResourceCache<PreparedGLBResource>({
  maximumEntries: 32,
  dispose: ({ scene, releaseSource }) => {
    disposeObjectGeometryAndMaterials(scene);
    releaseSource();
  },
});
let cleanupRegistered = false;

export function ensureGLBResourceCleanup() {
  if (cleanupRegistered || typeof window === "undefined") return;
  cleanupRegistered = true;
  window.addEventListener(
    "pagehide",
    (event) => {
      if (event.persisted) return;
      preparedCache.clear();
      parsedCache.clear();
    }
  );
}

function responseCacheStatus(url: string): GLBModelCacheStatus {
  if (typeof performance === "undefined") return "unknown";
  try {
    const absoluteUrl = new URL(url, window.location.href).href;
    const entries = performance.getEntriesByName(
      absoluteUrl,
      "resource"
    ) as PerformanceResourceTiming[];
    const latest = entries.at(-1);
    if (!latest) return "unknown";
    return latest.transferSize === 0 && latest.decodedBodySize > 0
      ? "cache-hit"
      : "network";
  } catch {
    return "unknown";
  }
}

async function importGLTFLoaders() {
  try {
    return await Promise.all([
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/loaders/DRACOLoader.js"),
    ]);
  } catch {
    throw new GLBSourceLoadError("gltf-loader-import-failed");
  }
}

async function configureGLTFLoader(
  loader: import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader,
  DRACOLoader: typeof import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader
) {
  let dracoLoader: { dispose?: () => void } | null = null;
  try {
    const nextDracoLoader = new DRACOLoader();
    nextDracoLoader.setDecoderPath("/draco/");
    loader.setDRACOLoader(nextDracoLoader);
    dracoLoader = nextDracoLoader;
  } catch {
    // Non-Draco models remain loadable when optional decoder setup fails.
  }
  try {
    const meshoptModule = (await import("meshoptimizer")) as {
      MeshoptDecoder?: { ready?: Promise<unknown> };
    };
    const MeshoptDecoder = meshoptModule.MeshoptDecoder;
    if (MeshoptDecoder?.ready) await MeshoptDecoder.ready;
    const loaderWithMeshopt = loader as typeof loader & {
      setMeshoptDecoder?: (decoder: unknown) => void;
    };
    if (loaderWithMeshopt.setMeshoptDecoder && MeshoptDecoder) {
      loaderWithMeshopt.setMeshoptDecoder(MeshoptDecoder);
    }
  } catch {
    // Non-Meshopt models remain loadable when optional decoder setup fails.
  }
  return () => dracoLoader?.dispose?.();
}

function loadScene(
  loader: import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader,
  url: string,
  onResponseComplete: (cacheStatus: GLBModelCacheStatus) => void
) {
  let responseCompleted = false;
  let deliveryCacheStatus: GLBModelCacheStatus = "unknown";
  const markResponse = () => {
    if (responseCompleted) return;
    responseCompleted = true;
    deliveryCacheStatus = responseCacheStatus(url);
    onResponseComplete(deliveryCacheStatus);
  };
  const scene = new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        markResponse();
        resolve(gltf.scene);
      },
      (event) => {
        if (event.lengthComputable && event.total > 0 && event.loaded >= event.total) {
          markResponse();
        }
      },
      () => {
        const category = responseCompleted
          ? "gltf-parse-decode-failed"
          : "gltf-load-failed";
        reject(new GLBSourceLoadError(category));
      }
    );
  });
  return { scene, cacheStatus: () => deliveryCacheStatus };
}

async function loadGLBSource(
  url: string,
  onResponseComplete: (cacheStatus: GLBModelCacheStatus) => void
): Promise<CachedGLBSource> {
  const [{ GLTFLoader }, { DRACOLoader }] = await importGLTFLoaders();
  const loader = new GLTFLoader();
  const disposeDecoders = await configureGLTFLoader(loader, DRACOLoader);
  const loading = loadScene(loader, url, onResponseComplete);
  try {
    return {
      scene: await loading.scene,
      deliveryCacheStatus: loading.cacheStatus(),
    };
  } finally {
    disposeDecoders();
  }
}

export function measureGLBLocalRenderBounds(
  normalizedModel: THREE.Object3D
): GLBLocalRenderBounds {
  const detachedModel = normalizedModel.clone(true);
  detachedModel.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(detachedModel, true);
  if (bounds.isEmpty()) throw new GLBSourceLoadError("glb-empty-bounds");
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);
  return {
    center: [center.x, center.y, center.z],
    size: [size.x, size.y, size.z],
  };
}

export function acquireParsedGLB(
  url: string,
  onResponseComplete: (cacheStatus: GLBModelCacheStatus) => void
) {
  return parsedCache.acquire(url, () => loadGLBSource(url, onResponseComplete));
}

async function prepareGLB(
  config: GLBModelNormalizationConfig,
  onResponseComplete: (cacheStatus: GLBModelCacheStatus) => void
): Promise<PreparedGLBResource> {
  const sourceLease = acquireParsedGLB(config.url, onResponseComplete);
  let scene: THREE.Object3D | null = null;
  try {
    const source = await sourceLease.resource;
    try {
      scene = normalizeGLBScene({
        ...config,
        loadedScene: source.scene,
        upholsteryTextures: {},
      });
    } catch {
      throw new GLBSourceLoadError("glb-normalization-failed");
    }
    if (!scene) throw new GLBSourceLoadError("glb-normalization-failed");
    let localRenderBounds: GLBLocalRenderBounds;
    try {
      localRenderBounds = measureGLBLocalRenderBounds(scene);
    } catch (error) {
      throw categorizeGLBBoundsFailure(error);
    }
    return {
      scene,
      localRenderBounds,
      deliveryCacheStatus:
        sourceLease.cacheStatus === "cache-hit"
          ? "cache-hit"
          : source.deliveryCacheStatus,
      releaseSource: sourceLease.release,
    };
  } catch (error) {
    if (scene) disposeObjectGeometryAndMaterials(scene);
    sourceLease.release();
    throw error instanceof GLBSourceLoadError
      ? error
      : new GLBSourceLoadError("gltf-parse-decode-failed");
  }
}

export function acquirePreparedGLB(
  key: string,
  config: GLBModelNormalizationConfig,
  onResponseComplete: (cacheStatus: GLBModelCacheStatus) => void
): GLBResourceLease<PreparedGLBResource> {
  return preparedCache.acquire(key, () =>
    prepareGLB(config, onResponseComplete)
  );
}
