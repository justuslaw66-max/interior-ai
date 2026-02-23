"use client";

export function RoomSkeleton() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial />
      </mesh>

      <mesh position={[0, 0.35, -1]}>
        <boxGeometry args={[2.2, 0.7, 0.9]} />
        <meshStandardMaterial />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -0.5]}>
        <planeGeometry args={[2.0, 1.6]} />
        <meshStandardMaterial />
      </mesh>
    </group>
  );
}
