"use client";

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

const CORNER_HIT = 0.12;
const CORNER_MARK = 0.05;
const EDGE_HIT = 0.08;
type Size = [number, number];
const EDGE_MARK: Size = [0.08, 0.03];
type HandleShape = { position: [number, number, number]; mark: Size; hit: Size };

/** The handle's spot, its visible mark and its (larger, invisible) grab area; null for an edge too short to grab. */
function handleShape(handle: LayoutBlockResizeHandle, width: number, depth: number): HandleShape | null {
  const position: [number, number, number] = [(handle.sx * width) / 2, 0, (handle.sz * depth) / 2];
  if (isCornerResizeHandle(handle)) {
    return { position, mark: [CORNER_MARK, CORNER_MARK], hit: [CORNER_HIT, CORNER_HIT] };
  }
  const alongX = handle.sx === 0;
  const length = (alongX ? width : depth) - CORNER_HIT;
  if (length <= 0) return null;
  return alongX
    ? { position, mark: EDGE_MARK, hit: [length, EDGE_HIT] }
    : { position, mark: [EDGE_MARK[1], EDGE_MARK[0]], hit: [EDGE_HIT, length] };
}

/**
 * The corners and edges of a selected layout block on the plan, each draggable to resize it
 * (J, 13 Nov 2026): a square at each corner and a short bar at the middle of each side, and the
 * whole side can be grabbed. The drag only previews; letting go asks to commit.
 */
export default function LayoutBlockResizeHandles2D({ footprint, markY, ...drag }: Props) {
  const { colour } = useCanvasPalette();
  const handlers = useLayoutBlockResizeDrag(drag);
  const blue = colour("#2a66ff");
  return (
    <group position={[0, markY, 0]}>
      {LAYOUT_BLOCK_RESIZE_HANDLES.map((handle) => {
        const shape = handleShape(handle, footprint.width, footprint.depth);
        if (!shape) return null;
        const key = `${handle.sx}:${handle.sz}`;
        return (
          <group key={key} position={shape.position}>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.0003, 0]}>
              <planeGeometry args={shape.mark} />
              <meshBasicMaterial color={blue} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.0006, 0]} name={`layout-block-resize-${key}`} {...handlers(handle)}>
              <planeGeometry args={shape.hit} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
