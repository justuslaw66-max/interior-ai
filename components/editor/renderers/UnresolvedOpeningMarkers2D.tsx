import { Html } from "@react-three/drei/web/Html";
import { Line } from "@react-three/drei/core/Line";
import type { Opening2D } from "./room-renderer-2d-opening-geometry";

export function UnresolvedOpeningMarkers2D({
  openings,
  onSelect,
  showOpenings,
  canonicalStructureExpected,
}: {
  openings: readonly Opening2D[];
  onSelect?: (id: string | null) => void;
  showOpenings: boolean;
  canonicalStructureExpected: boolean;
}) {
  if (!showOpenings || canonicalStructureExpected) return null;
  return openings.flatMap((opening) => {
    const point = opening.hostWorldCenter;
    if (!point) return [];
    return (
      <group
        key={`${opening.id}:unresolved`}
        position={[point.x, 0.008, point.z]}
        onClick={(event) => { event.stopPropagation(); onSelect?.(opening.id); }}
        userData={{
          testId: "unresolved-opening-marker-2d",
          openingId: opening.id,
          hostStatus: opening.hostResolution?.status,
        }}
      >
        <mesh rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.16, 24]} />
          <meshBasicMaterial color="#fff7ed" transparent opacity={0.98} />
        </mesh>
        <Line points={[[-0.1, 0.003, -0.1], [0.1, 0.003, 0.1]]} color="#dc2626" lineWidth={4} />
        <Line points={[[-0.1, 0.003, 0.1], [0.1, 0.003, -0.1]]} color="#dc2626" lineWidth={4} />
        <Html zIndexRange={[12, 0]} position={[0, 0.08, 0.28]} center transform={false} style={{ pointerEvents: "auto" }}>
          <button
            type="button"
            data-testid="unresolved-opening-label-2d"
            data-opening-id={opening.id}
            data-host-status={opening.hostResolution?.status}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(opening.id);
            }}
            style={{
            background: "rgba(255,255,255,0.96)", border: "1px solid rgba(220,38,38,0.45)",
            borderRadius: 6, color: "#991b1b", fontSize: 10, fontWeight: 800,
            padding: "4px 6px", whiteSpace: "nowrap", cursor: "pointer",
          }}>
            Opening needs wall repair
          </button>
        </Html>
      </group>
    );
  });
}
