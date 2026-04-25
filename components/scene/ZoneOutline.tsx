"use client";

import * as THREE from "three";
import { Html, Line } from "@react-three/drei";
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
      <Line
        points={points}
        dashed
        dashSize={0.2}
        gapSize={0.12}
        color={selected ? "#5ec91f" : "#7a8aa0"}
        opacity={selected ? 0.9 : 0.5}
        transparent
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {selected && (
        <Html position={[bounds.centerX, 0.05, bounds.centerZ]}>
          <div
            style={{
              background: "rgba(20, 24, 32, 0.85)",
              color: "#ffffff",
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

