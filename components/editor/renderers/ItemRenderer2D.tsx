"use client";

import { Html, Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";

type ItemRenderer2DProps = {
  width: number;
  depth: number;
  color: string;
  category: string;
  selected: boolean;
  dragging: boolean;
  snapped: boolean;
  invalidPlacement: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  label: string;
  measurementUnit?: "mm" | "cm" | "in";
  rotationHudLabel?: string | null;
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
  dragging,
  snapped,
  invalidPlacement,
  showLabels,
  showDimensions,
  label,
  measurementUnit = "mm",
  rotationHudLabel = null,
  onRotateHandlePointerDown,
  onRotateHandlePointerMove,
  onRotateHandlePointerUp,
}: ItemRenderer2DProps) {
  const htmlZIndexRange: [number, number] = [5, 0];

  const borderColor = invalidPlacement
    ? "#d91f1f"
    : selected
      ? "#2a66ff"
      : snapped && dragging
        ? "#4ea81f"
        : "#5f6770";

  const fillColor = invalidPlacement ? "#f8b6b6" : color;

  const corner = 0.04;
  const formatDimension = (meters: number) => {
    const millimeters = meters * 1000;
    if (measurementUnit === "cm") {
      const value = (millimeters / 10).toFixed(1).replace(/\.0$/, "");
      return `${value} cm`;
    }
    if (measurementUnit === "in") {
      const value = (millimeters / 25.4).toFixed(1).replace(/\.0$/, "");
      return `${value} in`;
    }
    return `${Math.round(millimeters)} mm`;
  };
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
        <meshBasicMaterial color={fillColor} transparent opacity={selected ? 0.7 : 0.5} />
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
        lineWidth={selected ? 2.4 : 1.4}
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
            data-testid="rotation-handle-hit-area"
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

      {showLabels && (selected || !dragging) && (
        <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, 0]} center transform={false}>
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
