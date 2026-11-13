"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { useCanvasPalette } from "@/lib/canvas-colours";
import {
  isCornerResizeHandle,
  LAYOUT_BLOCK_RESIZE_HANDLES,
  type LayoutBlockFootprint,
  type LayoutBlockResizeHandle,
} from "@/lib/layout-block-resize";
import { planMetresForPixels, usePlanHandleSizes, type PlanHandleSizes } from "@/lib/plan-handle-sizes";
import { useLayoutBlockResizeDrag, type LayoutBlockResizeDragInput } from "./useLayoutBlockResizeDrag";

type Props = LayoutBlockResizeDragInput & {
  /** The footprint drawn now (the preview while dragging), in metres. */
  footprint: LayoutBlockFootprint;
  markY: number;
};

/** Smallest sizes in metres, so the handles keep their shape when zoomed right in. */
const CORNER_HIT_M = 0.12;
const CORNER_MARK_M = 0.05;
const EDGE_HIT_M = 0.08;
const EDGE_MARK_M = [0.08, 0.03] as const;
/**
 * The grab areas sit this far above the block, over any item's own pick volume (a chair's is its full
 * height), so a selected block's handles win where it touches a neighbour. The plan camera looks
 * straight down, so the height does not move them on screen.
 */
const GRAB_LIFT_M = 3;

/**
 * A handle's grab area and mark, sized each frame for the zoom (lib/plan-handle-sizes.ts: 24px with a
 * mouse, 44px on touch); the edge's grab area runs between the corners.
 */
function sizeHandle(handle: LayoutBlockResizeHandle, footprint: LayoutBlockFootprint, zoom: number, sizes: PlanHandleSizes, hit: Mesh, mark: Mesh) {
  const cornerHit = planMetresForPixels(sizes.cornerHit, zoom, CORNER_HIT_M);
  if (isCornerResizeHandle(handle)) {
    const markSize = planMetresForPixels(sizes.cornerMark, zoom, CORNER_MARK_M);
    hit.scale.set(cornerHit, cornerHit, 1);
    mark.scale.set(markSize, markSize, 1);
    return;
  }
  const alongX = handle.sx === 0;
  const length = (alongX ? footprint.width : footprint.depth) - cornerHit;
  const thickness = planMetresForPixels(sizes.edgeHit, zoom, EDGE_HIT_M);
  const markLong = planMetresForPixels(sizes.edgeMark[0], zoom, EDGE_MARK_M[0]);
  const markShort = planMetresForPixels(sizes.edgeMark[1], zoom, EDGE_MARK_M[1]);
  hit.visible = length > 0;
  mark.visible = length > 0;
  hit.scale.set(alongX ? Math.max(length, 1e-3) : thickness, alongX ? thickness : Math.max(length, 1e-3), 1);
  mark.scale.set(alongX ? markLong : markShort, alongX ? markShort : markLong, 1);
}

function ResizeHandle({
  handle,
  footprint,
  colour,
  sizes,
  handlers,
}: {
  handle: LayoutBlockResizeHandle;
  footprint: LayoutBlockFootprint;
  colour: string;
  sizes: PlanHandleSizes;
  handlers: ReturnType<ReturnType<typeof useLayoutBlockResizeDrag>>;
}) {
  const hit = useRef<Mesh>(null);
  const mark = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (hit.current && mark.current) sizeHandle(handle, footprint, camera.zoom, sizes, hit.current, mark.current);
  });
  const key = `${handle.sx}:${handle.sz}`;
  return (
    <group position={[(handle.sx * footprint.width) / 2, 0, (handle.sz * footprint.depth) / 2]}>
      <mesh ref={mark} rotation-x={-Math.PI / 2} position={[0, 0.0003, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={colour} />
      </mesh>
      <mesh ref={hit} rotation-x={-Math.PI / 2} position={[0, GRAB_LIFT_M, 0]} name={`layout-block-resize-${key}`} {...handlers}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * The corners and edges of a selected layout block on the plan, each draggable to resize it
 * (J, 13 Nov 2026): a square at each corner and a short bar at the middle of each side, and the
 * whole side can be grabbed. The drag only previews; letting go asks to commit.
 */
export default function LayoutBlockResizeHandles2D({ footprint, markY, ...drag }: Props) {
  const { colour } = useCanvasPalette();
  const handlers = useLayoutBlockResizeDrag(drag);
  const sizes = usePlanHandleSizes();
  return (
    <group position={[0, markY, 0]}>
      {LAYOUT_BLOCK_RESIZE_HANDLES.map((handle) => (
        <ResizeHandle key={`${handle.sx}:${handle.sz}`} handle={handle} footprint={footprint} colour={colour("#2a66ff")} sizes={sizes} handlers={handlers(handle)} />
      ))}
    </group>
  );
}
