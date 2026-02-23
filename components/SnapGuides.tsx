import { useMemo } from "react";
import { Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { Guide } from "@/lib/snapGuides";

interface SnapGuidesProps {
  guides: Guide[];
  visible?: boolean;
  isDesigner?: boolean;
}

function GuideLabel({ position, text, offset }: { position: [number, number, number]; text: string; offset: number }) {
  return (
    <Html
      position={position}
      center
      transform={false}
      occlude={false}
      style={{
        pointerEvents: "none",
        fontSize: "12px",
        fontWeight: 700,
        padding: "4px 8px",
        borderRadius: "999px",
        background: "rgba(0, 0, 0, 0.8)",
        color: "#ffffff",
        whiteSpace: "nowrap",
        lineHeight: 1,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        letterSpacing: "0.3px",
        transform: `translateY(${offset}px)`,
      }}
    >
      {text}
    </Html>
  );
}

/**
 * Three.js visualization component for snap guides
 * Shows alignment guides during furniture drag operations
 * - Only renders guides that should be visible
 * - Staggered labels to prevent overlap
 */
export function SnapGuides({ guides, visible = true, isDesigner = true }: SnapGuidesProps) {
  if (!visible || !guides || guides.length === 0) {
    return null;
  }

  // Filter to only guides with visible lines
  const visibleGuides = guides.filter((g) => g.showLine);
  if (!visibleGuides.length) {
    return null;
  }

  const colors = {
    center: 0x4ade80, // green
    edge: 0x60a5fa, // blue
  };

  return (
    <>
      {visibleGuides.map((guide, idx) => {
        // Separate guides into line and label groups
        const lineColor = colors[guide.kind];
        const lineWidth = guide.snapped ? 2.5 : 1.5; // Thicker when snapped
        const lineOpacity = guide.snapped ? 1.0 : 0.4; // Faint when just near

        // Compute midpoint of guide line
        const midX = (guide.from[0] + guide.to[0]) / 2;
        const midZ = (guide.from[2] + guide.to[2]) / 2;
        const midY = 0.05; // Above floor
        const midPoint: [number, number, number] = [midX, midY, midZ];

        // Stagger label offsets to prevent overlap (first: -12px, second: +12px)
        const labelOffset = idx === 0 ? -12 : 12;

        return (
          <group key={`guide-${idx}`}>
            {/* Snap guide line */}
            <Line
              points={[guide.from, guide.to]}
              color={lineColor}
              lineWidth={lineWidth}
              dashed={false}
              transparent={!guide.snapped}
              opacity={lineOpacity}
            />

            {/* Endpoint indicator dot (only show when snapped) */}
            {guide.snapped && (
              <mesh position={guide.to}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color={lineColor} />
              </mesh>
            )}

            {/* Label (only show when snapped) */}
            {guide.showLabel && (
              <GuideLabel position={midPoint} text={guide.label} offset={labelOffset} />
            )}
          </group>
        );
      })}
    </>
  );
}
