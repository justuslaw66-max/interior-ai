"use client";

import { useLayoutEffect, type MutableRefObject } from "react";

/**
 * Updates a late-bound callback bridge before passive hydration effects run.
 *
 * Design-page startup has a few dependency cycles where an early hydration
 * hook must call an action assembled later in the workspace. Keeping the
 * assignment in a layout effect avoids render-time ref mutation while making
 * the real action available before those passive effects execute.
 */
export function useDesignPageLateBoundRef<T>(
  targetRef: MutableRefObject<T>,
  value: T
): void {
  useLayoutEffect(() => {
    targetRef.current = value;
  }, [targetRef, value]);
}
