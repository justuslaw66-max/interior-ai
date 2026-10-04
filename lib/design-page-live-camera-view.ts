import type { CameraView } from "@/lib/design-page-types";

/**
 * The live camera view, kept out of React state while the camera moves.
 *
 * Orbiting used to store every frame's camera in page state, so the whole
 * design page re-rendered on every frame. Now the controls publish the live
 * view to a small store (read only by the navigator), and the page's
 * `cameraView` is committed once the motion has settled. Pure: no React, no
 * three, so `tsx` can test it.
 */

/** Smaller moves than this (metres, degrees of fov) don't count as a change. */
export const CAMERA_VIEW_POSITION_EPSILON = 0.001;
export const CAMERA_VIEW_FOV_EPSILON = 0.01;
const DEFAULT_FOV = 45;

/**
 * How long the controls must stay quiet before the view is committed. The
 * controls keep firing while damping glides the camera after the pointer is
 * released, so this waits for the glide to end, not for pointer-up.
 */
export const CAMERA_VIEW_SETTLE_MS = 150;

export function cameraViewChanged(previous: CameraView, next: CameraView) {
  const moved = (a: readonly number[], b: readonly number[]) =>
    a.some((value, index) => Math.abs(value - b[index]) > CAMERA_VIEW_POSITION_EPSILON);
  return (
    moved(previous.pos, next.pos) ||
    moved(previous.target, next.target) ||
    Math.abs((previous.fov ?? DEFAULT_FOV) - (next.fov ?? DEFAULT_FOV)) >
      CAMERA_VIEW_FOV_EPSILON
  );
}

type Vector3Like = { x: number; y: number; z: number };

/** The parts of OrbitControls the live view reads (its camera and target). */
export type CameraViewControls = {
  object: { position: Vector3Like; fov?: unknown };
  target: Vector3Like;
};

export function readCameraViewFromControls({
  object,
  target,
}: CameraViewControls): CameraView {
  return {
    pos: [object.position.x, object.position.y, object.position.z],
    target: [target.x, target.y, target.z],
    fov: typeof object.fov === "number" ? object.fov : undefined,
  };
}

export type LiveCameraViewStore = {
  getSnapshot: () => CameraView;
  publish: (view: CameraView) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createLiveCameraViewStore(initial: CameraView): LiveCameraViewStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    publish: (view) => {
      if (!cameraViewChanged(snapshot, view)) return;
      snapshot = view;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SettleTimers = {
  set: (callback: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
};

/** A trailing timer: each schedule() replaces the pending callback. */
export function createSettleTimer(timers: SettleTimers, delayMs: number) {
  let handle: unknown = null;
  const cancel = () => {
    if (handle === null) return;
    timers.clear(handle);
    handle = null;
  };
  return {
    schedule: (callback: () => void) => {
      cancel();
      handle = timers.set(() => {
        handle = null;
        callback();
      }, delayMs);
    },
    cancel,
    pending: () => handle !== null,
  };
}
