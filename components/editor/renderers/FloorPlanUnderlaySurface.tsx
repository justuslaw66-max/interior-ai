"use client";

import { useMemo } from "react";
import { DoubleSide, Matrix4, type Texture, type Vector3 } from "three";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import { underlayPlanBasis } from "@/lib/floor-plan-underlay-geometry";

export default function FloorPlanUnderlaySurface({ underlay, texture, picking, onPoint, onPreview, onLeave }: {
  underlay: FloorPlanUnderlay; texture: Texture; picking: boolean;
  onPoint: (point: Vector3) => void; onPreview: (point: Vector3) => void; onLeave: () => void;
}) {
  const { position, rotationDeg, skewX, flipY } = underlay;
  const matrix = useMemo(() => {
    const { a, b, c, d } = underlayPlanBasis({ rotationDeg, skewX, flipY });
    return new Matrix4().set(a, 0, c, position.x, 0, 1, 0, 0.001, b, 0, d, position.z, 0, 0, 0, 1);
  }, [position.x, position.z, rotationDeg, skewX, flipY]);
  return <group matrix={matrix} matrixAutoUpdate={false}>
    <mesh rotation-x={-Math.PI / 2} renderOrder={-10}
      onClick={(event) => { if (picking) { event.stopPropagation(); onPoint(event.point); } }}
      onPointerMove={(event) => { if (picking) onPreview(event.point); }} onPointerOut={onLeave}>
      <planeGeometry args={[underlay.widthMeters, underlay.depthMeters]} />
      <meshBasicMaterial map={texture} transparent opacity={underlay.opacity} depthWrite={false} toneMapped={false} side={DoubleSide} />
    </mesh>
    {picking && <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}
      onClick={(event) => { event.stopPropagation(); onPoint(event.point); }}
      onPointerMove={(event) => { event.stopPropagation(); onPreview(event.point); }} onPointerOut={onLeave}>
      <planeGeometry args={[underlay.widthMeters, underlay.depthMeters]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
    </mesh>}
  </group>;
}
