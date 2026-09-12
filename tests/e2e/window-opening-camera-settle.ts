import type { SceneDemandSnapshot } from "../../components/scene/sceneDemandDiagnostics";

type CameraDemandState = Pick<SceneDemandSnapshot,
  "instrumentationGeneration" | "rendererCalls" | "invalidationCalls" |
  "pendingInvalidation" | "activeItemAnimationCount" |
  "activeControlTransitionCount" | "activeSupportedAnimationCount">;

export type CameraState = {
  projection: "orthographic" | "perspective";
  position: [number, number, number];
  quaternion: [number, number, number, number];
  target: [number, number, number];
  zoom: number;
  fov: number | null;
  near: number;
  far: number;
};

export type CameraSettleConfig = {
  maximumDurationMs: number;
  minimumStableDurationMs: number;
  requiredStableSamples: number;
  expectedDampingFactor: number;
  positionTolerance: number;
  quaternionTolerance: number;
  targetTolerance: number;
  zoomTolerance: number;
};

type CameraMotion = {
  positionDistance: number;
  quaternionDistance: number;
  targetDistance: number;
  zoomDistance: number;
};

type CameraSettleSample = {
  demand: CameraDemandState;
  observation: "initial" | "advancing-render" | "idle-demand" | "unsettled";
  renderFrame: number;
  elapsedMs: number;
  camera: CameraState;
  motion: CameraMotion | null;
  projectedTailMotion: CameraMotion | null;
  stableWindowMotion: CameraMotion | null;
  stable: boolean;
  stableSamples: number;
  dampingFactor: number;
};

export type CameraSettleResult = {
  status: "settled" | "timed-out";
  reason: string;
  elapsedMs: number;
  renderFramesObserved: number;
  stableSamples: number;
  dampingFactor: number;
  lastRenderFrame: number;
  lastState: CameraState;
  samples: CameraSettleSample[];
};

export const WINDOW_OPENING_CAMERA_SETTLE_CONFIG: CameraSettleConfig = {
  maximumDurationMs: 20_000,
  minimumStableDurationMs: 50,
  requiredStableSamples: 2,
  expectedDampingFactor: 0.08,
  positionTolerance: 0.005,
  quaternionTolerance: 0.0005,
  targetTolerance: 0.001,
  zoomTolerance: 0.001,
};

export function cameraMotion(first: CameraState, second: CameraState): CameraMotion {
  const distance = (left: number[], right: number[]) => Math.hypot(
    ...left.map((value, index) => value - right[index])
  );
  const positiveQuaternion = distance(first.quaternion, second.quaternion);
  const negativeQuaternion = distance(
    first.quaternion,
    second.quaternion.map((value) => -value)
  );
  return {
    positionDistance: distance(first.position, second.position),
    quaternionDistance: Math.min(positiveQuaternion, negativeQuaternion),
    targetDistance: distance(first.target, second.target),
    zoomDistance: Math.abs(first.zoom - second.zoom),
  };
}

export function cameraTransition(first: CameraState, second: CameraState) {
  const direction = (camera: CameraState) => {
    const vector = camera.target.map((value, index) => value - camera.position[index]);
    const length = Math.hypot(...vector);
    return vector.map((value) => value / length);
  };
  const firstDirection = direction(first);
  const secondDirection = direction(second);
  const cosine = Math.max(-1, Math.min(1, firstDirection.reduce(
    (sum, value, index) => sum + value * secondDirection[index], 0
  )));
  return {
    angleDeg: Math.acos(cosine) * 180 / Math.PI,
    positionDistance: Math.hypot(...first.position.map(
      (value, index) => value - second.position[index])),
    targetDrift: Math.hypot(...first.target.map(
      (value, index) => value - second.target[index])),
  };
}

/** Runs in the page so trace snapshots cannot throttle the settle sampling cadence. */
export async function observeCameraSettleOnRenderFrames(
  config: CameraSettleConfig
): Promise<CameraSettleResult> {
  const distance = (first: number[], second: number[]) => Math.hypot(
    ...first.map((value, index) => value - second[index])
  );
  const read = () => {
    const root = document.documentElement;
    const rawState = root.dataset.qaCameraState;
    const rawFrame = root.dataset.qaCameraRenderFrame;
    const rawDampingEnabled = root.dataset.qaCameraDampingEnabled;
    const rawDampingFactor = root.dataset.qaCameraDampingFactor;
    if (!rawState || !rawFrame || !rawDampingFactor || rawDampingEnabled !== "true") {
      throw new Error("Production QA camera, render progress, or damping state is unavailable.");
    }
    const renderFrame = Number(rawFrame);
    if (!Number.isSafeInteger(renderFrame) || renderFrame <= 0) {
      throw new Error(`Invalid production QA camera render frame: ${rawFrame}.`);
    }
    const dampingFactor = Number(rawDampingFactor);
    if (!Number.isFinite(dampingFactor) || dampingFactor <= 0 || dampingFactor >= 1) {
      throw new Error(`Unexpected production OrbitControls damping factor: ${rawDampingFactor}.`);
    }
    const state: CameraState = JSON.parse(rawState);
    // The existing diagnostic owner returns a snapshot; retain only the counters
    // needed to distinguish a genuinely idle demand canvas from stalled work.
    const diagnostics = globalThis as typeof globalThis & {
      __INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__?: () => SceneDemandSnapshot;
    };
    const snapshot = diagnostics.__INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__?.();
    if (!snapshot || snapshot.schema !== "interior-ai.scene-demand-diagnostics.v1" ||
        snapshot.version !== 1 || !Number.isSafeInteger(snapshot.instrumentationGeneration) ||
        snapshot.instrumentationGeneration <= 0 || !Number.isSafeInteger(snapshot.rendererCalls) ||
        snapshot.rendererCalls <= 0 || !Number.isFinite(snapshot.lastRendererCallAtMs) ||
        snapshot.lastRendererCallAtMs === null || snapshot.lastRendererCallAtMs < 0 ||
        !Number.isSafeInteger(snapshot.invalidationCalls) || snapshot.invalidationCalls < 0 ||
        typeof snapshot.pendingInvalidation !== "boolean" ||
        [snapshot.activeItemAnimationCount, snapshot.activeControlTransitionCount,
          snapshot.activeSupportedAnimationCount].some((count) => !Number.isSafeInteger(count) || count < 0)) {
      throw new Error("Production scene demand diagnostics are unavailable or invalid.");
    }
    const demand: CameraDemandState = {
      instrumentationGeneration: snapshot.instrumentationGeneration,
      rendererCalls: snapshot.rendererCalls,
      invalidationCalls: snapshot.invalidationCalls,
      pendingInvalidation: snapshot.pendingInvalidation,
      activeItemAnimationCount: snapshot.activeItemAnimationCount,
      activeControlTransitionCount: snapshot.activeControlTransitionCount,
      activeSupportedAnimationCount: snapshot.activeSupportedAnimationCount,
    };
    const inactive = !demand.pendingInvalidation && demand.activeItemAnimationCount === 0 &&
      demand.activeControlTransitionCount === 0 && demand.activeSupportedAnimationCount === 0;
    return { renderFrame, state, dampingFactor, demand, inactive,
      visible: document.visibilityState === "visible" };

  };
  const motion = (first: CameraState, second: CameraState): CameraMotion => {
    const positiveQuaternion = distance(first.quaternion, second.quaternion);
    const negativeQuaternion = distance(first.quaternion, second.quaternion.map((value) => -value));
    return {
      positionDistance: distance(first.position, second.position),
      quaternionDistance: Math.min(positiveQuaternion, negativeQuaternion),
      targetDistance: distance(first.target, second.target),
      zoomDistance: Math.abs(first.zoom - second.zoom),
    };
  };
  const scaleMotion = (value: CameraMotion, multiplier: number): CameraMotion => ({
    positionDistance: value.positionDistance * multiplier,
    quaternionDistance: value.quaternionDistance * multiplier,
    targetDistance: value.targetDistance * multiplier,
    zoomDistance: value.zoomDistance * multiplier,
  });
  const withinTolerance = (value: CameraMotion) =>
    value.positionDistance <= config.positionTolerance
    && value.quaternionDistance <= config.quaternionTolerance
    && value.targetDistance <= config.targetTolerance
    && value.zoomDistance <= config.zoomTolerance;
  const startedAt = performance.now();
  const initial = read();
  const samples: CameraSettleSample[] = [{
    demand: initial.demand,
    observation: "initial",
    renderFrame: initial.renderFrame,
    elapsedMs: 0,
    camera: initial.state,
    motion: null,
    projectedTailMotion: null,
    stableWindowMotion: null,
    stable: false,
    stableSamples: 0,
    dampingFactor: initial.dampingFactor,
  }];

  return new Promise((resolve, reject) => {
    let previous = initial;
    let stableSamples = 0;
    let stableSince: number | null = null;
    let stableWindowStart: CameraState | null = null;
    let renderFramesObserved = 0;
    let stableObservation: CameraSettleSample["observation"] | null = null;
    let previousObservationAt = startedAt;
    let animationFrame = 0;
    let finished = false;
    const finish = (status: CameraSettleResult["status"], reason: string) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(animationFrame);
      clearTimeout(timeout);
      resolve({
        status,
        reason,
        elapsedMs: performance.now() - startedAt,
        renderFramesObserved,
        stableSamples,
        dampingFactor: previous.dampingFactor,
        lastRenderFrame: previous.renderFrame,
        lastState: previous.state,
        samples,
      });
    };
    const timeout = setTimeout(() => finish(
      "timed-out",
      `Camera did not settle within ${config.maximumDurationMs}ms.`
    ), config.maximumDurationMs);
    const sample = (now: number) => {
      try {
        const current = read();
        const sameGeneration = current.demand.instrumentationGeneration === previous.demand.instrumentationGeneration;
        if (sameGeneration && (current.renderFrame < previous.renderFrame ||
            current.demand.rendererCalls < previous.demand.rendererCalls ||
            current.demand.invalidationCalls < previous.demand.invalidationCalls)) {
          throw new Error("Camera demand counters regressed within one renderer generation.");
        }
        const advanced = sameGeneration && current.renderFrame > previous.renderFrame;
        if (advanced) renderFramesObserved += 1;
        const delta = motion(previous.state, current.state);
        const projectedTail = scaleMotion(delta, 1 / Math.min(current.dampingFactor, config.expectedDampingFactor));
        const countersUnchanged = sameGeneration && current.renderFrame === previous.renderFrame &&
          current.demand.rendererCalls === previous.demand.rendererCalls &&
          current.demand.invalidationCalls === previous.demand.invalidationCalls;
        const freshVisible = now > previousObservationAt && current.visible && previous.visible;
        const idle = freshVisible && countersUnchanged && current.inactive && previous.inactive &&
          Math.abs(current.dampingFactor - config.expectedDampingFactor) <= Number.EPSILON;
        const observation: CameraSettleSample["observation"] = idle ? "idle-demand"
          : advanced && freshVisible && current.inactive ? "advancing-render" : "unsettled";
        if (observation !== stableObservation) {
          stableSamples = 0;
          stableSince = null;
          stableWindowStart = null;
        }
        let windowMotion = stableWindowStart ? motion(stableWindowStart, current.state) : null;
        const stable = observation !== "unsettled" && withinTolerance(projectedTail) &&
          (windowMotion === null || withinTolerance(windowMotion));
        if (stable) {
          stableWindowStart ??= previous.state;
          windowMotion = motion(stableWindowStart, current.state);
          stableSamples += 1;
          stableSince ??= now;
        } else {
          stableSamples = 0;
          stableSince = null;
          stableWindowStart = null;
          windowMotion = null;
        }
        samples.push({
          demand: current.demand, observation,
          renderFrame: current.renderFrame, elapsedMs: now - startedAt,
          camera: current.state, motion: delta, projectedTailMotion: projectedTail,
          stableWindowMotion: windowMotion, stable, stableSamples,
          dampingFactor: current.dampingFactor,
        });
        previous = current;
        previousObservationAt = now;
        stableObservation = observation;
        if (stableSamples >= config.requiredStableSamples && stableSince !== null &&
            now - stableSince >= config.minimumStableDurationMs) {
          finish("settled", observation === "idle-demand"
            ? "Camera remained within tolerance across fresh observations of a verified idle demand renderer."
            : "Camera remained within tolerance on advancing render frames.");
          return;
        }
      } catch (error) {
        finished = true;
        cancelAnimationFrame(animationFrame);
        clearTimeout(timeout);
        reject(error);
        return;
      }
      if (!finished) animationFrame = requestAnimationFrame(sample);
    };
    animationFrame = requestAnimationFrame(sample);
  });
}
