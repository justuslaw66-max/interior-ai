import { useCallback, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Plane, Vector3 } from "three";

import type { CompiledFloorPlanOpeningV2 } from "@/lib/floor-plan-compiler-v2";

export type CanonicalOpeningDragMetricsV2 = {
  centerMm: { xMm: number; zMm: number };
  widthMm: number;
};

export type CanonicalOpeningDragMode = "move" | "resize";

function capturePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as EventTarget & {
    setPointerCapture?: (pointerId: number) => void;
  };
  target.setPointerCapture?.(event.pointerId);
}

function releasePointer(event: ThreeEvent<PointerEvent>) {
  const target = event.target as EventTarget & {
    releasePointerCapture?: (pointerId: number) => void;
  };
  target.releasePointerCapture?.(event.pointerId);
}

export function useCanonicalOpeningDrag({
  opening,
  wallStart,
  wallEnd,
  floorY,
  enabled,
  onEdit,
  onDragStateChange,
}: {
  opening: CompiledFloorPlanOpeningV2;
  wallStart: { xMm: number; zMm: number };
  wallEnd: { xMm: number; zMm: number };
  floorY: number;
  enabled: boolean;
  onEdit?: (
    openingId: string,
    metrics: CanonicalOpeningDragMetricsV2,
    mode: CanonicalOpeningDragMode
  ) => void;
  onDragStateChange?: (dragging: boolean, mode: CanonicalOpeningDragMode) => void;
}) {
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), -floorY), [floorY]);
  const pointRef = useRef(new Vector3());
  const dragRef = useRef<
    | { pointerId: number; mode: "move"; grabDeltaMm: number }
    | { pointerId: number; mode: "resize"; fixedOffsetMm: number }
    | null
  >(null);
  const dx = wallEnd.xMm - wallStart.xMm;
  const dz = wallEnd.zMm - wallStart.zMm;
  const wallLengthMm = Math.hypot(dx, dz);

  const pointerOffsetMm = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const point = event.ray.intersectPlane(plane, pointRef.current);
      if (!point || wallLengthMm <= 0) return null;
      const xMm = point.x * 1000;
      const zMm = point.z * 1000;
      return (
        ((xMm - wallStart.xMm) * dx + (zMm - wallStart.zMm) * dz) /
        wallLengthMm
      );
    },
    [dx, dz, plane, wallLengthMm, wallStart.xMm, wallStart.zMm]
  );

  const emit = useCallback(
    (offsetMm: number, widthMm: number, mode: CanonicalOpeningDragMode) => {
      if (!onEdit || wallLengthMm <= 0) return;
      const centerOffsetMm = offsetMm + widthMm / 2;
      onEdit(
        opening.id,
        {
          centerMm: {
            xMm: Math.round(wallStart.xMm + (dx * centerOffsetMm) / wallLengthMm),
            zMm: Math.round(wallStart.zMm + (dz * centerOffsetMm) / wallLengthMm),
          },
          widthMm: Math.round(widthMm),
        },
        mode
      );
    },
    [dx, dz, onEdit, opening.id, wallLengthMm, wallStart.xMm, wallStart.zMm]
  );

  const beginMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!enabled) return;
      const pointer = pointerOffsetMm(event);
      if (pointer === null) return;
      event.stopPropagation();
      capturePointer(event);
      dragRef.current = {
        pointerId: event.pointerId,
        mode: "move",
        grabDeltaMm: opening.offsetMm + opening.widthMm / 2 - pointer,
      };
      onDragStateChange?.(true, "move");
    },
    [enabled, onDragStateChange, opening.offsetMm, opening.widthMm, pointerOffsetMm]
  );

  const beginResize = useCallback(
    (edge: "start" | "end", event: ThreeEvent<PointerEvent>) => {
      if (!enabled) return;
      event.stopPropagation();
      capturePointer(event);
      dragRef.current = {
        pointerId: event.pointerId,
        mode: "resize",
        fixedOffsetMm:
          edge === "start" ? opening.offsetMm + opening.widthMm : opening.offsetMm,
      };
      onDragStateChange?.(true, "resize");
    },
    [enabled, onDragStateChange, opening.offsetMm, opening.widthMm]
  );

  const move = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const pointer = pointerOffsetMm(event);
      if (pointer === null) return;
      event.stopPropagation();
      if (drag.mode === "move") {
        const halfWidth = opening.widthMm / 2;
        const center = Math.min(
          wallLengthMm - halfWidth,
          Math.max(halfWidth, pointer + drag.grabDeltaMm)
        );
        emit(center - halfWidth, opening.widthMm, "move");
        return;
      }
      const minimumWidthMm = 400;
      let moving = Math.min(wallLengthMm, Math.max(0, pointer));
      if (Math.abs(moving - drag.fixedOffsetMm) < minimumWidthMm) {
        moving = Math.min(
          wallLengthMm,
          Math.max(
            0,
            drag.fixedOffsetMm + (moving >= drag.fixedOffsetMm ? minimumWidthMm : -minimumWidthMm)
          )
        );
      }
      emit(
        Math.min(moving, drag.fixedOffsetMm),
        Math.abs(moving - drag.fixedOffsetMm),
        "resize"
      );
    },
    [emit, opening.widthMm, pointerOffsetMm, wallLengthMm]
  );

  const finish = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      releasePointer(event);
      dragRef.current = null;
      onDragStateChange?.(false, drag.mode);
    },
    [onDragStateChange]
  );

  return { beginMove, beginResize, move, finish };
}
