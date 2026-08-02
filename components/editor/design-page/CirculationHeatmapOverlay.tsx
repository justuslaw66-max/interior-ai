import type { CirculationHeatCell } from "@/lib/circulation-analysis";

export interface CirculationHeatmapOverlayProps {
  cells: CirculationHeatCell[];
  roomOffset: { x: number; z: number };
}

export function CirculationHeatmapOverlay({
  cells,
  roomOffset,
}: CirculationHeatmapOverlayProps) {
  return (
    <group userData={{ testId: "circulation-heatmap" }} position={[roomOffset.x, 0.075, roomOffset.z]}>
      {cells.map((cell) => {
        const color =
          cell.level === "blocked"
            ? "#ef4444"
            : cell.level === "tight"
              ? "#f97316"
              : "#facc15";
        const opacity =
          cell.level === "blocked" ? 0.24 : cell.level === "tight" ? 0.18 : 0.12;
        return (
          <mesh
            key={`${cell.x.toFixed(2)}:${cell.z.toFixed(2)}:${cell.level}`}
            position={[cell.x, 0, cell.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.42, 0.42]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
