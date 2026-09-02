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
    if (!Number.isSafeInteger(renderFrame)) {
      throw new Error(`Invalid production QA camera render frame: ${rawFrame}.`);
    }
    const dampingFactor = Number(rawDampingFactor);
    if (!Number.isFinite(dampingFactor) || dampingFactor <= 0 || dampingFactor >= 1 ||
        Math.abs(dampingFactor - config.expectedDampingFactor) > Number.EPSILON) {
      throw new Error(`Unexpected production OrbitControls damping factor: ${rawDampingFactor}.`);
    }
    const state: CameraState = JSON.parse(rawState);
    return { renderFrame, state, dampingFactor };
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

  return new Promise((resolve) => {
    let previous = initial;
    let stableSamples = 0;
    let stableSince: number | null = null;
    let stableWindowStart: CameraState | null = null;
    let renderFramesObserved = 0;
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
        dampingFactor: initial.dampingFactor,
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
      const current = read();
      if (current.renderFrame !== previous.renderFrame) {
        renderFramesObserved += 1;
        const delta = motion(previous.state, current.state);
        const projectedTail = scaleMotion(delta, 1 / current.dampingFactor);
        let windowMotion = stableWindowStart ? motion(stableWindowStart, current.state) : null;
        const stable = withinTolerance(projectedTail) &&
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
          renderFrame: current.renderFrame,
          elapsedMs: now - startedAt,
          camera: current.state,
          motion: delta,
          projectedTailMotion: projectedTail,
          stableWindowMotion: windowMotion,
          stable,
          stableSamples,
          dampingFactor: current.dampingFactor,
        });
        previous = current;
        if (stableSamples >= config.requiredStableSamples && stableSince !== null &&
            now - stableSince >= config.minimumStableDurationMs) {
          finish("settled", "Camera remained within tolerance on advancing render frames.");
          return;
        }
      }
      if (!finished) animationFrame = requestAnimationFrame(sample);
    };
    animationFrame = requestAnimationFrame(sample);
  });
}
