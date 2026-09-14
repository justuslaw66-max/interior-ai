import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { useThree } from "@react-three/fiber";
import { Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3, type BufferGeometry } from "three";
import type { CanonicalFloorPlanWallRenderModel } from "@/lib/floor-plan-render-model";
import { buildWallGestureDraft, type CanonicalWallGestureControls, type WallGestureMode } from "@/lib/floor-plan-wall-gesture";

type Draft = NonNullable<ReturnType<typeof buildWallGestureDraft>>;
type Drag = { pointerId: number; mode: WallGestureMode; revisionId: string; origin: { xMm: number; zMm: number }; element: HTMLButtonElement; draft: Draft | null };
type Input = { wall: CanonicalFloorPlanWallRenderModel; floorId: string; revisionId: string; controls: CanonicalWallGestureControls };

type PreviewMesh = Mesh<BufferGeometry, MeshBasicMaterial>;
function useWallPointerProjection() {
  const { camera, gl } = useThree();
  const projection = useRef({ raycaster: new Raycaster(), pointer: new Vector2(), plane: new Plane(new Vector3(0, 1, 0), 0), point: new Vector3() });
  return useCallback((event: { clientX: number; clientY: number }) => {
    const bounds = gl.domElement.getBoundingClientRect(), tools = projection.current;
    if (!bounds.width || !bounds.height) return null;
    tools.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    tools.raycaster.setFromCamera(tools.pointer, camera);
    const point = tools.raycaster.ray.intersectPlane(tools.plane, tools.point);
    return point ? { xMm: point.x * 1000, zMm: point.z * 1000 } : null;
  }, [camera, gl]);
}

function useWallDragCancellation(sessionRef: RefObject<Drag | null>, previewRef: RefObject<PreviewMesh | null>, latestRef: RefObject<Input>,
  revisionId: string, enabled: boolean, wallId: string, floorId: string) {
  const invalidate = useThree((state) => state.invalidate);
  const cancel = useCallback(() => {
    const drag = sessionRef.current; sessionRef.current = null;
    if (previewRef.current) previewRef.current.visible = false;
    invalidate();
    if (!drag) return;
    latestRef.current.controls.setDragging(false);
    releaseWallPointer(drag);
  }, [latestRef, previewRef, sessionRef, invalidate]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sessionRef.current) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); }
    };
    window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel); cancel(); };
  }, [cancel, revisionId, enabled, wallId, floorId, sessionRef]);
  return cancel;
}

function useWallKeyboardNudge(latestRef: RefObject<Input>, sessionRef: RefObject<Drag | null>,
  draftAt: (mode: WallGestureMode, delta: { xMm: number; zMm: number }) => Draft | null) {
  return useCallback((mode: WallGestureMode, key: string, shift: boolean) => {
    if (!latestRef.current.controls.enabled || sessionRef.current) return false;
    const step = shift ? 100 : 10;
    const delta = key === "ArrowLeft" ? { xMm: -step, zMm: 0 } : key === "ArrowRight" ? { xMm: step, zMm: 0 }
      : key === "ArrowUp" ? { xMm: 0, zMm: -step } : key === "ArrowDown" ? { xMm: 0, zMm: step } : null;
    const draft = delta && draftAt(mode, delta);
    if (!draft) return false;
    latestRef.current.controls.commit(draft.operation, latestRef.current.revisionId); return true;
  }, [draftAt, latestRef, sessionRef]);
}

export function useCanonicalWallDrag(input: Input) {
  const latestRef = useRef(input);
  useLayoutEffect(() => { latestRef.current = input; }, [input]);
  const sessionRef = useRef<Drag | null>(null);
  const previewRef = useRef<PreviewMesh>(null);
  const pointAt = useWallPointerProjection();
  const invalidate = useThree((state) => state.invalidate);
  const cancel = useWallDragCancellation(sessionRef, previewRef, latestRef, input.revisionId, input.controls.enabled, input.wall.id, input.floorId);
  const draftAt = useCallback((mode: WallGestureMode, delta: { xMm: number; zMm: number }) => {
    const { wall, floorId } = latestRef.current;
    const start = wall.centerlineSegments[0]?.start, end = wall.centerlineSegments.at(-1)?.end;
    return start && end ? buildWallGestureDraft({ floorId, wallId: wall.id, path: wall.path, start, end, mode, delta }) : null;
  }, []);
  const begin = useCallback((mode: WallGestureMode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!latestRef.current.controls.enabled || event.button !== 0 || latestRef.current.wall.path.kind !== "line") return;
    const origin = pointAt(event);
    if (!origin) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    sessionRef.current = { mode, pointerId: event.pointerId, revisionId: latestRef.current.revisionId, origin, element: event.currentTarget, draft: null };
    latestRef.current.controls.setDragging(true);
  }, [pointAt]);
  const move = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sessionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointAt(event);
    if (!point) return;
    drag.draft = draftAt(drag.mode, { xMm: point.xMm - drag.origin.xMm, zMm: point.zMm - drag.origin.zMm });
    updatePreview(previewRef.current, drag.draft);
    invalidate();
  }, [draftAt, pointAt, invalidate]);
  const finish = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sessionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    move(event); const draft = drag.draft; cancel();
    if (draft) latestRef.current.controls.commit(draft.operation, drag.revisionId);
  }, [cancel, move]);
  const nudge = useWallKeyboardNudge(latestRef, sessionRef, draftAt);
  return { previewRef, begin, move, finish, cancel, nudge };
}

function updatePreview(mesh: Mesh<BufferGeometry, MeshBasicMaterial> | null, draft: Draft | null) {
  if (!mesh) return;
  mesh.visible = Boolean(draft);
  if (!draft) return;
  const dx = draft.end.xMm - draft.start.xMm, dz = draft.end.zMm - draft.start.zMm;
  const length = Math.hypot(dx, dz);
  mesh.position.set((draft.start.xMm + draft.end.xMm) / 2000, 0.09, (draft.start.zMm + draft.end.zMm) / 2000);
  mesh.rotation.y = -Math.atan2(dz, dx); mesh.scale.x = Math.max(0.04, length / 1000);
  mesh.material.color.set(length ? "#2563eb" : "#dc2626");
}

function releaseWallPointer(drag: Drag) {
  try {
    if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
  } catch (cause) {
    // Cancellation can remove the active pointer before pending capture is released.
    if (!(cause instanceof DOMException && cause.name === "NotFoundError")) throw cause;
  }
}
