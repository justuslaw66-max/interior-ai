"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { CameraView } from "@/lib/design-page-types";
import {
  CAMERA_VIEW_SETTLE_MS,
  createLiveCameraViewStore,
  createSettleTimer,
  readCameraViewFromControls,
  type LiveCameraViewStore,
  type SettleTimers,
} from "@/lib/design-page-live-camera-view";

export type { LiveCameraViewStore };

/**
 * Owns the live camera store beside the committed `cameraView` state. Every
 * commit (a transition's end, a named view, a fit, a settled orbit) syncs the
 * ref and the store; live orbit frames reach the ref through the store, so
 * `cameraViewRef` always holds the latest view.
 */
export function useLiveCameraViewStore(
  cameraView: CameraView,
  cameraViewRef: MutableRefObject<CameraView>
) {
  const [store] = useState(() => createLiveCameraViewStore(cameraView));
  useEffect(
    () =>
      store.subscribe(() => {
        cameraViewRef.current = store.getSnapshot();
      }),
    [cameraViewRef, store]
  );
  useEffect(() => {
    cameraViewRef.current = cameraView;
    store.publish(cameraView);
  }, [cameraView, cameraViewRef, store]);
  return store;
}

/** Re-renders only the caller (the navigator) as the camera moves. */
export function useLiveCameraView(store: LiveCameraViewStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

const windowTimers: SettleTimers = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (handle) => window.clearTimeout(handle as number),
};

type OrbitCameraRefs = {
  orbitControls: MutableRefObject<OrbitControlsImpl | null>;
  cameraAnimating: MutableRefObject<boolean>;
  liveCameraView: LiveCameraViewStore;
};

/**
 * The OrbitControls `onChange` handler. Each change publishes the live view;
 * `commit` (which sets the page's `cameraView` state) runs once the controls
 * have been quiet for CAMERA_VIEW_SETTLE_MS, after damping's glide. A camera
 * transition commits its own end view, so its frames are skipped.
 */
export function useSettledOrbitCameraView(refs: OrbitCameraRefs, commit: () => void) {
  // The `Ref` names let the React Compiler see these as refs, not reactive values.
  const { orbitControls: orbitControlsRef, cameraAnimating: cameraAnimatingRef, liveCameraView } = refs;
  const [settleTimer] = useState(() =>
    createSettleTimer(windowTimers, CAMERA_VIEW_SETTLE_MS)
  );
  useEffect(() => () => settleTimer.cancel(), [settleTimer]);
  return useCallback(() => {
    const controls = orbitControlsRef.current;
    if (cameraAnimatingRef.current || !controls) return;
    liveCameraView.publish(readCameraViewFromControls(controls));
    settleTimer.schedule(() => {
      if (!cameraAnimatingRef.current) commit();
    });
  }, [cameraAnimatingRef, commit, liveCameraView, orbitControlsRef, settleTimer]);
}
