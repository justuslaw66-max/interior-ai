"use client";

import { useEffect, useState } from "react";

type Schedule = (task: () => void) => void;

/**
 * Tells a real unmount from a remount. React can run an effect's cleanup and then the effect
 * again straight away while keeping the component's state: Strict Mode does it in development,
 * for example whenever a client-side navigation (back from My designs) opens the editor. Work
 * cancelled there would never restart, so the cancel waits a microtask and only runs if the
 * component didn't come back.
 */
export function createUnmountCancellation(schedule: Schedule = queueMicrotask) {
  let mounted = false;
  return {
    mount() {
      mounted = true;
    },
    unmount(cancel: () => void) {
      mounted = false;
      schedule(() => {
        if (!mounted) cancel();
      });
    },
  };
}

/** Runs `cancel` when the component unmounts for good, not when React remounts it. */
export function useCancelOnUnmount(cancel: () => void) {
  const [cancellation] = useState(createUnmountCancellation);
  useEffect(() => {
    cancellation.mount();
    return () => cancellation.unmount(cancel);
  }, [cancel, cancellation]);
}
