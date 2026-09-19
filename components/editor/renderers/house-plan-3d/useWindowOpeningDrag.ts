"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import { getCanonicalPlanLine } from "@/lib/wall-segment-geometry";
import type { WallOpening3D, WallSegment3D } from "./geometry";
import { getWindowOpeningHitVolume } from "./windowOpeningGeometry";
import { getWindowDragPosition, type WindowDragBounds } from "./windowOpeningDrag";

export type WindowOpeningDragActions = {
  onMoveOpening?: (id: string, offsetMeters: number, bottomMeters?: number) => void;
  onOpeningDragStateChange?: (dragging: boolean) => void;
};
type Options = WindowOpeningDragActions & {
  opening: WallOpening3D;
  sourceOpening?: RoomRendererOpening;
  segment: WallSegment3D;
  wallHeight: number;
  interactive: boolean;
  hidden: boolean;
};
type DragSession = {
  pointerId: number;
  clientX: number;
  clientY: number;
  origin: THREE.Vector3;
  axis: THREE.Vector3;
  plane: THREE.Plane;
  bounds: WindowDragBounds;
};

function createDragSession(event: ThreeEvent<PointerEvent>, options: Options): DragSession {
  const { opening, sourceOpening, segment, wallHeight } = options;
  const volume = getWindowOpeningHitVolume(segment, opening, wallHeight);
  const axis = new THREE.Vector3(1, 0, 0).transformDirection(event.object.matrixWorld);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(event.object.matrixWorld);
  const sourceAlongX = sourceOpening?.wall === "north" || sourceOpening?.wall === "south";
  // A host-resolved offset runs along the room segment's canonical line (legacyOpeningOffsetAtWorldPoint),
  // so a diagonal wall moves the window 1:1 with the pointer instead of by the axis-aligned cosine.
  const hostResolution = sourceOpening?.hostResolution;
  const hostLine = hostResolution?.status === "resolved" ? getCanonicalPlanLine(hostResolution.host.roomSegment) : null;
  return {
    pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
    origin: event.point.clone(), axis,
    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, event.point),
    bounds: { offset: opening.offset, sourceOffset: sourceOpening?.offset ?? opening.offset,
      sourceDirection: hostLine ? axis.x * hostLine.tangent.x + axis.z * hostLine.tangent.z
        : sourceOpening ? (sourceAlongX ? axis.x : axis.z) : 1,
      width: opening.width, height: volume.height, bottom: volume.bottom,
      wallLength: segment.length, wallHeight },
  };
}

function trackWindowPointer(
  session: DragSession, canvas: HTMLCanvasElement, camera: THREE.Camera,
  onMove: (offset: number, bottom: number) => void, onEnd: () => void
) {
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const oldCursor = canvas.style.cursor;
  let lastPosition = "";
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", end, true);
    window.removeEventListener("pointercancel", end, true);
    window.removeEventListener("blur", finish);
    canvas.removeEventListener("lostpointercapture", end);
    if (canvas.hasPointerCapture(session.pointerId)) canvas.releasePointerCapture(session.pointerId);
    canvas.style.cursor = oldCursor;
    onEnd();
  };
  const end = (event: PointerEvent) => { if (event.pointerId === session.pointerId) finish(); };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== session.pointerId) return;
    if (event.buttons === 0) { finish(); return; }
    event.stopImmediatePropagation();
    event.preventDefault();
    if (!lastPosition && Math.hypot(event.clientX - session.clientX, event.clientY - session.clientY) < 3) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(session.plane, point)) return;
    point.sub(session.origin);
    const position = getWindowDragPosition(session.bounds, point.dot(session.axis), point.y);
    const key = `${position.offsetMeters}:${position.bottomMeters}`;
    if (key === lastPosition) return;
    lastPosition = key;
    onMove(position.offsetMeters, position.bottomMeters);
  };
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture(session.pointerId);
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener("blur", finish);
  canvas.addEventListener("lostpointercapture", end);
  return finish;
}

/** Native pointer capture keeps the drag alive over wall solids and outside the aperture. */
export function useWindowOpeningDrag(options: Options) {
  const { camera, gl } = useThree();
  const latest = useRef(options);
  const finishRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { latest.current = options; });
  useEffect(() => () => { finishRef.current?.(); }, []);
  useEffect(() => {
    if (options.hidden || !options.interactive) finishRef.current?.();
  }, [options.hidden, options.interactive]);
  return (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !options.interactive || !options.onMoveOpening) return;
    finishRef.current?.();
    const session = createDragSession(event, options);
    options.onOpeningDragStateChange?.(true);
    finishRef.current = trackWindowPointer(session, gl.domElement, camera,
      (offset, bottom) => latest.current.onMoveOpening?.(options.opening.sourceId, offset, bottom),
      () => { finishRef.current = null; latest.current.onOpeningDragStateChange?.(false); });
  };
}
