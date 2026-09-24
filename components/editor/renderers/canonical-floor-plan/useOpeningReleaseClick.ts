import { useCallback, useEffect, useRef } from "react";

/** Consume the click synthesized from a completed drag before R3F can select an underlying surface. */
export function useOpeningReleaseClick() {
  const releaseRef = useRef<Element | null>(null);
  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const target = releaseRef.current; releaseRef.current = null;
      if (target && event.target === target) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("click", click, true);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      releaseRef.current = null;
    };
  }, []);
  return useCallback((target: Element) => {
    releaseRef.current = target;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => { releaseRef.current = null; frameRef.current = null; });
  }, []);
}
