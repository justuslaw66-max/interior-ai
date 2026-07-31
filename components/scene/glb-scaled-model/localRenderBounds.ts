export type GLBLocalRenderBounds = {
  center: [number, number, number];
  size: [number, number, number];
};

export const GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS = 1e-6;

export function isValidGLBLocalRenderBounds(
  bounds: GLBLocalRenderBounds
): boolean {
  return (
    bounds.center.every(Number.isFinite) &&
    bounds.size.every((value) => Number.isFinite(value) && value >= 0)
  );
}

export function areGLBLocalRenderBoundsEquivalent(
  left: GLBLocalRenderBounds | null,
  right: GLBLocalRenderBounds | null,
  toleranceMeters = GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS
): boolean {
  if (!left || !right) return left === right;
  if (
    !isValidGLBLocalRenderBounds(left) ||
    !isValidGLBLocalRenderBounds(right)
  ) {
    return false;
  }
  if (left === right) return true;

  const tolerance =
    Number.isFinite(toleranceMeters) && toleranceMeters >= 0
      ? toleranceMeters
      : GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS;

  return (
    left.center.every(
      (value, index) => Math.abs(value - right.center[index]) <= tolerance
    ) &&
    left.size.every(
      (value, index) => Math.abs(value - right.size[index]) <= tolerance
    )
  );
}

export type GLBLocalRenderBoundsObservation =
  | { outcome: "changed"; bounds: GLBLocalRenderBounds }
  | { outcome: "equivalent"; bounds: GLBLocalRenderBounds }
  | { outcome: "reset"; bounds: null }
  | { outcome: "empty"; bounds: null }
  | { outcome: "invalid"; bounds: null };

export type GLBLocalRenderBoundsTracker = {
  lastBounds: GLBLocalRenderBounds | null;
  materialChangeCount: number;
};

export function createGLBLocalRenderBoundsTracker(): GLBLocalRenderBoundsTracker {
  return {
    lastBounds: null,
    materialChangeCount: 0,
  };
}

/**
 * Records model-local bounds as a semantic value. Changed bounds are copied so
 * consumers cannot mutate the tracker's comparison baseline.
 */
export function observeGLBLocalRenderBounds(
  tracker: GLBLocalRenderBoundsTracker,
  nextBounds: GLBLocalRenderBounds | null
): GLBLocalRenderBoundsObservation {
  if (!nextBounds) {
    if (!tracker.lastBounds) return { outcome: "empty", bounds: null };
    tracker.lastBounds = null;
    return { outcome: "reset", bounds: null };
  }
  if (!isValidGLBLocalRenderBounds(nextBounds)) {
    return { outcome: "invalid", bounds: null };
  }
  if (
    areGLBLocalRenderBoundsEquivalent(tracker.lastBounds, nextBounds)
  ) {
    return {
      outcome: "equivalent",
      bounds: tracker.lastBounds ?? nextBounds,
    };
  }

  const snapshot: GLBLocalRenderBounds = {
    center: [...nextBounds.center],
    size: [...nextBounds.size],
  };
  tracker.lastBounds = snapshot;
  tracker.materialChangeCount += 1;
  return { outcome: "changed", bounds: snapshot };
}
