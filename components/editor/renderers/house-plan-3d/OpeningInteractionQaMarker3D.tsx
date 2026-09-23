import { Html } from "@react-three/drei/web/Html";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function Marker({ testId }: { testId: string }) {
  return (
    <Html center style={{ pointerEvents: "none" }} zIndexRange={[1, 0]}>
      <span aria-hidden="true" data-testid={testId}
        style={{ display: "block", height: 2, opacity: 0, width: 2 }} />
    </Html>
  );
}

function OpeningInteractionMarkers({ openingId, floorWorldY }: {
  openingId: string;
  floorWorldY: number;
}) {
  const { camera } = useThree();
  const dragPlaneRef = useRef<THREE.Group | null>(null);
  const anchorWorld = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const intersection = useRef(new THREE.Vector3());
  useFrame(() => {
    const marker = dragPlaneRef.current;
    const parent = marker?.parent;
    if (!marker || !parent) return;
    parent.localToWorld(anchorWorld.current.set(0, 0, 0));
    direction.current.copy(anchorWorld.current).sub(camera.position);
    if (Math.abs(direction.current.y) < 1e-6) return;
    const scale = (floorWorldY - camera.position.y) / direction.current.y;
    intersection.current.copy(camera.position).addScaledVector(direction.current, scale);
    parent.worldToLocal(intersection.current);
    marker.position.copy(intersection.current);
  });
  return (
    <>
      <Marker testId={`qa-opening-anchor-3d-${openingId}`} />
      <group ref={dragPlaneRef}>
        <Marker testId={`qa-opening-drag-plane-3d-${openingId}`} />
        <group position={[0.3, 0, 0]}>
          <Marker testId={`qa-opening-tangent-3d-${openingId}`} />
        </group>
        <group position={[0, 0, 0.3]}>
          <Marker testId={`qa-opening-normal-3d-${openingId}`} />
        </group>
      </group>
    </>
  );
}

export function OpeningInteractionQaMarker3D(props: {
  openingId: string;
  floorWorldY: number;
}) {
  return process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1"
    ? <OpeningInteractionMarkers {...props} /> : null;
}
