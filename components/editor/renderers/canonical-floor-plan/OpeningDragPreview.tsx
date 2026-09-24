import type { RefObject } from "react";
import type { Mesh } from "three";

export function OpeningDragPreview({ meshRef, y = 0.03, height = 0.018, depth = 0.07 }: {
  meshRef: RefObject<Mesh | null>; y?: number; height?: number; depth?: number;
}) {
  return <mesh ref={meshRef} visible={false} position={[0, y, 0]} raycast={() => null}>
    <boxGeometry args={[1, height, depth]} />
    <meshBasicMaterial color="#f97316" transparent opacity={0.55} depthTest={false} />
  </mesh>;
}
