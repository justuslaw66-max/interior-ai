"use client";

import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import type { ThreeEvent } from "@react-three/fiber";
import { useRef, type CSSProperties } from "react";
import { useCanvasPalette } from "@/lib/canvas-colours";
import { PLAN_ROTATE_CURSOR } from "@/lib/plan-cursors";

/** Labels and handles stay above the plan's own overlays. */
export const PLAN_ITEM_HTML_Z_INDEX: [number, number] = [5, 0];
const CORNER = 0.04;
/** Labels next to an item never take the pointer, so the plan (and a block's resize edges) under them still can. */
const NO_POINTER: CSSProperties = { pointerEvents: "none" };

/** The four small corner squares of a selected item that cannot be resized. */
export function PlanItemCorners2D({ width, depth, markY }: { width: number; depth: number; markY: number }) {
  const { colour } = useCanvasPalette();
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  return (
    <>
      {corners.map(([sx, sz]) => (
        <mesh key={`${sx}:${sz}`} rotation-x={-Math.PI / 2} position={[(sx * width) / 2, markY, (sz * depth) / 2]}>
          <planeGeometry args={[CORNER, CORNER]} />
          <meshBasicMaterial color={colour("#2a66ff")} />
        </mesh>
      ))}
    </>
  );
}

type TurnHandler = ((e: ThreeEvent<PointerEvent>) => void) | undefined;

/** The rotate cursor while over the handle, and for the whole turn once it is pressed (lib/plan-cursors.ts). */
function useRotateCursor(onPointerDown: TurnHandler, onPointerUp: TurnHandler) {
  const turning = useRef(false);
  const show = (on: boolean) => {
    document.body.style.cursor = on ? PLAN_ROTATE_CURSOR : "";
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    turning.current = false;
    show(false);
    onPointerUp?.(e);
  };
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      show(true);
    },
    onPointerOut: () => {
      if (!turning.current) show(false);
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      turning.current = true;
      show(true);
      onPointerDown?.(e);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

type RotateHandleProps = {
  depth: number;
  markY: number;
  hudLabel: string | null;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
};

/** The stalk and circle above a selected item that turn it, with the angle shown while turning. */
export function PlanItemRotateHandle2D({ depth, markY, hudLabel, onPointerDown, onPointerMove, onPointerUp }: RotateHandleProps) {
  const { colour } = useCanvasPalette();
  const turnHandlers = useRotateCursor(onPointerDown, onPointerUp);
  return (
    <>
      <Line
        points={[
          [0, markY, -depth / 2],
          [0, markY, -depth / 2 - 0.16],
        ]}
        color={colour("#2a66ff")}
        lineWidth={1.8}
      />
      <mesh rotation-x={-Math.PI / 2} position={[0, markY + 0.0003, -depth / 2 - 0.18]}>
        <circleGeometry args={[0.03, 24]} />
        <meshBasicMaterial color={colour("#2a66ff")} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, markY + 0.0006, -depth / 2 - 0.18]}
        onPointerMove={onPointerMove}
        {...turnHandlers}
      >
        <circleGeometry args={[0.05, 24]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {hudLabel ? (
        <Html zIndexRange={PLAN_ITEM_HTML_Z_INDEX} position={[0, 0.01, -depth / 2 - 0.32]} center transform={false} style={NO_POINTER}>
          <div data-testid="rotation-hud" style={ROTATION_HUD_STYLE}>
            {hudLabel}
          </div>
        </Html>
      ) : null}
    </>
  );
}

const ROTATION_HUD_STYLE: CSSProperties = {
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 999,
  background: "rgba(20,28,45,0.92)",
  border: "1px solid rgba(120,140,190,0.55)",
  color: "#f9fafb",
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

/** The width under a selected item and the depth to its right, in the plan's unit. */
export function PlanItemDimensionLabels2D({
  width,
  depth,
  widthLabel,
  depthLabel,
}: {
  width: number;
  depth: number;
  widthLabel: string;
  depthLabel: string;
}) {
  const { colour } = useCanvasPalette();
  const style: CSSProperties = {
    fontSize: 12,
    padding: "2px 6px",
    borderRadius: 6,
    background: colour("rgba(255,255,255,0.92)"),
    border: colour("1px solid rgba(120,120,120,0.35)"),
    color: colour("#111827"),
    whiteSpace: "nowrap",
    pointerEvents: "none",
  };
  return (
    <>
      <Html zIndexRange={PLAN_ITEM_HTML_Z_INDEX} position={[0, 0.01, depth / 2 + 0.12]} center transform={false} style={NO_POINTER}>
        <div style={style}>{widthLabel}</div>
      </Html>
      <Html zIndexRange={PLAN_ITEM_HTML_Z_INDEX} position={[width / 2 + 0.12, 0.01, 0]} center transform={false} style={NO_POINTER}>
        <div style={style}>{depthLabel}</div>
      </Html>
    </>
  );
}
