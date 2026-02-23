"use client";

import { useCallback, useRef, useState } from "react";

export function useUndoRedo<T>(initial: T, limit = 50) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);
  const isApplyingRef = useRef(false);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const commit = useCallback(
    (next: T) => {
      if (isApplyingRef.current) return;

      setPast((p) => {
        const np = [...p, present];
        return np.length > limit ? np.slice(np.length - limit) : np;
      });
      setPresent(next);
      setFuture([]);
    },
    [present, limit]
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      const rest = p.slice(0, -1);

      isApplyingRef.current = true;
      setFuture((f) => [present, ...f]);
      setPresent(prev);
      queueMicrotask(() => (isApplyingRef.current = false));

      return rest;
    });
  }, [present]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      const rest = f.slice(1);

      isApplyingRef.current = true;
      setPast((p) => [...p, present]);
      setPresent(next);
      queueMicrotask(() => (isApplyingRef.current = false));

      return rest;
    });
  }, [present]);

  const reset = useCallback((next: T) => {
    setPast([]);
    setFuture([]);
    setPresent(next);
  }, []);

  return {
    past,
    present,
    future,
    setPresent,
    commit,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  };
}
