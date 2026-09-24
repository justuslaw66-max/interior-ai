"use client";

import { Html } from "@react-three/drei/web/Html";
import type { CanonicalFloorPlanWallRenderModel } from "@/lib/floor-plan-render-model";
import type { CanonicalWallGestureControls } from "@/lib/floor-plan-wall-gesture";
import { useCanonicalWallDrag } from "./wallDrag";

export function CanonicalWallGestureOverlay({ wall, floorId, revisionId, controls }: {
  wall: CanonicalFloorPlanWallRenderModel; floorId: string; revisionId: string; controls: CanonicalWallGestureControls;
}) {
  const { previewRef, begin, move, finish, cancel, nudge } = useCanonicalWallDrag({ wall, floorId, revisionId, controls });
  const start = wall.centerlineSegments[0]?.start, end = wall.centerlineSegments.at(-1)?.end;
  if (!controls.enabled || wall.path.kind !== "line" || !start || !end) return null;
  const center = { xMm: (start.xMm + end.xMm) / 2, zMm: (start.zMm + end.zMm) / 2 };
  return <group>
    <mesh ref={previewRef} visible={false} raycast={() => null}>
      <boxGeometry args={[1, 0.012, Math.max(0.04, wall.thicknessMm / 1000)]} />
      <meshBasicMaterial color="#2563eb" transparent opacity={0.6} depthTest={false} />
    </mesh>
    {([["start", start, "Start endpoint", "A"], ["wall", center, "Wall centre", "↔"], ["end", end, "End endpoint", "B"]] as const).map(([mode, point, label, glyph]) => (
      <Html key={mode} center position={[point.xMm / 1000, 0.16, point.zMm / 1000]} zIndexRange={[25, 0]}>
        <button type="button" data-testid={`canonical-wall-drag-${mode}`} aria-label={`Drag ${label.toLowerCase()}`} title={`${label}: drag, or use arrow keys for 10 mm (Shift: 100 mm). Escape cancels a drag.`}
          className="flex h-7 w-7 touch-none items-center justify-center rounded-full border-2 border-blue-600 bg-white text-xs font-bold text-blue-700 shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          onPointerDownCapture={(event) => begin(mode, event)} onPointerMoveCapture={move} onPointerUpCapture={finish}
          onPointerCancelCapture={(event) => { event.stopPropagation(); cancel(); }} onLostPointerCapture={cancel}
          onKeyDown={(event) => { if (nudge(mode, event.key, event.shiftKey)) { event.preventDefault(); event.stopPropagation(); } }}>
          {glyph}
        </button>
      </Html>
    ))}
  </group>;
}
