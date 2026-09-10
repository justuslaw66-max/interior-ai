import { DoubleSide } from "three";

type GeneratedWindowFrame3DProps = {
  widthMeters: number;
  heightMeters: number;
  wallDepthMeters: number;
  opacity?: number;
  selected?: boolean;
};

type WindowFrameRail = {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
};

function getWindowFrameRails(
  width: number,
  height: number,
  depth: number,
  frameThickness: number,
  innerWidth: number
): WindowFrameRail[] {
  return [
    {
      key: "left",
      position: [-(width - frameThickness) / 2, 0, 0],
      size: [frameThickness, height, depth],
    },
    {
      key: "right",
      position: [(width - frameThickness) / 2, 0, 0],
      size: [frameThickness, height, depth],
    },
    {
      key: "top",
      position: [0, (height - frameThickness) / 2, 0],
      size: [innerWidth, frameThickness, depth],
    },
    {
      key: "bottom",
      position: [0, -(height - frameThickness) / 2, 0],
      size: [innerWidth, frameThickness, depth],
    },
  ];
}

function WindowFrameRailMesh({
  rail,
  color,
  opacity,
}: {
  rail: WindowFrameRail;
  color: string;
  opacity: number;
}) {
  return (
    <mesh
      position={rail.position}
      castShadow
      raycast={() => null}
      userData={{ testId: "generated-window-frame-rail-3d", rail: rail.key }}
    >
      <boxGeometry args={rail.size} />
      <meshStandardMaterial
        color={color}
        metalness={0.12}
        roughness={0.5}
        transparent={opacity < 0.999}
        opacity={opacity}
      />
    </mesh>
  );
}

export function GeneratedWindowFrame3D({
  widthMeters,
  heightMeters,
  wallDepthMeters,
  opacity = 1,
  selected = false,
}: GeneratedWindowFrame3DProps) {
  const width = Math.max(0.08, widthMeters);
  const height = Math.max(0.08, heightMeters);
  const depth = Math.max(0.025, wallDepthMeters * 0.72);
  const frameThickness = Math.min(0.08, Math.max(0.035, Math.min(width, height) * 0.055));
  const innerWidth = Math.max(0.01, width - frameThickness * 2);
  const innerHeight = Math.max(0.01, height - frameThickness * 2);
  const frameColor = selected ? "#2563eb" : "#e5e7eb";
  const rails = getWindowFrameRails(width, height, depth, frameThickness, innerWidth);

  return (
    <group userData={{ testId: "generated-window-frame-3d" }}>
      {rails.map((rail) => (
        <WindowFrameRailMesh
          key={rail.key}
          rail={rail}
          color={frameColor}
          opacity={opacity}
        />
      ))}
      {width >= 1.1 ? (
        <mesh castShadow raycast={() => null} userData={{ testId: "generated-window-mullion-3d" }}>
          <boxGeometry args={[frameThickness * 0.7, innerHeight, depth * 0.9]} />
          <meshStandardMaterial
            color={frameColor}
            metalness={0.12}
            roughness={0.5}
            transparent={opacity < 0.999}
            opacity={opacity}
          />
        </mesh>
      ) : null}
      <mesh raycast={() => null} userData={{ testId: "generated-window-glass-3d" }}>
        <boxGeometry args={[innerWidth, innerHeight, Math.min(0.018, depth * 0.35)]} />
        <meshPhysicalMaterial
          color="#9ddcf4"
          transparent
          opacity={Math.min(0.42, opacity * 0.34)}
          roughness={0.08}
          transmission={0}
          thickness={0.01}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
