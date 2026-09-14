import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useOpeningReleaseClick } from "./useOpeningReleaseClick";
import { Mesh, Plane, Vector3 } from "three";
import type { CompiledFloorPlanOpeningV2 } from "@/lib/floor-plan-compiler-v2";
import { buildOpeningGestureDraft, type CanonicalOpeningDragMetricsV2, type CanonicalOpeningDragMode, type OpeningGestureAnchor } from "@/lib/floor-plan-opening-gesture";
export type { CanonicalOpeningDragMetricsV2, CanonicalOpeningDragMode } from "@/lib/floor-plan-opening-gesture";
export type CanonicalOpeningEditHandler = (openingId: string, metrics: CanonicalOpeningDragMetricsV2, mode: CanonicalOpeningDragMode) => void;
type CaptureTarget = EventTarget & { setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void };
type Input = {
  opening: CompiledFloorPlanOpeningV2; revisionId: string;
  wallStart: { xMm: number; zMm: number }; wallEnd: { xMm: number; zMm: number };
  projection?: "plan" | "wall"; floorY: number; enabled: boolean; onEdit?: CanonicalOpeningEditHandler;
  onDragStateChange?: (dragging: boolean, mode: CanonicalOpeningDragMode) => void;
};
function stopPointer(event: ThreeEvent<PointerEvent>) {
  event.stopPropagation(); event.nativeEvent.stopImmediatePropagation();
}

type Session = { pointerId: number; target: CaptureTarget; nativeTarget: Element; revisionId: string; anchor: OpeningGestureAnchor; draft: CanonicalOpeningDragMetricsV2 | null };

function useOpeningPointerOffset(input: Input) {
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), -input.floorY), [input.floorY]);
  const pointRef = useRef(new Vector3());
  const { wallStart, wallEnd, projection } = input;
  const wallPlane = useMemo(() => new Plane().setFromNormalAndCoplanarPoint(
    new Vector3(wallEnd.zMm - wallStart.zMm, 0, wallStart.xMm - wallEnd.xMm).normalize(),
    new Vector3(wallStart.xMm / 1000, input.floorY, wallStart.zMm / 1000)), [wallStart, wallEnd, input.floorY]);
  return useCallback((event: ThreeEvent<PointerEvent>) => {
    const targetPlane = projection === "wall" && Math.abs(event.ray.direction.dot(wallPlane.normal)) > 0.00001 ? wallPlane : plane;
    const point = event.ray.intersectPlane(targetPlane, pointRef.current);
    const dx = wallEnd.xMm - wallStart.xMm, dz = wallEnd.zMm - wallStart.zMm;
    const length = Math.hypot(dx, dz);
    return point && length > 0 ? ((point.x * 1000 - wallStart.xMm) * dx + (point.z * 1000 - wallStart.zMm) * dz) / length : null;
  }, [plane, wallPlane, projection, wallStart, wallEnd]);
}

function useOpeningCancellation(sessionRef: RefObject<Session | null>, previewRef: RefObject<Mesh | null>, latestRef: RefObject<Input>) {
  const invalidate = useThree((state) => state.invalidate);
  return useCallback(() => {
    const drag = sessionRef.current; sessionRef.current = null;
    if (previewRef.current) previewRef.current.visible = false;
    invalidate();
    if (!drag) return;
    latestRef.current.onDragStateChange?.(false, drag.anchor.mode);
    try { drag.target.releasePointerCapture?.(drag.pointerId); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "NotFoundError")) throw cause; }
  }, [invalidate, latestRef, previewRef, sessionRef]);
}

function useOpeningCancellationEvents(cancel: () => void, sessionRef: RefObject<Session | null>, input: Input) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !sessionRef.current) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancel();
    };
    // R3F clears hover on pointercancel but does not dispatch the object's cancellation handler.
    const pointerCancel = (event: PointerEvent) => { if (sessionRef.current?.pointerId === event.pointerId) cancel(); };
    const lostCapture = (event: PointerEvent) => {
      const drag = sessionRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.buttons) { cancel(); return; }
      // Native lostcapture can precede R3F's pointerup delivery; let that finish first.
      requestAnimationFrame(() => { if (sessionRef.current === drag) cancel(); });
    };
    window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", pointerCancel, true); window.addEventListener("lostpointercapture", lostCapture, true);
    return () => {
      window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", pointerCancel, true); window.removeEventListener("lostpointercapture", lostCapture, true); cancel();
    };
  }, [cancel, sessionRef, input.revisionId, input.opening.id, input.enabled, input.floorY]);
}

function updateOpeningPreview(mesh: Mesh | null, draft: CanonicalOpeningDragMetricsV2 | null, input: Input) {
  if (!mesh) return;
  mesh.visible = Boolean(draft);
  if (!draft) return;
  mesh.position.x = draft.centerMm.xMm / 1000; mesh.position.z = draft.centerMm.zMm / 1000;
  mesh.rotation.y = -Math.atan2(input.wallEnd.zMm - input.wallStart.zMm, input.wallEnd.xMm - input.wallStart.xMm);
  mesh.scale.x = draft.widthMm / 1000;
}

export function useCanonicalOpeningDrag(input: Input) {
  const latestRef = useRef(input), sessionRef = useRef<Session | null>(null), previewRef = useRef<Mesh>(null);
  useLayoutEffect(() => { latestRef.current = input; }, [input]);
  const offsetAt = useOpeningPointerOffset(input), invalidate = useThree((state) => state.invalidate);
  const cancel = useOpeningCancellation(sessionRef, previewRef, latestRef), markRelease = useOpeningReleaseClick();
  useOpeningCancellationEvents(cancel, sessionRef, input);
  const begin = useCallback((edge: "start" | "end" | null, event: ThreeEvent<PointerEvent>) => {
    const current = latestRef.current, pointer = offsetAt(event);
    if (sessionRef.current || !current.enabled || !current.onEdit || event.button !== 0 || pointer === null) return;
    const drag = captureOpeningGesture(current, event, edge, pointer);
    if (!drag) return;
    sessionRef.current = drag;
    current.onDragStateChange?.(true, drag.anchor.mode);
  }, [offsetAt]);
  const move = useCallback((event: ThreeEvent<PointerEvent>) => {
    const drag = sessionRef.current, current = latestRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    stopPointer(event);
    const pointerOffsetMm = offsetAt(event);
    if (pointerOffsetMm === null) return;
    const draft = buildOpeningGestureDraft({ anchor: drag.anchor, pointerOffsetMm, widthMm: current.opening.widthMm,
      wallStart: current.wallStart, wallEnd: current.wallEnd, revisionId: drag.revisionId });
    drag.draft = draft?.offsetMm === current.opening.offsetMm && draft.widthMm === current.opening.widthMm ? null : draft;
    updateOpeningPreview(previewRef.current, drag.draft, current); invalidate();
  }, [offsetAt, invalidate]);
  const finish = useCallback((event: ThreeEvent<PointerEvent>) => {
    const drag = sessionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.nativeTarget.hasPointerCapture(event.pointerId)) { stopPointer(event); cancel(); return; }
    move(event);
    if (drag.draft) markRelease(drag.nativeTarget);
    const current = latestRef.current;
    // The legacy path owns its continuous transaction; the private proposal path commits its own.
    try {
      if (current.enabled && drag.revisionId === current.revisionId && drag.draft) current.onEdit?.(current.opening.id, drag.draft, drag.anchor.mode);
    } finally { cancel(); }
  }, [move, cancel, markRelease]);
  return { previewRef, beginMove: (event: ThreeEvent<PointerEvent>) => begin(null, event),
    beginResize: (edge: "start" | "end", event: ThreeEvent<PointerEvent>) => begin(edge, event), move, finish, cancel: (event: ThreeEvent<PointerEvent>) => { stopPointer(event); cancel(); } };
}

function captureOpeningGesture(current: Input, event: ThreeEvent<PointerEvent>, edge: "start" | "end" | null, pointer: number): Session | null {
  const nativeTarget = event.nativeEvent.target;
  if (!(nativeTarget instanceof Element)) return null;
  stopPointer(event);
  const target = event.target as CaptureTarget;
  target.setPointerCapture?.(event.pointerId);
  const { offsetMm, widthMm } = current.opening;
  const anchor: OpeningGestureAnchor = edge
    ? { mode: "resize", edge, fixedOffsetMm: edge === "start" ? offsetMm + widthMm : offsetMm }
    : { mode: "move", grabDeltaMm: offsetMm + widthMm / 2 - pointer };
  return { target, nativeTarget, pointerId: event.pointerId, revisionId: current.revisionId, anchor, draft: null };
}
