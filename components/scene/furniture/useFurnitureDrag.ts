import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Plane, Vector3 } from "three";

type Position = [number, number, number];
type Input = {
  identity: string; interactive: boolean; locked?: boolean;
  onStart: () => void;
  onFinish: (cancelled: boolean, position: Position) => void;
};
type Gesture = {
  pointerId: number; target: Element; start: Position; accepted: Position;
  plane: Plane; offset: Vector3;
};

function useFurnitureDragCancellation(finish: (cancelled: boolean) => void, active: React.RefObject<Gesture | null>, identity: string, enabled: boolean) {
  useEffect(() => {
    const cancel = () => finish(true);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancel();
    };
    const pointerCancel = (event: PointerEvent) => { if (active.current?.pointerId === event.pointerId) cancel(); };
    const lostCapture = (event: PointerEvent) => {
      const gesture = active.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (event.buttons) { cancel(); return; }
      requestAnimationFrame(() => { if (active.current === gesture) cancel(); });
    };
    window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", pointerCancel, true); window.addEventListener("lostpointercapture", lostCapture, true);
    return () => {
      window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", pointerCancel, true); window.removeEventListener("lostpointercapture", lostCapture, true); cancel();
    };
  }, [active, enabled, finish, identity]);
}

/** Preserve the grabbed point and route interruptions through the existing scene-item history rollback. */
export function useFurnitureDrag(input: Input) {
  const latest = useRef(input), active = useRef<Gesture | null>(null), point = useRef(new Vector3());
  const enabled = input.interactive && !input.locked;
  useLayoutEffect(() => { latest.current = input; }, [input]);
  const finish = useCallback((cancelled: boolean) => {
    const gesture = active.current; active.current = null;
    if (!gesture) return;
    try { gesture.target.releasePointerCapture(gesture.pointerId); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "NotFoundError")) throw cause; }
    latest.current.onFinish(cancelled, cancelled ? gesture.start : gesture.accepted);
  }, []);
  useFurnitureDragCancellation(finish, active, input.identity, enabled);
  const begin = (event: ThreeEvent<PointerEvent>, position: Position) => {
    if (!enabled || event.button !== 0 || active.current) return;
    const plane = new Plane(new Vector3(0, 1, 0), -event.point.y);
    const hit = event.ray.intersectPlane(plane, point.current);
    if (!hit) return;
    // R3F's event target supplies synthetic capture methods on the intersected object.
    const target = event.target as unknown as Element;
    target.setPointerCapture(event.pointerId);
    active.current = { pointerId: event.pointerId, target, start: [...position], accepted: [...position], plane,
      offset: new Vector3(position[0] - hit.x, 0, position[2] - hit.z) };
    input.onStart();
  };
  const project = (event: ThreeEvent<PointerEvent>) => {
    const gesture = active.current;
    if (!enabled || !gesture || gesture.pointerId !== event.pointerId) return null;
    const hit = event.ray.intersectPlane(gesture.plane, point.current);
    return hit ? hit.add(gesture.offset) : null;
  };
  const accept = (position: Position) => { if (active.current) active.current.accepted = position; };
  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (active.current?.pointerId !== event.pointerId) return;
    event.stopPropagation(); finish(false);
  };
  return { begin, project, accept, onPointerUp };
}
