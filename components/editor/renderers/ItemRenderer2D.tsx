"use client";

import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import type { ThreeEvent } from "@react-three/fiber";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatDisplayLength } from "@/lib/display-units";
import { useCanvasPalette } from "@/lib/canvas-colours";
import { PLAN_SYMBOL_BASE_Y, PLAN_SYMBOL_OVERLAY_Y } from "@/lib/plan-symbols/plan-symbol-item";
import PlanSymbol2D from "./PlanSymbol2D";

type ItemRenderer2DProps = {
  width: number;
  depth: number;
  category: string;
  selected: boolean;
  hovered?: boolean;
  dragging: boolean;
  snapped: boolean;
  invalidPlacement: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  label: string;
  measurementUnit?: PlanMeasurementUnit;
  rotationHudLabel?: string | null;
  interactive?: boolean;
  onSelect?: (additive: boolean) => void;
  onRotateHandlePointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onRotateHandlePointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onRotateHandlePointerUp?: (e: ThreeEvent<PointerEvent>) => void;
};

export default function ItemRenderer2D({
  width,
  depth,
  category,
  selected,
  hovered = false,
  dragging,
  snapped,
  invalidPlacement,
  showLabels,
  showDimensions,
  label,
  measurementUnit = "mm",
  rotationHudLabel = null,
  interactive = false,
  onSelect,
  onRotateHandlePointerDown,
  onRotateHandlePointerMove,
  onRotateHandlePointerUp,
}: ItemRenderer2DProps) {
  const htmlZIndexRange: [number, number] = [5, 0];
  const { colour } = useCanvasPalette();
  const borderColor = invalidPlacement
    ? colour("#d91f1f")
    : selected
      ? colour("#2a66ff")
      : hovered
        ? colour("#0f766e")
        : colour("#4ea81f");

  // The symbol is the item's outline; a coloured border shows only what is happening to it.
  const showBorder = selected || hovered || invalidPlacement || (snapped && dragging);
  const markY = PLAN_SYMBOL_OVERLAY_Y;
  const corner = 0.04;
  const formatDimension = (meters: number) =>
    formatDisplayLength(meters * 1000, measurementUnit);
  const cornerPoints: Array<[number, number, number]> = [
    [-width / 2, markY, -depth / 2],
    [width / 2, markY, -depth / 2],
    [width / 2, markY, depth / 2],
    [-width / 2, markY, depth / 2],
  ];

  return (
    <group>
      {/* The pick target: the whole footprint, drawn invisibly under the symbol. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, PLAN_SYMBOL_BASE_Y, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <PlanSymbol2D category={category} label={label} width={width} depth={depth} />

      {invalidPlacement && (
        <mesh rotation-x={-Math.PI / 2} position={[0, markY, 0]}>
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial color={colour("#f8b6b6")} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}

      {showBorder && (
        <Line
          points={[
            [-width / 2, markY, -depth / 2],
            [width / 2, markY, -depth / 2],
            [width / 2, markY, depth / 2],
            [-width / 2, markY, depth / 2],
            [-width / 2, markY, -depth / 2],
          ]}
          color={borderColor}
          lineWidth={selected ? 2.4 : 2}
        />
      )}

      {selected &&
        cornerPoints.map((p, idx) => (
          <mesh key={idx} rotation-x={-Math.PI / 2} position={p}>
            <planeGeometry args={[corner, corner]} />
            <meshBasicMaterial color={colour("#2a66ff")} />
          </mesh>
        ))}

      {selected && (
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
            onPointerDown={onRotateHandlePointerDown}
            onPointerMove={onRotateHandlePointerMove}
            onPointerUp={onRotateHandlePointerUp}
            onPointerCancel={onRotateHandlePointerUp}
          >
            <circleGeometry args={[0.05, 24]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          {rotationHudLabel ? (
            <Html
              zIndexRange={htmlZIndexRange}
              position={[0, 0.01, -depth / 2 - 0.32]}
              center
              transform={false}
            >
              <div
                data-testid="rotation-hud"
                style={{
                  fontSize: 12,
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: "rgba(20,28,45,0.92)",
                  border: "1px solid rgba(120,140,190,0.55)",
                  color: "#f9fafb",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {rotationHudLabel}
              </div>
            </Html>
          ) : null}
        </>
      )}

      {showLabels && (selected || hovered || !dragging) && (
        <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, 0]} center transform={false}>
          {interactive && onSelect ? (
            <button
              type="button"
              data-testid="plan-item-keyboard-target"
              aria-label={`Select ${label} in 2D`}
              aria-pressed={selected}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(event.shiftKey);
              }}
              style={{
                appearance: "none",
                fontSize: 12,
                padding: "2px 6px",
                borderRadius: 6,
                background: colour("rgba(255,255,255,0.9)"),
                border: colour(selected ? "1px solid rgba(37,99,235,0.62)" : "1px solid rgba(120,120,120,0.35)"),
                color: colour("#1f2937"),
                cursor: "pointer",
                whiteSpace: "nowrap",
                pointerEvents: "auto",
              }}
            >
              {label}
            </button>
          ) : (
            <div
              style={{
                fontSize: 12,
                padding: "2px 6px",
                borderRadius: 6,
                background: colour("rgba(255,255,255,0.9)"),
                border: colour("1px solid rgba(120,120,120,0.35)"),
                color: colour("#1f2937"),
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {label}
            </div>
          )}
        </Html>
      )}

      {showDimensions && selected && (
        <>
          <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, depth / 2 + 0.12]} center transform={false}>
            <div
              style={{
                fontSize: 12,
                padding: "2px 6px",
                borderRadius: 6,
                background: colour("rgba(255,255,255,0.92)"),
                border: colour("1px solid rgba(120,120,120,0.35)"),
                color: colour("#111827"),
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
                {formatDimension(width)}
            </div>
          </Html>
          <Html zIndexRange={htmlZIndexRange} position={[width / 2 + 0.12, 0.01, 0]} center transform={false}>
            <div
              style={{
                fontSize: 12,
                padding: "2px 6px",
                borderRadius: 6,
                background: colour("rgba(255,255,255,0.92)"),
                border: colour("1px solid rgba(120,120,120,0.35)"),
                color: colour("#111827"),
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
                {formatDimension(depth)}
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
