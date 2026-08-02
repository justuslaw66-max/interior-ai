import * as THREE from "three";

import {
  categorizeGLBBoundsFailure,
  measureGLBLocalRenderBounds,
  type GLBLoadedResource,
  type GLBModelNormalizationConfig,
} from "./glbModelResources";
import type { GLBLocalRenderBounds } from "./localRenderBounds";
import type { GLBModelTerminalErrorCategory } from "./modelLifecycleTypes";
import {
  normalizeGLBScene,
  type GLBUpholsteryTextures,
} from "./normalizeGLBScene";

export type GLBModelResult = {
  model: THREE.Object3D | null;
  errorCode: GLBModelTerminalErrorCategory | null;
  ownsResources: boolean;
  normalizationTiming: {
    startedAtMs: number;
    completedAtMs: number;
    materialCloningStartedAtMs: number;
    materialCloningCompletedAtMs: number;
    eventLoopDelayMs: {
      started: number | null;
      completed: number | null;
      materialCloningStarted: number | null;
      materialCloningCompleted: number | null;
    };
  } | null;
};

export type GLBBoundsResult = {
  bounds: GLBLocalRenderBounds | null;
  errorCode: GLBModelTerminalErrorCategory | null;
  timing: {
    startedAtMs: number;
    completedAtMs: number;
    startedEventLoopDelayMs: number | null;
    completedEventLoopDelayMs: number | null;
  } | null;
};

function observedEventLoopDelayMs() {
  return (
    globalThis as typeof globalThis & {
      __INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?: { lastDelayMs: number };
    }
  ).__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?.lastDelayMs ?? null;
}

function preparedModelResult(
  resource: Extract<GLBLoadedResource, { kind: "prepared" }>,
): GLBModelResult {
  return {
    model: resource.model,
    errorCode: null,
    ownsResources: true,
    normalizationTiming: {
      startedAtMs: resource.preparationTimings.normalizationStartedAtMs,
      completedAtMs: resource.preparationTimings.normalizationCompletedAtMs,
      materialCloningStartedAtMs:
        resource.preparationTimings.materialCloningStartedAtMs,
      materialCloningCompletedAtMs:
        resource.preparationTimings.materialCloningCompletedAtMs,
      eventLoopDelayMs: {
        started:
          resource.preparationTimings.eventLoopDelayMs.normalizationStarted,
        completed:
          resource.preparationTimings.eventLoopDelayMs.normalizationCompleted,
        materialCloningStarted:
          resource.preparationTimings.eventLoopDelayMs.materialCloningStarted,
        materialCloningCompleted:
          resource.preparationTimings.eventLoopDelayMs.materialCloningCompleted,
      },
    },
  };
}

function normalizeParsedResource(
  resource: Extract<GLBLoadedResource, { kind: "parsed" }>,
  config: GLBModelNormalizationConfig,
  upholsteryTextures: GLBUpholsteryTextures,
): GLBModelResult {
  const startedAtMs = performance.now();
  const startedEventLoopDelayMs = observedEventLoopDelayMs();
  try {
    const model = normalizeGLBScene({
      ...config,
      loadedScene: resource.scene,
      upholsteryTextures,
    });
    const completedAtMs = performance.now();
    const completedEventLoopDelayMs = observedEventLoopDelayMs();
    return {
      model,
      errorCode: null,
      ownsResources: true,
      normalizationTiming: {
        startedAtMs,
        completedAtMs,
        materialCloningStartedAtMs: startedAtMs,
        materialCloningCompletedAtMs: completedAtMs,
        eventLoopDelayMs: {
          started: startedEventLoopDelayMs,
          completed: completedEventLoopDelayMs,
          materialCloningStarted: startedEventLoopDelayMs,
          materialCloningCompleted: completedEventLoopDelayMs,
        },
      },
    };
  } catch {
    return {
      model: null,
      errorCode: "glb-normalization-failed",
      ownsResources: false,
      normalizationTiming: null,
    };
  }
}

export function normalizeResource(
  resource: GLBLoadedResource | null,
  config: GLBModelNormalizationConfig,
  upholsteryTextures: GLBUpholsteryTextures,
): GLBModelResult {
  if (!resource) {
    return {
      model: null,
      errorCode: null,
      ownsResources: false,
      normalizationTiming: null,
    };
  }
  return resource.kind === "prepared"
    ? preparedModelResult(resource)
    : normalizeParsedResource(resource, config, upholsteryTextures);
}

export function boundsForResource(
  resource: GLBLoadedResource | null,
  model: THREE.Object3D | null,
): GLBBoundsResult {
  if (resource?.kind === "prepared") {
    return {
      bounds: resource.localRenderBounds,
      errorCode: null,
      timing: {
        startedAtMs: resource.preparationTimings.boundsStartedAtMs,
        completedAtMs: resource.preparationTimings.boundsCompletedAtMs,
        startedEventLoopDelayMs:
          resource.preparationTimings.eventLoopDelayMs.boundsStarted,
        completedEventLoopDelayMs:
          resource.preparationTimings.eventLoopDelayMs.boundsCompleted,
      },
    };
  }
  if (!model) return { bounds: null, errorCode: null, timing: null };
  const startedAtMs = performance.now();
  const startedEventLoopDelayMs = observedEventLoopDelayMs();
  try {
    return {
      bounds: measureGLBLocalRenderBounds(model),
      errorCode: null,
      timing: {
        startedAtMs,
        completedAtMs: performance.now(),
        startedEventLoopDelayMs,
        completedEventLoopDelayMs: observedEventLoopDelayMs(),
      },
    };
  } catch (error) {
    return {
      bounds: null,
      errorCode: categorizeGLBBoundsFailure(error).category,
      timing: null,
    };
  }
}
