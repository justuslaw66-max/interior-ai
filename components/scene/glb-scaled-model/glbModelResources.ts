import * as THREE from "three";

import {
  createGLBResourceCache,
  type GLBResourceLease,
  type GLBResourceCacheStatus,
} from "./glbResourceCache";
import {
  safeGLBResourceCacheInspection,
  type GLBResourceCachesMetadataSnapshot,
} from "./glbResourceCacheMetadata";
import { applyGLBResourcePageHidePolicy } from "./glbResourcePageLifecycle";
import {
  disposeObjectGeometryAndMaterials,
  disposeObjectTextures,
} from "./glbSceneResourceOwnership";
import {
  categorizeGLBBoundsFailure,
  GLBSourceLoadError,
} from "./glbSourceLoadError";
import type { GLBLocalRenderBounds } from "./localRenderBounds";
import { measureGLBMainThreadWork, recordGLBMainThreadTiming } from "./glbMainThreadTelemetryFacade";
import { measureGLBLocalRenderBounds } from "./measureGLBLocalRenderBounds";
import type { GLBModelCacheStatus } from "./modelLifecycleTypes";
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
      preparationTimings: GLBPreparationTimings;
    };

export type GLBPreparationTimings = {
  parseCompletedAtMs: number;
  normalizationStartedAtMs: number;
  normalizationCompletedAtMs: number;
  materialCloningStartedAtMs: number;
  materialCloningCompletedAtMs: number;
  boundsStartedAtMs: number;
  boundsCompletedAtMs: number;
  eventLoopDelayMs: {
    parseCompleted: number | null;
    normalizationStarted: number | null;
    normalizationCompleted: number | null;
    materialCloningStarted: number | null;
    materialCloningCompleted: number | null;
    boundsStarted: number | null;
    boundsCompleted: number | null;
  };
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
  preparationTimings: GLBPreparationTimings;
  parsedCacheStatus: GLBResourceCacheStatus;
};

export {
  clonePreparedGLBForMount,
  disposeObjectGeometryAndMaterials,
} from "./glbSceneResourceOwnership";
export { categorizeGLBBoundsFailure, GLBSourceLoadError } from "./glbSourceLoadError";
export { measureGLBLocalRenderBounds } from "./measureGLBLocalRenderBounds";

const parsedCache = createGLBResourceCache<CachedGLBSource>({
  maximumEntries: 32,
  dispose: ({ scene }) =>
    measureGLBMainThreadWork("resource-disposal", () => {
      disposeObjectTextures(scene);
      disposeObjectGeometryAndMaterials(scene);
    }),
});
const preparedCache = createGLBResourceCache<PreparedGLBResource>({
  maximumEntries: 32,
  dispose: ({ scene, releaseSource }) =>
    measureGLBMainThreadWork("resource-disposal", () => {
      disposeObjectGeometryAndMaterials(scene);
      releaseSource();
    }),
});
let cleanupRegistered = false;
export type { GLBResourceCachesMetadataSnapshot } from "./glbResourceCacheMetadata";

export function snapshotGLBResourceCaches(): GLBResourceCachesMetadataSnapshot {
  return {
    parsed: safeGLBResourceCacheInspection(parsedCache.inspect()),
    prepared: safeGLBResourceCacheInspection(preparedCache.inspect()),
  };
}

export function ensureGLBResourceCleanup() {
  if (cleanupRegistered || typeof window === "undefined") return;
  cleanupRegistered = true;
  window.addEventListener(
    "pagehide",
    (event) => {
      applyGLBResourcePageHidePolicy({
        persisted: event.persisted,
        clearPrepared: () => preparedCache.clear(),
        clearParsed: () => parsedCache.clear(),
      });
    }
  );
}

function observedEventLoopDelayMs() {
  return (
    globalThis as typeof globalThis & {
      __INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?: { lastDelayMs: number };
    }
  ).__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?.lastDelayMs ?? null;
}

function responsePerformance(url: string): {
  cacheStatus: GLBModelCacheStatus;
  completedAtMs: number;
} {
  const fallback = { cacheStatus: "unknown" as const, completedAtMs: 0 };
  if (typeof performance === "undefined") return fallback;
  try {
    const absoluteUrl = new URL(url, window.location.href).href;
    const entries = performance.getEntriesByName(
      absoluteUrl,
      "resource"
    ) as PerformanceResourceTiming[];
    const latest = entries.at(-1);
    if (!latest) {
      return { ...fallback, completedAtMs: performance.now() };
    }
    return {
      cacheStatus:
        latest.transferSize === 0 && latest.decodedBodySize > 0
          ? "cache-hit"
          : "network",
      completedAtMs: latest.responseEnd || performance.now(),
    };
  } catch {
    return { ...fallback, completedAtMs: performance.now() };
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
  onResponseComplete: (
    cacheStatus: GLBModelCacheStatus,
    completedAtMs: number
  ) => void
) {
  let responseCompleted = false;
  let deliveryCacheStatus: GLBModelCacheStatus = "unknown";
  const markResponse = () => {
    if (responseCompleted) return;
    responseCompleted = true;
    const response = responsePerformance(url);
    deliveryCacheStatus = response.cacheStatus;
    onResponseComplete(deliveryCacheStatus, response.completedAtMs);
  };
  const scene = new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      url,
      (gltf) =>
        measureGLBMainThreadWork("gltf-callback", () => {
          markResponse();
          resolve(gltf.scene);
        }),
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
  onResponseComplete: (
    cacheStatus: GLBModelCacheStatus,
    completedAtMs: number
  ) => void
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

export function acquireParsedGLB(
  url: string,
  onResponseComplete: (
    cacheStatus: GLBModelCacheStatus,
    completedAtMs: number
  ) => void
) {
  return measureGLBMainThreadWork("parsed-cache-acquisition", () =>
    parsedCache.acquire(url, () => loadGLBSource(url, onResponseComplete)),
  );
}

function normalizePreparedScene(
  config: GLBModelNormalizationConfig,
  loadedScene: THREE.Object3D
) {
  const startedAtMs = performance.now();
  const startedEventLoopDelayMs = observedEventLoopDelayMs();
  let scene: THREE.Object3D | null;
  try {
    scene = normalizeGLBScene({
      ...config,
      loadedScene,
      upholsteryTextures: {},
    });
  } catch {
    throw new GLBSourceLoadError("glb-normalization-failed");
  }
  const completedAtMs = performance.now();
  recordGLBMainThreadTiming("normalization", startedAtMs, completedAtMs);
  const completedEventLoopDelayMs = observedEventLoopDelayMs();
  if (!scene) throw new GLBSourceLoadError("glb-normalization-failed");
  return {
    scene,
    startedAtMs,
    completedAtMs,
    startedEventLoopDelayMs,
    completedEventLoopDelayMs,
  };
}

function measurePreparedBounds(scene: THREE.Object3D) {
  const startedAtMs = performance.now();
  const startedEventLoopDelayMs = observedEventLoopDelayMs();
  try {
    const result = {
      bounds: measureGLBLocalRenderBounds(scene),
      startedAtMs,
      completedAtMs: performance.now(),
      startedEventLoopDelayMs,
      completedEventLoopDelayMs: observedEventLoopDelayMs(),
    };
    recordGLBMainThreadTiming("bounds-computation", startedAtMs, result.completedAtMs);
    return result;
  } catch (error) {
    throw categorizeGLBBoundsFailure(error);
  }
}

async function prepareGLB(
  config: GLBModelNormalizationConfig,
  onResponseComplete: (
    cacheStatus: GLBModelCacheStatus,
    completedAtMs: number
  ) => void
): Promise<PreparedGLBResource> {
  const sourceLease = acquireParsedGLB(config.url, onResponseComplete);
  let scene: THREE.Object3D | null = null;
  try {
    const source = await sourceLease.resource;
    const parseCompletedAtMs = performance.now();
    const parseCompletedEventLoopDelayMs = observedEventLoopDelayMs();
    const normalization = normalizePreparedScene(config, source.scene);
    scene = normalization.scene;
    const bounds = measurePreparedBounds(scene);
    return {
      scene,
      localRenderBounds: bounds.bounds,
      deliveryCacheStatus:
        sourceLease.cacheStatus === "cache-hit"
          ? "cache-hit"
          : source.deliveryCacheStatus,
      releaseSource: sourceLease.release,
      preparationTimings: {
        parseCompletedAtMs,
        normalizationStartedAtMs: normalization.startedAtMs,
        normalizationCompletedAtMs: normalization.completedAtMs,
        materialCloningStartedAtMs: normalization.startedAtMs,
        materialCloningCompletedAtMs: normalization.completedAtMs,
        boundsStartedAtMs: bounds.startedAtMs,
        boundsCompletedAtMs: bounds.completedAtMs,
        eventLoopDelayMs: {
          parseCompleted: parseCompletedEventLoopDelayMs,
          normalizationStarted: normalization.startedEventLoopDelayMs,
          normalizationCompleted: normalization.completedEventLoopDelayMs,
          materialCloningStarted: normalization.startedEventLoopDelayMs,
          materialCloningCompleted: normalization.completedEventLoopDelayMs,
          boundsStarted: bounds.startedEventLoopDelayMs,
          boundsCompleted: bounds.completedEventLoopDelayMs,
        },
      },
      parsedCacheStatus: sourceLease.cacheStatus,
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
  onResponseComplete: (
    cacheStatus: GLBModelCacheStatus,
    completedAtMs: number
  ) => void
): GLBResourceLease<PreparedGLBResource> {
  return measureGLBMainThreadWork("prepared-cache-acquisition", () =>
    preparedCache.acquire(key, () => prepareGLB(config, onResponseComplete)),
  );
}
