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
            // A cell's walk spot is its own (inside the cell), so it keys the cell; a shaped room's cell paints within it.
            key={`${cell.x.toFixed(4)}:${cell.z.toFixed(4)}:${cell.level}`}
            position={[cell.paint?.x ?? cell.x, 0, cell.paint?.z ?? cell.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[cell.paint?.w ?? 0.42, cell.paint?.d ?? 0.42]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
