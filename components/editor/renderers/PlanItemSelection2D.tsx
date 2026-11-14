"use client";

import { Html } from "@react-three/drei/web/Html";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef, type CSSProperties } from "react";
import type { Group, Mesh } from "three";
import { useCanvasPalette } from "@/lib/canvas-colours";
import { planRotateCursor } from "@/lib/plan-cursors";
import { planMetresForPixels, usePlanHandleSizes, type PlanHandleSizes } from "@/lib/plan-handle-sizes";
import { PLAN_HTML_PASS_THROUGH } from "@/lib/plan-html-overlay";

/** Labels and handles stay above the plan's own overlays. */
export const PLAN_ITEM_HTML_Z_INDEX: [number, number] = [5, 0];
const CORNER = 0.04;

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
    document.body.style.cursor = on ? planRotateCursor() : "";
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

/** Smallest sizes in metres, so the knob keeps its shape when zoomed right in. */
const KNOB_MIN_M = { hit: 0.1, mark: 0.06, offset: 0.18, stalk: 0.006 } as const;
/**
 * The knob's grab circle sits this far above the plan, like a layout block's resize handles, so it
 * wins over a neighbour's pick volume; the plan camera looks straight down, so it doesn't move on screen.
 */
const KNOB_GRAB_LIFT_M = 3;

/**
 * Places the knob for this zoom: a fixed size on screen (lib/plan-handle-sizes.ts: 24px with a
 * mouse, 44px on touch), far enough off the item's edge to clear the edge's own grab area.
 */
function placeKnob(depth: number, zoom: number, sizes: PlanHandleSizes, parts: { stalk: Mesh; knob: Group; mark: Mesh; hit: Mesh }) {
  const offset = planMetresForPixels(sizes.knobOffset, zoom, KNOB_MIN_M.offset);
  parts.knob.position.z = -depth / 2 - offset;
  parts.mark.scale.setScalar(planMetresForPixels(sizes.knobMark, zoom, KNOB_MIN_M.mark));
  parts.hit.scale.setScalar(planMetresForPixels(sizes.knobHit, zoom, KNOB_MIN_M.hit));
  parts.stalk.position.z = -depth / 2 - offset / 2;
  parts.stalk.scale.set(planMetresForPixels(2, zoom, KNOB_MIN_M.stalk), offset, 1);
}

/** The angle readout, lifted clear of the knob by the knob's own size on screen. */
function RotationHud({ label, liftPx }: { label: string; liftPx: number }) {
  return (
    <Html zIndexRange={PLAN_ITEM_HTML_Z_INDEX} position={[0, 0.01, 0]} center transform={false} style={PLAN_HTML_PASS_THROUGH}>
      <div data-testid="rotation-hud" style={{ ...ROTATION_HUD_STYLE, transform: `translateY(-${liftPx}px)` }}>
        {label}
      </div>
    </Html>
  );
}

/**
 * The stalk and knob above a selected item that turn it, with the angle shown while turning: a
 * separate knob outside the item, as in Canva and Planner 5D (14 Nov 2026), sized for the pointer.
 */
export function PlanItemRotateHandle2D({ depth, markY, hudLabel, onPointerDown, onPointerMove, onPointerUp }: RotateHandleProps) {
  const { colour } = useCanvasPalette();
  const turnHandlers = useRotateCursor(onPointerDown, onPointerUp);
  const sizes = usePlanHandleSizes();
  const stalk = useRef<Mesh>(null);
  const knob = useRef<Group>(null);
  const mark = useRef<Mesh>(null);
  const hit = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (stalk.current && knob.current && mark.current && hit.current) {
      placeKnob(depth, camera.zoom, sizes, { stalk: stalk.current, knob: knob.current, mark: mark.current, hit: hit.current });
    }
  });
  return (
    <>
      <mesh ref={stalk} rotation-x={-Math.PI / 2} position={[0, markY, -depth / 2 - KNOB_MIN_M.offset / 2]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={colour("#2a66ff")} />
      </mesh>
      <group ref={knob} position={[0, 0, -depth / 2 - KNOB_MIN_M.offset]}>
        <mesh ref={mark} rotation-x={-Math.PI / 2} position={[0, markY + 0.0003, 0]}>
          <circleGeometry args={[0.5, 24]} />
          <meshBasicMaterial color={colour("#2a66ff")} />
        </mesh>
        <mesh ref={hit} name="plan-item-rotate-knob" rotation-x={-Math.PI / 2} position={[0, KNOB_GRAB_LIFT_M, 0]} onPointerMove={onPointerMove} {...turnHandlers}>
          <circleGeometry args={[0.5, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {hudLabel ? <RotationHud label={hudLabel} liftPx={sizes.knobHit / 2 + 14} /> : null}
      </group>
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
      <Html zIndexRange={PLAN_ITEM_HTML_Z_INDEX} position={[0, 0.01, depth / 2 + 0.12]} center transform={false} style={PLAN_HTML_PASS_THROUGH}>
        <div style={style}>{widthLabel}</div>
      </Html>
      <Html zIndexRange={PLAN_ITEM_HTML_Z_INDEX} position={[width / 2 + 0.12, 0.01, 0]} center transform={false} style={PLAN_HTML_PASS_THROUGH}>
        <div style={style}>{depthLabel}</div>
      </Html>
    </>
  );
}
