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
import { useLayoutBlockResizeDrag, type LayoutBlockResizeDragInput } from "./useLayoutBlockResizeDrag";

type Props = LayoutBlockResizeDragInput & {
  /** The footprint drawn now (the preview while dragging), in metres. */
  footprint: LayoutBlockFootprint;
  markY: number;
};

/**
 * Sizes on screen, in CSS pixels, so the handles can be grabbed at any zoom; in metres they never go
 * below the sizes beside them (the plan's orthographic camera zoom is pixels per metre).
 */
const CORNER_HIT = { px: 16, m: 0.12 };
const CORNER_MARK = { px: 8, m: 0.05 };
const EDGE_HIT = { px: 12, m: 0.08 };
const EDGE_MARK = { px: [14, 5], m: [0.08, 0.03] } as const;
/**
 * The grab areas sit this far above the block, over any item's own pick volume (a chair's is its full
 * height), so a selected block's handles win where it touches a neighbour. The plan camera looks
 * straight down, so the height does not move them on screen.
 */
const GRAB_LIFT_M = 3;
const atLeast = (minimumM: number, px: number, zoom: number) => Math.max(minimumM, px / Math.max(zoom, 1e-6));

/** A handle's grab area and mark, sized each frame for the zoom; the edge's grab area runs between the corners. */
function sizeHandle(handle: LayoutBlockResizeHandle, footprint: LayoutBlockFootprint, zoom: number, hit: Mesh, mark: Mesh) {
  if (isCornerResizeHandle(handle)) {
    const hitSize = atLeast(CORNER_HIT.m, CORNER_HIT.px, zoom);
    const markSize = atLeast(CORNER_MARK.m, CORNER_MARK.px, zoom);
    hit.scale.set(hitSize, hitSize, 1);
    mark.scale.set(markSize, markSize, 1);
    return;
  }
  const alongX = handle.sx === 0;
  const length = (alongX ? footprint.width : footprint.depth) - atLeast(CORNER_HIT.m, CORNER_HIT.px, zoom);
  const thickness = atLeast(EDGE_HIT.m, EDGE_HIT.px, zoom);
  const markLong = atLeast(EDGE_MARK.m[0], EDGE_MARK.px[0], zoom);
  const markShort = atLeast(EDGE_MARK.m[1], EDGE_MARK.px[1], zoom);
  hit.visible = length > 0;
  mark.visible = length > 0;
  hit.scale.set(alongX ? Math.max(length, 1e-3) : thickness, alongX ? thickness : Math.max(length, 1e-3), 1);
  mark.scale.set(alongX ? markLong : markShort, alongX ? markShort : markLong, 1);
}

function ResizeHandle({
  handle,
  footprint,
  colour,
  handlers,
}: {
  handle: LayoutBlockResizeHandle;
  footprint: LayoutBlockFootprint;
  colour: string;
  handlers: ReturnType<ReturnType<typeof useLayoutBlockResizeDrag>>;
}) {
  const hit = useRef<Mesh>(null);
  const mark = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (hit.current && mark.current) sizeHandle(handle, footprint, camera.zoom, hit.current, mark.current);
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
  return (
    <group position={[0, markY, 0]}>
      {LAYOUT_BLOCK_RESIZE_HANDLES.map((handle) => (
        <ResizeHandle key={`${handle.sx}:${handle.sz}`} handle={handle} footprint={footprint} colour={colour("#2a66ff")} handlers={handlers(handle)} />
      ))}
    </group>
  );
}
