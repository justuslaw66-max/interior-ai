"use client";

import * as THREE from "three";
import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import { useMemo } from "react";

export type ZoneOutlineBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
};

export function ZoneOutline({
  bounds,
  label,
  selected,
  highlighted = false,
  dimmed = false,
  helperLabel,
  onSelect,
}: {
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
  };
  label: string;
  selected: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  helperLabel?: string;
  onSelect: () => void;
}) {
  const points = useMemo(() => {
    const y = 0.02;
    return [
      new THREE.Vector3(bounds.minX, y, bounds.minZ),
      new THREE.Vector3(bounds.maxX, y, bounds.minZ),
      new THREE.Vector3(bounds.maxX, y, bounds.maxZ),
      new THREE.Vector3(bounds.minX, y, bounds.maxZ),
      new THREE.Vector3(bounds.minX, y, bounds.minZ),
    ];
  }, [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ]);

  return (
    <group>
      {highlighted && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[bounds.centerX, 0.018, bounds.centerZ]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]} />
          <meshBasicMaterial
            color="#22c55e"
            transparent
            opacity={0.16}
            depthWrite={false}
          />
        </mesh>
      )}
      <Line
        points={points}
        dashed
        dashSize={0.2}
        gapSize={0.12}
        color={selected || highlighted ? "#22c55e" : "#7a8aa0"}
        opacity={selected || highlighted ? 0.95 : dimmed ? 0.22 : 0.5}
        lineWidth={highlighted ? 3 : selected ? 2.5 : 1.5}
        transparent
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {(selected || highlighted) && (
        <Html position={[bounds.centerX, 0.05, bounds.centerZ]}>
          <div
            data-testid={highlighted ? "compatible-zone-label" : "selected-zone-label"}
            style={{
              background: highlighted ? "rgba(22, 101, 52, 0.92)" : "rgba(20, 24, 32, 0.85)",
              color: "#ffffff",
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {helperLabel ?? label}
          </div>
        </Html>
      )}
    </group>
  );
}
