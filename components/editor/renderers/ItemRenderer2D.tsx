"use client";

import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import type { ThreeEvent } from "@react-three/fiber";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatDisplayLength } from "@/lib/display-units";

type ItemRenderer2DProps = {
  width: number;
  depth: number;
  color: string;
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

function roundedCategory(category: string) {
  return category === "coffee_table" || category === "side_table" || category === "dining_table";
}

export default function ItemRenderer2D({
  width,
  depth,
  color,
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

  const borderColor = invalidPlacement
    ? "#d91f1f"
    : selected
      ? "#2a66ff"
      : hovered
        ? "#0f766e"
      : snapped && dragging
        ? "#4ea81f"
        : "#5f6770";

  const fillColor = invalidPlacement ? "#f8b6b6" : color;

  const corner = 0.04;
  const formatDimension = (meters: number) =>
    formatDisplayLength(meters * 1000, measurementUnit);
  const cornerPoints: Array<[number, number, number]> = [
    [-width / 2, 0.003, -depth / 2],
    [width / 2, 0.003, -depth / 2],
    [width / 2, 0.003, depth / 2],
    [-width / 2, 0.003, depth / 2],
  ];

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color={fillColor} transparent opacity={selected ? 0.7 : hovered ? 0.62 : 0.5} />
      </mesh>

      <Line
        points={[
          [-width / 2, 0.002, -depth / 2],
          [width / 2, 0.002, -depth / 2],
          [width / 2, 0.002, depth / 2],
          [-width / 2, 0.002, depth / 2],
          [-width / 2, 0.002, -depth / 2],
        ]}
        color={borderColor}
        lineWidth={selected ? 2.4 : hovered ? 2 : 1.4}
      />

      {category === "sofa" && (
        <Line
          points={[
            [-width / 2 + 0.02, 0.0025, -depth / 2 + 0.03],
            [width / 2 - 0.02, 0.0025, -depth / 2 + 0.03],
          ]}
          color="#38424c"
          lineWidth={1.8}
        />
      )}

      {category === "chair" && (
        <Line
          points={[
            [-width / 2 + 0.03, 0.0025, -depth / 2 + 0.03],
            [width / 2 - 0.03, 0.0025, -depth / 2 + 0.03],
          ]}
          color="#38424c"
          lineWidth={1.4}
        />
      )}

      {category === "bed" && (
        <>
          <Line
            points={[
              [-width / 2 + 0.03, 0.0025, -depth / 2 + 0.08],
              [width / 2 - 0.03, 0.0025, -depth / 2 + 0.08],
            ]}
            color="#38424c"
            lineWidth={1.8}
          />
          <Line
            points={[
              [0, 0.0025, -depth / 2 + 0.08],
              [0, 0.0025, depth / 2 - 0.03],
            ]}
            color="#38424c"
            lineWidth={1.2}
          />
        </>
      )}

      {(category === "dining_table" || category === "desk") && (
        <Line
          points={[
            [-width / 2 + 0.03, 0.0025, 0],
            [width / 2 - 0.03, 0.0025, 0],
          ]}
          color="#38424c"
          lineWidth={1.2}
        />
      )}

      {(category === "storage" || category === "bookshelf" || category === "cabinet") && (
        <>
          <Line
            points={[
              [-width / 6, 0.0025, -depth / 2 + 0.03],
              [-width / 6, 0.0025, depth / 2 - 0.03],
            ]}
            color="#38424c"
            lineWidth={1.1}
          />
          <Line
            points={[
              [width / 6, 0.0025, -depth / 2 + 0.03],
              [width / 6, 0.0025, depth / 2 - 0.03],
            ]}
            color="#38424c"
            lineWidth={1.1}
          />
        </>
      )}

      {(category === "coffee_table" || category === "side_table") && roundedCategory(category) && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.0022, 0]}>
          <circleGeometry args={[Math.max(0.08, Math.min(width, depth) * 0.3), 28]} />
          <meshBasicMaterial color="#6b4f31" transparent opacity={0.28} />
        </mesh>
      )}

      {selected &&
        cornerPoints.map((p, idx) => (
          <mesh key={idx} rotation-x={-Math.PI / 2} position={p}>
            <planeGeometry args={[corner, corner]} />
            <meshBasicMaterial color="#2a66ff" />
          </mesh>
        ))}

      {selected && (
        <>
          <Line
            points={[
              [0, 0.002, -depth / 2],
              [0, 0.002, -depth / 2 - 0.16],
            ]}
            color="#2a66ff"
            lineWidth={1.8}
          />
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.0023, -depth / 2 - 0.18]}>
            <circleGeometry args={[0.03, 24]} />
            <meshBasicMaterial color="#2a66ff" />
          </mesh>
          <mesh
            rotation-x={-Math.PI / 2}
            position={[0, 0.0026, -depth / 2 - 0.18]}
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
                  fontSize: 11,
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
              aria-label={`Select ${label} in 2D plan`}
              aria-pressed={selected}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(event.shiftKey);
              }}
              style={{
                appearance: "none",
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.9)",
                border: selected
                  ? "1px solid rgba(37,99,235,0.62)"
                  : "1px solid rgba(120,120,120,0.35)",
                color: "#1f2937",
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
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(120,120,120,0.35)",
                color: "#1f2937",
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
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(120,120,120,0.35)",
                color: "#111827",
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
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(120,120,120,0.35)",
                color: "#111827",
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
